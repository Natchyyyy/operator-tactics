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
    this.grenades.smoke = 1;   // un fumigène chacun : il sert à couvrir l'évacuation d'un blessé (voir tryDrag)
    if (/GIGN/.test(def.unit || '') && !this.grenades.flash) this.grenades.flash = 1;   // une incapacitante par opérateur de l'unité d'intervention (décision 6)
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
    // sprint : assaut sur un adversaire, repli ; course vers un couvert sous la menace (vu, pris pour cible, touché, à
    // découvert sous les yeux d'une position ennemie connue — voir act()) : on ne marche pas jusqu'à l'abri sous le feu
    if (this.state === 'dragging') v *= DRAG.speed;   // évacuation : il tire un blessé à reculons
    else if (this.state === 'closing' || this.state === 'retreat' || this.state === 'rush' || this.state === 'crossing' || this.state === 'evade' || this.state === 'todrag' || this.dash) v *= 1.2;   // (evade : loin d'une grenade)   // rush : ordre de déplacement « agressif »
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
    this.timeLimit = opts.timeLimit || 420;
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
    for (const team of this.teams) this.capGrenades(team);   // deux grenades au plus par équipe, dont un fumigène
    // Tiroir : deux moitiés d'escouade en alternance (le tireur d'élite reste en appui, hors des bonds)
    for (const team of this.teams) { let k = 0; for (const u of team.units) u.boundGroup = u.role.id === 'marksman' ? -1 : (k++ % 2); team.bound = { group: 0, since: 0, n: 0 }; }
    for (const team of this.teams) { if (this.hasTactic(team, 'tiroir_lent')) this.lentHalves(team, team.units); this.initScout(team); }
    this.assignLanes();
    this.placeUnits();
    for (const team of this.teams) if (team.auto) this.initKarst(team);   // plans de l'adversaire (vague 2)
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
    const r = this.applyCommand(type, team, arg);
    if (r && r.ok) this.inputs.push({ tick: this.tick, type, team, arg });
    return r;
  };
  Battle.prototype.applyCommand = function (type, team, arg) {
    return type === 'tactic' ? this.useTactic(team, arg) : type === 'order' ? { ok: this.setOrder(team, arg) } : type === 'rotate' ? this.rotate(team, arg) : type === 'tenir' ? this.holdKeyPosition(team, arg && arg.pos, arg && arg.units) : type === 'aller' ? this.moveOrder(team, arg) : type === 'orienter' ? this.orientOrder(team, arg) : type === 'feu' ? this.releaseFire(team, arg) : type === 'grenade' ? this.grenadeOrder(team, arg) : type === 'lampadaire' ? this.lampOrder(team, arg) : type === 'secourir' ? this.rescueOrder(team, arg) : { ok: false };
  };
  Battle.prototype.step = function () {
    if (this.over) return;
    if (this.replayQueue) while (this.replayQueue.length && this.replayQueue[0].tick === this.tick) {   // revoir : mêmes commandes au même pas
      const c = this.replayQueue.shift(); this.applyCommand(c.type, c.team, c.arg); this.inputs.push(c);
    }
    this.t = Math.round((this.t + DT) * 1000) / 1000; this.tick++;
    this.updateTactics();
    this.updateTiroir();
    this.updateMoveGroups();   // ordres de déplacement « méthodiques » : bonds par groupe
    this.updateFreinage();     // arrivée « freinage » : décrocher sur la 2e ligne quand ça chauffe
    if (this.tick % 10 === 5) this.updateKarst();   // plans de l'adversaire : une fois par seconde
    if (this.tick % 10 === 0) this.teamMemo();
    for (const u of this.units) if (u.alive) this.perceive(u);
    if (Math.abs((this.t % COMMS_EVERY)) < DT / 2 || (this.t % COMMS_EVERY) > COMMS_EVERY - DT / 2) this.comms();
    // ordre de traitement mélangé à chaque pas : aucune équipe n'a l'avantage d'agir toujours la première
    const order = this.units.slice();
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(this.rng.next() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    for (const u of order) {
      if (!u.alive) continue;
      const phase = (this.t + u.decideOffset) % DECIDE_EVERY;
      // réaction immédiate (sans attendre la prochaine décision) : un ennemi qu'on ne voyait pas vient d'apparaître, ou les
      // premières balles claquent autour de soi
      let urgent = false;
      if (phase >= DT - 1e-6) {
        for (const id of u.visible) if (!u.seenPrev || !u.seenPrev.has(id)) { urgent = true; break; }
        if (u.firstShotAt !== undefined && u.firstShotAt > (u.urgentDone === undefined ? -99 : u.urgentDone)) urgent = true;
      }
      if (u.firstShotAt !== undefined) u.urgentDone = u.firstShotAt;
      u.seenPrev = u.visible;
      if (phase < DT - 1e-6 || urgent) { this.decide(u); this.contactWatch(u); this.hintWatch(u); }
      this.act(u);
    }
    this.updateHints();
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
    if (th.kind === 'smoke') this.logEvent('smoke', `${u.callsign} : « Fumigène ! »`, { unit: u.id, team: u.team });
    else this.logEvent('grenade', `${u.callsign} lance une ${G.name} vers ${th.target}.`, { unit: u.id, team: u.team, gk: th.kind });
    this.emit({ type: 'grenade_throw', kind: th.kind, from: { x: u.x, y: 1.7, z: u.z }, to: { x, y: 0.1, z }, flight, explodeAt: g.explodeAt });
  };
  // E1 / E2 / E3 — grenade sur ordre : battle.command('grenade', équipe, { x, z, kind: 'frag' | 'flash' | 'smoke', units: [ids] | null }).
  // Parmi les opérateurs désignés, le plus proche du point qui a encore cette grenade, est libre (ni lancer, ni blessé à
  // tirer, ni aveuglé) et à portée (frag et flash : 8 à 24 m — 30 m Grenadier ; fumigène : 3 à 24 m), avec une trajectoire
  // possible, lance au point. Frag : refusée si un équipier est à moins de 5 m du point. L'IA garde ses lancers à elle.
  const GREN_RANGE = { frag: [8, 24], flash: [8, 24], smoke: [3, 24] };
  Battle.prototype.grenadeOrder = function (teamIndex, arg) {
    const team = this.teams[teamIndex]; if (!team || this.over || !arg) return { ok: false, reason: 'bataille terminée' };
    const kind = arg.kind; if (!GREN_RANGE[kind]) return { ok: false, reason: 'grenade inconnue' };
    const p = this.orderPoint(+arg.x, +arg.z); if (!p) return { ok: false, reason: 'point hors du terrain' };
    const ids = Array.isArray(arg.units) && arg.units.length ? arg.units : null;
    const us = team.units.filter(u => u.alive && (!ids || ids.includes(u.id) || ids.includes(u.def.id)));
    const G = GRENADES[kind], nom = kind === 'frag' ? 'grenade' : kind === 'flash' ? 'incapacitante' : 'fumigène';
    const withK = us.filter(u => (u.grenades[kind] || 0) > 0);
    if (!withK.length) return { ok: false, reason: `plus de ${nom}` };
    if (kind === 'frag' && team.units.some(a => a.alive && Math.hypot(a.x - p.x, a.z - p.z) < 5)) return { ok: false, reason: 'un équipier est trop près du point' };
    let best = null, bd = Infinity; const no = {};
    for (const u of withK) {
      if (u.throwing || u.drag || this.t < u.blindUntil) { no.busy = 1; continue; }
      const d = Math.hypot(p.x - u.x, p.z - u.z), [lo, hi0] = GREN_RANGE[kind], hi = kind !== 'smoke' && has(u, 'grenadier') ? 30 : hi0;
      if (d < lo) { no.near = lo; continue; }
      if (d > hi) { no.far = hi; continue; }
      if (!this.map.hasLOS(u.x, 2.3, u.z, p.x, 1.4, p.z)) { no.los = 1; continue; }
      if (d < bd) { bd = d; best = u; }
    }
    const why = no.los ? 'pas de trajectoire (un obstacle haut)' : no.near ? `trop près (${no.near} m au moins)` : no.far ? `trop loin (${no.far} m au plus)` : 'tous occupés';
    if (!best) return { ok: false, reason: why };
    const u = best; this.stop(u); u.reviving = null; u.state = 'throw'; u.stance = 'stand'; u.target = null; u.facing = Math.atan2(p.z - u.z, p.x - u.x);
    u.throwing = { at: this.t + 0.6 + (1 - u.def.reflexes / 100) * 0.4, x: p.x, z: p.z, d: bd, kind, target: 'le point désigné', ordre: true };
    this.logEvent('grenadeorder', `${team.name} : ${u.callsign} — ordre : ${G.name} sur le point désigné.`, { unit: u.id, team: teamIndex, gk: kind, silent: true });
    return { ok: true, unit: u.id, callsign: u.callsign, kind };
  };
  // Éteindre un lampadaire (ordre du joueur, « Plus… ») : le plus proche des opérateurs choisis qui voit la lampe (45 m au
  // plus) s'arrête, épaule et tire ; la lampe s'éteint. Le coup de feu s'entend et, de nuit, l'éclair le trahit.
  Battle.prototype.lampOrder = function (teamIndex, arg) {
    const team = this.teams[teamIndex]; if (!team || this.over || !arg) return { ok: false, reason: 'bataille terminée' };
    let lamp = null, ld = 6;
    for (const l of this.map.lamps) { const d = Math.hypot(l.x - arg.x, l.z - arg.z); if (l.on && d < ld) { ld = d; lamp = l; } }
    if (!lamp) return { ok: false, reason: 'aucun lampadaire allumé près du point' };
    const ids = Array.isArray(arg.units) && arg.units.length ? arg.units : null, h = this.map.lampHead(lamp);
    let best = null, bd = 45, busy = false;
    for (const u of team.units) {
      if (!u.alive || (ids && !ids.includes(u.id) && !ids.includes(u.def.id))) continue;
      if (u.throwing || u.lampShot || u.drag || u.reloading > 0 || this.t < u.blindUntil) { busy = true; continue; }
      const d = Math.hypot(h.x - u.x, h.z - u.z);
      if (d < bd && this.map.hasLOS(u.x, u.eyeY(), u.z, h.x, h.y, h.z)) { bd = d; best = u; }
    }
    if (!best) return { ok: false, reason: busy ? 'tous occupés' : 'personne ne voit la lampe (45 m au plus)' };
    const u = best; this.stop(u); u.reviving = null; u.target = null; u.stance = 'stand'; u.facing = Math.atan2(h.z - u.z, h.x - u.x);
    u.lampShot = { at: this.t + 0.5 + (1 - u.def.reflexes / 100) * 0.4, lamp: lamp.id };
    this.logEvent('lamporder', `${team.name} : ${u.callsign} — ordre : éteindre le lampadaire.`, { unit: u.id, team: teamIndex, silent: true });
    return { ok: true, unit: u.id, callsign: u.callsign };
  };
  Battle.prototype.shootLamp = function (u) {
    const l = this.map.lamps[u.lampShot.lamp]; u.lampShot = null;
    if (!u.alive || !l || !l.on || u.ammo <= 0) return;
    const h = this.map.lampHead(l);
    u.ammo--; u.stats.shots++; u.lastShotAt = this.t; this.lastShotTime = this.t;
    l.on = false;
    this.emit({ type: 'shot', shooter: u.id, target: null, from: { x: u.x, y: u.eyeY() - 0.15, z: u.z }, to: h, hit: false, lamp: l.id });
    this.emit({ type: 'lamp', id: l.id, on: false, x: l.x, z: l.z });
    this.logEvent('lampout', `${u.callsign} éteint un lampadaire : la zone est plongée dans le noir.`, { unit: u.id, team: u.team });
  };
  // Alarme de voiture : des balles dans la carrosserie la déclenchent (une fois par voiture) ; 15 s de klaxon et de feux qui
  // clignotent ; tant qu'elle sonne, on n'entend plus les pas à moins de 14 m. Plus rare (demande de l'utilisateur, 21/10) :
  // une voiture sur trois seulement a une alarme (tirage fixe par graine et par voiture, sans toucher au hasard de la bataille),
  // et une seule sonne à la fois.
  Battle.prototype.carAlarm = function (o) {
    if (!o || !/^voiture/.test(o.name || '') || (this.alarms && this.alarms.some(a => a.o === o || this.t < a.until))) return;
    const idx = this.map.obstacles.indexOf(o);
    if (((idx * 7 + this.seed * 13) >>> 0) % 3 !== 0) return;
    const x = o.x + o.w / 2, z = o.z + o.d / 2, until = this.t + 15;
    (this.alarms || (this.alarms = [])).push({ o, x, z, until });
    this.emit({ type: 'alarm', x, z, until });
    this.logEvent('alarm', 'Une alarme de voiture se déclenche.', { silent: true });
  };
  // balles dans la carrosserie : l'alarme part à la 3e (compte par voiture, sans tirage au hasard)
  Battle.prototype.carHit = function (o) {
    const h = this.carHits || (this.carHits = new Map()), n = (h.get(o) || 0) + 1; h.set(o, n);
    if (n === 3) this.carAlarm(o);
  };
  Battle.prototype.alarmNear = function (x, z) {
    return !!this.alarms && this.alarms.some(a => this.t < a.until && Math.hypot(a.x - x, a.z - z) < 14);
  };
  // E3 — « avec fumée » (Franchir, Décrocher) : le premier des opérateurs qui a encore un fumigène et une trajectoire le lance
  // entre (mx, mz) et le danger (dx, dz), à 6 m au plus de (mx, mz). Renvoie { u, ready } (nuage en place à ready), sinon null.
  Battle.prototype.coverSmoke = function (units, mx, mz, dx, dz, why) {
    const L = Math.hypot(dx - mx, dz - mz) || 1, k = Math.min(6, L * 0.5), q = this.orderPoint(mx + (dx - mx) / L * k, mz + (dz - mz) / L * k);
    if (!q) return null;
    let best = null, bd = Infinity;
    for (const u of units) {
      if (!u.alive || !((u.grenades.smoke || 0) > 0) || u.throwing || u.drag || this.t < u.blindUntil) continue;
      const d = Math.hypot(q.x - u.x, q.z - u.z); if (d < 2 || d > 24 || !this.map.hasLOS(u.x, 2.3, u.z, q.x, 1.4, q.z)) continue;
      if (d < bd) { bd = d; best = u; }
    }
    if (!best) return null;
    const u = best; this.stop(u); u.reviving = null; u.state = 'throw'; u.stance = 'stand'; u.target = null; u.facing = Math.atan2(q.z - u.z, q.x - u.x);
    u.throwing = { at: this.t + 0.5 + (1 - u.def.reflexes / 100) * 0.3, x: q.x, z: q.z, d: bd, kind: 'smoke', target: why || 'le passage' };
    return { u, ready: u.throwing.at + 0.45 + bd / 22 + GRENADES.smoke.fuse };
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
    // un abri tout proche (≤ 3,5 m) qui coupe la ligne grenade → poitrine protège mieux qu'une course à découvert
    let shelter = null, sd = 3.5;
    for (const c0 of this.map.coverPoints) {
      if (Math.abs(c0.x - u.x) > 4 || Math.abs(c0.z - u.z) > 4) continue;
      const h = this.hug(c0), d = Math.hypot(h.hx - u.x, h.hz - u.z);
      if (d < sd && !this.map.hasLOS(ev.x, 0.4, ev.z, h.hx, CHEST.stand, h.hz) && this.map.walkableSegment(u.x, u.z, h.hx, h.hz)) { sd = d; shelter = { x: h.hx, z: h.hz }; }
    }
    if (shelter) best = shelter;
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
      if (g.kind === 'smoke') {   // nuage : bloque la vue (map.dynamic, comme tout obstacle pour les rayons), pas la marche ni les balles perdues
        const R = G.radius * 0.89;   // carré de même surface que le disque affiché
        const cloud = { x: g.x - R, z: g.z - R, w: 2 * R, d: 2 * R, h: 3, kind: 'smoke', name: 'fumée', until: this.t + G.duration, team: g.team };
        this.map.dynamic.push(cloud);
        this.emit({ type: 'smoke', x: g.x, z: g.z, r: G.radius, until: cloud.until, team: g.team });
        for (const u of this.units) if (u.alive) for (const e of this.enemiesOf(u)) if (u.visible.has(e.id) && !this.canSee(u, e)) u.visible.delete(e.id);
        continue;
      }
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
          u.blindUntil = Math.max(u.blindUntil, this.t + dur); u.visible = new Set(); hits++; this.noteDanger(u, 0.6);
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
      // de nuit, sous un lampadaire allumé : on se voit presque comme de jour
      const lamp = !lit && cond.id === 'nuit' && this.map.lamps.length && this.map.litAt(e.x, e.z);
      const range = lit ? baseRange : lamp ? baseRange * 0.8 : visRange;
      if (d <= range) {
        const ang = Math.atan2(e.z - u.z, e.x - u.x);
        // (pris pour cible par lui : les balles claquent, on tourne la tête vers le tireur — même hors du champ visuel)
        const inFov = d < 7 || angDiff(ang, u.facing) < fov / 2 || u.visible.has(e.id) || (u.lastShotBy === e && this.t - u.lastShotByAt < 1.5);
        if (inFov && this.canSee(u, e)) {
          let p;
          if (u.visible.has(e.id)) p = 1;                   // on suit une cible déjà repérée
          else {
            p = 0.35 * (1 - d / range) * (0.6 + u.def.perception / 100) * (lit ? cond.flash : lamp ? 0.9 : cond.spot);
            if (e.moving) p *= 1.6;
            if (this.t - e.lastShotAt < 1.5) p *= e.weapon.silenced ? 1.6 : 3;   // éclair de bouche, bruit
            if (e.stance === 'crouch') p *= 0.6;
            if (e.peeking) p *= 0.7;                              // au coin d'un mur : on ne dépasse qu'à moitié
            // il réapparaît là où on l'a vu il y a peu (il se relève derrière sa voiture, ressort au coin) : on l'attendait
            const kn = u.knowledge[e.id];
            if (kn && kn.seen && this.t - kn.t < 6 && Math.hypot(kn.x - e.x, kn.z - e.z) < 3) p = Math.max(p * 3, 0.5);
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
              team.contactCall = { x: e.x, z: e.z, t: this.t, by: u.id };   // « Contact ! » : l'escouade tourne le regard vers lui (contactWatch)
            }
            team.lastSeen[e.id] = this.t;
          }
        }
      }
      // 2) l'ouïe : un tir ennemi récent et proche donne une position approximative (bien moins loin si l'arme est silencieuse)
      //    Vigie : tirs entendus 40 % plus loin, et les pas d'un ennemi en mouvement à moins de 12 m (sauf Fantôme)
      const hearR = (e.weapon.silenced ? 18 : 70) * (has(e, 'ghost') ? 0.7 : 1) * (has(u, 'sentinel') ? 1.4 : 1) * cond.hear;
      if (!newVisible.has(e.id) && ((this.t - e.lastShotAt < 0.25 && d < hearR) || (has(u, 'sentinel') && e.moving && d < 12 && !has(e, 'ghost') && !this.stealthy(e) && !this.alarmNear(e.x, e.z)))) {
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
  // mètres du trajet en ligne droite (u → x,z) vus depuis la menace, debout (échantillons tous les 1,5 m, départ exclu)
  const EXPO_COST = 0.9;
  Battle.prototype.pathExposure = function (u, x, z, threat) {
    const L = Math.hypot(x - u.x, z - u.z), n = Math.max(1, Math.ceil(L / 1.5)), step = L / n;
    let m = 0;
    for (let i = 1; i < n; i++) {
      const f = i / n, px = u.x + (x - u.x) * f, pz = u.z + (z - u.z) * f;
      if (this.map.hasLOS(threat.x, EYE.stand, threat.z, px, CHEST.stand, pz)) m += step;
    }
    return m;
  };
  Battle.prototype.findCover = function (u, threat, maxDist, opts) {
    opts = opts || {};
    let best = null, bestScore = -Infinity; const cands = [];
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
      // pas de demi-tour : en route vers un point (ordre), on ne recule pas vers un couvert qui en éloigne ; en marche,
      // un couvert derrière soi coûte plus cher qu'un couvert devant ou sur le côté (on ne revient pas sur ses pas)
      if (opts.notBehind && Math.hypot(cx - opts.notBehind.x, cz - opts.notBehind.z) > Math.hypot(u.x - opts.notBehind.x, u.z - opts.notBehind.z) + 1) continue;
      if (opts.heading !== undefined && d > 1) { const back = -Math.cos(Math.atan2(cz - u.z, cx - u.x) - opts.heading); if (back > 0) s -= back * d * 0.5; }
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
      // (derrière un obstacle plus haut que soi, on tire au coin : c'est aussi une position de tir, et la meilleure)
      const corner = cv.level === 'full' && !this.map.hasLOS(cx, EYE.stand, cz, threat.x, CHEST.stand, threat.z) && this.cornerOf(c0, cx, cz, threat, cv.obstacle, u);
      const canShoot = !!corner || this.map.hasLOS(cx, EYE.stand, cz, threat.x, CHEST.stand, threat.z);
      if (corner) s += 1;
      if (opts.requireShoot && !canShoot) continue;
      if (opts.flank && this.map.coverFrom(opts.flank.x, opts.flank.z, cx, cz, opts.flank.stance === 'stand')) continue; // la cible y serait encore couverte
      if (cv.level === 'partial') s += 3; else s += 1.5;
      if (canShoot) s += opts.wantShoot === false ? 0 : 4;
      // le trajet : chaque mètre couru en vue de la menace coûte plus cher qu'un mètre à l'abri (on préfère un couvert moyen
      // tout près à un bon couvert de l'autre côté de sa ligne de tir)
      if (d > 1.5 && s + 0.05 > bestScore) s -= this.pathExposure(u, cx, cz, threat) * EXPO_COST;
      s += this.rng.next() * 0.05; // départage aléatoire des ex æquo (sinon l'ordre de la liste favoriserait un côté)
      if (s > bestScore) { bestScore = s; best = { x: cx, z: cz, obstacle: h.obstacle }; cands.push(best); }
    }
    // un couvert proche à vol d'oiseau mais de l'autre côté d'une rangée de voitures ou d'un mur : le chemin en faisait le
    // tour (jusqu'à 20 m, dos à l'ennemi, en s'éloignant du couvert avant d'y revenir). On prend alors le précédent meilleur
    // (au plus trois essais) : chemin au plus ~1,8 × la distance (8 m au moins)
    for (let i = cands.length - 1, n = 0; i >= 0 && n < 3; i--) {
      const c = cands[i], dd = Math.hypot(c.x - u.x, c.z - u.z);
      if (dd < 1.5 || this.map.walkableSegment(u.x, u.z, c.x, c.z)) return c;
      n++;
      const p = this.map.findPath(u.x, u.z, c.x, c.z); if (!p) continue;
      let L = Math.hypot(p[0].x - u.x, p[0].z - u.z) + Math.hypot(c.x - p[p.length - 1].x, c.z - p[p.length - 1].z);
      for (let j = 1; j < p.length; j++) L += Math.hypot(p[j].x - p[j - 1].x, p[j].z - p[j - 1].z);
      if (L <= Math.max(8, dd * 1.8 + 2)) return c;
    }
    return null;
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
  // « raser un mur » (doctrine) : en progression (avance, bonds), le chemin longe les obstacles ; les courses d'urgence
  // (se mettre à couvert, se cacher, secourir) et la ruée de l'ordre Agressif vont au plus court
  const RASER = { advance: 1, bound: 1 };
  // Cheminer à l'abri des vues (doctrine : « progresser défilé ») : les marches d'approche, bonds et fouilles évitent les
  // cases vues depuis les positions ennemies connues de l'équipe (un détour derrière une rangée de voitures plutôt que
  // l'allée en plein milieu). Les courses vers un abri tout proche vont au plus court.
  const EXPO_KINDS = { advance: 1, bound: 1, close: 1, search: 1 }, SEEN_COST = 0.7, EXPO_STEP = 3, EXPO_RANGE = 50, EXPO_AGE = 15;
  Battle.prototype.exposureGrid = function (team) {
    const tm = this.teams[team], ks = this.teamKnownEnemies(tm).filter(k => this.t - k.t < EXPO_AGE);
    if (!ks.length) return null;
    const key = ks.map(k => Math.round(k.x / 4) + ',' + Math.round(k.z / 4)).sort().join(';');
    const E = tm.expo;
    if (E && (E.key === key || this.t - E.at < 2)) return E.g;   // (recalcul au plus toutes les 2 s, et si une position a bougé de ~4 m)
    const m = this.map, g = new Float32Array(m.cols * m.rows), S = EXPO_STEP, nx = Math.ceil(m.width / S), nz = Math.ceil(m.depth / S);
    // vue depuis une position (arrondie à 1 m) : calculée une fois, gardée (les positions ennemies reviennent souvent)
    if (this.viewCacheN !== m.obstacles.length) { this.viewCache = new Map(); this.viewCacheN = m.obstacles.length; }   // (un décor détruit : tout est à revoir)
    const vc = this.viewCache, masks = [];
    for (const k of ks) {
      const kx = Math.round(k.x), kz = Math.round(k.z), vk = kx * 1000 + kz;
      let mk = vc.get(vk);
      if (!mk) {
        mk = new Uint8Array(nx * nz);
        for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const cx = i * S + S / 2, cz = j * S + S / 2, d = Math.hypot(kx - cx, kz - cz); if (d > 3 && d < EXPO_RANGE && m.hasLOS(kx, EYE.stand, kz, cx, CHEST.stand, cz)) mk[j * nx + i] = 1; }
        if (vc.size > 300) vc.clear();
        vc.set(vk, mk);
      }
      masks.push(mk);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      if (!masks.some(mk => mk[j * nx + i])) continue;
      for (let z = j * S; z < j * S + S; z++) for (let x = i * S; x < i * S + S; x++) { const c = m.cellOf(x + 0.5, z + 0.5); if (c.c >= 0 && c.r >= 0 && c.c < m.cols && c.r < m.rows) g[c.r * m.cols + c.c] = SEEN_COST; }
    }
    tm.expo = { key, at: this.t, g };
    return g;
  };
  // coût de chemin : zones dangereuses (Karst) + cases vues de l'ennemi (selon le genre de déplacement)
  Battle.prototype.pathCost = function (u, kind) {
    const dg = this.dangerGrid(u), eg = EXPO_KINDS[kind] ? this.exposureGrid(u.team) : null;
    if (!dg || !eg) return dg || eg;
    const tm = this.teams[u.team];
    if (tm.pathCostMix && tm.pathCostMix.dg === dg && tm.pathCostMix.eg === eg) return tm.pathCostMix.g;
    const g = new Float32Array(eg.length); for (let i = 0; i < g.length; i++) g[i] = dg[i] + eg[i];
    tm.pathCostMix = { dg, eg, g }; return g;
  };
  Battle.prototype.setGoal = function (u, x, z, kind) {
    const req = { x, z };
    if (u.goal && u.goalReq && Math.hypot(u.goalReq.x - x, u.goalReq.z - z) < 0.6 && u.path) { u.goalKind = kind; return true; }
    if (kind === 'advance' || kind === 'search') ({ x, z } = this.spreadGoal(u, x, z));
    if (kind !== 'revive') { const c = this.nearCorpse(x, z); if (c) { const dx = x - c.x, dz = z - c.z, L = Math.hypot(dx, dz); const k = L > 1e-3 ? 0.9 / L : 0; const px = L > 1e-3 ? c.x + dx * k : x + 0.9, pz = L > 1e-3 ? c.z + dz * k : z; if (this.map.inBounds(px, pz) && !this.map.insideObstacle(px, pz)) { x = px; z = pz; } } }
    if (u.goal && Math.hypot(u.goal.x - x, u.goal.z - z) < 0.6 && u.path) { u.goalKind = kind; u.goalReq = req; return true; }
    const cost = this.pathCost(u, kind);
    let path = this.map.findPath(u.x, u.z, x, z, cost, RASER[kind]);
    // le chemin défilé fait un trop grand détour (repartir loin dans l'autre sens pour rester caché) : chemin normal
    if (path && cost && cost !== this.dangerGrid(u)) {
      let L = Math.hypot(path[0].x - u.x, path[0].z - u.z); for (let j = 1; j < path.length; j++) L += Math.hypot(path[j].x - path[j - 1].x, path[j].z - path[j - 1].z);
      if (L > Math.hypot(x - u.x, z - u.z) * 1.5 + 5) path = this.map.findPath(u.x, u.z, x, z, this.dangerGrid(u), RASER[kind]);
    }
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
    let i0 = 0; while (i0 < path.length - 1 && ((Math.hypot(path[i0].x - u.x, path[i0].z - u.z) < 0.9 && this.map.walkableSegment(u.x, u.z, path[i0 + 1].x, path[i0 + 1].z))   // (point suivant joignable en ligne droite : sinon, plaqué contre un obstacle, on restait bloqué dessus)
      || ((path[i0].x - u.x) * (path[i0 + 1].x - path[i0].x) + (path[i0].z - u.z) * (path[i0 + 1].z - path[i0].z) < 0 && this.map.walkableSegment(u.x, u.z, path[i0 + 1].x, path[i0 + 1].z)))) i0++;
    // premier point proche et derrière soi, mais le suivant pas joignable en ligne droite (un coin entre les deux) : au lieu
    // de revenir au centre de la case (pas en arrière puis demi-tour), on rejoint directement le segment vers le point suivant,
    // le plus loin possible en ligne droite
    if (i0 < path.length - 1 && Math.hypot(path[i0].x - u.x, path[i0].z - u.z) < 0.9
      && (path[i0].x - u.x) * (path[i0 + 1].x - path[i0].x) + (path[i0].z - u.z) * (path[i0 + 1].z - path[i0].z) < 0) {
      const a = path[i0], b = path[i0 + 1];
      for (let f = 0.9; f >= 0.1; f -= 0.2) {
        const px = a.x + (b.x - a.x) * f, pz = a.z + (b.z - a.z) * f;
        if (this.map.walkableSegment(u.x, u.z, px, pz)) { path = path.slice(); path[i0] = { x: px, z: pz }; break; }
      }
    }
    u.path = path; u.pathIdx = i0; u.goal = { x, z }; u.goalReq = req; u.goalKind = kind; u.repathAt = this.t; u.peek = null; u.peeking = false;
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
  // Posture en attente face à une menace connue : derrière un couvert qui cache même debout (on n'y verrait rien de toute
  // façon), baissé ; derrière un couvert bas, debout pour surveiller par-dessus ; sans couvert, debout.
  Battle.prototype.waitStance = function (u, p) {
    const c = this.coverAt(u.x, u.z, p.x, p.z, true);
    return c && c.level === 'full' ? 'crouch' : 'stand';
  };
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
      // (rien à moins de 6 m : jusqu'à 10 m — on ne reste pas des minutes derrière un bus sans rien voir)
      const cp = this.findCover(u, p, 6, { requireShoot: true, minRange: MIN_CLOSE, preferDist: this.standoff(u) }) || (this.t - (u.wideTry || -99) > 3 && (u.wideTry = this.t) && this.findCover(u, p, 10, { requireShoot: true, minRange: MIN_CLOSE, preferDist: this.standoff(u) }));
      if (cp && Math.hypot(cp.x - u.x, cp.z - u.z) > 0.6 && this.setGoal(u, cp.x, cp.z, 'cover')) { u.state = 'tocover'; u.stance = 'stand'; return true; }
      return false;
    }
    const cp = this.findCover(u, p, 6, { requireShoot: true, minRange: MIN_CLOSE, preferDist: this.standoff(u) }) || this.findCover(u, p, 6, { minRange: MIN_CLOSE });
    if (cp && Math.hypot(cp.x - u.x, cp.z - u.z) > 0.4 && this.setGoal(u, cp.x, cp.z, 'cover')) { u.state = 'tocover'; u.stance = 'stand'; return true; }
    return false;
  };

  // Où pointer l'arme vers sa cible : sur elle si on la voit ; sinon sur sa DERNIÈRE POSITION CONNUE (on ne suit pas à
  // travers un mur quelqu'un qu'on ne voit plus)
  Battle.prototype.aimPoint = function (u, e) {
    if (u.visible.has(e.id)) return e;
    const k = u.knowledge[e.id]; return k || e;
  };
  // ---- Tir au coin d'un couvert haut (mur, fourgon, local) ----------------------------------------------------------
  // Derrière un obstacle plus haut que les yeux, on est caché debout mais on ne voit rien. On tire en se décalant juste
  // assez sur le côté pour dépasser du coin (« passer l'arme »), une courte rafale, puis on revient à l'abri. Au coin,
  // seule une moitié du corps dépasse (cible plus petite, voir hitChance).
  // Cycle : caché (le temps de souffler, plus long sous le feu ; on y recharge) → sortie au coin → rafale de 3 à 5 coups
  // (ou rien à tirer au bout de 2,5 s, ou balles qui claquent trop près) → retour à l'abri.
  const MUZZLE = 1.1;   // longueur bras + canon devant les yeux (m)
  const PEEK_H = EYE.stand, PEEK_MIN = 0.4, PEEK_MAX = 1.4, PEEK_SPEED = 2.2;
  // point de tir au coin depuis une cachette (hx, hz) contre l'obstacle o face à la menace, ou null : le plus petit pas de
  // côté (0,4 à 1,4 m, le long de l'obstacle) d'où l'on voit la menace, debout
  Battle.prototype.peekSpot = function (hx, hz, threat, o, u) {
    if (!o || o.h < PEEK_H) return null;
    const dx = threat.x - hx, dz = threat.z - hz, L = Math.hypot(dx, dz); if (L < 2) return null;
    const qx = -dz / L, qz = dx / L; let best = null;
    for (const sd of [1, -1]) {
      for (let off = PEEK_MIN; off <= PEEK_MAX + 1e-6 && (!best || off < best.off); off += 0.2) {
        const px = hx + qx * off * sd, pz = hz + qz * off * sd;
        if (!this.map.inBounds(px, pz) || this.map.insideObstacle(px, pz) || edgeDist(px, pz, o) > COVER_NEAR) break;
        let clear = true; for (let f = 0.1; f < 1; f += 0.1) if (this.map.insideObstacle(hx + (px - hx) * f, hz + (pz - hz) * f)) { clear = false; break; }   // (pas de 10 cm : on frôle un coin)
        if (!clear || this.nearCorpse(px, pz)) break;
        if (u && this.alliesOf(u).some(a => a.alive && (Math.hypot(a.x - px, a.z - pz) < 1.3 || (a.peek && Math.hypot(a.peek.px - px, a.peek.pz - pz) < 1.3)))) break;   // le coin est pris
        if (this.map.hasLOS(px, EYE.stand, pz, threat.x, CHEST.stand, threat.z)) { best = { x: px, z: pz, off }; break; }
      }
    }
    return best;
  };
  // (pour le choix d'un couvert : le coin d'un point de couverture face à une menace, gardé 2 s — la recherche essaie
  // beaucoup de points ; les équipiers déjà au coin sont revérifiés à l'arrivée par peekCycle)
  Battle.prototype.cornerOf = function (c0, cx, cz, threat, o, u) {
    const key = Math.round(threat.x / 2) + ',' + Math.round(threat.z / 2), c = c0.corner;
    if (c && c.key === key && c.t <= this.t && this.t - c.t < 2) return c.v;
    const v = this.peekSpot(cx, cz, threat, o, null);
    c0.corner = { key, t: this.t, v };
    if (v && u && this.alliesOf(u).some(a => a.alive && (Math.hypot(a.x - v.x, a.z - v.z) < 1.3 || (a.peek && Math.hypot(a.peek.px - v.x, a.peek.pz - v.z) < 1.3)))) return null;
    return v;
  };
  // Le cycle ; vrai s'il occupe l'opérateur ce tour-ci (les autres décisions attendent).
  Battle.prototype.peekCycle = function (u, threats, beingShot) {
    const drop = () => { if (u.peek) { u.peek = null; u.peeking = false; } return false; };
    if (u.holdFire || u.state === 'noammo' || this.t < (u.peekOffUntil || 0)) return drop();
    if (u.goal && u.path) return drop();                                  // un vrai déplacement est en cours
    const th = this.mainThreat(u); if (!th) return drop();
    const k = th.id !== undefined ? u.knowledge[th.id] : th;              // (mainThreat rend un ennemi ou une position connue)
    if (!k || this.t - k.t > 10) return drop();                           // plus d'information récente : on laisse le reste décider
    let P = u.peek;
    if (P) {
      // toujours valable ? la menace est toujours de l'autre côté de l'obstacle, et l'on est à la cachette ou au coin
      const atH = Math.hypot(u.x - P.hx, u.z - P.hz) < 0.3, atP = Math.hypot(u.x - P.px, u.z - P.pz) < 0.3;
      if ((!atH && !atP && !P.slide) || !this.coverAt(P.hx, P.hz, th.x, th.z, true) || this.map.hasLOS(P.hx, EYE.stand, P.hz, th.x, CHEST.stand, th.z)) return drop();
      const sp = this.peekSpot(P.hx, P.hz, th, P.o, u); if (!sp) return drop();   // la menace a bougé : nouveau coin
      P.px = sp.x; P.pz = sp.z;
    } else {
      if (u.moving) return false;
      if (u.keyOrder && Math.hypot(u.x - u.keyOrder.x, u.z - u.keyOrder.z) > 1) return false;   // tenir : seulement depuis son poste
      const cv = this.coverAt(u.x, u.z, th.x, th.z, true);
      if (!cv || cv.level !== 'full' || this.map.hasLOS(u.x, EYE.stand, u.z, th.x, CHEST.stand, th.z)) return false;
      const sp = this.peekSpot(u.x, u.z, th, cv.obstacle, u);
      if (!sp) return this.toCorner(u, th, cv.obstacle);   // au milieu d'un long obstacle (bus, fourgon) : aller vers son bout
      P = u.peek = { hx: u.x, hz: u.z, px: sp.x, pz: sp.z, o: cv.obstacle, phase: 'hide', until: this.t + 0.2 + this.rng.next() * 0.3, empty: 0 };
    }
    this.stop(u);
    u.facing = Math.atan2(th.z - u.z, th.x - u.x);
    const pinned = u.suppression > this.pinThreshold(u);
    if (P.phase === 'hide') {
      u.state = 'hide'; u.peeking = false; P.slide = null;
      u.stance = pinned || u.reloading > 0 || u.suppression > 0.3 ? 'crouch' : 'stand';
      if (u.reloading <= 0 && u.mags > 0 && u.ammo < u.weapon.mag * 0.5) this.startReload(u);   // recharger à l'abri
      if (this.t >= P.until && u.reloading <= 0 && !pinned) { P.phase = 'out'; P.slide = { x: P.px, z: P.pz }; P.outAt = this.t; P.sup = u.suppression; P.hitAt = u.lastHitAt; P.shots = u.stats.shots; u.stance = 'stand'; }
      return true;
    }
    if (P.phase === 'out') {
      u.state = 'engage'; u.stance = 'stand';
      if (!this.peekBack(u) && Math.hypot(u.x - P.px, u.z - P.pz) > 0.05) P.slide = { x: P.px, z: P.pz };
      return true;
    }
    // retour
    u.state = 'hide'; u.peeking = false; P.slide = { x: P.hx, z: P.hz };
    return true;
  };
  // Caché au milieu d'un long obstacle haut (un bus) : on n'y voit rien et viser « à travers » n'a pas de sens. On longe
  // l'obstacle, toujours caché, jusqu'à un point près de son bout d'où l'on peut tirer au coin (au plus 7 m, essai toutes
  // les 2 s). Vrai si l'on y va.
  Battle.prototype.toCorner = function (u, th, o) {
    if (this.t - (u.cornerTry || -99) < 2) return false;
    u.cornerTry = this.t;
    const dx = th.x - u.x, dz = th.z - u.z, L = Math.hypot(dx, dz); if (L < 2) return false;
    const qx = -dz / L, qz = dx / L; let best = null;
    for (let off = 1.2; off <= 7 + 1e-6 && !best; off += 0.6) for (const sd of [1, -1]) {
      const px = u.x + qx * off * sd, pz = u.z + qz * off * sd;
      if (!this.map.inBounds(px, pz) || this.map.insideObstacle(px, pz) || edgeDist(px, pz, o) > COVER_NEAR || this.nearCorpse(px, pz)) continue;
      if (u.keyOrder && Math.hypot(px - u.keyOrder.x, pz - u.keyOrder.z) > 3) continue;   // tenir : on reste dans la position
      if (!this.map.walkableSegment(u.x, u.z, px, pz)) continue;
      const cv = this.coverAt(px, pz, th.x, th.z, true);
      if (!cv || cv.level !== 'full' || this.map.hasLOS(px, EYE.stand, pz, th.x, CHEST.stand, th.z)) continue;
      if (this.alliesOf(u).some(a => a.alive && Math.hypot(a.x - px, a.z - pz) < 1.3)) continue;
      if (this.peekSpot(px, pz, th, cv.obstacle, u)) { best = { x: px, z: pz }; break; }
    }
    if (best && this.setGoal(u, best.x, best.z, 'cover')) { u.state = 'tocover'; u.stance = 'stand'; return true; }
    return false;
  };
  // fin de la sortie au coin (appelé à chaque pas, voir act) : rafale finie, rien vu en 2,5 s, balles trop près, touché
  Battle.prototype.peekBack = function (u) {
    const P = u.peek; if (!P || P.phase !== 'out') return false;
    const fired = u.stats.shots > P.shots, burstDone = fired && this.t < (u.burstPauseUntil || 0);
    const nothing = this.t - P.outAt > 2.5 && !fired;
    const hot = u.suppression - P.sup > 0.15 || u.lastHitAt > P.hitAt;
    if (!burstDone && !nothing && !hot) return false;
    P.phase = 'back'; P.slide = { x: P.hx, z: P.hz }; u.peeking = false; u.burstPauseUntil = 0;
    // à l'abri : souffler 0,9 à 1,8 s, bien plus sous le feu (la priorité est de rester caché)
    P.until = this.t + 0.9 + this.rng.next() * 0.9 + Math.min(3, u.suppression * 3) + (hot ? 0.8 : 0);
    if (nothing) { P.empty++; if (P.empty >= 2) { u.peekOffUntil = this.t + 6; } } else P.empty = 0;
    return true;
  };
  // seuil « cloué » : au-delà, on reste caché (sang-froid, position calée, Sang-froid, Meneur le repoussent)
  Battle.prototype.pinThreshold = function (u) {
    return 0.6 - u.def.composure / 400 + (this.isBraced(u) ? 0.15 : 0) + (has(u, 'steady') ? 0.15 : 0) + (this.nearLeader(u) ? 0.1 : 0);
  };
  // déplacement du pas de côté (cachette ↔ coin), sans chemin : à chaque pas de simulation
  Battle.prototype.peekSlide = function (u) {
    const P = u.peek; if (!P || !P.slide) return;
    if (P.phase === 'out') this.peekBack(u);
    const s = P.slide, d = Math.hypot(s.x - u.x, s.z - u.z), stp = PEEK_SPEED * DT;
    if (d <= stp) {
      u.x = s.x; u.z = s.z; P.slide = null;
      if (P.phase === 'out') u.peeking = true;
      else if (P.phase === 'back') { P.phase = 'hide'; u.state = 'hide'; u.stance = u.suppression > 0.3 ? 'crouch' : 'stand'; }
      if (d > 0.02) u.moving = true;
      return;
    }
    const nx = u.x + (s.x - u.x) / d * stp, nz = u.z + (s.z - u.z) / d * stp;
    if (this.map.insideObstacle(nx, nz)) { u.peek = null; u.peeking = false; return; }   // (ne doit pas arriver : on ne traverse jamais un obstacle)
    u.x = nx; u.z = nz; u.moving = true; u.peeking = false;
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
      u.keyOrder = { id: p.id, nom: p.nom || p.id, x, z, r: p.r || 2.5, menace: p.menace, held: false }; u.moveOrder = null;
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
    if (o.ordre !== undefined && o.cx !== undefined) { this.holdPerimeter(u, o, threats); return; }   // « tenir » au clic droit : tous azimuts
    let th = threats.length ? u.target || threats[0] : this.mainThreat(u);
    if (!th && o.menace !== null && o.menace !== undefined) th = { x: o.x + Math.cos(o.menace) * 20, z: o.z + Math.sin(o.menace) * 20 };
    if (!o.held) { o.held = true; this.logEvent('keypos', `${u.callsign} tient la position clé « ${o.nom} ».`, { unit: u.id, team: u.team, keyPos: o.id }); }
    if (!th) { u.state = 'holdkey'; u.stance = 'stand'; return; }
    if (!u.target || !u.target.alive) u.facing = Math.atan2(th.z - u.z, th.x - u.x);
    const cover = this.coverAt(u.x, u.z, th.x, th.z, true);
    if (threats.length) { u.state = 'engage'; u.stance = ((u.reloading > 0 || this.t < (u.burstPauseUntil || 0)) && cover) ? 'crouch' : 'stand'; return; }
    u.state = 'holdkey'; u.stance = cover ? 'crouch' : 'stand';
  };
  // ---- « Tenir la position » (ordre au clic droit) : sûreté tous azimuts, comme en vrai --------------------------------
  // Chaque opérateur surveille un secteur autour du point (face à la menace connue d'abord, puis les flancs ouverts, puis
  // l'arrière), depuis son propre couvert, en balayant son secteur du regard. Un ennemi apparaît : ceux qui le voient
  // l'engagent ; un équipier dont le secteur est calme se décale (dans la position, ≤ 9,5 m du point) vers un couvert
  // d'où il appuie le côté menacé, pendant qu'un autre garde l'arrière. Menace partie (≥ 4 s), il reprend sa place.
  // Personne ne quitte la position pour poursuivre.
  const HOLD_ZONE = 9.5, HOLD_MOVE_GAP = 4, HOLD_CONTACT = 20;
  // secteurs de base (radians, par rapport à la menace) selon l'effectif : deux vers la menace à partir de cinq
  const SECT_BASE = { 1: [0], 2: [0, Math.PI], 3: [0, 2.1, -2.1], 4: [0, Math.PI / 2, -Math.PI / 2, Math.PI], 5: [0.5, -0.5, 1.75, -1.75, Math.PI] };
  // au contact (menace connue) : tout le monde face à elle, sauf un qui garde l'arrière (à partir de quatre : à deux ou trois,
  // chaque fusil compte face à l'assaut — mesuré)
  const SECT_CONTACT = { 1: [0], 2: [0.3, -0.3], 3: [0.45, 0, -0.45], 4: [0.55, 0, -0.55, Math.PI], 5: [0.7, 0.25, -0.25, -0.7, Math.PI] };
  const SECT_CAND = [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, 3 * Math.PI / 4, -3 * Math.PI / 4, Math.PI];
  // à chacun l'élément le moins coûteux (somme minimale ; permutations jusqu'à 6, sinon au plus proche) — cost[i][j]
  // (moins d'éléments que de demandeurs : -1 pour ceux qui n'en ont pas)
  const bestAssign = (cost0) => {
    const n = cost0.length, m0 = n ? cost0[0].length : 0, cost = cost0.map(r => r.concat(new Array(Math.max(0, n - m0)).fill(1e6))), m = Math.max(m0, n);
    const fix = (a) => a.map(j => (j < m0 ? j : -1));
    if (n <= 6 && m <= 6) {
      let best = null, bs = Infinity; const used = new Array(m).fill(false), cur = [];
      const rec = (i, s) => { if (s >= bs) return; if (i === n) { bs = s; best = cur.slice(); return; } for (let j = 0; j < m; j++) if (!used[j]) { used[j] = true; cur.push(j); rec(i + 1, s + cost[i][j]); cur.pop(); used[j] = false; } };
      rec(0, 0); if (best) return fix(best);
    }
    const used = new Set(); return fix(cost.map(row => { let bj = -1, bv = Infinity; row.forEach((v, j) => { if (!used.has(j) && v < bv) { bv = v; bj = j; } }); used.add(bj); return bj < 0 ? m : bj; }));
  };
  // distance dégagée (à hauteur des yeux) depuis un point dans une direction, jusqu'à max
  Battle.prototype.openDist = function (x, z, a, max) {
    for (let r = 2; r <= max; r += 2) { const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (!this.map.inBounds(px, pz) || !this.map.hasLOS(x, EYE.stand, z, px, EYE.stand, pz)) return r - 2; }
    return max;
  };
  // direction de la menace pour une position : l'ennemi connu le plus proche du point (toute l'équipe, ≤ 20 s), sinon dir
  Battle.prototype.holdFace = function (team, p, dir) {
    let best = null, bd = 60;
    for (const u of team.units) if (u.alive) for (const id in u.knowledge) { const k = u.knowledge[id]; if (this.t - k.t > 20) continue; const d = Math.hypot(k.x - p.x, k.z - p.z); if (d < bd && d > 1) { bd = d; best = k; } }
    return best ? Math.atan2(best.z - p.z, best.x - p.x) : dir;
  };
  // n secteurs autour de (x, z) : un secteur fermé par un mur tout proche (< 4 m dégagés) ne se surveille pas ; il est
  // remplacé par la direction ouverte la plus utile (la menace compte plus que l'arrière)
  Battle.prototype.holdSectors = function (x, z, face, n, contact) {
    const base = (contact ? SECT_CONTACT[n] : SECT_BASE[n]) || Array.from({ length: n }, (v, i) => (i - (n - 1) / 2) * 2 * Math.PI / n);
    const out = base.filter(r => this.openDist(x, z, face + r, 4) >= 4);
    const w = (r) => 1.5 - 0.6 * Math.abs(r) / Math.PI;
    while (out.length < base.length) {
      let bc = null, bs = 0;
      for (const c of SECT_CAND) { if (out.some(r => angDiff(r, c) < 0.6)) continue; const s = this.openDist(x, z, face + c, 20) * w(c); if (s > bs) { bs = s; bc = c; } }
      if (bc === null) { out.push(base[out.length]); continue; }
      out.push(bc);
    }
    return out.map(r => face + r);
  };
  // membres d'une même position tenue (arrivés, ou encore en route pour elle)
  Battle.prototype.holdMembers = function (team, ordre) {
    return team.units.filter(a => a.alive && ((a.keyOrder && a.keyOrder.ordre === ordre) || (a.moveOrder && (a.moveOrder.hid !== undefined ? a.moveOrder.hid : a.moveOrder.id) === ordre && a.moveOrder.sect !== undefined)));
  };
  // secteurs du moment : recalculés quand l'effectif change (un équipier tombé, les autres se partagent son secteur) ;
  // chacun garde le secteur le plus proche de sa place
  Battle.prototype.holdPlan = function (u, o) {
    const team = this.teams[u.team], ms = this.holdMembers(team, o.ordre);
    team.holdPlans = team.holdPlans || {};
    let pl = team.holdPlans[o.ordre];
    // au contact (un ennemi vu ou entendu par l'un d'eux il y a moins de 5 s, gardé 8 s) : secteurs resserrés face à lui
    let th = null, bd = 45;
    for (const a of ms) for (const e of this.enemiesOf(a)) { const k = a.knowledge[e.id]; if (!e.alive || !k || this.t - k.t > 10) continue; const d = Math.hypot(k.x - o.cx, k.z - o.cz); if (d < bd) { bd = d; th = k; } }
    if (th) { o.contactFace = Math.atan2(th.z - o.cz, th.x - o.cx); team.holdContact = team.holdContact || {}; team.holdContact[o.ordre] = { until: this.t + HOLD_CONTACT, face: o.contactFace }; }
    // encercler : le point est le secteur principal (secteurs resserrés face à lui, en permanence)
    const hc = team.holdContact && team.holdContact[o.ordre], contact = o.enc !== undefined || (hc && this.t < hc.until), face = o.enc !== undefined ? o.face0 : contact ? hc.face : o.face0;
    const key = ms.map(a => a.id).join(',') + (contact ? '|c' + Math.round(face / (Math.PI / 6)) : '|q');
    if (!pl || pl.key !== key) {
      const sect = this.holdSectors(o.cx, o.cz, face, ms.length, contact);
      const home = (a) => { const q = a.keyOrder && a.keyOrder.ordre === o.ordre ? a.keyOrder : a.moveOrder; return { x: q.hx !== undefined ? q.hx : q.x, z: q.hz !== undefined ? q.hz : q.z, s: q.sect }; };
      // au contact, l'arrière revient de préférence à qui ne voit pas la menace (on y perd le moins de feu)
      const sees = (a) => contact && th ? this.map.hasLOS(a.x, EYE.stand, a.z, th.x, CHEST.stand, th.z) : false;
      const perm = bestAssign(ms.map(a => { const h = home(a), b = Math.hypot(h.x - o.cx, h.z - o.cz) < 1 && h.s !== undefined ? h.s : Math.atan2(h.z - o.cz, h.x - o.cx), sv = sees(a); return sect.map(s => angDiff(b, s) + (sv && angDiff(s, face) > 2 ? 2 : 0)); }));
      pl = team.holdPlans[o.ordre] = { key, ms, sect: {}, face, contact: !!contact };
      ms.forEach((a, i) => { pl.sect[a.id] = sect[perm[i]]; });
    }
    return pl;
  };
  // ---- Serre-file intelligent (« Tenir », au contact, à quatre ou cinq) -------------------------------------------------
  // Le serre-file (celui qui garde l'arrière) est un fusil de moins devant. Quand l'avant peine (un équipier touché il y a
  // < 4 s, cloué ou très secoué, un équipier tombé il y a < 10 s, ou plus d'ennemis devant que de fusils pour leur
  // répondre), il est envoyé en appui devant ; une menace derrière (vue ou entendue, ou un tir venu de l'arrière) le renvoie
  // aussitôt à l'arrière. Hystérésis : au moins REAR_MIN s à l'arrière avant d'être lâché ; lâché, il ne revient (sans
  // menace derrière) qu'après REAR_CALM s d'avant calme. Hors contact : la sûreté à 360° habituelle.
  const REAR_ARC = 2.1, REAR_MIN = 4, REAR_CALM = 8;
  Battle.prototype.holdRear = function (team, o, pl) {
    team.holdRear = team.holdRear || {};
    if (!pl.contact || pl.ms.length < 4) { delete team.holdRear[o.ordre]; return null; }
    let gid = null, gd = 0;
    for (const a of pl.ms) { const s = pl.sect[a.id]; if (s === undefined) continue; const d = angDiff(s, pl.face); if (d > gd) { gd = d; gid = a.id; } }
    if (gd < REAR_ARC) { delete team.holdRear[o.ordre]; return null; }   // pas de secteur arrière (fermé par un mur)
    const t = this.t;
    let r = team.holdRear[o.ordre];
    if (!r) r = team.holdRear[o.ordre] = { id: gid, released: false, since: -99, calm: t, back: false, t: -1 };
    if (r.t === t && r.id === gid) return r;
    r.t = t; r.id = gid;
    const inRear = (x, z) => angDiff(Math.atan2(z - o.cz, x - o.cx), pl.face) > REAR_ARC;
    let rearThreat = false, front = 0; const seen = new Set();
    for (const a of pl.ms) {
      if (t - a.lastShotByAt < 2 && a.lastShotBy && a.lastShotBy.alive && inRear(a.lastShotBy.x, a.lastShotBy.z)) rearThreat = true;
      for (const e of this.enemiesOf(a)) {
        const k = a.knowledge[e.id]; if (!e.alive || !k || t - k.t > 4 || seen.has(e.id)) continue; seen.add(e.id);
        if (inRear(k.x, k.z)) { if (Math.hypot(k.x - o.cx, k.z - o.cz) < 35) rearThreat = true; }
        else if (angDiff(Math.atan2(k.z - o.cz, k.x - o.cx), pl.face) < 1.6) front++;
      }
    }
    const trouble = front > pl.ms.length - 1 || team.units.some(a => !a.alive && t - (a.downAt === undefined ? -99 : a.downAt) < 10) ||
      pl.ms.some(a => t - a.lastHitAt < 4 || a.state === 'pinned' || a.suppression > 0.6);
    const g = this.unitById(r.id);
    if (!r.released) {
      if (trouble && !rearThreat && t - r.since >= REAR_MIN) {
        r.released = true; r.since = t; r.calm = t; r.back = false;
        if (g) this.logEvent('appui', `${g.callsign} : « Je quitte l'arrière, j'appuie devant ! »`, { unit: g.id, team: g.team, silent: true });
      }
    } else {
      if (trouble) r.calm = t;
      if (rearThreat || (t - r.calm >= REAR_CALM && t - r.since >= REAR_MIN)) {
        r.released = false; r.since = t; r.back = rearThreat;
        if (g && rearThreat) this.logEvent('appui', `${g.callsign} : « Contact arrière, je reprends l'arrière ! »`, { unit: g.id, team: g.team, silent: true });
      }
    }
    return r;
  };
  // un couvert de la position d'où l'on tire sur p (≤ 6 m de soi, ≤ HOLD_ZONE du point)
  Battle.prototype.holdSpot = function (u, o, p) {
    const cp = this.findCover(u, p, 6, { requireShoot: true, towards: { x: o.cx, z: o.cz } });
    return cp && Math.hypot(cp.x - o.cx, cp.z - o.cz) <= HOLD_ZONE ? cp : null;
  };
  Battle.prototype.holdPerimeter = function (u, o, threats) {
    if (!o.held) { o.held = true; }
    const moveTo = (x, z) => { o.x = x; o.z = z; o.movedAt = this.t; if (this.setGoal(u, x, z, 'cover')) { u.state = 'tokey'; u.stance = 'stand'; return true; } return false; };
    const canMove = this.t - (o.movedAt || -99) > HOLD_MOVE_GAP;
    const beingShot = this.t - u.lastShotByAt < 1.5 && u.lastShotBy && u.lastShotBy.alive;
    // 1) une cible en vue : feu depuis son poste ; s'il ne couvre pas d'elle et qu'on est sous le feu, un couvert voisin de la
    //    position d'où l'on tire (au plus un déplacement toutes les 4 s ; se déplacer plus tôt, à découvert, coûtait plus cher
    //    que de tirer d'où l'on est : mesuré)
    const pl = this.holdPlan(u, o), mine = pl.sect[u.id] !== undefined ? pl.sect[u.id] : o.face0;
    const rg = this.holdRear(this.teams[u.team], o, pl), guard = !!rg && rg.id === u.id;
    // serre-file rappelé par une menace derrière : il regagne son poste tout de suite (même s'il tirait devant)
    if (guard && !rg.released && rg.back && o.backAt !== rg.since) {
      o.backAt = rg.since; o.reinf = undefined;
      if (Math.hypot(o.hx - u.x, o.hz - u.z) > 0.6 && moveTo(o.hx, o.hz)) return;
      o.x = o.hx; o.z = o.hz;
    }
    if (threats.length) {
      const th = u.target && u.target.alive ? u.target : threats[0], cover = this.coverAt(u.x, u.z, th.x, th.z, true);
      if (!cover && beingShot && canMove) { const cp = this.holdSpot(u, o, th); if (cp && Math.hypot(cp.x - u.x, cp.z - u.z) > 0.8 && moveTo(cp.x, cp.z)) return; }
      u.state = 'engage'; u.stance = ((u.reloading > 0 || this.t < (u.burstPauseUntil || 0)) && cover) ? 'crouch' : 'stand'; return;
    }
    // menaces connues (vues ou entendues par l'équipe il y a moins de 5 s), situées depuis le point
    const known = [];
    for (const e of this.enemiesOf(u)) { const k = u.knowledge[e.id]; if (e.alive && k && this.t - k.t < 5) known.push({ e, k, b: Math.atan2(k.z - o.cz, k.x - o.cx), d: Math.hypot(k.x - o.cx, k.z - o.cz) }); }
    const owner = (b) => { let bo = null, bd = Infinity; for (const a of pl.ms) { const s = pl.sect[a.id]; if (s === undefined) continue; const d = angDiff(b, s); if (d < bd) { bd = d; bo = a; } } return bo; };
    let watch = null, reinf = null;
    const released = rg && rg.released, ahead = (q) => angDiff(q.b, pl.face) <= REAR_ARC;
    if (beingShot) watch = u.lastShotBy;                                     // pris pour cible : face au tireur
    else if (guard && released) {
      // serre-file lâché : en appui de l'avant, sur la menace de devant la plus proche du point ; s'il la voit déjà d'où il
      // est, il se contente de s'y tourner (se déplacer sous le feu coûtait plus que cela ne rapportait : mesuré)
      const T = known.filter(ahead).sort((p, q) => p.d - q.d)[0];
      if (T && this.map.hasLOS(u.x, EYE.stand, u.z, T.k.x, CHEST.stand, T.k.z)) watch = T.k;
      else if (T) reinf = T;
    } else {
      const inMine = known.filter(q => owner(q.b) === u).sort((p, q) => p.d - q.d);
      if (inMine.length) watch = inMine[0].k;                               // une menace dans son secteur : on la tient en joue
      else if (known.length && pl.ms.length >= 2) {
        // appui mutuel : la menace la plus proche du point ; son secteur est tenu par « own » ; l'arrière par le plus éloigné
        const T = known.slice().sort((p, q) => p.d - q.d)[0], own = owner(T.b);
        const free = pl.ms.filter(a => a !== own && !(released && a.id === rg.id) && a.keyOrder && a.keyOrder.ordre === o.ordre && !known.some(q => owner(q.b) === a));
        const rear = pl.ms.length >= 3 && !released ? free.slice().sort((p, q) => angDiff(pl.sect[q.id], T.b) - angDiff(pl.sect[p.id], T.b) || (p.id < q.id ? -1 : 1))[0] : null;
        const side = known.filter(q => angDiff(q.b, T.b) < 1.05).length;   // ennemis de ce côté : autant d'appuis (à deux, aucun : l'autre garde l'arrière)
        const need = Math.min(side, Math.max(0, pl.ms.length - 2));
        const helpers = free.filter(a => a !== rear).sort((p, q) => angDiff(pl.sect[p.id], T.b) - angDiff(pl.sect[q.id], T.b) || (p.id < q.id ? -1 : 1)).slice(0, need);
        if (helpers.includes(u)) reinf = T;
      }
    }
    // 2) en appui d'un autre secteur : un couvert de la position d'où l'on voit la menace ; sinon on s'y tourne d'où l'on est
    if (reinf) {
      if (canMove && o.reinf !== reinf.e.id) {
        const cp = this.holdSpot(u, o, reinf.k);
        if (cp && Math.hypot(cp.x - u.x, cp.z - u.z) > 0.8) { o.reinf = reinf.e.id; if (moveTo(cp.x, cp.z)) { if (this.t - (o.reinfLog || -99) > 10) { o.reinfLog = this.t; this.logEvent('appui', `${u.callsign} : « Je viens en appui ! »`, { unit: u.id, team: u.team, silent: true }); } return; } }
        o.reinf = reinf.e.id;
      }
      watch = reinf.k;
    } else if (o.reinf !== undefined || Math.hypot(o.x - o.hx, o.z - o.hz) > 0.6) {
      // la menace est partie : retour à sa place
      if (canMove) { o.reinf = undefined; if (Math.hypot(o.hx - u.x, o.hz - u.z) > 0.6 && moveTo(o.hx, o.hz)) return; o.x = o.hx; o.z = o.hz; }
    }
    // 3) surveillance : face à la menace tenue, sinon son secteur balayé du regard (±23°, ~9 s)
    let dir;
    if (watch) dir = Math.atan2(watch.z - u.z, watch.x - u.x) + 0.12 * Math.sin(this.t * 0.9 + u.idx * 1.9);
    else dir = mine + 0.4 * Math.sin(this.t * 0.7 + u.idx * 1.9);
    if (!u.target || !u.target.alive) u.facing = dir;
    // derrière un couvert : baissé, et l'on se relève régulièrement pour observer par-dessus (~1,2 à 1,6 s toutes les 4 s) ;
    // si l'on voit déjà par-dessus en restant baissé, on reste baissé. Sans couvert : debout.
    const sx = u.x + Math.cos(dir) * 12, sz = u.z + Math.sin(dir) * 12;
    const cov = this.coverAt(u.x, u.z, sx, sz, true), peek = ((this.t * 0.25 + u.idx * 0.37 + u.team * 0.19) % 1) < (watch ? 0.3 : 0.4);
    u.state = 'holdkey'; u.stance = cov && (!peek || this.map.hasLOS(u.x, EYE.crouch, u.z, sx, CHEST.stand, sz)) ? 'crouch' : 'stand';
  };
  // ---- Ordre de déplacement du joueur (clic droit sur le sol) ----------------------------------------------------------
  // battle.command('aller', équipe, { x, z, units: [ids] | null (tous), mode: 'methodique' | 'agressif', arrivee: 'tenir' }) :
  // les opérateurs désignés rejoignent le point à leur façon, puis font l'« arrivée ». Enregistré et rejoué à l'identique.
  //  - méthodique (doctrine française : bonds avec appui mutuel) : le groupe désigné est partagé en deux moitiés ; l'une bondit
  //    de couvert en couvert (≤ 9 m, pause à chaque couvert), l'autre couvre, arrêtée, chacun son secteur (face à la menace —
  //    ou au sens de la marche —, puis ±35°, le dernier vers l'arrière) ; on inverse quand ceux qui bondissent sont arrivés.
  //  - agressif : droit au point au pas de course, en tirant sur ce qu'on voit (précision habituelle en marchant) ; sous le
  //    feu, une courte halte (~1 s) derrière un couvert proche qui ne fait pas reculer, au plus une toutes les 6 s.
  //  - arrivée « tenir » : un vrai couvert tout proche (≤ 4 m) face à la menace (ou au sens de la marche), et on y reste :
  //    c'est le poste de l'ordre « tenir » (followKeyOrder). Sans ordre, rien ne change.
  // Un ordre au plus toutes les 3 s par opérateur (garde-fou contre la micro-gestion).
  // feu (arg.feu, absent = « à volonté ») : 'retenu' (embuscade : on ne tire pas tant qu'on n'est pas vu, pris à partie ou
  // que le joueur ne dit « Feu ! ») ; 'appui' (sur place, tir de suppression sur la zone menacée — voir appuiZone)
  const FIRE_MODES = { volonte: 'feu à volonté', retenu: 'feu retenu', appui: 'en appui' };
  const MOVE_MODES = { methodique: 'méthodique', agressif: 'agressif', franchir: 'en franchissement', decrocher: 'en décrochage', discret: 'discret' }, ARRIVALS = { tenir: 'tenir la position', manoeuvre: 'reprendre la manœuvre', encercler: 'encercler', fouiller: 'fouiller les alentours', freinage: 'freinage (tenir, puis décrocher sur la 2e ligne)' };
  const VIA_MAX = 2, VIA_GAP = 2.5, VIA_NEAR = 2.2;   // points de passage : 2 au plus, places à 2,5 m en travers, « passé » à 2,2 m
  const ORDER_COOLDOWN = 3, ORDER_GAP = 4, BOUND_MAX = 9, BOUND_BARE = 7, SECTORS = [0, 0.61, -0.61];   // secteurs : ±35°
  // point du sol cliqué → point marchable (dans le terrain, hors obstacle : case libre la plus proche)
  Battle.prototype.orderPoint = function (x, z) {
    const m = this.map; if (!isFinite(x) || !isFinite(z)) return null;
    x = clamp(x, 1, m.width - 1); z = clamp(z, 1, m.depth - 1);
    if (!m.inBounds(x, z) || m.insideObstacle(x, z)) { const f = m.nearestFree(x, z); if (!f) return null; const c = m.centerOf(f.c, f.r); x = c.x; z = c.z; }
    return { x, z };
  };
  Battle.prototype.moveOrder = function (teamIndex, arg) {
    const team = this.teams[teamIndex]; if (!team || this.over) return { ok: false, reason: 'bataille terminée' };
    arg = arg || {};
    const mode = MOVE_MODES[arg.mode] ? arg.mode : null, arrivee = arg.arrivee === undefined ? 'tenir' : arg.arrivee;
    let feu = arg.feu === undefined || arg.feu === null ? 'volonte' : arg.feu;
    if (!mode || !ARRIVALS[arrivee] || !FIRE_MODES[feu]) return { ok: false, reason: 'ordre inconnu' };
    if (mode === 'discret' && feu === 'volonte') feu = 'retenu';   // D5 : on ne tire pas tant qu'on n'est pas repérés (le feu retenu fait la règle)
    const p = this.orderPoint(+arg.x, +arg.z); if (!p) return { ok: false, reason: 'point hors du terrain' };
    const ids = Array.isArray(arg.units) && arg.units.length ? arg.units : null;
    const units = team.units.filter(u => u.alive && (!ids || ids.includes(u.id) || ids.includes(u.def.id)));
    if (!units.length) return { ok: false, reason: 'aucun opérateur' };
    const wait = Math.max(...units.map(u => (u.orderAt === undefined ? -99 : u.orderAt) + ORDER_COOLDOWN - this.t));
    if (wait > 1e-6) return { ok: false, reason: `un ordre toutes les ${ORDER_COOLDOWN} s (encore ${Math.ceil(wait)} s)` };
    // D7 — points de passage (arg.via : 2 au plus) : le groupe passe par eux, dans l'ordre, du même pas, puis va au point
    const via = [];
    for (const w of (Array.isArray(arg.via) ? arg.via : []).slice(0, VIA_MAX)) { const q = this.orderPoint(+w.x, +w.z); if (!q) return { ok: false, reason: 'point de passage hors du terrain' }; via.push(q); }
    { let a = units[0]; for (const q of via.concat([p])) { if (!this.map.findPath(a.x, a.z, q.x, q.z)) return { ok: false, reason: q === p ? 'point inaccessible' : 'point de passage inaccessible' }; a = q; } }
    const cx = units.reduce((s, u) => s + u.x, 0) / units.length, cz = units.reduce((s, u) => s + u.z, 0) / units.length;
    const from = via.length ? via[via.length - 1] : { x: cx, z: cz };   // sens de l'arrivée : la dernière étape
    let dir = Math.atan2(p.z - from.z, p.x - from.x);
    if (Math.hypot(p.x - from.x, p.z - from.z) < 2) { const e = this.map.spawns[1 - teamIndex]; dir = Math.atan2(e.z - p.z, e.x - p.x); }
    // places : le premier sur le point, les suivants de part et d'autre, en travers de la marche (tous les 2,5 m), jamais
    // l'un sur l'autre ni de l'autre côté d'un mur
    // (écart ORDER_GAP : des opérateurs collés se font toucher ensemble — balles perdues, grenades)
    const spots = [], a = dir + Math.PI / 2, apart = (q, lim) => !spots.some(o => Math.hypot(o.x - q.x, o.z - q.z) < lim);
    const near = (q) => {   // à portée de marche du point : ligne droite, ou chemin au plus ~2 × la distance (pas de l'autre côté d'un mur)
      const D = Math.hypot(q.x - p.x, q.z - p.z); if (this.map.walkableSegment(p.x, p.z, q.x, q.z)) return true;
      const pa = this.map.findPath(p.x, p.z, q.x, q.z); if (!pa) return false;
      let L = 0; for (let i = 1; i < pa.length; i++) L += Math.hypot(pa[i].x - pa[i - 1].x, pa[i].z - pa[i - 1].z);
      return L <= D * 2 + 3;
    };
    units.forEach((u, k) => {
      let s = null;
      for (let j = k; j < k + 10 && !s; j++) {
        const off = j === 0 ? 0 : ORDER_GAP * Math.ceil(j / 2) * (j % 2 ? 1 : -1), q = this.orderPoint(p.x + Math.cos(a) * off, p.z + Math.sin(a) * off);
        if (q && apart(q, ORDER_GAP - 0.5) && near(q)) s = q;
      }
      // pas de place en travers (mur, rangée de voitures) : en couronne autour du point, à portée de marche
      for (let r = ORDER_GAP; r <= ORDER_GAP * 2.5 && !s; r += ORDER_GAP * 0.75) for (let i = 0; i < 8 && !s; i++) {
        const q = this.orderPoint(p.x + Math.cos(dir + Math.PI + i * Math.PI / 4) * r, p.z + Math.sin(dir + Math.PI + i * Math.PI / 4) * r);
        if (q && apart(q, ORDER_GAP - 0.5) && near(q)) s = q;
      }
      spots.push(Object.assign({}, s || p));
    });
    // arrivée « tenir » : sûreté tous azimuts — un secteur par opérateur (holdSectors) ; les places restent en ligne, en
    // travers de la marche (une couronne mettait des opérateurs derrière leurs équipiers : ils ne pouvaient plus tirer
    // vers l'avant, et la position tenait mal face à un assaut) : les ailes prennent les flancs, un autre l'arrière
    // (décrocher : on recule, le danger est derrière la marche)
    const face = this.holdFace(team, p, mode === 'decrocher' ? dir + Math.PI : dir);
    // arrivée « encercler » : deux sous-groupes, de deux côtés du point (à moins de trois : « tenir »)
    // (en appui, on s'installe : « reprendre la manœuvre » devient « tenir »)
    let arr = feu === 'appui' && arrivee === 'manoeuvre' ? 'tenir' : arrivee;
    if (arr === 'encercler') { const enc = units.length >= 3 ? this.encircleSpots(team, units, p, dir) : null; if (enc) enc.forEach((q, k) => { spots[k] = q; }); else arr = 'tenir'; }
    if (arr === 'tenir' || arr === 'freinage') {
      const sect = this.holdSectors(p.x, p.z, face, units.length);
      const perm = bestAssign(spots.map(q => { const c = Math.hypot(q.x - p.x, q.z - p.z) < 1; return sect.map(sa => c ? angDiff(face, sa) * 0.5 : angDiff(Math.atan2(q.z - p.z, q.x - p.x), sa)); }));
      spots.forEach((q, k) => { q.sect = perm[k] >= 0 ? sect[perm[k]] : face; });
    }
    // agressif : départs échelonnés (le plus proche du point d'abord), pas une meute qui court collée
    const rank = units.map((u, k) => k).sort((i, j) => Math.hypot(units[i].x - p.x, units[i].z - p.z) - Math.hypot(units[j].x - p.x, units[j].z - p.z) || i - j);
    const id = this.orderSeq = (this.orderSeq || 0) + 1;
    team.moveGroups = (team.moveGroups || []).filter(g => this.groupActive(g));
    const g = { id, mode, members: units.map(u => u.id), bound: { group: 0, since: this.t, n: 0 } };
    if (mode === 'franchir') {   // franchissement : les espaces découverts du trajet (depuis l'opérateur le plus proche du centre du groupe)
      const u0 = units.slice().sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz) || (a.id < b.id ? -1 : 1))[0];
      let cross = [], a = u0; via.concat([p]).forEach((q, leg) => { cross = cross.concat(this.findCrossings(team, a.x, a.z, q.x, q.z).map(C => Object.assign(C, { leg }))); a = q; });   // étape par étape
      Object.assign(g, { cross, ci: 0, phase: 'move', stage: {}, far: {}, runners: [], crossed: [], queue: [] });
    }
    team.moveGroups.push(g);
    // réglage de feu de l'ordre (pour tout le groupe, jusqu'au prochain ordre de chacun)
    team.ordInfo = team.ordInfo || {};
    const fumee = !!arg.fumee && (mode === 'franchir' || mode === 'decrocher');
    team.ordInfo[id] = { feu, px: p.x, pz: p.z, dir, arr, released: feu !== 'retenu', orient: null, zone: null, appuiSaid: false, fumee, via: via.map(q => ({ x: q.x, z: q.z })), viaDone: 0 };
    if (arr === 'freinage') {   // T5 : la 2e ligne = d'où l'on vient (le centre du groupe au départ ; trop près du point : 25 m derrière la marche)
      let L2 = Math.hypot(cx - p.x, cz - p.z) >= FREIN_MIN ? { x: cx, z: cz } : this.orderPoint(p.x - Math.cos(dir) * 25, p.z - Math.sin(dir) * 25);
      if (L2 && !this.map.findPath(p.x, p.z, L2.x, L2.z)) L2 = null;
      team.ordInfo[id].frein = L2 ? { id, x: L2.x, z: L2.z, ids: units.map(u => u.id), armed: false, done: false } : null;
    }
    if (fumee && mode === 'franchir') g.fumee = true;
    units.forEach((u, k) => {
      u.keyOrder = null; u.orderAt = this.t; u.reviving = null;
      u.moveOrder = { id, mode, arrivee: arr, x: spots[k].x, z: spots[k].z, px: p.x, pz: p.z, dir, half: k % 2, goalN: -1, doneN: -1, departAt: mode === 'agressif' ? this.t + rank.indexOf(k) * 0.8 : 0, sect: spots[k].sect, face };
      if (spots[k].hid !== undefined) Object.assign(u.moveOrder, { hid: spots[k].hid + '#' + id, px: spots[k].cx, pz: spots[k].cz, face: spots[k].face, enc: { x: p.x, z: p.z } });
      if (via.length) {   // sa place à chaque étape : en travers de la marche, à VIA_GAP de ses voisins (sinon sur le point même)
        let a = { x: cx, z: cz }; const off = k === 0 ? 0 : VIA_GAP * Math.ceil(k / 2) * (k % 2 ? 1 : -1);
        u.moveOrder.via = via.map(w => { const d = Math.atan2(w.z - a.z, w.x - a.x) + Math.PI / 2, q = off ? this.orderPoint(w.x + Math.cos(d) * off, w.z + Math.sin(d) * off) : null; a = w; return q && this.map.walkableSegment(w.x, w.z, q.x, q.z) ? q : { x: w.x, z: w.z }; });
        u.moveOrder.vi = 0;
      }
      this.stop(u); u.commitUntil = 0; u.pauseUntil = 0;
    });
    // décrocher avec fumée : un nuage tout de suite entre le groupe et le danger (l'ennemi connu le plus proche, sinon l'arrière)
    let smoke = null;
    if (fumee && mode === 'decrocher') {
      let dg = null, dd = 45;
      for (const a of team.units) if (a.alive) for (const eid in a.knowledge) { const k = a.knowledge[eid], e = this.unitById(eid); if (!e || !e.alive || this.t - k.t > 20) continue; const d = Math.hypot(k.x - cx, k.z - cz); if (d < dd) { dd = d; dg = k; } }
      if (!dg) dg = { x: cx - Math.cos(dir) * 15, z: cz - Math.sin(dir) * 15 };
      smoke = this.coverSmoke(units, cx, cz, dg.x, dg.z, 'le repli');
    }
    this.logEvent('moveorder', `${team.name} : ${units.map(u => u.callsign).join(', ')} — déplacement ${MOVE_MODES[mode]}${fumee ? ' avec fumée' : ''}, puis ${ARRIVALS[arrivee]}${arr !== arrivee ? (feu === 'appui' ? ` (en appui : ${ARRIVALS[arr]})` : ` (à ${units.length}, ${ARRIVALS[arr]})`) : ''}${feu !== 'volonte' ? `, ${FIRE_MODES[feu]}` : ''}.`, { team: teamIndex, unit: units[0].id, ordre: id, mode, feu, silent: !!arg.plan });
    return { ok: true, id, x: p.x, z: p.z, fumee: fumee ? (mode === 'franchir' ? units.some(u => (u.grenades.smoke || 0) > 0) : !!smoke) : undefined };
  };
  // ---- Feu et orientation des ordres du clic droit (vague 1 : strategies_gign.md F1, F2, A4) ---------------------------
  // l'ordre en cours d'un opérateur (en route, ou à son poste) : { id, inf } (inf = team.ordInfo[id]), sinon null
  Battle.prototype.orderOf = function (u) {
    const id = u.moveOrder ? u.moveOrder.id : u.keyOrder && u.keyOrder.grp !== undefined ? u.keyOrder.grp : null;
    const oi = this.teams[u.team].ordInfo, inf = id !== null && oi ? oi[id] : null;
    return inf ? { id, inf } : null;
  };
  Battle.prototype.orderMembers = function (team, id) {
    return team.units.filter(a => a.alive && ((a.moveOrder && a.moveOrder.id === id) || (!a.moveOrder && a.keyOrder && a.keyOrder.grp === id)));
  };
  // « Feu retenu » (embuscade, la règle de l'ordre d'équipe « Tenir » branchée sur le clic droit) : personne du groupe ne
  // tire (ni ne lance de grenade) tant qu'aucun d'eux n'est vu par un ennemi, pris pour cible ou touché, qu'aucun ennemi
  // n'est arrivé à moins de HOLD_CLOSE m d'un équipier qui le voit, et que le joueur n'a pas dit « Feu ! » (command('feu')).
  // Le premier déclenchement libère tout le groupe à la fois.
  const HOLD_CLOSE = 12;
  Battle.prototype.fireHeld = function (u) {
    const o = this.orderOf(u); if (!o || o.inf.feu !== 'retenu' || o.inf.released) return false;
    const team = this.teams[u.team];
    for (const a of this.orderMembers(team, o.id)) {
      if (this.t - a.lastShotByAt < 1.5 || this.t - a.lastHitAt < 1.5) { this.openFire(team, o, a, 'pris à partie'); return false; }
      for (const e of this.enemiesOf(a)) {
        if (!e.alive) continue;
        if (e.visible.has(a.id)) { this.openFire(team, o, a, 'repérés'); return false; }
        if (a.visible.has(e.id) && dist2(a, e) < HOLD_CLOSE) { this.openFire(team, o, a, 'ennemi tout près'); return false; }
      }
    }
    return true;
  };
  Battle.prototype.openFire = function (team, o, who, why) {
    o.inf.released = true; o.inf.releasedAt = this.t;
    const ms = this.orderMembers(team, o.id);
    this.logEvent('feu', `${team.name} : ${ms.map(a => a.callsign).join(', ')} — ${why === 'ordre' ? 'ordre d’ouvrir le feu' : why} : « Feu ! »`, { team: team.index, unit: who.id, ordre: o.id, why });
  };
  // battle.command('feu', équipe, { units: [ids] | null }) : le joueur lève le feu retenu des opérateurs désignés
  Battle.prototype.releaseFire = function (teamIndex, arg) {
    const team = this.teams[teamIndex]; if (!team || this.over) return { ok: false, reason: 'bataille terminée' };
    const ids = arg && Array.isArray(arg.units) && arg.units.length ? arg.units : null; let n = 0;
    for (const u of team.units) {
      if (!u.alive || (ids && !ids.includes(u.id) && !ids.includes(u.def.id))) continue;
      const o = this.orderOf(u); if (o && o.inf.feu === 'retenu' && !o.inf.released) { this.openFire(team, o, u, 'ordre'); n++; }
    }
    return n ? { ok: true } : { ok: false, reason: 'personne n’a le feu retenu' };
  };
  // A4 — battle.command('orienter', équipe, { ordre: id, x, z }) : juste après l'ordre, le joueur montre d'où vient le danger
  // (un point du sol). Tenir : les secteurs partent de cette direction ; Encercler : les deux sous-groupes se placent du côté
  // opposé (le danger est devant eux, au-delà du point) ; Appui : la zone arrosée est ce point.
  Battle.prototype.orientOrder = function (teamIndex, arg) {
    const team = this.teams[teamIndex]; if (!team || this.over || !arg) return { ok: false, reason: 'bataille terminée' };
    const id = arg.ordre, inf = team.ordInfo && team.ordInfo[id]; if (!inf) return { ok: false, reason: 'ordre inconnu' };
    const ms = this.orderMembers(team, id); if (!ms.length) return { ok: false, reason: 'ordre terminé' };
    const q = this.orderPoint(+arg.x, +arg.z); if (!q) return { ok: false, reason: 'point hors du terrain' };
    if (Math.hypot(q.x - inf.px, q.z - inf.pz) < 2) return { ok: false, reason: 'trop près du point' };
    const face = Math.atan2(q.z - inf.pz, q.x - inf.px), P = { x: inf.px, z: inf.pz };
    inf.orient = { x: q.x, z: q.z, face }; inf.zone = null;
    if (inf.arr === 'encercler' && ms.length >= 3 && ms.every(a => a.moveOrder)) {
      const enc = this.encircleSpots(team, ms, P, face);
      if (enc) ms.forEach((u, k) => { const s = enc[k]; Object.assign(u.moveOrder, { x: s.x, z: s.z, sect: s.sect, hid: s.hid + '#' + id, px: s.cx, pz: s.cz, face: s.face, enc: { x: P.x, z: P.z } }); if (u.goalKind !== 'bound' && u.goalKind !== 'cover') this.stop(u); });
    } else if (inf.arr === 'tenir' || inf.arr === 'freinage') {
      const sect = this.holdSectors(P.x, P.z, face, ms.length);
      const at = ms.map(a => a.moveOrder ? { x: a.moveOrder.x, z: a.moveOrder.z } : { x: a.keyOrder.hx !== undefined ? a.keyOrder.hx : a.keyOrder.x, z: a.keyOrder.hz !== undefined ? a.keyOrder.hz : a.keyOrder.z });
      const perm = bestAssign(at.map(q2 => { const c = Math.hypot(q2.x - P.x, q2.z - P.z) < 1; return sect.map(sa => c ? angDiff(face, sa) * 0.5 : angDiff(Math.atan2(q2.z - P.z, q2.x - P.x), sa)); }));
      ms.forEach((a, k) => { const s = perm[k] >= 0 ? sect[perm[k]] : face; if (a.moveOrder) { a.moveOrder.sect = s; a.moveOrder.face = face; } else { a.keyOrder.sect = s; a.keyOrder.face0 = face; a.keyOrder.menace = face; } });
      if (team.holdPlans) delete team.holdPlans[id];
    }
    const card = ['l’est', 'le sud-est', 'le sud', 'le sud-ouest', 'l’ouest', 'le nord-ouest', 'le nord', 'le nord-est'][((Math.round(face / (Math.PI / 4)) % 8) + 8) % 8];
    this.logEvent('orienter', `${team.name} : ${ms.map(a => a.callsign).join(', ')} — danger attendu vers ${card}.`, { team: teamIndex, unit: ms[0].id, ordre: id, face });
    return { ok: true, face };
  };
  // F2 — « Appui » : une fois en place, le groupe arrose la zone menacée (APPUI_R m autour du point d'orientation s'il a été
  // donné, sinon autour de la menace connue la plus proche du point de l'ordre, ≤ 45 m) : tir de suppression (canSuppress /
  // suppressAt, ouverts à tout opérateur sous cet ordre) sur les ennemis connus (vus ou entendus il y a < 8 s) dans la zone (ou dans sa direction),
  // même à couvert. Munitions bridées : cadence de rafales courtes, et l'on cesse sous 40 % de sa dotation.
  const APPUI_R = 6, APPUI_MEM = 8, APPUI_AMMO = 0.4;
  Battle.prototype.appuiZone = function (team, inf) {
    if (inf.zone && inf.zone.t === this.t) return inf.zone;
    let c = inf.orient;
    if (!c) {
      let best = null, bd = 45;
      for (const u of team.units) if (u.alive) for (const id in u.knowledge) { const k = u.knowledge[id], e = this.unitById(id); if (!e || !e.alive || this.t - k.t > APPUI_MEM) continue; const d = Math.hypot(k.x - inf.px, k.z - inf.pz); if (d < bd) { bd = d; best = k; } }
      c = best;
    }
    // zone montrée par le joueur : d'autant plus large qu'elle est loin (8 à 14 m) ; sinon APPUI_R autour de la menace
    const r = inf.orient ? clamp(Math.hypot(c.x - inf.px, c.z - inf.pz) * 0.4, 8, 14) : APPUI_R;
    inf.zone = c ? { x: c.x, z: c.z, r, t: this.t } : { x: null, z: null, r, t: this.t };
    return inf.zone;
  };
  Battle.prototype.appuiFire = function (u, o, threats) {
    if (!u.keyOrder || threats.length) return;                                          // en route, ou une cible en vue : feu normal
    if (u.totalAmmo() <= u.weapon.mag * (u.weapon.kit + 1) * APPUI_AMMO || u.reloading > 0) return;
    const team = this.teams[u.team], z = this.appuiZone(team, o.inf); if (z.x === null) return;
    let best = null, bd = Infinity;
    for (const e of this.enemiesOf(u)) {
      const k = u.knowledge[e.id]; if (!e.alive || !k || this.t - k.t > APPUI_MEM) continue;
      // dans la zone, ou (zone montrée par le joueur) dans sa direction : à ± 25° d'elle vue d'ici, à portée
      let dz = Math.hypot(k.x - z.x, k.z - z.z);
      if (dz > z.r) {
        if (!o.inf.orient || Math.hypot(k.x - u.x, k.z - u.z) > u.weapon.range || angDiff(Math.atan2(k.z - u.z, k.x - u.x), Math.atan2(z.z - u.z, z.x - u.x)) > 0.45) continue;
        dz += 20;                                                                        // la zone elle-même d'abord
      }
      if (dz < bd) { bd = dz; best = e; }
    }
    if (!best) return;
    u.appuiAt = this.t;
    if (u.target !== best) this.aimAt(u, best);
    u.targetLostAt = this.t;   // on arrose une position qu'on ne voit pas : la cible n'est pas « perdue » (sinon visée reprise sans fin)
    if (!this.canSuppress(u, best)) {
      u.appuiAt = -99;
      // pas de vue sur la zone d'ici (un mur, une voiture haute) : un couvert voisin d'où l'on voit, dans la position (≤ 6 m
      // de soi, ≤ HOLD_ZONE du point), au plus un déplacement toutes les 4 s ; il devient sa place
      const ko = u.keyOrder, k = u.knowledge[best.id];
      if (ko.cx !== undefined && this.t - (ko.movedAt || -99) > HOLD_MOVE_GAP && !this.map.hasLOS(u.x, EYE.stand, u.z, k.x, CHEST.stand, k.z)) {
        const cp = this.holdSpot(u, ko, k);
        if (cp && Math.hypot(cp.x - u.x, cp.z - u.z) > 0.8 && this.setGoal(u, cp.x, cp.z, 'cover')) { ko.x = ko.hx = cp.x; ko.z = ko.hz = cp.z; ko.movedAt = this.t; u.state = 'tokey'; u.stance = 'stand'; }
        else ko.movedAt = this.t;
      }
      return;
    }
    const k = u.knowledge[best.id]; u.facing = Math.atan2(k.z - u.z, k.x - u.x); u.state = 'appui'; u.stance = 'stand';
    if (!o.inf.appuiSaid) { o.inf.appuiSaid = true; this.logEvent('enappui', `${u.callsign} : « En appui ! » — tir de suppression sur la zone.`, { unit: u.id, team: u.team, ordre: o.id }); }
  };
  // après la décision d'un opérateur sous ordre du clic droit : feu retenu (il garde sa cible en joue sans tirer, baissé
  // derrière son couvert), appui (suppression de la zone)
  Battle.prototype.afterOrder = function (u, threats) {
    if (!u.alive) return;
    const o = this.orderOf(u); if (!o) return;
    if (u.holdFire) {
      if (u.state === 'engage') { const th = u.target && u.target.alive ? u.target : threats[0]; u.state = 'wait'; u.stance = th && this.coverAt(u.x, u.z, th.x, th.z, false) ? 'crouch' : u.stance; }
      if (this.stealthy(u)) u.stance = 'crouch';   // D5 : discret — accroupi en route comme à l'arrêt, tant qu'on n'est pas repérés
      return;
    }
    if (o.inf.feu === 'appui') this.appuiFire(u, o, threats);
  };
  // D4 — « Décrocher » : le squelette des bonds méthodiques, réglé pour partir vite : la moitié qui reste tire (pas de pause
  // d'observation), celle qui bouge court (sprint, sans tirer) jusqu'au couvert suivant vers le point (en arrière), et
  // l'on inverse dès qu'elle y est. Arrivée par défaut : tenir, face au danger (derrière la marche).
  Battle.prototype.orderFallback = function (u, o, tp, threats, dNow) {
    const g = (this.teams[u.team].moveGroups || []).find(x => x.id === o.id), b = g ? g.bound : { group: o.half, n: 0 };
    if (u.goal && (u.goalKind === 'bound' || u.goalKind === 'cover')) { if (boundingNow(u, b) && u.goalKind === 'bound') { u.target = null; u.state = 'retreat'; } return; }
    u.pauseUntil = 0;
    this.orderBound(u, o, tp, threats, dNow);
    if (u.state === 'bounding') { u.state = 'retreat'; u.target = null; }
  };
  // D5 — « Discret » : les bonds méthodiques, accroupis (vitesse × 0,55, repérage × 0,6 : les règles de la posture basse,
  // rien de plus), feu retenu jusqu'à ce que le groupe soit repéré, pris à partie ou qu'un ennemi arrive tout près ; les pas
  // ne s'entendent pas (trait Vigie). Une fois le feu ouvert : un ordre méthodique ordinaire.
  Battle.prototype.stealthy = function (u) {
    if (!u.moveOrder || u.moveOrder.mode !== 'discret') return false;
    const o = this.orderOf(u); return !!(o && o.inf.feu === 'retenu' && !o.inf.released);
  };
  // T5 — arrivée « Freinage » (défense mobile) : on tient le point comme « Tenir » ; dès que ça chauffe (un équipier de
  // l'ordre touché ou tombé depuis la mise en place, ou un ennemi vu à moins de FREIN_CLOSE m d'un équipier en poste),
  // tout le groupe décroche par bonds (D4) sur la 2e ligne — l'endroit d'où il est parti — et la tient. Une seule fois :
  // c'est la règle choisie par le joueur avec l'ordre, pas une décision de l'IA.
  const FREIN_CLOSE = 15, FREIN_MIN = 15;
  Battle.prototype.updateFreinage = function () {
    if (this.over) return;
    for (const team of this.teams) {
      const oi = team.ordInfo; if (!oi) continue;
      for (const k in oi) {
        const f = oi[k].frein; if (!f || f.done) continue;
        const ms = this.orderMembers(team, f.id); if (!ms.length) { f.done = true; continue; }
        const posted = ms.filter(a => !a.moveOrder && a.keyOrder && a.keyOrder.grp === f.id); if (!posted.length) continue;
        if (!f.armed) { f.armed = true; f.at = this.t; }
        let why = null;
        if (f.ids.some(id => { const a = this.unitById(id); return a && !a.alive; })) why = 'homme à terre';
        else for (const a of ms) {
          if (a.lastHitAt > f.at) { why = 'un blessé'; break; }
          if (a.keyOrder) for (const e of this.enemiesOf(a)) if (e.alive && a.visible.has(e.id) && dist2(a, e) < FREIN_CLOSE) { why = 'ennemi tout près'; break; }
          if (why) break;
        }
        if (!why) continue;
        const r = this.moveOrder(team.index, { units: ms.map(a => a.id), x: f.x, z: f.z, mode: 'decrocher', arrivee: 'tenir', plan: 'freinage' });
        if (!r.ok) { if (!/un ordre toutes/.test(r.reason)) f.done = true; continue; }   // (délai entre deux ordres : on réessaie au pas suivant)
        f.done = true;
        this.logEvent('freinage', `${team.name} : ${ms.map(a => a.callsign).join(', ')} — ${why} : « On décroche sur la deuxième ligne ! »`, { team: team.index, unit: ms[0].id, ordre: r.id, why });
      }
    }
  };
  // R1 — « Contact ! » : quand un équipier annonce un nouveau contact, ceux qui guettent sans cible (en couverture, en pause,
  // en attente, en ratissage) tournent le regard vers lui pendant CONTACT_LOOK s — sauf le serre-file qui garde l'arrière
  // et les postes « tenir » (qui ont déjà leurs secteurs, recalculés au contact).
  const CONTACT_LOOK = 3, LOOK_STATES = { overwatch: 1, pause: 1, hold: 1, idle: 1, wait: 1, search: 1 };
  Battle.prototype.contactWatch = function (u) {
    const c = this.teams[u.team].contactCall;
    if (!c || this.t - c.t > CONTACT_LOOK || c.by === u.id || u.moving || (u.target && u.target.alive) || !LOOK_STATES[u.state] || this.t - (u.rearWatch || -99) < 0.5) return;
    if (Math.hypot(c.x - u.x, c.z - u.z) > 80) return;
    u.facing = Math.atan2(c.z - u.z, c.x - u.x);
  };
  // ---- « Deuxième cerveau » (comme le directeur d'Alien) ------------------------------------------------------------------
  // Un chef invisible sait À PEU PRÈS où sont les ennemis que l'équipe ne voit pas : toutes les HINT_EVERY s, il regroupe
  // les adversaires non repérés et souffle une zone floue (± HINT_NOISE m, jamais la position exacte). Cet indice ne sert
  // qu'au REGARD (on surveille la bonne direction) : il n'entre pas dans la connaissance, on ne peut ni tirer ni arroser
  // sur lui. Pareil pour les deux camps.
  const HINT_EVERY = 5, HINT_NOISE = 6, HINT_GROUP = 12, HINT_RANGE = 90;
  Battle.prototype.updateHints = function () {
    if (this.tick % Math.round(HINT_EVERY / DT) !== 0) return;
    for (const team of this.teams) {
      const us = team.units.filter(u => u.alive);
      const foes = this.teams[1 - team.index].units.filter(e => e.alive && !us.some(u => { const k = u.knowledge[e.id]; return k && this.t - k.t < 5; }));
      const groups = [];
      for (const e of foes) {
        let g = groups.find(q => Math.hypot(q.x - e.x, q.z - e.z) < HINT_GROUP);
        if (!g) groups.push(g = { x: e.x, z: e.z, n: 0, sx: 0, sz: 0 });
        g.n++; g.sx += e.x; g.sz += e.z; g.x = g.sx / g.n; g.z = g.sz / g.n;
      }
      team.hints = groups.map(g => ({ x: g.x + this.rng.gauss() * HINT_NOISE, z: g.z + this.rng.gauss() * HINT_NOISE, n: g.n, t: this.t }));
      // le plus gros groupe : annoncé par l'équipier le plus proche quand sa direction change nettement
      const main = team.hints.slice().sort((p, q) => q.n - p.n)[0];
      if (!main || !us.length) continue;
      const cx = us.reduce((s, a) => s + a.x, 0) / us.length, cz = us.reduce((s, a) => s + a.z, 0) / us.length;
      const b = Math.atan2(main.z - cz, main.x - cx);
      if (team.hintSaid !== undefined && angDiff(b, team.hintSaid) < 0.8) continue;
      team.hintSaid = b;
      const es = this.map.spawns[1 - team.index], fwd = Math.atan2(es.z - cz, es.x - cx);
      let d = b - fwd; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      const dir = Math.abs(d) < 0.6 ? 'devant' : Math.abs(d) > 2.4 ? 'derriere' : d > 0 ? 'droite' : 'gauche';
      const by = us.slice().sort((p, q) => Math.hypot(p.x - main.x, p.z - main.z) - Math.hypot(q.x - main.x, q.z - main.z))[0];
      const mots = { devant: 'devant nous', derriere: 'derrière nous', droite: 'sur notre droite', gauche: 'sur notre gauche' };
      this.logEvent('indice', `${by.callsign} : « Ils doivent être ${mots[dir]}. »`, { unit: by.id, team: team.index, dir, silent: true });
    }
  };
  // l'indice le plus proche à portée (ou null)
  Battle.prototype.hintFor = function (u) {
    const hs = this.teams[u.team].hints; if (!hs || !hs.length) return null;
    let best = null, bd = HINT_RANGE;
    for (const h of hs) { const d = Math.hypot(h.x - u.x, h.z - u.z); if (d < bd) { bd = d; best = h; } }
    return best;
  };
  // regard à l'arrêt : sans cible ni ennemi repéré récemment, on surveille la direction soufflée par l'indice
  // (un poste « tenir » garde son secteur : il ne s'y tourne que si l'indice y est déjà à peu près)
  Battle.prototype.hintWatch = function (u) {
    if (u.moving || (u.target && u.target.alive) || this.t - (u.rearWatch || -99) < 0.5) return;
    if (!LOOK_STATES[u.state] && u.state !== 'holdkey') return;
    const c = this.teams[u.team].contactCall; if (c && this.t - c.t <= CONTACT_LOOK) return;
    if (this.knownEnemies(u).some(({ k }) => this.t - k.t < 5)) return;
    const h = this.hintFor(u); if (!h) return;
    const a = Math.atan2(h.z - u.z, h.x - u.x);
    if (u.state === 'holdkey' && angDiff(a, u.facing) > 1.2) return;
    u.facing = a + 0.25 * Math.sin(this.t * 0.7 + u.idx * 1.9);
  };
  // R3 — relève dans les bonds : quand des équipiers tombent, les deux moitiés sont rééquilibrées (écart d'au plus un) ;
  // celui qui change de moitié le dit (« Je prends sa place ! »). get / set : lecture et écriture de sa moitié.
  Battle.prototype.rebalanceHalves = function (team, us, get, set) {
    if (us.length < 2) return;
    const h = [us.filter(a => get(a) === 0), us.filter(a => get(a) === 1)];
    if (Math.abs(h[0].length - h[1].length) < 2) return;
    const big = h[0].length > h[1].length ? 0 : 1, small = h[1 - big];
    // celui de la grande moitié le plus proche de la petite (sinon le dernier de la liste)
    const ref = small.length ? { x: small.reduce((s, a) => s + a.x, 0) / small.length, z: small.reduce((s, a) => s + a.z, 0) / small.length } : null;
    const mv = ref ? h[big].slice().sort((p, q) => Math.hypot(p.x - ref.x, p.z - ref.z) - Math.hypot(q.x - ref.x, q.z - ref.z) || (p.id < q.id ? -1 : 1))[0] : h[big][h[big].length - 1];
    set(mv, 1 - big);
    this.logEvent('releve', `${mv.callsign} : « Je prends sa place ! »`, { unit: mv.id, team: team.index, silent: true });
    this.rebalanceHalves(team, us, get, set);
  };
  // ---- Encercler (arrivée) : « localiser et circonscrire » ----------------------------------------------------------------
  // Le groupe se partage en deux sous-groupes qui prennent position de deux côtés du point (à ~8–14 m, à ~80–125° l'un de
  // l'autre autour de lui, du côté d'où l'on vient : jamais face à face, pas de tirs croisés entre eux), sur des couverts
  // d'où l'on voit le point et qu'un chemin rejoint. Chacun y tient face au point (son secteur principal). Renvoie une place
  // par opérateur ({ x, z, sect, hid, cx, cz, face }) ou null (pas de place : on retombe sur « tenir »).
  const ENC_R = [8, 14], ENC_SIDE = 0.85, ENC_WIN = 0.25;
  Battle.prototype.encircleSpots = function (team, units, p, dir) {
    const back = dir + Math.PI, sides = [back + ENC_SIDE, back - ENC_SIDE], m = this.map;
    // à chacun le côté le plus proche de lui (autour du point), moitié-moitié
    const sd = (u) => { let d = Math.atan2(u.z - p.z, u.x - p.x) - back; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
    const order = units.map((u, k) => k).sort((i, j) => sd(units[j]) - sd(units[i]) || i - j), nA = Math.ceil(units.length / 2);
    const out = new Array(units.length), taken = [];
    const free = (x, z) => !taken.some(q => Math.hypot(q.x - x, q.z - z) < ORDER_GAP - 0.5);
    for (let s = 0; s < 2; s++) {
      const ks = s === 0 ? order.slice(0, nA) : order.slice(nA), from = units[ks[0]];
      const score = (x, z, a0) => {
        const d = Math.hypot(x - p.x, z - p.z), a = Math.atan2(z - p.z, x - p.x);
        if (d < ENC_R[0] || d > ENC_R[1] || (a0 !== null && angDiff(a, a0) > ENC_WIN) || !free(x, z) || this.nearCorpse(x, z)) return -Infinity;
        return -Math.abs(d - 11) * 0.3 - (a0 === null ? 0 : angDiff(a, a0) * 4) + (this.coverAt(x, z, p.x, p.z, true) ? 3 : 0) + (m.hasLOS(x, EYE.stand, z, p.x, CHEST.stand, p.z) ? 2 : 0);
      };
      // le centre du sous-groupe : le meilleur couvert dans la fenêtre de son côté, sinon un point libre à 11 m
      let best = null, bs = -Infinity;
      for (const c0 of m.coverPoints) { const h = this.hug(c0), sc = score(h.hx, h.hz, sides[s]); if (sc > bs && m.findPath(from.x, from.z, h.hx, h.hz)) { bs = sc; best = { x: h.hx, z: h.hz }; } }
      if (!best) for (const R of [11, 9, 13]) { const q = this.orderPoint(p.x + Math.cos(sides[s]) * R, p.z + Math.sin(sides[s]) * R); if (q && free(q.x, q.z) && m.findPath(from.x, from.z, q.x, q.z)) { best = q; break; } }
      if (!best) return null;
      const face = Math.atan2(p.z - best.z, p.x - best.x), hid = 'e' + s;
      ks.forEach((k, i) => {
        let q = null;
        if (i === 0) q = best;
        else {
          let qs = -Infinity;
          for (const c0 of m.coverPoints) { const h = this.hug(c0); if (Math.hypot(h.hx - best.x, h.hz - best.z) > 5.5) continue; const sc = score(h.hx, h.hz, null) - Math.hypot(h.hx - best.x, h.hz - best.z) * 0.4; if (sc > qs && m.findPath(units[k].x, units[k].z, h.hx, h.hz)) { qs = sc; q = { x: h.hx, z: h.hz }; } }
          for (let j = 1; j < 8 && !q; j++) { const off = ORDER_GAP * Math.ceil(j / 2) * (j % 2 ? 1 : -1), r = this.orderPoint(best.x + Math.cos(face + Math.PI / 2) * off, best.z + Math.sin(face + Math.PI / 2) * off); if (r && free(r.x, r.z) && m.findPath(units[k].x, units[k].z, r.x, r.z)) q = r; }
          if (!q) q = best;
        }
        taken.push(q);
        out[k] = { x: q.x, z: q.z, sect: Math.atan2(p.z - q.z, p.x - q.x), hid, cx: best.x, cz: best.z, face };
      });
    }
    return out;
  };
  // ---- Franchissement (déplacement) : traverser un espace découvert sous appui --------------------------------------------
  // (« la rue tue » ; conception/doctrines/france.md §5 C3.) Le trajet est examiné à l'ordre : un tronçon d'au moins 5 m
  // sans obstacle à moins de 1,5 m et vu de l'ennemi (une position ennemie connue en vue, sinon une grande ouverture vers le
  // camp adverse — map.openness) est un « découvert ». Ailleurs, on progresse comme en méthodique. Au bord d'un découvert :
  //  1) halte, chacun à couvert au bord (place à soi), face au côté dangereux ;
  //  2) on traverse un par un (par deux à partir de quatre), au sprint, jusqu'à un couvert de l'autre côté ;
  //  3) le premier passé couvre l'autre côté, les suivants passent l'un après l'autre (0,6 s d'écart), les autres couvrent ;
  //  4) tous passés : on reprend la progression (découvert suivant, ou le point).
  const CROSS_CLEAR = 1.5, CROSS_OPEN = 3, CROSS_MIN = 6, CROSS_SKIP = 4, CROSS_GAP = 0.6, CROSS_RUN_MAX = 12, CROSS_WAIT = 8;
  Battle.prototype.clearance = function (x, z) {
    let n = Infinity; for (const o of this.map.obstacles) if (o.h >= COVER_MIN_H) n = Math.min(n, edgeDist(x, z, o)); return n;
  };
  Battle.prototype.pathLen = function (x0, z0, x1, z1) {
    if (this.map.walkableSegment(x0, z0, x1, z1)) return Math.hypot(x1 - x0, z1 - z0);
    const p = this.map.findPath(x0, z0, x1, z1); if (!p) return null;
    let L = Math.hypot(p[0].x - x0, p[0].z - z0) + Math.hypot(x1 - p[p.length - 1].x, z1 - p[p.length - 1].z);
    for (let i = 1; i < p.length; i++) L += Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z);
    return L;
  };
  Battle.prototype.findCrossings = function (team, x0, z0, x1, z1) {
    const path = this.map.findPath(x0, z0, x1, z1); if (!path) return [];
    // le trajet échantillonné tous les mètres (abscisse curviligne)
    const pts = [{ x: x0, z: z0 }].concat(path), S = [];
    let acc = 0, next = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], c = pts[i], L = Math.hypot(c.x - a.x, c.z - a.z);
      while (next <= acc + L) { const t = L > 1e-6 ? (next - acc) / L : 0; S.push({ x: a.x + (c.x - a.x) * t, z: a.z + (c.z - a.z) * t }); next += 1; }
      acc += L;
    }
    S.push({ x: x1, z: z1 });
    const dirx = Math.sign(this.map.spawns[1 - team.index].x - this.map.spawns[team.index].x) || 1, known = [];
    for (const a of team.units) if (a.alive) for (const id in a.knowledge) { const k = a.knowledge[id], e = this.unitById(id); if (e && e.alive && this.t - k.t < 30) known.push(k); }
    const open = S.map(q => this.clearance(q.x, q.z) >= CROSS_CLEAR && (known.some(k => Math.hypot(k.x - q.x, k.z - q.z) < 60 && this.map.hasLOS(k.x, EYE.stand, k.z, q.x, CHEST.stand, q.z)) || this.map.openness(q.x, q.z, dirx, 8) >= CROSS_OPEN));
    for (let i = 1; i < open.length - 1; i++) if (!open[i] && open[i - 1] && (open[i + 1] || (i + 2 < open.length && open[i + 2]))) open[i] = true;   // trous de 1–2 m : un seul découvert
    const out = [];
    for (let i = 0; i < open.length; i++) {
      if (!open[i]) continue;
      let j = i; while (j + 1 < open.length && open[j + 1]) j++;
      if (j - i + 1 >= CROSS_MIN && i >= CROSS_SKIP && out.length < 3) {
        const A = S[i - 1], B = S[Math.min(S.length - 1, j + 1)], L = Math.hypot(B.x - A.x, B.z - A.z) || 1, M = S[(i + j) >> 1];
        out.push({ ax: A.x, az: A.z, bx: B.x, bz: B.z, mx: M.x, mz: M.z, fx: (B.x - A.x) / L, fz: (B.z - A.z) / L, end: j + 1 >= S.length - 1 });
      }
      i = j;
    }
    return out;
  };
  // côté dangereux d'un découvert : l'ennemi connu le plus proche du milieu ; sinon, de travers, du côté du camp adverse
  // (en enfilade de l'allée) — ou devant si l'on traverse droit vers lui
  Battle.prototype.crossDanger = function (team, C) {
    let best = null, bd = 60;
    for (const a of team.units) if (a.alive) for (const id in a.knowledge) { const k = a.knowledge[id], e = this.unitById(id); if (!e || !e.alive || this.t - k.t > 20) continue; const d = Math.hypot(k.x - C.mx, k.z - C.mz); if (d < bd) { bd = d; best = k; } }
    if (best) return { x: best.x, z: best.z };
    const ex = Math.sign(this.map.spawns[1 - team.index].x - this.map.spawns[team.index].x) || 1;
    if (Math.abs(C.fx) > 0.7 && C.fx * ex > 0) return { x: C.bx + C.fx * 20, z: C.bz + C.fz * 20 };
    const n = (-C.fz * ex) >= 0 ? { x: -C.fz, z: C.fx } : { x: C.fz, z: -C.fx };
    return { x: C.mx + n.x * 20, z: C.mz + n.z * 20 };
  };
  // une place à couvert au bord (côté départ : far = false) ou de l'autre côté (far = true) du découvert, à soi seul
  Battle.prototype.crossSpot = function (u, g, C, far) {
    const tab = far ? g.far : g.stage; if (tab[u.id]) return tab[u.id];
    const o = u.moveOrder, ref = far ? { x: C.bx, z: C.bz } : { x: C.ax, z: C.az }, dg = this.crossDanger(this.teams[u.team], C);
    if (far && C.end) return (tab[u.id] = { x: o.x, z: o.z });                 // le découvert va jusqu'au point : sa place d'arrivée
    const others = Object.keys(tab).map(k => tab[k]);
    const ok = (x, z) => !others.some(q => Math.hypot(q.x - x, q.z - z) < 2.2) && !this.nearCorpse(x, z);
    let best = null, bs = -Infinity;
    for (const c0 of this.map.coverPoints) {
      const h = this.hug(c0), d = Math.hypot(h.hx - ref.x, h.hz - ref.z); if (d > 6) continue;
      const pr = (h.hx - ref.x) * C.fx + (h.hz - ref.z) * C.fz; if (far ? pr < -0.5 : pr > 0.5) continue;   // du bon côté du découvert
      if (!ok(h.hx, h.hz)) continue;
      let sc = -d + (this.coverAt(h.hx, h.hz, dg.x, dg.z, true) ? 3 : 0);
      if (sc - Math.hypot(h.hx - u.x, h.hz - u.z) * 0.3 <= bs) continue;
      // par un chemin court (pas de détour qui ramène en arrière ou fait le tour d'une rangée de voitures)
      const L = this.pathLen(u.x, u.z, h.hx, h.hz); if (L === null || L > Math.hypot(ref.x - u.x, ref.z - u.z) + 6) continue;
      sc -= L * 0.3;
      if (sc > bs) { bs = sc; best = { x: h.hx, z: h.hz }; }
    }
    for (let j = 0; j < 9 && !best; j++) {
      const off = 2.5 * Math.ceil(j / 2) * (j % 2 ? 1 : -1), q = this.orderPoint(ref.x - C.fz * off, ref.z + C.fx * off);
      if (q && ok(q.x, q.z) && this.map.findPath(u.x, u.z, q.x, q.z)) best = q;
    }
    return (tab[u.id] = best || { x: ref.x, z: ref.z });
  };
  // phases du groupe (appelé à chaque pas, avant les bonds) : halte au bord → passages un par un (ou deux par deux)
  Battle.prototype.updateCrossing = function (team, g, act) {
    const C = g.cross && g.cross[g.ci]; if (!C || !act.length) return;
    if (g.phase === 'move') {
      const at = act.filter(u => g.stage[u.id] && !u.goal && Math.hypot(g.stage[u.id].x - u.x, g.stage[u.id].z - u.z) < 1.3);
      if (at.length && g.firstAt === undefined) g.firstAt = this.t;
      if (at.length === act.length || (at.length && this.t - g.firstAt > CROSS_WAIT)) {
        g.phase = 'cross'; g.runners = []; g.crossed = []; g.nextAt = this.t + 0.4;
        g.queue = act.map(u => u.id).sort((i, j) => { const a = this.unitById(i), b = this.unitById(j); return Math.hypot(a.x - C.bx, a.z - C.bz) - Math.hypot(b.x - C.bx, b.z - C.bz) || (i < j ? -1 : 1); });
        if (g.fumee) {   // avec fumée : le premier qui a un fumigène le lance côté danger ; on passe quand le nuage est là (lui en dernier)
          const dg = this.crossDanger(team, C), sm = this.coverSmoke(act, C.mx, C.mz, dg.x, dg.z, 'le passage');
          if (sm) { g.nextAt = Math.max(g.nextAt, sm.ready + 0.3); g.queue = g.queue.filter(id => id !== sm.u.id).concat([sm.u.id]); }
        }
        this.logEvent('franchir', `${team.name} : découvert devant — on passe ${act.length >= 4 ? 'deux par deux' : 'un par un'}, sous appui.`, { team: team.index, ordre: g.id, unit: act[0].id, silent: true });
      }
      return;
    }
    // passage en cours : un coureur est arrivé (marqué par followCross), tombé, ou n'est plus de l'ordre
    const live = (id) => { const u = this.unitById(id); return u && u.alive && u.moveOrder && u.moveOrder.id === g.id; };
    for (const id of g.runners) if (!g.crossed.includes(id) && (!live(id) || this.t - g.runAt > CROSS_RUN_MAX)) g.crossed.push(id);
    if (!g.runners.every(id => g.crossed.includes(id))) { g.nextAt = this.t + CROSS_GAP; return; }
    g.queue = g.queue.filter(live);
    if (!g.queue.length) {
      g.ci++; g.phase = 'move'; g.firstAt = undefined; g.stage = {}; g.far = {}; g.runners = []; g.bound.since = this.t; g.bound.n++;
      this.logEvent('franchir', `${team.name} : tout le monde est passé.`, { team: team.index, ordre: g.id, silent: true });
      return;
    }
    if (this.t < g.nextAt) return;
    g.runners = g.queue.splice(0, act.length >= 4 ? 2 : 1); g.runAt = this.t;
    const cover = act.filter(u => !g.runners.includes(u.id));
    this.logEvent('bond', `${team.name} — ${g.runners.map(id => this.unitById(id).callsign).join(', ')} : « Je passe ! »${cover.length ? ` ${cover[0].callsign} : « Couvert ! »` : ''}`, { team: team.index, unit: g.runners[0], couvre: cover.length ? cover[0].id : null, silent: true });
  };
  // un opérateur d'un groupe en franchissement
  Battle.prototype.followCross = function (u, o, tp, threats, dNow) {
    const g = (this.teams[u.team].moveGroups || []).find(x => x.id === o.id), C = g && g.cross && g.cross[g.ci];
    if (!C) { this.orderBound(u, o, tp, threats, dNow); return; }
    const dg = this.crossDanger(this.teams[u.team], C);
    const holdAt = (q, cov) => {                                             // à sa place : couvre le côté dangereux
      if (Math.hypot(q.x - u.x, q.z - u.z) > 1.0 && this.setGoal(u, q.x, q.z, 'cover')) { u.state = 'tocover'; u.stance = 'stand'; return; }
      this.stop(u); o.doneN = g.bound.n;
      if (threats.length) { u.state = 'engage'; u.stance = (u.reloading > 0 && this.coverAt(u.x, u.z, dg.x, dg.z, true)) ? 'crouch' : 'stand'; return; }
      if (!u.target || !u.target.alive) u.facing = Math.atan2(dg.z - u.z, dg.x - u.x) + (cov ? 0 : 0.35 * Math.sin(this.t * 0.7 + u.idx));
      u.state = 'overwatch'; u.stance = this.waitStance(u, dg);
    };
    if (g.phase === 'move') {
      const st = this.crossSpot(u, g, C, false), d = Math.hypot(st.x - u.x, st.z - u.z);
      if (d < 1.3 && !(u.goal && u.goalKind === 'bound')) { holdAt(st, true); return; }
      const sx = o.x, sz = o.z; o.x = st.x; o.z = st.z;                       // bonds méthodiques jusqu'au bord
      try { this.orderBound(u, o, tp, threats, d); } finally { o.x = sx; o.z = sz; }
      return;
    }
    if (g.crossed.includes(u.id)) { holdAt(this.crossSpot(u, g, C, true), false); return; }   // passé : couvre l'autre côté
    if (g.runners.includes(u.id)) {
      const f = this.crossSpot(u, g, C, true);
      if (Math.hypot(f.x - u.x, f.z - u.z) < 1.0) { g.crossed.push(u.id); holdAt(f, false); return; }
      if (this.setGoal(u, f.x, f.z, 'cover')) { u.state = 'crossing'; u.stance = 'stand'; return; }
      g.crossed.push(u.id); holdAt(u, false); return;
    }
    holdAt(this.crossSpot(u, g, C, false), true);                             // attend son tour au bord, en appui
  };
  Battle.prototype.groupActive = function (g) { return g.members.some(id => { const u = this.unitById(id); return u && u.alive && u.moveOrder && u.moveOrder.id === g.id; }); };
  const boundingNow = (u, b) => u.moveOrder.half === b.group && u.moveOrder.doneN !== b.n;
  // bonds alternés de chaque groupe « méthodique » (même règle que le Tiroir, mais pour les seuls opérateurs de l'ordre)
  Battle.prototype.updateMoveGroups = function () {
    for (const team of this.teams) {
      if (!team.moveGroups || !team.moveGroups.length) continue;
      team.moveGroups = team.moveGroups.filter(g => this.groupActive(g));
      for (const g of team.moveGroups) {
        if (g.mode !== 'methodique' && g.mode !== 'franchir' && g.mode !== 'decrocher' && g.mode !== 'discret') continue;   // (discret : les bonds méthodiques, accroupis)
        const act = g.members.map(id => this.unitById(id)).filter(u => u && u.alive && u.moveOrder && u.moveOrder.id === g.id);
        if (act.length < g.members.length) this.rebalanceHalves(team, act, u => u.moveOrder.half, (u, h) => { u.moveOrder.half = h; });   // un équipier tombé : moitiés refaites
        if (g.mode === 'franchir') { this.updateCrossing(team, g, act); if (g.phase === 'cross') continue; }   // pas de bonds pendant un passage
        const mv = act.filter(u => !u.moveOrder.fouille); if (!mv.length) continue;   // A5 : ceux qui fouillent ne font plus de bonds
        const b = g.bound, movers = mv.filter(u => u.moveOrder.half === b.group), others = mv.filter(u => u.moveOrder.half !== b.group);
        const el = this.t - b.since, fast = g.mode === 'decrocher';   // décrocher : on inverse dès que les coureurs sont à couvert
        const done = !movers.length || (el > (fast ? 1 : 2.5) && movers.every(u => u.moveOrder.doneN === b.n || BUSY[u.state])) || el > (fast ? 8 : 12);
        if (!done) continue;
        b.since = this.t; b.n++;
        if (!others.length) continue;                       // une seule moitié encore en route : elle enchaîne les bonds
        b.group = 1 - b.group;
        this.logEvent('bond', `${team.name} — ${others.map(u => u.callsign).join(', ')} : « Je bouge ! »${movers.length ? ` ${movers.map(u => u.callsign).join(', ')} : « Couvert ! »` : ''}`, { team: team.index, unit: others[0].id, couvre: movers.length ? movers[0].id : null, silent: true, mode: g.mode });
      }
    }
  };
  Battle.prototype.followMoveOrder = function (u, threats, beingShot) {
    const o = u.moveOrder;
    // D7 : étape en cours (point de passage) — même façon de se déplacer, vers sa place à l'étape ; passée à VIA_NEAR m
    while (o.via && o.vi < o.via.length && Math.hypot(o.via[o.vi].x - u.x, o.via[o.vi].z - u.z) < VIA_NEAR) {
      o.vi++; const inf = this.teams[u.team].ordInfo && this.teams[u.team].ordInfo[o.id];
      if (inf && inf.viaDone < o.vi) { inf.viaDone = o.vi; this.logEvent('passage', `${u.callsign} : « Point de passage ${o.vi} ! »`, { unit: u.id, team: u.team, ordre: o.id, silent: true }); }
    }
    if (o.via && o.vi < o.via.length) {
      const w = o.via[o.vi], sx = o.x, sz = o.z, sd = o.dir; o.x = w.x; o.z = w.z; o.dir = Math.atan2(w.z - u.z, w.x - u.x);
      try { this.followMoveStep(u, o, threats, beingShot, Math.hypot(w.x - u.x, w.z - u.z)); } finally { o.x = sx; o.z = sz; o.dir = sd; }
      return;
    }
    const dNow = Math.hypot(o.x - u.x, o.z - u.z);
    if (o.fouille) { this.orderSearch(u, o, threats); return; }
    // arrivé (ou sa place est prise par un équipier debout dessus : on s'arrête à côté)
    if ((dNow < 0.8 || (dNow < 1.6 && !u.goal && this.teams[u.team].units.some(a => a !== u && a.alive && Math.hypot(a.x - o.x, a.z - o.z) < 0.9))) && o.arrivee === 'fouiller') { o.fouille = { since: this.t }; this.orderSearch(u, o, threats); return; }
    if (dNow < 0.8 || (dNow < 1.6 && !u.goal && this.teams[u.team].units.some(a => a !== u && a.alive && Math.hypot(a.x - o.x, a.z - o.z) < 0.9))) { this.arriveOrder(u); if (u.keyOrder) this.followKeyOrder(u, threats); return; }
    this.followMoveStep(u, o, threats, beingShot, dNow);
  };
  Battle.prototype.followMoveStep = function (u, o, threats, beingShot, dNow) {
    const th = threats.length ? (beingShot && u.lastShotBy && u.lastShotBy.alive ? u.lastShotBy : (u.target && u.target.alive ? u.target : threats[0])) : this.mainThreat(u);
    const tp = th || { x: o.x + Math.cos(o.dir) * 25, z: o.z + Math.sin(o.dir) * 25 };   // sans menace : dans le sens de la marche
    const g = o.mode === 'franchir' && (this.teams[u.team].moveGroups || []).find(x => x.id === o.id), C = g && g.cross && g.cross[g.ci];
    if (o.mode === 'agressif') this.orderRush(u, o, tp, threats, beingShot, dNow);
    else if (o.mode === 'franchir' && C && C.leg > (o.vi || 0)) this.orderBound(u, o, tp, threats, dNow);   // découvert d'une étape plus loin : d'abord le point de passage
    else if (o.mode === 'franchir') this.followCross(u, o, tp, threats, dNow);
    else if (o.mode === 'decrocher') this.orderFallback(u, o, th || { x: u.x - Math.cos(o.dir) * 25, z: u.z - Math.sin(o.dir) * 25 }, threats, dNow);   // sans menace connue : derrière la marche
    else this.orderBound(u, o, tp, threats, dNow);
  };
  // A5 — arrivée « fouiller » : arrivé, chacun va voir derrière les couverts autour du point (rayon FOUILLE_R, au plus
  // FOUILLE_N places, partagées par le groupe : le plus proche d'une place libre la prend) pour débusquer un ennemi caché ;
  // un ennemi en vue : on se bat (d'un couvert proche) ; tout est vu (ou FOUILLE_MAX s) : on tient là où l'on est.
  const FOUILLE_R = 12, FOUILLE_N = 8, FOUILLE_MAX = 40;
  Battle.prototype.orderSearch = function (u, o, threats) {
    const team = this.teams[u.team], inf = team.ordInfo && team.ordInfo[o.id] || {};
    if (!inf.fx) {   // les places à voir : derrière les couverts autour du point, espacées d'au moins 3 m, les plus proches d'abord
      const P = { x: o.enc ? o.enc.x : inf.px !== undefined ? inf.px : o.x, z: o.enc ? o.enc.z : inf.pz !== undefined ? inf.pz : o.z }, L = [];
      const cs = this.map.coverPoints.map(c0 => { const h = this.hug(c0); return { x: h.hx, z: h.hz, d: Math.hypot(h.hx - P.x, h.hz - P.z) }; }).filter(c => c.d <= FOUILLE_R).sort((a, b) => a.d - b.d || a.x - b.x || a.z - b.z);
      for (const c of cs) { if (L.length >= FOUILLE_N) break; if (!L.some(q => Math.hypot(q.x - c.x, q.z - c.z) < 3) && this.map.findPath(P.x, P.z, c.x, c.z)) L.push({ x: c.x, z: c.z, seen: false, by: null }); }
      inf.fx = L; inf.fSaid = false;
    }
    if (threats.length) {   // contact : on se bat, d'un couvert proche si l'on est à découvert
      const tp = threats[0];
      if (!this.coverAt(u.x, u.z, tp.x, tp.z, true) && !(u.goal && u.goalKind === 'cover')) { const cp = this.findCover(u, tp, 5, { requireShoot: true }); if (cp && Math.hypot(cp.x - u.x, cp.z - u.z) > 0.6 && this.setGoal(u, cp.x, cp.z, 'cover')) { u.state = 'tocover'; u.stance = 'stand'; return; } }
      if (!(u.goal && u.goalKind === 'cover')) { this.stop(u); u.state = 'engage'; u.stance = 'stand'; }
      return;
    }
    for (const q of inf.fx) if (!q.seen && Math.hypot(q.x - u.x, q.z - u.z) < 1.5) q.seen = true;   // vu
    let q = inf.fx.find(f => f.by === u.id && !f.seen);
    if (!q) {
      const taken = (f) => { if (!f.by || f.by === u.id) return false; const a = this.unitById(f.by); return !!(a && a.alive && a.moveOrder && a.moveOrder.id === o.id); };   // pris par un équipier qui fouille encore
      let bd = Infinity; for (const f of inf.fx) { if (f.seen || taken(f)) continue; const d = Math.hypot(f.x - u.x, f.z - u.z); if (d < bd) { bd = d; q = f; } }
      if (q) q.by = u.id;
    }
    if (!q || this.t - o.fouille.since > FOUILLE_MAX) {
      if (!inf.fSaid) { inf.fSaid = true; this.logEvent('fouille', `${team.name} : secteur fouillé${q ? ' (en partie)' : ''}, on tient.`, { team: u.team, unit: u.id, ordre: o.id }); }
      o.arrivee = 'tenir'; o.fouille = null; o.sect = undefined; this.arriveOrder(u); if (u.keyOrder) this.followKeyOrder(u, threats); return;
    }
    if (!(u.goal && u.goalKind === 'advance' && Math.hypot(u.goal.x - q.x, u.goal.z - q.z) < 0.5)) { if (!this.setGoal(u, q.x, q.z, 'advance')) { q.seen = true; return; } }
    u.state = 'search'; u.stance = 'stand';
  };
  Battle.prototype.orderRush = function (u, o, tp, threats, beingShot, dNow) {
    const face = () => { if (!u.target || !u.target.alive) u.facing = Math.atan2(tp.z - u.z, tp.x - u.x); };
    if (o.halting) {                                                     // en route vers l'abri de la halte
      if (u.goal && u.goalKind === 'cover' && this.t - o.halting < 3) return;
      o.halting = 0; o.haltUntil = this.t + 1.1;
    }
    if (this.t < (o.haltUntil || 0)) { this.stop(u); u.state = threats.length ? 'engage' : 'pause'; u.stance = (u.reloading > 0 && this.coverAt(u.x, u.z, tp.x, tp.z, false)) ? 'crouch' : 'stand'; face(); return; }
    if (beingShot && this.t - (o.lastHalt || -99) > 6 && !this.coverAt(u.x, u.z, tp.x, tp.z, true)) {
      const cp = this.findCover(u, tp, 5, { towards: o });
      if (cp && Math.hypot(cp.x - o.x, cp.z - o.z) < dNow + 1 && this.setGoal(u, cp.x, cp.z, 'cover')) {
        o.halting = this.t; o.lastHalt = this.t; u.state = 'tocover'; u.stance = 'stand';
        this.logEvent('couvre', `${u.callsign} : « Couvert ! »`, { unit: u.id, team: u.team, silent: true }); return;
      }
    }
    if (this.t < o.departAt) { this.stop(u); u.state = threats.length ? 'engage' : 'pause'; u.stance = 'stand'; face(); return; }   // départ échelonné
    // un équipier de l'ordre juste devant (< 2,5 m, dans le sens de la course) : on lève le pied le temps que l'écart se refasse
    const mx = o.x - u.x, mz = o.z - u.z, mL = Math.hypot(mx, mz) || 1;
    const tight = this.teams[u.team].units.some(a => a !== u && a.alive && a.moveOrder && a.moveOrder.id === o.id && a.moving && Math.hypot(a.x - u.x, a.z - u.z) < 2.5 && ((a.x - u.x) * mx + (a.z - u.z) * mz) / mL > 0.3);
    if (this.setGoal(u, o.x, o.z, 'order')) { u.state = tight ? 'advancing' : 'rush'; u.stance = 'stand'; return; }
    this.arriveOrder(u); if (u.keyOrder) this.followKeyOrder(u, threats);                // plus de chemin : on tient où l'on est
  };
  Battle.prototype.orderBound = function (u, o, tp, threats, dNow) {
    const g = (this.teams[u.team].moveGroups || []).find(x => x.id === o.id), b = g ? g.bound : { group: o.half, n: 0 };
    if (u.goal && (u.goalKind === 'bound' || u.goalKind === 'cover')) return;      // bond (ou mise à couvert) en cours : on le termine
    if (o.goalN === b.n) o.doneN = b.n;                                              // bond terminé
    const cover = this.coverAt(u.x, u.z, tp.x, tp.z, true);
    const pinned = u.suppression > 0.8 - u.def.composure / 400 + (has(u, 'steady') ? 0.15 : 0) + (this.nearLeader(u) ? 0.1 : 0);
    if (pinned && cover) { this.stop(u); u.state = 'pinned'; u.stance = 'crouch'; return; }
    if (!boundingNow(u, b) || this.t < u.pauseUntil) {
      // en appui : arrêté ; une cible en vue → on tire (d'un vrai couvert proche si l'on est à découvert) ; sinon son secteur
      this.stop(u);
      if (threats.length) {
        if (!cover) { const cp = this.findCover(u, tp, 5, { requireShoot: true, towards: o, notBehind: o }); if (cp && Math.hypot(cp.x - u.x, cp.z - u.z) > 0.6 && this.setGoal(u, cp.x, cp.z, 'cover')) { u.state = 'tocover'; u.stance = 'stand'; return; } }
        u.state = 'engage'; u.stance = ((u.reloading > 0 || this.t < (u.burstPauseUntil || 0)) && cover) ? 'crouch' : 'stand'; return;
      }
      const cov = g ? g.members.map(id => this.unitById(id)).filter(a => a && a.alive && a.moveOrder && a.moveOrder.id === g.id && !boundingNow(a, b)) : [u];
      const r = Math.max(0, cov.indexOf(u)), base = Math.atan2(tp.z - u.z, tp.x - u.x);
      u.facing = cov.length >= 3 && r === cov.length - 1 ? base + Math.PI : base + SECTORS[r % 3];   // serre-file : l'arrière
      if (cov.length >= 3 && r === cov.length - 1) u.rearWatch = this.t;                              // (il ne se retourne pas sur un « Contact ! »)
      u.state = boundingNow(u, b) ? 'pause' : 'overwatch'; u.stance = this.waitStance(u, tp); return;
    }
    // à son tour de bondir : jusqu'au point s'il est proche, sinon au couvert suivant (≤ 9 m), sinon 7 m le long du chemin
    let gx = o.x, gz = o.z, fx = o.x, fz = o.z;   // f : repli si le bond vers un couvert ferait un détour (refusé par setGoal)
    if (dNow > BOUND_MAX + 1) {
      const path = this.map.findPath(u.x, u.z, o.x, o.z);
      if (!path) { this.arriveOrder(u); if (u.keyOrder) this.followKeyOrder(u, threats); return; }
      let px = u.x, pz = u.z, left = BOUND_BARE;
      for (const q of path) { const d = Math.hypot(q.x - px, q.z - pz); if (d >= left) { px += (q.x - px) / d * left; pz += (q.z - pz) / d * left; left = 0; break; } left -= d; px = q.x; pz = q.z; }
      const cp = this.findCover(u, tp, BOUND_MAX, { towards: { x: px, z: pz } });
      ({ x: fx, z: fz } = this.spreadGoal(u, px, pz));
      if (cp && Math.hypot(cp.x - o.x, cp.z - o.z) < dNow - 2.5) { gx = cp.x; gz = cp.z; } else { gx = fx; gz = fz; }
    }
    if (this.setGoal(u, gx, gz, 'bound') || this.setGoal(u, fx, fz, 'cover')) { o.goalN = b.n; u.boundGoalN = undefined; u.state = 'bounding'; u.stance = 'stand'; return; }
    o.doneN = b.n; this.stop(u); u.state = 'overwatch';
  };
  // arrivée « tenir » : poste sur un vrai couvert tout proche face à la menace (ou au sens de la marche) → ordre de poste
  Battle.prototype.arriveOrder = function (u) {
    const o = u.moveOrder; u.moveOrder = null;
    if (o.arrivee === 'manoeuvre') { this.resumeManoeuvre(u, o); return; }
    // (tous azimuts : le poste couvre de la menace connue, ou de son secteur ; le serre-file, de l'arrière)
    const th = this.mainThreat(u), thb = th ? Math.atan2(th.z - u.z, th.x - u.x) : null, ring = o.sect !== undefined, face = ring ? (thb !== null && angDiff(o.sect, thb) < 2.1 ? thb : o.sect) : thb !== null ? thb : o.dir;
    const tp = { x: u.x + Math.cos(face) * 20, z: u.z + Math.sin(face) * 20 };
    // poste : un vrai couvert face à la menace à ≤ 5 m de sa place, à ORDER_GAP au moins de tout équipier (debout, en route,
    // ou à son poste) — l'escouade se répartit sur les couverts autour du point au lieu de s'agglutiner
    const taken = [];
    for (const a of this.alliesOf(u)) if (a.alive) { taken.push(a); if (a.goal) taken.push(a.goal); if (a.keyOrder) taken.push(a.keyOrder); if (a.moveOrder) taken.push(a.moveOrder); }
    const free = (x, z) => !taken.some(q => Math.hypot(q.x - x, q.z - z) < ORDER_GAP - 0.5);
    let post = { x: u.x, z: u.z };
    if (!(this.coverAt(u.x, u.z, tp.x, tp.z, true) && free(u.x, u.z))) {
      let best = null, bs = -Infinity;
      for (const c0 of this.map.coverPoints) {
        if (Math.abs(c0.x - u.x) > 6 || Math.abs(c0.z - u.z) > 6) continue;
        const h = this.hug(c0), d = Math.hypot(h.hx - u.x, h.hz - u.z); if (d > 5 || !free(h.hx, h.hz) || this.nearCorpse(h.hx, h.hz)) continue;
        if (ring && Math.hypot(h.hx - o.px, h.hz - o.pz) > HOLD_ZONE) continue;
        if (!this.coverAt(h.hx, h.hz, tp.x, tp.z, true)) continue;
        const sc = -d + (this.map.hasLOS(h.hx, EYE.stand, h.hz, tp.x, CHEST.stand, tp.z) ? 2 : 0) + this.rng.next() * 0.01;
        if (sc > bs) { bs = sc; best = { x: h.hx, z: h.hz }; }
      }
      if (best && this.map.findPath(u.x, u.z, best.x, best.z)) post = best;
    }
    u.keyOrder = { id: 'ordre' + o.id, nom: 'point ordonné', x: post.x, z: post.z, r: 2.5, menace: face, held: true, ordre: o.hid !== undefined ? o.hid : o.id, grp: o.id };
    if (ring) Object.assign(u.keyOrder, { cx: o.px, cz: o.pz, face0: o.face, sect: o.sect, hx: post.x, hz: post.z });
    if (o.enc) u.keyOrder.enc = o.enc;
    this.stop(u); u.commitUntil = 0;
    this.logEvent('enplace', `${u.callsign} : « En place. »`, { unit: u.id, team: u.team, ordre: o.id, silent: true });
    const team = this.teams[u.team], g = (team.moveGroups || []).find(x => x.id === o.id);
    if (g && !this.groupActive(g)) {
      const here = g.members.map(id => this.unitById(id)).filter(a => a && a.alive && a.keyOrder && a.keyOrder.grp === o.id).map(a => a.callsign);
      this.logEvent('enplace', `${team.name} : ${here.join(', ')} ${here.length > 1 ? 'sont en place et tiennent' : 'est en place et tient'} ${o.enc ? 'le point encerclé, de deux côtés' : 'la position'}.`, { team: u.team, ordre: o.id });
    }
  };
  // arrivée « reprendre la manœuvre » : l'ordre s'efface et l'opérateur reprend la conduite autonome de l'escouade (voies,
  // Tiroir, ordre d'équipe, IA habituelle) à partir d'où il est. Rien ne le ramène en arrière : sa voie devient la plus
  // proche (son écart latéral est gardé : l'espacement de l'arrivée se conserve), ses anciens poste, point de ratissage et
  // ralliement de voie sont oubliés ; tireur d'élite, ou équipe en « Tenir » : son poste est là où il est arrivé.
  Battle.prototype.resumeManoeuvre = function (u, o) {
    const team = this.teams[u.team], v = this.map.def.voies;
    this.stop(u); u.keyOrder = null; u.commitUntil = 0; u.pauseUntil = 0;
    u.zoneSpot = null; u.searchGoal = null; u.searchSince = undefined; u.rejoin = false; u.flankDone = false;
    if (v && u.voie !== null && u.voie !== undefined) {
      let best = null;
      for (const [l, z] of [[-1, v.nord], [0, v.milieu], [1, v.sud]]) if (!best || Math.abs(u.z - z) < Math.abs(u.z - best[1])) best = [l, z];
      u.voie = best[0]; u.laneDz = clamp(u.z - best[1], -4, 4);
    }
    u.post = u.role.id === 'marksman' || team.order === 'hold' ? { x: u.x, z: u.z } : null;
    u.resumedAt = this.t; u.resumedOrder = o.id;
    this.logEvent('reprise', `${u.callsign} : « Je reprends ma progression. »`, { unit: u.id, team: u.team, ordre: o.id, silent: true });
    const g = (team.moveGroups || []).find(x => x.id === o.id);
    if (g && !this.groupActive(g)) {
      const here = g.members.map(id => this.unitById(id)).filter(a => a && a.alive && a.resumedOrder === o.id && !a.keyOrder && !a.moveOrder).map(a => a.callsign);
      if (here.length) this.logEvent('reprise', `${team.name} : ${here.join(', ')} ${here.length > 1 ? 'sont arrivés et reprennent' : 'est arrivé et reprend'} la manœuvre.`, { team: u.team, ordre: o.id });
    }
  };
  // Épauler : un équipier proche échange des tirs (il tire ou on lui tire dessus) et je ne vois personne. Il me crie la
  // position (connue tout de suite, pas au prochain échange radio) ; si je vois l'endroit d'où je suis, je me tourne vers
  // lui, arme prête ; sinon je me décale de quelques mètres vers un point d'où je peux tirer (de préférence à couvert).
  // En « tenir » : on bouge peu (4 m au plus).
  const SUPPORT_R = 22, SUPPORT_MOVE = 9;
  Battle.prototype.supportAlly = function (u, order) {
    let E = null, best = Infinity, from = null;
    for (const a of this.alliesOf(u)) {
      if (a === u || !a.alive || Math.hypot(a.x - u.x, a.z - u.z) > SUPPORT_R) continue;
      const cands = [];
      if (this.t - a.lastShotByAt < 4 && a.lastShotBy && a.lastShotBy.alive) cands.push(a.lastShotBy);
      if (this.t - a.lastShotAt < 3 && a.target && a.target.alive) cands.push(a.target);
      for (const e of cands) {
        const d = Math.hypot(e.x - u.x, e.z - u.z); if (d >= best || d >= 70) continue;
        // deux en appui sur le même ennemi au plus : les autres gardent leur secteur
        if (!(u.support && u.support.id === e.id) && this.alliesOf(u).filter(b => b !== u && b.alive && b.support && b.support.id === e.id && this.t < b.support.until).length >= 2) continue;
        best = d; E = e; from = a;
      }
    }
    if (!E) { u.support = null; return false; }
    // l'appel « contact ! » : la position que l'équipier connaît (il le voit, ou il voit d'où partent les coups)
    const ka = from.knowledge[E.id], k0 = u.knowledge[E.id];
    const src = from.visible.has(E.id) ? { x: E.x, z: E.z } : ka ? { x: ka.x, z: ka.z } : { x: E.x + (this.rng.next() - 0.5) * 4, z: E.z + (this.rng.next() - 0.5) * 4 };
    if (!k0 || this.t - k0.t > 0.3) u.knowledge[E.id] = { x: src.x, z: src.z, t: this.t, seen: false, source: 'radio' };
    const k = u.knowledge[E.id];
    if (u.target !== E) this.aimAt(u, E);
    // déjà en route vers sa position d'appui contre ce même ennemi : on continue
    if (u.support && u.support.id === E.id && u.goal && this.t < u.support.until) return true;
    const losFrom = (x, z) => this.map.hasLOS(x, EYE.stand, z, k.x, CHEST.stand, k.z);
    // il voit l'endroit d'ici, mais à découvert : un couvert proche d'où l'on tire aussi, sinon on reste
    if (losFrom(u.x, u.z) && !this.coverAt(u.x, u.z, k.x, k.z, true)) {
      const c = this.findCover(u, k, order === 'hold' ? 4 : SUPPORT_MOVE, { requireShoot: true, minRange: 5 });
      if (c && Math.hypot(c.x - u.x, c.z - u.z) > 0.6 && this.setGoal(u, c.x, c.z, 'cover')) { u.state = 'tocover'; u.stance = 'stand'; u.support = { id: E.id, until: this.t + 4 }; return true; }
    }
    if (losFrom(u.x, u.z)) {
      this.stop(u); u.state = 'overwatch';
      u.stance = this.coverAt(u.x, u.z, k.x, k.z, false) && this.map.hasLOS(u.x, EYE.crouch, u.z, k.x, CHEST.stand, k.z) ? 'crouch' : 'stand';
      u.facing = Math.atan2(k.z - u.z, k.x - u.x);
      u.support = { id: E.id, until: this.t + 4 };
      return true;
    }
    const R = order === 'hold' ? 4 : SUPPORT_MOVE;
    let open = null;
    let p = this.findCover(u, k, R, { requireShoot: true, minRange: 5 });
    if (!p) {   // pas de couvert d'où tirer : le point dégagé le plus proche (anneaux de 2 à R m)
      // (un point à couvert d'abord ; sinon le premier dégagé, gardé pour la fin)
      for (let r = 2; r <= R && !p; r += 1.5) for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2, x = u.x + Math.cos(a) * r, z = u.z + Math.sin(a) * r;
        if (!this.map.inBounds(x, z) || this.map.insideObstacle(x, z) || Math.hypot(x - k.x, z - k.z) < 6 || !losFrom(x, z)) continue;
        if (!this.map.walkableSegment(u.x, u.z, x, z)) continue;
        if (this.coverAt(x, z, k.x, k.z, false)) { p = { x, z }; break; }
        if (!open) open = { x, z };
      }
    }
    // sinon : venir à hauteur de l'équipier (lui voit l'ennemi), à côté de lui et pas dans sa ligne de tir
    const dA = Math.hypot(from.x - u.x, from.z - u.z);
    if (!p && order !== 'hold' && dA > 3) {
      p = this.findCover(u, k, Math.min(SUPPORT_R, dA + 5), { requireShoot: true, minRange: 5, towards: from });
      if (p && Math.hypot(p.x - from.x, p.z - from.z) > 7) p = null;
      if (!p) {
        const ax = k.x - from.x, az = k.z - from.z, L = Math.hypot(ax, az) || 1, nx = -az / L, nz = ax / L;
        const side = (u.x - from.x) * nx + (u.z - from.z) * nz >= 0 ? 1 : -1;   // du côté d'où l'on arrive
        for (const [off, back] of [[2.5, 0.5], [-2.5, 0.5], [4, 1], [-4, 1], [3, 2.5], [-3, 2.5]]) {
          const x = from.x + nx * off * side - ax / L * back, z = from.z + nz * off * side - az / L * back;
          if (!this.map.inBounds(x, z) || this.map.insideObstacle(x, z) || !losFrom(x, z)) continue;
          if (this.coverAt(x, z, k.x, k.z, false)) { p = { x, z }; break; }
          if (!open) open = { x, z };
        }
      }
    }
    if (!p) p = open;
    if (!p || !this.setGoal(u, p.x, p.z, 'close')) { u.support = null; return false; }
    u.state = 'tocover'; u.stance = 'stand'; u.support = { id: E.id, until: this.t + 5 };
    return true;
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
    u.holdFire = this.fireHeld(u);   // ordre du clic droit en « feu retenu » : ni tir ni grenade (voir act)
    if (this.t < (u.getupUntil || 0)) { this.stop(u); u.state = 'getup'; u.stance = 'crouch'; u.target = null; u.holdFire = true; return; }   // il se relève (ou retire ses mains) : ni marche ni tir

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
      // (à l'abri d'un obstacle, un ennemi aperçu au loin ne l'interrompt pas : seulement les balles ou un ennemi tout près)
      const exposed = threats.some(e => dist2(e, u) < DRAG.close || !this.coverAt(u.x, u.z, e.x, e.z, false));
      if (exposed || beingShot) { u.reviving = null; u.state = 'idle'; }
      else { const a = this.unitById(u.reviving.id); if (a) a.rescue = { by: u, t: this.t }; return; }
    }
    // secours sur ordre du joueur (clic droit sur un équipier à terre) ; un ordre plus récent l'annule
    if (u.rescueOrder && (u.moveOrder || u.keyOrder)) { const R = this.teams[u.team].rescues && this.teams[u.team].rescues[u.rescueOrder.id]; if (R) R.members = R.members.filter(m => m !== u.id); if (R && R.puller === u.id) R.puller = null; u.rescueOrder = null; }
    if (u.rescueOrder && this.followRescue(u, threats, beingShot)) return;
    // évacuation d'un blessé à découvert : en cours, ou à décider (le plus proche des équipiers disponibles)
    if (u.drag) { if (this.continueDrag(u, threats)) return; }
    else if (this.tryDrag(u, threats)) return;
    const freshContact = threats.length > 0 && this.t - (u.sawEnemyAt === undefined ? -99 : u.sawEnemyAt) > 2;   // ennemi vu à l'instant (personne en vue juste avant)
    if (threats.length) u.sawEnemyAt = this.t;
    if (!threats.length && !beingShot && u.suppression < 0.4 && !u.throwing && u.state !== 'noammo' && !u.moveOrder && (!u.keyOrder || (u.keyOrder.grp !== undefined && this.holdCalm(u)))) {   // en route sur ordre : il obéit ; en poste « tenir » : seulement au calme (R2)
      let a = this.downedToRevive(u);
      if (a && u.keyOrder) { const k = u.keyOrder, hx = k.hx !== undefined ? k.hx : k.x, hz = k.hz !== undefined ? k.hz : k.z; if (Math.hypot(a.x - hx, a.z - hz) > HOLD_REVIVE) a = null; }   // dans la position seulement
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
    if (u.throwing || u.lampShot || (u.evade && this.t < u.evade.until)) return;
    if (!u.holdFire && this.tryGrenade(u)) return;
    // derrière un couvert haut face à une menace connue : tirer au coin, par courtes rafales (voir peekCycle)
    if (!u.moveOrder && this.peekCycle(u, threats, beingShot)) return;
    // ordre « tenir la position clé » : passe avant tout le reste (l'IA fait ce qu'on lui dit)
    if (u.keyOrder) { this.followKeyOrder(u, threats); this.afterOrder(u, threats); return; }
    if (u.moveOrder) { this.followMoveOrder(u, threats, beingShot); this.afterOrder(u, threats); return; }   // ordre de déplacement du joueur (clic droit)
    // engagement sur un déplacement en cours : on continue (en tirant si possible) sauf si on vient d'être touché, ou si
    // ce déplacement mène droit sur un ennemi en vue (une marche d'approche ne se poursuit pas jusqu'à lui rentrer dedans)
    // Sous le feu (des balles claquent autour de soi depuis le départ), une marche d'approche ou un bond encore long
    // s'interrompt aussi : on se met à couvert là où l'on est plutôt que de finir sa course à découvert.
    const underFire = beingShot && u.lastShotByAt > u.commitAt && (u.goalKind === 'bound' || u.goalKind === 'advance' || u.goalKind === 'close') && u.goal && Math.hypot(u.goal.x - u.x, u.goal.z - u.z) > 3 && u.state !== 'sidestep';
    // (un ennemi qui surgit pendant une marche d'approche ou un bond : on réagit tout de suite — une course vers un abri continue)
    const surprise = freshContact && (u.goalKind === 'advance' || u.goalKind === 'search' || ((u.goalKind === 'bound' || u.goalKind === 'close') && Math.hypot(u.goal.x - u.x, u.goal.z - u.z) > 3));
    // épauler un équipier accroché (voir supportAlly) : passe avant la fin d'une marche d'approche ou d'un bond
    const supportable = !threats.length && !beingShot && !u.holdFire && !(u.goal && /^(cover|hide|revive|drag|fallback)$/.test(u.goalKind || ''));
    if (supportable && this.supportAlly(u, order)) return;
    if (this.t < u.commitUntil && u.goal && u.lastHitAt <= u.commitAt && !underFire && !surprise && !this.goalTooClose(u, threats)) return;

    // 1) une cible est visible : engager
    if (threats.length > 0) {
      const target = u.target;
      const d = dist2(u, target);
      // la menace dont on se couvre : celui qui me tire dessus (même hors de vue), sinon ma cible
      const threat = (beingShot && u.lastShotBy && u.lastShotBy.alive) ? u.lastShotBy : target;
      const cover = this.coverAt(u.x, u.z, threat.x, threat.z, true);     // un VRAI couvert, contre soi, face à la menace
      const stand = this.standoff(u);
      const pinned = u.suppression > this.pinThreshold(u); // composure 80 → 0,4 ; calé / Sang-froid / Meneur
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
      // face à face à moins de 4 m de part et d'autre d'un muret : on ne reste pas échanger des tirs à bout portant, on
      // décroche vers un couvert à distance de combat (une fois toutes les 8 s au plus)
      if (cover && d < 4 && order !== 'hold' && this.t < (u.rushUntil || 0) === false && this.t - (u.breakAt || -99) > 8) {
        const cp = this.findCover(u, target, 12, { minRange: MIN_CLOSE, requireShoot: true, towards: home }) || this.findCover(u, target, 12, { minRange: MIN_CLOSE, towards: home });
        if (cp && this.setGoal(u, cp.x, cp.z, 'cover')) { u.breakAt = this.t; u.state = 'fallback'; u.stance = 'stand'; return; }
      }
      // pas de vrai couvert face à la menace : en prendre un d'où l'on tire, à distance de combat (on ne s'approche pas sous
      // ~8 m pour se mettre à l'abri) ; trop près et rien autour : décrocher vers un couvert plus en arrière
      if (!cover) {
        const minR = Math.max(u.weapon.minRange, Math.min(MIN_CLOSE, d - 2));
        // sous le feu : d'abord un couvert tout proche (≤ 4 m) d'où l'on tire — chaque mètre à découvert se paie ; courir 8 m
        // vers un « meilleur » couvert était la première cause de mort en mouvement
        const hd = u.mvAt !== undefined && this.t - u.mvAt < 0.5 ? u.mvDir : undefined;   // en marche : pas de demi-tour sans raison
        const cp = (beingShot && this.findCover(u, threat, 4, { minRange: minR, requireShoot: true, preferDist: stand, heading: hd })) || this.findCover(u, threat, 9, { minRange: minR, requireShoot: true, preferDist: stand, heading: hd }) || this.findCover(u, threat, 9, { minRange: minR, preferDist: stand, heading: hd });
        if (cp && this.setGoal(u, cp.x, cp.z, 'cover')) { u.state = 'tocover'; u.stance = 'stand'; return; }
        if (d < MIN_CLOSE && order !== 'hold') {
          const cp2 = this.findCover(u, threat, 16, { minRange: MIN_CLOSE, towards: home });
          if (cp2 && this.setGoal(u, cp2.x, cp2.z, 'cover')) { u.state = 'fallback'; u.stance = 'stand'; return; }
        }
      }
      // sinon : tenir la position et tirer. Debout pour tirer par-dessus le couvert ; accroupi derrière lui pour recharger et
      // entre deux rafales (on se relève pour la suivante : comme aux ordres Tenir et de déplacement)
      this.stop(u);
      u.state = 'engage';
      u.stance = ((u.reloading > 0 || this.t < (u.burstPauseUntil || 0)) && cover) ? 'crouch' : 'stand';
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
      // on garde la menace qu'on suivait tant qu'elle n'est pas nettement plus loin que la plus proche (sinon chaque nouvelle
      // position apprise par radio réoriente la marche : zigzags)
      const prev = u.focusId !== undefined && known.find(k => k.unit.id === u.focusId);
      if (prev && prev !== nearest) { const dp = Math.hypot(prev.k.x - u.x, prev.k.z - u.z); if (dp < nd + 6) { nearest = prev; nd = dp; } }
      u.focusId = nearest.unit.id;
      const threatPos = nearest.k;
      // pris pour cible il y a peu et à l'abri face au tireur : on reste à couvert, face à lui, le temps de le situer et de
      // riposter (on ne ressort pas aussitôt marcher à découvert vers lui)
      if ((this.t - u.lastShotByAt < 5 || this.t - (u.sawEnemyAt === undefined ? -99 : u.sawEnemyAt) < 3) && order !== 'hold' && !this.zone) {
        const sk = u.lastShotBy && u.lastShotBy.alive && u.knowledge[u.lastShotBy.id], sp = sk || threatPos;
        if (this.coverAt(u.x, u.z, sp.x, sp.z, true)) { this.stop(u); u.state = 'overwatch'; u.stance = this.waitStance(u, sp); u.facing = Math.atan2(sp.z - u.z, sp.x - u.x); return; }
      }
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
      // fin de bataille : au plus deux adversaires debout, on est plus nombreux et plus personne ne tire depuis 10 s → on
      // n'attend plus à distance de combat qu'il se montre (face-à-face immobiles jusqu'à la fin du temps) : on va le chercher
      const foesUp = this.teams[1 - u.team].units.filter(e => e.alive).length;
      const press = foesUp <= 2 && this.teams[u.team].units.filter(a => a.alive).length > foesUp && this.t - this.lastShotTime > 10;
      if (press && age >= 3) reach = 0;
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
        reach = Math.min(reach, blindFor > (press ? 6 : 12) ? 0 : MIN_CLOSE + 2);
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
        if (reach > 0) { this.stop(u); u.state = 'hold'; u.stance = this.waitStance(u, threatPos); u.facing = Math.atan2(threatPos.z - u.z, threatPos.x - u.x); return; }
      }
      // assaut : progresser vers la dernière position connue, de couvert en couvert, jusqu'à la distance d'approche ; là, se mettre
      // à couvert face à elle et attendre qu'il se montre (ou que l'information vieillisse)
      if (nd > reach + 2) {
        const cp = this.findCover(u, threatPos, 12, { towards: threatPos, minRange: reach * 0.7 });
        if (cp && Math.hypot(cp.x - threatPos.x, cp.z - threatPos.z) < nd - 2 && this.setGoal(u, cp.x, cp.z, 'bound')) { u.state = 'bounding'; u.stance = 'stand'; return; }
        if (this.approach(u, threatPos, nd, reach)) return;
      }
      if (reach > 0) { if (this.coverUp(u, threatPos)) return; this.stop(u); u.state = 'overwatch'; u.stance = this.waitStance(u, threatPos); u.facing = Math.atan2(threatPos.z - u.z, threatPos.x - u.x); return; }
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
    // (au plus deux adversaires debout et une dernière position connue pas encore vue : on y va tout de suite, d'où qu'on soit)
    const endMemo = () => { const m = this.teams[u.team].memo; return m && this.teams[1 - u.team].units.filter(e => e.alive).length <= 2 && this.teams[1 - u.team].units.some(e => e.alive && m[e.id] && !m[e.id].visited); };
    if (progress >= span - 8 || (u.role.id !== 'marksman' && endMemo()) || (u.searchGoal && this.t < u.searchUntil)) {   // (une fouille commencée va jusqu'à son point)
      if (u.searchSince === undefined) u.searchSince = this.t;
      // ratissage prolongé sans contact (> 15 s) : on élargit à toute la carte (deux survivants ne tournent pas indéfiniment chacun chez l'autre)
      const wide = this.t - u.searchSince > 15;
      if (!u.searchGoal || this.t > u.searchUntil || Math.hypot(u.searchGoal.x - u.x, u.searchGoal.z - u.z) < 1.5) {
        if (u.searchMemo) { u.searchMemo.visited = true; u.searchMemo = null; }   // dernière position connue : vue (ou temps écoulé)
        u.searchGoal = null;
        // fin de bataille (ratissage élargi, ou au plus deux adversaires debout) : d'abord la dernière position connue d'un
        // adversaire encore debout (mémoire de l'équipe, voir teamMemo), d'autant plus large qu'elle est ancienne ; sinon le
        // point tiré le plus loin des équipiers (on ne fouille pas tous au même endroit, on couvre la carte)
        const foes = this.teams[1 - u.team].units.filter(e => e.alive), memo = this.teams[u.team].memo || {};
        if (wide || foes.length <= 2) {
          let m = null; for (const e of foes) { const q = memo[e.id]; if (q && !q.visited && (!m || q.t > m.t)) m = q; }
          if (m) {
            const r = Math.min(12, (this.t - m.t) * 0.4), a = this.rng.range(0, Math.PI * 2), f = this.map.nearestFree(m.x + Math.cos(a) * r * this.rng.next(), m.z + Math.sin(a) * r * this.rng.next());
            if (f) { u.searchGoal = this.map.centerOf(f.c, f.r); u.searchUntil = this.t + 10; u.searchMemo = m; }
          }
          if (!u.searchGoal && wide) {
            const mates = this.teams[u.team].units.filter(a => a.alive && a !== u); let best = null, bs = -Infinity;
            for (let k = 0; k < 8; k++) {
              const f = this.map.nearestFree(this.rng.range(4, this.map.width - 4), this.rng.range(3, this.map.depth - 3)); if (!f) continue;
              const c = this.map.centerOf(f.c, f.r), sc = Math.min(25, ...mates.map(a => Math.hypot(a.x - c.x, a.z - c.z)).concat([99])) - Math.hypot(c.x - u.x, c.z - u.z) * 0.15;
              if (sc > bs) { bs = sc; best = c; }
            }
            if (best) { u.searchGoal = best; u.searchUntil = this.t + 10; }
          }
        }
        // ratissage : quelques points tirés au hasard, on garde celui qui ne fait pas revenir sur ses pas (devant soi ou
        // sur le côté plutôt que derrière, et pas trop loin)
        let sBest = null, sScore = -Infinity;
        for (let k = 0; k < 6 && !u.searchGoal; k++) {
          const a = this.rng.range(0, Math.PI * 2), r = this.rng.range(2, objective.r + 9);
          let sx = objective.x + Math.cos(a) * r, sz = clamp(objective.z + Math.sin(a) * r, 2, this.map.depth - 2);
          if (wide) { sx = this.rng.range(4, this.map.width - 4); sz = this.rng.range(3, this.map.depth - 3); }
          const f = this.map.nearestFree(sx, sz); if (!f) continue;
          const c = this.map.centerOf(f.c, f.r), dc = Math.hypot(c.x - u.x, c.z - u.z);
          const back = u.mvAt !== undefined && this.t - u.mvAt < 1 && dc > 1 ? -Math.cos(Math.atan2(c.z - u.z, c.x - u.x) - u.mvDir) : 0;
          const sc = -Math.max(0, back) * 6 - dc * 0.05;
          if (sc > sScore) { sScore = sc; sBest = c; }
        }
        if (!u.searchGoal && sBest) { u.searchGoal = sBest; u.searchUntil = this.t + 8; }
      }
      if (u.searchGoal && this.setGoal(u, u.searchGoal.x, u.searchGoal.z, 'advance')) { u.state = 'search'; u.stance = 'stand'; return; }
    }
    if (Math.hypot(gx - u.x, gz - u.z) > 1.5) { if (this.setGoal(u, gx, gz, 'advance')) { u.state = 'advancing'; u.stance = 'stand'; return; } }
    this.stop(u); u.state = 'hold'; u.facing = Math.atan2(objective.z - u.z, objective.x - u.x);
  };

  // ---- Course à couvert sous la menace ----------------------------------------------------
  // Un déplacement vers un couvert (couvert, cachette, bond) se fait au sprint quand l'opérateur est menacé : un ennemi en
  // vue, des balles qui claquent ou une blessure depuis moins de 2 s, ou à découvert sous les yeux d'une position ennemie
  // repérée il y a moins de 3 s (vue revérifiée toutes les 0,3 s). Hors menace, l'allure reste celle de l'ordre.
  // L'abri est sur le côté ou derrière et à plus de 3 m : on se retourne et on court (sans tirer) ; plus près, on y va
  // à reculons ou en pas chassé en continuant de viser (voir move()).
  const DASH = { cover: 1, hide: 1, bound: 1 }, DASH_TURN = 0.6, DASH_BACK = 3;
  Battle.prototype.underThreat = function (u) {
    if (this.t - u.lastShotByAt < 2 || this.t - u.lastHitAt < 2 || u.visible.size) return true;
    if (this.t - (u.exposedT || -9) >= DECIDE_EVERY - 1e-6) {
      u.exposedT = this.t; u.exposed = false;
      for (const { k } of this.knownEnemies(u)) {
        if (this.t - k.t >= 3 || Math.hypot(k.x - u.x, k.z - u.z) > 50) continue;
        if (this.map.hasLOS(k.x, EYE.stand, k.z, u.x, CHEST.stand, u.z)) { u.exposed = true; break; }
      }
    }
    return u.exposed;
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
    if (u.lampShot && this.t >= u.lampShot.at) this.shootLamp(u);
    // esquive d'une grenade signalée : courir à l'écart (une fois le réflexe passé)
    if (u.evade && !u.evade.started && this.t >= u.evade.at) this.startEvade(u);
    // déplacement
    const wasMoving = u.moving;
    u.moving = false;
    // course vers un couvert sous la menace : au sprint (une course retournée va jusqu'au bout, même si la menace s'efface)
    // (décrocher : ceux qui bondissent courent, retournés, sans tirer — les autres les couvrent)
    u.dash = !!(u.path && u.goal && DASH[u.goalKind] && (u.dashTurned || this.underThreat(u) || (u.moveOrder && u.moveOrder.mode === 'decrocher' && u.goalKind === 'bound')));
    if (u.path && u.goal) this.move(u);
    else if (u.peek && u.peek.slide) this.peekSlide(u);   // pas de côté vers le coin (ou retour à l'abri)
    else if (u.peek && u.peek.phase === 'out') this.peekBack(u);
    if (u.drag && u.drag.phase !== 'go') this.towBody(u);   // évacuation : le blessé suit, au sol
    if (!u.moving) { u.dashTurned = false; u.walkTurned = false; u.dash = false; }
    if (u.moving) u.stillSince = undefined; else if (wasMoving || u.stillSince === undefined) u.stillSince = this.t;
    // accroupi à l'arrêt = « à couvert » : seulement derrière un vrai obstacle face à la menace principale (elle a pu bouger,
    // le décor a pu sauter, on a pu se décaler). Sinon on se relève (et la prochaine décision cherche un vrai couvert).
    // Exception : à genoux auprès d'un blessé qu'on relève.
    if (u.stance === 'crouch' && !u.moving && u.state !== 'reviving') {
      const th = this.mainThreat(u);
      if (th ? !this.coverAt(u.x, u.z, th.x, th.z, false) : !this.besideObstacle(u.x, u.z)) u.stance = 'stand';
    }
    // orientation : vers la cible si on en a une, sinon vers la marche (course retournée vers un couvert : vers la course)
    if (u.target && u.target.alive && !u.dashTurned) { const ap = this.aimPoint(u, u.target); u.facing = Math.atan2(ap.z - u.z, ap.x - u.x); }
    // arrêté en surveillance derrière un obstacle haut sans aucune vue sur la menace (au milieu d'un bus) : on longe
    // l'obstacle jusqu'à un point près de son bout d'où l'on peut tirer au coin ; en attendant, arme basse (u.blindWall)
    if (!u.moving && !u.goal && !u.peek && this.tick % 5 === u.idx % 5) {
      const th = this.mainThreat(u), cv = th && this.coverAt(u.x, u.z, th.x, th.z, true);
      u.blindWall = !!(cv && cv.level === 'full' && cv.obstacle.h >= PEEK_H && !this.map.hasLOS(u.x, EYE.stand, u.z, th.x, CHEST.stand, th.z));
      if (u.blindWall && !u.moveOrder && !u.keyOrder && !u.holdFire && /^(overwatch|hold|pause|wait)$/.test(u.state) && !this.peekSpot(u.x, u.z, th, cv.obstacle, u) && this.toCorner(u, th, cv.obstacle)) {
        if (u.post) u.post = { x: u.goal.x, z: u.goal.z };   // le poste suit (sinon on y retournerait aussitôt)
        u.blindWall = false;
      }
    }
    // canon contre un obstacle (accroupi derrière une voiture, face à un mur, en gardant en joue un ennemi qu'on ne voit
    // plus) : on ne vise pas dans le décor. Derrière un obstacle bas avec l'ennemi visible debout, on se lève pour tirer
    // par-dessus ; sinon arme basse (u.blindWall) jusqu'à ce que la ligne du canon se dégage.
    if (u.muzzleLow) { u.blindWall = false; u.muzzleLow = false; }
    if (!u.moving) u.preaim = false;   // « arme pointée en marchant » ne survit pas à l'arrêt (sinon fusil levé dans le décor)
    if (u.moving && !u.muzzleLow) u.blindWall = false;
    if (!u.peek && !u.blindWall) {
      const c = Math.cos(u.facing), s = Math.sin(u.facing), y = u.eyeY() - 0.12;
      const o = this.map.blocker(u.x, y, u.z, u.x + c * MUZZLE, y, u.z + s * MUZZLE);
      if (o) {
        const T = u.target && u.target.alive ? u.target : null, yS = EYE.stand - 0.12;
        const overIt = !u.moving && u.stance === 'crouch' && o.h < EYE.stand - 0.1 && this.map.hasLOS(u.x, yS, u.z, u.x + c * MUZZLE, yS, u.z + s * MUZZLE);
        if (overIt && T && this.map.hasLOS(u.x, EYE.stand, u.z, T.x, T.chestY(), T.z)) u.stance = 'stand';
        else { u.blindWall = true; u.muzzleLow = true; }
      }
    }
    // caché derrière un mur haut, en attendant de ressortir : regard (et arme basse) vers le coin d'où l'on va tirer,
    // pas droit dans le mur
    if (u.peek && u.peek.phase !== 'out' && !u.moving) { const P = u.peek, th = this.mainThreat(u); if (th) { const a = Math.atan2(th.z - P.hz, th.x - P.hx), b = Math.atan2(P.pz - P.hz, P.px - P.hx); let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; u.facing = a + d * 0.6; } }
    // tir
    if (u.throwing || u.lampShot) { u.fireAcc = 0; return; }   // on ne tire pas en lançant (ni pendant le tir sur une lampe)
    if (u.dashTurned) u.fireAcc = Math.min(u.fireAcc, 1);   // on ne tire pas dans son dos en courant vers l'abri
    else if (u.target && u.target.alive && u.visible.has(u.target.id) && u.state !== 'pinned' && u.state !== 'noammo' && u.state !== 'wait' && !u.holdFire) this.fireAt(u, u.target);
    else if (u.target && u.target.alive && u.state !== 'pinned' && u.state !== 'noammo' && !u.holdFire && this.canSuppress(u, u.target)) this.suppressAt(u, u.target);
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
  // « Ralentir avant un angle » (doctrine) : en progression (avance, bonds hors menace), un point du chemin où l'on tourne
  // autour d'un obstacle sans voir ce qu'il y a derrière (angle mort) se prend au pas lent : on freine dans les 3,5 derniers
  // mètres, on passe le coin à CORNER_V et on ne réaccélère qu'1,5 m après. Une ligne de vue par coin (mise en cache).
  const CORNER_V = 1.3, CORNER_D = 3.5, CORNER_AFTER = 1.5;
  Battle.prototype.cornerSpeed = function (u, wp, d) {
    if (!RASER[u.goalKind] || u.dash || u.target) { u.corner = null; return Infinity; }
    let v = Infinity;
    const c = u.corner;
    if (c && c.path === u.path && c.idx < u.pathIdx) { if (Math.hypot(u.x - c.x, u.z - c.z) < CORNER_AFTER && c.blind) v = CORNER_V; else u.corner = null; }
    if (d < CORNER_D && u.pathIdx + 1 < u.path.length) {
      if (!u.corner || u.corner.path !== u.path || u.corner.idx !== u.pathIdx) {
        const nw = u.path[u.pathIdx + 1], ax = wp.x - u.x, az = wp.z - u.z, bx = nw.x - wp.x, bz = nw.z - wp.z, B = Math.hypot(bx, bz) || 1;
        const turn = Math.acos(Math.max(-1, Math.min(1, (ax * bx + az * bz) / ((Math.hypot(ax, az) || 1) * B))));
        const k = Math.min(3, B), px = wp.x + bx / B * k, pz = wp.z + bz / B * k;
        const blind = turn > 0.6 && !this.map.hasLOS(u.x, EYE.stand, u.z, px, EYE.stand, pz);
        u.corner = { path: u.path, idx: u.pathIdx, x: wp.x, z: wp.z, blind };
      }
      if (u.corner.blind) v = Math.min(v, CORNER_V + Math.max(0, d - 1) * 1.1);
    }
    return v;
  };
  Battle.prototype.move = function (u) {
    const wp = u.path[u.pathIdx];
    if (!wp) { this.arrive(u); return; }
    const d = Math.hypot(wp.x - u.x, wp.z - u.z);
    // tout près du point (< 0,45 m) trois pas de suite sans le toucher (une poussée le renvoie d'un côté puis de l'autre) :
    // atteint — on passe au suivant (ou on s'arrête là)
    if (d < 0.45 && u.wpStall && u.wpStall.p === wp) { if (++u.wpStall.n >= 3) { u.wpStall = null; if (u.pathIdx + 1 < u.path.length) { u.pathIdx++; return this.move(u); } this.arrive(u); return; } }
    else u.wpStall = d < 0.45 ? { p: wp, n: 1 } : null;
    // point de passage occupé (camarade debout dessus ou presque, ou un corps) : la séparation empêche d'y poser le pied, et
    // l'opérateur tournait autour en changeant de côté à chaque pas (allers-retours à 3-4 m/s, « moonwalk » à l'écran). À moins
    // de 1,2 m, on le tient pour atteint : point intermédiaire, si le suivant est en ligne directe ; point final (couvert, bond…
    // déjà tenu par un camarade debout), on s'arrête à côté de lui (sauf pour relever un blessé : il faut le toucher). De même
    // quand une poussée l'a déjà porté au-delà d'un point intermédiaire (à moins de 0,5 m, du côté du segment suivant) : pas de
    // demi-tour pour aller le toucher.
    if (d < 1.2 && d > 0.05 && u.pathIdx + 1 >= u.path.length && u.goalKind !== 'revive') {
      for (const a of this.units) if (a !== u && a.alive && a.team === u.team && Math.hypot(a.x - wp.x, a.z - wp.z) < 0.6) { this.arrive(u); return; }
    }
    if (d < 1.2 && d > 0.05 && u.pathIdx + 1 < u.path.length) {
      const nw = u.path[u.pathIdx + 1];
      if (d < 0.5 && (u.x - wp.x) * (nw.x - wp.x) + (u.z - wp.z) * (nw.z - wp.z) > 0 && this.map.walkableSegment(u.x, u.z, nw.x, nw.z)) { u.pathIdx++; return this.move(u); }
      for (const a of this.units) {
        if (a === u || (a.alive && a.team !== u.team) || a.dragBy === u || Math.hypot(a.x - wp.x, a.z - wp.z) > (a.alive ? 0.6 : 0.45)) continue;
        if (this.map.walkableSegment(u.x, u.z, nw.x, nw.z)) { u.pathIdx++; return this.move(u); }
        // un corps sur le point de passage, et pas de ligne droite vers le suivant : le point est déplacé à côté du corps
        // (sinon la poussée qui contourne le corps et le chemin qui y ramène se contraient : allers-retours sur place)
        if (!a.alive) {
          const L = Math.hypot(wp.x - a.x, wp.z - a.z) || 1, qx = wp.x === a.x && wp.z === a.z ? u.x - a.x : wp.x - a.x, qz = wp.x === a.x && wp.z === a.z ? u.z - a.z : wp.z - a.z, Q = Math.hypot(qx, qz) || 1;
          const px = a.x + qx / Q * 0.85, pz = a.z + qz / Q * 0.85;
          if (L < 0.85 && this.map.inBounds(px, pz) && !this.map.insideObstacle(px, pz)) { u.path[u.pathIdx] = { x: px, z: pz }; }
        }
        break;
      }
    }
    // regard pendant la marche : la cible si l'on en a une ; sinon l'arme pointée vers la dernière position connue d'un ennemi
    // (repéré il y a moins de 5 s) si elle n'est pas dans le dos : on progresse en couvrant l'angle dangereux plutôt qu'en
    // regardant ses pieds
    const mv = Math.atan2(wp.z - u.z, wp.x - u.x); let aim = null;
    if (!u.target && d > 0.05) { let best = 99; for (const { k } of this.knownEnemies(u)) { if (this.t - k.t > 5) continue; const dd = Math.hypot(k.x - u.x, k.z - u.z); const a = Math.atan2(k.z - u.z, k.x - u.x); if (dd < best && angDiff(a, mv) < 1.9) { best = dd; aim = a; } } }
    if (!u.target && aim === null && d > 0.05) { const z0 = this.dangerWatch(u); if (z0) { const a = Math.atan2(z0.z - u.z, z0.x - u.x); if (angDiff(a, mv) < 1.9) aim = a; } }   // Karst : l'arme vers l'endroit où un des siens est tombé
    if (!u.target && aim === null && d > 0.05) { const h = this.hintFor(u); if (h) { const a = Math.atan2(h.z - u.z, h.x - u.x); if (angDiff(a, mv) < 1.9) aim = a; } }   // deuxième cerveau : l'arme vers la zone soufflée
    let look = u.target && u.target.alive ? (() => { const ap = this.aimPoint(u, u.target); return Math.atan2(ap.z - u.z, ap.x - u.x); })() : aim;
    if (u.state === 'evade') { look = null; aim = null; }   // une grenade : on court, on ne recule pas en visant
    const dragging = u.goalKind === 'drag' && !!u.drag;   // évacuation : allure fixe (DRAG.speed), regard sur le blessé
    if (dragging) { look = null; aim = null; }
    // course vers l'abri sous la menace (u.dash) : menace de côté ou derrière et plus de 3 m à faire → on se retourne et on
    // court droit vers l'abri (jusqu'à l'arrivée) ; plus près, on reste face à elle (pas chassé, marche arrière)
    // Hors menace, l'arme pointée vers une position connue (sans cible) : au-delà de 60° de la marche on n'avance plus qu'en
    // pas chassé ou à reculons (1,4 à 1,8 m/s) — seulement pour les 3 derniers mètres ; plus loin, on marche face à sa route.
    const far = () => { let rem = d; for (let i = u.pathIdx + 1; i < u.path.length && rem <= DASH_BACK; i++) rem += Math.hypot(u.path[i].x - u.path[i - 1].x, u.path[i].z - u.path[i - 1].z); return rem > DASH_BACK; };
    let turned = false;
    // (un ennemi en vue à moins de ~8 m : on ne lui tourne pas le dos, on recule ou on se décale en le tenant en joue)
    const foeClose = () => { for (const e of this.enemiesOf(u)) if (e.alive && u.visible.has(e.id) && dist2(u, e) < MIN_CLOSE) return true; return false; };
    // (riposte au contact : une cible acquise depuis moins de 2 s, on lui envoie d'abord sa rafale en se déplaçant vers
    // l'abri, au lieu de lui tourner le dos ; les deux camps se voyaient, se retournaient ensemble et couraient sans un coup
    // de feu)
    const riposte = () => !!(u.target && u.target.alive && u.visible.has(u.target.id) && this.t - (u.targetAt || -99) < 2);
    if (u.dash && look !== null && d > 0.05 && angDiff(look, mv) > DASH_TURN) turned = (u.dashTurned || (far() && !riposte())) && !foeClose();
    u.dashTurned = turned;
    if (turned) { look = null; aim = null; }
    const walkTurned = !turned && !u.target && aim !== null && angDiff(aim, mv) > Math.PI / 3 && (u.walkTurned || far());
    u.walkTurned = walkTurned;
    if (walkTurned) { look = null; aim = null; }
    let stepLen = (look === null || d <= 0.05 ? u.speed() : this.gaitSpeed(u.speed(), angDiff(look, mv))) * DT;
    // demi-tour en pleine course (nouveau chemin dans l'autre sens, > 150°) : un pas d'appui à 1,5 m/s au plus pour
    // repartir, pas un aller-retour instantané à 2,5-3 m/s
    if (u.mvAt === Math.round((this.t - DT) * 1000) / 1000 && d > 0.05 && angDiff(mv, u.mvDir) > 2.6) stepLen = Math.min(stepLen, 1.5 * DT);
    stepLen = Math.min(stepLen, this.cornerSpeed(u, wp, d) * DT);
    let nx, nz;
    if (d <= stepLen) { nx = wp.x; nz = wp.z; }
    else { nx = u.x + (wp.x - u.x) / d * stepLen; nz = u.z + (wp.z - u.z) / d * stepLen; }
    // collision : les obstacles bloquent réellement
    // (si l'opérateur est déjà dans un obstacle — cas anormal — on le laisse en sortir)
    // Un chemin qui rase le coin d'un obstacle (diagonale de la grille) : on glisse le long du bord (un seul axe) au lieu
    // de buter — sinon nouveau chemin identique, retour au point précédent, et ainsi de suite (allers-retours sans fin)
    if (this.map.insideObstacle(nx, nz) && !this.map.insideObstacle(u.x, u.z)) {
      for (const [sx, sz] of Math.abs(nx - u.x) > Math.abs(nz - u.z) ? [[nx, u.z], [u.x, nz]] : [[u.x, nz], [nx, u.z]]) {
        if (Math.hypot(sx - u.x, sz - u.z) > stepLen * 0.3 && this.map.inBounds(sx, sz) && !this.map.insideObstacle(sx, sz)) { nx = sx; nz = sz; break; }
      }
      // point de passage collé à l'obstacle (inatteignable à moins de 0,6 m) : tenu pour atteint, on passe au suivant
      if (this.map.insideObstacle(nx, nz) && d < 0.6 && u.pathIdx + 1 < u.path.length) { u.pathIdx++; return; }
    }
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
    const mx = d > 1e-6 ? (wp.x - u.x) / d : 0, mz = d > 1e-6 ? (wp.z - u.z) / d : 0, bx = nx, bz = nz;
    // les corps (tous camps, point de chute ; rayon 0,8 m) se contournent de la même façon (on relève un blessé à côté de lui)
    for (const a of this.units) {
      if (a === u || (a.alive && a.team !== u.team) || a.dragBy === u) continue;
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
    // décalage amorti : au plus la longueur du pas (jusqu'à 0,55 m d'un coup, soit 5 m/s, l'opérateur était projeté de
    // côté puis renvoyé au pas suivant : allers-retours de deux camarades qui se croisent)
    { const sx = nx - bx, sz = nz - bz, sl = Math.hypot(sx, sz);
      if (sl > stepLen && sl > 1e-6) { const cx = bx + sx / sl * stepLen, cz = bz + sz / sl * stepLen; if (!this.map.insideObstacle(cx, cz) && this.map.inBounds(cx, cz)) { nx = cx; nz = cz; } } }
    u.stats.distance += Math.hypot(nx - u.x, nz - u.z);
    // regard : vers le point de passage visé (pas vers le petit pas de côté de la séparation entre alliés)
    if ((!u.target || turned) && d > 0.05) { u.facing = aim === null ? mv : aim; u.preaim = aim !== null; }
    if (dragging) { const a = this.unitById(u.drag.id); if (a) u.facing = Math.atan2(a.z - u.z, a.x - u.x); u.preaim = false; }   // face au blessé : il recule
    if (Math.hypot(nx - u.x, nz - u.z) > 0.05) { u.mvDir = Math.atan2(nz - u.z, nx - u.x); u.mvAt = this.t; }
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
  Battle.prototype.tiroirTeam = function (tm) { return this.hasTactic(tm, 'tiroir') || this.hasTactic(tm, 'tiroir_lent'); };
  Battle.prototype.tiroirOn = function (u) { const tm = this.teams[u.team]; return this.tiroirTeam(tm) && tm.order !== 'hold' && u.boundGroup >= 0 && !this.scoutOn(tm); };
  // T1b — « Tiroir lent » : un trinôme (groupe 0) bondit, un binôme (groupe 1 : le dernier opérateur et le tireur d'élite, ou
  // les deux derniers sans tireur d'élite) reste la base de feu ; à son tour, le binôme ne dépasse jamais le trinôme (il
  // s'arrête 3 m derrière le plus en arrière du trinôme). Après une perte : même partage sur les survivants.
  Battle.prototype.lentHalves = function (team, us) {
    const ms = us.filter(a => a.alive && a.role.id !== 'marksman').sort((a, b) => a.idx - b.idx), nb = Math.min(team.units.some(a => a.alive && a.role.id === 'marksman') ? 1 : 2, ms.length - 1);
    ms.forEach((a, i) => { a.boundGroup = i >= ms.length - nb ? 1 : 0; a.boundDone = undefined; });
  };
  // T7 — « Éclaireur » : l'opérateur le plus perceptif (hors tireur d'élite) avance seul en tête ; les autres le suivent à
  // SCOUT_GAP m en arrière (sur l'axe de progression, chacun sur sa voie) et ne bondissent pas. Au premier contact de
  // l'escouade (un ennemi vu, entendu ou signalé), ou l'éclaireur tombé, chacun reprend sa conduite habituelle (Tiroir
  // compris) ; 15 s sans aucun contact, l'éclaireur repart devant.
  const SCOUT_GAP = 20;
  Battle.prototype.initScout = function (team) {
    if (!this.hasTactic(team, 'eclaireur')) return;
    const s = team.units.filter(a => a.role.id !== 'marksman').sort((a, b) => b.def.perception - a.def.perception || a.idx - b.idx)[0];
    if (s) { team.scout = s.id; team.scoutContact = -99; this.logEvent('eclaireur', `${s.callsign} : « Je passe devant. »`, { team: team.index, unit: s.id }); }
  };
  Battle.prototype.scoutOn = function (tm) {
    if (!tm.scout || tm.order === 'hold' || this.t - tm.scoutContact < 15) return false;
    const s = this.unitById(tm.scout); return !!(s && s.alive);
  };
  // vrai : l'opérateur attend (il est trop près de l'éclaireur) ; faux : il avance sans Tiroir ; null : pas d'éclaireur
  Battle.prototype.scoutStep = function (u, threatPos) {
    const tm = this.teams[u.team]; if (!this.scoutOn(tm)) return null;
    if (u.id === tm.scout || u.role.id === 'marksman') return false;
    const s = this.unitById(tm.scout), dirx = Math.sign(this.map.spawns[1 - u.team].x - tm.spawn.x) || 1;
    if ((u.x - s.x) * dirx > -SCOUT_GAP) { this.stop(u); u.state = 'overwatch'; u.stance = 'stand'; u.facing = Math.atan2(threatPos.z - u.z, threatPos.x - u.x); return true; }
    return false;
  };
  const BUSY = { engage: 1, pinned: 1, shaken: 1, noammo: 1, reviving: 1, torevive: 1, throw: 1, sidestep: 1, closing: 1, tocover: 1, tokey: 1, holdkey: 1 };
  Battle.prototype.updateTiroir = function () {
    for (const team of this.teams) {
      if (team.scout && team.units.some(u => u.alive && Object.values(u.knowledge).some(k => this.t - k.t < 1))) {   // Éclaireur : contact
        if (this.scoutOn(team)) { const s = this.unitById(team.scout); this.logEvent('eclaireur', `${team.name} : contact — on rejoint ${s.callsign}.`, { team: team.index, unit: s.id, contact: true }); }
        team.scoutContact = this.t;
      }
      if (!this.tiroirTeam(team) || team.order === 'hold') continue;
      // un équipier tombé (ou relevé) : les deux moitiés sont rééquilibrées (R3) — plus de moitié vide qui bondit sans appui
      const all = team.units.filter(a => a.alive && a.boundGroup >= 0), lent = this.hasTactic(team, 'tiroir_lent');
      if (team.tiroirN !== all.length) { if (team.tiroirN !== undefined) { if (lent) this.lentHalves(team, all); else this.rebalanceHalves(team, all, a => a.boundGroup, (a, h) => { a.boundGroup = h; a.boundDone = undefined; }); } team.tiroirN = all.length; }
      const b = team.bound, alive = all.filter(a => !a.moveOrder);   // en route sur ordre : bonds de son propre groupe
      if (!alive.length) continue;                       // tous en route sur ordre : le Tiroir de l'escouade attend
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
    const sc = this.scoutStep(u, threatPos); if (sc !== null) return sc;   // Éclaireur (T7) : avant le contact, à la place du Tiroir
    if (!this.tiroirOn(u)) return false;
    const b = this.teams[u.team].bound;
    const face = () => { u.facing = Math.atan2(threatPos.z - u.z, threatPos.x - u.x); };
    const overwatch = () => {
      if (reach !== undefined && reach > 0 && this.coverUp(u, threatPos)) return true;
      this.stop(u); u.state = 'overwatch'; face();
      u.stance = this.waitStance(u, threatPos);
      return true;
    };
    if (u.goal && u.goalKind === 'bound') return true;                       // un bond en cours : on le termine
    if (u.boundGroup !== b.group || u.boundDone === b.n) return overwatch();  // on couvre (ou bond déjà fait)
    if (u.boundGroup === 1 && this.hasTactic(this.teams[u.team], 'tiroir_lent')) {   // Tiroir lent : le binôme ne passe jamais devant le trinôme
      const tm = this.teams[u.team], dirx = Math.sign(this.map.spawns[1 - u.team].x - tm.spawn.x) || 1, pr = (q) => (q.x - tm.spawn.x) * dirx;
      const tri = tm.units.filter(a => a.alive && a.boundGroup === 0 && !a.moveOrder);
      if (tri.length) {
        const lim = Math.min(...tri.map(pr)) - 3, p0 = pr(u), pd = pr(dest);
        if (p0 >= lim - 1) { u.boundDone = b.n; return overwatch(); }
        if (pd > lim) { const f = (lim - p0) / (pd - p0); dest = { x: u.x + (dest.x - u.x) * f, z: u.z + (dest.z - u.z) * f }; reach = 0; }
      }
    }
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
    let fd = null; if (id === 'fixer_deborder') { fd = this.fixerDeborder(teamIndex); if (!fd.ok) return fd; }
    st.uses--; st.used++; st.cooldownUntil = this.t + (def.cooldown || 0);
    if (def.plan) this.replan(teamIndex, id);   // plan de voies : les survivants sont redistribués selon ce plan
    this.logEvent('tactic', `${team.name} : ${def.name}.`, { team: teamIndex, tactic: id });
    return fd || { ok: true };
  };
  // T4 — « Fixer et déborder » (carte active, jouée quand le joueur le décide) : sur l'ennemi repéré le plus proche de
  // l'escouade (vu, entendu ou signalé il y a < 8 s), les deux opérateurs les plus proches passent en Appui (F2 : ordre
  // Méthodique sur place, arrivée Tenir, feu « appui », zone arrosée = sa position) ; les autres le contournent par le
  // flanc le plus court (voie nord ou sud ; sans voies, de côté) en Méthodique, puis l'Encerclent (A2 ; à moins de trois :
  // Tenir). Ce sont deux ordres du clic droit ordinaires : marqueurs, bulles et fin d'ordre comme d'habitude.
  Battle.prototype.fixerDeborder = function (teamIndex) {
    const team = this.teams[teamIndex], us = team.units.filter(u => u.alive && !u.drag);
    if (us.length < 3) return { ok: false, reason: 'il faut au moins trois opérateurs' };
    if (us.some(u => this.t - (u.orderAt === undefined ? -99 : u.orderAt) < ORDER_COOLDOWN)) return { ok: false, reason: `un ordre toutes les ${ORDER_COOLDOWN} s` };
    const C = this.teamCentroid(team); let T = null, td = Infinity;
    for (const e of this.teams[1 - teamIndex].units) {
      if (!e.alive) continue; let b = null; for (const u of us) { const q = u.knowledge[e.id]; if (q && (!b || q.t > b.t)) b = q; }
      if (b && this.t - b.t < 8) { const d = Math.hypot(b.x - C.x, b.z - C.z); if (d < td) { td = d; T = b; } }
    }
    if (!T) return { ok: false, reason: 'aucun ennemi repéré' };
    const byD = us.slice().sort((a, b) => Math.hypot(a.x - T.x, a.z - T.z) - Math.hypot(b.x - T.x, b.z - T.z) || (a.id < b.id ? -1 : 1));
    const fix = byD.slice(0, 2), flank = byD.slice(2), F = { x: (fix[0].x + fix[1].x) / 2, z: (fix[0].z + fix[1].z) / 2 }, G = { x: flank.reduce((s, u) => s + u.x, 0) / flank.length, z: flank.reduce((s, u) => s + u.z, 0) / flank.length };
    if (Math.hypot(F.x - T.x, F.z - T.z) < 4) return { ok: false, reason: 'trop près de l’ennemi' };
    // le flanc : la voie nord ou sud au plus court (chemin le groupe → la voie à hauteur de l'ennemi → l'ennemi) ; sans voies, de côté
    const v = this.map.def.voies, dirx = Math.sign(this.map.spawns[1 - teamIndex].x - team.spawn.x) || 1, opts = [];
    if (v) { for (const [side, z] of [[-1, v.nord], [1, v.sud]]) opts.push({ side, w: this.orderPoint(T.x - dirx * 4, z) }); }
    else { let dx = T.x - G.x, dz = T.z - G.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L; for (const s of [-1, 1]) opts.push({ side: dz * s < 0 ? -1 : 1, w: this.orderPoint(T.x - dx * 4 - dz * s * 13, T.z - dz * 4 + dx * s * 13) }); }
    let best = null;
    for (const o of opts) {
      if (!o.w || Math.hypot(o.w.x - T.x, o.w.z - T.z) < 6) continue;
      const l1 = this.pathLen(G.x, G.z, o.w.x, o.w.z), l2 = this.pathLen(o.w.x, o.w.z, T.x, T.z); if (l1 === null || l2 === null) continue; const L = l1 + l2;
      if (!best || L < best.L) best = Object.assign({ L }, o);
    }
    if (!best) return { ok: false, reason: 'aucun passage pour déborder' };
    const r1 = this.moveOrder(teamIndex, { x: F.x, z: F.z, units: fix.map(u => u.id), mode: 'methodique', arrivee: 'tenir', feu: 'appui' });
    if (!r1.ok) return r1;
    this.orientOrder(teamIndex, { ordre: r1.id, x: T.x, z: T.z });
    const r2 = this.moveOrder(teamIndex, { x: T.x, z: T.z, via: [best.w], units: flank.map(u => u.id), mode: 'methodique', arrivee: 'encercler' });
    const nord = best.side < 0;
    this.logEvent('fixer', `${team.name} : ${fix.map(u => u.callsign).join(', ')} — « On les fixe ! »`, { team: teamIndex, unit: fix[0].id, ordre: r1.id });
    if (r2.ok) this.logEvent('deborde', `${team.name} : ${flank.map(u => u.callsign).join(', ')} — « On déborde par le ${nord ? 'nord' : 'sud'} ! »`, { team: teamIndex, unit: flank[0].id, ordre: r2.id, nord });
    return { ok: true, fix: r1.id, flank: r2.ok ? r2.id : null };
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
  // Mémoire d'équipe : la dernière position connue (vue, ouïe, radio) de chaque adversaire, gardée même quand l'information
  // individuelle est oubliée ; sert au ratissage de fin de bataille (decide, 3). Une position plus récente efface « visité ».
  Battle.prototype.teamMemo = function () {
    for (const team of this.teams) {
      const m = team.memo = team.memo || {};
      for (const u of team.units) if (u.alive) for (const id in u.knowledge) { const k = u.knowledge[id]; if (!m[id] || k.t > m[id].t) m[id] = { x: k.x, z: k.z, t: k.t }; }
    }
  };
  // ---- Plans de l'adversaire (vague 2, strategies_gign.md §13.2) -----------------------------------------------------
  // L'équipe de l'IA (team.auto : missions, ligue, bataille libre) reçoit au départ UN plan, tiré à la graine (générateur à
  // part : le tirage principal n'est pas touché) et selon la situation (objectif, effectif) :
  //  - 'repli'      : se replier sous pression (deux fois au lieu d'une, dès le premier opérateur aveuglé ou touché) ;
  //  - 'contourner' : au contact, les deux opérateurs les plus éloignés de la menace la contournent par un côté (sur une
  //                   carte à voies : par la voie de flanc au plus court, comme les flancs de départ) ;
  //  - 'embuscade'  : au départ, on s'installe à l'avant de sa zone de départ (5–9 % du chemin), feu retenu, et on attend
  //                   (temps borné).
  // (Mesuré sur 100 batailles par plan, parking : s'installer plus loin (15–40 % du chemin), décrocher dès qu'on est cloué,
  //  ou contourner par la ruelle donnaient l'avantage à Alpha — on arrivait en retard, à découvert, ou dans un goulet.)
  // Réactions communes à tous les plans : décrocher sous la pression (aveuglé par une flash, touché, un tombé tout près) en
  // fumée, puis tenir feu retenu ; une fumée adverse à moins de 28 m → on tient en face, feu retenu, on les attend à la
  // sortie. Les plans passent par les ordres du clic droit (moveOrder, sans être enregistrés : ils découlent de l'état de
  // la bataille, la revue les refait à l'identique) ; chacun finit (temps, feu ouvert depuis un moment, fumée dissipée) par
  // « reprendre la manœuvre ». Jamais pour l'escouade du joueur (règle 1 du §13.3).
  // (poids : contourner moitié moins souvent — séparer deux opérateurs coûte cher face à une escouade groupée)
  const KARST_PLANS = ['repli', 'contourner', 'embuscade'];
  const KARST_SAY = { repli: 'On décroche !', contourner: 'On les contourne !', embuscade: 'Embuscade, personne ne tire.', fumee: 'Fumée : on les attend à la sortie.' };
  Battle.prototype.initKarst = function (team) {
    const r = new RNG(((this.seed >>> 0) * 2654435761 + 7919 * (team.index + 1)) >>> 0);
    const n = team.units.filter(u => u.role.id !== 'marksman').length, ob = this.objective;
    const w = { repli: 1, contourner: n >= 4 ? 0.5 : 0, embuscade: ob.type === 'hold' && ob.team !== team.index ? 0 : ob.type === 'capture' ? 0.5 : 1 };
    let plan = 'repli';
    if (team.order !== 'hold') { const tot = KARST_PLANS.reduce((s, k) => s + w[k], 0); let x = r.next() * tot; for (const k of KARST_PLANS) { x -= w[k]; if (x < 0) { plan = k; break; } } }
    team.karst = { plan, repliLeft: plan === 'repli' ? 2 : 1, smokeLeft: 2, flank: false, ambush: false, ord: [], seen: [], contactAt: null,
      flankDelay: 1 + r.next() * 2, ambushFrac: 0.05 + r.next() * 0.04, ambushFor: ob.type === 'capture' ? 30 : 50 + r.next() * 25, ambushAfter: 20, side: r.next() < 0.5 ? 1 : -1, lastAt: -99 };
  };
  Battle.prototype.karstBusy = function (u) {
    return !u.alive || u.role.id === 'marksman' || u.moveOrder || u.keyOrder || u.drag || u.reviving || u.throwing || u.state === 'noammo' || this.t - (u.orderAt === undefined ? -99 : u.orderAt) < ORDER_COOLDOWN;
  };
  Battle.prototype.karstOrder = function (team, kind, arg, units, end) {
    const r = this.moveOrder(team.index, Object.assign({ units: units.map(u => u.id), plan: kind }, arg));
    if (!r.ok) return null;
    const k = team.karst, o = Object.assign({ id: r.id, kind, t: this.t }, end); k.ord.push(o); k.lastAt = this.t;
    this.logEvent('plan', `${team.name} : « ${KARST_SAY[kind]} » (${units.map(u => u.callsign).join(', ')})`, { team: team.index, unit: units[0].id, plan: kind, ordre: r.id });
    return o;
  };
  Battle.prototype.updateKarst = function () {
    if (this.over) return;
    for (const team of this.teams) {
      const k = team.karst; if (!k) continue;
      // fin des plans en cours : chacun reprend la manœuvre
      for (const o of k.ord) {
        if (o.done) continue;
        const ms = this.orderMembers(team, o.id), inf = team.ordInfo[o.id];
        const cloudGone = o.cloud && !this.map.dynamic.includes(o.cloud) && this.t > o.cloud.until + 2;
        if (ms.length && this.t < o.until && !(inf.released && this.t - inf.releasedAt > o.afterFire) && !cloudGone) continue;
        o.done = true;
        for (const u of ms) { const mo = u.moveOrder && u.moveOrder.id === o.id ? u.moveOrder : { id: o.id }; u.moveOrder = null; this.resumeManoeuvre(u, mo); }
      }
      const alive = team.units.filter(u => u.alive); if (alive.length < 2) continue;
      const known = [];   // ennemis connus (vus, entendus, radio) il y a moins de 6 s, encore debout
      for (const e of this.teams[1 - team.index].units) { if (!e.alive) continue; let b = null; for (const u of alive) { const q = u.knowledge[e.id]; if (q && (!b || q.t > b.t)) b = q; } if (b && this.t - b.t < 6) known.push(b); }
      if (known.length && k.contactAt === null) k.contactAt = this.t;
      const free = alive.filter(u => !this.karstBusy(u));
      const nearest = (p) => { let b = null, bd = Infinity; for (const q of known) { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; b = q; } } return b ? { q: b, d: bd } : null; };
      const cen = (us) => ({ x: us.reduce((s, u) => s + u.x, 0) / us.length, z: us.reduce((s, u) => s + u.z, 0) / us.length });
      // 1) décrocher sous la pression (aveuglé, touché, un équipier tombé tout près il y a moins de 4 s ; « cloué » seul ne
      //    suffit pas : se lever sous le feu coûtait plus cher que de rester)
      if (k.repliLeft > 0 && this.t - k.lastAt > 8 && known.length) {
        const lossNear = (u) => k.plan === 'repli' && (team.losses || []).some(l => this.t - l.t < 4 && Math.hypot(l.x - u.x, l.z - u.z) < 12);
        const hurt = alive.filter(u => u.role.id !== 'marksman' && (this.t < u.blindUntil || lossNear(u)));
        if (hurt.length) {
          const grp = free.filter(u => hurt.some(h => Math.hypot(h.x - u.x, h.z - u.z) < 15)), C = grp.length ? cen(grp) : null, D = C && nearest(C);
          if (grp.length >= 2 && D && D.d < 30) {
            const sp = team.spawn; let ax = C.x - D.q.x, az = C.z - D.q.z, L = Math.hypot(ax, az) || 1; ax /= L; az /= L;
            let bx = sp.x - C.x, bz = sp.z - C.z; const M = Math.hypot(bx, bz) || 1; bx = ax + 0.5 * bx / M; bz = az + 0.5 * bz / M; const N = Math.hypot(bx, bz) || 1;
            if (this.karstOrder(team, 'repli', { x: C.x + bx / N * 14, z: C.z + bz / N * 14, mode: 'decrocher', arrivee: 'tenir', feu: 'retenu', fumee: true }, grp, { until: this.t + 30, afterFire: 12 })) { k.repliLeft--; continue; }
          }
        }
      }
      // 2) fumée adverse : on tient en face, feu retenu, et on les attend à la sortie
      for (const c of this.map.dynamic) {
        if (c.kind !== 'smoke' || c.team === team.index || k.seen.includes(c)) continue;
        k.seen.push(c); if (k.smokeLeft <= 0 || alive.some(u => this.t - (u.sawEnemyAt === undefined ? -99 : u.sawEnemyAt) < 4)) continue;   // en plein échange de tirs (fumée d'évacuation…) : on continue le combat
        const Q = { x: c.x + c.w / 2, z: c.z + c.d / 2 }, grp = free.filter(u => { const d = Math.hypot(u.x - Q.x, u.z - Q.z); return d < 28 && d > c.w / 2 + 1.5; });
        if (!grp.length) continue;
        const C = cen(grp), L = Math.hypot(C.x - Q.x, C.z - Q.z) || 1, P = { x: C.x + (C.x - Q.x) / L * 2, z: C.z + (C.z - Q.z) / L * 2 };
        const o = this.karstOrder(team, 'fumee', { x: P.x, z: P.z, mode: 'methodique', arrivee: 'tenir', feu: 'retenu' }, grp, { until: c.until + 4, afterFire: 10, cloud: c });
        if (o) { k.smokeLeft--; this.orientOrder(team.index, { ordre: o.id, x: Q.x, z: Q.z }); }
      }
      // 3) contourner : au contact, les deux plus éloignés de la menace la prennent par un côté
      if (k.plan === 'contourner' && !k.flank && k.contactAt !== null && this.t - k.contactAt > k.flankDelay && known.length && alive.length >= 3) {
        const T = cen(known), C = cen(alive), cand = free.slice().sort((a, b) => Math.hypot(b.x - T.x, b.z - T.z) - Math.hypot(a.x - T.x, a.z - T.z) || (a.id < b.id ? -1 : 1)).slice(0, 2);
        if (cand.length === 2 && this.map.def.voies) {   // carte à voies : ils passent par la voie de flanc (même conduite que les flancs de départ)
          const v = this.map.def.voies, G = cen(cand), dirx = Math.sign(this.map.spawns[1 - team.index].x - team.spawn.x) || 1;
          let lane = 1, bl = Infinity;   // la voie de flanc au plus court (le groupe → la voie à hauteur de la menace → la menace)
          for (const [l, z] of [[-1, v.nord], [1, v.sud]]) { const w = this.orderPoint(T.x - dirx * 4, z); if (!w) continue; const l1 = this.pathLen(G.x, G.z, w.x, w.z), l2 = this.pathLen(w.x, w.z, T.x, T.z); if (l1 !== null && l2 !== null && l1 + l2 < bl) { bl = l1 + l2; lane = l; } }
          cand.forEach(u => { u.voie = lane; u.laneDz = 0; this.resetRoute(u); });
          k.flank = true; k.lastAt = this.t;
          this.logEvent('plan', `${team.name} : « ${KARST_SAY.contourner} » (${cand.map(u => u.callsign).join(', ')})`, { team: team.index, unit: cand[0].id, plan: 'contourner' });
        } else if (cand.length === 2) {
          let dx = T.x - C.x, dz = T.z - C.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
          for (const s of [k.side, -k.side]) {
            const W = this.orderPoint(T.x - dx * 4 - dz * s * 13, T.z - dz * 4 + dx * s * 13), F = this.orderPoint(T.x - dz * s * 5, T.z + dx * s * 5);
            if (!W || !F || Math.hypot(W.x - T.x, W.z - T.z) < 8) continue;
            if (this.karstOrder(team, 'contourner', { x: F.x, z: F.z, via: [W], mode: 'methodique', arrivee: 'manoeuvre' }, cand, { until: this.t + 60, afterFire: 999 })) { k.flank = true; break; }
          }
          if (!k.flank && this.t - k.contactAt > k.flankDelay + 10) k.flank = true;   // aucun passage : on renonce
        }
      }
      // 4) embuscade : au départ, on s'installe près de chez soi, feu retenu ; on attend (temps borné)
      if (k.plan === 'embuscade' && !k.ambush && this.t >= 1) {
        k.ambush = true;
        const grp = free; if (grp.length < 2) continue;
        const a = team.spawn, b = this.map.spawns[1 - team.index], v = this.map.def.voies, f = k.ambushFrac;
        this.karstOrder(team, 'embuscade', { x: a.x + (b.x - a.x) * f, z: v ? v.milieu : a.z + (b.z - a.z) * f, mode: 'methodique', arrivee: 'tenir', feu: 'retenu' }, grp, { until: this.t + k.ambushFor, afterFire: k.ambushAfter });
      }
    }
  };
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
  Battle.prototype.noteLoss = function (e) { const t = this.teams[e.team]; t.losses = (t.losses || []).concat([{ t: this.t, x: e.x, z: e.z }]).slice(-8); this.noteDanger(e, 1); };
  // Mémoire du danger (Groupe Karst seulement : l'escouade du joueur ne décide rien seule) : là où un des siens est tombé ou
  // a été aveuglé, la zone (rayon 6 m) devient chère à traverser pour les chemins, et ceux qui la voient la surveillent.
  // Pas d'oubli : on ne retombe pas deux fois dans le même piège pendant la bataille.
  const DANGER_R = 6, DANGER_COST = 2.5;
  Battle.prototype.noteDanger = function (e, w) {
    const t = this.teams[e.team]; if (!t.karst) return;
    const ds = t.danger || (t.danger = []);
    const near = ds.find(d => Math.hypot(d.x - e.x, d.z - e.z) < 3);
    if (near) near.w = Math.min(2, near.w + w); else ds.push({ x: e.x, z: e.z, w, t: this.t });
    if (ds.length > 6) ds.shift();
    t.dangerGrid = null;
  };
  Battle.prototype.dangerGrid = function (u) {
    const t = this.teams[u.team]; if (!t.karst || !t.danger || !t.danger.length) return null;
    if (t.dangerGrid) return t.dangerGrid;
    const m = this.map, g = new Float32Array(m.cols * m.rows);
    for (const d of t.danger) {
      const c0 = m.cellOf(d.x, d.z), R = Math.abs(m.cellOf(d.x + DANGER_R, d.z).c - c0.c) + 1;
      for (let dc = -R; dc <= R; dc++) for (let dr = -R; dr <= R; dr++) {
        const c = c0.c + dc, r = c0.r + dr; if (c < 0 || r < 0 || c >= m.cols || r >= m.rows) continue;
        const p = m.centerOf(c, r), k = 1 - Math.hypot(p.x - d.x, p.z - d.z) / DANGER_R; if (k <= 0) continue;
        g[r * m.cols + c] += DANGER_COST * d.w * k;
      }
    }
    // un départ ou une arrivée dans la zone reste possible : seul le passage coûte
    return (t.dangerGrid = g);
  };
  // zone dangereuse à surveiller (la plus proche, en vue, à moins de 30 m) — sinon null
  Battle.prototype.dangerWatch = function (u) {
    const t = this.teams[u.team]; if (!t.karst || !t.danger) return null;
    let best = null, bd = 30;
    for (const d of t.danger) {
      const dd = Math.hypot(d.x - u.x, d.z - u.z); if (dd < 3 || dd >= bd) continue;
      if (this.map.hasLOS(u.x, EYE.stand, u.z, d.x, 1.0, d.z)) { bd = dd; best = d; }
    }
    return best;
  };
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
  // R2 (sans animation) — en poste « tenir », on relève un équipier tombé DANS la position (< HOLD_REVIVE m du poste) quand
  // aucun des équipiers de l'ordre n'a vu d'ennemi, tiré ni été pris pour cible depuis HOLD_CALM s ; pas le serre-file qui garde l'arrière
  const HOLD_REVIVE = 10, HOLD_CALM = 5;
  Battle.prototype.holdCalm = function (u) {
    const hr = this.teams[u.team].holdRear;
    if (hr) for (const k in hr) if (hr[k] && hr[k].id === u.id && !hr[k].released) return false;
    const o = this.orderOf(u), ms = o ? this.orderMembers(this.teams[u.team], o.id) : [u];
    return ms.every(a => this.t - (a.sawEnemyAt === undefined ? -99 : a.sawEnemyAt) > HOLD_CALM && this.t - a.lastShotByAt > HOLD_CALM && this.t - a.lastShotAt > HOLD_CALM);   // personne ne voit, ne tire (appui compris), ni ne se fait tirer dessus
  };
  Battle.prototype.downedToRevive = function (u) {
    const reach = has(u, 'medic') ? 30 : 16; let best = null, bd = reach;
    for (const a of this.teams[u.team].units) {
      if (a.alive || a === u || !(a.bleedUntil > this.t + 3)) continue;
      if (a.rescue && a.rescue.by !== u && a.rescue.by.alive && this.t - a.rescue.t < 1) continue;   // un autre y va déjà
      if (this.draggedBy(a) && this.draggedBy(a) !== u) continue;                                        // un autre l'évacue
      const d = dist2(u, a); if (d < bd) { bd = d; best = a; }
    }
    return best;
  };
  // ---- Évacuation du blessé ----------------------------------------------------------------------------------------
  // Un équipier à terre (saignement : il peut être relevé) à découvert, vu de l'ennemi : le plus proche des équipiers
  // disponibles (pas en plein duel, pas garde de l'arrière, pas en route sur ordre) va le chercher, le tire à reculons
  // jusqu'au couvert le plus proche (≤ 8 m, en ligne droite), à 60 % de son allure, sans tirer, puis le relève là (relève
  // habituelle). Un ennemi tout près : on se bat d'abord. Trop longtemps à découvert sous les yeux de l'ennemi : seulement
  // avec un fumigène, lancé entre le trajet et la menace (un par opérateur).
  const REVIVE_PREP = 2, GETUP = 3.2, GETUP_RESCUER = 0.6;   // poser le blessé traîné ; se relever (relevé / sauveteur) — durées des gestes affichés
  const DRAG = { reach: 12, cover: 8, speed: 0.6, close: 7, drop: 5, maxOpen: 4, rope: 1.0, settle: 1.5, minLeft: 8 };
  Battle.prototype.draggedBy = function (a) { const b = a.dragBy; return b && b.alive && b.drag && b.drag.id === a.id ? b : null; };
  Battle.prototype.canDrag = function (u) {
    if (!u.alive || u.status === 'critical' || u.drag || u.reviving || u.throwing || u.moveOrder || u.state === 'noammo' || this.t < (u.shakenUntil || 0)) return false;
    if (u.target && u.target.alive && u.visible.has(u.target.id) && this.t - u.lastShotAt < 1.5) return false;   // en plein duel
    const hr = this.teams[u.team].holdRear;
    if (u.keyOrder && hr) for (const k in hr) if (hr[k] && hr[k].id === u.id && !hr[k].released) return false;  // garde de l'arrière
    return true;
  };
  // positions ennemies (vues, ou connues depuis moins de 6 s) d'où l'on voit le blessé à hauteur d'un sauveteur accroupi
  Battle.prototype.dragThreats = function (u, a) {
    const out = [];
    for (const e of this.enemiesOf(u)) {
      if (!e.alive) continue;
      const seen = u.visible.has(e.id), k = seen ? e : u.knowledge[e.id];
      if (!k || (!seen && this.t - k.t > 6)) continue;
      if (this.map.hasSolidLOS(k.x, EYE.stand, k.z, a.x, 0.9, a.z)) out.push({ x: k.x, z: k.z, fresh: seen || this.t - k.t < 3 });   // (à travers la fumée aussi : elle cache, elle n'abrite pas — on le met derrière un vrai obstacle)
    }
    return out;
  };
  // le couvert le plus proche du blessé (≤ 8 m, joignable en ligne droite) où un sauveteur accroupi est caché de toutes ces menaces
  Battle.prototype.dragCover = function (u, a, ths, maxD) {
    let best = null, bs = Infinity; const M = maxD || DRAG.cover;
    for (const c0 of this.map.coverPoints) {
      if (Math.abs(c0.x - a.x) > M + 1 || Math.abs(c0.z - a.z) > M + 1) continue;
      const h = this.hug(c0), cx = h.hx, cz = h.hz, d = Math.hypot(cx - a.x, cz - a.z);
      if (d > M || d < 1) continue;
      const s = d + Math.hypot(cx - u.x, cz - u.z) * 0.3; if (s >= bs) continue;
      if (u.keyOrder && u.keyOrder.cx !== undefined && Math.hypot(cx - u.keyOrder.cx, cz - u.keyOrder.cz) > HOLD_ZONE + 1.5) continue;
      if (this.alliesOf(u).some(o => o !== u && o.alive && Math.hypot(o.x - cx, o.z - cz) < 1.2)) continue;
      if (ths.some(t => this.map.hasSolidLOS(t.x, EYE.stand, t.z, cx, 0.9, cz))) continue;
      if (!this.map.walkableSegment(a.x, a.z, cx, cz)) continue;
      bs = s; best = { x: cx, z: cz };
    }
    return best;
  };
  Battle.prototype.tryDrag = function (u, threats) {
    let pick = null;
    for (const a of this.teams[u.team].units) {
      if (a.alive || a === u || !(a.bleedUntil > this.t + DRAG.minLeft) || this.draggedBy(a)) continue;
      const d = dist2(u, a); if (d > DRAG.reach) continue;
      if (!pick || d < pick.d) pick = { a, d };
    }
    if (!pick || !this.canDrag(u)) return false;
    const a = pick.a;
    if (a.rescue && a.rescue.by !== u && a.rescue.by.alive && this.t - a.rescue.t < 1) return false;   // un autre y va déjà
    if (u.keyOrder && u.keyOrder.cx !== undefined && Math.hypot(a.x - u.keyOrder.cx, a.z - u.keyOrder.cz) > HOLD_ZONE + 1.5) return false;
    // le plus proche des équipiers disponibles (à égalité, le premier de l'escouade) : jamais deux
    for (const o of this.teams[u.team].units) { if (o === u || !this.canDrag(o)) continue; const d = dist2(o, a); if (d < pick.d - 1e-6 || (Math.abs(d - pick.d) < 1e-6 && o.idx < u.idx)) return false; }
    for (const e of threats) if (dist2(e, u) < DRAG.close || dist2(e, a) < DRAG.close) return false;   // ennemi tout près : on se bat
    const ths = this.dragThreats(u, a); if (!ths.length) return false;   // à l'abri des vues : la relève habituelle suffit
    const c = this.dragCover(u, a, ths); if (!c) return false;
    if (Math.hypot(c.x - a.x, c.z - a.z) < 1.5 && dist2(u, a) < 1.6) return false;   // déjà posé à cet abri : on ne le retraîne pas (on se bat, puis on le relève)
    // temps à découvert (aller au blessé au pas de course, puis le tirer) ; sous les yeux de l'ennemi, au-delà de 4 s : fumigène
    const v = u.speed(), tOpen = Math.max(0, pick.d - 1) / (v * 1.2) + Math.hypot(c.x - a.x, c.z - a.z) / (v * DRAG.speed);
    const fresh = ths.filter(t => t.fresh);
    let smoke = null;
    if (fresh.length && this.smokeHolder(u)) {
      let T = fresh[0], td = Infinity; for (const t of fresh) { const dd = Math.hypot(t.x - a.x, t.z - a.z); if (dd < td) { td = dd; T = t; } }
      const mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2, L = Math.hypot(T.x - mx, T.z - mz) || 1, k = Math.min(GRENADES.smoke.radius, L * 0.4);
      const sx = mx + (T.x - mx) / L * k, sz = mz + (T.z - mz) / L * k, sd = Math.hypot(sx - u.x, sz - u.z);
      if (sd <= 24 && this.map.hasLOS(u.x, 2.3, u.z, sx, 1.4, sz)) smoke = { x: sx, z: sz, d: sd };
    }
    if (fresh.length && tOpen > DRAG.maxOpen && !smoke) return false;
    u.drag = { id: a.id, c, phase: 'go', t0: this.t, ths: ths.map(t => ({ x: t.x, z: t.z })) };
    a.dragBy = u; a.rescue = { by: u, t: this.t }; u.target = null; u.reviving = null;
    u.stats.drags = (u.stats.drags || 0) + 1;
    this.logEvent('drag', `${u.callsign} : « Je le tire à couvert ! »`, { unit: u.id, team: u.team });
    if (smoke) {
      this.takeSmoke(u);   // le fumigène de l'équipe passe à celui qui va chercher le blessé
      this.stop(u); u.state = 'throw'; u.stance = 'stand'; u.facing = Math.atan2(smoke.z - u.z, smoke.x - u.x);
      u.throwing = { at: this.t + 0.5 + (1 - u.def.reflexes / 100) * 0.3, x: smoke.x, z: smoke.z, d: smoke.d, kind: 'smoke', target: 'la menace' };
      return true;
    }
    return this.continueDrag(u, threats);
  };
  Battle.prototype.continueDrag = function (u, threats) {
    const g = u.drag, a = this.unitById(g.id);
    const drop = (why) => {
      if (a && a.dragBy === u) a.dragBy = null;
      u.drag = null; if (u.goalKind === 'drag' || u.goalKind === 'revive') this.stop(u); u.state = 'idle';
      if (why && a) this.logEvent('drag_stop', `${u.callsign} lâche ${a.callsign} (${why}).`, { unit: u.id, team: u.team, silent: true });
      return false;
    };
    if (!a || a.alive) return drop();
    if (!(a.bleedUntil > this.t)) return drop('trop tard');
    if (u.status === 'critical') return drop('blessé');
    for (const e of threats) if (dist2(e, u) < DRAG.drop) return drop('ennemi au contact');
    if (u.throwing) return true;
    u.target = null; u.stance = 'stand';
    if (g.phase === 'go') {
      const d = dist2(u, a);
      if (d > 1.2) {
        // on se place du côté du couvert (on le tirera droit vers lui)
        const L = Math.hypot(g.c.x - a.x, g.c.z - a.z) || 1, gx = a.x + (g.c.x - a.x) / L * 0.9, gz = a.z + (g.c.z - a.z) / L * 0.9;
        const ok = this.map.inBounds(gx, gz) && !this.map.insideObstacle(gx, gz);
        if (this.setGoal(u, ok ? gx : a.x, ok ? gz : a.z, 'revive')) { u.state = 'todrag'; return true; }
        return drop('pas de passage');
      }
      if (this.t < a.downAt + 3) { this.stop(u); u.state = 'todrag'; return true; }   // le corps finit de tomber
      g.phase = 'pull'; g.pullAt = this.t;
    }
    if (g.phase === 'pull') {
      if (Math.hypot(g.c.x - u.x, g.c.z - u.z) > 0.6 && this.t - g.pullAt < 20) {
        if (!(u.goal && u.goalKind === 'drag') && !this.setGoal(u, g.c.x, g.c.z, 'drag')) return drop('pas de passage');
        u.state = 'dragging'; return true;
      }
      this.stop(u); g.phase = 'settle'; g.spot = this.dragSettle(u, a, g);
    }
    // à couvert : le corps est posé à l'abri, à côté de soi, puis on le relève (relève habituelle)
    this.stop(u); u.state = 'dragging'; u.stance = 'crouch';
    if (!g.spot || Math.hypot(g.spot.x - a.x, g.spot.z - a.z) < 0.03) {
      a.dragBy = null; u.drag = null; a.rescue = { by: u, t: this.t };
      u.state = 'reviving'; u.reviving = { id: a.id, until: this.t + REVIVE_PREP + (has(u, 'medic') ? 2 : 4) };   // (+ REVIVE_PREP : poser le corps, se placer à son flanc)
      this.logEvent('revive_start', `${u.callsign} a mis ${a.callsign} à l'abri et le relève.`, { unit: u.id, team: u.team });
    }
    return true;
  };
  // où poser le blessé, arrivé au couvert : à ~1 m de soi, caché (au sol) des menaces connues, au plus près de là où il est
  Battle.prototype.dragSettle = function (u, a, g) {
    const ths = g.ths.slice(); for (const e of this.enemiesOf(u)) if (e.alive && u.visible.has(e.id)) ths.push({ x: e.x, z: e.z });
    const hidden = (x, z) => !ths.some(t => this.map.hasSolidLOS(t.x, EYE.stand, t.z, x, 0.5, z));
    if (hidden(a.x, a.z) && dist2(u, a) <= 1.4) return null;
    let best = null, bd = Infinity;
    for (let i = 0; i < 12; i++) {
      const ang = i * Math.PI / 6, x = u.x + Math.cos(ang) * DRAG.rope, z = u.z + Math.sin(ang) * DRAG.rope;
      if (!this.map.inBounds(x, z) || this.map.insideObstacle(x, z) || !hidden(x, z)) continue;
      const d = Math.hypot(x - a.x, z - a.z); if (d < bd && d < 2.2) { bd = d; best = { x, z }; }
    }
    return best;
  };
  // le corps suit le tireur (corde de 1 m), puis glisse jusqu'à sa place à l'abri ; jamais dans un obstacle
  Battle.prototype.towBody = function (u) {
    const g = u.drag, a = this.unitById(g.id); if (!a || a.alive) return;
    let tx, tz, step;
    if (g.phase === 'settle') { if (!g.spot) return; tx = g.spot.x; tz = g.spot.z; step = DRAG.settle * DT; }
    else { const d = dist2(u, a); if (d <= DRAG.rope) return; tx = u.x + (a.x - u.x) / d * DRAG.rope; tz = u.z + (a.z - u.z) / d * DRAG.rope; step = 9; }
    const dx = tx - a.x, dz = tz - a.z, L = Math.hypot(dx, dz); if (L < 1e-4) return;
    const k = Math.min(1, step / L), nx = a.x + dx * k, nz = a.z + dz * k;
    if (this.map.inBounds(nx, nz) && !this.map.insideObstacle(nx, nz)) { a.x = nx; a.z = nz; }
    else if (g.phase === 'settle') g.spot = null;
  };
  // ---- Fumigène d'équipe (22/10, demande de l'utilisateur) : un seul par équipe ; il passe à celui qui va chercher un blessé
  Battle.prototype.smokeHolder = function (u) {
    if ((u.grenades.smoke || 0) > 0) return u;
    return this.teams[u.team].units.find(o => o !== u && o.alive && (o.grenades.smoke || 0) > 0 && !o.throwing) || null;
  };
  Battle.prototype.takeSmoke = function (u) {
    const h = this.smokeHolder(u); if (!h) return false;
    if (h !== u) { h.grenades.smoke--; u.grenades.smoke = (u.grenades.smoke || 0) + 1; }
    return true;
  };
  // Dotation (22/10, demande de l'utilisateur) : deux grenades au plus par équipe — un fumigène et une frag (à défaut une
  // incapacitante) ; la frag au Grenadier s'il y en a un
  Battle.prototype.capGrenades = function (team) {
    const us = team.units, frag = us.find(u => has(u, 'grenadier') && u.grenades.frag > 0) || us.find(u => u.grenades.frag > 0);
    const flash = frag ? null : us.find(u => u.grenades.flash > 0), smoke = us.find(u => has(u, 'medic')) || us[0];
    for (const u of us) u.grenades = {};
    if (smoke) smoke.grenades.smoke = 1;
    if (frag) frag.grenades.frag = 1; else if (flash) flash.grenades.flash = 1;
  };
  // ---- Secours sur ordre (22/10, idée de l'utilisateur) ------------------------------------------------------------------
  // Clic droit sur un équipier à terre avec des opérateurs choisis : battle.command('secourir', équipe, { id, units }).
  // Le plus proche du blessé va le chercher (il reçoit le fumigène de l'équipe). Tant que le blessé est sous les yeux de
  // l'ennemi, il gagne du terrain d'abri en abri, puis fonce quand c'est jouable (nuage en place, peu de découvert, ou
  // après avoir attendu) ; pris sous le feu avant de l'avoir attrapé : il se replie à couvert et réessaie. Le 2e l'accompagne
  // et tire pour le couvrir, collé à lui pendant qu'il tire le blessé ; les suivants se postent à couvert, en protection,
  // face à la menace. Tous quittent leur poste. Sans choix (« Tous ») : le plus proche seul.
  const RESCUE_WAIT = 4, RESCUE_RETRY = 3;
  Battle.prototype.rescueOrder = function (teamIndex, arg) {
    const team = this.teams[teamIndex]; if (!team || this.over) return { ok: false, reason: 'bataille terminée' };
    arg = arg || {};
    const a = team.units.find(x => x.id === arg.id || x.def.id === arg.id);
    if (!a) return { ok: false, reason: 'blessé inconnu' };
    if (a.alive) return { ok: false, reason: `${a.callsign} n’est pas à terre` };
    if (!(a.bleedUntil > this.t + 1)) return { ok: false, reason: `trop tard pour ${a.callsign}` };
    const ids = Array.isArray(arg.units) && arg.units.length ? arg.units : null;
    let units = team.units.filter(u => u.alive && u !== a && (!ids || ids.includes(u.id) || ids.includes(u.def.id)));
    if (!units.length) return { ok: false, reason: 'aucun opérateur' };
    const wait = Math.max(...units.map(u => (u.orderAt === undefined ? -99 : u.orderAt) + ORDER_COOLDOWN - this.t));
    if (wait > 1e-6) return { ok: false, reason: `un ordre toutes les ${ORDER_COOLDOWN} s (encore ${Math.ceil(wait)} s)` };
    units.sort((p, q) => dist2(p, a) - dist2(q, a) || p.idx - q.idx);
    if (!ids) units = units.slice(0, 1);
    const id = this.orderSeq = (this.orderSeq || 0) + 1;
    const other = this.draggedBy(a); if (other && !units.includes(other)) { a.dragBy = null; other.drag = null; this.stop(other); other.state = 'idle'; }
    team.rescues = team.rescues || {};
    for (const k in team.rescues) if (team.rescues[k].downed === a.id) this.endRescue(team, k, true);   // un nouvel ordre pour le même blessé remplace l'ancien
    team.rescues[id] = { id, downed: a.id, members: units.map(u => u.id), puller: units[0].id, retryAt: 0, waitSince: null, tries: 0, smokeReady: 0, smokeUntil: 0, spots: {} };
    units.forEach((u, k) => {
      if (u.rescueOrder) { const R0 = team.rescues[u.rescueOrder.id]; if (R0) R0.members = R0.members.filter(m => m !== u.id); }
      if (u.drag && u.drag.id !== a.id) { const b = this.unitById(u.drag.id); if (b && b.dragBy === u) b.dragBy = null; u.drag = null; }
      u.moveOrder = null; u.keyOrder = null; u.post = null; u.orderAt = this.t; u.reviving = null; u.support = null;
      u.rescueOrder = { id, downed: a.id, role: k === 0 ? 'puller' : k === 1 ? 'escort' : 'guard' };
      this.stop(u); u.commitUntil = 0; u.pauseUntil = 0;
    });
    this.takeSmoke(units[0]);
    this.logEvent('rescueorder', `${team.name} : ${units.map(u => u.callsign).join(', ')} — ordre : aller chercher ${a.callsign}${units.length > 1 ? ` (${units[0].callsign} le récupère)` : ''}.`, { team: teamIndex, unit: units[0].id, ordre: id });
    return { ok: true, id, unit: units[0].id, units: units.map(u => u.id), fumee: (units[0].grenades.smoke || 0) > 0 };
  };
  Battle.prototype.endRescue = function (team, id, silent) {
    const R = team.rescues && team.rescues[id]; if (!R) return;
    delete team.rescues[id];
    for (const u of team.units) if (u.rescueOrder && u.rescueOrder.id === R.id) { u.rescueOrder = null; if (u.alive && u.goalKind !== 'drag') u.state = 'idle'; }
    const a = this.unitById(R.downed);
    if (!silent && a && !a.alive && !(a.bleedUntil > this.t)) this.logEvent('rescue_fail', `${a.callsign} n’a pas pu être récupéré à temps.`, { team: team.index, unit: a.id });
  };
  // l'ennemi connu (vu, ou su depuis moins de 6 s) le plus proche qui voit le blessé : { e, k } (k = sa position connue)
  Battle.prototype.rescueThreat = function (u, a) {
    let best = null, bd = Infinity;
    for (const e of this.enemiesOf(u)) {
      if (!e.alive) continue;
      const seen = u.visible.has(e.id), k = seen ? { x: e.x, z: e.z, t: this.t } : u.knowledge[e.id];
      if (!k || this.t - k.t > 6 || !this.map.hasLOS(k.x, EYE.stand, k.z, a.x, 0.9, a.z)) continue;
      const d = Math.hypot(k.x - a.x, k.z - a.z); if (d < bd) { bd = d; best = { e, k }; }
    }
    return best;
  };
  // menaces pour un secours : les ennemis que l'équipe connaît (vus, ou sus depuis moins de 15 s) d'où l'on voit le blessé ;
  // fresh = vu depuis moins de 3 s
  Battle.prototype.rescueThreats = function (u, a) {
    const out = [], team = this.teams[u.team];
    for (const e of this.enemiesOf(u)) {
      if (!e.alive) continue;
      let k = null;
      for (const m of team.units) { if (!m.alive) continue; const q = m.visible.has(e.id) ? { x: e.x, z: e.z, t: this.t } : m.knowledge[e.id]; if (q && (!k || q.t > k.t)) k = q; }
      if (!k || this.t - k.t > 15) continue;
      if (this.map.hasSolidLOS(k.x, EYE.stand, k.z, a.x, 0.9, a.z)) out.push({ x: k.x, z: k.z, fresh: this.t - k.t < 3 });
    }
    return out;
  };
  // un abri plus près du blessé (d'au moins 2 m), caché de toutes les menaces, à moins de 12 m de soi
  Battle.prototype.rescueStep = function (u, a, ths) {
    const d0 = dist2(u, a); let best = null, bs = Infinity;
    for (const c0 of this.map.coverPoints) {
      if (Math.abs(c0.x - u.x) > 13 || Math.abs(c0.z - u.z) > 13) continue;
      const h = this.hug(c0), cx = h.hx, cz = h.hz, du = Math.hypot(cx - u.x, cz - u.z), da = Math.hypot(cx - a.x, cz - a.z);
      if (du > 12 || du < 1 || da > d0 - 2) continue;
      const s = da + du * 0.4; if (s >= bs) continue;
      if (this.alliesOf(u).some(o => o !== u && o.alive && Math.hypot(o.x - cx, o.z - cz) < 1.2)) continue;
      if (ths.some(t => this.map.hasLOS(t.x, EYE.stand, t.z, cx, 0.9, cz))) continue;
      bs = s; best = { x: cx, z: cz };
    }
    return best;
  };
  Battle.prototype.followRescue = function (u, threats, beingShot) {
    const o = u.rescueOrder, team = this.teams[u.team], R = team.rescues && team.rescues[o.id], a = this.unitById(o.downed);
    if (!R || !a || a.alive || !(a.bleedUntil > this.t)) { if (R) this.endRescue(team, o.id); else u.rescueOrder = null; return false; }
    if (u.evade && this.t < u.evade.until) return true;
    if (u.throwing) return true;
    if (u.status === 'critical' && o.role === 'puller') { R.puller = null; o.role = 'guard'; if (u.drag) { if (a.dragBy === u) a.dragBy = null; u.drag = null; this.stop(u); } }
    // le récupérateur est tombé (ou blessé) : l'accompagnateur, sinon un garde, prend sa place
    let P = R.puller && this.unitById(R.puller);
    if (!P || !P.alive || !P.rescueOrder || P.rescueOrder.id !== R.id) {
      const ms = R.members.map(id => this.unitById(id)).filter(m => m && m.alive && m.rescueOrder && m.rescueOrder.id === R.id && m.status !== 'critical');
      P = ms.find(m => m.rescueOrder.role === 'escort') || ms.sort((p, q) => dist2(p, a) - dist2(q, a))[0];
      if (!P) { this.endRescue(team, R.id); return false; }
      R.puller = P.id; P.rescueOrder.role = 'puller'; R.waitSince = null; this.takeSmoke(P);
      this.logEvent('rescue', `${P.callsign} : « Je prends le relais pour ${a.callsign} ! »`, { unit: P.id, team: u.team });
    }
    const close = threats.some(e => dist2(e, u) < DRAG.close);
    if (o.role === 'puller') return this.rescuePull(u, a, R, threats, beingShot, close);
    if (close) return false;   // ennemi tout près : on se bat
    const T = this.rescueThreat(u, a);
    if (T && !threats.length && !(u.target && u.target.alive && u.target.id === T.e.id)) this.aimAt(u, T.e);   // tir de couverture sur la menace connue
    const Tk = T ? T.k : (threats[0] || null);
    if (o.role === 'escort') {
      const pulling = P.drag && P.drag.id === a.id && P.drag.phase !== 'go';
      let spot = null;
      if (pulling || (P.drag && P.drag.id === a.id)) {
        // collé au récupérateur, sur le côté, un peu en avant (vers l'abri) : on recule ensemble
        const dest = P.drag.c, dir = Math.atan2(dest.z - P.z, dest.x - P.x), side = Tk ? Math.sign(Math.sin(Math.atan2(Tk.z - P.z, Tk.x - P.x) - dir)) || 1 : 1;
        for (const sd of [side, -side]) {
          const q = { x: P.x + Math.cos(dir + sd * Math.PI / 2) * 1.5 + Math.cos(dir) * 0.6, z: P.z + Math.sin(dir + sd * Math.PI / 2) * 1.5 + Math.sin(dir) * 0.6 };
          if (this.map.inBounds(q.x, q.z) && !this.map.insideObstacle(q.x, q.z)) { spot = q; break; }
        }
      } else {
        // en approche, ou le blessé relevé à l'abri : un couvert près du récupérateur d'où l'on voit la menace, sinon à côté de lui
        if (Tk) {
          const c = this.findCover(u, Tk, 9, { requireShoot: true, towards: P });
          if (c && Math.hypot(c.x - P.x, c.z - P.z) < 3.5) spot = c;
        }
        if (!spot) { const ang = Tk ? Math.atan2(Tk.z - P.z, Tk.x - P.x) + Math.PI / 2 : P.facing + Math.PI / 2;
          for (const k of [1, -1, 2, -2]) { const q = { x: P.x + Math.cos(ang) * 1.8 * Math.sign(k) * Math.abs(k) * 0.75, z: P.z + Math.sin(ang) * 1.8 * Math.sign(k) * Math.abs(k) * 0.75 }; if (this.map.inBounds(q.x, q.z) && !this.map.insideObstacle(q.x, q.z)) { spot = q; break; } } }
      }
      const r = this.rescueHoldSpot(u, spot, Tk, pulling ? 0.9 : 1.3);
      if (u.state === 'tocover' && spot && Math.hypot(spot.x - u.x, spot.z - u.z) > 3) u.state = 'closing';   // il presse le pas pour rester avec lui
      return r;
    }
    // garde : à couvert près de l'abri où l'on ramène le blessé (sinon près du blessé), en protection face à la menace
    const dest = P.drag && P.drag.id === a.id ? P.drag.c : a;
    let sp = R.spots[u.id];
    if (sp && this.t - sp.t > 4) sp = null;   // menace qui a bougé : on revoit sa place de temps en temps
    if (!sp) {
      let c = null;
      // déjà à couvert d'où l'on voit la menace : on protège d'ici ; sinon un abri proche avec une vue sur elle
      if (Tk && this.coverAt(u.x, u.z, Tk.x, Tk.z, false) && this.map.hasLOS(u.x, EYE.stand, u.z, Tk.x, CHEST.stand, Tk.z)) c = { x: u.x, z: u.z };
      if (!c && Tk) c = this.findCover(u, Tk, 9, { requireShoot: true, towards: dest, minRange: 5 });
      if (c && c.x !== u.x && Math.hypot(c.x - dest.x, c.z - dest.z) > 14) c = null;
      if (!c && Tk) c = this.findCover(u, Tk, 9, { towards: dest });
      sp = R.spots[u.id] = c ? { x: c.x, z: c.z, t: this.t } : { none: true, t: this.t };
    }
    if (sp.none) return false;   // pas d'abri pour protéger : il se bat d'où il est
    return this.rescueHoldSpot(u, sp, Tk || this.map.spawns[1 - u.team], 1.0);
  };
  // aller à sa place ; arrivé : posté, face à la menace (accroupi seulement derrière un abri face à elle)
  Battle.prototype.rescueHoldSpot = function (u, spot, Tk, tol) {
    if (spot && Math.hypot(spot.x - u.x, spot.z - u.z) > tol) {
      if (!(u.goal && Math.hypot(u.goal.x - spot.x, u.goal.z - spot.z) < 0.8) && !this.setGoal(u, spot.x, spot.z, 'close')) { this.stop(u); u.state = 'overwatch'; return true; }
      u.state = 'tocover'; u.stance = 'stand'; return true;
    }
    this.stop(u); u.state = 'overwatch';
    if (Tk) { u.facing = Math.atan2(Tk.z - u.z, Tk.x - u.x); u.stance = this.coverAt(u.x, u.z, Tk.x, Tk.z, false) ? 'crouch' : 'stand'; }
    return true;
  };
  Battle.prototype.rescuePull = function (u, a, R, threats, beingShot, close) {
    const rescuers = R.members.map(id => this.unitById(id)).filter(m => m && m.alive);
    if (u.drag && u.drag.id === a.id) {
      // foncé vers lui mais pris sous le feu avant de l'avoir attrapé (sans nuage) : on se replie et on réessaie
      if (u.drag.phase === 'go' && u.lastShotByAt > u.drag.t0 + 0.3 && dist2(u, a) > 2.5 && !(this.t < R.smokeUntil)) {
        a.dragBy = null; u.drag = null; this.stop(u);
        R.retryAt = this.t + RESCUE_RETRY; R.waitSince = null; R.tries++;
        this.logEvent('rescue', `${u.callsign} : « Trop chaud, je me replie ! »`, { unit: u.id, team: u.team });
        const th = (u.lastShotBy && u.lastShotBy.alive ? u.lastShotBy : null) || threats[0];
        const c = th && this.findCover(u, th, 8, { wantShoot: false });
        if (c && this.setGoal(u, c.x, c.z, 'cover')) { u.state = 'tocover'; u.stance = 'stand'; return true; }
        return false;
      }
      if (this.continueDrag(u, threats)) return true;
    }
    if (u.reviving) return true;
    if (close) return false;   // ennemi tout près : on se bat d'abord
    a.rescue = { by: u, t: this.t };
    const d = dist2(u, a);
    const ths = this.rescueThreats(u, a);
    if (!ths.length && d > 2.5 && (beingShot || threats.length)) {
      // le blessé est à l'abri des vues, mais pas le chemin : pris à partie en route, on avance d'abri en abri (caché des
      // ennemis connus) ; pas d'abri plus près : on se bat d'ici, puis on retente au bout d'un moment
      const dz = []; for (const e of this.enemiesOf(u)) { if (!e.alive) continue; const k = u.visible.has(e.id) ? e : u.knowledge[e.id]; if (k && (u.visible.has(e.id) || this.t - k.t < 15)) dz.push({ x: k.x, z: k.z }); }
      if (u.goal && u.goalKind === 'cover' && u.state === 'tocover' && Math.hypot(u.goal.x - u.x, u.goal.z - u.z) > 0.6) return true;
      const st = this.rescueStep(u, a, dz);
      if (st && this.setGoal(u, st.x, st.z, 'cover')) { u.state = 'tocover'; u.stance = 'stand'; R.waitSince = null; return true; }
      if (R.waitSince === null) R.waitSince = this.t;
      if (this.t - R.waitSince < RESCUE_WAIT) {
        const th = threats[0] || (u.lastShotBy && u.lastShotBy.alive ? u.lastShotBy : null);
        if (th && !this.coverAt(u.x, u.z, th.x, th.z, false)) { const c2 = this.findCover(u, th, 8, { towards: a }); if (c2 && Math.hypot(c2.x - u.x, c2.z - u.z) > 0.8 && this.setGoal(u, c2.x, c2.z, 'cover')) { u.state = 'tocover'; u.stance = 'stand'; return true; } }
        return false;   // à couvert : on riposte, puis on retente
      }
    }
    if (!ths.length) {   // personne ne le voit : on y va (au pas de course) et on le relève sur place
      if (d <= 1.1) { if (threats.length || beingShot) return false; this.stop(u); u.stance = 'crouch'; u.state = 'reviving'; u.target = null; u.reviving = { id: a.id, until: this.t + (has(u, 'medic') ? 2 : 4) }; this.logEvent('revive_start', `${u.callsign} se porte au secours de ${a.callsign}.`, { unit: u.id, team: u.team }); return true; }
      const L = d || 1, gx = a.x + (u.x - a.x) / L * 0.85, gz = a.z + (u.z - a.z) / L * 0.85, ok = this.map.inBounds(gx, gz) && !this.map.insideObstacle(gx, gz);
      if (!(u.goal && u.goalKind === 'revive') && !this.setGoal(u, ok ? gx : a.x, ok ? gz : a.z, 'revive')) return false;
      u.state = 'todrag'; u.stance = 'stand'; return true;
    }
    let c = this.dragCover(u, a, ths) || this.dragCover(u, a, ths, 13);
    if (!c && R.base && this.map.walkableSegment(a.x, a.z, R.base.x, R.base.z)) c = R.base;   // aucun abri près de lui : on le ramène là où l'on s'abritait
    const fresh = ths.filter(t => t.fresh), smokeOn = this.t < R.smokeUntil && this.t >= R.smokeReady;
    if (R.smokeReady && this.t < R.smokeReady) { this.stop(u); u.state = 'todrag'; u.stance = 'crouch'; return true; }   // le nuage se forme : on attend
    // le fumigène de l'équipe : entre le trajet et la menace la plus proche, une fois par secours
    const v = u.speed(), tOpen = Math.max(0, d - 1) / (v * 1.2) + (c ? Math.hypot(c.x - a.x, c.z - a.z) : 6) / (v * DRAG.speed);
    if (c && (fresh.length || tOpen > DRAG.maxOpen) && !R.smokeReady && (u.grenades.smoke || 0) > 0 && d < 20) {
      let T = ths[0], td = Infinity; for (const t of ths) { const dd = Math.hypot(t.x - a.x, t.z - a.z); if (dd < td) { td = dd; T = t; } }
      const mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2, L = Math.hypot(T.x - mx, T.z - mz) || 1, k = Math.min(GRENADES.smoke.radius, L * 0.4);
      const sx = mx + (T.x - mx) / L * k, sz = mz + (T.z - mz) / L * k, sd = Math.hypot(sx - u.x, sz - u.z);
      if (sd <= 24 && sd >= 2 && this.map.hasLOS(u.x, 2.3, u.z, sx, 1.4, sz)) {
        this.stop(u); u.state = 'throw'; u.stance = 'stand'; u.target = null; u.facing = Math.atan2(sz - u.z, sx - u.x);
        u.throwing = { at: this.t + 0.5 + (1 - u.def.reflexes / 100) * 0.3, x: sx, z: sz, d: sd, kind: 'smoke', target: `couvrir ${a.callsign}` };
        R.smokeReady = u.throwing.at + 0.45 + sd / 22 + GRENADES.smoke.fuse; R.smokeUntil = R.smokeReady + GRENADES.smoke.duration * 0.8;
        return true;
      }
    }
    const waited = R.waitSince !== null && this.t - R.waitSince > Math.max(1.5, RESCUE_WAIT - (rescuers.length - 1) * 1.2);   // plus on est nombreux à couvrir, moins on attend
    const go = c && this.t >= R.retryAt && (smokeOn || tOpen <= DRAG.maxOpen * (fresh.length ? 1 : 1.5) || waited || d < 2.5);
    if (go) {
      u.drag = { id: a.id, c, phase: 'go', t0: this.t, ths: ths.map(t => ({ x: t.x, z: t.z })) };
      a.dragBy = u; u.target = null; u.reviving = null; R.waitSince = null;
      u.stats.drags = (u.stats.drags || 0) + 1;
      this.logEvent('drag', `${u.callsign} : « ${R.tries ? 'J’y retourne' : 'Je vais le chercher'} ! »`, { unit: u.id, team: u.team });
      if (this.continueDrag(u, threats)) return true;
      return false;
    }
    // gagner du terrain : d'abri en abri vers le blessé ; au plus près, attendre l'ouverture (on se bat d'ici en attendant)
    if (u.goal && u.goalKind === 'cover' && u.state === 'tocover' && Math.hypot(u.goal.x - u.x, u.goal.z - u.z) > 0.6) return true;
    const st = this.t >= R.retryAt || !this.coverAt(u.x, u.z, (ths[0] || a).x, (ths[0] || a).z, false) ? this.rescueStep(u, a, ths) : null;
    if (st && this.setGoal(u, st.x, st.z, 'cover')) { u.state = 'tocover'; u.stance = 'stand'; R.waitSince = null; return true; }
    if (R.waitSince === null) R.waitSince = this.t;
    if (this.coverAt(u.x, u.z, (ths[0] || a).x, (ths[0] || a).z, false)) R.base = { x: u.x, z: u.z };
    if (!this.coverAt(u.x, u.z, (ths[0] || a).x, (ths[0] || a).z, false)) {
      const c2 = this.findCover(u, ths[0] || a, 8, { towards: a });
      if (c2 && Math.hypot(c2.x - u.x, c2.z - u.z) > 0.8 && this.setGoal(u, c2.x, c2.z, 'cover')) { u.state = 'tocover'; u.stance = 'stand'; return true; }
    }
    this.stop(u); u.state = 'overwatch'; u.stance = 'crouch';
    if (ths[0]) u.facing = Math.atan2(ths[0].z - u.z, ths[0].x - u.x);
    return true;
  };
  Battle.prototype.updateRevives = function () {
    // un blessé à terre ne bouge plus : c'est aux alliés de venir le relever
    for (const u of this.units) {
      if (!u.reviving) continue;
      const a = this.unitById(u.reviving.id);
      if (!u.alive || !a || a.alive || this.t > a.bleedUntil || dist2(u, a) > 1.6) { u.reviving = null; if (u.alive) u.state = 'idle'; continue; }
      if (this.t < u.reviving.until) continue;
      u.reviving = null; u.state = 'idle'; u.stats.revives++; u.getupUntil = this.t + GETUP_RESCUER;
      a.alive = true; a.revived = true; a.bleedUntil = 0; a.rescue = null; a.hp = Math.round(a.maxHp * 0.3); a.status = 'critical';
      a.stance = 'crouch'; a.suppression = 0.5; a.state = 'getup'; a.target = null; a.visible = new Set(); a.lastHitAt = this.t; a.getupUntil = this.t + GETUP; this.stop(a);
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
      e.alive = false; e.status = 'down'; e.downAt = this.t; e.target = null; this.stop(e); e.stance = 'crouch'; e.visible = new Set(); e.peek = null; e.peeking = false;
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
  // Sous l'ordre « Appui » du clic droit (u.appuiAt, posé par appuiFire), tout opérateur peut le faire : position connue
  // depuis moins de 8 s, ennemi à ± 4 m d'elle (positions entendues : imprécises).
  Battle.prototype.canSuppress = function (u, e) {
    const appui = this.t - (u.appuiAt === undefined ? -99 : u.appuiAt) < 0.35;
    if ((u.role.id !== 'support' && !appui) || u.reloading > 0 || u.ammo < (appui ? 4 : 20)) return false;
    const k = u.knowledge[e.id]; if (!k || this.t - k.t > (appui ? APPUI_MEM : 2) || Math.hypot(k.x - e.x, k.z - e.z) > (appui ? 4 : 1.2)) return false;
    const d = dist2(u, e); if (d > u.weapon.range * 1.1 || d < 6) return false;
    if (this.allyInLine(u, e)) return false;
    // en appui : les balles atteignent les abords de son abri (vue sur un point 3 m devant lui, à 1 m du sol) — elles claquent
    // dans son abri (voiture, fourgon, muret) ou autour de lui
    // (on se relève pour tirer : vue prise debout)
    if (appui) { const q = 3 / (d || 1); if (this.map.hasLOS(u.x, EYE.stand, u.z, e.x + (u.x - e.x) * q, 1.0, e.z + (u.z - e.z) * q)) return true; }
    const blk = this.map.blocker(u.x, u.eyeY(), u.z, e.x, e.chestY(), e.z);
    return !!blk && blk.kind === 'cover' && this.map.hasLOS(u.x, u.eyeY(), u.z, e.x, 1.6, e.z);
  };
  Battle.prototype.suppressAt = function (u, e) {
    if (u.aimTimer > 0) { u.aimTimer -= DT; return; }
    u.fireAcc += DT * (u.weapon.soutenue || u.weapon.rpm) / 60 * (u.role.id === 'support' ? 0.6 : 1); // rafales courtes (fusil d'assaut en appui : sa cadence de coups ajustés, ~1,8 coup/s)
    while (u.fireAcc >= 1 && u.ammo > 0) {
      u.fireAcc -= 1; u.ammo--; u.stats.shots++; u.stats.suppressShots = (u.stats.suppressShots || 0) + 1; u.lastShotAt = this.t; this.lastShotTime = this.t;
      if (this.t - e.lastShotByAt > 1.5) e.firstShotAt = this.t;
      e.lastShotBy = u; e.lastShotByAt = this.t;
      e.suppression = clamp(e.suppression + u.weapon.suppress * (u.role.id === 'support' ? 0.8 : 1.1), 0, 1);   // (fusil en appui : moins de coups, chacun bien placé)
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
    if (w.rpm > 100) p *= 1 - (has(u, 'gunner') ? 0.018 : 0.035) * (u.att.compensateur ? 0.6 : 1) * Math.min(u.burst, 5);   // coups ajustés : le recul retombe entre deux balles   // Tir soutenu, compensateur
    // à courte portée on ne rate (presque) plus : sous 15 m, la chance remonte fortement vers 95 % (×0,81 de l'écart à 2 m,
    // ×0,54 à 5 m, ×0,19 à 10 m, rien à 15 m et au-delà). La portée lointaine reste incertaine.
    const close = clamp(1 - d / 15, 0, 1);
    if (close > 0) p += (0.95 - p) * Math.pow(close, 1.5);
    if (this.t < u.blindUntil) p *= 0.25;                                             // aveuglé
    const cv = this.map.coverFrom(e.x, e.z, u.x, u.z, e.stance === 'stand');
    // derrière un couvert, seuls la tête et les épaules dépassent quand il se lève pour tirer : cible bien plus petite
    if (cv) p *= cv.level === 'partial' ? 0.28 : 0.12;
    else if (e.peeking) p *= 0.4;                                                     // au coin d'un mur : une moitié du corps dépasse
    return { p: clamp(p, 0.03, 0.95), cover: cv, soft: !!cv && this.map.softCover(cv.obstacle, u.x, u.z, e.x, e.z) };
  };
  Battle.prototype.fireAt = function (u, e) {
    if (u.reloading > 0) return;
    if (u.ammo <= 0) return;
    // mise en joue terminée : le premier coup part aussitôt (il attendait encore une cadence de tir entière, ~0,5 s, qui
    // s'ajoutait au repérage et à la visée : « ils se voient et ne tirent pas »)
    if (u.aimTimer > 0) { u.aimTimer -= DT; if (u.aimTimer <= 0) u.fireAcc = Math.max(u.fireAcc, 1); return; }
    if (this.t < (u.burstPauseUntil || 0)) return;   // entre deux rafales : on reprend la visée (et on se baisse derrière un couvert)
    const d = dist2(u, e);
    // sans ligne de vue sur la poitrine, pas de tir (la perception l'a vérifié ce pas-ci, on re-vérifie par sécurité)
    if (!this.canSee(u, e)) return;
    if (this.allyInLine(u, e)) { u.fireAcc = Math.min(u.fireAcc, 0.99); u.blockedAt = this.t; return; }   // un allié devant : on ne tire pas
    if (this.hitChance(u, e, d).p < this.fireThreshold(u)) { u.fireAcc = Math.min(u.fireAcc, 0.99); return; }
    u.fireAcc += DT * u.weapon.rpm / 60;
    while (u.fireAcc >= 1 && u.ammo > 0) {
      u.fireAcc -= 1;
      if (u.burst === 0) u.burstSup = u.suppression;
      this.shoot(u, e, d);
    }
    // rafales courtes : 3 à 5 coups vite, puis on se remet à l'abri (on se baisse derrière un couvert bas, on revient
    // derrière le mur après un tir au coin) le temps de souffler — plus longtemps si les balles claquent autour ; sans
    // couvert, juste une courte pause pour reprendre la visée. Les balles qui claquent trop près coupent la rafale.
    if (u.weapon.rpm > 100 && u.ammo > 0 && u.burst > 0) {
      const duck = !!u.peek || !!this.coverAt(u.x, u.z, e.x, e.z, false);
      const hot = u.suppression - (u.burstSup || 0) > 0.15;
      if (u.burst >= (u.burstLen || 4) || (hot && duck)) {
        u.burstPauseUntil = this.t + (duck ? 0.9 + this.rng.next() * 0.9 + Math.min(2.5, u.suppression * 2.5) : 0.3 + this.rng.next() * 0.3);
        u.burst = 0; u.burstLen = 3 + Math.floor(this.rng.next() * 3); u.fireAcc = 0;
        if (duck && !u.peek) u.stance = 'crouch';
      }
    }
    if (u.ammo === 0 && u.mags > 0) this.startReload(u);
  };
  // Rythme des fusillades : dans un vrai échange de tirs, la plupart des balles ratent. Au-delà de quelques mètres, chaque
  // balle a TEMPO_HIT fois la chance calculée (l'IA décide toujours avec la chance « normale » : elle ne joue pas plus
  // prudemment, elle touche simplement moins). De près (sous TEMPO_NEAR m) rien ne change : on ne rate pas à bout portant ; entre 3 et 10 m, on passe progressivement de l'un à l'autre. Réglé pour des batailles de ~3 min 20 (contre ~1 min 30 avant).
  // Les balles manquées continuent de clouer l'adversaire : les échanges durent, le joueur a le temps de réfléchir.
  const TEMPO_HIT = 0.2, TEMPO_NEAR = 3, TEMPO_FULL = 10;
  const tempoHit = (d) => d <= TEMPO_NEAR ? 1 : d >= TEMPO_FULL ? TEMPO_HIT : 1 - (1 - TEMPO_HIT) * (d - TEMPO_NEAR) / (TEMPO_FULL - TEMPO_NEAR);
  Battle.prototype.shoot = function (u, e, d) {
    u.ammo--; u.stats.shots++; u.lastShotAt = this.t; this.lastShotTime = this.t; u.burst++; u.aimHistory[e.id] = this.t;
    if (this.t - e.lastShotByAt > 1.5) e.firstShotAt = this.t;   // premières balles depuis un moment : réaction immédiate (voir step)
    e.lastShotBy = u; e.lastShotByAt = this.t;
    const { p, cover, soft } = this.hitChance(u, e, d);
    const hit = this.rng.chance(p * tempoHit(d));
    const from = { x: u.x, y: u.eyeY() - 0.15, z: u.z };
    let to;
    if (hit) {
      to = { x: e.x, y: e.chestY(), z: e.z };
      this.applyHit(u, e, d);
    } else {
      // la balle passe près : suppression (moindre si la cible est à couvert ou si le tir est lointain)
      const far = d > u.weapon.range ? 0.5 : 1;
      e.suppression = clamp(e.suppression + u.weapon.suppress * 0.55 * (cover ? 0.7 : 1) * far * (has(u, 'gunner') ? 1.2 : 1), 0, 1);
      // derrière la tôle d'une voiture (hors bloc moteur), une balle sur six traverse : blessure atténuée (×0,5, jamais
      // la tête), la tôle protège encore un peu
      if (cover && /^voiture/.test(cover.obstacle.name || '')) this.carHit(cover.obstacle);
      if (soft && this.rng.chance(PEN_CHANCE)) {
        this.emit({ type: 'shot', shooter: u.id, target: e.id, from, to: { x: e.x, y: e.chestY() - 0.2, z: e.z }, hit: true, through: true });
        this.applyHit(u, e, d, false, true); return;
      }
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
  const PEN_CHANCE = 0.16, PEN_DMG = 0.5;
  Battle.prototype.applyHit = function (u, e, d, stray, through) {
    const w = u.weapon;
    const r = d / w.range;
    let fall = r <= 0.3 ? 1 : (r <= 1 ? 1 - (r - 0.3) / 0.7 * (1 - w.falloff) : Math.max(0.3 * w.falloff, w.falloff - (r - 1) * 0.7 * w.falloff));
    const roll = this.rng.next();
    let loc, mult, prot;
    // derrière un couvert bas (jambes cachées), les balles qui portent trouvent la tête, le haut du torse ou les bras
    const low = this.map.coverFrom(e.x, e.z, u.x, u.z, e.stance === 'stand');
    const headP = through ? 0 : low ? 0.14 : 0.08, torsoP = through ? 0.55 : low ? 0.70 : 0.60;
    if (roll < headP) { loc = 'tête'; mult = 2.2; prot = e.armor.head; }
    else if (roll < torsoP) { loc = 'torse'; mult = 1.0; prot = e.armor.torso; }
    else { loc = 'membre'; mult = 0.55; prot = 0; }
    let dmg = w.damage * fall * mult * (1 - prot) * this.rng.range(0.85, 1.15);
    if (has(u, 'breach') && d < 10 && (w.cls === 'brèche' || w.cls === 'pm')) dmg *= 1.15;   // Enfonceur
    if (this.synergy(e, 'commandement')) dmg *= 0.9;                                                   // synergie Commandement
    if (through) dmg *= PEN_DMG;                                                                       // à travers la tôle
    dmg = Math.round(dmg * 10) / 10;
    const before = e.hp;
    e.hp = Math.max(0, e.hp - dmg);
    e.lastHitAt = this.t; e.suppression = clamp(e.suppression + w.suppress * 1.2, 0, 1);
    u.stats.hits++; u.stats.damageDealt += dmg; e.stats.damageTaken += dmg; if (loc === 'tête') u.stats.headshots++;
    e.hitBy[u.id] = this.t;
    const absorbed = Math.round(w.damage * fall * mult * prot * 10) / 10;
    let text = through ? `${u.callsign} touche ${e.callsign} à travers la tôle (${loc}, ${d.toFixed(0)} m) : −${dmg} PV` : stray ? `Balle perdue : ${u.callsign} manque sa cible et touche ${e.callsign} (${loc}, ${d.toFixed(0)} m) : −${dmg} PV` : `${u.callsign} touche ${e.callsign} (${loc}, ${d.toFixed(0)} m) : −${dmg} PV`;
    if (absorbed > 0) text += ` (${absorbed} absorbés : ${e.armor.name})`;
    const prevStatus = e.status;
    if (e.hp <= 0) {
      e.alive = false; e.status = 'down'; e.downAt = this.t; e.target = null; this.stop(e); e.stance = 'crouch'; e.visible = new Set(); e.peek = null; e.peeking = false;
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
    else if (alive[0] === 0) { winner = 1; reason = `L’équipe ${this.teams[0].name} est entièrement neutralisée.`; }
    else if (alive[1] === 0) { winner = 0; reason = `L’équipe ${this.teams[1].name} est entièrement neutralisée.`; }
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
