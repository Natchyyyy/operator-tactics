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
  Game.applyFormation(p, 'nord');
  const b = new Battle({ seed: 2, teams: Game.buildTeams(p, DATA.MISSIONS[0]) });
  let north = 0; while (b.t < 14) { b.step(); } for (const u of b.teams[0].units) if (u.z < 16) north++;
  check('formation « nord » : l\'escouade progresse par le couloir nord', north >= 4, b.teams[0].units.map(u => u.z.toFixed(0)));
  Game.applyFormation(p, 'sud');
  const b2 = new Battle({ seed: 2, teams: Game.buildTeams(p, DATA.MISSIONS[0]) });
  let south = 0; while (b2.t < 14) { b2.step(); } for (const u of b2.teams[0].units) if (u.z > 24) south++;
  check('formation « sud » : par le couloir sud', south >= 4, b2.teams[0].units.map(u => u.z.toFixed(0)));
  Game.applyFormation(p, 'auto');
}
// escouade
check('on ne peut pas dépasser 5 ni ajouter un verrouillé', !Game.toggleSquad(p, 'op_cobra') && Game.toggleSquad(p, 'op_belier') && p.squad.length === 4 && !Game.squadReady(p));
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
  check('les crédits gagnés dépendent de l\'issue', p.credits - before === r.credits && r.credits === Math.round(m.reward * (r.won ? 1 : r.draw ? 0.5 : 0.3)), r);
  const xpOk = p.squad.every(id => { const u = b.result.teams[0].units.find(x => x.id === '0:' + id); const exp = Math.round((m.xp + Math.round(u.stats.damageDealt * 0.25) + u.stats.kills * 25 + (r.won ? 20 : 0)) * (u.alive ? 1 : 0.7)); return p.operators[id].xp - xpBefore[id] === exp; });
  check('l\'expérience de chacun découle de ses actions réelles (dégâts, neutralisations, survie)', xpOk);
  check('la carrière est mise à jour', p.career.battles === 1 && (p.career.wins + p.career.losses + p.career.draws) === 1 && p.missions[m.id].attempts === 1);
}
// sauvegarde
check('sauvegarde puis rechargement identiques', Game.save(p, storage) && JSON.stringify(Game.load(storage)) === JSON.stringify(p));
check('sans sauvegarde : null (le jeu repart d\'un profil neuf)', Game.load({ getItem: () => null }) === null);
check('sauvegarde corrompue : null, sans planter', Game.load({ getItem: () => '{garbage' }) === null);
check('stockage indisponible : la sauvegarde échoue proprement', Game.save(p, { setItem: () => { throw new Error('quota'); } }) === false);
check('réinitialisation : profil neuf et stockage vidé', Game.reset(storage).credits === 300 && storage.getItem(Game.SAVE_KEY) === null);
console.log(`\n${pass}/${pass + fail} vérifications réussies`); process.exit(fail ? 1 : 0);
