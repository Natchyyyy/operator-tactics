# État du projet — point au 20/10/2026 (version jouable 46)

## 1. Ce qui a été fait (17 → 20 octobre)

### Animations (mises en pause le 19/10)
- Passe « AAA » : défauts graves mesurés 402 → 1 (banc de 3324 contrôles), pieds réparés (bottes « elfe »).
- Pause décidée : les animations viendront du **motion matching** (`prototypes/motion-matching/`, autre conversation).
  Restes notés dans `A_FAIRE.md` (« Animations — en pause »).

### Caméra et nuit
- Caméra « réalisateur » : presque jamais dans les murs (~1 %). Nuit sombre mais lisible, liseré de lune sur les soldats.

### Ordres du joueur (clic droit, menu carré façon SWAT 4, souris seulement)
- **Déplacement** : Méthodique · Agressif · Franchir · Décrocher (+ option « Avec fumée » pour Franchir/Décrocher).
- **Arrivée** : Tenir la position (360°, serre-file malin) · Encercler · Reprendre la manœuvre · Fouiller (dans « Plus… »).
- **Feu** : À volonté (revient après chaque ordre) · Retenu (main orange sur la carte du soldat → « Feu ! ») · Appui.
- **Orienter la position** : après « Confirmer », éventail orange qui suit la souris en douceur ; clic = côté surveillé.
- **Grenades sur ordre** (« Plus… » → Lancer ici) : grenade, flash, fumée — 1 de chaque par opérateur ; l'IA en lance
  aussi seule.
- **Points de passage** : Maj + clic droit (2 au plus). La carte « Rotation » est cachée (`SHOW_ROTATION = false`).
- **Groupes G1 / G2** à côté de « Tous ». Réglage « Ordres avancés » (Oui par défaut).
- **Cartes de tactique** : Fixer et déborder (active, touche A), Éclaireur et Tiroir lent (passives), en plus du Tiroir,
  Tenailles, Rush milieu.

### Combat et IA
- Fusillades plus décisives : mort à découvert ~1 s (médiane), séries de ratés à bout portant −74 %, couverts protègent
  beaucoup plus (partiel ×0,28, total ×0,12), on se baisse entre les rafales.
- Sprint vers un couvert sous la menace, pas de demi-tour absurde, relève des blessés en « Tenir ».
- **Évacuation des blessés** : un équipier tire le blessé à reculons (60 % de vitesse, sans tirer) jusqu'au couvert,
  fumigène si l'ennemi voit le blessé (pas encore d'animation).
- **Brouillard de guerre** : un ennemi est invisible tant qu'aucun opérateur ne le voit (réglage, activé par défaut).
- **Plans du Groupe Karst** (ennemi seulement) : un plan par bataille — embuscade, contournement, repli — et réactions
  aux flashs et aux fumées. Équilibre IA contre IA : 50,5 % pour le joueur. Recherche de fin de bataille plus maligne.

### Carte (parking de la Grand-Rue)
- Côté gauche (nord, la ruelle) **fermé** par une ligne continue (garage, palissade, atelier, quai, tôle, entrepôt) ;
  on n'y entre que par 3 passages (bout ouest, bout est, porche au milieu). Ruelle plus étroite, carte moins symétrique.
- Équilibre entre les deux côtés vérifié (~50/50 avec équipes identiques).

### Graphismes (nuit du 19 au 20/10)
- Lumière et étalonnage refaits, ciel plus bleu, occlusion ambiante plus large, rayons de soleil discrets.
- **Textures scannées Poly Haven (CC0)** : bitume, béton, trottoirs, brique, écorce, ciel de ville (`web/pbr.js`,
  `web/hd/pbr_*.jpg`, crédits dans `THIRD_PARTY.md`) ; textures procédurales gardées en secours (`?hd=0`).
- Fenêtres avec vraies pièces en perspective (allumées la nuit), façades en relief (retraits, appuis, corniches).
- Peinture vernie des voitures, halos des lampadaires, ombre de contact et liseré de lumière sous/sur les soldats.
- Arbres et haies refaits (`web/arbres.js`) : feuillages denses, lumière à travers les feuilles, vent.

