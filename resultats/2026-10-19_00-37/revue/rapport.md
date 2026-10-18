# Revue d'animation — 19/10 00:40

Sortie : `revue`

Contrôle visuel de la petite course (profil, 6 instants) — À REGARDER à chaque revue : `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/trot_profil_gign.jpg`, `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/trot_profil_soldat.jpg`

## Scores par état (OK / mineur / majeur)

| état | gign | soldat |
|---|---|---|
| repos_garde_basse | 34 / 1 / **0** | 33 / 1 / **1** |
| repos_visee | 42 / 1 / **1** | 41 / 1 / **2** |
| guet | 41 / 0 / **2** | 39 / 1 / **3** |
| guet_accroupi | 33 / 2 / **0** | 33 / 1 / **1** |
| tir_arret | 42 / 1 / **1** | 41 / 1 / **2** |
| patrouille | 41 / 8 / **3** | 44 / 5 / **3** |
| patrouille_lente | 44 / 7 / **1** | 44 / 6 / **2** |
| marche_visee | 47 / 6 / **4** | 49 / 3 / **5** |
| marche_visee_diagG | 40 / 7 / **5** | 42 / 4 / **6** |
| marche_visee_diagD | 45 / 5 / **4** | 47 / 2 / **5** |
| pas_chasse_G | 40 / 3 / **8** | 39 / 8 / **4** |
| pas_chasse_D | 40 / 7 / **4** | 40 / 5 / **6** |
| recul_vise | 44 / 5 / **5** | 44 / 6 / **4** |
| recul_diagD | 42 / 8 / **4** | 42 / 8 / **4** |
| jog_bas | 39 / 6 / **5** | 37 / 5 / **8** |
| jog_vise | 43 / 8 / **2** | 43 / 5 / **5** |
| jog_vise_diagG | 37 / 5 / **6** | 38 / 4 / **6** |
| jog_vise_lateralD | 39 / 3 / **5** | 39 / 1 / **7** |
| jog_vise_recul | 42 / 5 / **4** | 40 / 4 / **7** |
| jog_bas_24 | 36 / 5 / **9** | 36 / 6 / **8** |
| jog_bas_rapide | 36 / 4 / **10** | 34 / 7 / **9** |
| sprint | 39 / 2 / **6** | 35 / 5 / **7** |
| accroupi | 34 / 2 / **0** | 35 / 1 / **0** |
| marche_accroupie | 39 / 7 / **2** | 42 / 6 / **0** |
| recharge_arret | 14 / 4 / **4** | 14 / 2 / **6** |
| recharge_marche | 14 / 5 / **12** | 15 / 3 / **12** |
| demi_tour | 36 / 9 / **5** | 36 / 7 / **7** |
| depart_arret | 34 / 3 / **5** | 33 / 4 / **5** |
| depart_arret_vise | 36 / 5 / **7** | 37 / 3 / **8** |
| virage_patrouille | 36 / 7 / **3** | 36 / 5 / **5** |

Total : 2257 OK, 261 mineurs, 275 majeurs (sur 2793 vérifications).

## Haut du corps (mains, doigts, arme, tête, buste)

### MAJEUR — À-coup de rotation : Head (°/s², pic)  (`acoup_Head`)
Attendu : OK [0, 2500], toléré [0, 5000]. Pourquoi : Un os qui change brusquement de vitesse de rotation d'une image à l'autre = saccade (« pop ») ; les vrais mouvements sont lisses. Source : Qualité d'animation (continuité de la vitesse).

