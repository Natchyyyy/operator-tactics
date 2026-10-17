// Objets 3D faits avec Meshy (fusil d'assaut, voitures, bus, barrières, sacs de sable, fût, kiosque, palmier, abribus) :
// chargés une fois depuis les données incluses (modeles/decor.js), puis copiés (géométrie et matériau partagés) et
// ajustés à la boîte de l'obstacle simulé. Si un modèle manque, le jeu garde le décor dessiné par programme (decor.js).
(function (root) {
  const S = { ready: false, scenes: {}, boxes: {}, onReady: [] };
  const NOMS = ['fusil', 'berline', 'pickup', 'fourgon', 'bus', 'barriere', 'sacs', 'fut', 'abribus', 'kiosque', 'palmier'];
  function b64ToBuf(b64) { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; }
  function finish() { S.ready = true; for (const f of S.onReady.splice(0)) try { f(); } catch (e) { console.warn(e); } }
  function load() {
    const Loader = window.THREEX && THREEX.GLTFLoader, M = root.MODELES || {};
    if (!Loader || !window.THREE) return finish();
    const todo = NOMS.filter(n => M[n]); let left = todo.length; if (!left) return finish();
    const done = () => { if (--left === 0) finish(); };
    for (const n of todo) {
      try {
        new Loader().parse(b64ToBuf(M[n]), '', (g) => {
          const sc = g.scene; sc.updateMatrixWorld(true);
          sc.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.keep = true; if (o.material) { o.material.side = THREE.FrontSide; if (o.material.color) o.material.color.multiplyScalar(0.92); } } });
          S.scenes[n] = sc; S.boxes[n] = new THREE.Box3().setFromObject(sc); delete M[n]; done();
        }, (e) => { console.warn('modèle ' + n + ' :', e); done(); });
      } catch (e) { console.warn('modèle ' + n + ' :', e); done(); }
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
  // Le modèle Meshy est allongé sur X, bouche vers −X : rotation de +90° autour de Y. Longueur réelle ≈ 0,84 m.
  function arme() {
    if (!has('fusil')) return null;
    const w = new THREE.Group(), c = S.scenes.fusil.clone(true), b = S.boxes.fusil, ctr = b.getCenter(new THREE.Vector3());
    const s = 0.84 / (b.max.x - b.min.x); c.position.set(-ctr.x, -ctr.y, -ctr.z);
    const k = new THREE.Group(); k.add(c); k.scale.setScalar(s); k.rotation.y = Math.PI / 2; w.add(k);
    c.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    // points de prise mesurés sur le modèle (repère du modèle centré, avant échelle) : poignée (x 0,33 ; y −0,13),
    // garde-main (x −0,45 ; y 0,02), bouche (x −0,95), puits de chargeur (x 0,1 ; y −0,1)
    const P = (x, y) => new THREE.Vector3(0, (y - ctr.y) * s, -(x - ctr.x) * s);
    w.gripPt = P(0.33, -0.13); w.forePt = P(-0.42, 0.0); w.muzzle = P(b.min.x, 0.075); w.magPt = P(0.1, -0.1);
    w.isMeshy = true; return w;
  }
  S.load = load; S.has = has; S.copie = copie; S.fit = fit; S.arme = arme;
  S.whenReady = (fn) => { if (S.ready) fn(); else S.onReady.push(fn); };
  root.Modeles3D = S;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else setTimeout(load, 0);
})(window.OT = window.OT || {});
