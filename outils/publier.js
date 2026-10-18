// Prépare la publication de l'artifact claude.ai à partir de dist/publier.json (écrit par node build.js).
// usage : node outils/publier.js            → lots à publier : seulement les fichiers changés depuis la dernière publication
//         node outils/publier.js --tout     → tous les fichiers (première publication, ou artifact neuf)
//         node outils/publier.js --fait     → note la publication réussie (copie dist/publier.json → dist/publie.json)
// Chaque lot s'envoie en un appel de publication : file_path = dist/artifact.html (la page, toujours renvoyée), files = le lot.
// Les fichiers non renvoyés restent publiés ; un fichier retiré du jeu est signalé (à retirer avec la valeur null).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), R = (p) => path.join(root, p);
const cur = JSON.parse(fs.readFileSync(R('dist/publier.json'), 'utf8'));
if (process.argv.includes('--fait')) { fs.copyFileSync(R('dist/publier.json'), R('dist/publie.json')); console.log('publication notée (version ' + cur.version + ')'); process.exit(0); }
const avant = !process.argv.includes('--tout') && fs.existsSync(R('dist/publie.json')) ? JSON.parse(fs.readFileSync(R('dist/publie.json'), 'utf8')) : null;
const anciens = new Map(avant ? avant.liste.map(e => [e.publie, e.sha]) : []);
const aEnvoyer = cur.liste.filter(e => !avant || anciens.get(e.publie) !== e.sha);
const retires = avant ? avant.liste.filter(e => !cur.liste.some(c => c.publie === e.publie)).map(e => e.publie) : [];
// lots : ≤ 250 fichiers et ≤ 60 Mo par appel (limites : 255 fichiers et 64 Mo par publication)
const lots = []; let lot = null;
for (const e of aEnvoyer) { if (!lot || lot.n >= 250 || lot.octets + e.octets > 60e6) lots.push(lot = { n: 0, octets: 0, files: {} }); lot.files[e.publie] = R(e.source); lot.n++; lot.octets += e.octets; }
if (retires.length) { if (!lots.length) lots.push({ n: 0, octets: 0, files: {} }); for (const f of retires) lots[0].files[f] = null; }
if (cur.problemes.length) console.error('ATTENTION, problèmes de publication :\n  ' + cur.problemes.join('\n  '));
console.log(JSON.stringify({ page: cur.page, octets_page: cur.octets_page, depuis: avant ? avant.version : null, version: cur.version,
  a_envoyer: aEnvoyer.length + ' fichier(s), ' + (aEnvoyer.reduce((s, e) => s + e.octets, 0) / 1e6).toFixed(1) + ' Mo', retires, lots }, null, 1));
