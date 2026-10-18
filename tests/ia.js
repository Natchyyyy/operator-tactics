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
  // (ancienne IA sur cette carte : ~15 % des tirs à moins de 5 m, ~1,3 rencontre à moins de 2 m par bataille ; la nouvelle :
  // ~2 à 6 % et ~0,2 à 0,5 selon l'état de la carte — les coins de la ruelle et les bouts de l'abri restent des lieux de contact)
  check('engagement : on se bat à distance — moins de 8 % des tirs à moins de 5 m, rencontres à moins de 2 m rares (< 0,8 par bataille)', shots > 500 && shotsClose / shots < 0.08 && encounters / battles < 0.8, { r: shotsClose / shots, enc: encounters / battles });
  check('espacement : deux équipiers à moins de 1 m moins de 4 % du temps (au passage seulement)', matesClose / mates < 0.04, { r: matesClose / mates });
  // précision : à bout portant on ne rate (presque) plus ; de loin, ça reste incertain
  const b = mk(1); const [u] = b.teams[0].units, [e] = b.teams[1].units;
  b.map.obstacles = [];   // terrain nu (cette carte-ci seulement) : on mesure la précision pure, sans couvert
  const p = (d, moving) => { u.x = 8; u.z = 20; e.x = 8 + d; e.z = 20; u.moving = !!moving; e.moving = !!moving; u.suppression = 0; u.burst = 0; return b.hitChance(u, e, d).p; };
  check('précision : à 1–2 m on touche presque à coup sûr même en mouvement (> 0,75), la chance décroît avec la distance, et reste incertaine à 40 m (< 0,3)', p(1.5, true) > 0.75 && p(3, true) > 0.5 && p(1.5) > p(5) && p(5) > p(15) && p(15) >= p(40) && p(40) < 0.3, { p1: p(1.5, true), p3: p(3, true), p5: p(5), p15: p(15), p40: p(40) });
}
{
  // ---- Balles perdues : un tir manqué peut toucher un autre adversaire collé à la trajectoire (jamais un allié du tireur) ----
  const b = mk(2); b.map.obstacles = [];
  const [u, mate] = b.teams[0].units, [e, e2] = b.teams[1].units;
  const rate = (setup) => { let n = 0; for (let k = 0; k < 2000; k++) { setup(); if (b.strayVictim(u, e, Math.hypot(e.x - u.x, e.z - u.z))) n++; } return n / 2000; };
  const base = () => { u.x = 8; u.z = 20; e.x = 20; e.z = 20; mate.x = 8; mate.z = 30; e2.x = 8; e2.z = 40; };
  const behind = rate(() => { base(); e2.x = 23; e2.z = 20.1; });           // juste derrière la cible, sur la trajectoire
  const beside = rate(() => { base(); e2.x = 20; e2.z = 20.45; });          // à côté de la cible, frôle la trajectoire
  const apart = rate(() => { base(); e2.x = 20; e2.z = 22.5; });            // à 2,5 m de côté
  const ally = rate(() => { base(); mate.x = 23; mate.z = 20.1; });          // un allié du tireur derrière la cible : jamais
  b.map.obstacles = [{ x: 21, z: 19, w: 0.6, d: 2, h: 2.4, kind: 'wall', name: 'mur' }];
  const walled = rate(() => { base(); e2.x = 23; e2.z = 20.1; });           // un mur entre la cible et lui : la balle s'y arrête
  check('balles perdues : un adversaire sur la trajectoire derrière la cible est touché 30–50 % des tirs manqués, celui qui la frôle moins, rien à 2,5 m, jamais un allié, jamais à travers un mur',
    behind > 0.4 && behind < 0.55 && beside > 0.25 && beside < behind && apart === 0 && ally === 0 && walled === 0, { behind, beside, apart, ally, walled });
  // en situation de tir réelle (shoot) : la balle perdue passe par le calcul normal (localisation, protection) et se journalise
  const c = mk(3); c.map.obstacles = [];
  const [s1] = c.teams[0].units, [t1, t2] = c.teams[1].units;
  s1.x = 8; s1.z = 20; t1.x = 20; t1.z = 20; t2.x = 22; t2.z = 20.2; for (const v of c.units) if (v !== s1 && v !== t1 && v !== t2) { v.x = 60; v.z = v.team ? 5 : 40; }
  t2.maxHp = t2.hp = 1e6; t1.maxHp = t1.hp = 1e6;
  for (let k = 0; k < 300; k++) c.shoot(s1, t1, 12);
  const sl = c.log.filter(l => l.stray);
  check('balles perdues : en tir réel, l\'adversaire derrière la cible prend des balles perdues, journalisées « Balle perdue : … », dégâts au calcul normal (tête / torse / membre)',
    sl.length > 30 && sl.length === s1.stats.strays && sl.every(l => /^Balle perdue : /.test(l.text) && l.enemy === t2.id && ['tête', 'torse', 'membre'].includes(l.loc)) && t2.stats.damageTaken > 0 && t1.stats.damageTaken > 0, { strays: sl.length, stat: s1.stats.strays });
}
{
  // ---- Départ : deux équipiers ne commencent jamais au même endroit (ni ne s'y retrouvent à 1 s) ----
  let stacked = 0, ex = null;
  for (let sd = 1; sd <= 120; sd++) {
    const b = mk(sd), look = () => { for (const t of b.teams) for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) { const p = t.units[i], q = t.units[j]; if (Math.hypot(p.x - q.x, p.z - q.z) < 0.8) { stacked++; ex = ex || { sd, t: b.t, p: p.id, q: q.id }; } } };
    look(); while (b.t < 1) b.step(); look();
  }
  check('départ : aucun équipier à moins de 0,8 m d\'un autre à t = 0 et t = 1 s (120 graines)', stacked === 0, ex);
  // ---- Corps : on ne s'arrête pas les pieds dans un opérateur tombé (poupée de chiffon côté rendu) ----
  let onCorpse = 0, still = 0;
  for (let sd = 301; sd <= 306; sd++) { const b = mk(sd); while (!b.over) { b.step(); for (const u of b.units) if (u.alive && !u.moving && u.state !== 'reviving') { still++; if (b.units.some(c => !c.alive && Math.hypot(c.x - u.x, c.z - u.z) < 0.5)) onCorpse++; } } }
  check('corps : un opérateur arrêté ne se tient presque jamais sur un corps (< 0,5 m ; < 0,3 % du temps)', onCorpse / still < 0.003, { onCorpse, still });
}
{
  // ---- Ordre « tenir une position clé » (capacité du moteur, pas encore utilisée par l'IA ni l'interface) ----
  // position d'essai : un point de couverture plaqué du côté ouest, couvert face à l'est (la carte définira les vraies)
  const ops = ['op_vautour', 'op_lynx', 'op_granit', 'op_bastion', 'op_belier'];
  const mkK = (seed, o) => { const b = new Battle(Object.assign({ seed, mapId: 'parking', teams: [{ name: 'A', operators: ops, tactics: ['tiroir'] }, { name: 'B', operators: ops, tactics: ['tiroir'] }] }, o || {}));
    const cp = b.map.coverPoints.filter(c => c.x > 14 && c.x < 30 && b.coverAt(b.hug(c).hx, c.hz, c.hx + 20, c.hz, true)).sort((p1, p2) => Math.abs(p1.z - 23) - Math.abs(p2.z - 23))[0];
    b.map.def = Object.assign({}, b.map.def, { positionsCles: [{ id: 'essai', nom: 'Essai', x: cp.hx, z: cp.hz, r: 2.5, menace: 0, voie: 0 }] });   // cette bataille seulement
    return b; };
  const b = mkK(4); while (b.t < 1) b.step();
  const bad = b.command('tenir', 0, { pos: 'inconnue', units: ['0:op_lynx'] });
  const r = b.command('tenir', 0, { pos: 'essai', units: ['0:op_lynx', '0:op_granit'] });
  const P = b.keyPosition('essai'), [ly, gr] = ['0:op_lynx', '0:op_granit'].map(id => b.unitById(id));
  let reached = null; let stayed = true;
  while (b.t < 45 && !b.over) { b.step(); const ok = [ly, gr].every(u => !u.alive || Math.hypot(u.x - u.keyOrder.x, u.z - u.keyOrder.z) < 0.7); if (ok && reached === null) reached = b.t; if (reached !== null && b.t > reached + 1) for (const u of [ly, gr]) if (u.alive && Math.hypot(u.x - P.x, u.z - P.z) > P.r + 2.6) stayed = false; }
  check('position clé : ordre refusé pour une position inconnue, accepté et journalisé sinon', !bad.ok && r.ok && b.log.some(l => /Lynx, Granit vont tenir la position clé « Essai »/.test(l.text)), { bad, r });
  check('position clé : les opérateurs désignés la rejoignent, l\'un sur le point, l\'autre à côté (jamais l\'un sur l\'autre), et y restent', reached !== null && stayed && (!ly.alive || !gr.alive || Math.hypot(ly.x - gr.x, ly.z - gr.z) > 1.5), { reached, stayed });
  check('position clé : « X tient la position clé « Essai » » au journal ; les autres opérateurs ne sont pas concernés', b.log.some(l => l.kind === 'keypos' && /tient la position clé « Essai »/.test(l.text)) && b.teams[0].units.filter(u => u.keyOrder).length === 2);
  const c = b.command('tenir', 0, { pos: null, units: ['0:op_lynx'] });
  check('position clé : l\'ordre s\'annule (pos: null)', c.ok && !ly.keyOrder);
  // rejouable : mêmes commandes au même pas → même bataille
  const a1 = mkK(9); while (a1.t < 3) a1.step(); a1.command('tenir', 0, { pos: 'essai', units: ['0:op_vautour'] }); a1.run();
  const a2 = mkK(9, { replayInputs: a1.inputs }); a2.run();
  check('position clé : la bataille revue avec l\'ordre est identique', JSON.stringify(a1.result.teams) === JSON.stringify(a2.result.teams) && a1.result.duration === a2.result.duration);
  // positions clés décrites par la carte (s'il y en a) : point libre, joignable depuis les deux zones de départ, et
  // vraiment couvert (obstacle ≥ 0,9 m juste devant) face à sa direction de menace
  const m = mk(1), kps = m.keyPositions(), badKp = [];
  for (const q of kps) {
    const cov = q.menace === null || q.menace === undefined || !!m.coverAt(q.x, q.z, q.x + Math.cos(q.menace) * 20, q.z + Math.sin(q.menace) * 20, true);
    if (m.map.insideObstacle(q.x, q.z) || !cov || m.map.spawns.some(sp => !m.map.findPath(sp.x, sp.z, q.x, q.z))) badKp.push(q.id);
  }
  check(`position clé : celles de la carte (${kps.length}) sont libres, joignables des deux camps et couvertes face à leur menace`, badKp.length === 0, badKp);
  // sans ordre, rien ne change : l'IA ne court pas d'elle-même aux positions clés
  const n = mkK(4); n.run();
  check('position clé : sans ordre, aucun opérateur n\'en reçoit (l\'IA ne les dispute pas d\'elle-même)', n.units.every(u => !u.keyOrder) && !n.log.some(l => l.kind === 'keypos'));
}
console.log(`\n${pass}/${pass + fail} vérifications réussies` + (skip ? ` (${skip} mises de côté : fonctions désactivées)` : '')); process.exit(fail ? 1 : 0);
