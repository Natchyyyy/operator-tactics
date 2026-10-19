# Rubrique de revue d'animation : critères chiffrés tirés de références réelles (voir RUBRIQUE.md pour les sources).
# Chaque critère : id, partie ('haut' = membres supérieurs / arme / tête, 'bas' = locomotion / pieds / jambes), libellé,
# à quels états il s'applique (étiquettes), comment extraire la valeur mesurée, l'intervalle OK et l'intervalle « mineur »
# (au-delà : majeur), la raison dans la vraie vie, la source, et les vues qui servent de preuve.
import math

# étiquettes des états du banc (outils/revue/banc.html)
ETIQ = {
    'repos_garde_basse': {'arret', 'garde_basse'},
    'repos_visee': {'arret', 'vise'},
    'tir_arret': {'arret', 'vise', 'tir'},
    'guet': {'arret', 'vise', 'guet'},
    'guet_accroupi': {'arret', 'vise', 'guet', 'accroupi'},
    'patrouille': {'marche', 'garde_basse', 'avant'},
    'patrouille_lente': {'marche', 'garde_basse', 'avant'},
    'marche_visee': {'marche', 'vise', 'avant'},
    'marche_visee_diagG': {'marche', 'vise', 'diag'},
    'marche_visee_diagD': {'marche', 'vise', 'diag'},
    'pas_chasse_G': {'marche', 'vise', 'lateral'},
    'pas_chasse_D': {'marche', 'vise', 'lateral'},
    'pas_chasse_lent_G': {'marche', 'vise', 'lateral'},
    'recul_vise': {'marche', 'vise', 'recul'},
    'recul_diagD': {'marche', 'vise', 'recul'},
    'jog_bas': {'course', 'garde_basse', 'avant'},
    'jog_vise': {'course', 'vise', 'avant'},
    'sprint': {'course', 'sprint', 'garde_basse', 'avant'},
    'jog_vise_diagG': {'course', 'vise', 'diag'},
    'jog_vise_lateralD': {'course', 'vise', 'lateral'},
    'jog_vise_recul': {'course', 'vise', 'recul'},
    'jog_bas_rapide': {'course', 'garde_basse', 'avant'},
    'jog_bas_24': {'course', 'garde_basse', 'avant'},
    'accroupi': {'arret', 'accroupi', 'vise'},
    'marche_accroupie': {'marche', 'accroupi', 'vise', 'avant'},
    'recharge_arret': {'arret', 'recharge'},
    'recharge_marche': {'marche', 'recharge', 'avant'},
    'demi_tour': {'arret', 'vise', 'pivot'},
    'depart_arret': {'transition', 'garde_basse'},
    'depart_arret_vise': {'transition', 'vise'},
    'virage_patrouille': {'marche', 'garde_basse', 'virage'},
    'jeu_jog_bas_oblique': {'course', 'garde_basse', 'diag'},   # (en jeu seulement : petite course garde basse en diagonale / de côté)
}
DEUX_MAINS = lambda e: 'recharge' not in e

def st(r, k, a):
    s = r['bilan'].get('stat', {}).get(k)
    return None if s is None else s[a]

def stat_ou(r, keys, a, f):
    v = [st(r, k, a) for k in keys]; v = [x for x in v if x is not None]
    return f(v) if v else None

def planted(r, s):
    """images où le pied s ('G'/'D') est au sol (point de semelle le plus bas à moins de 2 cm de son minimum)"""
    im = r['images']; ys = sorted(i.get('solMin' + s) for i in im if i.get('solMin' + s) is not None)
    if not ys: return []
    b = min(0.01, ys[int(len(ys) * 0.05)]); return [i for i in im if i.get('solMin' + s) is not None and i['solMin' + s] < b + 0.02]

def moy(v): return sum(v) / len(v) if v else None

def pas_attendu(v):
    # « walk ratio » (longueur de pas / cadence) ≈ 0,0065 m/(pas/min) chez l'adulte (Sekiya & Nagasaki 1998) :
    # L = sqrt(v · 60 · 0,0065)  → 1,35 m/s : 0,72 m, 113 pas/min ; 1,0 m/s : 0,62 m ; 0,9 m/s : 0,59 m
    return math.sqrt(max(0.05, v) * 60 * 0.0065)

def _ratio_pas(r):
    L = r['bilan'].get('longPas'); v = r['images'][0].get('v') if r['images'] else None
    return None if (L is None or not v) else L / pas_attendu(v)

def _toe_out(r):
    out = []
    for s, sg in (('G', 1), ('D', -1)):
        # (pied à plat seulement : talon et pointe à moins de 4 cm de hauteur l'un de l'autre ; sur la pointe, la projection
        # talon → pointe est trop courte et son azimut n'a plus de sens)
        out += [sg * i['piedVsDep' + s] for i in planted(r, s) if i.get('piedVsDep' + s) is not None and abs(i.get('talonY' + s, 0) - i.get('boutY' + s, 0)) < 0.04]
    return out

def _plie(lst, f):
    return f(lst) if lst else None

C = []
def crit(**k): C.append(k)

# ------------------------------------------------------------------ BAS : pieds, jambes, locomotion
crit(id='pied_dans_sol', partie='bas', lib='Semelle enfoncée dans le sol (m, point le plus bas)', quand=lambda e: True,
     val=lambda r: stat_ou(r, ['solMinG', 'solMinD'], 'min', min), ok=(-0.015, 9), mineur=(-0.035, 9), cle=('solMinG', 'solMinD', 'min'),
     pourquoi='Une botte repose SUR le sol ; enfoncée de plus de 1,5 cm, la semelle disparaît dans le béton (visible en gros plan, ombre de contact fausse).', src='Contact au sol (bon sens + toute animation AAA : foot IK sur le sol)', vues=['piedsFace', 'piedsProfil'])
crit(id='pied_flotte_arret', partie='bas', lib='Pied en l\'air à l\'arrêt (s, plus longue durée au-dessus de 2,5 cm ; un pas de replacement dure < 0,4 s)', quand=lambda e: 'arret' in e and 'pivot' not in e,
     val=lambda r: max(r['bilan'].get('enLairG', 0), r['bilan'].get('enLairD', 0)), ok=(0, 0.45), mineur=(0, 0.9), cle=('solMinG', 'solMinD', 'max'),
     pourquoi='Debout immobile, les deux pieds portent le poids : aucun ne doit décoller.', src='FM 3-06.11 §3-23b (pieds à largeur d\'épaules, poids réparti)', vues=['piedsFace', 'piedsProfil'])
