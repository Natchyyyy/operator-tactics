// Textures PBR scannées (Poly Haven, CC0 — voir THIRD_PARTY.md) : couleur, relief (normales OpenGL) et rugosité, publiées
// dans hd/ à côté de la page (fichiers pbr_*.jpg). Remplacement « à chaud » des textures procédurales de parking.js :
//  - OT.PBR.det(cle, detProcedural) rend un objet « détail » ({ map, normal, meters, u }) dont les uniformes (u.tDet,
//    u.tDetN, u.tDetR, u.uM, u.gain, u.hasR, u.mix) sont lus par les matériaux ; au départ ce sont les textures
//    procédurales, puis, quand les images scannées sont chargées, les uniformes basculent dessus (sans recompiler) ;
//  - sans fichiers (page ouverte seule, ?hd=0, hors ligne, fichier manquant) : le procédural reste, rien ne casse ;
//  - OT.PBR.ciel(cb) : panorama de ville (HDRI converti en JPG, soleil écrêté) pour l'éclairage d'ambiance et les reflets.
// Pour changer une texture : déposer les fichiers dans web/hd et modifier le manifeste ci-dessous.
(function (root) {
  const T = window.THREE;
  // metres : taille réelle d'une tuile ; gain : ajustement d'albédo (pour garder la luminosité voulue de chaque surface) ;
  // mix : part du second échantillon à une autre échelle (anti-répétition ; 0 pour les motifs réguliers : briques, dalles)
  const MANIFESTE = {
    asphalte:   { src: 'asphalt_02', f: ['pbr_asphalte_couleur.jpg', 'pbr_asphalte_relief.jpg', 'pbr_asphalte_rugosite.jpg'], metres: 4.5, gain: 1.0, mix: 0.4 },
    beton:      { src: 'concrete_wall_008', f: ['pbr_beton_couleur.jpg', 'pbr_beton_relief.jpg', 'pbr_beton_rugosite.jpg'], metres: 3, gain: 1.3, mix: 0.3 },
    betonClair: { src: 'concrete_wall_008', f: ['pbr_beton_couleur.jpg', 'pbr_beton_relief.jpg', 'pbr_beton_rugosite.jpg'], metres: 3, gain: 1.35, mix: 0.3 },
    trottoir:   { src: 'concrete_pavement', f: ['pbr_dalles_couleur.jpg', 'pbr_dalles_relief.jpg', 'pbr_dalles_rugosite.jpg'], metres: 2.4, gain: 1.35, mix: 0 },
    brique:     { src: 'red_brick_03', f: ['pbr_brique_couleur.jpg', 'pbr_brique_relief.jpg', 'pbr_brique_rugosite.jpg'], metres: 1.25, gain: 1.15, mix: 0 },
    briqueSombre: { src: 'red_brick_03', f: ['pbr_brique_couleur.jpg', 'pbr_brique_relief.jpg', 'pbr_brique_rugosite.jpg'], metres: 1.25, gain: 0.75, mix: 0 },
  };
  const CIEL = 'pbr_ciel_ville.jpg';
  function actif() {
    if (!/^https?:/.test(location.protocol) || /[?&]hd=0\b/.test(location.search)) return false;
    return true;
  }
  const publie = (f) => !window.OT_HD || !!window.OT_HD.fichiers[f];   // build.js : liste des fichiers publiés (pas de 404)
  const cache = {};
  function charger(f, srgb) {
    if (cache[f]) return cache[f];
    return (cache[f] = new Promise((ok) => {
      if (!publie(f)) return ok(null);
      const img = new Image(); img.decoding = 'async';
      img.onload = () => {
        const t = new T.Texture(img); t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping;
        t.anisotropy = 16; t.generateMipmaps = true; t.minFilter = T.LinearMipmapLinearFilter; t.needsUpdate = true; ok(t);
      };
      img.onerror = () => ok(null);
      img.src = 'hd/' + f;
    }));
  }
  const dets = {};
  function det(cle, proc) {
    if (dets[cle]) return dets[cle];
    const M = MANIFESTE[cle];
    const d = Object.assign({}, proc);
    d.u = { tDet: { value: proc.map }, tDetN: { value: proc.normal }, tDetR: { value: proc.normal }, uM: { value: proc.meters }, gain: { value: 1 }, hasR: { value: 0 }, mix: { value: proc.mix === undefined ? 0.35 : proc.mix } };
    dets[cle] = d;
    if (!M || !actif()) return d;
    Promise.all([charger(M.f[0], true), charger(M.f[1], false), charger(M.f[2], false)]).then(([c, n, r]) => {
      if (!c || !n) return;   // fichier manquant : on garde le procédural
      d.u.tDet.value = c; d.u.tDetN.value = n; d.u.uM.value = M.metres; d.u.gain.value = M.gain; d.u.mix.value = M.mix;
      if (r) { d.u.tDetR.value = r; d.u.hasR.value = 1; }
      d.scanne = M.src;
    });
    return d;
  }
  function ciel(cb) { if (!actif()) return; charger(CIEL, true).then(t => { if (t) { t.mapping = T.EquirectangularReflectionMapping; t.wrapS = T.RepeatWrapping; t.wrapT = T.ClampToEdgeWrapping; t.generateMipmaps = false; t.minFilter = T.LinearFilter; cb(t); } }); }
  root.PBR = { det, ciel, MANIFESTE, actif, etat: () => Object.fromEntries(Object.entries(dets).map(([k, d]) => [k, d.scanne || 'procédural'])) };
})(window.OT = window.OT || {});
