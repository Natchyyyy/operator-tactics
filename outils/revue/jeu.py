#!/usr/bin/env python3
# Revue d'animation EN JEU : lance une vraie bataille (web/index.html, mode manuel, sans rendu WebGL pendant l'échantillonnage)
# et mesure, image par image, chaque soldat avec outils/revue/metriques.js (les mêmes mesures que le banc).
#   python3 outils/revue/jeu.py [--carte parking] [--graine 3] [--pas 900] [--k 3] [--sortie captures/revue/jeu_X] [--preuves 6]
# --pas : pas de simulation (0,1 s) ; --k : images par pas (3 = 30 i/s). Produit :
#   jeu.json  (répartition des états / allures / vitesses, mesures par catégorie, pires images)
#   jeu.md    (résumé lisible) ; preuves/*.png (gros plans rendus des pires images, 2e passe déterministe)
# Math.random est remplacé par un générateur à graine (2e passe identique à la 1re).
import asyncio, argparse, json, os, sys, time, datetime, base64
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rubrique
from verrou import verrou
from playwright.async_api import async_playwright
RACINE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if os.path.isdir('/opt/pw-browsers'): os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')   # (conteneur Linux seulement ; ailleurs : chemin par défaut de Playwright)
GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]
INIT = "(() => { let s = 123456789; Math.random = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })();"

