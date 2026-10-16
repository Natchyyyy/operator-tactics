// Boucle de jeu OPERATOR TACTICS : profil du joueur, collection, équipement, missions, récompenses, sauvegarde.
// Logique pure (testable en ligne de commande) ; l'interface (web/app.js) ne fait que l'afficher.
(function (root, deps) {
  const { DATA } = deps;
  const { WEAPONS, ARMORS, ROLES, OPERATORS, ORDERS, TACTICS, INSIGNIAS, UNIFORMS, RANKS, PACKS, MISSIONS, CHALLENGES, PRICES, XP_TABLE, LEVEL_STAT_BONUS, MAX_LEVEL } = DATA;
  const STATS = ['marksmanship', 'reflexes', 'mobility', 'perception', 'composure', 'endurance'];
  const SAVE_KEY = 'operator-tactics-save-v1';
  const STARTING = ['op_vautour', 'op_lynx', 'op_granit', 'op_bastion', 'op_belier'];

  // ---- Profil ---------------------------------------------------------------------------
  function newProfile() {
    const operators = {};
    for (const o of OPERATORS) if (!o.faction) operators[o.id] = { unlocked: STARTING.includes(o.id), xp: 0, weaponId: ROLES[o.role].weapon, armorId: o.armor, battles: 0, kills: 0, lane: null };
    return {
      version: 1, credits: 300, operators, squad: STARTING.slice(), order: 'assault',
      inventory: { weapons: { carbine: true, smg: true, dmr: true, lmg: true, shotgun: true }, armors: { light: true, medium: true, heavy: true } }, // battle, smgsil : à acheter
      career: { battles: 0, wins: 0, losses: 0, draws: 0, kills: 0, losses_units: 0 }, missions: {}, challenges: {}, lastSeed: null,
      // méta à la manière des jeux de cartes : nom et insigne d'équipe, uniforme, rang du joueur, tactiques, perks par opérateur
      teamName: 'Alpha', insignia: 'etoile', uniform: 'olive', unlocked: { insignias: ['etoile', 'bouclier'], uniforms: ['olive'] },
      xp: 0, tactics: { owned: { fumigene: true, drill: true }, equipped: ['fumigene', 'drill'] }, perks: {}, packsOpened: 0,
    };
  }
  const levelFor = (xp) => { let l = 0; while (l < MAX_LEVEL && xp >= XP_TABLE[l + 1]) l++; return l; };
  const xpToNext = (xp) => { const l = levelFor(xp); return l >= MAX_LEVEL ? null : XP_TABLE[l + 1] - xp; };

  // Fiche d'opérateur effective (statistiques bonifiées par le niveau, arme et protection équipées, voie).
  function effectiveDef(profile, id) {
    const base = OPERATORS.find(o => o.id === id); const st = profile.operators[id];
    const level = levelFor(st.xp);
    const def = Object.assign({}, base, { level, weaponId: st.weaponId, armor: st.armorId, lane: st.lane });
    const perks = (profile.perks && profile.perks[id]) || {};
    for (const k of STATS) def[k] = Math.min(100, base[k] + level * LEVEL_STAT_BONUS + (perks[k] || 0));
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
  function operatorRating(profile, id) {
    const d = effectiveDef(profile, id); const st = profile.operators[id];
    const stats = STATS.reduce((s, k) => s + d[k], 0) / STATS.length;
    const w = WEAPONS[st.weaponId], a = ARMORS[st.armorId];
    const wv = (w.damage * w.rpm / 60) * Math.min(1, w.range / 40) / 8 + w.accuracy * 10;
    const av = a.torso * 20;
    return stats * 0.4 + wv + av;
  }
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
    if (profile.credits < pack.price) return null;
    profile.credits -= pack.price; profile.packsOpened = (profile.packsOpened || 0) + 1;
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
      if (locked.length) { const o = pick(locked); profile.operators[o.id].unlocked = true; return { type: 'operator', id: o.id, title: o.callsign, text: `Nouvelle recrue : ${ROLES[o.role].name} (${o.unit})`, rarity: o.rarity }; }
      type = 'xp';
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
      const pool = [...ins.map(i => ({ kind: 'insignia', item: i })), ...unis.map(u => ({ kind: 'uniform', item: u }))];
      if (pool.length) { const c = pick(pool); (c.kind === 'insignia' ? profile.unlocked.insignias : profile.unlocked.uniforms).push(c.item.id); return { type: 'cosmetic', id: c.item.id, title: c.kind === 'insignia' ? `Insigne : ${c.item.name}` : `Uniforme : ${c.item.name}`, text: 'Personnalisation d\'équipe débloquée.', rarity: 2 }; }
      type = 'credits';
    }
    const v = 50 + Math.floor(rng() * 71); profile.credits += v;
    return { type: 'credits', title: `+${v} crédits`, text: 'Prime de mission.', rarity: 1 };
  }
  const STAT_FR = { marksmanship: 'Tir', reflexes: 'Réflexes', mobility: 'Mobilité', perception: 'Perception', composure: 'Sang-froid', endurance: 'Endurance' };
  function setCustomization(profile, field, value) {
    if (field === 'teamName') { const v = String(value || '').trim().slice(0, 18); if (!v) return false; profile.teamName = v; return true; }
    if (field === 'insignia') { if (!profile.unlocked.insignias.includes(value)) return false; profile.insignia = value; return true; }
    if (field === 'uniform') { if (!profile.unlocked.uniforms.includes(value)) return false; profile.uniform = value; return true; }
    return false;
  }
  // Options complètes de bataille pour une mission (carte, objectif, équipes)
  function battleOptions(profile, mission, seed) {
    const opts = { seed, teams: buildTeams(profile, mission), mapId: mission.mapId };
    if (mission.objective === 'hold') opts.objective = { type: 'hold', team: 0, duration: mission.duration || 90 };
    return opts;
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
  // Une escouade part avec 3 à 5 opérateurs disponibles (ni verrouillés, ni en convalescence).
  const isAvailable = (profile, id) => { const st = profile.operators[id]; return !!st && st.unlocked && !(st.recovery > 0); };
  const squadReady = (profile) => profile.squad.length >= 3 && profile.squad.length <= 5 && profile.squad.every(id => isAvailable(profile, id));
  // Soins : un opérateur en convalescence redevient disponible contre des crédits.
  const TREATMENT_PRICE = 80;
  function treat(profile, id) {
    const st = profile.operators[id]; if (!st || !(st.recovery > 0) || profile.credits < TREATMENT_PRICE) return false;
    profile.credits -= TREATMENT_PRICE; st.recovery = 0; return true;
  }
  function recruit(profile, id) {
    const base = OPERATORS.find(o => o.id === id); const st = profile.operators[id];
    if (!base || st.unlocked) return false;
    const price = PRICES.operator[base.rarity];
    if (profile.credits < price) return false;
    profile.credits -= price; st.unlocked = true; return true;
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
    const credits = Math.round(mission.reward * (won ? 1 : draw ? 0.5 : 0.3));
    const xp = {};
    for (const u of result.teams[0].units) {
      const id = u.id.split(':')[1];
      let v = mission.xp + Math.round(u.stats.damageDealt * 0.25) + u.stats.kills * 25 + (won ? 20 : 0);
      if (!u.alive) v = Math.round(v * 0.7);          // un opérateur évacué apprend moins
      xp[id] = v;
    }
    return { won, draw, credits, xp };
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
  function applyRewards(profile, mission, result) {
    const r = computeRewards(profile, mission, result);
    profile.credits += r.credits;
    r.challenges = checkChallenges(profile, mission, result);
    const rankBefore = rankFor(profile.xp || 0);
    r.playerXp = mission.xp + (result.teams[0].kills || 0) * 5 + (r.won ? 30 : r.draw ? 10 : 0);
    profile.xp = (profile.xp || 0) + r.playerXp; r.rankUp = rankFor(profile.xp) > rankBefore ? RANKS[rankFor(profile.xp)].name : null;
    r.levelUps = [];
    for (const u of result.teams[0].units) {
      const id = u.id.split(':')[1]; const st = profile.operators[id];
      const before = levelFor(st.xp); st.xp += r.xp[id]; st.battles++; st.kills += u.stats.kills;
      const after = levelFor(st.xp); if (after > before) r.levelUps.push({ id, callsign: u.callsign, level: after });
    }
    // convalescence : ceux qui étaient déjà indisponibles récupèrent d'une mission ; les neutralisés de celle-ci sont indisponibles pour la prochaine
    for (const id in profile.operators) if (profile.operators[id].recovery > 0) profile.operators[id].recovery--;
    r.recovering = [];
    for (const u of result.teams[0].units) if (!u.alive) { const id = u.id.split(':')[1]; profile.operators[id].recovery = 1; r.recovering.push(u.callsign); }
    profile.squad = profile.squad.filter(id => isAvailable(profile, id));
    profile.career.battles++; if (r.won) profile.career.wins++; else if (r.draw) profile.career.draws++; else profile.career.losses++;
    profile.career.kills += result.teams[0].units.reduce((s, u) => s + u.stats.kills, 0);
    profile.career.losses_units += result.teams[0].units.filter(u => !u.alive).length;
    profile.missions[mission.id] = profile.missions[mission.id] || { attempts: 0, wins: 0 };
    profile.missions[mission.id].attempts++; if (r.won) profile.missions[mission.id].wins++;
    return r;
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
      for (const id in fresh.operators) if (!p.operators[id]) p.operators[id] = fresh.operators[id];
      for (const k of ['teamName', 'insignia', 'uniform', 'unlocked', 'xp', 'tactics', 'perks', 'packsOpened']) if (p[k] === undefined) p[k] = fresh[k];
      p.inventory = p.inventory || fresh.inventory; p.inventory.weapons = Object.assign({}, fresh.inventory.weapons, p.inventory.weapons); p.inventory.armors = Object.assign({}, fresh.inventory.armors, p.inventory.armors);
      p.squad = p.squad.filter(id => p.operators[id] && p.operators[id].unlocked);
      return p;
    } catch (e) { return null; }
  }
  function reset(storage) { try { storage.removeItem(SAVE_KEY); } catch (e) { /* rien */ } return newProfile(); }

  root.Game = { newProfile, levelFor, xpToNext, effectiveDef, enemyDef, buildTeams, battleOptions, buyWeapon, canEquipWeapon, setWeapon, setArmor, setLane, toggleSquad, squadReady, isAvailable, treat, TREATMENT_PRICE, recruit, applyFormation, computeRewards, applyRewards, checkChallenges, CHALLENGE_CHECKS, rankFor, xpToNextRank, operatorRating, teamRating, equipTactic, openPack, setCustomization, STAT_FR, save, load, reset, STATS, SAVE_KEY };
})(typeof module !== 'undefined' ? module.exports : (window.OT = window.OT || {}),
   typeof module !== 'undefined' ? require('./data.js') : (window.OT = window.OT || {}));
