# Bugs à régler

Liste des bugs signalés, avec leur état. Un bug corrigé reste noté (avec la version) jusqu'à ce que l'utilisateur
confirme en jeu qu'il a disparu.

## Ouverts

_(aucun pour l'instant)_

## Corrigés — à confirmer en jeu

### 1. Soldat « figé » après une réanimation (signalé le 22/10, corrigé en v62)
- **Ce qu'on voyait** : après une relève, le blessé (ou celui qui le relevait) ne bougeait plus à l'écran.
- **Cause** : la simulation relevait le blessé pendant que l'animation (motion matching) en était encore à le traîner,
  le poser ou se placer à son flanc. Le soldat affiché attendait la fin de gestes qui n'arrivaient jamais : le blessé
  restait couché pour toujours, et les deux soldats affichés restaient plantés pendant que les vrais repartaient
  (puis « sautaient » plusieurs mètres plus loin).
- **Correction** :
  - affichage (`web/mm_jeu.js`) : si le sauveteur affiché n'est pas déjà en train de réanimer quand la simulation dit
    « relevé », le blessé se relève tout de suite ; garde-fou : relevé dans la simulation mais encore couché à l'écran
    plus d'une seconde → relevé direct ;
  - simulation (`sim/engine.js`) : 2 s pour poser le corps et se placer avant la réa après un traînage ; le relevé reste
    immobile 3,2 s pendant qu'il se relève (état « Se relève »), le sauveteur 0,6 s ;
  - une réa derrière un obstacle n'est plus interrompue par un ennemi simplement aperçu au loin (seulement par des
    balles ou un ennemi tout près) : le sauveteur ne recommence plus « Je le tire à couvert ! » en boucle.
- **Mesure** : sur 13 batailles jouées avec l'affichage, plus aucun soldat ne reste figé plus de 3 s après une relève
  (avant : jusqu'à 15 s et plus, blessé couché pour toujours).

### 2. Réanimé sur place au lieu d'être tiré derrière un obstacle (signalé le 22/10, corrigé en v62)
- **Ce qu'on voyait** : avec un fumigène, le sauveteur relevait le blessé là où il était tombé.
- **Cause** : la fumée comptait comme un abri (elle cache la vue de l'ennemi).
- **Correction** : pour décider s'il faut traîner le blessé et où, seuls les vrais obstacles comptent ; la fumée sert
  à couvrir le trajet, puis le blessé est traîné derrière un obstacle avant d'être relevé.