for s, nm in (('G', 'gauche'), ('D', 'droit')):
    crit(id='glisse_' + s, partie='bas', lib=f'Glissement du pied {nm} pendant l\'appui (m/s moyen)', quand=lambda e: 'marche' in e or 'course' in e or 'transition' in e or 'pivot' in e,
         val=(lambda s: lambda r: r['bilan'].get('glisseMoy' + s))(s), ok=(-1, 0.06), mineur=(-1, 0.14), cle=('glisseMaxImg' + s,),
         pourquoi='Un pied en appui est immobile par rapport au sol (adhérence) ; s\'il patine, le personnage « glisse sur la glace ».', src='Biomécanique de la marche : vitesse du pied d\'appui ≈ 0 (Perry & Burnfield, Gait Analysis)', vues=['pieds', 'piedsProfil'])
    crit(id='glisse_appui_' + s, partie='bas', lib=f'Distance glissée sur l\'appui le pire, pied {nm} (m)', quand=lambda e: 'marche' in e or 'course' in e or 'transition' in e or 'pivot' in e,
         val=(lambda s: lambda r: r['bilan'].get('glisseParAppui' + s))(s), ok=(-1, 0.03), mineur=(-1, 0.07), cle=('glisseMaxImg' + s,),
         pourquoi='Même un glissement lent devient visible s\'il s\'accumule sur un appui (plus de 3 cm).', src='idem', vues=['pieds', 'piedsProfil'])
for s, nm in (('G', 'gauche'), ('D', 'droit')):
    crit(id='patine_' + s, partie='bas', lib=f'Patinage pondéré par la hauteur, pied {nm} (m/s : vitesse du point le plus bas × poids de contact)', quand=lambda e: 'marche' in e or 'course' in e or 'transition' in e or 'pivot' in e,
         val=(lambda s: lambda r: r['bilan'].get('patine' + s))(s), ok=(-1, 0.05), mineur=(-1, 0.11), cle=(),
         pourquoi='Mesure standard du « foot skating » : un pied près du sol ne doit pas se déplacer horizontalement.', src='Zhang et al. 2018 (Mode-Adaptive Neural Networks, mesure de patinage pondérée par la hauteur, H = 2,5 cm)', vues=['pieds', 'piedsProfil'])
crit(id='pieds_croises', partie='bas', lib='Pieds croisés : écart min des chevilles le long de la ligne des hanches (m)', quand=lambda e: ('marche' in e or 'course' in e) and 'lateral' not in e and 'recharge' not in e,
     val=lambda r: st(r, 'ecartPiedsBassin', 'min'), ok=(0.03, 9), mineur=(-0.01, 9), cle=('ecartPiedsBassin', 'min'),
     pourquoi='En marche, chaque pied pose sur sa propre ligne (largeur de pas ≈ 8-17 cm) ; des pieds qui se croisent = démarche de mannequin ou chute.', src='PMC3756042 (largeur de pas 0,17 ± 0,04 m entre talons) ; Perry', vues=['piedsFace', 'dessus'])
crit(id='pieds_croises_lateral', partie='bas', lib='Pas chassé : écart min des chevilles le long de la ligne des hanches (m)', quand=lambda e: 'lateral' in e or 'diag' in e or 'recul' in e,
     val=lambda r: st(r, 'ecartPiedsBassin', 'min'), ok=(0.06, 9), mineur=(0.02, 9), cle=('ecartPiedsBassin', 'min'),
     pourquoi='En déplacement latéral en visant, on ne croise jamais les pieds (perte d\'équilibre) : pas glissés, pieds qui se rapprochent sans se croiser.', src='TC 3-22.9 ch. 9 (lateral movement) ; doctrine CQB courante', vues=['piedsFace', 'dessus'])
crit(id='tibias_se_touchent', partie='bas', lib='Tibias qui s\'interpénètrent (m, < 0 = maillages l\'un dans l\'autre, estimation par capsules)', quand=lambda e: 'accroupi' not in e,
     val=lambda r: st(r, 'tibias', 'min'), ok=(-0.01, 9), mineur=(-0.035, 9), cle=('tibias', 'min'),
     pourquoi='Deux jambes ne passent pas l\'une dans l\'autre ; c\'est le défaut le plus visible de face.', src='Intégrité du maillage', vues=['piedsFace', 'face'])
crit(id='largeur_pas', partie='bas', lib='Largeur de pas (m, entre chevilles à la pose du pied)', quand=lambda e: ('marche' in e or 'course' in e) and 'avant' in e and 'recharge' not in e,
     val=lambda r: r['bilan'].get('largPas'), ok=None, mineur=None, cle=(),
     bornes=lambda e: ((0.20, 0.40), (0.14, 0.46)) if ('vise' in e and 'course' not in e) else ((0.05, 0.26), (0.02, 0.33)),   # (marche visée : base large de la vraie vidéo, cohérente avec ecart_face 28-38 cm)
     pourquoi='Largeur de pas humaine 8-17 cm en marche normale ; en marche visée, base large (pieds à largeur d\'épaules). Plus étroit = marche sur un fil (mannequin), plus large = cow-boy.', src='PMC3756042 ; Molina, Small & Neptune 2023 (J. Biomech.) ; vraie vidéo (captures/reference_video/) pour la marche visée', vues=['dessus', 'piedsFace'])
crit(id='longueur_pas', partie='bas', lib='Longueur de pas / longueur humaine attendue à cette vitesse (rapport)', quand=lambda e: 'marche' in e and 'avant' in e and 'recharge' not in e,
     val=_ratio_pas, ok=(0.8, 1.2), mineur=(0.62, 1.38), cle=(),
     pourquoi='À vitesse donnée, l\'humain choisit sa longueur de pas (rapport longueur/cadence ≈ 0,0065 m/(pas/min)) : 1,35 m/s ≈ 0,72 m et 113 pas/min. Trop longs = enjambées molles « au ralenti » ; trop courts = trottinement.', src='Sekiya & Nagasaki 1998 (walk ratio) ; Wikipedia Preferred walking speed (1,4 m/s)', vues=['profil', 'piedsProfil'])
crit(id='cadence_course', partie='bas', lib='Cadence en course (pas/min)', quand=lambda e: 'course' in e,
     val=lambda r: r['bilan'].get('cadence'), ok=(140, 190), mineur=(125, 205), cle=(),
     pourquoi='Course légère 2,5-3,5 m/s : 150-180 pas/min.', src='Biomécanique de la course (cadence usuelle 160-180)', vues=['profil'])
