// Vérifications de l'IA avec le contenu réel du jeu (parking, GIGN contre Groupe Karst, tactique Tiroir) :
// bonds alternés, prise en compte des alliés (ligne de tir, espacement, soutien), blessés à terre immobiles.
// usage : node tests/ia.js
const OT = Object.assign({}, require('../sim/rng.js'), require('../sim/data.js'), require('../sim/map.js'), require('../sim/engine.js'));
const { Battle, DATA } = OT;
let pass = 0, fail = 0;
// Fonctions désactivées pour l'instant (une seule classe : assaut ; plaques moyennes pour tous ; aucun accessoire ;
// voie d'approche automatique) : leurs vérifications sont mises de côté, à réactiver quand elles reviendront.
const DESACTIVE = ["tiroir : l'escouade est partagée"];
let skip = 0;
const check = (n, c, i) => { if (DESACTIVE.some(d => n.startsWith(d))) { skip++; console.log('(désactivé) ' + n); return; } if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + JSON.stringify(i))); };
const GIGN = ['op_vautour', 'op_lynx', 'op_granit', 'op_bastion', 'op_belier'], KARST = ['k_molosse', 'k_vipere', 'k_rapace', 'k_hyene', 'k_chacal'];
const mk = (seed, o) => new Battle(Object.assign({ seed, mapId: 'parking', teams: [
  { name: 'Alpha', order: 'careful', operators: GIGN, tactics: ['tiroir'] }, { name: 'Bravo', order: 'assault', operators: KARST, tactics: ['tiroir'] }] }, o || {}));

