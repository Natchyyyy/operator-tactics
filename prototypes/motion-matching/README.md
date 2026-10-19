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
- Styles : Neutral (sans arme) et Swat (arme, défaut). Verrou des pieds horizontal (IK deux os robuste, écart ≤ 8 cm).
- Arme (V, active par défaut) : low ready — crosse dans le creux de l'épaule droite (`PARAMS.fusil` : avant/droite/haut par
  rapport à l'épaule, tangage −0,5 rad, cant 0,3 rad vers l'intérieur, lissage 60 ms) ; direction = regard du soldat mélangé
  30 % au buste. Mains : places du jeu (`PRISE` de soldat3d.js, par modèle) → IK deux os (coudes vers le bas), main d'appui
  glissée vers l'arrière si le garde-main est hors de portée (bras de 46 cm sur ce modèle), torsion du poignet partagée 60 %
  avec l'avant-bras, doigts de la première image de « Rifle_Aim_Turn_Right » ; fondu 0,25 s à la sortie / au rangement.
- Commandes : ZQSD relatif à la caméra, le soldat regarde là où il va ; clic droit maintenu = épaulé (`PARAMS.epaule`, fondu
  0,3 s) + regard verrouillé sur la caméra (pas de côté, recul) ; la caméra seule ne fait jamais tourner le soldat.
- E : escouade de 5 soldats (4 de plus sur des chemins, arme sortie) ; chaque agent = soldat + contrôleur + lecture de la base ;
  5 soldats ≈ 1,1 ms de simulation par pas sur une machine lente.
- Mesures (scénarios 60 Hz, `scratchpad/scenario.py`, `robuste.js`) : main droite sur la poignée à < 0,01 mm ; 90 s d'entrées
  aléatoires sans NaN ; dérive à l'arrêt 0 ; chemin de démo : 9 points en 60 s, 0,3 s bloquées ; glissement en marche Swat
  7 cm/s (données seules 4,5), 15-19 avec changements de direction toutes les 2 s (transitions).
- Manques : course rapide (100STYLE plafonne vers 1,9 m/s en Swat), accroupi, tête qui suit une cible, mode épaulé/tir.
  Données StartStop_* présentes dans donnees/100style/ mais pas dans la base.
