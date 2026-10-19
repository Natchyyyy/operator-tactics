// Effets visuels de combat, rendus par lots (une poignée d'appels de dessin quel que soit le nombre de particules) :
//  - particules en billboards instanciés : additives (éclairs, étincelles, feu, traçantes), alpha (fumée, poussière, sang) ;
//    les étincelles et traçantes s'étirent dans le sens du mouvement ; couleurs HDR (> 1) pour que le halo (bloom) les prenne ;
//  - éclair de bouche : étoile face caméra + deux pétales le long du canon + volute de fumée + lumière ponctuelle (prise dans
//    une réserve de lumières fixes : ajouter/retirer des lumières forcerait la recompilation des matériaux) ;
//  - douilles éjectées : petits cylindres de laiton (InstancedMesh) qui rebondissent et roulent au sol ;
//  - impacts : selon la matière (étincelles sur le métal, éclats et poussière sur le béton, échardes sur le bois, gerbe de
//    poussière au sol) + impact de balle décalqué sur la surface (au sol ou sur la face de l'obstacle touchée) ;
//  - sang : brume et gouttes, flaque au sol ; explosions : boule de feu, onde de choc, éclats, débris, colonne de fumée,
//    brûlure au sol ; grenade incapacitante : éclair blanc aveuglant et fumée claire.
(function (root) {
  const T = window.THREE;
  // ---- textures procédurales
  function canvasTex(size, draw) { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size); const t = new T.CanvasTexture(c); t.colorSpace = T.NoColorSpace; return t; }
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // atlas 4×4 (512 px) : 0 disque doux, 1 étoile d'éclair, 2 pétale d'éclair, 3 étincelle, 4–7 fumées, 8–11 feux, 12 éclat, 13 goutte, 14 anneau
  const ATLAS = canvasTex(1024, (g, S) => {
    const C = S / 4, R = rng(5);
    const cell = (i, f) => { g.save(); g.translate((i % 4) * C, Math.floor(i / 4) * C); g.beginPath(); g.rect(0, 0, C, C); g.clip(); f(C); g.restore(); };
    const radial = (c, stops) => { const gr = g.createRadialGradient(c / 2, c / 2, 0, c / 2, c / 2, c / 2); for (const [k, col] of stops) gr.addColorStop(k, col); g.fillStyle = gr; g.fillRect(0, 0, c, c); };
    cell(0, (c) => radial(c, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]));
    cell(1, (c) => { radial(c, [[0, 'rgba(255,255,255,1)'], [0.18, 'rgba(255,255,255,0.8)'], [0.5, 'rgba(255,255,255,0.08)'], [1, 'rgba(255,255,255,0)']]); g.translate(c / 2, c / 2); for (let k = 0; k < 9; k++) { g.rotate(Math.PI * 2 / 9 + R() * 0.3); const L = c * (0.28 + R() * 0.2); const gr = g.createLinearGradient(0, 0, L, 0); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(0, -c * 0.03); g.lineTo(L, 0); g.lineTo(0, c * 0.03); g.fill(); } });
    cell(2, (c) => { const gr = g.createRadialGradient(c / 2, c * 0.85, 0, c / 2, c * 0.6, c * 0.55); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(c / 2, c * 0.55, c * 0.22, c * 0.45, 0, 0, 7); g.fill(); });
    cell(3, (c) => { const gr = g.createLinearGradient(0, c / 2, c, c / 2); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0.2)'); g.fillStyle = gr; g.fillRect(0, c * 0.44, c, c * 0.12); });
    for (let v = 0; v < 4; v++) cell(4 + v, (c) => { for (let k = 0; k < 26; k++) { const x = c * (0.3 + R() * 0.4), y = c * (0.3 + R() * 0.4), r = c * (0.12 + R() * 0.2); const gr = g.createRadialGradient(x, y, 0, x, y, r); const a = 0.12 + R() * 0.16; gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, c, c); } });
    for (let v = 0; v < 4; v++) cell(8 + v, (c) => { for (let k = 0; k < 18; k++) { const x = c * (0.25 + R() * 0.5), y = c * (0.3 + R() * 0.45), r = c * (0.08 + R() * 0.2); const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${0.4 + R() * 0.4})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, c, c); } });
    cell(12, (c) => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(c * 0.3, c * 0.2); g.lineTo(c * 0.8, c * 0.35); g.lineTo(c * 0.65, c * 0.8); g.lineTo(c * 0.2, c * 0.6); g.closePath(); g.fill(); });
    cell(13, (c) => radial(c, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.9)'], [0.7, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,0)']]));
    cell(14, (c) => radial(c, [[0, 'rgba(255,255,255,0)'], [0.72, 'rgba(255,255,255,0)'], [0.86, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]));
    // 15 : langue de flamme le long de u (base à gauche, pointe à droite), bords irréguliers : éclair de bouche vu de profil
    cell(15, (c) => { for (let k = 0; k < 40; k++) { const t = k / 39, x = c * (0.07 + 0.86 * t), y = c * (0.5 + (R() - 0.5) * 0.06 * t), r = c * (0.035 + 0.17 * Math.pow(1 - t, 0.8)) * (0.8 + R() * 0.4); const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${0.32 * Math.pow(1 - t, 1.3) + 0.03})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, c, c); } });
  });
  ATLAS.generateMipmaps = true; ATLAS.minFilter = T.LinearMipmapLinearFilter;
  // ---- réserve de particules en billboards instanciés
  function Pool(N, blending, lit) {
    const base = new T.PlaneGeometry(1, 1), geo = new T.InstancedBufferGeometry();
    geo.index = base.index; geo.attributes.position = base.attributes.position; geo.attributes.uv = base.attributes.uv;
    const A = { p: new Float32Array(N * 3), s: new Float32Array(N * 2), c: new Float32Array(N * 4), ax: new Float32Array(N * 3), f: new Float32Array(N * 2) };
    geo.setAttribute('iPos', new T.InstancedBufferAttribute(A.p, 3).setUsage(T.DynamicDrawUsage));
    geo.setAttribute('iSize', new T.InstancedBufferAttribute(A.s, 2).setUsage(T.DynamicDrawUsage));   // taille, rotation
    geo.setAttribute('iCol', new T.InstancedBufferAttribute(A.c, 4).setUsage(T.DynamicDrawUsage));
    geo.setAttribute('iAxis', new T.InstancedBufferAttribute(A.ax, 3).setUsage(T.DynamicDrawUsage)); // étirement (monde)
    geo.setAttribute('iFrame', new T.InstancedBufferAttribute(A.f, 2).setUsage(T.DynamicDrawUsage)); // case d'atlas, douceur
    geo.instanceCount = 0;
    const mat = new T.ShaderMaterial({
      uniforms: { tAtlas: { value: ATLAS }, uLight: { value: new T.Color(1, 1, 1) }, fogColor: { value: new T.Color() }, fogDensity: { value: 0 } },
      vertexShader: `
        attribute vec3 iPos, iAxis; attribute vec2 iSize, iFrame; attribute vec4 iCol;
        varying vec2 vUv; varying vec4 vCol; varying float vFog; varying float vSoft;
        void main() {
          vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 wp;
          float L = length(iAxis);
          if (L > 1e-4) {   // étiré le long d'un axe (traçante, étincelle) : largeur perpendiculaire à la vue
            vec3 ax = iAxis / L, toCam = normalize(cameraPosition - iPos), side = cross(ax, toCam); float sl = length(side);
            side = sl > 1e-3 ? side / sl : camR;   // axe pointé vers la caméra : pas de normale nulle (NaN)
            wp = iPos + ax * position.x * L + side * position.y * iSize.x;
          } else {
            float c = cos(iSize.y), s = sin(iSize.y); vec2 q = vec2(c * position.x - s * position.y, s * position.x + c * position.y) * iSize.x;
            wp = iPos + camR * q.x + camU * q.y;
          }
          float fr = iFrame.x; vUv = (vec2(mod(fr, 4.0), 3.0 - floor(fr / 4.0)) + uv) / 4.0; vCol = iCol; vSoft = (fr >= 4.0 && fr < 12.0) ? wp.y : 99.0;   // fumée : fondu au ras du sol (pas d'arête nette)
          vec4 mv = viewMatrix * vec4(wp, 1.0); gl_Position = projectionMatrix * mv; vFog = -mv.z;
        }`,
      fragmentShader: `
        uniform sampler2D tAtlas; uniform vec3 uLight, fogColor; uniform float fogDensity; varying vec2 vUv; varying vec4 vCol; varying float vFog; varying float vSoft;
        void main() {
          vec4 t = texture2D(tAtlas, vUv); float a = t.a * vCol.a * smoothstep(0.0, 0.5, vSoft); if (a < 0.003) discard;
          float fog = 1.0 - exp(-fogDensity * fogDensity * vFog * vFog);
          ${lit ? 'vec3 col = vCol.rgb * uLight; col = mix(col, fogColor, fog); gl_FragColor = vec4(col, a);' : 'gl_FragColor = vec4(vCol.rgb * a * (1.0 - fog), a);'}
        }`,
      transparent: true, depthWrite: false, blending, premultipliedAlpha: !lit,
    });
    if (!lit) { mat.blending = T.CustomBlending; mat.blendSrc = T.OneFactor; mat.blendDst = T.OneFactor; mat.blendEquation = T.AddEquation; }
    const mesh = new T.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = lit ? 5 : 6;
    const parts = [];   // { p, v, life, age, size, grow, rot, spin, col, a0, fade, frame, drag, grav, stretch, axis }
    return {
      mesh, parts, N, A, geo, mat,
      add(o) { if (parts.length >= N) parts.shift(); parts.push(Object.assign({ fresh: true, v: new T.Vector3(), age: 0, life: 1, size: 0.3, grow: 0, rot: 0, spin: 0, col: [1, 1, 1], a0: 1, frame: 0, drag: 0, grav: 0, stretch: 0, delay: 0 }, o)); },
      update(dt) {
        let n = 0;
        for (let i = parts.length - 1; i >= 0; i--) {
          const q = parts[i];
          if (q.delay > 0) { q.delay -= dt; continue; }
          if (q.fresh) { q.fresh = false; continue; }   // toujours au moins une image affichée, même à faible cadence
          q.age += dt; if (q.age >= q.life) { parts.splice(i, 1); continue; }
          q.v.y -= q.grav * dt; if (q.drag) q.v.multiplyScalar(Math.max(0, 1 - q.drag * dt)); q.p.addScaledVector(q.v, dt);
          if (q.floor !== undefined && q.p.y < q.floor) { q.p.y = q.floor; q.v.y *= -0.25; q.v.x *= 0.5; q.v.z *= 0.5; }
          q.rot += q.spin * dt;
        }
        for (const q of parts) {
          if (q.delay > 0) continue;
          const k = q.age / q.life, fadeIn = q.fadeIn ? Math.min(1, q.age / q.fadeIn) : 1, a = q.a0 * fadeIn * (q.fadePow ? Math.pow(1 - k, q.fadePow) : 1 - k);
          A.p[n * 3] = q.p.x; A.p[n * 3 + 1] = q.p.y; A.p[n * 3 + 2] = q.p.z;
          const cs = q.size * (1 + q.grow * k); A.s[n * 2] = cs; A.s[n * 2 + 1] = q.rot;
          const cc = q.col2 ? [q.col[0] + (q.col2[0] - q.col[0]) * k, q.col[1] + (q.col2[1] - q.col[1]) * k, q.col[2] + (q.col2[2] - q.col[2]) * k] : q.col;
          A.c[n * 4] = cc[0]; A.c[n * 4 + 1] = cc[1]; A.c[n * 4 + 2] = cc[2]; A.c[n * 4 + 3] = Math.max(0, a);
          if (q.axis) { A.ax[n * 3] = q.axis.x; A.ax[n * 3 + 1] = q.axis.y; A.ax[n * 3 + 2] = q.axis.z; }
          else if (q.stretch) { const sp = q.v.length(); const L = Math.max(cs, sp * q.stretch); /* taille courante : une bouffée qui ralentit s'arrondit au lieu de s'aplatir */ A.ax[n * 3] = q.v.x / (sp || 1) * L; A.ax[n * 3 + 1] = q.v.y / (sp || 1) * L; A.ax[n * 3 + 2] = q.v.z / (sp || 1) * L; }
          else { A.ax[n * 3] = A.ax[n * 3 + 1] = A.ax[n * 3 + 2] = 0; }
          A.f[n * 2] = q.frame; n++;
        }
        geo.instanceCount = n;
        for (const k of ['iPos', 'iSize', 'iCol', 'iAxis', 'iFrame']) geo.attributes[k].needsUpdate = true;
      },
    };
  }
  // ---- ronds de pluie au sol : anneaux plats qui s'élargissent, réapparus au hasard autour de ce que regarde la caméra
  // (un seul appel de dessin ; le sol des obstacles les cache naturellement)
  function Ripples(N) {
    const base = new T.PlaneGeometry(1, 1); base.rotateX(-Math.PI / 2);
    const geo = new T.InstancedBufferGeometry(); geo.index = base.index; geo.attributes.position = base.attributes.position;
    const A = new Float32Array(N * 4); for (let i = 0; i < N; i++) A[i * 4 + 2] = -99;   // x, z, naissance, taille
    geo.setAttribute('iR', new T.InstancedBufferAttribute(A, 4).setUsage(T.DynamicDrawUsage)); geo.instanceCount = N;
    const mat = new T.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uLife: { value: 0.6 }, uCol: { value: new T.Color(0.62, 0.68, 0.74) }, fogColor: { value: new T.Color() }, fogDensity: { value: 0 } },
      vertexShader: `
        attribute vec4 iR; uniform float uTime, uLife; varying vec2 vQ; varying float vAge, vFog;
        void main() {
          vAge = (uTime - iR.z) / uLife; vQ = position.xz * 2.0;
          vec3 wp = vec3(iR.x + position.x * iR.w, 0.012, iR.y + position.z * iR.w);
          vec4 mv = viewMatrix * vec4(wp, 1.0); gl_Position = projectionMatrix * mv; vFog = -mv.z;
          if (vAge < 0.0 || vAge > 1.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);   // hors de vie : hors écran
        }`,
      fragmentShader: `
        uniform vec3 uCol, fogColor; uniform float fogDensity; varying vec2 vQ; varying float vAge, vFog;
        void main() {
          float r = length(vQ), w = 0.07 + 0.05 * vAge;
          float ring = smoothstep(w, 0.0, abs(r - vAge * 0.92)) + 0.45 * smoothstep(w, 0.0, abs(r - vAge * 0.55));
          float a = ring * pow(1.0 - vAge, 1.6) * 0.42 * (1.0 - step(1.0, r));
          float fog = 1.0 - exp(-fogDensity * fogDensity * vFog * vFog); a *= 1.0 - fog;
          if (a < 0.004) discard;
          gl_FragColor = vec4(uCol, a);
        }`,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3,
    });
    const mesh = new T.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 3; mesh.visible = false;
    let t = 0; const fw = new T.Vector3();
    return {
      mesh, mat,
      update(dt, cam) {
        if (!mesh.visible) return; t += dt; mat.uniforms.uTime.value = t;
        let cx = 0, cz = 0, R = 16;
        if (cam) { cam.getWorldDirection(fw); const h = Math.max(1, cam.position.y), fl = Math.hypot(fw.x, fw.z) || 1, ahead = Math.min(18, h * 1.6 + 4); cx = cam.position.x + fw.x / fl * ahead; cz = cam.position.z + fw.z / fl * ahead; R = Math.min(26, 8 + h * 0.9); }
        const life = mat.uniforms.uLife.value; let ch = false;
        for (let i = 0; i < N; i++) {
          if (t - A[i * 4 + 2] < life) continue;
          const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * R;
          A[i * 4] = cx + Math.cos(a) * d; A[i * 4 + 1] = cz + Math.sin(a) * d; A[i * 4 + 2] = t + Math.random() * life * 0.5; A[i * 4 + 3] = 0.16 + Math.random() * 0.16; ch = true;
        }
        if (ch) geo.attributes.iR.needsUpdate = true;
      },
    };
  }
  // ---- objets physiques instanciés (douilles, débris)
  function Bodies(N, geo, mat) {
    const mesh = new T.InstancedMesh(geo, mat, N); mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); mesh.count = 0; mesh.castShadow = true; mesh.frustumCulled = false;
    const list = [], m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), sc = new T.Vector3(1, 1, 1);
    return {
      mesh, list,
      add(o) { if (list.length >= N) list.shift(); list.push(Object.assign({ age: 0, life: 12, rest: false, rx: 0, ry: 0, rz: 0, wx: 0, wy: 0, wz: 0, s: 1 }, o)); },
      update(dt, onBounce) {
        for (let i = list.length - 1; i >= 0; i--) {
          const b = list[i]; b.age += dt; if (b.age > b.life) { list.splice(i, 1); continue; }
          if (!b.rest) {
            b.v.y -= 9.8 * dt; b.p.addScaledVector(b.v, dt); b.rx += b.wx * dt; b.ry += b.wy * dt; b.rz += b.wz * dt;
            if (b.p.y < b.r) {
              b.p.y = b.r; if (Math.abs(b.v.y) > 0.6 && onBounce) onBounce(b);
              b.v.y = -b.v.y * 0.32; b.v.x *= 0.55; b.v.z *= 0.55; b.wx *= 0.5; b.wz *= 0.5; b.wy *= 0.7;
              if (Math.abs(b.v.y) < 0.25 && Math.hypot(b.v.x, b.v.z) < 0.15) { b.rest = true; b.rx = Math.PI / 2; b.rz = 0; }   // couchée au sol
            }
          }
        }
        let n = 0;
        for (const b of list) { e.set(b.rx, b.ry, b.rz); q.setFromEuler(e); const sink = b.age > b.life - 1 ? (b.age - (b.life - 1)) * b.r * 2 : 0; sc.setScalar(b.s); m4.compose(b.p.clone().setY(b.p.y - sink), q, sc); mesh.setMatrixAt(n++, m4); }
        mesh.count = n; mesh.instanceMatrix.needsUpdate = true;
      },
    };
  }
  // ---- décalques (impacts, sang, brûlures) : plans orientés, anneau tournant
  function Decals(N, tex, opts) {
    const mat = new T.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: opts.rough || 0.9, color: opts.color || 0xffffff, metalness: 0 });
    const mesh = new T.InstancedMesh(new T.PlaneGeometry(1, 1), mat, N); mesh.count = 0; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.renderOrder = 2;
    let k = 0; const m4 = new T.Matrix4(), q = new T.Quaternion(), Z = new T.Vector3(0, 0, 1);
    return { mesh, add(p, n, size, rot) { q.setFromUnitVectors(Z, n); q.multiply(new T.Quaternion().setFromAxisAngle(Z, rot || Math.random() * 6.28)); m4.compose(p.clone().addScaledVector(n, 0.004), q, new T.Vector3(size, size, size)); mesh.setMatrixAt(k, m4); k = (k + 1) % N; mesh.count = Math.min(N, mesh.count + 1); mesh.instanceMatrix.needsUpdate = true; }, clear() { mesh.count = 0; k = 0; } };
  }
  const holeTex = (() => { const t = canvasTex(128, (g, S) => {
    const R = rng(9); g.clearRect(0, 0, S, S);
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); gr.addColorStop(0, 'rgba(10,9,8,1)'); gr.addColorStop(0.18, 'rgba(25,22,20,0.95)'); gr.addColorStop(0.32, 'rgba(70,64,58,0.55)'); gr.addColorStop(0.6, 'rgba(90,84,76,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(20,18,16,0.6)'; g.lineWidth = 1.2; for (let k = 0; k < 7; k++) { const a = R() * 6.28, L = S * (0.15 + R() * 0.25); g.beginPath(); g.moveTo(S / 2 + Math.cos(a) * S * 0.08, S / 2 + Math.sin(a) * S * 0.08); g.lineTo(S / 2 + Math.cos(a + 0.2) * L, S / 2 + Math.sin(a + 0.2) * L); g.stroke(); }
  }); t.colorSpace = T.SRGBColorSpace; return t; })();
  const bloodTex = (() => { const t = canvasTex(256, (g, S) => { const R = rng(13); for (let k = 0; k < 30; k++) { const x = S / 2 + (R() - 0.5) * S * 0.5, y = S / 2 + (R() - 0.5) * S * 0.5, r = S * (0.04 + R() * 0.16); const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(70,6,6,0.95)'); gr.addColorStop(0.7, 'rgba(60,4,4,0.8)'); gr.addColorStop(1, 'rgba(50,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); } }); t.colorSpace = T.SRGBColorSpace; return t; })();
  const scorchTex = (() => { const t = canvasTex(256, (g, S) => { const R = rng(17); const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); gr.addColorStop(0, 'rgba(8,7,6,0.95)'); gr.addColorStop(0.45, 'rgba(15,13,11,0.75)'); gr.addColorStop(1, 'rgba(20,18,15,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S); g.strokeStyle = 'rgba(5,5,5,0.5)'; for (let k = 0; k < 24; k++) { const a = R() * 6.28, L = S * (0.25 + R() * 0.25); g.lineWidth = 1 + R() * 3; g.beginPath(); g.moveTo(S / 2, S / 2); g.lineTo(S / 2 + Math.cos(a) * L, S / 2 + Math.sin(a) * L); g.stroke(); } }); t.colorSpace = T.SRGBColorSpace; return t; })();
  // ---- assemblage
  function create(scene) {
    const add = new Pool(2400, T.AdditiveBlending, false), alpha = new Pool(1600, T.NormalBlending, true);
    scene.add(alpha.mesh); scene.add(add.mesh);
    const brass = new T.MeshStandardMaterial({ color: 0xc9a24a, metalness: 1, roughness: 0.28 });
    const casings = Bodies(400, new T.CylinderGeometry(0.0048, 0.0048, 0.045, 7), brass); scene.add(casings.mesh);
    const debris = Bodies(300, new T.DodecahedronGeometry(0.04, 0), new T.MeshStandardMaterial({ color: 0x6b6660, roughness: 0.95 })); scene.add(debris.mesh);
    const holes = Decals(500, holeTex, {}), blood = Decals(120, bloodTex, { rough: 0.3 }), scorch = Decals(40, scorchTex, {});
    scene.add(holes.mesh); scene.add(blood.mesh); scene.add(scorch.mesh);
    const ripples = Ripples(700); scene.add(ripples.mesh);
    // réserve de lumières : toujours dans la scène, éteintes
    const lights = []; for (let i = 0; i < 6; i++) { const l = new T.PointLight(0xffb469, 0, 9, 2); l.position.set(0, -50, 0); scene.add(l); lights.push({ l, until: 0, i0: 0, dur: 0.05 }); }
    let li = 0, now = 0;
    const light = (p, color, inten, dist, dur) => { const L = lights[li]; li = (li + 1) % lights.length; L.l.position.copy(p); L.l.color.setHex(color); L.l.distance = dist; L.i0 = inten; L.l.intensity = inten; L.until = now + dur; L.dur = dur; L.fresh = true; };
    const V = (x, y, z) => new T.Vector3(x, y, z), rnd = (a, b) => a + Math.random() * (b - a);
    const basis = (d) => { const u = new T.Vector3().crossVectors(d, Math.abs(d.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0)).normalize(); return [u, new T.Vector3().crossVectors(d, u)]; };
    const E = { casings, holes, blood, scorch, debris, pools: { add, alpha }, sound: null };
    // éclair de bouche : origine p, direction d (unitaire)
    E.muzzle = function (p, d, silenced) {
      if (silenced) { alpha.add({ p: p.clone(), v: d.clone().multiplyScalar(0.6).add(V(0, 0.3, 0)), life: 0.6, size: 0.08, grow: 3, frame: 4 + Math.floor(Math.random() * 4), col: [0.7, 0.7, 0.7], a0: 0.25, drag: 2 }); return; }
      // chaque coup est différent (taille, pétales) ; cœur court et pas trop gros (le halo l'élargit déjà), flamme vers l'avant
      // (langue étirée le long du canon, visible de profil), trois pétales du cache-flamme en étoile (visibles de face)
      const k = rnd(0.75, 1.25), hot = [5.2, 3.3, 1.35], o = p.clone().addScaledVector(d, 0.02);
      add.add({ p: o.clone(), life: 0.04, size: rnd(0.07, 0.1) * k, rot: Math.random() * 6.28, frame: 1, col: [4, 2.9, 1.5], a0: 1 });
      const L = rnd(0.2, 0.34) * k;
      add.add({ p: o.clone().addScaledVector(d, L * 0.5), axis: d.clone().multiplyScalar(L), life: 0.04, size: 0.2 * k, frame: 15, col: hot, a0: 1 });
      const [bu, bw] = basis(d), a0 = Math.random() * 6.28;
      for (let i = 0; i < 3; i++) {
        if (Math.random() < 0.2) continue;
        const a = a0 + i * 2.094 + rnd(-0.3, 0.3), s = d.clone().multiplyScalar(0.6).addScaledVector(bu, Math.cos(a)).addScaledVector(bw, Math.sin(a)).normalize(), l = rnd(0.06, 0.11) * k;
        add.add({ p: o.clone().addScaledVector(s, l * 0.5), axis: s.multiplyScalar(l), life: 0.035, size: 0.075 * k, frame: 15, col: hot, a0: 0.85 });
      }
      for (let i = 0; i < 3; i++) add.add({ p: p.clone(), v: d.clone().multiplyScalar(rnd(6, 14)).add(V(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1))), life: rnd(0.05, 0.12), size: 0.01, stretch: 0.012, frame: 3, col: [8, 5, 2], a0: 1 });
      // fumée de poudre : une bouffée chassée vers l'avant, une autre qui traîne et monte
      alpha.add({ p: p.clone().addScaledVector(d, 0.12), v: d.clone().multiplyScalar(rnd(1.6, 2.6)).add(V(0, 0.25, 0)), life: rnd(0.5, 0.8), size: 0.07, grow: 5, frame: 4 + Math.floor(Math.random() * 4), col: [0.62, 0.6, 0.58], a0: 0.2, drag: 4.5, fadeIn: 0.03, fadePow: 1.4, rot: Math.random() * 6, spin: rnd(-1, 1) });
      alpha.add({ p: p.clone().addScaledVector(d, 0.05), v: d.clone().multiplyScalar(0.3).add(V(rnd(-0.1, 0.1), 0.3, rnd(-0.1, 0.1))), life: rnd(1.0, 1.6), size: 0.06, grow: 6, frame: 4 + Math.floor(Math.random() * 4), col: [0.6, 0.59, 0.57], a0: 0.14, drag: 1.5, fadeIn: 0.08, rot: Math.random() * 6, spin: rnd(-0.6, 0.6) });
      light(p.clone().addScaledVector(d, 0.2), 0xffb26b, rnd(7, 11) * k, 7, 0.05);
    };
    // traçante : de a à b, vitesse (m/s), part après « delay »
    E.tracer = function (a, b, speed, team) {
      const d = b.clone().sub(a), L = d.length(); if (L < 0.5) return; const dir = d.multiplyScalar(1 / L), seg = Math.min(L, 3.2);
      const col = team === 0 ? [7, 5.4, 3.2] : [8, 4.2, 2.2];
      add.add({ p: a.clone().addScaledVector(dir, seg / 2), v: dir.clone().multiplyScalar(speed), axis: dir.clone().multiplyScalar(seg), life: Math.max(0.03, (L - seg) / speed), size: 0.018, frame: 0, col, a0: 0.95 });
    };
    // matière d'un obstacle (nom) → famille d'impact
    E.impact = function (p, n, matter, delay) {
      delay = delay || 0; const up = n.y > 0.7, P = p.clone();
      // briques : éclair (petite étoile brève, pas une boule), étincelles, éclats, jet de poussière (rapide, étiré, freiné net)
      // puis nuage qui s'arrondit et traîne
      const flash = (s, col) => add.add({ p: P.clone().addScaledVector(n, 0.02), life: 0.03, size: s, rot: Math.random() * 6.28, frame: 1, col, a0: 1, delay });   // (bref et petit : de jour, une boule lumineuse qui reste au pied d'un mur se lit comme un objet)
      const sparks = (N, sp, life, col) => { for (let k = 0; k < N; k++) add.add({ p: P.clone(), v: n.clone().multiplyScalar(rnd(0.3, 1) * sp).add(V(rnd(-1, 1), rnd(-0.2, 1), rnd(-1, 1)).multiplyScalar(sp * 0.55)), life: rnd(life * 0.4, life), size: 0.01, stretch: 0.02, frame: 3, col, grav: 9.8, delay, floor: 0.01 }); };
      const chips = (N, col, sp, a0) => { for (let k = 0; k < N; k++) alpha.add({ p: P.clone(), v: n.clone().multiplyScalar(rnd(0.4, 1) * sp).add(V(rnd(-1, 1), rnd(0.2, 1.2), rnd(-1, 1)).multiplyScalar(sp * 0.45)), life: rnd(0.35, 0.8), size: rnd(0.01, 0.024), frame: 12, col, a0: a0 || 1, grav: 9.8, delay, floor: 0.01, rot: Math.random() * 6, spin: rnd(-14, 14) }); };
      const jet = (N, col, a0, sp) => { for (let k = 0; k < N; k++) alpha.add({ p: P.clone().addScaledVector(n, 0.03), v: n.clone().multiplyScalar(rnd(0.6, 1) * sp).add(V(rnd(-1, 1), rnd(-0.2, 1), rnd(-1, 1)).multiplyScalar(sp * 0.2)), life: rnd(0.4, 0.7), size: rnd(0.04, 0.06), grow: 5, stretch: 0.05, frame: 4 + Math.floor(Math.random() * 4), col, a0, drag: 7, delay, fadePow: 1.3, rot: Math.random() * 6 }); };
      const puff = (N, col, a0, sz, life, sp) => { for (let k = 0; k < N; k++) alpha.add({ p: P.clone().addScaledVector(n, 0.05), v: n.clone().multiplyScalar(rnd(0.3, 1) * sp).add(V(rnd(-0.3, 0.3), rnd(0, 0.35), rnd(-0.3, 0.3))), life: rnd(life * 0.6, life), size: rnd(sz * 0.7, sz), grow: rnd(3, 5), frame: 4 + Math.floor(Math.random() * 4), col, a0, drag: 3, delay, fadeIn: 0.03, fadePow: 1.5, rot: Math.random() * 6, spin: rnd(-0.6, 0.6) }); };
      let hole = up ? rnd(0.07, 0.11) : rnd(0.06, 0.09);
      if (matter === 'impact_metal') {
        flash(0.07, [5, 3.4, 1.8]); sparks(10, 6, 0.4, [10, 6, 2]); puff(1, [0.45, 0.44, 0.42], 0.25, 0.07, 0.8, 0.6); hole = rnd(0.04, 0.06);
      } else if (matter === 'impact_carrosserie') {   // tôle peinte : quelques étincelles, éclats de peinture, peu de poussière
        flash(0.055, [4, 3, 1.6]); sparks(5, 4.5, 0.28, [9, 5.5, 2]); chips(4, [0.3, 0.3, 0.32], 2.5); puff(2, [0.5, 0.5, 0.5], 0.26, 0.06, 0.9, 0.6); hole = rnd(0.035, 0.05);
      } else if (matter === 'impact_verre') {   // vitre : pluie d'éclats clairs qui scintillent, pas d'étincelle
        flash(0.04, [2.4, 2.6, 2.8]); chips(12, [1.15, 1.25, 1.35], 2.4, 0.85);
        for (let k = 0; k < 6; k++) add.add({ p: P.clone(), v: n.clone().multiplyScalar(rnd(0.5, 2)).add(V(rnd(-1, 1), rnd(0, 1.2), rnd(-1, 1))), life: rnd(0.25, 0.55), size: 0.008, stretch: 0.01, frame: 3, col: [2.2, 2.4, 2.6], grav: 9.8, delay, floor: 0.01 });
        puff(1, [0.75, 0.78, 0.8], 0.2, 0.06, 0.6, 0.5); hole = 0;
      } else if (matter === 'impact_sol' && E.wet) {   // sol détrempé : gerbe d'eau, pas de poussière
        for (let k = 0; k < 10; k++) alpha.add({ p: P.clone().addScaledVector(n, 0.02), v: V(rnd(-0.8, 0.8), rnd(1.5, 3.5), rnd(-0.8, 0.8)), life: rnd(0.3, 0.55), size: rnd(0.012, 0.022), stretch: 0.012, frame: 13, col: [0.72, 0.77, 0.82], a0: 0.8, grav: 9.8, delay, floor: 0.01 });
        puff(2, [0.68, 0.72, 0.76], 0.22, 0.08, 0.6, 0.6); chips(3, [0.12, 0.12, 0.12], 2.5);
      } else {
        const dusty = matter === 'impact_sol', wood = matter === 'impact_bois';
        const c = wood ? [0.45, 0.33, 0.2] : dusty ? [0.48, 0.44, 0.38] : [0.6, 0.58, 0.54];
        if (!dusty) flash(0.045, [2.4, 1.9, 1.3]);
        jet(3, c, dusty ? 0.6 : 0.55, dusty ? 4.5 : 5);
        puff(3, c, dusty ? 0.5 : 0.45, dusty ? 0.14 : 0.12, dusty ? 1.6 : 1.9, dusty ? 0.7 : 1);
        chips(dusty ? 6 : 7, wood ? [0.4, 0.3, 0.18] : dusty ? [0.16, 0.15, 0.14] : [0.36, 0.35, 0.33], 3);
        if (!dusty && !wood && Math.random() < 0.35) sparks(2, 4, 0.18, [8, 5, 2]);
      }
      if (hole) E.hole(p, n, hole);
    };
    E.hole = function (p, n, s) { holes.add(p, n, s); };
    E.bloodHit = function (p, dir, delay) {
      for (let k = 0; k < 6; k++) alpha.add({ p: p.clone(), v: dir.clone().multiplyScalar(rnd(0.5, 2)).add(V(rnd(-0.6, 0.6), rnd(-0.2, 0.8), rnd(-0.6, 0.6))), life: rnd(0.3, 0.6), size: rnd(0.05, 0.1), grow: 2.5, frame: 4 + Math.floor(Math.random() * 4), col: [0.28, 0.02, 0.02], a0: 0.75, drag: 3, delay });
      for (let k = 0; k < 8; k++) alpha.add({ p: p.clone(), v: dir.clone().multiplyScalar(rnd(1, 3)).add(V(rnd(-1, 1), rnd(0, 1.5), rnd(-1, 1))), life: rnd(0.3, 0.6), size: rnd(0.012, 0.02), frame: 13, col: [0.25, 0.01, 0.01], a0: 1, grav: 9.8, delay, floor: 0.01 });
    };
    E.bloodPool = function (x, z, s) { blood.add(V(x, 0.003, z), V(0, 1, 0), s); };
    E.casing = function (p, right, up, fwd) {
      const v = right.clone().multiplyScalar(rnd(1.6, 2.6)).addScaledVector(up, rnd(1.2, 2.2)).addScaledVector(fwd, rnd(-0.6, 0.2));
      casings.add({ p: p.clone(), v, r: 0.005, wx: rnd(-25, 25), wy: rnd(-25, 25), wz: rnd(-25, 25), life: 14 });
    };
    E.explosion = function (p) {
      const g = V(p.x, 0.25, p.z);
      add.add({ p: g.clone().add(V(0, 0.5, 0)), life: 0.12, size: 2.6, frame: 1, col: [12, 8, 4], a0: 1 });
      for (let k = 0; k < 26; k++) { const v = V(rnd(-1, 1), rnd(0.2, 1.2), rnd(-1, 1)).normalize().multiplyScalar(rnd(2, 7)); add.add({ p: g.clone(), v, life: rnd(0.4, 0.8), size: rnd(0.7, 1.2), grow: 2.2, frame: 8 + Math.floor(Math.random() * 4), col: [9, 4.2, 1.2], col2: [1.2, 0.3, 0.05], a0: 0.9, drag: 4, rot: Math.random() * 6, spin: rnd(-2, 2), fadePow: 1.5 }); }
      for (let k = 0; k < 28; k++) { const v = V(rnd(-1, 1), rnd(0.3, 1.4), rnd(-1, 1)).normalize().multiplyScalar(rnd(6, 18)); add.add({ p: g.clone(), v, life: rnd(0.3, 0.9), size: 0.02, stretch: 0.03, frame: 3, col: [10, 6, 2.5], grav: 9.8, floor: 0.01 }); }
      for (let k = 0; k < 40; k++) { const v = V(rnd(-1, 1), rnd(0.1, 1.0), rnd(-1, 1)).normalize().multiplyScalar(rnd(0.8, 3.2)); alpha.add({ p: g.clone().add(V(rnd(-0.4, 0.4), rnd(0, 0.6), rnd(-0.4, 0.4))), v: v.add(V(0, rnd(0.6, 1.6), 0)), life: rnd(4, 8), size: rnd(0.9, 1.5), grow: rnd(2.5, 4.5), frame: 4 + Math.floor(Math.random() * 4), col: [0.12, 0.11, 0.1], col2: [0.4, 0.39, 0.38], a0: 1, fadePow: 0.7, drag: 1.4, fadeIn: 0.15, rot: Math.random() * 6, spin: rnd(-0.4, 0.4), delay: rnd(0, 0.15) }); }
      for (let k = 0; k < 10; k++) alpha.add({ p: g.clone(), v: V(rnd(-1, 1), 0, rnd(-1, 1)).normalize().multiplyScalar(rnd(6, 9)), life: rnd(0.8, 1.4), size: rnd(0.5, 0.8), grow: 3, frame: 4 + Math.floor(Math.random() * 4), col: [0.5, 0.46, 0.4], a0: 0.45, drag: 3.5, rot: Math.random() * 6 });
      alpha.add({ p: V(p.x, 0.05, p.z), life: 0.45, size: 0.6, grow: 14, frame: 14, col: [0.75, 0.72, 0.68], a0: 0.55 });
      for (let k = 0; k < 16; k++) debris.add({ p: g.clone(), v: V(rnd(-1, 1), rnd(0.4, 1.6), rnd(-1, 1)).normalize().multiplyScalar(rnd(4, 11)), r: 0.03, s: rnd(0.6, 1.6), wx: rnd(-20, 20), wy: rnd(-20, 20), wz: rnd(-20, 20), life: 20 });
      scorch.add(V(p.x, 0.003, p.z), V(0, 1, 0), rnd(3.2, 4.2));
      light(g.clone().add(V(0, 1, 0)), 0xff9a4a, 260, 18, 0.35);
    };
    E.flashbang = function (p) {
      const g = V(p.x, 0.5, p.z);
      add.add({ p: g.clone(), life: 0.18, size: 4.5, frame: 1, col: [20, 20, 20], a0: 1 });
      add.add({ p: g.clone(), life: 0.35, size: 1.2, grow: 3, frame: 0, col: [8, 8, 9], a0: 1 });
      for (let k = 0; k < 20; k++) add.add({ p: g.clone(), v: V(rnd(-1, 1), rnd(0.2, 1.2), rnd(-1, 1)).normalize().multiplyScalar(rnd(4, 10)), life: rnd(0.2, 0.5), size: 0.015, stretch: 0.03, frame: 3, col: [10, 10, 9], grav: 9.8, floor: 0.01 });
      for (let k = 0; k < 22; k++) alpha.add({ p: g.clone(), v: V(rnd(-1, 1), rnd(0.2, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(0.5, 2)), life: rnd(3, 5.5), size: rnd(0.7, 1.1), grow: 3, frame: 4 + Math.floor(Math.random() * 4), col: [0.85, 0.85, 0.85], a0: 0.8, fadePow: 0.8, drag: 1.5, fadeIn: 0.1, rot: Math.random() * 6 });
      light(g.clone().add(V(0, 0.8, 0)), 0xffffff, 600, 22, 0.3);
    };
    // fumée tactique (nappe opaque qui bloque la vue) : beaucoup de bouffées lentes
    E.smoke = function (x, z, r, dur) {
      for (let k = 0; k < 70; k++) { const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * r; alpha.add({ p: V(x + Math.cos(a) * d, rnd(0.4, 2.4), z + Math.sin(a) * d), v: V(rnd(-0.15, 0.15), rnd(0.02, 0.1), rnd(-0.15, 0.15)), life: dur * rnd(0.85, 1.05), size: rnd(1.6, 2.6), grow: 0.5, frame: 4 + Math.floor(Math.random() * 4), col: [0.78, 0.78, 0.76], a0: 0.95, fadeIn: 1.2, fadePow: 0.35, rot: Math.random() * 6, spin: rnd(-0.1, 0.1), delay: rnd(0, 0.8) }); }
    };
    // pas : éclaboussures sous la pluie (gouttelettes claires qui retombent), petite poussière en courant par temps sec
    E.footstep = function (x, z, wet, v) {
      if (wet) { for (let k = 0; k < 7; k++) alpha.add({ p: V(x + rnd(-0.12, 0.12), 0.03, z + rnd(-0.12, 0.12)), v: V(rnd(-0.7, 0.7), rnd(0.8, 1.6), rnd(-0.7, 0.7)), grav: 9, floor: 0.01, life: rnd(0.22, 0.38), size: rnd(0.02, 0.035), frame: 4, col: [0.75, 0.8, 0.85], a0: 0.7 });
        alpha.add({ p: V(x, 0.02, z), life: 0.45, size: 0.12, grow: 2.5, frame: 4, col: [0.7, 0.74, 0.78], a0: 0.18 }); }
      else for (let k = 0; k < 2; k++) alpha.add({ p: V(x + rnd(-0.15, 0.15), 0.05, z + rnd(-0.15, 0.15)), v: V(rnd(-0.3, 0.3), rnd(0.1, 0.3), rnd(-0.3, 0.3)), life: rnd(0.5, 0.9), size: 0.12, grow: 2.5, frame: 4 + Math.floor(Math.random() * 4), col: [0.52, 0.5, 0.46], a0: 0.16 * Math.min(1, v / 3), drag: 2 });
    };
    E.dustPuff = function (x, z, s) { for (let k = 0; k < 4; k++) alpha.add({ p: V(x + rnd(-0.2, 0.2), 0.05, z + rnd(-0.2, 0.2)), v: V(rnd(-0.4, 0.4), rnd(0.1, 0.4), rnd(-0.4, 0.4)), life: rnd(0.6, 1.2), size: 0.15 * s, grow: 3, frame: 4 + Math.floor(Math.random() * 4), col: [0.5, 0.47, 0.42], a0: 0.35, drag: 2 }); };
    E.update = function (dt, cam, sunCol, fog) {
      now += dt;
      add.update(dt); alpha.update(dt);
      if (sunCol) alpha.mat.uniforms.uLight.value.copy(sunCol);
      if (fog && fog.isFogExp2) { for (const P of [add, alpha, ripples]) { P.mat.uniforms.fogColor.value.copy(fog.color); P.mat.uniforms.fogDensity.value = fog.density; } }
      ripples.update(dt, cam);
      casings.update(dt, (b) => { if (E.sound && Math.random() < 0.35) E.sound(b.p); }); debris.update(dt);
      for (const L of lights) { if (L.fresh) { L.fresh = false; L.until = now + L.dur; continue; } if (now >= L.until) { L.l.intensity = 0; continue; } const k = (L.until - now) / L.dur; L.l.intensity = L.i0 * k * (0.7 + Math.random() * 0.3); }
    };
    // pluie : ronds au sol et impacts au sol en gerbes d'eau
    E.setRain = function (on) { ripples.mesh.visible = !!on; E.wet = !!on; };
    E.clear = function () { add.parts.length = 0; alpha.parts.length = 0; casings.list.length = 0; debris.list.length = 0; holes.clear(); blood.clear(); scorch.clear(); for (const L of lights) L.l.intensity = 0; add.update(0); alpha.update(0); casings.update(0); debris.update(0); };
    return E;
  }
  root.Effets = { create };
})(window.OT = window.OT || {});
