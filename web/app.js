// OPERATOR TACTICS — rendu 3D (three.js) et interface d'observation. La simulation vit dans sim/*.js ; ici on ne fait
// qu'afficher son état et ses événements. Mode manuel : ?manual=1 puis window.API.step(n, dt).
(function () {
  const OT = window.OT;
  const { Battle, DATA, DT, fmtT } = OT;
  const params = new URLSearchParams(location.search);
  const MANUAL = params.get('manual') === '1';
  if (MANUAL) document.documentElement.classList.add('manual');   // captures reproductibles : pas de transitions CSS (aucune image n'est dessinée entre deux étapes)

  const STATE_FR = { throw: 'Lance une grenade', evade: 'Esquive une grenade', capture: 'Tient la zone', tozone: 'Vers la zone', idle: 'En attente', advancing: 'Progresse', bounding: 'Bond', pause: 'Observe', tocover: 'Vers un couvert', engage: 'Au contact', closing: 'Se rapproche', pinned: 'Cloué au sol', hold: 'Tient', wait: 'Attend', fallback: 'Recule', reposition: 'Change de poste', overwatch: 'Surveille', retreat: 'Se replie', search: 'Ratisse', noammo: 'Sans munitions', hide: 'Se cache' };
  const STATUS_FR = { ok: 'Indemne', wounded: 'Blessé', critical: 'Grave', down: 'Neutralisé' };
  const TEAM = [
    { name: 'Alpha', color: 0x4f9cf0, css: '#4f9cf0', uniform: 0x3a4a3c, vest: 0x2b352d },
    { name: 'Bravo', color: 0xe85a4f, css: '#e85a4f', uniform: 0x6b5a3e, vest: 0x4e4230 },
  ];
  const TACTIC_ICON = { fumigene: '💨', reco: '📡', soins: '✚', barrage: '💥', drill: '🛡', blitz: '⚡', retranche: '🧱', discipline: '🎯', frappe: '✈', tete: '☠', camouflage: '🌿', triage: '⛑' };
  const tacIcon = (id) => (OT.imgTag && OT.imgTag('tac_' + id, 'timg')) || TACTIC_ICON[id] || '◆';      // icône dessinée si disponible
  const roleImg = (role) => (OT.imgTag && OT.imgTag('role_' + role, 'rimg')) || '';
  const $ = (s) => document.querySelector(s);

  // ---------------------------------------------------------------------------------------------
  // Scène
  // ---------------------------------------------------------------------------------------------
  const canvas = $('#scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e1114);
  scene.fog = new THREE.Fog(0x1a2028, 110, 200);
  (function sky() {
    const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, '#0c1016'); grd.addColorStop(0.45, '#1d2733'); grd.addColorStop(0.62, '#4b4a4e'); grd.addColorStop(0.7, '#8a6a4a'); grd.addColorStop(1, '#2a2622');
    g.fillStyle = grd; g.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }));
    dome.position.set(32, -40, 20); scene.add(dome); scene.userData.dome = dome;
  })();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 400);

  // caméra orbitale maison (glisser : tourner ; molette : zoom ; clic droit / Maj : déplacer)
  // Trois modes : « follow » (derrière un soldat, choisi ou automatique), « sat » (vue d'ensemble), « free » (orbite libre)
  const cam = { mode: 'director', shot: null, target: new THREE.Vector3(32, 0, 20), yaw: Math.PI / 2 + 0.28, pitch: 0.95, dist: 60, follow: null, autoFollow: null, autoUntil: 0, pos: new THREE.Vector3(), look: new THREE.Vector3(), init: false };
  function pickAutoFollow() {
    if (!battle) return null;
    // le soldat le plus « engagé » : vient de tirer ou d'être pris pour cible ; priorité à l'équipe du joueur
    let best = null, bs = -Infinity;
    for (const u of battle.units) {
      if (!u.alive) continue;
      let sc = (u.team === 0 ? 2 : 0) + (battle.t - u.lastShotAt < 3 ? 6 : 0) + (battle.t - u.lastShotByAt < 3 ? 5 : 0) + (u.target ? 3 : 0) + (u.moving ? 1 : 0) + (u.id === cam.autoFollow ? 2.5 : 0);
      if (sc > bs) { bs = sc; best = u; }
    }
    return best ? best.id : null;
  }
  // ---- Réalisateur : enchaîne des plans comme une retransmission (épaule d'un tireur, vue d'ensemble de l'échange,
  // plan rapproché sur un événement — explosion, neutralisation —, suivi de l'escouade pendant la progression). --------
  const DIRECTOR = { eventShot: null };
  function directorEvent(kind, x, z) {   // appelée sur une explosion ou une neutralisation : coupe vers l'événement
    if (cam.mode !== 'director') return;
    if (DIRECTOR.eventShot && simTime < DIRECTOR.eventShot.until - 1) return;   // on ne coupe pas un plan d'événement trop tôt
    DIRECTOR.eventShot = { kind, x, z, until: simTime + 2.6, yaw: Math.random() * Math.PI * 2 };
    cam.shot = null;
  }
  function engagedUnits() { return battle.units.filter(u => u.alive && (battle.t - u.lastShotAt < 2.5 || battle.t - u.lastShotByAt < 2.5)); }
  function pickShot() {
    const eng = engagedUnits();
    const shooters = eng.filter(u => u.target && u.visible.has(u.target.id));
    const r = Math.random();
    if (shooters.length && r < 0.5) {   // épaule d'un tireur (de préférence de notre équipe)
      const own = shooters.filter(u => u.team === 0), pick = (own.length && Math.random() < 0.7 ? own : shooters)[Math.floor(Math.random() * (own.length && Math.random() < 0.7 ? own.length : shooters.length))];
      return { kind: 'shoulder', id: (pick || shooters[0]).id, until: simTime + 4 + Math.random() * 2 };
    }
    if (eng.length >= 2) return { kind: 'overview', until: simTime + 5 + Math.random() * 2, yaw: (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.6) };
    // progression : suivi en hauteur de notre escouade, ou épaule d'un éclaireur
    const own = battle.teams[0].units.filter(u => u.alive);
    if (own.length && r < 0.75) return { kind: 'squad', until: simTime + 6, yaw: 0.35 + Math.random() * 0.5 };
    const lead = own.slice().sort((a, b) => b.x * (battle.map.spawns[1].x > battle.map.spawns[0].x ? 1 : -1) - a.x * (battle.map.spawns[1].x > battle.map.spawns[0].x ? 1 : -1))[0];
    return lead ? { kind: 'shoulder', id: lead.id, until: simTime + 5 } : { kind: 'squad', until: simTime + 5, yaw: 0.5 };
  }
  function centroid(list) { const n = list.length || 1; return { x: list.reduce((s, u) => s + u.x, 0) / n, z: list.reduce((s, u) => s + u.z, 0) / n }; }
  function placeCam(want, look, k) {
    if (!cam.init || k >= 1) { cam.pos.copy(want); cam.look.copy(look); cam.init = true; }
    else { cam.pos.lerp(want, k); cam.look.lerp(look, k * 1.4); }
    camera.position.copy(cam.pos); camera.lookAt(cam.look);
  }
  function directorCamera() {
    const ev = DIRECTOR.eventShot;
    if (ev && simTime < ev.until) {   // plan d'événement : en hauteur, tourne lentement autour du point
      const a = ev.yaw + (simTime - (ev.until - 2.6)) * 0.25, d = 11;
      placeCam(new THREE.Vector3(ev.x + Math.cos(a) * d, 7, ev.z + Math.sin(a) * d), new THREE.Vector3(ev.x, 0.8, ev.z), cam.shot === 'ev' ? 0.12 : 1);
      cam.shot = 'ev'; cam.target.set(ev.x, 0, ev.z); return;
    }
    DIRECTOR.eventShot = null;
    let s = cam.shot && typeof cam.shot === 'object' ? cam.shot : null;
    const fresh = !s || simTime > s.until || (s.kind === 'shoulder' && (!unitById[s.id] || !unitById[s.id].alive));
    if (fresh) { s = pickShot(); cam.shot = s; cam.cutAt = simTime; }
    const k = simTime - (cam.cutAt || 0) < 0.05 ? 1 : 0.08;   // coupe franche au changement de plan, puis suivi doux
    if (s.kind === 'shoulder') {
      const m = meshes[s.id]; if (!m) { cam.shot = null; return; }
      const yaw = m.group.rotation.y, fx = Math.cos(-(yaw - Math.PI / 2)), fz = Math.sin(-(yaw - Math.PI / 2)), px = m.group.position.x, pz = m.group.position.z;
      // un peu à droite de l'épaule, au-dessus, regard loin devant
      const rx = -fz * 0.9, rz = fx * 0.9;
      placeCam(new THREE.Vector3(px - fx * 3.4 + rx, 2.3, pz - fz * 3.4 + rz), new THREE.Vector3(px + fx * 9, 1.2, pz + fz * 9), k);
      cam.target.set(px, 0, pz); return;
    }
    const list = s.kind === 'overview' ? engagedUnits() : battle.teams[0].units.filter(u => u.alive);
    if (!list.length) { cam.shot = null; return; }
    const c = centroid(list); let spread = 0; for (const u of list) spread = Math.max(spread, Math.hypot(u.x - c.x, u.z - c.z));
    const d = Math.max(12, Math.min(34, spread * 1.6 + 8)), h = s.kind === 'overview' ? d * 0.75 : d * 0.6;
    const toEnemy = Math.sign(battle.map.spawns[1].x - battle.map.spawns[0].x) || 1;   // on regarde vers l'adversaire
    const a = Math.PI + (toEnemy > 0 ? 0 : Math.PI) + s.yaw;
    placeCam(new THREE.Vector3(c.x + Math.cos(a) * d, h, c.z + Math.sin(a) * d), new THREE.Vector3(c.x + toEnemy * 3, 0.5, c.z), k);
    cam.target.set(c.x, 0, c.z);
  }
  function applyCamera() {
    if (cam.mode === 'director') { directorCamera(); return; }
    if (cam.mode === 'follow') {
      let id = cam.follow;
      if (!id || !unitById[id] || !unitById[id].alive) { if (!cam.autoFollow || simTime > cam.autoUntil || !unitById[cam.autoFollow] || !unitById[cam.autoFollow].alive) { cam.autoFollow = pickAutoFollow(); cam.autoUntil = simTime + 6; } id = cam.autoFollow; }
      const m = id && meshes[id], u = id && unitById[id];
      if (m && u) {
        const yaw = m.group.rotation.y; // orientation du soldat (rotation.y = -facing + π/2)
        const fx = Math.cos(-(yaw - Math.PI / 2)), fz = Math.sin(-(yaw - Math.PI / 2));
        const px = m.group.position.x, pz = m.group.position.z;
        const want = new THREE.Vector3(px - fx * 5.2, 2.6, pz - fz * 5.2), look = new THREE.Vector3(px + fx * 7, 1.1, pz + fz * 7);
        if (!cam.init) { cam.pos.copy(want); cam.look.copy(look); cam.init = true; }
        cam.pos.lerp(want, 0.08); cam.look.lerp(look, 0.12);
        camera.position.copy(cam.pos); camera.lookAt(cam.look);
        cam.target.set(px, 0, pz);
        return;
      }
    }
    if (cam.mode === 'sat') {
      const map = battle.map; const want = new THREE.Vector3(map.width / 2, 78, map.depth / 2 + 22), look = new THREE.Vector3(map.width / 2, 0, map.depth / 2);
      if (!cam.init) { cam.pos.copy(want); cam.look.copy(look); cam.init = true; }
      cam.pos.lerp(want, 0.08); cam.look.lerp(look, 0.08); camera.position.copy(cam.pos); camera.lookAt(cam.look); return;
    }
    // libre (orbite)
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const want = new THREE.Vector3(cam.target.x + cam.dist * cp * Math.cos(cam.yaw), cam.target.y + cam.dist * sp, cam.target.z + cam.dist * cp * Math.sin(cam.yaw));
    if (!cam.init) { cam.pos.copy(want); cam.look.copy(cam.target); cam.init = true; }
    cam.pos.lerp(want, 0.2); cam.look.lerp(cam.target, 0.2);
    camera.position.copy(cam.pos); camera.lookAt(cam.look);
  }
  function setCamMode(mode) { cam.mode = mode; cam.shot = null; cam.init = false; document.querySelectorAll('[data-cam]').forEach(b => b.classList.toggle('on', b.dataset.cam === mode)); if (mode === 'free') { cam.target.set(battle.map.width / 2, 0, battle.map.depth / 2); cam.dist = 60; } }
  (function cameraControls() {
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, b: e.button, shift: e.shiftKey }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
      if (cam.mode !== 'free') { if (Math.abs(dx) + Math.abs(dy) > 3) { setCamMode('free'); cam.yaw = Math.atan2(camera.position.z - cam.target.z, camera.position.x - cam.target.x); cam.pitch = Math.max(0.15, Math.min(1.5, Math.atan2(camera.position.y, Math.hypot(camera.position.x - cam.target.x, camera.position.z - cam.target.z)))); cam.dist = camera.position.distanceTo(cam.target); } return; }
      if (drag.b === 2 || drag.shift) {
        cam.follow = null;
        const right = new THREE.Vector3(Math.cos(cam.yaw + Math.PI / 2), 0, Math.sin(cam.yaw + Math.PI / 2));
        const fwd = new THREE.Vector3(-Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
        cam.target.addScaledVector(right, dx * cam.dist * 0.0015).addScaledVector(fwd, -dy * cam.dist * 0.0015);
      } else { cam.yaw += dx * 0.005; cam.pitch = Math.max(0.15, Math.min(1.5, cam.pitch + dy * 0.005)); }
      if (MANUAL) render();
    });
    canvas.addEventListener('pointerup', () => { drag = null; });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (cam.mode !== 'free') return; cam.dist = Math.max(8, Math.min(140, cam.dist * (1 + Math.sign(e.deltaY) * 0.1))); if (MANUAL) render(); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  })();

  // lumières
  const hemi = new THREE.HemisphereLight(0xb8c8d8, 0x3a3630, 1.15); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe9c4, 2.2);
  sun.position.set(40, 60, 10); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -45; sun.shadow.camera.right = 45; sun.shadow.camera.top = 35; sun.shadow.camera.bottom = -35; sun.shadow.camera.far = 160; sun.shadow.bias = -0.0008;
  scene.add(sun); scene.add(sun.target);

  // ---- Conditions (jour, nuit, brouillard, pluie) : lumière, brouillard de distance, pluie ; effets de jeu dans engine.js ----
  const LOOK = {
    jour:       { hemi: [0xb8c8d8, 0x3a3630, 1.15], sun: [0xffe9c4, 2.2], fog: [0x1a2028, 110, 200], bg: 0x0e1114, dome: true },
    nuit:       { hemi: [0x40507a, 0x14161c, 0.42], sun: [0x8fa6ff, 0.7], fog: [0x06080d, 35, 120], bg: 0x05070b, dome: false },
    brouillard: { hemi: [0xc0c6cc, 0x4a4844, 1.0], sun: [0xe8ecf0, 0.9], fog: [0x8b9198, 22, 95], bg: 0x8b9198, dome: false },
    pluie:      { hemi: [0x9aa6b4, 0x2e3034, 0.8], sun: [0xc8d0dc, 0.9], fog: [0x3a4149, 40, 140], bg: 0x2a3036, dome: false },
  };
  let rain = null;
  function applyConditions(id) {
    const L = LOOK[id] || LOOK.jour;
    hemi.color.setHex(L.hemi[0]); hemi.groundColor.setHex(L.hemi[1]); hemi.intensity = L.hemi[2];
    sun.color.setHex(L.sun[0]); sun.intensity = L.sun[1];
    scene.fog.color.setHex(L.fog[0]); scene.fog.near = L.fog[1]; scene.fog.far = L.fog[2]; scene.background.setHex(L.bg);
    if (scene.userData.dome) scene.userData.dome.visible = L.dome;
    if (rain) { scene.remove(rain); rain.geometry.dispose(); rain.material.dispose(); rain = null; }
    if (id === 'pluie') {   // gouttes en traits (segments) qui tombent dans un volume autour de la caméra
      const N = 3500, pos = new Float32Array(N * 6);
      for (let i = 0; i < N; i++) { const x = Math.random() * 90 - 13, y = Math.random() * 30, z = Math.random() * 70 - 15; pos.set([x, y, z, x + 0.05, y + 0.7, z + 0.02], i * 6); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xa8b8c8, transparent: true, opacity: 0.35, depthWrite: false })); rain.frustumCulled = false; scene.add(rain);
    }
    $('#app').dataset.cond = id || 'jour';
  }
  function updateRain(dt) {
    if (!rain) return; const a = rain.geometry.attributes.position.array, v = 26 * dt;
    for (let i = 0; i < a.length; i += 6) { a[i + 1] -= v; a[i + 4] -= v; if (a[i + 1] < 0) { a[i + 1] += 30; a[i + 4] += 30; } }
    rain.geometry.attributes.position.needsUpdate = true;
  }

  // ---------------------------------------------------------------------------------------------
  // Construction de la carte
  // ---------------------------------------------------------------------------------------------
  let mapGroup = null;
  function groundTexture(w, d) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = Math.round(1024 * d / w); const g = c.getContext('2d');
    g.fillStyle = '#5c6063'; g.fillRect(0, 0, c.width, c.height);
    // taches de béton
    for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${20 + Math.random() * 40},${22 + Math.random() * 40},${24 + Math.random() * 40},${Math.random() * 0.25})`; const r = Math.random() * 6 + 1; g.fillRect(Math.random() * c.width, Math.random() * c.height, r, r); }
    // dalles
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
    const step = c.width / (w / 4);
    for (let x = 0; x <= c.width; x += step) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke(); }
    for (let y = 0; y <= c.height; y += step) { g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke(); }
    // marquages au sol
    g.strokeStyle = 'rgba(220,180,60,0.45)'; g.lineWidth = 6; g.setLineDash([40, 30]);
    g.beginPath(); g.moveTo(c.width * 0.2, c.height * 0.1); g.lineTo(c.width * 0.2, c.height * 0.9); g.stroke();
    g.beginPath(); g.moveTo(c.width * 0.8, c.height * 0.1); g.lineTo(c.width * 0.8, c.height * 0.9); g.stroke();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.__ground = true; return tex;
  }
  // textures procédurales (canvas) : tôle ondulée, planches, béton
  function makeTexture(w, h, draw, repeatX, repeatY) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeatX || 1, repeatY || 1); tex.anisotropy = 4; return tex;
  }
  const texCorrugated = makeTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) { const grd = g.createLinearGradient(x, 0, x + 16, 0); grd.addColorStop(0, '#bdbdbd'); grd.addColorStop(0.5, '#ffffff'); grd.addColorStop(1, '#a8a8a8'); g.fillStyle = grd; g.fillRect(x, 0, 16, h); }
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(60,40,30,${Math.random() * 0.25})`; g.fillRect(Math.random() * w, Math.random() * h, Math.random() * 4, Math.random() * 10); }
  }, 2, 1);
  const texPlanks = makeTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#d8b98a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) { g.fillStyle = `rgb(${200 + Math.random() * 40},${160 + Math.random() * 40},${100 + Math.random() * 40})`; g.fillRect(0, y, w, 30); g.fillStyle = 'rgba(60,40,20,0.6)'; g.fillRect(0, y + 30, w, 2); }
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(90,60,30,${Math.random() * 0.2})`; g.fillRect(Math.random() * w, Math.random() * h, Math.random() * 40, 1); }
    g.fillStyle = 'rgba(40,30,20,0.6)'; for (let y = 8; y < h; y += 32) { g.fillRect(12, y, 3, 3); g.fillRect(w - 15, y, 3, 3); }
  }, 1, 1);
  const texConcrete = makeTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#c9c9c9'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) { const v = 150 + Math.random() * 100; g.fillStyle = `rgba(${v},${v},${v},0.35)`; g.fillRect(Math.random() * w, Math.random() * h, Math.random() * 3, Math.random() * 3); }
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
  }, 2, 1);
  const texWindows = makeTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    for (let y = 24; y < h - 20; y += 64) for (let x = 20; x < w - 20; x += 48) { g.fillStyle = Math.random() < 0.3 ? '#f0d8a0' : '#2b3340'; g.fillRect(x, y, 26, 36); g.fillStyle = '#d8d2c4'; g.fillRect(x - 3, y + 36, 32, 4); }
  }, 2, 1);
  const MATERIALS = {
    wall: new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.9, map: texConcrete }),
    building: new THREE.MeshStandardMaterial({ color: 0x7a7e83, roughness: 0.95, map: texConcrete }),
    pillar: new THREE.MeshStandardMaterial({ color: 0x5a5e63, roughness: 0.9, map: texConcrete }),
    container: [new THREE.MeshStandardMaterial({ color: 0x9a4535, roughness: 0.7, metalness: 0.25, map: texCorrugated }), new THREE.MeshStandardMaterial({ color: 0x35587a, roughness: 0.7, metalness: 0.25, map: texCorrugated }), new THREE.MeshStandardMaterial({ color: 0x66753f, roughness: 0.7, metalness: 0.25, map: texCorrugated })],
    crate: new THREE.MeshStandardMaterial({ color: 0x9c7a4c, roughness: 0.95, map: texPlanks }),
    sandbag: new THREE.MeshStandardMaterial({ color: 0x9b8b5e, roughness: 1 }),
    barrier: new THREE.MeshStandardMaterial({ color: 0xb8a233, roughness: 0.8 }),
    barrel: new THREE.MeshStandardMaterial({ color: 0x3f5f7a, roughness: 0.6, metalness: 0.4 }),
    pallet: new THREE.MeshStandardMaterial({ color: 0xa08055, roughness: 1, map: texPlanks }),
    lowwall: new THREE.MeshStandardMaterial({ color: 0x7e8186, roughness: 0.95 }),
    immeuble: [new THREE.MeshStandardMaterial({ color: 0xb8a68e, roughness: 0.9, map: texWindows }), new THREE.MeshStandardMaterial({ color: 0x9a8f86, roughness: 0.9, map: texWindows })],
    kiosque: new THREE.MeshStandardMaterial({ color: 0x4f6b47, roughness: 0.8 }),
    voiture: [new THREE.MeshStandardMaterial({ color: 0x8e9aa6, roughness: 0.4, metalness: 0.5 }), new THREE.MeshStandardMaterial({ color: 0x5a2e2a, roughness: 0.4, metalness: 0.5 })],
    stone: new THREE.MeshStandardMaterial({ color: 0x9d9a92, roughness: 0.9, map: texConcrete }),
    etal: [new THREE.MeshStandardMaterial({ color: 0xb04a3a, roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: 0x3a6a8a, roughness: 0.9 })],
    cuve: [new THREE.MeshStandardMaterial({ color: 0xb9bcbf, roughness: 0.55, metalness: 0.6, map: texCorrugated }), new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.7, metalness: 0.4, map: texCorrugated })],
    pompe: new THREE.MeshStandardMaterial({ color: 0x4a6a4a, roughness: 0.6, metalness: 0.5 }),
    pipe: new THREE.MeshStandardMaterial({ color: 0x9a9ea3, roughness: 0.4, metalness: 0.7 }),
    armoire: new THREE.MeshStandardMaterial({ color: 0x6a7a86, roughness: 0.5, metalness: 0.5 }),
    carPaint: [0xd9dcdf, 0x8e9aa6, 0x5a2e2a, 0x2f3b4a, 0xe6e2d6, 0x3d4a3a].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.55 })),
    glass: new THREE.MeshStandardMaterial({ color: 0x1d2a33, roughness: 0.1, metalness: 0.8 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }),
    rim: new THREE.MeshStandardMaterial({ color: 0x9a9ea3, roughness: 0.4, metalness: 0.7 }),
    light: new THREE.MeshBasicMaterial({ color: 0xfff2c4 }), lightRed: new THREE.MeshBasicMaterial({ color: 0x9a1a14 }),
    bark: new THREE.MeshStandardMaterial({ color: 0x6b5a44, roughness: 1 }), frond: new THREE.MeshStandardMaterial({ color: 0x3f6b33, roughness: 0.9, side: THREE.DoubleSide }),
    mall: new THREE.MeshStandardMaterial({ color: 0xd8cbb6, roughness: 0.85, map: texConcrete }), mallGlass: new THREE.MeshStandardMaterial({ color: 0x324a5a, roughness: 0.15, metalness: 0.7 }),
    sign: new THREE.MeshBasicMaterial({ color: 0xc23b2f }), busPaint: new THREE.MeshStandardMaterial({ color: 0xe0e4e8, roughness: 0.4, metalness: 0.4 }),
  };
  // ---- modèles de décor (le volume de collision reste la boîte de la carte ; ces modèles s'y inscrivent) ----------------
  // voiture : caisse basse, habitacle vitré, roues, phares ; orientée selon le grand côté de la boîte
  function carModel(o, i, kind) {
    const g = new THREE.Group(), along = o.d >= o.w, L = Math.max(o.w, o.d), Wd = Math.min(o.w, o.d), H = o.h;
    const paint = kind === 'bus' ? MATERIALS.busPaint : MATERIALS.carPaint[(i * 7 + Math.round(o.x * 3 + o.z)) % MATERIALS.carPaint.length];
    const add = (geo, mat, x, y, z, rx, ry, rz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (rx) m.rotation.x = rx; if (ry) m.rotation.y = ry; if (rz) m.rotation.z = rz; g.add(m); return m; };
    const wheelR = kind === 'car' ? 0.32 : 0.45;
    if (kind === 'car') {
      add(new THREE.BoxGeometry(Wd * 0.96, H * 0.42, L * 0.98), paint, 0, -H / 2 + wheelR * 0.8 + H * 0.21, 0);
      add(new THREE.BoxGeometry(Wd * 0.86, H * 0.36, L * 0.5), MATERIALS.glass, 0, -H / 2 + wheelR * 0.8 + H * 0.42 + H * 0.17, -L * 0.04);
      add(new THREE.BoxGeometry(Wd * 0.8, 0.05, L * 0.46), paint, 0, -H / 2 + wheelR * 0.8 + H * 0.42 + H * 0.36, -L * 0.04);
      for (const s of [-1, 1]) { add(new THREE.BoxGeometry(0.22, 0.1, 0.04), MATERIALS.light, s * Wd * 0.32, -H / 2 + wheelR + 0.25, L * 0.49); add(new THREE.BoxGeometry(0.22, 0.1, 0.04), MATERIALS.lightRed, s * Wd * 0.32, -H / 2 + wheelR + 0.25, -L * 0.49); }
    } else {   // fourgon / bus : caisse haute, vitres latérales en bandeau
      add(new THREE.BoxGeometry(Wd * 0.98, H - wheelR * 0.8, L * 0.99), paint, 0, wheelR * 0.4, 0);
      for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.03, H * 0.25, L * (kind === 'bus' ? 0.85 : 0.35)), MATERIALS.glass, s * Wd * 0.5, H * 0.22, kind === 'bus' ? 0 : L * 0.28);
      add(new THREE.BoxGeometry(Wd * 0.85, H * 0.3, 0.03), MATERIALS.glass, 0, H * 0.2, L * 0.497);
      if (kind === 'bus') add(new THREE.BoxGeometry(0.03, H * 0.12, L * 0.9), MATERIALS.sign, Wd * 0.5 + 0.01, -H * 0.12, 0);
    }
    const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.22, 14);
    for (const s of [-1, 1]) for (const f of [-1, 1]) { const w = add(wheelGeo, MATERIALS.tyre, s * Wd * 0.46, -H / 2 + wheelR, f * L * 0.33, 0, 0, Math.PI / 2); const r = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 0.55, wheelR * 0.55, 0.23, 10), MATERIALS.rim); w.add(r); }
    if (!along) g.rotation.y = Math.PI / 2;
    return g;
  }
  function palmModel(o) {
    const g = new THREE.Group(), H = o.h;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, H, 8), MATERIALS.bark); g.add(trunk);
    for (let k = 0; k < 8; k++) {   // palmes : feuilles longues, retombantes
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 2.4, 1, 4), MATERIALS.frond); const pos = leaf.geometry.attributes.position;
      for (let v = 0; v < pos.count; v++) { const y = pos.getY(v); pos.setZ(v, -Math.pow((y + 1.2) / 2.4, 2) * 0.9); }
      pos.needsUpdate = true; leaf.geometry.computeVertexNormals();
      const pivot = new THREE.Group(); pivot.position.y = H / 2; pivot.rotation.y = k * Math.PI / 4; leaf.position.set(0, 0, 1.15); leaf.rotation.x = -Math.PI / 2 + 0.35; pivot.add(leaf); g.add(pivot);
    }
    return g;
  }
  function mallModel(o) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, o.d), MATERIALS.mall); g.add(body);
    const n = Math.floor(o.w / 3.2);   // vitrines au rez-de-chaussée, côté parking (+z)
    for (let k = 0; k < n; k++) { const v = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 0.05), MATERIALS.mallGlass); v.position.set(-o.w / 2 + 1.6 + k * 3.2, -o.h / 2 + 1.5, o.d / 2 + 0.03); g.add(v); }
    const band = new THREE.Mesh(new THREE.BoxGeometry(o.w * 0.6, 0.8, 0.1), MATERIALS.sign); band.position.set(0, o.h / 2 - 1.2, o.d / 2 + 0.06); g.add(band);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.4, 0.3, o.d + 0.4), MATERIALS.wall); roof.position.y = o.h / 2; g.add(roof);
    return g;
  }
  function materialFor(o, i) {
    const n = o.name || '';
    if (n.startsWith('mur ')) return MATERIALS.wall;
    if (n.startsWith('bâtiment')) return MATERIALS.building;
    if (n.startsWith('pilier')) return MATERIALS.pillar;
    if (n.startsWith('conteneur')) return MATERIALS.container[i % 3];
    if (n.startsWith('caisses')) return MATERIALS.crate;
    if (n.startsWith('sacs')) return MATERIALS.sandbag;
    if (n.startsWith('barrière')) return MATERIALS.barrier;
    if (n.startsWith('fût')) return MATERIALS.barrel;
    if (n.startsWith('palettes')) return MATERIALS.pallet;
    if (n.startsWith('muret')) return MATERIALS.lowwall;
    if (n.startsWith('immeuble')) return MATERIALS.immeuble[i % 2];
    if (n.startsWith('kiosque')) return MATERIALS.kiosque;
    if (n.startsWith('voiture')) return MATERIALS.voiture[i % 2];
    if (n.startsWith('banc')) return MATERIALS.pallet;
    if (n.startsWith('fontaine')) return MATERIALS.stone;
    if (n.startsWith('étal')) return MATERIALS.etal[i % 2];
    if (n.startsWith('bac')) return MATERIALS.stone;
    if (n.startsWith('cuve')) return MATERIALS.cuve[i % 2];
    if (n.startsWith('pompe')) return MATERIALS.pompe;
    if (n.startsWith('tuyauterie')) return MATERIALS.pipe;
    if (n.startsWith('armoire')) return MATERIALS.armoire;
    return MATERIALS.wall;
  }
  function buildMap(map) {
    if (mapGroup) { // libérer les ressources GPU de la carte précédente (géométries et texture du sol créées ici)
      mapGroup.traverse(o => { if (o.isMesh) { o.geometry.dispose(); if (o.material && o.material.map && o.material.map.isCanvasTexture && o.material.map.__ground) { o.material.map.dispose(); o.material.dispose(); } } });
      scene.remove(mapGroup);
    }
    mapGroup = new THREE.Group();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(map.width, map.depth), new THREE.MeshStandardMaterial({ map: groundTexture(map.width, map.depth), roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(map.width / 2, 0, map.depth / 2); ground.receiveShadow = true; mapGroup.add(ground);
    // environnement : asphalte autour de l'enceinte et quelques entrepôts lointains en silhouette
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 1 }));
    outer.rotation.x = -Math.PI / 2; outer.position.set(map.width / 2, -0.02, map.depth / 2); outer.receiveShadow = true; mapGroup.add(outer);
    const farMat = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 1 });
    [[-30, -25, 30, 9, 14], [20, -40, 50, 11, 18], [95, -30, 28, 8, 16], [110, 20, 20, 10, 30], [100, 60, 40, 9, 14], [20, 70, 60, 8, 12], [-40, 30, 24, 12, 20], [-35, 65, 30, 7, 16]].forEach(([x, z, w, h, d]) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), farMat); b.position.set(x, h / 2, z); mapGroup.add(b);
    });
    // grues portuaires stylisées
    [[-20, 75], [85, -45]].forEach(([x, z]) => {
      const g = new THREE.Group(); const legMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.8 });
      for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.8, 28, 0.8), legMat); l.position.set(dx, 14, dz); g.add(l); }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(44, 1.2, 1.6), legMat); beam.position.set(8, 28, 0); g.add(beam);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 5), legMat); cab.position.set(0, 25, 0); g.add(cab);
      g.position.set(x, 0, z); mapGroup.add(g);
    });
    map.obstacles.forEach((o, i) => {
      let mesh;
      if (/^(voiture|fourgon|bus)/.test(o.name || '')) {
        mesh = carModel(o, i, (o.name || '').startsWith('voiture') ? 'car' : (o.name || '').startsWith('bus') ? 'bus' : 'van');
      } else if ((o.name || '').startsWith('palmier')) {
        mesh = palmModel(o);
      } else if ((o.name || '').startsWith('centre commercial')) {
        mesh = mallModel(o);
      } else if ((o.name || '').startsWith('fût')) {
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(o.w, o.d) / 2, Math.min(o.w, o.d) / 2, o.h, 16), materialFor(o, i));
      } else if ((o.name || '').startsWith('cuve')) {
        // cuve : cylindre inscrit dans la boîte (la simulation garde la boîte ; l'écart est au plus de 1,2 m dans les coins)
        mesh = new THREE.Group();
        const r = Math.min(o.w, o.d) / 2, body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, o.h, 28), materialFor(o, i)); mesh.add(body);
        const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.03, r * 1.03, 0.25, 28), MATERIALS.pipe); top.position.y = o.h / 2; mesh.add(top);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, 0.08, 6, 28), MATERIALS.pipe); ring.rotation.x = Math.PI / 2; ring.position.y = -o.h / 2 + o.h * 0.35; mesh.add(ring);
        if (o.d > o.w + 0.5 || o.w > o.d + 0.5) { // cuve allongée : deux cylindres couchés côte à côte sur la longueur
          mesh.clear(); const along = o.d > o.w; const L = along ? o.d : o.w, R = Math.min(o.w, o.d) / 2;
          const c = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 24), materialFor(o, i)); c.rotation.x = along ? Math.PI / 2 : 0; c.rotation.z = along ? 0 : Math.PI / 2; c.position.y = R - o.h / 2 + (o.h - 2 * R) * 0.5; mesh.add(c);
          const legs = new THREE.Mesh(new THREE.BoxGeometry(o.w * 0.9, o.h - 2 * R + 0.3, o.d * 0.9), MATERIALS.pompe); legs.position.y = -o.h / 2 + (o.h - 2 * R + 0.3) / 2; mesh.add(legs);
        }
      } else if ((o.name || '').startsWith('tuyauterie')) {
        mesh = new THREE.Group(); const along = o.w > o.d; const L = Math.max(o.w, o.d);
        for (let k = 0; k < 3; k++) { const rr = 0.14 - k * 0.02; const c = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, L, 12), MATERIALS.pipe); c.rotation.z = along ? Math.PI / 2 : 0; c.rotation.x = along ? 0 : Math.PI / 2; c.position.y = -o.h / 2 + 0.25 + k * 0.33; mesh.add(c); }
        for (let k = -1; k <= 1; k++) { const sup = new THREE.Mesh(new THREE.BoxGeometry(along ? 0.15 : Math.min(o.w, o.d) * 0.9, o.h, along ? Math.min(o.w, o.d) * 0.9 : 0.15), MATERIALS.armoire); sup.position.set(along ? k * L * 0.45 : 0, 0, along ? 0 : k * L * 0.45); mesh.add(sup); }
      } else if ((o.name || '').startsWith('sacs')) {
        // un empilement de sacs : 3 rangées légèrement décalées
        mesh = new THREE.Group();
        for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.1 - k * 0.04, o.h / 3, o.d + 0.1 - k * 0.04), MATERIALS.sandbag); m.position.y = -o.h / 2 + o.h / 6 + k * o.h / 3; m.castShadow = true; m.receiveShadow = true; mesh.add(m); }
      } else {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, o.d), materialFor(o, i));
      }
      mesh.position.set(o.x + o.w / 2, o.h / 2, o.z + o.d / 2);
      mesh.castShadow = true; mesh.receiveShadow = true;
      if (mesh.isGroup) mesh.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
      mapGroup.add(mesh);
      // arêtes pour la lisibilité des couverts hauts
      if (o.kind === 'wall' && !/^(mur |cuve|tuyauterie|fourgon|bus|palmier|centre)/.test(o.name || '')) {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(o.w, o.h, o.d)), new THREE.LineBasicMaterial({ color: 0x1a1d20, transparent: true, opacity: 0.5 }));
        edges.position.copy(mesh.position); mapGroup.add(edges);
      }
    });
    // zones de départ
    map.spawns.forEach((sp, i) => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(sp.r - 0.15, sp.r, 48), new THREE.MeshBasicMaterial({ color: TEAM[i].color, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(sp.x, 0.02, sp.z); mapGroup.add(ring);
    });
    mergeStatic(mapGroup);
    scene.add(mapGroup);
  }
  // Performance : le décor est immobile → ses maillages sont fusionnés par matériau (et par ombres portées / reçues).
  // ~350 appels de dessin de moins par image (et autant pour la carte d'ombres). Les arêtes sont fusionnées en un seul tracé.
  function mergeStatic(root) {
    root.updateMatrixWorld(true);
    const buckets = new Map(), lines = [], drop = [];
    root.traverse(o => {
      if (o.isLineSegments) { lines.push(o); return; }
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position || !o.geometry.attributes.normal || Array.isArray(o.material) || o.material.transparent) return;
      if (o.matrixWorld.determinant() < 0) return;                                  // miroir : ordre des faces inversé, on laisse tel quel
      const k = o.material.uuid + '|' + o.castShadow + '|' + o.receiveShadow;
      if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(o);
    });
    const merge = (list, withNormal) => {
      const useUv = list.every(m => m.geometry.attributes.uv);
      const parts = list.map(m => { const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()); g.applyMatrix4(m.matrixWorld); return g; });
      const n = parts.reduce((s, g) => s + g.attributes.position.count, 0), out = new THREE.BufferGeometry();
      const pos = new Float32Array(n * 3), nor = withNormal ? new Float32Array(n * 3) : null, uv = useUv && withNormal ? new Float32Array(n * 2) : null;
      let o3 = 0, o2 = 0;
      for (const g of parts) { pos.set(g.attributes.position.array, o3); if (nor) nor.set(g.attributes.normal.array, o3); if (uv) uv.set(g.attributes.uv.array, o2); o3 += g.attributes.position.count * 3; o2 += g.attributes.position.count * 2; g.dispose(); }
      out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); if (nor) out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      out.computeBoundingSphere(); return out;
    };
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      const m = new THREE.Mesh(merge(list, true), list[0].material); m.castShadow = list[0].castShadow; m.receiveShadow = list[0].receiveShadow; m.matrixAutoUpdate = false;
      root.add(m); drop.push(...list);
    }
    if (lines.length > 1) {
      const ls = new THREE.LineSegments(merge(lines, false), new THREE.LineBasicMaterial({ color: 0x1a1d20, transparent: true, opacity: 0.5 })); ls.matrixAutoUpdate = false;
      root.add(ls); drop.push(...lines);
    }
    for (const o of drop) { o.parent.remove(o); o.geometry.dispose(); if (o.isLineSegments) o.material.dispose(); }
    // groupes vidés (voitures, cuves…) : retirés
    const empty = []; root.traverse(o => { if (o !== root && o.isGroup && !o.children.length) empty.push(o); }); for (const g of empty) g.parent.remove(g);
  }

  // ---------------------------------------------------------------------------------------------
  // Opérateurs : personnages articulés construits par programme (jambes, torse, bras, tête, casque, gilet, arme),
  // couleur par équipe, animations de marche / posture / chute / recul / impact.
  // ---------------------------------------------------------------------------------------------
  const meshes = {}; // unitId -> { group, pose, parts…, label, prev, cur, anim }
  const Figure = OT.Figure;
  function makeOperator(u) {
    const t = TEAM[u.team];
    let fac = DATA.FACTIONS[u.def.faction || 'allied'] || DATA.FACTIONS.allied;   // uniforme selon la faction, marqueurs selon l'équipe
    const teamDef = battle.teams[u.team]; if (!u.def.faction && teamDef.uniform) { const uni = DATA.UNIFORMS.find(x => x.id === teamDef.uniform); if (uni) fac = uni; }
    const f = Figure.build({ id: u.def.id, weapon: u.weapon.id, uniform: fac.uniform, vest: fac.vest, teamColor: t.color, headgear: u.def.headgear || (u.def.faction ? 'casque_lunettes' : 'casque') });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.42, 24), new THREE.MeshBasicMaterial({ color: t.color, transparent: true, opacity: 0.8, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; f.group.add(ring);
    scene.add(f.group);
    const label = document.createElement('div'); label.className = 'label team' + u.team;
    label.innerHTML = `<div class="lbar"><i></i></div><div class="lplate">${roleImg(u.role.id)}<span class="lname">${u.callsign}</span></div>`;
    $('#labels').appendChild(label);
    meshes[u.id] = Object.assign(f, { ring, label, prev: { x: u.x, z: u.z, facing: u.facing }, cur: { x: u.x, z: u.z, facing: u.facing },
      anim: { crouch: 0, fall: 0, fallDir: 0, recoil: 0, flinch: 0, aim: 0, phase: Math.random() * 6.28 } });
  }
  function clearOperators() { for (const id in meshes) { scene.remove(meshes[id].group); meshes[id].label.remove(); delete meshes[id]; } }

  // Pose d'un opérateur selon son état (appelée à chaque image) — toutes les valeurs sont lissées.
  const lerp = (a, b, k) => a + (b - a) * k;
  function animateOperator(u, m, dt) {
    const a = m.anim;
    a.crouch = lerp(a.crouch, u.alive && u.stance === 'crouch' ? 1 : 0, Math.min(1, dt * 8));
    a.aim = lerp(a.aim, u.alive && (u.target || u.state === 'engage' || u.state === 'overwatch' || u.state === 'capture') ? 1 : 0, Math.min(1, dt * 6));
    if (!u.alive) a.fall = Math.min(1, Math.max(0, (simTime - (u.downAt || 0)) * 2.2));
    a.recoil = Math.max(0, a.recoil - dt * 10); a.flinch = Math.max(0, a.flinch - dt * 4);
    const walking = u.alive && u.moving, running = walking && (u.state === 'closing' || u.state === 'retreat' || u.state === 'evade' || u.state === 'tozone');
    if (walking) a.phase += dt * (running ? 11 : 8.5);
    const swing = walking ? Math.sin(a.phase) : 0, swingAmp = (running ? 0.7 : 0.5) * (1 - a.crouch * 0.6);
    // jambes : hanche et genou ; accroupi = cuisses vers l'avant, genoux pliés, bassin abaissé
    m.legs[0].leg.rotation.x = swing * swingAmp - a.crouch * 1.15; m.legs[0].knee.rotation.x = Math.max(0, -swing) * 0.9 + a.crouch * 1.75;
    m.legs[1].leg.rotation.x = -swing * swingAmp - a.crouch * 0.55; m.legs[1].knee.rotation.x = Math.max(0, swing) * 0.9 + a.crouch * 1.95;
    m.hips.position.y = m.hipsY - a.crouch * 0.4 + (walking ? Math.abs(Math.cos(a.phase)) * 0.03 : 0);
    // torse : penché en avant en course ou accroupi, recul au tir, tressaillement à l'impact ; épaule gauche avancée en visée
    m.torso.rotation.x = a.crouch * 0.3 + (running ? 0.22 : walking ? 0.08 : 0) - a.recoil * 0.06 + a.flinch * 0.25;
    m.torso.rotation.y = a.aim * 0.18;
    m.torso.rotation.z = a.flinch * 0.15 * Math.sin(a.phase * 3);
    m.headG.rotation.x = -a.crouch * 0.25 - (running ? 0.15 : 0) - a.flinch * 0.2; m.headG.rotation.y = -a.aim * 0.16;
    // rechargement, lancer de grenade, aveuglement : la pose des bras suit l'arme (cinématique inverse)
    a.reload = lerp(a.reload || 0, u.alive && u.reloading > 0 ? 1 : 0, Math.min(1, dt * 10));
    a.throwT = u.alive && u.throwing ? Math.min(1, (a.throwT || 0) + dt * 1.8) : Math.max(0, (a.throwT || 0) - dt * 4);
    const blind = u.alive && u.blindUntil > simTime;
    Figure.armPose(m, u.alive ? a.aim * (1 - a.reload * 0.7) : 0.15, { recoil: a.recoil, reload: a.reload, throwT: a.throwT, blind });
    if (a.reload > 0.05) m.headG.rotation.x += a.reload * 0.3;
    if (blind) m.headG.rotation.x += 0.25;
    // chute
    if (a.fall > 0) { const f = a.fall < 0.5 ? 2 * a.fall * a.fall : 1 - Math.pow(-2 * a.fall + 2, 2) / 2; m.pose.rotation.x = -Math.PI / 2 * f * 0.95; m.pose.rotation.z = a.fallDir * 0.4 * f; m.pose.position.y = 0.22 * f; m.ring.material.opacity = 0.8 - 0.6 * f; }
  }


  // traçantes et impacts : petits cylindres lumineux (visibles), éclair de bouche, étincelles, poussière
  const fx = []; // { obj, until, vel?, kind }
  const tracerMats = [new THREE.MeshBasicMaterial({ color: 0xfff0b8 }), new THREE.MeshBasicMaterial({ color: 0xffcf96 })];
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffd36a });
  const dustMat = new THREE.MeshStandardMaterial({ color: 0x9a948c, transparent: true, opacity: 0.55, roughness: 1 });
  const bloodMat = new THREE.MeshBasicMaterial({ color: 0x8e2a1f });
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffe59a, transparent: true, opacity: 0.9 });
  const tracerGeo = new THREE.CylinderGeometry(0.018, 0.018, 1, 5), sparkGeo = new THREE.SphereGeometry(0.035, 5, 4), dustGeo = new THREE.SphereGeometry(0.12, 6, 5), flashGeo = new THREE.SphereGeometry(0.11, 7, 6);
  function addShot(ev, team) {
    const from = new THREE.Vector3(ev.from.x, ev.from.y, ev.from.z), to = new THREE.Vector3(ev.to.x, ev.to.y, ev.to.z);
    const m = meshes[ev.shooter];
    if (m) { m.anim.recoil = 1; const mz = m.weapon.localToWorld(m.weapon.muzzle.clone()); from.copy(mz); }
    const dir = to.clone().sub(from), len = dir.length();
    // traçante : un segment de ~2,2 m qui parcourt le trajet
    const tr = new THREE.Mesh(tracerGeo, tracerMats[team]); tr.scale.y = Math.min(2.2, len); tr.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    scene.add(tr); fx.push({ obj: tr, kind: 'tracer', from, to, len, t0: simTime, speed: 110, until: simTime + len / 110 + 0.03 });
    const flash = new THREE.Mesh(flashGeo, flashMat); flash.position.copy(from); flash.scale.setScalar(0.8 + Math.random() * 0.5); scene.add(flash); fx.push({ obj: flash, until: simTime + 0.05 });
    const arrive = simTime + len / 110;
    if (ev.hit) {
      const tm = meshes[ev.target]; if (tm) tm.anim.flinch = 1;
      for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(sparkGeo, bloodMat); b.position.copy(to); scene.add(b); fx.push({ obj: b, until: arrive + 0.35, start: arrive, vel: new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 1.2, (Math.random() - 0.5) * 1.5), gravity: 6 }); }
    } else {
      // impact : étincelles sur un obstacle, poussière au sol
      const ground = to.y < 0.15;
      if (ground) { const d = new THREE.Mesh(dustGeo, dustMat); d.position.set(to.x, 0.1, to.z); scene.add(d); fx.push({ obj: d, until: arrive + 0.5, start: arrive, grow: 2.2 }); }
      for (let i = 0; i < (ground ? 2 : 4); i++) { const sp = new THREE.Mesh(sparkGeo, sparkMat); sp.position.set(to.x, Math.max(0.05, to.y), to.z); scene.add(sp); fx.push({ obj: sp, until: arrive + 0.3, start: arrive, vel: new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3), gravity: 9 }); }
    }
  }
  // effets de tactiques : nappe de fumée, obus, soins, drone
  const smokeMat = new THREE.MeshStandardMaterial({ color: 0xc9c9c4, transparent: true, opacity: 0.55, roughness: 1, depthWrite: false });
  function addSmoke(ev) {
    const g = new THREE.Group();
    for (let i = 0; i < 14; i++) { const r = 1.2 + Math.random() * 1.6; const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), smokeMat.clone()); m.position.set(ev.x + (Math.random() - 0.5) * ev.r * 1.6, 0.8 + Math.random() * 1.6, ev.z + (Math.random() - 0.5) * ev.r * 1.6); m.userData.drift = new THREE.Vector3((Math.random() - 0.5) * 0.15, 0.08 + Math.random() * 0.1, (Math.random() - 0.5) * 0.15); g.add(m); }
    scene.add(g); fx.push({ obj: g, kind: 'smoke', until: ev.until, start: simTime });
  }
  function addShell(ev) {
    const flash = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.9 })); flash.position.set(ev.x, 0.8, ev.z); scene.add(flash); fx.push({ obj: flash, until: simTime + 0.25, grow: 3 , start: simTime });
    for (let i = 0; i < 10; i++) { const d = new THREE.Mesh(dustGeo, dustMat); d.position.set(ev.x, 0.3, ev.z); d.scale.setScalar(1.5 + Math.random()); scene.add(d); fx.push({ obj: d, until: simTime + 1.6, start: simTime, vel: new THREE.Vector3((Math.random() - 0.5) * 6, 2 + Math.random() * 4, (Math.random() - 0.5) * 6), gravity: 4 }); }
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(2.2, 16), new THREE.MeshBasicMaterial({ color: 0x1a1612, transparent: true, opacity: 0.7 })); scorch.rotation.x = -Math.PI / 2; scorch.position.set(ev.x, 0.02, ev.z); scene.add(scorch); fx.push({ obj: scorch, until: simTime + 60 });
  }
  function addHeal(ev) { const m = meshes[ev.unit]; if (!m) return; const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 24), new THREE.MeshBasicMaterial({ color: 0x5fc46a, transparent: true, opacity: 0.9, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; m.group.add(ring); fx.push({ obj: ring, until: simTime + 5, kind: 'heal', parent: m.group }); }
  function addReco(ev) { const team = battle.teams[ev.team]; const c = battle.teamCentroid(team); const drone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.2, 4), new THREE.MeshBasicMaterial({ color: ev.team === 0 ? 0x4f9cf0 : 0xe85a4f })); drone.position.set(c.x, 9, c.z); scene.add(drone); fx.push({ obj: drone, until: ev.until, kind: 'drone', cx: c.x, cz: c.z }); }
  function addBarrageMarker(ev) { const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3, 32), new THREE.MeshBasicMaterial({ color: 0xff7a3a, transparent: true, opacity: 0.8, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.set(ev.x, 0.04, ev.z); scene.add(ring); fx.push({ obj: ring, until: simTime + 4.2, kind: 'marker' }); }
  let fxLast = 0;
  // grenade : petit objet sombre en cloche jusqu'au point de chute, puis posée au sol jusqu'à l'explosion
  const grenadeGeo = new THREE.SphereGeometry(0.07, 8, 6), grenadeMat = new THREE.MeshStandardMaterial({ color: 0x2c3326, roughness: .7, metalness: .3 });
  function addGrenade(ev) {
    const g = new THREE.Mesh(grenadeGeo, ev.kind === 'flash' ? new THREE.MeshStandardMaterial({ color: 0x5b6067, roughness: .5, metalness: .5 }) : grenadeMat);
    scene.add(g); fx.push({ obj: g, kind: 'grenade', start: simTime, flight: ev.flight, from: ev.from, to: ev.to, until: ev.explodeAt, bounced: false });
  }
  function addBlast(ev) {
    if (ev.kind === 'flash') {
      const light = new THREE.PointLight(0xffffff, 60, 18); light.position.set(ev.x, 1.2, ev.z); scene.add(light); fx.push({ obj: light, kind: 'flashlight', start: simTime, until: simTime + 0.35 });
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 })); s.position.set(ev.x, 0.6, ev.z); scene.add(s); fx.push({ obj: s, until: simTime + 0.18, grow: 6, start: simTime });
      for (let i = 0; i < 5; i++) { const d = new THREE.Mesh(dustGeo, dustMat); d.position.set(ev.x, 0.3, ev.z); d.scale.setScalar(2 + Math.random()); scene.add(d); fx.push({ obj: d, until: simTime + 2.2, start: simTime, vel: new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2), gravity: 0.3 }); }
      play('flashbang', { x: ev.x, y: 1, z: ev.z }, { vol: 1.2 });
      // le joueur voit l'éclair : voile blanc bref si la caméra regarde la zone
      const p = new THREE.Vector3(ev.x, 0.8, ev.z).project(camera); if (p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1) { const wv = $('#whiteout'); wv.classList.remove('on'); wv.offsetWidth; wv.classList.add('on'); }
    } else {
      addShell(ev);
      const light = new THREE.PointLight(0xffa040, 40, 16); light.position.set(ev.x, 1.0, ev.z); scene.add(light); fx.push({ obj: light, kind: 'flashlight', start: simTime, until: simTime + 0.3 });
      play('explosion', { x: ev.x, y: 1, z: ev.z }, { vol: 1.3 });
      cam.shake = Math.max(cam.shake || 0, 0.5);
    }
  }
  // frappe aérienne : marquage de la bande, puis l'avion qui passe et les impacts en ligne
  function addStrikeMarker(ev) {
    const len = ev.half * 2, m = new THREE.Mesh(new THREE.PlaneGeometry(4, len), new THREE.MeshBasicMaterial({ color: 0xff7a3a, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(ev.dx, ev.dz); m.position.set(ev.x, 0.05, ev.z); scene.add(m); fx.push({ obj: m, until: ev.at, kind: 'marker' });
  }
  function addStrike(ev) {
    const plane = new THREE.Group(); const body = new THREE.Mesh(new THREE.ConeGeometry(0.9, 7, 8), new THREE.MeshStandardMaterial({ color: 0x4a5058, metalness: 0.6, roughness: 0.4 })); body.rotation.x = Math.PI / 2; plane.add(body);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(9, 0.15, 1.6), body.material); wing.position.z = -0.8; plane.add(wing);
    plane.rotation.y = Math.atan2(ev.dx, ev.dz); scene.add(plane);
    fx.push({ obj: plane, kind: 'plane', start: simTime, until: simTime + 2.2, ax: ev.cx - ev.dx * 60, az: ev.cz - ev.dz * 60, bx: ev.cx + ev.dx * 60, bz: ev.cz + ev.dz * 60 });
    for (let k = -ev.half; k <= ev.half; k += 2.5) { const x = ev.cx + ev.dx * k + (Math.random() - 0.5) * 2, z = ev.cz + ev.dz * k + (Math.random() - 0.5) * 2; const d = new THREE.Mesh(dustGeo, dustMat); d.position.set(x, 0.2, z); d.scale.setScalar(2); scene.add(d); const t0 = simTime + 0.9 + (k + ev.half) / (ev.half * 2) * 0.5; fx.push({ obj: d, until: t0 + 1.2, start: t0, vel: new THREE.Vector3(0, 3 + Math.random() * 3, 0), gravity: 6 }); }
    play('tir_mitrailleuse', { x: ev.cx, y: 2, z: ev.cz }, { vol: 1.4, vitesse: 0.7 }); setTimeout(() => play('explosion', { x: ev.cx, y: 1, z: ev.cz }, { vol: 1 }), 200);
    cam.shake = Math.max(cam.shake || 0, 0.6);
  }
  function updateFx() {
    const dt = Math.max(0, simTime - fxLast); fxLast = simTime;
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      if (f.kind === 'tracer') {
        const d = Math.min(f.len, (simTime - f.t0) * f.speed), head = Math.max(0, d - f.obj.scale.y);
        const p = f.from.clone().lerp(f.to, (head + d) / 2 / f.len); f.obj.position.copy(p);
      } else if (f.vel) {
        if (simTime >= f.start) { f.obj.visible = true; f.obj.position.addScaledVector(f.vel, dt); f.vel.y -= f.gravity * dt; if (f.obj.position.y < 0.02) { f.obj.position.y = 0.02; f.vel.multiplyScalar(0.3); } }
        else f.obj.visible = false;
      } else if (f.grow) { if (simTime >= f.start) { f.obj.visible = true; const k = 1 + (simTime - f.start) * f.grow; f.obj.scale.setScalar(k); } else f.obj.visible = false; }
      else if (f.kind === 'smoke') { const life = (simTime - f.start) / (f.until - f.start); for (const m of f.obj.children) { m.position.addScaledVector(m.userData.drift, dt); m.material.opacity = 0.55 * (life < 0.1 ? life / 0.1 : 1 - Math.max(0, (life - 0.6) / 0.4)); m.scale.setScalar(1 + life * 0.6); } }
      else if (f.kind === 'drone') { const a = simTime * 1.4; f.obj.position.set(f.cx + Math.cos(a) * 6, 9 + Math.sin(a * 2) * 0.4, f.cz + Math.sin(a) * 6); f.obj.rotation.y = a; }
      else if (f.kind === 'grenade') {
        const k = Math.min(1, (simTime - f.start) / f.flight);
        if (k < 1) { f.obj.position.set(f.from.x + (f.to.x - f.from.x) * k, f.from.y + (f.to.y - f.from.y) * k + Math.sin(Math.PI * k) * (1.2 + f.flight * 1.5), f.from.z + (f.to.z - f.from.z) * k); f.obj.rotation.x += dt * 12; }
        else { f.obj.position.set(f.to.x, 0.07, f.to.z); if (!f.bounced) { f.bounced = true; play('grenade_rebond', { x: f.to.x, y: 0.2, z: f.to.z }, { vol: 1 }); } }
      }
      else if (f.kind === 'plane') { const k = (simTime - f.start) / 2.2; f.obj.position.set(f.ax + (f.bx - f.ax) * k, 18 - Math.sin(Math.PI * k) * 8, f.az + (f.bz - f.az) * k); }
      else if (f.kind === 'flashlight') { f.obj.intensity *= Math.max(0, 1 - dt * 12); }
      else if (f.kind === 'marker') { f.obj.material.opacity = 0.5 + 0.5 * Math.sin(simTime * 8); }
      else if (f.kind === 'heal') { f.obj.rotation.z = simTime * 2; f.obj.material.opacity = 0.5 + 0.4 * Math.sin(simTime * 6); }
      if (simTime > f.until) { (f.parent || scene).remove(f.obj); fx.splice(i, 1); }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Sons : lecteur de la boîte à outils (window.Son), spatialisés par rapport à la caméra, densité limitée aux vitesses élevées
  // ---------------------------------------------------------------------------------------------
  const SHOT_SOUND = { carbine: 'tir_fusil', battle: 'tir_fusil', smg: 'tir_pm', smgsil: 'tir_silencieux', dmr: 'tir_precision', lmg: 'tir_mitrailleuse', shotgun: 'tir_pompe' };
  let muted = false; try { muted = localStorage.getItem('ot-mute') === '1'; } catch (e) { /* stockage indisponible */ }
  // ---- Réglages (volume général, musique, vitesse et caméra par défaut, qualité, ombres) : gardés dans ce navigateur ----
  const SETTINGS = Object.assign({ vol: 0.9, music: 1, speed: 1, cam: 'director', quality: 'haute', shadows: true }, (() => { try { return JSON.parse(localStorage.getItem('ot-settings') || '{}'); } catch (e) { return {}; } })());
  try { const m = localStorage.getItem('ot-music'); if (m !== null && localStorage.getItem('ot-settings') === null) SETTINGS.music = parseFloat(m) || 0; } catch (e) { /* rien */ }
  function applyQuality() {
    const dpr = window.devicePixelRatio || 1;
    renderer.setPixelRatio(SETTINGS.quality === 'haute' ? Math.min(dpr, 2) : SETTINGS.quality === 'moyenne' ? 1 : 0.7);
    if (renderer.shadowMap.enabled !== !!SETTINGS.shadows) { renderer.shadowMap.enabled = !!SETTINGS.shadows; scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; }); }); }
    resize();
  }
  window.OT_SETTINGS = {
    get: (k) => k ? SETTINGS[k] : Object.assign({}, SETTINGS),
    set(k, v) {
      SETTINGS[k] = v; try { localStorage.setItem('ot-settings', JSON.stringify(SETTINGS)); } catch (e) { /* rien */ }
      if (k === 'vol' && window.Son) Son.volume(v);
      if (k === 'music') window.OT_MUSIC.set(v);
      if (k === 'speed') { speed = v; document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', parseFloat(b.dataset.speed) === v)); }
      if (k === 'quality' || k === 'shadows') applyQuality();
    },
  };
  const recent = {};
  function spatial(x, y, z) {
    // volume selon la distance à la caméra, panoramique selon la position à l'écran
    const p = new THREE.Vector3(x, y, z);
    const d = p.distanceTo(camera.position);
    const vol = Math.max(0.06, Math.min(1, 26 / (d + 8)));
    const proj = p.project(camera);
    return { vol, pan: Math.max(-0.8, Math.min(0.8, proj.x * 0.8)) };
  }
  function play(name, pos, o) {
    if (muted || !window.Son) return;
    Son.volume(SETTINGS.vol);
    const now = performance.now();
    const minGap = { pas: 60, tir_fusil: 35, tir_pm: 25, tir_mitrailleuse: 30, impact_beton: 50, impact_corps: 50 }[name] || 0;
    if (minGap && recent[name] && now - recent[name] < minGap / Math.min(2, speed)) return;
    recent[name] = now;
    const opt = Object.assign({ varie: 0.04 }, o || {});
    if (pos) { const sp = spatial(pos.x, pos.y || 1, pos.z); opt.vol = (opt.vol == null ? 1 : opt.vol) * sp.vol; opt.pan = sp.pan; }
    Son.jouer(name, opt);
  }
  const AMBIENCE = { entrepot: 'ambiance_port', raffinerie: 'ambiance_port', place: 'ambiance_ville' };
  let musicVol = SETTINGS.music;
  // ambiance + musique : la musique de bataille remplace celle du QG ; tout s'arrête en sourdine
  function ambience(on) {
    if (!window.Son) return;
    if (!on || muted) { Son.arreterBoucle(0.8, 'ambiance'); if (!on && !muted) Son.boucle('musique_qg', { voie: 'musique', vol: 0.8 * musicVol, fondu: 2 }); if (muted) Son.arreterBoucle(0.6, 'musique'); return; }
    if (battle) { Son.boucle(AMBIENCE[battle.map.id] || 'ambiance_port', { voie: 'ambiance', vol: 0.9 }); Son.boucle('musique_bataille', { voie: 'musique', vol: 0.7 * musicVol, fondu: 1.5 }); }
  }
  window.OT_MUSIC = { set(v) { musicVol = v; SETTINGS.music = v; try { localStorage.setItem('ot-music', String(v)); localStorage.setItem('ot-settings', JSON.stringify(SETTINGS)); } catch (e) { /* rien */ } if (window.Son) Son.volumeBoucle('musique', (battle && !$('#app').classList.contains('hidden') ? 0.7 : 0.8) * v); }, get: () => musicVol };
  function setMuted(m) { muted = m; try { localStorage.setItem('ot-mute', m ? '1' : '0'); } catch (e) { /* rien */ } $('#mute').textContent = m ? '🔇' : '🔊'; $('#mute').classList.toggle('on', !m); ambience(!m && !$('#app').classList.contains('hidden')); }
  $('#mute').addEventListener('click', () => setMuted(!muted));
  document.addEventListener('click', (e) => { if (e.target.closest('button') && !e.target.closest('#mute')) play('clic', null, { vol: 0.8, varie: 0.05 }); }, true);

  // ---------------------------------------------------------------------------------------------
  // Boucle : simulation à vitesse réglable, interpolation des positions entre deux pas
  // ---------------------------------------------------------------------------------------------
  // ---- Zone de capture : grille d'hexagones au sol (couleur de l'équipe qui la tient), disque et contour --------------
  let zoneGroup = null, zoneMats = null;
  function buildZone() {
    if (zoneGroup) { zoneGroup.traverse(o => { if (o.isMesh) o.geometry.dispose(); }); scene.remove(zoneGroup); zoneGroup = null; }
    const z = battle.zone; if (!z) return;
    zoneGroup = new THREE.Group(); zoneGroup.position.set(z.x, 0, z.z);
    const s = 1.05, w = 0.07, pos = [], idx = [];
    const quad = (ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), nx = -dz / L * w, nz = dx / L * w, i = pos.length / 3;
      pos.push(ax + nx, 0, az + nz, bx + nx, 0, bz + nz, bx - nx, 0, bz - nz, ax - nx, 0, az - nz); idx.push(i, i + 1, i + 2, i, i + 2, i + 3); };
    const R = Math.ceil(z.r / s) + 1;
    for (let q = -R; q <= R; q++) for (let r = -R; r <= R; r++) {
      const cx = s * 1.5 * q, cz = s * Math.sqrt(3) * (r + q / 2);
      if (Math.hypot(cx, cz) > z.r - s * 0.6) continue;
      const pts = []; for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k; pts.push([cx + Math.cos(a) * s * 0.9, cz + Math.sin(a) * s * 0.9]); }
      for (let k = 0; k < 6; k++) quad(pts[k][0], pts[k][1], pts[(k + 1) % 6][0], pts[(k + 1) % 6][1]);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    zoneMats = { hex: new THREE.MeshBasicMaterial({ color: 0xe8d36a, transparent: true, opacity: 0.75, depthWrite: false }),
      disc: new THREE.MeshBasicMaterial({ color: 0xe8d36a, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide }),
      ring: new THREE.MeshBasicMaterial({ color: 0xe8d36a, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }) };
    const hex = new THREE.Mesh(g, zoneMats.hex); hex.position.y = 0.035; hex.renderOrder = 2; zoneGroup.add(hex);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(z.r, 48), zoneMats.disc); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.03; zoneGroup.add(disc);
    const ring = new THREE.Mesh(new THREE.RingGeometry(z.r - 0.12, z.r + 0.12, 64), zoneMats.ring); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; zoneGroup.add(ring);
    scene.add(zoneGroup);
  }
  function updateZone() {
    const z = battle.zone; if (!z || !zoneMats) return;
    const col = z.contested ? 0xffffff : z.holder === 0 ? TEAM[0].color : z.holder === 1 ? TEAM[1].color : 0xe8d36a;
    const pulse = 0.55 + 0.35 * Math.sin(performance.now() / (z.contested ? 120 : 420));
    zoneMats.hex.color.setHex(col); zoneMats.ring.color.setHex(col); zoneMats.disc.color.setHex(col);
    zoneMats.hex.opacity = z.holder === null ? 0.55 : pulse; zoneMats.disc.opacity = z.holder === null ? 0.05 : 0.12;
  }
  // ---- Emblème peint au sol de chaque zone de départ (grand cercle + insigne de l'équipe) ------------------------------
  let emblemGroup = null;
  function buildSpawnEmblems() {
    if (emblemGroup) { emblemGroup.traverse(o => { if (o.isMesh) { o.geometry.dispose(); if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); scene.remove(emblemGroup); }
    emblemGroup = new THREE.Group();
    battle.teams.forEach((team, ti) => {
      const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
      const col = '#' + TEAM[ti].color.toString(16).padStart(6, '0');
      g.strokeStyle = col; g.lineWidth = 16; g.globalAlpha = 0.9; g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.stroke();
      g.fillStyle = col; g.globalAlpha = 0.85; g.font = 'bold 140px "Segoe UI Symbol", "Noto Sans Symbols", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(insigniaGlyph(team), 128, 136);
      const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
      const size = team.spawn.r * 2 + 4;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.6, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.rotation.z = ti === 0 ? -Math.PI / 2 : Math.PI / 2; m.position.set(team.spawn.x, 0.025, team.spawn.z); emblemGroup.add(m);
    });
    scene.add(emblemGroup);
  }
  // ---- Bannière de fin (« ALPHA L'EMPORTE ! ») sur l'image figée, avant l'écran de résultat ------------------------
  let bannerTimer = null;
  function showBanner(after) {
    const r = battle.result, el = $('#banner');
    const txt = r.winner === -1 ? 'ÉGALITÉ' : `${battle.teams[r.winner].name.toUpperCase()} L'EMPORTE !`;
    $('#bannerText').textContent = txt; $('#bannerSub').textContent = r.reason;
    el.className = 'banner ' + (r.winner === 1 ? 'team1' : r.winner === 0 ? 'team0' : 'draw'); el.offsetWidth; el.classList.add('show');
    clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { hideBanner(); after(); }, 2600);
    el.onclick = () => { clearTimeout(bannerTimer); hideBanner(); after(); };
  }
  function hideBanner() { clearTimeout(bannerTimer); const el = $('#banner'); if (el) { el.className = 'banner hidden'; el.onclick = null; } }
  let instantResult = false;

  let battle = null, simTime = 0, speed = 1, paused = true, acc = 0, lastFrame = 0, logIndex = 0, ended = false, frameDt = 0, lastAnimTime = 0, contactPlayed = false;
  const unitById = {};

  function newBattle(opts) {
    clearOperators(); for (const f of fx) scene.remove(f.obj); fx.length = 0;
    if (!opts.replayInputs) { reviewing = false; $('#app').classList.remove('reviewing'); }
    battle = new Battle(opts); simTime = 0; acc = 0; logIndex = 0; ended = false; fxLast = 0; lastAnimTime = 0; contactPlayed = false; pendingSounds.length = 0;
    for (const k in unitById) delete unitById[k];
    buildMap(battle.map); applyConditions(opts.conditions);
    buildZone(); buildSpawnEmblems();
    $('#app').classList.toggle('capture', !!battle.zone);
    hideBanner();
    for (const u of battle.units) { makeOperator(u); unitById[u.id] = u; }
    $('#journal').innerHTML = ''; $('#ticker').innerHTML = '';
    $('#result').classList.add('hidden');
    if (!opts.replayInputs && !MANUAL && cam.mode !== SETTINGS.cam && ['director', 'follow', 'sat', 'free'].includes(SETTINGS.cam)) { cam.mode = SETTINGS.cam; document.querySelectorAll('[data-cam]').forEach(b => b.classList.toggle('on', b.dataset.cam === cam.mode)); }
    cam.init = false; cam.autoFollow = null; cam.follow = null; cam.shot = null; DIRECTOR.eventShot = null; if (cam.mode === 'free') { cam.target.set(battle.map.width / 2, 0, battle.map.depth / 2); }
    buildRosters();
    syncMeshes(1);
    pumpLog();
  }

  function stepSim() {
    for (const u of battle.units) { const m = meshes[u.id]; m.prev = m.cur; }
    battle.step(); simTime = battle.t;
    for (const u of battle.units) { meshes[u.id].cur = { x: u.x, z: u.z, facing: u.facing }; }
    for (const ev of battle.drainEvents()) {
      if (ev.type === 'shot') {
        addShot(ev, unitById[ev.shooter].team);
        const w = unitById[ev.shooter].weapon.id;
        play(SHOT_SOUND[w] || 'tir_fusil', ev.from, { vol: ev.suppressive ? 0.8 : 1 });
        const d = Math.hypot(ev.to.x - ev.from.x, ev.to.z - ev.from.z);
        pendingSounds.push({ at: simTime + d / 110, name: ev.hit ? 'impact_corps' : 'impact_beton', pos: ev.to, vol: ev.hit ? 1 : (ev.to.y < 0.15 ? 0.5 : 0.9) });
      }
      if (ev.type === 'down') { const m = meshes[ev.unit]; if (m) { m.label.classList.add('down'); m.anim.fallDir = Math.random() < 0.5 ? -1 : 1; } const u = unitById[ev.unit]; if (u) directorEvent('down', u.x, u.z); }
      if (ev.type === 'smoke') addSmoke(ev);
      if (ev.type === 'shell') { addShell(ev); play('explosion', { x: ev.x, y: 1, z: ev.z }, { vol: 1.2 }); cam.shake = Math.max(cam.shake || 0, 0.35); }
      if (ev.type === 'heal') addHeal(ev);
      if (ev.type === 'reco') addReco(ev);
      if (ev.type === 'barrage_called') addBarrageMarker(ev);
      if (ev.type === 'grenade_throw') addGrenade(ev);
      if (ev.type === 'strike_called') addStrikeMarker(ev);
      if (ev.type === 'strike') addStrike(ev);
      if (ev.type === 'grenade_blast') { addBlast(ev); directorEvent('blast', ev.x, ev.z); }
    }
    updateTacticCards();
    // sons différés (impacts à l'arrivée de la balle), pas, rechargements, contact
    for (let i = pendingSounds.length - 1; i >= 0; i--) if (simTime >= pendingSounds[i].at) { const ps = pendingSounds[i]; play(ps.name, ps.pos, { vol: ps.vol }); pendingSounds.splice(i, 1); }
    if (speed <= 2) for (const u of battle.units) {
      if (!u.alive || !u.moving) continue;
      const m = meshes[u.id]; const ph = Math.floor(m.anim.phase / Math.PI);
      if (m.lastStepPhase !== undefined && ph !== m.lastStepPhase) play('pas', { x: u.x, y: 0.2, z: u.z }, { vol: 0.9, varie: 0.06 });
      m.lastStepPhase = ph;
    }
    pumpLog();
    if (battle.over && !ended) { ended = true; paused = true; updatePlayButton(); if (instantResult || MANUAL) showResult(); else showBanner(showResult); play(battle.result.winner === 0 ? 'victoire' : 'defaite', null, { vol: 1, varie: 0 }); }
  }
  const pendingSounds = [];

  function syncMeshes(alpha) {
    for (const u of battle.units) {
      const m = meshes[u.id];
      const x = m.prev.x + (m.cur.x - m.prev.x) * alpha, z = m.prev.z + (m.cur.z - m.prev.z) * alpha;
      m.group.position.set(x, 0, z);
      // orientation : interpolation angulaire courte
      let df = m.cur.facing - m.prev.facing; while (df > Math.PI) df -= 2 * Math.PI; while (df < -Math.PI) df += 2 * Math.PI;
      m.group.rotation.y = -(m.prev.facing + df * alpha) + Math.PI / 2;
      animateOperator(u, m, frameDt);
    }
  }

  function updateLabels() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    for (const u of battle.units) {
      const m = meshes[u.id];
      const p = new THREE.Vector3(m.group.position.x, u.alive ? (u.stance === 'crouch' ? 1.5 : 2.05) : 0.6, m.group.position.z).project(camera);
      const visible = p.z < 1 && p.x > -1.1 && p.x < 1.1 && p.y > -1.1 && p.y < 1.1;
      m.label.style.display = visible ? 'block' : 'none';
      if (!visible) continue;
      m.label.style.transform = `translate(${((p.x + 1) / 2 * w).toFixed(0)}px, ${((1 - p.y) / 2 * h).toFixed(0)}px) translate(-50%, -100%)`;
      const bar = m.label.querySelector('.lbar i'); bar.style.width = (100 * u.hp / u.maxHp).toFixed(0) + '%';
      bar.style.background = u.hp / u.maxHp > 0.5 ? '#5fc46a' : (u.hp / u.maxHp > 0.2 ? '#e0b03a' : '#d9543c');
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Interface : effectifs, journal, résultat
  // ---------------------------------------------------------------------------------------------
  const roleIcon = { assault: 'AS', pointman: 'PT', marksman: 'TE', support: 'AP', breacher: 'BR' };
  function insigniaGlyph(team) {
    if (team.insignia === 'karst' || (team.units[0] && team.units[0].def.faction === 'karst')) return '⚑';
    const ins = DATA.INSIGNIAS.find(i => i.id === team.insignia); return ins ? ins.glyph : (team.index === 0 ? '✶' : '⚑');
  }
  function buildRosters() {
    battle.teams.forEach((team, ti) => {
      $('#tname' + ti).textContent = team.name; $('#ins' + ti).textContent = insigniaGlyph(team);
      const el = $('#roster' + ti);
      el.innerHTML = team.units.map(u => `
        <div class="card" data-id="${u.id}" title="${u.def.unit} — ${u.weapon.name}">
          <div class="crow"><span class="role">${roleIcon[u.role.id]}</span><span class="cs">${u.callsign}</span><span class="st"></span></div>
          <div class="bars"><div class="hp"><i></i></div><div class="sup"><i></i></div></div>
          <div class="crow small"><span class="ammo"></span><span class="status"></span></div>
        </div>`).join('');
      if (ti === 0) el.querySelectorAll('.card').forEach(c => c.addEventListener('click', () => { cam.follow = cam.follow === c.dataset.id ? null : c.dataset.id; cam.mode = 'follow'; setCamMode('follow'); el.querySelectorAll('.card').forEach(k => k.classList.toggle('follow', k.dataset.id === cam.follow)); }));
    });
    buildTacticCards();
  }
  function updateRosters() {
    for (const u of battle.units) {
      const c = document.querySelector(`.card[data-id="${u.id}"]`); if (!c) continue;
      c.classList.toggle('dead', !u.alive);
      c.querySelector('.hp i').style.width = (100 * u.hp / u.maxHp).toFixed(0) + '%';
      c.querySelector('.sup i').style.width = (100 * u.suppression).toFixed(0) + '%';
      c.querySelector('.st').textContent = u.alive ? (u.reloading > 0 ? 'Recharge' : STATE_FR[u.state] || u.state) : 'Hors de combat';
      c.querySelector('.ammo').textContent = `${u.ammo}/${u.weapon.mag} · ${u.mags} ch.`;
      c.querySelector('.status').textContent = `${Math.round(u.hp)} PV · ${STATUS_FR[u.status]}`;
    }
    $('#clock').textContent = fmtT(battle.t);
    battle.teams.forEach((team, ti) => {
      const hp = team.units.reduce((s, u) => s + (u.alive ? u.hp : 0), 0), max = team.units.reduce((s, u) => s + u.maxHp, 0);
      const pct = Math.round(100 * hp / max);
      $('#tbar' + ti).style.width = pct + '%';
      if (battle.zone) { const c = Math.floor(team.capture); $('#cbar' + ti).style.width = c + '%'; $('#tpct' + ti).textContent = c + '%'; $('#tpct' + ti).title = `Zone capturée à ${c} % — vie ${pct} %`; }
      else { $('#tpct' + ti).textContent = pct + '%'; $('#tpct' + ti).title = 'État de l\u2019équipe (vie restante)'; }
    });
    if (battle.zone) {
      const z = battle.zone, el = $('#zoneState');
      el.textContent = z.contested ? 'Zone disputée' : z.holder === null ? 'Zone libre' : `Zone : ${battle.teams[z.holder].name}`;
      el.className = 'zstate ' + (z.contested ? 'contested' : z.holder === null ? '' : 'team' + z.holder);
    }
  }
  // cartes de tactiques : à gauche celles du joueur (cliquables), à droite celles de l'adversaire (état seulement)
  function buildTacticCards() {
    battle.teams.forEach((team, ti) => {
      const el = $('#tactics' + ti);
      el.innerHTML = team.tacticIds.map(id => { const t = DATA.TACTICS[id]; return `<div class="tcard ${t.active ? '' : 'passive'} ${ti === 1 ? 'enemy' : ''}" data-tactic="${id}" title="${escapeHtml(t.desc)}"><div class="ticon">${tacIcon(id)}</div><div class="tname">${escapeHtml(t.name)}</div><div class="tuse"></div><div class="cd"></div></div>`; }).join('');
      if (ti === 0) el.querySelectorAll('.tcard').forEach(c => c.addEventListener('click', () => {
        const id = c.dataset.tactic; if (!DATA.TACTICS[id].active) return;
        const r = battle.command('tactic', 0, id);
        if (!r.ok) flashBattle(`${DATA.TACTICS[id].name} : ${r.reason}.`); else { pumpLog(); for (const ev of battle.drainEvents()) { if (ev.type === 'smoke') addSmoke(ev); if (ev.type === 'heal') addHeal(ev); if (ev.type === 'reco') addReco(ev); if (ev.type === 'barrage_called') addBarrageMarker(ev); } }
        updateTacticCards();
      }));
    });
  }
  function updateTacticCards() {
    battle.teams.forEach((team, ti) => {
      $('#tactics' + ti).querySelectorAll('.tcard').forEach(c => {
        const id = c.dataset.tactic, t = DATA.TACTICS[id], st = team.tactics[id];
        if (!t.active) { c.querySelector('.tuse').textContent = 'passive'; return; }
        const cd = Math.max(0, st.cooldownUntil - battle.t);
        c.querySelector('.tuse').textContent = st.uses <= 0 ? 'épuisé' : cd > 0 ? `${cd.toFixed(0)} s` : `${st.uses} ×`;
        c.classList.toggle('off', st.uses <= 0 || cd > 0);
        c.querySelector('.cd').style.width = cd > 0 && t.cooldown ? (100 * (1 - cd / t.cooldown)) + '%' : '0';
      });
    });
  }
  let bflashTimer = null;
  function flashBattle(msg) { let el = $('#bflash'); if (!el) { el = document.createElement('div'); el.id = 'bflash'; el.style.cssText = 'position:absolute;left:50%;top:14px;transform:translateX(-50%);background:rgba(15,20,26,.9);border:1px solid var(--line);border-radius:8px;padding:6px 12px;font-size:12px;z-index:6;pointer-events:none'; $('main').appendChild(el); } el.textContent = msg; el.style.display = 'block'; clearTimeout(bflashTimer); bflashTimer = setTimeout(() => { el.style.display = 'none'; }, 2200); }
  function pumpLog() {
    const j = $('#journal'), tk = $('#ticker');
    while (logIndex < battle.log.length) {
      const e = battle.log[logIndex++];
      if (e.kind === 'reload' && e.unit && unitById[e.unit]) { const u = unitById[e.unit]; play('recharge', { x: u.x, y: 1, z: u.z }, { vol: 0.9 }); }
      if (e.kind === 'spot' && !contactPlayed) { contactPlayed = true; play('contact', null, { vol: 1, varie: 0 }); }
      if (e.silent) continue;
      const div = document.createElement('div');
      div.className = 'entry k-' + e.kind + (e.team !== undefined ? ' team' + e.team : '');
      div.innerHTML = `<span class="t">${e.time}</span>${escapeHtml(e.text)}`;
      j.appendChild(div);
      if (e.kind !== 'spot' || /contact/.test(e.text)) { const d2 = div.cloneNode(true); d2.className = 'k-' + e.kind; tk.appendChild(d2); while (tk.children.length > 4) tk.removeChild(tk.firstChild); }
    }
    while (j.children.length > 400) j.removeChild(j.firstChild);
    j.scrollTop = j.scrollHeight;
  }
  function escapeHtml(s) { return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

  function showResult() {
    const r = battle.result;
    const title = r.winner === -1 ? 'Égalité' : (r.winner === 0 ? 'Victoire' : 'Défaite');
    $('#resTitle').textContent = title; $('#resTitle').className = r.winner === -1 ? '' : 'team' + r.winner;
    r.teams.forEach((t, ti) => { $('#resName' + ti).textContent = t.name; $('#resPct' + ti).textContent = t.hpPct + '%'; $('#resPct' + ti).title = 'Vie restante de l\u2019équipe'; $('#resIns' + ti).textContent = insigniaGlyph(battle.teams[ti]); });
    const row = (label, v0, v1) => `<span class="l">${v0}</span><span class="m">${label}</span><span class="r">${v1}</span>`;
    let html = '';
    if (battle.zone) html += row('Zone capturée', r.teams[0].capture + ' %', r.teams[1].capture + ' %');
    html += row('Neutralisations', r.teams[0].kills, r.teams[1].kills) + '<span class="head">SPÉCIAUX</span>';
    for (const [label, k] of [['Tirs à la tête', 'headshots'], ['Séries', 'streaks'], ['De groupe', 'group'], ['Revanches', 'revenge'], ['Vétérans abattus', 'veteran']]) html += row(label, r.teams[0].specials[k] || 0, r.teams[1].specials[k] || 0);
    $('#resSpecials').innerHTML = html;
    // figures : le meilleur opérateur de chaque équipe, en pied (le perdant baisse son arme)
    r.teams.forEach((t, ti) => {
      const best = t.units.slice().sort((a, b) => (b.stats.kills - a.stats.kills) || (b.stats.damageDealt - a.stats.damageDealt))[0];
      const u = best && battle.units.find(x => x.id === best.id), img = $('#resFig' + ti);
      if (!u || !OT.Portrait) { img.removeAttribute('src'); return; }
      let fac = DATA.FACTIONS[u.def.faction || 'allied'] || DATA.FACTIONS.allied; const td = battle.teams[ti]; if (!u.def.faction && td.uniform) { const uni = DATA.UNIFORMS.find(x => x.id === td.uniform); if (uni) fac = uni; }
      const won = r.winner === ti;
      img.src = OT.Portrait.render({ id: u.def.id, weapon: u.weapon.id, uniform: fac.uniform, vest: fac.vest, headgear: u.def.headgear || (u.def.faction ? 'casque_lunettes' : 'casque'), full: true, w: 420, h: 640, aiming: won }) || '';
      img.classList.toggle('lost', r.winner !== -1 && !won);
    });
    let reward = '';
    if (mode === 'mission' && mission) { const rw = OT.Game.computeRewards(window.HQ.profile(), mission, r); reward = ` Récompenses au retour : +${rw.credits} crédits, ${Object.values(rw.xp).reduce((a, b) => a + b, 0)} XP répartis.`; }
    $('#resReason').textContent = `${r.reason} Durée : ${fmtT(r.duration)}. Carte : ${r.map}. Graine ${r.seed}.${reward}`;
    $('#resTables').innerHTML = r.teams.map((t, ti) => `
      <table class="res team${ti}">
        <thead><tr><th colspan="7">${t.name} — ${t.order} — ${t.alive}/5 en état — ${t.hits}/${t.shots} tirs au but</th></tr>
        <tr><th>Opérateur</th><th>État</th><th>PV</th><th>Tirs</th><th>Au but</th><th>Neutr.</th><th>Dégâts inf. / subis</th></tr></thead>
        <tbody>${t.units.map(u => `<tr class="${u.alive ? '' : 'dead'}"><td>${u.callsign} <small>${u.role}</small></td><td>${STATUS_FR[u.status]}</td><td>${u.hp}/${u.maxHp}</td><td>${u.stats.shots}</td><td>${u.stats.hits} (${u.accuracy} %)</td><td>${u.stats.kills}</td><td>${u.stats.damageDealt} / ${u.stats.damageTaken}</td></tr>`).join('')}</tbody>
      </table>`).join('');
    $('#result').classList.remove('hidden');
  }

  // ---------------------------------------------------------------------------------------------
  // Commandes
  // ---------------------------------------------------------------------------------------------
  // Deux modes : « mission » (lancée depuis le QG, récompenses à la fin) et « libre » (graine et ordres au choix, sans récompense).
  let mode = 'free', mission = null, rewardsApplied = false;
  function setMode(m, mis) {
    mode = m; mission = mis || null; rewardsApplied = false;
    const free = m === 'free';
    // en mission, l'ordre d'Alpha reste modifiable en direct ; celui de Bravo et les réglages de graine/carte sont réservés à la bataille libre
    for (const id of ['order1', 'seed', 'mapSel', 'newBattle', 'replay', 'resReplay', 'resNew']) $('#' + id).hidden = !free;
    document.querySelectorAll('header .group').forEach(g => { if (g.querySelector('#order1, #seed, #mapSel')) g.hidden = !free; });
    $('#missionLabel').hidden = free; if (!free) $('#missionLabel').textContent = `Mission : ${mis.name}${mis.conditions && mis.conditions !== 'jour' ? ' · ' + DATA.CONDITIONS[mis.conditions].name : ''}`;
    $('#toHq').textContent = free ? 'QG' : 'Abandonner';
    $('#resHq').textContent = free ? 'Quartier général' : 'Retour au QG';
  }
  function updatePlayButton() { $('#play').textContent = paused ? '▶ Lancer' : '❚❚ Pause'; $('#play').classList.toggle('on', !paused); }
  function optsFromForm() {
    const teams = Battle.defaultTeams();
    teams[0].order = $('#order0').value; teams[1].order = $('#order1').value;
    const seedTxt = $('#seed').value.trim();
    const seed = seedTxt === '' ? Math.floor(Math.random() * 100000) : (parseInt(seedTxt, 10) || 1);
    return { seed, teams, mapId: $('#mapSel').value, conditions: $('#condSel').value === 'jour' ? undefined : $('#condSel').value };
  }
  $('#play').addEventListener('click', () => { if (battle.over) return; paused = !paused; updatePlayButton(); ambience(true); });
  // ordres en cours de bataille : appliqués immédiatement à la simulation (Alpha toujours ; Bravo en bataille libre)
  $('#order0').addEventListener('change', (e) => { if (battle && !battle.over && battle.t > 0 && !reviewing) { battle.command('order', 0, e.target.value); pumpLog(); buildRosters(); } });
  $('#order1').addEventListener('change', (e) => { if (battle && !battle.over && battle.t > 0 && mode === 'free' && !reviewing) { battle.command('order', 1, e.target.value); pumpLog(); buildRosters(); } });
  // Revoir la bataille : même graine, mêmes équipes, mêmes commandes au même instant → exactement la même bataille (caméra libre)
  let reviewing = false;
  function review() {
    const o = Object.assign({}, battle.opts, { replayInputs: battle.inputs.slice() });
    reviewing = true; newBattle(o); $('#app').classList.add('reviewing'); paused = false; updatePlayButton();
  }
  $('#resReview').addEventListener('click', review);
  document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => { speed = parseFloat(b.dataset.speed); document.querySelectorAll('[data-speed]').forEach(k => k.classList.toggle('on', k === b)); }));
  $('#newBattle').addEventListener('click', () => { newBattle(optsFromForm()); paused = false; updatePlayButton(); });
  $('#replay').addEventListener('click', () => { const o = optsFromForm(); o.seed = battle.seed; newBattle(o); paused = false; updatePlayButton(); });
  $('#resNew').addEventListener('click', () => { $('#seed').value = ''; newBattle(optsFromForm()); paused = false; updatePlayButton(); });
  $('#resReplay').addEventListener('click', () => { const o = optsFromForm(); o.seed = battle.seed; newBattle(o); paused = false; updatePlayButton(); });
  $('#resClose').addEventListener('click', () => $('#result').classList.add('hidden'));
  function goHq() {
    paused = true; updatePlayButton(); $('#result').classList.add('hidden'); ambience(false);
    if (mode === 'mission' && battle.over && !rewardsApplied) { rewardsApplied = true; window.HQ.finishMission(mission, battle.result); }
    window.HQ.show();
  }
  $('#toHq').addEventListener('click', goHq);
  $('#resHq').addEventListener('click', goHq);
  $('#freeBattle').addEventListener('click', () => { setMode('free'); window.HQ.hide(); newBattle(optsFromForm()); ambience(true); });
  $('#hqHelp').addEventListener('click', () => { $('#help').classList.toggle('hidden'); });
  window.HQ.onLaunch = (opts, mis) => { setMode('mission', mis); window.HQ.hide(); $('#order0').value = opts.teams[0].order; newBattle(opts); paused = false; updatePlayButton(); ambience(true); };
  $('#toggleHelp').addEventListener('click', () => $('#help').classList.toggle('hidden'));
  $('#toggleJournal').addEventListener('click', () => { $('#journalWrap').classList.toggle('hidden'); $('#journal').scrollTop = $('#journal').scrollHeight; });
  $('#closeJournal').addEventListener('click', () => $('#journalWrap').classList.add('hidden'));
  document.querySelectorAll('[data-cam]').forEach(b => b.addEventListener('click', () => { setCamMode(b.dataset.cam); if (b.dataset.cam !== 'follow') cam.follow = null; }));
  window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !e.target.matches('input,select')) { e.preventDefault(); $('#play').click(); } });

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  // secousse de caméra (explosions) : décalage aléatoire qui s'amortit
  function applyShake() { if (!cam.shake || cam.shake < 0.01) return; const k = cam.shake * 0.25; camera.position.x += (Math.random() - 0.5) * k; camera.position.y += (Math.random() - 0.5) * k; camera.position.z += (Math.random() - 0.5) * k; cam.shake *= 0.86; }
  function render() { resize(); applyCamera(); applyShake(); const now = simTime + Math.min(1, acc / DT) * DT; frameDt = Math.max(0, Math.min(0.1, now - lastAnimTime)); lastAnimTime = now; syncMeshes(Math.min(1, acc / DT)); updateFx(); updateRain(paused || MANUAL ? 0 : frameDt * 1.5 + 0.004); if (battle.zone) updateZone(); renderer.render(scene, camera); updateLabels(); updateRosters(); }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - lastFrame) / 1000 || 0); lastFrame = now;
    if (!paused && !battle.over) {
      acc += dt * speed;
      let n = 0;
      while (acc >= DT && n < 40) { stepSim(); acc -= DT; n++; }
      if (battle.over) acc = 0;
    }
    render();
  }

  // ---------------------------------------------------------------------------------------------
  // Démarrage
  // ---------------------------------------------------------------------------------------------
  $('#seed').value = params.get('seed') || '';
  setMuted(muted);
  if (!MANUAL) { speed = SETTINGS.speed; document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', parseFloat(b.dataset.speed) === speed)); if (SETTINGS.quality !== 'haute' || !SETTINGS.shadows) applyQuality(); }
  setMode('free');
  newBattle(optsFromForm());
  if (!MANUAL && params.get('mode') !== 'free') { if (params.get('skipTitle') === '1') window.HQ.show(); else { $('#hq').classList.add('hidden'); $('#app').classList.add('hidden'); } } else window.HQ.hide();
  // API de test (identique dans les deux modes ; en mode manuel il n'y a pas de boucle d'animation)
  window.API = {
    stats: () => { render(); const i = renderer.info.render; let meshes = 0, mats = new Set(), geos = new Set(); scene.traverse(o => { if (o.isMesh) { meshes++; mats.add(o.material); geos.add(o.geometry); } }); return { calls: i.calls, triangles: i.triangles, meshes, materials: mats.size, geometries: geos.size, shadows: renderer.shadowMap.enabled }; },
    step: (n, dt) => { for (let i = 0; i < (n || 1); i++) stepSim(); acc = DT; render(); return battle.t; },
    runToEnd: () => { instantResult = true; while (!battle.over) stepSim(); instantResult = false; acc = DT; render(); return battle.result; },
    start: (opts) => { newBattle(opts); render(); return battle.zone || true; },
    banner: () => { $('#result').classList.add('hidden'); showBanner(() => showResult()); },
    battle: () => battle, render,
    camera: (yaw, pitch, dist, tx, tz) => { cam.yaw = yaw; cam.pitch = pitch; cam.dist = dist; if (tx !== undefined) cam.target.set(tx, 0, tz); render(); },
    focus: (cs, yaw, pitch, dist) => { const u = battle.units.find(x => x.callsign === cs); setCamMode('free'); cam.follow = null; cam.init = false; cam.target.set(u.x, 0.9, u.z); cam.yaw = yaw; cam.pitch = pitch; cam.dist = dist; for (let i = 0; i < 30; i++) applyCamera(); render(); return [u.x, u.z, u.facing, u.stance, u.state]; },
    pause: (p) => { paused = p !== false; updatePlayButton(); },
    settle: () => { for (let i = 0; i < 80; i++) applyCamera(); render(); },
    useTactic: (id) => battle.command('tactic', 0, id),
    review: () => { review(); return battle.replayQueue.length; },
  };
  if (MANUAL) render(); else requestAnimationFrame((t) => { lastFrame = t; frame(t); });
  window.PRET = true;
})();
