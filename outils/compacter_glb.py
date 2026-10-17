# Compacte un personnage animé exporté par Meshy (squelette Mixamo) pour l'inclure dans une page web :
#  - 4 influences d'os par sommet au lieu de 8 (les 4 plus fortes, renormalisées), poids sur 8 bits ;
#  - normales sur 8 bits et UV sur 16 bits (extension KHR_mesh_quantization, lue par three.js) ;
#  - animations : rotations en entiers 16 bits normalisés, translations gardées seulement si elles bougent (bassin),
#    temps partagés ; possibilité de ne garder que certaines animations ;
#  - textures recompressées en JPEG (couleur, relief, métal/rugosité) ;
#  - seules les données réellement utilisées sont réécrites.
# usage : python3 outils/compacter_glb.py entree.glb sortie.glb [--garder Anim1,Anim2] [--jpeg 85] [--tailles 1024,512,1024]
#  --tailles : côté maximal des textures couleur, métal/rugosité, relief (réduites si plus grandes)
import json, struct, sys, io
import numpy as np
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
keep = None
if '--garder' in sys.argv: keep = set(sys.argv[sys.argv.index('--garder') + 1].split(','))
JQ = int(sys.argv[sys.argv.index('--jpeg') + 1]) if '--jpeg' in sys.argv else 85
TAILLES = [int(x) for x in sys.argv[sys.argv.index('--tailles') + 1].split(',')] if '--tailles' in sys.argv else [0, 0, 0]

b = open(src, 'rb').read()
L = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + L])
bin0 = b[20 + L + 8:]
CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

def read(ai):
    a = j['accessors'][ai]; v = j['bufferViews'][a['bufferView']]
    dt = CT[a['componentType']]; n = NC[a['type']]
    off = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = v.get('byteStride', 0); size = np.dtype(dt).itemsize * n
    if stride and stride != size:
        raw = np.frombuffer(bin0, np.uint8, count=stride * (a['count'] - 1) + size, offset=off)
        out = np.stack([np.frombuffer(raw[i * stride:i * stride + size].tobytes(), dt) for i in range(a['count'])])
    else:
        out = np.frombuffer(bin0, dt, count=a['count'] * n, offset=off).reshape(a['count'], n) if n > 1 else np.frombuffer(bin0, dt, count=a['count'], offset=off)
    if a.get('normalized'):
        out = out.astype(np.float32) / np.iinfo(dt).max
    return out.astype(np.float32) if dt == np.float32 else out

out_bin = bytearray(); views = []; accs = []
def add(arr, ctype, typ, target=None, normalized=False, minmax=False):
    arr = np.ascontiguousarray(arr)
    while len(out_bin) % 4: out_bin.append(0)
    off = len(out_bin); data = arr.astype(CT[ctype]).tobytes(); out_bin.extend(data)
    v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
    if target: v['target'] = target
    views.append(v)
    a = {'bufferView': len(views) - 1, 'componentType': ctype, 'count': int(arr.shape[0]), 'type': typ}
    if normalized: a['normalized'] = True
    if minmax:
        a2 = arr.reshape(arr.shape[0], -1).astype(np.float64)
        a['min'] = a2.min(0).tolist(); a['max'] = a2.max(0).tolist()
    accs.append(a); return len(accs) - 1

# ---- maillage
prim = j['meshes'][0]['primitives'][0]; at = prim['attributes']
pos = read(at['POSITION']); nor = read(at['NORMAL']); uv = read(at['TEXCOORD_0'])
J = read(at['JOINTS_0']).astype(np.int32); W = read(at['WEIGHTS_0'])
if 'JOINTS_1' in at:
    J = np.concatenate([J, read(at['JOINTS_1']).astype(np.int32)], 1); W = np.concatenate([W, read(at['WEIGHTS_1'])], 1)
