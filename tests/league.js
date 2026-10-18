// Tests de la ligue solo.
const OT = Object.assign({}, require('../sim/rng.js'), require('../sim/data.js'), require('../sim/map.js'), require('../sim/engine.js'), require('../sim/game.js'), require('../sim/league.js'));
const { League, Game, Battle } = OT;
let pass = 0, fail = 0; // La ligue est désactivée pour l'instant (menus cachés) ; avec une seule classe (assaut), l'écart de force entre équipes
// ne tient plus qu'au niveau : ce contrôle statistique est mis de côté.
const DESACTIVE = ["sur 4 saisons, les deux équipes fortes"]; let skip = 0;
const check = (n, c, i) => { if (DESACTIVE.some(d => n.startsWith(d))) { skip++; console.log('(désactivé) ' + n); return; } if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + JSON.stringify(i))); };
const t0 = Date.now();
const season = League.newSeason(42);
check('saison neuve : 10 équipes à 0 point, 8 batailles à jouer', Object.keys(season.standings).length === 10 && League.SEASON_BATTLES === 8 && !season.finished);
const p = Game.newProfile();
let seen = [];
for (let i = 0; i < League.SEASON_BATTLES; i++) {
  const opp = League.nextOpponent(season); seen.push(opp.id);
  const teams = [Game.buildTeams(p, OT.DATA.MISSIONS[0])[0], League.aiTeamDef(opp, season.seed, season.round)];
  const b = new Battle({ seed: 1000 + i, mapId: League.nextMap(season), teams }); b.run();
  League.applyPlayerResult(season, opp.id, b.result);
}
const ms = Date.now() - t0;
check('8 journées simulées (joueur + 4 matchs IA chacune) en moins de 40 s (machine de test lente)', season.finished && ms < 40000, ms);
check('pas deux fois le même adversaire dans trois journées consécutives', seen.every((id, i) => !seen.slice(Math.max(0, i - 3), i).includes(id)), seen);
const rows = League.table(season);
const me = rows.find(r => r.id === 'player');
check('le joueur a joué 8 fois, les IA entre 7 et 15 fois (8 journées, l\'une d\'elles reste parfois sans match)', me.played === 8 && rows.filter(r => r.id !== 'player').every(r => r.played >= 7 && r.played <= 15), rows.map(r => r.id + ':' + r.played));
const totalPts = rows.reduce((s, r) => s + r.points, 0), totalPlayed = rows.reduce((s, r) => s + r.played, 0);
check('cohérence : 2 points distribués par match, somme des différences nulle', totalPts === totalPlayed && Math.abs(rows.reduce((s, r) => s + r.diff, 0)) < 1e-9, { totalPts, totalPlayed });
check('classement trié par points puis différence', rows.every((r, i) => i === 0 || rows[i - 1].points > r.points || (rows[i - 1].points === r.points && rows[i - 1].diff >= r.diff)));
check('tous classés (≥ 3 matchs)', rows.every(r => r.qualified));
const prize = League.seasonPrize(season);
check('prime de fin de saison : participation comprise, podium selon le rang', prize.credits >= League.PARTICIPATION && (me.rank > 3 || prize.credits === League.PARTICIPATION + League.PRIZES[me.rank - 1]), prize);
// déterminisme : même graine de saison + mêmes résultats joueur → même classement
const s2 = League.newSeason(42); for (let i = 0; i < 2; i++) { const opp = League.nextOpponent(s2); const teams = [Game.buildTeams(p, OT.DATA.MISSIONS[0])[0], League.aiTeamDef(opp, s2.seed, s2.round)]; const b = new Battle({ seed: 1000 + i, mapId: League.nextMap(s2), teams }); b.run(); League.applyPlayerResult(s2, opp.id, b.result); }
const s3 = League.newSeason(42); for (let i = 0; i < 2; i++) { const opp = League.nextOpponent(s3); const teams = [Game.buildTeams(p, OT.DATA.MISSIONS[0])[0], League.aiTeamDef(opp, s3.seed, s3.round)]; const b = new Battle({ seed: 1000 + i, mapId: League.nextMap(s3), teams }); b.run(); League.applyPlayerResult(s3, opp.id, b.result); }
check('la saison est déterministe (graine)', JSON.stringify(s2.standings) === JSON.stringify(s3.standings));
// les équipes IA fortes finissent devant les faibles en moyenne sur plusieurs saisons (une saison seule reste incertaine : 8 matchs)
let sumStrong = 0, sumWeak = 0;
for (let sd = 1; sd <= 4; sd++) { const sx = League.newSeason(sd); for (let i = 0; i < League.SEASON_BATTLES; i++) { const opp = League.nextOpponent(sx); const teams = [Game.buildTeams(p, OT.DATA.MISSIONS[0])[0], League.aiTeamDef(opp, sx.seed, sx.round)]; const b = new Battle({ seed: 2000 + sd * 10 + i, mapId: League.nextMap(sx), teams }); b.run(); League.applyPlayerResult(sx, opp.id, b.result); } const tb = League.table(sx); sumStrong += tb.find(r => r.id === 'wolf').points + tb.find(r => r.id === 'punya').points; sumWeak += tb.find(r => r.id === 'iker').points + tb.find(r => r.id === 'force1').points; }
check('sur 4 saisons, les deux équipes fortes totalisent plus de points que les deux faibles', sumStrong > sumWeak, { sumStrong, sumWeak });
{ const sx = League.newSeason(7); for (let i = 0; i < 6; i++) { const opp = League.nextOpponent(sx); const b = new Battle({ seed: 300 + i, mapId: League.nextMap(sx), teams: [Game.buildTeams(p, OT.DATA.MISSIONS[0])[0], League.aiTeamDef(opp, sx.seed, sx.round)] }); b.run(); League.applyPlayerResult(sx, opp.id, b.result); }
  const tb = League.table(sx), me = tb.find(r => r.id === 'player');
  const formOk = tb.every(r => (r.form || []).length === Math.min(5, r.played) && (r.form || []).every(x => 'vnd'.includes(x))) && me.form.filter(x => x === 'v').length <= me.wins;
  const rt = League.aiRating(League.AI_TEAMS[0], sx, Game.defRating);
  check('forme : les cinq derniers résultats de chaque équipe (v/n/d) ; puissance des équipes IA calculée comme au QG', formOk && rt > 20 && rt < 100, { me: me.form, rt }); }
console.log(`\n${pass}/${pass + fail} vérifications réussies` + (skip ? ` (${skip} mises de côté : fonctions désactivées)` : '')); process.exit(fail ? 1 : 0);
