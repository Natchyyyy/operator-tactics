// Vérifications automatiques du moteur de combat. usage : node tests/verify.js [nombre de graines]
// Chaque test vérifie un comportement RÉEL de la simulation (pas une valeur affichée).
const OT = Object.assign({}, require('../sim/rng.js'), require('../sim/data.js'), require('../sim/map.js'), require('../sim/engine.js'));
require('./anciens.js')(OT);   // anciens terrains, armes et opérateurs : bancs d'essai des mécanismes du moteur
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
    if (!u.alive && !(u.bleedUntil > this.t) && !u.crawling) { if (u._downPos && (Math.abs(u._downPos.x - u.x) > 1e-9 || Math.abs(u._downPos.z - u.z) > 1e-9)) violations.push(`${u.callsign} bouge après neutralisation`); u._downPos = u._downPos || { x: u.x, z: u.z }; } else u._downPos = null;   // relevé : il peut de nouveau bouger
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
  const bullet = (e) => ['tête', 'torse', 'membre'].includes(e.loc);   // tirs ; les éclats de grenade sont journalisés à part
  const hitEntries = b.log.filter(e => (e.kind === 'hit' || e.kind === 'down') && bullet(e)).length;
  const hits = b.units.reduce((s, u) => s + u.stats.hits, 0);
  const downs = b.log.filter(e => e.kind === 'down').length - b.log.filter(e => e.kind === 'revive').length, dead = b.units.filter(u => !u.alive).length;
  const reloads = b.log.filter(e => e.kind === 'reload').length, reloadStats = b.units.reduce((s, u) => s + u.stats.reloads, 0);
  const friendly = (e) => e.enemy && b.units.find(u => u.id === e.enemy).team === e.team && !bullet(e);   // éclats sur son propre camp : non crédités
  const dmgLogged = b.log.filter(e => (e.kind === 'hit' || e.kind === 'down') && !friendly(e)).reduce((s, e) => s + e.dmg, 0);
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
  const pAt = (u, d) => { const save = [tgt.x, tgt.z, u.x, u.z, u.moving, tgt.moving, u.stance, tgt.stance, u.suppression, u.status, u.burst, u.hp, u.aimFull]; u.hp = u.maxHp; u.aimFull = true; u.x = 2; u.z = 2; tgt.x = 2 + d; tgt.z = 2; u.moving = false; tgt.moving = false; u.stance = 'stand'; tgt.stance = 'stand'; u.suppression = 0; u.status = 'ok'; u.burst = 0; const p = b.hitChance(u, tgt, d).p; [tgt.x, tgt.z, u.x, u.z, u.moving, tgt.moving, u.stance, tgt.stance, u.suppression, u.status, u.burst, u.hp, u.aimFull] = save; return p; };   // tireur remis en état, toujours le même (la bataille est terminée : il peut être blessé, mort, avoir fini sa visée)
  check('fusil à pompe : très efficace à 5 m, quasi inutile à 40 m', pAt(shooterS, 5) > 0.5 && pAt(shooterS, 40) < 0.1, { p5: pAt(shooterS, 5), p40: pAt(shooterS, 40) });
  check('fusil de précision : meilleur que la carabine à 70 m, pénalisé à 5 m', pAt(shooterD, 70) > pAt(shooterC, 70) * 1.5 && pAt(shooterD, 5) < pAt(shooterD, 30), { d70: pAt(shooterD, 70), c70: pAt(shooterC, 70), d5: pAt(shooterD, 5), d30: pAt(shooterD, 30) });
  check('la cadence et le chargeur diffèrent réellement (mitrailleuse : 100 coups, rechargement long)', DATA.WEAPONS.lmg.mag > 3 * DATA.WEAPONS.carbine.mag && DATA.WEAPONS.lmg.reload > 2 * DATA.WEAPONS.carbine.reload);
  // le fusil de précision fait plus de dégâts par balle : vérifié sur les touchés au torse non protégés… via la donnée et le calcul de dégâts
  check('dégâts par balle : fusil de précision > carabine > pistolet-mitrailleur', DATA.WEAPONS.dmr.damage > DATA.WEAPONS.carbine.damage && DATA.WEAPONS.carbine.damage > DATA.WEAPONS.smg.damage);
}
{
  // ordres : « tenir » change réellement le comportement (distance parcourue bien plus faible)
  const dist = (order) => { let s = 0; for (let seed = 1; seed <= 12; seed++) { const t = Battle.defaultTeams(); t[0].order = order; const b = new Battle({ seed, teams: t }); b.run(); s += b.teams[0].units.reduce((a, u) => a + u.stats.distance, 0); } return s / 6; };
  const dHold = dist('hold'), dAssault = dist('assault'), dCareful = dist('careful');
  check('ordre « Tenir » : l\'équipe parcourt nettement moins de distance qu\'en « Assaut »', dHold < dAssault * 0.75, { dHold, dAssault });
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
  u.status = 'ok'; u.burst = 0;   // tireur remis en état (la bataille est terminée : il a pu finir blessé, la comparaison serait faussée)
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
  // comparaison sur plusieurs graines (une seule bataille est trop sensible au hasard des postes choisis)
  const walk = (hold) => { let w = 0; for (let sd = 4; sd <= 8; sd++) { const c = new Battle({ seed: sd, teams: Battle.defaultTeams() }); while (c.t < 6) c.step(); if (hold) c.setOrder(0, 'hold'); const d0 = c.teams[0].units.map(u => u.stats.distance); while (c.t < 26 && !c.over) c.step(); c.teams[0].units.forEach((u, i) => { w += u.stats.distance - d0[i]; }); } return w; };
  const walkedH = walk(true), walkedA = walk(false);
  check('… alors qu\'en restant en « Assaut » elle marche davantage sur la même période (5 batailles)', walkedA > walkedH, { walkedH, walkedA });
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
  // spéciaux : les compteurs existent et le résultat les agrège
  const bs = new Battle({ seed: 2 }); bs.run(); const sp = bs.result.teams[0].specials;
  check('résultat : spéciaux agrégés (tête, séries, revanches, vétérans, groupe) et état d\'équipe en %', sp && ['headshots', 'streaks', 'revenge', 'veteran', 'group'].every(k => typeof sp[k] === 'number') && bs.result.teams.every(t => t.hpPct >= 0 && t.hpPct <= 100) && sp.headshots === bs.teams[0].units.reduce((a, x) => a + x.stats.headshots, 0));
}