order = np.argsort(-W, 1)[:, :4]; J4 = np.take_along_axis(J, order, 1); W4 = np.take_along_axis(W, order, 1)
W4 = W4 / np.maximum(W4.sum(1, keepdims=True), 1e-8)
W8 = np.round(W4 * 255).astype(np.int32); W8[:, 0] += 255 - W8.sum(1)    # somme exactement 255
idx = read(prim['indices'])
uvmin, uvmax = uv.min(0), uv.max(0)
assert uvmin.min() >= -1e-3 and uvmax.max() <= 1.001, 'UV hors de [0,1] : non quantifiables simplement'
na = {
    'POSITION': add(pos, 5126, 'VEC3', 34962, minmax=True),
    'NORMAL': add(np.round(np.clip(nor, -1, 1) * 127), 5120, 'VEC3', 34962, normalized=True),
    'TEXCOORD_0': add(np.round(np.clip(uv, 0, 1) * 65535), 5123, 'VEC2', 34962, normalized=True),
    'JOINTS_0': add(J4, 5121, 'VEC4', 34962),
    'WEIGHTS_0': add(W8, 5121, 'VEC4', 34962, normalized=True),
}
ni = add(idx, 5125 if idx.max() > 65535 else 5123, 'SCALAR', 34963)
newprim = {'attributes': na, 'indices': ni, 'material': 0}
if 'mode' in prim: newprim['mode'] = prim['mode']
# ---- squelette
skin = j['skins'][0]
ibm = add(read(skin['inverseBindMatrices']), 5126, 'MAT4')
newskin = dict(skin); newskin['inverseBindMatrices'] = ibm
# ---- animations
anims = []; tcache = {}
for an in j['animations']:
    if keep and an['name'] not in keep: continue
    samplers, channels = [], []
    for ch in an['channels']:
        s = an['samplers'][ch['sampler']]; path = ch['target']['path']; node = j['nodes'][ch['target']['node']]
        vals = read(s['output'])
        if path == 'translation':
            rest = np.array(node.get('translation', [0, 0, 0]), np.float32)
            if 'Hips' not in node.get('name', '') and np.abs(vals - rest).max() < 1e-4: continue
        if path == 'scale': continue
        t = read(s['input']); key = (t.shape[0], round(float(t[0]), 5), round(float(t[-1]), 5))
        if key not in tcache: tcache[key] = add(t.reshape(-1, 1), 5126, 'SCALAR', minmax=True)
        if path == 'rotation':
            q = vals / np.linalg.norm(vals, axis=1, keepdims=True)
            out = add(np.round(q * 32767), 5122, 'VEC4', normalized=True)
        else:
            out = add(vals, 5126, NC and ('VEC3' if vals.shape[1] == 3 else 'VEC4'))
        samplers.append({'input': tcache[key], 'output': out, 'interpolation': s.get('interpolation', 'LINEAR')})
        channels.append({'sampler': len(samplers) - 1, 'target': ch['target']})
    anims.append({'name': an['name'], 'samplers': samplers, 'channels': channels})
# ---- textures en JPEG
mat = j['materials'][0]; imgs, texs = [], []
def addimg(ti, maxi=0):
    im = j['images'][j['textures'][ti]['source']]; v = j['bufferViews'][im['bufferView']]
    pil = Image.open(io.BytesIO(bin0[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']])).convert('RGB')
    if maxi and max(pil.size) > maxi: pil = pil.resize((maxi, maxi), Image.LANCZOS)
    buf = io.BytesIO(); pil.save(buf, 'JPEG', quality=JQ, optimize=True); data = buf.getvalue()
    while len(out_bin) % 4: out_bin.append(0)
    off = len(out_bin); out_bin.extend(data); views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data)})
    imgs.append({'bufferView': len(views) - 1, 'mimeType': 'image/jpeg'}); texs.append({'source': len(imgs) - 1, 'sampler': 0})
    return len(texs) - 1
pbr = mat.get('pbrMetallicRoughness', {}); newmat = {'name': mat.get('name', 'm'), 'pbrMetallicRoughness': {}}
if 'baseColorTexture' in pbr: newmat['pbrMetallicRoughness']['baseColorTexture'] = {'index': addimg(pbr['baseColorTexture']['index'], TAILLES[0])}
if 'metallicRoughnessTexture' in pbr: newmat['pbrMetallicRoughness']['metallicRoughnessTexture'] = {'index': addimg(pbr['metallicRoughnessTexture']['index'], TAILLES[1])}
if 'normalTexture' in mat: newmat['normalTexture'] = {'index': addimg(mat['normalTexture']['index'], TAILLES[2])}
nj = {'asset': {'version': '2.0', 'generator': 'compacter_glb.py'}, 'extensionsUsed': ['KHR_mesh_quantization'], 'extensionsRequired': ['KHR_mesh_quantization'],
      'scene': j.get('scene', 0), 'scenes': j['scenes'], 'nodes': j['nodes'], 'meshes': [{'name': j['meshes'][0].get('name', 'corps'), 'primitives': [newprim]}],
      'skins': [newskin], 'animations': anims, 'materials': [newmat], 'textures': texs, 'images': imgs,
      'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}],
      'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(out_bin)}]}
while len(out_bin) % 4: out_bin.append(0)
nj['buffers'][0]['byteLength'] = len(out_bin)
js = json.dumps(nj, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(out_bin)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(out_bin), 0x004E4942) + bytes(out_bin)
open(dst, 'wb').write(glb)
print(dst, len(glb), 'octets ;', len(anims), 'animations :', ', '.join(a['name'] for a in anims))
