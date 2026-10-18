# Extrait les textures d'origine d'un modèle Meshy (couleur, relief = normal map, mr = métal/rugosité) en JPEG pour le jeu :
# web/hd/<nom>_couleur|relief|mr.jpg (remplacées à chaud par soldat3d.js quand la page est servie avec ses fichiers hd/).
# usage : python3 outils/textures_hd.py modele_brut.glb nom [--tailles 4096,4096,2048] [--jpeg 88]
import json, struct, sys, io
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
src, nom = sys.argv[1], sys.argv[2]
T = [int(x) for x in sys.argv[sys.argv.index('--tailles') + 1].split(',')] if '--tailles' in sys.argv else [4096, 4096, 2048]
Q = int(sys.argv[sys.argv.index('--jpeg') + 1]) if '--jpeg' in sys.argv else 88
b = open(src, 'rb').read(); L = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + L]); bin0 = b[20 + L + 8:]
m = j['materials'][0]; pbr = m['pbrMetallicRoughness']
slots = [('couleur', pbr['baseColorTexture']['index'], T[0]), ('relief', m['normalTexture']['index'], T[1]), ('mr', pbr['metallicRoughnessTexture']['index'], T[2])]
for nomf, ti, taille in slots:
    im = j['images'][j['textures'][ti]['source']]; v = j['bufferViews'][im['bufferView']]
    img = Image.open(io.BytesIO(bin0[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']])).convert('RGB')
    print(nomf, 'origine', img.size, end=' ')
    if max(img.size) > taille: img = img.resize((taille, taille), Image.LANCZOS)
    out = f'web/hd/{nom}_{nomf}.jpg'; img.save(out, quality=Q, optimize=True, subsampling=0 if nomf != 'couleur' else 2)
    import os; print('→', img.size, out, os.path.getsize(out) // 1000, 'ko')
