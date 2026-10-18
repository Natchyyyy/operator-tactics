// Rendu « haut de gamme » de la bataille : chaîne de post-traitement, ciel physique, éclairage par environnement, ombres.
//  - ciel : modèle de diffusion atmosphérique (Sky de three.js) + couche de nuages procéduraux ; le soleil du ciel et la
//    lumière directionnelle qui porte les ombres sont la même direction ;
//  - éclairage par environnement : le ciel est « cuit » dans une carte d'environnement préfiltrée (PMREM) qui sert de
//    lumière ambiante et de reflets à tous les matériaux physiques (carrosseries, flaques, verre, métal) ;
//  - ombres : carte 4096² serrée sur le terrain, filtrage doux, biais normal pour éviter l'acné ;
//  - post-traitement (EffectComposer) : rendu HDR → occlusion ambiante (HBAO) → halo lumineux (bloom, seulement les
//    vraies hautes lumières : éclairs de bouche, traçantes, reflets du soleil) → étalonnage (contraste, saturation,
//    teinte chaude des hautes lumières et froide des ombres, vignettage, grain léger, aberration chromatique discrète)
//    → mappage tonal ACES et sRGB → anticrénelage SMAA.
// Paramètre d'URL ?fx=0 : rendu simple (sans post-traitement), pour les machines modestes et les tests rapides.
(function (root) {
  const T = window.THREE, X = window.THREEX || {};
  const SIMPLE = /[?&]fx=0\b/.test(location.search);
  // ---- étalonnage : un seul passage plein écran, en lumière linéaire (avant le mappage tonal) ----
  const GradeShader = {
    uniforms: {
      tDiffuse: { value: null }, time: { value: 0 }, resolution: { value: new T.Vector2(1, 1) },
      contrast: { value: 1.12 }, saturation: { value: 1.1 }, warm: { value: new T.Vector3(1.07, 1.0, 0.91) }, cool: { value: new T.Vector3(0.98, 1.0, 1.02) },
      vignette: { value: 0.32 }, grain: { value: 0.018 }, aberration: { value: 0.0012 }, exposure: { value: 1.0 },
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float time, contrast, saturation, vignette, grain, aberration, exposure; uniform vec2 resolution; uniform vec3 warm, cool;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec2 d = vUv - 0.5; float r2 = dot(d, d);
        // aberration chromatique : seulement vers les bords
        vec2 off = d * aberration * r2 * 4.0;
        vec3 c = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b) * exposure;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        // contraste autour d'un gris moyen en espace logarithmique (stable en HDR)
        vec3 lc = log2(max(c, 1e-5)); lc = (lc - log2(0.18)) * contrast + log2(0.18); c = exp2(lc);
        l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, saturation);
        // séparation des tons : ombres légèrement froides, hautes lumières légèrement chaudes
        float k = smoothstep(0.02, 0.6, l); c *= mix(cool, warm, k);
        // vignettage doux
        c *= mix(1.0, 1.0 - vignette, smoothstep(0.08, 0.55, r2));
        // grain de pellicule, plus visible dans les tons moyens
        float n = hash(vUv * resolution + fract(time) * 91.7) - 0.5; c += c * n * grain * (1.0 - k * 0.6);
        gl_FragColor = vec4(c, 1.0);
      }`,
  };
  // ---- nuages : dôme avec un bruit fractal qui défile lentement, éclairé côté soleil ----
  function cloudDome(sunDir) {
    const mat = new T.ShaderMaterial({
      uniforms: { time: { value: 0 }, sunDir: { value: sunDir.clone() }, cover: { value: 0.46 }, tint: { value: new T.Color(1, 1, 1) }, dark: { value: new T.Color(0.55, 0.6, 0.68) } },
      vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.99999; }',
      fragmentShader: `
        uniform float time, cover; uniform vec3 sunDir, tint, dark; varying vec3 vDir;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++) { s += a * n(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
        void main() {
          if (vDir.y < 0.02) discard;
          vec2 uv = vDir.xz / (vDir.y + 0.12) * 1.6 + vec2(time * 0.004, time * 0.0015);
          float f = fbm(uv), f2 = fbm(uv * 2.7 + 4.0);
          float d = smoothstep(cover, cover + 0.28, f * 0.75 + f2 * 0.35);
          float sunAmt = pow(max(dot(normalize(vDir), sunDir), 0.0), 6.0);
          vec3 col = mix(dark, tint, 0.55 + 0.45 * (1.0 - f2) ) + vec3(1.0, 0.85, 0.6) * sunAmt * 0.6;
          float horizon = smoothstep(0.02, 0.22, vDir.y);
          gl_FragColor = vec4(col * 1.25, d * horizon * 0.92);
        }`,
      transparent: true, depthWrite: false, side: T.BackSide, fog: false,
    });
    const m = new T.Mesh(new T.SphereGeometry(900, 48, 24), mat); m.frustumCulled = false; m.renderOrder = -1; return m;
  }
  // préréglages d'ambiance par condition : position du soleil, ciel, exposition, brouillard, intensité de l'environnement
  const AMB = {
    jour:       { elev: 23, azim: 238, turb: 5.5, ray: 1.6, mie: 0.006, g: 0.82, exp: 0.95, sun: [0xffcb94, 6.2], env: 0.7, fog: [0xc8c2b8, 0.0040], clouds: 0.45, cloudTint: 0xffeedd, cloudDark: 0x8d8f9a, bloom: [0.3, 0.55, 0.92] },   // fin d'après-midi : soleil bas et chaud, longues ombres
    nuit:       { elev: -12, azim: 215, turb: 2, ray: 0.3, mie: 0.002, g: 0.7, exp: 0.9, sun: [0x7d94d6, 0.55], env: 0.18, fog: [0x070a10, 0.016], clouds: 0.62, cloudTint: 0x2a3348, cloudDark: 0x0c1018, bloom: [0.6, 0.6, 0.55], night: true },
    brouillard: { elev: 18, azim: 215, turb: 12, ray: 2.5, mie: 0.02, g: 0.9, exp: 0.7, sun: [0xe8ecf0, 1.0], env: 0.75, fog: [0x9aa1a8, 0.03], clouds: 0.2, cloudTint: 0xdfe3e6, cloudDark: 0x9aa1a8, bloom: [0.25, 0.6, 0.95] },
    pluie:      { elev: 20, azim: 215, turb: 14, ray: 3, mie: 0.02, g: 0.85, exp: 0.7, sun: [0xc8d0dc, 0.9], env: 0.55, fog: [0x47505a, 0.013], clouds: 0.15, cloudTint: 0x6c7580, cloudDark: 0x2c323a, bloom: [0.35, 0.6, 0.9] },
  };
  function create(renderer, scene, camera, sun, hemi) {
    const R = { simple: SIMPLE, envIntensity: 1, amb: AMB.jour };
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    // ombres : serrées sur le terrain de jeu
    sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.00025; sun.shadow.normalBias = 0.025; sun.shadow.radius = 2.5;
    const sc = sun.shadow.camera; sc.left = -52; sc.right = 52; sc.top = 44; sc.bottom = -44; sc.near = 1; sc.far = 260; sc.updateProjectionMatrix();
    // ciel physique
    let sky = null, clouds = null; const sunDir = new T.Vector3();
    if (X.Sky) { sky = new X.Sky(); sky.scale.setScalar(4000); sky.material.depthWrite = false; sky.frustumCulled = false; scene.add(sky); }
    clouds = cloudDome(new T.Vector3(0, 1, 0)); scene.add(clouds);
    if (scene.userData.dome) scene.userData.dome.visible = false;
    const pmrem = new T.PMREMGenerator(renderer); let envRT = null;
    const skyScene = new T.Scene();
    function bakeEnv() {
      if (!sky) return;
      const s2 = new X.Sky(); s2.scale.setScalar(1000); s2.material.uniforms = T.UniformsUtils.clone(sky.material.uniforms); skyScene.clear(); skyScene.add(s2);
      // sol de l'environnement : un disque gris chaud sous l'horizon (renvoi de lumière du bitume)
      const g = new T.Mesh(new T.CircleGeometry(900, 32), new T.MeshBasicMaterial({ color: new T.Color(0x4a4640).multiplyScalar(R.amb.night ? 0.1 : 0.9) })); g.rotation.x = -Math.PI / 2; g.position.y = -5; skyScene.add(g);
      if (envRT) envRT.dispose(); envRT = pmrem.fromScene(skyScene, 0.02, 1, 1000); scene.environment = envRT.texture;
    }
    // intensité de l'environnement : appliquée à tous les matériaux physiques (three r159 n'a pas de réglage global)
    R.applyEnv = function (obj) {
      (obj || scene).traverse(o => { if (!o.material) return; for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m.isMeshStandardMaterial) { if (m.userData.envK === undefined) m.userData.envK = m.envMapIntensity === undefined ? 1 : m.envMapIntensity; m.envMapIntensity = m.userData.envK * R.envIntensity; } });
    };
    R.setConditions = function (id) {
      const A = R.amb = AMB[id] || AMB.jour;
      const phi = T.MathUtils.degToRad(90 - A.elev), theta = T.MathUtils.degToRad(A.azim);
      sunDir.setFromSphericalCoords(1, phi, theta);
      if (sky) { const u = sky.material.uniforms; u.turbidity.value = A.turb; u.rayleigh.value = A.ray; u.mieCoefficient.value = A.mie; u.mieDirectionalG.value = A.g; u.sunPosition.value.copy(sunDir); sky.visible = !A.night; }
      clouds.material.uniforms.sunDir.value.copy(sunDir); clouds.material.uniforms.cover.value = A.clouds; clouds.material.uniforms.tint.value.setHex(A.cloudTint); clouds.material.uniforms.dark.value.setHex(A.cloudDark);
      // le soleil (ou la lune) : même direction que le ciel, centré sur le terrain
      const c = R.center || new T.Vector3(36, 0, 23), dir = A.night ? new T.Vector3(-0.35, 0.8, 0.45).normalize() : sunDir;
      sun.position.copy(c).addScaledVector(dir, 120); sun.target.position.copy(c); sun.color.setHex(A.sun[0]); sun.intensity = A.sun[1];
      if (hemi) { hemi.intensity = A.night ? 0.25 : 0.45; }
      renderer.toneMappingExposure = A.exp;
      scene.fog = new T.FogExp2(A.fog[0], A.fog[1]);
      scene.background = A.night ? new T.Color(0x05070c) : null;
      R.envIntensity = A.env; bakeEnv(); R.applyEnv();
      if (R.bloom) { R.bloom.strength = A.bloom[0]; R.bloom.radius = A.bloom[1]; R.bloom.threshold = A.bloom[2]; }
    };
    R.setCenter = function (x, z) { R.center = new T.Vector3(x, 0, z); };
    // ---- chaîne de post-traitement ----
    let composer = null, hbao = null, grade = null, smaa = null;
    if (!SIMPLE && X.EffectComposer) {
      const size = renderer.getSize(new T.Vector2()), pr = renderer.getPixelRatio();
      composer = new X.EffectComposer(renderer);
      composer.addPass(new X.RenderPass(scene, camera));
      if (X.HBAOPass) {
        hbao = new X.HBAOPass(scene, camera, size.x, size.y);
        hbao.updateHbaoMaterial({ radius: 0.55, distanceExponent: 1.6, bias: 0.02, samples: 16 });
        hbao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 4, samples: 16 });
        composer.addPass(hbao);
      }
      R.bloom = new X.UnrealBloomPass(new T.Vector2(size.x, size.y), 0.32, 0.55, 0.92); composer.addPass(R.bloom);
      grade = new X.ShaderPass(GradeShader); composer.addPass(grade);
      composer.addPass(new X.OutputPass());
      if (X.SMAAPass) { smaa = new X.SMAAPass(size.x * pr, size.y * pr); composer.addPass(smaa); }
    }
    R.composer = composer; R.grade = grade;
    R.setSize = function (w, h) { if (composer) { composer.setSize(w, h); if (grade) grade.uniforms.resolution.value.set(w, h); } };
    let t0 = performance.now();
    R.render = function () {
      const t = (performance.now() - t0) / 1000;
      clouds.material.uniforms.time.value = t; clouds.position.copy(camera.position); if (sky) sky.position.copy(camera.position);
      if (composer) { grade.uniforms.time.value = t; composer.render(); } else renderer.render(scene, camera);
    };
    R.passes = () => composer ? composer.passes : [];
    R.setConditions('jour');
    return R;
  }
  root.Rendu = { create, SIMPLE, AMB };
})(window.OT = window.OT || {});
