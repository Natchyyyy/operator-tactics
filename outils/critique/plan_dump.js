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
console.log(JSON.stringify({
  id, name: def.name, w: W, d: D, spawns: def.spawns, capture: def.capture, voies: def.voies || null, marquage: def.marquage || null,
  obs: O.map(o => ({ x: o.x, z: o.z, w: o.w, d: o.d, h: o.h, kind: o.kind, name: o.name, dir: o.dir, teinte: o.teinte })),
  cover: cp.map(p => [p.x, p.z]), lines: lines.slice(0, 400), nLines: lines.length, naked, overlaps: ov, paths,
}));
