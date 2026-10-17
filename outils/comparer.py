# Planche de comparaison : image du jeu original (à gauche) et notre écran (à droite), même hauteur.
# usage : python3 outils/comparer.py original.png notre.png sortie.png [--hauteur 540]
import sys
from PIL import Image, ImageDraw
a, b, out = sys.argv[1:4]
H = int(sys.argv[sys.argv.index("--hauteur") + 1]) if "--hauteur" in sys.argv else 540
ims = []
for p in (a, b):
    im = Image.open(p).convert("RGB"); ims.append(im.resize((round(im.width * H / im.height), H)))
W = ims[0].width + ims[1].width + 12
sheet = Image.new("RGB", (W, H + 30), (20, 20, 20)); d = ImageDraw.Draw(sheet)
sheet.paste(ims[0], (0, 30)); sheet.paste(ims[1], (ims[0].width + 12, 30))
d.text((8, 8), "ORIGINAL", fill=(255, 220, 80)); d.text((ims[0].width + 20, 8), "REMAKE", fill=(120, 230, 255))
sheet.save(out); print(out, sheet.size)
