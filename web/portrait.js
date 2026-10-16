// Portraits : rendu hors écran d'un opérateur (buste, trois quarts) → data URL en cache. Utilisé par le QG.
(function (root) {
  let renderer = null, scene, camera, light, key;
  const cache = {};
  function ensure() {
    if (renderer) return true;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); renderer.setSize(220, 260); renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace;
      scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(28, 220 / 260, 0.1, 20);
      scene.add(new THREE.HemisphereLight(0xdde6f0, 0x3a3630, 1.6));
      key = new THREE.DirectionalLight(0xffe9c4, 2.6); key.position.set(1.5, 2.5, 2.2); scene.add(key);
      const rim = new THREE.DirectionalLight(0x6fa8ff, 1.2); rim.position.set(-2, 1.5, -1.5); scene.add(rim);
      return true;
    } catch (e) { renderer = null; return false; }
  }
  // opts : { id, weapon, uniform, vest, headgear, full } ; full : corps entier (sinon buste)
  function render(opts) {
    const k = JSON.stringify(opts); if (cache[k]) return cache[k];
    if (!ensure()) return null;
    const f = root.Figure.build({ id: opts.id, weapon: opts.weapon, uniform: opts.uniform, vest: opts.vest, headgear: opts.headgear });
    root.Figure.poseStatic(f, !!opts.aiming);
    f.group.rotation.y = -0.45;
    scene.add(f.group);
    if (opts.full) { camera.position.set(0.9, 1.1, 3.6); camera.lookAt(0, 0.95, 0); }
    else { camera.position.set(0.32, 1.66, 0.95); camera.lookAt(0.03, 1.56, 0); }
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/png');
    scene.remove(f.group);
    f.group.traverse(m => { if (m.isMesh && m.material && !m.material.__shared) { /* matériaux par opérateur : libérés */ } });
    cache[k] = url; return url;
  }
  root.Portrait = { render, cache };
})(window.OT = window.OT || {});
