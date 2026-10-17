# Allège un objet de décor (ou une arme) exporté par Meshy pour le jeu : maillage simplifié par gltfpack (meshoptimizer,
# compilé depuis GitHub : https://github.com/zeux/meshoptimizer — « make config=release gltfpack »), positions et UV
# quantifiés (KHR_mesh_quantization, lu par three.js), puis seule la texture de couleur est gardée, réduite et en JPEG
# (le relief et le métal/rugosité ne se voient pas à la distance de jeu). Le métal et la rugosité deviennent des valeurs fixes.
# usage : python3 outils/decor_glb.py entree.glb sortie.glb --tris 4000 [--tex 1024] [--jpeg 82] [--metal 0] [--rugo 0.8]
#         [--gltfpack /chemin/gltfpack]
import json, struct, sys, io, subprocess, tempfile, os, argparse
from PIL import Image

ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('--tris', type=int, default=4000); ap.add_argument('--tex', type=int, default=1024); ap.add_argument('--jpeg', type=int, default=82)
ap.add_argument('--agressif', action='store_true'); ap.add_argument('--erreur', type=float, default=0.05); ap.add_argument('--metal', type=float, default=0.0); ap.add_argument('--rugo', type=float, default=0.8)
ap.add_argument('--gltfpack', default='/home/claude/meshoptimizer/gltfpack')
a = ap.parse_args()

def lire(path):
    b = open(path, 'rb').read(); L = struct.unpack('<I', b[12:16])[0]
    return json.loads(b[20:20 + L]), b[20 + L + 8:]

j, _ = lire(a.src)
tris = sum(j['accessors'][p['indices']]['count'] // 3 for m in j['meshes'] for p in m['primitives'])
ratio = min(1.0, a.tris / tris)
tmp = tempfile.mktemp(suffix='.glb')
cmd = [a.gltfpack, '-i', a.src, '-o', tmp, '-si', f'{ratio:.6f}', '-se', str(a.erreur), '-kn', '-vtf'] + (['-sa'] if a.agressif else [])
subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL)
j, b0 = lire(tmp); os.remove(tmp)

# nouveau tampon : on recopie les vues utilisées par les accesseurs, puis la seule image gardée (couleur)
out = bytearray(); views = []; remap = {}
def push(data):
    while len(out) % 4: out.append(0)
    off = len(out); out.extend(data); views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}); return len(views) - 1
for acc in j['accessors']:
    v = acc.get('bufferView')
    if v is None or v in remap: continue
    bv = j['bufferViews'][v]; o = bv.get('byteOffset', 0)
    k = push(b0[o:o + bv['byteLength']]); nv = views[k]
    for key in ('byteStride', 'target'):
        if key in bv: nv[key] = bv[key]
    remap[v] = k
for acc in j['accessors']:
    if 'bufferView' in acc: acc['bufferView'] = remap[acc['bufferView']]

mat = j['materials'][0]; pbr = mat.get('pbrMetallicRoughness', {}); images, textures = [], []
if 'baseColorTexture' in pbr:
    tex = j['textures'][pbr['baseColorTexture']['index']]; im = j['images'][tex['source']]; bv = j['bufferViews'][im['bufferView']]
    pil = Image.open(io.BytesIO(b0[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']])).convert('RGB')
    if max(pil.size) > a.tex: pil = pil.resize((a.tex, a.tex) if pil.size[0] == pil.size[1] else (a.tex, round(pil.size[1] * a.tex / pil.size[0])), Image.LANCZOS)
    buf = io.BytesIO(); pil.save(buf, 'JPEG', quality=a.jpeg, optimize=True)
    images.append({'bufferView': push(buf.getvalue()), 'mimeType': 'image/jpeg'}); textures.append({'source': 0, 'sampler': 0})
    pbr['baseColorTexture'] = {'index': 0}
pbr.pop('metallicRoughnessTexture', None); pbr['metallicFactor'] = a.metal; pbr['roughnessFactor'] = a.rugo
for k in ('normalTexture', 'occlusionTexture', 'emissiveTexture'): mat.pop(k, None)
mat.pop('alphaMode', None); mat['doubleSided'] = False
j['materials'] = [mat]; j['images'] = images; j['textures'] = textures; j['samplers'] = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}]
for m in j['meshes']:
    for p in m['primitives']: p['material'] = 0
j['bufferViews'] = views
while len(out) % 4: out.append(0)
j['buffers'] = [{'byteLength': len(out)}]
for k in ('extensionsUsed', 'extensionsRequired'):
    if k in j: j[k] = [e for e in j[k] if e != 'KHR_texture_transform' or any('KHR_texture_transform' in json.dumps(t) for t in [mat])]
js = json.dumps(j, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(out)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(out), 0x004E4942) + bytes(out)
open(a.dst, 'wb').write(glb)
nt = sum(j['accessors'][p['indices']]['count'] // 3 for m in j['meshes'] for p in m['primitives'])
print(f'{a.dst} : {len(glb) // 1024} Kio, {nt} triangles (sur {tris}), extensions {j.get("extensionsUsed")}')
