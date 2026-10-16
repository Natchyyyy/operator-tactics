// Construction du personnage 3D (partagée entre la bataille, les portraits du QG, l'écran titre et les écrans de fin).
// Version 2 : proportions réalistes (≈ 1,80 m), formes arrondies (capsules, tours), équipement détaillé (porte-plaques,
// porte-chargeurs, ceinturon, genouillères, gants, casque à rails), arme détaillée (rail, viseur, poignée), et des BRAS EN
// CINÉMATIQUE INVERSE : les mains se posent toujours sur l'arme (poignée et garde-main), quelle que soit la pose.
// Figure.build(opts) → { group, pose, hips, hipsY, legs, torso, headG, shoulderR, elbowR, shoulderL, elbowL, weapon, arms }
// opts : { id, weapon, uniform, vest, teamColor, headgear, face, scale }
(function (root) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const cap = (r, len, rs = 10) => new THREE.CapsuleGeometry(r, len, 4, rs);
  // Lathe : profil (rayon, hauteur) tourné autour de Y — torse, bassin, casque
  const lathe = (pts, seg = 18) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (rt, rb, h, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s);
  const sph = (r, ws = 12, hs = 10, ...a) => new THREE.SphereGeometry(r, ws, hs, ...a);

  // ---- dimensions (m) -----------------------------------------------------------------------------------------------
  const HIPS_Y = 0.95, THIGH = 0.43, SHIN = 0.43, UPPER = 0.30, FORE = 0.29;
  const SHOULDER = { x: 0.205, y: 0.47, z: 0.0 };          // dans le repère du torse (origine = bassin)

  const geo = {
    thigh: cap(0.075, THIGH - 0.12, 10), shin: cap(0.062, SHIN - 0.1, 10),
    kneePad: box(0.1, 0.11, 0.05), boot: box(0.12, 0.12, 0.27), sole: box(0.13, 0.03, 0.29), bootTop: cyl(0.065, 0.07, 0.1, 10),
    cargo: box(0.05, 0.13, 0.11),
    pelvis: lathe([[0.001, -0.08], [0.15, -0.07], [0.165, 0.0], [0.155, 0.08], [0.001, 0.09]]),
    torso: lathe([[0.001, 0.06], [0.15, 0.07], [0.155, 0.18], [0.175, 0.32], [0.18, 0.42], [0.15, 0.5], [0.07, 0.56], [0.001, 0.57]], 20),
    belt: cyl(0.172, 0.172, 0.055, 20), beltPouch: box(0.07, 0.08, 0.05),
    plate: box(0.29, 0.31, 0.045), cummer: cyl(0.19, 0.19, 0.16, 20, 1, true), strap: box(0.05, 0.03, 0.27),
    magPouch: box(0.07, 0.11, 0.055), admin: box(0.16, 0.08, 0.035), radio: box(0.07, 0.14, 0.05), antenna: cyl(0.004, 0.004, 0.32, 4),
    pack: box(0.25, 0.3, 0.12), packTop: cyl(0.06, 0.06, 0.25, 8),
    delt: sph(0.07, 10, 8), upper: cap(0.055, UPPER - 0.1, 8), fore: cap(0.048, FORE - 0.09, 8), glove: box(0.065, 0.09, 0.045), cuff: cyl(0.052, 0.052, 0.05, 8),
    neck: cap(0.05, 0.05, 8), head: sph(0.105, 16, 14), jaw: sph(0.085, 12, 8, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.45),
    nose: box(0.024, 0.04, 0.03), ear: sph(0.022, 8, 6), eye: sph(0.013, 6, 6), brow: box(0.04, 0.01, 0.015), mouth: box(0.04, 0.008, 0.008),
    beard: sph(0.1, 12, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.4),
    // casque « haute coupe » : coque + rebord, rails latéraux, platine de vision nocturne, coquilles auditives
    helmet: lathe([[0.14, -0.03], [0.142, 0.0], [0.135, 0.045], [0.11, 0.095], [0.06, 0.125], [0.001, 0.13]], 20),   // profil du bas vers le haut : faces vers l'extérieur
    helmetRail: box(0.012, 0.03, 0.12), nvgMount: box(0.05, 0.04, 0.02), earCup: cyl(0.045, 0.045, 0.04, 12),
    beret: sph(0.13, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.4), beretBand: new THREE.TorusGeometry(0.115, 0.014, 6, 20),
    capC: cyl(0.12, 0.124, 0.09, 16), capVisor: box(0.14, 0.015, 0.09),
    beanie: sph(0.122, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), boonie: cyl(0.19, 0.21, 0.015, 20), boonieTop: cyl(0.11, 0.115, 0.1, 16),
    goggles: box(0.17, 0.05, 0.05), shades: box(0.17, 0.035, 0.03), scarf: sph(0.118, 12, 8, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45),
  };
  // Armes (repère : origine au centre de la carcasse, +z = vers la bouche du canon). grip = poignée, fore = garde-main.
  const W = {
    rifle:   { body: [0.05, 0.075, 0.42], barrel: [0.011, 0.22], mag: [0.03, 0.15, 0.06, 0.25], stock: [0.045, 0.09, 0.22], rail: 0.36, optic: 'red', fore: 0.17, grip: -0.07, hand: [0.055, 0.07, 0.2] },
    battle:  { body: [0.055, 0.08, 0.48], barrel: [0.013, 0.24], mag: [0.035, 0.13, 0.07, 0.15], stock: [0.05, 0.1, 0.24], rail: 0.4, optic: 'holo', fore: 0.2, grip: -0.08, hand: [0.06, 0.075, 0.24] },
    lmg:     { body: [0.065, 0.1, 0.5], barrel: [0.015, 0.34], mag: [0.12, 0.13, 0.13, 0], stock: [0.05, 0.1, 0.24], rail: 0.32, optic: 'holo', fore: 0.2, grip: -0.07, hand: [0.07, 0.08, 0.2], bipod: true },
    dmr:     { body: [0.048, 0.07, 0.5], barrel: [0.011, 0.36], mag: [0.03, 0.11, 0.06, 0.1], stock: [0.045, 0.1, 0.26], rail: 0.42, optic: 'scope', fore: 0.2, grip: -0.08, hand: [0.055, 0.065, 0.26] },
    smg:     { body: [0.05, 0.075, 0.3], barrel: [0.011, 0.08], mag: [0.028, 0.17, 0.045, 0.15], stock: [0.03, 0.06, 0.17], rail: 0.22, optic: 'red', fore: 0.1, grip: -0.06, hand: [0.05, 0.06, 0.1] },
    smgsil:  { body: [0.05, 0.075, 0.3], barrel: [0.028, 0.2], mag: [0.028, 0.17, 0.045, 0.15], stock: [0.03, 0.06, 0.17], rail: 0.22, optic: 'red', fore: 0.1, grip: -0.06, hand: [0.05, 0.06, 0.1], suppressor: true },
    shotgun: { body: [0.05, 0.075, 0.4], barrel: [0.014, 0.3], mag: [0.026, 0.026, 0.3, 0], stock: [0.045, 0.1, 0.24], rail: 0.16, optic: 'red', fore: 0.24, grip: -0.07, hand: [0.06, 0.06, 0.16], tube: true },
  };
  const SKINS = [0xf1d2b6, 0xd9a97f, 0xc9a27e, 0xa9734f, 0x8b5a3a, 0x5e3b25];
  const std = (color, roughness = 0.85, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const mats = {
    gun: std(0x1b1d21, 0.45, 0.55), gunDark: std(0x2a2d31, 0.6, 0.4), polymer: std(0x23262a, 0.75, 0.1), lens: std(0x2d5f7f, 0.12, 0.8), red: new THREE.MeshBasicMaterial({ color: 0xff3a2a }),
    boot: std(0x241e18, 0.9), sole: std(0x111111, 0.95), glove: std(0x1f2124, 0.8), black: std(0x151618, 0.7), tan: std(0x8a7a5a, 0.9),
    goggles: std(0x0d0f12, 0.3, 0.5), eye: std(0x101010, 0.4), lip: std(0x6a3a30, 0.8),
    hair: [std(0x2a1d14, 1), std(0x4a3524, 1), std(0x111111, 1), std(0x8a6a40, 1)],
    beretRed: std(0x7a1f1f, 0.9), beretGreen: std(0x2f4a2f, 0.9), beretBlue: std(0x24324e, 0.9),
    scarfRed: std(0x8a2a2a, 1), scarfGreen: std(0x3a4a30, 1), scarfBlue: std(0x2a3a5a, 1),
    skins: SKINS.map(c => std(c, 0.75)),
  };
  for (const k in mats) if (mats[k] && mats[k].isMaterial) mats[k].__shared = true;
  const shade = (hex, k) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return c; };

  // ---- couvre-chefs ----------------------------------------------------------------------------------------------------
  const helmetShell = (h, m) => {
    const a = new THREE.Mesh(geo.helmet, m); a.position.set(0, 0.02, -0.005); a.scale.set(1, 1, 1.08); h.add(a);
    for (const s of [-1, 1]) { const r = new THREE.Mesh(geo.helmetRail, mats.polymer); r.position.set(s * 0.138, 0.0, 0.0); h.add(r); const e = new THREE.Mesh(geo.earCup, mats.polymer); e.rotation.z = Math.PI / 2; e.position.set(s * 0.115, -0.05, 0.0); h.add(e); }
    const n = new THREE.Mesh(geo.nvgMount, mats.polymer); n.position.set(0, 0.075, 0.135); n.rotation.x = -0.4; h.add(n);
  };
  const beret = (mat) => (h) => { const b = new THREE.Mesh(geo.beret, mat); b.position.set(0.02, 0.045, -0.01); b.rotation.z = -0.25; h.add(b); const r = new THREE.Mesh(geo.beretBand, mat); r.rotation.x = Math.PI / 2; r.position.y = 0.035; h.add(r); };
  const HEADGEAR = {
    casque:  { name: 'Casque', price: 0, build: (h, m) => helmetShell(h, m) },
    casque_lunettes: { name: 'Casque + lunettes', price: 0, build: (h, m) => { helmetShell(h, m); const g = new THREE.Mesh(geo.goggles, mats.goggles); g.position.set(0, 0.075, 0.1); h.add(g); } },
    beret_rouge: { name: 'Béret rouge', price: 90, build: beret(mats.beretRed) },
    beret_vert: { name: 'Béret vert', price: 90, build: beret(mats.beretGreen) },
    beret_bleu: { name: 'Béret bleu', price: 90, build: beret(mats.beretBlue) },
    casquette: { name: 'Casquette', price: 60, build: (h, m) => { const c = new THREE.Mesh(geo.capC, m); c.position.y = 0.065; h.add(c); const v = new THREE.Mesh(geo.capVisor, m); v.position.set(0, 0.03, 0.15); v.rotation.x = 0.12; h.add(v); } },
    bonnet: { name: 'Bonnet', price: 60, build: (h) => { const b = new THREE.Mesh(geo.beanie, mats.hair[2]); b.position.y = 0.03; h.add(b); } },
    chapeau: { name: 'Chapeau de brousse', price: 110, build: (h, m) => { const b = new THREE.Mesh(geo.boonie, m); b.position.y = 0.055; h.add(b); const t = new THREE.Mesh(geo.boonieTop, m); t.position.y = 0.1; h.add(t); } },
    lunettes_soleil: { name: 'Lunettes de soleil', price: 70, build: (h, m) => { helmetShell(h, m); const g = new THREE.Mesh(geo.shades, mats.lens); g.position.set(0, 0.018, 0.104); h.add(g); } },
    foulard: { name: 'Foulard', price: 80, build: (h, m) => { helmetShell(h, m); const s = new THREE.Mesh(geo.scarf, mats.scarfGreen); s.position.set(0, -0.015, 0.012); s.scale.set(1.08, 1, 1.1); h.add(s); } },
    foulard_rouge: { name: 'Foulard rouge', price: 80, build: (h, m) => { helmetShell(h, m); const s = new THREE.Mesh(geo.scarf, mats.scarfRed); s.position.set(0, -0.015, 0.012); s.scale.set(1.08, 1, 1.1); h.add(s); } },
    nu: { name: 'Tête nue', price: 40, build: (h, m, face) => { const hair = new THREE.Mesh(sph(0.11, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), mats.hair[face.hair]); hair.position.y = 0.012; hair.scale.set(1.02, 1, 1.06); h.add(hair); } },
  };
  // Visage déterministe par opérateur (teint, sourcils, barbe, cheveux) à partir d'un identifiant
  function faceFor(id) {
    let h = 2166136261; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
    const r = (n) => { h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return h % n; };
    return { skin: r(SKINS.length), hair: r(mats.hair.length), beard: r(3) === 0, browUp: r(2) === 1, eyeGap: 0.034 + r(3) * 0.004, jaw: 0.95 + r(3) * 0.05 };
  }

  // ---- arme ------------------------------------------------------------------------------------------------------------
  function makeWeapon(id) {
    const d = W[id] || W.rifle; const w = new THREE.Group();
    const [bw, bh, bd] = d.body;
    const body = new THREE.Mesh(box(bw, bh, bd), mats.gun); w.add(body);
    const hand = new THREE.Mesh(box(...d.hand), mats.polymer); hand.position.set(0, -0.004, bd / 2 + d.hand[2] / 2 - 0.02); w.add(hand);
    const barrel = new THREE.Mesh(cyl(d.barrel[0], d.barrel[0], d.barrel[1], 8), d.suppressor ? mats.black : mats.gunDark); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.012, bd / 2 + d.hand[2] - 0.02 + d.barrel[1] / 2); w.add(barrel);
    const muzzleZ = bd / 2 + d.hand[2] - 0.02 + d.barrel[1];
    if (d.tube) { const t = new THREE.Mesh(cyl(0.016, 0.016, 0.34, 8), mats.gunDark); t.rotation.x = Math.PI / 2; t.position.set(0, -0.028, bd / 2 + 0.12); w.add(t); }
    else { const [mw, mh, md, tilt] = d.mag; const mag = new THREE.Mesh(box(mw, mh, md), mats.polymer); mag.position.set(0, -bh / 2 - mh / 2 + 0.03, 0.06); mag.rotation.x = tilt; w.add(mag); }
    const [sw, sh, sd] = d.stock; const stock = new THREE.Mesh(box(sw, sh, sd), mats.polymer); stock.position.set(0, -0.012, -bd / 2 - sd / 2 + 0.01); w.add(stock);
    const pad = new THREE.Mesh(box(sw + 0.006, sh + 0.01, 0.02), mats.black); pad.position.set(0, -0.012, -bd / 2 - sd + 0.005); w.add(pad);
    const grip = new THREE.Mesh(box(0.032, 0.1, 0.045), mats.polymer); grip.position.set(0, -bh / 2 - 0.04, d.grip); grip.rotation.x = 0.3; w.add(grip);
    const rail = new THREE.Mesh(box(0.024, 0.012, d.rail), mats.gunDark); rail.position.set(0, bh / 2 + 0.006, 0.02); w.add(rail);
    if (d.optic === 'scope') { const s = new THREE.Mesh(cyl(0.022, 0.022, 0.26, 10), mats.gun); s.rotation.x = Math.PI / 2; s.position.set(0, bh / 2 + 0.045, 0.0); w.add(s); for (const z of [-0.13, 0.13]) { const b = new THREE.Mesh(cyl(0.028, 0.028, 0.04, 10), mats.gun); b.rotation.x = Math.PI / 2; b.position.set(0, bh / 2 + 0.045, z); w.add(b); const l = new THREE.Mesh(sph(0.021, 8, 6), mats.lens); l.position.set(0, bh / 2 + 0.045, z * 1.15); w.add(l); } }
    else if (d.optic === 'holo') { const o = new THREE.Mesh(box(0.045, 0.045, 0.09), mats.gun); o.position.set(0, bh / 2 + 0.035, -0.02); w.add(o); const g = new THREE.Mesh(box(0.035, 0.03, 0.005), mats.lens); g.position.set(0, bh / 2 + 0.04, 0.026); w.add(g); }
    else { const o = new THREE.Mesh(cyl(0.017, 0.017, 0.06, 10), mats.gun); o.rotation.x = Math.PI / 2; o.position.set(0, bh / 2 + 0.03, -0.03); w.add(o); const dot = new THREE.Mesh(sph(0.004, 4, 4), mats.red); dot.position.set(0, bh / 2 + 0.03, 0.0); w.add(dot); }
    if (d.bipod) for (const s of [-1, 1]) { const l = new THREE.Mesh(cyl(0.006, 0.006, 0.2, 4), mats.gunDark); l.position.set(s * 0.025, -0.07, muzzleZ - 0.1); l.rotation.x = 0.25; l.rotation.z = s * 0.15; w.add(l); }
    w.muzzle = V(0, 0.012, muzzleZ);
    w.gripPt = V(0, -bh / 2 - 0.06, d.grip - 0.012);            // main droite (poignée)
    w.forePt = V(0, -0.045, bd / 2 + d.fore - 0.02);           // main gauche (garde-main ou pompe)
    w.magPt = V(0, -bh / 2 - 0.06, 0.06);                       // main gauche au puits de chargeur (rechargement)
    w.stockZ = -bd / 2 - sd;                                    // talon de crosse
    w.sightY = bh / 2 + (d.optic === 'scope' ? 0.045 : 0.035);  // hauteur de visée au-dessus de l'axe
    return w;
  }

  // ---- personnage ------------------------------------------------------------------------------------------------------
  function build(o) {
    const matU = std(o.uniform, 0.95);
    const matU2 = new THREE.MeshStandardMaterial({ color: shade(o.uniform, 0.82), roughness: 0.95 });     // poches, genouillères : un ton plus sombre
    const matV = std(o.vest, 0.88);
    const matV2 = new THREE.MeshStandardMaterial({ color: shade(o.vest, 1.18), roughness: 0.9 });
    const matHelmet = std(o.vest, 0.6);
    const matMark = new THREE.MeshBasicMaterial({ color: o.teamColor === undefined ? 0xffffff : o.teamColor });
    const face = o.face || faceFor(o.id || 'x'); const skin = mats.skins[face.skin];
    const group = new THREE.Group();
    const pose = new THREE.Group(); group.add(pose);
    const hips = new THREE.Group(); hips.position.y = HIPS_Y; pose.add(hips);
    const pelvis = new THREE.Mesh(geo.pelvis, matU); pelvis.scale.set(1.08, 1, 0.78); hips.add(pelvis);
    // jambes
    const legs = [];
    for (const side of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(side * 0.095, -0.03, 0); hips.add(leg);
      const thigh = new THREE.Mesh(geo.thigh, matU); thigh.position.y = -THIGH / 2; leg.add(thigh);
      const cargo = new THREE.Mesh(geo.cargo, matU2); cargo.position.set(side * 0.07, -THIGH * 0.55, 0.0); leg.add(cargo);
      const knee = new THREE.Group(); knee.position.y = -THIGH; leg.add(knee);
      const pad = new THREE.Mesh(geo.kneePad, mats.black); pad.position.set(0, -0.02, 0.065); knee.add(pad);
      const shin = new THREE.Mesh(geo.shin, matU); shin.position.y = -SHIN / 2; knee.add(shin);
      const bt = new THREE.Mesh(geo.bootTop, mats.boot); bt.position.y = -SHIN + 0.09; knee.add(bt);
      const boot = new THREE.Mesh(geo.boot, mats.boot); boot.position.set(0, -SHIN + 0.0, 0.045); knee.add(boot);
      const sole = new THREE.Mesh(geo.sole, mats.sole); sole.position.set(0, -SHIN - 0.065, 0.045); knee.add(sole);
      legs.push({ leg, knee });
    }
    // torse, équipement
    const torso = new THREE.Group(); hips.add(torso);
    const chest = new THREE.Mesh(geo.torso, matU); chest.scale.set(1.1, 1, 0.7); torso.add(chest);
    const belt = new THREE.Mesh(geo.belt, mats.black); belt.scale.set(1.05, 1, 0.78); belt.position.y = 0.08; torso.add(belt);
    for (const [x, z] of [[-0.12, 0.1], [0.13, 0.08], [-0.17, -0.02], [0.17, -0.03]]) { const p = new THREE.Mesh(geo.beltPouch, matV); p.position.set(x, 0.07, z); p.rotation.y = Math.atan2(x, z * 2); torso.add(p); }
    const cum = new THREE.Mesh(geo.cummer, matV); cum.scale.set(1.0, 1, 0.74); cum.position.y = 0.27; torso.add(cum);
    const front = new THREE.Mesh(geo.plate, matV); front.position.set(0, 0.32, 0.125); torso.add(front);
    const back = new THREE.Mesh(geo.plate, matV); back.position.set(0, 0.33, -0.125); torso.add(back);
    for (const s of [-1, 1]) { const st = new THREE.Mesh(geo.strap, matV); st.position.set(s * 0.1, 0.475, 0.0); torso.add(st); }
    for (const x of [-0.08, 0, 0.08]) { const p = new THREE.Mesh(geo.magPouch, matV2); p.position.set(x, 0.25, 0.168); torso.add(p); }
    const adm = new THREE.Mesh(geo.admin, matV2); adm.position.set(0, 0.39, 0.155); torso.add(adm);
    const pack = new THREE.Mesh(geo.pack, matV2); pack.position.set(0, 0.33, -0.21); torso.add(pack);
    const radio = new THREE.Mesh(geo.radio, mats.polymer); radio.position.set(-0.11, 0.42, -0.2); torso.add(radio);
    const ant = new THREE.Mesh(geo.antenna, mats.black); ant.position.set(-0.13, 0.62, -0.2); ant.rotation.z = 0.12; torso.add(ant);
    // tête
    const neck = new THREE.Mesh(geo.neck, skin); neck.position.y = 0.58; torso.add(neck);
    const headG = new THREE.Group(); headG.position.y = 0.7; torso.add(headG);
    const head = new THREE.Mesh(geo.head, skin); head.scale.set(0.95, 1.08, 1.0); headG.add(head);
    const jaw = new THREE.Mesh(geo.jaw, skin); jaw.position.set(0, -0.025, 0.012); jaw.scale.set(face.jaw, 1.05, 1.05); headG.add(jaw);
    const nose = new THREE.Mesh(geo.nose, skin); nose.position.set(0, -0.005, 0.105); nose.rotation.x = -0.2; headG.add(nose);
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(geo.ear, skin); ear.position.set(sx * 0.1, 0.0, -0.005); ear.scale.set(0.5, 1, 0.8); headG.add(ear);
      const e = new THREE.Mesh(geo.eye, mats.eye); e.position.set(sx * face.eyeGap, 0.022, 0.093); headG.add(e);
      const b = new THREE.Mesh(geo.brow, mats.hair[face.hair]); b.position.set(sx * face.eyeGap, 0.047 + (face.browUp ? 0.006 : 0), 0.094); b.rotation.z = sx * (face.browUp ? -0.2 : 0.12); headG.add(b);
    }
    const mouth = new THREE.Mesh(geo.mouth, mats.lip); mouth.position.set(0, -0.045, 0.098); headG.add(mouth);
    if (face.beard) { const bd = new THREE.Mesh(geo.beard, mats.hair[face.hair]); bd.position.set(0, -0.02, 0.022); bd.scale.set(0.98, 1, 1.06); headG.add(bd); }
    const hg = HEADGEAR[o.headgear] || HEADGEAR.casque; hg.build(headG, matHelmet, face);
    // bras : épaule (deltoïde) → bras → coude → avant-bras → gant ; orientés par cinématique inverse (solveArm)
    const arms = {};
    for (const [key, s] of [['R', 1], ['L', -1]]) {
      const shoulder = new THREE.Group(); shoulder.position.set(s * SHOULDER.x, SHOULDER.y, SHOULDER.z); torso.add(shoulder);
      const delt = new THREE.Mesh(geo.delt, matU); delt.scale.set(1, 1.1, 1); shoulder.add(delt);
      const upper = new THREE.Mesh(geo.upper, matU); upper.position.y = -UPPER / 2; shoulder.add(upper);
      if (o.teamColor !== undefined) { const band = new THREE.Mesh(cyl(0.061, 0.061, 0.045, 10), matMark); band.position.y = -0.1; shoulder.add(band); }
      const elbow = new THREE.Group(); elbow.position.y = -UPPER; shoulder.add(elbow);
      const fore = new THREE.Mesh(geo.fore, matU); fore.position.y = -FORE / 2; elbow.add(fore);
      const cuff = new THREE.Mesh(geo.cuff, mats.glove); cuff.position.y = -FORE + 0.03; elbow.add(cuff);
      const glove = new THREE.Mesh(geo.glove, mats.glove); glove.position.y = -FORE - 0.035; elbow.add(glove);
      arms[key] = { shoulder, elbow, side: s };
    }
    const weapon = makeWeapon(o.weapon); torso.add(weapon);
    pose.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    if (o.scale) group.scale.setScalar(o.scale);
    const f = { group, pose, hips, hipsY: HIPS_Y, legs, torso, headG, weapon, arms,
      shoulderR: arms.R.shoulder, elbowR: arms.R.elbow, shoulderL: arms.L.shoulder, elbowL: arms.L.elbow };
    armPose(f, 0);
    return f;
  }

  // ---- cinématique inverse à deux segments ---------------------------------------------------------------------------
  // Place la main de l'arm « key » au point target (repère du torse), coude orienté vers pole (repère du torse).
  const _a = V(0, 0, 0), _b = V(0, 0, 0), _e = V(0, 0, 0), _q = new THREE.Quaternion(), _down = V(0, -1, 0);
  function solveArm(f, key, target, pole) {
    const arm = f.arms[key], S = arm.shoulder.position, L1 = UPPER, L2 = FORE + 0.035;
    _a.copy(target).sub(S); let d = _a.length(); const dir = _a.clone().normalize();
    d = Math.max(Math.abs(L1 - L2) + 0.01, Math.min(L1 + L2 - 0.001, d));
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const p = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))); if (p.lengthSq() < 1e-6) p.set(0, -1, 0); p.normalize();
    _e.copy(dir).multiplyScalar(a).addScaledVector(p, h);                     // coude, relatif à l'épaule
    arm.shoulder.quaternion.setFromUnitVectors(_down, _b.copy(_e).normalize());
    // avant-bras : direction coude → main, exprimée dans le repère de l'épaule
    const fore = dir.clone().multiplyScalar(d).sub(_e).normalize();
    _q.copy(arm.shoulder.quaternion).invert(); fore.applyQuaternion(_q);
    arm.elbow.quaternion.setFromUnitVectors(_down, fore);
  }
  const weaponPt = (w, local) => local.clone().applyQuaternion(w.quaternion).add(w.position);   // point de l'arme → repère du torse

  // Pose des bras et de l'arme ; aim ∈ [0,1] : 0 = arme basse (canon vers le sol, devant soi), 1 = épaulée (crosse à l'épaule,
  // organes de visée à hauteur de l'œil). extra : { recoil, reload, throwT, blind } (0..1), pour les animations de bataille.
  function armPose(f, aim, extra) {
    const x = extra || {}, w = f.weapon, L = (a, b) => a + (b - a) * aim;
    // arme : à l'épaule, la crosse vient au creux de l'épaule droite et la ligne de visée passe devant l'œil
    const shoulderedZ = -w.stockZ - 0.02 + 0.06, sightY = 0.665 - w.sightY;
    w.position.set(L(0.06, 0.085), L(0.27, sightY), L(0.28, shoulderedZ) - (x.recoil || 0) * 0.05);
    w.rotation.set(L(0.62, 0) - (x.recoil || 0) * 0.08 + (x.reload || 0) * 0.55, L(-0.12, -0.03), L(-0.2, 0) + (x.reload || 0) * 0.45);
    if (x.throwT) { const k = x.throwT; w.position.y -= 0.12 * Math.min(1, k * 3); w.rotation.x += 0.6 * Math.min(1, k * 3); }
    // main droite : poignée (ou, pendant le lancer, armée en arrière puis projetée)
    if (x.throwT > 0) {
      const k = x.throwT, wind = k < 0.6 ? k / 0.6 : 0, fwd = k < 0.6 ? 0 : (k - 0.6) / 0.4;
      solveArm(f, 'R', V(0.22 - 0.05 * fwd, 0.55 + 0.25 * wind + 0.05 * fwd, -0.18 * wind + 0.45 * fwd), V(0.6, -0.4, -0.4));
    } else solveArm(f, 'R', weaponPt(w, w.gripPt), V(0.9, -0.5, -0.25));
    // main gauche : garde-main, ou puits de chargeur (rechargement), ou devant les yeux (aveuglé)
    if (x.blind) solveArm(f, 'L', V(-0.02, 0.69, 0.16), V(-0.8, -0.5, 0));
    else {
      const fore = weaponPt(w, w.forePt), mag = weaponPt(w, w.magPt), r = x.reload || 0;
      solveArm(f, 'L', fore.lerp(mag, r), V(-0.7, -0.7, 0.1));
    }
  }
  function poseStatic(f, aiming) { armPose(f, aiming ? 1 : 0); }
  root.Figure = { build, makeWeapon, faceFor, poseStatic, armPose, solveArm, HEADGEAR, geo, HIPS_Y };
})(window.OT = window.OT || {});
