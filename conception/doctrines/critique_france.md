# Critique du document « Doctrines nationales — 1. La France »

> Relecture critique de `conception/doctrines/france.md`. **Rien n'a été modifié dans le jeu.**
> J'ai lu tout le document **et** le vrai code (`sim/engine.js`, `sim/data.js`, `sim/game.js`, `sim/map.js`, `web/hq.js`,
> `web/app.js`, `outils/equilibre.js`) pour vérifier ce qu'il affirme. Rédigé le 19/10/2026.

---

## 1. Le document en 10 lignes

1. Il raconte comment les Français avancent en ville : l'**armée** (de maison en maison, par bonds, « la rue tue ») et les
   **unités d'intervention** (GIGN, RAID, BRI : colonne lente derrière un bouclier, puis chacun prend un secteur).
2. Il propose de ranger la doctrine dans une **fiche de réglages** par pays (taille des bonds, rythme…) : proposition A.
3. Il propose la **chimie façon FIFA** (B) : chaque paire de doctrines a une note de 45 à 100 ; la chimie d'un opérateur est
   la moyenne de ses notes avec les 4 autres.
4. Une mauvaise chimie ne touche **pas la précision** : elle ajoute des **retards** (départ de bond, radio, relève) et des
   **erreurs de coordination** tirées au hasard (bond au mauvais moment, mauvais secteur…).
5. Plafond voulu : la pire escouade mélangée ne perd que **≈ 5 points** de taux de victoire (55 % / 45 %).
6. Il propose 6 comportements « à la française » (C1 à C6) : Tiroir 3 + 2, secteurs de surveillance, traversée d'un espace
   ouvert, **colonne à bouclier**, deux rythmes, relève des rôles.
7. Il propose le **clic droit « allez là »** (D), d'abord sur les positions clés déjà prévues dans le moteur.
8. Il propose de rendre tout ça **visible** (E) : bulles de texte, cônes au sol, bilan de fin, chimie au QG.
9. Plus tard : États-Unis et Royaume-Uni avec la même fiche (F).
10. Il finit par 8 questions pour toi.

---

## 2. Les questions du document, en simple (avec mon avis)

| # | Question (reformulée) | Choix possibles | Mon avis en une ligne |
|---|---|---|---|
| 1 | La chimie doit-elle toucher **seulement le travail d'équipe** (retards, erreurs), pas le tir ? Et « au pire 55 / 45 », ça va ? | Oui / Non ; plafond plus fort / plus faible / OK | **Oui, seulement le travail d'équipe, plafond OK** — mais ne pas toucher à « Frères d'armes » avant la grosse passe d'équilibrage (voir §3.4). |
| 2 | Dans une escouade mélangée, **qui** paie : seulement ceux en minorité, ou toute l'escouade un peu ? | Minorité / Tout le monde | **Minorité** (la formule le fait déjà), en sachant que l'escouade entière ralentit un peu à cause d'eux (voir §3.2). |
| 3 | Comment **réduire** la pénalité ? | (a) le Meneur soude l'équipe, (b) l'habitude (batailles ensemble), (c) nouveau trait « Liaison » | **(a) seulement pour commencer** : le trait existe déjà. (b) plus tard, (c) non pour l'instant (nouveau contenu). |
| 4 | GIGN, RAID, BRI : **une** doctrine ou **trois** voisines ? | 1 / 3 | **Une seule** : il n'y a que des GIGN dans le jeu, et une différence de 100 contre 90 ne se verrait pas. |
| 5 | Un vrai **porteur de bouclier** plus tard, ou seulement une **file** dans les passages étroits ? | Bouclier / File / Rien | **Rien pour l'instant** ; si un jour, la simple file. Le bouclier est un gros chantier risqué (voir §3.6). |
| 6 | Clic droit : d'abord sur les **positions clés** seulement (D-a), ou **n'importe où** (D-b) ? Sélection par **groupes** ou escouade entière ? | D-a / D-b ; groupes / escouade | **D-a comme essai rapide, puis D-b** ; **escouade entière** d'abord. Attention : les touches 1 et 2 sont déjà prises (vitesse du jeu). |
| 7 | Annonces en **bulles de texte** en français, sans voix : d'accord ? Et des **bruitages radio** plus tard ? | Bulles oui/non ; bruitages oui/non | **Bulles oui** (elles existent déjà). Bruitages radio courts (« clic », grésillement) : à toi de dire, ce n'est pas de la voix. |
| 8 | Prochain pays : **États-Unis puis Royaume-Uni**, ou **Royaume-Uni d'abord** ? | US d'abord / UK d'abord | **Royaume-Uni d'abord** : doctrine proche, c'est le meilleur test de la chimie « petits frottements ». |

