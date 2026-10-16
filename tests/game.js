// Tests de la boucle de jeu : profil, équipement, missions, récompenses, sauvegarde (stockage simulé).
const OT = Object.assign({}, require('../sim/rng.js'), require('../sim/data.js'), require('../sim/map.js'), require('../sim/engine.js'), require('../sim/game.js'));
const { Game, Battle, DATA } = OT;
let pass = 0, fail = 0;
const check = (n, c, i) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + JSON.stringify(i))); };
const mem = {}; const storage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };

const p = Game.newProfile();
check('profil neuf : 5 opérateurs débloqués, escouade complète, 300 crédits', Object.values(p.operators).filter(o => o.unlocked).length === 5 && Game.squadReady(p) && p.credits === 300);
check('niveau 0 au départ, 100 XP pour le niveau 1', Game.levelFor(0) === 0 && Game.xpToNext(0) === 100 && Game.levelFor(100) === 1 && Game.levelFor(99999) === DATA.MAX_LEVEL);
// équipement : règles de rôle et d'inventaire
check('un tireur d\'élite ne peut pas prendre la mitrailleuse', !Game.setWeapon(p, 'op_granit', 'lmg') && p.operators.op_granit.weaponId === 'dmr');
check('un assaut peut passer au pistolet-mitrailleur', Game.setWeapon(p, 'op_vautour', 'smg') && p.operators.op_vautour.weaponId === 'smg');
check('changer de protection', Game.setArmor(p, 'op_lynx', 'heavy') && p.operators.op_lynx.armorId === 'heavy');
// l'équipement change réellement la simulation
{
  const m = DATA.MISSIONS[0];
  p.tactics.equipped = []; // pas de tactique passive pour mesurer l'équipement seul
  const b = new Battle({ seed: 1, teams: Game.buildTeams(p, m) });
  const v = b.teams[0].units.find(u => u.callsign === 'Vautour'), l = b.teams[0].units.find(u => u.callsign === 'Lynx');
  check('l\'arme et la protection équipées sont celles de la bataille', v.weapon.id === 'smg' && l.armor.id === 'heavy', [v.weapon.id, l.armor.id]);
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
  const north = b.teams[0].units.filter(u => u.goal && u.goal.z < 12).length;
  check('formation « nord » : les objectifs de marche visent le couloir nord', north >= 4, b.teams[0].units.map(u => u.goal && u.goal.z.toFixed(0)));
  Game.applyFormation(p, 'sud');
  const b2 = new Battle({ seed: 2, teams: Game.buildTeams(p, DATA.MISSIONS[0]) });
  while (b2.t < 1.5) b2.step();
  const south = b2.teams[0].units.filter(u => u.goal && u.goal.z > 28).length;
  check('formation « sud » : les objectifs de marche visent le couloir sud', south >= 4, b2.teams[0].units.map(u => u.goal && u.goal.z.toFixed(0)));
  Game.applyFormation(p, 'auto');
}
// escouade
check('on ne peut pas dépasser 5 ni ajouter un verrouillé ; à 4 l\'escouade peut partir', !Game.toggleSquad(p, 'op_cobra') && Game.toggleSquad(p, 'op_belier') && p.squad.length === 4 && Game.squadReady(p));
check('recrutement refusé sans crédits', !Game.recruit(p, 'op_harfang') && !p.operators.op_harfang.unlocked);
p.credits = 1000;
check('recrutement : débit du prix, déblocage', Game.recruit(p, 'op_cobra') && p.operators.op_cobra.unlocked && p.credits === 1000 - DATA.PRICES.operator[2]);
check('le recruté peut rejoindre l\'escouade', Game.toggleSquad(p, 'op_cobra') && Game.squadReady(p));
// mission complète : bataille → récompenses
{
  const m = DATA.MISSIONS[1];
  const teams = Game.buildTeams(p, m);
  check('la mission fixe l\'ordre et le niveau de l\'ennemi', teams[1].order === m.order && teams[1].operators.every(d => d.level === m.level && d.marksmanship === Math.min(100, DATA.OPERATORS.find(o => o.id === d.id).marksmanship + 2 * m.level)));
  const b = new Battle({ seed: 5, teams }); b.run();
  const before = p.credits, xpBefore = Object.fromEntries(p.squad.map(id => [id, p.operators[id].xp]));
  const r = Game.applyRewards(p, m, b.result);
  const challengeCredits = r.challenges.reduce((s, c) => s + c.reward, 0);
  check('les crédits gagnés dépendent de l\'issue, des neutralisations et des spéciaux (plus les défis)', p.credits - before === r.credits + challengeCredits && r.base === Math.round(m.reward * (r.won ? 1 : r.draw ? 0.5 : 0.3)) && r.credits === r.base + r.kills * 8 + r.specials * 6 && r.kills === b.result.teams[0].kills, r);
  const xpOk = p.squad.every(id => { const u = b.result.teams[0].units.find(x => x.id === '0:' + id); const exp = Math.round((m.xp + Math.round(u.stats.damageDealt * 0.25) + u.stats.kills * 25 + (r.won ? 20 : 0)) * (u.alive ? 1 : 0.7)); return p.operators[id].xp - xpBefore[id] === exp; });
  check('l\'expérience de chacun découle de ses actions réelles (dégâts, neutralisations, survie)', xpOk);
  check('la carrière est mise à jour', p.career.battles === 1 && (p.career.wins + p.career.losses + p.career.draws) === 1 && p.missions[m.id].attempts === 1);
}
// convalescence et soins
{
  const q = Game.newProfile(); const m = DATA.MISSIONS[0];
  const b = new Battle({ seed: 7, teams: Game.buildTeams(q, m) }); b.run();
  const downs = b.result.teams[0].units.filter(u => !u.alive).map(u => u.id.split(':')[1]);
  const r = Game.applyRewards(q, m, b.result);
  check('les opérateurs neutralisés passent en convalescence et quittent l\'escouade', downs.every(id => q.operators[id].recovery === 1 && !q.squad.includes(id)) && r.recovering.length === downs.length, { downs, squad: q.squad });
  if (downs.length) {
    check('un convalescent ne peut pas être réengagé', !Game.toggleSquad(q, downs[0]));
    const c0 = q.credits; q.credits = 500;
    check('les soins le rendent disponible contre des crédits', Game.treat(q, downs[0]) && q.credits === 500 - Game.TREATMENT_PRICE && Game.isAvailable(q, downs[0]) && Game.toggleSquad(q, downs[0]));
    q.credits = c0;
  }
  check('une escouade de 3 opérateurs peut partir, pas de 2', (() => { const z = Game.newProfile(); z.squad = z.squad.slice(0, 3); const ok3 = Game.squadReady(z); z.squad = z.squad.slice(0, 2); return ok3 && !Game.squadReady(z); })());
  const z = Game.newProfile(); z.squad = z.squad.slice(0, 3); const b3 = new Battle({ seed: 3, teams: Game.buildTeams(z, m) }); b3.run();
  check('une bataille à 3 contre 5 se joue jusqu\'au bout', b3.over && b3.teams[0].units.length === 3 && !!b3.result);
  // après une nouvelle mission, la convalescence est terminée
  const q2 = Game.newProfile(); q2.operators.op_lynx.recovery = 1; q2.squad = q2.squad.filter(id => id !== 'op_lynx');
  const b2 = new Battle({ seed: 8, teams: Game.buildTeams(q2, m) }); b2.run(); Game.applyRewards(q2, m, b2.result);
  check('la convalescence dure une mission', q2.operators.op_lynx.recovery === 0 && Game.isAvailable(q2, 'op_lynx'));
  // filet de sécurité : escouade entièrement évacuée et sans crédits → soins gratuits jusqu'à 3 disponibles
  const q3 = Game.newProfile(); for (const id of q3.squad) q3.operators[id].recovery = 1; q3.squad = []; q3.credits = 0;
  check('sans opérateur disponible ni crédits, les soins sont gratuits jusqu\'à 3 disponibles', Game.treatmentPrice(q3) === 0 && Game.treat(q3, 'op_vautour') && Game.treat(q3, 'op_lynx') && Game.treat(q3, 'op_granit') && Game.treatmentPrice(q3) === Game.TREATMENT_PRICE && !Game.treat(q3, 'op_bastion'));
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
  check('3 tactiques maximum, seulement celles possédées', !Game.equipTactic(q, 'barrage') && Game.equipTactic(q, 'drill') && q.tactics.equipped.length === 1 && Game.equipTactic(q, 'drill') && q.tactics.equipped.length === 2);
  q.tactics.owned.reco = true; q.tactics.owned.soins = true; Game.equipTactic(q, 'reco');
  check('la quatrième tactique est refusée', !Game.equipTactic(q, 'soins') && q.tactics.equipped.length === 3);
  const teams = Game.buildTeams(q, DATA.MISSIONS[0]);
  check('les tactiques équipées et celles de la mission adverse partent dans la bataille', teams[0].tactics.length === 3 && teams[1].tactics.length === 1 && teams[1].autoTactics === true);
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
  check('les opérateurs de départ ont un contrat de 24 missions, une recrue 12–16 selon la rareté', q.operators.op_vautour.tours === 24 && (q.credits = 1000, Game.recruit(q, 'op_harfang')) && q.operators.op_harfang.tours === DATA.CONTRACT.tours[3]);
  q.operators.op_lynx.tours = 1;
  const b = new Battle({ seed: 3, teams: Game.buildTeams(q, m) }); b.run(); const r = Game.applyRewards(q, m, b.result);
  check('une mission consomme un tour de contrat ; à zéro l\'opérateur est signalé et indisponible', q.operators.op_lynx.tours === 0 && r.expired.includes('Lynx') && !Game.isAvailable(q, 'op_lynx') && Game.contractExpired(q, 'op_lynx'));
  const c0 = q.credits; check('le renouvellement coûte selon la rareté et redonne des missions', Game.renewContract(q, 'op_lynx') && q.credits === c0 - DATA.CONTRACT.renewPrice[1] && q.operators.op_lynx.tours === DATA.CONTRACT.tours[1] && Game.isAvailable(q, 'op_lynx') === (q.operators.op_lynx.recovery === 0 || q.operators.op_lynx.recovery === undefined));
  check('l\'historique de l\'opérateur garde ses batailles (mission, issue, neutralisations, dégâts)', q.operators.op_vautour.history.length === 1 && q.operators.op_vautour.history[0].m === m.name && typeof q.operators.op_vautour.history[0].dmg === 'number');
  // doublon : tous débloqués → la carte « opérateur » devient une fusion
  const d = Game.newProfile(); for (const id in d.operators) d.operators[id].unlocked = true; d.credits = 1000;
  const seq = [0.0, 0.5, 0.5, 0.0, 0.5, 0.5, 0.0, 0.5, 0.5]; let i = 0; const cards = Game.openPack(d, 'standard', () => seq[(i++) % seq.length]);
  const dupe = cards.find(c => c.type === 'dupe');
  check('une carte opérateur en doublon fusionne : perk +2 (ou crédits) et contrat +4', !!dupe && d.operators[dupe.id].dupes >= 1 && (!dupe.stat || (d.perks[dupe.id] && d.perks[dupe.id][dupe.stat] >= 2)) && d.operators[dupe.id].tours === DATA.CONTRACT.tours[DATA.OPERATORS.find(o => o.id === dupe.id).rarity] + 4 * d.operators[dupe.id].dupes, cards.map(c => c.type + ':' + c.id));
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
check('stockage indisponible : la sauvegarde échoue proprement', Game.save(p, { setItem: () => { throw new Error('quota'); } }) === false);
check('réinitialisation : profil neuf et stockage vidé', Game.reset(storage).credits === 300 && storage.getItem(Game.SAVE_KEY) === null);
console.log(`\n${pass}/${pass + fail} vérifications réussies`); process.exit(fail ? 1 : 0);
