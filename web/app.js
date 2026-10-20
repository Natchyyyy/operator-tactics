// OPERATOR TACTICS — rendu 3D (three.js) et interface d'observation. La simulation vit dans sim/*.js ; ici on ne fait
// qu'afficher son état et ses événements. Mode manuel : ?manual=1 puis window.API.step(n, dt).
(function () {
  const OT = window.OT;
  const { Battle, DATA, DT, fmtT } = OT;
  const params = new URLSearchParams(location.search);
  const MANUAL = params.get('manual') === '1';
  const SHOW_ROTATION = false;   // D8 Rotation : cachée depuis les points de passage (D7) ; le moteur la garde (battle.rotate)
  if (MANUAL) document.documentElement.classList.add('manual');   // captures reproductibles : pas de transitions CSS (aucune image n'est dessinée entre deux étapes)

  const STATE_FR = { rush: 'Fonce (ordre)', crossing: 'Traverse le découvert', tokey: 'Rejoint son poste', holdkey: 'Tient la position', throw: 'Lance une grenade', evade: 'Esquive une grenade', capture: 'Tient la zone', tozone: 'Vers la zone', idle: 'En attente', advancing: 'Progresse', bounding: 'Bond', pause: 'Observe', tocover: 'Vers un couvert', engage: 'Au contact', closing: 'Se rapproche', pinned: 'Cloué au sol', hold: 'Tient', wait: 'Attend', fallback: 'Recule', reposition: 'Change de poste', overwatch: 'Surveille', retreat: 'Se replie', search: 'Ratisse', noammo: 'Sans munitions', hide: 'Se cache', torevive: 'Va relever un allié', reviving: 'Relève un allié', shaken: 'Ébranlé', appui: 'Tir d’appui' };
  const STATUS_FR = { ok: 'Indemne', wounded: 'Blessé', critical: 'Grave', down: 'Neutralisé' };
  const TEAM = [
    { name: 'Alpha', color: 0x4f9cf0, css: '#4f9cf0', uniform: 0x3a4a3c, vest: 0x2b352d },
    { name: 'Bravo', color: 0xe85a4f, css: '#e85a4f', uniform: 0x6b5a3e, vest: 0x4e4230 },
  ];
  const TACTIC_ICON = { tiroir: '⇅', fumigene: '💨', reco: '📡', soins: '✚', barrage: '💥', drill: '🛡', blitz: '⚡', retranche: '🧱', discipline: '🎯', frappe: '✈', tete: '☠', camouflage: '🌿', triage: '⛑' };
  // Voies (nord, milieu, sud) en petit dessin : counts = opérateurs par voie [nord, milieu, sud], hi = voie mise en avant (-1, 0, 1)
  const LANE_NAMES = { '-1': 'flanc nord', 0: 'milieu', 1: 'flanc sud' }, LANE_LETTER = { '-1': 'N', 0: 'M', 1: 'S' };
  function laneSvg(counts, hi, cls) {
    let g = '';
    [-1, 0, 1].forEach((l, i) => {
      const y = 12 + i * 12, on = hi === l, n = counts ? counts[i] : 0;
      g += `<line x1="5" y1="${y}" x2="37" y2="${y}" stroke="${on ? '#6fe3a0' : 'currentColor'}" stroke-opacity="${on ? 1 : 0.35}" stroke-width="${on ? 3.4 : 2.4}" stroke-linecap="round"/>`;
      g += `<path d="M37 ${y - 4.5} L44 ${y} L37 ${y + 4.5}" fill="${on ? '#6fe3a0' : 'currentColor'}" fill-opacity="${on || n ? 1 : 0.35}"/>`;
      for (let k = 0; k < n; k++) g += `<circle cx="${30 - k * 6}" cy="${y}" r="3.3" fill="#fff" stroke="#0b0f14" stroke-width="1"/>`;
    });
    return `<svg class="${cls || 'timg'} lanesvg" viewBox="0 0 48 48" aria-hidden="true">${g}</svg>`;
  }
  TACTIC_ICON.tenailles = laneSvg([2, 1, 2]); TACTIC_ICON.rush_milieu = laneSvg([0, 4, 0], 0);
  // vague 2 : Fixer et déborder (deux qui tirent sur la cible, une flèche qui la contourne), Éclaireur (un devant, les autres
  // loin derrière), Tiroir lent (trois qui avancent, deux qui restent)
  const tacSvg = (g) => `<svg class="timg lanesvg" viewBox="0 0 48 48" aria-hidden="true">${g}</svg>`, dot = (x, y) => `<circle cx="${x}" cy="${y}" r="3.3" fill="#fff" stroke="#0b0f14" stroke-width="1"/>`;
  TACTIC_ICON.fixer_deborder = tacSvg(`<circle cx="38" cy="16" r="4" fill="#ff8a70"/><path d="M14 13 L31 15 M14 21 L31 17" stroke="#ffb070" stroke-width="2" stroke-dasharray="3 2"/><path d="M12 38 C30 44 42 36 40 24 M35.5 27 L40 22 L43.5 27.5" fill="none" stroke="#6fe3a0" stroke-width="2.6" stroke-linecap="round"/>${dot(10, 13)}${dot(10, 21)}${dot(8, 37)}`);
  TACTIC_ICON.eclaireur = tacSvg(`<path d="M8 24 H40 M34 19.5 L41 24 L34 28.5" fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width="2.4" stroke-linecap="round"/>${dot(32, 24)}${dot(8, 16)}${dot(8, 24)}${dot(8, 32)}`);
  TACTIC_ICON.tiroir_lent = tacSvg(`<path d="M28 10 V38 M23.5 15 L28 9 L32.5 15" fill="none" stroke="#6fe3a0" stroke-width="2.4" stroke-linecap="round"/>${dot(28, 18)}${dot(36, 24)}${dot(20, 24)}${dot(10, 34)}${dot(18, 38)}`);
  const tacIcon = (id) => (OT.imgTag && OT.imgTag('tac_' + id, 'timg')) || TACTIC_ICON[id] || '◆';      // icône dessinée si disponible
  const roleImg = (role) => (OT.imgTag && OT.imgTag('role_' + role, 'rimg')) || '';
  const $ = (s) => document.querySelector(s);

  // ---------------------------------------------------------------------------------------------
  // Scène
  // ---------------------------------------------------------------------------------------------
  const canvas = $('#scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.3;   // rendu « film » : hautes lumières douces, contraste plus naturel
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e1114);
  scene.fog = new THREE.Fog(0x1a2028, 110, 200);
  (function sky() {
    const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, '#0c1016'); grd.addColorStop(0.45, '#1d2733'); grd.addColorStop(0.62, '#4b4a4e'); grd.addColorStop(0.7, '#8a6a4a'); grd.addColorStop(1, '#2a2622');
    g.fillStyle = grd; g.fillRect(0, 0, 4, 256);
    const tex = (OT.Decor && OT.Decor.skyTexture()) || new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }));
    dome.position.set(32, -30, 20); scene.add(dome); scene.userData.dome = dome;
  })();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.3, 6000);

  // caméra orbitale maison (glisser : tourner ; molette : zoom ; clic droit / Maj : déplacer)
  // Trois modes : « follow » (derrière un soldat, choisi ou automatique), « sat » (vue d'ensemble), « free » (orbite libre)
  const cam = { mode: 'director', shot: null, target: new THREE.Vector3(32, 0, 20), yaw: Math.PI / 2 + 0.28, pitch: 0.95, dist: 60, follow: null, autoFollow: null, autoUntil: 0, pos: new THREE.Vector3(), look: new THREE.Vector3(), init: false };
  function pickAutoFollow() {
    if (!battle) return null;
    // le soldat le plus « engagé » : vient de tirer ou d'être pris pour cible ; priorité à l'équipe du joueur
    let best = null, bs = -Infinity;
    for (const u of battle.units) {
      if (!u.alive || !fogShown(u)) continue;   // (jamais un ennemi que l'escouade ne voit pas)
      let sc = (u.team === 0 ? 2 : 0) + (battle.t - u.lastShotAt < 3 ? 6 : 0) + (battle.t - u.lastShotByAt < 3 ? 5 : 0) + (u.target ? 3 : 0) + (u.moving ? 1 : 0) + (u.id === cam.autoFollow ? 2.5 : 0);
      if (sc > bs) { bs = sc; best = u; }
    }
    return best ? best.id : null;
  }
  // ---- Réalisateur : retransmission automatique, comme la régie d'un match. -----------------------------------------
  // Il note l'intérêt de chaque action (tireur qui a sa cible en vue, soldat pris pour cible, grenade, bond vers un
  // couvert, prise de zone, accalmie) et choisit un plan adapté :
  //  - « shoulder » : par-dessus l'épaule du tireur, la cible sur le tiers opposé du cadre, lent travelling avant ;
  //  - « duel » : de trois-quarts, le tireur et sa cible tous deux dans le cadre ;
  //  - « dolly » : travelling latéral à hauteur d'homme sur un soldat qui se déplace, de l'espace devant lui ;
  //  - « overview » : plan large de l'échange, perpendiculaire à la ligne de front, rotation lente ;
  //  - « establish » : plan d'ensemble en grue (ouverture, accalmies, de temps en temps pour « respirer ») ;
  //  - « capture » : la zone et ceux qui la tiennent ;
  //  - « killcam » : sur une neutralisation, épaule du tireur (ou plan serré sur la victime) qui se resserre ;
  //  - « blast » : explosion vue en hauteur, en tournant.
  // Règles : un plan tient au moins 3,5 s (seules une neutralisation ou une explosion coupent plus tôt) ; chaque position
  // est validée avant la coupe (pas dans un obstacle, sujet visible, objectif non bouché par un mur) puis surveillée
  // (sujet masqué plus d'une seconde → autre plan) ; tout mouvement est amorti par un ressort critique (aucun à-coup),
  // la focale aussi ; la perche (clipBoom) empêche de traverser voitures et murs.
  const DIRECTOR = { smokes: [], eventShot: null, pending: null, clock: 0, lastT: null, battle: null, t0: 0, lastWide: -99, hist: [], vel: new THREE.Vector3(), lvel: new THREE.Vector3(), fov: 50, fvel: 0, masked: 0, minHold: 3.5 };
  function directorEvent(kind, x, z) {   // appelée sur une explosion ou une neutralisation : traitée à l'image suivante
    if (cam.mode !== 'director' || kind === 'revive') return;
    DIRECTOR.pending = { kind, x, z, at: simTime };
  }
  function engagedUnits(win) { win = win || 2.5; return battle.units.filter(u => u.alive && fogShown(u) && (battle.t - u.lastShotAt < win || battle.t - u.lastShotByAt < win)); }
  // Ennemis non repérés : le réalisateur ne les filme jamais (ni sujet, ni cible, ni centre d'un plan large) ; un plan dont le
  // sujet sort de la vue de l'escouade n'a plus de cadrage (frameShot → null) et le réalisateur coupe.
  const shownUnits = () => battle.units.filter(u => u.alive && fogShown(u));
  const MOVE_STATES = { crossing: 2, tocover: 2, bounding: 1.5, advancing: 1, closing: 1.5, tozone: 1.5, torevive: 2.5, fallback: 1.5, retreat: 1.5, reposition: 1, evade: 2.5 };
  function recentlyShown(id, kind) {   // pénalité de répétition : même soldat ou même type de plan dans les 25 dernières secondes
    let p = 0;
    for (const h of DIRECTOR.hist) { const k = 1 - (DIRECTOR.clock - h.at) / 25; if (k <= 0) continue; if (id && h.id === id) p += 2.5 * k; if (h.kind === kind) p += 1.2 * k; }
    return p;
  }
  // plans possibles, du plus intéressant au moins intéressant
  function pickShot() {
    const D = DIRECTOR, t = battle.t, C = [];
    const add = (score, s) => { s.score = score - recentlyShown(s.id, s.kind) + Math.random() * 0.8; C.push(s); };
    if (!D.hist.length) add(100, { kind: 'establish', dur: 5.5 });   // ouverture : plan d'ensemble
    let action = 0;
    for (const u of battle.units) {
      if (!u.alive || !fogShown(u)) continue;
      const tg = u.target && u.target.alive && fogShown(u.target) ? u.target : null, firing = t - u.lastShotAt < 1.6, underFire = t - u.lastShotByAt < 1.6, own = u.team === 0 ? 1 : 0;
      if (u.state === 'throw') { add(9 + own, { kind: 'shoulder', id: u.id, tid: tg && tg.id, dur: 4 }); action++; continue; }
      if (tg && firing && u.visible && u.visible.has(tg.id)) {
        const d = Math.hypot(tg.x - u.x, tg.z - u.z), hurt = tg.status === 'critical' ? 2 : tg.status === 'wounded' ? 1 : 0; action++;
        add(6 + own * 1.5 + hurt + (d < 22 ? 1 : 0) + (underFire ? 1.5 : 0), { kind: 'shoulder', id: u.id, tid: tg.id, dur: 5 + Math.random() * 1.5 });
        if (d < 26) add(5 + own + hurt + (underFire ? 1.5 : 0), { kind: 'duel', id: u.id, tid: tg.id, dur: 4.5 + Math.random() });
      } else if (u.moving && MOVE_STATES[u.state]) add(2.5 + MOVE_STATES[u.state] + own * 1.2 + (underFire ? 2.5 : 0), { kind: 'dolly', id: u.id, dur: 4.5 + Math.random() });
      if (battle.zone && u.state === 'capture') add(4 + own, { kind: 'capture', id: u.id, dur: 5 });
    }
    const eng = engagedUnits();
    if (eng.length >= 3) add(4.5 + Math.min(3, eng.length * 0.4), { kind: 'overview', dur: 5.5, yaw: (Math.random() - 0.5) * 0.9 });
    add((action ? 1 : 5) + Math.min(4, (D.clock - D.lastWide) / 10), { kind: 'establish', dur: action ? 4.5 : 6.5 });
    add(1, { kind: 'overview', dur: 5, squad: true, yaw: 0.3 });   // repli : l'escouade
    return C.sort((a, b) => b.score - a.score);
  }
  function centroid(list) { const n = list.length || 1; return { x: list.reduce((s, u) => s + u.x, 0) / n, z: list.reduce((s, u) => s + u.z, 0) / n }; }
  // Perche de caméra : la caméra ne traverse ni murs ni voitures. On lance le segment pivot → caméra contre les boîtes
  // des obstacles (élargies de 0,3 m) ; si un obstacle coupe la vue, on essaie plus haut (par-dessus), sinon on
  // rapproche la caméra juste devant l'obstacle.
  function boomHit(px, py, pz, qx, qy, qz) {
    let tmin = 1; const dx = qx - px, dy = qy - py, dz = qz - pz, pad = 0.3;
    for (const o of battle.map.obstacles) {
      const top = o.h + 0.15; if (Math.min(py, qy) > top) continue;
      if (px > o.x - pad && px < o.x + o.w + pad && pz > o.z - pad && pz < o.z + o.d + pad && py < top) continue;   // pivot collé à l'obstacle : on l'ignore
      let t0 = 0, t1 = 1;
      const slab = (p, d, lo, hi) => { if (Math.abs(d) < 1e-6) return p >= lo && p <= hi; let a = (lo - p) / d, b = (hi - p) / d; if (a > b) { const t = a; a = b; b = t; } t0 = Math.max(t0, a); t1 = Math.min(t1, b); return t0 <= t1; };
      if (slab(px, dx, o.x - pad, o.x + o.w + pad) && slab(pz, dz, o.z - pad, o.z + o.d + pad) && slab(py, dy, -1, top) && t0 < tmin) tmin = t0;
    }
    return tmin;
  }
  // perche : boîtes de la simulation ET décor réellement dessiné (voxels, voir OCC). loose (caméra « Suivre ») : on tolère
  // d'être sous un auvent ; sinon une position relevée doit aussi être dégagée au-dessus et au-dessous (pas sous un toit).
  function clipBoom(pivot, want, loose) {
    const L = pivot.distanceTo(want); if (L < 0.01) return want;
    occEnsure(); let t0 = 1; const U = OCC.use;
    for (const lift of [0, 0.8, 1.8, 3]) {
      const q = new THREE.Vector3(want.x, want.y + lift, want.z), t = Math.min(boomHit(pivot.x, pivot.y, pivot.z, q.x, q.y, q.z), U ? occRay(pivot, q, 0, 0.55) : 1);
      if (!lift) t0 = t;
      if (t >= 1) { const b = U ? occBad(q) : 0; if (!b || (loose && b === 2)) return q; }
    }
    const k = Math.max(0.12, t0 - 0.5 / L); return new THREE.Vector3(pivot.x + (want.x - pivot.x) * k, pivot.y + (want.y - pivot.y) * k, pivot.z + (want.z - pivot.z) * k);
  }
  // ---- Décor réellement dessiné, en voxels de 0,5 m : le réalisateur valide ses plans contre ce qu'on VOIT ----
  // Les boîtes de la simulation ne couvrent pas tout le décor (arrières d'immeubles de 8 à 13 m, toits, auvents, abribus,
  // lampadaires, arbres, toit de la station de lavage, escaliers de secours…). Une fois par carte, on échantillonne les
  // triangles du décor immobile (tous les 0,2 m) dans une grille 3D qui couvre le terrain et ses abords (0,3 à 28 m de haut),
  // puis on y lance des rayons (DDA 3D). Valeur 1 : opaque ; 2 : élément qui s'efface vu d'en haut (toit de la station de
  // lavage) — opaque pour placer la caméra, transparent pour un regard plongeant depuis plus haut. Les objets destructibles
  // restent sur leurs boîtes de simulation (elles disparaissent avec eux).
  const OCC = { g: null, src: null, cs: 0.5, x0: -4, z0: -4, nx: 0, ny: 56, nz: 0, fadeTop: 0, ms: 0, use: params.get('occ') !== '0' };   // ?occ=0 : ancien réalisateur (boîtes seules), pour comparer
  function occEnsure() { if (battle && mapGroup && (OCC.src !== mapGroup || OCC.map !== battle.map)) occBuild(); }
  function occBuild() {
    const t0 = performance.now(), mp = battle.map, cs = OCC.cs, x0 = OCC.x0, z0 = OCC.z0, nx = Math.ceil((mp.width - 2 * x0) / cs), nz = Math.ceil((mp.depth - 2 * z0) / cs), ny = OCC.ny, Y0 = 0.3;
    const g = new Uint8Array(nx * ny * nz), X1 = x0 + nx * cs, Z1 = z0 + nz * cs, Ytop = ny * cs;
    Object.assign(OCC, { g, src: mapGroup, map: mp, nx, nz, fadeTop: 0 });
    const skip = new Set(obstacleMesh.values());
    mapGroup.updateMatrixWorld(true);
    const M = new THREE.Matrix4(), IM = new THREE.Matrix4(), bb = new THREE.Box3(), A = new Float32Array(9);
    let val = 1, mval = 1;
    const mark = (x, y, z) => { if (y < Y0 || y >= Ytop) return; const i = Math.floor((x - x0) / cs), k = Math.floor((z - z0) / cs); if (i < 0 || k < 0 || i >= nx || k >= nz) return; const n = (Math.floor(y / cs) * nz + k) * nx + i; if (!g[n] || (g[n] === 3 && val !== 3) || val === 1) g[n] = val; };
    const addGeo = (geo, m) => {
      if (!geo.boundingBox) geo.computeBoundingBox(); bb.copy(geo.boundingBox).applyMatrix4(m);
      if (bb.max.y < Y0 || bb.min.y > Ytop || bb.min.x > X1 || bb.max.x < x0 || bb.min.z > Z1 || bb.max.z < z0) return;
      const P = geo.attributes.position, idx = geo.index, n = idx ? idx.count : P.count, e = m.elements, step = cs * 0.4;
      for (let t = 0; t + 2 < n; t += 3) {
        for (let v = 0; v < 3; v++) {
          const j = idx ? idx.getX(t + v) : t + v, x = P.getX(j), y = P.getY(j), z = P.getZ(j);
          A[v * 3] = e[0] * x + e[4] * y + e[8] * z + e[12]; A[v * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; A[v * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        }
        if (A[1] < Y0 && A[4] < Y0 && A[7] < Y0) continue;   // sol, marquages, trottoirs : ignorés
        if (Math.max(A[0], A[3], A[6]) < x0 || Math.min(A[0], A[3], A[6]) > X1 || Math.max(A[2], A[5], A[8]) < z0 || Math.min(A[2], A[5], A[8]) > Z1 || Math.min(A[1], A[4], A[7]) > Ytop) continue;
        const L = Math.max(Math.hypot(A[3] - A[0], A[4] - A[1], A[5] - A[2]), Math.hypot(A[6] - A[0], A[7] - A[1], A[8] - A[2]), Math.hypot(A[6] - A[3], A[7] - A[4], A[8] - A[5]));
        const N = Math.min(500, Math.max(1, Math.ceil(L / step)));
        const ux = A[3] - A[0], uy = A[4] - A[1], uz = A[5] - A[2], wx = A[6] - A[0], wy = A[7] - A[1], wz = A[8] - A[2];
        val = Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / L < 0.06 ? 3 : mval;   // facette effilée (câble, poteau, tube, liseré) : mince
        for (let a = 0; a <= N; a++) for (let b = 0; a + b <= N; b++) { const u = a / N, w = b / N; mark(A[0] + (A[3] - A[0]) * u + (A[6] - A[0]) * w, A[1] + (A[4] - A[1]) * u + (A[7] - A[1]) * w, A[2] + (A[5] - A[2]) * u + (A[8] - A[2]) * w); }
      }
    };
    const visit = (o) => {
      if (o.visible === false || skip.has(o)) return;
      if (o.isMesh && o.geometry && o.geometry.attributes.position && !o.isSkinnedMesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const ghost = mats.every(m => !m || m.visible === false || m.blending === THREE.AdditiveBlending);   // hologrammes, halos
        const thin = mats.every(m => m && (m.alphaTest > 0 || (m.transparent && (m.opacity < 0.5 || m.depthWrite === false))));   // ajouré, translucide (grillage, bâche légère)
        if (!ghost) {
          mval = o.userData.keep && o.onBeforeRender.length ? 2 : thin ? 3 : 1;   // 2 : s'efface vu d'en haut (toit de la station de lavage) ; 3 : on voit au travers (compte pour placer la caméra)
          if (mval === 2) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); bb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); OCC.fadeTop = Math.max(OCC.fadeTop, bb.max.y); }
          if (o.isInstancedMesh) for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, IM); addGeo(o.geometry, M.multiplyMatrices(o.matrixWorld, IM)); }
          else addGeo(o.geometry, o.matrixWorld);
        }
      }
      for (const c of o.children) visit(c);
    };
    visit(mapGroup);
    OCC.ms = Math.round(performance.now() - t0);
  }
  function occCell(i, j, k) { return i < 0 || k < 0 || j < 0 || i >= OCC.nx || k >= OCC.nz || j >= OCC.ny ? 0 : OCC.g[(j * OCC.nz + k) * OCC.nx + i]; }
  // fraction libre du segment a → b dans le décor dessiné (1 : rien ne le coupe) ; padA / padB : bouts non testés (m).
  // Les éléments minces ou ajourés (valeur 3 : câbles, poteaux, grillages) ne bouchent pas la vue ; ils comptent pour placer la caméra.
  function occRay(a, b, padB, padA) {
    if (!OCC.g) return 1;
    const cs = OCC.cs, p = [a.x, a.y, a.z], d = [b.x - a.x, b.y - a.y, b.z - a.z], L = Math.hypot(d[0], d[1], d[2]); if (L < 1e-3) return 1;
    const lo = [OCC.x0, 0, OCC.z0], n = [OCC.nx, OCC.ny, OCC.nz], fade = a.y > OCC.fadeTop + 1.6 && d[1] < -0.2 * L;   // regard plongeant au-dessus du toit qui s'efface
    let t0 = Math.min(1, (padA || 0) / L), t1 = 1 - (padB || 0) / L; if (t1 <= t0) return 1;
    for (let k = 0; k < 3; k++) {
      const hi = lo[k] + n[k] * cs;
      if (Math.abs(d[k]) < 1e-9) { if (p[k] < lo[k] || p[k] >= hi) return 1; continue; }
      let u = (lo[k] - p[k]) / d[k], v = (hi - p[k]) / d[k]; if (u > v) { const w = u; u = v; v = w; }
      t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) return 1;
    }
    const c = [0, 0, 0], st = [0, 0, 0], tM = [0, 0, 0], tD = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      c[k] = Math.max(0, Math.min(n[k] - 1, Math.floor((p[k] + d[k] * (t0 + 1e-7) - lo[k]) / cs)));
      if (d[k] > 0) { st[k] = 1; tM[k] = (lo[k] + (c[k] + 1) * cs - p[k]) / d[k]; tD[k] = cs / d[k]; }
      else if (d[k] < 0) { st[k] = -1; tM[k] = (lo[k] + c[k] * cs - p[k]) / d[k]; tD[k] = -cs / d[k]; }
      else { tM[k] = Infinity; tD[k] = Infinity; }
    }
    let t = t0;
    for (let guard = 0; guard < 2000 && t <= t1; guard++) {
      const v = OCC.g[(c[1] * OCC.nz + c[2]) * OCC.nx + c[0]];
      if (v === 1 || (v === 2 && !fade)) return Math.max(0, t);
      const k = tM[0] < tM[1] ? (tM[0] < tM[2] ? 0 : 2) : (tM[1] < tM[2] ? 1 : 2);
      t = tM[k]; c[k] += st[k]; if (c[k] < 0 || c[k] >= n[k]) return 1; tM[k] += tD[k];
    }
    return 1;
  }
  // position de caméra dans le décor dessiné : 0 dégagée ; 1 contre ou dans un objet (< 0,4 m) ; 2 sous un toit, un auvent,
  // un arbre, dans un bâtiment ; 3 posée juste au-dessus d'un toit (moins de 3,5 m : on ne verrait que le toit)
  function occBad(p) {
    if (!OCC.g) return 0;
    const cs = OCC.cs, fx = (p.x - OCC.x0) / cs, fy = p.y / cs, fz = (p.z - OCC.z0) / cs, i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz), r = 0.3 / cs;
    for (let a = Math.floor(fx - r); a <= Math.floor(fx + r); a++) for (let b = Math.floor(fy - r); b <= Math.floor(fy + r); b++) for (let c = Math.floor(fz - r); c <= Math.floor(fz + r); c++) {
      if (!occCell(a, b, c)) continue;
      const dx = Math.max(a - fx, 0, fx - a - 1), dy = Math.max(b - fy, 0, fy - b - 1), dz = Math.max(c - fz, 0, fz - c - 1);   // distance à la case (en cases)
      if (dx * dx + dy * dy + dz * dz < r * r) return 1;
    }
    const solid = (a, b, c) => { const v = occCell(a, b, c); return v === 1 || v === 2; };
    let cover = 0, centre = 0; const up = Math.min(OCC.ny - 1, j + 32);
    for (let a = -2; a <= 2; a++) for (let c = -2; c <= 2; c++) for (let b = j + 1; b <= up; b++) if (solid(i + a, b, k + c)) { cover++; if (Math.abs(a) <= 1 && Math.abs(c) <= 1) centre++; break; }
    if (centre >= 5 || cover >= 12) return 2;
    if (p.y > 2.3) {
      const lo = Math.max(Math.floor(2.3 / cs), Math.floor((p.y - 3.5) / cs)); let m = 0;
      for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) for (let b = lo; b < j; b++) if (solid(i + a, b, k + c)) { m++; break; }
      if (m >= 3) return 3;
    }
    return 0;
  }
  // ---- outils du réalisateur : horloge, ressort critique, visibilité, cadrage ----
  function dirTick() {   // horloge des plans : temps réel hors pause (en mode manuel : temps simulé) ; renvoie le pas d'image
    const D = DIRECTOR, now = performance.now() / 1000, raw = D.lastT === null ? 1 / 60 : now - D.lastT; D.lastT = now;
    if (MANUAL) { D.clock = simTime; return 1 / 30; }
    const dt = raw < 0.002 ? 1 / 60 : Math.min(0.1, raw);
    if (!paused) D.clock += dt;
    return dt;
  }
  function damp3(cur, want, vel, st, dt) {   // ressort critique (SmoothDamp) : rejoint la cible sans dépassement ni à-coup
    const w = 2 / Math.max(0.02, st), x = w * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    for (const k of ['x', 'y', 'z']) { const c = cur[k] - want[k], tmp = (vel[k] + w * c) * dt; vel[k] = (vel[k] - w * tmp) * e; cur[k] = want[k] + (c + tmp) * e; }
  }
  function setFov(v) { if (Math.abs(camera.fov - v) > 0.01) { camera.fov = v; camera.updateProjectionMatrix(); } }
  function pushOut(p, pad) {   // sort un point des obstacles par la face la plus proche (déplacement continu, sans saut)
    for (const o of battle.map.obstacles) {
      if (p.y >= o.h + pad || p.x <= o.x - pad || p.x >= o.x + o.w + pad || p.z <= o.z - pad || p.z >= o.z + o.d + pad) continue;
      const c = [[p.x - (o.x - pad), 'x', o.x - pad], [o.x + o.w + pad - p.x, 'x', o.x + o.w + pad], [p.z - (o.z - pad), 'z', o.z - pad], [o.z + o.d + pad - p.z, 'z', o.z + o.d + pad], [o.h + pad - p.y, 'y', o.h + pad]];
      c.sort((a, b) => a[0] - b[0]); p[c[0][1]] = c[0][2];
    }
    return p;
  }
  function inObstacle(p, pad) { for (const o of battle.map.obstacles) if (p.y < o.h + pad && p.x > o.x - pad && p.x < o.x + o.w + pad && p.z > o.z - pad && p.z < o.z + o.d + pad) return true; return false; }
  function segFree(a, b, low) {   // fraction libre du segment a → b (1 : aucun obstacle ne le coupe) ; low : boîtes abaissées d'autant
    let tmin = 1; const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    for (const o of battle.map.obstacles) {
      const h = o.h - (low || 0); if (Math.min(a.y, b.y) > h) continue;
      let t0 = 0, t1 = 1;
      const slab = (p, d, lo, hi) => { if (Math.abs(d) < 1e-6) return p >= lo && p <= hi; let u = (lo - p) / d, v = (hi - p) / d; if (u > v) { const w = u; u = v; v = w; } t0 = Math.max(t0, u); t1 = Math.min(t1, v); return t0 <= t1; };
      if (slab(a.x, dx, o.x, o.x + o.w) && slab(a.z, dz, o.z, o.z + o.d) && slab(a.y, dy, -1, h) && t0 < tmin) tmin = t0;
    }
    return tmin;
  }
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  function eyeOf(id, y) { const m = meshes[id], u = unitById[id]; if (!m || !u) return null; return V3(m.group.position.x, y !== undefined ? y : (u.eyeY ? u.eyeY() : 1.5), m.group.position.z); }
  function fwdOf(id) { const yaw = meshes[id].group.rotation.y; return new THREE.Vector2(Math.cos(-(yaw - Math.PI / 2)), Math.sin(-(yaw - Math.PI / 2))); }
  function smoothDir(s, key, x, z, rate, dt) { if (!s[key] || !dt) s[key] = new THREE.Vector2(x, z); else s[key].lerp(new THREE.Vector2(x, z), 1 - Math.exp(-rate * dt)).normalize(); return s[key]; }
  function inMap(p, m) { const mp = battle.map; p.x = Math.max(m, Math.min(mp.width - m, p.x)); p.z = Math.max(m, Math.min(mp.depth - m, p.z)); return p; }
  // note d'un cadrage : -1 si la caméra est dans un obstacle, hors du terrain ou face à un mur ; sinon part des sujets visibles
  // (boîtes de la simulation ET décor dessiné : dans un mur, sous un toit, juste au-dessus d'un toit → -1 ; soft : le tireur
  // voit sa cible selon la simulation, on ne teste plus que le décor dessiné ; p : position réelle de la caméra si fournie)
  // (soft : la boîte d'un obstacle bas compte 0,35 m plus basse — le tireur tire par-dessus — mais une caisse, un local, un fourgon
  // entre la caméra et la cible la cachent toujours)
  function subjectSeen(p, e, soft) {
    for (const y of [e.y, e.y + 0.3]) { const q = V3(e.x, y, e.z); if ((OCC.use ? segFree(p, q, soft ? 0.35 : 0) > 0.995 : soft || segFree(p, q) > 0.995) && (!OCC.use || occRay(p, q, 0.45) >= 1)) return true; }   // tête ou haut du casque
    return false;
  }
  // le sujet est-il dans le cadre (marge de 6 %) pour une caméra en p qui vise look avec cette focale ?
  function inFrame(p, look, fov, e) {
    const fw = look.clone().sub(p).normalize(), rt = new THREE.Vector3(-fw.z, 0, fw.x).normalize(), up = new THREE.Vector3().crossVectors(rt, fw), d = V3(e.x, e.y + 0.15, e.z).sub(p);
    const z = d.dot(fw); if (z < 0.6) return false;
    const th = Math.tan(THREE.MathUtils.degToRad(fov / 2)) * 0.94, tw = th * (camera.aspect || 16 / 9);
    return Math.abs(d.dot(rt) / z) < tw && Math.abs(d.dot(up) / z) < th;
  }
  function shotQuality(f, at, soft, s) {
    const p = at || f.pos, mp = battle.map; occEnsure();
    if (p.y < 0.5 || inObstacle(p, 0.4) || p.x < 0.6 || p.z < 0.6 || p.x > mp.width - 0.6 || p.z > mp.depth - 0.6 || (OCC.use && (occBad(p) || dynBad(p, s)))) return -1;
    const L = p.distanceTo(f.look); if (Math.min(segFree(p, f.look), OCC.use ? occRay(p, f.look) : 1) * L < Math.min(3.5, L * 0.5)) return -1;
    if (!f.pts.length) return 1;
    let q = 0; for (const e of f.pts) if (e && subjectSeen(p, e, soft) && !(OCC.use && s && unitScreens(p, e, s)) && (!OCC.use || inFrame(p, f.look, f.fov, e))) q++;
    return q / f.pts.length;
  }
  // occultants mobiles : un autre soldat collé à l'objectif (son dos remplit l'image) ou entre la caméra et le sujet tout
  // près d'elle ; caméra dans un nuage de fumigène
  const subjIds = (s) => s ? [s.id, s.tid, s.kid, s.vid] : [];
  function dynBad(p, s) {
    const ids = subjIds(s);
    for (const u of battle.units) { const m = meshes[u.id]; if (!m || !m.group.visible || ids.includes(u.id)) continue; const P = m.group.position; if (p.y < 2.3 && Math.hypot(P.x - p.x, P.z - p.z) < 0.95) return 4; }
    for (const k of DIRECTOR.smokes) if (simTime < k.until && p.y < 4.5 && Math.hypot(k.x - p.x, k.z - p.z) < k.r + 1.2) return 5;
    return 0;
  }
  function unitScreens(p, e, s) {   // un autre soldat coupe le regard dans les 5 premiers mètres
    const ids = subjIds(s), dx = e.x - p.x, dz = e.z - p.z, L2 = dx * dx + dz * dz || 1;
    for (const u of battle.units) {
      const m = meshes[u.id]; if (!m || !m.group.visible || ids.includes(u.id)) continue; const P = m.group.position;
      const t = Math.max(0, Math.min(1, ((P.x - p.x) * dx + (P.z - p.z) * dz) / L2)); if (t * Math.sqrt(L2) > 5 || t > 0.9) continue;
      const y = p.y + (e.y - p.y) * t; if (y > (u.alive ? 1.85 : 0.5)) continue;
      if (Math.hypot(p.x + dx * t - P.x, p.z + dz * t - P.z) < 0.38) return true;
    }
    return false;
  }
  // encombrement du premier plan : part du cadre bouchée par du décor à moins de 2,5 m (grille de 4 × 3 rayons)
  function clutter(p, look, fov) {
    if (!OCC.g) return 0;
    const fw = look.clone().sub(p).normalize(), rt = new THREE.Vector3().crossVectors(fw, new THREE.Vector3(0, 1, 0)).normalize(), up = new THREE.Vector3().crossVectors(rt, fw);
    const th = Math.tan(THREE.MathUtils.degToRad(fov / 2)), tw = th * (camera.aspect || 16 / 9); let n = 0;
    for (const sx of [-0.75, -0.25, 0.25, 0.75]) for (const sy of [-0.6, 0, 0.6]) {
      const d = fw.clone().addScaledVector(rt, sx * tw).addScaledVector(up, sy * th).normalize(), q = p.clone().addScaledVector(d, 2.5);
      if (q.y > 0.35 && occRay(p, q) < 1) n++;
    }
    return n / 12;
  }
  // cadrage d'un plan à l'instant présent : position, point visé, sujets à garder visibles, focale, amortissement, pivot de perche
  function frameShot(s, dt) {
    const D = DIRECTOR, age = D.clock - s.t0, side = s.side || 1, tanH = Math.tan(THREE.MathUtils.degToRad(21)) * (camera.aspect || 16 / 9);
    if (s.kind === 'shoulder' || (s.kind === 'killcam' && s.view === 'killer')) {
      const kc = s.kind === 'killcam', id = kc ? s.kid : s.id, m = meshes[id], u = unitById[id];
      if (!m || !u || (!u.alive && !kc) || !fogShown(u)) return null;
      let tg = unitById[kc ? s.vid : s.tid];
      if (tg && !fogShown(tg)) { if (kc) return null; tg = null; }
      if (!kc && (!tg || !tg.alive) && !(tg && s.lock > D.clock)) { tg = u.target && u.target.alive && fogShown(u.target) ? u.target : null; s.tid = tg ? tg.id : null; }   // (s.lock : on reste sur la victime qui tombe)
      const P = m.group.position, T = tg && meshes[tg.id] ? meshes[tg.id].group.position : null;
      let f = T ? new THREE.Vector2(T.x - P.x, T.z - P.z) : fwdOf(id); if (f.lengthSq() < 0.01) f = fwdOf(id); f.normalize();
      const d = smoothDir(s, 'dir', f.x, f.y, 2.2, dt), fx = d.x, fz = d.y, rx = -fz * side, rz = fx * side;
      const dist = T ? Math.hypot(T.x - P.x, T.z - P.z) : 10, back = (s.back || 2.2) - Math.min(0.5, age * 0.09);   // lent travelling avant (variantes : plus court, plus haut)
      const pos = V3(P.x - fx * back + rx * 0.8, Math.max(1.45, (u.eyeY ? u.eyeY() : 1.55) + 0.38) + (s.lift || 0), P.z - fz * back + rz * 0.8);   // à hauteur des yeux du tireur (accroupi : plus bas)
      const tgt = T ? V3(T.x, kc || !tg.alive ? 0.8 : (tg.eyeY ? tg.eyeY() : 1.5) - 0.3, T.z) : V3(P.x + fx * 10, 1.3, P.z + fz * 10);
      // tireur au premier plan d'un côté, cible sur le tiers opposé : on vise un peu à côté de la cible
      const look = tgt.clone().add(V3(-rx * dist * 0.16, 0, -rz * dist * 0.16));
      const fov = kc ? 36 - Math.min(8, age * 3) : dist > 26 ? 32 : dist > 14 ? 38 : 44;
      return { pos, look, pts: T ? [V3(T.x, kc ? 0.9 : tgt.y + 0.25, T.z)] : [], soft: !kc && tg && u.visible && u.visible.has(tg.id), fov, st: kc ? 0.3 : 0.4, lst: 0.25, pivot: V3(P.x + rx * 0.3, 1.6, P.z + rz * 0.3) };
    }
    if (s.kind === 'duel') {
      const A = unitById[s.id], B = unitById[s.tid]; if (!A || !B || !A.alive || (!B.alive && !(s.lock > D.clock)) || !meshes[s.id] || !meshes[s.tid] || !fogShown(A) || !fogShown(B)) return null;
      const PA = meshes[s.id].group.position, PB = meshes[s.tid].group.position, L = Math.max(1, Math.hypot(PB.x - PA.x, PB.z - PA.z));
      const ux = (PB.x - PA.x) / L, uz = (PB.z - PA.z) / L, a = smoothDir(s, 'dir', -uz * side, ux * side, 1.2, dt), d = Math.max(4.5, L * 0.5 / (tanH * 0.62));
      if (d > 26) return null;
      const mx = (PA.x + PB.x) / 2 - ux * L * 0.18, mz = (PA.z + PB.z) / 2 - uz * L * 0.18;   // de trois-quarts, côté tireur
      const pos = V3(mx + a.x * d + ux * age * 0.1, 1.55 + d * 0.08 + (s.lift || 0), mz + a.y * d + uz * age * 0.1);
      const look = V3((PA.x + PB.x) / 2 + ux * L * 0.04, 1.15, (PA.z + PB.z) / 2 + uz * L * 0.04);
      return { pos, look, pts: [eyeOf(s.id), eyeOf(s.tid)], fov: 42, st: 0.6, lst: 0.45, pivot: V3((PA.x + PB.x) / 2, 1.5, (PA.z + PB.z) / 2) };
    }
    if (s.kind === 'dolly') {   // de profil, à ~3,8 m, caméra basse ; le soldat sur le tiers arrière, de l'espace devant lui
      const m = meshes[s.id], u = unitById[s.id]; if (!m || !u || !u.alive || !fogShown(u)) return null;
      const P = m.group.position, sp = Math.hypot(m.anim.vx || 0, m.anim.vz || 0);
      // espace devant le regard : vers sa cible s'il en a une (il peut reculer en tirant), sinon dans le sens de la marche
      const tg = u.target && u.target.alive && fogShown(u.target) && meshes[u.target.id] ? meshes[u.target.id].group.position : null, tl = tg ? Math.hypot(tg.x - P.x, tg.z - P.z) : 0;
      const f0 = tl > 0.5 ? new THREE.Vector2((tg.x - P.x) / tl, (tg.z - P.z) / tl) : sp > 0.2 ? new THREE.Vector2(m.anim.vx / sp, m.anim.vz / sp) : new THREE.Vector2(Math.cos(u.facing), Math.sin(u.facing));
      // demi-tour du soldat : la caméra reste de son côté (côté et sens inversés ensemble) au lieu de tourner autour de lui ou
      // de le traverser ; elle panote vers le nouvel espace devant lui
      if (dt && s.dir && s.dir.x * f0.x + s.dir.y * f0.y < -0.3) { s.side = -(s.side || 1); s.dir.set(f0.x, f0.y); }
      const sd = s.side || 1, dd = smoothDir(s, 'dir', f0.x, f0.y, 1.4, dt), dx = dd.x, dz = dd.y, ca = Math.cos(s.ang || 0), sa = Math.sin(s.ang || 0);
      const nx = (-dz * ca - dx * sa) * sd, nz = (dx * ca - dz * sa) * sd, R = s.dd || 3.8;   // côté, angle (trois-quarts arrière / avant), distance
      s.still = u.moving ? 0 : (s.still || 0) + (dt || 0);
      const pos = V3(P.x + nx * R - dx * 0.7, 1.25, P.z + nz * R - dz * 0.7), look = V3(P.x + dx * 2.1, 0.9, P.z + dz * 2.1);   // regard un peu bas : le soldat reste au-dessus des cartes du HUD
      return { pos, look, pts: [eyeOf(s.id)], fov: 46, st: 0.35, lst: 0.3, pivot: V3(P.x, 1.2, P.z) };
    }
    if (s.kind === 'overview' || s.kind === 'establish') {
      let list = s.kind === 'overview' && !s.squad ? engagedUnits(4) : shownUnits().filter(u => !s.squad || u.team === 0);
      if (list.length < 2) list = shownUnits(); if (!list.length) return null;
      const pts = list.map(u => V3(u.x, 0, u.z)); if (!pts.length) return null;   // positions de la simulation : avant « Lancer », les soldats 3D ne sont pas encore placés (sinon plan collé dans un coin de la carte)
      const c = centroid(pts); let r = 0; for (const p of pts) r = Math.max(r, Math.hypot(p.x - c.x, p.z - c.z));
      const sp = battle.map.spawns, ax0 = sp[1].x - sp[0].x, az0 = sp[1].z - sp[0].z, aL = Math.hypot(ax0, az0) || 1, ax = ax0 / aL, az = az0 / aL;   // axe du front (de nous vers eux)
      if (s.kind === 'establish') {   // grue haute derrière notre camp, qui descend doucement en regardant le terrain
        const a = Math.atan2(-az, -ax) + side * 0.55 + (s.yaw || 0) + age * 0.015 * side, d = 20;
        const pos = inMap(V3(c.x + Math.cos(a) * d, 0, c.z + Math.sin(a) * d), 1.2); pos.y = 19 - Math.min(4, age * 0.6);
        return { pos, look: V3(c.x + ax * 3, 0, c.z + az * 3), pts: pts.slice(0, 10).map(p => V3(p.x, 1.3, p.z)), fov: 50, st: 1.1, lst: 0.9, pivot: V3(c.x, 1.5, c.z), noBoom: true };   // (plan en hauteur : validé tel quel contre le décor, pas de perche depuis le centre — il peut tomber sous le toit de la station de lavage)
      }
      const a = Math.atan2(ax, -az) * 1 + (side < 0 ? Math.PI : 0) + (s.yaw || 0) + age * 0.02 * side, d = Math.max(11, Math.min(28, r * 1.1 + 8));
      const pos = inMap(V3(c.x + Math.cos(a) * d, 0, c.z + Math.sin(a) * d), 1); pos.y = 2 + d * 0.5;
      return { pos, look: V3(c.x, 0.8, c.z), pts: pts.slice(0, 6).map(p => V3(p.x, 1.4, p.z)), fov: 46, st: 0.9, lst: 0.7, pivot: V3(c.x, 1.5, c.z), noBoom: true };
    }
    if (s.kind === 'capture') {
      const Z = battle.zone; if (!Z) return null;
      const who = shownUnits().filter(u => u.state === 'capture' && meshes[u.id]).map(u => eyeOf(u.id));
      const a = (s.yaw || 0) + age * 0.04 * side, d = (Z.r || 4) + 7;
      return { pos: V3(Z.x + Math.cos(a) * d, s.h || 3.4, Z.z + Math.sin(a) * d), look: V3(Z.x, 0.6, Z.z), pts: who.slice(0, 3), fov: 48, st: 0.8, lst: 0.6, pivot: V3(Z.x, 1.5, Z.z) };
    }
    if (s.kind === 'killcam') {   // plan serré sur la victime, qui se resserre pendant la chute
      const m = meshes[s.vid]; if (!m || !fogShown(unitById[s.vid])) return null; const P = bodyPos(m), a = s.yaw || 0, d = (s.dd || 4.4) - Math.min(1.1, age * 0.35);   // (le corps réel : le pantin physique peut glisser loin de la position de la simulation)
      return { pos: V3(P.x + Math.cos(a) * d, 1.6 - Math.min(0.45, age * 0.15), P.z + Math.sin(a) * d), look: V3(P.x, 0.55, P.z), pts: [V3(P.x, Math.max(0.35, Math.min(0.9, P.y)), P.z)], fov: 40 - Math.min(6, age * 2), st: 0.3, lst: 0.2, pivot: V3(P.x, 1.2, P.z) };
    }
    if (s.kind === 'blast') {
      const a = (s.yaw || 0) + age * 0.18;
      return { pos: V3(s.x + Math.cos(a) * 9, 4.6, s.z + Math.sin(a) * 9), look: V3(s.x, 0.7, s.z), pts: [V3(s.x, 1, s.z)], fov: 48, st: 0.5, lst: 0.4, pivot: V3(s.x, 1.5, s.z) };
    }
    return null;
  }
  // évalue fn avec les soldats 3D avancés de k secondes à leur vitesse actuelle (positions remises aussitôt après)
  function inFuture(k, fn) {
    const saved = [];
    for (const id in meshes) { const m = meshes[id], a = m && m.anim; if (!a || !(a.vx || a.vz)) continue; const P = m.group.position; saved.push([P, P.x, P.z]); P.x += (a.vx || 0) * k; P.z += (a.vz || 0) * k; }
    try { return fn(); } finally { for (const [P, x, z] of saved) { P.x = x; P.z = z; } }
  }
  // meilleure variante (côté, angle) d'un plan ; null si aucune n'est assez dégagée
  function bestOf(list, bonus, min) {
    let best = null, bq = min === undefined ? 0.5 : min;
    for (const s of list) {
      s.t0 = DIRECTOR.clock - 1.6; const f2 = OCC.use ? frameShot(s, 0) : null;   // le même plan 1,6 s plus tard (grue qui descend, travelling, rotation)
      s.t0 = DIRECTOR.clock; const f = frameShot(s, 0); if (!f) continue;
      let q = shotQuality(f, null, false, s) + (bonus ? bonus(s) : 0);
      if (q >= 0 && f2 && shotQuality(f2, null, false, s) < 0) q -= 0.5;
      if (q > 0 && OCC.use && !f.noBoom) {   // et dans 1,2 s, les soldats ayant continué leur course : le sujet passe-t-il derrière un fourgon, un abri ?
        const q3 = inFuture(1.2, () => { const f3 = frameShot(s, 0); return f3 ? shotQuality(f3, null, false, s) : -1; });
        if (q3 < q - 0.4) q -= 0.4;
      }
      if (q > 0 && OCC.use && (s.kind === 'shoulder' || s.kind === 'duel')) {   // la cible qui s'accroupit derrière son couvert reste-t-elle visible ? (préférer ce côté, cette hauteur)
        const low = f.pts.filter(Boolean).map(e => V3(e.x, Math.min(e.y, 0.85), e.z));
        if (low.length && low.filter(e => subjectSeen(f.pos, e, false)).length / low.length < 0.5) q -= 0.2;
      }
      if (q >= 0 && OCC.use) q -= clutter(f.pos, f.look, f.fov) * 0.9;   // un mur, un bac ou une carrosserie qui remplit le premier plan
      if (q >= 0 && f.pos.y < 9 && !(f.noBoom && OCC.use)) { const c = clipBoom(f.pivot, f.pos); if (c.y - f.pos.y > 0.4 || c.distanceTo(f.pos) > 0.8) q -= 0.6; }   // la perche devrait se replier ou monter : cadrage dénaturé
      if (q > bq + 1e-6) { bq = q; best = s; }
    }
    return best;
  }
  function variants(s) {
    const out = [], sides = s.side ? [s.side] : [1, -1];
    const yaws = s.kind === 'capture' ? [0, 1.57, 3.14, 4.71] : s.kind === 'overview' || s.kind === 'establish' ? [0, 0.45, -0.45] : [0];
    for (const side of sides) for (const y of yaws) {
      if (s.kind === 'dolly') { for (const [ang, dd] of [[0, 3.8], [0.45, 3.4], [-0.45, 3.4], [0, 2.7]]) out.push(Object.assign({}, s, { side, ang, dd })); continue; }
      out.push(Object.assign({}, s, { side, yaw: (s.yaw || 0) + y }));
      // repli si le décor dessiné gêne : épaule plus courte ou plus haute, duel et zone vus de plus haut
      if (s.kind === 'shoulder') { out.push(Object.assign({}, s, { side, back: 1.5 }), Object.assign({}, s, { side, lift: 0.7 }), Object.assign({}, s, { side, lift: 1.4, back: 2.6 })); }   // (plus haut et plus en arrière : vue plongeante par-dessus le couvert de la cible)
      if (s.kind === 'duel') out.push(Object.assign({}, s, { side, lift: 1.6 }));
      if (s.kind === 'capture') out.push(Object.assign({}, s, { side, yaw: (s.yaw || 0) + y, h: 5.4 }));
    }
    return out;
  }
  // position du corps affiché (bassin), pas celle du groupe : après une chute physique le corps peut être à plusieurs mètres
  const _bp = new THREE.Vector3();
  function bodyPos(m) {
    if (m._hips === undefined) { m._hips = null; m.group.traverse(o => { if (!m._hips && o.isBone && /Hips$/.test(o.name)) m._hips = o; }); }
    if (!m._hips) return _bp.copy(m.group.position).setY(0.9);
    m._hips.getWorldPosition(_bp); return _bp;
  }
  function eventShot(ev) {
    if (ev.kind === 'down') {
      let v = null, bd = 0.6; for (const u of battle.units) { const d = Math.hypot(u.x - ev.x, u.z - ev.z); if (d < bd) { bd = d; v = u; } }
      if (!v || !meshes[v.id] || !fogShown(v)) return null;
      const k = v.lastShotBy && battle.t - v.lastShotByAt < 2 && meshes[v.lastShotBy.id] && fogShown(v.lastShotBy) ? v.lastShotBy : null, opts = [];
      if (k && Math.hypot(k.x - v.x, k.z - v.z) < 32) for (const side of [1, -1]) opts.push({ kind: 'killcam', view: 'killer', kid: k.id, vid: v.id, id: v.id, side, dur: 3.2 });
      const a0 = k ? Math.atan2(k.z - v.z, k.x - v.x) : Math.random() * 6.28;
      for (let i = 0; i < 6; i++) opts.push({ kind: 'killcam', view: 'victim', vid: v.id, id: v.id, side: 1, yaw: a0 + [0, 0.6, -0.6, 1.2, -1.2, Math.PI][i], dur: 3 });
      for (let i = 0; i < 6; i++) opts.push({ kind: 'killcam', view: 'victim', vid: v.id, id: v.id, side: 1, yaw: a0 + [0, 0.6, -0.6, 1.2, -1.2, Math.PI][i], dd: 3.1, dur: 3 });   // plus près (ruelle, recoins)
      return bestOf(opts, (o) => o.view === 'killer' ? 0.05 : 0);
    }
    if (ev.kind === 'blast') { const opts = []; for (let i = 0; i < 6; i++) opts.push({ kind: 'blast', x: ev.x, z: ev.z, side: 1, yaw: i * Math.PI / 3, dur: 2.8 }); return bestOf(opts); }
    return null;
  }
  function directorCamera() {
    const D = DIRECTOR, dt = dirTick();
    if (D.battle !== battle) { D.battle = battle; D.smokes = []; D.t0 = D.clock; D.lastWide = -99; D.hist.length = 0; D.pending = null; cam.shot = null; }
    let s = cam.shot && typeof cam.shot === 'object' ? cam.shot : null;
    if (s && s.t0 === undefined) { s.t0 = D.clock; s.forced = true; s.dur = 1e9; s.fresh = true; }   // plan imposé (API.camShot)
    let next = null;
    // 1) événement : neutralisation → kill-cam ; explosion → plan en hauteur (pas deux plans d'événement coup sur coup)
    const ev = D.pending; D.pending = null;
    if (ev && !(s && s.forced) && simTime - ev.at < 1.5) {
      const age = s ? D.clock - s.t0 : 99, evShot = s && (s.kind === 'killcam' || s.kind === 'blast');
      // déjà à l'image (dans le cadre, proche, non masqué) : pas de coupe, on prolonge le plan et on reste sur la victime
      const P = V3(ev.x, 1, ev.z); camera.updateMatrixWorld(); const v = P.clone().project(camera);
      const seenNow = s && s.kind !== 'establish' && v.z < 1 && Math.abs(v.x) < 0.8 && Math.abs(v.y) < 0.8 && camera.position.distanceTo(P) < 26 && segFree(camera.position, P) > 0.99 && occRay(camera.position, P, 0.45) >= 1;
      if (seenNow) { s.dur = Math.max(s.dur, age + 2.5); s.lock = D.clock + 2.5; }
      else if (!(evShot && age < 2.6) && !(ev.kind === 'blast' && age < 1.5)) { next = eventShot(ev); D.why = ev.kind; }
    }
    // 2) plan courant : fini, sujet perdu, sujet masqué trop longtemps, soldat arrêté, ou plan d'ensemble pendant l'action
    let f = !next && s ? frameShot(s, dt) : null;
    if (!next && !(s && s.forced)) {
      const age = s ? D.clock - s.t0 : 99;
      // jugé depuis la position RÉELLE de la caméra (soft : le tireur voit sa cible selon la simulation ; le décor dessiné compte toujours)
      if (f) { const q = shotQuality(cam.init ? Object.assign({}, f, { look: cam.look }) : f, cam.init ? cam.pos : null, f.soft, s); D.masked = q < 0.5 ? D.masked + dt : 0; D.gone = q <= 0 && f.pts.length ? (D.gone || 0) + dt : 0; D.bad = q < 0 ? (D.bad || 0) + dt : 0; }
      // (sujet entièrement caché — la grue n'a pas suffi — : on change de plan dès 0,5 s, passé 2,5 s de plan)
      const need = !s ? 'debut' : !f ? 'perdu' : age > s.dur ? 'fin' : (D.bad > 0.2 && age > 0.4) ? 'decor' : ((D.masked > 1.2 || D.gone > 0.5) && age > 2.5) ? 'masque' : (s.kind === 'dolly' && s.still > 1.2 && age > D.minHold) ? 'arret' : (s.kind === 'establish' && D.hist.length > 1 && engagedUnits(1).length && age > D.minHold) ? 'action' : '';
      if (need) {
        D.why = need;
        for (const c of pickShot()) { next = bestOf(variants(c)); if (next) break; }
        if (!next) next = bestOf(variants({ kind: 'establish', dur: 5 }), null, -0.5);
      }
    }
    if (next) {   // coupe
      next.t0 = D.clock; cam.shot = s = next; D.masked = 0; D.bad = 0; D.gone = 0;
      D.hist.push({ id: next.id, kind: next.kind, at: D.clock }); if (D.hist.length > 16) D.hist.shift();
      if (D.log) D.log.push([+simTime.toFixed(1), next.kind, D.why]);
      if (next.kind === 'establish' || next.kind === 'overview') D.lastWide = D.clock;
      f = frameShot(s, 0);
    }
    if (!f) { if (s && s.forced) { cam.shot = null; } return; }
    // 3) mouvement : coupe franche au changement de plan (sauf si le nouveau cadre est tout proche : on glisse), puis ressort
    const want = dodge(f.noBoom && OCC.use ? f.pos.clone() : clipBoom(f.pivot, f.pos), f, s);
    const jump = !cam.init || (next || s.fresh) && (cam.pos.distanceTo(want) > 4 || cam.look.clone().sub(cam.pos).normalize().dot(f.look.clone().sub(want).normalize()) < 0.87);
    s.fresh = false;
    const lookW = frameGuard(jump ? want : cam.pos, f);   // le sujet reste dans le cadre, vu de là où est vraiment la caméra
    if (jump) { cam.pos.copy(want); cam.look.copy(lookW); D.vel.set(0, 0, 0); D.lvel.set(0, 0, 0); D.fov = f.fov; D.fvel = 0; cam.init = true; }
    else {
      damp3(cam.pos, want, D.vel, f.st, dt); damp3(cam.look, lookW, D.lvel, f.lst, dt);
      const w = 2 / 0.6, x = w * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x), c = D.fov - f.fov, tmp = (D.fvel + w * c) * dt; D.fvel = (D.fvel - w * tmp) * e; D.fov = f.fov + (c + tmp) * e;
    }
    pushOut(cam.pos, 0.2);   // même pendant le lissage, jamais dans un obstacle : on glisse le long de sa face la plus proche
    if (OCC.use && !f.noBoom && cam.pos.y < 3) for (const e of f.pts) {   // ni collée au sujet (il marche vers l'objectif) : repoussée à 1,4 m, en continu
      if (!e) continue; const dx = cam.pos.x - e.x, dz = cam.pos.z - e.z, d = Math.hypot(dx, dz);
      if (d < 1.4 && d > 1e-3) { const q = V3(e.x + dx / d * 1.4, cam.pos.y, e.z + dz / d * 1.4); if (!inObstacle(q, 0.2) && !occBad(q)) cam.pos.copy(q); }
    }
    if (cam.pos.y < 9) inMap(cam.pos, 0.4);
    cam.pos.y = Math.max(0.35, cam.pos.y);
    camera.position.copy(cam.pos); camera.lookAt(cam.look); setFov(D.fov);
    cam.target.set(f.pivot.x, 0, f.pivot.z);
    D.lastF = f; if (D.mon) dirMonitor(D.mon, camera.position, f, s, next ? D.why : null);
  }
  // pendant un plan, les sujets bougent : si la place voulue touche le décor dessiné (contre un objet, sous un auvent, regard
  // bouché), on cherche tout près une place dégagée (un peu plus haut, un peu plus près du sujet) ; le ressort y glisse
  // Sujet masqué (un fourgon, un local, un arbre passe entre la caméra et lui) : la caméra monte doucement par-dessus, comme une
  // grue, et ne redescend qu'après 1,5 s de vue dégagée (pas de va-et-vient) ; s.dl : hauteur ajoutée en cours.
  // Cadre de sécurité : si un sujet sort du cadre (la caméra suit avec retard, le soldat change de direction), le point visé
  // pivote juste assez (de la caméra) pour le garder à 72 % du bord ; le ressort du regard rend le mouvement doux.
  function frameGuard(p, f) {
    const pts = (f.pts || []).filter(Boolean); if (!OCC.use || f.noBoom || !pts.length) return f.look;
    const look = f.look.clone(), th = Math.tan(THREE.MathUtils.degToRad(f.fov / 2)), tw = th * (camera.aspect || 16 / 9), limH = Math.atan(0.72 * tw), limV = Math.atan(0.7 * th);
    for (let it = 0; it < 2; it++) for (const e of pts) {
      const vx = look.x - p.x, vz = look.z - p.z, dist = Math.hypot(vx, vz); if (dist < 0.3) return f.look;
      const wx = e.x - p.x, wz = e.z - p.z, hd = Math.hypot(wx, wz); if (hd < 0.5) continue;
      const aL = Math.atan2(vz, vx); let da = Math.atan2(wz, wx) - aL; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      if (Math.abs(da) > limH) { const a = aL + da - Math.sign(da) * limH; look.x = p.x + Math.cos(a) * dist; look.z = p.z + Math.sin(a) * dist; }
      const pL = Math.atan2(look.y - p.y, dist), dp = Math.atan2(e.y + 0.1 - p.y, hd) - pL;
      if (Math.abs(dp) > limV) look.y = p.y + Math.tan(pL + dp - Math.sign(dp) * limV) * dist;
    }
    return look;
  }
  function dodge(want, f, s) {
    if (!OCC.use || !OCC.g) return want;
    const near = (p) => !f.noBoom && (f.pts || []).some(e => e && Math.hypot(e.x - p.x, e.z - p.z) < 1.5);   // jamais collée au sujet
    const ok = (p) => { if (occBad(p) || dynBad(p, s) || inObstacle(p, 0.3) || near(p)) return false; const L = p.distanceTo(f.look); return occRay(p, f.look) * L >= Math.min(3.5, L * 0.5); };
    const pts = (f.pts || []).filter(Boolean), need = f.noBoom ? 0.5 : pts.length > 1 ? 0.5 : 1;
    const vis = (p) => { if (!pts.length) return true; let n = 0; for (const e of pts) if (subjectSeen(p, e, false) && !unitScreens(p, e, s)) n++; return n / pts.length >= need - 1e-6; };
    const good = (p) => ok(p) && vis(p), up = (h) => V3(want.x, want.y + h, want.z), D = DIRECTOR;
    if (s) {
      const dl = s.dl || 0, maxUp = f.noBoom ? 4 : 2.6;
      if (dl > 0) {   // déjà relevée : on redescend par paliers quand c'est dégagé plus bas depuis 1,5 s
        const lower = Math.max(0, dl - 0.7);
        if (good(up(lower))) { if (D.clock - (s.dlT || 0) > 1.5) { s.dl = lower; s.dlT = D.clock; return up(lower); } }
        else s.dlT = D.clock;
        if (good(up(dl))) return up(dl);
      } else if (good(want)) return want;
      for (const h of [0.7, 1.4, 2.1, 2.6, 3.3, 4]) { if (h <= dl || h > maxUp) continue; if (good(up(h))) { s.dl = h; s.dlT = D.clock; return up(h); } }
      if (dl > 0 && ok(up(dl))) return up(dl);
    }
    if (ok(want)) return want;
    const P = f.noBoom ? f.look : f.pivot, tries = f.noBoom ? [[1, 1.5], [1, 3], [0.85, 0], [0.85, 2]] : [[1, 0.6], [1, 1.2], [0.8, 0], [0.8, 0.6], [0.62, 0], [0.62, 0.8], [1.3, 0], [1.3, 0.6]];
    for (const [k, up] of tries) { const q = V3(P.x + (want.x - P.x) * k, want.y + up, P.z + (want.z - P.z) * k); if (ok(q)) return q; }
    return want;
  }
  // relevé plan par plan (mesure) : part des sujets visibles, caméra dans / sous / sur le décor, regard bouché
  function dirMonitor(R, p, f, s, why) {
    if (!R.cur || why !== null || R.cur.s !== s) {
      if (R.cur) dirShotEnd(R);
      R.cur = { s, kind: s.kind, why: why || '', t: +simTime.toFixed(1), n: 0, vis: 0, bad: 0, blocked: 0, sim: 0 };
    }
    const c = R.cur; c.n++;
    const b = occBad(p) || dynBad(p, s); if (b) { c.bad++; R.badKinds[b] = (R.badKinds[b] || 0) + 1; }
    if (inObstacle(p, 0)) c.sim++;
    const pts = (f.pts || []).filter(Boolean); let seen = 0;
    for (const e of pts) if ((occRay(p, e, 0.45) >= 1 || occRay(p, V3(e.x, e.y + 0.3, e.z), 0.45) >= 1) && !unitScreens(p, e, s)) seen++;
    c.vis += pts.length ? seen / pts.length : 1; if (pts.length && seen < pts.length) c.blocked++;
    const L = p.distanceTo(f.look); if (occRay(p, f.look) * L < Math.min(3.5, L * 0.5)) c.wall = (c.wall || 0) + 1;
  }
  function dirShotEnd(R) {
    const c = R.cur; if (!c || !c.n) return; R.cur = null;
    const e = { t: c.t, kind: c.kind, why: c.why, n: c.n, vis: +(c.vis / c.n).toFixed(2), bad: +(c.bad / c.n).toFixed(2), blocked: +(c.blocked / c.n).toFixed(2), wall: +((c.wall || 0) / c.n).toFixed(2), sim: c.sim };
    e.ko = e.vis < (c.kind === 'establish' || c.kind === 'overview' ? 0.5 : 0.7) || e.bad > 0.1 || e.wall > 0.1 || c.sim > 0;   // plan large : la moitié des soldats suffit
    R.shots.push(e);
  }
  function dirReport(R) {
    if (R.cur) dirShotEnd(R);
    const sh = R.shots, n = sh.length || 1;
    const fr = (k) => +(sh.reduce((a, e) => a + e[k] * e.n, 0) / Math.max(1, sh.reduce((a, e) => a + e.n, 0))).toFixed(3);
    return { shots: sh.length, ko: sh.filter(e => e.ko).length, fBad: fr('bad'), fWall: fr('wall'), fBlocked: fr('blocked'), fVis: fr('vis'), meanVis: +(sh.reduce((a, e) => a + e.vis, 0) / n).toFixed(3), badFrames: sh.reduce((a, e) => a + e.bad * e.n, 0) | 0, frames: sh.reduce((a, e) => a + e.n, 0), badKinds: R.badKinds, worst: sh.filter(e => e.ko).slice(0, 12), occMs: OCC.ms };
  }
  // Mesure du réalisateur (sans rendu) : n pas de simulation, 3 images par pas ; nombre de coupes, durée des plans,
  // caméra dans un obstacle, sujet masqué, à-coups (accélération de la caméra hors coupes).
  function directorTrace(n, probe) {   // probe(camera, plan, cadrage, simTime) : mesure externe (rayons contre le décor dessiné), après chaque pas
    setCamMode('director'); const R = { cuts: 0, holds: [], kinds: {}, frames: 0, inside: 0, hidden: 0, maxStep: 0, jerk: 0 }; DIRECTOR.log = R.log = [];
    const keepMon = DIRECTOR.mon; DIRECTOR.mon = keepMon || { shots: [], badKinds: {} };   // relevé plan par plan contre le décor dessiné
    let ref = cam.shot, tCut = simTime, p0 = camera.position.clone(), v0 = new THREE.Vector3(), nf = 0;
    for (let i = 0; i < n && !battle.over; i++) {
      stepSim();
      for (let k = 1; k <= 3; k++) {
        acc = DT * k / 3; syncMeshes(k / 3); frameDt = DT / 3; updateFx(); applyCamera(); R.frames++;   // (effets vieillis comme en temps réel)
        const p = camera.position.clone(), v = p.clone().sub(p0), cut = cam.shot !== ref || v.length() > 2.5;
        if (cut) { const kind = typeof ref === 'object' && ref ? ref.kind : String(ref); R.cuts++; R.holds.push(+(simTime - tCut).toFixed(1)); R.kinds[kind] = (R.kinds[kind] || 0) + 1; ref = cam.shot; tCut = simTime; v0.set(0, 0, 0); }
        else { R.maxStep = Math.max(R.maxStep, v.length()); if (v.length() > 0.6) (R.big = R.big || []).push([+simTime.toFixed(1), cam.shot && cam.shot.kind, +v.length().toFixed(2)]); if (nf++) R.jerk += v.clone().sub(v0).length(); v0.copy(v); }
        for (const o of battle.map.obstacles) if (p.y < o.h && p.x > o.x && p.x < o.x + o.w && p.z > o.z && p.z < o.z + o.d) { R.inside++; break; }
        const s = cam.shot && typeof cam.shot === 'object' ? cam.shot : null, su = s && s.id && meshes[s.id];
        if (su && segFree(p, V3(su.group.position.x, 1.3, su.group.position.z)) < 0.97) { R.hidden++; (R.hiddenBy = R.hiddenBy || {})[s.kind] = (R.hiddenBy[s.kind] || 0) + 1; }
        p0.copy(p);
        if (probe && k === 3) probe(camera, s, DIRECTOR.lastF, simTime);
      }
    }
    const h = R.holds.slice(1); R.meanHold = +(h.reduce((a, b) => a + b, 0) / (h.length || 1)).toFixed(2); R.minHold = Math.min(...h); R.short = h.filter(x => x < 3).length;
    R.jerk = +(R.jerk / Math.max(1, nf)).toFixed(4); R.maxStep = +R.maxStep.toFixed(3); R.t = battle.t; DIRECTOR.log = null;
    if (!keepMon) { R.decor = dirReport(DIRECTOR.mon); DIRECTOR.mon = null; }
    return R;
  }
  function applyCamera() {
    if (finale || briefing || cam.mode !== 'director') setFov(50);   // la focale varie seulement avec le réalisateur
    if (finale) {
      const t = performance.now() / 1000 - finale.t0, a = finale.a0 + Math.sin(t * 0.35) * 0.35, d = 7 - Math.min(2, t * 0.6);   // va-et-vient dans le secteur dégagé
      camera.position.set(finale.x + Math.cos(a) * d, 2.4 + Math.min(1, t * 0.3), finale.z + Math.sin(a) * d); camera.lookAt(finale.x, 0.5, finale.z); return;
    }
    if (briefing) {   // survol lent de la carte pendant le briefing
      const t = performance.now() / 1000 - briefing.t0, a = briefing.a0 + t * 0.1, cx = battle.map.width / 2, cz = battle.map.depth / 2;
      camera.position.set(cx + Math.cos(a) * (battle.map.width * 0.75), 30 + Math.sin(t * 0.2) * 3, cz + Math.sin(a) * (battle.map.depth * 0.95)); camera.lookAt(cx, 0, cz); return;
    }
    if (cam.mode === 'director') { directorCamera(); return; }
    if (cam.mode === 'follow') {
      let id = cam.follow;
      if (!id || !unitById[id] || !unitById[id].alive || !fogShown(unitById[id])) { if (!cam.autoFollow || simTime > cam.autoUntil || !unitById[cam.autoFollow] || !unitById[cam.autoFollow].alive || !fogShown(unitById[cam.autoFollow])) { cam.autoFollow = pickAutoFollow(); cam.autoUntil = simTime + 6; } id = cam.autoFollow; }
      const m = id && meshes[id], u = id && unitById[id];
      if (m && u) {
        const yaw = m.group.rotation.y; // orientation du soldat (rotation.y = -facing + π/2)
        const fx = Math.cos(-(yaw - Math.PI / 2)), fz = Math.sin(-(yaw - Math.PI / 2));
        const px = m.group.position.x, pz = m.group.position.z;
        const pivot = new THREE.Vector3(px, 1.6, pz);
        const want = clipBoom(pivot, new THREE.Vector3(px - fx * 4.4 - fz * 0.5, 2.4, pz - fz * 4.4 + fx * 0.5), true), look = new THREE.Vector3(px + fx * 7, 1.1, pz + fz * 7);
        const dt = dirTick();   // ressort critique indépendant de la cadence d'images (plus d'à-coups quand la perche se replie)
        if (!cam.init) { cam.pos.copy(want); cam.look.copy(look); DIRECTOR.vel.set(0, 0, 0); DIRECTOR.lvel.set(0, 0, 0); cam.init = true; }
        damp3(cam.pos, want, DIRECTOR.vel, 0.4, dt); damp3(cam.look, look, DIRECTOR.lvel, 0.28, dt);
        pushOut(cam.pos, 0.2);   // même pendant le lissage, jamais dans un obstacle
        camera.position.copy(cam.pos); camera.lookAt(cam.look);
        cam.target.set(px, 0, pz);
        return;
      }
    }
    if (cam.mode === 'sat') {
      const map = battle.map; const want = new THREE.Vector3(map.width / 2, 78, map.depth / 2 + 22), look = new THREE.Vector3(map.width / 2, 0, map.depth / 2);
      if (!cam.init) { cam.pos.copy(want); cam.look.copy(look); cam.init = true; }
      cam.pos.lerp(want, 0.08); cam.look.lerp(look, 0.08); camera.position.copy(cam.pos); camera.lookAt(cam.look); return;
    }
    // libre (orbite)
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const want = new THREE.Vector3(cam.target.x + cam.dist * cp * Math.cos(cam.yaw), cam.target.y + cam.dist * sp, cam.target.z + cam.dist * cp * Math.sin(cam.yaw));
    if (!cam.init) { cam.pos.copy(want); cam.look.copy(cam.target); cam.init = true; }
    cam.pos.lerp(want, 0.2); cam.look.lerp(cam.target, 0.2);
    camera.position.copy(cam.pos); camera.lookAt(cam.look);
  }
  function setCamMode(mode) { finale = null; cam.mode = mode; cam.shot = null; cam.init = false; if (mode === 'director') DIRECTOR.battle = null; document.querySelectorAll('[data-cam]').forEach(b => b.classList.toggle('on', b.dataset.cam === mode)); if (mode === 'free') { cam.target.set(battle.map.width / 2, 0, battle.map.depth / 2); cam.dist = 60; } }
  (function cameraControls() {
    let drag = null;
    // Souris (20/10, demande de l'utilisateur, façon jeu de stratégie) :
    //  · gauche : clic sur un opérateur = le choisir (Maj : en ajouter / retirer), clic sur le sol = « Tous » ;
    //    gauche maintenu + glisser = rectangle de sélection (Maj : ajoute) ;
    //  · droit : clic court = l'escouade choisie y va avec les derniers choix (déplacement + arrivée) ;
    //    droit maintenu = liste d'ordres, on descend pour choisir, on lâche pour valider (ordHold*) ; Maj + clic droit : point de passage ;
    //  · milieu maintenu + glisser = tourner la vue (Maj : déplacer la vue) ; molette : zoom.
    canvas.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });   // pas de défilement automatique du navigateur
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 1) e.preventDefault();
      drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, b: e.button, shift: e.shiftKey }; canvas.setPointerCapture(e.pointerId);
      if (e.button === 2 && !e.shiftKey) ordHoldStart(e.clientX, e.clientY);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
      drag.m = (drag.m || 0) + Math.abs(dx) + Math.abs(dy);
      if (drag.b === 2) { ordHoldMove(e.clientX, e.clientY); return; }   // clic droit : ordres, jamais la caméra
      if (drag.b === 0) { if (drag.m >= 5) selBoxDraw(drag.x0, drag.y0, e.clientX, e.clientY); return; }   // clic gauche : sélection
      if (drag.b !== 1) return;
      if (cam.mode !== 'free') { if (Math.abs(dx) + Math.abs(dy) > 3) { setCamMode('free'); cam.yaw = Math.atan2(camera.position.z - cam.target.z, camera.position.x - cam.target.x); cam.pitch = Math.max(0.15, Math.min(1.5, Math.atan2(camera.position.y, Math.hypot(camera.position.x - cam.target.x, camera.position.z - cam.target.z)))); cam.dist = camera.position.distanceTo(cam.target); } return; }
      if (drag.shift || e.shiftKey) {
        cam.follow = null;
        const right = new THREE.Vector3(Math.cos(cam.yaw + Math.PI / 2), 0, Math.sin(cam.yaw + Math.PI / 2));
        const fwd = new THREE.Vector3(-Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
        cam.target.addScaledVector(right, dx * cam.dist * 0.0015).addScaledVector(fwd, -dy * cam.dist * 0.0015);
      } else { cam.yaw += dx * 0.005; cam.pitch = Math.max(0.15, Math.min(1.5, cam.pitch + dy * 0.005)); }
      if (MANUAL) render();
    });
    canvas.addEventListener('pointerup', (e) => {
      const d = drag; drag = null; if (!d || e.button !== d.b) return;
      if (d.b === 2) { if (d.shift) { if ((d.m || 0) < 5) ordAddVia(e.clientX, e.clientY); } else ordHoldEnd(e.clientX, e.clientY); return; }
      if (d.b === 0) {
        if ((d.m || 0) >= 5) { selBoxEnd(d.x0, d.y0, e.clientX, e.clientY, d.shift || e.shiftKey); return; }
        if (ordOrient) { ordOrientClick(e.clientX, e.clientY); return; }
        selClick(e.clientX, e.clientY, d.shift || e.shiftKey);
      }
    });
    canvas.addEventListener('pointercancel', () => { if (drag && drag.b === 2) ordHoldCancel(); selBoxHide(); drag = null; });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (cam.mode !== 'free') return; cam.dist = Math.max(8, Math.min(140, cam.dist * (1 + Math.sign(e.deltaY) * 0.1))); if (MANUAL) render(); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  })();

  // lumières
  const hemi = new THREE.HemisphereLight(0xb8c8d8, 0x3a3630, 1.15); scene.add(hemi);
  // Liseré de lune sur les soldats (la nuit seulement) : un léger reflet froid sur les bords de la silhouette (Fresnel), qui
  // détache un uniforme sombre d'une carrosserie ou d'un mur sombres sans éclairer la scène. Ajouté aux matériaux des
  // soldats (en plus de leur teinte d'uniforme) ; intensité commune, 0 le jour.
  // Liseré calculé sur la normale interpolée des sommets (pas la carte de relief), à pente douce, plus fort du côté de la lune,
  // éteint sur les arêtes vives (là où la normale tourne d'un pixel à l'autre : bords de poches, sangles → c'étaient les
  // pointillés), sans aucune modulation par la texture. uRimF : lumière froide enveloppée venant de la lune, lisse.
  const RIM = { k: { value: 0 }, f: { value: 0 }, c: { value: new THREE.Color(0.55, 0.68, 1.0) }, d: { value: new THREE.Vector3(-0.42, 0.58, 0.7).normalize() }, nuit: 0.13, fond: 0.035 };
  function rimPatch(root) {
    root.traverse(o => {
      if (!o.isMesh || !o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!m || !m.isMeshStandardMaterial || m.userData.rim) continue; m.userData.rim = true;
        const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
        m.onBeforeCompile = function (sh, r) {
          if (prev) prev.call(this, sh, r);
          sh.uniforms.uRimK = RIM.k; sh.uniforms.uRimF = RIM.f; sh.uniforms.uRimC = RIM.c; sh.uniforms.uRimD = RIM.d;
          sh.fragmentShader = 'uniform float uRimK, uRimF; uniform vec3 uRimC, uRimD;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `
            { vec3 rN = normalize(nonPerturbedNormal), rV = normalize(vViewPosition), rL = normalize((viewMatrix * vec4(uRimD, 0.0)).xyz);
              float rF = smoothstep(0.3, 0.95, 1.0 - saturate(dot(rN, rV))), rS = 0.3 + 0.7 * saturate(dot(rN, rL) * 0.5 + 0.5);
              rF *= 1.0 - smoothstep(0.12, 0.45, length(fwidth(rN)));   // arêtes vives (bords de poches, sangles) : pas de pointillés
              float rW = saturate((dot(rN, rL) + 0.4) / 1.4);   // côté lune, éclairage enveloppé et lisse
              outgoingLight += uRimC * (uRimK * rF * rF * rS + uRimF * (0.25 + 0.75 * rW * rW)); }
            #include <opaque_fragment>`);
        };
        m.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + '|rim'; };
        m.needsUpdate = true;
      }
    });
  }
  const sun = new THREE.DirectionalLight(0xffe9c4, 2.2);
  sun.position.set(40, 60, 10); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -45; sun.shadow.camera.right = 45; sun.shadow.camera.top = 35; sun.shadow.camera.bottom = -35; sun.shadow.camera.far = 160; sun.shadow.bias = -0.0008;
  scene.add(sun); scene.add(sun.target);
  // rendu haut de gamme (rendu.js) : ciel physique, environnement, ombres serrées, post-traitement
  const RENDU = OT.Rendu ? OT.Rendu.create(renderer, scene, camera, sun, hemi) : null;
  const EFX = OT.Effets ? OT.Effets.create(scene) : null;   // effets de combat (effets.js)

  // ---- Conditions (jour, nuit, brouillard, pluie) : lumière, brouillard de distance, pluie ; effets de jeu dans engine.js ----
  const LOOK = {
    jour:       { hemi: [0xdce6ee, 0x6a6052, 1.3], sun: [0xfff0d4, 2.7], fog: [0xc9d1d5, 80, 280], bg: 0xbfcad2, dome: true },
    nuit:       { hemi: [0x40507a, 0x14161c, 0.42], sun: [0x8fa6ff, 0.7], fog: [0x06080d, 35, 120], bg: 0x05070b, dome: false },
    brouillard: { hemi: [0xc0c6cc, 0x4a4844, 1.0], sun: [0xe8ecf0, 0.9], fog: [0x8b9198, 22, 95], bg: 0x8b9198, dome: false },
    pluie:      { hemi: [0x9aa6b4, 0x2e3034, 0.8], sun: [0xc8d0dc, 0.9], fog: [0x3a4149, 40, 140], bg: 0x2a3036, dome: false },
  };
  let rain = null, lamps = null, steam = null;
  // décor vivant : lampadaires allumés de nuit (lumières ponctuelles chaudes), vapeur au-dessus des cuves de la raffinerie
  function buildLamps(on) {
    if (lamps) { scene.remove(lamps); lamps.traverse(o => { if (o.geometry) o.geometry.dispose(); }); lamps = null; }
    if (!on || !battle) return;
    lamps = new THREE.Group(); const W = battle.map.width, D = battle.map.depth;
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.6, metalness: 0.5 }), bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
    const spots = [[2, 2], [W - 2, 2], [2, D - 2], [W - 2, D - 2], [W / 2, 1.2], [W / 2, D - 1.2]];
    for (const [x, z] of spots) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6, 6), poleMat); pole.position.set(x, 3, z); lamps.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), bulbMat); bulb.position.set(x, 6.05, z); lamps.add(bulb);
      const l = new THREE.PointLight(0xffc27a, 70, 26, 1.3); l.position.set(x, 5.8, z); lamps.add(l);
    }
    scene.add(lamps);
  }
  function buildSteam() {
    if (steam) { scene.remove(steam.obj); steam.obj.geometry.dispose(); steam = null; }
    if (!battle || battle.map.id !== 'raffinerie') return;
    const src = battle.map.obstacles.filter(o => /^cuve/.test(o.name || '')).slice(0, 4); if (!src.length) return;
    const N = 160, pos = new Float32Array(N * 3), life = new Float32Array(N), base = [];
    for (let i = 0; i < N; i++) { const o = src[i % src.length]; base.push([o.x + o.w / 2, o.h, o.z + o.d / 2]); life[i] = Math.random(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const c = document.createElement('canvas'); c.width = c.height = 64; const cg = c.getContext('2d'); const gr = cg.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); cg.fillStyle = gr; cg.fillRect(0, 0, 64, 64);
    const obj = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xd8dde2, size: 2.2, map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.22, depthWrite: false })); obj.frustumCulled = false; scene.add(obj);
    steam = { obj, base, life };
  }
  function updateSteam(dt) {
    if (!steam) return; const a = steam.obj.geometry.attributes.position.array;
    for (let i = 0; i < steam.life.length; i++) { steam.life[i] = (steam.life[i] + dt * 0.12) % 1; const k = steam.life[i], b = steam.base[i]; a[i * 3] = b[0] + Math.sin(i * 1.7 + k * 3) * 0.6 + k * 2.5; a[i * 3 + 1] = b[1] + 0.3 + k * 7; a[i * 3 + 2] = b[2] + Math.cos(i * 2.3) * 0.6; }
    steam.obj.geometry.attributes.position.needsUpdate = true;
  }
  let condNow = 'jour';
  function applyConditions(id) {
    condNow = id || 'jour';
    const L = LOOK[id] || LOOK.jour;
    hemi.color.setHex(L.hemi[0]); hemi.groundColor.setHex(L.hemi[1]); hemi.intensity = L.hemi[2];
    if (RENDU) { if (battle) RENDU.setCenter(battle.map.width / 2, battle.map.depth / 2); RENDU.setConditions(id || 'jour'); }
    else {
      sun.color.setHex(L.sun[0]); sun.intensity = L.sun[1];
      scene.fog.color.setHex(L.fog[0]); scene.fog.near = L.fog[1]; scene.fog.far = L.fog[2]; scene.background.setHex(L.bg);
      if (scene.userData.dome) scene.userData.dome.visible = L.dome;
    }
    if (rain) { scene.remove(rain); rain.geometry.dispose(); rain.material.dispose(); rain = null; }
    if (id === 'pluie') {   // gouttes en traits (segments) qui tombent dans un volume qui suit la caméra (dense de près, en gros plan aussi)
      const N = 4500, pos = new Float32Array(N * 6);
      for (let i = 0; i < N; i++) { const x = Math.random() * RAIN_BOX - RAIN_BOX / 2, y = Math.random() * 24, z = Math.random() * RAIN_BOX - RAIN_BOX / 2, l = 0.45 + Math.random() * 0.45; pos.set([x, y, z, x + 0.13 * l, y + l, z + 0.04 * l], i * 6); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xa8b8c8, transparent: true, opacity: 0.3, depthWrite: false })); rain.frustumCulled = false; scene.add(rain);
    }
    if (EFX && EFX.setRain) EFX.setRain(id === 'pluie');
    if (EFX) EFX.night = id === 'nuit';   // traçantes plus vives de nuit   // ronds de pluie au sol, impacts au sol en gerbes d'eau
    $('#app').dataset.cond = id || 'jour';
    if (OT.Parking && battle && battle.map.id === 'parking') { OT.Parking.setConditions(id || 'jour', scene); buildLamps(false); } else buildLamps(id === 'nuit' || id === 'brouillard');
    RIM.k.value = id === 'nuit' ? RIM.nuit : 0; RIM.f.value = id === 'nuit' ? RIM.fond : 0; if (RENDU) RIM.d.value.copy(RENDU.lightDir);
    // de jour aussi, un liseré léger côté soleil (chaud) et un soupçon de lumière enveloppante : la silhouette du soldat se
    // détache du décor même à contre-jour ou à l'ombre (éclairage de personnage des jeux « AAA »)
    if (id === 'nuit') RIM.c.value.setRGB(0.55, 0.68, 1.0); else if (id === 'jour') { RIM.c.value.setRGB(1.0, 0.82, 0.62); RIM.k.value = 0.22; RIM.f.value = 0.012; } else { RIM.c.value.setRGB(0.8, 0.86, 0.95); RIM.k.value = 0.1; RIM.f.value = 0.01; }   // liseré de lune des soldats (côté lune)
    buildSteam();
    meteoSound();   // couche sonore de la météo (pluie, vent, nuit, oiseaux)
  }
  const RAIN_BOX = 44;   // côté du volume de pluie autour de la caméra (m)
  function updateRain(dt) {
    if (!rain) return; const a = rain.geometry.attributes.position.array, v = 26 * dt, cx = camera.position.x, cz = camera.position.z, B = RAIN_BOX, h = B / 2;
    for (let i = 0; i < a.length; i += 6) {
      a[i + 1] -= v; a[i + 4] -= v; if (a[i + 1] < 0) { a[i + 1] += 24; a[i + 4] += 24; }
      const dx = a[i] - cx, dz = a[i + 2] - cz;   // goutte sortie du volume : replacée de l'autre côté (même après un changement de plan)
      if (dx > h || dx < -h) { const k = Math.floor((dx + h) / B) * B; a[i] -= k; a[i + 3] -= k; }
      if (dz > h || dz < -h) { const k = Math.floor((dz + h) / B) * B; a[i + 2] -= k; a[i + 5] -= k; }
    }
    rain.geometry.attributes.position.needsUpdate = true;
  }

  // ---------------------------------------------------------------------------------------------
  // Construction de la carte
  // ---------------------------------------------------------------------------------------------
  let mapGroup = null; const obstacleMesh = new Map();
  function groundTexture(w, d) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = Math.round(1024 * d / w); const g = c.getContext('2d');
    g.fillStyle = '#5c6063'; g.fillRect(0, 0, c.width, c.height);
    // taches de béton
    for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${20 + Math.random() * 40},${22 + Math.random() * 40},${24 + Math.random() * 40},${Math.random() * 0.25})`; const r = Math.random() * 6 + 1; g.fillRect(Math.random() * c.width, Math.random() * c.height, r, r); }
    // dalles
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
    const step = c.width / (w / 4);
    for (let x = 0; x <= c.width; x += step) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke(); }
    for (let y = 0; y <= c.height; y += step) { g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke(); }
    // marquages au sol
    g.strokeStyle = 'rgba(220,180,60,0.45)'; g.lineWidth = 6; g.setLineDash([40, 30]);
    g.beginPath(); g.moveTo(c.width * 0.2, c.height * 0.1); g.lineTo(c.width * 0.2, c.height * 0.9); g.stroke();
    g.beginPath(); g.moveTo(c.width * 0.8, c.height * 0.1); g.lineTo(c.width * 0.8, c.height * 0.9); g.stroke();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.__ground = true; return tex;
  }
  // textures procédurales (canvas) : tôle ondulée, planches, béton
  function makeTexture(w, h, draw, repeatX, repeatY) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeatX || 1, repeatY || 1); tex.anisotropy = 4; return tex;
  }
  const texCorrugated = makeTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) { const grd = g.createLinearGradient(x, 0, x + 16, 0); grd.addColorStop(0, '#bdbdbd'); grd.addColorStop(0.5, '#ffffff'); grd.addColorStop(1, '#a8a8a8'); g.fillStyle = grd; g.fillRect(x, 0, 16, h); }
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(60,40,30,${Math.random() * 0.25})`; g.fillRect(Math.random() * w, Math.random() * h, Math.random() * 4, Math.random() * 10); }
  }, 2, 1);
  const texPlanks = makeTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#d8b98a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) { g.fillStyle = `rgb(${200 + Math.random() * 40},${160 + Math.random() * 40},${100 + Math.random() * 40})`; g.fillRect(0, y, w, 30); g.fillStyle = 'rgba(60,40,20,0.6)'; g.fillRect(0, y + 30, w, 2); }
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(90,60,30,${Math.random() * 0.2})`; g.fillRect(Math.random() * w, Math.random() * h, Math.random() * 40, 1); }
    g.fillStyle = 'rgba(40,30,20,0.6)'; for (let y = 8; y < h; y += 32) { g.fillRect(12, y, 3, 3); g.fillRect(w - 15, y, 3, 3); }
  }, 1, 1);
  const texConcrete = makeTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#c9c9c9'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) { const v = 150 + Math.random() * 100; g.fillStyle = `rgba(${v},${v},${v},0.35)`; g.fillRect(Math.random() * w, Math.random() * h, Math.random() * 3, Math.random() * 3); }
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
  }, 2, 1);
  const texWindows = makeTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    for (let y = 24; y < h - 20; y += 64) for (let x = 20; x < w - 20; x += 48) { g.fillStyle = Math.random() < 0.3 ? '#f0d8a0' : '#2b3340'; g.fillRect(x, y, 26, 36); g.fillStyle = '#d8d2c4'; g.fillRect(x - 3, y + 36, 32, 4); }
  }, 2, 1);
  const MATERIALS = {
    wagon: new THREE.MeshStandardMaterial({ color: 0x6e3a2a, roughness: 0.75, metalness: 0.3, map: texCorrugated }),
    flat: new THREE.MeshStandardMaterial({ color: 0x3f3a36, roughness: 0.8, metalness: 0.4 }),
    tank: new THREE.MeshStandardMaterial({ color: 0x2e3338, roughness: 0.5, metalness: 0.6 }),
    signal: new THREE.MeshStandardMaterial({ color: 0x9c8a6a, roughness: 0.9, map: texConcrete }),
    rail: new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 0.5, metalness: 0.7 }), sleeper: new THREE.MeshStandardMaterial({ color: 0x3a2e24, roughness: 1 }),
    wall: new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.9, map: texConcrete }),
    building: new THREE.MeshStandardMaterial({ color: 0x7a7e83, roughness: 0.95, map: texConcrete }),
    pillar: new THREE.MeshStandardMaterial({ color: 0x5a5e63, roughness: 0.9, map: texConcrete }),
    container: [new THREE.MeshStandardMaterial({ color: 0x9a4535, roughness: 0.7, metalness: 0.25, map: texCorrugated }), new THREE.MeshStandardMaterial({ color: 0x35587a, roughness: 0.7, metalness: 0.25, map: texCorrugated }), new THREE.MeshStandardMaterial({ color: 0x66753f, roughness: 0.7, metalness: 0.25, map: texCorrugated })],
    crate: new THREE.MeshStandardMaterial({ color: 0x9c7a4c, roughness: 0.95, map: texPlanks }),
    sandbag: new THREE.MeshStandardMaterial({ color: 0x9b8b5e, roughness: 1 }),
    barrier: new THREE.MeshStandardMaterial({ color: 0xb8a233, roughness: 0.8 }),
    barrel: new THREE.MeshStandardMaterial({ color: 0x3f5f7a, roughness: 0.6, metalness: 0.4 }),
    pallet: new THREE.MeshStandardMaterial({ color: 0xa08055, roughness: 1, map: texPlanks }),
    lowwall: new THREE.MeshStandardMaterial({ color: 0x7e8186, roughness: 0.95 }),
    immeuble: [new THREE.MeshStandardMaterial({ color: 0xb8a68e, roughness: 0.9, map: texWindows }), new THREE.MeshStandardMaterial({ color: 0x9a8f86, roughness: 0.9, map: texWindows })],
    kiosque: new THREE.MeshStandardMaterial({ color: 0x4f6b47, roughness: 0.8 }),
    voiture: [new THREE.MeshStandardMaterial({ color: 0x8e9aa6, roughness: 0.4, metalness: 0.5 }), new THREE.MeshStandardMaterial({ color: 0x5a2e2a, roughness: 0.4, metalness: 0.5 })],
    stone: new THREE.MeshStandardMaterial({ color: 0x9d9a92, roughness: 0.9, map: texConcrete }),
    etal: [new THREE.MeshStandardMaterial({ color: 0xb04a3a, roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: 0x3a6a8a, roughness: 0.9 })],
    cuve: [new THREE.MeshStandardMaterial({ color: 0xb9bcbf, roughness: 0.55, metalness: 0.6, map: texCorrugated }), new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.7, metalness: 0.4, map: texCorrugated })],
    pompe: new THREE.MeshStandardMaterial({ color: 0x4a6a4a, roughness: 0.6, metalness: 0.5 }),
    pipe: new THREE.MeshStandardMaterial({ color: 0x9a9ea3, roughness: 0.4, metalness: 0.7 }),
    armoire: new THREE.MeshStandardMaterial({ color: 0x6a7a86, roughness: 0.5, metalness: 0.5 }),
    carPaint: [0xd9dcdf, 0x8e9aa6, 0x5a2e2a, 0x2f3b4a, 0xe6e2d6, 0x3d4a3a].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.55 })),
    glass: new THREE.MeshStandardMaterial({ color: 0x1d2a33, roughness: 0.1, metalness: 0.8 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }),
    rim: new THREE.MeshStandardMaterial({ color: 0x9a9ea3, roughness: 0.4, metalness: 0.7 }),
    light: new THREE.MeshBasicMaterial({ color: 0xfff2c4 }), lightRed: new THREE.MeshBasicMaterial({ color: 0x9a1a14 }),
    bark: new THREE.MeshStandardMaterial({ color: 0x6b5a44, roughness: 1 }), frond: new THREE.MeshStandardMaterial({ color: 0x3f6b33, roughness: 0.9, side: THREE.DoubleSide }),
    mall: new THREE.MeshStandardMaterial({ color: 0xd8cbb6, roughness: 0.85, map: texConcrete }), mallGlass: new THREE.MeshStandardMaterial({ color: 0x324a5a, roughness: 0.15, metalness: 0.7 }),
    sign: new THREE.MeshBasicMaterial({ color: 0xc23b2f }), busPaint: new THREE.MeshStandardMaterial({ color: 0xe0e4e8, roughness: 0.4, metalness: 0.4 }),
  };
  // ---- modèles de décor (le volume de collision reste la boîte de la carte ; ces modèles s'y inscrivent) ----------------
  // voiture : caisse basse, habitacle vitré, roues, phares ; orientée selon le grand côté de la boîte
  function carModel(o, i, kind) {
    const g = new THREE.Group(), along = o.d >= o.w, L = Math.max(o.w, o.d), Wd = Math.min(o.w, o.d), H = o.h;
    const paint = kind === 'bus' ? MATERIALS.busPaint : MATERIALS.carPaint[(i * 7 + Math.round(o.x * 3 + o.z)) % MATERIALS.carPaint.length];
    const add = (geo, mat, x, y, z, rx, ry, rz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (rx) m.rotation.x = rx; if (ry) m.rotation.y = ry; if (rz) m.rotation.z = rz; g.add(m); return m; };
    const wheelR = kind === 'car' ? 0.32 : 0.45;
    if (kind === 'car') {
      add(new THREE.BoxGeometry(Wd * 0.96, H * 0.42, L * 0.98), paint, 0, -H / 2 + wheelR * 0.8 + H * 0.21, 0);
      add(new THREE.BoxGeometry(Wd * 0.86, H * 0.36, L * 0.5), MATERIALS.glass, 0, -H / 2 + wheelR * 0.8 + H * 0.42 + H * 0.17, -L * 0.04);
      add(new THREE.BoxGeometry(Wd * 0.8, 0.05, L * 0.46), paint, 0, -H / 2 + wheelR * 0.8 + H * 0.42 + H * 0.36, -L * 0.04);
      for (const s of [-1, 1]) { add(new THREE.BoxGeometry(0.22, 0.1, 0.04), MATERIALS.light, s * Wd * 0.32, -H / 2 + wheelR + 0.25, L * 0.49); add(new THREE.BoxGeometry(0.22, 0.1, 0.04), MATERIALS.lightRed, s * Wd * 0.32, -H / 2 + wheelR + 0.25, -L * 0.49); }
    } else {   // fourgon / bus : caisse haute, vitres latérales en bandeau
      add(new THREE.BoxGeometry(Wd * 0.98, H - wheelR * 0.8, L * 0.99), paint, 0, wheelR * 0.4, 0);
      for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.03, H * 0.25, L * (kind === 'bus' ? 0.85 : 0.35)), MATERIALS.glass, s * Wd * 0.5, H * 0.22, kind === 'bus' ? 0 : L * 0.28);
      add(new THREE.BoxGeometry(Wd * 0.85, H * 0.3, 0.03), MATERIALS.glass, 0, H * 0.2, L * 0.497);
      if (kind === 'bus') add(new THREE.BoxGeometry(0.03, H * 0.12, L * 0.9), MATERIALS.sign, Wd * 0.5 + 0.01, -H * 0.12, 0);
    }
    const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.22, 14);
    for (const s of [-1, 1]) for (const f of [-1, 1]) { const w = add(wheelGeo, MATERIALS.tyre, s * Wd * 0.46, -H / 2 + wheelR, f * L * 0.33, 0, 0, Math.PI / 2); const r = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 0.55, wheelR * 0.55, 0.23, 10), MATERIALS.rim); w.add(r); }
    if (!along) g.rotation.y = Math.PI / 2;
    return g;
  }
  function palmModel(o) {
    const g = new THREE.Group(), H = o.h;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, H, 8), MATERIALS.bark); g.add(trunk);
    for (let k = 0; k < 8; k++) {   // palmes : feuilles longues, retombantes
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 2.4, 1, 4), MATERIALS.frond); const pos = leaf.geometry.attributes.position;
      for (let v = 0; v < pos.count; v++) { const y = pos.getY(v); pos.setZ(v, -Math.pow((y + 1.2) / 2.4, 2) * 0.9); }
      pos.needsUpdate = true; leaf.geometry.computeVertexNormals();
      const pivot = new THREE.Group(); pivot.position.y = H / 2; pivot.rotation.y = k * Math.PI / 4; leaf.position.set(0, 0, 1.15); leaf.rotation.x = -Math.PI / 2 + 0.35; pivot.add(leaf); g.add(pivot);
    }
    return g;
  }
  function mallModel(o) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, o.d), MATERIALS.mall); g.add(body);
    const n = Math.floor(o.w / 3.2);   // vitrines au rez-de-chaussée, côté parking (+z)
    for (let k = 0; k < n; k++) { const v = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 0.05), MATERIALS.mallGlass); v.position.set(-o.w / 2 + 1.6 + k * 3.2, -o.h / 2 + 1.5, o.d / 2 + 0.03); g.add(v); }
    const band = new THREE.Mesh(new THREE.BoxGeometry(o.w * 0.6, 0.8, 0.1), MATERIALS.sign); band.position.set(0, o.h / 2 - 1.2, o.d / 2 + 0.06); g.add(band);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.4, 0.3, o.d + 0.4), MATERIALS.wall); roof.position.y = o.h / 2; g.add(roof);
    return g;
  }
  function materialFor(o, i) {
    const n = o.name || '';
    if (n.startsWith('mur ')) return MATERIALS.wall;
    if (n.startsWith('bâtiment')) return MATERIALS.building;
    if (n.startsWith('pilier')) return MATERIALS.pillar;
    if (n.startsWith('conteneur')) return MATERIALS.container[i % 3];
    if (n.startsWith('caisses')) return MATERIALS.crate;
    if (n.startsWith('sacs')) return MATERIALS.sandbag;
    if (n.startsWith('barrière')) return MATERIALS.barrier;
    if (n.startsWith('fût')) return MATERIALS.barrel;
    if (n.startsWith('palettes')) return MATERIALS.pallet;
    if (n.startsWith('muret')) return MATERIALS.lowwall;
    if (n.startsWith('immeuble')) return MATERIALS.immeuble[i % 2];
    if (n.startsWith('kiosque')) return MATERIALS.kiosque;
    if (n.startsWith('voiture')) return MATERIALS.voiture[i % 2];
    if (n.startsWith('banc')) return MATERIALS.pallet;
    if (n.startsWith('fontaine')) return MATERIALS.stone;
    if (n.startsWith('étal')) return MATERIALS.etal[i % 2];
    if (n.startsWith('bac')) return MATERIALS.stone;
    if (n.startsWith('cuve')) return MATERIALS.cuve[i % 2];
    if (n.startsWith('pompe')) return MATERIALS.pompe;
    if (n.startsWith('tuyauterie')) return MATERIALS.pipe;
    if (n.startsWith('armoire')) return MATERIALS.armoire;
    if (n === 'wagon') return MATERIALS.wagon;
    if (n.startsWith('wagon plat') || n.startsWith('butoir')) return MATERIALS.flat;
    if (n.startsWith('poste') || n.startsWith('halle')) return MATERIALS.signal;
    if (n.startsWith('quai')) return MATERIALS.lowwall;
    return MATERIALS.wall;
  }
  function buildMap(map) {
    if (mapGroup) { // libérer les ressources GPU de la carte précédente (géométries et texture du sol créées ici)
      mapGroup.traverse(o => { if (o.isMesh && !o.userData.keep) { o.geometry.dispose(); if (o.material && o.material.map && o.material.map.isCanvasTexture && o.material.map.__ground) { o.material.map.dispose(); o.material.dispose(); } } });
      scene.remove(mapGroup);
    }
    mapGroup = new THREE.Group(); obstacleMesh.clear();
    const D3 = OT.Decor, style = { parking: 'parking', place: 'place', raffinerie: 'raffinerie', gare: 'gare' }[map.id] || 'entrepot';
    const PK = map.id === 'parking' && OT.Parking ? OT.Parking : null;   // parking haut de gamme (parking.js)
    if (PK) { /* sol, monde autour : plus bas, une fois les modèles Meshy connus */ }
    else if (D3) for (const gm of D3.ground(map, style)) mapGroup.add(gm);
    else { const ground = new THREE.Mesh(new THREE.PlaneGeometry(map.width, map.depth), new THREE.MeshStandardMaterial({ map: groundTexture(map.width, map.depth), roughness: 1 }));
      ground.rotation.x = -Math.PI / 2; ground.position.set(map.width / 2, 0, map.depth / 2); ground.receiveShadow = true; mapGroup.add(ground); }
    // environnement : asphalte autour de l'enceinte et quelques entrepôts lointains en silhouette
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), D3 ? new THREE.MeshStandardMaterial({ map: (() => { const t = D3.TEX.asphalte().clone(); t.needsUpdate = true; t.repeat.set(80, 80); return t; })(), color: 0x9a9894, roughness: 1 }) : new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 1 }));
    outer.rotation.x = -Math.PI / 2; outer.position.set(map.width / 2, -0.02, map.depth / 2); outer.receiveShadow = true; mapGroup.add(outer);
    if (PK) outer.position.y = -0.05;
    if (D3 && !PK) mapGroup.add(D3.skyline(map, style === 'parking' || style === 'place' ? 'ville' : style === 'entrepot' ? 'port' : 'industrie'));
    const farMat = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 1 });
    if (!D3) [[-30, -25, 30, 9, 14], [20, -40, 50, 11, 18], [95, -30, 28, 8, 16], [110, 20, 20, 10, 30], [100, 60, 40, 9, 14], [20, 70, 60, 8, 12], [-40, 30, 24, 12, 20], [-35, 65, 30, 7, 16]].forEach(([x, z, w, h, d]) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), farMat); b.position.set(x, h / 2, z); mapGroup.add(b);
    });
    // grues portuaires stylisées
    (map.id === 'entrepot' || !D3 ? [[-20, 75], [85, -45]] : []).forEach(([x, z]) => {
      const g = new THREE.Group(); const legMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.8 });
      for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.8, 28, 0.8), legMat); l.position.set(dx, 14, dz); g.add(l); }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(44, 1.2, 1.6), legMat); beam.position.set(8, 28, 0); g.add(beam);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 5), legMat); cab.position.set(0, 25, 0); g.add(cab);
      g.position.set(x, 0, z); mapGroup.add(g);
    });
    const M3 = OT.Modeles3D && OT.Modeles3D.ready ? OT.Modeles3D : null, has3 = (n) => M3 && M3.has(n);
    if (PK) PK.build(map, mapGroup, { M3 });
    // objets Meshy alignés bout à bout le long d'une boîte (barrières, sacs de sable) : autant de copies que la longueur le demande
    const rangee = (n, o, unit, opts) => {
      const g = new THREE.Group(), L = Math.max(o.w, o.d), k = Math.max(1, Math.round(L / unit)), along = o.w >= o.d;
      for (let j = 0; j < k; j++) { const p = M3.fit(n, along ? L / k : o.w, o.h, along ? o.d : L / k, Object.assign({ flip: (j + (opts && opts.seed || 0)) % 2 === 1 }, opts)); const off = (j + 0.5) * L / k - L / 2; p.position.set(along ? off : 0, 0, along ? 0 : off); g.add(p); }
      return g;
    };
    map.obstacles.forEach((o, i) => {
      let mesh;
      const nm = o.name || '';
      const pkm = PK && PK.mesh(o);
      if (pkm) mesh = pkm;
      else if (has3('berline') && nm.startsWith('voiture')) {   // o.dir : sens du capot (modèles : capot vers −x) ; o.teinte : couleur de carrosserie
        const flipV = o.dir !== undefined ? (o.w >= o.d ? o.dir > 0 : o.dir < 0) : i % 2 === 0;
        mesh = M3.fit(/pick-up/.test(nm) && has3('pickup') ? 'pickup' : 'berline', o.w, o.h, o.d, { flip: flipV, tol: 0.3 });
        if (PK && PK.teinter) PK.teinter(mesh, o.teinte !== undefined ? o.teinte : i);
      } else if (has3('fourgon') && nm.startsWith('fourgon')) {
        mesh = M3.fit('fourgon', o.w, o.h, o.d, { flip: o.dir !== undefined ? (o.w >= o.d ? o.dir > 0 : o.dir < 0) : i % 2 === 0, tol: 0.3 });
        if (PK && PK.teinter) PK.teinter(mesh, o.teinte !== undefined ? o.teinte : 100 + i);
      } else if (has3('bus') && nm.startsWith('bus')) {
        mesh = M3.fit('bus', o.w, o.h, o.d, { tol: 0.35 });
      } else if (has3('barriere') && nm.startsWith('barrière')) {
        mesh = rangee('barriere', o, 2.0, { tol: 0.3, seed: i });
      } else if (has3('sacs') && nm.startsWith('sacs')) {
        mesh = rangee('sacs', o, 1.3, { tol: 1.2, seed: i });
      } else if (has3('fut') && nm.startsWith('fût')) {
        mesh = new THREE.Group(); const two = Math.max(o.w, o.d) > 1.2;   // un ou deux fûts dans la boîte
        for (let j = 0; j < (two ? 2 : 1); j++) { const r = Math.min(o.w, o.d) * 0.95, p = M3.fit('fut', r, o.h, r, { byHeight: true, rot: i + j }); if (two) { const off = (j - 0.5) * Math.max(o.w, o.d) * 0.48; p.position.set(o.w >= o.d ? off : 0, 0, o.w >= o.d ? 0 : off); } mesh.add(p); }
      } else if (has3('kiosque') && nm.startsWith('kiosque')) {   // rideau du kiosque (face +z du modèle) tourné vers o.face (radians), sinon vers le nord
        // (le modèle est plus long en z qu'en x : fit() le tourne déjà de 90° dans une boîte carrée — on le retranche, sinon le
        // rideau principal, sous l'auvent, regardait l'ouest et la porte l'est)
        const ks = M3.boxes.kiosque.getSize(new THREE.Vector3()), kq = (ks.x >= ks.z) === (o.w >= o.d) ? 0 : Math.PI / 2;
        mesh = M3.fit('kiosque', o.w, o.h, o.d, { tol: 0.3, rot: (o.face !== undefined ? o.face : Math.PI) - kq });
        mesh.traverse(m => { if (m.isMesh && m.material && m.material.color) { m.material = m.material.clone(); m.material.color.multiply(new THREE.Color(0x8fae7e)); } });   // tôle peinte en vert : la texture du modèle (gris clair très contrasté) faisait papier froissé
      } else if (has3('abribus') && nm.startsWith('abribus')) {   // côté ouvert (face +z du modèle) vers le bus, au sud
        mesh = M3.fit('abribus', o.w, o.h, o.d, { tol: 0.3 });
      } else if (OT.Arbres && /^arbre/.test(nm)) {   // arbre d'alignement fait par programme (arbres.js : houppier en cartes de feuillage)
        mesh = new THREE.Group(); const a = OT.Arbres.arbre(6.2 + (i % 3) * 0.6, i); a.position.y = -o.h / 2; mesh.add(a);
      } else if (has3('arbre') && /^(arbre|palmier)/.test(nm)) {   // arbre d'alignement (sa grille de pied disparaît dans le bac)
        mesh = M3.fit('arbre', 3, 6.4 + (i % 3) * 0.5, 3, { byHeight: true, rot: i * 1.7 }); mesh.position.y = 0;
        mesh.children[0].position.y = -o.h / 2 - 0.8;   // pied enfoncé : la dalle à grille (plus large que le bac) passe sous le sol, le corset reste dans le bac
      } else if (has3('palettes') && nm.startsWith('palettes')) {
        mesh = M3.fit('palettes', o.w, o.h, o.d, { tol: 0.35, rot: (i % 4) * Math.PI / 2 });
      } else if (has3('conteneur') && nm.startsWith('conteneur')) {
        mesh = M3.fit('conteneur', o.w, o.h, o.d, { tol: 0.3, flip: i % 2 === 0 });
      } else if (has3('palmier') && /^(arbre|palmier)/.test(nm)) {
        mesh = M3.fit('palmier', 3, 6.2 + (i % 3) * 0.6, 3, { byHeight: true, rot: i }); mesh.position.y = 0;
        mesh.children[0].position.y = -o.h / 2;
      } else if (D3 && /^(voiture|fourgon|bus)/.test(nm)) {
        mesh = D3.car(o, i, nm.startsWith('voiture') ? 'car' : nm.startsWith('bus') ? 'bus' : 'van');
      } else if (D3 && /^(arbre|palmier)/.test(nm)) {
        mesh = D3.palm(o, i);
      } else if (D3 && nm.startsWith('barrière')) {
        mesh = D3.jersey(o);
      } else if (D3 && nm.startsWith('sacs')) {
        mesh = D3.sandbags(o);
      } else if (D3 && nm.startsWith('fût')) {
        mesh = D3.barrel(o, i);
      } else if (D3 && /^(caisses|mur |muret|pilier|bâtiment|immeuble|conteneur|quai|poste|halle|abri|kiosque|bac)/.test(nm)) {
        const D = D3.M, k = nm.split(' ')[0];
        const matFor = { caisses: [D.caisse(), 1.2], mur: [D.beton(), 3], muret: [D.beton(), 3], pilier: [D.beton(), 3], quai: [D.beton(), 3], 'bâtiment': [D.facade(i % 2 ? 'gris' : ''), 6], immeuble: [D.facade(['', 'rose', 'gris'][i % 3]), 6], conteneur: [D.tole([0xb05a3e, 0x3e6a8e, 0x6e8a4a, 0xc8a040][i % 4]), 2.4], poste: [D.facade('gris'), 6], halle: [D.tole(0x9aa0a4), 2.4], abri: [D.tole(0xc8c8c0), 2.4], kiosque: [D.facade('rose'), 6], bac: [D.beton(), 1.5] }[k] || [D.beton(), 3];
        mesh = new THREE.Mesh(D3.box(o.w, o.h, o.d, matFor[1]), matFor[0]);
      } else if (/^(voiture|fourgon|bus)/.test(nm)) {
        mesh = carModel(o, i, nm.startsWith('voiture') ? 'car' : nm.startsWith('bus') ? 'bus' : 'van');
      } else if (nm.startsWith('palmier')) {
        mesh = palmModel(o);
      } else if ((o.name || '').startsWith('centre commercial')) {
        mesh = mallModel(o);
      } else if ((o.name || '').startsWith('fût')) {
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(o.w, o.d) / 2, Math.min(o.w, o.d) / 2, o.h, 16), materialFor(o, i));
      } else if ((o.name || '').startsWith('cuve')) {
        // cuve : cylindre inscrit dans la boîte (la simulation garde la boîte ; l'écart est au plus de 1,2 m dans les coins)
        mesh = new THREE.Group();
        const r = Math.min(o.w, o.d) / 2, body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, o.h, 28), materialFor(o, i)); mesh.add(body);
        const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.03, r * 1.03, 0.25, 28), MATERIALS.pipe); top.position.y = o.h / 2; mesh.add(top);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, 0.08, 6, 28), MATERIALS.pipe); ring.rotation.x = Math.PI / 2; ring.position.y = -o.h / 2 + o.h * 0.35; mesh.add(ring);
        if (o.d > o.w + 0.5 || o.w > o.d + 0.5) { // cuve allongée : deux cylindres couchés côte à côte sur la longueur
          mesh.clear(); const along = o.d > o.w; const L = along ? o.d : o.w, R = Math.min(o.w, o.d) / 2;
          const c = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 24), materialFor(o, i)); c.rotation.x = along ? Math.PI / 2 : 0; c.rotation.z = along ? 0 : Math.PI / 2; c.position.y = R - o.h / 2 + (o.h - 2 * R) * 0.5; mesh.add(c);
          const legs = new THREE.Mesh(new THREE.BoxGeometry(o.w * 0.9, o.h - 2 * R + 0.3, o.d * 0.9), MATERIALS.pompe); legs.position.y = -o.h / 2 + (o.h - 2 * R + 0.3) / 2; mesh.add(legs);
        }
      } else if ((o.name || '').startsWith('tuyauterie')) {
        mesh = new THREE.Group(); const along = o.w > o.d; const L = Math.max(o.w, o.d);
        for (let k = 0; k < 3; k++) { const rr = 0.14 - k * 0.02; const c = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, L, 12), MATERIALS.pipe); c.rotation.z = along ? Math.PI / 2 : 0; c.rotation.x = along ? 0 : Math.PI / 2; c.position.y = -o.h / 2 + 0.25 + k * 0.33; mesh.add(c); }
        for (let k = -1; k <= 1; k++) { const sup = new THREE.Mesh(new THREE.BoxGeometry(along ? 0.15 : Math.min(o.w, o.d) * 0.9, o.h, along ? Math.min(o.w, o.d) * 0.9 : 0.15), MATERIALS.armoire); sup.position.set(along ? k * L * 0.45 : 0, 0, along ? 0 : k * L * 0.45); mesh.add(sup); }
      } else if ((o.name || '').startsWith('wagon-citerne')) {
        mesh = new THREE.Group(); const R = Math.min(o.d, o.h - 0.8) / 2;
        const c = new THREE.Mesh(new THREE.CylinderGeometry(R, R, o.w - 0.4, 20), MATERIALS.tank); c.rotation.z = Math.PI / 2; c.position.y = o.h / 2 - R - 0.05; mesh.add(c);
        const ch = new THREE.Mesh(new THREE.BoxGeometry(o.w, 0.35, o.d * 0.8), MATERIALS.flat); ch.position.y = -o.h / 2 + 0.75; mesh.add(ch);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.15, 12), MATERIALS.flat); wh.rotation.x = Math.PI / 2; wh.position.set(sx * (o.w / 2 - 1.2), -o.h / 2 + 0.4, sz * o.d * 0.38); mesh.add(wh); }
      } else if ((o.name || '').startsWith('wagon')) {   // wagon couvert ou plat : caisse + châssis + roues
        mesh = new THREE.Group(); const flat = (o.name || '').startsWith('wagon plat'), bodyH = o.h - 0.75;
        const body = new THREE.Mesh(new THREE.BoxGeometry(o.w, flat ? 0.35 : bodyH, o.d), materialFor(o, i)); body.position.y = flat ? -o.h / 2 + 0.9 : o.h / 2 - bodyH / 2; mesh.add(body);
        if (flat) { const load = new THREE.Mesh(new THREE.BoxGeometry(o.w * 0.55, o.h - 1.05, o.d * 0.8), MATERIALS.container[i % 3]); load.position.set(-o.w * 0.18, (1.05 - o.h) / 2 + (o.h - 1.05) / 2 + 0.43 - 0.0, 0); load.position.y = -o.h / 2 + 1.07 + (o.h - 1.07) / 2; mesh.add(load); }
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.15, 12), MATERIALS.flat); wh.rotation.x = Math.PI / 2; wh.position.set(sx * (o.w / 2 - 1.2), -o.h / 2 + 0.4, sz * o.d * 0.38); mesh.add(wh); }
      } else if ((o.name || '').startsWith('sacs')) {
        // un empilement de sacs : 3 rangées légèrement décalées
        mesh = new THREE.Group();
        for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.1 - k * 0.04, o.h / 3, o.d + 0.1 - k * 0.04), MATERIALS.sandbag); m.position.y = -o.h / 2 + o.h / 6 + k * o.h / 3; m.castShadow = true; m.receiveShadow = true; mesh.add(m); }
      } else {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, o.d), materialFor(o, i));
      }
      mesh.position.set(o.x + o.w / 2, o.h / 2, o.z + o.d / 2);
      mesh.castShadow = true; mesh.receiveShadow = true;
      if (map.isDestructible(o)) { mesh.userData.keep = true; obstacleMesh.set(o, mesh); }   // destructible : gardé à part (pas fusionné)
      if (mesh.isGroup) mesh.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
      mapGroup.add(mesh);
      // arêtes pour la lisibilité des couverts hauts
      if (!D3 && o.kind === 'wall' && !/^(mur |cuve|tuyauterie|fourgon|bus|palmier|centre)/.test(o.name || '')) {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(o.w, o.h, o.d)), new THREE.LineBasicMaterial({ color: 0x1a1d20, transparent: true, opacity: 0.5 }));
        edges.position.copy(mesh.position); mapGroup.add(edges);
      }
    });
    // abribus (décor, hors du terrain) le long de la façade du centre commercial
    if (has3('abribus') && map.id === 'parking' && !PK) for (const x of [16, map.width - 16]) { const a = M3.fit('abribus', 4, 2.6, 1.6, { tol: 0.3 }); a.position.set(x, 1.3, -2.6); mapGroup.add(a); }
    // zones de départ
    if (!PK) map.spawns.forEach((sp, i) => {   // (parking : marquage holographique à la place)
      const ring = new THREE.Mesh(new THREE.RingGeometry(sp.r - 0.15, sp.r, 48), new THREE.MeshBasicMaterial({ color: TEAM[i].color, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(sp.x, 0.02, sp.z); mapGroup.add(ring);
    });
    if (map.id === 'gare') for (const zc of [7.3, 13.2, 32.2, 38.3]) {   // voies ferrées (décor) : deux rails et des traverses
      for (const dz of [-0.72, 0.72]) { const r = new THREE.Mesh(new THREE.BoxGeometry(map.width - 2, 0.12, 0.08), MATERIALS.rail); r.position.set(map.width / 2, 0.08, zc + dz); r.receiveShadow = true; mapGroup.add(r); }
      for (let x = 1.5; x < map.width - 1; x += 1.2) { const sl = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.06, 2.2), MATERIALS.sleeper); sl.position.set(x, 0.03, zc); sl.receiveShadow = true; mapGroup.add(sl); }
    }
    mergeStatic(mapGroup);
    scene.add(mapGroup);
  }
  // Performance : le décor est immobile → ses maillages sont fusionnés par matériau (et par ombres portées / reçues).
  // ~350 appels de dessin de moins par image (et autant pour la carte d'ombres). Les arêtes sont fusionnées en un seul tracé.
  function mergeStatic(root) {
    root.updateMatrixWorld(true);
    const buckets = new Map(), lines = [], drop = [];
    root.traverse(o => {
      if (o.isLineSegments) { lines.push(o); return; }
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position || !o.geometry.attributes.normal || Array.isArray(o.material) || o.material.transparent || o.userData.keep) return;
      if (o.matrixWorld.determinant() < 0) return;                                  // miroir : ordre des faces inversé, on laisse tel quel
      const k = o.material.uuid + '|' + o.castShadow + '|' + o.receiveShadow;
      if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(o);
    });
    const merge = (list, withNormal) => {
      const useUv = list.every(m => m.geometry.attributes.uv), useCol = withNormal && list.some(m => m.geometry.attributes.color);   // couleurs par sommet (sinon un matériau « vertexColors » sortirait noir)
      const parts = list.map(m => { const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()); g.applyMatrix4(m.matrixWorld); return g; });
      const n = parts.reduce((s, g) => s + g.attributes.position.count, 0), out = new THREE.BufferGeometry();
      const pos = new Float32Array(n * 3), nor = withNormal ? new Float32Array(n * 3) : null, uv = useUv && withNormal ? new Float32Array(n * 2) : null, col = useCol ? new Float32Array(n * 3).fill(1) : null;
      let o3 = 0, o2 = 0;
      for (const g of parts) { pos.set(g.attributes.position.array, o3); if (nor) nor.set(g.attributes.normal.array, o3); if (uv) uv.set(g.attributes.uv.array, o2); if (col && g.attributes.color && g.attributes.color.itemSize === 3) col.set(g.attributes.color.array, o3); o3 += g.attributes.position.count * 3; o2 += g.attributes.position.count * 2; g.dispose(); }
      out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); if (nor) out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
      out.computeBoundingSphere(); return out;
    };
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      const m = new THREE.Mesh(merge(list, true), list[0].material); m.castShadow = list[0].castShadow; m.receiveShadow = list[0].receiveShadow; m.matrixAutoUpdate = false;
      root.add(m); drop.push(...list);
    }
    if (lines.length > 1) {
      const ls = new THREE.LineSegments(merge(lines, false), new THREE.LineBasicMaterial({ color: 0x1a1d20, transparent: true, opacity: 0.5 })); ls.matrixAutoUpdate = false;
      root.add(ls); drop.push(...lines);
    }
    for (const o of drop) { o.parent.remove(o); o.geometry.dispose(); if (o.isLineSegments) o.material.dispose(); }
    // groupes vidés (voitures, cuves…) : retirés
    const empty = []; root.traverse(o => { if (o !== root && o.isGroup && !o.children.length) empty.push(o); }); for (const g of empty) g.parent.remove(g);
  }

  // ---------------------------------------------------------------------------------------------
  // Opérateurs : personnages articulés construits par programme (jambes, torse, bras, tête, casque, gilet, arme),
  // couleur par équipe, animations de marche / posture / chute / recul / impact.
  // ---------------------------------------------------------------------------------------------
  const meshes = {}; // unitId -> { group, pose, parts…, label, prev, cur, anim }
  const Figure = OT.Figure;
  function makeOperator(u) {
    const t = TEAM[u.team];
    let fac = DATA.FACTIONS[u.def.faction || 'allied'] || DATA.FACTIONS.allied;   // uniforme selon la faction, marqueurs selon l'équipe
    const teamDef = battle.teams[u.team]; if (!u.def.faction && teamDef.uniform) { const uni = DATA.UNIFORMS.find(x => x.id === teamDef.uniform); if (uni) fac = uni; }
    // soldat Meshy (modèle 3D animé) s'il est chargé, sinon personnage dessiné par programme
    const f = (OT.Soldat3D && OT.Soldat3D.ready && !OT.SETTINGS_LOWMODEL && OT.Soldat3D.create({ modele: u.def.faction ? 'soldat' : 'gign', uniform: fac.uniform, weapon: u.weapon.id, attachments: u.att }))
      || Figure.build({ id: u.def.id, weapon: u.weapon.id, uniform: fac.uniform, vest: fac.vest, teamColor: t.color, headgear: u.def.headgear || (u.def.faction ? 'casque_lunettes' : 'casque'), attachments: u.att });
    rimPatch(f.group);   // liseré de lune (nuit)
    // ombre de contact : tache douce et sombre sous les pieds (la carte d'ombre du soleil est trop grossière pour « poser » le
    // soldat sur le sol, surtout à l'ombre et de nuit) ; s'efface quand il tombe
    { if (!OT.blobTex) { const c = document.createElement('canvas'); c.width = c.height = 64; const q = c.getContext('2d'), gr = q.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); q.fillStyle = gr; q.fillRect(0, 0, 64, 64); OT.blobTex = new THREE.CanvasTexture(c); }
      const bm = new THREE.MeshBasicMaterial({ map: OT.blobTex, color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, fog: false });
      const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), bm); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.015; blob.renderOrder = 1; blob.userData.contact = true;
      blob.onBeforeRender = () => { const uu = battle && battle.units.find(x => x.id === u.id); bm.opacity = uu && uu.alive ? 0.5 : Math.max(0, bm.opacity - 0.02); };
      f.group.add(blob); }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.41, 40), new THREE.MeshBasicMaterial({ color: t.color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; f.group.add(ring);
    scene.add(f.group);
    const label = document.createElement('div'); label.className = 'label team' + u.team;
    label.innerHTML = `<div class="lplate"><span class="lname">${u.callsign}</span></div><div class="lbar"><i></i></div><div class="lshield">${OT.Ico ? OT.Ico(u.def.trait === 'leader' ? 'r_leader' : u.def.trait === 'radio' ? 'radio' : ({ assault: 'r_assault', pointman: 'r_pointman', marksman: 'r_marksman', support: 'r_support', breacher: 'r_breacher' })[u.role.id]) : ''}</div>`;
    $('#labels').appendChild(label);
    meshes[u.id] = Object.assign(f, { ring, label, prev: { x: u.x, z: u.z, facing: u.facing }, cur: { x: u.x, z: u.z, facing: u.facing },
      anim: { crouch: 0, fall: 0, fallDir: 0, recoil: 0, flinch: 0, aim: 0, phase: Math.random() * 6.28 } });
  }
  // le modèle 3D arrive après le début d'une bataille : on remplace les personnages sans toucher à la simulation
  // les objets Meshy arrivent après le début d'une bataille : on redessine le décor (la simulation n'en dépend pas)
  if (OT.Modeles3D) OT.Modeles3D.whenReady(() => { if (battle && mapGroup) { buildMap(battle.map); render(); } });
  if (OT.Soldat3D) OT.Soldat3D.whenReady(() => { if (!battle) return; for (const u of battle.units) { const old = meshes[u.id]; if (!old || old.isSkinned) continue; scene.remove(old.group); old.label.remove(); makeOperator(u); Object.assign(meshes[u.id], { prev: old.prev, cur: old.cur }); } render(); });
  // Chute : on choisit l'animation de chute et une légère rotation du corps pour que le corps allongé (tête, bassin, pieds)
  // ne traverse ni un obstacle ni le bord du terrain. Positions finales de la tête et des pieds mesurées sur les animations
  // (repère du soldat : +Z devant, x vers sa gauche).
  const FIN_CHUTE = { Shot_and_Fall_Forward: [[-0.39, 0.27], [0.68, -0.57], [0.28, -0.76], [-0.54, -0.11]], Shot_in_the_Back_and_Fall: [[-0.49, 0.12], [0.82, -0.23], [0.64, -0.57], [-0.61, -0.3]] };
  function chooseFall(u, m) {
    const base = u.id.charCodeAt(u.id.length - 1) % 2 ? ['Shot_and_Fall_Forward', 'Shot_in_the_Back_and_Fall'] : ['Shot_in_the_Back_and_Fall', 'Shot_and_Fall_Forward'];
    const libre = (x, z) => battle.map.inBounds(x, z) && !battle.map.insideObstacle(x, z);
    let best = null;
    for (const off of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, Math.PI]) for (const clip of base) {
      const yaw = m.yaw + off; let score = 0;
      for (const [lx, lz] of FIN_CHUTE[clip]) { const wx = u.x + lx * Math.cos(yaw) + lz * Math.sin(yaw), wz = u.z - lx * Math.sin(yaw) + lz * Math.cos(yaw); if (!libre(wx, wz)) score++; if (!libre((u.x + wx) / 2, (u.z + wz) / 2)) score++; }
      score += Math.abs(off) * 0.1;
      if (!best || score < best.score) best = { clip, yaw, score };
      if (best.score < 0.05) break;
    }
    m.anim.fallClip = best.clip; m.anim.fallYaw = best.yaw;
  }
  function clearOperators() { for (const id in meshes) { const m = meshes[id]; scene.remove(m.group); m.label.remove(); if (m._fog) for (const f of m._fog) for (const c of [].concat(f.clone)) if (c && c.userData.base !== undefined) c.dispose(); delete meshes[id]; } }

  // Pose d'un opérateur selon son état (appelée à chaque image) — toutes les valeurs sont lissées.
  const lerp = (a, b, k) => a + (b - a) * k;
  function animateSkinned(u, m, dt) {
    const a = m.anim, clipSpeed = (n) => (m.clips[n] || {}).duration || 1;
    // sauveteur : racine affichée à côté du corps du blessé (ragdoll.js ; la simulation garde sa position)
    if (OT.Ragdoll) OT.Ragdoll.reanimateur(u, m, dt, unitById, meshes);
    // mort en ragdoll physique (ragdoll.js) : le corps n'est plus animé
    if (m.rag && OT.Ragdoll && OT.Ragdoll.anime(u, m, dt)) { m.ring.material.opacity = Math.max(0.15, m.ring.material.opacity - dt); chargeur(u, m, a); return; }
    a.recoil = Math.max(0, a.recoil - dt * 10); a.flinch = Math.max(0, a.flinch - dt * 4);
    const crouch = u.alive && u.stance === 'crouch', aiming = u.alive && (u.target || u.state === 'engage' || u.state === 'overwatch' || u.state === 'capture');
    const dx = m.cur.x - m.prev.x, dz = m.cur.z - m.prev.z, v = Math.hypot(dx, dz) / DT;
    // direction du déplacement par rapport au corps affiché : les jambes marchent dans cette direction, le torse reste vers la
    // cible. Au-delà de ~100°, on recule : jambes vers l'arrière et cycle lu à l'envers (hystérésis pour ne pas osciller).
    // direction du déplacement lissée sur ~0,3 s : les petits zigzags du chemin (centre de case, écartement d'un allié)
    // ne font plus pivoter les jambes dans tous les sens
    let ecart = 0;
    if (v > 0.15 && Math.hypot(a.vx, a.vz) > 0.1) { ecart = (-Math.atan2(a.vz, a.vx) + Math.PI / 2) - m.yaw - (m.body ? m.body.rotation.y : 0);   // − correction de visée de l'animation (elle tourne aussi les jambes)
      while (ecart > Math.PI) ecart -= 2 * Math.PI; while (ecart < -Math.PI) ecart += 2 * Math.PI; }
    const seuil = a.recule ? 1.25 : 1.85; a.recule = v > 0.15 && Math.abs(ecart) > seuil;
    let jambes = a.recule ? ecart + (ecart > 0 ? -Math.PI : Math.PI) : ecart, sens = a.recule ? -1 : 1;
    if (v > 0.15) { a.piedsYaw = m.yaw + jambes; a.stopT = 0; }
    else {   // à l'arrêt, les pieds restent plantés là où ils étaient (même de côté) pendant que le torse pivote ;
      // ils se replacent face au torse si l'écart devient grand, ou après un moment immobile
      if (a.piedsYaw === undefined) a.piedsYaw = m.yaw; a.stopT = (a.stopT || 0) + dt;
      jambes = a.piedsYaw - m.yaw; while (jambes > Math.PI) jambes -= 2 * Math.PI; while (jambes < -Math.PI) jambes += 2 * Math.PI;
      // (au-delà de ~40° de torsion, ou après 1,2 s, les pieds se replacent par deux petits pas, comme un vrai pivot : avant,
      // la torsion allait jusqu'à 110° puis les pieds tournaient d'un coup en glissant au sol)
      // (le replacement ne repart que si les pas précédents sont finis — repas() renvoie false sinon — : la torsion des jambes est
      // gardée en attendant, pieds plantés ; avant, elle était remise à 0 et les pieds tournaient avec le corps en glissant)
      // (pivot continu : les pieds se replacent EN AVANCE sur la rotation — vitesse de lacet × 0,3 s, ≤ 34° — : le bassin passe
      // d'en avance à en retard entre deux replacements au lieu d'être toujours en retard ; avant, pendant un demi-tour en
      // visant, les jambes traînaient de 20-25° et les pieds se retrouvaient l'un derrière l'autre vus de face)
      if (Math.abs(jambes) > 0.7 || (a.stopT > 1.2 && Math.abs(jambes) > 0.25) || crouch) { if (crouch || !m.repas || m.repas() !== false) { const av = crouch ? 0 : Math.max(-0.6, Math.min(0.6, (m.yawV || 0) * (OT.PIVOT_AVANCE_TEST ?? 0.3))); a.piedsYaw = m.yaw + av; jambes = av; } }
    }
    // marche (pas la course, pas accroupi) : jambes directionnelles (soldat3d.marche) quand le modèle a les pas chassés
    // marche OU course (petites foulées) directionnelles jusqu'à 3,2 m/s ; au-delà (sprint) l'ancienne méthode. Marche ou
    // course : choisie d'après la vitesse NOMINALE du soldat (u.speed()), pas la vitesse mesurée : le premier pas de
    // simulation d'un départ est partiel (vitesse basse) et faisait jouer 0,1 s de marche avant la course
    // patrouille (pas d'ennemi connu, garde basse) : marche → petite course → course mélangées selon la vitesse lissée, à toutes
    // les vitesses ; en visant aussi, à toutes les vitesses quand le modèle a la course refaite (Pas_Run) : au-delà de 3,2 m/s,
    // l'ancienne course épaulée « Run_and_Shoot », bornée à 2,2 × sa vitesse propre (3,7 m/s), patinait de 3 m/s au sprint
    // vers un couvert sous le feu, genoux à 50-68° à la pose
    const patrouille = u.alive && !(aiming || u.preaim) && !!m.clips.Pas_Trot && !!m.clips.Walk_Low_Haut;
    a.vLis = v > 0.15 ? (a.vLis > 0.15 ? a.vLis + (v - a.vLis) * Math.min(1, dt * 4) : v) : 0;
    const dirMarche = u.alive && m.marche && m.clips.Pas_Gauche && !crouch && u.moving && v > 0.15 && (v <= 3.2 || patrouille || (OT.SPRINT_VISE_TEST !== false && !!m.clips.Pas_Run && !!m.clips.Pas_Glisse)) && !(u.reloading > 0) && !u.throwing && !battle.over;
    // (la simulation plafonne la vitesse de côté / en reculant : si la vitesse réelle reste sous 1,45 m/s plus de 0,25 s alors
    // que la nominale est au-dessus, c'est ce plafond, pas un démarrage : on marche)
    a.lentT = u.moving && v > 0.15 && v <= 1.45 ? (a.lentT || 0) + dt : 0;
    const course = (u.speed ? u.speed() : v) > 1.45 && !(a.lentT > 0.25) && !!m.clips.Pas_Avant_Course;
    // arrêt : la démarche continue ~0,3 s en ralentissant (le pied en l'air finit son pas et se pose, les pieds d'appui restent
    // cloués) au lieu de couper net ; si le soldat repart entre-temps (arrêts d'un pas de simulation en fin de bond, écartement
    // d'un allié), aucune transition du tout. Pas si l'état de visée change (le haut du corps doit réagir tout de suite).
    const viseNow = !!(aiming || u.preaim);
    const grace = !dirMarche && a.marcheVu && u.alive && m.marche && !crouch && !(u.reloading > 0) && !u.throwing && !battle.over && viseNow === a.viseVu && (a.graceT = (a.graceT || 0) + dt) < 0.3;
    if (dirMarche) { a.graceT = 0; a.vGr = v; a.viseVu = viseNow; } else if (grace) a.vGr *= Math.exp(-dt * 7);
    a.marcheVu = dirMarche || grace;
    const vM = dirMarche ? v : a.vGr || 0;
    if (dirMarche || grace) { jambes = 0; a.recule = false; a.piedsYaw = m.yaw; }
    m.jambesCible = u.alive ? jambes : 0;
    m.verrouPieds = false;   // (loco() : pieds d'appui cloués et jamais croisés aussi hors marche directionnelle, voir Soldat3D.verrou)
    const loco = (n) => { const nat = m.loco[n] || 1; m.play(n, { speed: sens * Math.max(0.4, Math.min(2.2, v / nat)), fade: a.crT > 0 ? 0.42 : 0.2 }); m.verrouPieds = true;
      const act = m.mixer.existingAction(m.clips[n]); if (act) a.phase = act.time / (m.clips[n].duration || 1) * 2 * Math.PI; };   // phase des pas (sons)
    // accroupi ↔ debout : fondu de 0,42 s (et non 0,25) : le buste descend de ~45 cm, c'est une vraie mise à genou
    if (a.crouchVu !== undefined && a.crouchVu !== crouch) a.crT = 0.45; a.crouchVu = crouch; a.crT = Math.max(0, (a.crT || 0) - dt);
    const fCr = (f) => a.crT > 0 ? 0.42 : f;
    // sortie de rechargement : fondu de 0,45 s vers la pose suivante (le haut du corps revenait en 0,25 s : à-coup du buste)
    a.relT = u.alive && u.reloading > 0 ? 0.5 : Math.max(0, (a.relT || 0) - dt); m.fadeMin = u.reloading > 0 ? 0 : a.relT > 0 ? 0.45 : a.crT > 0 ? 0.42 : 0;
    let mode = 'deux', legs = false;
    if (!u.alive) {
      mode = (a.deadT = (a.deadT || 0) + dt) > 1.6 ? 'sol' : 'droite';
      const fc = a.fallClip || 'Shot_in_the_Back_and_Fall'; m.play(fc, { speed: 1.25, fade: 0.08 });
      // le corps allongé de l'animation flotte un peu : on le redescend au sol pendant la chute
      m.pose.position.y = -(m.chuteY[fc] || 0) * Math.min(1, Math.max(0, (a.deadT - 0.4) / 1.0));
      m.ring.material.opacity = Math.max(0.15, m.ring.material.opacity - dt);
    } else if (battle.over && battle.result && battle.result.winner === u.team) { m.play('victory', { start: 0.12, fade: 0.35 }); mode = 'droite'; }
    else if (u.throwing) { m.play('Over_Shoulder_Throw', { speed: 1.6, fade: 0.12 }); mode = 'bandouliere'; }
    else if (u.reloading > 0) {
      mode = 'droite'; const rs = Math.min(2.4, clipSpeed('Standing_Reload') / Math.max(1, u.weapon.reload || 2.5));
      if (!crouch && u.moving && v > 0.15 && m.clips.Standing_Reload_Haut) {   // recharge en marchant : haut du corps seul, jambes en couche séparée
        // (jambes : celles de la marche / petite course de patrouille, posées au sol et retouchées — les cycles bruts « au pistolet »
        // flottaient de 4 à 6 cm en appui chez « soldat » et glissaient à 0,3-0,5 m/s)
        const lj = v > 1.4 ? (m.clips.Pas_Trot ? 'Pas_Trot' : 'Run_Jambes') : (m.clips.Pas_Avant_Low ? 'Pas_Avant_Low' : 'Walk_Jambes'), nat = m.loco[lj] || m.loco[v > 1.4 ? 'Run_and_Shoot' : 'Walk_Fight_Forward'] || 1;
        m.play('Standing_Reload_Haut', { speed: rs });
        m.playLegs(lj, { speed: sens * Math.max(0.4, Math.min(2.2, v / nat)) }); legs = true; m.verrouPieds = true;   // (pieds d'appui cloués aussi en rechargeant en marchant : ils glissaient de 0,3 à 0,5 m/s)
      } else { const n = crouch ? 'Kneeling_Reload' : 'Standing_Reload'; m.play(n, { speed: rs }); }
    }
    else if (dirMarche || grace) {
      const vise = aiming || u.preaim || !m.clips.Walk_Low_Haut;
      // (marche attend la direction par rapport au groupe, c.-à-d. à la visée : on rajoute la correction du corps retirée plus haut)
      let haut = course ? (vise ? 'Run_and_Shoot_Haut' : 'Run_Low_Haut') : (vise ? 'Walk_Aim_Haut' : 'Walk_Low_Haut'), avant = course ? 'Pas_Avant_Course' : vise ? 'Pas_Avant_Aim' : 'Pas_Avant_Low', mix = null;
      if (vise && m.clips.Pas_Glisse) {
        // en visant : marche « glissée » (genoux fléchis, talon-pointe) jusqu'à ~2,3 m/s, course épaulée au-delà (hystérésis)
        // (course épaulée : jambes de la petite course / course — Pas_Trot, Pas_Run — et non « Run_and_Shoot » : course accroupie de
        // 0,63 m par pas, jouée à 2,6 m/s elle faisait 248 pas/min, pieds au ras du sol, genoux à 60-90° ; la marche glissée
        // passe la main dès ~2,1 m/s : à 2,3 m/s elle faisait 212-221 pas/min)
        const CV = OT.COURSE_V_TEST || [1.95, 2.15], trotV = !!(m.clips.Pas_Trot && OT.COURSE_TROT_TEST !== false);
        if (!grace) a.courseV = a.courseV ? a.vLis > (trotV ? CV[0] : 2.2) : a.vLis > (trotV ? CV[1] : 2.45);
        if (a.courseV) { avant = 'Pas_Avant_Course'; haut = 'Run_and_Shoot_Haut';
          if (trotV) { const sm = (x, a0, a1) => { const t = Math.max(0, Math.min(1, (x - a0) / (a1 - a0))); return t * t * (3 - 2 * t); }, kR = m.clips.Pas_Run ? sm(a.vLis, 2.2, 3.7) : 0; mix = { Pas_Trot: 1 - kR, Pas_Run: kR }; avant = 'Pas_Glisse'; } }   // (référence « avant » inchangée — Pas_Glisse — : le lacet propre du bassin des clips, psi, ne saute pas au passage marche glissée → course)
        else { avant = 'Pas_Glisse'; haut = 'Walk_Aim_Haut'; }
      }
      if (patrouille) {
        // marche jusqu'à ~1,9 m/s (marche rapide), puis petite course, qui se mélange à la vraie course de 2,7 à 3,7 m/s (même
        // cadence, elle en est tirée). Marche et course ne se mélangent PAS (appuis à contretemps : mesuré, à 50/50 le pied
        // d'appui glissait de 1,2 m/s) : on passe de l'une à l'autre (fondu ~0,15 s), avec hystérésis
        const sm = (x, a0, a1) => { const t = Math.max(0, Math.min(1, (x - a0) / (a1 - a0))); return t * t * (3 - 2 * t); };
        if (!grace) a.trot = a.trot ? a.vLis > 1.8 : a.vLis > 1.95;
        // (la course entre dès 2,2 m/s : sa foulée longue allonge un peu le pas ; à 2,6 m/s la cadence passait à 206-216 pas/min)
        const kR = m.clips.Pas_Run ? sm(a.vLis, ...(OT.RUN_MIX_TEST || [2.2, 3.7])) : 0;
        mix = a.trot ? { Pas_Trot: 1 - kR, Pas_Run: kR } : { Pas_Avant_Low: 1 }; avant = 'Pas_Avant_Low';
        haut = a.trot && m.clips.Trot_Low_Haut ? 'Trot_Low_Haut' : 'Walk_Low_Haut';
      }
      const ph = m.marche(ecart + (m.body ? m.body.rotation.y : 0), vM, dt, haut, avant, mix);
      a.phase = ph * 2 * Math.PI;
    }
    else if (u.moving && v > 0.15) {
      if (crouch) loco(m.clips.Accroupi_Marche_Vise ? (aiming || u.preaim ? 'Accroupi_Marche_Vise' : 'Accroupi_Marche_Bas') : 'Cautious_Crouch_Walk_Forward');   // (haut du corps en visée ou garde basse, voir Soldat3D.compositeAccroupi)
      else if (aiming || u.preaim) loco(v > 1.4 ? 'Run_and_Shoot' : 'Walk_Aim');          // ennemi connu : fusil épaulé
      else loco(v > 1.4 ? (m.clips.Run_Low ? 'Run_Low' : 'Run_and_Shoot') : (m.clips.Walk_Low ? 'Walk_Low' : 'Walk_Aim'));   // sinon garde basse
    }
    else if (crouch) { if (m.clips.Accroupi_Vise) m.play(aiming ? 'Accroupi_Vise' : 'Accroupi_Bas', { time: 0, fade: fCr(0.25) }); else m.play('Kneeling_Reload', { time: 0.06, fade: fCr(0.25) }); }
    else if (aiming || !m.clips.Garde_Basse) m.play('Rifle_Aim_Turn_Right', { time: 0, fade: fCr(0.25) });
    else m.play('Garde_Basse', { time: 0, fade: fCr(0.3) });
    if (!legs) m.playLegs(null);
    if (u.alive) { m.ring.material.opacity = 0.55; a.deadT = 0; m.pose.position.y = 0; }
    // la tête regarde la cible (position affichée de son soldat) ; sans cible, Soldat3D fait de lents coups d'œil au repos
    m.regard = u.alive && u.target && u.target.alive ? ((meshes[u.target.id] && meshes[u.target.id].group.position) || u.target) : null;
    m.update(dt, !u.alive);
    // inclinaison dans les virages en courant (le torse se penche vers l'intérieur de la courbe)
    { const va = Math.atan2(a.vz || 0, a.vx || 0), sp = Math.hypot(a.vx || 0, a.vz || 0); let tr = a.vAng === undefined ? 0 : va - a.vAng; while (tr > Math.PI) tr -= 2 * Math.PI; while (tr < -Math.PI) tr += 2 * Math.PI; a.vAng = va;
      const want = u.alive && sp > 1 && dt > 0 ? Math.max(-0.16, Math.min(0.16, (tr / dt) * sp * 0.025)) : 0; a.bank = lerp(a.bank || 0, want, Math.min(1, dt * 5));
      // (sur l'os du buste qui porte la peau — « dos » = Spine pour les modèles Meshy, voir soldat3d — sinon seuls bras et tête bougeaient)
      const dos = m.bones.dos || m.bones.spine;
      if (dos && Math.abs(a.bank) > 0.005) { m.mod(dos); dos.rotation.z += a.bank; } }
    if (m.bones.spine && (a.recoil > 0 || a.flinch > 0)) {
      const dos = m.bones.dos || m.bones.spine;
      m.mod(dos); dos.rotation.x -= a.recoil * 0.05;
      if (a.flinch > 0 && u.alive) {   // impact : le torse encaisse dans le sens de la balle (secousse brève), la tête suit
        const hd = a.hitDir || { x: 0, z: 0 }, fw = hd.x * Math.sin(m.yaw) + hd.z * Math.cos(m.yaw), sd = hd.x * Math.cos(m.yaw) - hd.z * Math.sin(m.yaw);
        // (enveloppe sin² sur les 0,25 s de la secousse : vitesse nulle au départ et à la fin, pic à 125 ms — avant, pic à 70 ms :
        // attaque en 2 images, tête à 15 000-18 000 °/s² en jeu ; et encore avant, 40 % de la secousse dès la 1re image)
        const si = Math.sin(Math.PI * Math.min(1, (1 - a.flinch) / 4 / 0.25)), e = si * si;
        dos.rotation.x += fw * 0.32 * e; dos.rotation.z -= sd * 0.22 * e; dos.rotation.y += sd * 0.28 * e;
        if (m.bones.head) { m.mod(m.bones.head); m.bones.head.rotation.x += fw * 0.25 * e; m.bones.head.rotation.z -= sd * 0.2 * e; }
      }
    }
    m.placeWeapon(mode === 'deux', a.recoil, mode);
    if (m.rag && OT.Ragdoll) OT.Ragdoll.releve(u, m, dt);   // relevé après un ragdoll : fondu depuis la pose allongée
    chargeur(u, m, a);
  }
  // Chargeur pendant le rechargement : il tombe de l'arme, un neuf apparaît dans la main gauche, puis rejoint le puits
  // de chargeur. (Le chargeur est un maillage à part du fusil, voir Modeles3D.)
  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
  function chargeur(u, m, a) {
    const w = m.weapon, mag = w && w.mag; if (!mag || !w.magCenter) return;
    if (!(u.alive && u.reloading > 0)) { if (a.relMax) { a.relMax = 0; mag.position.copy(w.magHome); mag.visible = true; } return; }
    if (!a.relMax || u.reloading > a.relMax) a.relMax = u.reloading;
    const f = 1 - u.reloading / a.relMax; w.updateMatrixWorld(true);
    const home = w.localToWorld(_v1.copy(w.magCenter)), down = w.localToWorld(_v2.set(0, -1, 0)).sub(w.localToWorld(_v3.set(0, 0, 0))).normalize();
    let target = null; mag.visible = true;
    if (f < 0.22) target = home.clone();
    else if (f < 0.36) { const k = (f - 0.22) / 0.14; target = home.clone().addScaledVector(down, k * k * 0.9); if (k > 0.85) mag.visible = false; }
    else if (f < 0.42) mag.visible = false;
    else {
      const lm = m.bones && (m.bones.lm || m.bones.lh); if (!lm) { target = home.clone(); }
      else { const hand = lm.getWorldPosition(new THREE.Vector3()).addScaledVector(down, 0.06); const k = f < 0.7 ? 0 : Math.min(1, (f - 0.7) / 0.15); target = hand.lerp(home, k * k * (3 - 2 * k)); }
    }
    if (!target) return;
    const p = mag.parent; const origin = p.localToWorld(_v3.copy(w.magHome)); origin.add(target.sub(home));
    mag.position.copy(p.worldToLocal(origin));
  }
  function animateOperator(u, m, dt) {
    if (m.isSkinned) return animateSkinned(u, m, dt);
    const a = m.anim;
    a.crouch = lerp(a.crouch, u.alive && u.stance === 'crouch' ? 1 : 0, Math.min(1, dt * 8));
    a.aim = lerp(a.aim, u.alive && (u.target || u.state === 'engage' || u.state === 'overwatch' || u.state === 'capture') ? 1 : 0, Math.min(1, dt * 6));
    if (!u.alive) a.fall = Math.min(1, Math.max(0, (simTime + postEnd - (u.downAt || 0)) * 2.2));
    a.recoil = Math.max(0, a.recoil - dt * 10); a.flinch = Math.max(0, a.flinch - dt * 4);
    const walking = u.alive && u.moving, running = walking && (u.state === 'closing' || u.state === 'crossing' || u.state === 'retreat' || u.state === 'evade' || u.state === 'tozone');
    if (walking) a.phase += dt * (running ? 11 : 8.5);
    const swing = walking ? Math.sin(a.phase) : 0, swingAmp = (running ? 0.7 : 0.5) * (1 - a.crouch * 0.6);
    // jambes : hanche et genou ; accroupi = cuisses vers l'avant, genoux pliés, bassin abaissé
    m.legs[0].leg.rotation.x = swing * swingAmp - a.crouch * 1.15; m.legs[0].knee.rotation.x = Math.max(0, -swing) * 0.9 + a.crouch * 1.75;
    m.legs[1].leg.rotation.x = -swing * swingAmp - a.crouch * 0.55; m.legs[1].knee.rotation.x = Math.max(0, swing) * 0.9 + a.crouch * 1.95;
    m.hips.position.y = m.hipsY - a.crouch * 0.4 + (walking ? Math.abs(Math.cos(a.phase)) * 0.03 : 0);
    // torse : penché en avant en course ou accroupi, recul au tir, tressaillement à l'impact ; épaule gauche avancée en visée
    m.torso.rotation.x = a.crouch * 0.3 + (running ? 0.22 : walking ? 0.08 : 0) - a.recoil * 0.06 + a.flinch * 0.25;
    m.torso.rotation.y = a.aim * 0.18;
    m.torso.rotation.z = a.flinch * 0.15 * Math.sin(a.phase * 3);
    m.headG.rotation.x = -a.crouch * 0.25 - (running ? 0.15 : 0) - a.flinch * 0.2; m.headG.rotation.y = -a.aim * 0.16;
    // rechargement, lancer de grenade, aveuglement : la pose des bras suit l'arme (cinématique inverse)
    a.reload = lerp(a.reload || 0, u.alive && u.reloading > 0 ? 1 : 0, Math.min(1, dt * 10));
    a.throwT = u.alive && u.throwing ? Math.min(1, (a.throwT || 0) + dt * 1.8) : Math.max(0, (a.throwT || 0) - dt * 4);
    const blind = u.alive && u.blindUntil > simTime;
    Figure.armPose(m, u.alive ? a.aim * (1 - a.reload * 0.7) : 0.15, { recoil: a.recoil, reload: a.reload, throwT: a.throwT, blind });
    if (a.reload > 0.05) m.headG.rotation.x += a.reload * 0.3;
    if (blind) m.headG.rotation.x += 0.25;
    // chute
    if (u.alive && a.fall > 0) { a.fall = Math.max(0, a.fall - dt * 1.4); if (a.fall === 0) { m.pose.rotation.set(0, 0, 0); m.pose.position.y = 0; m.ring.material.opacity = 0.8; } }   // relevé par un allié
    if (a.fall > 0) { const f = a.fall < 0.5 ? 2 * a.fall * a.fall : 1 - Math.pow(-2 * a.fall + 2, 2) / 2; m.pose.rotation.x = -Math.PI / 2 * f * 0.95; m.pose.rotation.z = a.fallDir * 0.4 * f; m.pose.position.y = 0.22 * f; m.ring.material.opacity = 0.8 - 0.6 * f; }
  }


  // traçantes et impacts : petits cylindres lumineux (visibles), éclair de bouche, étincelles, poussière
  const fx = []; // { obj, until, vel?, kind }
  const tracerMats = [new THREE.MeshBasicMaterial({ color: 0xfff0b8 }), new THREE.MeshBasicMaterial({ color: 0xffcf96 })];
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffd36a });
  const dustMat = new THREE.MeshStandardMaterial({ color: 0x9a948c, transparent: true, opacity: 0.55, roughness: 1 });
  const bloodMat = new THREE.MeshBasicMaterial({ color: 0x8e2a1f });
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffe59a, transparent: true, opacity: 0.9 });
  const tracerGeo = new THREE.CylinderGeometry(0.018, 0.018, 1, 5), sparkGeo = new THREE.SphereGeometry(0.035, 5, 4), dustGeo = new THREE.SphereGeometry(0.12, 6, 5), flashGeo = new THREE.SphereGeometry(0.11, 7, 6);
  // normale de la surface touchée : sol, ou face de l'obstacle le plus proche du point d'impact
  function surfaceNormal(p) {
    if (p.y < 0.15) return new THREE.Vector3(0, 1, 0);
    let best = null, bd = 1.5;
    for (const o of battle.map.obstacles) { if (p.y > o.h + 0.3) continue; const d = Math.hypot(Math.max(o.x - p.x, 0, p.x - (o.x + o.w)), Math.max(o.z - p.z, 0, p.z - (o.z + o.d))); if (d < bd) { bd = d; best = o; } }
    if (!best) return new THREE.Vector3(0, 1, 0);
    const o = best, faces = [[p.x - o.x, -1, 0], [o.x + o.w - p.x, 1, 0], [p.z - o.z, 0, -1], [o.z + o.d - p.z, 0, 1], [Math.abs(o.h - p.y), 0, 0, 1]];
    let f = faces[0]; for (const c of faces) if (Math.abs(c[0]) < Math.abs(f[0])) f = c;
    return f.length === 4 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(f[1], 0, f[2]);
  }
  const BULLET = 140;   // vitesse apparente des traçantes (m/s)
  function addShot(ev, team, cache) {   // cache : tireur non repéré (ni éclair, ni traçante, ni douille ; l'impact reste)
    const from = new THREE.Vector3(ev.from.x, ev.from.y, ev.from.z), to = new THREE.Vector3(ev.to.x, ev.to.y, ev.to.z);
    const m = meshes[ev.shooter], sh = unitById[ev.shooter];
    if (m) { m.anim.recoil = 1; const mz = m.weapon.localToWorld(m.weapon.muzzle.clone()); from.copy(mz); }
    const dir = to.clone().sub(from), len = dir.length(); dir.normalize();
    const delay = len / BULLET;
    if (ev.hit && OT.Ragdoll && meshes[ev.target]) OT.Ragdoll.impact(meshes[ev.target], dir, delay);   // balle mortelle → ragdoll
    if (cache) {
      if (EFX && !ev.hit) { const n = surfaceNormal(to); EFX.impact(to, n, to.y < 0.15 ? 'impact_sol' : impactSound(to), delay); }
      else if (EFX && ev.hit && fogShown(unitById[ev.target])) EFX.bloodHit(to, dir, delay);
      return;
    }
    if (EFX) {
      EFX.muzzle(from, dir, !!(sh && sh.weapon.silenced));
      EFX.tracer(from, to, BULLET, team);
      if (m && m.weapon.gripPt) {   // douille éjectée à droite de l'arme (fenêtre d'éjection au-dessus de la poignée)
        const w = m.weapon; w.updateMatrixWorld(true);
        const port = w.localToWorld(w.gripPt.clone().add(new THREE.Vector3(-0.025, 0.075, 0.1)));
        const q = w.getWorldQuaternion(new THREE.Quaternion()), right = new THREE.Vector3(-1, 0, 0).applyQuaternion(q), up = new THREE.Vector3(0, 1, 0).applyQuaternion(q), fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
        EFX.casing(port, right, up, fwd);
      }
      if (ev.hit) { const tm = meshes[ev.target]; if (tm) { tm.anim.flinch = 1; tm.anim.hitDir = { x: dir.x, z: dir.z }; } if (fogShown(unitById[ev.target])) EFX.bloodHit(to, dir, delay); }
      else { const n = surfaceNormal(to); EFX.impact(to, n, to.y < 0.15 ? 'impact_sol' : impactSound(to), delay); }
      return;
    }
    // (sans effets.js) traçante simple
    const tr = new THREE.Mesh(tracerGeo, tracerMats[team]); tr.scale.y = Math.min(2.2, len); tr.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    scene.add(tr); fx.push({ obj: tr, kind: 'tracer', from, to, len, t0: simTime, speed: 110, until: simTime + len / 110 + 0.03 });
  }
  // effets de tactiques : nappe de fumée, obus, soins, drone
  const smokeMat = new THREE.MeshStandardMaterial({ color: 0xc9c9c4, transparent: true, opacity: 0.55, roughness: 1, depthWrite: false });
  function addSmoke(ev) {
    DIRECTOR.smokes = DIRECTOR.smokes.filter(k => k.until > simTime); DIRECTOR.smokes.push({ x: ev.x, z: ev.z, r: ev.r || 3, until: ev.until });   // le réalisateur évite de poser la caméra dans la fumée
    if (EFX) { EFX.smoke(ev.x, ev.z, ev.r, Math.max(2, ev.until - simTime)); return; }
    const g = new THREE.Group();
    for (let i = 0; i < 14; i++) { const r = 1.2 + Math.random() * 1.6; const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), smokeMat.clone()); m.position.set(ev.x + (Math.random() - 0.5) * ev.r * 1.6, 0.8 + Math.random() * 1.6, ev.z + (Math.random() - 0.5) * ev.r * 1.6); m.userData.drift = new THREE.Vector3((Math.random() - 0.5) * 0.15, 0.08 + Math.random() * 0.1, (Math.random() - 0.5) * 0.15); g.add(m); }
    scene.add(g); fx.push({ obj: g, kind: 'smoke', until: ev.until, start: simTime });
  }
  function addShell(ev) {
    if (EFX) { EFX.explosion({ x: ev.x, z: ev.z }); return; }
    const flash = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.9 })); flash.position.set(ev.x, 0.8, ev.z); scene.add(flash); fx.push({ obj: flash, until: simTime + 0.25, grow: 3 , start: simTime });
    for (let i = 0; i < 10; i++) { const d = new THREE.Mesh(dustGeo, dustMat); d.position.set(ev.x, 0.3, ev.z); d.scale.setScalar(1.5 + Math.random()); scene.add(d); fx.push({ obj: d, until: simTime + 1.6, start: simTime, vel: new THREE.Vector3((Math.random() - 0.5) * 6, 2 + Math.random() * 4, (Math.random() - 0.5) * 6), gravity: 4 }); }
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(2.2, 16), new THREE.MeshBasicMaterial({ color: 0x1a1612, transparent: true, opacity: 0.7 })); scorch.rotation.x = -Math.PI / 2; scorch.position.set(ev.x, 0.02, ev.z); scene.add(scorch); fx.push({ obj: scorch, until: simTime + 60 });
  }
  function addHeal(ev) { const m = meshes[ev.unit]; if (!m) return; const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 24), new THREE.MeshBasicMaterial({ color: 0x5fc46a, transparent: true, opacity: 0.9, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; m.group.add(ring); fx.push({ obj: ring, until: simTime + 5, kind: 'heal', parent: m.group }); }
  function addReco(ev) { const team = battle.teams[ev.team]; const c = battle.teamCentroid(team); const drone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.2, 4), new THREE.MeshBasicMaterial({ color: ev.team === 0 ? 0x4f9cf0 : 0xe85a4f })); drone.position.set(c.x, 9, c.z); scene.add(drone); fx.push({ obj: drone, until: ev.until, kind: 'drone', cx: c.x, cz: c.z }); }
  function addBarrageMarker(ev) { const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3, 32), new THREE.MeshBasicMaterial({ color: 0xff7a3a, transparent: true, opacity: 0.8, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.set(ev.x, 0.04, ev.z); scene.add(ring); fx.push({ obj: ring, until: simTime + 4.2, kind: 'marker' }); }
  let fxLast = 0;
  // grenade : petit objet sombre en cloche jusqu'au point de chute, puis posée au sol jusqu'à l'explosion
  const grenadeGeo = new THREE.SphereGeometry(0.07, 8, 6), grenadeMat = new THREE.MeshStandardMaterial({ color: 0x2c3326, roughness: .7, metalness: .3 });
  function addGrenade(ev, cache) {   // cache : lanceur non repéré → la grenade n'apparaît qu'en fin de course (on ne voit pas d'où elle part)
    const g = new THREE.Mesh(grenadeGeo, ev.kind === 'flash' ? new THREE.MeshStandardMaterial({ color: 0x5b6067, roughness: .5, metalness: .5 }) : grenadeMat);
    scene.add(g); fx.push({ obj: g, kind: 'grenade', start: simTime, flight: ev.flight, from: ev.from, to: ev.to, until: ev.explodeAt, bounced: false, cache });
  }
  function addBlast(ev) {
    if (ev.kind === 'flash' && EFX) {
      EFX.flashbang({ x: ev.x, z: ev.z }); play('flashbang', { x: ev.x, y: 1, z: ev.z }, { vol: 1.2, espace: true });
      const p = new THREE.Vector3(ev.x, 0.8, ev.z).project(camera); if (p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1) { const wv = $('#whiteout'); wv.classList.remove('on'); wv.offsetWidth; wv.classList.add('on'); }
    } else if (EFX) {
      EFX.explosion({ x: ev.x, z: ev.z }); play('explosion', { x: ev.x, y: 1, z: ev.z }, { vol: 1.3, espace: true }); cam.shake = Math.max(cam.shake || 0, 0.5);
    } else if (ev.kind === 'flash') {
      const light = new THREE.PointLight(0xffffff, 60, 18); light.position.set(ev.x, 1.2, ev.z); scene.add(light); fx.push({ obj: light, kind: 'flashlight', start: simTime, until: simTime + 0.35 });
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 })); s.position.set(ev.x, 0.6, ev.z); scene.add(s); fx.push({ obj: s, until: simTime + 0.18, grow: 6, start: simTime });
      for (let i = 0; i < 5; i++) { const d = new THREE.Mesh(dustGeo, dustMat); d.position.set(ev.x, 0.3, ev.z); d.scale.setScalar(2 + Math.random()); scene.add(d); fx.push({ obj: d, until: simTime + 2.2, start: simTime, vel: new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2), gravity: 0.3 }); }
      play('flashbang', { x: ev.x, y: 1, z: ev.z }, { vol: 1.2, espace: true });
      // le joueur voit l'éclair : voile blanc bref si la caméra regarde la zone
      const p = new THREE.Vector3(ev.x, 0.8, ev.z).project(camera); if (p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1) { const wv = $('#whiteout'); wv.classList.remove('on'); wv.offsetWidth; wv.classList.add('on'); }
    } else {
      addShell(ev);
      const light = new THREE.PointLight(0xffa040, 40, 16); light.position.set(ev.x, 1.0, ev.z); scene.add(light); fx.push({ obj: light, kind: 'flashlight', start: simTime, until: simTime + 0.3 });
      play('explosion', { x: ev.x, y: 1, z: ev.z }, { vol: 1.3, espace: true });
      cam.shake = Math.max(cam.shake || 0, 0.5);
    }
  }
  // frappe aérienne : marquage de la bande, puis l'avion qui passe et les impacts en ligne
  function addStrikeMarker(ev) {
    const len = ev.half * 2, m = new THREE.Mesh(new THREE.PlaneGeometry(4, len), new THREE.MeshBasicMaterial({ color: 0xff7a3a, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(ev.dx, ev.dz); m.position.set(ev.x, 0.05, ev.z); scene.add(m); fx.push({ obj: m, until: ev.at, kind: 'marker' });
  }
  function addStrike(ev) {
    const plane = new THREE.Group(); const body = new THREE.Mesh(new THREE.ConeGeometry(0.9, 7, 8), new THREE.MeshStandardMaterial({ color: 0x4a5058, metalness: 0.6, roughness: 0.4 })); body.rotation.x = Math.PI / 2; plane.add(body);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(9, 0.15, 1.6), body.material); wing.position.z = -0.8; plane.add(wing);
    plane.rotation.y = Math.atan2(ev.dx, ev.dz); scene.add(plane);
    fx.push({ obj: plane, kind: 'plane', start: simTime, until: simTime + 2.2, ax: ev.cx - ev.dx * 60, az: ev.cz - ev.dz * 60, bx: ev.cx + ev.dx * 60, bz: ev.cz + ev.dz * 60 });
    for (let k = -ev.half; k <= ev.half; k += 2.5) { const x = ev.cx + ev.dx * k + (Math.random() - 0.5) * 2, z = ev.cz + ev.dz * k + (Math.random() - 0.5) * 2; const d = new THREE.Mesh(dustGeo, dustMat); d.position.set(x, 0.2, z); d.scale.setScalar(2); scene.add(d); const t0 = simTime + 0.9 + (k + ev.half) / (ev.half * 2) * 0.5; fx.push({ obj: d, until: t0 + 1.2, start: t0, vel: new THREE.Vector3(0, 3 + Math.random() * 3, 0), gravity: 6 }); }
    for (let k = 0; k < 5; k++) setTimeout(() => play('tir_556_moyen', { x: ev.cx, y: 2, z: ev.cz }, { vol: 1.2, vitesse: 0.62, varie: 0.03, espace: true }), k * 75);   // rafale du canon de l'avion
    setTimeout(() => play('explosion_lourde', { x: ev.cx, y: 1, z: ev.cz }, { vol: 1, espace: true }), 400);
    cam.shake = Math.max(cam.shake || 0, 0.6);
  }
  // corps qui touche le sol (chute animée ou pantin physique) : bouffée de poussière, ou gerbe d'eau sous la pluie
  function fallDust() {
    if (!EFX || !battle) return;
    for (const u of battle.units) {
      const m = meshes[u.id]; if (!m || !m.isSkinned) continue;
      const p = bodyPos(m);
      if (p.y > 0.75) { m._dusted = false; continue; }   // (bassin d'un corps allongé : ~0,45 m au-dessus du sol)
      if (m._dusted || p.y > 0.52) continue;
      m._dusted = true;
      if (condNow === 'pluie') { EFX.footstep(p.x, p.z, true, 3); EFX.footstep(p.x + 0.3, p.z - 0.2, true, 3); } else EFX.dustPuff(p.x, p.z, 2);
    }
  }
  function updateFx() {
    fallDust();
    const dt = Math.max(0, simTime - fxLast); fxLast = simTime;
    if (EFX) { const k = condNow === 'nuit' ? 0.2 : 1; EFX.update(Math.min(0.1, frameDt), camera, sun.color.clone().multiplyScalar(0.55 * k).add(new THREE.Color(0.25, 0.27, 0.3).multiplyScalar(0.35 + 0.65 * k)), scene.fog); }   // fumée et poussière sombres de nuit (la lune éclaire peu)
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      if (f.kind === 'tracer') {
        const d = Math.min(f.len, (simTime - f.t0) * f.speed), head = Math.max(0, d - f.obj.scale.y);
        const p = f.from.clone().lerp(f.to, (head + d) / 2 / f.len); f.obj.position.copy(p);
      } else if (f.vel) {
        if (simTime >= f.start) { f.obj.visible = true; f.obj.position.addScaledVector(f.vel, dt); f.vel.y -= f.gravity * dt; if (f.obj.position.y < 0.02) { f.obj.position.y = 0.02; f.vel.multiplyScalar(0.3); } }
        else f.obj.visible = false;
      } else if (f.grow) { if (simTime >= f.start) { f.obj.visible = true; const k = 1 + (simTime - f.start) * f.grow; f.obj.scale.setScalar(k); } else f.obj.visible = false; }
      else if (f.kind === 'smoke') { const life = (simTime - f.start) / (f.until - f.start); for (const m of f.obj.children) { m.position.addScaledVector(m.userData.drift, dt); m.material.opacity = 0.55 * (life < 0.1 ? life / 0.1 : 1 - Math.max(0, (life - 0.6) / 0.4)); m.scale.setScalar(1 + life * 0.6); } }
      else if (f.kind === 'drone') { const a = simTime * 1.4; f.obj.position.set(f.cx + Math.cos(a) * 6, 9 + Math.sin(a * 2) * 0.4, f.cz + Math.sin(a) * 6); f.obj.rotation.y = a; }
      else if (f.kind === 'grenade') {
        const k = Math.min(1, (simTime - f.start) / f.flight);
        if (f.cache) f.obj.visible = k > 0.6 || !fogOn();
        if (k < 1) { f.obj.position.set(f.from.x + (f.to.x - f.from.x) * k, f.from.y + (f.to.y - f.from.y) * k + Math.sin(Math.PI * k) * (1.2 + f.flight * 1.5), f.from.z + (f.to.z - f.from.z) * k); f.obj.rotation.x += dt * 12; }
        else { f.obj.position.set(f.to.x, 0.07, f.to.z); if (!f.bounced) { f.bounced = true; play('grenade_rebond', { x: f.to.x, y: 0.2, z: f.to.z }, { vol: 1 }); } }
      }
      else if (f.kind === 'plane') { const k = (simTime - f.start) / 2.2; f.obj.position.set(f.ax + (f.bx - f.ax) * k, 18 - Math.sin(Math.PI * k) * 8, f.az + (f.bz - f.az) * k); }
      else if (f.kind === 'flashlight') { f.obj.intensity *= Math.max(0, 1 - dt * 12); }
      else if (f.kind === 'marker') { f.obj.material.opacity = 0.5 + 0.5 * Math.sin(simTime * 8); }
      else if (f.kind === 'heal') { f.obj.rotation.z = simTime * 2; f.obj.material.opacity = 0.5 + 0.4 * Math.sin(simTime * 6); }
      if (simTime > f.until) { (f.parent || scene).remove(f.obj); fx.splice(i, 1); }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Sons : lecteur de la boîte à outils (window.Son), spatialisés par rapport à la caméra, densité limitée aux vitesses élevées
  // ---------------------------------------------------------------------------------------------
  let muted = false; try { muted = localStorage.getItem('ot-mute') === '1'; } catch (e) { /* stockage indisponible */ }
  // ---- Réglages (volume général, musique, vitesse et caméra par défaut, qualité, ombres) : gardés dans ce navigateur ----
  const SETTINGS = Object.assign({ vol: 0.9, music: 1, speed: 1, cam: 'director', quality: 'haute', shadows: true, voice: true, fog: true, ordAdv: true }, (() => { try { return JSON.parse(localStorage.getItem('ot-settings') || '{}'); } catch (e) { return {}; } })());
  try { const m = localStorage.getItem('ot-music'); if (m !== null && localStorage.getItem('ot-settings') === null) SETTINGS.music = parseFloat(m) || 0; } catch (e) { /* rien */ }
  function applyQuality() {
    const dpr = window.devicePixelRatio || 1;
    renderer.setPixelRatio(SETTINGS.quality === 'haute' ? Math.min(dpr, 2) : SETTINGS.quality === 'moyenne' ? 1 : 0.7);
    if (RENDU && RENDU.setQuality) RENDU.setQuality(SETTINGS.quality);
    if (renderer.shadowMap.enabled !== !!SETTINGS.shadows) { renderer.shadowMap.enabled = !!SETTINGS.shadows; scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; }); }); }
    resize();
  }
  window.OT_SETTINGS = {
    get: (k) => k ? SETTINGS[k] : Object.assign({}, SETTINGS),
    set(k, v) {
      SETTINGS[k] = v; try { localStorage.setItem('ot-settings', JSON.stringify(SETTINGS)); } catch (e) { /* rien */ }
      if (k === 'vol' && window.Son) Son.volume(v);
      if (k === 'music') window.OT_MUSIC.set(v);
      if (k === 'speed') { speed = v; document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', parseFloat(b.dataset.speed) === v)); }
      if (k === 'quality' || k === 'shadows') applyQuality();
    },
  };
  const recent = {};
  // Espace sonore (caméra = oreille) : volume selon la distance, panoramique selon la position à l'écran, aigus avalés par
  // l'air au loin et par un obstacle entre la source et la caméra ; pour les détonations (o.espace) : écho des façades,
  // réverbération de plein air qui grandit avec la distance, et retard du son au-delà de 40 m (343 m/s).
  const ECHO = { parking: 0.75, place: 1, entrepot: 1, raffinerie: 0.7, gare: 1 };
  function spatial(x, y, z) {
    const p = new THREE.Vector3(x, y, z), c = camera.position, d = p.distanceTo(c);
    const occl = !!(battle && battle.map && d > 2 && boomHit(x, y, z, c.x, c.y, c.z) < 0.97);
    const vol = Math.max(0.05, Math.min(1, 26 / (d + 8))) * (occl ? 0.6 : 1);
    const proj = p.project(camera);
    return { d, occl, vol, pan: Math.max(-0.8, Math.min(0.8, proj.x * 0.8)), filtre: Math.min(20000, 22000 * Math.exp(-d / 70)) * (occl ? 0.22 : 1) };
  }
  function play(name, pos, o) {
    if (muted || !window.Son) return;
    Son.volume(SETTINGS.vol);
    const now = performance.now();
    const minGap = { pas: 60, pas_mouille: 60, tir_556_proche: 30, tir_556_moyen: 30, tir_556_loin: 30, tir_silencieux: 30, impact_beton: 50, impact_corps: 50, impact_metal: 50, impact_bois: 50, impact_sol: 50, impact_carrosserie: 50, douilles: 120, claquement: 60, sifflement: 60 }[name] || 0;
    if (minGap && recent[name] && now - recent[name] < minGap / Math.min(2, speed)) return;
    recent[name] = now;
    const opt = Object.assign({ varie: 0.04 }, o || {}), espace = opt.espace; delete opt.espace;
    if (pos) {
      const sp = spatial(pos.x, pos.y || 1, pos.z); opt.vol = (opt.vol == null ? 1 : opt.vol) * sp.vol; opt.pan = sp.pan; opt.filtre = sp.filtre;
      if (espace) {
        const e = battle ? ECHO[battle.map.id] || 0.8 : 0.8;
        opt.ext = Math.min(0.6, 0.12 + sp.d / 110) * (sp.occl ? 1.4 : 1);
        opt.echo = { t: 0.07 + Math.random() * 0.14, g: 0.22 * e * (sp.d > 60 ? 0.6 : 1), f: 2200 };
        if (sp.d > 40) opt.delai = (opt.delai || 0) + (sp.d - 40) / 343;
      }
    }
    Son.jouer(name, opt);
  }
  // Coup de feu : vrai enregistrement du 5,56 choisi selon la distance d'écoute (près / mi-distance / loin), silencieux à
  // part ; étuis qui tintent près de la caméra ; claquement ou sifflement quand la balle passe tout près de la caméra.
  function shotSound(sh, ev, cache) {   // (tireur non repéré : le coup de feu s'entend toujours, mais pas les douilles)
    const f = ev.from, sp = spatial(f.x, f.y || 1.4, f.z), v = ev.suppressive ? 0.85 : 1;
    if (sh.weapon.silenced) play('tir_silencieux', f, { vol: v, espace: true });
    else play('tir_556_' + (sp.d < 28 ? 'proche' : sp.d < 70 ? 'moyen' : 'loin'), f, { vol: v * 1.3, espace: true, varie: 0.03 });
    if (sp.d < 16 && !cache && Math.random() < 0.3) pendingSounds.push({ at: simTime + 0.45 + Math.random() * 0.4, name: 'douilles', pos: { x: f.x, y: 0.1, z: f.z }, vol: 0.9 });
    const c = camera.position, t = ev.to, dx = t.x - f.x, dy = (t.y || 1) - (f.y || 1.4), dz = t.z - f.z, L2 = dx * dx + dy * dy + dz * dz || 1;
    const k = ((c.x - f.x) * dx + (c.y - (f.y || 1.4)) * dy + (c.z - f.z) * dz) / L2;
    if (k > 0.05 && k < 0.98) { const m = Math.hypot(f.x + dx * k - c.x, (f.y || 1.4) + dy * k - c.y, f.z + dz * k - c.z);
      if (m < 4) pendingSounds.push({ at: simTime + Math.sqrt(L2) * k / 900, name: m < 1.8 ? 'claquement' : 'sifflement', pos: null, vol: m < 1.8 ? 0.9 : 0.8 - m * 0.1 }); }
  }
  const AMBIENCE = { entrepot: 'ambiance_port', raffinerie: 'ambiance_port', place: 'ambiance_ville', parking: 'ambiance_ville', gare: 'ambiance_port' };
  // couche météo (boucle « meteo ») : pluie, vent du brouillard, insectes la nuit, oiseaux le jour ; ponctuations rares
  // (sirène très lointaine la nuit, tonnerre sous la pluie). Le son long vient du paquet hd/sons_hd.json, la boucle courte
  // incluse dans la page sert en attendant (ou sans paquet).
  const METEO = { pluie: ['pluie', 'pluie_courte', 0.75, 'tonnerre'], brouillard: ['vent', 'vent_court', 0.8, null], nuit: ['nuit', null, 0.9, 'sirene'], jour: ['oiseaux', null, 0.6, null] };
  let ambOn = false, ponctT = null;
  function meteoSound() {
    if (!window.Son || !ambOn || muted || !battle) return;
    const m = METEO[condNow] || METEO.jour;
    Son.boucle(AMBIENCE[battle.map.id] || 'ambiance_port', { voie: 'ambiance', vol: condNow === 'pluie' ? 0.55 : 0.9 });
    Son.boucle(m[0], { voie: 'meteo', vol: m[2], secours: m[1], fondu: 2.5 });
    clearTimeout(ponctT); if (!m[3]) return;
    const next = () => { ponctT = setTimeout(() => { if (ambOn && !muted && !paused) Son.jouer(m[3], { vol: m[3] === 'sirene' ? 0.22 : 0.45, pan: Math.random() * 1.4 - 0.7, filtre: m[3] === 'sirene' ? 1500 : 5000, varie: 0.03 }); next(); }, (35 + Math.random() * 70) * 1000); };
    next();
  }
  let musicVol = SETTINGS.music;
  // ambiance + musique : la musique de bataille remplace celle du QG ; tout s'arrête en sourdine
  function ambience(on) {
    if (!window.Son) return;
    ambOn = !!on && !muted;
    if (!on || muted) { clearTimeout(ponctT); Son.arreterBoucle(0.8, 'ambiance'); Son.arreterBoucle(1.2, 'meteo'); if (!on && !muted) Son.boucle('musique_qg', { voie: 'musique', vol: 0.8 * musicVol, fondu: 2 }); if (muted) Son.arreterBoucle(0.6, 'musique'); return; }
    if (battle) { meteoSound(); Son.boucle('musique_bataille', { voie: 'musique', vol: 0.7 * musicVol, fondu: 1.5 }); }
  }
  window.OT_MUSIC = { set(v) { musicVol = v; SETTINGS.music = v; try { localStorage.setItem('ot-music', String(v)); localStorage.setItem('ot-settings', JSON.stringify(SETTINGS)); } catch (e) { /* rien */ } if (window.Son) Son.volumeBoucle('musique', (battle && !$('#app').classList.contains('hidden') ? 0.7 : 0.8) * v); }, get: () => musicVol };
  function setMuted(m) { muted = m; try { localStorage.setItem('ot-mute', m ? '1' : '0'); } catch (e) { /* rien */ } if (OT.Ico) $('#mute').innerHTML = OT.Ico(m ? 'sonoff' : 'son'); else $('#mute').textContent = m ? '🔇' : '🔊'; $('#mute').title = m ? 'Son coupé (cliquer pour l\'activer)' : 'Son activé (cliquer pour le couper)'; $('#mute').classList.toggle('muted', m); ambience(!m && !$('#app').classList.contains('hidden')); }
  $('#mute').addEventListener('click', () => setMuted(!muted));
  window.OT_MUTE = { get: () => muted, set: (m) => setMuted(!!m) };
  document.addEventListener('click', (e) => { if (e.target.closest('button') && !e.target.closest('#mute')) play('clic', null, { vol: 0.8, varie: 0.05 }); }, true);

  // ---------------------------------------------------------------------------------------------
  // Boucle : simulation à vitesse réglable, interpolation des positions entre deux pas
  // ---------------------------------------------------------------------------------------------
  // ---- Marquages tactiques au sol : projection holographique en shader (anneau net + halo, tirets qui tournent,
  // trame d'hexagones, arc de progression de la capture). Additif, sans écriture de profondeur.
  const HOLO_VS = 'varying vec2 vP; uniform float uR; void main(){ vP = (uv * 2.0 - 1.0) * (uR + 0.6); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  const HOLO_FS = `uniform vec3 uCol, uPCol; uniform float uR, uT, uProg, uHex, uA, uFill;
    varying vec2 vP;
    float hexD(vec2 p){ p = abs(p); return max(dot(p, vec2(0.8660254, 0.5)), p.y); }
    void main(){
      float d = length(vP), aa = fwidth(d) * 1.2;
      if (d > uR + 0.55) discard;
      float ang = atan(vP.x, vP.y); float a01 = ang / 6.2831853 + 0.5;
      float edge = 1.0 - smoothstep(0.045 - aa, 0.045 + aa, abs(d - uR));
      float glow = exp(-abs(d - uR) * 7.0) * 0.45 * step(d, uR + 0.5);
      float dash = step(0.5, fract(a01 * floor(uR * 5.0) + uT * 0.04)) * (1.0 - smoothstep(0.022 - aa, 0.022 + aa, abs(d - (uR - 0.32))));
      float fill = smoothstep(uR * 0.15, uR, d) * step(d, uR) * uFill;
      float hex = 0.0;
      if (uHex > 0.5) { vec2 q = vP / 1.15; vec2 s = vec2(1.0, 1.7320508); vec2 a = mod(q, s) - s * 0.5, b = mod(q - s * 0.5, s) - s * 0.5; vec2 g = dot(a, a) < dot(b, b) ? a : b;
        float e = 0.5 - hexD(g.yx); float w = fwidth(e); hex = (1.0 - smoothstep(0.02 - w, 0.02 + w, e)) * step(d, uR - 0.4) * (0.25 + 0.75 * smoothstep(0.0, uR, d)); }
      float sweep = pow(fract(a01 - uT * 0.12), 6.0) * step(d, uR) * smoothstep(uR * 0.2, uR, d) * 0.35;
      float pr = (1.0 - smoothstep(0.07 - aa, 0.07 + aa, abs(d - (uR + 0.24)))) * step(a01, uProg);
      float prBg = (1.0 - smoothstep(0.07 - aa, 0.07 + aa, abs(d - (uR + 0.24)))) * 0.18;
      vec3 c = uCol * (edge * 1.6 + glow + dash * 0.9 + fill * 0.2 + hex * 0.3 + sweep) + uPCol * pr * 1.8 + vec3(0.6) * prBg * (1.0 - step(a01, uProg)) * uHex;
      gl_FragColor = vec4(c * uA, 1.0);
    }`;
  function groundHolo(r, opts) {
    opts = opts || {};
    const mat = new THREE.ShaderMaterial({ vertexShader: HOLO_VS, fragmentShader: HOLO_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, extensions: { derivatives: true },
      uniforms: { uCol: { value: new THREE.Color(opts.color || 0xe8d36a) }, uPCol: { value: new THREE.Color(0xffffff) }, uR: { value: r }, uT: { value: 0 }, uProg: { value: 0 },
        uHex: { value: opts.hex ? 1 : 0 }, uA: { value: opts.alpha === undefined ? 1 : opts.alpha }, uFill: { value: opts.fill === undefined ? 1 : opts.fill } } });
    const m = new THREE.Mesh(new THREE.PlaneGeometry((r + 0.6) * 2, (r + 0.6) * 2), mat); m.rotation.x = -Math.PI / 2; m.renderOrder = 3; m.userData.holo = true;
    return m;
  }
  let zoneGroup = null, zoneMats = null;
  function buildZone() {
    if (zoneGroup) { zoneGroup.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); scene.remove(zoneGroup); zoneGroup = null; zoneMats = null; }
    const z = battle.zone; if (!z) return;
    zoneGroup = new THREE.Group(); zoneGroup.position.set(z.x, 0.03, z.z);
    const h = groundHolo(z.r, { hex: true, alpha: 0.9 }); zoneGroup.add(h); zoneMats = h.material;
    scene.add(zoneGroup);
  }
  function updateZone() {
    const z = battle.zone; if (!z || !zoneMats) return;
    const col = z.contested ? 0xffffff : z.holder === 0 ? TEAM[0].color : z.holder === 1 ? TEAM[1].color : 0xe8d36a;
    const U = zoneMats.uniforms, t = performance.now() / 1000;
    U.uCol.value.lerp(new THREE.Color(col), 0.08); U.uT.value = t;
    const lead = z.holder === 0 || z.holder === 1 ? z.holder : (battle.teams[0].capture >= battle.teams[1].capture ? 0 : 1);   // −1 : zone disputée
    U.uProg.value = Math.min(1, (battle.teams[lead].capture || 0) / 100); U.uPCol.value.setHex(TEAM[lead].color);
    U.uA.value = z.contested ? 0.75 + 0.25 * Math.sin(t * 9) : 0.85;
  }
  // ---- Zones de départ : marquage holographique discret (anneau en tirets + insigne au centre) --------------------
  let emblemGroup = null;
  function buildSpawnEmblems() {
    if (emblemGroup) { emblemGroup.traverse(o => { if (o.isMesh) { o.geometry.dispose(); if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); scene.remove(emblemGroup); }
    emblemGroup = new THREE.Group();
    battle.teams.forEach((team, ti) => {
      const h = groundHolo(team.spawn.r + 1, { color: TEAM[ti].color, alpha: 0.4, fill: 0.5 }); h.position.set(team.spawn.x, 0.025, team.spawn.z); emblemGroup.add(h);
      const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
      const col = '#' + TEAM[ti].color.toString(16).padStart(6, '0');
      g.fillStyle = col; g.font = 'bold 150px "Segoe UI Symbol", "Noto Sans Symbols", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(insigniaGlyph(team), 128, 136);
      const tex = new THREE.CanvasTexture(c); tex.anisotropy = 8;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.rotation.x = -Math.PI / 2; m.rotation.z = ti === 0 ? -Math.PI / 2 : Math.PI / 2; m.position.set(team.spawn.x, 0.03, team.spawn.z); emblemGroup.add(m);
    });
    scene.add(emblemGroup);
  }
  function updateHolos() { if (emblemGroup) { const t = performance.now() / 1000; emblemGroup.traverse(o => { if (o.userData.holo) o.material.uniforms.uT.value = t; }); } }
  // ---- Bannière de fin (« ALPHA L'EMPORTE ! ») sur l'image figée, avant l'écran de résultat ------------------------
  let bannerTimer = null;
  // Plan final : à la fin d'une bataille regardée, la caméra tourne lentement autour de la dernière neutralisation,
  // au ralenti (la chute se termine pendant la bannière), puis l'écran de résultat s'ouvre.
  let finale = null, postEnd = 0;
  function startFinale() {
    const last = battle.log.slice().reverse().find(e => e.kind === 'down' && e.enemy && unitById[e.enemy]);
    if (!last || MANUAL) return; const v = unitById[last.enemy];
    // angle de vue dégagé : on cherche une direction d'où la caméra (5 à 7 m, 2,5 à 3,4 m de haut) voit le soldat sans mur entre eux
    occEnsure(); const mp = battle.map, V = V3(v.x, 0.5, v.z);   // (et contre le décor dessiné : ni sous l'auvent de la station de lavage, ni dans un arbre, ni derrière un mur)
    const ok = (a) => [5, 6, 7].every(d => { const cx = v.x + Math.cos(a) * d, cz = v.z + Math.sin(a) * d; return mp.inBounds(cx, cz) && !mp.insideObstacle(cx, cz) && mp.hasLOS(cx, 2.6, cz, v.x, 0.5, v.z) && (!OCC.use || [2.4, 3.4].every(y => { const p = V3(cx, y, cz); return !occBad(p) && occRay(p, V, 0.45) >= 1; })); });
    const base = Math.atan2(camera.position.z - v.z, camera.position.x - v.x); let a0 = null;
    for (let k = 0; k < 24 && a0 === null; k++) { const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 12; if (ok(a) && ok(a + 0.35) && ok(a - 0.35)) a0 = a; }
    if (a0 === null) for (let k = 0; k < 24 && a0 === null; k++) { const a = base + k * Math.PI / 12; if (ok(a)) a0 = a; }
    if (a0 === null) return;   // aucun angle dégagé : on garde la caméra du moment
    finale = { x: v.x, z: v.z, t0: performance.now() / 1000, a0 };
  }
  function showBanner(after) {
    startFinale();
    const r = battle.result, el = $('#banner');
    const txt = r.winner === -1 ? 'ÉGALITÉ' : `${battle.teams[r.winner].name.toUpperCase()} L'EMPORTE !`;
    $('#bannerText').textContent = txt; $('#bannerSub').textContent = r.reason;
    el.className = 'banner ' + (r.winner === 1 ? 'team1' : r.winner === 0 ? 'team0' : 'draw'); el.offsetWidth; el.classList.add('show');
    clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { hideBanner(); after(); }, 2600);
    el.onclick = () => { clearTimeout(bannerTimer); hideBanner(); after(); };
  }
  function hideBanner() { clearTimeout(bannerTimer); const el = $('#banner'); if (el) { el.className = 'banner hidden'; el.onclick = null; } }
  let instantResult = false;

  let battle = null, simTime = 0, speed = 1, paused = true, acc = 0, lastFrame = 0, logIndex = 0, ended = false, frameDt = 0, lastAnimTime = 0, contactPlayed = false;
  const unitById = {};

  function newBattle(opts) {
    clearOperators(); for (const f of fx) scene.remove(f.obj); fx.length = 0; decals.clear(); if (EFX) EFX.clear(); finale = null; postEnd = 0;
    if (!opts.replayInputs) { reviewing = false; $('#app').classList.remove('reviewing'); }
    battle = new Battle(opts); simTime = 0; acc = 0; logIndex = 0; ended = false; fxLast = 0; lastAnimTime = 0; contactPlayed = false; pendingSounds.length = 0; ALARMS.length = 0;
    for (const k in unitById) delete unitById[k];
    buildMap(battle.map); applyConditions(opts.conditions);
    buildZone(); buildSpawnEmblems();
    $('#app').classList.toggle('capture', !!battle.zone);
    hideBanner();
    for (const u of battle.units) { makeOperator(u); unitById[u.id] = u; }
    fogReset(); fogUpdate();   // au départ, l'escouade ne voit personne
    if (RENDU) RENDU.applyEnv();
    $('#journal').innerHTML = ''; $('#ticker').innerHTML = ''; $('#killfeed').innerHTML = '';
    $('#result').classList.add('hidden');
    if (!opts.replayInputs && !MANUAL && cam.mode !== SETTINGS.cam && ['director', 'follow', 'sat', 'free'].includes(SETTINGS.cam)) { cam.mode = SETTINGS.cam; document.querySelectorAll('[data-cam]').forEach(b => b.classList.toggle('on', b.dataset.cam === cam.mode)); }
    cam.init = false; cam.autoFollow = null; cam.follow = null; cam.shot = null; DIRECTOR.eventShot = null; if (cam.mode === 'free') { cam.target.set(battle.map.width / 2, 0, battle.map.depth / 2); }
    buildRosters();
    syncMeshes(1);
    pumpLog();
  }

  // ---- traces au sol (sang) : persistent jusqu'à la fin de la bataille, nombre limité ----
  const decals = new THREE.Group(); scene.add(decals);
  const bloodGeo = new THREE.CircleGeometry(1, 14), stainMat = new THREE.MeshBasicMaterial({ color: 0x260504, transparent: true, opacity: 0.62, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const scorchMat = new THREE.MeshBasicMaterial({ color: 0x0d0c0b, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  // une caisse qui vole en éclats : le modèle disparaît, des planches volent, quelques débris restent au sol (sans gêner)
  const plankGeo = new THREE.BoxGeometry(0.5, 0.06, 0.14), plankMat = new THREE.MeshStandardMaterial({ color: 0x6b5236, roughness: 1 });
  function destroyDecor(ev) {
    // (les objets Meshy et les caisses du parking sont des groupes qui partagent leur géométrie : on les retire sans la libérer)
    const m = obstacleMesh.get(ev.obstacle); if (m && m.parent) { m.parent.remove(m); if (m.isMesh && m.geometry && !m.userData.keep) m.geometry.dispose(); }
    for (let i = 0; i < 10; i++) { const p = new THREE.Mesh(plankGeo, plankMat); p.position.set(ev.x + (Math.random() - 0.5) * ev.w, 0.4 + Math.random() * ev.h, ev.z + (Math.random() - 0.5) * ev.d); p.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3); p.castShadow = true; scene.add(p);
      fx.push({ obj: p, until: simTime + 30, start: simTime, vel: new THREE.Vector3((Math.random() - 0.5) * 7, 3 + Math.random() * 4, (Math.random() - 0.5) * 7), gravity: 12 }); }
    for (let i = 0; i < 6; i++) { const p = new THREE.Mesh(plankGeo, plankMat); p.position.set(ev.x + (Math.random() - 0.5) * (ev.w + 1), 0.04, ev.z + (Math.random() - 0.5) * (ev.d + 1)); p.rotation.y = Math.random() * 3; decals.add(p); }
    const d = new THREE.Mesh(dustGeo, dustMat); d.position.set(ev.x, 0.4, ev.z); d.scale.setScalar(2.5); scene.add(d); fx.push({ obj: d, until: simTime + 1.4, start: simTime, grow: 2.5 });
    play('impact_bois', { x: ev.x, y: 0.6, z: ev.z }, { vol: 1.3, vitesse: 0.8 });
  }
  function addScorch(x, z, r) {   // trace noire d'explosion (grenade, obus, frappe aérienne)
    if (EFX) return;   // (effets.js : brûlure posée par l'explosion)
    if (decals.children.length > 160) decals.remove(decals.children[0]);
    const m = new THREE.Mesh(bloodGeo, scorchMat); m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * 6.28; m.position.set(x, 0.022, z); m.scale.set(r, r * (0.8 + Math.random() * 0.3), 1); decals.add(m);
  }
  function addBlood(x, z, r) {
    if (EFX) { EFX.bloodPool(x + (Math.random() - 0.5) * 0.3, z + (Math.random() - 0.5) * 0.3, r * 2.2); return; }
    if (decals.children.length > 160) decals.remove(decals.children[0]);
    const m = new THREE.Mesh(bloodGeo, stainMat); m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * 6.28; m.position.set(x + (Math.random() - 0.5) * 0.3, 0.025, z + (Math.random() - 0.5) * 0.3);
    m.scale.set(r * (0.8 + Math.random() * 0.5), r * (0.6 + Math.random() * 0.5), 1); decals.add(m);
  }
  // son d'impact selon la matière la plus proche du point d'arrivée de la balle (métal, bois, béton, sol / sable)
  const MAT_OF = (n) => /^(voiture|fourgon|bus|berline|camion)/.test(n) ? (Math.random() < 0.2 ? 'impact_verre' : 'impact_carrosserie') : /^(conteneur|cuve|tuyauterie|fût|pompe|armoire|barrière|bac|kiosque|abri)/.test(n) ? 'impact_metal' : /^(caisses|palettes|banc|étal)/.test(n) ? 'impact_bois' : /^(sacs|palmier)/.test(n) ? 'impact_sol' : 'impact_beton';
  function impactSound(p) {
    if (p.y < 0.15) return 'impact_sol';
    if (p.y > 6) return 'impact_verre';   // tête de lampadaire
    let best = null, bd = 1.2;
    for (const o of battle.map.obstacles) { if (p.y > o.h + 0.3) continue; const d = Math.hypot(Math.max(o.x - p.x, 0, p.x - (o.x + o.w)), Math.max(o.z - p.z, 0, p.z - (o.z + o.d))); if (d < bd) { bd = d; best = o; } }
    // voiture : au-dessus de ~60 % de sa hauteur, ce sont les vitres (elles se fendent et le restent)
    if (best && /^voiture/.test(best.name || '')) return p.y > best.h * 0.62 ? 'impact_verre' : 'impact_carrosserie';
    return best ? MAT_OF(best.name || '') : 'impact_sol';
  }
  // alarme de voiture : sirène fabriquée une fois (montées-descentes, deux tons, gazouillis), feux qui clignotent
  const ALARMS = [];
  function genAlarm(d, sr) {
    let ph = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, c = t % 9; let f;
      if (c < 3) f = 650 + 650 * ((c % 0.5) / 0.5);                 // montées rapides
      else if (c < 6) f = ((c * 4) | 0) % 2 ? 1150 : 820;              // deux tons
      else f = 1400 - 700 * ((c % 0.15) / 0.15);                       // gazouillis
      ph += 2 * Math.PI * f / sr;
      const sq = Math.tanh(Math.sin(ph) * 3) * 0.6 + Math.sin(ph * 2) * 0.15;
      const env = Math.min(1, t * 20) * Math.min(1, (d.length / sr - t) * 4);
      d[i] = sq * env * 0.5;
    }
  }
  function alarmFx() {
    for (let i = ALARMS.length - 1; i >= 0; i--) {
      const a = ALARMS[i]; if (simTime > a.until) { ALARMS.splice(i, 1); continue; }
      const k = Math.floor((simTime - a.t0) / 0.5); if (k === a.k) continue; a.k = k;
      if (k % 2 === 0 && EFX && EFX.light) EFX.light(new THREE.Vector3(a.x, 0.75, a.z), 0xffa030, 40, 7, 0.28);
    }
  }
  function stepSim() {
    for (const u of battle.units) { const m = meshes[u.id]; m.prev = m.cur; }
    battle.step(); simTime = battle.t;
    for (const u of battle.units) { meshes[u.id].cur = { x: u.x, z: u.z, facing: u.facing }; }
    fogUpdate(); alarmFx();
    for (const ev of battle.drainEvents()) {
      if (ev.type === 'shot') {
        const sh = unitById[ev.shooter], cache = !fogShotShown(ev, sh);   // tireur non repéré, balle loin de l'escouade : on l'entend seulement
        addShot(ev, sh.team, cache);
        shotSound(sh, ev, cache);
        const d = Math.hypot(ev.to.x - ev.from.x, ev.to.z - ev.from.z);
        const imp = ev.hit ? 'impact_corps' : impactSound(ev.to);
        pendingSounds.push({ at: simTime + d / 110, name: imp, pos: ev.to, vol: ev.hit ? 1 : imp === 'impact_sol' ? 0.6 : 0.9 });
        if (!ev.hit && (imp === 'impact_beton' || imp === 'impact_metal') && Math.random() < 0.12) pendingSounds.push({ at: simTime + d / 110 + 0.01, name: 'ricochet', pos: ev.to, vol: 0.8 });
      }
      if (ev.type === 'lamp' && OT.Parking && OT.Parking.lampOff) OT.Parking.lampOff(ev.x, ev.z);
      if (ev.type === 'alarm') {
        ALARMS.push({ x: ev.x, z: ev.z, until: ev.until, t0: simTime, k: -1 });
        if (window.Son && Son.fabriquer && Son.fabriquer('alarme_auto', Math.max(1, ev.until - simTime), genAlarm)) pendingSounds.push({ at: simTime + 0.2, name: 'alarme_auto', pos: { x: ev.x, y: 0.8, z: ev.z }, vol: 0.45 });
      }
      if (ev.type === 'shot' && ev.hit && Math.random() < 0.25) { const t = unitById[ev.target]; if (t && fogShown(t)) addBlood(t.x, t.z, 0.22); }
      if (ev.type === 'revive') { const m = meshes[ev.unit]; if (m) m.label.classList.remove('down'); delete FOG.deadSeen[ev.unit]; const u = unitById[ev.unit]; if (u) directorEvent('revive', u.x, u.z); }
      if (ev.type === 'down') {
        // mort en ragdoll (ragdoll.js) : la flaque de sang apparaît sous le bassin quand le corps s'est posé
        // (ennemi non repéré à cet instant : la chute est simulée mais ni montrée, ni entendue, ni filmée ; seul le fil des neutralisations l'annonce)
        const u = unitById[ev.unit], m = meshes[ev.unit]; fogDown(u); const vu = fogShown(u);
        const rag = !!(u && m && m.isSkinned && OT.Ragdoll && OT.Ragdoll.mort(u, m, battle, (x, z) => { if (fogShown(u)) addBlood(x, z, 0.6); }));
        if (u && vu) { if (!rag) addBlood(u.x, u.z, 0.6); pendingSounds.push({ at: simTime + 0.5, name: 'chute', pos: { x: u.x, y: 0.3, z: u.z }, vol: 1 }); }
        if (m) { m.label.classList.add('down'); m.anim.fallDir = Math.random() < 0.5 ? -1 : 1; if (m.isSkinned && !rag) chooseFall(u, m); }
        if (u && vu) directorEvent('down', u.x, u.z); }
      if (ev.type === 'smoke') addSmoke(ev);
      if (ev.type === 'shell') { addShell(ev); addScorch(ev.x, ev.z, 1.8); play('explosion_lourde', { x: ev.x, y: 1, z: ev.z }, { vol: 1.1, espace: true }); cam.shake = Math.max(cam.shake || 0, 0.35); }
      if (ev.type === 'heal') addHeal(ev);
      if (ev.type === 'reco' && !(ev.team === 1 && fogOn())) addReco(ev);   // (le drone adverse tourne au-dessus de son équipe : il la trahirait)
      if (ev.type === 'barrage_called') addBarrageMarker(ev);
      if (ev.type === 'grenade_throw') { const th = battle.units.find(u => u.alive && Math.abs(u.x - ev.from.x) < 0.05 && Math.abs(u.z - ev.from.z) < 0.05); addGrenade(ev, !!th && !fogShown(th)); }
      if (ev.type === 'strike_called') addStrikeMarker(ev);
      if (ev.type === 'destroyed') destroyDecor(ev);
      if (ev.type === 'strike') { addStrike(ev); for (let k = -ev.half; k <= ev.half; k += 3) addScorch(ev.cx + ev.dx * k + (Math.random() - 0.5) * 1.5, ev.cz + ev.dz * k + (Math.random() - 0.5) * 1.5, 0.9); }
      if (OT.Ragdoll && (ev.type === 'grenade_blast' && ev.kind !== 'flash' || ev.type === 'shell' || ev.type === 'strike')) OT.Ragdoll.souffle(ev.x !== undefined ? ev.x : ev.cx, ev.z !== undefined ? ev.z : ev.cz, simTime);
      if (ev.type === 'grenade_blast') { addBlast(ev); if (ev.kind !== 'flash') addScorch(ev.x, ev.z, 1.4); directorEvent('blast', ev.x, ev.z); }
    }
    updateTacticCards();
    // sons différés (impacts à l'arrivée de la balle), pas, rechargements, contact
    for (let i = pendingSounds.length - 1; i >= 0; i--) if (simTime >= pendingSounds[i].at) { const ps = pendingSounds[i]; play(ps.name, ps.pos, { vol: ps.vol }); pendingSounds.splice(i, 1); }
    if (speed <= 2) for (const u of battle.units) {
      if (!u.alive || !u.moving) continue;
      const m = meshes[u.id]; const ph = Math.floor(m.anim.phase / Math.PI);
      if (m.lastStepPhase !== undefined && ph !== m.lastStepPhase && fogShown(u)) {   // pas d'un ennemi non repéré : muets
        const v = Math.hypot(m.anim.vx || 0, m.anim.vz || 0);
        play(condNow === 'pluie' ? 'pas_mouille' : 'pas', { x: u.x, y: 0.2, z: u.z }, { vol: 0.9, varie: 0.06 });
        if (v > 2.2 && Math.random() < 0.3) play('equipement', { x: u.x, y: 1, z: u.z }, { vol: 0.8, varie: 0.05 });
        if (EFX && EFX.footstep) { if (condNow === 'pluie' || v > 2.2) EFX.footstep(m.group.position.x, m.group.position.z, condNow === 'pluie', v); }
      }
      m.lastStepPhase = ph;
    }
    pumpLog();
    if (battle.over && !ended) { hideBriefing(false); ended = true; paused = true; updatePlayButton(); if (instantResult || MANUAL) showResult(); else showBanner(showResult); play(battle.result.winner === 0 ? 'victoire' : 'defaite', null, { vol: 1, varie: 0 }); }
  }
  const pendingSounds = [];

  // ---- Ennemis non repérés : un soldat de Bravo n'est affiché que tant qu'au moins un opérateur d'Alpha vivant le voit ----
  // (ensembles « visible » de la simulation, mis à jour à chaque pas ; ni la mémoire radio ni la dernière position connue).
  // Perdu de vue : il s'efface en 0,3 s et laisse un repère discret (anneau rouge pâle et « ? ») qui s'éteint en 5 s.
  // Réglage « Ennemis visibles seulement s'ils sont repérés » (activé par défaut ; désactivé en mode manuel — outils de
  // capture — sauf ?fog=1 ; ?fog=0 le coupe partout). La fin de bataille révèle tout.
  const FOG = { spotted: new Set(), seenT: {}, deadSeen: {}, hp: {}, ghosts: {}, rt: 0 }, FOG_PARAM = params.get('fog'), GHOST_LIFE = 5;
  function fogOn() { return !!battle && !battle.over && (FOG.force !== undefined ? FOG.force : FOG_PARAM !== null ? FOG_PARAM === '1' : !MANUAL && SETTINGS.fog !== false); }
  function fogShown(u) { if (!u || u.team !== 1 || !fogOn()) return true; return u.alive ? FOG.spotted.has(u.id) : !!FOG.deadSeen[u.id]; }
  function fogUpdate() {   // après chaque pas de simulation : qui l'escouade voit-elle en ce moment ?
    const prev = FOG.spotted, now = new Set(), on = fogOn();
    for (const a of battle.teams[0].units) if (a.alive && a.visible) for (const id of a.visible) now.add(id);
    for (const e of battle.teams[1].units) {
      if (!e.alive) { now.delete(e.id); continue; }
      if (now.has(e.id)) { FOG.seenT[e.id] = battle.t; FOG.hp[e.id] = e.hp; }
      else if (on && prev.has(e.id)) fogGhost(e);
    }
    FOG.spotted = now;
  }
  function fogDown(u) { if (u && u.team === 1) FOG.deadSeen[u.id] = battle.t - (FOG.seenT[u.id] === undefined ? -99 : FOG.seenT[u.id]) < 0.6; }   // tombé sous les yeux de l'escouade ?
  function fogReset() { for (const id in FOG.ghosts) { const g = FOG.ghosts[id]; scene.remove(g); g.userData.ring.geometry.dispose(); g.userData.ring.material.dispose(); g.userData.sp.geometry.dispose(); g.userData.sp.material.dispose(); } FOG.ghosts = {}; FOG.spotted = new Set(); FOG.seenT = {}; FOG.deadSeen = {}; FOG.hp = {}; }
  let ghostTex = null;
  function fogGhost(e) {   // dernière position connue : anneau au sol et petit « ? », très pâles
    let g = FOG.ghosts[e.id];
    if (!g) {
      if (!ghostTex) {   // « ? » rose pâle sur un halo rouge diffus
        const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
        const gr = x.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(232,70,56,0.55)'); gr.addColorStop(0.55, 'rgba(232,70,56,0.22)'); gr.addColorStop(1, 'rgba(232,70,56,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
        x.font = 'bold 84px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#ffd2ca'; x.fillText('?', 64, 70);
        ghostTex = new THREE.CanvasTexture(c); ghostTex.colorSpace = THREE.SRGBColorSpace;
      }
      g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 40), new THREE.MeshBasicMaterial({ color: 0xff5a48, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
      // (un point plutôt qu'un Sprite : la passe d'occlusion ambiante HBAO masque les points, alors qu'elle dessinait le Sprite
      // non orienté — une fine lame noire verticale en travers du « ? »)
      const sp = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 1.2, 0], 3)), new THREE.PointsMaterial({ map: ghostTex, size: 1.4, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false }));
      g.add(ring, sp); g.userData = { ring, sp, t0: 0 }; scene.add(g); FOG.ghosts[e.id] = g;
    }
    g.position.set(e.x, 0, e.z); g.userData.t0 = simTime; g.visible = true;
  }
  function fogGhostsTick() {
    for (const id in FOG.ghosts) {
      const g = FOG.ghosts[id]; if (!g.visible) continue;
      const age = simTime - g.userData.t0;
      if (age > GHOST_LIFE || age < 0 || !fogOn() || FOG.spotted.has(id)) { g.visible = false; continue; }
      const k = Math.min(1, age / 0.3) * Math.pow(1 - age / GHOST_LIFE, 1.5);   // apparaît pendant que le soldat s'efface, puis s'éteint
      g.userData.ring.material.opacity = 0.7 * k; g.userData.sp.material.opacity = 0.85 * k; g.userData.ring.scale.setScalar(1 + age * 0.08);
    }
  }
  // fondu : matériaux propres à ce soldat (transparents), créés une fois et utilisés seulement pendant le fondu
  function fogMats(m) {
    if (m._fog) return m._fog; const list = [];
    const one = (mat) => { if (!mat || mat.transparent) return mat; const c = mat.clone(); c.transparent = true; c.onBeforeCompile = mat.onBeforeCompile; c.customProgramCacheKey = mat.customProgramCacheKey; c.userData.base = mat.opacity; return c; };
    m.group.traverse(o => { if (!o.material || o === m.ring || o.isSprite) return; const orig = o.material, clone = Array.isArray(orig) ? orig.map(one) : one(orig); if (clone !== orig) list.push({ o, orig, clone }); });
    return (m._fog = list);
  }
  function fogApply(m, a) {
    m.group.visible = a > 0.002; m.ring.visible = a >= 1;
    if (a >= 1 || a <= 0.002) { if (m._fogOn) { for (const f of m._fog) if (f.o.material === f.clone) f.o.material = f.orig; m._fogOn = false; } return; }
    for (const f of fogMats(m)) {
      if (f.o.material === f.orig) f.o.material = f.clone;
      for (const c of Array.isArray(f.clone) ? f.clone : [f.clone]) if (c && c.userData.base !== undefined) c.opacity = c.userData.base * a;
    }
    m._fogOn = true;
  }
  function fogFrame() {   // à chaque image : fondus (0,3 s pour disparaître, 0,15 s pour apparaître ; instantané en mode manuel)
    const now = performance.now(), rdt = MANUAL ? 1 : Math.min(0.1, Math.max(0, (now - (FOG.rt || now)) / 1000)); FOG.rt = now;
    for (const u of battle.units) {
      const m = meshes[u.id]; if (!m) continue;
      const want = fogShown(u) ? 1 : 0; if (m.fogA === undefined) m.fogA = want;
      if (m.fogA !== want) m.fogA = want > m.fogA ? Math.min(1, m.fogA + rdt / 0.15) : Math.max(0, m.fogA - rdt / 0.3);
      if (m.fogA !== m._fogLast || m.fogA < 1) { fogApply(m, m.fogA); m._fogLast = m.fogA; }
    }
    fogGhostsTick();
  }
  // un tir d'un ennemi non repéré : éclair et traçante seulement s'il passe près d'un opérateur d'Alpha (on se fait tirer dessus)
  function fogShotShown(ev, sh) {
    if (fogShown(sh)) return true;
    const t = unitById[ev.target]; if (t && t.team === 0) return true;
    for (const a of battle.teams[0].units) if (a.alive && Math.hypot(a.x - ev.to.x, a.z - ev.to.z) < 5) return true;
    return false;
  }

  function syncMeshes(alpha) {
    if (OT.Ragdoll) OT.Ragdoll.etape(frameDt, battle);   // physique des morts (une fois par image)
    for (const u of battle.units) {
      const m = meshes[u.id];
      const x = m.prev.x + (m.cur.x - m.prev.x) * alpha, z = m.prev.z + (m.cur.z - m.prev.z) * alpha;
      m.group.position.set(x, 0, z);
      // orientation : interpolation angulaire courte
      // orientation : on tourne vers la direction simulée à vitesse limitée (pas de demi-tour instantané qui ferait « tourner »
      // le corps sur lui-même quand la cible ou le chemin change brusquement) ; un mort ne pivote plus
      // vitesse lissée sur ~0,3 s (direction des jambes, et direction du corps quand on marche sans cible : les petits
      // zigzags du chemin ne font plus pivoter le soldat dans tous les sens) ; un saut > 4 m/s est un replacement, ignoré
      const an = m.anim, vdx = (m.cur.x - m.prev.x) / DT, vdz = (m.cur.z - m.prev.z) / DT, vinst = Math.hypot(vdx, vdz);
      // (seuil 7 m/s et non 4 : le sprint vers un couvert va à 4-5 m/s — vu en jeu — ; au-dessus de 4, la direction des jambes
      // restait figée, pieds de travers de 16° en course épaulée, glissant de côté à 1,3 m/s)
      const kv = vinst > (OT.SAUT_V_TEST || 7) ? 0 : Math.min(1, frameDt * 9); an.vx = (an.vx || 0) + (vdx - (an.vx || 0)) * kv; an.vz = (an.vz || 0) + (vdz - (an.vz || 0)) * kv;
      // orientation voulue : celle de la simulation, interpolée entre ses pas comme la position (elle change par paliers de
      // ~11° toutes les 0,1 s), avec sa vitesse de rotation ; sans cible en marchant : la direction du déplacement
      const fp = m.prev.facing !== undefined ? m.prev.facing : m.cur.facing; let dfa = m.cur.facing - fp; while (dfa > Math.PI) dfa -= 2 * Math.PI; while (dfa < -Math.PI) dfa += 2 * Math.PI;
      let want = -(fp + dfa * alpha) + Math.PI / 2, wv = Math.abs(dfa) < 1.2 ? -dfa / DT : 0;
      if (u.alive && !u.target && !u.preaim && u.moving && vinst > 0.3 && Math.hypot(an.vx, an.vz) > 0.3) { want = -Math.atan2(an.vz, an.vx) + Math.PI / 2; wv = 0; }
      if (m.yaw === undefined || !isFinite(m.yaw)) { m.yaw = want; m.yawV = 0; }
      if (u.alive && frameDt > 0) {
        // ressort amorti critique (« SmoothDamp ») avec anticipation de la vitesse voulue : rotation continue en vitesse (plus
        // d'à-coups du bassin, de la tête et de l'arme à chaque palier), retard < 1° sur une rotation régulière (les tirs restent
        // alignés), vitesse plafonnée à 8 rad/s
        const ST = 0.09, om = 2 / ST, x = om * frameDt, ex = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
        const y0 = m.yaw; m.yaw += wv * frameDt;
        let ch = m.yaw - want; while (ch > Math.PI) ch -= 2 * Math.PI; while (ch < -Math.PI) ch += 2 * Math.PI;
        const v0 = (m.yawV || 0) - wv, tmp = (v0 + om * ch) * frameDt, v1 = (v0 - om * tmp) * ex;
        let ny = want + (ch + tmp) * ex, dy = ny - y0; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
        const lim = 8 * frameDt; dy = Math.max(-lim, Math.min(lim, dy)); let vN = Math.max(-8, Math.min(8, v1 + wv));
        // (accélération angulaire plafonnée à 40 rad/s² : un changement de cible — l'orientation simulée saute d'un coup — ne fait
        // plus pivoter tout le corps en une image ; mesuré en jeu : 13 500 °/s² au buste, 24 000 à la tête)
        { const vO = m.yawV || 0, da = (OT.YAW_ACC_TEST || 40) * frameDt; if (Math.abs(vN - vO) > da) { vN = vO + Math.sign(vN - vO) * da; dy = Math.max(-lim, Math.min(lim, (vO + vN) * 0.5 * frameDt)); } }
        m.yaw = y0 + dy; m.yawV = vN;
        if (m.yaw > Math.PI) m.yaw -= 2 * Math.PI; else if (m.yaw < -Math.PI) m.yaw += 2 * Math.PI; }
      else if (m.anim.fallYaw !== undefined && (m.anim.deadT || 0) < 1.4) { let d = m.anim.fallYaw - m.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; m.yaw += Math.max(-2.5 * frameDt, Math.min(2.5 * frameDt, d)); }
      m.group.rotation.y = m.yaw;
      animateOperator(u, m, frameDt);
      if (SPIN.on) spinWatch(u, m);
    }
    fogFrame();
  }
  // Détecteur de « tours sur soi-même » : à chaque image, orientation dans le monde du bassin et du torse (os) de chaque
  // soldat ; si l'un d'eux cumule plus de 200° de rotation en moins d'une seconde, on garde l'historique de la seconde
  // (orientation voulue par la simulation, orientation affichée, animation, jambes, correction) pour trouver la cause.
  const SPIN = { on: false, events: [], hist: {} };
  const yawOf = (o) => { const d = new THREE.Vector3(0, 0, 1).applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion())); return Math.atan2(d.x, d.z); };
  const wrapA = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  function spinWatch(u, m) {
    if (!m.isSkinned || !m.bones.hips) return;
    const h = SPIN.hist[u.id] || (SPIN.hist[u.id] = []), t = simTime + Math.min(1, acc / DT) * DT;
    const rec = { t: +t.toFixed(2), bassin: yawOf(m.bones.hips), torse: m.bones.spine ? yawOf(m.bones.spine) : 0, yaw: m.yaw, facing: m.cur.facing, corr: m.body.rotation.y, jambes: m.jambes, clip: m.clip, alive: u.alive, state: u.state, v: +(Math.hypot(m.cur.x - m.prev.x, m.cur.z - m.prev.z) / DT).toFixed(2) };
    h.push(rec); while (h.length > 2 && h[0].t < t - 1.0) h.shift();
    if (h.length < 3) return;
    let sb = 0, st = 0; for (let i = 1; i < h.length; i++) { sb += Math.abs(wrapA(h[i].bassin - h[i - 1].bassin)); st += Math.abs(wrapA(h[i].torse - h[i - 1].torse)); }
    const lim = 200 * Math.PI / 180;
    if ((sb > lim || st > lim) && !(m.spinAt > t - 2)) { m.spinAt = t; SPIN.events.push({ unit: u.callsign, t: rec.t, bassinDeg: Math.round(sb * 57.3), torseDeg: Math.round(st * 57.3), hist: h.map(r => Object.assign({}, r, { bassin: Math.round(r.bassin * 57.3), torse: Math.round(r.torse * 57.3), yaw: Math.round(r.yaw * 57.3), facing: Math.round(r.facing * 57.3), corr: Math.round(r.corr * 57.3), jambes: Math.round(r.jambes * 57.3) })) }); }
  }

  function updateLabels() {
    const w = canvas.clientWidth, h = canvas.clientHeight, placed = [];
    for (const u of battle.units) {
      const m = meshes[u.id];
      const p = new THREE.Vector3(m.group.position.x, u.alive ? (u.stance === 'crouch' ? 1.5 : 2.05) : 0.6, m.group.position.z).project(camera);
      // plan rapproché du réalisateur : l'étiquette du soldat cadré flotterait loin au-dessus de sa tête ; on la cache
      const proche = cam.mode === 'director' && camera.position.distanceTo(m.group.position) < 6.5;
      const visible = !proche && m.fogA !== 0 && m.group.visible && p.z < 1 && p.x > -1.1 && p.x < 1.1 && p.y > -1.1 && p.y < 1.1;   // (ennemi non repéré : ni nom, ni barre de vie)
      m.label.style.display = visible ? 'block' : 'none';
      if (!visible) continue;
      { const op = m.fogA === undefined || m.fogA >= 1 ? '' : m.fogA.toFixed(2); if (m.label.style.opacity !== op) m.label.style.opacity = op; }
      m.lx = (p.x + 1) / 2 * w; m.ly = (1 - p.y) / 2 * h; m.lz = p.z; placed.push(m);
      if (m.barkUntil && simTime > m.barkUntil) { m.barkUntil = 0; const b = m.label.querySelector('.bark'); if (b) b.classList.remove('on'); }
      const bar = m.label.querySelector('.lbar i'); bar.style.width = (100 * u.hp / u.maxHp).toFixed(0) + '%';
      bar.style.background = u.hp / u.maxHp > 0.5 ? '#5fc46a' : (u.hp / u.maxHp > 0.2 ? '#e0b03a' : '#d9543c');
    }
    // étiquettes qui se chevauchent : la plus lointaine monte d'un cran (pas de « MOLRAPACE »)
    placed.sort((a, b) => a.lz - b.lz);
    for (let i = 0; i < placed.length; i++) { const a = placed[i]; for (let k = 0; k < i; k++) { const b = placed[k]; if (Math.abs(a.lx - b.lx) < 70 && Math.abs(a.ly - b.ly) < 16) { a.ly = b.ly - 17; k = -1; } } }
    for (const m of placed) m.label.style.transform = `translate(${m.lx.toFixed(0)}px, ${m.ly.toFixed(0)}px) translate(-50%, -100%)`;
  }

  // ---------------------------------------------------------------------------------------------
  // Interface : effectifs, journal, résultat
  // ---------------------------------------------------------------------------------------------
  const roleIcon = { assault: 'AS', pointman: 'PT', marksman: 'TE', support: 'AP', breacher: 'BR' };
  function insigniaGlyph(team) {
    const fac = DATA.FACTIONS[team.insignia] || (team.units[0] && DATA.FACTIONS[team.units[0].def.faction]); if (fac && fac.glyph) return fac.glyph;
    const ins = DATA.INSIGNIAS.find(i => i.id === team.insignia); return ins ? ins.glyph : (team.index === 0 ? '✶' : '⚑');
  }
  function buildRosters() {
    battle.teams.forEach((team, ti) => {
      $('#tname' + ti).textContent = team.name; { const g = insigniaGlyph(team); $('#ins' + ti).innerHTML = OT.Embleme ? OT.Embleme.svg(g, ti ? '#e8241a' : '#2b86f0') : g; }
      const el = $('#roster' + ti);
      el.innerHTML = team.units.map(u => `
        <div class="card" data-id="${u.id}" title="${u.def.unit} — ${u.weapon.name}">
          <span class="role">${OT.Ico ? OT.Ico(u.def.trait === 'leader' ? 'r_leader' : u.def.trait === 'radio' ? 'radio' : ({ assault: 'r_assault', pointman: 'r_pointman', marksman: 'r_marksman', support: 'r_support', breacher: 'r_breacher' })[u.role.id]) : roleIcon[u.role.id]}</span>
          <span class="lane"></span>
          <div class="cmain">
            <div class="ctop"><span class="cs">${u.callsign}</span><span class="ammo"></span></div>
            <div class="hp"><b></b><i></i></div>
            <div class="cbot"><span class="st"></span><span class="status"></span></div>
          </div>
          <div class="sup"><i></i></div><div class="mag"><i></i></div>
        </div>`).join('');
      $('#pips' + ti).innerHTML = team.units.map(u => `<i data-id="${u.id}"></i>`).join('');
      // clic : choisir qui reçoit les ordres (Maj+clic : plusieurs) ; double-clic : suivre ce soldat à la caméra
      if (ti === 0) el.querySelectorAll('.card').forEach(c => c.addEventListener('dblclick', () => { ordSelUndoDbl(); cam.follow = cam.follow === c.dataset.id ? null : c.dataset.id; cam.mode = 'follow'; setCamMode('follow'); el.querySelectorAll('.card').forEach(k => k.classList.toggle('follow', k.dataset.id === cam.follow)); }));
      if (ti === 0) ordRosterHooks(el);
    });
    buildTacticCards();
  }
  function updateRosters() {
    for (const u of battle.units) {
      const c = document.querySelector(`.card[data-id="${u.id}"]`); if (!c) continue;
      c.classList.toggle('dead', !u.alive);
      const hid = u.team === 1 && u.alive && !fogShown(u); c.classList.toggle('unseen', hid);
      if (hid) {   // ennemi non repéré : ni état, ni munitions, ni voie ; la vie est la dernière connue (sinon « ? »)
        const lh = FOG.hp[u.id], w = (lh === undefined ? 100 : 100 * lh / u.maxHp).toFixed(0) + '%', hi = c.querySelector('.hp i');
        if (hi.style.width !== w) { hi.style.width = w; const gb = c.querySelector('.hp b'); if (gb) gb.style.width = w; }
        c.classList.remove('low', 'reload');
        { const mg = c.querySelector('.mag i'); if (mg) mg.style.width = '0%'; }
        c.querySelector('.sup i').style.width = '0%';
        const st = c.querySelector('.st'); if (st.textContent !== 'Non repéré') st.textContent = 'Non repéré';
        c.querySelector('.ammo').innerHTML = '';
        c.querySelector('.status').textContent = lh === undefined ? '? PV' : `${Math.round(lh)} PV ?`;
        { const ln = c.querySelector('.lane'); if (ln && ln.dataset.k !== '') { ln.dataset.k = ''; ln.className = 'lane'; ln.textContent = ''; ln.title = ''; } }
        continue;
      }
      const hpw = (100 * u.hp / u.maxHp).toFixed(0) + '%', hi = c.querySelector('.hp i');
      if (hi.style.width !== hpw) { if (parseFloat(hpw) < parseFloat(hi.style.width || '100')) { c.classList.remove('hit'); void c.offsetWidth; c.classList.add('hit'); } hi.style.width = hpw; const gb = c.querySelector('.hp b'); if (gb) gb.style.width = hpw; }
      c.classList.toggle('low', u.alive && u.hp / u.maxHp < 0.35);
      c.classList.toggle('reload', u.alive && u.reloading > 0);
      { const mg = c.querySelector('.mag i'); if (mg) mg.style.width = (100 * u.ammo / Math.max(1, u.weapon.mag)).toFixed(0) + '%'; }
      { const pip = document.querySelector(`.pips i[data-id="${u.id}"]`); if (pip) { pip.classList.toggle('dead', !u.alive); pip.classList.toggle('down', !u.alive && u.bleedUntil > battle.t); } }
      c.querySelector('.sup i').style.width = (100 * u.suppression).toFixed(0) + '%';
      c.querySelector('.st').textContent = u.alive ? (u.reloading > 0 ? 'Recharge' : STATE_FR[u.state] || u.state) : (u.bleedUntil > battle.t ? 'À terre' : 'Hors de combat');
      c.querySelector('.ammo').innerHTML = u.alive ? `<b>${u.ammo}</b><small><u></u>${u.mags}</small>` : '';
      c.querySelector('.status').textContent = `${Math.round(u.hp)} PV · ${STATUS_FR[u.status]}`;
      { const ln = c.querySelector('.lane'), key = u.alive && u.voie !== undefined && u.voie !== null ? u.voie + (u.flankDone ? 'r' : '') : '';   // voie : N / M / S (↘ : se rabat)
        if (ln && ln.dataset.k !== key) { ln.dataset.k = key; ln.className = 'lane' + (key ? ' l' + (u.voie + 1) : ''); ln.textContent = key ? LANE_LETTER[u.voie] + (u.flankDone && u.voie ? '↘' : '') : ''; ln.title = key ? `Voie : ${LANE_NAMES[u.voie]}${u.flankDone && u.voie ? ' — arrivé par le flanc, se rabat' : ''}` : ''; } }
    }
    $('#clock').textContent = fmtT(battle.t);
    battle.teams.forEach((team, ti) => {
      const hp = team.units.reduce((s, u) => s + (!u.alive ? 0 : fogShown(u) ? u.hp : FOG.hp[u.id] !== undefined ? FOG.hp[u.id] : u.maxHp), 0), max = team.units.reduce((s, u) => s + u.maxHp, 0);   // (ennemis non repérés : dernière vie connue)
      const pct = Math.round(100 * hp / max);
      $('#tbar' + ti).style.width = pct + '%';
      if (battle.zone) { const c = Math.floor(team.capture); $('#cbar' + ti).style.width = c + '%'; $('#tpct' + ti).textContent = c + '%'; $('#tpct' + ti).title = `Zone capturée à ${c} % — vie ${pct} %`; }
      else { $('#tpct' + ti).textContent = pct + '%'; $('#tpct' + ti).title = 'État de l\u2019équipe (vie restante)'; }
    });
    if (battle.zone) {
      const z = battle.zone, el = $('#zoneState');
      el.textContent = z.contested ? 'Zone disputée' : z.holder === null ? 'Zone libre' : `Zone : ${battle.teams[z.holder].name}`;
      el.className = 'zstate ' + (z.contested ? 'contested' : z.holder === null ? '' : 'team' + z.holder);
    }
  }
  // cartes de tactiques : à gauche celles du joueur (cliquables), à droite celles de l'adversaire (état seulement)
  function buildTacticCards() {
    battle.teams.forEach((team, ti) => {
      const el = $('#tactics' + ti);
      let na = 0; const KEYS = ['A', 'Z', 'E'];
      el.innerHTML = team.tacticIds.map(id => { const t = DATA.TACTICS[id]; const key = ti === 0 && t.active ? KEYS[na++] || '' : ''; return `<div class="tcard ${t.active ? '' : 'passive'} ${ti === 1 ? 'enemy' : ''}" data-tactic="${id}" ${key ? `data-key="${key}"` : ''} title="${escapeHtml(t.desc)}"><div class="ticon">${tacIcon(id)}</div><div class="tname">${escapeHtml(t.name)}</div><div class="tuse"></div><div class="cd"></div></div>`; }).join('');
      // Rotation : faire passer toute l'escouade par une autre voie, en pleine bataille (touches R / F / V : nord / milieu / sud)
      if (SHOW_ROTATION && ti === 0 && battle.map.def.voies) el.insertAdjacentHTML('beforeend', `<div class="tcard rotcard" title="Rotation : toute l'escouade (hors tireur d'élite) passe par la voie choisie. Une rotation toutes les 10 s ; impossible en ordre « Tenir ».">
        <div class="tname">Rotation</div><div class="rbtns">${[-1, 0, 1].map(l => `<button data-lane="${l}" data-key="${{ '-1': 'R', 0: 'F', 1: 'V' }[l]}" title="${LANE_NAMES[l]}">${laneSvg(null, l, 'rimg')}<span>${{ '-1': 'Nord', 0: 'Milieu', 1: 'Sud' }[l]}</span></button>`).join('')}</div><div class="tuse"></div><div class="cd"></div></div>`);
      if (ti === 0) el.querySelectorAll('.rotcard button').forEach(bt => bt.addEventListener('click', (e) => {
        e.stopPropagation(); const lane = +bt.dataset.lane;
        const r = battle.command('rotate', 0, lane);
        if (!r.ok) flashBattle(`Rotation : ${r.reason}.`); else { flashBattle(`Rotation : toute l'escouade passe par le ${LANE_NAMES[lane]}.`); pumpLog(); }
        updateTacticCards();
      }));
      if (ti === 0) el.querySelectorAll('.tcard:not(.rotcard)').forEach(c => c.addEventListener('click', () => {
        const id = c.dataset.tactic; if (!DATA.TACTICS[id].active) return;
        const r = battle.command('tactic', 0, id);
        if (!r.ok) flashBattle(`${DATA.TACTICS[id].name} : ${r.reason}.`); else { pumpLog(); for (const ev of battle.drainEvents()) { if (ev.type === 'smoke') addSmoke(ev); if (ev.type === 'heal') addHeal(ev); if (ev.type === 'reco') addReco(ev); if (ev.type === 'barrage_called') addBarrageMarker(ev); } }
        updateTacticCards();
      }));
    });
  }
  function updateTacticCards() {
    battle.teams.forEach((team, ti) => {
      $('#tactics' + ti).querySelectorAll('.tcard').forEach(c => {
        if (c.classList.contains('rotcard')) {   // Rotation : voie en cours, recharge
          const cd = Math.max(0, (team.rotateUntil || 0) - battle.t), hold = team.order === 'hold';
          c.querySelector('.tuse').textContent = hold ? 'impossible (Tenir)' : cd > 0 ? `${cd.toFixed(0)} s` : team.rotation !== undefined ? `par le ${LANE_NAMES[team.rotation]}` : 'prête';
          c.classList.toggle('off', hold || cd > 0);
          c.querySelectorAll('button').forEach(bt => bt.classList.toggle('on', team.rotation !== undefined && +bt.dataset.lane === team.rotation));
          c.querySelector('.cd').style.width = cd > 0 ? (100 * (1 - cd / 10)) + '%' : '0';
          return;
        }
        const id = c.dataset.tactic, t = DATA.TACTICS[id], st = team.tactics[id];
        if (!t.active) {   // Tiroir : quelle moitié avance en ce moment (bond n°)
          if (id === 'tiroir' && team.bound) { const mv = team.units.filter(u => u.alive && !u.moveOrder && u.boundGroup === team.bound.group).map(u => u.callsign); c.querySelector('.tuse').textContent = team.order === 'hold' ? 'en attente (Tenir)' : mv.length ? `bond ${team.bound.n + 1} : ${mv.join(', ')}` : 'passive'; }
          else c.querySelector('.tuse').textContent = 'passive';
          return;
        }
        const cd = Math.max(0, st.cooldownUntil - battle.t);
        c.querySelector('.tuse').textContent = st.uses <= 0 ? 'épuisé' : cd > 0 ? `${cd.toFixed(0)} s` : `${st.uses} ×`;
        c.classList.toggle('off', st.uses <= 0 || cd > 0);
        c.querySelector('.cd').style.width = cd > 0 && t.cooldown ? (100 * (1 - cd / t.cooldown)) + '%' : '0';
      });
    });
  }
  // ---- Ordres de déplacement (clic droit sur le sol) ------------------------------------------------------------------
  // Clic droit sans glisser (< 5 px) sur le sol → petit menu carré au curseur : « Déplacement » (comment y aller) et
  // « Arrivée » (que faire là-bas). Les derniers choix sont présélectionnés. Qui reçoit l'ordre : l'escouade entière (« Tous »)
  // ou les cartes choisies en bas (clic ; Maj+clic pour plusieurs). L'ordre passe par battle.command('aller', …) : rejoué
  // à l'identique en revue. Pour ajouter un choix plus tard : une ligne dans ORD_OPTS (et son comportement dans engine.js).
  const ORD_SVG = {
    methodique: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 22l5-5 5 5M5 15l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/><path d="M17 17l5-5 5 5M17 10l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="27" r="2.2" fill="currentColor" opacity=".55"/><circle cx="22" cy="21" r="2.2" fill="currentColor"/></svg>',
    agressif: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 8l8 8-8 8M15 8l8 8-8 8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M26 9v14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
    franchir: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="7" width="4" height="18" rx="1.2" fill="currentColor" opacity=".55"/><rect x="25" y="7" width="4" height="18" rx="1.2" fill="currentColor" opacity=".55"/><path d="M10 16h3M15.5 16h3" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M19.5 11.5L23 16l-3.5 4.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.5" cy="24.5" r="1.8" fill="currentColor" opacity=".55"/><circle cx="22.5" cy="24.5" r="1.8" fill="currentColor"/></svg>',
    encercler: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="11" r="4" fill="none" stroke="currentColor" stroke-width="2.6"/><circle cx="16" cy="11" r="1.2" fill="currentColor"/><path d="M4 27l7.5-9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M28 27l-7.5-9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M7.5 18h4v4M24.5 18h-4v4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    manoeuvre: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="8" cy="22" r="3.2" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M11.5 19.5C15 15 18 13 24 12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M19 7l6 5-5 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    tenir: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 4l10 4v7c0 6.5-4.3 11-10 13-5.7-2-10-6.5-10-13V8z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><path d="M11 16l4 4 6-7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    decrocher: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M17 8l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/><path d="M26 12l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 7v18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="23" cy="7" r="2.2" fill="currentColor" opacity=".55"/></svg>',
    lampe: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M9 29V8.5C9 6 11 4 13.5 4H22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M18 4h7l1 3h-9z" fill="currentColor"/><path d="M19 11l-2 4M23 11v4M27 11l2 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".6"/><path d="M5 29h8" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
    // « Plus… » : grenades sur ordre, fouiller
    frag: '<svg viewBox="0 0 32 32" aria-hidden="true"><ellipse cx="15" cy="19" rx="8" ry="9" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M11 10h8M15 10V6.5M15 6.5h5l3 3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 19h12M15 13v12" stroke="currentColor" stroke-width="1.6" opacity=".6"/></svg>',
    flash: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="10" y="10" width="12" height="17" rx="3" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M13 10V7h6v3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M4 9l3 2M28 9l-3 2M3 18h3M29 18h-3" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M17 13l-3 5h4l-3 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    smoke: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 24a5 5 0 010-10 7 7 0 0113-2 5.5 5.5 0 013 10.6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M7 28h18M11 20h10" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" opacity=".6"/></svg>',
    fouiller: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="14" cy="14" r="7.5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M19.5 19.5L27 27" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M4 4h5M4 4v5M28 4h-5M28 4v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".55"/></svg>',
    // ligne « Feu » (petits pictogrammes)
    volonte: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="8" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M16 3v7M16 22v7M3 16h7M22 16h7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><circle cx="16" cy="16" r="2" fill="currentColor"/></svg>',
    retenu: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M11 17V9.5a2 2 0 014 0V15M15 15V7.5a2 2 0 014 0V15M19 15V9.5a2 2 0 014 0V19c0 5.5-3.4 9-8 9-3.4 0-5.6-1.8-7-4.6l-2.6-5a2 2 0 013.3-2.2L11 19" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    appui: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 10h8M3 16h10M3 22h8" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><circle cx="23" cy="16" r="6.5" fill="none" stroke="currentColor" stroke-width="2.6"/><circle cx="23" cy="16" r="2" fill="currentColor"/></svg>',
  };
  // Feu (3e ligne, petite) : un réglage, revient à « À volonté » après chaque ordre (un « Retenu » oublié coûte cher)
  const ORD_FEU = [
    { v: 'volonte', nom: 'À volonté', desc: 'Chacun tire sur ce qu’il voit (par défaut).' },
    { v: 'retenu', nom: 'Retenu', desc: 'Embuscade : personne ne tire ni ne lance de grenade tant que le groupe n’est pas repéré, pris à partie, ou qu’un ennemi n’arrive tout près — alors tout le groupe ouvre le feu d’un coup (« Feu ! »). Clic sur la main d’une carte : ouvrir le feu tout de suite.' },
    { v: 'appui', nom: 'Appui', desc: 'Une fois en place, le groupe arrose la zone menacée (le point montré par le clic d’orientation, sinon la menace connue la plus proche) : tir de suppression qui cloue l’ennemi, même à couvert, pendant qu’un autre groupe bouge. Munitions bridées (on cesse sous 40 %).' }];
  // « Plus… » : grenade sur ordre (E1, E2, E3) — action immédiate au point cliqué, par le plus proche des opérateurs choisis
  // qui en a une et est à portée (battle.command('grenade', …), rejoué en revue)
  // « Plus… » : arrivée rare (A5)
  const ORD_PLUS_ARR = [{ v: 'fouiller', nom: 'Fouiller', aide: 'Débusquer autour (12 m)', desc: 'Une fois sur le point, chacun va voir derrière les couverts autour (12 m) pour débusquer un ennemi caché ; un ennemi en vue : on se bat. Fini : on tient là où l’on est.' }];
  const ORD_GREN = [{ v: 'frag', nom: 'Grenade', desc: 'Grenade à fragmentation au point cliqué (8 à 24 m du lanceur). Refusée si un équipier est à moins de 5 m du point.' },
    { v: 'flash', nom: 'Flash', desc: 'Grenade incapacitante au point cliqué (8 à 24 m) : aveugle quelques secondes ceux qui voient l’éclair (alliés compris).' },
    { v: 'smoke', nom: 'Fumée', desc: 'Fumigène au point cliqué (3 à 24 m) : bloque la vue des deux côtés pendant 14 s.' }];
  const ORD_OPTS = {
    mode: { titre: 'Déplacement', choix: [
      { v: 'methodique', nom: 'Méthodique', aide: 'Bonds, appui mutuel', desc: 'Doctrine française : une moitié bondit de couvert en couvert pendant que l’autre couvre, chacun son secteur ; pauses à chaque couvert.' },
      { v: 'agressif', nom: 'Agressif', aide: 'Vite, tire en avançant', desc: 'Droit au point au pas de course, en tirant sur ce qu’on voit ; courte halte à couvert seulement sous le feu.' },
      { v: 'franchir', nom: 'Franchir', aide: 'Un par un sous appui', desc: 'Comme Méthodique, mais un espace découvert sur le trajet se traverse un par un (deux par deux à 4 ou 5), au sprint, pendant que les autres couvrent le côté dangereux depuis le bord ; le premier passé couvre l’autre côté.' },
      { v: 'decrocher', nom: 'Décrocher', aide: 'Repli par bonds, sous appui', desc: 'Pour quitter un combat qui tourne mal : clic droit en arrière. Une moitié tire pour couvrir pendant que l’autre court jusqu’au couvert suivant vers le point, puis on inverse, sans halte pour engager. Arrivée : face au danger.' }] },
    arrivee: { titre: 'Arrivée', choix: [
      { v: 'tenir', nom: 'Tenir la position', aide: 'À couvert, face à la menace', desc: 'Sur place : un couvert tout proche, face à la menace (ou dans le sens de la marche), et on y reste.' },
      { v: 'encercler', nom: 'Encercler', aide: 'Prendre la position par deux côtés', desc: 'L’escouade se partage en deux : chaque moitié prend position d’un côté du point (à 8–14 m, à angle d’environ 100°, sans se faire face), à couvert, et le tient. À moins de trois : tenir la position.' },
      { v: 'manoeuvre', nom: 'Reprendre la manœuvre', aide: 'Puis l’escouade continue seule', desc: 'Une fois sur le point, l’ordre s’efface : l’escouade reprend sa progression d’elle-même (voies, Tiroir, ordre de l’équipe) à partir de là, sans revenir en arrière.' }] },
  };
  const ordLast = { mode: 'methodique', arrivee: 'tenir' };
  try { const s = JSON.parse(localStorage.getItem('ot-ordre') || 'null'); if (s) for (const k in ordLast) if (s[k] && ORD_OPTS[k].choix.some(c => c.v === s[k])) ordLast[k] = s[k]; } catch (e) { /* stockage indisponible */ }
  let ordSel = null, ordSelHist = [], ordMenu = null, ordGroups = [new Set(), new Set()];   // ordSel : null = Tous, sinon Set d'identifiants d'opérateurs
  function ordUnits() { return ordSel ? battle.teams[0].units.filter(u => ordSel.has(u.id)) : battle.teams[0].units; }
  function ordWho() { const us = ordUnits().filter(u => u.alive); return ordSel ? us.map(u => u.callsign).join(', ') || 'personne' : `Tous (${us.length})`; }
  function ordShowSel() {
    document.querySelectorAll('#roster0 .card').forEach(c => c.classList.toggle('osel', !!ordSel && ordSel.has(c.dataset.id)));
    const all = $('#roster0 .oall'); if (all) all.classList.toggle('on', !ordSel);
    const same = (a, b) => !!a && a.size === b.size && [...a].every(id => b.has(id));
    document.querySelectorAll('#roster0 .ogrp button').forEach(b => b.classList.toggle('on', same(ordSel, ordGroups[+b.dataset.g])));
    if (ordMenu) ordMenu.el.querySelector('.omwho').textContent = ordWho();
  }
  function ordSetSel(s) { ordSelHist.push({ t: performance.now(), s: ordSel ? new Set(ordSel) : null }); if (ordSelHist.length > 4) ordSelHist.shift(); ordSel = s && s.size ? s : null; ordShowSel(); }
  function ordSelUndoDbl() { const h = ordSelHist.length >= 2 ? ordSelHist[ordSelHist.length - 2] : null; if (h && performance.now() - h.t < 700) { ordSel = h.s; ordShowSel(); } }   // un double-clic (suivre) ne change pas la sélection
  function ordRosterHooks(el) {
    if (ordRosterHooks.battle !== battle) {   // nouvelle bataille : « Tous » ; groupes par défaut = les deux moitiés du Tiroir (3 + 2)
      ordRosterHooks.battle = battle; ordSel = null; ordSelHist = []; topClear();
      const us = battle.teams[0].units; ordGroups = [0, 1].map(k => new Set(us.filter((u, i) => (u.boundGroup === 0 || u.boundGroup === 1 ? u.boundGroup : i % 2) === k).map(u => u.id)));
    }
    el.insertAdjacentHTML('afterbegin', '<button class="oall on" title="Les ordres (clic droit sur le sol) vont à toute l’escouade. Pour choisir : clic sur une carte ou sur un opérateur, rectangle au clic gauche maintenu ; Maj : plusieurs.">Tous</button>'
      + '<div class="ogrp">' + [0, 1].map(k => `<button data-g="${k}" title="Groupe ${k + 1} — clic : le choisir · Maj+clic : y ranger la sélection en cours">G${k + 1}</button>`).join('') + '</div>'
      + '<div class="otop"><button class="topgo" title="Top action : lance en même temps tous les ordres mis « en attente du top »">TOP <i></i></button><button class="topx" title="Annuler les ordres en attente du top">✕</button></div>');
    el.querySelector('.oall').addEventListener('click', () => ordSetSel(null));
    el.querySelector('.topgo').addEventListener('click', () => topFire());
    el.querySelector('.topx').addEventListener('click', () => { topClear(); flashBattle('Top action : ordres en attente annulés.'); });
    topUI();
    el.querySelectorAll('.ogrp button').forEach(b => b.addEventListener('click', (e) => {
      const k = +b.dataset.g;
      if (e.shiftKey) { if (!ordSel) { flashBattle('Groupe : choisissez d’abord des opérateurs (cartes), puis Maj+clic sur G' + (k + 1) + '.'); return; } ordGroups[k] = new Set(ordSel); flashBattle(`Groupe ${k + 1} : ${ordWho()}.`); ordShowSel(); return; }
      const s2 = new Set([...ordGroups[k]].filter(id => unitById[id] && unitById[id].alive)); if (!s2.size) { flashBattle(`Groupe ${k + 1} : personne en état.`); return; }
      ordSetSel(s2);
    }));
    el.querySelectorAll('.card').forEach(c => c.addEventListener('click', (e) => {
      const id = c.dataset.id, u = unitById[id]; if (!u || !u.alive) return;
      if (e.shiftKey) { const s = ordSel ? new Set(ordSel) : new Set(); if (s.has(id)) s.delete(id); else s.add(id); ordSetSel(s); }
      else ordSetSel(ordSel && ordSel.size === 1 && ordSel.has(id) ? null : new Set([id]));
    }));
    ordShowSel();
  }
  // point du sol sous le curseur (plan y = 0), ramené sur un point marchable par le moteur
  const ordRay = new THREE.Raycaster(), ordPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function ordGround(cx, cy) {
    const r = canvas.getBoundingClientRect(); if (!r.width || !r.height) return null;
    ordRay.setFromCamera(new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
    const p = new THREE.Vector3(); if (!ordRay.ray.intersectPlane(ordPlane, p)) return null;
    if (p.x < -4 || p.z < -4 || p.x > battle.map.width + 4 || p.z > battle.map.depth + 4) return null;   // ciel, horizon : pas d'ordre
    // clic sur une voiture, un mur… : le point est pris au pied de l'obstacle, du côté de la caméra (pas derrière lui)
    // (seulement les obstacles larges : un tronc d'arbre ou un poteau ne capte pas le clic)
    let best = ordRay.ray.origin.distanceTo(p), hit = null; const h = new THREE.Vector3(), bx = new THREE.Box3();
    for (const o of battle.map.obstacles) { if (Math.min(o.w, o.d) < 0.8) continue; bx.min.set(o.x, 0, o.z); bx.max.set(o.x + o.w, o.h, o.z + o.d); if (ordRay.ray.intersectBox(bx, h) && ordRay.ray.origin.distanceTo(h) < best) { best = ordRay.ray.origin.distanceTo(h); p.copy(h); hit = o; } }
    if (hit) {   // on recule vers la caméra jusqu'au bord de CET obstacle (pas à travers toute une rangée de voitures)
      const d = ordRay.ray.direction, L = Math.hypot(d.x, d.z) || 1, M = 0.45, inHit = () => p.x > hit.x - M && p.x < hit.x + hit.w + M && p.z > hit.z - M && p.z < hit.z + hit.d + M;
      for (let k = 0; k < 40 && inHit(); k++) { p.x -= d.x / L * 0.25; p.z -= d.z / L * 0.25; }
    }
    return battle.orderPoint(p.x, p.z);
  }
  function openOrderMenu(cx, cy) {
    closeOrderMenu();
    const p = ordGate(cx, cy); if (!p) return;
    ordMenuAt(cx, cy, p);
  }
  // un ordre est-il possible ici ? (point du sol, sinon null avec le refus expliqué)
  function ordGate(cx, cy) {
    if (!battle || $('#app').classList.contains('hidden') || !$('#result').classList.contains('hidden')) return null;
    // refus expliqués (avant : rien ne se passait — « Revoir la bataille », le gros bouton de l'écran de fin, rejoue la
    // bataille à l'identique et ressemble à une nouvelle partie où le clic droit ne marchait plus)
    if (reviewing) { flashBattle('Revue de la bataille : elle est rejouée à l’identique, les ordres sont désactivés. Lancez une nouvelle bataille pour donner des ordres.'); return null; }
    if (briefing) { flashBattle('Ordre : lancez d’abord la mission.'); return null; }
    if (battle.over) { flashBattle('La bataille est terminée.'); return null; }
    const p = ordGround(cx, cy); if (!p) { flashBattle('Ordre : cliquez sur le sol du terrain.'); return null; }
    return p;
  }
  function ordMenuAt(cx, cy, p) {
    closeOrderMenu(); ordOrientEnd();
    const adv = !!SETTINGS.ordAdv;   // « Ordres avancés » (réglages) : sinon seulement Déplacement et Arrivée
    const pick = Object.assign({}, ordLast, { feu: 'volonte' });   // le feu revient toujours à « À volonté »
    if (!adv && !ORD_OPTS.arrivee.choix.some(c => c.v === pick.arrivee)) pick.arrivee = 'tenir';
    const el = document.createElement('div'); el.className = 'ordmenu' + (adv ? '' : ' simple');
    const nSmoke = ordGrenCount('smoke');
    el.innerHTML = `<div class="omhead"><b>Ordre</b><span class="omwho"></span></div>` + Object.entries(ORD_OPTS).map(([cat, o]) =>
      `<div class="omsec">${o.titre}${cat === 'mode' ? `<button class="omfum" title="Franchir, Décrocher : le premier qui a un fumigène le lance côté danger pour masquer le passage ou le repli (un fumigène par opérateur)."${nSmoke ? '' : ' disabled'}><span class="omico">${ORD_SVG.smoke}</span>Avec fumée <i>${nSmoke}</i></button>` : ''}</div><div class="omrow">${o.choix.map(c => `<button class="omopt" data-cat="${cat}" data-v="${c.v}" title="${escapeHtml(c.desc)}"><span class="omico">${ORD_SVG[c.v] || ''}</span><b>${c.nom}</b><small>${c.aide}</small></button>`).join('')}</div>`).join('')
      + `<div class="omsec omsecfeu">Feu</div><div class="omfeu">${ORD_FEU.map(c => `<button class="omopt omf" data-cat="feu" data-v="${c.v}" title="${escapeHtml(c.desc)}"><span class="omico">${ORD_SVG[c.v]}</span><b>${c.nom}</b></button>`).join('')}</div>`
      + `<button class="omplus">Plus…</button><div class="ommore"><div class="omsec">Autre arrivée</div><div class="omrow">${ORD_PLUS_ARR.map(c => `<button class="omopt" data-cat="arrivee" data-v="${c.v}" title="${escapeHtml(c.desc)}"><span class="omico">${ORD_SVG[c.v]}</span><b>${c.nom}</b><small>${c.aide}</small></button>`).join('')}</div>${battle.map.lamps && battle.map.lamps.length ? `<div class="omsec">Décor</div><div class="omrow"><button class="omopt omlamp" title="Le plus proche des opérateurs choisis qui voit la lampe (45 m au plus) tire dessus : la zone autour (≈ 9 m) retombe dans le noir. Le coup de feu s’entend."${ordLampNear(p) ? '' : ' disabled'}><span class="omico">${ORD_SVG.lampe}</span><b>Éteindre le lampadaire</b><small>${ordLampNear(p) ? 'La zone retombe dans le noir' : 'Clic droit au pied d’un lampadaire allumé'}</small></button></div>` : ''}<div class="omsec">Lancer ici</div><div class="omfeu omgren">${ORD_GREN.map(c => { const n = ordGrenCount(c.v); return `<button class="omopt omf omg" data-g="${c.v}" title="${escapeHtml(c.desc)}"${n ? '' : ' disabled'}><span class="omico">${ORD_SVG[c.v]}</span><b>${c.nom}</b><i>${n}</i></button>`; }).join('')}</div></div>`
      + `<button class="omtop" title="Top action : l’ordre (déplacement, grenade, lampadaire) attend le signal ; bouton TOP en bas pour tout lancer d’un coup">Attendre le top</button><button class="omgo">Confirmer</button><div class="omhint">${ordVia.length ? `<b class="omvia">Par ${ordVia.length} point${ordVia.length > 1 ? 's' : ''} de passage</b> · ` : ''}Clic sur un choix surligné ou Confirmer · Échap : annuler</div>`;
    $('main').appendChild(el);
    const show = () => { el.querySelectorAll('.omopt[data-cat]').forEach(b => b.classList.toggle('on', pick[b.dataset.cat] === b.dataset.v)); el.classList.toggle('fumok', pick.mode === 'franchir' || pick.mode === 'decrocher'); el.querySelector('.omfum').classList.toggle('on', !!pick.fumee); };
    el.querySelector('.omfum').addEventListener('click', () => { pick.fumee = !pick.fumee; show(); });
    el.querySelectorAll('.omopt[data-cat]').forEach(b => b.addEventListener('click', () => { const was = pick[b.dataset.cat] === b.dataset.v; pick[b.dataset.cat] = b.dataset.v; show(); if (was) ordConfirm(); }));
    el.querySelector('.omgo').addEventListener('click', () => ordConfirm());
    el.classList.toggle('plus', ordPlusOpen);
    el.querySelector('.omplus').addEventListener('click', () => { ordPlusOpen = !ordPlusOpen; el.classList.toggle('plus', ordPlusOpen); ordPlace(el, cx, cy); });
    el.querySelectorAll('.omg').forEach(b => b.addEventListener('click', () => ordGrenade(b.dataset.g)));
    const lb = el.querySelector('.omlamp'); if (lb) lb.addEventListener('click', () => ordLamp());
    el.querySelector('.omtop').addEventListener('click', () => { pick.top = !pick.top; el.querySelector('.omtop').classList.toggle('on', !!pick.top); el.querySelector('.omgo').textContent = pick.top ? 'Mettre en attente' : 'Confirmer'; });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    ordPlace(el, cx, cy);
    ordMenu = { el, p, pick }; show(); ordShowSel(); ordMarkGhost(p);
    if (MANUAL) render();
  }
  // taille réelle à l'écran (le menu suit l'échelle du HUD, CSS zoom) ; left/top s'expriment avant ce zoom
  function ordPlace(el, cx, cy) {
    const mr = $('main').getBoundingClientRect(), z = parseFloat(getComputedStyle(el).zoom) || 1, br = el.getBoundingClientRect(), W = br.width, H = br.height;
    el.style.left = (Math.max(8, Math.min(mr.width - W - 8, cx - mr.left + 14)) / z).toFixed(1) + 'px';
    el.style.top = (Math.max(8, Math.min(mr.height - H - 8, cy - mr.top - H / 2)) / z).toFixed(1) + 'px';
  }
  let ordPlusOpen = false;
  // D7 — points de passage : Maj + clic droit sur le sol en pose un (2 au plus) ; le clic droit suivant ouvre le menu de
  // l'ordre, qui passera par eux dans l'ordre (arg.via). Échap : on les retire. Ligne pointillée entre les marqueurs.
  const VIA_MAX = 2; let ordVia = [];
  function ordAddVia(cx, cy) {
    if (!battle || reviewing || briefing || battle.over || $('#app').classList.contains('hidden')) { openOrderMenu(cx, cy); return; }
    closeOrderMenu();
    const q = ordGround(cx, cy); if (!q) { flashBattle('Point de passage : cliquez sur le sol du terrain.'); return; }
    if (ordVia.length >= VIA_MAX) { flashBattle(`${VIA_MAX} points de passage au plus. Clic droit : la destination · Échap : effacer.`); return; }
    ordVia.push({ x: Math.round(q.x * 100) / 100, z: Math.round(q.z * 100) / 100 }); ordViaDraw();
    flashBattle(`Point de passage ${ordVia.length} posé. ${ordVia.length < VIA_MAX ? 'Maj + clic droit : un autre · ' : ''}Clic droit : la destination.`);
    if (MANUAL) render();
  }
  function ordViaClear() { if (!ordVia.length) return; ordVia = []; ordViaDraw(); }
  function ordGrenCount(k) { return ordUnits().filter(u => u.alive).reduce((n, u) => n + (u.grenades[k] || 0), 0); }
  function ordGrenade(kind) {
    if (!ordMenu) return; const { p } = ordMenu, top = !!ordMenu.pick.top;
    const ids = ordSel ? [...ordSel].filter(id => unitById[id] && unitById[id].alive) : null;
    closeOrderMenu();
    if (ids && !ids.length) { flashBattle('Grenade : aucun opérateur choisi n’est en état.'); return; }
    const garg = { x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100, kind, units: ids };
    if (top) { topAdd('grenade', garg, `${ORD_GREN.find(c => c.v === kind).nom.toLowerCase()} (${ordWhoIds(ids)})`, p); return; }
    const r = battle.command('grenade', 0, garg);
    const nom = ORD_GREN.find(c => c.v === kind).nom.toLowerCase();
    flashBattle(r.ok ? `${r.callsign} lance : ${nom}.` : `${ORD_GREN.find(c => c.v === kind).nom} impossible : ${r.reason}.`); pumpLog();
    if (MANUAL) render();
  }
  // lampadaire allumé à moins de 6 m du point (comme le moteur)
  function ordLampNear(p) { return (battle.map.lamps || []).some(l => l.on && Math.hypot(l.x - p.x, l.z - p.z) < 6); }
  function ordWhoIds(ids) { return ids ? ids.map(id => unitById[id] && unitById[id].callsign).filter(Boolean).join(', ') : 'le plus proche'; }
  function ordLamp() {
    if (!ordMenu) return; const { p } = ordMenu, top = !!ordMenu.pick.top;
    const ids = ordSel ? [...ordSel].filter(id => unitById[id] && unitById[id].alive) : null;
    closeOrderMenu();
    if (ids && !ids.length) { flashBattle('Lampadaire : aucun opérateur choisi n’est en état.'); return; }
    const arg = { x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100, units: ids };
    if (top) { topAdd('lampadaire', arg, `éteindre le lampadaire (${ordWhoIds(ids)})`, p); return; }
    const r = battle.command('lampadaire', 0, arg);
    flashBattle(r.ok ? `${r.callsign} tire sur le lampadaire.` : `Lampadaire : ${r.reason}.`); pumpLog();
    if (MANUAL) render();
  }
  // ---- Top action : des ordres préparés « en attente du top » partent tous au même instant (bouton TOP). Ils restent
  // ici jusqu'au top (rien n'est envoyé au moteur) ; au top, chacun passe par battle.command : rejoués à l'identique en revue.
  const TOPQ = [];
  function topAdd(type, arg, label, p) {
    const mk = ordMarkMesh('ghost'); mk.position.set(p.x, 0, p.z); ordMarks.add(mk);
    TOPQ.push({ type, arg, label, mk }); topUI();
    flashBattle(`En attente du top (${TOPQ.length}) : ${label}.`);
    if (MANUAL) render();
  }
  function topClear() { for (const q of TOPQ) ordFree(q.mk); TOPQ.length = 0; topUI(); }
  function topFire() {
    if (!TOPQ.length) { flashBattle('Top action : aucun ordre en attente (dans le menu d’ordre : « Attendre le top »).'); return; }
    if (battle.over) { topClear(); return; }
    const ko = [];
    for (const q of TOPQ) { const r = battle.command(q.type, 0, q.arg); if (!r || !r.ok) ko.push(`${q.label} : ${r ? r.reason : 'refusé'}`); }
    const n = TOPQ.length; topClear();
    flashBattle(`TOP ! ${n - ko.length} ordre${n - ko.length > 1 ? 's' : ''} lancé${n - ko.length > 1 ? 's' : ''}${ko.length ? ' · refusé : ' + ko.join(' ; ') : ''}.`); pumpLog();
    if (MANUAL) render();
  }
  function topUI() {
    document.querySelectorAll('#roster0 .otop').forEach(d => { d.classList.toggle('has', TOPQ.length > 0); const i = d.querySelector('.topgo i'); if (i) i.textContent = TOPQ.length || ''; });
  }
  function closeOrderMenu() { if (!ordMenu) return; ordMenu.el.remove(); ordMenu = null; ordMarkGhost(null); }
  function ordConfirm(opt) {
    if (!ordMenu) return; const { p, pick } = ordMenu; opt = opt || {};
    const ids = ordSel ? [...ordSel].filter(id => unitById[id] && unitById[id].alive) : null, who = ordWho();
    if (ids && !ids.length) { closeOrderMenu(); flashBattle('Ordre refusé : aucun opérateur choisi n’est en état.'); return; }
    const fum = !!SETTINGS.ordAdv && !!pick.fumee && (pick.mode === 'franchir' || pick.mode === 'decrocher');
    const via = ordVia.slice();
    const aarg = Object.assign({ x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100, units: ids, mode: pick.mode, arrivee: pick.arrivee, feu: pick.feu }, fum ? { fumee: true } : {}, via.length ? { via } : {});
    if (pick.top) {
      const nm0 = (cat) => ORD_OPTS[cat].choix.concat(cat === 'arrivee' ? ORD_PLUS_ARR : []).find(c => c.v === pick[cat]).nom.toLowerCase();
      closeOrderMenu(); ordViaClear(); ordLast.mode = pick.mode; ordLast.arrivee = pick.arrivee;
      topAdd('aller', aarg, `${who} — ${nm0('mode')}, puis ${nm0('arrivee')}`, p); return;
    }
    const r = battle.command('aller', 0, aarg);
    closeOrderMenu(); if (r.ok) ordViaClear();
    if (!r.ok) { flashBattle(`Ordre refusé : ${r.reason}.`); return; }
    ordLast.mode = pick.mode; ordLast.arrivee = pick.arrivee; try { localStorage.setItem('ot-ordre', JSON.stringify(ordLast)); } catch (e) { /* stockage indisponible */ }
    const nm = (cat) => ORD_OPTS[cat].choix.concat(cat === 'arrivee' ? ORD_PLUS_ARR : []).find(c => c.v === pick[cat]).nom.toLowerCase();
    const fe = pick.feu === 'volonte' ? '' : `, feu ${ORD_FEU.find(c => c.v === pick.feu).nom.toLowerCase()}`;
    const fu = fum ? (r.fumee ? ', avec fumée' : ' (fumée impossible : pas de fumigène ou pas de trajectoire)') : '';
    const vi = via.length ? ` par ${via.length} point${via.length > 1 ? 's' : ''} de passage` : '';
    flashBattle(`Ordre : ${who} — déplacement ${nm('mode')}${vi}${fu}, puis ${nm('arrivee')}${fe}.`); pumpLog();
    // A4 : orienter la position — un clic gauche sur le sol montre d'où vient le danger (Échap : direction automatique)
    if (!opt.vite && ((pick.arrivee !== 'manoeuvre' && pick.arrivee !== 'fouiller') || pick.feu === 'appui')) ordOrientStart(r);
    if (MANUAL) render();
  }
  // envoie un ordre « aller » sans le grand menu (clic droit court, liste du clic droit maintenu)
  function ordSend(p, pick, vite) {
    closeOrderMenu();
    const el = document.createElement('div'); el.innerHTML = '<span class="omwho"></span>';   // menu fantôme : ordConfirm lit ordMenu
    ordMenu = { el, p, pick: Object.assign({ feu: 'volonte' }, pick) }; ordConfirm({ vite });
  }
  function ordArrDefaut() { return !!SETTINGS.ordAdv || ORD_OPTS.arrivee.choix.some(c => c.v === ordLast.arrivee) ? ordLast.arrivee : 'tenir'; }
  function ordNom(cat, v) { const c = ORD_OPTS[cat].choix.concat(cat === 'arrivee' ? ORD_PLUS_ARR : []).find(c => c.v === v); return c ? c.nom : v; }

  // ---- Clic droit (20/10) : court = on y va avec les derniers choix ; maintenu (≥ 0,22 s ou la souris bouge) = une liste
  // d'ordres s'ouvre au curseur, le dernier déplacement surligné ; on descend / monte pour choisir, on lâche pour valider.
  const HOLD_MS = 220, HOLD_PX = 10; let ordHold = null;
  function ordHoldStart(cx, cy) {
    ordHoldCancel(); closeOrderMenu();
    const p = ordGate(cx, cy); if (!p) return;
    ordOrientEnd();   // un nouvel ordre remplace l'orientation en attente (ils choisiront seuls)
    ordHold = { cx, cy, p, el: null, idx: -1 }; ordMarkGhost(p);
    ordHold.timer = setTimeout(() => { if (ordHold && !ordHold.el) ordHoldOpen(); }, HOLD_MS);
    if (MANUAL) render();
  }
  function ordHoldItems() {
    const arr = ordArrDefaut(), mode = ordLast.mode, adv = !!SETTINGS.ordAdv;
    const its = [{ k: 'annuler', nom: 'Annuler', aide: 'Ne rien ordonner' }, { sec: 'Déplacement' }];
    for (const c of ORD_OPTS.mode.choix) its.push({ k: 'mode', v: c.v, nom: c.nom, aide: `puis ${ordNom('arrivee', arr).toLowerCase()}` });
    its.push({ sec: 'Arrivée' });
    for (const c of ORD_OPTS.arrivee.choix.concat(adv ? ORD_PLUS_ARR : [])) its.push({ k: 'arrivee', v: c.v, nom: c.nom, aide: `en ${ordNom('mode', mode).toLowerCase()}` });
    its.push({ k: 'menu', nom: 'Plus d’options…', aide: adv ? 'Feu, fumée, grenades, top' : 'Le menu complet' });
    return its;
  }
  function ordHoldOpen() {
    const h = ordHold; if (!h || h.el) return; clearTimeout(h.timer);
    const its = ordHoldItems(), el = document.createElement('div'); el.className = 'ordhold';
    el.innerHTML = `<div class="ohwho">${escapeHtml(ordWho())}</div>` + its.map((it, i) => it.sec ? `<div class="ohsec">${it.sec}</div>`
      : `<div class="ohit${it.k === 'annuler' ? ' ohx' : ''}" data-i="${i}"><span class="omico">${ORD_SVG[it.v] || ''}</span><b>${it.nom}</b><small>${it.aide}</small></div>`).join('')
      + '<div class="ohhint">Glisser vers le bas / le haut pour défiler · lâcher pour valider</div>';
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    $('main').appendChild(el); h.el = el; h.its = its;
    // la ligne du dernier déplacement arrive sous le curseur : lâcher sans bouger = l'ordre habituel
    const def = el.querySelector(`.ohit[data-i="${its.findIndex(it => it.k === 'mode' && it.v === ordLast.mode)}"]`) || el.querySelector('.ohit');
    const mr = $('main').getBoundingClientRect(), z = parseFloat(getComputedStyle(el).zoom) || 1, br = el.getBoundingClientRect(), dr = def.getBoundingClientRect();
    const top = Math.max(8, Math.min(mr.height - br.height - 8, h.cy - mr.top - (dr.top - br.top) - dr.height / 2));
    el.style.left = (Math.max(8, Math.min(mr.width - br.width - 8, h.cx - mr.left + 16)) / z).toFixed(1) + 'px';
    el.style.top = (top / z).toFixed(1) + 'px';
    // dernier déplacement surligné d'office ; la ligne suit le curseur seulement quand il bouge (liste repoussée par un bord)
    h.idx = +def.dataset.i; el.querySelectorAll('.ohit').forEach(r => r.classList.toggle('on', r === def));
    h.idx0 = h.idx; h.oy = h.my !== undefined ? h.my : h.cy;
    if (MANUAL) render();
  }
  // sélecteur qui défile : on part du dernier choix ; chaque cran de souris (hauteur d'une ligne) vers le bas / le haut
  // passe à la ligne suivante / précédente, où que la liste soit à l'écran (elle peut être repoussée par un bord)
  function ordHoldMove(cx, cy) {
    const h = ordHold; if (!h) return; h.mx = cx; h.my = cy;
    if (!h.el) { if (Math.hypot(cx - h.cx, cy - h.cy) >= HOLD_PX) ordHoldOpen(); return; }   // la souris bouge : la liste s'ouvre tout de suite
    const rows = [...h.el.querySelectorAll('.ohit')], k0 = rows.findIndex(r => +r.dataset.i === h.idx0);
    const step = (rows[0].getBoundingClientRect().height || 34) * 0.85;   // un peu moins qu'une ligne : ça défile sans grands gestes
    const k = Math.max(0, Math.min(rows.length - 1, k0 + Math.round((cy - h.oy) / step)));
    const i = +rows[k].dataset.i; if (i === h.idx) return; h.idx = i;
    rows.forEach(r => r.classList.toggle('on', r === rows[k]));
  }
  function ordHoldCancel() { const h = ordHold; if (!h) return; clearTimeout(h.timer); if (h.el) h.el.remove(); ordHold = null; ordMarkGhost(null); }
  function ordHoldEnd(cx, cy) {
    const h = ordHold; if (!h) return;
    if (!h.el) {   // clic court : on y va, derniers choix, feu à volonté, sans étape d'orientation (ils surveillent seuls)
      ordHoldCancel(); ordSend(h.p, { mode: ordLast.mode, arrivee: ordArrDefaut() }, true); return;
    }
    ordHoldMove(cx, cy); const it = h.its[h.idx]; ordHoldCancel();
    if (!it || it.k === 'annuler') { flashBattle('Ordre annulé.'); if (MANUAL) render(); return; }
    if (it.k === 'menu') { ordMenuAt(h.cx, h.cy, h.p); return; }
    ordSend(h.p, it.k === 'mode' ? { mode: it.v, arrivee: ordArrDefaut() } : { mode: ordLast.mode, arrivee: it.v }, false);
  }

  // ---- Sélection à la souris (20/10) : rectangle (clic gauche maintenu) ou clic sur un opérateur ; cercles au sol sous les choisis
  let selBoxEl = null;
  function selBoxDraw(x0, y0, x1, y1) {
    if (!selBoxEl) { selBoxEl = document.createElement('div'); selBoxEl.id = 'selbox'; document.body.appendChild(selBoxEl); }
    if (ordOrient) ordOrientEnd();
    Object.assign(selBoxEl.style, { display: 'block', left: Math.min(x0, x1) + 'px', top: Math.min(y0, y1) + 'px', width: Math.abs(x1 - x0) + 'px', height: Math.abs(y1 - y0) + 'px' });
  }
  function selBoxHide() { if (selBoxEl) selBoxEl.style.display = 'none'; }
  function selScreen(u) {   // position à l'écran du buste d'un opérateur (corps dessiné, sinon simulation)
    const m = meshes[u.id], r = canvas.getBoundingClientRect(), v = m ? new THREE.Vector3(m.group.position.x, 1.0, m.group.position.z) : new THREE.Vector3(u.x, 1.0, u.z);
    v.project(camera); if (v.z > 1) return null;
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }
  function selCanUse() { return !!battle && !$('#app').classList.contains('hidden') && !reviewing; }
  function selApply(ids, add) {
    const alive = battle.teams[0].units.filter(u => u.alive).map(u => u.id);
    const s = add ? new Set([...(ordSel || []), ...ids]) : new Set(ids);
    ordSetSel(alive.every(id => s.has(id)) ? null : s);   // tout le monde = « Tous »
    if (MANUAL) render();
  }
  function selBoxEnd(x0, y0, x1, y1, add) {
    selBoxHide(); if (!selCanUse()) return;
    const L = Math.min(x0, x1), R = Math.max(x0, x1), T = Math.min(y0, y1), B = Math.max(y0, y1);
    const ids = battle.teams[0].units.filter(u => u.alive).filter(u => { const q = selScreen(u); return q && q.x >= L && q.x <= R && q.y >= T && q.y <= B; }).map(u => u.id);
    if (!ids.length) { if (!add) flashBattle('Sélection : aucun opérateur dans le rectangle.'); return; }
    selApply(ids, add); flashBattle(`Sélection : ${ordWho()}.`);
  }
  function selClick(cx, cy, add) {
    if (!selCanUse()) return;
    let best = null, bd = 42;   // 42 px autour du buste
    for (const u of battle.teams[0].units) { if (!u.alive) continue; const q = selScreen(u); if (!q) continue; const d = Math.hypot(q.x - cx, q.y - cy); if (d < bd) { bd = d; best = u; } }
    if (!best) { if (!add && ordSel) { ordSetSel(null); flashBattle('Sélection : tous.'); } return; }
    if (add) { const s = ordSel ? new Set(ordSel) : new Set(); if (s.has(best.id)) s.delete(best.id); else s.add(best.id); ordSetSel(s); }
    else ordSetSel(new Set([best.id]));
    if (MANUAL) render();
  }
  const selRings = new THREE.Group(); scene.add(selRings);
  function updateSelRings() {
    const ids = ordSel && battle ? [...ordSel].filter(id => unitById[id] && unitById[id].alive && meshes[id]) : [];
    while (selRings.children.length < ids.length) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 32), new THREE.MeshBasicMaterial({ color: 0x4aa3ff, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.renderOrder = 6; selRings.add(m);
    }
    selRings.children.forEach((m, i) => { const id = ids[i]; m.visible = !!id; if (id) { const g = meshes[id].group.position; m.position.set(g.x, 0.05, g.z); } });
  }
  window.addEventListener('keydown', (e) => { if (ordHold && e.code === 'Escape') { e.preventDefault(); ordHoldCancel(); flashBattle('Ordre annulé.'); } else if (ordMenu && e.code === 'Escape') { e.preventDefault(); closeOrderMenu(); ordViaClear(); } else if (ordVia.length && e.code === 'Escape') { e.preventDefault(); ordViaClear(); flashBattle('Points de passage effacés.'); } else if (ordOrient && e.code === 'Escape') { e.preventDefault(); ordOrientEnd(); flashBattle('Ils choisiront seuls où surveiller (menace connue, sinon sens de la marche).'); } }, true);
  // ---- Orienter la position (A4) : juste après Confirmer, une flèche part du point vers le curseur ; clic gauche = d'où vient
  // le danger (battle.command('orienter', …), rejoué en revue). Échap, clic droit ou nouvel ordre : automatique.
  let ordOrient = null; const ordArrow = new THREE.Group(); ordArrow.visible = false; scene.add(ordArrow);
  { const sh = new THREE.Shape(); sh.moveTo(0, -0.18); sh.lineTo(0.78, -0.18); sh.lineTo(0.78, -0.42); sh.lineTo(1, 0); sh.lineTo(0.78, 0.42); sh.lineTo(0.78, 0.18); sh.lineTo(0, 0.18); sh.closePath();
    const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: 0xffa23a, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide }));
    m.rotation.x = Math.PI / 2; m.renderOrder = 7; ordArrow.add(m); ordArrow.userData.m = m; }
  function ordArrowAt(g, p, q, len) {   // flèche plate au sol de p vers q (longueur len, ou jusqu'à q)
    const a = Math.atan2(q.z - p.z, q.x - p.x), L = len || Math.max(1.5, Math.min(14, Math.hypot(q.x - p.x, q.z - p.z)));
    g.position.set(p.x, 0.06, p.z); g.rotation.set(0, -a, 0); g.scale.set(L, 1, Math.min(2.2, 0.8 + L * 0.1)); g.visible = true;
  }
  // Éventail « zone surveillée » (orienter la position) : secteur de 100° et 8 m devant le point d'arrivée, flèche au milieu ;
  // il tourne en douceur vers le curseur (pas de saut quand le curseur passe sur une voiture, longueur fixe).
  const ordFan = new THREE.Group(); ordFan.visible = false; scene.add(ordFan);
  { const mk = (geo, op) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffa23a, transparent: true, opacity: op, depthTest: false, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide })); m.rotation.x = Math.PI / 2; m.renderOrder = 7; ordFan.add(m); return m; };
    const A = 50 * Math.PI / 180;
    mk(new THREE.RingGeometry(1.0, 8, 40, 1, -A, 2 * A), 0.22);           // secteur plein, léger
    mk(new THREE.RingGeometry(7.75, 8, 40, 1, -A, 2 * A), 0.85);          // bord extérieur net
    for (const s of [-1, 1]) { const g = new THREE.PlaneGeometry(7, 0.16); g.translate(4.5, 0, 0); const m = mk(g, 0.75); m.rotation.z = s * A; }   // bords latéraux
    const sh = new THREE.Shape(); sh.moveTo(1.2, -0.22); sh.lineTo(5.6, -0.22); sh.lineTo(5.6, -0.6); sh.lineTo(6.9, 0); sh.lineTo(5.6, 0.6); sh.lineTo(5.6, 0.22); sh.lineTo(1.2, 0.22); sh.closePath();
    mk(new THREE.ShapeGeometry(sh), 0.95); }
  // direction du curseur vue depuis le point : simple plan du sol (sans « coller » aux voitures), ou direction de la caméra
  function ordDirTo(cx, cy, p) {
    const r = canvas.getBoundingClientRect(); if (!r.width || !r.height) return null;
    ordRay.setFromCamera(new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
    const q = new THREE.Vector3(); let dx, dz;
    if (ordRay.ray.intersectPlane(ordPlane, q)) { dx = q.x - p.x; dz = q.z - p.z; } else { dx = ordRay.ray.direction.x; dz = ordRay.ray.direction.z; }
    if (Math.hypot(dx, dz) < 0.3) return null; return Math.atan2(dz, dx);
  }
  const ordPtr = { x: null, y: null }; canvas.addEventListener('pointermove', (e) => { ordPtr.x = e.clientX; ordPtr.y = e.clientY; });
  function ordOrientStart(r) {
    ordOrientEnd(); ordOrient = { id: r.id, p: { x: r.x, z: r.z }, a: null, ta: null, t: performance.now() };
    let el = $('#orhint'); if (!el) { el = document.createElement('div'); el.id = 'orhint'; $('main').appendChild(el); }
    el.innerHTML = '<b>Où doivent-ils surveiller ?</b> Bouge la souris pour tourner l’éventail orange, puis clic gauche · <b>Échap</b> : ils choisissent seuls'; el.style.display = 'block';
    if (ordPtr.x !== null) ordOrientMove(ordPtr.x, ordPtr.y);
  }
  function ordOrientEnd() { ordOrient = null; ordFan.visible = false; ordArrow.visible = false; const el = $('#orhint'); if (el) el.style.display = 'none'; }
  function ordOrientMove(cx, cy) { if (!ordOrient) return; const a = ordDirTo(cx, cy, ordOrient.p); if (a === null) return; ordOrient.ta = a; if (ordOrient.a === null || MANUAL) ordOrient.a = a; ordOrientFrame(); if (MANUAL) render(); }
  function ordOrientFrame() {   // à chaque image : l'éventail rattrape la direction voulue en douceur (chemin angulaire le plus court)
    const o = ordOrient; if (!o || o.ta === null) return;
    const now = performance.now(), dt = Math.min(0.1, (now - o.t) / 1000); o.t = now;
    let d = o.ta - o.a; d = Math.atan2(Math.sin(d), Math.cos(d)); o.a += d * Math.min(1, dt * 16);
    ordFan.position.set(o.p.x, 0.07, o.p.z); ordFan.rotation.set(0, -o.a, 0); ordFan.visible = true;
  }
  function ordOrientClick(cx, cy) {
    if (!ordOrient) return false; const o = ordOrient, a = ordDirTo(cx, cy, o.p) ?? o.ta; ordOrientEnd();
    if (a === null || a === undefined || !battle || battle.over) return true;
    const q = { x: o.p.x + Math.cos(a) * 10, z: o.p.z + Math.sin(a) * 10 };   // un point à 10 m dans la direction choisie
    const r = battle.command('orienter', 0, { ordre: o.id, x: Math.round(q.x * 100) / 100, z: Math.round(q.z * 100) / 100 });
    flashBattle(r.ok ? 'C’est noté : ils surveilleront de ce côté en arrivant.' : `Orientation refusée : ${r.reason}.`); pumpLog(); if (MANUAL) render();
    return true;
  }
  canvas.addEventListener('pointermove', (e) => { if (ordOrient && !e.buttons) ordOrientMove(e.clientX, e.clientY); });
  document.addEventListener('pointerdown', (e) => { if (ordMenu && !ordMenu.el.contains(e.target)) closeOrderMenu(); }, true);
  // marqueurs au sol : un par ordre en cours (icône du mode), retiré quand tout le groupe est arrivé ; fantôme pendant le menu
  const ordMarks = new THREE.Group(); scene.add(ordMarks); const ordTex = {};
  function ordTexture(kind) {
    if (ordTex[kind]) return ordTex[kind];
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
    g.strokeStyle = '#4aa3ff'; g.lineWidth = 14; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 12, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(10,20,34,.55)'; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 19, 0, Math.PI * 2); g.fill();
    if (kind !== 'ghost') {
      const img = new Image(); img.onload = () => { g.drawImage(img, S * 0.22, S * 0.22, S * 0.56, S * 0.56); t.needsUpdate = true; if (MANUAL) render(); };
      img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(ORD_SVG[kind].replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" ').replace(/currentColor/g, '#ffffff'));
    }
    const t = new THREE.CanvasTexture(c); if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; return (ordTex[kind] = t);
  }
  // anneau au sol (même hologramme que les zones de départ) + icône du mode qui flotte au-dessus (visible derrière les voitures)
  function ordMarkMesh(kind) {
    const g = new THREE.Group(), ring = groundHolo(0.9, { color: 0x4aa3ff, alpha: kind === 'ghost' ? 0.55 : 0.95, fill: 0.5 }); ring.position.y = 0.03; g.add(ring);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ordTexture(kind), transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false, opacity: kind === 'ghost' ? 0.7 : 1 }));
    sp.scale.setScalar(kind === 'ghost' ? 0.9 : 1.3); sp.position.y = kind === 'ghost' ? 1.1 : 3.8; sp.renderOrder = 6; g.add(sp); g.userData.sp = sp;
    return g;
  }
  function ordFree(g) { ordMarks.remove(g); g.traverse(o => { if (o.isMesh || o.isSprite) { if (o.geometry && o.isMesh) o.geometry.dispose(); o.material.dispose(); } }); }
  let ordGhost = null, ordBattle = null; const ordShown = {};
  function ordMarkGhost(p) { if (ordGhost) { ordFree(ordGhost); ordGhost = null; } if (p) { ordGhost = ordMarkMesh('ghost'); ordGhost.position.set(p.x, 0, p.z); ordMarks.add(ordGhost); } }
  const ordViaG = new THREE.Group(); ordMarks.add(ordViaG); let ordViaKey = '';
  const ordDash = new THREE.LineDashedMaterial({ color: 0x9fd0ff, dashSize: 0.7, gapSize: 0.45, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
  function ordViaLine(pts) {   // pointillés au sol (au-dessus des voitures : visibles)
    const geo = new THREE.BufferGeometry().setFromPoints(pts.map(q => new THREE.Vector3(q.x, 0.08, q.z))), l = new THREE.Line(geo, ordDash);
    l.computeLineDistances(); l.renderOrder = 6; return l;
  }
  function ordViaDraw() {
    const sets = [];
    if (ordVia.length) sets.push({ pts: ordVia.concat(ordMenu ? [ordMenu.p] : []), n: ordVia.length });   // en attente (+ destination du menu)
    if (battle) { const team = battle.teams[0], oi = team.ordInfo || {}, seen = {};
      for (const u of team.units) { const o = u.alive && u.moveOrder; if (!o || !o.via || seen[o.id]) continue; seen[o.id] = 1; const inf = oi[o.id]; if (inf && inf.via && inf.viaDone < inf.via.length) sets.push({ pts: inf.via.slice(inf.viaDone).concat([{ x: inf.px, z: inf.pz }]), n: inf.via.length - inf.viaDone }); } }
    const key = JSON.stringify(sets); if (key === ordViaKey) return; ordViaKey = key;
    for (const c of ordViaG.children.slice()) { ordViaG.remove(c); c.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material !== ordDash) o.material.dispose(); }); }
    for (const { pts, n } of sets) {
      if (pts.length > 1) ordViaG.add(ordViaLine(pts));
      for (let i = 0; i < n; i++) { const r = groundHolo(0.75, { color: 0x9fd0ff, alpha: 0.95, fill: 0.4 }); r.position.set(pts[i].x, 0.03, pts[i].z); ordViaG.add(r); }
    }
  }
  function updateOrderMarks() {
    if (ordBattle !== battle) { ordBattle = battle; for (const k in ordShown) { ordFree(ordShown[k]); delete ordShown[k]; } closeOrderMenu(); ordOrientEnd(); ordVia = []; }
    ordViaDraw();
    const live = {};
    for (const u of battle.teams[0].units) if (u.alive && u.moveOrder) live[u.moveOrder.id] = u.moveOrder;
    for (const k in ordShown) if (!live[k]) { ordFree(ordShown[k]); delete ordShown[k]; }
    const bob = MANUAL ? 0 : 0.12 * Math.sin(performance.now() / 300);
    for (const k in live) {
      if (!ordShown[k]) { const m = ordMarkMesh(live[k].mode); m.position.set(live[k].px, 0, live[k].pz); ordMarks.add(m); ordShown[k] = m; }
      ordShown[k].userData.sp.position.y = 3.8 + bob;
    }
    ordFireMarks();
  }
  // Feu (vague 1) : flèche d'orientation des ordres en route, zone arrosée par un groupe en appui (anneau orange), main
  // levée sur les cartes des opérateurs en feu retenu (clic : « Feu ! »)
  const ordZones = {}, ordDirs = {};
  function ordFireMarks() {
    const team = battle.teams[0], oi = team.ordInfo || {}, zl = {}, dl = {};
    for (const u of team.units) {
      if (!u.alive) continue; const o = battle.orderOf(u); if (!o) continue;
      if (u.moveOrder && o.inf.orient) dl[o.id] = o.inf;
      if (o.inf.feu === 'appui' && u.keyOrder && o.inf.zone && o.inf.zone.x !== null && battle.t - o.inf.zone.t < 1.5) zl[o.id] = o.inf.zone;
    }
    for (const k in ordZones) if (!zl[k] || Math.abs(ordZones[k].userData.r - zl[k].r) > 0.5) { ordFree(ordZones[k]); delete ordZones[k]; }
    for (const k in zl) {
      if (!ordZones[k]) { const g = new THREE.Group(), ring = groundHolo(zl[k].r, { color: 0xff8a2a, alpha: 0.8, fill: 0.25 }); ring.position.y = 0.04; g.add(ring); g.userData.r = zl[k].r; ordMarks.add(g); ordZones[k] = g; }
      ordZones[k].position.set(zl[k].x, 0, zl[k].z);
    }
    for (const k in ordDirs) if (!dl[k]) { ordMarks.remove(ordDirs[k]); delete ordDirs[k]; }
    for (const k in dl) {
      if (!ordDirs[k]) { const g = ordFan.clone(); g.scale.setScalar(0.55); ordMarks.add(g); ordDirs[k] = g; }   // petit éventail : zone que le groupe surveillera
      const inf = dl[k], g = ordDirs[k]; g.position.set(inf.px, 0.06, inf.pz); g.rotation.set(0, -Math.atan2(inf.orient.z - inf.pz, inf.orient.x - inf.px), 0); g.visible = true;
    }
    for (const c of document.querySelectorAll('#roster0 .card')) {
      const u = unitById[c.dataset.id], o = u && u.alive && battle.orderOf(u), held = !!(o && o.inf.feu === 'retenu' && !o.inf.released);
      let f = c.querySelector('.ofire');
      if (held && !f) {
        f = document.createElement('button'); f.className = 'ofire'; f.title = 'Feu retenu — clic : ouvrir le feu maintenant'; f.innerHTML = ORD_SVG.retenu; c.appendChild(f);
        f.addEventListener('click', (e) => { e.stopPropagation(); const r = battle.command('feu', 0, { units: [c.dataset.id] }); if (!r.ok) flashBattle(`Feu : ${r.reason}.`); pumpLog(); if (MANUAL) render(); });
        f.addEventListener('dblclick', (e) => e.stopPropagation());
      }
      if (f) f.style.display = held ? '' : 'none';
    }
  }
  let bflashTimer = null;
  function flashBattle(msg) { let el = $('#bflash'); if (!el) { el = document.createElement('div'); el.id = 'bflash'; el.style.cssText = 'position:absolute;left:50%;top:14px;transform:translateX(-50%);background:rgba(15,20,26,.9);border:1px solid var(--line);border-radius:8px;padding:6px 12px;font-size:12px;z-index:6;pointer-events:none'; $('main').appendChild(el); } el.textContent = msg; el.style.display = 'block'; clearTimeout(bflashTimer); bflashTimer = setTimeout(() => { el.style.display = 'none'; }, 2200); }
  // ---- Répliques radio (bulles au-dessus des soldats), tirées des événements réels de la simulation ----
  const BARKS = {
    spot: ['Contact !', 'Contact, droit devant !', 'Ennemi en vue !'], reload: ['Je recharge !', 'Rechargement !', 'Couvrez-moi, je recharge !'],
    grenade: ['Grenade !'], throw: ['Grenade, à couvert !', 'Je lance !'], flashbang: ['Flash !', 'Incapacitante !'], flank: ['Je contourne !', 'Je le prends par le flanc !'],
    noammo: ['Plus de munitions !'], revive_start: ['Je m\u2019occupe de lui !', 'J\u2019arrive, tiens bon !'], revive: ['Debout, on y retourne !', 'Je te tiens !'],
    flash: ['Je ne vois plus rien !', 'Aveuglé !'], shaken: ['Repli !', 'Je décroche !', 'Ça chauffe trop !'], suppress: ['Feu de suppression !', 'Je les cloue !'], down: ['Homme à terre !', 'On a un blessé !', 'Il est touché !'],
    bouge: ['Je bouge !'], couvert: ['Couvert !'], enplace: ['En place.'], reprise: ['Je reprends ma progression.'],   // ordres de déplacement (clic droit)
    drag: ['Je le tire à couvert !'], smoke: ['Fumigène !'],   // évacuation d'un blessé
    feu: ['Feu !'], enappui: ['En appui !'], decroche: ['Je décroche !'], releve: ['Je prends sa place !'],               // feu retenu levé, appui, décrocher, relève dans les bonds
    eclaireur: ['Je passe devant.'],   // carte « Éclaireur »
    fixer: ['On les fixe !'], deborde_nord: ['On déborde par le nord !'], deborde_sud: ['On déborde par le sud !'],   // carte « Fixer et déborder »
    plan_repli: ['On décroche !', 'Repli, on se regroupe !'], plan_contourner: ['On les contourne !', 'Je passe par le flanc !'], plan_embuscade: ['Embuscade, personne ne tire.', 'On les attend.'], plan_fumee: ['Fumée ! On les attend à la sortie.'],   // plans de l'adversaire
  };
  function bark(u, kind) {
    const m = u && meshes[u.id]; if (!m || !u.alive || ended || (m.barkUntil && simTime < m.barkUntil - 1.2)) return;
    const list = BARKS[kind]; if (!list) return;
    let b = m.label.querySelector('.bark'); if (!b) { b = document.createElement('div'); b.className = 'bark'; m.label.prepend(b); }
    b.textContent = list[Math.floor(Math.random() * list.length)]; b.classList.add('on'); m.barkUntil = simTime + 1.8;
    speak(u, b.textContent, kind);
  }
  // voix radio : synthèse vocale du navigateur (si disponible), seulement pour les moments forts, une à la fois,
  // timbre propre à chaque opérateur (hauteur), volume lié au réglage général ; désactivable dans les réglages
  const VOICE_KINDS = new Set(['spot', 'grenade', 'throw', 'down', 'shaken', 'revive_start', 'noammo']);
  let lastVoice = 0;
  function speak(u, text, kind) {
    return;   // synthèse vocale retirée à la demande de l'utilisateur (insupportable) ; les bulles de texte restent
    if (!SETTINGS.voice || muted || MANUAL || !window.speechSynthesis || !VOICE_KINDS.has(kind) || paused) return;
    const now = performance.now(); if (now - lastVoice < 2200 / Math.min(2, speed)) return; lastVoice = now;
    try {
      const ut = new SpeechSynthesisUtterance(text.replace(/[!…]/g, '')); ut.lang = 'fr-FR';
      let h = 0; for (const ch of u.callsign) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      ut.pitch = 0.6 + (h % 7) * 0.1; ut.rate = 1.15 + (speed > 1 ? 0.25 : 0); ut.volume = Math.min(1, SETTINGS.vol * (u.team === 0 ? 0.9 : 0.6));
      const fr = speechSynthesis.getVoices().filter(v => /^fr/i.test(v.lang)); if (fr.length) ut.voice = fr[h % fr.length];
      speechSynthesis.cancel(); speechSynthesis.speak(ut);
    } catch (e) { /* synthèse vocale indisponible */ }
  }
  // fil des neutralisations (en haut à droite) : tireur, arme (silhouette du rôle), victime ; tête, éclats, frappe signalés
  function killFeed(e) {
    const v = e.enemy && unitById[e.enemy]; if (!v) return; const k = e.unit && unitById[e.unit];
    const div = document.createElement('div'); div.className = 'kf';
    const how = e.loc === 'tête' ? '<b class="kfh" title="tir à la tête">⊕</b>' : /grenade|éclat/.test(e.loc || '') ? '<b class="kfh" title="grenade">✸</b>' : /frappe|obus|mortier/.test(e.loc || '') ? '<b class="kfh" title="frappe">✈</b>' : '';
    div.innerHTML = `${k ? `<span class="t${k.team}">${escapeHtml(k.callsign)}</span>${roleImg(k.role.id)}` : ''}${how}<span class="t${v.team}">${escapeHtml(v.callsign)}</span>${v.bleedUntil > battle.t ? '<small>à terre</small>' : ''}`;
    const box = $('#killfeed'); box.appendChild(div); while (box.children.length > 5) box.removeChild(box.firstChild);
    if (!MANUAL) setTimeout(() => div.classList.add('out'), 6000), setTimeout(() => div.remove(), 6800);
  }
  function barkFor(e) {
    if (e.kind === 'down') killFeed(e);
    const u = e.unit && unitById[e.unit];
    if (e.kind === 'spot' && /contact/.test(e.text)) bark(u, 'spot');
    else if (e.kind === 'reload' && Math.random() < 0.35) bark(u, 'reload');
    else if (e.kind === 'grenade' && u) bark(u, /lance une/.test(e.text) ? (e.gk === 'flash' ? 'flashbang' : 'throw') : 'grenade');
    else if (e.kind === 'flank' || e.kind === 'noammo' || e.kind === 'revive_start' || e.kind === 'revive' || e.kind === 'flash' || e.kind === 'shaken' || e.kind === 'drag' || e.kind === 'smoke') bark(u, e.kind);
    else if (e.kind === 'suppress' && Math.random() < 0.5) bark(u, 'suppress');
    // (ordre d'un plan adverse, silencieux : sa bulle vient de l'événement « plan »)
    else if ((e.kind === 'moveorder' && !e.silent) || e.kind === 'bond') { bark(u, e.mode === 'decrocher' ? 'decroche' : 'bouge'); if (e.couvre) bark(unitById[e.couvre], 'couvert'); }
    else if ((e.kind === 'feu' || e.kind === 'enappui' || e.kind === 'releve') && u) bark(u, e.kind);
    else if (e.kind === 'couvre') bark(u, 'couvert');
    else if (e.kind === 'enplace' && u) bark(u, 'enplace');
    else if (e.kind === 'reprise' && u) bark(u, 'reprise');
    else if (e.kind === 'plan' && u) bark(u, 'plan_' + e.plan);
    else if (e.kind === 'fixer' && u) bark(u, 'fixer');
    else if (e.kind === 'eclaireur' && u && !e.contact) bark(u, 'eclaireur');
    else if (e.kind === 'deborde' && u) bark(u, e.nord ? 'deborde_nord' : 'deborde_sud');
    else if (e.kind === 'down' && e.enemy && unitById[e.enemy]) {   // le coéquipier debout le plus proche du blessé
      const d = unitById[e.enemy]; let best = null, bd = 25; for (const a of battle.units) { if (!a.alive || a.team !== d.team) continue; const k = Math.hypot(a.x - d.x, a.z - d.z); if (k < bd) { bd = k; best = a; } }
      bark(best, 'down');
    }
  }
  // journal, bulles et sons d'un ennemi non repéré (il recharge, il repère, il contourne…) : rien ne s'affiche. Les
  // neutralisations restent (fil des neutralisations), comme les tirs qui touchent un opérateur d'Alpha.
  function fogLogHidden(e) {
    if (!fogOn() || e.kind === 'down') return false;
    const a = e.unit && unitById[e.unit]; if (!a || a.team !== 1 || fogShown(a)) return false;
    const v = e.enemy && unitById[e.enemy]; return !(e.kind === 'hit' && v && v.team === 0);
  }
  function pumpLog() {
    const j = $('#journal'), tk = $('#ticker');
    while (logIndex < battle.log.length) {
      const e = battle.log[logIndex++];
      if (fogLogHidden(e)) continue;
      barkFor(e);
      if (e.kind === 'reload' && e.unit && unitById[e.unit]) { const u = unitById[e.unit]; play('recharge', { x: u.x, y: 1, z: u.z }, { vol: 0.9 }); }
      if (e.kind === 'spot' && !contactPlayed) { contactPlayed = true; play('contact', null, { vol: 1, varie: 0 }); }
      if (e.silent) continue;
      const div = document.createElement('div');
      div.className = 'entry k-' + e.kind + (e.team !== undefined ? ' team' + e.team : '');
      div.innerHTML = `<span class="t">${e.time}</span>${escapeHtml(e.text)}`;
      j.appendChild(div);
      if (e.kind !== 'spot' || /contact/.test(e.text)) { const d2 = div.cloneNode(true); d2.className = 'k-' + e.kind; tk.appendChild(d2); while (tk.children.length > 4) tk.removeChild(tk.firstChild); }
    }
    while (j.children.length > 400) j.removeChild(j.firstChild);
    j.scrollTop = j.scrollHeight;
  }
  function escapeHtml(s) { return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

  function showResult() {
    const r = battle.result;
    const title = r.winner === -1 ? 'Égalité' : (r.winner === 0 ? 'Vous avez gagné' : 'Vous avez perdu');
    $('#resTitle').textContent = title; $('#resTitle').className = r.winner === -1 ? '' : 'team' + r.winner;
    r.teams.forEach((t, ti) => { $('#resName' + ti).textContent = t.name; $('#resPct' + ti).textContent = t.hpPct + '%'; $('#resPct' + ti).title = 'Vie restante de l\u2019équipe'; const g = insigniaGlyph(battle.teams[ti]); $('#resIns' + ti).innerHTML = OT.Embleme ? OT.Embleme.svg(g, ti ? '#a01a10' : '#f2f7ff') : g; $('#resRate' + ti).textContent = Math.round(t.units.reduce((s, u) => s + OT.Game.defRating(battle.units.find(x => x.id === u.id).def), 0) / Math.max(1, t.units.length)); });
    const row = (label, v0, v1) => `<span class="l">${v0}</span><span class="m">${label}</span><span class="r">${v1}</span>`;
    let html = '';
    if (battle.zone) html += row('Zone capturée', r.teams[0].capture + ' %', r.teams[1].capture + ' %');
    html += row('Neutralisations', r.teams[0].kills, r.teams[1].kills) + '<span class="head">Spéciaux</span>';
    for (const [label, k] of [['Tirs à la tête', 'headshots'], ['Séries', 'streaks'], ['De groupe', 'group'], ['Revanches', 'revenge'], ['Vétérans abattus', 'veteran']]) html += row(label, r.teams[0].specials[k] || 0, r.teams[1].specials[k] || 0);
    $('#resSpecials').innerHTML = html;
    // figures : le meilleur opérateur de chaque équipe, en pied (le perdant baisse son arme)
    r.teams.forEach((t, ti) => {
      const best = t.units.slice().sort((a, b) => (b.stats.kills - a.stats.kills) || (b.stats.damageDealt - a.stats.damageDealt))[0];
      const u = best && battle.units.find(x => x.id === best.id), img = $('#resFig' + ti);
      if (!u || !OT.Portrait) { img.removeAttribute('src'); return; }
      let fac = DATA.FACTIONS[u.def.faction || 'allied'] || DATA.FACTIONS.allied; const td = battle.teams[ti]; if (!u.def.faction && td.uniform) { const uni = DATA.UNIFORMS.find(x => x.id === td.uniform); if (uni) fac = uni; }
      const won = r.winner === ti;
      img.src = OT.Portrait.render({ id: u.def.id, modele: u.def.faction ? 'soldat' : 'gign', weapon: u.weapon.id, uniform: fac.uniform, vest: fac.vest, headgear: u.def.headgear || (u.def.faction ? 'casque_lunettes' : 'casque'), full: true, w: 420, h: 640, aiming: won }) || '';
      img.classList.toggle('lost', r.winner !== -1 && !won);
    });
    let reward = '';
    if (mode === 'mission' && mission) { const rw = OT.Game.computeRewards(window.HQ.profile(), mission, r); reward = ` Récompenses au retour : +${rw.credits} crédits, ${Object.values(rw.xp).reduce((a, b) => a + b, 0)} XP répartis.`; }
    $('#resReason').textContent = `${r.reason} Durée : ${fmtT(r.duration)}. Carte : ${r.map}. Graine ${r.seed}.${reward}`;
    $('#resTables').innerHTML = r.teams.map((t, ti) => `
      <table class="res team${ti}">
        <thead><tr><th colspan="7">${t.name} — ${t.order} — ${t.alive}/5 en état — ${t.hits}/${t.shots} tirs au but</th></tr>
        <tr><th>Opérateur</th><th>État</th><th>PV</th><th>Tirs</th><th>Au but</th><th>Neutr.</th><th>Dégâts inf. / subis</th></tr></thead>
        <tbody>${t.units.map(u => `<tr class="${u.alive ? '' : 'dead'}"><td>${u.callsign} <small>${u.role}</small></td><td>${STATUS_FR[u.status]}</td><td>${u.hp}/${u.maxHp}</td><td>${u.stats.shots}</td><td>${u.stats.hits} (${u.accuracy} %)</td><td>${u.stats.kills}</td><td>${u.stats.damageDealt} / ${u.stats.damageTaken}</td></tr>`).join('')}</tbody>
      </table>`).join('');
    if (window.OT.fitStage) window.OT.fitStage(); $('#result').classList.add('stage1080'); if (window.OT.fitStage) window.OT.fitStage();
    $('#result').querySelectorAll('[data-ico]').forEach(e => { if (!e.dataset.icoDone && OT.Ico) { e.innerHTML = OT.Ico(e.dataset.ico); e.dataset.icoDone = e.dataset.ico; } });
    $('#result').classList.remove('hidden');
  }

  // ---------------------------------------------------------------------------------------------
  // Commandes
  // ---------------------------------------------------------------------------------------------
  // Deux modes : « mission » (lancée depuis le QG, récompenses à la fin) et « libre » (graine et ordres au choix, sans récompense).
  let mode = 'free', mission = null, rewardsApplied = false;
  function setMode(m, mis) {
    mode = m; mission = mis || null; rewardsApplied = false;
    const free = m === 'free';
    // en mission, l'ordre d'Alpha reste modifiable en direct ; celui de Bravo et les réglages de graine/carte sont réservés à la bataille libre
    for (const id of ['order1', 'seed', 'mapSel', 'condSel', 'newBattle', 'replay', 'resReplay', 'resNew']) $('#' + id).hidden = !free;
    document.querySelectorAll('header .group').forEach(g => { if (g.querySelector('#order1, #seed, #mapSel')) g.hidden = !free; });
    $('#missionLabel').hidden = free; if (!free) $('#missionLabel').textContent = `Mission : ${mis.name}${mis.conditions && mis.conditions !== 'jour' ? ' · ' + DATA.CONDITIONS[mis.conditions].name : ''}`;
    $('#toHq').textContent = free ? 'QG' : 'Abandonner';
    $('#resHq').querySelector('b').textContent = free ? 'Quartier général' : 'Continuer'; $('#app').classList.toggle('mode-mission', !free);
  }
  function updatePlayButton() { $('#play').textContent = paused ? '▶ Lancer' : '❚❚ Pause'; $('#play').classList.toggle('on', !paused); }
  function optsFromForm() {
    const teams = Battle.defaultTeams();
    teams[0].order = $('#order0').value; teams[1].order = $('#order1').value;
    teams[1].autoTactics = true;   // l'adversaire de la bataille libre a ses plans (vague 2), comme en mission
    teams[0].tactics = teams[0].tactics.concat(['fixer_deborder']);   // bataille libre : la carte active de la vague 2 à essayer
    const seedTxt = $('#seed').value.trim();
    const seed = seedTxt === '' ? Math.floor(Math.random() * 100000) : (parseInt(seedTxt, 10) || 1);
    return { seed, teams, mapId: $('#mapSel').value, conditions: $('#condSel').value === 'jour' ? undefined : $('#condSel').value };
  }
  // résultat immédiat (comme « passer » dans le jeu d'origine) : même simulation, sans rendu ; puis l'écran de résultat
  function skipToEnd() {
    if (!battle || battle.over || reviewing) return;
    while (!battle.over) battle.step();
    battle.drainEvents(); pendingSounds.length = 0;
    for (const f of fx) scene.remove(f.obj); fx.length = 0;
    for (const u of battle.units) { const m = meshes[u.id]; m.prev = m.cur = { x: u.x, z: u.z, facing: u.facing }; m.yaw = undefined; m.label.classList.toggle('down', !u.alive); }
    instantResult = true; stepSim(); instantResult = false; acc = DT; render();
  }
  $('#skip').addEventListener('click', skipToEnd);
  $('#play').addEventListener('click', () => { if (battle.over) return; if (briefing) { hideBriefing(true); return; } paused = !paused; updatePlayButton(); ambience(true); });
  // ordres en cours de bataille : appliqués immédiatement à la simulation (Alpha toujours ; Bravo en bataille libre)
  $('#order0').addEventListener('change', (e) => { if (battle && !battle.over && battle.t > 0 && !reviewing) { battle.command('order', 0, e.target.value); pumpLog(); buildRosters(); } });
  $('#order1').addEventListener('change', (e) => { if (battle && !battle.over && battle.t > 0 && mode === 'free' && !reviewing) { battle.command('order', 1, e.target.value); pumpLog(); buildRosters(); } });
  // Revoir la bataille : même graine, mêmes équipes, mêmes commandes au même instant → exactement la même bataille (caméra libre)
  let reviewing = false;
  function review() {
    const o = Object.assign({}, battle.opts, { replayInputs: battle.inputs.slice() });
    reviewing = true; newBattle(o); $('#app').classList.add('reviewing'); paused = false; updatePlayButton();
  }
  $('#resReview').addEventListener('click', review);
  document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => { speed = parseFloat(b.dataset.speed); document.querySelectorAll('[data-speed]').forEach(k => k.classList.toggle('on', k === b)); }));
  $('#newBattle').addEventListener('click', () => { newBattle(optsFromForm()); paused = false; updatePlayButton(); });
  $('#replay').addEventListener('click', () => { const o = optsFromForm(); o.seed = battle.seed; newBattle(o); paused = false; updatePlayButton(); });
  $('#resNew').addEventListener('click', () => { $('#seed').value = ''; newBattle(optsFromForm()); paused = false; updatePlayButton(); });
  $('#resReplay').addEventListener('click', () => { const o = optsFromForm(); o.seed = battle.seed; newBattle(o); paused = false; updatePlayButton(); });
  $('#resClose').addEventListener('click', () => { $('#result').classList.add('hidden'); finale = null; cam.init = false; });
  function goHq() {
    paused = true; updatePlayButton(); $('#result').classList.add('hidden'); ambience(false);
    if (mode === 'mission' && battle.over && !rewardsApplied) { rewardsApplied = true; window.HQ.finishMission(mission, battle.result); }
    window.HQ.show();
  }
  $('#toHq').addEventListener('click', goHq);
  $('#resHq').addEventListener('click', goHq);
  $('#freeBattle').addEventListener('click', () => { setMode('free'); window.HQ.hide(); newBattle(optsFromForm()); ambience(true); });
  document.body.appendChild($('#help'));   // l'aide s'ouvre aussi depuis le QG (la bataille est alors masquée)
  $('#hqHelp').addEventListener('click', () => { $('#help').classList.toggle('hidden'); });
  // Briefing (missions de campagne, comme dans le jeu d'origine) : survol de la carte, fiche de mission, puis « Commencer »
  let briefing = null;
  function showBriefing(mis, opts) {
    const D = DATA, cond = mis.conditions && mis.conditions !== 'jour' ? D.CONDITIONS[mis.conditions].name : 'Jour';
    $('#brObj').textContent = OT.Game.objectiveLabel(mis).toUpperCase(); $('#brMap').textContent = OT.MAPS[mis.mapId].name;
    $('#brName').textContent = mis.name; $('#brDesc').textContent = mis.desc || '';
    $('#brIntel').innerHTML = `<div><span>Conditions</span><b>${cond}</b></div><div><span>Adversaire</span><b>${opts.teams[1].name} · ${opts.teams[1].operators.length} opérateurs · niveau ${mis.level}</b></div><div><span>Comportement</span><b>${D.ORDERS[mis.order].name}</b></div><div><span>Récompense</span><b>${mis.reward} cr. · ${mis.xp} XP</b></div>`;
    // soldat (le chef de l'escouade), nom d'équipe, lieu, texte qui se tape lettre à lettre comme dans le jeu d'origine
    const lead = battle.teams[0].units[0]; let fac = DATA.UNIFORMS.find(x => x.id === battle.teams[0].uniform) || DATA.FACTIONS.allied;
    $('#brFig').src = (lead && OT.Portrait && OT.Portrait.render({ id: lead.def.id, modele: lead.def.faction ? 'soldat' : 'gign', weapon: lead.weapon.id, uniform: fac.uniform, vest: fac.vest, headgear: lead.def.headgear || 'casque', full: true, w: 420, h: 640, aiming: true })) || '';
    $('#brTeam').textContent = battle.teams[0].name; $('#brSub').textContent = OT.MAPS[mis.mapId].name; $('#brLoc').textContent = `${String(mis.conditions === 'nuit' ? (22 + Math.floor(Math.random() * 6)) % 24 : 8 + Math.floor(Math.random() * 10)).padStart(2, '0')} h 00 — ${OT.MAPS[mis.mapId].name}`;   // heure cohérente avec les conditions (nuit : 22 h – 3 h)
    const full = mis.desc || ''; $('#brDesc').textContent = MANUAL ? full : ''; let ci = 0; clearInterval(showBriefing.tw);
    if (!MANUAL) showBriefing.tw = setInterval(() => { ci += 2; $('#brDesc').textContent = full.slice(0, ci) + (ci < full.length ? ' |' : ''); if (ci >= full.length) clearInterval(showBriefing.tw); }, 30);
    briefing = { t0: performance.now() / 1000, a0: Math.random() * 6.28 }; $('#briefing').classList.remove('hidden');
  }
  function hideBriefing(start) { if (!briefing) return; briefing = null; $('#briefing').classList.add('hidden'); cam.init = false; if (start) { paused = false; updatePlayButton(); } }
  $('#briefGo').addEventListener('click', () => hideBriefing(true));
  // Préparation (écran VS) : la bataille est construite tout de suite (en pause) et une vue d'ensemble du terrain sert d'aperçu.
  let prepared = null;
  window.HQ.onPrepare = (opts, mis) => {
    setMode('mission', mis); $('#order0').value = opts.teams[0].order; newBattle(opts); paused = true; updatePlayButton(); prepared = opts;
    try {
      const W = 1018, H = 336, m = battle.map, size = renderer.getSize(new THREE.Vector2()), asp = camera.aspect;
      renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix();
      const cx = m.width / 2, cz = m.depth / 2, r = Math.max(m.width, m.depth);
      camera.position.set(cx - r * 0.34, r * 0.2, cz + r * 0.46); camera.lookAt(cx + r * 0.04, 0, cz - r * 0.08);
      syncMeshes(1); if (RENDU) RENDU.render(); else renderer.render(scene, camera); const url = renderer.domElement.toDataURL('image/jpeg', 0.85);
      renderer.setSize(size.x || 1, size.y || 1, false); camera.aspect = asp; camera.updateProjectionMatrix(); cam.init = false;
      return url;
    } catch (e) { return null; }
  };
  window.HQ.onStart = (opts, mis, skip) => {
    if (prepared !== opts) window.HQ.onPrepare(opts, mis);
    prepared = null; window.HQ.hide(); ambience(true);
    if (skip) { paused = false; updatePlayButton(); setTimeout(skipToEnd, 260); return; }
    if (mis.campaign && !MANUAL) { paused = true; updatePlayButton(); showBriefing(mis, opts); } else { paused = false; updatePlayButton(); }
  };
  window.HQ.onLaunch = (opts, mis) => { window.HQ.onPrepare(opts, mis); window.HQ.onStart(opts, mis); };
  $('#toggleHelp').addEventListener('click', () => $('#help').classList.toggle('hidden'));
  $('#moreBtn').addEventListener('click', (e) => { e.stopPropagation(); $('#app .controls').classList.toggle('open'); });
  document.addEventListener('pointerdown', (e) => { const c = $('#app .controls'); if (c && c.classList.contains('open') && !c.contains(e.target)) c.classList.remove('open'); });
  $('#toggleJournal').addEventListener('click', () => { $('#app .controls').classList.remove('open'); $('#journalWrap').classList.toggle('hidden'); $('#journal').scrollTop = $('#journal').scrollHeight; });
  $('#closeJournal').addEventListener('click', () => $('#journalWrap').classList.add('hidden'));
  document.querySelectorAll('[data-cam]').forEach(b => b.addEventListener('click', () => { setCamMode(b.dataset.cam); if (b.dataset.cam !== 'follow') cam.follow = null; }));
  // raccourcis clavier en bataille (positions physiques des touches : valables en AZERTY comme en QWERTY)
  // Espace : lancer / pause · 1, 2, 3 : vitesse ×1, ×2, ×4 · A, Z, E : tactiques actives 1 à 3 · R, F, V : rotation nord / milieu / sud · C : caméra suivante · J : journal
  const CAMS = ['director', 'follow', 'sat', 'free'];
  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input,select,textarea') || $('#app').classList.contains('hidden') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Space') { e.preventDefault(); $('#play').click(); return; }
    const sp = { Digit1: '1', Digit2: '2', Digit3: '4', Numpad1: '1', Numpad2: '2', Numpad3: '4' }[e.code];
    if (sp) { const b = document.querySelector(`[data-speed="${sp}"]`); if (b) b.click(); return; }
    const ti = { KeyQ: 0, KeyW: 1, KeyE: 2 }[e.code];
    if (ti !== undefined) { const cards = [...document.querySelectorAll('#tactics0 .tcard')].filter(c => !c.classList.contains('passive') && !c.classList.contains('rotcard')); if (cards[ti]) cards[ti].click(); return; }
    const rl = SHOW_ROTATION ? { KeyR: -1, KeyF: 0, KeyV: 1 }[e.code] : undefined;
    if (rl !== undefined) { const bt = document.querySelector(`#tactics0 .rotcard button[data-lane="${rl}"]`); if (bt) bt.click(); return; }
    if (e.code === 'KeyC') { const i = CAMS.indexOf(cam.mode); const b = document.querySelector(`[data-cam="${CAMS[(i + 1) % CAMS.length]}"]`); if (b) b.click(); return; }
    if (e.code === 'KeyJ') { $('#toggleJournal').click(); }
  });

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) { renderer.setSize(w, h, false); if (RENDU) RENDU.setSize(w, h); }
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  // secousse de caméra (explosions) : décalage aléatoire qui s'amortit
  function applyShake() { if (!cam.shake || cam.shake < 0.01) return; const k = cam.shake * 0.25; camera.position.x += (Math.random() - 0.5) * k; camera.position.y += (Math.random() - 0.5) * k; camera.position.z += (Math.random() - 0.5) * k; cam.shake *= 0.86; }
  function render() { resize(); applyCamera(); applyShake(); const now = simTime + Math.min(1, acc / DT) * DT; frameDt = Math.max(0, Math.min(0.1, now - lastAnimTime)); lastAnimTime = now; syncMeshes(Math.min(1, acc / DT)); updateFx(); updateRain(paused || MANUAL ? 0 : frameDt * 1.5 + 0.004); updateSteam(MANUAL ? 0.2 : frameDt + 0.003); if (battle.zone) updateZone(); updateHolos(); updateOrderMarks(); updateSelRings(); ordOrientFrame(); if (OT.Parking) OT.Parking.tick(performance.now() / 1000); if (RENDU) RENDU.render(); else renderer.render(scene, camera); updateLabels(); updateRosters(); }

  // musique dynamique : plus présente quand les échanges de tirs s'intensifient, en retrait pendant la progression
  let lastMusicAdj = 0, musicLevel = 0.7;
  function musicIntensity(now) {
    if (now - lastMusicAdj < 800 || !window.Son || muted || paused || battle.over || $('#app').classList.contains('hidden')) return;
    lastMusicAdj = now;
    const firing = battle.units.filter(u => u.alive && battle.t - u.lastShotAt < 2).length;
    const target = 0.45 + Math.min(1, firing / 5) * 0.45;
    if (Math.abs(target - musicLevel) > 0.04) { musicLevel = target; Son.volumeBoucle('musique', musicLevel * musicVol, 1.2); }
  }
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - lastFrame) / 1000 || 0); lastFrame = now;
    if (!paused && !battle.over) {
      acc += dt * speed;
      let n = 0;
      while (acc >= DT && n < 40) { stepSim(); acc -= DT; n++; }
      if (battle.over) acc = 0;
    }
    musicIntensity(now);
    if (battle.over && finale) postEnd += dt * 0.4;   // ralenti du plan final
    render();
  }

  // ---------------------------------------------------------------------------------------------
  // Démarrage
  // ---------------------------------------------------------------------------------------------
  $('#seed').value = params.get('seed') || '';
  setMuted(muted);
  if (!MANUAL) { speed = SETTINGS.speed; document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', parseFloat(b.dataset.speed) === speed)); if (SETTINGS.quality !== 'haute' || !SETTINGS.shadows) applyQuality(); }
  setMode('free');
  newBattle(optsFromForm());
  if (!MANUAL && params.get('mode') !== 'free') { if (params.get('skipTitle') === '1') window.HQ.show(); else { $('#hq').classList.add('hidden'); $('#app').classList.add('hidden'); } } else window.HQ.hide();
  // API de test (identique dans les deux modes ; en mode manuel il n'y a pas de boucle d'animation)
  window.API = {
    stats: () => { render(); const i = renderer.info.render; let meshes = 0, mats = new Set(), geos = new Set(); scene.traverse(o => { if (o.isMesh) { meshes++; mats.add(o.material); geos.add(o.geometry); } }); return { calls: i.calls, triangles: i.triangles, meshes, materials: mats.size, geometries: geos.size, shadows: renderer.shadowMap.enabled }; },
    step: (n, dt) => { for (let i = 0; i < (n || 1); i++) stepSim(); acc = DT; render(); return battle.t; },
    // un pas de simulation rendu en k images intermédiaires (comme en temps réel : interpolation entre deux pas)
    stepFine: (k) => { stepSim(); for (let i = 1; i <= (k || 3); i++) { acc = DT * i / (k || 3); render(); } return battle.t; },
    skip: () => { skipToEnd(); return battle.result; },
    camShot: (kind, id) => { if (kind === 'shoulder' || kind === 'dolly') { setCamMode('director'); cam.shot = { kind, id, side: 1, until: simTime + 999 }; cam.cutAt = simTime; } else { setCamMode('follow'); cam.follow = id; } render(); for (let i = 0; i < 60; i++) applyCamera(); render(); return [camera.position.x, camera.position.y, camera.position.z].map(v => +v.toFixed(2)); },
    stepRaw: (n) => { for (let i = 0; i < (n || 1); i++) stepSim(); acc = DT; return battle.t; },   // sans rendu (outils de capture)
    camPos: () => ({ pos: [camera.position.x, camera.position.y, camera.position.z].map(v => +v.toFixed(2)), fov: camera.fov, mode: cam.mode, shot: cam.shot && cam.shot.kind, paused, briefing: !!briefing, finale: !!finale }),   // diagnostic
    dirTrace: (n, probe) => directorTrace(n || 600, probe), camera3: () => camera, rim: () => RIM,   // (mesures : projection des soldats à l'écran)
    dirWatch: (on) => { if (on === false) { const r = DIRECTOR.mon ? dirReport(DIRECTOR.mon) : null; DIRECTOR.mon = null; return r; } DIRECTOR.mon = { shots: [], badKinds: {} }; return true; },   // relevé en temps réel : API.dirWatch() puis API.dirWatch(false)
    occGrid: () => (occEnsure(), OCC),
    occ: (x, y, z) => { occEnsure(); const p = V3(x, y, z); return { bad: occBad(p), ms: OCC.ms, n: OCC.g ? OCC.g.reduce((a, v) => a + (v ? 1 : 0), 0) : 0, fadeTop: OCC.fadeTop }; },   // mesure du réalisateur (coupes, durée des plans, caméra masquée, à-coups)
    runToEnd: () => { instantResult = true; while (!battle.over) stepSim(); instantResult = false; acc = DT; render(); return battle.result; },
    start: (opts) => { newBattle(opts); render(); return battle.zone || true; },
    banner: () => { $('#result').classList.add('hidden'); showBanner(() => showResult()); },
    battle: () => battle, render,
    camera: (yaw, pitch, dist, tx, tz) => { cam.yaw = yaw; cam.pitch = pitch; cam.dist = dist; if (tx !== undefined) cam.target.set(tx, 0, tz); render(); },
    focus: (cs, yaw, pitch, dist) => { const u = battle.units.find(x => x.callsign === cs); setCamMode('free'); cam.follow = null; cam.init = false; cam.target.set(u.x, 0.9, u.z); cam.yaw = yaw; cam.pitch = pitch; cam.dist = dist; for (let i = 0; i < 30; i++) applyCamera(); render(); return [u.x, u.z, u.facing, u.stance, u.state]; },
    pause: (p) => { paused = p !== false; updatePlayButton(); },
    settle: () => { for (let i = 0; i < 80; i++) applyCamera(); render(); },
    useTactic: (id) => battle.command('tactic', 0, id),
    review: () => { review(); return battle.replayQueue.length; },
    meshes: () => meshes, scene: () => scene,
    // ennemis non repérés : ce que voit l'escouade (simulation) et ce qui est dessiné (modèles, étiquettes, repères « ? »)
    fogForce: (v) => { FOG.force = v; },   // (outils : true / false impose, undefined rend la main au réglage)
    fog: () => { const E = battle.teams[1].units, vis = (u) => !!(meshes[u.id] && meshes[u.id].group.visible); return { on: fogOn(), spotted: [...FOG.spotted], alive: E.filter(u => u.alive).map(u => u.id), drawn: E.filter(u => u.alive && vis(u)).map(u => u.id), fading: E.filter(u => meshes[u.id] && meshes[u.id].fogA > 0 && meshes[u.id].fogA < 1).map(u => u.id), labels: E.filter(u => u.alive && meshes[u.id] && meshes[u.id].label.style.display !== 'none').map(u => u.id), deadDrawn: E.filter(u => !u.alive && vis(u)).map(u => u.id), deadSeen: Object.assign({}, FOG.deadSeen), ghosts: Object.keys(FOG.ghosts).filter(id => FOG.ghosts[id].visible) }; },
    efx: () => EFX, rendu: () => RENDU,
    look: (x, z, yaw, pitch, dist, y) => { setCamMode('free'); cam.follow = null; cam.init = false; cam.target.set(x, y === undefined ? 0.9 : y, z); cam.yaw = yaw; cam.pitch = pitch; cam.dist = dist; for (let i = 0; i < 30; i++) applyCamera(); render(); return 0; },
    spinWatch: (on) => { SPIN.on = on !== false; SPIN.events = []; SPIN.hist = {}; }, spins: () => SPIN.events,
    setSpeed: (k) => { speed = k; }, play: () => { paused = false; updatePlayButton(); },
    // diagnostic d'animation : pour chaque soldat, vitesse réelle, direction du déplacement par rapport au corps affiché,
    // animation jouée et sa vitesse de lecture (pour mesurer glissements et incohérences d'orientation)
    diag: () => battle.units.map(u => { const m = meshes[u.id]; if (!m || !m.isSkinned) return null;
      const dx = m.cur.x - m.prev.x, dz = m.cur.z - m.prev.z, v = Math.hypot(dx, dz) / DT, moveYaw = v > 0.05 ? -Math.atan2(dz, dx) + Math.PI / 2 : null;
      let d = moveYaw === null ? null : moveYaw - m.yaw; if (d !== null) { while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; }
      const act = m.clip && m.mixer.existingAction(m.clips[m.clip]);
      return { id: u.callsign, alive: u.alive, state: u.state, stance: u.stance, moving: u.moving, target: !!(u.target && u.target.alive), v: +v.toFixed(2), ecart: d === null ? null : +(d * 180 / Math.PI).toFixed(0), clip: m.clip, ts: act ? +act.timeScale.toFixed(2) : null, jambes: m.jambes === undefined ? null : +(m.jambes * 180 / Math.PI).toFixed(0), x: +u.x.toFixed(1), z: +u.z.toFixed(1), reload: u.reloading > 0, throwing: !!u.throwing }; }),
  };
  if (MANUAL) render(); else requestAnimationFrame((t) => { lastFrame = t; frame(t); });
  window.PRET = true;
})();
