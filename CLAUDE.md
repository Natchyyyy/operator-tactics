# OPERATOR TACTICS — instructions pour toute nouvelle session Claude

## Protocole d'économie de tokens (demandé par l'utilisateur, 20/10 — prioritaire)
1. Lectures ciblées : `grep` / numéros de ligne d'abord, puis seulement les lignes utiles ; jamais un fichier
   de plus de 200 lignes en entier pour une seule fonction. Ne jamais inspecter `node_modules`, `dist`, `build`, `.git`,
   `package-lock.json`, ni les assets/données brutes (`.glb`, `.gltf`, `.obj`, `.bin`, gros `.json`).
2. Tests groupés : pas de test ni de build après chaque petite modification ; tout modifier proprement, puis UNE
   vérification globale en fin d'étape. Sorties filtrées (`--silent`, `--quiet`, `tail -n 20`).
3. Modifications ciblées (outil d'édition) ; ne jamais réécrire un fichier entier dans le chat.
4. Réponses très courtes : plan en 2 lignes avant d'agir, résultat en 3 lignes après. Pas de politesse ni de long résumé.
5. Sécurité `/compact` : quand une étape est 100 % finie (aucun bug ni test rouge en suspens, jamais au milieu d'un
   débogage) et/ou que l'historique s'allonge (> 10-15 échanges), mettre à jour `STATE.md` à la racine (10 lignes max :
   dernière modification réussie, fichiers touchés, prochaine tâche), puis finir le message par la ligne exacte :
   🟢 [SÉCURITÉ OK — État sauvegardé dans STATE.md : Tu peux lancer `/compact` (ou une nouvelle session) sans risque]

## Moniteur de contexte (demandé par l'utilisateur, 20/10)
À la fin de chaque réponse, évaluer silencieusement la conversation et ajouter une alerte si besoin :
- 🟡 Recommander `/compact` quand une mécanique modulaire vient d'être terminée, testée et validée ; quand un bug complexe
  vient d'être définitivement résolu ; ou quand l'historique d'essais/erreurs sur le détail en cours dépasse ~10 échanges.
  Message exact : « 🟡 [RECOMMANDATION À 90%] : La fonctionnalité est stable. Je te conseille vivement de taper `/compact`
  maintenant pour nettoyer les brouillons de ma mémoire avant de passer à la suite. »
- 🔴 Recommander un nouveau chat quand on change radicalement de domaine, quand on tourne en rond sur un bug depuis 4-5
  itérations, ou quand la session a enchaîné plusieurs gros objectifs malgré les `/compact`. D'abord mettre à jour le fichier
  de suivi (`STATE.md` ou ce `CLAUDE.md`) avec l'état du projet, puis message exact : « 🔴 [ALERTE CHANGEMENT DE CYCLE] :
  Nous changeons de phase ou le contexte sature. Je te conseille à 100% d'ouvrir un NOUVEAU CHAT. L'état du projet est
  sauvegardé, le prochain chat pourra reprendre immédiatement. »

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
  (version 67 au 22/10 : plan Commandant étapes 4 à 11 d'un coup (utilisateur absent, « continue sans demander ») — 4 traversée des découverts aussi en méthodique/discret (findOpenCrossings, analyzePath) ; 5 bonds successifs en zone ouverte avant contact (successiveLead) ; 6 embuscade « On est fixés » (ambushCheck, o.fixe, seulement si le groupe était au calme à l ordre, g.calm) + tir d appui pendant un traînage (dragCoverFire) ; 7 chargeurs persistants (magList, startReload/finishReload, ammoCheck) ; 8 tir à l aveugle (blindFire, sans dégâts), panique (panicStep, peur u.fear), ordre « Ralliement » (command 'ralliement', menu Plus…) ; 9 blessures localisées (applyHit : casque/plaque PLATE_STOP qui s use, wounds, woundMods, woundStep garrot, bleedOut ; relève 1 min REVIVE_WINDOW, jamais 2 fois) ; 10 voitures : roues pour un accroupi, portières de plus en plus traversées (penChance) ; 11 trace de sang (bloodDrop/bloodFollow, décalques) ; tests adaptés (verify : appui exempté de la règle de suppression, Mains sûres chargeur vide, à terre = toujours relevable 1 fois ; ia : balles perdues avec cibles soignées à chaque tir) ; version 66, artifact Version 66 (id 1792674497-2e6d) : plan Commandant étape 3, rôles en marche — marchRoles/marchLook : sur ordre méthodique/discret/franchir, au calme, pointe et appui regardent devant, flancs ±40° vers leur côté de l axe (côté gardé), serre-file coup d œil arrière 1,4 s toutes les 7 s ; arme prête (preaim) ; regard cède au contact (ennemi connu < 8 s, visé < 4 s, suppression > 0,2) ; version 65 : plan Commandant étape 2, hérisson — à l arrivée « tenir », sans couvert face à son secteur, on se plaque (hugSpot, HUG 0,55 m) contre l obstacle ≥ 0,9 m le plus proche à moins de 2 m (HERISSON_R), sans se rapprocher d un équipier ; place collée atteinte à 0,25 m près (keyOrder.hug) ; au calme (aucune menace connue) genou à terre contre l obstacle même s il n est pas dans l axe du secteur ; en terrain nu, debout (règle existante) ; version 64 : plan Commandant étape 1 — map.analyzePath + Battle.routeTerrain : le trajet de chaque ordre « aller » est lu (confiné ≤ 4 m entre obstacles ≥ 1,6 m sur 3 m, découvert > 5 m sans obstacle ≥ 0,9 m à 2 m, points vus par l ennemi connu/supposé), gardé dans ordInfo[id].terrain et affiché au sol (jaune/rouge/orange) + « Terrain : … » dans le message d ordre ; aucun effet sur le combat ; voir PLAN_DOCTRINE.md ; version 62 : réa synchronisée avec le motion matching (relevé direct si le sauveteur affiché n est pas en réa, garde-fou 1 s ; REVIVE_PREP 2 s, GETUP 3,2 s) et blessé traîné derrière un VRAI obstacle (hasSolidLOS : la fumée n abrite pas) — voir BUGS_A_REGLER.md ; v61 « deuxième cerveau » (updateHints/hintWatch : zone floue des ennemis non repérés, ne sert qu au regard ; bulles « Ils doivent être… ») et combats plus lents (TEMPO_HIT 0.2 au-delà de 10 m : batailles ~3 min 20, limite 7 min) ; v60 secours sur ordre (clic droit sur un équipier à terre : rescueOrder/followRescue ; récupérateur + accompagnateur + protection) et 2 grenades max par équipe (1 fumigène, passé au récupérateur ; 1 frag) ; v59 appui à couvert d abord ; v58 épauler un équipier accroché (supportAlly : se tourner vers l ennemi signalé ou se décaler pour tirer, à hauteur de l équipier, 2 en appui max par ennemi) ; v57 arme basse quand le canon touche le décor (plus de visée dans une voiture ou un mur) ; v56 alarme de voiture rare et en klaxon, explosion de grenade refaite, traînée + cercle de danger + onde de choc ; v55 IA de combat). Après un build propre : copier `dist/artifact.html` et les fichiers changés dans un dossier
  temporaire, puis publier avec `file_path` = artifact.html, `url` = celle ci-dessus et `files` = { "p/jeu.js": …,
  et tout fichier nouveau/modifié de `dist/publier.json` (ex. `hd/pbr_*.jpg`) }. Les fichiers non renvoyés restent.
- **Deux conversations publient le même jeu** (celle du motion matching et celle des ordres) : toujours `git pull --rebase`
  PUIS rebuild PUIS publier, jamais un build fait avant le pull — sinon on efface le travail de l'autre en ligne. Après
  publication : commit + push tout de suite (avec `dist/`), et noter la version ici.
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
