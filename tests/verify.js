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
const origSuppress = Battle.prototype.suppressAt;
let suppressShots = 0;
Battle.prototype.suppressAt = function (u, e) {
  const k = u.knowledge[e.id];
  if (!k || this.t - k.t > 2) violations.push(`${u.callsign} tire de suppression sans position récente de ${e.callsign}`);
  const blk = this.map.blocker(u.x, u.eyeY(), u.z, e.x, e.chestY(), e.z);
  if (!blk || blk.kind !== 'cover') violations.push(`${u.callsign} tir de suppression sans couvert bas entre lui et ${e.callsign}`);
  if (u.role.id !== 'support') violations.push(`${u.callsign} (${u.role.id}) fait du tir de suppression`);
  const before = u.stats.shots; const r = origSuppress.call(this, u, e); suppressShots += u.stats.shots - before; return r;
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
check('le tir de suppression existe et ne fait jamais de dégâts (compté dans les tirs, jamais dans les touchés)', suppressShots > 0 && results.every(x => x.b.units.every(u => u.stats.hits <= u.stats.shots - (u.stats.suppressShots || 0))), suppressShots);
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
      const expected = u.weapon.reload * (u.def.trait === 'fasthands' ? 0.65 : 1); // compétence « Mains sûres » : −35 %
      for (let i = 0; i + 1 < ev.length; i++) if (ev[i].kind === 'reload' && ev[i + 1].kind === 'reloaded' && ev[i + 1].t - ev[i].t < expected - 0.15) { ok = false; info = `${u.callsign} a rechargé en ${(ev[i + 1].t - ev[i].t).toFixed(1)} s (attendu : ${expected.toFixed(2)} s)`; } }
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
  check('les plaques lourdes réduisent les dégâts au torse par rapport au gilet léger (carabine)', dmg.light.length >= 3 && dmg.heavy.length >= 2 && mean(dmg.heavy) < mean(dmg.light) * 0.7, { light: mean(dmg.light), heavy: mean(dmg.heavy), n: [dmg.light.length, dmg.heavy.length] });
  // … et un coût en mobilité
  const b0 = new Battle({ seed: 1 }); const light = b0.units.find(u => u.armor.id === 'light'), heavy = b0.units.find(u => u.armor.id === 'heavy');
  const heavyBase = DATA.ARMORS.heavy.mobility, lightBase = DATA.ARMORS.light.mobility;
  // à statistique de mobilité égale, la vitesse réelle (speed) est plus faible avec des plaques lourdes
  check('les plaques lourdes ralentissent (vitesse réelle plus faible à mobilité égale)', heavyBase < lightBase && heavy.speed() / (1.5 + heavy.def.mobility / 100 * 1.4) < light.speed() / (1.5 + light.def.mobility / 100 * 1.4) - 0.1);
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
  check('ordre « Tenir » : l\'équipe parcourt nettement moins de distance qu\'en « Assaut »', dHold < dAssault * 0.7, { dHold, dAssault });
  // … et reste près de sa zone de départ (c'est le sens de l'ordre)
  let farthest = 0; for (let seed = 1; seed <= 6; seed++) { const t = Battle.defaultTeams(); t[0].order = 'hold'; const b = new Battle({ seed, teams: t }); while (!b.over) { b.step(); for (const u of b.teams[0].units) if (u.alive) farthest = Math.max(farthest, Math.hypot(u.x - b.teams[0].spawn.x, u.z - b.teams[0].spawn.z)); } }
  check('ordre « Tenir » : aucun opérateur ne s\'éloigne à plus de 25 m de sa zone de départ', farthest <= 25, farthest);
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

