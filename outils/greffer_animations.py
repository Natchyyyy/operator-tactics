# Prépare un personnage riggé par Meshy pour le jeu à partir d'un autre personnage déjà animé (même squelette Mixamo) :
#  1. les os « en trop » que l'auto-rig de Meshy ajoute parfois (Bone_xxx : un deuxième bras, le devant du gilet, le col)
#     ne sont pas animés par les animations Mixamo : leurs poids sont rendus à l'os Mixamo le plus proche (segment
#     tête → enfant le plus proche du centre des sommets qu'ils portent). Un sommet garde la même position au repos,
#     puisque chaque os a sa propre matrice de liaison ;
#  2. les animations du personnage source sont transférées : pour chaque os b de parent p,
#        L_cible(b, t) = C_p⁻¹ · L_source(b, t) · C_b,   C_b = G_source_repos(b)⁻¹ · G_cible_repos(b)
#     (G = rotation dans le monde de la pose de liaison, tirée des matrices de liaison inverses) : chaque os fait le
#     même mouvement relatif à sa pose de repos. La translation du bassin est mise à l'échelle de la taille du bassin.
#     Les os absents de la cible (doigts) sont ignorés.
#  3. (cible au squelette complet) les animations propres à la cible qui n'existent pas dans la source sont gardées
#     telles quelles (ex. pas de côté, marche arrière ajoutés depuis la bibliothèque de Meshy) ;
#  4. --doigts : les os des doigts (absents des animations Mixamo transférées) reçoivent une pose de prise fixe dans
#     chaque animation : chaque phalange tourne vers la paume (axe = direction du doigt × normale de la paume) ;
#     l'index droit reste plus ouvert (sur la détente). Jusqu'à 8 influences d'os par sommet sont lues (JOINTS_1).
# usage : python3 outils/greffer_animations.py cible_riggee.glb source_animee.glb sortie.glb [--doigts]
import json, struct, sys
import numpy as np

def load(p):
    b = open(p, 'rb').read(); L = struct.unpack('<I', b[12:16])[0]
    return json.loads(b[20:20 + L]), b[20 + L + 8:]
CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
def reader(j, bin0):
    def read(ai):
        a = j['accessors'][ai]; v = j['bufferViews'][a['bufferView']]; dt = CT[a['componentType']]; n = NC[a['type']]
        off = v.get('byteOffset', 0) + a.get('byteOffset', 0); stride = v.get('byteStride', 0); size = np.dtype(dt).itemsize * n
        if stride and stride != size:
            out = np.stack([np.frombuffer(bin0, dt, count=n, offset=off + i * stride) for i in range(a['count'])])
        else:
            out = np.frombuffer(bin0, dt, count=a['count'] * n, offset=off).reshape(a['count'], n)
        if a.get('normalized'): out = out.astype(np.float32) / np.iinfo(dt).max
        return out
    return read

# quaternions [x, y, z, w]
def qmul(a, b):
    ax, ay, az, aw = np.moveaxis(a, -1, 0); bx, by, bz, bw = np.moveaxis(b, -1, 0)
    return np.stack([aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
                     aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz], -1)
def qinv(a): return a * np.array([-1, -1, -1, 1.0])
def mat2q(m):
    m = m[:3, :3] / np.linalg.norm(m[:3, :3], axis=0)
    t = np.trace(m)
    if t > 0:
        s = 0.5 / np.sqrt(t + 1); return np.array([(m[2, 1] - m[1, 2]) * s, (m[0, 2] - m[2, 0]) * s, (m[1, 0] - m[0, 1]) * s, 0.25 / s])
    i = np.argmax(np.diag(m)); jx, kx = (i + 1) % 3, (i + 2) % 3
    s = 2 * np.sqrt(1 + m[i, i] - m[jx, jx] - m[kx, kx]); q = np.zeros(4)
    q[i] = 0.25 * s; q[jx] = (m[jx, i] + m[i, jx]) / s; q[kx] = (m[kx, i] + m[i, kx]) / s; q[3] = (m[kx, jx] - m[jx, kx]) / s
    return q

