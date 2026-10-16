// Boucle de jeu OPERATOR TACTICS : profil du joueur, collection, équipement, missions, récompenses, sauvegarde.
// Logique pure (testable en ligne de commande) ; l'interface (web/app.js) ne fait que l'afficher.
(function (root, deps) {
  const { DATA } = deps;
  const { WEAPONS, ARMORS, ROLES, OPERATORS, ORDERS, MISSIONS, PRICES, XP_TABLE, LEVEL_STAT_BONUS, MAX_LEVEL } = DATA;
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
      career: { battles: 0, wins: 0, losses: 0, draws: 0, kills: 0, losses_units: 0 }, missions: {}, lastSeed: null,
    };
  }
  const levelFor = (xp) => { let l = 0; while (l < MAX_LEVEL && xp >= XP_TABLE[l + 1]) l++; return l; };
  const xpToNext = (xp) => { const l = levelFor(xp); return l >= MAX_LEVEL ? null : XP_TABLE[l + 1] - xp; };

  // Fiche d'opérateur effective (statistiques bonifiées par le niveau, arme et protection équipées, voie).
  function effectiveDef(profile, id) {
    const base = OPERATORS.find(o => o.id === id); const st = profile.operators[id];
    const level = levelFor(st.xp);
    const def = Object.assign({}, base, { level, weaponId: st.weaponId, armor: st.armorId, lane: st.lane });
    for (const k of STATS) def[k] = Math.min(100, base[k] + level * LEVEL_STAT_BONUS);
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
    return [
      { name: 'Alpha', order: profile.order, operators: profile.squad.map(id => effectiveDef(profile, id)) },
      { name: 'Bravo', order: mission.order, operators: mission.enemy.map(id => enemyDef(id, mission.level, mission.enemyWeapons && mission.enemyWeapons[id])) },
    ];
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
  function applyRewards(profile, mission, result) {
    const r = computeRewards(profile, mission, result);
    profile.credits += r.credits;
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
      p.inventory = p.inventory || fresh.inventory; p.inventory.weapons = Object.assign({}, fresh.inventory.weapons, p.inventory.weapons); p.inventory.armors = Object.assign({}, fresh.inventory.armors, p.inventory.armors);
      p.squad = p.squad.filter(id => p.operators[id] && p.operators[id].unlocked);
      return p;
    } catch (e) { return null; }
  }
  function reset(storage) { try { storage.removeItem(SAVE_KEY); } catch (e) { /* rien */ } return newProfile(); }

  root.Game = { newProfile, levelFor, xpToNext, effectiveDef, enemyDef, buildTeams, battleOptions, buyWeapon, canEquipWeapon, setWeapon, setArmor, setLane, toggleSquad, squadReady, isAvailable, treat, TREATMENT_PRICE, recruit, applyFormation, computeRewards, applyRewards, save, load, reset, STATS, SAVE_KEY };
})(typeof module !== 'undefined' ? module.exports : (window.OT = window.OT || {}),
   typeof module !== 'undefined' ? require('./data.js') : (window.OT = window.OT || {}));
