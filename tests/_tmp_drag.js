// Vérifications de l'IA avec le contenu réel du jeu (parking, GIGN contre Groupe Karst, tactique Tiroir) :
// bonds alternés, prise en compte des alliés (ligne de tir, espacement, soutien), blessés à terre immobiles.
// usage : node tests/ia.js
const OT = Object.assign({}, require('../sim/rng.js'), require('../sim/data.js'), require('../sim/map.js'), require('../sim/engine.js'));
const { Battle, DATA } = OT;
let pass = 0, fail = 0;
// Fonctions désactivées pour l'instant (une seule classe : assaut ; plaques moyennes pour tous ; aucun accessoire ;
// voie d'approche automatique) : leurs vérifications sont mises de côté, à réactiver quand elles reviendront.
const DESACTIVE = ["tiroir : l'escouade est partagée"];
let skip = 0;
const check = (n, c, i) => { if (DESACTIVE.some(d => n.startsWith(d))) { skip++; console.log('(désactivé) ' + n); return; } if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + JSON.stringify(i))); };
const GIGN = ['op_vautour', 'op_lynx', 'op_granit', 'op_bastion', 'op_belier'], KARST = ['k_molosse', 'k_vipere', 'k_rapace', 'k_hyene', 'k_chacal'];
const mk = (seed, o) => new Battle(Object.assign({ seed, mapId: 'parking', teams: [
  { name: 'Alpha', order: 'careful', operators: GIGN, tactics: ['tiroir'] }, { name: 'Bravo', order: 'assault', operators: KARST, tactics: ['tiroir'] }] }, o || {}));

{
  // ---- Évacuation du blessé : un équipier tire un camarade à terre, à découvert, jusqu'au couvert, puis le relève ----
  // Scénario : un blessé (saignement) en terrain découvert, vu d'un ennemi à ~20 m ; le sauveteur à 3 m ; les autres loin.
  const setup = () => {
    const b = mk(11); const A = b.teams[0].units, E = b.teams[1].units;
    let sc = null;
    for (let x = 12; x < 34 && !sc; x += 1) for (let z = 4; z < 42 && !sc; z += 1) {
      if (b.map.insideObstacle(x, z) || b.map.insideObstacle(x - 3, z) || b.map.insideObstacle(x + 20, z) || !b.map.inBounds(x + 20, z)) continue;
      if (!b.map.hasLOS(x + 20, 1.6, z, x, 0.9, z) || !b.map.walkableSegment(x - 3, z, x, z)) continue;
      const c = b.dragCover(A[0], { x, z }, [{ x: x + 20, z }]);
      if (c && Math.hypot(c.x - x, c.z - z) > 2.5 && b.map.hasLOS(x + 20, 1.6, z, x - 3, 1.25, z)) sc = { x, z, c };
    }
    const [u, a] = A, e = E[0];
    a.x = sc.x; a.z = sc.z; a.alive = false; a.hp = 0; a.status = 'down'; a.downAt = -5; a.bleedUntil = 30;
    u.x = sc.x - 3; u.z = sc.z; u.hp = u.maxHp = 1e6;
    for (const o of A.slice(2)) { o.x = 3; o.z = 23; }
    e.x = sc.x + 20; e.z = sc.z; e.hp = e.maxHp = 1e6; e.weapon = Object.assign({}, e.weapon, { accuracy: 0 });
    for (const o of E.slice(1)) { o.x = 69; o.z = 23; }
    b.teams[1].order = 'hold';
    return { b, u, a, e, sc };
  };
  const run = () => {
    const S = setup(), { b, u, a, sc } = S; const sp = []; let prev = null, revivedAt = null, pullPos = [];
    const walk = (() => { const st = u.state; u.state = 'idle'; const v = u.speed(); u.state = st; return v; })();
    while (b.t < 40 && !b.over) {
      b.step();
      if (u.drag && u.drag.phase === 'pull' && u.moving && prev) { sp.push(Math.hypot(u.x - prev.x, u.z - prev.z) / OT.DT); pullPos.push(Math.round(a.x * 100) + ',' + Math.round(a.z * 100)); }
      prev = { x: u.x, z: u.z };
      if (a.alive && revivedAt === null) { revivedAt = b.t; break; }
    }
    return { S, sp, walk, revivedAt, moved: Math.hypot(a.x - sc.x, a.z - sc.z), hidden: !b.map.hasLOS(sc.x + 20, 1.6, sc.z, a.x, 0.5, a.z), trace: pullPos.join(';') + '|' + b.log.map(l => l.text).join('\n') };
  };
  const R = run(); console.log(R.sp.map(v=>v.toFixed(2)).join(" ")); const mean = R.sp.length ? R.sp.reduce((s, v) => s + v, 0) / R.sp.length : 0;
  const log = R.S.b.log;
  check('évacuation : un blessé à découvert est tiré jusqu\'au couvert (« Je le tire à couvert ! »), posé à l\'abri des vues, puis relevé',
    log.some(l => l.kind === 'drag' && /Je le tire à couvert/.test(l.text)) && R.moved > 1.5 && R.hidden && R.revivedAt !== null && log.some(l => l.kind === 'revive_start' && /à l'abri/.test(l.text)),
    { moved: R.moved, hidden: R.hidden, revivedAt: R.revivedAt });
  check('évacuation : le sauveteur recule plus lentement qu\'il ne marche (55–65 % de son allure), le corps à ~1 m devant lui',
    R.sp.length > 5 && mean > R.walk * 0.5 && mean < R.walk * 0.66, { mean, walk: R.walk, n: R.sp.length });
  check('évacuation : la bataille revue est identique (positions du corps tiré, journal)', R.trace === run().trace);
  // fumigène : bloque la vue (repérage, tir visé) pendant sa durée, puis se dissipe
  const b = mk(12); b.map.obstacles = []; const [u] = b.teams[0].units, [e] = b.teams[1].units;
  u.x = 10; u.z = 20; e.x = 30; e.z = 20;
  const G = OT.DATA.GRENADES.smoke;
  b.grenadesInFlight = [{ kind: 'smoke', team: 0, thrower: u, from: { x: 10, z: 20 }, x: 20, z: 20, landAt: b.t, explodeAt: b.t + 0.05, landed: false }];
  const before = b.canSee(u, e) && b.canSee(e, u);
  for (const x of b.units) if (x !== u && x !== e) { x.x = 60; x.z = x.team ? 3 : 43; }
  b.updateGrenades(); b.t += 0.1; b.updateGrenades();
  const during = b.map.dynamic.length === 1 && !b.canSee(u, e) && !b.canSee(e, u), until = b.map.dynamic[0] && b.map.dynamic[0].until;
  const ev = b.drainEvents ? b.drainEvents().some(x => x.type === 'smoke') : true;
  let lasted = true; while (b.t < until - 0.2) { b.step(); u.x = 10; u.z = 20; e.x = 30; e.z = 20; if (b.canSee(u, e)) lasted = false; }
  while (b.t < until + 0.5) b.step(); u.x = 10; u.z = 20; e.x = 30; e.z = 20;
  check('fumigène : bloque la ligne de vue dans les deux sens pendant ' + G.duration + ' s, puis se dissipe', before && during && ev && lasted && b.map.dynamic.length === 0 && b.canSee(u, e), { before, during, ev, lasted, left: b.map.dynamic.length });
}