{
  // ---- capture de zone ----
  for (const id of Object.keys(MAPS)) {
    const b = new Battle({ seed: 1, mapId: id, objective: { type: 'capture' } });
    const f = b.map.nearestFree(b.zone.x, b.zone.z), c = f && b.map.centerOf(f.c, f.r);
    const freeCells = (() => { let n = 0; for (let dx = -b.zone.r; dx <= b.zone.r; dx++) for (let dz = -b.zone.r; dz <= b.zone.r; dz++) { if (dx * dx + dz * dz > b.zone.r * b.zone.r) continue; const g = b.map.nearestFree(b.zone.x + dx, b.zone.z + dz); if (g) { const cc = b.map.centerOf(g.c, g.r); if (Math.hypot(cc.x - b.zone.x - dx, cc.z - b.zone.z - dz) < 0.8) n++; } } return n; })();
    check(`capture (${id}) : zone sur l'axe de symétrie, centre accessible, assez de place pour 5 opérateurs`, Math.abs(b.zone.x - b.map.width / 2) < 0.01 && c && b.inZone(c) && freeCells >= 20, { zone: b.zone, c, freeCells });
  }
  // progression : seule l'équipe présente sans adversaire progresse ; zone disputée = bloquée
  const b = new Battle({ seed: 1, mapId: 'place', objective: { type: 'capture' } });
  const A = b.teams[0].units, B = b.teams[1].units, put = (u, x, z) => { u.x = x; u.z = z; };
  A.forEach((u, i) => put(u, i < 2 ? b.zone.x - 1 + i : 3, i < 2 ? b.zone.z : 3)); B.forEach(u => put(u, b.map.width - 3, 3));
  for (let i = 0; i < 10; i++) b.updateCapture();
  const exp = 10 * OT.DT * (1.6 + 0.4);
  check('capture : 2 opérateurs seuls dans la zone → +2 %/s', Math.abs(b.teams[0].capture - exp) < 1e-6 && b.teams[1].capture === 0 && b.zone.holder === 0, { cap: b.teams[0].capture, exp });
  put(B[0], b.zone.x + 1, b.zone.z + 1); const before = b.teams[0].capture;
  for (let i = 0; i < 10; i++) b.updateCapture();
  check('capture : zone disputée → aucune progression', b.teams[0].capture === before && b.teams[1].capture === 0 && b.zone.contested);
  put(B[0], b.map.width - 3, 3); b.teams[0].capture = 99.95; b.updateCapture(); b.checkEnd();
  check('capture : 100 % → victoire de l\'équipe qui tient la zone, même avec tous les adversaires debout', b.over && b.result.winner === 0 && /zone/.test(b.result.reason) && b.result.teams[0].capture === 100 && B.every(u => u.alive), b.result);
  // des batailles réelles : toutes se terminent, et la zone est effectivement prise par moments
  let ended = 0, viaZone = 0, occupied = 0, n = 0;
  for (const id of Object.keys(MAPS)) for (let s = 1; s <= 4; s++) {
    const bb = new Battle({ seed: s, mapId: id, objective: { type: 'capture' } }); let occ = false;
    while (!bb.over && bb.t < bb.timeLimit + 1) { bb.step(); if (bb.zone.holder === 0 || bb.zone.holder === 1) occ = true; }
    n++; if (bb.over) ended++; if (/zone/.test(bb.result.reason)) viaZone++; if (occ) occupied++;
  }
  check('capture : 12 batailles réelles se terminent, la zone est occupée dans la plupart', ended === n && occupied >= n * 0.75, { ended, occupied, viaZone, n });
}