{
  // ---- Tiroir : deux moitiés qui alternent ; pendant qu'une avance, l'autre reste arrêtée ----
  const b = mk(3);
  const g = (team, k) => b.teams[team].units.filter(u => u.boundGroup === k).map(u => u.callsign);
  check('tiroir : l\'escouade est partagée en deux moitiés, le tireur d\'élite reste en appui', g(0, 0).length === 2 && g(0, 1).length === 2 && b.teams[0].units.find(u => u.role.id === 'marksman').boundGroup === -1, { g0: g(0, 0), g1: g(0, 1) });
  let switches = 0, last = b.teams[0].bound.group, coverMoving = 0, coverSamples = 0, moverMoving = 0, moverSamples = 0;
  while (b.t < 40 && !b.over) {
    b.step();
    const bd = b.teams[0].bound; if (bd.group !== last) { switches++; last = bd.group; }
    // avant tout contact, on compare la part de déplacement des deux moitiés (hors bond en cours de fin)
    if (b.t > 2 && !b.teams[0].units.some(u => u.alive && u.visible.size)) for (const u of b.teams[0].units) {
      if (!u.alive || u.boundGroup < 0) continue;
      if (u.boundGroup === bd.group) { moverSamples++; if (u.moving) moverMoving++; } else { coverSamples++; if (u.moving && u.goalKind !== 'bound') coverMoving++; }
    }
  }
  check('tiroir : les rôles s\'inversent plusieurs fois (bonds alternés) et le journal le dit', switches >= 3 && b.log.some(e => e.kind === 'tiroir'), { switches });
  check('tiroir : la moitié qui couvre reste arrêtée, celle qui avance se déplace', coverSamples > 0 && coverMoving / coverSamples < 0.1 && moverMoving / moverSamples > 0.3, { cover: coverMoving / coverSamples, mover: moverMoving / moverSamples });
  const ow = b.log.length; // une décision « en couverture » existe vraiment
  let overwatch = 0; const c = mk(5); while (c.t < 25 && !c.over) { c.step(); overwatch += c.teams[0].units.filter(u => u.alive && u.state === 'overwatch').length; }
  check('tiroir : des opérateurs sont en couverture (face à la menace, arrêtés)', overwatch > 50, overwatch);
  // ordre « Tenir » : pas de tiroir
  const h = mk(3); h.teams[0].order = 'hold'; while (h.t < 15) h.step();
  check('tiroir : désactivé quand l\'ordre est « Tenir »', h.teams[0].units.every(u => !h.tiroirOn(u)));
  // sans la tactique : aucun bond alterné
  const n = mk(3, { teams: [{ order: 'careful', operators: GIGN, tactics: [] }, { order: 'assault', operators: KARST, tactics: [] }] }); while (n.t < 20) n.step();
  check('sans la tactique : pas de tiroir', !n.log.some(e => e.kind === 'tiroir') && n.teams[0].units.every(u => !n.tiroirOn(u)));
  // de vraies batailles se terminent
  let ended = 0; for (let s = 1; s <= 10; s++) { const x = mk(s); x.run(); if (x.over && x.result) ended++; }
  check('tiroir : 10 batailles réelles se terminent', ended === 10, ended);
}
{
  // ---- Alliés : on ne tire pas à travers un camarade ----
  const b = mk(1, { teams: [{ order: 'hold', operators: ['op_vautour', 'op_lynx'], tactics: [] }, { order: 'hold', operators: ['k_molosse'], tactics: [] }] });
  const [s, a] = b.teams[0].units, [e] = b.teams[1].units;
  // une ligne dégagée sur le parking (cherchée, pas supposée)
  let row = null; for (let z = 2; z < 44 && row === null; z += 0.5) if (b.map.hasLOS(14, 1.6, z, 30, 1.25, z) && !b.map.insideObstacle(14, z) && !b.map.insideObstacle(30, z) && !b.map.insideObstacle(22, z)) row = z;
  s.x = 14; s.z = row; e.x = 30; e.z = row; a.x = 22; a.z = row; s.facing = 0; e.facing = Math.PI;
  b.setGoal = () => false;                  // personne ne bouge : on teste le tir pur
  check('allié dans la ligne de tir : détecté', b.allyInLine(s, e) && !b.allyInLine(e, s));
  b.perceive(s); s.target = e; s.aimTimer = 0; s.state = 'engage'; const shots0 = s.stats.shots;
  for (let k = 0; k < 30; k++) { b.t += OT.DT; b.fireAt(s, e); }
  check('allié dans la ligne de tir : aucun coup tiré', s.stats.shots === shots0 && s.blockedAt > 0, { shots: s.stats.shots - shots0 });
  a.z = row + 2.5; for (let k = 0; k < 30; k++) { b.t += OT.DT; b.fireAt(s, e); }
  check('allié écarté : le tir reprend', s.stats.shots > shots0, s.stats.shots - shots0);
  // en vraie bataille : quasiment jamais de tir avec un allié sur la trajectoire
  let bad = 0, total = 0;
  for (let sd = 1; sd <= 6; sd++) {
    const x = mk(sd); const orig = x.shoot.bind(x);
    x.shoot = function (u, t, d) { total++; for (const al of this.teams[u.team].units) if (al !== u && al.alive) { const dx = t.x - u.x, dz = t.z - u.z, L2 = dx * dx + dz * dz, q = ((al.x - u.x) * dx + (al.z - u.z) * dz) / L2; if (q > 0.04 && q < 0.96 && Math.hypot(u.x + dx * q - al.x, u.z + dz * q - al.z) < 0.55) bad++; } return orig(u, t, d); };
    x.run();
  }
  check('en bataille : aucun tir avec un allié sur la trajectoire', total > 200 && bad === 0, { bad, total });
}
{
  // ---- Alliés : on se répartit sur les couverts (pas deux sur le même, pas en grappe) ----
  let close = 0, samples = 0;
  for (let sd = 1; sd <= 6; sd++) {
    const b = mk(sd);
    while (b.t < 60 && !b.over) { b.step(); if (b.tick % 10) continue;
      for (const team of b.teams) { const al = team.units.filter(u => u.alive && !u.moving); for (let i = 0; i < al.length; i++) for (let j = i + 1; j < al.length; j++) { samples++; if (Math.hypot(al[i].x - al[j].x, al[i].z - al[j].z) < 1.2) close++; } } }
  }
  check('espacement : deux opérateurs arrêtés à moins de 1,2 m l\'un de l\'autre restent rares (< 3 %)', close / samples < 0.03, { close, samples, r: close / samples });
}
{
  // ---- Soutien : un ennemi qui tire sur un camarade devient la cible prioritaire ----
  const b = mk(2, { teams: [{ order: 'hold', operators: ['op_vautour', 'op_lynx'], tactics: [] }, { order: 'hold', operators: ['k_molosse', 'k_vipere'], tactics: [] }] });
  const [u, mate] = b.teams[0].units, [e1, e2] = b.teams[1].units;
  u.x = 10; u.z = 10; mate.x = 10; mate.z = 16; e1.x = 30; e1.z = 10; e2.x = 31; e2.z = 12;
  e2.target = mate; e2.lastShotAt = b.t; e1.target = null;
  check('soutien : l\'ennemi qui tire sur un allié est préféré à un ennemi équivalent', b.chooseTarget(u, [e1, e2]) === e2);
}
{
  // ---- Blessé à terre : il ne bouge plus (plus de reptation) ----
  let moved = 0, downs = 0;
  for (let sd = 1; sd <= 12; sd++) {
    const b = mk(sd); const pos = {};
    while (!b.over) { b.step(); for (const u of b.units) { if (u.alive) { delete pos[u.id]; continue; } if (!pos[u.id]) { pos[u.id] = { x: u.x, z: u.z }; downs++; } else if (Math.hypot(u.x - pos[u.id].x, u.z - pos[u.id].z) > 0.01) moved++; } }
  }
  check('à terre : un opérateur neutralisé ne se déplace plus jamais', downs > 20 && moved === 0, { downs, moved });
}
{
  // ---- Couvert, espacement, distance d'engagement, précision à bout portant (sur de vraies batailles) ----
  // Vérification indépendante du moteur : un « vrai couvert » est un obstacle d'au moins 0,9 m de haut, dont le bord est à
  // moins de 1 m du soldat, qui coupe la ligne des yeux de la menace (1,6 m) vers ses hanches (0,5 m), juste devant lui.
  const edge = (x, z, o) => Math.hypot(Math.max(o.x - x, 0, x - (o.x + o.w)), Math.max(o.z - z, 0, z - (o.z + o.d)));
  // (l'obstacle coupe la ligne dans les 1,6 m devant le soldat : au bout d'un long bac aligné sur la menace, on est à côté, pas derrière)
  const realCover = (b, x, z, tx, tz) => { const D = Math.hypot(tx - x, tz - z), L = Math.min(1.6, D * 0.9); if (D < 0.5) return false;
    return b.map.obstacles.some(o => o.h >= 0.9 && edge(x, z, o) <= 1.0 && OT.segmentHitsBox(x + (tx - x) / D * L, 0.5 + 1.1 * L / D, z + (tz - z) / D * L, x, 0.5, z, o)); };
  const threatOf = (b, u) => {
    let th = null, td = 99;
    for (const e of b.enemiesOf(u)) if (e.alive && u.visible.has(e.id)) { const d = Math.hypot(u.x - e.x, u.z - e.z); if (d < td) { td = d; th = e; } }
    if (!th && b.t - u.lastShotByAt < 1.5 && u.lastShotBy && u.lastShotBy.alive) th = u.lastShotBy;
    if (!th) for (const e of b.enemiesOf(u)) { const k = u.knowledge[e.id]; if (e.alive && k) { const d = Math.hypot(k.x - u.x, k.z - u.z); if (d < td) { td = d; th = k; } } }
    return th;
  };
  let claimed = 0, invalid = 0, contact = 0, contactCov = 0, shots = 0, shotsClose = 0, encounters = 0, mates = 0, matesClose = 0, battles = 0;
  for (let sd = 101; sd <= 112; sd++) {
    const b = mk(sd); battles++;
    const orig = b.shoot.bind(b); b.shoot = function (u, e, d) { shots++; if (d < 5) shotsClose++; return orig(u, e, d); };
    const near = new Set();
    while (!b.over) {
      b.step();
      for (const u of b.units) {
        if (!u.alive) continue;
        const th = threatOf(b, u);
        if (u.stance === 'crouch' && !u.moving && u.state !== 'reviving' && th) { claimed++; if (!realCover(b, u.x, u.z, th.x, th.z)) invalid++; }
        if (th && (u.visible.size || b.t - u.lastShotByAt < 1.5)) { contact++; if (realCover(b, u.x, u.z, th.x, th.z)) contactCov++; }
        let m = 99; for (const a of b.teams[u.team].units) if (a !== u && a.alive) m = Math.min(m, Math.hypot(a.x - u.x, a.z - u.z));
        if (m < 99) { mates++; if (m < 1) matesClose++; }
        if (u.team === 0) for (const e of b.teams[1].units) if (e.alive) { const d = Math.hypot(u.x - e.x, u.z - e.z), k = u.id + e.id; if (d < 2 && !near.has(k)) { near.add(k); encounters++; } else if (d > 4) near.delete(k); }
      }
    }
  }
  check('couvert : accroupi à l\'arrêt = derrière un vrai obstacle (≥ 0,9 m, à moins de 1 m) face à la menace — jamais derrière rien', claimed > 1000 && invalid / claimed < 0.005, { claimed, invalid });
  check('couvert : au contact, l\'opérateur est le plus souvent derrière un vrai couvert (> 45 % du temps)', contactCov / contact > 0.45, { r: contactCov / contact });
  check('engagement : on se bat à distance — moins de 5 % des tirs à moins de 5 m, rencontres à moins de 2 m rares (< 0,7 par bataille)', shots > 500 && shotsClose / shots < 0.05 && encounters / battles < 0.7, { r: shotsClose / shots, enc: encounters / battles });
  check('espacement : deux équipiers à moins de 1 m moins de 4 % du temps (au passage seulement)', matesClose / mates < 0.04, { r: matesClose / mates });
  // précision : à bout portant on ne rate (presque) plus ; de loin, ça reste incertain
  const b = mk(1); const [u] = b.teams[0].units, [e] = b.teams[1].units;
  b.map.obstacles = [];   // terrain nu (cette carte-ci seulement) : on mesure la précision pure, sans couvert
  const p = (d, moving) => { u.x = 8; u.z = 20; e.x = 8 + d; e.z = 20; u.moving = !!moving; e.moving = !!moving; u.suppression = 0; u.burst = 0; return b.hitChance(u, e, d).p; };
  check('précision : à 1–2 m on touche presque à coup sûr même en mouvement (> 0,75), la chance décroît avec la distance, et reste incertaine à 40 m (< 0,3)', p(1.5, true) > 0.75 && p(3, true) > 0.5 && p(1.5) > p(5) && p(5) > p(15) && p(15) >= p(40) && p(40) < 0.3, { p1: p(1.5, true), p3: p(3, true), p5: p(5), p15: p(15), p40: p(40) });
}
console.log(`\n${pass}/${pass + fail} vérifications réussies` + (skip ? ` (${skip} mises de côté : fonctions désactivées)` : '')); process.exit(fail ? 1 : 0);
