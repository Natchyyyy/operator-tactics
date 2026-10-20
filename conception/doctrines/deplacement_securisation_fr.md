# Doctrine de déplacement et de sécurisation (unités françaises) — reçue le 20/10/2026

Document de l'utilisateur (sa consigne : « mémoriser, ne pas coder tout de suite »). Référence pour l'IA de déplacement,
la visée et le **motion matching**. Rien de ceci n'est encore une mécanique du jeu : chaque point qui change les règles
(bonus, pénalité, délai) demande son accord avant d'être codé.

## 1. Philosophie : « le Bouclier, l'Ascendant et la Maîtrise »
- Protection maximale, progression méthodique derrière du blindage lourd, saturation psychologique (≠ « vitesse pure »
  anglo-saxonne).
- **Colonne d'assaut (« le train »)** en milieu clos : formation très serrée ; le n° 1 encaisse derrière un bouclier lourd
  (type Ramsès), le n° 2 épaule contre épaule riposte.
- Traduction proposée : résilience accrue de face, pénalité de vitesse → « rouleau compresseur » face au Groupe Karst.

## 2. Postures de l'arme (référentiel ISTC)
- **Sécu B** (sécurité basse) : en déplacement ou près des ouvertures, canon légèrement vers le bas ; dégage la vue
  par-dessus l'arme, n'annonce pas sa présence en passant une porte.
- **Position de contact** : arme dans l'épaule, visée alignée ; seulement à l'arrêt, au tir, ou en entrée dynamique.
- Traduction proposée : en Sécu B on va plus vite, mais un délai de mise en joue (quelques millisecondes) si surpris.

## 3. Déplacements à découvert : mouvement et appui
- Un mouvement sans appui est suicidaire.
- **Tiroir** : un élément sprinte, l'autre reste totalement immobile et couvre les secteurs dangereux.
- **Raser un mur** : longer un des murs d'une ruelle plutôt que le centre (exposition aux angles morts divisée par deux).
- **Allure** : accélération maximale à découvert, décélération brutale à l'approche des angles et des portes.

## 4. Milieu clos (CQB) et ouvertures
- L'encadrement d'une porte est un « entonnoir de la mort » : ne jamais y stagner.
- **Découper la tarte** : reculer au maximum dans le couloir (voir sans être vu), se décaler degré par degré en balayant.
- **Pénétration limitée** : nettoyer ~90 % de la pièce depuis l'extérieur, le mur du couloir comme couvert, plutôt que
  l'entrée dynamique.

## Ce qui existe déjà dans le jeu (20/10)
| Doctrine | Déjà là | Manque |
|---|---|---|
| Sécu B / contact | « Garde basse » quand aucun ennemi n'est connu, fusil épaulé au contact (`soldat3d.js`) | Garde basse aussi près des angles/portes même avec un ennemi connu ; délai de mise en joue (à valider) |
| Tiroir | Tactique Tiroir, ordre Méthodique (une moitié bondit, l'autre couvre) | — |
| Mouvement + appui | Ordre Feu « Appui » (tir de suppression) | — |
| Allure | Sprint vers un couvert sous la menace ; Franchir (sprint à découvert un par un) | Ralentir avant un angle / une porte |
| Raser un mur | — | Préférer un côté de la ruelle dans la recherche de chemin |
| Colonne, bouclier | — | « Plus tard » (vague 3, décision du 19/10) |
| Tarte, pénétration limitée | — | Il faut des bâtiments (2e carte, vague 3) |

## Pour le motion matching (`prototypes/motion-matching/`)
Animations/états dont l'IA aura besoin, à prévoir dans la base de mouvements :
1. Marche et course en **Sécu B** (canon bas, toutes directions), et marche en **contact** (arme épaulée, toutes directions).
2. Transitions **Sécu B ↔ contact** à l'arrêt et en marchant (c'est là que se jouera le délai de mise en joue).
3. **Freinage brutal** avant un angle (de la course à la marche lente en 1-2 pas) et départ en sprint depuis l'arrêt.
4. **Pas chassés lents** le long d'un mur, épaule côté mur (découper la tarte, raser un mur).
5. Plus tard : marche en colonne serrée (main sur l'épaule du n° 1), porteur de bouclier.
