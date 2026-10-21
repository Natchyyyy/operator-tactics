// Construction des pages du jeu à partir de web/index.html (voir README, « Construction et publication »).
//  - dist/complet.html : le jeu en UN seul fichier autonome (tous les scripts, modèles et sons inclus) — hors ligne, file://.
//  - dist/index.html, docs/index.html : page légère (interface + chargeur web/chargeur.js) ; le reste est dans p/ à côté :
//      p/three.min.js, p/three-addons.js, p/<lib>.js (web/vendor/)  bibliothèques, exécutées en premier
//      p/modeles-<nom>.js                                           modèles 3D en base64 (web/modeles/)
//      p/sons.js                                                    sons inclus (bloc <!--SONS--> de web/index.html)
//      p/jeu.js                                                     tous les autres scripts, dans l'ordre de web/index.html
//  - dist/artifact.html : la même page légère sans squelette, pour claude.ai ; dist/publier.json : fichiers à publier avec.
//  - hd/ : modèles et textures haute définition (web/hd) ; dist/hdart : les .glb en base64 dans des .json (artifacts).
// Les scripts sont lus dans web/index.html : ajouter un <script src> là-bas suffit (data-optionnel : son échec n'est pas bloquant ;
// data-page : petit script gardé dans la page légère, exécuté avant le chargeur — ex. la police du titre).
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = __dirname, R = (p) => path.join(root, p);
require('./outils/images_js.js');   // régénère web/images.js à partir de web/img
const lire = (p) => fs.readFileSync(R(p), 'utf8');
const ecrire = (p, data) => { fs.mkdirSync(path.dirname(R(p)), { recursive: true }); const tmp = R(p) + '.tmp' + process.pid; fs.writeFileSync(tmp, data); fs.renameSync(tmp, R(p)); };   // écriture atomique (captures en cours)
const empreinte = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 10);
const octets = (s) => Buffer.byteLength(s, 'utf8');

const source = lire('web/index.html');
const corps = source.match(/<body>([\s\S]*)<\/body>/), tete = source.match(/<title>[\s\S]*?<\/style>/);
if (!corps || !tete) throw new Error('web/index.html : structure de page inattendue (<title>…</style>, <body>…</body>)');
// ---- inventaire : bloc des sons et scripts du corps de page, dans l'ordre
const sonsM = corps[1].match(/<!--SONS-->\s*<script type="text\/plain" id="sons-data">([\s\S]*?)<\/script>\s*<!--\/SONS-->/);
const corpsSansSons = sonsM ? corps[1].replace(sonsM[0], () => '') : corps[1];
const scripts = []; let nInline = 0;
for (const m of corpsSansSons.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  const attrs = m[1], src = (attrs.match(/\bsrc="([^"]+)"/) || [])[1], type = (attrs.match(/\btype="([^"]+)"/) || [])[1];
  if (type && !/javascript/.test(type)) throw new Error('web/index.html : script de type « ' + type + ' » non géré : ' + m[0].slice(0, 80));
  if (src) {
    const fichier = path.posix.normalize('web/' + src); if (!fs.existsSync(R(fichier))) throw new Error('web/index.html : script introuvable ' + fichier);
    const genre = /\bdata-page\b/.test(attrs) ? 'page' : /^(three\.min|three-addons)\.js$/.test(src) || /^vendor\//.test(src) ? 'vendor' : /^modeles\//.test(src) ? 'modele' : 'jeu';
    scripts.push({ tag: m[0], src, nom: fichier, code: lire(fichier), opt: /\bdata-optionnel\b/.test(attrs), genre });
  } else scripts.push({ tag: m[0], nom: 'web/index.html#' + (++nInline), code: m[2], genre: 'jeu', inline: true });
}
for (const s of scripts) if (/<\/script/i.test(s.code)) throw new Error(s.nom + ' contient « </script » : impossible de l\'inclure dans une page');
if (/<script\b[^>]*\bsrc=/.test(source.slice(0, source.indexOf('<body>')))) throw new Error('web/index.html : <script src> dans <head> non géré');

// ---- haute définition disponible : web/hd (versionné) ; à défaut (vieux clone sans web/hd) docs/hd tel quel
const listeHD = (d) => fs.existsSync(R(d)) ? fs.readdirSync(R(d)).filter(f => !f.startsWith('.') && !/\.tmp\d*$/.test(f)) : [];
const hdDir = listeHD('web/hd').length ? 'web/hd' : 'docs/hd', hdSrc = R(hdDir), hdFichiers = listeHD(hdDir);
if (hdDir !== 'web/hd') console.warn('web/hd absent : haute définition reprise de docs/hd (' + hdFichiers.length + ' fichiers)');
// window.OT_HD : fichiers HD réellement publiés à côté de la page (le jeu ne demande pas les autres → pas d'erreur 404) ;
// json : true pour l'artifact claude.ai (les .glb y sont publiés en hd/<nom>.json). Absent en développement (web/index.html).
const scriptHD = (json) => `<script>window.OT_HD = ${JSON.stringify({ json, fichiers: Object.fromEntries(hdFichiers.map(f => [f, 1])) })};</script>`;

