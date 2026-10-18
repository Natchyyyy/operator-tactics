# Branche `pc-resultats` — machine de calcul et de rendu (PC Windows, RTX 5070 Ti)

Branche orpheline qui ne sert qu'à publier des résultats. Elle n'est jamais fusionnée dans `main` et le PC ne pousse jamais sur `main`.
**Elle est réécrite à chaque réponse** (un seul commit, `git push --force`) : récupérer avec `git fetch origin pc-resultats`
puis lire `origin/pc-resultats` (ne pas construire dessus).

## Où lire
- `resultats/DERNIER.md` : en-tête du dernier rapport (commit de main testé, résultat de chaque test, erreurs de la console) et liens.
- `resultats/<AAAA-MM-JJ_HH-MM>/rapport.md` : rapport complet d'un cycle. Seuls les 3 derniers dossiers sont gardés.
  - en tête : commit de main testé, chaque test réussi / échoué (avec le nom des vérifications qui échouent), erreurs de la console ;
  - `logs/` : sortie complète de chaque commande ;
  - `revue/` : revue des animations (`outils/revue/revue.py revue`), `rapport.md`, `rapport.json`, planches de preuve ;
    aperçus des états (`revue.py apercu`) ;
  - `carte/` (jour), `carte_nuit/`, `carte_pluie/`, `carte_brouillard/` : captures `?hd=1` (3 vues d'ensemble, 4 vues au sol
    à 1,6 m, bataille à t = 40 s) ;
  - seulement ce que la demande a réclamé : les autres dossiers sont absents ;
  - `mesures_rendu.json` : temps réel d'une image sur la carte graphique, triangles, ressources manquantes, erreurs de console.

## Demander quelque chose au PC (branche `pc-demande`)
Le PC ne teste plus rien de lui-même : il travaille **seulement sur demande**.
- Pour demander : pousser sur `pc-demande` un commit dont le **message** dit quoi faire, et sur quel commit. Par exemple :
  `git commit --allow-empty -m "revue des animations sur 4101218"` puis `git push origin HEAD:pc-demande`.
  Donner un message explicite (pas `git push origin main:pc-demande`, sinon le message du dernier commit de main sert de demande).
- Toutes les 5 minutes, le PC fait seulement `git ls-remote origin refs/heads/pc-demande`. Si le commit a changé depuis la
  dernière demande traitée, il lit `git log -1 --format=%B` et fait **seulement** ce qui est demandé (le build est toujours fait).
- Mots compris (majuscules et accents indifférents) :
  - « test(s) », « verif… » : `node tests/{verify,ia,voies,game,league}.js` + `tests/verif_page.py` ;
  - « revue », « animation(s) » : revue des animations (`revue.py revue`) ;
  - « aperçu(s) » : aperçus des états (`revue.py apercu`, gign et soldat) ;
  - « mesure(s) », « perf… », « fps », « temps d'image » : mesures de rendu (`pc/mesures.py`) ;
  - « capture(s) », « carte(s) », « vue(s) » : captures `?hd=1` (8 vues), de jour par défaut ;
  - « jour », « nuit », « pluie », « brouillard » : heure / météo des captures, plusieurs possibles (« captures jour et nuit ») ;
    le menu du jeu (`#condSel`) puis « Nouvelle bataille », même graine ; « nuit » seul suffit pour des captures de nuit ;
  - « tout », « complet » : toutes les étapes ;
  - un numéro de commit (7 à 40 caractères hexadécimaux) : le commit testé ; sans numéro, le dernier commit de `main`.
    Un commit d'une autre branche est accepté, avec un avertissement en tête du rapport.
- Le message n'est jamais exécuté : il est seulement comparé à cette liste de mots.
- Le rapport (et `resultats/DERNIER.md`) commence par « Réponse à la demande `<commit de pc-demande>` » avec le message cité,
  le commit testé, les étapes faites et non demandées. Demande non comprise ou commit introuvable : rapport court qui le dit.
- Une seule demande à la fois (verrou `pc_cycle.lock`) : seule la DERNIÈRE demande (tête de `pc-demande`) est lue ;
  mettre tout ce qu'on veut dans un seul message. Une demande qui fait planter le PC 3 fois de suite est abandonnée et signalée.
- PC éteint ou session Windows fermée : la demande est traitée au premier passage après l'ouverture de session.
- Ce qui ne passe pas par `pc-demande` (changer le fonctionnement du PC, installer quelque chose) passe par l'utilisateur.

## Fonctionnement
- Tâche planifiée Windows « OperatorTactics-PC » (`pc/planifier.ps1`, toutes les 5 min, sans fenêtre, journal local
  `pc_journal.log`) : `pythonw pc/cycle.py`. Sans nouvelle demande, rien n'est écrit ni publié.
- À la main sur le PC : `python pc/cycle.py --simuler "captures de nuit"` (essai, marqué « demande simulée »),
  `python pc/cycle.py --forcer --quoi tout` (sur origin/main).
- Images : JPEG qualité 80, 1600 px de large au plus.
- `main` est testé dans une copie de travail séparée (`../operator-tactics-main`, détachée sur `origin/main`, nettoyée à chaque cycle).
- `pc/lanceur_gpu.py` lance les scripts du projet tels quels, mais en WebGL matériel (ANGLE / Direct3D 11) au lieu de SwiftShader,
  avec un `fcntl` factice pour `verrou.py` et le bon chemin des navigateurs Playwright. `PC_GL=logiciel` garde SwiftShader.
- Les captures `?hd=1` passent par `docs/index.html` : `docs/hd/` est versionné, `dist/hd/` ne l'est pas (`.gitignore`).
  Avant le build, `web/hd/` est reconstitué depuis `docs/hd/` (sinon `build.js` vide `docs/hd/` sur une copie neuve).

## Playwright
- Versions figées dans `pc/requirements.txt` (playwright 1.64.0, navigateurs chromium-1248). Au début de chaque cycle,
  `cycle.py` vérifie la version (réinstalle la version figée si elle a changé) et lance une sonde WebGL ; si le navigateur
  est introuvable, il relance `python -m playwright install chromium` et le note dans le rapport.
- `python pc/verifier.py` : vérifie que la sonde, `revue.py`, `pc/mesures.py` et `tests/verif_page.py` démarrent.
- Les navigateurs doivent être installés depuis la session Windows de l'utilisateur (terminal normal), pas depuis
  l'environnement isolé de Claude Code : ce qui y est écrit hors du dépôt n'est pas visible pour la tâche planifiée.
