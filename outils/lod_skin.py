# Version allégée (niveau de détail « loin ») d'un personnage HD : maillage simplifié par gltfpack (articulations et poids
# gardés), puis on ne garde que ce qui sert au jeu : le maillage, la peau (os + matrices inverses de liaison) et les nœuds.
# Pas de textures, matériaux ni animations : soldat3d.js lie ce maillage au squelette et au matériau du modèle HD déjà chargé.
# (coordonnées de texture en flottants : -vtf ; quantifiées, gltfpack les recale par une transformation de texture portée
# par le matériau, que l'on retire ici)
# usage : python3 outils/lod_skin.py entree_hd.glb sortie_lod.glb --ratio 0.33 [--gltfpack /chemin/gltfpack]
import json, struct, subprocess, tempfile, os, argparse
ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('dst'); ap.add_argument('--ratio', type=float, default=0.33)
ap.add_argument('--gltfpack', default='/home/claude/meshoptimizer/gltfpack'); a = ap.parse_args()
def lire(p):
    b = open(p, 'rb').read(); L = struct.unpack('<I', b[12:16])[0]; return json.loads(b[20:20 + L]), b[20 + L + 8:]
tmp = tempfile.mktemp(suffix='.glb')
subprocess.run([a.gltfpack, '-i', a.src, '-o', tmp, '-si', f'{a.ratio:.4f}', '-kn', '-vtf'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
j, b0 = lire(tmp); os.remove(tmp)
out = bytearray(); views = []; remap = {}
def push(data):
    while len(out) % 4: out.append(0)
    off = len(out); out.extend(data); views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}); return len(views) - 1
used = set()
for m in j['meshes']:
    for p in m['primitives']:
        p.pop('material', None); p.pop('targets', None)
        used.update(p['attributes'].values()); used.add(p['indices'])
for s in j.get('skins', []):
    if 'inverseBindMatrices' in s: used.add(s['inverseBindMatrices'])
accs = []; amap = {}
for i, acc in enumerate(j['accessors']):
    if i not in used: continue
    v = acc.get('bufferView')
    if v is not None and v not in remap:
        bv = j['bufferViews'][v]; o = bv.get('byteOffset', 0); k = push(b0[o:o + bv['byteLength']])
        for key in ('byteStride', 'target'):
            if key in bv: views[k][key] = bv[key]
        remap[v] = k
    acc = dict(acc)
    if v is not None: acc['bufferView'] = remap[v]
    amap[i] = len(accs); accs.append(acc)
for m in j['meshes']:
    for p in m['primitives']:
        p['attributes'] = {k: amap[v] for k, v in p['attributes'].items()}; p['indices'] = amap[p['indices']]
for s in j.get('skins', []):
    if 'inverseBindMatrices' in s: s['inverseBindMatrices'] = amap[s['inverseBindMatrices']]
for k in ('animations', 'materials', 'textures', 'images', 'samplers'): j.pop(k, None)
j['accessors'] = accs; j['bufferViews'] = views
while len(out) % 4: out.append(0)
j['buffers'] = [{'byteLength': len(out)}]
j['extensionsUsed'] = [e for e in j.get('extensionsUsed', []) if e == 'KHR_mesh_quantization']
if 'extensionsRequired' in j: j['extensionsRequired'] = [e for e in j['extensionsRequired'] if e == 'KHR_mesh_quantization']
js = json.dumps(j, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(out)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(out), 0x004E4942) + bytes(out)
open(a.dst, 'wb').write(glb)
nt = sum(accs[p['indices']]['count'] // 3 for m in j['meshes'] for p in m['primitives'])
print(f'{a.dst} : {len(glb) // 1024} Kio, {nt} triangles, os {sum(len(s["joints"]) for s in j.get("skins", []))}')
