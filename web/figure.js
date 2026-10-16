// Construction du personnage 3D (partagée entre la bataille et les portraits du QG).
// Figure.build(opts) → { group, pose, hips, legs, torso, headG, shoulderR, elbowR, shoulderL, elbowL, weapon }
// opts : { weapon, uniform, vest, teamColor, headgear, skin, face, scale }
(function (root) {
  const geo = {
    thigh: new THREE.CylinderGeometry(0.095, 0.085, 0.42, 8), shin: new THREE.CylinderGeometry(0.08, 0.07, 0.42, 8), boot: new THREE.BoxGeometry(0.16, 0.1, 0.26),
    torso: new THREE.BoxGeometry(0.4, 0.5, 0.26), vest: new THREE.BoxGeometry(0.44, 0.4, 0.32), pouch: new THREE.BoxGeometry(0.1, 0.12, 0.08), pack: new THREE.BoxGeometry(0.3, 0.3, 0.16),
    upperArm: new THREE.CylinderGeometry(0.06, 0.055, 0.3, 8), foreArm: new THREE.CylinderGeometry(0.055, 0.05, 0.3, 8), hand: new THREE.SphereGeometry(0.05, 6, 6),
    neck: new THREE.CylinderGeometry(0.06, 0.07, 0.08, 8), head: new THREE.SphereGeometry(0.13, 14, 12),
    helmet: new THREE.SphereGeometry(0.16, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), helmetRim: new THREE.TorusGeometry(0.155, 0.02, 6, 20),
    beret: new THREE.SphereGeometry(0.15, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.4), beretBand: new THREE.TorusGeometry(0.135, 0.018, 6, 20),
    cap: new THREE.CylinderGeometry(0.14, 0.145, 0.1, 16), capVisor: new THREE.BoxGeometry(0.16, 0.02, 0.1),
    beanie: new THREE.SphereGeometry(0.145, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), boonie: new THREE.CylinderGeometry(0.21, 0.23, 0.02, 20), boonieTop: new THREE.CylinderGeometry(0.12, 0.13, 0.11, 16),
    goggles: new THREE.BoxGeometry(0.2, 0.06, 0.06), shades: new THREE.BoxGeometry(0.2, 0.045, 0.04), scarf: new THREE.SphereGeometry(0.135, 12, 8, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45),
    eye: new THREE.SphereGeometry(0.018, 6, 6), brow: new THREE.BoxGeometry(0.05, 0.012, 0.02), beard: new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.35), mouth: new THREE.BoxGeometry(0.05, 0.01, 0.01),
    rifle: { body: new THREE.BoxGeometry(0.05, 0.08, 0.6), barrel: new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), mag: new THREE.BoxGeometry(0.035, 0.16, 0.06), stock: new THREE.BoxGeometry(0.045, 0.1, 0.22) },
    battle: { body: new THREE.BoxGeometry(0.055, 0.085, 0.66), barrel: new THREE.CylinderGeometry(0.013, 0.013, 0.32, 6), mag: new THREE.BoxGeometry(0.035, 0.14, 0.07), stock: new THREE.BoxGeometry(0.05, 0.11, 0.24) },
    lmg: { body: new THREE.BoxGeometry(0.06, 0.1, 0.7), barrel: new THREE.CylinderGeometry(0.014, 0.014, 0.4, 6), mag: new THREE.BoxGeometry(0.12, 0.14, 0.14), stock: new THREE.BoxGeometry(0.05, 0.11, 0.24) },
    dmr: { body: new THREE.BoxGeometry(0.045, 0.07, 0.65), barrel: new THREE.CylinderGeometry(0.011, 0.011, 0.5, 6), mag: new THREE.BoxGeometry(0.03, 0.12, 0.06), stock: new THREE.BoxGeometry(0.045, 0.1, 0.26), scope: new THREE.CylinderGeometry(0.025, 0.025, 0.22, 8) },
    smg: { body: new THREE.BoxGeometry(0.05, 0.08, 0.38), barrel: new THREE.CylinderGeometry(0.012, 0.012, 0.14, 6), mag: new THREE.BoxGeometry(0.03, 0.18, 0.05), stock: new THREE.BoxGeometry(0.03, 0.06, 0.18) },
    smgsil: { body: new THREE.BoxGeometry(0.05, 0.08, 0.38), barrel: new THREE.CylinderGeometry(0.03, 0.03, 0.22, 8), mag: new THREE.BoxGeometry(0.03, 0.18, 0.05), stock: new THREE.BoxGeometry(0.03, 0.06, 0.18) },
    shotgun: { body: new THREE.BoxGeometry(0.05, 0.08, 0.55), barrel: new THREE.CylinderGeometry(0.014, 0.014, 0.4, 6), mag: new THREE.BoxGeometry(0.03, 0.05, 0.3), stock: new THREE.BoxGeometry(0.045, 0.11, 0.24) },
  };
  const SKINS = [0xf1d2b6, 0xd9a97f, 0xc9a27e, 0xa9734f, 0x8b5a3a, 0x5e3b25];
  const mats = {
    gun: new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.45, metalness: 0.6 }),
    gunDark: new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.6, metalness: 0.4 }),
    boot: new THREE.MeshStandardMaterial({ color: 0x1f1b17, roughness: 0.9 }),
    goggles: new THREE.MeshStandardMaterial({ color: 0x0d0f12, roughness: 0.3, metalness: 0.5 }),
    lens: new THREE.MeshStandardMaterial({ color: 0x3a6a8a, roughness: 0.15, metalness: 0.7 }),
    eye: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }),
    hair: [new THREE.MeshStandardMaterial({ color: 0x2a1d14, roughness: 1 }), new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1 }), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1 }), new THREE.MeshStandardMaterial({ color: 0x8a6a40, roughness: 1 })],
    beretRed: new THREE.MeshStandardMaterial({ color: 0x7a1f1f, roughness: 0.9 }), beretGreen: new THREE.MeshStandardMaterial({ color: 0x2f4a2f, roughness: 0.9 }), beretBlue: new THREE.MeshStandardMaterial({ color: 0x24324e, roughness: 0.9 }),
    scarfRed: new THREE.MeshStandardMaterial({ color: 0x8a2a2a, roughness: 1 }), scarfGreen: new THREE.MeshStandardMaterial({ color: 0x3a4a30, roughness: 1 }), scarfBlue: new THREE.MeshStandardMaterial({ color: 0x2a3a5a, roughness: 1 }),
    skins: SKINS.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 })),
  };
  // Couvre-chefs et accessoires de visage débloquables (id → fabrication). Chaque entrée : name, price (crédits), build(headG, matHelmet)
  const HEADGEAR = {
    casque:  { name: 'Casque', price: 0, build: (h, m) => { const a = new THREE.Mesh(geo.helmet, m); a.position.y = 0.02; h.add(a); const r = new THREE.Mesh(geo.helmetRim, m); r.rotation.x = Math.PI / 2; r.position.y = 0.0; h.add(r); } },
    casque_lunettes: { name: 'Casque + lunettes', price: 0, build: (h, m) => { HEADGEAR.casque.build(h, m); const g = new THREE.Mesh(geo.goggles, mats.goggles); g.position.set(0, 0.1, 0.1); h.add(g); } },
    beret_rouge: { name: 'Béret rouge', price: 90, build: (h) => { const b = new THREE.Mesh(geo.beret, mats.beretRed); b.position.set(0.02, 0.04, -0.01); b.rotation.z = -0.25; h.add(b); const r = new THREE.Mesh(geo.beretBand, mats.beretRed); r.rotation.x = Math.PI / 2; r.position.y = 0.03; h.add(r); } },
    beret_vert: { name: 'Béret vert', price: 90, build: (h) => { const b = new THREE.Mesh(geo.beret, mats.beretGreen); b.position.set(0.02, 0.04, -0.01); b.rotation.z = -0.25; h.add(b); const r = new THREE.Mesh(geo.beretBand, mats.beretGreen); r.rotation.x = Math.PI / 2; r.position.y = 0.03; h.add(r); } },
    beret_bleu: { name: 'Béret bleu', price: 90, build: (h) => { const b = new THREE.Mesh(geo.beret, mats.beretBlue); b.position.set(0.02, 0.04, -0.01); b.rotation.z = -0.25; h.add(b); const r = new THREE.Mesh(geo.beretBand, mats.beretBlue); r.rotation.x = Math.PI / 2; r.position.y = 0.03; h.add(r); } },
    casquette: { name: 'Casquette', price: 60, build: (h, m) => { const c = new THREE.Mesh(geo.cap, m); c.position.y = 0.07; h.add(c); const v = new THREE.Mesh(geo.capVisor, m); v.position.set(0, 0.03, 0.17); h.add(v); } },
    bonnet: { name: 'Bonnet', price: 60, build: (h) => { const b = new THREE.Mesh(geo.beanie, mats.hair[2]); b.position.y = 0.035; h.add(b); } },
    chapeau: { name: 'Chapeau de brousse', price: 110, build: (h, m) => { const b = new THREE.Mesh(geo.boonie, m); b.position.y = 0.06; h.add(b); const t = new THREE.Mesh(geo.boonieTop, m); t.position.y = 0.11; h.add(t); } },
    lunettes_soleil: { name: 'Lunettes de soleil', price: 70, build: (h, m) => { HEADGEAR.casque.build(h, m); const g = new THREE.Mesh(geo.shades, mats.lens); g.position.set(0, 0.02, 0.125); h.add(g); } },
    foulard: { name: 'Foulard', price: 80, build: (h, m) => { HEADGEAR.casque.build(h, m); const s = new THREE.Mesh(geo.scarf, mats.scarfGreen); s.position.set(0, -0.02, 0.01); s.scale.set(1.08, 1, 1.08); h.add(s); } },
    foulard_rouge: { name: 'Foulard rouge', price: 80, build: (h, m) => { HEADGEAR.casque.build(h, m); const s = new THREE.Mesh(geo.scarf, mats.scarfRed); s.position.set(0, -0.02, 0.01); s.scale.set(1.08, 1, 1.08); h.add(s); } },
    nu: { name: 'Tête nue', price: 40, build: (h, m, face) => { const hair = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), mats.hair[face.hair]); hair.position.y = 0.01; h.add(hair); } },
  };
  // Visage déterministe par opérateur (teint, sourcils, barbe, cheveux) à partir d'un identifiant
  function faceFor(id) {
    let h = 2166136261; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
    const r = (n) => { h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return h % n; };
    return { skin: r(SKINS.length), hair: r(mats.hair.length), beard: r(3) === 0, browUp: r(2) === 1, eyeGap: 0.04 + r(3) * 0.005 };
  }
  function makeWeapon(id) {
    const g = geo[id] || geo.rifle; const w = new THREE.Group();
    const body = new THREE.Mesh(g.body, mats.gun); w.add(body);
    const barrel = new THREE.Mesh(g.barrel, mats.gunDark); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, g.body.parameters.depth / 2 + g.barrel.parameters.height / 2); w.add(barrel);
    const mag = new THREE.Mesh(g.mag, mats.gunDark); mag.position.set(0, -g.body.parameters.height / 2 - g.mag.parameters.height / 2 + 0.02, 0.05); w.add(mag);
    const stock = new THREE.Mesh(g.stock, mats.gunDark); stock.position.set(0, -0.01, -g.body.parameters.depth / 2 - g.stock.parameters.depth / 2 + 0.02); w.add(stock);
    if (g.scope) { const sc = new THREE.Mesh(g.scope, mats.gun); sc.rotation.x = Math.PI / 2; sc.position.set(0, g.body.parameters.height / 2 + 0.03, 0); w.add(sc); }
    w.muzzle = new THREE.Vector3(0, 0.02, g.body.parameters.depth / 2 + g.barrel.parameters.height);
    return w;
  }
  function build(o) {
    const matU = new THREE.MeshStandardMaterial({ color: o.uniform, roughness: 0.95 });
    const matV = new THREE.MeshStandardMaterial({ color: o.vest, roughness: 0.9 });
    const matHelmet = new THREE.MeshStandardMaterial({ color: o.vest, roughness: 0.65 });
    const matMark = new THREE.MeshBasicMaterial({ color: o.teamColor === undefined ? 0xffffff : o.teamColor });
    const face = o.face || faceFor(o.id || 'x'); const skin = mats.skins[face.skin];
    const group = new THREE.Group();
    const pose = new THREE.Group(); group.add(pose);
    const hips = new THREE.Group(); hips.position.y = 0.86; pose.add(hips);
    const legs = [];
    for (const side of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(side * 0.11, 0, 0); hips.add(leg);
      const thigh = new THREE.Mesh(geo.thigh, matU); thigh.position.y = -0.21; leg.add(thigh);
      const knee = new THREE.Group(); knee.position.y = -0.42; leg.add(knee);
      const shin = new THREE.Mesh(geo.shin, matU); shin.position.y = -0.21; knee.add(shin);
      const boot = new THREE.Mesh(geo.boot, mats.boot); boot.position.set(0, -0.4, 0.04); knee.add(boot);
      legs.push({ leg, knee });
    }
    const torso = new THREE.Group(); hips.add(torso);
    const chest = new THREE.Mesh(geo.torso, matU); chest.position.y = 0.3; torso.add(chest);
    const vest = new THREE.Mesh(geo.vest, matV); vest.position.set(0, 0.3, 0.0); torso.add(vest);
    for (const px of [-0.13, 0, 0.13]) { const po = new THREE.Mesh(geo.pouch, matV); po.position.set(px, 0.17, 0.19); torso.add(po); }
    const pack = new THREE.Mesh(geo.pack, matV); pack.position.set(0, 0.32, -0.22); torso.add(pack);
    if (o.teamColor !== undefined) { const band = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.03, 6, 12), matMark); band.position.set(0.2, 0.42, 0); band.rotation.y = Math.PI / 2; torso.add(band); const band2 = band.clone(); band2.position.x = -0.2; torso.add(band2); }
    // tête et visage
    const neck = new THREE.Mesh(geo.neck, skin); neck.position.y = 0.58; torso.add(neck);
    const headG = new THREE.Group(); headG.position.y = 0.74; torso.add(headG);
    const head = new THREE.Mesh(geo.head, skin); headG.add(head);
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(geo.eye, mats.eye); e.position.set(sx * face.eyeGap, 0.02, 0.122); headG.add(e); const b = new THREE.Mesh(geo.brow, mats.hair[face.hair]); b.position.set(sx * face.eyeGap, 0.055 + (face.browUp ? 0.008 : 0), 0.118); b.rotation.z = sx * (face.browUp ? -0.2 : 0.15); headG.add(b); }
    const mouth = new THREE.Mesh(geo.mouth, mats.eye); mouth.position.set(0, -0.045, 0.125); headG.add(mouth);
    if (face.beard) { const bd = new THREE.Mesh(geo.beard, mats.hair[face.hair]); bd.position.set(0, -0.02, 0.03); bd.scale.set(1.1, 1, 1.1); headG.add(bd); }
    const hg = HEADGEAR[o.headgear] || HEADGEAR.casque; hg.build(headG, matHelmet, face);
    // bras + arme
    const shoulderR = new THREE.Group(); shoulderR.position.set(0.24, 0.52, 0.02); torso.add(shoulderR);
    const upperR = new THREE.Mesh(geo.upperArm, matU); upperR.position.y = -0.15; shoulderR.add(upperR);
    const elbowR = new THREE.Group(); elbowR.position.y = -0.3; shoulderR.add(elbowR);
    const foreR = new THREE.Mesh(geo.foreArm, matU); foreR.position.y = -0.15; elbowR.add(foreR);
    const handR = new THREE.Mesh(geo.hand, skin); handR.position.y = -0.3; elbowR.add(handR);
    const shoulderL = new THREE.Group(); shoulderL.position.set(-0.24, 0.52, 0.02); torso.add(shoulderL);
    const upperL = new THREE.Mesh(geo.upperArm, matU); upperL.position.y = -0.15; shoulderL.add(upperL);
    const elbowL = new THREE.Group(); elbowL.position.y = -0.3; shoulderL.add(elbowL);
    const foreL = new THREE.Mesh(geo.foreArm, matU); foreL.position.y = -0.15; elbowL.add(foreL);
    const handL = new THREE.Mesh(geo.hand, skin); handL.position.y = -0.3; elbowL.add(handL);
    const weapon = makeWeapon(o.weapon); weapon.position.set(0.1, 0.33, 0.32); torso.add(weapon);
    pose.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    if (o.scale) group.scale.setScalar(o.scale);
    return { group, pose, hips, legs, torso, headG, shoulderR, elbowR, shoulderL, elbowL, weapon };
  }
  // Pose statique « au repos, arme basse » ou « épaulé » pour les portraits
  // Pose des bras et de l'arme ; aim ∈ [0,1] : 0 = arme basse (devant le ventre, canon vers le sol), 1 = épaulée
  function armPose(f, aim) {
    const L = (a, b) => a + (b - a) * aim;
    f.shoulderR.rotation.x = L(-0.55, -1.25); f.elbowR.rotation.x = L(-1.0, -0.75); f.shoulderR.rotation.z = L(0.05, 0.12);
    f.shoulderL.rotation.x = L(-0.95, -1.3); f.elbowL.rotation.x = L(-0.75, -0.6); f.shoulderL.rotation.z = -0.5;
    f.weapon.position.set(L(0.02, 0.1), L(0.1, 0.42), L(0.36, 0.36)); f.weapon.rotation.x = L(0.75, -0.02); f.weapon.rotation.z = L(-0.15, 0);
  }
  function poseStatic(f, aiming) { armPose(f, aiming ? 1 : 0); }
  root.Figure = { build, makeWeapon, faceFor, poseStatic, armPose, HEADGEAR, geo };
})(window.OT = window.OT || {});
