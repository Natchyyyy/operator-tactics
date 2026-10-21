# STATE — 21/10/2026 (motion matching intégré, version 53 publiée)
- Fait : motion matching dans le jeu. `web/mm.js` = module GÉNÉRÉ par `node outils/mm_extraire.js` depuis
  `prototypes/motion-matching/web/mm.js` (ne pas éditer à la main) ; `web/mm_jeu.js` = liaison : la simulation décide
  (position/chemin, vitesse, visée, accroupi, couvert, traînage, réa), le module joue les gestes par pas de 1/60 s et suit la
  position simulée (avance 0,25 s, rattrapage doux, replacement > 1,5 m). Morts : `Agent.tuer` → ragdoll du jeu ;
  sauvetage : `Sauvetage` du module piloté par les états du jeu (todrag/dragging/reviving/revive, `finRea`).
- Données : `web/hd/mm_base.json` + `mm_base.{0,1,2}.wasm` (23 Mo, servies une fois ; `?mm=0` = anciens clips).
- `app.js` : makeOperator (MM d'abord), syncMeshes (`OT.MMJeu.image`), événements shot/down/revive, clearOperators.
- Tests Node verts (game 83, verify 79, ia 81, voies 22). Coût mesuré : ~0,45-0,9 ms/soldat/pas (machine lente).
- Limites connues : rechargement / lancer de grenade sans geste propre (pose MM gardée) ; la prise au col (~3 s) est plus
  lente que la simulation qui tire tout de suite (le module rattrape puis pose) → proposer à l'utilisateur de faire attendre
  la simulation ~3 s avant de tirer (changement de règle, pas fait) ; relevé parfois décalé de ≤ 1,5 m (rattrapage).
- v52 (ordres, autre conversation) : déplacement « Discret » (bonds accroupis, feu retenu jusqu'au repérage — `stealthy()`), arrivée « Freinage » (tenir puis décrocher sur la 2e ligne = point de départ, une fois — `updateFreinage()`), « Embuscade » et « Appui » dans la roue. Reste de la doctrine : colonne, bouclier, combat en pièces (il faut des bâtiments). À définir avec l'utilisateur : bonus/pénalités de doctrine (légers).
- Prochaine tâche : retour de l'utilisateur sur la v53 (bugs visuels) ; captures zoomées + agent QA sur tir, couvert, réa.