{
  // neutralisation de groupe : comptée seulement si un autre allié a touché la cible dans les 5 s
  const b = new Battle({ seed: 1 }); const [a1, a2] = b.teams[0].units, e = b.teams[1].units[0];
  e.armor = { torso: 0, head: 0, name: 'aucune' }; a1.weapon = Object.assign({}, a1.weapon, { damage: 500 });
  e.hitBy[a2.id] = b.t - 2; b.applyHit(a1, e, 5);
  const e2 = b.teams[1].units[1]; e2.armor = e.armor; e2.hitBy[a2.id] = b.t - 9; b.applyHit(a1, e2, 5);
  check('neutralisation de groupe : comptée avec un allié qui a touché la cible il y a 2 s, pas 9 s', !e.alive && !e2.alive && a1.stats.group === 1, a1.stats);
}

{
  // ---- grenades ----
  const GR = DATA.GRENADES;
  // dotation par rôle
  const b0 = new Battle({ seed: 1 }); const byRole = (r) => b0.units.find(u => u.role.id === r);
  check('grenades : dotation par rôle (assaut 1 frag, pointe 1 incapacitante, brèche 1+1, appui et tireur aucune)', byRole('assault').grenades.frag === 1 && byRole('pointman').grenades.flash === 1 && byRole('breacher').grenades.frag === 1 && byRole('breacher').grenades.flash === 1 && !byRole('support').grenades.frag && !byRole('marksman').grenades.frag);
  // explosion : dégâts selon la distance, un mur protège, crédit au lanceur
  const mapE = new GameMap(MAPS.entrepot);
  const wall = mapE.obstacles.find(o => o.h >= 2.5 && o.w >= 2 && o.d >= 2);
  const mk = () => { const b = new Battle({ seed: 2 }); for (const u of b.units) { u.x = 1.5; u.z = 1.5 + u.idx * 0.1 + u.team * 2; } return b; };
  let b = mk(); const thr = b.teams[0].units.find(u => u.role.id === 'assault'), near = b.teams[1].units[0], behind = b.teams[1].units[1], far = b.teams[1].units[2];
  const gx = wall.x - 2.2, gz = wall.z + wall.d / 2;
  near.x = gx + 1.5; near.z = gz; behind.x = wall.x + 0.8; behind.z = gz; far.x = gx - 8; far.z = gz;   // derrière le mur à ~3 m
  near.armor = behind.armor = far.armor = { torso: 0, head: 0, name: 'aucune' };
  const h = [near.hp, behind.hp, far.hp];
  b.grenadesInFlight = [{ kind: 'frag', team: 0, thrower: thr, from: { x: 0, z: 0 }, x: gx, z: gz, landAt: 0, explodeAt: 0, landed: true }];
  b.updateGrenades();
  const exp = Math.round(GR.frag.damage * Math.pow(1 - 1.5 / GR.frag.radius, 1.5) * 10) / 10;
  check('grenade : dégâts décroissants à 1,5 m, rien derrière un mur, rien au-delà du rayon', Math.abs((h[0] - near.hp) - Math.min(h[0], exp)) < 1e-6 && behind.hp === h[1] && far.hp === h[2], { d0: h[0] - near.hp, exp, behind: h[1] - behind.hp, far: h[2] - far.hp });
  check('grenade : la suppression atteint aussi ceux qui sont à l\'abri (le bruit, le souffle)', behind.suppression > 0 && far.suppression > 0);
  b = mk(); const t2 = b.teams[0].units.find(u => u.role.id === 'assault'), v = b.teams[1].units[0]; v.x = gx + 0.5; v.z = gz; v.armor = { torso: 0, head: 0, name: 'aucune' }; v.hp = 10;
  b.grenadesInFlight = [{ kind: 'frag', team: 0, thrower: t2, x: gx, z: gz, landAt: 0, explodeAt: 0, landed: true }]; b.updateGrenades();
  check('grenade : la neutralisation est créditée au lanceur', !v.alive && t2.stats.kills === 1 && b.computeResult(0, '').teams[0].kills >= 1);
  // incapacitante : aveugle ceux qui voient l'éclair (plus aucun repérage), pas ceux derrière le mur
  b = mk(); const t3 = b.teams[0].units.find(u => u.role.id === 'pointman'), seer = b.teams[1].units[0], hid = b.teams[1].units[1];
  seer.x = gx + 2; seer.z = gz; seer.facing = Math.PI; hid.x = wall.x + 0.8; hid.z = gz;
  b.grenadesInFlight = [{ kind: 'flash', team: 0, thrower: t3, x: gx, z: gz, landAt: 0, explodeAt: 0, landed: true }]; b.updateGrenades();
  b.perceive(seer);
  check('incapacitante : aveugle celui qui voit l\'éclair (aucun repérage, précision ×0,25), pas celui derrière le mur', seer.blindUntil > b.t + 1 && seer.visible.size === 0 && hid.blindUntil < b.t, { s: seer.blindUntil, h: hid.blindUntil, t: b.t });
  // esquive : un adversaire qui voit la grenade tomber s'en écarte avant l'explosion
  b = new Battle({ seed: 5, mapId: 'place' }); const T = b.teams[0].units.find(u => u.role.id === 'assault'), E = b.teams[1].units[0];
  for (const u of b.units) if (u !== T && u !== E) u.alive = false;
  E.x = 30; E.z = 30; T.x = 18; T.z = 30; const ff = b.map.nearestFree(E.x + 1, E.z); const cc = b.map.centerOf(ff.c, ff.r);
  b.grenadesInFlight = [{ kind: 'frag', team: 0, thrower: T, x: cc.x, z: cc.z, landAt: b.t, explodeAt: b.t + GR.frag.fuse, landed: false }];
  E.def = Object.assign({}, E.def, { reflexes: 90 }); b.rng = new OT.RNG(1);
  let d0 = Math.hypot(E.x - cc.x, E.z - cc.z), dEnd = d0;
  for (let k = 0; k < 16 && b.grenadesInFlight.length; k++) { b.step(); dEnd = Math.hypot(E.x - cc.x, E.z - cc.z); }
  check('grenade : l\'adversaire qui la voit tomber s\'éloigne avant l\'explosion', dEnd > d0 + 1, { d0, dEnd, state: E.state });
  // en vraie bataille : grenades lancées, jamais de tir pendant le lancer, toujours hors de portée des alliés
  let thrown = 0, badAlly = 0, shotWhileThrow = 0;
  for (const id of ['entrepot', 'place']) for (let sd = 1; sd <= 5; sd++) {
    const bb = new Battle({ seed: sd, mapId: id });
    const orig = bb.shoot.bind(bb); bb.shoot = (u, e, d) => { if (u.throwing) shotWhileThrow++; return orig(u, e, d); };
    const origT = bb.tryGrenade.bind(bb); bb.tryGrenade = (u) => { const r = origT(u); if (r) { thrown++; if (bb.alliesOf(u).some(a => a.alive && Math.hypot(a.x - u.throwing.x, a.z - u.throwing.z) < 5)) badAlly++; } return r; };
    bb.run();
  }
  check('en bataille : des grenades sont lancées, jamais vers un allié proche, jamais en tirant', thrown > 0 && badAlly === 0 && shotWhileThrow === 0, { thrown, badAlly, shotWhileThrow });
}