**Questions qui manquent dans le document** (à te poser aussi) :

- **A. Quand** faire la chimie ? Aujourd'hui, il n'y a **que 5 opérateurs, tous GIGN**. Sans opérateurs d'un autre pays,
  la chimie vaut toujours 100 : **personne ne la verra**.
- **B. L'ennemi** (Groupe Karst, sans pays) : quelle chimie ? Fixe ? Toujours parfaite ?
- **C. Quand un opérateur tombe**, la chimie se recalcule-t-elle (le « seul Indien » meurt → les 4 Français passent à 100) ou
  reste-t-elle celle du départ ?

---

## 3. Critique

### 3.1 La recherche : sérieuse, honnête, mais en partie inutile pour le jeu actuel

**Ce qui est bien**
- Le marquage **[RÉEL] / [COURANT] / [INVENTION]** est une très bonne habitude : on sait ce qui est vrai et ce qui est inventé.
- Les sources sont surtout **officielles** (Gendarmerie, Assemblée nationale, ministère des Armées, armée de Terre).
- J'ai vérifié deux sources au hasard :
  - L'audition du chef de la BRI (Assemblée nationale) contient bien, **mot pour mot**, « progresser lentement — avec le
    discernement indispensable », « nous nous dispersons par secteurs » et « il faut poser les boucliers ». ✔
  - La page Wikipédia du CENZUB confirme « le plus grand d'Europe » et Jeoffrécourt = ville de 5 000 habitants. ✔

**Ce qui est un peu trop affirmé**
- « Ouvert en **2004** » : la page Wikipédia citée **ne donne pas** cette date. À vérifier ou enlever.
- « **Monter, localiser et circonscrire** », le bouclier **Ramsès** et les **26–27 balles** ne sont **pas** dans l'audition
  de la BRI : ils viennent sans doute de l'article d'Europe 1. Le document mélange les deux sources dans une même phrase ;
  il faudrait dire quelle phrase vient d'où.
- Les **trinômes 300 / 600** viennent de *Battle Order*, un site d'amateurs (sérieux, mais pas officiel), et d'une
  organisation de **1999**. Il faudrait le marquer [COURANT] plutôt que [RÉEL].
- « 1 défenseur pour 6 attaquants **suffit** à tenir une ville » : formulation à revérifier (d'habitude on dit plutôt qu'il
  **faut** beaucoup d'attaquants par défenseur ; ce n'est pas tout à fait la même idée).
- « France + Royaume-Uni = exactement ta chimie » : l'exemple réel (un officier **traduit** les ordres) parle surtout de
  **langue**, pas vraiment de doctrine. C'est une jolie image, pas une preuve.

**Ce qui ne sert pas encore**
- Environ un tiers de la recherche parle d'**entrer dans des bâtiments** (effracteur, pièces, étages). Le jeu n'a **qu'un
  parking sans intérieur**. Ce n'est pas faux, mais c'est pour bien plus tard.
- **Sujet sensible** : le Bataclan est un exemple de recherche très utile, mais il ne faut **jamais** le citer **dans le
  jeu** (bulles, fiche doctrine, textes). Le document ne le propose pas, je le note par prudence.

### 3.2 Les calculs de la chimie : justes, mais avec des surprises

La formule : chimie d'un opérateur = **moyenne** de ses notes avec les autres. J'ai refait les calculs, y compris des cas
que le document ne teste pas. (F = Français, I = Indien, UK = Britannique, X = un 3e pays éloigné ; F–I = 45, F–UK = 70.)

| Escouade | Chimie de chaque opérateur | Chimie de l'escouade | Retard au départ du bond (le plus lent) | Risque d'erreur par bond (le plus touché) |
|---|---|---|---|---|
| 5 F | 100 | **100** | 0 s | 0 % |
| 3 F + 2 UK | F 85 · UK 77,5 | **82** | 0,23 s | 3 % |
| **4 F + 1 I** | F 86 · **I 45** | **78** | **0,55 s** | **7,3 %** |
| 3 F + 2 I (ton exemple) | F 72,5 · I 59 | **67** | 0,41 s | 5,5 % |
| 2 F + 2 I + 1 X | F 59 · I 59 · **X 45** | **56** | 0,55 s | 7,3 % |
| 5 pays différents | tous 45 | **45** | 0,55 s | 7,3 % |

