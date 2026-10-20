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
  function normalsFrom(H, N, k, NH) {   // N : largeur, NH : hauteur (carré par défaut)
    NH = NH || N;
    const c = document.createElement('canvas'); c.width = N; c.height = NH; const g = c.getContext('2d'), img = g.createImageData(N, NH), d = img.data;
    for (let y = 0; y < NH; y++) for (let x = 0; x < N; x++) {
      const l = H[y * N + (x + N - 1) % N], r = H[y * N + (x + 1) % N], u = H[((y + NH - 1) % NH) * N + x], dn = H[((y + 1) % NH) * N + x];
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
  // uniformes d'un « détail » : ceux de pbr.js (textures scannées chargées à chaud) ou, à défaut, des textures procédurales
  function detU(det) { return det.u || (det.u = { tDet: { value: det.map }, tDetN: { value: det.normal }, tDetR: { value: det.normal }, uM: { value: det.meters }, gain: { value: 1 }, hasR: { value: 0 }, mix: { value: 0.35 } }); }
  const PBRdet = (cle, proc) => root.PBR ? root.PBR.det(cle, proc) : proc;
  function worldMat(det, opts) {
    opts = opts || {};
    const m = new T.MeshStandardMaterial({ color: opts.color || 0xffffff, roughness: opts.roughness === undefined ? 0.9 : opts.roughness, metalness: 0 });
    m.onBeforeCompile = (sh) => {
      const du = detU(det); Object.assign(sh.uniforms, { tDet: du.tDet, tDetN: du.tDetN, tDetR: du.tDetR, uM: du.uM, uGain: du.gain, uHasR: du.hasR, uMix: du.mix }); sh.uniforms.uBump = { value: opts.bump === undefined ? 1 : opts.bump };
      sh.uniforms.uStreak = { value: opts.streak || 0 };
      sh.vertexShader = 'varying vec3 vWP; varying vec3 vWN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(position, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * normal);');
      sh.fragmentShader = 'uniform sampler2D tDet, tDetN, tDetR; uniform float uM, uBump, uStreak, uGain, uHasR, uMix; varying vec3 vWP; varying vec3 vWN;\n' +
        'vec3 triS(sampler2D t, vec3 p, vec3 w) { return texture2D(t, p.zy).rgb * w.x + texture2D(t, p.xz).rgb * w.y + texture2D(t, p.xy).rgb * w.z; }\n' +
        sh.fragmentShader.replace('#include <map_fragment>', `
          vec3 tw = pow(abs(vWN), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
          vec3 pw = vWP / uM;
          vec3 dcol = mix(triS(tDet, pw, tw), triS(tDet, pw * 0.37 + 0.31, tw), uMix) * uGain;
          // coulures sous les arêtes (murs) : traînées verticales plus sombres
          float sx = (vWP.x + vWP.z) * 1.3; float st = uStreak * smoothstep(0.55, 1.0, fract(sin(floor(sx) * 12.9898) * 43758.5453) * (0.6 + 0.4 * sin(fract(sx) * 3.1416))) * (1.0 - tw.y) * smoothstep(0.0, 2.5, vWP.y);
          diffuseColor.rgb *= dcol * (1.0 - st * 0.22);`)
          .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          if (uHasR > 0.5) { vec3 twr = pow(abs(vWN), vec3(4.0)); twr /= (twr.x + twr.y + twr.z); roughnessFactor = clamp(roughnessFactor * (0.45 + 0.6 * triS(tDetR, vWP / uM, twr).g), 0.05, 1.0); }`)
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          { vec3 nt; vec3 nw;
            if (tw.y > 0.5) { nt = texture2D(tDetN, pw.xz).xyz * 2.0 - 1.0; nw = vec3(nt.x * uBump, sign(vWN.y), nt.y * uBump); }
            else if (tw.x > tw.z) { nt = texture2D(tDetN, pw.zy).xyz * 2.0 - 1.0; nw = vec3(sign(vWN.x), nt.y * uBump, nt.x * uBump); }
            else { nt = texture2D(tDetN, pw.xy).xyz * 2.0 - 1.0; nw = vec3(nt.x * uBump, nt.y * uBump, sign(vWN.z)); }
            normal = normalize((viewMatrix * vec4(normalize(nw), 0.0)).xyz); }`);
    };
    m.customProgramCacheKey = () => 'worldMatP' + (opts.streak ? 's' : '');
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
    // tout le marquage vient de la description de la carte (map.def.marquage) et des objets simulés : les voitures sont
    // toujours dans leurs places
    const MK = (map.def && map.def.marquage) || { rangees: [], murs: [] }, OB = map.obstacles;
    const line = (x0, z0, x1, z1) => { p.beginPath(); p.moveTo(M(x0), M(z0)); p.lineTo(M(x1), M(z1)); p.stroke(); };
    const zebra = (x0, z0, x1, z1, alongX) => { p.fillStyle = white; if (alongX) for (let z = z0 + 0.25; z < z1 - 0.3; z += 1.0) p.fillRect(M(x0), M(z), M(x1 - x0), M(0.5)); else for (let x = x0 + 0.25; x < x1 - 0.3; x += 1.0) p.fillRect(M(x), M(z0), M(0.5), M(z1 - z0)); };
    const hatch = (x0, z0, w, h, col) => { p.strokeStyle = col; p.lineWidth = M(0.12); p.strokeRect(M(x0), M(z0), M(w), M(h)); p.save(); p.beginPath(); p.rect(M(x0), M(z0), M(w), M(h)); p.clip(); for (let k = -h; k < w; k += 0.7) line(x0 + k, z0 + h, x0 + k + h, z0); p.restore(); };
    const text = (x, z, t, r, size, col) => { p.save(); p.translate(M(x), M(z)); p.rotate(r || 0); p.font = `bold ${M(size || 1.1)}px Arial`; p.textAlign = 'center'; p.textBaseline = 'middle'; p.fillStyle = col || white; p.fillText(t, 0, 0); p.restore(); };
    // ruelle : bande de béton le long du muret grillagé (aire de livraison, plates-formes des bennes) et caniveau central
    const ruelle = OB.filter(o => /^clôture grillagée/.test(o.name || ''));
    if (ruelle.length) {
      const zf = Math.min(...ruelle.map(o => o.z));
      p.fillStyle = 'rgba(146,142,134,1)'; p.fillRect(0, M(zf - 3.2), M(W), M(3.2));
      p.strokeStyle = 'rgba(70,68,64,0.9)'; p.lineWidth = M(0.03); for (let x = 0; x < W; x += 3) line(x, zf - 3.2, x, zf); line(0, zf - 3.2, W, zf - 3.2);
      p.fillStyle = 'rgba(118,115,108,1)'; p.fillRect(0, M(zf / 2 - 0.3), M(W), M(0.6));   // caniveau en V
      p.fillStyle = 'rgba(60,58,54,1)'; p.fillRect(0, M(zf / 2 - 0.04), M(W), M(0.08));
      // zones de livraison hachurées devant les portes de service (pas de places dans une ruelle)
      for (const [x0, w] of [[9.6, 8.6], [44.6, 5.6], [62.6, 5.2]]) hatch(x0, 0.1, w, 2.6, yellow);
      text(13.9, 3.4, 'LIVRAISONS', 0, 0.75, yellow);
    }
    // rangées doubles : séparations de places, ligne médiane, numéros
    p.strokeStyle = white; p.lineWidth = M(0.12);
    p.font = `bold ${M(0.42)}px Arial`;
    MK.rangees.forEach(([x0, z0, n], ri) => {
      for (let k = 0; k <= n; k++) line(x0, z0 + 2.5 * k, x0 + 10, z0 + 2.5 * k);
      line(x0 + 5, z0, x0 + 5, z0 + 2.5 * n);
      for (let k = 0; k < n; k++) for (const s of [0, 1]) text(s ? x0 + 9.4 : x0 + 0.6, z0 + 2.5 * k + 1.25, 'AB'[ri] + (k * 2 + s + 1), s ? -Math.PI / 2 : Math.PI / 2, 0.42);
    });
    // places le long des murs (perpendiculaires au mur)
    for (const [x, z, n, dx, dz] of MK.murs) for (let k = 0; k <= n; k++) { if (dx) line(x + dx * k, z, x + dx * k, z + 5); else line(x, z + dz * k, x + 5, z + dz * k); }
    // places PMR : au bout des rangées le plus près des passages du grillage (fond bleu, pictogramme)
    const pmr = (x, z) => { p.fillStyle = 'rgba(32,72,140,0.7)'; p.fillRect(M(x + 0.1), M(z + 0.1), M(4.8), M(2.3)); p.fillStyle = white; p.save(); p.translate(M(x + 2.5), M(z + 1.25)); const k = M(0.3);
      p.beginPath(); p.arc(0, -k * 1.6, k * 0.35, 0, 7); p.fill(); p.lineWidth = k * 0.35; p.strokeStyle = white; p.beginPath(); p.moveTo(0, -k * 1.1); p.lineTo(0, 0); p.lineTo(k * 0.9, 0); p.lineTo(k * 1.2, k * 0.9); p.stroke(); p.beginPath(); p.arc(0, k * 0.4, k * 0.9, 0.4, 3.5); p.stroke(); p.restore(); };
    if (MK.rangees[0]) pmr(MK.rangees[0][0] + 5, MK.rangees[0][1]);
    if (MK.rangees[1]) pmr(MK.rangees[1][0], MK.rangees[1][1]);
    // sens de circulation : flèches dans les allées (deux boucles qui partent de l'entrée au sud et y reviennent)
    p.fillStyle = white;
    const arrow = (x, z, dir) => { p.save(); p.translate(M(x), M(z)); p.rotate(dir); p.beginPath(); p.moveTo(M(-1.6), M(-0.18)); p.lineTo(M(0.4), M(-0.18)); p.lineTo(M(0.4), M(-0.55)); p.lineTo(M(1.6), 0); p.lineTo(M(0.4), M(0.55)); p.lineTo(M(0.4), M(0.18)); p.lineTo(M(-1.6), M(0.18)); p.closePath(); p.fill(); p.restore(); };
    const N_ = -Math.PI / 2, S_ = Math.PI / 2, E_ = 0, O_ = Math.PI;
    // (aucune flèche sous un îlot ni dans la partie fermée pour travaux). La boucle est (entrée → allée x 46–49 vers le nord →
    // allée du haut vers l'est → allée x 59–67 vers le sud) est coupée par le chantier : marquage provisoire JAUNE (il prime
    // sur le blanc) — demi-tour au bout de l'allée est, retour par l'autre voie des mêmes allées jusqu'à la sortie. Les
    // flèches blanches sont sur la voie de droite (on roule à droite) pour laisser la gauche au retour.
    for (const [x, z, d] of [[10, 32, N_], [10, 18, N_], [18, 13.2, E_], [26.6, 19, S_], [26.6, 30, S_], [47.9, 31, N_], [47.9, 19.5, N_], [54, 14.3, E_], [61.6, 18.6, S_], [61.6, 28.4, S_], [13.8, 38.6, E_]]) arrow(x, z, d);
    p.fillStyle = yellow; for (const [x, z, d] of [[64.9, 21, N_], [61.2, 12.1, O_], [45.2, 18.6, S_], [45.2, 29.4, S_]]) arrow(x, z, d);
    { const xa = 61.7, xb = 64.9, zc = 32.3, r = (xb - xa) / 2, w = 0.18;   // demi-tour : descente sur la voie ouest, boucle, remontée à l'est
      p.beginPath(); p.moveTo(M(xa - w), M(31.0)); p.lineTo(M(xa - w), M(zc)); p.arc(M(xa + r), M(zc), M(r + w), Math.PI, 0, true); p.lineTo(M(xb + w), M(31.2));
      p.lineTo(M(xb + 0.55), M(31.2)); p.lineTo(M(xb), M(30.0)); p.lineTo(M(xb - 0.55), M(31.2)); p.lineTo(M(xb - w), M(31.2)); p.lineTo(M(xb - w), M(zc)); p.arc(M(xa + r), M(zc), M(r - w), 0, Math.PI, false); p.lineTo(M(xa + w), M(31.0)); p.closePath(); p.fill(); }
    p.fillStyle = white;
    // entrée et sortie : lignes d'arrêt, inscriptions, flèches
    const gate = OB.find(o => o.name === 'mur portail sud');
    if (gate) { const gx = gate.x, gw = gate.w; p.fillStyle = white; p.fillRect(M(gx + 0.1), M(44.2), M(gw / 2 - 0.6), M(0.3)); text(gx + gw * 0.78, 41.4, 'ENTRÉE', 0, 0.7); text(gx + gw * 0.25, 37.6, 'SORTIE', 0, 0.7); arrow(gx + gw * 0.78, 44.6, N_); arrow(gx + gw * 0.25, 36.0, S_);   // on roule à droite : entrée à l'est, sortie à l'ouest
      p.strokeStyle = yellow; p.lineWidth = M(0.12); line(gx + gw / 2, 39.5, gx + gw / 2, 46); }
    // quai de la navette : zigzags jaunes, inscription BUS, îlot de l'abri ; passage piéton vers le quai
    const bus = OB.find(o => o.name === 'bus');
    if (bus) { p.strokeStyle = yellow; p.lineWidth = M(0.14); for (const zz of [bus.z - 0.25, bus.z + bus.d + 0.25]) { p.beginPath(); for (let x = bus.x - 1.5, k = 0; x <= bus.x + bus.w + 1.5; x += 0.8, k++) p[k ? 'lineTo' : 'moveTo'](M(x), M(zz + (k % 2 ? 0.35 : -0.35) * (zz < bus.z ? -1 : 1))); p.stroke(); }
      text(bus.x - 2.6, bus.z + bus.d / 2, 'BUS', -Math.PI / 2, 1.0, yellow); }
    const abri = OB.find(o => o.name === 'abribus');
    // (le passage ne traverse que la voie de circulation, du quai au bord sud des jardinières : il ne bute plus sur le
    // pare-chocs du fourgon garé sur l'aire de séchage — 1,8 m devant)
    if (abri) { p.fillStyle = 'rgba(168,164,156,1)'; p.fillRect(M(abri.x - 1.2), M(abri.z - 0.3), M(abri.w + 2.4), M(abri.d + 0.5)); zebra(abri.x + 0.4, 34.9, abri.x + abri.w - 0.4, abri.z - 0.3, true); }
    // passages piétons alignés sur les ouvertures du grillage (portes arrière des boutiques)
    if (ruelle.length) { const segs = ruelle.map(o => [o.x, o.x + o.w]).sort((a, b) => a[0] - b[0]); for (let k = 0; k + 1 < segs.length; k++) { const a = segs[k][1], b = segs[k + 1][0]; if (b - a > 1.5 && b - a < 8) zebra(a + 0.2, ruelle[0].z + ruelle[0].d + 0.3, b - 0.2, 15.2, true); } }
    // station de lavage : pistes, numéros, entrée ; aspirateurs : places dessinées autour des voitures
    const lav = OB.filter(o => /^lavage/.test(o.name || ''));
    if (lav.length) { const z0 = Math.min(...lav.map(o => o.z)), z1 = Math.max(...lav.map(o => o.z + o.d)), x0 = Math.min(...lav.map(o => o.x)), x1 = Math.max(...lav.map(o => o.x + o.w));
      p.fillStyle = 'rgba(70,74,78,0.55)'; p.fillRect(M(x0), M(z0), M(x1 - x0), M(z1 - z0));
      text(x0 + 2.2, z0 + 1.2, '1', 0, 1.4, yellow); text(x1 - 2.2, z1 - 1.2, '2', Math.PI, 1.4, yellow);
      text(x1 - 2.2, z0 - 4.2, 'LAVAGE', -Math.PI / 2, 0.8, yellow); }
    // (les deux places de part et d'autre de chaque aspirateur)
    for (const a of OB.filter(o => o.name === 'aspirateur')) for (const c of OB.filter(o => /^voiture/.test(o.name) && Math.abs(o.x + o.w / 2 - a.x) < 4 && Math.abs(o.z + o.d / 2 - a.z - a.d / 2) < 4)) { p.strokeStyle = yellow; p.lineWidth = M(0.12); p.strokeRect(M(c.x - 0.3), M(c.z - 0.35), M(c.w + 0.6), M(c.d + 0.7)); }
    // chantier : enrobé raboté (plus sombre, rainuré), marquages de chantier à la bombe orange
    const clo = OB.filter(o => /^clôture de chantier/.test(o.name || ''));
    if (clo.length) { const cx0 = Math.min(...clo.map(o => o.x)) + 0.3, cz0 = Math.min(...OB.filter(o => o.name === 'barrière').map(o => o.z + o.d)) || 35;
      p.clearRect(M(cx0), M(cz0), M(W - cx0), M(D - cz0));   // enrobé raboté : l'ancienne peinture est partie avec
      p.fillStyle = 'rgba(28,28,30,0.55)'; p.fillRect(M(cx0), M(cz0), M(W - cx0), M(D - cz0)); p.strokeStyle = 'rgba(60,60,62,0.5)'; p.lineWidth = M(0.04); for (let x = cx0; x < W; x += 0.12) line(x, cz0, x, D);
      p.strokeStyle = 'rgba(240,110,30,0.9)'; p.lineWidth = M(0.08); line(cx0 + 1, cz0 + 1.2, W - 1, cz0 + 1.2); line(cx0 + 2, D - 1.5, cx0 + 9, D - 1.5); for (const [x, z] of [[cx0 + 6, cz0 + 4], [cx0 + 13, cz0 + 7]]) { line(x - 0.4, z - 0.4, x + 0.4, z + 0.4); line(x - 0.4, z + 0.4, x + 0.4, z - 0.4); } }
    // usure de la peinture : on gomme selon un bruit fractal à deux échelles
    const er = document.createElement('canvas'); er.width = cw; er.height = ch; const e = er.getContext('2d'), eimg = e.createImageData(cw, ch), ed = eimg.data;
    const N1 = 256, F1 = fbmField(N1, 16, 5, 501, 0.6), F2 = fbmField(N1, 64, 3, 503, 0.6);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const a = F1[(y % N1) * N1 + (x % N1)], b = F2[((y * 3) % N1) * N1 + ((x * 3) % N1)];
      const wear = Math.min(1, Math.max(0, (a * 0.7 + b * 0.5 - 0.42) * 2.6)); const i = (y * cw + x) * 4; ed[i + 3] = wear * 255;
    }
    e.putImageData(eimg, 0, 0); p.globalCompositeOperation = 'destination-out'; p.drawImage(er, 0, 0); p.globalCompositeOperation = 'source-over';
    // fissures de l'enrobé (fines, ramifiées) et joints de goudron rebouchés (traits noirs brillants, plus larges)
    const crack = (x, z, len, a0, w, col) => { p.strokeStyle = col; p.lineWidth = M(w); p.lineCap = 'round'; p.beginPath(); p.moveTo(M(x), M(z)); let a = a0;
      for (let k = 0; k < len; k++) { a += (R() - 0.5) * 0.9; x += Math.cos(a) * 0.35; z += Math.sin(a) * 0.35; p.lineTo(M(x), M(z)); if (R() < 0.08 && w > 0.02) { p.stroke(); crack(x, z, Math.floor(len * 0.4), a + (R() < 0.5 ? 1 : -1) * 1.1, w * 0.6, col); p.strokeStyle = col; p.lineWidth = M(w); p.beginPath(); p.moveTo(M(x), M(z)); } }
      p.stroke(); };
    for (let k = 0; k < 26; k++) crack(R() * W, R() * D, 8 + Math.floor(R() * 22), R() * 6.28, 0.035, 'rgba(18,17,16,0.75)');
    for (let k = 0; k < 9; k++) crack(R() * W, R() * D, 12 + Math.floor(R() * 25), R() * 6.28, 0.09, 'rgba(8,8,8,0.55)');
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
    // huile sous les véhicules garés (et dans quelques places vides), traces de pneus dans les allées
    const tache = (cx, cz, r) => { const gr = g.createRadialGradient(M(cx), M(cz), 0, M(cx), M(cz), M(r)); gr.addColorStop(0, 'rgba(0,0,180,1)'); gr.addColorStop(0.6, 'rgba(0,0,90,1)'); gr.addColorStop(1, 'rgba(0,0,0,1)'); g.fillStyle = gr; g.beginPath(); g.ellipse(M(cx), M(cz), M(r), M(r * (0.6 + R() * 0.6)), R() * 3, 0, 7); g.fill(); };
    for (const o of map.obstacles) if (/^(voiture|fourgon|bus)/.test(o.name || '') && R() < 0.8) tache(o.x + o.w * (0.3 + R() * 0.4), o.z + o.d * (0.3 + R() * 0.4), 0.3 + R() * 0.45);
    const MKo = (map.def && map.def.marquage) || { rangees: [] };
    for (const [x0, z0, n] of MKo.rangees) for (let k = 0; k < n; k++) for (const s of [0, 1]) if (R() < 0.35) tache(x0 + (s ? 6.6 : 3.4) + (R() - 0.5), z0 + 2.5 * k + 1.25 + (R() - 0.5) * 0.6, 0.2 + R() * 0.35);
    g.lineWidth = M(0.22); g.lineCap = 'round';
    for (let k = 0; k < 44; k++) {
      const vert = R() < 0.6, a = 10 + R() * 30, L = 3 + R() * 9, bend = (R() - 0.5) * 0.4; g.strokeStyle = `rgba(0,0,${a},1)`;
      if (vert) { const x = [10, 26.6, 45.6, 64.5][Math.floor(R() * 4)] + (R() - 0.5) * 2.5, z = 12 + R() * (D - 24);
        for (const off of [-0.8, 0.8]) { g.beginPath(); g.moveTo(M(x + off), M(z)); g.quadraticCurveTo(M(x + off + bend * L), M(z + L / 2), M(x + off + bend * L * 1.6), M(z + L)); g.stroke(); } }
      else { const zl = (R() < 0.5 ? 13 : 37) + (R() - 0.5) * 2.5, x = 4 + R() * (W - 8);
        for (const off of [-0.8, 0.8]) { g.beginPath(); g.moveTo(M(x), M(zl + off)); g.quadraticCurveTo(M(x + L / 2), M(zl + off + bend * L), M(x + L), M(zl + off + bend * L * 1.6)); g.stroke(); } }
    }
    g.globalCompositeOperation = 'source-over';
    // eau : flaques dans les creux (bruit fractal seuillé, autour de quelques points bas)
    const img = g.getImageData(0, 0, cw, ch), dd = img.data;
    const NP = 512, P1 = fbmField(NP, 8, 5, 777, 0.55), P2 = fbmField(NP, 32, 3, 779, 0.5);
    const lows = []; for (let k = 0; k < 9; k++) lows.push([4 + R() * (W - 8), 6 + R() * (D - 12), 2.5 + R() * 3.5]);
    lows.push([8, 5.2, 3.5], [27, 5.0, 3], [52, 5.3, 4], [66, 5, 3], [32.6, 23, 3.2], [39.6, 24, 3.2], [20, 37.5, 3], [58, 40, 3.5]);   // caniveau de la ruelle, pistes de lavage, creux de l'enrobé
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
    const W = map.width, D = map.depth, A = PBRdet('asphalte', asphalt()), du = detU(A);
    const m = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { tDet: du.tDet, tDetN: du.tDetN, tDetR: du.tDetR, uGain: du.gain, uHasR: du.hasR, uMix: du.mix, tPaint: { value: maps.paint }, tData: { value: maps.data }, uSize: { value: new T.Vector2(W, D) }, uM: du.uM, uWet: U.wet });
      sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(position, 1.0)).xyz;');
      sh.fragmentShader = 'uniform sampler2D tDet, tDetN, tDetR, tPaint, tData; uniform vec2 uSize; uniform float uM, uWet, uGain, uHasR, uMix; varying vec3 vWP;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `
          vec2 duv = vWP.xz / uM;
          vec3 det = mix(texture2D(tDet, duv).rgb, texture2D(tDet, duv * 0.29 + vec2(0.13, 0.71)).rgb, uMix) * uGain;
          vec2 muv = clamp(vWP.xz / uSize, 0.0, 1.0);
          vec4 gdat = texture2D(tData, muv); vec4 gp = texture2D(tPaint, muv);
          float grime = gdat.r, oil = gdat.b, wet = max(gdat.g, uWet * (0.35 + 0.65 * gdat.g));
          float pool = smoothstep(0.55, 0.8, wet);
          vec3 col = det * (1.0 - grime * 0.42) * (1.0 - oil * 0.65);
          col = mix(col, gp.rgb * (1.0 - grime * 0.25), gp.a);
          col *= mix(1.0, 0.5, smoothstep(0.05, 0.6, wet));
          diffuseColor.rgb = col;`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          float rDry = uHasR > 0.5 ? clamp(0.25 + 0.85 * mix(texture2D(tDetR, duv).g, texture2D(tDetR, duv * 0.29 + vec2(0.13, 0.71)).g, uMix), 0.3, 1.0) : 0.93;
          roughnessFactor = mix(mix(rDry, 0.8, gp.a), 0.55, smoothstep(0.05, 0.55, wet));
          roughnessFactor = mix(roughnessFactor, 0.12, pool); roughnessFactor = mix(roughnessFactor, 0.35, oil * 0.6);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          { vec3 nt = texture2D(tDetN, duv).xyz * 2.0 - 1.0; float bump = (1.0 - pool) * (1.0 - gp.a * 0.5);
            vec3 nw = normalize(vec3(nt.x * bump, 1.0, nt.y * bump));
            normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz); }`);
    };
    m.customProgramCacheKey = () => 'solParkingP';
    const ge = new T.PlaneGeometry(W, D, 1, 1); const mesh = new T.Mesh(ge, m);
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(W / 2, 0, D / 2); mesh.receiveShadow = true; mesh.userData.keep = true;
    return mesh;
  }
  // flaques : réflexion plane masquée par la carte d'eau
  function puddles(map, maps, U) {
    const X = window.THREEX; if (!X || !X.Reflector) return null;
    const W = map.width, D = map.depth;
    const shader = {
      uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, tData: { value: maps.data }, uSize: { value: new T.Vector2(W, D) }, uWet: U.wet, time: U.time, uFade: { value: 1 } },
      vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vWP;
        void main() { vUv = textureMatrix * vec4(position, 1.0); vWP = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D tDiffuse, tData; uniform vec2 uSize; uniform float uWet, time, uFade; varying vec4 vUv; varying vec3 vWP;
        void main() {
          if (uFade < 0.004) discard;
          vec2 muv = clamp(vWP.xz / uSize, 0.0, 1.0); float g = texture2D(tData, muv).g; float wet = max(g, uWet * g * 1.2);
          float m = smoothstep(0.6, 0.85, wet); if (m < 0.01) discard;
          // légère ondulation de la surface (vent, pluie)
          vec2 rip = vec2(sin(vWP.x * 9.0 + time * 1.7) + sin(vWP.z * 7.0 - time * 1.3), cos(vWP.x * 8.0 - time * 1.1) + sin(vWP.z * 11.0 + time * 2.1)) * (0.0006 + uWet * 0.003);
          vec4 pr = vUv; pr.xy += rip * pr.w;
          vec3 refl = min(texture2DProj(tDiffuse, pr).rgb, vec3(6.0));
          vec3 V = normalize(cameraPosition - vWP); float f = 0.02 + 0.98 * pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);
          // pellicule d'eau mince : le bitume mouillé (assombri par le sol) reste visible dessous ; le reflet s'y pose selon
          // Fresnel (faible vu d'en haut, miroir en lumière rasante) ; l'eau assombrit un peu le fond (~28 %)
          float k = clamp(f * 1.3 + 0.06, 0.0, 0.9), a = k + 0.28 * (1.0 - k);
          gl_FragColor = vec4(refl * 0.85 * k / max(a, 1e-3), m * a * uFade);
        }`,
    };
    const r = new X.Reflector(new T.PlaneGeometry(W, D), { shader, textureWidth: 512, textureHeight: 512, clipBias: 0.003, multisample: 0 });   // reflet flou de flaque : demi-résolution, sans MSAA
    r.material.transparent = true; r.material.depthWrite = false;
    r.rotation.x = -Math.PI / 2; r.position.set(W / 2, 0.004, D / 2); r.userData.keep = true; r.renderOrder = 1;
    // coût : la réflexion redessine toute la scène. On ne la refait pas quand la caméra n'a (presque) pas bougé depuis la
    // dernière fois (une image sur deux au plus dans ce cas), ni en vue haute : de 9 à 12 m d'altitude la couche des reflets
    // s'efface en fondu, au-dessus elle n'est plus ni calculée ni affichée (jamais d'ancienne image vue d'un autre point de
    // vue) ; il reste le sol mouillé, sombre et lisse, qui renvoie déjà le ciel par son propre matériau
    let img = 0; const ob = r.onBeforeRender, lastP = new T.Vector3(1e9, 0, 0), lastQ = new T.Quaternion(), fade = r.material.uniforms.uFade;
    r.onBeforeRender = function (renderer, scene, camera) {
      if (scene.overrideMaterial || camera.isOrthographicCamera) return; const rt = renderer.getRenderTarget(); if (rt && rt.__reflet) return;
      const deja = r.userData.deja;
      fade.value = 1 - T.MathUtils.smoothstep(camera.position.y, 9, 12); if (fade.value <= 0) return;
      const calme = camera.position.distanceToSquared(lastP) < 4e-4 && Math.abs(camera.quaternion.dot(lastQ)) > 0.999999;
      if (deja && calme && (img++ & 1)) return;
      r.userData.deja = true; lastP.copy(camera.position); lastQ.copy(camera.quaternion); ob.call(this, renderer, scene, camera);
    };
    r.getRenderTarget().__reflet = true;
    return r;
  }
  // ---------------------------------------------------------------------------------------------
  // Pièces du décor de la simulation, habillées
  // ---------------------------------------------------------------------------------------------
  const MATS = {};
  const mat = (k, f) => MATS[k] || (MATS[k] = f());
  const M3 = () => ({
    beton: mat('beton', () => worldMat(PBRdet('beton', concrete()), { roughness: 0.92, streak: 1 })),
    betonClair: mat('betonClair', () => worldMat(PBRdet('betonClair', concrete('clair')), { roughness: 0.88, streak: 0.6 })),
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
    if (/^mur (nord|sud|est|ouest)/.test(o.name || '')) addGraffiti(o, g);
    return g;
  }
  // ---- tags et fresques (inventés) sur les murs d'enceinte : lettres « bulles » contour + remplissage + reflets, coulures,
  // signatures au marqueur ; mots tirés d'une liste neutre
  const MOTS = ['KRSK', 'NOVA', 'ZEPH', 'OKRA', 'VAKO', 'RIFT', 'MOLO', 'DUSK', 'SKAY', 'TOXO', 'BRIK', 'ZONE', 'KAOS', 'LYNO'];
  function graffitiTex(seed) {
    const key = 'graf' + seed; if (texCache[key]) return texCache[key];
    const R = rng(seed + 101), W = 1024, H = 384, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const pal = [['#e83f6f', '#ffbf00'], ['#2fb3ff', '#7a3cff'], ['#3fdc7a', '#0f6e8c'], ['#ff6b2b', '#ffe14d'], ['#f2f2f2', '#9a9a9a'], ['#c23cff', '#35e0ff']][Math.floor(R() * 6)];
    const word = MOTS[Math.floor(R() * MOTS.length)], fs = 200 + R() * 60;
    g.save(); g.translate(W / 2, H / 2 + 20); g.rotate((R() - 0.5) * 0.18); g.font = `900 ${fs}px "Arial Black", Impact, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    // ombre portée, contour épais, remplissage dégradé, reflets
    g.lineJoin = 'round'; g.strokeStyle = 'rgba(10,10,14,0.95)'; g.lineWidth = 38; g.strokeText(word, 10, 12);
    g.strokeStyle = '#111'; g.lineWidth = 30; g.strokeText(word, 0, 0);
    g.strokeStyle = pal[1]; g.lineWidth = 14; g.strokeText(word, 0, 0);
    const gr = g.createLinearGradient(0, -fs / 2, 0, fs / 2); gr.addColorStop(0, pal[0]); gr.addColorStop(1, pal[1]); g.fillStyle = gr; g.fillText(word, 0, 0);
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(255,255,255,0.35)';
    for (let k = 0; k < 6; k++) { g.beginPath(); g.ellipse((R() - 0.5) * fs * 2, -fs * 0.25 + R() * 20, 18 + R() * 30, 6, -0.3, 0, 7); g.fill(); }
    g.restore(); g.globalCompositeOperation = 'source-over';
    // coulures
    for (let k = 0; k < 18; k++) { const x = W * 0.15 + R() * W * 0.7, y = H * 0.5 + R() * H * 0.25, L = 20 + R() * 80; g.fillStyle = R() < 0.5 ? pal[0] : pal[1]; g.globalAlpha = 0.8; g.fillRect(x, y, 3 + R() * 3, L); g.beginPath(); g.arc(x + 2.5, y + L, 3.5, 0, 7); g.fill(); g.globalAlpha = 1; }
    // signatures au marqueur et étoiles
    g.strokeStyle = 'rgba(15,15,15,0.85)'; g.lineWidth = 4; g.font = 'italic bold 46px "Comic Sans MS", cursive';
    if (R() < 0.7) { g.save(); g.translate(W * (0.72 + R() * 0.15), H * (0.82 + R() * 0.1)); g.rotate(-0.15); g.fillStyle = 'rgba(15,15,15,0.85)'; g.fillText(MOTS[Math.floor(R() * MOTS.length)].toLowerCase() + (R() < 0.5 ? '★' : '!'), 0, 0); g.restore(); }
    // usure : petits trous où la peinture s'en va
    g.globalCompositeOperation = 'destination-out'; for (let k = 0; k < 1500; k++) { g.fillStyle = `rgba(0,0,0,${R() * 0.6})`; g.fillRect(R() * W, R() * H, 1 + R() * 3, 1 + R() * 3); } g.globalCompositeOperation = 'source-over';
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; return (texCache[key] = t);
  }
  function addGraffiti(o, g) {
    const along = o.w >= o.d, L = along ? o.w : o.d, R = rng(Math.floor(o.x * 3 + o.z * 5) + 77), n = Math.floor(L / 9);
    // face tournée vers l'intérieur du parking
    const inSign = /nord/.test(o.name) ? 1 : /sud/.test(o.name) ? -1 : /ouest/.test(o.name) ? 1 : -1;
    for (let k = 0; k < n; k++) {
      if (R() < 0.45) continue;
      const w = 3 + R() * 3.5, h = w * 0.375, off = -L / 2 + (k + 0.5) * L / n + (R() - 0.5) * 2;
      const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshStandardMaterial({ map: graffitiTex(Math.floor(R() * 40)), transparent: true, roughness: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      const th = along ? o.d : o.w, y = -o.h / 2 + 0.3 + h / 2 + R() * 0.4;
      if (along) { m.position.set(off, y, inSign * (th / 2 + 0.02)); if (inSign < 0) m.rotation.y = Math.PI; }
      else { m.position.set(inSign * (th / 2 + 0.02), y, off); m.rotation.y = inSign > 0 ? Math.PI / 2 : -Math.PI / 2; }
      m.receiveShadow = true; g.add(m);
    }
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
    // toit : dalle gravillonnée gris clair, rive en tôle laquée, acrotère, groupe de clim et ventilations
    const roofM = mat('toitGravier', () => worldMat(concrete('clair'), { color: 0xa7a59f, roughness: 0.96, bump: 1.6 }));
    const fasc = mat('rive', () => new T.MeshStandardMaterial({ color: 0x6d757c, roughness: 0.42, metalness: 0.6 }));
    const RW = sx(L + 0.8, th + 0.8), RD = sz(L + 0.8, th + 0.8);
    const roof = new T.Mesh(new T.BoxGeometry(RW, 0.16, RD), roofM); roof.position.y = o.h / 2 - 0.14; g.add(roof);
    const under = new T.Mesh(new T.BoxGeometry(RW - 0.02, 0.06, RD - 0.02), K.metal); under.position.y = o.h / 2 - 0.25; g.add(under);
    for (const s of [-1, 1]) {
      const e1 = new T.Mesh(new T.BoxGeometry(RW + 0.04, 0.34, 0.06), fasc); e1.position.set(0, o.h / 2 - 0.09, s * (RD / 2 + 0.01)); g.add(e1);
      const e2 = new T.Mesh(new T.BoxGeometry(0.06, 0.34, RD + 0.04), fasc); e2.position.set(s * (RW / 2 + 0.01), o.h / 2 - 0.09, 0); g.add(e2);
    }
    const R = rng(Math.floor(o.x * 31 + o.z * 17));
    const clim = mat('clim', () => new T.MeshStandardMaterial({ color: 0xc9cbc8, roughness: 0.5, metalness: 0.4 }));
    const grille = mat('grilleClim', () => new T.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.7, metalness: 0.5 }));
    for (let k = 0; k < 2; k++) {
      const u = (k ? 0.22 : -0.25) * L, box = new T.Group();
      const c = new T.Mesh(new T.BoxGeometry(1.0, 0.62, 0.7), clim); c.position.y = 0.31; box.add(c);
      const fan = new T.Mesh(new T.CylinderGeometry(0.25, 0.25, 0.02, 20), grille); fan.position.y = 0.63; box.add(fan);
      const ped = new T.Mesh(new T.BoxGeometry(1.1, 0.08, 0.8), K.metal); ped.position.y = 0.04; box.add(ped);
      box.position.set(along ? u : (R() - 0.5) * 0.3, o.h / 2 - 0.06, along ? (R() - 0.5) * 0.3 : u); box.rotation.y = along ? 0 : Math.PI / 2; g.add(box);
    }
    for (let k = 0; k < 3; k++) { const v = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 0.4, 12), clim); const u = (R() - 0.5) * (L - 1.5); v.position.set(along ? u : (R() - 0.5) * (th - 0.4), o.h / 2 + 0.14, along ? (R() - 0.5) * (th - 0.4) : u); g.add(v);
      const cap = new T.Mesh(new T.CylinderGeometry(0.16, 0.13, 0.06, 12), clim); cap.position.copy(v.position); cap.position.y += 0.24; g.add(cap); }
    for (let k = -1; k <= 1; k += 2) for (const s of [-1, 1]) { const pole = new T.Mesh(new T.BoxGeometry(0.12, o.h, 0.12), K.metal); pole.position.set(along ? k * (L / 2 - 0.1) : s * (th / 2 + 0.02), 0, along ? s * (th / 2 + 0.02) : k * (L / 2 - 0.1)); g.add(pole); }
    return g;
  }
  // ---- conteneur maritime : tôle ondulée (relief), cadre, portes à barres de verrouillage, rouille et coulures -------
  function containerTex(tone, seed) {
    const key = 'cont' + tone + seed; if (texCache[key]) return texCache[key];
    const R = rng(seed), W = 512, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const base = { rouge: [150, 58, 40], bleu: [48, 86, 128], vert: [70, 104, 70], gris: [118, 122, 124], blanc: [196, 196, 188] }[tone] || [150, 58, 40];
    g.fillStyle = `rgb(${base})`; g.fillRect(0, 0, W, H);
    const Hh = new Float32Array(W * H);
    for (let x = 0; x < W; x++) { const ph = (x % 16) / 16, v = ph < 0.25 ? ph / 0.25 : ph < 0.5 ? 1 : ph < 0.75 ? 1 - (ph - 0.5) / 0.25 : 0; for (let y = 0; y < H; y++) Hh[y * W + x] = v; }
    // nervures : ombre / lumière
    for (let x = 0; x < W; x++) { const ph = (x % 16) / 16, sh = ph < 0.25 ? 0.12 : ph >= 0.5 && ph < 0.75 ? -0.14 : 0; if (sh) { g.fillStyle = sh > 0 ? `rgba(255,255,255,${sh})` : `rgba(0,0,0,${-sh})`; g.fillRect(x, 0, 1, H); } }
    // rouille (taches, coulures depuis le haut et les rivets), peinture passée, saleté en bas
    for (let k = 0; k < 160; k++) { const x = R() * W, y = R() * H, r = 2 + R() * 10; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${110 + R() * 40},${50 + R() * 20},20,${0.35 + R() * 0.4})`); gr.addColorStop(1, 'rgba(90,40,15,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
    for (let k = 0; k < 70; k++) { const x = R() * W, L = 20 + R() * 120, y0 = R() < 0.6 ? 0 : R() * H; const gr = g.createLinearGradient(0, y0, 0, y0 + L); gr.addColorStop(0, 'rgba(90,45,20,0.5)'); gr.addColorStop(1, 'rgba(90,45,20,0)'); g.fillStyle = gr; g.fillRect(x, y0, 1 + R() * 2.5, L); }
    const gr2 = g.createLinearGradient(0, H * 0.7, 0, H); gr2.addColorStop(0, 'rgba(40,34,28,0)'); gr2.addColorStop(1, 'rgba(40,34,28,0.55)'); g.fillStyle = gr2; g.fillRect(0, 0, W, H);
    for (let k = 0; k < 4000; k++) { g.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},${R() * 0.07})`; g.fillRect(R() * W, R() * H, 1 + R() * 2, 1 + R() * 2); }
    const rc = document.createElement('canvas'); rc.width = W; rc.height = H; const rg = rc.getContext('2d'); rg.fillStyle = 'rgb(0,150,90)'; rg.fillRect(0, 0, W, H);   // G rugosité, B métal
    g.globalCompositeOperation = 'source-over';
    return (texCache[key] = { map: tex(c, true), normal: tex(normalsFrom(Hh, W, 3.0, H), false), meters: 2.6 });
  }
  function container(o) {
    const g = new T.Group(), along = o.w >= o.d, L = along ? o.w : o.d, th = along ? o.d : o.w, H = o.h;
    const tones = ['rouge', 'bleu', 'vert', 'gris', 'blanc'], seed = Math.floor(o.x * 7 + o.z * 13), tone = tones[Math.abs(seed) % tones.length];
    const tx = containerTex(tone, 3 + (Math.abs(seed) % 3));
    const mk = (rep) => { const m = new T.MeshStandardMaterial({ map: tx.map.clone(), normalMap: tx.normal.clone(), roughness: 0.62, metalness: 0.45 }); m.map.repeat.set(rep, 1); m.normalMap.repeat.set(rep, 1); m.map.wrapS = m.normalMap.wrapS = T.RepeatWrapping; m.map.needsUpdate = m.normalMap.needsUpdate = true; m.normalScale.set(1.4, 1.4); return m; };
    const side = mk(L / 2.6), end = mk(th / 2.6), top = new T.MeshStandardMaterial({ color: 0x6a6460, roughness: 0.7, metalness: 0.4 });
    // boîte : faces +X/−X, +Y/−Y, +Z/−Z (repère local, longueur le long de X)
    const box = new T.Mesh(new T.BoxGeometry(L - 0.1, H - 0.12, th - 0.1), [end, end, top, top, side, side]); box.castShadow = box.receiveShadow = true; g.add(box);
    const frame = mat('cadreConteneur', () => new T.MeshStandardMaterial({ color: 0x2f2b28, roughness: 0.6, metalness: 0.6 }));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = new T.Mesh(new T.BoxGeometry(0.16, H, 0.16), frame); p.position.set(sx * (L / 2 - 0.08), 0, sz * (th / 2 - 0.08)); g.add(p);
      const cc = new T.Mesh(new T.BoxGeometry(0.18, 0.12, 0.18), frame); cc.position.set(sx * (L / 2 - 0.08), H / 2 - 0.06, sz * (th / 2 - 0.08)); g.add(cc); }
    for (const sy of [-1, 1]) for (const sz of [-1, 1]) { const r = new T.Mesh(new T.BoxGeometry(L, 0.12, 0.1), frame); r.position.set(0, sy * (H / 2 - 0.06), sz * (th / 2 - 0.04)); g.add(r); }
    // portes (bout +X) : deux battants, 4 barres de verrouillage et poignées
    const bar = mat('barreConteneur', () => new T.MeshStandardMaterial({ color: 0x8c8780, roughness: 0.35, metalness: 0.85 }));
    for (const z of [-0.75, -0.35, 0.35, 0.75]) { const b = new T.Mesh(new T.CylinderGeometry(0.022, 0.022, H - 0.25, 8), bar); b.position.set(L / 2 - 0.02, 0, z * th / 2.4); g.add(b);
      const hd = new T.Mesh(new T.BoxGeometry(0.05, 0.05, 0.22), bar); hd.position.set(L / 2 + 0.01, -0.1, z * th / 2.4 + 0.1); g.add(hd); }
    const seam = new T.Mesh(new T.BoxGeometry(0.02, H - 0.2, 0.02), frame); seam.position.set(L / 2 - 0.04, 0, 0); g.add(seam);
    g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    if (!along) g.rotation.y = Math.PI / 2;
    if ((seed & 1) === 0) g.rotation.y += Math.PI;   // portes d'un côté ou de l'autre
    return g;
  }
  // ---- pile de caisses : palette en bois, caisses à claire-voie, cartons filmés, sangles --------------------------
  function woodTex(seed) {
    const key = 'bois' + seed; if (texCache[key]) return texCache[key];
    const R = rng(seed), N = 256, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
    for (let y = 0; y < N; y += 32) { const t = 0.8 + R() * 0.35; g.fillStyle = `rgb(${Math.round(150 * t)},${Math.round(112 * t)},${Math.round(70 * t)})`; g.fillRect(0, y, N, 32);
      for (let k = 0; k < 40; k++) { g.strokeStyle = `rgba(70,45,20,${0.1 + R() * 0.2})`; g.lineWidth = 0.6 + R(); const yy = y + R() * 32; g.beginPath(); g.moveTo(0, yy); g.bezierCurveTo(N * 0.3, yy + (R() - 0.5) * 6, N * 0.7, yy + (R() - 0.5) * 6, N, yy + (R() - 0.5) * 4); g.stroke(); }
      g.fillStyle = 'rgba(30,20,10,0.75)'; g.fillRect(0, y, N, 2); for (const x of [N * 0.1, N * 0.9]) { g.beginPath(); g.arc(x, y + 16, 2, 0, 7); g.fill(); } }
    for (let k = 0; k < 30; k++) { const x = R() * N, y = R() * N, r = 6 + R() * 20; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(40,40,40,0.25)'); gr.addColorStop(1, 'rgba(40,40,40,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
    return (texCache[key] = tex(c, true));
  }
  function cartonTex() {
    if (texCache.carton) return texCache.carton;
    const R = rng(91), N = 256, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
    g.fillStyle = '#a9875a'; g.fillRect(0, 0, N, N); for (let k = 0; k < 3000; k++) { g.fillStyle = `rgba(${R() < 0.5 ? '80,60,30' : '200,170,120'},${R() * 0.15})`; g.fillRect(R() * N, R() * N, 2, 2); }
    g.fillStyle = 'rgba(200,180,140,0.9)'; g.fillRect(N * 0.44, 0, N * 0.12, N);   // ruban adhésif
    g.strokeStyle = 'rgba(60,40,20,0.5)'; g.lineWidth = 2; g.strokeRect(2, 2, N - 4, N - 4);
    g.fillStyle = 'rgba(30,30,30,0.7)'; g.font = 'bold 22px Arial'; g.fillText('↑↑', 18, 40); g.fillText('FRAGILE', 18, N - 24);
    return (texCache.carton = tex(c, true));
  }
  function crates(o) {
    const g = new T.Group(), R = rng(Math.floor(o.x * 17 + o.z * 29) + 5), H = o.h, W = o.w, D = o.d;
    const wood = new T.MeshStandardMaterial({ map: woodTex(1 + Math.floor(R() * 3)), roughness: 0.85 }), dark = mat('boisSombre', () => new T.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 }));
    const carton = mat('carton', () => new T.MeshStandardMaterial({ map: cartonTex(), roughness: 0.92 }));
    const film = mat('filmEtirable', () => new T.MeshPhysicalMaterial({ color: 0xdfe8ec, roughness: 0.25, transparent: true, opacity: 0.28, clearcoat: 0.6, depthWrite: false }));
    const y0 = -H / 2;
    // palette (14 cm) : planches du dessus, dés, semelles
    const pal = (px, pz, pw, pd, py) => { for (let k = 0; k < 7; k++) { const pl = new T.Mesh(new T.BoxGeometry(pw, 0.022, pd / 7 - 0.03), wood); pl.position.set(px, py + 0.13, pz - pd / 2 + (k + 0.5) * pd / 7); g.add(pl); }
      for (const sx of [-1, 0, 1]) for (const sz of [-1, 0, 1]) { const b = new T.Mesh(new T.BoxGeometry(0.1, 0.08, 0.1), dark); b.position.set(px + sx * (pw / 2 - 0.06), py + 0.08, pz + sz * (pd / 2 - 0.06)); g.add(b); }
      for (const sz of [-1, 0, 1]) { const b = new T.Mesh(new T.BoxGeometry(pw, 0.022, 0.1), wood); b.position.set(px, py + 0.03, pz + sz * (pd / 2 - 0.06)); g.add(b); } };
    pal(0, 0, W - 0.02, D - 0.02, y0);
    // empilement : caisses à claire-voie en bas, cartons filmés au-dessus (remplit la boîte de la simulation)
    let y = y0 + 0.15; const layers = Math.max(2, Math.round((H - 0.15) / 0.62));
    const lh = (H - 0.15) / layers;
    for (let l = 0; l < layers; l++) {
      const crate = l < Math.ceil(layers / 2), nx = W > 1.6 ? 2 : 1, nz = D > 1.6 ? 2 : 1;
      for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
        const cw = W / nx - 0.04 - R() * 0.06, cd = D / nz - 0.04 - R() * 0.06, ch = lh - 0.03 - (l === layers - 1 ? R() * 0.15 : 0);
        const cx = -W / 2 + (ix + 0.5) * W / nx + (R() - 0.5) * 0.04, cz = -D / 2 + (iz + 0.5) * D / nz + (R() - 0.5) * 0.04;
        const m = new T.Mesh(new T.BoxGeometry(cw, ch, cd), crate ? wood : carton); m.position.set(cx, y + ch / 2, cz); m.rotation.y = (R() - 0.5) * 0.06; g.add(m);
        if (crate) for (const sy of [-1, 1]) { const f = new T.Mesh(new T.BoxGeometry(cw + 0.02, 0.07, cd + 0.02), dark); f.position.set(cx, y + ch / 2 + sy * (ch / 2 - 0.04), cz); f.rotation.y = m.rotation.y; g.add(f); }
      }
      y += lh;
    }
    const wrap = new T.Mesh(new T.BoxGeometry(W + 0.01, H - 0.15 - lh * Math.ceil(layers / 2) + 0.02, D + 0.01), film); wrap.position.y = y0 + 0.15 + lh * Math.ceil(layers / 2) + (H - 0.15 - lh * Math.ceil(layers / 2)) / 2; g.add(wrap);
    const strap = mat('sangle', () => new T.MeshStandardMaterial({ color: 0x1d3f7a, roughness: 0.6 }));
    for (const off of [-0.25, 0.25]) { const s1 = new T.Mesh(new T.BoxGeometry(W + 0.03, H - 0.12, 0.04), strap); s1.position.set(0, 0.04, off * D); g.add(s1); }
    g.traverse(m => { if (m.isMesh && m.material !== film) { m.castShadow = true; m.receiveShadow = true; } });
    return g;
  }
  // muret : béton clair, chanfreins
  function lowWall(o) { const K = M3(); const m = new T.Mesh(new T.BoxGeometry(o.w, o.h, o.d), K.betonClair); const g = new T.Group(); g.add(m); const cap = new T.Mesh(new T.BoxGeometry(o.w + 0.08, 0.08, o.d + 0.08), K.betonClair); cap.position.y = o.h / 2 - 0.04; g.add(cap); return g; }
  // touffe de feuillage : sphère bosselée (lobes + petit relief, fonction de la position : pas de couture), normales lisses,
  // couleur par sommet (dessous et creux plus sombres, feuilles plus ou moins claires) ; 4 variantes partagées
  const BUSH = [];
  function bushGeo(i, lo) {
    i = (i % 4) + (lo ? 4 : 0); if (BUSH[i]) return BUSH[i];   // lo : couvre-sol, petit et nombreux (≈ 100 triangles)
    const Rb = rng(71 + i * 13), g = lo ? new T.SphereGeometry(1, 10, 7) : new T.SphereGeometry(1, 16, 11), pa = g.attributes.position, v = new T.Vector3(), n = new T.Vector3();
    const lobes = Array.from({ length: 7 }, () => [new T.Vector3(Rb() - 0.5, Rb() * 0.8 - 0.2, Rb() - 0.5).normalize(), 0.12 + Rb() * 0.16]);
    const col = new Float32Array(pa.count * 3), h = (x, y, z) => { const t = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return t - Math.floor(t); };
    for (let k = 0; k < pa.count; k++) {
      n.fromBufferAttribute(pa, k).normalize(); let r = 0.82;
      for (const [d, a] of lobes) r += a * Math.pow(Math.max(0, n.dot(d)), 2.5);
      r += 0.05 * Math.sin(n.x * 11 + n.y * 7) * Math.sin(n.z * 13 - n.y * 5) + (h(+n.x.toFixed(3), +n.y.toFixed(3), +n.z.toFixed(3)) - 0.5) * 0.16;   // feuilles : silhouette déchiquetée
      v.copy(n).multiplyScalar(r); if (v.y < -0.35) v.y = -0.35 - (v.y + 0.35) * 0.3;   // posée sur la terre
      pa.setXYZ(k, v.x, v.y, v.z);
      const ao = 0.45 + 0.55 * Math.min(1, Math.max(0, (n.y + 0.55) / 1.2)), j = 0.82 + 0.3 * h(+n.z.toFixed(3), +n.x.toFixed(3), 3.1);
      col[k * 3] = ao * j * (0.95 + 0.1 * h(n.y, 1.7, n.x)); col[k * 3 + 1] = ao * j; col[k * 3 + 2] = ao * j * 0.92;
    }
    g.setAttribute('color', new T.BufferAttribute(col, 3)); g.computeVertexNormals(); return (BUSH[i] = g);
  }
  // feuillage : la surface lisse des touffes est cassée en « feuilles » de ~4 cm (normale et teinte tirées au hasard par
  // cellule de l'espace) ; coût : quelques instructions par pixel, aucune texture
  function feuillage(m) {
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = 'varying vec3 vLeafP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vLeafP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'varying vec3 vLeafP;\nvec3 leafH(vec3 q) { return fract(sin(vec3(dot(q, vec3(127.1, 311.7, 74.7)), dot(q, vec3(269.5, 183.3, 246.1)), dot(q, vec3(113.5, 271.9, 124.6)))) * 43758.5453); }\n' + sh.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 lp = vLeafP * 30.0, lb = floor(lp - 0.5), lid = lb, lv = vec3(0.0); float ld = 9.0;   // bruit cellulaire : feuilles arrondies
          for (int i = 0; i < 2; i++) for (int j = 0; j < 2; j++) for (int k = 0; k < 2; k++) { vec3 c = lb + vec3(float(i), float(j), float(k)), f = c + 0.15 + 0.7 * leafH(c), e = lp - f; float dd = dot(e, e); if (dd < ld) { ld = dd; lid = c; lv = e; } }
          ld = sqrt(ld); vec3 leafR = leafH(lid + 7.0);
          diffuseColor.rgb *= (0.62 + 0.6 * leafR.x) * (1.0 - 0.4 * smoothstep(0.3, 0.75, ld));`)
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n normal = normalize(normal + normalize(lv + 1e-4) * 0.45 + (leafR - 0.5) * 0.6);');
    };
    m.customProgramCacheKey = () => 'feuillage'; return m;
  }
  // bac à fleurs : jardinière en béton, terre, petites plantes
  function planter(o) {
    const K = M3(), g = new T.Group();
    const outer = new T.Mesh(new T.BoxGeometry(o.w, o.h, o.d), K.betonClair); g.add(outer);
    const soil = new T.Mesh(new T.BoxGeometry(o.w - 0.2, 0.05, o.d - 0.2), mat('terre', () => new T.MeshStandardMaterial({ color: 0x3a2c20, roughness: 1 }))); soil.position.y = o.h / 2 - 0.08; g.add(soil);
    // couvre-sol : touffes basses et irrégulières (deux verts, un peu de paille), pas de « boules »
    const leaf = mat('buisV', () => feuillage(new T.MeshStandardMaterial({ color: 0x41592c, roughness: 0.9, vertexColors: true }))), leaf2 = mat('buis2V', () => feuillage(new T.MeshStandardMaterial({ color: 0x5b6b33, roughness: 0.95, vertexColors: true }))), paille = mat('pailleV', () => feuillage(new T.MeshStandardMaterial({ color: 0x8a7a4a, roughness: 1, vertexColors: true })));
    const R = rng(Math.floor(o.x * 13 + o.z * 7)), n = Math.round((o.w * o.d) * 5);
    for (let k = 0; k < n; k++) { const r = 0.07 + R() * 0.11, b = new T.Mesh(bushGeo(k, true), R() < 0.15 ? paille : R() < 0.5 ? leaf2 : leaf); b.scale.setScalar(r); b.position.set((R() - 0.5) * (o.w - 0.3), o.h / 2 - 0.03 + r * 0.3, (R() - 0.5) * (o.d - 0.3)); b.scale.set(r * (1 + R() * 0.6), r * (0.35 + R() * 0.35), r * (1 + R() * 0.6)); b.rotation.y = R() * 6; b.castShadow = true; g.add(b); }
    // du volume : arbustes bas (boules irrégulières de 30 à 55 cm) et touffes de graminées (lames fines)
    const nb = Math.max(2, Math.round(o.w * o.d * 1.2));
    for (let k = 0; k < nb; k++) { const r = 0.16 + R() * 0.12, b = new T.Mesh(bushGeo(k + 2), R() < 0.5 ? leaf : leaf2); const px = (R() - 0.5) * (o.w - 0.5), pz = (R() - 0.5) * (o.d - 0.5); if (Math.hypot(px, pz) < 0.35) continue; b.position.set(px, o.h / 2 + r * 0.55, pz); b.scale.set(r * (1 + R() * 0.4), r * (0.9 + R() * 0.6), r * (1 + R() * 0.4)); b.rotation.set((R() - 0.5) * 0.3, R() * 6, (R() - 0.5) * 0.3); b.castShadow = true; g.add(b); }
    const lame = mat('graminee', () => new T.MeshStandardMaterial({ color: 0x7d8a45, roughness: 0.9, side: T.DoubleSide }));
    for (let k = 0; k < nb; k++) { const t = new T.Group(), px = (R() - 0.5) * (o.w - 0.4), pz = (R() - 0.5) * (o.d - 0.4); if (Math.hypot(px, pz) < 0.35) continue;
      for (let j = 0; j < 7; j++) { const h = 0.3 + R() * 0.3, bl = new T.Mesh(new T.PlaneGeometry(0.035, h), lame); bl.position.y = h / 2; bl.rotation.set((R() - 0.5) * 0.7, R() * 3, (R() - 0.5) * 0.7); t.add(bl); }
      t.position.set(px, o.h / 2 - 0.02, pz); g.add(t); }
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
    const walls = { creme: ['#d9cdb3', '#c9bc9f'], rose: ['#d4a99a', '#c39586'], blanc: ['#e3e0d8', '#cfcbc1'], sable: ['#c8b48e', '#b7a27b'], gris: ['#a9aaa6', '#97989a'], brique: ['#8e4e3a', '#7a4231'], pierre: ['#8a6a52', '#755944'] }[tone] || ['#d0c6b0', '#bfb59e'];
    const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, walls[0]); grd.addColorStop(1, walls[1]); g.fillStyle = grd; g.fillRect(0, 0, W, H);
    const briqueVraie = tone === 'brique';   // briques : appareil à l'échelle réelle ajouté dans le shader (fenetresInterieures), pas peint ici
    if (tone === 'pierre' || (tone === 'brique' && !briqueVraie)) {   // appareil de pierres de taille : joints clairs, teinte de chaque élément
      const bw = tone === 'brique' ? 16 : 40, bh = tone === 'brique' ? 6 : 16;
      for (let y = 0; y < H; y += bh) for (let x = -(Math.floor(y / bh) % 2) * bw / 2; x < W; x += bw) {
        const t = 0.82 + R() * 0.3; g.fillStyle = `rgba(${tone === 'brique' ? '150,80,58' : '140,108,84'},${0.25 + R() * 0.35})`; g.globalAlpha = 1; g.fillRect(x + 1, y + 1, bw - 1.5, bh - 1.5);
        if (R() < 0.08) { g.fillStyle = `rgba(30,20,15,${0.15 * t})`; g.fillRect(x + 1, y + 1, bw - 1.5, bh - 1.5); } }
      g.fillStyle = 'rgba(200,190,175,0.18)'; for (let y = 0; y < H; y += bh) g.fillRect(0, y, W, 1);
      // corniches à chaque étage
      for (let y = 0; y < H; y += H / 8) { g.fillStyle = 'rgba(210,200,185,0.55)'; g.fillRect(0, y + H / 8 - 6, W, 5); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y + H / 8 - 1, W, 2); }
    }
    if (briqueVraie) for (let y = 0; y < H; y += H / 8) { g.fillStyle = 'rgba(210,200,185,0.55)'; g.fillRect(0, y + H / 8 - 6, W, 5); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y + H / 8 - 1, W, 2); }
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
      if (tone === 'brique' || tone === 'pierre') { g.fillStyle = 'rgba(215,205,190,0.85)'; g.fillRect(x - 4, y - 7, w + 8, 6); g.fillRect(x - 3, y + h, w + 6, 5); g.strokeStyle = 'rgba(230,225,215,0.7)'; g.lineWidth = 2; g.strokeRect(x, y, w, h); }   // linteaux, appuis, cadres
      if (row % 2 === 1 && R() < 0.5) { g.fillStyle = 'rgba(70,70,70,0.9)'; g.fillRect(col * cw + 4, y + h + 2, cw - 8, rh * 0.08); for (let k = 0; k < 8; k++) g.fillRect(col * cw + 6 + k * (cw - 12) / 7, y + h - rh * 0.12, 2, rh * 0.14); }
      if (R() < 0.12) { g.fillStyle = '#d7d7d2'; g.fillRect(x + w * 0.65, y + h + 6, w * 0.3, rh * 0.12); }   // climatiseur
    }
    const map = new T.CanvasTexture(c); map.colorSpace = T.SRGBColorSpace; map.anisotropy = 8; map.wrapS = map.wrapT = T.RepeatWrapping;
    const rough = new T.CanvasTexture(rc); rough.wrapS = rough.wrapT = T.RepeatWrapping;
    const emi = new T.CanvasTexture(ec); emi.colorSpace = T.SRGBColorSpace; emi.wrapS = emi.wrapT = T.RepeatWrapping;
    return (texCache[key] = { map, rough, emi, tileW: 14, tileH: 26 });
  }
  const NIGHT = { on: false, mats: [] };
  // ---- fenêtres « à intérieur » (interior mapping) : derrière chaque vitre, une vraie pièce en perspective (mur du fond,
  // murs latéraux, sol, plafond, un meuble, rideaux ou store) calculée dans le shader à partir du rayon de vue : la façade
  // gagne de la profondeur sous tous les angles. Le jour, pièces dans la pénombre derrière le reflet du ciel ; la nuit, les
  // pièces allumées (mêmes que la carte d'émission) sont éclairées de l'intérieur, les autres restent sombres.
  const FAC = { uDay: { value: 1 }, uNight: { value: 0 } };
  // + matière du mur à l'échelle réelle : briques (scannées, ou procédurales en secours) ou enduit / béton (relief et nuances),
  // couleur normalisée par sa moyenne (la teinte de la façade est gardée), relief appliqué dans le repère de la face
  function fenetresInterieures(m, seed, tone) {
    const brique = tone === 'brique', dW = brique ? PBRdet('brique', brickDet()) : PBRdet('beton', concrete()), wu = detU(dW);
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uDay = FAC.uDay; sh.uniforms.uNight = FAC.uNight; sh.uniforms.uSeed = { value: seed };
      Object.assign(sh.uniforms, { tWA: wu.tDet, tWN: wu.tDetN, uWM: wu.uM, uWK: { value: brique ? 0.9 : 0.45 }, uWB: { value: brique ? 1.0 : 0.55 } });
      sh.vertexShader = 'varying vec3 vFWPos; varying vec3 vFWN;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
        vFWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vFWN = normalize(mat3(modelMatrix) * objectNormal);`);
      sh.fragmentShader = 'uniform float uDay, uNight, uSeed, uWM, uWK, uWB; uniform sampler2D tWA, tWN; varying vec3 vFWPos; varying vec3 vFWN;\nfloat fH(vec2 p) { return fract(sin(dot(p, vec2(41.31, 289.17))) * 15731.743); }\n' + sh.fragmentShader
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float fGlass = 0.0; vec3 fInt = vec3(0.0);
        #ifdef USE_ROUGHNESSMAP
        if (abs(vFWN.y) < 0.5) {
          vec2 cell = vec2(fract(vMapUv.x) * 4.0, (1.0 - fract(vMapUv.y)) * 8.0), fc = fract(cell);
          vec2 cid = floor(cell) + floor(vMapUv) * vec2(4.0, 8.0);
          // vitre : fenêtre de la grille ET rugosité très faible (pas les volets fermés ni le montant)
          float inWin = step(0.18, fc.x) * step(fc.x, 0.82) * step(0.22, fc.y) * step(fc.y, 0.78);
          fGlass = inWin * (1.0 - smoothstep(0.08, 0.3, texelRoughness.g));
          if (fGlass > 0.0) {
            vec3 N = normalize(vFWN), Tg = normalize(cross(vec3(0.0, 1.0, 0.0), N)), V = normalize(vFWPos - cameraPosition);
            vec3 d = vec3(dot(V, Tg), V.y, max(dot(V, -N), 0.02));
            vec3 RS = vec3(3.5, 3.25, 3.6), p = vec3(fc.x * RS.x, (1.0 - fc.y) * RS.y, 0.0);
            float tx = d.x > 1e-4 ? (RS.x - p.x) / d.x : (d.x < -1e-4 ? -p.x / d.x : 1e5);
            float ty = d.y > 1e-4 ? (RS.y - p.y) / d.y : (d.y < -1e-4 ? -p.y / d.y : 1e5);
            float tz = RS.z / d.z, t = min(tz, min(tx, ty)); vec3 hp = p + d * t;
            float r1 = fH(cid + uSeed * 7.13 + N.xz * 3.1), r2 = fract(r1 * 13.7), r3 = fract(r1 * 71.3), r4 = fract(r1 * 291.1);
            vec3 wallC = r2 < 0.33 ? vec3(0.62, 0.56, 0.46) : r2 < 0.66 ? vec3(0.5, 0.54, 0.56) : vec3(0.6, 0.52, 0.5);
            vec3 col; float sh = 1.0;
            if (t == tz) { col = wallC * 0.95;
              // cadre / étagère sur le mur du fond
              vec2 q = hp.xy - vec2(0.8 + r3 * 1.8, 1.5); if (abs(q.x) < 0.45 && abs(q.y) < 0.32) col = mix(vec3(0.25, 0.22, 0.2), vec3(0.55, 0.35, 0.25) * (0.6 + r4), step(abs(q.x), 0.4) * step(abs(q.y), 0.27)); }
            else if (t == tx) { col = wallC * 0.78; }
            else if (d.y < 0.0) { col = (r3 < 0.5 ? vec3(0.32, 0.21, 0.13) : vec3(0.3, 0.3, 0.32)) * (0.85 + 0.3 * fract(hp.x * 1.7)); sh = 0.8; }
            else { col = vec3(0.78, 0.77, 0.74); sh = 1.15; }
            // meuble (canapé, bureau, armoire) à mi-profondeur
            float zf = 1.1 + r4 * 1.6, tf = zf / d.z;
            if (tf < t) { vec3 fp = p + d * tf; float fh = r3 < 0.7 ? 0.85 : 1.9, fx0 = 0.3 + r2 * 1.4;
              if (fp.y < fh && fp.x > fx0 && fp.x < fx0 + 1.4 + r1) { col = r3 < 0.35 ? vec3(0.22, 0.24, 0.3) : r3 < 0.7 ? vec3(0.4, 0.28, 0.18) : vec3(0.5, 0.48, 0.44); t = tf; hp = fp; sh = 0.85; } }
            sh *= 1.0 - 0.55 * smoothstep(0.0, RS.z, hp.z);   // pénombre vers le fond
            // rideaux sur les côtés, store à demi baissé en haut
            float wx = (fc.x - 0.18) / 0.64, wy = (fc.y - 0.22) / 0.56, cw = 0.08 + 0.22 * r4, blind = r2 < 0.3 ? 0.15 + 0.5 * r3 : 0.0;
            vec3 rid = r1 < 0.5 ? vec3(0.7, 0.62, 0.5) : vec3(0.45, 0.5, 0.58); float curt = 0.0;
            if (r3 > 0.35 && (wx < cw || wx > 1.0 - cw)) curt = 1.0;
            if (wy < blind) { curt = 1.0; rid = vec3(0.78, 0.76, 0.7) * (0.85 + 0.15 * step(0.5, fract(wy * 40.0))); }
            col = mix(col * sh, rid, curt);
            // éclairage : pénombre le jour ; la nuit, pièces allumées selon la carte d'émission (couleur de la lampe)
            vec3 eL = vec3(0.0);
            #ifdef USE_EMISSIVEMAP
            eL = texture2D(emissiveMap, (floor(cell) + 0.5) / vec2(4.0, 8.0) * vec2(1.0, -1.0) + vec2(0.0, 1.0) + floor(vMapUv)).rgb;
            #endif
            float lit = step(0.05, eL.r);
            vec3 nightL = lit * eL * (2.4 + 1.6 * curt) + (1.0 - lit) * (r4 < 0.08 ? vec3(0.03, 0.05, 0.12) : vec3(0.004));
            fInt = col * (uDay * 0.09 + uNight * nightL);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.25, fGlass);
          }
        }
        #endif
        vec2 wUv = vec2(vMapUv.x * 14.0, vMapUv.y * 26.0) / uWM;
        if (abs(vFWN.y) < 0.5) { vec3 wA = texture2D(tWA, wUv).rgb / max(textureLod(tWA, wUv, 12.0).rgb, vec3(0.02));
          diffuseColor.rgb *= mix(vec3(1.0), clamp(wA, 0.0, 2.5), uWK * (1.0 - fGlass)); }`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (abs(vFWN.y) < 0.5 && fGlass < 0.5) { vec3 Nw = normalize(vFWN), Tw = normalize(cross(vec3(0.0, 1.0, 0.0), Nw)); vec3 nt = texture2D(tWN, wUv).xyz * 2.0 - 1.0;
          normal = normalize((viewMatrix * vec4(normalize(Tw * nt.x * uWB + vec3(0.0, 1.0, 0.0) * nt.y * uWB + Nw * max(nt.z, 0.2)), 0.0)).xyz); }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance = mix(totalEmissiveRadiance, fInt, fGlass);`);
    };
    m.customProgramCacheKey = () => 'fenetresInt';
    return m;
  }
  function building(w, h, d, tone, seed) {
    const F = facadeTex(seed % 4, tone), g = new T.Group(); tone = tone || '';
    const fm = new T.MeshStandardMaterial({ map: F.map, roughnessMap: F.rough, roughness: 1, metalness: 0.1, emissiveMap: F.emi, emissive: 0xffffff, emissiveIntensity: 0 });
    NIGHT.mats.push(fm); fenetresInterieures(fm, seed % 97, tone);
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
    // escaliers de secours (façades en briques) : paliers et échelles métalliques noirs, sur une face
    if ((tone === 'brique' || tone === 'pierre') && R() < 0.75) {
      const fe = mat('escalierSecours', () => new T.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.55, metalness: 0.7 }));
      const face = Math.floor(R() * 4), fl = Math.floor((h - 4) / 3.25), span = Math.min(w, d) * 0.35, xs = (R() - 0.5) * 0.4;
      for (let f = 1; f <= fl; f++) {
        const y = 4 + f * 3.25 - 0.4, pl = new T.Group();
        const deck = new T.Mesh(new T.BoxGeometry(span, 0.06, 1.1), fe); deck.position.set(0, 0, 0.55); pl.add(deck);
        const rail = new T.Mesh(new T.BoxGeometry(span, 0.04, 0.04), fe); rail.position.set(0, 1.0, 1.08); pl.add(rail);
        for (let k = 0; k <= 6; k++) { const b = new T.Mesh(new T.BoxGeometry(0.03, 1.0, 0.03), fe); b.position.set(-span / 2 + k * span / 6, 0.5, 1.08); pl.add(b); }
        if (f < fl) { const st = new T.Mesh(new T.BoxGeometry(0.7, 0.05, 3.6), fe); st.rotation.x = Math.atan2(3.25, span * 0.8); st.rotation.y = Math.PI / 2; st.position.set(0, 1.62, 0.7); pl.add(st); }
        pl.position.y = y; const off = xs * (face % 2 ? d : w);
        if (face === 0) pl.position.set(off, y, d / 2); else if (face === 1) { pl.position.set(w / 2, y, off); pl.rotation.y = Math.PI / 2; } else if (face === 2) { pl.position.set(off, y, -d / 2); pl.rotation.y = Math.PI; } else { pl.position.set(-w / 2, y, off); pl.rotation.y = -Math.PI / 2; }
        g.add(pl);
      }
    }
    // stores des boutiques du rez-de-chaussée (toile rayée inclinée)
    const awnCols = [['#7a1f1f', '#d8cdb8'], ['#1f4a3a', '#d8cdb8'], ['#24364f', '#d8cdb8'], ['#6b4a1f', '#e0d4b8']];
    const awnTex = (k) => mat('store' + k, () => { const c = document.createElement('canvas'); c.width = 128; c.height = 32; const q = c.getContext('2d'); for (let i = 0; i < 8; i++) { q.fillStyle = awnCols[k][i % 2]; q.fillRect(i * 16, 0, 16, 32); } const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.wrapS = T.RepeatWrapping; return new T.MeshStandardMaterial({ map: t, roughness: 0.85, side: T.DoubleSide }); });
    for (const [fw, fd, rot, px, pz] of [[w, d, 0, 0, d / 2], [w, d, Math.PI, 0, -d / 2], [d, w, Math.PI / 2, w / 2, 0], [d, w, -Math.PI / 2, -w / 2, 0]]) {
      const nA = Math.max(1, Math.floor(fw / 6));
      for (let k = 0; k < nA; k++) { if (R() < 0.4) continue; const aw = new T.Mesh(new T.PlaneGeometry(fw / nA - 0.8, 1.3), awnTex(Math.floor(R() * 4))); aw.material.map && (aw.material.map.repeat.x = (fw / nA) / 2);
        const a = new T.Group(); aw.rotation.x = -0.9; aw.position.set(-fw / 2 + (k + 0.5) * fw / nA, 3.0, 0.5); a.add(aw); a.rotation.y = rot; a.position.set(px, 0, pz); g.add(a); }
    }
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
    const bulb = new T.Mesh(new T.BoxGeometry(0.6, 0.03, 0.22), mat('ampoule', () => new T.MeshStandardMaterial({ color: 0x8a8780, roughness: 0.35, metalness: 0.2, emissive: 0xffd9a0, emissiveIntensity: 0 }))); bulb.position.set(1.7, 7.77, 0); g.add(bulb);
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
    const W = map.width, D = map.depth, K = M3(), maps = groundMaps(map), OB = map.obstacles;
    group.add(groundMesh(map, maps, U));
    const pud = puddles(map, maps, U); if (pud) group.add(pud);
    // butées de parking dans les places (visuelles : 11 cm de haut, sous l'avant des voitures garées en marche avant)
    const MK = (map.def && map.def.marquage) || { rangees: [], murs: [] };
    const stop = (x, z, ry) => {   // pas de butée à travers un objet posé en tête de place (borne de recharge…) ; sous un véhicule, oui
      const hx = ry ? 0.09 : 0.7, hz = ry ? 0.7 : 0.09;
      if (OB.some(o => !/^(voiture|fourgon|bus)/.test(o.name || '') && x + hx > o.x && x - hx < o.x + o.w && z + hz > o.z && z - hz < o.z + o.d)) return;
      const b = stopBlock(); b.position.set(x, 0.055, z); b.rotation.y = ry; b.receiveShadow = b.castShadow = true; group.add(b); };
    for (const [x0, z0, n] of MK.rangees) for (let k = 0; k < n; k++) { const z = z0 + 2.5 * k + 1.25; stop(x0 + 4.2, z, Math.PI / 2); stop(x0 + 5.8, z, Math.PI / 2); }
    for (const [x, z, n, dx, dz] of MK.murs) for (let k = 0; k < n; k++) { if (dx) stop(x + dx * (k + 0.5), z > D / 2 ? z + 4.3 : z + 0.7, 0); else stop(x < W / 2 ? x + 0.7 : x + 4.3, z + dz * (k + 0.5), Math.PI / 2); }
    // trottoirs et rues à l'ouest, au sud et à l'est (au nord : les immeubles de la ruelle) : trottoir (4 m), rue (10 m),
    // trottoir d'en face (4 m)
    const side = mat('trottoir', () => worldMat(PBRdet('trottoir', concrete('clair')), { roughness: 0.9 }));
    const road = mat('rue', () => { const A = asphalt(); const m = worldMat(A, { roughness: 0.9, bump: 0.8 }); m.color.setHex(0xd8d8d8); return m; });
    const ring = (inner, width, m, y) => {
      const x0 = -inner, x1 = W + inner, z1 = D + inner, t = width, zt = -1;   // les côtés s'arrêtent au pied des immeubles
      for (const [cx, cz, w, d] of [[(x0 + x1) / 2, z1 + t / 2, x1 - x0 + 2 * t, t], [x0 - t / 2, (zt + z1) / 2, t, z1 - zt], [x1 + t / 2, (zt + z1) / 2, t, z1 - zt]]) {
        const s = new T.Mesh(new T.BoxGeometry(w, y * 2, d), m); s.position.set(cx, 0, cz); s.receiveShadow = true; group.add(s);
      }
    };
    ring(1, 4, side, 0.14); ring(5, 10, road, 0.01); ring(15, 4, side, 0.14);
    const lineM = mat('ligneRue', () => new T.MeshStandardMaterial({ color: 0xe8e6dc, roughness: 0.75 }));
    const dash = (x, z, w, d) => { const m = new T.Mesh(new T.PlaneGeometry(w, d), lineM); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.022, z); m.receiveShadow = true; group.add(m); };
    for (let x = -18; x < W + 18; x += 4) dash(x, D + 10, 2, 0.15);
    for (let z = 2; z < D + 6; z += 4) { dash(-10, z, 0.15, 2); dash(W + 10, z, 0.15, 2); }
    const gate = OB.find(o => o.name === 'mur portail sud');
    for (let k = -3; k <= 3; k++) dash((gate ? gate.x + gate.w / 2 : W / 2) + k * 0.9, D + 3, 0.45, 3.6);   // passage piéton devant l'entrée
    for (let k = -3; k <= 3; k++) dash(-10 + k * 1.1, D + 2, 0.55, 3.8);
    // lampadaires le long des trottoirs (ouest, sud, est) et dans le parking (îlots, milieu des rangées)
    const lampAt = (x, z, rot, y, k) => { const l = streetLamp(); l.position.set(x, y === undefined ? 0.14 : y, z); l.rotation.y = rot; l.traverse(o => { if (o.isMesh) o.castShadow = true; }); group.add(l); const p = l.userData.lightAt.clone().applyAxisAngle(new T.Vector3(0, 1, 0), rot).add(l.position); if (k) p.k = k; lights.push(p); };
    for (let x = -6; x <= W + 6; x += 14) if (!gate || Math.abs(x - gate.x - gate.w / 2) > 6) lampAt(x, D + 3.2, Math.PI / 2);
    for (let z = 6; z <= D - 6; z += 14) { lampAt(-3.2, z, Math.PI); lampAt(W + 3.2, z, 0); }
    for (const [x0, z0, n] of MK.rangees) { lampAt(x0 + 5, z0 + 2.5 * Math.floor(n / 2), 0, 0, 260); lampAt(x0 + 5, z0 + 2.5 * Math.floor(n / 2), Math.PI, 0, 260); }   // dans le parking : flaques de lumière bien visibles la nuit
    for (const o of OB.filter(o => o.name === 'bac à fleurs' && o.w * o.d > 4)) lampAt(o.x + 0.4, o.z + o.d / 2, 0, o.h, 260);
    // immeubles autour (au nord, derrière les arrières de boutiques de la ruelle : plus hauts, plus loin)
    const R = rng(2026), tones = ['brique', 'pierre', 'creme', 'brique', 'sable', 'pierre', 'brique', 'gris'];
    const place = (x, z, w, d, h, s) => { const b = building(w, h, d, tones[Math.floor(R() * tones.length)], s); b.position.set(x, 0.14, z); group.add(b); };
    let s = 0;
    for (const sd of [0, 1, 2, 3]) {
      const len = sd % 2 ? D + 60 : W + 60; let t = -30;
      while (t < len - 30) {
        const w = 12 + R() * 12, d = 12 + R() * 8, h = 14 + R() * 30, gap = 3 + R() * 5, off = 19 + d / 2 + R() * 2, c = t + w / 2;
        if (sd === 0) place(c, -off - 8, w, d, h + 8, s++); else if (sd === 2) place(c, D + off, w, d, h, s++);
        else if (sd === 1) place(W + off, c, d, w, h, s++); else place(-off, c, d, w, h, s++);
        t += w + gap;
      }
    }
    // la ruelle (immeubles en briques dont les arrières de boutiques donnent sur le parking) : ruelle.js s'il est chargé
    const RU = root.Ruelle;
    if (RU && RU.build) { try { RU.build(map, group, ctx); } catch (e) { console.warn('ruelle :', e); } }
    else for (let x = -6, k = 0; x < W + 6; k++) { const w = 9 + (k * 37 % 7), h = 9 + (k * 53 % 5); const b = building(w, h, 11, k % 3 ? 'brique' : 'pierre', 40 + k); b.position.set(x + w / 2, 0, -1 - 5.5); group.add(b); x += w; }
    // portes piétonnes dans les murs de clôture derrière les zones de départ (on arrive par là)
    for (const sp of map.spawns) {
      const ouest = sp.x < W / 2, g = new T.Group(), xw = ouest ? 0 : W;
      bx(g, 0.08, 2.2, 1.1, std('portePieton', 0x3c4a52, 0.5, 0.6), 0, 1.1, 0); bx(g, 0.12, 0.12, 1.4, K.betonClair, 0, 2.28, 0);
      panneau(g, 0.7, 0.25, (q, w, h) => { q.fillStyle = '#1a7a3a'; q.fillRect(0, 0, w, h); txt(q, 'ACCÈS PIÉTONS', w / 2, h / 2 + 4, 'bold 110px Arial', '#fff'); }, ouest ? 0.06 : -0.06, 2.6, 0, ouest ? Math.PI / 2 : -Math.PI / 2, true);
      g.position.set(ouest ? xw + 0.02 : xw - 0.02, 0, sp.z); group.add(g);
    }
    laverie(map, group);
    // îlots à bordure sous le mobilier du parking (débord de 35 cm : dans la marge des opérateurs, on ne marche jamais dessus) ;
    // herbe autour du poste électrique
    const herbe = mat('herbeIlot', () => new T.MeshStandardMaterial({ color: 0x4d6b34, roughness: 1 })), bord = mat('bordure', () => worldMat(concrete('clair'), { roughness: 0.9, color: 0xc8c4bb }));
    for (const o of OB) {
      if (!/^(bac à fleurs|haie|colonnes de tri|kiosque|caisse automatique|poste électrique|armoire|borne de recharge|aspirateur|guérite)$/.test(o.name || '')) continue;
      const e = 0.35, w = o.w + 2 * e, d = o.d + 2 * e, isle = new T.Group();
      bx(isle, w, 0.13, d, bord, 0, 0.065, 0);
      if (o.name === 'poste électrique' || o.name === 'armoire') bx(isle, w - 0.24, 0.02, d - 0.24, herbe, 0, 0.135, 0);
      isle.position.set(o.x + o.w / 2, 0, o.z + o.d / 2); isle.traverse(m => { if (m.isMesh) m.receiveShadow = true; }); group.add(isle);
    }
    const poste = OB.find(o => o.name === 'poste électrique');
    if (poste) for (const [x, z] of [[poste.x - 0.25, poste.z - 0.25], [poste.x + poste.w + 0.25, poste.z - 0.25], [poste.x - 0.25, poste.z + poste.d + 0.25], [poste.x + poste.w + 0.25, poste.z + poste.d + 0.25]]) {
      const b = new T.Group(); cyl(b, 0.08, 1.0, std('jauneBorne', 0xe8b51a, 0.5, 0.3), 0, 0.5, 0, 12); cyl(b, 0.085, 0.08, std('reflechissant', 0xf0f0f0, 0.25, 0.2), 0, 0.82, 0, 12); b.position.set(x, 0.13, z); b.traverse(m => { if (m.isMesh) m.castShadow = true; }); group.add(b); }
    // arbres le long des rues et voitures garées le long des trottoirs (modèles Meshy si chargés)
    const M3d = ctx && ctx.M3;
    const ARBRE = M3d && M3d.has('arbre') ? 'arbre' : 'palmier';
    if (M3d && M3d.has(ARBRE)) for (let k = 0; k < 18; k++) {
      const sd = k % 3, t = R(); let x, z;
      if (sd === 0) { x = -14 + t * (W + 28); z = D + 17; if (gate && Math.abs(x - gate.x - gate.w / 2) < 6) continue; } else if (sd === 1) { x = W + 17; z = t * (D + 10); } else { x = -17; z = t * (D + 10); }
      const p = M3d.fit(ARBRE, 3, ARBRE === 'arbre' ? 5.5 + R() * 2.5 : 7 + R() * 4, 3, { byHeight: true, rot: k * 2.3 }); p.children[0].position.y = 0; p.position.set(x, 0.14, z); p.traverse(o => { if (o.isMesh) { o.castShadow = true; o.userData.keep = true; } }); group.add(p);
    }
    if (M3d && M3d.has('berline')) {
      const kinds = ['berline', 'pickup', 'fourgon', 'berline'];
      for (let k = 0; k < 20; k++) {
        const sd = k % 3, t = (Math.floor(k / 3) + 0.5 + (R() - 0.5) * 0.4) / 7; let x, z, rot;
        if (sd === 0) { x = -12 + t * (W + 24); z = D + 6.3; rot = Math.PI; if (gate && Math.abs(x - gate.x - gate.w / 2) < 7) continue; }
        else if (sd === 1) { x = W + 6.3; z = t * (D + 6); rot = Math.PI / 2; } else { x = -6.3; z = t * (D + 6); rot = -Math.PI / 2; }
        const kd = kinds[k % kinds.length]; if (!M3d.has(kd)) continue;
        const c = M3d.fit(kd, kd === 'fourgon' ? 5.2 : 4.4, kd === 'fourgon' ? 2.3 : 1.45, kd === 'fourgon' ? 2.1 : 1.9, { flip: k % 2 === 0, tol: 0.3 });
        c.position.set(x, (kd === 'fourgon' ? 2.3 : 1.45) / 2, z); c.rotation.y = rot; c.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.userData.keep = true; } }); teinter(c, k * 5 + 3); group.add(c);
      }
    }
    try { props(map, group); } catch (e) { console.warn('parking (objets) :', e); }
    if (M3d) try { rue(map, group, M3d); } catch (e) { console.warn('parking (rue) :', e); }
    if (M3d && M3d.has('abribus')) { const a = M3d.fit('abribus', 4.5, 2.6, 1.6, { tol: 0.3 }); a.position.set(W / 2 - 14, 1.3 + 0.14, D + 16.6); a.rotation.y = Math.PI; a.traverse(o => { if (o.isMesh) { o.castShadow = true; o.userData.keep = true; } }); group.add(a); }
  }
  // bennes à ordures et armoires électriques sur les trottoirs (modèles Meshy ; visuels, hors de l'aire de jeu)
  function rue(map, group, M3d) {
    const W = map.width, D = map.depth, put = (n, w, h, d, x, z, r) => { if (!M3d.has(n)) return; const b = M3d.fit(n, w, h, d, { tol: 0.25 }); b.position.set(x, 0.14 + h / 2, z); b.rotation.y = r; b.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.userData.keep = true; } }); group.add(b); };
    for (const [x, z, r] of [[W + 18.1, D * 0.32, Math.PI / 2], [-18.2, D * 0.64, -Math.PI / 2 + 0.06], [W * 0.38, D + 18.1, Math.PI], [W * 0.86, D + 1.9, Math.PI - 0.08], [-1.9, D * 0.18, Math.PI / 2]])
      put('benne', 1.9, 1.3, 1.15, x, z, r);
    for (const [x, z, r] of [[W + 1.45, D * 0.71, -Math.PI / 2], [W * 0.62, D + 1.45, 0], [-1.45, D * 0.42, Math.PI / 2], [W + 17.9, D * 0.82, Math.PI / 2]])
      put('armoire', 1.1, 1.45, 0.5, x, z, r);
  }
  // ---------------------------------------------------------------------------------------------
  // Petits objets du quotidien : plaques d'égout, avaloirs, feuilles et papiers, potelets, poubelles, panneaux,
  // horodateurs, caméras de surveillance, chariots abandonnés (visuels seulement, hors des couverts de la simulation)
  // ---------------------------------------------------------------------------------------------
  function canvasTexP(N, draw, srgb) { const c = document.createElement('canvas'); c.width = c.height = N; draw(c.getContext('2d'), N); const t = new T.CanvasTexture(c); if (srgb) t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; return t; }
  function manholeMat() { return mat('regard', () => {
    const map = canvasTexP(256, (g, N) => { const R = rng(5); g.fillStyle = '#2a2826'; g.fillRect(0, 0, N, N); g.translate(N / 2, N / 2);
      g.strokeStyle = '#4a4642'; g.lineWidth = 10; g.beginPath(); g.arc(0, 0, N * 0.46, 0, 7); g.stroke();
      g.strokeStyle = '#3c3935'; g.lineWidth = 7; for (let r = N * 0.12; r < N * 0.42; r += N * 0.075) { g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke(); }
      for (let k = 0; k < 16; k++) { g.rotate(Math.PI / 8); g.fillStyle = '#3e3a36'; g.fillRect(N * 0.1, -3, N * 0.32, 6); }
      for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(${R() < 0.5 ? '120,80,50' : '20,18,16'},${R() * 0.25})`; g.fillRect((R() - 0.5) * N, (R() - 0.5) * N, 2, 2); } }, true);
    return new T.MeshStandardMaterial({ map, roughness: 0.55, metalness: 0.75, color: 0xb0aaa4 }); }); }
  function grateMat() { return mat('avaloir', () => {
    const map = canvasTexP(128, (g, N) => { g.fillStyle = '#121110'; g.fillRect(0, 0, N, N); g.fillStyle = '#4a4744'; g.fillRect(0, 0, N, 8); g.fillRect(0, N - 8, N, 8); g.fillRect(0, 0, 8, N); g.fillRect(N - 8, 0, 8, N); for (let x = 16; x < N - 8; x += 12) g.fillRect(x, 8, 5, N - 16); }, true);
    return new T.MeshStandardMaterial({ map, roughness: 0.5, metalness: 0.8 }); }); }
  function litterMat() { return mat('feuilles', () => {
    const map = canvasTexP(512, (g, N) => { const R = rng(77), C = N / 4; g.clearRect(0, 0, N, N);
      for (let i = 0; i < 16; i++) { const cx = (i % 4) * C + C / 2, cy = Math.floor(i / 4) * C + C / 2; g.save(); g.translate(cx, cy); g.rotate(R() * 6.28);
        if (i < 10) {   // feuilles mortes (platane, chêne) : brun, ocre, rouille
          const col = ['#8a5a2b', '#a8742e', '#6e4423', '#b9873f', '#7d3f1f'][i % 5]; g.fillStyle = col; g.beginPath();
          const L = C * 0.36; for (let k = 0; k <= 20; k++) { const a = k / 20 * Math.PI * 2, r = L * (0.55 + 0.45 * Math.abs(Math.sin(a * 2.5))) * (0.8 + R() * 0.1); g.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.8); } g.fill();
          g.strokeStyle = 'rgba(60,35,15,.8)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-L, 0); g.lineTo(L * 0.9, 0); g.stroke();
        } else if (i < 14) {   // papiers, tickets, emballages froissés
          g.fillStyle = ['#e8e4da', '#d9d2c0', '#c8d4dc', '#efe9d0'][i - 10]; const w = C * (0.3 + R() * 0.2), h = C * (0.2 + R() * 0.15); g.beginPath(); g.moveTo(-w, -h); g.lineTo(w * 0.9, -h * 1.1); g.lineTo(w, h * 0.8); g.lineTo(-w * 0.8, h); g.closePath(); g.fill();
          g.fillStyle = 'rgba(0,0,0,.15)'; for (let k = 0; k < 4; k++) g.fillRect(-w * 0.7, -h * 0.6 + k * h * 0.35, w * 1.3, 2);
        } else { g.fillStyle = i === 14 ? '#b22222' : '#2a5ea8'; g.fillRect(-C * 0.12, -C * 0.22, C * 0.24, C * 0.44); g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(-C * 0.12, -C * 0.05, C * 0.24, C * 0.08); }   // canette écrasée
        g.restore(); } }, true);
    return new T.MeshStandardMaterial({ map, alphaTest: 0.4, roughness: 0.9, side: T.DoubleSide }); }); }
  function signTexP(kind) {
    return canvasTexP(256, (g, N) => { g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, N, N);
      if (kind === 'P') { g.fillStyle = '#1f5fbf'; g.fillRect(10, 10, N - 20, N - 20); g.fillStyle = '#fff'; g.font = 'bold 190px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('P', N / 2, N / 2 + 10); }
      else if (kind === '10') { g.fillStyle = '#fff'; g.beginPath(); g.arc(N / 2, N / 2, N / 2 - 4, 0, 7); g.fill(); g.strokeStyle = '#d0201a'; g.lineWidth = 30; g.beginPath(); g.arc(N / 2, N / 2, N / 2 - 22, 0, 7); g.stroke(); g.fillStyle = '#111'; g.font = 'bold 110px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('10', N / 2, N / 2 + 6); }
      else {   // 'P<' : jalonnement vers l'entrée du parking (P et flèche vers la gauche de qui lit le panneau)
        g.fillStyle = '#1f5fbf'; g.fillRect(10, 10, N - 20, N - 20); g.fillStyle = '#fff'; g.font = 'bold 140px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('P', N / 2, N / 2 - 34);
        g.beginPath(); g.moveTo(N / 2 + 80, N / 2 + 58); g.lineTo(N / 2 - 30, N / 2 + 58); g.lineTo(N / 2 - 30, N / 2 + 36); g.lineTo(N / 2 - 85, N / 2 + 72); g.lineTo(N / 2 - 30, N / 2 + 108); g.lineTo(N / 2 - 30, N / 2 + 86); g.lineTo(N / 2 + 80, N / 2 + 86); g.closePath(); g.fill(); }
    }, true);
  }
  function props(map, group) {
    const W = map.width, D = map.depth, K = M3(), R = rng(4242);
    const free = (x, z, m) => !map.obstacles.some(o => x > o.x - m && x < o.x + o.w + m && z > o.z - m && z < o.z + o.d + m);
    // plaques d'égout (fonte) et avaloirs le long des bordures
    const mh = new T.Mesh(new T.CylinderGeometry(0.42, 0.42, 0.02, 32), manholeMat());
    for (const [x, z] of [[11, 26], [62, 14.2], [26.6, 33.4], [45.6, 15], [-10, D * 0.3], [W + 10, D * 0.7], [W * 0.75, D + 10]]) {
      if (!free(x, z, 0.6)) continue; const m = mh.clone(); m.position.set(x, 0.012, z); m.rotation.y = R() * 6; m.receiveShadow = true; group.add(m); }
    const gr = new T.Mesh(new T.BoxGeometry(0.9, 0.02, 0.4), grateMat());
    for (let x = 4; x < W - 2; x += 11) for (const z of [D + 5.25]) { const m = gr.clone(); m.position.set(x, 0.015, z); m.receiveShadow = true; group.add(m); }
    for (let z = 4; z < D - 2; z += 11) for (const x of [-5.25, W + 5.25]) { const m = gr.clone(); m.position.set(x, 0.015, z); m.rotation.y = Math.PI / 2; m.receiveShadow = true; group.add(m); }
    // feuilles mortes, papiers et canettes : surtout au pied des murs, des bordures et dans les coins (le vent les y pousse)
    const N = 900, inst = new T.InstancedMesh(new T.PlaneGeometry(0.22, 0.22), litterMat(), N), mtx = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), uvOff = new Float32Array(N * 2);
    let n = 0;
    for (let k = 0; k < N * 3 && n < N; k++) {
      let x, z; const r = R();
      if (r < 0.55) { const sd = Math.floor(R() * 4), t = R(), off = Math.pow(R(), 3) * 2.2; if (sd === 0) { x = t * W; z = off + 0.2; } else if (sd === 1) { x = t * W; z = D - off - 0.2; } else if (sd === 2) { x = off + 0.2; z = t * D; } else { x = W - off - 0.2; z = t * D; } }
      else if (r < 0.8) { const o = map.obstacles[Math.floor(R() * map.obstacles.length)]; const a = R() * 6.28, d = 0.2 + Math.pow(R(), 2) * 1.2; x = o.x + o.w / 2 + Math.cos(a) * (o.w / 2 + d); z = o.z + o.d / 2 + Math.sin(a) * (o.d / 2 + d); if (!free(x, z, 0.05)) continue; }
      else { x = -14 + R() * (W + 28); z = R() < 0.5 ? -1.5 - R() * 3 : D + 1.5 + R() * 3; }
      const sc = 0.7 + R() * 0.9, y = (x < 0 || x > W || z < 0 || z > D) && Math.abs(x - W / 2) < W / 2 + 5 && Math.abs(z - D / 2) < D / 2 + 5 ? 0.145 : 0.008 + R() * 0.004;
      e.set(-Math.PI / 2 + (R() - 0.5) * 0.25, 0, R() * 6.28, 'YXZ'); q.setFromEuler(e); mtx.compose(new T.Vector3(x, y, z), q, new T.Vector3(sc, sc, sc)); inst.setMatrixAt(n, mtx);
      const cell = R() < 0.82 ? Math.floor(R() * 10) : 10 + Math.floor(R() * 6); uvOff[n * 2] = (cell % 4) / 4; uvOff[n * 2 + 1] = 0.75 - Math.floor(cell / 4) / 4; n++;
    }
    inst.count = n; inst.receiveShadow = true;
    inst.geometry.setAttribute('uvOff', new T.InstancedBufferAttribute(uvOff, 2));
    inst.material.onBeforeCompile = (sh) => { sh.vertexShader = 'attribute vec2 uvOff;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = uv * 0.25 + uvOff;\n#endif'); };
    group.add(inst);
    // potelets de la promenade devant le centre commercial (acier gris, bande réfléchissante)
    const post = mat('potelet', () => new T.MeshStandardMaterial({ color: 0x3b4046, roughness: 0.4, metalness: 0.7 })), refl = mat('reflechissant', () => new T.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.25, metalness: 0.2, emissive: 0x222222 }));
    const bollard = () => { const g = new T.Group(); const c = new T.Mesh(new T.CylinderGeometry(0.075, 0.085, 0.95, 16), post); c.position.y = 0.475; g.add(c); const b = new T.Mesh(new T.CylinderGeometry(0.078, 0.078, 0.07, 16), refl); b.position.y = 0.78; g.add(b); const t = new T.Mesh(new T.SphereGeometry(0.075, 16, 8, 0, 6.29, 0, 1.57), post); t.position.y = 0.95; g.add(t); g.traverse(o => { if (o.isMesh) o.castShadow = true; }); return g; };
    for (let x = -12; x <= W + 12; x += 2.2) { if (x > 40 && x < 55) continue; const b = bollard(); b.position.set(x, 0.14, D + 1.6); group.add(b); }   // potelets le long du trottoir de la rue
    // poubelles (corbeille Vigipirate : cercle d'acier et sac transparent), horodateurs
    const steel = mat('acierPoub', () => new T.MeshStandardMaterial({ color: 0x5d646a, roughness: 0.35, metalness: 0.8 })), bag = mat('sac', () => new T.MeshPhysicalMaterial({ color: 0xdfe6ea, roughness: 0.3, transmission: 0.0, transparent: true, opacity: 0.55, side: T.DoubleSide }));
    const bin = () => { const g = new T.Group(); const p = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 1.0, 10), steel); p.position.set(0, 0.5, -0.22); g.add(p); const ringM = new T.Mesh(new T.TorusGeometry(0.21, 0.018, 8, 28), steel); ringM.rotation.x = Math.PI / 2; ringM.position.y = 0.92; g.add(ringM);
      const s = new T.Mesh(new T.CylinderGeometry(0.21, 0.17, 0.62, 20, 3, true), bag); s.position.y = 0.6; g.add(s); const tr = new T.Mesh(new T.SphereGeometry(0.12, 10, 8), mat('dechets', () => new T.MeshStandardMaterial({ color: 0x6b6458, roughness: 0.9 }))); tr.position.y = 0.42; tr.scale.y = 0.7; g.add(tr); g.traverse(o => { if (o.isMesh) o.castShadow = true; }); return g; };
    const meter = () => { const g = new T.Group(); const b = new T.Mesh(new T.BoxGeometry(0.42, 1.45, 0.3), mat('horodateur', () => new T.MeshStandardMaterial({ color: 0x2e5b8c, roughness: 0.4, metalness: 0.5 }))); b.position.y = 0.725; g.add(b);
      const sc = new T.Mesh(new T.PlaneGeometry(0.26, 0.16), mat('ecranHoro', () => new T.MeshStandardMaterial({ color: 0x10181c, emissive: 0x2a6a5a, emissiveIntensity: 0.6, roughness: 0.2 }))); sc.position.set(0, 1.12, 0.151); g.add(sc); const roof = new T.Mesh(new T.BoxGeometry(0.5, 0.06, 0.38), steel); roof.position.y = 1.48; g.add(roof); g.traverse(o => { if (o.isMesh) o.castShadow = true; }); return g; };
    for (let x = 3; x < W; x += 14) { if (Math.abs(x + 8 - 47.5) < 5) continue; const b2 = bin(); b2.position.set(x + 8, 0.14, D + 3.4); b2.rotation.y = Math.PI; group.add(b2); }
    for (const [x, z, r] of [[W * 0.3 - 1.4, D + 3.6, Math.PI], [-3.6, D * 0.5 + 3, Math.PI / 2], [W + 3.6, D * 0.3, -Math.PI / 2]]) { const m = meter();   /* (à l'écart des lampadaires et des panneaux) */ m.position.set(x, 0.14, z); m.rotation.y = r; group.add(m); }
    // panneaux : P (parking), limitation 10, sortie
    const poleM = mat('poteauPanneau', () => new T.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.35, metalness: 0.8 }));
    const sign = (kind, x, z, rot, round) => { const g = new T.Group(); const p = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 2.6, 10), poleM); p.position.y = 1.3; g.add(p);
      const face = new T.Mesh(round ? new T.CircleGeometry(0.32, 32) : new T.PlaneGeometry(0.6, 0.6), new T.MeshStandardMaterial({ map: signTexP(kind), roughness: 0.35, metalness: 0.1 })); face.position.set(0, 2.35, 0.045); g.add(face);
      const back = new T.Mesh(round ? new T.CircleGeometry(0.32, 32) : new T.PlaneGeometry(0.6, 0.6), poleM); back.position.set(0, 2.35, 0.04); back.rotation.y = Math.PI; g.add(back);
      g.position.set(x, 0.14, z); g.rotation.y = rot; g.traverse(o => { if (o.isMesh) o.castShadow = true; }); group.add(g); };
    // (face vers la rue, pas vers le mur aveugle du parking ; trottoir est : pas de sortie de ce côté, le panneau indique
    // l'entrée-sortie unique, au sud — à gauche de qui le lit depuis la rue)
    sign('P', -3.4, D + 3.4, -Math.PI * 0.25, false); sign('10', W + 3.4, D * 0.5 - 6, Math.PI / 2, true); sign('P<', W + 3.4, D * 0.5 + 6, Math.PI / 2, false); sign('P', W + 3.4, D + 3.4, Math.PI * 0.25, false); sign('10', -3.4, D * 0.5, -Math.PI / 2, true);
    // chantier : panneau provisoire « ROUTE BARRÉE » bridé sur le séparateur au bout de l'allée est, face aux voitures qui
    // descendent (le demi-tour est peint en jaune devant) ; rien de plus au sol : pas d'objet hors des boîtes de la simulation
    { const bar = map.obstacles.find(o => o.name === 'barrière' && o.x > W * 0.8);
      if (bar) { const g = new T.Group(); g.position.set(bar.x + 0.75, 0, bar.z - 0.03); g.rotation.y = Math.PI; group.add(g);
        for (const s of [-0.3, 0.3]) { const c = new T.Mesh(new T.CylinderGeometry(0.018, 0.018, 1.2, 8), poleM); c.position.set(s, 1.2, 0.02); c.castShadow = true; g.add(c); }
        const f = panneau(g, 0.8, 0.5, (q, w, h) => { q.fillStyle = '#f2c200'; q.fillRect(0, 0, w, h); q.strokeStyle = '#111'; q.lineWidth = 12; q.strokeRect(12, 12, w - 24, h - 24);
          let fs = 84; do { q.font = `bold ${fs}px Arial`; fs -= 4; } while (q.measureText('ROUTE BARRÉE').width > w - 56 && fs > 30); txt(q, 'ROUTE BARRÉE', w / 2, h * 0.42, q.font, '#111');
          txt(q, 'SAUF CHANTIER', w / 2, h * 0.74, 'bold 34px Arial', '#111'); }, 0, 1.55, 0.045, 0);
        f.castShadow = true; const bk = new T.Mesh(new T.PlaneGeometry(0.8, 0.5), poleM); bk.position.set(0, 1.55, 0.04); bk.rotation.y = Math.PI; g.add(bk); } }
    // caméras de surveillance au sommet de mâts, tournées vers le parking
    const camM = mat('cameraVS', () => new T.MeshStandardMaterial({ color: 0xe6e8ea, roughness: 0.4, metalness: 0.3 }));
    for (const [x, z] of [[0.22, 0.22], [W - 0.6, 0.6], [-2.2, D + 2.2], [W + 2.2, D + 2.2]]) {   // (nord-ouest : dans l'angle, à côté de la benne et pas à travers)
      const g = new T.Group(); const p = new T.Mesh(new T.CylinderGeometry(0.06, 0.08, 4.2, 10), poleM); p.position.y = 2.1; g.add(p);
      const body = new T.Mesh(new T.BoxGeometry(0.16, 0.14, 0.38), camM); body.position.set(0, 4.15, 0.2); body.rotation.x = 0.35; g.add(body);
      const lens = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.02, 14), mat('objectif', () => new T.MeshStandardMaterial({ color: 0x080a0c, roughness: 0.05, metalness: 0.9 }))); lens.rotation.x = Math.PI / 2 + 0.35; lens.position.set(0, 4.08, 0.4); g.add(lens);
      g.position.set(x, 0.14, z); g.lookAt(W / 2, 0.14, D / 2); g.traverse(o => { if (o.isMesh) o.castShadow = true; }); group.add(g);
    }
    // chariots abandonnés (fil d'acier) sur les trottoirs
    const wire = mat('chariot', () => new T.MeshStandardMaterial({ color: 0xb8bec4, roughness: 0.3, metalness: 0.9 })), red = mat('poigneeChariot', () => new T.MeshStandardMaterial({ color: 0xc0261e, roughness: 0.5 }));
    const cart = () => { const g = new T.Group(), L = 0.9, Wd = 0.55, H0 = 0.45, H1 = 0.95;
      const rod = (a, b, r) => { const d = b.clone().sub(a), m = new T.Mesh(new T.CylinderGeometry(r || 0.008, r || 0.008, d.length(), 5), wire); m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()); g.add(m); };
      const V = (x, y, z) => new T.Vector3(x, y, z);
      for (let i = 0; i <= 8; i++) { const x = -L / 2 + i * L / 8, sh = (i / 8) * 0.12; rod(V(x, H0, -Wd / 2 + sh), V(x, H1, -Wd / 2 - 0.02)); rod(V(x, H0, Wd / 2 - sh), V(x, H1, Wd / 2 + 0.02)); }
      for (let k = 0; k <= 4; k++) { const y = H0 + k * (H1 - H0) / 4; rod(V(-L / 2, y, -Wd / 2), V(L / 2, y, -Wd / 2)); rod(V(-L / 2, y, Wd / 2), V(L / 2, y, Wd / 2)); rod(V(-L / 2, y, -Wd / 2), V(-L / 2, y, Wd / 2)); rod(V(L / 2, y, -Wd / 2), V(L / 2, y, Wd / 2)); }
      for (let i = 0; i <= 6; i++) { const z = -Wd / 2 + i * Wd / 6; rod(V(-L / 2, H0, z), V(L / 2, H0, z)); }
      rod(V(L / 2 + 0.12, H1 + 0.05, -Wd / 2 - 0.03), V(L / 2 + 0.12, H1 + 0.05, Wd / 2 + 0.03), 0.018); g.children[g.children.length - 1].material = red;
      for (const [x, z] of [[-L / 2, -Wd / 2], [-L / 2, Wd / 2], [L / 2, -Wd / 2], [L / 2, Wd / 2]]) { rod(V(x, 0.08, z), V(x, H0, z), 0.012); const wh = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.035, 14), mat('roueChariot', () => new T.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 }))); wh.rotation.x = Math.PI / 2; wh.position.set(x, 0.06, z); g.add(wh); }
      g.traverse(o => { if (o.isMesh) o.castShadow = true; }); return g; };
    for (const [x, z, r] of [[W * 0.42, D + 2.6, 0.4], [-2.6, D * 0.8, 2.1], [W + 2.5, D * 0.15, -0.6]]) { const c = cart(); c.position.set(x, 0.14, z); c.rotation.y = r; group.add(c); }
  }
  // ---------------------------------------------------------------------------------------------
  // Pièces d'un vrai parking (dessinées par programme) : station de lavage, guérite, poste électrique, borne de recharge,
  // aspirateurs, haies, totem des tarifs, points de tri, clôtures de chantier bâchées, benne à gravats, portails à barrière,
  // local à poubelles ; et des replis quand un modèle Meshy manque (benne, palettes, armoire, clim, grillage…)
  // ---------------------------------------------------------------------------------------------
  const std = (k, color, rough, metal, extra) => mat(k, () => new T.MeshStandardMaterial(Object.assign({ color, roughness: rough === undefined ? 0.7 : rough, metalness: metal || 0 }, extra || {})));
  // une boîte w × h × d (centre x, y, z) ajoutée au groupe g
  function bx(g, w, h, d, m, x, y, z, ry) { const b = new T.Mesh(new T.BoxGeometry(w, h, d), m); b.position.set(x || 0, y || 0, z || 0); if (ry) b.rotation.y = ry; g.add(b); return b; }
  function cyl(g, r, h, m, x, y, z, seg) { const c = new T.Mesh(new T.CylinderGeometry(r, r, h, seg || 12), m); c.position.set(x || 0, y || 0, z || 0); g.add(c); return c; }
  // un panneau (texte sur fond) : plan texturé, double face si back
  function panneau(g, w, h, draw, x, y, z, ry, emiss) {
    const c = document.createElement('canvas'); c.width = Math.round(256 * Math.max(1, w / h)); c.height = 256; draw(c.getContext('2d'), c.width, c.height);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8;
    const m = new T.MeshStandardMaterial({ map: t, roughness: 0.45, emissive: emiss ? 0xffffff : 0x000000, emissiveMap: emiss ? t : null, emissiveIntensity: 0 });
    if (emiss) { NIGHT.mats.push(m); m.userData.nuit = typeof emiss === 'number' ? emiss : 0.9; }   // intensité la nuit (lisible, pas un halo blanc)
    const p = new T.Mesh(new T.PlaneGeometry(w, h), m); p.position.set(x, y, z); p.rotation.y = ry || 0; g.add(p); return p;
  }
  const txt = (q, s, x, y, font, col, align) => { q.font = font; q.fillStyle = col; q.textAlign = align || 'center'; q.textBaseline = 'middle'; q.fillText(s, x, y); };
  // ---- couleurs de carrosserie (voitures garées : pas toutes blanches)
  const PAL = [0x6a6f76, 0xc4c8cc, 0xf4f2ec, 0xb03030, 0x34528a, 0x56684a, 0xd4c29c, 0x8a8d92, 0x8c3040, 0x6a8cab, 0xece9e0, 0x2e3034];
  const tintCache = {};
  function teinter(g, k) {
    const col = new T.Color(PAL[((Math.floor(k) % PAL.length) + PAL.length) % PAL.length]).convertSRGBToLinear();
    const f = Math.min(1.6, 1 / Math.max(0.25, Math.max(col.r, col.g, col.b)) * 0.95);   // garder des teintes franches sur une carrosserie claire
    g.traverse(m => {
      if (!m.isMesh || !m.material || Array.isArray(m.material) || !m.material.color) return;
      const key = m.material.uuid + '|' + k % PAL.length;
      m.material = tintCache[key] || (tintCache[key] = (() => { const c = m.material.clone(); c.color.multiply(col).multiplyScalar(Math.min(f, 1.45)); if (root.Modeles3D && root.Modeles3D.vernir) root.Modeles3D.vernir(c); return c; })());
    });
    return g;
  }
  // ---- textures : carrelage (station de lavage), briques, grillage, feuillage de haie
  function tilesDet() {
    if (texCache.carreau) return texCache.carreau;
    const N = 512, R = rng(808), c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), H = new Float32Array(N * N);
    const s = N / 6;   // 6 carreaux de 20 cm par tuile de 1,2 m
    for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) { const t = 0.86 + R() * 0.1; g.fillStyle = `rgb(${Math.round(232 * t)},${Math.round(236 * t)},${Math.round(238 * t)})`; g.fillRect(i * s + 2, j * s + 2, s - 4, s - 4); }
    g.fillStyle = '#8e9294'; for (let k = 0; k <= 6; k++) { g.fillRect(k * s - 2, 0, 4, N); g.fillRect(0, k * s - 2, N, 4); }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) H[y * N + x] = ((x % s) < 3 || (y % s) < 3) ? 0 : 1;
    for (let k = 0; k < 220; k++) { const x = R() * N, y = R() * N, r = 4 + R() * 26; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(90,80,60,0.12)'); gr.addColorStop(1, 'rgba(90,80,60,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
    return (texCache.carreau = { map: tex(c, true), normal: tex(normalsFrom(H, N, 1.2), false), meters: 1.2 });
  }
  function brickDet(tone) {
    const key = 'brique' + (tone || ''); if (texCache[key]) return texCache[key];
    const N = 512, R = rng(tone === 'sombre' ? 515 : 513), c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), H = new Float32Array(N * N);
    const bw = N / 4, bh = N / 16;   // briques de 22 × 7 cm (tuile de 0,9 m)
    g.fillStyle = tone === 'sombre' ? '#6d625a' : '#8f8578'; g.fillRect(0, 0, N, N);
    const base = tone === 'sombre' ? [104, 52, 40] : [142, 72, 52];
    for (let r = 0; r < 16; r++) for (let k = -1; k < 5; k++) {
      const x0 = k * bw + (r % 2) * bw / 2, y0 = r * bh, t = 0.75 + R() * 0.4, burnt = R() < 0.1 ? 0.6 : 1;
      g.fillStyle = `rgb(${Math.round(base[0] * t * burnt)},${Math.round(base[1] * t * burnt)},${Math.round(base[2] * t * burnt)})`; g.fillRect(x0 + 3, y0 + 3, bw - 6, bh - 6);
      for (let y = Math.max(0, y0 + 3); y < Math.min(N, y0 + bh - 3); y++) for (let x = Math.max(0, x0 + 3); x < Math.min(N, x0 + bw - 3); x++) H[y * N + x] = 1;
    }
    for (let k = 0; k < 3000; k++) { g.fillStyle = `rgba(${R() < 0.5 ? '30,20,15' : '200,170,150'},${R() * 0.12})`; g.fillRect(R() * N, R() * N, 2, 2); }
    for (let k = 0; k < 40; k++) { const x = R() * N, L = 40 + R() * 200; const gr = g.createLinearGradient(0, 0, 0, L); gr.addColorStop(0, 'rgba(40,30,25,0.18)'); gr.addColorStop(1, 'rgba(40,30,25,0)'); g.fillStyle = gr; g.fillRect(x, 0, 3 + R() * 8, L); }
    return (texCache[key] = { map: tex(c, true), normal: tex(normalsFrom(H, N, 2.2), false), meters: 0.9 });
  }
  function grillageMat() { return mat('grillage', () => {
    const N = 128, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'); g.clearRect(0, 0, N, N);
    g.strokeStyle = 'rgba(170,176,180,1)'; g.lineWidth = 3; for (let k = -N; k < 2 * N; k += 32) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + N, N); g.stroke(); g.beginPath(); g.moveTo(k + N, 0); g.lineTo(k, N); g.stroke(); }
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8;
    return new T.MeshStandardMaterial({ map: t, alphaTest: 0.5, transparent: false, side: T.DoubleSide, metalness: 0.7, roughness: 0.4, color: 0xd0d4d6 }); }); }
  function feuillageMat() { return mat('haieFeuilles', () => {
    const N = 256, R = rng(31), c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), H = new Float32Array(N * N);
    g.fillStyle = '#2c3d1f'; g.fillRect(0, 0, N, N);
    for (let k = 0; k < 2600; k++) { const x = R() * N, y = R() * N, r = 2 + R() * 5, l = R(); g.fillStyle = `rgb(${Math.round(45 + l * 50)},${Math.round(68 + l * 60)},${Math.round(30 + l * 25)})`; g.beginPath(); g.ellipse(x, y, r, r * 0.6, R() * 3, 0, 7); g.fill();
      for (let yy = Math.floor(y - r); yy < y + r; yy++) for (let xx = Math.floor(x - r); xx < x + r; xx++) { const i = (((yy % N) + N) % N) * N + (((xx % N) + N) % N); H[i] = Math.max(H[i], l); } }
    const d = { map: tex(c, true), normal: tex(normalsFrom(H, N, 3), false), meters: 0.8 };
    return worldMat(d, { roughness: 0.95, bump: 1.5 }); }); }
  // ---- station de lavage : parois carrelées, local technique, muret entre les pistes (le toit et les portiques : laverie())
  function lavage(o) {
    const K = M3(), g = new T.Group(), n = o.name, H = o.h;
    const carreau = mat('carreauLavage', () => worldMat(tilesDet(), { roughness: 0.35, bump: 0.6 }));
    const bleu = std('bleuLavage', 0x1f5fa8, 0.45, 0.2), jaune = std('jauneChasse', 0xe0b21e, 0.5, 0.3);
    if (n === 'lavage paroi') {
      bx(g, o.w, 1.0, o.d, K.betonClair, 0, -H / 2 + 0.5, 0);
      bx(g, o.w - 0.04, H - 1.0, o.d, carreau, 0, -H / 2 + 1.0 + (H - 1.0) / 2, 0);
      bx(g, o.w + 0.04, 0.45, o.d, bleu, 0, H / 2 - 0.4, 0);
      for (const s of [-1, 1]) { const r = cyl(g, 0.06, o.d - 0.4, jaune, s * (o.w / 2 + 0.07), -H / 2 + 0.55, 0, 10); r.rotation.x = Math.PI / 2; }   // chasse-roues
      for (const s of [-1, 1]) for (const z of [-o.d / 2 + 0.6, o.d / 2 - 0.6]) bx(g, 0.04, 0.3, 0.08, K.metal, s * (o.w / 2 + 0.03), 0.1, z);   // supports de lance
    } else if (n === 'lavage local') {
      bx(g, o.w, H, o.d, std('bardageLavage', 0xe9ecee, 0.55, 0.2), 0, 0, 0);
      bx(g, o.w + 0.04, 0.45, o.d + 0.04, bleu, 0, H / 2 - 0.4, 0);
      bx(g, 1.0, 2.1, 0.06, K.metalSombre, 0, -H / 2 + 1.05, -o.d / 2 - 0.02);   // porte de service au nord
      panneau(g, 0.9, 0.3, (q, w, h) => { q.fillStyle = '#c62828'; q.fillRect(0, 0, w, h); txt(q, 'PRIVÉ', w / 2, h / 2, 'bold 150px Arial', '#fff'); }, 0, 0.75, -o.d / 2 - 0.06, Math.PI);
      for (let k = 0; k < 3; k++) bx(g, 0.5, 0.25, 0.04, std('ventLavage', 0x9aa0a4, 0.5, 0.6), -0.7 + k * 0.7, H / 2 - 1.0, -o.d / 2 - 0.03);
      // monnayeurs (un par piste, sur les faces est et ouest) : boîtier inox, écran, fente, boutons de programme
      for (const s of [-1, 1]) {
        const t = new T.Group(); bx(t, 0.12, 1.1, 0.6, std('inox', 0xb8bcc0, 0.25, 0.9), 0, 0, 0);
        bx(t, 0.02, 0.2, 0.3, std('ecranMonnayeur', 0x0b1418, 0.2, 0, { emissive: 0x2d8a6a, emissiveIntensity: 0.7 }), 0.065, 0.3, 0);
        for (let b = 0; b < 4; b++) bx(t, 0.03, 0.07, 0.07, [jaune, bleu, std('boutonRouge', 0xc0392b, 0.4), std('boutonVert', 0x2e8b57, 0.4)][b], 0.07, 0.05 - b * 0.12, 0.18);
        t.position.set(s * (o.w / 2 + 0.06), -H / 2 + 1.25, o.d / 2 - 0.7); if (s < 0) t.rotation.y = Math.PI; g.add(t);
        panneau(g, 1.6, 0.8, (q, w, h) => { q.fillStyle = '#f4f6f8'; q.fillRect(0, 0, w, h); q.fillStyle = '#1f5fa8'; q.fillRect(0, 0, w, 60); txt(q, 'PISTE ' + (s < 0 ? '1' : '2'), w / 2, 32, 'bold 44px Arial', '#fff');
          ['1  PRÉLAVAGE', '2  LAVAGE HP', '3  MOUSSE', '4  RINÇAGE'].forEach((l, i) => txt(q, l, 40, 95 + i * 40, 'bold 30px Arial', '#1d2a36', 'left')); txt(q, '2 € · 4 min', w - 30, 230, 'bold 30px Arial', '#c62828', 'right'); },
          s * (o.w / 2 + 0.01), 0.35, o.d / 2 - 2.0, s * Math.PI / 2);
      }
    } else {   // muret entre les pistes : béton, chaperon carrelé, chasse-roues
      bx(g, o.w, H - 0.08, o.d, K.betonClair, 0, -0.04, 0); bx(g, o.w + 0.06, 0.08, o.d + 0.06, carreau, 0, H / 2 - 0.04, 0);
      for (const s of [-1, 1]) { const r = cyl(g, 0.06, o.d - 0.3, jaune, s * (o.w / 2 + 0.07), -H / 2 + 0.45, 0, 10); r.rotation.x = Math.PI / 2; }
    }
    return g;
  }
  // toit de la station de lavage, enseigne, portiques de prélavage, perches de lance, grilles d'évacuation (décor au-dessus et
  // au sol : rien dans le passage)
  function laverie(map, group) {
    const P = map.obstacles.filter(o => /^lavage/.test(o.name || '')); if (!P.length) return;
    const x0 = Math.min(...P.map(o => o.x)), x1 = Math.max(...P.map(o => o.x + o.w)), z0 = Math.min(...P.map(o => o.z)), z1 = Math.max(...P.map(o => o.z + o.d)), H = Math.max(...P.map(o => o.h));
    const K = M3(), g = new T.Group(), cx = (x0 + x1) / 2, W = x1 - x0 + 1.0, D = z1 - z0 + 1.2;
    const bleu = std('bleuLavage', 0x1f5fa8, 0.45, 0.2);
    bx(g, W, 0.22, D, std('toitLavage', 0x8f979c, 0.6, 0.4), cx, H + 0.11, (z0 + z1) / 2);
    for (let k = 1; k < 6; k++) bx(g, 0.05, 0.04, D - 0.2, std('jointToit', 0x6e7579, 0.5, 0.6), x0 - 0.5 + k * W / 6, H + 0.24, (z0 + z1) / 2);   // couvre-joints du bac acier
    for (const sx of [-1, 1]) bx(g, W, 0.18, 0.12, bleu, cx, H + 0.31, sx < 0 ? z0 - 0.6 + 0.06 : z1 + 0.6 - 0.06);
    for (const [dx, dz] of [[-2.2, -2.5], [2.6, 2.0]]) { const u = new T.Group(); bx(u, 1.1, 0.7, 0.8, std('clim', 0xc9cbc8, 0.5, 0.4), 0, 0.35, 0); cyl(u, 0.28, 0.02, std('grilleClim', 0x2a2c2e, 0.7, 0.5), 0, 0.71, 0, 18); u.position.set(cx + dx, H + 0.22, (z0 + z1) / 2 + dz); g.add(u); }
    for (const dz of [-3.5, 0.5, 3.6]) cyl(g, 0.12, 0.5, std('ventToit', 0xb0b5b8, 0.4, 0.7), cx + 4.2, H + 0.47, (z0 + z1) / 2 + dz, 10);
    bx(g, W - 0.1, 0.03, D - 0.1, std('sousToit', 0xb7bdc2, 0.4, 0.6), cx, H - 0.01, (z0 + z1) / 2);
    for (const s of [-1, 1]) {   // bandeau d'enseigne au nord et au sud (nom inventé), éclairé la nuit
      const z = s < 0 ? z0 - 0.6 : z1 + 0.6;
      bx(g, W, 0.7, 0.08, bleu, cx, H + 0.45, z);
      panneau(g, W * 0.62, 0.55, (q, w, h) => { q.fillStyle = '#1f5fa8'; q.fillRect(0, 0, w, h); txt(q, 'AQUANOVA  ·  LAVAGE HAUTE PRESSION  ·  24 h / 24', w / 2, h / 2 + 4, 'bold 120px Arial', '#ffffff'); }, cx, H + 0.45, z + s * 0.045, s < 0 ? Math.PI : 0, true);
      for (const k of [0, 1]) panneau(g, 0.5, 0.5, (q, w, h) => { q.fillStyle = '#ffd23f'; q.fillRect(0, 0, w, h); txt(q, String(k + 1), w / 2, h / 2 + 8, 'bold 200px Arial', '#1f5fa8'); }, x0 + 2.4 + k * (x1 - x0 - 4.8), H - 0.4, z + s * 0.05 - s * 0.6, s < 0 ? Math.PI : 0, true);
    }
    // pistes : entre les parois (on prend les vides entre les pièces, le long de x)
    const xs = P.filter(o => o.name !== 'lavage muret').map(o => [o.x, o.x + o.w]).sort((a, b) => a[0] - b[0]), pistes = [];
    for (let k = 0; k + 1 < xs.length; k++) if (xs[k + 1][0] - xs[k][1] > 2.5) pistes.push([xs[k][1], xs[k + 1][0]]);
    const tube = std('tubeInox', 0xc4c8cc, 0.25, 0.9), tuyau = std('tuyauNoir', 0x151515, 0.6);
    for (const [a, b] of pistes) {
      const m = (a + b) / 2;
      // portique de prélavage à l'entrée nord : deux montants contre les parois, traverse à buses
      for (const x of [a + 0.08, b - 0.08]) cyl(g, 0.05, H - 0.2, tube, x, (H - 0.2) / 2, z0 + 0.5, 10);
      const tr = cyl(g, 0.05, b - a - 0.16, tube, m, H - 0.25, z0 + 0.5, 10); tr.rotation.z = Math.PI / 2;
      for (let k = 0; k < 6; k++) bx(g, 0.05, 0.08, 0.05, K.metalSombre, a + 0.4 + k * (b - a - 0.8) / 5, H - 0.33, z0 + 0.5);
      // perche tournante au plafond et lance qui pend
      const boom = bx(g, 0.08, 0.08, 2.6, tube, m, H - 0.15, (z0 + z1) / 2 + 0.6);
      const hose = cyl(g, 0.025, 1.3, tuyau, m, H - 0.8, (z0 + z1) / 2 + 1.85, 8);
      // grilles d'évacuation au sol, au milieu de la piste ; néons
      const gr = new T.Mesh(new T.BoxGeometry(0.4, 0.02, z1 - z0 - 1.5), grateMat()); gr.position.set(m, 0.012, (z0 + z1) / 2); gr.receiveShadow = true; group.add(gr);
      const neon = bx(g, 0.12, 0.04, 1.2, std('neonLavage', 0xffffff, 0.3, 0, { emissive: 0xe8f4ff, emissiveIntensity: 0 }), m, H - 0.05, (z0 + z1) / 2); neon.material.userData.nuit = 1.2; NIGHT.mats.push(neon.material);
      void boom; void hose;
    }
    // lisibilité : vu d'en haut (caméra au-dessus du toit, regard plongeant), le toit devient presque transparent pour qu'on
    // voie qui tient la zone ; il reste opaque dans les plans bas et pour les ombres (la carte d'ombres ne lit pas l'opacité)
    const dir = new T.Vector3(), etat = { haut: false };
    g.traverse(o => {
      if (!o.isMesh) return; o.castShadow = true; o.receiveShadow = true;
      const c = o.material.clone(); if (NIGHT.mats.includes(o.material)) NIGHT.mats.push(c); o.material = c; o.userData.keep = true;
      o.onBeforeRender = (r, sc, cam) => {
        if (cam.isOrthographicCamera || cam.position.y < 0) return;   // ombres, reflets des flaques : on ne change rien
        cam.getWorldDirection(dir); const haut = cam.position.y > H + 1.6 && dir.y < -0.2;
        if (c.userData.haut !== haut) { c.userData.haut = haut; c.transparent = haut; c.opacity = haut ? 0.15 : 1; c.depthWrite = !haut; c.needsUpdate = true; }
      };
    });
    group.add(g); void etat;
    const lw = new T.Vector3(cx, H - 0.3, (z0 + z1) / 2); lw.k = 18; lights.push(lw);   // éclairage d'auvent, doux (pas d'éblouissement sur la zone)
  }
  // ---- haie taillée dans une jardinière, totem des tarifs
  function haie(o) {
    const K = M3(), g = new T.Group(), ph = 0.55, hw = o.w - 0.3, hd = o.d - 0.3, hh = o.h - ph + 0.1;
    bx(g, o.w, ph, o.d, K.betonClair, 0, -o.h / 2 + ph / 2, 0); bx(g, o.w + 0.06, 0.06, o.d + 0.06, K.betonClair, 0, -o.h / 2 + ph, 0);
    const geo = new T.BoxGeometry(hw, hh, hd, Math.max(3, Math.round(o.w * 4)), 6, Math.max(3, Math.round(o.d * 4))), p = geo.attributes.position, R = rng(Math.floor(o.x * 7 + o.z * 3));
    const ph2 = (x, z) => Math.sin(x * 3.1 + z * 1.7) * 0.5 + Math.sin(x * 7.3 - z * 5.1) * 0.5;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i); const t = Math.max(0, (y - (hh / 2 - 0.35)) / 0.35);   // haut arrondi : on rentre les bords
      const rx = Math.abs(x) / (hw / 2), rz = Math.abs(z) / (hd / 2), edge = Math.max(rx, rz);
      x *= 1 - 0.14 * t * t * (hw > 1 ? 0.35 / hw * 2 : 1) * rx; z *= 1 - 0.14 * t * t * (0.35 / hd * 2) * rz;
      y -= 0.18 * t * t * Math.pow(edge, 4);
      const n = ph2(x, z) * 0.05 + (R() - 0.5) * 0.04; p.setXYZ(i, x + Math.sign(x) * n * rx, y + (y > 0 ? n : 0), z + Math.sign(z) * n * rz);
    }
    geo.computeVertexNormals();
    const h = new T.Mesh(geo, feuillageMat()); h.position.y = -o.h / 2 + ph + hh / 2 - 0.08; g.add(h);
    return g;
  }
  function totem(o) {
    const K = M3(), g = new T.Group(), H = o.h;
    bx(g, o.w, H, o.d, std('totemCadre', 0x2b2f33, 0.45, 0.5), 0, 0, 0);
    for (const s of [-1, 1]) panneau(g, o.w - 0.16, H - 0.5, (q, w, h) => {
      q.fillStyle = '#1f5fa8'; q.fillRect(0, 0, w, h); q.fillStyle = '#164a85'; q.fillRect(0, 0, w, h * 0.22);
      txt(q, 'AQUA', w / 2, h * 0.07, 'bold 40px Arial', '#fff'); txt(q, 'NOVA', w / 2, h * 0.16, 'bold 40px Arial', '#ffd23f');
      ['LAVAGE', 'HP 2 €', 'MOUSSE', 'ASPI 1 €'].forEach((l, i) => { q.fillStyle = i % 2 ? '#2a6bb5' : '#2f75c4'; q.fillRect(6, h * (0.26 + i * 0.17), w - 12, h * 0.15); txt(q, l, w / 2, h * (0.335 + i * 0.17), 'bold 30px Arial', '#ffffff'); });
    }, 0, 0.12, s * (o.d / 2 + 0.005), s < 0 ? Math.PI : 0, 0.7);
    return g;
  }
  // ---- aspirateur de la station : colonne, flexible enroulé, col de cygne
  function aspirateur(o) {
    const K = M3(), g = new T.Group(), H = o.h;
    bx(g, o.w, H, o.d, std('aspiCorps', 0x1f5fa8, 0.4, 0.3), 0, 0, 0);
    bx(g, o.w + 0.02, 0.35, o.d + 0.02, std('inox', 0xb8bcc0, 0.25, 0.9), 0, H / 2 - 0.3, 0);
    bx(g, 0.02, 0.18, 0.3, std('ecranMonnayeur', 0x0b1418, 0.2, 0, { emissive: 0x2d8a6a, emissiveIntensity: 0.7 }), o.w / 2 + 0.01, H / 2 - 0.3, 0);
    const neck = cyl(g, 0.04, 1.3, std('inox', 0xb8bcc0, 0.25, 0.9), 0, H / 2 + 0.65, 0, 8);
    const arm = cyl(g, 0.035, 1.0, neck.material, 0.45, H / 2 + 1.3, 0, 8); arm.rotation.z = Math.PI / 2;
    const tor = new T.Mesh(new T.TorusGeometry(0.22, 0.035, 8, 20), std('tuyauNoir', 0x151515, 0.6)); tor.position.set(o.w / 2 + 0.05, 0, 0); tor.rotation.y = Math.PI / 2; g.add(tor);
    return g;
  }
  // ---- guérite du gardien (entrée) : bardage blanc, bandeau vitré, toit débordant, enseigne
  function guerite(o) {
    const K = M3(), g = new T.Group(), H = o.h, w = o.w, d = o.d;
    const blanc = std('bardageBlanc', 0xeceeed, 0.5, 0.15);
    bx(g, w, 1.05, d, blanc, 0, -H / 2 + 0.525, 0);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) bx(g, 0.1, H - 1.3, 0.1, blanc, x * (w / 2 - 0.05), -H / 2 + 1.05 + (H - 1.3) / 2, z * (d / 2 - 0.05));
    bx(g, w - 0.1, H - 1.3, d - 0.1, K.verre, 0, -H / 2 + 1.05 + (H - 1.3) / 2, 0);
    bx(g, w + 0.5, 0.22, d + 0.5, blanc, 0, H / 2 - 0.11, 0); bx(g, w + 0.52, 0.06, d + 0.52, K.metalSombre, 0, H / 2 - 0.25, 0);
    bx(g, 0.9, 2.0, 0.05, std('porteGuerite', 0xcfd3d5, 0.4, 0.4), 0, -H / 2 + 1.0, d / 2 + 0.03);
    panneau(g, w * 0.9, 0.3, (q, wd, h) => { q.fillStyle = '#1f5fbf'; q.fillRect(0, 0, wd, h); txt(q, 'P  ACCUEIL', wd / 2, h / 2 + 4, 'bold 120px Arial', '#fff'); }, 0, H / 2 + 0.05, -d / 2 - 0.26, Math.PI, true);
    bx(g, 0.6, 0.4, 0.35, std('clim', 0xc9cbc8, 0.5, 0.4), w / 2 - 0.4, H / 2 + 0.2, d / 2 - 0.4);
    return g;
  }
  // ---- caisse automatique (paiement du stationnement, piétons) : kiosque fermé, deux caisses encastrées, auvent, enseigne
  function caisseAuto(o) {
    const K = M3(), g = new T.Group(), H = o.h, w = o.w, d = o.d, bleuP = std('bleuParking', 0x1f5fbf, 0.45, 0.25);
    bx(g, w, H - 0.3, d, std('bardageBlanc', 0xeceeed, 0.5, 0.15), 0, -0.15, 0);
    // auvent : toit en bac acier gris (nervures, groupe de ventilation), bandeau bleu en rive qui dépasse du toit, larmier sombre
    const RW = w + 1.2, RD = d + 1.2;
    bx(g, RW - 0.08, 0.12, RD - 0.08, std('toitLavage', 0x8f979c, 0.6, 0.4), 0, H / 2 - 0.12, 0);
    for (let x = -RW / 2 + 0.3; x < RW / 2 - 0.2; x += 0.35) bx(g, 0.04, 0.04, RD - 0.16, std('jointToit', 0x6e7579, 0.5, 0.6), x, H / 2 - 0.04, 0);
    for (const s of [-1, 1]) { bx(g, RW, 0.24, 0.05, bleuP, 0, H / 2 - 0.12, s * (RD / 2 - 0.025)); bx(g, 0.05, 0.24, RD - 0.1, bleuP, s * (RW / 2 - 0.025), H / 2 - 0.12, 0); }
    bx(g, 0.6, 0.32, 0.45, std('clim', 0xc9cbc8, 0.5, 0.4), RW / 2 - 0.7, H / 2 + 0.1, -RD / 2 + 0.6);
    bx(g, RW + 0.02, 0.05, RD + 0.02, K.metalSombre, 0, H / 2 - 0.265, 0);
    for (const s of [-1, 1]) {
      const t = new T.Group(); bx(t, 0.1, 1.5, 0.75, std('inox', 0xb8bcc0, 0.25, 0.9), 0, 0, 0);
      bx(t, 0.02, 0.28, 0.4, std('ecranMonnayeur', 0x0b1418, 0.2, 0, { emissive: 0x2d8a6a, emissiveIntensity: 0.7 }), 0.06, 0.35, 0);
      bx(t, 0.03, 0.05, 0.25, K.metalSombre, 0.06, 0.0, 0); bx(t, 0.03, 0.1, 0.12, std('boutonVert', 0x2e8b57, 0.4), 0.06, -0.2, 0.2);
      t.position.set(s * (w / 2 + 0.05), -H / 2 + 1.0, 0); if (s < 0) t.rotation.y = Math.PI; g.add(t);
      panneau(g, w * 0.9, 0.42, (q, wd, h) => { q.fillStyle = '#1f5fbf'; q.fillRect(0, 0, wd, h); txt(q, 'P  CAISSE', wd / 2, h / 2 + 4, 'bold 140px Arial', '#fff'); }, s * (w / 2 + 0.01), H / 2 - 0.6, 0, s * Math.PI / 2, true);
    }
    bx(g, 0.9, 2.0, 0.05, std('porteGuerite', 0xcfd3d5, 0.4, 0.4), 0, -H / 2 + 1.0, d / 2 + 0.03);
    return g;
  }
  // ---- consigne à colis (double face) : rangées de petites portes, colonne à écran, bandeau de couleur (marque inventée)
  function consigne(o) {
    const g = new T.Group(), along = o.w >= o.d, L = along ? o.w : o.d, th = along ? o.d : o.w, H = o.h, K = M3();
    const corps = std('consigneCorps', 0xd7dadc, 0.45, 0.4), porte = std('consignePorte', 0xc4c8cb, 0.4, 0.5), vert = std('consigneBande', 0xe0632a, 0.5, 0.2);
    const inner = new T.Group(); bx(inner, L, H - 0.1, th, corps, 0, -0.05, 0); bx(inner, L + 0.04, 0.28, th + 0.04, vert, 0, H / 2 - 0.2, 0); bx(inner, L + 0.1, 0.08, th + 0.1, K.metalSombre, 0, -H / 2 + 0.04, 0);
    for (const s of [-1, 1]) {
      const cols = Math.round(L / 0.45), rows = 5;
      for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) { if (Math.abs(c - cols / 2 + 0.5) < 0.6) continue;   // colonne de l'écran au milieu
        const h = r === 0 ? 0.5 : 0.28; bx(inner, L / cols - 0.03, h, 0.02, porte, -L / 2 + (c + 0.5) * L / cols, -H / 2 + 0.2 + (r === 0 ? 0.25 : 0.5 + 0.3 * (r - 1) + 0.14), s * (th / 2 + 0.01)); }
      bx(inner, 0.32, 0.22, 0.02, std('ecranMonnayeur', 0x0b1418, 0.2, 0, { emissive: 0x2d8a6a, emissiveIntensity: 0.7 }), 0, 0.15, s * (th / 2 + 0.015));
      panneau(inner, L * 0.7, 0.24, (q, w, h) => { q.fillStyle = '#e0632a'; q.fillRect(0, 0, w, h); txt(q, 'COLIPOINT  ·  retrait 24 h / 24', w / 2, h / 2 + 4, 'bold 100px Arial', '#fff'); }, 0, H / 2 - 0.2, s * (th / 2 + 0.035), s < 0 ? Math.PI : 0, true);
    }
    if (!along) inner.rotation.y = Math.PI / 2; g.add(inner); return g;
  }
  // ---- fourgons de métier : livrée (bandes et texte sur les flancs), auvent pour le nettoyeur, gyrophare pour le chantier
  function fourgonMetier(o, M) {
    const g = new T.Group(), along = o.w >= o.d, L = along ? o.w : o.d, th = along ? o.d : o.w, H = o.h, n = o.name;
    const flip = o.dir !== undefined ? (along ? o.dir > 0 : o.dir < 0) : false;
    g.add(teinter(M.fit('fourgon', o.w, o.h, o.d, { flip, tol: 0.3 }), 2));
    const livree = n === 'fourgon (lavage)' ? ['#1f5fa8', 'AQUANOVA', 'SERVICE · DÉPANNAGE'] : n === 'fourgon (nettoyage)' ? ['#2e8b57', 'NET\'AUTO', 'LAVAGE À LA MAIN · LUSTRAGE'] : ['#e8641b', 'VOIRIE NOVA', 'TRAVAUX PUBLICS'];
    const side = new T.Group();
    for (const s2 of [-1, 1]) panneau(side, L * 0.62, H * 0.32, (q, w, h) => { q.clearRect(0, 0, w, h); q.fillStyle = livree[0]; q.fillRect(0, h * 0.62, w, h * 0.22); txt(q, livree[1], w * 0.5, h * 0.3, 'bold 110px Arial', livree[0]); txt(q, livree[2], w * 0.5, h * 0.73, 'bold 44px Arial', '#ffffff'); }, 0, -H * 0.02, s2 * (th / 2 + 0.03), s2 < 0 ? Math.PI : 0);
    side.traverse(m => { if (m.isMesh) { m.material.transparent = true; m.material.alphaTest = 0.05; } });
    // (l'auvent vert déroulé du nettoyeur a été retiré : vu de loin, une plaque verte flottante sans pieds)
    if (n === 'fourgon (chantier)') { const gy = new T.Mesh(new T.CylinderGeometry(0.08, 0.1, 0.14, 12), std('gyrophare', 0xff8a00, 0.3, 0, { emissive: 0xff7a00, emissiveIntensity: 0.6 })); gy.position.set(L * 0.2, H / 2 + 0.07, 0); side.add(gy); }
    if (!along) side.rotation.y = Math.PI / 2; g.add(side);
    return g;
  }
  // ---- borne de recharge : socle, écran, câble enroulé
  function borne(o) {
    const g = new T.Group(), H = o.h;
    bx(g, o.w, H, o.d, std('borneBlanc', 0xf2f3f1, 0.35, 0.1), 0, 0, 0);
    bx(g, o.w + 0.01, 0.3, o.d + 0.01, std('borneVert', 0x2fa36b, 0.4, 0.1), 0, H / 2 - 0.2, 0);
    bx(g, 0.02, 0.2, 0.26, std('ecranMonnayeur', 0x0b1418, 0.2, 0, { emissive: 0x2d8a6a, emissiveIntensity: 0.7 }), o.w / 2 + 0.01, 0.2, 0);
    const tor = new T.Mesh(new T.TorusGeometry(0.16, 0.025, 8, 18), std('tuyauNoir', 0x151515, 0.6)); tor.position.set(o.w / 2 + 0.04, -0.15, 0); tor.rotation.y = Math.PI / 2; g.add(tor);
    return g;
  }
  // ---- poste électrique préfabriqué : béton beige, portes métalliques, grilles d'aération, panneau « danger »
  function poste(o) {
    const K = M3(), g = new T.Group(), H = o.h;
    bx(g, o.w, H - 0.2, o.d, mat('posteBeton', () => worldMat(concrete('clair'), { color: 0xd8ceb4, roughness: 0.9, streak: 0.7 })), 0, -0.1, 0);
    bx(g, o.w + 0.25, 0.2, o.d + 0.25, K.betonClair, 0, H / 2 - 0.1, 0);
    const porte = std('portePoste', 0x6f7a6c, 0.5, 0.5);
    for (const s of [-1, 1]) { bx(g, 0.05, 2.0, 0.9, porte, s * (o.w / 2 + 0.02), -H / 2 + 1.05, -0.55); bx(g, 0.05, 2.0, 0.9, porte, s * (o.w / 2 + 0.02), -H / 2 + 1.05, 0.45);
      for (const z of [-0.55, 0.45]) bx(g, 0.06, 0.35, 0.6, std('grillePoste', 0x2c2f31, 0.6, 0.6), s * (o.w / 2 + 0.03), -H / 2 + 1.8, z);
      panneau(g, 0.3, 0.3, (q, w, h) => { q.fillStyle = '#f2c200'; q.beginPath(); q.moveTo(w / 2, 8); q.lineTo(w - 8, h - 8); q.lineTo(8, h - 8); q.closePath(); q.fill(); q.strokeStyle = '#111'; q.lineWidth = 10; q.stroke(); txt(q, 'ϟ', w / 2, h * 0.62, 'bold 130px Arial', '#111'); }, s * (o.w / 2 + 0.06), -H / 2 + 1.5, -0.08, s * Math.PI / 2);
    }
    return g;
  }
  function armoireP(o) { const K = M3(), g = new T.Group(); bx(g, o.w, o.h, o.d, std('armoireGris', 0x9ea3a0, 0.5, 0.3), 0, 0, 0); bx(g, o.w + 0.06, 0.05, o.d + 0.06, K.metalSombre, 0, o.h / 2, 0); bx(g, 0.02, o.h * 0.8, 0.02, K.metalSombre, 0, 0, o.d / 2 + 0.01); return g; }
  // ---- points de tri : trois colonnes (verre, emballages, papiers), ouvertures, autocollants
  function colonnes(o) {
    const g = new T.Group(), along = o.w >= o.d, L = along ? o.w : o.d, n = 3, cw = L / n - 0.15, side = along ? o.d : o.w;
    const cols = [0x2f6b3a, 0xd9b52b, 0x2a5a9a], noms = ['VERRE', 'EMBALLAGES', 'PAPIERS'];
    for (let k = 0; k < n; k++) {
      const c = new T.Group(), m = std('colonne' + k, cols[k], 0.55, 0.05), H = o.h;
      const r = Math.min(cw, side - 0.1) / 2, hb = H - r * 0.55 - 0.08;   // cloche : fût légèrement conique, dôme, socle
      bx(c, cw + 0.1, 0.08, side, std('socleColonne', 0x8d8a84, 0.9), 0, -H / 2 + 0.04, 0);
      cyl(c, r, hb, m, 0, -H / 2 + 0.08 + hb / 2, 0, 24).geometry = new T.CylinderGeometry(r * 0.92, r, hb, 24);
      const dome = new T.Mesh(new T.SphereGeometry(r * 0.92, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), m); dome.scale.y = 0.6; dome.position.y = -H / 2 + 0.08 + hb; c.add(dome);
      const anneau = new T.Mesh(new T.TorusGeometry(0.12, 0.025, 8, 18), std('poigneeColonne', 0x222222, 0.6)); anneau.rotation.x = Math.PI / 2; anneau.position.y = H / 2 + 0.02; c.add(anneau);
      for (const s of [-1, 1]) { const hole = new T.Mesh(new T.CircleGeometry(0.11, 18), std('trouColonne', 0x0c0c0c, 0.9)); hole.position.set(0, H / 2 - 0.45, s * (r * 0.93 + 0.01)); if (s < 0) hole.rotation.y = Math.PI; c.add(hole);
        panneau(c, r * 1.1, 0.2, (q, w, h) => { q.fillStyle = '#fff'; q.fillRect(0, 0, w, h); txt(q, noms[k], w / 2, h / 2 + 4, 'bold 100px Arial', '#222'); }, 0, -0.1, s * (r * 0.97 + 0.01), s < 0 ? Math.PI : 0); }
      const off = -L / 2 + (k + 0.5) * L / n; c.position.set(along ? off : 0, 0, along ? 0 : off); if (!along) c.rotation.y = Math.PI / 2; g.add(c);
    }
    return g;
  }
  // ---- clôture de chantier : panneaux de grille sur plots, bâche imprimée (opaque) de chaque côté
  function bacheTex() {
    if (texCache.bache) return texCache.bache;
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const q = c.getContext('2d');
    q.fillStyle = '#f2f0ea'; q.fillRect(0, 0, 1024, 512); q.fillStyle = '#e8641b'; q.fillRect(0, 0, 1024, 90); q.fillRect(0, 440, 1024, 72);
    txt(q, 'TRAVAUX', 512, 50, 'bold 70px Arial', '#fff'); txt(q, 'RÉFECTION DE LA CHAUSSÉE', 512, 190, 'bold 64px Arial', '#2b2b2b');
    txt(q, 'Parking partiellement fermé', 512, 270, '48px Arial', '#444'); txt(q, 'VOIRIE NOVA · Terrassement · Enrobés', 512, 360, 'bold 40px Arial', '#e8641b');
    for (let k = 0; k < 2500; k++) { q.fillStyle = `rgba(80,70,50,${Math.random() * 0.06})`; q.fillRect(Math.random() * 1024, Math.random() * 512, 3, 3); }
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; return (texCache.bache = t);
  }
  function chantierClo(o) {
    const g = new T.Group(), along = o.w >= o.d, L = along ? o.w : o.d, H = o.h, n = Math.max(1, Math.round(L / 3.4));
    const tubeM = std('tubeGalva', 0xb4b9bc, 0.35, 0.85), plot = std('plotChantier', 0x8a8c86, 0.9), bm = mat('bacheM', () => new T.MeshStandardMaterial({ map: bacheTex(), roughness: 0.8 }));
    for (let k = 0; k < n; k++) {
      const pl = L / n, off = -L / 2 + (k + 0.5) * pl, p = new T.Group();
      for (const s of [-1, 1]) { cyl(p, 0.025, H - 0.15, tubeM, s * (pl / 2 - 0.05), 0.05, 0, 8); bx(p, 0.6, 0.14, 0.22, plot, s * pl / 2, -H / 2 + 0.07, 0); }
      for (const y of [H / 2 - 0.05, -H / 2 + 0.2]) { const t = cyl(p, 0.025, pl - 0.1, tubeM, 0, y, 0, 8); t.rotation.z = Math.PI / 2; }
      for (const f of [0, 1]) { const b = new T.Mesh(new T.PlaneGeometry(pl - 0.14, H - 0.35), bm); b.position.set(0, 0.07, f ? -0.012 : 0.012); if (f) b.rotation.y = Math.PI; p.add(b); }   // une bâche imprimée de chaque côté
      p.position.set(along ? off : 0, 0, along ? 0 : off); if (!along) p.rotation.y = Math.PI / 2; g.add(p);
    }
    return g;
  }
  // ---- benne à gravats (benne de chantier ouverte, trapèze) et repli pour la benne à ordures
  function benneGravats(o) {
    const g = new T.Group(), along = o.w >= o.d, L = along ? o.w : o.d, W = along ? o.d : o.w, H = o.h, m = std('benneJaune', 0xd8a21f, 0.6, 0.35);
    const shape = new T.Shape(); shape.moveTo(-L / 2 + 0.35, -H / 2); shape.lineTo(L / 2 - 0.35, -H / 2); shape.lineTo(L / 2, H / 2); shape.lineTo(-L / 2, H / 2); shape.closePath();
    for (const s of [-1, 1]) { const side = new T.Mesh(new T.ShapeGeometry(shape), m); side.material = mat('benneJauneDS', () => { const c = m.clone(); c.side = T.DoubleSide; return c; }); side.position.z = s * W / 2; g.add(side); }
    bx(g, L - 0.7, 0.06, W, m, 0, -H / 2 + 0.03, 0);
    for (const s of [-1, 1]) { const e = bx(g, 0.06, H * 1.04, W, m, s * (L / 2 - 0.17), 0, 0); e.rotation.z = -s * Math.atan2(0.35, H); }
    const R = rng(Math.floor(o.x * 11)), gr = std('gravats', 0x55524c, 0.95);
    for (let k = 0; k < 26; k++) { const r = 0.12 + R() * 0.22, b = new T.Mesh(new T.DodecahedronGeometry(r, 0), k % 4 ? gr : std('enrobeMorceau', 0x26262a, 0.9)); b.position.set((R() - 0.5) * (L - 0.9), H / 2 - 0.25 + R() * 0.15, (R() - 0.5) * (W - 0.3)); b.rotation.set(R() * 3, R() * 3, R() * 3); g.add(b); }
    if (!along) g.rotation.y = Math.PI / 2;
    return g;
  }
  function benneP(o) { const g = new T.Group(), m = std('benneVerte', 0x2f5a3a, 0.6, 0.3); bx(g, o.w, o.h - 0.15, o.d, m, 0, -0.075 + 0.0, 0); bx(g, o.w + 0.06, 0.08, o.d + 0.06, std('couvercle', 0x1f2a22, 0.5, 0.2), 0, o.h / 2 - 0.1, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.07, 0.06, std('tuyauNoir', 0x151515, 0.6), sx * (o.w / 2 - 0.15), -o.h / 2 + 0.07, sz * (o.d / 2 - 0.15), 10).rotation.x = Math.PI / 2; return g; }
  // ---- portail à barrière (entrée à l'ouest, sortie à l'est) dans l'ouverture du mur : bornes, lisses rayées, portique de
  // limitation de hauteur, îlot central avec distributeur de tickets ou caisse de sortie
  function portail(o) {
    // construit dans un repère local (ouverture le long de z, intérieur du parking vers +x), puis tourné selon le côté
    const K = M3(), g = new T.Group(), cote = /sud/.test(o.name) ? 'sud' : /nord/.test(o.name) ? 'nord' : /est/.test(o.name) ? 'est' : 'ouest';
    const est = cote === 'est', mixte = cote === 'sud' || cote === 'nord', L = o.w >= o.d ? o.w : o.d, s = 1;
    g.rotation.y = { ouest: 0, est: Math.PI, sud: Math.PI / 2, nord: -Math.PI / 2 }[cote];
    const y0 = -o.h / 2, jaune = std('jauneBorne', 0xe8b51a, 0.5, 0.3), rayure = mat('lisse', () => { const c = document.createElement('canvas'); c.width = 256; c.height = 16; const q = c.getContext('2d'); for (let k = 0; k < 8; k++) { q.fillStyle = k % 2 ? '#d32020' : '#f4f4f4'; q.fillRect(k * 32, 0, 32, 16); } const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return new T.MeshStandardMaterial({ map: t, roughness: 0.5 }); });
    // îlot central (bordure basse), borne et distributeur
    bx(g, 2.6, 0.12, 0.9, K.betonClair, s * 0.8, y0 + 0.06, 0);
    for (const lane of [-1, 1]) {
      const zc = lane * L / 4, bz = lane * 0.3;
      const post = new T.Group(); bx(post, 0.3, 1.05, 0.35, jaune, 0, 0.525, 0); bx(post, 0.32, 0.06, 0.37, K.metalSombre, 0, 1.06, 0);
      post.position.set(s * 0.6, y0 + 0.12, bz); g.add(post);
      const arm = new T.Mesh(new T.BoxGeometry(0.06, 0.08, L / 2 - 0.6), rayure); const lift = (lane > 0) !== est;   // une lisse levée, l'autre baissée
      const pv = new T.Group(); pv.position.set(s * 0.6, y0 + 1.0, bz); arm.position.z = lane * (L / 4 - 0.3); pv.add(arm); if (lift) pv.rotation.x = lane * -1.25; g.add(pv);
    }
    const dist = new T.Group(); bx(dist, 0.5, 1.4, 0.45, std('distributeur', est ? 0x2e5b8c : 0xd0d3d5, 0.4, 0.5), 0, 0.7, 0);   // distributeur de tickets bx(dist, 0.02, 0.22, 0.3, std('ecranMonnayeur', 0x0b1418, 0.2, 0, { emissive: 0x2d8a6a, emissiveIntensity: 0.7 }), -s * 0.26, 1.05, 0); bx(dist, 0.62, 0.06, 0.55, K.metalSombre, 0, 1.43, 0);
    dist.position.set(s * (mixte ? 1.0 : 1.6), y0 + 0.12, mixte ? -0.5 : 0); g.add(dist);
    // portique de limitation de hauteur (3,10 m : la navette de 3 m et les fourgons garés dans le parking passent dessous)
    // au-dessus de l'ouverture ; le panneau est posé sur la poutre, côté rue
    const pm = std('portique', 0x2b2e31, 0.5, 0.6);
    for (const z of [-L / 2 - 0.1, L / 2 + 0.1]) bx(g, 0.18, 3.6, 0.18, pm, -s * 0.3, y0 + 1.8, z);
    bx(g, 0.2, 0.25, L + 0.4, pm, -s * 0.3, y0 + 3.5, 0);
    const bar = new T.Mesh(new T.BoxGeometry(0.12, 0.2, L - 0.2), rayure); bar.position.set(-s * 0.3, y0 + 3.2, 0); g.add(bar);
    for (const z of [-L / 3, L / 3]) bx(g, 0.02, 0.12, 0.02, K.metalSombre, -s * 0.3, y0 + 3.33, z);
    panneau(g, 3.2, 0.5, (q, w, h) => { q.fillStyle = '#1f5fbf'; q.fillRect(0, 0, w, h); const lib = mixte ? 'P  ENTRÉE · SORTIE' : est ? 'SORTIE' : 'P  ENTRÉE'; let fs = 180; do { q.font = `bold ${fs}px Arial`; fs -= 6; } while (q.measureText(lib).width > w * 0.66 && fs > 40);   // le texte tient à gauche du disque
      txt(q, lib, w * 0.36, h / 2 + 6, q.font, '#fff'); q.fillStyle = '#fff'; q.beginPath(); q.arc(w * 0.84, h / 2, h * 0.4, 0, 7); q.fill(); txt(q, '3,10 m', w * 0.84, h / 2 + 4, 'bold 66px Arial', '#c62828'); }, -s * 0.42, y0 + 3.6, 0, -Math.PI / 2, true);
    return g;
  }
  // muret de la rue : béton bas, couvertine, grille d'acier ; une haie basse côté trottoir
  function murRue(o) {
    const K = M3(), g = new T.Group(), along = o.w >= o.d, L = along ? o.w : o.d, y0 = -o.h / 2, hm = 0.9, top = 1.9;
    const grille = std('grilleRue', 0x2b3034, 0.45, 0.7);
    bx(g, along ? L : o.w * 0.5, hm, along ? o.d * 0.5 : L, K.betonClair, 0, y0 + hm / 2, 0);
    bx(g, along ? L : o.w * 0.6, 0.08, along ? o.d * 0.6 : L, K.betonClair, 0, y0 + hm + 0.04, 0);
    for (let k = 0; k <= Math.round(L / 0.15); k++) { const off = -L / 2 + k * L / Math.round(L / 0.15); bx(g, along ? 0.025 : 0.025, top - hm, 0.025, grille, along ? off : 0, y0 + hm + (top - hm) / 2, along ? 0 : off); }
    for (const y of [y0 + hm + 0.15, y0 + top]) bx(g, along ? L : 0.05, 0.05, along ? 0.05 : L, grille, 0, y, 0);
    for (let k = 0; k <= Math.round(L / 2.5); k++) { const off = -L / 2 + k * L / Math.round(L / 2.5); bx(g, 0.08, top - hm + 0.05, 0.08, grille, along ? off : 0, y0 + hm + (top - hm) / 2, along ? 0 : off); }
    return g;
  }
  // ---- local à poubelles : murets en briques sur trois côtés (ouvert au nord, vers la ruelle), conteneurs dedans
  function localPoubelles(o) {
    const g = new T.Group(), H = o.h, bm = mat('briqueMur', () => worldMat(PBRdet('brique', brickDet()), { roughness: 0.9, streak: 0.8 })), K = M3(), th = 0.25;
    bx(g, th, H, o.d, bm, -o.w / 2 + th / 2, 0, 0); bx(g, th, H, o.d, bm, o.w / 2 - th / 2, 0, 0); bx(g, o.w, H, th, bm, 0, 0, o.d / 2 - th / 2);
    for (const x of [-o.w / 2 + th / 2, o.w / 2 - th / 2]) bx(g, th + 0.06, 0.08, o.d + 0.04, K.betonClair, x, H / 2 + 0.04, 0);
    bx(g, o.w + 0.04, 0.08, th + 0.06, K.betonClair, 0, H / 2 + 0.04, o.d / 2 - th / 2);
    const M = root.Modeles3D;
    for (const k of [0, 1]) { const w = (o.w - 2 * th) / 2 - 0.15, x = -o.w / 2 + th + (k + 0.5) * (o.w - 2 * th) / 2;
      const b = M && M.ready && M.has('benne') ? M.fit('benne', w, 1.3, 1.3, { tol: 0.3, rot: Math.PI }) : benneP({ w, h: 1.3, d: 1.3 }); b.position.set(x, -H / 2 + 0.65, o.d / 2 - th - 0.8); g.add(b); }
    return g;
  }
  // ---- replis de la ruelle (si ruelle.js n'est pas là) : murs du fond, annexe en briques, muret grillagé, clim au sol
  function annexeP(o) {
    const g = new T.Group(), bm = mat('briqueSombre', () => worldMat(PBRdet('briqueSombre', brickDet('sombre')), { roughness: 0.9, streak: 1 })), K = M3();
    bx(g, o.w, o.h, o.d, bm, 0, 0, 0); bx(g, o.w + 0.2, 0.25, o.d + 0.2, K.betonClair, 0, o.h / 2 - 0.12, 0);
    bx(g, 2.6, 2.8, 0.06, std('rideauMetal', 0x8d9296, 0.45, 0.7), -0.8, -o.h / 2 + 1.4, o.d / 2 + 0.03);
    bx(g, 1.0, 2.1, 0.06, std('porteService', 0x5a3d2e, 0.6, 0.4), o.w / 2 - 1.2, -o.h / 2 + 1.05, o.d / 2 + 0.03);
    return g;
  }
  function murRuelle(o) { const g = new T.Group(); bx(g, o.w, o.h, o.d, mat('briqueSombre', () => worldMat(PBRdet('briqueSombre', brickDet('sombre')), { roughness: 0.9, streak: 1 })), 0, 0, 0); return g; }
  function cloGrillage(o) {
    const K = M3(), g = new T.Group(), along = o.w >= o.d, L = along ? o.w : o.d, H = o.h, top = 2.4;
    bx(g, along ? L : o.w, H, along ? o.d : L, K.betonClair, 0, 0, 0);
    const gm = grillageMat().clone(); gm.map = gm.map.clone(); gm.map.needsUpdate = true; gm.map.repeat.set(L / 0.6, (top - H) / 0.6);
    const pl = new T.Mesh(new T.PlaneGeometry(L, top - H), gm); pl.position.y = H / 2 + (top - H) / 2; if (!along) pl.rotation.y = Math.PI / 2; g.add(pl);
    const post = std('tubeGalva', 0xb4b9bc, 0.35, 0.85), n = Math.max(1, Math.round(L / 2.5));
    for (let k = 0; k <= n; k++) { const off = -L / 2 + k * L / n; cyl(g, 0.03, top - H + 0.05, post, along ? off : 0, H / 2 + (top - H) / 2, along ? 0 : off, 8); }
    const rail = cyl(g, 0.025, L, post, 0, top - H / 2 - 0.02, 0, 8); if (along) rail.rotation.z = Math.PI / 2; else rail.rotation.x = Math.PI / 2;
    return g;
  }
  function climP(o) { const g = new T.Group(); bx(g, o.w, o.h, o.d, std('clim', 0xc9cbc8, 0.5, 0.4), 0, 0, 0); const f = new T.Mesh(new T.CylinderGeometry(0.3, 0.3, 0.02, 20), std('grilleClim', 0x2a2c2e, 0.7, 0.5)); f.position.y = o.h / 2 + 0.01; g.add(f); return g; }

  // mur de clôture ouest / est : graffitis ; au bout de la ruelle (z < bord du grillage), un portail coulissant grillagé
  function murCloture(o) {
    const g = new T.Group(), zr = 10.5, o2 = Object.assign({}, o, { z: zr, d: o.z + o.d - zr });
    const w = wall(o2); w.position.z = (o2.z + o2.d / 2) - (o.z + o.d / 2); g.add(w);
    const gt = new T.Group(), L = zr - o.z, H = 2.4, post = std('tubeGalva', 0xb4b9bc, 0.35, 0.85);
    const gm = grillageMat().clone(); gm.map = gm.map.clone(); gm.map.needsUpdate = true; gm.map.repeat.set(L / 0.6, H / 0.6);
    const pl = new T.Mesh(new T.PlaneGeometry(L, H), gm); pl.rotation.y = Math.PI / 2; pl.position.y = H / 2 + 0.1; gt.add(pl);
    for (const y of [0.12, H + 0.08]) { const r = cyl(gt, 0.035, L, post, 0, y, 0, 8); r.rotation.x = Math.PI / 2; }
    for (let k = 0; k <= 3; k++) cyl(gt, 0.04, H, post, 0, H / 2 + 0.1, -L / 2 + k * L / 3, 8);
    for (const z of [-L / 2 + 0.6, L / 2 - 0.6]) { const wh = cyl(gt, 0.1, 0.06, std('tuyauNoir', 0x151515, 0.6), 0, 0.1, z, 12); wh.rotation.z = Math.PI / 2; }
    bx(gt, 0.25, 2.6, 0.25, M3().betonClair, 0, 1.3, L / 2 + 0.12);
    gt.position.set(0, -o.h / 2, (o.z + L / 2) - (o.z + o.d / 2)); g.add(gt);
    return g;
  }
  // une pièce de la simulation habillée (null : laisser le jeu la dessiner)
  function mesh(o) {
    const n = o.name || '', RU = root.Ruelle, M = root.Modeles3D, has = (k) => M && M.ready && M.has(k);
    if (RU && RU.mesh) { try { const r = RU.mesh(o); if (r) return r; } catch (e) { console.warn('ruelle :', e); } }
    if (n === 'mur nord') return murRuelle(o);
    if (/^mur portail/.test(n)) return portail(o);
    if (n === 'mur sud') return murRue(o);
    if (n === 'mur ouest' || n === 'mur est') return murCloture(o);
    if (/^mur (est|ouest)/.test(n)) return wall(o);
    if (n.startsWith('centre commercial')) return mall(o);
    if (n === 'annexe') return annexeP(o);
    if (n === 'local poubelles') return localPoubelles(o);
    if (n.startsWith('clôture grillagée')) return cloGrillage(o);
    if (n.startsWith('clôture de chantier')) return chantierClo(o);
    if (/^lavage/.test(n)) return lavage(o);
    if (n === 'haie') return haie(o);
    if (n === 'totem') return totem(o);
    if ((n === 'fourgon (lavage)' || n === 'fourgon (nettoyage)' || n === 'fourgon (chantier)') && has('fourgon')) return fourgonMetier(o, M);
    if (n === 'abribus' && has('abribus')) {   // abri : modèle Meshy, plus une « sucette » publicitaire éclairée au bout est et le cadre des horaires
      const g = new T.Group(), m = M.fit('abribus', o.w, o.h, o.d, { tol: 0.3 }); g.add(m);
      const mupi = new T.Group(); bx(mupi, 0.18, 1.9, 1.3, std('cadreMupi', 0x2b2f33, 0.4, 0.6), 0, 0, 0);
      for (const s2 of [-1, 1]) panneau(mupi, 1.15, 1.7, (q, w, h) => { const gr = q.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#f2a23b'); gr.addColorStop(1, '#c8452e'); q.fillStyle = gr; q.fillRect(0, 0, w, h);
        txt(q, 'FRAISE', w / 2, h * 0.3, 'bold 46px Arial', '#fff'); txt(q, '& CO', w / 2, h * 0.42, 'bold 46px Arial', '#fff'); txt(q, 'Glaces artisanales', w / 2, h * 0.62, '20px Arial', '#fff'); txt(q, 'Grand-Rue · 2 €', w / 2, h * 0.86, 'bold 22px Arial', '#ffe9b0'); }, s2 * 0.095, 0.0, 0, s2 * Math.PI / 2, true);
      mupi.position.set(o.w / 2 - 0.12, -o.h / 2 + 1.05, 0); g.add(mupi);
      panneau(g, 0.6, 0.8, (q, w, h) => { q.fillStyle = '#f4f4f0'; q.fillRect(0, 0, w, h); q.fillStyle = '#1f5fbf'; q.fillRect(0, 0, w, 50); txt(q, 'LIGNE 4  ·  NAVETTE', w / 2, 26, 'bold 22px Arial', '#fff'); for (let k = 0; k < 9; k++) txt(q, (7 + k) + ' h   ' + ['05', '25', '45'].join('  ') , 20, 80 + k * 18, '15px Arial', '#222', 'left'); }, -o.w / 2 + 0.9, -o.h / 2 + 1.5, -o.d / 2 + 0.07, 0);
      return g;
    }
    if (n === 'aspirateur') return aspirateur(o);
    if (n === 'guérite') return guerite(o);
    if (n === 'caisse automatique') return caisseAuto(o);
    if (n === 'consigne colis') return consigne(o);
    if (n === 'borne de recharge') return borne(o);
    if (n === 'poste électrique') return poste(o);
    if (n === 'colonnes de tri') return colonnes(o);
    if (n === 'benne à gravats') return benneGravats(o);
    if (n === 'poteau') { const g = new T.Group(); cyl(g, 0.12, o.h, M3().metalSombre, 0, 0, 0, 12); return g; }
    if (n === 'clim') return climP(o);
    if (n === 'armoire') return has('armoire') ? M.fit('armoire', o.w, o.h, o.d, { tol: 0.3, rot: Math.PI }) : armoireP(o);
    if (n === 'benne') return has('benne') ? M.fit('benne', o.w, o.h, o.d, { tol: 0.3, rot: o.z < 5 ? 0 : Math.PI }) : benneP(o);
    if (n.startsWith('palettes') && !has('palettes')) return crates(o);
    if (n === 'abri' || n.startsWith('abri des')) return booth(o);
    if (n.startsWith('muret')) return lowWall(o);
    if (n.startsWith('bac à fleurs')) return planter(o);
    if (n.startsWith('conteneur')) return has('conteneur') ? null : container(o);   // modèle Meshy s'il est chargé
    if (n.startsWith('caisses')) return crates(o);
    return null;
  }
  // nuit : fenêtres, lampadaires, enseignes allumés ; lumières ponctuelles des lampadaires ; pluie : sol mouillé
  let lightGroup = null;
  // de nuit, sous chaque luminaire : halo autour de la lampe (diffusion dans l'air humide) et cône de lumière très léger
  // (poussière, humidité) — additifs, sans écriture de profondeur ; le cône s'efface vers le sol et sur ses bords
  const HALO = {};
  function halo() {
    if (!HALO.mat) { const c = document.createElement('canvas'); c.width = c.height = 128; const q = c.getContext('2d'), gr = q.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,236,200,1)'); gr.addColorStop(0.12, 'rgba(255,214,150,0.55)'); gr.addColorStop(0.4, 'rgba(255,190,120,0.12)'); gr.addColorStop(1, 'rgba(255,180,110,0)'); q.fillStyle = gr; q.fillRect(0, 0, 128, 128);
      const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; HALO.mat = new T.MeshBasicMaterial({ map: t, color: 0xffffff, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false, opacity: 0.85 }); }
    const sp = new T.Mesh(new T.PlaneGeometry(2.6, 2.6), HALO.mat); sp.renderOrder = 3; return horsAO(sp, true);
  }
  // pas dans les passes à matériau imposé (normales et profondeur de l'occlusion ambiante, ombres) : sinon ces volumes
  // transparents y deviennent des formes opaques (taches sombres) ; le halo fait face à la caméra
  function horsAO(o, face) {
    o.castShadow = false; o.receiveShadow = false;
    o.onBeforeRender = (r, sc, cam) => { o.geometry.setDrawRange(0, sc.overrideMaterial ? 0 : Infinity); if (face) { o.quaternion.copy(cam.quaternion); o.updateMatrixWorld(); o.modelViewMatrix.multiplyMatrices(cam.matrixWorldInverse, o.matrixWorld); o.normalMatrix.getNormalMatrix(o.modelViewMatrix); } };
    return o;
  }
  function cone(h) {
    if (!HALO.cone) HALO.cone = new T.ShaderMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false,
      uniforms: { col: { value: new T.Color(0xffc98a) } },
      vertexShader: 'varying float vY; varying vec3 vN, vV; void main() { vY = uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 col; varying float vY; varying vec3 vN, vV; void main() { float e = pow(abs(dot(normalize(vN), normalize(vV))), 2.0); float a = pow(vY, 1.6) * e * 0.05; gl_FragColor = vec4(col * a, a); }' });
    const g = new T.Mesh(new T.CylinderGeometry(0.25, 3.2, h, 24, 1, true), HALO.cone); g.renderOrder = 2; return horsAO(g);
  }
  function setConditions(id, scene) {
    const night = id === 'nuit'; NIGHT.on = night; FAC.uNight.value = night ? 1 : 0; FAC.uDay.value = night ? 0 : id === 'brouillard' || id === 'pluie' ? 0.8 : 1;
    for (const m of NIGHT.mats) m.emissiveIntensity = night ? (m.userData.nuit !== undefined ? m.userData.nuit * 0.7 : m.map && m.emissiveMap ? 1.0 : 3) : 0;   // fenêtres, enseignes : lisibles sans halo ; ampoules : seules vraies sources (halo)
    U.wet.value = id === 'pluie' ? 1 : id === 'brouillard' ? 0.35 : 0;
    if (root.Ruelle && root.Ruelle.setConditions) try { root.Ruelle.setConditions(id); } catch (e) { console.warn('ruelle :', e); }
    if (lightGroup) { scene.remove(lightGroup); lightGroup = null; }
    // luminaires à défilement (comme les vrais) : spot vers le bas, décroissance physique (1/d²), bord de flaque très adouci.
    // Éclairement au sol sous la tête ≈ 2 à 2,7 (lune ≈ 0,7) : flaques douces, pas de blanc brûlé ; les murs proches ne sont plus
    // inondés (la lumière ne part pas à l'horizontale). Auvent de la station de lavage : large, plus faible.
    if (night) {
      lightGroup = new T.Group();
      for (const p of lights) {
        const canopy = p.k && p.k < 60, I = canopy ? 20 : p.k > 150 ? 160 : 120;
        const l = new T.SpotLight(0xffc98a, I, canopy ? 12 : 26, canopy ? 1.25 : 1.05, canopy ? 0.9 : 0.8, 2);
        l.position.copy(p); l.target.position.set(p.x, 0, p.z); lightGroup.add(l, l.target);
        if (!canopy) { const h = halo(); h.position.copy(p); h.position.y -= 0.06; lightGroup.add(h); const c = cone(p.y); c.position.set(p.x, p.y / 2, p.z); lightGroup.add(c); }
      }
      scene.add(lightGroup); lightGroup.updateMatrixWorld(true);
    }
  }
  function tick(t) { U.time.value = t; }
  root.Parking = { build, mesh, setConditions, tick, asphalt, concrete, worldMat, teinter, brickDet };
})(window.OT = window.OT || {});
