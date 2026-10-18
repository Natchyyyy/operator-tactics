---
name: revue-animation
description: Revue « AAA » des animations de personnages (soldats, armes, marche, course, couverture) : mesures automatiques comparées aux gestes réels (manuels militaires, biomécanique de la marche) et planches d'images qui prouvent chaque défaut. À utiliser quand on veut savoir si une animation « a du sens », comparer avant / après une retouche, ou envoyer une liste de défauts précise à un animateur. Valable pour le jeu navigateur three.js ; la méthode s'applique aussi à Unreal Engine 5.
---

# Revue d'animation

## Quand l'utiliser
- On demande si une pose ou une démarche « a du sens », si elle est « réaliste », « AAA ».
- Après chaque retouche d'animation, pour vérifier qu'on a corrigé sans rien casser ailleurs.
- Avant d'envoyer du travail à un animateur, humain ou agent : la liste de défauts doit être chiffrée et prouvée.

## Le principe en 4 phrases
1. On fait jouer au personnage **chaque état du jeu** : repos, patrouille, visée, pas chassés, recul, course, accroupi, rechargement, tir, pivot, départ / arrêt.
2. Un programme **mesure** les os, le maillage et l'arme à chaque image, puis compare à des **valeurs réelles** sourcées (voir `RUBRIQUE.md`).
3. Chaque mesure reçoit un verdict : **OK / mineur / majeur**, avec l'**image** qui le prouve.
4. On **regarde toujours les images** avant d'affirmer un défaut : une mesure peut se tromper, une image bien cadrée non.

## Étapes

### 0. Préparer (une fois)
- Serveur local : `cd /home/claude/operator-tactics && python3 outils/serveur.py . 8765` (en arrière-plan).
- Machine lente (rendu logiciel, 2 processeurs) : un seul outil de capture à la fois, et des petites images.

### 1. Mesurer sur le banc (rapide, environ 3 min pour 2 modèles × 29 états)
```
python3 outils/revue/revue.py revue --sortie captures/revue/NOM
```
- Options : `--etats patrouille,accroupi` (quelques états seulement), `--modeles gign`, `--preuves 14` (nombre de planches de preuve).
- Résultat : `captures/revue/NOM/rapport.md`, soit les scores par état puis les défauts triés (haut / bas du corps), chacun avec la valeur mesurée, la zone attendue, la raison réelle, la source et le chemin de l'image de preuve.
- Tableau compact : `python3 outils/revue/matrice.py captures/revue/NOM/rapport.json --partie haut` (ou `bas`, ou `--critere id1,id2`).

### 2. Voir (obligatoire)
```
python3 outils/revue/revue.py planche --etat patrouille --vues face,profil,dessus,mainD,mainG,pieds --n 4 --marques
```
- Vues : `face profil profilG dos troisQuarts dessus`, mains `mainD mainDdessous mainDdessus mainG mainGdessous mainGcote`, arme seule `armeD armeG`, pieds `pieds piedsFace piedsProfil`, tête et épaule `tete teteDessus epaule`.
- `--marques` ajoute des points de couleur : vert = poignée, jaune = détente, cyan = garde-main, orange = plaque de couche, rose = creux de l'épaule, rouge / bleu = talon, plante et bout des pieds gauche / droit.
- Ouvrir l'image, puis **zoomer** (recadrer avec PIL) sur chaque main, chaque pied et la tête. Chercher : doigts dans l'arme ou dans le vide, poignet cassé, crosse hors de l'épaule, œil pas derrière le viseur, canon pas sur la cible, pied dans le sol ou en l'air, jambes croisées, genou à l'envers, buste en arrière.

### 3. Vérifier dans une vraie partie (la vérité du terrain)
```
python3 outils/revue/jeu.py --pas 900 --preuves 6 --sortie captures/revue/jeu_NOM
```
- Ce que ça donne : quelle part du temps chaque état occupe vraiment (et à quelle vitesse, avec quelle animation), les mêmes mesures sur chaque soldat et chaque image, et des gros plans rendus des pires cas (2e passe identique grâce à la graine).
- Toujours commencer par la **répartition** : les plaintes du joueur portent sur ce qu'il voit le plus souvent.
  - Exemple : la « marche de patrouille » était en fait un petit trot à 2 m/s, présent 34 % du temps.
  - Exemple : la couverture (accroupi) occupait 24 % du temps.

### 4. Écrire la liste pour l'animateur
Une liste par personne (haut du corps / bas du corps), **les pires défauts en premier**. Pour chaque défaut :
- l'état et le modèle concernés ;
- la valeur mesurée et la zone attendue ;
- la raison dans la vraie vie, avec la source ;
- le chemin de l'image de preuve ;
- si possible, une piste de correction.

