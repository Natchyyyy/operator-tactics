# STATE — 20/10/2026 (version 48 publiée)
- Fait : souris façon jeu de stratégie (`web/app.js`, partie `cameraControls` + `ordHold*` / `sel*`) : rectangle de
  sélection au clic gauche, clic droit court = ordre direct, clic droit maintenu = liste d'ordres (lâcher = valider),
  caméra libre au bouton du milieu. CSS `.ordhold`, `#selbox` dans `web/index.html` ; aides mises à jour.
- Doctrine française reçue : `conception/doctrines/deplacement_securisation_fr.md` (tableau « déjà là / manque » + liste
  d'animations pour le motion matching).
- Tests : `tests/verif_page.py` revu (clic court, clic maintenu → Décrocher, rectangle).
- v48 (doctrine, accord de l'utilisateur) : « raser un mur » (chemins de progression qui longent les obstacles :
  `GameMap.open/openLen`, `findPath(…, extra, hug)`, `RASER` dans `sim/engine.js`) et « ralentir avant un angle aveugle »
  (`Battle.cornerSpeed`). Tests ajoutés dans `tests/voies.js` ; `tests/ia.js` : rencontres mesurées sur 24 batailles,
  graine 5 pour le fumigène. Arme basse près des angles = laissé au motion matching (décision).
- Prochaine tâche : retour de l'utilisateur sur la souris et sur v48 ; définir avec lui les bonus / pénalités de doctrine
  (légers en calcul).
