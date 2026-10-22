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

## v37 (22/10) — glissement des pieds
- Mesuré sur le chemin de démo (60 s) : 16,7 → 5,3 cm/s (données brutes : 6 en marche). Trois causes trouvées et corrigées :
  1) racine « roulant » sous les pieds : les foulées re-ciblées sont ~10 % plus courtes que la racine capturée → la racine est
  désormais TENUE PAR LE PIED D'APPUI (`racineTenue: 'vecteur'`, aussi pendant les fondus, écart par pas ≤ 60 % du déplacement) ;
  2) correction de cap : le corps pivote autour du pied posé, plus autour des hanches (`pivotPied`) ;
  3) sauts en boucle quand la consigne n'est atteignable par aucun clip ou oscille d'un pas à l'autre (le jeu : 15 sauts/s,
  pieds à 100-180 cm/s) : style décidé sur la vitesse lissée avec hystérésis, arrêt cru après 0,1 s, écart de vitesse mesuré
  par rapport à ce que le rythme peut rattraper, saut forcé ≤ 2/s. `A.causes` compte les sauts par cause (diagnostic).

## Bilan des animations disponibles (motion matching v37, 22/10) — preset 5 = galerie, caméra libre
Toutes viennent des captures 100STYLE (Neutral / Swat / Rushed / Crouched : repos, marche, course, pas chassés, marche
arrière, demi-tours) choisies image par image, plus des gestes ajoutés par-dessus (IK) :
1. Debout : repos sans arme ; marche et course sans arme (bras qui balancent) ; repos arme en garde basse ; marche tactique
   garde basse (Swat) ; course arme en main (Rushed) ; glissade en joue (marche tactique, buste vrillé vers la cible, pas chassé
   si la cible est sur le côté) ; recul en joue (cible derrière) ; visée debout épaulée + tir (recul 110 coups/min) ; pivot sur
   place en joue (pieds libérés, arme qui suit la cible) ; virages et demi-tours (correction de cap qui pivote sur le pied posé).
2. Bas : marche accroupie (Crouched) ; squat de combat à l'arrêt ; genou à terre garde basse ; genou à terre en joue + tir ;
   descente / relevé du genou ; à couvert derrière un muret (accroupi profond, se redresse juste assez pour tirer par-dessus,
   se rebaisse) ; approche d'un couvert (s'abaisse à 3 m).
3. Blessés : touché → chute ragdoll (tête / torse / jambe / dos, galerie du preset 2) ; au sol → se relève (fondu vers la pose
   accroupie, main d'appui, reprend l'arme) ; sauvetage : course vers le blessé, prise au col à deux mains, traînage à reculons
   derrière le couvert (corps en physique), dépose, réanimation à genou (mains sur la poitrine), relevé du blessé.
4. Doctrine (preset 4) : colonne par un avec espacement tenu, halte sûreté 360° (secteurs, genou à terre), bonds de binômes,
   ligne en joue.
Pas encore de geste dédié : rechargement, lancer de grenade, montée / descente d'obstacle, position couchée (pas dans les
données), ouverture de porte. Détail connu : après un sauvetage, le fusil tombé reste au sol (le relevé en reprend un en main).

