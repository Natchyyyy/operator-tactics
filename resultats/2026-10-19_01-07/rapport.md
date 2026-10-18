# Résultats du PC — 19/10/2026 01:07

**Demande simulée sur le PC** (essai du mode « sur demande » : ce n'est PAS une demande du coordinateur) :

> captures de nuit

**Commit testé : `4101218`** — 2026-10-18 23:00:29 +0000 — « Travail en cours des agents (sources) »

Étapes faites : build, captures de la carte (`outils/capture.py`, `?hd=1`) — captures : nuit. Non demandées : tests, revue des animations, aperçus des états, mesures de rendu.

## Tests

- ✅ `node build.js` : réussi
- tests non demandés

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

### Rendus (carte graphique)

| rendu | code | durée | dernière ligne |
|---|---|---|---|
| captures de la carte, nuit (8 vues : 3 d'ensemble, 4 au sol, bataille à 40 s ; ?hd=1) | ✅ 0 | 41 s | (81,9-22): warning X3577: value cannot be NaN, isnan() may not be necessary.  /Gis may force isnan() to be performed |

### Captures de la carte — nuit

- [bataille_40s_ensemble.jpg](carte_nuit/bataille_40s_ensemble.jpg)
- [dessus.jpg](carte_nuit/dessus.jpg)
- [ensemble_nord_est.jpg](carte_nuit/ensemble_nord_est.jpg)
- [ensemble_sud_ouest.jpg](carte_nuit/ensemble_sud_ouest.jpg)
- [sol_allee_nord.jpg](carte_nuit/sol_allee_nord.jpg)
- [sol_allee_sud.jpg](carte_nuit/sol_allee_sud.jpg)
- [sol_depart_est.jpg](carte_nuit/sol_depart_est.jpg)
- [sol_depart_ouest.jpg](carte_nuit/sol_depart_ouest.jpg)

### Journaux

Sortie complète de chaque commande : `logs/` (un fichier par étape).

Durée totale : 0.8 min.
