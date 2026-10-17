# À faire (suivi pour reprendre plus tard)

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
