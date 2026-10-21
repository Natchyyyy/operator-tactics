#!/usr/bin/env node
// Extrait le MODULE de motion matching (base de données, Soldat, contrôleur, Agent, Sauvetage, PARAMS) depuis le prototype
// prototypes/motion-matching/web/mm.js vers web/mm.js (le jeu). Le prototype reste la source unique : on relance ce script
// après chaque mise à jour du prototype. La scène de test (rendu, Cerveau, presets) n'est pas reprise.
//
// Les quelques variables de scène utilisées par le module (horloge, liste des agents, bloc de couvert, murs, bataille,
// journaux) passent par un objet `ctx` que le jeu renseigne (web/mm_jeu.js). Chaque remplacement est compté : si le
// prototype change et qu'un motif n'est plus trouvé le nombre de fois attendu, le script s'arrête (pas de module bancal).
'use strict';
const fs = require('fs'), path = require('path');
const racine = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(racine, 'prototypes/motion-matching/web/mm.js'), 'utf8').split('\n');

const idx = (re, from = 0) => { const i = src.findIndex((l, k) => k >= from && re.test(l)); if (i < 0) throw new Error('motif absent : ' + re); return i; };
const iDebut = idx(/^\(function \(\) \{/);                       // ouverture de l'IIFE
const iScene = idx(/^  let renderer, scene, camera, cam = /);      // début des variables de scène (retirées)
const iParams = idx(/^  const JOURNAL = window\.JOURNAL = \[\]; const PARAMS = /);
const iFin = idx(/^  const agents = \[\]; let gltfBuffer = null/);  // fin du module (tout ce qui suit = scène de test)
if (!(iDebut < iScene && iScene < iParams && iParams < iFin)) throw new Error('ordre des sections inattendu');

// 1) corps : lignes du module, sans le bloc de variables de scène (iScene … iParams-1), plus le traitement des morts de la
// boucle de scène (ragdoll : corps aplati une fois figé…), repris tel quel dans une fonction mortsTic(dt, sansEtape)
const iMorts = idx(/^    if \(window\.OT && OT\.Ragdoll && agents\.some\(A => A\.mort\)\) \{ BATAILLE\.t = horloge; OT\.Ragdoll\.etape\(dt, BATAILLE\);/, iFin);
const iMortsFin = idx(/aFiger = true; \} \} \}/, iMorts);
const morts = ['  // Morts : os tenus par la physique (ragdoll du jeu). Repris de la boucle de la scène du prototype ; sansEtape : le jeu fait',
  '  // lui-même l\'étape physique (une fois par image).', '  function mortsTic(dt, sansEtape) {',
  ...src.slice(iMorts, iMortsFin + 1).map(l => l.replace(/^  /, '')), '  }'];
