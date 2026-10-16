// Embarque les icônes prêtes (web/img) dans web/images.js : OT.IMG[nom] = data URI. Appelé par build.js.
// Tailles retenues : tactiques et succès en 128 px (cartes), rôles en 64 px (étiquettes, cartes d'escouade).
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'web', 'img'), out = path.join(__dirname, '..', 'web', 'images.js');
const pick = (f) => /^(tac|ach|ui)_.+_128\.png$/.test(f) || /^role_.+_64\.png$/.test(f);
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(pick).sort() : [];
const map = {};
for (const f of files) map[f.replace(/_(64|128)\.png$/, '')] = 'data:image/png;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64');
fs.writeFileSync(out, '// Fichier généré par outils/images_js.js — ne pas modifier à la main.\n(function (root) { root.IMG = ' + JSON.stringify(map) + ';\n  root.imgTag = function (name, cls) { const u = root.IMG[name]; return u ? `<img class="${cls || \'icon\'}" src="${u}" alt="">` : \'\'; };\n})(typeof module !== \'undefined\' ? module.exports : (window.OT = window.OT || {}));\n');
console.log('web/images.js :', Object.keys(map).length, 'images,', (fs.statSync(out).size / 1024).toFixed(0), 'Ko');
