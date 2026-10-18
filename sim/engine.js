// Moteur de combat OPERATOR TACTICS — simulation déterministe (graine), pas de temps fixe (0,1 s).
// Chaque opérateur perçoit, décide et agit individuellement. Le résultat découle des événements simulés.
(function (root, deps) {
  const { RNG, DATA, GameMap, MAPS, segmentHitsBox } = deps;
  const { WEAPONS, ARMORS, ROLES, OPERATORS, ORDERS, TACTICS, SYNERGIES, WOUND, GRENADES, CONDITIONS, ATTACHMENTS } = DATA;
  const SYNERGY_BY_ID = Object.fromEntries(SYNERGIES.map(s => [s.id, s]));

  const DT = 0.1;                 // pas de simulation (s)
  const DECIDE_EVERY = 0.3;       // fréquence des décisions de l'IA (s)
  const COMMS_EVERY = 1.0;        // fréquence des échanges radio (s)
  const KNOWLEDGE_TTL = 25;       // une position connue est oubliée après 25 s
  const EYE = { stand: 1.6, crouch: 1.0 };
  const CHEST = { stand: 1.25, crouch: 0.75 };

  const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  // distance d'un point p au segment [a, b] (au sol), seulement s'il se trouve ENTRE a et b (sinon Infinity)
  const segDist = (p, a, b) => {
    const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz; if (L2 < 1e-6) return Infinity;
    const t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2; if (t <= 0.04 || t >= 0.96) return Infinity;
    return Math.hypot(a.x + dx * t - p.x, a.z + dz * t - p.z);
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };
  const fmtT = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`; };

  // Compétence de l'opérateur (voir data.js TRAITS) : has(u, 'eagle')
  // def.trait (principal) + def.traits (acquis par promotion)
  const has = (u, trait) => u.def.trait === trait || (Array.isArray(u.def.traits) && u.def.traits.includes(trait));

  // ---------------------------------------------------------------------------------------
  function Unit(battle, def, team, idx) {
    this.battle = battle; this.def = def; this.team = team; this.idx = idx;
    this.id = `${team}:${def.id}`; this.callsign = def.callsign;
    this.role = ROLES[def.role]; this.weapon = WEAPONS[def.weaponId || this.role.weapon]; this.armor = ARMORS[def.armor];
    // accessoires montés (ignorés si l'arme ne les accepte pas) : l'arme de CE soldat est une copie modifiée
    this.att = {};
    for (const id of Object.values(def.attachments || {})) { const a = ATTACHMENTS[id]; if (a && !a.not.includes(this.weapon.cls)) this.att[a.id] = true; }
    if (this.att.chargeur || this.att.silencieux) {
      const w = Object.assign({}, this.weapon);
      if (this.att.chargeur) { w.mag = Math.round(w.mag * 1.5); w.reload = Math.round(w.reload * 1.2 * 100) / 100; }
      if (this.att.silencieux) { w.silenced = true; w.damage = Math.round(w.damage * 0.92 * 10) / 10; w.suppress *= 0.6; }
      this.weapon = w;
    }
    this.maxHp = 80 + def.endurance / 5 + (def.trait === 'colossus' || (Array.isArray(def.traits) && def.traits.includes('colossus')) ? 10 : 0);
    if (def.wounded) this.maxHp = Math.round(this.maxHp * WOUND.hpFactor);     // blessure grave non soignée
    this.hp = this.maxHp;
    this.x = 0; this.z = 0; this.facing = 0; this.stance = 'stand';
    this.ammo = this.weapon.mag; this.mags = this.weapon.kit;
    this.reloading = 0;           // temps de rechargement restant (s)
    this.grenades = Object.assign({}, this.role.grenades || {});   // dotation par rôle
    if (has(this, 'grenadier')) this.grenades.frag = (this.grenades.frag || 0) + 1;   // Grenadier : une frag de plus
    this.throwing = null; this.lastGrenadeAt = -99; this.blindUntil = -99; this.evade = null;
    this.aimTimer = 0; this.fireAcc = 0; this.burst = 0;
    this.target = null; this.lastShotAt = -99; this.lastShotBy = null; this.lastShotByAt = -99; this.lastHitAt = -99;
    this.suppression = 0;
    this.knowledge = {};           // enemyId -> { x, z, t, seen, source }
    this.lastSeenLog = {};         // enemyId -> dernier repérage journalisé
    this.visible = new Set();      // ennemis vus par CET opérateur maintenant
    this.path = null; this.pathIdx = 0; this.goal = null; this.goalKind = null; this.moving = false;
    this.lastProgress = { x: 0, z: 0, t: 0 }; this.stuck = 0; this.repathAt = -99;
    this.state = 'idle'; this.status = 'ok'; this.alive = true;
    this.pauseUntil = 0;           // (ordre prudent) temps d'arrêt derrière un couvert
    this.coverPoint = null;
    this.aimTarget = null; this.aimHistory = {};   // visée en cours / dernière visée par ennemi (reprise plus rapide)
    this.commitUntil = 0; this.commitAt = 0;        // engagement sur un déplacement (évite d'hésiter à chaque décision)
    this.targetLostAt = 0;
    this.stats = { shots: 0, hits: 0, kills: 0, damageDealt: 0, damageTaken: 0, reloads: 0, headshots: 0, timeSuppressed: 0, distance: 0, streaks: 0, revenge: 0, veteran: 0, group: 0, healed: 0, revives: 0 };
    this.hitBy = {};                 // unitId → dernier instant où cet adversaire m'a touché (neutralisations de groupe)
    this.lastKillAt = -99;
    this.decideOffset = (idx * 0.07) % DECIDE_EVERY;
  }
  Unit.prototype.pos = function () { return { x: this.x, z: this.z }; };
  Unit.prototype.eyeY = function () { return EYE[this.stance]; };
  Unit.prototype.chestY = function () { return CHEST[this.stance]; };
  Unit.prototype.isActive = function () { return this.alive; };
  Unit.prototype.speed = function () {
    const armorMob = has(this, 'colossus') ? (1 + this.armor.mobility) / 2 : this.armor.mobility; // Colosse : pénalité des plaques divisée par deux
    let v = (1.5 + (this.def.mobility / 100) * 1.4) * armorMob;
    const team = this.battle.teams[this.team];
    if (has(this, 'runner')) v *= 1.15;                                                               // Sprinteur
    if (this.stance === 'crouch') v *= 0.55;
    if (this.state === 'closing' || this.state === 'retreat') v *= 1.2;        // sprint
    else if (this.state === 'bounding' || this.state === 'advancing') { if (Object.keys(this.knowledge).length) v *= 0.8; } // pas tactique au contact
    const hard = has(this, 'hardened') ? 0.5 : 1;                                                    // Endurci : pénalités de blessure réduites de moitié
    if (this.status === 'wounded') v *= 1 - 0.2 * hard; else if (this.status === 'critical') v *= 1 - 0.5 * hard;
    return v;
  };
  Unit.prototype.totalAmmo = function () { return this.ammo + this.mags * this.weapon.mag; };

  // ---------------------------------------------------------------------------------------
  function Battle(opts) {
    opts = opts || {};
    this.seed = opts.seed === undefined ? 1 : opts.seed;
    this.opts = opts;                 // pour revoir la bataille (même graine, mêmes équipes)
    this.inputs = [];                 // commandes du joueur (tactiques, ordres) avec leur pas : la bataille est rejouable à l'identique
    this.replayQueue = opts.replayInputs ? opts.replayInputs.slice() : null;
    this.rng = new RNG(this.seed);
    this.map = new GameMap(MAPS[opts.mapId] || MAPS.parking);   // une seule carte pour l'instant ; un ancien identifiant retombe sur le parking
    this.timeLimit = opts.timeLimit || 240;
    // objectif : { type: 'eliminate' } (défaut) ou { type: 'hold', team, duration } : l'équipe team gagne si elle tient jusqu'à duration
    this.objective = opts.objective || { type: 'eliminate' };
    this.cond = CONDITIONS[opts.conditions] || CONDITIONS.jour;     // heure / météo (vue, ouïe, précision)
    if (this.objective.type === 'hold') this.timeLimit = this.objective.duration;
    // { type: 'capture', x?, z?, r?, rate? } : une zone au centre de la carte ; l'équipe qui l'occupe seule fait monter sa jauge,
    // 100 % = victoire (même sans avoir éliminé l'adversaire). Zone disputée (les deux équipes dedans) : aucune progression.
    if (this.objective.type === 'capture') {
      const o = this.objective, mc = this.map.capture || { x: this.map.width / 2, z: this.map.depth / 2, r: 7 };
      this.zone = { x: o.x !== undefined ? o.x : mc.x, z: o.z !== undefined ? o.z : mc.z, r: o.r || mc.r, holder: null, contested: false };
      if (!opts.timeLimit) this.timeLimit = 300;
    }
    this.t = 0; this.tick = 0; this.over = false; this.result = null;
    this.log = []; this.events = [];
    this.lastShotTime = 0;
    this.teams = [];
    const teamDefs = opts.teams || Battle.defaultTeams();
    teamDefs.forEach((td, ti) => {
      const order = ORDERS[td.order || 'assault'] ? (td.order || 'assault') : 'assault';
      const units = td.operators.map((opOrId, i) => {
        const base = typeof opOrId === 'string' ? OPERATORS.find(o => o.id === opOrId) : opOrId;
        if (!base) throw new Error('Opérateur inconnu : ' + opOrId);
        const def = Object.assign({}, base, (td.overrides && td.overrides[i]) || {});
        return new Unit(this, def, ti, i);
      });
      const tactics = {};
      for (const id of (td.tactics || [])) if (TACTICS[id]) tactics[id] = { uses: TACTICS[id].active ? TACTICS[id].uses : 0, cooldownUntil: 0, used: 0 };
      this.teams.push({ index: ti, name: td.name || (ti === 0 ? 'Alpha' : 'Bravo'), order, units, camo: (() => { const u = DATA.UNIFORMS.find(x => x.id === td.uniform); const c = u && u.camo; return c && ((c.maps || []).includes(this.map.id) || (c.conditions || []).includes(opts.conditions || 'jour')) ? 0.9 : 1; })(), spawn: this.map.spawns[ti], lastSeen: {}, tactics, tacticIds: (td.tactics || []).filter(id => TACTICS[id]), auto: !!td.autoTactics, capture: 0 });
    });
    this.units = this.teams.flatMap(t => t.units);
    // Tiroir : deux moitiés d'escouade en alternance (le tireur d'élite reste en appui, hors des bonds)
    for (const team of this.teams) { let k = 0; for (const u of team.units) u.boundGroup = u.role.id === 'marksman' ? -1 : (k++ % 2); team.bound = { group: 0, since: 0, n: 0 }; }
    this.assignLanes();
    this.placeUnits();
    this.logEvent('start', `Début de l'engagement — ${this.map.name} — graine ${this.seed}. ${this.teams.map(t => `${t.name} (${ORDERS[t.order].name})`).join(' contre ')}.`);
  }
  Battle.defaultTeams = function () {
    return [
      { name: 'Alpha', order: 'assault', operators: OPERATORS.filter(o => !o.faction).slice(0, 5).map(o => o.id), tactics: ['tiroir'] },
      { name: 'Bravo', order: 'assault', operators: OPERATORS.filter(o => o.faction === 'karst').slice(0, 5).map(o => o.id), tactics: ['tiroir'] },
    ];
  };

  Battle.prototype.placeUnits = function () {
    this.teams.forEach((team, ti) => {
      const sp = team.spawn, enemy = this.map.spawns[1 - ti];
      const face = Math.atan2(enemy.z - sp.z, enemy.x - sp.x);
      team.units.forEach((u, i) => {
        // dispersés autour du centre de la zone de départ, du côté de leur voie (nord / centre / sud)
        const a = ((i - 2) / 2) * 1.1, r = sp.r * (i % 2 ? 0.9 : 0.5);
        const laneZ = this.laneOf(u);
        let x = sp.x + Math.cos(a + face + Math.PI) * r * 0.6, z = sp.z + laneZ * 0.25 + ((i % 3) - 1) * 0.9;
        // case libre la plus proche qui ne soit pas déjà prise par un équipier (à moins de 1,5 m) : deux opérateurs ne
        // commencent jamais au même endroit (deux points voulus voisins tombaient sur la même case)
        const taken = (px, pz) => team.units.slice(0, i).some(a => Math.hypot(a.x - px, a.z - pz) < 1.5);
        const c0 = this.map.cellOf(x, z); let best = null, bd = Infinity;
        for (let ring = 0; ring < 8 && !best; ring++) for (let dc = -ring; dc <= ring; dc++) for (let dr = -ring; dr <= ring; dr++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring || this.map.isBlocked(c0.c + dc, c0.r + dr)) continue;
          const p = this.map.centerOf(c0.c + dc, c0.r + dr), d = Math.hypot(p.x - x, p.z - z);
          if (!taken(p.x, p.z) && d < bd - 1e-9) { bd = d; best = p; }
        }
        if (best) { x = best.x; z = best.z; }
        u.x = x; u.z = z; u.facing = face; u.home = { x, z };
        u.lastProgress = { x, z, t: 0 };
      });
    });
  };

  // Voie d'approche d'un opérateur : décalage latéral (m) par rapport à l'axe des zones de départ.
  // def.lane : -1 (nord), 0 (centre), 1 (sud) choisi par le joueur ; sinon répartition automatique.
  // Carte qui décrit ses voies (def.voies = { nord, milieu, sud } : z de chaque voie) : la voie de l'opérateur (u.voie, voir
  // assignLanes) donne directement le z de sa voie ; au milieu, les opérateurs s'étagent de part et d'autre de l'axe (u.laneDz).
  Battle.prototype.laneOf = function (u) {
    const v = this.map.def.voies, l = u.voie;
    if (v && l !== undefined && l !== null) return (l < 0 ? v.nord : l > 0 ? v.sud : v.milieu) + (u.laneDz || 0) - this.teams[u.team].spawn.z;
    return u.def.lane !== undefined && u.def.lane !== null ? u.def.lane * 11 : (u.idx - 2) * 5.5;
  };
  // Répartition sur les voies (une fois, au début) : voie choisie par le joueur (def.lane) sinon automatique. Sur une carte à
  // voies, le plan de voies de l'escouade (tactique « plan » équipée : Tenailles, Rush milieu… ; sinon tirage à la graine :
  // 1 ou 2 opérateurs sur chaque flanc) est complété par les opérateurs sans voie imposée, tirés à la graine ; les autres
  // tiennent l'axe central (au moins un si possible). À 3, un seul flanqueur ; en dessous, tout le monde au milieu.
  Battle.prototype.assignLanes = function () {
    const v = this.map.def.voies;
    for (const team of this.teams) {
      for (const u of team.units) u.voie = u.def.lane !== undefined && u.def.lane !== null ? Math.sign(u.def.lane) : null;
      if (!v) continue;
      const auto = team.units.filter(u => u.voie === null && u.role.id !== 'marksman');
      for (let i = auto.length - 1; i > 0; i--) { const j = Math.floor(this.rng.next() * (i + 1)); [auto[i], auto[j]] = [auto[j], auto[i]]; }
      const n = team.units.filter(u => u.role.id !== 'marksman').length, planId = (team.tacticIds || []).find(id => TACTICS[id].plan);
      const plans = [[1, 1], [2, 1], [1, 2], [2, 2]];
      const plan = planId ? TACTICS[planId].plan : n >= 4 ? plans[Math.floor(this.rng.next() * plans.length)] : n === 3 ? (this.rng.next() < 0.5 ? [1, 0] : [0, 1]) : [0, 0];
      team.plan = planId || 'auto';
      const fixed = (l) => team.units.filter(u => u.voie === l).length;
      this.spreadLanes(team, auto, plan[0] - fixed(-1), plan[1] - fixed(1), fixed(0) > 0);
    }
  };
  // Répartit units (dans cet ordre) : nN au nord, nS au sud, le reste au milieu (au moins un au milieu sauf midFixed) ;
  // les opérateurs du milieu s'étagent de part et d'autre de l'axe.
  Battle.prototype.spreadLanes = function (team, units, nN, nS, midFixed) {
    nN = Math.max(0, nN); nS = Math.max(0, nS);
    const cap = Math.max(0, units.length - (midFixed ? 0 : 1));
    while (nN + nS > cap) { if (nN >= nS) nN--; else nS--; }
    units.forEach((u, i) => { u.voie = i < nN ? -1 : i < nN + nS ? 1 : 0; });
    const mid = team.units.filter(u => u.voie === 0 || u.voie === null).sort((a, b) => a.idx - b.idx);
    mid.forEach((u, k) => { u.voie = 0; u.laneDz = (k - (mid.length - 1) / 2) * 3; });
  };
  // Changement de voie en cours de bataille (rotation, nouveau plan) : l'opérateur oublie son flanc en cours et rejoint
  // d'abord sa nouvelle voie, presque latéralement, avant de reprendre sa progression.
  Battle.prototype.resetRoute = function (u) {
    u.flankDone = false; u.rejoin = true; u.zoneSpot = null; u.post = null; u.searchGoal = null; u.searchSince = undefined; u.commitUntil = 0;
    if (u.goalKind === 'advance' || u.goalKind === 'bound' || u.goalKind === 'cover') this.stop(u);
  };
  // Rotation (commande en cours de bataille) : toute l'escouade encore debout (sauf le tireur d'élite, à son poste) passe sur
  // une autre voie (-1 nord, 0 milieu, 1 sud). Une rotation toutes les 10 s au plus ; pas en ordre « Tenir ».
  const ROTATION_COOLDOWN = 10;
  Battle.prototype.canRotate = function (teamIndex, lane) {
    const team = this.teams[teamIndex];
    if (!this.map.def.voies) return { ok: false, reason: 'pas de voies sur cette carte' };
    if (this.over) return { ok: false, reason: 'bataille terminée' };
    if (![-1, 0, 1].includes(lane)) return { ok: false, reason: 'voie inconnue' };
    if (team.order === 'hold') return { ok: false, reason: 'ordre « Tenir » : on ne bouge pas' };
    if (this.t < (team.rotateUntil || 0)) return { ok: false, reason: `recharge (${Math.ceil(team.rotateUntil - this.t)} s)` };
    if (!team.units.some(u => u.alive && u.role.id !== 'marksman')) return { ok: false, reason: 'aucun opérateur' };
    return { ok: true };
  };
  Battle.prototype.rotate = function (teamIndex, lane) {
    const can = this.canRotate(teamIndex, lane); if (!can.ok) return can;
    const team = this.teams[teamIndex], movers = team.units.filter(u => u.alive && u.role.id !== 'marksman');
    movers.forEach((u, k) => { u.voie = lane; u.laneDz = (k - (movers.length - 1) / 2) * (lane ? 1.8 : 3); this.resetRoute(u); });
    team.rotateUntil = this.t + ROTATION_COOLDOWN; team.rotation = lane; team.rotations = (team.rotations || 0) + 1;
    if (team.bound) { team.bound.n++; team.bound.since = this.t; }   // Tiroir : un nouveau bond commence tout de suite (la moitié qui avance part)
    this.logEvent('rotation', `${team.name} : rotation, toute l'escouade passe ${lane < 0 ? 'par le flanc nord' : lane > 0 ? 'par le flanc sud' : 'par le milieu'}.`, { team: teamIndex, lane });
    return { ok: true };
  };
  // Plan de voies relancé en bataille (tactique « plan ») : les survivants sont redistribués selon le plan.
  Battle.prototype.replan = function (teamIndex, id) {
    const team = this.teams[teamIndex], plan = TACTICS[id].plan;
    const units = team.units.filter(u => u.alive && u.role.id !== 'marksman');
    for (let i = units.length - 1; i > 0; i--) { const j = Math.floor(this.rng.next() * (i + 1)); [units[i], units[j]] = [units[j], units[i]]; }
    for (const u of team.units) if (u.alive && u.role.id !== 'marksman') u.voie = null;
    this.spreadLanes(team, units, plan[0], plan[1], false);
    for (const u of units) { if (u.voie) u.laneDz = 0; this.resetRoute(u); }
    team.plan = id; team.rotation = undefined;
    if (team.bound) { team.bound.n++; team.bound.since = this.t; }
  };
  // Voie de flanc : tant qu'un flanqueur n'est pas arrivé à hauteur de sa destination (la zone, une menace connue), il
  // progresse le long de sa voie ; ensuite il se rabat sur la destination, par le côté (une fois pour toutes).
  // Renvoie le prochain point de la voie, ou null (pas de flanc, ou flanc terminé).
  Battle.prototype.flankWaypoint = function (u, dest, reach) {
    if (!this.map.def.voies || this.teams[u.team].order === 'hold') return null;   // « Tenir » : pas de flanc
    const home = this.teams[u.team].spawn, dirx = Math.sign(this.map.spawns[1 - u.team].x - home.x) || 1;
    const lz = clamp(home.z + this.laneOf(u), 2, this.map.depth - 2);
    if (u.rejoin) { if (Math.abs(u.z - lz) > 3) return { x: u.x + dirx * 2, z: lz }; u.rejoin = false; }   // rotation : rejoindre sa voie
    if (!u.voie || u.flankDone) return null;
    const ahead = (dest.x - u.x) * dirx;
    if (this.teams[u.team].units.filter(a => a.alive).length <= 2) { u.flankDone = true; return null; }   // à deux, on ne se sépare plus
    if (ahead <= reach) {
      u.flankDone = true;
      this.logEvent('flank', `${u.callsign} arrive par le flanc ${u.voie < 0 ? 'nord' : 'sud'} et se rabat.`, { unit: u.id, team: u.team, silent: true });
      return null;
    }
    // loin de sa voie : on la rejoint d'abord (presque latéralement), puis on la suit
    return { x: u.x + dirx * Math.min(ahead - reach + 1, Math.abs(u.z - lz) > 4 ? 4 : 10), z: lz };
  };
  // Avancer d'un pas le long de la voie de flanc (fw) : en tiroir par bonds alternés, en ordre prudent de couvert en couvert.
  Battle.prototype.flankMove = function (u, threatPos, fw) {
    if (this.tiroir(u, threatPos, fw)) return true;
    if (this.teams[u.team].order === 'careful') {
      if (this.t < u.pauseUntil) { this.stop(u); u.state = 'pause'; u.stance = 'stand'; return true; }
      const cp = this.findCover(u, threatPos, 12, { towards: fw });
      if (cp && Math.hypot(cp.x - fw.x, cp.z - fw.z) < Math.hypot(u.x - fw.x, u.z - fw.z) - 2 && this.setGoal(u, cp.x, cp.z, 'bound')) { u.state = 'bounding'; u.stance = 'stand'; return true; }
    }
    if (this.setGoal(u, fw.x, fw.z, 'advance')) { u.state = 'advancing'; u.stance = 'stand'; return true; }
    return false;
  };
  Battle.prototype.logEvent = function (kind, text, data) {
    const e = Object.assign({ t: Math.round(this.t * 10) / 10, time: fmtT(this.t), kind, text }, data || {});
    this.log.push(e); return e;
  };
  Battle.prototype.emit = function (ev) { ev.t = this.t; this.events.push(ev); };
  Battle.prototype.drainEvents = function () { const e = this.events; this.events = []; return e; };
  Battle.prototype.enemiesOf = function (u) { return this.teams[1 - u.team].units; };
  Battle.prototype.alliesOf = function (u) { return this.teams[u.team].units.filter(a => a !== u); };

  // ---- Boucle principale -----------------------------------------------------------------
  // Commande du joueur : appliquée et enregistrée (pas, type, équipe, paramètre) pour pouvoir revoir la bataille.
  Battle.prototype.command = function (type, team, arg) {
    if (this.replayQueue) return { ok: false, reason: 'bataille revue : commandes désactivées' };
    const r = type === 'tactic' ? this.useTactic(team, arg) : type === 'order' ? { ok: this.setOrder(team, arg) } : type === 'rotate' ? this.rotate(team, arg) : type === 'tenir' ? this.holdKeyPosition(team, arg && arg.pos, arg && arg.units) : { ok: false };
    if (r && r.ok) this.inputs.push({ tick: this.tick, type, team, arg });
    return r;
  };
  Battle.prototype.step = function () {
    if (this.over) return;
    if (this.replayQueue) while (this.replayQueue.length && this.replayQueue[0].tick === this.tick) {   // revoir : mêmes commandes au même pas
      const c = this.replayQueue.shift(); if (c.type === 'tactic') this.useTactic(c.team, c.arg); else if (c.type === 'order') this.setOrder(c.team, c.arg); else if (c.type === 'rotate') this.rotate(c.team, c.arg); else if (c.type === 'tenir') this.holdKeyPosition(c.team, c.arg && c.arg.pos, c.arg && c.arg.units); this.inputs.push(c);
    }
    this.t = Math.round((this.t + DT) * 1000) / 1000; this.tick++;
    this.updateTactics();
    this.updateTiroir();
    for (const u of this.units) if (u.alive) this.perceive(u);
    if (Math.abs((this.t % COMMS_EVERY)) < DT / 2 || (this.t % COMMS_EVERY) > COMMS_EVERY - DT / 2) this.comms();
    // ordre de traitement mélangé à chaque pas : aucune équipe n'a l'avantage d'agir toujours la première
    const order = this.units.slice();
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(this.rng.next() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    for (const u of order) {
      if (!u.alive) continue;
      const phase = (this.t + u.decideOffset) % DECIDE_EVERY;
      if (phase < DT - 1e-6) this.decide(u);
      this.act(u);
    }
    this.updateGrenades();
    this.updateRevives();
    this.updateCapture();
    this.checkEnd();
  };
  Battle.prototype.run = function (maxSeconds) {
    const limit = maxSeconds || this.timeLimit + 1;
    while (!this.over && this.t < limit) this.step();
    return this.result;
  };

  // ---- Grenades --------------------------------------------------------------------------------
  // Lancer : un ennemi repéré il y a moins de 2 s, entre 8 et 24 m, qu'on ne peut pas toucher correctement (à couvert ou hors de vue),
  // trajectoire possible (pas de mur haut entre les deux), aucun allié à moins de 5 m du point visé. Pas plus d'une toutes les 8 s.
  Battle.prototype.tryGrenade = function (u) {
    if (u.reloading > 0 || u.suppression > 0.7 || this.t < u.blindUntil || this.t - u.lastGrenadeAt < 8) return false;
    const kind = u.grenades.frag > 0 ? 'frag' : u.grenades.flash > 0 ? 'flash' : null; if (!kind) return false;
    if (this.tick % 3 !== 0) return false;                                       // évalué une décision sur trois (coût)
    let best = null, bs = 0;
    const known = this.knownEnemies(u);
    for (const { unit: e, k } of known) {
      if (this.t - k.t > 2) continue;
      const d = Math.hypot(k.x - u.x, k.z - u.z); if (d < 8 || d > (has(u, 'grenadier') ? 30 : 24)) continue;   // Grenadier : plus loin
      if (u.visible.has(e.id) && this.hitChance(u, e, d, true).p >= 0.22) continue;     // on peut le toucher : on tire
      if (this.alliesOf(u).some(a => a.alive && Math.hypot(a.x - k.x, a.z - k.z) < 5)) continue;
      if (!this.map.hasLOS(u.x, 2.3, u.z, k.x, 1.4, k.z)) continue;                // un mur haut empêche la trajectoire
      let sc = 1;
      // groupe : chaque autre ennemi à moins de 4 m compte ; on vise le milieu du groupe (des soldats collés prennent tous les éclats)
      let gx = k.x, gz = k.z, gn = 1;
      for (const { unit: o, k: ko } of known) if (o !== e && this.t - ko.t < 3 && Math.hypot(ko.x - k.x, ko.z - k.z) < 4) { sc += 1; gx += ko.x; gz += ko.z; gn++; }
      if (this.zone && this.inZone(k)) sc += 0.5;                                      // déloger l'adversaire de la zone
      if (gn > 1) { gx /= gn; gz /= gn; if (Math.hypot(gx - u.x, gz - u.z) < 8 || this.alliesOf(u).some(a => a.alive && Math.hypot(a.x - gx, a.z - gz) < 5)) { gx = k.x; gz = k.z; } }
      if (sc > bs) { bs = sc; best = { x: gx, z: gz, d: Math.hypot(gx - u.x, gz - u.z), e }; }
    }
    if (!best || (bs < 2 && !this.rng.chance(0.35))) return false;                     // un seul ennemi : pas systématique
    this.stop(u); u.state = 'throw'; u.stance = 'stand'; u.facing = Math.atan2(best.z - u.z, best.x - u.x);
    u.throwing = { at: this.t + 0.6 + (1 - u.def.reflexes / 100) * 0.4, x: best.x, z: best.z, d: best.d, kind, target: best.e.callsign };
    return true;
  };
  Battle.prototype.releaseGrenade = function (u) {
    const th = u.throwing; u.throwing = null; u.state = 'engage';
    if (!u.alive) return;
    u.grenades[th.kind]--; u.lastGrenadeAt = this.t;
    const err = 0.4 + th.d * 0.05;
    let x = th.x + this.rng.gauss() * err, z = th.z + this.rng.gauss() * err;
    if (this.map.insideObstacle(x, z) || !this.map.inBounds(x, z)) { const f = this.map.nearestFree(x, z); if (f) { const c = this.map.centerOf(f.c, f.r); x = c.x; z = c.z; } }
    const G = GRENADES[th.kind], flight = 0.45 + th.d / 22;
    this.grenadesInFlight = this.grenadesInFlight || [];
    const g = { kind: th.kind, team: u.team, thrower: u, from: { x: u.x, z: u.z }, x, z, landAt: this.t + flight, explodeAt: this.t + flight + G.fuse, landed: false };
    this.grenadesInFlight.push(g);
    this.logEvent('grenade', `${u.callsign} lance une ${G.name} vers ${th.target}.`, { unit: u.id, team: u.team });
    this.emit({ type: 'grenade_throw', kind: th.kind, from: { x: u.x, y: 1.7, z: u.z }, to: { x, y: 0.1, z }, flight, explodeAt: g.explodeAt });
  };
  Battle.prototype.startEvade = function (u) {
    const ev = u.evade; ev.started = true;
    if (!u.alive) return;
    const R = GRENADES[ev.kind].radius, dx = u.x - ev.x, dz = u.z - ev.z, L = Math.hypot(dx, dz) || 1;
    // fuir à l'opposé, ou de biais : la direction qui éloigne le plus (aucune préférence gauche/droite : symétrie entre les camps)
    let best = null, bd = R * 0.8;
    for (const a of [0, 0.6, -0.6, 1.2, -1.2]) {
      const ang = Math.atan2(dz / L, dx / L) + a, px = ev.x + Math.cos(ang) * (R + 2), pz = ev.z + Math.sin(ang) * (R + 2);
      const f = this.map.nearestFree(px, pz); if (!f) continue; const c = this.map.centerOf(f.c, f.r);
      const d = Math.hypot(c.x - ev.x, c.z - ev.z) - Math.abs(a) * 0.5;
      if (d > bd) { bd = d; best = c; }
    }
    if (best && this.setGoal(u, best.x, best.z, 'close')) { u.state = 'evade'; u.stance = 'stand'; u.commitUntil = ev.until; u.commitAt = this.t; }
  };
  Battle.prototype.updateGrenades = function () {
    const L = this.grenadesInFlight; if (!L || !L.length) return;
    for (let i = L.length - 1; i >= 0; i--) {
      const g = L[i];
      if (!g.landed && this.t >= g.landAt) {
        g.landed = true;
        // qui la voit tomber (ou l'entend tout près) tente de s'en écarter — les deux camps : une grenade ne choisit pas
        if (g.kind === 'frag') for (const u of this.units) {
          if (!u.alive) continue; const d = Math.hypot(u.x - g.x, u.z - g.z); if (d > GRENADES.frag.radius) continue;
          const notices = d < 2.5 || (this.t >= u.blindUntil && this.map.hasLOS(u.x, u.eyeY(), u.z, g.x, 0.2, g.z));
          if (notices && this.rng.chance(0.85)) {
            u.evade = { x: g.x, z: g.z, kind: g.kind, at: this.t + 0.15 + (1 - u.def.reflexes / 100) * 0.5, until: g.explodeAt + 0.3, started: false };
            if (u.team !== g.team) this.logEvent('grenade', `${u.callsign} : « Grenade ! »`, { unit: u.id, team: u.team, silent: d > 4 });
          }
        }
      }
      if (this.t < g.explodeAt) continue;
      L.splice(i, 1);
      const G = GRENADES[g.kind];
      this.emit({ type: 'grenade_blast', kind: g.kind, x: g.x, z: g.z });
      if (g.kind === 'frag') this.blastDecor(g.x, g.z, 1.6, 0.7);   // une grenade peut faire voler une caisse en éclats
      let hits = 0;
      for (const u of this.units) {
        if (!u.alive) continue;
        const d = Math.hypot(u.x - g.x, u.z - g.z);
        if (d < 9) u.suppression = clamp(u.suppression + G.suppress * (1 - d / 9), 0, 1);
        if (d > G.radius) continue;
        if (g.kind === 'frag') {
          if (!this.map.hasLOS(g.x, 0.4, g.z, u.x, u.chestY(), u.z)) continue;      // un mur protège de l'explosion
          const dmg = Math.round(G.damage * Math.pow(1 - d / G.radius, 1.5) * (1 - u.armor.torso * 0.6) * 10) / 10;
          if (dmg >= 1) { hits++; this.applyDamage(g.thrower, u, dmg, 'éclat de grenade', g.team); }
        } else {
          if (!this.map.hasLOS(g.x, 0.5, g.z, u.x, u.eyeY(), u.z)) continue;
          const facing = angDiff(Math.atan2(g.z - u.z, g.x - u.x), u.facing) < Math.PI * 0.6;
          const dur = G.blind * (1 - d / G.radius) * (facing ? 1 : 0.4) + 0.8;
          u.blindUntil = Math.max(u.blindUntil, this.t + dur); u.visible = new Set(); hits++;
          this.logEvent('flash', `${u.callsign} est aveuglé (${dur.toFixed(1)} s).`, { unit: u.id, team: u.team, silent: u.team === g.team });
        }
      }
      if (!hits) this.logEvent('grenade', `La ${G.name} de ${g.thrower.callsign} explose sans toucher personne.`, { team: g.team, silent: true });
    }
  };

  // ---- Capture de zone ---------------------------------------------------------------------
  Battle.prototype.inZone = function (p, margin) { return !!this.zone && Math.hypot(p.x - this.zone.x, p.z - this.zone.z) <= this.zone.r + (margin || 0); };
  Battle.prototype.updateCapture = function () {
    const z = this.zone; if (!z) return;
    const n = this.teams.map(t => t.units.filter(u => u.alive && this.inZone(u)).length);
    const prev = z.holder;
    z.contested = n[0] > 0 && n[1] > 0;
    z.holder = z.contested ? -1 : n[0] > 0 ? 0 : n[1] > 0 ? 1 : null;
    if (z.holder !== prev) {
      if (z.contested) this.logEvent('zone', `La zone est disputée : progression bloquée.`, {});
      else if (z.holder !== null) this.logEvent('zone', `${this.teams[z.holder].name} occupe la zone (${n[z.holder]} opérateur${n[z.holder] > 1 ? 's' : ''}).`, { team: z.holder });
    }
    // zone disputée : on s'entend à quelques mètres (pas, voix) → position approximative des adversaires présents dans la zone
    if (z.contested && this.tick % 10 === 0) {
      for (const u of this.units) if (u.alive && this.inZone(u, 2)) for (const e of this.enemiesOf(u)) if (e.alive && this.inZone(e, 2) && !u.visible.has(e.id)) {
        const k = u.knowledge[e.id]; if (k && this.t - k.t < 2) continue;
        u.knowledge[e.id] = { x: e.x + this.rng.gauss() * 1.5, z: e.z + this.rng.gauss() * 1.5, t: this.t, seen: false, source: 'ouïe' };
      }
    }
    if (z.holder === 0 || z.holder === 1) {
      const t = this.teams[z.holder];
      const rate = (this.objective.rate || 1.6) + 0.4 * (n[z.holder] - 1);   // % par seconde : 1 opérateur ≈ 62 s, 5 ≈ 31 s
      const before = t.capture; t.capture = Math.min(100, t.capture + rate * DT);
      for (const m of [25, 50, 75]) if (before < m && t.capture >= m) this.logEvent('zone', `${t.name} : zone capturée à ${m} %.`, { team: z.holder });
    }
  };
  // Point d'approche de la zone : le centre décalé de 1,5 m vers le camp de l'opérateur (le centre exact peut tomber dans
  // un obstacle, et la case libre la plus proche d'un point de l'axe de symétrie avantagerait un camp)
  Battle.prototype.zoneApproach = function (u) {
    const z = this.zone, side = Math.sign(this.teams[u.team].spawn.x - z.x) || (u.team === 0 ? -1 : 1);
    return { x: z.x + side * 1.5, z: z.z };
  };
  // Poste de flanc autour de la zone : un couvert de son côté (nord ou sud), hors de la zone mais à moins de 9 m de son bord,
  // qui voit le plus de points de la zone (et, si possible, couvert face à la menace).
  Battle.prototype.flankPost = function (u, facePos) {
    const z = this.zone, ring = [];
    for (let k = 0; k < 8; k++) ring.push({ x: z.x + Math.cos(k * Math.PI / 4) * z.r * 0.6, z: z.z + Math.sin(k * Math.PI / 4) * z.r * 0.6 });
    let best = null, bs = -Infinity;
    for (const cp of this.map.coverPoints) {
      const dz = (cp.z - z.z) * u.voie; if (dz < z.r + 2.5 || dz > z.r + 9 || Math.abs(cp.x - z.x) > 10) continue;
      if (this.alliesOf(u).some(a => a.alive && ((a.zoneSpot && Math.hypot(a.zoneSpot.x - cp.x, a.zoneSpot.z - cp.z) < 2.5) || (a.post && Math.hypot(a.post.x - cp.x, a.post.z - cp.z) < 2.5)))) continue;
      let vis = 0; for (const p of ring) if (this.map.hasLOS(cp.x, EYE.stand, cp.z, p.x, CHEST.stand, p.z)) vis++;
      if (vis < 2) continue;
      const h = this.hug(cp), sc = vis + (this.coverAt(h.hx, h.hz, facePos.x, facePos.z, true) ? 2 : 0) - Math.hypot(cp.x - u.x, cp.z - u.z) * 0.08 + this.rng.next() * 0.5;
      if (sc > bs) { bs = sc; best = { x: h.hx, z: h.hz }; }
    }
    return best ? { x: best.x, z: best.z, flanc: true } : null;
  };
  // en poste de flanc, avec au moins un équipier dans la zone ?
  Battle.prototype.onFlankPost = function (u) { return !!(u.zoneSpot && u.zoneSpot.flanc && this.alliesOf(u).some(a => a.alive && this.inZone(a, 0.5))); };
  // Prendre position dans la zone : un couvert à l'intérieur (face à la menace) ou, à défaut, un point libre réparti autour du centre.
  Battle.prototype.occupyZone = function (u, facePos) {
    const z = this.zone;
    // flanqueur arrivé par le côté : tant qu'un équipier est dans la zone, il la couvre depuis son flanc (feu croisé sur ceux
    // qui veulent y entrer) ; plus personne de son camp dedans → il y entre à son tour
    if (u.voie && u.flankDone && this.map.def.voies) {
      const mates = this.alliesOf(u).some(a => a.alive && this.inZone(a, 0.5));
      if (u.zoneSpot && u.zoneSpot.flanc && !mates) u.zoneSpot = null;
      if (!u.zoneSpot && mates) u.zoneSpot = this.flankPost(u, facePos);
    }
    if (!u.zoneSpot) {
      let best = null, bs = -Infinity;
      for (const cp of this.map.coverPoints) {
        if (Math.hypot(cp.x - z.x, cp.z - z.z) > z.r - 0.6) continue;
        if (this.alliesOf(u).some(a => a.alive && a.zoneSpot && Math.hypot(a.zoneSpot.x - cp.x, a.zoneSpot.z - cp.z) < 2)) continue;
        const h = this.hug(cp), sc = (this.coverAt(h.hx, h.hz, facePos.x, facePos.z, true) ? 3 : 0) - Math.hypot(cp.x - u.x, cp.z - u.z) * 0.05 + this.rng.next() * 0.5;
        if (sc > bs) { bs = sc; best = { x: h.hx, z: h.hz }; }
      }
      if (!best) {
        const side = Math.sign(this.teams[u.team].spawn.x - z.x) || 1;
        for (let k = 0; k < 12 && !best; k++) {
          const a = (u.idx / 5) * Math.PI * 2 + this.rng.range(-0.5, 0.5), rr = z.r * this.rng.range(0.25, 0.7);
          const f = this.map.nearestFree(z.x + side * Math.abs(Math.cos(a)) * rr * 0.6 - side * Math.cos(a) * rr * 0.4, z.z + Math.sin(a) * rr);   // miroir exact entre les deux camps
          if (f) { const c = this.map.centerOf(f.c, f.r); if (this.inZone(c, -0.4)) best = c; }
        }
      }
      u.zoneSpot = best ? { x: best.x, z: best.z } : this.zoneApproach(u);
    }
    if (Math.hypot(u.zoneSpot.x - u.x, u.zoneSpot.z - u.z) > 1.0 && this.setGoal(u, u.zoneSpot.x, u.zoneSpot.z, 'advance')) { u.state = 'tozone'; u.stance = 'stand'; return; }
    this.stop(u); u.state = 'capture'; u.facing = Math.atan2(facePos.z - u.z, facePos.x - u.x);
    u.stance = this.coverAt(u.x, u.z, facePos.x, facePos.z, false) ? 'crouch' : 'stand';
  };

  // ---- Perception ------------------------------------------------------------------------
  Battle.prototype.canSee = function (u, e) {
    // ligne de vue des yeux de u vers la poitrine de e
    return this.map.hasLOS(u.x, u.eyeY(), u.z, e.x, e.chestY(), e.z);
  };
  Battle.prototype.perceive = function (u) {
    if (this.t < u.blindUntil) { u.visible = new Set(); return; }   // aveuglé par une grenade incapacitante : plus aucun repérage
    const baseRange = (30 + (u.def.perception / 100) * 45) * (has(u, 'eagle') ? 1.2 : 1); // 30..75 m (Œil de lynx : +20 %)
    const cond = this.cond, visRange = baseRange * cond.vis;                                  // nuit, brouillard, pluie : on voit moins loin
    const fov = Math.PI * 0.62;                          // ~112° de champ visuel
    const newVisible = new Set();
    for (const e of this.enemiesOf(u)) {
      if (!e.alive) { delete u.knowledge[e.id]; continue; }
      const d = dist2(u, e);
      // 1) la vue (de nuit, l'éclair d'une arme non silencieuse se voit à pleine portée)
      const lit = cond.flash > 1 && this.t - e.lastShotAt < 1.5 && !e.weapon.silenced;
      const range = lit ? baseRange : visRange;
      if (d <= range) {
        const ang = Math.atan2(e.z - u.z, e.x - u.x);
        const inFov = d < 7 || angDiff(ang, u.facing) < fov / 2 || u.visible.has(e.id);
        if (inFov && this.canSee(u, e)) {
          let p;
          if (u.visible.has(e.id)) p = 1;                   // on suit une cible déjà repérée
          else {
            p = 0.35 * (1 - d / range) * (0.6 + u.def.perception / 100) * (lit ? cond.flash : cond.spot);
            if (e.moving) p *= 1.6;
            if (this.t - e.lastShotAt < 1.5) p *= e.weapon.silenced ? 1.6 : 3;   // éclair de bouche, bruit
            if (e.stance === 'crouch') p *= 0.6;
            if (has(u, 'eagle')) p *= 1.3;                      // Œil de lynx
            if (has(e, 'ghost')) p *= 0.6;                      // Fantôme
            p *= this.teams[e.team].camo;                        // tenue adaptée au terrain : −10 %
            p = clamp(p, 0.02, 1);
          }
          if (p >= 1 || this.rng.chance(p)) {
            newVisible.add(e.id);
            u.knowledge[e.id] = { x: e.x, z: e.z, t: this.t, seen: true, source: 'vue' };
            // journal : « contact » la première fois que l'ÉQUIPE voit cet ennemi, puis si personne ne l'a vu depuis 20 s
            const team = this.teams[u.team];
            const last = team.lastSeen[e.id];
            if (!u.visible.has(e.id) && (last === undefined || this.t - last > 20)) {
              this.logEvent('spot', `${u.callsign} repère ${e.callsign} à ${d.toFixed(0)} m${last === undefined ? ' — contact !' : ''}.`, { unit: u.id, enemy: e.id, team: u.team });
            }
            team.lastSeen[e.id] = this.t;
          }
        }
      }
      // 2) l'ouïe : un tir ennemi récent et proche donne une position approximative (bien moins loin si l'arme est silencieuse)
      //    Vigie : tirs entendus 40 % plus loin, et les pas d'un ennemi en mouvement à moins de 12 m (sauf Fantôme)
      const hearR = (e.weapon.silenced ? 18 : 70) * (has(e, 'ghost') ? 0.7 : 1) * (has(u, 'sentinel') ? 1.4 : 1) * cond.hear;
      if (!newVisible.has(e.id) && ((this.t - e.lastShotAt < 0.25 && d < hearR) || (has(u, 'sentinel') && e.moving && d < 12 && !has(e, 'ghost')))) {
        const k = u.knowledge[e.id];
        if (!k || this.t - k.t > 1.5) {
          const err = 2 + d * 0.05;
          u.knowledge[e.id] = { x: e.x + this.rng.gauss() * err, z: e.z + this.rng.gauss() * err, t: this.t, seen: false, source: 'ouïe' };
        }
      }
    }
    // drone de reconnaissance actif pour mon équipe : position exacte de tous les adversaires
    u.visible = newVisible;
    // oubli
    const ttl = KNOWLEDGE_TTL * (has(u, 'radio') ? 1.5 : 1);                                       // Radio : positions gardées plus longtemps
    for (const id in u.knowledge) if (this.t - u.knowledge[id].t > ttl) delete u.knowledge[id];
  };
  // Radio : chaque opérateur transmet ce qu'il sait ; les alliés gardent l'information la plus récente.
  Battle.prototype.comms = function () {
    for (const team of this.teams) {
      const alive = team.units.filter(u => u.alive);
      for (const u of alive) for (const id in u.knowledge) {
        const k = u.knowledge[id];
        for (const a of alive) {
          if (a === u) continue;
          const ak = a.knowledge[id];
          if (!ak || k.t > ak.t + (has(u, 'radio') ? 0 : 0.5)) a.knowledge[id] = { x: k.x, z: k.z, t: k.t, seen: false, source: 'radio' };
        }
      }
    }
  };

  // ---- Décision --------------------------------------------------------------------------
  Battle.prototype.visibleEnemies = function (u) {
    const out = [];
    for (const e of this.enemiesOf(u)) if (e.alive && u.visible.has(e.id)) out.push(e);
    return out;
  };
  Battle.prototype.knownEnemies = function (u) {
    const out = [];
    for (const e of this.enemiesOf(u)) { const k = u.knowledge[e.id]; if (e.alive && k) out.push({ unit: e, k }); }
    return out;
  };
  Battle.prototype.chooseTarget = function (u, threats) {
    let best = null, bestScore = -Infinity;
    for (const e of threats) {
      const d = dist2(u, e);
      let s = 10 - 10 * Math.min(2, d / u.weapon.range);        // à portée efficace
      if (e.target === u && this.t - e.lastShotAt < 2) s += 4;    // il me tire dessus
      if (e.hp < e.maxHp * 0.35) s += 2;                          // achever une cible affaiblie
      if (d < u.weapon.minRange) s -= 3;
      if (u.target === e) s += 1.5;                               // ne pas changer de cible sans raison
      if (e.target && e.target !== u && e.target.team === u.team && this.t - e.lastShotAt < 2) s += 2.5;   // il tire sur un allié : le soutenir
      let focus = 0; for (const a of this.alliesOf(u)) if (a.alive && a.target === e) focus++; s += Math.min(2, focus * 0.8);   // concentrer le feu
      if (u.visible && u.visible.has(e.id)) s += 5 * this.hitChance(u, e, d).p;   // viser d'abord celui qu'on peut toucher (exposé, hors couvert)
      if (s > bestScore) { bestScore = s; best = e; }
    }
    return best;
  };
  // ---- Couvert LOCAL ------------------------------------------------------------------------------------------------
  // map.coverFrom accepte n'importe quel obstacle sur le rayon, même une voiture à 20 m : un soldat se croyait « à couvert »
  // en terrain nu. Un vrai couvert est un obstacle d'au moins 0,9 m, à moins de 1 m du soldat (bord de la boîte), qui coupe
  // la ligne des yeux de la menace vers ses hanches ('partial' : le buste dépasse ; 'full' : caché même à hauteur visée).
  const COVER_NEAR = 1.0, COVER_MIN_H = 0.9, HUG = 0.55;
  const edgeDist = (x, z, o) => Math.hypot(Math.max(o.x - x, 0, x - (o.x + o.w)), Math.max(o.z - z, 0, z - (o.z + o.d)));
  // obstacles assez hauts proches d'un point : grille de cases de 2 m (reconstruite si le décor change)
  Battle.prototype.nearObstacles = function (x, z) {
    const obs = this.map.obstacles; let g = this.obsGrid;
    if (!g || g.ref !== obs || g.len !== obs.length) {
      const S = 2, cols = Math.ceil(this.map.width / S) + 1, rows = Math.ceil(this.map.depth / S) + 1, cells = new Array(cols * rows);
      for (let i = 0; i < cells.length; i++) cells[i] = [];
      for (const o of obs) {
        if (o.h < COVER_MIN_H) continue;
        const c0 = Math.max(0, Math.floor((o.x - COVER_NEAR) / S)), c1 = Math.min(cols - 1, Math.floor((o.x + o.w + COVER_NEAR) / S));
        const r0 = Math.max(0, Math.floor((o.z - COVER_NEAR) / S)), r1 = Math.min(rows - 1, Math.floor((o.z + o.d + COVER_NEAR) / S));
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cells[r * cols + c].push(o);
      }
      g = this.obsGrid = { ref: obs, len: obs.length, S, cols, rows, cells };
    }
    const c = clamp(Math.floor(x / g.S), 0, g.cols - 1), r = clamp(Math.floor(z / g.S), 0, g.rows - 1);
    return g.cells[r * g.cols + c];
  };
  // L'obstacle doit couper la ligne DEVANT le soldat (dans ses 1,6 premiers mètres vers la menace) : au bout d'un long bac
  // aligné sur la menace, on est « à côté » du couvert, pas derrière (le moindre pas de côté de l'adversaire nous découvre).
  const FRONT = 1.6;
  Battle.prototype.coverAt = function (x, z, tx, tz, standing) {
    const D = Math.hypot(tx - x, tz - z); if (D < 0.5) return null;
    const L = Math.min(FRONT, D * 0.9), qx = x + (tx - x) / D * L, qz = z + (tz - z) / D * L, ch = standing ? CHEST.stand : CHEST.crouch;
    let best = null;
    for (const o of this.nearObstacles(x, z)) {
      if (edgeDist(x, z, o) > COVER_NEAR) continue;
      if (!segmentHitsBox(qx, 0.5 + (EYE.stand - 0.5) * L / D, qz, x, 0.5, z, o)) continue;
      if (segmentHitsBox(qx, ch + (EYE.stand - ch) * L / D, qz, x, ch, z, o)) return { level: 'full', obstacle: o };
      best = { level: 'partial', obstacle: o };
    }
    return best;
  };
  // un obstacle assez haut tout contre soi (sans menace connue : s'accroupir contre lui a un sens, en terrain nu non)
  Battle.prototype.besideObstacle = function (x, z) {
    for (const o of this.nearObstacles(x, z)) if (edgeDist(x, z, o) <= COVER_NEAR) return o;
    return null;
  };
  // La menace principale d'un opérateur : l'ennemi vu le plus proche, sinon celui qui vient de lui tirer dessus,
  // sinon la position connue la plus proche. null si aucune.
  Battle.prototype.mainThreat = function (u) {
    let best = null, bd = Infinity;
    for (const e of this.enemiesOf(u)) if (e.alive && u.visible.has(e.id)) { const d = dist2(u, e); if (d < bd) { bd = d; best = e; } }
    if (best) return best;
    if (this.t - u.lastShotByAt < 2 && u.lastShotBy && u.lastShotBy.alive) return u.lastShotBy;
    for (const e of this.enemiesOf(u)) { const k = u.knowledge[e.id]; if (e.alive && k) { const d = Math.hypot(k.x - u.x, k.z - u.z); if (d < bd) { bd = d; best = k; } } }
    return best;
  };
  // Point de couverture « plaqué » contre son obstacle (~0,55 m du bord) au lieu du centre de la case (jusqu'à 1,3 m) :
  // on s'abrite contre la voiture, pas à un pas devant. Calculé une fois par point (les points sont recalculés par la carte
  // quand un décor est détruit).
  Battle.prototype.hug = function (cp) {
    if (cp.hx === undefined) {
      const o = cp.obstacle, nx = clamp(cp.x, o.x, o.x + o.w), nz = clamp(cp.z, o.z, o.z + o.d);
      const dx = cp.x - nx, dz = cp.z - nz, L = Math.hypot(dx, dz);
      cp.hx = cp.x; cp.hz = cp.z;
      if (L > HUG + 0.02) {
        const hx = nx + dx / L * HUG, hz = nz + dz / L * HUG;
        if (!this.map.insideObstacle(hx, hz) && this.map.inBounds(hx, hz) && this.map.walkableSegment(cp.x, cp.z, hx, hz)) { cp.hx = hx; cp.hz = hz; }
      }
    }
    return cp;
  };
  // Distance de combat préférée (m) : on s'installe à cette distance de l'adversaire, à couvert, plutôt que de lui courir
  // dessus. Selon la portée de l'arme, un peu différente d'un opérateur à l'autre (les deux camps ne s'alignent pas).
  const MIN_CLOSE = 8;            // en dessous, on ne s'approche pas volontairement (sauf assaut sur un adversaire cloué)
  Battle.prototype.standoff = function (u) {
    return clamp(u.weapon.range * 0.45, 12, 28) * (0.85 + 0.3 * ((u.idx * 0.618 + u.team * 0.31) % 1));
  };
  // Le meilleur point de couverture contre une menace (ou une position connue), à distance raisonnable.
  // Le point renvoyé est le point plaqué contre l'obstacle ; seul un VRAI couvert local face à la menace est retenu.
  Battle.prototype.findCover = function (u, threat, maxDist, opts) {
    opts = opts || {};
    let best = null, bestScore = -Infinity;
    // les autres ennemis connus : on ne va pas se mettre à couvert sous le nez de l'un d'eux (à moins de ~8 m, quand on
    // en est plus loin que ça) — un couvert face à l'un n'en est pas un face à l'autre
    const others = [];
    for (const e of this.enemiesOf(u)) { const k = u.knowledge[e.id]; if (e.alive && k && this.t - k.t < 12) { const dk = Math.hypot(k.x - u.x, k.z - u.z); others.push({ x: k.x, z: k.z, lim: Math.min(MIN_CLOSE, dk - 1.5) }); } }
    for (const c0 of this.map.coverPoints) {
      if (Math.abs(c0.x - u.x) > maxDist + 1 || Math.abs(c0.z - u.z) > maxDist + 1) continue;
      const h = this.hug(c0), cx = h.hx, cz = h.hz;
      const d = Math.hypot(cx - u.x, cz - u.z); if (d > maxDist) continue;
      const dt = Math.hypot(cx - threat.x, cz - threat.z);
      if (opts.minRange && dt < opts.minRange) continue; // trop près de la menace (arme, ou distance de combat voulue)
      if (others.some(o => Math.hypot(o.x - cx, o.z - cz) < o.lim)) continue;
      if (this.nearCorpse(cx, cz)) continue;                                          // pas les pieds dans un corps
      let s = 10 - d * 0.6;
      if (opts.towards) s -= Math.hypot(cx - opts.towards.x, cz - opts.towards.z) * 0.25;
      if (opts.preferDist) s -= Math.abs(dt - opts.preferDist) * 0.08;
      // ne pas prendre un couvert occupé, visé ou réservé par un allié ; garder ses distances (une grenade, une rafale) ;
      // ne pas se placer derrière un allié (on ne pourrait pas tirer sans le toucher)
      let occupied = false;
      for (const a of this.alliesOf(u)) {
        if (!a.alive) continue;
        const da = Math.hypot(a.x - cx, a.z - cz), dg = a.goal ? Math.hypot(a.goal.x - cx, a.goal.z - cz) : 99;
        if (da < 2.4 || dg < 2.4 || (a.post && Math.hypot(a.post.x - cx, a.post.z - cz) < 2.4)) { occupied = true; break; }
        const near = Math.min(da, dg); if (near < 5) s -= (5 - near) * 0.8;
        if (segDist(a.goal || a, { x: cx, z: cz }, threat) < 0.6) s -= 4;
      }
      if (occupied) continue;
      if (s + 3 + (opts.wantShoot === false ? 0 : 4) + 0.05 <= bestScore) continue;   // ne peut plus battre le meilleur : on s'épargne les rayons
      const cv = this.coverAt(cx, cz, threat.x, threat.z, true);
      if (!cv) continue;
      // depuis ce point debout, puis-je voir la menace ? (sinon c'est une cachette, pas une position de tir)
      const canShoot = this.map.hasLOS(cx, EYE.stand, cz, threat.x, CHEST.stand, threat.z);
      if (opts.requireShoot && !canShoot) continue;
      if (opts.flank && this.map.coverFrom(opts.flank.x, opts.flank.z, cx, cz, opts.flank.stance === 'stand')) continue; // la cible y serait encore couverte
      if (cv.level === 'partial') s += 3; else s += 1.5;
      if (canShoot) s += opts.wantShoot === false ? 0 : 4;
      s += this.rng.next() * 0.05; // départage aléatoire des ex æquo (sinon l'ordre de la liste favoriserait un côté)
      if (s > bestScore) { bestScore = s; best = { x: cx, z: cz, obstacle: h.obstacle }; }
    }
    return best;
  };
  const COMMIT = { cover: 3, close: 2.5, bound: 4, advance: 2.5, hide: 4, fallback: 3 };
  // Écarter un point de destination des équipiers : si un allié s'y trouve ou s'y rend (à moins de 2,5 m), on vise à côté,
  // en travers de la marche (2,5 puis 4 m, d'un côté puis de l'autre) — deux opérateurs ne marchent plus vers le même point
  // (la même position connue d'un ennemi, le même milieu de chemin) pour s'y retrouver collés.
  // un corps (opérateur hors de combat, tous camps) à moins de 0,7 m de ce point ? (la poupée de chiffon finit à 0,1–1,5 m
  // du point de chute : on garde ~0,8 m autour)
  Battle.prototype.nearCorpse = function (x, z) {
    for (const a of this.units) if (!a.alive && Math.hypot(a.x - x, a.z - z) < 0.7) return a;
    return null;
  };
  Battle.prototype.spreadGoal = function (u, x, z) {
    const crowd = (px, pz) => { let n = 0; for (const a of this.alliesOf(u)) { if (!a.alive) continue; if (Math.hypot(a.x - px, a.z - pz) < 2.5) n++; if (a.goal && Math.hypot(a.goal.x - px, a.goal.z - pz) < 2.5) n++; } return n; };
    if (!crowd(x, z)) return { x, z };
    const dx = x - u.x, dz = z - u.z, L = Math.hypot(dx, dz) || 1, side = u.idx % 2 ? 1 : -1;
    let best = { x, z }, bc = crowd(x, z);
    for (const off of [2.5, -2.5, 4, -4]) {
      const px = x - dz / L * off * side, pz = z + dx / L * off * side;
      if (!this.map.inBounds(px, pz) || this.map.insideObstacle(px, pz)) continue;
      const c = crowd(px, pz); if (c < bc) { bc = c; best = { x: px, z: pz }; if (!c) break; }
    }
    return best;
  };
  Battle.prototype.setGoal = function (u, x, z, kind) {
    const req = { x, z };
    if (u.goal && u.goalReq && Math.hypot(u.goalReq.x - x, u.goalReq.z - z) < 0.6 && u.path) { u.goalKind = kind; return true; }
    if (kind === 'advance' || kind === 'search') ({ x, z } = this.spreadGoal(u, x, z));
    if (kind !== 'revive') { const c = this.nearCorpse(x, z); if (c) { const dx = x - c.x, dz = z - c.z, L = Math.hypot(dx, dz); const k = L > 1e-3 ? 0.9 / L : 0; const px = L > 1e-3 ? c.x + dx * k : x + 0.9, pz = L > 1e-3 ? c.z + dz * k : z; if (this.map.inBounds(px, pz) && !this.map.insideObstacle(px, pz)) { x = px; z = pz; } } }
    if (u.goal && Math.hypot(u.goal.x - x, u.goal.z - z) < 0.6 && u.path) { u.goalKind = kind; u.goalReq = req; return true; }
    let path = this.map.findPath(u.x, u.z, x, z);
    if (!path) { u.path = null; u.goal = null; return false; }
    // le chemin s'arrête au centre de la dernière case : on va jusqu'au point exact (un couvert « plaqué » contre son obstacle).
    // Si ce point n'est pas joignable en ligne droite depuis cette case (un coin d'obstacle entre les deux), on passe par une
    // case voisine libre d'où il l'est.
    const last = path[path.length - 1], exact = this.map.inBounds(x, z) && !this.map.insideObstacle(x, z);
    if (exact && Math.hypot(last.x - x, last.z - z) > 0.05) {
      if (this.map.walkableSegment(last.x, last.z, x, z)) path.push({ x, z });
      else {
        const c0 = this.map.cellOf(x, z); let via = null, bd = Infinity;
        for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
          if (this.map.isBlocked(c0.c + dc, c0.r + dr)) continue;
          const p = this.map.centerOf(c0.c + dc, c0.r + dr), dd = Math.hypot(p.x - x, p.z - z);
          if (dd < bd && this.map.walkableSegment(p.x, p.z, x, z)) { bd = dd; via = p; }
        }
        const p2 = via && this.map.findPath(u.x, u.z, via.x, via.z);
        if (p2) { path = p2; path.push({ x, z }); }
      }
    }
    // le premier point du chemin est souvent le centre de la case où l'on se trouve déjà, parfois DERRIÈRE soi :
    // on le saute (sinon un demi-pas en arrière, puis demi-tour — le corps « tournait sur lui-même » à chaque nouveau chemin)
    let i0 = 0; while (i0 < path.length - 1 && (Math.hypot(path[i0].x - u.x, path[i0].z - u.z) < 0.9
      || ((path[i0].x - u.x) * (path[i0 + 1].x - path[i0].x) + (path[i0].z - u.z) * (path[i0 + 1].z - path[i0].z) < 0 && this.map.walkableSegment(u.x, u.z, path[i0 + 1].x, path[i0 + 1].z)))) i0++;
    u.path = path; u.pathIdx = i0; u.goal = { x, z }; u.goalReq = req; u.goalKind = kind; u.repathAt = this.t;
    u.commitAt = this.t; u.commitUntil = this.t + (COMMIT[kind] || 2);
    return true;
  };
  // Mise en joue d'une nouvelle cible : temps d'acquisition selon l'arme et les réflexes ; plus rapide si on la visait il y a peu.
  Battle.prototype.aimAt = function (u, target) {
    u.target = target; u.burst = 0; u.targetAt = this.t;
    let t = u.weapon.aim * (1.3 - (u.def.reflexes / 100) * 0.6) * (has(u, 'fasthands') ? 0.8 : 1);  // Mains sûres
    if (u.att.lunette) t *= 1.15; else if (u.att.holo) t *= 0.9;                                       // accessoire : optique
    if (this.synergy(u, 'freres')) t *= 0.9;                                                            // synergie Frères d'armes
    const last = u.aimHistory[target.id];
    const quick = last !== undefined && this.t - last < 5;
    if (quick) t *= 0.35;
    u.aimFull = !quick;                                           // visée posée (pleine durée) : utile à « Patience »
    u.aimTimer = t; u.aimTarget = target.id; u.aimHistory[target.id] = this.t;
  };
  Battle.prototype.stop = function (u) { u.path = null; u.goal = null; u.goalKind = null; };
  Battle.prototype.startReload = function (u) {
    if (u.reloading > 0 || u.mags <= 0) return false;
    u.reloading = u.weapon.reload * (u.status === 'critical' ? 1.4 : 1) * (has(u, 'fasthands') ? 0.65 : 1); // Mains sûres
    u.stats.reloads++;
    this.logEvent('reload', `${u.callsign} recharge (${u.mags - 1} chargeur${u.mags - 1 > 1 ? 's' : ''} restant${u.mags - 1 > 1 ? 's' : ''}).`, { unit: u.id, team: u.team });
    return true;
  };

  // Ordre « Tenir » : un poste choisi une fois pour toutes (couvert près du point de départ, face à la menace), et on y reste.
  // Changer l'ordre d'une équipe en cours de bataille : les postes sont recalculés autour de la position actuelle de l'escouade.
  Battle.prototype.setOrder = function (teamIndex, order) {
    const team = this.teams[teamIndex];
    if (!ORDERS[order] || team.order === order) return false;
    team.order = order; team.orderAt = this.t;
    const alive = team.units.filter(u => u.alive);
    team.anchor = alive.length ? { x: alive.reduce((s, u) => s + u.x, 0) / alive.length, z: alive.reduce((s, u) => s + u.z, 0) / alive.length } : team.spawn;
    for (const u of team.units) { u.post = null; u.commitUntil = 0; u.pauseUntil = 0; if (u.goalKind === 'advance' || u.goalKind === 'bound') this.stop(u); }
    this.logEvent('order', `${team.name} reçoit l'ordre : ${ORDERS[order].name}.`, { team: teamIndex, order });
    return true;
  };
  Battle.prototype.holdPost = function (u, threatPos) {
    const team = this.teams[u.team];
    const home = this.zone || team.anchor || team.spawn; // capture : on tient la zone ; ordre donné en cours de bataille : autour de la position actuelle
    if (!u.post) {
      // poste : un couvert près du départ, face à la menace, avec le plus de vues sur les axes d'approche
      const dirx = Math.sign(this.map.spawns[1 - u.team].x - home.x) || 1;
      let best = null, bs = -Infinity;
      for (const cp of this.map.coverPoints) {
        const dh = Math.hypot(cp.x - home.x, cp.z - home.z); if (dh > (this.zone ? this.zone.r - 0.5 : 18)) continue;
        if (!this.coverAt(this.hug(cp).hx, cp.hz, threatPos.x, threatPos.z, true)) continue;
        let occupied = false;
        for (const a of this.alliesOf(u)) if (a.alive && a.post && Math.hypot(a.post.x - cp.x, a.post.z - cp.z) < 2.5) { occupied = true; break; }
        if (occupied) continue;
        const sc = this.map.openness(cp.x, cp.z, dirx, 6) * 2 - dh * 0.4 + this.rng.next() * 0.05;   // « Tenir » : un poste PRÈS de là où l'on est
        if (sc > bs) { bs = sc; best = cp; }
      }
      if (!best && this.zone) { this.occupyZone(u, threatPos); return; }   // aucun couvert libre dans la zone : on s'y installe quand même
      u.post = best ? { x: best.hx, z: best.hz } : (team.anchor ? { x: u.x, z: u.z } : { x: u.home.x, z: u.home.z });
    }
    if (Math.hypot(u.post.x - u.x, u.post.z - u.z) > 0.4) { if (this.setGoal(u, u.post.x, u.post.z, 'cover')) { u.state = 'tocover'; u.stance = 'stand'; return; } }
    this.stop(u); u.state = 'hold'; u.stance = 'stand'; u.facing = Math.atan2(threatPos.z - u.z, threatPos.x - u.x);
  };

  // S'avancer vers une position connue sans aller au-delà de la distance d'approche reach (pas de plus de 12 m d'un coup).
  Battle.prototype.approach = function (u, p, nd, reach) {
    const step = Math.min(12, nd - reach); if (step < 1.5) return false;
    const g = { x: u.x + (p.x - u.x) / nd * step, z: u.z + (p.z - u.z) / nd * step };
    if (this.setGoal(u, g.x, g.z, 'advance')) { u.state = 'advancing'; u.stance = 'stand'; return true; }
    return false;
  };
  // Arrivé à distance : si l'on n'est pas derrière un vrai couvert face à la menace, rejoindre le plus proche (≤ 6 m) d'où
  // l'on voit sa position, sans s'en approcher sous ~8 m. Vrai si un déplacement est lancé.
  // Déjà à couvert mais sans vue sur la position (couvert « plein », on ne peut que s'y cacher) : au bout de 3 s, on gagne
  // un couvert voisin d'où l'on peut tirer — sinon les deux camps se cachent l'un de l'autre et plus personne ne tire.
  Battle.prototype.coverUp = function (u, p) {
    if (this.coverAt(u.x, u.z, p.x, p.z, true)) {
      if (this.map.hasLOS(u.x, EYE.stand, u.z, p.x, CHEST.stand, p.z) || u.moving || this.t - (u.stillSince === undefined ? this.t : u.stillSince) < 3) return false;
      const cp = this.findCover(u, p, 6, { requireShoot: true, minRange: MIN_CLOSE, preferDist: this.standoff(u) });
      if (cp && Math.hypot(cp.x - u.x, cp.z - u.z) > 0.6 && this.setGoal(u, cp.x, cp.z, 'cover')) { u.state = 'tocover'; u.stance = 'stand'; return true; }
      return false;
    }
    const cp = this.findCover(u, p, 6, { requireShoot: true, minRange: MIN_CLOSE, preferDist: this.standoff(u) }) || this.findCover(u, p, 6, { minRange: MIN_CLOSE });
    if (cp && Math.hypot(cp.x - u.x, cp.z - u.z) > 0.4 && this.setGoal(u, cp.x, cp.z, 'cover')) { u.state = 'tocover'; u.stance = 'stand'; return true; }
    return false;
  };
  // Le déplacement en cours mène-t-il droit sur un ennemi en vue (point d'arrivée à moins de ~8 m de lui, plus près
  // qu'on ne l'est) ? Les mises à couvert, esquives et relèves ne sont pas concernées ; l'assaut sur un adversaire cloué
  // (rushUntil) descend jusqu'à 5 m.
  Battle.prototype.goalTooClose = function (u, threats) {
    if (!threats.length || !u.goal || !(u.goalKind === 'advance' || u.goalKind === 'bound' || u.goalKind === 'close') || u.state === 'sidestep') return false;
    const lim = this.t < (u.rushUntil || 0) ? 5 : MIN_CLOSE;
    for (const e of threats) { const dg = Math.hypot(u.goal.x - e.x, u.goal.z - e.z); if (dg < lim && dg < dist2(u, e) - 0.5) return true; }
    return false;
  };
  // ---- Positions clés : ordre « tenir » (capacité moteur, pas encore utilisée par l'IA ni l'interface) ----------------
  // La carte décrit ses positions clés : map.def.positionsCles = [{ id, nom, x, z, r, menace, voie }] — x, z : point où se
  // tenir (contre un couvert), r : rayon « tenu », menace : direction (radians) d'où vient le danger (null : l'ennemi le
  // plus proche), voie : -1 / 0 / 1. L'ordre se donne par battle.command('tenir', équipe, { pos: id, units: [ids] })
  // (rejoué à l'identique en revue) ; pos: null annule l'ordre pour ces opérateurs.
  Battle.prototype.keyPositions = function () { return this.map.def.positionsCles || []; };
  Battle.prototype.keyPosition = function (id) { return this.keyPositions().find(p => p.id === id) || null; };
  Battle.prototype.holdKeyPosition = function (teamIndex, posId, unitIds) {
    const team = this.teams[teamIndex]; if (!team || this.over) return { ok: false, reason: 'équipe inconnue ou bataille terminée' };
    const p = posId === null ? null : this.keyPosition(posId);
    if (posId !== null && !p) return { ok: false, reason: 'position clé inconnue' };
    const units = team.units.filter(u => u.alive && (!unitIds || unitIds.includes(u.id) || unitIds.includes(u.def.id)));
    if (!units.length) return { ok: false, reason: 'aucun opérateur' };
    units.forEach((u, k) => {
      if (!p) { u.keyOrder = null; return; }
      // à plusieurs : le premier sur le point, les suivants à côté (à ~2,5 m, en travers de la menace), jamais l'un sur l'autre
      let x = p.x, z = p.z;
      if (k > 0) {
        const a = (p.menace === null || p.menace === undefined ? 0 : p.menace) + Math.PI / 2, off = 2.5 * Math.ceil(k / 2) * (k % 2 ? 1 : -1);
        const f = this.map.nearestFree(p.x + Math.cos(a) * off, p.z + Math.sin(a) * off); if (f) { const c = this.map.centerOf(f.c, f.r); x = c.x; z = c.z; }
      }
      u.keyOrder = { id: p.id, nom: p.nom || p.id, x, z, r: p.r || 2.5, menace: p.menace, held: false };
      if (u.goalKind !== 'revive') this.stop(u); u.commitUntil = 0;
    });
    if (p) this.logEvent('order', `${team.name} : ${units.map(u => u.callsign).join(', ')} ${units.length > 1 ? 'vont tenir' : 'va tenir'} la position clé « ${p.nom || p.id} ».`, { team: teamIndex, keyPos: p.id });
    return { ok: true };
  };
  // Exécuter l'ordre : rejoindre son point (en tirant en marchant s'il le faut), puis y rester, face à la menace, à couvert
  // derrière l'obstacle de la position ; on combat de là (debout pour tirer, baissé pour recharger) et on n'en bouge plus.
  Battle.prototype.followKeyOrder = function (u, threats) {
    const o = u.keyOrder;
    if (Math.hypot(o.x - u.x, o.z - u.z) > 0.6) {
      if (this.setGoal(u, o.x, o.z, 'cover')) { u.state = 'tokey'; u.stance = 'stand'; return; }
    }
    this.stop(u);
    let th = threats.length ? u.target || threats[0] : this.mainThreat(u);
    if (!th && o.menace !== null && o.menace !== undefined) th = { x: o.x + Math.cos(o.menace) * 20, z: o.z + Math.sin(o.menace) * 20 };
    if (!o.held) { o.held = true; this.logEvent('keypos', `${u.callsign} tient la position clé « ${o.nom} ».`, { unit: u.id, team: u.team, keyPos: o.id }); }
    if (!th) { u.state = 'holdkey'; u.stance = 'stand'; return; }
    if (!u.target || !u.target.alive) u.facing = Math.atan2(th.z - u.z, th.x - u.x);
    const cover = this.coverAt(u.x, u.z, th.x, th.z, true);
    if (threats.length) { u.state = 'engage'; u.stance = ((u.reloading > 0 || this.t < (u.burstPauseUntil || 0)) && cover) ? 'crouch' : 'stand'; return; }
    u.state = 'holdkey'; u.stance = cover ? 'crouch' : 'stand';
  };
  Battle.prototype.decide = function (u) {
    if (!u.alive) return;
    let order = this.teams[u.team].order;
    // capture : « Tenir » veut dire tenir la ZONE ; tant qu'on n'y est pas, on y va prudemment (et les postes hors zone sont oubliés)
    if (this.zone && order === 'hold') {
      if (u.post && !this.inZone(u.post, 1)) u.post = null;
      if (!this.inZone(u, 2)) order = 'careful';
    }
    const threats = this.visibleEnemies(u);
    const home = this.teams[u.team].spawn, objective = this.map.spawns[1 - u.team];
    const beingShot = this.t - u.lastShotByAt < 1.5;

    // 0) munitions
    if (u.ammo === 0 && u.reloading <= 0) {
      if (u.mags > 0) this.startReload(u);
      else if (u.state !== 'noammo') {
        u.state = 'noammo';
        this.logEvent('noammo', `${u.callsign} n'a plus aucune munition et se replie à couvert.`, { unit: u.id, team: u.team });
      }
    }
    if (u.state === 'noammo') {
      // se cacher derrière un couvert près du point de départ, accroupi
      u.target = null;
      const threat = threats[0] || (this.knownEnemies(u)[0] && this.knownEnemies(u)[0].k) || objective;
      const cp = this.findCover(u, threat, 60, { wantShoot: false, towards: home });
      if (cp && Math.hypot(cp.x - u.x, cp.z - u.z) > 0.8) this.setGoal(u, cp.x, cp.z, 'hide'); else { this.stop(u); u.stance = 'crouch'; }
      return;
    }
    // recharger de façon anticipée quand le chargeur est presque vide et qu'aucune cible n'est visible
    if (threats.length === 0 && u.reloading <= 0 && u.mags > 0 && u.ammo < u.weapon.mag * 0.3) this.startReload(u);

    // choix / maintien de la cible : on garde la dernière cible quelques secondes si on la perd de vue
    if (threats.length > 0) {
      let target = this.chooseTarget(u, threats);
      // on ne change pas de cible toutes les demi-secondes : la cible en cours est gardée au moins 2 s tant qu'elle est en vue
      // (sinon le soldat pivote sans arrêt d'un ennemi à l'autre)
      if (u.target && u.target !== target && u.target.alive && threats.includes(u.target) && this.t - (u.targetAt || -99) < 2) target = u.target;
      if (u.target !== target) this.aimAt(u, target);
      u.targetLostAt = 0;
    } else if (u.target) {
      if (!u.target.alive || !u.knowledge[u.target.id]) { u.target = null; }
      else { if (!u.targetLostAt) u.targetLostAt = this.t; if (this.t - u.targetLostAt > 4) u.target = null; }
      u.burst = 0;
    }

    // relever un allié à terre : en cours (interrompu si un ennemi est en vue ou si l'on est pris pour cible), ou y aller
    if (u.reviving) {
      if (threats.length || beingShot) { u.reviving = null; u.state = 'idle'; }
      else { const a = this.unitById(u.reviving.id); if (a) a.rescue = { by: u, t: this.t }; return; }
    }
    if (!threats.length && !beingShot && u.suppression < 0.4 && !u.throwing && u.state !== 'noammo' && !u.keyOrder) {   // en poste sur ordre : il y reste
      const a = this.downedToRevive(u);
      if (a) {
        a.rescue = { by: u, t: this.t };
        const d = dist2(u, a);
        if (d <= 1.1) { this.stop(u); u.stance = 'crouch'; u.state = 'reviving'; u.target = null; u.reviving = { id: a.id, until: this.t + (has(u, 'medic') ? 2 : 4) }; this.logEvent('revive_start', `${u.callsign} se porte au secours de ${a.callsign}.`, { unit: u.id, team: u.team }); return; }
        // on s'agenouille À CÔTÉ du blessé (à ~0,85 m, de son côté), pas sur lui
        const L = d || 1, gx = a.x + (u.x - a.x) / L * 0.85, gz = a.z + (u.z - a.z) / L * 0.85;
        const ok = this.map.inBounds(gx, gz) && !this.map.insideObstacle(gx, gz);
        if (this.setGoal(u, ok ? gx : a.x, ok ? gz : a.z, 'revive')) { u.state = 'torevive'; u.stance = 'stand'; return; }
      }
    }
    // moral : ébranlé → décrocher vers un couvert en arrière, accroupi
    if (this.t < (u.shakenUntil || 0) || (threats.length && this.moraleCheck(u, threats))) {
      if (!u.throwing && !(u.evade && this.t < u.evade.until)) {
        const threat = threats[0] || (u.lastShotBy && u.lastShotBy.alive ? u.lastShotBy : null);
        const cover = threat && this.coverAt(u.x, u.z, threat.x, threat.z, false);
        if (threat && !cover) { const cp = this.findCover(u, threat, 12, { towards: home }) || this.findCover(u, threat, 22, { towards: home }); if (cp && this.setGoal(u, cp.x, cp.z, 'cover')) { u.state = 'shaken'; u.stance = 'stand'; return; } }
        this.stop(u); u.stance = 'crouch'; u.state = 'shaken'; return;
      }
    }
    // grenade : en train de lancer, ou d'esquiver une grenade adverse → rien d'autre
    if (u.throwing || (u.evade && this.t < u.evade.until)) return;
    if (this.tryGrenade(u)) return;
    // ordre « tenir la position clé » : passe avant tout le reste (l'IA fait ce qu'on lui dit)
    if (u.keyOrder) { this.followKeyOrder(u, threats); return; }
    // engagement sur un déplacement en cours : on continue (en tirant si possible) sauf si on vient d'être touché, ou si
    // ce déplacement mène droit sur un ennemi en vue (une marche d'approche ne se poursuit pas jusqu'à lui rentrer dedans)
    // Sous le feu (des balles claquent autour de soi depuis le départ), une marche d'approche ou un bond encore long
    // s'interrompt aussi : on se met à couvert là où l'on est plutôt que de finir sa course à découvert.
    const underFire = beingShot && u.lastShotByAt > u.commitAt && (u.goalKind === 'bound' || u.goalKind === 'advance' || u.goalKind === 'close') && u.goal && Math.hypot(u.goal.x - u.x, u.goal.z - u.z) > 3 && u.state !== 'sidestep';
    if (this.t < u.commitUntil && u.goal && u.lastHitAt <= u.commitAt && !underFire && !this.goalTooClose(u, threats)) return;

    // 1) une cible est visible : engager
    if (threats.length > 0) {
      const target = u.target;
      const d = dist2(u, target);
      // la menace dont on se couvre : celui qui me tire dessus (même hors de vue), sinon ma cible
      const threat = (beingShot && u.lastShotBy && u.lastShotBy.alive) ? u.lastShotBy : target;
      const cover = this.coverAt(u.x, u.z, threat.x, threat.z, true);     // un VRAI couvert, contre soi, face à la menace
      const stand = this.standoff(u);
      const pinned = u.suppression > 0.8 - u.def.composure / 400 + (this.isBraced(u) ? 0.15 : 0) + (has(u, 'steady') ? 0.15 : 0) + (this.nearLeader(u) ? 0.1 : 0); // composure 80 → 0,6 ; calé / Sang-froid / Meneur
      const effective = this.hitChance(u, target, d, true).p >= this.fireThreshold(u);

      if (pinned && cover) { u.stance = 'crouch'; u.state = 'pinned'; this.stop(u); return; }
      const covering = this.tiroirOn(u) && u.boundGroup !== this.teams[u.team].bound.group;   // Tiroir : la moitié qui couvre ne bouge pas
      // un allié est dans la ligne de tir : pas de côté pour dégager l'angle
      if (this.t - (u.blockedAt || -9) < 0.8 && !u.goal) {
        const dx = target.x - u.x, dz = target.z - u.z, L = Math.hypot(dx, dz) || 1;
        for (const sd of [1, -1]) {
          const px = u.x - dz / L * 1.6 * sd, pz = u.z + dx / L * 1.6 * sd;
          if (this.map.inBounds(px, pz) && !this.map.insideObstacle(px, pz) && this.setGoal(u, px, pz, 'close')) { u.state = 'sidestep'; u.stance = 'stand'; return; }
        }
      }
      // capture : si la zone n'est pas à nous, on ne s'éternise pas dans un échange de tirs à distance — on progresse vers la zone,
      // de couvert en couvert (le tireur d'élite reste en appui)
      if (this.zone && this.zone.holder !== u.team && u.role.id !== 'marksman' && !covering && !pinned && !this.inZone(u, 1) && u.reloading <= 0 && !this.onFlankPost(u)) {
        const fw = this.flankWaypoint(u, this.zone, 0), dst = fw || this.zone;   // flanqueur : on progresse le long de sa voie
        const dz = Math.hypot(u.x - dst.x, u.z - dst.z);
        const cp = this.findCover(u, threat, 14, { towards: dst });
        if (cp && Math.hypot(cp.x - dst.x, cp.z - dst.z) < dz - 2 && this.setGoal(u, cp.x, cp.z, 'bound')) { u.state = 'bounding'; u.stance = 'stand'; return; }
        const near = fw || this.zoneApproach(u);
        if (order === 'assault' && this.setGoal(u, near.x, near.z, 'advance')) { u.state = 'advancing'; u.stance = 'stand'; return; }
      }
      // tireur d'élite trop près : reculer vers un couvert plus lointain
      if (u.role.id === 'marksman' && d < u.weapon.minRange && order !== 'hold') {
        const cp = this.findCover(u, target, 25, { minRange: u.weapon.minRange * 1.5, towards: home });
        if (cp && this.setGoal(u, cp.x, cp.z, 'cover')) { u.state = 'fallback'; u.stance = 'stand'; return; }
      }
      // ordre « Tenir » : on combat depuis son poste ; s'il ne couvre pas face à cette cible, on prend le couvert voisin et il devient le poste
      if (order === 'hold') {
        if (!cover) {
          const postCovers = u.post && this.coverAt(u.post.x, u.post.z, threat.x, threat.z, true);
          if (postCovers && Math.hypot(u.post.x - u.x, u.post.z - u.z) > 1.2 && this.setGoal(u, u.post.x, u.post.z, 'cover')) { u.state = 'tocover'; u.stance = 'stand'; return; }
          // poste qui ne couvre pas de cette menace : on n'en change que sous le feu, et pas plus d'une fois toutes les 6 s
          // (« Tenir » : on ne court pas d'un couvert à l'autre à chaque nouvel adversaire aperçu)
          if (!postCovers && beingShot && this.t - (u.postAt || -99) > 6) { const cp = this.findCover(u, threat, 6, { minRange: u.weapon.minRange, requireShoot: true }) || this.findCover(u, threat, 6, { minRange: u.weapon.minRange }); if (cp && this.setGoal(u, cp.x, cp.z, 'cover')) { u.post = { x: cp.x, z: cp.z }; u.postAt = this.t; u.state = 'tocover'; u.stance = 'stand'; return; } }
        }
        this.stop(u);
        const teamEngaged = this.alliesOf(u).some(a => a.alive && (this.t - a.lastShotAt < 3 || this.t - a.lastShotByAt < 3)) || this.t - u.lastShotAt < 3;
        const ambush = !teamEngaged && d > u.weapon.range * 0.7 && !beingShot; // embuscade : on laisse approcher tant que personne n'est engagé
        if (!effective || ambush) { u.state = 'wait'; u.stance = cover ? 'crouch' : 'stand'; return; }
        u.state = 'engage'; u.stance = ((u.reloading > 0 || this.t < (u.burstPauseUntil || 0)) && cover) ? 'crouch' : 'stand'; return;
      }
      // assaut sur un adversaire cloué, en train de recharger : on gagne du terrain d'un couvert à un autre plus proche
      // (jamais à moins de 5 m) — c'est le seul cas où l'on va au-devant de l'adversaire en plein échange de tirs
      if (order === 'assault' && !covering && !pinned && u.status === 'ok' && !beingShot && u.suppression < 0.3 && d > 7 && d < stand + 6
        && (target.state === 'pinned' || target.suppression > 0.6 || target.reloading > 0.8)) {
        const cp = this.findCover(u, target, 10, { towards: target, minRange: 5, requireShoot: true });
        if (cp && Math.hypot(cp.x - target.x, cp.z - target.z) < d - 3 && this.setGoal(u, cp.x, cp.z, 'close')) { u.state = 'closing'; u.stance = 'stand'; u.rushUntil = this.t + 3; return; }
      }
      // tir inefficace à cette distance (cible trop loin) : se rapprocher de couvert en couvert, sans descendre sous ~8 m
      if (!effective && !pinned && !covering && !beingShot && u.suppression < 0.4) {   // on ne quitte pas son couvert sous le feu
        const cp = this.findCover(u, target, 16, { towards: target, minRange: MIN_CLOSE });
        let g = null;
        if (cp && Math.hypot(cp.x - target.x, cp.z - target.z) < d - 2) g = cp;
        else if (d > stand * 1.3) { const k = Math.min(0.5, (d - stand) / d); g = this.spreadGoal(u, u.x + (target.x - u.x) * k, u.z + (target.z - u.z) * k); }
        if (g && this.setGoal(u, g.x, g.z, 'close')) { u.state = 'closing'; u.stance = 'stand'; return; }
      }
      // contournement : la cible est à couvert face à moi et je la touche mal → chercher un angle d'où son couvert ne sert plus
      if (effective && order !== 'hold' && !covering && (u.role.id === 'assault' || u.role.id === 'pointman') && !beingShot && u.suppression < 0.3) {
        const tc = this.map.coverFrom(target.x, target.z, u.x, u.z, target.stance === 'stand');
        if (tc && this.hitChance(u, target, d, true).p < 0.16) {
          const cp = this.findCover(u, target, 16, { requireShoot: true, flank: target, minRange: MIN_CLOSE });
          if (cp && this.setGoal(u, cp.x, cp.z, 'close')) { u.state = 'closing'; u.stance = 'stand'; if (this.t - (u.lastFlankLog || -99) > 15) { u.lastFlankLog = this.t; this.logEvent('flank', `${u.callsign} contourne ${target.callsign}, à couvert.`, { unit: u.id, team: u.team }); } return; }
        }
      }
      // pas de vrai couvert face à la menace : en prendre un d'où l'on tire, à distance de combat (on ne s'approche pas sous
      // ~8 m pour se mettre à l'abri) ; trop près et rien autour : décrocher vers un couvert plus en arrière
      if (!cover) {
        const minR = Math.max(u.weapon.minRange, Math.min(MIN_CLOSE, d - 2));
        const cp = this.findCover(u, threat, 9, { minRange: minR, requireShoot: true, preferDist: stand }) || this.findCover(u, threat, 9, { minRange: minR, preferDist: stand });
        if (cp && this.setGoal(u, cp.x, cp.z, 'cover')) { u.state = 'tocover'; u.stance = 'stand'; return; }
        if (d < MIN_CLOSE && order !== 'hold') {
          const cp2 = this.findCover(u, threat, 16, { minRange: MIN_CLOSE, towards: home });
          if (cp2 && this.setGoal(u, cp2.x, cp2.z, 'cover')) { u.state = 'fallback'; u.stance = 'stand'; return; }
        }
      }
      // sinon : tenir la position et tirer. Debout pour tirer par-dessus le couvert ; accroupi si on recharge à couvert.
      this.stop(u);
      u.state = 'engage';
      u.stance = (u.reloading > 0 && cover) ? 'crouch' : 'stand';
      return;
    }

    // 2) pas de cible visible mais des positions connues
    const known = this.knownEnemies(u);
    // pris pour cible par un tireur qu'on ne voit pas : d'abord se mettre à couvert face à lui (un bond en cours s'arrête là)
    if (beingShot && u.lastShotBy && u.lastShotBy.alive && order !== 'hold' && !this.coverAt(u.x, u.z, u.lastShotBy.x, u.lastShotBy.z, true)) {
      const sh = u.lastShotBy, ds = dist2(u, sh), minR = Math.min(MIN_CLOSE, ds - 2);
      const cp = this.findCover(u, sh, 9, { minRange: minR, requireShoot: true, preferDist: this.standoff(u) }) || this.findCover(u, sh, 9, { minRange: minR });
      if (cp && this.setGoal(u, cp.x, cp.z, 'cover')) { u.state = 'tocover'; u.stance = 'stand'; return; }
    }
    if (known.length > 0) {
      let nearest = known[0], nd = Infinity;
      for (const k of known) { const dd = Math.hypot(k.k.x - u.x, k.k.z - u.z); if (dd < nd) { nd = dd; nearest = k; } }
      const threatPos = nearest.k;
      // capture : on n'abandonne pas la zone pour courir après une position connue lointaine ; on s'y installe face à la menace
      // … sauf si l'adversaire est lui-même dans la zone : il faut aller l'en déloger
      if (this.zone && u.role.id !== 'marksman' && !(this.zone.contested && this.inZone(threatPos, 1.5)) && (nd > 10 || this.inZone(u))) {
        const fw = nd > 10 && this.flankWaypoint(u, this.zone, 0);   // flanqueur : par sa voie jusqu'à hauteur de la zone
        if (fw && this.flankMove(u, threatPos, fw)) return;
        this.occupyZone(u, threatPos); return;
      }
      if (order === 'hold') { this.holdPost(u, threatPos); return; }
      // flanqueur : la menace connue est loin et hors de sa voie → il continue par le flanc jusqu'à sa hauteur, puis se rabat
      if (nd > 12 && (u.rejoin || Math.abs(threatPos.z - (home.z + this.laneOf(u))) > 7)) {
        const fw = this.flankWaypoint(u, threatPos, 8);
        if (fw && this.flankMove(u, threatPos, fw)) return;
      }
      // distance d'approche : position toute fraîche → on s'installe à distance de combat, à couvert, et on échange des tirs ;
      // elle vieillit (personne ne la revoit) → on resserre de couvert en couvert ; périmée → on va voir ce qu'il en est
      const age = this.t - threatPos.t, stand = this.standoff(u);
      let reach = age < 6 ? stand : age < 14 ? MIN_CLOSE + 2 : MIN_CLOSE;
      // arrêté depuis 4 s sans aucune vue sur la position (voitures, murs : terrain fermé) : la distance de combat ne sert à
      // rien d'ici, on resserre (de couvert en couvert) jusqu'à ~10 m
      const los = this.map.hasLOS(u.x, EYE.stand, u.z, threatPos.x, CHEST.stand, threatPos.z);
      if (los || u.moving) u.blindAt = undefined; else if (u.blindAt === undefined) u.blindAt = this.t;
      const blindFor = u.blindAt === undefined ? 0 : this.t - u.blindAt;
      if (!los && blindFor > 4) {
        // d'abord chercher un couvert voisin d'où l'on voit la position (un angle de tir), sans s'en approcher sous ~8 m ;
        // sinon resserrer ; aveugle depuis plus de 12 s (l'adversaire attend derrière son obstacle) : aller le chercher
        if (order !== 'hold' && u.role.id !== 'marksman' && !(u.goal && u.goalKind === 'cover')) {
          const cp = this.findCover(u, threatPos, 10, { requireShoot: true, minRange: Math.min(MIN_CLOSE, nd - 1), preferDist: clamp(nd, MIN_CLOSE, stand) });
          if (cp && Math.hypot(cp.x - u.x, cp.z - u.z) > 0.6 && this.setGoal(u, cp.x, cp.z, 'cover')) { u.state = 'tocover'; u.stance = 'stand'; return; }
        }
        reach = Math.min(reach, blindFor > 12 ? 0 : MIN_CLOSE + 2);
      }
      // information ancienne (≥ 14 s) : on va VOIR la position, d'un point d'où on la découvre ; vue de près et vide → oubliée
      // (on ne marche plus jusque sur elle) ; sans vue possible, on s'en approche jusqu'à quelques mètres
      if (age >= 14 && nd <= MIN_CLOSE + 3) {
        if (this.map.hasLOS(u.x, EYE.stand, u.z, threatPos.x, CHEST.stand, threatPos.z)) { delete u.knowledge[nearest.unit.id]; this.stop(u); u.state = 'search'; u.stance = 'stand'; return; }
        reach = 0;
      }
      if (nd > Math.max(6, reach + 2) && u.status !== 'critical' && this.tiroir(u, threatPos, threatPos, reach)) return;   // Tiroir : bonds alternés vers la menace
      if (u.role.id === 'marksman') {
        // un poste de tir à bonne distance AVEC vue sur la position connue
        if (nd < u.weapon.minRange * 1.5) {
          const cp = this.findCover(u, threatPos, 30, { minRange: u.weapon.minRange * 1.6, towards: home });
          if (cp && this.setGoal(u, cp.x, cp.z, 'cover')) { u.state = 'fallback'; u.stance = 'stand'; return; }
        }
        const cp = this.findCover(u, threatPos, 40, { requireShoot: true, preferDist: 35, minRange: u.weapon.minRange * 1.5 });
        if (cp && Math.hypot(cp.x - u.x, cp.z - u.z) > 1 && this.setGoal(u, cp.x, cp.z, 'cover')) { u.state = 'reposition'; u.stance = 'stand'; return; }
        if (!cp && nd > 30) { // pas de poste : s'approcher jusqu'à ~30 m de la position connue
          const k = 1 - 30 / nd, gx = u.x + (threatPos.x - u.x) * k, gz = u.z + (threatPos.z - u.z) * k;
          if (this.setGoal(u, gx, gz, 'advance')) { u.state = 'advancing'; u.stance = 'stand'; return; }
        }
        this.stop(u); u.state = 'overwatch'; u.facing = Math.atan2(threatPos.z - u.z, threatPos.x - u.x); return;
      }
      if (order === 'careful' || u.role.id === 'support' || u.status !== 'ok') {
        // de couvert en couvert : un point plus proche de la menace que moi, pause courte à chaque bond
        if (this.t < u.pauseUntil) { this.stop(u); u.state = 'pause'; u.stance = 'stand'; u.facing = Math.atan2(threatPos.z - u.z, threatPos.x - u.x); return; }
        if (u.status === 'critical' && order !== 'assault') { // repli
          const cp = this.findCover(u, threatPos, 40, { wantShoot: false, towards: home });
          if (cp && this.setGoal(u, cp.x, cp.z, 'hide')) { u.state = 'retreat'; u.stance = 'stand'; return; }
        }
        if (nd > reach + 2) {
          const cp = this.findCover(u, threatPos, 16, { towards: threatPos, minRange: reach * 0.7 });
          if (cp && Math.hypot(cp.x - threatPos.x, cp.z - threatPos.z) < nd - 1.5 && this.setGoal(u, cp.x, cp.z, 'bound')) { u.state = 'bounding'; u.stance = 'stand'; return; }
          // pas de couvert plus avancé : avancer prudemment en direction de la menace (jusqu'à la distance d'approche)
          if (nd > 8 && this.approach(u, threatPos, nd, reach)) return;
        }
        if (reach > 0 && this.coverUp(u, threatPos)) return;
        if (reach > 0) { this.stop(u); u.state = 'hold'; u.stance = 'stand'; u.facing = Math.atan2(threatPos.z - u.z, threatPos.x - u.x); return; }
      }
      // assaut : progresser vers la dernière position connue, de couvert en couvert, jusqu'à la distance d'approche ; là, se mettre
      // à couvert face à elle et attendre qu'il se montre (ou que l'information vieillisse)
      if (nd > reach + 2) {
        const cp = this.findCover(u, threatPos, 12, { towards: threatPos, minRange: reach * 0.7 });
        if (cp && Math.hypot(cp.x - threatPos.x, cp.z - threatPos.z) < nd - 2 && this.setGoal(u, cp.x, cp.z, 'bound')) { u.state = 'bounding'; u.stance = 'stand'; return; }
        if (this.approach(u, threatPos, nd, reach)) return;
      }
      if (reach > 0) { if (this.coverUp(u, threatPos)) return; this.stop(u); u.state = 'overwatch'; u.stance = 'stand'; u.facing = Math.atan2(threatPos.z - u.z, threatPos.x - u.x); return; }
      if (nd > 4) { if (this.setGoal(u, threatPos.x, threatPos.z, 'advance')) { u.state = 'advancing'; u.stance = 'stand'; return; } }
      // arrivé sur la position connue et personne : l'information est périmée, on l'oublie
      delete u.knowledge[nearest.unit.id];
      this.stop(u); u.state = 'search'; u.stance = 'stand'; return;
    }

    // 3) aucune information : se déployer / avancer vers l'objectif
    if (this.zone && (u.role.id !== 'marksman' || this.inZone(u))) {
      // capture : tout le monde vers la zone (le tireur d'élite garde son poste de surveillance plus bas)
      const fw = this.flankWaypoint(u, this.zone, 0);        // flanqueur : par sa voie jusqu'à hauteur de la zone
      if (fw && this.flankMove(u, objective, fw)) return;
      if (!this.inZone(u, 2) && this.tiroir(u, objective, this.zone)) return;   // Tiroir : bonds alternés jusqu'à la zone
      if (order === 'careful' || u.role.id === 'support') {
        if (this.t < u.pauseUntil && !this.inZone(u, 3)) { this.stop(u); u.state = 'pause'; u.stance = 'stand'; return; }
        if (!this.inZone(u, 3)) {
          const cp = this.findCover(u, this.zone, 14, { towards: this.zone });
          if (cp && Math.hypot(cp.x - this.zone.x, cp.z - this.zone.z) < Math.hypot(u.x - this.zone.x, u.z - this.zone.z) - 2 && this.setGoal(u, cp.x, cp.z, 'bound')) { u.state = 'bounding'; u.stance = 'stand'; return; }
        }
      }
      this.occupyZone(u, objective); return;
    }
    if (order === 'hold') { this.holdPost(u, objective); return; }
    // chaque opérateur avance sur sa propre « voie » (décalage latéral) pour ne pas se regrouper
    if (u.rejoin) { const fw = this.flankWaypoint(u, objective, 0); if (fw && this.flankMove(u, objective, fw)) return; }   // rotation : rejoindre d'abord sa nouvelle voie
    const lane = this.laneOf(u);
    const dirx = Math.sign(objective.x - home.x) || 1;
    const progress = (u.x - home.x) * dirx;
    const span = Math.abs(objective.x - home.x);
    let gz = clamp(home.z + lane, 2, this.map.depth - 2);
    if (u.rejoin && Math.abs(u.z - gz) <= 3) u.rejoin = false;                                // rotation : voie rejointe
    const stepLen = (u.voie || u.rejoin) && Math.abs(u.z - gz) > 4 ? 5 : order === 'careful' ? 12 : 22;   // flanqueur loin de sa voie : la rejoindre d'abord
    let gx = home.x + dirx * Math.min(span - 6, progress + stepLen);
    // Tiroir : bonds alternés le long de sa voie, jusqu'aux abords de la zone adverse
    if (progress < span - 8 && this.tiroir(u, objective, { x: home.x + dirx * (span - 8), z: gz })) return;
    if (order === 'careful' || u.role.id === 'support') {
      if (this.t < u.pauseUntil) { this.stop(u); u.state = 'pause'; u.stance = 'stand'; return; }
      const cp = this.findCover(u, objective, 18, { towards: { x: gx, z: gz } });
      if (cp && (cp.x - u.x) * dirx > 2 && this.setGoal(u, cp.x, cp.z, 'bound')) { u.state = 'bounding'; u.stance = 'stand'; return; }
    }
    if (u.role.id === 'marksman' && this.t - this.lastShotTime < 25) {
      // poste de tir : le couvert du premier tiers de la carte qui voit le plus loin vers l'ennemi (choisi une fois)
      if (!u.post) {
        let best = null, bs = -Infinity;
        for (const cp of this.map.coverPoints) {
          const prog = (cp.x - home.x) * dirx; if (prog < 8 || prog > span * 0.45) continue;
          const sc = this.map.openness(cp.x, cp.z, dirx, 15) * 2 - Math.abs(cp.z - home.z) * 0.1 + this.rng.next() * 0.05;
          if (sc > bs) { bs = sc; best = cp; }
        }
        u.post = best ? { x: best.x, z: best.z } : { x: home.x + dirx * span * 0.35, z: home.z };
      }
      gx = u.post.x; gz = u.post.z;
    }
    // arrivé près de l'objectif sans avoir trouvé personne : ratisser la zone (points aléatoires autour de la zone ennemie)
    if (progress >= span - 8) {
      if (u.searchSince === undefined) u.searchSince = this.t;
      // ratissage prolongé sans contact (> 15 s) : on élargit à toute la carte (deux survivants ne tournent pas indéfiniment chacun chez l'autre)
      const wide = this.t - u.searchSince > 15;
      if (!u.searchGoal || this.t > u.searchUntil || Math.hypot(u.searchGoal.x - u.x, u.searchGoal.z - u.z) < 1.5) {
        for (let k = 0; k < 10; k++) {
          const a = this.rng.range(0, Math.PI * 2), r = this.rng.range(2, objective.r + 9);
          let sx = objective.x + Math.cos(a) * r, sz = clamp(objective.z + Math.sin(a) * r, 2, this.map.depth - 2);
          if (wide) { sx = this.rng.range(4, this.map.width - 4); sz = this.rng.range(3, this.map.depth - 3); }
          const f = this.map.nearestFree(sx, sz); if (!f) continue;
          const c = this.map.centerOf(f.c, f.r); u.searchGoal = c; u.searchUntil = this.t + 8; break;
        }
      }
      if (u.searchGoal && this.setGoal(u, u.searchGoal.x, u.searchGoal.z, 'advance')) { u.state = 'search'; u.stance = 'stand'; return; }
    }
    if (Math.hypot(gx - u.x, gz - u.z) > 1.5) { if (this.setGoal(u, gx, gz, 'advance')) { u.state = 'advancing'; u.stance = 'stand'; return; } }
    this.stop(u); u.state = 'hold'; u.facing = Math.atan2(objective.z - u.z, objective.x - u.x);
  };

  // ---- Action (chaque pas) ---------------------------------------------------------------
  Battle.prototype.act = function (u) {
    // suppression : décroît avec le sang-froid
    if (u.suppression > 0) {
      let rec = 0.18 * (0.5 + u.def.composure / 100) * (this.isBraced(u) ? 1.4 : 1);
      if (has(u, 'steady')) rec *= 1.5;                           // Sang-froid
      if (this.nearLeader(u)) rec *= 1.2;                          // Meneur à proximité
      if (this.synergy(u, 'appui')) rec *= 1.2;                    // synergie Appui-feu
      u.suppression = Math.max(0, u.suppression - DT * rec); if (u.suppression > 0.3) u.stats.timeSuppressed += DT;
    }
    // rechargement
    if (u.reloading > 0) {
      u.reloading -= DT;
      if (u.reloading <= 0) { u.reloading = 0; u.mags--; u.ammo = u.weapon.mag; this.logEvent('reloaded', `${u.callsign} a rechargé.`, { unit: u.id, team: u.team, silent: true }); }
    }
    // lancer de grenade en cours : la grenade part au bout du geste
    if (u.throwing && this.t >= u.throwing.at) this.releaseGrenade(u);
    // esquive d'une grenade signalée : courir à l'écart (une fois le réflexe passé)
    if (u.evade && !u.evade.started && this.t >= u.evade.at) this.startEvade(u);
    // déplacement
    const wasMoving = u.moving;
    u.moving = false;
    if (u.path && u.goal) this.move(u);
    if (u.moving) u.stillSince = undefined; else if (wasMoving || u.stillSince === undefined) u.stillSince = this.t;
    // accroupi à l'arrêt = « à couvert » : seulement derrière un vrai obstacle face à la menace principale (elle a pu bouger,
    // le décor a pu sauter, on a pu se décaler). Sinon on se relève (et la prochaine décision cherche un vrai couvert).
    // Exception : à genoux auprès d'un blessé qu'on relève.
    if (u.stance === 'crouch' && !u.moving && u.state !== 'reviving') {
      const th = this.mainThreat(u);
      if (th ? !this.coverAt(u.x, u.z, th.x, th.z, false) : !this.besideObstacle(u.x, u.z)) u.stance = 'stand';
    }
    // orientation : vers la cible si on en a une, sinon vers la marche
    if (u.target && u.target.alive) u.facing = Math.atan2(u.target.z - u.z, u.target.x - u.x);
    // tir
    if (u.throwing) { u.fireAcc = 0; return; }   // on ne tire pas en lançant
    if (u.target && u.target.alive && u.visible.has(u.target.id) && u.state !== 'pinned' && u.state !== 'noammo' && u.state !== 'wait') this.fireAt(u, u.target);
    else if (u.target && u.target.alive && u.state !== 'pinned' && u.state !== 'noammo' && this.canSuppress(u, u.target)) this.suppressAt(u, u.target);
    else { u.fireAcc = Math.min(u.fireAcc, 1); if (u.target && !u.target.alive) u.target = null; }
  };

  // Allure selon l'angle entre la marche et le regard (arme pointée vers la cible, ou vers une menace connue) : on ne court pas
  // en crabe ni à reculons aussi vite que droit devant. Plafonds (m/s) aux angles de GAIT, raccords progressifs (smoothstep) :
  // pleine vitesse jusqu'à 30° ; 2,0 à 45° (diagonale avant : la marche s'y mélange au pas chassé) ; 1,4 à 90° (pas chassé
  // pur, ~1,35 × sa cadence naturelle de 1,0 m/s) ; 1,8 de 135° à 180° (marche arrière, ~1,55 × sa cadence naturelle de
  // 1,15 m/s). Mesuré sur les animations (pied d'appui qui glisse au-delà) : outils/vues/marche.html.
  const GAIT = [[Math.PI / 6, Infinity], [Math.PI / 4, 2.0], [Math.PI / 2, 1.4], [3 * Math.PI / 4, 1.8], [Math.PI, 1.8]];
  Battle.prototype.gaitSpeed = function (v, ang) {
    if (ang <= GAIT[0][0]) return v;
    for (let i = 1; i < GAIT.length; i++) {
      const [a1, c1] = GAIT[i]; if (ang > a1 && i < GAIT.length - 1) continue;
      const [a0, c0] = GAIT[i - 1], t = clamp((ang - a0) / (a1 - a0), 0, 1), k = t * t * (3 - 2 * t);
      const v0 = Math.min(v, c0), v1 = Math.min(v, c1);
      return v0 + (v1 - v0) * k;
    }
    return v;
  };
  Battle.prototype.move = function (u) {
    const wp = u.path[u.pathIdx];
    if (!wp) { this.arrive(u); return; }
    const d = Math.hypot(wp.x - u.x, wp.z - u.z);
    // regard pendant la marche : la cible si l'on en a une ; sinon l'arme pointée vers la dernière position connue d'un ennemi
    // (repéré il y a moins de 5 s) si elle n'est pas dans le dos : on progresse en couvrant l'angle dangereux plutôt qu'en
    // regardant ses pieds
    const mv = Math.atan2(wp.z - u.z, wp.x - u.x); let aim = null;
    if (!u.target && d > 0.05) { let best = 99; for (const { k } of this.knownEnemies(u)) { if (this.t - k.t > 5) continue; const dd = Math.hypot(k.x - u.x, k.z - u.z); const a = Math.atan2(k.z - u.z, k.x - u.x); if (dd < best && angDiff(a, mv) < 1.9) { best = dd; aim = a; } } }
    const look = u.target && u.target.alive ? Math.atan2(u.target.z - u.z, u.target.x - u.x) : aim;
    const stepLen = (look === null || d <= 0.05 ? u.speed() : this.gaitSpeed(u.speed(), angDiff(look, mv))) * DT;
    let nx, nz;
    if (d <= stepLen) { nx = wp.x; nz = wp.z; }
    else { nx = u.x + (wp.x - u.x) / d * stepLen; nz = u.z + (wp.z - u.z) / d * stepLen; }
    // collision : les obstacles bloquent réellement
    // (si l'opérateur est déjà dans un obstacle — cas anormal — on le laisse en sortir)
    if ((this.map.insideObstacle(nx, nz) && !this.map.insideObstacle(u.x, u.z)) || !this.map.inBounds(nx, nz)) {
      u.stuck += DT;
      if (u.stuck > 1.5) { // bloqué contre un bord : pas de côté aléatoire pour se dégager
        for (let k = 0; k < 6; k++) {
          const a = this.rng.range(0, Math.PI * 2), px = u.x + Math.cos(a) * 0.5, pz = u.z + Math.sin(a) * 0.5;
          if (!this.map.insideObstacle(px, pz) && this.map.inBounds(px, pz)) { u.x = px; u.z = pz; u.moving = true; break; }
        }
        u.stuck = 0;
      }
      if (this.t - u.repathAt > 0.5) { const g = u.goal; u.goal = null; if (!this.setGoal(u, g.x, g.z, u.goalKind)) this.stop(u); }
      return;
    }
    // séparation douce entre alliés : on se décale pour passer à côté (à ~1 m), sans jamais freiner sa marche — la poussée
    // qui s'opposerait à l'avance est retirée, et un camarade pile sur le chemin est contourné par le côté (sinon les deux
    // restaient collés : poussée et pas s'annulaient)
    const mx = d > 1e-6 ? (wp.x - u.x) / d : 0, mz = d > 1e-6 ? (wp.z - u.z) / d : 0;
    // les corps (tous camps, point de chute ; rayon 0,8 m) se contournent de la même façon (on relève un blessé à côté de lui)
    for (const a of this.units) {
      if (a === u || (a.alive && a.team !== u.team)) continue;
      const R = a.alive ? 1.1 : 0.8, dd = Math.hypot(a.x - nx, a.z - nz);
      if (dd < R && dd > 1e-6) {
        let qx = (nx - a.x) / dd, qz = (nz - a.z) / dd;
        const along = qx * mx + qz * mz;
        if (along < 0) {
          qx -= along * mx; qz -= along * mz; const L = Math.hypot(qx, qz);
          if (L < 0.3) { const sd = ((a.x - u.x) * mz - (a.z - u.z) * mx) >= 0 ? 1 : -1; qx = -mz * sd; qz = mx * sd; } else { qx /= L; qz /= L; }
        }
        const push = (R - dd) * 0.5, px = nx + qx * push, pz = nz + qz * push;
        if (!this.map.insideObstacle(px, pz) && this.map.inBounds(px, pz)) { nx = px; nz = pz; }
      }
    }
    u.stats.distance += Math.hypot(nx - u.x, nz - u.z);
    // regard : vers le point de passage visé (pas vers le petit pas de côté de la séparation entre alliés)
    if (!u.target && d > 0.05) { u.facing = aim === null ? mv : aim; u.preaim = aim !== null; }
    u.x = nx; u.z = nz; u.moving = true;
    if (d <= stepLen) { u.pathIdx++; if (u.pathIdx >= u.path.length) { this.arrive(u); return; } }
    // détection de blocage : pas de progrès depuis 2,5 s → nouveau chemin
    if (Math.hypot(u.x - u.lastProgress.x, u.z - u.lastProgress.z) > 0.5) { u.lastProgress = { x: u.x, z: u.z, t: this.t }; u.stuck = 0; }
    else if (this.t - u.lastProgress.t > 2.5) {
      u.lastProgress.t = this.t;
      const g = u.goal; u.goal = null;
      if (!this.setGoal(u, g.x, g.z, u.goalKind)) { this.stop(u); this.logEvent('stuck', `${u.callsign} ne trouve pas de passage et change de plan.`, { unit: u.id, team: u.team, silent: true }); }
    }
  };
  Battle.prototype.arrive = function (u) {
    const kind = u.goalKind;
    this.stop(u);
    if (kind === 'cover' || kind === 'bound' || kind === 'hide') {
      if (kind === 'bound') { u.pauseUntil = this.t + 1.5 + this.rng.range(0, 1.5); if (u.boundGoalN !== undefined) { u.boundDone = u.boundGoalN; u.boundGoalN = undefined; } }
      if (kind === 'hide') u.stance = 'crouch';
      if (kind !== 'hide') this.logEvent('cover', `${u.callsign} se met à couvert.`, { unit: u.id, team: u.team, silent: true });
    }
  };

  // ---- Alliés ---------------------------------------------------------------------------
  // un allié debout se trouve-t-il dans la ligne de tir (à moins de 0,55 m de la trajectoire, entre le tireur et la cible) ?
  Battle.prototype.allyInLine = function (u, e) {
    for (const a of this.teams[u.team].units) if (a !== u && a.alive && segDist(a, u, e) < 0.55) return true;
    return false;
  };
  // ---- Tiroir : progression par bonds alternés ---------------------------------------------
  // L'escouade est partagée en deux moitiés (boundGroup 0 / 1). La moitié « qui avance » fait un bond (≤ 11 m) jusqu'au couvert
  // suivant ; l'autre, arrêtée, couvre (face à la menace, prête à tirer). Quand tous ceux qui avancent sont arrivés (ou engagés),
  // les rôles s'inversent. Le tireur d'élite reste en appui (sa propre logique).
  Battle.prototype.tiroirOn = function (u) { const tm = this.teams[u.team]; return this.hasTactic(tm, 'tiroir') && tm.order !== 'hold' && u.boundGroup >= 0; };
  const BUSY = { engage: 1, pinned: 1, shaken: 1, noammo: 1, reviving: 1, torevive: 1, throw: 1, sidestep: 1, closing: 1, tocover: 1, tokey: 1, holdkey: 1 };
  Battle.prototype.updateTiroir = function () {
    for (const team of this.teams) {
      if (!this.hasTactic(team, 'tiroir') || team.order === 'hold') continue;
      const b = team.bound, alive = team.units.filter(a => a.alive && a.boundGroup >= 0);
      const movers = alive.filter(a => a.boundGroup === b.group), others = alive.filter(a => a.boundGroup !== b.group);
      const el = this.t - b.since;
      const done = !movers.length || (el > 2.5 && movers.every(a => a.boundDone === b.n || BUSY[a.state])) || el > 10;
      if (!done) continue;
      b.since = this.t; b.n++;
      if (!others.length) continue;                       // une seule moitié encore debout : elle enchaîne les bonds
      b.group = 1 - b.group;
      if (movers.length) this.logEvent('tiroir', `${team.name} — tiroir : ${others.map(a => a.callsign).join(', ')} ${others.length > 1 ? 'avancent' : 'avance'}, ${movers.map(a => a.callsign).join(', ')} ${movers.length > 1 ? 'couvrent' : 'couvre'}.`, { team: team.index, silent: true });
    }
  };
  // décision d'un opérateur en tiroir (hors contact) : vrai si la décision est prise
  // reach (contact) : distance d'approche de la menace — les bonds s'arrêtent là (couverts choisis au-delà de ~70 % de reach),
  // et celui qui couvre rejoint d'abord un vrai couvert proche face à elle.
  Battle.prototype.tiroir = function (u, threatPos, dest, reach) {
    if (!this.tiroirOn(u)) return false;
    const b = this.teams[u.team].bound;
    const face = () => { u.facing = Math.atan2(threatPos.z - u.z, threatPos.x - u.x); };
    const overwatch = () => {
      if (reach !== undefined && reach > 0 && this.coverUp(u, threatPos)) return true;
      this.stop(u); u.state = 'overwatch'; face();
      u.stance = this.coverAt(u.x, u.z, threatPos.x, threatPos.z, true) ? 'crouch' : 'stand';
      return true;
    };
    if (u.goal && u.goalKind === 'bound') return true;                       // un bond en cours : on le termine
    if (u.boundGroup !== b.group || u.boundDone === b.n) return overwatch();  // on couvre (ou bond déjà fait)
    const stopAt = Math.max(3, reach || 0);
    const dNow = Math.hypot(dest.x - u.x, dest.z - u.z);
    if (dNow < stopAt) { u.boundDone = b.n; return overwatch(); }
    const cp = this.findCover(u, threatPos, 11, { towards: dest, minRange: reach ? reach * 0.7 : 0 });
    let g;
    if (cp && Math.hypot(cp.x - dest.x, cp.z - dest.z) < dNow - 2) g = cp;
    else {
      const step = reach ? Math.min(8, dNow - stopAt) : Math.min(8, dNow); if (step < 1.5) { u.boundDone = b.n; return overwatch(); }
      g = this.spreadGoal(u, u.x + (dest.x - u.x) / dNow * step, u.z + (dest.z - u.z) / dNow * step);
    }
    if (this.setGoal(u, g.x, g.z, 'bound')) { u.state = 'bounding'; u.stance = 'stand'; u.boundGoalN = b.n; return true; }
    u.boundDone = b.n; return overwatch();
  };

  // ---- Tactiques ---------------------------------------------------------------------
  // Passives : appliquées à la création. Actives : useTactic(team, id) par le joueur (ou l'IA adverse si team.auto).
  Battle.prototype.hasTactic = function (team, id) { return !!(team.tactics && team.tactics[id]); };
  Battle.prototype.canUseTactic = function (teamIndex, id) {
    const team = this.teams[teamIndex], st = team.tactics[id], def = TACTICS[id];
    if (!st || !def || !def.active) return { ok: false, reason: 'tactique indisponible' };
    if (def.plan && !this.map.def.voies) return { ok: false, reason: 'pas de voies sur cette carte' };
    if (st.uses <= 0) return { ok: false, reason: 'plus d\'utilisation' };
    if (this.t < st.cooldownUntil) return { ok: false, reason: `recharge (${(st.cooldownUntil - this.t).toFixed(0)} s)` };
    if (this.over) return { ok: false, reason: 'bataille terminée' };
    const alive = team.units.filter(u => u.alive); if (!alive.length) return { ok: false, reason: 'aucun opérateur' };
    return { ok: true };
  };
  Battle.prototype.teamKnownEnemies = function (team) {
    const out = {};
    for (const u of team.units) if (u.alive) for (const id in u.knowledge) { const k = u.knowledge[id]; if (!out[id] || k.t > out[id].t) out[id] = k; }
    return Object.values(out);
  };
  Battle.prototype.teamCentroid = function (team) {
    const a = team.units.filter(u => u.alive); return { x: a.reduce((s, u) => s + u.x, 0) / a.length, z: a.reduce((s, u) => s + u.z, 0) / a.length };
  };
  Battle.prototype.useTactic = function (teamIndex, id) {
    const can = this.canUseTactic(teamIndex, id); if (!can.ok) return can;
    const team = this.teams[teamIndex], st = team.tactics[id], def = TACTICS[id];
    st.uses--; st.used++; st.cooldownUntil = this.t + (def.cooldown || 0);
    if (def.plan) this.replan(teamIndex, id);   // plan de voies : les survivants sont redistribués selon ce plan
    this.logEvent('tactic', `${team.name} : ${def.name}.`, { team: teamIndex, tactic: id });
    return { ok: true };
  };
  Battle.prototype.updateTactics = function () {
    // fumées : expiration
    if (this.map.dynamic.length) for (let i = this.map.dynamic.length - 1; i >= 0; i--) if (this.t >= this.map.dynamic[i].until) this.map.dynamic.splice(i, 1);
    // Secouriste : soigne les alliés proches qui ne sont plus pris à partie (4 s), jusqu'à 70 %
    if (this.tick % 5 === 0) for (const m of this.units) {
      if (!m.alive || !has(m, 'medic') || m.suppression > 0.6 || this.t < m.blindUntil) continue;
      for (const a of this.teams[m.team].units) {
        if (a === m || !a.alive || this.t - a.lastHitAt < 4 || a.hp >= a.maxHp * 0.7 || Math.hypot(a.x - m.x, a.z - m.z) > 5) continue;
        const h = Math.min(1.5 * DT * 5, a.maxHp * 0.7 - a.hp); a.hp += h; a.stats.healed += h; m.stats.medic = (m.stats.medic || 0) + h;
        a.status = a.hp <= a.maxHp * 0.2 ? 'critical' : (a.hp <= a.maxHp * 0.5 ? 'wounded' : 'ok');
      }
    }
  };
  // tactiques actives jouées par l'IA : aucune pour l'instant (la seule tactique, le Tiroir, est passive)
  Battle.prototype.autoTactics = function () {};
  // Dégâts hors tir direct (obus) : même comptabilité que les tirs, attribués à l'équipe
  // ---- À terre / relevé -----------------------------------------------------------------------------------------
  // Un opérateur mis hors de combat autrement que d'une balle dans la tête a 55 % de chances d'être seulement « à terre » :
  // pendant 20 s, un allié qui ne voit aucun ennemi peut le rejoindre et le relever (4 s ; Secouriste : 2 s, et de plus loin).
  // Relevé une seule fois par bataille, avec 30 % de sa vie, accroupi et encore secoué. Les neutralisations restent comptées.
  Battle.prototype.maybeBleed = function (e, cause) {
    if (cause === 'tête' || e.revived || !this.rng.chance(0.55)) { e.bleedUntil = 0; return false; }
    e.bleedUntil = this.t + 20; e.rescue = null; return true;
  };
  // ---- Moral : voir tomber deux camarades proches en peu de temps, face à plusieurs ennemis, peut ébranler un opérateur ----
  // (test de sang-froid, au plus une fois toutes les 20 s ; Meneur proche et Sang-froid protègent). Ébranlé 5 s : il se met
  // à couvert vers l'arrière et ne tire que s'il voit sa cible ; il ne lance pas de grenade.
  Battle.prototype.noteLoss = function (e) { const t = this.teams[e.team]; t.losses = (t.losses || []).concat([{ t: this.t, x: e.x, z: e.z }]).slice(-8); };
  Battle.prototype.moraleCheck = function (u, threats) {
    if (this.t < (u.nextMorale || 0) || threats.length < 2) return false;
    const losses = (this.teams[u.team].losses || []).filter(l => this.t - l.t < 10 && Math.hypot(l.x - u.x, l.z - u.z) < 20).length;
    if (losses < 2 && !(losses >= 1 && u.hp < u.maxHp * 0.5 && threats.length >= 3)) return false;   // deux camarades tombés, ou un seul quand on est blessé face à trois
    u.nextMorale = this.t + 20;
    let p = 0.5 * (1 - u.def.composure / 110); if (this.nearLeader(u)) p *= 0.4; if (has(u, 'steady')) p *= 0.5; if (has(u, 'leader')) p = 0;
    if (!this.rng.chance(p)) return false;
    u.shakenUntil = this.t + 5; u.stats.shaken = (u.stats.shaken || 0) + 1;
    this.logEvent('shaken', `${u.callsign} est ébranlé et décroche à couvert.`, { unit: u.id, team: u.team });
    return true;
  };
  // ---- Décor destructible : les caisses et palettes proches d'une explosion cèdent (chance p) ; les cases se libèrent,
  // la vue passe, ceux qui s'y abritaient sont à découvert ----
  Battle.prototype.blastDecor = function (x, z, reach, p) {
    for (const o of this.map.obstacles.slice()) {
      if (!this.map.isDestructible(o)) continue;
      const d = Math.hypot(Math.max(o.x - x, 0, x - (o.x + o.w)), Math.max(o.z - z, 0, z - (o.z + o.d)));
      if (d > reach || (p < 1 && !this.rng.chance(p))) continue;
      this.map.removeObstacle(o);
      this.logEvent('decor', `Les ${o.name} volent en éclats.`, { silent: false });
      this.emit({ type: 'destroyed', obstacle: o, x: o.x + o.w / 2, z: o.z + o.d / 2, w: o.w, d: o.d, h: o.h });
      for (const u of this.units) if (u.post && Math.hypot(u.post.x - (o.x + o.w / 2), u.post.z - (o.z + o.d / 2)) < 2.5) u.post = null;   // poste perdu
    }
  };
  Battle.prototype.unitById = function (id) { return this.units.find(x => x.id === id); };
  Battle.prototype.downedToRevive = function (u) {
    const reach = has(u, 'medic') ? 30 : 16; let best = null, bd = reach;
    for (const a of this.teams[u.team].units) {
      if (a.alive || a === u || !(a.bleedUntil > this.t + 3)) continue;
      if (a.rescue && a.rescue.by !== u && a.rescue.by.alive && this.t - a.rescue.t < 1) continue;   // un autre y va déjà
      const d = dist2(u, a); if (d < bd) { bd = d; best = a; }
    }
    return best;
  };
  Battle.prototype.updateRevives = function () {
    // un blessé à terre ne bouge plus : c'est aux alliés de venir le relever
    for (const u of this.units) {
      if (!u.reviving) continue;
      const a = this.unitById(u.reviving.id);
      if (!u.alive || !a || a.alive || this.t > a.bleedUntil || dist2(u, a) > 1.6) { u.reviving = null; if (u.alive) u.state = 'idle'; continue; }
      if (this.t < u.reviving.until) continue;
      u.reviving = null; u.state = 'idle'; u.stats.revives++;
      a.alive = true; a.revived = true; a.bleedUntil = 0; a.rescue = null; a.hp = Math.round(a.maxHp * 0.3); a.status = 'critical';
      a.stance = 'crouch'; a.suppression = 0.5; a.state = 'idle'; a.target = null; a.visible = new Set(); a.lastHitAt = this.t;
      this.logEvent('revive', `${u.callsign} relève ${a.callsign} (${Math.round(a.hp)} PV).`, { unit: u.id, team: u.team });
      this.emit({ type: 'revive', unit: a.id, by: u.id });
    }
  };
  Battle.prototype.applyDamage = function (shooter, e, dmg, cause, teamIndex) {
    e.hp = Math.max(0, e.hp - dmg); e.lastHitAt = this.t; e.stats.damageTaken += dmg;
    const team = this.teams[teamIndex];
    const friendly = !!shooter && shooter.team === e.team;      // tir ami (éclats) : ni crédit ni neutralisation comptée
    if (shooter && !friendly) { shooter.stats.damageDealt += dmg; e.hitBy[shooter.id] = this.t; }
    if (e.hp <= 0) {
      e.alive = false; e.status = 'down'; e.downAt = this.t; e.target = null; this.stop(e); e.stance = 'crouch'; e.visible = new Set();
      const bleeding = this.maybeBleed(e, cause); this.noteLoss(e);
      this.logEvent('down', `${e.callsign} est ${bleeding ? 'à terre' : 'hors de combat'} (${cause}${shooter ? ' — ' + shooter.callsign : ''}).`, { team: teamIndex, enemy: e.id, dmg, loc: cause, unit: shooter && !friendly ? shooter.id : null });
      this.emit({ type: 'down', unit: e.id });
      if (shooter && !friendly) { shooter.stats.kills++; if (this.t - shooter.lastKillAt < 10) shooter.stats.streaks++; shooter.lastKillAt = this.t; e.downedBy = shooter; }
      else if (!friendly) team.indirectKills = (team.indirectKills || 0) + 1;
      if (!friendly) team.indirectDamage = (team.indirectDamage || 0) + dmg;
      return;
    }
    if (!friendly) team.indirectDamage = (team.indirectDamage || 0) + dmg;
    e.status = e.hp <= e.maxHp * 0.2 ? 'critical' : (e.hp <= e.maxHp * 0.5 ? 'wounded' : 'ok');
    this.logEvent('hit', `${e.callsign} est touché par un ${cause} : −${dmg} PV.`, { team: teamIndex, enemy: e.id, dmg, loc: cause, unit: null });
  };

  // ---- Tir de suppression (appui) : arroser un couvert bas derrière lequel un ennemi vient de se cacher ------------
  // Conditions : rôle appui, position vue il y a moins de 2 s, l'ennemi est bien là (± 1 m), et le rayon vers sa poitrine
  // n'est bloqué que par un couvert bas (les balles claquent dans le couvert : pas de dégâts, mais suppression).
  Battle.prototype.canSuppress = function (u, e) {
    if (u.role.id !== 'support' || u.reloading > 0 || u.ammo < 20) return false;
    const k = u.knowledge[e.id]; if (!k || this.t - k.t > 2 || Math.hypot(k.x - e.x, k.z - e.z) > 1.2) return false;
    const d = dist2(u, e); if (d > u.weapon.range * 1.1 || d < 6) return false;
    if (this.allyInLine(u, e)) return false;
    const blk = this.map.blocker(u.x, u.eyeY(), u.z, e.x, e.chestY(), e.z);
    return !!blk && blk.kind === 'cover' && this.map.hasLOS(u.x, u.eyeY(), u.z, e.x, 1.6, e.z);
  };
  Battle.prototype.suppressAt = function (u, e) {
    if (u.aimTimer > 0) { u.aimTimer -= DT; return; }
    u.fireAcc += DT * u.weapon.rpm / 60 * 0.6; // rafales courtes
    while (u.fireAcc >= 1 && u.ammo > 0) {
      u.fireAcc -= 1; u.ammo--; u.stats.shots++; u.stats.suppressShots = (u.stats.suppressShots || 0) + 1; u.lastShotAt = this.t; this.lastShotTime = this.t;
      e.lastShotBy = u; e.lastShotByAt = this.t;
      e.suppression = clamp(e.suppression + u.weapon.suppress * 0.8, 0, 1);
      const to = { x: e.x + this.rng.gauss() * 0.6, y: 0.9 + this.rng.gauss() * 0.3, z: e.z + this.rng.gauss() * 0.6 };
      this.emit({ type: 'shot', shooter: u.id, target: e.id, from: { x: u.x, y: u.eyeY() - 0.15, z: u.z }, to, hit: false, suppressive: true });
    }
    if (this.t - (u.lastSuppressLog || -99) > 8) { u.lastSuppressLog = this.t; this.logEvent('suppress', `${u.callsign} arrose le couvert de ${e.callsign} (tir de suppression).`, { unit: u.id, team: u.team }); }
    if (u.ammo === 0 && u.mags > 0) this.startReload(u);
  };

  // ---- Tir -----------------------------------------------------------------------------
  // « Calé » : ordre Tenir, immobile à son poste depuis au moins 3 s (bonus de précision et silhouette réduite).
  Battle.prototype.isBraced = function (u) {
    if (!u.alive || u.moving) return false;
    const need = 3;
    const still = this.t - (u.stillSince === undefined ? this.t : u.stillSince) >= need;
    if (has(u, 'ambusher') && still) return true;                 // Affût : position préparée quel que soit l'ordre
    return this.teams[u.team].order === 'hold' && still && u.post && Math.hypot(u.post.x - u.x, u.post.z - u.z) < 1.6;
  };
  // Un allié « Meneur » en état à moins de 12 m ?
  // ---- Synergies d'escouade : vraies si une source (autre que u) est debout dans l'équipe et que u est une cible ----------
  const matchSpec = (u, spec) => {
    const okRole = spec.role === undefined ? null : [].concat(spec.role).includes(u.role.id);
    const okTrait = spec.trait === undefined ? null : [].concat(spec.trait).some(t => has(u, t));
    return okRole === true || okTrait === true;
  };
  const nationOf = (def) => { const m = /\(([^)]+)\)/.exec(def.unit || ''); return m ? m[1] : null; };
  Battle.prototype.synergy = function (u, id) {
    const sy = SYNERGY_BY_ID[id]; if (!sy) return false;
    if (sy.target.nation) { const n = nationOf(u.def); return !!n && this.teams[u.team].units.some(a => a !== u && a.alive && nationOf(a.def) === n); }   // Frères d'armes
    if (!matchSpec(u, sy.target)) return false;
    for (const a of this.teams[u.team].units) if (a !== u && a.alive && matchSpec(a, sy.source)) return true;
    return false;
  };
  Battle.prototype.activeSynergies = function (teamIndex) {
    const out = [];
    for (const sy of SYNERGIES) { const tg = this.teams[teamIndex].units.filter(u => u.alive && this.synergy(u, sy.id)); if (tg.length) out.push({ id: sy.id, name: sy.name, targets: tg.map(u => u.callsign) }); }
    return out;
  };
  Battle.prototype.nearLeader = function (u) {
    for (const a of this.alliesOf(u)) if (a.alive && has(a, 'leader') && Math.hypot(a.x - u.x, a.z - u.z) < 12) return true;
    return false;
  };
  // Seuil de chance de toucher en dessous duquel on ne gaspille pas ses munitions (l'appui tire plus volontiers : suppression).
  Battle.prototype.fireThreshold = function (u) { return u.role.id === 'support' ? 0.045 : 0.08; };
  Battle.prototype.hitChance = function (u, e, d, asIfStill) {
    const w = u.weapon;
    let p = w.accuracy * (0.45 + 0.55 * u.def.marksmanship / 100);
    const r = d / w.range;
    let f;
    if (r <= 0.5) f = 1; else if (r <= 1) f = 1 - (r - 0.5) * 1.2; else f = Math.max(0.08, 0.4 - (r - 1) * 0.6);
    p *= f;
    if (d < w.minRange) p *= 0.5;
    if (d > 15) p *= this.cond.acc;                                                   // nuit, brouillard, pluie : tir lointain moins sûr
    if (u.moving && !asIfStill) p *= u.att.poignee ? 0.66 : 0.55;                        // accessoire : poignée
    if (u.att.lunette && d > 25) p *= 1.12; else if (u.att.holo && d < 25) p *= 1.06;    // accessoire : optique
    if (u.stance === 'crouch') p *= 1.1;
    p *= 1 - 0.6 * u.suppression * (1 - u.def.composure / 150);
    const hard = has(u, 'hardened') ? 0.5 : 1;                                       // Endurci
    if (u.status === 'wounded') p *= 1 - 0.15 * hard; else if (u.status === 'critical') p *= 1 - 0.35 * hard;
    if (this.isBraced(u)) p *= 1.1;           // position préparée : arme calée, repères pris
    if (has(u, 'patience') && u.burst === 0 && u.aimFull) p *= 1.25;               // Patience : premier tir posé
    if (this.synergy(u, 'guidage')) p *= 1.08;                                        // synergie Guidage radio
    if (e.moving) p *= has(u, 'opportunity') ? 0.9 : 0.8;                             // Tir d'opportunité
    if (e.stance === 'crouch') p *= 0.85;
    if (this.isBraced(e)) p *= 0.9;           // un défenseur installé expose moins de silhouette
    if (w.rpm > 100) p *= 1 - (has(u, 'gunner') ? 0.03 : 0.06) * (u.att.compensateur ? 0.6 : 1) * Math.min(u.burst, 5);   // Tir soutenu, compensateur
    // à bout portant on ne rate (presque) plus : sous 10 m, la chance remonte fortement vers 95 % (×0,85 de l'écart à 1 m,
    // ×0,59 à 3 m, ×0,35 à 5 m, rien à 10 m et au-delà). La portée lointaine reste incertaine.
    const close = clamp(1 - d / 10, 0, 1);
    if (close > 0) p += (0.95 - p) * Math.pow(close, 1.5);
    if (this.t < u.blindUntil) p *= 0.25;                                             // aveuglé
    const cv = this.map.coverFrom(e.x, e.z, u.x, u.z, e.stance === 'stand');
    if (cv) p *= cv.level === 'partial' ? 0.55 : 0.3; // couvert partiel (Retranchement : ×0,5)
    return { p: clamp(p, 0.03, 0.95), cover: cv };
  };
  Battle.prototype.fireAt = function (u, e) {
    if (u.reloading > 0) return;
    if (u.ammo <= 0) return;
    if (u.aimTimer > 0) { u.aimTimer -= DT; return; }
    if (this.t < (u.burstPauseUntil || 0)) return;   // entre deux rafales : on reprend la visée (et on se baisse derrière un couvert)
    const d = dist2(u, e);
    // sans ligne de vue sur la poitrine, pas de tir (la perception l'a vérifié ce pas-ci, on re-vérifie par sécurité)
    if (!this.canSee(u, e)) return;
    if (this.allyInLine(u, e)) { u.fireAcc = Math.min(u.fireAcc, 0.99); u.blockedAt = this.t; return; }   // un allié devant : on ne tire pas
    if (this.hitChance(u, e, d).p < this.fireThreshold(u)) { u.fireAcc = Math.min(u.fireAcc, 0.99); return; }
    u.fireAcc += DT * u.weapon.rpm / 60;
    while (u.fireAcc >= 1 && u.ammo > 0) {
      u.fireAcc -= 1;
      this.shoot(u, e, d);
    }
    // rafales contrôlées : 4 à 8 coups puis une courte pause, le recul retombe (armes automatiques)
    if (u.weapon.rpm > 100 && u.burst >= (u.burstLen || 6) && u.ammo > 0) { u.burstPauseUntil = this.t + 0.3 + this.rng.next() * 0.35; u.burst = 0; u.burstLen = 4 + Math.floor(this.rng.next() * 5); u.fireAcc = 0; }
    if (u.ammo === 0 && u.mags > 0) this.startReload(u);
  };
  Battle.prototype.shoot = function (u, e, d) {
    u.ammo--; u.stats.shots++; u.lastShotAt = this.t; this.lastShotTime = this.t; u.burst++; u.aimHistory[e.id] = this.t;
    e.lastShotBy = u; e.lastShotByAt = this.t;
    const { p, cover } = this.hitChance(u, e, d);
    const hit = this.rng.chance(p);
    const from = { x: u.x, y: u.eyeY() - 0.15, z: u.z };
    let to;
    if (hit) {
      to = { x: e.x, y: e.chestY(), z: e.z };
      this.applyHit(u, e, d);
    } else {
      // la balle passe près : suppression (moindre si la cible est à couvert ou si le tir est lointain)
      const far = d > u.weapon.range ? 0.5 : 1;
      e.suppression = clamp(e.suppression + u.weapon.suppress * 0.55 * (cover ? 0.7 : 1) * far * (has(u, 'gunner') ? 1.2 : 1), 0, 1);
      const spread = 0.4 + d * 0.03;
      to = { x: e.x + this.rng.gauss() * spread, y: e.chestY() + this.rng.gauss() * 0.5, z: e.z + this.rng.gauss() * spread };
      // balle perdue : un autre adversaire collé à la ligne de tir (à côté de la cible ou derrière elle) peut la prendre
      const v = this.strayVictim(u, e, d);
      if (v) { this.emit({ type: 'shot', shooter: u.id, target: v.id, from, to: { x: v.x, y: v.chestY(), z: v.z }, hit: true, stray: true }); this.applyHit(u, v, dist2(u, v), true); return; }
    }
    this.emit({ type: 'shot', shooter: u.id, target: e.id, from, to, hit });
  };
  // Balle perdue (tir manqué) : parmi les ADVERSAIRES du tireur autres que la cible (jamais un allié : pas de tir ami), le
  // premier qui se tient à moins de 0,5 m de la trajectoire, à hauteur de la cible ou au-delà (jusqu'à 25 m derrière), sans
  // obstacle entre le tireur et lui. Chance 30 à 50 % selon qu'il frôle ou coupe la trajectoire. Plus une escouade est
  // groupée, plus les tirs manqués sur l'un touchent l'autre.
  Battle.prototype.strayVictim = function (u, e, d) {
    if (d < 1e-6) return null;
    const dx = (e.x - u.x) / d, dz = (e.z - u.z) / d;
    let best = null, bt = Infinity;
    for (const c of this.teams[e.team].units) {
      if (c === e || !c.alive) continue;
      const rx = c.x - u.x, rz = c.z - u.z, t = rx * dx + rz * dz;
      if (t < d - 1.2 || t > d + 25) continue;
      const off = Math.abs(rx * dz - rz * dx); if (off >= 0.5) continue;
      if (t < bt) { bt = t; best = { c, off }; }
    }
    if (!best) return null;
    const c = best.c;
    if (!this.map.hasLOS(u.x, u.eyeY() - 0.15, u.z, c.x, c.chestY(), c.z)) return null;   // le couvert arrête la balle
    if (!this.rng.chance(0.3 + 0.2 * (1 - best.off / 0.5))) return null;
    u.stats.strays = (u.stats.strays || 0) + 1;
    return c;
  };
  Battle.prototype.applyHit = function (u, e, d, stray) {
    const w = u.weapon;
    const r = d / w.range;
    let fall = r <= 0.3 ? 1 : (r <= 1 ? 1 - (r - 0.3) / 0.7 * (1 - w.falloff) : Math.max(0.3 * w.falloff, w.falloff - (r - 1) * 0.7 * w.falloff));
    const roll = this.rng.next();
    let loc, mult, prot;
    const headP = 0.08;
    if (roll < headP) { loc = 'tête'; mult = 2.2; prot = e.armor.head; }
    else if (roll < 0.60) { loc = 'torse'; mult = 1.0; prot = e.armor.torso; }
    else { loc = 'membre'; mult = 0.55; prot = 0; }
    let dmg = w.damage * fall * mult * (1 - prot) * this.rng.range(0.85, 1.15);
    if (has(u, 'breach') && d < 10 && (w.cls === 'brèche' || w.cls === 'pm')) dmg *= 1.15;   // Enfonceur
    if (this.synergy(e, 'commandement')) dmg *= 0.9;                                                   // synergie Commandement
    dmg = Math.round(dmg * 10) / 10;
    const before = e.hp;
    e.hp = Math.max(0, e.hp - dmg);
    e.lastHitAt = this.t; e.suppression = clamp(e.suppression + w.suppress * 1.2, 0, 1);
    u.stats.hits++; u.stats.damageDealt += dmg; e.stats.damageTaken += dmg; if (loc === 'tête') u.stats.headshots++;
    e.hitBy[u.id] = this.t;
    const absorbed = Math.round(w.damage * fall * mult * prot * 10) / 10;
    let text = stray ? `Balle perdue : ${u.callsign} manque sa cible et touche ${e.callsign} (${loc}, ${d.toFixed(0)} m) : −${dmg} PV` : `${u.callsign} touche ${e.callsign} (${loc}, ${d.toFixed(0)} m) : −${dmg} PV`;
    if (absorbed > 0) text += ` (${absorbed} absorbés : ${e.armor.name})`;
    const prevStatus = e.status;
    if (e.hp <= 0) {
      e.alive = false; e.status = 'down'; e.downAt = this.t; e.target = null; this.stop(e); e.stance = 'crouch'; e.visible = new Set();
      const bleeding = this.maybeBleed(e, loc); this.noteLoss(e);
      u.stats.kills++;
      // « spéciaux » : série (deux neutralisations à moins de 10 s), revanche (celui qui a mis un allié hors de combat), vétéran (niveau supérieur)
      if (this.t - u.lastKillAt < 10) u.stats.streaks++;
      // de groupe : au moins un autre allié avait touché la cible dans les 5 dernières secondes (tir croisé, travail d'équipe)
      if (Object.keys(e.hitBy).some(id => id !== u.id && this.t - e.hitBy[id] <= 5)) u.stats.group++;
      u.lastKillAt = this.t;
      if (this.alliesOf(u).some(a => !a.alive && a.downedBy === e)) u.stats.revenge++;
      if ((e.def.level || 0) > (u.def.level || 0)) u.stats.veteran++;
      e.downedBy = u;
      text += bleeding ? ` — ${e.callsign} est à terre (un allié peut le relever).` : ` — ${e.callsign} est hors de combat.`;
      this.logEvent('down', text, { unit: u.id, enemy: e.id, team: u.team, dmg, loc, stray: !!stray });
      this.emit({ type: 'down', unit: e.id });
      return;
    }
    e.status = e.hp <= e.maxHp * 0.2 ? 'critical' : (e.hp <= e.maxHp * 0.5 ? 'wounded' : 'ok');
    if (e.status !== prevStatus) text += e.status === 'critical' ? ` — ${e.callsign} est gravement blessé.` : ` — ${e.callsign} est blessé.`;
    this.logEvent('hit', text, { unit: u.id, enemy: e.id, team: u.team, dmg, loc, hpBefore: before, hpAfter: e.hp, stray: !!stray });
  };

  // ---- Fin de bataille -----------------------------------------------------------------
  Battle.prototype.checkEnd = function () {
    const alive = this.teams.map(t => t.units.filter(u => u.alive).length);
    let winner = null, reason = null;
    if (alive[0] === 0 && alive[1] === 0) { winner = -1; reason = 'Les deux équipes sont hors de combat.'; }
    else if (alive[0] === 0) { winner = 1; reason = `${this.teams[0].name} est entièrement neutralisée.`; }
    else if (alive[1] === 0) { winner = 0; reason = `${this.teams[1].name} est entièrement neutralisée.`; }
    else if (this.zone && this.teams.some(t => t.capture >= 100)) {
      winner = this.teams[0].capture >= 100 ? 0 : 1; reason = `${this.teams[winner].name} a sécurisé la zone (100 %).`;
    }
    else if (this.zone && this.t >= this.timeLimit && Math.abs(this.teams[0].capture - this.teams[1].capture) >= 5) {
      winner = this.teams[0].capture > this.teams[1].capture ? 0 : 1;
      reason = `Temps écoulé : ${this.teams[winner].name} contrôle davantage la zone (${Math.round(this.teams[winner].capture)} % contre ${Math.round(this.teams[1 - winner].capture)} %).`;
    }
    else if (this.objective.type === 'hold' && this.t >= this.objective.duration) {
      winner = this.objective.team; reason = `Temps écoulé : ${this.teams[winner].name} a tenu la position (${alive[winner]} opérateur${alive[winner] > 1 ? 's' : ''} en état).`;
    }
    else if (this.t >= this.timeLimit || (this.t - this.lastShotTime > 60 && this.units.every(u => !u.alive || u.totalAmmo() === 0))) {
      reason = this.t >= this.timeLimit ? 'Temps écoulé.' : 'Plus personne ne peut tirer.';
      if (alive[0] !== alive[1]) { winner = alive[0] > alive[1] ? 0 : 1; reason += ` ${this.teams[winner].name} garde plus d'opérateurs en état de combattre.`; }
      else {
        const hp = this.teams.map(t => t.units.reduce((s, u) => s + (u.alive ? u.hp / u.maxHp : 0), 0));
        if (Math.abs(hp[0] - hp[1]) > 0.3) { winner = hp[0] > hp[1] ? 0 : 1; reason += ` ${this.teams[winner].name} est en meilleur état.`; }
        else { winner = -1; reason += ' Égalité.'; }
      }
    }
    if (reason === null) return;
    this.over = true;
    this.result = this.computeResult(winner, reason);
    this.logEvent('end', winner === -1 ? `Fin de l'engagement : égalité. ${reason}` : `Fin de l'engagement : victoire de ${this.teams[winner].name}. ${reason}`, { winner });
  };
  // L'écran de résultat est calculé à partir de l'état réel des unités (compteurs incrémentés lors des événements).
  Battle.prototype.computeResult = function (winner, reason) {
    return {
      winner, reason, duration: this.t, seed: this.seed, map: this.map.name,
      teams: this.teams.map(t => ({
        name: t.name, order: ORDERS[t.order].name, orderId: t.order, capture: Math.round(t.capture || 0),
        alive: t.units.filter(u => u.alive).length,
        hpPct: Math.round(100 * t.units.reduce((s, u) => s + (u.alive ? u.hp : 0), 0) / t.units.reduce((s, u) => s + u.maxHp, 0)),
        kills: t.units.reduce((s, u) => s + u.stats.kills, 0) + (t.indirectKills || 0),
        specials: { headshots: t.units.reduce((s, u) => s + u.stats.headshots, 0), streaks: t.units.reduce((s, u) => s + u.stats.streaks, 0), revenge: t.units.reduce((s, u) => s + u.stats.revenge, 0), veteran: t.units.reduce((s, u) => s + u.stats.veteran, 0), group: t.units.reduce((s, u) => s + u.stats.group, 0) },
        tactics: Object.keys(t.tactics || {}).map(id => ({ id, used: t.tactics[id].used })),
        shots: t.units.reduce((s, u) => s + u.stats.shots, 0), hits: t.units.reduce((s, u) => s + u.stats.hits, 0),
        units: t.units.map(u => ({
          id: u.id, callsign: u.callsign, role: u.role.name, weapon: u.weapon.name, armor: u.armor.name, unit: u.def.unit,
          hp: Math.round(u.hp), maxHp: Math.round(u.maxHp), status: u.status, alive: u.alive,
          ammoLeft: u.totalAmmo(), stats: Object.assign({}, u.stats, { damageDealt: Math.round(u.stats.damageDealt), damageTaken: Math.round(u.stats.damageTaken), distance: Math.round(u.stats.distance), timeSuppressed: Math.round(u.stats.timeSuppressed) }),
          accuracy: u.stats.shots ? Math.round(100 * u.stats.hits / u.stats.shots) : 0,
        })),
      })),
    };
  };

  // Un instantané léger pour l'affichage.
  Battle.prototype.snapshot = function () {
    return {
      t: this.t, over: this.over,
      zone: this.zone ? { x: this.zone.x, z: this.zone.z, r: this.zone.r, holder: this.zone.holder, contested: this.zone.contested, capture: this.teams.map(t => t.capture) } : null,
      units: this.units.map(u => ({ id: u.id, team: u.team, callsign: u.callsign, role: u.role.id, throwing: !!u.throwing, blind: this.t < u.blindUntil, x: u.x, z: u.z, facing: u.facing, stance: u.stance, hp: u.hp, maxHp: u.maxHp, status: u.status, alive: u.alive, ammo: u.ammo, mags: u.mags, reloading: u.reloading, state: u.state, suppression: u.suppression, moving: u.moving, target: u.target ? u.target.id : null, visible: u.visible.size, weapon: u.weapon.id, voie: u.voie, flankDone: !!u.flankDone })),
      teams: this.teams.map(t => ({ plan: t.plan || null, rotation: t.rotation === undefined ? null : t.rotation, rotateIn: Math.max(0, (t.rotateUntil || 0) - this.t) })),
    };
  };

  root.Battle = Battle; root.Unit = Unit; root.DT = DT; root.fmtT = fmtT;
})(typeof module !== 'undefined' ? module.exports : (window.OT = window.OT || {}),
   typeof module !== 'undefined' ? Object.assign({}, require('./rng.js'), require('./data.js'), require('./map.js')) : (window.OT = window.OT || {}));
