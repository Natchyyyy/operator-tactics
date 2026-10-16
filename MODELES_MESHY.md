# Modèles 3D à produire dans Meshy (point 7)

Méthode : voir la boîte à outils (`boite-a-outils/modeles3d/MESHY.md`). Pour chaque ligne : panneau « Image » (prompt ci-dessous,
2 images), « Image vers 3D » avec texture, remaillage au nombre de triangles indiqué, téléchargement GLB, puis me donner les .glb
(fichiers joints ou dossier relié). Je m'occupe de l'allègement, de la conversion et de l'intégration (avec le modèle par
programme en secours).

Style commun à mettre dans chaque prompt : `game asset, realistic military, neutral grey background, three-quarter view, no text`.

## Priorité 1 — opérateurs (le plus visible)
| Fichier | Prompt | Triangles | Remarque |
|---|---|---|---|
| `soldat_base.glb` | modern special forces operator standing, plate carrier, helmet, holding rifle at low ready, neutral uniform | 30 000 | une seule silhouette ; les couleurs d'uniforme et le couvre-chef restent gérés par le jeu |
| `casque.glb` | modern ballistic combat helmet, side rails, no head | 10 000 | |
| `beret.glb` | military beret, no head | 10 000 | une couleur neutre, le jeu teinte |
| `chapeau_brousse.glb` | boonie hat, military, no head | 10 000 | |

## Priorité 2 — armes (tenues en main, vues de près par la caméra « Suivre »)
| Fichier | Prompt | Triangles |
|---|---|---|
| `carabine.glb` | modern 5.56 carbine with red dot sight, side view | 10 000 |
| `pm.glb` | compact 9mm submachine gun with folding stock | 10 000 |
| `fusil_precision.glb` | 7.62 designated marksman rifle with scope and bipod | 10 000 |
| `mitrailleuse.glb` | 5.56 light machine gun with box magazine and bipod | 10 000 |
| `fusil_pompe.glb` | tactical pump-action shotgun | 10 000 |

## Priorité 3 — décor (une fois par type, instancié)
| Fichier | Prompt | Triangles |
|---|---|---|
| `conteneur.glb` | rusty shipping container, closed doors, 20 ft | 10 000 |
| `voiture.glb` | abandoned compact sedan car, dusty, closed doors | 30 000 |
| `caisses.glb` | stack of wooden military crates | 10 000 |
| `sacs_sable.glb` | sandbag wall section, three rows | 10 000 |
| `fut.glb` | steel oil drum, blue, dented | 10 000 |
| `barriere.glb` | concrete jersey barrier | 10 000 |
| `cuve.glb` | industrial cylindrical storage tank with ladder and railing | 30 000 |
| `banc.glb` | park bench, wood slats on cast iron | 10 000 |
| `fontaine.glb` | small stone city fountain, round basin | 30 000 |
| `kiosque.glb` | small newsstand kiosk, closed shutters | 30 000 |

Échelles dans le jeu (pour information) : opérateur 1,8 m ; conteneur 2,5 × 2,6 × 9 m ; voiture 2 × 1,4 × 4,4 m ; fût 1,4 m de haut ;
barrière 3 × 1,1 m ; cuve 6 m de diamètre, 5 m de haut.
