# STATE — 22/10/2026 (v69 publiée : monde vivant sous le feu)
- Fait v69 : impacts au vrai point touché (app.js bulletEnd/resolveImpact, formes réelles RAYP), vitres qui fendent puis
  éclatent sur la vraie forme (carDamage/breakPane + dmgShader), plaque/casque (sim : ev.zone/ev.stop), trous dans la tôle,
  pneus, ricochets, claquements autour du point regardé ; sons refaits (agent : sons/vrais.py, mesure_sons.py, CREDITS.md).
- Essais d'effets : API.fxShot(ev avec fx:true) + API.fxRun(n, dt) (?manual=1, attendre ~25 s les modèles Meshy).
- Tests : game 83, verify 79, ia 85, voies 22 ; page 52 PASS (bannière + menu d'ordres en échec aussi sur v68 : lenteur).
- Réglages saignement 75/45 s, relève 1 min, plaques 10/80/95 % : gardés par l'utilisateur (« pour l'instant »).
- À faire : captures sur le PC de l'utilisateur (navigateur de l'appli visible requis) ; retour de l'utilisateur sur sons et
  effets ; fourgons : vitres pas sombres dans leur texture → ne cassent pas (à voir).

# STATE — 21/10/2026 (motion matching intégré, version 53 publiée)
- Fait : motion matching dans le jeu. `web/mm.js` = module GÉNÉRÉ par `node outils/mm_extraire.js` depuis
  `prototypes/motion-matching/web/mm.js` (ne pas éditer à la main) ; `web/mm_jeu.js` = liaison : la simulation décide
  (position/chemin, vitesse, visée, accroupi, couvert, traînage, réa), le module joue les gestes par pas de 1/60 s et suit la
  position simulée (avance 0,25 s, rattrapage doux, replacement > 1,5 m). Morts : `Agent.tuer` → ragdoll du jeu ;
  sauvetage : `Sauvetage` du module piloté par les états du jeu (todrag/dragging/reviving/revive, `finRea`).
