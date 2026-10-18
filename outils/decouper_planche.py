# Découpe une planche de personnage (plusieurs vues côte à côte sur fond uni) en images séparées, une par vue :
# repère les silhouettes par différence avec la couleur du fond (coins), garde les N plus larges bandes de colonnes,
# recadre chaque vue en carré avec une marge, fond uni conservé, agrandie à --taille.
# usage : python3 outils/decouper_planche.py planche.jpg sortie_prefixe --vues face,gauche,dos [--taille 1024]
import sys, argparse
import numpy as np
from PIL import Image
ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('dst'); ap.add_argument('--vues', default='face,gauche,dos'); ap.add_argument('--taille', type=int, default=1024)
a = ap.parse_args(); noms = a.vues.split(',')
im = Image.open(a.src).convert('RGB'); A = np.asarray(im).astype(np.float32); H, W, _ = A.shape
bg = np.median(np.concatenate([A[:8, :8].reshape(-1, 3), A[:8, -8:].reshape(-1, 3), A[-8:, :8].reshape(-1, 3), A[-8:, -8:].reshape(-1, 3)]), axis=0)
mask = np.abs(A - bg).sum(2) > 40
col = mask.sum(0) > 2
# bandes de colonnes occupées
bands = []; x = 0
while x < W:
    if col[x]:
        x0 = x
        while x < W and col[x]: x += 1
        bands.append((x0, x))
    x += 1
# fusionne les bandes proches (bras écartés), garde les N plus larges
merged = []
for b in bands:
    if merged and b[0] - merged[-1][1] < 12: merged[-1] = (merged[-1][0], b[1])
    else: merged.append(b)
merged = sorted(sorted(merged, key=lambda b: b[1] - b[0], reverse=True)[:len(noms)])
if len(merged) < len(noms):   # vues collées : on coupe au creux de la projection des colonnes, près des tiers de l'image
    proj = mask.sum(0).astype(float); cuts = []
    for k in range(1, len(noms)):
        c = int(W * k / len(noms)); lo, hi = max(1, c - W // 10), min(W - 1, c + W // 10); cuts.append(lo + int(np.argmin(proj[lo:hi])))
    edges = [0] + cuts + [W]; merged = []
    for x0, x1 in zip(edges[:-1], edges[1:]):
        cols = np.where(proj[x0:x1] > 2)[0]; merged.append((x0 + cols.min(), x0 + cols.max() + 1))
for nom, (x0, x1) in zip(noms, merged):
    rows = np.where(mask[:, x0:x1].sum(1) > 0)[0]; y0, y1 = rows.min(), rows.max() + 1
    h = y1 - y0; side = int(h * 1.1); cx = (x0 + x1) // 2; cy = (y0 + y1) // 2
    out = Image.new('RGB', (side, side), tuple(int(c) for c in bg))
    box = (cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)
    iso = A.copy(); iso[:, :max(0, x0 - 6)] = bg; iso[:, min(W, x1 + 6):] = bg; isoI = Image.fromarray(iso.astype(np.uint8))   # seule cette vue
    crop = isoI.crop((max(0, box[0]), max(0, box[1]), min(W, box[2]), min(H, box[3])))
    out.paste(crop, (max(0, -box[0]), max(0, -box[1])))
    out = out.resize((a.taille, a.taille), Image.LANCZOS); out.save(f'{a.dst}_{nom}.png')
    print(nom, (x0, x1, y0, y1), '->', f'{a.dst}_{nom}.png')
