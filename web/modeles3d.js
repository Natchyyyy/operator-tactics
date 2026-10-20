// Objets 3D faits avec Meshy (fusil d'assaut, voitures, bus, barrières, sacs de sable, fût, kiosque, palmier, abribus, arbre
// d'alignement à grille, benne à ordures, palettes filmées, conteneur maritime, armoire électrique) :
// chargés une fois depuis les données incluses (modeles/decor.js), puis copiés (géométrie et matériau partagés) et
// ajustés à la boîte de l'obstacle simulé. Si un modèle manque, le jeu garde le décor dessiné par programme (decor.js).
(function (root) {
  const S = { ready: false, scenes: {}, boxes: {}, onReady: [], hd: {} };
  const NOMS = ['fusil', 'berline', 'pickup', 'fourgon', 'bus', 'barriere', 'sacs', 'fut', 'abribus', 'kiosque', 'palmier', 'arbre', 'benne', 'palettes', 'conteneur', 'armoire', 'clim', 'porte', 'caisses', 'escalier', 'guerite', 'caisse', 'aspirateur', 'borne'];
  function b64ToBuf(b64) { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; }
  function finish() { S.ready = true; for (const f of S.onReady.splice(0)) try { f(); } catch (e) { console.warn(e); } }
  function load() {
    const Loader = window.THREEX && THREEX.GLTFLoader, M = root.MODELES || {};
    if (!Loader || !window.THREE) return finish();
    // objets publiés seulement en haute définition (hd/, pas de version incluse dans la page : elle serait trop lourde) ;
    // sans eux (page ouverte seule, hors ligne), le décor dessiné par programme les remplace
    const HDOK = /^https?:/.test(location.protocol) && !/[?&]hd=0/.test(location.search) && !!window.fetch;
    const HDSEUL = new Set(['arbre', 'benne', 'palettes', 'conteneur', 'armoire', 'clim', 'porte', 'caisses', 'escalier', 'guerite', 'caisse', 'aspirateur', 'borne']);
    // window.OT_HD (build.js) : liste des fichiers HD publiés à côté de la page — on ne demande pas les autres (pas de 404)
    const OHD = window.OT_HD, aHD = (n) => !OHD || !!OHD.fichiers[n + '.glb'];
    const todo = NOMS.filter(n => M[n] || (HDOK && HDSEUL.has(n) && aHD(n))); let left = todo.length; if (!left) return finish();
    const done = () => { if (--left === 0) finish(); };
    // version haute définition (hd/<nom>.glb, plus de triangles, textures 2048 avec relief et rugosité) si elle est
    // publiée à côté de la page ; sinon (fichier local, hors ligne) la version incluse dans la page
    const HD = new Set(['fusil', 'berline', 'pickup', 'fourgon', 'bus', 'barriere', 'sacs', 'fut', 'abribus', 'kiosque', 'arbre', 'benne', 'palettes', 'conteneur', 'armoire', 'clim', 'porte', 'caisses', 'escalier', 'guerite', 'caisse', 'aspirateur', 'borne']);
    const source = (n) => {
      const inline = () => (M[n] ? b64ToBuf(M[n]) : null);
      if (!HD.has(n) || !aHD(n) || !/^https?:/.test(location.protocol) || /[?&]hd=0/.test(location.search) || !window.fetch) return Promise.resolve(inline());
      const t = new Promise(r => setTimeout(() => r(null), 12000));
      // .glb (GitHub Pages, serveur local) ou, à défaut, .json contenant le .glb en base64 (hébergeurs qui ne servent pas .glb)
      const glb = () => fetch('hd/' + n + '.glb').then(r => r.ok && !/text\/html/.test(r.headers.get('content-type') || '') ? r.arrayBuffer() : null).catch(() => null);
      const json = () => fetch('hd/' + n + '.json').then(r => r.ok ? r.json() : null).then(j => j && j.glb ? b64ToBuf(j.glb) : null).catch(() => null);
      const f = OHD && OHD.json ? json() : glb().then(b => b && b.byteLength > 1000 ? b : json());   // artifact : directement le .json
      return Promise.race([f, t]).then(buf => { if (buf && buf.byteLength > 1000) { S.hd[n] = true; return buf; } return inline(); });
    };
    for (const n of todo) source(n).then(buf => {
      if (!buf) return done();
      try {
        new Loader().parse(buf, '', (g) => {
          const sc = g.scene; sc.updateMatrixWorld(true);
          sc.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.keep = true; if (o.material) { o.material.side = THREE.FrontSide; if (o.material.color) o.material.color.multiplyScalar(n === 'fusil' ? 1 : 0.8); o.material.roughness = Math.max(o.material.roughness || 0, 0.55); for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) if (o.material[k]) o.material[k].anisotropy = 8; } } });
          if (VERNIS[n]) vernir(sc, VERNIS[n]);
          S.scenes[n] = sc; S.boxes[n] = new THREE.Box3().setFromObject(sc); if (n === 'fusil') try { separerChargeur(sc); } catch (e) { console.warn('chargeur :', e); } delete M[n]; done();
        }, (e) => { console.warn('modèle ' + n + ' :', e); done(); });
      } catch (e) { console.warn('modèle ' + n + ' :', e); done(); }
    });
  }
  // Carrosseries : vernis (couche transparente brillante par-dessus la peinture, comme une vraie voiture) — reflète le ciel
  // et les lampadaires, ce qui donne tout de suite du volume et du « vrai » aux véhicules. La couche est atténuée là où la
  // texture est presque noire (pneus, joints).
  const VERNIS = { berline: [0.75, 0.16], pickup: [0.65, 0.2], fourgon: [0.6, 0.2], bus: [0.6, 0.18] };
  function vernir(sc, cfg) {
    sc.traverse(o => {
      if (!o.isMesh || !o.material || Array.isArray(o.material) || o.material.isMeshPhysicalMaterial) return;
      const src = o.material, m = new THREE.MeshPhysicalMaterial();
      THREE.MeshStandardMaterial.prototype.copy.call(m, src); m.defines = { STANDARD: '', PHYSICAL: '' };
      m.clearcoat = cfg[0]; m.clearcoatRoughness = cfg[1]; m.envMapIntensity = (src.envMapIntensity || 1) * 1.4;
      m.onBeforeCompile = vernisHook; m.customProgramCacheKey = vernisKey; m.needsUpdate = true; o.material = m;
    });
  }
  function vernisKey() { return 'vernis3'; }
  function vernisHook(sh) {
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
      { float vL = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)), vS = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)) - min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
        material.clearcoat *= mix(0.25, 1.0, smoothstep(0.012, 0.05, vL + vS)); }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n { float mS = max(reflectedLight.directSpecular.r, max(reflectedLight.directSpecular.g, reflectedLight.directSpecular.b)); reflectedLight.directSpecular *= min(1.0, 0.9 / max(mS, 1e-4)); }');
    // reflet direct des lampes dans le vernis (pare-brise la nuit) : plafonné, pas de tache blanche brûlée
    sh.fragmentShader = sh.fragmentShader.replace('float dotNVcc = saturate(', 'clearcoatSpecularDirect *= min(1.0, 0.8 / max(max(clearcoatSpecularDirect.r, clearcoatSpecularDirect.g), max(clearcoatSpecularDirect.b, 1e-4))); float dotNVcc = saturate(');
  }
  // Chargeur détachable : les triangles du fusil dont le centre tombe dans la zone du chargeur (repère du modèle :
  // |x − CHG.x| < CHG.dx, y < CHG.y) forment un maillage à part (même matériau, mêmes sommets), nommé « chargeur ».
  // Il peut ainsi sortir de l'arme et passer dans la main gauche pendant le rechargement.
  const CHG = { x: 0.0, dx: 0.13, y: -0.04 };
  function separerChargeur(sc) {
    sc.updateMatrixWorld(true); const meshes = []; sc.traverse(o => { if (o.isMesh && o.geometry.index) meshes.push(o); });
    for (const o of meshes) {
      const g = o.geometry, idx = g.index.array, pos = g.attributes.position, mw = o.matrixWorld, v = new THREE.Vector3(), c = new THREE.Vector3();
      const corps = [], chg = [];
      for (let i = 0; i < idx.length; i += 3) {
        c.set(0, 0, 0); for (let k = 0; k < 3; k++) c.add(v.fromBufferAttribute(pos, idx[i + k]).applyMatrix4(mw)); c.multiplyScalar(1 / 3);
        (Math.abs(c.x - CHG.x) < CHG.dx && c.y < CHG.y ? chg : corps).push(idx[i], idx[i + 1], idx[i + 2]);
      }
      if (chg.length < 30) continue;
      const mk = (list) => { const ng = new THREE.BufferGeometry(); for (const k in g.attributes) ng.setAttribute(k, g.attributes[k]); ng.setIndex(list); ng.computeBoundingBox(); ng.computeBoundingSphere(); return ng; };
      o.geometry = mk(corps);
      const m = new THREE.Mesh(mk(chg), o.material); m.name = 'chargeur'; m.position.copy(o.position); m.quaternion.copy(o.quaternion); m.scale.copy(o.scale); m.castShadow = true; m.userData.keep = true;
      o.parent.add(m);
      const bb = new THREE.Box3(); for (let i = 0; i < chg.length; i++) bb.expandByPoint(v.fromBufferAttribute(pos, chg[i]).applyMatrix4(mw)); S.chargeurBox = bb;
    }
  }
  const has = (n) => !!S.scenes[n];
  // copie du modèle n, centrée au sol au milieu, dans un groupe ; longueur (le plus grand côté horizontal) le long de X
  function copie(n) {
    const g = new THREE.Group(), c = S.scenes[n].clone(true), b = S.boxes[n], ctr = b.getCenter(new THREE.Vector3());
    c.position.set(-ctr.x, -b.min.y, -ctr.z); g.add(c);
    c.traverse(o => { if (o.isMesh) o.userData.keep = true; });
    return g;
  }
  // un modèle ajusté à une boîte w × h × d (m), posé au sol et centré : le groupe se place au centre de la boîte, à mi-hauteur
  // (comme les maillages du décor). La plus grande dimension horizontale du modèle suit celle de la boîte ; l'échelle reste
  // proche d'une échelle uniforme (±tol) pour ne pas déformer l'objet. flip : retourné de 180°.
  function fit(n, w, h, d, opts) {
    opts = opts || {}; const b = S.boxes[n], sz = b.getSize(new THREE.Vector3());
    const longX = sz.x >= sz.z, boxLongX = w >= d;
    const inner = copie(n), outer = new THREE.Group(); outer.add(inner);
    const L = Math.max(w, d), Wd = Math.min(w, d), mL = longX ? sz.x : sz.z, mW = longX ? sz.z : sz.x;
    const u = opts.byHeight ? h / sz.y : L / mL, tol = opts.tol === undefined ? 0.25 : opts.tol, cl = (v) => Math.max(u * (1 - tol), Math.min(u * (1 + tol), v));
    const sL = opts.byHeight ? u : L / mL, sW = cl(Wd / mW), sH = opts.byHeight ? u : cl(h / sz.y);
    inner.scale.set(longX ? sL : sW, sH, longX ? sW : sL);
    let rot = (longX === boxLongX) ? 0 : Math.PI / 2; if (opts.flip) rot += Math.PI; if (opts.rot) rot += opts.rot;
    inner.rotation.y = rot; inner.position.y = -h / 2;
    return outer;
  }
  // Le fusil d'assaut du jeu, dans le repère des armes (figure.js) : +Z vers la bouche, poignée à la main droite.
  // Modèle Meshy « carabine type BREN » (chargeur courbe, point rouge, crosse télescopique), allongé sur X, bouche vers −X :
  // rotation de +90° autour de Y. Longueur réelle ≈ 0,86 m.
  function arme() {
    if (!has('fusil')) return null;
    const w = new THREE.Group(), c = S.scenes.fusil.clone(true), b = S.boxes.fusil, ctr = b.getCenter(new THREE.Vector3());
    const s = 0.86 / (b.max.x - b.min.x); c.position.set(-ctr.x, -ctr.y, -ctr.z);
    const k = new THREE.Group(); k.add(c); k.scale.setScalar(s); k.rotation.y = Math.PI / 2; w.add(k);
    c.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    // points de prise mesurés sur le modèle (repère du modèle centré, avant échelle ; voir outils : projection du nuage de
    // points) : poignée pistolet (x 0,36 ; y −0,08), garde-main (x −0,40 ; y 0,12), axe du canon y 0,12, bouche (x min),
    // chargeur (x 0 ; y −0,15), plaque de couche (x max ; y 0,05)
    const P = (x, y) => new THREE.Vector3(0, (y - ctr.y) * s, -(x - ctr.x) * s);
    w.gripPt = P(0.36, -0.08); w.forePt = P(-0.40, 0.12); w.muzzle = P(b.min.x, 0.12); w.magPt = P(0.0, -0.15); w.buttPt = P(b.max.x, 0.05);
    w.mag = null; c.traverse(o => { if (o.name === 'chargeur') w.mag = o; });
    if (w.mag && S.chargeurBox) { const mc = S.chargeurBox.getCenter(new THREE.Vector3()); w.magCenter = P(mc.x, mc.y); w.magHome = w.mag.position.clone(); }
    w.isMeshy = true; return w;
  }
  S.load = load; S.vernir = (m) => { if (m && m.isMeshPhysicalMaterial && m.clearcoat > 0) { m.onBeforeCompile = vernisHook; m.customProgramCacheKey = vernisKey; } return m; }; S.has = has; S.copie = copie; S.fit = fit; S.arme = arme;
  S.whenReady = (fn) => { if (S.ready) fn(); else S.onReady.push(fn); };
  root.Modeles3D = S;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else setTimeout(load, 0);
})(window.OT = window.OT || {});
