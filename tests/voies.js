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
  // (16 graines : sur 4 puis sur 8, un ou deux flanqueurs tués avant d'arriver à hauteur suffisaient à passer sous le seuil)
  let n = 0, rab = 0;
  for (let s = 1; s <= 16; s++) {
    const b = mk(s, { objective: { type: 'capture' } });
    while (!b.over && b.t < 60) b.step();
    for (const u of b.units) if (u.voie && (u.alive || u.flankDone)) { n++; if (u.flankDone) rab++; }   // (un flanqueur tué en route ne compte pas : le combat est plus rapide depuis le 21/10)
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
{
  // pas d'allers-retours : un opérateur ne rebrousse pas chemin (> 150°) d'un pas sur l'autre à plus de 2 m/s (point de
  // passage occupé par un camarade, poussée de séparation qui renvoie d'un côté puis de l'autre : « moonwalk » à l'écran).
  // Les pas de côté de déblocage (0,5 m d'un coup) sont comptés à part. Avant correction (8 batailles) : 184 inversions,
  // 7 épisodes (≥ 3 en 1 s) ; après : ~12, 0.
  let inv = 0, osc = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const b = new Battle({ seed, mapId: 'parking' }), prev = {}, vel = {}, hist = {};
    while (!b.over && b.t < 300) {
      for (const u of b.units) prev[u.id] = [u.x, u.z];
      b.step();
      for (const u of b.units) {
        const vx = (u.x - prev[u.id][0]) / 0.1, vz = (u.z - prev[u.id][1]) / 0.1, sp = Math.hypot(vx, vz), pv = vel[u.id];
        if (pv && sp > 2 && pv.sp > 2 && sp < 4.9 && pv.sp < 4.9 && (vx * pv.vx + vz * pv.vz) / (sp * pv.sp) < -0.866) {
          inv++; const h = (hist[u.id] = (hist[u.id] || []).filter(t => b.t - t < 1)); h.push(b.t); if (h.length === 3) osc++;
        }
        vel[u.id] = { vx, vz, sp };
      }
    }
  }
  check('marche : pas d\'allers-retours d\'un pas sur l\'autre (8 batailles : aucun épisode, inversions rares)', osc === 0 && inv < 40, { inv, osc });
}

{
  // « raser un mur » (doctrine, 20/10) : en progression, les chemins longent les obstacles — moins de mètres à découvert,
  // pour un détour léger
  const m = new OT.GameMap(MAPS.parking), R = new OT.RNG(5), rnd = () => R.next();
  let o0 = 0, o1 = 0, L0 = 0, L1 = 0, n = 0;
  const len = (p, x, z) => { let L = 0, px = x, pz = z, o = 0; for (const q of p) { L += Math.hypot(q.x - px, q.z - pz); o += m.openLen(px, pz, q.x, q.z); px = q.x; pz = q.z; } return [L, o]; };
  for (let i = 0; i < 300 && n < 120; i++) {
    const ax = 2 + rnd() * 68, az = 2 + rnd() * 42, bx = 2 + rnd() * 68, bz = 2 + rnd() * 42;
    if (m.insideObstacle(ax, az) || m.insideObstacle(bx, bz) || Math.hypot(bx - ax, bz - az) < 15) continue;
    const p0 = m.findPath(ax, az, bx, bz), p1 = m.findPath(ax, az, bx, bz, null, true); if (!p0 || !p1) continue;
    const [a, b] = len(p0, ax, az), [c, d] = len(p1, ax, az); L0 += a; o0 += b; L1 += c; o1 += d; n++;
  }
  check('raser un mur : chemins de progression moins à découvert (≥ 30 % de mètres en moins), détour < 12 %', n >= 80 && o1 < o0 * 0.7 && L1 < L0 * 1.12, { n, open: [o0 | 0, o1 | 0], len: [L0 | 0, L1 | 0] });
}
{
  // « ralentir avant un angle » : un coin aveugle sur le chemin se prend au pas lent ; pas de freinage sans angle mort, ni en
  // course d'urgence
  const b = mk(3); const u = b.teams[0].units[0]; b.map.obstacles = [{ x: 10, z: 10, w: 6, d: 6, h: 3, kind: 'wall', name: 'bloc' }];
  u.x = 14.7; u.z = 7.5; u.goalKind = 'advance'; u.dash = false; u.target = null;
  const W = { x: 16.6, z: 9.4 }; u.path = [W, { x: 16.8, z: 16 }]; u.pathIdx = 0; u.corner = null;
  const far = b.cornerSpeed(u, W, 5); u.corner = null;
  const slow = b.cornerSpeed(u, W, 2.5); u.corner = null; const slowNear = b.cornerSpeed(u, W, 1.0);
  u.path = [W, { x: 22, z: 4 }]; u.corner = null; const open = b.cornerSpeed(u, W, 1.0);
  u.path = [W, { x: 16.8, z: 16 }]; u.corner = null; u.goalKind = 'cover'; const rush = b.cornerSpeed(u, W, 1.0);
  check('ralentir avant un angle : on freine en approchant d\'un coin aveugle (pas lent au coin), pas devant un virage dégagé ni en course vers un abri', far === Infinity && slow < 3 && slowNear < 1.5 && open === Infinity && rush === Infinity, { far, slow, slowNear, open, rush });
}

console.log(`\n${pass}/${pass + fail} vérifications réussies${fail ? '  — ÉCHECS : ' + fail : ''}`);
process.exit(fail ? 1 : 0);
