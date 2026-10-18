// Carte : obstacles en 3D (boîtes avec hauteur), grille de déplacement, A*, lignes de vue (lancer de rayon 3D),
// points de couverture. Tout est géométrique : un mur bloque les tirs parce que le rayon le traverse, pas par un drapeau.
(function (root) {
  const CELL = 1.0;          // taille d'une case de la grille (m)
  const RADIUS = 0.42;       // demi-largeur d'un opérateur (m) — gonfle les obstacles pour la marche

  // Un obstacle : boîte alignée sur les axes. x,z = coin min ; w,d = dimensions ; h = hauteur ; kind = 'wall' | 'cover'
  function box(x, z, w, d, h, kind, name) { return { x, z, w, d, h, kind, name: name || kind }; }

  // Carte symétrique : on décrit la moitié ouest, les obstacles entièrement à l'ouest (x+w < 32) sont reflétés à l'est.
  // Pour que la grille soit elle aussi symétrique, les bords x des obstacles tombent sur des multiples de 0,5 m.
  function mirrored(width, list) {
    const out = list.slice();
    for (const o of list) if (o.x + o.w < width / 2 - 0.01) out.push(box(width - o.x - o.w, o.z, o.w, o.d, o.h, o.kind, o.name));
    return out;
  }

  // une seule carte pour l'instant : le parking du centre commercial (on retravaille le contenu un élément après l'autre)
  const MAPS = {
    parking: {
      id: 'parking', name: 'Parking du centre commercial', width: 72, depth: 46,
      spawns: [ { x: 5.5, z: 23, r: 3.5 }, { x: 66.5, z: 23, r: 3.5 } ],
      capture: { x: 36, z: 23, r: 6 },  // l'enclos central, partagé en deux par l'abri : on le prend par ses deux bouts (nord, sud)
      asymetrique: true,
      voies: { nord: 9, milieu: 23, sud: 37 },   // z des trois voies d'approche (flancs nord et sud, axe central) : routes de l'IA
      // Tracé en trois voies (nord le long du centre commercial, milieu, sud le long du bus), mais chaque camp a son propre
      // terrain : à l'ouest un conteneur couché au nord et un fourgon au sud ; à l'est un conteneur debout (nord-sud) qui
      // ouvre un angle différent, un conteneur au sud. Le centre (abri, enclos, zone) reste sur l'axe pour l'équité ;
      // l'équilibre est vérifié en jouant des centaines de batailles (tests : chaque camp gagne entre 35 et 65 %).
      obstacles: [
        box(-1, -1, 74, 1, 3.2, 'wall', 'mur nord'), box(-1, 46, 74, 1, 3.2, 'wall', 'mur sud'),
        box(-1, 0, 1, 46, 3.2, 'wall', 'mur ouest'), box(72, 0, 1, 46, 3.2, 'wall', 'mur est'),
        // centre (sur l'axe) : façade du centre commercial, bus, abri des caisses, enclos
        box(26, 0, 20, 5, 6.0, 'wall', 'centre commercial'), box(30, 41, 12, 3, 3.0, 'wall', 'bus'),
        box(35, 16.5, 2, 13, 2.8, 'wall', 'abri'),
        box(29.5, 17.5, 0.6, 3.5, 0.95, 'cover', 'barrière'), box(29.5, 25, 0.6, 3.5, 0.95, 'cover', 'barrière'),
        box(31, 17, 3, 0.6, 0.95, 'cover', 'barrière'), box(31, 28.4, 3, 0.6, 0.95, 'cover', 'barrière'),
        box(41.9, 17.5, 0.6, 3.5, 0.95, 'cover', 'barrière'), box(41.9, 25, 0.6, 3.5, 0.95, 'cover', 'barrière'),
        box(38, 17, 3, 0.6, 0.95, 'cover', 'barrière'), box(38, 28.4, 3, 0.6, 0.95, 'cover', 'barrière'),
        box(31.5, 20.8, 2, 4.4, 1.4, 'cover', 'voiture'), box(38.5, 20.8, 2, 4.4, 1.4, 'cover', 'voiture'),
        box(33, 12.5, 1.5, 1.5, 2.2, 'wall', 'caisses'), box(33, 32, 1.5, 1.5, 2.2, 'wall', 'caisses'),
        box(37.5, 12.5, 1.5, 1.5, 2.2, 'wall', 'caisses'), box(37.5, 32, 1.5, 1.5, 2.2, 'wall', 'caisses'),
        box(30, 9, 2, 2, 3.0, 'wall', 'kiosque'), box(40, 9, 2, 2, 3.0, 'wall', 'kiosque'),
        box(26.5, 7, 3, 1.2, 1.0, 'cover', 'muret'), box(42.5, 7, 3, 1.2, 1.0, 'cover', 'muret'),
        box(26.5, 38, 3, 1.2, 1.0, 'cover', 'muret'), box(42.5, 38, 3, 1.2, 1.0, 'cover', 'muret'),
        // ---- OUEST
        box(11, 13, 2.5, 5.5, 2.4, 'wall', 'fourgon'), box(11, 27.5, 2.5, 5.5, 2.4, 'wall', 'fourgon'),
        box(16.5, 14.5, 6, 2.4, 2.6, 'wall', 'conteneur'),                     // voie nord / milieu : conteneur couché
        box(17, 29.6, 5.5, 2.5, 2.4, 'wall', 'fourgon'), box(23, 30, 1.6, 1.6, 1.4, 'cover', 'palettes'),   // voie sud : fourgon et palettes
        box(24, 21.8, 2, 2.4, 2.2, 'wall', 'caisses'), box(25, 17.5, 1, 2, 1.0, 'cover', 'sacs de sable'),
        box(30, 35, 2, 2, 2.2, 'wall', 'caisses'),
        box(6.5, 8.5, 2, 2, 2.2, 'wall', 'caisses'), box(6.5, 35.5, 2, 2, 2.2, 'wall', 'caisses'),
        box(15, 21.5, 1.5, 3, 1.0, 'cover', 'bac à fleurs'), box(15.5, 22.5, 0.5, 0.5, 5.0, 'wall', 'palmier'),
        box(24, 3, 1.5, 1.5, 1.0, 'cover', 'bac à fleurs'), box(24.5, 3.5, 0.5, 0.5, 5.0, 'wall', 'palmier'),
        box(24, 41.5, 1.5, 1.5, 1.0, 'cover', 'bac à fleurs'), box(24.5, 42, 0.5, 0.5, 5.0, 'wall', 'palmier'),
        box(17.5, 4, 2, 4.4, 1.4, 'cover', 'voiture'), box(17.5, 37.6, 2, 4.4, 1.4, 'cover', 'voiture'),
        box(21.5, 8.5, 2, 4.4, 1.4, 'cover', 'voiture'), box(21.5, 33.5, 2, 4.4, 1.4, 'cover', 'voiture'),
        box(26, 13, 4.4, 2, 1.4, 'cover', 'voiture'), box(26, 31, 4.4, 2, 1.4, 'cover', 'voiture'),
        box(19.5, 20.5, 0.6, 4.5, 0.95, 'cover', 'barrière'), box(20.5, 27, 2.5, 0.6, 0.95, 'cover', 'barrière'),
        box(8, 6, 1.5, 1.4, 1.1, 'cover', 'fût'), box(8, 38.6, 1.5, 1.4, 1.1, 'cover', 'fût'),
        box(16, 11, 1.0, 2.4, 1.0, 'cover', 'sacs de sable'), box(15.5, 33.5, 1.0, 2.4, 1.0, 'cover', 'sacs de sable'),
        // ---- EST
        box(58.5, 13, 2.5, 5.5, 2.4, 'wall', 'fourgon'), box(59, 28.5, 2.5, 5.5, 2.4, 'wall', 'fourgon'),
        box(51, 11.5, 2.4, 6, 2.6, 'wall', 'conteneur'),                       // voie nord : conteneur debout (nord-sud)
        box(49.5, 29.1, 6, 2.4, 2.6, 'wall', 'conteneur'),                     // voie sud : conteneur couché
        box(45.5, 23.2, 2, 2.4, 2.2, 'wall', 'caisses'), box(46, 19, 1, 2, 1.0, 'cover', 'sacs de sable'),
        box(40.5, 36, 2, 2, 2.2, 'wall', 'caisses'),
        box(63.5, 8.5, 2, 2, 2.2, 'wall', 'caisses'), box(63, 36, 2, 2, 2.2, 'wall', 'caisses'),
        box(55.5, 21.5, 1.5, 3, 1.0, 'cover', 'bac à fleurs'), box(56, 22.5, 0.5, 0.5, 5.0, 'wall', 'palmier'),
        box(46.5, 3, 1.5, 1.5, 1.0, 'cover', 'bac à fleurs'), box(47, 3.5, 0.5, 0.5, 5.0, 'wall', 'palmier'),
        box(48, 41.5, 1.5, 1.5, 1.0, 'cover', 'bac à fleurs'), box(48.5, 42, 0.5, 0.5, 5.0, 'wall', 'palmier'),
        box(53, 4.5, 2, 4.4, 1.4, 'cover', 'voiture'), box(52.5, 37.6, 2, 4.4, 1.4, 'cover', 'voiture'),
        box(47.5, 8, 2, 4.4, 1.4, 'cover', 'voiture'), box(47.5, 34, 2, 4.4, 1.4, 'cover', 'voiture'),
        box(41.6, 13, 4.4, 2, 1.4, 'cover', 'voiture'), box(41.6, 31, 4.4, 2, 1.4, 'cover', 'voiture'),
        box(52, 20, 0.6, 4.5, 0.95, 'cover', 'barrière'), box(48.5, 26.5, 2.5, 0.6, 0.95, 'cover', 'barrière'),
        box(62.5, 6, 1.5, 1.4, 1.1, 'cover', 'fût'), box(62.5, 38.6, 1.5, 1.4, 1.1, 'cover', 'fût'),
        box(55, 11, 1.0, 2.4, 1.0, 'cover', 'sacs de sable'), box(55.5, 32.5, 1.0, 2.4, 1.0, 'cover', 'sacs de sable'),
      ],
    },
  };

  // ---- Lancer de rayon segment / boîte (méthode des « slabs ») -------------------------
  // Retourne true si le segment [a,b] (3D : x, y=hauteur, z) traverse la boîte.
  function segmentHitsBox(ax, ay, az, bx, by, bz, o) {
    let tmin = 0, tmax = 1;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    // axe X
    const bounds = [[o.x, o.x + o.w, ax, dx], [0, o.h, ay, dy], [o.z, o.z + o.d, az, dz]];
    for (const [lo, hi, s, d] of bounds) {
      if (Math.abs(d) < 1e-9) { if (s < lo || s > hi) return false; }
      else {
        let t1 = (lo - s) / d, t2 = (hi - s) / d;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return false;
      }
    }
    return true;
  }

  function pointInBox(x, z, o, margin) {
    margin = margin || 0;
    return x >= o.x - margin && x <= o.x + o.w + margin && z >= o.z - margin && z <= o.z + o.d + margin;
  }

  // ---- La carte instanciée ---------------------------------------------------------------
  function GameMap(def) {
    this.def = def; this.id = def.id; this.name = def.name;
    this.width = def.width; this.depth = def.depth; this.obstacles = def.obstacles; this.spawns = def.spawns; this.capture = def.capture || null;
    this.cols = Math.ceil(def.width / CELL); this.rows = Math.ceil(def.depth / CELL);
    this.blocked = new Uint8Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const x = (c + 0.5) * CELL, z = (r + 0.5) * CELL;
      for (const o of this.obstacles) if (pointInBox(x, z, o, RADIUS)) { this.blocked[r * this.cols + c] = 1; break; }
    }
    this.coverPoints = this.computeCoverPoints();
    this.dynamic = [];
  }

  // Décor destructible : caisses et palettes en bois (couverts bas) cèdent aux explosions.
  GameMap.prototype.isDestructible = function (o) { return o.kind === 'cover' && /^(caisses|palettes)/.test(o.name || ''); };
  // Retire un obstacle de CETTE carte (la définition partagée n'est pas touchée) : cases libérées, points de couverture recalculés.
  GameMap.prototype.removeObstacle = function (o) {
    if (this.obstacles === this.def.obstacles) this.obstacles = this.obstacles.slice();
    const i = this.obstacles.indexOf(o); if (i < 0) return false; this.obstacles.splice(i, 1);
    const c0 = Math.max(0, Math.floor((o.x - RADIUS) / CELL)), c1 = Math.min(this.cols - 1, Math.floor((o.x + o.w + RADIUS) / CELL));
    const r0 = Math.max(0, Math.floor((o.z - RADIUS) / CELL)), r1 = Math.min(this.rows - 1, Math.floor((o.z + o.d + RADIUS) / CELL));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const x = (c + 0.5) * CELL, z = (r + 0.5) * CELL; let b = 0;
      for (const q of this.obstacles) if (pointInBox(x, z, q, RADIUS)) { b = 1; break; }
      this.blocked[r * this.cols + c] = b;
    }
    this.coverPoints = this.computeCoverPoints(); return true;
  };
  GameMap.prototype.cellOf = function (x, z) {
    return { c: Math.min(this.cols - 1, Math.max(0, Math.floor(x / CELL))), r: Math.min(this.rows - 1, Math.max(0, Math.floor(z / CELL))) };
  };
  GameMap.prototype.centerOf = function (c, r) { return { x: (c + 0.5) * CELL, z: (r + 0.5) * CELL }; };
  GameMap.prototype.isBlocked = function (c, r) {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return true;
    return this.blocked[r * this.cols + c] === 1;
  };
  // Un point du monde est-il à l'intérieur d'un obstacle (avec le rayon de l'opérateur) ?
  GameMap.prototype.insideObstacle = function (x, z) {
    for (const o of this.obstacles) if (pointInBox(x, z, o, RADIUS * 0.9)) return o;
    return null;
  };
  GameMap.prototype.inBounds = function (x, z) { return x > RADIUS && z > RADIUS && x < this.width - RADIUS && z < this.depth - RADIUS; };

  // Ligne de vue entre deux points 3D : null si libre, sinon l'obstacle qui bloque.
  // this.dynamic : obstacles temporaires (fumigènes) — bloquent la vue, pas la marche (kind 'smoke').
  GameMap.prototype.blocker = function (ax, ay, az, bx, by, bz) {
    for (const o of this.obstacles) if (segmentHitsBox(ax, ay, az, bx, by, bz, o)) return o;
    if (this.dynamic) for (const o of this.dynamic) if (segmentHitsBox(ax, ay, az, bx, by, bz, o)) return o;
    return null;
  };
  GameMap.prototype.hasLOS = function (ax, ay, az, bx, by, bz) { return this.blocker(ax, ay, az, bx, by, bz) === null; };

  // La case la plus proche qui soit libre (pour se sortir d'un coin bloqué ou viser une case valide).
  GameMap.prototype.nearestFree = function (x, z) {
    const { c, r } = this.cellOf(x, z);
    if (!this.isBlocked(c, r)) return { c, r };
    // anneau par anneau, la case libre la plus PROCHE du point (et non la première trouvée en balayant d'ouest en est :
    // ce balayage favorisait un côté, donc un camp, sur une carte symétrique)
    for (let ring = 1; ring < 8; ring++) {
      let best = null, bd = Infinity;
      for (let dc = -ring; dc <= ring; dc++) for (let dr = -ring; dr <= ring; dr++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring || this.isBlocked(c + dc, r + dr)) continue;
        const p = this.centerOf(c + dc, r + dr), d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
        if (d < bd - 1e-9) { bd = d; best = { c: c + dc, r: r + dr }; }
      }
      if (best) return best;
    }
    return null;
  };

  // La case libre la plus proche que l'on peut atteindre en ligne droite depuis (x, z) (sinon la plus proche tout court).
  GameMap.prototype.nearestFreeReachable = function (x, z) {
    const { c, r } = this.cellOf(x, z);
    const cands = [];
    for (let dc = -2; dc <= 2; dc++) for (let dr = -2; dr <= 2; dr++) {
      if (this.isBlocked(c + dc, r + dr)) continue;
      const p = this.centerOf(c + dc, r + dr);
      cands.push({ c: c + dc, r: r + dr, d: Math.hypot(p.x - x, p.z - z), p });
    }
    cands.sort((a, b) => a.d - b.d);
    for (const k of cands) if (this.walkableSegment(x, z, k.p.x, k.p.z)) return { c: k.c, r: k.r };
    return this.nearestFree(x, z);
  };

  // ---- A* sur la grille (8 voisins, pas de coupe de coin) -------------------------------
  GameMap.prototype.findPath = function (x0, z0, x1, z1) {
    const start = this.nearestFreeReachable(x0, z0), goal = this.nearestFree(x1, z1);
    if (!start || !goal) return null;
    const cols = this.cols, rows = this.rows, n = cols * rows;
    const key = (c, r) => r * cols + c;
    const g = new Float32Array(n).fill(Infinity), came = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
    const h = (c, r) => { const dc = Math.abs(c - goal.c), dr = Math.abs(r - goal.r); return Math.max(dc, dr) + 0.4142 * Math.min(dc, dr); };
    const sk = key(start.c, start.r), gk = key(goal.c, goal.r);
    g[sk] = 0;
    // tas binaire simple
    const heap = [[h(start.c, start.r), sk]];
    const push = (it) => { heap.push(it); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    let iter = 0;
    while (heap.length) {
      const [, k] = pop();
      if (closed[k]) continue;
      closed[k] = 1;
      if (k === gk) break;
      if (++iter > 20000) return null;
      const c = k % cols, r = (k / cols) | 0;
      for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
        if (!dc && !dr) continue;
        const nc = c + dc, nr = r + dr;
        if (this.isBlocked(nc, nr)) continue;
        if (dc && dr && (this.isBlocked(c + dc, r) || this.isBlocked(c, r + dr))) continue; // pas de coupe de coin
        const nk = key(nc, nr);
        if (closed[nk]) continue;
        const cost = g[k] + ((dc && dr) ? 1.4142 : 1);
        if (cost < g[nk]) { g[nk] = cost; came[nk] = k; push([cost + h(nc, nr), nk]); }
      }
    }
    if (came[gk] === -1 && gk !== sk) return null;
    const path = [];
    for (let k = gk; k !== -1; k = came[k]) { path.push(this.centerOf(k % cols, (k / cols) | 0)); if (k === sk) break; }
    path.reverse();
    // lissage : retirer les points intermédiaires quand la ligne droite est libre (au niveau du sol, avec le rayon)
    return this.smoothPath(path);
  };

  GameMap.prototype.walkableSegment = function (ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), steps = Math.max(1, Math.ceil(d / 0.3));
    for (let i = 0; i <= steps; i++) { const t = i / steps; if (this.insideObstacle(ax + (bx - ax) * t, az + (bz - az) * t)) return false; }
    return true;
  };
  GameMap.prototype.smoothPath = function (path) {
    if (path.length < 3) return path;
    const out = [path[0]]; let i = 0;
    while (i < path.length - 1) {
      let j = path.length - 1;
      while (j > i + 1 && !this.walkableSegment(path[i].x, path[i].z, path[j].x, path[j].z)) j--;
      out.push(path[j]); i = j;
    }
    return out;
  };

  // ---- Points de couverture -----------------------------------------------------------
  // Pour chaque obstacle, les cases libres qui le touchent. Un point de couverture est utile contre une
  // menace T si l'obstacle est entre T et le point (vérifié par rayon au moment de la décision : coverFrom).
  GameMap.prototype.computeCoverPoints = function () {
    const pts = [];
    for (const o of this.obstacles) {
      if (o.name && o.name.startsWith('mur ')) continue; // les murs d'enceinte ne sont pas des couverts
      const c0 = Math.floor((o.x - 1.2) / CELL), c1 = Math.floor((o.x + o.w + 1.2) / CELL);
      const r0 = Math.floor((o.z - 1.2) / CELL), r1 = Math.floor((o.z + o.d + 1.2) / CELL);
      for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) {
        if (this.isBlocked(c, r)) continue;
        const p = this.centerOf(c, r);
        // distance du point au bord de la boîte
        const ddx = Math.max(o.x - p.x, 0, p.x - (o.x + o.w)), ddz = Math.max(o.z - p.z, 0, p.z - (o.z + o.d));
        const dist = Math.hypot(ddx, ddz);
        if (dist > 1.3 || dist < 0.3) continue;
        pts.push({ x: p.x, z: p.z, obstacle: o });
      }
    }
    return pts;
  };

  // Le point p est-il couvert face à une menace en T ? Retourne 'full' (caché même debout), 'partial' (bas du corps),
  // ou null. heights : hauteur des yeux de la menace / points visés sur p.
  GameMap.prototype.coverFrom = function (px, pz, tx, tz, standing) {
    const eye = 1.6; // yeux de la menace (debout)
    const low = this.blocker(tx, eye, tz, px, 0.5, pz);     // bas du corps (hanches)
    if (!low) return null;
    const chestH = standing ? 1.25 : 0.75;
    const chest = this.blocker(tx, eye, tz, px, chestH, pz);
    if (chest) return { level: 'full', obstacle: chest };
    return { level: 'partial', obstacle: low };
  };

  // « Ouverture » d'un point : combien de points d'échantillon (grille) sont visibles depuis là, à hauteur d'homme,
  // en ne comptant que ceux situés du côté dir (dir = +1 : vers l'est, -1 : vers l'ouest) à plus de minDist.
  GameMap.prototype.openness = function (x, z, dir, minDist) {
    let n = 0;
    // grille d'échantillons symétrique par rapport au centre de la carte (pas d'avantage à un camp)
    for (let sx = this.width / 2 - 27; sx < this.width; sx += 6) for (let sz = this.depth / 2 - 15; sz < this.depth; sz += 6) {
      if ((sx - x) * dir < minDist) continue;
      if (this.hasLOS(x, 1.6, z, sx, 1.25, sz)) n++;
    }
    return n;
  };

  root.MAPS = MAPS; root.GameMap = GameMap; root.CELL = CELL; root.RADIUS = RADIUS; root.segmentHitsBox = segmentHitsBox;
})(typeof module !== 'undefined' ? module.exports : (window.OT = window.OT || {}));
