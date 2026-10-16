// Assemble une seule page autonome : dist/index.html (three.js + simulation + interface inclus).
const fs = require('fs'), path = require('path');
const root = __dirname;
let html = fs.readFileSync(path.join(root, 'web/index.html'), 'utf8');
const inline = (src) => () => `<script>\n${fs.readFileSync(path.join(root, src), 'utf8')}\n</script>`; // fonction : évite les motifs $& de String.replace
html = html.replace('<script src="three.min.js"></script>', inline('web/three.min.js'))
  .replace('<script src="lecteur.js"></script>', inline('web/lecteur.js'))
  .replace('<script src="figure.js"></script>', inline('web/figure.js'))
  .replace('<script src="portrait.js"></script>', inline('web/portrait.js'))
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
// Variante « artifact » : le contenu sans squelette (doctype/html/head/body), titre et style en tête.
const m = html.match(/<title>[\s\S]*?<\/style>/), body = html.match(/<body>([\s\S]*)<\/body>/);
if (!m || !body) throw new Error('structure de page inattendue');
fs.writeFileSync(path.join(root, 'dist/artifact.html'), m[0] + '\n' + body[1].trim() + '\n');
console.log('dist/index.html :', (html.length / 1024).toFixed(0), 'Ko ; dist/artifact.html écrit');