morts[2 + 1] = morts[3].replace('if (window.OT && OT.Ragdoll && agents.some(A => A.mort)) { BATAILLE.t = horloge; OT.Ragdoll.etape(dt, BATAILLE);', 'if (window.OT && OT.Ragdoll && agents.some(A => A.mort)) { if (!sansEtape) { BATAILLE.t = horloge; OT.Ragdoll.etape(dt, BATAILLE); }');
if (morts[3] === src[iMorts].replace(/^  /, '')) throw new Error('mortsTic : en-tête non remplacé');
// géométrie des murs (segment ↔ boîte 3D, segment libre) : fonctions de la scène utilisées par couvrir() et le sauvetage
const geo = [src[idx(/^  function segCoupeBoite3D\(/, iFin)], src[idx(/^  function segLibre\(/, iFin)]];
let lignes = [...src.slice(iDebut + 1, iScene), ...src.slice(iParams, iFin), ...geo, ...morts];
let corps = lignes.join('\n');

// 2) remplacements comptés
const remplacer = (re, par, attendu) => { const n = (corps.match(re) || []).length; if (n !== attendu) throw new Error(`« ${re} » : ${n} occurrence(s), ${attendu} attendue(s)`); corps = corps.replace(re, par); };
remplacer(/const JOURNAL = window\.JOURNAL = \[\]; const PARAMS = window\.PARAMS = \{/, 'const JOURNAL = ctx.JOURNAL; const PARAMS = {', 1);
remplacer(/fetch\('base\.json'\)/, "fetch((window.FICHIERS || {}).baseMeta || 'base.json')", 1);
// Sauvetage piloté par le jeu (web/mm_jeu.js) : fin de la réanimation décidée par la simulation (finRea), pas de bloc courant
remplacer(/const fin = this\.t > PARAMS\.rea\.duree;/, 'const fin = this.finRea != null ? this.finRea : this.t > PARAMS.rea.duree;', 1);
remplacer(/cheminVers\(pt\) \{ const S = this\.R\.soldat, r = PARAMS\.couvert\.rayon \+ 0\.05, gx0 = BLOC\.x/, 'cheminVers(pt) { if (!BLOC) return [pt]; const S = this.R.soldat, r = PARAMS.couvert.rayon + 0.05, gx0 = BLOC.x', 1);
remplacer(/window\.BLOC/g, 'ctx.BLOC', 1);
// Agent.tuer : dans le jeu, l'unité simulée (uJeu) tient lieu d'adaptateur pour ragdoll.js, et le journal « down » du jeu existe déjà
remplacer(/const u = \{ id: 'agent' \+ agents\.indexOf\(this\), alive: false, x: S\.pos\.x, z: S\.pos\.z, y: 0, w: 0, bleedUntil: 0 \};/, "const u = this.uJeu || { id: 'agent' + agents.indexOf(this), alive: false, x: S.pos.x, z: S.pos.z, y: 0, w: 0, bleedUntil: 0 };", 1);
remplacer(/BATAILLE\.log\.push\(\{ kind: 'down', enemy: u\.id, loc: loc \|\| '' \}\);/, "if (!this.uJeu) BATAILLE.log.push({ kind: 'down', enemy: u.id, loc: loc || '' });", 1);
// corps remis en physique pour le traînage : l'entrée « traîné » n'est lue que par ragdoll.js → retirée du journal du jeu juste après
remplacer(/BATAILLE\.log\.push\(\{ kind: 'down', enemy: V\.mort\.u\.id, loc: 'traîné' \}\); OT\.Ragdoll\.mort\(V\.mort\.u, m, BATAILLE\);/, "BATAILLE.log.push({ kind: 'down', enemy: V.mort.u.id, loc: 'traîné', silent: true, text: '' }); OT.Ragdoll.mort(V.mort.u, m, BATAILLE); if (V.uJeu) BATAILLE.log.pop();", 1);
remplacer(/\bMURS\b/g, 'ctx.MURS', 3);
remplacer(/\bBATAILLE\b/g, 'ctx.BATAILLE', 7);
remplacer(/\bEVENEMENTS\b/g, 'ctx.EVENEMENTS', 5);
remplacer(/\bhorloge\b/g, 'ctx.horloge', 13);
remplacer(/\bagents\b/g, 'ctx.agents', 11);
remplacer(/\bseuilOrteil\b/g, 'ctx.seuilOrteil', 1);
remplacer(/(?<!ctx\.)\bBLOC\b/g, 'ctx.BLOC', 17);   // (bloc de couvert courant : le jeu le règle avant chaque pas d'agent)
remplacer(/for \(const o of \[ctx\.BLOC, \.\.\.ctx\.MURS\]\)/, 'for (const o of [ctx.BLOC, ...ctx.MURS].filter(Boolean))', 1);   // (jeu : pas toujours de bloc courant)
// le commentaire de la scène « (MURS) » n'est pas touché par \bMURS\.some : vérification qu'il ne reste aucune variable de scène nue
for (const v of ['scene', 'camera', 'renderer', 'HUD', 'empreintesMesh', 'traits', 'cam', 'REGLES', 'ARME', 'RNG']) {
  const re = new RegExp('(?<![.\\p{L}\\p{N}_])' + v + '(?![\\p{L}\\p{N}_])', 'gu'); const n = (corps.match(re) || []).filter(x => true).length;
  // `scene` apparaît seulement comme `gltf.scene` / `sc` ; `cam` comme `camYaw` ; on vérifie les formes nues
  if (n) { const l = corps.split('\n').filter(x => re.test(x)).map(x => x.trim().slice(0, 100)); throw new Error(`variable de scène nue « ${v} » (${n}) :\n` + l.join('\n')); }
}

const entete = `// Motion matching du jeu — MODULE GÉNÉRÉ par outils/mm_extraire.js à partir de prototypes/motion-matching/web/mm.js
// (ne pas modifier ici : corriger le prototype, puis relancer \`node outils/mm_extraire.js\`).
// Données : base.json + base.*.bin (100STYLE, Ian Mason, CC BY 4.0, re-ciblage Daniel Holden). Le jeu décide (sim/), le module
// exécute : il reçoit des ordres simples (chemin, vitesse, visée, tir, accroupi, couvert) et rend la pose. Voir web/mm_jeu.js.
(function () {
  const OT = window.OT = window.OT || {};
  // contexte fourni par le jeu : horloge (s), agents vivants, bloc de couvert de l'agent en cours, murs (obstacles), bataille
  // (pour le ragdoll), journaux
  const ctx = { horloge: 0, agents: [], BLOC: null, MURS: [], BATAILLE: null, EVENEMENTS: [], JOURNAL: [], seuilOrteil: 0.06 };
`;
const pied = `
  OT.MM = { ctx, Base, chargerBase, chercher, cout, mortsTic, Soldat, nouveauControleur, Agent, Sauvetage, Glissement, PARAMS, JOURNAL, PRISE, ikDeuxOs, horsBloc, segCoupeBoite, segCoupeBoite3D, V3, Q, VERSION };
})();
`;
const sortie = entete + corps + pied;
fs.writeFileSync(path.join(racine, 'web/mm.js'), sortie);
console.log(`web/mm.js : ${lignes.length} lignes, ${(sortie.length / 1024).toFixed(0)} Ko (prototype v${(/const VERSION = (\d+)/.exec(corps) || [])[1]})`);