- **majeur** gign / recharge_arret : mesuré **10769** (t = 2.63 s)
- **majeur** soldat / recharge_arret : mesuré **10599** (t = 2.63 s)
- **majeur** soldat / recharge_marche : mesuré **7202** (t = 2.63 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_recharge_marche.jpg`
- **majeur** gign / recharge_marche : mesuré **6524** (t = 2.63 s)
- **mineur** gign / demi_tour : mesuré **3329** (t = 0.967 s)
- **mineur** soldat / demi_tour : mesuré **3323** (t = 0.967 s)
- **mineur** soldat / depart_arret : mesuré **3192** (t = 3.1 s)

### MAJEUR — À-coup de rotation : Spine2 (°/s², pic)  (`acoup_Spine2`)
Attendu : OK [0, 2500], toléré [0, 5000]. Pourquoi : Un os qui change brusquement de vitesse de rotation d'une image à l'autre = saccade (« pop ») ; les vrais mouvements sont lisses. Source : Qualité d'animation (continuité de la vitesse).

- **majeur** gign / recharge_arret : mesuré **10483** (t = 2.63 s)
- **majeur** soldat / recharge_arret : mesuré **9914** (t = 2.63 s)
- **mineur** gign / recharge_marche : mesuré **3630** (t = 2.63 s)
- **mineur** soldat / recharge_marche : mesuré **2984** (t = 2.63 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_recharge_marche.jpg`

### MAJEUR — Doigts qui traversent l'arme (m, distance signée min des bouts de doigts)  (`doigts_dans_arme`)
Attendu : OK [-0.004, 9], toléré [-0.012, 9]. Pourquoi : Un doigt ne passe pas dans le métal ; en gros plan c'est le défaut n° 1 des prises d'arme. Source : Intégrité du maillage.

- **majeur** gign / depart_arret_vise : mesuré **-0.0232** (t = 1 s)
- **majeur** gign / recul_vise : mesuré **-0.0232** (t = 3.83 s)
- **majeur** gign / patrouille : mesuré **-0.0232** (t = 1.83 s)
- **majeur** soldat / jog_bas_24 : mesuré **-0.0228** (t = 4 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_jog_bas_24.jpg`
- **majeur** soldat / jog_bas_rapide : mesuré **-0.0228** (t = 3.3 s)
- **majeur** soldat / virage_patrouille : mesuré **-0.0228** (t = 1.87 s)
- **majeur** soldat / patrouille_lente : mesuré **-0.0228** (t = 2.37 s)
- **majeur** soldat / guet_accroupi : mesuré **-0.0228** (t = 4.3 s)
- … et 7 autres états

### MAJEUR — Poignets cassés (°, angle max main / avant-bras)  (`poignets`)
Attendu : OK [0, 55], toléré [0, 72]. Pourquoi : Au-delà de ~60-70° de flexion / déviation, un poignet tenant 3,5 kg est douloureux et se voit « cassé ». Source : Amplitude articulaire du poignet (flexion ~70-80°, extension ~70°, déviations 20-35°).

- **majeur** soldat / recharge_arret : mesuré **90.7** (t = 2.77 s)
- **majeur** gign / recharge_arret : mesuré **83.2** (t = 1.97 s)
- **mineur** soldat / recharge_marche : mesuré **67.6** (t = 2 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_recharge_marche.jpg`
- **mineur** gign / recharge_marche : mesuré **62.8** (t = 2 s)
- **mineur** soldat / pas_chasse_G : mesuré **56.3** (t = 3.7 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_pas_chasse_G.jpg`
- **mineur** soldat / jog_bas : mesuré **56.2** (t = 2.1 s)
- **mineur** soldat / jog_bas_rapide : mesuré **55.8** (t = 2.27 s)
- **mineur** soldat / jog_bas_24 : mesuré **55.6** (t = 1.83 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_jog_bas_24.jpg`
- … et 1 autres états

### MAJEUR — À-coup de rotation : RightHand (°/s², pic)  (`acoup_RightHand`)
Attendu : OK [0, 3500], toléré [0, 7000]. Pourquoi : Un os qui change brusquement de vitesse de rotation d'une image à l'autre = saccade (« pop ») ; les vrais mouvements sont lisses. Source : Qualité d'animation (continuité de la vitesse).

- **majeur** gign / recharge_marche : mesuré **9771** (t = 2.67 s)
- **majeur** soldat / recharge_marche : mesuré **9290** (t = 2.67 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_recharge_marche.jpg`
- **mineur** gign / recharge_arret : mesuré **6123** (t = 2.67 s)
- **mineur** soldat / recharge_arret : mesuré **5984** (t = 2.67 s)

### MAJEUR — À-coup de rotation : arme (°/s², pic)  (`acoup_arme`)
Attendu : OK [0, 3500], toléré [0, 7000]. Pourquoi : Un os qui change brusquement de vitesse de rotation d'une image à l'autre = saccade (« pop ») ; les vrais mouvements sont lisses. Source : Qualité d'animation (continuité de la vitesse).

- **majeur** gign / recharge_marche : mesuré **9767** (t = 2.67 s)
- **majeur** soldat / recharge_marche : mesuré **9402** (t = 2.67 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_recharge_marche.jpg`
- **mineur** gign / recharge_arret : mesuré **6121** (t = 2.67 s)
- **mineur** soldat / recharge_arret : mesuré **6067** (t = 2.67 s)

### MAJEUR — À-coup de rotation : LeftHand (°/s², pic)  (`acoup_LeftHand`)
Attendu : OK [0, 3500], toléré [0, 7000]. Pourquoi : Un os qui change brusquement de vitesse de rotation d'une image à l'autre = saccade (« pop ») ; les vrais mouvements sont lisses. Source : Qualité d'animation (continuité de la vitesse).

- **majeur** gign / recharge_marche : mesuré **9609** (t = 2.67 s)
- **majeur** soldat / recharge_marche : mesuré **9401** (t = 2.67 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_recharge_marche.jpg`
- **majeur** soldat / recharge_arret : mesuré **8197** (t = 1.83 s)
- **mineur** gign / recharge_arret : mesuré **6735** (t = 1.23 s)

### MAJEUR — Crosse ↔ creux de l'épaule en visée (m, max)  (`crosse_epaule`)
Attendu : OK [0, 0.06], toléré [0, 0.09]. Pourquoi : La plaque de couche est dans le creux de l'épaule (entre clavicule et deltoïde), pas sur le bras ni dans le vide. Source : FM 3-06.11 §3-15a, §3-23a ("butt ... firmly in the pocket of the shoulder").

- **majeur** gign / pas_chasse_G : mesuré **0.106** (t = 2.1 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/gign_pas_chasse_G.jpg`
- **mineur** soldat / depart_arret_vise : mesuré **0.0879** (t = 1.3 s)
- **mineur** soldat / jog_vise : mesuré **0.0849** (t = 2.43 s)
- **mineur** soldat / pas_chasse_G : mesuré **0.0846** (t = 3.67 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_pas_chasse_G.jpg`
- **mineur** soldat / jog_vise_lateralD : mesuré **0.0824** (t = 2.13 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_jog_vise_lateralD.jpg`
- **mineur** soldat / jog_vise_diagG : mesuré **0.0821** (t = 2.63 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_jog_vise_diagG.jpg`
- **mineur** soldat / marche_visee : mesuré **0.082** (t = 3.77 s)
- **mineur** soldat / marche_visee_diagD : mesuré **0.0806** (t = 2.53 s)
- … et 17 autres états

### mineur — Buste penché vers l'avant (°, bassin → cou, moyenne)  (`penche_avant`)
Attendu : OK [5, 15], toléré [2, 19]. Pourquoi : Tireur : haut du corps penché vers l'avant (« nez au-dessus des orteils »), jamais en arrière ; plus penché en marchant en visant et en courant ; en patrouille, buste presque droit. Source : FM 3-06.11 §3-23b ("upper body is leaned slightly forward") ; vraie vidéo (captures/reference_video/) : visée 5-15°, marche visée 12-20°, course 15-25°.

- **mineur** gign / depart_arret_vise : mesuré **16.5** (t = 2.6 s)
- **mineur** soldat / depart_arret_vise : mesuré **16.3** (t = 2.6 s)
- **mineur** gign / pas_chasse_D : mesuré **18.6** (t = 2.9 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/gign_pas_chasse_D.jpg`
- **mineur** soldat / pas_chasse_D : mesuré **18.5** (t = 2.9 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_pas_chasse_D.jpg`
- **mineur** gign / pas_chasse_G : mesuré **18.4** (t = 2.9 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/gign_pas_chasse_G.jpg`
- **mineur** soldat / pas_chasse_G : mesuré **18.2** (t = 2.9 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_pas_chasse_G.jpg`
- **mineur** gign / recul_diagD : mesuré **18** (t = 2.9 s)
- **mineur** soldat / recul_diagD : mesuré **18** (t = 2.9 s)

### mineur — Canon ↔ cible (°, max)  (`erreur_visee`)
Attendu : OK [0, 2.5], toléré [0, 6]. Pourquoi : En visée, le canon est SUR la cible ; à 10 m, 3° = 50 cm à côté. Source : Géométrie (le tir doit partir vers la cible).

- **mineur** gign / demi_tour : mesuré **3.55** (t = 0.6 s)
- **mineur** soldat / demi_tour : mesuré **3.35** (t = 0.6 s)

### mineur — Arme qui traverse le torse (m, < 0 = dedans, estimation par capsules)  (`arme_dans_corps`)
Attendu : OK [-0.015, 99], toléré [-0.045, 99]. Pourquoi : Le fusil touche le gilet, il ne passe pas dedans. Source : Intégrité du maillage.

- **mineur** gign / patrouille : mesuré **-0.0181** (t = 3.97 s)

### mineur — Inclinaison latérale du buste (°, max absolu)  (`roulis_buste`)
Attendu : OK [0, 9], toléré [0, 16]. Pourquoi : Épaules carrées, pas avachies sur le côté. Source : FM 3-06.11 §3-23b ("Shoulders are square").

- **mineur** soldat / marche_visee_diagG : mesuré **9.67** (t = 3.5 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_marche_visee_diagG.jpg`
- **mineur** soldat / jog_vise_diagG : mesuré **9.67** (t = 2.27 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_jog_vise_diagG.jpg`
- **mineur** soldat / marche_accroupie : mesuré **9.39** (t = 3.23 s)
- **mineur** soldat / demi_tour : mesuré **9.26** (t = 1.2 s)
- **mineur** gign / jog_vise_diagG : mesuré **9.2** (t = 3.23 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/gign_jog_vise_diagG.jpg`
- **mineur** gign / marche_visee_diagG : mesuré **9.2** (t = 2.97 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/gign_marche_visee_diagG.jpg`
- **mineur** soldat / recul_vise : mesuré **9.09** (t = 3.07 s)
- **mineur** soldat / jog_vise_recul : mesuré **9.09** (t = 3.53 s)

### mineur — Garde basse : crosse ↔ creux de l'épaule (m, moyenne)  (`garde_basse_crosse`)
Attendu : OK [0, 0.07], toléré [0, 0.17]. Pourquoi : En garde basse CQB, la crosse reste dans l'épaule (ou juste sous l'aisselle en « garde haute ») : on n'a qu'à lever le canon pour tirer. Source : FM 3-06.11 §3-23a(1) ; Vortex Optics ("buttstock firmly seated in the shoulder pocket").

- **mineur** soldat / repos_garde_basse : mesuré **0.0773** (t = 2.1 s)
- **mineur** gign / jog_bas : mesuré **0.0772** (t = 2.9 s)
- **mineur** gign / patrouille : mesuré **0.0771** (t = 2.9 s)
- **mineur** gign / jog_bas_24 : mesuré **0.0763** (t = 2.9 s)
- **mineur** gign / jog_bas_rapide : mesuré **0.0761** (t = 2.9 s)
- **mineur** gign / repos_garde_basse : mesuré **0.0755** (t = 2.1 s)
- **mineur** soldat / jog_bas_rapide : mesuré **0.0752** (t = 2.9 s)
- **mineur** soldat / jog_bas : mesuré **0.0747** (t = 2.9 s)
- … et 7 autres états

### mineur — Œil ↔ plan vertical du canon (m, max absolu)  (`oeil_ligne_visee`)
Attendu : OK [0, 0.035], toléré [0, 0.07]. Pourquoi : Joue sur la crosse, l'œil est dans l'axe du viseur ; sinon le tireur « vise à côté ». Source : TC 3-22.9 fig. 6-1 (stock weld) ; FM 3-06.11 §3-23c (spot weld).

- **mineur** gign / depart_arret_vise : mesuré **0.036** (t = 1.3 s)

## Bas du corps (locomotion, pieds, jambes)

### MAJEUR — Patinage pondéré par la hauteur, pied droit (m/s : vitesse du point le plus bas × poids de contact)  (`patine_D`)
Attendu : OK [-1, 0.05], toléré [-1, 0.11]. Pourquoi : Mesure standard du « foot skating » : un pied près du sol ne doit pas se déplacer horizontalement. Source : Zhang et al. 2018 (Mode-Adaptive Neural Networks, mesure de patinage pondérée par la hauteur, H = 2,5 cm).

- **majeur** gign / jog_vise_diagG : mesuré **1.49** (t = 2.9 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/gign_jog_vise_diagG.jpg`
- **majeur** soldat / jog_vise_diagG : mesuré **1.2** (t = 2.9 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_jog_vise_diagG.jpg`
- **majeur** soldat / jog_vise_lateralD : mesuré **1.04** (t = 2.9 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_jog_vise_lateralD.jpg`
- **majeur** gign / jog_vise_lateralD : mesuré **1.01** (t = 2.9 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/gign_jog_vise_lateralD.jpg`
- **majeur** soldat / marche_visee_diagG : mesuré **0.968** (t = 2.9 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_marche_visee_diagG.jpg`
- **majeur** gign / marche_visee_diagG : mesuré **0.959** (t = 2.9 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/gign_marche_visee_diagG.jpg`
- **majeur** gign / pas_chasse_G : mesuré **0.951** (t = 2.9 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/gign_pas_chasse_G.jpg`
- **majeur** soldat / pas_chasse_G : mesuré **0.632** (t = 2.9 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_pas_chasse_G.jpg`
- … et 27 autres états

### MAJEUR — Patinage pondéré par la hauteur, pied gauche (m/s : vitesse du point le plus bas × poids de contact)  (`patine_G`)
Attendu : OK [-1, 0.05], toléré [-1, 0.11]. Pourquoi : Mesure standard du « foot skating » : un pied près du sol ne doit pas se déplacer horizontalement. Source : Zhang et al. 2018 (Mode-Adaptive Neural Networks, mesure de patinage pondérée par la hauteur, H = 2,5 cm).

- **majeur** soldat / jog_vise_diagG : mesuré **1.25** (t = 2.9 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_jog_vise_diagG.jpg`
- **majeur** gign / jog_vise_lateralD : mesuré **1.12** (t = 2.9 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/gign_jog_vise_lateralD.jpg`
- **majeur** soldat / jog_vise_lateralD : mesuré **1.1** (t = 2.9 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_jog_vise_lateralD.jpg`
- **majeur** gign / jog_vise_diagG : mesuré **0.995** (t = 2.9 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/gign_jog_vise_diagG.jpg`
- **majeur** soldat / pas_chasse_G : mesuré **0.888** (t = 2.9 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_pas_chasse_G.jpg`
- **majeur** gign / pas_chasse_G : mesuré **0.836** (t = 2.9 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/gign_pas_chasse_G.jpg`
- **majeur** soldat / pas_chasse_D : mesuré **0.78** (t = 2.9 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_pas_chasse_D.jpg`
- **majeur** gign / pas_chasse_D : mesuré **0.737** (t = 2.9 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/gign_pas_chasse_D.jpg`
- … et 36 autres états

### MAJEUR — Glissement du pied droit pendant l'appui (m/s moyen)  (`glisse_D`)
Attendu : OK [-1, 0.06], toléré [-1, 0.14]. Pourquoi : Un pied en appui est immobile par rapport au sol (adhérence) ; s'il patine, le personnage « glisse sur la glace ». Source : Biomécanique de la marche : vitesse du pied d'appui ≈ 0 (Perry & Burnfield, Gait Analysis).

- **majeur** soldat / sprint : mesuré **0.768** (t = 3.17 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_sprint.jpg`
- **majeur** soldat / recharge_marche : mesuré **0.596** (t = 2.9 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_recharge_marche.jpg`
- **majeur** gign / sprint : mesuré **0.524** (t = 3.73 s)
- **majeur** soldat / jog_bas_rapide : mesuré **0.381** (t = 3.1 s)
- **majeur** soldat / jog_bas_24 : mesuré **0.365** (t = 2.73 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_jog_bas_24.jpg`
- **majeur** gign / jog_bas_rapide : mesuré **0.332** (t = 4 s)
- **majeur** soldat / jog_vise_diagG : mesuré **0.317** (t = 3.7 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_jog_vise_diagG.jpg`
- **majeur** soldat / jog_vise_recul : mesuré **0.315** (t = 3.2 s)
- … et 28 autres états

### MAJEUR — Glissement du pied gauche pendant l'appui (m/s moyen)  (`glisse_G`)
Attendu : OK [-1, 0.06], toléré [-1, 0.14]. Pourquoi : Un pied en appui est immobile par rapport au sol (adhérence) ; s'il patine, le personnage « glisse sur la glace ». Source : Biomécanique de la marche : vitesse du pied d'appui ≈ 0 (Perry & Burnfield, Gait Analysis).

- **majeur** soldat / jog_bas_24 : mesuré **0.573** (t = 2.53 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_jog_bas_24.jpg`
- **majeur** soldat / sprint : mesuré **0.561** (t = 3.47 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_sprint.jpg`
- **majeur** gign / jog_bas_rapide : mesuré **0.481** (t = 3.33 s)
- **majeur** gign / jog_bas_24 : mesuré **0.452** (t = 2.43 s)
- **majeur** soldat / jog_bas_rapide : mesuré **0.449** (t = 2.33 s)
- **majeur** soldat / jog_bas : mesuré **0.435** (t = 3.67 s)
- **majeur** soldat / jog_vise_diagG : mesuré **0.42** (t = 2.5 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_jog_vise_diagG.jpg`
- **majeur** soldat / recharge_marche : mesuré **0.415** (t = 2.87 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_recharge_marche.jpg`
- … et 32 autres états

### MAJEUR — Orteils pliés (ToeBase / pied, moins la liaison, °, max absolu) talon posé OU pied en l'air (« orteil d'elfe »)  (`orteil_pied_plat`)
Attendu : OK [0, 10], toléré [0, 18]. Pourquoi : Talon posé ou pied en l'air : la botte est rigide, les orteils restent dans le prolongement du pied (≈ 0°). Une pointe relevée = chaussure de lutin, se voit de profil. Source : Signalé par l'utilisateur (captures/reference_video/pieds_trot_*.png) ; botte de combat à semelle rigide.

- **majeur** gign / recharge_marche : mesuré **58.9** (t = 1.6 s)
- **majeur** gign / recharge_arret : mesuré **45.1** (t = 1.6 s)
- **majeur** gign / depart_arret_vise : mesuré **45.1** (t = 2.6 s)
- **majeur** gign / repos_visee : mesuré **44.9** (t = 2.1 s)
- **majeur** gign / guet : mesuré **44.9** (t = 3.6 s)
- **majeur** gign / tir_arret : mesuré **44.9** (t = 2.1 s)
- **majeur** gign / demi_tour : mesuré **44.9** (t = 2 s)
- **majeur** soldat / recharge_marche : mesuré **40.5** (t = 1.6 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_recharge_marche.jpg`
- … et 8 autres états

### MAJEUR — Rebond vertical du bassin (m)  (`rebond_bassin`)
Attendu : OK [0.008, 0.03], toléré [0.004, 0.04]. Pourquoi : Marche : le bassin monte et descend de 4-5 cm ; marche tactique en visant (« glide ») : rebond ≤ 3 cm pour garder le viseur stable. Source : Biomécanique de la marche (excursion verticale du centre de masse ≈ 5 cm) ; FM 3-06.11 §3-15a ; vraie vidéo (captures/reference_video/) : marche visée, bassin ≤ 3 cm.

- **majeur** soldat / pas_chasse_G : mesuré **0.0869** (t = 2.9 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_pas_chasse_G.jpg`
- **majeur** gign / marche_visee_diagG : mesuré **0.0724** (t = 2.9 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/gign_marche_visee_diagG.jpg`
- **majeur** gign / pas_chasse_G : mesuré **0.0704** (t = 2.9 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/gign_pas_chasse_G.jpg`
- **majeur** gign / pas_chasse_D : mesuré **0.0598** (t = 2.9 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/gign_pas_chasse_D.jpg`
- **majeur** soldat / marche_visee_diagG : mesuré **0.0585** (t = 2.9 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_marche_visee_diagG.jpg`
- **majeur** soldat / recul_vise : mesuré **0.0533** (t = 2.9 s)
- **majeur** soldat / recul_diagD : mesuré **0.0533** (t = 2.9 s)
- **majeur** gign / recul_vise : mesuré **0.0525** (t = 2.9 s)
- … et 8 autres états

### MAJEUR — Botte écrasée / étirée : longueur talon ↔ pointe vs liaison (rapport − 1, max absolu)  (`botte_deformee`)
Attendu : OK [0, 0.08], toléré [0, 0.12]. Pourquoi : Une botte est rigide : sa longueur ne change pas de plus de quelques %. Au-delà de 8 %, le maillage est écrasé par la pose des os du pied. Source : Signalé par l'utilisateur (captures/reference_video/pieds_trot_*.png).

- **majeur** soldat / recharge_marche : mesuré **0.294** (t = 2.87 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_recharge_marche.jpg`
- **majeur** gign / recharge_marche : mesuré **0.23** (t = 2.83 s)
- **majeur** soldat / depart_arret_vise : mesuré **0.225** (t = 2.4 s)
- **majeur** soldat / demi_tour : mesuré **0.224** (t = 2.33 s)
- **majeur** soldat / guet : mesuré **0.223** (t = 1.2 s)
- **majeur** soldat / tir_arret : mesuré **0.221** (t = 1.2 s)
- **majeur** soldat / repos_visee : mesuré **0.22** (t = 1.2 s)
- **majeur** soldat / recharge_arret : mesuré **0.206** (t = 3 s)
- … et 15 autres états

### MAJEUR — Distance glissée sur l'appui le pire, pied gauche (m)  (`glisse_appui_G`)
Attendu : OK [-1, 0.03], toléré [-1, 0.07]. Pourquoi : Même un glissement lent devient visible s'il s'accumule sur un appui (plus de 3 cm). Source : idem.

- **majeur** soldat / jog_vise_diagG : mesuré **0.221** (t = 2.5 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_jog_vise_diagG.jpg`
- **majeur** soldat / marche_visee_diagG : mesuré **0.143** (t = 3.87 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_marche_visee_diagG.jpg`
- **majeur** soldat / jog_bas_24 : mesuré **0.117** (t = 2.53 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_jog_bas_24.jpg`
- **majeur** gign / depart_arret : mesuré **0.115** (t = 1.33 s)
- **majeur** soldat / depart_arret : mesuré **0.115** (t = 2.6 s)
- **majeur** soldat / sprint : mesuré **0.101** (t = 3.47 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_sprint.jpg`
- **majeur** soldat / virage_patrouille : mesuré **0.101** (t = 2 s)
- **majeur** soldat / recharge_marche : mesuré **0.0967** (t = 2.87 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_recharge_marche.jpg`
- … et 37 autres états

### MAJEUR — Genou qui rentre vers l'intérieur (valgus, °, max)  (`valgus_genou`)
Attendu : OK [-99, 8], toléré [-99, 15]. Pourquoi : Genoux dans l'axe des pieds ; un genou qui rentre (genoux en X) fait « faible » et instable. Source : vraie vidéo (captures/reference_video/) : soldat réel, marche en visant et course fusil en main ; biomécanique (valgus dynamique > 10° = défaut).

- **majeur** gign / marche_visee_diagD : mesuré **39.6** (t = 3.9 s)
- **majeur** soldat / marche_visee_diagD : mesuré **34.7** (t = 3.97 s)
- **majeur** gign / depart_arret_vise : mesuré **32.4** (t = 2.6 s)
- **majeur** gign / marche_visee : mesuré **32.4** (t = 2.7 s)
- **majeur** gign / jog_vise : mesuré **31.9** (t = 3.7 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/gign_jog_vise.jpg`
- **majeur** soldat / depart_arret_vise : mesuré **30** (t = 1.4 s)
- **majeur** soldat / jog_bas_rapide : mesuré **28.2** (t = 2.67 s)
- **majeur** soldat / marche_visee : mesuré **27.9** (t = 2.73 s)
- … et 22 autres états

### MAJEUR — Cadence en course (pas/min)  (`cadence_course`)
Attendu : OK [140, 190], toléré [125, 205]. Pourquoi : Course légère 2,5-3,5 m/s : 150-180 pas/min. Source : Biomécanique de la course (cadence usuelle 160-180).

- **majeur** gign / jog_vise_recul : mesuré **257** (t = 2.9 s)
- **majeur** gign / jog_bas_rapide : mesuré **225** (t = 2.9 s)
- **majeur** soldat / jog_bas_rapide : mesuré **206** (t = 2.9 s)
- **mineur** gign / jog_bas_24 : mesuré **204** (t = 2.9 s)
- **mineur** soldat / jog_bas_24 : mesuré **196** (t = 2.9 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_jog_bas_24.jpg`
- **mineur** soldat / jog_vise_recul : mesuré **138** (t = 2.9 s)

### MAJEUR — Flexion du genou à la pose du pied (°)  (`genou_attaque`)
Attendu : OK [3, 28], toléré [0, 38]. Pourquoi : Marche normale : genou presque tendu à l'attaque (≈ 5°), puis 15-20° en mise en charge ; marche tactique en visant : genoux un peu plus fléchis ; course : ≈ 20°. Source : Normal gait FRCS (genou 5° à l'attaque, 20° en mise en charge, 60° en oscillation) ; FM 3-06.11 §3-23b (genoux légèrement fléchis).

- **majeur** soldat / recul_vise : mesuré **69.8** (t = 2.9 s)
- **majeur** soldat / recul_diagD : mesuré **68.5** (t = 2.9 s)
- **majeur** soldat / jog_vise_recul : mesuré **70.2** (t = 2.9 s)
- **majeur** gign / recul_vise : mesuré **58.3** (t = 2.9 s)
- **majeur** soldat / marche_visee_diagD : mesuré **49.8** (t = 2.9 s)
- **majeur** soldat / marche_visee : mesuré **49.6** (t = 2.9 s)
- **majeur** gign / recul_diagD : mesuré **49.5** (t = 2.9 s)
- **majeur** gign / marche_visee_diagD : mesuré **44.2** (t = 2.9 s)
- … et 6 autres états

### MAJEUR — Distance glissée sur l'appui le pire, pied droit (m)  (`glisse_appui_D`)
Attendu : OK [-1, 0.03], toléré [-1, 0.07]. Pourquoi : Même un glissement lent devient visible s'il s'accumule sur un appui (plus de 3 cm). Source : idem.

- **majeur** soldat / depart_arret : mesuré **0.159** (t = 1.37 s)
- **majeur** soldat / demi_tour : mesuré **0.154** (t = 1.5 s)
- **majeur** gign / demi_tour : mesuré **0.152** (t = 1.93 s)
- **majeur** soldat / jog_vise_lateralD : mesuré **0.15** (t = 3.6 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_jog_vise_lateralD.jpg`
- **majeur** soldat / jog_vise_recul : mesuré **0.138** (t = 3.2 s)
- **majeur** soldat / sprint : mesuré **0.134** (t = 3.17 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_sprint.jpg`
- **majeur** soldat / pas_chasse_D : mesuré **0.13** (t = 2.77 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_pas_chasse_D.jpg`
- **majeur** gign / sprint : mesuré **0.118** (t = 3.73 s)
- … et 36 autres états

### MAJEUR — À-coup de rotation : LeftFoot (°/s², pic)  (`acoup_LeftFoot`)
Attendu : OK [0, 20000], toléré [0, 35000]. Pourquoi : Un os qui change brusquement de vitesse de rotation d'une image à l'autre = saccade (« pop ») ; les vrais mouvements sont lisses. Source : Qualité d'animation (continuité de la vitesse).

- **majeur** soldat / jog_bas : mesuré **62757** (t = 3.8 s)
- **majeur** soldat / jog_bas_rapide : mesuré **60190** (t = 1.93 s)
- **majeur** soldat / jog_bas_24 : mesuré **49502** (t = 3.37 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_jog_bas_24.jpg`
- **majeur** gign / jog_bas_24 : mesuré **49423** (t = 1.97 s)
- **majeur** gign / jog_bas_rapide : mesuré **47317** (t = 2.9 s)
- **mineur** gign / jog_bas : mesuré **30221** (t = 3.7 s)
- **mineur** soldat / sprint : mesuré **23064** (t = 3.2 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_sprint.jpg`
- **mineur** soldat / jog_vise_diagG : mesuré **21840** (t = 3.13 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_jog_vise_diagG.jpg`

### MAJEUR — Pointe du pied tendue vers le bas en l'air (flexion plantaire vs liaison, °, max ; pied à plus de 5 cm du sol)  (`plantaire_oscillation`)
Attendu : OK [-99, 25], toléré [-99, 30]. Pourquoi : En oscillation le pied reste à peu près à angle droit avec le tibia (il se relève même pour passer) ; une pointe tendue = pied de danseuse, botte « froissée ». Source : Signalé par l'utilisateur ; marche normale : cheville ≈ neutre en oscillation (FRCS).

- **majeur** gign / recharge_marche : mesuré **38.7** (t = 1.6 s)
- **majeur** soldat / recharge_marche : mesuré **38** (t = 1.6 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_recharge_marche.jpg`
- **majeur** soldat / depart_arret_vise : mesuré **35.3** (t = 2.6 s)
- **majeur** gign / depart_arret_vise : mesuré **35** (t = 2.6 s)
- **mineur** soldat / marche_accroupie : mesuré **27.4** (t = 2.9 s)
- **mineur** gign / marche_accroupie : mesuré **26.7** (t = 2.9 s)

### MAJEUR — Talon le plus haut pendant l'oscillation (m, « talons aux fesses »)  (`hauteur_talon`)
Attendu : OK [0, 0.12], toléré [0, 0.18]. Pourquoi : Un tireur qui marche en visant rase le sol (pas glissés, pieds bas) ; en petite course le talon remonte peu. Talon très haut derrière = foulée de sprinteur, pas de tactique. Source : vraie vidéo (captures/reference_video/) : soldat réel, marche en visant et course fusil en main (pieds bas, talon < 12 cm en marche visée, < 25 cm en course).

- **majeur** soldat / recul_vise : mesuré **0.264** (t = 3.1 s)
- **majeur** soldat / recul_diagD : mesuré **0.264** (t = 3.1 s)
- **majeur** soldat / marche_visee : mesuré **0.263** (t = 2.83 s)
- **majeur** soldat / marche_visee_diagD : mesuré **0.263** (t = 2.83 s)
- **majeur** gign / recul_vise : mesuré **0.256** (t = 2.93 s)
- **majeur** gign / recul_diagD : mesuré **0.256** (t = 2.93 s)
- **majeur** gign / marche_visee : mesuré **0.253** (t = 2.2 s)
- **majeur** gign / marche_visee_diagD : mesuré **0.253** (t = 2.2 s)
- … et 20 autres états

### MAJEUR — Largeur de pas (m, entre chevilles à la pose du pied)  (`largeur_pas`)
Attendu : OK [0.05, 0.26], toléré [0.02, 0.33]. Pourquoi : Largeur de pas humaine 8-17 cm ; plus étroit = marche sur un fil (mannequin), plus large = cow-boy. Source : PMC3756042 ; Molina, Small & Neptune 2023 (J. Biomech.).

- **majeur** gign / marche_accroupie : mesuré **0.371** (t = 2.9 s)
- **mineur** soldat / marche_accroupie : mesuré **0.32** (t = 2.9 s)
- **mineur** gign / marche_visee : mesuré **0.32** (t = 2.9 s)
- **mineur** gign / jog_vise : mesuré **0.314** (t = 2.9 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/gign_jog_vise.jpg`
- **mineur** soldat / jog_vise : mesuré **0.301** (t = 2.9 s)
- **mineur** soldat / marche_visee : mesuré **0.3** (t = 2.9 s)

### MAJEUR — À-coup de rotation : RightFoot (°/s², pic)  (`acoup_RightFoot`)
Attendu : OK [0, 20000], toléré [0, 35000]. Pourquoi : Un os qui change brusquement de vitesse de rotation d'une image à l'autre = saccade (« pop ») ; les vrais mouvements sont lisses. Source : Qualité d'animation (continuité de la vitesse).

- **majeur** gign / jog_bas_24 : mesuré **43623** (t = 3.9 s)
- **majeur** gign / jog_bas_rapide : mesuré **42029** (t = 3.6 s)
- **majeur** soldat / jog_bas_rapide : mesuré **38042** (t = 2.1 s)
- **mineur** soldat / jog_bas : mesuré **33997** (t = 2.6 s)
- **mineur** soldat / jog_bas_24 : mesuré **28756** (t = 2.9 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_jog_bas_24.jpg`
- **mineur** soldat / sprint : mesuré **20899** (t = 3.63 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_sprint.jpg`

### MAJEUR — Genoux fléchis en visée à l'arrêt (°, moyenne)  (`genoux_flechis_arret`)
Attendu : OK [6, 30], toléré [2, 40]. Pourquoi : Genoux légèrement fléchis, jamais verrouillés (absorbe le recul, prêt à bouger). Source : FM 3-06.11 §3-23b ("Knees are slightly bent").

- **majeur** soldat / demi_tour : mesuré **41.1** (t = 2 s)
- **mineur** gign / demi_tour : mesuré **36.6** (t = 2 s)

### mineur — Torsion épaules / bassin (°, max absolu)  (`torsion`)
Attendu : OK [0, 45], toléré [0, 62]. Pourquoi : La colonne tourne d'environ 40-50° au plus entre bassin et épaules ; au-delà le buste est « vissé » sur les hanches. Source : Amplitude de rotation thoraco-lombaire (≈ 40-50°).

- **mineur** soldat / pas_chasse_G : mesuré **60.5** (t = 2.97 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_pas_chasse_G.jpg`
- **mineur** gign / pas_chasse_G : mesuré **59** (t = 3.53 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/gign_pas_chasse_G.jpg`
- **mineur** soldat / recul_diagD : mesuré **52.8** (t = 3.17 s)
- **mineur** gign / recul_diagD : mesuré **51.4** (t = 3 s)
- **mineur** gign / guet_accroupi : mesuré **48.3** (t = 6 s)
- **mineur** gign / accroupi : mesuré **48.3** (t = 3 s)
- **mineur** soldat / guet_accroupi : mesuré **45.8** (t = 6 s)
- **mineur** soldat / accroupi : mesuré **45.8** (t = 3 s)

### mineur — Écart des chevilles vu de face (m, moyenne, axe gauche-droite du corps)  (`ecart_face`)
Attendu : OK [0.15, 0.25], toléré [0.1, 0.32]. Pourquoi : Base large et stable en marche visée (pieds à largeur d'épaules, jamais en ligne) ; en course, pieds sous les hanches mais pas sur une seule ligne. Source : vraie vidéo (captures/reference_video/) : soldat réel, marche en visant et course fusil en main.

- **mineur** gign / jog_vise : mesuré **0.312** (t = 2.9 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/gign_jog_vise.jpg`
- **mineur** soldat / jog_vise : mesuré **0.3** (t = 2.9 s)

### mineur — Pas chassé : écart min des chevilles le long de la ligne des hanches (m)  (`pieds_croises_lateral`)
Attendu : OK [0.06, 9], toléré [0.02, 9]. Pourquoi : En déplacement latéral en visant, on ne croise jamais les pieds (perte d'équilibre) : pas glissés, pieds qui se rapprochent sans se croiser. Source : TC 3-22.9 ch. 9 (lateral movement) ; doctrine CQB courante.

- **mineur** gign / pas_chasse_G : mesuré **0.0253** (t = 2.8 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/gign_pas_chasse_G.jpg`
- **mineur** gign / jog_vise_diagG : mesuré **0.0506** (t = 2.17 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/gign_jog_vise_diagG.jpg`
- **mineur** gign / recul_diagD : mesuré **0.0579** (t = 3.83 s)
- **mineur** soldat / pas_chasse_G : mesuré **0.0581** (t = 3.53 s) — preuve `../operator-tactics-pc/resultats/2026-10-19_00-37/revue/preuves/soldat_pas_chasse_G.jpg`

### mineur — Longueur de pas / longueur humaine attendue à cette vitesse (rapport)  (`longueur_pas`)
Attendu : OK [0.8, 1.2], toléré [0.62, 1.38]. Pourquoi : À vitesse donnée, l'humain choisit sa longueur de pas (rapport longueur/cadence ≈ 0,0065 m/(pas/min)) : 1,35 m/s ≈ 0,72 m et 113 pas/min. Trop longs = enjambées molles « au ralenti » ; trop courts = trottinement. Source : Sekiya & Nagasaki 1998 (walk ratio) ; Wikipedia Preferred walking speed (1,4 m/s).

- **mineur** soldat / marche_accroupie : mesuré **1.34** (t = 2.9 s)
- **mineur** gign / marche_accroupie : mesuré **1.32** (t = 2.9 s)
- **mineur** soldat / patrouille_lente : mesuré **1.31** (t = 2.9 s)
- **mineur** gign / patrouille_lente : mesuré **1.27** (t = 2.9 s)

### mineur — Pied du côté du tir en arrière (m, pied gauche devant > 0)  (`appui_decale_arret`)
Attendu : OK [0.04, 0.38], toléré [-0.04, 0.48]. Pourquoi : Le pied du côté du tir (droit) est légèrement en retrait (appui décalé « talon-orteil »). Source : FM 3-06.11 §3-23b ("firing side foot slightly staggered to the rear").

- **mineur** soldat / demi_tour : mesuré **0.401** (t = 2 s)
- **mineur** gign / demi_tour : mesuré **0.394** (t = 2 s)

### mineur — À-coup de rotation : Hips (°/s², pic)  (`acoup_Hips`)
Attendu : OK [0, 2500], toléré [0, 5000]. Pourquoi : Un os qui change brusquement de vitesse de rotation d'une image à l'autre = saccade (« pop ») ; les vrais mouvements sont lisses. Source : Qualité d'animation (continuité de la vitesse).

- **mineur** gign / jog_bas_rapide : mesuré **2929** (t = 3 s)
- **mineur** soldat / jog_bas_rapide : mesuré **2650** (t = 2.03 s)
- **mineur** gign / jog_bas_24 : mesuré **2560** (t = 2.67 s)

### mineur — Largeur des pieds en visée à l'arrêt (m)  (`appui_largeur_arret`)
Attendu : OK [0.22, 0.48], toléré [0.15, 0.58]. Pourquoi : Position de tir debout : pieds à largeur d'épaules (≈ 30-40 cm entre chevilles). Source : FM 3-06.11 §3-23b ("Feet are about shoulder-width apart").

- **mineur** gign / demi_tour : mesuré **0.21** (t = 2 s)
