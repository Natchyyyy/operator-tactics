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
