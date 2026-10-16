// Vérifications automatiques du moteur de combat. usage : node tests/verify.js [nombre de graines]
// Chaque test vérifie un comportement RÉEL de la simulation (pas une valeur affichée).
const OT = Object.assign({}, require('../sim/rng.js'), require('../sim/data.js'), require('../sim/map.js'), require('../sim/engine.js'));
const { Battle, GameMap, MAPS, DATA } = OT;
let pass = 0, fail = 0;
function check(name, cond, info) { if (cond) pass++; else fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  -> ' + (info === undefined ? '' : JSON.stringify(info)))); }

// ---- Instrumentation : on intercepte chaque tir pour vérifier les règles au moment où il part -----------------
const violations = [];
const origShoot = Battle.prototype.shoot;
Battle.prototype.shoot = function (u, e, d) {
  if (!u.alive) violations.push(`${u.callsign} tire alors qu'il est hors de combat`);
  if (!e.alive) violations.push(`${u.callsign} tire sur ${e.callsign} déjà hors de combat`);
  if (u.reloading > 0) violations.push(`${u.callsign} tire pendant un rechargement`);
  if (u.ammo <= 0) violations.push(`${u.callsign} tire sans munition dans le chargeur`);
  if (!u.visible.has(e.id)) violations.push(`${u.callsign} tire sur ${e.callsign} sans l'avoir repéré`);
  if (!this.canSee(u, e)) violations.push(`${u.callsign} tire sur ${e.callsign} sans ligne de vue (${d.toFixed(1)} m)`);
  return origShoot.call(this, u, e, d);
};
const origStep = Battle.prototype.step;
Battle.prototype.step = function () {
  origStep.call(this);
  for (const u of this.units) {
    if (this.map.insideObstacle(u.x, u.z)) violations.push(`${u.callsign} est à l'intérieur d'un obstacle en (${u.x.toFixed(1)}, ${u.z.toFixed(1)})`);
    if (u.ammo < 0 || u.mags < 0) violations.push(`${u.callsign} munitions négatives`);
    if (!u.alive) { if (u._downPos && (Math.abs(u._downPos.x - u.x) > 1e-9 || Math.abs(u._downPos.z - u.z) > 1e-9)) violations.push(`${u.callsign} bouge après neutralisation`); u._downPos = u._downPos || { x: u.x, z: u.z }; }
  }
};

const N = parseInt(process.argv[2] || '40', 10);

// ---- 1. Des batailles complètes, de bout en bout -------------------------------------------------------------
const results = []; let maxMs = 0;
for (let seed = 1; seed <= N; seed++) {
  const b = new Battle({ seed });
  const t0 = Date.now(); b.run(); maxMs = Math.max(maxMs, Date.now() - t0);
  results.push({ seed, b, r: b.result });
}
check(`${N} batailles se terminent avec un résultat`, results.every(x => x.r && x.b.over));
check('aucune règle de tir / déplacement violée pendant ces batailles', violations.length === 0, violations.slice(0, 5));
check('temps de calcul raisonnable (< 3 s par bataille)', maxMs < 3000, maxMs);
const durations = results.map(x => x.r.duration);
console.log(`   durées : min ${Math.min(...durations).toFixed(0)} s, moyenne ${(durations.reduce((a, b) => a + b, 0) / N).toFixed(0)} s, max ${Math.max(...durations).toFixed(0)} s`);
const wins = [0, 0, 0]; for (const x of results) wins[x.r.winner === -1 ? 2 : x.r.winner]++;
console.log(`   victoires : Alpha ${wins[0]}, Bravo ${wins[1]}, égalités ${wins[2]}`);

// ---- 2. Le journal correspond exactement aux événements simulés ----------------------------------------------
let logOk = true, logInfo = null;
for (const { b, r } of results) {
  const hitEntries = b.log.filter(e => e.kind === 'hit' || e.kind === 'down').length;
  const hits = b.units.reduce((s, u) => s + u.stats.hits, 0);
  const downs = b.log.filter(e => e.kind === 'down').length, dead = b.units.filter(u => !u.alive).length;
  const reloads = b.log.filter(e => e.kind === 'reload').length, reloadStats = b.units.reduce((s, u) => s + u.stats.reloads, 0);
  const dmgLogged = b.log.filter(e => e.kind === 'hit' || e.kind === 'down').reduce((s, e) => s + e.dmg, 0);
  const dmgStats = b.units.reduce((s, u) => s + u.stats.damageDealt, 0);
  const alive = b.teams.map(t => t.units.filter(u => u.alive).length);
  const winnerOk = r.winner === -1 ? true : (alive[1 - r.winner] === 0 || b.t >= b.timeLimit || r.reason.includes('Plus personne'));
  const shotsOk = r.teams.reduce((s, t) => s + t.shots, 0) === b.units.reduce((s, u) => s + u.stats.shots, 0);
  if (hitEntries !== hits || downs !== dead || reloads !== reloadStats || Math.abs(dmgLogged - dmgStats) > 0.01 || !winnerOk || !shotsOk) {
    logOk = false; logInfo = { seed: b.seed, hitEntries, hits, downs, dead, reloads, reloadStats, dmgLogged, dmgStats, winnerOk, shotsOk }; break;
  }
}
check('journal = événements (touchés, neutralisations, rechargements, dégâts, vainqueur)', logOk, logInfo);

// ---- 3. Déterminisme : même graine → même bataille ---------------------------------------------------------------
{
  const a = new Battle({ seed: 7 }); a.run(); const b = new Battle({ seed: 7 }); b.run();
  check('même graine → même journal', JSON.stringify(a.log) === JSON.stringify(b.log));
  const c = new Battle({ seed: 8 }); c.run();
  check('graine différente → bataille différente', JSON.stringify(a.log) !== JSON.stringify(c.log));
}

// ---- 4. Scénarios contrôlés -----------------------------------------------------------------------------------
function duel(opts) {
  // deux opérateurs placés à la main, ordres « tenir » (ils ne bougent pas, ils tirent à vue)
  const b = new Battle({ seed: opts.seed || 3, teams: [
    { name: 'A', order: 'hold', operators: [opts.a] }, { name: 'B', order: 'hold', operators: [opts.b] }] });
  const ua = b.teams[0].units[0], ub = b.teams[1].units[0];
  ua.x = opts.pa.x; ua.z = opts.pa.z; ub.x = opts.pb.x; ub.z = opts.pb.z;
  ua.home = { x: ua.x, z: ua.z }; ub.home = { x: ub.x, z: ub.z };
  ua.facing = Math.atan2(ub.z - ua.z, ub.x - ua.x); ub.facing = ua.facing + Math.PI;
  if (opts.freeze) { b.setGoal = () => false; } // personne ne se déplace : on teste la vue et le tir purs
  b.run(opts.time || 20);
  return { b, ua, ub };
}
{
  // le bâtiment central est entre les deux : aucune ligne de vue, aucun tir
  const { b, ua, ub } = duel({ a: 'op_vautour', b: 'op_cobra', pa: { x: 20, z: 16 }, pb: { x: 44, z: 16 }, freeze: true });
  check('un mur plein bloque la vue et les tirs (0 tir en 20 s)', ua.stats.shots === 0 && ub.stats.shots === 0 && ua.visible.size === 0, { a: ua.stats.shots, b: ub.stats.shots });
  check('… et la carte confirme que le rayon traverse un obstacle', b.map.blocker(20, 1.6, 16, 44, 1.25, 16) !== null);
}
{
  // même distance mais en terrain découvert : repérage et tirs
  const { ua, ub } = duel({ a: 'op_vautour', b: 'op_cobra', pa: { x: 8, z: 2.5 }, pb: { x: 28, z: 2.5 }, freeze: true });
  check('à découvert, les deux opérateurs se repèrent et tirent', ua.stats.shots > 0 && ub.stats.shots > 0, { a: ua.stats.shots, b: ub.stats.shots });
}
{
  // un couvert bas cache un opérateur accroupi, mais pas debout
  const map = new GameMap(MAPS.entrepot);
  // caisses en (17,4) 2x2 h1.1 ; tireur à l'est en (24,5), cible juste à l'ouest des caisses en (16.3,5)
  const seenStanding = map.hasLOS(24, 1.6, 5, 16.3, 1.25, 5), seenCrouched = map.hasLOS(24, 1.6, 5, 16.3, 0.75, 5);
  check('un couvert bas cache une cible accroupie mais pas debout', seenStanding && !seenCrouched, { seenStanding, seenCrouched });
  const cv = map.coverFrom(16.3, 5, 24, 5, true);
  check('la cible debout derrière les caisses est en couvert partiel', cv && cv.level === 'partial', cv);
  check('sans obstacle entre les deux, pas de couvert', map.coverFrom(16.3, 1.5, 24, 1.5, true) === null);
}
{
  // munitions : un chargeur vide impose un rechargement avant de retirer
  let ok = true, info = null;
  for (const { b } of results.slice(0, 15)) {
    for (const u of b.units) if (u.stats.reloads === 0 && u.stats.shots > u.weapon.mag) { ok = false; info = `${u.callsign} a tiré ${u.stats.shots} balles avec un chargeur de ${u.weapon.mag} sans recharger`; }
    // chaque « reload » est suivi d'un « reloaded » au plus tôt après la durée de l'arme
    const byUnit = {};
    for (const e of b.log) if (e.kind === 'reload' || e.kind === 'reloaded') (byUnit[e.unit] = byUnit[e.unit] || []).push(e);
    for (const id in byUnit) { const ev = byUnit[id]; const u = b.units.find(x => x.id === id);
      for (let i = 0; i + 1 < ev.length; i++) if (ev[i].kind === 'reload' && ev[i + 1].kind === 'reloaded' && ev[i + 1].t - ev[i].t < u.weapon.reload - 0.15) { ok = false; info = `${u.callsign} a rechargé en ${(ev[i + 1].t - ev[i].t).toFixed(1)} s (arme : ${u.weapon.reload} s)`; } }
  }
  check('un chargeur vide impose un rechargement de la durée prévue', ok, info);
}
{
  // armure : à arme et localisation égales, les plaques lourdes absorbent plus que le gilet léger
  const dmg = { light: [], heavy: [] };
  for (const { b } of results) for (const e of b.log) if ((e.kind === 'hit' || e.kind === 'down') && e.loc === 'torse') {
    const shooter = b.units.find(u => u.id === e.unit), target = b.units.find(u => u.id === e.enemy);
    if (shooter.weapon.id === 'carbine' && (target.armor.id === 'light' || target.armor.id === 'heavy')) dmg[target.armor.id].push(e.dmg);
  }
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  check('les plaques lourdes réduisent les dégâts au torse par rapport au gilet léger (carabine)', dmg.light.length > 5 && dmg.heavy.length > 5 && mean(dmg.heavy) < mean(dmg.light) * 0.7, { light: mean(dmg.light), heavy: mean(dmg.heavy), n: [dmg.light.length, dmg.heavy.length] });
  // … et un coût en mobilité
  const b0 = results[0].b; const light = b0.units.find(u => u.armor.id === 'light'), heavy = b0.units.find(u => u.armor.id === 'heavy');
  const heavyBase = DATA.ARMORS.heavy.mobility, lightBase = DATA.ARMORS.light.mobility;
  check('les plaques lourdes ralentissent (multiplicateur de vitesse plus faible)', heavyBase < lightBase && heavy.speed() / (1.5 + heavy.def.mobility / 100 * 1.4) < light.speed() / (1.5 + light.def.mobility / 100 * 1.4));
}
{
  // armes : avantages et inconvénients réels (chance de toucher et dégâts selon la distance)
  const b = results[0].b; const rng = b.rng;
  const shooterS = b.units.find(u => u.weapon.id === 'shotgun'), shooterC = b.units.find(u => u.weapon.id === 'carbine'), shooterD = b.units.find(u => u.weapon.id === 'dmr');
  const tgt = b.teams[1].units[0];
  const pAt = (u, d) => { const save = [tgt.x, tgt.z, u.x, u.z, u.moving, tgt.moving, u.stance, tgt.stance, u.suppression]; u.x = 2; u.z = 2; tgt.x = 2 + d; tgt.z = 2; u.moving = false; tgt.moving = false; u.stance = 'stand'; tgt.stance = 'stand'; u.suppression = 0; const p = b.hitChance(u, tgt, d).p; [tgt.x, tgt.z, u.x, u.z, u.moving, tgt.moving, u.stance, tgt.stance, u.suppression] = save; return p; };
  check('fusil à pompe : très efficace à 5 m, quasi inutile à 40 m', pAt(shooterS, 5) > 0.5 && pAt(shooterS, 40) < 0.1, { p5: pAt(shooterS, 5), p40: pAt(shooterS, 40) });
  check('fusil de précision : meilleur que la carabine à 70 m, pénalisé à 5 m', pAt(shooterD, 70) > pAt(shooterC, 70) * 1.5 && pAt(shooterD, 5) < pAt(shooterD, 30), { d70: pAt(shooterD, 70), c70: pAt(shooterC, 70), d5: pAt(shooterD, 5), d30: pAt(shooterD, 30) });
  check('la cadence et le chargeur diffèrent réellement (mitrailleuse : 100 coups, rechargement long)', DATA.WEAPONS.lmg.mag > 3 * DATA.WEAPONS.carbine.mag && DATA.WEAPONS.lmg.reload > 2 * DATA.WEAPONS.carbine.reload);
  // le fusil de précision fait plus de dégâts par balle : vérifié sur les touchés au torse non protégés… via la donnée et le calcul de dégâts
  check('dégâts par balle : fusil de précision > carabine > pistolet-mitrailleur', DATA.WEAPONS.dmr.damage > DATA.WEAPONS.carbine.damage && DATA.WEAPONS.carbine.damage > DATA.WEAPONS.smg.damage);
}
{
  // ordres : « tenir » change réellement le comportement (distance parcourue bien plus faible)
  const dist = (order) => { let s = 0; for (let seed = 1; seed <= 6; seed++) { const t = Battle.defaultTeams(); t[0].order = order; const b = new Battle({ seed, teams: t }); b.run(); s += b.teams[0].units.reduce((a, u) => a + u.stats.distance, 0); } return s / 6; };
  const dHold = dist('hold'), dAssault = dist('assault'), dCareful = dist('careful');
  check('ordre « Tenir » : l\'équipe parcourt beaucoup moins de distance qu\'en « Assaut »', dHold < dAssault * 0.5, { dHold, dAssault });
  check('ordre « Prudent » : comportement intermédiaire ou différent', Math.abs(dCareful - dAssault) > 1 || Math.abs(dCareful - dHold) > 1, { dCareful, dHold, dAssault });
  const tH = Battle.defaultTeams(); tH[0].order = 'hold'; tH[1].order = 'hold'; const bh = new Battle({ seed: 2, teams: tH }); bh.run();
  check('« Tenir » contre « Tenir » : la bataille se termine quand même (limite de temps / décision)', bh.over && bh.result, bh.result && bh.result.reason);
}
{
  // obstacles : le chemin contourne le bâtiment central et ne traverse aucun obstacle
  const map = new GameMap(MAPS.entrepot);
  const path = map.findPath(20, 20, 44, 20);
  let crosses = false;
  if (path) for (let i = 0; i + 1 < path.length; i++) if (!map.walkableSegment(path[i].x, path[i].z, path[i + 1].x, path[i + 1].z)) crosses = true;
  const len = path ? path.reduce((s, p, i) => i ? s + Math.hypot(p.x - path[i - 1].x, p.z - path[i - 1].z) : 0, 0) : 0;
  check('un chemin valide contourne le bâtiment (plus long que la ligne droite, sans traverser d\'obstacle)', path && !crosses && len > 24.5, { len, crosses });
  check('une destination à l\'intérieur d\'un obstacle est ramenée à la case libre la plus proche', map.findPath(2, 2, 30, 16) !== null);
  // un soldat posé dans un obstacle (cas anormal) en ressort grâce au chemin recalculé
  const b = new Battle({ seed: 5 }); const u = b.teams[0].units[0]; u.x = 30; u.z = 16; b.run(30);
  check('un opérateur « bloqué » dans un obstacle en ressort sans planter la simulation', !b.map.insideObstacle(u.x, u.z) || !u.alive);
}
{
  // sans munitions : une équipe à 0 balle ne tire plus, se cache, et la bataille se termine
  const t = Battle.defaultTeams(); const b = new Battle({ seed: 4, teams: t });
  for (const u of b.teams[1].units) { u.ammo = 0; u.mags = 0; }
  b.run();
  check('équipe sans munitions : zéro tir, et la bataille se conclut', b.teams[1].units.every(u => u.stats.shots === 0) && b.over, { reason: b.result && b.result.reason, shots: b.teams[1].units.map(u => u.stats.shots) });
  check('… le journal signale la pénurie', b.log.some(e => e.kind === 'noammo'));
}
{
  // suppression : un opérateur sous le feu voit sa précision baisser
  const b = results[0].b; const u = b.units[0], e = b.teams[1].units[0];
  u.x = 2; u.z = 2; e.x = 22; e.z = 2; u.moving = false; e.moving = false; u.stance = 'stand'; e.stance = 'stand';
  u.suppression = 0; const p0 = b.hitChance(u, e, 20).p; u.suppression = 0.9; const p1 = b.hitChance(u, e, 20).p; u.suppression = 0;
  check('la suppression réduit la chance de toucher', p1 < p0 * 0.8, { p0, p1 });
  u.status = 'critical'; const p2 = b.hitChance(u, e, 20).p; u.status = 'ok';
  check('une blessure grave réduit la chance de toucher et la vitesse', p2 < p0 && (() => { const v0 = u.speed(); u.status = 'critical'; const v1 = u.speed(); u.status = 'ok'; return v1 < v0; })(), { p0, p2 });
}

console.log(`\n${pass}/${pass + fail} vérifications réussies${fail ? '  — ÉCHECS : ' + fail : ''}`);
process.exit(fail ? 1 : 0);
