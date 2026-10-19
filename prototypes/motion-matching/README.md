# Prototype motion matching (séparé du jeu)

Objectif : remplacer les clips fixes de `web/soldat3d.js` par du **motion matching** — choisir et enchaîner en temps réel
des morceaux de vraies captures de mouvement. Rien ici n'est branché dans le jeu pour l'instant.

## Données (licences vérifiées, usage commercial autorisé)
| Source | Licence | Où | Remarque |
|---|---|---|---|
| 100STYLE (Ian Mason), version re-ciblée par Daniel Holden | CC BY 4.0 (attribution dans les crédits) | `donnees/100style/` (non versionné) | squelette « Geno » aux noms quasi Mixamo, 60 fps, cm |
| CMU Graphics Lab Motion Capture Database (conversion BVH de B. Hahne) | libre, y compris produits commerciaux ; ne pas revendre les données ; remerciement demandé | `donnees/cmu/` (non versionné) | 120 fps, squelettes variables |

Écartés car **non commerciaux** : LaFAN1 (Ubisoft, CC BY-NC-ND), Bandai Namco (CC BY-NC-ND), AMASS / HumanML3D.
Le maillage `Geno.fbx` du dépôt de Holden est lui aussi non commercial : on n'utilise que les BVH.

Attribution à mettre dans les crédits du jeu :
- « 100STYLE dataset — Ian Mason (CC BY 4.0), version re-ciblée par Daniel Holden »
- « The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217. »

## Dossiers
- `outils/bvh.py` — lecteur BVH → numpy (squelette, quaternions locaux, racine).
- `outils/preparer.py` — fabrique la base de motion matching (fiches par image) → `web/base.json`.
- `web/` — page jouable three.js r159 : un soldat, clavier ou chemin, indicateur de glissement des pieds.
- `donnees/` — captures brutes téléchargées (ignorées par git).

## Fabriquer et lancer
```
# données : BVH 100STYLE (Neutral_*, Crouched_*) dans donnees/100style/ + donnees/Geno_bind.bvh (dépôt orangeduck/100style-retarget)
python3 outils/preparer.py donnees/100style/Neutral_*.bvh donnees/100style/Crouched_*.bvh --sortie web/base --bind donnees/Geno_bind.bvh
cp ../../web/three.min.js ../../web/gltf.js web/ && cp ../../web/hd/gign_hd.glb web/      # copies, non versionnées
python3 ../../outils/serveur.py ../.. 8765   →  http://127.0.0.1:8765/prototypes/motion-matching/web/
```
Mode test sans boucle automatique : `index.html?manual=1` puis `API.step(n)`, `API.touches({KeyW:1})`, `API.mesures()`, `PARAMS` (rattrapage, verrou, marges de saut).

## État (19/10, soir)
- Simulation à pas fixe 1/60 s (affichage libre). Retargeting Geno → Mixamo par écart à la pose de liaison du skin, pieds et
  orteils gardant l'inclinaison du modèle, échelle hanches→orteils.
- Motion matching : fiche 27 nombres (pieds ×2, vitesses pieds et hanches, trajectoire future 0,33/0,67/1 s), poids
  pieds 2 / vitesses pieds 1,5 / hanches 1 / trajectoire 1 / regard 1,5 ; recherche brute 41 600 images toutes les 0,1 s
  (0,37 ms par pas de simulation sur une machine lente) ; saut seulement si 20 % mieux, 0,25 s mini entre deux sauts ;
  au repos : séquences de repos seulement (sauts rares : 40 % mieux, 1 s mini) et racine figée ; si on veut avancer alors
  que l'animation est arrêtée (départ, virage serré), la meilleure image est prise sans marge (sinon un repos atypique peut
  bloquer un agent). La simulation du clavier est recalée sur le personnage à chaque pas.
