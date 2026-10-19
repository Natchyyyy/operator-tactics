# Stratégies GIGN — catalogue complet et verdict

> Document de **recherche et de conception**. **Rien n'a été modifié dans le jeu.** Rédigé le 19/10/2026.
> Lu avant d'écrire : `france.md`, `critique_france.md`, `decisions.md`, et le vrai code (`sim/engine.js`, `sim/data.js`,
> `sim/map.js`, `web/hq.js`, le menu du clic droit dans `web/app.js`).
> Rappel de ta règle : **tout ce qui est nouveau attend ton accord.** Ce document propose, il ne décide pas.

---

## 0. En bref (à lire en premier)

- **Ce qui existe déjà est solide.** Le clic droit propose 3 façons de bouger (Méthodique, Agressif, Franchissement) et
  3 façons d'arriver (Tenir la position, Encercler, Reprendre la manœuvre). « Tenir » fait déjà une vraie sûreté à 360°
  avec un serre-file intelligent. C'est déjà plus riche que beaucoup de jeux.
- **Ce qui manque le plus, c'est le FEU.** Aujourd'hui le joueur dit **où** aller et **comment**, mais jamais **quand
  tirer** ni **sur quoi faire pression**. Or la base de toute tactique de petite unité, c'est « **une partie tire, l'autre
  bouge** » (feu et mouvement). Les meilleures additions sont donc : **Feu retenu (embuscade)**, **Appui feu (fixer une
  zone)**, et **Décrocher** (repli par bonds).