Les calculs du document (72, 59, 67, 85, 78, 82) sont **justes**. Mais :

1. **Le seul étranger est presque toujours au pire.** Dans « 4 F + 1 I », l'Indien est à 45, c'est-à-dire **92 % de la
   pénalité maximale**, alors que l'escouade a une bonne note (78). Un joueur verra « 78, bonne entente » et un opérateur
   en rouge vif. C'est peut-être ce que tu veux (« surtout chez ceux en minorité »), mais c'est **dur** pour un seul
   opérateur. Avec un Britannique seul (70), c'est la moitié de la pénalité : plus raisonnable.
2. **Le plancher de 40 ne sert à rien** : la note la plus basse du tableau est 45, donc personne ne descend jamais sous 45.
   Il faut soit enlever le « 40 », soit dire « le pire = 45 ».
3. **« La minorité souffre le plus » est vrai sur le papier, mais pas tout à fait sur le terrain.** Dans le code du Tiroir
   (`updateTiroir`), les deux moitiés **ne s'échangent que quand tous ceux qui bougent sont arrivés**. Donc si l'Indien part
   en retard, **toute sa moitié attend**, puis toute l'escouade. Le retard d'un seul **ralentit tout le monde**. Ce n'est
   pas grave, mais il faut le dire honnêtement au joueur.
4. **Le tableau des distances ne parle que de la France.** Pour mélanger un Américain et un Indien, ou un Britannique et un
   Américain, il faut un **tableau complet pays × pays**. Le document ne le donne pas.
5. **Petites escouades (3 opérateurs, autorisé)** : 2 F + 1 I → F 72,5, I 45. Ça marche, rien à changer.

