// Trace l'état des unités seconde par seconde entre deux instants : node tests/trace.js graine t0 t1 [callsign,...]
const OT = Object.assign({}, require('../sim/rng.js'), require('../sim/data.js'), require('../sim/map.js'), require('../sim/engine.js'));
const [seed, t0, t1, who] = [parseInt(process.argv[2] || '1'), parseFloat(process.argv[3] || '0'), parseFloat(process.argv[4] || '30'), process.argv[5]];
const b = new OT.Battle({ seed });
const filter = who ? who.split(',') : null;
let next = t0;
while (!b.over && b.t < t1) {
  b.step();
  if (b.t >= next - 1e-6) {
    next += 1;
    console.log(`--- t=${b.t.toFixed(1)}`);
    for (const u of b.units) {
      if (filter && !filter.includes(u.callsign)) continue;
      const tgt = u.target ? `${u.target.callsign}@${Math.hypot(u.target.x - u.x, u.target.z - u.z).toFixed(1)}m` : '-';
      console.log(`  ${u.team}${u.callsign.padEnd(9)} ${u.alive ? 'ok ' : 'DWN'} hp${String(Math.round(u.hp)).padStart(3)} (${u.x.toFixed(1)},${u.z.toFixed(1)}) ${u.stance.padEnd(6)} ${u.state.padEnd(9)} mun ${String(u.ammo).padStart(3)}/${u.mags} rel ${u.reloading.toFixed(1)} sup ${u.suppression.toFixed(2)} vis ${u.visible.size} aim ${u.aimTimer.toFixed(1)} tgt ${tgt} goal ${u.goal ? u.goalKind + '(' + u.goal.x.toFixed(0) + ',' + u.goal.z.toFixed(0) + ')' : '-'} mov ${u.moving ? 1 : 0}`);
    }
  }
}