// ---- 1. page complète en un seul fichier (ordre d'origine)
let complet = source.replace('<body>', () => '<body>\n' + scriptHD(false));
for (const s of scripts) if (!s.inline) complet = complet.replace(s.tag, () => `<script>\n${s.code}\n</script>`);
ecrire('dist/complet.html', complet);

// ---- 2. fichiers séparés (p/) et page légère
const parties = [], annexes = [];   // annexes : licences des bibliothèques, publiées à côté
for (const s of scripts.filter(s => s.genre === 'vendor')) {
  parties.push({ f: 'p/' + path.basename(s.nom), contenu: s.code, opt: s.opt });
  const lic = s.nom.replace(/\.js$/, '.LICENSE'); if (fs.existsSync(R(lic))) annexes.push({ f: 'p/' + path.basename(lic) + '.txt', contenu: lire(lic) });
}
for (const s of scripts.filter(s => s.genre === 'modele')) parties.push({ f: 'p/modeles-' + path.basename(s.nom), contenu: s.code, opt: s.opt });
if (sonsM) parties.push({ f: 'p/sons.js', opt: true, contenu: '// Sons inclus du jeu (bloc <!--SONS--> de web/index.html), remis dans la page pour web/lecteur.js.\n' +
  '(function () { const s = document.createElement("script"); s.type = "text/plain"; s.id = "sons-data"; s.text = ' + JSON.stringify(sonsM[1]) + '; document.body.appendChild(s); })();\n' });
const jeu = scripts.filter(s => s.genre === 'jeu');
parties.push({ f: 'p/jeu.js', decoupe: true, contenu: '// Scripts du jeu Operator Tactics réunis par build.js (sources : web/, sim/). Le chargeur les exécute un par un.' +
  jeu.map(s => `\n;//@@OT ${s.nom}@@\n` + s.code).join('') + '\n' });
for (const p of parties) { p.v = empreinte(p.contenu); p.o = octets(p.contenu); }
const manifeste = { version: empreinte(parties.map(p => p.v).join()), parties: parties.map(p => Object.assign({ f: p.f, v: p.v, o: p.o }, p.opt ? { opt: 1 } : {}, p.decoupe ? { decoupe: 1 } : {})) };
const chargeur = lire('web/chargeur.js').replace('/*MANIFESTE*/null', () => JSON.stringify(manifeste));
let corpsLeger = corpsSansSons; for (const s of scripts) corpsLeger = corpsLeger.replace(s.tag, () => '');
corpsLeger = corpsLeger.split('\n').filter(l => l.trim()).join('\n');
const styleLeger = tete[0].replace(/<\/style>$/, () => lire('web/chargeur.css') + '</style>');
// scripts marqués data-page (petits, utiles dès le premier affichage : police du titre) : gardés dans la page légère
const corpsFinal = (json) => scriptHD(json) + '\n' + corpsLeger + scripts.filter(s => s.genre === 'page').map(s => `\n<script>\n${s.code}\n</script>`).join('') + `\n<script>\n${chargeur}\n</script>\n`;
const page = source.slice(0, source.indexOf(tete[0])) + styleLeger + source.slice(source.indexOf(tete[0]) + tete[0].length, source.indexOf('<body>')) + '<body>\n' + corpsFinal(false) + '</body>\n</html>\n';
for (const dst of ['dist', 'docs']) {
  const garder = new Set([...parties, ...annexes].map(p => path.basename(p.f)));
  if (fs.existsSync(R(dst + '/p'))) for (const f of fs.readdirSync(R(dst + '/p'))) if (!garder.has(f)) fs.rmSync(R(dst + '/p/' + f));   // fichiers retirés
  for (const p of [...parties, ...annexes]) { const b = R(dst + '/' + p.f); if (!fs.existsSync(b) || fs.readFileSync(b, 'utf8') !== p.contenu) ecrire(dst + '/' + p.f, p.contenu); }
  ecrire(dst + '/index.html', page);   // en dernier : la page ne référence que des fichiers déjà écrits
}
// variante « artifact » : sans squelette (doctype/html/head/body), titre et style en tête — le publieur ajoute le squelette
ecrire('dist/artifact.html', styleLeger + '\n' + corpsFinal(true));

// ---- 3. haute définition : web/hd copié dans dist/hd et docs/hd ; dist/hdart pour les artifacts (.glb → .json base64)
for (const dst of ['dist/hd', 'docs/hd'].filter(d => d !== hdDir)) { fs.mkdirSync(R(dst), { recursive: true });
  for (const f of fs.readdirSync(R(dst))) if (!hdFichiers.includes(f)) fs.rmSync(R(dst + '/' + f));   // fichiers retirés de web/hd
  for (const f of hdFichiers) { const a = path.join(hdSrc, f), b = R(dst + '/' + f); if (!fs.existsSync(b) || fs.statSync(b).size !== fs.statSync(a).size || fs.statSync(b).mtimeMs < fs.statSync(a).mtimeMs) fs.copyFileSync(a, b); } }
