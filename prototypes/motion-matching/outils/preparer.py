# Fabrique la base de motion matching à partir des BVH (100STYLE re-ciblé « Geno », CC BY 4.0).
#
#   python3 outils/preparer.py donnees/100style/Neutral_*.bvh donnees/100style/Crouched_*.bvh --sortie web/base
#
# Produit web/base.json (méta + statistiques des fiches) et web/base.bin :
#   par image, dans le repère local du personnage (origine = hanches projetées au sol, axe = regard des hanches) :
#     - rotations MONDIALES (yaw retiré) de 22 os, quaternions (x,y,z,w) en int16            22*4*2 =  176 octets
#     - hauteur des hanches (m), vitesse racine locale (3, m/s), vitesse de lacet (rad/s)     5*4   =   20 octets
#     - fiche de 27 nombres (pieds, vitesses, trajectoire future) en float32                  27*4  =  108 octets
#   plus, dans le json : début/fin de chaque séquence, style de chaque séquence (0 debout, 1 accroupi), moyenne/écart-type.
import sys, os, json, argparse, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import bvh

OS = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
      'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
      'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase']
FPS = 30
FUTUR = [10, 20, 30]           # images à 30 fps → 0,33 s, 0,67 s, 1 s
NOMS_FICHE = (['piedG_x', 'piedG_y', 'piedG_z', 'piedD_x', 'piedD_y', 'piedD_z',
               'vPiedG_x', 'vPiedG_y', 'vPiedG_z', 'vPiedD_x', 'vPiedD_y', 'vPiedD_z', 'vHanches_x', 'vHanches_y', 'vHanches_z']
              + [f'traj{k}_{a}' for k in (1, 2, 3) for a in ('x', 'z')] + [f'dir{k}_{a}' for k in (1, 2, 3) for a in ('x', 'z')])

def yaw_quat(q):
    """quaternion de lacet (rotation autour de Y) qui contient le « regard » des hanches : avant local = +Z."""
    fwd = bvh.qrot(q, np.broadcast_to(np.array([0., 0., 1.]), q.shape[:-1] + (3,)))
    a = np.arctan2(fwd[..., 0], fwd[..., 2])
    out = np.zeros(q.shape[:-1] + (4,)); out[..., 1] = np.sin(a / 2); out[..., 3] = np.cos(a / 2)
    return out, a

