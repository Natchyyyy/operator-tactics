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

## État (19/10)
- Retargeting Geno → Mixamo par écart à la pose de liaison (lue dans le skin du GLB), avec alignement des directions d'os.
- Motion matching : fiche 27 nombres (pieds, vitesses, trajectoire future 0,33/0,67/1 s), recherche brute 45 000 images,
  inertialisation des transitions, racine portée par l'animation + rattrapage limité vers la simulation.
- Verrouillage des pieds (IK deux os) piloté par les contacts de la base, horizontal seulement, écart plafonné à 5 cm,
  engagé seulement si l'orteil affiché est bas. Le « rattrapage » du personnage vers la simulation est à 0 : à 0,15 il
  créait un glissement constant de ~20 cm/s (et le verrou, en luttant, faisait remonter le pied puis rebondir).
  Glissement mesuré en marche (vitesse de l'orteil pendant les appuis de la base) : 11 cm/s ; données brutes seules : 6.
- Mesures de référence (`API.mesures()`, traces TRACE) : sans verrou ni saut, orteil ≤ 17 cm de haut, |vy| ≤ 1 m/s ;
  tout réglage qui dépasse nettement ces valeurs crée des pieds qui « remontent » ou rebondissent.
- Manques : course rapide (100STYLE plafonne vers 1,5 m/s, salle de 4,5 m), accroupi très léger, pas de fusil.