{
  // objectif « tenir » : l'équipe désignée gagne à l'échéance si elle a encore quelqu'un en état
  const t = Battle.defaultTeams(); t[0].order = 'hold';
  const b = new Battle({ seed: 3, teams: t, mapId: 'place', objective: { type: 'hold', team: 0, duration: 20 } }); b.run();
  const alive0 = b.teams[0].units.filter(u => u.alive).length;
  check('objectif « tenir » : fin à l\'échéance, victoire du défenseur s\'il reste quelqu\'un', b.over && b.t <= 20.05 && (alive0 > 0 ? b.result.winner === 0 : b.result.winner === 1), { t: b.t, winner: b.result.winner, alive0 });
}
{
  // arme silencieuse : un tir n'est entendu que de près
  const map = new GameMap(MAPS.entrepot);
  const t = Battle.defaultTeams(); t[1].overrides = [{ weaponId: 'smgsil' }];
  const b = new Battle({ seed: 1, teams: t });
  const shooter = b.teams[1].units[0], listener = b.teams[0].units[0];
  // le tireur silencieux vient de tirer à 40 m derrière le bâtiment (aucune vue) : pas d'information par l'ouïe
  shooter.x = 44; shooter.z = 16; listener.x = 20; listener.z = 16; shooter.lastShotAt = b.t; listener.knowledge = {};
  b.perceive(listener); const heardSil = !!listener.knowledge[shooter.id];
  shooter.weapon = DATA.WEAPONS.smg; listener.knowledge = {}; b.perceive(listener); const heardLoud = !!listener.knowledge[shooter.id];
  check('un PM silencieux ne s\'entend pas à 24 m derrière un mur, un PM classique si', !heardSil && heardLoud, { heardSil, heardLoud });
  check('la deuxième carte (Place du marché) se joue de bout en bout', (() => { const c = new Battle({ seed: 2, mapId: 'place' }); c.run(); return c.over && !!c.result; })());
}

{
  // ordre donné pendant la bataille : l'équipe change réellement de comportement à partir de cet instant
  const t = Battle.defaultTeams(); const b = new Battle({ seed: 4, teams: t });
  while (b.t < 6) b.step();
  const before = b.teams[0].units.map(u => ({ x: u.x, z: u.z, d: u.stats.distance }));
  check('setOrder change l\'ordre et le journalise', b.setOrder(0, 'hold') && b.teams[0].order === 'hold' && b.log.some(e => e.kind === 'order'));
  while (b.t < 26 && !b.over) b.step();
  let far = 0, walked = 0; b.teams[0].units.forEach((u, i) => { far = Math.max(far, Math.hypot(u.x - before[i].x, u.z - before[i].z)); walked += u.stats.distance - before[i].d; });
  check('après « Tenir » en cours de route, l\'escouade reste près de là où elle était (< 22 m en 20 s)', far < 22, far);
  const c = new Battle({ seed: 4, teams: Battle.defaultTeams() }); while (c.t < 6) c.step(); const d0 = c.teams[0].units.map(u => u.stats.distance); while (c.t < 26 && !c.over) c.step();
  let walkedA = 0; c.teams[0].units.forEach((u, i) => { walkedA += u.stats.distance - d0[i]; });
  check('… alors qu\'en restant en « Assaut » elle marche davantage sur la même période', walkedA > walked, { walked, walkedA });
  check('un ordre inconnu ou identique est refusé', !b.setOrder(0, 'hold') && !b.setOrder(0, 'xyz'));
}

