# Range un .glb dans un script (base64) pour l'inclure dans la page sans requête réseau : OT.MODELES[nom].
# usage : python3 outils/modele_en_js.py modele.glb nom web/modeles/nom.js
import base64, sys
src, nom, dst = sys.argv[1:4]
b = base64.b64encode(open(src, 'rb').read()).decode()
open(dst, 'w').write(f"// Modèle 3D « {nom} » (fait avec Meshy, compacté par outils/compacter_glb.py), en base64.\n(window.OT = window.OT || {{}}).MODELES = Object.assign(window.OT.MODELES || {{}}, {{ {nom}: '{b}' }});\n")
print(dst, len(b))
