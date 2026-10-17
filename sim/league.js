// Ligue solo : une saison de N batailles contre des équipes IA nommées. Entre deux batailles du joueur, les autres équipes
// s'affrontent entre elles : leurs résultats sont réellement simulés par le moteur (graine dérivée de la saison), pas tirés au sort.
// Classement : 2 points par victoire, 1 par égalité ; départage à la différence de score (PV% restants gagnant − perdant).
(function (root, deps) {
  const { DATA, Battle, RNG } = deps;
  const { OPERATORS, ORDERS, TACTICS } = DATA;

  const AI_TEAMS = [
    { id: 'spearhead', name: 'Fer de lance', insignia: '⚔', strength: 1.0, order: 'assault', tactics: ['tiroir'] },
    { id: 'kopassus', name: 'Garde nocturne', insignia: '☾', strength: 1.1, order: 'hold', tactics: ['tiroir'] },
    { id: 'delta', name: 'Delta Nord', insignia: '△', strength: 0.9, order: 'hold', tactics: ['tiroir'] },
    { id: 'force1', name: 'Force Un', insignia: '①', strength: 0.8, order: 'careful', tactics: ['tiroir'] },
    { id: 'wolf', name: 'Loup Solitaire', insignia: '✦', strength: 1.2, order: 'assault', tactics: ['tiroir'] },
    { id: 'tf141', name: 'Groupe 141', insignia: '☢', strength: 1.0, order: 'assault', tactics: ['tiroir'] },
    { id: 'squadron', name: 'Escadron', insignia: '✈', strength: 1.1, order: 'hold', tactics: ['tiroir'] },
    { id: 'punya', name: 'Punya Shira', insignia: '✚', strength: 1.3, order: 'assault', tactics: ['tiroir'] },
    { id: 'iker', name: 'Iker Delga', insignia: '◈', strength: 0.7, order: 'careful', tactics: ['tiroir'] },
  ];
  const MAPS_ROT = ['parking'];   // une seule carte pour l'instant
  const SEASON_BATTLES = 8;      // batailles du joueur par saison
  const QUALIFY = 3;             // batailles minimum pour être classé
  const PRIZES = [500, 300, 200];  // crédits des trois premiers ; prime de participation si toutes les batailles jouées
  const PARTICIPATION = 150;

  // Composition d'une équipe IA : 5 opérateurs Karst, niveau selon la force et l'avancement de la saison
  function aiRoster(team, seasonSeed, round) {
    const rng = new RNG((seasonSeed * 7919 + AI_TEAMS.indexOf(team) * 104729 + 17) >>> 0);
    const pool = OPERATORS.filter(o => o.faction === 'karst');
    const picked = []; const roles = new Set();
    // les équipes solides (force ≥ 1) partent toujours avec un tireur d'élite et un appui ; les autres tirent au hasard
    if (team.strength >= 1) for (const role of ['marksman', 'support']) { const c = pool.filter(o => o.role === role); const o = c[Math.floor(rng.next() * c.length)]; picked.push(o); roles.add(role); }
    while (picked.length < 5) { const o = pool[Math.floor(rng.next() * pool.length)]; if (picked.includes(o)) continue; if (roles.has(o.role) && picked.length < 4 && rng.next() < 0.7) continue; picked.push(o); roles.add(o.role); }
    const level = Math.max(0, Math.min(10, Math.round((team.strength - 0.7) * 10 + round * 0.25)));
    return picked.map(base => { const d = Object.assign({}, base, { level }); for (const k of ['marksmanship', 'reflexes', 'mobility', 'perception', 'composure', 'endurance']) d[k] = Math.min(100, base[k] + level * 2); return d; });
  }
  function aiTeamDef(team, seasonSeed, round) {
    return { name: team.name, order: team.order, operators: aiRoster(team, seasonSeed, round), tactics: team.tactics, autoTactics: true, insignia: team.insignia, aiId: team.id };
  }

  function newSeason(seed) {
    const standings = {};
    for (const t of AI_TEAMS) standings[t.id] = { played: 0, wins: 0, draws: 0, losses: 0, diff: 0, points: 0 };
    standings.player = { played: 0, wins: 0, draws: 0, losses: 0, diff: 0, points: 0 };
    return { seed: seed >>> 0, round: 0, standings, history: [], finished: false, prizeGiven: false };
  }
  // Adversaire du prochain match du joueur : rotation déterministe qui évite les répétitions
  function nextOpponent(season) {
    const rng = new RNG((season.seed + season.round * 31) >>> 0);
    const recent = season.history.slice(-3).map(h => h.opponent);
    const cands = AI_TEAMS.filter(t => !recent.includes(t.id));
    return cands[Math.floor(rng.next() * cands.length)];
  }
  const nextMap = (season) => MAPS_ROT[season.round % MAPS_ROT.length];

  function record(standings, a, b, winner, diff) {
    // winner : 'a' | 'b' | null ; diff : score de a − score de b (PV% restants)
    const sa = standings[a], sb = standings[b];
    sa.played++; sb.played++; sa.diff += diff; sb.diff -= diff;
    if (winner === 'a') { sa.wins++; sb.losses++; sa.points += 2; } else if (winner === 'b') { sb.wins++; sa.losses++; sb.points += 2; } else { sa.draws++; sb.draws++; sa.points++; sb.points++; }
    // forme : les cinq derniers résultats de chaque équipe (v / n / d)
    sa.form = (sa.form || []).concat(winner === 'a' ? 'v' : winner === 'b' ? 'd' : 'n').slice(-5); sb.form = (sb.form || []).concat(winner === 'b' ? 'v' : winner === 'a' ? 'd' : 'n').slice(-5);
  }
  // puissance d'une équipe IA à la journée en cours (moyenne des notes de ses opérateurs, même barème que le QG)
  function aiRating(team, season, rateFn) { const ops = aiRoster(team, season.seed, season.round); return Math.round(ops.reduce((s, d) => s + rateFn(d), 0) / ops.length); }
  // Après une bataille du joueur : enregistrer son résultat, puis simuler une journée entre les autres équipes
  function applyPlayerResult(season, opponentId, result) {
    const p0 = result.teams[0].hpPct, p1 = result.teams[1].hpPct;
    const winner = result.winner === 0 ? 'a' : result.winner === 1 ? 'b' : null;
    record(season.standings, 'player', opponentId, winner, p0 - p1);
    season.history.push({ round: season.round, opponent: opponentId, winner: result.winner, diff: p0 - p1, map: result.map });
    simulateOthers(season, opponentId);
    season.round++;
    if (season.round >= SEASON_BATTLES) season.finished = true;
    return season;
  }
  // Les autres équipes s'affrontent par paires (celles qui n'ont pas joué contre le joueur cette journée)
  function simulateOthers(season, busyId) {
    const rng = new RNG((season.seed * 13 + season.round * 977 + 5) >>> 0);
    const ids = AI_TEAMS.filter(t => t.id !== busyId).map(t => t.id);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    for (let i = 0; i + 1 < ids.length; i += 2) {
      const ta = AI_TEAMS.find(t => t.id === ids[i]), tb = AI_TEAMS.find(t => t.id === ids[i + 1]);
      const b = new Battle({ seed: (season.seed + season.round * 101 + i * 7) >>> 0, mapId: MAPS_ROT[(season.round + i) % MAPS_ROT.length], teams: [aiTeamDef(ta, season.seed, season.round), aiTeamDef(tb, season.seed, season.round)], timeLimit: 180 });
      b.run();
      const r = b.result; record(season.standings, ta.id, tb.id, r.winner === 0 ? 'a' : r.winner === 1 ? 'b' : null, r.teams[0].hpPct - r.teams[1].hpPct);
    }
  }
  function table(season) {
    const rows = Object.entries(season.standings).map(([id, s]) => Object.assign({ id, name: id === 'player' ? null : AI_TEAMS.find(t => t.id === id).name, insignia: id === 'player' ? null : AI_TEAMS.find(t => t.id === id).insignia }, s));
    rows.sort((x, y) => y.points - x.points || y.diff - x.diff || y.wins - x.wins || x.id.localeCompare(y.id));
    rows.forEach((r, i) => { r.rank = i + 1; r.qualified = r.played >= QUALIFY; });
    return rows;
  }
  // Récompense de fin de saison : rang final (si qualifié) + prime de participation
  function seasonPrize(season) {
    const rows = table(season); const me = rows.find(r => r.id === 'player');
    let credits = 0; const lines = [];
    if (me.qualified && me.rank <= 3) { credits += PRIZES[me.rank - 1]; lines.push(`${me.rank}${me.rank === 1 ? 'er' : 'e'} du classement : +${PRIZES[me.rank - 1]} crédits`); }
    if (me.played >= SEASON_BATTLES) { credits += PARTICIPATION; lines.push(`Toutes les batailles jouées : +${PARTICIPATION} crédits`); }
    if (!me.qualified) lines.push(`Non classé (moins de ${QUALIFY} batailles jouées).`);
    return { credits, lines, rank: me.rank, qualified: me.qualified };
  }

  root.League = { aiRating, AI_TEAMS, SEASON_BATTLES, QUALIFY, PRIZES, PARTICIPATION, newSeason, nextOpponent, nextMap, aiTeamDef, applyPlayerResult, table, seasonPrize };
})(typeof module !== 'undefined' ? module.exports : (window.OT = window.OT || {}),
   typeof module !== 'undefined' ? Object.assign({}, require('./rng.js'), require('./data.js'), require('./map.js'), require('./engine.js')) : (window.OT = window.OT || {}));
