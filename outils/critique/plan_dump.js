// Critique de la carte : exporte la définition d'une carte (obstacles, marquage, voies, départs, zone, points de couverture)
// plus des mesures (lignes de vue longues, zones sans couvert, chevauchements d'objets, chemins par voie) en JSON.
// usage : node outils/critique/plan_dump.js [mapId] > plan.json ; python3 outils/critique/plan.py plan.json plan.png
const path = require('path');
const R = (p) => require(path.join(__dirname, '..', '..', p));
const OT = Object.assign({}, R('sim/rng.js'), R('sim/data.js'), R('sim/map.js'));
const id = process.argv[2] || 'parking';
const def = OT.MAPS[id]; const map = new OT.GameMap(def);
const W = def.width, D = def.depth;
// lignes de vue longues debout (yeux 1,6 m -> poitrine 1,25 m), échantillons tous les 2 m, rayon réel de la simulation
const pts = [];
for (let z = 1; z < D; z += 2) for (let x = 1; x < W; x += 2) if (!map.insideObstacle(x, z)) pts.push([x, z]);
const lines = [];
for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
  const [ax, az] = pts[i], [bx, bz] = pts[j], L = Math.hypot(ax - bx, az - bz);
  if (L < 40) continue;
  if (map.hasLOS(ax, 1.6, az, bx, 1.25, bz)) lines.push([ax, az, bx, bz, +L.toFixed(1)]);
}
lines.sort((a, b) => b[4] - a[4]);
// zones nues : distance de chaque case libre au point de couverture le plus proche
const cp = map.coverPoints; const naked = [];
for (let r = 0; r < map.rows; r++) for (let c = 0; c < map.cols; c++) {
  if (map.isBlocked(c, r)) continue; const p = map.centerOf(c, r); let best = 1e9;
  for (const q of cp) { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < best) best = d; }
  naked.push([p.x, p.z, +best.toFixed(1)]);
}
// chevauchements d'objets (deux boîtes qui s'interpénètrent : irréaliste, sauf arbre dans son bac)
const ov = []; const O = def.obstacles;
for (let i = 0; i < O.length; i++) for (let j = i + 1; j < O.length; j++) {
  const a = O[i], b = O[j];
  const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), iz = Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z);
  if (ix > 0.05 && iz > 0.05 && !(/arbre/.test(a.name + b.name) && /bac/.test(a.name + b.name)) && !/^mur/.test(a.name) && !/^mur/.test(b.name)) ov.push([a.name, b.name, +ix.toFixed(2), +iz.toFixed(2), +a.x.toFixed(1), +a.z.toFixed(1)]);
}
// chemins de l'IA par voie : départ -> point de passage sur la voie -> zone (A* réel)
const paths = {};
if (def.voies && def.capture) for (const [k, zv] of Object.entries(def.voies)) {
  paths[k] = def.spawns.map((s, t) => {
    const mx = t ? W * 0.68 : W * 0.32;
    const a = map.findPath(s.x, s.z, mx, zv) || [], b = map.findPath(mx, zv, def.capture.x, def.capture.z) || [];
    return a.concat(b).map(p => [+p.x.toFixed(1), +p.z.toFixed(1)]);
  });
}
// circulation automobile : grille de 0,5 m, une case est roulable si elle est à plus de 1,05 m de tout obstacle (demi-largeur
// d'une voiture + marge). On part des portails (bords ouest / est à z = milieu de leur ouverture) et des ouvertures
// éventuelles déclarées dans def.acces ([[x, z], …]). Chaque véhicule garé doit toucher la zone roulable par son arrière
// (ou un côté pour les bus/fourgons) : sinon il n'a pas pu se garer là.
const CS = 0.5, CW = Math.ceil(W / CS), CH = Math.ceil(D / CS), drv = new Uint8Array(CW * CH), reach = new Uint8Array(CW * CH);
const VEH = /^(voiture|fourgon|bus)/;
for (let j = 0; j < CH; j++) for (let i = 0; i < CW; i++) {
  const x = (i + 0.5) * CS, z = (j + 0.5) * CS; let ok = x > 1.05 && z > 1.05 && x < W - 1.05 && z < D - 1.05;
  for (const o of O) { if (!ok) break; if (/^mur portail/.test(o.name)) continue; const dx = Math.max(o.x - x, 0, x - (o.x + o.w)), dz = Math.max(o.z - z, 0, z - (o.z + o.d)); if (Math.hypot(dx, dz) < 1.05) ok = false; }
  // les portails : l'ouverture dans le mur d'enceinte compte comme roulable jusqu'au bord
  for (const o of O) if (/^mur portail/.test(o.name) && z > o.z + 1.05 && z < o.z + o.d - 1.05 && (x < 2 || x > W - 2)) { let free = true; for (const q of O) { if (/^mur/.test(q.name)) continue; const dx = Math.max(q.x - x, 0, x - (q.x + q.w)), dz = Math.max(q.z - z, 0, z - (q.z + q.d)); if (Math.hypot(dx, dz) < 1.05) free = false; } if (free) ok = true; }
  drv[j * CW + i] = ok ? 1 : 0;
}
const seeds = []; for (const o of O) if (/^mur portail/.test(o.name)) seeds.push([o.x < 0 ? 0.75 : W - 0.75, o.z + o.d / 2]);
for (const a of def.acces || []) seeds.push(a);
const comps = []; // composantes atteintes depuis chaque accès
for (const [sx, sz] of seeds) {
  const si = Math.min(CW - 1, Math.floor(sx / CS)), sj = Math.min(CH - 1, Math.floor(sz / CS)); let k0 = sj * CW + si;
  if (!drv[k0]) { let best = -1, bd = 1e9; for (let j = Math.max(0, sj - 8); j < Math.min(CH, sj + 8); j++) for (let i = Math.max(0, si - 8); i < Math.min(CW, si + 8); i++) if (drv[j * CW + i]) { const d = (i - si) ** 2 + (j - sj) ** 2; if (d < bd) { bd = d; best = j * CW + i; } } k0 = best; }
  if (k0 < 0) { comps.push({ seed: [sx, sz], n: 0 }); continue; }
  const id = comps.length + 1, q = [k0]; let n = 0; if (reach[k0]) { comps.push({ seed: [sx, sz], n: -reach[k0] }); continue; } reach[k0] = id;
  while (q.length) { const k = q.pop(); n++; const i = k % CW, j = (k / CW) | 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= CW || b >= CH) continue; const kk = b * CW + a; if (drv[kk] && !reach[kk]) { reach[kk] = id; q.push(kk); } } }
  comps.push({ seed: [sx, sz], n });
}
// véhicules garés : atteignables ? (une case roulable atteinte à moins de 1,6 m de leur boîte, du côté de l'arrière si o.dir)
const stuck = [];
for (const o of O) if (VEH.test(o.name)) {
  let ok = false;
  for (let j = Math.max(0, Math.floor((o.z - 1.8) / CS)); j < Math.min(CH, Math.ceil((o.z + o.d + 1.8) / CS)) && !ok; j++) for (let i = Math.max(0, Math.floor((o.x - 1.8) / CS)); i < Math.min(CW, Math.ceil((o.x + o.w + 1.8) / CS)) && !ok; i++) {
    if (!reach[j * CW + i]) continue; const x = (i + 0.5) * CS, z = (j + 0.5) * CS;
    if (o.dir !== undefined && o.w >= o.d) { const rear = o.dir > 0 ? o.x : o.x + o.w; if (Math.abs(x - rear) > 1.7 || z < o.z - 0.5 || z > o.z + o.d + 0.5 || (x - rear) * o.dir > 0.2) continue; }
    ok = true;
  }
  if (!ok) stuck.push([o.name, +o.x.toFixed(1), +o.z.toFixed(1)]);
}
const reachList = []; for (let k = 0; k < reach.length; k++) if (reach[k]) reachList.push([(k % CW + 0.5) * CS, (((k / CW) | 0) + 0.5) * CS, reach[k]]);
console.log(JSON.stringify({
  comps, stuck, reach: reachList,
  id, name: def.name, w: W, d: D, spawns: def.spawns, capture: def.capture, voies: def.voies || null, marquage: def.marquage || null,
  obs: O.map(o => ({ x: o.x, z: o.z, w: o.w, d: o.d, h: o.h, kind: o.kind, name: o.name, dir: o.dir, teinte: o.teinte })),
  cover: cp.map(p => [p.x, p.z]), lines: lines.slice(0, 400), nLines: lines.length, naked, overlaps: ov, paths,
}));
