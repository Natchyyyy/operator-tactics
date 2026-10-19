# Lecteur de fichiers BVH → tableaux numpy (squelette + rotations locales en quaternions + position de la racine).
# Indépendant du jeu. Utilisé par preparer.py pour fabriquer la base de motion matching.
#
#   sq, rot, pos, fps = lire_bvh("Neutral_FW.bvh")
#     sq   : {"noms": [...], "parents": [...], "offsets": (J,3)}      — offsets en unités du fichier (cm pour 100STYLE)
#     rot  : (F, J, 4) quaternions locaux (x, y, z, w), ordre three.js
#     pos  : (F, 3)    position locale de la racine (unités du fichier)
#     fps  : images par seconde
import numpy as np, re

def _quat_from_euler(deg, ordre):
    """Quaternions (x,y,z,w) à partir d'angles d'Euler intrinsèques appliqués dans l'ordre BVH (ex. 'ZYX' = Rz·Ry·Rx)."""
    r = np.radians(deg)
    q = np.tile(np.array([0., 0., 0., 1.]), (len(r), 1))
    for i, ax in enumerate(ordre):
        h = r[:, i] / 2
        c, s = np.cos(h), np.sin(h)
        qa = np.zeros((len(r), 4)); qa[:, 3] = c; qa[:, 'XYZ'.index(ax)] = s
        q = _qmul(q, qa)   # q = q · qa  (le premier canal est la rotation la plus externe)
    return q

def _qmul(a, b):
    ax, ay, az, aw = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    bx, by, bz, bw = b[..., 0], b[..., 1], b[..., 2], b[..., 3]
    return np.stack([aw*bx + ax*bw + ay*bz - az*by,
                     aw*by - ax*bz + ay*bw + az*bx,
                     aw*bz + ax*by - ay*bx + az*bw,
                     aw*bw - ax*bx - ay*by - az*bz], -1)

def qmul(a, b): return _qmul(a, b)
def qinv(q): r = q.copy(); r[..., :3] *= -1; return r
def qrot(q, v):
    """applique q (…,4) à v (…,3)"""
    u, w = q[..., :3], q[..., 3:4]
    t = 2 * np.cross(u, v)
    return v + w * t + np.cross(u, t)

def lire_bvh(chemin):
    txt = open(chemin, encoding="utf-8", errors="ignore").read()
    i_motion = txt.index("MOTION")
    hier, motion = txt[:i_motion], txt[i_motion:]
    noms, parents, offsets, canaux = [], [], [], []
    pile = []
    for ligne in hier.splitlines():
        t = ligne.split()
        if not t: continue
        if t[0] in ("ROOT", "JOINT"):
            noms.append(t[1]); parents.append(pile[-1] if pile else -1); offsets.append([0, 0, 0]); canaux.append([])
            pile.append(len(noms) - 1)
        elif t[0] == "End":
            noms.append(noms[pile[-1]] + "_End"); parents.append(pile[-1]); offsets.append([0, 0, 0]); canaux.append([])
            pile.append(len(noms) - 1)
        elif t[0] == "OFFSET": offsets[pile[-1]] = [float(x) for x in t[1:4]]
        elif t[0] == "CHANNELS": canaux[pile[-1]] = t[2:2 + int(t[1])]
        elif t[0] == "}": pile.pop()
    lignes = motion.splitlines()
    nF = int(re.search(r"Frames:\s*(\d+)", motion).group(1))
    dt = float(re.search(r"Frame Time:\s*([\d.eE+-]+)", motion).group(1))
    data = np.array([[float(x) for x in l.split()] for l in lignes[3:3 + nF] if l.strip()], dtype=np.float64)
    J = len(noms)
    rot = np.tile(np.array([0., 0., 0., 1.]), (len(data), J, 1))
    pos = np.zeros((len(data), 3))
    k = 0
    for j, ch in enumerate(canaux):
        if not ch: continue
        n = len(ch); bloc = data[:, k:k + n]; k += n
        pidx = [i for i, c in enumerate(ch) if c.endswith("position")]
        ridx = [i for i, c in enumerate(ch) if c.endswith("rotation")]
        if pidx and j == 0:
            pos = np.stack([bloc[:, [i for i in pidx if ch[i][0] == a][0]] for a in "XYZ"], -1)
        if ridx:
            ordre = "".join(ch[i][0] for i in ridx)
            rot[:, j] = _quat_from_euler(bloc[:, ridx], ordre)
    sq = {"noms": noms, "parents": parents, "offsets": np.array(offsets)}
    return sq, rot, pos, round(1 / dt)

def cinematique_directe(sq, rot, pos):
    """positions mondiales (F,J,3) et rotations mondiales (F,J,4)."""
    F, J = rot.shape[:2]
    gp = np.zeros((F, J, 3)); gq = np.zeros((F, J, 4))
    for j in range(J):
        p = sq["parents"][j]
        if p < 0:
            gq[:, j] = rot[:, j]; gp[:, j] = pos
        else:
            gq[:, j] = qmul(gq[:, p], rot[:, j])
            gp[:, j] = gp[:, p] + qrot(gq[:, p], np.broadcast_to(sq["offsets"][j], (F, 3)))
    return gp, gq

if __name__ == "__main__":
    import sys
    sq, rot, pos, fps = lire_bvh(sys.argv[1])
    gp, gq = cinematique_directe(sq, rot, pos)
    print(f"{len(sq['noms'])} os, {rot.shape[0]} images à {fps} fps ; racine y moyen {pos[:,1].mean():.1f} ; pied G y min {gp[:, sq['noms'].index('LeftFoot'), 1].min():.1f}")
