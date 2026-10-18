# Plan de dessus annoté d'une carte (critique de réalisme) : chaque obstacle coloré par famille, nommé, avec sa hauteur ;
# sens des voitures (capot) ; marquage au sol déclaré dans la carte ; voies de l'IA et chemins A* ; départs ; zone ;
# points de couverture ; lignes de vue > 40 m ; zones « nues » (> 6 m du couvert le plus proche) ; chevauchements.
# usage : node outils/critique/plan_dump.js > plan.json && python3 outils/critique/plan.py plan.json plan.png [--peinture-v1]
import json, sys, math
from PIL import Image, ImageDraw, ImageFont
d = json.load(open(sys.argv[1])); out = sys.argv[2]; peint = '--peinture-v1' in sys.argv
W, D = d['w'], d['d']; S = 18; M = 60                     # px par mètre, marge
img = Image.new('RGB', (int(W * S) + 2 * M, int(D * S) + 2 * M + 150), (24, 26, 30)); g = ImageDraw.Draw(img, 'RGBA')
F = lambda s: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed.ttf', s)
FB = lambda s: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf', s)
P = lambda x, z: (M + x * S, M + z * S)
# sol : zones nues en rouge
for x, z, dist in d['naked']:
    if dist > 6: a = min(200, int((dist - 6) * 40 + 60)); g.rectangle([*P(x - .5, z - .5), *P(x + .5, z + .5)], fill=(200, 40, 40, a))
# grille 5 m
for x in range(0, W + 1, 5): g.line([P(x, 0), P(x, D)], fill=(60, 64, 70) if x % 10 else (80, 86, 94), width=1); g.text((P(x, 0)[0] - 6, M - 18), str(x), font=F(11), fill=(150, 150, 150))
for z in range(0, D + 1, 5): g.line([P(0, z), P(W, z)], fill=(60, 64, 70) if z % 10 else (80, 86, 94), width=1); g.text((M - 26, P(0, z)[1] - 6), str(z), font=F(11), fill=(150, 150, 150))
# marquage déclaré (sim/map.js : marquage)
mq = d.get('marquage') or {}
for x0, z0, n in mq.get('rangees', []):
    for k in range(n + 1):
        z = z0 + 2.5 * k; g.line([P(x0, z), P(x0 + 10, z)], fill=(230, 230, 230, 150), width=2)
    g.line([P(x0 + 5, z0), P(x0 + 5, z0 + 2.5 * n)], fill=(230, 230, 230, 150), width=2)
for x, z, n, sx, sz in mq.get('murs', []):
    for k in range(n):
        if sx:   # places côte à côte le long de x, profondeur 5 m vers le mur (sud si z>D/2)
            zz = z; xx = x + k * sx; g.rectangle([*P(xx, zz), *P(xx + sx, zz + 5)], outline=(230, 230, 230, 150), width=2)
        else:
            xx = x; zz = z + k * sz; g.rectangle([*P(xx, zz), *P(xx + 5, zz + sz)], outline=(230, 230, 230, 150), width=2)
if peint:   # peinture codée en dur dans web/parking.js (groundMaps, version d'origine) : 3 rangées est-ouest
    for zr in (D * .22, D * .5, D * .78):
        x = 5.2
        while x < W - 5:
            if not (27.5 < x < 44.5 and zr == D * .5): g.line([P(x, zr - 2.5), P(x, zr + 2.5)], fill=(255, 0, 255, 110), width=1)
            x += 2.6
def fam(n):
    n = n or ''
    if n.startswith('mur'): return (70, 72, 78)
    if any(k in n for k in ('voiture', 'fourgon', 'bus', 'pick')): return (70, 120, 210)
    if any(k in n for k in ('haie', 'bac', 'arbre', 'jardin')): return (60, 150, 70)
    if any(k in n for k in ('chantier', 'barri', 'conteneur', 'sacs', 'gravats', 'palette', 'caisse', 'fût', 'plot')): return (230, 140, 40)
    if any(k in n for k in ('clôture', 'grillag')): return (170, 170, 170)
    if any(k in n for k in ('benne', 'poubelle', 'clim', 'tri')): return (150, 110, 160)
    return (170, 110, 80)     # bâtis : annexe, kiosque, guérite, lavage, poste…
obs = sorted(d['obs'], key=lambda o: o['h'])
for o in obs:
    c = fam(o['name']); hi = o['h'] >= 1.55
    g.rectangle([*P(o['x'], o['z']), *P(o['x'] + o['w'], o['z'] + o['d'])], fill=c + (235 if hi else 150,), outline=(255, 255, 255) if hi else (20, 20, 20), width=2 if hi else 1)
    if o.get('dir') is not None:   # capot : flèche dans le sens o.dir le long de x
        cx, cz = o['x'] + o['w'] / 2, o['z'] + o['d'] / 2; L = o['w'] * .38
        a, b = P(cx - o['dir'] * L, cz), P(cx + o['dir'] * L, cz); g.line([a, b], fill=(255, 255, 255), width=2)
        g.polygon([b, (b[0] - o['dir'] * 8, b[1] - 5), (b[0] - o['dir'] * 8, b[1] + 5)], fill=(255, 255, 255))
