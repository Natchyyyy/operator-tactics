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
- Première mise à terre sans balle dans la tête : réanimable, délai long (1 minute) ou sans délai — à trancher.
- Chargeurs « comme dans la vraie vie » : 30 coups, 1 dans l'arme + 6 sur le gilet (déjà le cas : `kit: 6`).
- Animations : faites par le motion matching (pas à prévoir dans la simulation).

## Ordre de travail proposé
1. ✅ fait (v64) — Analyseur de trajet (`analyzePath`) + affichage des tags sur la carte (sans effet sur le combat).
2. ✅ fait (v65) — Hérisson à l'arrêt (secteurs 360° déjà en place ; collage à un obstacle à moins de 2 m, genou à terre au calme).
3. ✅ fait (v66) — Rôles en marche (pointe et appui devant, flancs ±40° vers leur côté, serre-file coup d'œil arrière toutes les 7 s) — le regard cède dès qu'il y a un contact.
4. Traversée de découvert (appuyer / franchir).
5. Tiroir sur zone ouverte (parking).
6. Réflexes : embuscade, homme à terre (fumigène + tir d'appui + traînage, en gardant le sauvetage v62).
7. Chargeurs persistants + « Check Ammo » + annonces.
8. Suppression : tir à l'aveugle, panique + ordre « Ralliement ».
9. Blessures localisées (bras, jambe, torse, tête) + plaques + « sonné » + hémorragie + garrot (remplace les PV).
10. Voitures découpées (moteur/roues = arrêtent, portières = cachent seulement), abris qui s'abîment.
11. Trace de sang suivie par l'ennemi.

## Questions ouvertes
- ~~Comment une bataille se termine~~ → décidé (22/10) : on garde la règle actuelle, une équipe doit gagner en restant en vie (on en reparlera plus tard).
- Délai d'hémorragie avant de tomber (45 s ? 60-90 s ?).
- Plaques : choix avant mission (3A / 3 / 4) et effet sur la vitesse.
