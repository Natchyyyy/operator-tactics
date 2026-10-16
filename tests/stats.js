// Statistiques d'équilibrage sur N batailles : node tests/stats.js [N]
const OT = Object.assign({}, require('../sim/rng.js'), require('../sim/data.js'), require('../sim/map.js'), require('../sim/engine.js'));
const n = parseInt(process.argv[2] || '100', 10);
const agg = {}; let dur = 0, firstKill = 0, firstContact = 0; const wins = [0, 0, 0]; const dists = [];
for (let s = 1; s <= n; s++) {
  const b = new OT.Battle({ seed: s }); b.run(); dur += b.result.duration; wins[b.result.winner === -1 ? 2 : b.result.winner]++;
  const fk = b.log.find(e => e.kind === 'down'); firstKill += fk ? fk.t : b.t; const fc = b.log.find(e => e.kind === 'spot'); firstContact += fc ? fc.t : 0;
  for (const e of b.log) if (e.kind === 'hit' || e.kind === 'down') { const m = e.text.match(/, (\d+) m\)/); if (m) dists.push(+m[1]); }
  for (const u of b.units) { const a = agg[u.role.id] = agg[u.role.id] || { kills: 0, shots: 0, hits: 0, dealt: 0, taken: 0, alive: 0, n: 0, dist: 0, sup: 0 }; a.kills += u.stats.kills; a.shots += u.stats.shots; a.hits += u.stats.hits; a.dealt += u.stats.damageDealt; a.taken += u.stats.damageTaken; a.alive += u.alive ? 1 : 0; a.n++; a.dist += u.stats.distance; a.sup += u.stats.timeSuppressed; }
}
console.log(`durée moy ${(dur / n).toFixed(0)} s ; premier contact ${(firstContact / n).toFixed(1)} s ; première neutralisation ${(firstKill / n).toFixed(1)} s ; victoires A/B/nul ${wins.join('/')}`);
for (const r in agg) { const a = agg[r]; console.log(r.padEnd(9), 'neutr./bataille', (a.kills / a.n).toFixed(2), 'tirs', String(a.shots / a.n | 0).padStart(3), 'préc', (100 * a.hits / a.shots).toFixed(0).padStart(2) + '%', 'dégâts', (a.dealt / a.n).toFixed(0) + '/' + (a.taken / a.n).toFixed(0), 'survie', (100 * a.alive / a.n).toFixed(0) + '%', 'dist', (a.dist / a.n).toFixed(0), 'supprimé', (a.sup / a.n).toFixed(0) + 's'); }
dists.sort((a, b) => a - b); console.log('distance des touchés : médiane', dists[dists.length >> 1], 'p10', dists[Math.floor(dists.length * .1)], 'p90', dists[Math.floor(dists.length * .9)]);
