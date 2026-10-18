# Résultats du PC — 19/10/2026 00:40

**Commit de main testé : `580589a`** — 2026-10-18 22:36:59 +0000 — « Travail en cours des agents (sources) »

Déclenché par 1 fichier(s) modifié(s) depuis `156da5f` : `web/soldat3d.js`

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

---

## Détail

- Moteur WebGL obtenu par Chromium : `ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti (0x00002C05) Direct3D11 vs_5_0 ps_5_0, D3D11)` ; Playwright 1.64.0
- Machine : Windows 11, NVIDIA GeForce RTX 5070 Ti (WebGL matériel : ANGLE / Direct3D 11 via `pc/lanceur_gpu.py`), Node v24.20.0, Python 3.12.10
- `node build.js` : page légère (dist/index.html, docs/index.html, dist/artifact.html) : 350 Ko ; dist/complet.html : 14.5 Mo
- `web/hd/` (non versionné) reconstitué à partir des 34 fichiers versionnés de `docs/hd/` avant le build. Sans cela, `build.js` supprime de `docs/hd` tout ce qui manque dans `web/hd` : sur une copie neuve du dépôt, le build vide `docs/hd` (et un commit fait ensuite retirerait la HD du site publié).

### Tests

| commande | code | durée | dernière ligne |
|---|---|---|---|
| `node tests/verify.js` | ✅ 0 | 27 s | 79/79 vérifications réussies |
| `node tests/ia.js` | ✅ 0 | 10 s | 30/30 vérifications réussies (1 mises de côté : fonctions désactivées) |
| `node tests/voies.js` | ✅ 0 | 1 s | 19/19 vérifications réussies |
| `node tests/game.js` | ✅ 0 | 2 s | 83/83 vérifications réussies (8 mises de côté : fonctions désactivées) |
| `node tests/league.js` | ✅ 0 | 36 s | 10/10 vérifications réussies (1 mises de côté : fonctions désactivées) |
| `python tests/verif_page.py "http://127.0.0.1:8765/dist/index.html?fx=0&hd=0"` | ✅ 0 | 57 s | 56/56 vérifications réussies |

### Rendus (carte graphique)

| rendu | code | durée | dernière ligne |
|---|---|---|---|
| revue des animations (`revue.py revue`, 2 modèles × tous les états) | ✅ 0 | 50 s | 2257 OK, 261 mineurs, 275 majeurs → revue\rapport.md |
| mesures de rendu (`pc/mesures.py` : 3 configurations × 3 vues) | ✅ 0 | 37 s | simple_leger {"chargement_s": 3.2, "chargement_complet_s": 4.2, "ressources_manquantes": [], "erreurs_page": [], "console_erreurs": [], "maillages_visibles": 497, "triangles_scene": 1016871, "debut_ensemble": {"ms_moyen": 5.54, "ms_median": 5.5, "ms_p95": 6.8, "ips_equivalent": 181, "largeur": 1920, |
| captures de la carte et aperçus des états : sautés (derniers il y a 5 min, dans `2026-10-19_00-28/` ; une fois par heure environ, `--captures` pour forcer) | — | 0 s | — |

### Mesures du rendu (RTX 5070 Ti, 1920×1080, page `docs/index.html`, carte parking, graine 3)

Temps réel d'une image = `API.render()` + attente de la carte graphique (`readPixels`), 60 images, moyenne / p95.

| configuration | triangles (scène) | maillages | début, ensemble | t = 40 s, ensemble | t = 40 s, épaule | chargement |
|---|---|---|---|---|---|---|
| `complet_hd` | 2 599 555 | 502 | 12.28 ms (81 i/s)  p95 13.7 | 12.43 ms (80 i/s)  p95 13.9 | 11.15 ms (90 i/s)  p95 13.3 | 3.4 s |
| `simple_hd` | 2 017 944 | 847 | 5.66 ms (177 i/s)  p95 6.8 | 8.6 ms (116 i/s)  p95 10 | 7.52 ms (133 i/s)  p95 8.2 | 3.1 s |
| `simple_leger` | 1 016 871 | 497 | 5.54 ms (181 i/s)  p95 6.8 | 6.47 ms (154 i/s)  p95 7.6 | 5.69 ms (176 i/s)  p95 6.3 | 3.2 s |

### Revue des animations

- Total : 2257 OK, 261 mineurs, 275 majeurs (sur 2793 vérifications).
- Détail complet (scores par état, défauts triés, preuves) : [revue/rapport.md](revue/rapport.md)

### Captures de la carte

- Pas de nouvelles captures ce cycle : voir [`../2026-10-19_00-28/carte/`](../2026-10-19_00-28/carte/).

### Journaux

Sortie complète de chaque commande : `logs/` (un fichier par étape).

Durée totale du cycle : 3.8 min.
