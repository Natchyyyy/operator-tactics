// Morts en « ragdoll » physique (affichage seulement : la simulation a déjà décidé qui meurt, où, quand, de quel tir).
// À la mort (pas « à terre » : un blessé qui peut être relevé garde ses animations), le soldat Meshy passe de l'animation
// à un corps physique de 12 solides (bassin, ventre, torse, tête, bras, avant-bras + main, cuisses, jambes + pied) reliés
// par des articulations limitées (genoux et coudes en charnière dans un seul sens, cou, dos, épaules et hanches en cônes),
// moteur physique cannon-es (vendor/cannon-es.js, window.CANNON). Les solides sont taillés d'après le maillage lui-même
// (sommets rattachés à chaque os, dans la pose de liaison), donc valables pour les deux modèles et la version HD.
// Au départ : vitesses tirées de l'animation en cours (un soldat qui court garde son élan), impulsion de la balle sur la
// partie touchée (tête : rejetée en arrière ; jambe : elle plie), courte phase « tonique » où les articulations tirent vers
// la dernière pose animée puis relâchent ; collisions avec le sol et les obstacles de la carte (boîtes de la simulation) ;
// l'arme se détache et tombe seule. Corps immobile → figé (plus aucun calcul). Pas de cannon-es, ou ?ragdoll=0 : les
// anciennes animations de chute.
// Repère de liaison (« bind space ») : chaque solide a l'orientation de la pose de liaison portée par son os
// (os.matrixWorld × os.boneInverse) : dans la pose de liaison tous les solides ont le même repère, d'où des axes
// d'articulation écrits une seule fois (haut U, avant F, gauche L du personnage dans ce repère).
(function (root) {
  const OT = root.OT = root.OT || {};
  const R = { stats: { morts: 0, pas: 0, ms: 0, msMax: 0, actifs: 0 } };
  let actif = true;
  try { const q = new URLSearchParams(location.search); if (q.get('ragdoll') === '0') actif = false; } catch (e) { /* hors page */ }
  try { if (root.localStorage && localStorage.getItem('ot_ragdoll') === '0') actif = false; } catch (e) { /* stockage bloqué */ }
  R.dispo = () => actif && !!root.CANNON && !!root.THREE;
  R.activer = (on) => { actif = !!on; };

  // Segments : os principal, os rattachés (sommets et os figés dans le solide), parent, masse (kg)
  const SEGS = [
    { n: 'bassin', b: 'Hips', m: 11 },
    { n: 'ventre', b: 'Spine', p: 'bassin', m: 8, also: /^Spine1$/ },
    { n: 'torse', b: 'Spine2', p: 'ventre', m: 15, also: /^(Neck|LeftShoulder|RightShoulder)$/ },
    { n: 'tete', b: 'Head', p: 'torse', m: 5, also: /^HeadTop/, boule: true },
    { n: 'brasG', b: 'LeftArm', p: 'torse', m: 2.6 },
    { n: 'avbrasG', b: 'LeftForeArm', p: 'brasG', m: 2.1, also: /^LeftHand/ },
    { n: 'brasD', b: 'RightArm', p: 'torse', m: 2.6 },
    { n: 'avbrasD', b: 'RightForeArm', p: 'brasD', m: 2.1, also: /^RightHand/ },
    { n: 'cuisseG', b: 'LeftUpLeg', p: 'bassin', m: 8.5 },
    { n: 'jambeG', b: 'LeftLeg', p: 'cuisseG', m: 4.8, also: /^Left(Foot|Toe)/ },
    { n: 'cuisseD', b: 'RightUpLeg', p: 'bassin', m: 8.5 },
    { n: 'jambeD', b: 'RightLeg', p: 'cuisseD', m: 4.8, also: /^Right(Foot|Toe)/ },
  ];
  const IDX = {}; SEGS.forEach((s, i) => { IDX[s.n] = i; });
  const nomOs = (n) => n.replace(/^mixamorig:?/, '');
  // groupes de collision : sol, obstacles, corps, armes (les corps ne se heurtent pas entre eux : articulations limitées)
  const G_SOL = 1, G_OBS = 2, G_CORPS = 4, G_ARME = 8;
  // réglages
  const P = {
    pas: 1 / 60, sousPasMax: 6, iterations: 24, gravite: -9.81,
    amortLin: 0.08, amortAng: 0.45, frottementArt: 3.0, frottementSol: 0.5,           // frottement des articulations (1/s, vitesse angulaire relative)
    tonique: 0.2, relache: 0.2, flechit: 0.45, flechitT: 0.14, tenue: 0.7,                                     // phase tonique (s) puis relâchement (s)
    impulsion: { tete: 9, torse: 26, membre: 12, bras: 6 }, bascule: 14,        // N·s (exagéré par rapport au réel, lisible à l'écran)
    souffle: 340,                                                    // explosion : N·s à 1 m (réparti selon les masses)
    vMax: 14, wMax: 28, repos: 0.12, reposT: 0.45, dureeMax: 7,
  };
  R.P = P;

  // ---- Mesures par modèle (une fois) : boîtes des segments dans le repère de liaison, axes du personnage ----------------
  const cacheModele = new Map();
  function mesurer(m) {
    const sk = m.skinned && m.skinned.skeleton; if (!sk) return null;
    const cle = sk.boneInverses[0].elements.join(',').slice(0, 60) + ':' + m.skinned.geometry.attributes.position.count;
    if (cacheModele.has(cle)) return cacheModele.get(cle);
    const T = THREE, bones = sk.bones, segDe = new Map();
    // os → segment (os inconnus : celui de leur premier ancêtre connu)
    const segNom = (o) => { for (let b = o; b && b.isBone; b = b.parent) { const n = nomOs(b.name); for (let i = 0; i < SEGS.length; i++) { const s = SEGS[i]; if (n === s.b || (s.also && s.also.test(n))) return i; } } return -1; };
    bones.forEach((b, i) => segDe.set(i, segNom(b)));
    const idxOs = (n) => bones.findIndex(b => nomOs(b.name) === n);
    const lie = (n) => { const i = idxOs(n); return i < 0 ? null : new T.Vector3().setFromMatrixPosition(new T.Matrix4().copy(sk.boneInverses[i]).invert()); };
    const box = SEGS.map(() => new T.Box3()), sous = SEGS.map(() => new Map());   // sous : boîte par os (nom), repère de liaison
    m.body.traverse(o => {
      if (!o.isSkinnedMesh || !o.skeleton) return;
      const g = o.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight; if (!pos || !si || !sw) return;
      const map = o.skeleton.bones.map(b => segNom(b)), v = new T.Vector3();
      const pas = Math.max(1, Math.floor(pos.count / 40000));   // (modèle HD ~100 000 sommets : un sur deux ou trois suffit)
      for (let i = 0; i < pos.count; i += pas) {
        let best = -1, bw = 0; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
        const s = best >= 0 ? map[best] : -1; if (s < 0) continue;
        v.fromBufferAttribute(pos, i).applyMatrix4(o.bindMatrix); box[s].expandByPoint(v);
        const nb = nomOs(o.skeleton.bones[best].name); let bx = sous[s].get(nb); if (!bx) sous[s].set(nb, bx = new T.Box3()); bx.expandByPoint(v);
      }
    });
    const ok = SEGS.every((s, i) => !box[i].isEmpty() && idxOs(s.b) >= 0); if (!ok) { cacheModele.set(cle, null); return null; }
    const P0 = (n) => lie(n);
    const U = P0('Head').sub(P0('Hips')).normalize(), L = P0('LeftUpLeg').sub(P0('RightUpLeg')); L.addScaledVector(U, -L.dot(U)).normalize();
    const F = new T.Vector3().crossVectors(L, U).normalize();
    const dir = (a, b) => P0(b).sub(P0(a)).normalize();
    const res = {
      U, F, L, os: SEGS.map(s => idxOs(s.b)),
      centre: box.map(b => b.getCenter(new T.Vector3())), demi: box.map(b => b.getSize(new T.Vector3()).multiplyScalar(0.5)),
      sous: sous.map(mp => [...mp].map(([n, bx]) => ({ i: idxOs(n), bx })).filter(x => x.i >= 0)),
      D: { brasG: dir('LeftArm', 'LeftForeArm'), avbrasG: dir('LeftForeArm', 'LeftHand'), brasD: dir('RightArm', 'RightForeArm'), avbrasD: dir('RightForeArm', 'RightHand'),
        cuisseG: dir('LeftUpLeg', 'LeftLeg'), jambeG: dir('LeftLeg', 'LeftFoot'), cuisseD: dir('RightUpLeg', 'RightLeg'), jambeD: dir('RightLeg', 'RightFoot') },
      plie: {},   // sens de flexion des coudes (repère du bras), mesuré sur une pose où le coude est plié
      inv: SEGS.map(s => new T.Matrix4().copy(sk.boneInverses[idxOs(s.b)])),
      lie: SEGS.map(s => new T.Matrix4().copy(sk.boneInverses[idxOs(s.b)]).invert()),
    };
    cacheModele.set(cle, res); return res;
  }

  // ---- Monde physique (un par bataille) ----------------------------------------------------------------------------------
  let W = null, battleRef = null, matCorps, matSol, matArme;
  const ragdolls = new Set(), obstacles = new Map();
  function monde() {
    if (W) return W;
    const C = root.CANNON;
    W = new C.World({ gravity: new C.Vec3(0, P.gravite, 0) });
    W.broadphase = new C.SAPBroadphase(W); W.solver.iterations = P.iterations; W.solver.tolerance = 1e-4; W.allowSleep = false;
    W.quatNormalizeFast = false; W.quatNormalizeSkip = 0;
    matCorps = new C.Material('corps'); matSol = new C.Material('sol'); matArme = new C.Material('arme');
    W.addContactMaterial(new C.ContactMaterial(matCorps, matSol, { friction: P.frottementSol, restitution: 0, contactEquationStiffness: 1e7, contactEquationRelaxation: 3 }));
    W.addContactMaterial(new C.ContactMaterial(matArme, matSol, { friction: 0.5, restitution: 0.12 }));
    const sol = new C.Body({ mass: 0, material: matSol, collisionFilterGroup: G_SOL, collisionFilterMask: G_CORPS | G_ARME });
    sol.addShape(new C.Plane()); sol.quaternion.setFromEuler(-Math.PI / 2, 0, 0); W.addBody(sol);
    return W;
  }
  function reinit() {
    for (const r of ragdolls) r.fige = true;
    ragdolls.clear(); obstacles.clear(); W = null;
  }
  R.reinit = reinit;
  // obstacles de la simulation (boîtes x, z, w, d, h) autour d'un point, ajoutés à la demande ; retirés s'ils sont détruits
  function obstaclesAutour(map, x, z, r) {
    if (!map || !map.obstacles) return;
    const C = root.CANNON;
    for (const o of map.obstacles) {
      if (obstacles.has(o) || o.kind === 'smoke') continue;
      const dx = Math.max(o.x - x, 0, x - (o.x + o.w)), dz = Math.max(o.z - z, 0, z - (o.z + o.d)); if (Math.hypot(dx, dz) > r) continue;
      const h = Math.max(0.05, o.h || 1), b = new C.Body({ mass: 0, material: matSol, collisionFilterGroup: G_OBS, collisionFilterMask: G_CORPS | G_ARME });
      b.addShape(new C.Box(new C.Vec3(o.w / 2, h / 2, o.d / 2))); b.position.set(o.x + o.w / 2, h / 2, o.z + o.d / 2); W.addBody(b); obstacles.set(o, b);
    }
  }

  // ---- Limite d'angle entre deux axes (un dans chaque solide) : cône, ou borne de torsion ----------------------------------
  let Limite = null;
  function classeLimite() {
    if (Limite) return Limite;
    const C = root.CANNON;
    Limite = class extends C.Constraint {
      constructor(a, b, axA, axB, ang) {
        super(a, b, { collideConnected: false, wakeUpBodies: false });
        this.axA = axA; this.axB = axB; this.ang = ang;
        const e = this.eq = new C.RotationalEquation(a, b, { maxForce: 1e6 }); e.maxForce = 0; e.minForce = -1e6; this.equations.push(e);
      }
      update() { this.bodyA.vectorToWorldFrame(this.axA, this.eq.axisA); this.bodyB.vectorToWorldFrame(this.axB, this.eq.axisB); this.eq.maxAngle = this.ang; }
    };
    return Limite;
  }

  // ---- Pose des segments (repère de liaison porté par chaque os) ---------------------------------------------------------
  const _m = new (root.THREE ? THREE.Matrix4 : Object)(), _m2 = new (root.THREE ? THREE.Matrix4 : Object)();
  function poseSegments(m, Mo) {
    const sk = m.skinned.skeleton, out = [];
    m.group.updateMatrixWorld(true);
    SEGS.forEach((s, i) => {
      const bone = sk.bones[Mo.os[i]], S = new THREE.Matrix4().multiplyMatrices(bone.matrixWorld, Mo.inv[i]);
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(); S.decompose(p, q, sc);
      out.push({ c: Mo.centre[i].clone().applyMatrix4(S), q, k: sc.x, os: new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld) });
    });
    return out;
  }

  // ---- Mort : enregistrée à l'événement « down », démarre à l'arrivée de la balle -----------------------------------------
  R.mort = function (u, m, battle) {
    if (!R.dispo() || !m || !m.isSkinned || !m.skinned || u.alive) return false;
    if (battle && u.bleedUntil > battle.t) return false;   // à terre (peut être relevé) : animations
    if (battle !== battleRef) { reinit(); battleRef = battle; }
    let loc = null; if (battle && battle.log) for (let i = battle.log.length - 1; i >= Math.max(0, battle.log.length - 40); i--) { const e = battle.log[i]; if (e.kind === 'down' && e.enemy === u.id) { loc = e.loc || null; break; } }
    if (m.anim) delete m.anim.fallYaw;   // (le jeu ne fait plus pivoter le groupe : le corps figé ne doit pas tourner)
    m.rag = { etat: 'attente', attente: 0, loc, dir: null, t0: battle ? battle.t : 0, u, map: battle && battle.map, graine: hash(u.id + ':' + (battle ? battle.t.toFixed(2) : '0')) };
    return true;
  };
  // balle qui a tué (événement « shot » touché) : direction (monde, normalisée) et délai de vol de la traçante
  R.impact = function (m, dir, delai) {
    const r = m && m.rag; if (!r || r.etat !== 'attente' || r.dir) return;
    r.dir = { x: dir.x, y: dir.y, z: dir.z }; r.attente = Math.min(0.35, Math.max(0, delai || 0));
  };
  const souffles = [];
  R.souffle = function (x, z, t) { souffles.push({ x, z, t }); while (souffles.length > 12) souffles.shift(); };
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 100000) / 100000; }

  // Construction du corps physique à partir de la pose animée
  function demarrer(u, m) {
    const r = m.rag, Mo = mesurer(m); if (!Mo || !monde()) { m.rag = null; return false; }
    const C = root.CANNON, T = THREE; classeLimite();
    const t0 = performance.now();
    // vitesses : pose actuelle, puis l'animation avancée de 1/30 s
    const A = poseSegments(m, Mo); m.update(1 / 30, false); const B = poseSegments(m, Mo);
    const an = m.anim || {}, vG = new T.Vector3(an.vx || 0, 0, an.vz || 0); if (vG.length() > 6) vG.setLength(6); r.elan = vG.length();
    const k = B[0].k;
    // boîtes des segments dans LA pose de la mort : la boîte de chaque os rattaché (main, pied, cou…) suit sa rotation figée
    const skel = m.skinned.skeleton, centres = [], demis = [], Sm = new T.Matrix4(), Si = new T.Matrix4(), Sj = new T.Matrix4(), cn = new T.Vector3();
    SEGS.forEach((s, i) => {
      Sm.multiplyMatrices(skel.bones[Mo.os[i]].matrixWorld, Mo.inv[i]); Si.copy(Sm).invert();
      const bb = new T.Box3();
      for (const { i: j, bx } of Mo.sous[i]) {
        if (j === Mo.os[i]) { bb.union(bx); continue; }
        Sj.multiplyMatrices(skel.bones[j].matrixWorld, new T.Matrix4().copy(skel.boneInverses[j])); Sj.premultiply(Si);
        for (let c = 0; c < 8; c++) { cn.set(c & 1 ? bx.max.x : bx.min.x, c & 2 ? bx.max.y : bx.min.y, c & 4 ? bx.max.z : bx.min.z).applyMatrix4(Sj); bb.expandByPoint(cn); }
      }
      if (bb.isEmpty()) bb.copy(new T.Box3().setFromCenterAndSize(Mo.centre[i], Mo.demi[i].clone().multiplyScalar(2)));
      centres.push(bb.getCenter(new T.Vector3())); demis.push(bb.getSize(new T.Vector3()).multiplyScalar(0.5));
      B[i].c = centres[i].clone().applyMatrix4(Sm);
    });
    const corps = SEGS.map((s, i) => {
      const d = demis[i];
      const b = new C.Body({ mass: s.m, material: matCorps, linearDamping: P.amortLin, angularDamping: P.amortAng, collisionFilterGroup: G_CORPS, collisionFilterMask: G_SOL | G_OBS, allowSleep: false });
      if (s.boule) { const rr = k * Math.min(d.x, d.y, d.z); b.addShape(new C.Sphere(rr)); b.addShape(new C.Box(new C.Vec3(d.x * k * 0.97, d.y * k * 0.97, d.z * k * 0.97))); }   // (tête : boîte du casque, arrondie par une sphère)
      else b.addShape(new C.Box(new C.Vec3(d.x * k * 0.95, d.y * k * 0.95, d.z * k * 0.95)));
      b.position.set(B[i].c.x, B[i].c.y, B[i].c.z); b.quaternion.set(B[i].q.x, B[i].q.y, B[i].q.z, B[i].q.w);
      const v = B[i].c.clone().sub(A[i].c).multiplyScalar(30).add(vG); if (v.length() > 8) v.setLength(8);
      b.velocity.set(v.x, v.y, v.z);
      const dq = B[i].q.clone().multiply(A[i].q.clone().invert()); if (dq.w < 0) { dq.x = -dq.x; dq.y = -dq.y; dq.z = -dq.z; dq.w = -dq.w; }
      const ang = 2 * Math.acos(Math.min(1, dq.w)), sn = Math.sqrt(Math.max(1e-12, 1 - dq.w * dq.w)), w = Math.min(12, ang * 30);
      if (ang > 1e-4) b.angularVelocity.set(dq.x / sn * w, dq.y / sn * w, dq.z / sn * w);
      W.addBody(b); return b;
    });
    // sol sous le corps : aucune boîte sous y = 0 au départ (les poses accroupies peuvent effleurer le sol)
    let ymin = 0; corps.forEach(b => { b.updateAABB(); ymin = Math.min(ymin, b.aabb.lowerBound.y); }); const leve = Math.max(0, 0.005 - ymin); if (leve) corps.forEach(b => { b.position.y += leve; });
    corps.forEach(b => { b.previousPosition.copy(b.position); b.interpolatedPosition.copy(b.position); b.previousQuaternion.copy(b.quaternion); b.interpolatedQuaternion.copy(b.quaternion); });
    obstaclesAutour(r.map, u.x, u.z, 3.5);
    // sens de flexion des coudes : mesuré sur cette pose si le coude est plié, sinon celui déjà connu, sinon vers l'avant
    for (const [bras, av] of [['brasG', 'avbrasG'], ['brasD', 'avbrasD']]) {
      const ib = IDX[bras], qa = B[ib].q.clone().invert(), fa = B[IDX[av]].os.clone().sub(B[ib].os); // (coude − épaule : axe du bras)
      const sk = m.skinned.skeleton, main = sk.bones.find(o => nomOs(o.name) === (bras === 'brasG' ? 'LeftHand' : 'RightHand'));
      if (!main) continue; const avd = new T.Vector3().setFromMatrixPosition(main.matrixWorld).sub(B[IDX[av]].os).applyQuaternion(qa).normalize();
      const D = Mo.D[bras], perp = avd.clone().addScaledVector(D, -avd.dot(D)); void fa;
      if (perp.length() > 0.42 && avd.dot(D) < 0.9) { const n = perp.normalize(); Mo.plie[bras] = Mo.plie[bras] ? Mo.plie[bras].lerp(n, 0.3).normalize() : n; }
    }
    // articulations
    const U = Mo.U, F = Mo.F, L = Mo.L, art = [];
    const lien = (pn, cn, opt) => {
      const a = corps[IDX[pn]], b = corps[IDX[cn]], piv = B[IDX[cn]].os, pv = new C.Vec3(piv.x, piv.y + leve, piv.z);   // (corps relevé de « leve » : pivots aussi)
      const pA = a.pointToLocalFrame(pv), pB = b.pointToLocalFrame(pv);
      const cons = [];
      if (opt.charniere) {   // axe de charnière dans le parent ; dans l'enfant : le même axe tel qu'il est aujourd'hui (pas d'à-coup)
        const axW = a.vectorToWorldFrame(new C.Vec3(opt.charniere.x, opt.charniere.y, opt.charniere.z)), axB = b.vectorToLocalFrame(axW);
        cons.push(new C.HingeConstraint(a, b, { pivotA: pA, pivotB: pB, axisA: new C.Vec3(opt.charniere.x, opt.charniere.y, opt.charniere.z), axisB: axB, collideConnected: false, maxForce: 1e6 }));
      } else cons.push(new C.PointToPointConstraint(a, pA, b, pB, 1e6));
      // limites : angle entre un axe du parent et un axe de l'enfant ; si la pose de départ dépasse déjà, la limite s'élargit
      for (const [axA, axB, ang] of opt.limites || []) {
        const wa = a.vectorToWorldFrame(new C.Vec3(axA.x, axA.y, axA.z)), wb = b.vectorToWorldFrame(new C.Vec3(axB.x, axB.y, axB.z));
        const cur = Math.acos(Math.max(-1, Math.min(1, wa.dot(wb) / (wa.length() * wb.length()))));
        cons.push(new (classeLimite())(a, b, new C.Vec3(axA.x, axA.y, axA.z), new C.Vec3(axB.x, axB.y, axB.z), Math.max(ang, cur + 0.04)));
      }
      cons.forEach(c => W.addConstraint(c));
      const qa = new T.Quaternion(a.quaternion.x, a.quaternion.y, a.quaternion.z, a.quaternion.w), qb = new T.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      const cible = qa.invert().multiply(qb);
      // flex : pendant la phase tonique, la cible plie l'articulation (genoux, hanches : les jambes cèdent, le corps s'affaisse)
      const flex = opt.flex ? new T.Quaternion().setFromAxisAngle(opt.flex[0], opt.flex[1]).multiply(cible) : null;
      const e = { a, b, cons, cible, flex, force: opt.force || 1, frot: opt.frot || 1, nom: cn, pA, pB };
      // genoux : moteur de la charnière (résolu avec les contraintes : il porte vraiment le poids du corps)
      if (opt.genou) { e.hc = cons[0]; e.axP = new C.Vec3(opt.genou[0].x, opt.genou[0].y, opt.genou[0].z); e.axC = new C.Vec3(opt.genou[1].x, opt.genou[1].y, opt.genou[1].z); e.flex0 = angleGenou(e); e.hc.enableMotor(); e.hc.setMotorMaxForce(0); }
      art.push(e);
    };
    const mix = (v1, c1, v2, c2) => v1.clone().multiplyScalar(c1).addScaledVector(v2, c2).normalize();
    const perpA = (v, d) => v.clone().addScaledVector(d, -v.dot(d)).normalize();
    lien('bassin', 'ventre', { limites: [[U, U, 0.3], [F, F, 0.36]], force: 1 });
    lien('ventre', 'torse', { limites: [[U, U, 0.3], [F, F, 0.36]], force: 1 });
    lien('torse', 'tete', { limites: [[U, U, 0.8], [F, F, 1.05]], force: 0.6 });
    for (const [c, sg] of [['G', 1], ['D', -1]]) {
      const Db = Mo.D['bras' + c], Df = Mo.D['avbras' + c], sL = L.clone().multiplyScalar(sg);
      const centre = mix(U.clone().negate().multiplyScalar(0.5).addScaledVector(sL, 0.75), 1, F, 0.35);
      lien('torse', 'bras' + c, { limites: [[centre, Db, 1.75], [F, F, 2.1]], force: 0.8, frot: 2.2 });
      const fl = perpA(Mo.plie['bras' + c] || F, Db), axe = new T.Vector3().crossVectors(Db, fl).normalize();
      lien('bras' + c, 'avbras' + c, { charniere: axe, limites: [[mix(Db, Math.cos(1.3), fl, Math.sin(1.3)), Df, 1.33]], force: 0.8, frot: 2 });
      const Dc = Mo.D['cuisse' + c], Dj = Mo.D['jambe' + c];
      lien('bassin', 'cuisse' + c, { limites: [[mix(Dc, Math.cos(0.42), F, Math.sin(0.42)), Dc, 0.98], [F, F, 1.9]], force: 0.55, flex: [new T.Vector3().crossVectors(Dc, F).normalize(), 0.3] });
      const arr = perpA(F.clone().negate(), Dc), axeG = new T.Vector3().crossVectors(Dc, arr).normalize();
      lien('cuisse' + c, 'jambe' + c, { charniere: axeG, limites: [[mix(Dc, Math.cos(1.1), arr, Math.sin(1.1)), Dj, 1.14]], force: 0.5, flex: [axeG, 1.1], genou: [Dc, Dj] });
    }
    // arme : détachée, solide à part (boîte de son maillage)
    let arme = null;
    if (m.weapon && m.weapon.parent) {
      const w = m.weapon; w.updateMatrixWorld(true);
      const bb = boiteLocale(w);
      if (bb) {
        const p = new T.Vector3(), q = new T.Quaternion(), sc = new T.Vector3(); w.matrixWorld.decompose(p, q, sc);
        const c = bb.getCenter(new T.Vector3()), d = bb.getSize(new T.Vector3()).multiplyScalar(0.5).multiply(sc);
        // tenue par la main droite (avant-bras) pendant la phase tonique, lâchée ensuite (voir lacherArme)
        const fb = corps[IDX.avbrasD], Mf = new T.Matrix4().compose(new T.Vector3(fb.position.x, fb.position.y, fb.position.z), new T.Quaternion(fb.quaternion.x, fb.quaternion.y, fb.quaternion.z, fb.quaternion.w), new T.Vector3(1, 1, 1));
        arme = { body: null, c, sc, d, rel: Mf.invert().multiply(w.matrixWorld) };
      }
    }
    Object.assign(r, { etat: 'physique', corps, art, arme, k, Mo, centres, t: 0, calme: 0, sauve: sauverOs(m), fige: false });
    impulsions(r, u, m);
    r.lacher = r.tonique < 0.1 ? 0.04 : 0.16 + r.graine * 0.16;
    ragdolls.add(r); R.stats.morts++;
    r.msCreation = performance.now() - t0;
    return true;
  }
  // l'arme quitte la main : solide à part, à la vitesse de la main
  function lacherArme(r) {
    const C = root.CANNON, T = THREE, A = r.arme, fb = r.corps[IDX.avbrasD];
    const M = new T.Matrix4().compose(new T.Vector3(fb.position.x, fb.position.y, fb.position.z), new T.Quaternion(fb.quaternion.x, fb.quaternion.y, fb.quaternion.z, fb.quaternion.w), new T.Vector3(1, 1, 1)).multiply(A.rel);
    const p = new T.Vector3(), q = new T.Quaternion(), sc = new T.Vector3(); M.decompose(p, q, sc);
    const ab = new C.Body({ mass: 3.4, material: matArme, linearDamping: 0.05, angularDamping: 0.3, collisionFilterGroup: G_ARME, collisionFilterMask: G_SOL | G_OBS, allowSleep: false });
    ab.addShape(new C.Box(new C.Vec3(Math.max(0.015, A.d.x), Math.max(0.015, A.d.y), Math.max(0.015, A.d.z))));
    const cw = A.c.clone().applyMatrix4(M); ab.position.set(cw.x, Math.max(cw.y, Math.min(A.d.x, A.d.y, A.d.z) + 0.01), cw.z); ab.quaternion.set(q.x, q.y, q.z, q.w);
    // vitesse de la main (sans le fouet du bras) + un peu de hasard ; jamais lancée vers le haut ni loin
    const g = r.graine, v = new C.Vec3(fb.velocity.x + (g - 0.5) * 0.4, Math.min(0.3, fb.velocity.y), fb.velocity.z + ((g * 7) % 1 - 0.5) * 0.4);
    const lv = Math.hypot(v.x, v.z); if (lv > 1.8) { v.x *= 1.8 / lv; v.z *= 1.8 / lv; }
    ab.velocity.copy(v); ab.angularVelocity.set((g - 0.5) * 3, ((g * 3) % 1 - 0.5) * 2, ((g * 5) % 1 - 0.5) * 3);
    ab.previousPosition.copy(ab.position); ab.interpolatedPosition.copy(ab.position); ab.previousQuaternion.copy(ab.quaternion); ab.interpolatedQuaternion.copy(ab.quaternion);
    W.addBody(ab); A.body = ab; A.sc = sc;
  }
  const boites = new WeakMap();
  function boiteLocale(w) {
    const geoKey = []; w.traverse(o => { if (o.isMesh && o.visible) geoKey.push(o.geometry.uuid); }); const key = geoKey.join();
    if (w.userData.ragBoite && w.userData.ragBoite.key === key) return w.userData.ragBoite.bb;
    const inv = new THREE.Matrix4().copy(w.matrixWorld).invert(), bb = new THREE.Box3(), tmp = new THREE.Box3();
    w.traverse(o => { if (!o.isMesh || !o.visible) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); tmp.copy(o.geometry.boundingBox).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); bb.union(tmp); });
    if (bb.isEmpty()) return null; w.userData.ragBoite = { key, bb }; void boites; return bb;
  }
  function sauverOs(m) { const l = []; m.body.traverse(o => { if (o.isBone) l.push([o, o.quaternion.clone(), o.position.clone()]); }); return l; }

  // impulsion de départ : balle (partie touchée) ou explosion (radiale)
  function impulsions(r, u, m) {
    const C = root.CANNON, corps = r.corps, loc = r.loc || '';
    const expl = /grenade|éclat|frappe|obus|mortier|explos/.test(loc);
    let s = null;
    if (expl || !r.dir) { let best = null, bd = 9; for (const b of souffles) { const d = Math.hypot(b.x - u.x, b.z - u.z); if (d < bd && Math.abs((r.t0 || 0) - b.t) < 2) { bd = d; best = b; } } s = best; }
    if (s) {
      for (const b of corps) {
        const d = new C.Vec3(b.position.x - s.x, b.position.y + 0.6, b.position.z - s.z), L = Math.max(0.6, d.length()); d.scale(1 / L, d);
        const j = P.souffle / Math.max(1.2, L * L) * (b.mass / 80); b.applyImpulse(new C.Vec3(d.x * j, d.y * j * 1.25, d.z * j), new C.Vec3(0, 0, 0));
      }
      r.tonique = 0.04; return;
    }
    if (!r.dir) { r.tonique = P.tonique; return; }   // (sans balle connue : effondrement)
    const dir = new C.Vec3(r.dir.x, r.dir.y, r.dir.z); dir.normalize();
    let cible = 'torse', j = P.impulsion.torse;
    if (loc === 'tête') { cible = 'tete'; j = P.impulsion.tete; }
    else if (loc === 'membre') { const g = r.graine; cible = g < 0.3 ? 'jambeG' : g < 0.6 ? 'jambeD' : g < 0.7 ? 'cuisseG' : g < 0.8 ? 'cuisseD' : g < 0.9 ? 'avbrasG' : 'brasD'; j = /bras/.test(cible) ? P.impulsion.bras : P.impulsion.membre; }
    else if (r.graine < 0.35) cible = 'ventre';
    const b = corps[IDX[cible]];
    // point d'impact : surface du solide côté tireur, un peu au-dessus du centre (tête : fait basculer en arrière)
    const pt = new C.Vec3(-dir.x * 0.08, (cible === 'tete' ? 0.05 : /torse|ventre/.test(cible) ? 0.13 : 0.06), -dir.z * 0.08);
    // (le corps tourne un peu sur lui-même en tombant, sens tiré au sort)
    corps[IDX.bassin].angularVelocity.y += (r.graine - 0.5) * 2.4; corps[IDX.torse].angularVelocity.y += (r.graine - 0.5) * 3;
    b.applyImpulse(dir.scale(j), pt);
    if (cible === 'tete') corps[IDX.torse].applyImpulse(dir.scale(P.impulsion.tete * 0.5), new C.Vec3(0, 0.12, 0));
    // bascule : le bassin part aussi un peu dans le sens du tir (horizontal) ; le corps passe par-dessus ses appuis au lieu
    // de s'asseoir sur place (balle au torse ou à la tête ; une jambe touchée plie surtout)
    // (appliquée en haut du buste : pousser le bassin ferait au contraire basculer le buste vers le tireur)
    if (!/jambe|cuisse|bras/.test(cible)) { const hz = Math.hypot(dir.x, dir.z) || 1; corps[IDX.torse].applyImpulse(new C.Vec3(dir.x / hz * P.bascule, 0, dir.z / hz * P.bascule), new C.Vec3(0, 0.12, 0)); }
    // tête et buste touchés : le dos et le cou ne retiennent presque rien (le haut du corps part en arrière tout de suite)
    r.dosMou = cible === 'tete' || cible === 'torse' || cible === 'ventre';
    r.cible = cible;
    r.tonique = loc === 'tête' ? 0.06 : P.tonique;
  }

  // ---- Pas de simulation (une fois par image) ----------------------------------------------------------------------------
  const _v = root.THREE ? new THREE.Vector3() : null, _q = root.THREE ? new THREE.Quaternion() : null;
  let tReel = 0; const manuel = (() => { try { return /[?&]manual=1/.test(location.search); } catch (e) { return false; } })();
  R.etape = function (dt, battle) {
    if (battle && battle !== battleRef) { reinit(); battleRef = battle; }
    // bataille finie : le jeu s'arrête (dt = 0) pendant la bannière et le plan final ; les corps finissent de tomber au
    // ralenti (comme le plan final), en temps réel — sauf en mode manuel (captures reproductibles)
    if (!(dt > 0) && battle && battle.over && !manuel) { const now = performance.now(); dt = tReel ? Math.min(0.05, (now - tReel) / 1000) * 0.4 : 0; tReel = now; } else tReel = 0;
    if (!W || !(dt > 0)) return;
    let n = 0; for (const r of ragdolls) if (!r.fige) n++;
    R.stats.actifs = n; if (!n) return;
    const t0 = performance.now();
    // obstacles détruits : retirés
    if (battleRef && battleRef.map) for (const [o, b] of obstacles) if (battleRef.map.obstacles.indexOf(o) < 0) { W.removeBody(b); obstacles.delete(o); }
    let sous = 0;
    W.__acc = (W.__acc || 0) + dt;
    while (W.__acc >= P.pas && sous < P.sousPasMax) { for (const r of ragdolls) if (!r.fige) moteurs(r, P.pas); W.step(P.pas); W.__acc -= P.pas; sous++; }
    if (sous >= P.sousPasMax) W.__acc = 0;
    // interpolation entre les deux derniers pas (affichage fluide à toute fréquence d'image)
    const a = W.__acc / P.pas;
    for (const r of ragdolls) if (!r.fige) {
      for (const b of r.corps) { b.previousPosition.lerp(b.position, a, b.interpolatedPosition); b.previousQuaternion.slerp(b.quaternion, a, b.interpolatedQuaternion); b.interpolatedQuaternion.normalize(); }
      if (r.arme && !r.arme.body && r.t + sous * P.pas >= r.lacher) lacherArme(r);
      if (r.arme && r.arme.body) { const b = r.arme.body; b.previousPosition.lerp(b.position, a, b.interpolatedPosition); b.previousQuaternion.slerp(b.quaternion, a, b.interpolatedQuaternion); b.interpolatedQuaternion.normalize(); }
      if (sous) apresPas(r, sous * P.pas);
    }
    const ms = performance.now() - t0; R.stats.pas += sous; R.stats.ms += ms; R.stats.msMax = Math.max(R.stats.msMax, ms); R.stats.dernier = ms;
  };
  // phase tonique (les articulations tirent vers la pose de la mort, puis relâchent) et frottement des articulations
  const _w = root.THREE ? new THREE.Vector3() : null;
  const _qc = root.THREE ? new THREE.Quaternion() : null;
  function moteurs(r, h) {
    const T = THREE, qa = new T.Quaternion(), qb = new T.Quaternion(), qe = new T.Quaternion();
    const ton = r.t < r.tonique ? 1 : Math.max(0, 1 - (r.t - r.tonique) / P.relache);
    for (const j of r.art) {
      const a = j.a, b = j.b;
      const wr = new T.Vector3(b.angularVelocity.x - a.angularVelocity.x, b.angularVelocity.y - a.angularVelocity.y, b.angularVelocity.z - a.angularVelocity.z);
      // frottement des articulations (part de la vitesse angulaire relative retirée) : réduit après la phase tonique (corps
      // inerte qui s'étale) ; jambes encore plus libres (des genoux restés en l'air retombent sur le côté)
      const fr = j.frot * (ton > 0 ? 1 : 0.6) * (j.flex && r.t > P.flechitT ? 0.35 : 1);
      let des = new T.Vector3(), k = 1 - Math.exp(-P.frottementArt * fr * h);
      // jambes qui cèdent : un genou se déverrouille d'abord (côté tiré au sort), l'autre un peu après et à moitié, pendant
      // ~0,2 s seulement (un corps inerte aux genoux tendus basculerait d'un bloc ou se plierait aux hanches comme un pantin) ;
      // soldat lancé (> 1,5 m/s) : presque rien, son élan le fait tomber en avant
      // l'autre jambe garde un reste de tonus (~0,45 s) : le corps bascule par-dessus elle au lieu de s'asseoir sur place
      let kf = 0, garde = false;
      if (j.flex) {
        const lead = j.nom.endsWith(r.graine < 0.5 ? 'G' : 'D'), T1 = r.elan > 1.5 ? 0.08 : P.flechitT;
        if (lead) kf = r.t < T1 ? P.flechit : 0;
        else { garde = true; kf = P.tenue * (r.t < 0.3 ? 1 : Math.max(0, 1 - (r.t - 0.3) / 0.15)) * (r.elan > 1.5 ? 0.3 : 1); }
      }
      if (j.hc) {   // genou : vitesse de flexion visée (flexion + = rotation + autour de l'axe ; le moteur vise −vitesse)
        if (kf > 0) { const cible = garde ? j.flex0 : Math.min(1.7, j.flex0 + 0.75), v = Math.max(-8, Math.min(8, (cible - angleGenou(j)) * 12)); j.hc.setMotorSpeed(-v); j.hc.setMotorMaxForce(kf * 900); }
        else j.hc.setMotorMaxForce(0);
        kf = 0; if (!(ton > 0 && j.force > 0)) { /* frottement seul */ }
      }
      if ((ton > 0 && j.force > 0) || kf > 0) {
        qa.set(a.quaternion.x, a.quaternion.y, a.quaternion.z, a.quaternion.w); qb.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
        const cib = j.flex && kf > 0 && !garde ? _qc.copy(j.cible).slerp(j.flex, Math.min(1, r.t / 0.1)) : j.cible;
        qe.copy(qa).multiply(cib).multiply(qb.invert()); if (qe.w < 0) { qe.x = -qe.x; qe.y = -qe.y; qe.z = -qe.z; qe.w = -qe.w; }
        const ang = 2 * Math.acos(Math.min(1, qe.w)), sn = Math.sqrt(Math.max(1e-12, 1 - qe.w * qe.w));
        if (ang > 1e-4) des.set(qe.x / sn, qe.y / sn, qe.z / sn).multiplyScalar(Math.min(ang, 0.8) / 0.07);
        const blessure = r.cible && (j.nom === r.cible || (r.cible.startsWith('jambe') && j.nom === r.cible.replace('jambe', 'cuisse'))) ? 0.15 : 1;
        const mou = r.dosMou && (j.nom === 'ventre' || j.nom === 'torse' || j.nom === 'tete') ? 0.25 : 1;
        k = Math.max(k, 0.55 * ton * j.force * blessure * mou, kf);
      }
      const dw = des.sub(wr).multiplyScalar(k);
      const ia = moyInv(a), ib = moyInv(b), J = dw.multiplyScalar(1 / (ia + ib));
      b.angularVelocity.x += J.x * ib; b.angularVelocity.y += J.y * ib; b.angularVelocity.z += J.z * ib;
      a.angularVelocity.x -= J.x * ia; a.angularVelocity.y -= J.y * ia; a.angularVelocity.z -= J.z * ia;
    }
    void _w;
  }
  const _ga = root.CANNON ? null : null;
  function angleGenou(e) { const wa = e.a.vectorToWorldFrame(e.axP), wb = e.b.vectorToWorldFrame(e.axC); return Math.acos(Math.max(-1, Math.min(1, wa.dot(wb) / (wa.length() * wb.length())))); }
  function moyInv(b) { const e = b.invInertiaWorld.elements; return (e[0] + e[4] + e[8]) / 3; }
  function apresPas(r, dt) {
    r.t += dt;
    let vmax = 0, bad = false;
    for (const b of r.corps) {
      const v = b.velocity.length(), w = b.angularVelocity.length();
      if (!isFinite(v) || !isFinite(w) || !isFinite(b.position.y)) { bad = true; break; }
      if (v > P.vMax) b.velocity.scale(P.vMax / v, b.velocity);
      if (w > P.wMax) b.angularVelocity.scale(P.wMax / w, b.angularVelocity);
      vmax = Math.max(vmax, v, w * 0.15);
    }
    if (bad) { r.erreur = true; figer(r); return; }
    r.calme = vmax < P.repos ? r.calme + dt : 0;
    if ((r.t > 1 && r.calme > P.reposT) || r.t > P.dureeMax) r.aFiger = true;
  }
  function figer(r) {
    if (r.fige) return; r.fige = true;
    for (const j of r.art) for (const c of j.cons) W && W.removeConstraint(c);
    for (const b of r.corps) W && W.removeBody(b);
    if (r.arme && r.arme.body && W) W.removeBody(r.arme.body);
    ragdolls.delete(r);
  }

  // ---- Os ← solides (chaque image, pour un soldat mort en ragdoll) -------------------------------------------------------
  // Renvoie vrai si le ragdoll gère ce soldat (le jeu ne joue alors pas l'animation de chute).
  R.anime = function (u, m, dt) {
    const r = m.rag; if (!r) return false;
    if (u.alive) { liberer(m); return false; }
    if (r.etat === 'attente') {
      if (!R.dispo()) { m.rag = null; return false; }
      r.attente -= dt;
      if (r.attente > 0) { m.update(dt, false); m.placeWeapon(true, 0, 'deux'); return true; }
      if (!demarrer(u, m)) return false;
    }
    if (r.etat !== 'physique') return false;
    if (!r.fige) { appliquer(r, m); if (r.aFiger) { figer(r); } }
    else if (!r.posee && !r.erreur) { appliquer(r, m); }
    r.posee = r.fige;
    return true;
  };
  const _M = root.THREE ? new THREE.Matrix4() : null, _S = root.THREE ? new THREE.Matrix4() : null, _P = root.THREE ? new THREE.Matrix4() : null;
  const _p = root.THREE ? new THREE.Vector3() : null, _s = root.THREE ? new THREE.Vector3() : null, _one = root.THREE ? new THREE.Vector3(1, 1, 1) : null;
  function appliquer(r, m) {
    const sk = m.skinned.skeleton, Mo = r.Mo, k = r.k, sc = _s.set(k, k, k);
    for (let i = 0; i < SEGS.length; i++) {
      const b = r.corps[i], bone = sk.bones[Mo.os[i]];
      const pos = b.interpolatedPosition || b.position, qu = b.interpolatedQuaternion || b.quaternion;
      // S = T(centre) R(q) S(k) T(−c) ; monde de l'os = S × lié
      _q.set(qu.x, qu.y, qu.z, qu.w); _p.set(pos.x, pos.y, pos.z);
      _S.compose(_p, _q, sc); _M.makeTranslation(-r.centres[i].x, -r.centres[i].y, -r.centres[i].z); _S.multiply(_M).multiply(Mo.lie[i]);
      bone.parent.updateWorldMatrix(true, false);
      _P.copy(bone.parent.matrixWorld).invert().multiply(_S);
      _P.decompose(_v, _q, _p);
      bone.quaternion.copy(_q); if (i === 0) bone.position.copy(_v);
      bone.updateMatrixWorld(true);
    }
    if (r.arme) {
      const w = m.weapon, tenue = !r.arme.body, b = tenue ? r.corps[IDX.avbrasD] : r.arme.body, pos = b.interpolatedPosition || b.position, qu = b.interpolatedQuaternion || b.quaternion;
      _q.set(qu.x, qu.y, qu.z, qu.w); _p.set(pos.x, pos.y, pos.z);
      if (tenue) _S.compose(_p, _q, _one).multiply(r.arme.rel);
      else { _S.compose(_p, _q, r.arme.sc); _M.makeTranslation(-r.arme.c.x, -r.arme.c.y, -r.arme.c.z); _S.multiply(_M); }
      w.parent.updateWorldMatrix(true, false); _P.copy(w.parent.matrixWorld).invert().multiply(_S); _P.decompose(w.position, w.quaternion, w.scale);
      w.updateMatrixWorld(true);
    }
    void _one;
  }
  function liberer(m) {
    const r = m.rag; m.rag = null; if (!r) return;
    if (r.etat === 'physique') { figer(r); for (const [o, q, p] of r.sauve) { o.quaternion.copy(q); o.position.copy(p); } }
  }
  R.liberer = liberer;
  // diagnostic (pages d'outils) : écart des pivots (m), point le plus bas des solides, état
  R.diag = function (m) {
    const r = m && m.rag; if (!r || !r.corps) return null;
    let ecart = 0, bas = 1e9; const C = root.CANNON, wa = new C.Vec3(), wb = new C.Vec3();
    for (const j of r.art) { j.a.pointToWorldFrame(j.pA, wa); j.b.pointToWorldFrame(j.pB, wb); ecart = Math.max(ecart, wa.distanceTo(wb)); }
    for (const b of r.corps) { b.updateAABB(); bas = Math.min(bas, b.aabb.lowerBound.y); }
    return { t: +r.t.toFixed(2), ecart: +ecart.toFixed(3), bas: +bas.toFixed(3), fige: r.fige, erreur: !!r.erreur, cible: r.cible || null, creationMs: +(r.msCreation || 0).toFixed(1) };
  };
  R.actifs = () => ragdolls.size;
  // mesures des modèles faites à l'avance, au repos (sinon ~30 ms à la première mort)
  R.prechauffer = function () {
    if (!R.dispo() || !OT.Soldat3D || !OT.Soldat3D.ready) return;
    for (const nom in OT.Soldat3D.modeles) { try { const f = OT.Soldat3D.create({ modele: nom, weapon: null }); if (f) mesurer(f); } catch (e) { console.warn('ragdoll (mesures) :', e); } }
  };
  if (OT.Soldat3D && OT.Soldat3D.whenReady) OT.Soldat3D.whenReady(() => { const go = () => R.prechauffer(); if (root.requestIdleCallback) root.requestIdleCallback(go, { timeout: 4000 }); else setTimeout(go, 500); });
  OT.Ragdoll = R;
})(typeof window !== 'undefined' ? window : globalThis);