tgt_p, src_p, dst = sys.argv[1:4]
T, Tb = load(tgt_p); S, Sb = load(src_p); rT, rS = reader(T, Tb), reader(S, Sb)
def rig(j, read):
    sk = j['skins'][0]; names = [j['nodes'][i]['name'] for i in sk['joints']]
    ibm = read(sk['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)      # colonnes glTF → lignes
    world = np.linalg.inv(ibm)
    par = {c: i for i, n in enumerate(j['nodes']) for c in n.get('children', [])}
    return {n: {'node': sk['joints'][k], 'k': k, 'q': mat2q(world[k]), 'pos': world[k][:3, 3],
                'parent': j['nodes'][par[sk['joints'][k]]]['name'] if sk['joints'][k] in par else None} for k, n in enumerate(names)}
RT, RS = rig(T, rT), rig(S, rS)
mix = [n for n in RT if n.startswith('mixamorig')]

# ---- 1. poids des os en trop → os Mixamo le plus proche
prim = T['meshes'][0]['primitives'][0]; at = prim['attributes']
P = rT(at['POSITION']).astype(np.float64); J = rT(at['JOINTS_0']).astype(np.int64); W = rT(at['WEIGHTS_0']).astype(np.float64)
if 'JOINTS_1' in at:
    J = np.concatenate([J, rT(at['JOINTS_1']).astype(np.int64)], 1); W = np.concatenate([W, rT(at['WEIGHTS_1']).astype(np.float64)], 1)
DOIGTS = 'mixamorig:LeftHandIndex1' in RT
kids = {n: [m for m in mix if RT[m]['parent'] == n and not m.endswith('_End')] for n in mix}
def seg(n):
    a = RT[n]['pos']
    if kids[n]: b = np.mean([RT[m]['pos'] for m in kids[n]], 0)
    else:
        p = RT[n]['parent']; d = a - RT[p]['pos'] if p in RT else np.array([0, 0.1, 0]); b = a + d / max(np.linalg.norm(d), 1e-6) * 0.09
    return a, b
def dseg(c, n):
    a, b = seg(n); ab = b - a; t = np.clip(np.dot(c - a, ab) / max(np.dot(ab, ab), 1e-9), 0, 1); return np.linalg.norm(c - (a + t * ab))
names = list(RT); remap = {}
for n in names:
    if n in mix and (DOIGTS or not n.startswith('mixamorig:LeftHandMiddle')): continue
    k = RT[n]['k']; m = J == k; w = (W * m).sum()
    if n.startswith('mixamorig:LeftHandMiddle'): remap[k] = RT['mixamorig:LeftHand']['k']; continue
    if w < 1e-6:
        p = RT[n]['parent']
        while p not in mix: p = RT[p]['parent']
        remap[k] = RT[p]['k']; continue
    c = ((W * m)[:, :, None] * P[:, None, :]).sum((0, 1)) / w
    best = min((m2 for m2 in mix if not m2.endswith('_End') and (DOIGTS or 'HandMiddle' not in m2)), key=lambda m2: dseg(c, m2))
    remap[k] = RT[best]['k']; print(f'{n:12s} poids {w:7.0f} centre {np.round(c, 2)} → {best}')
J2 = J.copy()
for a, b in remap.items(): J2[J == a] = b
# fusion des doublons dans les 4 influences
Jn = np.zeros((len(J2), 4), np.int64); Wn = np.zeros((len(J2), 4))
for v in range(len(J2)):
    acc = {}
    for jj, ww in zip(J2[v], W[v]):
        if ww > 0: acc[jj] = acc.get(jj, 0) + ww
    it = sorted(acc.items(), key=lambda x: -x[1])[:4]
    for i, (jj, ww) in enumerate(it): Jn[v, i] = jj; Wn[v, i] = ww
Wn /= np.maximum(Wn.sum(1, keepdims=True), 1e-9)

# ---- 2. animations transférées
hipsT, hipsS = RT['mixamorig:Hips']['pos'][1], RS['mixamorig:Hips']['pos'][1]; kH = hipsT / hipsS
C = {n: qmul(qinv(RS[n]['q']), RT[n]['q']) for n in RT if n in RS}
ident = np.array([0, 0, 0, 1.0])
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
        a2 = arr.reshape(arr.shape[0], -1).astype(np.float64); a['min'] = a2.min(0).tolist(); a['max'] = a2.max(0).tolist()
    accs.append(a); return len(accs) - 1
anims = []
for an in S['animations']:
    samplers, channels = [], []
    for ch in an['channels']:
        s = an['samplers'][ch['sampler']]; path = ch['target']['path']; nm = S['nodes'][ch['target']['node']]['name']
        if nm not in RT or path not in ('rotation', 'translation'): continue
        if DOIGTS and 'Hand' in nm and any(f in nm for f in ('Thumb', 'Index', 'Middle', 'Ring', 'Pinky')): continue
        t = rS(s['input']).reshape(-1).astype(np.float32); v = rS(s['output']).astype(np.float64)
        if path == 'rotation':
            p = RT[nm]['parent']; Cp = C.get(p, ident) if p in RS else ident
            q = qmul(qmul(qinv(Cp)[None], v), C[nm][None]); q /= np.linalg.norm(q, axis=1, keepdims=True)
            out = add(q.astype(np.float32), 5126, 'VEC4')
        else:
            if nm != 'mixamorig:Hips': continue
            out = add((v * kH).astype(np.float32), 5126, 'VEC3')
        samplers.append({'input': add(t.reshape(-1, 1), 5126, 'SCALAR', minmax=True), 'output': out, 'interpolation': s.get('interpolation', 'LINEAR')})
        channels.append({'sampler': len(samplers) - 1, 'target': {'node': RT[nm]['node'], 'path': path}})
    anims.append({'name': an['name'], 'samplers': samplers, 'channels': channels})
noms = {a['name'] for a in anims}
for an in T.get('animations', []):
    if an['name'] in noms: continue
    samplers, channels = [], []
    for ch in an['channels']:
        s = an['samplers'][ch['sampler']]; path = ch['target']['path']; nm = T['nodes'][ch['target']['node']]['name']
        if path not in ('rotation', 'translation') or (path == 'translation' and nm != 'mixamorig:Hips'): continue
        if nm not in RT or 'Hand' in nm and any(f in nm for f in ('Thumb', 'Index', 'Middle', 'Ring', 'Pinky')): continue
        t = rT(s['input']).reshape(-1).astype(np.float32); v = rT(s['output']).astype(np.float32)
        samplers.append({'input': add(t.reshape(-1, 1), 5126, 'SCALAR', minmax=True), 'output': add(v, 5126, 'VEC4' if path == 'rotation' else 'VEC3'),
                         'interpolation': s.get('interpolation', 'LINEAR')})
        channels.append({'sampler': len(samplers) - 1, 'target': {'node': RT[nm]['node'], 'path': path}})
    anims.append({'name': an['name'], 'samplers': samplers, 'channels': channels}); print('animation de la cible gardée :', an['name'])
if DOIGTS and '--doigts' in sys.argv:
    def qaxe(ax, th): ax = ax / np.linalg.norm(ax); return np.concatenate([ax * np.sin(th / 2), [np.cos(th / 2)]])
    def rotm(q):
        x, y, z, w = q; return np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)], [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)], [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
    pose = {}
    for side in ('Left', 'Right'):
        g = lambda n: RT['mixamorig:%s%s' % (side, n)]['pos']
        nrm = np.cross(g('HandIndex1') - g('HandPinky1'), g('HandMiddle1') - g('Hand')); nrm /= np.linalg.norm(nrm)
        if np.dot(g('HandThumb3') - g('HandMiddle1'), nrm) < 0: nrm = -nrm          # la paume est du côté du pouce
        print(side, 'normale de la paume', np.round(nrm, 2))
        ANG = {'Index': [45, 60, 45] if side == 'Left' else [22, 30, 22], 'Middle': [55, 70, 50], 'Ring': [58, 72, 50], 'Pinky': [60, 72, 50], 'Thumb': [10, 18, 14]}
        for f, angs in ANG.items():
            for i in (1, 2, 3):
                nm = 'mixamorig:%sHand%s%d' % (side, f, i); nxt = 'mixamorig:%sHand%s%d' % (side, f, i + 1)
                if nm not in RT or nxt not in RT: continue
                d = RT[nxt]['pos'] - RT[nm]['pos']; d /= np.linalg.norm(d)
                axw = np.cross(d, nrm)
                if f == 'Thumb': axw = np.cross(d, nrm) * 0.5 + np.cross(d, g('HandMiddle1') - g('Hand')) * 0.5
                axl = rotm(RT[nm]['q']).T @ axw                        # axe dans le repère de l'os (pose de liaison)
                node = T['nodes'][RT[nm]['node']]; q0 = np.array(node.get('rotation', [0, 0, 0, 1.0]))
                pose[nm] = qmul(q0, qaxe(axl, np.radians(angs[i - 1])))
    for a in anims:
        t = a['samplers'][0]['input'] if a['samplers'] else None
        tin = add(np.array([[0.0]], np.float32), 5126, 'SCALAR', minmax=True)
        for nm, q in pose.items():
            a['samplers'].append({'input': tin, 'output': add(q[None].astype(np.float32), 5126, 'VEC4'), 'interpolation': 'STEP'})
            a['channels'].append({'sampler': len(a['samplers']) - 1, 'target': {'node': RT[nm]['node'], 'path': 'rotation'}})
    print('doigts en position de prise :', len(pose), 'phalanges')

# ---- écriture : maillage (poids corrigés), squelette, matériau et images d'origine
na = {'POSITION': add(rT(at['POSITION']), 5126, 'VEC3', 34962, minmax=True), 'NORMAL': add(rT(at['NORMAL']), 5126, 'VEC3', 34962),
      'TEXCOORD_0': add(rT(at['TEXCOORD_0']), 5126, 'VEC2', 34962), 'JOINTS_0': add(Jn, 5123, 'VEC4', 34962),
      'WEIGHTS_0': add(Wn.astype(np.float32), 5126, 'VEC4', 34962)}
idx = rT(prim['indices']).reshape(-1)
newprim = {'attributes': na, 'indices': add(idx, 5125, 'SCALAR', 34963), 'material': prim.get('material', 0)}
sk = dict(T['skins'][0]); sk['inverseBindMatrices'] = add(rT(T['skins'][0]['inverseBindMatrices']), 5126, 'MAT4')
imgs = []
for im in T['images']:
    v = T['bufferViews'][im['bufferView']]; data = Tb[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
    while len(out_bin) % 4: out_bin.append(0)
    off = len(out_bin); out_bin.extend(data); views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data)})
    imgs.append({'bufferView': len(views) - 1, 'mimeType': im.get('mimeType', 'image/png'), 'name': im.get('name', '')})
nj = {'asset': {'version': '2.0', 'generator': 'greffer_animations.py'}, 'scene': T.get('scene', 0), 'scenes': T['scenes'], 'nodes': T['nodes'],
      'meshes': [{'name': T['meshes'][0].get('name', 'corps'), 'primitives': [newprim]}], 'skins': [sk], 'animations': anims,
      'materials': T['materials'], 'textures': T['textures'], 'images': imgs, 'samplers': T.get('samplers', [{}]),
      'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': 0}]}
while len(out_bin) % 4: out_bin.append(0)
nj['buffers'][0]['byteLength'] = len(out_bin)
js = json.dumps(nj, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
open(dst, 'wb').write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(out_bin)) + struct.pack('<II', len(js), 0x4E4F534A) + js
                      + struct.pack('<II', len(out_bin), 0x004E4942) + bytes(out_bin))
print(dst, 'animations :', ', '.join(a['name'] for a in anims), '; bassin ×', round(kH, 3))