def traiter(chemin, style):
    sq, rot, pos, fps = bvh.lire_bvh(chemin)
    pas = int(round(fps / FPS)); rot, pos = rot[::pas], pos[::pas]
    noms = sq['noms']; gp, gq = bvh.cinematique_directe(sq, rot, pos)
    gp = gp / 100.0                                     # cm → m
    idx = [noms.index(n) for n in OS]
    F = len(rot)
    hips = gp[:, noms.index('Hips')]
    qy, yaw = yaw_quat(gq[:, noms.index('Hips')])
    inv = bvh.qinv(qy)
    # repère local
    orig = hips.copy(); orig[:, 1] = 0
    def loc(p): return bvh.qrot(inv, p - orig)
    def locv(v): return bvh.qrot(inv, v)
    dt = 1.0 / FPS
    vel = lambda p: np.gradient(p, dt, axis=0)
    pG, pD = gp[:, noms.index('LeftFoot')], gp[:, noms.index('RightFoot')]
    tG, tD = gp[:, noms.index('LeftToeBase')], gp[:, noms.index('RightToeBase')]
    vH = vel(hips)
    # vitesse de lacet (dérivée déroulée)
    dyaw = np.gradient(np.unwrap(yaw), dt)
    # trajectoire future
    fiche = np.zeros((F, len(NOMS_FICHE)), np.float32)
    fiche[:, 0:3] = loc(pG); fiche[:, 3:6] = loc(pD)
    fiche[:, 6:9] = locv(vel(pG)); fiche[:, 9:12] = locv(vel(pD)); fiche[:, 12:15] = locv(vH)
    for k, f in enumerate(FUTUR):
        j = np.minimum(np.arange(F) + f, F - 1)
        fiche[:, 15 + 2 * k:17 + 2 * k] = loc(orig[j])[:, [0, 2]]
        d = bvh.qrot(inv, bvh.qrot(qy[j], np.broadcast_to(np.array([0., 0., 1.]), (F, 3))))
        fiche[:, 21 + 2 * k:23 + 2 * k] = d[:, [0, 2]]
    # rotations mondiales yaw retiré
    q = bvh.qmul(inv[:, None, :], gq[:, idx])
    # contacts des pieds (pour l'indicateur) : orteils bas et lents
    vT = np.stack([np.linalg.norm(vel(tG), axis=1), np.linalg.norm(vel(tD), axis=1)], 1)
    hT = np.stack([tG[:, 1], tD[:, 1]], 1)
    contact = (hT < hT.min() + 0.06) & (vT < 0.35)
    corps = {'q': q, 'hy': hips[:, 1], 'v': locv(vH), 'w': dyaw, 'fiche': fiche, 'contact': contact,
             'orteilsY': hT, 'style': style, 'F': F, 'nom': os.path.basename(chemin)}
    return corps

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('fichiers', nargs='+'); ap.add_argument('--sortie', default='web/base'); ap.add_argument('--parties', type=int, default=1); ap.add_argument('--bind', default='/home/claude/orangeduck/100style-retarget/Geno_bind.bvh')
    a = ap.parse_args()
    seqs = []
    for f in a.fichiers:
        nb = os.path.basename(f); style = 1 if 'Crouched' in nb else 2 if ('Swat' in nb or 'Rushed' in nb) else 3 if 'StartStop' in nb else 0   # 2 = arme (Swat marche d'intervention + Rushed course basse)
        c = traiter(f, style); seqs.append(c)
        print(f"{c['nom']:22s} {c['F']:6d} images  hanches {c['hy'].mean():.2f} m  vitesse moy {np.linalg.norm(c['v'][:, [0, 2]], axis=1).mean():.2f} m/s  contact {c['contact'].mean() * 100:.0f} %", flush=True)
    fiche = np.concatenate([c['fiche'] for c in seqs]); moy = fiche.mean(0); ect = fiche.std(0) + 1e-6
    N = len(fiche)
    # écriture binaire : image par image, structure fixe
    meta_octets = 22 * 4 * 2 + 5 * 4 + len(NOMS_FICHE) * 4
    out = bytearray()
    for c in seqs:
        qi = np.clip(np.round(c['q'] * 32767), -32767, 32767).astype('<i2')           # (F,22,4)
        divers = np.stack([c['hy'], c['v'][:, 0], c['v'][:, 1], c['v'][:, 2], c['w']], 1).astype('<f4')
        for i in range(c['F']):
            out += qi[i].tobytes(); out += divers[i].tobytes(); out += c['fiche'][i].astype('<f4').tobytes()
    # écriture en N parties de taille égale (limite de 16 Mo par fichier chez l'hébergeur)
    npart = max(1, a.parties); taille = (len(out) + npart - 1) // npart; taille -= taille % meta_octets
    parties = []
    for k in range(npart):
        morceau = out[k * taille:(k + 1) * taille] if k < npart - 1 else out[k * taille:]
        nom = a.sortie + ('.bin' if npart == 1 else f'.{k}.bin'); open(nom, 'wb').write(morceau); parties.append(os.path.basename(nom))
    deb = 0; sequences = []
    for c in seqs:
        sequences.append({'nom': c['nom'], 'debut': deb, 'fin': deb + c['F'], 'style': c['style']}); deb += c['F']
    contact = np.concatenate([c['contact'] for c in seqs]).astype(np.uint8)
    # pose de liaison (T-pose) du squelette Geno : positions mondiales des os et de leurs « enfants de direction »
    bind = {}
    if a.bind:
        sqb, rb, pb, _ = bvh.lire_bvh(a.bind); gpb, gqb = bvh.cinematique_directe(sqb, rb, pb); gpb = gpb[0] / 100.0; gqb = gqb[0]
        qyb, yawb = yaw_quat(gqb[sqb['noms'].index('Hips')][None])
        print(f"pose de liaison Geno : lacet des hanches {float(yawb[0]) * 180 / 3.14159:.1f}°, mains y {gpb[sqb['noms'].index('LeftHand'), 1]:.2f} m")
        ENFANT = {'Hips': 'Spine', 'Head': 'HeadEnd', 'LeftHand': 'LeftHandMiddle1', 'RightHand': 'RightHandMiddle1',
                  'LeftToeBase': 'LeftToeBaseEnd', 'RightToeBase': 'RightToeBaseEnd', 'Spine2': 'Spine3'}
        for n in OS:
            e = ENFANT.get(n) or next((c for c, p in zip(sqb['noms'], sqb['parents']) if p == sqb['noms'].index(n) and not c.endswith('End')), None)
            bind[n] = {'pos': gpb[sqb['noms'].index(n)].round(4).tolist(), 'quat': gqb[sqb['noms'].index(n)].round(5).tolist(), 'enfant': e, 'posEnfant': gpb[sqb['noms'].index(e)].round(4).tolist()}
    meta = {'fps': FPS, 'os': OS, 'futur': FUTUR, 'bind': bind, 'nFiche': len(NOMS_FICHE), 'nomsFiche': NOMS_FICHE, 'N': N,
            'octetsParImage': meta_octets, 'parties': parties,
            'moyenne': moy.tolist(), 'ecartType': ect.tolist(), 'sequences': sequences,
            'contact': ''.join(str(int(x[0] * 2 + x[1])) for x in np.concatenate([c['contact'] for c in seqs])),
            'licence': '100STYLE dataset (Ian Mason, CC BY 4.0), retargeted by Daniel Holden (CC BY 4.0)'}
    json.dump(meta, open(a.sortie + '.json', 'w'))
    print(f"{N} images → {len(out) / 1e6:.1f} Mo en {npart} partie(s), méta {os.path.getsize(a.sortie + '.json') / 1e3:.0f} ko")

if __name__ == '__main__': main()