- **Bonne nouvelle : le moteur a déjà presque tout.** Le tir de suppression existe (réservé au rôle « Appui », absent de
  l'escouade), l'embuscade existe (dans l'ordre d'équipe « Tenir »), la fumée existe à moitié (la carte sait gérer un nuage
  qui bloque la vue, mais rien ne le lance), les grenades incapacitantes existent (aucun GIGN n'en porte aujourd'hui).
- **Le vrai danger, c'est le menu.** Chaque nouvelle idée est tentante ; à 4 lignes de 5 icônes, le menu devient illisible.
  Ma proposition : **2 lignes visibles** (Déplacement, Arrivée) + **1 petite ligne Feu** (3 choix), le reste derrière
  « Plus… » (§11).
- **Deuxième danger : l'ennemi n'a pas de joueur.** Chaque pouvoir donné au joueur (embuscade, feinte, appui) rend le
  Groupe Karst plus facile à piéger. Il faudra un jour lui donner ses propres « plans » (§13.2, vague 2).

Légende (la même que dans `france.md`) :

| Marque | Sens |
|---|---|
| **[RÉEL]** | Tiré d'une source publique citée (§14) |
| **[COURANT]** | Description très répandue (manuels publics étrangers, sites d'amateurs sérieux, jeux), pas vérifiée dans une source officielle française |
| **[INVENTION]** | Idée de conception de jeu, pas une doctrine réelle |

| Statut | Sens |
|---|---|
| **EXISTE** | Déjà dans le jeu et jouable |
| **PARTIEL** | Le moteur a une partie du travail, mais le joueur ne peut pas s'en servir |
| **NOUVEAU** | À construire (demande ton accord) |

Échelles utilisées dans chaque fiche :
- **Difficulté** : faible (quelques heures, réutilise du code), moyenne (nouvel état d'IA ou nouvelle interface), élevée
  (nouvel objet, nouvelles animations, ou terrain à refaire).
- **Risque d'équilibre** : nul / faible / moyen / élevé — est-ce que ça peut rendre une mission trop facile ou trop dure ?
- **Valeur de jeu** : est-ce **amusant**, **lisible** (on comprend ce qu'on voit) et une **vraie décision** (il y a un bon
  et un mauvais moment pour s'en servir) ?

---

## 1. Ce que le jeu sait déjà faire (point de départ vérifié dans le code)

| Élément | Où | Ce que ça fait vraiment |
|---|---|---|
| **Ordres d'équipe** Assaut / Tenir / Prudent | `data.js ORDERS`, `setOrder()`, liste déroulante en bataille | Assaut : on cherche le contact. Tenir : on reste près de sa position, **embuscade** (on laisse approcher tant que personne n'est engagé, jusqu'à 70 % de la portée), **bonus « calé »** après 3 s immobile au poste ; coupe le Tiroir et les flancs. Prudent : de couvert en couvert avec pauses, repli si gravement blessé. |
| **Tiroir** (carte passive) | `updateTiroir()`, `tiroir()` | Deux moitiés fixées au départ (un sur deux : 3 + 2) ; une bondit (≤ 11 m), l'autre couvre ; on inverse quand tous sont arrivés (2,5 à 10 s). Le tireur d'élite reste hors des bonds. |
| **Plans de voies** Tenailles / Rush milieu (cartes actives, 2 emplois, 20 s de recharge) et **Rotation** (10 s) | `assignLanes()`, `replan()`, `rotate()` | Répartit l'escouade sur les voies nord (ruelle), milieu (lavage), sud (quai). |
| **Clic droit — Déplacement** | `moveOrder()`, `orderBound()`, `orderRush()`, `followCross()` | **Méthodique** : bonds ≤ 9 m (7 m sans couvert), moitiés alternées, secteurs 0° / ± 35°, le dernier regarde l'arrière. **Agressif** : droit au point, au pas de course, départs échelonnés (0,8 s), courte halte (~1 s) à couvert seulement si on se fait tirer dessus. **Franchissement** : repère jusqu'à 3 espaces découverts sur le trajet, halte au bord, passage un par un (deux par deux à 4 ou 5) au sprint, le premier passé couvre l'autre côté. |
| **Clic droit — Arrivée** | `arriveOrder()`, `holdPerimeter()`, `holdRear()`, `encircleSpots()`, `resumeManoeuvre()` | **Tenir** : chacun un couvert et un secteur (360°), appui mutuel vers le côté menacé, **serre-file** qui vient aider devant quand ça chauffe et repart derrière si une menace arrive dans le dos. **Encercler** : deux sous-groupes à 8–14 m du point, à ~100° l'un de l'autre, jamais face à face. **Reprendre la manœuvre** : l'ordre s'efface, l'IA habituelle reprend. |
| **Garde-fous** | `ORDER_COOLDOWN`, `ORDER_GAP` | Un ordre par opérateur toutes les **3 s** ; places espacées de **4 m** (pas de grappe). |
| **Sélection** | `web/app.js` | « Tous » ou clic sur les cartes en bas (Maj + clic pour plusieurs). Les touches 1, 2, 3 règlent la **vitesse** (déjà prises). |
| **Grenades** (IA seule) | `tryGrenade()`, `data.js GRENADES` | Frag : lancée seule par l'IA sur un ennemi repéré il y a < 2 s, entre 8 et 24 m, qu'on touche mal ; aucun allié à < 5 m du point ; une toutes les 8 s. Rôle Assaut = **1 frag**. Incapacitante (flash) : aveugle 3,5 s — **réservée aux rôles Pointe et Brèche, absents aujourd'hui**. |
| **Fumée** | `map.dynamic` (kind `smoke`), expiration dans `updateTactics()`, effet visuel dans `app.js` | **Le terrain sait gérer un nuage qui bloque la vue** (pas la marche), avec durée. **Rien ne le crée** aujourd'hui : reste d'un ancien système. |
| **Tir de suppression** | `canSuppress()`, `suppressAt()` | Arroser le couvert derrière lequel un ennemi vient de se cacher (pas de dégâts, mais il est cloué). **Réservé au rôle Appui, absent de l'escouade.** |
| **À terre / relevé** | `maybeBleed()`, `updateRevives()` | 55 % de chances d'être « à terre » (sauf balle dans la tête), 20 s pour être relevé (4 s, Secouriste 2 s), une fois par bataille, à 30 % de vie. **On ne relève pas sous le feu ni pendant un ordre.** Pas de traîner le blessé. |
| **Moral** | `moraleCheck()` | Deux camarades tombés près de soi en 10 s face à 2 ennemis ou plus → test ; ébranlé 5 s (se replie à couvert). Le Meneur protège. |
| **Tireur d'élite** | rôle `marksman` | Reste hors des bonds, choisit un poste qui voit loin, garde ses distances. **Aucun opérateur n'a ce rôle aujourd'hui** (5 Assauts). |
| **Conditions** | `data.js CONDITIONS` | Nuit, brouillard, pluie changent la vue, l'ouïe, la précision ; de nuit, un tir sans silencieux se voit. |
| **Positions clés** | `map.js positionsCles` | 3 paires en miroir : lavage, ruelle, quai. Le clic droit « n'importe où » les a rendues presque inutiles. |

---

## 2. Ce que dit la recherche (court)

Je ne refais pas `france.md` ; voici seulement ce qui est **nouveau** et **utile pour ce catalogue**.

1. **Feu et mouvement [RÉEL]** — la règle de base de toute petite unité : « certains éléments bougent pendant que d'autres
   donnent un feu de couverture » ; un élément tire depuis un couvert pour **tenir l'ennemi** (« base de feu ») pendant que
   l'autre avance, puis on inverse. Le **tir de suppression** garde l'ennemi « tapi » et l'empêche de s'organiser. Ça sert
   **pour attaquer comme pour se retirer**. (Wikipédia, *Fire and movement*.)
2. **Les « drills » de groupe [COURANT]** (résumés publics des exercices de l'armée américaine, repris par la communauté
   milsim) :
   - **Réaction au contact** : l'équipe prise à partie se met à couvert et **riposte** ; l'autre se met à l'abri sans
     s'engager ; le chef choisit : **déborder**, **décrocher**, ou **s'installer en appui**.
   - **Décrocher** : une équipe lance de la **fumée** pour masquer son repli ; les équipes **reculent par bonds** en
     restant alignées.
   - **Assaut par le flanc** : une équipe **fixe** l'objectif par le feu, l'autre le **contourne** par un chemin caché ;
     l'appui **décale son tir** au dernier moment.
   - **Traverser une zone dangereuse** : lent et sûr (on tient le bord, on passe, on tient l'autre bord), rapide (un par
     un), ou en force (tout le monde, quand la vitesse prime). → C'est **exactement** notre Franchissement / Agressif.
3. **Les unités d'intervention [RÉEL]** : séquence GIGN « **d'abord la négociation, puis la neutralisation** » ;
   BRI : « **localiser, circonscrire** » avant l'assaut, « **progresser lentement, avec discernement** », « **nous nous
   dispersons par secteurs** » ; RAID : on **encercle** un lieu et on tient un long siège avant d'entrer, un **tireur
   d'élite** neutralise quand le suspect sort. Le GIGN forme des **tireurs d'élite**, des spécialistes
   **observation-surveillance**, des **négociateurs**, des **télépilotes de drone** et des **spécialistes en explosifs**.
4. **Le blessé [RÉEL]** (protocole public de secours au combat, « soins sous le feu ») : **d'abord riposter et se mettre
   à couvert** ; le blessé est **amené à couvert** ; les soins lourds attendent que le feu cesse. → Notre règle « on ne
   relève pas sous le feu » est **juste** ; ce qui manque, c'est **tirer le blessé à couvert**.
5. **Fumée [RÉEL]** : utilisée surtout par l'infanterie pour « **cacher ses mouvements dans les zones sous le feu** ».
6. **Grenade incapacitante [RÉEL]** : moyen **non mortel** pour « **désorienter** » ou « **distraire un instant** » une
   menace, employé notamment pour la **libération d'otages** et les arrestations (« le minimum de force nécessaire »).
7. **Points hauts, bâtiments, blindés [RÉEL]** (déjà dans `france.md`) : « la tenue des points hauts est primordiale »,
   approche sous blindage, effracteurs. **Le parking actuel n'a ni étage ni intérieur** : tout ça est pour plus tard.

> **Ce que je ne fais pas exprès** : aucun détail de procédure réelle d'entrée, de distances d'engagement réelles, de
> signaux ou de codes. Le jeu n'en a pas besoin, et ce ne serait pas raisonnable. Tout reste au niveau « idée générale ».
> Rappel de `critique_france.md` : **ne jamais citer le Bataclan dans le jeu** (bulles, fiches, textes).

---

## 3. Niveau 1 — Le « Déplacement » (comment on y va)

### D1. Méthodique — **EXISTE**
- **C'est quoi** : on avance par bonds de couvert en couvert, une moitié bouge, l'autre couvre, chacun surveille son
  secteur.
- **Marque** : [RÉEL] (bonds avec appui mutuel, armée française et « bounding overwatch »).
- **Dans le jeu** : déjà fait, voir §1.
- **Valeur** : **forte**. C'est le mode par défaut, il doit le rester.
- **Petites améliorations possibles (sans nouveau menu)** :
  - **Bonds successifs en approche, alternés au contact** [RÉEL] : tant qu'aucun ennemi n'est connu, la moitié d'appui
    **rejoint** au lieu de **dépasser** (plus sûr, plus lent) ; au contact, on repasse en « saute-mouton ». → **Un
    réglage interne, pas une option de menu** (sinon : deux boutons que personne ne sait distinguer).
  - **Rééquilibrer les moitiés quand quelqu'un tombe** (voir R3).
- **Difficulté** : faible · **Risque** : faible · **Dépend de** : rien.

### D2. Agressif — **EXISTE**
- **C'est quoi** : droit au point, vite, en tirant sur ce qu'on voit.
- **Marque** : [COURANT] (« traverser en force » quand la vitesse prime ; « pour aller vite, il faut poser les boucliers »
  de la BRI est l'idée du compromis vitesse / protection [RÉEL]).
- **Valeur** : **forte** : c'est le vrai choix « risque contre temps » (zone de capture, ennemi qui recharge).
- **Petite amélioration** : la bulle « **On fonce !** » au départ pour que le joueur voie que l'ordre est compris.

### D3. Franchissement — **EXISTE**
- **C'est quoi** : comme Méthodique, mais les espaces découverts se traversent un par un, au sprint, sous appui.
- **Marque** : [RÉEL] (« la rue tue » ; traversée de zone dangereuse).
- **Valeur** : **moyenne à forte**, mais **peu lisible** : le joueur ne sait pas **où** l'IA a vu un « découvert ».
- **Amélioration conseillée** : afficher au sol, pendant le menu, les **tronçons découverts détectés** sur le trajet (une
  bande orange). Le joueur comprend pourquoi il choisirait Franchissement plutôt que Méthodique.
- **Difficulté** : faible (`findCrossings()` donne déjà les tronçons) · **Risque** : nul.

### D4. Décrocher (repli par bonds) — **NOUVEAU** ⭐
- **C'est quoi** : quitter un combat qui tourne mal en reculant par bonds, **toujours face à l'ennemi**, sans s'arrêter
  pour engager, jusqu'au point cliqué.
- **Marque** : [RÉEL] (feu et mouvement « sert aussi à se retirer » ; drill « décrocher »).
- **Dans le jeu** :
  - *Joueur* : clic droit **derrière** son escouade → « Décrocher ».
  - *IA* : moitiés alternées comme Méthodique, mais (1) la moitié qui reste **tire** sur ce qu'elle voit (pas de pause
    « observation »), (2) la moitié qui bouge **court** (sprint) jusqu'au couvert suivant **vers l'arrière**, (3) **pas de
    halte pour engager** en route, (4) arrivée par défaut : **Tenir**.
  - *À l'écran* : bulles « **On décroche !** » / « **Je couvre !** », flèche du marqueur tournée vers l'arrière.
- **Existe déjà** : `orderBound()` regarde déjà vers la menace pendant que l'autre moitié bouge ; le sprint existe
  (`crossing`, `retreat`) ; le moral « ébranlé » fait déjà un petit repli individuel.
- **Différence avec Méthodique vers l'arrière** : aujourd'hui, Méthodique vers l'arrière fait des **pauses d'observation**
  et ceux qui bondissent ne sprintent pas : on recule lentement sous le feu. Décrocher = **le même squelette, réglé pour
  partir vite**.
- **Difficulté** : faible à moyenne · **Risque d'équilibre** : faible (ça sauve des vies, mais on cède le terrain).
- **Valeur** : **forte** — c'est la décision « je perds, je sauve mes gars » ; très utile dans « Tenir le parking ».
- **Dépend de** : rien (meilleur encore avec la fumée E3).

### D5. Discret (progression lente et silencieuse) — **NOUVEAU**
- **C'est quoi** : avancer lentement, accroupi, sans tirer sauf si on est vu ou pris à partie, pour arriver sans être
  repéré.
- **Marque** : [COURANT] (approche discrète des unités d'intervention ; « progresser lentement, avec discernement » est
  [RÉEL] mais parle de prudence, pas de silence).
- **Dans le jeu** : *Joueur* : « Discret ». *IA* : vitesse ~60 %, posture basse, **feu retenu** jusqu'au contact, plus
  difficile à repérer (comme le trait Fantôme, en plus petit). *À l'écran* : icône « pas feutrés », opérateurs baissés.
- **Existe déjà** : trait Fantôme (−40 % de repérage), ouïe des pas à < 12 m (trait Vigie), nuit, silencieux (accessoire
  en pause).
- **Difficulté** : **moyenne** — surtout à cause de l'**animation de marche accroupie** (le travail d'animation est en
  pause en attendant le « motion matching »).
- **Risque d'équilibre** : **moyen à élevé** (un ennemi qui ne voit rien venir) — à plafonner.
- **Valeur** : moyenne aujourd'hui (petite carte, l'ennemi bouge vite) ; **forte de nuit** et avec des bâtiments.
- **Dépend de** : animations accroupies ; idéalement Feu retenu (F1) d'abord.

### D6. Colonne (file indienne dans un passage étroit) — **NOUVEAU**
- **C'est quoi** : dans la ruelle, l'escouade passe en **file**, chacun suit les traces du premier ; dans un espace
  ouvert, elle se **disperse par secteurs**.
- **Marque** : [RÉEL] (colonne d'assaut GIGN / BRI ; « nous nous dispersons par secteurs »).
- **Dans le jeu** : automatique dans Méthodique quand le passage fait < 3 m de large, ou bouton « En colonne ».
- **Difficulté** : moyenne (suivre une file de points, gérer les arrêts) · **Risque** : moyen (une file prend une grenade
  entière : à vérifier).
- **Valeur** : **faible aujourd'hui** (une seule ruelle sur la carte) ; **forte** avec des bâtiments ou le bouclier.
- **Dépend de** : bâtiments / bouclier (décidé « plus tard »).

### D7. Points de passage (choisir l'itinéraire) — **NOUVEAU** ⭐
- **C'est quoi** : imposer **par où** passer (« par la ruelle, puis vers le lavage ») au lieu du plus court chemin.
- **Marque** : [COURANT] (tous les jeux tactiques ; c'est « un chemin caché pour déborder » des drills).
- **Dans le jeu** : *Joueur* : **Maj + clic droit** pose un point de passage (2 au plus), le dernier clic ouvre le menu.
  *IA* : le même mode de déplacement, étape par étape. *À l'écran* : une ligne pointillée entre les marqueurs.
- **Existe déjà** : `moveOrder()` (un point), `findPath()`, marqueurs au sol.
- **Difficulté** : faible à moyenne · **Risque** : faible.
- **Valeur** : **forte** — c'est **la** décision de débordement : aujourd'hui l'IA choisit le plus court, donc le joueur
  ne peut pas vraiment dire « contourne par le nord ».
- **Remarque** : ce n'est **pas** un nouveau mode : c'est un **geste** (Maj). Il n'encombre pas le menu.

### D8. Rotation / changement de voie — **EXISTE** (hors clic droit)
- Recoupe beaucoup D7 (points de passage) : une rotation, c'est « toute l'escouade par le nord / le milieu / le sud ».
- **Avis** : garder tant que le clic droit n'a pas de points de passage ; ensuite, la rotation devient **redondante**.

---

## 4. Niveau 2 — L'« Arrivée » (que faire une fois sur place)

### A1. Tenir la position — **EXISTE**
- Sûreté 360°, secteurs, appui mutuel, serre-file intelligent (voir §1). [RÉEL] (secteurs, « je prends le bas, il prend
  le haut »).
- **Amélioration conseillée** : **orienter la position** (voir A4) ; **recharger / se soigner** pendant les moments calmes
  (le Secouriste soigne déjà à < 5 m) — rien à ajouter, juste l'**afficher** (bulle « Je recharge »).

### A2. Encercler — **EXISTE**
- [RÉEL] (« localiser et circonscrire », RAID qui encercle avant d'entrer).
- **Valeur** : forte, c'est la moitié du « fixer et déborder ». Ce qui lui manque : **un ordre de feu** (voir F2), sinon
  les deux sous-groupes attendent.

### A3. Reprendre la manœuvre — **EXISTE**
- [INVENTION] utile : « va là, puis débrouille-toi ». Valeur moyenne, très lisible.

### A4. Orienter la position (choisir où regarder) — **NOUVEAU** ⭐
- **C'est quoi** : dire **d'où vient le danger** au lieu de laisser l'IA le deviner (aujourd'hui : l'ennemi connu le plus
  proche, sinon le sens de la marche).
- **Marque** : [RÉEL] (secteurs de surveillance donnés par le chef).
- **Dans le jeu** : *Joueur* : après « Confirmer », un **second clic** sur le sol indique la direction principale (ou
  Échap / clic au même endroit = automatique). *IA* : `holdSectors()` part de cette direction. *À l'écran* : un **cône**
  pâle au sol pendant 2 s.
- **Existe déjà** : `holdFace()`, `holdSectors()`, `face0`.
- **Difficulté** : faible · **Risque** : faible · **Valeur** : **forte** (lisible, vraie décision : « ils vont arriver
  par la ruelle »).
- **Attention** : le clic droit + glisser = caméra. Le second clic doit être un **clic gauche**.

### A5. Fouiller / ratisser — **NOUVEAU**
- **C'est quoi** : une fois sur le point, fouiller les couverts autour (rayon ~12 m) pour débusquer un ennemi caché.
- **Marque** : [COURANT].
- **Existe déjà** : le **ratissage** de l'IA (`searchGoal`) quand elle arrive près du camp adverse sans information.
- **Difficulté** : faible · **Risque** : faible.
- **Valeur** : **faible à moyenne** : l'IA fait déjà ça d'elle-même en fin de bataille ; utile surtout quand il reste un
  ennemi « perdu ».
- **Avis** : bonne candidate pour « Plus… » (options avancées), pas pour la première ligne.

### A6. Point de ralliement — **NOUVEAU**
- **C'est quoi** : se regrouper serré à un endroit sûr, recharger, relever les blessés, puis attendre.
- **Marque** : [RÉEL] (point de ralliement, notion générale d'infanterie).
- **Avis** : **redondant** avec Tenir (qui recharge et soigne déjà). Ne pas en faire un bouton. À la place : une
  **règle** — en Tenir, si aucun ennemi n'est vu depuis 5 s, on **relève les blessés à < 10 m** (aujourd'hui un ordre en
  cours **interdit** de relever : voir R2).

### A7. Embuscade — voir **F1 (Feu retenu)**
- En pratique, « Embuscade » = **Tenir + Feu retenu**. Ce n'est pas une arrivée de plus, c'est un **réglage de feu**.

---

## 5. Niveau 3 — Le feu et l'appui (le grand manque)

Aujourd'hui, **tout le monde tire sur tout ce qu'il voit, tout le temps**. C'est là qu'est la plus grosse marge de jeu.

### F1. Feu retenu / Feu à volonté (règle d'ouverture du feu) — **PARTIEL** ⭐⭐
- **C'est quoi** : « **ne tirez pas** tant que je ne dis rien / tant qu'il n'est pas tout près / tant qu'on ne nous tire
  pas dessus ». C'est l'**embuscade**.
- **Marque** : [RÉEL] (ouverture du feu « discrimination – précision – suffisance », armée de Terre ; embuscade, principe
  général).
- **Dans le jeu** :
  - *Joueur* : une petite ligne « **Feu** » dans le menu : **À volonté** (défaut) · **Retenu** · (**Appui**, voir F2).
  - *IA* « Retenu » : à couvert, baissée, on **ne tire pas** tant que : un ennemi n'est pas à moins de ~60 % de la portée,
    **ou** un équipier n'a pas tiré / été touché, **ou** on ne se fait pas tirer dessus. Dès que l'un tire, **tout le
    groupe ouvre le feu** (déclenchement collectif = l'effet « embuscade »).
  - *À l'écran* : icône « main levée » sur le marqueur ; bulle « **Feu !** » au déclenchement.
- **Existe déjà** : la règle exacte existe dans l'ordre d'équipe **Tenir** (`ambush` dans `decide()` : on laisse
  approcher tant que personne de l'équipe n'est engagé, jusqu'à 70 % de la portée). Il suffit de la **brancher aux ordres
  du clic droit** (`holdPerimeter`, `orderBound`) et de la rendre réglable.
- **Difficulté** : **faible** · **Risque d'équilibre** : **moyen** — avec un ennemi scripté qui fonce en Assaut,
  l'embuscade peut devenir trop forte (déjà signalé pour « Tenir le parking »). À surveiller.
- **Valeur** : **très forte** : vraie décision (déclencher trop tôt = l'ennemi se met à couvert ; trop tard = il est sur
  vous), très lisible (rien, puis tout le monde tire d'un coup), fun.
- **Dépend de** : rien.

### F2. Appui feu — « Fixer » une zone (base de feu, tir de suppression) — **PARTIEL** ⭐⭐
- **C'est quoi** : un groupe s'installe et **arrose une zone** (un couvert où l'ennemi s'est caché) pour le **clouer**
  pendant que les autres bougent. C'est la moitié « feu » du « feu et mouvement ».
- **Marque** : [RÉEL] (base de feu et suppression ; trinôme d'appui 600 de l'armée française).
- **Dans le jeu** :
  - *Joueur* : Feu → « **Appui** » ; la zone visée = **le point cliqué** (le groupe se poste à distance de tir, à couvert,
    face à lui) **ou**, plus simple, la menace connue la plus proche du point.
  - *IA* : une fois postés, ceux qui voient la zone tirent des **rafales de suppression** sur les ennemis connus
    (vus il y a < 6 s) à < 4 m du point, même s'ils sont à couvert ; consommation de munitions limitée (on s'arrête
    sous 40 % du chargeur total, on recharge à tour de rôle).
  - *À l'écran* : traçantes vers le couvert, l'ennemi passe à l'état « cloué », bulle « **Je les fixe !** ».
- **Existe déjà** : `canSuppress()` / `suppressAt()` (le vrai tir de suppression, avec ses effets), mais **réservé au rôle
  Appui** et à une cible vue il y a < 2 s. Il faut : (1) l'autoriser à tout opérateur **sous cet ordre**, (2) allonger
  la mémoire de la cible, (3) brider les munitions.
- **Difficulté** : **moyenne** · **Risque d'équilibre** : **moyen à élevé** (un ennemi cloué ne riposte plus : c'est
  puissant). Garde-fous : pas de dégâts à travers un couvert, munitions, la synergie « Appui-feu » ne s'applique pas.
- **Valeur** : **très forte** — c'est ce qui rend Encercler, Franchissement et les débordements **vraiment** différents :
  « Lynx et Granit fixent la ruelle, les trois autres passent par le sud ».
- **Dépend de** : rien ; **encore mieux** avec D7 (points de passage) et deux groupes.

### F3. Couvrir un autre groupe / un franchissement — **PARTIEL**
- **C'est quoi** : « Bravo, vous couvrez ; Alpha, vous passez. » Un groupe ne bouge pas tant que l'autre n'est pas arrivé.
- **Marque** : [RÉEL] (appui mutuel ; drill du franchissement).
- **Existe déjà** : **à l'intérieur** d'un seul ordre (moitiés de Méthodique, coureurs du Franchissement). Entre **deux
  ordres différents** donnés par le joueur : rien.
- **Dans le jeu** : la façon simple est **F2** (Appui sur la zone dangereuse) + un ordre Méthodique à l'autre groupe. La
  façon complète (« attendre que Bravo soit en place avant de partir ») demande une **file d'ordres** synchronisée.
- **Difficulté** : élevée (synchronisation entre ordres) · **Risque** : faible.
- **Avis** : **ne pas en faire un bouton** ; F2 + deux clics suffisent. Plus tard, éventuellement, une carte tactique
  « Appui-débordement » (T4) qui fait la synchronisation toute seule.

### F4. Surveillance (« overwatch ») du tireur d'élite — **PARTIEL**
- **C'est quoi** : un tireur posté loin, qui surveille un axe et ne tire que sur ce qui y entre.
- **Marque** : [RÉEL] (le GIGN forme des tireurs d'élite et des spécialistes observation-surveillance ; tireur du RAID qui
  neutralise un suspect à la sortie).
- **Existe déjà** : rôle `marksman` (poste qui voit loin, hors des bonds, garde ses distances), trait Patience, lunette
  (accessoire en pause). **Mais aucun opérateur n'a ce rôle** (escouade de 5 Assauts).
- **Dans le jeu** : Tenir + A4 (orienter) + F1 (Retenu) **donne déjà** une surveillance d'axe, pour n'importe qui.
  Le vrai tireur d'élite viendra **avec le retour de la classe**.
- **Difficulté** : faible une fois la classe revenue · **Risque** : moyen (un tireur bien placé sur la longue allée).
- **Avis** : **pas de bouton dédié** ; c'est une **combinaison** (Tenir + orienter + Retenu).

### F5. Concentrer le feu sur un ennemi — **NOUVEAU**
- **C'est quoi** : désigner **un** ennemi à abattre en priorité.
- **Marque** : [COURANT].
- **Difficulté** : faible (`chooseTarget()`) · **Risque** : moyen · **Valeur** : **faible** : c'est de la
  **micro-gestion** (« pas un RTS »), et l'ennemi n'est souvent connu que quelques secondes.
- **Avis** : **ne pas faire** (voir §8).

### F6. Tir de barrage / interdire un axe — **NOUVEAU**
- **Avis** : **redondant** avec F2 (Appui) + F1 (Retenu) + A4 (orienter). Pas de bouton.

### F7. Grenade sur ordre — voir **E1**.

---

## 6. Niveau 4 — Les tactiques d'escouade (cartes avant la bataille)

Les cartes sont **ce que l'escouade fait sans qu'on lui dise rien**. Ta règle « l'IA ne décide pas de la stratégie » vaut
aussi ici : une carte doit être un **plan choisi par le joueur à l'avance**, jamais une IA qui « réfléchit ».

### T1. Tiroir — **EXISTE** (+ variantes)
- [RÉEL]. Variantes possibles, **en réglage**, pas en nouvelles cartes :
  - **T1a — Bonds successifs puis alternés** (voir D1) [RÉEL].
  - **T1b — Appui fixe (trinôme qui bouge, binôme qui couvre toujours)** [RÉEL : trinôme 300 / 600]. Le binôme ne
    « saute » jamais devant : il reste la base de feu et rejoint quand le trinôme est en place. Plus lent, plus sûr.
    → **Carte à part possible** (« Tiroir lent »), si tu veux un choix « vite / sûr » avant la bataille.
- **Problème connu** : les moitiés sont figées au départ ; si les deux opérateurs d'une moitié tombent, les autres
  enchaînent seuls (voir R3).

### T2. Tenailles — **EXISTE** · T3. Rush milieu — **EXISTE**
- [RÉEL] pour l'idée générale (enveloppement / effort concentré). Valeur forte : vrai choix avant la bataille.

### T4. Fixer et déborder (appui-débordement) — **NOUVEAU** ⭐
- **C'est quoi** : au premier contact, **2 opérateurs fixent** l'ennemi par le feu là où il est, **3 le contournent** par
  la voie la plus proche et le prennent de côté.
- **Marque** : [RÉEL] (réaction au contact → assaut par le flanc ; feu et mouvement).
- **Dans le jeu** :
  - *Joueur* : carte « Fixer et déborder » (active, 1–2 emplois). Il la **joue au moment qu'il choisit** (pas
    automatique au contact : c'est lui qui décide).
  - *IA* : les 2 les plus proches de la menace passent en **Appui** (F2) sur sa position ; les 3 autres prennent la voie
    latérale (nord ou sud, la plus courte) en Méthodique, puis **Encerclent** le point (A2).
  - *À l'écran* : deux marqueurs, une flèche courbe pour le débordement, bulles « **On les fixe !** » / « **On déborde
    par le nord !** ».
- **Existe déjà** : voies et flancs (`flankWaypoint`), Encercler, Méthodique, ordres par groupe (`moveGroups`) ; il manque
  F2.
- **Recoupe** : Tenailles (qui sépare **avant** le contact, sans fixer). Les deux peuvent coexister : Tenailles = plan de
  départ, Fixer et déborder = réaction au contact.
- **Difficulté** : moyenne (une fois F2 fait) · **Risque** : moyen.
- **Valeur** : **forte** — c'est la manœuvre la plus classique de l'infanterie, très visible.
- **Dépend de** : **F2**.

### T5. Défense mobile / freinage (tenir puis reculer sur une 2e ligne) — **NOUVEAU**
- **C'est quoi** : tenir une première ligne ; quand la pression devient trop forte (un blessé, l'ennemi à < 15 m),
  **décrocher par bonds** (D4) sur une seconde ligne choisie à l'avance, et recommencer.
- **Marque** : [RÉEL] (combat de freinage / repli par bonds, principe général).
- **Dans le jeu** : *Joueur* : avant ou pendant la bataille, deux clics (ligne 1, ligne 2) avec arrivée « Tenir »,
  plus la règle « repli si… ». *IA* : décroche toute seule **selon la règle choisie par le joueur** (c'est une condition,
  pas une décision stratégique de l'IA).
- **Difficulté** : moyenne à élevée (une « condition » d'ordre, c'est nouveau) · **Risque** : moyen.
- **Valeur** : forte **dans « Tenir le parking »** (gagner du temps), faible ailleurs.
- **Dépend de** : D4 ; file d'ordres conditionnelle.

### T6. Décrocher (carte) — doublon de **D4**
- Mieux comme **mode de déplacement** (on choisit où se replier) que comme carte. Pas de carte.

### T7. Éclaireur en tête — **NOUVEAU**
- **C'est quoi** : un seul opérateur (le plus perceptif, ex. Lynx « Œil de lynx ») avance devant, lentement ; les autres
  suivent à ~20 m et ne s'engagent qu'au contact.
- **Marque** : [COURANT] (pointe / éclaireur ; le rôle `pointman` existe dans `data.js`).
- **Dans le jeu** : carte passive « Éclaireur » ; *à l'écran*, la tête de l'escouade est un seul homme.
- **Difficulté** : moyenne · **Risque** : moyen (l'éclaireur meurt souvent seul — c'est le prix à payer, choisi par le
  joueur).
- **Valeur** : moyenne à forte : un vrai pari (information contre risque).
- **Recoupe** : un peu le Tiroir (l'un exclut l'autre).

### T8. Feinte / diversion — **NOUVEAU**
- **C'est quoi** : un petit groupe fait **du bruit et du feu** sur une voie pour attirer l'ennemi, pendant que le gros
  passe ailleurs.
- **Marque** : [RÉEL] pour l'idée (diversion, principe général) ; [INVENTION] pour la mécanique.
- **Ça marcherait déjà en partie** : l'ennemi **entend** les tirs (jusqu'à 70 m) et va vers les positions connues. Un
  ordre « Appui » (F2) sur une zone vide **fait du bruit**… 
- **Difficulté** : moyenne · **Risque** : **élevé** — c'est l'exemple parfait de l'**ennemi scripté qui se fait avoir à
  chaque fois**. Une fois découvert, le joueur répétera la feinte à chaque mission.
- **Valeur** : forte **si** l'ennemi est parfois méfiant ; sinon c'est une « astuce » qui tue l'intérêt.
- **Avis** : **attendre** que le Groupe Karst ait ses propres plans (§13.2). Pas de carte avant.

### T9. Hérisson / défense à 360° — doublon
- = ordre d'équipe Tenir + arrivée Tenir. Pas de carte.

### T10. « Localiser – circonscrire – neutraliser » en automatique — **NOUVEAU (déconseillé)**
- **C'est quoi** : une carte qui enchaîne seule Méthodique → Encercler au premier contact → Assaut.
- **Marque** : [RÉEL] (séquence BRI / RAID).
- **Avis** : **ne pas faire** sous cette forme : c'est l'**IA qui décide** quand encercler et quand donner l'assaut —
  contraire à ta règle. Le joueur peut déjà le faire **lui-même** en trois clics (Méthodique → Encercler + Appui → Agressif).
  Ce sera même la « signature GIGN » du jeu, à expliquer dans le tutoriel.

### T11. Colonne à bouclier — **décidé « plus tard »**
- Voir `critique_france.md` §3.6 : gros chantier, gros risque, utile surtout avec des couloirs.

---

## 7. Niveau 5 — L'équipement

### E1. Grenade à fragmentation **sur ordre** — **PARTIEL** ⭐
- **C'est quoi** : « grenade sur ce couvert ! » — aujourd'hui seule l'IA décide de lancer.
- **Marque** : [RÉEL] (« le métal avant la chair » des Britanniques, `france.md` §1.4) ; [COURANT] pour la commande.
- **Dans le jeu** : *Joueur* : bouton « Grenade » dans « Plus… », puis clic sur la zone. *IA* : l'opérateur sélectionné
  (ou le plus proche avec une grenade) se met à portée (8–24 m) à couvert et lance. *À l'écran* : arc de lancer
  prévisualisé, bulle « **Grenade !** ».
- **Existe déjà** : `tryGrenade()` / `releaseGrenade()` (dispersion, esquive adverse, tir ami possible, décor qui casse).
- **Difficulté** : faible à moyenne · **Risque** : moyen (1 grenade par opérateur = 5 par bataille : déjà le cas).
- **Valeur** : forte : déloger quelqu'un de derrière un couvert, **au bon moment** (pendant qu'un groupe le fixe).
- **Question** : l'IA doit-elle **continuer** à lancer seule ? Je conseille : oui, sauf si l'opérateur est sous un ordre
  avec « Feu retenu ».

### E2. Grenade incapacitante (flash) — **PARTIEL**
- **C'est quoi** : aveugle quelques secondes ceux qui voient l'éclair. Arme **non mortelle**, typique des unités
  d'intervention.
- **Marque** : [RÉEL] (désorienter, libération d'otages, minimum de force).
- **Existe déjà** : tout le comportement (`GRENADES.flash` : rayon 7 m, 3,5 s, l'aveuglé ne repère plus et tire ×0,25).
  **Mais seuls les rôles Pointe et Brèche en ont**, absents aujourd'hui.
- **Dans le jeu** : la paire idéale avec **Encercler** puis **Agressif** : flash, puis assaut. Sur ordre (comme E1).
- **Difficulté** : faible (donner 1 flash au GIGN = une ligne de données) · **Risque** : moyen (flash + assaut est très
  fort à courte distance).
- **Valeur** : forte et **très « GIGN »**. **Ajouter une dotation = nouveau contenu → ton accord.**

### E3. Fumigène — **PARTIEL** ⭐
- **C'est quoi** : un nuage qui **bloque la vue** quelques secondes, pour traverser ou décrocher sans être vu.
- **Marque** : [RÉEL] (masquer les mouvements sous le feu ; drill « décrocher » avec fumée).
- **Dans le jeu** : *Joueur* : option « avec fumée » dans Franchissement et Décrocher (l'IA lance sur le côté dangereux),
  et/ou lancer sur ordre (comme E1). *IA* : ne tire pas à l'aveugle dans la fumée ; l'ennemi non plus (sauf positions
  connues). *À l'écran* : le nuage (l'effet visuel existe déjà).
- **Existe déjà** : `map.dynamic` (obstacle « fumée » qui bloque la vue, pas la marche, avec durée), effet visuel dans
  `app.js`. Il manque : la grenade, la dotation, la règle « où lancer ».
- **Difficulté** : faible à moyenne · **Risque** : moyen (bloque la vue **des deux côtés** : l'IA adverse doit savoir
  attendre derrière, sinon elle avance dans la fumée).
- **Valeur** : **forte** : rend Franchissement et Décrocher beaucoup plus intéressants et visibles.
- **Dépend de** : D4 (Décrocher) ; ton accord (nouvel objet).

### E4. Bouclier balistique — **décidé « plus tard »**
- [RÉEL]. Voir T11.

### E5. Accessoires (lunette, silencieux, poignée…) — **EXISTE (en pause)**
- Pas des « stratégies » en soi, mais **le silencieux + la nuit + Discret (D5)** forment une vraie stratégie
  d'infiltration. À rallumer quand les accessoires reviennent.

### E6. Matériel de secours (trait Secouriste) — **EXISTE**
- Le Secouriste soigne à < 5 m et relève en 2 s. Il deviendra précieux avec R2 (traîner le blessé).

---

## 8. Niveau 6 — Les réflexes automatiques (l'IA les fait seule)

Ici, l'IA **décide**, mais ce sont des **réflexes individuels** (comme un vrai soldat bien entraîné), **pas** de la
stratégie. C'est compatible avec ta règle.

### R1. Réaction au contact — **EXISTE (en grande partie)**
- **C'est quoi** : pris à partie → à couvert, riposter, prévenir les autres.
- **Marque** : [RÉEL / COURANT] (drill « réaction au contact »).
- **Existe déjà** : se mettre à couvert face au tireur, même invisible ; couvert tout proche (≤ 4 m) sous le feu ; radio
  toutes les secondes ; en Tenir, le serre-file vient aider.
- **Manque** : (1) la **bulle « Contact ! »** avec la direction (lisibilité), (2) que **toute l'escouade se tourne** vers
  le contact annoncé (aujourd'hui seuls ceux qui le voient ou l'apprennent par radio).
- **Difficulté** : faible · **Risque** : faible · **Valeur** : lisibilité forte.

### R2. Tirer un blessé à couvert (« buddy drag ») — **NOUVEAU**
- **C'est quoi** : un équipier tombe à découvert ; un autre le **traîne** derrière le couvert le plus proche, puis le
  relève quand le feu se calme.
- **Marque** : [RÉEL] (soins sous le feu : d'abord riposter, puis amener le blessé à couvert).
- **Dans le jeu** : *IA* : si un équipier est « à terre » à < 6 m et qu'un couvert est à < 5 m de lui, le plus proche
  qui **n'est pas** pris à partie le traîne (vitesse réduite, ne tire pas) ; puis relève. *À l'écran* : animation de
  traîner, bulle « **Je le prends !** ».
- **Existe déjà** : à terre / relevé (`downedToRevive`, `updateRevives`), recherche de couvert.
- **Difficulté** : **élevée** — l'**animation** (deux corps liés) ; le moteur, lui, est simple.
- **Risque** : moyen (plus de relevés = l'escouade survit plus).
- **Valeur** : forte (émotion, réalisme), mais **pas une décision du joueur**.
- **Dépend de** : animations (motion matching).
- **Règle liée, simple et sans animation** : permettre aux opérateurs **en Tenir** de relever un équipier **dans la
  position** (< 10 m) quand rien n'est vu depuis 5 s (aujourd'hui : interdit pendant un ordre).

### R3. Relève d'un rôle tombé — **PARTIEL**
- **C'est quoi** : quand un équipier tombe, un autre reprend aussitôt sa place (son secteur, sa moitié, l'arrière).
- **Marque** : [RÉEL] (« tout le monde est capable d'occuper tous les postes », GIGN).
- **Existe déjà** : en **Tenir**, les secteurs sont **recalculés** dès que l'effectif change (`holdPlan`). **Pas dans le
  Tiroir ni dans Méthodique** : les moitiés sont figées ; si une moitié est vide, l'autre bondit sans appui.
- **Dans le jeu** : rééquilibrer les moitiés (ex. 3 + 2 → deux tombent dans la même moitié → on refait 2 + 1) ; bulle
  « **Je prends sa place !** ».
- **Difficulté** : faible · **Risque** : faible · **Valeur** : moyenne (on le voit surtout en fin de bataille).

### R4. Décrocher tout seul (repli automatique de l'escouade) — **déconseillé**
- Individuel : **existe déjà** (moral « ébranlé », recul face à face < 4 m, tireur trop près). À l'échelle de l'escouade,
  ce serait l'IA qui décide de céder le terrain → **contraire à ta règle**. Le joueur a D4.

### R5. Recharge couverte (« Je recharge, couvre-moi ») — **NOUVEAU**
- [COURANT]. Le voisin couvre le secteur de celui qui recharge. Effet presque invisible ; la **bulle** suffit.
- Difficulté faible · Valeur faible · **Plus tard**.

### R6. Annonces en bulles — **EXISTE (à compléter)** ⭐
- Le journal a déjà « Je bouge ! », « Couvert ! », « En place. », « Je viens en appui ! », « Grenade ! »… mais **la
  plupart sont « silencieuses »** (pas affichées en bulle).
- **À compléter** : « Contact ! (nord) », « Homme à terre ! », « Je recharge ! », « On décroche ! », « Feu ! ».
- Tu as dit **oui** aux bulles (décision 7). Difficulté faible, risque nul, **lisibilité très forte**.

### R7. Ne pas tirer à travers un ami, esquiver une grenade, moral, Secouriste — **EXISTE**
- Rien à faire. Juste les **montrer** (bulles, journal).

---

## 9. Niveau 7 — Ce qui demande des fonctions qu'on n'a pas encore

| # | Idée | Marque | Ce qu'il faut d'abord | Difficulté | Valeur | Avis |
|---|---|---|---|---|---|---|
| N1 | **Bâtiments et entrée dans les pièces** (colonne, chacun son coin de pièce) | [RÉEL] / [COURANT] | Une carte avec intérieurs, portes, étages ; navigation à plusieurs niveaux ; animations | Élevée | Très forte (c'est le cœur du GIGN) | Le **gros** chantier de demain ; à penser avec une 2e carte. |
| N2 | **Effraction** (explosif, bélier, fusil à pompe) | [RÉEL] (effracteurs GIGN) | N1 ; rôle Brèche (existe dans les données), trait Enfonceur (existe) | Moyenne après N1 | Forte | Avec N1. |
| N3 | **Négociation et otages** (« d'abord la négociation, puis la neutralisation ») | [RÉEL] | Un nouveau type de mission : otages, civils, règle « ne pas toucher un civil », minuterie de négociation | Élevée | Forte, très GIGN | Un **mode de mission** à part, pas un ordre. Prudence sur le ton (rester sobre). |
| N4 | **Vision nocturne** | [COURANT] | Un équipement qui annule la pénalité de nuit (`CONDITIONS.nuit`), un filtre visuel | Faible à moyenne | Moyenne | Facile techniquement ; **gros effet d'équilibre** de nuit. |
| N5 | **Drone de reconnaissance** | [RÉEL] (télépilotes au GIGN) | Une capacité : « révèle les ennemis dans un cercle pendant X s » (injecter des positions connues) | Faible à moyenne | Forte | **L'information gagne les batailles** : risque élevé. 1 emploi, court. Plus tard. |
| N6 | **Points hauts / toits** | [RÉEL] (« la tenue des points hauts est primordiale ») | Hauteurs sur la carte, échelles / escaliers | Élevée | Forte | Avec N1. |
| N7 | **Approche sous blindage** (véhicule-bouclier) | [RÉEL] (exercice de Saclay) | Véhicule, physique, rendu | Élevée | Moyenne | Beaucoup plus tard. |
| N8 | **Chiens d'intervention** | [COURANT] | Une IA et des animations d'animal | Élevée | Moyenne | Pas avant longtemps. |
| N9 | **Tireur embarqué en hélicoptère** | [RÉEL] (formation « tir embarqué ») | Hors de l'échelle du jeu | — | — | **Non.** |

---

## 10. Recoupements, doublons et risque d'encombrer le menu

### 10.1 Doublons à éviter

| Idée | Recoupe | Décision conseillée |
|---|---|---|
| Bonds successifs (D1, T1a) | Méthodique | **Réglage interne**, pas de bouton |
| Décrocher en carte (T6) | Décrocher en déplacement (D4) | **Seulement D4** |
| Point de ralliement (A6) | Tenir | **Pas de bouton** ; une règle « relever les blessés en Tenir » |
| Embuscade (A7, T8 « embuscade de départ ») | Tenir + Feu retenu | **Seulement F1** |
| Tir de barrage (F6) | Appui (F2) | **Seulement F2** |
| Overwatch du tireur (F4) | Tenir + orienter + Retenu | **Combinaison**, pas de bouton |
| Couvrir un groupe (F3) | Appui (F2) + 2 clics | **Pas de bouton** ; plus tard T4 |
| Hérisson (T9) | Ordre Tenir + arrivée Tenir | **Rien** |
| Rotation (D8) | Points de passage (D7) | Garder la rotation **jusqu'à** D7, puis la retirer ou la cacher |
| Positions clés (`positionsCles`) | Clic droit n'importe où | Les garder **dans le moteur** (tests, IA ennemie future), pas dans l'interface |
| Ordre d'équipe Tenir (liste déroulante) | Arrivée Tenir (clic droit) | Deux « Tenir » différents qui se ressemblent : **à clarifier** (voir §11.4) |

### 10.2 Ce qui encombrerait le menu

- **Tout ce qui est rare** : Fouiller, Grenade sur ordre, Fumée sur ordre → dans « Plus… ».
- **Tout ce qui demande une cible précise** (Concentrer le feu) → **non**.
- **Les variantes qu'on ne voit pas à l'écran** (bonds successifs, petits réglages de rythme) → réglages, pas boutons.
- **Règle simple** : un bouton n'entre dans la ligne principale que si **le joueur voit la différence en moins de 5 s**.

---

## 11. Garder le clic droit lisible quand les options grandissent

### 11.1 La forme proposée

```
 ┌──────────── ORDRE — Tous (5) ─────────────┐
 │ DÉPLACEMENT                                │
 │ [Méthodique] [Agressif] [Franchir] [Décrocher]
 │ ARRIVÉE                                    │
 │ [Tenir] [Encercler] [Reprendre]            │
 │ FEU                                        │
 │ (•) À volonté  ( ) Retenu  ( ) Appui        │
 │                                  [Plus… ▸] │
 │            [ Confirmer ]                    │
 └────────────────────────────────────────────┘
   Plus… : Fouiller · Grenade · Fumée (si accordées)
```

- **4 + 3 + 3 choix au maximum** sur les lignes visibles. Au-delà → « Plus… ».
- **La ligne Feu est petite** (boutons radio, pas de grandes icônes) : c'est un **réglage**, pas une action.
- **Les gestes ne prennent pas de place** : Maj + clic droit = point de passage (D7) ; clic gauche après Confirmer =
  orientation (A4).

### 11.2 Des défauts intelligents (déjà en partie là)
- Les **derniers choix restent présélectionnés** (existe : `ordLast`, sauvegardé).
- **Feu revient à « À volonté »** après chaque ordre (un « Retenu » oublié peut coûter cher) — à toi de dire (question 2).
- **Double-clic sur un choix = confirmer** (existe déjà : cliquer un choix déjà surligné confirme).

### 11.3 Un interrupteur « Ordres avancés »
- Dans les options (ou au QG) : **désactivé par défaut**. Désactivé : seulement Déplacement + Arrivée, comme aujourd'hui.
  Activé : la ligne Feu et « Plus… ».
- Avantage : un nouveau joueur n'est pas noyé ; toi, tu actives tout.

### 11.4 Clarifier les deux « Tenir »
- Aujourd'hui il y a l'**ordre d'équipe** « Tenir » (liste déroulante : reste près de sa position, embuscade, bonus
  « calé », coupe le Tiroir) **et** l'**arrivée** « Tenir la position » (clic droit : sûreté 360°). Pour un joueur, c'est
  confus.
- Proposition : renommer l'ordre d'équipe en **« Posture : Défensive / Offensive / Prudente »**, ou, à terme, le
  **remplacer** par le clic droit (« Tous → Tenir ici »).

### 11.5 Sélection de groupes
- Aujourd'hui : « Tous » ou des cartes. Pour F2 et T4, il faut souvent **deux groupes**. Proposition légère : deux
  boutons « **Groupe 1** / **Groupe 2** » au-dessus des cartes (par défaut = les moitiés du Tiroir, 3 + 2), sans touches
  clavier (1, 2, 3 sont prises par la vitesse).

---

## 12. Tableau récapitulatif

| # | Nom | Niveau | Statut | Marque | Difficulté | Risque | Valeur | Vague |
|---|---|---|---|---|---|---|---|---|
| D1 | Méthodique (+ bonds successifs en réglage) | Déplacement | EXISTE | RÉEL | faible | faible | forte | (réglage : 2) |
| D2 | Agressif | Déplacement | EXISTE | COURANT | — | — | forte | — |
| D3 | Franchissement (+ afficher les découverts) | Déplacement | EXISTE | RÉEL | faible | nul | moyenne→forte | 1 (affichage) |
| D4 | **Décrocher** | Déplacement | NOUVEAU | RÉEL | faible-moy. | faible | forte | **1** |
| D5 | Discret | Déplacement | NOUVEAU | COURANT | moyenne | moyen-élevé | moyenne | 2–3 |
| D6 | Colonne | Déplacement | NOUVEAU | RÉEL | moyenne | moyen | faible (auj.) | 3 |
| D7 | **Points de passage** | Geste | NOUVEAU | COURANT | faible-moy. | faible | forte | **2** |
| D8 | Rotation | Bataille | EXISTE | — | — | — | moyenne | à retirer après D7 |
| A1 | Tenir la position | Arrivée | EXISTE | RÉEL | — | — | forte | — |
| A2 | Encercler | Arrivée | EXISTE | RÉEL | — | — | forte | — |
| A3 | Reprendre la manœuvre | Arrivée | EXISTE | INVENTION | — | — | moyenne | — |
| A4 | **Orienter la position** | Geste | NOUVEAU | RÉEL | faible | faible | forte | **1** |
| A5 | Fouiller | Arrivée (Plus…) | NOUVEAU | COURANT | faible | faible | faible-moy. | 2 |
| A6 | Point de ralliement | — | doublon | RÉEL | — | — | — | non (règle R2) |
| F1 | **Feu retenu / à volonté** | Feu | PARTIEL | RÉEL | faible | moyen | très forte | **1** |
| F2 | **Appui (fixer une zone)** | Feu | PARTIEL | RÉEL | moyenne | moyen-élevé | très forte | **1** |
| F3 | Couvrir un groupe | — | PARTIEL | RÉEL | élevée | faible | forte | via F2 / T4 |
| F4 | Overwatch tireur d'élite | combinaison | PARTIEL | RÉEL | faible | moyen | moyenne | avec la classe |
| F5 | Concentrer le feu | — | NOUVEAU | COURANT | faible | moyen | faible | **non** |
| F6 | Tir de barrage | — | doublon | — | — | — | — | non |
| T1 | Tiroir (+ T1b « Tiroir lent ») | Carte | EXISTE | RÉEL | faible | faible | forte | T1b : 2 |
| T2/T3 | Tenailles, Rush milieu | Carte | EXISTE | RÉEL | — | — | forte | — |
| T4 | **Fixer et déborder** | Carte | NOUVEAU | RÉEL | moyenne | moyen | forte | **2** |
| T5 | Défense mobile (2 lignes) | Carte / ordre | NOUVEAU | RÉEL | moy.-élevée | moyen | forte (Tenir) | 2–3 |
| T7 | Éclaireur | Carte | NOUVEAU | COURANT | moyenne | moyen | moyenne-forte | 2 |
| T8 | Feinte / diversion | Carte | NOUVEAU | RÉEL/INV. | moyenne | **élevé** | forte | 3 (après plans ennemis) |
| T10 | Séquence GIGN automatique | Carte | NOUVEAU | RÉEL | moyenne | moyen | — | **non** (l'IA déciderait) |
| T11 | Colonne à bouclier | Carte | NOUVEAU | RÉEL | élevée | élevé | moyenne | plus tard (décidé) |
| E1 | **Grenade sur ordre** | Plus… | PARTIEL | RÉEL/COURANT | faible-moy. | moyen | forte | **2** |
| E2 | Flash pour le GIGN | Équipement | PARTIEL | RÉEL | faible | moyen | forte | 2 (accord) |
| E3 | **Fumigène** | Équipement | PARTIEL | RÉEL | faible-moy. | moyen | forte | **2** (accord) |
| E4 | Bouclier | Équipement | NOUVEAU | RÉEL | élevée | élevé | — | plus tard (décidé) |
| R1 | Réaction au contact (bulle + tout le monde se tourne) | Réflexe | EXISTE+ | RÉEL/COURANT | faible | faible | lisibilité | 1 (avec R6) |
| R2 | Tirer un blessé à couvert | Réflexe | NOUVEAU | RÉEL | **élevée** (anim.) | moyen | forte | 3 (règle simple : 2) |
| R3 | **Relève d'un rôle tombé** | Réflexe | PARTIEL | RÉEL | faible | faible | moyenne | **1** |
| R4 | Repli automatique de l'escouade | Réflexe | — | — | — | — | — | **non** |
| R5 | Recharge couverte | Réflexe | NOUVEAU | COURANT | faible | faible | faible | 3 |
| R6 | **Bulles d'annonce** | Affichage | EXISTE+ | INVENTION | faible | nul | très forte | **1** |
| N1–N9 | Bâtiments, effraction, otages, nuit, drone… | — | NOUVEAU | voir §9 | élevée | — | — | 3 |

---

## 13. VERDICT

### 13.1 En une phrase
Le système de déplacement est **déjà bon** ; ce qui rendra le GIGN vraiment **tactique**, c'est de donner au joueur la
**maîtrise du feu** (retenir, fixer, décrocher) — avec très peu de code nouveau, parce que le moteur a déjà les briques.

### 13.2 Feuille de route en 3 vagues

**Vague 1 — prochainement (le plus utile, le moins risqué)** — tout s'appuie sur du code existant :

| Ordre | Quoi | Pourquoi maintenant |
|---|---|---|
| 1 | **F1 — Feu retenu / à volonté** (petite ligne « Feu » dans le menu) | La règle d'embuscade existe déjà ; vraie décision, très visible. |
| 2 | **F2 — Appui : fixer une zone** | Rend Encercler et Franchissement vraiment utiles ; le tir de suppression existe déjà. |
| 3 | **D4 — Décrocher** | Même squelette que Méthodique ; la décision « sauver mes gars » manque aujourd'hui. |
| 4 | **A4 — Orienter la position** (clic gauche après Confirmer) | Quelques lignes ; le joueur dit enfin « d'où ça vient ». |
| 5 | **R6 + R1 + R3 — Bulles (« Contact ! », « Homme à terre ! », « Feu ! »), escouade qui se tourne vers le contact, relève des moitiés** | Lisibilité ; rien de nouveau à approuver côté mécanique, sauf les textes. |

Avec ces 5 points, le joueur peut déjà jouer la **séquence GIGN complète** à la main : *Méthodique → Encercler + Appui →
(Feu retenu sur l'autre côté) → Agressif*. Et **décrocher** si ça tourne mal.

**Vague 2 — plus tard (nouveau contenu, à approuver)** :
- **D7 — Points de passage** (Maj + clic droit) ; puis retirer ou cacher la Rotation.
- **E3 — Fumigène** (le nuage existe déjà dans le moteur) + options « avec fumée » dans Franchissement et Décrocher.
- **E1 — Grenade sur ordre**, et **E2 — une flash par GIGN** si tu es d'accord.
- **T4 — Carte « Fixer et déborder »** (une fois F2 fait).
- **T7 — Éclaireur**, **T1b — Tiroir lent**.
- **A5 — Fouiller**, dans « Plus… ».
- La règle « **relever les blessés dans la position en Tenir** » (R2, version sans animation).
- **L'interrupteur « Ordres avancés »** et les boutons **Groupe 1 / Groupe 2**.
- **Commencer les plans du Groupe Karst** (quelques comportements scriptés : se replier, contourner, attendre derrière
  la fumée) pour que les nouveaux pouvoirs du joueur ne cassent pas les missions.

**Vague 3 — beaucoup plus tard** :
- **R2 — Tirer un blessé à couvert** (avec les animations du motion matching).
- **D5 — Discret** (animations accroupies, nuit, silencieux).
- **T5 — Défense mobile**, **T8 — Feinte** (après les plans ennemis).
- **N1 / N2 / N6 — Bâtiments, effraction, points hauts** (une 2e carte), puis **D6 — Colonne** et **T11 — Bouclier**.
- **N3 — Mission otages / négociation**, **N4 — Vision nocturne**, **N5 — Drone**.
- **La chimie de doctrine** (déjà prévue pour l'arrivée d'un 2e pays).

### 13.3 Ce qu'il ne faut PAS faire (et pourquoi)

1. **Pas d'IA qui décide de la stratégie de l'escouade** : pas de séquence GIGN automatique (T10), pas de repli
   automatique de l'escouade (R4), pas d'IA qui pose seule un bouclier ou une fumée « stratégique ». C'est **ta** règle,
   et c'est ce qui rend tes victoires **méritées**.
2. **Pas de « Concentrer le feu sur cet ennemi »** (F5) : micro-gestion de RTS, illisible, et l'ennemi n'est visible que
   quelques secondes.
3. **Pas de doublons dans le menu** (§10.1) : bonds successifs, ralliement, barrage, hérisson, décrocher en carte.
4. **Pas de feinte (T8) tant que l'ennemi n'a pas de plans** : sinon la même astuce gagne toutes les missions.
5. **Pas d'erreur tirée au hasard qui tue** (déjà dit dans `critique_france.md`) : ni « bond hors tour », ni « fumée qui
   rate » au hasard.
6. **Pas de procédures réelles détaillées** (entrée dans les pièces, distances exactes, codes) : inutile pour le jeu et
   pas raisonnable ; on reste aux idées générales publiques.
7. **Ne jamais citer le Bataclan dans le jeu** (bulles, fiches, tutoriel).
8. **Pas de grenades / fumées illimitées** : 1 par opérateur et par type, comme aujourd'hui.
9. **Pas de nouvelles touches clavier** pour les groupes (1, 2, 3 = vitesse) : des boutons à l'écran.

### 13.4 Questions pour toi

1. **Feu retenu / Appui** : une petite **3e ligne « Feu »** dans le menu (À volonté · Retenu · Appui), ça te va ? Ou tu
   préfères que ce soit dans « Arrivée » (« Embuscade », « Appui ») ?
2. **« Feu retenu » oublié** : après chaque ordre, le feu doit-il **revenir à « À volonté »** (plus sûr), ou garder le
   dernier choix comme les autres lignes ?
3. **Appui (fixer)** : d'accord pour que **n'importe quel Assaut** puisse faire du tir de suppression sous cet ordre
   (aujourd'hui réservé au rôle Appui, absent de l'escouade) ?
4. **Décrocher** : d'accord pour ce 4e mode de déplacement ?
5. **Orienter la position** : un **clic gauche** juste après « Confirmer » pour dire d'où vient le danger, ça te va ?
6. **Fumigènes et flashs** : tu veux les ajouter au GIGN (nouveau contenu) ? Si oui, combien : **1 de chaque par
   opérateur**, ou **2 fumigènes pour toute l'escouade** ?
7. **Grenade sur ordre** : est-ce que l'IA doit **continuer** à lancer ses grenades toute seule en plus ?
8. **Ennemi** : d'accord pour donner au Groupe Karst quelques **plans scriptés** (se replier, contourner, attendre) en
   vague 2, pour que tes nouveaux ordres ne rendent pas les missions trop faciles ?

---

## 14. Sources

**Nouvelles sources (ce document)**
- Wikipédia — *Fire and movement* (feu et mouvement, base de feu, suppression, « sert aussi à se retirer ») :
  https://en.wikipedia.org/wiki/Fire_and_movement
- Joint Task Force Fatal — *Infantry Battle Drills* (résumé communautaire des drills américains : réaction au contact,
  décrocher avec fumée, assaut par le flanc, traversée de zone dangereuse) **[COURANT, site d'amateurs]** :
  https://joint-task-force-fatal.readthedocs.io/en/latest/infantry/battle_drills.html
- WikEM — *Care under fire* (riposter et se mettre à couvert d'abord, blessé amené à couvert) :
  https://wikem.org/wiki/Care_under_fire
- Gendarmerie nationale — *GIGN 3.0 : une formation tous horizons* (tireurs d'élite, observation-surveillance,
  négociateurs, télépilotes de drone, explosifs) :
  https://www.gendarmerie.interieur.gouv.fr/gendinfo/dossiers/gign-3.0/une-formation-tous-horizons
- Wikipédia — *RAID (French police unit)* (encerclement, siège, tireur d'élite, FIPN avec la BRI) :
  https://en.wikipedia.org/wiki/RAID_(French_police_unit)
- Wikipédia — *Smoke screen* (l'infanterie s'en sert pour cacher ses mouvements sous le feu) :
  https://en.wikipedia.org/wiki/Smoke_screen
- FAS — *XM84 Stun Grenade* (grenade incapacitante non mortelle : désorienter, libération d'otages, minimum de force) :
  https://man.fas.org/dod-101/sys/land/xm84.htm
- IRSEM — revue *Fantassins* n° 35 (2025) (vérifiée : n'apporte rien de précis sur le groupe de combat ; citée par
  honnêteté) : https://www.irsem.fr/storage/file_manager_files/2025/03/fantassins35.pdf

**Reprises de `france.md` (déjà vérifiées par `critique_france.md`)**
- Gendarmerie — *GIGN 3.0 : une capacité d'intervention de haut niveau* (négociation puis neutralisation ; tous les
  postes) : https://www.gendarmerie.interieur.gouv.fr/gendinfo/dossiers/gign-3.0/une-capacite-d-intervention-de-haut-niveau
- Gendarmerie — *GIGN 3.0 : ouvrir la voie à la colonne d'assaut* (effracteurs) :
  https://www.gendarmerie.interieur.gouv.fr/gendinfo/dossiers/gign-3.0/ouvrir-la-voie-a-la-colonne-d-assaut
- Gendarmerie — exercice de Saclay 2025 (colonne derrière un bouclier, approche sous blindage) :
  https://www.gendarmerie.interieur.gouv.fr/gendinfo/terrain/immersion/2025/attaque-terroriste-gendarmes-et-services-de-secours-s-entrainent-sur-le-plateau-de-saclay
- Assemblée nationale, commission d'enquête 2016, audition du chef de la BRI (progression lente, dispersion par
  secteurs, poser les boucliers) : https://www.assemblee-nationale.fr/14/pdf/cr-cemoyter/15-16/c1516007.pdf
- Assemblée nationale, commission d'enquête 2016, audition du RAID (« je prends le bas, il prend le haut ») :
  https://www.assemblee-nationale.fr/14/pdf/cr-cemoyter/15-16/c1516006.pdf
- CDEC, *Le combat en zone urbaine à l'horizon 2035* (« la rue tue ») :
  https://www.terre.defense.gouv.fr/sites/default/files/ccf/20180611_NP_CDEC_PEP_02-Le-combat-en-zone-urbaine-A-l-horizon-2035.pdf
- Revue *Fantassins* n° 27 (points hauts, ouverture du feu) :
  https://www.theatrum-belli.com/wp-content/uploads/2017/12/fantassin_no27.pdf
- Battle Order — trinômes 300 / 600 **[COURANT]** : https://www.battleorder.org/french-platoon-1999
- Wikipédia — *Bounding overwatch* : https://en.wikipedia.org/wiki/Bounding_overwatch
- British Army Review, *Urban Operations* vol. 2 (« Put metal before flesh ») :
  https://www.army.mod.uk/media/6555/bar_urban_ops_volume-2.pdf

**Code lu (aucune modification)** : `sim/engine.js` (`moveOrder`, `orderBound`, `orderRush`, `followCross`,
`findCrossings`, `arriveOrder`, `holdPerimeter`, `holdRear`, `holdSectors`, `encircleSpots`, `resumeManoeuvre`, `decide`,
`tiroir`, `updateTiroir`, `tryGrenade`, `updateGrenades`, `canSuppress`, `suppressAt`, `maybeBleed`, `updateRevives`,
`moraleCheck`, `isBraced`), `sim/data.js` (`ORDERS`, `TACTICS`, `ROLES`, `TRAITS`, `GRENADES`, `SYNERGIES`, `OPERATORS`),
`sim/map.js` (`positionsCles`, `voies`, `dynamic`), `web/hq.js` (cartes tactiques, 3 au maximum), `web/app.js` (menu du
clic droit `ORD_OPTS`, sélection, marqueurs).