- Réactivité : recherche immédiate à chaque changement d'intention (touche), marge de saut retirée au départ / à l'arrêt /
  aux grands changements de vitesse ; frein de racine relâché en 50 ms au départ ; ressort de vitesse vif à l'accélération
  (demi-vie 0,15 s) et réaliste au freinage (0,3 s). Arrêt demandé → recherche limitée aux images « d'arrêt » (futur à 1 s
  < 35 cm : repos et freinages), ce qui supprime les pas de marche arrière après un arrêt. Mesures : 15 cm parcourus en
  0,3-0,65 s après appui ; arrêt en 25-55 cm sans retour.
- IK deux os : côté de flexion = mélange continu entre le côté naturel (pose capturée) et le pôle (coudes bas et rentrés,
  genoux avant) — plus de coude qui saute (max 3 m/s, vitesse d'un bras qui marche).
- Arme (V, active par défaut) : low ready d'après deux photos de référence — crosse posée sur le dessus de l'épaule droite
  contre le cou (ancre : base du cou, `PARAMS.fusil` avant/droite/haut), canon qui plonge de 27° (tangage −0,47 rad, jusqu'à
  −0,7 si la main d'appui ne peut pas atteindre le garde-main), arme roulée de 29° dessus vers la tête (roulis −0,5), léger
  travers (cant 0,05 + buste bladé, vrille 0,4 rad répartie sur Spine/Spine1/Spine2). Si la poignée arrive à moins de 11 cm
  de l'épaule droite (bras de 44 cm), l'arme est poussée vers l'avant le long du canon (lissé 0,15 s). Lissage de l'arme
  (80 ms) dans le repère du personnage, pas dans le monde (sinon elle traînait derrière un soldat qui court).
  Mains : places du jeu (`PRISE` de soldat3d.js, par modèle, ramenées à une arme de 0,74 m) → IK deux os (coudes vers le bas),
  torsion du poignet partagée 60 % avec l'avant-bras, doigts de la première image de « Rifle_Aim_Turn_Right », index droit
  tendu hors de la détente en low ready ; fondu 0,25 s à la sortie / au rangement.
- Épaulé (clic droit maintenu, `PARAMS.epaule`, fondu 0,3 s) : crosse dans le creux de l'épaule (ancre cou, avant −0,06 /
  droite 0,12 / haut −0,04), canon horizontal, vrille 0,55, joue sur la crosse : cou + tête penchés vers l'avant (0,45 rad)
  et roulés vers la crosse (0,35 rad), moitié sur le cou, moitié sur la tête.
- Agent critique (sous-agent indépendant, photos de référence vs captures éclairées `?clair=1`) : v22 38-64 %, v23
  85 % → 92-94 % en low ready après corrections (crosse derrière l'épaule, plongée 27°, roulis) ; voir captures/crit-*.png.
- Commandes : ZQSD relatif à la caméra, le soldat regarde là où il va ; clic droit maintenu = épaulé (`PARAMS.epaule`, fondu
  0,3 s) + regard verrouillé sur la caméra (pas de côté, recul) ; la caméra seule ne fait jamais tourner le soldat.
- E : escouade de 5 soldats (4 de plus sur des chemins, arme sortie) ; chaque agent = soldat + contrôleur + lecture de la base ;
  5 soldats ≈ 1,1 ms de simulation par pas sur une machine lente.
- Mesures (outils/tests) : main droite sur la poignée à < 0,01 mm ; 90 s d'entrées aléatoires sans NaN ; coudes ≤ 5 m/s
  (plus de coude qui saute quand la poignée est près de l'épaule) ; dérive à l'arrêt 0 ; chemin de démo : 9 points en 60 s, 0,3 s bloquées ; glissement en marche Swat
  7 cm/s (données seules 4,5), 15-19 avec changements de direction toutes les 2 s (transitions).
- Manques : course rapide (100STYLE plafonne vers 1,9 m/s en Swat), accroupi, tête qui suit une cible, mode épaulé/tir.
  Données StartStop_* présentes dans donnees/100style/ mais pas dans la base.