crit(id='genou_attaque', partie='bas', lib='Flexion du genou à la pose du pied (°)', quand=lambda e: ('marche' in e or 'course' in e) and 'accroupi' not in e,
     val=lambda r: r['bilan'].get('genouAttaque'), ok=None, mineur=None, cle=(),
     bornes=lambda e: ((0, 18), (-4, 28)) if 'garde_basse' in e and 'course' not in e else ((3, 28), (0, 38)) if 'course' not in e else ((8, 38), (3, 48)),
     pourquoi='Marche normale : genou presque tendu à l\'attaque (≈ 5°), puis 15-20° en mise en charge ; marche tactique en visant : genoux un peu plus fléchis ; course : ≈ 20°.', src='Normal gait FRCS (genou 5° à l\'attaque, 20° en mise en charge, 60° en oscillation) ; FM 3-06.11 §3-23b (genoux légèrement fléchis)', vues=['profil', 'piedsProfil'])
crit(id='genou_envers', partie='bas', lib='Genou à l\'envers : angle entre le sens du genou et l\'avant du bassin (°, max ; jambe fléchie > 8°)', quand=lambda e: True,
     val=lambda r: stat_ou(r, ['genouSensG', 'genouSensD'], 'max', max), ok=(0, 75), mineur=(0, 100), cle=('genouSensG', 'genouSensD', 'max'),
     pourquoi='Un genou ne plie que vers l\'avant. Genou qui pointe en arrière avec le tibia replié sous la hanche = jambe cassée, visible immédiatement de profil (signalé par l\'utilisateur en jeu).', src='Anatomie du genou (charnière, flexion vers l\'arrière du tibia uniquement)', vues=['profil', 'profilG', 'piedsProfil'])
crit(id='genou_hyperextension', partie='bas', lib='Genou en hyperextension (°, < 0 = genou en arrière)', quand=lambda e: True,
     val=lambda r: stat_ou(r, ['genouG', 'genouD'], 'min', min), ok=(-3, 999), mineur=(-8, 999), cle=('genouG', 'genouD', 'min'),
     pourquoi='Un genou ne se plie pas à l\'envers ; une jambe « cassée » vers l\'arrière se voit tout de suite de profil.', src='Anatomie (extension du genou 0 à -5° au plus)', vues=['profil', 'piedsProfil'])
crit(id='angle_pied', partie='bas', lib='Angle de progression du pied en appui (°, + = pointe vers l\'extérieur)', quand=lambda e: ('marche' in e or 'course' in e) and 'avant' in e and 'recharge' not in e,
     val=lambda r: _plie(_toe_out(r), lambda v: max(v, key=abs)), ok=(-6, 22), mineur=(-14, 32), cle=(),
     pourquoi='En marchant droit devant, la pointe du pied suit le déplacement (5-10° vers l\'extérieur) ; un pied de travers donne l\'impression de marcher en crabe.', src='Normes de laboratoire de marche (angle de progression ≈ 5-7° d\'ouverture)', vues=['dessus', 'pieds'])
crit(id='bassin_vs_deplacement', partie='bas', lib='Bassin tourné par rapport au déplacement en marche avant (°, moyenne)', quand=lambda e: ('marche' in e or 'course' in e) and 'avant' in e and 'vise' not in e,
     val=lambda r: (lambda s: None if s is None else abs(s))(st(r, 'bassinVsDep', 'moy')), ok=(0, 20), mineur=(0, 35), cle=('bassinVsDep', 'moy'),
     pourquoi='Bassin face au déplacement (rotation ±4-5° seulement) ; sinon les jambes avancent de travers.', src='Perry (rotation du bassin ±4°)', vues=['dessus', 'face'])
crit(id='torsion', partie='bas', lib='Torsion épaules / bassin (°, max absolu)', quand=lambda e: True,
     val=lambda r: (lambda a, b: None if a is None else max(abs(a), abs(b)))(st(r, 'torsion', 'min'), st(r, 'torsion', 'max')), ok=(0, 45), mineur=(0, 62), cle=('torsion', 'max'),
     pourquoi='La colonne tourne d\'environ 40-50° au plus entre bassin et épaules ; au-delà le buste est « vissé » sur les hanches.', src='Amplitude de rotation thoraco-lombaire (≈ 40-50°)', vues=['dessus', 'troisQuarts'])
crit(id='rebond_bassin', partie='bas', lib='Rebond vertical du bassin (m)', quand=lambda e: 'marche' in e and 'accroupi' not in e and 'recharge' not in e,
     val=lambda r: r['bilan'].get('rebond'), ok=None, mineur=None, cle=(),
     bornes=lambda e: ((0.008, 0.03), (0.004, 0.04)) if 'vise' in e else ((0.02, 0.065), (0.01, 0.085)),
     pourquoi='Marche : le bassin monte et descend de 4-5 cm ; marche tactique en visant (« glide ») : rebond ≤ 3 cm pour garder le viseur stable.', src='Biomécanique de la marche (excursion verticale du centre de masse ≈ 5 cm) ; FM 3-06.11 §3-15a ; vraie vidéo (captures/reference_video/) : marche visée, bassin ≤ 3 cm', vues=['profil'])
crit(id='appui_largeur_arret', partie='bas', lib='Largeur des pieds en visée à l\'arrêt (m)', quand=lambda e: 'arret' in e and 'vise' in e and 'accroupi' not in e,
     val=lambda r: st(r, 'ecartPiedsLarg', 'moy'), ok=(0.22, 0.48), mineur=(0.15, 0.58), cle=('ecartPiedsLarg', 'moy'),
     pourquoi='Position de tir debout : pieds à largeur d\'épaules (≈ 30-40 cm entre chevilles).', src='FM 3-06.11 §3-23b ("Feet are about shoulder-width apart")', vues=['face', 'dessus'])
crit(id='appui_decale_arret', partie='bas', lib='Pied du côté du tir en arrière (m, pied gauche devant > 0)', quand=lambda e: 'arret' in e and 'vise' in e and 'accroupi' not in e,
     val=lambda r: st(r, 'ecartPiedsAvant', 'moy'), ok=(0.04, 0.38), mineur=(-0.04, 0.48), cle=('ecartPiedsAvant', 'moy'),
     pourquoi='Le pied du côté du tir (droit) est légèrement en retrait (appui décalé « talon-orteil »).', src='FM 3-06.11 §3-23b ("firing side foot slightly staggered to the rear")', vues=['profil', 'dessus'])