Ajouter ce qui va déjà bien, pour qu'il n'y touche pas. Dire honnêtement ce qui est encore « préliminaire ».

### 5. Après une retouche
```
python3 outils/revue/revue.py revue --sortie captures/revue/NOM2
python3 outils/revue/revue.py comparer captures/revue/NOM/rapport.json captures/revue/NOM2/rapport.json
```
- `comparer` liste ce qui s'est **amélioré** et surtout les **régressions** : un défaut corrigé ne doit pas en créer un autre ailleurs.
- Regarder la planche de l'état corrigé **et** des états voisins (la marche visée et le pas chassé partagent des couches).

## Rubrique (résumé, détail et sources dans RUBRIQUE.md)
- **Pieds** : posés SUR le sol (± 1,5 cm), immobiles en appui (glissement < 6 cm/s), jamais croisés, 8 à 17 cm d'écart en marche, pointe dans le sens de la marche (5-10° ouverte).
- **Pas** : longueur ≈ √(vitesse × 0,39) m (1,35 m/s → 0,72 m, 113 pas/min) ; course 150-185 pas/min ; genou presque tendu à la pose en marche (≈ 5°), ≈ 20° en course ; jamais en hyperextension.
- **Posture de tir** : pieds à largeur d'épaules, pied du côté du tir en retrait, genoux un peu fléchis (10-25°), buste penché en avant (5-20°), épaules carrées.
- **Arme** : crosse dans le creux de l'épaule, joue sur la crosse, œil derrière le viseur, canon sur la cible (< 2,5°), arme droite (pas de roulis).
- **Mains** : main forte haute sur la poignée, 3 doigts enroulés, **index tendu le long de la carcasse tant qu'on ne tire pas** ; main d'appui sur le garde-main, doigts qui l'entourent ; aucun doigt dans l'arme ; poignets pas cassés (< 55°).
- **Garde basse / patrouille** : crosse dans l'épaule, canon 15 à 45° vers le bas **dans la direction de marche** ; jamais pointé sur soi ni en travers vers les coéquipiers.
- **Couvert** : à genou ou bien accroupi, arme vers la menace, on tire autour du couvert, pas par-dessus.
- **Tête** : regarde là où pointe l'arme ; stabilisée mais pas soudée (bouge un peu à chaque pas).
- **Fluidité** : aucun pic d'accélération angulaire (saccade d'une image) ; transitions sans pied qui patine.

## Pièges
- **Une mesure n'est pas une preuve** : capsules, creux d'épaule, œil et détente sont des estimations. Toujours regarder l'image avant d'envoyer un défaut, et dire « estimé » quand c'en est un.
- **Noms d'os** : dans les modèles Meshy, les doigts sont souvent mal nommés. On les reconnaît par leur position (le pouce est le plus près du poignet).
- **Banc ≠ jeu** : le banc choisit les vitesses. Vérifier avec `jeu.py` les vitesses et états réels, sinon on corrige une démarche que personne ne voit.
- **Instants de planche** : éviter de prendre des instants espacés d'un cycle exact, sinon on voit deux fois la même pose.
- **Machine partagée** : une seule capture à la fois, petites tailles (200-300 px par case).
- **Ne pas sur-noter** : un faux positif répété fait perdre la confiance de l'animateur. Retirer ou corriger le critère tout de suite.

## Adapter à Unreal Engine 5
La rubrique, les seuils et les sources restent les mêmes. Seuls les outils changent.
- **Banc** : une carte de test avec un personnage par état, joués par l'AnimBP réel. Des caméras fixes (face, profil, dessus, gros plans mains et pieds) rendues avec Movie Render Queue ou `HighResShot`, assemblées en planche (Python + PIL).
- **Mesures** : un script Python éditeur (`unreal` module) ou un Blueprint utilitaire qui lit chaque image, via `GetSocketLocation` et `GetBoneTransform` du SkeletalMeshComponent, les mêmes points : semelle (sockets talon et pointe), doigts, poignée, détente et plaque de couche (sockets sur l'arme), œil.
  - Distance doigt ↔ arme : `GetClosestPointOnCollision` ou une requête de distance sur le maillage de l'arme.
  - Exporter en JSON, puis réutiliser `rubrique.py` tel quel (mêmes clés de mesures).
- **En jeu** : enregistrer une partie (Rewind Debugger, ou un composant qui écrit les mêmes mesures). Mêmes règles : la répartition des états d'abord, ensuite les pires cas.
