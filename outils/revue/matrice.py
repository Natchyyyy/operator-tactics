#!/usr/bin/env python3
# Tableau compact d'un rapport : pour chaque critère, la valeur mesurée par état (g = gign, s = soldat) ; * = mineur, ** = majeur.
#   python3 outils/revue/matrice.py captures/revue/r1/rapport.json [--critere id1,id2] [--partie haut|bas]
import json, sys, argparse
ap = argparse.ArgumentParser(); ap.add_argument('rapport'); ap.add_argument('--critere'); ap.add_argument('--partie'); a = ap.parse_args()
R = json.load(open(a.rapport)); V = R['verdicts']
ids = []; [ids.append(v['id']) for v in V if v['id'] not in ids]
if a.critere: ids = [i for i in ids if i in a.critere.split(',')]
etats = []; [etats.append(v['etat']) for v in V if v['etat'] not in etats]
def f(v):
    x = v['valeur']; s = f'{x:.3g}' if abs(x) < 100 else f'{x:.0f}'
    return s + ('' if v['niveau'] == 'OK' else '*' if v['niveau'] == 'mineur' else '**')
for i in ids:
    vs = [v for v in V if v['id'] == i]
    if a.partie and vs[0]['partie'] != a.partie: continue
    print(f"\n== {i} ({vs[0]['partie']}) ok {vs[0]['ok']} tol {vs[0]['mineur']} — {vs[0]['lib']}")
    lig = []
    for e in etats:
        g = [v for v in vs if v['etat'] == e and v['modele'] == 'gign']; s = [v for v in vs if v['etat'] == e and v['modele'] == 'soldat']
        if g or s: lig.append(f"{e}: g {f(g[0]) if g else '-'} s {f(s[0]) if s else '-'}")
    print('  ' + ' | '.join(lig))