{
  // ---- revoir une bataille : mêmes options + mêmes commandes au même pas → bataille identique ----
  const mk = (extra) => new Battle(Object.assign({ seed: 11, mapId: 'place', teams: [{ name: 'A', order: 'careful', operators: ['op_vautour', 'op_lynx', 'op_granit', 'op_bastion', 'op_belier'], tactics: ['tiroir'] }, { name: 'B', order: 'assault', operators: ['k_molosse', 'k_vipere', 'k_hyene', 'k_chacal', 'k_fauve'], tactics: ['tiroir'], autoTactics: true }] }, extra || {}));
  const a = mk(); let used = 0;
  while (!a.over && a.t < 250) {
    if (a.tick === 60) a.command('order', 0, 'assault');
    if (a.tick === 300 && a.command('order', 0, 'careful').ok) used++;
    a.step();
  }
  const b = mk({ replayInputs: a.inputs }); b.run(300);
  const sig = (x) => JSON.stringify([x.result.winner, x.t, x.log.length, x.units.map(u => [Math.round(u.hp * 10), u.stats.shots, u.stats.kills, Math.round(u.x * 100)])]);
  check('revoir : la bataille rejouée est identique (vainqueur, durée, journal, chaque opérateur), commandes du joueur comprises', a.inputs.length >= 2 && used >= 1 && sig(a) === sig(b), { inputs: a.inputs.length, used, a: sig(a).slice(0, 120), b: sig(b).slice(0, 120) });
  check('revoir : les commandes sont refusées pendant la revue', !b.command('order', 0, 'hold').ok);
}