# Échantillonneur injecté dans la page : remplace le rendu (RENDU.render) — appelé à chaque image APRÈS l'animation.
ECH = r"""
window.ECH = { bandeN: 10, bande: null, img: 0, cat: {}, seg: {}, fin: [], pires: [], actif: true, garde: 1.0, alarmes: [], vus: {}, maxAlarmes: 0 };
(() => {
  const E = window.ECH, R = API.rendu(), DT = 0.1;
  const catOf = (u, m) => {
    if (!u.alive) return null;
    const a = m.anim, v = Math.hypot(m.cur.x - m.prev.x, m.cur.z - m.prev.z) / DT, epaule = !!(u.target || u.state === 'engage' || u.state === 'overwatch' || u.state === 'capture');
    // (même règle que animateSkinned : à l'arrêt, « preaim » joue la garde basse — seule l'épaule compte ; en mouvement, preaim = fusil épaulé.
    // Sans cela, des soldats en garde basse étaient jugés comme en visée : faux « tête à 25° du canon », « œil 23 cm au-dessus ».)
    const vise = epaule || (!!u.preaim && v > 0.15 && u.moving);
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
      // bande de profil de la petite course (vérification visuelle systématique) : 1er soldat en jog_bas_avant depuis > 1 s,
      // une vue de côté toutes les 2 images, 10 vues
      // (ou, avec --suivre NOM --de I --a J, ce soldat-là entre les images I et J)
      const SV = E.suivre;
      if (SV ? (u.callsign === SV.cs && E.img >= SV.de && E.img <= SV.a && (!E.bande || E.img - E.bande.der >= SV.pas)) :
        (E.bandeN > 0 && k.c === 'jog_bas_avant' && E.img - s2.i0 > 30 && (!E.bande || E.bande.u === u.id) && (!E.bande || E.bande.imgs.length < E.bandeN) && (!E.bande || E.img - E.bande.der >= 2))) {
        if (!E.bande) E.bande = { u: u.id, cs: u.callsign, imgs: [], der: 0 };
        E.bande.der = E.img; const g = m.group.position, yaw = Math.atan2(Math.sin(m.yaw), -Math.cos(m.yaw));
        E.actif = false; E.dessin = true; const rendre = E.isoler(u); try { API.look(g.x, g.z, yaw, 0.12, E.suivre ? 2.0 : 2.6, E.suivre ? 0.8 : 0.75); E.bande.imgs.push([E.img, cv().toDataURL('image/jpeg', 0.85), +mm.genouSensG.toFixed(0), +mm.genouSensD.toFixed(0)]);
          if (E.suivre) { API.look(g.x, g.z, Math.PI / 2 - m.yaw, 0.12, 2.0, 0.8); E.bande.imgs.push([E.img + 0.5, cv().toDataURL('image/jpeg', 0.85), +mm.genouSensG.toFixed(0), +mm.genouSensD.toFixed(0)]); } } finally { E.actif = true; E.dessin = false; rendre(); }
      }
      // alarmes instantanées (seuils « majeur » de la rubrique) : gros plan rendu TOUT DE SUITE (pas de 2e passe)
      if (E.alarmes.length < E.maxAlarmes) for (const [id, t] of E.TESTS) { let x; try { x = t(mm, k); } catch (e) { x = null; } if (x === null || x === false || x === undefined) continue;
        const cle = k.c + '|' + id; if (E.vus[cle]) continue; E.vus[cle] = 1; E.capturer(u, m, { id, cat: k.c, val: +(+x).toFixed(3), img: E.img, cs: u.callsign }); break; }
    }
  };
  // bilan d'un segment (≥ 0,6 s) : mêmes champs que le banc → notable par rubrique.py
  E.bilans = () => {
    const out = []; const tous = E.fin.concat(Object.values(E.seg));
    for (const S of tous) {
      // (les 0,4 premières secondes d'un segment sont la transition depuis l'état précédent — ex. la tête vise avant que le fusil
      // ne soit monté : elles sont jugées par les à-coups, pas par les critères de posture)
      if (S.suivi.fr.length < 30) continue;
      const SU = new REVUE.Suivi(); SU.fr = S.suivi.fr.slice(12); const F = SU.fr;
      const b = SU.bilan();
      const images = F.map(m => { const o = {}; for (const k in m) if (typeof m[k] === 'number' || typeof m[k] === 'string') o[k] = typeof m[k] === 'number' ? +m[k].toFixed(4) : m[k]; o.t = m.img; return o; });
      out.push({ c: S.c, u: S.u, cs: S.cs, modele: S.modele, i0: S.i0, n: F.length, bilan: b, images });
    }
    return out;
  };
  const doigts = (mm) => Math.min(...['D', 'G'].flatMap(s => ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'].map(d => mm['doigt' + s + d])).filter(v => typeof v === 'number'));
  // [id, test] : renvoie la valeur fautive ou null
  E.TESTS = [
    ['pied_dans_sol', (mm) => { const v = Math.min(mm.solMinG, mm.solMinD); return v < -0.05 ? v : null; }],
    ['tibias_se_touchent', (mm) => mm.tibias < -0.035 ? mm.tibias : null],
    ['doigts_dans_arme', (mm, k) => !/recharge|lancer/.test(k.c) && doigts(mm) < -0.012 ? doigts(mm) : null],
    ['poignets', (mm, k) => !/lancer/.test(k.c) && Math.max(mm.poignetD || 0, mm.poignetG || 0) > 72 ? Math.max(mm.poignetD, mm.poignetG) : null],
    ['erreur_visee', (mm, k) => k.vise && !/recharge|lancer/.test(k.c) && mm.erreurVisee > 9 ? mm.erreurVisee : null],
    ['tete_vs_canon', (mm, k) => k.vise && !/recharge|lancer/.test(k.c) && Math.abs(mm.teteVsCanon) > 22 ? mm.teteVsCanon : null],
    ['garde_basse_direction', (mm, k) => !k.vise && k.v > 0.3 && !/recharge|lancer/.test(k.c) && Math.abs(mm.canonVsDep) > 50 ? mm.canonVsDep : null],
    ['bouche_sur_soi', (mm, k) => !/lancer/.test(k.c) && mm.boucheSurSoi < 0 ? mm.boucheSurSoi : null],
    ['arme_dans_corps', (mm) => mm.armeTronc < -0.045 ? mm.armeTronc : null],
    ['torsion', (mm) => Math.abs(mm.torsion) > 62 ? mm.torsion : null],
    ['genou_envers', (mm) => Math.max(mm.genouSensG || 0, mm.genouSensD || 0) > 100 ? Math.max(mm.genouSensG, mm.genouSensD) : null],
  ];
  // canvas du rendu 3D = le plus grand de la page (il y en a d'autres : titre, icônes…)
  // gros plans : on cache le décor (voitures, murs) qui masque souvent le soldat ; seuls restent les soldats
  E.isoler = (u) => { const sc = API.scene(), M = API.meshes(), garde = new Set(Object.values(M).map(m => m.group)), cach = [];
    // (on cache les MAILLAGES du décor, pas les groupes entiers : un groupe peut contenir les lumières — gros plans tout noirs sinon)
    for (const o of sc.children) if (!garde.has(o)) o.traverse(x => { if ((x.isMesh || x.isPoints || x.isSprite || x.isLine) && x.visible) { x.visible = false; cach.push(x); } });
    for (const id in M) if (id !== u.id && M[id].group.visible) { M[id].group.visible = false; cach.push(M[id].group); }
    return () => cach.forEach(o => { o.visible = true; }); };
  const cv = () => Array.from(document.querySelectorAll('canvas')).sort((a, b) => b.width * b.height - a.width * a.height)[0];
  E.capturer = (u, m, info) => {
    const g = m.group.position, vues = [['face', Math.PI / 2 - m.yaw], ['cote', Math.atan2(Math.sin(m.yaw), -Math.cos(m.yaw))]];
    info.images = [];
    E.actif = false; E.dessin = true; const rendre = E.isoler(u);
    try { for (const [nom, yaw] of vues) { API.look(g.x, g.z, yaw, 0.22, 2.2, 0.9); const c = cv(); info.images.push([nom, c.toDataURL('image/jpeg', 0.85)]); } }
    finally { E.actif = true; E.dessin = false; rendre(); }
    E.alarmes.push(info);
  };
  E.orig = R.render; E.dessin = false;
  R.render = () => { if (E.actif) E.echant(); if (E.dessin) E.orig.call(R); };
})();
"""

