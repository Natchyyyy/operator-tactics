// Accueil du QG : le chef d'escouade (premier opérateur de l'escouade) debout dans sa capsule vitrée, comme dans le
// jeu d'origine : arme tenue, léger balancement, éclairage chaud de face et liseré cyan de la capsule. Fond transparent
// (le décor vert du menu reste visible). Rendu seulement quand l'accueil est affiché.
(function () {
  const OT = window.OT; const $ = (s) => document.querySelector(s);
  const canvas = $('#homeScene'); if (!canvas || !window.THREE) return;
  let renderer; try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch (e) { return; }
  renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(20, 430 / 840, 0.1, 40);
  scene.add(new THREE.HemisphereLight(0xe6eef0, 0x2a2a26, 1.4));
  const key = new THREE.DirectionalLight(0xfff0d8, 3.2); key.position.set(2.5, 3.5, 4.5); scene.add(key);
  const rim = new THREE.DirectionalLight(0x6fe6ff, 2.6); rim.position.set(-3, 2.5, -3); scene.add(rim);
  const rim2 = new THREE.DirectionalLight(0x9ff0d0, 1.2); rim2.position.set(3, 1, -3); scene.add(rim2);
  let fig = null, key0 = '';
  function build(profile) {
    const id = profile.squad[0]; if (!id) { if (fig) scene.remove(fig.group); fig = null; key0 = ''; return; }
    const uni = OT.DATA.UNIFORMS.find(u => u.id === profile.uniform) || OT.DATA.UNIFORMS[0], st = profile.operators[id];
    const k = JSON.stringify([id, uni.id, st.weaponId, st.headgear, !!st.wounded, !!(OT.Soldat3D && OT.Soldat3D.ready)]); if (k === key0) return; key0 = k;
    if (fig) scene.remove(fig.group);
    const s3 = OT.Soldat3D && OT.Soldat3D.ready && OT.Soldat3D.create({ uniform: uni.uniform, weapon: st.weaponId });
    if (s3) { fig = s3; fig.play('Walk_Fight_Forward', { time: 0.12 }); fig.update(0); fig.placeWeapon(true, 0); fig.group.rotation.y = -0.5; }
    else {
      fig = OT.Figure.build({ id, weapon: st.weaponId, uniform: uni.uniform, vest: uni.vest, teamColor: 0x4f9cf0, headgear: st.headgear || 'casque' });
      OT.Figure.armPose(fig, 0.15);
      fig.group.rotation.y = 0.55; fig.torso.rotation.y = -0.12; fig.headG.rotation.y = -0.35;
      if (st.wounded) { fig.torso.rotation.x = 0.15; fig.headG.rotation.x = 0.25; }
    }
    scene.add(fig.group);
  }
  let running = false, t0 = performance.now();
  function size() { const w = canvas.clientWidth, h = canvas.clientHeight; if (w && h && (canvas.width !== w || canvas.height !== h)) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); } }
  function draw(t) {
    size();
    if (fig && !fig.isSkinned) { fig.torso.rotation.z = Math.sin(t * 0.9) * 0.012; fig.headG.rotation.y = -0.35 + Math.sin(t * 0.37) * 0.08; fig.group.position.y = Math.sin(t * 1.8) * 0.004; }
    else if (fig) { fig.group.rotation.y = -0.5 + Math.sin(t * 0.3) * 0.06; }
    if (fig && fig.isSkinned) { camera.position.set(0.1, 0.98, 6.0); camera.lookAt(0.1, 0.92, 0); } else { camera.position.set(0.25, 1.0, 5.5); camera.lookAt(0.05, 0.9, 0); }
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
