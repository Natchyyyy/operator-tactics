// Écran titre : cinq opérateurs de l'escouade en ligne sur un sol sombre, caméra qui glisse lentement ; jingle au premier geste.
(function () {
  const OT = window.OT; const $ = (s) => document.querySelector(s);
  const canvas = $('#titleScene'); if (!canvas) return;
  let renderer; try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); } catch (e) { return; }
  renderer.setPixelRatio(1); renderer.shadowMap.enabled = true; renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x2a2420, 10, 30);
  (function sky() {   // crépuscule : horizon orangé derrière l'escouade
    const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, '#0b0f15'); grd.addColorStop(0.42, '#1c2430'); grd.addColorStop(0.6, '#5a4638'); grd.addColorStop(0.7, '#b0703a'); grd.addColorStop(0.78, '#3a2a22'); grd.addColorStop(1, '#151314');
    g.fillStyle = grd; g.fillRect(0, 0, 4, 256); const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; scene.background = tex;
  })();
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 50);
  scene.add(new THREE.HemisphereLight(0xb8c8d8, 0x3a3630, 1.4));
  const key = new THREE.DirectionalLight(0xffe2b0, 3.2); key.position.set(3, 6, 4); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); scene.add(key);
  const rim = new THREE.DirectionalLight(0x5a8fd8, 1.6); rim.position.set(-4, 3, -3); scene.add(rim);
  const sunset = new THREE.DirectionalLight(0xff9a50, 1.5); sunset.position.set(2, 1.5, -8); scene.add(sunset);   // contre-jour orangé
  // poussière en suspension dans la lumière
  const dustN = 260, dustPos = new Float32Array(dustN * 3); for (let i = 0; i < dustN; i++) dustPos.set([Math.random() * 14 - 5, Math.random() * 4, Math.random() * 8 - 5], i * 3);
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffd9a8, size: 0.035, transparent: true, opacity: 0.55, depthWrite: false })); scene.add(dust);
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
    const S3 = OT.Soldat3D && OT.Soldat3D.ready ? OT.Soldat3D : null; skinned = !!S3;
    ids.forEach((id, i) => {
      const o = OT.DATA.OPERATORS.find(x => x.id === id); if (!o) return;
      const st = profile ? profile.operators[id] : null;
      const weapon = st ? st.weaponId : OT.DATA.ROLES[o.role].weapon;
      // en V derrière le chef ; soldat 3D (même modèle que le QG) dès qu'il est chargé, sinon la figure simple
      const spots = [[0, 0.3, -0.25, 1], [-1.3, -0.3, 0.05, 0], [1.25, -0.2, -0.45, 0.7], [-2.5, -0.9, 0.3, 'kneel'], [2.45, -0.95, -0.6, 0]];
      const [x, z, ry, pose] = spots[i];
      const s3 = S3 && S3.create({ modele: 'gign', uniform: uni.uniform, weapon });
      if (s3) {
        const clip = s3.clips.Garde_Basse ? 'Garde_Basse' : 'Rifle_Aim_Turn_Right';
        s3.play(clip, { time: 0 }); s3.update(0); s3.body.rotation.y = (s3.yawFix && s3.yawFix[clip]) || 0; s3.placeWeapon(true, 0);
        s3.group.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
        s3.group.position.set(x + 2.6, 0, z + (pose === 'kneel' ? -0.5 : 0)); s3.group.rotation.y = ry * 0.6 + (i === 0 ? 0.1 : 0);
        scene.add(s3.group); figs.push(s3); return;
      }
      const f = OT.Figure.build({ id, weapon, uniform: uni.uniform, vest: uni.vest, teamColor: 0x4f9cf0, headgear: st && st.headgear || 'casque' });
      // poses variées : le chef au centre épaulé, un tireur à genou, les autres arme basse ou épaulée
      if (pose === 'kneel') { f.legs[0].leg.rotation.x = -1.15; f.legs[0].knee.rotation.x = 1.75; f.legs[1].leg.rotation.x = -0.55; f.legs[1].knee.rotation.x = 1.95; f.hips.position.y = f.hipsY - 0.4; f.torso.rotation.x = 0.25; OT.Figure.armPose(f, 0.8); }
      else { f.torso.rotation.y = pose * 0.18; f.headG.rotation.y = -pose * 0.16; OT.Figure.armPose(f, pose); }
      f.group.position.set(x + 2.6, 0, z); f.group.rotation.y = ry;
      scene.add(f.group); figs.push(f);
    });
  }
  let t0 = performance.now(), running = true, skinned = false;
  const manual = document.documentElement.classList.contains('manual') || new URLSearchParams(location.search).get('manual') === '1';
  function draw(t) {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (w && h && (canvas.width !== w || canvas.height !== h)) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    // l'escouade à droite de l'écran (le titre occupe la gauche) ; la caméra glisse lentement de part et d'autre
    const a = Math.sin(t * 0.12) * 0.3, wide = camera.aspect < 1.5 ? 1.15 : 1;
    camera.position.set(0.6 + Math.sin(a) * 3.8, 1.45 + Math.sin(t * 0.2) * 0.08, (7.4 + Math.cos(a) * 1.0) * wide); camera.lookAt(0.9, 1.0, -0.2);
    const dp = dustGeo.attributes.position.array; for (let i = 0; i < dp.length; i += 3) { dp[i] += 0.002; dp[i + 1] += Math.sin(t + i) * 0.0008; if (dp[i] > 9) dp[i] = -5; } dustGeo.attributes.position.needsUpdate = true;
    renderer.render(scene, camera);
  }
  function frame(now) { if (!running) return; requestAnimationFrame(frame); draw((now - t0) / 1000); }
  function show() {
    $('#title').classList.remove('hidden'); buildSquad(); running = true; t0 = performance.now();
    if (manual) { running = false; draw(0); } else requestAnimationFrame(frame);   // captures : une seule image, sans boucle
    // carrière en cours : le bouton principal la reprend, avec un rappel (rang, batailles, crédits)
    const p = window.HQ ? window.HQ.profile() : null;
    if (p && p.career && p.career.battles > 0) { $('#titleStart').textContent = 'Reprendre la carrière'; $('#titleSave').textContent = `${p.teamName} · ${OT.DATA.RANKS[OT.Game.rankFor(p.xp || 0)].name} · ${p.career.battles} bataille${p.career.battles > 1 ? 's' : ''} · ${p.credits} crédits`; }
    else { $('#titleStart').textContent = 'Entrer au quartier général'; $('#titleSave').textContent = ''; }
    $('#titleSave').classList.toggle('on', !!$('#titleSave').textContent);
    try { $('#titleStart').focus({ preventScroll: true }); } catch (e) { /* focus indisponible */ }   // Entrée = bouton principal
  }
  function hide() { $('#title').classList.add('hidden'); running = false; }
  let jingled = false;
  function jingle() { if (jingled || !window.Son) return; jingled = true; if ($('#titleMusic').checked) Son.jouer('musique_titre', { vol: 1, varie: 0 }); }
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, function f() { document.removeEventListener(ev, f, true); setTimeout(jingle, 50); }, true));
  $('#titleMusic').addEventListener('change', (e) => { if (window.OT_MUSIC) window.OT_MUSIC.set(e.target.checked ? 1 : 0); });
  $('#titleStart').addEventListener('click', () => { hide(); window.HQ.show(); if (window.OT_MUSIC && window.Son) setTimeout(() => Son.boucle('musique_qg', { voie: 'musique', vol: 0.8 * window.OT_MUSIC.get(), fondu: 2.5 }), 600); });
  $('#titleFree').addEventListener('click', () => { hide(); $('#freeBattle').click(); });
  window.TITLE = { show, hide };
  // le soldat 3D arrive après l'écran titre : l'escouade est reconstruite avec lui
  if (OT.Soldat3D && OT.Soldat3D.whenReady) OT.Soldat3D.whenReady(() => { if (!skinned && !$('#title').classList.contains('hidden')) { buildSquad(); if (manual) draw(0); } });
  const params = new URLSearchParams(location.search);
  if (params.get('manual') === '1' || params.get('mode') === 'free' || params.get('skipTitle') === '1') hide(); else { if (window.OT_MUSIC) $('#titleMusic').checked = window.OT_MUSIC.get() > 0; show(); }
})();