async def main(a):
    out = os.path.join(RACINE, a.sortie or os.path.join('captures', 'revue', datetime.datetime.now().strftime('jeu_%m%d_%H%M'))); os.makedirs(out, exist_ok=True)
    url = f"http://127.0.0.1:8765/web/index.html?manual=1&mode=free&hd=0&fx=0"
    async def ouvrir(p, taille):
        br = await p.chromium.launch(args=GL); pg = await br.new_page(viewport={'width': taille[0], 'height': taille[1]})   # (la taille du canvas = celle des gros plans)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(INIT)
        with verrou('chargement du jeu'):
            await pg.goto(url, timeout=240000)
            await pg.wait_for_function('window.PRET && OT.Modeles3D.ready && OT.Soldat3D.ready', timeout=600000)
            await pg.add_script_tag(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'metriques.js'))
            await pg.evaluate(f"API.start({{mapId: {json.dumps(a.carte)}, seed: {a.graine}, conditions: 'jour'}})")
            await pg.evaluate(ECH)
            await pg.evaluate(f'ECH.maxAlarmes = {a.alarmes}')
            if a.suivre: await pg.evaluate(f"ECH.suivre = {{cs: {json.dumps(a.suivre)}, de: {a.de}, a: {a.a}, pas: {a.tous}}}")
        return br, pg
    errs = []
    async with async_playwright() as p:
        br, pg = await ouvrir(p, (520, 520))
        t0 = time.time(); fini = False; i = 0
        # blocs courts sous le verrou partagé (les autres agents passent entre deux blocs)
        while i < a.pas and not fini:
            n = min(a.bloc, a.pas - i)
            with verrou(): r = await pg.evaluate(f"(() => {{ for (let j = 0; j < {n}; j++) {{ if (API.battle().over) return 'fin'; API.stepFine({a.k}); }} return API.battle().t; }})()")
            i += n; fini = r == 'fin'
        print(f'simulation : {i} pas, {time.time() - t0:.0f} s' + (' (bataille finie)' if fini else ''), flush=True)
        with verrou(): cat = await pg.evaluate('ECH.cat'); seg = await pg.evaluate('ECH.bilans()'); alarmes = await pg.evaluate('ECH.alarmes'); bande = await pg.evaluate('ECH.bande')
        await br.close()
    # notation par segment (rubrique du banc ; on associe la catégorie à l'état du banc le plus proche)
    MAP = {'patrouille_avant': 'patrouille', 'marche_visee_avant': 'marche_visee', 'marche_visee_diag': 'marche_visee_diagG', 'marche_visee_lateral': 'pas_chasse_G', 'marche_visee_diagArr': 'recul_diagD', 'marche_visee_recul': 'recul_vise',
           'jog_bas_avant': 'jog_bas', 'jog_vise_avant': 'jog_vise', 'sprint': 'sprint', 'accroupi': 'accroupi', 'marche_accroupie': 'marche_accroupie', 'repos_visee': 'repos_visee', 'repos_garde_basse': 'repos_garde_basse',
           'recharge_arret': 'recharge_arret', 'recharge_marche': 'recharge_marche', 'patrouille_diag': 'virage_patrouille', 'patrouille_lateral': 'virage_patrouille',
           # (catégories latérales / diagonales / arrière : jugées comme telles, pas comme une course avant — sinon angle_pied par
           # rapport au déplacement donne de faux « pieds à 150° »)
           'jog_vise_diag': 'jog_vise_diagG', 'jog_vise_lateral': 'jog_vise_lateralD', 'jog_vise_recul': 'jog_vise_recul', 'jog_vise_diagArr': 'jog_vise_recul',
           'jog_bas_diag': 'jeu_jog_bas_oblique', 'jog_bas_lateral': 'jeu_jog_bas_oblique', 'jog_bas_diagArr': 'jeu_jog_bas_oblique', 'jog_bas_recul': 'jeu_jog_bas_oblique',
           'patrouille_diagArr': 'virage_patrouille', 'patrouille_recul': 'virage_patrouille'}
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
    # gros plans pris pendant la simulation (alarmes instantanées)
    if alarmes:
        os.makedirs(os.path.join(out, 'alarmes'), exist_ok=True)
        L += ['', '## Alarmes instantanées (gros plans pris sur l\'image même, pendant la bataille)', '']
        for al in alarmes:
            fs = []
            for nom, url in al.pop('images', []):
                f = os.path.join(out, 'alarmes', f"{al['img']:05d}_{al['cs']}_{al['id']}_{nom}.jpg"); open(f, 'wb').write(base64.b64decode(url.split(',', 1)[1])); fs.append(os.path.relpath(f, RACINE))
            al['fichiers'] = fs
            L.append(f"- {al['cat']} `{al['id']}` {al['cs']} image {al['img']} : {al['val']} → " + ', '.join(f'`{x}`' for x in fs))
    # bande de profil de la petite course : assemblée en une planche (PIL), valeur du sens des genoux sous chaque image
    if bande and bande.get('imgs'):
        from PIL import Image, ImageDraw
        import io
        ims = [(i, Image.open(io.BytesIO(base64.b64decode(u.split(',', 1)[1]))).convert('RGB'), g, d) for i, u, g, d in bande['imgs']]
        w, h = ims[0][1].size; c = 260 / h; tw, th = int(w * c), 260
        pl = Image.new('RGB', (tw * len(ims), th + 18), (20, 24, 28)); dr = ImageDraw.Draw(pl)
        for j, (i, im, g, d) in enumerate(ims):
            pl.paste(im.resize((tw, th)), (j * tw, 0)); dr.text((j * tw + 4, th + 3), f"img {i}  genoux G {g} D {d}", fill=(255, 80, 80) if max(g, d) > 100 else (220, 220, 220))
        fb = os.path.join(out, 'bande_trot_profil.jpg'); pl.save(fb, quality=88)
        L += ['', f"## Bande de profil ({bande['cs']}) : `{os.path.relpath(fb, RACINE)}`", '']
    def ecrire():
        open(os.path.join(out, 'jeu.md'), 'w').write('\n'.join(L))
        json.dump({'series': [{'cs': g['cs'], 'c': g['c'], 'modele': g['modele'], 'img': [i['t'] for i in g['images']], **{k: [i.get(k) for i in g['images']] for k in ('genouSensG', 'genouSensD', 'genouG', 'genouD', 'solMinG', 'solMinD', 'v', 'clip', 'erreurVisee', 'canonVsDep', 'poignetD', 'poignetG', 'teteVsCanon', 'teteAz', 'canonAz', 'bassinAz', 'teteTangage', 'canonTangage', 'torsion', 'piedAzG', 'piedAzD', 'epaulesAz', 'plantaireG', 'plantaireD', 'orteilDevG', 'orteilDevD', 'botteG', 'botteD')}} for g in seg], 'categories': cat, 'alarmes': alarmes, 'verdicts': [{k: v[k] for k in v if k not in ('quand',)} for v in verd]}, open(os.path.join(out, 'jeu.json'), 'w'), default=str)
    ecrire(); print(os.path.join(out, 'jeu.md'), flush=True)
    # preuves : 2e passe déterministe (même graine), on s'arrête à l'image du pire cas et on rend un gros plan
    choix = []
    if a.preuves:
        from revue import instant
        segs = {(s['cs'], s['i0']): s for s in seg}
        for v in sorted([v for v in verd if v['niveau'] == 'majeur'], key=lambda v: -min(v['ecart'], 50)):
            if any(c['categorie'] == v['categorie'] and c['id'] == v['id'] for c in choix): continue
            S = segs.get((v['cs'], v['img0']))
            if not S: continue
            v['img'] = int(instant({'bilan': S['bilan'], 'images': S['images']}, v)); choix.append(v)
            if len(choix) >= a.preuves: break
        choix.sort(key=lambda v: v['img'])
        if choix:
            async with async_playwright() as p:
                br, pg = await ouvrir(p, (560, 560))
                os.makedirs(os.path.join(out, 'preuves'), exist_ok=True)
                for v in choix:
                    while True:
                        with verrou(): r = await pg.evaluate(f"(() => {{ for (let j = 0; j < {a.bloc} && ECH.img < {v['img']} && !API.battle().over; j++) API.stepFine({a.k}); return ECH.img >= {v['img']} || API.battle().over; }})()")
                        if r: break
                    for nom, yaw in (('face', 'Math.PI / 2 - m.yaw'), ('cote', 'Math.atan2(Math.sin(m.yaw), -Math.cos(m.yaw))')):
                        with verrou(): await pg.evaluate(f"(() => {{ const u = API.battle().units.find(x => x.callsign === {json.dumps(v['cs'])}), m = API.meshes()[u.id]; ECH.dessin = true; ECH.actif = false; const g = m.group.position; API.look(g.x, g.z, {yaw}, 0.25, 3.2, 0.9); ECH.actif = true; ECH.dessin = false; return 0; }})()")
                        f = os.path.join(out, 'preuves', f"{v['img']:05d}_{v['cs']}_{v['id']}_{nom}.png")
                        with verrou(): await pg.screenshot(path=f, timeout=400000)
                        v.setdefault('preuves', []).append(f)
                    print('preuve', v['categorie'], v['id'], v['cs'], v['img'], flush=True)
                await br.close()
        L += ['', '## Preuves rendues (2e passe, même graine)', '']
        for v in choix: L.append(f"- {v['categorie']} `{v['id']}` {v['cs']} image {v['img']} : {v['valeur']:.3g} (attendu {v['ok']}) → " + ', '.join(f'`{x}`' for x in v.get('preuves', [])))
        ecrire()
    if errs: print('erreurs de page :', errs[:5])

ap = argparse.ArgumentParser(); ap.add_argument('--carte', default='parking'); ap.add_argument('--graine', type=int, default=3); ap.add_argument('--pas', type=int, default=900)
ap.add_argument('--k', type=int, default=3); ap.add_argument('--bloc', type=int, default=60); ap.add_argument('--alarmes', type=int, default=10); ap.add_argument('--suivre'); ap.add_argument('--de', type=int, default=0); ap.add_argument('--a', type=int, default=99999); ap.add_argument('--tous', type=int, default=1); ap.add_argument('--sortie'); ap.add_argument('--preuves', type=int, default=0)
asyncio.run(main(ap.parse_args()))
