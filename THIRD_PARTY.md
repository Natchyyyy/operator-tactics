# Bibliothèques tierces

| Bibliothèque | Version | Licence | Source | Fichier | Usage |
|---|---|---|---|---|---|
| cannon-es | 0.20.0 | MIT (© 2015 cannon.js Authors, © 2020 pmndrs) | https://github.com/pmndrs/cannon-es, tag `v0.20.0`, `dist/cannon-es.js` | `web/vendor/cannon-es.js` (+ `web/vendor/cannon-es.LICENSE`) | physique des morts en ragdoll (`web/ragdoll.js`), facultative : sans elle, animations de chute |

`web/vendor/cannon-es.js` est le module ES d'origine, inchangé, enveloppé dans une fonction qui expose `window.CANNON`
(l'instruction `export { … }` finale est remplacée par cette affectation).

## Police

| Police | Licence | Source | Fichiers | Usage |
|---|---|---|---|---|
| Audiowide (© 2012 Brian J. Bonislawsky, Astigmatic ; nom réservé « Audiowide ») | SIL Open Font License 1.1 | Google Fonts | `web/polices/Audiowide-Regular.ttf` (d'origine), `web/polices/OFL-Audiowide.txt` | — |
| OT Display (version modifiée d'Audiowide) | SIL Open Font License 1.1 | dérivée d'Audiowide : le « 0 » perd sa barre oblique (il se lisait « Ø ») ; renommée, comme l'exige la licence | `web/polices/OTDisplay-Regular.ttf`, incluse en base64 dans `web/police.js` | titres, chiffres, interface (`var(--raw)`) |

## Textures et panorama scannés (Poly Haven, CC0)

Licence : CC0 1.0 (domaine public, https://polyhaven.com/license) — aucune attribution exigée, citée par courtoisie.
Fichiers dans `web/hd/` (copiés dans `dist/hd`, `docs/hd`), chargés par `web/pbr.js` ; sans eux le jeu garde ses textures procédurales.
Conversion : redimensionnées (2048 px pour l'asphalte, 1024 / 512 px pour le reste), recompressées en JPEG ; béton et dalles désaturés.

| Fichiers | Ressource Poly Haven | Source (téléchargement) | Usage |
|---|---|---|---|
| `pbr_asphalte_{couleur,relief,rugosite}.jpg` | asphalt_02 | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/asphalt_02/ (`_diff_2k`, `_nor_gl_2k`, `_rough_2k`) | sol du parking |
| `pbr_beton_{couleur,relief,rugosite}.jpg` | concrete_wall_008 | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete_wall_008/ | murs et bordures en béton |
| `pbr_dalles_{couleur,relief,rugosite}.jpg` | concrete_pavement | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete_pavement/ | trottoirs |
| `pbr_brique_{couleur,relief,rugosite}.jpg` | red_brick_03 | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/red_brick_03/ | murs de briques |
| `pbr_ciel_ville.jpg` | canary_wharf (HDRI) | https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/canary_wharf_1k.hdr — converti en JPEG (ciel et soleil écrêtés) | éclairage d'ambiance et reflets (jour, pluie, brouillard) |
