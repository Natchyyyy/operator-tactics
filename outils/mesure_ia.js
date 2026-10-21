// Mesures du comportement de l'IA sur N batailles (avant / après un changement) :
//   exposition : part du temps « en contact » où un soldat est vu par un ennemi SANS couvert entre eux
//   réaction   : délai entre le premier ennemi vu et le premier geste utile (tir, ou arrivée à couvert)
//   demi-tours : marche qui repart en sens inverse (> 150°) en moins de 2 s, avec l'état avant / après
//   cadence    : coups tirés par soldat et par minute de contact ; durée des batailles ; victoires
// usage : node outils/mesure_ia.js [N=30] [--detail]
const OT = Object.assign({}, require('../sim/rng.js'), require('../sim/data.js'), require('../sim/map.js'), require('../sim/engine.js'));
const { Battle } = OT;
const N = +process.argv[2] || 30, DETAIL = process.argv.includes('--detail');
const A = ['op_vautour', 'op_lynx', 'op_granit', 'op_bastion', 'op_belier'], K = ['k_molosse', 'k_vipere', 'k_rapace', 'k_hyene', 'k_chacal'];
let contactT = 0, exposedT = 0, exposedFireT = 0, reacts = [], uturns = [], shots = 0, dur = 0, wins = [0, 0, 0], kills = 0, peekT = 0, hiddenT = 0;
const why = {};
for (let s = 1; s <= N; s++) {
  const b = new Battle({ seed: s * 7 + 1, mapId: 'parking', teams: [{ name: 'A', order: 'careful', operators: A, tactics: [] }, { name: 'B', order: 'assault', operators: K, tactics: [] }] });
  const st = {};
  for (const u of b.units) st[u.id] = { seen: null, reacted: false, dirs: [] };
  while (!b.over && b.t < 300) {
    b.step();
    for (const u of b.units) {
      if (!u.alive) continue;
      const S = st[u.id];
      const foes = b.enemiesOf(u).filter(e => e.alive);
      const seenBy = foes.filter(e => e.visible.has(u.id));
      const inContact = u.visible.size > 0 || seenBy.length > 0 || b.t - u.lastShotByAt < 2;
      if (inContact) {
        contactT += 0.1;
        if (u.peeking) peekT += 0.1;
        if (!seenBy.length) hiddenT += 0.1;
        const naked = seenBy.some(e => !b.map.coverFrom(u.x, u.z, e.x, e.z, u.stance === 'stand') && !u.peeking);
        if (naked) { exposedT += 0.1; if (b.t - u.lastShotAt < 0.5) exposedFireT += 0.1; }
      }
      if (u.visible.size && S.seen === null) S.seen = b.t;
      if (S.seen !== null && !S.reacted && (u.lastShotAt >= S.seen || (u.goalKind === null && b.mainThreat(u) && b.coverAt(u.x, u.z, b.mainThreat(u).x, b.mainThreat(u).z, false)))) { S.reacted = true; reacts.push(b.t - S.seen); }
      if (u.moving && u.state !== 'evade' && !u.drag) {
        const d = u.mvDir; S.dirs.push({ t: b.t, d, st: u.state, g: u.goalKind });
        while (S.dirs.length && b.t - S.dirs[0].t > 2) S.dirs.shift();
        const o = S.dirs[0]; let dd = Math.abs(d - o.d); if (dd > Math.PI) dd = 2 * Math.PI - dd;
        const gd = u.goal ? Math.hypot(u.goal.x - u.x, u.goal.z - u.z) : 0;
        if (dd > 2.6 && b.t - (S.lastU || -9) > 3 && gd > 2.5) { S.lastU = b.t; const k = `${o.st}/${o.g} -> ${u.state}/${u.goalKind}`; why[k] = (why[k] || 0) + 1; uturns.push({ s, u: u.callsign, t: b.t, k, gd: +gd.toFixed(1) }); }
      } else if (!u.moving) S.dirs.length = 0;
    }
  }
  for (const u of b.units) shots += u.stats.shots;
  kills += b.units.filter(u => !u.alive).length;
  dur += b.t; const w = b.result ? b.result.winner : -1; wins[w === 0 ? 0 : w === 1 ? 1 : 2]++;
}
const avg = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length) : 0;
const med = a => { const c = a.slice().sort((x, y) => x - y); return c.length ? c[c.length >> 1] : 0; };
console.log(`batailles ${N} : durée moy ${(dur / N).toFixed(0)} s ; victoires A/B/nul ${wins.join('/')} ; morts/bataille ${(kills / N).toFixed(1)}`);
console.log(`exposition (vu sans couvert, en contact) : ${(100 * exposedT / contactT).toFixed(1)} %  (dont en tirant ${(100 * exposedFireT / contactT).toFixed(1)} %) ; caché ${(100 * hiddenT / contactT).toFixed(1)} % ; au coin ${(100 * peekT / contactT).toFixed(1)} %`);
console.log(`réaction au premier contact : moyenne ${avg(reacts).toFixed(2)} s, médiane ${med(reacts).toFixed(2)} s`);
console.log(`cadence : ${(shots / (contactT / 60)).toFixed(0)} coups par soldat-minute de contact ; demi-tours (> 2,5 m) ${uturns.length} (${(uturns.length / N).toFixed(1)}/bataille)`);
const top = Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, 10);
for (const [k, n] of top) console.log(`   ${n}× ${k}`);
if (DETAIL) for (const x of uturns.slice(0, 30)) console.log('  ', JSON.stringify(x));