crit(id='genoux_flechis_arret', partie='bas', lib='Genoux fléchis en visée à l\'arrêt (°, moyenne)', quand=lambda e: 'arret' in e and 'vise' in e and 'accroupi' not in e,
     val=lambda r: stat_ou(r, ['genouG', 'genouD'], 'moy', lambda v: sum(v) / len(v)), ok=(6, 30), mineur=(2, 40), cle=('genouG', 'genouD', 'moy'),
     pourquoi='Genoux légèrement fléchis, jamais verrouillés (absorbe le recul, prêt à bouger).', src='FM 3-06.11 §3-23b ("Knees are slightly bent")', vues=['profil'])

# ------------------------------------------------------------------ HAUT : buste, tête, mains, arme
crit(id='penche_avant', partie='haut', lib='Buste penché vers l\'avant (°, bassin → cou, moyenne)', quand=lambda e: 'accroupi' not in e and 'recharge' not in e,
     val=lambda r: st(r, 'penche', 'moy'), ok=None, mineur=None, cle=('penche', 'moy'),
     bornes=lambda e: (((8, 22), (4, 27)) if ('lateral' in e or 'recul' in e) else ((15, 25), (10, 30))) if 'course' in e
                      else (((5, 18), (2, 23)) if ('lateral' in e or 'recul' in e) else ((12, 20), (8, 24))) if ('vise' in e and 'marche' in e)
                      else ((5, 15), (2, 19)) if 'vise' in e else ((0, 16), (-4, 24)),   # (vraie vidéo : visée arrêt 5-15°, marche visée 12-20°, course 15-25° ; pas chassé / recul : pas de référence vidéo, bande élargie)
     pourquoi='Tireur : haut du corps penché vers l\'avant (« nez au-dessus des orteils »), jamais en arrière ; plus penché en marchant en visant et en courant ; en patrouille, buste presque droit.', src='FM 3-06.11 §3-23b ("upper body is leaned slightly forward") ; vraie vidéo (captures/reference_video/) : visée 5-15°, marche visée 12-20°, course 15-25°', vues=['profil'])
crit(id='roulis_buste', partie='haut', lib='Inclinaison latérale du buste (°, max absolu)', quand=lambda e: 'recharge' not in e and 'virage' not in e,
     val=lambda r: (lambda a, b: None if a is None else max(abs(a), abs(b)))(st(r, 'roulis', 'min'), st(r, 'roulis', 'max')), ok=(0, 9), mineur=(0, 16), cle=('roulis', 'max'),
     pourquoi='Épaules carrées, pas avachies sur le côté.', src='FM 3-06.11 §3-23b ("Shoulders are square")', vues=['face', 'dos'])
crit(id='paume_poignee', partie='haut', lib='Paume droite ↔ arme (m, max ; ligne poignet → jointures, moins 1,5 cm d\'épaisseur de main)', quand=DEUX_MAINS,
     val=lambda r: st(r, 'paumeD_surface', 'max'), ok=(-0.01, 0.03), mineur=(-0.02, 0.055), cle=('paumeD_surface', 'max'),
     pourquoi='La main forte tient la poignée haut et fermement ; un écart = main qui flotte à côté de l\'arme.', src='TC 3-22.9 ch. 8 (firing hand grip)', vues=['mainD', 'mainDdessous'])
crit(id='paume_garde_main', partie='haut', lib='Paume gauche ↔ surface de l\'arme (m, max)', quand=DEUX_MAINS,
     val=lambda r: st(r, 'paumeG_surface', 'max'), ok=(-0.01, 0.03), mineur=(-0.02, 0.055), cle=('paumeG_surface', 'max'),
     pourquoi='La main d\'appui serre le garde-main ; si elle flotte à quelques cm, l\'arme semble tenue par magie.', src='TC 3-22.9 ch. 6 (support hand) ; Vortex Optics, modern low ready ("support hand extended forward, gripping the handguard")', vues=['mainG', 'mainGdessous'])
crit(id='paume_garde_main_pos', partie='haut', lib='Main d\'appui : distance devant la poignée (m, moyenne)', quand=DEUX_MAINS,
     val=lambda r: st(r, 'paumeG_avantPoignee', 'moy'), ok=(0.17, 0.42), mineur=(0.12, 0.5), cle=('paumeG_avantPoignee', 'moy'),
     pourquoi='La main d\'appui est sur le garde-main (devant le puits de chargeur), assez loin devant pour contrôler le canon ; pas sur le chargeur, pas au-delà de la bouche.', src='TC 3-22.9 ch. 6 ; Vortex Optics (support hand extended forward)', vues=['mainG', 'profil'])
crit(id='doigts_dans_arme', partie='haut', lib='Doigts qui traversent l\'arme (m, distance signée min des bouts de doigts)', quand=DEUX_MAINS,
     val=lambda r: stat_ou(r, [p + d for p in ('doigtD', 'doigtG') for d in ('Thumb', 'Index', 'Middle', 'Ring', 'Pinky')], 'min', min), ok=(-0.004, 9), mineur=(-0.012, 9), cle=('doigt*', 'min'),
     pourquoi='Un doigt ne passe pas dans le métal ; en gros plan c\'est le défaut n° 1 des prises d\'arme.', src='Intégrité du maillage', vues=['mainD', 'mainG', 'mainDdessous', 'mainGdessous'])
crit(id='doigts_poignee', partie='haut', lib='Main droite : majeur / annulaire / auriculaire enroulés sur la poignée (m, distance max des bouts)', quand=DEUX_MAINS,
     val=lambda r: stat_ou(r, ['doigtDMiddle', 'doigtDRing', 'doigtDPinky'], 'max', max), ok=(-1, 0.025), mineur=(-1, 0.045), cle=('doigtDMiddle', 'doigtDRing', 'doigtDPinky', 'max'),
     pourquoi='Les trois derniers doigts entourent la poignée ; des doigts écartés dans le vide = prise fausse.', src='TC 3-22.9 ch. 8 (grip)', vues=['mainD', 'mainDdessous'])
crit(id='doigts_garde_main', partie='haut', lib='Main gauche : bouts des doigts sur le garde-main (m, médiane des 5 doigts, max dans le temps)', quand=DEUX_MAINS,
     val=lambda r: _plie([sorted([i.get('doigtG' + d, 1) for d in ('Thumb', 'Index', 'Middle', 'Ring', 'Pinky')])[2] for i in r['images'] if i.get('doigtGIndex') is not None], max), ok=(-1, 0.03), mineur=(-1, 0.05), cle=(),
     pourquoi='La main d\'appui enveloppe le garde-main (ou le pince en « C ») : la plupart des doigts touchent l\'arme.', src='TC 3-22.9 ch. 6', vues=['mainG', 'mainGdessous'])
