# Plan « Commandant » — doctrine, blessures, munitions

Fiche de décisions (22/10/2026). Rien de tout ça n'est codé tant que ce n'est pas marqué « fait ».
Principe : le joueur est le **commandant** (clics droits), l'IA **exécute** comme de vrais soldats, en suivant les
principes français : binôme, « un appuie / l'autre progresse », secteurs de surveillance, Sauvetage au Combat
(SC1, « SAFE MARCHE RYAN », garrot en premier pour un membre qui saigne).

## Décidé
- Version B des chiffres : découvert = segment de plus de 5 m sans abri à moins de 2 m de l'axe ; collage à un
  obstacle à l'arrêt si à moins de 2 m ; fumigène lancé par le soldat le plus proche du blessé.
- Embuscade : riposte immédiate + plongée vers l'abri solide le plus proche (3 à 5 m), annonce « Contact ! On est
  fixés ! ». Pas de contournement ni de retraite décidés par l'IA : on attend l'ordre du joueur.
- Chef automatique pour l'équipe adverse (il donne les mêmes ordres qu'un joueur).
- Moins de 5 soldats : ils font comme ils peuvent (2 = binôme : un couvre, l'autre avance ; 3-4 = pointe, serre-file,
  flancs).
- Première mise à terre sans balle dans la tête : réanimable — choisi en ton absence (22/10) : 1 minute (REVIVE_WINDOW). À confirmer.
- Chargeurs « comme dans la vraie vie » : 30 coups, 1 dans l'arme + 6 sur le gilet (déjà le cas : `kit: 6`).
- Animations : faites par le motion matching (pas à prévoir dans la simulation).

## Ordre de travail proposé
1. ✅ fait (v64) — Analyseur de trajet (`analyzePath`) + affichage des tags sur la carte (sans effet sur le combat).
2. ✅ fait (v65) — Hérisson à l'arrêt (secteurs 360° déjà en place ; collage à un obstacle à moins de 2 m, genou à terre au calme).
3. ✅ fait (v66) — Rôles en marche (pointe et appui devant, flancs ±40° vers leur côté, serre-file coup d'œil arrière toutes les 7 s) — le regard cède dès qu'il y a un contact.
4. ✅ fait (v67) — Traversée de découvert : en Méthodique et Discret aussi (choix du 22/10), tout découvert de plus de 5 m (rien pour se cacher à moins de 2 m) se traverse un par un (deux par deux à 4-5), au sprint (accroupi en Discret), sous la couverture des autres ; le premier passé couvre l'autre côté. « Franchir » reste l'ordre avec fumée.
5. ✅ fait (v67) — Tiroir « à la française » en zone ouverte : hors passage étroit et tant qu'aucun ennemi n'est connu (15 s), bonds successifs (le trinôme bondit, le binôme le rejoint à sa hauteur sans le dépasser) ; au contact, bonds alternés.
6. ✅ fait (v67) — Réflexes : embuscade (pris sous le feu sans avoir tiré le premier → « Contact ! On est fixés ! », chacun riposte et plonge à l'abri ≤ 5 m, puis tient en attendant l'ordre) ; homme à terre : pendant le traînage (et le fumigène du sauveteur, le plus proche), les autres arrosent la position ennemie (« Je te couvre ! »).
7. ✅ fait (v67) — Chargeurs persistants (chaque chargeur garde ses coups ; sous le feu l'entamé tombe, au calme il est rangé, +0,5 s) ; « Check ammo » au calme après un échange ; « Dernier chargeur ! », « Je suis court en munitions ! ».
8. ✅ fait (v67) — Tir à l'aveugle (cloué, paniqué, ou sous le feu derrière un abri sans voir le tireur : courtes rafales par-dessus l'abri, sans dégâts, qui clouent) ; panique (la peur monte sous un feu lourd, ou un équipier tombe à côté ; tirage selon le sang-froid) ; ordre « Ralliement » (menu Plus…) : fin de la panique et tous au point.
9. ✅ fait (v67) — Blessures localisées (remplacent les PV pour les balles) : tête = casque qui dévie parfois (sonné 2 s), sinon mort sans relève ; torse = plaque (70 % du torse) qui arrête selon son niveau et s'use (−15 % par balle, sonné 1 s), sinon hémorragie interne (à terre en 45 s, une fois sur deux tout de suite) ; bras = vise mal, recharge lentement ; jambe = boite ; bras/jambe saignent (à terre en 75 s) → garrot posé soi-même à l'abri (6 s, 9 s pour un bras ; jamais pendant un ordre de déplacement : un ordre du joueur passe avant — v68). 3 blessures ou 2 au torse : à terre. Première mise à terre sans balle dans la tête : relevable pendant 1 minute ; la deuxième : hors de combat.
10. ✅ fait (v67) — Voitures : bloc moteur et roues (pour un soldat accroupi) arrêtent les balles, les portières cachent seulement ; une voiture criblée laisse passer de plus en plus de balles (16 % neuve, +3 % par balle reçue, 55 % au plus).
11. ✅ fait (v67) — Trace de sang : un blessé qui saigne laisse des gouttes (affichées au sol) ; un ennemi qui en voit une fraîche à moins de 8 m apprend à peu près où est le blessé.

## Questions ouvertes
- ~~Comment une bataille se termine~~ → décidé (22/10) : on garde la règle actuelle, une équipe doit gagner en restant en vie (on en reparlera plus tard).
- Délai d'hémorragie avant de tomber → choisi en ton absence (22/10) : 75 s pour un bras ou une jambe, 45 s pour le torse (constantes BLEED_LIMB / BLEED_TORSO dans sim/engine.js). À confirmer.
- Plaques : choix avant mission (3A / 3 / 4) et effet sur la vitesse → pas encore d'écran de choix ; les niveaux existants servent (léger IIIA, moyen III, lourd IV, vitesse ×1 / ×0,9 / ×0,78) avec des chances d'arrêt 10 % / 80 % / 95 %. À confirmer.
