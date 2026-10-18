# Analyse tactique d'une carte (vue de dessus) : exposition de chaque point (part de la carte visible debout à hauteur
# d'yeux, en tenant compte des murs et des couverts hauts), plus longues lignes de vue, temps d'accès à la zone depuis chaque
# départ. Sortie : une image (exposition en couleur, obstacles, départs, zone) et un résumé chiffré.
# usage : node -e "…dump…" > carte.json ; python3 outils/analyse_carte.py carte.json sortie.png
import json, sys, math
import numpy as np
from PIL import Image, ImageDraw
d = json.load(open(sys.argv[1])); out = sys.argv[2]
W, D = d['w'], d['d']; S = 1.0                      # pas de la grille (m)
obs = [o for o in d['obs'] if o['x'] < W and o['z'] < D and o['x'] + o['w'] > 0 and o['z'] + o['d'] > 0]
EYE = 1.55
def blocked(x0, z0, x1, z1):
    for o in obs:
        if o['h'] < EYE - 0.05: continue            # couvert bas : on voit par-dessus debout
        t0, t1 = 0.0, 1.0; ok = True
        for p, dd, lo, hi in ((x0, x1 - x0, o['x'], o['x'] + o['w']), (z0, z1 - z0, o['z'], o['z'] + o['d'])):
            if abs(dd) < 1e-9:
                if p < lo or p > hi: ok = False; break
            else:
                a, b = (lo - p) / dd, (hi - p) / dd
                if a > b: a, b = b, a
                t0, t1 = max(t0, a), min(t1, b)
                if t0 > t1: ok = False; break
        if ok and t1 > 0 and t0 < 1: return True
    return False
inside = lambda x, z: any(o['x'] <= x <= o['x'] + o['w'] and o['z'] <= z <= o['z'] + o['d'] for o in obs)
xs = np.arange(0.5, W, 2.0); zs = np.arange(0.5, D, 2.0)
pts = [(x, z) for z in zs for x in xs if not inside(x, z)]
vis = {p: 0 for p in pts}; longest = []
for i, a in enumerate(pts):
    for b in pts[i + 1:]:
        if not blocked(a[0], a[1], b[0], b[1]):
            vis[a] += 1; vis[b] += 1
            L = math.hypot(a[0] - b[0], a[1] - b[1])
            if L > 30: longest.append((L, a, b))
n = len(pts); sc = 12
img = Image.new('RGB', (int(W * sc), int(D * sc)), (30, 32, 36)); g = ImageDraw.Draw(img)
for (x, z), v in vis.items():
    e = v / n; c = (int(255 * min(1, e * 2)), int(255 * max(0, 1 - e * 2)), 60)
    g.rectangle([(x - 1) * sc, (z - 1) * sc, (x + 1) * sc, (z + 1) * sc], fill=c)
for o in obs:
    col = (230, 230, 230) if o['h'] >= EYE else (120, 160, 255)
    g.rectangle([o['x'] * sc, o['z'] * sc, (o['x'] + o['w']) * sc, (o['z'] + o['d']) * sc], fill=col, outline=(0, 0, 0))
for L, a, b in sorted(longest, reverse=True)[:25]: g.line([a[0] * sc, a[1] * sc, b[0] * sc, b[1] * sc], fill=(255, 255, 0), width=1)
for s in d['spawns']: g.ellipse([(s['x'] - s['r']) * sc, (s['z'] - s['r']) * sc, (s['x'] + s['r']) * sc, (s['z'] + s['r']) * sc], outline=(0, 255, 255), width=3)
c = d.get('capture');
if c: g.ellipse([(c['x'] - c['r']) * sc, (c['z'] - c['r']) * sc, (c['x'] + c['r']) * sc, (c['z'] + c['r']) * sc], outline=(255, 220, 0), width=3)
img.save(out)
ex = np.array(list(vis.values())) / n
print(f'points {n} · exposition moyenne {ex.mean():.2f} · max {ex.max():.2f} · lignes de vue > 30 m : {len(longest)} · plus longue {max([l[0] for l in longest] or [0]):.1f} m')
# exposition moyenne par tiers (ouest / milieu / est) et par bande nord / centre / sud
for nom, f in (('ouest', lambda x, z: x < W / 3), ('milieu', lambda x, z: W / 3 <= x <= 2 * W / 3), ('est', lambda x, z: x > 2 * W / 3), ('nord', lambda x, z: z < D / 3), ('centre', lambda x, z: D / 3 <= z <= 2 * D / 3), ('sud', lambda x, z: z > 2 * D / 3)):
    v = [vis[p] / n for p in pts if f(*p)]; print(f'  {nom:7s} {np.mean(v):.2f}')