crit(id='index_hors_detente', partie='haut', lib='Index : courbure quand on ne tire pas (°, somme des 3 articulations, moins celle de la pose de liaison ; 0 = tendu)', quand=lambda e: DEUX_MAINS(e) and 'tir' not in e,
     val=lambda r: st(r, 'courbeDIndex', 'max'), ok=(-90, 50), mineur=(-90, 80), cle=('courbeDIndex', 'max'),
     pourquoi='Règle de sécurité n° 3 : doigt tendu le long de la carcasse, hors du pontet, tant qu\'on ne tire pas. Un index replié = doigt sur la détente ou enroulé sur la poignée.', src='TC 3-22.9 p. 1-3 ("Keep finger straight and off the trigger until ready to fire")', vues=['mainD', 'mainDdessous'])
crit(id='index_sur_detente_tir', partie='haut', lib='Index ↔ détente en tirant (m, max ; détente estimée)', quand=lambda e: 'tir' in e,
     val=lambda r: st(r, 'indexDetente', 'max'), ok=(0, 0.025), mineur=(0, 0.045), cle=('indexDetente', 'max'),
     pourquoi='Pour tirer, la première phalange de l\'index est sur la détente.', src='TC 3-22.9 fig. 8-2 (natural trigger finger placement)', vues=['mainD', 'mainDdessous'])
crit(id='erreur_visee', partie='haut', lib='Canon ↔ cible (°, max)', quand=lambda e: 'vise' in e and 'recharge' not in e and 'guet' not in e,
     val=lambda r: st(r, 'erreurVisee', 'max'), ok=None, mineur=None, cle=('erreurVisee', 'max'),
     bornes=lambda e: ((0, 2.5), (0, 6)) if 'arret' in e else ((0, 4), (0, 9)),
     pourquoi='En visée, le canon est SUR la cible ; à 10 m, 3° = 50 cm à côté.', src='Géométrie (le tir doit partir vers la cible)', vues=['troisQuarts', 'dessus'])
crit(id='crosse_epaule', partie='haut', lib='Crosse ↔ creux de l\'épaule en visée (m, max)', quand=lambda e: 'vise' in e and 'recharge' not in e and 'accroupi' not in e,
     val=lambda r: st(r, 'crosseEpaule', 'max'), ok=(0, 0.06), mineur=(0, 0.09), cle=('crosseEpaule', 'max'),
     pourquoi='La plaque de couche est dans le creux de l\'épaule (entre clavicule et deltoïde), pas sur le bras ni dans le vide.', src='FM 3-06.11 §3-15a, §3-23a ("butt ... firmly in the pocket of the shoulder")', vues=['epaule', 'profil'])
crit(id='oeil_ligne_visee', partie='haut', lib='Œil ↔ plan vertical du canon (m, max absolu)', quand=lambda e: 'vise' in e and 'recharge' not in e and 'course' not in e,
     val=lambda r: (lambda a, b: None if a is None else max(abs(a), abs(b)))(st(r, 'oeilLateral', 'min'), st(r, 'oeilLateral', 'max')), ok=(0, 0.035), mineur=(0, 0.07), cle=('oeilLateral', 'max'),
     pourquoi='Joue sur la crosse, l\'œil est dans l\'axe du viseur ; sinon le tireur « vise à côté ».', src='TC 3-22.9 fig. 6-1 (stock weld) ; FM 3-06.11 §3-23c (spot weld)', vues=['tete', 'teteDessus'])
crit(id='oeil_hauteur', partie='haut', lib='Œil au-dessus de l\'axe du canon en visée (m, moyenne ; œil estimé ±2 cm)', quand=lambda e: 'vise' in e and 'recharge' not in e and 'course' not in e,
     val=lambda r: st(r, 'oeilHaut', 'moy'), ok=(0.03, 0.11), mineur=(0.0, 0.15), cle=('oeilHaut', 'moy'),
     pourquoi='Avec un viseur point rouge sur carabine, l\'œil est ≈ 6-7 cm au-dessus de l\'axe du canon (hauteur du viseur) : plus haut, le tireur ne voit pas dans son viseur (fusil sous le menton) ; plus bas, impossible.', src='Géométrie AR-15 + optique (hauteur de visée ≈ 6,5 cm) ; TC 3-22.9 fig. 6-1', vues=['tete', 'profil'])
crit(id='tete_vs_canon', partie='haut', lib='Tête tournée par rapport au canon en visée (°, max absolu)', quand=lambda e: 'vise' in e and 'recharge' not in e,
     val=lambda r: (lambda a, b: None if a is None else max(abs(a), abs(b)))(st(r, 'teteVsCanon', 'min'), st(r, 'teteVsCanon', 'max')), ok=(0, 12), mineur=(0, 22), cle=('teteVsCanon', 'max'),
     pourquoi='« Les yeux, le canon et la cible » : on regarde là où pointe l\'arme (le canon suit la tête).', src='FM 3-06.11 §3-15a ("swing the muzzle as they turn their head")', vues=['teteDessus', 'face'])
crit(id='tete_tangage', partie='haut', lib='Tangage de la tête (°, max absolu)', quand=lambda e: 'recharge' not in e,
     val=lambda r: (lambda a, b: None if a is None else max(abs(a), abs(b)))(st(r, 'teteTangage', 'min'), st(r, 'teteTangage', 'max')), ok=(0, 22), mineur=(0, 35), cle=('teteTangage', 'max'),
     pourquoi='Tête haute, regard à l\'horizontale (on balaie la zone) ; pas le menton sur la poitrine ni le nez au ciel.', src='Vortex Optics (head upright, free to scan) ; FM 3-06.11', vues=['profil', 'tete'])
crit(id='tete_figee', partie='haut', lib='Tête parfaitement figée pendant la marche (°/s, vitesse angulaire max de la tête)', quand=lambda e: 'marche' in e and 'recharge' not in e,
     val=lambda r: (r['bilan'].get('acoups', {}).get('Head') or {}).get('vMax'), ok=(4, 999), mineur=(1, 999), cle=(),
     pourquoi='La tête est stabilisée mais pas soudée au monde : elle accompagne un peu chaque pas (±1-3°). Une tête parfaitement immobile sur un corps qui marche fait « caméra sur trépied ».', src='Biomécanique de la stabilisation de la tête pendant la marche', vues=['profil'])
crit(id='coude_aile', partie='haut', lib='Coude droit au-dessus de l\'épaule en visée (m, max)', quand=lambda e: 'vise' in e and 'recharge' not in e,
     val=lambda r: st(r, 'coudeHautD', 'max'), ok=(-9, 0.0), mineur=(-9, 0.06), cle=('coudeHautD', 'max'),
     pourquoi='Coude du bras fort abaissé (≈ 45°) plutôt que levé à l\'horizontale (« aile de poulet », vieille école, accroche les portes).', src='Doctrine CQB moderne (coudes bas)', vues=['face', 'dos'])