# chemins de l'IA
pc = {'nord': (90, 220, 255), 'milieu': (255, 230, 90), 'sud': (255, 120, 220)}
for k, lst in (d.get('paths') or {}).items():
    for t, p in enumerate(lst):
        if len(p) > 1: g.line([P(*q) for q in p], fill=pc.get(k, (255, 255, 255)) + (170,), width=3 if t == 0 else 2)
if d.get('voies'):
    for k, zv in d['voies'].items(): g.text(P(W / 2 - 3, zv - .9), 'voie ' + k, font=FB(13), fill=pc.get(k, (255, 255, 255)))
# lignes de vue > 40 m (les 60 plus longues)
for ax, az, bx, bz, L in d['lines'][:60]: g.line([P(ax, az), P(bx, bz)], fill=(255, 255, 0, 90), width=1)
# points de couverture
for x, z in d['cover']: g.ellipse([P(x, z)[0] - 2, P(x, z)[1] - 2, P(x, z)[0] + 2, P(x, z)[1] + 2], fill=(255, 255, 255, 120))
for i, s in enumerate(d['spawns']):
    col = (80, 160, 255) if i == 0 else (255, 90, 80); a, b = P(s['x'] - s['r'], s['z'] - s['r']), P(s['x'] + s['r'], s['z'] + s['r'])
    g.ellipse([*a, *b], outline=col, width=4); g.text((a[0], b[1] + 2), 'BLEU' if i == 0 else 'ROUGE', font=FB(14), fill=col)
c = d.get('capture')
if c: a, b = P(c['x'] - c['r'], c['z'] - c['r']), P(c['x'] + c['r'], c['z'] + c['r']); g.ellipse([*a, *b], outline=(255, 220, 0), width=4)
# étiquettes (après tout le reste) : nom abrégé + hauteur
seen = []
for o in obs:
    n = (o['name'] or '').replace('voiture (pick-up)', 'pick-up').replace('clôture grillagée', 'grillage').replace('clôture de chantier', 'clôt. chantier')
    if n.startswith('mur ') or n == 'arbre': continue
    t = f"{n} {o['h']:.1f}"; cx, cz = P(o['x'] + o['w'] / 2, o['z'] + o['d'] / 2); f = F(11)
    tw = g.textlength(t, font=f); x0, y0 = cx - tw / 2, cz - 6
    while any(abs(y0 - y) < 11 and abs(x0 - x) < (tw + w) / 2 for x, y, w in seen): y0 += 11
    seen.append((x0, y0, tw)); g.rectangle([x0 - 1, y0, x0 + tw + 1, y0 + 12], fill=(0, 0, 0, 150)); g.text((x0, y0), t, font=f, fill=(255, 255, 255))
# légende
y = M + D * S + 30; L = [((70, 120, 210), 'véhicules (flèche = capot)'), ((170, 110, 80), 'bâtis / mobilier'), ((60, 150, 70), 'végétation'), ((230, 140, 40), 'chantier / stockage'),
     ((150, 110, 160), 'bennes, clims, tri'), ((170, 170, 170), 'grillage'), ((70, 72, 78), "murs d'enceinte")]
for i, (col, t) in enumerate(L):
    x = M + (i % 4) * 300; yy = y + (i // 4) * 22; g.rectangle([x, yy, x + 16, yy + 14], fill=col); g.text((x + 22, yy - 1), t, font=F(14), fill=(220, 220, 220))
g.text((M, y + 50), "contour blanc épais = bloque la vue debout (h ≥ 1,55 m) · rouge au sol = > 6 m du couvert le plus proche · jaune = lignes de vue > 40 m · points blancs = points de couverture"
       + (" · magenta = peinture de web/parking.js" if peint else ''), font=F(13), fill=(200, 200, 200))
g.text((M, y + 72), f"{d['name']} — {W} × {D} m · {len(d['obs'])} obstacles · lignes de vue > 40 m : {d['nLines']} · chevauchements : {len(d['overlaps'])}", font=FB(14), fill=(255, 255, 255))
g.text((M, 14), "NORD (z = 0) en haut · BLEU à l'ouest regarde vers l'est : sa GAUCHE est le NORD (à vérifier en 3D)", font=FB(14), fill=(255, 255, 255))
img.save(out)
for ov in d['overlaps']: print('chevauchement :', ov)
nk = [n for n in d['naked'] if n[2] > 6]; print(f"cases > 6 m d'un couvert : {len(nk)} ; lignes de vue > 40 m : {d['nLines']} ; plus longue {d['lines'][0][4] if d['lines'] else 0} m")
