// Équilibre d'une carte asymétrique : deux escouades IDENTIQUES s'affrontent N fois (graines différentes) ; on compte les
// victoires de chaque côté (ouest / est), par mode, avec un intervalle de confiance à 95 %, et où ont lieu les morts
// (carte de chaleur grossière, par voie). Usage : node outils/equilibre.js [carte] [N]
const path = require('path'); const R = (p) => require(path.join(__dirname, '..', p));
const { Battle } = R('sim/engine.js'); const { MAPS } = R('sim/map.js');
const id = process.argv[2] || 'parking', N = +(process.argv[3] || 200);
const ops = ['op_vautour', 'op_lynx', 'op_granit', 'op_bastion', 'op_belier'];
for (const obj of ['eliminate', 'capture']) {
  const w = [0, 0, 0], morts = { nord: 0, milieu: 0, sud: 0 }, dur = [];
  for (let sd = 1; sd <= N; sd++) {
    const b = new Battle({ seed: 9000 + sd, mapId: id, objective: { type: obj }, teams: [{ name: 'A', operators: ops }, { name: 'B', operators: ops }] });
    const r = b.run(); w[r.winner >= 0 ? r.winner : 2]++; dur.push(r.duration);
    for (const u of b.units) if (!u.alive) { const z = u.z, d = MAPS[id].depth; morts[z < d / 3 ? 'nord' : z > 2 * d / 3 ? 'sud' : 'milieu']++; }
  }
  const n = w[0] + w[1], p = w[0] / n, ci = 1.96 * Math.sqrt(p * (1 - p) / n);
  console.log(`${obj.padEnd(9)} ouest ${(100 * p).toFixed(1)} % ± ${(100 * ci).toFixed(1)}  (ouest ${w[0]}, est ${w[1]}, nuls ${w[2]}) · durée moy. ${(dur.reduce((a, b) => a + b, 0) / dur.length).toFixed(0)} s · morts par voie ${JSON.stringify(morts)}`);
}
