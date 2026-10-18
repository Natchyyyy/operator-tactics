// Parking du centre commercial, version « haut de gamme » : tout ce qui se voit autour de la simulation (la simulation garde
// ses boîtes ; ici on ne fait que les habiller et ajouter un monde autour).
//  - textures procédurales calculées au chargement (pas de fichiers) : asphalte (granulats, pores, relief), béton
//    (pores, banches), avec cartes de relief (normales) ; tuilage cassé par un second échantillon à une autre échelle ;
//  - sol du parking : un matériau physique modifié (onBeforeCompile) qui mélange le détail en coordonnées du monde et des
//    cartes à l'échelle du terrain : marquages peints usés, crasse le long des murs et des places, taches d'huile, traces de
//    pneus, fissures, plaques d'égout, flaques ; sous l'eau le sol est plus sombre, lisse et plat ;
//  - flaques : vraie réflexion plane (Reflector) masquée par la carte des flaques, avec effet de Fresnel ;
//  - murs d'enceinte en panneaux de béton préfabriqués (joints, chaperon, coulures) ; façade du centre commercial
//    (bandeau vitré, auvent, enseigne fictive, portes vitrées) ; abri des caisses ; butées de parking ;
//  - autour : trottoirs et bordures, rues avec marquages, passages piétons, lampadaires, palmiers, voitures garées,
//    immeubles avec fenêtres vitrées (reflets), balcons, climatiseurs et châteaux d'eau sur les toits, panneaux publicitaires
//    (marques fictives) ; de nuit, lampadaires et fenêtres allumés.
(function (root) {
  const T = window.THREE;
  // ---------------------------------------------------------------------------------------------
  // Bruit (valeur, fractal), tuilable
  // ---------------------------------------------------------------------------------------------
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function lattice(n, seed) { const R = rng(seed), a = new Float32Array(n * n); for (let i = 0; i < a.length; i++) a[i] = R(); return a; }
  // bruit de valeur tuilable sur une grille de période p (en cellules), évalué en (x, y) ∈ [0, p)
  function vnoise(L, p, x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const x0 = ((xi % p) + p) % p, y0 = ((yi % p) + p) % p, x1 = (x0 + 1) % p, y1 = (y0 + 1) % p;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = L[y0 * p + x0], b = L[y0 * p + x1], c = L[y1 * p + x0], d = L[y1 * p + x1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  // champ fractal N×N tuilable : octaves de période base, base·2, …
  function fbmField(N, base, oct, seed, gain) {
    const out = new Float32Array(N * N); gain = gain || 0.5; let amp = 1, tot = 0;
    for (let o = 0; o < oct; o++) {
      const p = base << o, L = lattice(p, seed + o * 101), k = p / N;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) out[y * N + x] += amp * vnoise(L, p, x * k, y * k);
      tot += amp; amp *= gain;
    }
    for (let i = 0; i < out.length; i++) out[i] /= tot;
    return out;
  }
  // carte de normales tuilable à partir d'une hauteur (différences centrées), force k
  function normalsFrom(H, N, k) {
    const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), img = g.createImageData(N, N), d = img.data;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const l = H[y * N + (x + N - 1) % N], r = H[y * N + (x + 1) % N], u = H[((y + N - 1) % N) * N + x], dn = H[((y + 1) % N) * N + x];
      let nx = (l - r) * k, ny = (u - dn) * k, nz = 1; const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
      const i = (y * N + x) * 4; d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0); return c;
  }
  const texCache = {};
  function tex(canvas, srgb, repeat) {
    const t = new T.CanvasTexture(canvas); t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace; t.anisotropy = 16;
    t.wrapS = t.wrapT = repeat === false ? T.ClampToEdgeWrapping : T.RepeatWrapping; t.generateMipmaps = true; t.minFilter = T.LinearMipmapLinearFilter; return t;
  }
  // ---------------------------------------------------------------------------------------------
  // Asphalte : granulats clairs et sombres dans un liant noir, pores, léger relief ; 1024 px pour 4 m
  // ---------------------------------------------------------------------------------------------
  function asphalt() {
    if (texCache.asph) return texCache.asph;
    const N = 1024, R = rng(77);
    const base = fbmField(N, 8, 6, 11, 0.55), fine = fbmField(N, 64, 3, 23, 0.6);
    const H = new Float32Array(N * N), col = new Float32Array(N * N * 3);
    for (let i = 0; i < N * N; i++) { H[i] = fine[i] * 0.6 + base[i] * 0.2; const v = 0.105 + (base[i] - 0.5) * 0.035 + (fine[i] - 0.5) * 0.03; col[i * 3] = v * 1.02; col[i * 3 + 1] = v; col[i * 3 + 2] = v * 0.95; }
    // granulats : petits cailloux (disques bombés) de teintes variées
    for (let k = 0; k < 20000; k++) {
      const cx = R() * N, cy = R() * N, r = 1 + Math.pow(R(), 2.4) * 4.5, tone = R(), lum = tone < 0.05 ? 0.28 + R() * 0.08 : tone < 0.3 ? 0.16 + R() * 0.07 : 0.085 + R() * 0.06;
      const warm = R() < 0.3 ? 0.012 : 0;
      for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const dx = x - cx, dy = y - cy, d2 = (dx * dx + dy * dy) / (r * r); if (d2 > 1) continue;
        const xx = ((x % N) + N) % N, yy = ((y % N) + N) % N, i = yy * N + xx, h = Math.sqrt(1 - d2);
        H[i] = Math.max(H[i], 0.45 + h * 0.55 * (0.6 + r / 10));
        const a = Math.min(1, h * 1.6); col[i * 3] += (lum + warm - col[i * 3]) * a; col[i * 3 + 1] += (lum - col[i * 3 + 1]) * a; col[i * 3 + 2] += (lum - warm - col[i * 3 + 2]) * a;
      }
    }
    // pores : petits creux sombres
    for (let k = 0; k < 9000; k++) {
      const cx = Math.floor(R() * N), cy = Math.floor(R() * N), r = 1 + Math.floor(R() * 2);
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { if (x * x + y * y > r * r) continue; const i = (((cy + y) % N + N) % N) * N + (((cx + x) % N + N) % N); H[i] -= 0.35; col[i * 3] *= 0.55; col[i * 3 + 1] *= 0.55; col[i * 3 + 2] *= 0.55; }
    }
    const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), img = g.createImageData(N, N), d = img.data;
    const toS = (v) => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
    for (let i = 0; i < N * N; i++) { d[i * 4] = toS(Math.min(1, col[i * 3])); d[i * 4 + 1] = toS(Math.min(1, col[i * 3 + 1])); d[i * 4 + 2] = toS(Math.min(1, col[i * 3 + 2])); d[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
    return (texCache.asph = { map: tex(c, true), normal: tex(normalsFrom(H, N, 1.7), false), meters: 4 });
  }
  // ---------------------------------------------------------------------------------------------
  // Béton : gris chaud, pores, nuages de teinte, banches (lignes de coffrage) ; 1024 px pour 3 m
  // ---------------------------------------------------------------------------------------------
  function concrete(tone) {
    const key = 'beton' + (tone || ''); if (texCache[key]) return texCache[key];
    const N = 1024, R = rng(tone === 'clair' ? 91 : 93);
    const big = fbmField(N, 4, 6, 31 + (tone === 'clair' ? 7 : 0), 0.55), fine = fbmField(N, 128, 2, 37, 0.6);
    const H = new Float32Array(N * N), base = tone === 'clair' ? [0.52, 0.5, 0.46] : [0.36, 0.35, 0.33];
    const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), img = g.createImageData(N, N), d = img.data;
    const toS = (v) => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055);
    for (let i = 0; i < N * N; i++) {
      const v = 1 + (big[i] - 0.5) * 0.35 + (fine[i] - 0.5) * 0.12; H[i] = fine[i] * 0.3 + big[i] * 0.1;
      d[i * 4] = toS(base[0] * v); d[i * 4 + 1] = toS(base[1] * v); d[i * 4 + 2] = toS(base[2] * v); d[i * 4 + 3] = 255;
    }
    for (let k = 0; k < 7000; k++) { const x = Math.floor(R() * N), y = Math.floor(R() * N), r = R() < 0.9 ? 1 : 2; for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) { const i = (((y + yy) % N + N) % N) * N + (((x + xx) % N + N) % N); H[i] -= 0.5; d[i * 4] *= 0.62; d[i * 4 + 1] *= 0.62; d[i * 4 + 2] *= 0.62; } }
    g.putImageData(img, 0, 0);
    return (texCache[key] = { map: tex(c, true), normal: tex(normalsFrom(H, N, 2.0), false), meters: 3 });
  }
  // ---------------------------------------------------------------------------------------------
  // Matériau à détail en coordonnées du monde (anti-tuilage), pour les surfaces verticales et le trottoir
  // ---------------------------------------------------------------------------------------------
  function worldMat(det, opts) {
    opts = opts || {};
    const m = new T.MeshStandardMaterial({ color: opts.color || 0xffffff, roughness: opts.roughness === undefined ? 0.9 : opts.roughness, metalness: 0 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.tDet = { value: det.map }; sh.uniforms.tDetN = { value: det.normal }; sh.uniforms.uM = { value: det.meters }; sh.uniforms.uBump = { value: opts.bump === undefined ? 1 : opts.bump };
      sh.uniforms.uStreak = { value: opts.streak || 0 };
      sh.vertexShader = 'varying vec3 vWP; varying vec3 vWN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(position, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * normal);');
      sh.fragmentShader = 'uniform sampler2D tDet, tDetN; uniform float uM, uBump, uStreak; varying vec3 vWP; varying vec3 vWN;\n' +
        'vec3 triS(sampler2D t, vec3 p, vec3 w) { return texture2D(t, p.zy).rgb * w.x + texture2D(t, p.xz).rgb * w.y + texture2D(t, p.xy).rgb * w.z; }\n' +
        sh.fragmentShader.replace('#include <map_fragment>', `
          vec3 tw = pow(abs(vWN), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
          vec3 pw = vWP / uM;
          vec3 dcol = mix(triS(tDet, pw, tw), triS(tDet, pw * 0.37 + 0.31, tw), 0.35);
          // coulures sous les arêtes (murs) : traînées verticales plus sombres
          float sx = (vWP.x + vWP.z) * 1.3; float st = uStreak * smoothstep(0.55, 1.0, fract(sin(floor(sx) * 12.9898) * 43758.5453) * (0.6 + 0.4 * sin(fract(sx) * 3.1416))) * (1.0 - tw.y) * smoothstep(0.0, 2.5, vWP.y);
          diffuseColor.rgb *= dcol * (1.0 - st * 0.22);`)
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          { vec3 nt; vec3 nw;
            if (tw.y > 0.5) { nt = texture2D(tDetN, pw.xz).xyz * 2.0 - 1.0; nw = vec3(nt.x * uBump, sign(vWN.y), nt.y * uBump); }
            else if (tw.x > tw.z) { nt = texture2D(tDetN, pw.zy).xyz * 2.0 - 1.0; nw = vec3(sign(vWN.x), nt.y * uBump, nt.x * uBump); }
            else { nt = texture2D(tDetN, pw.xy).xyz * 2.0 - 1.0; nw = vec3(nt.x * uBump, nt.y * uBump, sign(vWN.z)); }
            normal = normalize((viewMatrix * vec4(normalize(nw), 0.0)).xyz); }`);
    };
    m.customProgramCacheKey = () => 'worldMat' + (opts.streak ? 's' : '');
    return m;
  }
  // ---------------------------------------------------------------------------------------------
  // Cartes à l'échelle du terrain : peinture (sRGB, alpha = couverture) et données (R crasse, G eau, B huile/pneus)
  // ---------------------------------------------------------------------------------------------
  const PX = 40;   // pixels par mètre
  function groundMaps(map) {
    const W = map.width, D = map.depth, cw = Math.round(W * PX), ch = Math.round(D * PX), R = rng(4242);
    // --- peinture
    const pc = document.createElement('canvas'); pc.width = cw; pc.height = ch; const p = pc.getContext('2d');
    const M = (v) => v * PX;
    p.lineCap = 'butt';
    const white = 'rgba(205,203,194,1)', yellow = 'rgba(214,170,48,1)';
    // places de stationnement : trois rangées de places (traits en épi droit), des deux côtés, sauf dans l'enclos central
    const rows = [D * 0.22, D * 0.5, D * 0.78];
    p.strokeStyle = white; p.lineWidth = M(0.12);
    for (const zr of rows) for (let x = 5.2; x < W - 5; x += 2.6) {
      if (x > 27.5 && x < 44.5 && zr === rows[1]) continue;
      p.beginPath(); p.moveTo(M(x), M(zr - 2.5)); p.lineTo(M(x), M(zr + 2.5)); p.stroke();
    }
    for (const zr of rows) { p.beginPath(); p.moveTo(M(5.2), M(zr)); p.lineTo(M(W - 5.2), M(zr)); p.stroke(); }
    // allées : lignes jaunes discontinues et flèches de circulation
    p.strokeStyle = yellow; p.lineWidth = M(0.15); p.setLineDash([M(3), M(2)]);
    for (const zl of [D * 0.36, D * 0.64]) { p.beginPath(); p.moveTo(M(3), M(zl)); p.lineTo(M(W - 3), M(zl)); p.stroke(); }
    p.setLineDash([]);
    p.fillStyle = white;
    const arrow = (x, z, dir) => { p.save(); p.translate(M(x), M(z)); p.rotate(dir); p.beginPath(); p.moveTo(M(-1.6), M(-0.18)); p.lineTo(M(0.4), M(-0.18)); p.lineTo(M(0.4), M(-0.55)); p.lineTo(M(1.6), 0); p.lineTo(M(0.4), M(0.55)); p.lineTo(M(0.4), M(0.18)); p.lineTo(M(-1.6), M(0.18)); p.closePath(); p.fill(); p.restore(); };
    for (const x of [10, 22, 50, 62]) { arrow(x, D * 0.36 - 1.4, 0); arrow(x, D * 0.64 + 1.4, Math.PI); }
    // passage piéton devant l'entrée du centre commercial et zone hachurée
    p.fillStyle = white; for (let x = 28; x < 44; x += 1.0) p.fillRect(M(x), M(5.6), M(0.5), M(2.6));
    p.strokeStyle = yellow; p.lineWidth = M(0.12);
    for (const [x0, z0, w, h] of [[2, 2, 6, 3], [W - 8, D - 5, 6, 3], [2, D - 5, 6, 3], [W - 8, 2, 6, 3]]) {
      p.strokeRect(M(x0), M(z0), M(w), M(h)); p.save(); p.beginPath(); p.rect(M(x0), M(z0), M(w), M(h)); p.clip();
      for (let k = -h; k < w; k += 0.7) { p.beginPath(); p.moveTo(M(x0 + k), M(z0 + h)); p.lineTo(M(x0 + k + h), M(z0)); p.stroke(); }
      p.restore();
    }
    // inscriptions au sol (lettres peintes)
    p.font = `bold ${M(1.1)}px Arial`; p.textAlign = 'center'; p.fillStyle = white;
    for (const [x, z, t, r] of [[36, 9.6, 'SORTIE', 0], [6.5, D * 0.5, 'A', -Math.PI / 2], [W - 6.5, D * 0.5, 'B', Math.PI / 2]]) { p.save(); p.translate(M(x), M(z)); p.rotate(r); p.fillText(t, 0, 0); p.restore(); }
    // usure de la peinture : on gomme selon un bruit fractal à deux échelles
    const er = document.createElement('canvas'); er.width = cw; er.height = ch; const e = er.getContext('2d'), eimg = e.createImageData(cw, ch), ed = eimg.data;
    const N1 = 256, F1 = fbmField(N1, 16, 5, 501, 0.6), F2 = fbmField(N1, 64, 3, 503, 0.6);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const a = F1[(y % N1) * N1 + (x % N1)], b = F2[((y * 3) % N1) * N1 + ((x * 3) % N1)];
      const wear = Math.min(1, Math.max(0, (a * 0.7 + b * 0.5 - 0.42) * 2.6)); const i = (y * cw + x) * 4; ed[i + 3] = wear * 255;
    }
    e.putImageData(eimg, 0, 0); p.globalCompositeOperation = 'destination-out'; p.drawImage(er, 0, 0); p.globalCompositeOperation = 'source-over';
    // --- données : R crasse, G eau (flaques), B huile / pneus
    const dc = document.createElement('canvas'); dc.width = cw; dc.height = ch; const g = dc.getContext('2d');
    g.fillStyle = 'rgb(40,0,0)'; g.fillRect(0, 0, cw, ch);
    g.globalCompositeOperation = 'lighter';
    // crasse le long des murs (où rien ne roule) et sous les obstacles
    const grime = (x, z, rx, rz, a) => { const gr = g.createRadialGradient(M(x), M(z), 0, M(x), M(z), M(Math.max(rx, rz))); gr.addColorStop(0, `rgba(${a},0,0,1)`); gr.addColorStop(1, 'rgba(0,0,0,1)'); g.save(); g.translate(M(x), M(z)); g.scale(rx / Math.max(rx, rz), rz / Math.max(rx, rz)); g.translate(-M(x), -M(z)); g.fillStyle = gr; g.fillRect(M(x - Math.max(rx, rz)), M(z - Math.max(rx, rz)), M(2 * Math.max(rx, rz)), M(2 * Math.max(rx, rz))); g.restore(); };
    for (let x = 0; x < W; x += 1.5) { grime(x, 0.2, 2.2, 1.6, 70); grime(x, D - 0.2, 2.2, 1.6, 70); }
    for (let z = 0; z < D; z += 1.5) { grime(0.2, z, 1.6, 2.2, 70); grime(W - 0.2, z, 1.6, 2.2, 70); }
    for (const o of map.obstacles) if (o.x >= 0 && o.z >= 0 && o.x + o.w <= W && o.z + o.d <= D) grime(o.x + o.w / 2, o.z + o.d / 2, o.w / 2 + 1.2, o.d / 2 + 1.2, 55);
    for (let k = 0; k < 90; k++) grime(R() * W, R() * D, 0.8 + R() * 3, 0.8 + R() * 3, 18 + R() * 25);
    // huile sous les voitures garées et au milieu des places
    for (const zr of rows) for (let x = 6.5; x < W - 5; x += 2.6) if (R() < 0.55) {
      const cx = x + 0.1 * (R() - 0.5), cz = zr + (R() < 0.5 ? -1 : 1) * (1.0 + R() * 0.6), r = 0.25 + R() * 0.5;
      const gr = g.createRadialGradient(M(cx), M(cz), 0, M(cx), M(cz), M(r)); gr.addColorStop(0, 'rgba(0,0,180,1)'); gr.addColorStop(0.6, 'rgba(0,0,90,1)'); gr.addColorStop(1, 'rgba(0,0,0,1)'); g.fillStyle = gr; g.beginPath(); g.ellipse(M(cx), M(cz), M(r), M(r * (0.6 + R() * 0.6)), R() * 3, 0, 7); g.fill();
    }
    // traces de pneus : arcs dans les allées
    g.lineWidth = M(0.22); g.lineCap = 'round';
    for (let k = 0; k < 40; k++) {
      const zl = (R() < 0.5 ? D * 0.36 : D * 0.64) + (R() - 0.5) * 3, x = 4 + R() * (W - 8), L = 3 + R() * 9, bend = (R() - 0.5) * 0.4, a = 10 + R() * 30;
      g.strokeStyle = `rgba(0,0,${a},1)`;
      for (const off of [-0.8, 0.8]) { g.beginPath(); g.moveTo(M(x), M(zl + off)); g.quadraticCurveTo(M(x + L / 2), M(zl + off + bend * L), M(x + L), M(zl + off + bend * L * 1.6)); g.stroke(); }
    }
    g.globalCompositeOperation = 'source-over';
    // eau : flaques dans les creux (bruit fractal seuillé, autour de quelques points bas)
    const img = g.getImageData(0, 0, cw, ch), dd = img.data;
    const NP = 512, P1 = fbmField(NP, 8, 5, 777, 0.55), P2 = fbmField(NP, 32, 3, 779, 0.5);
    const lows = []; for (let k = 0; k < 9; k++) lows.push([4 + R() * (W - 8), 6 + R() * (D - 12), 2.5 + R() * 3.5]);
    lows.push([36, 12.5, 4], [20, 30, 3.5], [55, 20, 3]);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const wx = x / PX, wz = y / PX; let low = 0;
      for (const [lx, lz, lr] of lows) { const d2 = ((wx - lx) ** 2 + (wz - lz) ** 2) / (lr * lr); if (d2 < 1) low = Math.max(low, 1 - d2); }
      if (low <= 0) continue;
      const u = Math.floor(wx / 12 * NP) % NP, v = Math.floor(wz / 12 * NP) % NP;
      const n = P1[v * NP + u] * 0.75 + P2[((v * 2) % NP) * NP + ((u * 2) % NP)] * 0.35;
      const w = Math.min(1, Math.max(0, (low * 0.85 + n - 0.95) * 4.5));
      dd[(y * cw + x) * 4 + 1] = w * 255;
    }
    g.putImageData(img, 0, 0);
    const paint = new T.CanvasTexture(pc); paint.colorSpace = T.SRGBColorSpace; paint.flipY = false; paint.anisotropy = 16;
    const data = new T.CanvasTexture(dc); data.colorSpace = T.NoColorSpace; data.flipY = false; data.anisotropy = 8;
    return { paint, data };
  }
  // ---------------------------------------------------------------------------------------------
  // Sol du parking
  // ---------------------------------------------------------------------------------------------
  function groundMesh(map, maps, U) {
    const W = map.width, D = map.depth, A = asphalt();
    const m = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { tDet: { value: A.map }, tDetN: { value: A.normal }, tPaint: { value: maps.paint }, tData: { value: maps.data }, uSize: { value: new T.Vector2(W, D) }, uM: { value: A.meters }, uWet: U.wet });
      sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(position, 1.0)).xyz;');
      sh.fragmentShader = 'uniform sampler2D tDet, tDetN, tPaint, tData; uniform vec2 uSize; uniform float uM, uWet; varying vec3 vWP;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `
          vec2 duv = vWP.xz / uM;
          vec3 det = mix(texture2D(tDet, duv).rgb, texture2D(tDet, duv * 0.29 + vec2(0.13, 0.71)).rgb, 0.4);
          vec2 muv = clamp(vWP.xz / uSize, 0.0, 1.0);
          vec4 gdat = texture2D(tData, muv); vec4 gp = texture2D(tPaint, muv);
          float grime = gdat.r, oil = gdat.b, wet = max(gdat.g, uWet * (0.35 + 0.65 * gdat.g));
          float pool = smoothstep(0.55, 0.8, wet);
          vec3 col = det * (1.0 - grime * 0.42) * (1.0 - oil * 0.65);
          col = mix(col, gp.rgb * (1.0 - grime * 0.25), gp.a);
          col *= mix(1.0, 0.5, smoothstep(0.05, 0.6, wet));
          diffuseColor.rgb = col;`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(mix(0.93, 0.8, gp.a), 0.55, smoothstep(0.05, 0.55, wet));
          roughnessFactor = mix(roughnessFactor, 0.12, pool); roughnessFactor = mix(roughnessFactor, 0.35, oil * 0.6);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          { vec3 nt = texture2D(tDetN, duv).xyz * 2.0 - 1.0; float bump = (1.0 - pool) * (1.0 - gp.a * 0.5);
            vec3 nw = normalize(vec3(nt.x * bump, 1.0, nt.y * bump));
            normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz); }`);
    };
    m.customProgramCacheKey = () => 'solParking';
    const ge = new T.PlaneGeometry(W, D, 1, 1); const mesh = new T.Mesh(ge, m);
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(W / 2, 0, D / 2); mesh.receiveShadow = true; mesh.userData.keep = true;
    return mesh;
  }
  // flaques : réflexion plane masquée par la carte d'eau
  function puddles(map, maps, U) {
    const X = window.THREEX; if (!X || !X.Reflector) return null;
    const W = map.width, D = map.depth;
    const shader = {
      uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, tData: { value: maps.data }, uSize: { value: new T.Vector2(W, D) }, uWet: U.wet, time: U.time },
      vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vWP;
        void main() { vUv = textureMatrix * vec4(position, 1.0); vWP = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D tDiffuse, tData; uniform vec2 uSize; uniform float uWet, time; varying vec4 vUv; varying vec3 vWP;
        void main() {
          vec2 muv = clamp(vWP.xz / uSize, 0.0, 1.0); float g = texture2D(tData, muv).g; float wet = max(g, uWet * g * 1.2);
          float m = smoothstep(0.6, 0.85, wet); if (m < 0.01) discard;
          // légère ondulation de la surface (vent, pluie)
          vec2 rip = vec2(sin(vWP.x * 9.0 + time * 1.7) + sin(vWP.z * 7.0 - time * 1.3), cos(vWP.x * 8.0 - time * 1.1) + sin(vWP.z * 11.0 + time * 2.1)) * (0.0006 + uWet * 0.003);
          vec4 pr = vUv; pr.xy += rip * pr.w;
          vec3 refl = min(texture2DProj(tDiffuse, pr).rgb, vec3(6.0));
          vec3 V = normalize(cameraPosition - vWP); float f = 0.02 + 0.98 * pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);
          // eau sombre (fond de flaque) + reflet selon Fresnel
          vec3 water = vec3(0.012, 0.014, 0.016);
          gl_FragColor = vec4(mix(water, refl * 0.85, clamp(f * 1.6 + 0.08, 0.0, 1.0)), m * 0.94);
        }`,
    };
    const r = new X.Reflector(new T.PlaneGeometry(W, D), { shader, textureWidth: 1024, textureHeight: 1024, clipBias: 0.003, multisample: 4 });
    r.material.transparent = true; r.material.depthWrite = false;
    r.rotation.x = -Math.PI / 2; r.position.set(W / 2, 0.004, D / 2); r.userData.keep = true; r.renderOrder = 1;
    const ob = r.onBeforeRender; r.onBeforeRender = function (renderer, scene, camera) { if (scene.overrideMaterial || camera.isOrthographicCamera) return; const rt = renderer.getRenderTarget(); if (rt && rt.__reflet) return; ob.call(this, renderer, scene, camera); };
    r.getRenderTarget().__reflet = true;
    return r;
  }
  // ---------------------------------------------------------------------------------------------
  // Pièces du décor de la simulation, habillées
  // ---------------------------------------------------------------------------------------------
  const MATS = {};
  const mat = (k, f) => MATS[k] || (MATS[k] = f());
  const M3 = () => ({
    beton: mat('beton', () => worldMat(concrete(), { roughness: 0.92, streak: 1 })),
    betonClair: mat('betonClair', () => worldMat(concrete('clair'), { roughness: 0.88, streak: 0.6 })),
    joint: mat('joint', () => new T.MeshStandardMaterial({ color: 0x23211e, roughness: 1 })),
    metal: mat('metal', () => new T.MeshStandardMaterial({ color: 0x6d7276, roughness: 0.42, metalness: 0.85 })),
    metalSombre: mat('metalSombre', () => new T.MeshStandardMaterial({ color: 0x2b2e31, roughness: 0.5, metalness: 0.7 })),
    verre: mat('verre', () => new T.MeshStandardMaterial({ color: 0x1b2a33, roughness: 0.04, metalness: 0.9, envMapIntensity: 1.4 })),
    verreClair: mat('verreClair', () => new T.MeshStandardMaterial({ color: 0x5f7684, roughness: 0.06, metalness: 0.6, transparent: true, opacity: 0.55 })),
    jaune: mat('jaune', () => new T.MeshStandardMaterial({ color: 0xd8a62a, roughness: 0.6 })),
    caoutchouc: mat('caoutchouc', () => new T.MeshStandardMaterial({ color: 0x151515, roughness: 0.85 })),
    enseigne: mat('enseigne', () => new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2dc, emissiveIntensity: 0.0, roughness: 0.4 })),
  });
  // mur d'enceinte : panneaux préfabriqués de 3 m (joints creux), chaperon débordant, semelle
  function wall(o) {
    const K = M3(), g = new T.Group(), along = o.w >= o.d, L = along ? o.w : o.d, th = along ? o.d : o.w, n = Math.max(1, Math.round(L / 3));
    for (let k = 0; k < n; k++) {
      const seg = L / n - 0.04, p = new T.Mesh(new T.BoxGeometry(along ? seg : th * 0.92, o.h - 0.2, along ? th * 0.92 : seg), K.beton);
      const off = -L / 2 + (k + 0.5) * L / n; p.position.set(along ? off : 0, -0.1, along ? 0 : off); g.add(p);
    }
    const j = new T.Mesh(new T.BoxGeometry(along ? L : th * 0.7, o.h - 0.2, along ? th * 0.7 : L), K.joint); j.position.y = -0.1; g.add(j);
    const cap = new T.Mesh(new T.BoxGeometry(along ? L + 0.1 : th + 0.18, 0.2, along ? th + 0.18 : L + 0.1), K.betonClair); cap.position.y = o.h / 2 - 0.1; g.add(cap);
    const foot = new T.Mesh(new T.BoxGeometry(along ? L : th + 0.1, 0.12, along ? th + 0.1 : L), K.betonClair); foot.position.y = -o.h / 2 + 0.06; g.add(foot);
    return g;
  }
  // texture de façade du centre commercial (panneaux, bandeau vitré) et enseigne fictive
  function signTex(text, sub) {
    const c = document.createElement('canvas'); c.width = 2048; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#1b2733'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#f4efe2'; g.font = 'bold 150px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, c.width / 2, 115);
    if (sub) { g.font = '48px Arial'; g.fillStyle = '#d8b25a'; g.fillText(sub, c.width / 2, 210); }
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; return t;
  }
  function mall(o) {
    const K = M3(), g = new T.Group(), W = o.w, H = o.h, Dp = o.d;
    // corps (avancée de l'entrée) : béton clair, bandeau vitré en partie basse, enseigne au-dessus, auvent métallique
    const body = new T.Mesh(new T.BoxGeometry(W, H, Dp), K.betonClair); g.add(body);
    const glassH = 3.0, gl = new T.Mesh(new T.BoxGeometry(W - 1.2, glassH, 0.08), K.verre); gl.position.set(0, -H / 2 + glassH / 2 + 0.1, Dp / 2 + 0.03); g.add(gl);
    for (let x = -W / 2 + 0.6; x <= W / 2 - 0.6 + 1e-6; x += (W - 1.2) / 8) { const mu = new T.Mesh(new T.BoxGeometry(0.12, glassH, 0.16), K.metal); mu.position.set(x, -H / 2 + glassH / 2 + 0.1, Dp / 2 + 0.05); g.add(mu); }
    const tr = new T.Mesh(new T.BoxGeometry(W - 1.2, 0.14, 0.18), K.metal); tr.position.set(0, -H / 2 + glassH + 0.1, Dp / 2 + 0.05); g.add(tr);
    // portes automatiques au centre (cadre sombre)
    const door = new T.Mesh(new T.BoxGeometry(3.2, 2.5, 0.1), K.metalSombre); door.position.set(0, -H / 2 + 1.25 + 0.1, Dp / 2 + 0.07); g.add(door);
    const dg = new T.Mesh(new T.BoxGeometry(2.9, 2.3, 0.04), K.verreClair); dg.position.set(0, -H / 2 + 1.25 + 0.1, Dp / 2 + 0.13); g.add(dg);
    const awn = new T.Mesh(new T.BoxGeometry(W - 0.4, 0.18, 1.8), K.metalSombre); awn.position.set(0, -H / 2 + glassH + 0.45, Dp / 2 + 0.9); g.add(awn);
    for (const sx of [-1, 1]) { const st = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, glassH + 0.4, 10), K.metal); st.position.set(sx * (W / 2 - 1), -H / 2 + (glassH + 0.4) / 2, Dp / 2 + 1.6); g.add(st); }
    const sign = new T.Mesh(new T.PlaneGeometry(W * 0.62, W * 0.62 / 8), new T.MeshStandardMaterial({ map: signTex('GALERIE DU PORT', 'BOUTIQUES · RESTAURANTS · PARKING'), roughness: 0.5, emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0 }));
    sign.position.set(0, H / 2 - 1.2, Dp / 2 + 0.03); sign.userData.signe = true; g.add(sign);
    const cor = new T.Mesh(new T.BoxGeometry(W + 0.2, 0.35, Dp + 0.2), K.metal); cor.position.y = H / 2 - 0.17; g.add(cor);
    return g;
  }
  // abri des caisses (bloque la vue) : socle béton, parois de panneaux composites, bandeau vitré opaque, toit débordant
  function booth(o) {
    const K = M3(), g = new T.Group(), along = o.w >= o.d, L = along ? o.w : o.d, th = along ? o.d : o.w;
    const sx = (a, b) => along ? a : b, sz = (a, b) => along ? b : a;
    const base = new T.Mesh(new T.BoxGeometry(sx(L, th), 0.9, sz(L, th)), K.betonClair); base.position.y = -o.h / 2 + 0.45; g.add(base);
    const panel = mat('panneau', () => new T.MeshStandardMaterial({ color: 0x8b9298, roughness: 0.55, metalness: 0.35 }));
    const wallM = new T.Mesh(new T.BoxGeometry(sx(L - 0.1, th - 0.1), o.h - 1.25, sz(L - 0.1, th - 0.1)), panel); wallM.position.y = -o.h / 2 + 0.9 + (o.h - 1.25) / 2; g.add(wallM);
    for (const s of [-1, 1]) { const band = new T.Mesh(new T.BoxGeometry(sx(L - 0.6, 0.05), 0.75, sz(L - 0.6, 0.05)), K.verre); band.position.set(along ? 0 : s * (th / 2 - 0.02), o.h / 2 - 0.85, along ? s * (th / 2 - 0.02) : 0); g.add(band); }
    const roof = new T.Mesh(new T.BoxGeometry(sx(L + 0.8, th + 0.8), 0.22, sz(L + 0.8, th + 0.8)), K.metalSombre); roof.position.y = o.h / 2 - 0.11; g.add(roof);
    for (let k = -1; k <= 1; k += 2) for (const s of [-1, 1]) { const pole = new T.Mesh(new T.BoxGeometry(0.12, o.h, 0.12), K.metal); pole.position.set(along ? k * (L / 2 - 0.1) : s * (th / 2 + 0.02), 0, along ? s * (th / 2 + 0.02) : k * (L / 2 - 0.1)); g.add(pole); }
    return g;
  }
  // muret : béton clair, chanfreins
  function lowWall(o) { const K = M3(); const m = new T.Mesh(new T.BoxGeometry(o.w, o.h, o.d), K.betonClair); const g = new T.Group(); g.add(m); const cap = new T.Mesh(new T.BoxGeometry(o.w + 0.08, 0.08, o.d + 0.08), K.betonClair); cap.position.y = o.h / 2 - 0.04; g.add(cap); return g; }
  // bac à fleurs : jardinière en béton, terre, petites plantes
  function planter(o) {
    const K = M3(), g = new T.Group();
    const outer = new T.Mesh(new T.BoxGeometry(o.w, o.h, o.d), K.betonClair); g.add(outer);
    const soil = new T.Mesh(new T.BoxGeometry(o.w - 0.2, 0.05, o.d - 0.2), mat('terre', () => new T.MeshStandardMaterial({ color: 0x3a2c20, roughness: 1 }))); soil.position.y = o.h / 2 - 0.08; g.add(soil);
    const leaf = mat('buis', () => new T.MeshStandardMaterial({ color: 0x3f5a2a, roughness: 0.85 }));
    const R = rng(Math.floor(o.x * 13 + o.z * 7));
    for (let k = 0; k < 7; k++) { const b = new T.Mesh(new T.IcosahedronGeometry(0.18 + R() * 0.14, 1), leaf); b.position.set((R() - 0.5) * (o.w - 0.4), o.h / 2 + 0.06, (R() - 0.5) * (o.d - 0.4)); b.scale.y = 0.7; g.add(b); }
    return g;
  }
  // ---------------------------------------------------------------------------------------------
  // Monde autour : trottoirs, rues, lampadaires, immeubles, palmiers, voitures garées
  // ---------------------------------------------------------------------------------------------
  function facadeTex(seed, tone) {
    const key = 'fac' + seed + tone; if (texCache[key]) return texCache[key];
    const R = rng(seed), W = 512, H = 1024, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const rc = document.createElement('canvas'); rc.width = W; rc.height = H; const r = rc.getContext('2d');
    const ec = document.createElement('canvas'); ec.width = W; ec.height = H; const e = ec.getContext('2d');
    const walls = { creme: ['#d9cdb3', '#c9bc9f'], rose: ['#d4a99a', '#c39586'], blanc: ['#e3e0d8', '#cfcbc1'], sable: ['#c8b48e', '#b7a27b'], gris: ['#a9aaa6', '#97989a'] }[tone] || ['#d0c6b0', '#bfb59e'];
    const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, walls[0]); grd.addColorStop(1, walls[1]); g.fillStyle = grd; g.fillRect(0, 0, W, H);
    r.fillStyle = '#e6e6e6'; r.fillRect(0, 0, W, H); e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
    // coulures et taches
    for (let k = 0; k < 60; k++) { g.fillStyle = `rgba(60,50,40,${0.03 + R() * 0.05})`; const x = R() * W; g.fillRect(x, R() * H, 2 + R() * 10, 40 + R() * 200); }
    // grille de fenêtres : 4 colonnes × 8 étages par tuile ; volets, balcons
    const cols = 4, rows = 8, cw = W / cols, rh = H / rows;
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const x = col * cw + cw * 0.18, y = row * rh + rh * 0.22, w = cw * 0.64, h = rh * 0.56;
      const lit = R() < 0.35, shut = R() < 0.25;
      g.fillStyle = '#202a33'; g.fillRect(x, y, w, h);
      r.fillStyle = '#0a0a0a'; r.fillRect(x, y, w, h);   // vitre : très lisse
      // reflet du ciel doux dans la vitre
      const vg = g.createLinearGradient(x, y, x, y + h); vg.addColorStop(0, 'rgba(150,175,195,0.35)'); vg.addColorStop(1, 'rgba(40,50,60,0.1)'); g.fillStyle = vg; g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(30,30,30,0.6)'; g.fillRect(x + w / 2 - 1, y, 2, h);   // montant
      if (shut) { g.fillStyle = R() < 0.5 ? '#8a7a62' : '#6e7a80'; g.fillRect(x, y, w, h * (0.4 + R() * 0.6)); r.fillStyle = '#cccccc'; r.fillRect(x, y, w, h * 0.6); }
      if (lit) { e.fillStyle = `rgb(${200 + R() * 55},${160 + R() * 50},${90 + R() * 50})`; e.fillRect(x + 2, y + 2, w - 4, h - 4); }
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 2, y + h, w + 4, 4);   // appui
      if (row % 2 === 1 && R() < 0.5) { g.fillStyle = 'rgba(70,70,70,0.9)'; g.fillRect(col * cw + 4, y + h + 2, cw - 8, rh * 0.08); for (let k = 0; k < 8; k++) g.fillRect(col * cw + 6 + k * (cw - 12) / 7, y + h - rh * 0.12, 2, rh * 0.14); }
      if (R() < 0.12) { g.fillStyle = '#d7d7d2'; g.fillRect(x + w * 0.65, y + h + 6, w * 0.3, rh * 0.12); }   // climatiseur
    }
    const map = new T.CanvasTexture(c); map.colorSpace = T.SRGBColorSpace; map.anisotropy = 8; map.wrapS = map.wrapT = T.RepeatWrapping;
    const rough = new T.CanvasTexture(rc); rough.wrapS = rough.wrapT = T.RepeatWrapping;
    const emi = new T.CanvasTexture(ec); emi.colorSpace = T.SRGBColorSpace; emi.wrapS = emi.wrapT = T.RepeatWrapping;
    return (texCache[key] = { map, rough, emi, tileW: 14, tileH: 26 });
  }
  const NIGHT = { on: false, mats: [] };
  function building(w, h, d, tone, seed) {
    const F = facadeTex(seed % 4, tone), g = new T.Group();
    const fm = new T.MeshStandardMaterial({ map: F.map, roughnessMap: F.rough, roughness: 1, metalness: 0.1, emissiveMap: F.emi, emissive: 0xffffff, emissiveIntensity: 0 });
    NIGHT.mats.push(fm);
    const roof = mat('toitImm', () => worldMat(concrete(), { roughness: 0.95 }));
    const geo = new T.BoxGeometry(w, h, d); const uv = geo.attributes.uv;
    // UV en mètres (faces latérales) : la tuile de façade fait F.tileW × F.tileH m
    for (let f = 0; f < 6; f++) { if (f === 2 || f === 3) continue; const fw = (f < 2 ? d : w); for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * fw / F.tileW, uv.getY(i) * h / F.tileH); } }
    const body = new T.Mesh(geo, [fm, fm, roof, roof, fm, fm]); body.position.y = h / 2; g.add(body);
    const par = new T.Mesh(new T.BoxGeometry(w + 0.3, 0.7, d + 0.3), roof); par.position.y = h + 0.35; g.add(par);
    const R = rng(seed * 31 + 7), K = M3();
    // toit : climatiseurs, château d'eau, antennes
    for (let k = 0; k < 3 + Math.floor(R() * 4); k++) { const a = new T.Mesh(new T.BoxGeometry(1 + R(), 0.8 + R() * 0.5, 1 + R()), mat('clim', () => new T.MeshStandardMaterial({ color: 0xc8c8c2, roughness: 0.6, metalness: 0.3 }))); a.position.set((R() - 0.5) * (w - 3), h + 0.5, (R() - 0.5) * (d - 3)); g.add(a); }
    if (R() < 0.5) { const t = new T.Mesh(new T.CylinderGeometry(1.1, 1.1, 2.2, 14), K.metal); t.position.set((R() - 0.5) * (w - 4), h + 1.8, (R() - 0.5) * (d - 4)); g.add(t); }
    if (R() < 0.6) { const an = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 4, 5), K.metal); an.position.set((R() - 0.5) * (w - 2), h + 2.5, (R() - 0.5) * (d - 2)); g.add(an); }
    // rez-de-chaussée : vitrines sombres
    const shop = new T.Mesh(new T.BoxGeometry(w + 0.02, 3.2, d + 0.02), K.verre); shop.position.y = 1.6; g.add(shop);
    const band = new T.Mesh(new T.BoxGeometry(w + 0.1, 0.5, d + 0.1), K.betonClair); band.position.y = 3.45; g.add(band);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }
  function billboard(text, sub, colA, colB) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 384; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 1024, 384); gr.addColorStop(0, colA); gr.addColorStop(1, colB); g.fillStyle = gr; g.fillRect(0, 0, 1024, 384);
    g.fillStyle = 'rgba(255,255,255,0.12)'; for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(800 + k * 30, 190, 150 - k * 20, 0, 7); g.fill(); }
    g.fillStyle = '#fff'; g.font = 'bold 110px Arial'; g.fillText(text, 50, 180); g.font = '44px Arial'; g.fillText(sub, 54, 260);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; return t;
  }
  function streetLamp() {
    const K = M3(), g = new T.Group();
    const pole = new T.Mesh(new T.CylinderGeometry(0.07, 0.11, 8, 10), K.metalSombre); pole.position.y = 4; g.add(pole);
    const arm = new T.Mesh(new T.BoxGeometry(1.8, 0.08, 0.08), K.metalSombre); arm.position.set(0.85, 7.9, 0); g.add(arm);
    const head = new T.Mesh(new T.BoxGeometry(0.7, 0.14, 0.3), K.metalSombre); head.position.set(1.7, 7.85, 0); g.add(head);
    const bulb = new T.Mesh(new T.BoxGeometry(0.6, 0.03, 0.22), mat('ampoule', () => new T.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xffd9a0, emissiveIntensity: 0 }))); bulb.position.set(1.7, 7.77, 0); g.add(bulb);
    NIGHT.mats.push(bulb.material); g.userData.lightAt = new T.Vector3(1.7, 7.7, 0);
    return g;
  }
  function stopBlock() { return new T.Mesh(new T.BoxGeometry(1.4, 0.11, 0.18), mat('butee', () => worldMat(concrete(), { roughness: 0.9, color: 0x9a9690 }))); }
  // ---------------------------------------------------------------------------------------------
  // Assemblage
  // ---------------------------------------------------------------------------------------------
  const U = { wet: { value: 0 }, time: { value: 0 } };
  let lights = [];
  function build(map, group, ctx) {
    NIGHT.mats.length = 0; lights = [];
    const W = map.width, D = map.depth, K = M3(), maps = groundMaps(map);
    group.add(groundMesh(map, maps, U));
    const pud = puddles(map, maps, U); if (pud) group.add(pud);
    // butées de parking devant les places (visuelles : 13 cm de haut)
    const rows = [D * 0.22, D * 0.5, D * 0.78], blocked = (x, z) => map.obstacles.some(o => x > o.x - 0.6 && x < o.x + o.w + 0.6 && z > o.z - 0.6 && z < o.z + o.d + 0.6);
    for (const zr of rows) for (let x = 6.5; x < W - 5; x += 2.6) for (const s of [-1, 1]) {
      if (x > 27.5 && x < 44.5 && zr === rows[1]) continue;
      const z = zr + s * 2.15; if (blocked(x, z)) continue;
      const b = stopBlock(); b.position.set(x, 0.065, z); b.rotation.y = Math.PI / 2; b.receiveShadow = b.castShadow = true; group.add(b);
    }
    // trottoir et bordure tout autour (4 m), puis rue (10 m), puis trottoir d'en face (4 m)
    const side = mat('trottoir', () => worldMat(concrete('clair'), { roughness: 0.9 }));
    const road = mat('rue', () => { const A = asphalt(); const m = worldMat(A, { roughness: 0.9, bump: 0.8 }); m.color.setHex(0xd8d8d8); return m; });
    const ring = (inner, width, m, y) => {
      const x0 = -inner, z0 = -inner, x1 = W + inner, z1 = D + inner, t = width;
      for (const [cx, cz, w, d] of [[(x0 + x1) / 2, z0 - t / 2, x1 - x0 + 2 * t, t], [(x0 + x1) / 2, z1 + t / 2, x1 - x0 + 2 * t, t], [x0 - t / 2, (z0 + z1) / 2, t, z1 - z0], [x1 + t / 2, (z0 + z1) / 2, t, z1 - z0]]) {
        const s = new T.Mesh(new T.BoxGeometry(w, y * 2, d), m); s.position.set(cx, y - y, cz); s.position.y = 0; s.receiveShadow = true; group.add(s);
      }
    };
    ring(1, 4, side, 0.14);
    ring(5, 10, road, 0.01);
    ring(15, 4, side, 0.14);
    // marquages de la rue : lignes discontinues au centre, passages piétons aux coins
    const lineM = mat('ligneRue', () => new T.MeshStandardMaterial({ color: 0xe8e6dc, roughness: 0.75 }));
    const dash = (x, z, w, d) => { const m = new T.Mesh(new T.PlaneGeometry(w, d), lineM); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.022, z); m.receiveShadow = true; group.add(m); };
    for (let x = -18; x < W + 18; x += 4) { dash(x, -10, 2, 0.15); dash(x, D + 10, 2, 0.15); }
    for (let z = -6; z < D + 6; z += 4) { dash(-10, z, 0.15, 2); dash(W + 10, z, 0.15, 2); }
    for (const [cx, cz, vert] of [[-10, -2, true], [W + 10, D + 2, true], [W / 2, -10, false]]) for (let k = -3; k <= 3; k++) dash(cx + (vert ? k * 1.1 : k * 0.9), cz + (vert ? 0 : 0), vert ? 0.55 : 0.45, vert ? 3.8 : 3.8);
    // lampadaires le long des trottoirs
    const lampAt = (x, z, rot) => { const l = streetLamp(); l.position.set(x, 0.14, z); l.rotation.y = rot; l.traverse(o => { if (o.isMesh) o.castShadow = true; }); group.add(l); const p = l.userData.lightAt.clone().applyAxisAngle(new T.Vector3(0, 1, 0), rot).add(l.position); lights.push(p); };
    for (let x = -6; x <= W + 6; x += 14) { lampAt(x, -3.2, -Math.PI / 2); lampAt(x, D + 3.2, Math.PI / 2); }
    for (let z = 6; z <= D - 6; z += 14) { lampAt(-3.2, z, Math.PI); lampAt(W + 3.2, z, 0); }
    // immeubles tout autour
    const R = rng(2026), tones = ['creme', 'rose', 'blanc', 'sable', 'creme', 'gris'];
    const place = (x, z, w, d, h, s) => { const b = building(w, h, d, tones[Math.floor(R() * tones.length)], s); b.position.set(x, 0.14, z); group.add(b); };
    let s = 0;
    for (const sd of [0, 1, 2, 3]) {
      const len = sd % 2 ? D + 60 : W + 60; let t = -30;
      while (t < len - 30) {
        const w = 12 + R() * 12, d = 12 + R() * 8, h = 14 + R() * 30, gap = 3 + R() * 5, off = 19 + d / 2 + R() * 2, c = t + w / 2;
        if (sd === 0 && c > 6 && c < W - 6) { t += w + gap; continue; }   // au nord : le centre commercial
        if (sd === 0) place(c, -off, w, d, h, s++); else if (sd === 2) place(c, D + off, w, d, h, s++);
        else if (sd === 1) place(W + off, c, d, w, h, s++); else place(-off, c, d, w, h, s++);
        t += w + gap;
      }
    }
    // le centre commercial lui-même : grand volume derrière le mur nord
    const mallBody = new T.Group(); const mb = new T.Mesh(new T.BoxGeometry(W - 8, 13, 30), K.betonClair); mb.position.set(W / 2, 6.5 + 0.14, -16 - 15 + 4); mallBody.add(mb);
    const band = new T.Mesh(new T.BoxGeometry(W - 8.2, 3.5, 0.3), K.verre); band.position.set(W / 2, 9.5, -16 + 4 + 0.05 - 0.2); mallBody.add(band);
    for (let k = 0; k < 2; k++) { const bb = new T.Mesh(new T.PlaneGeometry(9, 3.4), new T.MeshStandardMaterial({ map: billboard(k ? 'NOVA' : 'SOLARIS', k ? 'La nouvelle saison est là' : 'Votre été commence ici', k ? '#21416b' : '#b4492f', k ? '#5aa1c9' : '#e9a23b'), roughness: 0.5, emissiveIntensity: 0 })); bb.position.set(W / 2 + (k ? 18 : -18), 9.5, -16 + 4 + 0.2); mallBody.add(bb); NIGHT.mats.push(bb.material); }
    mallBody.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } }); group.add(mallBody);
    // palmiers et voitures garées le long des rues (modèles Meshy si chargés)
    const M3d = ctx && ctx.M3;
    if (M3d && M3d.has('palmier')) for (let k = 0; k < 22; k++) {
      const sd = k % 4, t = R(); let x, z;
      if (sd === 0) { x = -14 + t * (W + 28); z = -17; } else if (sd === 2) { x = -14 + t * (W + 28); z = D + 17; } else if (sd === 1) { x = W + 17; z = -10 + t * (D + 20); } else { x = -17; z = -10 + t * (D + 20); }
      const p = M3d.fit('palmier', 3, 7 + R() * 4, 3, { byHeight: true, rot: k }); p.children[0].position.y = 0; p.position.set(x, 0.14, z); p.traverse(o => { if (o.isMesh) { o.castShadow = true; o.userData.keep = true; } }); group.add(p);
    }
    if (M3d && M3d.has('berline')) {
      const kinds = ['berline', 'pickup', 'fourgon', 'berline'];
      for (let k = 0; k < 26; k++) {
        const sd = k % 4, t = (Math.floor(k / 4) + 0.5 + (R() - 0.5) * 0.4) / 7; let x, z, rot;
        if (sd === 0) { x = -12 + t * (W + 24); z = -6.3; rot = 0; } else if (sd === 2) { x = -12 + t * (W + 24); z = D + 6.3; rot = Math.PI; }
        else if (sd === 1) { x = W + 6.3; z = -6 + t * (D + 12); rot = Math.PI / 2; } else { x = -6.3; z = -6 + t * (D + 12); rot = -Math.PI / 2; }
        const kd = kinds[k % kinds.length]; if (!M3d.has(kd)) continue;
        const c = M3d.fit(kd, kd === 'fourgon' ? 5.2 : 4.4, kd === 'fourgon' ? 2.3 : 1.45, kd === 'fourgon' ? 2.1 : 1.9, { flip: k % 2 === 0, tol: 0.3 });
        c.position.set(x, (kd === 'fourgon' ? 2.3 : 1.45) / 2, z); c.rotation.y = rot; c.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.userData.keep = true; } }); group.add(c);
      }
    }
    if (M3d && M3d.has('abribus')) { const a = M3d.fit('abribus', 4.5, 2.6, 1.6, { tol: 0.3 }); a.position.set(W / 2 + 10, 1.3 + 0.14, D + 16.6); a.rotation.y = Math.PI; a.traverse(o => { if (o.isMesh) { o.castShadow = true; o.userData.keep = true; } }); group.add(a); }
  }
  // une pièce de la simulation habillée (null : laisser le jeu la dessiner)
  function mesh(o) {
    const n = o.name || '';
    if (/^mur (nord|sud|est|ouest)/.test(n)) return wall(o);
    if (n.startsWith('centre commercial')) return mall(o);
    if (n.startsWith('abri')) return booth(o);
    if (n.startsWith('muret')) return lowWall(o);
    if (n.startsWith('bac à fleurs')) return planter(o);
    return null;
  }
  // nuit : fenêtres, lampadaires, enseignes allumés ; lumières ponctuelles des lampadaires ; pluie : sol mouillé
  let lightGroup = null;
  function setConditions(id, scene) {
    const night = id === 'nuit'; NIGHT.on = night;
    for (const m of NIGHT.mats) m.emissiveIntensity = night ? (m.map && m.emissiveMap ? 1.6 : 4) : 0;
    U.wet.value = id === 'pluie' ? 1 : id === 'brouillard' ? 0.35 : 0;
    if (lightGroup) { scene.remove(lightGroup); lightGroup = null; }
    if (night) { lightGroup = new T.Group(); for (const p of lights) { const l = new T.PointLight(0xffc98a, 120, 28, 1.6); l.position.copy(p); lightGroup.add(l); } scene.add(lightGroup); }
  }
  function tick(t) { U.time.value = t; }
  root.Parking = { build, mesh, setConditions, tick, asphalt, concrete, worldMat };
})(window.OT = window.OT || {});
