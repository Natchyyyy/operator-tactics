# Tests du prototype (navigateur sans écran, SwiftShader)

Prérequis : serveur local `python3 outils/serveur.py . 8765` lancé à la racine du dépôt, page `web/index.html?manual=1`
(pas de boucle automatique : `API.step(n, 1/60)` avance la simulation, `API.touches({KeyW:1})` simule le clavier,
`API.set({visee:true, verrouRegard:true})` les modes, `API.mesures()` rend image, séquence, glissement, sauts, position).

- `scenario.py NOM "touches|secondes|vue;…"` — enchaîne des phases, une capture par phase, planche `captures/sc_NOM.png`
  et mesures (dont distance main droite ↔ poignée, main gauche ↔ garde-main). Touches : W A S D Maj visee novisee regard.
  Exemple : `python3 outils/tests/scenario.py arme "visee|1.5|troisQ;W+visee|2|cote;A+visee+regard|2|face"`
- `robuste.js` — à passer en `--etape "js:$(cat outils/tests/robuste.js)"` après `API.step(1,1/60)` : 90 s d'entrées
  aléatoires à 60 Hz (touches, arme, regard, caméra) puis 8 s d'arrêt ; rend NaN, hauteur max des orteils, vitesse verticale
  max, écart main/poignée, dérive à l'arrêt, sauts, glissement. Valeurs attendues : nan 0, orteil ≤ 0,30 (course), dérive 0,
  mainD > 1 cm seulement pendant les fondus de 0,25 s.
- `chemin.js` — 60 s sur le chemin de démo : points atteints, secondes bloquées, sauts, glissement.
- `stop2.js` — 20 s d'entrées aléatoires puis arrêt : séquence et position chaque seconde (le soldat ne doit plus bouger).

Références mesurées sur les données brutes (même définition du glissement) : Neutral repos 1,5 cm/s, marche 6, course 9,5 ;
Swat repos 1,4, marche 4,4. Le prototype en marche continue : 7 (Swat), 11 (Neutral) ; avec changements de direction toutes
les 2 s : 12-16 (transitions).
