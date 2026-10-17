# À faire (suivi pour reprendre plus tard)

## Polissage « triple A » des animations (17/10, nuit) — demande de l'utilisateur
Mesuré par `scratchpad/diag.py` (bataille pas à pas, `window.API.diag()`) : avant, 91 % des images en mouvement avaient des
pieds qui glissaient et 25 % un déplacement de côté avec les jambes de face ; après : 2 % et 3 %.
- Vitesse naturelle de chaque cycle mesurée sur les PIEDS au chargement (`mesureLoco`) : la course « Run_and_Shoot » n'est
  qu'un jogging à 1,9 m/s (on la lisait comme 3 m/s), la marche en visée 0,9 m/s. Lecture à (vitesse réelle / naturelle).
- Jambes vers le déplacement, torse vers la cible : le bassin tourne de l'écart (`f.jambesCible`), les trois vertèbres le
  rattrapent ; au-delà de ~105° on recule (cycle lu à l'envers). À l'arrêt, les pieds restent plantés pendant que le torse
  pivote, et se replacent au-delà de 50°.
- Garde basse quand aucun ennemi n'est connu (pose construite `Garde_Basse` + composites `Walk_Low` / `Run_Low`), fusil
  épaulé au contact (crosse au creux de l'épaule par IK, `EPAULE`/`CREUX`), respiration sur les poses fixes.
- Modes de prise de l'arme (`placeWeapon(two, recoil, mode)`) : `deux`, `droite` (rechargement : la gauche va au chargeur),
  `bandouliere` (lancer de grenade : fusil en travers du torse, position mémorisée depuis la garde basse), `sol` (mort :
  fusil posé à plat puis figé). La prise à une main garde la position relative de la dernière prise à deux mains.
- Chutes : animation et légère rotation choisies pour que le corps allongé ne traverse ni mur ni bord (`chooseFall`,
  positions finales mesurées) ; corps redescendu au sol (le bassin des animations flotte à 27 cm ; `M.chuteY`).
- Bruits de pas des soldats 3D : phase tirée de l'animation (ils étaient muets).
- Opérateur GIGN : modèle Meshy (`art/meshy/gign_brut.glb`), auto-rig Meshy avec 25 os parasites rattachés et 17 animations
  transférées depuis l'ancien soldat (`outils/greffer_animations.py`), doigts refermés dans le maillage
  (`outils/plier_doigts.py`, pas d'os de doigts), textures réduites (`compacter_glb.py --tailles`). Équipe du joueur : GIGN ;
  adversaire : ancien soldat teinté.
- Arme : carabine « type BREN » avec chargeur visible (Gemini → Meshy → `decor_glb.py --tris 6000`), points de prise
  mesurés sur le nuage de points (`modeles3d.js arme()`), remplace l'ancien fusil (clé `fusil` de `decor.js`).
- Outils de contrôle : `outils/vues/arme.html?a=Clip&t=&m=gign|soldat&mode=droite|bandouliere&droite=1` (4 vues, repères
  paumes / bouche / crosse), `clips.html?j=deg&t=` (jambes tournées), `mesure.html` (vitesses, chutes).
- Reste à faire : gros tests complets la nuit (demande de l'utilisateur) ; pas de côté plus naturels avec de vraies
  animations de strafe si on en trouve ; rigging Meshy avec doigts (a échoué deux fois : « réessayez plus tard »).

## Retravailler chaque élément un par un (17/10, soir) — demande de l'utilisateur
Principe : moins de contenu, mais chaque chose refaite proprement, une à la fois.
- Contenu réduit : une seule carte (parking du centre commercial), cinq opérateurs du GIGN (Vautour, Lynx, Granit, Bastion,
  Bélier — personnages fictifs), une seule arme (fusil d'assaut 5,56, modèle Meshy), une seule tactique (**Tiroir**),
  adversaire unique : le Groupe Karst. Campagne régulière de 6 missions sur le parking. Sauvegarde v3 (migration : ce qui
  n'existe plus disparaît, crédits et progression gardés). Les anciens terrains / armes / opérateurs ne servent plus qu'aux
  tests du moteur (`tests/anciens.js`).
- Tiroir (bonds alternés) : l'escouade est partagée en deux moitiés ; l'une avance de couvert en couvert (bond ≤ 11 m)
  pendant que l'autre, arrêtée, couvre face à la menace ; puis on inverse. Le tireur d'élite reste en appui.
- IA et alliés : plus de tir avec un camarade sur la trajectoire (pas de côté pour dégager l'angle), couverts répartis
  (pas deux au même endroit, pas derrière un allié), soutien d'un camarade pris pour cible, tir concentré.
- Les blessés à terre ne rampent plus (« les morts se déplacent allongés »).
- Animations : seulement des animations « arme en main » (marche arme à la poitrine, course arme épaulée, visée,
  rechargements) ; correction d'orientation mesurée par animation pour que l'arme vise droit devant ; plus de demi-tour
  du lancer ni de la visée qui pivote ; rotation du corps à vitesse limitée (plus de corps qui tournent sur eux-mêmes).
  Planche de contrôle : `outils/vues/clips.html?vue=face|haut|cote&a=Clip1,Clip2`.
- Modèles Meshy (image → 3D, téléchargés) : fusil, berline, pick-up, fourgon, bus, barrière en béton, sacs de sable, fût,
  kiosque, palmier, abribus. Allégés par `outils/decor_glb.py` (gltfpack compilé depuis github.com/zeux/meshoptimizer :
  `make config=release gltfpack`) → `art/meshy/decor/*.glb` → `web/modeles/decor.js` ; chargés par `web/modeles3d.js`.
  Les fichiers bruts sont dans `art/meshy/brut/` (non versionnés). Piège : l'option gltfpack `-sa` abîme les textures de
  certains objets (barrière, kiosque, pick-up, bus) ; garder `-vtf` (UV en flottants).
- Interface « PC moderne » : barre du haut et pied fins, pilules, police d'interface lisible (Segoe UI) et police du jeu
  pour les titres et grands chiffres, soldat plus grand à l'accueil, portraits de l'escouade recadrés, HUD de bataille
  plus fin, caméra « Réalisateur » plus proche.
- Son : déverrouillage à chaque geste tant que le navigateur bloque l'audio, état visible dans Réglages (Son : Activé /
  Coupé / Tester).
- Corps qui « tournaient sur eux-mêmes » (vrai coupable trouvé en suivant les soldats pas à pas) : le premier point de
  chaque nouveau chemin était souvent le centre de la case, DERRIÈRE le soldat → demi-pas en arrière puis demi-tour
  (126 demi-tours en une bataille, 17 après correction, tous de vrais virages). Le regard suit désormais le point de passage.
  Outils de diagnostic : `/tmp`-style scripts décrits ici — suivre une unité avec `API.step(1)` + `API.meshes()` et relever
  l'orientation du bassin, du buste et de l'arme à chaque pas.
- Mis de côté pour l'instant (cachés, le code reste) : saison, succès, crédits, cartes, contrats du jour, ligue, carrière,
  tenue, couvre-chef. On se concentre sur l'équipe, les modèles, l'IA, le HUD et le gameplay.
- Accueil v3 : soldat entier dans sa capsule, deux actions (Jouer, Mon équipe) en style plat, note d'équipe compacte,
  statistiques lisibles, escouade à droite (portraits cliquables).
- Suite possible : planter (bac à fleurs) en Meshy, autres armes une par une, autres agents, cartes une par une.

## Fait pendant la nuit du 16 au 17/10 (tout est testé, poussé sur main, et publié dans l'artifact)
- Interface : écran Cartes v2 (paquets dessinés, ouverture carte par carte, raretés), Équipe v2 (escouade en pied avec notes),
  Réglages ⚙ (volumes, vitesse et caméra par défaut, qualité, ombres, export / import de la carrière), onglet Carrière
  (bilan, terrains, dernières batailles, succès avec jauges), Ligue v2 (prochain match, forme, puissance, podium),
  contrats du jour, briefing des missions de campagne, astuces sur l'écran VS, écran titre v2 (« Reprendre la carrière »),
  bouton « ⏭ Résultat », fil des neutralisations, guide de première visite, aide accessible depuis le QG,
  raccourcis clavier en bataille, escouade montrée en pied, 4 insignes et 3 tenues de plus.
- Simulation : à terre / relevé (et blessés qui rampent), moral (ébranlé → décroche), heure et météo (nuit, brouillard,
  pluie) aux effets réels, décor destructible (caisses et palettes), accessoires d'arme (6), deux protections à acheter,
  camouflage des tenues selon le terrain, trois nouveaux traits (Grenadier, Vigie, Secouriste), synergie Frères d'armes.
- Contenu : 10 nouveaux opérateurs (24 recrutables), seconde faction (Milice du Delta) et campagne « Opération Delta »
  (9 missions, le Colonel), cinquième carte (gare de triage), 7 nouveaux succès (15), campagnes régulière et élite
  rééquilibrées (`outils/equilibrage_campagne.js`).
- Présentation : plan final ralenti sur la dernière neutralisation, répliques radio en bulles, traces de sang et
  d'explosion, lampadaires de nuit, vapeur à la raffinerie, tonalité ACES + vignettage, impacts selon la matière
  (3 nouveaux sons), musique dynamique, accessoires visibles sur les armes, voix radio (synthèse vocale du navigateur, désactivable).
- Technique : décor et personnages fusionnés (≈ 2× moins d'appels de dessin), sauvegarde versionnée (v2) avec migrations
  et mise de côté d'une sauvegarde illisible, tests de non-régression visuelle (`tests/visuel.py`), copie `docs/` pour
  GitHub Pages. Tests : moteur 99, jeu 96, ligue 11, page 63, visuel 7.

## Refonte graphique « comme le jeu d'origine » (17/10, après-midi)
- Références : 26 images du jeu d'origine dans `art/ref/` (vidéo de gameplay et bande-annonce officielle), comparées côte à côte
  avec `python3 outils/comparer.py original.png remake.png planche.png`.
- Menus refaits d'après l'original, sur une scène fixe 1920×1080 mise à l'échelle de la fenêtre : police Audiowide (OFL, incluse),
  fond vert lumineux dessiné (`web/fond.js`), barre du haut (saison, nom, rang violet, succès, crédits), accueil (soldat dans
  sa capsule, note d'équipe, emblème, tuiles Mes cartes / Mon équipe / Jouer), Équipe (grande carte, onglets, compétences,
  escouade en bas, « Changer de soldat » avec comparaison), Jouer (opérations spéciales, médailles des modes, missions,
  préparation avec 3 emplacements de tactiques), VS, briefing, résultat « VOUS AVEZ GAGNÉ / PERDU », récompenses en
  panneaux successifs, HUD de bataille (bandeau, plaques des soldats, VUE SAT). Emblèmes, icônes, drapeaux, médailles : vectoriels.
- Soldat 3D Meshy (texturé, riggé Mixamo, 17 animations) : `art/meshy/soldat_brut.glb` → `outils/compacter_glb.py` (2,6 Mo)
  → `outils/modele_en_js.py` → `web/modeles/soldat.js` ; `web/soldat3d.js` (teinte d'uniforme, animations selon l'état, arme
  tenue entre les mains). Utilisé en bataille, dans la capsule de l'accueil et pour tous les portraits. Secours : figure.js.
- Cartes : `web/decor.js` (asphalte et places de parking, béton taché, façades à fenêtres grillagées et affiches, barrières
  jersey, sacs de sable, berlines et pick-up surtout blancs, palmiers, immeubles crème et roses autour, ciel clair).
- Musiques refaites (orchestre militaire synthétisé) : QG (marche), bataille (taïkos), titre, fanfares de victoire et de défaite.
- À faire ensuite : une version plus légère du soldat (10 000 triangles) pour les machines modestes ; d'autres modèles Meshy
  (ennemis en tenue grise, véhicules) si le joueur le souhaite ; images 2D des médailles avec Gemini ; écran titre.

## Pistes suivantes
- Arbre de compétences plus riche que les promotions ; prestige au rang maximal.
- Application de bureau (Electron, .exe) si le jeu doit tourner hors navigateur.

## Images 2D (en pause — décision du 17/10)
- 17 images sur 45 sont faites (`art/suivi.json`, sorties dans `web/img/`) : 8 tactiques, 5 rôles, 2 succès, 2 portraits de test.
- Les portraits générés (op_vautour, op_lynx) ne conviennent pas : trop « jeu mobile », pas assez réalistes, buste seulement.
  Pour la reprise : style photo-réaliste, corps entier ou plan américain, poses naturelles, référence visuelle à définir avec le joueur.
- Restent : 5 succès, 3 UI (2 paquets, crédits), 20 portraits — via Gemini quand le quota revient (pas Meshy : crédits réservés à la 3D).
- Icônes déjà branchées : cartes de tactiques (QG, paquets, bataille), badges de rôles ; les 4 nouvelles tactiques et les succès
  utilisent encore des glyphes.

## Modèles 3D Meshy (`MODELES_MESHY.md`)
- 19 modèles prévus ; ≈ 44 crédits par modèle (1 image + image→3D) ; crédits restants ≈ 2 600. À lancer avec l'accord du joueur
  (crédits) et son navigateur.
- Ordre conseillé : soldat_base, carabine, conteneur, caisses, sacs_sable, voiture, puis le reste.

## GitHub Pages
- Activer Settings → Pages → « Deploy from a branch » → branche main, dossier **/docs** (copie de `dist/index.html` faite par `node build.js`) pour avoir le jeu jouable en ligne à l'adresse https://natchyyyy.github.io/operator-tactics/.
