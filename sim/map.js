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

  // Rangée double de places de stationnement (épi droit, voitures nez à nez), orientée nord-sud : x0 = bord ouest de la
  // rangée (10 m de large : deux places de 5 m), z0 = début de la première place (2,5 m de large chacune). Une lettre par
  // place, moitié ouest puis moitié est : '.' place vide, 'v' berline, 'p' pick-up, 'f' fourgon (plus long : il dépasse dans
  // l'allée), 'm' voiture mal garée (à cheval sur la ligne, l'arrière dans l'allée). Les voitures sont garées en marche
  // avant : capot vers le milieu de la rangée (o.dir : sens du capot le long de x, lu par le rendu).
  function rangee(x0, z0, ouest, est, teintes) {
    const out = []; let n = 0;
    [ouest, est].forEach((s, cote) => {
      for (let k = 0; k < s.length; k++) {
        const c = s[k]; if (c === '.') continue;
        const z = z0 + 2.5 * k, dir = cote ? -1 : 1, t = teintes ? teintes[n++ % teintes.length] : undefined;
        let o;
        if (c === 'f') o = box(cote ? x0 + 5.2 : x0 - 0.4, z + 0.2, 5.2, 2.1, 2.4, 'wall', 'fourgon');
        else if (c === 'm') o = box(cote ? x0 + 5.8 : x0 - 0.3, z + 1.0, 4.4, 1.9, 1.4, 'cover', 'voiture');
        else o = box(cote ? x0 + 5.3 : x0 + 0.3, z + 0.3, 4.4, 1.9, 1.4, 'cover', c === 'p' ? 'voiture (pick-up)' : 'voiture');
        o.dir = dir; if (t !== undefined) o.teinte = t; out.push(o);
      }
    });
    return out;
  }
  // sens du capot d'un véhicule isolé (le long de son grand côté : +1 vers +x ou +z)
  function cap(o, dir) { o.dir = dir; return o; }
  // un arbre dans une jardinière (bac en béton surélevé) ; le tronc est un obstacle mince (bloque la vue au ras du tronc)
  function bac(x, z, w, d) { return [box(x, z, w, d, 0.9, 'cover', 'bac à fleurs'), box(x + w / 2 - 0.25, z + d / 2 - 0.25, 0.5, 0.5, 5.0, 'wall', 'arbre')]; }

  // une seule carte pour l'instant : le parking à l'arrière des boutiques de la Grand-Rue
  const MAPS = {
    parking: {
      id: 'parking', name: 'Parking de la Grand-Rue', width: 72, depth: 46,
      spawns: [ { x: 5.5, z: 23, r: 3.5 }, { x: 66.5, z: 23, r: 3.5 } ],
      acces: [[47.5, 45.5]],   // entrée-sortie des voitures (vérification de circulation)
      capture: { x: 36, z: 23, r: 6 },  // la station de lavage : deux pistes ouvertes au nord et au sud, local technique au nord, muret entre les pistes
      asymetrique: true,
      // z des trois voies d'approche, routes de l'IA : nord par la ruelle (derrière le grillage), milieu à travers les rangées
      // de voitures et la station de lavage, sud le long du muret de la rue (quai de la navette, kiosque, chantier).
      voies: { nord: 5.5, milieu: 23, sud: 34 },
      // marquage au sol (rendu seulement) : rangées doubles [x0, z0, places], places le long des murs [x, z, places, pas en x, pas en z]
      marquage: { rangees: [[13, 17, 6], [49, 17, 6]], murs: [[7.6, 41, 7, 2.5, 0], [0, 10.8, 2, 0, 2.5], [0, 29.5, 4, 0, 2.5], [67, 10.8, 2, 0, 2.5], [67, 29.5, 2, 0, 2.5]] },
      // Un vrai parking de centre-ville, à l'arrière des boutiques de la Grand-Rue, vu du ciel : au nord la ruelle de service
      // (arrière des immeubles en briques, portes de service, entrées arrière des boutiques en face des deux passages du
      // grillage, bennes, fourgons de livraison) ; au sud la rue, derrière un muret à grille, avec l'unique entrée-sortie des
      // voitures (barrières, guérite), le quai de la navette et une partie du parking fermée pour travaux ; à l'ouest et à
      // l'est des murs de clôture (portes piétonnes derrière les zones de départ). Entre les deux, deux rangées doubles de
      // places orientées nord-sud (voitures garées en marche avant, capot vers le milieu : des lignes de couvert en travers du
      // terrain, avec des places vides pour passer) et, au milieu, la station de lavage (zone à prendre). Pas symétrique :
      // l'équilibre est vérifié en jouant des centaines de batailles.
      obstacles: [].concat(
        [
          // limites : au nord les arrières des immeubles (ruelle), à l'ouest et à l'est des murs de clôture (graffitis), au sud
          // le muret à grille de la rue, ouvert sur l'entrée-sortie des voitures (barrières levantes)
          box(-1, -1, 74, 1, 3.2, 'wall', 'mur nord'), box(-1, 46, 45, 1, 3.2, 'wall', 'mur sud'), box(51, 46, 22, 1, 3.2, 'wall', 'mur sud'),
          box(-1, 0, 1, 46, 3.2, 'wall', 'mur ouest'), box(72, 0, 1, 46, 3.2, 'wall', 'mur est'),
          box(44, 46, 7, 1, 1.1, 'wall', 'mur portail sud'),
          box(46.9, 42.4, 1.6, 1.8, 2.5, 'wall', 'guérite'),                     // guérite du gardien, sur l'îlot entre l'entrée et la sortie
          // ---- NORD : ruelle de service à l'arrière des immeubles en briques (portes de service, escaliers de secours),
          // séparée du parking par un muret surmonté d'un grillage (on voit à travers), avec deux passages.
          // Au milieu, une chicane : l'annexe en briques d'un immeuble avance dans la ruelle, en face le local à poubelles.
          box(9, 10.5, 15, 0.3, 0.8, 'cover', 'clôture grillagée'), box(27.5, 10.5, 19, 0.3, 0.8, 'cover', 'clôture grillagée'),
          box(50, 10.5, 13, 0.3, 0.8, 'cover', 'clôture grillagée'),
          box(30, 0, 7, 6.0, 5.0, 'wall', 'annexe'), box(39, 7.2, 4, 3.3, 2.0, 'wall', 'local poubelles'),
          box(28.4, 7.6, 1.2, 1.2, 1.0, 'cover', 'caisses'), box(37.7, 7.8, 1.2, 1.2, 1.0, 'cover', 'palettes'),   // à couvert dans la chicane
          box(33.0, 6.0, 1.8, 1.2, 1.8, 'wall', 'rolls'),                        // rolls de livraison devant le rideau de l'annexe (ferme la chicane)
          box(12, 0.9, 5.2, 2.1, 2.4, 'wall', 'fourgon'), box(56, 8.2, 5.2, 2.1, 2.4, 'wall', 'fourgon'),
          box(0.5, 0.4, 2.0, 1.4, 1.3, 'cover', 'benne'), box(20, 8.8, 2.0, 1.4, 1.3, 'cover', 'benne'), box(52.5, 0.4, 2.0, 1.4, 1.3, 'cover', 'benne'),
          box(7.6, 0.3, 1.0, 0.8, 1.0, 'cover', 'clim'), box(28.2, 0.3, 1.0, 0.8, 1.0, 'cover', 'clim'), box(61.5, 0.3, 1.0, 0.8, 1.0, 'cover', 'clim'),
          box(18.6, 8.9, 1.2, 1.2, 1.0, 'cover', 'palettes'), box(43.9, 0.4, 1.2, 1.2, 1.3, 'cover', 'caisses'), box(37.4, 2.6, 1.2, 1.2, 1.0, 'cover', 'palettes'),
          box(66.2, 7.6, 1.2, 1.2, 1.5, 'cover', 'caisses'), box(3.6, 8.4, 1.2, 1.2, 1.0, 'cover', 'palettes'),
          // ---- MILIEU (entre les rangées, x 23–49) : disposé en miroir autour de x = 36 pour l'équité ; station de lavage
          // (deux pistes, local technique au nord, muret entre les pistes), un fourgon qui attend son tour au nord, un autre
          // qu'on sèche au sud, l'îlot du totem des tarifs, de chaque côté deux places d'aspiration
          box(30.2, 17.9, 0.4, 10.2, 3.3, 'wall', 'lavage paroi'), box(41.4, 17.9, 0.4, 10.2, 3.3, 'wall', 'lavage paroi'),
          box(34.6, 17.9, 2.8, 3.6, 3.3, 'wall', 'lavage local'), box(35.7, 21.5, 0.6, 6.6, 1.1, 'cover', 'lavage muret'),
          cap(box(34.95, 12.7, 2.1, 5.2, 2.4, 'wall', 'fourgon'), 1),             // attend qu'une piste se libère
          cap(box(34.95, 28.1, 2.1, 5.2, 2.4, 'wall', 'fourgon'), 1),             // au séchage, à la sortie des pistes
          box(33.3, 11.0, 5.4, 1.6, 1.7, 'wall', 'haie'), box(35.4, 11.5, 1.2, 0.5, 3.6, 'wall', 'totem'),
          cap(box(27.9, 18.6, 1.9, 4.4, 1.4, 'cover', 'voiture'), -1), box(28.5, 23.4, 0.8, 0.9, 1.4, 'cover', 'aspirateur'), cap(box(27.9, 24.6, 1.9, 4.4, 1.4, 'cover', 'voiture (pick-up)'), 1),
          cap(box(42.2, 18.6, 1.9, 4.4, 1.4, 'cover', 'voiture'), -1), box(42.7, 23.4, 0.8, 0.9, 1.4, 'cover', 'aspirateur'), cap(box(42.2, 24.6, 1.9, 4.4, 1.4, 'cover', 'voiture'), 1),
          // ---- OUEST : caisse automatique (piétons) sur son îlot ; places le long du mur ouest, borne de recharge
          box(9.4, 21.9, 2.2, 2.2, 2.6, 'wall', 'caisse automatique'),
          cap(box(0.2, 11.0, 5.2, 2.1, 2.4, 'wall', 'fourgon'), -1), cap(box(0.3, 13.6, 4.4, 1.9, 1.4, 'cover', 'voiture (pick-up)'), -1),
          cap(box(0.3, 30.4, 4.4, 1.9, 1.4, 'cover', 'voiture'), -1), cap(box(0.2, 35.3, 5.2, 2.1, 2.4, 'wall', 'fourgon'), -1),
          box(0.2, 33.2, 0.5, 0.6, 1.5, 'cover', 'borne de recharge'),
          // ---- EST : poste électrique sur son îlot planté ; places le long du mur est (au sud, la camionnette du chantier)
          box(60.4, 21.9, 2.2, 2.2, 2.6, 'wall', 'poste électrique'), box(60.6, 24.6, 1.0, 0.5, 1.4, 'cover', 'armoire'),
          cap(box(66.6, 11.0, 5.2, 2.1, 2.4, 'wall', 'fourgon'), 1), cap(box(67.3, 13.6, 4.4, 1.9, 1.4, 'cover', 'voiture (pick-up)'), 1),
          cap(box(67.3, 30.4, 4.4, 1.9, 1.4, 'cover', 'voiture'), 1), cap(box(66.6, 35.3, 5.2, 2.1, 2.4, 'wall', 'fourgon'), 1),
          box(71.3, 33.2, 0.5, 0.6, 1.5, 'cover', 'borne de recharge'),
          // ---- SUD : places le long du mur de la rue, kiosque à pizzas et consigne à colis (de part et d'autre), quai de la
          // navette (abri et jardinières sur l'îlot, bus le long), fourgons de livraison, point de tri
          cap(box(8.6, 41.4, 1.9, 4.4, 1.4, 'cover', 'voiture'), 1), cap(box(16.1, 41.4, 1.9, 4.4, 1.4, 'cover', 'voiture'), 1),
          cap(box(18.0, 41.4, 1.9, 4.4, 1.4, 'cover', 'voiture'), 1), cap(box(20.5, 41.4, 1.9, 4.4, 1.4, 'cover', 'voiture (pick-up)'), 1),
          cap(box(23.0, 41.4, 1.9, 4.4, 1.4, 'cover', 'voiture (pick-up)'), 1),
          box(21.2, 33.8, 2.4, 2.4, 3.0, 'wall', 'kiosque'), box(48.4, 33.8, 2.4, 2.4, 2.4, 'wall', 'consigne colis'),
          box(30, 39.7, 12, 2.6, 3.0, 'wall', 'bus'), box(33.9, 38.0, 4.2, 1.5, 2.5, 'wall', 'abribus'),
          box(31.6, 38.1, 1.8, 1.3, 0.9, 'cover', 'bac à fleurs'), box(38.6, 38.1, 1.8, 1.3, 0.9, 'cover', 'bac à fleurs'),
          ...bac(30.4, 34.0, 1.8, 1.4), ...bac(39.8, 34.0, 1.8, 1.4),            // jardinières du passage piéton
          cap(box(25.7, 38.6, 2.1, 5.2, 2.4, 'wall', 'fourgon'), 1),             // livraison du kiosque
          cap(box(44.2, 38.6, 2.1, 5.2, 2.4, 'wall', 'fourgon'), 1),             // arrêté à la barrière de sortie
          box(9.4, 34.2, 1.6, 4.6, 1.7, 'wall', 'colonnes de tri'),               // point de tri sur son îlot, dans l'angle sud-ouest
          ...bac(16.4, 35.8, 1.8, 1.4),                                          // îlot planté au carrefour des allées sud-ouest
          box(52.6, 41.8, 1.2, 1.2, 0.9, 'cover', 'palettes'), box(53.0, 35.4, 1.0, 2.0, 0.9, 'cover', 'sacs de sable'),
          // ---- SUD-EST : partie du parking fermée pour réfection de l'enrobé (séparateurs, clôtures de chantier bâchées,
          // conteneurs du chantier, benne à gravats, palettes de bordures, sacs de sable qui lestent les panneaux, fût)
          box(52.5, 34.2, 5.5, 0.6, 0.95, 'cover', 'barrière'), box(61, 34.2, 5, 0.6, 0.95, 'cover', 'barrière'),
          box(51.9, 34.8, 0.3, 1.2, 2.0, 'wall', 'clôture de chantier'), box(51.9, 41.2, 0.3, 4.8, 2.0, 'wall', 'clôture de chantier'),
          box(59.4, 39.0, 2.4, 6.0, 2.6, 'wall', 'conteneur'), box(65.6, 43.4, 6, 2.4, 2.6, 'wall', 'conteneur'),
          box(54.2, 43.4, 2.6, 1.7, 1.3, 'cover', 'benne à gravats'),
          box(56.2, 37.4, 1.2, 1.2, 0.9, 'cover', 'palettes'), box(57.7, 38.4, 1.2, 1.2, 0.9, 'cover', 'palettes'),
          box(62.8, 37.0, 2.4, 1.0, 0.8, 'cover', 'sacs de sable'),
          box(67.4, 37.6, 1.4, 0.7, 1.1, 'cover', 'fût'),
        ],
        // îlots plantés aux bouts des rangées (jardinières avec arbre, ou haies taillées), en miroir
        bac(13.6, 15.4, 4.4, 1.4), bac(18.6, 15.4, 4.0, 1.4), [box(13.6, 32.2, 4.6, 1.4, 1.7, 'wall', 'haie')], bac(18.8, 32.2, 3.0, 1.4),
        bac(49.4, 15.4, 4.0, 1.4), bac(54.0, 15.4, 4.4, 1.4), bac(50.2, 32.2, 3.0, 1.4), [box(53.8, 32.2, 4.6, 1.4, 1.7, 'wall', 'haie')],
        // rangées de places (ouest : x 13–23 ; est : x 49–59, en miroir), du nord (z 17) au sud (z 32)
        rangee(13, 17, 'vf.vv.', '.v.fvv', [0, 3, 5, 1, 6, 2, 4, 7, 0, 5]),
        rangee(49, 17, '.v.fvv', 'vf.vv.', [2, 6, 9, 4, 1, 7, 3, 5, 10, 11])
      ),
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
