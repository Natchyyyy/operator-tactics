// Écran titre : les cinq opérateurs de l'escouade en V devant un mur de béton tagué, caméra qui glisse lentement ; jingle au premier geste.
(function () {
  const OT = window.OT; const $ = (s) => document.querySelector(s);
  const canvas = $('#titleScene'); if (!canvas) return;
  let renderer; try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); } catch (e) { return; }
  renderer.setPixelRatio(1); renderer.shadowMap.enabled = true; renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;
  // rendu logiciel (pas de carte graphique) : compiler les shaders des soldats animés bloquerait la page de longues secondes ;
  // l'écran titre garde alors les figures simples (?titre3d=1 force les soldats 3D, pour les captures)
  const SOFT = (() => { try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); return /swiftshader|llvmpipe|softpipe|software/i.test(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''); } catch (e) { return false; } })();
  const FORCE3D = new URLSearchParams(location.search).get('titre3d') === '1';
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x2c2521, 9, 26);
  (function sky() {   // crépuscule : horizon orangé derrière l'escouade
    const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, '#05070a'); grd.addColorStop(0.28, '#0c1119'); grd.addColorStop(0.4, '#1f2228'); grd.addColorStop(0.465, '#6b4a33'); grd.addColorStop(0.5, '#3a2c25'); grd.addColorStop(1, '#141213');
    g.fillStyle = grd; g.fillRect(0, 0, 4, 256); const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; scene.background = tex;
  })();
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 50);
  scene.add(new THREE.HemisphereLight(0xb8c8d8, 0x3a3630, 1.4));
  const key = new THREE.DirectionalLight(0xffe2b0, 3.2); key.position.set(3, 6, 4); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); scene.add(key);
  const rim = new THREE.DirectionalLight(0x5a8fd8, 1.6); rim.position.set(-4, 3, -3); scene.add(rim);
  const sunset = new THREE.DirectionalLight(0xff9a50, 1.8); sunset.position.set(2, 1.5, -8); scene.add(sunset);   // contre-jour orangé
  const front = new THREE.DirectionalLight(0xcfe0ff, 1.1); front.position.set(1, 2.5, 9); scene.add(front);   // débouche les visages et les tenues sombres
  const pool = new THREE.SpotLight(0xffe6c0, 140, 0, 0.45, 0.75, 2); pool.position.set(3, 7.5, 3.5); pool.target.position.set(3, 0, -0.4); scene.add(pool, pool.target);   // flaque de lumière sur l'escouade
  // poussière en suspension dans la lumière
  const dustN = 260, dustPos = new Float32Array(dustN * 3); for (let i = 0; i < dustN; i++) dustPos.set([Math.random() * 14 - 5, Math.random() * 4, Math.random() * 8 - 5], i * 3);
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffd9a8, size: 0.035, transparent: true, opacity: 0.55, depthWrite: false })); scene.add(dust);
  key.target.position.set(3, 0, -1.2); scene.add(key.target); Object.assign(key.shadow.camera, { left: -9, right: 9, top: 7, bottom: -7, near: 0.5, far: 30 }); key.shadow.bias = -0.0004;
  // décor : sol, mur, caisses, conteneur. Version simple (formes unies) tout de suite ; version habillée (matières du parking :
  // asphalte, béton à coffrage et tags inventés, caisses en bois, conteneur ou modèles 3D) dès que possible, sauf en rendu logiciel
  const RICH = !SOFT || FORCE3D;
  let set = null, setRich = false, setM3 = false;
  function buildSet() {
    const P = OT.Parking, M3 = OT.Modeles3D && OT.Modeles3D.ready ? OT.Modeles3D : null;
    const rich = RICH && P && P.mesh && P.worldMat && P.asphalt;
    if (set && (!rich || (setRich && (setM3 || !M3)))) return;   // déjà habillé (ou rien de mieux possible)
    if (set) scene.remove(set); set = new THREE.Group(); setRich = !!rich; setM3 = !!M3; scene.add(set);
    const put = (o, x, y, z, ry) => { if (!o) return null; o.position.set(x, y, z); o.rotation.y += ry || 0; o.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } }); set.add(o); return o; };
    if (!rich) {
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x1f2328, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; set.add(ground);
      const crate = new THREE.MeshStandardMaterial({ color: 0x46392a, roughness: 1 }), cont = new THREE.MeshStandardMaterial({ color: 0x1d242b, roughness: 0.8, metalness: 0.3 });
      [[0.3, 0.55, -2.6, 1.1], [5.7, 0.4, -1.8, 0.8], [6.3, 0.4, -2.7, 0.8]].forEach(([x, y, z, sz]) => put(new THREE.Mesh(new THREE.BoxGeometry(sz, sz, sz), crate), x, y, z));
      put(new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 2.4), cont), 3.4, 1.3, -5.6, -0.12);
      return;
    }
    // sol d'asphalte (détail en coordonnées du monde, sans tuilage visible)
    scene.fog.color.setHex(0x15120f); scene.fog.near = 7; scene.fog.far = 21;   // brume sombre : le fond se perd dans la pénombre
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), P.worldMat(P.asphalt(), { roughness: 0.94, color: 0x6a6c6e })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; set.add(ground);
    // mur d'enceinte en panneaux de béton, assez haut pour que son arête sorte du cadre ; tags sur la face visible
    const WH = 6; put(P.mesh({ name: 'mur nord', x: 11, z: 4, w: 34, h: WH, d: 0.35 }), 3, WH / 2, -6.4);
    // conteneur à droite (modèle 3D s'il est chargé), caisses sur palettes, fûts, palettes
    const fit = (n, w, h, d, opts) => (M3 && M3.has(n) ? M3.fit(n, w, h, d, opts) : null);
    put(fit('conteneur', 6.1, 2.6, 2.45) || P.mesh({ name: 'conteneur', x: 2, z: 3, w: 6.1, h: 2.6, d: 2.45 }), 8.4, 1.3, -2.9, -0.95);
    put(P.mesh({ name: 'caisses', x: 7, z: 2, w: 1.2, h: 1.05, d: 1.0 }), 6.15, 0.525, -1.45, -0.3);
    put(fit('fut', 0.6, 0.9, 0.6), 5.75, 0.45, -0.35); put(fit('fut', 0.6, 0.9, 0.6), 6.4, 0.45, -0.05, 1.1);
    put(fit('palettes', 1.2, 0.5, 1.0), -0.9, 0.25, -1.2, 0.5);
  }
  const figs = [];
  function buildSquad() {
    for (const f of figs) scene.remove(f.group); figs.length = 0;
    const profile = window.HQ ? window.HQ.profile() : null;
    const ids = profile ? profile.squad.slice(0, 5) : ['op_vautour', 'op_lynx', 'op_granit', 'op_bastion', 'op_belier'];
    const uni = profile ? (OT.DATA.UNIFORMS.find(u => u.id === profile.uniform) || OT.DATA.UNIFORMS[0]) : OT.DATA.UNIFORMS[0];
    const S3 = OT.Soldat3D && OT.Soldat3D.ready && (!SOFT || FORCE3D) ? OT.Soldat3D : null; skinned = !!S3;
    ids.forEach((id, i) => {
      const o = OT.DATA.OPERATORS.find(x => x.id === id); if (!o) return;
      const st = profile ? profile.operators[id] : null;
      const weapon = st ? st.weaponId : OT.DATA.ROLES[o.role].weapon;
      // soldat 3D (même modèle que le QG) dès qu'il est chargé, sinon la figure simple ; en V, le chef devant au centre de la
      // moitié droite (le titre occupe la gauche), chacun tourné un peu vers lui
      const pose = [1, 0, 0.7, 'kneel', 0][i], V = [[3.0, 0.45], [2.1, -0.2], [3.95, -0.25], [1.2, -0.9], [4.85, -0.95]][i], ry = (3.0 - V[0]) * 0.09 + (i === 0 ? 0.08 : 0);
      const s3 = S3 && S3.create({ modele: 'gign', uniform: uni.uniform, weapon });
      if (s3) {
        const clip = s3.clips.Garde_Basse ? 'Garde_Basse' : 'Rifle_Aim_Turn_Right';
        s3.play(clip, { time: 0 }); s3.update(0); s3.body.rotation.y = (s3.yawFix && s3.yawFix[clip]) || 0; s3.placeWeapon(true, 0);
        s3.group.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
        s3.group.position.set(V[0], 0, V[1]); s3.group.rotation.y = ry;
        scene.add(s3.group); figs.push(s3); return;
      }
      const f = OT.Figure.build({ id, weapon, uniform: uni.uniform, vest: uni.vest, teamColor: 0x4f9cf0, headgear: st && st.headgear || 'casque' });
      // poses variées : le chef au centre épaulé, un tireur à genou, les autres arme basse ou épaulée
      if (pose === 'kneel') { f.legs[0].leg.rotation.x = -1.15; f.legs[0].knee.rotation.x = 1.75; f.legs[1].leg.rotation.x = -0.55; f.legs[1].knee.rotation.x = 1.95; f.hips.position.y = f.hipsY - 0.4; f.torso.rotation.x = 0.25; OT.Figure.armPose(f, 0.8); }
      else { f.torso.rotation.y = pose * 0.18; f.headG.rotation.y = -pose * 0.16; OT.Figure.armPose(f, pose); }
      f.group.position.set(V[0], 0, V[1]); f.group.rotation.y = ry + (pose === 'kneel' ? 0.3 : 0);
      scene.add(f.group); figs.push(f);
    });
  }
  let t0 = performance.now(), running = true, skinned = false;
  const manual = document.documentElement.classList.contains('manual') || new URLSearchParams(location.search).get('manual') === '1';
  function draw(t) {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (w && h && (canvas.width !== w || canvas.height !== h)) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    // l'escouade à droite de l'écran (le titre occupe la gauche) ; la caméra glisse lentement de part et d'autre
    const a = Math.sin(t * 0.12) * 0.3, wide = camera.aspect < 1.5 ? 1.15 : 1;
    camera.position.set(0.6 + Math.sin(a) * 2.4, 1.45 + Math.sin(t * 0.2) * 0.08, (7.4 + Math.cos(a) * 1.0) * wide); camera.lookAt(0.9, 1.0, -0.2);
    const dp = dustGeo.attributes.position.array; for (let i = 0; i < dp.length; i += 3) { dp[i] += 0.002; dp[i + 1] += Math.sin(t + i) * 0.0008; if (dp[i] > 9) dp[i] = -5; } dustGeo.attributes.position.needsUpdate = true;
    renderer.render(scene, camera);
  }
  // machine lente (rendu logiciel, vieux portable) : si une image coûte cher, on espace les suivantes pour ne pas bloquer la page
  function frame(now) {
    if (!running) return; const s = performance.now(); draw((now - t0) / 1000); const cost = performance.now() - s;
    if (cost > 40) setTimeout(() => { if (running) requestAnimationFrame(frame); }, Math.min(3000, cost * 4)); else requestAnimationFrame(frame);
  }
  function show() {
    $('#title').classList.remove('hidden'); buildSet(); buildSquad(); running = true; t0 = performance.now();
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
  window.TITLE = { show, hide, _dbg: () => ({ scene, draw, set: () => set }) };
  // le soldat 3D arrive après l'écran titre : l'escouade est reconstruite avec lui
  if (OT.Soldat3D && OT.Soldat3D.whenReady) OT.Soldat3D.whenReady(() => { if ($('#title').classList.contains('hidden')) return; buildSet(); if (!skinned && RICH) buildSquad(); if (manual) draw(0); });
  const params = new URLSearchParams(location.search);
  if (params.get('manual') === '1' || params.get('mode') === 'free' || params.get('skipTitle') === '1') hide(); else { if (window.OT_MUSIC) $('#titleMusic').checked = window.OT_MUSIC.get() > 0; show(); }
})();
