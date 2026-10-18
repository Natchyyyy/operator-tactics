#!/usr/bin/env python3
# Revue d'animation (OPERATOR TACTICS) — pilote du banc outils/revue/banc.html et de l'échantillonnage en jeu.
#
#   python3 outils/revue/revue.py revue  [--modeles gign,soldat] [--etats a,b] [--preuves 14] [--sortie captures/revue/NOM]
#        mesure chaque état sur le banc (sans rendu), note avec la rubrique (rubrique.py), rend les planches de preuve des
#        pires problèmes, écrit rapport.md + rapport.json dans la sortie.
#   python3 outils/revue/revue.py planche --modele gign --etat patrouille [--vues face,profil,mainD] [--n 4] [--marques] [--taille 200x260] [--sortie fichier.png]
#   python3 outils/revue/revue.py comparer AVANT/rapport.json APRES/rapport.json      (tableau avant / après)
#   python3 outils/revue/revue.py etats                                                 (liste des états et des vues)
# Le serveur local doit tourner : python3 outils/serveur.py . 8765 (depuis la racine du projet).
import asyncio, argparse, json, os, sys, time, base64, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rubrique
from verrou import verrou
from playwright.async_api import async_playwright

RACINE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
URL = 'http://127.0.0.1:8765/outils/revue/banc.html'
GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')

async def page_banc(p):
    br = await p.chromium.launch(args=GL); pg = await br.new_page(viewport={'width': 400, 'height': 300})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    with verrou('chargement du banc'):
        await pg.goto(URL + '?v=' + str(time.time()), timeout=180000); await pg.wait_for_function('window.PRET', timeout=600000)
    e = await pg.evaluate('window.ERREUR || null')
    if e: raise SystemExit('banc : ' + e)
    return br, pg, errs

def sauver_png(url, chemin):
    os.makedirs(os.path.dirname(chemin), exist_ok=True)
    with open(chemin, 'wb') as f: f.write(base64.b64decode(url.split(',', 1)[1]))

