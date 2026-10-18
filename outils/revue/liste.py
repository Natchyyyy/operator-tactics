#!/usr/bin/env python3
# Liste de défauts prête à envoyer à un animateur, tirée d'un rapport de revue (banc) :
#   python3 outils/revue/liste.py captures/revue/NOM/rapport.json --partie haut [--top 10] [--avant captures/revue/ANCIEN/rapport.json]
# Regroupe par critère, trie par gravité (majeurs d'abord, puis l'écart à la norme × nombre d'états touchés), donne pour
# chaque critère : les pires états (modèle / état : valeur), la zone attendue, la raison réelle, la source, la preuve.
# --avant : ajoute l'évolution (valeur d'avant → maintenant) et liste les RÉGRESSIONS en tête.
import json, argparse
ap = argparse.ArgumentParser(); ap.add_argument('rapport'); ap.add_argument('--partie'); ap.add_argument('--top', type=int, default=10); ap.add_argument('--avant'); a = ap.parse_args()
R = json.load(open(a.rapport)); V = [v for v in R['verdicts'] if not a.partie or v['partie'] == a.partie]
A = {}
if a.avant:
    for v in json.load(open(a.avant))['verdicts']: A[(v['modele'], v['etat'], v['id'])] = v
f = lambda x: '—' if x is None else (f'{x:.3g}' if abs(x) < 100 else f'{x:.0f}')
rang = {'OK': 0, 'mineur': 1, 'majeur': 2}
if A:
    reg = [v for v in V if (v['modele'], v['etat'], v['id']) in A and rang[v['niveau']] > rang[A[(v['modele'], v['etat'], v['id'])]['niveau']]]
    if reg:
        print('RÉGRESSIONS :')
        for v in reg: o = A[(v['modele'], v['etat'], v['id'])]; print(f"  - {v['id']} {v['modele']}/{v['etat']} : {o['niveau']} {f(o['valeur'])} → {v['niveau']} {f(v['valeur'])}")
        print()
grp = {}
for v in V:
    if v['niveau'] != 'OK': grp.setdefault(v['id'], []).append(v)
cle = lambda kv: (-sum(v['niveau'] == 'majeur' for v in kv[1]), -sum(min(v['ecart'], 20) for v in kv[1]))
for n, (cid, vs) in enumerate(sorted(grp.items(), key=cle)[:a.top], 1):
    v0 = vs[0]; maj = sum(v['niveau'] == 'majeur' for v in vs)
    print(f"{n}. {v0['lib']} [`{cid}`] — {maj} majeurs, {len(vs) - maj} mineurs. Attendu {f(v0['ok'][0])}..{f(v0['ok'][1])} (toléré {f(v0['mineur'][0])}..{f(v0['mineur'][1])}).")
    pires = sorted(vs, key=lambda v: -min(v['ecart'], 50))[:6]
    print('   ' + ' ; '.join(f"{v['modele']}/{v['etat']} {f(v['valeur'])}" + (f" (avant {f(A[(v['modele'], v['etat'], v['id'])]['valeur'])})" if (v['modele'], v['etat'], v['id']) in A else '') for v in pires))
    pr = next((v.get('preuve') for v in pires if v.get('preuve')), None)
    print(f"   Pourquoi : {v0['pourquoi']} ({v0['src']})" + (f"\n   Preuve : {pr} (t = {f(pires[0].get('t'))} s)" if pr else ''))
ok = sorted({v['id'] for v in V if v['niveau'] == 'OK'} - set(grp))
if ok: print('\nDéjà bon partout : ' + ', '.join(ok))
