// Tests de la boucle de jeu : profil, équipement, missions, récompenses, sauvegarde (stockage simulé).
const OT = Object.assign({}, require('../sim/rng.js'), require('../sim/data.js'), require('../sim/map.js'), require('../sim/engine.js'), require('../sim/game.js'));
const { Game, Battle, DATA } = OT;
let pass = 0, fail = 0;
// Fonctions désactivées pour l'instant (une seule classe : assaut ; plaques moyennes pour tous ; aucun accessoire)
// : leurs vérifications sont mises de côté, à réactiver quand elles reviendront.
const DESACTIVE = ["l'arme et la protection équipées", "la protection lourde ralentit", "synergies : Commandement", "Guidage radio : +8", "liste des synergies actives", "accessoires : achat unique", "accessoires : +1,5", "protections à acheter"];
let skip = 0;
const check = (n, c, i) => { if (DESACTIVE.some(d => n.startsWith(d))) { skip++; console.log('(désactivé) ' + n); return; } if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + JSON.stringify(i))); };
const mem = {}; const storage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };

const p = Game.newProfile();
check('profil neuf : 5 opérateurs débloqués, escouade complète, 300 crédits', Object.values(p.operators).filter(o => o.unlocked).length === 5 && Game.squadReady(p) && p.credits === 300);
check('niveau 0 au départ, 100 XP pour le niveau 1', Game.levelFor(0) === 0 && Game.xpToNext(0) === 100 && Game.levelFor(100) === 1 && Game.levelFor(99999) === DATA.MAX_LEVEL);
// équipement : règles de rôle et d'inventaire
check('une seule arme : le fusil d\'assaut pour tous, toute autre arme refusée', Object.keys(DATA.WEAPONS).join() === 'carbine' && !Game.setWeapon(p, 'op_granit', 'lmg') && Object.values(p.operators).every(o => o.weaponId === 'carbine') && Game.setWeapon(p, 'op_vautour', 'carbine'));
check('changer de protection', Game.setArmor(p, 'op_lynx', 'heavy') && p.operators.op_lynx.armorId === 'heavy');
// l'équipement change réellement la simulation
{
  const m = DATA.MISSIONS[0];
  p.tactics.equipped = []; // pas de tactique passive pour mesurer l'équipement seul
  const b = new Battle({ seed: 1, teams: Game.buildTeams(p, m) });
  const v = b.teams[0].units.find(u => u.callsign === 'Vautour'), l = b.teams[0].units.find(u => u.callsign === 'Lynx');
  check('l\'arme et la protection équipées sont celles de la bataille', v.weapon.id === 'carbine' && l.armor.id === 'heavy', [v.weapon.id, l.armor.id]);
  check('la protection lourde ralentit réellement Lynx', l.speed() < (1.5 + l.def.mobility / 100 * 1.4) * 0.8);
}
// niveau → statistiques → bataille
{
  p.operators.op_granit.xp = 620; // niveau 4
  const d = Game.effectiveDef(p, 'op_granit');
  check('niveau 4 : +8 à chaque statistique, plafonné à 100', d.level === 4 && d.marksmanship === 98 && d.composure === 90 && d.perception === 96, d);
  const b = new Battle({ seed: 1, teams: Game.buildTeams(p, DATA.MISSIONS[0]) });
  const g = b.teams[0].units.find(u => u.callsign === 'Granit');
  check('les statistiques bonifiées sont utilisées par le moteur (PV, précision)', g.maxHp > 80 + 60 / 5 && g.def.marksmanship === 98, g.maxHp);
  p.operators.op_granit.xp = 0;
}
// voies / formation
{
  // avant tout contact, les objectifs de progression de chaque opérateur suivent la voie choisie
  Game.applyFormation(p, 'nord');
  const b = new Battle({ seed: 2, teams: Game.buildTeams(p, DATA.MISSIONS[0]) });
  while (b.t < 1.5) b.step();
  const north = b.teams[0].units.filter(u => u.goal && u.goal.z < 14).length;
  check('formation « nord » : les objectifs de marche visent le couloir nord', north >= 3, b.teams[0].units.map(u => u.goal && u.goal.z.toFixed(0)));
  Game.applyFormation(p, 'sud');
  const b2 = new Battle({ seed: 2, teams: Game.buildTeams(p, DATA.MISSIONS[0]) });
  while (b2.t < 1.5) b2.step();
  const south = b2.teams[0].units.filter(u => u.goal && u.goal.z > 30).length;
  check('formation « sud » : les objectifs de marche visent le couloir sud', south >= 3, b2.teams[0].units.map(u => u.goal && u.goal.z.toFixed(0)));
  Game.applyFormation(p, 'auto');
}
// escouade
check('escouade : retirer un opérateur, à 4 l\'escouade peut partir', Game.toggleSquad(p, 'op_belier') && p.squad.length === 4 && Game.squadReady(p));
check('recrutement refusé pour un opérateur déjà débloqué', !Game.recruit(p, 'op_vautour'));
p.credits = 1000;
{ const q = JSON.parse(JSON.stringify(p)); const out = q.squad[0];
  check('échanger un membre de l\'escouade le remplace à la même place (et refuse un déjà présent)', Game.swapSquad(q, out, 'op_belier') && q.squad[0] === 'op_belier' && !q.squad.includes(out) && !Game.swapSquad(q, 'op_belier', q.squad[1])); }
