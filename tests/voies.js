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

{
  // plans de voies équipés (tactique « plan ») : répartition fixée au départ ; voies imposées comptées dans le plan
  const lanes = (b, t) => [-1, 1, 0].map(l => b.teams[t].units.filter(u => u.voie === l).length).join('/');
  const T = (tac) => ({ teams: [{ name: 'A', operators: ops, tactics: tac }, { name: 'B', operators: ops }] });
  let ok = true; for (let s = 1; s <= 10; s++) { if (lanes(mk(s, T(['tiroir', 'tenailles'])), 0) !== '2/2/1' || lanes(mk(s, T(['rush_milieu'])), 0) !== '0/0/5') ok = false; }
  check('plans : Tenailles = 2 nord / 2 sud / 1 milieu, Rush milieu = tout le monde au milieu, quelle que soit la graine', ok);
  const def = Object.assign({}, OT.DATA.OPERATORS.find(o => o.id === 'op_lynx'), { lane: -1 });
  const c = mk(4, { teams: [{ name: 'A', operators: [def, 'op_vautour', 'op_granit', 'op_bastion', 'op_belier'], tactics: ['tenailles'] }, { name: 'B', operators: ops }] });
  check('plans : une voie imposée par le joueur compte dans le plan (Lynx au nord + Tenailles → toujours 2/2/1)', c.teams[0].units[0].voie === -1 && lanes(c, 0) === '2/2/1', lanes(c, 0));
  // relancé en bataille : les survivants sont redistribués, une utilisation consommée
  const b = mk(5, T(['rush_milieu']));
  while (b.t < 3) b.step();
  const r = b.command('tactic', 0, 'rush_milieu');
  check('plans : relancé en bataille, il redistribue les survivants (Rush milieu → tous au milieu) et consomme une utilisation', r.ok && lanes(b, 0) === '0/0/5' && b.teams[0].tactics.rush_milieu.uses === 1 && b.teams[0].units.every(u => u.voie === 0), lanes(b, 0));
}
{
  // Rotation (commande en bataille) : toute l'escouade passe par le flanc demandé, recharge 10 s, refusée en « Tenir »
  const b = mk(6);
  while (b.t < 2) b.step();
  const r = b.command('rotate', 0, -1), again = b.command('rotate', 0, 1);
  check('rotation : acceptée, toute l\'escouade (hors tireur d\'élite) passe au nord ; une seconde rotation immédiate est refusée (recharge)', r.ok && !again.ok && b.teams[0].units.every(u => u.voie === -1) && b.snapshot().teams[0].rotation === -1, { r, again });
  const reached = new Set(); while (b.t < 18) { b.step(); for (const u of b.teams[0].units) if (u.alive && u.z < 15) reached.add(u.id); }
  check('rotation : les opérateurs rejoignent réellement le flanc nord', reached.size >= 4, b.teams[0].units.map(u => u.z.toFixed(0)));
  const h = mk(6, { teams: [{ name: 'A', order: 'hold', operators: ops }, { name: 'B', operators: ops }] }); h.step();
  check('rotation : refusée en ordre « Tenir », refusée pour une voie inconnue', !h.command('rotate', 0, 1).ok && !mk(6).command('rotate', 0, 2).ok);
  // rejouable : mêmes commandes au même pas → même bataille
  const a = mk(8); while (a.t < 5) a.step(); a.command('rotate', 0, 1); while (a.t < 20) a.step(); a.command('rotate', 0, 0); a.run();
  const rp = mk(8, { replayInputs: a.inputs }); rp.run();
  check('rotation : la bataille revue (commandes rejouées au même pas) est identique', a.inputs.length === 2 && JSON.stringify(a.result.teams) === JSON.stringify(rp.result.teams) && a.result.duration === rp.result.duration);
  const sn = mk(9).snapshot();
  check('instantané : voie de chaque opérateur, plan et rotation de chaque équipe', sn.units.every(u => [-1, 0, 1].includes(u.voie)) && sn.teams.length === 2 && sn.teams[0].plan === 'auto');
}

{
  // côté QG (game.js) : voie choisie par opérateur et plan équipé → bataille
  const G = require('../sim/game.js').Game, p = G.newProfile();
  G.setLane(p, 'op_lynx', 1); G.equipTactic(p, 'tenailles');
  const b = new Battle({ seed: 2, teams: G.buildTeams(p, OT.DATA.MISSIONS[0]) });
  const l = b.teams[0].units.find(u => u.def.id === 'op_lynx');
  check('QG : la voie choisie pour un opérateur et le plan équipé arrivent en bataille', G.planOf(p) === 'tenailles' && G.effectiveDef(p, 'op_lynx').lane === 1 && l.voie === 1 && b.teams[0].plan === 'tenailles' && b.teams[1].plan === 'auto');
  G.setLane(p, 'op_lynx', null); G.equipTactic(p, 'tenailles');
  check('QG : sans plan équipé ni voie imposée, répartition automatique', G.planOf(p) === 'auto' && G.effectiveDef(p, 'op_lynx').lane === null);
}

{
  // allure : on ne court pas en crabe ni à reculons aussi vite que droit devant (plafonds calés sur les animations)
  const b = mk(1), g = (v, d) => b.gaitSpeed(v, d * Math.PI / 180);
  check('allure : pleine vitesse jusqu\'à 30°, ≤ 2,0 m/s à 45°, 1,4 à 90°, 1,8 à reculons ; la marche lente n\'est pas touchée',
    g(2.6, 0) === 2.6 && g(2.6, 30) === 2.6 && Math.abs(g(2.6, 45) - 2) < 1e-9 && Math.abs(g(2.6, 90) - 1.4) < 1e-9 && Math.abs(g(2.6, 180) - 1.8) < 1e-9 && g(1.2, 90) === 1.2 && g(2.6, 60) < 2 && g(2.6, 60) > 1.4);
  // en bataille : un opérateur qui vise une cible au nord et marche vers l'est avance à ~1,4 m/s
  const c = mk(1), [u] = c.teams[0].units, e = c.teams[1].units[0];
  u.x = 20; u.z = 23; e.x = 20; e.z = 5; u.target = e; c.setGoal(u, 30, 23, 'advance');
  const x0 = u.x; for (let i = 0; i < 10; i++) c.move(u);
  check('allure : en pas chassé (cible sur le côté), ~1,4 m/s au lieu de sa pleine vitesse', u.x - x0 <= 1.55 && u.x - x0 > 0.5 && u.speed() > 2, { d: u.x - x0, v: u.speed() });   // (chemin sur les centres de cases : angle proche de 90°, pas exact)
}

console.log(`\n${pass}/${pass + fail} vérifications réussies${fail ? '  — ÉCHECS : ' + fail : ''}`);
process.exit(fail ? 1 : 0);