def instant(r, v):
    """instant (s) de l'image qui prouve le verdict v"""
    im = r['images']; b = r['bilan']
    if not im: return None
    if v.get('acoup'): i = (b.get('acoups', {}).get(v['acoup']) or {}).get('img', -1); return im[min(max(i, 0), len(im) - 1)]['t']
    cle = list(v.get('cle') or ())
    if cle and cle[0].startswith('glisseMaxImg'): i = b.get(cle[0], -1); return im[min(max(i, 0), len(im) - 1)]['t']
    if len(cle) >= 2:
        agg = cle[-1]; noms = cle[:-1]
        if noms == ['doigt*']: noms = [p + d for p in ('doigtD', 'doigtG') for d in ('Thumb', 'Index', 'Middle', 'Ring', 'Pinky')]
        best = None
        for k in noms:
            s = b.get('stat', {}).get(k)
            if not s: continue
            if agg == 'moy': continue
            i = s['iMin'] if agg == 'min' else s['iMax']; val = s['min'] if agg == 'min' else s['max']
            if best is None or (agg == 'min' and val < best[0]) or (agg == 'max' and val > best[0]): best = (val, i)
        if best and best[1] >= 0: return im[best[1]]['t']
    return im[len(im) // 2]['t']

def fmt(x):
    if x is None: return '—'
    if isinstance(x, (list, tuple)): return '[' + ', '.join(fmt(y) for y in x) + ']'
    return f'{x:.3g}' if abs(x) < 100 else f'{x:.0f}'

async def cmd_revue(a):
    tag = a.sortie or os.path.join('captures', 'revue', datetime.datetime.now().strftime('revue_%m%d_%H%M'))
    out = os.path.join(RACINE, tag) if not os.path.isabs(tag) else tag; os.makedirs(out, exist_ok=True)
    async with async_playwright() as p:
        br, pg, errs = await page_banc(p)
        etats = a.etats.split(',') if a.etats else await pg.evaluate('Object.keys(BANC.ETATS)')
        res = {}; t0 = time.time(); echecs = []
        for m in a.modeles.split(','):
            for e in etats:
                try:
                    with verrou(): r = await pg.evaluate(f'BANC.mesurer({json.dumps(m)}, {json.dumps(e)})')
                    res[(m, e)] = r
                except Exception as ex:   # un état qui plante (fonction renommée, clip absent…) n'arrête pas la revue
                    msg = str(ex).split('\n')[0][:300]; echecs.append((m, e, msg)); print(f'ÉCHEC mesure {m}/{e} : {msg}', flush=True)
            print(f'mesures {m} : {len(etats)} états ({time.time() - t0:.0f} s)', flush=True)
        # notation
        verdicts = []
        for (m, e), r in res.items():
            for v in rubrique.noter(r, e):
                v.update(modele=m, etat=e, nom=r['nom'], t=instant(r, v) if v['niveau'] != 'OK' else None); verdicts.append(v)
        mauvais = sorted([v for v in verdicts if v['niveau'] != 'OK'], key=lambda v: (v['niveau'] != 'majeur', -min(v['ecart'], 50)))
        # preuves : planches par (modèle, état) pour les pires problèmes
        choix = {}
        for v in mauvais:
            k = (v['modele'], v['etat'])
            if k not in choix and len(choix) >= a.preuves: continue
            c = choix.setdefault(k, {'vues': [], 'instants': []})
            for vu in v['vues'][:2]:
                if vu not in c['vues'] and len(c['vues']) < 5: c['vues'].append(vu)
            if v['t'] is not None and all(abs(v['t'] - x) > 0.05 for x in c['instants']) and len(c['instants']) < 3: c['instants'].append(v['t'])
        for (m, e), c in choix.items():
            if not c['instants']: continue
            ins = sorted(c['instants']); chemin = os.path.join(out, 'preuves', f'{m}_{e}.png')
            try:
                with verrou(): r = await pg.evaluate(f'BANC.planche({json.dumps(m)}, {json.dumps(e)}, {json.dumps({"vues": c["vues"], "instants": ins, "marques": True, "tw": 220, "th": 260})})')
                sauver_png(r['url'], chemin); c['chemin'] = chemin
            except Exception as ex:
                msg = str(ex).split('\n')[0][:300]; echecs.append((m, e, 'planche : ' + msg)); print(f'ÉCHEC planche {m}/{e} : {msg}', flush=True); continue
            print(f'preuve {chemin} ({time.time() - t0:.0f} s)', flush=True)
        for v in mauvais:
            c = choix.get((v['modele'], v['etat']))
            v['preuve'] = c.get('chemin') if c else None
        await br.close()
    # rapport
    json.dump({'date': datetime.datetime.now().isoformat(timespec='seconds'), 'verdicts': [{k: v[k] for k in v if k not in ('quand',)} for v in verdicts],
               'mesures': {f'{m}/{e}': {'bilan': {k: x for k, x in r['bilan'].items() if k != 'stat'}, 'stat': r['bilan'].get('stat')} for (m, e), r in res.items()}},
              open(os.path.join(out, 'rapport.json'), 'w'), default=str, indent=0)
    L = [f'# Revue d\'animation — {datetime.datetime.now():%d/%m %H:%M}', '', f'Sortie : `{out}`', '']
    # tableau par état
    L += ['## Scores par état (OK / mineur / majeur)', '', '| état | ' + ' | '.join(a.modeles.split(',')) + ' |', '|---|' + '---|' * len(a.modeles.split(','))]
    for e in etats:
        cells = []
        for m in a.modeles.split(','):
            vs = [v for v in verdicts if v['modele'] == m and v['etat'] == e]
            cells.append(f"{sum(v['niveau'] == 'OK' for v in vs)} / {sum(v['niveau'] == 'mineur' for v in vs)} / **{sum(v['niveau'] == 'majeur' for v in vs)}**")
        L.append(f'| {e} | ' + ' | '.join(cells) + ' |')
    if echecs: L += ['', '## ÉCHECS (états non mesurés ou planches non rendues)', ''] + [f'- {m} / {e} : `{msg}`' for m, e, msg in echecs]
    tot = {n: sum(v['niveau'] == n for v in verdicts) for n in ('OK', 'mineur', 'majeur')}
    L += ['', f"Total : {tot['OK']} OK, {tot['mineur']} mineurs, {tot['majeur']} majeurs (sur {len(verdicts)} vérifications).", '']
    for part, titre in (('haut', 'Haut du corps (mains, doigts, arme, tête, buste)'), ('bas', 'Bas du corps (locomotion, pieds, jambes)')):
        L += [f'## {titre}', '']
        # regroupe un même critère sur plusieurs états
        grp = {}
        for v in mauvais:
            if v['partie'] == part: grp.setdefault(v['id'], []).append(v)
        for cid, vs in sorted(grp.items(), key=lambda kv: (all(v['niveau'] != 'majeur' for v in kv[1]), -max(min(v['ecart'], 50) for v in kv[1]))):
            v0 = vs[0]
            L += [f"### {'MAJEUR' if any(v['niveau'] == 'majeur' for v in vs) else 'mineur'} — {v0['lib']}  (`{cid}`)", f"Attendu : OK {fmt(v0['ok'])}, toléré {fmt(v0['mineur'])}. Pourquoi : {v0['pourquoi']} Source : {v0['src']}.", '']
            for v in sorted(vs, key=lambda v: -min(v['ecart'], 50))[:8]:
                L.append(f"- **{v['niveau']}** {v['modele']} / {v['etat']} : mesuré **{fmt(v['valeur'])}** (t = {fmt(v['t'])} s)" + (f" — preuve `{v['preuve']}`" if v.get('preuve') else ''))
            if len(vs) > 8: L.append(f'- … et {len(vs) - 8} autres états')
            L.append('')
    open(os.path.join(out, 'rapport.md'), 'w').write('\n'.join(L))
    print(f"\n{tot['OK']} OK, {tot['mineur']} mineurs, {tot['majeur']} majeurs → {os.path.join(out, 'rapport.md')}")
    if errs: print('erreurs de page :', errs[:5])

async def cmd_planche(a):
    tw, th = map(int, a.taille.split('x'))
    async with async_playwright() as p:
        br, pg, errs = await page_banc(p)
        o = {'vues': a.vues.split(','), 'n': a.n, 'marques': a.marques, 'tw': tw, 'th': th}
        if a.instants: o['instants'] = [float(x) for x in a.instants.split(',')]
        t = time.time()
        with verrou(): r = await pg.evaluate(f'BANC.planche({json.dumps(a.modele)}, {json.dumps(a.etat)}, {json.dumps(o)})')
        chemin = a.sortie or os.path.join(RACINE, 'captures', 'revue', f'planche_{a.modele}_{a.etat}.png'); sauver_png(r['url'], chemin)
        print(chemin, f'({time.time() - t:.0f} s)', r['info'])
        if errs: print(errs[:5])
        await br.close()

def cmd_comparer(a):
    A = json.load(open(a.avant)); B = json.load(open(a.apres))
    key = lambda v: (v['modele'], v['etat'], v['id'])
    da = {key(v): v for v in A['verdicts']}; db = {key(v): v for v in B['verdicts']}
    rang = {'OK': 0, 'mineur': 1, 'majeur': 2}
    print(f"avant {A['date']} → après {B['date']}")
    for n in ('OK', 'mineur', 'majeur'): print(f"  {n:7s} {sum(v['niveau'] == n for v in A['verdicts']):4d} → {sum(v['niveau'] == n for v in B['verdicts']):4d}")
    mieux = [k for k in db if k in da and rang[db[k]['niveau']] < rang[da[k]['niveau']]]
    pire = [k for k in db if k in da and rang[db[k]['niveau']] > rang[da[k]['niveau']]]
    print(f'\nAMÉLIORÉ ({len(mieux)}) :'); [print(f"  {k}: {da[k]['niveau']} {fmt(da[k]['valeur'])} → {db[k]['niveau']} {fmt(db[k]['valeur'])}") for k in mieux]
    print(f'\nRÉGRESSIONS ({len(pire)}) :'); [print(f"  {k}: {da[k]['niveau']} {fmt(da[k]['valeur'])} → {db[k]['niveau']} {fmt(db[k]['valeur'])}") for k in pire]

async def cmd_apercu(a):
    """planche d'ensemble : une ligne par état (1 instant), mêmes vues ; assemblée avec PIL"""
    from PIL import Image
    tw, th = map(int, a.taille.split('x'))
    async with async_playwright() as p:
        br, pg, errs = await page_banc(p)
        etats = a.etats.split(',') if a.etats else await pg.evaluate('Object.keys(BANC.ETATS)')
        tmp = []; t = time.time()
        for e in etats:
            try:
                with verrou(): r = await pg.evaluate(f'BANC.planche({json.dumps(a.modele)}, {json.dumps(e)}, {json.dumps({"vues": a.vues.split(","), "n": 1, "tw": tw, "th": th, "marques": a.marques})})')
            except Exception as ex: print(f'ÉCHEC aperçu {e} : ' + str(ex).split(chr(10))[0][:300], flush=True); continue
            f = os.path.join(RACINE, 'captures', 'revue', '_tmp_' + e + '.png'); sauver_png(r['url'], f); tmp.append(f)
        await br.close()
    ims = [Image.open(f) for f in tmp]; W = max(i.width for i in ims); H = sum(i.height for i in ims)
    out = Image.new('RGB', (W, H), (21, 25, 28)); y = 0
    for i in ims: out.paste(i, (0, y)); y += i.height
    chemin = a.sortie or os.path.join(RACINE, 'captures', 'revue', f'apercu_{a.modele}.png'); out.save(chemin)
    for f in tmp: os.remove(f)
    print(chemin, f'({time.time() - t:.0f} s)')

async def cmd_etats(a):
    async with async_playwright() as p:
        br, pg, errs = await page_banc(p)
        print(json.dumps(await pg.evaluate('({etats: Object.fromEntries(Object.entries(BANC.ETATS).map(([k, v]) => [k, v.nom])), vues: Object.keys(BANC.VUES)})'), indent=1, ensure_ascii=False))
        await br.close()

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); sp = ap.add_subparsers(dest='cmd', required=True)
    r = sp.add_parser('revue'); r.add_argument('--modeles', default='gign,soldat'); r.add_argument('--etats'); r.add_argument('--preuves', type=int, default=14); r.add_argument('--sortie')
    pl = sp.add_parser('planche'); pl.add_argument('--modele', default='gign'); pl.add_argument('--etat', required=True); pl.add_argument('--vues', default='face,profil,dos,troisQuarts')
    pl.add_argument('--n', type=int, default=4); pl.add_argument('--instants'); pl.add_argument('--marques', action='store_true'); pl.add_argument('--taille', default='200x260'); pl.add_argument('--sortie')
    ape = sp.add_parser('apercu'); ape.add_argument('--modele', default='gign'); ape.add_argument('--etats'); ape.add_argument('--vues', default='face,profil,dessus,mainD,piedsProfil'); ape.add_argument('--taille', default='180x220'); ape.add_argument('--marques', action='store_true'); ape.add_argument('--sortie')
    c = sp.add_parser('comparer'); c.add_argument('avant'); c.add_argument('apres')
    sp.add_parser('etats')
    a = ap.parse_args()
    if a.cmd == 'comparer': cmd_comparer(a)
    else: asyncio.run({'revue': cmd_revue, 'planche': cmd_planche, 'etats': cmd_etats, 'apercu': cmd_apercu}[a.cmd](a))