### Divers
- Police « OT Display » (zéro sans barre), menus et HUD polis, traceurs de balles enfin visibles.
- Test de la page : clique sur tous les panneaux de récompenses.

### 20/10 (version 46) — après la recherche Gemini
- Couverts : le trajet compte (chaque mètre couru en vue de la menace coûte plus cher) ; temps passé en vue de l'ennemi en
  baisse d'environ 10 % sur 24 batailles de jour.
- Voitures : la tôle laisse passer 1 balle sur 6 (blessure ×0,5, jamais la tête) ; le bloc moteur (côté capot) arrête tout.
- Groupe Karst : mémoire du danger (là où un des siens est tombé ou a été aveuglé : chemins qui contournent, arme pointée).
- Décor : lampadaires (de nuit, on se voit presque comme de jour dessous ; « Plus… → Éteindre le lampadaire »),
  alarmes de voiture (à la 3e balle : sirène et feux 25 s, couvre les pas), vitres de voitures qui se fendent.
- Top action (« Ordres avancés ») : « ⏸ Attendre le top » dans le menu d'ordre, bouton TOP en bas pour tout lancer.
- Refusé / plus tard : bonus par pays, se jeter au sol, refonte des effets, éclairage pré-calculé, lampes et lasers
  sur les armes (plus tard), packs de soldats (plus tard), KTX2 (pas maintenant).

## 2. Choix validés par l'utilisateur (à respecter)
- Stratégie = le joueur. L'IA exécute ; plans automatiques seulement pour l'ennemi.
- Pas de nouvelle mécanique sans accord. Les agents peuvent améliorer l'existant.
- Pas de stats qui décident (« persos identiques ») pour l'instant ; grande passe d'équilibre plus tard, en une fois.
- Entente d'équipe façon FIFA (doctrine par pays) : seulement quand un 2e pays existera (Royaume-Uni ensuite) ; petit
  bonus de coordination seulement, la minorité paie, ennemi à entente maximale, pas de voix (bulles de texte).
- Une flash par opérateur ; grenades sur ordre en plus des grenades lancées par l'IA.
- Bouclier, mission otages, 2e carte, vision nocturne, drone : plus tard (vague 3 de `strategies_gign.md`).
- Animations : en pause, motion matching à la place.
- Accès réseau ouvert pour `polyhaven.com`, `dl.polyhaven.org`, `api.polyhaven.com` (ambientcg.com coupe la connexion).
- Peu d'agents en parallèle (crédits).

## 3. Ce qu'il reste à faire
**Proches**
1. Retour de l'utilisateur sur la version 46 (beauté, fluidité sur son PC, arbres qui cachent parfois les soldats ;
   nuit plus lisible sous les lampadaires : équilibre à surveiller).
2. Couverts : premier pas fait (trajet exposé pénalisé) ; la part du temps en vue passée à courir vers un couvert reste
   ~25 % : à revoir si le joueur le remarque encore.
3. Batailles d'élimination parfois longues (24/200 dépassent 3 min) : échanges lents à 1 contre 2-3.
4. Petits défauts : noms d'ennemis qui se chevauchent ; caméra automatique qui filme parfois un mur pendant un combat ;
   pas d'aperçu de la trajectoire des grenades, un soldat hors de portée ne s'avance pas pour lancer.
5. Grande passe d'équilibre (GIGN/Karst, seuil du test « au contact, derrière un vrai couvert » abaissé 45 → 39 %).

**Graphismes, suite**
6. Soldats : les modèles Meshy restent la limite ; la vraie solution est un pack de soldats professionnel acheté par
   l'utilisateur (Fab, Sketchfab…, licence jeu web, sans vrais insignes), à brancher sur le motion matching.
7. Haies encore un peu grumeleuses de très près ; objets Poly Haven seulement s'ils battent clairement l'existant.

**Plus tard (vague 3 de `strategies_gign.md`)**
8. Discret, défense mobile, feinte ; bâtiments / effraction / points hauts (2e carte), colonne, bouclier ; mission
   otages, vision nocturne, drone ; entente d'équipe à l'arrivée du 2e pays.
9. Animations : intégrer le motion matching (traîner un blessé, sprint en reculant — la jambe arrière part trop haut).