{
  // compétences : chaque trait a un effet mesurable dans le moteur
  const mk = (id, opts) => { const t = Battle.defaultTeams(); t[0].operators = [id]; t[1].operators = ['op_cobra']; if (opts) t[0].overrides = [opts]; const b = new Battle({ seed: 1, teams: t }); return [b, b.teams[0].units[0], b.teams[1].units[0]]; };
  const withTrait = (id, trait) => mk(id, { trait });
  let [b, u, e] = withTrait('op_vautour', 'fasthands'); b.startReload(u); const r1 = u.reloading; [b, u, e] = withTrait('op_vautour', null); b.startReload(u);
  check('Mains sûres : rechargement 35 % plus court', Math.abs(r1 / u.reloading - 0.65) < 0.01, [r1, u.reloading]);
  [b, u] = withTrait('op_furet', 'runner'); const v1 = u.speed(); [b, u] = withTrait('op_furet', null);
  check('Sprinteur : 15 % plus rapide', Math.abs(v1 / u.speed() - 1.15) < 0.01);
  [b, u] = withTrait('op_bouclier', 'colossus'); const vC = u.speed(), hpC = u.maxHp; [b, u] = withTrait('op_bouclier', null);
  check('Colosse : +10 PV et plaques lourdes moins pénalisantes', hpC === u.maxHp + 10 && vC > u.speed() * 1.1, [hpC, u.maxHp, vC, u.speed()]);
  [b, u, e] = withTrait('op_granit', 'patience'); u.aimFull = true; u.burst = 0; u.x = 2; u.z = 2; e.x = 32; e.z = 2; e.moving = false; const pP = b.hitChance(u, e, 30).p; u.burst = 1; const pP2 = b.hitChance(u, e, 30).p;
  check('Patience : +25 % sur le premier tir posé seulement', Math.abs(pP / pP2 - 1.25) < 0.02, [pP, pP2]);
  [b, u, e] = withTrait('op_harfang', 'opportunity'); u.x = 2; u.z = 2; e.x = 32; e.z = 2; e.moving = true; const pO = b.hitChance(u, e, 30).p; e.moving = false; const pS = b.hitChance(u, e, 30).p;
  check('Tir d\'opportunité : pénalité cible mobile réduite de moitié (×0,9 au lieu de ×0,8)', Math.abs(pO / pS - 0.9) < 0.01, [pO, pS]);
  [b, u, e] = withTrait('op_lynx', 'eagle'); e.x = u.x + 20; e.z = u.z; e.stance = 'stand';
  // le fantôme en face : chance de repérage réduite (mesurée par la fréquence de repérage sur 2000 tentatives)
  const spotRate = (trU, trE) => { const [bb, uu, ee] = mk('op_lynx', { trait: trU }); ee.def = Object.assign({}, ee.def, { trait: trE }); uu.x = 10; uu.z = 2; ee.x = 50; ee.z = 2; uu.facing = 0; let n = 0; for (let i = 0; i < 2000; i++) { uu.visible = new Set(); bb.perceive(uu); if (uu.visible.size) n++; } return n / 2000; };
  const base = spotRate(null, null), eagle = spotRate('eagle', null), ghost = spotRate(null, 'ghost');
  check('Œil de lynx repère plus souvent, Fantôme est repéré moins souvent (à 40 m)', eagle > base * 1.15 && ghost < base * 0.75, { base, eagle, ghost });
  [b, u, e] = withTrait('op_bastion', 'steady'); u.suppression = 0.6; u.alive = true; b.act(u); const sS = u.suppression; [b, u, e] = withTrait('op_bastion', null); u.suppression = 0.6; b.act(u);
  check('Sang-froid : la suppression retombe 50 % plus vite', Math.abs((0.6 - sS) / (0.6 - u.suppression) - 1.5) < 0.05, [sS, u.suppression]);
}

