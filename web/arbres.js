// Arbres d'alignement (platanes / tilleuls de ville) et feuillage de haie, faits par programme :
//  - tronc et charpentières : cylindres coniques légèrement tordus, écorce de platane (scannée, pbr.js ; procédurale sinon) ;
//  - houppier : des centaines de « cartes » de feuillage (rameaux feuillus dessinés dans une texture à transparence, découpe
//    alpha) groupées en touffes au bout des branches ; les normales des cartes pointent vers l'extérieur du houppier
//    (éclairage doux et volumique, comme les arbres des jeux AAA, au lieu de plans plats qui s'allument un par un) ;
//    lumière qui traverse les feuilles à contre-jour ; balancement léger au vent dans le shader ;
//  - géométries partagées : 4 modèles d'arbre, copiés (une seule géométrie par modèle) ; ≈ 600 à 900 triangles par arbre ;
//  - ombres portées découpées par la transparence (les feuilles projettent une ombre tachetée).
// OT.Arbres.arbre(hauteur, graine) → THREE.Group posé au sol ; OT.Arbres.feuillesMat() pour d'autres végétaux (haies).
(function (root) {
  const T = window.THREE;
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const VENT = { time: { value: 0 } };
  // ---- texture de rameau feuillu : 2 × 2 variantes dans une texture 512², fond transparent ----
  let LEAF = null;
  function leafTex() {
    if (LEAF) return LEAF;
    const N = 512, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), R = rng(907);
    for (let v = 0; v < 4; v++) {
      const ox = (v % 2) * N / 2, oy = Math.floor(v / 2) * N / 2, S = N / 2;
      g.save(); g.beginPath(); g.rect(ox, oy, S, S); g.clip();
      // rameau : tige du bas vers le haut, ramilles
      const twig = (x0, y0, x1, y1, w) => { g.strokeStyle = 'rgba(70,52,34,1)'; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 + (R() - 0.5) * 20, (y0 + y1) / 2, x1, y1); g.stroke(); };
      const cx = ox + S / 2, base = oy + S - 6; twig(cx, base, cx + (R() - 0.5) * 40, oy + 30, 3);
      const leaves = 34 + Math.floor(R() * 10);
      for (let k = 0; k < leaves; k++) {
        const a = R() * Math.PI * 2, r = Math.sqrt(R()) * S * 0.4, x = cx + Math.cos(a) * r, y = oy + S * 0.47 + Math.sin(a) * r * 0.95;
        if (R() < 0.3) twig(cx, oy + S * 0.55 + (R() - 0.5) * 40, x, y, 1.2);
        const L = 22 + R() * 18, W = L * (0.5 + R() * 0.25), rot = a + Math.PI / 2 + (R() - 0.5) * 1.2;
        const sh = R(), col = [Math.round(58 + sh * 42 + R() * 12), Math.round(84 + sh * 48 + R() * 14), Math.round(36 + sh * 24)];
        g.save(); g.translate(x, y); g.rotate(rot);
        const grd = g.createLinearGradient(-W / 2, 0, W / 2, 0); grd.addColorStop(0, `rgb(${col[0] * 0.78 | 0},${col[1] * 0.78 | 0},${col[2] * 0.78 | 0})`); grd.addColorStop(0.5, `rgb(${col[0]},${col[1]},${col[2]})`); grd.addColorStop(1, `rgb(${col[0] * 0.85 | 0},${col[1] * 0.85 | 0},${col[2] * 0.85 | 0})`);
        g.fillStyle = grd; g.beginPath(); g.moveTo(0, -L / 2); g.bezierCurveTo(W / 2, -L / 4, W / 2, L / 4, 0, L / 2); g.bezierCurveTo(-W / 2, L / 4, -W / 2, -L / 4, 0, -L / 2); g.fill();
        g.strokeStyle = `rgba(${col[0] * 1.3 | 0},${col[1] * 1.2 | 0},${col[2] | 0},0.5)`; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -L / 2 + 2); g.lineTo(0, L / 2 - 2); g.stroke();   // nervure
        g.restore();
      }
      g.restore();
    }
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = T.LinearMipmapLinearFilter;
    return (LEAF = t);
  }
  // ---- matériau des feuilles : découpe alpha, double face, normales du houppier, translucidité, vent ----
  const MATS = {};
  function feuillesMat(teinte) {
    const key = teinte || 'std'; if (MATS[key]) return MATS[key];
    const m = new T.MeshStandardMaterial({ map: leafTex(), alphaTest: 0.45, side: T.DoubleSide, roughness: 0.78, metalness: 0, vertexColors: true, color: teinte === 'haie' ? 0xa8b89a : 0xdde4d6 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = VENT.time;
      sh.vertexShader = 'uniform float uTime; attribute float aSway;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec4 wp0 = modelMatrix * vec4(transformed, 1.0); float ph = wp0.x * 0.35 + wp0.z * 0.27;
          transformed += vec3(sin(uTime * 1.3 + ph), sin(uTime * 2.1 + ph * 1.7) * 0.5, cos(uTime * 1.1 + ph)) * 0.05 * aSway; }`);
      // double face SANS retourner la normale côté envers : la normale est celle du houppier (sinon une carte sur deux, vue de
      // dos, devient noire)
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', T.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
      sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        // lumière qui traverse les feuilles : la face éclairée par derrière garde une partie de la lumière directe, plus jaune
        #if NUM_DIR_LIGHTS > 0
        { vec3 Ld = directionalLights[0].direction; float back = saturate(dot(-geometryViewDir, Ld) * 0.6 + 0.4) * saturate(-dot(geometryNormal, Ld) + 0.3);
          reflectedLight.indirectDiffuse += directionalLights[0].color * diffuseColor.rgb * vec3(0.9, 1.0, 0.45) * back * 0.22; }
        #endif`);
    };
    m.customProgramCacheKey = () => 'feuilles' + key;
    return (MATS[key] = m);
  }
  // cartes de feuillage autour de centres de touffes ; normales = direction depuis le centre du houppier (adoucie)
  function cartes(touffes, centre, R, opts) {
    const pos = [], nor = [], uv = [], col = [], sway = [], idx = []; let nv = 0;
    const q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3(), n = new T.Vector3();
    for (const tf of touffes) {
      for (let k = 0; k < tf.n; k++) {
        const p = new T.Vector3(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1);
        if (tf.boite) { if (R() < 0.8) { const ax = R() < tf.pz ? 2 : R() < 0.5 ? 0 : 1; p.setComponent(ax, ax === 1 ? 0.92 + R() * 0.08 : (R() < 0.5 ? -1 : 1) * (0.9 + R() * 0.1)); } }   // haie : surtout en surface (dessus et côtés)
        else if (p.lengthSq() > 1) p.normalize();
        p.multiply(tf.r).add(tf.c);
        const s = opts.taille * (0.75 + R() * 0.5); e.set(R() * Math.PI, R() * Math.PI * 2, R() * Math.PI); q.setFromEuler(e);
        const vv = Math.floor(R() * 4), u0 = (vv % 2) * 0.5, v0 = Math.floor(vv / 2) * 0.5;
        const out = n.copy(p).sub(centre); out.y *= opts.aplatY || 1; out.normalize(); const shade = 0.75 + 0.35 * Math.max(0, out.y) + (R() - 0.5) * 0.2;
        const tint = opts.teinte ? opts.teinte(R) : [1, 1, 1];
        for (const [a, b] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
          v.set(a * s, b * s, 0).applyQuaternion(q).add(p); pos.push(v.x, v.y, v.z);
          // normale : mélange de celle du houppier (dominante) et d'un peu de bruit
          const nn = n.copy(v).sub(centre); nn.y *= opts.aplatY || 1; nn.normalize(); nor.push(nn.x, nn.y, nn.z);
          uv.push(u0 + (a + 0.5) * 0.5, 1 - (v0 + (0.5 - b) * 0.5));
          col.push(shade * tint[0], shade * tint[1], shade * tint[2]); sway.push(Math.max(0, (v.y - opts.y0) / Math.max(1, opts.h - opts.y0)));
        }
        idx.push(nv, nv + 1, nv + 2, nv, nv + 2, nv + 3); nv += 4;
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setAttribute('aSway', new T.Float32BufferAttribute(sway, 1));
    g.setIndex(idx); g.computeBoundingSphere(); g.computeBoundingBox(); return g;
  }
  // ---- écorce ----
  let ECORCE = null;
  function ecorceMat() {
    if (ECORCE) return ECORCE;
    const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), R = rng(55);
    g.fillStyle = '#6b5f50'; g.fillRect(0, 0, N, N);
    for (let k = 0; k < 120; k++) { g.fillStyle = `rgba(${R() < 0.5 ? '150,140,115' : '60,50,40'},${0.2 + R() * 0.35})`; const w = 10 + R() * 40, h = 8 + R() * 30; g.beginPath(); g.ellipse(R() * N, R() * N, w / 2, h / 2, R(), 0, 7); g.fill(); }   // plaques du platane
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping;
    const det = { map: t, normal: t, meters: 1.2 };
    const P = root.Parking, d = root.PBR ? root.PBR.det('ecorce', det) : det;
    ECORCE = P && P.worldMat ? P.worldMat(d, { roughness: 0.9, bump: 1.2 }) : new T.MeshStandardMaterial({ map: t, roughness: 0.9 });
    return ECORCE;
  }
  function branche(a, b, r0, r1) {
    const d = b.clone().sub(a), L = d.length(), g = new T.CylinderGeometry(r1, r0, L, 7, 3, true);
    g.translate(0, L / 2, 0); const m = new T.Matrix4().makeRotationFromQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize())); g.applyMatrix4(m); g.translate(a.x, a.y, a.z);
    return g;
  }
  // ---- modèles d'arbre (4 variantes, hauteur de référence 6 m, mis à l'échelle à la pose) ----
  const MODELES = [];
  function modele(v) {
    if (MODELES[v]) return MODELES[v];
    const R = rng(1201 + v * 77), H = 6, troncH = 2.2 + R() * 0.5, centre = new T.Vector3(0, troncH + 2.0, 0);
    const bois = [], touffes = [];
    const top = new T.Vector3((R() - 0.5) * 0.25, troncH, (R() - 0.5) * 0.25);
    bois.push(branche(new T.Vector3(0, -0.1, 0), top, 0.17, 0.13));
    const nb = 4 + Math.floor(R() * 2);
    for (let k = 0; k < nb; k++) {
      const a = k / nb * Math.PI * 2 + R() * 0.6, el = 0.8 + R() * 0.45, L = 1.25 + R() * 0.6;
      const end = top.clone().add(new T.Vector3(Math.cos(a) * Math.cos(el) * L, Math.sin(el) * L, Math.sin(a) * Math.cos(el) * L));
      bois.push(branche(top, end, 0.1, 0.045));
      const end2 = end.clone().add(new T.Vector3(Math.cos(a + 0.6) * 0.7, 0.6 + R() * 0.4, Math.sin(a + 0.6) * 0.7)); bois.push(branche(end, end2, 0.045, 0.02));
      touffes.push({ c: end2.clone(), r: new T.Vector3(0.9, 0.7, 0.9).multiplyScalar(0.9 + R() * 0.3), n: 28 });
      touffes.push({ c: end.clone().lerp(top, 0.25).add(new T.Vector3(0, 0.3, 0)), r: new T.Vector3(0.9, 0.65, 0.9), n: 16 });
    }
    touffes.push({ c: top.clone().add(new T.Vector3(0, 2.4, 0)), r: new T.Vector3(1.1, 0.75, 1.1), n: 36 });   // cime
    touffes.push({ c: top.clone().add(new T.Vector3(0, 1.6, 0)), r: new T.Vector3(1.0, 0.7, 1.0), n: 22 });   // cœur (masque le vide central)
    const feuilles = cartes(touffes, centre, R, { taille: 0.95, aplatY: 1.3, y0: troncH, h: H, teinte: (r) => [0.92 + r() * 0.16, 0.95 + r() * 0.1, 0.85 + r() * 0.2] });
    const boisG = mergeGeos(bois);
    return (MODELES[v] = { feuilles, bois: boisG, h: H });
  }
  function mergeGeos(list) {
    const pos = [], nor = [], uv = [], idx = []; let off = 0;
    for (const g of list) {
      const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
      for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); uv.push(u.getX(i), u.getY(i)); }
      const ix = g.index.array; for (let i = 0; i < ix.length; i++) idx.push(ix[i] + off); off += p.count; g.dispose();
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeBoundingSphere(); return g;
  }
  let lastT = 0;
  function tick() { const t = performance.now() / 1000; if (t !== lastT) { lastT = t; VENT.time.value = t % 1000; } }
  // un arbre posé au sol (y = 0 au pied), hauteur h (m), variante par graine
  function arbre(h, seed) {
    const M = modele(((seed % 4) + 4) % 4), g = new T.Group(), s = h / M.h;
    const tronc = new T.Mesh(M.bois, ecorceMat()); tronc.castShadow = true; tronc.receiveShadow = true;
    const f = new T.Mesh(M.feuilles, feuillesMat()); f.castShadow = true; f.receiveShadow = true; f.onBeforeRender = tick;
    g.add(tronc, f); g.scale.set(s * (0.9 + ((seed * 37) % 10) / 50), s, s * (0.9 + ((seed * 53) % 10) / 50)); g.rotation.y = seed * 1.37;
    g.traverse(o => { if (o.isMesh) o.userData.keep = true; }); g.userData.arbre = true;
    return g;
  }
  // coque de feuillage pour une haie / un massif : cartes réparties dans une boîte (w × h × d), normales vers l'extérieur
  // boite : cartes surtout en surface d'une boîte (haie taillée) ; sinon dans un ellipsoïde (arbuste)
  function massif(w, h, d, seed, boite) {
    const R = rng(seed || 7), touffes = [], n = Math.max(10, Math.round((w * d + (w + d) * h * 2) * (boite ? 14 : h < 0.4 ? 30 : 12)));
    const c = new T.Vector3(0, boite ? h * 0.3 : h < 0.4 ? -1.2 : h * 0.2, 0);   // couvre-sol bas : normales presque verticales
    touffes.push({ c: new T.Vector3(0, h / 2, 0), r: new T.Vector3(w / 2, h / 2, d / 2), n, boite, pz: w / (w + d) * 0.6 });
    const g = cartes(touffes, c, R, { taille: boite ? 0.4 : 0.45, aplatY: 1, y0: 0, h, teinte: (r) => [0.8 + r() * 0.15, 0.85 + r() * 0.15, 0.75 + r() * 0.15] });
    const m = new T.Mesh(g, feuillesMat('haie')); m.castShadow = true; m.receiveShadow = true; m.onBeforeRender = tick; m.userData.keep = true; return m;
  }
  root.Arbres = { arbre, massif, feuillesMat, tick };
})(window.OT = window.OT || {});
