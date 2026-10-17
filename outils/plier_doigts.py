# Referme les doigts d'un personnage dont le squelette n'a pas d'os de doigts (rig automatique de Meshy) : les sommets du
# gant au-delà des jointures sont pliés vers la paume dans le maillage lui-même (pose de prise permanente : les soldats
# tiennent toujours leur arme). Pliage progressif (comme un doigt : angle proportionnel à la distance aux jointures),
# dans le repère de l'os de la main (+Y vers le bout des doigts) ; le pouce (côté paume, entre la base et le milieu
# de la main) n'est pas plié. Normales tournées de la même façon.
# usage : python3 outils/plier_doigts.py entree.glb sortie.glb [--angle 80] [--jointures 0.085]
import json, struct, sys
import numpy as np

src, dst = sys.argv[1], sys.argv[2]
ANG = np.radians(float(sys.argv[sys.argv.index('--angle') + 1]) if '--angle' in sys.argv else 80)
Y0 = float(sys.argv[sys.argv.index('--jointures') + 1]) if '--jointures' in sys.argv else 0.085
LONG = 0.10                                  # longueur des doigts au-delà des jointures (m)
b = bytearray(open(src, 'rb').read()); L = struct.unpack('<I', b[12:16])[0]; j = json.loads(bytes(b[20:20 + L])); base = 20 + L + 8
CT = {5121: np.uint8, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}; NC = {'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'SCALAR': 1, 'MAT4': 16}
def view(ai):
    a = j['accessors'][ai]; v = j['bufferViews'][a['bufferView']]
    off = base + v.get('byteOffset', 0) + a.get('byteOffset', 0)
    return np.frombuffer(b, CT[a['componentType']], count=a['count'] * NC[a['type']], offset=off).reshape(a['count'], -1)
at = j['meshes'][0]['primitives'][0]['attributes']
P = view(at['POSITION']); N = view(at['NORMAL']); J = view(at['JOINTS_0']); W = view(at['WEIGHTS_0'])
assert P.dtype == np.float32 and N.dtype == np.float32, 'positions et normales en flottants attendues (avant compactage)'
sk = j['skins'][0]; names = [j['nodes'][i]['name'] for i in sk['joints']]
IBM = view(sk['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1).astype(np.float64)
for side, sgn in (('Right', 1), ('Left', -1)):          # paume côté −X (main droite) / +X (main gauche) dans le repère de la main
    k = names.index('mixamorig:%sHand' % side); w = (W * (J == k)).sum(1)
    M = IBM[k]; Mi = np.linalg.inv(M)
    loc = (M[:3, :3] @ P.T).T + M[:3, 3]
    xp = loc[w > 0.3, 0]; dos = xp.max() if sgn > 0 else xp.min()   # dos de la main (opposé à la paume) : pivot des jointures
    pouce = (sgn * loc[:, 0] < -0.045) & (loc[:, 1] < 0.145)
    sel = (w > 0.3) & (loc[:, 1] > Y0) & ~pouce
    s = np.clip((loc[sel, 1] - Y0) / LONG, 0, 1); th = sgn * ANG * s * np.minimum(1, w[sel] / 0.6)
    x = loc[sel, 0] - dos; y = loc[sel, 1] - Y0; c, si = np.cos(th), np.sin(th)
    loc[sel, 0] = dos + c * x - si * y; loc[sel, 1] = Y0 + si * x + c * y
    nl = (M[:3, :3] @ N[sel].T).T; nx, ny = nl[:, 0].copy(), nl[:, 1].copy(); nl[:, 0] = c * nx - si * ny; nl[:, 1] = si * nx + c * ny
    newP = P.copy(); newP[sel] = ((Mi[:3, :3] @ loc[sel].T).T + Mi[:3, 3]).astype(np.float32)
    newN = N.copy(); nn = (Mi[:3, :3] @ nl.T).T; newN[sel] = (nn / np.linalg.norm(nn, axis=1, keepdims=True)).astype(np.float32)
    P[:] = newP; N[:] = newN
    print(side, 'sommets pliés :', int(sel.sum()), '; pouce laissé :', int((pouce & (w > 0.3)).sum()))
a = j['accessors'][at['POSITION']]; a['min'] = P.min(0).tolist(); a['max'] = P.max(0).tolist()
js = json.dumps(j, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
binc = bytes(b[base:])
open(dst, 'wb').write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binc)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(binc), 0x004E4942) + binc)
print(dst)
