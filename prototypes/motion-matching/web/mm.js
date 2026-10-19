// Prototype motion matching — un soldat, clavier ou chemin, indicateur de glissement des pieds.
// Données : web/base.json + web/base.bin (fabriqués par outils/preparer.py à partir de 100STYLE, CC BY 4.0).
// Rien ici ne touche au jeu : fichiers copiés, pas importés.
(function () {
  const VERSION = 15;
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const Q = () => new THREE.Quaternion();
  const UP = V3(0, 1, 0), FWD = V3(0, 0, 1);
  const halflife2damping = (h) => 4 * Math.LN2 / Math.max(1e-5, h);

  // -------------------------------------------------------------------------------------------- ressorts (Holden)
  // position / vitesse / accélération poussées vers une vitesse cible (ressort critique)
  function ressortVitesse(x, v, a, vGoal, h, dt) {
    const y = halflife2damping(h) / 2, j0 = v.clone().sub(vGoal), j1 = a.clone().addScaledVector(j0, y), e = Math.exp(-y * dt);
    const nx = x.clone().add(j1.clone().multiplyScalar(-1 / (y * y)).add(j0.clone().negate().addScaledVector(j1, -dt).multiplyScalar(1 / y)).multiplyScalar(e))
      .add(j1.clone().multiplyScalar(1 / (y * y))).add(j0.clone().multiplyScalar(1 / y)).addScaledVector(vGoal, dt);
    const nv = j0.clone().addScaledVector(j1, dt).multiplyScalar(e).add(vGoal);
    const na = a.clone().addScaledVector(j1, -y * dt).multiplyScalar(e);
    return [nx, nv, na];
  }
  // angle (scalaire) poussé vers une cible, avec vitesse angulaire
  function ressortAngle(x, v, goal, h, dt) {
    const y = halflife2damping(h) / 2; let j0 = x - goal; while (j0 > Math.PI) j0 -= 2 * Math.PI; while (j0 < -Math.PI) j0 += 2 * Math.PI;
    const j1 = v + j0 * y, e = Math.exp(-y * dt);
    return [e * (j0 + j1 * dt) + goal, e * (v - j1 * y * dt)];
  }
  // décroissance d'un écart (inertialisation) : x,v → 0
  function decroit(x, v, h, dt) {
    const y = halflife2damping(h) / 2, e = Math.exp(-y * dt);
    for (let i = 0; i < x.length; i++) { const j1 = v[i] + x[i] * y; x[i] = e * (x[i] + j1 * dt); v[i] = e * (v[i] - j1 * y * dt); }
  }
  // quaternion ↔ vecteur rotation
  function qToRotVec(q, out) {
    if (q.w < 0) { q.x = -q.x; q.y = -q.y; q.z = -q.z; q.w = -q.w; }          // chemin le plus court
    const s = Math.sqrt(Math.max(0, 1 - Math.min(1, q.w * q.w))); if (s < 1e-6) return out.set(0, 0, 0);
    const a = 2 * Math.atan2(s, Math.min(1, q.w)); return out.set(q.x / s * a, q.y / s * a, q.z / s * a);
  }
  function rotVecToQ(v, out) { const a = v.length(); if (a < 1e-8) return out.set(0, 0, 0, 1); const s = Math.sin(a / 2) / a; return out.set(v.x * s, v.y * s, v.z * s, Math.cos(a / 2)); }

  // -------------------------------------------------------------------------------------------- base de données
  const Base = {};
  async function chargerBase() {
    const meta = await (await fetch('base.json')).json();
    const buf = await (await fetch((window.FICHIERS || {}).base || 'base.bin')).arrayBuffer();
    const N = meta.N, J = meta.os.length, nF = meta.nFiche, stride = meta.octetsParImage;
    const dv = new DataView(buf);
    const q = new Float32Array(N * J * 4), hy = new Float32Array(N), v = new Float32Array(N * 3), w = new Float32Array(N), fiche = new Float32Array(N * nF);
    for (let i = 0; i < N; i++) {
      let o = i * stride;
      for (let k = 0; k < J * 4; k++, o += 2) q[i * J * 4 + k] = dv.getInt16(o, true) / 32767;
      hy[i] = dv.getFloat32(o, true); o += 4;
      for (let k = 0; k < 3; k++, o += 4) v[i * 3 + k] = dv.getFloat32(o, true);
      w[i] = dv.getFloat32(o, true); o += 4;
      for (let k = 0; k < nF; k++, o += 4) fiche[i * nF + k] = dv.getFloat32(o, true);
    }
    // fiches normalisées et pondérées
    const POIDS = new Float32Array(nF); const fn = new Float32Array(N * nF);
    Base.ponderer = (p) => {       // p = { pieds, vPieds, vHanches, traj, dir }
      for (let k = 0; k < nF; k++) POIDS[k] = k < 6 ? p.pieds : k < 12 ? p.vPieds : k < 15 ? p.vHanches : k < 21 ? p.traj : p.dir;
      for (let i = 0; i < N; i++) for (let k = 0; k < nF; k++) fn[i * nF + k] = (fiche[i * nF + k] - meta.moyenne[k]) / meta.ecartType[k] * POIDS[k];
    };
    Base.ponderer(PARAMS.poids);
    // séquence et style de chaque image, et « image utilisable » (pas trop près de la fin : la trajectoire future doit exister)
    const seq = new Int16Array(N), style = new Uint8Array(N), ok = new Uint8Array(N), repos = new Uint8Array(N);
    meta.sequences.forEach((s, si) => { const r = /_ID\./.test(s.nom) ? 1 : 0; for (let i = s.debut; i < s.fin; i++) { seq[i] = si; style[i] = s.style; ok[i] = i < s.fin - 35 ? 1 : 0; repos[i] = r; } });
    const contact = new Uint8Array(N); for (let i = 0; i < N; i++) contact[i] = +meta.contact[i];
    Object.assign(Base, { meta, N, J, nF, q, hy, v, w, fiche, fn, seq, style, ok, repos, contact, POIDS });
    return Base;
  }

  // recherche brute : la meilleure image pour une requête normalisée (seulement le style demandé)
  function chercher(req, styleVoulu, seulRepos) {
    const { N, nF, fn, ok, style, repos } = Base; let best = -1, bc = Infinity;
    for (let i = 0; i < N; i++) {
      if (!ok[i] || style[i] !== styleVoulu || (seulRepos && !repos[i])) continue;
      let c = 0; const o = i * nF;
      for (let k = 0; k < nF; k++) { const d = fn[o + k] - req[k]; c += d * d; if (c >= bc) break; }
      if (c < bc) { bc = c; best = i; }
    }
    return [best, bc];
  }
  function cout(i, req) { const { nF, fn } = Base; let c = 0; const o = i * nF; for (let k = 0; k < nF; k++) { const d = fn[o + k] - req[k]; c += d * d; } return c; }

  // IK deux os : tourne H (racine) et K (milieu) pour amener A (extrémité) sur cibleA ; garde l'orientation mondiale de A.
  // Construction géométrique directe (triangle des longueurs) : le coude/genou reste dans le plan de flexion actuel quand il
  // est bien défini, sinon du côté de `pole` (coudes vers le bas, genoux vers l'avant). La cible est ramenée à portée.
  function ikDeuxOs(H, K, A, cibleA, pole) {
    const pH = H.getWorldPosition(V3()), pK = K.getWorldPosition(V3()), pA = A.getWorldPosition(V3());
    const a = pK.distanceTo(pH), b = pA.distanceTo(pK);
    const maxC = (a + b) * 0.985, d = cibleA.clone().sub(pH), dist = d.length();
    if (dist > maxC) d.setLength(maxC); if (dist < Math.abs(a - b) * 1.05) d.setLength(Math.abs(a - b) * 1.05);
    const c = d.length(), cible = pH.clone().add(d), dirC = d.clone().normalize();
    const HK = pK.clone().sub(pH), HA = pA.clone().sub(pH), KA = pA.clone().sub(pK);
    // axe de flexion : plan actuel si net, sinon par rapport au pôle
    let axe = HK.clone().cross(HA);
    // Convention : HK = rot(dirC, −a1) autour de l'axe, donc l'axe vaut (côté de flexion) × dirC. Si le plan naturel est
    // plat (membre tendu) ou si l'articulation serait du mauvais côté du pôle (coude vers le haut, genou en arrière),
    // on prend le côté du pôle.
    const cote = pole ? pole.clone().addScaledVector(dirC, -pole.dot(dirC)) : null;
    if (axe.lengthSq() < 1e-4 * a * a * Math.max(1e-6, HA.lengthSq())) axe = (cote && cote.lengthSq() > 1e-6 ? cote.clone() : V3(0, 0, 1)).cross(dirC);
    if (axe.lengthSq() < 1e-8) axe = V3(0, 1, 0).cross(dirC); if (axe.lengthSq() < 1e-8) axe = V3(1, 0, 0);
    axe.addScaledVector(dirC, -axe.dot(dirC)); if (axe.lengthSq() < 1e-8) axe = V3(0, 1, 0).cross(dirC); axe.normalize();   // perpendiculaire à la nouvelle direction : le triangle se ferme exactement
    if (cote && cote.lengthSq() > 1e-6) { const axePole = cote.clone().cross(dirC).normalize(); if (axe.dot(axePole) < 0) axe.copy(axePole); }
    const a1 = Math.acos(Math.max(-1, Math.min(1, (a * a + c * c - b * b) / (2 * a * c))));
    const dirHK2 = dirC.clone().applyAxisAngle(axe, -a1);                       // HK = rot(HA, −angle) dans la convention axe = HK×HA
    const pK2 = pH.clone().addScaledVector(dirHK2, a);
    const qA = A.getWorldQuaternion(Q());
    const rH = Q().setFromUnitVectors(HK.clone().normalize(), dirHK2);
    const wH = rH.clone().multiply(H.getWorldQuaternion(Q()));
    const KA2 = KA.clone().applyQuaternion(rH).normalize(), dirKA2 = cible.clone().sub(pK2).normalize();
    const rK = Q().setFromUnitVectors(KA2, dirKA2);
    const wK = rK.clone().multiply(rH).multiply(K.getWorldQuaternion(Q()));
    H.quaternion.copy(H.parent.getWorldQuaternion(Q()).invert().multiply(wH)); H.updateMatrixWorld(true);
    K.quaternion.copy(K.parent.getWorldQuaternion(Q()).invert().multiply(wK)); K.updateMatrixWorld(true);
    A.quaternion.copy(A.parent.getWorldQuaternion(Q()).invert().multiply(qA)); A.updateMatrixWorld(true);
  }

  // Places des mains sur le fusil, reprises du jeu (web/soldat3d.js, PRISE) : dans le repère de l'arme (+Z bouche, +Y dessus, m),
  // A = direction poignet → jointure du majeur, N = normale de la paume, mcp = position de la jointure du majeur.
  const PRISE = {
    R: { A: [0.303, 0.024, 0.953], N: [0.87, 0.401, -0.287], mcp: [-0.044, -0.049, -0.127] },
    L: { A: [-0.816, 0.149, 0.559], N: [0.106, 0.988, -0.109], mcp: [-0.036, 0.002, 0.174] },
    soldat: { L: { A: [-0.885, 0.06, 0.462], N: [0.225, 0.923, 0.311], mcp: [-0.042, 0.04, 0.154] } },
    gign: { R: { A: [0.008, 0.261, 0.965], N: [1, 0.027, -0.015], mcp: [-0.04, -0.039, -0.131] }, L: { A: [-0.88, 0.12, 0.459], N: [0.274, 0.918, 0.286], mcp: [-0.048, 0.044, 0.14] } },
  };

  // -------------------------------------------------------------------------------------------- personnage (retarget)
  class Soldat {
    constructor(gltf) {
      this.group = new THREE.Group(); this.group.add(gltf.scene);
      const sc = gltf.scene; sc.updateMatrixWorld(true);
      const b = (n) => sc.getObjectByName('mixamorig' + n) || sc.getObjectByName('mixamorig:' + n);
      this.os = Base.meta.os.map(b);
      this.hips = this.os[0];
      // pose de liaison du modèle : lue dans le skin (inverseBindMatrices), pas dans la pose par défaut des nœuds (qui
      // peut être n'importe quelle pose). Rotation mondiale de chaque os et position, puis direction vers l'enfant.
      let skin = null; sc.traverse(o => { if (o.isSkinnedMesh && !skin) skin = o; });
      const bindMonde = (bone) => {
        const i = skin.skeleton.bones.indexOf(bone); if (i < 0) return null;
        return skin.skeleton.boneInverses[i].clone().invert().premultiply(skin.bindMatrix);
      };
      const bindPos = (bone) => { const m = bindMonde(bone); return m ? V3().setFromMatrixPosition(m) : bone.getWorldPosition(V3()); };
      this.bindQ = this.os.map(o => { const m = bindMonde(o); const q = Q(); if (m) { m.decompose(V3(), q, V3()); } else o.getWorldQuaternion(q); return q; });
      const bind = Base.meta.bind;
      this.align = Base.meta.os.map((n, k) => {
        const o = this.os[k]; if (!o || !bind[n]) return Q();
        const enfants = { Hips: 'Spine', Head: 'HeadTop_End', LeftHand: 'LeftHandMiddle1', RightHand: 'RightHandMiddle1', LeftToeBase: 'LeftToe_End', RightToeBase: 'RightToe_End' };
        let e = enfants[n] ? b(enfants[n]) : null;
        if (!e) e = o.children.find(c => /mixamorig/.test(c.name)) || null;
        // pieds et orteils : on garde l'inclinaison propre du modèle (sinon la semelle prend l'angle du pied Geno → « chaussures de lutin »)
        if (!e || n === 'Hips' || /Foot$|ToeBase$/.test(n)) return Q();
        const dT = bindPos(e).sub(bindPos(o)).normalize();
        const g = bind[n]; const dG = V3().fromArray(g.posEnfant).sub(V3().fromArray(g.pos)).normalize();
        return Q().setFromUnitVectors(dG, dT);          // A : direction Geno → direction modèle
      });
      // rotation mondiale de chaque os de Geno dans SA pose de liaison (les rotations des BVH sont relatives à un repos
      // « tous les os vers +Y », pas à cette pose) : on travaille avec l'écart par rapport à la liaison
      this.genoBindInv = Base.meta.os.map(n => bind[n] ? Q().fromArray(bind[n].quat).invert() : Q());
      // échelle verticale : hanches modèle / hanches Geno
      // échelle : hauteur hanches→orteils du modèle / celle de Geno, et décalage pour poser les orteils au sol du modèle
      const hipsY = bindPos(this.hips).y, toeY = Math.min(bindPos(b('LeftToeBase')).y, bindPos(b('RightToeBase')).y);
      const genoToeY = Math.min(bind.LeftToeBase.pos[1], bind.RightToeBase.pos[1]);
      this.echelle = (hipsY - toeY) / (bind.Hips.pos[1] - genoToeY); this.solY = toeY - genoToeY * this.echelle;
      this.diag = { hipsY, bras: this.align[Base.meta.os.indexOf('LeftArm')].clone(), cuisse: this.align[Base.meta.os.indexOf('LeftUpLeg')].clone() };
      // os parents (dans notre liste) pour composer les rotations mondiales sans recalcul complet
      this.parentIdx = this.os.map(o => { let p = o.parent; while (p) { const k = this.os.indexOf(p); if (k >= 0) return k; p = p.parent; } return -1; });
      this.worldQ = this.os.map(() => Q());
      this.hipsParentQ = Q(); this.racineInv = new THREE.Matrix4();
      this.pos = V3(); this.yaw = 0;
      // offsets d'inertialisation (vecteurs rotation + vitesses) par os, et pour la hauteur des hanches
      this.offR = this.os.map(() => V3()); this.offRv = this.os.map(() => V3()); this.offY = [0]; this.offYv = [0];
      this.hLife = 0.15;
      this.tmpQ = Q(); this.tmpQ2 = Q(); this.tmpV = V3();
      this.orteils = [b('LeftToeBase'), b('RightToeBase')];
      this.jambes = [['LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase'], ['RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase']].map(l => l.map(b));
      this.verrous = [{ actif: false, poids: 0, cible: V3() }, { actif: false, poids: 0, cible: V3() }];
      this.mains = { D: [b('RightArm'), b('RightForeArm'), b('RightHand')], G: [b('LeftArm'), b('LeftForeArm'), b('LeftHand')] };
      this.fusil = null; this.gltf = gltf;
      // doigts (tous les os sous les mains) : pose de repos mémorisée
      this.doigts = []; for (const h of [this.mains.D[2], this.mains.G[2]]) if (h) h.traverse(o => { if (o !== h && o.isBone) this.doigts.push({ os: o, repos: o.quaternion.clone() }); });
    }
    // Repère de la main dans sa pose de liaison (règle du jeu, calculerPrise) : doigts reconnus par leur position (pouce = base
    // la plus proche du poignet), axe = poignet → base du majeur, normale = côté où les doigts se plient. Puis, avec PRISE,
    // la rotation et la position de la main dans le repère de l'arme.
    priseJeu(nomModele) {
      let skin = null; this.gltf.scene.traverse(o => { if (o.isSkinnedMesh && !skin) skin = o; });
      const bones = skin.skeleton.bones, bindW = bones.map((b, i) => skin.skeleton.boneInverses[i].clone().invert());
      const out = {};
      for (const [k, side] of [['D', 'Right'], ['G', 'Left']]) {
        const H = this.mains[k][2]; const hi = bones.indexOf(H); if (hi < 0) return null;
        const HbI = bindW[hi].clone().invert();
        const rel = (b) => V3().setFromMatrixPosition(HbI.clone().multiply(bindW[bones.indexOf(b)]));
        const chaines = H.children.filter(b => b.isBone && bones.includes(b)).map(b => { const c = [b]; while (c.length < 4) { const n = c[c.length - 1].children.find(x => x.isBone); if (!n) break; c.push(n); } return c; }).filter(c => c.length >= 4);
        if (chaines.length !== 5) return null;
        const bases = chaines.map(c => rel(c[0])), moy = bases.reduce((a, b) => a.add(b.clone()), V3()).multiplyScalar(1 / 5), axe = moy.clone().normalize();
        const ip = bases.map((b, i) => [i, b.dot(axe)]).sort((a, b) => a[1] - b[1])[0][0];
        const autres = [0, 1, 2, 3, 4].filter(i => i !== ip), cote = bases[ip].clone().addScaledVector(axe, -bases[ip].dot(axe));
        autres.sort((a, b) => bases[b].dot(cote) - bases[a].dot(cote));
        const I1 = bases[autres[0]], P1 = bases[autres[3]], M1 = bases[autres[1]];
        const N = V3().crossVectors(I1.clone().sub(P1), M1).normalize();
        if (rel(chaines[ip][3]).sub(M1).dot(N) < 0) N.negate();
        const Aloc = M1.clone().normalize();
        const pr = Object.assign({}, PRISE[side[0] === 'R' ? 'R' : 'L'], (PRISE[nomModele] || {})[side[0] === 'R' ? 'R' : 'L'] || {});
        const A = V3().fromArray(pr.A).normalize(), Nn = V3().fromArray(pr.N), mcp = V3().fromArray(pr.mcp);
        // bases orthonormées (axe, normale redressée, troisième) dans la main et dans l'arme ; rotation main→arme
        const base = (a, n) => { const u = n.clone().addScaledVector(a, -n.dot(a)).normalize(); return new THREE.Matrix4().makeBasis(a, u, V3().crossVectors(a, u)); };
        const R = base(A, Nn).multiply(base(Aloc, N).transpose());
        const q = Q().setFromRotationMatrix(R);
        const pos = mcp.clone().sub(M1.clone().applyQuaternion(q));          // position de l'os de la main dans le repère de l'arme
        out[k] = { pos, q };
      }
      return out;
    }
    // Prise de référence : première image du clip « Rifle_Aim_Turn_Right » (mains refermées sur une arme). On y place le
    // fusil par la règle du jeu (poignée dans la paume droite, axe vers la paume gauche, dessus vers le haut) et on note où
    // est chaque main par rapport à l'arme, plus la pose des doigts. Au jeu : fusil placé → mains et doigts suivent.
    mesurerPrise() {
      const clip = (this.gltf.animations || []).find(c => c.name === 'Rifle_Aim_Turn_Right') || (this.gltf.animations || [])[0];
      if (!clip || !this.fusil) return;
      const sc = this.gltf.scene, mx = new THREE.AnimationMixer(sc); mx.clipAction(clip).play(); mx.setTime(0); sc.updateMatrixWorld(true);
      const D = this.mains.D[2], G = this.mains.G[2];
      const pR = this.paume(this.mains.D), pL = this.paume(this.mains.G);
      const w = this.fusil, a = w.forePt.clone().sub(w.gripPt).normalize(), bv = pL.clone().sub(pR).normalize();
      const q = Q().setFromUnitVectors(a, bv);
      const up = V3(0, 1, 0).applyQuaternion(q), upRef = V3(0, 1, 0).projectOnPlane(bv).normalize(), upCur = up.clone().projectOnPlane(bv).normalize();
      if (upRef.lengthSq() > 1e-6 && upCur.lengthSq() > 1e-6) q.premultiply(Q().setFromUnitVectors(upCur, upRef));
      const pos = pR.clone().sub(w.gripPt.clone().applyQuaternion(q));
      const inv = q.clone().invert();
      this.prise = {};
      for (const [k, h] of [['D', D], ['G', G]]) {
        this.prise[k] = { pos: h.getWorldPosition(V3()).sub(pos).applyQuaternion(inv), q: inv.clone().multiply(h.getWorldQuaternion(Q())) };
      }
      for (const d of this.doigts) d.prise = d.os.quaternion.clone();
      mx.stopAllAction(); mx.uncacheRoot(sc);
      const pj = this.priseJeu(this.nomModele || 'gign'); if (pj) { this.prise = pj; this.priseSource = 'jeu'; } else this.priseSource = 'clip';
      for (const d of this.doigts) d.os.quaternion.copy(d.repos);
      sc.updateMatrixWorld(true);
    }
    // fusil du jeu (même règle que le jeu : poignée dans la paume droite, axe poignée→garde-main vers la paume gauche, dessus
    // vers le haut), puis la main gauche est amenée sur le garde-main par IK du bras gauche
    equiperFusil(gltf) {
      const w = new THREE.Group(), c = gltf.scene, b3 = new THREE.Box3().setFromObject(c), ctr = b3.getCenter(V3());
      const s = 0.86 / (b3.max.x - b3.min.x); c.position.set(-ctr.x, -ctr.y, -ctr.z);
      const k = new THREE.Group(); k.add(c); k.scale.setScalar(s); k.rotation.y = Math.PI / 2; w.add(k);
      c.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
      const P = (x, y) => V3(0, (y - ctr.y) * s, -(x - ctr.x) * s);
      w.gripPt = P(0.36, -0.08); w.forePt = P(-0.40, 0.12); w.buttPt = P(b3.max.x, 0.05);
      this.fusil = w; this.group.add(w); w.visible = false;
      this.fusilUp = V3(0, 1, 0);
    }
    // paume : un peu au-delà de l'os de la main (vers les doigts), centre de la prise
    paume(main) { const h = main[2], e = h.children.find(x => /Middle1|Index1/.test(x.name)) || h.children[0]; const p = h.getWorldPosition(V3()); if (e) p.lerp(e.getWorldPosition(V3()), 0.6); return p; }
    tenirFusil(actif, dt) {
      const w = this.fusil; if (!w) return;
      // fondu : la prise s'installe / se défait en ~0,25 s (mains, doigts), le fusil apparaît quand la prise est à moitié faite
      this.poidsArme = Math.max(0, Math.min(1, (this.poidsArme ?? 0) + (actif ? 1 : -1) * dt / 0.25));
      const pa = this.poidsArme; w.visible = pa > 0.5;
      if (pa <= 0) { for (const d of this.doigts) d.os.quaternion.copy(d.repos); this.fusilPos = null; return; }
      const D = this.mains.D, G = this.mains.G; if (D.some(x => !x) || G.some(x => !x)) return;
      // deux ports : low ready (défaut) et épaulé en visée (regard verrouillé) ; fondu entre les deux
      this.poidsVisee = Math.max(0, Math.min(1, (this.poidsVisee ?? 0) + ((this.viseeEpaulee ? 1 : -1) * dt / 0.3)));
      const pv = this.poidsVisee, L = PARAMS.fusil, E = PARAMS.epaule;
      const P = { vrille: L.vrille, avant: L.avant + (E.avant - L.avant) * pv, droite: L.droite + (E.droite - L.droite) * pv, haut: L.haut + (E.haut - L.haut) * pv, tangage: L.tangage + (E.tangage - L.tangage) * pv, cant: L.cant + (E.cant - L.cant) * pv, buste: L.buste, lissage: L.lissage, appuiZ: L.appuiZ, torsion: L.torsion };
      // Low ready comme un vrai tireur : la CROSSE reste dans le creux de l'épaule droite, le canon pivote vers le bas.
      // Direction : le regard du soldat (ses hanches), un peu mélangé au buste pour vivre avec la marche ; léger cant vers
      // l'intérieur (le fusil barre la poitrine).
      const ep = this.mains.D[0].getWorldPosition(V3());                                   // articulation de l'épaule droite
      const avant = V3(0, 0, 1).applyQuaternion(this.worldQ[0]); avant.y = 0; avant.normalize();
      const sp = this.os[Base.meta.os.indexOf('Spine2')]; const qS = sp.getWorldQuaternion(Q());
      const avantBuste = V3(0, 0, 1).applyQuaternion(qS).applyQuaternion(this.align[Base.meta.os.indexOf('Spine2')]); avantBuste.y = 0; avantBuste.normalize();
      const dir = avant.clone().lerp(avantBuste, P.buste).normalize();
      const droite = dir.clone().cross(V3(0, 1, 0)).normalize();
      const yaw = Math.atan2(dir.x, dir.z) + P.cant;
      // (direction de l'arme déjà fixée) Position « bladée » : le tronc vrille vers la droite (épaule gauche en avant) comme un tireur, ce qui rapproche la
      // main d'appui du garde-main. Répartie sur Spine / Spine1 / Spine2, proportionnelle au poids de la prise.
      if (P.vrille) {
        const ang = P.vrille * pa / 3, qv = Q().setFromAxisAngle(V3(0, 1, 0), -ang);
        for (const n of ['Spine', 'Spine1', 'Spine2']) { const o = this.os[Base.meta.os.indexOf(n)]; if (!o) continue; const wq = o.getWorldQuaternion(Q()); o.quaternion.copy(o.parent.getWorldQuaternion(Q()).invert().multiply(qv).multiply(wq)); o.updateMatrixWorld(true); }
        this.group.updateMatrixWorld(true);
      }
      const q = Q().setFromAxisAngle(V3(0, 1, 0), yaw).multiply(Q().setFromAxisAngle(V3(1, 0, 0), -P.tangage));
      const ep2 = this.mains.D[0].getWorldPosition(V3());
      const creux = ep2.clone().addScaledVector(dir, P.avant).addScaledVector(droite, P.droite).add(V3(0, P.haut, 0));
      if (!this.fusilPos) { this.fusilPos = creux.clone(); this.fusilQ = q.clone(); }
      const k = 1 - Math.exp(-dt / P.lissage); this.fusilPos.lerp(creux, k); this.fusilQ.slerp(q, k);
      w.quaternion.copy(this.fusilQ); w.position.copy(this.fusilPos).sub(w.buttPt.clone().applyQuaternion(this.fusilQ));
      // mains : placées sur l'arme comme dans la prise de référence (IK deux os vers la position, orientation reportée)
      for (const [main, k] of [[D, 'D'], [G, 'G']]) {
        if (!this.prise) break;
        const pr = this.prise[k];
        const posPr = pr.pos.clone(); if (k === 'G' && P.appuiZ != null) posPr.z = P.appuiZ;      // main d'appui : position choisie sur le garde-main
        let cible = w.position.clone().add(posPr.applyQuaternion(this.fusilQ));
        const mainData = main[2].getWorldPosition(V3()), qData = main[2].getWorldQuaternion(Q());   // pose de la capture (avant IK)
        if (k === 'G') {   // garde-main hors de portée : la main glisse vers l'arrière le long du canon jusqu'à pouvoir tenir
          const ep = main[0].getWorldPosition(V3()), portee = (main[1].getWorldPosition(V3()).distanceTo(ep) + main[2].getWorldPosition(V3()).distanceTo(main[1].getWorldPosition(V3()))) * 0.96;
          const axe = V3(0, 0, 1).applyQuaternion(this.fusilQ);
          for (let it = 0; it < 20 && cible.distanceTo(ep) > portee; it++) cible.addScaledVector(axe, -0.02);
        }
        cible = mainData.clone().lerp(cible, pa);
        ikDeuxOs(main[0], main[1], main[2], cible, V3(0, -1, 0).addScaledVector(dir, -0.4).normalize());
        const qw = qData.clone().slerp(this.fusilQ.clone().multiply(pr.q), pa);
        // orientation de la main sur l'arme ; la torsion du poignet est partagée avec l'avant-bras (il roule autour de son axe,
        // ce qui ne déplace pas la main) pour éviter un poignet vrillé
        const F = main[1]; let qLoc = F.getWorldQuaternion(Q()).invert().multiply(qw);          // main dans le repère de l'avant-bras
        const axe = V3(0, 1, 0);                                                                 // axe de l'os (Mixamo : +Y vers l'enfant)
        const twist = Q().set(qLoc.x * axe.x, qLoc.y * axe.y, qLoc.z * axe.z, qLoc.w).normalize();     // composante de torsion autour de l'axe
        if (twist.w < 0) { twist.x = -twist.x; twist.y = -twist.y; twist.z = -twist.z; twist.w = -twist.w; }
        const part = Q().slerp.call(Q(), twist, P.torsion);                                       // fraction de la torsion donnée à l'avant-bras
        F.quaternion.multiply(part); F.updateMatrixWorld(true);
        main[2].quaternion.copy(F.getWorldQuaternion(Q()).invert().multiply(qw)); main[2].updateMatrixWorld(true);
      }
      for (const d of this.doigts) if (d.prise) d.os.quaternion.copy(d.repos).slerp(d.prise, pa);
      // épaulé : la tête se penche vers la crosse (joue sur la crosse) et baisse un peu vers le viseur
      const tete = this.os[Base.meta.os.indexOf('Head')];
      if (tete && pv > 0.001) {
        const kT = pa * pv; const rDroite = droite.clone().negate();            // axe vers la gauche du tireur = -droite... (droite = dir × up pointe à droite)
        const qT = Q().setFromAxisAngle(droite, 0.18 * kT).multiply(Q().setFromAxisAngle(dir, 0.14 * kT));   // baisse (autour de l'axe droite) + roulis vers la droite
        tete.quaternion.copy(tete.parent.getWorldQuaternion(Q()).invert().multiply(qT).multiply(tete.getWorldQuaternion(Q()))); tete.updateMatrixWorld(true);
      }
      // repères de mise au point : poignée (jaune), garde-main (cyan), jointure du majeur visée (vert D, bleu G), bout d'os de main (rouge)
      if (PARAMS.debug) {
        if (!this.marques) { this.marques = {}; for (const [n, c] of [['grip', 0xffd54a], ['fore', 0x4ad5ff], ['mD', 0x55ff55], ['mG', 0x5555ff], ['hD', 0xff5555], ['hG', 0xff55ff]]) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), new THREE.MeshBasicMaterial({ color: c, depthTest: false })); m.renderOrder = 10; this.group.parent.add(m); this.marques[n] = m; } }
        const M = this.marques, fq = this.fusilQ, fp = w.position;
        M.grip.position.copy(fp).add(w.gripPt.clone().applyQuaternion(fq)); M.fore.position.copy(fp).add(w.forePt.clone().applyQuaternion(fq));
        if (this.prise) { M.mD.position.copy(fp).add(this.prise.D.pos.clone().applyQuaternion(fq)); M.mG.position.copy(fp).add(this.prise.G.pos.clone().applyQuaternion(fq)); }
        M.hD.position.copy(D[2].getWorldPosition(V3())); M.hG.position.copy(G[2].getWorldPosition(V3()));
      } else if (this.marques) { for (const k in this.marques) this.marques[k].visible = false; }
      this.group.updateMatrixWorld(true);
    }
    // verrouillage des pieds : quand la base dit « orteil en appui », on garde l'orteil là où il s'est posé (IK deux os).
    // Seulement à l'horizontale (la hauteur reste celle de l'animation), avec un écart qui s'installe et s'efface
    // en douceur, et qui faiblit si la jambe ne peut pas atteindre la cible : pas de pied qui remonte ni de rebond.
    verrouPieds(contacts, dt) {
      for (let k = 0; k < 2; k++) {
        const [H, K, A, T] = this.jambes[k]; const vr = this.verrous[k]; if (!H || !K || !A || !T) continue;
        if (!vr.delta) { vr.delta = V3(); vr.deltaV = V3(); }
        const pT = T.getWorldPosition(V3());
        if (contacts[k] && !vr.actif) { vr.actif = true; vr.cible.copy(pT); }
        if (!contacts[k]) vr.actif = false;
        if (vr.actif) {
          const voulu = vr.cible.clone().sub(pT); voulu.y = 0;
          const cap = PARAMS.verrouMax;                                            // au-delà, le pied « dérape » plutôt que d'être traîné
          if (voulu.length() > cap) { vr.cible.sub(voulu.clone().setLength(voulu.length() - cap)); voulu.setLength(cap); }
          // l'écart rejoint la valeur voulue avec une demi-vie courte (pas de saut à la pose du pied)
          const x = [vr.delta.x - voulu.x, 0, vr.delta.z - voulu.z], v = [vr.deltaV.x, 0, vr.deltaV.z];
          decroit(x, v, 0.04, dt); vr.delta.set(voulu.x + x[0], 0, voulu.z + x[2]); vr.deltaV.set(v[0], 0, v[2]);
        } else {
          const x = [vr.delta.x, 0, vr.delta.z], v = [vr.deltaV.x, 0, vr.deltaV.z];
          decroit(x, v, 0.08, dt); vr.delta.set(x[0], 0, x[2]); vr.deltaV.set(v[0], 0, v[2]);
        }
        if (vr.delta.lengthSq() < 1e-8) continue;
        // genou vers l'avant du personnage ; la cible est ramenée à portée par ikDeuxOs (jambe jamais tendue de force)
        const pA = A.getWorldPosition(V3());
        ikDeuxOs(H, K, A, pA.clone().add(vr.delta), V3(0, 0, 1).applyQuaternion(this.worldQ[0]));
      }
    }
    // pose cible (yaw retiré) de l'image i, mélangée avec l'image i+1 par t ∈ [0,1[ : retourne quats mondiaux + hauteur
    poseDe(i, t, outQ, outY) {
      const { q, hy, J } = Base; const i1 = Math.min(i + 1, Base.N - 1);
      for (let k = 0; k < J; k++) {
        const a = this.tmpQ.fromArray(q, (i * J + k) * 4), bq = this.tmpQ2.fromArray(q, (i1 * J + k) * 4);
        outQ[k].copy(a).slerp(bq, t).normalize();
      }
      outY[0] = hy[i] * (1 - t) + hy[i1] * t;
    }
    // commence une transition : mémorise l'écart ancienne pose → nouvelle pose
    transition(ancQ, ancY, nvQ, nvY) {
      for (let k = 0; k < Base.J; k++) {
        const d = this.tmpQ.copy(ancQ[k]).multiply(this.tmpQ2.copy(nvQ[k]).invert());
        qToRotVec(d, this.tmpV); this.offR[k].add(this.tmpV); this.offRv[k].set(0, 0, 0);
      }
      this.offY[0] += ancY[0] - nvY[0]; this.offYv[0] = 0;
    }
    // applique une pose (quats mondiaux yaw retiré, hauteur hanches) au squelette, avec yaw et position du personnage
    appliquer(poseQ, poseY, dt) {
      const yawQ = this.tmpQ.setFromAxisAngle(UP, this.yaw);
      decroit(this.offY, this.offYv, this.hLife, dt);
      for (let k = 0; k < Base.J; k++) {
        const o = this.os[k]; if (!o) continue;
        const x = [this.offR[k].x, this.offR[k].y, this.offR[k].z], v = [this.offRv[k].x, this.offRv[k].y, this.offRv[k].z];
        decroit(x, v, this.hLife, dt); this.offR[k].fromArray(x); this.offRv[k].fromArray(v);
        const offQ = rotVecToQ(this.offR[k], this.tmpQ2);
        // monde cible = yaw · offset · (Qgeno · QgenoBind⁻¹) · A⁻¹ · bind
        const w = this.worldQ[k].copy(yawQ).multiply(offQ).multiply(poseQ[k]).multiply(this.genoBindInv[k]).multiply(this.tmpQ2.copy(this.align[k]).invert()).multiply(this.bindQ[k]);
        const p = this.parentIdx[k];
        let parentQ;
        if (p >= 0) parentQ = this.worldQ[p]; else parentQ = o.parent.getWorldQuaternion(this.hipsParentQ);
        o.quaternion.copy(parentQ).invert().multiply(w);
      }
      // position des hanches
      const h = (poseY[0] + this.offY[0]) * this.echelle + this.solY;
      const monde = this.tmpV.set(this.pos.x, h, this.pos.z);
      this.hips.parent.updateWorldMatrix(true, false);
      this.hips.position.copy(this.hips.parent.worldToLocal(monde));
      this.group.updateMatrixWorld(true);
    }
  }

  // -------------------------------------------------------------------------------------------- contrôleur
  const nouveauControleur = () => ({
    pos: V3(), vel: V3(), acc: V3(), yaw: 0, yawV: 0, hPos: 0.25, hYaw: 0.15,
    touches: {}, visee: true, accroupi: false, chemin: null, cheminIdx: 0, camYaw: 0.6,
    vitesses: { marche: 1.25, course: 2.6, lat: 1.0 },
    direction() {
      const t = this.touches; let x = 0, z = 0;
      if (t['KeyW'] || t['KeyZ'] || t['ArrowUp']) z += 1; if (t['KeyS'] || t['ArrowDown']) z -= 1;
      if (t['KeyA'] || t['KeyQ'] || t['ArrowLeft']) x += 1; if (t['KeyD'] || t['ArrowRight']) x -= 1;
      if (!x && !z) return null;
      const d = V3(x, 0, z).normalize().applyAxisAngle(UP, this.camYaw);     // relatif à la caméra
      return d;
    },
    vitesseCible() {
      if (this.chemin && this.chemin.length) {
        const c = this.chemin[this.cheminIdx % this.chemin.length], d = c.clone().sub(this.pos); d.y = 0;
        if (d.length() < 0.35) { this.cheminIdx++; return this.vitesseCible(); }
        const v = this.touches['ShiftLeft'] || this.touches['ShiftRight'] ? this.vitesses.course : this.vitesses.marche;
        return d.normalize().multiplyScalar(v);
      }
      const d = this.direction(); if (!d) return V3();
      const sprint = this.touches['ShiftLeft'] || this.touches['ShiftRight'];
      let v = sprint ? this.vitesses.course : this.vitesses.marche;
      if (this.verrouRegard) v = Math.min(v, this.vitesses.lat);
      return d.multiplyScalar(v);
    },
    yawCible(vGoal) {
      // il regarde là où il va ; bouton droit de la souris maintenu : regard verrouillé sur la direction de la caméra
      // (pas de côté, recul) — la caméra seule ne fait jamais tourner le soldat
      if (this.verrouRegard && !(this.chemin && this.chemin.length)) return this.camYaw;
      if (vGoal.lengthSq() < 1e-4) return this.yaw;
      return Math.atan2(vGoal.x, vGoal.z);
    },
    // trajectoire prédite aux temps t (s) : positions et regards dans le repère MONDE
    predire(temps, vGoal, yGoal) {
      const P = [], D = [];
      for (const t of temps) {
        const [x] = ressortVitesse(this.pos, this.vel, this.acc, vGoal, this.hPos, t);
        const [y] = ressortAngle(this.yaw, this.yawV, yGoal, this.hYaw, t);
        P.push(x); D.push(V3(Math.sin(y), 0, Math.cos(y)));
      }
      return [P, D];
    },
    pas(dt) {
      const vGoal = this.vitesseCible(), yGoal = this.yawCible(vGoal);
      [this.pos, this.vel, this.acc] = ressortVitesse(this.pos, this.vel, this.acc, vGoal, this.hPos, dt);
      [this.yaw, this.yawV] = ressortAngle(this.yaw, this.yawV, yGoal, this.hYaw, dt);
      return [vGoal, yGoal];
    }
  });

  // -------------------------------------------------------------------------------------------- mesure du glissement
  class Glissement {
    constructor() { this.prec = [null, null]; this.enContact = [false, false]; this.cumul = 0; this.tContact = 0; this.fen = []; this.empreintes = []; this.instant = [0, 0]; }
    // glissement = vitesse horizontale de l'orteil pendant que la BASE dit « en appui » (même définition que sur les
    // données brutes, donc comparable : données seules ≈ 1,5 cm/s à l'arrêt, 6 en marche, 9 en course)
    mesurer(orteils, dt, contacts) {
      let inst = 0;
      orteils.forEach((o, k) => {
        const p = o.getWorldPosition(V3());
        if (contacts[k] && this.prec[k]) {
          const d = p.clone().sub(this.prec[k]); d.y = 0; const v = d.length() / dt;
          if (!this.enContact[k]) this.empreintes.push({ p: p.clone(), k, t: performance.now() });
          this.enContact[k] = true; this.cumul += d.length(); this.tContact += dt; this.instant[k] = v; inst = Math.max(inst, v);
        } else { this.enContact[k] = false; this.instant[k] = 0; }
        this.prec[k] = p;
      });
      this.fen.push([dt, inst]); while (this.fen.length > 120) this.fen.shift();
      return inst;
    }
    moyenneCm() { return this.tContact > 0 ? this.cumul / this.tContact * 100 : 0; }
    recentCm() { let s = 0, t = 0; for (const [dt, v] of this.fen) { s += v * dt; t += dt; } return t ? s / t * 100 : 0; }
  }

  // -------------------------------------------------------------------------------------------- scène
  let renderer, scene, camera, cam = { dist: 4.2, pitch: 0.42 }, horloge = 0;
  let seuilOrteil = 0.06; const traits = [], empreintesMesh = [];
  const HUD = {};
  const JOURNAL = window.JOURNAL = []; const PARAMS = window.PARAMS = { rattrapage: 0, margeSaut: 0.5, minSaut: 0.25, periode: 0.1, hLife: 0.15, verrou: true, margeRel: 0.8, verrouMax: 0.08, fusil: { avant: 0.06, droite: -0.08, haut: -0.03, tangage: -0.5, cant: 0.15, buste: 0.3, lissage: 0.06, appuiZ: 0.1, torsion: 0.6, vrille: 0.3 }, epaule: { avant: 0.05, droite: -0.07, haut: 0.07, tangage: -0.02, cant: 0.12 }, poids: { pieds: 2.0, vPieds: 1.5, vHanches: 1.0, traj: 1.0, dir: 1.5 } };

  // Un agent = un soldat animé + son contrôleur + son état de lecture dans la base. Le premier est piloté au clavier (ou par
  // son chemin), les autres suivent chacun un chemin : c'est la situation du jeu (IA).
  class Agent {
    constructor(soldat, ctl) {
      this.soldat = soldat; this.ctl = ctl;
      this.frame = Base.meta.sequences.find(s => /Swat_ID/.test(s.nom)).debut + 10; this.frameT = 0;
      this.poseQ = Base.meta.os.map(() => Q()); this.poseY = [0]; this.ancQ = Base.meta.os.map(() => Q()); this.ancY = [0];
      this.derniereRecherche = Math.random() * PARAMS.periode;   // recherches décalées entre agents
      this.dernierSaut = -1; this.styleCourant = -1; this.facteurRacine = 1; this.sauts = 0; this.sautsFen = []; this.glisse = new Glissement();
      soldat.poseDe(this.frame, 0, this.poseQ, this.poseY);
    }
    // requête : partie pose = fiche de l'image courante ; partie trajectoire = prédiction du contrôleur dans le repère du personnage
    requete(vGoal, yGoal) {
      const { nF, fn, meta, POIDS } = Base; const req = new Float32Array(nF);
      const o = this.frame * nF; for (let k = 0; k < 15; k++) req[k] = fn[o + k];
      const temps = meta.futur.map(f => f / meta.fps);
      const [P, D] = this.ctl.predire(temps, vGoal, yGoal);
      const inv = Q().setFromAxisAngle(UP, -this.soldat.yaw);
      for (let k = 0; k < 3; k++) {
        const p = P[k].clone().sub(this.soldat.pos); p.y = 0; p.applyQuaternion(inv); const d = D[k].clone().applyQuaternion(inv);
        req[15 + 2 * k] = p.x; req[16 + 2 * k] = p.z; req[21 + 2 * k] = d.x; req[22 + 2 * k] = d.z;
      }
      for (let k = 15; k < nF; k++) req[k] = (req[k] - meta.moyenne[k]) / meta.ecartType[k] * POIDS[k];
      return req;
    }
    pas(dt, now) {
      const S = this.soldat, Ctl = this.ctl;
      const [vGoal, yGoal] = Ctl.pas(dt);
      // recherche toutes les 0,1 s, ou tout de suite si on change de style
      const styleVoulu = Ctl.visee ? 2 : Ctl.accroupi ? 1 : 0;      // 2 = Swat (arme), 1 = accroupi (pas de données pour l'instant), 0 = neutre
      this.derniereRecherche += dt;
      if (this.derniereRecherche >= PARAMS.periode || styleVoulu !== this.styleCourant) {
        this.derniereRecherche = 0;
        const req = this.requete(vGoal, yGoal);
        // à l'arrêt voulu et presque atteint : on ne cherche que dans les séquences de repos (sinon ping-pong entre des
        // instants d'arrêt situés juste avant des départs, et piétinement)
        const f = this.frame, vitAnimCour = Math.hypot(Base.v[f * 3], Base.v[f * 3 + 2]);
        const auRepos = vGoal.lengthSq() < 0.01 && vitAnimCour < 0.35 && Ctl.vel.lengthSq() < 0.04;
        const [best, bc] = chercher(req, styleVoulu, auRepos);
        const cc = (Base.ok[f] && Base.style[f] === styleVoulu && (!auRepos || Base.repos[f])) ? cout(f, req) : Infinity;
        if (this === agents[0]) { JOURNAL.push([+horloge.toFixed(2), +cc.toFixed(1), +bc.toFixed(1), best, f]); if (JOURNAL.length > 400) JOURNAL.shift(); }
        // les marges évitent les sauts inutiles en régime établi ; mais si on veut avancer alors que l'animation est à l'arrêt
        // (départ, ou arrêt forcé à un virage), on prend la meilleure image sans marge : sinon un repos « atypique » peut
        // retenir le soldat indéfiniment (pose trop éloignée de tous les départs)
        const veutPartir = vGoal.lengthSq() > 0.25 && vitAnimCour < 0.2;
        const seuil = veutPartir ? cc : auRepos ? cc * 0.6 - PARAMS.margeSaut : cc * PARAMS.margeRel - PARAMS.margeSaut;   // au repos : très peu de sauts (pas de tressautement)
        if (best >= 0 && bc < seuil && Math.abs(best - f) > 2 && (horloge - this.dernierSaut >= (auRepos ? 1.0 : veutPartir ? 0.1 : PARAMS.minSaut) || styleVoulu !== this.styleCourant)) {
          this.dernierSaut = horloge; S.hLife = PARAMS.hLife;
          // transition : écart entre la pose courante (telle qu'affichée) et la nouvelle
          for (let k = 0; k < Base.J; k++) this.ancQ[k].copy(this.poseQ[k]); this.ancY[0] = this.poseY[0];
          this.frame = best; this.frameT = 0; S.poseDe(this.frame, 0, this.poseQ, this.poseY);
          S.transition(this.ancQ, this.ancY, this.poseQ, this.poseY); this.sauts++; this.sautsFen.push(now);
        }
        this.styleCourant = styleVoulu;
      }
      // avance dans la séquence
      this.frameT += dt * Base.meta.fps;
      while (this.frameT >= 1) { this.frameT -= 1; this.frame++; if (!Base.ok[this.frame] || Base.seq[this.frame] !== Base.seq[this.frame - 1]) { this.frame--; this.frameT = 0.999; break; } }
      S.poseDe(this.frame, this.frameT, this.poseQ, this.poseY);
      // déplacement par la racine de l'animation (vitesse locale → monde). La simulation du clavier est ensuite RECALÉE sur le
      // personnage : elle ne garde que sa vitesse (l'intention), jamais un écart de position — sinon la requête demande en
      // permanence « reviens de 30 cm » et le soldat marche tout seul, souvent à reculons.
      const { v, w } = Base; const i = this.frame;
      const vl = V3(v[i * 3], 0, v[i * 3 + 2]).applyAxisAngle(UP, S.yaw);
      // à l'arrêt voulu, la racine ne se déplace plus (les « repos » capturés contiennent de lents piétinements : 10 cm/s qui
      // feraient dériver le soldat de 50 cm en quelques secondes) ; le verrou des pieds garde les appuis en place
      const vGoalNul = vGoal.lengthSq() < 0.01 && Ctl.vel.lengthSq() < 0.04 && Math.hypot(v[i * 3], v[i * 3 + 2]) < 0.35;
      this.facteurRacine += ((vGoalNul ? 0 : 1) - this.facteurRacine) * Math.min(1, dt / 0.3);
      S.yaw += w[i] * dt * this.facteurRacine; S.pos.addScaledVector(vl, dt * this.facteurRacine);
      Ctl.pos.copy(S.pos); Ctl.yaw = S.yaw;
      S.appliquer(this.poseQ, this.poseY, dt);
      // appui = la base dit « en appui » ET l'orteil affiché est bas (juste après un saut de séquence, la pose affichée est
      // encore un mélange : un pied en l'air ne doit ni être verrouillé ni compter comme glissement)
      const cf = Base.contact[this.frame];
      const contacts = S.orteils.map((o, k) => !!(cf & (k ? 1 : 2)) && o.getWorldPosition(V3()).y < seuilOrteil);
      if (PARAMS.verrou) S.verrouPieds(contacts, dt);
      S.viseeEpaulee = !!Ctl.verrouRegard; S.tenirFusil(Ctl.visee, dt);
      this.inst = this.glisse.mesurer(S.orteils, dt, contacts);
      this.vGoal = vGoal; this.contacts = contacts;
      while (this.sautsFen.length && now - this.sautsFen[0] > 2000) this.sautsFen.shift();
    }
  }
  const agents = []; let gltfBuffer = null, fusilBuffer = null;

  async function chargerGLB(url) { return new Promise((ok, ko) => new THREEX.GLTFLoader().load(url, ok, undefined, ko)); }
  function fetchBuf(url) { return fetch(url).then(r => r.arrayBuffer()); }
  async function nouveauSoldat(pos, yaw) {
    const gltf = await new Promise((ok, ko) => new THREEX.GLTFLoader().parse(gltfBuffer.slice(0), '', ok, ko));
    gltf.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    const soldat = new Soldat(gltf); scene.add(soldat.group);
    if (fusilBuffer) { try { const gf = await new Promise((ok, ko) => new THREEX.GLTFLoader().parse(fusilBuffer.slice(0), '', ok, ko)); soldat.equiperFusil(gf); soldat.mesurerPrise(); } catch (e) { console.warn('fusil :', e); } }
    soldat.pos.copy(pos); soldat.yaw = yaw;
    const ctl = nouveauControleur(); ctl.pos.copy(pos); ctl.yaw = yaw;
    const A = new Agent(soldat, ctl); agents.push(A); return A;
  }

  async function init() {
    renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true; renderer.outputColorSpace = THREE.SRGBColorSpace; document.body.appendChild(renderer.domElement);
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x1b1f26); scene.fog = new THREE.Fog(0x1b1f26, 18, 40);
    camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.05, 100);
    const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x3a2f22, 0.9); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.6); sun.position.set(5, 9, 4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -16; sun.shadow.camera.right = sun.shadow.camera.top = 16; scene.add(sun);
    const sol = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x3c4149, roughness: 0.95 })); sol.rotation.x = -Math.PI / 2; sol.receiveShadow = true; scene.add(sol);
    const grille = new THREE.GridHelper(60, 60, 0x5a6270, 0x2c3139); grille.position.y = 0.002; scene.add(grille);
    HUD.etat = document.getElementById('etat'); HUD.jauge = document.getElementById('jauge'); HUD.jaugeTxt = document.getElementById('jaugeTxt'); HUD.msg = document.getElementById('msg');
    HUD.msg.textContent = 'Chargement de la base (13 Mo)…';
    await chargerBase();
    HUD.msg.textContent = 'Chargement du modèle…';
    gltfBuffer = await fetchBuf((window.FICHIERS || {}).modele || 'gign_hd.glb');
    try { fusilBuffer = await fetchBuf((window.FICHIERS || {}).fusil || 'fusil.glb'); } catch (e) { console.warn('fusil :', e); }
    const A0 = await nouveauSoldat(V3(0, 0, 0), 0);
    // hauteur de repos des orteils du modèle (pose de liaison) → seuil d'appui
    const yT = Math.min(...A0.soldat.orteils.map(o => o.getWorldPosition(V3()).y)); seuilOrteil = yT + 0.05;
    HUD.msg.textContent = '';
    evenements();
    MANUEL = /[?&]manual=1/.test(location.search);
    // API de test (mode manuel : ?manual=1) — pas de boucle automatique, on avance pas à pas ; les mesures portent sur l'agent 0
    window.API = {
      step(n = 1, dt = 1 / 30) { for (let k = 0; k < n; k++) boucle(dt); return agents[0].frame; },
      touches(o) { agents[0].ctl.touches = Object.assign({}, o || {}); }, set(o) { Object.assign(agents[0].ctl, o); },
      poids(p) { Object.assign(PARAMS.poids, p); Base.ponderer(PARAMS.poids); },
      razGlisse() { const A = agents[0]; A.glisse.cumul = 0; A.glisse.tContact = 0; A.sauts = 0; },
      mesures() { const A = agents[0], f = A.frame; return { frame: f, seq: Base.meta.sequences[Base.seq[f]].nom, glisseMoy: A.glisse.moyenneCm(), glisseRecent: A.glisse.recentCm(), sauts: A.sauts, pos: A.soldat.pos.toArray(), yaw: A.soldat.yaw, simPos: A.ctl.pos.toArray(), vitAnim: Math.hypot(Base.v[f * 3], Base.v[f * 3 + 2]) }; },
      os(n) { const o = agents[0].soldat.os[Base.meta.os.indexOf(n)]; return o ? o.getWorldPosition(V3()).toArray() : null; },
      camera(yaw, pitch, dist, cibleY) { agents[0].ctl.camYaw = yaw; cam.pitch = pitch; cam.dist = dist; cam.cibleY = cibleY; cam.cible = null; },
      escouade: ajouterEscouade, agents,
      diag(i) { const A = agents[i]; const c = A.ctl; const vg = c.vitesseCible(), yg = c.yawCible(vg); const req = A.requete(vg, yg); const f = A.frame; const vit = Math.hypot(Base.v[f * 3], Base.v[f * 3 + 2]); const auRepos = vg.lengthSq() < 0.01 && vit < 0.35 && c.vel.lengthSq() < 0.04; const [best, bc] = chercher(req, c.visee ? 2 : 0, auRepos); return { frame: f, auRepos, best, bc, cc: cout(f, req), seqBest: Base.meta.sequences[Base.seq[best]].nom, req: Array.from(req).map(x => +x.toFixed(2)), fnCour: Array.from(Base.fn.slice(f * Base.nF, (f + 1) * Base.nF)).map(x => +x.toFixed(2)), fnBest: Array.from(Base.fn.slice(best * Base.nF, (best + 1) * Base.nF)).map(x => +x.toFixed(2)) }; }
    };
    window.PRET = true;
    if (!MANUEL) requestAnimationFrame(boucleAuto);
  }
  let MANUEL = false;
  // la simulation (motion matching, ressorts, IK) avance par pas FIXES de 1/60 s quel que soit l'écran (60, 144 Hz…) : même
  // résultat partout, et pas de pas minuscules ou géants. L'affichage rend simplement le dernier état.
  let reste = 0; const PAS = 1 / 60;
  function boucleAuto() {
    requestAnimationFrame(boucleAuto);
    const now = performance.now(); reste += Math.min(0.1, (now - dernierT) / 1000); dernierT = now;
    let n = 0; while (reste >= PAS && n < 4) { boucle(PAS); reste -= PAS; n++; }
    // la machine n'arrive pas à suivre (rendu logiciel, onglet ralenti) : on abandonne le retard au lieu de l'accumuler
    if (reste > 2 * PAS) reste = 2 * PAS;
    if (n === 0) rendre();
  }

  // escouade : 4 soldats de plus, chacun sur son chemin (boucles décalées autour du premier), arme sortie — le cas du jeu
  const CHEMINS_ESCOUADE = [
    [[6, 0, 6], [6, 0, -6], [9, 0, -6], [9, 0, 6]],
    [[-6, 0, 6], [-6, 0, -6], [-9, 0, -4], [-9, 0, 4]],
    [[-3, 0, 9], [3, 0, 9], [4, 0, 12], [-4, 0, 12]],
    [[-3, 0, -9], [3, 0, -9], [5, 0, -12], [-5, 0, -12]],
  ];
  async function ajouterEscouade() {
    if (agents.length > 1) return agents.length;
    for (const ch of CHEMINS_ESCOUADE) {
      const pts = ch.map(p => V3(...p)); const A = await nouveauSoldat(pts[0].clone().add(V3(0.5, 0, 0)), 0);
      A.ctl.chemin = pts; A.ctl.cheminIdx = 1; A.ctl.visee = true; A.ctl.touches = {};
    }
    dessinerChemin(); return agents.length;
  }

  function evenements() {
    const Ctl = () => agents[0].ctl;
    addEventListener('keydown', e => { const c = Ctl(); c.touches[e.code] = true; if (e.code === 'KeyV') { c.visee = !c.visee; } if (e.code === 'KeyC') { c.accroupi = !c.accroupi; } if (e.code === 'KeyP') basculerChemin(); if (e.code === 'KeyR') reinit(); if (e.code === 'KeyE') ajouterEscouade(); if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault(); });
    addEventListener('keyup', e => { Ctl().touches[e.code] = false; });
    addEventListener('blur', () => { Ctl().touches = {}; Ctl().verrouRegard = false; });
    let drag = null;
    renderer.domElement.addEventListener('mousedown', e => { drag = { x: e.clientX, y: e.clientY, b: e.button, moved: false }; if (e.button === 2) Ctl().verrouRegard = true; });
    addEventListener('mousemove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; Ctl().camYaw -= dx * 0.006; cam.pitch = Math.max(0.08, Math.min(1.3, cam.pitch + dy * 0.004)); drag.x = e.clientX; drag.y = e.clientY; });
    addEventListener('mouseup', e => { if (drag && !drag.moved && Ctl().chemin && e.button === 0) ajouterPoint(e); drag = null; if (e.button === 2) Ctl().verrouRegard = false; });
    renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('wheel', e => { cam.dist = Math.max(1.5, Math.min(14, cam.dist * (1 + Math.sign(e.deltaY) * 0.1))); });
    addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
    document.getElementById('btnChemin').onclick = basculerChemin; document.getElementById('btnReinit').onclick = reinit;
    document.getElementById('btnVisee').onclick = () => { Ctl().visee = !Ctl().visee; }; document.getElementById('btnAccroupi').onclick = () => { Ctl().accroupi = !Ctl().accroupi; };
    document.getElementById('btnDemo').onclick = cheminDemo;
    const be = document.getElementById('btnEscouade'); if (be) be.onclick = ajouterEscouade;
  }
  function ajouterPoint(e) {
    const r = new THREE.Raycaster(); r.setFromCamera(new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
    const p = V3(); if (!r.ray.intersectPlane(new THREE.Plane(UP, 0), p)) return; agents[0].ctl.chemin.push(p); dessinerChemin();
  }
  function basculerChemin() { const c = agents[0].ctl; if (c.chemin) { c.chemin = null; } else { c.chemin = []; c.cheminIdx = 0; } dessinerChemin(); }
  function cheminDemo() { const c = agents[0].ctl; c.chemin = [V3(4, 0, 0), V3(4, 0, 4), V3(-3, 0, 5), V3(-4, 0, -2), V3(1, 0, -4)]; c.cheminIdx = 0; dessinerChemin(); }
  function dessinerChemin() {
    for (const t of traits) scene.remove(t); traits.length = 0;
    agents.forEach((A, ai) => {
      const ch = A.ctl.chemin; if (!ch || !ch.length) return; const couleur = ai === 0 ? 0xffb347 : 0x6fa8dc;
      ch.forEach((p) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 24), new THREE.MeshBasicMaterial({ color: couleur })); m.position.copy(p).setY(0.01); scene.add(m); traits.push(m); });
      if (ch.length > 1) { const g = new THREE.BufferGeometry().setFromPoints([...ch, ch[0]].map(p => p.clone().setY(0.015))); const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: couleur })); scene.add(l); traits.push(l); }
    });
  }
  function reinit() { const A = agents[0], c = A.ctl; c.pos.set(0, 0, 0); c.vel.set(0, 0, 0); c.acc.set(0, 0, 0); c.yaw = 0; c.yawV = 0; A.soldat.pos.set(0, 0, 0); A.soldat.yaw = 0; A.glisse.cumul = 0; A.glisse.tContact = 0; for (const B of agents) B.glisse.empreintes.length = 0; for (const m of empreintesMesh) scene.remove(m); empreintesMesh.length = 0; A.sauts = 0; }

  let dernierT = performance.now(), tempsPas = 0;
  function rendre() { if (!window.SANS_RENDU) renderer.render(scene, camera); }
  function boucle(dt) {
    horloge += dt; const now = horloge * 1000;
    const t0 = performance.now();
    for (const A of agents) A.pas(dt, now);
    tempsPas = tempsPas * 0.95 + (performance.now() - t0) * 0.05;
    const A = agents[0], S = A.soldat, Ctl = A.ctl;
    if (window.TRACE) { const g = S.orteils[0].getWorldPosition(V3()), d = S.orteils[1].getWorldPosition(V3()); window.TRACE.push([+horloge.toFixed(3), ...g.toArray().map(x => +x.toFixed(4)), ...d.toArray().map(x => +x.toFixed(4)), Base.contact[A.frame], +(S.verrous[0].delta ? S.verrous[0].delta.length() : 0).toFixed(3), +(S.verrous[1].delta ? S.verrous[1].delta.length() : 0).toFixed(3), A.frame, seuilOrteil]); }
    for (const B of agents) while (B.glisse.empreintes.length) { const e = B.glisse.empreintes.shift(); const m = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), new THREE.MeshBasicMaterial({ color: e.k ? 0x4fc3f7 : 0xff7b7b, transparent: true, opacity: 0.8 })); m.rotation.x = -Math.PI / 2; m.position.copy(e.p).setY(0.004); scene.add(m); empreintesMesh.push(m); if (empreintesMesh.length > 60 * agents.length) scene.remove(empreintesMesh.shift()); }
    // caméra orbitale autour de l'agent 0, cible lissée (le bassin oscille à chaque pas ; une caméra collée dessus amplifie
    // le tangage)
    const voulu = S.pos.clone().setY(cam.cibleY ?? 1.0);
    if (!cam.cible) cam.cible = voulu.clone(); cam.cible.lerp(voulu, 1 - Math.exp(-dt / 0.12));
    const cible = cam.cible;
    camera.position.set(cible.x + Math.sin(Ctl.camYaw + Math.PI) * cam.dist * Math.cos(cam.pitch), cible.y + cam.dist * Math.sin(cam.pitch), cible.z + Math.cos(Ctl.camYaw + Math.PI) * cam.dist * Math.cos(cam.pitch));
    camera.lookAt(cible);
    rendre();
    // HUD
    const f = A.frame, s = Base.meta.sequences[Base.seq[f]];
    const vit = Math.hypot(Base.v[f * 3], Base.v[f * 3 + 2]);
    const rec = A.glisse.recentCm(), moy = A.glisse.moyenneCm();
    HUD.etat.innerHTML = `<span style="float:right;color:#7f8794">v${VERSION}</span><b>${s.nom.replace('.bvh', '')}</b> image ${f - s.debut}/${s.fin - s.debut}<br>vitesse animation <b>${vit.toFixed(2)} m/s</b> · cible ${A.vGoal.length().toFixed(2)} m/s<br>sauts : ${(A.sautsFen.length / 2).toFixed(1)}/s (total ${A.sauts}) · ${agents.length} soldat${agents.length > 1 ? 's' : ''} · simulation ${tempsPas.toFixed(2)} ms/pas<br>mode : ${Ctl.chemin ? 'chemin' : 'clavier'}${Ctl.visee ? ' · <span class=on>arme</span>' : ''}${Ctl.verrouRegard ? ' · <span class=on>regard verrouillé</span>' : ''}${Ctl.accroupi ? ' · <span class=on>accroupi</span>' : ''}`;
    const pct = Math.min(100, rec / 30 * 100); HUD.jauge.style.width = pct + '%'; HUD.jauge.style.background = rec < 5 ? '#5ad17a' : rec < 15 ? '#ffb347' : '#ff6b6b';
    HUD.jaugeTxt.textContent = `glissement des pieds : ${rec.toFixed(1)} cm/s (2 s) · ${moy.toFixed(1)} cm/s depuis le début · instantané ${((A.inst || 0) * 100).toFixed(0)} cm/s`;
    window.__MM = { frame: f, glisseMoy: moy, glisseRecent: rec, sauts: A.sauts, soldat: S, Ctl, Base, facteurRacine: A.facteurRacine, agents, tempsPas };   // pour les outils de mesure
  }

  init().catch(e => { document.getElementById('msg').textContent = 'Erreur : ' + e.message; console.error(e); });
})();
