# OPERATOR TACTICS — instructions pour toute nouvelle session Claude

Lire d'abord : ce fichier, puis `conception/ETAT_DU_PROJET.md` (où on en est, choix validés, suite),
`A_FAIRE.md`, `conception/doctrines/decisions.md`, `conception/doctrines/strategies_gign.md`, `README.md`.

## Le projet en deux lignes
Jeu tactique 5 contre 5 dans le navigateur (three.js r159, interface en français). Les combats sont simulés
(`sim/`), le rendu est dans `web/`. Le joueur commande une escouade d'intervention française fictive (l'ennemi :
le Groupe Karst). L'utilisateur parle français, préfère des explications simples, sans jargon.

## Règles de l'utilisateur (strictes)
- **Aucune mécanique nouvelle inventée sans son accord.** Améliorer ce qui existe dans le périmètre demandé : oui.
  Quelque chose de nouveau (écran, mécanique, contenu) : le proposer et attendre son accord.
- **La stratégie appartient au joueur** : l'IA exécute les ordres et gère le détail, elle ne décide jamais seule
  de la stratégie de l'escouade du joueur (pas de séquence automatique, pas de repli automatique d'escouade).
  Les plans automatiques sont réservés à l'ennemi.
- Pas de vrais logos / insignes, jamais le texte « GIGN » ni « GENDARMERIE » dans le jeu. Ne jamais citer le Bataclan.
- Pas de statistiques qui décident à la place du joueur pour l'instant (« persos identiques ») ; la grande passe
  d'équilibre se fera plus tard en une fois : pour des petits changements, pas de longues campagnes d'équilibre.
- Ne jamais créer de compte, saisir de mot de passe ni payer. Meshy / Gemini seulement dans le navigateur de l'utilisateur.
- Chaque capture d'écran : la regarder **zoomée** (recadrer) et corriger ou faire corriger chaque défaut vu.
- Animations faites à la main : **en pause** (elles viendront du motion matching, `prototypes/motion-matching/`,
  développé dans une autre conversation qui pousse aussi sur `main` → toujours `git pull --rebase` avant de pousser).
- L'utilisateur surveille ses crédits : peu d'agents en parallèle (1 à 3).
- Dépôt de la boîte à outils : `Natchyyyy/calcul-mental-cm1`, **branche `outils` uniquement** (les autres branches sont
  l'appli de son frère : ne jamais y toucher).

## Construire, tester, publier
- Serveur local : `python3 outils/serveur.py . 8765` (en arrière-plan), page de dev `http://127.0.0.1:8765/web/index.html`.
- Assembler : `node build.js` → `dist/` (+ `docs/` pour GitHub). `dist/hd` est régénéré depuis `web/hd` (non versionné).
- Tests (tous doivent rester verts) : `node tests/game.js`, `node tests/verify.js` (lire sa dernière ligne, il ne
  sort pas en erreur), `node tests/ia.js`, `node tests/voies.js`, et la page :
  `python3 tests/verif_page.py "http://127.0.0.1:8765/dist/index.html?fx=0&hd=0"` (URL complète obligatoire ; le
  contrôle « bannière de fin » échoue parfois par timing, c'est connu).
- Machine cloud = 2 processeurs : tout travail lourd (captures, lots de batailles, suites complètes, build) passe par
  `flock /tmp/claude-0/lourd.lock <commande>` (créer le dossier `/tmp/claude-0` si besoin), une seule à la fois.
- Captures : `outils/capture.py` (WebGL logiciel, lent) ; API du jeu `window.API` (start, stepRaw, look, camShot…),
  `?manual=1` pour piloter pas à pas. Le dossier `captures/` n'est pas versionné.
- **Publication jouable** : artifact claude.ai `https://claude.ai/code/artifact/HMXhuguP85cpBoDChL2kRU`
  (version 45 au 20/10). Après un build propre : copier `dist/artifact.html` et les fichiers changés dans un dossier
  temporaire, puis publier avec `file_path` = artifact.html, `url` = celle ci-dessus et `files` = { "p/jeu.js": …,
  et tout fichier nouveau/modifié de `dist/publier.json` (ex. `hd/pbr_*.jpg`) }. Les fichiers non renvoyés restent.
- Rapports du PC de l'utilisateur (RTX 5070 Ti, une session Claude Code y teste `main` toutes les heures environ) :
  `git fetch -q origin pc-resultats && git show origin/pc-resultats:resultats/DERNIER.md`.

## Git
- Dépôt `Natchyyyy/operator-tactics`, branche `main`. Commits en français. Terminer chaque message de commit par :
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: <lien de la session en cours>
  ```
- Avant de pousser : `git pull --rebase origin main`. Ne valider `docs/` et `dist/` qu'avec un build fait à partir de
  sources validées (build « atomique » sous le verrou), sinon `git restore docs dist` avant un commit de sources.
- Avec des agents qui travaillent en même temps : n'ajouter que ses propres fichiers, pas de `checkout`/`reset`/`stash`.
