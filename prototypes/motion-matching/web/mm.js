// Prototype motion matching — un soldat, clavier ou chemin, indicateur de glissement des pieds.
// Données : web/base.json + web/base.bin (fabriqués par outils/preparer.py à partir de 100STYLE, CC BY 4.0).
// Rien ici ne touche au jeu : fichiers copiés, pas importés.
(function () {
  const VERSION = 36;
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
  function chercher(req, styleVoulu, seulRepos, seulArret, seulFrontal, angVoulu, seulMobile) {
    const { N, nF, fn, ok, style, repos, arret, frontal, vitV } = Base; let best = -1, bc = Infinity;
    for (let i = 0; i < N; i++) {
      if (!ok[i] || style[i] !== styleVoulu || (seulRepos && !repos[i]) || (seulArret && !arret[i]) || (seulFrontal && !frontal[i]) || !dirOk(i, angVoulu) || (seulMobile && vitV[i] < 0.3)) continue;
      let c = 0; const o = i * nF;
      for (let k = 0; k < nF; k++) { const d = fn[o + k] - req[k]; c += d * d; if (c >= bc) break; }
      if (c < bc) { bc = c; best = i; }
    }
    return [best, bc];
  }
  // segment a→b (plan XZ) coupe-t-il la boîte [x0,x1]×[z0,z1] ?
  // point poussé hors du bloc gonflé du rayon du soldat (un point de prise ou de réa dans le bloc est injoignable : blocage)
  function horsBloc(p, marge) { const B = window.BLOC; if (!B) return p; const r = (marge ?? 0.45); const x0 = B.x - r, x1 = B.x + B.w + r, z0 = B.z - r, z1 = B.z + B.d + r; if (p.x <= x0 || p.x >= x1 || p.z <= z0 || p.z >= z1) return p; const c = [[p.x - x0, -1, 0], [x1 - p.x, 1, 0], [p.z - z0, 0, -1], [z1 - p.z, 0, 1]].sort((a, b) => a[0] - b[0])[0]; p.x += c[1] * (c[0] + 0.02); p.z += c[2] * (c[0] + 0.02); return p; }
  function segCoupeBoite(a, b, x0, x1, z0, z1) { let t0 = 0, t1 = 1; const dx = b.x - a.x, dz = b.z - a.z; for (const [p0, d, lo, hi] of [[a.x, dx, x0, x1], [a.z, dz, z0, z1]]) { if (Math.abs(d) < 1e-9) { if (p0 < lo || p0 > hi) return false; continue; } let ta = (lo - p0) / d, tb = (hi - p0) / d; if (ta > tb) [ta, tb] = [tb, ta]; t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return false; } return true; }
  function cout(i, req) { const { nF, fn } = Base; let c = 0; const o = i * nF; for (let k = 0; k < nF; k++) { const d = fn[o + k] - req[k]; c += d * d; } return c; }

  // IK deux os : tourne H (racine) et K (milieu) pour amener A (extrémité) sur cibleA ; garde l'orientation mondiale de A.
  // Construction géométrique directe (triangle des longueurs) : le coude/genou reste dans le plan de flexion actuel quand il
  // est bien défini, sinon du côté de `pole` (coudes vers le bas, genoux vers l'avant). La cible est ramenée à portée.
  function ikDeuxOs(H, K, A, cibleA, pole, forcerPole) {
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
    if (forcerPole && pol.lengthSq() > 1e-6) bend = pol.normalize();   // (20/10) garde basse : le coude DOIT suivre le pôle (ouvert à droite, crosse derrière le bras)
    else if (pol.lengthSq() > 1e-6) {
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
      { const [, , A, T] = this.jambes[0]; if (A && T) { const a = A.getWorldPosition(V3()), t = T.getWorldPosition(V3()); const hz = Math.hypot(t.x - a.x, t.z - a.z); if (hz > 1e-3) this.ratioPied = (t.y - a.y) / hz; } }   // pente cheville → orteils du modèle à plat (pose de liaison)
      { const [, , A] = this.jambes[0]; if (A) this.chevilleY = A.getWorldPosition(V3()).y - this.solY; }
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
    // arme en bandoulière dans le dos (sauvetage : les deux mains sont prises) : fondu 0,4 s depuis / vers la tenue
    porterDos(dt, actif) {
      const w = this.fusil; if (!w) return 0;
      this.poidsDos = Math.max(0, Math.min(1, (this.poidsDos ?? 0) + (actif ? 1 : -1) * dt / 0.4));
      const k = this.poidsDos; if (k <= 0) return 0;
      // (demande utilisateur 20/10) : arme à la sangle, pendue le long de la jambe droite, canon vers le bas et un peu en
      // avant, plaquée contre la cuisse (dessus de l'arme vers l'extérieur) — pas en travers du dos. Attachée aux hanches :
      // elle suit le bassin (pas le buste penché) comme une arme qui pend à la bandoulière.
      const hp = this.hips, qS = hp.getWorldQuaternion(Q()), pS = hp.getWorldPosition(V3());
      const al = this.align[Base.meta.os.indexOf('Hips')];
      const avant = V3(0, 0, 1).applyQuaternion(qS).applyQuaternion(al).normalize(), haut = V3(0, 1, 0).applyQuaternion(qS).applyQuaternion(al).normalize(), droite = avant.clone().cross(haut).normalize();
      const centre = pS.clone().addScaledVector(droite, 0.21).addScaledVector(haut, -0.16).addScaledVector(avant, -0.02);
      const axe = haut.clone().multiplyScalar(-0.93).addScaledVector(avant, 0.33).addScaledVector(droite, 0.08).normalize();   // direction de la bouche : vers le bas, un peu en avant
      const qd = Q().setFromUnitVectors(V3(0, 0, 1), axe);
      const upA = V3(0, 1, 0).applyQuaternion(qd), upV = droite.clone().projectOnPlane(axe).normalize(), upC = upA.clone().projectOnPlane(axe).normalize();
      const qFinal = (upV.lengthSq() > 1e-6 && upC.lengthSq() > 1e-6 ? Q().setFromUnitVectors(upC, upV) : Q()).multiply(qd);   // dessus de l'arme vers l'extérieur du dos
      const posDos = centre.clone();
      if (!this.fusilPosDos) { this.fusilPosDos = posDos.clone(); this.fusilQDos = qFinal.clone(); }
      this.fusilPosDos.copy(posDos); this.fusilQDos.copy(qFinal);   // attache RIGIDE aux hanches (demande 20/10 : lissée, elle « volait » derrière lui en marchant / courant)
      if (k >= 0.999 || !this.fusilQAff) { w.position.copy(this.fusilPosDos); w.quaternion.copy(this.fusilQDos); }
      else { w.position.lerp(this.fusilPosDos, k); w.quaternion.slerp(this.fusilQDos, k); }
      w.visible = true; return k;
    }
    // (20/10 : « bras en T ») mains libres et accroupi : les clips Crouched de 100STYLE ont les bras tendus à l'horizontale (ils
    // tiennent une arme imaginaire) ; on ramène les mains au repos devant les cuisses (IK), poids = accroupi × mains libres
    brasRepos(w, dt) {
      // tenu encore 0,6 s après la sortie de l'accroupi (fondu 0,25 s) : le fondu des clips accroupis → debout (0,3 s) laissait
      // les bras en T une fraction de seconde quand il se relève en rangeant l'arme (retour utilisateur 20/10)
      const prof = Math.max(0, Math.min(1, (this.profondeur || 0) / 0.3));
      if (prof >= 0.999 && w > 0.5) this.reposTenu = 0.6; else this.reposTenu = Math.max(0, (this.reposTenu || 0) - (dt || 1 / 60));
      w = Math.max(0, Math.min(1, w)) * Math.max(prof, Math.min(1, this.reposTenu / 0.25)); if (w <= 0.001) return;
      const D = this.mains.D, G = this.mains.G; if (D.some(x => !x) || G.some(x => !x)) return;
      const hp = this.hips, qS = hp.getWorldQuaternion(Q()), pS = hp.getWorldPosition(V3()), al = this.align[Base.meta.os.indexOf('Hips')];
      const avant = V3(0, 0, 1).applyQuaternion(qS).applyQuaternion(al).setY(0).normalize(), droite = avant.clone().cross(V3(0, 1, 0)).normalize();
      for (const [main, sg] of [[D, 1], [G, -1]]) {
        const cible = pS.clone().addScaledVector(droite, sg * 0.24).addScaledVector(avant, 0.22).add(V3(0, -0.12, 0));
        const pA = main[2].getWorldPosition(V3()); cible.lerp(pA, 1 - w);
        ikDeuxOs(main[0], main[1], main[2], cible, V3(0, -0.6, 0).addScaledVector(droite, sg * 0.7).addScaledVector(avant, -0.3).normalize());
      }
    }
    tenirFusil(actif, dt) {
      const w = this.fusil; if (!w) return;
      if (this.dos && (this.poidsDos ?? 0) >= 0.999) { this.porterDos(dt, true); for (const d of this.doigts) d.os.quaternion.copy(d.repos); this.paM = 0; this.brasRepos(1, dt); return; }
      // fondu : la prise s'installe / se défait en ~0,25 s (mains, doigts), le fusil apparaît quand la prise est à moitié faite
      this.poidsArme = Math.max(0, Math.min(1, (this.poidsArme ?? 0) + (actif ? 1 : -1) * dt / 0.25));
      const pa = this.poidsArme; w.visible = pa > 0.5;
      if (pa <= 0) { for (const d of this.doigts) d.os.quaternion.copy(d.repos); this.fusilPos = null; this.fusilPosLoc = null; this.paM = 0; this.brasRepos(1, dt); return; }
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
        // l'arme ne peut pas viser plus loin que ce que le tronc permet (≤ 1,1 rad des hanches) : si la caméra tourne plus
        // vite que le corps, l'arme suit le corps et le rattrape — jamais de bras qui visent derrière le dos
        const yawH = Math.atan2(avant.x, avant.z);
        let e = this.viseeYaw - yawH; e = Math.atan2(Math.sin(e), Math.cos(e)); const eA = Math.max(-1.1, Math.min(1.1, e)); torsion = Math.max(-1.0, Math.min(1.0, e)) * pv;
        const yawA = yawH + eA, dCible = V3(Math.sin(yawA), 0, Math.cos(yawA)); dir.lerp(dCible, pv); if (dir.lengthSq() < 1e-4) dir.copy(dCible); dir.normalize();
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
      // accroupi : l'offset vertical de la crosse suit le buste penché (sinon l'arme remonte au menton)
      const upB = V3(0, 1, 0).applyQuaternion(qS).applyQuaternion(this.align[Base.meta.os.indexOf('Spine2')]).normalize(); const upA = V3(0, 1, 0).lerp(upB, this.profondeur || 0).normalize();
      const creux = pS2.clone().addScaledVector(dir, P.avant + avantPlus).addScaledVector(droite, P.droite).addScaledVector(upA, P.haut);
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
      let tangage = P.tangage + ((this.aCouvert ? (L.tangageCouvert ?? -0.9) : L.tangage) - L.tangage) * (1 - pv);   // à couvert : canon entre les genoux (ne touche pas le bloc)
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
      if (this.dos || (this.poidsDos || 0) > 0) this.porterDos(dt, !!this.dos);   // vers / depuis la bandoulière : mélange avec la tenue
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
        // retour de la bandoulière : l'arme vient du dos en 0,8 s, les mains ne la prennent que sur la seconde moitié
        // (sinon l'IK visait la poignée derrière l'épaule : bras tendu en l'air sans but)
        // (20/10 : « bras en T » quand il range / reprend l'arme) : les mains ne tiennent l'arme que quand elle est (presque) en
        // place dans les mains (poidsDos < 0,15) ; pendant le trajet vers / depuis la hanche elles suivent l'animation — avant,
        // elles visaient la poignée en mouvement et le bras gauche se tendait sur le côté
        const paM = this.paM = pa * Math.max(0, Math.min(1, (0.15 - (this.poidsDos || 0)) / 0.15));
        cible = mainData.clone().lerp(cible, paM);
        // pôles : coudes vers le bas ; le droit rentré vers le corps (pas d'« aile de poulet »), le gauche un peu en arrière
        const pole = k === 'D' ? V3(0, -1, 0).addScaledVector(dir, -0.25 + (1 - pv) * 0.15).addScaledVector(droite, (1 - pv) * 0.5 - pv * 0.5).normalize() : V3(0, -1, 0).addScaledVector(dir, -0.35).normalize();
        ikDeuxOs(main[0], main[1], main[2], cible, pole, k === 'D' && pv < 0.5);   // garde basse : coude droit forcé vers l'extérieur (la crosse passe entre les côtes et le bras)
        const qw = qData.clone().slerp((this.fusilQAff || this.fusilQ).clone().multiply(pr.q), paM);
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
      for (const d of this.doigts) if (d.prise) d.os.quaternion.copy(d.repos).slerp(d.prise, (this.paM ?? pa) * (d.indexD ? pv : 1));   // index droit : tendu hors de la détente en low ready, sur la détente en visée
      this.brasRepos(1 - (this.paM ?? pa), dt);
      // épaulé : la tête se penche vers la crosse (joue sur la crosse) et baisse un peu vers le viseur
      const tete = this.os[Base.meta.os.indexOf('Head')];
      if (tete && pv > 0.001) {
        // (20/10, photo de référence) la tête ne suit plus le buste vrillé ni le clip : elle est ORIENTÉE sur l'arme — regard
        // dans l'axe du canon, visage penché de `joue` vers le bas (on regarde « sous les sourcils »), roulé de `rouleTete`
        // vers la crosse. Repère « regard » de la tête = pose de liaison (bindQ : +Z devant, +Y dessus).
        const kT = pa * pv, kH = Base.meta.os.indexOf('Head');
        const canonDir = V3(0, 0, 1).applyQuaternion(this.fusilQAff || this.fusilQ).normalize(), dCanon = canonDir.clone().cross(V3(0, 1, 0)).normalize();
        const tF = canonDir.clone().applyAxisAngle(dCanon, -(E.joue ?? 0.22)).normalize();
        const qCible = Q().setFromRotationMatrix(new THREE.Matrix4().lookAt(V3(), tF.clone().negate(), V3(0, 1, 0))).premultiply(Q().setFromAxisAngle(tF, E.rouleTete ?? 0.3));
        const qActuel = tete.getWorldQuaternion(Q()).multiply(this.bindQ[kH].clone().invert());
        const qT = qCible.multiply(qActuel.invert());
        // moitié sur le cou (la tête descend et avance vers la crosse), moitié sur la tête
        const couOs = this.os[Base.meta.os.indexOf('Neck')], qT2 = Q().slerp(qT, 0.5 * kT);
        for (const o of [couOs, tete]) { if (!o) continue; o.quaternion.copy(o.parent.getWorldQuaternion(Q()).invert().multiply(qT2).multiply(o.getWorldQuaternion(Q()))); o.updateMatrixWorld(true); }
        // la tête vient SUR la crosse : le cou se plie sur le côté (rotation autour de l'axe du regard, à la base du cou), la
        // tête contre-roule d'autant pour garder son orientation → elle se déplace de quelques cm vers la crosse
        const pc = (E.pencheCou || 0) * kT;
        if (couOs && pc) for (const [o, a] of [[couOs, pc], [tete, -pc]]) { const qr = Q().setFromAxisAngle(tF, a); o.quaternion.copy(o.parent.getWorldQuaternion(Q()).invert().multiply(qr).multiply(o.getWorldQuaternion(Q()))); o.updateMatrixWorld(true); }
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
    // accroupi profond : le buste se penche en avant (épaules au-dessus des genoux) — Spine, dans le monde
    pencher(ang) {
      if (Math.abs(ang) < 1e-4) return; const o = this.os[Base.meta.os.indexOf('Spine')]; if (!o) return;
      const droite = V3(-1, 0, 0).applyQuaternion(this.worldQ[0]); const qr = Q().setFromAxisAngle(droite, -ang);
      const wq = o.getWorldQuaternion(Q()); o.quaternion.copy(o.parent.getWorldQuaternion(Q()).invert().multiply(qr).multiply(wq)); o.updateMatrixWorld(true);
      // la tête reste droite (regard vers la menace, pas vers le sol) : contre-rotation de 80 % sur le cou et la tête
      const qc = Q().setFromAxisAngle(droite, ang * 0.8);
      for (const n of ['Neck', 'Head']) { const h = this.os[Base.meta.os.indexOf(n)]; if (!h) continue; const q2 = Q().slerp.call(Q(), qc, 0.5); const hw = h.getWorldQuaternion(Q()); h.quaternion.copy(h.parent.getWorldQuaternion(Q()).invert().multiply(q2).multiply(hw)); h.updateMatrixWorld(true); }
      this.group.updateMatrixWorld(true);
    }
    verrouPieds(contacts, dt) {
      for (let k = 0; k < 2; k++) {
        const [H, K, A, T] = this.jambes[k]; const vr = this.verrous[k]; if (!H || !K || !A || !T) continue;
        if (!vr.delta) { vr.delta = V3(); vr.deltaV = V3(); }
        const pT = T.getWorldPosition(V3());
        if (contacts[k] && !vr.actif) { vr.actif = true; vr.cible.copy(pT); }
        if (!contacts[k]) vr.actif = false;
        if (vr.actif) {
          const voulu = vr.cible.clone().sub(pT); voulu.y = 0;
          const cap = this.pivot ? 0 : this.reposTotal ? 0.3 : PARAMS.verrouMax;        // pivot sur place : les pieds tournent avec le corps                     // au repos, les appuis ne bougent plus du tout                                            // au-delà, le pied « dérape » plutôt que d'être traîné
          if (voulu.length() > cap) { vr.cible.sub(voulu.clone().setLength(voulu.length() - cap)); voulu.setLength(cap); }
          // l'écart rejoint la valeur voulue avec une demi-vie courte (pas de saut à la pose du pied)
          const x = [vr.delta.x - voulu.x, 0, vr.delta.z - voulu.z], v = [vr.deltaV.x, 0, vr.deltaV.z];
          decroit(x, v, 0.04, dt); vr.delta.set(voulu.x + x[0], 0, voulu.z + x[2]); vr.deltaV.set(v[0], 0, v[2]);
        } else {
          const x = [vr.delta.x, 0, vr.delta.z], v = [vr.deltaV.x, 0, vr.deltaV.z];
          decroit(x, v, 0.08, dt); vr.delta.set(x[0], 0, x[2]); vr.deltaV.set(v[0], 0, v[2]);
        }
        const desc = this.descActuelle || 0;        // accroupi profond : les hanches sont descendues, les pieds restent au sol
        if (vr.delta.lengthSq() < 1e-8 && desc < 1e-4 && !(this.squat > 0.001)) continue;
        // genou vers l'avant du personnage (et un peu vers l'extérieur en squat) ; la cible est ramenée à portée par ikDeuxOs
        const pA = A.getWorldPosition(V3());
        const pole = V3(0, 0, 1).applyQuaternion(this.worldQ[0]).addScaledVector(V3(1, 0, 0).applyQuaternion(this.worldQ[0]), (k ? -0.4 : 0.4) * (this.profondeur || 0)).normalize();
        // squat de combat (à l'arrêt, accroupi profond) : les pieds viennent sous les genoux — en avant et écartés des hanches
        // (jambes de 0,69 m sur ce modèle : avec les pieds du clip, décalés en arrière, un genou se posait au sol)
        let cibleA = pA.clone().add(vr.delta).add(V3(0, desc, 0));
        const sq = this.squat || 0;
        if (sq > 0.001) {
          const hp = this.hips.getWorldPosition(V3()), fwd = V3(0, 0, 1).applyQuaternion(this.worldQ[0]), lat = V3(1, 0, 0).applyQuaternion(this.worldQ[0]);
          const stance = V3(hp.x, (this.chevilleY ?? 0.14) + 0.02, hp.z).addScaledVector(fwd, PARAMS.accroupi.avantPieds).addScaledVector(lat, (k ? -1 : 1) * PARAMS.accroupi.ecartPieds);
          cibleA.lerp(stance, sq);
        }
        ikDeuxOs(H, K, A, cibleA, pole);
        if ((this.profondeur || 0) > 0.01) {   // squat : pied à plat (talon au sol), pas sur la pointe
          const pA2 = A.getWorldPosition(V3()), pT2 = T.getWorldPosition(V3()), dirP = pT2.clone().sub(pA2); const plat = dirP.clone(); plat.y = (this.ratioPied ?? -0.8) * Math.hypot(dirP.x, dirP.z);   // pied à plat = même pente cheville → orteils que debout
          if (dirP.lengthSq() > 1e-6 && plat.lengthSq() > 1e-6) { const qc = Q().setFromUnitVectors(dirP.normalize(), plat.normalize()); const qp = Q().identity().slerp(qc, Math.min(1, this.profondeur * 2)); const wq = A.getWorldQuaternion(Q()); A.quaternion.copy(A.parent.getWorldQuaternion(Q()).invert().multiply(qp).multiply(wq)); A.updateMatrixWorld(true); }
        }
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
      // accroupi : hauteur de hanches VISÉE (les clips Crouched varient de 0,74 à 0,85 m), descente = écart × profondeur
      let h0 = (poseY[0] + this.offY[0]) * this.echelle + this.solY;
      // (20/10 : « il sautille » en courant) : le rebond vertical des hanches du clip de course (9 cm, accéléré ×1,35) est
      // atténué autour d'une moyenne lente quand l'agent le demande (course rapide : facteur 0,35)
      this.hMoy = this.hMoy == null ? h0 : this.hMoy + (h0 - this.hMoy) * (1 - Math.exp(-dt / 0.4));
      h0 = this.hMoy + (h0 - this.hMoy) * (this.attenueBob ?? 1);
      const desc = this.descActuelle = Math.max(0, h0 - PARAMS.accroupi.hanches) * (this.profondeur || 0);
      const h = h0 - desc;
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
        const dernier = this.cheminFin && this.cheminIdx >= this.chemin.length - 1;
        const c = this.chemin[dernier ? this.chemin.length - 1 : this.cheminIdx % this.chemin.length], d = c.clone().sub(this.pos); d.y = 0;
        if (dernier) {   // dernier point d'un chemin à arrivée précise (couvert) : freinage proportionnel, arrivé à 8 cm
          if (d.length() < 0.08) { this.arriver(); return V3(); }
          // garde-fou : à moins de 30 cm du but mais bloqué (l'animation n'avance plus, ex. marche arrière en traînant) pendant
          // 0,6 s → on considère qu'il est arrivé plutôt que de piétiner indéfiniment
          { const ici = this.pos.clone(); if (this.stallPos && d.length() < 0.3 && ici.distanceTo(this.stallPos) < 0.004) { this.stallT = (this.stallT || 0) + 1 / 60; if (this.stallT > 0.6) { this.stallT = 0; this.arriver(); return V3(); } } else this.stallT = 0; this.stallPos = ici; }
          return d.normalize().multiplyScalar(Math.min(this.vitesseChemin || this.vitesses.marche, Math.max(0.25, d.length() / 0.35)));
        }
        if (d.length() < (this.cheminTol || 0.35)) { this.cheminIdx++; return this.vitesseCible(); }   // (cheminTol : passage plus précis, ex. point d'alignement du traînage)
        const v = this.vitesseChemin || (this.touches['ShiftLeft'] || this.touches['ShiftRight'] ? this.vitesses.course : this.vitesses.marche);
        return d.normalize().multiplyScalar(v);
      }
      const d = this.direction(); if (!d) return V3();
      const sprint = this.touches['ShiftLeft'] || this.touches['ShiftRight'];
      let v = sprint ? this.vitesses.course : this.vitesses.marche;
      if (this.verrouRegard) { const m = this.modeVisee(d.clone().multiplyScalar(v)); if (m === 'recul') v = Math.min(v, this.vitesses.lat); else v = Math.min(v, 2.0); }   // à reculons : lent ; en avant arme en joue : glissade tactique ≤ 2 m/s (20/10)
      return d.multiplyScalar(v);
    },
    // Visée (regard verrouillé) : déplacement TACTIQUE, pas de pas chassé. « avant » : il marche vers là où on le pousse
    // (diagonales comprises), le buste et l'arme restent tournés vers la cible (vrille du tronc jusqu'à ~70°) ;
    // « recul » : la cible est derrière le déplacement (> 100°), il marche à reculons en lui faisant face ; hystérésis 10°.
    modeVisee(vGoal) {
      // (20/10) en tirant en marchant / en courant vers le couvert, on raisonne comme sans chemin : corps vers là où il va
      // (le buste vrille vers la menace, tir « mal épaulé » au-delà de ~60°), à reculons seulement si la menace est derrière.
      // Avant : corps verrouillé sur la menace + clips frontaux seulement → il dérivait vers le bloc au lieu d'aller au point.
      if (!this.verrouRegard || (this.chemin && this.chemin.length && !this.tirEnMarchant)) return null;
      if (vGoal.lengthSq() < 1e-4) return 'arret';
      let e = Math.atan2(vGoal.x, vGoal.z) - (this.verrouCible ?? this.camYaw); e = Math.abs(Math.atan2(Math.sin(e), Math.cos(e)));
      this.modeV = e <= (this.modeV === 'recul' ? 1.66 : 1.83) ? 'avant' : 'recul'; return this.modeV;
    },
    // Couvert (règle du jeu, sim/engine.js coverAt / computeCoverPoints) : point à `recul` m du bord du bloc, du côté opposé à
    // la menace ; on y va par le chemin le plus court qui contourne le bloc, on s'y arrête précisément, on s'accroupit face
    // à la menace (arme en garde basse ; clic droit pour épauler).
    couvrir(bloc, menace, marge, opts) {
      marge = marge ?? 0.1; opts = opts || {};
      // menace = un point, ou { liste: [{x,z}, …] } : on se cache de TOUTES les positions ennemies connues (score moyen)
      const liste = menace.liste && menace.liste.length ? menace.liste : [menace];
      const cx = bloc.x + bloc.w / 2, cz = bloc.z + bloc.d / 2, m = liste.reduce((acc, q) => acc.add(V3(q.x - cx, 0, q.z - cz).normalize()), V3()).normalize(); if (m.lengthSq() < 1e-6) m.set(0, 0, -1);
      menace = { x: cx + m.x * 10, z: cz + m.z * 10 };   // direction moyenne (pour le cap « face à la menace »)
      const cotes = [[V3(1, 0, 0), V3(bloc.x + bloc.w, 0, cz)], [V3(-1, 0, 0), V3(bloc.x, 0, cz)], [V3(0, 0, 1), V3(cx, 0, bloc.z + bloc.d)], [V3(0, 0, -1), V3(cx, 0, bloc.z)]];
      // candidat caché = le segment menace → point traverse le bloc (poitrine accroupie sous le haut du bloc) ; parmi les
      // cachés, le plus proche du soldat ; sinon le côté le plus à l'opposé de la menace (règle du jeu : coverAt)
      // caché (œil de l'ennemi à 1,6 m → poitrine accroupie à 0,9 m) par le bloc OU par un mur de la scène (MURS)
      const cacheQ = (q, p) => segCoupeBoite(q, p, bloc.x, bloc.x + bloc.w, bloc.z, bloc.z + bloc.d) || MURS.some(mu => segCoupeBoite3D(V3(q.x, 1.6, q.z), V3(p.x, 0.9, p.z), mu.x, mu.x + mu.w, 0, mu.h, mu.z, mu.z + mu.d));
      const pMs = liste.map(q => V3(q.x, 0, q.z)), pM = V3(menace.x, 0, menace.z), cache1 = (p) => pMs.every(q => cacheQ(q, p));
      // caché = le point ET les deux épaules (±epaules, perpendiculaire à la menace) sont derrière le bloc
      // score de chaque candidat = part de la silhouette (5 rayons sur ±epaules) cachée par le bloc ; le mieux caché gagne,
      // à égalité le plus proche. opts.score(p, n, pMs, cacheQ) remplace ce score (sauvetage : c'est le CORPS traîné qui doit être caché)
      const couvert = (p) => { let tot = 0; for (const q of pMs) { const u = q.clone().sub(p); u.y = 0; u.normalize(); const lat = V3(-u.z, 0, u.x); let n = 0; for (let k = -3; k <= 3; k++) if (cacheQ(q, p.clone().addScaledVector(lat, k / 3 * PARAMS.couvert.epaules))) n++; tot += n / 7; } return tot / pMs.length; };
      // le point glisse le long du bord (±0,5 m, en restant à 0,25 m des coins) pour cacher le plus de silhouette
      const cands = [];
      for (const [n, e] of cotes) { const t = V3(-n.z, 0, n.x), demi = (Math.abs(n.x) > 0.5 ? bloc.d : bloc.w) / 2 - 0.25;
        for (let o = -0.5; o <= 0.5001; o += 0.1) { if (Math.abs(o) > demi) continue; const p = e.clone().addScaledVector(n, PARAMS.couvert.recul).addScaledVector(t, o); cands.push({ p, n, sc: n.dot(m), cv: opts.score ? opts.score(p, n, pMs, cacheQ) : couvert(p), d: this.pos.distanceTo(p), o: Math.abs(o) }); } }
      cands.sort((a, b) => b.cv - a.cv || a.o - b.o || a.d - b.d); const best = cands[0].p; this.couvertScore = cands[0].cv; this.couvertNormale = cands[0].n.clone();
      // contournement : si le segment direct coupe le bloc (gonflé du rayon du soldat), on passe par le coin le plus proche
      const r = PARAMS.couvert.rayon, gx0 = bloc.x - r, gx1 = bloc.x + bloc.w + r, gz0 = bloc.z - r, gz1 = bloc.z + bloc.d + r;
      const coupe = (a, b) => segCoupeBoite(a, b, gx0, gx1, gz0, gz1); const _ancien = (a, b) => { let t0 = 0, t1 = 1; const dx = b.x - a.x, dz = b.z - a.z; for (const [p0, d, lo, hi] of [[a.x, dx, gx0, gx1], [a.z, dz, gz0, gz1]]) { if (Math.abs(d) < 1e-9) { if (p0 < lo || p0 > hi) return false; continue; } let ta = (lo - p0) / d, tb = (hi - p0) / d; if (ta > tb) [ta, tb] = [tb, ta]; t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return false; } return true; };
      const chemin = []; const coins = [V3(gx0 - marge, 0, gz0 - marge), V3(gx1 + marge, 0, gz0 - marge), V3(gx0 - marge, 0, gz1 + marge), V3(gx1 + marge, 0, gz1 + marge)];
      const expo = (c) => cache1(c) ? 0 : 3;   // coin exposé à la menace : 3 m de pénalité (on arrive par le côté abrité)
      if (coupe(this.pos, best)) { const ok = coins.filter(c => !coupe(this.pos, c) && !coupe(c, best)).sort((a, b) => this.pos.distanceTo(a) + a.distanceTo(best) + expo(a) - this.pos.distanceTo(b) - b.distanceTo(best) - expo(b)); if (ok.length) chemin.push(ok[0]); else { const c2 = coins.filter(c => !coupe(this.pos, c)).sort((a, b) => this.pos.distanceTo(a) - this.pos.distanceTo(b))[0]; if (c2) { chemin.push(c2); const c3 = coins.filter(c => !coupe(c2, c) && !coupe(c, best)).sort((a, b) => c2.distanceTo(a) + a.distanceTo(best) - c2.distanceTo(b) - b.distanceTo(best))[0]; if (c3) chemin.push(c3); } } }
      chemin.push(best);
      this.chemin = chemin; this.cheminIdx = 0; this.cheminFin = true; this.couvert = null; this.accroupiApproche = false; this.enRoute = { point: best, yawMenace: Math.atan2(menace.x - best.x, menace.z - best.z) }; this.verrouCible = null;
      return chemin;
    },
    arriver() { this.tirEnMarchant = false; this.sprint = false; this.cheminTol = null; if (this.surArrivee) { const f = this.surArrivee; this.surArrivee = null; this.chemin = null; this.cheminFin = false; f(); return; } if (!this.enRoute) return; this.couvert = this.enRoute; this.enRoute = null; this.chemin = null; this.cheminFin = false; this.accroupi = true; this.verrouCible = this.couvert.yawMenace; },
    yawCible(vGoal) {
      // il regarde là où il va ; bouton droit de la souris maintenu : regard verrouillé sur la direction de la caméra
      // (marche tactique vers la touche, buste vers la cible ; recul si la cible est derrière) — la caméra seule ne fait jamais tourner le soldat
      if (this.verrouRegard && (!(this.chemin && this.chemin.length) || this.tirEnMarchant)) { const m = this.modeVisee(vGoal); if (m !== 'avant') return this.verrouCible ?? this.camYaw; }
      if (this.verrouCible != null && (vGoal.lengthSq() < 1e-4 || this.cheminRecul)) return this.verrouCible;   // à couvert : face à la menace ; traîne un blessé : face à lui, à reculons
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
      if (this.direction() && (this.couvert || this.enRoute)) { this.couvert = null; this.enRoute = null; this.chemin = null; this.cheminFin = false; this.verrouCible = null; if (this.accroupiApproche) { this.accroupi = false; this.accroupiApproche = false; } }   // une touche de déplacement quitte le couvert
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
  // bloc de couverture (m) : hauteur poitrine debout, au-dessus de la tête accroupi — comme les couverts bas du jeu
  const BLOC = window.BLOC = { x: 2.2, z: 3.0, w: 1.6, d: 0.6, h: 1.1 };
  // « bataille » minimale pour le module ragdoll du jeu : horloge, obstacles (le bloc), journal des morts
  const BATAILLE = window.BATAILLE = { t: 0, over: false, log: [], map: { obstacles: [{ x: BLOC.x, z: BLOC.z, w: BLOC.w, d: BLOC.d, h: BLOC.h, kind: 'cover', name: 'bloc' }] } };
  const JOURNAL = window.JOURNAL = []; const PARAMS = window.PARAMS = { rythmeMin: 0.75, rythmeMax: 1.35, accroupi: { hanches: 0.43, marche: 0.55, penche: 0.5, tau: 0.3, avantPieds: 0.2, ecartPieds: 0.21, parDessus: 0.4, approche: 3.0 }, couvert: { recul: 0.7, rayon: 0.4, epaules: 0.35 }, sauvetage: { recul: 0.45, avantMains: 0.6, hautMains: 0.35, vitesse: 1.0, penche: 1.0, flechi: 0.7, depasse: 2.2, margeCoin: 1.4, ecartFace: 0.45, pencheTraine: -0.3, hautMainsTraine: 0.42, avantMainsTraine: 0.4 }, rea: { duree: 3.0, releve: 2.2, cadence: 1.8, amplitude: 0.04, flanc: 0.5 }, graines: [6, 2, 25], capLife: 0.2, capMax: 3.0, warpMax: 0.21, warpMaxVisee: 0.8, rattrapage: 0, margeSaut: 0.5, minSaut: 0.25, periode: 0.1, hLife: 0.15, verrou: true, margeRel: 0.8, verrouMax: 0.08, fusil: { longueur: 0.74, avant: -0.1, droite: 0.25, haut: -0.25, tangage: 0.2, tangageMax: -0.45, tangageCouvert: -0.9, cant: 0.3, roulis: -0.35, buste: 0.3, lissage: 0.08, appuiZ: 0.1, torsion: 0.6, vrille: 0.4 }, epaule: { avant: 0.06, droite: 0.10, haut: -0.015, tangage: 0.0, tangageMax: 0.0, cant: 0.08, roulis: 0.0, vrille: 0.55, joue: 0.22, rouleTete: 0.5, pencheCou: 0.5, poussee: 0.08 }, poids: { pieds: 2.0, vPieds: 1.5, vHanches: 1.0, traj: 1.0, dir: 1.5 } };

  // Un agent = un soldat animé + son contrôleur + son état de lecture dans la base. Le premier est piloté au clavier (ou par
  // son chemin), les autres suivent chacun un chemin : c'est la situation du jeu (IA).
  // -------------------------------------------------------------------------------------------- traîner un blessé à couvert
  // Le sauveteur (agent vivant) va jusqu'à la tête du blessé (ragdoll figé), s'accroupit, le saisit par le col du gilet
  // (deux mains, IK), puis recule jusqu'au point de couvert derrière le bloc en le traînant : le corps du blessé est
  // REMIS EN PHYSIQUE (ragdoll depuis la pose allongée) et son torse est attaché par une articulation à un point tenu
  // dans les mains du sauveteur — jambes qui traînent, bras ballants, tête en arrière viennent de la physique. À l'arrivée
  // il le lâche (le corps se pose), se relève, reprend son arme.
  class Sauvetage {
    constructor(sauveteur, blesse, menace) {
      this.R = sauveteur; this.V = blesse; this.menace = menace; this.etat = 'approche'; this.t = 0; this.poidsMains = 0;
      const S = blesse.soldat, tete = S.os[Base.meta.os.indexOf('Head')].getWorldPosition(V3()), hanches = S.hips.getWorldPosition(V3());
      const axe = tete.clone().sub(hanches); axe.y = 0; if (axe.lengthSq() < 1e-4) axe.set(1, 0, 0); axe.normalize();
      this.axe = axe; const pt = horsBloc(tete.clone().addScaledVector(axe, PARAMS.sauvetage.recul)); pt.y = 0;
      const C = sauveteur.ctl; C.chemin = this.cheminVers(pt); C.cheminIdx = 0; C.cheminFin = true; C.couvert = null; C.enRoute = null; C.verrouCible = null; C.verrouRegard = false; C.tir = false; C.cheminRecul = false; C.vitesseChemin = C.vitesses.course; C.accroupi = false;   // il COURT jusqu'au blessé (freinage proportionnel à l'arrivée)
      C.surArrivee = () => { C.vitesseChemin = null; C.vel.set(0, 0, 0); this.etat = 'prise'; this.t = 0; };
      this.pointPrise = pt;
    }
    // relève sur place (règle du jeu : aucun ennemi vivant ne voit le blessé → pas de traînage) : il va directement au flanc
    surPlace() { const C = this.R.ctl; C.surArrivee = null; C.vitesseChemin = C.vitesses.course; C.accroupi = false; this.reanimer = true; this.allerRea(); const f = C.surArrivee; C.surArrivee = () => { C.vitesseChemin = null; f(); }; return this; }
    // réanimation : il contourne pour se mettre accroupi au flanc du blessé, mains sur la poitrine
    allerRea() {
      const V = this.V, S = this.R.soldat, C = this.R.ctl, sk = V.soldat, pTh = sk.os[Base.meta.os.indexOf('Spine2')].getWorldPosition(V3()), pHi = sk.hips.getWorldPosition(V3()), pTe = sk.os[Base.meta.os.indexOf('Head')].getWorldPosition(V3());
      const axe = pTe.clone().sub(pHi).setY(0).normalize(), lat = V3(-axe.z, 0, axe.x); const cote = lat.dot(S.pos.clone().sub(pTh)) >= 0 ? 1 : -1;
      const cote2 = this.coteRea ? -this.coteRea : cote;   // second essai : l'autre flanc
      const pt = horsBloc(pTh.clone().addScaledVector(lat, cote2 * PARAMS.rea.flanc)).setY(0); this.poitrine = pTh; this.coteRea = cote2;
      C.chemin = this.cheminVers(pt); C.cheminIdx = 0; C.cheminFin = true; C.vitesseChemin = PARAMS.accroupi.marche; C.surArrivee = () => { this.etat = 'rea'; this.t = 0; }; this.etat = 'versRea';
    }
    // chemin vers un point en contournant le bloc (gonflé du rayon du soldat) par un coin s'il est sur la ligne droite —
    // sinon le sauveteur « rampe » le long de la face, bloqué par la collision (relève 6 s de retard)
    cheminVers(pt) { const S = this.R.soldat, r = PARAMS.couvert.rayon + 0.05, gx0 = BLOC.x - r, gx1 = BLOC.x + BLOC.w + r, gz0 = BLOC.z - r, gz1 = BLOC.z + BLOC.d + r; const coupe = (a, b) => segCoupeBoite(a, b, gx0, gx1, gz0, gz1); if (!coupe(S.pos, pt)) return [pt]; const m = 0.3, coins = [V3(gx0 - m, 0, gz0 - m), V3(gx1 + m, 0, gz0 - m), V3(gx0 - m, 0, gz1 + m), V3(gx1 + m, 0, gz1 + m)]; const ok = coins.filter(c => !coupe(S.pos, c) && !coupe(c, pt)).sort((a, b) => S.pos.distanceTo(a) + a.distanceTo(pt) - S.pos.distanceTo(b) - b.distanceTo(pt)); return ok.length ? [ok[0], pt] : [pt]; }
    // col du gilet du blessé (haut du torse, légèrement vers le dos) : là où les mains vont VRAIMENT chercher la prise
    pointCol() { const V = this.V, m = V.mort && V.mort.m, r = m && m.rag; if (r && r.corps && r.Mo) { const U = r.Mo.U, F = r.Mo.F, p = r.corps[2].pointToWorldFrame(new CANNON.Vec3(U.x * 0.16 - F.x * 0.08, U.y * 0.16 - F.y * 0.08, U.z * 0.16 - F.z * 0.08)); return V3(p.x, p.y, p.z); } return V.soldat.os[Base.meta.os.indexOf('Neck')].getWorldPosition(V3()); }
    // point tenu dans les mains : devant le sauveteur, à hauteur de hanches basses
    pointMains() { const S = this.R.soldat, fwd = V3(Math.sin(S.yaw), 0, Math.cos(S.yaw)); const tr = this.etat === 'traine'; return S.pos.clone().addScaledVector(fwd, tr ? PARAMS.sauvetage.avantMainsTraine : PARAMS.sauvetage.avantMains).setY(tr ? PARAMS.sauvetage.hautMainsTraine : PARAMS.sauvetage.hautMains); }
    attacher() {
      const V = this.V, m = V.mort.m, r = m.rag; if (!r || !r.corps) return false;
      const C = window.CANNON, torse = r.corps[2], W = torse.world; if (!W) return false;
      const pm = this.pointMains();
      // pivot : haut du dos (col du gilet), dans le repère du torse (axe U = vers la tête, F = vers l'avant du corps) ;
      // le point tenu démarre LÀ où est le col (pas d'à-coup), puis suit les mains à ≤ 1,5 m/s (le corps est soulevé)
      const Mo = r.Mo, U = Mo.U, F = Mo.F, loc = new C.Vec3(U.x * 0.16 - F.x * 0.08, U.y * 0.16 - F.y * 0.08, U.z * 0.16 - F.z * 0.08);
      const p0 = torse.pointToWorldFrame(loc); void pm;
      { const S = this.R.soldat, mains = ['D', 'G'].map(k => S.mains[k] && S.mains[k][2] ? S.mains[k][2].getWorldPosition(V3()) : null).filter(Boolean); const c = mains.length ? mains.reduce((a, b) => a.add(b), V3()).multiplyScalar(1 / mains.length) : null; const tete = V.soldat.os[Base.meta.os.indexOf('Head')].getWorldPosition(V3()); EVENEMENTS.push({ t: +horloge.toFixed(2), qui: agents.indexOf(this.R), k: 'prise', dMainsCol: c ? +Math.hypot(c.x - p0.x, c.y - p0.y, c.z - p0.z).toFixed(2) : null, hMains: c ? +c.y.toFixed(2) : null, dPiedsTete: +Math.hypot(S.pos.x - tete.x, S.pos.z - tete.z).toFixed(2), hCol: +p0.y.toFixed(2) }); }
      this.kin = new C.Body({ mass: 0, type: C.Body.KINEMATIC, collisionFilterGroup: 0, collisionFilterMask: 0 }); this.kin.position.set(p0.x, p0.y, p0.z); W.addBody(this.kin);
      this.cons = new C.PointToPointConstraint(torse, loc, this.kin, new C.Vec3(0, 0, 0), 300); W.addConstraint(this.cons);
      // jambes molles qui traînent (pas de coups de pied) : amortissement fort sur cuisses et jambes pendant le traînage
      this.amortis = [8, 9, 10, 11].map(i => [r.corps[i], r.corps[i].linearDamping, r.corps[i].angularDamping]); for (const [b] of this.amortis) { b.angularDamping = 0.98; }   // (pas d'amortissement linéaire : il freinait la chute des jambes, qui « flottaient »)
      this.W = W; return true;
    }
    detacher() { if (this.W && this.cons) { this.W.removeConstraint(this.cons); this.W.removeBody(this.kin); } this.cons = null; this.kin = null; if (this.amortis) for (const [b, l, a] of this.amortis) { b.linearDamping = l; b.angularDamping = a; } this.amortis = null; }
    pas(dt) {
      const R = this.R, C = R.ctl, S = R.soldat, V = this.V; this.t += dt;
      if (this.etat === 'approche') this.poidsMains = Math.max(0, this.poidsMains - dt / 0.3);   // (re)placement : les mains se relâchent
      if (this.etat === 'approche' && C.chemin && C.cheminIdx >= C.chemin.length - 1) {
        // le point de prise suit le corps tant qu'il glisse / se pose (il était figé au départ : le sauveteur arrivait
        // 0,3 m trop près et son genou passait dans la tête du blessé pendant le roulé)
        const tete = V.soldat.os[Base.meta.os.indexOf('Head')].getWorldPosition(V3()), hanches = V.soldat.hips.getWorldPosition(V3());
        const axe = tete.clone().sub(hanches); axe.y = 0; if (axe.lengthSq() > 1e-4) { axe.normalize(); this.axe = axe; const pt = horsBloc(tete.clone().addScaledVector(axe, PARAMS.sauvetage.recul)); pt.y = 0; C.chemin[C.chemin.length - 1].copy(pt); this.pointPrise = pt; }
      }
      if (this.etat === 'approche' && (!C.chemin || !C.surArrivee)) {   // chemin perdu en route (garde-fou) : on le repose
        C.chemin = [this.pointPrise.clone()]; C.cheminIdx = 0; C.cheminFin = true; C.vitesseChemin = C.vitesses.course; C.surArrivee = () => { C.vitesseChemin = null; this.etat = 'prise'; this.t = 0; }; EVENEMENTS.push({ t: +horloge.toFixed(2), qui: agents.indexOf(R), k: 'chemin-repose' });
      }
      if (this.etat === 'approche' && this.t > 12) { EVENEMENTS.push({ t: +horloge.toFixed(2), qui: agents.indexOf(R), k: 'approche-abandon' }); this.finir(); }
      if (this.etat === 'prise') {
        // accroupi partiel, mains vers le col ; à 0,6 s le blessé est repris en physique et attaché, puis on recule
        R.facteurRacine = 0;   // arrêt net : le clip de course continuait à déplacer le sauveteur de ~1 m pendant la prise (il « chopait » le col à 1,3 m du corps)
        // (demande utilisateur 20/10 : « il le chope pas là où il est ») : le contrôleur arrivait encore lancé (2,5 m/s) et glissait
        // de 30-40 cm ; et si le corps a bougé (roulé), le point idéal a changé. Pendant la prise le sauveteur est PINGLÉ
        // puis glisse doucement (≤ 0,8 m/s) vers le point idéal recalculé : tête du blessé + `recul` dans l'axe du corps
        { const tete = V.soldat.os[Base.meta.os.indexOf('Head')].getWorldPosition(V3()), hanches = V.soldat.hips.getWorldPosition(V3()); const ax = tete.clone().sub(hanches); ax.y = 0; if (ax.lengthSq() > 1e-4) { ax.normalize(); const pt = horsBloc(tete.clone().addScaledVector(ax, PARAMS.sauvetage.recul)); pt.y = 0; this.pointIdeal = pt.clone(); this.teteV = tete.clone();
          const rouleFini = this.roule == null || this.roule >= this.rouleTotal - 1e-6;   // pendant le roulé le corps bouge : on attend qu'il soit posé
          const d = pt.sub(S.pos); d.y = 0; const l = d.length(); this.ecartPrise = l;
          // le roulé a déplacé le corps de plus de 25 cm : il se redresse et fait un pas (au pas) jusqu'au nouveau point, puis reprend
          if (rouleFini && l > 0.25 && !this.replace) { this.replace = true; this.etat = 'approche'; this.t = 0; R.facteurRacine = 1; C.accroupi = false; C.profondeurExtra = 0; S.pencheExtra = 0; this.cibleMains = null;
            C.chemin = [this.pointIdeal.clone()]; C.cheminIdx = 0; C.cheminFin = true; C.vitesseChemin = C.vitesses.marche; C.surArrivee = () => { C.vitesseChemin = null; C.vel.set(0, 0, 0); this.etat = 'prise'; this.t = 0.6; }; EVENEMENTS.push({ t: +horloge.toFixed(2), qui: agents.indexOf(R), k: 'replace', ecart: +l.toFixed(2) }); return; }
          if (l > 0.01 && rouleFini) { d.multiplyScalar(Math.min(l, 0.8 * dt) / l); S.pos.add(d); } C.pos.copy(S.pos); C.vel.set(0, 0, 0); C.verrouCible = Math.atan2(tete.x - S.pos.x, tete.z - S.pos.z); } }
        C.accroupi = false; C.profondeurExtra = PARAMS.sauvetage.flechi + 0.25; S.pencheExtra = PARAMS.sauvetage.penche; this.poidsMains = Math.min(1, this.poidsMains + dt / 0.5);
        { const col = this.pointCol(); col.y = Math.max(col.y + 0.03, 0.16); this.cibleMains = col; }   // les mains vont au col RÉEL du blessé (il était pris « dans le vide » 20-30 cm devant le corps)
        // blessé à plat ventre : on le roule sur le dos (rotation du squelette autour de son axe hanches → tête, 0,6 s)
        // avant de le reprendre en physique — on traîne un homme sur le dos, tête en arrière, pas sur le ventre
        if (this.t > 0.15 && this.roule == null) { const r0 = V.mort.m.rag; this.roule = 0; this.rouleTotal = 0;
          if (r0 && r0.Mo) { const sk = V.mort.m.skinned.skeleton, S2 = new THREE.Matrix4().multiplyMatrices(sk.bones[r0.Mo.os[2]].matrixWorld, r0.Mo.inv[2]); const F = r0.Mo.F.clone().transformDirection(S2); if (F.y < -0.3) this.rouleTotal = Math.PI; } }
        if (this.roule != null && this.roule < this.rouleTotal) {
          const d = Math.min(this.rouleTotal - this.roule, dt / 1.2 * Math.PI); this.roule += d;
          const hips = V.soldat.hips, tete = V.soldat.os[Base.meta.os.indexOf('Head')].getWorldPosition(V3()), ph = hips.getWorldPosition(V3());
          // axe de roulé AU SOL (y = 0,12) sous le corps : les membres restent près du sol au lieu de passer en l'air
          const axe = tete.clone().sub(ph); axe.y = 0; if (axe.lengthSq() > 1e-4) { axe.normalize(); const q = Q().setFromAxisAngle(axe, d); const wq = hips.getWorldQuaternion(Q()); hips.quaternion.copy(hips.parent.getWorldQuaternion(Q()).invert().multiply(q).multiply(wq));
            const piv = V3(ph.x, 0.12, ph.z), np = ph.clone().sub(piv).applyQuaternion(q).add(piv); hips.position.copy(hips.parent.worldToLocal(np)); hips.updateMatrixWorld(true); }
        }
        // attache quand il est EN PLACE (≤ 12 cm du point idéal, roulé fini), 3,5 s au plus tard
        const enPlace = (this.roule == null || this.roule >= this.rouleTotal - 1e-6) && (this.ecartPrise ?? 0) <= 0.12;
        if (this.t > 1.45 && !this.cons && (enPlace || this.t > 3.5)) {
          const m = V.mort.m; const r0 = m.rag;
          if (r0 && r0.etat === 'physique') { if (!r0.fige) { } m.rag = null; m.update = () => {}; m.anim = { vx: 0, vz: 0 }; m.weapon = null; /* (l'arme est déjà au sol : elle ne revient pas en main) */ BATAILLE.log.push({ kind: 'down', enemy: V.mort.u.id, loc: 'traîné' }); OT.Ragdoll.mort(V.mort.u, m, BATAILLE); OT.Ragdoll.anime(V.mort.u, m, 1 / 60); }
          if (this.attacher()) { this.etat = 'traine'; this.t = 0; this.cibleMains = null; this.planifier(); } else this.etat = 'fin';
        }
      } else if (this.etat === 'traine') {
        const r = V.mort.m.rag; if (r) { r.calme = 0; r.t = Math.min(r.t, 0.5); r.aFiger = false;
          // jambes qui traînent : pas de rebond vers le haut (cuisses et jambes : vitesse verticale montante coupée au-dessus de 15 cm)
          if (r.corps) for (const i of [8, 9, 10, 11]) { const b = r.corps[i]; if (b.position.y > 0.12 && b.velocity.y > 0) b.velocity.y = 0; if (b.position.y > 0.2) b.velocity.y = Math.min(b.velocity.y, -0.6); }   /* jambe dressée dans un virage : ramenée au sol */
          // le corps s'aligne doucement dans l'axe de traction (pendule derrière le sauveteur : il traîne droit, pas en travers)
          // cuisses et jambes ramenées vers la ligne de traction (elles partaient en travers à 70-90°)
          if (r.corps && this.kin) { const hb0 = r.corps[0], kp0 = this.kin.position; const ux = kp0.x - hb0.position.x, uz = kp0.z - hb0.position.z, un = Math.hypot(ux, uz) || 1; const dx = ux / un, dz = uz / un;
            for (const i of [8, 9, 10, 11]) { const b = r.corps[i]; const rx = b.position.x - hb0.position.x, rz = b.position.z - hb0.position.z; const lat = rx * (-dz) + rz * dx; b.velocity.x += -(-dz) * lat * 3 * dt * 10; b.velocity.z += -(dx) * lat * 3 * dt * 10; } }
          if (r.corps && this.kin) { const hb = r.corps[0], kp = this.kin.position; const ax = Math.atan2(kp.x - hb.position.x, kp.z - hb.position.z); const sk = V.mort.m.skinned.skeleton; const hp = sk.bones[r.Mo.os[0]].getWorldPosition(V3()), tp = sk.bones[r.Mo.os[3]].getWorldPosition(V3()); const ac = Math.atan2(tp.x - hp.x, tp.z - hp.z); let e = ax - ac; e = Math.atan2(Math.sin(e), Math.cos(e)); for (const i of [0, 1, 2]) r.corps[i].angularVelocity.y += Math.max(-1.5, Math.min(1.5, e * 2)) * dt * 8; } }
        C.accroupi = false; S.pencheExtra = PARAMS.sauvetage.pencheTraine; C.profondeurExtra = PARAMS.sauvetage.flechi;   // debout genoux fléchis, buste légèrement EN ARRIÈRE (on tire une charge : le poids est derrière les talons, bras tendus devant), pas le style accroupi : on recule à ~1 m/s
        // le sauveteur regarde le blessé (ses hanches) et recule
        const hv = V.soldat.hips.getWorldPosition(V3()); C.verrouCible = Math.atan2(hv.x - S.pos.x, hv.z - S.pos.z);
      } else if (this.etat === 'depose') {
        { const r = V.mort.m.rag; if (r && r.corps && !r.fige) { r.t = Math.min(r.t, 0.3); for (const i of [8, 9, 10, 11]) { const b = r.corps[i]; if (b.position.y > 0.12 && b.velocity.y > -0.5) b.velocity.y = -0.5; if (b.position.y > 0.22) { b.angularVelocity.x *= 0.5; b.angularVelocity.z *= 0.5; } } } }   // le corps se pose : genoux et pieds au sol (pas de genou dressé)
        C.accroupi = true; this.poidsMains = Math.max(0, this.poidsMains - dt / 0.35);   // il reste bas (accroupi) en lâchant, ne se relève jamais à couvert
        S.pencheExtra = PARAMS.sauvetage.pencheTraine * Math.max(0, 1 - this.t / 0.6); C.profondeurExtra = PARAMS.sauvetage.flechi * Math.max(0, 1 - this.t / 0.6);
        if (this.t > 1.2) { C.verrouCible = null; C.cheminRecul = false; C.vitesseChemin = null; S.pencheExtra = 0; C.profondeurExtra = 0; C.accroupi = true;
          if (this.reanimer) this.allerRea(); else this.finir();
        }
      } else if (this.etat === 'versRea') {
        C.accroupi = true; this.poidsMains = Math.max(0, this.poidsMains - dt / 0.35);
        if (this.t > 6) { if (!this.reaEssai) { this.reaEssai = 1; this.allerRea(); } else this.finir(); }   // garde-fou : arrivée impossible → l'autre flanc, puis abandon
      } else if (this.etat === 'rea') {
        // massage cardiaque simplifié : accroupi au flanc, face au blessé, deux mains sur le sternum, pressions à `cadence` Hz
        C.accroupi = true; const pTh = this.poitrine; C.verrouCible = Math.atan2(pTh.x - S.pos.x, pTh.z - S.pos.z);
        const fin = this.t > PARAMS.rea.duree; this.poidsMains = Math.max(0, Math.min(1, this.poidsMains + (fin ? -1 : 1) * dt / 0.4));
        const press = 0.5 - 0.5 * Math.cos(2 * Math.PI * PARAMS.rea.cadence * this.t); this.cibleMains = pTh.clone().setY(pTh.y + 0.10 - PARAMS.rea.amplitude * press);
        S.pencheExtra = 0.35 * this.poidsMains;
        if (fin && this.poidsMains <= 0) { this.cibleMains = null; const yawV = Math.atan2(this.menace.x - pTh.x, this.menace.z - pTh.z); V.relever(yawV); this.finir(); }
      }
      if (this.etat === 'fin') { R.sauvetage = null; C.profondeurExtra = 0; return; }
      // mains vers le col (IK deux os, fondu) ; le point tenu suit LES MAINS telles qu'elles sont (portée des bras), pas l'inverse
      if (this.poidsMains > 0.001) {
        const pm = this.cibleMains || this.pointMains(); const droite = V3(Math.sin(S.yaw + Math.PI / 2), 0, Math.cos(S.yaw + Math.PI / 2)); const mains = [];
        for (const [k, sg] of [['D', 1], ['G', -1]]) {
          const main = S.mains[k]; if (main.some(x => !x)) continue;
          const cible = pm.clone().addScaledVector(droite, sg * 0.11); const pA = main[2].getWorldPosition(V3()); cible.lerp(pA, 1 - this.poidsMains);
          ikDeuxOs(main[0], main[1], main[2], cible, V3(0, -1, 0).addScaledVector(droite, sg * 0.4).normalize()); mains.push(main[2].getWorldPosition(V3()));
        }
        if (this.kin && mains.length === 2) { const c = mains[0].clone().add(mains[1]).multiplyScalar(0.5); c.y -= 0.04; const dtt = Math.max(dt, 1e-3); const k = this.kin.position, d = V3(c.x - k.x, c.y - k.y, c.z - k.z); if (d.length() > 1.5 * dtt) d.setLength(1.5 * dtt); this.kin.velocity.set(d.x / dtt, d.y / dtt, d.z / dtt); this.kin.position.set(k.x + d.x, k.y + d.y, k.z + d.z); }
      }
    }
    finir() { const C = this.R.ctl, S = this.R.soldat; C.chemin = null; C.cheminFin = false; C.surArrivee = null; C.cheminRecul = false; C.vitesseChemin = null; S.pencheExtra = 0; C.profondeurExtra = 0; C.accroupi = true; C.couvert = { point: S.pos.clone(), yawMenace: Math.atan2(this.menace.x - S.pos.x, this.menace.z - S.pos.z) }; C.verrouCible = C.couvert.yawMenace; this.etat = 'fin'; }   // reste accroupi à couvert, face à la menace
    // contrôle à la dépose (« mini IA ») : part des points du corps (tête, hanches, pieds, mains) cachée de toutes les
    // positions ennemies connues → événement `depose` (cache = 0..1) ; sert aux vérifications et au journal de la scène
    controleDepose() {
      const sk = this.V.soldat, liste = (this.menace.liste && this.menace.liste.length) ? this.menace.liste : [this.menace]; let tot = 0, cnt = 0;
      for (const nom of ['Head', 'Hips', 'LeftFoot', 'RightFoot', 'LeftHand', 'RightHand']) { const o = sk.os[Base.meta.os.indexOf(nom)]; if (!o) continue; const p = o.getWorldPosition(V3());
        for (const q of liste) { cnt++; if (!segLibre(V3(q.x, 1.6, q.z), V3(p.x, Math.max(0.25, p.y), p.z))) tot++; } }
      const cache = cnt ? +(tot / cnt).toFixed(2) : 1; this.cacheDepose = cache; if (this.R.cerveau) this.R.cerveau.log('depose', { qui2: agents.indexOf(this.V), cache });
    }
    // chemin à reculons vers le couvert : même règle que couvrir (point caché, contournement) depuis la position du sauveteur
    planifier() {
      // coins contournés avec 1 m de marge (le blessé traîne ~1,2 m derrière le sauveteur et couperait l'angle) ; le sauveteur
      // dépasse le point de couvert de `depasse` m dans la direction d'arrivée pour que ce soit le BLESSÉ qui finisse dessus
      // (demande utilisateur 20/10 : « qu'il se mette BIEN derrière l'obstacle ») : le côté est choisi pour que le CORPS
      // couché (des pieds, à 0,5 m de la face, à la tête, puis le sauveteur accroupi derrière) soit caché de TOUTES les
      // positions ennemies connues (bloc et murs), pas seulement la silhouette du sauveteur au point de couvert.
      // géométrie en L : le sauveteur recule le long de la face à `ecartL` m (même ligne que le coin contourné), puis tout
      // droit le long de la normale sur `droit` m ; le corps (≈ 1,5 m derrière lui) finit dans l'axe, entre `ecartL` et le bout
      const PS = PARAMS.sauvetage, ecartL = PS.margeCoin + PARAMS.couvert.rayon, droit = PS.depasse;
      const score = (p, n, pMs, cacheQ) => { const A = p.clone().addScaledVector(n, ecartL - PARAMS.couvert.recul); let tot = 0, cnt = 0; for (const q of pMs) for (let s = -0.3; s <= droit + 0.01; s += 0.2) { cnt++; if (cacheQ(q, A.clone().addScaledVector(n, s))) tot++; } return cnt ? tot / cnt : 0; };
      const C = this.R.ctl; const ch = C.couvrir(BLOC, this.menace, PARAMS.sauvetage.margeCoin, { score }); C.enRoute = null; C.cheminRecul = true; C.cheminTol = 0.12; C.vitesseChemin = PARAMS.sauvetage.vitesse; C.cheminFin = true;
      // dernier tronçon PERPENDICULAIRE à la face (sa normale, pas la direction de la menace : en diagonale le corps
      // dépassait du bloc), en s'ÉLOIGNANT du bloc : on recule, le corps suit derrière ; il finit perpendiculaire au bloc,
      // pieds vers le bloc, tête plus loin à l'abri (un corps de 1,8 m le long d'un bloc de 1,6 m dépasserait).
      // Un tronçon « aller puis retour » pousserait le corps au lieu de le tirer. Pour que le corps s'ALIGNE sur cet axe,
      // le sauveteur passe d'abord par un point à 0,45 m de la face puis recule tout droit sur ~1,9 m.
      // Le point de couvert (0,55 m de la face) est reculé de `ecartFace` : le blessé traîne 1,2 m derrière et en travers,
      // ses jambes coupaient le coin du bloc (mesuré : hanches à 0,2 m de la face en passant le coin).
      const n = ch.length, fin = ch[n - 1]; const loin = (C.couvertNormale || fin.clone().sub(V3(this.menace.x, 0, this.menace.z))).clone(); loin.y = 0; loin.normalize();
      const A = fin.clone().addScaledVector(loin, ecartL - PARAMS.couvert.recul);   // coude du L, dans l'axe, à `ecartL` de la face
      ch[n - 1] = A; ch.push(A.clone().addScaledVector(loin, droit));
      this.pointDepose = A.clone().addScaledVector(loin, droit * 0.5); this.axeDepose = loin;
      C.surArrivee = () => { this.detacher(); this.etat = 'depose'; this.t = 0; const r = this.V.mort.m.rag; if (r) r.t = 0; this.V.mort.aplatir = true; this.V.mort.aplatirBras = true; this.controleDepose(); };
      return ch;
    }
  }

  class Agent {
    constructor(soldat, ctl) {
      this.soldat = soldat; this.ctl = ctl;
      this.frame = Base.meta.sequences.find(s => /Swat_ID/.test(s.nom)).debut + 10; this.frameT = 0;
      this.poseQ = Base.meta.os.map(() => Q()); this.poseY = [0]; this.ancQ = Base.meta.os.map(() => Q()); this.ancY = [0];
      this.derniereRecherche = (window.RNG_MM ? RNG_MM() : Math.random()) * PARAMS.periode;   // recherches décalées entre agents (graine des presets : scène reproductible)
      this.dernierSaut = -1; this.styleCourant = -1; this.facteurRacine = 1; this.sauts = 0; this.sautsFen = []; this.glisse = new Glissement();
      soldat.poseDe(this.frame, 0, this.poseQ, this.poseY);
    }
    // Mort en ragdoll : module du jeu (web/ragdoll.js, cannon-es) branché sur ce soldat — vitesses tirées de la pose
    // en cours (élan), impulsion de la balle sur la partie touchée (loc : 'tête' | 'membre' | '' torse), collisions sol et bloc.
    tuer(loc, dir) {
      if (this.mort || !window.OT || !OT.Ragdoll || !OT.Ragdoll.dispo()) return false;
      const S = this.soldat; let skin = null; S.gltf.scene.traverse(o => { if (o.isSkinnedMesh && !skin) skin = o; });
      const u = { id: 'agent' + agents.indexOf(this), alive: false, x: S.pos.x, z: S.pos.z, y: 0, w: 0, bleedUntil: 0 };
      const vm = this.vMonde || V3();
      const m = { isSkinned: true, skinned: skin, body: S.group, group: S.group, weapon: S.fusil && S.fusil.visible ? S.fusil : null, anim: { vx: vm.x, vz: vm.z }, bones: { hips: S.hips, head: S.os[Base.meta.os.indexOf('Head')] }, rag: null,
        update: (d) => { const sv = this.mort; this.mort = null; this.pas(d, horloge * 1000); this.mort = sv; }, placeWeapon() {} };
      BATAILLE.log.push({ kind: 'down', enemy: u.id, loc: loc || '' });
      if (!OT.Ragdoll.mort(u, m, BATAILLE)) return false;
      const d = dir ? dir.clone() : V3(Math.sin(S.yaw), 0, Math.cos(S.yaw)).negate(); d.y = -0.05; d.normalize();
      OT.Ragdoll.impact(m, d, 0);
      this.mort = { u, m, t: 0, aplatir: true }; this.ctl.touches = {};   /* genou dressé après le gel : couché (toute mort, pas seulement après traînage) */ this.ctl.chemin = null; this.ctl.couvert = null; this.ctl.enRoute = null;
      return true;
    }
    ressusciter() { if (!this.mort) return; OT.Ragdoll.liberer(this.mort.m); this.mort = null; this.soldat.poseDe(this.frame, 0, this.poseQ, this.poseY); }
    // Se relever (réanimé) : depuis la pose couchée du ragdoll, fondu CINÉMATIQUE (1,6 s) vers la pose accroupie du motion
    // matching, personnage replacé sous le corps couché ; ensuite le motion matching reprend en style accroupi. Pas de clip de
    // relevé dans 100STYLE : c'est un mélange de poses en espace monde (os parent → enfant), hanches qui montent.
    relever(yaw) {
      if (!this.mort) return false; const S = this.soldat;
      const w0 = S.os.map(o => o ? o.getWorldQuaternion(Q()) : null), hip0 = S.hips.getWorldPosition(V3());
      OT.Ragdoll.liberer(this.mort.m); this.mort = null;
      const C = this.ctl; S.pos.set(hip0.x, 0, hip0.z); S.yaw = yaw; C.pos.copy(S.pos); C.vel.set(0, 0, 0); C.acc.set(0, 0, 0); C.yaw = yaw; C.yawV = 0;
      C.touches = {}; C.chemin = null; C.couvert = null; C.enRoute = null; C.verrouCible = null; C.verrouRegard = false; C.tir = false; C.accroupi = true; C.visee = false;
      this.frame = Base.meta.sequences.find(q => /Crouched_ID/.test(q.nom)).debut + 30; this.frameT = 0; S.poseDe(this.frame, 0, this.poseQ, this.poseY); this.ancQ.forEach((q, k) => q.copy(this.poseQ[k])); this.ancY[0] = this.poseY[0];
      for (let k = 0; k < Base.J; k++) { S.offR[k].set(0, 0, 0); S.offRv[k].set(0, 0, 0); } S.offY[0] = 0; S.offYv[0] = 0; S.fusilPos = null; S.fusilPosLoc = null; S.poidsArme = 0;
      this.leve = { t: 0, duree: PARAMS.rea.releve, w0, hip0, yaw }; this.vMonde = V3();
      return true;
    }
    // fondu de relevé : appliqué APRÈS le motion matching du pas (os en espace monde, dans l'ordre parent → enfant)
    leverTic(dt) {
      // (demande utilisateur 20/10 : relevé « bizarre, mains comme assis ») : en trois temps, comme un homme qui se relève
      // du dos — 1) le buste se redresse en s'appuyant sur une main au sol (IK), hanches encore basses ; 2) les jambes se
      // replient sous lui et les hanches montent, la main d'appui reste au sol puis se décolle ; 3) il reprend son arme
      // (fondu de la prise) sur le dernier quart.
      const L = this.leve; if (!L) return; L.t += dt; const u = Math.min(1, L.t / L.duree); const S = this.soldat;
      const ss = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
      const kHaut = ss(u / 0.8), kJambes = ss((u - 0.12) / 0.6), kHanches = ss((u - 0.35) / 0.6);   // jambes repliées tôt (pas de « sit-up » jambes tendues), hanches ensuite
      const jambe = (n) => /UpLeg|Leg|Foot|Toe/.test(n);
      for (let i = 0; i < S.os.length; i++) { const o = S.os[i]; if (!o || !L.w0[i]) continue; const k = jambe(Base.meta.os[i]) ? kJambes : kHaut;
        const wc = o.getWorldQuaternion(Q()); const wb = L.w0[i].clone().slerp(wc, k); const pw = o.parent.getWorldQuaternion(Q()).invert(); o.quaternion.copy(pw.multiply(wb));
        if (o === S.hips) { const pc = o.getWorldPosition(V3()); const pb = L.hip0.clone().lerp(pc, kHanches); pb.y = L.hip0.y + (pc.y - L.hip0.y) * (kHanches * kHanches); o.position.copy(o.parent.worldToLocal(pb)); }
        o.updateMatrixWorld(true); }
      // main d'appui au sol, du côté où il était couché (la main la plus basse au départ), à 35 cm des hanches ; poids 0 → 1 → 0
      // (20/10 : « bras en T ») : le point d'appui part de l'ÉPAULE (sous elle, 18 cm vers l'extérieur), pas de 38 cm des
      // hanches — couché, ce point-là n'était atteignable qu'avec le bras tendu à l'horizontale (pose en T)
      if (!L.appui) { const pD = S.mains.D[2].getWorldPosition(V3()), pG = S.mains.G[2].getWorldPosition(V3()); L.appui = pD.y <= pG.y ? 'D' : 'G'; const ep = S.mains[L.appui][0].getWorldPosition(V3()); const lat = V3(Math.sin(L.yaw + Math.PI / 2), 0, Math.cos(L.yaw + Math.PI / 2)).multiplyScalar(L.appui === 'D' ? 1 : -1); L.pSol = V3(ep.x, 0.03, ep.z).addScaledVector(lat, 0.18).addScaledVector(V3(Math.sin(L.yaw), 0, Math.cos(L.yaw)), -0.08); }
      const wA = ss(u / 0.2) * (1 - ss((u - 0.6) / 0.2)); const main = S.mains[L.appui];
      if (wA > 0.001 && main.every(x => x)) { const pA = main[2].getWorldPosition(V3()); const cible = L.pSol.clone().lerp(pA, 1 - wA); const lat = V3(Math.sin(L.yaw + Math.PI / 2), 0, Math.cos(L.yaw + Math.PI / 2)).multiplyScalar(L.appui === 'D' ? 1 : -1); ikDeuxOs(main[0], main[1], main[2], cible, V3(0, -0.5, 0).addScaledVector(lat, 0.8).normalize()); }
      // (20/10) main libre posée sur le genou du même côté tant que l'arme n'est pas reprise : les clips accroupis ont ce bras
      // tendu à l'horizontale (fait pour tenir une arme) — on le voyait en « T » pendant le relevé
      { const libre = L.appui === 'D' ? 'G' : 'D', mL = S.mains[libre], genou = S.os[Base.meta.os.indexOf(libre === 'D' ? 'RightLeg' : 'LeftLeg')]; const wL = ss(u / 0.3) * (1 - ss((u - 0.72) / 0.12));   // lâche le genou quand la main part vers l'arme
        if (wL > 0.001 && genou && mL.every(x => x)) { const pG = genou.getWorldPosition(V3()); pG.y += 0.06; const pH = mL[2].getWorldPosition(V3()); const cible = pG.lerp(pH, 1 - wL); const lat = V3(Math.sin(L.yaw + Math.PI / 2), 0, Math.cos(L.yaw + Math.PI / 2)).multiplyScalar(libre === 'D' ? 1 : -1); ikDeuxOs(mL[0], mL[1], mL[2], cible, V3(0, -0.4, 0).addScaledVector(lat, 0.6).addScaledVector(V3(Math.sin(L.yaw), 0, Math.cos(L.yaw)), -0.5).normalize()); } }
      if (u >= 0.7 && !this.ctl.visee) { this.ctl.visee = true; }   // dernier tiers : il reprend son arme (20/10 : plus tôt, le bras libre pendait tendu vers le sol)
      if (u >= 1) { this.leve = null; const C = this.ctl; C.visee = true; C.accroupi = true; C.couvert = { point: S.pos.clone(), yawMenace: L.yaw }; C.verrouCible = L.yaw; }   // relevé : reste accroupi à couvert, face à la menace
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
      if (this.mort) return;                                       // ragdoll : les os sont tenus par la physique (voir ragdoll.js)
      const [vGoal, yGoal] = Ctl.pas(dt);
      // recherche toutes les 0,1 s, ou tout de suite si on change de style
      // (20/10) arme à la sangle (sauvetage) : clips neutres (bras qui balancent) — les clips « arme » (Swat / Rushed) ont les
      // bras raides le long du corps, faits pour être posés sur le fusil par l'IK : sans fusil en main ils donnaient un mannequin
      // Seulement quand il MARCHE mains libres (approche du blessé, trajet vers le point de réa) : en traînant (marche arrière,
      // mains au col) le style neutre tombait parfois sur le clip immobile et le soldat glissait au sol (retour utilisateur 20/10).
      const mainsLibres = !!this.sauvetage && (this.sauvetage.etat === 'approche' || this.sauvetage.etat === 'versRea') && S.dos && (S.poidsDos || 0) > 0.5;
      // (20/10 : « il court avec un balai dans les fesses ») : en course rapide (> 2,1 m/s) arme en main, clips de course
      // naturels (Neutral_FR : foulée longue, buste penché) — les clips Swat/Rushed sont une marche rapide raide ; les mains
      // restent posées sur l'arme par l'IK
      // (20/10, photo de référence « course en visant ») : arme épaulée en déplacement rapide = glissade tactique : clips
      // Swat/Rushed (jambes qui se lèvent peu), genoux fléchis, buste penché, vitesse plafonnée à 2 m/s (Ctl.vitesseCible)
      const viseeCourse = !!Ctl.verrouRegard && !Ctl.accroupi && vGoal.lengthSq() > 1.6 * 1.6;
      const courseRapide = !Ctl.verrouRegard && vGoal.lengthSq() > 2.1 * 2.1; S.attenueBob = courseRapide ? 0.15 : 1;
      if (!this.sauvetage) S.pencheExtra = viseeCourse ? 0.18 : 0;
      const styleVoulu = Ctl.accroupi ? 1 : (Ctl.visee && !mainsLibres && !courseRapide) ? 2 : 0;      // 1 = accroupi (Crouched), 2 = Swat (arme), 0 = neutre
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
        const modeV = Ctl.modeVisee(vGoal), recule = modeV === 'recul' || !!Ctl.cheminRecul;
        const seulFrontal = !recule;                                                          // il marche vers là où il va (même en visée)
        const angVoulu = recule && vGoal.lengthSq() > 0.01 ? Math.atan2(vGoal.x, vGoal.z) - S.yaw : null;   // recul en visée : direction voulue dans le repère des hanches
        // piétinement (retour utilisateur 20/10 : « il glisse au sol sans animation ») : on veut avancer mais l'animation reste
        // à l'arrêt depuis > 0,25 s — la recherche retombait toujours sur la même image immobile (minimum local, coût égal au
        // courant) ; on exclut alors les images lentes : la meilleure image EN MOUVEMENT est prise, quel que soit son coût
        this.pietine = vGoal.lengthSq() > 0.25 && vitAnimCour < 0.2 ? (this.pietine || 0) + dt : 0; const seulMobile = this.pietine > 0.25;
        const [best, bc] = chercher(req, styleVoulu, auRepos, arretVoulu, seulFrontal, angVoulu, seulMobile);
        const cc = (!finClip && !seulMobile && Base.ok[f] && Base.style[f] === styleVoulu && (!auRepos || Base.repos[f]) && (!arretVoulu || Base.arret[f]) && (!seulFrontal || Base.frontal[f]) && dirOk(f, angVoulu)) ? cout(f, req) : Infinity;
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
          this.dernierSaut = horloge; S.hLife = styleVoulu !== this.styleCourant ? 0.3 : PARAMS.hLife;   // changement de style (debout ↔ accroupi) : fondu plus long
          // transition : écart entre la pose courante (telle qu'affichée) et la nouvelle
          for (let k = 0; k < Base.J; k++) this.ancQ[k].copy(this.poseQ[k]); this.ancY[0] = this.poseY[0];
          this.frame = best; this.frameT = 0; S.poseDe(this.frame, 0, this.poseQ, this.poseY);
          S.transition(this.ancQ, this.ancY, this.poseQ, this.poseY); this.sauts++; this.sautsFen.push(now);
        }
        this.styleCourant = styleVoulu;
      }
      // avance dans la séquence
      // rythme : la lecture est accélérée / ralentie (×0,75 à ×1,35, lissé 0,3 s) pour que la vitesse du clip colle à la
      // vitesse voulue — les clips 100STYLE marchent à 0,9 m/s et reculent à 0,5 m/s, le jeu demande 1,25 et 1,0
      { const vc = Math.hypot(Base.v[this.frame * 3], Base.v[this.frame * 3 + 2]), vg = Math.sqrt(vGoal.lengthSq()); const voulu = vc > 0.3 && vg > 0.3 ? Math.max(PARAMS.rythmeMin, Math.min(PARAMS.rythmeMax, vg / vc)) : 1;
        this.rythme = (this.rythme ?? 1) + (voulu - (this.rythme ?? 1)) * (1 - Math.exp(-dt / 0.3)); }
      const dtR = dt * this.rythme;
      this.frameT += dtR * Base.meta.fps;
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
      S.yaw += w[i] * dtR * this.facteurRacine;
      // Correction de cap (« rotation warping ») : la base ne contient pas tous les virages, et la recherche se contentait
      // souvent d'une marche qui tourne doucement (D → 50° au lieu de 90°, parfois du mauvais côté). Quand on veut se
      // déplacer, le cap du soldat est ramené vers le cap voulu en plus de la rotation du clip (demi-vie 0,2 s, ≤ 3 rad/s) ;
      // le verrou des pieds garde les appuis en place pendant le virage.
      // (le cap corrigé est celui du DÉPLACEMENT : en style Swat les hanches sont bladées de ~12° par rapport à la marche,
      // et les clips capturés serpentent ; l'angle vitesse/hanches du clip, lissé, est compensé pour que le soldat aille
      // exactement là où on le pousse, sans glissement des pieds)
      let errCapR = yGoal - S.yaw; errCapR = Math.atan2(Math.sin(errCapR), Math.cos(errCapR)); const pivote = vGoal.lengthSq() < 0.01 && Math.abs(errCapR) > 0.05;   // pivot sur place (visée, caméra tournée)
      if ((vGoal.lengthSq() > 0.01 && this.facteurRacine > 0.5) || pivote) {
        const vLoc = Math.hypot(v[i * 3], v[i * 3 + 2]) > 0.3 ? Math.atan2(v[i * 3], v[i * 3 + 2]) : (this.biaisVit || 0);   // angle vitesse / hanches du clip
        this.biaisVit = this.biaisVit == null ? vLoc : this.biaisVit + Math.atan2(Math.sin(vLoc - this.biaisVit), Math.cos(vLoc - this.biaisVit)) * (1 - Math.exp(-dt / 0.2));
        // regard verrouillé (visée) : ce sont les hanches qui doivent faire face à la caméra, pas le déplacement (pas chassé,
        // recul) — sans cette distinction le soldat tournait sur lui-même en visant
        const recule = Ctl.modeVisee(vGoal) === 'recul' || !!Ctl.cheminRecul;
        let err = yGoal - (recule ? S.yaw : S.yaw + this.biaisVit); err = Math.atan2(Math.sin(err), Math.cos(err));
        if (pivote) err = errCapR;
        const corr = Math.max(-PARAMS.capMax * dt, Math.min(PARAMS.capMax * dt, err * (1 - Math.exp(-dt / (pivote ? 0.3 : PARAMS.capLife)))));
        S.yaw += corr * (pivote ? 1 : this.facteurRacine);
      }
      // résidu : le déplacement de l'image est tourné vers la direction voulue (≤ 12°, les clips serpentent) ; le verrou des
      // pieds absorbe ce petit écart
      // (regard verrouillé : les hanches font face à la caméra, c'est donc ce redressement seul qui donne la direction du pas
      // chassé / du recul ; limite plus large, le verrou des pieds absorbe l'écart)
      if (vGoal.lengthSq() > 0.01 && vl.lengthSq() > 0.09) {
        const lim = Ctl.modeVisee(vGoal) === 'recul' || Ctl.cheminRecul ? PARAMS.warpMaxVisee : PARAMS.warpMax;
        let e = Math.atan2(vGoal.x, vGoal.z) - Math.atan2(vl.x, vl.z); e = Math.atan2(Math.sin(e), Math.cos(e));
        vl.applyAxisAngle(UP, Math.max(-lim, Math.min(lim, e)));
      }
      S.pos.addScaledVector(vl, dtR * this.facteurRacine); this.vMonde = vl.clone().multiplyScalar(this.facteurRacine * this.rythme);
      // bloc : on ne le traverse pas (le soldat est un cercle de PARAMS.couvert.rayon)
      if (BLOC) { const r = PARAMS.couvert.rayon, nx = Math.max(BLOC.x, Math.min(BLOC.x + BLOC.w, S.pos.x)), nz = Math.max(BLOC.z, Math.min(BLOC.z + BLOC.d, S.pos.z)); const dx = S.pos.x - nx, dz = S.pos.z - nz, dd = Math.hypot(dx, dz); if (dd < r) { if (dd < 1e-6) S.pos.x = nx - r; else { S.pos.x = nx + dx / dd * r; S.pos.z = nz + dz / dd * r; } } }
      // à couvert : recalage final sur le point (≤ 10 cm, pendant la descente)
      if (Ctl.couvert && vGoal.lengthSq() < 0.01) { const d = Ctl.couvert.point.clone().sub(S.pos); d.y = 0; if (d.length() > 0.005) S.pos.addScaledVector(d, 1 - Math.exp(-dt / 0.3)); }
      // accroupi profond (couvert) : à l'arrêt on descend de `descente`, en marche les clips Crouched + un peu ; lissé
      // approche d'un couvert : on s'abaisse à moins de `approche` m du point ; à couvert en visée : squat haut pour tirer PAR-DESSUS le bloc
      if (Ctl.enRoute && !Ctl.accroupi && Ctl.chemin) { let dist = 0, prev = S.pos; for (let i = Math.min(Ctl.cheminIdx, Ctl.chemin.length - 1); i < Ctl.chemin.length; i++) { dist += prev.distanceTo(Ctl.chemin[i]); prev = Ctl.chemin[i]; } if (dist < PARAMS.accroupi.approche) { Ctl.accroupi = true; Ctl.accroupiApproche = true; } }
      const parDessus = Ctl.couvert && Ctl.verrouRegard;
      // visée par-dessus : on se redresse juste assez pour que la bouche du canon passe 8 cm au-dessus du bloc (asservi)
      if (parDessus && S.fusil && S.fusilQAff) { const by = S.fusil.position.clone().add(S.fusil.bouchePt.clone().applyQuaternion(S.fusilQAff)).y; this.profVisee = Math.max(0, Math.min(1, (this.profVisee ?? PARAMS.accroupi.parDessus) + (by - (BLOC.h + 0.08)) * 1.5 * dt)); } else this.profVisee = PARAMS.accroupi.parDessus;
      const profVoulue = Math.max(Ctl.profondeurExtra || 0, viseeCourse ? 0.22 : 0, Ctl.accroupi ? (parDessus ? this.profVisee : vGoal.lengthSq() < 0.01 ? 1 : PARAMS.accroupi.marche) : 0);
      S.profondeur = (S.profondeur || 0) + (profVoulue - (S.profondeur || 0)) * (1 - Math.exp(-dt / PARAMS.accroupi.tau));
      const squatVoulu = Ctl.accroupi && vGoal.lengthSq() < 0.01 && !parDessus ? 1 : 0;
      S.squat = (S.squat || 0) + (squatVoulu - (S.squat || 0)) * (1 - Math.exp(-dt / 0.35));
      S.aCouvert = !!Ctl.couvert;
      Ctl.pos.copy(S.pos); Ctl.yaw = S.yaw;
      S.appliquer(this.poseQ, this.poseY, dt);
      // appui = la base dit « en appui » ET l'orteil affiché est bas (juste après un saut de séquence, la pose affichée est
      // encore un mélange : un pied en l'air ne doit ni être verrouillé ni compter comme glissement)
      const cf = Base.contact[this.frame];
      const contacts = S.orteils.map((o, k) => !!(cf & (k ? 1 : 2)) && o.getWorldPosition(V3()).y < seuilOrteil);
      S.reposTotal = vGoalNul && this.facteurRacine < 0.05; S.pivot = pivote && Math.abs(errCapR) > 0.15;
      S.pencheLisse = (S.pencheLisse ?? 0) + ((S.pencheExtra || 0) - (S.pencheLisse ?? 0)) * (1 - Math.exp(-dt / 0.3));   /* penché extra lissé (prise 0,65 → traînage −0,2 sans à-coup) */
        S.pencher((S.profondeur || 0) * PARAMS.accroupi.penche * (1 - 0.7 * (S.poidsVisee || 0)) + S.pencheLisse);   // en visée le buste se redresse (joue sur la crosse)
      if (PARAMS.verrou) S.verrouPieds(contacts, dt);
      // tir (clic gauche maintenu en visée) : cadence soutenue du fusil d'assaut du jeu (110 coups/min), recul 1 → 0 en 0,1 s
      this.recul = Math.max(0, (this.recul || 0) - dt * 10); this.tirAcc = Math.max(0, (this.tirAcc || 0) - dt);
      if (Ctl.tir && Ctl.visee && Ctl.verrouRegard && (S.poidsVisee || 0) > 0.9 && this.tirAcc <= 0) { this.recul = 1; this.tirAcc = 60 / 110; this.tirs = (this.tirs || 0) + 1; if (S.fusil && S.fusil.flash) S.fusil.flashT = 0.04; }
      S.recul = this.recul; S.viseeEpaulee = !!Ctl.verrouRegard; S.viseeYaw = Ctl.verrouRegard ? (Ctl.verrouCible ?? Ctl.camYaw) : null; S.dos = !!this.sauvetage; S.tenirFusil(Ctl.visee, dt);
      if (this.sauvetage) this.sauvetage.pas(dt);
      if (this.leve) this.leverTic(dt);
      // détecteur « bras en T » (diagnostic, 20/10) : bras tendu à l'horizontale sans arme en main → événement brasT (bannière)
      if (this === agents[0] && (S.paM ?? 1) < 0.5 && horloge - (this.brasTT || -9) > 1) { for (const k of ['D', 'G']) { const m = S.mains[k]; if (!m || m.some(x => !x)) continue;
        const a = m[0].getWorldPosition(V3()), f = m[1].getWorldPosition(V3()), h = m[2].getWorldPosition(V3()); const d = f.clone().sub(a).normalize(), e = h.clone().sub(f).normalize();
        if (Math.abs(d.y) < 0.35 && d.dot(e) > 0.85) { this.brasTT = horloge; EVENEMENTS.push({ t: +horloge.toFixed(2), qui: 0, k: 'brasT', loc: k + ' ' + Base.meta.sequences[Base.seq[this.frame]].nom.replace('.bvh', '') + ' dos' + (S.poidsDos || 0).toFixed(1) + ' prof' + (S.profondeur || 0).toFixed(1) + ' tenu' + (S.reposTenu || 0).toFixed(1) + (this.sauvetage ? ' ' + this.sauvetage.etat : '') + (this.leve ? ' leve' : '') }); break; } } }
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
    const bloc = new THREE.Mesh(new THREE.BoxGeometry(BLOC.w, BLOC.h, BLOC.d), new THREE.MeshStandardMaterial({ color: 0x6b6256, roughness: 0.9 })); bloc.position.set(BLOC.x + BLOC.w / 2, BLOC.h / 2, BLOC.z + BLOC.d / 2); bloc.castShadow = bloc.receiveShadow = true; scene.add(bloc);
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const m = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.35 })); m.rotation.x = -Math.PI / 2; m.position.set(BLOC.x + BLOC.w / 2 + nx * (BLOC.w / 2 + PARAMS.couvert.recul), 0.004, BLOC.z + BLOC.d / 2 + nz * (BLOC.d / 2 + PARAMS.couvert.recul)); scene.add(m); }
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
      camAuto(idx, opts) { camAuto(() => (idx == null ? agents : idx.map(i => agents[i])), opts); },   // outils : cadrer un ou plusieurs soldats
      camera(yaw, pitch, dist, cibleY) { agents[0].ctl.camYaw = yaw; cam.pitch = pitch; cam.dist = dist; cam.cibleY = cibleY; cam.cible = null; },
      escouade: ajouterEscouade, galerie, agents, preset, relever: (i, yaw) => agents[i || 0].relever(yaw || 0), sauver: (i, j, menace) => sauver(i, j, menace), scenarioSauvetage, tuer: (i, loc, dir) => agents[i || 0].tuer(loc, dir ? V3(...dir) : null), ragdoll: () => (window.OT && OT.Ragdoll ? { stats: OT.Ragdoll.stats, diag: agents.map(A => A.mort ? OT.Ragdoll.diag(A.mort.m) : null) } : null), couvrir: (menace) => { const c = agents[0].ctl; const ch = c.couvrir(BLOC, menace || { x: camera.position.x, z: camera.position.z }); return ch.map(p => p.toArray()); },
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
    // (20/10) après un preset, le cerveau du soldat joué gardait la main (il annulait visée et tir) : la première commande du
    // joueur (touche de déplacement, V, C, ou clic droit) lui rend le contrôle ; les ennemis gardent leur cerveau
    const reprendreMain = () => { const A = agents[0]; if (!A || !A.cerveau || A.sauvetage || A.leve) return; A.cerveau = null; const c = A.ctl; c.couvert = null; c.enRoute = null; c.chemin = null; c.verrouCible = null; c.verrouRegard = false; c.tir = false; c.tirEnMarchant = false; c.sprint = false; c.vitesseChemin = null; };
    addEventListener('keydown', e => { if (/^(Key[WZQSDVC]|Arrow|Shift)/.test(e.code)) reprendreMain(); const c = Ctl(); c.touches[e.code] = true; if (e.code === 'KeyV') { c.visee = !c.visee; } if (e.code === 'KeyC') { c.accroupi = !c.accroupi; if (!c.accroupi) { c.couvert = null; c.verrouCible = null; } } if (e.code === 'KeyB') seCouvrir(); if (e.code === 'KeyG') galerie(); if (e.code === 'KeyH') { const j = agents.findIndex(B => B.mort); if (j > 0) sauver(0, j); else scenarioSauvetage(); } if (e.code === 'KeyT' || e.code === 'KeyY' || e.code === 'KeyU') tirerSur(e.code === 'KeyY' ? 'tête' : e.code === 'KeyU' ? 'membre' : ''); if (e.code === 'KeyP') basculerChemin(); if (e.code === 'KeyR') reinit(); if (e.code === 'KeyI') { for (const id of ['hud', 'boutons', 'credit']) { const el = document.getElementById(id); if (el) el.style.display = el.style.display === 'none' ? '' : 'none'; } } if (/^Digit[123]$/.test(e.code)) preset(+e.code[5]); if (e.code === 'KeyE') ajouterEscouade(); if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault(); });
    addEventListener('keyup', e => { Ctl().touches[e.code] = false; });
    addEventListener('blur', () => { Ctl().touches = {}; Ctl().verrouRegard = false; Ctl().tir = false; });
    let drag = null;
    renderer.domElement.addEventListener('mousedown', e => { drag = { x: e.clientX, y: e.clientY, b: e.button, moved: false }; cam.auto = null; if (e.button === 2) { reprendreMain(); Ctl().verrouRegard = true; } if (e.button === 0 && Ctl().verrouRegard) Ctl().tir = true; });
    addEventListener('mousemove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; Ctl().camYaw -= dx * 0.006; cam.pitch = Math.max(0.08, Math.min(1.3, cam.pitch + dy * 0.004)); drag.x = e.clientX; drag.y = e.clientY; });
    addEventListener('mouseup', e => { if (drag && !drag.moved && Ctl().chemin && e.button === 0) ajouterPoint(e); drag = null; if (e.button === 2) { Ctl().verrouRegard = false; Ctl().tir = false; } if (e.button === 0) Ctl().tir = false; });
    renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('wheel', e => { cam.dist = Math.max(1.5, Math.min(14, cam.dist * (1 + Math.sign(e.deltaY) * 0.1))); });
    addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
    document.getElementById('btnChemin').onclick = basculerChemin; document.getElementById('btnReinit').onclick = reinit;
    document.getElementById('btnVisee').onclick = () => { Ctl().visee = !Ctl().visee; }; document.getElementById('btnAccroupi').onclick = () => { Ctl().accroupi = !Ctl().accroupi; };
    document.getElementById('btnDemo').onclick = cheminDemo;
    const ba = document.getElementById('btnAccroupi'); if (ba) ba.hidden = false; const bc = document.getElementById('btnCouvert'); if (bc) bc.onclick = seCouvrir;
    const be = document.getElementById('btnEscouade'); if (be) be.onclick = ajouterEscouade;
    for (const n of [1, 2, 3]) { const b = document.getElementById('btnPreset' + n); if (b) b.onclick = () => preset(n); }
  }
  function ajouterPoint(e) {
    const r = new THREE.Raycaster(); r.setFromCamera(new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
    const p = V3(); if (!r.ray.intersectPlane(new THREE.Plane(UP, 0), p)) return; agents[0].ctl.chemin.push(p); dessinerChemin();
  }
  function basculerChemin() { const c = agents[0].ctl; if (c.chemin) { c.chemin = null; } else { c.chemin = []; c.cheminIdx = 0; } dessinerChemin(); }
  // « va te couvrir » : la menace, pour les tests, est la caméra
  function seCouvrir() { const c = agents[0].ctl; c.couvrir(BLOC, { x: camera.position.x, z: camera.position.z }); dessinerChemin(); }
  // galerie de morts : 5 soldats courent de front (+z), puis chacun reçoit une balle différente au même instant
  // (tête de face, torse de face, jambe de face, torse de dos, jambe de côté) — pour comparer les chutes
  const GALERIE = [['tête', [0, 0, -1]], ['', [0, 0, -1]], ['membre', [0, 0, -1]], ['', [0, 0, 1]], ['membre', [1, 0, 0]]];
  async function galerie(delai) {
    for (const B of agents) if (B.mort) B.ressusciter();
    while (agents.length > 1) { const B = agents.pop(); scene.remove(B.soldat.group); }
    const A0 = agents[0]; A0.soldat.pos.set(-3, 0, -6); A0.soldat.yaw = 0; A0.ctl.pos.copy(A0.soldat.pos); A0.ctl.yaw = 0; A0.ctl.chemin = null; A0.ctl.couvert = null; A0.ctl.enRoute = null; A0.ctl.accroupi = false;
    for (let i = 1; i < 5; i++) { const B = await nouveauSoldat(V3(-3 + i * 2.0, 0, -6), 0); B.ctl.visee = true; }
    for (const B of agents) { B.ctl.touches = { KeyW: 1, ShiftLeft: 1 }; B.ctl.camYaw = 0; }
    galerieT = horloge + (delai ?? 1.8); return agents.length;
  }
  let galerieT = null;
  function galerieTic() { if (galerieT == null || horloge < galerieT) return; galerieT = null; agents.forEach((B, i) => { const [loc, d] = GALERIE[i % GALERIE.length]; B.tuer(loc, V3(...d)); }); }
  // sauvetage : l'agent i (vivant) va traîner l'agent j (mort) derrière le bloc ; menace = d'où viennent les tirs
  function sauver(i, j, menace, rea) { const R = agents[i], V = agents[j]; if (!R || !V || R.mort || !V.mort || R.sauvetage) return false; R.sauvetage = new Sauvetage(R, V, menace || { x: camera.position.x, z: camera.position.z }); R.sauvetage.reanimer = rea !== false; return true; }
  // scénario de démonstration : un second soldat traverse devant le bloc, tombe (balle venue de la menace), le premier
  // va le chercher et le traîne derrière le bloc
  async function scenarioSauvetage(menace) {
    menace = menace || { x: BLOC.x + BLOC.w / 2, z: BLOC.z - 6 };
    for (const B of agents) if (B.mort) B.ressusciter();
    while (agents.length > 1) { const B = agents.pop(); scene.remove(B.soldat.group); }
    const A0 = agents[0]; A0.soldat.pos.set(BLOC.x + BLOC.w / 2 + 2.5, 0, BLOC.z + BLOC.d + 1.5); A0.soldat.yaw = Math.PI; A0.ctl.pos.copy(A0.soldat.pos); A0.ctl.yaw = Math.PI; A0.ctl.chemin = null; A0.ctl.couvert = null; A0.ctl.enRoute = null; A0.ctl.accroupi = false; A0.ctl.touches = {};
    const B = await nouveauSoldat(V3(BLOC.x - 1.5, 0, BLOC.z - 1.6), Math.PI / 2); B.ctl.visee = true; B.ctl.chemin = [V3(BLOC.x + BLOC.w + 1.5, 0, BLOC.z - 1.6)]; B.ctl.cheminIdx = 0;
    scenarioT = { t: horloge + 2.2, menace, B }; return agents.length;
  }
  let scenarioT = null;
  function scenarioTic() { if (!scenarioT) return; const sc = scenarioT; if (horloge >= sc.t && !sc.tue) { const B = sc.B, d = B.soldat.pos.clone().sub(V3(sc.menace.x, 0, sc.menace.z)).setY(0).normalize(); B.tuer('', d); sc.tue = horloge; } if (sc.tue && horloge >= sc.tue + 0.8) { sauver(0, agents.indexOf(sc.B), sc.menace); scenarioT = null; } }
  // ---------------- Presets de test (touches 1 / 2 / 3) : la scène se joue comme une cinématique, mais tout est SIMULÉ
  // (motion matching, ragdoll, chemins) : c'est pour voir le rendu et débusquer les bugs. Caméra automatique qui orbite
  // lentement autour des acteurs (un clic dans la vue la reprend en main).
  // ---- Cerveau de bot : les règles de sim/engine.js (hitChance, fireAt/shoot, suppression, tryDrag, relève) portées ici ----
  // Rien n'est scripté : les presets placent les soldats, puis chacun décide (voir, tirer, se couvrir, évacuer, relever).
  const ARME = { accuracy: 0.60, damage: 42, range: 45, rpm: 110, suppress: 0.14, aim: 0.55, falloff: 0.8 }, DEF = { marksmanship: 60, composure: 60, endurance: 60 }, ARMURE = { torso: 0.40, head: 0.20 };   // fusil 5,56, plaques moyennes
  const REGLES = window.REGLES = { seuilTir: 0.08, dragClose: 7, dragReach: 12, dragCover: 8, dragMaxOpen: 4, saignement: 60, hp: 80 + DEF.endurance / 5, suppCouvert: 0.3, couvertMax: 9 };
  // dégâts d'un coup qui porte (applyHit du jeu) : portée, localisation (derrière un couvert bas : plus de têtes), armure, ±15 %
  function degats(d, couvert) { const r = d / ARME.range, fall = r <= 0.3 ? 1 : (r <= 1 ? 1 - (r - 0.3) / 0.7 * (1 - ARME.falloff) : Math.max(0.3 * ARME.falloff, ARME.falloff - (r - 1) * 0.7 * ARME.falloff)); const roll = RNG(); let loc, mult, prot; if (roll < (couvert ? 0.14 : 0.08)) { loc = 'tête'; mult = 2.2; prot = ARMURE.head; } else if (roll < (couvert ? 0.70 : 0.60)) { loc = ''; mult = 1; prot = ARMURE.torso; } else { loc = 'membre'; mult = 0.55; prot = 0; } return { dmg: ARME.damage * fall * mult * (1 - prot) * (0.85 + RNG() * 0.3), loc }; }
  function rngGraine(g) { let a = g >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  let RNG = rngGraine(1); window.RNG_MM = () => RNG(); window.graine = (g) => { RNG = rngGraine(g); };
  function segCoupeBoite3D(a, b, x0, x1, y0, y1, z0, z1) { let t0 = 0, t1 = 1; for (const [p0, d, lo, hi] of [[a.x, b.x - a.x, x0, x1], [a.y, b.y - a.y, y0, y1], [a.z, b.z - a.z, z0, z1]]) { if (Math.abs(d) < 1e-9) { if (p0 < lo || p0 > hi) return false; continue; } let ta = (lo - p0) / d, tb = (hi - p0) / d; if (ta > tb) [ta, tb] = [tb, ta]; t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return false; } return true; }
  const redresse = (A) => !A.ctl.accroupi || (A.ctl.couvert && A.ctl.verrouRegard);   // debout, ou redressé au-dessus du bloc pour tirer / observer
  const yeux = (A) => redresse(A) ? 1.6 : 1.0, poitrine = (A) => redresse(A) ? 1.25 : 0.75;   // EYE / CHEST du jeu : accroupi derrière le bloc (1,1 m) il ne voit rien et n'est pas vu
  const bouge = (A) => A.ctl.vel.length() > 0.3;
  const dist2D = (A, B) => Math.hypot(A.soldat.pos.x - B.soldat.pos.x, A.soldat.pos.z - B.soldat.pos.z);
  // obstacles qui coupent la vue : le bloc (1,1 m : on voit par-dessus debout) et les murs du décor d'un preset
  const MURS = window.MURS = [];
  function ajouterMur(x, z, w, d, h) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: 0x5c5a55, roughness: 0.95 })); m.position.set(x + w / 2, h / 2, z + d / 2); m.castShadow = m.receiveShadow = true; scene.add(m); MURS.push({ x, z, w, d, h, mesh: m }); return m; }
  function viderMurs() { for (const m of MURS) scene.remove(m.mesh); MURS.length = 0; }
  function segLibre(a, b) { for (const o of [BLOC, ...MURS]) if (segCoupeBoite3D(a, b, o.x, o.x + o.w, 0, o.h, o.z, o.z + o.d)) return false; return true; }
  function voit(A, B) { const a = A.soldat.pos, b = B.soldat.pos; return segLibre(V3(a.x, yeux(A), a.z), V3(b.x, poitrine(B), b.z)); }
  function voitPoint(x, z, px, pz, py) { return segLibre(V3(x, 1.6, z), V3(px, py ?? 0.9, pz)); }
  function chanceToucher(A, B, d) {
    let p = ARME.accuracy * (0.45 + 0.55 * DEF.marksmanship / 100); const r = d / ARME.range; let f; if (r <= 0.5) f = 1; else if (r <= 1) f = 1 - (r - 0.5) * 1.2; else f = Math.max(0.08, 0.4 - (r - 1) * 0.6); p *= f;
    const cv = A.cerveau; if (bouge(A)) p *= A.ctl.sprint ? 0.3 : 0.55; /* en course : arme mal épaulée */ if (A.ctl.accroupi) p *= 1.1; p *= 1 - 0.6 * cv.suppression * (1 - DEF.composure / 150);
    if (bouge(B)) p *= 0.8; if (B.ctl.accroupi) p *= 0.85; p *= 1 - 0.035 * Math.min(cv.rafale, 5);
    const close = Math.max(0, Math.min(1, 1 - d / 15)); if (close > 0) p += (0.95 - p) * Math.pow(close, 1.5);
    const couvert = !!(B.ctl.couvert && segCoupeBoite(V3(A.soldat.pos.x, 0, A.soldat.pos.z), V3(B.soldat.pos.x, 0, B.soldat.pos.z), BLOC.x, BLOC.x + BLOC.w, BLOC.z, BLOC.z + BLOC.d));
    if (couvert) p *= 0.28;   // derrière un couvert, seuls la tête et les épaules dépassent
    return { p: Math.max(0.03, Math.min(0.95, p)), couvert };
  }
  const EVENEMENTS = window.EVENEMENTS = [];
  class Cerveau {
    constructor(A, equipe, opts) { this.A = A; this.equipe = equipe; this.hp = REGLES.hp; this.suppression = 0; this.rafale = 0; this.rafaleMax = 4 + Math.floor(RNG() * 5); this.pause = 0; this.visee = 0; this.cible = null; this.tirsVus = A.tirs || 0; this.tenir = !!(opts && opts.tenir); this.derniereMenace = null; this.touche = -99; this.saigne = 0; this.supp = null; this.replie = false; this.dernierTir = -99; this.vus = new Set(); this.percAcc = 0; this.connu = new Map(); }
    ennemis() { return agents.filter(B => B !== this.A && B.cerveau && B.cerveau.equipe !== this.equipe); }
    allies() { return agents.filter(B => B !== this.A && B.cerveau && B.cerveau.equipe === this.equipe); }
    log(k, extra) { EVENEMENTS.push(Object.assign({ t: +horloge.toFixed(2), qui: agents.indexOf(this.A), k }, extra || {})); }
    tic(dt) {
      const A = this.A, c = A.ctl, t = horloge;
      this.suppression = Math.max(0, this.suppression - dt * 0.18 * (0.5 + DEF.composure / 100));
      if (A.mort) { c.tir = false; return; }
      if (A.leve) { this.cible = null; return; }
      if (this.hp <= 0) { this.hp = REGLES.hp / 2; this.saigne = 0; this.replie = false; this.vus = new Set(); }   // relevé : la moitié de ses points
      const nt = A.tirs || 0; while (this.tirsVus < nt) { this.tirsVus++; this.coup(); }   // coups partis depuis le dernier pas
      if (A.sauvetage) { c.tir = false; c.verrouRegard = false; return; }
      // entre deux rafales (ou après un tir jugé inutile) derrière le bloc : on reste baissé, sans regarder
      this.pause = Math.max(0, this.pause - dt);
      if (this.pause > 0 && c.couvert) { c.tir = false; c.verrouRegard = false; return; }
      // perception (règle perceive du jeu, tous les 0,1 s) : champ visuel 112° (sauf à < 7 m, cible déjà suivie, ou il me tire
      // dessus), ligne de vue yeux → poitrine (le bloc coupe la vue), puis chance de repérage (plus facile s'il bouge ou tire)
      this.percAcc = (this.percAcc || 0) + dt;
      if (this.percAcc >= 0.1) { this.percAcc -= 0.1; const vus = new Set();
        for (const E of this.ennemis()) { if (E.mort || E.leve) continue; const d = dist2D(A, E); if (d > 57) continue;
          const ang = Math.atan2(E.soldat.pos.x - A.soldat.pos.x, E.soldat.pos.z - A.soldat.pos.z); let da = ang - A.soldat.yaw; da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da)));
          const tireSurMoi = E.cerveau && E.cerveau.cible === A && horloge - E.cerveau.dernierTir < 1.5;
          const dansChamp = d < 7 || da < Math.PI * 0.31 || this.vus.has(E) || tireSurMoi;
          if (!dansChamp || !voit(A, E)) continue;
          let pr = this.vus.has(E) ? 1 : 0.35 * (1 - d / 57) * 1.2 * (bouge(E) ? 1.6 : 1) * (E.cerveau && horloge - E.cerveau.dernierTir < 1.5 ? 3 : 1) * (E.ctl.accroupi ? 0.6 : 1); pr = Math.max(0.02, Math.min(1, pr));
          if (pr >= 1 || RNG() < pr) { vus.add(E); this.connu.set(E, { x: E.soldat.pos.x, z: E.soldat.pos.z, t: horloge, vu: true }); } }
        this.vus = vus; }
      let cible = null, dmin = Infinity; for (const E of this.vus) { if (E.mort || E.leve || !voit(A, E)) continue; const d = dist2D(A, E); if (d < dmin) { dmin = d; cible = E; } }
      if (cible) { if (cible !== this.cible) { this.cible = cible; this.visee = ARME.aim; this.log('voit', { qui2: agents.indexOf(cible) }); } this.derniereMenace = { x: cible.soldat.pos.x, z: cible.soldat.pos.z, t }; }
      else if (this.cible) { this.cible = null; this.log('perd'); }
      // coéquipier à terre qui saigne : le plus proche des disponibles va le chercher (sauf ennemi tout près, ou en plein duel)
      // en route vers le couvert sous le feu : plus il s'en approche, plus il accélère (marche → course, linéaire sur la
      // distance) ; il garde l'arme en joue et tire tant qu'il voit la cible (même en courant : arme mal épaulée)
      if (c.enRoute && c.tirEnMarchant && this.supp) { const pt = c.enRoute.point, dr = Math.hypot(pt.x - A.soldat.pos.x, pt.z - A.soldat.pos.z); if (this.supp.d0 == null) this.supp.d0 = Math.max(1, dr);
        const u = Math.max(0, Math.min(1, (1 - dr / this.supp.d0) / 0.5));   // (20/10) pleine course dès la moitié du trajet, sprint dès le quart
        c.vitesseChemin = c.vitesses.marche + (c.vitesses.course - c.vitesses.marche) * u; c.sprint = u > 0.5;
        if (c.sprint && !this.supp.sprint) { this.supp.sprint = true; this.log('sprint'); } }
      if (!c.enRoute && this.supp) { this.supp = null; c.sprint = false; }   // arrivé au couvert : fin du tir en marchant
      const V = c.enRoute ? null : this.blesse();
      // (règle demandée : une menace fraîche (< 3 s) et proche (< 20 m) se neutralise AVANT d'aller chercher le blessé)
      const menaceProche = [...this.connu].some(([E, k]) => !E.mort && horloge - k.t < 3 && dist2D(E, A) < 20);
      if (V && !menaceProche && !(cible && horloge - this.dernierTir < 1.5)) { this.secourir(V); return; }
      if (cible) {
        // à découvert sous le feu (touché, pris sous les balles, ou cible trop dure) et un couvert à portée : 2-3 coups de
        // suppression puis on court au couvert (règle coverUp du jeu ; le tir en courant n'existe pas ici)
        const expose = !this.tenir && !c.couvert && !c.enRoute && !this.replie;
        // (demande utilisateur 20/10) : il part TOUT DE SUITE vers le couvert en marchant arme en joue, lâche 2-3 coups de
        // suppression en chemin (précision « en mouvement » du jeu), puis sprinte ; à couvert, il riposte par-dessus
        if (expose && (t - this.touche < 2 || this.suppression > REGLES.suppCouvert) && this.couvertPossible(cible)) {
          this.supp = { d0: null, sprint: false }; this.replie = true; this.auCouvert(cible); c.tirEnMarchant = true; c.vitesseChemin = c.vitesses.marche; this.log('suppression');
        }
        // (demande utilisateur 20/10) : il CONTINUE de tirer tout le long, même en courant (arme mal épaulée : précision
        // « en mouvement » puis « en course » du jeu) ; plus il approche du couvert, plus il accélère (marche → course)
        this.engager(cible, dmin, dt);
        return;
      }
      c.tir = false; c.verrouRegard = false; if (!c.enRoute) { this.supp = null; c.sprint = false; }
      const m = this.derniereMenace;
      // en route vers le couvert sous le feu, cible perdue de vue (le bloc la masque déjà) : il continue de tirer vers sa
      // dernière position connue (tir de suppression « à l'aveugle », chance réduite de moitié) — demande utilisateur 20/10
      if (m && c.enRoute && this.supp && horloge - m.t < 4) { c.visee = true; c.verrouCible = Math.atan2(m.x - A.soldat.pos.x, m.z - A.soldat.pos.z);
        if (this.pause > 0) c.tir = false; else { c.verrouRegard = true; this.visee = Math.max(0, this.visee - dt); c.tir = this.visee <= 0; } return; }
      if (c.enRoute) return;   // en route vers le couvert : on y va
      // rien en vue : arme prête vers la dernière menace connue ; à couvert, on se redresse pour observer si on a entendu
      // tirer depuis moins de 3 s (le jeu : position connue à l'ouïe), sinon on reste caché
      if (m) { c.visee = true; c.verrouCible = Math.atan2(m.x - A.soldat.pos.x, m.z - A.soldat.pos.z);
        if (c.couvert) { if (horloge - m.t < 3) c.verrouRegard = true; }
        else if (!this.tenir && !this.replie && horloge - m.t < 3 && this.couvertPossible({ soldat: { pos: V3(m.x, 0, m.z) } })) { this.replie = true; this.auCouvert({ soldat: { pos: V3(m.x, 0, m.z) } }); }   // on tire pas loin : au couvert d'abord
      }
    }
    secourir(V) { const A = this.A, c = A.ctl, m = this.derniereMenace || { x: V.soldat.pos.x, z: V.soldat.pos.z - 10 };
      const ths = this.menacesSur(V); const d = dist2D(A, V); c.tir = false; c.verrouRegard = false;
      // règle demandée par l'utilisateur (20/10) : on ne réanime JAMAIS à découvert — s'il y a un couvert à portée (≤ 8 m du
      // blessé), on le traîne derrière d'abord, même sans menace connue (il peut y avoir d'autres ennemis) ; relève sur place
      // seulement sans couvert à portée. (Le jeu, lui, ne traîne que si un ennemi connu voit le blessé : à reporter dans sim/.)
      const cx = BLOC.x + BLOC.w / 2, cz = BLOC.z + BLOC.d / 2, couvertProche = Math.hypot(cx - V.soldat.pos.x, cz - V.soldat.pos.z) <= REGLES.dragCover;
      if (!ths.length && !couvertProche) { this.log('releve', { qui2: agents.indexOf(V) }); A.sauvetage = new Sauvetage(A, V, m).surPlace(); return; }
      if (!ths.length) ths.push({ x: m.x, z: m.z, fresh: false });   // couvert à portée, aucune menace connue : on se cache de la dernière connue
      const tOpen = Math.max(0, d - 1) / c.vitesses.course + 3.0 / PARAMS.sauvetage.vitesse;   // temps à découvert : aller au blessé + le tirer (~3 m)
      if (ths.some(x => x.fresh) && tOpen > REGLES.dragMaxOpen) this.log('traine-trop-long', { tOpen: +tOpen.toFixed(1) });   // jeu : fumigène obligatoire (pas de fumigène ici : il y va quand même)
      // côté du couvert : caché de TOUTES les positions ennemies connues (celui qu'on vient d'abattre compris : d'autres peuvent être par là)
      const liste = []; for (const [E, k] of this.connu) liste.push(E.mort ? { x: E.soldat.pos.x, z: E.soldat.pos.z } : { x: k.x, z: k.z }); for (const q of ths) if (!liste.some(l => Math.hypot(l.x - q.x, l.z - q.z) < 1)) liste.push({ x: q.x, z: q.z });
      this.log('traine', { qui2: agents.indexOf(V), menaces: liste.length }); const dm = liste.reduce((acc, q) => acc.add(V3(q.x - cx, 0, q.z - cz).normalize()), V3()).normalize(); if (dm.lengthSq() < 1e-6) dm.set(ths[0].x - cx, 0, ths[0].z - cz).normalize();
      A.sauvetage = new Sauvetage(A, V, { x: cx + dm.x * 10, z: cz + dm.z * 10, liste }); A.sauvetage.reanimer = true; }   // menace « moyenne » pour le cap final, liste pour le choix du côté
    couvertPossible(E) { const A = this.A, cx = BLOC.x + BLOC.w / 2, cz = BLOC.z + BLOC.d / 2; if (Math.hypot(cx - A.soldat.pos.x, cz - A.soldat.pos.z) > REGLES.couvertMax) return false; const ch = A.ctl.couvrir(BLOC, { x: E.soldat.pos.x, z: E.soldat.pos.z }); const ok = A.ctl.couvertScore > 0.6; A.ctl.chemin = null; A.ctl.cheminFin = false; A.ctl.enRoute = null; return ok; }
    auCouvert(E) { const A = this.A, c = A.ctl; c.tir = false; c.verrouRegard = false; c.couvrir(BLOC, { x: E.soldat.pos.x, z: E.soldat.pos.z }); c.vitesseChemin = c.vitesses.course; c.accroupi = false; this.log('couvert'); dessinerChemin(); }
    engager(E, d, dt) {
      const A = this.A, c = A.ctl, p = E.soldat.hips.getWorldPosition(V3());
      c.visee = true; c.verrouCible = Math.atan2(p.x - A.soldat.pos.x, p.z - A.soldat.pos.z);
      if (c.enRoute && !c.tirEnMarchant) { c.tir = false; c.verrouRegard = false; return; }   // on sprinte au couvert sans tirer
      if (this.pause > 0) { c.tir = false; return; }   // entre deux rafales (à découvert : on garde la cible en joue)
      c.verrouRegard = true;   // épaulé (à couvert : il se redresse pour tirer par-dessus)
      this.visee = Math.max(0, this.visee - dt);
      const ch = chanceToucher(A, E, d).p;
      c.tir = this.visee <= 0 && ch >= REGLES.seuilTir;
      if (!c.tir && this.visee <= 0 && c.couvert) { c.verrouRegard = false; this.pause = 0.5; }   // pas de tir utile : on reste caché, on réévalue dans 0,5 s
    }
    // un coup est parti (recul joué par l'agent) : chance de toucher du jeu, dégâts, suppression
    coup() {
      const A = this.A, aveugle = !this.cible, E = this.cible || this.cibleAveugle(); if (!E || E.mort) return;
      const d = dist2D(A, E), ct = chanceToucher(A, E, d), p = ct.p * (aveugle ? 0.5 : 1), couvert = ct.couvert, touche = RNG() < p; this.rafale++;
      this.dernierTir = horloge; for (const F of this.ennemis()) if (F.cerveau && !F.mort) { const k = { x: A.soldat.pos.x + (RNG() - 0.5) * 2, z: A.soldat.pos.z + (RNG() - 0.5) * 2, t: horloge, vu: false }; F.cerveau.derniereMenace = k; F.cerveau.connu.set(A, k); }   // le coup s'entend : position connue (à ±1 m)
      const ce = E.cerveau;
      if (touche) { const { dmg, loc } = degats(d, couvert); ce.hp -= dmg; ce.touche = horloge; ce.suppression = Math.min(1, ce.suppression + ARME.suppress * 1.2);
        this.log('touche', { qui2: agents.indexOf(E), p: +p.toFixed(2), loc, hp: Math.round(ce.hp) });
        if (ce.hp <= 0) { const dir = E.soldat.pos.clone().sub(A.soldat.pos).setY(0).normalize(); E.tuer(loc, dir); ce.saigne = horloge + REGLES.saignement; ce.cible = null; this.log('abat', { qui2: agents.indexOf(E), loc }); this.cible = null; A.ctl.tir = false; } }
      else { ce.suppression = Math.min(1, ce.suppression + ARME.suppress * 0.55 * (couvert ? 0.7 : 1) * (d > ARME.range ? 0.5 : 1)); this.log('rate', { qui2: agents.indexOf(E), p: +p.toFixed(2) }); }
      if (this.rafale >= this.rafaleMax) { this.pause = 0.3 + RNG() * 0.35; this.rafale = 0; this.rafaleMax = 4 + Math.floor(RNG() * 5); }
    }
    // tir à l'aveugle : l'ennemi vivant le plus proche (< 3 m) de la dernière position connue
    cibleAveugle() { const m = this.derniereMenace; if (!m) return null; let best = null, bd = 3; for (const E of this.ennemis()) { if (E.mort) continue; const d = Math.hypot(E.soldat.pos.x - m.x, E.soldat.pos.z - m.z); if (d < bd) { bd = d; best = E; } } return best; }
    blesse() { const A = this.A; let best = null, bd = REGLES.dragReach; for (const V of this.allies()) { if (!V.mort || !V.cerveau.saigne || V.cerveau.saigne < horloge + 8 || V.leve) continue; if (agents.some(B => B.sauvetage && B.sauvetage.V === V)) continue; const d = dist2D(A, V); if (d < bd) { bd = d; best = V; } }
      if (!best) return null;
      for (const E of this.ennemis()) if (!E.mort && (dist2D(E, A) < REGLES.dragClose || dist2D(E, best) < REGLES.dragClose)) return null;   // ennemi tout près : on se bat
      for (const B of this.allies()) { if (B === best || B.mort || B.leve || B.sauvetage || B.cerveau.cible) continue; if (dist2D(B, best) < bd - 1e-6) return null; }   // un autre est plus près
      return best; }
    // menaces qui justifient un traînage (règle dragThreats) : ennemi vivant, vu ou connu depuis < 6 s, qui a vue sur le blessé
    menacesSur(V) { const out = []; for (const E of this.ennemis()) { if (E.mort) continue; const vu = this.vus.has(E); const k = vu ? { x: E.soldat.pos.x, z: E.soldat.pos.z, t: horloge } : this.connu.get(E); if (!k || (!vu && horloge - k.t > 6)) continue; if (voitPoint(k.x, k.z, V.soldat.pos.x, V.soldat.pos.z, 0.9)) out.push({ x: k.x, z: k.z, fresh: vu || horloge - k.t < 3 }); } return out; }
  }
  function cerveauxTic(dt) { for (const A of agents) if (A.cerveau) A.cerveau.tic(dt); }
  const CINE = window.CINE = { etapes: null, tics: [], t: 0, titre: '' };
  function cine(titre, etapes, tics) { CINE.etapes = etapes.slice(); CINE.tics = tics || []; CINE.t = 0; CINE.titre = titre; }
  function cineTic(dt) {
    if (!CINE.etapes && !CINE.tics.length && !CINE.titre) return; CINE.t += dt;
    for (const f of CINE.tics) f(CINE.t);
    if (CINE.etapes) { while (CINE.etapes.length && CINE.t >= CINE.etapes[0][0]) { const e = CINE.etapes.shift(); try { e[1](); } catch (err) { console.error('cinématique', err); } } if (!CINE.etapes.length) CINE.etapes = null; }
  }
  // tireur : vise en permanence un agent (ou un point), rafales programmées par les étapes ; la « balle » est appliquée
  // par l'étape (pas de balistique ici : c'est l'anim qu'on regarde)
  function viserTic(T, cible) { return () => { if (T.mort || T.leve) return; const c = T.ctl; const p = cible.soldat ? cible.soldat.hips.getWorldPosition(V3()) : cible; c.visee = true; c.verrouRegard = true; c.verrouCible = Math.atan2(p.x - T.soldat.pos.x, p.z - T.soldat.pos.z); }; }
  function rafale(T, duree) { T.ctl.tir = true; T.finRafale = CINE.t + (duree || 0.35); }
  function rafalesTic(t) { for (const A of agents) if (A.finRafale != null && t >= A.finRafale) { A.ctl.tir = false; A.finRafale = null; } }
  function balle(T, V, loc) { if (V.mort) return; const d = V.soldat.pos.clone().sub(T.soldat.pos).setY(0).normalize(); V.tuer(loc || '', d); }
  async function videz() {
    // tous les soldats sont recréés (le premier aussi) : état d'animation, horloge et aléa repartent de zéro → la scène d'un
    // preset est la même quel que soit le moment où on clique
    for (const B of agents) { if (B.mort) B.ressusciter(); B.leve = null; B.sauvetage = null; B.finRafale = null; B.cerveau = null; } EVENEMENTS.length = 0; viderMurs();
    while (agents.length) { const B = agents.pop(); scene.remove(B.soldat.group); }
    CINE.etapes = null; CINE.tics = []; CINE.titre = ''; CINE.t = 0; CINE.noms = null; galerieT = null; scenarioT = null; horloge = 0;
    for (const m of empreintesMesh) scene.remove(m); empreintesMesh.length = 0;
    await nouveauSoldat(V3(0, 0, 0), 0); dessinerChemin(); }
  function placer(A, x, z, yaw) { A.soldat.pos.set(x, 0, z); A.soldat.yaw = yaw; A.ctl.pos.copy(A.soldat.pos); A.ctl.yaw = yaw; A.ctl.vel.set(0, 0, 0); A.ctl.acc.set(0, 0, 0); A.ctl.yawV = 0; A.ctl.camYaw = yaw; }
  function camAuto(cibles, opts) { cam.auto = Object.assign({ cibles, vitesse: 0.10, pitch: 0.5, marge: 3.5 }, opts || {}); cam.pitch = cam.auto.pitch; cam.dist = 10; cam.cible = null; }
  // Preset 1 — sauvetage et réanimation. Rien n'est écrit à l'avance : placements seulement, le reste vient des règles du jeu.
  // Un soldat (V) traverse devant le bloc ; un tireur ennemi (T1) tient sa position à 8,5 m au sud ; son coéquipier (R) arrive
  // par le nord. Attendu : T1 repère V et l'abat ; R entend les coups, se met à couvert, se redresse, abat T1 ; un second
  // ennemi loin au sud (T2, hors cadre, trop loin pour tirer) garde la vue sur le blessé → R le traîne derrière le bloc (règle
  // tryDrag), le réanime, et le blessé se relève. Graine fixe : même scène à chaque fois.
  async function preset1() {
    graine(PARAMS.graines[0]); await videz(); const cx = BLOC.x + BLOC.w / 2;
    const R = agents[0]; placer(R, cx - 1.0, BLOC.z + BLOC.d + 5.5, Math.PI / 2); R.ctl.visee = true; R.ctl.chemin = [V3(cx + 6.0, 0, BLOC.z + BLOC.d + 5.5)]; R.ctl.cheminIdx = 0; R.cerveau = new Cerveau(R, 0);   // il longe vers l'est, dos au sud
    const V = await nouveauSoldat(V3(cx - 5.0, 0, BLOC.z - 1.6), Math.PI / 2); V.ctl.visee = true; V.ctl.chemin = [V3(cx + 5.5, 0, BLOC.z - 1.6)]; V.ctl.cheminIdx = 0; V.cerveau = new Cerveau(V, 0);
    const T1 = await nouveauSoldat(V3(cx - 2.0, 0, BLOC.z - 10.0), 0); T1.ctl.visee = true; T1.cerveau = new Cerveau(T1, 1, { tenir: true });
    // second ennemi loin à l'est (35 m), un mur le long du côté est : il voit la zone où tombe V, pas le couvert de R ni son
    // approche → règle tryDrag : le blessé doit être traîné derrière le bloc avant d'être relevé
    ajouterMur(cx + 5.0, BLOC.z - 1.1, 0.4, 8.1, 2.4);   // de 0,5 m devant le bloc jusqu'à 7 m derrière : cache tout le côté nord/ouest, pas la ligne de V
    const T2 = await nouveauSoldat(V3(cx + 35.0, 0, BLOC.z - 1.6), -Math.PI / 2); T2.ctl.visee = true; T2.cerveau = new Cerveau(T2, 1, { tenir: true });   // dans l'axe de la traversée de V
    camAuto(() => [R, V], { vitesse: 0.08 });
    cine('Preset 1 — sauvetage et réanimation (simulé)', [], []); CINE.noms = ['R', 'V', 'T1', 'T2'];
    return agents.length;
  }
  // Preset 2 — galerie de morts : 5 coureurs, impacts différents au même instant (tête / torse / jambe / dos / côté)
  async function preset2() { graine(PARAMS.graines[1]); await videz(); await galerie(2.0); camAuto(() => agents, { vitesse: 0.12, pitch: 0.45 }); cine('Preset 2 — galerie de ragdolls', [], [rafalesTic]); return agents.length; }
  // Preset 3 — prise de couvert sous le feu (simulé) : un soldat (B) à découvert face à un tireur (T) qui tient sa position
  // à 12 m. Attendu : ils se repèrent ; pris sous le feu, B tire 2-3 coups de suppression puis court se couvrir derrière le
  // bloc ; à couvert il se redresse pour tirer par rafales, se baisse entre deux, et abat T.
  async function preset3() {
    graine(PARAMS.graines[2]); await videz(); const cx = BLOC.x + BLOC.w / 2;
    const B = agents[0]; placer(B, cx - 3.0, BLOC.z + BLOC.d + 4.5, Math.PI); B.ctl.visee = true; B.cerveau = new Cerveau(B, 0);
    const T = await nouveauSoldat(V3(cx + 1.5, 0, BLOC.z - 7.0), 0); T.ctl.visee = true; T.cerveau = new Cerveau(T, 1, { tenir: true });
    camAuto(() => [B, T], { vitesse: 0.07, pitch: 0.55, marge: 3.0 });
    cine('Preset 3 — couvert sous le feu (simulé)', [], []); CINE.noms = ['B', 'T'];
    return agents.length;
  }
  const PRESETS = [preset1, preset2, preset3];
  async function preset(n) { const f = PRESETS[n - 1]; if (!f) return 0; return f(); }
  // une balle depuis la caméra (T : torse, Y : tête, U : membre) sur le soldat joué
  function tirerSur(loc) { const A = agents[0]; if (A.mort) { A.ressusciter(); return; } const d = A.soldat.pos.clone().setY(1).sub(camera.position).normalize(); A.tuer(loc, d); }
  function cheminDemo() { const c = agents[0].ctl; c.chemin = [V3(4, 0, 0), V3(4, 0, 4), V3(-3, 0, 5), V3(-4, 0, -2), V3(1, 0, -4)]; c.cheminIdx = 0; dessinerChemin(); }
  function dessinerChemin() {
    for (const t of traits) scene.remove(t); traits.length = 0;
    agents.forEach((A, ai) => {
      const ch = A.ctl.chemin; if (!ch || !ch.length) return; const couleur = ai === 0 ? 0xffb347 : 0x6fa8dc;
      ch.forEach((p) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 24), new THREE.MeshBasicMaterial({ color: couleur })); m.position.copy(p).setY(0.01); scene.add(m); traits.push(m); });
      if (ch.length > 1) { const g = new THREE.BufferGeometry().setFromPoints([...ch, ch[0]].map(p => p.clone().setY(0.015))); const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: couleur })); scene.add(l); traits.push(l); }
    });
  }
  function reinit() { for (const B of agents) if (B.mort) B.ressusciter(); const A = agents[0], c = A.ctl; c.pos.set(0, 0, 0); c.vel.set(0, 0, 0); c.acc.set(0, 0, 0); c.yaw = 0; c.yawV = 0; A.soldat.pos.set(0, 0, 0); A.soldat.yaw = 0; A.glisse.cumul = 0; A.glisse.tContact = 0; for (const B of agents) B.glisse.empreintes.length = 0; for (const m of empreintesMesh) scene.remove(m); empreintesMesh.length = 0; A.sauts = 0; }

  let dernierT = performance.now(), tempsPas = 0;
  function rendre() { if (!window.SANS_RENDU) renderer.render(scene, camera); }
  function boucle(dt) {
    horloge += dt; const now = horloge * 1000;
    const t0 = performance.now();
    for (const A of agents) A.pas(dt, now);
    galerieTic(); scenarioTic(); cineTic(dt); cerveauxTic(dt);
    if (window.OT && OT.Ragdoll && agents.some(A => A.mort)) { BATAILLE.t = horloge; OT.Ragdoll.etape(dt, BATAILLE); for (const A of agents) if (A.mort) { A.mort.t += dt; OT.Ragdoll.anime(A.mort.u, A.mort.m, dt); const r = A.mort.m.rag; if (r && r.arme && r.arme.body && r.t < 0.6) { const v = r.arme.body.velocity; if (v.length() > 1.5) v.scale(1.5 / v.length(), v); }
        // corps déposé après un traînage : les jambes se couchent (pas de genou dressé en « tente » tenu par la charnière), jusqu'au gel
        // corps figé avec un genou encore dressé : la jambe est couchée au sol (cinématique, 0,4 s) — un corps inerte n'a pas de genou en l'air
        if (r && r.fige && A.mort.aplatir && !A.mort.aplati) { A.mort.aplati = { t: 0, cibles: [] }; const S2 = A.soldat; for (const [H, K, F] of S2.jambes) { if (!H || !K || !F) continue; const pH = H.getWorldPosition(V3()), pK = K.getWorldPosition(V3()); if (pK.y < 0.2) continue; const L = pK.distanceTo(pH), d0 = pK.clone().sub(pH).normalize(), d1 = d0.clone(); d1.y = Math.max(-0.95, (0.13 - pH.y) / Math.max(L, 0.05)); const hz = Math.hypot(d1.x, d1.z) || 1, hzV = Math.sqrt(Math.max(0, 1 - d1.y * d1.y)); d1.x *= hzV / hz; d1.z *= hzV / hz; d1.normalize(); /* genou visé à 13 cm du sol */ const q = Q().setFromUnitVectors(d0, d1); const w0 = H.getWorldQuaternion(Q()); const w1 = q.clone().multiply(w0); A.mort.aplati.cibles.push([H, H.quaternion.clone(), H.parent.getWorldQuaternion(Q()).invert().multiply(w1)]);
            const pF = F.getWorldPosition(V3()); const e0 = pF.clone().sub(pK).normalize().applyQuaternion(q), e1 = d1.clone(); e1.y = Math.max(-0.95, (0.10 - 0.13) / Math.max(pF.distanceTo(pK), 0.05)); { const hz2 = Math.hypot(e1.x, e1.z) || 1, hzV2 = Math.sqrt(Math.max(0, 1 - e1.y * e1.y)); e1.x *= hzV2 / hz2; e1.z *= hzV2 / hz2; e1.normalize(); } /* pied à 10 cm */ const q2 = Q().setFromUnitVectors(e0, e1); const kw0 = K.getWorldQuaternion(Q()), kw1 = q2.clone().multiply(q).multiply(kw0); A.mort.aplati.cibles.push([K, K.quaternion.clone(), w1.clone().invert().multiply(kw1)]); }
          // bras : un corps lâché par le col garde les bras repliés sur la poitrine (ils pendaient vers le sauveteur) → on les
          // couche le long du corps, un peu écartés (coude à 12 cm du sol, main à 8 cm), même fondu 0,4 s
          if (A.mort.aplatirBras) { const pHi = S2.hips.getWorldPosition(V3()), pTe = S2.os[Base.meta.os.indexOf('Head')].getWorldPosition(V3()); const axe = pTe.clone().sub(pHi); axe.y = 0; if (axe.lengthSq() > 1e-4) { axe.normalize();
            for (const [Ar, Fo] of [S2.mains.D, S2.mains.G]) { if (!Ar || !Fo) continue; const pA = Ar.getWorldPosition(V3()), pE = Fo.getWorldPosition(V3()); const out = pA.clone().sub(pHi); out.y = 0; out.addScaledVector(axe, -out.dot(axe)); if (out.lengthSq() < 1e-4) continue; out.normalize();
              const L1 = pE.distanceTo(pA); const d0 = pE.clone().sub(pA).normalize(); const d1 = out.clone().multiplyScalar(0.45).addScaledVector(axe, -0.85); d1.y = Math.max(-0.9, (0.12 - pA.y) / Math.max(L1, 0.05)); { const hz = Math.hypot(d1.x, d1.z) || 1, hzV = Math.sqrt(Math.max(0, 1 - d1.y * d1.y)); d1.x *= hzV / hz; d1.z *= hzV / hz; d1.normalize(); }
              const q = Q().setFromUnitVectors(d0, d1); const w0 = Ar.getWorldQuaternion(Q()), w1 = q.clone().multiply(w0); A.mort.aplati.cibles.push([Ar, Ar.quaternion.clone(), Ar.parent.getWorldQuaternion(Q()).invert().multiply(w1)]);
              const Hm = Ar === S2.mains.D[0] ? S2.mains.D[2] : S2.mains.G[2]; if (!Hm) continue; const pM = Hm.getWorldPosition(V3()); const e0 = pM.clone().sub(pE).normalize().applyQuaternion(q), e1 = d1.clone(); e1.y = Math.max(-0.9, (0.08 - 0.12) / Math.max(pM.distanceTo(pE), 0.05)); { const hz = Math.hypot(e1.x, e1.z) || 1, hzV = Math.sqrt(Math.max(0, 1 - e1.y * e1.y)); e1.x *= hzV / hz; e1.z *= hzV / hz; e1.normalize(); }
              const q2 = Q().setFromUnitVectors(e0, e1); const fw0 = Fo.getWorldQuaternion(Q()), fw1 = q2.clone().multiply(q).multiply(fw0); A.mort.aplati.cibles.push([Fo, Fo.quaternion.clone(), w1.clone().invert().multiply(fw1)]); } } } }
        if (A.mort.aplati && A.mort.aplati.t < 0.4) { const ap = A.mort.aplati; ap.t += dt; const k = Math.min(1, ap.t / 0.4); for (const [o, q0, q1] of ap.cibles) { o.quaternion.copy(q0).slerp(q1, k); o.updateMatrixWorld(true); } }
        if (r && r.corps && !r.fige && !A.mort.aplatirBras && r.t > 0.8) { for (const i of [8, 9, 10, 11]) { const b = r.corps[i]; if (b.position.y > 0.2 && b.velocity.y > -0.4) b.velocity.y = -0.4; } }   /* après la chute : pas de genou qui reste dressé (charnière) */
        if (r && r.corps && !r.fige && A.mort.aplatirBras) { for (const i of [8, 9, 10, 11]) { const b = r.corps[i]; if (b.position.y > 0.17 && b.velocity.y > -0.4) b.velocity.y = -0.4; } if (r.t > 1.5) r.aFiger = true; } } }   // (l'arme lâchée ne vole pas à 2 m) ; déposé : se pose en 1,5 s puis figé (et jambes couchées, ci-dessus)
    tempsPas = tempsPas * 0.95 + (performance.now() - t0) * 0.05;
    const A = agents[0], S = A.soldat, Ctl = A.ctl;
    if (window.TRACE) { const g = S.orteils[0].getWorldPosition(V3()), d = S.orteils[1].getWorldPosition(V3()); window.TRACE.push([+horloge.toFixed(3), ...g.toArray().map(x => +x.toFixed(4)), ...d.toArray().map(x => +x.toFixed(4)), Base.contact[A.frame], +(S.verrous[0].delta ? S.verrous[0].delta.length() : 0).toFixed(3), +(S.verrous[1].delta ? S.verrous[1].delta.length() : 0).toFixed(3), A.frame, seuilOrteil]); }
    for (const B of agents) while (B.glisse.empreintes.length) { const e = B.glisse.empreintes.shift(); const m = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), new THREE.MeshBasicMaterial({ color: e.k ? 0x4fc3f7 : 0xff7b7b, transparent: true, opacity: 0.8 })); m.rotation.x = -Math.PI / 2; m.position.copy(e.p).setY(0.004); scene.add(m); empreintesMesh.push(m); if (empreintesMesh.length > 60 * agents.length) scene.remove(empreintesMesh.shift()); }
    // caméra orbitale autour de l'agent 0, cible lissée (le bassin oscille à chaque pas ; une caméra collée dessus amplifie
    // le tangage)
    let voulu = S.pos.clone().setY(cam.cibleY ?? 1.0);
    if (cam.auto) {   // cinématique : centre des acteurs, distance selon leur étalement, orbite lente
      const pts = cam.auto.cibles().map(a => a.soldat ? (a.mort ? a.soldat.hips.getWorldPosition(V3()).setY(0) : a.soldat.pos.clone()) : a); if (pts.length) {
        const c = pts.reduce((acc, p) => acc.add(p), V3()).multiplyScalar(1 / pts.length); let et = 0; for (const p of pts) et = Math.max(et, p.distanceTo(c));
        voulu = c.setY(0.6); Ctl.camYaw += dt * cam.auto.vitesse; cam.pitch += (cam.auto.pitch - cam.pitch) * (1 - Math.exp(-dt / 0.5)); const dv = Math.max(4, Math.min(14, et * 2.2 + cam.auto.marge)); cam.dist += (dv - cam.dist) * (1 - Math.exp(-dt / 0.8)); } }
    if (!cam.cible) cam.cible = voulu.clone(); cam.cible.lerp(voulu, 1 - Math.exp(-dt / 0.12));
    const cible = cam.cible;
    camera.position.set(cible.x + Math.sin(Ctl.camYaw + Math.PI) * cam.dist * Math.cos(cam.pitch), cible.y + cam.dist * Math.sin(cam.pitch), cible.z + Math.cos(Ctl.camYaw + Math.PI) * cam.dist * Math.cos(cam.pitch));
    camera.lookAt(cible);
    rendre();
    // HUD
    const f = A.frame, s = Base.meta.sequences[Base.seq[f]];
    const vit = Math.hypot(Base.v[f * 3], Base.v[f * 3 + 2]);
    const rec = A.glisse.recentCm(), moy = A.glisse.moyenneCm();
    // bandeau du bas pendant un preset : chrono + derniers événements du journal (lisible même interface masquée)
    { const cr = document.getElementById('credit'); if (cr) { if (!cr.dataset.credit) cr.dataset.credit = cr.textContent; if (CINE.titre) { const noms = CINE.noms || ['R', 'V', 'T1', 'T2', 'T3']; const lib = { voit: 'voit', perd: 'perd de vue', touche: 'touche', rate: 'rate', abat: 'abat', couvert: 'va au couvert', suppression: 'tire pour se couvrir', traine: 'traîne', releve: 'relève sur place', 'traine-trop-long': 'trop long à découvert (fumigène au jeu)' }; const ev = EVENEMENTS.filter(e => e.k !== 'rate' && e.k !== 'voit' && e.k !== 'perd').slice(-4).map(e => `${e.t.toFixed(1)} s ${noms[e.qui] || e.qui} ${lib[e.k] || e.k}${e.qui2 != null ? ' ' + (noms[e.qui2] || e.qui2) : ''}${e.loc ? ' (' + e.loc + ')' : ''}${e.hp != null ? ' pv ' + e.hp : ''}`); cr.textContent = `${CINE.titre} · ${CINE.t.toFixed(1)} s — ${ev.join(' · ') || '…'}`; cr.style.display = ''; cr.style.color = '#c6ccd6'; } else if (cr.dataset.credit) { cr.textContent = cr.dataset.credit; cr.style.color = ''; } } }
    HUD.etat.innerHTML = `<span style="float:right;color:#7f8794">v${VERSION}</span>${CINE.titre ? `<b style="color:#ffb347">${CINE.titre}</b> · ${CINE.t.toFixed(1)} s${CINE.etapes || agents.some(A => A.cerveau) ? '' : ' (terminé)'}<br>` : ''}<b>${s.nom.replace('.bvh', '')}</b> image ${f - s.debut}/${s.fin - s.debut}<br>vitesse animation <b>${vit.toFixed(2)} m/s</b> · cible ${A.vGoal.length().toFixed(2)} m/s<br>sauts : ${(A.sautsFen.length / 2).toFixed(1)}/s (total ${A.sauts}) · ${agents.length} soldat${agents.length > 1 ? 's' : ''} · simulation ${tempsPas.toFixed(2)} ms/pas<br>mode : ${Ctl.chemin ? 'chemin' : 'clavier'}${Ctl.visee ? ' · <span class=on>arme</span>' : ''}${Ctl.verrouRegard ? ' · <span class=on>regard verrouillé</span>' : ''}${Ctl.accroupi ? ' · <span class=on>accroupi</span>' : ''}`;
    const pct = Math.min(100, rec / 30 * 100); HUD.jauge.style.width = pct + '%'; HUD.jauge.style.background = rec < 5 ? '#5ad17a' : rec < 15 ? '#ffb347' : '#ff6b6b';
    HUD.jaugeTxt.textContent = `glissement des pieds : ${rec.toFixed(1)} cm/s (2 s) · ${moy.toFixed(1)} cm/s depuis le début · instantané ${((A.inst || 0) * 100).toFixed(0)} cm/s`;
    window.__MM = { frame: f, glisseMoy: moy, glisseRecent: rec, sauts: A.sauts, soldat: S, Ctl, Base, facteurRacine: A.facteurRacine, agents, tempsPas };   // pour les outils de mesure
  }

  init().catch(e => { document.getElementById('msg').textContent = 'Erreur : ' + e.message; console.error(e); });
})();
