// Revue d'animation — mesures automatiques sur un soldat Soldat3D (positions des os, du maillage, de l'arme).
// Utilisé par le banc (outils/revue/banc.html) ET injecté dans le jeu (outils/revue/jeu.py) : les mêmes mesures, les mêmes
// unités. Tout est en mètres / degrés dans le MONDE, sol à y = 0. Aucune modification du jeu : lecture seule.
//
//   REVUE.equiper(f)            calibre un soldat (capsules du corps, points de semelle, triangles de l'arme) — une fois
//   REVUE.mesurer(f, ctx)       mesures instantanées d'une image (ctx : { cible: Vector3|null, vel: Vector3, tir: bool })
//   new REVUE.Suivi()           mesures dans le temps (glissement des pieds, pas, cadence, à-coups) : .ajouter(m, dt) puis .bilan()
(function () {
  const V = () => new THREE.Vector3();
  const D = 180 / Math.PI;
  const os = (f, n) => f.body.getObjectByName('mixamorig' + n) || f.body.getObjectByName('mixamorig:' + n);
  const WP = (o, v) => o.getWorldPosition(v || V());
  const WQ = (o) => o.getWorldQuaternion(new THREE.Quaternion());
  const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.clone().normalize().dot(b.clone().normalize())))) * D;
  const wrap = (a) => { while (a > 180) a -= 360; while (a < -180) a += 360; return a; };
  const azim = (v) => Math.atan2(v.x, v.z) * D;   // azimut (°) d'une direction horizontale, 0 = +Z

  // distance de deux segments [p1,q1] [p2,q2] (Ericson, Real-Time Collision Detection 5.1.9)
  function segSeg(p1, q1, p2, q2) {
    const d1 = q1.clone().sub(p1), d2 = q2.clone().sub(p2), r = p1.clone().sub(p2);
    const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r); let s, t;
    if (a < 1e-9 && e < 1e-9) return p1.distanceTo(p2);
    if (a < 1e-9) { s = 0; t = Math.max(0, Math.min(1, f / e)); }
    else { const c = d1.dot(r); if (e < 1e-9) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
      else { const b = d1.dot(d2), den = a * e - b * b; s = den > 1e-9 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0; t = (b * s + f) / e;
        if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); } else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); } } }
    return p1.clone().addScaledVector(d1, s).distanceTo(p2.clone().addScaledVector(d2, t));
  }
  const ptSeg = (p, a, b) => { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / Math.max(1e-9, ab.dot(ab)))); return p.distanceTo(a.clone().addScaledVector(ab, t)); };
  // point le plus proche sur un triangle (Ericson 5.1.5)
  function ptTri(p, a, b, c, out) {
    const ab = b.clone().sub(a), ac = c.clone().sub(a), ap = p.clone().sub(a);
    const d1 = ab.dot(ap), d2 = ac.dot(ap); if (d1 <= 0 && d2 <= 0) return out.copy(a);
    const bp = p.clone().sub(b), d3 = ab.dot(bp), d4 = ac.dot(bp); if (d3 >= 0 && d4 <= d3) return out.copy(b);
    const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) return out.copy(a).addScaledVector(ab, d1 / (d1 - d3));
    const cp = p.clone().sub(c), d5 = ab.dot(cp), d6 = ac.dot(cp); if (d6 >= 0 && d5 <= d6) return out.copy(c);
    const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) return out.copy(a).addScaledVector(ac, d2 / (d2 - d6));
    const va = d3 * d6 - d5 * d4; if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) return out.copy(b).addScaledVector(c.clone().sub(b), (d4 - d3) / ((d4 - d3) + (d5 - d6)));
    const den = 1 / (va + vb + vc); return out.copy(a).addScaledVector(ab, vb * den).addScaledVector(ac, vc * den);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Calibration
  // ---------------------------------------------------------------------------------------------------------------
  const SEGS = { tronc: ['Spine', 'Neck'], tete: ['Head', 'HeadTop_End'], brasD: ['RightArm', 'RightForeArm'], avbD: ['RightForeArm', 'RightHand'], brasG: ['LeftArm', 'LeftForeArm'], avbG: ['LeftForeArm', 'LeftHand'],
    cuisseG: ['LeftUpLeg', 'LeftLeg'], tibiaG: ['LeftLeg', 'LeftFoot'], cuisseD: ['RightUpLeg', 'RightLeg'], tibiaD: ['RightLeg', 'RightFoot'], piedG: ['LeftFoot', 'LeftToeBase'], piedD: ['RightFoot', 'RightToeBase'] };
  const DOM = { tronc: /^(Spine|Spine1|Spine2)$/, tete: /^Head$/, brasD: /^RightArm$/, avbD: /^RightForeArm$/, brasG: /^LeftArm$/, avbG: /^LeftForeArm$/, cuisseG: /^LeftUpLeg$/, tibiaG: /^LeftLeg$/, cuisseD: /^RightUpLeg$/, tibiaD: /^RightLeg$/, piedG: /^LeftFoot$/, piedD: /^RightFoot$/ };
  const DOIGTS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];

  function equiper(f) {
    if (f.revue) return f.revue;
    const R = { os: {}, rayons: {}, semelle: {}, arme: null };
    const n = (x) => os(f, x);
    for (const k of ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'HeadTop_End', 'RightShoulder', 'LeftShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftArm', 'LeftForeArm', 'LeftHand',
      'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'LeftToe_End', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase', 'RightToe_End']) R.os[k] = n(k);
    // doigts reconnus par leur POSITION (dans les squelettes Meshy, les noms des doigts sont souvent permutés) : pouce = base la
    // plus proche du poignet, puis du côté du pouce vers l'auriculaire (même règle que soldat3d.js / calculerPrise)
    f.group.updateMatrixWorld(true);
    for (const c of ['Right', 'Left']) {
      const H = n(c + 'Hand'); if (!H) continue;
      const ch = H.children.filter(b => b.isBone).map(b => { const k = [b]; while (k.length < 4) { const x = k[k.length - 1].children.find(y => y.isBone); if (!x) break; k.push(x); } return k; }).filter(k => k.length >= 4);
      if (ch.length !== 5) { for (const d of DOIGTS) for (const i of [1, 2, 3, 4]) R.os[c + d + i] = n(c + 'Hand' + d + i); continue; }
      const hp = WP(H), base = ch.map(k => WP(k[0]).sub(hp)), axe = base.reduce((a, b) => a.add(b.clone()), V()).normalize();
      const ip = base.map((b, i) => [i, b.dot(axe)]).sort((a, b) => a[1] - b[1])[0][0], cote = base[ip].clone().addScaledVector(axe, -base[ip].dot(axe));
      const autres = [0, 1, 2, 3, 4].filter(i => i !== ip).sort((a, b) => base[b].dot(cote) - base[a].dot(cote));
      [ip].concat(autres).forEach((k, j) => ch[k].forEach((b, i) => { R.os[c + DOIGTS[j] + (i + 1)] = b; }));
      R.nomsDoigts = R.nomsDoigts || {}; R.nomsDoigts[c] = [ip].concat(autres).map(k => ch[k][0].name.replace(/^mixamorig:?/, ''));
    }
    R.os.headfront = f.body.getObjectByName('headfront');
    // courbure de chaque doigt dans la pose de liaison (positions de liaison = inverses des boneInverses)
    if (f.skinned) { const sk = f.skinned.skeleton, bp = (o) => { const i = sk.bones.indexOf(o); return i < 0 ? null : new THREE.Vector3().setFromMatrixPosition(sk.boneInverses[i].clone().invert()); };
      R.courbeLiaison = {};
      for (const c of ['Right', 'Left']) for (const d of DOIGTS) { const q = [R.os[c + 'Hand'], R.os[c + d + 1], R.os[c + d + 2], R.os[c + d + 3], R.os[c + d + 4]].map(o => o && bp(o)); if (q.some(x => !x)) continue;
        R.courbeLiaison[c + d] = ang(q[1].clone().sub(q[0]), q[2].clone().sub(q[1])) + ang(q[2].clone().sub(q[1]), q[3].clone().sub(q[2])) + ang(q[3].clone().sub(q[2]), q[4].clone().sub(q[3])); } }
    f.group.updateMatrixWorld(true);
    // sommets de la PEAU du bout de chaque doigt (os dominant = phalange la plus distale qui a des sommets) : sur les gants
    // Meshy, l'os « …4 » n'est pas sur le maillage (1 à 3 cm à l'intérieur) ; on mesure donc le gant, pas l'os
    if (f.skinned) { const sk2 = f.skinned, g2 = sk2.geometry, si2 = g2.attributes.skinIndex, sw2 = g2.attributes.skinWeight, bn = sk2.skeleton.bones;
      const dom = new Int32Array(g2.attributes.position.count); for (let i = 0; i < dom.length; i++) { let bi = 0, bw = -1; for (let j = 0; j < 4; j++) { const w = sw2.getComponent(i, j); if (w > bw) { bw = w; bi = si2.getComponent(i, j); } } dom[i] = bi; }
      R.peauDoigt = {}; const vv = V();
      for (const c of ['Right', 'Left']) for (const d of DOIGTS) {
        let liste = [];
        for (const k of [3, 2, 1]) { const b = R.os[c + d + k]; if (!b) continue; const ib = bn.indexOf(b); for (let i = 0; i < dom.length; i++) if (dom[i] === ib) liste.push(i); if (liste.length >= 6) break; }
        if (!liste.length) continue;
        // les 10 sommets les plus éloignés de la main (le bout du doigt)
        const hp = WP(R.os[c + 'Hand']); liste = liste.map(i => { sk2.getVertexPosition(i, vv); vv.applyMatrix4(sk2.matrixWorld); return [i, vv.distanceTo(hp)]; }).sort((a, b) => b[1] - a[1]).slice(0, 10).map(x => x[0]);
        R.peauDoigt[c + d] = liste;
      } }
    // capsules : rayon = 75e centile de la distance des sommets (os dominant) à leur segment
    const sk = f.skinned;
    if (sk && sk.geometry && sk.getVertexPosition) {
      const g = sk.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, N = g.attributes.position.count, bones = sk.skeleton.bones;
      const nomOs = bones.map(b => b.name.replace(/^mixamorig:?/, ''));
      const dists = {}, v = V(), pts = { piedG: [], piedD: [] };
      const seg = {}; for (const k in SEGS) { const a = R.os[SEGS[k][0]], b = R.os[SEGS[k][1]]; if (a && b) seg[k] = [WP(a), WP(b)]; }
      for (let i = 0; i < N; i += 1) {
        let bi = 0, bw = -1; for (let j = 0; j < 4; j++) { const w = sw.getComponent(i, j); if (w > bw) { bw = w; bi = si.getComponent(i, j); } }
        const nm = nomOs[bi]; let cle = null; for (const k in DOM) if (DOM[k].test(nm)) { cle = k; break; }
        const isToe = /^(Left|Right)(ToeBase|Toe_End)$/.test(nm); if (!cle && !isToe) continue;
        sk.getVertexPosition(i, v); v.applyMatrix4(sk.matrixWorld);
        if (cle && seg[cle]) (dists[cle] || (dists[cle] = [])).push(ptSeg(v, seg[cle][0], seg[cle][1]));
        if (cle === 'piedG' || cle === 'piedD' || isToe) pts[(cle === 'piedG' || /^Left/.test(nm)) ? 'piedG' : 'piedD'].push([v.clone(), nm]);
      }
      for (const k in dists) { const a = dists[k].sort((x, y) => x - y); R.rayons[k] = a[Math.floor(a.length * (k === 'tronc' || k === 'tete' ? 0.6 : 0.5))];}   // (médiane : les sommets des hanches / fesses gonflent le 75e centile)
      // semelle : talon, plante, bout et pointe de chaque botte, calculés dans la POSE DE LIAISON (pieds à plat), puis gardés
      // dans le repère de leur os. (Calculés dans la pose courante, un pied en l'air pointe en bas donnait un « talon » sur les
      // orteils et une direction du pied fausse.)
      const bonesAll = sk.skeleton.bones, sauve = bonesAll.map(b => [b.position.clone(), b.quaternion.clone(), b.scale.clone()]);
      try {
        sk.skeleton.pose(); f.body.updateMatrixWorld(true);
        const vb = V(), upB = WP(R.os.Head).sub(WP(R.os.LeftFoot)).normalize();
        for (const c of ['Left', 'Right']) {
          const ft = R.os[c + 'Foot'], toe = R.os[c + 'ToeBase']; if (!ft || !toe) continue;
          const iF = bonesAll.indexOf(ft), iT = bonesAll.indexOf(toe), iE = bonesAll.indexOf(R.os[c + 'Toe_End']);
          const pts2 = [];
          for (let i = 0; i < N; i++) { let bi = 0, bw = -1; for (let j = 0; j < 4; j++) { const w = sw.getComponent(i, j); if (w > bw) { bw = w; bi = si.getComponent(i, j); } }
            if (bi !== iF && bi !== iT && bi !== iE) continue; sk.getVertexPosition(i, vb); const pp = vb.clone().applyMatrix4(sk.matrixWorld); pp.idx = i; pts2.push(pp); }
          if (!pts2.length) continue;
          const dir = WP(toe).sub(WP(ft)); dir.addScaledVector(upB, -dir.dot(upB)).normalize();
          const hmin = Math.min(...pts2.map(p => p.dot(upB))), bas = pts2.filter(p => p.dot(upB) < hmin + 0.02);
          let talon = bas[0], bout = bas[0], tip = pts2[0];
          for (const p of bas) { if (p.dot(dir) < talon.dot(dir)) talon = p; if (p.dot(dir) > bout.dot(dir)) bout = p; }
          for (const p of pts2) if (p.dot(dir) > tip.dot(dir)) tip = p;
          const plante = WP(toe).addScaledVector(upB, hmin - WP(toe).dot(upB));
          const loc = (o, p) => o.worldToLocal(p.clone());
          // axe long de la semelle : direction principale (ACP) des sommets de la bande basse (3 cm), dans le plan du sol,
          // orientée talon → pointe ; gardé dans le repère de l'os du pied (le sommet le plus en avant est souvent côté gros
          // orteil : talon → pointe tournait l'axe de ~10-15° vers l'intérieur)
          const bande = pts2.filter(p => p.dot(upB) < hmin + 0.03), side = new THREE.Vector3().crossVectors(upB, dir).normalize();
          let mx = 0, my = 0; bande.forEach(p => { mx += p.dot(dir); my += p.dot(side); }); mx /= bande.length; my /= bande.length;
          let sxx = 0, sxy = 0, syy = 0; bande.forEach(p => { const x = p.dot(dir) - mx, y = p.dot(side) - my; sxx += x * x; sxy += x * y; syy += y * y; });
          const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), axe = dir.clone().multiplyScalar(Math.cos(th)).addScaledVector(side, Math.sin(th)).normalize();
          if (axe.dot(dir) < 0) axe.negate();
          // repères de liaison pour : orteils relevés (« orteil d'elfe »), flexion plantaire de la cheville, écrasement de la botte
          const toeEnd = R.os[c + 'Toe_End'], leg = R.os[c + 'Leg'];
          const v1 = WP(toe).sub(WP(ft)), v2 = toeEnd ? WP(toeEnd).sub(WP(toe)) : v1.clone(), shin = WP(ft).sub(WP(leg));
          const angOrteil = (a, b, n) => Math.atan2(b.clone().normalize().dot(n) - a.clone().normalize().dot(n), a.clone().normalize().dot(b.clone().normalize())) * D;
          R.semelle[c] = { talon: loc(ft, talon), plante: loc(toe, plante), bout: loc(toe, bout), pointe: loc(toe, tip), sol0: 0, axeBind: +(Math.atan2(axe.dot(side), axe.dot(dir)) * D).toFixed(1), axe: axe.clone().applyQuaternion(WQ(ft).invert()),
            hautPied: upB.clone().applyQuaternion(WQ(ft).invert()), orteil0: angOrteil(v1, v2, upB), cheville0: ang(shin, v1),
            iTalon: talon.idx, iPointe: tip.idx, dBotte0: talon.distanceTo(tip) };
        }
      } finally { bonesAll.forEach((b, i) => { b.position.copy(sauve[i][0]); b.quaternion.copy(sauve[i][1]); b.scale.copy(sauve[i][2]); }); f.body.updateMatrixWorld(true); }
    }
    // triangles de l'arme dans son repère, rangés dans une grille (cases de 2 cm) pour les distances doigt ↔ arme
    const w = f.weapon; if (w) {
      w.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(w.matrixWorld).invert(), tris = [];
      w.traverse(o => { if (!o.isMesh || !o.geometry) return; const g = o.geometry, pos = g.attributes.position, idx = g.index, m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
        const get = (i) => V().fromBufferAttribute(pos, i).applyMatrix4(m); const nT = idx ? idx.count / 3 : pos.count / 3;
        for (let t = 0; t < nT; t++) { const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2; tris.push([get(i0), get(i1), get(i2), o.name]); } });
      // (l'échelle du groupe de l'arme est 1 ; les points de prise de Modeles3D sont dans ce même repère)
      const C = 0.02, grille = new Map(), cle = (x, y, z) => x + ',' + y + ',' + z;
      tris.forEach((t, i) => { const mn = t[0].clone().min(t[1]).min(t[2]), mx = t[0].clone().max(t[1]).max(t[2]);
        for (let x = Math.floor(mn.x / C); x <= Math.floor(mx.x / C); x++) for (let y = Math.floor(mn.y / C); y <= Math.floor(mx.y / C); y++) for (let z = Math.floor(mn.z / C); z <= Math.floor(mx.z / C); z++) { const k = cle(x, y, z); if (!grille.has(k)) grille.set(k, []); grille.get(k).push(i); } });
      const bb = new THREE.Box3(); tris.forEach(t => { bb.expandByPoint(t[0]); bb.expandByPoint(t[1]); bb.expandByPoint(t[2]); });
      R.arme = { tris, grille, C, cle, bb, nTris: tris.length };
      // détente (estimée) : devant la poignée, sous l'axe du canon — point de référence pour l'index (vérifiable en gros plan)
      if (w.gripPt) R.arme.detente = (OT.Soldat3D.PRISE && OT.Soldat3D.PRISE.R && OT.Soldat3D.PRISE.R.detente) ? new THREE.Vector3().fromArray(OT.Soldat3D.PRISE.R.detente.p) : w.gripPt.clone().add(new THREE.Vector3(0, 0.025, 0.065));   // (point de détente d'anim-haut si présent)   // (calé à l'œil sur la vue armeD du banc)
      if (w.gripPt && w.forePt) { R.arme.axeZ = [w.gripPt.z, w.forePt.z]; }
    }
    f.revue = R; return R;
  }
  // distance (signée : < 0 = dans l'arme, selon la normale du triangle le plus proche) d'un point du monde à la surface de l'arme
  function distArme(f, R, pW, rmax) {
    const A = R.arme; if (!A) return null;
    const p = f.weapon.worldToLocal(pW.clone()), C = A.C, r = Math.ceil((rmax || 0.06) / C);
    const cx = Math.floor(p.x / C), cy = Math.floor(p.y / C), cz = Math.floor(p.z / C), vus = new Set(), q = V();
    let best = Infinity, bq = null, bt = null;
    for (let x = cx - r; x <= cx + r; x++) for (let y = cy - r; y <= cy + r; y++) for (let z = cz - r; z <= cz + r; z++) {
      const L = A.grille.get(A.cle(x, y, z)); if (!L) continue;
      for (const i of L) { if (vus.has(i)) continue; vus.add(i); const t = A.tris[i]; ptTri(p, t[0], t[1], t[2], q); const d = q.distanceToSquared(p); if (d < best) { best = d; bq = q.clone(); bt = t; } }
    }
    if (!bq) return { d: rmax || 0.06, loin: true };
    const nrm = bt[1].clone().sub(bt[0]).cross(bt[2].clone().sub(bt[0])).normalize(), s = p.clone().sub(bq).dot(nrm) < 0 ? -1 : 1;
    return { d: Math.sqrt(best) * s, piece: bt[3], pLoc: p, qLoc: bq };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Mesures d'une image
  // ---------------------------------------------------------------------------------------------------------------
  function mesurer(f, ctx) {
    ctx = ctx || {}; const R = equiper(f), O = R.os, m = {};
    f.group.updateMatrixWorld(true); if (f.weapon) f.weapon.updateMatrixWorld(true);
    const P = {}; for (const k in O) if (O[k]) P[k] = WP(O[k]);
    const g0 = f.group.position.y, up = new THREE.Vector3(0, 1, 0);
    const gq = WQ(f.group), avantG = new THREE.Vector3(0, 0, 1).applyQuaternion(gq), gaucheG = new THREE.Vector3(1, 0, 0).applyQuaternion(gq);
    const vel = ctx.vel || V(), vit = Math.hypot(vel.x, vel.z); m.vitesse = vit;
    const dep = vit > 0.15 ? new THREE.Vector3(vel.x, 0, vel.z).normalize() : avantG.clone();   // direction de déplacement (ou de face)
    const lat = new THREE.Vector3().crossVectors(up, dep).normalize();                            // gauche du déplacement
    // --- pieds : points de semelle, hauteur au sol, orientation
    let fwB = null;
    for (const [c, s] of [['Left', 'G'], ['Right', 'D']]) {
      const S = R.semelle[c]; if (!S) continue;
      const ft = O[c + 'Foot'], toe = O[c + 'ToeBase'];
      const talon = ft.localToWorld(S.talon.clone()), plante = toe.localToWorld(S.plante.clone()), bout = toe.localToWorld(S.bout.clone()), pointe = toe.localToWorld(S.pointe.clone());
      m['talon' + s] = talon; m['plante' + s] = plante; m['bout' + s] = bout;
      m['solMin' + s] = Math.min(talon.y, plante.y, bout.y, pointe.y) - g0;                  // < 0 : pied dans le sol
      m['talonY' + s] = talon.y - g0; m['boutY' + s] = Math.min(bout.y, pointe.y) - g0;
      const dir = S.axe ? S.axe.clone().applyQuaternion(WQ(ft)) : pointe.clone().sub(talon); dir.y = 0; m['piedAz' + s] = azim(dir); m['axe' + s] = dir.clone().normalize();   // (axe ACP de la semelle ; à défaut talon → bout de la botte)
      m['piedVsDep' + s] = wrap(azim(dir) - azim(dep));
      // orteils relevés : angle de la phalange (ToeBase → Toe_End) au-dessus du pied (Foot → ToeBase), moins celui de la liaison
      { const te = O[c + 'Toe_End'], up2 = S.hautPied ? S.hautPied.clone().applyQuaternion(WQ(ft)) : new THREE.Vector3(0, 1, 0);
        const a1 = P[c + 'ToeBase'].clone().sub(P[c + 'Foot']).normalize(), a2 = te ? P[c + 'Toe_End'].clone().sub(P[c + 'ToeBase']).normalize() : a1.clone();
        m['orteil' + s] = Math.atan2(a2.dot(up2) - a1.dot(up2), a1.dot(a2)) * D - (S.orteil0 || 0);
        // flexion plantaire de la cheville (+ = pointe du pied vers le bas, par rapport à la liaison)
        m['plantaire' + s] = ang(P[c + 'Foot'].clone().sub(P[c + 'Leg']), a1) - (S.cheville0 || 0);
        m['talonLeve' + s] = (talon.y - plante.y);
        // botte écrasée / étirée : distance talon ↔ pointe de la botte (sommets de la peau) rapportée à la liaison
        if (f.skinned && S.iTalon !== undefined && S.dBotte0) { const va = V(), vb2 = V(); f.skinned.getVertexPosition(S.iTalon, va); f.skinned.getVertexPosition(S.iPointe, vb2); va.applyMatrix4(f.skinned.matrixWorld); vb2.applyMatrix4(f.skinned.matrixWorld);
          m['botte' + s] = va.distanceTo(vb2) / (S.dBotte0 * f.group.getWorldScale(V()).x) - 1; } }                                         // angle de progression du pied
      m['cheville' + s] = P[c + 'Foot'];
      // genou : flexion (0 = jambe tendue), signe < 0 = hyperextension (genou en arrière de la ligne hanche → cheville)
      const H = P[c + 'UpLeg'], K = P[c + 'Leg'], A = P[c + 'Foot'];
      const flex = 180 - ang(H.clone().sub(K), A.clone().sub(K)), fw = dir.lengthSq() > 1e-6 ? dir.clone().normalize() : dep;
      const ka = K.clone().sub(H), ha = A.clone().sub(H); const hors = ka.clone().sub(ha.clone().multiplyScalar(ka.dot(ha) / Math.max(1e-9, ha.dot(ha))));
      // sens du genou dans le repère du BASSIN : angle entre la direction où pointe le genou (écart du genou à la ligne
      // hanche → cheville) et l'avant du bassin. Un genou plie toujours vers l'avant : > 100° = genou à l'envers.
      { const bl = P.LeftUpLeg.clone().sub(P.RightUpLeg); bl.y = 0; const bav = new THREE.Vector3().crossVectors(bl, new THREE.Vector3(0, 1, 0)).normalize();
        const axe = ha.clone().normalize(), bp = bav.clone().addScaledVector(axe, -bav.dot(axe));
        m['genouSens' + s] = flex > 8 && hors.length() > 0.01 && bp.lengthSq() > 1e-6 ? ang(hors, bp) : 0;
        m['genouArriere' + s] = hors.dot(bav);   // m : > 0 genou devant la ligne hanche → cheville (selon l'avant du bassin)
        fwB = bav; }
      m['genou' + s] = m['genouArriere' + s] < -0.005 && flex > 1 && flex < 20 ? -flex : flex;
      // valgus du genou (plan frontal du bassin) : angle (+ = genou rentré vers l'axe du corps) entre hanche → genou et genou → cheville
      { const bl2 = P.LeftUpLeg.clone().sub(P.RightUpLeg); bl2.y = 0; bl2.normalize(); const inw = bl2.clone().multiplyScalar(c === 'Left' ? -1 : 1);   // vers le milieu
        const bav2 = new THREE.Vector3().crossVectors(bl2, new THREE.Vector3(0, 1, 0)).normalize(), proj = (v) => v.clone().addScaledVector(bav2, -v.dot(bav2));
        const u1 = proj(K.clone().sub(H)), u2 = proj(A.clone().sub(K));
        m['valgus' + s] = u1.lengthSq() > 1e-6 && u2.lengthSq() > 1e-6 && flex > 5 && flex < 70 && (m['solMin' + s] === undefined || m['solMin' + s] < 0.05) ?   // (pied chargé seulement : en oscillation, genou très plié, la projection frontale n'a pas de sens)
           Math.atan2(u1.clone().normalize().dot(inw) - u2.clone().normalize().dot(inw), u1.clone().normalize().dot(u2.clone().normalize())) * D : 0; }   // (hyperextension : jambe presque tendue, genou en arrière selon l'avant du bassin)   // (signe seulement près de la jambe tendue : au-delà, un genou plié « à l'envers » se verrait de toute façon)
      m['genouDevantOrteil' + s] = K.clone().sub(bout).dot(fw);                                    // > 0 : genou au-delà du bout du pied
    }
    // écart des pieds / genoux perpendiculaire au déplacement (< 0 : croisés), et dans le repère du bassin
    if (P.LeftFoot && P.RightFoot) {
      const bassinLat = P.LeftUpLeg.clone().sub(P.RightUpLeg); bassinLat.y = 0; bassinLat.normalize();
      m.ecartPieds = P.LeftFoot.clone().sub(P.RightFoot).dot(lat); m.ecartGenoux = P.LeftLeg.clone().sub(P.RightLeg).dot(lat);
      m.ecartPiedsBassin = P.LeftFoot.clone().sub(P.RightFoot).dot(bassinLat); m.ecartGenouxBassin = P.LeftLeg.clone().sub(P.RightLeg).dot(bassinLat);
      m.ecartPiedsAvant = P.LeftFoot.clone().sub(P.RightFoot).dot(avantG);                           // décalage avant/arrière (pied gauche devant > 0)
      m.ecartPiedsLarg = Math.abs(P.LeftFoot.clone().sub(P.RightFoot).dot(gaucheG));
      const rr = (k) => R.rayons[k] || 0.06;
      m.tibias = segSeg(P.LeftLeg, P.LeftFoot, P.RightLeg, P.RightFoot) - rr('tibiaG') - rr('tibiaD');   // < 0 : les tibias s'interpénètrent
      m.cuisses = segSeg(P.LeftUpLeg, P.LeftLeg, P.RightUpLeg, P.RightLeg) - rr('cuisseG') - rr('cuisseD');
      m.piedsPied = segSeg(P.LeftFoot, P.LeftToeBase, P.RightFoot, P.RightToeBase) - rr('piedG') - rr('piedD');
    }
    // --- bassin, buste, tête
    const bas = P.LeftUpLeg.clone().sub(P.RightUpLeg); bas.y = 0; const bassinAv = new THREE.Vector3().crossVectors(bas, up).normalize();   // avant du bassin
    const ep = P.LeftArm.clone().sub(P.RightArm); ep.y = 0; const epAv = new THREE.Vector3().crossVectors(ep, up).normalize();
    m.bassinAz = azim(bassinAv); m.epaulesAz = azim(epAv); m.torsion = wrap(m.epaulesAz - m.bassinAz);
    m.bassinVsDep = wrap(m.bassinAz - azim(dep)); m.bassinY = P.Hips.y - g0;
    const tronc = P.Neck.clone().sub(P.Hips);
    m.penche = Math.atan2(tronc.dot(epAv), tronc.y) * D;                // + : buste penché vers l'avant (repère des épaules)
    m.roulis = Math.atan2(tronc.dot(ep.clone().normalize()), tronc.y) * D;  // inclinaison latérale (+ vers la gauche)
    m.hautDos = (() => { const v = P.Neck.clone().sub(P.Spine2); return Math.atan2(v.dot(epAv), v.y) * D; })();
    // tête : axe du visage (+Z local de Head), tangage / lacet ; œil ≈ headfront si présent
    const qH = WQ(O.Head), face = new THREE.Vector3(0, 0, 1).applyQuaternion(qH), hautTete = new THREE.Vector3(0, 1, 0).applyQuaternion(qH);
    m.teteAz = azim(face); m.teteTangage = Math.asin(Math.max(-1, Math.min(1, face.y))) * D;
    const fx = face.clone().setY(0).normalize(), latT = new THREE.Vector3().crossVectors(fx, up).normalize();
    m.teteRoulis = Math.atan2(-hautTete.dot(latT), hautTete.y) * D;   // + : penchée vers sa droite
    // œil DROIT (tireur droitier, œil directeur) : centre du visage décalé de 3,2 cm vers sa droite (demi-écart pupillaire)
    const oeil = (P.headfront ? P.headfront.clone() : P.Head.clone().addScaledVector(face, 0.09).addScaledVector(up, 0.03)).addScaledVector(latT, 0.032)
      .addScaledVector(P.headfront ? hautTete : up, P.headfront ? 0.072 : 0).addScaledVector(face, P.headfront ? -0.015 : 0);   // (l'os headfront est à hauteur de bouche : calé à l'œil sur la vue « tete » du banc)
    m.oeil = oeil;
    // --- bras : coudes, poignets
    for (const [c, s] of [['Right', 'D'], ['Left', 'G']]) {
      const Sh = P[c + 'Arm'], E = P[c + 'ForeArm'], Hd = P[c + 'Hand'];
      m['coude' + s] = ang(Sh.clone().sub(E), Hd.clone().sub(E));                       // 180 = bras tendu
      m['coudeHaut' + s] = E.y - Sh.y;                                                    // > 0 : coude au-dessus de l'épaule (« aile de poulet »)
      m['coudeEcart' + s] = E.clone().sub(Sh).dot(ep.clone().normalize()) * (c === 'Right' ? -1 : 1);   // coude écarté vers l'extérieur (m)
      // axe de la main = poignet → milieu des bases de l'index, du majeur, de l'annulaire et de l'auriculaire
      const bs = ['Index', 'Middle', 'Ring', 'Pinky'].map(d => P[c + d + 1]).filter(Boolean), mid = bs.length === 4 ? bs.reduce((a, b) => a.add(b), V()).multiplyScalar(0.25) : null;
      if (mid) m['poignet' + s] = ang(Hd.clone().sub(E), mid.clone().sub(Hd));                // 0 = main dans l'axe de l'avant-bras
    }
    // --- arme
    const w = f.weapon;
    if (w && w.gripPt) {
      const L2W = (p) => w.localToWorld(p.clone());
      const grip = L2W(w.gripPt), fore = L2W(w.forePt), muz = L2W(w.muzzle), butt = w.buttPt ? L2W(w.buttPt) : null;
      const canon = L2W(new THREE.Vector3(0, 0, 1)).sub(L2W(V())).normalize(), dessus = L2W(new THREE.Vector3(0, 1, 0)).sub(L2W(V())).normalize();
      m.canonTangage = Math.asin(Math.max(-1, Math.min(1, canon.y))) * D; m.canonAz = azim(canon);
      m.canonVsFace = wrap(m.canonAz - azim(avantG)); m.canonVsDep = wrap(m.canonAz - azim(dep));
      m.armeRoulis = Math.atan2(-dessus.dot(new THREE.Vector3().crossVectors(canon, up).normalize()), dessus.y) * D;   // cant (inclinaison) de l'arme
      m.bouche = muz; m.poignee = grip; m.crosse = butt;
      // paumes
      const palm = (h, mk) => mk ? WP(h).lerp(WP(mk), 0.6) : WP(h);
      const pD = palm(O.RightHand, f.bones.rm), pG = palm(O.LeftHand, f.bones.lm);
      m.paumeD_poignee = pD.distanceTo(grip);
      const pGl = w.worldToLocal(pG.clone()), fl = w.forePt;
      m.paumeG_axe = Math.hypot(pGl.x - fl.x, pGl.y - fl.y);                 // écart à l'axe du garde-main (perpendiculaire)
      m.paumeG_long = pGl.z - fl.z;                                         // position le long de l'arme (+ vers la bouche)
      m.paumeG_avantPoignee = pGl.z - w.gripPt.z;                           // m devant la poignée
      m.paumeG_fraction = (pGl.z - w.gripPt.z) / Math.max(0.05, w.muzzle.z - w.gripPt.z);   // 0 = poignée, 1 = bouche
      const dPG = distArme(f, R, pG, 0.12); m.paumeG_surface = dPG ? dPG.d : null;
      const dPD = distArme(f, R, pD, 0.12); m.paumeD_point = dPD ? dPD.d : null;
      // paume ↔ arme : points de la ligne poignet → jointures (50, 65, 80 %), le plus proche de l'arme, moins la demi-épaisseur
      // de la main (~1,5 cm). (Le point « 60 % poignet → PalmeD » tombe derrière la poignée sur une grande main.)
      for (const [c, k] of [['Right', 'paumeD_surface'], ['Left', 'paumeG_contact']]) {
        const bs = ['Index', 'Middle', 'Ring', 'Pinky'].map(d => P[c + d + 1]).filter(Boolean); if (bs.length !== 4) continue;
        const kn = bs.reduce((a, b) => a.add(b), V()).multiplyScalar(0.25), wr = P[c + 'Hand']; let best = null;
        for (const t of [0.5, 0.65, 0.8]) { const r = distArme(f, R, wr.clone().lerp(kn, t), 0.12); if (r && (best === null || r.d < best)) best = r.d; }
        m[k] = best === null ? null : best - 0.015;
      }
      // bouts des doigts ↔ surface de l'arme
      for (const [c, s] of [['Right', 'D'], ['Left', 'G']]) for (const d of DOIGTS) {
        const tip = O[c + d + 4]; if (!tip) continue; const r = distArme(f, R, P[c + d + 4], 0.1);
        m['doigtOs' + s + d] = r ? r.d : null;
        // distance du GANT : min sur les sommets du bout du doigt (si connus), sinon l'os de bout
        const pv = R.peauDoigt && R.peauDoigt[c + d];
        if (pv && f.skinned) { let best = null; const vv = V(); for (const i of pv) { f.skinned.getVertexPosition(i, vv); vv.applyMatrix4(f.skinned.matrixWorld); const q = distArme(f, R, vv, 0.04); if (q && !q.loin && (best === null || q.d < best)) best = q.d; else if (q && q.loin && best === null) best = 0.04; } m['doigt' + s + d] = best; }
        else m['doigt' + s + d] = r ? r.d : null;
        // courbure du doigt (somme des angles aux 3 articulations, 0 = tendu)
        const p1 = P[c + d + 1], p2 = P[c + d + 2], p3 = P[c + d + 3], p4 = P[c + d + 4];
        if (p1 && p2 && p3 && p4) { m['courbe' + s + d] = ang(p2.clone().sub(p1), p3.clone().sub(p2)) + ang(p3.clone().sub(p2), p4.clone().sub(p3)) + (P[c + 'Hand'] ? ang(p1.clone().sub(P[c + 'Hand']), p2.clone().sub(p1)) : 0);
          // (moins la courbure de la pose de liaison : la ligne des métacarpiens de ce squelette est en biais, ~30° « au repos »)
          if (R.courbeLiaison && R.courbeLiaison[c + d] !== undefined) m['courbe' + s + d] -= R.courbeLiaison[c + d]; }
      }
      if (R.arme && R.arme.detente && P.RightIndex4) { const dt = L2W(R.arme.detente); m.indexDetente = P.RightIndex4.distanceTo(dt); m.detente = dt;
        const il = w.worldToLocal(P.RightIndex4.clone()); m.indexHautDetente = il.y - R.arme.detente.y; m.indexAvantDetente = il.z - R.arme.detente.z; }
      // crosse ↔ creux de l'épaule droite (entre clavicule et deltoïde : depuis l'articulation de l'épaule, vers le centre et l'avant)
      if (butt) {
        const sR = P.RightArm, sL = P.LeftArm, la = sL.clone().sub(sR).setY(0).normalize(), fw2 = new THREE.Vector3().crossVectors(la, up).normalize();
        const creux = sR.clone().addScaledVector(la, 0.11).addScaledVector(fw2, 0.06).addScaledVector(up, 0.01);   // (entre le deltoïde et la clavicule : 11 cm vers le centre depuis l'articulation, 6 cm devant)
        m.creux = creux; m.crosseEpaule = butt.distanceTo(creux);
        m.crosseSousAisselle = butt.distanceTo(sR.clone().addScaledVector(up, -0.12));
      }
      // ligne de visée : œil ↔ plan vertical du canon, hauteur de l'œil au-dessus de l'axe
      { const rel = oeil.clone().sub(muz), latC = new THREE.Vector3().crossVectors(canon, up).normalize();
        m.oeilLateral = rel.dot(latC); const along = rel.dot(canon), surAxe = muz.clone().addScaledVector(canon, along); m.oeilHaut = oeil.y - surAxe.y; m.oeilRecul = butt ? oeil.clone().sub(butt).dot(canon) : null;
        m.teteVsCanon = wrap(m.teteAz - m.canonAz); }
      // cible : erreur angulaire du canon (et de la ligne œil → cible)
      if (ctx.cible) { const vC = ctx.cible.clone().sub(muz); m.erreurVisee = ang(canon, vC); m.erreurViseeAz = wrap(m.canonAz - azim(vC)); m.erreurViseeTangage = m.canonTangage - Math.atan2(vC.y, Math.hypot(vC.x, vC.z)) * D; }
      // arme dans le corps : distance minimale du segment crosse → bouche aux capsules (moins le rayon de l'arme ~3 cm)
      const rr = (k) => R.rayons[k] || 0.06, b0 = butt || grip;
      const avantTronc = grip.clone().addScaledVector(canon, 0.05);   // (la crosse touche l'épaule exprès : on part de devant la poignée)
      m.armeTronc = segSeg(avantTronc, muz, P.Spine, P.Neck) - rr('tronc') - 0.03;
      m.armeTete = segSeg(avantTronc, muz, P.Head, P.HeadTop_End || P.Head) - rr('tete') - 0.025;   // (sans la crosse : la joue s'y appuie exprès)
      m.armeCuisses = Math.min(segSeg(avantTronc, muz, P.LeftUpLeg, P.LeftLeg) - rr('cuisseG'), segSeg(avantTronc, muz, P.RightUpLeg, P.RightLeg) - rr('cuisseD')) - 0.03;
      // canon pointé sur ses propres jambes / pieds (sécurité : on ne balaie jamais son corps avec la bouche)
      { const ray = (a, b, r) => { const end = muz.clone().addScaledVector(canon, 3); return segSeg(muz, end, a, b) - r; };
        m.boucheSurSoi = Math.min(ray(P.LeftLeg, P.LeftFoot, rr('tibiaG')), ray(P.RightLeg, P.RightFoot, rr('tibiaD')), ray(P.LeftUpLeg, P.LeftLeg, rr('cuisseG')), ray(P.RightUpLeg, P.RightLeg, rr('cuisseD')), ray(P.LeftFoot, P.LeftToeBase, rr('piedG')), ray(P.RightFoot, P.RightToeBase, rr('piedD'))); }
      // bras gauche à travers l'arme / le torse : avant-bras gauche ↔ tronc
      m.avantBrasTronc = Math.min(segSeg(P.LeftForeArm, P.LeftHand, P.Spine, P.Neck) - rr('avbG') - rr('tronc'), segSeg(P.RightForeArm, P.RightHand, P.Spine, P.Neck) - rr('avbD') - rr('tronc'));
      m.mainsTronc = Math.min(ptSeg(pD, P.Spine, P.Neck), ptSeg(pG, P.Spine, P.Neck)) - rr('tronc') - 0.02;
    }
    // positions brutes utiles au suivi (pas de clone : ce sont déjà des copies)
    m._P = { hips: P.Hips, head: P.Head, rh: P.RightHand, lh: P.LeftHand, spine2: P.Spine2 };
    m._Q = { Hips: WQ(O.Hips), Spine2: WQ(O.Spine2), Head: WQ(O.Head), RightHand: WQ(O.RightHand), LeftHand: WQ(O.LeftHand), LeftFoot: WQ(O.LeftFoot), RightFoot: WQ(O.RightFoot), arme: f.weapon ? WQ(f.weapon) : null };
    m._grp = f.group.position.clone();
    return m;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Suivi dans le temps
  // ---------------------------------------------------------------------------------------------------------------
  class Suivi {
    constructor(opts) { this.fr = []; this.o = Object.assign({ sol: 0.025 }, opts || {}); }
    ajouter(m, dt, extra) { m.dt = dt; if (extra) Object.assign(m, extra); this.fr.push(m); }
    bilan() {
      const F = this.fr, out = {}, SOL = this.o.sol; if (F.length < 3) return out;
      // sol de référence de chaque pied : son point le plus bas sur la fenêtre (un pied enfoncé de 2 cm partout reste « au sol »)
      // (5e centile : un seul pic d'enfoncement ne doit pas faire croire que le pied n'est jamais au sol)
      const bas = {}; for (const s of ['G', 'D']) { const a = F.map(f => f['solMin' + s]).filter(v => typeof v === 'number').sort((x, y) => x - y); bas[s] = Math.min(0.01, a.length ? a[Math.floor(a.length * 0.05)] : 0); }
      const auSol = (f, s, k) => f[k + s].y - f._grp.y < bas[s] + SOL;
      out.solRef = bas;
      // glissement : un point de semelle au sol (< SOL) à deux images de suite ne doit pas bouger horizontalement
      for (const s of ['G', 'D']) {
        let somme = 0, temps = 0, pire = 0, pireI = -1, enPhase = 0, glPhase = 0, phases = [], rase = 0;
        for (let i = 1; i < F.length; i++) {
          const a = F[i - 1], b = F[i]; if (!a['talon' + s]) continue;
          let best = null;
          for (const k of ['talon', 'plante', 'bout']) { const pa = a[k + s], pb = b[k + s]; if (auSol(a, s, k) && auSol(b, s, k)) { const d = Math.hypot(pb.x - pa.x, pb.z - pa.z); if (best === null || d < best) best = d; } }
          // (un pied bas qui va plus vite que le corps est en oscillation au ras du sol, pas en appui : compté à part, « rase »)
          if (best !== null && best / b.dt > Math.max(0.5, (b.vitesse || 0) * 1.0)) { rase += b.dt; best = null; }
          if (best === null) { if (enPhase > 0.08) phases.push([enPhase, glPhase]); enPhase = 0; glPhase = 0; continue; }
          const v = best / b.dt; somme += best; temps += b.dt; enPhase += b.dt; glPhase += best; if (v > pire) { pire = v; pireI = i; }
        }
        if (enPhase > 0.08) phases.push([enPhase, glPhase]);
        // « patinage » pondéré par la hauteur (mesure usuelle des articles de synthèse de mouvement, H = 2,5 cm) :
        // vitesse horizontale du point le plus bas × (2 − 2^(h/H)) bornée à [0, 1], moyennée sur toutes les images
        { let sk = 0, n = 0; for (let i = 1; i < F.length; i++) { const a = F[i - 1], b = F[i]; if (!a['talon' + s]) continue;
            let lo = null; for (const k of ['talon', 'plante', 'bout']) { const h = b[k + s].y - b._grp.y - bas[s]; if (lo === null || h < lo[0]) lo = [h, k]; }
            const pa = a[lo[1] + s], pb = b[lo[1] + s], w = Math.max(0, Math.min(1, 2 - Math.pow(2, Math.max(0, lo[0]) / 0.025)));
            sk += Math.hypot(pb.x - pa.x, pb.z - pa.z) / b.dt * w; n++; }
          out['patine' + s] = n ? sk / n : 0; }
        out['rase' + s] = rase;
        out['glisseMoy' + s] = temps > 0 ? somme / temps : 0;    // m/s moyen pendant l'appui
        out['glisseMax' + s] = pire; out['glisseMaxImg' + s] = pireI;
        out['glisseParAppui' + s] = phases.length ? Math.max(...phases.map(p => p[1])) : 0;   // m perdus sur l'appui le pire
        out['appuis' + s] = phases.length;
      }
      // plus longue durée d'un pied en l'air (> 2,5 cm) : à l'arrêt, un petit pas de replacement dure < 0,4 s
      for (const s of ['G', 'D']) { let cur = 0, mx = 0; for (const f of F) { if ((f['solMin' + s] || 0) > 0.025) { cur += f.dt; mx = Math.max(mx, cur); } else cur = 0; } out['enLair' + s] = mx; }
      // poses de pied (attaques) : le pied passe de levé à posé
      const att = [];
      for (const s of ['G', 'D']) { let leve = false; for (let i = 0; i < F.length; i++) { const y = F[i]['solMin' + s]; if (y === undefined) continue; if (y > bas[s] + 0.05) leve = true; else if (leve && y < bas[s] + SOL) { leve = false; att.push({ i, s, t: F.slice(0, i + 1).reduce((x, f) => x + f.dt, 0), p: F[i]['cheville' + s].clone(), genou: F[i]['genou' + s], ...F[i] }); } } }
      att.sort((a, b) => a.i - b.i); out.attaques = att.length;
      if (att.length >= 3) {
        const T = F.reduce((x, f) => x + f.dt, 0), t0 = att[0].t, t1 = att[att.length - 1].t;
        out.cadence = (att.length - 1) / Math.max(1e-3, t1 - t0) * 60;   // pas / min
        const L = [], W = [];
        for (let i = 1; i < att.length; i++) if (att[i].s !== att[i - 1].s) {
          const d = att[i].p.clone().sub(att[i - 1].p), ve = F[att[i].i].vitesse > 0.15 ? new THREE.Vector3(...[0, 0, 0]) : null;
          const dep = new THREE.Vector3(att[i]._grp.x - att[i - 1]._grp.x, 0, att[i]._grp.z - att[i - 1]._grp.z), dl = dep.length();
          // longueur de pas = distance entre deux poses successives (pieds opposés) le long du déplacement ; largeur = perpendiculaire
          if (dl > 0.05) { dep.normalize(); L.push(Math.abs(d.dot(dep))); W.push(Math.abs(d.x * -dep.z + d.z * dep.x)); }
        }
        if (L.length) { out.longPas = L.reduce((a, b) => a + b, 0) / L.length; out.largPas = W.reduce((a, b) => a + b, 0) / W.length; out.largPasMin = Math.min(...W); }
        out.genouAttaque = att.map(a => a.genou).reduce((a, b) => a + b, 0) / att.length;
      }
      // à-coups : vitesse angulaire par os (°/s), pics = écart à la médiane glissante
      const OS = ['Hips', 'Spine2', 'Head', 'RightHand', 'LeftHand', 'LeftFoot', 'RightFoot', 'arme'];
      out.acoups = {};
      for (const k of OS) {
        const w = []; for (let i = 1; i < F.length; i++) { const a = F[i - 1]._Q[k], b = F[i]._Q[k]; if (!a || !b) { w.push(0); continue; } w.push(2 * Math.acos(Math.min(1, Math.abs(a.dot(b)))) * D / F[i].dt); }
        // accélération angulaire (°/s²) : un vrai à-coup = un changement brutal de vitesse de rotation
        let pire = 0, pi = -1; for (let i = 1; i < w.length; i++) { const acc = Math.abs(w[i] - w[i - 1]) / F[i + 1].dt; if (acc > pire) { pire = acc; pi = i + 1; } }
        out.acoups[k] = { vMax: Math.max(...w), accMax: pire, img: pi };
      }
      // bassin : rebond vertical
      const hy = F.map(f => f.bassinY); out.rebond = Math.max(...hy) - Math.min(...hy);
      // valeurs extrêmes des mesures instantanées (min / max / moyenne / pire image)
      const cles = Object.keys(F[0]).filter(k => typeof F[0][k] === 'number');
      out.stat = {};
      for (const k of cles) { let mn = Infinity, mx = -Infinity, s = 0, n = 0, imn = -1, imx = -1; F.forEach((f, i) => { const v = f[k]; if (typeof v !== 'number' || !isFinite(v)) return; if (v < mn) { mn = v; imn = i; } if (v > mx) { mx = v; imx = i; } s += v; n++; });
        if (n) out.stat[k] = { min: mn, max: mx, moy: s / n, iMin: imn, iMax: imx }; }
      return out;
    }
  }
  window.REVUE = { equiper, mesurer, distArme, Suivi, segSeg, os };
})();