**Est-ce que le joueur le verra ?** Honnêtement : **à peine**, si on ne fait rien pour l'aider.
- Un retard de **0,2 à 0,5 s** au départ d'un bond est **invisible** à la caméra normale.
- Le retard de radio est **invisible** (c'est dans la tête des IA).
- Les erreurs : avec ≈ 6 bonds par opérateur et par bataille (estimation), « 3 F + 2 I » ferait **environ 1 à 2 erreurs par
  bataille**. C'est la **seule** chose qu'on voit vraiment, grâce à la bulle « ? ».
- Un écart de 52 % / 48 % (mélange normal) est **impossible à sentir** pour un joueur.

→ Conclusion : la chimie vivra surtout par **l'affichage** (QG + bulles + bilan de fin). C'est là qu'il faut mettre l'effort,
pas dans des réglages fins que personne ne remarquera.

**Ma proposition plus simple** : 3 niveaux au lieu d'un effet « linéaire » de 100 à 40 :
- **vert — Soudé** (≥ 85) : aucun effet ;
- **orange — Correct** (60–84) : petit retard ;
- **rouge — Mal à l'aise** (< 60) : retard plus grand + de temps en temps une hésitation visible.
C'est plus facile à **expliquer** (« Hawk est orange : il démarre un peu après les autres »), à **tester** et à **régler**.

### 3.3 Les « erreurs de coordination » : attention à la punition au hasard

- **« Départ en retard »** et **« hésitation à la relève »** : très bien. C'est un petit retard, toujours le même, on
  comprend pourquoi. → **à garder**.
- **« Bond hors tour »** (il part avec la mauvaise moitié, son côté n'est plus couvert pendant 1–2 s) : c'est le type
  d'erreur qui **peut faire mourir quelqu'un par pure malchance**. Le document dit « ne peut pas tuer à elle seule », mais
  personne ne peut le garantir : 2 s à découvert devant un tireur, ça suffit. Et en replay, le joueur verra « mon gars est
  mort parce que le dé a dit non ». → **à enlever**, ou à remplacer par un simple retard.
- **« Mauvais secteur »** : n'a de sens **que si** les secteurs (C2) existent. Aujourd'hui tous ceux qui couvrent regardent
  le même point. → **plus tard, avec C2**.
- **« Couvert disputé »** : il existe déjà quelque chose (`spreadGoal`) qui écarte les opérateurs. L'erreur serait presque
  invisible. → **pas utile**.

### 3.4 Le plafond 55 / 45 : raisonnable, mais la façon de le mesurer est fausse

- Le **chiffre** est raisonnable : petit bonus, l'escouade mélangée n'est jamais condamnée. ✔
- **Mais** le document dit qu'on le mesure avec `node outils/equilibre.js`. J'ai lu cet outil : il fait jouer **deux
  escouades identiques sans aucune tactique** (pas de Tiroir !) pour voir si la **carte** avantage un côté. Il **ne peut pas**
  mesurer la chimie :
  - sans Tiroir, la plupart des effets de chimie (retard de bond, erreurs par bond) **ne se déclenchent jamais** ;
  - il n'y a pas d'opérateurs étrangers : il faudrait faire semblant avec les `overrides` (changer le pays d'un GIGN) ;
  - il faut **échanger les côtés** (la carte n'est pas symétrique) ;
  - il faut **beaucoup** de batailles : avec 200 batailles, la marge d'erreur est d'environ ± 7 points, donc on ne peut pas
    distinguer 50 % de 55 %. Il en faut **environ 1 500 par réglage** pour une marge de ± 2,5 points.
  → Il faudra un **petit outil dédié** (une variante d'`equilibre.js`), lancé **une fois, pendant la grosse passe
  d'équilibrage**.
- **Piège caché : « Frères d'armes ».** Aujourd'hui ton escouade (5 GIGN) a **10 % de mise en joue plus rapide**, et le
  Groupe Karst (sans pays) **n'a rien**. Le document propose de remplacer ça par « 5 % si chimie ≥ 80 » **et** de donner au
  Karst une chimie de 85–100. Résultat : **ton bonus est divisé par deux et l'ennemi en reçoit un**. C'est un affaiblissement
  du joueur caché dans un changement d'affichage. En plus, ça contredit la règle « la chimie ne touche pas le tir » (la mise
  en joue, c'est du tir). → **Ne pas toucher à Frères d'armes** tant que la grosse passe d'équilibrage n'est pas faite.

### 3.5 « Le joueur décide, l'IA exécute » : respecté… presque partout

- **D (clic droit)** : bien respecté. Sans ordre, l'IA fait comme aujourd'hui ; avec un ordre, elle obéit jusqu'au bout. ✔
- **C1, C2, C5** : ce sont des **façons d'exécuter** (taille des bonds, où regarder). ✔
- **C5 « méthodique »** : « on localise et on circonscrit avant d'avancer (on s'installe face à la position connue au lieu de
  foncer) ». Là, l'IA **décide** quand s'arrêter et où se poster. C'est à la limite. → garder seulement des **chiffres**
  (bonds plus courts, pauses plus longues), pas une nouvelle décision.
- **C4** : « l'IA en espace ouvert peut **poser** le bouclier » : c'est l'IA qui choisit. À éviter.
- **C3** (traverser à découvert) : l'IA s'arrête d'elle-même au bord. C'est de l'exécution, ça va, mais ça ralentit tout.

### 3.6 Risques d'équilibre cachés

1. **Le clic droit contre un ennemi scripté.** L'ennemi n'a pas de joueur. Or le document cite lui-même : « en ville, un
   défenseur seul peut arrêter une section ». Avec le clic droit, le joueur pourra poster ses 5 opérateurs au meilleur
   endroit et attendre un ennemi en ordre « Assaut » qui fonce dessus. La mission « **Tenir le parking** » pourrait devenir
   **trop facile**. Le délai de 5 s entre deux ordres n'y change rien. → à surveiller dès le premier essai de D-a.
2. **Le bouclier (C4).** « Arrête toutes les balles dans un arc de 90° » : dans la ruelle étroite, le porteur devient
   **invincible de face**, et l'IA ennemie ne sait pas le contourner. Plus : nouvel objet, nouvelles animations (gros
   travail sur `soldat3d.js`), nouveau calcul de touche. C'est le **plus gros risque** et le **plus gros chantier** du
   document, pour un effet qui ne servirait que dans la ruelle. → **à abandonner pour l'instant**.
3. **Les secteurs (C2)** : le champ de vision d'un opérateur fait ≈ 112°. En décalant les guetteurs de ± 35°, l'escouade
   couvre **≈ 180°** au lieu de 112°. Les contournements ennemis seront repérés bien plus tôt. C'est **visible et bien**,
   mais c'est un **vrai** changement de force (pas « moyen-faible »). À mesurer dans la grosse passe.

### 3.7 Ce que le document dit du code : vérifié

| Affirmation | Vrai ? | Détail |
|---|---|---|
| `battle.command('tenir', équipe, {pos, units})` existe | ✔ **Vrai** | Dans `command()` et dans le rejeu (`step()`), appelle `holdKeyPosition()`. Aucun bouton dans `web/app.js` : pas branché à l'interface. |
| 6 positions clés | ✔ mais… | Ce sont **3 paires en miroir** (une par camp), parfois à **1,8 m** l'une de l'autre (station de lavage). En vrai, D-a = **choisir entre 3 endroits** (lavage, ruelle, quai), ce qui ressemble beaucoup à la **rotation de voie** (nord / milieu / sud) qui existe déjà. |
| Tiroir : bonds ≤ 11 m, pas de 8 m sans couvert, échange entre 2,5 s et 10 s | ✔ Vrai | `tiroir()` et `updateTiroir()`. |
| C1 : « un trinôme + un binôme **au lieu de deux moitiés égales** » | ✘ **Déjà le cas** | Les moitiés sont faites un sur deux (`k % 2`) : à 5, c'est **déjà 3 + 2**. Le vrai changement de C1, ce sont les **bonds successifs** (le binôme rejoint au lieu de dépasser). Et l'« appui à mitrailleuse » n'existe pas : tout le monde a le même fusil et le rôle « assaut ». |
| Radio : « retard 0,5 s actuel » | ≈ Approximatif | La radio passe **toutes les 1 s** ; le 0,5 s n'est pas un retard mais un **seuil** (« je ne remplace mon info que si la tienne est plus récente d'au moins 0,5 s »). Passer à 1,5 s changerait peu de chose, et rien de visible. |
| D-b : « même mécanique que `followKeyOrder`, mais le trajet passe par la doctrine (Tiroir) » | ✘ **Contradiction** | `followKeyOrder` passe **avant tout** dans `decide()` et marche **tout droit** vers le point, **sans** Tiroir. Et le Tiroir n'a qu'**un seul état pour toute l'escouade** (`team.bound`). Envoyer 2 opérateurs ailleurs en Tiroir pendant que les 3 autres continuent demande un Tiroir **par groupe** : c'est plus que « moyen ». |
| Sélection par touches 1 et 2 | ✘ **Conflit** | 1, 2, 3 règlent déjà la **vitesse du jeu** (×1, ×2, ×4). |
| Clic droit + glisser = caméra | ✔ Vrai | `cameraControls()`. L'idée « clic sans bouger = ordre » est bonne. |
| Karst sans pays (`nationOf` = null) | ✔ Vrai | |
| Effets du Tiroir sur l'escouade du joueur | ⚠ Oublié | Le Tiroir est une **carte tactique** (équipée par défaut, mais on peut l'enlever) et il est **coupé** en ordre « Tenir ». Sans Tiroir, presque toute la chimie (retards de bond, erreurs par bond) **disparaît**. |

### 3.8 Le contenu nouveau glissé dans le document

Rappel de ta règle : **aucune mécanique sans ton accord**. Le document le respecte en général (il marque « à approuver »),
mais certaines choses nouvelles sont présentées comme de simples réglages :
- **L'habitude** (+1 toutes les 3 batailles ensemble, jusqu'à +15) : c'est un **nouveau système de progression**, avec
  sauvegarde à modifier. Et il faut **45 batailles** pour le maximum, alors qu'un contrat d'opérateur dure 12 à 16 missions :
  quasiment personne n'y arrivera, et ça pousse à ne **jamais** changer d'escouade. → **à laisser de côté**.
