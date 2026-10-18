# Résultats du PC — 19/10/2026 01:05

**Commit de main testé : `4101218`** — 2026-10-18 23:00:29 +0000 — « Travail en cours des agents (sources) »

Déclenché par 4 fichier(s) modifié(s) depuis `580589a` : `web/app.js`, `web/rendu.js`, `web/ruelle.js`, `web/soldat3d.js`

## Tests

- ✅ `node build.js` : réussi
- ✅ `tests/verify.js` : réussi (79/79)
- ✅ `tests/ia.js` : réussi (30/30)
- ✅ `tests/voies.js` : réussi (19/19)
- ✅ `tests/game.js` : réussi (83/83)
- ✅ `tests/league.js` : réussi (10/10)
- ✅ `tests/verif_page.py` : réussi (56/56)

## Erreurs de la console

- aucune erreur JavaScript ni `console.error` (hors ressources manquantes)
- 2 ressource(s) introuvable(s) (404) : `/docs/p/cannon-es.js?v=548025ed5d`, `/docs/p/three-addons.js?v=b2f534370d`

---

## Détail

- Moteur WebGL obtenu par Chromium : `ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti (0x00002C05) Direct3D11 vs_5_0 ps_5_0, D3D11)` ; Playwright 1.64.0
- Machine : Windows 11, NVIDIA GeForce RTX 5070 Ti (WebGL matériel : ANGLE / Direct3D 11 via `pc/lanceur_gpu.py`), Node v24.20.0, Python 3.12.10
- `node build.js` : page légère (dist/index.html, docs/index.html, dist/artifact.html) : 350 Ko ; dist/complet.html : 14.5 Mo
- `web/hd/` (non versionné) reconstitué à partir des 34 fichiers versionnés de `docs/hd/` avant le build. Sans cela, `build.js` supprime de `docs/hd` tout ce qui manque dans `web/hd` : sur une copie neuve du dépôt, le build vide `docs/hd` (et un commit fait ensuite retirerait la HD du site publié).

### Tests

| commande | code | durée | dernière ligne |
|---|---|---|---|
| `node tests/verify.js` | ✅ 0 | 28 s | 79/79 vérifications réussies |
| `node tests/ia.js` | ✅ 0 | 11 s | 30/30 vérifications réussies (1 mises de côté : fonctions désactivées) |
| `node tests/voies.js` | ✅ 0 | 1 s | 19/19 vérifications réussies |
| `node tests/game.js` | ✅ 0 | 2 s | 83/83 vérifications réussies (8 mises de côté : fonctions désactivées) |
| `node tests/league.js` | ✅ 0 | 43 s | 10/10 vérifications réussies (1 mises de côté : fonctions désactivées) |
| `python tests/verif_page.py "http://127.0.0.1:8765/dist/index.html?fx=0&hd=0"` | ✅ 0 | 70 s | 56/56 vérifications réussies |

### Rendus (carte graphique)

| rendu | code | durée | dernière ligne |
|---|---|---|---|
| revue des animations (`revue.py revue`, 2 modèles × tous les états) | ✅ 0 | 61 s | 2269 OK, 264 mineurs, 260 majeurs → revue\rapport.md |
| mesures de rendu (`pc/mesures.py` : 3 configurations × 3 vues) | ✅ 0 | 59 s | simple_leger {"chargement_s": 4.4, "chargement_complet_s": 5.5, "ressources_manquantes": [], "erreurs_page": [], "console_erreurs": [], "maillages_visibles": 497, "triangles_scene": 1016871, "debut_ensemble": {"ms_moyen": 9.37, "ms_median": 9.3, "ms_p95": 11.7, "ips_equivalent": 107, "largeur": 1920 |
| captures de la carte et aperçus des états : sautés (derniers il y a 29 min, dans `2026-10-19_00-28/` ; une fois par heure environ, `--captures` pour forcer) | — | 0 s | — |

### Mesures du rendu (RTX 5070 Ti, 1920×1080, page `docs/index.html`, carte parking, graine 3)

Temps réel d'une image = `API.render()` + attente de la carte graphique (`readPixels`), 60 images, moyenne / p95.

| configuration | triangles (scène) | maillages | début, ensemble | t = 40 s, ensemble | t = 40 s, épaule | chargement |
|---|---|---|---|---|---|---|
| `complet_hd` | 2 017 944 | 847 | 14.13 ms (71 i/s)  p95 17.2 | 20.59 ms (49 i/s)  p95 24.6 | 23.26 ms (43 i/s)  p95 27.2 | 4.3 s |
| `simple_hd` | 2 017 944 | 847 | 9.1 ms (110 i/s)  p95 11.3 | 15.3 ms (65 i/s)  p95 19.8 | 13.31 ms (75 i/s)  p95 17 | 5.9 s |
| `simple_leger` | 1 016 871 | 497 | 9.37 ms (107 i/s)  p95 11.7 | 9.79 ms (102 i/s)  p95 11.7 | 9.92 ms (101 i/s)  p95 13.1 | 4.4 s |

Ressources manquantes (2) :

- `échec /docs/p/cannon-es.js?v=548025ed5d`
- `échec /docs/p/three-addons.js?v=b2f534370d`

### Revue des animations

- Total : 2269 OK, 264 mineurs, 260 majeurs (sur 2793 vérifications).
- Détail complet (scores par état, défauts triés, preuves) : [revue/rapport.md](revue/rapport.md)

### Captures de la carte

- Pas de nouvelles captures ce cycle : voir [`../2026-10-19_00-28/carte/`](../2026-10-19_00-28/carte/).

### Journaux

Sortie complète de chaque commande : `logs/` (un fichier par étape).

Durée totale du cycle : 4.7 min.
