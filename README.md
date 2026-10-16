# OPERATOR TACTICS — prototype jouable

Jeu tactique militaire à collectionner : deux escouades de cinq opérateurs s'affrontent de façon autonome en 3D ;
l'issue dépend uniquement des événements simulés (perception, déplacements, tirs, dégâts, décisions individuelles).

## Lancer
- Page jouable : `dist/index.html` (une seule page autonome, three.js inclus) — ou la version artifact `dist/artifact.html`.
- Développement : `python3 outils/serveur.py . 8765` puis http://127.0.0.1:8765/web/index.html
- Assembler : `node build.js`

## Organisation
| Dossier | Contenu |
|---|---|
| `sim/rng.js` | générateur aléatoire déterministe (graine) |
| `sim/data.js` | armes, protections, rôles, compétences, opérateurs (Coalition et Groupe Karst), ordres, missions, prix, table d'expérience |
| `sim/map.js` | cartes (obstacles 3D avec hauteur), grille + A*, lignes de vue (rayon 3D), points de couverture |
| `sim/engine.js` | moteur de combat : perception, radio, IA, déplacements, tirs, dégâts, suppression, fin de bataille, journal |
| `sim/game.js` | boucle de jeu : profil, collection, équipement, voies, missions, récompenses, sauvegarde locale |
| `web/app.js` | rendu three.js, animations, effets, interface de bataille, résultat |
| `web/hq.js` | quartier général (escouade, fiche, armurerie, missions) |
| `tests/verify.js` | 45 vérifications du moteur (`node tests/verify.js 40`) |
| `tests/game.js` | 24 vérifications de la boucle de jeu |
| `tests/verif_page.py` | 28 vérifications de la page dans un navigateur (Playwright, WebGL logiciel) |
| `sons/sons_ot.py` | les 14 bruitages (synthèse hors ligne avec la boîte à outils ; `fabriquer.py` → `sons/out`, `integrer.py` → page) |
| `tests/run.js`, `tests/trace.js`, `tests/stats.js` | une bataille en console, trace seconde par seconde, statistiques d'équilibrage |

## Règles de simulation (résumé)
- Pas de 0,1 s ; décisions toutes les 0,3 s ; ordre de traitement mélangé à chaque pas (aucun avantage de côté).
- Vue : champ ~112°, portée 30–75 m selon la perception, rayon des yeux (1,6 m debout / 1,0 m accroupi) vers la poitrine
  (1,25 / 0,75 m) ; les obstacles bloquent par leur géométrie. Ouïe : un tir est entendu jusqu'à 70 m (18 m silencieux).
- Un couvert bas cache un soldat accroupi ; debout, il protège le bas du corps (chance d'être touché × 0,55).
- Chance de toucher = précision de l'arme × compétence × distance (portée efficace, portée minimale) × mouvement × posture
  × couvert × suppression × blessure × position préparée (ordre Tenir).
- Dégâts = arme × perte à distance × localisation (tête 8 %, torse 52 %, membres 40 %) × (1 − protection) ± 15 %.
- Ordres : Assaut (contact), Tenir (postes face aux axes, embuscade, calé), Prudent (bonds, contournement, repli) ; l'ordre d'Alpha se change en cours de bataille (`Battle.setOrder`).
- Compétences : un trait par opérateur (`DATA.TRAITS`), chaque effet est implémenté dans engine.js (rechercher `has(u, '…')`).
- Fin : équipe neutralisée, objectif « tenir » à l'échéance, ou limite de temps (décision aux effectifs puis à l'état).

## Limites connues
- Modèles d'opérateurs construits par programme (pas de modèles externes) ; bruitages synthétisés, pas de musique.
- Deux cartes, 14 opérateurs recrutables + 8 ennemis du Groupe Karst, 7 armes, 3 protections, 7 missions.
- La sauvegarde est locale au navigateur (localStorage) : pas de synchronisation entre appareils.
