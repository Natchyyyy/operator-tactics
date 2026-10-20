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
    // (exception : un blessé qu'un équipier tire à couvert — évacuation — suit son sauveteur)
    while (!b.over) { b.step(); for (const u of b.units) { if (u.alive) { delete pos[u.id]; continue; } if (!pos[u.id]) { pos[u.id] = { x: u.x, z: u.z }; downs++; } else if (b.draggedBy(u)) pos[u.id] = { x: u.x, z: u.z }; else if (Math.hypot(u.x - pos[u.id].x, u.z - pos[u.id].z) > 0.01) moved++; } }
  }
  check('à terre : un opérateur neutralisé ne se déplace plus jamais (de lui-même : seul un sauveteur peut le tirer à couvert)', downs > 20 && moved === 0, { downs, moved });
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
  // (seuil 45 % → 39 % le 19/10 : la flash de chaque opérateur GIGN — décision 6 —, lancée aussi par l'IA, fait bouger les
  // combats ; mesuré 0,40 à 0,43 contre 0,45 à 0,46 avant, sur 12 et 24 batailles ; à revoir lors de la grande passe d'équilibre)
  check('couvert : au contact, l\'opérateur est le plus souvent derrière un vrai couvert (> 39 % du temps)', contactCov / contact > 0.39, { r: contactCov / contact });
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
        if (u.moving || u.state === 'overwatch') a.moved = true; if (u.keyOrder || u.state === 'holdkey') a.key = true;
        a.back = Math.max(a.back, (a.x - u.x) * dirx);
      }
      if (Math.abs(b.t - Math.round(b.t)) < 0.05) trace.push(b.units.map(u => u.x.toFixed(2) + ',' + u.z.toFixed(2)).join(';'));
    }
    return { b, r, arr: Object.values(arr), trace: trace.join('|') };
  };
  const R1 = runM(4), R2 = runM(4, { replayInputs: R1.b.inputs });
  const rec = R1.b.inputs.filter(c => c.type === 'aller');
  check('arrivée « reprendre la manœuvre » : ordre accepté, enregistré (arrivee: manoeuvre) et journalisé', R1.r.ok && rec.length === 1 && rec[0].arg.arrivee === 'manoeuvre' && R1.b.log.some(l => l.kind === 'moveorder' && /puis reprendre la manœuvre/.test(l.text)) && R1.b.log.some(l => l.kind === 'reprise' && /reprennent la manœuvre/.test(l.text)), { r: R1.r, rec });
  check('arrivée « reprendre la manœuvre » : à l\'arrivée, plus d\'ordre (ni poste « tenir ») ; chacun reprend la manœuvre dans les 5 s (il avance, ou couvre le bond du Tiroir), sans revenir en arrière (≤ 3 m)', R1.arr.length === 5 && R1.arr.every(a => !a.key && a.moved && a.back <= 3) && R1.b.teams[0].units.every(u => !u.keyOrder), { arr: R1.arr });
  check('arrivée « reprendre la manœuvre » : la bataille revue est identique (positions seconde par seconde, résultat)', R1.trace === R2.trace && JSON.stringify(R1.b.result) === JSON.stringify(R2.b.result) && R2.b.inputs.length === R1.b.inputs.length);
  // déplacement « franchissement » : halte au bord du découvert, puis passages un par un (deux par deux à 4–5), sous appui
  const runF = (o) => {
    const b = mkA(4, o); while (b.t < 1) b.step();
    if (!b.replayQueue) b.command('aller', 0, { x: 25, z: 38, units: null, mode: 'franchir', arrivee: 'tenir' });
    const g = b.teams[0].moveGroups && b.teams[0].moveGroups[0], nCross = g && g.cross ? g.cross.length : 0;
    let maxC = 0, crossT = 0, all = null, halt = 0, trace = [];
    while (b.t < 100 && !b.over) {
      b.step();
      const A = b.teams[0].units.filter(u => u.alive), c = A.filter(u => u.state === 'crossing').length;
      maxC = Math.max(maxC, c); if (c) crossT += 0.1;
      if (c && A.filter(u => u.moveOrder && u.state !== 'crossing' && !u.moving).length >= 2) halt++;   // pendant qu'on passe, d'autres couvrent, arrêtés
      if (all === null && !A.some(u => u.moveOrder)) all = b.t;
      if (Math.abs(b.t - Math.round(b.t)) < 0.05) trace.push(b.units.map(u => u.x.toFixed(2) + ',' + u.z.toFixed(2)).join(';'));
      if (all !== null && b.t > all + 2) break;
    }
    return { b, nCross, maxC, crossT, all, halt, trace: trace.join('|') };
  };
  const F1 = runF(), F2 = runF({ replayInputs: F1.b.inputs });
  check('franchissement : découverts trouvés sur le trajet ; jamais plus de deux à traverser en même temps, les autres couvrent ; tout le monde passe et arrive', F1.nCross >= 1 && F1.maxC >= 1 && F1.maxC <= 2 && F1.crossT > 3 && F1.halt > 20 && F1.all !== null && F1.b.log.some(l => l.kind === 'franchir' && /tout le monde est passé/.test(l.text)), { nCross: F1.nCross, maxC: F1.maxC, crossT: F1.crossT, halt: F1.halt, all: F1.all });
  check('franchissement : la bataille revue est identique', F1.trace === F2.trace && F1.all === F2.all);
  // arrivée « encercler » : deux sous-groupes de deux côtés du point (≥ 60° autour de lui), face à lui ; à deux : « tenir »
  const runE = (units) => {
    const b = mkA(4); while (b.t < 1) b.step();
    const r = b.command('aller', 0, { x: 35, z: 23, units, mode: 'methodique', arrivee: 'encercler' });
    let all = null; while (b.t < 80 && !b.over) { b.step(); if (all === null && !b.teams[0].units.some(u => u.alive && u.moveOrder)) all = b.t; if (all !== null && b.t > all + 3) break; }
    const gs = {}; for (const u of b.teams[0].units) if (u.alive && u.keyOrder) (gs[u.keyOrder.ordre] = gs[u.keyOrder.ordre] || []).push(u);
    const ang = Object.values(gs).map(us => Math.atan2(us.reduce((s, u) => s + u.z, 0) / us.length - r.z, us.reduce((s, u) => s + u.x, 0) / us.length - r.x));
    let sep = ang.length === 2 ? Math.abs(ang[0] - ang[1]) % (2 * Math.PI) : 0; if (sep > Math.PI) sep = 2 * Math.PI - sep;
    return { b, r, all, groups: Object.keys(gs).length, sizes: Object.values(gs).map(us => us.length), sep: sep * 180 / Math.PI };
  };
  const E = runE(null), E2 = runE(['0:op_lynx', '0:op_granit']);
  check('encercler : deux sous-groupes arrivés de deux côtés du point, à plus de 60° (et moins de 140°) l\'un de l\'autre, qui le tiennent', E.r.ok && E.all !== null && E.groups === 2 && E.sep >= 60 && E.sep <= 140 && E.b.teams[0].units.filter(u => u.alive && u.keyOrder).every(u => u.keyOrder.enc) && E.b.log.some(l => /de deux côtés/.test(l.text)), { all: E.all, groups: E.groups, sizes: E.sizes, sep: E.sep });
  check('encercler : à deux opérateurs, retombe sur « tenir la position »', E2.r.ok && E2.groups === 1 && E2.b.log.some(l => l.kind === 'moveorder' && /\(à 2, tenir la position\)/.test(l.text)), { groups: E2.groups });
}
{
  // ---- Évacuation du blessé : un équipier tire un camarade à terre, à découvert, jusqu'au couvert, puis le relève ----
  // Scénario : un blessé (saignement) en terrain découvert, vu d'un ennemi à ~20 m ; le sauveteur à 3 m ; les autres loin.
  const setup = () => {
    const b = mk(11); const A = b.teams[0].units, E = b.teams[1].units;
    let sc = null;
    // (balayage depuis l'allée sud : la ruelle nord est fermée et n'offre plus 20 m de vue dégagée en ligne droite)
    for (let x = 12; x < 34 && !sc; x += 1) for (let z = 34; z < 42 && !sc; z += 1) {
      if (b.map.insideObstacle(x, z) || b.map.insideObstacle(x - 3, z) || b.map.insideObstacle(x + 20, z) || !b.map.inBounds(x + 20, z)) continue;
      if (!b.map.hasLOS(x + 20, 1.6, z, x, 0.9, z) || !b.map.walkableSegment(x - 3, z, x, z)) continue;
      const c = b.dragCover(A[0], { x, z }, [{ x: x + 20, z }]);
      if (c && Math.hypot(c.x - x, c.z - z) > 2.5 && b.map.hasLOS(x + 20, 1.6, z, x - 3, 1.25, z)) sc = { x, z, c };
    }
    const [u, a] = A, e = E[0];
    a.x = sc.x; a.z = sc.z; a.alive = false; a.hp = 0; a.status = 'down'; a.downAt = -5; a.bleedUntil = 30;
    u.x = sc.x - 3; u.z = sc.z; u.hp = u.maxHp = 1e6;
    for (const o of A.slice(2)) { o.x = 3; o.z = 23; }
    e.x = sc.x + 20; e.z = sc.z; e.hp = e.maxHp = 1e6; e.weapon = Object.assign({}, e.weapon, { accuracy: 0 });
    for (const o of E.slice(1)) { o.x = 69; o.z = 23; }
    b.teams[1].order = 'hold';
    return { b, u, a, e, sc };
  };
  const run = () => {
    const S = setup(), { b, u, a, sc } = S; const sp = []; let prev = null, revivedAt = null, pullPos = [];
    const walk = (() => { const st = u.state; u.state = 'idle'; const v = u.speed(); u.state = st; return v; })();
    while (b.t < 40 && !b.over) {
      b.step();
      if (u.drag && u.drag.phase === 'pull' && u.state === 'dragging' && u.moving && prev) { sp.push(Math.hypot(u.x - prev.x, u.z - prev.z) / OT.DT); pullPos.push(Math.round(a.x * 100) + ',' + Math.round(a.z * 100)); }
      prev = { x: u.x, z: u.z };
      if (a.alive && revivedAt === null) { revivedAt = b.t; break; }
    }
    return { S, sp, walk, revivedAt, moved: Math.hypot(a.x - sc.x, a.z - sc.z), hidden: !b.map.hasLOS(sc.x + 20, 1.6, sc.z, a.x, 0.5, a.z), trace: pullPos.join(';') + '|' + b.log.map(l => l.text).join('\n') };
  };
  const R = run(), mean = R.sp.length ? R.sp.reduce((s, v) => s + v, 0) / R.sp.length : 0;
  const log = R.S.b.log;
  check('évacuation : un blessé à découvert est tiré jusqu\'au couvert (« Je le tire à couvert ! »), posé à l\'abri des vues, puis relevé',
    log.some(l => l.kind === 'drag' && /Je le tire à couvert/.test(l.text)) && R.moved > 1.5 && R.hidden && R.revivedAt !== null && log.some(l => l.kind === 'revive_start' && /à l'abri/.test(l.text)),
    { moved: R.moved, hidden: R.hidden, revivedAt: R.revivedAt });
  check('évacuation : le sauveteur recule plus lentement qu\'il ne marche (55–65 % de son allure), le corps à ~1 m devant lui',
    R.sp.length > 5 && mean > R.walk * 0.5 && mean < R.walk * 0.66, { mean, walk: R.walk, n: R.sp.length });
  check('évacuation : la bataille revue est identique (positions du corps tiré, journal)', R.trace === run().trace);
  // fumigène : bloque la vue (repérage, tir visé) pendant sa durée, puis se dissipe
  const b = mk(12); b.map.obstacles = []; const [u] = b.teams[0].units, [e] = b.teams[1].units;
  u.x = 10; u.z = 20; e.x = 30; e.z = 20;
  const G = OT.DATA.GRENADES.smoke;
  b.grenadesInFlight = [{ kind: 'smoke', team: 0, thrower: u, from: { x: 10, z: 20 }, x: 20, z: 20, landAt: b.t, explodeAt: b.t + 0.05, landed: false }];
  const before = b.canSee(u, e) && b.canSee(e, u);
  for (const x of b.units) if (x !== u && x !== e) { x.x = 60; x.z = x.team ? 3 : 43; }
  b.updateGrenades(); b.t += 0.1; b.updateGrenades();
  const during = b.map.dynamic.length === 1 && !b.canSee(u, e) && !b.canSee(e, u), until = b.map.dynamic[0] && b.map.dynamic[0].until;
  const ev = b.drainEvents ? b.drainEvents().some(x => x.type === 'smoke') : true;
  // (le temps passe : expiration des fumées comme à chaque pas, updateTactics)
  let lasted = true; while (b.t < until - 0.2) { b.t = Math.round((b.t + 0.1) * 1000) / 1000; b.updateTactics(); if (b.canSee(u, e)) lasted = false; }
  while (b.t < until + 0.5) { b.t = Math.round((b.t + 0.1) * 1000) / 1000; b.updateTactics(); }
  check('fumigène : bloque la ligne de vue dans les deux sens pendant ' + G.duration + ' s, puis se dissipe', before && during && ev && lasted && b.map.dynamic.length === 0 && b.canSee(u, e), { before, during, ev, lasted, left: b.map.dynamic.length });
  // bataille complète (graine où l'on évacue et où l'on lance des fumigènes) jouée deux fois : identique
  const full = () => { const x = new Battle({ seed: 2, mapId: 'parking' }); x.run(); return x; }, F1 = full(), F2 = full();   // (graine 2 depuis la fermeture de la ruelle : la graine 1 n'a plus de fumigène)
  const nd = F1.log.filter(l => l.kind === 'drag').length, ns = F1.log.filter(l => l.kind === 'smoke').length;
  check('évacuation et fumigène en bataille : ils ont lieu, et la bataille revue est identique (journal, résultat)', nd >= 1 && ns >= 1 && JSON.stringify(F1.log) === JSON.stringify(F2.log) && JSON.stringify(F1.result) === JSON.stringify(F2.result), { nd, ns });
}
{
  // ---- Vague 1 des stratégies GIGN : feu retenu, appui, décrocher, orienter, relève dans les bonds, rejouabilité ----
  const mkW = (seed, bo, ao) => new Battle({ seed, mapId: 'parking', teams: [{ name: 'Alpha', order: ao || 'assault', operators: GIGN, tactics: ['tiroir'] }, { name: 'Bravo', order: bo || 'assault', operators: KARST, tactics: ['tiroir'] }] });
  // F1 — Retenu : pas un coup (ni une grenade) avant le déclenchement ; déclenché seulement repéré, pris à partie ou ennemi tout près
  let heldShots = 0, releases = 0, badWhy = 0, afterShots = 0, orders = 0;
  for (let sd = 1; sd <= 4; sd++) {
    const b = mkW(sd); while (b.t < 1) b.step();
    const r = b.command('aller', 0, { x: 22, z: 23, units: null, mode: 'agressif', arrivee: 'tenir', feu: 'retenu' }); if (r.ok) orders++;
    const inf = b.teams[0].ordInfo[r.id];
    const sh = b.shoot.bind(b), sa = b.suppressAt.bind(b), gr = b.tryGrenade.bind(b);
    const mine = (u) => { const o = b.orderOf(u); return o && o.id === r.id; };
    b.shoot = function (u, e, d) { if (u.team === 0 && mine(u)) { if (!inf.released) heldShots++; else afterShots++; } return sh(u, e, d); };
    b.suppressAt = function (u, e) { if (u.team === 0 && mine(u) && !inf.released) heldShots++; return sa(u, e); };
    b.tryGrenade = function (u) { const t = gr(u); if (t && u.team === 0 && mine(u) && !inf.released) heldShots++; return t; };
    while (!b.over && b.t < 90) b.step();
    const rl = b.log.filter(l => l.kind === 'feu'); releases += rl.length; badWhy += rl.filter(l => !['repérés', 'pris à partie', 'ennemi tout près'].includes(l.why)).length;
  }
  check('feu retenu : aucun tir ni grenade du groupe avant le déclenchement ; déclenché (repéré, pris à partie, ennemi tout près) puis le groupe tire', orders === 4 && heldShots === 0 && releases >= 3 && badWhy === 0 && afterShots > 50, { heldShots, releases, badWhy, afterShots });
  { const b = mkW(2, 'hold'); while (b.t < 1) b.step();
    const r = b.command('aller', 0, { x: 14, z: 23, units: ['0:op_lynx', '0:op_granit'], mode: 'methodique', feu: 'retenu' });
    for (let i = 0; i < 30; i++) b.step();
    const held = b.teams[0].units.filter(u => u.holdFire).map(u => u.callsign).sort().join(), rf = b.command('feu', 0, { units: ['0:op_lynx'] }), again = b.command('feu', 0, { units: null });
    for (let i = 0; i < 5; i++) b.step();
    check('feu retenu : seuls les opérateurs de l\'ordre retiennent leur feu ; command(\'feu\') le lève pour tout le groupe (une fois) ; le feu revient « à volonté » au prochain ordre', r.ok && held === 'Granit,Lynx' && rf.ok && !again.ok && b.teams[0].units.every(u => !u.holdFire) && b.log.some(l => l.kind === 'feu' && /ordre d’ouvrir le feu/.test(l.text)) && b.teams[0].ordInfo[r.id].released, { held, rf, again }); }
  // F2 — Appui : au premier contact, deux opérateurs d'assaut en appui (orientés vers le contact), trois encerclent
  // (16 batailles, seuil 80 coups = 5 par bataille comme avant : d'une graine à l'autre le tir d'appui va de 0 à 100 coups ;
  // depuis la fermeture de la ruelle les premiers contacts changent et 8 graines ne lissaient plus le hasard — 32 coups sur
  // les graines 1–8, 190 sur 1–16 ; avant : 206 et 327)
  let supShots = 0, supBy = new Set(), lowAmmo = 0, pinnedT = 0, zoneSeen = 0;
  for (let sd = 1; sd <= 16; sd++) {
    const b = mkW(sd, 'careful', 'careful'); let done = false, id = null;
    const sa = b.suppressAt.bind(b); b.suppressAt = function (u, e) { if (u.team === 0) { supShots++; supBy.add(u.role.id + ':' + u.callsign); if (u.totalAmmo() < u.weapon.mag * (u.weapon.kit + 1) * 0.4 - 1) lowAmmo++; } return sa(u, e); };
    while (!b.over && b.t < 150) {
      b.step();
      if (id !== null) { const inf = b.teams[0].ordInfo[id]; if (inf.zone && inf.zone.x !== null) zoneSeen++; for (const e of b.teams[1].units) if (e.alive && e.suppression > 0.5) pinnedT += 0.1; }
      if (done) continue;
      const A = b.teams[0].units.filter(u => u.alive), kn = b.teamKnownEnemies(b.teams[0]).filter(k => b.t - k.t < 1);
      if (!kn.length || b.t < 3) continue; done = true;
      const k = kn[0], so = A.slice().sort((p, q) => Math.hypot(p.x - k.x, p.z - k.z) - Math.hypot(q.x - k.x, q.z - k.z)), sup = so.slice(0, 2);
      const r = b.command('aller', 0, { x: sup.reduce((s, u) => s + u.x, 0) / 2, z: sup.reduce((s, u) => s + u.z, 0) / 2, units: sup.map(u => u.id), mode: 'methodique', arrivee: 'tenir', feu: 'appui' });
      if (r.ok) { id = r.id; b.command('orienter', 0, { ordre: r.id, x: k.x, z: k.z }); }
      b.command('aller', 0, { x: k.x, z: k.z, units: so.slice(2).map(u => u.id), mode: 'methodique', arrivee: 'encercler' });
    }
  }
  check('appui : des opérateurs d\'assaut (pas le rôle Appui) font du tir de suppression sur la zone ; une zone est suivie ; jamais sous 40 % de munitions', supShots > 80 && [...supBy].every(s => s.startsWith('assault')) && zoneSeen > 100 && lowAmmo === 0, { supShots, supBy: [...supBy], zoneSeen, lowAmmo, pinnedT });
  // D4 — Décrocher : l'escouade, avancée au contact, se replie par bonds : une moitié tire (arrêtée), l'autre court sans tirer
  const runD = (mode, seed) => {
    const b = mkW(seed), us = b.teams[0].units;
    us.forEach((u, i) => { const f = b.map.nearestFree(40, 15 + i * 4), c = b.map.centerOf(f.c, f.r); u.x = c.x; u.z = c.z; });
    while (b.t < 6) b.step();
    const x0 = us.reduce((s, u) => s + u.x, 0) / 5, r = b.command('aller', 0, { x: 10, z: 23, units: null, mode, arrivee: 'tenir' });
    let mixed = 0, n = 0, runShots = 0, coverShots = 0, all = null, runT = 0;
    const sh = b.shoot.bind(b); b.shoot = function (u, e, d) { if (u.team === 0 && u.moveOrder) { if (u.state === 'retreat') runShots++; else coverShots++; } return sh(u, e, d); };
    while (!b.over && b.t < 100) {
      b.step(); const ord = us.filter(u => u.alive && u.moveOrder);
      if (ord.length >= 2) { n++; const m = ord.filter(u => u.moving).length; if (m > 0 && m < ord.length) mixed++; }
      runT += ord.filter(u => u.state === 'retreat' && u.moving).length * 0.1;
      if (all === null && !ord.length) all = b.t - 6;
      if (all !== null) break;
    }
    const x1 = us.filter(u => u.alive).reduce((s, u, i, a) => s + u.x / a.length, 0);
    return { r, mixed: n ? mixed / n : 0, runShots, coverShots, all, back: x0 - x1, runT, lost: us.filter(u => !u.alive).length };
  };
  const D = [1, 2, 3].map(s => runD('decrocher', s)), Mt = [1, 2, 3].map(s => runD('methodique', s));
  const sum = (a, k) => a.reduce((s, x) => s + (x[k] || 0), 0);
  check('décrocher : repli par bonds — une moitié bouge pendant que l\'autre couvre (> 50 % du trajet), ceux qui courent ne tirent pas, ceux qui couvrent tirent ; recul de plus de 20 m ; plus rapide que « méthodique » vers le même point',
    D.every(d => d.r.ok && d.all !== null && d.back > 20 && d.mixed > 0.5) && sum(D, 'runShots') === 0 && sum(D, 'coverShots') > 0 && sum(D, 'runT') > 10 && sum(D, 'all') < sum(Mt, 'all'), { D: D.map(d => ({ all: d.all, back: d.back, mixed: d.mixed, run: d.runShots, cov: d.coverShots, lost: d.lost })), M: Mt.map(d => d.all) });
  // A4 — Orienter : tenir orienté au nord → plan de secteurs face au nord ; encercler orienté → les deux sous-groupes du côté opposé
  { const b = mkW(3, 'hold'); while (b.t < 1) b.step();
    const r = b.command('aller', 0, { x: 12, z: 23, units: ['0:op_lynx', '0:op_granit', '0:op_bastion'], mode: 'agressif', arrivee: 'tenir' });   // (point montré : dans la ruelle, z 5 — z 8 est maintenant dans le garage qui ferme la ruelle, ramené à la case libre la plus proche)
    const ro = b.command('orienter', 0, { ordre: r.id, x: 12, z: 5 }), near = b.command('orienter', 0, { ordre: r.id, x: 12.5, z: 23 });
    while (b.t < 25) b.step();
    const ms = b.teams[0].units.filter(u => u.alive && u.keyOrder && u.keyOrder.grp === r.id), pl = b.teams[0].holdPlans && b.teams[0].holdPlans[r.id];
    const ad = (a, c) => { let d = Math.abs(a - c) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d; };
    // (au contact, la règle existante l'emporte : les secteurs se resserrent face à l'ennemi réellement connu)
    check('orienter (tenir) : l\'orientation est enregistrée ; arrivés, chacun garde la direction montrée comme base, un secteur la tient, et hors contact le plan de secteurs part d\'elle (± 5°) ; un clic sur le point est refusé', ro.ok && !near.ok && ms.length === 3 && pl && ms.every(u => ad(u.keyOrder.face0, -Math.PI / 2) < 1e-6) && ms.some(u => ad(u.keyOrder.sect, -Math.PI / 2) < 0.6) && (pl.contact || ad(pl.face, -Math.PI / 2) < 0.09) && b.log.some(l => l.kind === 'orienter' && /vers le nord/.test(l.text)), { ro, near, face: pl && pl.face, contact: pl && pl.contact, n: ms.length });
    const e = mkW(3, 'hold'); while (e.t < 1) e.step();
    const re = e.command('aller', 0, { x: 22, z: 23, units: null, mode: 'agressif', arrivee: 'encercler' }); e.command('orienter', 0, { ordre: re.id, x: 22, z: 40 });   // danger au sud
    while (e.t < 40 && e.teams[0].units.some(u => u.alive && u.moveOrder)) e.step();
    const gs = {}; for (const u of e.teams[0].units) if (u.alive && u.keyOrder && u.keyOrder.enc) (gs[u.keyOrder.ordre] = gs[u.keyOrder.ordre] || []).push(u);
    const north = Object.values(gs).map(g => g.reduce((s, u) => s + u.z, 0) / g.length < re.z);
    check('orienter (encercler) : les deux sous-groupes se placent du côté opposé au danger montré (au nord du point, danger au sud)', Object.keys(gs).length === 2 && north.every(Boolean), { n: Object.keys(gs).length, north }); }
  // R3 — relève : deux tombés dans la même moitié du Tiroir → moitiés rééquilibrées (écart ≤ 1), « Je prends sa place ! »
  { const b = mkW(5); while (b.t < 3) b.step();
    const h1 = b.teams[0].units.filter(u => u.boundGroup === 1); h1.slice(0, 2).forEach(u => { u.alive = false; u.hp = 0; u.status = 'down'; });
    b.step(); const g = (k) => b.teams[0].units.filter(u => u.alive && u.boundGroup === k).length;
    check('relève : toute une moitié du Tiroir tombe (3 + 2 → 3 + 0) → les moitiés sont refaites (écart ≤ 1) et le remplaçant le dit', Math.abs(g(0) - g(1)) <= 1 && g(0) >= 1 && g(1) >= 1 && b.log.some(l => l.kind === 'releve'), { g0: g(0), g1: g(1) });
    const c = mkW(5, 'hold'); while (c.t < 1) c.step();
    const r = c.command('aller', 0, { x: 30, z: 23, units: null, mode: 'methodique' }); c.step();
    c.teams[0].units.filter(u => u.moveOrder.half === 1).forEach(u => { u.alive = false; u.hp = 0; });
    c.step(); const hs = c.teams[0].units.filter(u => u.alive).map(u => u.moveOrder && u.moveOrder.half);
    check('relève : un ordre « méthodique » dont une moitié tombe se repartage en deux moitiés', r.ok && hs.includes(0) && hs.includes(1), hs); }
  // rejouabilité : tous les nouveaux ordres (retenu, feu, orienter, appui, décrocher) → bataille revue identique
  { const play = (o) => {
      const b = new Battle(Object.assign({ seed: 7, mapId: 'parking', teams: [{ name: 'Alpha', order: 'assault', operators: GIGN, tactics: ['tiroir'] }, { name: 'Bravo', order: 'assault', operators: KARST, tactics: ['tiroir'] }] }, o || {}));
      const trace = [];
      while (!b.over && b.t < 200) {
        if (!b.replayQueue) {
          if (Math.abs(b.t - 1) < 0.05) { const r = b.command('aller', 0, { x: 24, z: 20, units: ['0:op_lynx', '0:op_granit'], mode: 'methodique', arrivee: 'tenir', feu: 'appui' }); b.command('orienter', 0, { ordre: r.id, x: 44, z: 23 }); b.command('aller', 0, { x: 22, z: 34, units: ['0:op_vautour', '0:op_bastion', '0:op_belier'], mode: 'agressif', arrivee: 'tenir', feu: 'retenu' }); }
          if (Math.abs(b.t - 20) < 0.05) b.command('feu', 0, { units: null });
          if (Math.abs(b.t - 30) < 0.05) b.command('aller', 0, { x: 10, z: 23, units: null, mode: 'decrocher', arrivee: 'encercler' });
        }
        b.step(); if (b.tick % 10 === 0) trace.push(b.units.map(u => u.x.toFixed(2) + ',' + u.z.toFixed(2) + ',' + u.state).join(';'));
      }
      return { b, trace: trace.join('|') };
    };
    const P1 = play(), P2 = play({ replayInputs: P1.b.inputs });
    const types = P1.b.inputs.map(c => c.type).join();
    check('vague 1 : la bataille revue (aller + feu + orienter, appui, retenu, décrocher) est identique, pas à pas', types.split(',').filter(t => t === 'aller').length === 3 && types.includes('orienter') && P1.trace === P2.trace && JSON.stringify(P1.b.result) === JSON.stringify(P2.b.result), { types }); }
}
// ---- Vague 2 des stratégies GIGN : grenades sur ordre, fumée, points de passage, fouiller, relève en Tenir ----
{
  const mkV = (seed, bo, ao) => new Battle({ seed, mapId: 'parking', teams: [{ name: 'Alpha', order: ao || 'hold', operators: GIGN, tactics: ['tiroir'] }, { name: 'Bravo', order: bo || 'hold', operators: KARST, tactics: ['tiroir'] }] });
  // E1 / E2 : dotation et grenade sur ordre
  { const b = mkV(7); while (b.t < 1) b.step();
    check('grenades : chaque opérateur du joueur a 1 frag, 1 incapacitante et 1 fumigène ; l\'adversaire n\'a pas d\'incapacitante', b.teams[0].units.every(u => u.grenades.frag === 1 && u.grenades.flash === 1 && u.grenades.smoke === 1) && b.teams[1].units.every(u => !u.grenades.flash), b.teams[0].units.map(u => u.grenades));
    const near = (k, x, z) => b.teams[0].units.filter(u => (u.grenades[k] || 0) > 0 && !u.throwing).map(u => ({ u, d: Math.hypot(u.x - x, u.z - z) })).filter(o => o.d >= 8 && o.d <= 24 && b.map.hasLOS(o.u.x, 2.3, o.u.z, x, 1.4, z)).sort((a, c) => a.d - c.d)[0];
    const exp = near('flash', 18, 23), r = b.command('grenade', 0, { x: 18, z: 23, kind: 'flash', units: null });
    const far = b.command('grenade', 0, { x: 66, z: 23, kind: 'frag', units: null }), bad = b.command('grenade', 0, { x: 18, z: 23, kind: 'mortier', units: null });
    const ally = b.teams[0].units[0], fr = b.command('grenade', 0, { x: ally.x + 1, z: ally.z, kind: 'frag', units: null });
    const thrower = b.unitById(r.unit); let t0 = b.t; while (b.t < t0 + 3) b.step();
    check('grenade sur ordre : le plus proche des désignés qui a une incapacitante et est à portée la lance au point ; trop loin, inconnue ou frag près d\'un équipier : refusé avec la raison', r.ok && exp && r.unit === exp.u.id && thrower.grenades.flash === 0 && b.log.some(l => l.kind === 'grenade' && l.gk === 'flash' && l.unit === r.unit) && !far.ok && /trop loin/.test(far.reason) && !bad.ok && !fr.ok && /équipier/.test(fr.reason), { r, far, fr });
    const one = b.command('grenade', 0, { x: 18, z: 23, kind: 'flash', units: [r.unit] });
    check('grenade sur ordre : pas de grenade illimitée (« plus de … » quand le désigné n\'en a plus)', !one.ok && /plus d/.test(one.reason), one); }
  // E3 : « avec fumée » — Franchir : un fumigène côté danger au bord du découvert, on ne passe qu'une fois le nuage en place
  // (le lanceur en dernier) ; Décrocher : un fumigène tout de suite entre le groupe et le danger ; sans fumigène : ordre sans fumée
  { const b = new Battle({ seed: 4, mapId: 'parking', teams: [{ name: 'Alpha', order: 'assault', operators: GIGN, tactics: ['tiroir'] }, { name: 'Bravo', order: 'hold', operators: KARST, tactics: ['tiroir'] }] }); while (b.t < 1) b.step();
    const r = b.command('aller', 0, { x: 25, z: 38, units: null, mode: 'franchir', arrivee: 'tenir', fumee: true });
    while (b.t < 40 && !b.over && !b.log.some(l => l.kind === 'franchir' && /tout le monde/.test(l.text))) b.step();
    const sm = b.log.find(l => l.kind === 'smoke' && l.team === 0), go = b.log.find(l => l.kind === 'bond' && /Je passe/.test(l.text));
    const pass = b.log.filter(l => l.kind === 'bond' && /Je passe/.test(l.text)), last = pass.length && pass[pass.length - 1].unit;
    check('avec fumée (franchir) : au bord, un fumigène est lancé avant le premier passage ; le lanceur passe en dernier', r.ok && r.fumee === true && sm && go && sm.t <= go.t && go.t - sm.t >= 1 && last === sm.unit && b.log.some(l => l.kind === 'moveorder' && /avec fumée/.test(l.text)), { sm: sm && sm.t, go: go && go.t, last, thrower: sm && sm.unit }); }
  { const b = mkV(4, 'hold', 'assault'); while (b.t < 1) b.step(); b.command('aller', 0, { x: 20, z: 23, units: null, mode: 'agressif' }); while (b.t < 10) b.step();
    const r = b.command('aller', 0, { x: 3, z: 23, units: null, mode: 'decrocher', arrivee: 'tenir', fumee: true }); while (b.t < 12) b.step();
    const sm = b.log.find(l => l.kind === 'smoke' && l.team === 0);
    b.teams[0].units.forEach(u => { u.grenades.smoke = 0; }); b.teams[0].units.forEach(u => { u.orderAt = -99; });
    const r2 = b.command('aller', 0, { x: 5, z: 23, units: null, mode: 'decrocher', fumee: true });
    check('avec fumée (décrocher) : un fumigène part tout de suite (< 1,5 s) ; plus aucun fumigène : l\'ordre passe, sans fumée', r.ok && r.fumee === true && sm && sm.t - 10 < 1.5 && r2.ok && r2.fumee === false, { r, sm: sm && sm.t, r2 }); }
  // D7 : points de passage — le groupe passe par chaque étape (sa place à l'étape, à 2,2 m près) avant d'aller au point
  { const b = mkV(5); while (b.t < 1) b.step();
    const bad = b.command('aller', 0, { x: 22, z: 23, units: null, mode: 'agressif', via: [{ x: 'nord', z: 6 }] });
    const r = b.command('aller', 0, { x: 22, z: 23, units: null, mode: 'agressif', arrivee: 'tenir', via: [{ x: 14, z: 6 }, { x: 24, z: 8 }, { x: 40, z: 40 }] });
    const vis = {}, minZ = {}; let all = null;
    while (b.t < 60 && !b.over && all === null) { b.step(); for (const u of b.teams[0].units) { minZ[u.id] = Math.min(minZ[u.id] || 99, u.z); if (u.moveOrder && u.moveOrder.via) vis[u.id] = Math.max(vis[u.id] || 0, u.moveOrder.vi); } if (b.teams[0].units.every(u => !u.alive || !u.moveOrder)) all = b.t; }
    const inf = b.teams[0].ordInfo[r.id];
    check('points de passage : 2 au plus (le 3e est ignoré) ; chacun passe par les deux étapes dans l\'ordre (par le nord), puis tient le point ; un point de passage invalide est refusé', !bad.ok && r.ok && inf.via.length === 2 && inf.viaDone === 2 && all !== null && b.teams[0].units.every(u => !u.alive || (vis[u.id] === 2 && minZ[u.id] < 9 && u.keyOrder)) && b.log.some(l => l.kind === 'passage') && b.log.some(l => l.kind === 'moveorder'), { bad, vis, minZ, all, viaDone: inf.viaDone }); }
  // A5 : fouiller — arrivés, ils vont voir derrière les couverts autour du point (places partagées, à 12 m au plus), puis tiennent
  { const b = mkV(5); while (b.t < 1) b.step();
    const r = b.command('aller', 0, { x: 20, z: 23, units: null, mode: 'agressif', arrivee: 'fouiller' });
    let srch = 0, bonds = 0; const nb = () => b.log.filter(l => l.kind === 'bond').length; const b0 = nb();
    while (b.t < 60 && !b.over && (b.t < 2 || b.teams[0].units.some(u => u.alive && u.moveOrder))) { b.step(); srch += b.teams[0].units.filter(u => u.state === 'search').length; }
    bonds = nb() - b0;
    const inf = b.teams[0].ordInfo[r.id], fx = inf.fx || [];
    check('fouiller : des places à voir derrière les couverts à 12 m au plus du point, visitées (réparties entre plusieurs) ; puis chacun tient (poste), sans bonds', r.ok && fx.length >= 3 && fx.every(f => Math.hypot(f.x - 20, f.z - 23) <= 12.5) && fx.filter(f => f.seen).length >= 3 && new Set(fx.map(f => f.by).filter(Boolean)).size >= 2 && srch > 20 && b.teams[0].units.every(u => !u.alive || (u.keyOrder && !u.moveOrder)) && bonds === 0, { n: fx.length, seen: fx.filter(f => f.seen).length, by: [...new Set(fx.map(f => f.by))], srch, bonds }); }
  // R2 (version sans animation) : en Tenir, un équipier tombé dans la position est relevé quand rien n'est vu depuis 5 s ;
  // pas tant qu'un équipier de l'ordre voit l'ennemi ; le sauveteur retourne ensuite à son poste
  { const run = (busy) => { const b = mkV(5); while (b.t < 1) b.step();
      const r = b.command('aller', 0, { x: 14, z: 23, units: null, mode: 'agressif', arrivee: 'tenir' });
      while (b.t < 25 && b.teams[0].units.some(u => u.moveOrder)) b.step();
      const a = b.teams[0].units[1]; a.alive = false; a.hp = 0; a.status = 'down'; a.downAt = b.t; a.bleedUntil = b.t + 20; a.rescue = null; b.stop(a);
      const t0 = b.t, ms = b.teams[0].units.filter(u => u.alive);
      while (b.t < t0 + 19 && !a.alive) { if (busy && b.t < t0 + 5) ms[0].sawEnemyAt = b.t; b.step(); }
      return { r, up: a.alive, at: b.t - t0, keep: ms.every(u => u.keyOrder), rev: b.log.find(l => l.kind === 'revive') }; };
    const A = run(false), B = run(true);
    check('relève en Tenir : un équipier tombé dans la position est relevé au calme (le sauveteur garde son poste) ; pas tant qu\'un équipier de l\'ordre voit l\'ennemi', A.r.ok && A.up && A.keep && A.rev && B.up && B.at > 5 + 5, { A: { up: A.up, at: A.at, keep: A.keep }, B: { up: B.up, at: B.at } }); }
  // rejouabilité : grenades sur ordre, avec fumée, points de passage, fouiller → bataille revue identique, pas à pas
  { const play = (o) => {
      const b = new Battle(Object.assign({ seed: 11, mapId: 'parking', teams: [{ name: 'Alpha', order: 'assault', operators: GIGN, tactics: ['tiroir'] }, { name: 'Bravo', order: 'assault', operators: KARST, tactics: ['tiroir'] }] }, o || {}));
      const trace = [];
      while (!b.over && b.t < 160) {
        if (!b.replayQueue) {
          if (Math.abs(b.t - 1) < 0.05) { b.command('aller', 0, { x: 22, z: 23, units: ['0:op_lynx', '0:op_granit'], mode: 'agressif', arrivee: 'fouiller', via: [{ x: 14, z: 8 }] }); b.command('aller', 0, { x: 25, z: 38, units: ['0:op_vautour', '0:op_bastion', '0:op_belier'], mode: 'franchir', arrivee: 'tenir', fumee: true }); }
          if (Math.abs(b.t - 6) < 0.05) { b.command('grenade', 0, { x: 24, z: 23, kind: 'smoke', units: null }); b.command('grenade', 0, { x: 26, z: 20, kind: 'flash', units: null }); }
          if (Math.abs(b.t - 25) < 0.05) b.command('grenade', 0, { x: 34, z: 23, kind: 'frag', units: null });
          if (Math.abs(b.t - 40) < 0.05) b.command('aller', 0, { x: 8, z: 23, units: null, mode: 'decrocher', arrivee: 'tenir', fumee: true });
        }
        b.step(); if (b.tick % 10 === 0) trace.push(b.units.map(u => u.x.toFixed(2) + ',' + u.z.toFixed(2) + ',' + u.state).join(';'));
      }
      return { b, trace: trace.join('|') };
    };
    const P1 = play(), P2 = play({ replayInputs: P1.b.inputs }), types = P1.b.inputs.map(c => c.type);
    check('vague 2 : la bataille revue (grenades sur ordre, avec fumée, points de passage, fouiller, décrocher) est identique, pas à pas', types.filter(t => t === 'grenade').length >= 2 && types.filter(t => t === 'aller').length === 3 && P1.trace === P2.trace && JSON.stringify(P1.b.result) === JSON.stringify(P2.b.result), { types: types.join() }); }
}
// ---- Vague 2 (partie B) : plans du Groupe Karst (adversaire de l'IA, team.auto) ----
{ const mkK = (seed, o) => new Battle(Object.assign({ seed, mapId: 'parking', teams: [{ name: 'Alpha', order: 'assault', operators: GIGN, tactics: ['tiroir'] }, { name: 'Bravo', order: 'assault', operators: KARST, tactics: ['tiroir'], autoTactics: true }] }, o || {}));
  const plans = {}, firstSeed = {};
  for (let sd = 1; sd <= 30; sd++) { const b = mkK(sd); plans[b.teams[1].karst.plan] = (plans[b.teams[1].karst.plan] || 0) + 1; if (firstSeed[b.teams[1].karst.plan] === undefined) firstSeed[b.teams[1].karst.plan] = sd; }
  const same = mkK(7).teams[1].karst.plan === mkK(7).teams[1].karst.plan, b0 = mkK(7);
  check('plans Karst : un plan par bataille, tiré à la graine (même graine → même plan), les trois existent ; jamais pour l\'escouade du joueur', same && plans.repli > 0 && plans.contourner > 0 && plans.embuscade > 0 && !b0.teams[0].karst, plans);
  // embuscade : installés tôt, feu retenu, puis reprise de la manœuvre
  { const b = mkK(firstSeed.embuscade); while (b.t < 12) b.step();
    const ms = b.teams[1].units.filter(u => u.alive && b.orderOf(u)), held = ms.filter(u => b.orderOf(u).inf.feu === 'retenu').length;
    while (!b.over && b.t < 120) b.step();
    check('plan « embuscade » : au départ, l\'escouade adverse va s\'installer près de chez elle, feu retenu, puis reprend la manœuvre', held >= 4 && b.log.some(l => l.kind === 'plan' && l.plan === 'embuscade') && b.log.some(l => l.kind === 'reprise' && l.team === 1), { held, n: ms.length }); }
  // contourner : au contact, deux opérateurs changent de voie (flanc)
  { const b = mkK(firstSeed.contourner); const v0 = {}; let ev = null;
    while (!b.over && b.t < 90 && !ev) { b.step(); ev = b.log.find(l => l.kind === 'plan' && l.plan === 'contourner'); if (!ev) b.teams[1].units.forEach(u => { v0[u.id] = u.voie; }); }
    const moved = ev ? b.teams[1].units.filter(u => u.voie !== v0[u.id] && Math.abs(u.voie) === 1).length : 0;
    check('plan « contourner » : au contact, les deux plus éloignés de la menace passent par une voie de flanc', ev && moved >= 1 && b.teams[1].units.filter(u => u.alive && u.voie === b.teams[1].units.find(x => ev.unit === x.id).voie && Math.abs(u.voie) === 1).length >= 2 && b.teams[1].karst.contactAt !== null && ev.t >= b.teams[1].karst.contactAt, { ev: ev && ev.t, moved }); }
  // fumée adverse : on tient en face, feu retenu, orienté vers le nuage ; la fumée dissipée, on reprend
  { const b = mkK(firstSeed.repli); while (b.t < 8) b.step();
    const C = b.teams[1].units.filter(u => u.alive), cx = C.reduce((s, u) => s + u.x, 0) / C.length - 14, cz = C.reduce((s, u) => s + u.z, 0) / C.length;
    const cloud = { x: cx - 2.7, z: cz - 2.7, w: 5.4, d: 5.4, h: 3, kind: 'smoke', name: 'fumée', until: b.t + 15, team: 0 }; b.map.dynamic.push(cloud);
    while (b.t < 10.5) b.step();
    const ev = b.log.find(l => l.kind === 'plan' && l.plan === 'fumee'), inf = ev && b.teams[1].ordInfo[ev.ordre];
    while (b.t < 30 && !b.over) b.step();
    const o = ev && b.teams[1].karst.ord.find(x => x.id === ev.ordre);
    check('fumée adverse : le Groupe Karst tient en face, feu retenu, orienté vers le nuage ; dissipée, l\'ordre se termine', ev && inf.feu === 'retenu' && inf.orient && Math.hypot(inf.orient.x - cx, inf.orient.z - cz) < 1.5 && o && o.done, { ev: !!ev, done: o && o.done }); }
  // sous la pression (flash) : décrocher en fumée, feu retenu
  { let found = null;
    for (let sd = 1; sd <= 30 && !found; sd++) { const b = mkK(sd); b.run(); const e = b.log.find(l => l.kind === 'plan' && l.plan === 'repli'); if (e) found = { b, e }; }
    const mo = found && found.b.log.find(l => l.kind === 'moveorder' && l.ordre === found.e.ordre);
    check('sous la pression : des opérateurs adverses décrochent (mode Décrocher, feu retenu), le journal le dit', found && mo && mo.mode === 'decrocher' && mo.feu === 'retenu' && mo.silent, { found: !!found }); }
  // rejouabilité : plans Karst + commandes du joueur → bataille revue identique
  { const play = (o) => { const b = mkK(firstSeed.embuscade, o), tr = [];
      while (!b.over && b.t < 150) { if (!b.replayQueue && Math.abs(b.t - 20) < 0.05) b.command('grenade', 0, { x: 30, z: 23, kind: 'smoke', units: null }); b.step(); if (b.tick % 10 === 0) tr.push(b.units.map(u => u.x.toFixed(2) + ',' + u.z.toFixed(2) + ',' + u.state).join(';')); }
      return { b, tr: tr.join('|') }; };
    const P1 = play(), P2 = play({ replayInputs: P1.b.inputs });
    check('plans Karst : la bataille revue est identique, pas à pas (les plans découlent de l\'état, pas des commandes)', P1.tr === P2.tr && JSON.stringify(P1.b.result) === JSON.stringify(P2.b.result) && P1.b.log.some(l => l.kind === 'plan'), {}); }
}
console.log(`\n${pass}/${pass + fail} vérifications réussies` + (skip ? ` (${skip} mises de côté : fonctions désactivées)` : '')); process.exit(fail ? 1 : 0);
