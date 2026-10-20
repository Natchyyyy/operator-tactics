# STATE — 20/10/2026 (version 46)
- Fait : couvert (trajet exposé pénalisé, `pathExposure`), portières traversables (1 balle sur 6, dégâts ×0,5, sauf bloc
  moteur 1,3 m côté capot : `map.softCover`), mémoire du danger Karst (`noteDanger`, `dangerGrid` → A*, `dangerWatch`),
  lampadaires (`map.lamps`, `litAt`, ordre `lampadaire`, rendu `Parking.lampOff`), alarmes de voiture (3e balle, 25 s,
  sirène fabriquée `Son.fabriquer`, feux), vitres fendues (décalques `cracks`), Top action (file `TOPQ`, bouton TOP).
- Fichiers : sim/engine.js, sim/map.js, web/app.js, web/effets.js, web/parking.js, web/lecteur.js, web/index.html,
  tests (verify : tireur remis en état ; ia : relève exclue de l'écart ; voies : 16 graines ; page : 45 s de brouillard).
- KTX2 : écarté pour l'instant (gain nul sur le PC de l'utilisateur, transcodeur à embarquer).
- Prochaine tâche : retour de l'utilisateur sur la v46 (nuit plus lisible sous les lampadaires = équilibre à surveiller).
