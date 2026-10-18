// Voies d'approche (carte qui décrit ses voies : le parking) : répartition automatique sur les flancs, tirée à la graine,
// et les flanqueurs prennent réellement leur voie avant de se rabattre. usage : node tests/voies.js
const OT = Object.assign({}, require('../sim/rng.js'), require('../sim/data.js'), require('../sim/map.js'), require('../sim/engine.js'));
const { Battle, MAPS } = OT;
let pass = 0, fail = 0;
const check = (n, c, i) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + JSON.stringify(i))); };
const ops = ['op_vautour', 'op_lynx', 'op_granit', 'op_bastion', 'op_belier'];
const mk = (seed, o) => new Battle(Object.assign({ seed, mapId: 'parking', teams: [{ name: 'A', operators: ops }, { name: 'B', operators: ops }] }, o || {}));
const V = MAPS.parking.voies;

{
  // répartition : 1 ou 2 par flanc, au moins un au milieu ; le plan et les flanqueurs changent avec la graine
  let ok = true; const plans = new Set(), who = new Set();
  for (let s = 1; s <= 30; s++) {
    const b = mk(s);
    for (const t of b.teams) {
      const n = t.units.filter(u => u.voie < 0).length, sd = t.units.filter(u => u.voie > 0).length, m = t.units.filter(u => u.voie === 0).length;
      if (n < 1 || n > 2 || sd < 1 || sd > 2 || m < 1) ok = false;
      plans.add(n + '/' + sd); who.add(t.units.filter(u => u.voie < 0).map(u => u.idx).join());
    }
  }
  check('voies : chaque escouade envoie 1 ou 2 opérateurs sur chaque flanc, au moins un tient le milieu', ok);
  check('voies : le plan (1-1, 2-1, 1-2, 2-2) et les flanqueurs varient avec la graine', plans.size === 4 && who.size >= 5, { plans: [...plans], who: who.size });
  const a = mk(7), b = mk(7);
  check('voies : même graine, même répartition', JSON.stringify(a.units.map(u => u.voie)) === JSON.stringify(b.units.map(u => u.voie)));
}
{
  // avant le contact, les flanqueurs rejoignent leur voie (nord z < 15, sud z > 31) ; le milieu reste au milieu
  let flank = 0, onLane = 0, mid = 0, midOk = 0;
  for (let s = 1; s <= 8; s++) {
    const b = mk(s), best = {};
    while (b.t < 14 && !b.units.some(u => u.visible.size)) {
      b.step();
      for (const u of b.units) if (u.voie) best[u.id] = Math.max(best[u.id] || 0, u.voie < 0 ? 15 - u.z : u.z - 31);
    }
    for (const u of b.units) {
      if (u.voie) { flank++; if (best[u.id] > 0) onLane++; } else { mid++; if (u.z > 15 && u.z < 31) midOk++; }
    }
  }
  check('voies : avant le contact, les flanqueurs sont sur leur flanc (nord / sud), le milieu reste au milieu', onLane >= flank * 0.8 && midOk >= mid * 0.9, { flank, onLane, mid, midOk });
}
{
  // un flanqueur se rabat une fois à hauteur de la zone (capture) : il finit par entrer dans la zone ou la couvrir depuis son flanc
  let n = 0, rab = 0;
  for (let s = 1; s <= 4; s++) {
    const b = mk(s, { objective: { type: 'capture' } });
    while (!b.over && b.t < 60) b.step();
    for (const u of b.units) if (u.voie) { n++; if (u.flankDone) rab++; }
  }
  check('voies (capture) : les flanqueurs arrivent par le flanc puis se rabattent sur la zone', rab >= n * 0.6, { n, rab });
}
{
  // « Tenir » : pas de manœuvre de flanc ; voie choisie par le joueur : respectée (z de la voie de la carte)
  const b = mk(3, { teams: [{ name: 'A', order: 'hold', operators: ops }, { name: 'B', operators: ops }] });
  const f = b.teams[0].units.find(u => u.voie);
  check('voies : ordre « Tenir », aucun point de flanc', f && b.flankWaypoint(f, b.map.spawns[1], 3) === null);
  const def = Object.assign({}, OT.DATA.OPERATORS.find(o => o.id === 'op_lynx'), { lane: 1 });
  const c = mk(3, { teams: [{ name: 'A', operators: [def, 'op_vautour', 'op_granit', 'op_bastion', 'op_belier'] }, { name: 'B', operators: ops }] });
  const l = c.teams[0].units[0];
  check('voies : la voie choisie par le joueur est respectée (sud → z de la voie sud)', l.voie === 1 && Math.abs(c.teams[0].spawn.z + c.laneOf(l) - V.sud) < 1e-9);
}

console.log(`\n${pass}/${pass + fail} vérifications réussies${fail ? '  — ÉCHECS : ' + fail : ''}`);
process.exit(fail ? 1 : 0);
