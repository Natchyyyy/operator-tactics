# STATE — 20/10/2026 (version 47 publiée)
- Fait : souris façon jeu de stratégie (`web/app.js`, partie `cameraControls` + `ordHold*` / `sel*`) : rectangle de
  sélection au clic gauche, clic droit court = ordre direct, clic droit maintenu = liste d'ordres (lâcher = valider),
  caméra libre au bouton du milieu. CSS `.ordhold`, `#selbox` dans `web/index.html` ; aides mises à jour.
- Doctrine française reçue : `conception/doctrines/deplacement_securisation_fr.md` (tableau « déjà là / manque » + liste
  d'animations pour le motion matching).
- Tests : `tests/verif_page.py` revu (clic court, clic maintenu → Décrocher, rectangle).
- Prochaine tâche : retour de l'utilisateur sur la souris ; accord sur les points de doctrine à coder (Sécu B près des
  angles, ralentir avant les angles, raser un mur, délai de mise en joue).
