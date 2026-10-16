// OPERATOR TACTICS — rendu 3D (three.js) et interface d'observation. La simulation vit dans sim/*.js ; ici on ne fait
// qu'afficher son état et ses événements. Mode manuel : ?manual=1 puis window.API.step(n, dt).
(function () {
  const OT = window.OT;
  const { Battle, DATA, DT, fmtT } = OT;
  const params = new URLSearchParams(location.search);
  const MANUAL = params.get('manual') === '1';

  const STATE_FR = { idle: 'En attente', advancing: 'Progresse', bounding: 'Bond', pause: 'Observe', tocover: 'Vers un couvert', engage: 'Au contact', closing: 'Se rapproche', pinned: 'Cloué au sol', hold: 'Tient', wait: 'Attend', fallback: 'Recule', reposition: 'Change de poste', overwatch: 'Surveille', retreat: 'Se replie', search: 'Ratisse', noammo: 'Sans munitions', hide: 'Se cache' };
  const STATUS_FR = { ok: 'Indemne', wounded: 'Blessé', critical: 'Grave', down: 'Neutralisé' };
  const TEAM = [
    { name: 'Alpha', color: 0x3f7fc8, css: '#5aa0ea', uniform: 0x3a4a3c, vest: 0x2b352d },
    { name: 'Bravo', color: 0xd9822b, css: '#f0a04a', uniform: 0x6b5a3e, vest: 0x4e4230 },
  ];
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
  scene.fog = new THREE.Fog(0x0e1114, 90, 160);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 400);

  // caméra orbitale maison (glisser : tourner ; molette : zoom ; clic droit / Maj : déplacer)
  const cam = { target: new THREE.Vector3(32, 0, 20), yaw: Math.PI / 2 + 0.28, pitch: 0.95, dist: 60, follow: null };
  function applyCamera() {
    if (cam.follow) { const m = meshes[cam.follow]; if (m) cam.target.lerp(new THREE.Vector3(m.group.position.x, 0, m.group.position.z), 0.15); }
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    camera.position.set(cam.target.x + cam.dist * cp * Math.cos(cam.yaw), cam.target.y + cam.dist * sp, cam.target.z + cam.dist * cp * Math.sin(cam.yaw));
    camera.lookAt(cam.target);
  }
  (function cameraControls() {
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, b: e.button, shift: e.shiftKey }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
      if (drag.b === 2 || drag.shift) {
        cam.follow = null;
        const right = new THREE.Vector3(Math.cos(cam.yaw + Math.PI / 2), 0, Math.sin(cam.yaw + Math.PI / 2));
        const fwd = new THREE.Vector3(-Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
        cam.target.addScaledVector(right, dx * cam.dist * 0.0015).addScaledVector(fwd, -dy * cam.dist * 0.0015);
      } else { cam.yaw += dx * 0.005; cam.pitch = Math.max(0.15, Math.min(1.5, cam.pitch + dy * 0.005)); }
      if (MANUAL) render();
    });
    canvas.addEventListener('pointerup', () => { drag = null; });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = Math.max(8, Math.min(140, cam.dist * (1 + Math.sign(e.deltaY) * 0.1))); if (MANUAL) render(); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  })();

  // lumières
  scene.add(new THREE.HemisphereLight(0xb8c8d8, 0x3a3630, 1.15));
  const sun = new THREE.DirectionalLight(0xffe9c4, 2.2);
  sun.position.set(40, 60, 10); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -45; sun.shadow.camera.right = 45; sun.shadow.camera.top = 35; sun.shadow.camera.bottom = -35; sun.shadow.camera.far = 160; sun.shadow.bias = -0.0008;
  scene.add(sun); scene.add(sun.target);

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
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; return tex;
  }
  const MATERIALS = {
    wall: new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.9 }),
    building: new THREE.MeshStandardMaterial({ color: 0x6f7378, roughness: 0.95 }),
    pillar: new THREE.MeshStandardMaterial({ color: 0x5a5e63, roughness: 0.9 }),
    container: [new THREE.MeshStandardMaterial({ color: 0x8c3b2e, roughness: 0.7, metalness: 0.3 }), new THREE.MeshStandardMaterial({ color: 0x2f4f6f, roughness: 0.7, metalness: 0.3 }), new THREE.MeshStandardMaterial({ color: 0x5c6b3a, roughness: 0.7, metalness: 0.3 })],
    crate: new THREE.MeshStandardMaterial({ color: 0x8b6a3e, roughness: 0.95 }),
    sandbag: new THREE.MeshStandardMaterial({ color: 0x9b8b5e, roughness: 1 }),
    barrier: new THREE.MeshStandardMaterial({ color: 0xb8a233, roughness: 0.8 }),
    barrel: new THREE.MeshStandardMaterial({ color: 0x3f5f7a, roughness: 0.6, metalness: 0.4 }),
    pallet: new THREE.MeshStandardMaterial({ color: 0xa08055, roughness: 1 }),
    lowwall: new THREE.MeshStandardMaterial({ color: 0x7e8186, roughness: 0.95 }),
  };
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
    return MATERIALS.wall;
  }
  function buildMap(map) {
    if (mapGroup) scene.remove(mapGroup);
    mapGroup = new THREE.Group();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(map.width, map.depth), new THREE.MeshStandardMaterial({ map: groundTexture(map.width, map.depth), roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(map.width / 2, 0, map.depth / 2); ground.receiveShadow = true; mapGroup.add(ground);
    map.obstacles.forEach((o, i) => {
      let mesh;
      if ((o.name || '').startsWith('fût')) {
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(o.w, o.d) / 2, Math.min(o.w, o.d) / 2, o.h, 16), materialFor(o, i));
      } else if ((o.name || '').startsWith('sacs')) {
        // un empilement de sacs : 3 rangées légèrement décalées
        mesh = new THREE.Group();
        for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.1 - k * 0.04, o.h / 3, o.d + 0.1 - k * 0.04), MATERIALS.sandbag); m.position.y = -o.h / 2 + o.h / 6 + k * o.h / 3; m.castShadow = true; m.receiveShadow = true; mesh.add(m); }
      } else {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, o.d), materialFor(o, i));
      }
      mesh.position.set(o.x + o.w / 2, o.h / 2, o.z + o.d / 2);
      mesh.castShadow = true; mesh.receiveShadow = true;
      if (mesh.isGroup) mesh.children.forEach(c => { c.castShadow = true; c.receiveShadow = true; });
      mapGroup.add(mesh);
      // arêtes pour la lisibilité des couverts hauts
      if (o.kind === 'wall' && !(o.name || '').startsWith('mur ')) {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(o.w, o.h, o.d)), new THREE.LineBasicMaterial({ color: 0x1a1d20, transparent: true, opacity: 0.5 }));
        edges.position.copy(mesh.position); mapGroup.add(edges);
      }
    });
    // zones de départ
    map.spawns.forEach((sp, i) => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(sp.r - 0.15, sp.r, 48), new THREE.MeshBasicMaterial({ color: TEAM[i].color, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(sp.x, 0.02, sp.z); mapGroup.add(ring);
    });
    scene.add(mapGroup);
  }

  // ---------------------------------------------------------------------------------------------
  // Opérateurs : silhouettes simples mais lisibles (corps, tête, casque, gilet, arme), couleur par équipe
  // ---------------------------------------------------------------------------------------------
  const meshes = {}; // unitId -> { group, body, head, weapon, label }
  const geo = {
    body: new THREE.CapsuleGeometry(0.22, 0.6, 4, 10), head: new THREE.SphereGeometry(0.14, 12, 10), helmet: new THREE.SphereGeometry(0.165, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    vest: new THREE.BoxGeometry(0.42, 0.42, 0.3), legs: new THREE.CylinderGeometry(0.19, 0.17, 0.7, 10), pack: new THREE.BoxGeometry(0.3, 0.3, 0.18),
    rifle: new THREE.BoxGeometry(0.06, 0.07, 0.75), lmg: new THREE.BoxGeometry(0.08, 0.1, 0.95), dmr: new THREE.BoxGeometry(0.05, 0.06, 1.05), smg: new THREE.BoxGeometry(0.06, 0.08, 0.5), shotgun: new THREE.BoxGeometry(0.06, 0.08, 0.85),
    ring: new THREE.RingGeometry(0.34, 0.42, 24),
  };
  function makeOperator(u) {
    const t = TEAM[u.team];
    const matU = new THREE.MeshStandardMaterial({ color: t.uniform, roughness: 0.95 });
    const matV = new THREE.MeshStandardMaterial({ color: t.vest, roughness: 0.9 });
    const matSkin = new THREE.MeshStandardMaterial({ color: 0xc9a27e, roughness: 0.8 });
    const matHelmet = new THREE.MeshStandardMaterial({ color: t.vest, roughness: 0.6 });
    const matGun = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.5, metalness: 0.6 });
    const matMark = new THREE.MeshBasicMaterial({ color: t.color });
    const group = new THREE.Group();
    const pose = new THREE.Group(); group.add(pose); // ce qui s'incline/s'abaisse selon la posture
    const legs = new THREE.Mesh(geo.legs, matU); legs.position.y = 0.35; pose.add(legs);
    const body = new THREE.Mesh(geo.body, matU); body.position.y = 1.05; pose.add(body);
    const vest = new THREE.Mesh(geo.vest, matV); vest.position.set(0, 1.1, 0.02); pose.add(vest);
    const pack = new THREE.Mesh(geo.pack, matV); pack.position.set(0, 1.12, -0.22); pose.add(pack);
    const head = new THREE.Mesh(geo.head, matSkin); head.position.y = 1.58; pose.add(head);
    const helmet = new THREE.Mesh(geo.helmet, matHelmet); helmet.position.y = 1.58; pose.add(helmet);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.035, 6, 16), matMark); band.position.set(0.0, 1.22, 0.0); band.rotation.x = Math.PI / 2; pose.add(band);
    const wg = geo[u.weapon] || geo.rifle;
    const weapon = new THREE.Mesh(wg, matGun); weapon.position.set(0.2, 1.2, 0.35); weapon.rotation.x = -0.05; pose.add(weapon);
    const ring = new THREE.Mesh(geo.ring, new THREE.MeshBasicMaterial({ color: t.color, transparent: true, opacity: 0.8, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; group.add(ring);
    pose.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    scene.add(group);
    // étiquette HTML
    const label = document.createElement('div'); label.className = 'label team' + u.team;
    label.innerHTML = `<div class="lname">${u.callsign}</div><div class="lbar"><i></i></div>`;
    $('#labels').appendChild(label);
    meshes[u.id] = { group, pose, body, head, weapon, ring, label, prev: { x: u.x, z: u.z, facing: u.facing }, cur: { x: u.x, z: u.z, facing: u.facing } };
  }
  function clearOperators() { for (const id in meshes) { scene.remove(meshes[id].group); meshes[id].label.remove(); delete meshes[id]; } }

  // traçantes et impacts
  const fx = []; // { line | mesh, until }
  const tracerMat = [new THREE.LineBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.9 }), new THREE.LineBasicMaterial({ color: 0xffc98a, transparent: true, opacity: 0.9 })];
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffd36a });
  const bloodMat = new THREE.MeshBasicMaterial({ color: 0xa33a2a });
  function addShot(ev, team) {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ev.from.x, ev.from.y, ev.from.z), new THREE.Vector3(ev.to.x, ev.to.y, ev.to.z)]);
    const line = new THREE.Line(g, tracerMat[team]); scene.add(line); fx.push({ obj: line, until: simTime + 0.12, kind: 'line' });
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), sparkMat); flash.position.set(ev.from.x, ev.from.y, ev.from.z); scene.add(flash); fx.push({ obj: flash, until: simTime + 0.06 });
    if (ev.hit) { const hit = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), bloodMat); hit.position.set(ev.to.x, ev.to.y, ev.to.z); scene.add(hit); fx.push({ obj: hit, until: simTime + 0.25 }); }
    else { const imp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 5), sparkMat); imp.position.set(ev.to.x, Math.max(0.05, ev.to.y), ev.to.z); scene.add(imp); fx.push({ obj: imp, until: simTime + 0.15 }); }
  }
  function updateFx() {
    for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; if (simTime > f.until) { scene.remove(f.obj); if (f.obj.geometry && f.kind === 'line') f.obj.geometry.dispose(); fx.splice(i, 1); } }
  }

  // ---------------------------------------------------------------------------------------------
  // Boucle : simulation à vitesse réglable, interpolation des positions entre deux pas
  // ---------------------------------------------------------------------------------------------
  let battle = null, simTime = 0, speed = 1, paused = true, acc = 0, lastFrame = 0, logIndex = 0, ended = false;
  const unitById = {};

  function newBattle(opts) {
    clearOperators(); for (const f of fx) scene.remove(f.obj); fx.length = 0;
    battle = new Battle(opts); simTime = 0; acc = 0; logIndex = 0; ended = false;
    for (const k in unitById) delete unitById[k];
    buildMap(battle.map);
    for (const u of battle.units) { makeOperator(u); unitById[u.id] = u; }
    $('#journal').innerHTML = '';
    $('#result').classList.add('hidden');
    buildRosters();
    cam.follow = null;
    syncMeshes(1);
    $('#seedLabel').textContent = `graine ${battle.seed}`;
    $('#mapLabel').textContent = battle.map.name;
    pumpLog();
  }

  function stepSim() {
    for (const u of battle.units) { const m = meshes[u.id]; m.prev = m.cur; }
    battle.step(); simTime = battle.t;
    for (const u of battle.units) { meshes[u.id].cur = { x: u.x, z: u.z, facing: u.facing }; }
    for (const ev of battle.drainEvents()) {
      if (ev.type === 'shot') addShot(ev, unitById[ev.shooter].team);
      if (ev.type === 'down') { const m = meshes[ev.unit]; if (m) m.label.classList.add('down'); }
    }
    pumpLog();
    if (battle.over && !ended) { ended = true; paused = true; updatePlayButton(); showResult(); }
  }

  function syncMeshes(alpha) {
    for (const u of battle.units) {
      const m = meshes[u.id];
      const x = m.prev.x + (m.cur.x - m.prev.x) * alpha, z = m.prev.z + (m.cur.z - m.prev.z) * alpha;
      m.group.position.set(x, 0, z);
      // orientation : interpolation angulaire courte
      let df = m.cur.facing - m.prev.facing; while (df > Math.PI) df -= 2 * Math.PI; while (df < -Math.PI) df += 2 * Math.PI;
      m.group.rotation.y = -(m.prev.facing + df * alpha) + Math.PI / 2;
      // posture
      if (!u.alive) { m.pose.rotation.x = -Math.PI / 2; m.pose.position.y = 0.25; m.pose.scale.set(1, 1, 1); m.ring.material.opacity = 0.2; }
      else if (u.stance === 'crouch') { m.pose.rotation.x = 0; m.pose.position.y = 0; m.pose.scale.set(1, 0.68, 1); }
      else { m.pose.rotation.x = 0; m.pose.position.y = 0; m.pose.scale.set(1, 1, 1); }
      // petite animation de marche (balancement)
      if (u.alive && u.moving) m.pose.rotation.z = Math.sin(simTime * 14 + u.idx) * 0.05; else m.pose.rotation.z = 0;
      // arme épaulée quand on a une cible
      m.weapon.rotation.x = u.target ? -0.02 : 0.35;
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
  function buildRosters() {
    battle.teams.forEach((team, ti) => {
      const el = $('#roster' + ti);
      el.innerHTML = `<div class="rhead team${ti}"><span class="rname">${team.name}</span><span class="rorder">${DATA.ORDERS[team.order].name}</span></div>` +
        team.units.map(u => `
        <div class="card" data-id="${u.id}">
          <div class="crow"><span class="role">${roleIcon[u.role.id]}</span><span class="cs">${u.callsign}</span><span class="st"></span></div>
          <div class="cunit">${u.def.unit} — ${u.weapon.name}</div>
          <div class="bars"><div class="hp"><i></i></div><div class="sup"><i></i></div></div>
          <div class="crow small"><span class="ammo"></span><span class="status"></span></div>
        </div>`).join('');
      el.querySelectorAll('.card').forEach(c => c.addEventListener('click', () => { cam.follow = cam.follow === c.dataset.id ? null : c.dataset.id; el.querySelectorAll('.card').forEach(k => k.classList.toggle('follow', k.dataset.id === cam.follow)); }));
    });
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
    $('#alive0').textContent = battle.teams[0].units.filter(u => u.alive).length;
    $('#alive1').textContent = battle.teams[1].units.filter(u => u.alive).length;
  }
  function pumpLog() {
    const j = $('#journal');
    while (logIndex < battle.log.length) {
      const e = battle.log[logIndex++];
      if (e.silent) continue;
      const div = document.createElement('div');
      div.className = 'entry k-' + e.kind + (e.team !== undefined ? ' team' + e.team : '');
      div.innerHTML = `<span class="t">${e.time}</span>${escapeHtml(e.text)}`;
      j.appendChild(div);
    }
    while (j.children.length > 400) j.removeChild(j.firstChild);
    j.scrollTop = j.scrollHeight;
  }
  function escapeHtml(s) { return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

  function showResult() {
    const r = battle.result;
    const title = r.winner === -1 ? 'Égalité' : `Victoire ${r.teams[r.winner].name}`;
    $('#resTitle').textContent = title; $('#resTitle').className = r.winner === -1 ? '' : 'team' + r.winner;
    $('#resReason').textContent = `${r.reason} Durée : ${fmtT(r.duration)}. Carte : ${r.map}. Graine ${r.seed}.`;
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
    for (const id of ['order0', 'order1', 'seed', 'newBattle', 'replay', 'resReplay', 'resNew']) $('#' + id).hidden = !free;
    document.querySelectorAll('header .group').forEach(g => { if (g.querySelector('#order0, #order1, #seed')) g.hidden = !free; });
    $('#missionLabel').hidden = free; if (!free) $('#missionLabel').textContent = `Mission : ${mis.name}`;
    $('#toHq').textContent = free ? 'Quartier général' : 'Abandonner';
    $('#resHq').textContent = free ? 'Quartier général' : 'Retour au QG';
  }
  function updatePlayButton() { $('#play').textContent = paused ? '▶ Lancer' : '❚❚ Pause'; $('#play').classList.toggle('on', !paused); }
  function optsFromForm() {
    const teams = Battle.defaultTeams();
    teams[0].order = $('#order0').value; teams[1].order = $('#order1').value;
    const seedTxt = $('#seed').value.trim();
    const seed = seedTxt === '' ? Math.floor(Math.random() * 100000) : (parseInt(seedTxt, 10) || 1);
    return { seed, teams };
  }
  $('#play').addEventListener('click', () => { if (battle.over) return; paused = !paused; updatePlayButton(); });
  document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => { speed = parseFloat(b.dataset.speed); document.querySelectorAll('[data-speed]').forEach(k => k.classList.toggle('on', k === b)); }));
  $('#newBattle').addEventListener('click', () => { newBattle(optsFromForm()); paused = false; updatePlayButton(); });
  $('#replay').addEventListener('click', () => { const o = optsFromForm(); o.seed = battle.seed; newBattle(o); paused = false; updatePlayButton(); });
  $('#resNew').addEventListener('click', () => { $('#seed').value = ''; newBattle(optsFromForm()); paused = false; updatePlayButton(); });
  $('#resReplay').addEventListener('click', () => { const o = optsFromForm(); o.seed = battle.seed; newBattle(o); paused = false; updatePlayButton(); });
  $('#resClose').addEventListener('click', () => $('#result').classList.add('hidden'));
  function goHq() {
    paused = true; updatePlayButton(); $('#result').classList.add('hidden');
    if (mode === 'mission' && battle.over && !rewardsApplied) { rewardsApplied = true; window.HQ.finishMission(mission, battle.result); }
    window.HQ.show();
  }
  $('#toHq').addEventListener('click', goHq);
  $('#resHq').addEventListener('click', goHq);
  $('#freeBattle').addEventListener('click', () => { setMode('free'); window.HQ.hide(); newBattle(optsFromForm()); });
  $('#hqHelp').addEventListener('click', () => { $('#help').classList.toggle('hidden'); });
  window.HQ.onLaunch = (opts, mis) => { setMode('mission', mis); window.HQ.hide(); newBattle(opts); paused = false; updatePlayButton(); };
  $('#toggleHelp').addEventListener('click', () => $('#help').classList.toggle('hidden'));
  window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !e.target.matches('input,select')) { e.preventDefault(); $('#play').click(); } });

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  function render() { resize(); applyCamera(); syncMeshes(Math.min(1, acc / DT)); updateFx(); renderer.render(scene, camera); updateLabels(); updateRosters(); }

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
  setMode('free');
  newBattle(optsFromForm());
  if (!MANUAL && params.get('mode') !== 'free') window.HQ.show();
  if (MANUAL) {
    window.API = {
      step: (n, dt) => { for (let i = 0; i < (n || 1); i++) stepSim(); acc = DT; render(); return battle.t; },
      runToEnd: () => { while (!battle.over) stepSim(); acc = DT; render(); return battle.result; },
      battle: () => battle, camera: (yaw, pitch, dist, tx, tz) => { cam.yaw = yaw; cam.pitch = pitch; cam.dist = dist; if (tx !== undefined) cam.target.set(tx, 0, tz); render(); },
      render,
    };
    render();
  } else {
    requestAnimationFrame((t) => { lastFrame = t; frame(t); });
  }
  window.API = window.API || { battle: () => battle, render, step: (n) => { for (let i = 0; i < (n || 1); i++) stepSim(); render(); return battle.t; } };
  window.PRET = true;
})();
