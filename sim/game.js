// Boucle de jeu OPERATOR TACTICS : profil du joueur, collection, équipement, missions, récompenses, sauvegarde.
// Logique pure (testable en ligne de commande) ; l'interface (web/app.js) ne fait que l'afficher.
(function (root, deps) {
  const { DATA } = deps;
  const { WEAPONS, ARMORS, ROLES, OPERATORS, ORDERS, TRAITS, TACTICS, INSIGNIAS, UNIFORMS, RANKS, PACKS, ACHIEVEMENTS, PROMOTION_LEVELS, CONTRACT, MISSIONS, CHALLENGES, PRICES, XP_TABLE, LEVEL_STAT_BONUS, MAX_LEVEL , SYNERGIES, WOUND , CAMPAIGNS, QUICK, SPECIAL_OPS } = DATA;
  const STATS = ['marksmanship', 'reflexes', 'mobility', 'perception', 'composure', 'endurance'];
  const SAVE_KEY = 'operator-tactics-save-v1';
  const STARTING = ['op_vautour', 'op_lynx', 'op_granit', 'op_bastion', 'op_belier'];

  // ---- Profil ---------------------------------------------------------------------------
  function newProfile() {
    const operators = {};
    for (const o of OPERATORS) if (!o.faction) operators[o.id] = { unlocked: STARTING.includes(o.id), xp: 0, weaponId: ROLES[o.role].weapon, armorId: o.armor, battles: 0, kills: 0, lane: null,
      tours: STARTING.includes(o.id) ? CONTRACT.startingTours : CONTRACT.tours[o.rarity], traits: [], pendingPromotions: [], history: [], dupes: 0, headgear: 'casque' };
    return {
      version: 1, credits: 300, operators, squad: STARTING.slice(), order: 'assault',
      inventory: { weapons: { carbine: true, smg: true, dmr: true, lmg: true, shotgun: true }, armors: { light: true, medium: true, heavy: true } }, // battle, smgsil : à acheter
      career: { battles: 0, wins: 0, losses: 0, draws: 0, kills: 0, losses_units: 0 }, missions: {}, challenges: {}, lastSeed: null,
      // méta à la manière des jeux de cartes : nom et insigne d'équipe, uniforme, rang du joueur, tactiques, perks par opérateur
      teamName: 'Alpha', insignia: 'etoile', uniform: 'olive', unlocked: { insignias: ['etoile', 'bouclier'], uniforms: ['olive'] },
      xp: 0, tactics: { owned: { fumigene: true, drill: true }, equipped: ['fumigene', 'drill'] }, perks: {}, packsOpened: 0,
      league: null, leagueSeasons: 0, achievements: {}, tacticsUsed: 0,
      headgear: { casque: true, casque_lunettes: true },   // couvre-chefs possédés (communs à tous les opérateurs)
      campaigns: {}, quick: { wins: 0, played: 0 }, freePacks: {}, ops: { wins: 0, captureWins: 0, cleanWins: 0, done: {} },
    };
  }
  const levelFor = (xp) => { let l = 0; while (l < MAX_LEVEL && xp >= XP_TABLE[l + 1]) l++; return l; };
  const xpToNext = (xp) => { const l = levelFor(xp); return l >= MAX_LEVEL ? null : XP_TABLE[l + 1] - xp; };

  // Fiche d'opérateur effective (statistiques bonifiées par le niveau, arme et protection équipées, voie).
  function effectiveDef(profile, id) {
    const base = OPERATORS.find(o => o.id === id); const st = profile.operators[id];
    const level = levelFor(st.xp);
    const def = Object.assign({}, base, { level, weaponId: st.weaponId, armor: st.armorId, lane: st.lane, traits: st.traits || [], headgear: st.headgear });
    const perks = (profile.perks && profile.perks[id]) || {};
    for (const k of STATS) def[k] = Math.min(100, base[k] + level * LEVEL_STAT_BONUS + (perks[k] || 0));
    if (st.wounded) { def.wounded = true; for (const k of STATS) def[k] = Math.round(def[k] * WOUND.statFactor); }   // blessure grave : compétences ÷2
    return def;
  }
  // Fiche d'un ennemi de mission : niveau fixé par la mission.
  function enemyDef(id, level, weaponId) {
    const base = OPERATORS.find(o => o.id === id);
    const def = Object.assign({}, base, { level }); if (weaponId) def.weaponId = weaponId;
    for (const k of STATS) def[k] = Math.min(100, base[k] + level * LEVEL_STAT_BONUS);
    return def;
  }
  function buildTeams(profile, mission) {
    const uni = UNIFORMS.find(u => u.id === profile.uniform) || UNIFORMS[0];
    return [
      { name: profile.teamName || 'Alpha', order: profile.order, operators: profile.squad.map(id => effectiveDef(profile, id)), tactics: (profile.tactics && profile.tactics.equipped) || [], insignia: profile.insignia, uniform: uni.id },
      { name: 'Groupe Karst', order: mission.order, operators: mission.enemy.map(id => enemyDef(id, mission.level, mission.enemyWeapons && mission.enemyWeapons[id])), tactics: mission.enemyTactics || [], autoTactics: true, insignia: 'karst' },
    ];
  }
  // ---- Rang du joueur, puissance d'équipe (indicatifs) ----------------------------------
  const rankFor = (xp) => { let r = 0; while (r < RANKS.length - 1 && xp >= RANKS[r + 1].xp) r++; return r; };
  const xpToNextRank = (xp) => { const r = rankFor(xp); return r >= RANKS.length - 1 ? null : RANKS[r + 1].xp - xp; };
  // Puissance : moyenne des statistiques effectives + arme + protection, ramenée à une échelle lisible (≈ 25–70).
  // Purement informative : le combat n'en tient aucun compte.
  // Note d'un opérateur (≈ 45 pour une recrue, ≈ 70 au niveau maximum) : compétences (chaque niveau +2,4), arme, protection.
  // Même calcul pour les adversaires (defRating) : la comparaison de l'écran VS est honnête.
  function defRating(d) {
    const stats = STATS.reduce((s, k) => s + d[k], 0) / STATS.length;
    const w = WEAPONS[d.weaponId || ROLES[d.role].weapon], a = ARMORS[d.armor];
    const wv = (w.damage * w.rpm / 60) * Math.min(1, w.range / 40) / 8 + w.accuracy * 10;
    return Math.max(1, (stats - 50) * 1.2 + wv + a.torso * 20);
  }
  function operatorRating(profile, id) { return defRating(effectiveDef(profile, id)); }
  const RATING_PER_LEVEL = LEVEL_STAT_BONUS * 1.2;
  const teamRating = (profile) => profile.squad.length ? Math.round(profile.squad.reduce((s, id) => s + operatorRating(profile, id), 0) / profile.squad.length) : 0;
  // ---- Tactiques équipées (3 emplacements) -----------------------------------------------
  function equipTactic(profile, id) {
    if (!TACTICS[id] || !profile.tactics.owned[id]) return false;
    const eq = profile.tactics.equipped;
    if (eq.includes(id)) { eq.splice(eq.indexOf(id), 1); return true; } // retirer
    if (eq.length >= 3) return false;
    eq.push(id); return true;
  }
  // ---- Paquets de cartes -----------------------------------------------------------------
  // rng : fonction () → [0,1) (injectable pour les tests). Renvoie la liste des cartes obtenues, déjà appliquées au profil.
  function openPack(profile, packId, rng) {
    const pack = PACKS[packId]; if (!pack) return null;
    profile.freePacks = profile.freePacks || {};
    const free = (profile.freePacks[packId] || 0) > 0;             // paquet offert (bataille rapide, opérations spéciales) : rien à payer
    if (!free && profile.credits < pack.price) return null;
    if (free) profile.freePacks[packId]--; else profile.credits -= pack.price;
    profile.packsOpened = (profile.packsOpened || 0) + 1;
    rng = rng || Math.random;
    const pick = (arr) => arr[Math.floor(rng() * arr.length)];
    const types = Object.keys(pack.weights), total = types.reduce((s, k) => s + pack.weights[k], 0);
    const cards = [];
    for (let i = 0; i < pack.cards; i++) {
      let r = rng() * total, type = types[0]; for (const k of types) { r -= pack.weights[k]; if (r < 0) { type = k; break; } }
      cards.push(drawCard(profile, type, rng, pick));
    }
    return cards;
  }
  function drawCard(profile, type, rng, pick) {
    const recruitable = OPERATORS.filter(o => !o.faction);
    if (type === 'operator') {
      const locked = recruitable.filter(o => !profile.operators[o.id].unlocked);
      if (locked.length) { const o = pick(locked); profile.operators[o.id].unlocked = true; profile.operators[o.id].tours = CONTRACT.tours[o.rarity]; return { type: 'operator', id: o.id, title: o.callsign, text: `Nouvelle recrue : ${ROLES[o.role].name} (${o.unit})`, rarity: o.rarity }; }
      // doublon : fusion → le même opérateur gagne un perk permanent (+2) et un prolongement de contrat ; à défaut, des crédits
      const o = pick(recruitable); const st = profile.operators[o.id]; st.dupes = (st.dupes || 0) + 1;
      const open = STATS.filter(k => ((profile.perks[o.id] || {})[k] || 0) < 10);
      st.tours = (st.tours > 0 ? st.tours : 0) + 4;
      if (open.length) { const k = pick(open); profile.perks[o.id] = profile.perks[o.id] || {}; profile.perks[o.id][k] = (profile.perks[o.id][k] || 0) + 2; return { type: 'dupe', id: o.id, stat: k, title: `${o.callsign} (doublon)`, text: `Fusion : ${STAT_FR[k]} +2 permanent et contrat prolongé de 4 missions.`, rarity: o.rarity }; }
      profile.credits += 120; return { type: 'dupe', id: o.id, title: `${o.callsign} (doublon)`, text: 'Fusion : +120 crédits et contrat prolongé de 4 missions.', rarity: o.rarity };
    }
    if (type === 'tactic') {
      const locked = Object.values(TACTICS).filter(t => !profile.tactics.owned[t.id]);
      if (locked.length) { const t = pick(locked); profile.tactics.owned[t.id] = true; return { type: 'tactic', id: t.id, title: t.name, text: t.desc, rarity: 2 }; }
      type = 'credits';
    }
    if (type === 'perk') {
      const owned = recruitable.filter(o => profile.operators[o.id].unlocked);
      const o = pick(owned); const open = STATS.filter(k => ((profile.perks[o.id] || {})[k] || 0) < 10);
      if (open.length) { const k = pick(open); profile.perks[o.id] = profile.perks[o.id] || {}; profile.perks[o.id][k] = (profile.perks[o.id][k] || 0) + 2; return { type: 'perk', id: o.id, stat: k, title: `${o.callsign} : ${STAT_FR[k]} +2`, text: 'Bonus permanent à une statistique (cumulable jusqu\'à +10).', rarity: 1 }; }
      type = 'xp';
    }
    if (type === 'xp') {
      const owned = recruitable.filter(o => profile.operators[o.id].unlocked); const o = pick(owned); const v = 40 + Math.floor(rng() * 41);
      const before = levelFor(profile.operators[o.id].xp); profile.operators[o.id].xp += v; const after = levelFor(profile.operators[o.id].xp);
      return { type: 'xp', id: o.id, title: `${o.callsign} : +${v} XP`, text: after > before ? `Promotion : niveau ${after} !` : 'Expérience de terrain.', rarity: 1 };
    }
    if (type === 'cosmetic') {
      const ins = INSIGNIAS.filter(i => !profile.unlocked.insignias.includes(i.id)), unis = UNIFORMS.filter(u => !profile.unlocked.uniforms.includes(u.id));
      const hgs = Object.keys(HEADGEAR_PRICES).filter(h => !profile.headgear[h]);
      const pool = [...ins.map(i => ({ kind: 'insignia', item: i })), ...unis.map(u => ({ kind: 'uniform', item: u })), ...hgs.map(h => ({ kind: 'headgear', item: { id: h, name: h } }))];
      if (pool.length) { const c = pick(pool); if (c.kind === 'headgear') { profile.headgear[c.item.id] = true; return { type: 'cosmetic', id: c.item.id, title: `Couvre-chef : ${c.item.id.replace(/_/g, ' ')}`, text: 'À attribuer sur la fiche d\'un opérateur.', rarity: 2 }; } (c.kind === 'insignia' ? profile.unlocked.insignias : profile.unlocked.uniforms).push(c.item.id); return { type: 'cosmetic', id: c.item.id, title: c.kind === 'insignia' ? `Insigne : ${c.item.name}` : `Uniforme : ${c.item.name}`, text: 'Personnalisation d\'équipe débloquée.', rarity: 2 }; }
      type = 'credits';
    }
    const v = 50 + Math.floor(rng() * 71); profile.credits += v;
    return { type: 'credits', title: `+${v} crédits`, text: 'Prime de mission.', rarity: 1 };
  }
  const STAT_FR = { marksmanship: 'Tir', reflexes: 'Réflexes', mobility: 'Mobilité', perception: 'Perception', composure: 'Sang-froid', endurance: 'Endurance' };
  // Couvre-chefs : achat (prix dans Figure.HEADGEAR côté web ; ici table miroir) et attribution à un opérateur
  const HEADGEAR_PRICES = { casque: 0, casque_lunettes: 0, beret_rouge: 90, beret_vert: 90, beret_bleu: 90, casquette: 60, bonnet: 60, chapeau: 110, lunettes_soleil: 70, foulard: 80, foulard_rouge: 80, nu: 40 };
  function buyHeadgear(profile, id) {
    if (HEADGEAR_PRICES[id] === undefined || profile.headgear[id]) return false;
    if (profile.credits < HEADGEAR_PRICES[id]) return false;
    profile.credits -= HEADGEAR_PRICES[id]; profile.headgear[id] = true; return true;
  }
  function setHeadgear(profile, opId, id) { if (!profile.headgear[id] || !profile.operators[opId]) return false; profile.operators[opId].headgear = id; return true; }
  function setCustomization(profile, field, value) {
    if (field === 'teamName') { const v = String(value || '').trim().slice(0, 18); if (!v) return false; profile.teamName = v; return true; }
    if (field === 'insignia') { if (!profile.unlocked.insignias.includes(value)) return false; profile.insignia = value; return true; }
    if (field === 'uniform') { if (!profile.unlocked.uniforms.includes(value)) return false; profile.uniform = value; return true; }
    return false;
  }
  // Options complètes de bataille pour une mission (carte, objectif, équipes)
  function battleOptions(profile, mission, seed) {
    const opts = { seed, teams: buildTeams(profile, mission), mapId: mission.mapId };
    if (mission.conditions && mission.conditions !== 'jour') opts.conditions = mission.conditions;
    if (mission.objective === 'hold') opts.objective = { type: 'hold', team: 0, duration: mission.duration || 90 };
    if (mission.objective === 'capture') opts.objective = { type: 'capture' };
    return opts;
  }
  // Synergies d'une escouade (fiches d'opérateurs) : mêmes règles que le moteur, avec tout le monde debout
  function squadSynergies(defs) {
    const traitsOf = (d) => [d.trait].concat(d.traits || []);
    const match = (d, spec) => (spec.role !== undefined && [].concat(spec.role).includes(d.role)) || (spec.trait !== undefined && [].concat(spec.trait).some(t => traitsOf(d).includes(t)));
    const out = [];
    for (const sy of SYNERGIES) {
      const targets = defs.filter(d => match(d, sy.target) && defs.some(s => s !== d && match(s, sy.source)));
      if (targets.length) out.push({ id: sy.id, name: sy.name, effect: sy.effect, desc: sy.desc, sources: defs.filter(s => match(s, sy.source)).map(s => s.callsign), targets: targets.map(d => d.callsign) });
    }
    return out;
  }
  // ---- Modes de jeu : campagnes, bataille rapide, opérations spéciales ------------------------------------------
  const campaignState = (profile, cid) => { profile.campaigns = profile.campaigns || {}; return profile.campaigns[cid] = profile.campaigns[cid] || { played: {}, won: {}, participationPaid: false, completionPaid: false }; };
  function campaignUnlocked(profile, cid) {
    const c = CAMPAIGNS.find(x => x.id === cid); if (!c) return false; const u = c.unlock; if (!u) return true;
    if (u.rank !== undefined && rankFor(profile.xp || 0) < u.rank) return false;
    if (u.rating !== undefined && teamRating(profile) < u.rating) return false;
    return true;
  }
  // La mission d'une campagne (adversaire ajusté) ; la campagne régulière garde l'identifiant d'origine.
  function campaignMission(cid, mid) {
    const c = CAMPAIGNS.find(x => x.id === cid), base = MISSIONS.find(m => m.id === mid); if (!c || !base) return null;
    if (c.id === 'reguliere') return Object.assign({}, base, { campaign: cid, final: c.missions[c.missions.length - 1] === mid });
    const extra = Object.keys(TACTICS).filter(t => !(base.enemyTactics || []).includes(t)).slice(0, c.extraTactic === true ? 1 : (c.extraTactic || 0));
    return Object.assign({}, base, { id: `${cid}:${mid}`, name: `${base.name} (${c.id === 'veteran' ? 'vétéran' : 'élite'})`, campaign: cid, final: c.missions[c.missions.length - 1] === mid,
      level: base.level + c.levelBonus, enemyTactics: (base.enemyTactics || []).concat(extra), reward: Math.round(base.reward * c.rewardMul), xp: Math.round(base.xp * (1 + (c.rewardMul - 1) / 2)) });
  }
  // une mission est jouable si c'est la première de la campagne, ou si la précédente a été jouée
  function missionUnlocked(profile, cid, mid) {
    const c = CAMPAIGNS.find(x => x.id === cid); if (!c || !campaignUnlocked(profile, cid)) return false;
    const i = c.missions.indexOf(mid); if (i <= 0) return i === 0;
    const st = campaignState(profile, cid), prev = c.missions[i - 1];
    // campagne régulière : les missions déjà tentées avant l'existence des campagnes comptent
    return !!st.played[prev] || (cid === 'reguliere' && !!(profile.missions[prev] && profile.missions[prev].attempts));
  }
  function campaignProgress(profile, cid) {
    const c = CAMPAIGNS.find(x => x.id === cid), st = campaignState(profile, cid);
    const played = c.missions.filter(m => st.played[m] || (cid === 'reguliere' && profile.missions[m] && profile.missions[m].attempts)).length;
    const won = c.missions.filter(m => st.won[m] || (cid === 'reguliere' && profile.missions[m] && profile.missions[m].wins)).length;
    return { played, won, total: c.missions.length };
  }
  // Bataille rapide : adversaire de la Karst au niveau de votre puissance d'équipe, carte et objectif tirés au sort.
  function quickBattle(profile, rng) {
    rng = rng || Math.random; const pick = (a) => a[Math.floor(rng() * a.length)];
    const karst = OPERATORS.filter(o => o.faction === 'karst').map(o => o.id);
    for (let i = karst.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [karst[i], karst[j]] = [karst[j], karst[i]]; }
    // niveau : le plus haut dont la note moyenne reste un peu sous la vôtre (vos tactiques et vos ordres font la différence)
    const target = teamRating(profile) - 2, rate = (lv) => karst.slice(0, 5).reduce((s, id) => s + defRating(enemyDef(id, lv)), 0) / 5;
    let level = 0; while (level < 12 && rate(level + 1) <= target) level++;
    const size = rate(0) > target + 4 ? 4 : 5;                     // escouade de recrues face à des vétérans : un adversaire de moins
    const objective = pick(['eliminate', 'eliminate', 'capture', 'capture', 'hold']);
    const tac = Object.keys(TACTICS); const t1 = pick(tac), t2 = pick(tac.filter(t => t !== t1));
    return { id: 'rapide', name: 'Bataille rapide', quick: true, desc: 'Un adversaire à votre mesure.', mapId: pick(['entrepot', 'place', 'raffinerie', 'parking']), enemy: karst.slice(0, size), level,
      order: objective === 'hold' ? 'assault' : pick(['assault', 'careful', 'hold']), objective, duration: 120, enemyTactics: rng() < 0.5 ? [t1] : [t1, t2], reward: QUICK.reward, xp: QUICK.xp, difficulty: 2,
      conditions: pick(['jour', 'jour', 'jour', 'jour', 'jour', 'nuit', 'brouillard', 'pluie']) };
  }
  // niveau de l'adversaire de bataille rapide : l'écart de puissance avec une escouade de recrues, converti en niveaux
  let baseRating = null;
  function quickLevel(profile) { if (baseRating === null) baseRating = teamRating(newProfile()); return Math.max(0, Math.min(12, Math.round((teamRating(profile) - baseRating) / RATING_PER_LEVEL))); }
  // Après chaque bataille : campagne, bataille rapide, opérations spéciales (appelé par applyRewards)
  function applyModes(profile, mission, result, r) {
    const won = result.winner === 0;
    r.modeLines = [];
    profile.ops = profile.ops || { wins: 0, captureWins: 0, cleanWins: 0, done: {} }; profile.freePacks = profile.freePacks || {};
    if (mission.campaign) {
      const c = CAMPAIGNS.find(x => x.id === mission.campaign), st = campaignState(profile, c.id), mid = mission.id.includes(':') ? mission.id.split(':')[1] : mission.id;
      st.played[mid] = true; if (won) st.won[mid] = true;
      const pr = campaignProgress(profile, c.id);
      if (pr.played === pr.total && !st.participationPaid) { st.participationPaid = true; profile.credits += c.participation; r.modeLines.push(`${c.name} : toutes les missions jouées — prime de participation +${c.participation} crédits`); }
      if (pr.won === pr.total && !st.completionPaid) { st.completionPaid = true; profile.credits += c.completion; r.modeLines.push(`${c.name} terminée : prime de campagne +${c.completion} crédits`); }
    }
    if (mission.quick) {
      profile.quick = profile.quick || { wins: 0, played: 0 }; profile.quick.played++;
      if (won) { profile.quick.wins++; if (profile.quick.wins % QUICK.prizeEvery === 0) { profile.freePacks[QUICK.prizePack] = (profile.freePacks[QUICK.prizePack] || 0) + 1; r.modeLines.push(`Bataille rapide : ${QUICK.prizeEvery} victoires — ${PACKS[QUICK.prizePack].name} offert !`); } }
    }
    if (won) {
      profile.ops.wins++;
      if (result.teams[0].capture >= 100) profile.ops.captureWins++;
      if (result.teams[0].units.every(u => u.alive)) profile.ops.cleanWins++;
    }
    for (const op of SPECIAL_OPS) {
      if (profile.ops.done[op.id] || (profile.ops[op.stat] || 0) < op.goal) continue;
      profile.ops.done[op.id] = true; profile.credits += op.reward.credits || 0;
      if (op.reward.pack) profile.freePacks[op.reward.pack] = (profile.freePacks[op.reward.pack] || 0) + 1;
      r.modeLines.push(`${op.name} accomplie : +${op.reward.credits} crédits${op.reward.pack ? ' et un ' + PACKS[op.reward.pack].name.toLowerCase() + ' offert' : ''}`);
    }
  }
  // Libellé court de l'objectif d'une mission (QG, écran VS)
  function objectiveLabel(m) {
    if (m.objective === 'hold') return `tenir ${m.duration} s`;
    if (m.objective === 'capture') return 'capturer la zone';
    return 'neutraliser l\u2019adversaire';
  }

  // ---- Règles d'équipement / d'escouade -----------------------------------------------
  function canEquipWeapon(profile, id, weaponId) {
    const base = OPERATORS.find(o => o.id === id);
    return !!profile.inventory.weapons[weaponId] && ROLES[base.role].weapons.includes(weaponId);
  }
  function setWeapon(profile, id, weaponId) { if (!canEquipWeapon(profile, id, weaponId)) return false; profile.operators[id].weaponId = weaponId; return true; }
  function setArmor(profile, id, armorId) { if (!profile.inventory.armors[armorId]) return false; profile.operators[id].armorId = armorId; return true; }
  function setLane(profile, id, lane) { profile.operators[id].lane = lane === null ? null : Math.max(-1, Math.min(1, lane)); return true; }
  function toggleSquad(profile, id) {
    const i = profile.squad.indexOf(id);
    if (i >= 0) { if (profile.squad.length <= 1) return false; profile.squad.splice(i, 1); return true; }
    if (!isAvailable(profile, id) || profile.squad.length >= 5) return false;
    profile.squad.push(id); return true;
  }
  // Une escouade part avec 3 à 5 opérateurs disponibles (débloqués et sous contrat ; un blessé grave peut partir, à demi-capacité).
  // Disponible = débloqué et sous contrat. Un blessé grave reste déployable (à demi-capacité) : c'est au joueur de choisir.
  const isAvailable = (profile, id) => { const st = profile.operators[id]; return !!st && st.unlocked && (st.tours === undefined || st.tours > 0); };
  const isWounded = (profile, id) => !!(profile.operators[id] && profile.operators[id].wounded);
  const contractExpired = (profile, id) => { const st = profile.operators[id]; return !!st && st.unlocked && st.tours !== undefined && st.tours <= 0; };
  const renewPrice = (profile, id) => CONTRACT.renewPrice[OPERATORS.find(o => o.id === id).rarity];
  function renewContract(profile, id) {
    const st = profile.operators[id]; if (!st || !st.unlocked) return false;
    const price = renewPrice(profile, id); if (profile.credits < price) return false;
    profile.credits -= price; st.tours = (st.tours > 0 ? st.tours : 0) + CONTRACT.tours[OPERATORS.find(o => o.id === id).rarity]; return true;
  }
  const squadReady = (profile) => profile.squad.length >= 3 && profile.squad.length <= 5 && profile.squad.every(id => isAvailable(profile, id));
  // Soins : un blessé grave retrouve ses compétences contre des crédits.
  const TREATMENT_PRICE = 80;
  // Filet de sécurité : tant que moins de 3 opérateurs sont disponibles, les soins sont gratuits (on ne reste jamais bloqué).
  // soins gratuits tant que moins de 3 opérateurs disponibles sont en bonne santé (on ne bloque jamais le joueur)
  const treatmentPrice = (profile) => Object.keys(profile.operators).filter(id => isAvailable(profile, id) && !isWounded(profile, id)).length < 3 ? 0 : TREATMENT_PRICE;
  function treat(profile, id) {
    const st = profile.operators[id]; if (!st || !st.wounded) return false;
    const price = treatmentPrice(profile); if (profile.credits < price) return false;
    profile.credits -= price; st.wounded = false; st.woundRest = 0; return true;
  }
  function recruit(profile, id) {
    const base = OPERATORS.find(o => o.id === id); const st = profile.operators[id];
    if (!base || st.unlocked) return false;
    const price = PRICES.operator[base.rarity];
    if (profile.credits < price) return false;
    profile.credits -= price; st.unlocked = true; st.tours = CONTRACT.tours[base.rarity]; return true;
  }
  function buyWeapon(profile, weaponId) {
    if (!WEAPONS[weaponId] || profile.inventory.weapons[weaponId]) return false;
    const price = PRICES.weapon[weaponId]; if (price === undefined || profile.credits < price) return false;
    profile.credits -= price; profile.inventory.weapons[weaponId] = true; return true;
  }
  function applyFormation(profile, formation) {
    // Formations prêtes à l'emploi : répartition des voies pour l'escouade actuelle (ordre : liste de l'escouade)
    const lanes = { ligne: [-1, 0, 1, -1, 1], nord: [-1, -1, -1, -1, -1], sud: [1, 1, 1, 1, 1], coin: [0, -1, 1, 0, 0], tenailles: [-1, -1, 1, 1, 0], auto: [null, null, null, null, null] }[formation];
    if (!lanes) return false;
    profile.squad.forEach((id, i) => { profile.operators[id].lane = lanes[i]; });
    return true;
  }

  // ---- Récompenses ---------------------------------------------------------------------
  // Calculées depuis le résultat réel de la bataille : participation, dégâts, neutralisations, victoire.
  function computeRewards(profile, mission, result) {
    const won = result.winner === 0, draw = result.winner === -1;
    const base = Math.round(mission.reward * (won ? 1 : draw ? 0.5 : 0.3));
    const kills = result.teams[0].kills || 0; const sp = result.teams[0].specials || {};
    const specials = (sp.headshots || 0) + (sp.streaks || 0) + (sp.revenge || 0) + (sp.veteran || 0) + (sp.group || 0);
    const credits = base + kills * 8 + specials * 6;
    const xp = {};
    for (const u of result.teams[0].units) {
      const id = u.id.split(':')[1];
      let v = mission.xp + Math.round(u.stats.damageDealt * 0.25) + u.stats.kills * 25 + (won ? 20 : 0);
      if (!u.alive) v = Math.round(v * 0.7);          // un opérateur évacué apprend moins
      xp[id] = v;
    }
    return { won, draw, credits, base, kills, specials, killCredits: kills * 8, specialCredits: specials * 6, xp };
  }
  // Conditions des défis : (mission, résultat) → vrai si le défi est accompli dans cette bataille
  const CHALLENGE_CHECKS = {
    sans_perte:   (m, r) => r.winner === 0 && r.teams[0].alive === r.teams[0].units.length,
    a_trois:      (m, r) => r.winner === 0 && r.teams[0].units.length === 3,
    methodique:   (m, r) => r.winner === 0 && m.id === 'embuscade' && r.teams[0].orderId === 'careful',
    pas_un_pouce: (m, r) => r.winner === 0 && m.id === 'tenir' && r.teams[0].units.length === 5 && r.teams[0].alive === 5,
    tireur:       (m, r) => r.teams[0].units.some(u => u.role === ROLES.marksman.name && u.stats.kills >= 3),
    silence:      (m, r) => r.winner === 0 && m.id === 'nuit' && r.teams[0].units.every(u => u.stats.timeSuppressed <= 3),
    elite:        (m, r) => r.winner === 0 && m.id === 'elite',
  };
  function checkChallenges(profile, mission, result) {
    const done = [];
    profile.challenges = profile.challenges || {};
    for (const c of CHALLENGES) {
      if (profile.challenges[c.id]) continue;
      const f = CHALLENGE_CHECKS[c.id]; if (!f || !f(mission, result)) continue;
      profile.challenges[c.id] = true; profile.credits += c.reward; done.push(c);
    }
    return done;
  }
  // Un match de ligue est traité comme une mission générique pour les récompenses individuelles (crédits, XP, blessures)
  const LEAGUE_MISSION = { id: 'ligue', name: 'Match de ligue', reward: 200, xp: 50, level: 0 };
  function applyRewards(profile, mission, result) {
    const r = computeRewards(profile, mission, result);
    profile.credits += r.credits;
    r.challenges = checkChallenges(profile, mission, result);
    const rankBefore = rankFor(profile.xp || 0);
    r.playerXp = mission.xp + (result.teams[0].kills || 0) * 5 + (r.won ? 30 : r.draw ? 10 : 0);
    profile.xp = (profile.xp || 0) + r.playerXp; r.rankUp = rankFor(profile.xp) > rankBefore ? RANKS[rankFor(profile.xp)].name : null;
    r.levelUps = []; r.promotions = []; r.expired = [];
    for (const u of result.teams[0].units) {
      const id = u.id.split(':')[1]; const st = profile.operators[id];
      const before = levelFor(st.xp); st.xp += r.xp[id]; st.battles++; st.kills += u.stats.kills;
      const after = levelFor(st.xp); if (after > before) r.levelUps.push({ id, callsign: u.callsign, level: after });
      for (const lv of PROMOTION_LEVELS) if (before < lv && after >= lv) { const o = offerPromotion(profile, id, lv); if (o) r.promotions.push({ id, callsign: u.callsign, level: lv }); }
      // contrat : une mission consommée ; historique par opérateur (20 dernières)
      if (st.tours !== undefined) { st.tours--; if (st.tours <= 0) r.expired.push(u.callsign); }
      st.history = st.history || []; st.history.push({ m: mission.name, won: r.won, draw: r.draw, kills: u.stats.kills, dmg: Math.round(u.stats.damageDealt), hits: u.stats.hits, shots: u.stats.shots, alive: u.alive, xp: r.xp[id] }); if (st.history.length > 20) st.history.shift();
    }
    profile.tacticsUsed = (profile.tacticsUsed || 0) + (result.teams[0].tactics || []).reduce((s, t) => s + (t.used || 0), 0);
    // blessures graves : les blessés laissés au repos guérissent après WOUND.restMissions missions ; les neutralisés de celle-ci
    // reviennent gravement blessés (compétences ÷2) jusqu'aux soins ou au repos
    const engaged = new Set(result.teams[0].units.map(u => u.id.split(':')[1]));
    r.healed = []; r.injured = [];
    for (const id in profile.operators) { const st = profile.operators[id]; if (!st.wounded || engaged.has(id)) continue; st.woundRest = (st.woundRest || 0) + 1; if (st.woundRest >= WOUND.restMissions) { st.wounded = false; st.woundRest = 0; r.healed.push(OPERATORS.find(o => o.id === id).callsign); } }
    for (const u of result.teams[0].units) if (!u.alive) { const id = u.id.split(':')[1]; profile.operators[id].wounded = true; profile.operators[id].woundRest = 0; r.injured.push(u.callsign); }
    r.recovering = r.injured;   // compatibilité de l'affichage
    profile.squad = profile.squad.filter(id => isAvailable(profile, id));
    profile.career.battles++; if (r.won) profile.career.wins++; else if (r.draw) profile.career.draws++; else profile.career.losses++;
    profile.career.kills += result.teams[0].units.reduce((s, u) => s + u.stats.kills, 0);
    profile.career.losses_units += result.teams[0].units.filter(u => !u.alive).length;
    if (mission.id !== 'ligue' && mission.id !== 'rapide') { profile.missions[mission.id] = profile.missions[mission.id] || { attempts: 0, wins: 0 }; profile.missions[mission.id].attempts++; if (r.won) profile.missions[mission.id].wins++; }
    applyModes(profile, mission, result, r);
    r.achievements = checkAchievements(profile, result);
    return r;
  }

  // ---- Promotions : second et troisième trait au choix ---------------------------------------
  function offerPromotion(profile, id, level, rng) {
    const st = profile.operators[id]; const base = OPERATORS.find(o => o.id === id);
    if (st.pendingPromotions.some(p => p.level === level) || (st.traits || []).length >= PROMOTION_LEVELS.indexOf(level) + 1) return null;
    const owned = new Set([base.trait, ...(st.traits || [])]);
    const pool = Object.keys(TRAITS).filter(t => !owned.has(t));
    rng = rng || Math.random;
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const offer = { level, choices: pool.slice(0, 2) }; st.pendingPromotions.push(offer); return offer;
  }
  function choosePromotion(profile, id, trait) {
    const st = profile.operators[id]; const i = st.pendingPromotions.findIndex(p => p.choices.includes(trait));
    if (i < 0) return false;
    st.traits = st.traits || []; st.traits.push(trait); st.pendingPromotions.splice(i, 1); return true;
  }
  // ---- Succès -----------------------------------------------------------------------------
  const ACHIEVEMENT_CHECKS = {
    premiere:   (p) => p.career.wins >= 1,
    dix:        (p) => p.career.wins >= 10,
    chasseur:   (p) => p.career.kills >= 50,
    collection: (p) => Object.values(p.operators).filter(o => o.unlocked).length >= 10,
    veteran:    (p) => Object.values(p.operators).some(o => levelFor(o.xp) >= 5),
    podium:     (p) => !!p.podium,
    tacticien:  (p) => (p.tacticsUsed || 0) >= 20,
    intact:     (p, r) => !!r && r.winner === 0 && r.teams[0].units.length === 5 && r.teams[0].units.every(u => u.alive && u.hp / u.maxHp > 0.9),
  };
  function checkAchievements(profile, result) {
    const got = []; profile.achievements = profile.achievements || {};
    for (const a of ACHIEVEMENTS) { if (profile.achievements[a.id]) continue; if (ACHIEVEMENT_CHECKS[a.id](profile, result)) { profile.achievements[a.id] = true; got.push(Object.assign({}, a, { rewardText: grantAchievementReward(profile, a.reward) })); } }
    return got;
  }
  // Récompense d'un succès (crédits ou cosmétique) ; renvoie un libellé. Un cosmétique déjà possédé est converti en crédits.
  function grantAchievementReward(profile, rw) {
    if (!rw) return '';
    if (rw.credits) { profile.credits += rw.credits; return `+${rw.credits} crédits`; }
    if (rw.headgear) { if (profile.headgear[rw.headgear]) { profile.credits += 80; return '+80 crédits (couvre-chef déjà possédé)'; } profile.headgear[rw.headgear] = true; return `Couvre-chef : ${rw.headgear.replace(/_/g, ' ')}`; }
    if (rw.insignia) { const L = profile.unlocked.insignias; if (L.includes(rw.insignia)) { profile.credits += 80; return '+80 crédits (insigne déjà possédé)'; } L.push(rw.insignia); return `Insigne : ${(INSIGNIAS.find(i => i.id === rw.insignia) || {}).name}`; }
    if (rw.uniform) { const L = profile.unlocked.uniforms; if (L.includes(rw.uniform)) { profile.credits += 80; return '+80 crédits (uniforme déjà possédé)'; } L.push(rw.uniform); return `Uniforme : ${(UNIFORMS.find(u => u.id === rw.uniform) || {}).name}`; }
    return '';
  }

  // ---- Sauvegarde locale (navigateur) ----------------------------------------------------
  function save(profile, storage) {
    try { storage.setItem(SAVE_KEY, JSON.stringify(profile)); return true; } catch (e) { return false; }
  }
  function load(storage) {
    try {
      const raw = storage.getItem(SAVE_KEY); if (!raw) return null;
      const p = JSON.parse(raw); if (!p || p.version !== 1 || !p.operators || !p.squad) return null;
      // tolérance : opérateurs ajoutés depuis la sauvegarde
      const fresh = newProfile();
      for (const id in fresh.operators) { if (!p.operators[id]) p.operators[id] = fresh.operators[id]; else for (const k of ['tours', 'traits', 'pendingPromotions', 'history', 'dupes', 'headgear']) if (p.operators[id][k] === undefined) p.operators[id][k] = fresh.operators[id][k]; }
      // ancienne convalescence (indisponible une mission) → blessure grave
      for (const id in p.operators) { const st = p.operators[id]; if (st.recovery > 0) { st.wounded = true; st.woundRest = 0; } delete st.recovery; }
      if (p.achievements === undefined) p.achievements = {}; if (p.tacticsUsed === undefined) p.tacticsUsed = 0;
      for (const k of ['teamName', 'insignia', 'uniform', 'unlocked', 'xp', 'tactics', 'perks', 'packsOpened', 'league', 'leagueSeasons', 'headgear', 'campaigns', 'quick', 'freePacks', 'ops']) if (p[k] === undefined) p[k] = fresh[k];
      p.inventory = p.inventory || fresh.inventory; p.inventory.weapons = Object.assign({}, fresh.inventory.weapons, p.inventory.weapons); p.inventory.armors = Object.assign({}, fresh.inventory.armors, p.inventory.armors);
      p.squad = p.squad.filter(id => p.operators[id] && p.operators[id].unlocked);
      return p;
    } catch (e) { return null; }
  }
  function reset(storage) { try { storage.removeItem(SAVE_KEY); } catch (e) { /* rien */ } return newProfile(); }

  root.Game = { newProfile, levelFor, isWounded, defRating, quickLevel, squadSynergies, campaignUnlocked, campaignMission, missionUnlocked, campaignProgress, quickBattle, applyModes, xpToNext, effectiveDef, enemyDef, buildTeams, battleOptions, objectiveLabel, buyWeapon, canEquipWeapon, setWeapon, setArmor, setLane, toggleSquad, squadReady, isAvailable, treat, TREATMENT_PRICE, recruit, treatmentPrice, contractExpired, renewPrice, renewContract, offerPromotion, choosePromotion, checkAchievements, ACHIEVEMENT_CHECKS, applyFormation, computeRewards, applyRewards, checkChallenges, CHALLENGE_CHECKS, LEAGUE_MISSION, rankFor, xpToNextRank, operatorRating, teamRating, equipTactic, openPack, setCustomization, buyHeadgear, setHeadgear, HEADGEAR_PRICES, STAT_FR, save, load, reset, STATS, SAVE_KEY };
})(typeof module !== 'undefined' ? module.exports : (window.OT = window.OT || {}),
   typeof module !== 'undefined' ? require('./data.js') : (window.OT = window.OT || {}));