{
  // ---- traits de la quatrième vague : Grenadier, Vigie, Secouriste ----
  const duo = (a, b, map) => new Battle({ seed: 7, mapId: map || 'place', teams: [{ operators: [a], tactics: [] }, { operators: [b], tactics: [] }] });
  let b = duo('op_corbeau', 'k_molosse'); const g0 = b.teams[0].units[0].grenades.frag; const g1 = duo('op_vautour', 'k_molosse').teams[0].units[0].grenades.frag;
  check('Grenadier : une grenade à fragmentation de plus que le même rôle sans le trait', g0 === g1 + 1, { g0, g1 });
  // Vigie : un ennemi qui marche à 9 m derrière un mur est entendu par la Vigie, pas par un autre éclaireur
  const mp = new GameMap(MAPS.place);
  let spot = null; for (let x = 6; x < 60 && !spot; x += 0.5) for (let z = 3; z < 42 && !spot; z += 0.5) if (!mp.insideObstacle(x, z) && !mp.insideObstacle(x + 9, z) && !mp.hasLOS(x, 1.6, z, x + 9, 1.6, z)) spot = { x, z };
  const hears = (id) => { const b = duo(id, 'k_molosse'); const [u] = b.teams[0].units, [e] = b.teams[1].units; u.x = spot.x; u.z = spot.z; e.x = spot.x + 9; e.z = spot.z; e.moving = true; e.lastShotAt = -99; b.t = 5; b.perceive(u); return !!u.knowledge[e.id]; };
  check('Vigie : entend les pas d\'un ennemi en mouvement à 9 m derrière un mur (un autre éclaireur non)', spot && hears('op_mistral') && !hears('op_lynx'), spot);
  // Secouriste : un allié blessé à 3 m, plus touché depuis 4 s, remonte jusqu'à 70 % ; trop loin : rien
  const heal = (dist) => { const b = new Battle({ seed: 7, mapId: 'place', teams: [{ operators: ['op_toubib', 'op_vautour'], tactics: [] }, { operators: ['k_molosse'], tactics: [] }] }); const [m, a] = b.teams[0].units; b.teams[1].units[0].alive = false; m.x = 20; m.z = 20; a.x = 20 + dist; a.z = 20; a.hp = a.maxHp * 0.3; a.lastHitAt = 0; b.t = 5; for (let i = 0; i < 400; i++) { b.updateTactics(); b.t += OT.DT; b.tick++; } return a.hp / a.maxHp; };
  const h3 = heal(3), h9 = heal(9);
  check('Secouriste : soigne un allié proche jusqu\'à 70 %, pas un allié à 9 m', Math.abs(h3 - 0.7) < 0.01 && Math.abs(h9 - 0.3) < 1e-9, { h3, h9 });
}

