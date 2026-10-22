# STATE — 22/10/2026 — branche `mm-doctrine` (prototype motion matching v37, rien d'intégré au jeu)
- Demande utilisateur : animations « doctrine » (TTA 150) ultra fluides, sans glissement des pieds, dans le PROTOTYPE seulement
  (`prototypes/motion-matching/`), branche à part ; pas d'IA, pas de modification du jeu ; l'intégration viendra plus tard.
- Fait, commit b860b36 : glissement 16,7 → 5,3 cm/s sur le chemin de démo. Causes : racine « roulant » sous les pieds (foulées
  re-ciblées ~10 % plus courtes → racine TENUE par le pied d'appui, `racineTenue:'vecteur'`, aussi pendant les fondus),
  correction de cap qui pivote maintenant autour du pied posé, sauts de séquence en boucle (style sur vitesse lissée +
  hystérésis, arrêt cru après 0,1 s, saut forcé ≤ 2/s). Dans le jeu (mesure diagnostique seulement) : 100-180 → 35-70 cm/s ;
  le reste vient de la liaison `web/mm_jeu.js` (ordre chemin qui s'allume/s'éteint à chaque pas) → à traiter à l'intégration.
- Fait, commit c4f5e0c : pose « genou à terre » (`ctl.genou`), preset 4 scripté (colonne → halte 360° → bonds → ligne),
  page branchée sur `web/hd/mm_base.*`, `gign_hd.glb`, `fusil.glb` versionnés (un clone suffit, serveur à la racine).
- Tests prototype OK : chemin.js (12 points, 5,3 cm/s), robuste.js (nan 0, dérive 0), stop2.js, presets 1/3/4 sans erreur.
- `outils/mm_extraire.js` : compte `horloge` passé à 15 (régénérer `web/mm.js` SEULEMENT à l'intégration, pas sur cette branche).
- Prochaine tâche : retour de l'agent QA sur les planches (captures/planche_*.png) → corriger ; puis, avec l'accord de
  l'utilisateur, intégration (fusion `mm-doctrine` → `main`, régénération de `web/mm.js`, liaison : ordres stables sur 0,1 s).