crit(id='poignets', partie='haut', lib='Poignets cassés (°, angle max main / avant-bras)', quand=lambda e: True,
     val=lambda r: stat_ou(r, ['poignetD', 'poignetG'], 'max', max), ok=(0, 55), mineur=(0, 72), cle=('poignetD', 'poignetG', 'max'),
     pourquoi='Au-delà de ~60-70° de flexion / déviation, un poignet tenant 3,5 kg est douloureux et se voit « cassé ».', src='Amplitude articulaire du poignet (flexion ~70-80°, extension ~70°, déviations 20-35°)', vues=['mainD', 'mainG'])
crit(id='garde_basse_canon', partie='haut', lib='Garde basse / patrouille : canon vers le bas (°, tangage moyen)', quand=lambda e: 'garde_basse' in e and 'sprint' not in e,
     val=lambda r: st(r, 'canonTangage', 'moy'), ok=(-55, -15), mineur=(-70, -6), cle=('canonTangage', 'moy'),
     pourquoi='Garde basse : bouche vers le bas (jusqu\'à 45°) devant soi, pour voir les mains de la menace et relever l\'arme d\'un geste.', src='FM 3-06.11 §3-23a(1) (« barrel pointed down at a 45-degree angle ») ; Vortex Optics (depressed muzzle)', vues=['profil', 'troisQuarts'])
crit(id='garde_basse_direction', partie='haut', lib='Garde basse / patrouille : direction du canon par rapport au déplacement / à la face (°, moyenne absolue)', quand=lambda e: 'garde_basse' in e,
     val=lambda r: (lambda s: None if s is None else abs(s))(st(r, 'canonVsDep', 'moy')), ok=(0, 30), mineur=(0, 50), cle=('canonVsDep', 'moy'),
     pourquoi='Conscience de la bouche : l\'arme pointe dans la direction de marche (vers le danger), pas en travers vers la gauche — sinon il faut un grand geste pour engager et on balaie ses coéquipiers.', src='FM 3-06.11 §3-15a ("muzzle pointed in the direction of travel")', vues=['dessus', 'face'])
crit(id='garde_basse_crosse', partie='haut', lib='Garde basse : crosse ↔ creux de l\'épaule (m, moyenne)', quand=lambda e: 'garde_basse' in e and 'sprint' not in e,
     val=lambda r: st(r, 'crosseEpaule', 'moy'), ok=(0, 0.07), mineur=(0, 0.17), cle=('crosseEpaule', 'moy'),
     pourquoi='En garde basse CQB, la crosse reste dans l\'épaule (ou juste sous l\'aisselle en « garde haute ») : on n\'a qu\'à lever le canon pour tirer.', src='FM 3-06.11 §3-23a(1) ; Vortex Optics ("buttstock firmly seated in the shoulder pocket")', vues=['epaule', 'profil'])
crit(id='bouche_sur_soi', partie='haut', lib='Le canon pointe sur ses propres jambes / pieds (m, < 0 = oui)', quand=lambda e: True,
     val=lambda r: st(r, 'boucheSurSoi', 'min'), ok=(0.04, 99), mineur=(0.0, 99), cle=('boucheSurSoi', 'min'),
     pourquoi='Règle de sécurité : on ne pointe jamais la bouche sur une partie de son propre corps.', src='TC 3-22.9 ch. 1 (règles de sécurité : « never point the weapon at anything you do not intend to shoot »)', vues=['profil', 'troisQuarts'])
crit(id='arme_dans_corps', partie='haut', lib='Arme qui traverse le torse (m, < 0 = dedans, estimation par capsules)', quand=lambda e: True,
     val=lambda r: st(r, 'armeTronc', 'min'), ok=(-0.015, 99), mineur=(-0.045, 99), cle=('armeTronc', 'min'),
     pourquoi='Le fusil touche le gilet, il ne passe pas dedans.', src='Intégrité du maillage', vues=['face', 'dessus', 'profil'])
crit(id='arme_dans_tete', partie='haut', lib='Arme qui traverse la tête / le casque (m)', quand=lambda e: True,
     val=lambda r: st(r, 'armeTete', 'min'), ok=(-0.01, 99), mineur=(-0.03, 99), cle=('armeTete', 'min'),
     pourquoi='Le canon ou l\'optique ne traversent pas le casque.', src='Intégrité du maillage', vues=['tete', 'profil'])
crit(id='cant_arme', partie='haut', lib='Arme inclinée sur le côté en visée (°, max absolu)', quand=lambda e: 'vise' in e and 'recharge' not in e,
     val=lambda r: (lambda a, b: None if a is None else max(abs(a), abs(b)))(st(r, 'armeRoulis', 'min'), st(r, 'armeRoulis', 'max')), ok=(0, 8), mineur=(0, 18), cle=('armeRoulis', 'max'),
     pourquoi='En visée, l\'arme est droite (viseur à 12 h) ; inclinée, le tir part de côté.', src='TC 3-22.9 (cant)', vues=['dos', 'face'])

# ------------------------------------------------------------------ ajouts : vidéo de référence de l'utilisateur + pieds « cassés »
VID = 'vraie vidéo (captures/reference_video/) : soldat réel, marche en visant et course fusil en main'
def _frames(r, f):
    return [i for i in r['images'] if f(i)]
def _max(v): return max(v) if v else None
def _pire(r, cond, cle, f=lambda x: x):
    """(valeur, instant) de la pire image (max de f(valeur)) parmi celles des deux pieds qui vérifient cond(image, 'G'|'D')"""
    best = None
    for s in ('G', 'D'):
        for i in r['images']:
            x = i.get(cle + s)
            if x is None or not cond(i, s): continue
            if best is None or f(x) > best[0]: best = (f(x), i.get('t'))
    return best or (None, None)
