// Décor des cartes, refait d'après le jeu d'origine (ville écrasée de soleil : parkings, barrières en béton, sacs de
// sable, voitures blanches, palmiers, immeubles crème et roses tout autour) :
//  - textures dessinées (canevas, graine fixe) : asphalte, béton taché, façades à fenêtres grillagées, affiches et tags,
//    toile de jute, planches, tôle rouillée, pavés, terre ;
//  - coordonnées de texture à l'échelle du monde (une brique fait la même taille partout) ;
//  - modèles : barrière « jersey », sacs de sable, fût, berline et pick-up, palmier, immeubles d'horizon ;
//  - ciel clair et brumeux de jour.
(function (root) {
  const T = window.THREE;
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const cache = {};
  function canvasTex(key, w, h, draw, opts = {}) {
    if (cache[key]) return cache[key];
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h, rng(key.length * 7919 + w));
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8; if (opts.meters) t.userData.meters = opts.meters;
    return (cache[key] = t);
  }
  const noise = (g, w, h, R, n, a, dark) => { for (let i = 0; i < n; i++) { const v = dark ? 0 : 255; g.fillStyle = `rgba(${v},${v},${v},${R() * a})`; const s = 1 + R() * 2.5; g.fillRect(R() * w, R() * h, s, s); } };
  const blot = (g, x, y, r, col) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); };
  const TEX = {
    // asphalte : gris moyen, grain fin, gravillons clairs, taches d'huile, fissures (4 m par répétition)
    asphalte: () => canvasTex('asphalte', 512, 512, (g, w, h, R) => {
      g.fillStyle = '#6e6f6d'; g.fillRect(0, 0, w, h);
      noise(g, w, h, R, 9000, 0.35, true); noise(g, w, h, R, 5000, 0.25, false);
      for (let i = 0; i < 10; i++) blot(g, R() * w, R() * h, 20 + R() * 50, `rgba(30,30,28,${0.12 + R() * 0.15})`);
      g.strokeStyle = 'rgba(25,25,24,0.45)'; g.lineWidth = 1.2;
      for (let i = 0; i < 6; i++) { let x = R() * w, y = R() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 12; k++) { x += (R() - 0.5) * 30; y += (R() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
    }, { meters: 4 }),
    // béton de mur : beige gris, coulures sombres vers le bas, joints de banches (3 m)
    beton: () => canvasTex('beton', 512, 512, (g, w, h, R) => {
      g.fillStyle = '#b9b3a6'; g.fillRect(0, 0, w, h); noise(g, w, h, R, 6000, 0.18, true); noise(g, w, h, R, 3000, 0.2, false);
      for (let i = 0; i < 40; i++) { const x = R() * w, len = 60 + R() * 220; const gr = g.createLinearGradient(0, h - len, 0, h); gr.addColorStop(0, 'rgba(60,55,45,0)'); gr.addColorStop(1, `rgba(60,55,45,${0.15 + R() * 0.2})`); g.fillStyle = gr; g.fillRect(x, h - len, 3 + R() * 10, len); }
      const gb = g.createLinearGradient(0, h * 0.75, 0, h); gb.addColorStop(0, 'rgba(70,60,45,0)'); gb.addColorStop(1, 'rgba(70,60,45,0.35)'); g.fillStyle = gb; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(80,75,65,0.5)'; g.fillRect(0, h / 2 - 1, w, 2); g.fillRect(w / 2 - 1, 0, 2, h);
      for (const x of [w * 0.25, w * 0.75]) for (const y of [h * 0.25, h * 0.75]) { g.fillStyle = 'rgba(60,55,50,0.6)'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
    }, { meters: 3 }),
    // façade crème à fenêtres grillagées, affiches, tags (6 m de large, 6 m de haut : deux étages)
    facade: (tone) => canvasTex('facade' + (tone || ''), 512, 512, (g, w, h, R) => {
      const base = tone === 'rose' ? '#d8b4a4' : tone === 'gris' ? '#b8b8b2' : '#e2dcc4';
      g.fillStyle = base; g.fillRect(0, 0, w, h); noise(g, w, h, R, 7000, 0.12, true);
      for (let i = 0; i < 30; i++) { const x = R() * w, len = 40 + R() * 160; const gr = g.createLinearGradient(0, 0, 0, len); gr.addColorStop(0, 'rgba(90,80,60,0.25)'); gr.addColorStop(1, 'rgba(90,80,60,0)'); g.fillStyle = gr; g.fillRect(x, R() < 0.5 ? 0 : h / 2, 2 + R() * 6, len); }
      const gb = g.createLinearGradient(0, h * 0.82, 0, h); gb.addColorStop(0, 'rgba(60,55,40,0)'); gb.addColorStop(1, 'rgba(60,55,40,0.45)'); g.fillStyle = gb; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, h / 2 - 6, w, 6);           // bandeau d'étage
      for (const fy of [h * 0.12, h * 0.62]) for (const fx of [w * 0.16, w * 0.62]) {   // fenêtres à barreaux
        const fw = w * 0.2, fh = h * 0.22;
        g.fillStyle = '#3a3a36'; g.fillRect(fx - 4, fy - 4, fw + 8, fh + 8); g.fillStyle = '#20252a'; g.fillRect(fx, fy, fw, fh);
        g.fillStyle = 'rgba(160,190,210,0.25)'; g.fillRect(fx + 3, fy + 3, fw * 0.4, fh - 6);
        g.fillStyle = '#d9d4c4'; for (let k = 1; k < 7; k++) g.fillRect(fx + k * fw / 7 - 2, fy, 4, fh); g.fillRect(fx, fy + fh / 2 - 2, fw, 4);
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(fx - 6, fy + fh + 4, fw + 12, 5);
      }
      const posters = ['#e8e2d0', '#d84a3a', '#f2d24a', '#3a5a8a', '#f0f0ea'];
      for (let i = 0; i < 6; i++) {   // affiches collées au rez-de-chaussée
        const x = R() * w * 0.9, y = h * 0.55 + R() * h * 0.3, pw = 26 + R() * 30, ph = 34 + R() * 30; g.save(); g.translate(x, y); g.rotate((R() - 0.5) * 0.15);
        g.fillStyle = posters[Math.floor(R() * posters.length)]; g.fillRect(0, 0, pw, ph); g.fillStyle = 'rgba(0,0,0,0.55)'; for (let k = 0; k < 4; k++) g.fillRect(4, 6 + k * 8, pw * (0.4 + R() * 0.5), 3); g.restore();
      }
      g.strokeStyle = 'rgba(30,30,30,0.7)'; g.lineWidth = 4; g.lineCap = 'round';   // tags (gribouillis abstraits)
      for (let i = 0; i < 3; i++) { let x = R() * w * 0.8, y = h * 0.78 + R() * h * 0.12; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 10; k++) { x += 6 + R() * 10; y += (R() - 0.5) * 26; g.quadraticCurveTo(x - 6, y - 14 * (R() - 0.3), x, y); } g.stroke(); }
    }, { meters: 6 }),
    // immeuble d'horizon : étages réguliers, balcons, fenêtres sombres (12 m de large, 9 m : trois étages)
    immeuble: (tone) => canvasTex('imm' + tone, 512, 512, (g, w, h, R) => {
      const bases = { creme: '#e4d9bf', rose: '#d9a99a', blanc: '#e8e8e2', sable: '#cdb48a', gris: '#a9aaa6' };
      g.fillStyle = bases[tone] || bases.creme; g.fillRect(0, 0, w, h); noise(g, w, h, R, 5000, 0.12, true);
      const fl = 3, cols = 4;
      for (let f = 0; f < fl; f++) for (let c = 0; c < cols; c++) {
        const x = c * w / cols + 18, y = f * h / fl + 26, fw = w / cols - 36, fh = h / fl - 60;
        g.fillStyle = R() < 0.18 ? '#5a4a32' : '#1e252c'; g.fillRect(x, y, fw, fh);
        g.fillStyle = 'rgba(170,200,220,0.18)'; g.fillRect(x + 4, y + 4, fw * 0.45, fh - 8);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 6, y + fh, fw + 12, 10);                 // ombre de balcon
        g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(x - 8, y + fh - 4, fw + 16, 6);
        if (R() < 0.5) { g.fillStyle = 'rgba(40,40,40,0.65)'; for (let k = 0; k < 8; k++) g.fillRect(x - 6 + k * (fw + 12) / 7, y + fh - 26, 2, 24); g.fillRect(x - 6, y + fh - 28, fw + 12, 3); }
        if (R() < 0.15) { g.fillStyle = ['#c84a3a', '#3a6a9a', '#e8e0c8'][Math.floor(R() * 3)]; g.fillRect(x + fw * 0.1, y + 4, fw * 0.8, fh * 0.35); }   // store
      }
      for (let i = 0; i < 25; i++) { const x = R() * w, len = 30 + R() * 120; const gr = g.createLinearGradient(0, 0, 0, len); gr.addColorStop(0, 'rgba(80,70,60,0.22)'); gr.addColorStop(1, 'rgba(80,70,60,0)'); g.fillStyle = gr; g.fillRect(x, Math.floor(R() * 3) * h / 3 + 10, 3 + R() * 5, len); }
    }, { meters: 12 }),
    toitImm: () => canvasTex('toitImm', 256, 256, (g, w, h, R) => { g.fillStyle = '#8f8a80'; g.fillRect(0, 0, w, h); noise(g, w, h, R, 3000, 0.2, true); for (let i = 0; i < 4; i++) { g.fillStyle = '#6a665e'; g.fillRect(R() * w, R() * h, 20 + R() * 30, 14 + R() * 20); } }, { meters: 12 }),
    // barrière jersey : béton clair, salissures, bas plus sombre (3 m)
    jersey: () => canvasTex('jersey', 512, 256, (g, w, h, R) => {
      g.fillStyle = '#cfcabb'; g.fillRect(0, 0, w, h); noise(g, w, h, R, 5000, 0.2, true); noise(g, w, h, R, 2000, 0.25, false);
      const gb = g.createLinearGradient(0, h * 0.5, 0, h); gb.addColorStop(0, 'rgba(90,80,60,0)'); gb.addColorStop(1, 'rgba(90,80,60,0.5)'); g.fillStyle = gb; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 8; i++) blot(g, R() * w, R() * h, 10 + R() * 30, 'rgba(100,90,70,0.18)');
      g.fillStyle = 'rgba(60,55,50,0.5)'; g.fillRect(0, 0, 3, h); g.fillRect(w - 3, 0, 3, h);
    }, { meters: 3 }),
    // toile de jute des sacs de sable (1 m)
    jute: () => canvasTex('jute', 256, 256, (g, w, h, R) => {
      g.fillStyle = '#a69467'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 3) { g.fillStyle = `rgba(80,65,40,${0.12 + R() * 0.12})`; g.fillRect(0, y, w, 1); }
      for (let x = 0; x < w; x += 3) { g.fillStyle = `rgba(200,185,140,${0.08 + R() * 0.1})`; g.fillRect(x, 0, 1, h); }
      noise(g, w, h, R, 2500, 0.2, true);
    }, { meters: 1 }),
    // planches de caisse : lames, cadre, clous (1,2 m)
    caisse: () => canvasTex('caisse', 256, 256, (g, w, h, R) => {
      g.fillStyle = '#9c7848'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 42) { g.fillStyle = `rgb(${150 + R() * 30},${112 + R() * 25},${66 + R() * 20})`; g.fillRect(0, y, w, 40); for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(80,55,30,${R() * 0.25})`; g.fillRect(R() * w, y + R() * 40, 20 + R() * 60, 1); } g.fillStyle = 'rgba(40,25,10,0.7)'; g.fillRect(0, y + 40, w, 2); }
      g.fillStyle = '#7a5a34'; g.fillRect(0, 0, w, 20); g.fillRect(0, h - 20, w, 20); g.fillRect(0, 0, 20, h); g.fillRect(w - 20, 0, 20, h);
      g.strokeStyle = 'rgba(40,25,10,0.55)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2); g.strokeRect(20, 20, w - 40, h - 40);
      g.save(); g.translate(w / 2, h / 2); g.rotate(Math.atan2(h - 40, w - 40)); g.fillStyle = '#7a5a34'; g.fillRect(-w * 0.62, -10, w * 1.24, 20); g.restore();
      g.fillStyle = '#2a2a2a'; for (const [x, y] of [[10, 10], [w - 10, 10], [10, h - 10], [w - 10, h - 10]]) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
      g.fillStyle = 'rgba(30,20,10,0.55)'; g.font = 'bold 26px sans-serif'; g.fillText('⇧ 07-4', w * 0.3, h * 0.36);
    }, { meters: 1.2 }),
    // tôle ondulée rouillée (2,4 m)
    tole: () => canvasTex('tole', 512, 512, (g, w, h, R) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 16) { const gr = g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, '#9a9a9a'); gr.addColorStop(0.5, '#ffffff'); gr.addColorStop(1, '#8a8a8a'); g.fillStyle = gr; g.fillRect(x, 0, 16, h); }
      for (let i = 0; i < 60; i++) { const x = R() * w, len = 20 + R() * 200; const gr = g.createLinearGradient(0, 0, 0, len); gr.addColorStop(0, 'rgba(120,60,25,0.5)'); gr.addColorStop(1, 'rgba(120,60,25,0)'); g.fillStyle = gr; g.fillRect(x, R() * h, 4 + R() * 14, len); }
      for (let i = 0; i < 25; i++) blot(g, R() * w, R() * h, 8 + R() * 30, 'rgba(110,55,20,0.35)');
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6);
    }, { meters: 2.4 }),
    // pavés de place (2 m)
    paves: () => canvasTex('paves', 512, 512, (g, w, h, R) => {
      g.fillStyle = '#6b665c'; g.fillRect(0, 0, w, h); const s = 32;
      for (let y = 0; y < h; y += s) for (let x = (y / s) % 2 ? -s / 2 : 0; x < w; x += s) { const v = 140 + R() * 40; g.fillStyle = `rgb(${v},${v - 6},${v - 16})`; g.fillRect(x + 2, y + 2, s - 4, s - 4); }
      noise(g, w, h, R, 4000, 0.2, true);
    }, { meters: 2 }),
    // terre battue / sable (5 m)
    terre: () => canvasTex('terre', 512, 512, (g, w, h, R) => {
      g.fillStyle = '#a89270'; g.fillRect(0, 0, w, h); noise(g, w, h, R, 9000, 0.25, true); noise(g, w, h, R, 4000, 0.2, false);
      for (let i = 0; i < 20; i++) blot(g, R() * w, R() * h, 20 + R() * 60, `rgba(${R() < 0.5 ? '80,65,45' : '200,180,140'},0.2)`);
    }, { meters: 5 }),
    // dalles de béton de quai / entrepôt (4 m, joints)
    dalles: () => canvasTex('dalles', 512, 512, (g, w, h, R) => {
      g.fillStyle = '#8d8b85'; g.fillRect(0, 0, w, h); noise(g, w, h, R, 8000, 0.22, true); noise(g, w, h, R, 3000, 0.2, false);
      for (let i = 0; i < 8; i++) blot(g, R() * w, R() * h, 30 + R() * 60, 'rgba(50,48,44,0.18)');
      g.fillStyle = 'rgba(40,38,34,0.6)'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h);
    }, { meters: 4 }),
    tronc: () => canvasTex('tronc', 128, 256, (g, w, h, R) => { g.fillStyle = '#7a6448'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 10) { g.fillStyle = `rgba(50,38,25,${0.4 + R() * 0.3})`; g.fillRect(0, y, w, 3); g.fillStyle = 'rgba(180,160,120,0.25)'; g.fillRect(0, y + 4, w, 2); } noise(g, w, h, R, 800, 0.3, true); }, { meters: 1 }),
    palme: () => canvasTex('palme', 128, 512, (g, w, h, R) => {
      g.clearRect(0, 0, w, h); g.strokeStyle = '#5c6a2a'; g.lineWidth = 4; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
      for (let y = 10; y < h; y += 7) { const k = Math.sin(Math.PI * y / h); const len = (w / 2 - 4) * (0.35 + 0.65 * k); for (const s of [-1, 1]) { g.strokeStyle = `rgb(${60 + R() * 30},${100 + R() * 40},${40 + R() * 20})`; g.lineWidth = 3; g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w / 2 + s * len, y + 12 + R() * 6); g.stroke(); } }
    }),
  };
  // matériaux partagés (créés à la demande)
  const matCache = {};
  function mat(key, make) { return matCache[key] || (matCache[key] = make()); }
  const M = {
    beton: () => mat('beton', () => new T.MeshStandardMaterial({ map: TEX.beton(), roughness: 0.95 })),
    facade: (tone) => mat('facade' + (tone || ''), () => new T.MeshStandardMaterial({ map: TEX.facade(tone), roughness: 0.9 })),
    jersey: () => mat('jersey', () => new T.MeshStandardMaterial({ map: TEX.jersey(), roughness: 0.95 })),
    jute: () => mat('jute', () => new T.MeshStandardMaterial({ map: TEX.jute(), roughness: 1, color: 0xc9bea2 })),
    caisse: () => mat('caisse', () => new T.MeshStandardMaterial({ map: TEX.caisse(), roughness: 0.95 })),
    tole: (color) => mat('tole' + color, () => new T.MeshStandardMaterial({ map: TEX.tole(), color, roughness: 0.75, metalness: 0.25 })),
    imm: (tone) => mat('imm' + tone, () => new T.MeshStandardMaterial({ map: TEX.immeuble(tone), roughness: 0.92 })),
    toit: () => mat('toit', () => new T.MeshStandardMaterial({ map: TEX.toitImm(), roughness: 1 })),
    tronc: () => mat('tronc', () => new T.MeshStandardMaterial({ map: TEX.tronc(), roughness: 1 })),
    palme: () => mat('palme', () => new T.MeshStandardMaterial({ map: TEX.palme(), alphaTest: 0.4, side: T.DoubleSide, roughness: 0.9, color: 0x9aa880 })),
    peinture: (c) => mat('peint' + c, () => new T.MeshStandardMaterial({ color: c, roughness: 0.32, metalness: 0.35 })),
    vitre: () => mat('vitre', () => new T.MeshStandardMaterial({ color: 0x1a232b, roughness: 0.08, metalness: 0.85 })),
    pneu: () => mat('pneu', () => new T.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 })),
    jante: () => mat('jante', () => new T.MeshStandardMaterial({ color: 0xa9adb0, roughness: 0.35, metalness: 0.8 })),
    feu: () => mat('feu', () => new T.MeshBasicMaterial({ color: 0xf6f0d8 })), feuR: () => mat('feuR', () => new T.MeshBasicMaterial({ color: 0xa8201a })),
    plastique: () => mat('plast', () => new T.MeshStandardMaterial({ color: 0x2a2b2c, roughness: 0.7 })),
    fut: (c) => mat('fut' + c, () => new T.MeshStandardMaterial({ map: TEX.tole(), color: c, roughness: 0.6, metalness: 0.45 })),
  };
  // boîte à coordonnées de texture « monde » : la texture garde sa taille réelle quelle que soit la boîte
  function box(w, h, d, meters) {
    const geo = new T.BoxGeometry(w, h, d); const uv = geo.attributes.uv, m = meters || 2;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];   // faces +x, -x, +y, -y, +z, -z
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / m, uv.getY(i) * dims[f][1] / m); }
    uv.needsUpdate = true; return geo;
  }
  // ---- modèles --------------------------------------------------------------------------------------------------------
  // barrière jersey : profil trapézoïdal extrudé, posée dans la longueur de la boîte
  function jersey(o) {
    const g = new T.Group(), along = o.d > o.w, L = Math.max(o.w, o.d), W = Math.min(o.w, o.d), H = o.h, n = Math.max(1, Math.round(L / 3));
    const s = new T.Shape(); const b = W / 2, t = Math.min(b, 0.15);
    s.moveTo(-b, 0); s.lineTo(b, 0); s.lineTo(b * 0.92, H * 0.12); s.lineTo(t * 1.15, H * 0.35); s.lineTo(t, H); s.lineTo(-t, H); s.lineTo(-t * 1.15, H * 0.35); s.lineTo(-b * 0.92, H * 0.12); s.closePath();
    const seg = L / n;
    for (let k = 0; k < n; k++) {
      const geo = new T.ExtrudeGeometry(s, { depth: seg - 0.06, bevelEnabled: false }); geo.translate(0, -H / 2, -seg / 2 + 0.03);
      const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 3, uv.getY(i) / 3 * 2);
      const m = new T.Mesh(geo, M.jersey()); m.position.z = -L / 2 + seg * (k + 0.5); g.add(m);
    }
    if (!along) g.rotation.y = Math.PI / 2;
    return g;
  }
  // sacs de sable : rangées de sacs ronds, décalées d'une rangée à l'autre
  const bagGeo = (() => { let gg = null; return () => { if (gg) return gg; gg = new T.SphereGeometry(0.5, 12, 8); gg.scale(0.62, 0.24, 0.38); const p = gg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); p.setXYZ(i, Math.sign(x) * Math.min(Math.abs(x) * 1.18, 0.31), y, Math.sign(z) * Math.min(Math.abs(z) * 1.15, 0.19)); } gg.computeVertexNormals(); const uv = gg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i)); return gg; }; })();
  function sandbags(o) {
    const g = new T.Group(), along = o.w >= o.d, L = Math.max(o.w, o.d), D = Math.min(o.w, o.d), rows = Math.max(2, Math.round(o.h / 0.24)), rh = o.h / rows;
    const R = rng(Math.round(o.x * 13 + o.z * 7));
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? 0.3 : 0, n = Math.floor((L - off) / 0.58);
      for (let k = 0; k < n; k++) for (let dz = 0; dz < Math.max(1, Math.round(D / 0.42)); dz++) {
        const m = new T.Mesh(bagGeo(), M.jute()); const x = -L / 2 + off + 0.3 + k * 0.58, z = -D / 2 + 0.21 + dz * 0.42;
        m.position.set(along ? x : z, -o.h / 2 + rh * (r + 0.5), along ? z : x); m.rotation.y = (along ? 0 : Math.PI / 2) + (R() - 0.5) * 0.12; m.scale.y = rh / 0.26 * (0.95 + R() * 0.1);
        g.add(m);
      }
    }
    return g;
  }
  // fût métallique à nervures
  function barrel(o, i) {
    const g = new T.Group(), r = Math.min(o.w, o.d) / 2, cols = [0x2f5a8a, 0xb8902a, 0x3d5a3a, 0x8a2e24];
    const body = new T.Mesh(new T.CylinderGeometry(r, r, o.h, 18), M.fut(cols[i % cols.length])); g.add(body);
    for (const y of [-0.3, 0, 0.3]) { const rib = new T.Mesh(new T.TorusGeometry(r * 1.01, 0.025, 6, 20), M.fut(cols[i % cols.length])); rib.rotation.x = Math.PI / 2; rib.position.y = y * o.h; g.add(rib); }
    const top = new T.Mesh(new T.CylinderGeometry(r * 0.96, r * 0.96, 0.02, 18), M.plastique()); top.position.y = o.h / 2; g.add(top);
    return g;
  }
  // voiture : silhouette de berline (ou de pick-up) extrudée sur la largeur, vitrage, roues, feux ; blanches surtout
  const CAR_COLORS = [0xe6e6e2, 0xdadcd8, 0xf0efe8, 0xb9bec2, 0xe9e4d4, 0x8c9296, 0xeeeeea, 0x6a2a24, 0xd4d6d2, 0x2c3a48, 0xe2e0d8];
  function car(o, i, kind) {
    const g = new T.Group(), along = o.d >= o.w, L = Math.max(o.w, o.d), W = Math.min(o.w, o.d), H = o.h;
    const paint = M.peinture(kind === 'bus' ? 0xeceeef : CAR_COLORS[(i * 5 + Math.round(o.x * 3 + o.z)) % CAR_COLORS.length]);
    const wr = kind === 'car' ? 0.3 : 0.44, pick = kind === 'car' && (i % 4 === 1);
    const side = (pts) => { const s = new T.Shape(); pts.forEach(([x, y], k) => k ? s.lineTo(x, y) : s.moveTo(x, y)); s.closePath(); return s; };
    const ext = (shape, width, material, x0) => { const geo = new T.ExtrudeGeometry(shape, { depth: width, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 }); geo.translate(0, 0, -width / 2); const m = new T.Mesh(geo, material); m.rotation.y = -Math.PI / 2; m.position.x = x0 || 0; g.add(m); return m; };
    if (kind === 'car') {
      const l = L / 2, y0 = -H / 2 + wr * 0.55, hb = H * 0.48;
      // bas de caisse : capot et coffre légèrement inclinés
      ext(side([[-l, y0], [l, y0], [l, y0 + hb * 0.78], [l * 0.55, y0 + hb], [-l * 0.62, y0 + hb], [-l, y0 + hb * 0.85]]), W * 0.94, paint);
      if (pick) {   // pick-up : cabine courte à l'avant, plateau ouvert à l'arrière
        ext(side([[l * 0.5, y0 + hb], [-l * 0.12, y0 + hb], [-l * 0.08, H / 2 - 0.06], [l * 0.25, H / 2 - 0.06]]), W * 0.86, M.vitre());
        ext(side([[l * 0.3, H / 2 - 0.08], [-l * 0.1, H / 2 - 0.08], [-l * 0.1, H / 2 - 0.02], [l * 0.28, H / 2 - 0.02]]), W * 0.8, paint);
        for (const s of [-1, 1]) { const rail = new T.Mesh(new T.BoxGeometry(0.06, 0.28, l * 0.85), paint); rail.position.set(s * W * 0.44, y0 + hb + 0.14, -l * 0.55); g.add(rail); }
      } else {
        ext(side([[l * 0.48, y0 + hb], [-l * 0.55, y0 + hb], [-l * 0.38, H / 2 - 0.05], [l * 0.22, H / 2 - 0.05]]), W * 0.84, M.vitre());
        ext(side([[l * 0.2, H / 2 - 0.07], [-l * 0.36, H / 2 - 0.07], [-l * 0.36, H / 2], [l * 0.2, H / 2]]), W * 0.8, paint);
      }
      for (const s of [-1, 1]) {
        const hl = new T.Mesh(new T.BoxGeometry(0.26, 0.09, 0.03), M.feu()); hl.position.set(s * W * 0.33, y0 + hb * 0.62, l + 0.03); g.add(hl);
        const tl = new T.Mesh(new T.BoxGeometry(0.22, 0.1, 0.03), M.feuR()); tl.position.set(s * W * 0.34, y0 + hb * 0.68, -l - 0.03); g.add(tl);
      }
      const bump = new T.Mesh(new T.BoxGeometry(W * 0.96, 0.12, 0.12), M.plastique()); bump.position.set(0, y0 + 0.12, l + 0.02); g.add(bump); const b2 = bump.clone(); b2.position.z = -l - 0.02; g.add(b2);
    } else {   // fourgon / bus : grande caisse arrondie, bandeau vitré
      const l = L / 2, y0 = -H / 2 + wr * 0.6;
      ext(side([[-l, y0], [l, y0], [l, H / 2 - 0.5], [l - 0.4, H / 2 - 0.05], [-l, H / 2 - 0.05]]), W * 0.96, paint);
      for (const s of [-1, 1]) { const v = new T.Mesh(new T.BoxGeometry(0.03, H * 0.24, L * (kind === 'bus' ? 0.86 : 0.4)), M.vitre()); v.position.set(s * W * 0.49, H * 0.18, kind === 'bus' ? 0 : l * 0.5); g.add(v); }
      const ws = new T.Mesh(new T.BoxGeometry(W * 0.86, H * 0.32, 0.03), M.vitre()); ws.position.set(0, H * 0.16, l + 0.01); g.add(ws);
      if (kind === 'bus') for (const s of [-1, 1]) { const band = new T.Mesh(new T.BoxGeometry(0.03, 0.12, L * 0.9), M.peinture(0x3a7a9a)); band.position.set(s * W * 0.49, -H * 0.1, 0); g.add(band); }
    }
    const wheel = new T.CylinderGeometry(wr, wr, 0.24, 16), rim = new T.CylinderGeometry(wr * 0.55, wr * 0.55, 0.25, 12);
    for (const s of [-1, 1]) for (const f of [-1, 1]) { const w = new T.Mesh(wheel, M.pneu()); w.rotation.z = Math.PI / 2; w.position.set(s * W * 0.44, -H / 2 + wr, f * L * (kind === 'car' ? 0.31 : 0.34)); g.add(w); const rr = new T.Mesh(rim, M.jante()); rr.rotation.z = Math.PI / 2; rr.position.copy(w.position); g.add(rr); }
    if (!along) g.rotation.y = Math.PI / 2;
    if (i % 3 === 2 && kind === 'car') g.rotation.y += (i % 2 ? 0.12 : -0.1);   // garées un peu de travers
    return g;
  }
  // palmier : tronc annelé légèrement courbé, couronne de palmes retombantes
  function palm(o, i) {
    const g = new T.Group(), H = o.h, R = rng(i * 31 + 7), lean = (R() - 0.5) * 0.25;
    const trunk = new T.Mesh(new T.CylinderGeometry(0.14, 0.22, H, 10, 6), M.tronc()); const p = trunk.geometry.attributes.position;
    for (let v = 0; v < p.count; v++) { const y = p.getY(v) / H + 0.5; p.setX(v, p.getX(v) + Math.sin(y * 1.6) * lean * H * 0.3); } trunk.geometry.computeVertexNormals(); g.add(trunk);
    const top = new T.Vector3(Math.sin(1.6) * lean * H * 0.3, H / 2, 0);
    for (let k = 0; k < 11; k++) {
      const leaf = new T.Mesh(new T.PlaneGeometry(0.8, 2.5, 1, 6), M.palme()); const pos = leaf.geometry.attributes.position;
      for (let v = 0; v < pos.count; v++) { const y = pos.getY(v); pos.setZ(v, -Math.pow((y + 1.25) / 2.5, 2) * 1.2); }
      leaf.geometry.computeVertexNormals();
      const pivot = new T.Group(); pivot.position.copy(top); pivot.rotation.y = k * Math.PI * 2 / 11 + R() * 0.3; leaf.position.set(0, 0, 1.15); leaf.rotation.x = -Math.PI / 2 + 0.25 + R() * 0.3; pivot.add(leaf); g.add(pivot);
    }
    return g;
  }
  // immeuble d'horizon : bloc à façades texturées, toit, petits édicules
  function building(w, h, d, tone) {
    const g = new T.Group(); const fac = M.imm(tone);
    const body = new T.Mesh(box(w, h, d, 12), [fac, fac, M.toit(), M.toit(), fac, fac]);
    const uv = body.geometry.attributes.uv; for (const f of [0, 1, 4, 5]) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setY(i, uv.getY(i) * 12 / 9); }   // 3 étages par 9 m
    body.position.y = h / 2; g.add(body);
    const par = new T.Mesh(new T.BoxGeometry(w + 0.3, 0.6, d + 0.3), M.toit()); par.position.y = h + 0.3; g.add(par);
    if (w > 8) { const s = new T.Mesh(new T.BoxGeometry(3, 2.4, 3), M.imm(tone)); s.position.set(w * 0.2, h + 1.2, -d * 0.15); g.add(s); }
    return g;
  }
  // horizon : une ceinture d'immeubles autour de la carte (à 14–45 m du bord), palmiers dans les rues
  function skyline(map, style) {
    const g = new T.Group(), R = rng(map.width * 7 + map.depth * 3 + (map.id || '').length);
    const tones = style === 'ville' ? ['creme', 'rose', 'blanc', 'creme', 'sable', 'rose'] : style === 'industrie' ? ['gris', 'sable', 'creme', 'gris'] : ['creme', 'sable', 'gris', 'blanc'];
    const W = map.width, D = map.depth, ring = [];
    const place = (x, z, w, d, h) => { const b = building(w, h, d, tones[Math.floor(R() * tones.length)]); b.position.set(x, 0, z); g.add(b); ring.push(b); };
    for (const side of [0, 1, 2, 3]) {
      const len = side % 2 ? D + 60 : W + 60; let s = -30;
      while (s < len - 30) {
        const w = 10 + R() * 14, h = (style === 'industrie' ? 8 : 12) + R() * (style === 'ville' ? 26 : 14), d = 10 + R() * 8, gap = 2 + R() * 6, off = 16 + R() * 18;
        const c = s + w / 2;
        if (side === 0) place(c, -off - d / 2, w, d, h); else if (side === 2) place(c, D + off + d / 2, w, d, h);
        else if (side === 1) place(W + off + d / 2, c, d, w, h); else place(-off - d / 2, c, d, w, h);
        s += w + gap;
      }
    }
    if (style === 'ville') for (let k = 0; k < 18; k++) {   // palmiers le long des rues autour
      const t = R(), sd = Math.floor(R() * 4), off = 6 + R() * 6; let x, z;
      if (sd === 0) { x = -20 + t * (W + 40); z = -off; } else if (sd === 2) { x = -20 + t * (W + 40); z = D + off; } else if (sd === 1) { x = W + off; z = -20 + t * (D + 40); } else { x = -off; z = -20 + t * (D + 40); }
      const p = palm({ h: 7 + R() * 4 }, k); p.position.set(x, (7 + R() * 4) / 2, z); g.add(p);
    }
    return g;
  }
  // sol de la carte : texture répétée (asphalte, dalles, pavés, terre) + marquages propres à la carte, peints par-dessus
  function ground(map, style) {
    const base = style === 'parking' ? TEX.asphalte() : style === 'place' ? TEX.paves() : style === 'raffinerie' ? TEX.terre() : TEX.dalles();
    const m = base.userData.meters || 4, W = map.width, D = map.depth;
    const geo = new T.PlaneGeometry(W, D); const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * W / m, uv.getY(i) * D / m);
    const meshes = [new T.Mesh(geo, new T.MeshStandardMaterial({ map: base, roughness: 1 }))];
    // marquages : un canevas transparent à l'échelle de la carte
    const c = document.createElement('canvas'), px = 16; c.width = W * px; c.height = D * px; const gc = c.getContext('2d');
    if (style === 'parking') {   // places de stationnement (lignes blanches), flèches, bande jaune
      gc.strokeStyle = 'rgba(235,235,225,0.75)'; gc.lineWidth = 0.14 * px;
      for (const zRow of [D * 0.22, D * 0.5, D * 0.78]) for (let x = 6; x < W - 6; x += 2.6) { gc.beginPath(); gc.moveTo(x * px, (zRow - 2.4) * px); gc.lineTo(x * px, (zRow + 2.4) * px); gc.stroke(); }
      gc.strokeStyle = 'rgba(225,190,60,0.7)'; gc.lineWidth = 0.2 * px; gc.setLineDash([1.5 * px, 1 * px]);
      for (const zl of [D * 0.36, D * 0.64]) { gc.beginPath(); gc.moveTo(4 * px, zl * px); gc.lineTo((W - 4) * px, zl * px); gc.stroke(); }
    } else if (style === 'entrepot' || style === 'gare') {
      gc.strokeStyle = 'rgba(220,180,60,0.55)'; gc.lineWidth = 0.25 * px; gc.setLineDash([2 * px, 1.2 * px]);
      for (const x of [W * 0.2, W * 0.8]) { gc.beginPath(); gc.moveTo(x * px, D * 0.08 * px); gc.lineTo(x * px, D * 0.92 * px); gc.stroke(); }
    }
    // taches d'usure et d'huile un peu partout
    const R = rng(W * 11 + D);
    for (let k = 0; k < 40; k++) { const x = R() * c.width, y = R() * c.height, r = (0.6 + R() * 2.2) * px; const gr = gc.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(20,18,15,0.28)'); gr.addColorStop(1, 'rgba(20,18,15,0)'); gc.fillStyle = gr; gc.fillRect(x - r, y - r, 2 * r, 2 * r); }
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; t.__ground = true;
    meshes.push(new T.Mesh(new T.PlaneGeometry(W, D), new T.MeshStandardMaterial({ map: t, transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 })));
    for (const me of meshes) { me.rotation.x = -Math.PI / 2; me.position.set(W / 2, 0.005, D / 2); me.receiveShadow = true; }
    meshes[1].position.y = 0.01; meshes[1].__ground = true;
    return meshes;
  }
  // ciel de jour : dégradé bleu pâle → blanc brumeux, halo du soleil
  function skyTexture() {
    return canvasTex('ciel', 8, 512, (g, w, h) => {
      const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#6f93b8'); grd.addColorStop(0.35, '#9ab6cf'); grd.addColorStop(0.5, '#cfdbe2'); grd.addColorStop(0.56, '#e6e2d4'); grd.addColorStop(0.6, '#b8b2a2'); grd.addColorStop(1, '#6a665c');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    });
  }
  root.Decor = { TEX, M, box, jersey, sandbags, barrel, car, palm, building, skyline, ground, skyTexture };
})(window.OT = window.OT || {});
