// Lance une bataille en ligne de commande et affiche le journal + le résultat.
// usage : node tests/run.js [graine] [ordreA] [ordreB] [--quiet]
const OT = Object.assign({}, require('../sim/rng.js'), require('../sim/data.js'), require('../sim/map.js'), require('../sim/engine.js'));
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const quiet = process.argv.includes('--quiet');
const seed = parseInt(args[0] || '1', 10);
const teams = OT.Battle.defaultTeams();
if (args[1]) teams[0].order = args[1];
if (args[2]) teams[1].order = args[2];
const b = new OT.Battle({ seed, teams });
const t0 = Date.now();
b.run();
const ms = Date.now() - t0;
if (!quiet) for (const e of b.log) if (!e.silent) console.log(`[${e.time}] ${e.text}`);
const r = b.result;
console.log(`\n=== ${r.winner === -1 ? 'ÉGALITÉ' : 'Victoire ' + r.teams[r.winner].name} en ${OT.fmtT(r.duration)} (${ms} ms de calcul) — ${r.reason}`);
for (const t of r.teams) {
  console.log(`\n${t.name} (${t.order}) — ${t.alive}/5 en état, ${t.hits}/${t.shots} tirs au but`);
  for (const u of t.units) console.log(`  ${u.callsign.padEnd(9)} ${u.role.padEnd(15)} ${u.status.padEnd(8)} PV ${String(u.hp).padStart(3)}/${u.maxHp}  tirs ${String(u.stats.shots).padStart(3)}  touchés ${String(u.stats.hits).padStart(3)} (${u.accuracy}%)  neutralisés ${u.stats.kills}  dégâts ${u.stats.damageDealt}/${u.stats.damageTaken}  mun. ${u.ammoLeft}  dist ${u.stats.distance} m`);
}