- **Le bilan de fin** (« bonds coordonnés : 14 »), les **cônes au sol**, la **fiche doctrine** : nouveaux éléments
  d'interface. Bien, mais chacun à approuver.
- **Les erreurs tirées au hasard** : c'est une mécanique à part entière, pas un réglage.

### 3.9 Ce qui manque

1. **Le Groupe Karst** : quelle doctrine, quelle chimie ? Le document dit « neutre, 85–100 » sans le justifier. (Idée à
   te soumettre, pas à imposer : une société militaire privée, c'est justement une équipe **mélangée**… mais c'est à toi de
   décider.)
2. **Le coût de l'écran du QG** : l'escouade s'affiche en **5 cartes alignées** (`renderSquad`). Dessiner **10 liens** de
   couleur entre 5 cartes en ligne, c'est illisible. Plus simple : **une pastille de couleur sur chaque carte** + la note
   d'escouade à côté de la note d'équipe.
3. **Une seule règle de calcul** : aujourd'hui, la règle « même pays » est **écrite deux fois** (dans `engine.js` et dans
   `game.js`). Pour la chimie, il faut **une seule fonction** partagée par le QG et la bataille, sinon le QG affichera un
   chiffre et la bataille en utilisera un autre.
4. **Les replays** : chaque tirage au hasard de la chimie décale **tous les tirages suivants** de la bataille. Les revues
   restent justes, mais **toutes** les batailles changent, même 5 GIGN contre Karst. → Utiliser **un dé à part** pour la
   chimie (un second générateur tiré de la graine). Bonus : avec une chimie de 100, la bataille reste **exactement** la même
   qu'aujourd'hui. C'est un **test automatique** gratuit : « 5 GIGN = résultat identique à avant ».
