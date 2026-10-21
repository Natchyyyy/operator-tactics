// Vue de dessus des batailles, en images (outil de débogage de l'IA ; le dessin est dans outils/vue2d/rendu.js).
// usage :
//   node outils/vue2d.js [--graine 8] [--ordres careful,assault] [--t 20,30,45 | --pas 5] [--suivre Vautour]
//                        [--autour Vautour:12 | --cadre x0,z0,x1,z1] [--planche] [--echelle 14] [--out dossier] [--svg]
//     --t       instants voulus (s) ; --pas N : une image toutes les N secondes jusqu'à la fin
//     --suivre  soldat suivi (anneau vert, ses positions connues, ses lignes de vue, son état en titre)
//     --autour  cadre centré sur ce soldat (demi-côté en m) à chaque image ; --cadre : cadre fixe
//     --planche toutes les images en une seule (grille), --svg : garder les .svg
//   node outils/vue2d.js --page  → dist/vue2d.html (page autonome : lecteur de batailles vu de dessus)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };

if (arg('page')) {
  const lire = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  let html = lire('outils/vue2d/page.html');
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
    const code = lire(path.posix.normalize('outils/vue2d/' + src));
    if (/<\/script/i.test(code)) throw new Error(src + ' contient </script');
    return `<script>\n${code}\n</script>`;
  });
  fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'dist/vue2d.html'), html);
  console.log('dist/vue2d.html', (html.length / 1024).toFixed(0), 'Ko');
  process.exit(0);
}

const t0 = Date.now();
const OT = Object.assign({}, require('../sim/rng.js'), require('../sim/data.js'), require('../sim/map.js'), require('../sim/engine.js'));
const V = require('./vue2d/rendu.js').Vue2D;
const seed = +arg('graine', 8), ordres = String(arg('ordres', 'careful,assault')).split(',');
const A = ['op_vautour', 'op_lynx', 'op_granit', 'op_bastion', 'op_belier'], K = ['k_molosse', 'k_vipere', 'k_rapace', 'k_hyene', 'k_chacal'];
const b = new OT.Battle({ seed, mapId: arg('carte', 'parking'), teams: [{ name: 'Bleus', order: ordres[0], operators: A, tactics: [] }, { name: 'Rouges', order: ordres[1] || 'assault', operators: K, tactics: [] }] });
const C = V.carte(b.map);
const pasN = arg('pas') ? +arg('pas') : 0;
let instants = arg('t') ? String(arg('t')).split(',').map(Number) : [];
const out = path.resolve(String(arg('out', '/tmp/vue2d'))); fs.mkdirSync(out, { recursive: true });
const suivre = arg('suivre') === true ? null : arg('suivre'), autour = arg('autour'), cadreF = arg('cadre'), ech = +arg('echelle', 14);
const images = []; let ev0 = 0, prochain = pasN || Infinity;
const voulu = () => { if (instants.length && b.t >= instants[0] - 1e-6) { instants.shift(); return true; } if (b.t >= prochain - 1e-6) { prochain += pasN; return true; } return false; };
while (!b.over && b.t < 300 && (instants.length || pasN)) {
  b.step();
  // les tirs des 0,3 dernières secondes restent visibles sur l'image
  if (voulu()) { const S = V.snap(b, ev0); images.push(S); }
  while (ev0 < b.events.length && b.events[ev0].t < b.t - 0.3) ev0++;
}
if (b.over) console.log(`fin de la bataille à ${b.t.toFixed(1)} s : ${b.result ? 'victoire ' + (b.result.winner === 0 ? 'bleus' : b.result.winner === 1 ? 'rouges' : '—') : ''}`);
// SVG → PNG : @resvg/resvg-js (npm i @resvg/resvg-js, ici ou dans /root/.outils-node)
let Resvg = null;
for (const m of ['@resvg/resvg-js', '/root/.outils-node/node_modules/@resvg/resvg-js']) { try { Resvg = require(m).Resvg; break; } catch (e) { } }
const ecrirePng = (svg, f) => {
  if (!Resvg) { fs.writeFileSync(f.replace(/\.png$/, '.svg'), svg); console.warn('resvg absent (npm i @resvg/resvg-js) : SVG seulement'); return f.replace(/\.png$/, '.svg'); }
  fs.writeFileSync(f, new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans' } }).render().asPng()); return f;
};
const svgs = [];
for (const S of images) {
  let cadre = null;
  if (cadreF) { const [x0, z0, x1, z1] = String(cadreF).split(',').map(Number); cadre = { x0, z0, x1, z1 }; }
  else if (autour) {
    const [cs, r] = String(autour).split(':'), u = S.units.find(u => u.cs === cs || u.id === cs), R = +r || 12;
    if (u) cadre = { x0: u.x - R, z0: u.z - R * 0.65, x1: u.x + R, z1: u.z + R * 0.65 };
  }
  const svg = V.svg(C, S, { echelle: cadre ? Math.max(ech, Math.round(900 / (cadre.x1 - cadre.x0))) : ech, choisi: suivre || (autour && String(autour).split(':')[0]), cadre, titre: `graine ${seed} (${ordres.join(' / ')})` });
  svgs.push({ t: S.t, svg });
}
const nom = (t) => path.join(out, `g${seed}_t${t.toFixed(1).padStart(5, '0')}`);
const sorties = [];
if (arg('planche') && svgs.length > 1) {
  // une seule image : les vues en grille (SVG imbriqués)
  const cols = svgs.length <= 4 ? 2 : 3, dim = svgs.map(s => s.svg.match(/width="(\d+)" height="(\d+)"/).slice(1).map(Number));
  const w = Math.max(...dim.map(d => d[0])), h = Math.max(...dim.map(d => d[1])), G = 6, lig = Math.ceil(svgs.length / cols);
  const W = cols * w + (cols + 1) * G, H = lig * h + (lig + 1) * G;
  const corps = svgs.map((s, i) => s.svg.replace('<svg ', `<svg x="${G + (i % cols) * (w + G)}" y="${G + Math.floor(i / cols) * (h + G)}" `).replace(/id="cl"/, `id="cl${i}"`).replace(/url\(#cl\)/, `url(#cl${i})`)).join('');
  sorties.push(ecrirePng(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#fff"/>${corps}</svg>`, path.join(out, `g${seed}_planche.png`)));
} else for (const s of svgs) { if (arg('svg')) fs.writeFileSync(nom(s.t) + '.svg', s.svg); sorties.push(ecrirePng(s.svg, nom(s.t) + '.png')); }
sorties.forEach(p => console.log(p));
console.log(`${svgs.length} vue(s) en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
