// Ruelle de service (côté nord du parking) : l'arrière d'une rangée d'immeubles en briques comme dans une petite ville
// américaine. Ce fichier ne fait qu'habiller : la simulation garde ses boîtes (sim/map.js), parking.js appelle
//  - OT.Ruelle.mesh(o)  : pièce de la simulation habillée (null : parking.js / app.js la dessinent) —
//      'mur nord' (les façades arrière des immeubles), 'annexe', 'local poubelles', 'clôture grillagée', 'clim', 'caisses',
//      'guérite' (modèles Meshy si chargés) ;
//  - OT.Ruelle.build(map, group, ctx) : décor sans effet sur le jeu (portail ouvert, poteaux électriques et câbles,
//      sacs-poubelle, cartons, taches d'huile, avaloir) ;
//  - OT.Ruelle.setConditions(id) : lampes de façade allumées la nuit.
// Façades : briques dessinées au chargement (couleur + relief), fenêtres, portes de service sous auvent, rideaux
// métalliques, escaliers de secours, climatiseurs, descentes d'eau pluviale, compteurs, lampes grillagées, tags.
// Les objets de façade restent plaqués au mur (escaliers de secours au-dessus de 2,3 m) : rien ne dépasse dans la ruelle.
(function (root) {
  const T = window.THREE;
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const CACHE = {}, MATS = {};
  const mat = (k, f) => MATS[k] || (MATS[k] = f());
  const M3 = () => (root.Modeles3D && root.Modeles3D.ready ? root.Modeles3D : null);
  const hasM = (n) => { const m = M3(); return !!(m && m.has(n)); };
  function canvas(N, H) { const c = document.createElement('canvas'); c.width = N; c.height = H || N; return c; }
  function tex(c, srgb, repeat) {
    const t = new T.CanvasTexture(c); t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace; t.anisotropy = 8;
    t.wrapS = t.wrapT = repeat ? T.RepeatWrapping : T.ClampToEdgeWrapping; return t;
  }
  // carte de relief (normales) à partir d'une carte de hauteurs (canal rouge)
  function normalTex(hc, k) {
    const N = hc.width, H = hc.height, src = hc.getContext('2d').getImageData(0, 0, N, H).data, out = canvas(N, H), og = out.getContext('2d'), id = og.createImageData(N, H), d = id.data;
    const h = (x, y) => src[(((y + H) % H) * N + ((x + N) % N)) * 4] / 255;
    for (let y = 0; y < H; y++) for (let x = 0; x < N; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * k, dy = (h(x, y + 1) - h(x, y - 1)) * k, l = Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
      d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    og.putImageData(id, 0, 0); return tex(out, false, true);
  }
  // ---------------------------------------------------------------------------------------------
  // Briques : appareil en panneresse (joints décalés d'une demi-brique), 16 briques × 50 rangs pour 3,76 × 3,75 m
  // ---------------------------------------------------------------------------------------------
  const TILE = 3.76;
  const TONS = {
    rouge: { b: [132, 58, 42], v: 26, m: [150, 140, 128], sombre: 0.12 },
    brun: { b: [104, 62, 48], v: 20, m: [128, 120, 110], sombre: 0.18 },
    jaune: { b: [168, 132, 92], v: 18, m: [160, 150, 136], sombre: 0.06 },
    peint: { b: [176, 170, 156], v: 6, m: [168, 162, 150], sombre: 0.0, peint: true },
    parpaing: { b: [150, 148, 142], v: 10, m: [128, 126, 120], sombre: 0.04, cols: 8, rows: 20 },   // blocs de béton 0,47 × 0,19 m
  };
  function brick(tone) {
    const key = 'brique' + tone; if (CACHE[key]) return CACHE[key];
    const P = TONS[tone], R = rng(tone.length * 977 + 13), N = 1024, cols = P.cols || 16, rows = P.rows || 50, bw = N / cols, bh = N / rows;
    const c = canvas(N), g = c.getContext('2d'), hc = canvas(N), hg = hc.getContext('2d');
    g.fillStyle = `rgb(${P.m.join(',')})`; g.fillRect(0, 0, N, N); hg.fillStyle = '#202020'; hg.fillRect(0, 0, N, N);
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * bw / 2, y = r * bh;
      for (let k = -1; k <= cols; k++) {
        const x = k * bw + off, j = (R() - 0.5) * P.v, dark = R() < P.sombre ? 0.62 + R() * 0.2 : 1, warm = (R() - 0.5) * 10;
        const col = [P.b[0] * dark + j + warm, P.b[1] * dark + j * 0.8, P.b[2] * dark + j * 0.7].map(v => Math.max(0, Math.min(255, v | 0)));
        g.fillStyle = `rgb(${col.join(',')})`; g.fillRect(x + 2, y + 2, bw - 4, bh - 3.5);
        const hv = 190 + R() * 50; hg.fillStyle = `rgb(${hv | 0},${hv | 0},${hv | 0})`; hg.fillRect(x + 2.5, y + 2.5, bw - 5, bh - 4.5);
        if (R() < 0.18) { g.fillStyle = 'rgba(30,20,15,0.25)'; g.fillRect(x + 2 + R() * bw * 0.6, y + 2, bw * 0.3, bh - 3.5); }   // brûlure
        if (R() < 0.06) { hg.fillStyle = '#5a5a5a'; g.fillStyle = `rgba(${P.m.join(',')},0.8)`; const ex = x + R() * bw * 0.7, ew = 6 + R() * 12; hg.fillRect(ex, y + 2, ew, bh - 4); g.fillRect(ex, y + 2, ew, bh - 4); }   // éclat
      }
    }
    // grain : piqûres et poussière (couleur et relief)
    const id = g.getImageData(0, 0, N, N), d = id.data, hid = hg.getImageData(0, 0, N, N), hd = hid.data;
    for (let i = 0; i < d.length; i += 4) { const n = (R() - 0.5) * (P.peint ? 10 : 26); d[i] += n; d[i + 1] += n; d[i + 2] += n; if (R() < 0.02) { hd[i] = hd[i + 1] = hd[i + 2] = Math.max(0, hd[i] - 70); d[i] *= 0.8; d[i + 1] *= 0.8; d[i + 2] *= 0.8; } }
    g.putImageData(id, 0, 0); hg.putImageData(hid, 0, 0);
    // peinture qui s'écaille par plaques (brique peinte)
    if (P.peint) for (let k = 0; k < 5; k++) {   // quelques plaques où la peinture est partie : briques nues par petits éclats groupés
      const cx = R() * N, cy = R() * N, rad = 30 + R() * 70;
      for (let i = 0; i < 160; i++) { const a = R() * 6.283, r = rad * Math.sqrt(R()); g.fillStyle = `rgba(${118 + R() * 30 | 0},${70 + R() * 20 | 0},${56 + R() * 15 | 0},${0.35 + R() * 0.4})`; g.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.6, 2 + R() * 7, 1 + R() * 4); }
    }
    return (CACHE[key] = { map: tex(c, true, true), normalMap: normalTex(hc, 3.2) });
  }
  function brickMat(tone) { return mat('brique' + tone, () => { const B = brick(tone); return new T.MeshStandardMaterial({ map: B.map, normalMap: B.normalMap, normalScale: new T.Vector2(0.9, 0.9), roughness: 0.9, color: 0xe6e6e6 }); }); }
  // boîte dont les coordonnées de texture suivent le mètre (taille de tuile `tile`) sur chaque face
  function boxW(w, h, d, tile) {
    const g = new T.BoxGeometry(w, h, d), uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile); }
    return g;
  }
  // ---------------------------------------------------------------------------------------------
  // Autres matériaux (partagés : le jeu fusionne les maillages immobiles par matériau)
  // ---------------------------------------------------------------------------------------------
  const K = () => ({
    beton: mat('rbeton', () => new T.MeshStandardMaterial({ color: 0x8f8b84, roughness: 0.92 })),
    chaperon: mat('rchap', () => new T.MeshStandardMaterial({ color: 0x9d998f, roughness: 0.85 })),
    toit: mat('rtoit', () => new T.MeshStandardMaterial({ color: 0x3b3a38, roughness: 0.95 })),
    acier: mat('racier', () => new T.MeshStandardMaterial({ color: 0x5d6266, roughness: 0.5, metalness: 0.75 })),
    acierNoir: mat('racierN', () => new T.MeshStandardMaterial({ color: 0x1f2022, roughness: 0.6, metalness: 0.6 })),
    porte: mat('rporte', () => new T.MeshStandardMaterial({ color: 0x6b7072, roughness: 0.55, metalness: 0.55 })),
    portePeinte: mat('rporteV', () => new T.MeshStandardMaterial({ color: 0x3f5a4a, roughness: 0.6, metalness: 0.4 })),
    galva: mat('rgalva', () => new T.MeshStandardMaterial({ color: 0x8d9296, roughness: 0.45, metalness: 0.8 })),
    verre: mat('rverre', () => new T.MeshStandardMaterial({ color: 0x1a232a, roughness: 0.08, metalness: 0.85, envMapIntensity: 1.2 })),
    contreplaque: mat('rcp', () => new T.MeshStandardMaterial({ color: 0x8a7354, roughness: 0.9 })),
    clim: mat('rclim', () => new T.MeshStandardMaterial({ color: 0xbdbab2, roughness: 0.55, metalness: 0.35 })),
    grille: mat('rgrille', () => new T.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.7, metalness: 0.5 })),
    pvc: mat('rpvc', () => new T.MeshStandardMaterial({ color: 0x9a9a94, roughness: 0.6 })),
    cuivre: mat('rcuivre', () => new T.MeshStandardMaterial({ color: 0x7a4b2e, roughness: 0.5, metalness: 0.7 })),
    bois: mat('rbois', () => new T.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.9 })),
    sac: mat('rsac', () => new T.MeshStandardMaterial({ color: 0x141516, roughness: 0.35, metalness: 0.1 })),
    carton: mat('rcarton', () => new T.MeshStandardMaterial({ color: 0x8b6d48, roughness: 0.95 })),
    poubelle: mat('rpoub', () => new T.MeshStandardMaterial({ color: 0x2f4a33, roughness: 0.6 })),
    lampe: mat('rlampe', () => new T.MeshStandardMaterial({ color: 0xf2e6c8, emissive: 0xffd08a, emissiveIntensity: 0, roughness: 0.3 })),
  });
  const LAMPES = [];   // matériaux lumineux (nuit)
  const NUITS = [];    // lumières allumées la nuit seulement
  // rideau métallique : lames horizontales galvanisées, usure, bas plus sale
  function shutterMat() {
    return mat('rrideau', () => {
      const c = canvas(256, 512), g = c.getContext('2d'), R = rng(5);
      for (let y = 0; y < 512; y += 8) { const v = 150 + R() * 18; g.fillStyle = `rgb(${v | 0},${(v + 4) | 0},${(v + 8) | 0})`; g.fillRect(0, y, 256, 8); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y + 6, 256, 2); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, y, 256, 1); }
      const gr = g.createLinearGradient(0, 380, 0, 512); gr.addColorStop(0, 'rgba(40,30,20,0)'); gr.addColorStop(1, 'rgba(40,30,20,0.55)'); g.fillStyle = gr; g.fillRect(0, 380, 256, 132);
      for (let k = 0; k < 30; k++) { g.fillStyle = `rgba(110,60,30,${0.15 + R() * 0.25})`; g.fillRect(R() * 256, R() * 512, 2 + R() * 4, 10 + R() * 40); }
      return new T.MeshStandardMaterial({ map: tex(c, true, false), roughness: 0.5, metalness: 0.6 });
    });
  }
  // grillage simple torsion (losanges de 5 cm) : texture transparente, on voit à travers
  function chainMat() {
    return mat('rgrillage', () => {
      const c = canvas(128), g = c.getContext('2d'); g.strokeStyle = 'rgba(190,195,198,1)'; g.lineWidth = 5;
      g.beginPath(); g.moveTo(0, 64); g.lineTo(64, 0); g.lineTo(128, 64); g.lineTo(64, 128); g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(-64, 64); g.lineTo(0, 0); g.moveTo(128, 0); g.lineTo(192, 64); g.stroke();
      const t = tex(c, true, true);
      return new T.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.02, side: T.DoubleSide, roughness: 0.45, metalness: 0.7, depthWrite: false, color: 0xd0d4d6 });
    });
  }
  // salissures de façade (calque transparent) : pied de mur humide, coulures sous les appuis et le chaperon
  function grimeTex(seed, w, h, wins) {
    const R = rng(seed), W = 512, H = 256, c = canvas(W, H), g = c.getContext('2d'), sx = W / w, sy = H / h;
    const base = g.createLinearGradient(0, H, 0, H - 1.1 * sy); base.addColorStop(0, 'rgba(25,22,18,0.55)'); base.addColorStop(1, 'rgba(25,22,18,0)'); g.fillStyle = base; g.fillRect(0, H - 1.1 * sy, W, 1.1 * sy);
    for (let x = 0; x < W; x += 3) { const hh = (0.3 + R() * 0.6) * sy; g.fillStyle = 'rgba(20,18,14,0.12)'; g.fillRect(x, H - hh, 3, hh); }
    const top = g.createLinearGradient(0, 0, 0, 1.2 * sy); top.addColorStop(0, 'rgba(20,18,16,0.45)'); top.addColorStop(1, 'rgba(20,18,16,0)'); g.fillStyle = top; g.fillRect(0, 0, W, 1.2 * sy);
    for (let k = 0; k < w * 1.5; k++) { const x = R() * W, L = (0.5 + R() * 2.5) * sy; g.fillStyle = `rgba(22,20,16,${0.08 + R() * 0.14})`; g.fillRect(x, 0, 1 + R() * 3, L); }
    for (const [wx, wy] of wins) { const x = wx * sx, y = H - wy * sy; for (let k = 0; k < 5; k++) { g.fillStyle = `rgba(30,26,22,${0.1 + R() * 0.15})`; g.fillRect(x + (R() - 0.5) * 0.9 * sx, y, 1 + R() * 3, (0.4 + R() * 1.4) * sy); } }
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t;
  }
  // tags inventés (lettres « bulles », coulures) ; pas de vrai mot ni de marque
  const MOTS = ['VEKO', 'RUZE', 'ONYX', 'KAPI', 'DRAZ', 'MUKO', 'SEVN', 'TROK', 'ZILA', 'PREK'];
  function tagTex(seed) {
    const key = 'tag' + seed; if (CACHE[key]) return CACHE[key];
    const R = rng(seed * 31 + 7), W = 512, H = 192, c = canvas(W, H), g = c.getContext('2d');
    const pal = [['#d84a6a', '#f2c03a'], ['#3aa3e0', '#6a3fd8'], ['#e8e8e8', '#7a7a7a'], ['#46c47a', '#1b6e7c'], ['#f07a2a', '#f5df5a']][Math.floor(R() * 5)];
    const word = MOTS[Math.floor(R() * MOTS.length)], fs = 100 + R() * 30;
    g.save(); g.translate(W / 2, H / 2 + 10); g.rotate((R() - 0.5) * 0.2); g.font = `900 ${fs}px "Arial Black", Impact, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.strokeStyle = '#121212'; g.lineWidth = 16; g.strokeText(word, 0, 0); g.strokeStyle = pal[1]; g.lineWidth = 6; g.strokeText(word, 0, 0);
    const gr = g.createLinearGradient(0, -fs / 2, 0, fs / 2); gr.addColorStop(0, pal[0]); gr.addColorStop(1, pal[1]); g.fillStyle = gr; g.fillText(word, 0, 0); g.restore();
    for (let k = 0; k < 10; k++) { g.fillStyle = R() < 0.5 ? pal[0] : pal[1]; g.globalAlpha = 0.75; const x = W * 0.2 + R() * W * 0.6, y = H * 0.55 + R() * 30, L = 10 + R() * 40; g.fillRect(x, y, 2 + R() * 2, L); g.globalAlpha = 1; }
    g.globalCompositeOperation = 'destination-out'; for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(0,0,0,${R() * 0.7})`; g.fillRect(R() * W, R() * H, 1 + R() * 3, 1 + R() * 3); } g.globalCompositeOperation = 'source-over';
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return (CACHE[key] = t);
  }
  function decal(g, map, w, h, x, y, z, ry, opacity) {
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.85, opacity: opacity || 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.position.set(x, y, z); m.rotation.y = ry || 0; m.receiveShadow = true; m.renderOrder = 1; g.add(m); return m;
  }
  const add = (g, geo, m, x, y, z) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  const cyl = (r, h, n) => new T.CylinderGeometry(r, r, h, n || 10);
  // modèle Meshy ajusté (posé au sol de son groupe), ou null
  function model(n, w, h, d, opts) {
    const m = M3(); if (!m || !m.has(n)) return null;
    const p = m.fit(n, w, h, d, opts || {}); p.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.userData.keep = true; } });   // (couleur ×0,8 et rugosité ≥ 0,55 déjà appliquées au chargement)
    return p;
  }
  // ---------------------------------------------------------------------------------------------
  // Éléments de façade (repère local : le mur est le plan z = 0, la ruelle du côté +z, le sol à y = y0)
  // ---------------------------------------------------------------------------------------------
  // porte de service en acier sous un petit auvent en tôle, lampe grillagée au-dessus
  function backDoor(g, x, y0, z, R, opts) {
    const k = K(), p = model('porte', 1.75, 3.0, 0.75, { byHeight: true, tol: 0.35 });
    if (p) { p.position.set(x, y0 + 1.5, z + 0.36); if (opts && opts.ry) { p.rotation.y = opts.ry; } g.add(p); return; }
    const ry = (opts && opts.ry) || 0, q = new T.Group(); q.position.set(x, y0, z); q.rotation.y = ry; g.add(q);
    add(q, new T.BoxGeometry(1.2, 2.25, 0.08), k.acier, 0, 1.125, 0.03);
    add(q, new T.BoxGeometry(1.0, 2.1, 0.05), R() < 0.3 ? k.portePeinte : k.porte, 0, 1.06, 0.07);
    add(q, new T.BoxGeometry(0.75, 0.05, 0.05), k.acier, 0, 1.0, 0.12);
    add(q, new T.BoxGeometry(1.3, 0.12, 0.3), k.beton, 0, 0.06, 0.15);
    const aw = add(q, new T.BoxGeometry(1.5, 0.04, 0.85), k.galva, 0, 2.62, 0.42); aw.rotation.x = 0.22;
    for (const s of [-1, 1]) { const b = add(q, new T.BoxGeometry(0.04, 0.04, 0.85), k.acierNoir, s * 0.65, 2.32, 0.38); b.rotation.x = -0.62; }
    const l = add(q, new T.SphereGeometry(0.09, 10, 8), k.lampe, 0, 2.42, 0.1); if (!LAMPES.includes(k.lampe)) LAMPES.push(k.lampe);
  }
  // enseigne de boutique (nom inventé) : caisson lumineux, lettres claires sur fond de couleur
  function signTex(name, sub, bg, fg) {
    const key = 'ens' + name; if (CACHE[key]) return CACHE[key];
    const W = 1024, H = 256, c = canvas(W, H), g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, W, H); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 8; g.strokeRect(14, 14, W - 28, H - 28);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; let fs = 118; do { g.font = `bold ${fs}px Georgia, "Times New Roman", serif`; fs -= 6; } while (g.measureText(name).width > W - 90 && fs > 50); g.fillText(name, W / 2, sub ? 108 : H / 2 + 6);
    if (sub) { let fs2 = 46; do { g.font = `italic ${fs2}px Georgia, serif`; fs2 -= 3; } while (g.measureText(sub).width > W - 90 && fs2 > 24); g.fillText(sub, W / 2, 200); }
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; return (CACHE[key] = t);
  }
  // entrée « clients » à l'arrière d'une boutique (côté parking) : porte vitrée double, vitrine, store en toile à
  // lambrequin, enseigne lumineuse, appliques ; c'est la tache de lumière chaude de la ruelle
  function shopEntrance(g, x, y0, z, shop) {
    const k = K(), q = new T.Group(); q.position.set(x, y0, z); g.add(q);
    const alu = mat('ralu', () => new T.MeshStandardMaterial({ color: 0x3a3c3e, roughness: 0.4, metalness: 0.8 }));
    const vitre = mat('rvitrine', () => {
      const c = canvas(256), g = c.getContext('2d'); g.fillStyle = '#2b2118'; g.fillRect(0, 0, 256, 256);
      const l = g.createRadialGradient(128, 40, 5, 128, 60, 170); l.addColorStop(0, 'rgba(255,214,150,0.95)'); l.addColorStop(1, 'rgba(120,80,40,0)'); g.fillStyle = l; g.fillRect(0, 0, 256, 256);
      g.fillStyle = 'rgba(40,28,18,0.85)'; g.fillRect(0, 150, 256, 106); g.fillStyle = 'rgba(160,120,70,0.6)'; g.fillRect(0, 146, 256, 6);   // comptoir
      for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(${150 + i * 12},${110 + i * 8},70,0.55)`; g.fillRect(14 + i * 40, 80 + (i % 2) * 14, 26, 50); }   // rayonnages
      const t = tex(c, true, false);
      return new T.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.35, roughness: 0.08, metalness: 0.2 });
    });
    vitre.userData.jour = 0.35; vitre.userData.nuit = 1.4; if (!LAMPES.includes(vitre)) LAMPES.push(vitre);
    add(q, new T.BoxGeometry(2.9, 2.5, 0.06), alu, 0, 1.25 + 0.15, 0.03);
    add(q, new T.PlaneGeometry(1.7, 2.2), vitre, -0.45, 1.27, 0.065);                 // portes vitrées
    add(q, new T.PlaneGeometry(0.95, 1.5), vitre, 0.9, 1.6, 0.065);                   // vitrine
    for (const xx of [-1.3, -0.45, 0.4, 1.38]) add(q, new T.BoxGeometry(0.06, 2.4, 0.06), alu, xx, 1.35, 0.08);
    add(q, new T.BoxGeometry(2.9, 0.06, 0.06), alu, 0, 2.38, 0.08);
    for (const xx of [-0.6, -0.3]) add(q, new T.BoxGeometry(0.03, 0.5, 0.05), mat('rpoignee', () => new T.MeshStandardMaterial({ color: 0xb8b8b4, roughness: 0.3, metalness: 0.9 })), xx, 1.15, 0.12);
    add(q, new T.BoxGeometry(3.3, 0.15, 0.9), k.beton, 0, 0.075, 0.45);              // seuil / marche
    add(q, new T.BoxGeometry(1.2, 0.015, 0.7), mat('rtapis', () => new T.MeshStandardMaterial({ color: 0x2b2522, roughness: 1 })), -0.45, 0.16, 0.5);
    // store en toile : pente, joues, lambrequin
    const toile = mat('rtoile' + shop.toile, () => new T.MeshStandardMaterial({ color: shop.toile, roughness: 0.85, side: T.DoubleSide }));
    const aw = new T.Mesh(new T.PlaneGeometry(3.4, 1.35), toile); aw.position.set(0, 2.95, 0.58); aw.rotation.x = -Math.PI / 2 + 0.55; aw.castShadow = aw.receiveShadow = true; q.add(aw);
    add(q, new T.BoxGeometry(3.4, 0.28, 0.02), toile, 0, 2.55, 1.15);
    for (const s of [-1, 1]) { const side = new T.Mesh(new T.ShapeGeometry(new T.Shape([new T.Vector2(0, 0), new T.Vector2(1.15, -0.62), new T.Vector2(1.15, -0.9), new T.Vector2(0, -0.28)])), toile); side.position.set(s * 1.7, 3.25, 0.0); side.rotation.y = -Math.PI / 2; side.castShadow = true; q.add(side); }
    for (const s of [-1, 1]) add(q, cyl(0.015, 1.32, 6), k.acierNoir, s * 1.66, 2.93, 0.575).rotation.x = 2.08;
    // enseigne lumineuse au-dessus du store
    const sm = mat('rens' + shop.nom, () => { const t = signTex(shop.nom, shop.sous, shop.fond, shop.lettres), m = new T.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.15, roughness: 0.4 }); m.userData.jour = 0.15; m.userData.nuit = 1.3; return m; });
    if (!LAMPES.includes(sm)) LAMPES.push(sm);
    add(q, new T.BoxGeometry(3.0, 0.8, 0.14), alu, 0, 3.75, 0.07);
    add(q, new T.PlaneGeometry(2.9, 0.72), sm, 0, 3.75, 0.145);
    for (const s of [-1, 1]) { add(q, new T.BoxGeometry(0.12, 0.2, 0.12), alu, s * 1.85, 2.6, 0.08); add(q, new T.SphereGeometry(0.07, 10, 8), k.lampe, s * 1.85, 2.48, 0.12); }
    if (!LAMPES.includes(k.lampe)) LAMPES.push(k.lampe);
    const L = new T.PointLight(0xffc98a, 3, 7, 2); L.position.set(0, 2.4, 1.6); L.visible = false; q.add(L); NUITS.push(L);   // petite flaque chaude devant la porte (1/d² : ≈ 0,5 au sol, pas de mur brûlé)
  }
  // petites plaques : rue (émail bleu, bord vert, lettres blanches) et interdiction de stationner (blanc, bord rouge)
  function plateTex(kind, l1, l2) {
    const key = 'plaque' + kind + l1; if (CACHE[key]) return CACHE[key];
    const W = 512, H = kind === 'rue' ? 200 : 256, c = canvas(W, H), g = c.getContext('2d'); g.textAlign = 'center'; g.textBaseline = 'middle';
    if (kind === 'rue') {
      g.fillStyle = '#e9e9e2'; g.fillRect(0, 0, W, H); g.fillStyle = '#1f3e8a'; g.fillRect(8, 8, W - 16, H - 16); g.strokeStyle = '#e9e9e2'; g.lineWidth = 5; g.strokeRect(18, 18, W - 36, H - 36);
      g.fillStyle = '#f4f4ee'; g.font = 'bold 40px Arial, sans-serif'; g.fillText(l1, W / 2, 72); g.font = 'bold 62px Arial, sans-serif'; g.fillText(l2, W / 2, 132);
    } else {
      g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, W, H); g.strokeStyle = '#c0262d'; g.lineWidth = 16; g.strokeRect(10, 10, W - 20, H - 20);
      g.fillStyle = '#1a1a1a'; g.font = 'bold 54px Arial, sans-serif'; g.fillText(l1, W / 2, 96); g.font = '36px Arial, sans-serif'; g.fillText(l2, W / 2, 168);
    }
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return (CACHE[key] = t);
  }
  function plate(g, x, y, z, w, h, tex, ry) {
    const q = new T.Group(); q.position.set(x, y, z); q.rotation.y = ry || 0; g.add(q);
    add(q, new T.BoxGeometry(w + 0.02, h + 0.02, 0.015), K().galva, 0, 0, 0.008);
    const m = new T.Mesh(new T.PlaneGeometry(w, h), mat('plaque' + tex.uuid, () => new T.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.1 }))); m.position.z = 0.017; q.add(m);
  }
  // bac à graisse de restaurant (cuve fermée sur roulettes) à côté de la porte de service
  function greaseBin(g, x, y0, z) {
    const k = K(), q = new T.Group(); q.position.set(x, y0, z); g.add(q);
    const m = mat('rgraisse', () => new T.MeshStandardMaterial({ color: 0x4e5a63, roughness: 0.55, metalness: 0.5 }));
    add(q, new T.BoxGeometry(1.2, 0.95, 0.75), m, 0, 0.6, 0.45); add(q, new T.BoxGeometry(1.24, 0.06, 0.8), k.acierNoir, 0, 1.1, 0.45);
    for (const s of [-1, 1]) for (const t of [-1, 1]) { const w = add(q, cyl(0.06, 0.04, 10), k.acierNoir, s * 0.5, 0.07, 0.45 + t * 0.28); w.rotation.z = Math.PI / 2; }
    add(q, new T.BoxGeometry(1.3, 0.01, 0.9), mat('rgraisseSol', () => new T.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.25, transparent: true, opacity: 0.6, depthWrite: false })), 0, 0.006, 0.5);
  }
  // compteurs de gaz : nourrice jaune et deux compteurs sur la façade
  function gasMeters(g, x, y0, z) {
    const k = K(), jaune = mat('rgaz', () => new T.MeshStandardMaterial({ color: 0xc9a21e, roughness: 0.5, metalness: 0.4 }));
    add(g, cyl(0.035, 1.4, 8), jaune, x, y0 + 0.7, z + 0.12); const h = add(g, cyl(0.03, 1.0, 8), jaune, x + 0.5, y0 + 1.4, z + 0.12); h.rotation.z = Math.PI / 2;
    for (const dx of [0.25, 0.75]) add(g, new T.BoxGeometry(0.3, 0.32, 0.2), k.galva, x + dx, y0 + 1.1, z + 0.14);
  }
  // rideau métallique de quai (porte de livraison) avec son coffre et ses coulisses
  function shutter(g, x, y0, z, w, h, ry) {
    const k = K(), q = new T.Group(); q.position.set(x, y0, z); q.rotation.y = ry || 0; g.add(q);
    add(q, new T.PlaneGeometry(w, h), shutterMat(), 0, h / 2, 0.02);
    add(q, new T.BoxGeometry(w + 0.3, 0.45, 0.35), k.galva, 0, h + 0.22, 0.17);
    for (const s of [-1, 1]) add(q, new T.BoxGeometry(0.1, h, 0.12), k.acier, s * (w / 2 + 0.05), h / 2, 0.06);
    for (const s of [-1, 1]) { const b = add(q, cyl(0.1, 1.0, 10), mat('rbutoir', () => new T.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.6 })), s * (w / 2 + 0.35), 0.5, 0.25); }   // potelets de protection jaunes
  }
  // vitrages : reflet sombre, store vénitien, rideaux (texture : ce qu'on devine derrière la vitre)
  function winMat(r) {
    const kind = r < 0.45 ? 0 : r < 0.72 ? 1 : r < 0.86 ? 2 : 3;   // 3 : rideaux, pièce éclairée la nuit
    return mat('rvitrage' + kind, () => {
      const c = canvas(128, 192), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 128, 192);
      gr.addColorStop(0, '#3a4a55'); gr.addColorStop(0.55, '#1d262d'); gr.addColorStop(1, '#2a343b'); g.fillStyle = gr; g.fillRect(0, 0, 128, 192);
      if (kind === 1) { for (let y = 0; y < 150; y += 6) { g.fillStyle = 'rgba(214,206,186,0.9)'; g.fillRect(0, y, 128, 4); } }
      if (kind === 3) { g.fillStyle = '#5a4630'; g.fillRect(0, 0, 128, 192); }
      if (kind >= 2) { g.fillStyle = 'rgba(176,150,120,0.92)'; g.fillRect(0, 0, 40, 192); g.fillRect(88, 0, 40, 192); for (let x = 0; x < 40; x += 8) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, 0, 3, 192); g.fillRect(88 + x, 0, 3, 192); } }
      const sky = g.createLinearGradient(0, 0, 128, 80); sky.addColorStop(0, 'rgba(200,215,225,0.35)'); sky.addColorStop(1, 'rgba(200,215,225,0)'); g.fillStyle = sky; g.fillRect(0, 0, 128, 192);
      const t = tex(c, true, false), m = new T.MeshStandardMaterial({ map: t, roughness: 0.12, metalness: 0.25 });
      if (kind === 3) { m.emissive = new T.Color(0xffd9a0); m.emissiveMap = t; m.emissiveIntensity = 0; m.userData.jour = 0; m.userData.nuit = 1.1; }
      return m;
    });
  }
  // fenêtre d'étage : tableau sombre, vitrage, appui et linteau en pierre ; parfois condamnée ou grillagée
  function windowAt(g, x, y, z, R, wins) {
    const k = K(), w = 1.0, h = 1.45, kind = R();
    add(g, new T.BoxGeometry(w + 0.04, h + 0.04, 0.02), k.acierNoir, x, y, z + 0.005);
    if (kind < 0.18) add(g, new T.BoxGeometry(w - 0.02, h - 0.02, 0.03), k.contreplaque, x, y, z + 0.02);
    else {
      const wm = winMat(R()); if (wm.emissiveMap && !LAMPES.includes(wm)) LAMPES.push(wm); add(g, new T.PlaneGeometry(w - 0.12, h - 0.12), wm, x, y, z + 0.02);
      add(g, new T.BoxGeometry(0.04, h - 0.1, 0.03), k.acierNoir, x, y, z + 0.03); add(g, new T.BoxGeometry(w - 0.1, 0.04, 0.03), k.acierNoir, x, y + 0.12, z + 0.03);
      if (kind > 0.8) for (let i = -2; i <= 2; i++) add(g, cyl(0.012, h, 6), k.acierNoir, x + i * 0.2, y, z + 0.09);
    }
    add(g, new T.BoxGeometry(w + 0.2, 0.08, 0.14), k.chaperon, x, y - h / 2 - 0.04, z + 0.07);
    add(g, new T.BoxGeometry(w + 0.16, 0.16, 0.05), k.chaperon, x, y + h / 2 + 0.08, z + 0.025);
    wins.push([x, y - h / 2]);
  }
  // climatiseur mural sur équerres, tuyaux qui remontent
  function wallAC(g, x, y, z, R) {
    const k = K(), p = model('climmur', 0.9, 0.65, 0.4, { byHeight: true, tol: 0.3 });
    if (p) { p.position.set(x, y, z + 0.22); g.add(p); return; }
    add(g, new T.BoxGeometry(0.85, 0.6, 0.32), k.clim, x, y, z + 0.2);
    const f = add(g, cyl(0.21, 0.02, 18), k.grille, x - 0.12, y, z + 0.37); f.rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) add(g, new T.BoxGeometry(0.04, 0.04, 0.4), k.acierNoir, x + s * 0.3, y - 0.32, z + 0.2);
    add(g, cyl(0.02, 0.7, 6), k.cuivre, x + 0.36, y + 0.6, z + 0.06);
  }
  // escalier de secours (deux paliers, volée, échelle relevée) : modèle Meshy, sinon dessiné ; bas à 2,3 m
  function fireEscape(g, x, y0, z, H, R) {
    const p = model('escalier', 3.6, H, 1.3, { byHeight: true, tol: 0.4 });   // échelle relevée : pied à 2,7 m
    if (p) { p.position.set(x, y0 + 2.7 + H / 2, z + 0.67); g.add(p); return; }
    const k = K(), m = k.acierNoir, top = y0 + 2.3 + H;
    for (const ly of [y0 + 2.3 + H * 0.42, top - 1.0]) {
      add(g, new T.BoxGeometry(3.4, 0.06, 1.2), m, x, ly, z + 0.62);
      add(g, new T.BoxGeometry(3.4, 0.04, 0.04), m, x, ly + 1.0, z + 1.2); add(g, new T.BoxGeometry(0.04, 0.04, 1.2), m, x - 1.7, ly + 1.0, z + 0.62); add(g, new T.BoxGeometry(0.04, 0.04, 1.2), m, x + 1.7, ly + 1.0, z + 0.62);
      for (let i = 0; i <= 14; i++) add(g, new T.BoxGeometry(0.02, 1.0, 0.02), m, x - 1.7 + i * 3.4 / 14, ly + 0.5, z + 1.2);
      for (const s of [-1, 1]) { const b = add(g, new T.BoxGeometry(0.04, 0.04, 1.3), m, x + s * 1.4, ly - 0.45, z + 0.55); b.rotation.x = -0.75; }
    }
    const l0 = y0 + 2.3 + H * 0.42, l1 = top - 1.0, st = add(g, new T.BoxGeometry(0.7, 0.06, Math.hypot(2.4, l1 - l0)), m, x + 0.2, (l0 + l1) / 2, z + 0.62);
    st.rotation.z = 0; st.rotation.order = 'YXZ'; st.rotation.y = Math.PI / 2; st.rotation.x = -Math.atan2(l1 - l0, 2.4);
    for (const s of [-0.18, 0.18]) add(g, new T.BoxGeometry(0.03, 1.9, 0.03), m, x - 1.2 + s, l0 - 0.95, z + 1.15);
    for (let i = 0; i < 7; i++) add(g, new T.BoxGeometry(0.36, 0.025, 0.025), m, x - 1.2, l0 - 0.2 - i * 0.27, z + 1.15);
  }
  // descente d'eau pluviale du chaperon au sol, avec coude et dauphin
  function downspout(g, x, y0, z, h) {
    const k = K(); add(g, cyl(0.055, h - 0.4, 8), k.galva, x, y0 + 0.2 + (h - 0.4) / 2, z + 0.09);
    add(g, new T.BoxGeometry(0.22, 0.18, 0.22), k.galva, x, y0 + h - 0.1, z + 0.12);
    const e = add(g, cyl(0.055, 0.3, 8), k.galva, x, y0 + 0.12, z + 0.2); e.rotation.x = Math.PI / 2;
    for (let yy = y0 + 1; yy < y0 + h - 0.5; yy += 2) add(g, new T.BoxGeometry(0.16, 0.03, 0.06), k.acierNoir, x, yy, z + 0.04);
  }
  // compteurs et coffrets électriques, gaines
  function meters(g, x, y0, z, R) {
    const k = K(); add(g, new T.BoxGeometry(0.6, 0.8, 0.22), k.pvc, x, y0 + 1.5, z + 0.11);
    for (let i = 0; i < 2; i++) { const m = add(g, cyl(0.1, 0.12, 14), k.galva, x - 0.15 + i * 0.3, y0 + 1.0, z + 0.08); m.rotation.x = Math.PI / 2; }
    add(g, cyl(0.03, 3.5, 6), k.acier, x + 0.24, y0 + 1.9 + 1.75, z + 0.05);
    add(g, cyl(0.025, 1.1, 6), k.acier, x - 0.2, y0 + 0.55, z + 0.05);
  }
  // un immeuble (arrière) : volume en briques, chaperon, toiture, façade sur z = 0 (repère local)
  function building(g, x0, x1, h, tone, seed, y0, opts) {
    const k = K(), R = rng(seed), w = x1 - x0, D = 11.5, cx = (x0 + x1) / 2, wins = [];
    add(g, boxW(w, h, D, TILE), brickMat(tone), cx, y0 + h / 2, -D / 2);
    add(g, new T.BoxGeometry(w + 0.02, 0.35, 0.36), k.chaperon, cx, y0 + h + 0.12, -0.12);      // chaperon débordant
    add(g, new T.BoxGeometry(w - 0.4, 0.05, D - 0.6), k.toit, cx, y0 + h + 0.02, -D / 2);       // toit-terrasse (étanchéité)
    for (let i = 0; i < 2; i++) { const u = cx + (R() - 0.5) * (w - 3); add(g, new T.BoxGeometry(1.3, 0.9, 1.0), k.clim, u, y0 + h + 0.45, -2.5 - R() * 4); add(g, cyl(0.3, 0.02, 16), k.grille, u, y0 + h + 0.91, -2.5); }
    if (R() < 0.6) { const u = cx + (R() - 0.5) * (w - 4); add(g, new T.BoxGeometry(1.6, 1.4, 1.6), k.chaperon, u, y0 + h + 0.7, -D + 2.5); }   // édicule d'escalier
    // corniche de briques en saillie sous le chaperon
    add(g, new T.BoxGeometry(w, 0.22, 0.12), brickMat(tone), cx, y0 + h - 0.45, 0.06);
    // étages : fenêtres régulières (tous les 3,3 m en hauteur)
    const floors = Math.floor((h - 3.6) / 3.2), nwin = Math.max(1, Math.floor((w - 1.4) / 2.6)), step = (w - 1.4) / nwin;
    for (let f = 0; f < floors; f++) for (let i = 0; i < nwin; i++) {
      const wx = x0 + 0.7 + step * (i + 0.5), wy = y0 + 4.9 + f * 3.2;
      if (opts.masque && wx > opts.masque[0] - 0.6 && wx < opts.masque[1] + 0.6 && wy < y0 + opts.masque[2]) continue;   // derrière l'annexe
      windowAt(g, wx, wy, 0, R, wins);
      if (R() < 0.3 && f < 2 && !(opts.boutique && Math.abs(wx - opts.boutique[0]) < 2.6)) wallAC(g, wx, wy - 1.1, 0, R);
    }
    // rez-de-chaussée : portes, rideau, compteurs, petites fenêtres hautes grillagées
    for (const dx of opts.portes || []) { backDoor(g, dx, y0, 0, R); if (R() < 0.6) meters(g, dx + 1.4, y0, 0, R); }
    if (opts.rideau) { shutter(g, opts.rideau[0], y0, 0, opts.rideau[1], 3.0); plate(g, opts.rideau[0] + opts.rideau[1] / 2 + 0.75, y0 + 2.1, 0, 0.5, 0.25, plateTex('interdit', 'LIVRAISONS', 'Stationnement interdit')); }
    if (opts.boutique) shopEntrance(g, opts.boutique[0], y0, 0, opts.boutique[1]);
    if (opts.graisse !== undefined) greaseBin(g, opts.graisse, y0, 0);
    if (opts.gaz !== undefined) gasMeters(g, opts.gaz, y0, 0);
    for (const hx of opts.hautes || []) {   // imposte haute de réserve : cadre, vitrage armé, barreaux, appui
      add(g, new T.BoxGeometry(1.0, 0.62, 0.04), k.acier, hx, y0 + 2.9, 0.02);
      add(g, new T.PlaneGeometry(0.88, 0.5), winMat(0.9), hx, y0 + 2.9, 0.045);
      for (let i = -3; i <= 3; i++) add(g, cyl(0.016, 0.62, 6), k.galva, hx + i * 0.13, y0 + 2.9, 0.1);
      for (const dy of [-0.26, 0.26]) add(g, new T.BoxGeometry(0.98, 0.035, 0.035), k.galva, hx, y0 + 2.9 + dy, 0.1);
      add(g, new T.BoxGeometry(1.12, 0.07, 0.14), k.chaperon, hx, y0 + 2.56, 0.07);
    }
    if (opts.escalier) fireEscape(g, opts.escalier, y0, 0, Math.min(h - 3.4, 6.2), R);
    downspout(g, x1 - 0.25, y0, 0, h);
    // salissures et tags
    decal(g, grimeTex(seed, w, h, wins.map(([wx, wy]) => [wx - x0, wy - y0])), w, h, cx, y0 + h / 2, 0.012, 0, 1);
    for (const [tx, tw] of opts.tags || []) decal(g, tagTex(seed + Math.round(tx)), tw, tw * 0.375, tx, y0 + 0.4 + tw * 0.19 + R() * 0.3, 0.02, 0, 0.92);
  }
  // ---------------------------------------------------------------------------------------------
  // Pièces de la simulation
  // ---------------------------------------------------------------------------------------------
  // l'arrière de la rangée d'immeubles, posé sur le mur nord de la simulation (façade sur la face sud du mur, z = 0)
  function backs(o) {
    const g = new T.Group(), y0 = -o.h / 2, ox = o.x + o.w / 2, oz = o.z + o.d / 2, X = (x) => x - ox, Z0 = 0 - oz;
    const f = new T.Group(); f.position.z = Z0; g.add(f);
    // [x0, x1, hauteur, brique, graine, détails] — x en coordonnées du monde ; l'annexe (x 30–37) cache le pied de l'immeuble 3
    const B = [
      [-6, 9, 10.2, 'rouge', 11, { portes: [3.0], hautes: [6.2], escalier: 6.5, tags: [[1.2, 2.6]] }],
      [9, 18.5, 13.4, 'brun', 12, { portes: [17.6], rideau: [11.6, 3.0], escalier: 14.6 }],
      [18.5, 28.5, 8.6, 'peint', 13, { portes: [20.4], graisse: 21.9, boutique: [25.75, { nom: 'Le Comptoir', sous: 'Café · Brasserie · Plat du jour 14,50 €', fond: '#1f4a35', lettres: '#f3ead2', toile: 0x234d36 }], tags: [[23.3, 1.1]] }],
      [28.5, 39, 12.2, 'rouge', 14, { masque: [30, 37, 6.2], hautes: [38.0] }],
      [39, 49.5, 9.8, 'jaune', 15, { portes: [41.6], gaz: 43.0, boutique: [48.0, { nom: 'Librairie Fenouil', sous: 'Livres neufs & d’occasion', fond: '#5a1f26', lettres: '#f1e3c4', toile: 0x6a2129 }], tags: [[44.6, 2.2]] }],
      [49.5, 60, 13.0, 'brun', 16, { portes: [57.6], escalier: 54.2, hautes: [51.5] }],
      [60, 78, 10.6, 'rouge', 17, { portes: [65.2], rideau: [70.0, 3.2], hautes: [62.6], tags: [[63.4, 2.4]] }],
    ];
    for (const [x0, x1, h, tone, seed, opts] of B) {
      const o2 = Object.assign({}, opts); if (o2.boutique) o2.boutique = [X(o2.boutique[0]), o2.boutique[1]]; for (const k of ['graisse', 'gaz']) if (o2[k] !== undefined) o2[k] = X(o2[k]); for (const k of ['portes', 'hautes']) if (o2[k]) o2[k] = o2[k].map(X);
      if (o2.rideau) o2.rideau = [X(o2.rideau[0]), o2.rideau[1]]; if (o2.masque) o2.masque = [X(o2.masque[0]), X(o2.masque[1]), o2.masque[2]]; if (o2.escalier) o2.escalier = X(o2.escalier); if (o2.tags) o2.tags = o2.tags.map(([a, b]) => [X(a), b]);
      building(f, X(x0), X(x1), h, tone, seed, y0, o2);
    }
    // plaques de rue aux deux bouts de la ruelle
    plate(f, X(-0.4), y0 + 3.2, 0, 0.75, 0.3, plateTex('rue', 'PASSAGE', 'des Tanneurs'));
    plate(f, X(72.4), y0 + 3.2, 0, 0.75, 0.3, plateTex('rue', 'PASSAGE', 'des Tanneurs'));
    // joints entre immeubles : un poteau de briques en saillie (mitoyenneté)
    for (const x of [9, 18.5, 28.5, 39, 49.5, 60]) add(f, new T.BoxGeometry(0.3, 2, 0.1), brickMat('brun'), X(x), y0 + 1, 0.05).scale.y = 1;
    return g;
  }
  // l'annexe en briques qui avance dans la ruelle : rideau métallique au sud, porte de service à l'est, toit plat
  function annexe(o) {
    const k = K(), g = new T.Group(), R = rng(41), y0 = -o.h / 2, W = o.w, Dd = o.d, wins = [];
    add(g, boxW(W, o.h, Dd, TILE), brickMat('brun'), 0, 0, 0);
    add(g, new T.BoxGeometry(W + 0.12, 0.3, Dd + 0.12), k.chaperon, 0, o.h / 2 + 0.1, 0);
    add(g, new T.BoxGeometry(W - 0.5, 0.04, Dd - 0.5), k.toit, 0, o.h / 2 + 0.02, 0);
    add(g, new T.BoxGeometry(1.4, 0.8, 1.0), k.clim, -1.2, o.h / 2 + 0.4, -0.8); add(g, cyl(0.3, 0.02, 16), k.grille, -1.2, o.h / 2 + 0.81, -0.8);
    const s = new T.Group(); s.position.z = Dd / 2; g.add(s);   // face sud
    shutter(s, -0.9, y0, 0, 3.4, 3.2);
    backDoor(s, 2.3, y0, 0, R);
    decal(s, grimeTex(42, W, o.h, wins), W, o.h, 0, 0, 0.012);
    decal(s, tagTex(77), 1.6, 0.6, 2.4, y0 + 3.55, 0.025, 0, 0.9);
    const e = new T.Group(); e.position.x = W / 2; e.rotation.y = Math.PI / 2; g.add(e);   // face est : porte, compteurs
    backDoor(e, 0.6, y0, 0, R); meters(e, -1.6, y0, 0, R); downspout(e, 3.2, y0, 0, o.h);
    decal(e, grimeTex(43, Dd, o.h, []), Dd, o.h, 0, 0, 0.012);
    const wf = new T.Group(); wf.position.x = -W / 2; wf.rotation.y = -Math.PI / 2; g.add(wf);   // face ouest
    downspout(wf, -2.6, y0, 0, o.h); decal(wf, grimeTex(44, Dd, o.h, []), Dd, o.h, 0, 0, 0.012);
    wallAC(wf, 0.5, y0 + 2.6, 0, R);
    return g;
  }
  // local à poubelles : trois murs en parpaings enduits, ouvert au nord, deux bennes dedans
  function binShed(o) {
    const k = K(), g = new T.Group(), y0 = -o.h / 2, t = 0.2;
    const wallM = mat('rparpaing', () => { const B = brick('parpaing'); return new T.MeshStandardMaterial({ map: B.map, normalMap: B.normalMap, roughness: 0.92, color: 0xd8d6d0 }); });
    add(g, boxW(o.w, o.h, t, TILE), wallM, 0, 0, o.d / 2 - t / 2);
    for (const s of [-1, 1]) add(g, boxW(t, o.h, o.d, TILE), wallM, s * (o.w / 2 - t / 2), 0, 0);
    add(g, new T.BoxGeometry(o.w + 0.08, 0.08, t + 0.08), k.chaperon, 0, o.h / 2 + 0.04, o.d / 2 - t / 2);
    for (const s of [-1, 1]) add(g, new T.BoxGeometry(t + 0.08, 0.08, o.d + 0.04), k.chaperon, s * (o.w / 2 - t / 2), o.h / 2 + 0.04, 0);
    add(g, new T.BoxGeometry(o.w - 0.1, 0.06, o.d - 0.1), k.beton, 0, y0 + 0.03, 0);
    for (const s of [-1, 1]) {
      const b = model('benne', 1.75, 1.25, 1.1, { tol: 0.3, rot: Math.PI });
      if (b) { b.position.set(s * 0.92, y0 + 0.625, -0.2); g.add(b); }
      else { add(g, new T.BoxGeometry(1.6, 1.15, 1.0), k.poubelle, s * 0.92, y0 + 0.62, -0.2); add(g, new T.BoxGeometry(1.65, 0.06, 1.05), k.acierNoir, s * 0.92, y0 + 1.23, -0.2); }
    }
    decal(g, tagTex(91), 2.2, 0.82, 0, y0 + 1.1, o.d / 2 + 0.012, 0, 0.9);
    return g;
  }
  // muret en béton (0,8 m) surmonté d'un grillage sur poteaux galvanisés jusqu'à 2,4 m ; on voit à travers
  function fence(o) {
    const k = K(), g = new T.Group(), along = o.w >= o.d, L = along ? o.w : o.d, y0 = -o.h / 2, top = 2.4;
    const wallG = new T.Group(); wallG.rotation.y = along ? 0 : Math.PI / 2; g.add(wallG);
    add(wallG, new T.BoxGeometry(L, o.h, 0.3), mat('rmuret', () => new T.MeshStandardMaterial({ color: 0x96928a, roughness: 0.9 })), 0, 0, 0);
    add(wallG, new T.BoxGeometry(L + 0.04, 0.06, 0.34), k.chaperon, 0, o.h / 2 + 0.03, 0);
    const n = Math.max(1, Math.round(L / 2.5));
    for (let i = 0; i <= n; i++) { const x = -L / 2 + i * L / n, end = i === 0 || i === n; add(wallG, cyl(end ? 0.045 : 0.03, top - o.h + 0.05, 8), k.galva, x, y0 + o.h + (top - o.h) / 2, 0); }
    add(wallG, cyl(0.022, L, 8), k.galva, 0, y0 + top - 0.03, 0).rotation.z = Math.PI / 2;
    const ch = new T.Mesh(new T.PlaneGeometry(L, top - o.h - 0.05), chainMat()); ch.position.set(0, y0 + o.h + (top - o.h - 0.05) / 2 + 0.02, 0.01);
    const uv = ch.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L / 0.07, uv.getY(i) * (top - o.h) / 0.07);
    ch.renderOrder = 2; wallG.add(ch);
    for (let i = 0; i < Math.floor(L / 6); i++) decal(wallG, grimeTex(200 + i + Math.round(o.x), 6, o.h, []), 6, o.h, -L / 2 + 3 + i * 6, 0, 0.152, 0, 0.8);
    return g;
  }
  // haie taillée dans une jardinière en béton : bac de 0,5 m, feuillage en touffes irrégulières (sphères déformées par
  // un bruit, rognées à la boîte de la simulation : dessus et côtés taillés mais pas plats), texture de feuilles
  function leafMat() {
    return mat('rfeuilles', () => {
      const c = canvas(256), g = c.getContext('2d'), R = rng(77); g.fillStyle = '#2f4a22'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 2600; i++) { const v = R(); g.fillStyle = v < 0.35 ? '#1d3214' : v < 0.7 ? '#3d5e2a' : v < 0.92 ? '#557a36' : '#6f9446'; g.beginPath(); g.ellipse(R() * 256, R() * 256, 2 + R() * 4, 1 + R() * 2, R() * 3.14, 0, 7); g.fill(); }
      const hc = canvas(256), hg = hc.getContext('2d'); hg.drawImage(c, 0, 0); const t = tex(c, true, true); t.repeat.set(2, 2);
      const n = normalTex(hc, 2.5); n.repeat.set(2, 2);
      return new T.MeshStandardMaterial({ map: t, normalMap: n, roughness: 0.9, color: 0xa9b3a0 });
    });
  }
  function hedge(o) {
    const k = K(), g = new T.Group(), y0 = -o.h / 2, base = 0.5, R = rng(Math.round(o.x * 13 + o.z * 7));
    const bac = mat('rbac', () => new T.MeshStandardMaterial({ color: 0x9c978d, roughness: 0.9 }));
    add(g, boxW(o.w, base, o.d, TILE), bac, 0, y0 + base / 2, 0);
    add(g, new T.BoxGeometry(o.w + 0.06, 0.06, o.d + 0.06), k.chaperon, 0, y0 + base + 0.03, 0);
    const hx = o.w / 2 - 0.06, hz = o.d / 2 - 0.06, top = o.h / 2, bot = y0 + base;
    const along = o.w >= o.d, L = along ? o.w : o.d, n = Math.max(2, Math.round(L / 0.45));
    for (let i = 0; i < n; i++) for (const side of [-1, 1]) {
      const u = -L / 2 + (i + 0.5) * L / n + (R() - 0.5) * 0.15, v = side * (along ? o.d : o.w) * 0.2, r = 0.42 + R() * 0.14;
      const gq = new T.SphereGeometry(r, 14, 10), pa = gq.attributes.position, p = new T.Vector3(), cx = along ? u : v, cz = along ? v : u, cy = bot + 0.55 + R() * 0.15;
      for (let j = 0; j < pa.count; j++) {
        p.fromBufferAttribute(pa, j); const d = 1 + 0.16 * Math.sin(p.x * 17 + seedN(i)) * Math.cos(p.z * 15 + p.y * 11) + (R() - 0.5) * 0.08; p.multiplyScalar(d);
        let X = cx + p.x, Y = cy + p.y * 1.25, Z = cz + p.z;
        X = Math.max(-hx, Math.min(hx, X)); Z = Math.max(-hz, Math.min(hz, Z)); Y = Math.max(bot - 0.02, Math.min(top, Y));
        const e = Math.max(0, (Y - (top - 0.3)) / 0.3), w = 1 - 0.07 * e * e;                       // arêtes du dessus arrondies
        X *= w; Z = Z * (1 - 0.18 * e * e);
        const bump = 0.035 * (Math.sin(X * 9.1 + Y * 7.3) + Math.cos(Z * 8.7 - Y * 6.1)) + (R() - 0.5) * 0.03;   // taille irrégulière
        X -= Math.sign(X) * Math.max(0, bump) * (Math.abs(X) > hx - 0.08 ? 1 : 0); Z -= Math.sign(Z) * Math.max(0, bump) * (Math.abs(Z) > hz * w - 0.08 ? 1 : 0); if (Y > top - 0.05) Y -= Math.max(0, bump);
        pa.setXYZ(j, X, Y, Z);
      }
      gq.computeVertexNormals(); const m = new T.Mesh(gq, leafMat()); m.castShadow = m.receiveShadow = true; g.add(m);
    }
    return g;
  }
  const seedN = (i) => (i * 1.7) % 6.28;
  // climatiseur posé au sol (groupe extérieur sur dalle)
  function condenser(o) {
    const p = model('clim', o.w, o.h, o.d, { tol: 0.3 }); if (p) return p;
    const k = K(), g = new T.Group(), y0 = -o.h / 2;
    add(g, new T.BoxGeometry(o.w + 0.1, 0.1, o.d + 0.1), k.beton, 0, y0 + 0.05, 0);
    add(g, new T.BoxGeometry(o.w * 0.92, o.h - 0.16, o.d * 0.92), k.clim, 0, y0 + 0.1 + (o.h - 0.16) / 2, 0);
    add(g, cyl(Math.min(o.w, o.d) * 0.36, 0.03, 20), k.grille, 0, o.h / 2 - 0.05, 0);
    for (let i = 0; i < 7; i++) add(g, new T.BoxGeometry(o.w * 0.8, 0.02, 0.01), k.grille, 0, y0 + 0.25 + i * 0.09, o.d * 0.46 + 0.005);
    return g;
  }
  // une pièce de la simulation habillée, ou null
  function mesh(o) {
    const n = o.name || '';
    try {
      if (n === 'mur nord') return backs(o);
      if (n.startsWith('annexe')) return annexe(o);
      if (n.startsWith('local poubelles')) return binShed(o);
      if (n.startsWith('clôture grillagée')) return fence(o);
      if (n.startsWith('clim')) return condenser(o);
      if (n === 'benne' && hasM('benne')) return model('benne', o.w, o.h, o.d, { tol: 0.3, rot: o.z < 5 ? Math.PI : 0 });
      if (n === 'armoire' && hasM('armoire')) return model('armoire', o.w, o.h, o.d, { tol: 0.3 });
      if (n === 'haie') return hedge(o);
      if (n === 'aspirateur' && hasM('aspirateur')) return model('aspirateur', o.w, o.h, o.d, { byHeight: true, tol: 0.3, rot: o.x > 36 ? 0 : Math.PI });   // colonne d'aspiration contre le mur de la station : afficheur vers l'allée, tuyaux vers les places
      if (n === 'borne de recharge' && hasM('borne')) return model('borne', o.w, o.h, o.d, { tol: 0.3, rot: o.x > 36 ? -Math.PI / 2 : Math.PI / 2 });   // écran vers le parking (mur ouest : +x ; mur est : −x)
      if (n.startsWith('caisse automatique') && hasM('caisse')) return model('caisse', o.w, o.h, o.d, { tol: 0.2, rot: Math.PI / 2 });   // bornes de paiement vers l'est et l'ouest   // (app.js n'a pas de cas 'armoire' : sans ceci, boîte grise)
      if (n.startsWith('caisses') && hasM('caisses')) return model('caisses', o.w, o.h, o.d, { tol: 0.3, rot: Math.round(o.x * 7) % 4 * Math.PI / 2 });
      if (n.startsWith('guérite') && hasM('guerite')) return model('guerite', o.w, o.h, o.d, { tol: 0.25, rot: -Math.PI / 2 });
    } catch (e) { console.warn('ruelle (' + n + ') :', e); }
    return null;
  }
  // ---------------------------------------------------------------------------------------------
  // Décor sans effet sur le jeu
  // ---------------------------------------------------------------------------------------------
  function stainTex(seed) {
    const key = 'tache' + seed; if (CACHE[key]) return CACHE[key];
    const R = rng(seed), c = canvas(256), g = c.getContext('2d');
    for (let k = 0; k < 14; k++) { const x = 128 + (R() - 0.5) * 110, y = 128 + (R() - 0.5) * 110, r = 18 + R() * 60, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(12,10,8,${0.25 + R() * 0.25})`); gr.addColorStop(1, 'rgba(12,10,8,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return (CACHE[key] = t);
  }
  function groundDecal(group, map, w, d, x, z, rot, op) {
    const m = new T.Mesh(new T.PlaneGeometry(w, d), new T.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.6, opacity: op || 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = rot || 0; m.position.set(x, 0.012, z); m.receiveShadow = true; m.renderOrder = 1; group.add(m);
  }
  function build(map, group, ctx) {
    NUITS.length = 0;
    const has = (nm) => map.obstacles.some(o => (o.name || '').startsWith(nm)); if (!has('clôture grillagée') && !has('annexe')) return;
    const k = K(), R = rng(2027), free = (x, z, r) => !map.obstacles.some(o => x > o.x - r && x < o.x + o.w + r && z > o.z - r && z < o.z + o.d + r);
    // pied des façades : bande humide et sale le long du mur nord, taches d'huile, avaloir au milieu de la ruelle
    groundDecal(group, stainTex(3), 74, 1.6, 36, 0.8, 0, 0.55);
    for (let i = 0; i < 16; i++) { const x = 2 + R() * 68, z = 1.5 + R() * 8; groundDecal(group, stainTex(10 + i), 1.2 + R() * 2.2, 1.0 + R() * 1.6, x, z, R() * 3, 0.8); }
    const grate = mat('ravaloir', () => new T.MeshStandardMaterial({ color: 0x1d1e1f, roughness: 0.5, metalness: 0.8 }));
    for (const x of [16.5, 48.5]) { const gm = new T.Mesh(new T.BoxGeometry(0.9, 0.02, 0.5), grate); gm.position.set(x, 0.01, 5.6); gm.receiveShadow = true; group.add(gm); for (let i = 0; i < 6; i++) { const b = new T.Mesh(new T.BoxGeometry(0.04, 0.025, 0.42), k.acierNoir); b.position.set(x - 0.35 + i * 0.14, 0.015, 5.6); group.add(b); } }
    // portail du passage ouest ouvert, rabattu côté parking contre le grillage
    { const gate = new T.Group(); gate.position.set(24, 0, 11.05); gate.rotation.y = 0.12; group.add(gate);
      const L = 3.3, H = 2.0; for (const [x, y, w, h] of [[-L / 2, H / 2, 0.05, H], [L / 2, H / 2, 0.05, H], [0, H, L, 0.05], [0, 0.08, L, 0.05], [0, H / 2, L, 0.04]]) { const m = new T.Mesh(w > 0.1 ? cyl(0.024, w, 8) : cyl(0.024, h, 8), k.galva); m.position.set(x - L / 2, y + 0.06, 0); if (w > 0.1) m.rotation.z = Math.PI / 2; m.castShadow = true; gate.add(m); }
      const ch = new T.Mesh(new T.PlaneGeometry(L, H), chainMat()); const uv = ch.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L / 0.07, uv.getY(i) * H / 0.07); ch.position.set(-L / 2, H / 2 + 0.06, 0); ch.renderOrder = 2; gate.add(ch);
      const w = new T.Mesh(cyl(0.08, 0.05, 12), k.caoutchouc || k.acierNoir); w.position.set(-L, 0.08, 0); gate.add(w); }
    // poteaux électriques en bois le long du grillage (dans le muret), transformateur, câbles vers les immeubles
    const pole = mat('rpoteau', () => new T.MeshStandardMaterial({ color: 0x5b4632, roughness: 0.92 }));
    const wire = mat('rcable', () => new T.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 }));
    const poles = [[12.5, 10.65], [36, 10.65], [58.5, 10.65]], tops = [];
    for (const [x, z] of poles) {
      const p = new T.Mesh(cyl(0.14, 9.5, 10), pole); p.position.set(x, 4.75, z); p.castShadow = true; group.add(p);
      const arm = new T.Mesh(new T.BoxGeometry(1.8, 0.1, 0.1), pole); arm.position.set(x, 8.9, z); arm.castShadow = true; group.add(arm);
      for (const s of [-0.75, 0, 0.75]) { const ins = new T.Mesh(cyl(0.04, 0.14, 6), k.chaperon); ins.position.set(x + s, 9.02, z); group.add(ins); }
      if (x === 36) { const tr = new T.Mesh(cyl(0.32, 0.9, 14), k.galva); tr.position.set(x, 7.6, z - 0.4); tr.castShadow = true; group.add(tr); }
      tops.push(new T.Vector3(x, 9.05, z));
    }
    const span = (a, b, sag) => { const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12, p = a.clone().lerp(b, t); p.y -= sag * 4 * t * (1 - t); pts.push(p); } const c = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 16, 0.012, 4, false), wire); group.add(c); };
    for (let i = 0; i + 1 < tops.length; i++) for (const s of [-0.75, 0, 0.75]) span(tops[i].clone().setX(tops[i].x + s), tops[i + 1].clone().setX(tops[i + 1].x + s), 0.6);
    for (const t of tops) for (const dx of [-3, 3]) span(t.clone(), new T.Vector3(t.x + dx, 7.2 + R(), 0.05), 0.5);   // branchements des immeubles
    // sacs-poubelle et cartons à côté des bennes et des portes
    // sac-poubelle : sphère déformée (fond aplati, plis, col resserré) + nœud
    const bagGeo = (seed) => {
      const Rb = rng(seed), gq = new T.SphereGeometry(0.3, 16, 12), pa = gq.attributes.position, v = new T.Vector3();
      const bumps = Array.from({ length: 6 }, () => [new T.Vector3(Rb() - 0.5, Rb() - 0.3, Rb() - 0.5).normalize(), 0.03 + Rb() * 0.05]);
      for (let i = 0; i < pa.count; i++) {
        v.fromBufferAttribute(pa, i); const n = v.clone().normalize(); let r = 0.3;
        for (const [d, a] of bumps) r += a * Math.max(0, n.dot(d)) ** 3;
        r += 0.014 * Math.sin(Math.atan2(n.z, n.x) * 9 + n.y * 14 + seed) + (Rb() - 0.5) * 0.01;   // plis du plastique
        v.copy(n).multiplyScalar(r); v.y *= 0.85;
        if (v.y < -0.13) v.y = -0.13 - (v.y + 0.13) * 0.2;                           // posé : fond aplati
        if (v.y > 0.19) { const t = Math.min(1, (v.y - 0.19) / 0.07); v.x *= 1 - 0.72 * t; v.z *= 1 - 0.72 * t; v.y += 0.03 * t; }   // col froncé, court
        pa.setXYZ(i, v.x, v.y, v.z);
      }
      gq.computeVertexNormals(); return gq;
    };
    const BAGS = [bagGeo(1), bagGeo(2), bagGeo(3)], sacM = mat('rsac2', () => new T.MeshStandardMaterial({ color: 0x16181a, roughness: 0.34, metalness: 0.05 }));
    const bag = (x, z) => {
      const q = new T.Group(); q.position.set(x, 0.12, z); q.rotation.set((R() - 0.5) * 0.3, R() * 6.28, (R() - 0.5) * 0.3); const sc = 0.85 + R() * 0.35; q.scale.set(sc, sc * (0.8 + R() * 0.25), sc); group.add(q);
      const m = new T.Mesh(BAGS[Math.floor(R() * 3)], sacM); m.castShadow = m.receiveShadow = true; q.add(m);
      const kn = new T.Mesh(new T.SphereGeometry(0.045, 8, 6), sacM); kn.scale.y = 0.8; kn.position.y = 0.3; kn.rotation.z = (R() - 0.5) * 0.8; kn.castShadow = true; q.add(kn);
      for (const s of [-1, 1]) { const e = new T.Mesh(new T.ConeGeometry(0.03, 0.11, 5), sacM); e.position.set(s * 0.05, 0.34, 0); e.rotation.z = -s * 1.1; q.add(e); }
    };
    for (const o of map.obstacles) if ((o.name || '').startsWith('benne') && o.z < 11) for (let i = 0; i < 3; i++) { const x = o.x + o.w + 0.35 + R() * 0.5, z = o.z + 0.3 + i * 0.4; if (free(x, z, 0.3)) bag(x, z); }
    for (let i = 0; i < 7; i++) { const x = 2 + R() * 68, z = 0.35 + R() * 0.4; if (!free(x, z, 0.4)) continue; const c = new T.Mesh(new T.BoxGeometry(0.5 + R() * 0.3, 0.02, 0.4 + R() * 0.3), k.carton); c.position.set(x, 0.012, z + 0.3); c.rotation.y = R() * 3; c.receiveShadow = true; group.add(c); }
    for (let i = 0; i < 4; i++) { const x = 3 + R() * 66, z = 0.3; if (!free(x, z, 0.35)) continue; const c = new T.Mesh(new T.BoxGeometry(0.45, 0.4, 0.35), k.carton); c.position.set(x, 0.2, z + 0.2); c.rotation.y = (R() - 0.5) * 0.5; c.castShadow = c.receiveShadow = true; group.add(c); }
  }
  // nuit : vitrines, enseignes, fenêtres éclairées lisibles mais sous le seuil du halo ; seules les ampoules des lampes brillent
  function setConditions(id) { const n = id === 'nuit'; for (const m of LAMPES) m.emissiveIntensity = n ? (m.userData.nuit ? m.userData.nuit * 0.55 : 2.5) : (m.userData.jour || 0); for (const l of NUITS) l.visible = n; }
  root.Ruelle = { build, mesh, setConditions };
})(window.OT = window.OT || {});