const hdart = (f) => f.replace(/\.glb$/, '.json');
{ fs.mkdirSync(R('dist/hdart'), { recursive: true }); const noms = new Set(hdFichiers.map(hdart));
  for (const f of fs.readdirSync(R('dist/hdart'))) if (!noms.has(f)) fs.rmSync(R('dist/hdart/' + f));
  for (const f of hdFichiers) { const a = path.join(hdSrc, f), b = R('dist/hdart/' + hdart(f)); if (fs.existsSync(b) && fs.statSync(b).mtimeMs >= fs.statSync(a).mtimeMs) continue;
    if (f.endsWith('.glb')) ecrire('dist/hdart/' + hdart(f), JSON.stringify({ glb: fs.readFileSync(a).toString('base64') })); else fs.copyFileSync(a, b); } }

// ---- 4. manifeste de publication (artifact claude.ai) : chemin publié → fichier source, contrôles de taille et de type
const TYPES = { js: 'text/javascript', json: 'application/json', txt: 'text/plain', css: 'text/css', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  ogg: 'audio/ogg', mp3: 'audio/mpeg', wav: 'audio/wav', woff2: 'font/woff2', wasm: 'application/wasm' };   // (wasm : données de motion matching, mêmes octets que les .bin)
const TEXTE = /^(js|json|txt|css)$/, MAX_TEXTE = 16e6, MAX_BIN = 15e6, MAX_PAGE = 16e6, MAX_VERSION = 256e6, MAX_FICHIERS = 511, LOT_FICHIERS = 250, LOT_OCTETS = 60e6;
const fichiersPub = [...parties, ...annexes].map(p => ({ publie: p.f, source: 'dist/' + p.f }))
  .concat(hdFichiers.map(f => ({ publie: 'hd/' + hdart(f), source: 'dist/hdart/' + hdart(f) })));
const problemes = [];
for (const e of fichiersPub) { const ext = e.publie.split('.').pop().toLowerCase(); e.octets = fs.statSync(R(e.source)).size; e.type = TYPES[ext] || null;
  e.sha = crypto.createHash('sha1').update(fs.readFileSync(R(e.source))).digest('hex').slice(0, 12);   // outils/publier.js : fichiers changés depuis la dernière publication
  if (!e.type) problemes.push(e.publie + ' : type non publiable (.' + ext + ')');
  else if (e.octets > (TEXTE.test(ext) ? MAX_TEXTE : MAX_BIN)) problemes.push(e.publie + ' : ' + (e.octets / 1e6).toFixed(1) + ' Mo, au-delà de la limite par fichier'); }
const taillePage = fs.statSync(R('dist/artifact.html')).size, totalPub = fichiersPub.reduce((s, e) => s + e.octets, 0) + taillePage;
if (taillePage > MAX_PAGE) problemes.push('dist/artifact.html : ' + (taillePage / 1e6).toFixed(1) + ' Mo, au-delà de 16 Mo');
if (totalPub > MAX_VERSION) problemes.push('total publié ' + (totalPub / 1e6).toFixed(0) + ' Mo, au-delà de 256 Mo par version');
if (fichiersPub.length + 1 > MAX_FICHIERS) problemes.push(fichiersPub.length + 1 + ' fichiers, au-delà de 511 par version');
// lots : le premier porte tout ce que la page exige (p/), les suivants la haute définition ; ≤ 250 fichiers et ≤ 60 Mo chacun
const lots = []; let lot = null;
for (const e of fichiersPub) { const coeur = e.publie.startsWith('p/');
  if (!lot || (!coeur && (lot.n >= LOT_FICHIERS || lot.octets + e.octets > LOT_OCTETS))) lots.push(lot = { n: 0, octets: 0, files: {} });
  lot.files[e.publie] = R(e.source); lot.n++; lot.octets += e.octets; }
ecrire('dist/publier.json', JSON.stringify({ page: R('dist/artifact.html'), octets_page: taillePage, version: manifeste.version, total_octets: totalPub, fichiers: fichiersPub.length + 1,
  problemes, lots, liste: fichiersPub }, null, 1) + '\n');

const ko = (n) => (n / 1024).toFixed(0) + ' Ko', mo = (n) => (n / 1048576).toFixed(1) + ' Mo';
console.log('page légère (dist/index.html, docs/index.html, dist/artifact.html) :', ko(octets(page)), '; dist/complet.html :', mo(octets(complet)));
console.log('p/ :', parties.map(p => path.basename(p.f) + ' ' + ko(p.o)).join(', '));
console.log('publication : ' + (fichiersPub.length + 1) + ' fichiers, ' + mo(totalPub) + ' en ' + lots.length + ' lot(s) → dist/publier.json' + (problemes.length ? '\nPROBLÈMES DE PUBLICATION :\n  ' + problemes.join('\n  ') : ''));