{
  // ---- à terre / relevé : un allié sans ennemi en vue rejoint le blessé et le relève (Secouriste : deux fois plus vite) ----
  const rescueTime = (rescuer, headshot) => {
    const b = new Battle({ seed: 5, mapId: 'entrepot', teams: [{ operators: [rescuer, 'op_lynx'], tactics: [] }, { operators: ['k_molosse'], tactics: [] }] });
    const [u, a] = b.teams[0].units; const p = b.map.nearestFree(14, 20), c = b.map.centerOf(p.c, p.r); u.x = c.x; u.z = c.z; a.x = c.x + 3; a.z = c.z;
    if (b.map.insideObstacle(a.x, a.z)) { a.x = c.x - 3; }
    a.hp = 0; a.alive = false; a.status = 'down'; b.maybeBleed = Battle.prototype.maybeBleed; a.bleedUntil = headshot ? 0 : b.t + 20;
    for (let i = 0; i < 150 && !a.alive; i++) { b.t = Math.round((b.t + OT.DT) * 1000) / 1000; b.tick++; if (i % 3 === 0) b.decide(u); b.act(u); b.updateRevives(); }
    return a.alive ? { t: b.t, hp: a.hp / a.maxHp, revived: a.revived, revives: u.stats.revives } : null;
  };
  const r0 = rescueTime('op_vautour'), r1 = rescueTime('op_toubib'), r2 = rescueTime('op_vautour', true);
  check('à terre : un allié rejoint le blessé et le relève avec 30 % de sa vie ; Secouriste plus rapide ; pas de relève sans saignement', !!r0 && !!r1 && r1.t < r0.t && Math.abs(r0.hp - 0.3) < 0.02 && r0.revived && r0.revives === 1 && r2 === null, { r0, r1, r2 });
  // une balle dans la tête ne laisse jamais à terre ; sinon environ une fois sur deux
  const bb = new Battle({ seed: 1 }); let k = 0; for (let i = 0; i < 400; i++) { const e = bb.units[i % 10]; e.revived = false; if (bb.maybeBleed(e, 'torse')) k++; }
  let hk = 0; for (let i = 0; i < 100; i++) if (bb.maybeBleed(bb.units[0], 'tête')) hk++;
  check('à terre : jamais après une balle dans la tête, environ une fois sur deux sinon', hk === 0 && k > 170 && k < 270, { k, hk });
}

{
  // ---- accessoires : la lunette aide de loin, le holographique de près, la poignée en mouvement, le compensateur en rafale ----
  const hc = (att, d, moving, burst) => { const def = Object.assign({}, OT.DATA.OPERATORS.find(o => o.id === 'op_vautour'), { attachments: att }); const b = new Battle({ seed: 1, mapId: 'entrepot', teams: [{ operators: [def], tactics: [] }, { operators: ['k_molosse'], tactics: [] }] }); const [u] = b.teams[0].units, [e] = b.teams[1].units; u.x = 5; u.z = 5; e.x = 5 + d; e.z = 5; u.moving = !!moving; u.burst = burst || 0; return b.hitChance(u, e, d, false).p; };
  const far0 = hc({}, 40), far1 = hc({ optique: 'lunette' }, 40), near1 = hc({ optique: 'lunette' }, 16), near0 = hc({}, 16), holo = hc({ optique: 'holo' }, 16);   // 16 m : au-delà du bonus de courte portée (< 15 m)
  const mv0 = hc({}, 15, true), mv1 = hc({ poignee: 'poignee' }, 15, true), bu0 = hc({}, 15, false, 4), bu1 = hc({ bouche: 'compensateur' }, 15, false, 4);
  check('accessoires : lunette +12 % au-delà de 25 m (rien de près), holographique +6 % de près, poignée et compensateur', Math.abs(far1 / far0 - 1.12) < 1e-9 && near1 === near0 && Math.abs(holo / near0 - 1.06) < 1e-9 && Math.abs(mv1 / mv0 - 0.66 / 0.55) < 1e-9 && bu1 > bu0, { far0, far1, near0, holo, mv0, mv1, bu0, bu1 });
}