# phases du pied (hauteurs au-dessus du sol de référence) : talon posé / pied en l'air / poussée (talon levé, pointe au sol)
_TALON_BAS = lambda i, s: i.get('talonY' + s, 1) < 0.03
_EN_LAIR = lambda i, s: i.get('solMin' + s, 0) > 0.03
_POUSSEE = lambda i, s: i.get('talonY' + s, 0) >= 0.03 and i.get('solMin' + s, 1) <= 0.03
# avant-pied : écart total à la liaison (tous sens : relevé, abaissé, tourné de côté) si mesuré, sinon le tangage signé
_CLE_ORTEIL = lambda r: 'orteilDev' if any('orteilDevG' in i for i in r['images'][:3]) else 'orteil'
crit(id='hauteur_talon', partie='bas', lib='Talon le plus haut pendant l\'oscillation (m, « talons aux fesses »)', quand=lambda e: ('marche' in e or 'course' in e) and 'recharge' not in e and 'accroupi' not in e and 'sprint' not in e,
     val=lambda r: stat_ou(r, ['talonYG', 'talonYD'], 'max', max), ok=None, mineur=None, cle=('talonYG', 'talonYD', 'max'),
     bornes=lambda e: ((0, 0.12), (0, 0.18)) if ('vise' in e and 'course' not in e) else ((0, 0.25), (0, 0.32)) if 'course' in e else ((0, 0.25), (0, 0.32)),
     pourquoi='Un tireur qui marche en visant rase le sol (pas glissés, pieds bas) ; en petite course le talon remonte peu. Talon très haut derrière = foulée de sprinteur, pas de tactique.', src=VID + ' (pieds bas, talon < 12 cm en marche visée, < 25 cm en course)', vues=['profil', 'piedsProfil'])
crit(id='ecart_face', partie='bas', lib='Écart des chevilles vu de face (m, moyenne, axe gauche-droite du corps)', quand=lambda e: ('marche' in e or 'course' in e) and 'avant' in e and 'recharge' not in e and 'accroupi' not in e,
     val=lambda r: st(r, 'ecartPiedsLarg', 'moy'), ok=None, mineur=None, cle=('ecartPiedsLarg', 'moy'),
     bornes=lambda e: ((0.28, 0.38), (0.22, 0.45)) if ('vise' in e and 'course' not in e) else ((0.15, 0.25), (0.10, 0.32)) if 'course' in e else ((0.10, 0.30), (0.06, 0.36)),
     pourquoi='Base large et stable en marche visée (pieds à largeur d\'épaules, jamais en ligne) ; en course, pieds sous les hanches mais pas sur une seule ligne.', src=VID, vues=['face', 'piedsFace'])
crit(id='valgus_genou', partie='bas', lib='Genou qui rentre vers l\'intérieur (valgus, °, max)', quand=lambda e: 'accroupi' not in e,
     val=lambda r: stat_ou(r, ['valgusG', 'valgusD'], 'max', max), ok=(-99, 8), mineur=(-99, 15), cle=('valgusG', 'valgusD', 'max'),
     pourquoi='Genoux dans l\'axe des pieds ; un genou qui rentre (genoux en X) fait « faible » et instable.', src=VID + ' ; biomécanique (valgus dynamique > 10° = défaut)', vues=['face', 'piedsFace'])
crit(id='orteil_pied_plat', partie='bas', lib='Avant-pied tordu (relevé, abaissé ou tourné de côté) vs la liaison, talon posé OU pied en l\'air (°, max ; « orteil d\'elfe », botte en banane)', quand=lambda e: True,
     val=lambda r: _pire(r, lambda i, s: _TALON_BAS(i, s) or _EN_LAIR(i, s), _CLE_ORTEIL(r), abs)[0], t=lambda r: _pire(r, lambda i, s: _TALON_BAS(i, s) or _EN_LAIR(i, s), _CLE_ORTEIL(r), abs)[1], ok=(0, 10), mineur=(0, 18), cle=(),
     pourquoi='Talon posé ou pied en l\'air : la botte est rigide, les orteils restent dans le prolongement du pied (≈ 0°). Une pointe relevée = chaussure de lutin, se voit de profil.', src='Signalé par l\'utilisateur (captures/reference_video/pieds_trot_*.png) ; botte de combat à semelle rigide', vues=['piedsProfil', 'profil'])
crit(id='orteil_poussee', partie='bas', lib='Orteils pliés à la poussée, talon levé et pointe au sol (°, max)', quand=lambda e: True,
     val=lambda r: _pire(r, _POUSSEE, _CLE_ORTEIL(r))[0], t=lambda r: _pire(r, _POUSSEE, _CLE_ORTEIL(r))[1], ok=(-99, 35), mineur=(-99, 45), cle=(),
     pourquoi='À la poussée seulement, la botte plie aux orteils (talon levé, pointe au sol), jusqu\'à ~35°.', src='Signalé par l\'utilisateur ; flexion des orteils à la poussée en course', vues=['piedsProfil'])
crit(id='plantaire_oscillation', partie='bas', lib='Pointe du pied tendue vers le bas en l\'air (flexion plantaire vs liaison, °, max ; pied à plus de 5 cm du sol)', quand=lambda e: True,
     val=lambda r: _pire(r, lambda i, s: i.get('solMin' + s, 0) > 0.05, 'plantaire')[0], t=lambda r: _pire(r, lambda i, s: i.get('solMin' + s, 0) > 0.05, 'plantaire')[1], ok=(-99, 25), mineur=(-99, 30), cle=(),
     pourquoi='En oscillation le pied reste à peu près à angle droit avec le tibia (il se relève même pour passer) ; une pointe tendue = pied de danseuse, botte « froissée ».', src='Signalé par l\'utilisateur ; marche normale : cheville ≈ neutre en oscillation (FRCS)', vues=['piedsProfil'])
def _pied_ouvert(r):
    # rotation du pied (axe ACP de la semelle) par rapport à l'avant du bassin, + = pointe vers l'extérieur, pied au sol seulement
    best = None
    for s, sg in (('G', 1), ('D', -1)):
        for i in r['images']:
            if i.get('piedAz' + s) is None or i.get('bassinAz') is None or i.get('solMin' + s, 1) > 0.03: continue
            d = (i['piedAz' + s] - i['bassinAz'] + 180) % 360 - 180; v = sg * d
            if best is None or abs(v) > abs(best[0]): best = (v, i.get('t'))
    return best or (None, None)
crit(id='pied_vs_bassin', partie='bas', lib='Pied au sol tourné par rapport au bassin (°, + = pointe vers l\'extérieur, pire image)', quand=lambda e: ('lateral' in e or 'diag' in e or 'recul' in e or 'pivot' in e or 'vise' in e) and 'accroupi' not in e and 'recharge' not in e,
     val=lambda r: _pied_ouvert(r)[0], t=lambda r: _pied_ouvert(r)[1], ok=None, mineur=None, cle=(),
     bornes=lambda e: ((-15, 45), (-25, 65)) if ('arret' in e or 'transition' in e) else ((-15, 35), (-25, 50)),   # (à l'arrêt, et à la fin d'un départ / arrêt : appui décalé, pied arrière plus ouvert)
     pourquoi='En pas chassé, en recul ou en visée, les pieds restent tournés vers la menace (pointes 10-30° vers l\'extérieur) ; une pointe tournée à 60-90° dans le sens du pas (pied « en canard ») casse la base de tir et se voit de face et de profil.', src='TC 3-22.9 ch. 9 (lateral movement : pas glissés, pieds vers l\'avant) ; vraie vidéo (captures/reference_video/)', vues=['dessus', 'piedsFace'])
