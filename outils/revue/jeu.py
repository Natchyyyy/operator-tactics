#!/usr/bin/env python3
# Revue d'animation EN JEU : lance une vraie bataille (dist/index.html, mode manuel, sans rendu WebGL pendant l'échantillonnage)
# et mesure, image par image, chaque soldat avec outils/revue/metriques.js (les mêmes mesures que le banc).
#   python3 outils/revue/jeu.py [--carte parking] [--graine 3] [--pas 900] [--k 3] [--sortie captures/revue/jeu_X] [--preuves 6]
# --pas : pas de simulation (0,1 s) ; --k : images par pas (3 = 30 i/s). Produit :
#   jeu.json  (répartition des états / allures / vitesses, mesures par catégorie, pires images)
#   jeu.md    (résumé lisible) ; preuves/*.png (gros plans rendus des pires images, 2e passe déterministe)
# Math.random est remplacé par un générateur à graine (2e passe identique à la 1re).
import asyncio, argparse, json, os, sys, time, datetime, base64
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rubrique
from playwright.async_api import async_playwright
RACINE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]
INIT = "(() => { let s = 123456789; Math.random = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })();"

# Échantillonneur injecté dans la page : remplace le rendu (RENDU.render) — appelé à chaque image APRÈS l'animation.
ECH = r"""
window.ECH = { img: 0, cat: {}, seg: {}, fin: [], pires: [], actif: true, garde: 1.0 };
(() => {
  const E = window.ECH, R = API.rendu(), DT = 0.1;
  const catOf = (u, m) => {
    if (!u.alive) return null;
    const a = m.anim, v = Math.hypot(m.cur.x - m.prev.x, m.cur.z - m.prev.z) / DT, vise = !!(u.target || u.state === 'engage' || u.state === 'overwatch' || u.state === 'capture' || u.preaim);
    const accr = u.stance === 'crouch', rech = u.reloading > 0;
    let ec = 0; if (v > 0.15 && Math.hypot(a.vx || 0, a.vz || 0) > 0.1) { ec = (-Math.atan2(a.vz, a.vx) + Math.PI / 2) - m.yaw; while (ec > Math.PI) ec -= 2 * Math.PI; while (ec < -Math.PI) ec += 2 * Math.PI; }
    const deg = Math.abs(ec * 180 / Math.PI), sect = deg < 30 ? 'avant' : deg < 70 ? 'diag' : deg < 115 ? 'lateral' : deg < 150 ? 'diagArr' : 'recul';
    let c;
    if (u.throwing) c = 'lancer'; else if (rech) c = (u.moving && v > 0.15) ? 'recharge_marche' : 'recharge_arret';
    else if (!u.moving || v <= 0.15) c = accr ? 'accroupi' : vise ? 'repos_visee' : 'repos_garde_basse';
    else if (accr) c = 'marche_accroupie';
    else if (v > 3.2) c = 'sprint';
    else if ((u.speed ? u.speed() : v) > 1.45 && v > 1.45) c = vise ? 'jog_vise_' + sect : 'jog_bas_' + sect;
    else c = vise ? 'marche_visee_' + sect : 'patrouille_' + sect;
    return { c, v, sect, deg, vise };
  };
  const hist = (o, k, x, pas) => { const b = Math.floor(x / pas) * pas; o[k] = o[k] || {}; o[k][b.toFixed(2)] = (o[k][b.toFixed(2)] || 0) + 1; };
  E.echant = () => {
    E.img++; const B = API.battle(), M = API.meshes();
    for (const u of B.units) {
      const m = M[u.id]; if (!m || !m.isSkinned) continue;
      const k = catOf(u, m); const S = E.seg[u.id];
      if (!k) { if (S) { E.fin.push(S); delete E.seg[u.id]; } continue; }
      const C = E.cat[k.c] || (E.cat[k.c] = { n: 0, vit: {}, clips: {}, etats: {} }); C.n++; hist(C, 'vit', k.v, 0.25); C.clips[m.clip] = (C.clips[m.clip] || 0) + 1; C.etats[u.state] = (C.etats[u.state] || 0) + 1;
      // segment = suite d'images d'un même soldat dans la même catégorie
      if (!S || S.c !== k.c) { if (S) E.fin.push(S); E.seg[u.id] = { c: k.c, u: u.id, cs: u.callsign, modele: m.modele, i0: E.img, suivi: new REVUE.Suivi(), v: [] }; }
      const s2 = E.seg[u.id];
      const tgt = u.target && u.target.alive ? ((M[u.target.id] && M[u.target.id].group.position) || u.target) : null;
      const cible = tgt ? new THREE.Vector3(tgt.x, 1.35, tgt.z) : null;
      const mm = REVUE.mesurer(m, { cible: k.vise ? cible : null, vel: new THREE.Vector3((m.cur.x - m.prev.x) / DT, 0, (m.cur.z - m.prev.z) / DT) });
      s2.suivi.ajouter(mm, 1 / 30, { img: E.img, clip: m.clip, v: +k.v.toFixed(2) });
    }
  };
  // bilan d'un segment (≥ 0,6 s) : mêmes champs que le banc → notable par rubrique.py
  E.bilans = () => {
    const out = []; const tous = E.fin.concat(Object.values(E.seg));
    for (const S of tous) {
      const F = S.suivi.fr; if (F.length < 18) continue;
      const b = S.suivi.bilan();
      const images = F.map(m => { const o = {}; for (const k in m) if (typeof m[k] === 'number' || typeof m[k] === 'string') o[k] = typeof m[k] === 'number' ? +m[k].toFixed(4) : m[k]; o.t = m.img; return o; });
      out.push({ c: S.c, u: S.u, cs: S.cs, modele: S.modele, i0: S.i0, n: F.length, bilan: b, images });
    }
    return out;
  };
  R.render = () => { if (E.actif) E.echant(); };
})();
"""