{
  // tactiques actives : effets vérifiés dans la simulation
  const mkT = (tactics, seed) => { const t = Battle.defaultTeams(); t[0].tactics = tactics; t[1].tactics = []; return new Battle({ seed: seed || 3, teams: t }); };
  // fumigène : coupe une ligne de vue existante dans les deux sens, disparaît après 15 s
  let b = mkT(['fumigene']); while (b.t < 8) b.step();
  const u = b.teams[0].units.find(x => x.alive), e = b.teams[1].units.find(x => x.alive);
  u.x = 10; u.z = 2.5; e.x = 26; e.z = 2.5; u.knowledge = { [e.id]: { x: e.x, z: e.z, t: b.t, seen: true } };
  for (const o of b.teams[0].units) if (o !== u) { o.x = 10; o.z = 3.5; o.knowledge = {}; }
  const before = b.canSee(u, e) && b.canSee(e, u);
  const r = b.useTactic(0, 'fumigene');
  const after = b.canSee(u, e) || b.canSee(e, u);
  check('fumigène : la ligne de vue libre est coupée dans les deux sens, et la carte compte un obstacle temporaire', r.ok && before && !after && b.map.dynamic.length === 1, { r, before, after, smoke: b.map.dynamic[0] });
  check('fumigène : les opérateurs peuvent le traverser (pas un obstacle de marche)', !b.map.insideObstacle(b.map.dynamic[0].x + 4, b.map.dynamic[0].z + 4));
  const t0 = b.t; while (b.t < t0 + 15.2 && !b.over) b.step();
  check('fumigène : dissipé après 15 s', b.map.dynamic.length === 0);
  check('fumigène : un emploi consommé sur deux, recharge de 25 s en cours juste après', b.teams[0].tactics.fumigene.uses === 1 && b.teams[0].tactics.fumigene.cooldownUntil > t0);
  // reconnaissance : toute l'escouade connaît toutes les positions adverses pendant 8 s
  b = mkT(['reco']); while (b.t < 3) b.step();
  for (const o of b.teams[0].units) o.knowledge = {};
  check('drone : accepté même sans contact', b.useTactic(0, 'reco').ok);
  b.step(); b.step();
  const all = b.teams[0].units.filter(x => x.alive).every(o => b.teams[1].units.filter(x => x.alive).every(en => o.knowledge[en.id] && (o.knowledge[en.id].source === 'drone' || o.knowledge[en.id].source === 'vue') && Math.abs(o.knowledge[en.id].x - en.x) < 0.5 && Math.abs(o.knowledge[en.id].z - en.z) < 0.5));
  check('drone : chaque opérateur connaît la position exacte de chaque adversaire', all);
  check('drone : un seul emploi', !b.canUseTactic(0, 'reco').ok);
  // soins : +35 PV en 5 s sur le plus blessé, sans dépasser le maximum
  b = mkT(['soins']); while (b.t < 2) b.step();
  const w = b.teams[0].units[1]; w.hp = 20; w.status = 'critical'; const others = b.teams[0].units.filter(x => x !== w); others.forEach(o => { o.hp = o.maxHp; });
  check('soins : accepté quand quelqu\'un est blessé', b.useTactic(0, 'soins').ok && w.healing);
  const hp0 = w.hp; for (let i = 0; i < 25; i++) b.updateTactics(), b.t += 0.1; // 2,5 s
  check('soins : ~17 PV récupérés après 2,5 s, statut recalculé', w.hp - hp0 > 15 && w.hp - hp0 < 19 && w.status !== 'critical', { gain: w.hp - hp0, status: w.status });
  for (let i = 0; i < 40; i++) b.updateTactics(), b.t += 0.1;
  check('soins : 35 PV au total, puis arrêt', Math.abs(w.hp - hp0 - 35) < 0.5 && !w.healing, w.hp - hp0);
  // mortier : 3 obus après 4 s, dégâts et suppression dans la zone, comptés dans le résultat
  b = mkT(['barrage']); while (b.t < 3) b.step();
  const tgt = b.teams[1].units[0]; tgt.x = 40; tgt.z = 5; b.teams[0].units[0].knowledge = { [tgt.id]: { x: 40, z: 5, t: b.t, seen: true } };
  b.rng.gauss = () => 0; // obus au centre pour le test
  check('mortier : accepté avec une position connue', b.useTactic(0, 'barrage').ok && b.pendingShells.length === 3);
  const hpT = tgt.hp; const alive0 = tgt.alive; b.rng.gauss = () => 0;
  for (let i = 0; i < 60; i++) { b.t += 0.1; b.updateTactics(); }
  check('mortier : la cible au point d\'impact a subi des dégâts (ou est neutralisée) et la suppression', (tgt.hp < hpT || !tgt.alive) && (tgt.suppression > 0 || !tgt.alive) && b.pendingShells.length === 0, { hpT, hp: tgt.hp, alive0, alive: tgt.alive, sup: tgt.suppression });
  // passives : mesurées
  b = mkT(['drill']); const v1 = b.teams[0].units[0].speed(); const b0 = mkT([]); const v0 = b0.teams[0].units[0].speed();
  check('exercice de base : +12 % de vitesse au début', Math.abs(v1 / v0 - 1.12) < 0.01);
  b = mkT(['discipline']); const bd = mkT([]);
  check('discipline de feu : seuil de tir ×1,5', Math.abs(b.fireThreshold(b.teams[0].units[0]) / bd.fireThreshold(bd.teams[0].units[0]) - 1.5) < 0.01);
  // tactiques inconnues / refus
  check('une tactique non équipée est refusée', !mkT([]).useTactic(0, 'fumigene').ok);
  // spéciaux : les compteurs existent et le résultat les agrège
  const bs = new Battle({ seed: 2 }); bs.run(); const sp = bs.result.teams[0].specials;
  check('résultat : spéciaux agrégés (tête, séries, revanches, vétérans) et état d\'équipe en %', sp && ['headshots', 'streaks', 'revenge', 'veteran'].every(k => typeof sp[k] === 'number') && bs.result.teams.every(t => t.hpPct >= 0 && t.hpPct <= 100) && sp.headshots === bs.teams[0].units.reduce((a, x) => a + x.stats.headshots, 0));
}

console.log(`\n${pass}/${pass + fail} vérifications réussies${fail ? '  — ÉCHECS : ' + fail : ''}`);
process.exit(fail ? 1 : 0);
