# Rubrique de revue d'animation : gestes tactiques réels

Cette page sert de référence à la revue automatique (`rubrique.py` applique ces seuils, `metriques.js` mesure).
Chaque critère donne une zone **OK**, une zone **tolérée** (mineur) ; au-delà c'est **majeur**.
Les mesures sont en mètres et en degrés, dans le monde, pour un personnage de 1,80 m, sol à y = 0.

Fiabilité de chaque critère :
- **[sûr]** : géométrie pure, aucun faux positif connu.
- **[estimé]** : passe par une approximation (capsules, point de détente, creux d'épaule). Toujours confirmer sur image.
- **[réglé]** : seuil calé sur les animations capturées d'origine plutôt que sur une source.

## 1. Sources

| Abréviation | Référence | Ce qu'on en tire |
|---|---|---|
| FM 3-06.11 | US Army FM 3-06.11 *Combined Arms Operations in Urban Terrain*, ch. 3 ([theblackvault.com/documents/fm/fm30611/ch3.pdf](https://www.theblackvault.com/documents/fm/fm30611/ch3.pdf)) | §3-23a(1) garde basse : « butt of the weapon placed firmly in the pocket of the shoulder with the barrel pointed down at a 45-degree angle ». §3-23a(2) garde haute : crosse sous l'aisselle, canon légèrement relevé. §3-15a déplacement : crosse dans l'épaule, canon un peu bas, « muzzle pointed in the direction of travel », « both eyes open and swing the muzzle as they turn their head ». §3-23b tir réflexe : « feet about shoulder-width apart », pied du côté du tir légèrement en arrière, « knees slightly bent and the upper body leaned slightly forward », « shoulders square ». §3-7a / 3-28 couvert : tirer autour du couvert et non par-dessus, rester en retrait, à genou pour réduire l'exposition. |
| TC 3-22.9 | US Army TC 3-22.9 *Rifle and Carbine* (2016) ([irp.fas.org/doddir/army/tc3-22-9.pdf](https://irp.fas.org/doddir/army/tc3-22-9.pdf)) | Règle de sécurité 3 (p. 1-3) : « Keep finger straight and off the trigger until ready to fire ». Fig. 6-1 stock weld (joue sur la crosse). Fig. 8-2 position naturelle de l'index sur la détente. Ch. 6 positions (garde basse, garde basse resserrée, garde haute). Ch. 9 déplacements avant, latéral, arrière et virages. |
| Vortex | Vortex Optics, « Modern low ready » (2022) ([vortexoptics.com](https://vortexoptics.com/blog/tactical-carbine-are-you-getting-the-most-out-of-the-modern-low-ready.html)) | Garde basse moderne : crosse bien en place dans le creux de l'épaule, canon juste assez bas pour voir les mains de la menace, tête droite et libre de balayer, main d'appui en avant sur le garde-main, main forte haute sur la poignée. Variante « compressed » : crosse au-dessus de l'épaule, en CQB seulement. |
| FRCS | *Normal gait – FRCS revision* (Newcastle) ([lists.ncl.ac.uk](https://lists.ncl.ac.uk/wws/d_read/orthnorth/Basic%20Science%202013/Normal%20gait%20-%20FRCS%20revision.pdf)) | Genou : 5° à l'attaque du talon, jusqu'à 20° en mise en charge, 60° maximum en oscillation. Hanche fléchie de 30° à l'attaque. Appui 60 % du cycle, oscillation 40 %. |
| PMC3756042 | *Two independent contributions to step variability during over-ground human walking* ([pmc.ncbi.nlm.nih.gov/articles/PMC3756042](https://pmc.ncbi.nlm.nih.gov/articles/PMC3756042)) | Jeunes adultes à vitesse libre (1,51 m/s) : longueur de pas 0,79 ± 0,04 m, largeur de pas 0,17 ± 0,04 m (entre talons). |
| Molina 2023 | Molina, Small & Neptune, *J. Biomech.* 2023 ([sites.utexas.edu/neptune](https://sites.utexas.edu/neptune/wp-content/uploads/sites/6031/2023/07/job157.pdf)) | Vitesse libre 1,3 ± 0,2 m/s. La largeur de pas est réglée finement par l'équilibre. |
| Vitesse | Wikipedia, *Preferred walking speed* et *Walking* | Marche 1,1 à 1,65 m/s (≈ 1,4 m/s), environ 100 à 115 pas/min. |
| Walk ratio | Sekiya & Nagasaki 1998 *(connaissance générale, non relue ici)* | Rapport longueur de pas / cadence ≈ 0,0065 m/(pas/min), à peu près constant chez l'adulte. D'où L = √(v·60·0,0065) : 1,35 m/s → 0,72 m et 113 pas/min. |
| Patinage | Zhang et al. 2018, *Mode-Adaptive Neural Networks* *(connaissance générale)* | Mesure standard du patinage des pieds : vitesse horizontale pondérée par (2 − 2^(h/H)), avec H = 2,5 cm. |
| Amplitudes | Amplitudes articulaires usuelles *(connaissance générale)* | Rotation thoraco-lumbaire ≈ 40-50°. Poignet : flexion ≈ 70-80°, extension ≈ 70°, déviations 20-35°. Genou : hyperextension 0 à -5° au plus. |

## 2. Critères — bas du corps (`partie = bas`)

| id | Mesure | OK | Toléré | Pourquoi (réel) |
|---|---|---|---|---|
| `pied_dans_sol` [sûr] | point le plus bas de la semelle | ≥ -1,5 cm | ≥ -3,5 cm | La botte repose sur le sol. |
| `pied_flotte_arret` [sûr] | à l'arrêt, plus longue durée d'un pied à plus de 2,5 cm du sol | ≤ 0,45 s | ≤ 0,9 s | Immobile, les deux pieds portent le poids (FM 3-06.11 §3-23b) ; un pas de replacement (< 0,4 s) est normal. |
| `glisse_G/D` [estimé : détection d'appui] | vitesse moyenne du point de semelle au sol pendant l'appui | ≤ 0,06 m/s | ≤ 0,14 | Un pied d'appui ne bouge pas (adhérence). Les images où le pied bas va plus vite que le corps sont de l'oscillation au ras du sol : comptées dans `rase`. |
| `glisse_appui_G/D` | distance perdue sur l'appui le pire | ≤ 3 cm | ≤ 7 cm | idem |
| `patine_G/D` [sûr] | patinage pondéré par la hauteur (Zhang 2018) | ≤ 0,05 m/s | ≤ 0,11 | idem, sans seuil d'appui |
| `pieds_croises` [sûr] | écart min des chevilles le long de la ligne des hanches | ≥ 3 cm | ≥ -1 cm | Chaque pied sur sa ligne (largeur de pas 8-17 cm). |
| `pieds_croises_lateral` [sûr] | idem, en pas chassé, diagonale ou recul | ≥ 6 cm | ≥ 2 cm | On ne croise jamais les pieds en se déplaçant latéralement en visant (TC 3-22.9 ch. 9). |
| `tibias_se_touchent` [estimé : capsules] | distance des tibias moins leurs rayons | ≥ -1 cm | ≥ -3,5 cm | Les jambes ne s'interpénètrent pas. |
| `largeur_pas` | écart latéral entre deux poses de pied | 5-26 cm | 2-33 cm | PMC3756042. |
| `longueur_pas` | longueur de pas / longueur attendue (walk ratio) | 0,8-1,2 | 0,62-1,38 | Trop long = enjambées molles, trop court = trottinement. |
| `cadence_course` | pas/min en course | 140-190 | 125-205 | Une course légère tourne à 150-180 pas/min. Plus vite, on allonge la foulée. |
| `genou_attaque` | flexion du genou à la pose du pied | marche 0-18°, marche visée 3-28°, course 8-38° | ±10° | FRCS. FM 3-06.11 : genoux fléchis en tactique. |
| `genou_envers` [sûr] | angle entre le sens où pointe le genou (écart à la ligne hanche → cheville) et l'avant du **bassin**, jambe fléchie > 8° | ≤ 75° | ≤ 100° | Un genou ne plie que vers l'avant. Au-delà de 100° : jambe « cassée » (signalée par l'utilisateur en jeu ; souvent une seule image sur la jambe arrière). |
| `genou_hyperextension` | jambe presque tendue (< 20°), genou en arrière de la ligne hanche → cheville selon l'avant du bassin | ≥ -3° | ≥ -8° | Anatomie. |
| `angle_pied` | angle pied / déplacement en appui, pied à plat seulement (+ = pointe vers l'extérieur) ; axe du pied = axe principal (ACP) de la bande basse de la semelle, pose de liaison | -6 à 22° | -14 à 32° | Les pieds suivent le déplacement, ouverts de 5 à 10°. |
| `bassin_vs_deplacement` | bassin / déplacement, marche avant sans visée | ≤ 20° | ≤ 35° | Bassin face au déplacement (±4-5°). |
| `torsion` | épaules / bassin | ≤ 45° | ≤ 62° | Rotation de la colonne. |
| `rebond_bassin` | rebond vertical du bassin | marche 2-6,5 cm, visée 1,2-5 cm | — | Centre de masse ≈ 5 cm. En marche tactique, le rebond est réduit pour garder le viseur stable. |
| `appui_largeur_arret` | largeur des pieds en visée à l'arrêt | 22-48 cm | 15-58 | FM 3-06.11 §3-23b. |
| `appui_decale_arret` | pied du côté du tir en arrière | 4-38 cm | -4 à 48 | FM 3-06.11 §3-23b. |
| `genoux_flechis_arret` | flexion moyenne des genoux en visée à l'arrêt | 6-30° | 2-40° | « Knees slightly bent ». |

## 3. Critères — haut du corps (`partie = haut`)

| id | Mesure | OK | Toléré | Pourquoi (réel) |
|---|---|---|---|---|
| `penche_avant` | inclinaison bassin → cou vers l'avant | visée et course 5-22°, sinon 0-16° | ±4-8° | « Upper body leaned slightly forward », jamais en arrière. |
| `roulis_buste` | inclinaison latérale | ≤ 9° | ≤ 16° | « Shoulders are square ». |
| `paume_poignee` [sûr] | ligne poignet → jointures (50/65/80 %) ↔ surface de l'arme, moins 1,5 cm d'épaisseur de main | ≤ 3 cm | ≤ 5,5 cm | Main forte sur la poignée. |
| `paume_garde_main` [sûr] | paume gauche ↔ surface de l'arme | ≤ 3 cm | ≤ 5,5 cm | Main d'appui qui serre le garde-main (Vortex). |
| `paume_garde_main_pos` | main d'appui, distance devant la poignée | 17-42 cm | 12-50 cm | Sur le garde-main : ni sur le chargeur, ni au-delà de la bouche. |
| `doigts_dans_arme` [sûr, à la normale du maillage près] | distance signée min des sommets du GANT au bout de chaque doigt (10 sommets les plus distaux) | ≥ -4 mm | ≥ -12 mm | Un doigt ne traverse pas le métal. |
| `doigts_poignee` | majeur, annulaire et auriculaire droits ↔ arme | ≤ 2,5 cm | ≤ 4,5 cm | Trois doigts enroulés sur la poignée. |
| `doigts_garde_main` | médiane des 5 doigts gauches ↔ arme | ≤ 3 cm | ≤ 5 cm | La main enveloppe le garde-main. |
| `index_hors_detente` | courbure de l'index (somme de 3 angles, MOINS celle de la pose de liaison) quand on ne tire pas | ≤ 50° | ≤ 80° | TC 3-22.9 règle 3. |
| `index_sur_detente_tir` [estimé : point de détente] | bout de l'index ↔ détente en tirant | ≤ 2,5 cm | ≤ 4,5 cm | TC 3-22.9 fig. 8-2. |
| `erreur_visee` [sûr] | angle canon / (bouche → cible) | arrêt ≤ 2,5°, mobile ≤ 4° | 6° / 9° | À 10 m, 3° d'erreur font 50 cm. |
| `crosse_epaule` [estimé : creux] | plaque de couche ↔ creux de l'épaule | ≤ 6 cm | ≤ 9 cm | FM 3-06.11 §3-15a, §3-23a. Creux pris 11 cm vers le centre depuis l'articulation de l'épaule, 6 cm devant (entre deltoïde et clavicule). |
| `oeil_ligne_visee` [estimé : œil DROIT = os headfront + 7,2 cm vers le haut, 3,2 cm vers la droite] | œil droit ↔ plan vertical du canon | ≤ 3,5 cm | ≤ 7 cm | Joue sur la crosse, œil derrière le viseur (TC 3-22.9 fig. 6-1). |
| `oeil_hauteur` [estimé : œil ±2 cm] | œil droit au-dessus de l'axe du canon | 3-11 cm | 0-15 cm | Viseur point rouge ≈ 6,5 cm au-dessus de l'axe : plus haut = fusil sous le menton, l'œil ne voit pas dans le viseur. |
| `tete_vs_canon` [sûr] | lacet tête / canon en visée | ≤ 12° | ≤ 22° | « Swing the muzzle as they turn their head ». |
| `tete_tangage` | tangage de la tête | ≤ 22° | ≤ 35° | Tête haute, on balaie la zone. |
| `tete_figee` [réglé] | vitesse angulaire max de la tête en marche | ≥ 4°/s | ≥ 1°/s | La tête est stabilisée sans être soudée au monde. |
| `coude_aile` | coude droit au-dessus de l'épaule | ≤ 0 | ≤ 6 cm | Coudes bas (CQB moderne). |
| `poignets` [estimé : axe de la main] | angle avant-bras / main | ≤ 55° | ≤ 72° | Amplitude du poignet. |
| `garde_basse_canon` | tangage du canon en garde basse ou patrouille | -55 à -15° | -70 à -6° | FM 3-06.11 (45°) et Vortex (canon juste baissé). |
| `garde_basse_direction` [sûr] | azimut du canon / déplacement ou face | ≤ 30° | ≤ 50° | Canon dans la direction de marche (FM 3-06.11 §3-15a). |
| `garde_basse_crosse` [estimé] | crosse ↔ creux de l'épaule en garde basse | ≤ 7 cm | ≤ 17 cm | Crosse dans l'épaule en garde basse CQB. |
| `bouche_sur_soi` [sûr] | rayon du canon ↔ ses propres jambes et pieds | ≥ 4 cm | ≥ 0 | On ne pointe jamais son propre corps. |
| `arme_dans_corps` / `arme_dans_tete` [estimé : capsules] | arme (devant la poignée) ↔ torse ou tête | ≥ -1,5 cm / ≥ -1 cm | -4,5 / -3 cm | L'arme touche, elle ne traverse pas. |
| `cant_arme` | roulis de l'arme en visée | ≤ 8° | ≤ 18° | Viseur à 12 h. |
| `acoup_*` [réglé] | pic d'accélération angulaire (°/s²) des os principaux et de l'arme | mains et arme ≤ 3 500, bassin, dos et tête ≤ 2 500, pieds ≤ 20 000 | ×2 | Saccades et « pops ». Seuils calés sur les cycles capturés d'origine. |

## 4. Pièges connus (faux positifs)
- **Capsules** (tibias, arme ↔ torse ou tête) : rayons pris comme la médiane des sommets de chaque os. Les gilets épais et les casques donnent des approximations. Toujours vérifier sur la planche.
- **Creux d'épaule et œil** : positions estimées. Une différence de ±3 cm n'est pas un défaut.
- **Glissement** : un pied qui rase le sol en oscillation n'est pas un appui. Les images où le pied bas va plus vite que le corps sont exclues. `patine_*` sert de contrôle sans seuil.
- **Doigts** : reconnus par leur position. Les noms d'os Meshy sont permutés ; ne jamais se fier au nom.
- **Banc ≠ jeu** : le banc rejoue `animateSkinned()` de app.js, mais ses vitesses et directions sont choisies. Les vitesses réelles se lisent avec `jeu.py`. La vérité de terrain, c'est le jeu.
- **Sens du genou** : mesuré dans le repère du bassin (pas du pied : sur la pointe ou sur la jambe arrière, l'axe du pied n'a plus de sens). Les retournements durent souvent UNE image : regarder la bande de profil image par image (`jeu.py --suivre NOM --de I --a J`), pas seulement 4 instants.
- **Œil** : l'os `headfront` des modèles Meshy est à hauteur de bouche ; l'œil droit est estimé 7,2 cm plus haut et 3,2 cm à droite. Vérifier avec `--marques` (point blanc) sur la vue `tete`.
- **Yeux du banc** : le banc rejoue `syncMeshes()` du jeu (lacet du corps) et une cible affichée qui bouge à chaque image, comme en jeu. Une cible qui ne bouge qu'aux pas de simulation (0,1 s) fabriquait de faux à-coups de 10 000 °/s².
- **Points de mesure du maillage** (leçons apprises) : sur ces modèles Meshy, l'os de bout de doigt (« …4 ») est 1 à 3 cm DANS le doigt, l'os `headfront` est à hauteur de bouche, et le sommet le plus en avant de la botte est côté gros orteil. Toujours mesurer sur la PEAU (sommets) et des axes robustes (ACP), calibrés dans la pose de liaison — jamais dans la pose du moment.
- **Transitions en jeu** : les 0,4 premières secondes de chaque segment (changement d'état) sont exclues des critères de posture (la tête qui précède le fusil est naturelle) ; les à-coups jugent les transitions.