async def main(a):
    out = os.path.join(RACINE, a.sortie or os.path.join('captures', 'revue', datetime.datetime.now().strftime('jeu_%m%d_%H%M'))); os.makedirs(out, exist_ok=True)
    url = f"http://127.0.0.1:8765/web/index.html?manual=1&mode=free&hd=0&fx=0"
    async with async_playwright() as p:
        br = await p.chromium.launch(args=GL); pg = await br.new_page(viewport={'width': 480, 'height': 300}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(INIT)
        await pg.goto(url, timeout=240000)
        await pg.wait_for_function('window.PRET && OT.Modeles3D.ready && OT.Soldat3D.ready', timeout=600000)
        await pg.add_script_tag(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'metriques.js'))
        await pg.evaluate(f"API.start({{mapId: {json.dumps(a.carte)}, seed: {a.graine}, conditions: 'jour'}})")
        await pg.evaluate(ECH)
        t0 = time.time(); fini = False
        for i in range(0, a.pas, 50):
            r = await pg.evaluate(f"(() => {{ for (let j = 0; j < {min(50, a.pas - i)}; j++) {{ if (API.battle().over) return 'fin'; API.stepFine({a.k}); }} return API.battle().t; }})()")
            if r == 'fin': fini = True; break
        print(f'simulation : {i + 50} pas, {time.time() - t0:.0f} s' + (' (bataille finie)' if fini else ''), flush=True)
        cat = await pg.evaluate('ECH.cat'); seg = await pg.evaluate('ECH.bilans()')
        await br.close()
    # notation par segment (rubrique du banc ; on associe la catégorie à l'état du banc le plus proche)
    MAP = {'patrouille_avant': 'patrouille', 'marche_visee_avant': 'marche_visee', 'marche_visee_diag': 'marche_visee_diagG', 'marche_visee_lateral': 'pas_chasse_G', 'marche_visee_diagArr': 'recul_diagD', 'marche_visee_recul': 'recul_vise',
           'jog_bas_avant': 'jog_bas', 'jog_vise_avant': 'jog_vise', 'sprint': 'sprint', 'accroupi': 'accroupi', 'marche_accroupie': 'marche_accroupie', 'repos_visee': 'repos_visee', 'repos_garde_basse': 'repos_garde_basse',
           'recharge_arret': 'recharge_arret', 'recharge_marche': 'recharge_marche', 'patrouille_diag': 'virage_patrouille', 'patrouille_lateral': 'virage_patrouille'}
    verd = []
    for s in seg:
        e = MAP.get(s['c']) or ('marche_visee_diagG' if s['c'].startswith('marche_visee') else 'jog_vise' if s['c'].startswith('jog_vise') else 'jog_bas' if s['c'].startswith('jog_bas') else None)
        if not e: continue
        for v in rubrique.noter({'bilan': s['bilan'], 'images': s['images']}, e):
            v.update(categorie=s['c'], cs=s['cs'], modele=s['modele'], img0=s['i0'], n=s['n']); verd.append(v)
    # agrégat par (catégorie, critère) : part des segments non OK et pire valeur
    agg = {}
    for v in verd:
        g = agg.setdefault((v['categorie'], v['id']), {'n': 0, 'mineur': 0, 'majeur': 0, 'pire': None, 'lib': v['lib'], 'partie': v['partie'], 'ok': v['ok']})
        g['n'] += 1; g[v['niveau']] = g.get(v['niveau'], 0) + 1
        if v['niveau'] != 'OK' and (g['pire'] is None or min(v['ecart'], 50) > min(g['pire']['ecart'], 50)): g['pire'] = {k: v[k] for k in ('valeur', 'cs', 'img0', 'n', 'ecart', 'niveau')}
    tot = sum(c['n'] for c in cat.values()) or 1
    L = [f"# Revue en jeu — carte {a.carte}, graine {a.graine}, {a.pas} pas", '', '## Répartition des états (images × soldats)', '', '| catégorie | part | vitesses (m/s : images) | animations |', '|---|---|---|---|']
    for c, d in sorted(cat.items(), key=lambda kv: -kv[1]['n']):
        vs = ', '.join(f"{k}:{n}" for k, n in sorted(d['vit'].items(), key=lambda kv: float(kv[0])) if n >= 3)
        cl = ', '.join(f"{k}:{n}" for k, n in sorted(d['clips'].items(), key=lambda kv: -kv[1])[:3])
        L.append(f"| {c} | {100 * d['n'] / tot:.1f} % | {vs} | {cl} |")
    L += ['', '## Problèmes par catégorie (segments ≥ 0,6 s ; part des segments hors norme ; pire cas)', '']
    for (c, i), g in sorted(agg.items(), key=lambda kv: -(kv[1]['majeur'] * 3 + kv[1]['mineur']) / max(1, kv[1]['n']) * cat.get(kv[0][0], {'n': 1})['n']):
        if g['majeur'] + g['mineur'] == 0: continue
        p = g['pire']; L.append(f"- **{c}** `{i}` ({g['partie']}) : {g['majeur']} majeurs + {g['mineur']} mineurs / {g['n']} segments ; pire {p['valeur']:.3g} ({p['cs']}, image {p['img0']}, attendu {g['ok']}) — {g['lib']}")
    open(os.path.join(out, 'jeu.md'), 'w').write('\n'.join(L))
    json.dump({'categories': cat, 'verdicts': [{k: v[k] for k in v if k not in ('quand',)} for v in verd]}, open(os.path.join(out, 'jeu.json'), 'w'), default=str)
    print(os.path.join(out, 'jeu.md'))
    if errs: print('erreurs de page :', errs[:5])

ap = argparse.ArgumentParser(); ap.add_argument('--carte', default='parking'); ap.add_argument('--graine', type=int, default=3); ap.add_argument('--pas', type=int, default=900)
ap.add_argument('--k', type=int, default=3); ap.add_argument('--sortie'); ap.add_argument('--preuves', type=int, default=0)
asyncio.run(main(ap.parse_args()))
