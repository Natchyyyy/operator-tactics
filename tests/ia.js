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
  // ~2 à 7 % et ~0,2 à 0,5 selon l'état de la carte — le muret central du lavage et la chicane de la ruelle restent des lieux
  // de contact rapproché ; seuil à 10 %, bien sous l'ancienne IA)
  check('engagement : on se bat à distance — moins de 10 % des tirs à moins de 5 m, rencontres à moins de 2 m rares (< 0,8 par bataille)', shots > 500 && shotsClose / shots < 0.1 && encounters / battles < 0.8, { r: shotsClose / shots, enc: encounters / battles });
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
  // et en vraies batailles, chaque balle perdue (s'il y en a : elles sont rares quand l'escouade est bien espacée) est journalisée
  let st = 0, lg = 0; for (let sd = 201; sd <= 206; sd++) { const x = mk(sd); x.run(); st += x.units.reduce((a, v) => a + (v.stats.strays || 0), 0); lg += x.log.filter(l => l.stray && /^Balle perdue/.test(l.text)).length; }
  check('balles perdues : en vraies batailles, chacune est journalisée (compteur = journal)', st === lg, { st, lg });
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
    const reach = (sp) => { const pa = m.map.findPath(sp.x, sp.z, q.x, q.z), l = pa && pa[pa.length - 1]; return !!l && Math.hypot(l.x - q.x, l.z - q.z) < 1.2 && m.map.walkableSegment(l.x, l.z, q.x, q.z); };   // le chemin arrive bien AU point (pas de l'autre côté d'un mur)
    if (m.map.insideObstacle(q.x, q.z) || !cov || !m.map.spawns.every(reach)) badKp.push(q.id);
  }
  check(`position clé : celles de la carte (${kps.length}) sont libres, joignables des deux camps et couvertes face à leur menace`, badKp.length === 0, badKp);
  // sans ordre, rien ne change : l'IA ne court pas d'elle-même aux positions clés
  const n = mkK(4); n.run();
  check('position clé : sans ordre, aucun opérateur n\'en reçoit (l\'IA ne les dispute pas d\'elle-même)', n.units.every(u => !u.keyOrder) && !n.log.some(l => l.kind === 'keypos'));
}
{
  // ---- Ordre de déplacement du joueur (clic droit) : command('aller', 0, { x, z, units, mode, arrivee }) ----
  const mkA = (seed, o) => new Battle(Object.assign({ seed, mapId: 'parking', teams: [{ name: 'Alpha', order: 'assault', operators: GIGN, tactics: ['tiroir'] }, { name: 'Bravo', order: 'hold', operators: KARST, tactics: ['tiroir'] }] }, o || {}));
  const P = { x: 35, z: 23 };
  const run = (mode, seed) => {
    const b = mkA(seed); while (b.t < 1) b.step();
    const r = b.command('aller', 0, { x: P.x, z: P.z, units: null, mode, arrivee: 'tenir' });
    const spam = b.command('aller', 0, { x: P.x, z: P.z + 5, units: null, mode, arrivee: 'tenir' });
    let all = null, mixed = 0, samples = 0, overwatch = 0, spread = 0, held = true;
    while (b.t < 75 && !b.over) {
      b.step();
      const ord = b.teams[0].units.filter(u => u.alive && u.moveOrder);
      if (ord.length >= 2) { samples++; const m = ord.filter(u => u.moving).length; if (m > 0 && m < ord.length) mixed++; }
      const ow = ord.filter(u => u.state === 'overwatch' && !u.target); overwatch += ow.length;
      for (let i = 0; i < ow.length; i++) for (let j = i + 1; j < ow.length; j++) { let d = Math.abs(ow[i].facing - ow[j].facing) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d; if (d > 0.45) { spread++; } }
      if (all === null && !ord.length) all = b.t;
      // (tenir à 360° : un opérateur peut se décaler dans la position pour appuyer un équipier — à ≤ 8 m de sa place — ou
      // s'écarter d'une grenade ; il ne la quitte pas)
      if (all !== null && b.t > all + 1) for (const u of b.teams[0].units) if (u.alive && u.state !== 'evade' && (!u.keyOrder || (Math.hypot(u.x - u.keyOrder.x, u.z - u.keyOrder.z) > 3 && !(u.keyOrder.hx !== undefined && Math.hypot(u.x - u.keyOrder.hx, u.z - u.keyOrder.hz) <= 8)))) held = false;
      if (all !== null && b.t > all + 12) break;
    }
    const us = b.teams[0].units.filter(u => u.alive); let gap = Infinity;
    for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) gap = Math.min(gap, Math.hypot(us[i].x - us[j].x, us[i].z - us[j].z));
    return { b, r, spam, all, mixed: samples ? mixed / samples : 0, overwatch, spread, held, gap };
  };
  const M = run('methodique', 4), A = run('agressif', 4);
  check('ordre de déplacement : accepté, journalisé, enregistré dans les commandes ; un 2e ordre dans les 3 s refusé', M.r.ok && A.r.ok && !M.spam.ok && /toutes les 3 s/.test(M.spam.reason) && M.b.inputs.filter(c => c.type === 'aller').length === 1 && M.b.log.some(l => l.kind === 'moveorder' && /déplacement méthodique, puis tenir la position/.test(l.text)), { r: M.r, spam: M.spam });
  check('ordre de déplacement : refusé pour un mode inconnu ; un point dans un obstacle est ramené sur le sol libre', !mkA(2).command('aller', 0, { x: 30, z: 20, mode: 'vol' }).ok && (() => { const b = mkA(2), o = b.map.obstacles.find(q => q.w > 2 && q.d > 2), r = b.command('aller', 0, { x: o.x + o.w / 2, z: o.z + o.d / 2, mode: 'agressif' }); return r.ok && !b.map.insideObstacle(r.x, r.z); })());
  check('méthodique : bonds avec appui — une partie du groupe bouge pendant que l\'autre couvre (> 60 % du trajet), en surveillance', M.mixed > 0.6 && M.overwatch > 100, { mixed: M.mixed, overwatch: M.overwatch });
  check('méthodique : les guetteurs se partagent les secteurs (regards écartés de plus de 25°)', M.spread > 50, { spread: M.spread });
  check('agressif : tout le groupe arrive nettement plus vite qu\'en méthodique', A.all !== null && M.all !== null && A.all < M.all * 0.7, { agressif: A.all, methodique: M.all });
  check('arrivée « tenir » : arrivés, ils restent dans la position (à leur poste, ou ≤ 8 m de leur place pour un appui) et le disent (« En place. »)', M.held && A.held && A.b.log.some(l => l.kind === 'enplace' && /En place/.test(l.text)) && A.b.log.some(l => l.kind === 'enplace' && /tiennent la position/.test(l.text)), { m: M.held, a: A.held });
  check('arrivée « tenir » : l\'escouade se répartit autour du point (aucune paire à moins de 3 m)', M.gap >= 3 && A.gap >= 3, { methodique: M.gap, agressif: A.gap });
  // sous-groupe : seuls les opérateurs désignés obéissent ; rejouable à l'identique
  const s1 = mkA(9); while (s1.t < 2) s1.step();
  const rs = s1.command('aller', 0, { x: 30, z: 12, units: ['0:op_lynx', '0:op_granit'], mode: 'methodique', arrivee: 'tenir' });
  let others = 0; for (let i = 0; i < 20; i++) { s1.step(); others += s1.teams[0].units.filter(u => u.moveOrder && !['0:op_lynx', '0:op_granit'].includes(u.id)).length; }
  while (s1.t < 30) s1.step(); s1.command('aller', 0, { x: 40, z: 30, units: null, mode: 'agressif' }); s1.run();
  const s2 = mkA(9, { replayInputs: s1.inputs }); s2.run();
  check('ordre de déplacement : seuls les opérateurs désignés le reçoivent ; la bataille revue est identique', rs.ok && others === 0 && s1.inputs.filter(c => c.type === 'aller').length === 2 && JSON.stringify(s1.result.teams) === JSON.stringify(s2.result.teams) && s1.result.duration === s2.result.duration, { others });
  // arrivée « reprendre la manœuvre » : l'ordre s'efface à l'arrivée, l'escouade repart seule (sans retour en arrière)
  const runM = (seed, o) => {
    const b = mkA(seed, o); while (b.t < 1) b.step();
    const r = b.replayQueue ? { ok: true } : b.command('aller', 0, { x: 25, z: 23, units: null, mode: 'agressif', arrivee: 'manoeuvre' });
    const arr = {}, dirx = Math.sign(b.map.spawns[1].x - b.teams[0].spawn.x) || 1, trace = [];
    while (b.t < 40 && !b.over) {
      b.step();
      for (const u of b.teams[0].units) {
        if (!u.alive) continue;
        if (!u.moveOrder && b.t > 1.2 && !arr[u.id]) arr[u.id] = { t: b.t, x: u.x, moved: false, key: false, back: 0 };
        const a = arr[u.id]; if (!a || b.t > a.t + 5) continue;
        if (u.moving) a.moved = true; if (u.keyOrder || u.state === 'holdkey') a.key = true;
        a.back = Math.max(a.back, (a.x - u.x) * dirx);
      }
      if (Math.abs(b.t - Math.round(b.t)) < 0.05) trace.push(b.units.map(u => u.x.toFixed(2) + ',' + u.z.toFixed(2)).join(';'));
    }
    return { b, r, arr: Object.values(arr), trace: trace.join('|') };
  };
  const R1 = runM(4), R2 = runM(4, { replayInputs: R1.b.inputs });
  const rec = R1.b.inputs.filter(c => c.type === 'aller');
  check('arrivée « reprendre la manœuvre » : ordre accepté, enregistré (arrivee: manoeuvre) et journalisé', R1.r.ok && rec.length === 1 && rec[0].arg.arrivee === 'manoeuvre' && R1.b.log.some(l => l.kind === 'moveorder' && /puis reprendre la manœuvre/.test(l.text)) && R1.b.log.some(l => l.kind === 'reprise' && /reprennent la manœuvre/.test(l.text)), { r: R1.r, rec });
  check('arrivée « reprendre la manœuvre » : à l\'arrivée, plus d\'ordre (ni poste « tenir ») ; chacun repart seul dans les 5 s, sans revenir en arrière (≤ 3 m)', R1.arr.length === 5 && R1.arr.every(a => !a.key && a.moved && a.back <= 3) && R1.b.teams[0].units.every(u => !u.keyOrder), { arr: R1.arr });
  check('arrivée « reprendre la manœuvre » : la bataille revue est identique (positions seconde par seconde, résultat)', R1.trace === R2.trace && JSON.stringify(R1.b.result) === JSON.stringify(R2.b.result) && R2.b.inputs.length === R1.b.inputs.length);
}
console.log(`\n${pass}/${pass + fail} vérifications réussies` + (skip ? ` (${skip} mises de côté : fonctions désactivées)` : '')); process.exit(fail ? 1 : 0);
