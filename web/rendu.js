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
      vignette: { value: 0.32 }, grain: { value: 0.018 }, aberration: { value: 0.0005 }, exposure: { value: 1.0 },
      lift: { value: new T.Vector3(0, 0, 0) }, sharpen: { value: 0.35 },
      sunUV: { value: new T.Vector2(0.5, 0.5) }, rays: { value: 0 }, rayCol: { value: new T.Vector3(1.0, 0.82, 0.6) },
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float time, contrast, saturation, vignette, grain, aberration, exposure, sharpen, rays; uniform vec2 resolution, sunUV; uniform vec3 warm, cool, lift, rayCol;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      // lecture assainie : un seul pixel NaN (normale nulle, division par zéro) ne doit pas noircir tout l'écran
      vec3 fetch(vec2 uv) { vec3 t = texture2D(tDiffuse, uv).rgb; return any(isnan(t)) ? vec3(0.0) : min(t, vec3(64.0)); }   // NaN → noir ; infini (reflet du soleil hors plage du tampon 16 bits) → très clair, pas noir
      void main() {
        vec2 d = vUv - 0.5; float r2 = dot(d, d), px = 1.0 / resolution.x, py = 1.0 / resolution.y;
        // aberration chromatique : seulement vers les bords
        vec2 off = d * aberration * r2 * 4.0;
        vec3 base = fetch(vUv), c = vec3(fetch(vUv + off).r, base.g, fetch(vUv - off).b);
        // netteté adaptative (type CAS) : micro-contraste des textures, bornée par la luminance locale (pas de halo)
        vec3 nb = fetch(vUv + vec2(px, 0.0)) + fetch(vUv - vec2(px, 0.0)) + fetch(vUv + vec2(0.0, py)) + fetch(vUv - vec2(0.0, py));
        float lb = dot(base, vec3(0.2126, 0.7152, 0.0722)) + 0.01;
        c = max(c + clamp((base - nb * 0.25) * sharpen, vec3(-0.3 * lb), vec3(0.3 * lb)), vec3(0.0)) * exposure;
        // rayons de soleil (diffusion dans l'air) : les pixels très lumineux (ciel autour du soleil, entre les immeubles et
        // les feuillages) sont étirés depuis le soleil ; seulement quand le soleil est dans le champ ou juste à côté
        if (rays > 0.001) {
          vec2 dv = (sunUV - vUv) / 28.0; vec2 q = vUv + dv * hash(vUv * resolution + time) ; float acc = 0.0, w = 1.0;
          for (int i = 0; i < 28; i++) { vec3 s = fetch(q); acc += max(dot(s, vec3(0.2126, 0.7152, 0.0722)) - 2.5, 0.0) * w; w *= 0.95; q += dv; }
          float fall = 1.0 - smoothstep(0.0, 0.9, length((vUv - sunUV) * vec2(resolution.x / resolution.y, 1.0)));
          c += rayCol * min(acc / 28.0, 2.0) * rays * fall;
        }
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        // contraste autour d'un gris moyen en espace logarithmique (stable en HDR)
        vec3 lc = log2(max(c, 1e-5)); lc = (lc - log2(0.18)) * contrast + log2(0.18); c = exp2(lc);
        l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, saturation);
        c += lift;   // noirs légèrement relevés (lisibilité de nuit, aspect pellicule)
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
  // ---- ciel de nuit : dégradé (halo orangé de la ville à l'horizon), étoiles, lune et son halo ----
  function nightDome(moonDir) {
    const mat = new T.ShaderMaterial({
      uniforms: { moonDir: { value: moonDir.clone() } },
      vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.99999; }',
      fragmentShader: `
        uniform vec3 moonDir; varying vec3 vDir;
        float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        void main() {
          vec3 d = normalize(vDir); float up = max(d.y, 0.0);
          vec3 col = mix(vec3(0.028, 0.034, 0.052), vec3(0.004, 0.006, 0.014), pow(up, 0.45));
          col += vec3(0.055, 0.034, 0.018) * exp(-up * 9.0);   // pollution lumineuse de la ville
          vec3 g = d * 240.0, f = fract(g) - 0.5; float sd = h3(floor(g));
          float star = step(0.986, sd) * (1.0 - smoothstep(0.0, 0.22, length(f))) * smoothstep(0.06, 0.35, up);
          col += vec3(0.75, 0.82, 1.0) * star * (0.4 + 1.6 * fract(sd * 37.0));
          float m = max(dot(d, moonDir), 0.0);
          col += vec3(1.0, 0.97, 0.9) * smoothstep(0.99955, 0.9997, m) * 2.5 + vec3(0.22, 0.27, 0.4) * pow(m, 220.0) * 0.8 + vec3(0.03, 0.04, 0.07) * pow(m, 10.0);
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: T.BackSide, depthWrite: false, fog: false,
    });
    const m = new T.Mesh(new T.SphereGeometry(950, 32, 16), mat); m.frustumCulled = false; m.renderOrder = -2; m.visible = false; return m;
  }
  // préréglages d'ambiance par condition : position du soleil, ciel, exposition, brouillard, intensité de l'environnement
  const AMB = {
    // fin d'après-midi : soleil chaud assez haut pour éclairer franchement le sol (rapport lumière / ombre ≈ 4:1, comme une
    // vraie journée claire), ombres plus froides et plus denses, ciel moins laiteux, étalonnage « cinéma » (ombres sarcelle,
    // hautes lumières ambrées)
    jour:       { elev: 31, azim: 238, turb: 3.2, ray: 1.25, mie: 0.0028, g: 0.88, exp: 0.95, sun: [0xffcf9a, 8.2], env: 0.62, hemi: 0.22, cielTint: [2.7, 2.55, 2.3], rays: 0.25, fog: [0xbdb8ae, 0.0029], clouds: 0.5, cloudTint: 0xfff1e2, cloudDark: 0x8d8f9a, bloom: [0.22, 0.35, 0.95], grade: { c: 1.17, s: 1.12, warm: [1.1, 1.01, 0.88], cool: [0.92, 1.0, 1.07], vig: 0.3, grain: 0.012, lift: [0.0012, 0.0016, 0.0024] } },
    nuit:       { elev: -12, azim: 215, turb: 2, ray: 0.3, mie: 0.002, g: 0.7, exp: 1.1, sun: [0x7d94d6, 0.95], env: 0.22, hemi: 0.28, fog: [0x070a10, 0.016], clouds: 0.62, cloudTint: 0x2a3348, cloudDark: 0x0c1018, bloom: [0.32, 0.45, 0.95], night: true, grade: { c: 1.04, s: 0.9, warm: [1.08, 0.99, 0.86], cool: [0.88, 0.97, 1.14], vig: 0.4, grain: 0.03, lift: [0.0035, 0.005, 0.009] } },
    brouillard: { elev: 18, azim: 215, turb: 12, ray: 2.5, mie: 0.02, g: 0.9, exp: 0.8, sun: [0xe8ecf0, 1.0], env: 0.85, hemi: 0.85, fog: [0x9aa1a8, 0.03], clouds: 0.2, cloudTint: 0xdfe3e6, cloudDark: 0x9aa1a8, bloom: [0.25, 0.6, 0.95], grade: { c: 0.96, s: 0.84, warm: [1.03, 1.0, 0.96], cool: [0.97, 1.0, 1.03], vig: 0.24, grain: 0.02, lift: [0.006, 0.0065, 0.007] } },
    pluie:      { elev: 20, azim: 215, turb: 14, ray: 3, mie: 0.02, g: 0.85, exp: 0.88, sun: [0xc8d0dc, 1.25], env: 0.8, hemi: 0.85, fog: [0x47505a, 0.013], clouds: 0.15, cloudTint: 0x6c7580, cloudDark: 0x2c323a, bloom: [0.35, 0.6, 0.9], grade: { c: 1.08, s: 0.86, warm: [1.0, 1.0, 0.97], cool: [0.93, 0.99, 1.07], vig: 0.34, grain: 0.022, lift: [0.002, 0.0026, 0.0034] } },
  };
  function create(renderer, scene, camera, sun, hemi) {
    const R = { simple: SIMPLE, envIntensity: 1, amb: AMB.jour, lightDir: new T.Vector3(0, 1, 0), fitShadows: true };
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    // ombres : serrées sur le terrain de jeu
    sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.00025; sun.shadow.normalBias = 0.025; sun.shadow.radius = 2.5;
    const sc = sun.shadow.camera; sc.left = -52; sc.right = 52; sc.top = 44; sc.bottom = -44; sc.near = 1; sc.far = 260; sc.updateProjectionMatrix();
    // ciel physique
    let sky = null, clouds = null; const sunDir = new T.Vector3();
    if (X.Sky) { sky = new X.Sky(); sky.scale.setScalar(4000); sky.material.depthWrite = false; sky.frustumCulled = false; scene.add(sky); }
    clouds = cloudDome(new T.Vector3(0, 1, 0)); scene.add(clouds);
    const MOON = new T.Vector3(-0.42, 0.58, 0.7).normalize(), night = nightDome(MOON); scene.add(night);   // lune assez basse (≈ 39°) : elle éclaire les silhouettes plus que le sol
    if (scene.userData.dome) scene.userData.dome.visible = false;
    const pmrem = new T.PMREMGenerator(renderer); let envRT = null;
    const skyScene = new T.Scene();
    function bakeEnv() {
      if (!sky) return;
      skyScene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.isShaderMaterial && o.material.uniforms.tC) o.material.dispose(); }); const s2 = new X.Sky(); s2.scale.setScalar(1000); s2.material.uniforms = T.UniformsUtils.clone(sky.material.uniforms); skyScene.clear(); skyScene.add(s2);
      // sol de l'environnement : un disque gris chaud sous l'horizon (renvoi de lumière du bitume)
      const g = new T.Mesh(new T.CircleGeometry(900, 32), new T.MeshBasicMaterial({ color: new T.Color(0x4a4640).multiplyScalar(R.amb.night ? 0.1 : 0.9) })); g.rotation.x = -Math.PI / 2; g.position.y = -5; skyScene.add(g);
      // panorama de ville scanné (pbr.js) : les immeubles, le sol et les arbres du panorama se reflètent dans les carrosseries
      // et les vitres ; là où le panorama montre le ciel (blanc couvert), c'est notre ciel physique qui reste visible
      if (R.cielTex && !R.amb.night) {
        const t = R.amb.cielTint || [2.2, 2.2, 2.2];
        const pm = new T.ShaderMaterial({ uniforms: { tC: { value: R.cielTex }, tint: { value: new T.Vector3().fromArray(t) } }, side: T.BackSide, depthWrite: false, transparent: true,
          vertexShader: 'varying vec3 vD; void main() { vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
          fragmentShader: `uniform sampler2D tC; uniform vec3 tint; varying vec3 vD;
            void main() { vec3 d = normalize(vD); vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5);
              vec3 c = texture2D(tC, uv).rgb; float sky = smoothstep(0.82, 0.96, min(c.r, min(c.g, c.b))) * smoothstep(-0.02, 0.08, d.y);
              gl_FragColor = vec4(c * tint, 1.0 - sky); }` });
        const sp = new T.Mesh(new T.SphereGeometry(500, 48, 24), pm); sp.rotation.y = 1.2; skyScene.add(sp);
      }
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
      const c = R.center || new T.Vector3(36, 0, 23), dir = A.night ? MOON : sunDir;
      R.lightDir.copy(dir); night.visible = !!A.night;
      sun.position.copy(c).addScaledVector(dir, 120); sun.target.position.copy(c); sun.color.setHex(A.sun[0]); sun.intensity = A.sun[1];
      if (grade && A.grade) { const G = A.grade, u = grade.uniforms; u.contrast.value = G.c; u.saturation.value = G.s; u.warm.value.fromArray(G.warm); u.cool.value.fromArray(G.cool); u.vignette.value = G.vig; u.grain.value = G.grain; u.lift.value.fromArray(G.lift); }
      if (hemi) { hemi.intensity = A.hemi || (A.night ? 0.25 : 0.45); }   // ciel couvert (pluie, brouillard) : la lumière vient surtout du ciel
      renderer.toneMappingExposure = A.exp;
      scene.fog = new T.FogExp2(A.fog[0], A.fog[1]);
      scene.background = A.night ? new T.Color(0x05070c) : null;
      R.envIntensity = A.env; bakeEnv(); R.applyEnv();
      if (R.bloom) { R.bloom.strength = A.bloom[0]; R.bloom.radius = A.bloom[1]; R.bloom.threshold = A.bloom[2]; }
    };
    R.setCenter = function (x, z) { R.center = new T.Vector3(x, 0, z); };
    if (root.PBR) root.PBR.ciel((t) => { R.cielTex = t; bakeEnv(); R.applyEnv(); });
    // ---- chaîne de post-traitement ----
    let composer = null, hbao = null, grade = null, smaa = null;
    if (!SIMPLE && X.EffectComposer) {
      const size = renderer.getSize(new T.Vector2()), pr = renderer.getPixelRatio();
      composer = new X.EffectComposer(renderer);
      composer.addPass(new X.RenderPass(scene, camera));
      if (X.HBAOPass) {
        hbao = new X.HBAOPass(scene, camera, size.x, size.y);
        hbao.updateHbaoMaterial({ radius: 0.9, distanceExponent: 1.4, bias: 0.015, samples: 16 });   // assez large pour assombrir le dessous des voitures et le pied des murs
        hbao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 4, samples: 16 });
        composer.addPass(hbao);
      }
      R.bloom = new X.UnrealBloomPass(new T.Vector2(size.x, size.y), 0.32, 0.55, 0.92); composer.addPass(R.bloom);
      const hp = R.bloom.materialHighPassFilter;   // un seul pixel NaN / infini, étalé par le flou du halo, noircissait (ou blanchissait) tout l'écran
      if (hp) { hp.fragmentShader = hp.fragmentShader.replace('vec4 texel = texture2D( tDiffuse, vUv );', 'vec4 texel = texture2D( tDiffuse, vUv ); if (any(isnan(texel))) texel = vec4(0.0); texel = min(texel, vec4(40.0));'); hp.needsUpdate = true; }
      grade = new X.ShaderPass(GradeShader); composer.addPass(grade);
      composer.addPass(new X.OutputPass());
      if (X.SMAAPass) { smaa = new X.SMAAPass(size.x * pr, size.y * pr); composer.addPass(smaa); }
    }
    R.composer = composer; R.grade = grade;
    // réglage « Qualité » : en basse qualité, pas d'occlusion ambiante ni de rayons de soleil (les deux passes les plus chères)
    R.quality = 'haute';
    R.setQuality = function (q) { R.quality = q; if (hbao) hbao.enabled = q !== 'basse'; };
    R.setSize = function (w, h) { if (composer) { composer.setSize(w, h); if (grade) grade.uniforms.resolution.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio()); } };
    // ---- ombres ajustées à la vue : caméra près du sol → carte d'ombre resserrée autour de ce qu'elle regarde (2 à 3 fois
    // plus fine) ; vue haute → tout le terrain. Centre accroché au texel de la carte : pas de scintillement en mouvement.
    const SF = { ext: 0, fw: new T.Vector3(), f: new T.Vector3(), x: new T.Vector3(), y: new T.Vector3(), UP: new T.Vector3(0, 1, 0) };
    function fitShadow() {
      const c = R.center || new T.Vector3(36, 0, 23), h = camera.position.y;
      let ext = SF.ext;   // niveaux avec hystérésis : 18 m, 30 m, terrain entier (0)
      if (!R.fitShadows) ext = 0; else if (h < 4.5) ext = 18; else if (h > 5.5 && h < 11) ext = 30; else if (h > 12) ext = 0; else if (!ext) ext = 30;
      if (ext !== SF.ext) {
        SF.ext = ext;
        if (ext) { sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; } else { sc.left = -52; sc.right = 52; sc.top = 44; sc.bottom = -44; }
        sc.updateProjectionMatrix();
      }
      if (!ext) { sun.position.copy(c).addScaledVector(R.lightDir, 120); sun.target.position.copy(c); return; }
      camera.getWorldDirection(SF.fw); const fl = Math.hypot(SF.fw.x, SF.fw.z) || 1, ahead = ext * 0.62;
      const f = SF.f.set(camera.position.x + SF.fw.x / fl * ahead, 0, camera.position.z + SF.fw.z / fl * ahead);
      SF.x.crossVectors(SF.UP, R.lightDir).normalize(); SF.y.crossVectors(R.lightDir, SF.x);
      const texel = 2 * ext / sun.shadow.mapSize.x, a = f.dot(SF.x), b = f.dot(SF.y);
      f.addScaledVector(SF.x, Math.round(a / texel) * texel - a).addScaledVector(SF.y, Math.round(b / texel) * texel - b);
      sun.position.copy(f).addScaledVector(R.lightDir, 120); sun.target.position.copy(f); sun.target.updateMatrixWorld();
    }
    // position du soleil à l'écran pour les rayons (jour seulement ; nulle si le soleil est derrière la caméra)
    const SR = { p: new T.Vector3(), f: new T.Vector3() };
    function sunRays() {
      const u = grade.uniforms; if (R.amb.night || !R.amb.rays || R.quality === 'basse') { u.rays.value = 0; return; }
      camera.getWorldDirection(SR.f); const fac = SR.f.dot(R.lightDir); if (fac < 0.2) { u.rays.value = 0; return; }
      SR.p.copy(camera.position).addScaledVector(R.lightDir, 500).project(camera);
      u.sunUV.value.set(SR.p.x * 0.5 + 0.5, SR.p.y * 0.5 + 0.5); u.rays.value = R.amb.rays * T.MathUtils.smoothstep(fac, 0.2, 0.75);
    }
    let t0 = performance.now();
    R.render = function () {
      if (!renderer.domElement.width || !renderer.domElement.height) return;   // toile pas encore dimensionnée (page masquée) : rien à dessiner
      const t = (performance.now() - t0) / 1000;
      clouds.material.uniforms.time.value = t; clouds.position.copy(camera.position); night.position.copy(camera.position); if (sky) sky.position.copy(camera.position);
      fitShadow();
      if (composer) { grade.uniforms.time.value = t; sunRays(); composer.render(); } else renderer.render(scene, camera);
    };
    R.passes = () => composer ? composer.passes : [];
    R.setConditions('jour');
    return R;
  }
  root.Rendu = { create, SIMPLE, AMB };
})(window.OT = window.OT || {});