{
  // ---- moral : deux camarades tombés tout près et plusieurs ennemis en vue → test de sang-froid ; le Meneur ne flanche jamais ----
  const rate = (id, extra) => { let k = 0; for (let sd = 1; sd <= 300; sd++) { const b = new Battle({ seed: sd, teams: [{ operators: [id, 'op_lynx'], tactics: [] }, { operators: ['k_molosse', 'k_fauve'], tactics: [] }] }); const u = b.teams[0].units[0]; u.x = 10; u.z = 10; b.teams[0].units[1].x = 40; b.teams[0].units[1].z = 30; b.t = 30; b.teams[0].losses = [{ t: 25, x: 12, z: 10 }, { t: 27, x: 9, z: 12 }]; if (extra) extra(b, u); if (b.moraleCheck(u, b.teams[1].units)) k++; } return k; };
  const rLow = rate('op_furet'), rSteady = rate('op_bastion'), rLeader = rate('op_cobra'), rNoLoss = rate('op_furet', (b) => { b.teams[0].losses = [{ t: 2, x: 12, z: 10 }]; });
  check('moral : un opérateur peu sang-froid flanche plus souvent qu\'un appui Sang-froid ; le Meneur jamais ; rien sans pertes récentes', rLow > rSteady && rSteady >= 0 && rLeader === 0 && rNoLoss === 0 && rLow > 20, { rLow, rSteady, rLeader, rNoLoss });
}

{
  // ---- décor destructible : un obus près d'une caisse la détruit pour CETTE bataille (cases libres, vue dégagée), pas pour la suivante ----
  const b = new Battle({ seed: 1, mapId: 'entrepot' }); const n0 = MAPS.entrepot.obstacles.length;
  const crate = b.map.obstacles.find(o => b.map.isDestructible(o)); const cx = crate.x + crate.w / 2, cz = crate.z + crate.d / 2;
  const cell = b.map.cellOf(cx, cz), blockedBefore = b.map.isBlocked(cell.c, cell.r), losBefore = b.map.hasLOS(crate.x - 2, 0.6, cz, crate.x + crate.w + 2, 0.6, cz);
  b.blastDecor(cx, cz + crate.d / 2 + 1, 2.2, 1);
  const gone = !b.map.obstacles.includes(crate), cellFree = !b.map.isBlocked(cell.c, cell.r), losAfter = b.map.hasLOS(crate.x - 2, 0.6, cz, crate.x + crate.w + 2, 0.6, cz);
  const b2 = new Battle({ seed: 1, mapId: 'entrepot' });
  check('décor destructible : la caisse disparaît, sa case se libère, la vue passe ; la carte suivante est intacte ; les murs ne cèdent pas', gone && blockedBefore && cellFree && !losBefore && losAfter && b2.map.obstacles.includes(crate) && MAPS.entrepot.obstacles.length === n0 && !b.map.isDestructible(b.map.obstacles.find(o => o.kind === 'wall')), { gone, blockedBefore, cellFree, losBefore, losAfter });
}

{
  // ---- camouflage des tenues : −10 % de repérage sur les terrains / conditions de la tenue, rien ailleurs ----
  const camo = (uni, map, cond) => new Battle({ seed: 1, mapId: map, conditions: cond, teams: [{ operators: ['op_vautour'], uniform: uni }, { operators: ['k_molosse'] }] }).teams[0].camo;
  check('camouflage : tenue urbaine en ville, désert à la raffinerie, nuit de nuit (×0,9) ; ailleurs ×1 ; l\'adversaire sans tenue ×1', camo('urbain', 'place') === 0.9 && camo('desert', 'raffinerie') === 0.9 && camo('nuit', 'entrepot', 'nuit') === 0.9 && camo('urbain', 'entrepot') === 1 && camo('nuit', 'entrepot') === 1 && new Battle({ seed: 1, mapId: 'place' }).teams[1].camo === 1);
}

