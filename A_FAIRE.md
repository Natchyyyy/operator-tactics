# À faire (suivi pour reprendre plus tard)

## Fait pendant la nuit du 16 au 17/10 (tout est testé, poussé sur main, et publié dans l'artifact)
- Interface : écran Cartes v2 (paquets dessinés, ouverture carte par carte, raretés), Équipe v2 (escouade en pied avec notes),
  Réglages ⚙ (volumes, vitesse et caméra par défaut, qualité, ombres, export / import de la carrière), onglet Carrière
  (bilan, terrains, dernières batailles, succès avec jauges), contrats du jour, briefing des missions de campagne,
  astuces sur l'écran VS, écran titre v2 (« Reprendre la carrière »), bouton « ⏭ Résultat ».
- Simulation : à terre / relevé (et blessés qui rampent), heure et météo (nuit, brouillard, pluie) aux effets réels,
  accessoires d'arme (6), trois nouveaux traits (Grenadier, Vigie, Secouriste), synergie Frères d'armes.
- Contenu : 6 nouveaux opérateurs (20 recrutables), seconde faction (Milice du Delta) et campagne « Opération Delta »
  (8 missions, le Colonel), 7 nouveaux succès (15), campagne régulière et élite rééquilibrées (`outils/equilibrage_campagne.js`).
- Présentation : répliques radio en bulles, traces de sang et d'explosion, lampadaires de nuit, vapeur à la raffinerie,
  tonalité ACES + vignettage, impacts selon la matière (3 nouveaux sons), musique dynamique.
- Technique : décor et personnages fusionnés (≈ 2× moins d'appels de dessin), sauvegarde versionnée (v2) avec migrations
  et mise de côté d'une sauvegarde illisible, tests de non-régression visuelle (`tests/visuel.py`).

## Pistes suivantes
- Moral / repli quand l'escouade est décimée (à équilibrer avec soin : change beaucoup l'issue des batailles).
- Plan final ralenti sur la dernière neutralisation (kill-cam) pendant la bannière de fin.
- Dégâts de décor (caisses qui cèdent sous les explosions) : touche la carte de la simulation (LOS, A*).
- Une cinquième carte ; arbre de compétences plus riche que les promotions ; prestige au rang maximal.
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
- Activer Settings → Pages → branche main, dossier /dist pour avoir le jeu jouable en ligne.
