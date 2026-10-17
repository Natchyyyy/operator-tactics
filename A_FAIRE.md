# À faire (suivi pour reprendre plus tard)

## Fait pendant la nuit du 16 au 17/10 (tout est testé, poussé sur main, et publié dans l'artifact)
- Interface : écran Cartes v2 (paquets dessinés, ouverture carte par carte, raretés), Équipe v2 (escouade en pied avec notes),
  Réglages ⚙ (volumes, vitesse et caméra par défaut, qualité, ombres, export / import de la carrière), onglet Carrière
  (bilan, terrains, dernières batailles, succès avec jauges), Ligue v2 (prochain match, forme, puissance, podium),
  contrats du jour, briefing des missions de campagne, astuces sur l'écran VS, écran titre v2 (« Reprendre la carrière »),
  bouton « ⏭ Résultat », fil des neutralisations, guide de première visite, aide accessible depuis le QG.
- Simulation : à terre / relevé (et blessés qui rampent), moral (ébranlé → décroche), heure et météo (nuit, brouillard,
  pluie) aux effets réels, décor destructible (caisses et palettes), accessoires d'arme (6), deux protections à acheter,
  camouflage des tenues selon le terrain, trois nouveaux traits (Grenadier, Vigie, Secouriste), synergie Frères d'armes.
- Contenu : 10 nouveaux opérateurs (24 recrutables), seconde faction (Milice du Delta) et campagne « Opération Delta »
  (9 missions, le Colonel), cinquième carte (gare de triage), 7 nouveaux succès (15), campagnes régulière et élite
  rééquilibrées (`outils/equilibrage_campagne.js`).
- Présentation : plan final ralenti sur la dernière neutralisation, répliques radio en bulles, traces de sang et
  d'explosion, lampadaires de nuit, vapeur à la raffinerie, tonalité ACES + vignettage, impacts selon la matière
  (3 nouveaux sons), musique dynamique, accessoires visibles sur les armes.
- Technique : décor et personnages fusionnés (≈ 2× moins d'appels de dessin), sauvegarde versionnée (v2) avec migrations
  et mise de côté d'une sauvegarde illisible, tests de non-régression visuelle (`tests/visuel.py`), copie `docs/` pour
  GitHub Pages. Tests : moteur 99, jeu 96, ligue 11, page 62, visuel 7.

## Pistes suivantes
- Modèles 3D Meshy (voir plus bas) : c'est ce qui changera le plus l'aspect du jeu.
- Arbre de compétences plus riche que les promotions ; prestige au rang maximal.
- Répliques radio parlées (voix synthétisées) en plus des bulles.
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