{
  // ---- conditions : la nuit réduit la vue (sauf l'éclair d'un tireur), le brouillard aussi ; la pluie couvre les bruits ----
  const mp = new GameMap(MAPS.place); let row = null; for (let z = 3; z < 42 && row === null; z += 0.5) if (mp.hasLOS(14, 1.6, z, 54, 1.6, z) && !mp.insideObstacle(14, z) && !mp.insideObstacle(54, z)) row = z;
  const sees = (cond, fired) => { let n = 0; for (let sd = 1; sd <= 40; sd++) { const b = new Battle({ seed: sd, mapId: 'place', conditions: cond, teams: [{ operators: ['op_vautour'], tactics: [] }, { operators: ['k_molosse'], tactics: [] }] }); const [u] = b.teams[0].units, [e] = b.teams[1].units; u.x = 14; u.z = row; e.x = 54; e.z = row; u.facing = 0; e.moving = true; b.t = 10; e.lastShotAt = fired ? 9.8 : -99; for (let k = 0; k < 10; k++) { b.perceive(u); if (u.visible.has(e.id)) { n++; break; } } } return n; };
  const dj = sees(undefined, false), dn = sees('nuit', false), dnf = sees('nuit', true), db = sees('brouillard', false);
  check('conditions : à 40 m, repéré de jour, invisible de nuit et dans le brouillard, trahi de nuit par l\'éclair de son arme', row !== null && dj > 20 && dn === 0 && db === 0 && dnf > 20, { row, dj, dn, dnf, db });
  const r1 = new Battle({ seed: 77, conditions: 'pluie' }).run(), r2 = new Battle({ seed: 77, conditions: 'pluie' }).run(), r3 = new Battle({ seed: 77 }).run();
  check('conditions : déterministes, et elles changent réellement la bataille', JSON.stringify(r1.teams) === JSON.stringify(r2.teams) && (r1.duration !== r3.duration || JSON.stringify(r1.teams) !== JSON.stringify(r3.teams)));
}

{
  // ---- équité entre les camps : deux escouades identiques, cartes symétriques → aucun camp ne doit être favorisé ----
  const mp = new GameMap(MAPS.parking); const key = (x, z) => x.toFixed(2) + ',' + z.toFixed(2);
  let asymCover = 0; for (const id of Object.keys(MAPS)) { if (MAPS[id].asymetrique) continue; const m = new GameMap(MAPS[id]);   // cartes voulues asymétriques : l'équité est vérifiée par les batailles (ci-dessous)
 const S = new Set(m.coverPoints.map(p => key(p.x, p.z))); for (const p of m.coverPoints) if (!S.has(key(m.width - p.x, p.z))) asymCover++; }
  const f1 = mp.nearestFree(36.0 - 2.75, 23.25), f2 = mp.nearestFree(36.0 + 2.75, 23.25), c1 = mp.centerOf(f1.c, f1.r), c2 = mp.centerOf(f2.c, f2.r);
  check('symétrie : points de couverture en miroir sur les cartes symétriques (le parking est volontairement asymétrique)', asymCover === 0 && (MAPS.parking.asymetrique || (Math.abs((c1.x + c2.x) - 72) < 1e-9 && c1.z === c2.z)), { asymCover, c1, c2 });
  const ops = ['op_vautour', 'op_lynx', 'op_granit', 'op_bastion', 'op_belier'];
  for (const obj of ['eliminate', 'capture']) {
    const w = [0, 0];
    for (const id of Object.keys(MAPS)) for (let sd = 1; sd <= 15; sd++) { const b = new Battle({ seed: 500 + sd, mapId: id, objective: { type: obj }, teams: [{ name: 'A', operators: ops }, { name: 'B', operators: ops }] }); const r = b.run(); if (r.winner >= 0) w[r.winner]++; }
    const share = w[0] / (w[0] + w[1]);
    check(`équité (${obj}) : escouades identiques sur les ${Object.keys(MAPS).length} cartes, ni l'ouest ni l'est favorisé (35–65 %)`, share > 0.35 && share < 0.65, { w, share });
  }
}

console.log(`\n${pass}/${pass + fail} vérifications réussies${fail ? '  — ÉCHECS : ' + fail : ''}`);
process.exit(fail ? 1 : 0);
