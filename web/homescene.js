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
  const fill = new THREE.DirectionalLight(0xbfe8ff, 0.7); fill.position.set(-3.5, 1.2, 3); scene.add(fill);   // débouche les ombres du côté gauche
  // ombre de contact sous les pieds (disque dégradé) : le soldat est posé sur le socle de la capsule
  (function contact() {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62); grd.addColorStop(0, 'rgba(0,0,0,.75)'); grd.addColorStop(0.55, 'rgba(0,0,0,.3)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128); const tex = new THREE.CanvasTexture(c);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.9), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.003; m.renderOrder = -1; scene.add(m);
  })();
  const POSE = { clip: 'Garde_Basse', t: 0, yaw: 0.22, cx: 0.1 };   // cx : soldat un peu à gauche, le canon du fusil reste dans la capsule
  let fig = null, key0 = '';
  function build(profile) {
    const id = profile.squad[0]; if (!id) { if (fig) scene.remove(fig.group); fig = null; key0 = ''; return; }
    const uni = OT.DATA.UNIFORMS.find(u => u.id === profile.uniform) || OT.DATA.UNIFORMS[0], st = profile.operators[id];
    const k = JSON.stringify([id, uni.id, st.weaponId, st.headgear, !!st.wounded, !!(OT.Soldat3D && OT.Soldat3D.ready)]); if (k === key0) return; key0 = k;
    if (fig) scene.remove(fig.group);
    const s3 = OT.Soldat3D && OT.Soldat3D.ready && OT.Soldat3D.create({ modele: 'gign', uniform: uni.uniform, weapon: st.weaponId });
    if (s3) {   // garde basse : debout, face au joueur, fusil en travers du torse, canon vers le bas
      const P = window.HOMEPOSE || POSE; fig = s3; fig.play(P.clip, { time: P.t }); fig.update(0); fig.body.rotation.y = (fig.yawFix[P.clip] || 0); fig.placeWeapon(true, 0); fig.group.rotation.y = P.yaw; fig.pose0 = P;
    }
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
    else if (fig) { fig.group.rotation.y = fig.pose0.yaw + Math.sin(t * 0.3) * 0.03; }
    // soldat Meshy : entier dans la capsule (pieds compris), décalé pour que le fusil tenu de profil reste dans le cadre
    if (fig && fig.isSkinned) { const cx = fig.pose0 && fig.pose0.cx !== undefined ? fig.pose0.cx : 0.05; camera.position.set(cx, 1.0, 5.85); camera.lookAt(cx, 0.9, 0); } else { camera.position.set(0.25, 1.0, 5.5); camera.lookAt(0.05, 0.9, 0); }
    renderer.render(scene, camera);
  }
  function frame(now) { if (!running) return; requestAnimationFrame(frame); draw((now - t0) / 1000); }
  const manual = new URLSearchParams(location.search).get('manual') === '1' || document.documentElement.classList.contains('manual');
  // image du soldat pour les grandes cartes de l'écran Équipe : même modèle, même éclairage et même cadrage que la capsule.
  // Rendue dans le canevas de la capsule puis copiée (le tout dans la même tâche : aucune image intermédiaire n'est affichée).
  const snaps = {}; let shown = false;
  function snapshot(profile, id) {
    const st = profile.operators[id]; if (!st || !(OT.Soldat3D && OT.Soldat3D.ready)) return null;
    const uni = OT.DATA.UNIFORMS.find(u => u.id === profile.uniform) || OT.DATA.UNIFORMS[0], P = window.HOMEPOSE || POSE;
    const k = JSON.stringify([id, uni.id, st.weaponId]); if (snaps[k]) return snaps[k];
    let s3 = null; try { s3 = OT.Soldat3D.create({ modele: 'gign', uniform: uni.uniform, weapon: st.weaponId }); } catch (e) { s3 = null; } if (!s3) return null;
    s3.play(P.clip, { time: P.t }); s3.update(0); s3.body.rotation.y = (s3.yawFix[P.clip] || 0); s3.placeWeapon(true, 0); s3.group.rotation.y = P.yaw;
    const W = 340, H = 636, cx = P.cx !== undefined ? P.cx : 0.05;
    if (fig) fig.group.visible = false; scene.add(s3.group);
    renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); camera.position.set(cx, 1.0, 5.85); camera.lookAt(cx, 0.9, 0);
    let url = null;
    try {
      renderer.render(scene, camera);
      // garde-fou : si rien n'a été dessiné (contexte graphique en difficulté), on garde le portrait habituel
      const gl = renderer.getContext(), px = new Uint8Array(8 * H * 4); gl.readPixels(W / 2 - 4, 0, 8, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let n = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 8) n++;
      url = n > H ? canvas.toDataURL('image/png') : null;
    } catch (e) { url = null; }
    scene.remove(s3.group); if (fig) fig.group.visible = true;
    if (shown) draw(0); else { const w = canvas.clientWidth, h = canvas.clientHeight; if (w && h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); } }
    return (snaps[k] = url);
  }
  window.HOMESCENE = {
    show(profile) { shown = true; build(profile); if (manual) { draw(0); return; } if (!running) { running = true; requestAnimationFrame(frame); } },
    hide() { shown = false; running = false; },
    redraw() { draw(0); },
    snapshot,
  };
})();
