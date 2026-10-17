// Écran titre : cinq opérateurs de l'escouade en ligne sur un sol sombre, caméra qui glisse lentement ; jingle au premier geste.
(function () {
  const OT = window.OT; const $ = (s) => document.querySelector(s);
  const canvas = $('#titleScene'); if (!canvas) return;
  let renderer; try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); } catch (e) { return; }
  renderer.setPixelRatio(1); renderer.shadowMap.enabled = true; renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0e1114); scene.fog = new THREE.Fog(0x0e1114, 8, 22);
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 50);
  scene.add(new THREE.HemisphereLight(0xb8c8d8, 0x3a3630, 1.4));
  const key = new THREE.DirectionalLight(0xffe2b0, 3.2); key.position.set(3, 6, 4); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); scene.add(key);
  const rim = new THREE.DirectionalLight(0x5a8fd8, 1.6); rim.position.set(-4, 3, -3); scene.add(rim);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  // quelques caisses et un conteneur pour l'arrière-plan
  const crate = new THREE.MeshStandardMaterial({ color: 0x5a4a32, roughness: 1 }), cont = new THREE.MeshStandardMaterial({ color: 0x35587a, roughness: 0.7, metalness: 0.3 });
  [[-3.5, 0.55, -2.5, 1.1], [3.8, 0.4, -1.5, 0.8], [4.6, 0.4, -2.4, 0.8]].forEach(([x, y, z, sz]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sz, sz, sz), crate); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; scene.add(m); });
  const c = new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 2.4), cont); c.position.set(-1, 1.3, -6); c.castShadow = true; scene.add(c);
  const figs = [];
  function buildSquad() {
    for (const f of figs) scene.remove(f.group); figs.length = 0;
    const profile = window.HQ ? window.HQ.profile() : null;
    const ids = profile ? profile.squad.slice(0, 5) : ['op_vautour', 'op_lynx', 'op_granit', 'op_bastion', 'op_belier'];
    const uni = profile ? (OT.DATA.UNIFORMS.find(u => u.id === profile.uniform) || OT.DATA.UNIFORMS[0]) : OT.DATA.UNIFORMS[0];
    ids.forEach((id, i) => {
      const o = OT.DATA.OPERATORS.find(x => x.id === id); if (!o) return;
      const st = profile ? profile.operators[id] : null;
      const f = OT.Figure.build({ id, weapon: st ? st.weaponId : OT.DATA.ROLES[o.role].weapon, uniform: uni.uniform, vest: uni.vest, teamColor: 0x4f9cf0, headgear: st && st.headgear || 'casque' });
      OT.Figure.poseStatic(f, i % 2 === 0);
      f.group.position.set((i - 2) * 1.15 + (i % 2 ? 0.2 : -0.1), 0, (i % 2 ? -0.5 : 0.2)); f.group.rotation.y = -0.2 + (i - 2) * 0.12;
      scene.add(f.group); figs.push(f);
    });
  }
  let t0 = performance.now(), running = true;
  function frame(now) {
    if (!running) return; requestAnimationFrame(frame);
    const w = canvas.clientWidth, h = canvas.clientHeight; if (canvas.width !== w || canvas.height !== h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    const t = (now - t0) / 1000; const a = Math.sin(t * 0.12) * 0.35;
    camera.position.set(1.6 + Math.sin(a) * 5.5, 1.75 + Math.sin(t * 0.2) * 0.1, 7.4 + Math.cos(a) * 1.5); camera.lookAt(0.6, 1.0, 0);
    renderer.render(scene, camera);
  }
  function show() { $('#title').classList.remove('hidden'); buildSquad(); running = true; t0 = performance.now(); requestAnimationFrame(frame); }
  function hide() { $('#title').classList.add('hidden'); running = false; }
  let jingled = false;
  function jingle() { if (jingled || !window.Son) return; jingled = true; if ($('#titleMusic').checked) Son.jouer('musique_titre', { vol: 1, varie: 0 }); }
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, function f() { document.removeEventListener(ev, f, true); setTimeout(jingle, 50); }, true));
  $('#titleMusic').addEventListener('change', (e) => { if (window.OT_MUSIC) window.OT_MUSIC.set(e.target.checked ? 1 : 0); });
  $('#titleStart').addEventListener('click', () => { hide(); window.HQ.show(); if (window.OT_MUSIC && window.Son) setTimeout(() => Son.boucle('musique_qg', { voie: 'musique', vol: 0.8 * window.OT_MUSIC.get(), fondu: 2.5 }), 600); });
  $('#titleFree').addEventListener('click', () => { hide(); $('#freeBattle').click(); });
  window.TITLE = { show, hide };
  const params = new URLSearchParams(location.search);
  if (params.get('manual') === '1' || params.get('mode') === 'free' || params.get('skipTitle') === '1') hide(); else { if (window.OT_MUSIC) $('#titleMusic').checked = window.OT_MUSIC.get() > 0; show(); }
})();