5. **Les tests** : la formule de chimie doit avoir un petit test (`tests/game.js` en a déjà un pour Frères d'armes).
6. **Les écrans sur tablette / tactile** : il n'y a pas de clic droit. Si le jeu doit marcher au doigt un jour, prévoir
   l'appui long.
7. **Le tutoriel** (`web/index.html`) cite les synergies : à mettre à jour si la chimie remplace Frères d'armes.

### 3.10 Classement : quoi faire, quoi changer, quoi abandonner

**À faire en premier** (le plus visible pour toi, le moins risqué), **si tu dis oui** :

1. **D-a, le clic droit sur les positions clés** — c'est **ta** demande n° 1, le moteur est prêt, les revues restent
   identiques. Escouade entière d'abord, pas de touches 1 / 2. Petit essai pour sentir si « clic droit + l'IA se débrouille »
   te plaît. Prévoir tout de suite la suite (D-b) car 3 endroits, c'est peu.
2. **C2 (secteurs) + C5 (rythme méthodique / dynamique, en chiffres seulement)** — on **voit** la différence (des gars qui
   regardent chacun leur côté), pas de nouveau contenu, c'est une amélioration du Tiroir.
3. **A (la fiche doctrine)** — invisible seule, mais c'est la « tuyauterie » nécessaire à C2 et C5 : à faire **en même
   temps**, pas avant.

**À faire plus tard, et en plus simple** :

4. **B (chimie)** — **seulement quand il y aura des opérateurs d'un 2e pays** (sinon elle vaut toujours 100). Version
   simple : 3 niveaux de couleur, retards fixes (pas de hasard qui tue), Meneur comme seul bonus, Frères d'armes intact
   jusqu'à la grosse passe, un dé à part pour les replays, une pastille par carte au QG.
5. **D-b (clic droit n'importe où)** — avec un vrai **Tiroir par groupe** ; coût plus élevé que ce que dit le document.
6. **E (bulles en français)** — bon rapport effort / effet, les bulles existent déjà. Le bilan de fin, plus tard.

**À changer** :
- C1 : ce n'est pas « 3 + 2 au lieu de moitiés égales » (c'est déjà 3 + 2) ; garder seulement l'idée des **bonds successifs**.
- Le plancher « 40 » → « 45 ».
- La mesure « `equilibre.js` » → un outil dédié, côtés échangés, ≈ 1 500 batailles par réglage, pendant la grosse passe.

**À abandonner (pour l'instant)** :
- **C4, le bouclier** : énorme chantier, gros risque, utile seulement dans la ruelle.
- **Le « bond hors tour »** : punition au hasard.
- **Le retard de radio selon la chimie** : invisible.
- **L'habitude** et le trait **Liaison** : nouveau contenu, peu d'effet visible.
- **C6 (relève des rôles)** : il n'y a pas encore de rôles de formation (pas de bouclier, pas de serre-file), donc rien à relever.
- **C3 (traverser à découvert)** : intéressant mais coûteux ; à revoir après C2 / C5.

---

## 4. En une phrase

Le document est **sérieux et honnête** sur ses sources, et l'idée « la doctrine change la **façon de bouger**, pas la
précision » est la bonne ; mais la chimie, telle quelle, serait **invisible aujourd'hui** (il n'y a que des Français),
**presque invisible ensuite** (retards d'une demi-seconde), cache un **affaiblissement** de ton escouade (Frères d'armes), et
le gros morceau (le bouclier) est le plus risqué pour le moins de gain. Commencer par **le clic droit** et **les secteurs**,
garder la chimie pour le jour où un 2e pays arrive.
