// Moteur de combat OPERATOR TACTICS — simulation déterministe (graine), pas de temps fixe (0,1 s).
// Chaque opérateur perçoit, décide et agit individuellement. Le résultat découle des événements simulés.
(function (root, deps) {
  const { RNG, DATA, GameMap, MAPS } = deps;
  const { WEAPONS, ARMORS, ROLES, OPERATORS, ORDERS, TACTICS } = DATA;

  const DT = 0.1;                 // pas de simulation (s)
  const DECIDE_EVERY = 0.3;       // fréquence des décisions de l'IA (s)
  const COMMS_EVERY = 1.0;        // fréquence des échanges radio (s)
  const KNOWLEDGE_TTL = 25;       // une position connue est oubliée après 25 s
  const EYE = { stand: 1.6, crouch: 1.0 };
  const CHEST = { stand: 1.25, crouch: 0.75 };

  const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
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
    this.maxHp = 80 + def.endurance / 5 + (def.trait === 'colossus' || (Array.isArray(def.traits) && def.traits.includes('colossus')) ? 10 : 0); this.hp = this.maxHp;
    this.x = 0; this.z = 0; this.facing = 0; this.stance = 'stand';
    this.ammo = this.weapon.mag; this.mags = this.weapon.kit;
    this.reloading = 0;           // temps de rechargement restant (s)
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
    this.stats = { shots: 0, hits: 0, kills: 0, damageDealt: 0, damageTaken: 0, reloads: 0, headshots: 0, timeSuppressed: 0, distance: 0, streaks: 0, revenge: 0, veteran: 0, healed: 0 };
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
    if (team && team.tactics && team.tactics.drill && this.battle.t < 20) v *= 1.12;                 // Exercice de base : 20 premières secondes
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
    this.rng = new RNG(this.seed);
    this.map = new GameMap(MAPS[opts.mapId || 'entrepot']);
    this.timeLimit = opts.timeLimit || 240;
    // objectif : { type: 'eliminate' } (défaut) ou { type: 'hold', team, duration } : l'équipe team gagne si elle tient jusqu'à duration
    this.objective = opts.objective || { type: 'eliminate' };
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
      this.teams.push({ index: ti, name: td.name || (ti === 0 ? 'Alpha' : 'Bravo'), order, units, spawn: this.map.spawns[ti], lastSeen: {}, tactics, tacticIds: (td.tactics || []).filter(id => TACTICS[id]), auto: !!td.autoTactics, capture: 0 });
    });
    this.units = this.teams.flatMap(t => t.units);
    this.placeUnits();
    this.logEvent('start', `Début de l'engagement — ${this.map.name} — graine ${this.seed}. ${this.teams.map(t => `${t.name} (${ORDERS[t.order].name})`).join(' contre ')}.`);
  }
  Battle.defaultTeams = function () {
    return [
      { name: 'Alpha', order: 'assault', operators: OPERATORS.slice(0, 5).map(o => o.id) },
      { name: 'Bravo', order: 'assault', operators: OPERATORS.slice(5, 10).map(o => o.id) },
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
        const free = this.map.nearestFree(x, z); if (free) { const c = this.map.centerOf(free.c, free.r); x = c.x; z = c.z; }
        u.x = x; u.z = z; u.facing = face; u.home = { x, z };
        u.lastProgress = { x, z, t: 0 };
      });
    });
  };

  // Voie d'approche d'un opérateur : décalage latéral (m) par rapport à l'axe des zones de départ.
  // def.lane : -1 (nord), 0 (centre), 1 (sud) choisi par le joueur ; sinon répartition automatique.
  Battle.prototype.laneOf = function (u) { return u.def.lane !== undefined && u.def.lane !== null ? u.def.lane * 11 : (u.idx - 2) * 5.5; };
  Battle.prototype.logEvent = function (kind, text, data) {
    const e = Object.assign({ t: Math.round(this.t * 10) / 10, time: fmtT(this.t), kind, text }, data || {});
    this.log.push(e); return e;
  };
  Battle.prototype.emit = function (ev) { ev.t = this.t; this.events.push(ev); };
  Battle.prototype.drainEvents = function () { const e = this.events; this.events = []; return e; };
  Battle.prototype.enemiesOf = function (u) { return this.teams[1 - u.team].units; };
  Battle.prototype.alliesOf = function (u) { return this.teams[u.team].units.filter(a => a !== u); };

  // ---- Boucle principale -----------------------------------------------------------------
  Battle.prototype.step = function () {
    if (this.over) return;
    this.t = Math.round((this.t + DT) * 1000) / 1000; this.tick++;
    this.updateTactics();
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
    this.updateCapture();
    this.checkEnd();
  };
  Battle.prototype.run = function (maxSeconds) {
    const limit = maxSeconds || this.timeLimit + 1;
    while (!this.over && this.t < limit) this.step();
    return this.result;
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
  // Prendre position dans la zone : un couvert à l'intérieur (face à la menace) ou, à défaut, un point libre réparti autour du centre.
  Battle.prototype.occupyZone = function (u, facePos) {
    const z = this.zone;
    if (!u.zoneSpot) {
      let best = null, bs = -Infinity;
      for (const cp of this.map.coverPoints) {
        if (Math.hypot(cp.x - z.x, cp.z - z.z) > z.r - 0.6) continue;
        if (this.alliesOf(u).some(a => a.alive && a.zoneSpot && Math.hypot(a.zoneSpot.x - cp.x, a.zoneSpot.z - cp.z) < 2)) continue;
        const sc = (this.map.coverFrom(cp.x, cp.z, facePos.x, facePos.z, true) ? 3 : 0) - Math.hypot(cp.x - u.x, cp.z - u.z) * 0.05 + this.rng.next() * 0.5;
        if (sc > bs) { bs = sc; best = cp; }
      }
      if (!best) {
        const side = Math.sign(this.teams[u.team].spawn.x - z.x) || 1;
        for (let k = 0; k < 12 && !best; k++) {
          const a = (u.idx / 5) * Math.PI * 2 + this.rng.range(-0.5, 0.5), rr = z.r * this.rng.range(0.25, 0.7);
          const f = this.map.nearestFree(z.x + side * Math.abs(Math.cos(a)) * rr * 0.6 + Math.cos(a) * rr * 0.4, z.z + Math.sin(a) * rr);
          if (f) { const c = this.map.centerOf(f.c, f.r); if (this.inZone(c, -0.4)) best = c; }
        }
      }
      u.zoneSpot = best ? { x: best.x, z: best.z } : { x: z.x, z: z.z };
    }
    if (Math.hypot(u.zoneSpot.x - u.x, u.zoneSpot.z - u.z) > 1.0 && this.setGoal(u, u.zoneSpot.x, u.zoneSpot.z, 'advance')) { u.state = 'tozone'; u.stance = 'stand'; return; }
    this.stop(u); u.state = 'capture'; u.facing = Math.atan2(facePos.z - u.z, facePos.x - u.x);
    u.stance = this.map.coverFrom(u.x, u.z, facePos.x, facePos.z, false) ? 'crouch' : 'stand';
  };

  // ---- Perception ------------------------------------------------------------------------
  Battle.prototype.canSee = function (u, e) {
    // ligne de vue des yeux de u vers la poitrine de e
    return this.map.hasLOS(u.x, u.eyeY(), u.z, e.x, e.chestY(), e.z);
  };
  Battle.prototype.perceive = function (u) {
    const visRange = (30 + (u.def.perception / 100) * 45) * (has(u, 'eagle') ? 1.2 : 1); // 30..75 m (Œil de lynx : +20 %)
    const fov = Math.PI * 0.62;                          // ~112° de champ visuel
    const newVisible = new Set();
    for (const e of this.enemiesOf(u)) {
      if (!e.alive) { delete u.knowledge[e.id]; continue; }
      const d = dist2(u, e);
      // 1) la vue
      if (d <= visRange) {
        const ang = Math.atan2(e.z - u.z, e.x - u.x);
        const inFov = d < 7 || angDiff(ang, u.facing) < fov / 2 || u.visible.has(e.id);
        if (inFov && this.canSee(u, e)) {
          let p;
          if (u.visible.has(e.id)) p = 1;                   // on suit une cible déjà repérée
          else {
            p = 0.35 * (1 - d / visRange) * (0.6 + u.def.perception / 100);
            if (e.moving) p *= 1.6;
            if (this.t - e.lastShotAt < 1.5) p *= e.weapon.silenced ? 1.6 : 3;   // éclair de bouche, bruit
            if (e.stance === 'crouch') p *= 0.6;
            if (has(u, 'eagle')) p *= 1.3;                      // Œil de lynx
            if (has(e, 'ghost')) p *= 0.6;                      // Fantôme
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
      if (!newVisible.has(e.id) && this.t - e.lastShotAt < 0.25 && d < (e.weapon.silenced ? 18 : 70) * (has(e, 'ghost') ? 0.7 : 1)) {
        const k = u.knowledge[e.id];
        if (!k || this.t - k.t > 1.5) {
          const err = 2 + d * 0.05;
          u.knowledge[e.id] = { x: e.x + this.rng.gauss() * err, z: e.z + this.rng.gauss() * err, t: this.t, seen: false, source: 'ouïe' };
        }
      }
    }
    // drone de reconnaissance actif pour mon équipe : position exacte de tous les adversaires
    if (this.teams[u.team].recoUntil > this.t) for (const e of this.enemiesOf(u)) if (e.alive && !newVisible.has(e.id)) u.knowledge[e.id] = { x: e.x, z: e.z, t: this.t, seen: false, source: 'drone' };
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
      if (s > bestScore) { bestScore = s; best = e; }
    }
    return best;
  };
  // Le meilleur point de couverture contre une menace (ou une position connue), à distance raisonnable.
  Battle.prototype.findCover = function (u, threat, maxDist, opts) {
    opts = opts || {};
    let best = null, bestScore = -Infinity;
    for (const cp of this.map.coverPoints) {
      const d = dist2(u, cp); if (d > maxDist) continue;
      const cv = this.map.coverFrom(cp.x, cp.z, threat.x, threat.z, true);
      if (!cv) continue;
      // depuis ce point debout, puis-je voir la menace ? (sinon c'est une cachette, pas une position de tir)
      const canShoot = this.map.hasLOS(cp.x, EYE.stand, cp.z, threat.x, CHEST.stand, threat.z);
      if (opts.requireShoot && !canShoot) continue;
      if (opts.flank && this.map.coverFrom(opts.flank.x, opts.flank.z, cp.x, cp.z, opts.flank.stance === 'stand')) continue; // la cible y serait encore couverte
      const dt = Math.hypot(cp.x - threat.x, cp.z - threat.z);
      let s = 10 - d * 0.6;
      if (cv.level === 'partial') s += 3; else s += 1.5;
      if (canShoot) s += opts.wantShoot === false ? 0 : 4;
      if (opts.minRange && dt < opts.minRange) continue; // trop près de la menace pour cette arme
      if (opts.towards) s -= Math.hypot(cp.x - opts.towards.x, cp.z - opts.towards.z) * 0.25;
      if (opts.preferDist) s -= Math.abs(dt - opts.preferDist) * 0.08;
      // ne pas prendre un couvert occupé, visé ou réservé par un allié
      let occupied = false;
      for (const a of this.alliesOf(u)) {
        if (!a.alive) continue;
        if (Math.hypot(a.x - cp.x, a.z - cp.z) < 1.2 || (a.goal && Math.hypot(a.goal.x - cp.x, a.goal.z - cp.z) < 1.2) || (a.post && Math.hypot(a.post.x - cp.x, a.post.z - cp.z) < 1.2)) { occupied = true; break; }
      }
      if (occupied) continue;
      s += this.rng.next() * 0.05; // départage aléatoire des ex æquo (sinon l'ordre de la liste favoriserait un côté)
      if (s > bestScore) { bestScore = s; best = cp; }
    }
    return best;
  };
  const COMMIT = { cover: 3, close: 2.5, bound: 4, advance: 2.5, hide: 4, fallback: 3 };
  Battle.prototype.setGoal = function (u, x, z, kind) {
    if (u.goal && Math.hypot(u.goal.x - x, u.goal.z - z) < 0.6 && u.path) { u.goalKind = kind; return true; }
    const path = this.map.findPath(u.x, u.z, x, z);
    if (!path) { u.path = null; u.goal = null; return false; }
    u.path = path; u.pathIdx = 0; u.goal = { x, z }; u.goalKind = kind; u.repathAt = this.t;
    u.commitAt = this.t; u.commitUntil = this.t + (COMMIT[kind] || 2);
    return true;
  };
  // Mise en joue d'une nouvelle cible : temps d'acquisition selon l'arme et les réflexes ; plus rapide si on la visait il y a peu.
  Battle.prototype.aimAt = function (u, target) {
    u.target = target; u.burst = 0;
    let t = u.weapon.aim * (1.3 - (u.def.reflexes / 100) * 0.6) * (has(u, 'fasthands') ? 0.8 : 1);  // Mains sûres
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
        if (!this.map.coverFrom(cp.x, cp.z, threatPos.x, threatPos.z, true)) continue;
        let occupied = false;
        for (const a of this.alliesOf(u)) if (a.alive && a.post && Math.hypot(a.post.x - cp.x, a.post.z - cp.z) < 2.5) { occupied = true; break; }
        if (occupied) continue;
        const sc = this.map.openness(cp.x, cp.z, dirx, 6) * 2 - dh * 0.15 + this.rng.next() * 0.05;
        if (sc > bs) { bs = sc; best = cp; }
      }
      if (!best && this.zone) { this.occupyZone(u, threatPos); return; }   // aucun couvert libre dans la zone : on s'y installe quand même
      u.post = best ? { x: best.x, z: best.z } : (team.anchor ? { x: u.x, z: u.z } : { x: u.home.x, z: u.home.z });
    }
    if (Math.hypot(u.post.x - u.x, u.post.z - u.z) > 1.2) { if (this.setGoal(u, u.post.x, u.post.z, 'cover')) { u.state = 'tocover'; u.stance = 'stand'; return; } }
    this.stop(u); u.state = 'hold'; u.stance = 'stand'; u.facing = Math.atan2(threatPos.z - u.z, threatPos.x - u.x);
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
      const target = this.chooseTarget(u, threats);
      if (u.target !== target) this.aimAt(u, target);
      u.targetLostAt = 0;
    } else if (u.target) {
      if (!u.target.alive || !u.knowledge[u.target.id]) { u.target = null; }
      else { if (!u.targetLostAt) u.targetLostAt = this.t; if (this.t - u.targetLostAt > 4) u.target = null; }
      u.burst = 0;
    }

    // engagement sur un déplacement en cours : on continue (en tirant si possible) sauf si on vient d'être touché
    if (this.t < u.commitUntil && u.goal && u.lastHitAt <= u.commitAt) return;

    // 1) une cible est visible : engager
    if (threats.length > 0) {
      const target = u.target;
      const d = dist2(u, target);
      // la menace dont on se couvre : celui qui me tire dessus (même hors de vue), sinon ma cible
      const threat = (beingShot && u.lastShotBy && u.lastShotBy.alive) ? u.lastShotBy : target;
      const cover = this.map.coverFrom(u.x, u.z, threat.x, threat.z, true);
      const pinned = u.suppression > 0.8 - u.def.composure / 400 + (this.isBraced(u) ? 0.15 : 0) + (has(u, 'steady') ? 0.15 : 0) + (this.nearLeader(u) ? 0.1 : 0); // composure 80 → 0,6 ; calé / Sang-froid / Meneur
      const effective = this.hitChance(u, target, d, true).p >= this.fireThreshold(u);
      const wantCover = !cover && (beingShot || u.hp < u.maxHp * 0.7 || u.suppression > 0.35 || order !== 'assault' || u.reloading > 0);

      if (pinned && cover) { u.stance = 'crouch'; u.state = 'pinned'; this.stop(u); return; }
      // capture : si la zone n'est pas à nous, on ne s'éternise pas dans un échange de tirs à distance — on progresse vers la zone,
      // de couvert en couvert (le tireur d'élite reste en appui)
      if (this.zone && this.zone.holder !== u.team && u.role.id !== 'marksman' && !pinned && !this.inZone(u, 1) && u.reloading <= 0) {
        const dz = Math.hypot(u.x - this.zone.x, u.z - this.zone.z);
        const cp = this.findCover(u, threat, 14, { towards: this.zone });
        if (cp && Math.hypot(cp.x - this.zone.x, cp.z - this.zone.z) < dz - 2 && this.setGoal(u, cp.x, cp.z, 'bound')) { u.state = 'bounding'; u.stance = 'stand'; return; }
        if (order === 'assault' && this.setGoal(u, this.zone.x, this.zone.z, 'advance')) { u.state = 'advancing'; u.stance = 'stand'; return; }
      }
      // tireur d'élite trop près : reculer vers un couvert plus lointain
      if (u.role.id === 'marksman' && d < u.weapon.minRange && order !== 'hold') {
        const cp = this.findCover(u, target, 25, { minRange: u.weapon.minRange * 1.5, towards: home });
        if (cp && this.setGoal(u, cp.x, cp.z, 'cover')) { u.state = 'fallback'; u.stance = 'stand'; return; }
      }
      // ordre « Tenir » : on combat depuis son poste ; s'il ne couvre pas face à cette cible, on prend le couvert voisin et il devient le poste
      if (order === 'hold') {
        if (!cover) {
          const postCovers = u.post && this.map.coverFrom(u.post.x, u.post.z, threat.x, threat.z, true);
          if (postCovers && Math.hypot(u.post.x - u.x, u.post.z - u.z) > 1.2 && this.setGoal(u, u.post.x, u.post.z, 'cover')) { u.state = 'tocover'; u.stance = 'stand'; return; }
          if (!postCovers) { const cp = this.findCover(u, threat, 9, { minRange: u.weapon.minRange, requireShoot: true }) || this.findCover(u, threat, 9, { minRange: u.weapon.minRange }); if (cp && this.setGoal(u, cp.x, cp.z, 'cover')) { u.post = { x: cp.x, z: cp.z }; u.state = 'tocover'; u.stance = 'stand'; return; } }
        }
        this.stop(u);
        const teamEngaged = this.alliesOf(u).some(a => a.alive && (this.t - a.lastShotAt < 3 || this.t - a.lastShotByAt < 3)) || this.t - u.lastShotAt < 3;
        const ambush = !teamEngaged && d > u.weapon.range * 0.7 && !beingShot; // embuscade : on laisse approcher tant que personne n'est engagé
        if (!effective || ambush) { u.state = 'wait'; u.stance = cover ? 'crouch' : 'stand'; return; }
        u.state = 'engage'; u.stance = (u.reloading > 0 && cover) ? 'crouch' : 'stand'; return;
      }
      // tir inefficace à cette distance (arme courte, cible trop loin) : se rapprocher de couvert en couvert
      if (!effective && !pinned) {
        const cp = this.findCover(u, target, 16, { towards: target });
        let gx, gz;
        if (cp && Math.hypot(cp.x - target.x, cp.z - target.z) < d - 2) { gx = cp.x; gz = cp.z; }
        else { gx = u.x + (target.x - u.x) * 0.5; gz = u.z + (target.z - u.z) * 0.5; }
        if (this.setGoal(u, gx, gz, 'close')) { u.state = 'closing'; u.stance = 'stand'; return; }
      }
      // contournement : la cible est à couvert face à moi et je la touche mal → chercher un angle d'où son couvert ne sert plus
      if (effective && order !== 'hold' && (u.role.id === 'assault' || u.role.id === 'pointman') && !beingShot && u.suppression < 0.3) {
        const tc = this.map.coverFrom(target.x, target.z, u.x, u.z, target.stance === 'stand');
        if (tc && this.hitChance(u, target, d, true).p < 0.16) {
          const cp = this.findCover(u, target, 16, { requireShoot: true, flank: target });
          if (cp && this.setGoal(u, cp.x, cp.z, 'close')) { u.state = 'closing'; u.stance = 'stand'; if (this.t - (u.lastFlankLog || -99) > 15) { u.lastFlankLog = this.t; this.logEvent('flank', `${u.callsign} contourne ${target.callsign}, à couvert.`, { unit: u.id, team: u.team }); } return; }
        }
      }
      if (wantCover) {
        // d'abord un couvert d'où l'on peut encore tirer sur la cible ; sinon n'importe quel couvert proche
        const cp = this.findCover(u, threat, 9, { minRange: u.weapon.minRange, requireShoot: true }) || this.findCover(u, threat, 9, { minRange: u.weapon.minRange });
        if (cp) {
          if (this.setGoal(u, cp.x, cp.z, 'cover')) { u.state = 'tocover'; u.stance = 'stand'; return; }
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
    if (known.length > 0) {
      let nearest = known[0], nd = Infinity;
      for (const k of known) { const dd = Math.hypot(k.k.x - u.x, k.k.z - u.z); if (dd < nd) { nd = dd; nearest = k; } }
      const threatPos = nearest.k;
      // capture : on n'abandonne pas la zone pour courir après une position connue lointaine ; on s'y installe face à la menace
      // … sauf si l'adversaire est lui-même dans la zone : il faut aller l'en déloger
      if (this.zone && u.role.id !== 'marksman' && !(this.zone.contested && this.inZone(threatPos, 1.5)) && (nd > 10 || this.inZone(u))) { this.occupyZone(u, threatPos); return; }
      if (order === 'hold') { this.holdPost(u, threatPos); return; }
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
        const cp = this.findCover(u, threatPos, 16, { towards: threatPos });
        if (cp && Math.hypot(cp.x - threatPos.x, cp.z - threatPos.z) < nd - 1.5 && this.setGoal(u, cp.x, cp.z, 'bound')) { u.state = 'bounding'; u.stance = 'stand'; return; }
        // pas de couvert plus avancé : avancer prudemment en direction de la menace
        if (nd > 8 && this.setGoal(u, threatPos.x, threatPos.z, 'advance')) { u.state = 'advancing'; u.stance = 'stand'; return; }
        this.stop(u); u.state = 'hold'; u.stance = 'stand'; return;
      }
      // assaut : aller au contact de la dernière position connue
      if (nd > 4) { if (this.setGoal(u, threatPos.x, threatPos.z, 'advance')) { u.state = 'advancing'; u.stance = 'stand'; return; } }
      // arrivé sur la position connue et personne : l'information est périmée, on l'oublie
      delete u.knowledge[nearest.unit.id];
      this.stop(u); u.state = 'search'; u.stance = 'stand'; return;
    }

    // 3) aucune information : se déployer / avancer vers l'objectif
    if (this.zone && (u.role.id !== 'marksman' || this.inZone(u))) {
      // capture : tout le monde vers la zone (le tireur d'élite garde son poste de surveillance plus bas)
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
    const lane = this.laneOf(u);
    const dirx = Math.sign(objective.x - home.x) || 1;
    const progress = (u.x - home.x) * dirx;
    const span = Math.abs(objective.x - home.x);
    const stepLen = order === 'careful' ? 12 : 22;
    let gx = home.x + dirx * Math.min(span - 6, progress + stepLen), gz = clamp(home.z + lane, 2, this.map.depth - 2);
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
      if (!u.searchGoal || this.t > u.searchUntil || Math.hypot(u.searchGoal.x - u.x, u.searchGoal.z - u.z) < 1.5) {
        for (let k = 0; k < 10; k++) {
          const a = this.rng.range(0, Math.PI * 2), r = this.rng.range(2, objective.r + 9);
          const sx = objective.x + Math.cos(a) * r, sz = clamp(objective.z + Math.sin(a) * r, 2, this.map.depth - 2);
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
      u.suppression = Math.max(0, u.suppression - DT * rec); if (u.suppression > 0.3) u.stats.timeSuppressed += DT;
    }
    // rechargement
    if (u.reloading > 0) {
      u.reloading -= DT;
      if (u.reloading <= 0) { u.reloading = 0; u.mags--; u.ammo = u.weapon.mag; this.logEvent('reloaded', `${u.callsign} a rechargé.`, { unit: u.id, team: u.team, silent: true }); }
    }
    // déplacement
    const wasMoving = u.moving;
    u.moving = false;
    if (u.path && u.goal) this.move(u);
    if (u.moving) u.stillSince = undefined; else if (wasMoving || u.stillSince === undefined) u.stillSince = this.t;
    // orientation : vers la cible si on en a une, sinon vers la marche
    if (u.target && u.target.alive) u.facing = Math.atan2(u.target.z - u.z, u.target.x - u.x);
    // tir
    if (u.target && u.target.alive && u.visible.has(u.target.id) && u.state !== 'pinned' && u.state !== 'noammo' && u.state !== 'wait') this.fireAt(u, u.target);
    else if (u.target && u.target.alive && u.state !== 'pinned' && u.state !== 'noammo' && this.canSuppress(u, u.target)) this.suppressAt(u, u.target);
    else { u.fireAcc = Math.min(u.fireAcc, 1); if (u.target && !u.target.alive) u.target = null; }
  };

  Battle.prototype.move = function (u) {
    const wp = u.path[u.pathIdx];
    if (!wp) { this.arrive(u); return; }
    const d = Math.hypot(wp.x - u.x, wp.z - u.z);
    const stepLen = u.speed() * DT;
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
    // séparation douce entre alliés : on se décale au lieu de se bloquer mutuellement
    for (const a of this.alliesOf(u)) {
      if (!a.alive) continue;
      const dd = Math.hypot(a.x - nx, a.z - nz);
      if (dd < 0.7 && dd > 1e-6) {
        const push = (0.7 - dd) * 0.6, px = nx + (nx - a.x) / dd * push, pz = nz + (nz - a.z) / dd * push;
        if (!this.map.insideObstacle(px, pz) && this.map.inBounds(px, pz)) { nx = px; nz = pz; }
      }
    }
    u.stats.distance += Math.hypot(nx - u.x, nz - u.z);
    if (!u.target) u.facing = Math.atan2(nz - u.z, nx - u.x);
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
      if (kind === 'bound') u.pauseUntil = this.t + 1.5 + this.rng.range(0, 1.5);
      if (kind === 'hide') u.stance = 'crouch';
      if (kind !== 'hide') this.logEvent('cover', `${u.callsign} se met à couvert.`, { unit: u.id, team: u.team, silent: true });
    }
  };

  // ---- Tactiques ---------------------------------------------------------------------
  // Passives : appliquées à la création. Actives : useTactic(team, id) par le joueur (ou l'IA adverse si team.auto).
  Battle.prototype.hasTactic = function (team, id) { return !!(team.tactics && team.tactics[id]); };
  Battle.prototype.canUseTactic = function (teamIndex, id) {
    const team = this.teams[teamIndex], st = team.tactics[id], def = TACTICS[id];
    if (!st || !def || !def.active) return { ok: false, reason: 'tactique indisponible' };
    if (st.uses <= 0) return { ok: false, reason: 'plus d\'utilisation' };
    if (this.t < st.cooldownUntil) return { ok: false, reason: `recharge (${(st.cooldownUntil - this.t).toFixed(0)} s)` };
    if (this.over) return { ok: false, reason: 'bataille terminée' };
    const alive = team.units.filter(u => u.alive); if (!alive.length) return { ok: false, reason: 'aucun opérateur' };
    if (id === 'fumigene' || id === 'barrage') { if (!this.teamKnownEnemies(team).length) return { ok: false, reason: 'aucune position adverse connue' }; }
    if (id === 'soins' && !alive.some(u => u.hp < u.maxHp - 5)) return { ok: false, reason: 'personne à soigner' };
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
    const c = this.teamCentroid(team);
    if (id === 'fumigene') {
      // le fumigène tombe entre le centre de l'escouade et la position adverse connue la plus proche, à 6 m de l'escouade
      const ks = this.teamKnownEnemies(team); let k = ks[0], kd = Infinity; for (const q of ks) { const d = Math.hypot(q.x - c.x, q.z - c.z); if (d < kd) { kd = d; k = q; } }
      const dx = k.x - c.x, dz = k.z - c.z, L = Math.hypot(dx, dz) || 1, dist = Math.min(6, L * 0.5);
      const sx = c.x + dx / L * dist, sz = c.z + dz / L * dist, R = 4;
      const smoke = { x: sx - R, z: sz - R, w: 2 * R, d: 2 * R, h: 2.5, kind: 'smoke', name: 'fumée', until: this.t + 15, team: teamIndex };
      this.map.dynamic.push(smoke);
      this.logEvent('tactic', `${team.name} déploie un fumigène.`, { team: teamIndex, tactic: id });
      this.emit({ type: 'smoke', x: sx, z: sz, r: R, until: smoke.until, team: teamIndex });
    } else if (id === 'reco') {
      team.recoUntil = this.t + 8;
      this.logEvent('tactic', `${team.name} lance un drone de reconnaissance : positions adverses révélées pendant 8 s.`, { team: teamIndex, tactic: id });
      this.emit({ type: 'reco', team: teamIndex, until: team.recoUntil });
    } else if (id === 'soins') {
      let target = null; for (const u of team.units) if (u.alive && (!target || u.hp / u.maxHp < target.hp / target.maxHp)) target = u;
      target.healing = { remaining: 35, rate: 7, by: id }; // 35 PV en 5 s
      this.logEvent('tactic', `${team.name} : trousse de soins pour ${target.callsign}.`, { team: teamIndex, tactic: id, unit: target.id });
      this.emit({ type: 'heal', unit: target.id });
    } else if (id === 'barrage') {
      const ks = this.teamKnownEnemies(team); let k = ks[0], kd = Infinity; for (const q of ks) { const d = Math.hypot(q.x - c.x, q.z - c.z); if (d < kd) { kd = d; k = q; } }
      this.pendingShells = this.pendingShells || [];
      for (let i = 0; i < 3; i++) this.pendingShells.push({ at: this.t + 4 + i * 0.7, x: k.x + this.rng.gauss() * 3, z: k.z + this.rng.gauss() * 3, team: teamIndex });
      this.logEvent('tactic', `${team.name} demande un appui mortier sur une position adverse : impact dans 4 s.`, { team: teamIndex, tactic: id });
      this.emit({ type: 'barrage_called', x: k.x, z: k.z, team: teamIndex });
    }
    return { ok: true };
  };
  Battle.prototype.updateTactics = function () {
    // fumées : expiration
    if (this.map.dynamic.length) for (let i = this.map.dynamic.length - 1; i >= 0; i--) if (this.t >= this.map.dynamic[i].until) this.map.dynamic.splice(i, 1);
    // obus : impact
    if (this.pendingShells && this.pendingShells.length) for (let i = this.pendingShells.length - 1; i >= 0; i--) {
      const sh = this.pendingShells[i]; if (this.t < sh.at) continue;
      this.pendingShells.splice(i, 1);
      this.emit({ type: 'shell', x: sh.x, z: sh.z });
      for (const u of this.units) {
        if (!u.alive) continue;
        const d = Math.hypot(u.x - sh.x, u.z - sh.z);
        if (d < 8) u.suppression = clamp(u.suppression + 0.5 * (1 - d / 8), 0, 1);
        if (d < 3) {
          const dmg = Math.round(45 * (1 - d / 3) * (1 - u.armor.torso * 0.5) * 10) / 10;
          if (dmg > 0) this.applyDamage(null, u, dmg, 'obus', sh.team);
        }
      }
      this.logEvent('shell', `Obus de mortier en (${sh.x.toFixed(0)}, ${sh.z.toFixed(0)}).`, { team: sh.team, silent: true });
    }
    // soins : régénération progressive
    for (const u of this.units) if (u.alive && u.healing) {
      const h = Math.min(u.healing.remaining, u.healing.rate * DT, u.maxHp - u.hp);
      u.hp += h; u.healing.remaining -= h; u.stats.healed += h;
      u.status = u.hp <= u.maxHp * 0.2 ? 'critical' : (u.hp <= u.maxHp * 0.5 ? 'wounded' : 'ok');
      if (u.healing.remaining <= 0.01 || u.hp >= u.maxHp) { u.healing = null; }
    }
    // IA adverse : emploie ses tactiques actives à des moments raisonnables
    for (const team of this.teams) if (team.auto) this.autoTactics(team);
  };
  Battle.prototype.autoTactics = function (team) {
    if (this.tick % 10 !== 0) return; // une décision par seconde
    const alive = team.units.filter(u => u.alive); if (!alive.length) return;
    const underFire = alive.filter(u => this.t - u.lastShotByAt < 2).length;
    for (const id of team.tacticIds) {
      if (!TACTICS[id].active || !this.canUseTactic(team.index, id).ok) continue;
      if (id === 'fumigene' && underFire >= 2 && this.rng.chance(0.5)) this.useTactic(team.index, id);
      else if (id === 'reco' && this.t > 10 && !this.teamKnownEnemies(team).length && this.rng.chance(0.3)) this.useTactic(team.index, id);
      else if (id === 'soins' && alive.some(u => u.hp < u.maxHp * 0.45) && this.rng.chance(0.6)) this.useTactic(team.index, id);
      else if (id === 'barrage' && this.t > 15 && this.teamKnownEnemies(team).length >= 2 && this.rng.chance(0.4)) this.useTactic(team.index, id);
    }
  };
  // Dégâts hors tir direct (obus) : même comptabilité que les tirs, attribués à l'équipe
  Battle.prototype.applyDamage = function (shooter, e, dmg, cause, teamIndex) {
    e.hp = Math.max(0, e.hp - dmg); e.lastHitAt = this.t; e.stats.damageTaken += dmg;
    const team = this.teams[teamIndex];
    if (e.hp <= 0) {
      e.alive = false; e.status = 'down'; e.downAt = this.t; e.target = null; this.stop(e); e.stance = 'crouch'; e.visible = new Set();
      this.logEvent('down', `${e.callsign} est hors de combat (${cause}).`, { team: teamIndex, enemy: e.id, dmg, loc: cause, unit: null });
      this.emit({ type: 'down', unit: e.id }); team.indirectKills = (team.indirectKills || 0) + 1; team.indirectDamage = (team.indirectDamage || 0) + dmg; return;
    }
    team.indirectDamage = (team.indirectDamage || 0) + dmg;
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
    const need = this.hasTactic(this.teams[u.team], 'retranche') ? 1.5 : 3;                           // Retranchement
    const still = this.t - (u.stillSince === undefined ? this.t : u.stillSince) >= need;
    if (has(u, 'ambusher') && still) return true;                 // Affût : position préparée quel que soit l'ordre
    return this.teams[u.team].order === 'hold' && still && u.post && Math.hypot(u.post.x - u.x, u.post.z - u.z) < 1.6;
  };
  // Un allié « Meneur » en état à moins de 12 m ?
  Battle.prototype.nearLeader = function (u) {
    for (const a of this.alliesOf(u)) if (a.alive && has(a, 'leader') && Math.hypot(a.x - u.x, a.z - u.z) < 12) return true;
    return false;
  };
  // Seuil de chance de toucher en dessous duquel on ne gaspille pas ses munitions (l'appui tire plus volontiers : suppression).
  Battle.prototype.fireThreshold = function (u) { const base = u.role.id === 'support' ? 0.045 : 0.08; return this.hasTactic(this.teams[u.team], 'discipline') ? base * 1.5 : base; }; // Discipline de feu
  Battle.prototype.hitChance = function (u, e, d, asIfStill) {
    const w = u.weapon;
    let p = w.accuracy * (0.45 + 0.55 * u.def.marksmanship / 100);
    const r = d / w.range;
    let f;
    if (r <= 0.5) f = 1; else if (r <= 1) f = 1 - (r - 0.5) * 1.2; else f = Math.max(0.08, 0.4 - (r - 1) * 0.6);
    p *= f;
    if (d < w.minRange) p *= 0.5;
    if (u.moving && !asIfStill) p *= 0.55;
    if (u.stance === 'crouch') p *= 1.1;
    p *= 1 - 0.6 * u.suppression * (1 - u.def.composure / 150);
    const hard = has(u, 'hardened') ? 0.5 : 1;                                       // Endurci
    if (u.status === 'wounded') p *= 1 - 0.15 * hard; else if (u.status === 'critical') p *= 1 - 0.35 * hard;
    if (this.isBraced(u)) p *= 1.1;           // position préparée : arme calée, repères pris
    const tt = this.teams[u.team];
    if (this.hasTactic(tt, 'discipline') && !u.moving) p *= 1.12;                                   // Discipline de feu
    if (this.hasTactic(tt, 'blitz') && this.t < 30) p *= 0.9;                                        // Éclair : précision −10 % au début
    if (has(u, 'patience') && u.burst === 0 && u.aimFull) p *= 1.25;               // Patience : premier tir posé
    if (e.moving) p *= has(u, 'opportunity') ? 0.9 : 0.8;                             // Tir d'opportunité
    if (e.stance === 'crouch') p *= 0.85;
    if (this.isBraced(e)) p *= 0.9;           // un défenseur installé expose moins de silhouette
    const cv = this.map.coverFrom(e.x, e.z, u.x, u.z, e.stance === 'stand');
    if (cv) p *= cv.level === 'partial' ? (this.hasTactic(this.teams[e.team], 'retranche') ? 0.5 : 0.55) : 0.3; // couvert partiel (Retranchement : ×0,5)
    if (w.rpm > 100) p *= 1 - (has(u, 'gunner') ? 0.03 : 0.06) * Math.min(u.burst, 5);   // Tir soutenu : perte en rafale divisée par deux
    return { p: clamp(p, 0.03, 0.95), cover: cv };
  };
  Battle.prototype.fireAt = function (u, e) {
    if (u.reloading > 0) return;
    if (u.ammo <= 0) return;
    if (u.aimTimer > 0) { u.aimTimer -= DT; return; }
    const d = dist2(u, e);
    // sans ligne de vue sur la poitrine, pas de tir (la perception l'a vérifié ce pas-ci, on re-vérifie par sécurité)
    if (!this.canSee(u, e)) return;
    if (this.hitChance(u, e, d).p < this.fireThreshold(u)) { u.fireAcc = Math.min(u.fireAcc, 0.99); return; }
    u.fireAcc += DT * u.weapon.rpm / 60 * (this.hasTactic(this.teams[u.team], 'blitz') && this.t < 30 ? 1.2 : 1); // Éclair : cadence +20 %
    while (u.fireAcc >= 1 && u.ammo > 0) {
      u.fireAcc -= 1;
      this.shoot(u, e, d);
    }
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
    }
    this.emit({ type: 'shot', shooter: u.id, target: e.id, from, to, hit });
  };
  Battle.prototype.applyHit = function (u, e, d) {
    const w = u.weapon;
    const r = d / w.range;
    let fall = r <= 0.3 ? 1 : (r <= 1 ? 1 - (r - 0.3) / 0.7 * (1 - w.falloff) : Math.max(0.3 * w.falloff, w.falloff - (r - 1) * 0.7 * w.falloff));
    const roll = this.rng.next();
    let loc, mult, prot;
    if (roll < 0.08) { loc = 'tête'; mult = 2.2; prot = e.armor.head; }
    else if (roll < 0.60) { loc = 'torse'; mult = 1.0; prot = e.armor.torso; }
    else { loc = 'membre'; mult = 0.55; prot = 0; }
    let dmg = w.damage * fall * mult * (1 - prot) * this.rng.range(0.85, 1.15);
    if (has(u, 'breach') && d < 10 && (w.cls === 'brèche' || w.cls === 'pm')) dmg *= 1.15;   // Enfonceur
    if (this.hasTactic(this.teams[e.team], 'drill') && this.teams[u.team].order === 'hold') dmg *= 0.9; // Exercice de base : −10 % tant que l'adversaire tient
    dmg = Math.round(dmg * 10) / 10;
    const before = e.hp;
    e.hp = Math.max(0, e.hp - dmg);
    e.lastHitAt = this.t; e.suppression = clamp(e.suppression + w.suppress * 1.2, 0, 1);
    u.stats.hits++; u.stats.damageDealt += dmg; e.stats.damageTaken += dmg; if (loc === 'tête') u.stats.headshots++;
    const absorbed = Math.round(w.damage * fall * mult * prot * 10) / 10;
    let text = `${u.callsign} touche ${e.callsign} (${loc}, ${d.toFixed(0)} m) : −${dmg} PV`;
    if (absorbed > 0) text += ` (${absorbed} absorbés : ${e.armor.name})`;
    const prevStatus = e.status;
    if (e.hp <= 0) {
      e.alive = false; e.status = 'down'; e.downAt = this.t; e.target = null; this.stop(e); e.stance = 'crouch'; e.visible = new Set();
      u.stats.kills++;
      // « spéciaux » : série (deux neutralisations à moins de 10 s), revanche (celui qui a mis un allié hors de combat), vétéran (niveau supérieur)
      if (this.t - u.lastKillAt < 10) u.stats.streaks++;
      u.lastKillAt = this.t;
      if (this.alliesOf(u).some(a => !a.alive && a.downedBy === e)) u.stats.revenge++;
      if ((e.def.level || 0) > (u.def.level || 0)) u.stats.veteran++;
      e.downedBy = u;
      text += ` — ${e.callsign} est hors de combat.`;
      this.logEvent('down', text, { unit: u.id, enemy: e.id, team: u.team, dmg, loc });
      this.emit({ type: 'down', unit: e.id });
      return;
    }
    e.status = e.hp <= e.maxHp * 0.2 ? 'critical' : (e.hp <= e.maxHp * 0.5 ? 'wounded' : 'ok');
    if (e.status !== prevStatus) text += e.status === 'critical' ? ` — ${e.callsign} est gravement blessé.` : ` — ${e.callsign} est blessé.`;
    this.logEvent('hit', text, { unit: u.id, enemy: e.id, team: u.team, dmg, loc, hpBefore: before, hpAfter: e.hp });
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
        specials: { headshots: t.units.reduce((s, u) => s + u.stats.headshots, 0), streaks: t.units.reduce((s, u) => s + u.stats.streaks, 0), revenge: t.units.reduce((s, u) => s + u.stats.revenge, 0), veteran: t.units.reduce((s, u) => s + u.stats.veteran, 0) },
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
      units: this.units.map(u => ({ id: u.id, team: u.team, callsign: u.callsign, role: u.role.id, x: u.x, z: u.z, facing: u.facing, stance: u.stance, hp: u.hp, maxHp: u.maxHp, status: u.status, alive: u.alive, ammo: u.ammo, mags: u.mags, reloading: u.reloading, state: u.state, suppression: u.suppression, moving: u.moving, target: u.target ? u.target.id : null, visible: u.visible.size, weapon: u.weapon.id })),
    };
  };

  root.Battle = Battle; root.Unit = Unit; root.DT = DT; root.fmtT = fmtT;
})(typeof module !== 'undefined' ? module.exports : (window.OT = window.OT || {}),
   typeof module !== 'undefined' ? Object.assign({}, require('./rng.js'), require('./data.js'), require('./map.js')) : (window.OT = window.OT || {}));
