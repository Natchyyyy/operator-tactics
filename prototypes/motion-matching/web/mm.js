// Prototype motion matching — un soldat, clavier ou chemin, indicateur de glissement des pieds.
// Données : web/base.json + web/base.bin (fabriqués par outils/preparer.py à partir de 100STYLE, CC BY 4.0).
// Rien ici ne touche au jeu : fichiers copiés, pas importés.
(function () {
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
    const seq = new Int16Array(N), style = new Uint8Array(N), ok = new Uint8Array(N);
    meta.sequences.forEach((s, si) => { for (let i = s.debut; i < s.fin; i++) { seq[i] = si; style[i] = s.style; ok[i] = i < s.fin - 35 ? 1 : 0; } });
    const contact = new Uint8Array(N); for (let i = 0; i < N; i++) contact[i] = +meta.contact[i];
    Object.assign(Base, { meta, N, J, nF, q, hy, v, w, fiche, fn, seq, style, ok, contact, POIDS });
    return Base;
  }

  // recherche brute : la meilleure image pour une requête normalisée (seulement le style demandé)
  function chercher(req, styleVoulu) {
    const { N, nF, fn, ok, style } = Base; let best = -1, bc = Infinity;
    for (let i = 0; i < N; i++) {
      if (!ok[i] || style[i] !== styleVoulu) continue;
      let c = 0; const o = i * nF;
      for (let k = 0; k < nF; k++) { const d = fn[o + k] - req[k]; c += d * d; if (c >= bc) break; }
      if (c < bc) { bc = c; best = i; }
    }
    return [best, bc];
  }
  function cout(i, req) { const { nF, fn } = Base; let c = 0; const o = i * nF; for (let k = 0; k < nF; k++) { const d = fn[o + k] - req[k]; c += d * d; } return c; }

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
        const pH = H.getWorldPosition(V3()), pK = K.getWorldPosition(V3()), pA = A.getWorldPosition(V3());
        const a = pK.distanceTo(pH), b = pA.distanceTo(pK);
        let cibleA = pA.clone().add(vr.delta);
        // si la cible dépasse la longueur de la jambe, on n'applique qu'une partie de l'écart (jambe jamais tendue de force)
        const maxC = (a + b) * 0.985, dist = cibleA.distanceTo(pH);
        if (dist > maxC) { let lo = 0, hi = 1; for (let it = 0; it < 12; it++) { const m = (lo + hi) / 2; if (pA.clone().addScaledVector(vr.delta, m).distanceTo(pH) > maxC) hi = m; else lo = m; } cibleA = pA.clone().addScaledVector(vr.delta, lo); }
        const c = Math.max(0.01, cibleA.distanceTo(pH));
        const qPied = A.getWorldQuaternion(Q());                              // on garde l'orientation du pied
        const ang = (u, v) => Math.acos(Math.max(-1, Math.min(1, u.dot(v) / (u.length() * v.length()))));
        const HK = pK.clone().sub(pH), HA = pA.clone().sub(pH), KH = pH.clone().sub(pK), KA = pA.clone().sub(pK);
        let axe = HK.clone().cross(HA); if (axe.lengthSq() < 1e-8) axe = V3(1, 0, 0).applyQuaternion(H.getWorldQuaternion(Q())); axe.normalize();
        const a0 = ang(HK, HA), a1 = Math.acos(Math.max(-1, Math.min(1, (a * a + c * c - b * b) / (2 * a * c))));
        const b0 = ang(KH, KA), b1 = Math.acos(Math.max(-1, Math.min(1, (a * a + b * b - c * c) / (2 * a * b))));
        const rH = Q().setFromAxisAngle(axe, a1 - a0), rK = Q().setFromAxisAngle(axe, b1 - b0);
        const wH = rH.clone().multiply(H.getWorldQuaternion(Q())), wK = rK.clone().multiply(rH).multiply(K.getWorldQuaternion(Q()));
        const pA2 = pH.clone().add(HK.clone().applyQuaternion(rH)).add(KA.clone().applyQuaternion(rH).applyQuaternion(rK));
        const rot = Q().setFromUnitVectors(pA2.clone().sub(pH).normalize(), cibleA.clone().sub(pH).normalize());
        wH.premultiply(rot); wK.premultiply(rot);
        H.quaternion.copy(H.parent.getWorldQuaternion(Q()).invert().multiply(wH)); H.updateMatrixWorld(true);
        K.quaternion.copy(K.parent.getWorldQuaternion(Q()).invert().multiply(wK)); K.updateMatrixWorld(true);
        A.quaternion.copy(A.parent.getWorldQuaternion(Q()).invert().multiply(qPied)); A.updateMatrixWorld(true);
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
  const Ctl = {
    pos: V3(), vel: V3(), acc: V3(), yaw: 0, yawV: 0, hPos: 0.25, hYaw: 0.15,
    touches: {}, visee: false, accroupi: false, chemin: null, cheminIdx: 0, camYaw: 0.6,
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
        return d.normalize().multiplyScalar(this.visee ? Math.min(v, this.vitesses.lat) : v);
      }
      const d = this.direction(); if (!d) return V3();
      const sprint = this.touches['ShiftLeft'] || this.touches['ShiftRight'];
      let v = sprint ? this.vitesses.course : this.vitesses.marche;
      if (this.visee) v = Math.min(v, this.vitesses.lat);
      return d.multiplyScalar(v);
    },
    yawCible(vGoal) {
      if (this.visee) { if (this.chemin && this.chemin.length) return this.yaw; return this.camYaw; }     // visée : on garde le regard (direction caméra)
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
  };

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
  let renderer, scene, camera, soldat, cam = { dist: 4.2, pitch: 0.42 }, horloge = 0;
  let dernierSaut = -1, frame = 0, frameT = 0, poseQ, poseY = [0], ancQ, ancY = [0], derniereRecherche = 0, sauts = 0, sautsFen = [], styleCourant = 0;
  const glisse = new Glissement(); let seuilOrteil = 0.06; const traits = [], empreintesMesh = [];
  const HUD = {};
  const JOURNAL = window.JOURNAL = []; const PARAMS = window.PARAMS = { rattrapage: 0, margeSaut: 0.0, minSaut: 0.25, periode: 0.1, hLife: 0.15, verrou: true, margeRel: 0.8, verrouMax: 0.05, poids: { pieds: 2.0, vPieds: 1.5, vHanches: 1.0, traj: 1.0, dir: 1.5 } };

  async function init() {
    renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true; renderer.outputColorSpace = THREE.SRGBColorSpace; document.body.appendChild(renderer.domElement);
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x1b1f26); scene.fog = new THREE.Fog(0x1b1f26, 18, 40);
    camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.05, 100);
    const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x3a2f22, 0.9); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.6); sun.position.set(5, 9, 4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -8; sun.shadow.camera.right = sun.shadow.camera.top = 8; scene.add(sun);
    const sol = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x3c4149, roughness: 0.95 })); sol.rotation.x = -Math.PI / 2; sol.receiveShadow = true; scene.add(sol);
    const grille = new THREE.GridHelper(60, 60, 0x5a6270, 0x2c3139); grille.position.y = 0.002; scene.add(grille);
    HUD.etat = document.getElementById('etat'); HUD.jauge = document.getElementById('jauge'); HUD.jaugeTxt = document.getElementById('jaugeTxt'); HUD.msg = document.getElementById('msg');
    HUD.msg.textContent = 'Chargement de la base (13,6 Mo)…';
    await chargerBase();
    HUD.msg.textContent = 'Chargement du modèle…';
    const gltf = await new Promise((ok, ko) => new THREEX.GLTFLoader().load((window.FICHIERS || {}).modele || 'gign_hd.glb', ok, undefined, ko));
    gltf.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    soldat = new Soldat(gltf); scene.add(soldat.group);
    // hauteur de repos des orteils du modèle (pose de liaison) → seuil d'appui
    const yT = Math.min(...soldat.orteils.map(o => o.getWorldPosition(V3()).y)); seuilOrteil = yT + 0.05;
    poseQ = Base.meta.os.map(() => Q()); ancQ = Base.meta.os.map(() => Q());
    frame = Base.meta.sequences.find(s => /Neutral_ID/.test(s.nom)).debut + 10;
    soldat.poseDe(frame, 0, poseQ, poseY);
    HUD.msg.textContent = '';
    evenements();
    MANUEL = /[?&]manual=1/.test(location.search);
    // API de test (mode manuel : ?manual=1) — pas de boucle automatique, on avance pas à pas
    window.API = {
      step(n = 1, dt = 1 / 30) { for (let k = 0; k < n; k++) boucle(dt); return frame; },
      touches(o) { Ctl.touches = Object.assign({}, o || {}); }, set(o) { Object.assign(Ctl, o); },
      poids(p) { Object.assign(PARAMS.poids, p); Base.ponderer(PARAMS.poids); }, razGlisse() { glisse.cumul = 0; glisse.tContact = 0; sauts = 0; }, mesures() { return { frame, seq: Base.meta.sequences[Base.seq[frame]].nom, glisseMoy: glisse.moyenneCm(), glisseRecent: glisse.recentCm(), sauts, pos: soldat.pos.toArray(), yaw: soldat.yaw, simPos: Ctl.pos.toArray(), vitAnim: Math.hypot(Base.v[frame * 3], Base.v[frame * 3 + 2]) }; },
      os(n) { const o = soldat.os[Base.meta.os.indexOf(n)]; return o ? o.getWorldPosition(V3()).toArray() : null; },
      camera(yaw, pitch, dist, cibleY) { Ctl.camYaw = yaw; cam.pitch = pitch; cam.dist = dist; cam.cibleY = cibleY; }
    };
    window.PRET = true;
    if (!MANUEL) requestAnimationFrame(boucleAuto);
  }
  let MANUEL = false;
  function boucleAuto() { requestAnimationFrame(boucleAuto); const now = performance.now(); const dt = Math.min(0.05, (now - dernierT) / 1000); dernierT = now; boucle(dt); }

  function evenements() {
    addEventListener('keydown', e => { Ctl.touches[e.code] = true; if (e.code === 'KeyV') { Ctl.visee = !Ctl.visee; } if (e.code === 'KeyC') { Ctl.accroupi = !Ctl.accroupi; } if (e.code === 'KeyP') basculerChemin(); if (e.code === 'KeyR') reinit(); if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault(); });
    addEventListener('keyup', e => { Ctl.touches[e.code] = false; });
    addEventListener('blur', () => { Ctl.touches = {}; });
    let drag = null;
    renderer.domElement.addEventListener('mousedown', e => { drag = { x: e.clientX, y: e.clientY, b: e.button, moved: false }; });
    addEventListener('mousemove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; Ctl.camYaw -= dx * 0.006; cam.pitch = Math.max(0.08, Math.min(1.3, cam.pitch + dy * 0.004)); drag.x = e.clientX; drag.y = e.clientY; });
    addEventListener('mouseup', e => { if (drag && !drag.moved && Ctl.chemin && e.button === 0) ajouterPoint(e); drag = null; });
    renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('wheel', e => { cam.dist = Math.max(1.5, Math.min(12, cam.dist * (1 + Math.sign(e.deltaY) * 0.1))); });
    addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
    document.getElementById('btnChemin').onclick = basculerChemin; document.getElementById('btnReinit').onclick = reinit;
    document.getElementById('btnVisee').onclick = () => { Ctl.visee = !Ctl.visee; }; document.getElementById('btnAccroupi').onclick = () => { Ctl.accroupi = !Ctl.accroupi; };
    document.getElementById('btnDemo').onclick = cheminDemo;
  }
  function ajouterPoint(e) {
    const r = new THREE.Raycaster(); r.setFromCamera(new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
    const p = V3(); if (!r.ray.intersectPlane(new THREE.Plane(UP, 0), p)) return; Ctl.chemin.push(p); dessinerChemin();
  }
  function basculerChemin() { if (Ctl.chemin) { Ctl.chemin = null; } else { Ctl.chemin = []; Ctl.cheminIdx = 0; } dessinerChemin(); }
  function cheminDemo() { Ctl.chemin = [V3(4, 0, 0), V3(4, 0, 4), V3(-3, 0, 5), V3(-4, 0, -2), V3(1, 0, -4)]; Ctl.cheminIdx = 0; dessinerChemin(); }
  function dessinerChemin() {
    for (const t of traits) scene.remove(t); traits.length = 0; if (!Ctl.chemin) return;
    Ctl.chemin.forEach((p, i) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 24), new THREE.MeshBasicMaterial({ color: 0xffb347 })); m.position.copy(p).setY(0.01); scene.add(m); traits.push(m); });
    if (Ctl.chemin.length > 1) { const g = new THREE.BufferGeometry().setFromPoints([...Ctl.chemin, Ctl.chemin[0]].map(p => p.clone().setY(0.015))); const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffb347 })); scene.add(l); traits.push(l); }
  }
  function reinit() { Ctl.pos.set(0, 0, 0); Ctl.vel.set(0, 0, 0); Ctl.acc.set(0, 0, 0); Ctl.yaw = 0; Ctl.yawV = 0; soldat.pos.set(0, 0, 0); soldat.yaw = 0; glisse.cumul = 0; glisse.tContact = 0; glisse.empreintes.length = 0; for (const m of empreintesMesh) scene.remove(m); empreintesMesh.length = 0; sauts = 0; }

  // requête : partie pose = fiche de l'image courante ; partie trajectoire = prédiction du contrôleur dans le repère du personnage
  function requete(vGoal, yGoal) {
    const { nF, fn, fiche, meta, POIDS } = Base; const req = new Float32Array(nF);
    const o = frame * nF; for (let k = 0; k < 15; k++) req[k] = fn[o + k];
    const temps = meta.futur.map(f => f / meta.fps);
    const [P, D] = Ctl.predire(temps, vGoal, yGoal);
    const inv = Q().setFromAxisAngle(UP, -soldat.yaw);
    for (let k = 0; k < 3; k++) {
      const p = P[k].clone().sub(soldat.pos); p.y = 0; p.applyQuaternion(inv); const d = D[k].clone().applyQuaternion(inv);
      req[15 + 2 * k] = p.x; req[16 + 2 * k] = p.z; req[21 + 2 * k] = d.x; req[22 + 2 * k] = d.z;
    }
    for (let k = 15; k < nF; k++) req[k] = (req[k] - meta.moyenne[k]) / meta.ecartType[k] * POIDS[k];
    return req;
  }

  let dernierT = performance.now();
  function boucle(dt) {
    horloge += dt; const now = MANUEL ? horloge * 1000 : performance.now();
    const [vGoal, yGoal] = Ctl.pas(dt);
    // recherche toutes les 0,1 s, ou tout de suite si on change de style
    const styleVoulu = Ctl.accroupi ? 1 : 0;
    derniereRecherche += dt;
    if (derniereRecherche >= PARAMS.periode || styleVoulu !== styleCourant) {
      derniereRecherche = 0;
      const req = requete(vGoal, yGoal);
      const [best, bc] = chercher(req, styleVoulu);
      const cc = (Base.ok[frame] && Base.style[frame] === styleVoulu) ? cout(frame, req) : Infinity;
      JOURNAL.push([+horloge.toFixed(2), +cc.toFixed(1), +bc.toFixed(1), best, frame]); if (JOURNAL.length > 400) JOURNAL.shift();
      if (best >= 0 && bc < cc * PARAMS.margeRel - PARAMS.margeSaut && Math.abs(best - frame) > 2 && (horloge - dernierSaut >= PARAMS.minSaut || styleVoulu !== styleCourant)) {
        dernierSaut = horloge; soldat.hLife = PARAMS.hLife;
        // transition : écart entre la pose courante (telle qu'affichée) et la nouvelle
        for (let k = 0; k < Base.J; k++) ancQ[k].copy(poseQ[k]); ancY[0] = poseY[0];
        frame = best; frameT = 0; soldat.poseDe(frame, 0, poseQ, poseY);
        soldat.transition(ancQ, ancY, poseQ, poseY); sauts++; sautsFen.push(now);
      }
      styleCourant = styleVoulu;
    }
    // avance dans la séquence
    frameT += dt * Base.meta.fps;
    while (frameT >= 1) { frameT -= 1; frame++; if (!Base.ok[frame] || Base.seq[frame] !== Base.seq[frame - 1]) { frame--; frameT = 0.999; break; } }
    soldat.poseDe(frame, frameT, poseQ, poseY);
    // déplacement par la racine de l'animation (vitesse locale → monde), puis petit rattrapage vers la simulation
    const { v, w } = Base; const i = frame;
    const vl = V3(v[i * 3], 0, v[i * 3 + 2]).applyAxisAngle(UP, soldat.yaw);
    soldat.yaw += w[i] * dt; soldat.pos.addScaledVector(vl, dt);
    {
      const d = Ctl.pos.clone().sub(soldat.pos); d.y = 0;
      const maxPas = PARAMS.rattrapage * vl.length() * dt + 0.0005;             // le rattrapage ne peut glisser que si l'animation bouge
      const vouloir = d.multiplyScalar(1 - Math.exp(-dt / 0.3)); if (vouloir.length() > maxPas) vouloir.setLength(maxPas); soldat.pos.add(vouloir);
      let dy = Ctl.yaw - soldat.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      const maxY = PARAMS.rattrapage * Math.abs(w[i]) * dt + 0.002; soldat.yaw += Math.sign(dy) * Math.min(Math.abs(dy) * (1 - Math.exp(-dt / 0.3)), maxY);
      // si la simulation s'éloigne trop, on la ramène (évite les divergences)
      const e = Ctl.pos.clone().sub(soldat.pos); e.y = 0; if (e.length() > 0.3) Ctl.pos.copy(soldat.pos).addScaledVector(e.normalize(), 0.3);
      let dy2 = Ctl.yaw - soldat.yaw; while (dy2 > Math.PI) dy2 -= 2 * Math.PI; while (dy2 < -Math.PI) dy2 += 2 * Math.PI; if (Math.abs(dy2) > 0.6) Ctl.yaw = soldat.yaw + Math.sign(dy2) * 0.6;
    }
    soldat.appliquer(poseQ, poseY, dt);
    // appui = la base dit « en appui » ET l'orteil affiché est bas (juste après un saut de séquence, la pose affichée est
    // encore un mélange : un pied en l'air ne doit ni être verrouillé ni compter comme glissement)
    const cf = Base.contact[frame];
    const contacts = soldat.orteils.map((o, k) => !!(cf & (k ? 1 : 2)) && o.getWorldPosition(V3()).y < seuilOrteil);
    if (PARAMS.verrou) soldat.verrouPieds(contacts, dt);
    // glissement
    const inst = glisse.mesurer(soldat.orteils, dt, contacts);
    if (window.TRACE) { const g = soldat.orteils[0].getWorldPosition(V3()), d = soldat.orteils[1].getWorldPosition(V3()); window.TRACE.push([+horloge.toFixed(3), ...g.toArray().map(x => +x.toFixed(4)), ...d.toArray().map(x => +x.toFixed(4)), Base.contact[frame], +(soldat.verrous[0].delta ? soldat.verrous[0].delta.length() : 0).toFixed(3), +(soldat.verrous[1].delta ? soldat.verrous[1].delta.length() : 0).toFixed(3), frame, seuilOrteil]); }
    while (glisse.empreintes.length) { const e = glisse.empreintes.shift(); const m = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), new THREE.MeshBasicMaterial({ color: e.k ? 0x4fc3f7 : 0xff7b7b, transparent: true, opacity: 0.8 })); m.rotation.x = -Math.PI / 2; m.position.copy(e.p).setY(0.004); scene.add(m); empreintesMesh.push(m); if (empreintesMesh.length > 60) scene.remove(empreintesMesh.shift()); }
    // caméra orbitale
    const cible = soldat.pos.clone().setY(cam.cibleY ?? 1.0);
    camera.position.set(cible.x + Math.sin(Ctl.camYaw + Math.PI) * cam.dist * Math.cos(cam.pitch), cible.y + cam.dist * Math.sin(cam.pitch), cible.z + Math.cos(Ctl.camYaw + Math.PI) * cam.dist * Math.cos(cam.pitch));
    camera.lookAt(cible);
    renderer.render(scene, camera);
    // HUD
    while (sautsFen.length && now - sautsFen[0] > 2000) sautsFen.shift();
    const s = Base.meta.sequences[Base.seq[frame]];
    const vit = Math.hypot(v[i * 3], v[i * 3 + 2]);
    const rec = glisse.recentCm(), moy = glisse.moyenneCm();
    HUD.etat.innerHTML = `<b>${s.nom.replace('.bvh', '')}</b> image ${frame - s.debut}/${s.fin - s.debut}<br>vitesse animation <b>${vit.toFixed(2)} m/s</b> · cible ${vGoal.length().toFixed(2)} m/s<br>sauts : ${(sautsFen.length / 2).toFixed(1)}/s (total ${sauts})<br>mode : ${Ctl.chemin ? 'chemin' : 'clavier'}${Ctl.visee ? ' · <span class=on>visée</span>' : ''}${Ctl.accroupi ? ' · <span class=on>accroupi</span>' : ''}`;
    const pct = Math.min(100, rec / 30 * 100); HUD.jauge.style.width = pct + '%'; HUD.jauge.style.background = rec < 5 ? '#5ad17a' : rec < 15 ? '#ffb347' : '#ff6b6b';
    HUD.jaugeTxt.textContent = `glissement des pieds : ${rec.toFixed(1)} cm/s (2 s) · ${moy.toFixed(1)} cm/s depuis le début · instantané ${(inst * 100).toFixed(0)} cm/s`;
    window.__MM = { frame, glisseMoy: moy, glisseRecent: rec, sauts, soldat, Ctl, Base };   // pour les outils de mesure
  }

  init().catch(e => { document.getElementById('msg').textContent = 'Erreur : ' + e.message; console.error(e); });
})();
