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
python3 outils/preparer.py donnees/100style/Neutral_*.bvh donnees/100style/Swat_*.bvh donnees/100style/Rushed_*.bvh donnees/100style/Crouched_*.bvh --sortie web/base --parties 3 --bind donnees/Geno_bind.bvh
cp ../../web/three.min.js ../../web/gltf.js web/ && cp ../../web/hd/gign_hd.glb web/      # copies, non versionnées
python3 ../../outils/serveur.py ../.. 8765   →  http://127.0.0.1:8765/prototypes/motion-matching/web/
```
Mode test sans boucle automatique : `index.html?manual=1` puis `API.step(n)`, `API.touches({KeyW:1})`, `API.mesures()`, `PARAMS` (rattrapage, verrou, marges de saut).

## État (20/10, nuit)
- Simulation à pas fixe 1/60 s (affichage libre). Retargeting Geno → Mixamo par écart à la pose de liaison du skin, pieds et
  orteils gardant l'inclinaison du modèle, échelle hanches→orteils.
- Motion matching : fiche 27 nombres (pieds ×2, vitesses pieds et hanches, trajectoire future 0,33/0,67/1 s), poids
  pieds 2 / vitesses pieds 1,5 / hanches 1 / trajectoire 1 / regard 1,5 ; recherche brute 41 600 images toutes les 0,1 s
  (0,37 ms par pas de simulation sur une machine lente) ; saut seulement si 20 % mieux, 0,25 s mini entre deux sauts ;
  au repos : séquences de repos seulement (sauts rares : 40 % mieux, 1 s mini) et racine figée ; si on veut avancer alors
  que l'animation est arrêtée (départ, virage serré), la meilleure image est prise sans marge (sinon un repos atypique peut
  bloquer un agent). La simulation du clavier est recalée sur le personnage à chaque pas.
- Cap et direction (v26) : la recherche se limite aux images « frontales » (vitesse et trajectoire à moins de 50° de l'avant)
  quand le regard n'est pas verrouillé ; le cap du soldat est ramené vers le cap voulu en plus de la rotation du clip
  (demi-vie 0,2 s, ≤ 3 rad/s), en compensant l'angle vitesse/hanches du clip (style Swat bladé de ~12°, clips qui
  serpentent) ; le déplacement de l'image est tourné vers la direction voulue (≤ 12°). Mesuré : direction finale à ±8°,
  cap à ±10° sur Q/D/diagonales/demi-tour ; 15 cm parcourus en 0,3-0,6 s. Coût : glissement sur le chemin de démo 8 → 13 cm/s.
  En visée (regard verrouillé, v28) : déplacement TACTIQUE, pas de pas chassé. Mode « avant » (touche à moins de 100° de
  la cible) : il marche vers la touche (diagonales comprises, vitesse de marche), le tronc vrille vers la cible (≤ 1 rad sur
  Spine/Spine1/Spine2) et l'arme pointe la caméra ; mode « recul » (cible derrière, hystérésis 10°) : hanches face à la
  cible, marche arrière lente (candidates limitées aux images dont la vitesse part dans la direction demandée ±50°,
  déplacement redressé jusqu'à 45°). Mesuré : direction à ±2° de la touche, arme à ±6° de la caméra, glissement 8-15 cm/s.
  L'arme ne vise jamais plus loin que 1,1 rad des hanches (v29) : si la caméra tourne plus vite que le corps, l'arme suit
  le corps et le rattrape ; à l'arrêt, le soldat pivote sur place vers la cible (demi-vie 0,3 s, pieds libérés pendant le
  pivot, racine figée : dérive 0) — 180° en ~1,2 s, arme sur la cible en 0,7 s.
- Réactivité : recherche immédiate à chaque changement d'intention (touche), marge de saut retirée au départ / à l'arrêt /
  aux grands changements de vitesse ; frein de racine relâché en 50 ms au départ ; ressort de vitesse vif à l'accélération
  (demi-vie 0,15 s) et réaliste au freinage (0,3 s). Arrêt demandé → recherche limitée aux images « d'arrêt » (futur à 1 s
  < 35 cm : repos et freinages), ce qui supprime les pas de marche arrière après un arrêt. Mesures : 15 cm parcourus en
  0,3-0,65 s après appui ; arrêt en 25-55 cm sans retour.
- IK deux os : côté de flexion = mélange continu entre le côté naturel (pose capturée) et le pôle (coudes bas et rentrés,
  genoux avant) — plus de coude qui saute (max 3 m/s, vitesse d'un bras qui marche).
- Arme (V, active par défaut) : low ready d'après deux photos de référence — crosse posée sur le dessus de l'épaule droite
  contre le cou (ancre : base du cou, `PARAMS.fusil` avant/droite/haut), canon qui plonge de 27° (tangage −0,47 rad, jusqu'à
  −0,8 si la main d'appui ne peut pas atteindre le garde-main), arme roulée de 29° dessus vers la tête (roulis −0,5), léger
  travers (cant 0,05 + buste bladé, vrille 0,4 rad répartie sur Spine/Spine1/Spine2). Si la poignée arrive à moins de 11 cm
  de l'épaule droite (bras de 44 cm), l'arme est poussée vers l'avant le long du canon (lissé 0,15 s). Lissage de l'arme
  (80 ms) dans le repère du personnage, pas dans le monde (sinon elle traînait derrière un soldat qui court).
  Mains : places du jeu (`PRISE` de soldat3d.js, par modèle, ramenées à une arme de 0,74 m) → IK deux os (coudes vers le bas),
  torsion du poignet partagée 60 % avec l'avant-bras, doigts de la première image de « Rifle_Aim_Turn_Right », index droit
  tendu hors de la détente en low ready ; fondu 0,25 s à la sortie / au rangement.
- Épaulé (clic droit maintenu, `PARAMS.epaule`, fondu 0,3 s) : crosse dans le creux de l'épaule (ancre cou, avant −0,06 /
  droite 0,12 / haut −0,04), canon horizontal, vrille 0,55 ; pour épauler l'arme est poussée de 8 cm vers l'avant puis vient se caler dans l'épaule
  (excursion maximale à mi-fondu) ; joue sur la crosse : cou + tête penchés vers l'avant (0,45 rad)
  et roulés vers la crosse (0,35 rad), moitié sur le cou, moitié sur la tête.
- Tir (clic gauche maintenu en visée) : mêmes valeurs que le jeu (`placeWeapon` / app.js) — recul 1 → 0 en 0,1 s, arme reculée
  de 4 cm le long du canon, bouche relevée de 2° autour de la crosse, Spine2 basculé de 0,05 rad vers l'arrière, mains qui
  suivent par IK (0 mm d'écart) ; cadence soutenue du fusil d'assaut (sim/data.js : 110 coups/min) ; éclair de bouche simple
  (cœur + langue + lumière, 40 ms). Pas de douilles ni de traçantes ici (effets du jeu).
- Accroupi (C, `PARAMS.accroupi`, style Crouched de 100STYLE ajouté à la base : 77 204 images en 3 parties) : hanches
  visées à 0,43 m en absolu (les jambes de 0,69 m du modèle ne permettent pas la pose du clip telle quelle : genou au sol),
  posture « squat » pieds sous les genoux (avancés 0,2 / écartés 0,21), pieds à plat d'après la pente de la pose de liaison,
  buste penché 0,5 rad avec contre-inclinaison cou + tête, fondu 0,3 s au changement de style, marche accroupie 0,55 m/s.
  Viser par-dessus un couvert : servo qui remonte le buste jusqu'à ce que la bouche dépasse le bloc de 8 cm — avec le bloc à
  1,1 m cela revient à se relever (limite des données, pas d'images « accroupi haut »).
- Couvert (B ; `Ctl.couvrir(bloc, menace, marge)`, bloc 1,6 × 0,6 × 1,1 m comme `coverAt` du jeu) : candidats le long
  des 4 faces (glissement ±0,5 m), score = part cachée de 7 rayons sur la largeur d'épaules (0,35 m) vers la menace ;
  contournement des coins (pénalité sur les coins exposés), arrivée précise à 8 cm puis recalage ≤ 10 cm, collision avec le
  bloc (rayon 0,4), passage accroupi quand il reste < 3 m, puis face à la menace (`verrouCible`).
- Morts en ragdoll (T torse / Y tête / U membre depuis la caméra ; G : galerie de 5 coureurs) : module du JEU tel quel
  (web/ragdoll.js + cannon-es, copiés, non versionnés ici), branché par un adaptateur : vitesses tirées de la pose de
  motion matching en cours (élan du coureur), impulsion sur la partie touchée, collisions sol + bloc, arme lâchée ;
  l'agent mort ne fait plus de motion matching (ses os sont tenus par la physique).
- Traîner un blessé à couvert (H ; scénario de démo si personne n'est mort) : le sauveteur va à la tête du blessé (arrivée
  précise), s'accroupit, saisit le col du gilet (IK des deux mains), le blessé est remis en physique depuis sa pose
  allongée et son torse est attaché à un point tenu dans les mains (articulation cannon) ; le sauveteur recule
  (debout genoux fléchis, buste penché 0,65 rad, marche arrière face au blessé, 1 m/s) jusqu'au couvert : contournement des
  coins avec 1 m de marge (le corps traîne 1,2 m derrière), dernier tronçon dans l'axe de la menace en revenant vers le bloc
  (le blessé finit perpendiculaire au bloc, tête près du bloc) ; un blessé tombé à plat ventre est d'abord roulé sur le dos ;
  jambes amorties (pas de coups de pied) ; à l'arrivée il lâche et reste accroupi à couvert face à la menace, arme reprise.
  Scénario complet (H) : chute → prise 0,8 s après → traînage ~8 s. Jambes qui traînent, bras ballants, tête en arrière : physique, pas d'animation.
  v32-33 : pendant la prise et le traînage le sauveteur porte son arme en bandoulière dans le dos (fondu 0,4 s) ; roulé
  dos 1,0 s autour d'un axe au ras du sol (plus de jambes qui se lèvent) ; cuisses et tibias ramenés vers la ligne de
  traction ; à la dépose, le corps est figé 1,5 s après le lâcher puis les jambes sont couchées au sol de façon cinématique
  (genoux à 13 cm, pieds à 10 cm, fondu 0,4 s) — la charnière de cannon tenait sinon le tibia en « tente » sur le pied.
  Dernier tronçon en s'éloignant du bloc (1 m) dans l'axe de la menace pour que le corps soit tiré et non poussé.
  Après 4 rounds de critique sur le traînage (45 → 58 → 62 %) : coin contourné à 1,4 m et point de couvert reculé de
  0,45 m (le blessé, qui traîne 1,2 m derrière et en travers, coupait l'angle du bloc) ; point de prise qui suit le corps
  pendant l'approche (recul 0,8 m de la tête : le genou du sauveteur ne passe plus dans la tête au roulé) ; posture de
  traction = genoux fléchis (hanches 0,57), buste en arrière (−0,3 rad, lissé 0,3 s), bras tendus vers le bas (bras de
  44 cm : les mains ne descendent pas sous 0,62 m, donc épaules du blessé à ~0,45 m, tête 0,5) ; arme plaquée au dos
  (centre 18 cm sous Spine2, diagonale 45°), retour en 0,8 s avec les mains qui ne prennent l'arme que sur la seconde
  moitié (sinon l'IK visait la poignée derrière l'épaule : bras tendu en l'air sans but) ; jambes du blessé ramenées au
  sol dans les virages (vitesse verticale ≤ −0,6 au-dessus de 20 cm) ; à la dépose, jambes ET bras couchés le long du
  corps (cinématique 0,4 s après le gel). Mesuré : mains à ≤ 4 cm du col pendant tout le traînage ; aucun corps dans le
  bloc ; blessé et sauveteur masqués de la menace (rayons) ; blessé final hanches 0,23, tête 0,27-0,30, genoux 0,13,
  pieds 0,10, bras au sol.
- Rythme (v31) : lecture accélérée / ralentie (×0,75-1,35, lissée 0,3 s) pour coller à la vitesse voulue — les clips
  100STYLE marchent à 0,9 m/s et reculent à 0,5 ; mesuré : marche 1,2-1,28 m/s, recul 1,0, sprint 2,6.
- Agent critique (sous-agent indépendant, photos de référence vs captures éclairées `?clair=1`) : v22 38-64 %, v23
  85 % → 92-94 % en low ready après corrections (crosse derrière l'épaule, plongée 27°, roulis) ; voir captures/crit-*.png.
  Accroupi / couvert 91-96 %. Traînage (critique « directeur d'animation AAA », plus sévère) : 62 % au dernier round ;
  ce qu'il reste à lui reprocher demande des animations dédiées (roulé en 3 clés avec une main à la hanche, regard
  par-dessus l'épaule pendant le recul, geste de désanglage, idle de respiration) ou vient du modèle (bras courts).
- Commandes : ZQSD relatif à la caméra, le soldat regarde là où il va ; clic droit maintenu = épaulé (`PARAMS.epaule`, fondu
  0,3 s) + regard verrouillé sur la caméra (pas de côté, recul) ; la caméra seule ne fait jamais tourner le soldat.
- E : escouade de 5 soldats (4 de plus sur des chemins, arme sortie) ; chaque agent = soldat + contrôleur + lecture de la base ;
  5 soldats ≈ 1,1 ms de simulation par pas sur une machine lente.
- Mesures (outils/tests) : main droite sur la poignée à < 0,01 mm ; 90 s d'entrées aléatoires sans NaN ; coudes ≤ 5 m/s
  (plus de coude qui saute quand la poignée est près de l'épaule) ; dérive à l'arrêt 0 ; chemin de démo : 9 points en 60 s, 0,3 s bloquées ; glissement en marche Swat
  7 cm/s (données seules 4,5), 15-19 avec changements de direction toutes les 2 s (transitions).
- Manques / limites connues : course rapide (100STYLE plafonne vers 1,9 m/s en Swat, le reste est du rythme accéléré) ;
  « accroupi haut » pour viser par-dessus un couvert de 1,1 m (il se relève) ; les jambes du blessé s'écartent parfois
  pendant le traînage (physique) ; les réactions de la galerie se ressemblent (réglages du ragdoll du jeu, non touchés ici) ;
  glissement sur le chemin de démo 16,7 cm/s depuis le rythme (13 avant). Données StartStop_* présentes dans
  donnees/100style/ mais pas dans la base.
