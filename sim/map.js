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

  const MAPS = {
    entrepot: {
      id: 'entrepot', name: 'Entrepôt des docks', width: 64, depth: 40,
      // zones de départ (centre + rayon) ; l'équipe A à l'ouest, B à l'est
      spawns: [ { x: 5.5, z: 20, r: 3.5 }, { x: 58.5, z: 20, r: 3.5 } ],
      capture: { x: 32, z: 9, r: 6 },   // zone à capturer : allée nord, devant les caisses (le centre est un bâtiment)
      obstacles: mirrored(64, [
        // murs périphériques
        box(-1, -1, 66, 1, 3.2, 'wall', 'mur nord'), box(-1, 40, 66, 1, 3.2, 'wall', 'mur sud'),
        box(-1, 0, 1, 40, 3.2, 'wall', 'mur ouest'), box(64, 0, 1, 40, 3.2, 'wall', 'mur est'),
        // conteneurs devant la zone de départ : écran, avec un passage central et deux couloirs latéraux
        box(11, 7, 2.5, 9, 2.6, 'wall', 'conteneur'), box(11, 24, 2.5, 9, 2.6, 'wall', 'conteneur'),
        // bâtiment central plein — coupe la carte en deux couloirs nord et sud, aucune vue directe entre les zones de départ
        box(27, 15, 10, 10, 3.0, 'wall', 'bâtiment'),
        // piliers au milieu des couloirs nord et sud : cassent les lignes de vue
        box(31, 5, 2, 2.2, 3.0, 'wall', 'pilier'), box(31, 32.8, 2, 2.2, 3.0, 'wall', 'pilier'),
        // couverts bas (caisses, barrières, sacs de sable) : cachent accroupi, protègent le bas du corps debout
        box(15, 19.3, 3, 1.4, 1.1, 'cover', 'palettes'),
        box(17, 4, 2, 2, 1.1, 'cover', 'caisses'), box(19, 29, 2, 2, 1.1, 'cover', 'caisses'),
        box(20, 11, 4, 1.2, 1.0, 'cover', 'muret'), box(16, 34, 3, 1.2, 1.1, 'cover', 'barrière'),
        box(21, 7, 3, 1.2, 1.1, 'cover', 'barrière'), box(24, 29.5, 2, 2, 1.1, 'cover', 'caisses'),
        box(22, 13.2, 1, 2.4, 0.95, 'cover', 'sacs de sable'), box(22, 24.4, 1, 2.4, 0.95, 'cover', 'sacs de sable'),
        box(7, 6, 1.5, 1.4, 1.1, 'cover', 'fût'), box(7, 32.6, 1.5, 1.4, 1.1, 'cover', 'fût'),
        box(26, 9.2, 2.5, 1.2, 1.0, 'cover', 'muret'), box(26, 29.6, 2.5, 1.2, 1.0, 'cover', 'muret'),
        box(31, 11.5, 2, 1.2, 1.1, 'cover', 'caisses'), box(31, 27.3, 2, 1.2, 1.1, 'cover', 'caisses'),
      ]),
    },
    place: {
      id: 'place', name: 'Place du marché', width: 70, depth: 44,
      spawns: [ { x: 5.5, z: 22, r: 3.5 }, { x: 64.5, z: 22, r: 3.5 } ],
      capture: { x: 35, z: 22, r: 7 },  // la place elle-même
      obstacles: mirrored(70, [
        box(-1, -1, 72, 1, 3.2, 'wall', 'mur nord'), box(-1, 44, 72, 1, 3.2, 'wall', 'mur sud'),
        box(-1, 0, 1, 44, 3.2, 'wall', 'mur ouest'), box(70, 0, 1, 44, 3.2, 'wall', 'mur est'),
        // immeubles : deux par côté, puis un bloc central qui ferme la vue entre les zones de départ
        box(10, 2, 8, 10, 4.5, 'wall', 'immeuble'), box(10, 32, 8, 10, 4.5, 'wall', 'immeuble'),
        box(22, 16, 6, 12, 4.0, 'wall', 'immeuble'),
        box(30, 11.5, 2, 2, 3.0, 'wall', 'kiosque'), box(30, 30.5, 2, 2, 3.0, 'wall', 'kiosque'),
        // rues et place : voitures, murets, bancs, fontaine
        box(26.5, 6, 2, 4.4, 1.4, 'cover', 'voiture'), box(26.5, 33.6, 2, 4.4, 1.4, 'cover', 'voiture'),
        box(19, 13, 4, 0.8, 1.0, 'cover', 'muret'), box(19, 30.2, 4, 0.8, 1.0, 'cover', 'muret'),
        box(14, 20, 0.8, 4, 1.0, 'cover', 'muret'), box(7, 8, 1.5, 1.5, 1.1, 'cover', 'bac à fleurs'), box(7, 34.5, 1.5, 1.5, 1.1, 'cover', 'bac à fleurs'),
        box(30, 18, 2.5, 0.8, 0.8, 'cover', 'banc'), box(30, 25.2, 2.5, 0.8, 0.8, 'cover', 'banc'),
        box(33, 20.5, 4, 3, 1.1, 'cover', 'fontaine'),
        box(21, 4, 2, 2, 1.1, 'cover', 'étal'), box(21, 38, 2, 2, 1.1, 'cover', 'étal'),
        box(31.5, 2.5, 3, 1.2, 1.1, 'cover', 'étal'), box(31.5, 40.3, 3, 1.2, 1.1, 'cover', 'étal'),
      ]),
    },
    raffinerie: {
      id: 'raffinerie', name: 'Raffinerie', width: 72, depth: 46,
      spawns: [ { x: 5.5, z: 23, r: 3.5 }, { x: 66.5, z: 23, r: 3.5 } ],
      capture: { x: 36, z: 10, r: 6 },  // aire de pompage nord (le centre est fermé par les cuves)
      obstacles: mirrored(72, [
        box(-1, -1, 74, 1, 3.2, 'wall', 'mur nord'), box(-1, 46, 74, 1, 3.2, 'wall', 'mur sud'),
        box(-1, 0, 1, 46, 3.2, 'wall', 'mur ouest'), box(72, 0, 1, 46, 3.2, 'wall', 'mur est'),
        // écrans devant les zones de départ
        box(9, 15, 2, 5, 2.6, 'wall', 'conteneur'), box(9, 26, 2, 5, 2.6, 'wall', 'conteneur'),
        // cuves (hautes, rondes au rendu) et station de pompage au centre
        box(14, 5, 6, 6, 5.0, 'wall', 'cuve'), box(14, 35, 6, 6, 5.0, 'wall', 'cuve'),
        box(27, 17, 8, 12, 5.0, 'wall', 'cuve'),
        box(34, 21, 4, 4, 3.0, 'wall', 'pompe'),
        // passerelles : piliers
        box(22, 3, 1.5, 1.5, 3.0, 'wall', 'pilier'), box(22, 41.5, 1.5, 1.5, 3.0, 'wall', 'pilier'),
        // tuyauteries basses, fûts, armoires électriques (couverts)
        box(8, 20.5, 1, 5, 1.2, 'cover', 'tuyauterie'), box(22, 10, 8, 1, 1.2, 'cover', 'tuyauterie'), box(22, 35, 8, 1, 1.2, 'cover', 'tuyauterie'),
        box(20, 22.5, 1.5, 1.5, 1.1, 'cover', 'fût'), box(10, 11, 1.5, 1.5, 1.1, 'cover', 'fût'), box(10, 33.5, 1.5, 1.5, 1.1, 'cover', 'fût'),
        box(30, 8, 2, 1.5, 1.1, 'cover', 'armoire'), box(30, 36.5, 2, 1.5, 1.1, 'cover', 'armoire'),
        // silos au milieu des couloirs nord et sud : cassent les longues lignes de vue (sinon le défenseur domine)
        box(29, 2, 3, 3, 4.0, 'wall', 'cuve'), box(29, 41, 3, 3, 4.0, 'wall', 'cuve'),
        box(18, 20, 2, 6, 2.6, 'wall', 'conteneur'),
        box(16, 15.5, 3, 1, 1.0, 'cover', 'muret'), box(16, 29.5, 3, 1, 1.0, 'cover', 'muret'),
        box(26, 3, 3, 1.2, 1.1, 'cover', 'caisses'), box(26, 41.8, 3, 1.2, 1.1, 'cover', 'caisses'),
      ]),
    },
    parking: {
      id: 'parking', name: 'Parking du centre commercial', width: 72, depth: 46,
      spawns: [ { x: 5.5, z: 23, r: 3.5 }, { x: 66.5, z: 23, r: 3.5 } ],
      capture: { x: 36, z: 26, r: 6 },  // l'enclos central : barrières en béton et deux voitures (comme « Harrabah Mall »)
      obstacles: mirrored(72, [
        box(-1, -1, 74, 1, 3.2, 'wall', 'mur nord'), box(-1, 46, 74, 1, 3.2, 'wall', 'mur sud'),
        box(-1, 0, 1, 46, 3.2, 'wall', 'mur ouest'), box(72, 0, 1, 46, 3.2, 'wall', 'mur est'),
        // façade du centre commercial au nord, bus garé au sud (pièces centrées : symétriques par elles-mêmes)
        box(26, 0, 20, 5, 6.0, 'wall', 'centre commercial'), box(30, 41, 12, 3, 3.0, 'wall', 'bus'),
        // fourgons garés devant les zones de départ : écrans
        box(11, 13, 2.5, 5.5, 2.4, 'wall', 'fourgon'), box(11, 27.5, 2.5, 5.5, 2.4, 'wall', 'fourgon'),
        // guérite de parking et palmiers dans leurs bacs
        box(30, 9, 2, 2, 3.0, 'wall', 'kiosque'),
        box(15, 21.5, 1.5, 3, 1.0, 'cover', 'bac à fleurs'), box(15.5, 22.5, 0.5, 0.5, 5.0, 'wall', 'palmier'),
        box(24, 3, 1.5, 1.5, 1.0, 'cover', 'bac à fleurs'), box(24.5, 3.5, 0.5, 0.5, 5.0, 'wall', 'palmier'),
        // rangées de voitures garées (couvert : cache un homme accroupi)
        box(17.5, 4, 2, 4.4, 1.4, 'cover', 'voiture'), box(17.5, 37.6, 2, 4.4, 1.4, 'cover', 'voiture'),
        box(21.5, 8.5, 2, 4.4, 1.4, 'cover', 'voiture'), box(21.5, 33.1, 2, 4.4, 1.4, 'cover', 'voiture'),
        box(21.5, 15.5, 2, 4.4, 1.4, 'cover', 'voiture'), box(21.5, 26.1, 2, 4.4, 1.4, 'cover', 'voiture'),
        box(26, 13, 4.4, 2, 1.4, 'cover', 'voiture'), box(26, 31, 4.4, 2, 1.4, 'cover', 'voiture'),
        // enclos central : barrières en béton avec des passages
        box(29.5, 19, 0.6, 3.5, 0.95, 'cover', 'barrière'), box(29.5, 29.5, 0.6, 3.5, 0.95, 'cover', 'barrière'),
        box(31, 18.5, 3, 0.6, 0.95, 'cover', 'barrière'), box(31, 33, 3, 0.6, 0.95, 'cover', 'barrière'),
        box(32, 25.3, 1, 1.4, 0.95, 'cover', 'sacs de sable'),
        // au centre de l'enclos, l'abri des caisses de paiement : coupe la vue d'une zone de départ à l'autre et partage la zone en deux
        box(35, 19.5, 2, 13, 2.8, 'wall', 'abri'),
        box(31.5, 23.5, 2, 4.4, 1.4, 'cover', 'voiture'),
        // divers
        box(8, 6, 1.5, 1.4, 1.1, 'cover', 'fût'), box(8, 38.6, 1.5, 1.4, 1.1, 'cover', 'fût'),
        box(16, 11, 1.0, 2.4, 1.0, 'cover', 'sacs de sable'), box(16, 32.6, 1.0, 2.4, 1.0, 'cover', 'sacs de sable'),
        box(26.5, 38, 3, 1.2, 1.0, 'cover', 'muret'), box(26.5, 7, 3, 1.2, 1.0, 'cover', 'muret'),
      ]),
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
