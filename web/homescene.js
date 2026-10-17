// Accueil du QG : l'escouade en 3D (les opérateurs choisis, leur arme, leur couvre-chef, l'uniforme de l'équipe),
// sur un sol de béton avec des caisses et un conteneur ; caméra qui glisse lentement. Rendu seulement quand l'accueil est visible.
(function () {
  const OT = window.OT; const $ = (s) => document.querySelector(s);
  const canvas = $('#homeScene'); if (!canvas || !window.THREE) return;
  let renderer; try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch (e) { return; }
  renderer.setPixelRatio(1); renderer.shadowMap.enabled = true; renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x0e1114, 9, 24);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  scene.add(new THREE.HemisphereLight(0xc8d4e2, 0x3a3630, 1.5));
  const key = new THREE.DirectionalLight(0xffe2b0, 3.0); key.position.set(4, 7, 5); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -6; key.shadow.camera.right = 6; key.shadow.camera.top = 5; key.shadow.camera.bottom = -3; scene.add(key);
  const rim = new THREE.DirectionalLight(0x5a8fd8, 1.8); rim.position.set(-5, 3, -4); scene.add(rim);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(16, 48), new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const crate = new THREE.MeshStandardMaterial({ color: 0x5a4a32, roughness: 1 }), cont = new THREE.MeshStandardMaterial({ color: 0x3a4f3a, roughness: 0.7, metalness: 0.3 }), sand = new THREE.MeshStandardMaterial({ color: 0x8a7b55, roughness: 1 });
  [[-3.6, 0.5, -2.2, 1.0], [3.4, 0.4, -1.6, 0.8], [4.2, 0.4, -2.5, 0.8], [3.8, 1.2, -2.0, 0.6]].forEach(([x, y, z, s]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crate); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; scene.add(m); });
  const c = new THREE.Mesh(new THREE.BoxGeometry(7, 2.6, 2.4), cont); c.position.set(-0.5, 1.3, -5.2); c.castShadow = true; c.receiveShadow = true; scene.add(c);
  for (let k = 0; k < 3; k++) { const sb = new THREE.Mesh(new THREE.BoxGeometry(2.6 - k * 0.1, 0.3, 0.7), sand); sb.position.set(-3.3, 0.15 + k * 0.3, 0.9); sb.rotation.y = 0.4; sb.castShadow = sb.receiveShadow = true; scene.add(sb); }
  let figs = [], key0 = '';
  function build(profile) {
    const ids = profile.squad.slice(0, 5), uni = OT.DATA.UNIFORMS.find(u => u.id === profile.uniform) || OT.DATA.UNIFORMS[0];
    const k = JSON.stringify([ids, uni.id, ids.map(id => [profile.operators[id].weaponId, profile.operators[id].headgear])]);
    if (k === key0) return; key0 = k;
    for (const f of figs) scene.remove(f.group); figs = [];
    // disposition : le premier au centre, épaulé ; les autres en éventail, arme basse ou épaulée
    const spots = [[0, 0.4, 0, 1], [-1.25, -0.2, 0.35, 0], [1.25, -0.25, -0.3, 0.7], [-2.4, -0.9, 0.55, 0], [2.4, -0.95, -0.5, 0]];
    ids.forEach((id, i) => {
      const o = OT.DATA.OPERATORS.find(x => x.id === id), st = profile.operators[id];
      const f = OT.Figure.build({ id, weapon: st.weaponId, uniform: uni.uniform, vest: uni.vest, teamColor: 0x4f9cf0, headgear: st.headgear || 'casque' });
      const [x, z, ry, aim] = spots[i]; f.group.position.set(x, 0, z); f.group.rotation.y = ry;
      if (i === 3) { f.legs[0].leg.rotation.x = -1.15; f.legs[0].knee.rotation.x = 1.75; f.legs[1].leg.rotation.x = -0.55; f.legs[1].knee.rotation.x = 1.95; f.hips.position.y = f.hipsY - 0.4; f.torso.rotation.x = 0.25; OT.Figure.armPose(f, 0.8); }
      else { f.torso.rotation.y = aim * 0.18; f.headG.rotation.y = -aim * 0.16; OT.Figure.armPose(f, aim); }
      if (st.wounded) { f.torso.rotation.x = 0.15; f.headG.rotation.x = 0.25; }
      scene.add(f.group); figs.push(f);
    });
  }
  let running = false, t0 = performance.now();
  function size() { const w = canvas.clientWidth, h = canvas.clientHeight; if (w && h && (canvas.width !== w || canvas.height !== h)) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); } }
  function draw(t) {
    size(); const a = Math.sin(t * 0.1) * 0.28;
    camera.position.set(Math.sin(a) * 6.6 + 0.4, 1.45 + Math.sin(t * 0.17) * 0.06, Math.cos(a) * 6.6); camera.lookAt(0.2, 1.15, -0.4);
    renderer.render(scene, camera);
  }
  function frame(now) { if (!running) return; requestAnimationFrame(frame); draw((now - t0) / 1000); }
  const manual = new URLSearchParams(location.search).get('manual') === '1' || document.documentElement.classList.contains('manual');
  window.HOMESCENE = {
    show(profile) { build(profile); if (manual) { draw(0); return; } if (!running) { running = true; requestAnimationFrame(frame); } },
    hide() { running = false; },
    redraw() { draw(0); },
  };
})();
