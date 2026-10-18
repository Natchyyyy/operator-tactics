// Assemble une seule page autonome : dist/index.html (three.js + simulation + interface inclus).
const fs = require('fs'), path = require('path');
const root = __dirname;
require('./outils/images_js.js');   // régénère web/images.js à partir de web/img
let html = fs.readFileSync(path.join(root, 'web/index.html'), 'utf8');
const inline = (src) => () => `<script>\n${fs.readFileSync(path.join(root, src), 'utf8')}\n</script>`; // fonction : évite les motifs $& de String.replace
html = html.replace('<script src="three.min.js"></script>', inline('web/three.min.js'))
  .replace('<script src="police.js"></script>', inline('web/police.js'))
  .replace('<script src="fond.js"></script>', inline('web/fond.js'))
  .replace('<script src="emblemes.js"></script>', inline('web/emblemes.js'))
  .replace('<script src="icones.js"></script>', inline('web/icones.js'))
  .replace('<script src="medailles.js"></script>', inline('web/medailles.js'))
  .replace('<script src="lecteur.js"></script>', inline('web/lecteur.js'))
  .replace('<script src="figure.js"></script>', inline('web/figure.js'))
  .replace('<script src="gltf.js"></script>', inline('web/gltf.js'))
  .replace('<script src="three-addons.js"></script>', inline('web/three-addons.js'))
  .replace('<script src="rendu.js"></script>', inline('web/rendu.js'))
  .replace('<script src="effets.js"></script>', inline('web/effets.js'))
  .replace('<script src="ruelle.js"></script>', inline('web/ruelle.js'))
  .replace('<script src="parking.js"></script>', inline('web/parking.js'))
  .replace('<script src="modeles/soldat.js"></script>', inline('web/modeles/soldat.js'))
  .replace('<script src="modeles/gign.js"></script>', inline('web/modeles/gign.js'))
  .replace('<script src="modeles/decor.js"></script>', inline('web/modeles/decor.js'))
  .replace('<script src="modeles3d.js"></script>', inline('web/modeles3d.js'))
  .replace('<script src="soldat3d.js"></script>', inline('web/soldat3d.js'))
  .replace('<script src="decor.js"></script>', inline('web/decor.js'))
  .replace('<script src="portrait.js"></script>', inline('web/portrait.js'))
  .replace('<script src="images.js"></script>', inline('web/images.js'))
  .replace('<script src="homescene.js"></script>', inline('web/homescene.js'))
  .replace('<script src="../sim/rng.js"></script>', inline('sim/rng.js'))
  .replace('<script src="../sim/data.js"></script>', inline('sim/data.js'))
  .replace('<script src="../sim/map.js"></script>', inline('sim/map.js'))
  .replace('<script src="../sim/engine.js"></script>', inline('sim/engine.js'))
  .replace('<script src="../sim/game.js"></script>', inline('sim/game.js'))
  .replace('<script src="../sim/league.js"></script>', inline('sim/league.js'))
  .replace('<script src="hq.js"></script>', inline('web/hq.js'))
  .replace('<script src="app.js"></script>', inline('web/app.js'))
  .replace('<script src="title.js"></script>', inline('web/title.js'));
if (/<script src=/.test(html)) throw new Error('un script externe reste dans la page');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/index.html'), html);
// copie pour GitHub Pages (Settings → Pages → branche main, dossier /docs : GitHub ne publie que la racine ou /docs)
fs.mkdirSync(path.join(root, 'docs'), { recursive: true }); fs.writeFileSync(path.join(root, 'docs/index.html'), html);
// Variante « artifact » : le contenu sans squelette (doctype/html/head/body), titre et style en tête.
const m = html.match(/<title>[\s\S]*?<\/style>/), body = html.match(/<body>([\s\S]*)<\/body>/);
if (!m || !body) throw new Error('structure de page inattendue');
fs.writeFileSync(path.join(root, 'dist/artifact.html'), m[0] + '\n' + body[1].trim() + '\n');
// versions haute définition (modèles, textures) publiées à côté de la page : copiées dans dist/hd et docs/hd
{ const src = path.join(root, 'web/hd'); if (fs.existsSync(src)) for (const dst of ['dist/hd', 'docs/hd']) { fs.mkdirSync(path.join(root, dst), { recursive: true });
  for (const f of fs.readdirSync(src)) { const a = path.join(src, f), b = path.join(root, dst, f); if (!fs.existsSync(b) || fs.statSync(b).size !== fs.statSync(a).size) fs.copyFileSync(a, b); } } }
// pour l'hébergement des artifacts (pas de .glb servi) : dist/hdart, les .glb en base64 dans des .json, les .jpg tels quels
{ const src = path.join(root, 'web/hd'), dst = path.join(root, 'dist/hdart'); if (fs.existsSync(src)) { fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) { const a = path.join(src, f); if (f.endsWith('.glb')) fs.writeFileSync(path.join(dst, f.replace(/\.glb$/, '.json')), JSON.stringify({ glb: fs.readFileSync(a).toString('base64') })); else fs.copyFileSync(a, path.join(dst, f)); } } }
console.log('dist/index.html :', (html.length / 1024).toFixed(0), 'Ko ; dist/artifact.html écrit');
