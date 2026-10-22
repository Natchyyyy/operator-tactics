# Rassemble les bruitages du jeu : sons de synthèse (sons/out, fabriqués par sons_ot.py) et sons tirés de vrais
# enregistrements (sons/out_vrais, fabriqués par vrais.py), puis
#   1) met l'ESSENTIEL dans la page : bloc <!--SONS--> … <!--/SONS--> de web/index.html (peu de variantes, boucles courtes) ;
#   2) met le RESTE dans web/hd/sons_hd.json (même format) : longues ambiances, toutes les variantes ; chargé après coup
#      par web/lecteur.js, qui garde les sons inclus si le paquet est absent.
# usage : python3 sons/assembler.py
import os, json, base64, re
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
SYN, VRAI = os.path.join(HERE, 'out'), os.path.join(HERE, 'out_vrais')
man_s = json.load(open(os.path.join(SYN, 'manifeste.json'))); man_v = json.load(open(os.path.join(VRAI, 'manifeste.json')))
# sons de synthèse remplacés par de vrais enregistrements (ou devenus inutiles : une seule arme, le fusil d'assaut 5,56)
RETIRES = {'tir_fusil', 'tir_pm', 'tir_precision', 'tir_mitrailleuse', 'tir_pompe'}
# dans la page : nom → nombre de variantes (None = toutes)
PAGE = {
  'tir_556_proche': 3, 'tir_556_moyen': 2, 'tir_556_loin': 2, 'tir_silencieux': 2, 'claquement': 2, 'sifflement': 2, 'ricochet': 2,
  'impact_beton': 3, 'impact_metal': 3, 'impact_carrosserie': 3, 'impact_verre': 2, 'impact_bois': 2, 'impact_corps': 3, 'impact_sol': 3,
  'impact_plaque': 2, 'impact_casque': 2, 'impact_pneu': 1, 'impact_proche': 2, 'vitre_eclat': 1, 'cliquetis_verre': 1,
  'douilles': 3, 'recharge': 2, 'chute': 2, 'equipement': 2, 'pas': None, 'pas_mouille': 3,
  'explosion': 2, 'explosion_lourde': 1, 'flashbang': None, 'grenade_rebond': None,
  'pluie_courte': None, 'vent_court': None, 'ambiance_port': None, 'ambiance_ville': None,
  'clic': None, 'contact': None, 'victoire': None, 'defaite': None, 'musique_titre': None, 'musique_qg': None, 'musique_bataille': None,
}
def fichiers(nom):
    if nom in man_v: return [os.path.join(VRAI, f) for f in man_v[nom]]
    if nom in man_s and nom not in RETIRES: return [os.path.join(SYN, f) for f in man_s[nom]]
    return []
b64 = lambda f: base64.b64encode(open(f, 'rb').read()).decode()
tous = sorted((set(man_s) - RETIRES) | set(man_v))
page = {}
for nom, n in PAGE.items():
    fs = fichiers(nom); assert fs, nom; page[nom] = [b64(f) for f in fs[:n]]
hd = {}
for nom in tous:
    fs = fichiers(nom)
    if nom in PAGE and (PAGE[nom] is None or PAGE[nom] >= len(fs)): continue   # déjà tout dans la page
    hd[nom] = [b64(f) for f in fs]
manque = [n for n in tous if n not in page and n not in hd]; assert not manque, manque
# 1) la page
p = os.path.join(ROOT, 'web', 'index.html'); s = open(p, encoding='utf-8').read()
blk = '<!--SONS--><script type="text/plain" id="sons-data">' + json.dumps(page, separators=(',', ':')) + '</script><!--/SONS-->\n'
assert '<!--SONS-->' in s; s = re.sub(r'<!--SONS-->.*?<!--/SONS-->\n', lambda m: blk, s, count=1, flags=re.S); open(p, 'w', encoding='utf-8').write(s)
# 2) le paquet complémentaire
os.makedirs(os.path.join(ROOT, 'web', 'hd'), exist_ok=True)
txt = json.dumps(hd, separators=(',', ':')); open(os.path.join(ROOT, 'web', 'hd', 'sons_hd.json'), 'w').write(txt)
print(f"page : {len(page)} sons, {len(blk)/1024:.0f} Ko ; paquet hd/sons_hd.json : {len(hd)} sons, {len(txt)/1024:.0f} Ko")
print("dans le paquet seulement :", sorted(set(hd) - set(page)))
