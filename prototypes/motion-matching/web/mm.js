// Prototype motion matching — un soldat, clavier ou chemin, indicateur de glissement des pieds.
// Données : web/base.json + web/base.bin (fabriqués par outils/preparer.py à partir de 100STYLE, CC BY 4.0).
// Rien ici ne touche au jeu : fichiers copiés, pas importés.
(function () {
  const VERSION = 28;
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
    // base en une ou plusieurs parties (meta.parties) ; FICHIERS.base peut renommer les parties (hébergeur)
    const F = window.FICHIERS || {};
    const noms = meta.parties && meta.parties.length ? meta.parties.map((p, i) => F.base ? F.base.replace(/\.(\w+)$/, `.${i}.$1`) : p) : [F.base || 'base.bin'];
    const morceaux = await Promise.all(noms.map(n => fetch(n).then(r => { if (!r.ok) throw new Error('base : ' + n); return r.arrayBuffer(); })));
    const total = morceaux.reduce((a, b) => a + b.byteLength, 0); const u8 = new Uint8Array(total); let off = 0; for (const m of morceaux) { u8.set(new Uint8Array(m), off); off += m.byteLength; }
    const buf = u8.buffer;
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
    // images « d'arrêt » : le personnage est à moins de 35 cm de sa position actuelle 1 s plus tard (repos, freinages)
    const arret = new Uint8Array(N); for (let i = 0; i < N; i++) { const o = i * nF; arret[i] = ok[i] && Math.hypot(fiche[o + 19], fiche[o + 20]) < 0.35 ? 1 : 0; }   // (jamais en fin de clip : futur tronqué)
    // images « frontales » : le personnage va là où il regarde (vitesse des hanches et position à 0,67 s à moins de 50° de
    // l'avant, ou presque immobile) — pas de pas chassé ni de marche arrière quand le regard n'est pas verrouillé
    const frontal = new Uint8Array(N); for (let i = 0; i < N; i++) { const o = i * nF; const vx = fiche[o + 12], vz = fiche[o + 14], px = fiche[o + 17], pz = fiche[o + 18];
      const aV = Math.hypot(vx, vz) < 0.3 || Math.abs(Math.atan2(vx, vz)) < 0.87, aP = Math.hypot(px, pz) < 0.25 || Math.abs(Math.atan2(px, pz)) < 0.87; frontal[i] = aV && aP ? 1 : 0; }
    // angle de la vitesse des hanches (repère des hanches) et vitesse, pour filtrer la direction en visée
    const angV = new Float32Array(N), vitV = new Float32Array(N); for (let i = 0; i < N; i++) { const o = i * nF; angV[i] = Math.atan2(fiche[o + 12], fiche[o + 14]); vitV[i] = Math.hypot(fiche[o + 12], fiche[o + 14]); }
    Object.assign(Base, { meta, N, J, nF, q, hy, v, w, fiche, fn, seq, style, ok, repos, arret, frontal, angV, vitV, contact, POIDS });
    return Base;
  }

  // recherche brute : la meilleure image pour une requête normalisée (seulement le style demandé)
  // angVoulu (rad, repère des hanches) : en visée, seules les images dont la vitesse part dans cette direction (±50°), ou
  // presque immobiles, sont candidates — sinon la recherche prenait une marche arrière pour un pas de côté
  function dirOk(i, angVoulu) { if (angVoulu == null) return true; const { angV, vitV } = Base; if (vitV[i] < 0.3) return true; const e = angV[i] - angVoulu; return Math.abs(Math.atan2(Math.sin(e), Math.cos(e))) < 0.87; }
  function chercher(req, styleVoulu, seulRepos, seulArret, seulFrontal, angVoulu) {
    const { N, nF, fn, ok, style, repos, arret, frontal } = Base; let best = -1, bc = Infinity;
    for (let i = 0; i < N; i++) {
      if (!ok[i] || style[i] !== styleVoulu || (seulRepos && !repos[i]) || (seulArret && !arret[i]) || (seulFrontal && !frontal[i]) || !dirOk(i, angVoulu)) continue;
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
    // Côté de flexion = mélange CONTINU entre le côté naturel (où est le coude/genou dans la pose capturée, projeté
    // perpendiculairement à la nouvelle direction) et le pôle. Plus le membre est tendu ou plus son côté naturel s'éloigne du
    // pôle, plus le pôle l'emporte. Jamais de bascule brusque (c'était la cause des coudes qui « sautaient »).
    const nat = HK.clone().addScaledVector(dirC, -HK.dot(dirC));                       // côté naturel (longueur = sinus × a)
    const pol = pole ? pole.clone().addScaledVector(dirC, -pole.dot(dirC)) : V3();
    let bend;
    if (pol.lengthSq() > 1e-6) {
      pol.normalize();
      const nl = nat.length(), natN = nl > 1e-6 ? nat.clone().divideScalar(nl) : pol.clone();
      const net = Math.min(1, nl / (0.35 * a));                                     // 0 = tendu (côté indéfini) … 1 = bien plié
      const acc = Math.max(0, Math.min(1, (natN.dot(pol) + 0.2) / 0.8));             // 0 = opposé au pôle … 1 = du côté du pôle
      const w = net * acc;
      bend = natN.multiplyScalar(w).addScaledVector(pol, 1 - w);
      if (bend.lengthSq() < 1e-6) bend = pol.clone();
    } else bend = nat.lengthSq() > 1e-8 ? nat : V3(0, 0, 1);
    bend.addScaledVector(dirC, -bend.dot(dirC)); if (bend.lengthSq() < 1e-8) bend = V3(0, 1, 0).addScaledVector(dirC, -dirC.y); bend.normalize();
    const axe = bend.clone().cross(dirC).normalize();                                 // convention : HK = rot(dirC, −a1) autour de l'axe
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
        const kE = (PARAMS.fusil.longueur || 0.86) / 0.86;                   // les places du jeu sont mesurées sur l'arme de 0,86 m
        const pos = mcp.clone().multiplyScalar(kE).sub(M1.clone().applyQuaternion(q));          // position de l'os de la main dans le repère de l'arme
        out[k] = { pos, q };
        if (k === 'D') { const idx = chaines[autres[0]]; for (const d of this.doigts) if (idx.includes(d.os)) d.indexD = true; }
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
      const s = (PARAMS.fusil.longueur || 0.86) / (b3.max.x - b3.min.x); c.position.set(-ctr.x, -ctr.y, -ctr.z);
      const k = new THREE.Group(); k.add(c); k.scale.setScalar(s); k.rotation.y = Math.PI / 2; w.add(k);
      c.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
      const P = (x, y) => V3(0, (y - ctr.y) * s, -(x - ctr.x) * s);
      w.gripPt = P(0.36, -0.08); w.forePt = P(-0.40, 0.12); w.buttPt = P(b3.max.x, 0.05); w.bouchePt = P(b3.min.x, 0.03);
      // éclair de bouche (même esprit que le jeu : cœur court + langue de flamme vers l'avant + lumière, 40 ms)
      const fl = new THREE.Group(); fl.visible = false; fl.position.copy(w.bouchePt);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffd28a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
      const coeur = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mat); fl.add(coeur);
      const langue = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 7), mat.clone()); langue.material.opacity = 0.8; langue.rotation.x = Math.PI / 2; langue.position.z = 0.12; fl.add(langue);
      const lum = new THREE.PointLight(0xffb26b, 0, 6, 2); lum.position.z = 0.2; fl.add(lum);
      w.add(fl); w.flash = fl; w.flashLum = lum; w.flashT = 0;
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
      if (pa <= 0) { for (const d of this.doigts) d.os.quaternion.copy(d.repos); this.fusilPos = null; this.fusilPosLoc = null; return; }
      const D = this.mains.D, G = this.mains.G; if (D.some(x => !x) || G.some(x => !x)) return;
      // deux ports : low ready (défaut) et épaulé en visée (regard verrouillé) ; fondu entre les deux
      this.poidsVisee = Math.max(0, Math.min(1, (this.poidsVisee ?? 0) + ((this.viseeEpaulee ? 1 : -1) * dt / 0.3)));
      const pv = this.poidsVisee, L = PARAMS.fusil, E = PARAMS.epaule;
      const P = { vrille: L.vrille + ((E.vrille ?? L.vrille) - L.vrille) * pv, tangageMax: L.tangageMax + (E.tangageMax - L.tangageMax) * pv, avant: L.avant + (E.avant - L.avant) * pv, droite: L.droite + (E.droite - L.droite) * pv, haut: L.haut + (E.haut - L.haut) * pv, tangage: L.tangage + (E.tangage - L.tangage) * pv, cant: L.cant + (E.cant - L.cant) * pv, roulis: (L.roulis || 0) + ((E.roulis || 0) - (L.roulis || 0)) * pv, buste: L.buste, lissage: L.lissage, appuiZ: L.appuiZ, torsion: L.torsion };
      // Low ready comme un vrai tireur : la CROSSE reste dans le creux de l'épaule droite, le canon pivote vers le bas.
      // Direction : le regard du soldat (ses hanches), un peu mélangé au buste pour vivre avec la marche ; léger cant vers
      // l'intérieur (le fusil barre la poitrine).
      const avant = V3(0, 0, 1).applyQuaternion(this.worldQ[0]); avant.y = 0; avant.normalize();
      const sp = this.os[Base.meta.os.indexOf('Spine2')]; const qS = sp.getWorldQuaternion(Q());
      const avantBuste = V3(0, 0, 1).applyQuaternion(qS).applyQuaternion(this.align[Base.meta.os.indexOf('Spine2')]); avantBuste.y = 0; avantBuste.normalize();
      const dir = avant.clone().lerp(avantBuste, P.buste).normalize();
      // visée : l'arme pointe vers la cible (caméra), quelle que soit la direction de marche ; le tronc vrille vers elle
      // (≤ 1 rad, réparti sur Spine / Spine1 / Spine2), en plus de la position bladée
      let torsion = 0;
      if (this.viseeYaw != null && pv > 0.001) {
        let e = this.viseeYaw - Math.atan2(avant.x, avant.z); e = Math.atan2(Math.sin(e), Math.cos(e)); torsion = Math.max(-1.0, Math.min(1.0, e)) * pv;
        const dCible = V3(Math.sin(this.viseeYaw), 0, Math.cos(this.viseeYaw)); dir.lerp(dCible, pv); if (dir.lengthSq() < 1e-4) dir.copy(dCible); dir.normalize();
      }
      const droite = dir.clone().cross(V3(0, 1, 0)).normalize();
      const yaw = Math.atan2(dir.x, dir.z) + P.cant;
      // (direction de l'arme déjà fixée) Position « bladée » : le tronc vrille vers la droite (épaule gauche en avant) comme un tireur, ce qui rapproche la
      // main d'appui du garde-main. Répartie sur Spine / Spine1 / Spine2, proportionnelle au poids de la prise.
      if (P.vrille || torsion) {
        const ang = (P.vrille * pa - torsion) / 3, qv = Q().setFromAxisAngle(V3(0, 1, 0), -ang);
        for (const n of ['Spine', 'Spine1', 'Spine2']) { const o = this.os[Base.meta.os.indexOf(n)]; if (!o) continue; const wq = o.getWorldQuaternion(Q()); o.quaternion.copy(o.parent.getWorldQuaternion(Q()).invert().multiply(qv).multiply(wq)); o.updateMatrixWorld(true); }
        this.group.updateMatrixWorld(true);
      }
      if ((this.recul || 0) > 0.001) {   // le buste encaisse le recul (jeu : dos.rotation.x −0,05 × recul) : Spine2 bascule vers l'arrière
        const o = this.os[Base.meta.os.indexOf('Spine2')]; const qr = Q().setFromAxisAngle(droite, 0.05 * this.recul);
        if (o) { const wq = o.getWorldQuaternion(Q()); o.quaternion.copy(o.parent.getWorldQuaternion(Q()).invert().multiply(qr).multiply(wq)); o.updateMatrixWorld(true); this.group.updateMatrixWorld(true); }
      }
      // Ancrage de la CROSSE d'après les photos de référence : posée sur le DESSUS de l'épaule droite, près du cou ; repère
      // du buste (Spine2, qui ne balance pas avec les bras capturés : l'arme reste calme au repos). Le canon plonge.
      const cou = this.os[Base.meta.os.indexOf('Neck')] || sp; const pS2 = cou.getWorldPosition(V3());   // ancre : base du cou (ne penche pas avec la marche)
      // épauler : la crosse part du dessus de l'épaule, l'arme est poussée vers l'avant puis vient se caler dans le creux
      // de l'épaule (excursion avant maximale à mi-fondu, dans les deux sens)
      const avantPlus = (E.poussee || 0) * Math.sin(Math.PI * pv);
      const creux = pS2.clone().addScaledVector(dir, P.avant + avantPlus).addScaledVector(droite, P.droite).add(V3(0, P.haut, 0));
      // Tangage adaptatif : si la main d'appui ne peut pas atteindre sa place sur le garde-main, le canon plonge davantage
      // (jusqu'à P.tangageMax) — ce que fait un tireur aux bras courts — au lieu de rentrer l'arme dans le corps. Lissé.
      // Bras courts : si la poignée arrive trop près de l'épaule droite (bras replié à fond, coude indéfini), l'arme est
      // poussée vers l'avant le long du canon juste ce qu'il faut (≥ 11 cm épaule → main), en douceur.
      let pousse = 0;
      if (this.prise && D[0]) {
        const epD = D[0].getWorldPosition(V3()), axe0 = V3(0, 0, 1).applyQuaternion(Q().setFromAxisAngle(V3(0, 1, 0), yaw).multiply(Q().setFromAxisAngle(V3(1, 0, 0), -(this.tangageLisse ?? P.tangage))));
        const q0 = Q().setFromAxisAngle(V3(0, 1, 0), yaw).multiply(Q().setFromAxisAngle(V3(1, 0, 0), -(this.tangageLisse ?? P.tangage))).multiply(Q().setFromAxisAngle(V3(0, 0, 1), P.roulis));
        const base = creux.clone().sub(w.buttPt.clone().applyQuaternion(q0)).add(this.prise.D.pos.clone().applyQuaternion(q0));
        for (let it = 0; it < 20 && base.clone().addScaledVector(axe0, pousse).distanceTo(epD) < 0.11; it++) pousse += 0.01;
                this.pousseLisse = this.pousseLisse == null ? pousse : this.pousseLisse + (pousse - this.pousseLisse) * (1 - Math.exp(-dt / 0.15));
        creux.addScaledVector(axe0, this.pousseLisse);
      }
      let tangage = P.tangage;
      if (this.prise && G[0] && G[1] && G[2]) {
        const epG = G[0].getWorldPosition(V3()), portee = (G[1].getWorldPosition(V3()).distanceTo(epG) + G[2].getWorldPosition(V3()).distanceTo(G[1].getWorldPosition(V3()))) * 0.96;
        const posG = this.prise.G.pos.clone(); if (P.appuiZ != null) posG.z = P.appuiZ;
        for (let it = 0; it < 40 && tangage > P.tangageMax; it++) {
          const qt = Q().setFromAxisAngle(V3(0, 1, 0), yaw).multiply(Q().setFromAxisAngle(V3(1, 0, 0), -tangage)).multiply(Q().setFromAxisAngle(V3(0, 0, 1), P.roulis));
          const cible = creux.clone().sub(w.buttPt.clone().applyQuaternion(qt)).add(posG.clone().applyQuaternion(qt));
          if (cible.distanceTo(epG) <= portee) break;
          tangage -= 0.02;
        }
      }
      this.tangageLisse = this.tangageLisse == null ? tangage : this.tangageLisse + (tangage - this.tangageLisse) * (1 - Math.exp(-dt / 0.2));
      const q = Q().setFromAxisAngle(V3(0, 1, 0), yaw).multiply(Q().setFromAxisAngle(V3(1, 0, 0), -this.tangageLisse)).multiply(Q().setFromAxisAngle(V3(0, 0, 1), P.roulis));   // roulis : dessus de l'arme vers le cou en low ready (photo)
      // lissage dans le repère du personnage (sinon l'arme traîne derrière un soldat qui court ou qui tourne)
      const gQ = Q().setFromAxisAngle(V3(0, 1, 0), this.yaw), gM = new THREE.Matrix4().compose(V3(this.pos.x, 0, this.pos.z), gQ, V3(1, 1, 1)), gI = gM.clone().invert(), gQI = gQ.clone().invert();
      const creuxLoc = creux.clone().applyMatrix4(gI), qLoc = gQI.clone().multiply(q);
      if (!this.fusilPosLoc) { this.fusilPosLoc = creuxLoc.clone(); this.fusilQLoc = qLoc.clone(); }
      const k = 1 - Math.exp(-dt / P.lissage); this.fusilPosLoc.lerp(creuxLoc, k); this.fusilQLoc.slerp(qLoc, k);
      this.fusilPos = this.fusilPosLoc.clone().applyMatrix4(gM); this.fusilQ = gQ.clone().multiply(this.fusilQLoc);
      // recul du tir (valeurs du jeu, placeWeapon) : l'arme recule de 4 cm le long du canon et la bouche se relève de ~2°
      // autour de la crosse ; les mains suivent (IK), le buste encaisse (voir plus haut). Appliqué après le lissage : c'est un à-coup.
      const rc = this.recul || 0, qF = this.fusilQ.clone(), pF = this.fusilPos.clone();
      if (rc > 0.001) { const canon = V3(0, 0, 1).applyQuaternion(qF), ax = canon.clone().cross(V3(0, 1, 0)); if (ax.lengthSq() > 1e-6) qF.premultiply(Q().setFromAxisAngle(ax.normalize(), rc * 0.035)); pF.addScaledVector(V3(0, 0, 1).applyQuaternion(qF), -rc * 0.04); }
      w.quaternion.copy(qF); w.position.copy(pF).sub(w.buttPt.clone().applyQuaternion(qF)); this.fusilQAff = qF;
      if (w.flash) { w.flashT = Math.max(0, w.flashT - dt); w.flash.visible = w.flashT > 0; w.flashLum.intensity = w.flashT > 0 ? 9 : 0; if (w.flashT > 0) w.flash.rotation.z = Math.random() * 6.28; }
      // mains : placées sur l'arme comme dans la prise de référence (IK deux os vers la position, orientation reportée)
      for (const [main, k] of [[D, 'D'], [G, 'G']]) {
        if (!this.prise) break;
        const pr = this.prise[k];
        const posPr = pr.pos.clone(); if (k === 'G' && P.appuiZ != null) posPr.z = P.appuiZ;      // main d'appui : position choisie sur le garde-main
        let cible = w.position.clone().add(posPr.applyQuaternion(this.fusilQAff || this.fusilQ));
        const mainData = main[2].getWorldPosition(V3()), qData = main[2].getWorldQuaternion(Q());   // pose de la capture (avant IK)
        if (k === 'G') {   // garde-main hors de portée : la main glisse vers l'arrière le long du canon jusqu'à pouvoir tenir
          const ep = main[0].getWorldPosition(V3()), portee = (main[1].getWorldPosition(V3()).distanceTo(ep) + main[2].getWorldPosition(V3()).distanceTo(main[1].getWorldPosition(V3()))) * 0.96;
          const axe = V3(0, 0, 1).applyQuaternion(this.fusilQ);
          for (let it = 0; it < 20 && cible.distanceTo(ep) > portee; it++) cible.addScaledVector(axe, -0.02);
        }
        cible = mainData.clone().lerp(cible, pa);
        // pôles : coudes vers le bas ; le droit rentré vers le corps (pas d'« aile de poulet »), le gauche un peu en arrière
        const pole = k === 'D' ? V3(0, -1, 0).addScaledVector(dir, -0.25).addScaledVector(droite, -0.5).normalize() : V3(0, -1, 0).addScaledVector(dir, -0.35).normalize();
        ikDeuxOs(main[0], main[1], main[2], cible, pole);
        const qw = qData.clone().slerp((this.fusilQAff || this.fusilQ).clone().multiply(pr.q), pa);
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
      for (const d of this.doigts) if (d.prise) d.os.quaternion.copy(d.repos).slerp(d.prise, pa * (d.indexD ? pv : 1));   // index droit : tendu hors de la détente en low ready, sur la détente en visée
      // épaulé : la tête se penche vers la crosse (joue sur la crosse) et baisse un peu vers le viseur
      const tete = this.os[Base.meta.os.indexOf('Head')];
      if (tete && pv > 0.001) {
        const kT = pa * pv; const rDroite = droite.clone().negate();            // axe vers la gauche du tireur = -droite... (droite = dir × up pointe à droite)
        const qT = Q().setFromAxisAngle(droite, -(E.joue ?? 0.22) * kT).multiply(Q().setFromAxisAngle(dir, (E.rouleTete ?? 0.3) * kT));   // baisse (autour de l'axe droite) + roulis vers la droite
        // moitié sur le cou (la tête descend et avance vers la crosse), moitié sur la tête
        const couOs = this.os[Base.meta.os.indexOf('Neck')], qT2 = Q().slerp.call(Q(), qT, 0.5);
        for (const o of [couOs, tete]) { if (!o) continue; o.quaternion.copy(o.parent.getWorldQuaternion(Q()).invert().multiply(qT2).multiply(o.getWorldQuaternion(Q()))); o.updateMatrixWorld(true); }
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
          const cap = this.reposTotal ? 0.3 : PARAMS.verrouMax;                     // au repos, les appuis ne bougent plus du tout                                            // au-delà, le pied « dérape » plutôt que d'être traîné
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
    pos: V3(), vel: V3(), acc: V3(), yaw: 0, yawV: 0, hPos: 0.15, hFrein: 0.3, hYaw: 0.12,
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
      if (this.verrouRegard && this.modeVisee(d.clone().multiplyScalar(v)) === 'recul') v = Math.min(v, this.vitesses.lat);   // à reculons : lent ; vers l'avant : marche normale (arme en joue)
      return d.multiplyScalar(v);
    },
    // Visée (regard verrouillé) : déplacement TACTIQUE, pas de pas chassé. « avant » : il marche vers là où on le pousse
    // (diagonales comprises), le buste et l'arme restent tournés vers la cible (vrille du tronc jusqu'à ~70°) ;
    // « recul » : la cible est derrière le déplacement (> 100°), il marche à reculons en lui faisant face ; hystérésis 10°.
    modeVisee(vGoal) {
      if (!this.verrouRegard || (this.chemin && this.chemin.length)) return null;
      if (vGoal.lengthSq() < 1e-4) return 'arret';
      let e = Math.atan2(vGoal.x, vGoal.z) - this.camYaw; e = Math.abs(Math.atan2(Math.sin(e), Math.cos(e)));
      this.modeV = e <= (this.modeV === 'recul' ? 1.66 : 1.83) ? 'avant' : 'recul'; return this.modeV;
    },
    yawCible(vGoal) {
      // il regarde là où il va ; bouton droit de la souris maintenu : regard verrouillé sur la direction de la caméra
      // (marche tactique vers la touche, buste vers la cible ; recul si la cible est derrière) — la caméra seule ne fait jamais tourner le soldat
      if (this.verrouRegard && !(this.chemin && this.chemin.length)) { const m = this.modeVisee(vGoal); if (m !== 'avant') return this.camYaw; }
      if (vGoal.lengthSq() < 1e-4) return this.yaw;
      return Math.atan2(vGoal.x, vGoal.z);
    },
    // trajectoire prédite aux temps t (s) : positions et regards dans le repère MONDE
    // demi-vie du ressort de vitesse : vive à l'accélération, plus lente au freinage (un humain décélère sur ~40 cm ; prédire
    // un arrêt sur place pousserait la recherche vers des pas de marche arrière)
    hVitesse(vGoal) { return vGoal.lengthSq() >= this.vel.lengthSq() ? this.hPos : this.hFrein; },
    predire(temps, vGoal, yGoal) {
      const P = [], D = []; const h = this.hVitesse(vGoal);
      for (const t of temps) {
        const [x] = ressortVitesse(this.pos, this.vel, this.acc, vGoal, h, t);
        const [y] = ressortAngle(this.yaw, this.yawV, yGoal, this.hYaw, t);
        P.push(x); D.push(V3(Math.sin(y), 0, Math.cos(y)));
      }
      return [P, D];
    },
    pas(dt) {
      const vGoal = this.vitesseCible(), yGoal = this.yawCible(vGoal);
      [this.pos, this.vel, this.acc] = ressortVitesse(this.pos, this.vel, this.acc, vGoal, this.hVitesse(vGoal), dt);
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
  const JOURNAL = window.JOURNAL = []; const PARAMS = window.PARAMS = { capLife: 0.2, capMax: 3.0, warpMax: 0.21, warpMaxVisee: 0.8, rattrapage: 0, margeSaut: 0.5, minSaut: 0.25, periode: 0.1, hLife: 0.15, verrou: true, margeRel: 0.8, verrouMax: 0.08, fusil: { longueur: 0.74, avant: -0.05, droite: 0.09, haut: 0.09, tangage: -0.6, tangageMax: -0.8, cant: 0.05, roulis: -0.5, buste: 0.3, lissage: 0.08, appuiZ: 0.1, torsion: 0.6, vrille: 0.4 }, epaule: { avant: -0.06, droite: 0.12, haut: -0.04, tangage: 0.0, tangageMax: 0.0, cant: 0.08, roulis: 0.0, vrille: 0.55, joue: 0.45, rouleTete: 0.35, poussee: 0.08 }, poids: { pieds: 2.0, vPieds: 1.5, vHanches: 1.0, traj: 1.0, dir: 1.5 } };

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
      // recherche immédiate dès que l'intention change (touche pressée / relâchée, direction) : réactivité au clavier
      const intention = vGoal.x.toFixed(1) + ',' + vGoal.z.toFixed(1) + ',' + (Ctl.verrouRegard ? 1 : 0);
      const changement = intention !== this.intentionPrec; this.intentionPrec = intention;
      // fin de clip (les 36 dernières images ne sont jamais jouées : la lecture s'y figerait) → recherche et saut forcés
      const finClip = !Base.ok[this.frame + 1] || Base.seq[this.frame + 1] !== Base.seq[this.frame];
      if (this.derniereRecherche >= PARAMS.periode || styleVoulu !== this.styleCourant || changement || finClip) {
        this.derniereRecherche = 0;
        const req = this.requete(vGoal, yGoal);
        // à l'arrêt voulu et presque atteint : on ne cherche que dans les séquences de repos (sinon ping-pong entre des
        // instants d'arrêt situés juste avant des départs, et piétinement)
        const f = this.frame, vitAnimCour = Math.hypot(Base.v[f * 3], Base.v[f * 3 + 2]);
        const arretVoulu = vGoal.lengthSq() < 0.01;
        const auRepos = arretVoulu && vitAnimCour < 0.35;
        const modeV = Ctl.modeVisee(vGoal), recule = modeV === 'recul';
        const seulFrontal = !recule;                                                          // il marche vers là où il va (même en visée)
        const angVoulu = recule && vGoal.lengthSq() > 0.01 ? Math.atan2(vGoal.x, vGoal.z) - S.yaw : null;   // recul en visée : direction voulue dans le repère des hanches
        const [best, bc] = chercher(req, styleVoulu, auRepos, arretVoulu, seulFrontal, angVoulu);
        const cc = (!finClip && Base.ok[f] && Base.style[f] === styleVoulu && (!auRepos || Base.repos[f]) && (!arretVoulu || Base.arret[f]) && (!seulFrontal || Base.frontal[f]) && dirOk(f, angVoulu)) ? cout(f, req) : Infinity;
        if (this === agents[0]) { JOURNAL.push([+horloge.toFixed(2), +cc.toFixed(1), +bc.toFixed(1), best, f]); if (JOURNAL.length > 400) JOURNAL.shift(); }
        // les marges évitent les sauts inutiles en régime établi ; mais si on veut avancer alors que l'animation est à l'arrêt
        // (départ, ou arrêt forcé à un virage), on prend la meilleure image sans marge : sinon un repos « atypique » peut
        // retenir le soldat indéfiniment (pose trop éloignée de tous les départs)
        const veutPartir = vGoal.lengthSq() > 0.25 && vitAnimCour < 0.2;
        const veutArreter = vGoal.lengthSq() < 0.01 && vitAnimCour > 0.3;                 // arrêt demandé : même traitement
        const vitGoal = Math.sqrt(vGoal.lengthSq()), ecartVit = Math.abs(vitGoal - vitAnimCour);
        const sansMarge = veutPartir || veutArreter || ecartVit > 0.6;                     // (ou grand changement de vitesse)
        const seuil = sansMarge ? cc : auRepos ? cc * 0.6 - PARAMS.margeSaut : cc * PARAMS.margeRel - PARAMS.margeSaut;   // au repos : très peu de sauts (pas de tressautement)
        if (best >= 0 && bc < seuil && Math.abs(best - f) > 2 && (horloge - this.dernierSaut >= (auRepos ? 1.0 : sansMarge ? 0.1 : PARAMS.minSaut) || styleVoulu !== this.styleCourant || finClip || (changement && horloge - this.dernierSaut >= 0.08))) {
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
      this.facteurRacine += ((vGoalNul ? 0 : 1) - this.facteurRacine) * Math.min(1, dt / (vGoalNul ? 0.3 : 0.05));
      S.yaw += w[i] * dt * this.facteurRacine;
      // Correction de cap (« rotation warping ») : la base ne contient pas tous les virages, et la recherche se contentait
      // souvent d'une marche qui tourne doucement (D → 50° au lieu de 90°, parfois du mauvais côté). Quand on veut se
      // déplacer, le cap du soldat est ramené vers le cap voulu en plus de la rotation du clip (demi-vie 0,2 s, ≤ 3 rad/s) ;
      // le verrou des pieds garde les appuis en place pendant le virage.
      // (le cap corrigé est celui du DÉPLACEMENT : en style Swat les hanches sont bladées de ~12° par rapport à la marche,
      // et les clips capturés serpentent ; l'angle vitesse/hanches du clip, lissé, est compensé pour que le soldat aille
      // exactement là où on le pousse, sans glissement des pieds)
      if (vGoal.lengthSq() > 0.01 && this.facteurRacine > 0.5) {
        const vLoc = Math.hypot(v[i * 3], v[i * 3 + 2]) > 0.3 ? Math.atan2(v[i * 3], v[i * 3 + 2]) : (this.biaisVit || 0);   // angle vitesse / hanches du clip
        this.biaisVit = this.biaisVit == null ? vLoc : this.biaisVit + Math.atan2(Math.sin(vLoc - this.biaisVit), Math.cos(vLoc - this.biaisVit)) * (1 - Math.exp(-dt / 0.2));
        // regard verrouillé (visée) : ce sont les hanches qui doivent faire face à la caméra, pas le déplacement (pas chassé,
        // recul) — sans cette distinction le soldat tournait sur lui-même en visant
        const recule = Ctl.modeVisee(vGoal) === 'recul';
        let err = yGoal - (recule ? S.yaw : S.yaw + this.biaisVit); err = Math.atan2(Math.sin(err), Math.cos(err));
        const corr = Math.max(-PARAMS.capMax * dt, Math.min(PARAMS.capMax * dt, err * (1 - Math.exp(-dt / PARAMS.capLife))));
        S.yaw += corr * this.facteurRacine;
      }
      // résidu : le déplacement de l'image est tourné vers la direction voulue (≤ 12°, les clips serpentent) ; le verrou des
      // pieds absorbe ce petit écart
      // (regard verrouillé : les hanches font face à la caméra, c'est donc ce redressement seul qui donne la direction du pas
      // chassé / du recul ; limite plus large, le verrou des pieds absorbe l'écart)
      if (vGoal.lengthSq() > 0.01 && vl.lengthSq() > 0.09) {
        const lim = Ctl.modeVisee(vGoal) === 'recul' ? PARAMS.warpMaxVisee : PARAMS.warpMax;
        let e = Math.atan2(vGoal.x, vGoal.z) - Math.atan2(vl.x, vl.z); e = Math.atan2(Math.sin(e), Math.cos(e));
        vl.applyAxisAngle(UP, Math.max(-lim, Math.min(lim, e)));
      }
      S.pos.addScaledVector(vl, dt * this.facteurRacine);
      Ctl.pos.copy(S.pos); Ctl.yaw = S.yaw;
      S.appliquer(this.poseQ, this.poseY, dt);
      // appui = la base dit « en appui » ET l'orteil affiché est bas (juste après un saut de séquence, la pose affichée est
      // encore un mélange : un pied en l'air ne doit ni être verrouillé ni compter comme glissement)
      const cf = Base.contact[this.frame];
      const contacts = S.orteils.map((o, k) => !!(cf & (k ? 1 : 2)) && o.getWorldPosition(V3()).y < seuilOrteil);
      S.reposTotal = vGoalNul && this.facteurRacine < 0.05;
      if (PARAMS.verrou) S.verrouPieds(contacts, dt);
      // tir (clic gauche maintenu en visée) : cadence soutenue du fusil d'assaut du jeu (110 coups/min), recul 1 → 0 en 0,1 s
      this.recul = Math.max(0, (this.recul || 0) - dt * 10); this.tirAcc = Math.max(0, (this.tirAcc || 0) - dt);
      if (Ctl.tir && Ctl.visee && Ctl.verrouRegard && (S.poidsVisee || 0) > 0.9 && this.tirAcc <= 0) { this.recul = 1; this.tirAcc = 60 / 110; this.tirs = (this.tirs || 0) + 1; if (S.fusil && S.fusil.flash) S.fusil.flashT = 0.04; }
      S.recul = this.recul; S.viseeEpaulee = !!Ctl.verrouRegard; S.viseeYaw = Ctl.verrouRegard ? Ctl.camYaw : null; S.tenirFusil(Ctl.visee, dt);
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
    const clair = /[?&]clair=1/.test(location.search);
    const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x3a2f22, clair ? 2.2 : 0.9); scene.add(hemi);
    if (clair) { const fill = new THREE.DirectionalLight(0xffffff, 1.2); fill.position.set(-6, 4, -3); scene.add(fill); const fill2 = new THREE.DirectionalLight(0xffe8c8, 0.8); fill2.position.set(2, 3, -8); scene.add(fill2); }
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.6); sun.position.set(5, 9, 4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -16; sun.shadow.camera.right = sun.shadow.camera.top = 16; scene.add(sun);
    const sol = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x3c4149, roughness: 0.95 })); sol.rotation.x = -Math.PI / 2; sol.receiveShadow = true; scene.add(sol);
    const grille = new THREE.GridHelper(60, 60, 0x5a6270, 0x2c3139); grille.position.y = 0.002; scene.add(grille);
    HUD.etat = document.getElementById('etat'); HUD.jauge = document.getElementById('jauge'); HUD.jaugeTxt = document.getElementById('jaugeTxt'); HUD.msg = document.getElementById('msg');
    HUD.msg.textContent = 'Chargement de la base (17 Mo)…';
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
      mesures() { const A = agents[0], f = A.frame; return { frame: f, seq: Base.meta.sequences[Base.seq[f]].nom, glisseMoy: A.glisse.moyenneCm(), glisseRecent: A.glisse.recentCm(), sauts: A.sauts, pos: A.soldat.pos.toArray(), yaw: A.soldat.yaw, simPos: A.ctl.pos.toArray(), vitAnim: Math.hypot(Base.v[f * 3], Base.v[f * 3 + 2]), tirs: A.tirs || 0, recul: A.recul || 0 }; },
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
    addEventListener('blur', () => { Ctl().touches = {}; Ctl().verrouRegard = false; Ctl().tir = false; });
    let drag = null;
    renderer.domElement.addEventListener('mousedown', e => { drag = { x: e.clientX, y: e.clientY, b: e.button, moved: false }; if (e.button === 2) Ctl().verrouRegard = true; if (e.button === 0 && Ctl().verrouRegard) Ctl().tir = true; });
    addEventListener('mousemove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; Ctl().camYaw -= dx * 0.006; cam.pitch = Math.max(0.08, Math.min(1.3, cam.pitch + dy * 0.004)); drag.x = e.clientX; drag.y = e.clientY; });
    addEventListener('mouseup', e => { if (drag && !drag.moved && Ctl().chemin && e.button === 0) ajouterPoint(e); drag = null; if (e.button === 2) { Ctl().verrouRegard = false; Ctl().tir = false; } if (e.button === 0) Ctl().tir = false; });
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