## v37 — doctrine (TTA 150), 22/10
- Nouvelle pose « GENOU À TERRE » (`ctl.genou`, à l'arrêt) : hanches à 0,55 m, genou droit au sol, tibia à plat, pied gauche à plat
  devant ; arme en garde basse ou en joue sur le secteur (`verrouCible` / `verrouRegard`). Descente / relevé lissés (0,3 / 0,25 s).
- Preset 4 (touche 4) — mise en scène scriptée, PAS une IA : colonne par un dans un couloir (2,5 m entre chaque, vitesse
  asservie à l'écart) → halte en sûreté 360° (secteurs avant / droite / gauche / arrière, un genou à terre, 5 s) → sortie du
  couloir → franchissement par bonds de binômes (A court derrière un muret pendant que B tient la zone en joue, puis B) →
  ligne à la lisière, genou à terre, arme en joue. Glissement moyen sur toute la scène : 7-9 cm/s par soldat.
- QA (agent, 22/10) : corrigé — murets perpendiculaires à l'axe et assez longs (les deux soldats du binôme sont couverts : vu
  de l'ennemi, casque et canon seulement) ; pointe du pied arrière jamais sous le sol au relevé du genou. Restent (mineurs) :
  un soldat de la halte vrille le buste vers son secteur au lieu de pivoter les hanches ; tête un peu baissée en garde basse à
  genou ; arrivée en ligne avec jusqu'à 0,6 m de dépassement.
- La page utilise les fichiers versionnés du jeu (`web/hd/mm_base.*`, `gign_hd.glb`, `fusil.glb`, three/gltf/cannon) : un clone
  du dépôt suffit (`python3 outils/serveur.py . 8765` à la racine). Branche `mm-doctrine`, rien d'intégré au jeu.

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
- Presets simulés (touches 1/2/3, v34) : rien n'est écrit à l'avance, on place les soldats et un « cerveau » de bot
  (`class Cerveau`, règles portées de `sim/engine.js` avec les mêmes chiffres) décide à chaque pas : perception (champ
  112°, repérage probabiliste, ouïe des coups ±1 m, le bloc de 1,1 m cache un homme accroupi), tir (chance de toucher du
  jeu, rafales 4-8 coups puis pause 0,3-0,65 s, seuil 8 %), dégâts (fusil 5,56 42 pts, localisation tête/torse/membre,
  plaques moyennes, 92 pv), suppression, prise de couvert (2-3 coups de suppression puis course au bloc, accroupi derrière,
  redressé pour tirer, baissé entre deux rafales), évacuation (`tryDrag` : on neutralise d'abord une menace fraîche à
  < 20 m — demande de l'utilisateur —, on traîne le blessé seulement si un ennemi vivant connu voit l'endroit où il est
  tombé, sinon on le relève sur place) et relève (massage 3 s, le relevé repart à 46 pv). Aléa entièrement graine
  (`PARAMS.graines`) : même scène à chaque lancement. Preset 1 : V traverse devant le bloc, T1 (tient sa position au
  sud) l'abat ; R (arrivait par le nord) entend, se couvre, se redresse, abat T1 ; T2 (35 m à l'est, derrière un mur
  qui lui cache le couvert de R mais pas la zone où V est tombé) oblige à traîner V derrière le bloc avant la réa ;
  V se relève accroupi à couvert. Preset 3 : B à découvert face à T (12 m) ; pris sous le feu, B tire 2-3 coups puis
  court au bloc, riposte par-dessus et abat T. `EVENEMENTS` (journal : voit/perd, touche/rate, abat, couvert, traîne,
  relève) permet de relire la scène ; `outils` : balayage de graines sans rendu (~5 s par scène).
- Presets, règles demandées par l'utilisateur (20/10, v35) : on ne réanime JAMAIS à découvert — s'il y a un couvert
  à ≤ 8 m du blessé on le traîne derrière d'abord, du côté caché de TOUTES les positions ennemies connues (bloc ET
  murs), et le côté est choisi pour que ce soit le CORPS couché qui soit caché (score sur pieds → tête → sauveteur),
  chemin de traînage en L (le long de la face à 1,8 m, même ligne que le coin contourné, puis 2,2 m tout droit dans l'axe : plus de zigzag) ; arme à la sangle attachée rigidement aux hanches (lissée, elle flottait derrière lui en course) ; contrôle à la dépose
  (événement `depose`, part du corps cachée, ex. 0,83-1,0). Prise au col : le sauveteur est pinglé à l'arrivée (le
  contrôleur arrivait encore lancé), s'il a roulé le blessé (le corps bouge de ~0,7 m) il se redresse, fait un pas
  jusqu'au nouveau point idéal (`replace`) et reprend ; attache seulement une fois en place (≤ 12 cm) : mains à
  3-7 cm du col mesuré. Sous le feu (preset 3) : il part tout de suite au couvert arme en joue, tire TOUT LE LONG
  (précision « en mouvement » ×0,55, puis « en course » ×0,3 ; cible masquée par le bloc : tir à l'aveugle vers la
  dernière position, chance ÷2), vitesse linéaire marche → course sur la première moitié du trajet (`sprint` dès le quart) ;
  en tirant en marchant le corps va vers le point (le buste vrille vers la menace, « mal épaulé » au-delà de ~60°) : avant
  (v35) le corps restait verrouillé sur la menace et il dérivait vers le bloc puis reculait (v36).
  Relevé en trois temps (2,2 s) : buste redressé sur une main au sol (IK), jambes repliées et hanches qui montent,
  main libre posée sur le genou, arme reprise à 70 % (v36 : les clips accroupis ont les bras tendus pour une arme → « bras
  en T » ; même raison pour les clips neutres, bras qui balancent, quand il marche mains libres pendant le sauvetage).
  Mains libres : elles ne tiennent l'arme que quand elle est en place (pas pendant le trajet vers / depuis la hanche), et
  accroupi mains libres elles reposent devant les cuisses (IK) — les clips Crouched ont les bras tendus en « T ».
  Anti-piétinement (v36) : si on veut avancer mais que l'animation reste immobile > 0,25 s, la recherche exclut les images
  lentes (avant, à certaines cadences d'écran, le traînage retombait sur une image immobile et le soldat glissait au sol). Arme à la sangle pendant le sauvetage : le long de la jambe droite, canon en bas,
  attachée aux hanches (plus en travers du dos). Couvert : 0,7 m de la face (le canon entrait dans le bloc à 0,55).
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

## Intégration dans le jeu (notice pour le chat du jeu, 21/10)
Principe : **le jeu décide, le motion matching exécute.** Les cerveaux de `sim/` gardent toute la tactique ; le module
n'a besoin que d'ordres simples par soldat, et il rend la pose (os three.js) + la position/orientation réelles.

- **Fichiers à embarquer** (depuis `prototypes/motion-matching/web/`) : `mm.js` (le module, ~175 Ko ; à découper en
  `Base` + `Soldat` + `Ctl` + `Agent`, le `Cerveau` et les presets restent ici comme scènes de test), les données de mouvement
  `base.json` + `base.0.bin`/`base.1.bin`/`base.2.bin` (23 Mo, à servir une fois, extension `.wasm` chez l'hébergeur
  claude.ai comme pour le reste), `gltf.js`, `cannon-es.js` et `ragdoll.js` (déjà ceux du jeu), modèles `gign_hd.glb` /
  `fusil.glb` (ceux du jeu). `three.min.js` r159 = celui du jeu.
- **Ordres (objet contrôleur `Ctl`, un par soldat)** : `chemin` (liste de points) + `cheminFin` (arrêt précis au dernier
  point) + `vitesseChemin` (m/s) ou `touches` (clavier) ; `visee` (arme en main), `verrouRegard` + `verrouCible` (yaw :
  épaulé, buste vers la cible, tir possible), `tir`, `tirEnMarchant` (tire tout le long du trajet), `sprint`, `accroupi`,
  `couvrir(bloc, menace, marge)` (va au point de couvert et s'y accroupit face à la menace ; `surArrivee` = rappel),
  `arriver()`. Événements rendus : `enRoute`/`couvert`, position `pos`, `yaw`, vitesse `vel`.
- **Agent** (un par soldat) : `pas(dt)` chaque pas fixe de 1/60 s (`boucleAuto`), `tuer(loc, dir)` → ragdoll du jeu,
  `relever(yaw)` (réanimé : relevé en 3 temps puis motion matching), `ressusciter()`, `sauvetage` (classe `Sauvetage` :
  `sauver(iR, iV, menace)` — approche, prise au col, traînage en L derrière le couvert, dépose, réa, relevé) ; `tirs`
  compte les coups joués (recul, flash). Le tir « règles du jeu » (chance de toucher, dégâts) reste dans `sim/`.
- **Rendu** : `Soldat` tient le GLB, les os, le fusil (IK deux mains, low ready / épaulé / à la sangle), les empreintes.
  `S.dos` = arme à la sangle, `S.aCouvert`, `S.profondeur` (accroupi), `S.pencheExtra`. Pose finale après `appliquer()`,
  `tenirFusil()`, `verrouPieds()`, `raseMottes()` (glissade en visée).
- **Coût** : ~0,3 ms par soldat et par pas (recherche toutes les 0,1 s) → 10 soldats ≈ 3 ms/pas, OK à 60 Hz. Pas fixe
  1/60 s obligatoire (même résultat sur tous les écrans).
- **Reste à brancher côté jeu** : remplacer `Cerveau` par les cerveaux de `sim/` (mêmes ordres), plusieurs obstacles
  (`BLOC` + `MURS` → les obstacles de la carte dans `couvrir`/`horsBloc`/`cheminVers`), les autres armes (points de prise
  `PRISE` par arme), les équipes/couleurs, les sons. Les réglages validés par l'utilisateur sont dans `PARAMS` (garde
  basse, épaulé, couvert 0,7 m, sauvetage) : ne pas les changer sans lui.