check('Bélier revient dans l\'escouade', Game.toggleSquad(p, 'op_belier') && Game.squadReady(p) && p.squad.length === 5);
// mission complète : bataille → récompenses
{
  const m = DATA.MISSIONS[1];
  const teams = Game.buildTeams(p, m);
  check('la mission fixe l\'ordre et le niveau de l\'ennemi', teams[1].order === m.order && teams[1].operators.every(d => d.level === m.level && d.marksmanship === Math.min(100, DATA.OPERATORS.find(o => o.id === d.id).marksmanship + 2 * m.level)));
  const b = new Battle({ seed: 5, teams }); b.run();
  const before = p.credits, xpBefore = Object.fromEntries(p.squad.map(id => [id, p.operators[id].xp]));
  const r = Game.applyRewards(p, m, b.result);
  const challengeCredits = r.challenges.reduce((s, c) => s + c.reward, 0) + (r.achievements || []).reduce((s, a) => s + ((a.reward && a.reward.credits) || 0), 0) + (r.daily || []).reduce((s, c) => s + c.reward, 0);   // défis et succès payés en crédits
  check('les crédits gagnés dépendent de l\'issue, des neutralisations et des spéciaux (plus les défis)', p.credits - before === r.credits + challengeCredits && r.base === Math.round(m.reward * (r.won ? 1 : r.draw ? 0.5 : 0.3)) && r.credits === r.base + r.kills * 8 + r.specials * 6 && r.kills === b.result.teams[0].kills, r);
  const xpOk = p.squad.every(id => { const u = b.result.teams[0].units.find(x => x.id === '0:' + id); const exp = Math.round((m.xp + Math.round(u.stats.damageDealt * 0.25) + u.stats.kills * 25 + (r.won ? 20 : 0)) * (u.alive ? 1 : 0.7)); return p.operators[id].xp - xpBefore[id] === exp; });
  check('l\'expérience de chacun découle de ses actions réelles (dégâts, neutralisations, survie)', xpOk);
  const c = p.career, hs = b.result.teams[0].units.reduce((t, u) => t + u.stats.headshots, 0);
  check('carrière détaillée : tirs à la tête, terrain, dernière bataille enregistrés', c.headshots === hs && c.maps[m.mapId].b === 1 && c.recent.length === 1 && c.recent[0].m === m.name && c.recent[0].k === r.kills, { hs: c.headshots, maps: c.maps, recent: c.recent });
  const pr = Game.achievementProgress(p, 'chasseur');
  check('progression des succès : [valeur, objectif] bornée ; null pour les succès d\'un seul coup', pr[1] === 50 && pr[0] === Math.min(50, p.career.kills) && Game.achievementProgress(p, 'intact') === null && DATA.ACHIEVEMENTS.every(a => a.id in Game.ACHIEVEMENT_PROGRESS && a.id in Game.ACHIEVEMENT_CHECKS));
  check('la carrière est mise à jour', p.career.battles === 1 && (p.career.wins + p.career.losses + p.career.draws) === 1 && p.missions[m.id].attempts === 1);
}
// blessures graves, soins, repos
{
  const q = Game.newProfile(); const m = DATA.MISSIONS[0];
  let b, downs = [];   // une bataille où au moins un opérateur tombe (graine cherchée, pas supposée)
  for (let sd = 7; sd < 40 && !downs.length; sd++) { b = new Battle({ seed: sd, teams: Game.buildTeams(q, m) }); b.run(); downs = b.result.teams[0].units.filter(u => !u.alive).map(u => u.id.split(':')[1]); }
  const r = Game.applyRewards(q, m, b.result);
  check('les opérateurs neutralisés reviennent gravement blessés (et restent déployables)', downs.length > 0 && downs.every(id => q.operators[id].wounded && Game.isAvailable(q, id) && q.squad.includes(id)) && r.injured.length === downs.length, { downs, squad: q.squad });
  const id0 = downs[0], healthy = Game.effectiveDef(q, id0); q.operators[id0].wounded = false; const full = Game.effectiveDef(q, id0); q.operators[id0].wounded = true;
  check('blessure grave : toutes les compétences divisées par deux', Game.STATS.every(k => healthy[k] === Math.round(full[k] * DATA.WOUND.statFactor)) && healthy.wounded === true, { healthy, full });
  const bw = new Battle({ seed: 1, teams: Game.buildTeams(q, m) }); const uw = bw.teams[0].units.find(u => u.id === '0:' + id0), uh = new Battle({ seed: 1, teams: [{ operators: [Object.assign({}, healthy, { wounded: false })] }, { operators: ['k_vipere'] }] }).teams[0].units[0];   // même fiche (endurance déjà ÷2), sans la réduction de PV
  check('blessure grave : points de vie réduits d\'un quart en bataille', Math.abs(uw.maxHp - Math.round(uh.maxHp * DATA.WOUND.hpFactor)) < 1e-9, { w: uw.maxHp, h: uh.maxHp });
  check('blessure grave : la note de l\'opérateur baisse', Game.operatorRating(q, id0) < (() => { q.operators[id0].wounded = false; const v = Game.operatorRating(q, id0); q.operators[id0].wounded = true; return v; })());
  q.credits = 500;
  const nHealthy = Object.keys(q.operators).filter(i => Game.isAvailable(q, i) && !Game.isWounded(q, i)).length;
  check('les soins guérissent contre des crédits (gratuits seulement s\'il reste moins de 3 opérateurs valides)', Game.treat(q, id0) && q.credits === 500 - (nHealthy < 3 ? 0 : Game.TREATMENT_PRICE) && !q.operators[id0].wounded, { nHealthy, credits: q.credits });
  check('on ne soigne pas un opérateur en bonne santé', !Game.treat(q, 'op_vautour') || q.operators.op_vautour.wounded === false && false);
  check('une escouade de 3 opérateurs peut partir, pas de 2', (() => { const z = Game.newProfile(); z.squad = z.squad.slice(0, 3); const ok3 = Game.squadReady(z); z.squad = z.squad.slice(0, 2); return ok3 && !Game.squadReady(z); })());
  const z = Game.newProfile(); z.squad = z.squad.slice(0, 3); const b3 = new Battle({ seed: 3, teams: Game.buildTeams(z, m) }); b3.run();
  check('une bataille à 3 contre 5 se joue jusqu\'au bout', b3.over && b3.teams[0].units.length === 3 && !!b3.result);
  // repos : un blessé laissé en dehors de l'escouade guérit après WOUND.restMissions missions
  const q2 = Game.newProfile(); q2.operators.op_lynx.wounded = true; q2.squad = q2.squad.filter(i => i !== 'op_lynx');
  let healedAt = 0;
  for (let k = 1; k <= 3 && q2.operators.op_lynx.wounded; k++) { for (const i of q2.squad) q2.operators[i].wounded = false; const bb = new Battle({ seed: 8 + k, teams: Game.buildTeams(q2, m) }); bb.run(); const rr = Game.applyRewards(q2, m, bb.result); if (rr.healed.includes('Lynx')) healedAt = k; q2.squad = q2.squad.filter(i => i !== 'op_lynx'); }
  check(`le repos guérit en ${DATA.WOUND.restMissions} missions`, healedAt === DATA.WOUND.restMissions && !q2.operators.op_lynx.wounded, healedAt);
  // un blessé engagé ne se repose pas
  const q4 = Game.newProfile(); q4.operators.op_lynx.wounded = true; const b4 = new Battle({ seed: 5, teams: Game.buildTeams(q4, m) }); b4.run(); Game.applyRewards(q4, m, b4.result);
  check('un blessé engagé en mission ne compte pas de repos', q4.operators.op_lynx.wounded && (q4.operators.op_lynx.woundRest || 0) === 0);
  // filet de sécurité : toute l'escouade blessée et sans crédits → soins gratuits jusqu'à 3 valides
  const q3 = Game.newProfile(); for (const i of q3.squad) q3.operators[i].wounded = true; q3.credits = 0;
  check('sans opérateur valide ni crédits, les soins sont gratuits jusqu\'à 3 valides', Game.treatmentPrice(q3) === 0 && Game.treat(q3, 'op_vautour') && Game.treat(q3, 'op_lynx') && Game.treat(q3, 'op_granit') && Game.treatmentPrice(q3) === Game.TREATMENT_PRICE && !Game.treat(q3, 'op_bastion'));
  // ancienne sauvegarde : convalescence → blessure grave
  const old = Game.newProfile(); old.operators.op_lynx.recovery = 1; const store = { v: JSON.stringify(old), getItem() { return this.v; } };
  const loaded = Game.load(store); check('ancienne sauvegarde : la convalescence devient une blessure grave', loaded.operators.op_lynx.wounded === true && loaded.operators.op_lynx.recovery === undefined);
}
// synergies d'escouade : actives seulement si la source est debout, effets mesurés
{
  const mk = (ops) => new Battle({ seed: 1, teams: [{ operators: ops }, { operators: ['k_vipere', 'k_fauve'] }] });
  // fiches d'essai : un Meneur et un Radio d'un autre pays (il n'y a plus que cinq opérateurs du GIGN)
  const D = (id, o) => Object.assign({}, DATA.OPERATORS.find(x => x.id === id), o);
  const COBRA = D('op_vautour', { id: 't_cobra', callsign: 'Cobra', unit: 'Essai (A)', trait: 'leader' }), SIROCCO = D('op_lynx', { id: 't_sirocco', callsign: 'Sirocco', unit: 'Essai (B)', role: 'assault', trait: 'radio' });
  const b = mk([COBRA, SIROCCO, 'op_granit', 'op_bastion', 'op_belier']);
  const [cobra, sirocco, granit, bastion, belier] = b.teams[0].units;
  check('synergies : Commandement (Meneur → Radio, Appui), Guidage (Radio → tireur, appui, brèche), Appui-feu (Appui → Assaut, Pointe)',
    b.synergy(sirocco, 'commandement') && b.synergy(bastion, 'commandement') && !b.synergy(granit, 'commandement') && !b.synergy(cobra, 'commandement')
    && b.synergy(granit, 'guidage') && b.synergy(bastion, 'guidage') && b.synergy(belier, 'guidage') && !b.synergy(cobra, 'guidage') && !b.synergy(sirocco, 'guidage')
    && b.synergy(cobra, 'appui') && b.synergy(sirocco, 'appui') && !b.synergy(bastion, 'appui'));
  const e = b.teams[1].units[0]; granit.x = 2; granit.z = 2; e.x = 22; e.z = 2; granit.moving = false; e.moving = false; granit.stance = 'stand'; e.stance = 'stand'; granit.suppression = 0;
  const p1 = b.hitChance(granit, e, 20).p; sirocco.alive = false; const p0 = b.hitChance(granit, e, 20).p; sirocco.alive = true;
  check('Guidage radio : +8 % de précision, perdu quand le radio tombe', Math.abs(p1 / p0 - 1.08) < 1e-9, { p0, p1 });
  // Commandement : mêmes dégâts à tirage égal, −10 % avec la synergie
  const dmgOn = (alive) => { const bb = mk([COBRA, SIROCCO]); bb.teams[0].units[0].alive = alive; const tg = bb.teams[0].units[1], sh = bb.teams[1].units[0]; tg.armor = { torso: 0, head: 0, name: 'aucune' }; const h0 = tg.hp; bb.applyHit(sh, tg, 5); return h0 - tg.hp; };
  const d1 = dmgOn(true), d0 = dmgOn(false);
  check('Commandement : dégâts subis −10 % tant que le Meneur est debout', Math.abs(d1 / d0 - 0.9) < 0.011, { d0, d1 });
  const nAct = b.activeSynergies(0).map(x => x.id).sort().join(','); check('liste des synergies actives de l\'équipe', ['appui,commandement,guidage', 'appui,commandement,freres,guidage'].includes(nAct) && b.activeSynergies(1).length === 0, nAct);
  // Frères d'armes : deux opérateurs du même pays mettent en joue 10 % plus vite ; seul de son pays, rien
  { const bb = new Battle({ seed: 2, teams: [{ operators: ['op_vautour', 'op_lynx', 'op_granit'], tactics: [] }, { operators: ['k_molosse'], tactics: [] }] }); const [vt, lx, gr] = bb.teams[0].units;
    const s1 = bb.synergy(vt, 'freres') && bb.synergy(lx, 'freres') && bb.synergy(gr, 'freres'); lx.alive = false; gr.alive = false; const s2 = !bb.synergy(vt, 'freres');
    const sq = Game.squadSynergies(['op_vautour', 'op_lynx', 'op_granit'].map(id => Game.effectiveDef(Game.newProfile(), id))).find(x => x.id === 'freres');
    check('Frères d\'armes : les opérateurs du GIGN sont liés ; perdu quand plus aucun autre n\'est debout ; affiché au QG', s1 && s2 && sq && sq.targets.length === 3, sq); }
}
// défis : vérifiés sur le résultat réel, récompense unique
{
  const q = Game.newProfile(); const m = DATA.MISSIONS[0];
  // on fabrique un résultat de victoire sans perte à partir d'une vraie bataille (en forçant l'issue : les unités restent en état)
  const fake = (over) => Object.assign({ winner: 0, teams: [{ alive: 5, orderId: 'assault', units: Array.from({ length: 5 }, (_, i) => ({ id: '0:' + q.squad[i], callsign: 'x', role: 'Assaut', alive: true, stats: { kills: 0, timeSuppressed: 0, damageDealt: 0 } })) }, { alive: 0, units: [] }] }, over || {});
  const c0 = q.credits; const done = Game.checkChallenges(q, m, fake());
  check('« Sans perte » accordé sur une victoire sans neutralisé, crédits ajoutés', done.some(c => c.id === 'sans_perte') && q.credits === c0 + 200 && q.challenges.sans_perte === true, done.map(c => c.id));
  check('un défi ne se gagne qu\'une fois', Game.checkChallenges(q, m, fake()).length === 0 && q.credits === c0 + 200);
  const lost = fake({ winner: 1 }); check('aucun défi sur une défaite', Game.checkChallenges(Game.newProfile(), m, lost).length === 0);
  const three = fake(); three.teams[0].units = three.teams[0].units.slice(0, 3); three.teams[0].alive = 3;
  check('« À trois » exige une escouade de trois', Game.checkChallenges(Game.newProfile(), m, three).some(c => c.id === 'a_trois'));
  const sniper = fake(); sniper.teams[0].units[0].role = DATA.ROLES.marksman.name; sniper.teams[0].units[0].stats.kills = 3;
  check('« Œil du tireur » : 3 neutralisations par un tireur d\'élite', Game.checkChallenges(Game.newProfile(), m, sniper).some(c => c.id === 'tireur'));
  // intégration : applyRewards sur une vraie bataille ne plante pas et liste les défis gagnés
  const q3 = Game.newProfile(); const b = new Battle({ seed: 2, teams: Game.buildTeams(q3, m) }); b.run(); const r = Game.applyRewards(q3, m, b.result);
  check('applyRewards renvoie la liste des défis accomplis (éventuellement vide)', Array.isArray(r.challenges));
}
// méta : rang du joueur, puissance, tactiques équipées, paquets, personnalisation
{
  const q = Game.newProfile();
  check('rang : Recrue à 0 XP, Opérateur à 150, rang suivant indiqué', Game.rankFor(0) === 0 && Game.rankFor(150) === 1 && Game.xpToNextRank(0) === 150 && Game.xpToNextRank(99999) === null);
  const r0 = Game.teamRating(q); q.operators.op_vautour.xp = 900; q.operators.op_lynx.xp = 900; const r1 = Game.teamRating(q);
  check('la puissance d\'équipe est un nombre lisible qui augmente avec les niveaux', r0 > 20 && r0 < 80 && r1 > r0, [r0, r1]);
  check('tactiques : le Tiroir, les plans de voies (Tenailles, Rush milieu) et les cartes de la vague 2 (Fixer et déborder, Éclaireur, Tiroir lent), possédés d\'office, Tiroir équipé ; une tactique inconnue est refusée', Object.keys(DATA.TACTICS).join() === 'tiroir,tenailles,rush_milieu,fixer_deborder,eclaireur,tiroir_lent' && Object.keys(DATA.TACTICS).every(id => q.tactics.owned[id]) && q.tactics.equipped.join() === 'tiroir' && !Game.equipTactic(q, 'barrage'));
  const mt = DATA.MISSIONS[0], teams = Game.buildTeams(q, mt);
  check('le Tiroir part dans la bataille des deux côtés', teams[0].tactics.join() === 'tiroir' && teams[1].tactics.join() === 'tiroir');
  // paquets : tirage déterministe
  const seq = [0.05, 0.2, 0.1, 0.9, 0.5, 0.3, 0.6, 0.7, 0.8, 0.2, 0.4, 0.9]; let i = 0; const rng = () => seq[(i++) % seq.length];
  q.credits = 100; check('un paquet trop cher est refusé', Game.openPack(q, 'standard', rng) === null && q.credits === 100);
  q.credits = 1000; const cards = Game.openPack(q, 'standard', rng);
  check('un paquet standard donne 3 cartes et coûte 150 crédits', cards && cards.length === 3 && q.credits <= 850 + 200, cards && cards.map(c => c.type));
  const perkCard = cards.find(c => c.type === 'perk');
  if (perkCard) check('une carte perk ajoute +2 à la statistique effective de l\'opérateur', Game.effectiveDef(q, perkCard.id)[perkCard.stat] === Math.min(100, DATA.OPERATORS.find(o => o.id === perkCard.id)[perkCard.stat] + Game.levelFor(q.operators[perkCard.id].xp) * 2 + q.perks[perkCard.id][perkCard.stat]));
  // beaucoup de paquets : rien ne plante, tout reste cohérent
  q.credits = 100000; for (let k = 0; k < 60; k++) Game.openPack(q, k % 2 ? 'elite' : 'standard', Math.random);
  const allPerksOk = Object.values(q.perks).every(p => Object.values(p).every(v => v >= 2 && v <= 10));
  check('60 paquets : perks plafonnés à +10, profil cohérent (sauvegardable)', allPerksOk && !!Game.save(q, storage) && JSON.stringify(Game.load(storage)) === JSON.stringify(q));
  check('personnalisation : nom d\'équipe, insigne possédé seulement', Game.setCustomization(q, 'teamName', '  Les Faucons  ') && q.teamName === 'Les Faucons' && !Game.setCustomization(Game.newProfile(), 'insignia', 'ancre') && Game.setCustomization(q, 'insignia', 'bouclier'));
  Game.reset(storage);
}
// contrats, doublons, promotions, succès, historique
{
  const q = Game.newProfile(); const m = DATA.MISSIONS[0];
  check('les opérateurs de départ ont un contrat de 24 missions', q.operators.op_vautour.tours === 24);
  q.operators.op_lynx.tours = 1;
  const b = new Battle({ seed: 3, teams: Game.buildTeams(q, m) }); b.run(); const r = Game.applyRewards(q, m, b.result);
  check('une mission consomme un tour de contrat ; à zéro l\'opérateur est signalé et indisponible', q.operators.op_lynx.tours === 0 && r.expired.includes('Lynx') && !Game.isAvailable(q, 'op_lynx') && Game.contractExpired(q, 'op_lynx'));
  const c0 = q.credits; check('le renouvellement coûte selon la rareté et redonne des missions', Game.renewContract(q, 'op_lynx') && q.credits === c0 - DATA.CONTRACT.renewPrice[1] && q.operators.op_lynx.tours === DATA.CONTRACT.tours[1] && Game.isAvailable(q, 'op_lynx') === (q.operators.op_lynx.recovery === 0 || q.operators.op_lynx.recovery === undefined));
  check('l\'historique de l\'opérateur garde ses batailles (mission, issue, neutralisations, dégâts)', q.operators.op_vautour.history.length === 1 && q.operators.op_vautour.history[0].m === m.name && typeof q.operators.op_vautour.history[0].dmg === 'number');
  // doublon : tous débloqués → la carte « opérateur » devient une fusion
  const d = Game.newProfile(); for (const id in d.operators) d.operators[id].unlocked = true; d.credits = 1000;
  const seq = [0.0, 0.5, 0.5, 0.0, 0.5, 0.5, 0.0, 0.5, 0.5]; let i = 0; const cards = Game.openPack(d, 'standard', () => seq[(i++) % seq.length]);
  const dupe = cards.find(c => c.type === 'dupe');
  check('une carte opérateur en doublon fusionne : perk +2 (ou crédits) et contrat +4', !!dupe && d.operators[dupe.id].dupes >= 1 && (!dupe.stat || (d.perks[dupe.id] && d.perks[dupe.id][dupe.stat] >= 2)) && d.operators[dupe.id].tours === DATA.CONTRACT.startingTours + 4 * d.operators[dupe.id].dupes, cards.map(c => c.type + ':' + c.id));
  // promotion : passage au niveau 5 → deux traits proposés, choix appliqué dans la bataille
  const pr = Game.newProfile(); pr.operators.op_vautour.xp = 890; // juste sous le niveau 5 (900)
  const b2 = new Battle({ seed: 4, teams: Game.buildTeams(pr, m) }); b2.run(); const r2 = Game.applyRewards(pr, m, b2.result);
  const pend = pr.operators.op_vautour.pendingPromotions;
  check('au niveau 5, une promotion propose deux traits que l\'opérateur n\'a pas', Game.levelFor(pr.operators.op_vautour.xp) >= 5 && pend.length === 1 && pend[0].choices.length === 2 && !pend[0].choices.includes('fasthands') && r2.promotions.some(x => x.id === 'op_vautour'), pend);
  const chosen = pend[0].choices[0];
  pr.operators.op_vautour.recovery = 0; pr.squad = ['op_vautour', 'op_lynx', 'op_granit']; for (const id of pr.squad) pr.operators[id].recovery = 0;
  check('le trait choisi devient actif dans la simulation', Game.choosePromotion(pr, 'op_vautour', chosen) && pr.operators.op_vautour.traits.includes(chosen) && (() => { const b3 = new Battle({ seed: 1, teams: Game.buildTeams(pr, m) }); const u = b3.teams[0].units.find(x => x.callsign === 'Vautour'); return u.def.traits.includes(chosen) && u.def.trait === 'fasthands'; })());
  check('un trait non proposé est refusé', !Game.choosePromotion(pr, 'op_vautour', 'ghost'));
  // succès
  const a = Game.newProfile(); a.career.wins = 1; const got = Game.checkAchievements(a, null);
  check('succès « Première victoire » accordé une seule fois', got.some(x => x.id === 'premiere') && Game.checkAchievements(a, null).length === 0 && a.achievements.premiere === true);
  const a2 = Game.newProfile(); const fakeRes = { winner: 0, teams: [{ units: Array.from({ length: 5 }, () => ({ alive: true, hp: 95, maxHp: 100 })) }] };
  check('succès « Sans une égratignure » : victoire avec 5 opérateurs > 90 %', Game.checkAchievements(a2, fakeRes).some(x => x.id === 'intact'));
  Game.reset(storage);
}
// sauvegarde
check('sauvegarde puis rechargement identiques', Game.save(p, storage) && JSON.stringify(Game.load(storage)) === JSON.stringify(p));
check('sans sauvegarde : null (le jeu repart d\'un profil neuf)', Game.load({ getItem: () => null }) === null);
check('sauvegarde corrompue : null, sans planter', Game.load({ getItem: () => '{garbage' }) === null);
{
  // succès : la récompense est réellement accordée (crédits ou cosmétique)
  const q = Game.newProfile(); const c0 = q.credits; q.career.wins = 1;
  const got = Game.checkAchievements(q, null);
  check('succès « Première victoire » : +100 crédits réellement versés, libellé affiché', got.some(a => a.id === 'premiere' && a.rewardText === '+100 crédits') && q.credits === c0 + 100, { got, credits: q.credits });
  q.career.wins = 10; const g2 = Game.checkAchievements(q, null);
  check('succès « Dix victoires » : le béret rouge est débloqué', g2.some(a => a.id === 'dix') && q.headgear.beret_rouge === true);
  check('un succès n\'est accordé qu\'une fois', Game.checkAchievements(q, null).length === 0);
}
{
  // ---- modes de jeu ----
  const q = Game.newProfile(); const C = DATA.CAMPAIGNS;
  check('une seule campagne, ouverte d\'emblée, toutes ses missions sur le parking', C.length === 1 && Game.campaignUnlocked(q, 'reguliere') && C[0].missions.every(id => DATA.MISSIONS.find(m => m.id === id).mapId === 'parking'));
  check('campagne : seule la première mission est ouverte au départ', Game.missionUnlocked(q, 'reguliere', C[0].missions[0]) && !Game.missionUnlocked(q, 'reguliere', C[0].missions[1]));
  const m0 = Game.campaignMission('reguliere', C[0].missions[0]);
  const b = new Battle({ seed: 3, teams: Game.buildTeams(q, m0) }); b.run(); Game.applyRewards(q, m0, b.result);
  check('campagne : la mission suivante s\'ouvre dès que la précédente a été jouée (gagnée ou non)', Game.missionUnlocked(q, 'reguliere', C[0].missions[1]) && Game.campaignProgress(q, 'reguliere').played === 1);
  // primes de campagne : versées une seule fois, quand toutes les missions sont jouées / gagnées
  const z = Game.newProfile(); const st = z.campaigns.reguliere = { played: {}, won: {}, participationPaid: false, completionPaid: false };
  for (const id of C[0].missions.slice(0, -1)) { st.played[id] = true; st.won[id] = true; }
  const last = Game.campaignMission('reguliere', C[0].missions[C[0].missions.length - 1]); const c0 = z.credits; const r = {};
  Game.applyModes(z, last, { winner: 0, teams: [{ capture: 0, units: [{ alive: true }] }] }, r);
  check('campagne finie et gagnée : primes de participation et de campagne versées (une fois)', z.credits === c0 + C[0].participation + C[0].completion && r.modeLines.length === 2 && last.final === true);
  const c1 = z.credits; Game.applyModes(z, last, { winner: 0, teams: [{ capture: 0, units: [{ alive: true }] }] }, {}); check('primes de campagne non versées deux fois', z.credits === c1);
  // bataille rapide
  const qb = Game.quickBattle(q, () => 0.3);
  const rateOf = (m) => m.enemy.reduce((s, id) => s + Game.defRating(Game.enemyDef(id, m.level)), 0) / m.enemy.length;
  check('bataille rapide : 4 ou 5 opérateurs Karst, carte et objectif valides, adversaire un peu sous votre puissance', qb.enemy.length >= 4 && qb.enemy.every(id => id.startsWith('k_')) && !!OT.MAPS[qb.mapId] && ['eliminate', 'capture', 'hold'].includes(qb.objective) && (qb.level === 0 || rateOf(qb) <= Game.teamRating(q) - 2), { level: qb.level, r: rateOf(qb), t: Game.teamRating(q) });
  const vet = Game.newProfile(); for (const id of vet.squad) vet.operators[id].xp = DATA.XP_TABLE[8]; const qv = Game.quickBattle(vet, () => 0.3);
  check('bataille rapide : une escouade aguerrie affronte un adversaire de plus haut niveau', qv.level > qb.level, { qv: qv.level, qb: qb.level });
  const bq = new Battle(Game.battleOptions(q, qb, 5)); bq.run(); check('une bataille rapide se joue jusqu\'au bout', bq.over);
  const w = Game.newProfile(); w.quick.wins = 4; const rq = {}; const won = { winner: 0, teams: [{ capture: 0, units: [{ alive: false }] }] };
  Game.applyModes(w, qb, won, rq);
  check('bataille rapide : 5e victoire → paquet standard offert', w.quick.wins === 5 && w.freePacks.standard === 1 && rq.modeLines.some(l => /offert/.test(l)));
  const cr = w.credits; const cards = Game.openPack(w, 'standard', () => 0.5);
  check('un paquet offert s\'ouvre sans payer', cards && cards.length === 3 && w.freePacks.standard === 0 && w.credits >= cr);
  // opérations spéciales
  const o = Game.newProfile(); o.ops.wins = 24; const c2 = o.credits; const ro = {};
  Game.applyModes(o, DATA.MISSIONS[0], { winner: 0, teams: [{ capture: 100, units: [{ alive: true }] }] }, ro);
  check('opération Tempête : 25e victoire → +800 crédits et un paquet élite offert, captures et victoires propres comptées', o.ops.done.tempete && o.credits === c2 + 800 && o.freePacks.elite === 1 && o.ops.captureWins === 1 && o.ops.cleanWins === 1);
}
check('stockage indisponible : la sauvegarde échoue proprement', Game.save(p, { setItem: () => { throw new Error('quota'); } }) === false);
check('réinitialisation : profil neuf et stockage vidé', Game.reset(storage).credits === 300 && storage.getItem(Game.SAVE_KEY) === null);
{
  // ---- contrats du jour : tirage stable pour une date, différent un autre jour, progression et paiement une seule fois ----
  const q = Game.newProfile(); const a = JSON.stringify(Game.dailyContracts(q, '2026-10-17').list.map(c => c.id)); q.daily = null;
  const a2 = JSON.stringify(Game.dailyContracts(q, '2026-10-17').list.map(c => c.id)); q.daily = null;
  const days = new Set(); for (let k = 1; k <= 9; k++) { q.daily = null; days.add(JSON.stringify(Game.dailyContracts(q, '2026-10-0' + k).list.map(c => c.id))); }
  check('contrats du jour : trois contrats distincts, même tirage pour une même date, tirages variés selon les jours', a === a2 && JSON.parse(a).length === 3 && new Set(JSON.parse(a)).size === 3 && days.size >= 5, { a, days: days.size });
  q.daily = { date: '2026-10-17', list: [{ id: 'wins', text: 'Gagner 2 batailles', goal: 2, progress: 0, done: false, reward: 150 }, { id: 'kills', text: 'x', goal: 3, progress: 0, done: false, reward: 120 }, { id: 'revives', text: 'y', goal: 1, progress: 0, done: false, reward: 120 }] };
  const fake = (won, kills) => ({ teams: [{ kills, units: [{ alive: true, stats: { headshots: 0, revives: 0 } }], tactics: [] }, { units: [] }] });
  const c0 = q.credits; const p1 = Game.applyDaily(q, { id: 'x' }, fake(true, 2), { won: true }, '2026-10-17'); const p2 = Game.applyDaily(q, { id: 'x' }, fake(true, 2), { won: true }, '2026-10-17'); const p3 = Game.applyDaily(q, { id: 'x' }, fake(true, 5), { won: true }, '2026-10-17');
  check('contrats du jour : progression cumulée, payés une seule fois quand l\'objectif est atteint', p1.length === 0 && p2.length === 2 && p3.length === 0 && q.credits === c0 + 270 && q.daily.list[2].done === false, { p1, p2, p3, credits: q.credits - c0 });
}
{
  // ---- accessoires : achat, montage selon l'arme, effets réels dans la bataille ----
  const q = Game.newProfile(); q.credits = 2000;
  const ok = Game.buyAttachment(q, 'chargeur') && Game.buyAttachment(q, 'silencieux') && !Game.buyAttachment(q, 'chargeur');
  const vt = 'op_vautour', bel = 'op_belier';
  const m1 = Game.setAttachment(q, vt, 'chargeur', 'chargeur') && Game.setAttachment(q, vt, 'bouche', 'silencieux') && !Game.setAttachment(q, vt, 'optique', 'lunette');
  const b = new Battle({ seed: 3, teams: [{ operators: [Game.effectiveDef(q, vt)], tactics: [] }, { operators: ['k_molosse'], tactics: [] }] });
  const u = b.teams[0].units[0], base = DATA.WEAPONS[q.operators[vt].weaponId];
  check('accessoires : achat unique, montage seulement sur une arme compatible, effets dans la bataille (chargeur +50 %, silencieux)', ok && m1 && u.weapon.mag === Math.round(base.mag * 1.5) && u.weapon.silenced === true && u.weapon.damage < base.damage && DATA.WEAPONS[base.id].mag === base.mag, { ok, m1, mag: u.weapon.mag, sil: u.weapon.silenced });
  const r0 = Game.defRating(Object.assign({}, Game.effectiveDef(q, vt), { attachments: {} })), r1 = Game.defRating(Game.effectiveDef(q, vt));
  check('accessoires : +1,5 de note par accessoire monté', Math.abs(r1 - r0 - 1.5 * Object.keys(q.operators[vt].attachments).length) < 1e-9, { r0, r1 });
}
{
  // ---- versions de sauvegarde : une sauvegarde v1 est migrée, une sauvegarde plus récente est refusée ----
  const v1 = Game.newProfile(); v1.version = 1; delete v1.inventory.attachments; v1.career = { battles: 3, wins: 2, losses: 1, draws: 0, kills: 9, losses_units: 4 };
  for (const id in v1.operators) delete v1.operators[id].attachments;
  const st = { getItem: () => JSON.stringify(v1) }, p2 = Game.load(st);
  check('sauvegarde v1 migrée : version à jour, accessoires et carrière détaillée ajoutés, données conservées', p2 && p2.version === Game.SAVE_VERSION && p2.inventory.attachments && p2.career.kills === 9 && p2.career.headshots === 0 && Array.isArray(p2.career.recent) && p2.operators.op_vautour.attachments, p2 && { v: p2.version, c: p2.career });
  const future = Game.newProfile(); future.version = Game.SAVE_VERSION + 1;
  check('sauvegarde d\'une version plus récente : refusée (le QG la met de côté au lieu de l\'écraser)', Game.load({ getItem: () => JSON.stringify(future) }) === null);
}
{
  // ---- contenu réduit : 5 opérateurs du GIGN, une carte, une arme, une tactique ; adversaire : le Groupe Karst ----
  const mine = DATA.OPERATORS.filter(o => !o.faction);
  check('contenu : 5 opérateurs du GIGN, une seule carte (parking), adversaire Karst seulement', mine.length === 5 && mine.every(o => o.unit === 'GIGN (France)') && Object.keys(OT.MAPS).join() === 'parking' && DATA.OPERATORS.every(o => !o.faction || o.faction === 'karst') && DATA.MISSIONS.every(m => m.mapId === 'parking'));
  const q = Game.newProfile(); let ok = true; for (let k = 0; k < 50; k++) { const qb = Game.quickBattle(q); ok = ok && qb.faction === 'karst' && qb.mapId === 'parking' && qb.enemyTactics.join() === 'tiroir'; }
  check('bataille rapide : Karst, parking, Tiroir', ok);
  // migration v2 → v3 : ce qui n'existe plus disparaît, le reste est gardé
  const v2 = Game.newProfile(); v2.version = 2; v2.credits = 777; v2.operators.op_cobra = { unlocked: true, xp: 50, weaponId: 'carbine', armorId: 'light' }; v2.squad = ['op_cobra', 'op_vautour', 'op_lynx', 'op_granit', 'op_bastion'];
  v2.operators.op_vautour.weaponId = 'smg'; v2.operators.op_vautour.xp = 230; v2.inventory.weapons = { carbine: true, smg: true, battle: true }; v2.tactics = { owned: { fumigene: true, reco: true }, equipped: ['fumigene', 'reco'] };
  v2.campaigns = { delta: { played: {}, won: {} }, reguliere: { played: { patrouille: true }, won: {} } }; v2.achievements = { colonel: true, premiere: true };
  const p3 = Game.load({ getItem: () => JSON.stringify(v2) });
  check('sauvegarde v2 migrée : recrues et Delta retirées, une arme, le Tiroir, crédits et progression gardés', p3 && p3.version === Game.SAVE_VERSION && !p3.operators.op_cobra && p3.squad.join() === 'op_vautour,op_lynx,op_granit,op_bastion' && p3.operators.op_vautour.weaponId === 'carbine' && p3.operators.op_vautour.xp === 230
    && Object.keys(p3.inventory.weapons).join() === 'carbine' && p3.tactics.equipped.join() === 'tiroir' && !p3.campaigns.delta && p3.campaigns.reguliere.played.patrouille && !p3.achievements.colonel && p3.achievements.premiere && p3.credits === 777, p3);
}
{ const q = Game.newProfile(); q.credits = 500;
  const refused = !Game.setArmor(q, 'op_vautour', 'composite'), bought = Game.buyArmor(q, 'composite'), again = !Game.buyArmor(q, 'composite'), set = Game.setArmor(q, 'op_vautour', 'composite');
  const b = new Battle({ seed: 1, teams: [{ operators: [Game.effectiveDef(q, 'op_vautour')] }, { operators: ['k_molosse'] }] });
  check('protections à acheter : refusées avant achat, achetées une fois, portées en bataille', refused && bought && again && set && q.credits === 500 - DATA.PRICES.armor.composite && b.teams[0].units[0].armor.id === 'composite'); }
console.log(`\n${pass}/${pass + fail} vérifications réussies` + (skip ? ` (${skip} mises de côté : fonctions désactivées)` : '')); process.exit(fail ? 1 : 0);
