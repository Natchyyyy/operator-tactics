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
| `sim/game.js` | boucle de jeu : profil, collection, équipement, voies, missions, récompenses, blessures graves, synergies, défis, paquets de cartes, perks, rang, tactiques équipées, personnalisation, sauvegarde locale |
| `sim/league.js` | ligue solo : saison de 8 matchs contre 9 équipes IA, matchs IA réellement simulés, classement, prix |
| `web/app.js` | rendu three.js, animations, effets, interface de bataille, résultat |
| `web/hq.js` | quartier général à onglets (accueil, équipe, cartes, jouer, ligue, carrière), écran VS avec astuces, écran de récompenses en panneaux, ouverture des paquets |
| `tests/verify.js` | 95 vérifications du moteur (`node tests/verify.js 40`) |
| `tests/league.js` | 10 vérifications de la ligue |
| `tests/game.js` | 89 vérifications de la boucle de jeu |
| `tests/verif_page.py` | 60 vérifications de la page dans un navigateur (Playwright, WebGL logiciel) ; `tests/tout.sh` lance tout |
| `tests/visuel.py` | non-régression visuelle : 7 écrans clés comparés à `tests/ref/*.png` (`--maj` pour accepter un changement voulu) |
| `outils/equilibrage_campagne.js` | taux de victoire par mission avec une progression normale de l'escouade |
| `sons/sons_ot.py` | les bruitages et musiques (impacts selon la matière : béton, métal, bois, sol) (synthèse hors ligne avec la boîte à outils ; `fabriquer.py` → `sons/out`, `integrer.py` → page) |
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
- Tactiques (`DATA.TACTICS`) : actives (fumigène = obstacle temporaire bloquant la vue, drone, soins, mortier) jouées par le joueur ou par l'IA adverse ; passives appliquées dès le début. Effets dans engine.js (`useTactic`, `updateTactics`, `hasTactic`).
- Objectifs : neutraliser, tenir (échéance), **capturer la zone** (jauge par équipe : 1,6 %/s + 0,4 par opérateur présent, bloquée si la zone est disputée, 100 % = victoire).
- Synergies d'escouade (`DATA.SYNERGIES`) : Commandement (Meneur → Radio et Appui : dégâts −10 %), Guidage radio (Radio → tireur, appui, brèche : précision +8 %), Appui-feu (Appui → Assaut, Pointe : récupération +20 %) — actives tant que la source est debout.
- Blessure grave : un neutralisé revient avec ses compétences ÷2 et −25 % de PV jusqu'aux soins (crédits) ou à 2 missions de repos.
- Spéciaux : tête, séries, de groupe (cible déjà touchée par un allié < 5 s), revanches, vétérans.
- Modes : bataille rapide (adversaire à votre mesure, paquet offert toutes les 5 victoires), campagnes régulière / vétéran / élite, opérations spéciales, ligue.
- À terre : un neutralisé (hors balle dans la tête) reste parfois à terre 20 s, rampe vers un allié, qui peut le relever (4 s, Secouriste 2 s) une fois par bataille.
- Heure et météo (`DATA.CONDITIONS`) : nuit (vue ÷2, éclair des armes non silencieuses), brouillard, pluie (ouïe réduite) ; précision lointaine réduite.
- Accessoires d'arme (`DATA.ATTACHMENTS`) : lunette, holographique, silencieux, compensateur, poignée, grand chargeur — effets réels, visibles sur l'arme.
- Contrats du jour (`DATA.DAILY`) : trois objectifs tirés selon la date, payés une fois.
- Fin : équipe neutralisée, objectif atteint, ou limite de temps (décision aux effectifs puis à l'état). « ⏭ Résultat » simule la fin sans rendu (même résultat).

## Limites connues
- Modèles d'opérateurs construits par programme (pas de modèles externes : les modèles Meshy sont prévus) ; bruitages, ambiances et musiques synthétisés.
- Cinq cartes (dont la gare de triage), 24 opérateurs recrutables (17 traits, dont Grenadier, Vigie, Secouriste) + 16 adversaires (Groupe Karst, Milice du Delta), 7 armes, 5 protections, 4 tenues camouflées, 14 missions × 3 campagnes, 12 tactiques, 6 accessoires, 14 succès, 7 défis, 3 opérations spéciales, contrats du jour ; réglages et export / import de la carrière.
- Pas de multijoueur : la ligue oppose le joueur à des équipes IA (leurs matchs entre elles sont simulés par le même moteur).
- La sauvegarde est locale au navigateur (localStorage) : pas de synchronisation entre appareils.