- Données : `web/hd/mm_base.json` + `mm_base.{0,1,2}.wasm` (23 Mo, servies une fois ; `?mm=0` = anciens clips).
- `app.js` : makeOperator (MM d'abord), syncMeshes (`OT.MMJeu.image`), événements shot/down/revive, clearOperators.
- Tests Node verts (game 83, verify 79, ia 81, voies 22). Coût mesuré : ~0,45-0,9 ms/soldat/pas (machine lente).
- Limites connues : rechargement / lancer de grenade sans geste propre (pose MM gardée) ; la prise au col (~3 s) est plus
  lente que la simulation qui tire tout de suite (le module rattrape puis pose) → proposer à l'utilisateur de faire attendre
  la simulation ~3 s avant de tirer (changement de règle, pas fait) ; relevé parfois décalé de ≤ 1,5 m (rattrapage).
- v52 (ordres, autre conversation) : déplacement « Discret » (bonds accroupis, feu retenu jusqu'au repérage — `stealthy()`), arrivée « Freinage » (tenir puis décrocher sur la 2e ligne = point de départ, une fois — `updateFreinage()`), « Embuscade » et « Appui » dans la roue. Reste de la doctrine : colonne, bouclier, combat en pièces (il faut des bâtiments). À définir avec l'utilisateur : bonus/pénalités de doctrine (légers).
- v54 (IA de combat, cette conversation, demande de l'utilisateur 21/10 : « trop lente, trop à découvert, demi-tours absurdes,
  cadence trop lente ; se cacher derrière un mur et ne dépasser du coin que pour tirer ») :
  `peekCycle/peekSpot/peekBack/peekSlide` (tir au coin d'un obstacle ≥ 1,6 m : caché → pas de côté 0,4-1,4 m → rafale → retour ;
  `u.peeking` = demi-silhouette ×0,4 au tir, ×0,7 au repérage) ; rafales 3-5 coups à 300 c/min (`rpm`), pause à l'abri
  0,9-1,8 s + suppression×2,5 (`soutenue: 110` = cadence moyenne : suppression, note) ; seuil « cloué » `pinThreshold` (0,6 au
  lieu de 0,8) ; réaction immédiate (décision hors cadence au 1er ennemi vu / aux 1res balles ; un bond ou une marche
  s'interrompt sur un ennemi surgi) ; réapparition d'un ennemi connu repérée vite ; chemins défilés (`exposureGrid`/`pathCost` :
  cases vues des ennemis connus +0,7, détour plafonné ×1,5) ; pas de couvert derrière soi en marche (`heading`, `notBehind`) ;
  on reste à couvert 5 s après des tirs / 3 s après un contact ; cible suivie gardée (`focusId`) ; fouille menée à son point ;
  1er point de chemin derrière soi remplacé. Mesure `node outils/mesure_ia.js 60` : exposition 33,7 → 24 %, demi-tours
  (> 2,5 m) ~32 → 15 par bataille, réaction médiane 1,2 → 0,9 s, durée moyenne 127 → 100 s. Tests : ia 83, verify 79, voies 22.
  v55 : visée sur la DERNIÈRE POSITION CONNUE quand la cible n'est plus vue (`aimPoint`, plus de suivi à travers les murs) ;
  caché derrière un mur : regard vers le coin, arme basse (`hide`, `u.blindWall` → `estVise` faux dans mm_jeu.js/app.js) ;
  au milieu d'un long obstacle haut (bus) : longer jusqu'à un coin d'où tirer (`toCorner`, ≤ 7 m) ; `coverUp` cherche jusqu'à
  10 m ; décrocher : les bondisseurs courent toujours ; point de passage frôlé 3 pas de suite = atteint (`wpStall`).
  Idée proposée à l'utilisateur (en attente) : petite vue de dessus des replays (2D, ~1 s/image) pour déboguer le cerveau.
  À faire (demandé) : « cerveau de groupe » qui se déplace selon la doctrine (l'utilisateur veut un mouvement d'escouade logique).
- PLAN VALIDÉ PAR L'UTILISATEUR (21/10, dans cet ordre, publier après chaque étape) :
  1. FAIT (21/10) — outil « vue de dessus » : `node outils/vue2d.js --graine 8 --t 30,40 [--suivre Bélier] [--autour Bélier:12]
     [--pas 5] [--planche] --out dossier` → PNG (~0,3 s/vue ; dessin `outils/vue2d/rendu.js`, PNG par @resvg/resvg-js installé
     dans /root/.outils-node) ; page interactive `outils/vue2d/page.html` (`--page` → dist/vue2d.html) publiée :
     https://claude.ai/artifact/VCh6JSiTvctXtMqHF1JSbm . Piste vue avec : graine 8, t 36-38 s, Bélier et Molosse à 3 m sans tirer.
     (ancien libellé) Outil « vue de dessus des replays » (2D, ~1 s/image, ne touche pas au jeu) : obstacles (gris foncé = hauts, clair = bas),
     soldats (points bleu/rouge + trait du regard), chemin prévu, positions ennemies connues, coins de tir ; pour déboguer l'IA.
  2-3. FAIT v56 (21/10, publié) : alarme de voiture 1 voiture sur 3 (tirage fixe graine/voiture), une seule à la fois, 15 s,
     klaxon par coups (405+507 Hz adouci) au lieu de la sirène, volume 0,45 → 0,22 : 0,43 → 0,1 alarme/bataille. Explosion de
     grenade refaite (sons/vrais.py : claquement, médiums, échos des façades, 3,6 s, +5 dB) ; grenade en vol : étincelles
     orange + trait, cercle de danger clignotant au sol jusqu'à l'explosion (app.js addDangerRing), onde de choc (addShock),
     boule de feu plus grosse (effets.js). À faire écouter / regarder par l'utilisateur.
     (ancien libellé) 2. Sons : l'alarme de voiture est trop fréquente, horrible (« alarme de pompier »), trop forte → plus rare, plus réaliste, moins fort.
  3. Grenades (en dernier) : explosion et effets nuls, on ne voit pas qu'une grenade est lancée → meilleur son, effet, signal du lancer.
- Prochaine tâche (ancienne) : retour de l'utilisateur sur la v53 (bugs visuels) ; captures zoomées + agent QA sur tir, couvert, réa.