crit(id='flexion_dorsale', partie='bas', lib='Cheville : flexion dorsale max (pointe relevée vers le tibia, vs liaison, °)', quand=lambda e: 'accroupi' not in e,
     val=lambda r: (lambda a, b: None if a is None else -min(a, b if b is not None else a))(st(r, 'plantaireG', 'min'), st(r, 'plantaireD', 'min')), ok=(-99, 38), mineur=(-99, 46), cle=('plantaireG', 'plantaireD', 'min'),
     pourquoi='La cheville se relève de 20° (genou tendu) à 35-40° (genou plié, en charge) au plus ; au-delà, la pointe remonte vers le tibia de façon impossible.', src='Amplitude articulaire de la cheville (flexion dorsale 20° genou tendu, ≈ 35-45° en fente)', vues=['piedsProfil', 'pieds'])
crit(id='botte_deformee', partie='bas', lib='Botte écrasée / étirée : longueur talon ↔ pointe vs liaison (rapport − 1, max absolu)', quand=lambda e: True,
     val=lambda r: (lambda a, b, c2, d: None if a is None else max(abs(a), abs(b), abs(c2 or 0), abs(d or 0)))(st(r, 'botteG', 'min'), st(r, 'botteG', 'max'), st(r, 'botteD', 'min'), st(r, 'botteD', 'max')), ok=(0, 0.08), mineur=(0, 0.12), cle=('botteG', 'botteD', 'max'),
     pourquoi='Une botte est rigide : sa longueur ne change pas de plus de quelques %. Au-delà de 8 %, le maillage est écrasé par la pose des os du pied.', src='Signalé par l\'utilisateur (captures/reference_video/pieds_trot_*.png)', vues=['piedsProfil', 'pieds'])
crit(id='pieds_se_touchent', partie='bas', lib='Pieds qui se touchent / se traversent (m, distance des capsules de pied)', quand=lambda e: 'accroupi' not in e,
     val=lambda r: st(r, 'piedsPied', 'min'), ok=(0, 9), mineur=(-0.02, 9), cle=('piedsPied', 'min'),
     pourquoi='Les bottes ne se croisent pas et ne passent pas l\'une dans l\'autre pendant la foulée.', src='Signalé par l\'utilisateur', vues=['piedsFace', 'semelles'])
crit(id='coude_appui', partie='haut', lib='Bras d\'appui : angle du coude gauche en visée (°, moyenne ; 180 = tendu)', quand=lambda e: 'vise' in e and 'recharge' not in e,
     val=lambda r: st(r, 'coudeG', 'moy'), ok=(125, 175), mineur=(105, 180), cle=('coudeG', 'moy'),
     pourquoi='Le bras d\'appui est presque tendu, main loin devant sur le garde-main (contrôle du canon) ; un coude très plié ramène l\'arme contre le torse.', src=VID, vues=['face', 'troisQuarts'])
crit(id='main_appui_avant', partie='haut', lib='Main d\'appui : position le long de l\'arme (fraction poignée → bouche, moyenne)', quand=lambda e: 'vise' in e and 'recharge' not in e,
     val=lambda r: st(r, 'paumeG_fraction', 'moy'), ok=(0.45, 0.85), mineur=(0.35, 0.95), cle=('paumeG_fraction', 'moy'),
     pourquoi='Prise moderne : main d\'appui loin devant sur le garde-main.', src=VID + ' ; Vortex Optics (support hand extended forward)', vues=['mainG', 'troisQuarts'])

# à-coups (vitesse angulaire qui change brutalement, °/s²) : seuils calés sur les animations capturées d'origine (voir RUBRIQUE.md)
for k, part, ok, mi in (('Hips', 'bas', 2500, 5000), ('Spine2', 'haut', 2500, 5000), ('Head', 'haut', 2500, 5000), ('RightHand', 'haut', 3500, 7000), ('LeftHand', 'haut', 3500, 7000), ('arme', 'haut', 3500, 7000), ('LeftFoot', 'bas', 20000, 35000), ('RightFoot', 'bas', 20000, 35000)):
    crit(id='acoup_' + k, partie=part, lib=f'À-coup de rotation : {k} (°/s², pic)', quand=lambda e: True,
         val=(lambda k: lambda r: (r['bilan'].get('acoups', {}).get(k) or {}).get('accMax'))(k), ok=(0, ok), mineur=(0, mi), cle=(),
         pourquoi='Un os qui change brusquement de vitesse de rotation d\'une image à l\'autre = saccade (« pop ») ; les vrais mouvements sont lisses.', src='Qualité d\'animation (continuité de la vitesse)', vues=['troisQuarts'], acoup=k)


def noter(r, etat):
    """applique la rubrique à un résultat du banc (ou d'un échantillon en jeu) ; renvoie une liste de verdicts"""
    e = ETIQ.get(etat, set()); out = []
    for c in C:
        if not c['quand'](e): continue
        try: v = c['val'](r)
        except Exception: v = None
        if v is None: continue
        ok, mi = (c['bornes'](e) if c.get('bornes') else (c['ok'], c['mineur']))
        niv = 'OK' if ok[0] <= v <= ok[1] else 'mineur' if mi[0] <= v <= mi[1] else 'majeur'
        # écart à l'intervalle OK, normalisé par la largeur de la zone « mineur » (pour trier les problèmes)
        lo, hi = ok; ml, mh = mi; ecart = 0 if niv == 'OK' else ((lo - v) / max(1e-9, lo - ml) if v < lo else (v - hi) / max(1e-9, mh - hi))
        out.append({'id': c['id'], 'partie': c['partie'], 'lib': c['lib'], 'valeur': v, 'ok': ok, 'mineur': mi, 'niveau': niv, 'ecart': ecart,
                    'pourquoi': c['pourquoi'], 'src': c['src'], 'vues': c['vues'], 'cle': c.get('cle', ()), 'acoup': c.get('acoup')})
        if c.get('t') and niv != 'OK':   # instant de la pire image (critères par phase du pied), pour la planche de preuve
            try: out[-1]['t_pire'] = c['t'](r)
            except Exception: pass
    return out
