// Soldats 3D faits avec Meshy (modèles texturés, squelette Mixamo, 17 animations) : chargement depuis les données incluses
// (modeles/soldat.js et modeles/gign.js → OT.MODELES[nom], base64), copies par opérateur. Deux modèles :
//  - « gign » : l'opérateur d'intervention (tenue marine, casque à visière) de l'équipe du joueur, couleurs d'origine ;
//  - « soldat » : le soldat d'origine, pour l'adversaire, dont la toile beige prend la couleur d'uniforme de la faction.
// Les deux partagent le squelette Mixamo et les mêmes animations (celles du GIGN y ont été transférées par
// outils/greffer_animations.py) ; chaque modèle a ses propres clips, corrections d'orientation et garde basse. Puis :
// choix de l'animation selon l'état simulé (marche, course, accroupi, visée, rechargement, lancer, chute, reptation,
// victoire) et arme du jeu tenue dans les mains (placée chaque image entre la main droite et la main gauche).
// Si le modèle manque ou ne se charge pas, le jeu garde ses personnages dessinés par programme (figure.js).
(function (root) {
  const S = { ready: false, gltf: null, clips: {}, yawFix: {}, modeles: {}, onReady: [] };
  const NOMS = ['gign', 'soldat'];            // le premier présent est le modèle par défaut
  const TEINTE = { soldat: true };            // modèles dont l'uniforme prend la couleur demandée
  const HEIGHT = 1.8, RAW_H = 1.7;            // taille en jeu / taille du modèle exporté
  // vitesse « naturelle » de chaque cycle de locomotion (m/s), pour caler les pas sur le déplacement réel
  const LOCO = { Walking: 1.35, Walk_Fight_Forward: 1.1, Running: 3.4, RunFast: 5.2, Run_and_Shoot: 3.2, Cautious_Crouch_Walk_Forward: 0.9, Crawl_Backward: 0.5 };
  // fraction de l'écart de hauteur du bassin (pas chassés / marche arrière → marche avant) rattrapée, voir releve()
  // Marche arrière générée (Recul_IA) à la place de celle de la bibliothèque : désactivé. Mesuré (marche.html) : pieds jamais
  // croisés le long du bassin, mais elle glisse 2 à 4 fois plus (appuis peu nets de l'animation générée : 1,75 m/s en petite
  // course, 0,94 en marche contre 0,88 / 0,49) et, sa direction étant de biais (158-164°), vue de face les jambes se croisent
  // davantage à 180°. « Pas_Chasse_IA » croise les pieds (pas croisé de ~15 cm) et va trop lentement (~0,6 m/s).
  const MARCHE_IA = false;
  const RELEVE = { cote: 0.88, arriere: 0.88 };
  // marche directionnelle en visant : part de l'écart fusil / bassin rattrapée par la torsion du dos (le reste tourne le corps)
  const DOS_VISEE = 0.5;
  // petite course de patrouille tirée de « Running » (voir foulee()) : foulée × s, levée des pieds × hs, bassin remonté (part)
  // dos : part du mouvement de la colonne de la course ajoutée à la garde basse (Trot_Low)
  // marche en visant : bassin abaissé (m) par rapport à la marche naturelle
  const GLISSE = 0.03;
  // à genou : hauteur du genou arrière posé (os, m), de sa cheville (pointe du pied au sol), cheville du pied avant à plat
  const GENOU = { genou: 0.075, cheville: 0.13, chevilleAv: 0.15 };
  const TROT = { s: 0.38, hs: 0.5, rise: 0.5, dos: 0.45, kp: 0.55 };   // kp : part gardée de la cambrure du pied
  // posture de tir : poitrine (Spine2) à PENCHE m en avant du bas du dos (Spine), dans la direction de visée
  const PENCHE = 0.21;
  // visée : angle (rad) entre la ligne des épaules et la face (0 = carré, ~1,3 = de profil comme les visées Mixamo), voir penche()
  const BIAIS = 0.5;   // (rad : inclinaison bassin → cou vers l'avant, dans le plan du corps)
  // visée à l'arrêt : rotation du bassin et des jambes vers la cible (rad), voir update()
  const CARRE = 0.61;
  // tangage voulu du canon dans les poses épaulées (rad ; légèrement vers le bas : la cible est à hauteur de poitrine)
  const VISEE_TANGAGE = -0.035;
  const ONCE = { Shot_and_Fall_Forward: 1, Shot_in_the_Back_and_Fall: 1, Over_Shoulder_Throw: 1 };
  // Fusil épaulé : dans ces animations la crosse doit reposer dans le creux de l'épaule droite. Les animations Mixamo ne l'y
  // mettent pas exactement (le fusil du jeu n'est pas celui de l'animation) : à chaque image, le fusil garde son orientation
  // mais est glissé pour que sa crosse touche le creux de l'épaule, puis les deux bras sont recalés par IK (épaule → coude →
  // poignet, coude dans son plan d'origine, mains gardant leur orientation) pour que les paumes restent sur la poignée et
  // le garde-main. CREUX : position du creux par rapport à l'articulation de l'épaule droite (m) : vers le centre du
  // corps, vers l'avant, vers le bas.
  // rechargements debout (main droite portée dans la poche de rechargement, voir poche())
  const REPOS = { Garde_Basse: 1, Rifle_Aim_Turn_Right: 1 };
  const RECHARGE = { Standing_Reload: 1, Standing_Reload_Haut: 1 };
  const EPAULE = { Rifle_Aim_Turn_Right: 1, Walk_Aim: 1, Walk_Aim_Haut: 1, Run_and_Shoot: 1, Run_and_Shoot_Haut: 1, Gunshot_Reaction: 1, Accroupi_Vise: 1, Accroupi_Marche_Vise: 1 };
  // poses en garde basse construite (fusil, voir poseArme) en plus de Garde_Basse et des hauts du corps « _Low_Haut »
  const BAS = { Accroupi_Bas: 1, Accroupi_Marche_Bas: 1 };
  const CREUX = { dedans: 0.16, avant: 0.08, bas: -0.03 };
  // œil droit dans le repère de la tête (m : au-dessus de l'os de la tête, devant, à droite) ; point de visée de l'optique
  // (repère de l'arme : centre de la fenêtre du viseur point rouge) ; garde basse construite (rad : canon vers le bas, vers la
  // gauche ; m : crosse sous / devant le creux de l'épaule)
  const OEIL = { haut: 0.095, avant: 0.085, cote: 0.032 }, VISEE_OPTIQUE = [0, 0.145, -0.03], GARDE = { pique: 0.7, dedans: 0.42, bas: 0.0, avant: 0, recul: 0.045 };
  // creux de l'épaule de la garde basse (m, par rapport à l'articulation de l'épaule : vers le centre, l'avant, le bas)
  const POCHE = { dedans: 0.06, avant: 0.05, bas: 0.05 };
  S.OEIL = OEIL; S.GARDE = GARDE;
  S.CREUX = CREUX;
  function b64ToBuf(b64) { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; }
  // Repère de paume : un point fixe dans chaque main, à la base des doigts (le squelette du GIGN n'a pas d'os de doigts).
  // La paume = 60 % du poignet vers ce point.
  const PALME = [0, 0.135, 0];
  function load() {
    const Loader = window.THREEX && THREEX.GLTFLoader, MOD = root.MODELES || {};
    if (!Loader || !window.THREE) return;
    const todo = NOMS.filter(n => MOD[n]); let left = todo.length; if (!left) return;
    const finish = () => {
      if (--left > 0) return;
      const def = S.modeles[NOMS.find(n => S.modeles[n])]; if (!def) return;
      S.gltf = def.gltf; S.clips = def.clips; S.yawFix = def.yawFix; S.gbErr = def.gbErr; S.defaut = def.nom;
      // le fusil Meshy (modeles3d.js) est attendu : les soldats naissent directement avec
      // la garde basse dépend de la géométrie de l'arme (poignée → garde-main) : construite une fois le fusil chargé aussi
      const go = () => {
        for (const n in S.modeles) { const M = S.modeles[n]; try { gardeBasse(M); compositeBas(M); directions(M); mesureLoco(M); compositeAccroupi(M); } catch (e) { console.warn('soldat 3D (garde basse) :', e); } }
        S.ready = true; for (const f of S.onReady.splice(0)) try { f(); } catch (e) { console.warn(e); } texturesHD(); };
      if (root.Modeles3D) root.Modeles3D.whenReady(go); else go();
    };
    // version haute définition du personnage (hd/<nom>_hd.glb ou .json : maillage complet ~100 000 triangles, mêmes os et
    // animations) si elle est publiée à côté de la page ; sinon la version incluse (~27 000 triangles)
    // rendu logiciel (pas de carte graphique : SwiftShader, llvmpipe) : le maillage et les textures 4K du personnage HD
    // saturent la mémoire et l'image sort noire ; on garde alors la version incluse (?hd=1 force la HD)
    const LOGICIEL = (() => { if (/[?&]hd=1/.test(location.search)) return false;
      try { const c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl'); if (!gl) return false;
        const ext = gl.getExtension('WEBGL_debug_renderer_info'), r = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
        const lc = gl.getExtension('WEBGL_lose_context'); if (lc) lc.loseContext();
        return /swiftshader|llvmpipe|softpipe|software/i.test(r || ''); } catch (e) { return false; } })();
    S.logiciel = LOGICIEL;
    const HDok = /^https?:/.test(location.protocol) && !/[?&]hd=0/.test(location.search) && !LOGICIEL;
    // niveau de détail « loin » du personnage HD (hd/<nom>_lod.glb, ~40 000 triangles, mêmes os ; voir lod() plus bas)
    const HDNOMS = new Set();
    const chargerLod = (M, Loader) => {
      const OHD = window.OT_HD, nom = M.nom;
      if (!HDNOMS.has(nom) || (OHD && !OHD.fichiers[nom + '_lod.glb'])) return Promise.resolve();
      const glb = () => fetch('hd/' + nom + '_lod.glb').then(r => r.ok && !/text\/html/.test(r.headers.get('content-type') || '') ? r.arrayBuffer() : null).catch(() => null);
      const json = () => fetch('hd/' + nom + '_lod.json').then(r => r.ok ? r.json() : null).then(j => j && j.glb ? b64ToBuf(j.glb) : null).catch(() => null);
      const t = new Promise(r => setTimeout(() => r(null), 15000));
      return Promise.race([OHD && OHD.json ? json() : glb().then(b => b && b.byteLength > 1000 ? b : json()), t]).then(b => new Promise(res => {
        if (!b || b.byteLength < 1000) return res();
        new Loader().parse(b, '', (g) => { let sm = null; g.scene.updateMatrixWorld(true); g.scene.traverse(o => { if (o.isSkinnedMesh && !sm) sm = o; });
          if (sm) M.lod = { geo: sm.geometry, noms: sm.skeleton.bones.map(x => x.name), inv: sm.skeleton.boneInverses, bind: sm.bindMatrix.clone() };
          res(); }, () => res());
      }));
    };
    const source = (nom) => {
      const OHD = window.OT_HD;   // fichiers HD publiés (build.js) : on ne demande pas un fichier absent
      if (!HDok || (OHD && !OHD.fichiers[nom + '_hd.glb'])) return Promise.resolve(b64ToBuf(MOD[nom]));
      const glb = () => fetch('hd/' + nom + '_hd.glb').then(r => r.ok && !/text\/html/.test(r.headers.get('content-type') || '') ? r.arrayBuffer() : null).catch(() => null);
      const json = () => fetch('hd/' + nom + '_hd.json').then(r => r.ok ? r.json() : null).then(j => j && j.glb ? b64ToBuf(j.glb) : null).catch(() => null);
      const t = new Promise(r => setTimeout(() => r(null), 25000));
      return Promise.race([OHD && OHD.json ? json() : glb().then(b => b && b.byteLength > 1000 ? b : json()), t]).then(b => { if (b && b.byteLength > 1000) { S.hdMaillage = (S.hdMaillage || 0) + 1; HDNOMS.add(nom); return b; } return b64ToBuf(MOD[nom]); });
    };
    for (const nom of todo) {
      source(nom).then((buf) => {
        new Loader().parse(buf, '', (g) => {
          const M = { nom, gltf: g, clips: {}, yawFix: {} };
          // locomotion sur place : on retire le déplacement horizontal du bassin (le jeu déplace déjà le soldat)
          for (const c of g.animations) {
            for (const tr of c.tracks) if (/Hips\.position$/.test(tr.name)) { const v = tr.values, x0 = v[0], z0 = v[2]; for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; } }
            M.clips[c.name] = c;
          }
          g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; } });
          for (const [h, n] of [['RightHand', 'PalmeD'], ['LeftHand', 'PalmeG']]) {
            const hb = g.scene.getObjectByName('mixamorig' + h) || g.scene.getObjectByName('mixamorig:' + h);
            if (hb) { const r = new THREE.Object3D(); r.name = n; r.position.fromArray(PALME); hb.add(r); }
          }
          try { straighten(M); composite(M); measure(M); } catch (e) { console.warn('soldat 3D (composite) :', e); }
          S.modeles[nom] = M; delete MOD[nom]; chargerLod(M, Loader).then(finish, finish);
        }, (e) => { console.warn('soldat 3D ' + nom + ' :', e); finish(); });
      }).catch((e) => { console.warn('soldat 3D ' + nom + ' :', e); finish(); });
    }
  }
  // Animations qui font tourner tout le corps sur lui-même (demi-tour du lancer, visée qui pivote) : on garde l'orientation
  // du bassin de la première image (le jeu oriente déjà le soldat vers sa cible).
  const STRAIGHT = ['Over_Shoulder_Throw', 'Rifle_Aim_Turn_Right', 'Kneeling_Reload', 'Standing_Reload', 'Gunshot_Reaction'];
  function straighten(M) {
    const g = M.gltf, hips = g.scene.getObjectByName('mixamorigHips') || g.scene.getObjectByName('mixamorig:Hips'); if (!hips) return;
    g.scene.updateMatrixWorld(true);
    const P = hips.parent.getWorldQuaternion(new THREE.Quaternion()), Pi = P.clone().invert(), up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion(), qw = new THREE.Quaternion(), f = new THREE.Vector3();
    const yawOf = (qq) => { qw.copy(P).multiply(qq); f.set(0, 0, 1).applyQuaternion(qw); if (Math.abs(f.y) > 0.9) { f.set(1, 0, 0).applyQuaternion(qw); return Math.atan2(f.x, f.z) - Math.PI / 2; } return Math.atan2(f.x, f.z); };
    // référence commune : l'orientation du bassin à la première image de la visée (sinon le lancer, dont la première image
    // est déjà tournée de 90°, faisait pivoter tout le corps au début et à la fin du lancer)
    const refTr = M.clips.Rifle_Aim_Turn_Right && M.clips.Rifle_Aim_Turn_Right.tracks.find(t => /Hips\.quaternion$/.test(t.name));
    const y0 = refTr ? yawOf(q.fromArray(refTr.values, 0)) : yawOf(hips.quaternion);
    // pour aligner d'autres poses (garde basse) sur cette référence
    M.alignHips = (bone) => { const d = yawOf(bone.quaternion) - y0; bone.quaternion.copy(Pi.clone().multiply(new THREE.Quaternion().setFromAxisAngle(up, -d)).multiply(P).multiply(bone.quaternion)); };
    for (const n of STRAIGHT) {
      const c = M.clips[n]; if (!c) continue;
      const tr = c.tracks.find(t => /Hips\.quaternion$/.test(t.name)); if (!tr) continue;
      const v = tr.values;
      for (let i = 0; i < v.length; i += 4) {
        q.fromArray(v, i); const d = yawOf(q) - y0;
        // q' = P⁻¹ · Ry(−d) · P · q : on retire la rotation autour de la verticale du monde
        const r = new THREE.Quaternion().setFromAxisAngle(up, -d);
        const out = Pi.clone().multiply(r).multiply(P).multiply(q); out.toArray(v, i);
      }
    }
  }
  // Marche en visant : les jambes (et le bassin) de « Walk_Fight_Forward », le haut du corps figé dans la visée de
  // « Rifle_Aim_Turn_Right » (première image). Dans la marche d'origine le fusil est porté en travers, canon vers le bas :
  // il ne se tenait pas de façon crédible une fois l'arme du jeu mise dans les mains.
  const JAMBES = /(Hips|UpLeg|Leg|Foot|ToeBase|Toe_End)\.(quaternion|position)$/;
  function composite(M) {
    const walk = M.clips.Walk_Fight_Forward, aim = M.clips.Rifle_Aim_Turn_Right; if (!walk || !aim) return;
    const tracks = walk.tracks.filter(t => JAMBES.test(t.name)).map(t => t.clone());
    for (const t of aim.tracks) {
      if (JAMBES.test(t.name)) continue;
      const n = t.getValueSize(), v0 = Array.from(t.values.slice(0, n));
      tracks.push(new t.constructor(t.name, [0, walk.duration], v0.concat(v0)));
    }
    M.clips.Walk_Aim = new THREE.AnimationClip('Walk_Aim', walk.duration, tracks);
  }
  // Marche et course « en garde basse » (pas d'ennemi connu) : jambes de la marche / du petit pas de course, haut du corps
  // de la garde basse (fusil en travers du torse, canon bas).
  function compositeBas(M) {
    const gb = M.clips.Garde_Basse; if (!gb) return;
    // Jambes et bassin d'une vraie marche / course détendue (« Walking », « Running » : balancement du bassin, rebond), et le
    // dos ANIMÉ : on ajoute à la garde basse le mouvement de la colonne de la marche (rotation des épaules, roulis, souplesse),
    // mesuré par rapport à sa pose moyenne. Avant, le haut du corps restait figé : « un balai dans le dos ».
    const DOS = /(Spine|Spine1|Spine2|Neck)\.quaternion$/, POIDS = { Spine: 1, Spine1: 0.9, Spine2: 0.75, Neck: -0.5 };
    const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qm = new THREE.Quaternion(), qi = new THREE.Quaternion();
    for (const [nom, src, alt, ampli] of [['Walk_Low', 'Walking', 'Walk_Fight_Forward', 1], ['Run_Low', 'Run_and_Shoot', 'Running', 2.2], ['Trot_Low', 'Running', 'Walking', TROT.dos]]) {
      const base = M.clips[src] || M.clips[alt]; if (!base) continue;
      const tracks = base.tracks.filter(t => JAMBES.test(t.name)).map(t => t.clone());
      for (const t of gb.tracks) {
        if (JAMBES.test(t.name)) continue;
        const n = t.getValueSize(), v0 = Array.from(t.values.slice(0, n)), m = DOS.exec(t.name);
        const bt = m && base.tracks.find(x => x.name === t.name);
        if (!bt) { tracks.push(new t.constructor(t.name, [0, base.duration], v0.concat(v0))); continue; }
        // pose moyenne de la colonne pendant le cycle, puis écart de chaque image à cette moyenne, ajouté à la garde basse
        const V = bt.values, K = V.length / 4; let sx = 0, sy = 0, sz = 0, sw = 0;
        for (let i = 0; i < K; i++) { const s0 = (V[i * 4] * V[0] + V[i * 4 + 1] * V[1] + V[i * 4 + 2] * V[2] + V[i * 4 + 3] * V[3]) < 0 ? -1 : 1; sx += s0 * V[i * 4]; sy += s0 * V[i * 4 + 1]; sz += s0 * V[i * 4 + 2]; sw += s0 * V[i * 4 + 3]; }
        qm.set(sx, sy, sz, sw).normalize().invert(); qb.fromArray(v0); const w = (POIDS[m[1]] || 1) * ampli, out = new Float32Array(V.length);
        for (let i = 0; i < K; i++) { qa.fromArray(V, i * 4); const d = qm.clone().multiply(qa); if (w < 0) d.invert(); const aw = Math.abs(w); if (aw <= 1) qi.identity().slerp(d, aw); else { const ax = new THREE.Vector3(d.x, d.y, d.z), sn = ax.length(); const ang = 2 * Math.atan2(sn, d.w) * aw; qi.setFromAxisAngle(sn > 1e-6 ? ax.divideScalar(sn) : ax.set(0, 1, 0), ang); } qb.clone().multiply(qi).toArray(out, i * 4); }
        tracks.push(new THREE.QuaternionKeyframeTrack(t.name, Array.from(bt.times), Array.from(out)));
      }
      M.clips[nom] = new THREE.AnimationClip(nom, base.duration, tracks);
    }
    // couches séparées pour recharger en marchant : haut du corps du rechargement seul, jambes seules de la marche / course
    const sr = M.clips.Standing_Reload; if (sr) M.clips.Standing_Reload_Haut = new THREE.AnimationClip('Standing_Reload_Haut', sr.duration, sr.tracks.filter(t => !JAMBES.test(t.name)).map(t => t.clone()));
    for (const [nom, src] of [['Walk_Jambes', 'Walk_Fight_Forward'], ['Run_Jambes', 'Run_and_Shoot']]) { const b = M.clips[src]; if (b) M.clips[nom] = new THREE.AnimationClip(nom, b.duration, b.tracks.filter(t => JAMBES.test(t.name)).map(t => t.clone())); }
  }
  // Marche dans toutes les directions (« blend space ») : jambes seules de quatre cycles — avant, pas chassé à gauche
  // (bibliothèque Meshy), le même en miroir pour la droite, marche arrière — mélangées selon l'angle entre le déplacement
  // et le torse, toutes calées sur la même phase (pied gauche au sol au même instant). Le haut du corps vient de la marche
  // habituelle (visée ou garde basse) sans ses jambes. Avant : on tordait le bassin vers la direction du déplacement,
  // et au-delà de ~60° les pieds ne marchaient plus vraiment là où le soldat allait.
  // Les pas chassés et la marche arrière de la bibliothèque sont des marches « au pistolet », très accroupies (bassin 13 à
  // 19 cm plus bas que la marche avant) : en passant de l'avant au côté, le corps plongeait. On remonte le bassin vers la
  // hauteur de la marche avant (fraction « part » de l'écart) et on recale les jambes par IK (hanche → genou → cheville,
  // genou dans son plan, pied gardant son orientation) pour que les pieds restent exactement où ils étaient : les genoux
  // se déplient. Cuit une fois dans le clip (30 clés/s). Renvoie l'erreur max des chevilles (m, pieds hors d'atteinte).
  function releve(M, clip, cibleY, part) {
    const sc = M.gltf.scene, b = (n) => sc.getObjectByName('mixamorig' + n) || sc.getObjectByName('mixamorig:' + n);
    const hips = b('Hips'), L = [['LeftUpLeg', 'LeftLeg', 'LeftFoot'], ['RightUpLeg', 'RightLeg', 'RightFoot']].map(l => l.map(b));
    if (!hips || L.some(l => l.some(x => !x))) return 0;
    const W = (o) => o.getWorldPosition(new THREE.Vector3()), WQ = (o) => o.getWorldQuaternion(new THREE.Quaternion());
    const mixer = new THREE.AnimationMixer(sc), act = mixer.clipAction(clip); act.play();
    const N = Math.max(4, Math.round(clip.duration * 30)), dur = clip.duration; let sy = 0;
    for (let i = 0; i < N; i++) { mixer.setTime(i / N * dur); sc.updateMatrixWorld(true); sy += W(hips).y; }
    const dy = (cibleY - sy / N) * part; if (dy <= 0.004) { mixer.stopAllAction(); mixer.uncacheRoot(sc); return 0; }
    const tous = [hips].concat(L[0], L[1]), sauve = tous.map(o => [o.quaternion.clone(), o.position.clone()]);
    const times = [], hp = [], qs = L.map(l => l.map(() => [])); let err = 0;
    const turn = (bone, from, to) => { const dq = new THREE.Quaternion().setFromUnitVectors(from.normalize(), to.normalize()); bone.quaternion.copy(WQ(bone.parent).invert().multiply(dq.multiply(WQ(bone)))); bone.updateMatrixWorld(true); };
    for (let i = 0; i <= N; i++) {
      // (le mixer ne réécrit un os que si sa valeur animée change : on remet d'abord les os retouchés à l'image précédente)
      tous.forEach((o, j) => { o.quaternion.copy(sauve[j][0]); o.position.copy(sauve[j][1]); });
      mixer.setTime(i < N ? i / N * dur : 0); sc.updateMatrixWorld(true);
      tous.forEach((o, j) => { sauve[j][0].copy(o.quaternion); sauve[j][1].copy(o.position); });
      const pieds = L.map(l => [W(l[2]), WQ(l[2])]);
      const h0 = W(hips), p0 = hips.parent.worldToLocal(h0.clone()), p1 = hips.parent.worldToLocal(h0.clone().add(new THREE.Vector3(0, dy, 0)));
      hips.position.add(p1.sub(p0)); hips.updateMatrixWorld(true);
      L.forEach(([up, lo, ft], j) => {
        const T = pieds[j][0], S0 = W(up), E0 = W(lo), H0 = W(ft), a = S0.distanceTo(E0), bb = E0.distanceTo(H0);
        let c = S0.distanceTo(T); c = Math.min(Math.max(c, Math.abs(a - bb) + 1e-4), (a + bb) * 0.999);
        const dir = T.clone().sub(S0).normalize(), cosA = Math.max(-1, Math.min(1, (a * a + c * c - bb * bb) / (2 * a * c)));
        const p = E0.clone().sub(S0); p.addScaledVector(dir, -p.dot(dir)); if (p.lengthSq() < 1e-10) p.set(0, 0, 1); p.normalize();
        const E1 = S0.clone().addScaledVector(dir, a * cosA).addScaledVector(p, a * Math.sqrt(1 - cosA * cosA));
        turn(up, E0.clone().sub(S0), E1.sub(S0)); const E2 = W(lo); turn(lo, W(ft).sub(E2), T.clone().sub(E2));
        ft.quaternion.copy(WQ(ft.parent).invert().multiply(pieds[j][1])); ft.updateMatrixWorld(true);
        err = Math.max(err, W(ft).distanceTo(T));
      });
      times.push(i / N * dur); hp.push(...hips.position.toArray()); L.forEach((l, j) => l.forEach((o, k) => qs[j][k].push(...o.quaternion.toArray())));
    }
    tous.forEach((o, j) => { o.quaternion.copy(sauve[j][0]); o.position.copy(sauve[j][1]); });
    mixer.stopAllAction(); mixer.uncacheRoot(sc);
    const nm = (o) => THREE.PropertyBinding.sanitizeNodeName(o.name), neuves = [new THREE.VectorKeyframeTrack(nm(hips) + '.position', times, hp)];
    L.forEach((l, j) => l.forEach((o, k) => neuves.push(new THREE.QuaternionKeyframeTrack(nm(o) + '.quaternion', times, qs[j][k]))));
    const noms = new Set(neuves.map(t => t.name));
    clip.tracks = clip.tracks.filter(t => !noms.has(t.name)).concat(neuves); clip.resetDuration(); clip.duration = dur;
    sc.updateMatrixWorld(true);
    return err * HEIGHT / RAW_H;
  }
  // Cycle propre extrait d'une animation générée (Meshy « texte → mouvement ») : elle ne boucle pas, commence par un départ
  // arrêté. On cherche la fenêtre [t1, t1 + p] (t1 dans [tMin, tMax], p dans [pMin, pMax]) dont la pose de fin ressemble le plus
  // à celle du début (rotations des os des jambes, hauteur du bassin), on la rééchantillonne à 30 clés/s et l'écart restant au
  // raccord est réparti linéairement sur le cycle (la dernière clé est exactement la première). Jambes et bassin seulement.
  function cycle(c, nom, tMin, tMax, pMin, pMax) {
    const tr = c.tracks.filter(t => JAMBES.test(t.name)); if (!tr.length) return null;
    const it = tr.map(t => t.createInterpolant()), val = (t) => it.map(i => Array.from(i.evaluate(t)));
    const ecart = (a, b) => { let d = 0; tr.forEach((t, j) => { if (/quaternion$/.test(t.name)) { const x = a[j], y = b[j]; d += 1 - Math.abs(x[0] * y[0] + x[1] * y[1] + x[2] * y[2] + x[3] * y[3]); } else d += Math.abs(a[j][1] - b[j][1]) * 2; }); return d; };
    let best = null;
    for (let t1 = tMin; t1 <= tMax + 1e-6; t1 += 1 / 30) { const a = val(t1); for (let p = pMin; p <= pMax + 1e-6 && t1 + p <= c.duration; p += 1 / 30) { const d = ecart(a, val(t1 + p)); if (!best || d < best.d) best = { d, t1, p }; } }
    if (!best) return null;
    const N = Math.max(4, Math.round(best.p * 30)), v0 = val(best.t1), v1 = val(best.t1 + best.p), q = new THREE.Quaternion(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qi = new THREE.Quaternion();
    const times = [], vals = tr.map(() => []);
    for (let i = 0; i <= N; i++) {
      const u = i / N, v = val(best.t1 + u * best.p); times.push(u * best.p);
      tr.forEach((t, j) => {
        if (/quaternion$/.test(t.name)) { qa.fromArray(v0[j]); qb.fromArray(v1[j]); const dq = qa.clone().multiply(qb.clone().invert()); q.fromArray(v[j]); qi.identity().slerp(dq, u).multiply(q).toArray(vals[j], vals[j].length); }
        else for (let k = 0; k < v[j].length; k++) vals[j].push(v[j][k] + (v0[j][k] - v1[j][k]) * u);
      });
    }
    const out = new THREE.AnimationClip(nom, best.p, tr.map((t, j) => new t.constructor(t.name, times, vals[j])));
    out.userData = { t1: best.t1, p: best.p, ecart: best.d }; return out;
  }
  // IK des jambes cuite dans un clip (30 clés/s) : pour chaque image, cible(i, H, A, Aq) donne la position monde voulue de
  // chaque cheville (A, Aq : cheville et orientation d'origine ; H : bassin) ; dyH(i) : montée du bassin (m, unités du
  // modèle). Genou dans son plan, pied gardant son orientation monde. Renvoie le nouveau clip (jambes seules) et l'erreur max.
  function jambesIK(M, src, nom, cible, dyH) {
    const sc = M.gltf.scene, b = (n) => sc.getObjectByName('mixamorig' + n) || sc.getObjectByName('mixamorig:' + n);
    const hips = b('Hips'), L = [['LeftUpLeg', 'LeftLeg', 'LeftFoot'], ['RightUpLeg', 'RightLeg', 'RightFoot']].map(l => l.map(b));
    if (!hips || L.some(l => l.some(x => !x))) return null;
    const W = (o) => o.getWorldPosition(new THREE.Vector3()), WQ = (o) => o.getWorldQuaternion(new THREE.Quaternion());
    const clip = new THREE.AnimationClip(nom, src.duration, src.tracks.filter(t => JAMBES.test(t.name)).map(t => t.clone()));
    const mixer = new THREE.AnimationMixer(sc), act = mixer.clipAction(clip); act.play();
    const N = Math.max(4, Math.round(clip.duration * 30)), dur = clip.duration;
    const tous = [hips].concat(L[0], L[1]), sauve = tous.map(o => [o.quaternion.clone(), o.position.clone()]);
    const turn = (bone, from, to) => { const dq = new THREE.Quaternion().setFromUnitVectors(from.normalize(), to.normalize()); bone.quaternion.copy(WQ(bone.parent).invert().multiply(dq.multiply(WQ(bone)))); bone.updateMatrixWorld(true); };
    const times = [], hp = [], qs = L.map(l => l.map(() => [])); let err = 0;
    for (let i = 0; i <= N; i++) {
      tous.forEach((o, j) => { o.quaternion.copy(sauve[j][0]); o.position.copy(sauve[j][1]); });
      mixer.setTime(i < N ? i / N * dur : 0); sc.updateMatrixWorld(true);
      tous.forEach((o, j) => { sauve[j][0].copy(o.quaternion); sauve[j][1].copy(o.position); });
      const H = W(hips), A = L.map(l => W(l[2])), Aq = L.map(l => WQ(l[2])), T = cible(i % N, H, A, Aq), dy = dyH ? dyH(i % N) : 0;
      if (dy) { const p0 = hips.parent.worldToLocal(H.clone()), p1 = hips.parent.worldToLocal(H.clone().add(new THREE.Vector3(0, dy, 0))); hips.position.add(p1.sub(p0)); hips.updateMatrixWorld(true); }
      L.forEach(([up, lo, ft], j) => {
        const Tj = T[j], S0 = W(up), E0 = W(lo), a = S0.distanceTo(E0), bb = E0.distanceTo(W(ft));
        let c = S0.distanceTo(Tj); c = Math.min(Math.max(c, Math.abs(a - bb) + 1e-4), (a + bb) * 0.999);
        const dir = Tj.clone().sub(S0).normalize(), cosA = Math.max(-1, Math.min(1, (a * a + c * c - bb * bb) / (2 * a * c)));
        const p = E0.clone().sub(S0); p.addScaledVector(dir, -p.dot(dir)); if (p.lengthSq() < 1e-10) p.set(0, 0, 1); p.normalize();
        const E1 = S0.clone().addScaledVector(dir, a * cosA).addScaledVector(p, a * Math.sqrt(1 - cosA * cosA));
        turn(up, E0.clone().sub(S0), E1.sub(S0)); const E2 = W(lo); turn(lo, W(ft).sub(E2), Tj.clone().sub(E2));
        ft.quaternion.copy(WQ(ft.parent).invert().multiply(Aq[j])); ft.updateMatrixWorld(true);
        err = Math.max(err, W(ft).distanceTo(Tj));
      });
      times.push(i / N * dur); hp.push(...hips.position.toArray()); L.forEach((l, j) => l.forEach((o, k) => qs[j][k].push(...o.quaternion.toArray())));
    }
    tous.forEach((o, j) => { o.quaternion.copy(sauve[j][0]); o.position.copy(sauve[j][1]); });
    mixer.stopAllAction(); mixer.uncacheRoot(sc); sc.updateMatrixWorld(true);
    const nm = (o) => THREE.PropertyBinding.sanitizeNodeName(o.name), neuves = [new THREE.VectorKeyframeTrack(nm(hips) + '.position', times, hp)];
    L.forEach((l, j) => l.forEach((o, k) => neuves.push(new THREE.QuaternionKeyframeTrack(nm(o) + '.quaternion', times, qs[j][k]))));
    const noms = new Set(neuves.map(t => t.name));
    clip.tracks = clip.tracks.filter(t => !noms.has(t.name)).concat(neuves); clip.resetDuration(); clip.duration = dur;
    clip.userData = { err: err * HEIGHT / RAW_H }; return clip;
  }
  // Petite course de patrouille (« Pas_Trot ») tirée de la vraie course (« Running », athlétique : 4,6 m/s, foulée de 3 m) :
  // foulée raccourcie (« stride warping » : position avant / arrière des chevilles par rapport au bassin × s, autour de leur
  // position moyenne), pieds levés moins haut (× hs) et bassin un peu remonté (jambes moins écartées → moins fléchies).
  // Même cadence que la course : vitesse naturelle ≈ s × 4,6 m/s. Droit, souple, pieds dans l'axe : un trot de patrouille,
  // pas la course accroupie « au fusil » (Run_and_Shoot) qui faisait un petit trottinement de crabe sans ennemi en vue.
  function foulee(M, src, nom, s, hs, rise) {
    const sc = M.gltf.scene, b = (n) => sc.getObjectByName('mixamorig' + n) || sc.getObjectByName('mixamorig:' + n), hips = b('Hips'), F = [b('LeftFoot'), b('RightFoot')];
    if (!src || !hips || !F[0] || !F[1]) return null;
    const mixer = new THREE.AnimationMixer(sc); mixer.clipAction(src).play();
    const N = Math.max(4, Math.round(src.duration * 30)), W = (o) => o.getWorldPosition(new THREE.Vector3());
    let gy = 1e9, mz = 0; const ech = [];
    for (let i = 0; i < N; i++) { mixer.setTime(i / N * src.duration); sc.updateMatrixWorld(true); const H = W(hips), A = F.map(W); ech.push([H, A]); A.forEach(a => { gy = Math.min(gy, a.y); mz += (a.z - H.z) / (2 * N); }); }
    mixer.stopAllAction(); mixer.uncacheRoot(sc); sc.updateMatrixWorld(true);
    const cib = (H, a) => new THREE.Vector3(a.x, gy + (a.y - gy) * hs, H.z + mz + s * (a.z - H.z - mz));
    // montée du bassin : longueur bassin → cheville d'appui conservée en moyenne (part « rise »)
    let mont = 0; for (const [H, A] of ech) { const j = A[0].y < A[1].y ? 0 : 1, d0 = H.distanceTo(A[j]), h0 = Math.hypot(A[j].x - H.x, A[j].z - H.z), t = cib(H, A[j]), h1 = Math.hypot(t.x - H.x, t.z - H.z); mont += (Math.sqrt(Math.max(0, d0 * d0 - h1 * h1)) - Math.sqrt(Math.max(0, d0 * d0 - h0 * h0))) / N; }
    const dy = mont * rise;
    // pied moins cambré (la course attaque le sol pointe en avant, très tendue) : inclinaison cheville → pointe ramenée vers
    // celle de la pose de repos (part 1 − kp de l'écart), pour une attaque du sol plus à plat de petite foulée
    const toes = [b('LeftToeBase'), b('RightToeBase')], gb = M.clips.Garde_Basse; let p0 = 0.6, tR = null;
    if (gb && toes[0]) { const mx = new THREE.AnimationMixer(sc); mx.clipAction(gb).play(); mx.setTime(0); sc.updateMatrixWorld(true); const f = W(toes[0]).sub(W(F[0])); p0 = Math.atan2(-f.y, Math.hypot(f.x, f.z)); tR = Math.min(W(toes[0]).y, W(toes[1]).y); mx.stopAllAction(); mx.uncacheRoot(sc); sc.updateMatrixWorld(true); }
    const kp = TROT.kp, up = new THREE.Vector3(0, 1, 0), k = RAW_H / HEIGHT;
    return jambesIK(M, src, nom, (i, H, A, Aq) => {
      const H0 = H.clone(), out = A.map(a => cib(H0, a)), fr = [null, null];
      if (toes[0] && toes[1]) A.forEach((a, j) => { const f = W(toes[j]).sub(a), h = Math.hypot(f.x, f.z), len = f.length(); if (h < 1e-4) return; const p = Math.atan2(-f.y, h), np = kp < 1 ? p0 + (p - p0) * kp : p;
        const fh = new THREE.Vector3(f.x / h, 0, f.z / h), f1 = fh.clone().multiplyScalar(Math.cos(np)).addScaledVector(up, -Math.sin(np)); Aq[j] = new THREE.Quaternion().setFromUnitVectors(f.clone().normalize(), f1).multiply(Aq[j]); fr[j] = f1.multiplyScalar(len); });
      // pied d'appui (le plus bas, près du sol) : sa plante posée au sol (hauteur de repos des orteils) une fois le pied redressé
      if (tR !== null && fr[0] && fr[1]) { const j = out[0].y + fr[0].y < out[1].y + fr[1].y ? 0 : 1, ty = out[j].y + fr[j].y, w = Math.max(0, Math.min(1, 1 - (ty - tR) / (0.08 * k)));
        if (w > 0) out[j].y += (tR - ty) * w; }
      return out; }, () => dy);
  }
  // Pieds au sol : la plupart des cycles de la bibliothèque « flottent » (la pointe la plus basse du cycle 1 à 6 cm au-dessus
  // du sol, mesuré). On descend (ou remonte) le bassin de tout le clip pour que la pointe la plus basse soit à sa hauteur de
  // repos (pose de garde basse). Renvoie le décalage appliqué (m, jeu).
  function aterrir(M, clip, repos) {
    const sc = M.gltf.scene, b = (n) => sc.getObjectByName('mixamorig' + n) || sc.getObjectByName('mixamorig:' + n), hips = b('Hips'), T = [b('LeftToeBase'), b('RightToeBase')];
    if (!clip || !hips || !T[0] || !T[1]) return 0;
    const mixer = new THREE.AnimationMixer(sc); mixer.clipAction(clip).play(); let m = 1e9; const N = Math.max(8, Math.round(clip.duration * 60));
    for (let i = 0; i < N; i++) { mixer.setTime(i / N * clip.duration); sc.updateMatrixWorld(true); for (const t of T) m = Math.min(m, t.getWorldPosition(new THREE.Vector3()).y); }
    const H = hips.getWorldPosition(new THREE.Vector3()); mixer.stopAllAction(); mixer.uncacheRoot(sc); sc.updateMatrixWorld(true);
    const dy = repos - m; if (Math.abs(dy) < 0.002) return 0;
    const d = hips.parent.worldToLocal(H.clone().add(new THREE.Vector3(0, dy, 0))).sub(hips.parent.worldToLocal(H.clone()));
    const tr = clip.tracks.find(t => /Hips\.position$/.test(t.name)); if (!tr) return 0;
    const i0 = clip.tracks.indexOf(tr), nt = tr.clone(), v = nt.values; for (let i = 0; i < v.length; i += 3) { v[i] += d.x; v[i + 1] += d.y; v[i + 2] += d.z; }
    clip.tracks[i0] = nt; return dy * HEIGHT / RAW_H;
  }
  // À genou (Kneeling_Reload, dont la pose de couverture accroupie est tirée) : dans l'animation le genou arrière reste à
  // ~18 cm du sol, sur la pointe d'un pied qui flotte (3 à 7 cm), l'autre pied flotte aussi : un accroupi instable. Cuit sur
  // tout le clip : genou arrière posé au sol (cuisse ramenée sous la hanche), tibia couché vers l'arrière, orteils au sol ;
  // pied avant à plat au sol. Bassin inchangé (le haut du corps et l'arme ne bougent pas).
  function genou(M) {
    const src = M.clips.Kneeling_Reload; if (!src) return;
    const sc = M.gltf.scene, b = (n) => sc.getObjectByName('mixamorig' + n) || sc.getObjectByName('mixamorig:' + n);
    const L = [['LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase'], ['RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase']].map(l => l.map(b)); if (L.some(l => l.some(x => !x))) return;
    const W = (o) => o.getWorldPosition(new THREE.Vector3()), k = RAW_H / HEIGHT, tR = (M.toeR || 0.04) * k, K = GENOU.genou * k, AY = GENOU.cheville * k;
    const legs = jambesIK(M, src, 'Kneeling_Reload', (i, H, A, Aq) => {
      const N = L.map(l => W(l[1])), r = N[0].y < N[1].y ? 0 : 1, f = 1 - r, out = A.map(a => a.clone());
      // jambe arrière : genou au sol à l'aplomb (presque) de la hanche, tibia vers l'arrière, cheville à AY
      { const S0 = W(L[r][0]), a = S0.distanceTo(N[r]), bb = N[r].distanceTo(A[r]), dh0 = new THREE.Vector3(N[r].x - S0.x, 0, N[r].z - S0.z), dh = Math.sqrt(Math.max(0, a * a - (S0.y - K) ** 2));
        if (dh0.lengthSq() < 1e-8) dh0.set(0, 0, 1); dh0.normalize();
        const Nt = S0.clone().addScaledVector(dh0, dh); Nt.y = K;
        const sh = new THREE.Vector3(A[r].x - N[r].x, 0, A[r].z - N[r].z); if (sh.lengthSq() < 1e-8) sh.copy(dh0).negate(); sh.normalize();
        const hz = Math.sqrt(Math.max(0, bb * bb - (AY - K) ** 2)); out[r] = Nt.clone().addScaledVector(sh, hz); out[r].y = AY;
        // orteils au sol : le pied tourne autour de la cheville pour que sa pointe touche le sol
        const T = W(L[r][3]), fv = T.clone().sub(A[r]), len = fv.length(), h = Math.hypot(fv.x, fv.z);
        if (len > 1e-4 && h > 1e-4) { const y1 = Math.max(-len * 0.98, tR + 0.012 * k - AY), h1 = Math.sqrt(len * len - y1 * y1), f1 = new THREE.Vector3(fv.x / h * h1, y1, fv.z / h * h1);
          Aq[r] = new THREE.Quaternion().setFromUnitVectors(fv.clone().normalize(), f1.normalize()).multiply(Aq[r]); } }
      // pied avant : posé à plat (on le descend de ce qu'il flotte)
      { const T = W(L[f][3]), fl = Math.min(T.y - tR, A[f].y - GENOU.chevilleAv * k); if (fl > 0) out[f].y -= fl; }
      return out; });
    if (!legs) return;
    const noms = new Set(legs.tracks.map(t => t.name));
    M.clips.Kneeling_Reload = new THREE.AnimationClip('Kneeling_Reload', src.duration, src.tracks.filter(t => !noms.has(t.name)).concat(legs.tracks));
  }
  // Points de semelle de chaque pied (talon, plante sous l'articulation des orteils, bout), mesurés sur le maillage en pose
  // de repos (sommets les plus bas) et exprimés dans le repère de l'os du pied / des orteils : le jeu sait ainsi où est
  // vraiment la semelle (pied posé à plat, sur la pointe, sur le talon) pour la poser AU sol, ni dedans ni au-dessus.
  function semelle(M) {
    const gb = M.clips.Garde_Basse, sc = M.gltf.scene, b = (n) => sc.getObjectByName('mixamorig' + n) || sc.getObjectByName('mixamorig:' + n); if (!gb) return;
    const mx = new THREE.AnimationMixer(sc); mx.clipAction(gb).play(); mx.setTime(0); sc.updateMatrixWorld(true);
    const pts = [], v = new THREE.Vector3(); let ymin = 1e9;
    sc.traverse(o => { if (!o.isSkinnedMesh) return; o.skeleton.update(); const n = o.geometry.attributes.position.count; for (let i = 0; i < n; i++) { o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld); if (v.y < 0.2) { pts.push(v.clone()); ymin = Math.min(ymin, v.y); } } });
    const out = [];
    ['Left', 'Right'].forEach((c, j) => {
      const ft = b(c + 'Foot'), toe = b(c + 'ToeBase'); if (!ft || !toe) return;
      const A = ft.getWorldPosition(new THREE.Vector3()), T = toe.getWorldPosition(new THREE.Vector3());
      // (sommets bas les plus proches de ce pied)
      const proches = pts.filter(p => p.y < ymin + 0.03 && Math.hypot(p.x - A.x, p.z - A.z) < 0.25);
      if (proches.length < 3) return;
      let talon = proches[0], bout = proches[0]; for (const p of proches) { if (p.z < talon.z) talon = p; if (p.z > bout.z) bout = p; }
      const loc = (o, p) => o.worldToLocal(p.clone());
      out[j] = { talon: loc(ft, talon), plante: loc(toe, new THREE.Vector3(T.x, ymin, T.z)), bout: loc(toe, bout), sol0: ymin * HEIGHT / RAW_H };
    });
    mx.stopAllAction(); mx.uncacheRoot(sc); sc.updateMatrixWorld(true);
    if (out[0] && out[1]) M.semelle = out;
  }
  function directions(M) {
    const G = M.clips.Walk_Left_with_Gun, B = M.clips.Walk_Backward_with_Gun; if (!G || !B) return;
    const legs = (c, nom) => c && new THREE.AnimationClip(nom, c.duration, c.tracks.filter(t => JAMBES.test(t.name)).map(t => t.clone()));
    M.clips.Pas_Gauche = legs(G, 'Pas_Gauche'); M.clips.Pas_Arriere = legs(B, 'Pas_Arriere');
    // marche arrière générée (« Recul_IA » : pieds à largeur de hanches, jamais croisés, bassin presque de face) si le modèle
    // l'a : un cycle propre en est extrait (~1,7 s, deux pas) ; sinon la marche arrière de la bibliothèque. (« Pas_Chasse_IA »,
    // essayé pour le pas chassé, croise les pieds davantage que l'ancien et est trop lent : non utilisé.)
    if (MARCHE_IA && M.clips.Recul_IA) { const R = cycle(M.clips.Recul_IA, 'Pas_Arriere', 0.2, 1.3, 1.4, 2.4); if (R) { M.clips.Pas_Arriere = R; M.recul = R.userData; } }
    // bassin remonté vers celui de la marche avant (sans dépasser ce que les jambes permettent : genoux jamais tendus à fond)
    { const sc = M.gltf.scene, hb = sc.getObjectByName('mixamorigHips') || sc.getObjectByName('mixamorig:Hips'), ref = M.clips.Walk_Fight_Forward;
      if (hb && ref) { const mx = new THREE.AnimationMixer(sc); mx.clipAction(ref).play(); let s = 0; for (let i = 0; i < 20; i++) { mx.setTime(i / 20 * ref.duration); sc.updateMatrixWorld(true); s += hb.getWorldPosition(new THREE.Vector3()).y; } mx.stopAllAction(); mx.uncacheRoot(sc);
        M.releveErr = {};
        // (fraction réduite tant que les pieds ne touchent plus le sol à jambes tendues : erreur > 2,5 cm)
        for (const [n, part0] of [['Pas_Gauche', RELEVE.cote], ['Pas_Arriere', RELEVE.arriere]]) { const src = M.clips[n];
          for (const part of [part0, 0.7, 0.55, 0.4]) { const c = src.clone(); c.name = n; const err = releve(M, c, s / 20, part); M.clips[n] = c; M.releveErr[n] = [+err.toFixed(3), part]; if (err <= 0.025) break; } } } }
    // miroir gauche → droite (les repères des os gauche/droite du squelette Mixamo sont symétriques : q → (x, −y, −z, w))
    const D = legs(M.clips.Pas_Gauche, 'Pas_Droite');   // (celui dont le bassin a été remonté)
    for (const t of D.tracks) {
      t.name = t.name.replace(/Left|Right/g, (w) => (w === 'Left' ? 'Right' : 'Left'));
      const v = t.values;
      if (/quaternion$/.test(t.name)) for (let i = 0; i < v.length; i += 4) { v[i + 1] = -v[i + 1]; v[i + 2] = -v[i + 2]; }
      else if (/position$/.test(t.name)) for (let i = 0; i < v.length; i += 3) v[i] = -v[i];
    }
    M.clips.Pas_Droite = D;
    M.clips.Pas_Avant_Aim = legs(M.clips.Walk_Fight_Forward, 'Pas_Avant_Aim');
    M.clips.Pas_Avant_Low = legs(M.clips.Walking || M.clips.Walk_Fight_Forward, 'Pas_Avant_Low');
    // course (petites foulées, ~1,5 à 3 m/s) : mêmes pas chassés / marche arrière, mais la marche avant est la course de
    // « Run_and_Shoot » (jambes de Run_Low aussi) ; hauts du corps de la course (visée ou garde basse qui balance)
    M.clips.Pas_Avant_Course = legs(M.clips.Run_and_Shoot, 'Pas_Avant_Course');
    // patrouille (pas d'ennemi connu) : marche → petite course → course, mélangées selon la vitesse (voir marche())
    const TR = Object.assign({}, TROT, root.TROT_TEST || {});
    if (M.clips.Running) { const t = foulee(M, M.clips.Running, 'Pas_Trot', TR.s, TR.hs, TR.rise); if (t) { M.clips.Pas_Trot = t; M.trotErr = t.userData.err; } M.clips.Pas_Run = legs(M.clips.Running, 'Pas_Run'); }
    // marche en visant (« Pas_Glisse ») : la marche naturelle, bassin abaissé de GLISSE m (genoux fléchis, pieds aux mêmes
    // places) : la marche « glissée » d'un tireur qui progresse arme épaulée (talon-pointe, buste stable), au lieu du pas
    // d'affût très lent de Walk_Fight_Forward ou de la course accroupie de Run_and_Shoot
    if (M.clips.Walking) { const g = jambesIK(M, M.clips.Walking, 'Pas_Glisse', (i, H, A) => A.map(a => a.clone()), () => -GLISSE * RAW_H / HEIGHT); if (g) M.clips.Pas_Glisse = g; }
    // pieds au sol (pointe la plus basse du cycle à sa hauteur de repos)
    { const sc = M.gltf.scene, gb = M.clips.Garde_Basse, T = ['LeftToeBase', 'RightToeBase'].map(n => sc.getObjectByName('mixamorig' + n) || sc.getObjectByName('mixamorig:' + n));
      if (gb && T[0] && T[1]) { const mx = new THREE.AnimationMixer(sc); mx.clipAction(gb).play(); mx.setTime(0); sc.updateMatrixWorld(true); const repos = Math.min(...T.map(t => t.getWorldPosition(new THREE.Vector3()).y)); M.toeR = repos * HEIGHT / RAW_H; { const fa = ['LeftFoot', 'RightFoot'].map(n => sc.getObjectByName('mixamorig' + n) || sc.getObjectByName('mixamorig:' + n)); if (fa[0] && fa[1]) M.ankR = Math.min(...fa.map(t => t.getWorldPosition(new THREE.Vector3()).y)) * HEIGHT / RAW_H; } mx.stopAllAction(); mx.uncacheRoot(sc); sc.updateMatrixWorld(true);
        M.solDy = {}; for (const n of ['Pas_Avant_Low', 'Pas_Avant_Aim', 'Pas_Avant_Course', 'Pas_Trot', 'Pas_Run', 'Pas_Glisse', 'Pas_Gauche', 'Pas_Droite', 'Pas_Arriere']) if (M.clips[n]) M.solDy[n] = +aterrir(M, M.clips[n], repos).toFixed(3); } }
    for (const n of ['Walk_Aim', 'Walk_Low', 'Run_and_Shoot', 'Run_Low', 'Trot_Low']) { const c = M.clips[n]; if (c) { M.clips[n + '_Haut'] = new THREE.AnimationClip(n + '_Haut', c.duration, c.tracks.filter(t => !JAMBES.test(t.name)).map(t => t.clone())); } }
    if (M.yawFix.Walk_Aim !== undefined) M.yawFix.Walk_Aim_Haut = M.yawFix.Walk_Aim;
    try { genou(M); } catch (e) { console.warn('soldat 3D (genou) :', e); }
    try { semelle(M); } catch (e) { console.warn('soldat 3D (semelle) :', e); }
    M.dirs = true;
  }
  // Vitesse « naturelle » de chaque cycle de locomotion (m/s, pour un soldat de 1,80 m) : pendant l'appui, le pied recule
  // par rapport au bassin à la vitesse du sol. Le jeu lit l'animation à (vitesse réelle / vitesse naturelle) : plus de pieds
  // qui glissent. Mesurée sur les pieds, car les animations Meshy n'ont pas de déplacement de racine fiable.
  const LOCOS = ['Walk_Fight_Forward', 'Walk_Aim', 'Walk_Low', 'Run_and_Shoot', 'Run_Low', 'Cautious_Crouch_Walk_Forward', 'Walking', 'Running', 'Pas_Avant_Aim', 'Pas_Avant_Low', 'Pas_Avant_Course', 'Pas_Gauche', 'Pas_Droite', 'Pas_Arriere', 'Pas_Trot', 'Pas_Run', 'Trot_Low', 'Pas_Glisse'];
  function mesureLoco(M) {
    const sc = M.gltf.scene, b = (n) => sc.getObjectByName('mixamorig' + n) || sc.getObjectByName('mixamorig:' + n);
    const hips = b('Hips'), feet = [b('LeftToeBase'), b('RightToeBase')]; if (!hips || !feet[0] || !feet[1]) return;
    M.loco = {}; M.phase0 = {}; M.hipsYaw = {}; const k = HEIGHT / RAW_H, lu = b('LeftUpLeg'), ru = b('RightUpLeg');
    for (const clip of LOCOS) {
      const c = M.clips[clip]; if (!c) continue;
      const mixer = new THREE.AnimationMixer(sc), act = mixer.clipAction(c); act.play(); const N = 60, dur = c.duration;
      const P = [[], []], H = [];
      for (let i = 0; i < N; i++) { mixer.setTime(i / N * dur); sc.updateMatrixWorld(true); H.push(hips.getWorldPosition(new THREE.Vector3())); feet.forEach((ft, j) => P[j].push(ft.getWorldPosition(new THREE.Vector3()))); }
      let sv = 0, n = 0, dx = 0, dz = 0;
      feet.forEach((ft, j) => { const ymin = Math.min(...P[j].map(p => p.y)); for (let i = 0; i < N; i++) { if (P[j][i].y > ymin + 0.03 || P[j][i].y > P[1 - j][i].y + 0.01) continue;   // (appui : pied bas ET le plus bas des deux ; sinon un pied en l'air qui rase le sol comptait)
        const i2 = (i + 1) % N; const v = P[j][i2].clone().sub(H[i2]).sub(P[j][i].clone().sub(H[i])).divideScalar(dur / N); v.y = 0; sv += v.length(); n++; dx -= v.x; dz -= v.z; } });
      M.loco[clip] = n ? sv / n * k : 1;
      // direction RÉELLE du déplacement (rad, repère du modèle : 0 = devant, > 0 = vers sa gauche, +X). « Walk_Left_with_Gun »
      // va en fait vers la DROITE du soldat : la marche directionnelle se fie à cette mesure, pas au nom des animations.
      (M.dirPas || (M.dirPas = {}))[clip] = Math.atan2(dx, dz);
      // phase du pied gauche au sol (moyenne circulaire des instants d'appui) et orientation moyenne du bassin
      { const ymin = Math.min(...P[0].map(p => p.y)); let cx = 0, cy = 0; for (let i = 0; i < N; i++) if (P[0][i].y < ymin + 0.025) { cx += Math.cos(i / N * 2 * Math.PI); cy += Math.sin(i / N * 2 * Math.PI); }
        M.phase0[clip] = ((Math.atan2(cy, cx) / (2 * Math.PI)) + 1) % 1; }
      if (lu && ru) { let cx = 0, cy = 0; for (let i = 0; i < N; i++) { mixer.setTime(i / N * dur); sc.updateMatrixWorld(true); const d = ru.getWorldPosition(new THREE.Vector3()).sub(lu.getWorldPosition(new THREE.Vector3())); const a = Math.atan2(d.x, d.z); cx += Math.cos(a); cy += Math.sin(a); } M.hipsYaw[clip] = Math.atan2(cy, cx); }
      mixer.stopAllAction(); mixer.uncacheRoot(sc);
    }
    // Calage de phase des pas chassés sur chaque marche avant (pour le mélange en diagonale) : « pied gauche au sol » ne
    // suffit pas (dans un pas chassé, le pied gauche est tantôt celui qui mène, tantôt celui qui suit). On essaie 20
    // décalages et on garde celui où le mélange 50/50 avance le plus franchement (pas qui s'annulent = démarche incohérente).
    M.decal = {};
    for (const av of ['Pas_Avant_Aim', 'Pas_Avant_Low', 'Pas_Avant_Course', 'Pas_Trot', 'Pas_Glisse']) for (const cote of ['Pas_Gauche', 'Pas_Droite']) {
      const A = M.clips[av], C = M.clips[cote]; if (!A || !C) continue;
      const mx = new THREE.AnimationMixer(sc), a = mx.clipAction(A), c = mx.clipAction(C); a.play(); c.play(); a.setEffectiveWeight(0.5); c.setEffectiveWeight(0.5); a.timeScale = 0; c.timeScale = 0;
      const K = 20, NS = 24, mag = [], h = new THREE.Vector3(), p = new THREE.Vector3();
      for (let o = 0; o < K; o++) {
        const P = [[], []];
        for (let i = 0; i < NS; i++) { a.time = ((i / NS + M.phase0[av]) % 1) * A.duration; c.time = ((i / NS + M.phase0[cote] + o / K) % 1) * C.duration; mx.update(0); sc.updateMatrixWorld(true); hips.getWorldPosition(h); feet.forEach((f, j) => { f.getWorldPosition(p); P[j].push([p.x - h.x, p.y, p.z - h.z]); }); }
        let sx = 0, sz = 0; P.forEach(pp => { const ym = Math.min(...pp.map(q => q[1])); for (let i = 0; i < NS; i++) { const q = pp[(i + 1) % NS]; if (pp[i][1] > ym + 0.03) continue; sx -= q[0] - pp[i][0]; sz -= q[2] - pp[i][2]; } });
        // (et dans la bonne direction : celle de la somme des deux foulées ; un mélange qui avance de travers est écarté)
        const ta = M.dirPas[av] || 0, tc = M.dirPas[cote] || 0, La = M.loco[av] * A.duration, Lc = M.loco[cote] * C.duration;
        const err = Math.atan2(sx, sz) - Math.atan2(La * Math.sin(ta) + Lc * Math.sin(tc), La * Math.cos(ta) + Lc * Math.cos(tc));
        mag.push(Math.hypot(sx, sz) * Math.pow(Math.max(0, Math.cos(err)), 6));
      }
      let best = 0, bv = -1; for (let o = 0; o < K; o++) { const s = 2 * mag[o] + mag[(o + 1) % K] + mag[(o + K - 1) % K]; if (s > bv) { bv = s; best = o; } }
      (M.decal[av] || (M.decal[av] = {}))[cote] = best / K;
      mx.stopAllAction(); mx.uncacheRoot(sc);
    }
    // chutes : de combien le corps allongé flotte au-dessus du sol à la fin (le jeu le redescend pendant la chute)
    M.chuteY = {}; const bones = []; sc.traverse(o => { if (o.isBone) bones.push(o); });
    for (const clip of ['Shot_and_Fall_Forward', 'Shot_in_the_Back_and_Fall']) {
      const c = M.clips[clip]; if (!c) continue;
      const mixer = new THREE.AnimationMixer(sc), act = mixer.clipAction(c); act.play(); mixer.setTime(c.duration - 0.02); sc.updateMatrixWorld(true);
      let ymin = 1e9; for (const o of bones) { if (!/mixamorig/.test(o.name) || /_End$|Top/.test(o.name)) continue; ymin = Math.min(ymin, o.getWorldPosition(new THREE.Vector3()).y); }   // (os parasites Bone_xxx ignorés)
      // allongé, le bassin est à ~12 cm du sol ; on descend d'autant, sans enfoncer un membre de plus de 3 cm
      const hy = hips.getWorldPosition(new THREE.Vector3()).y * k;
      M.chuteY[clip] = Math.max(0, Math.min(hy - 0.12, ymin * k + 0.03)); mixer.stopAllAction(); mixer.uncacheRoot(sc);
    }
    sc.updateMatrixWorld(true);
  }
  // « Garde basse » (pose fixe, Garde_Basse) : debout bien droit, face à l'avant, fusil en travers du torse — crosse
  // vers l'épaule droite, canon vers le bas à gauche et un peu en avant. Aucune animation ne l'a : on la construit.
  //  1. corps : pose de repos du modèle (bassin, jambes, dos, tête droits) ; doigts : ceux de la visée (ils tiennent l'arme) ;
  //  2. fusil : placé dans l'espace devant le soldat (GB.paume = paume droite sur la poignée, GB.canon = direction du canon) ;
  //  3. mains : même prise que dans la visée — la rotation de chaque main PAR RAPPORT AU FUSIL est mesurée dans
  //     Rifle_Aim_Turn_Right puis reportée sur le fusil en garde basse ; gauche sur le garde-main, à la même distance ;
  //  4. bras : IK à deux os (épaule → coude → poignet), coudes vers le bas et l'extérieur.
  // Repère du jeu : +Z devant le soldat, −X sa droite, mètres pour un soldat de 1,80 m, pieds à 0.
  const GB = { paume: [-0.01, 1.1, 0.26], canon: [0.45, -0.55, 0.7], coudeD: [-1, -0.7, -0.25], coudeG: [1, -0.8, -0.1] };
  S.GB = GB;
  function gardeBasse(M) {
    const aim = M.clips.Rifle_Aim_Turn_Right; if (!aim) return;
    const sc = M.gltf.scene, b = (n) => sc.getObjectByName('mixamorig' + n) || sc.getObjectByName('mixamorig:' + n);
    const R = { arm: b('RightArm'), fore: b('RightForeArm'), hand: b('RightHand'), mid: sc.getObjectByName('PalmeD') };
    const L = { arm: b('LeftArm'), fore: b('LeftForeArm'), hand: b('LeftHand'), mid: sc.getObjectByName('PalmeG') };
    if (!R.arm || !L.arm || !R.mid || !L.mid) return;
    const bones = []; sc.traverse(o => { if (o.isBone) bones.push(o); });
    const rest = bones.map(o => [o.quaternion.clone(), o.position.clone()]);
    const restore = () => bones.forEach((o, i) => { o.quaternion.copy(rest[i][0]); o.position.copy(rest[i][1]); });
    const W = (o) => o.getWorldPosition(new THREE.Vector3()), WQ = (o) => o.getWorldQuaternion(new THREE.Quaternion());
    const palm = (h) => W(h.hand).lerp(W(h.mid), 0.6);
    // repère du fusil (+Z bouche, +Y dessus) ; a = poignée → garde-main dans ce repère
    const arme = root.Modeles3D && root.Modeles3D.arme && root.Modeles3D.arme();
    const aW = arme && arme.gripPt ? arme.forePt.clone().sub(arme.gripPt).normalize() : new THREE.Vector3(0, 0.13, 0.75).normalize();
    const fusil = (bvec) => {   // même règle que placeWeapon : a → bvec, le dessus du fusil vers le haut
      const basis = (d) => { const u = new THREE.Vector3(0, 1, 0).addScaledVector(d, -d.y).normalize(); return new THREE.Matrix4().makeBasis(d, u, new THREE.Vector3().crossVectors(d, u)); };
      return new THREE.Quaternion().setFromRotationMatrix(basis(bvec).multiply(basis(aW).transpose()));
    };
    // 1. prise dans la visée
    const mixer = new THREE.AnimationMixer(sc), act = mixer.clipAction(aim); act.play(); mixer.setTime(0); sc.updateMatrixWorld(true);
    const fingers = bones.filter(o => /(Right|Left)Hand.+/.test(o.name)).map(o => [o, o.quaternion.clone()]);
    const pR0 = palm(R), pL0 = palm(L), Qa = fusil(pL0.clone().sub(pR0).normalize()), Qai = Qa.clone().invert();
    const grip = (h) => { const q = WQ(h.hand); return { rel: Qai.clone().multiply(q), off: palm(h).sub(W(h.hand)).applyQuaternion(q.clone().invert()) }; };
    const gR = grip(R), gL = grip(L), span = pL0.distanceTo(pR0);
    act.stop(); mixer.uncacheAction(aim); restore(); fingers.forEach(([o, q]) => o.quaternion.copy(q));
    sc.updateMatrixWorld(true);
    // 2. fusil en garde basse (k : mètres du jeu → unités du modèle)
    const k = RAW_H / HEIGHT, d = new THREE.Vector3().fromArray(GB.canon).normalize();
    const u = new THREE.Vector3(0, 1, 0).addScaledVector(d, -d.y).normalize();
    const Qn = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(u, d), u, d));
    // le fusil en garde basse tient comme dans la visée : on cherche la rotation Qg (poignée → garde-main) équivalente
    const bN = aW.clone().applyQuaternion(Qn), Qg = fusil(bN);
    const tR = new THREE.Vector3().fromArray(GB.paume).multiplyScalar(k), tL = tR.clone().addScaledVector(bN, span);
    // 3–4. chaque bras : poignet visé = paume visée − décalage paume/poignet de la main orientée comme dans la visée
    const ik = (h, gp, target, pole) => {
      const qh = Qg.clone().multiply(gp.rel), wT = target.clone().sub(gp.off.clone().applyQuaternion(qh));
      const S0 = W(h.arm), E0 = W(h.fore), H0 = W(h.hand), a = S0.distanceTo(E0), bb = E0.distanceTo(H0);
      let c = S0.distanceTo(wT); c = Math.min(c, (a + bb) * 0.999);
      const dir = wT.clone().sub(S0).normalize(), cosA = Math.max(-1, Math.min(1, (a * a + c * c - bb * bb) / (2 * a * c)));
      const p = new THREE.Vector3().fromArray(pole).normalize(); p.addScaledVector(dir, -p.dot(dir)).normalize();
      const E1 = S0.clone().addScaledVector(dir, a * cosA).addScaledVector(p, a * Math.sqrt(1 - cosA * cosA));
      const turn = (bone, from, to) => {   // tourne l'os (dans le monde) pour que from devienne to
        const dq = new THREE.Quaternion().setFromUnitVectors(from.normalize(), to.normalize());
        const wq = dq.multiply(WQ(bone)), pq = WQ(bone.parent).invert(); bone.quaternion.copy(pq.multiply(wq)); bone.updateMatrixWorld(true);
      };
      turn(h.arm, E0.clone().sub(S0), E1.clone().sub(S0));
      const E2 = W(h.fore); turn(h.fore, W(h.hand).sub(E2), wT.clone().sub(E2));
      h.hand.quaternion.copy(WQ(h.hand.parent).invert().multiply(qh)); h.hand.updateMatrixWorld(true);
    };
    ik(R, gR, tR, GB.coudeD); ik(L, gL, tL, GB.coudeG);
    // 5. clip fixe : une clé (répétée) par os
    const tracks = [];
    for (const o of bones) {
      const n = THREE.PropertyBinding.sanitizeNodeName(o.name), q = o.quaternion.toArray();
      tracks.push(new THREE.QuaternionKeyframeTrack(n + '.quaternion', [0, 1], q.concat(q)));
      if (/Hips$/.test(o.name)) { const p = o.position.toArray(); tracks.push(new THREE.VectorKeyframeTrack(n + '.position', [0, 1], p.concat(p))); }
    }
    M.clips.Garde_Basse = new THREE.AnimationClip('Garde_Basse', 1, tracks);
    M.gbErr = { R: palm(R).distanceTo(tR) / k, L: palm(L).distanceTo(tL) / k };
    restore(); sc.updateMatrixWorld(true);
  }
  // Accroupi : jambes et bassin de l'accroupi (« Kneeling_Reload » figé au début, avant que le fusil ne monte vers le ciel ;
  // « Cautious_Crouch_Walk_Forward » pour la marche accroupie), haut du corps de la visée (Rifle_Aim_Turn_Right) ou de la garde
  // basse ; le fusil est ensuite placé par poseArme et tenu à deux mains. Correction d'orientation mesurée comme measure().
  function compositeAccroupi(M) {
    const kn = M.clips.Kneeling_Reload, cw = M.clips.Cautious_Crouch_Walk_Forward, hauts = { Vise: M.clips.Rifle_Aim_Turn_Right, Bas: M.clips.Garde_Basse };
    if (!kn || !hauts.Vise) return;
    const fige = (t, temps, dur) => { const v = Array.from(t.createInterpolant().evaluate(temps)); return new t.constructor(t.name, [0, dur], v.concat(v)); };
    for (const h in hauts) { const H = hauts[h]; if (!H) continue;
      const haut = (dur) => H.tracks.filter(t => !JAMBES.test(t.name)).map(t => fige(t, 0, dur));
      M.clips['Accroupi_' + h] = new THREE.AnimationClip('Accroupi_' + h, 1, kn.tracks.filter(t => JAMBES.test(t.name)).map(t => fige(t, 0.06 * kn.duration, 1)).concat(haut(1)));
      if (cw) M.clips['Accroupi_Marche_' + h] = new THREE.AnimationClip('Accroupi_Marche_' + h, cw.duration, cw.tracks.filter(t => JAMBES.test(t.name)).map(t => t.clone()).concat(haut(cw.duration)));
    }
    // correction d'orientation (le fusil droit devant) et vitesse naturelle de la marche accroupie
    const sc = M.gltf.scene, b = (n) => sc.getObjectByName('mixamorig' + n) || sc.getObjectByName('mixamorig:' + n), rh = b('RightHand'), lh = b('LeftHand'); if (!rh || !lh) return;
    const mixer = new THREE.AnimationMixer(sc), pR = new THREE.Vector3(), pL = new THREE.Vector3();
    for (const n of ['Accroupi_Vise', 'Accroupi_Bas', 'Accroupi_Marche_Vise', 'Accroupi_Marche_Bas']) { const c = M.clips[n]; if (!c) continue;
      const a = mixer.clipAction(c); a.play(); let sx = 0, sz = 0;
      for (const t of [0, 0.25, 0.5, 0.75]) { mixer.setTime(t * c.duration); sc.updateMatrixWorld(true); rh.getWorldPosition(pR); lh.getWorldPosition(pL); const dx = pL.x - pR.x, dz = pL.z - pR.z, L = Math.hypot(dx, dz) || 1; sx += dx / L; sz += dz / L; }
      const yaw = Math.atan2(sx, sz); M.yawFix[n] = -yaw * (/Marche/.test(n) ? 0.6 : 1); (M.aimYaw || (M.aimYaw = {}))[n] = yaw;
      a.stop(); mixer.uncacheAction(c);
      if (/Marche/.test(n) && M.loco) { M.loco[n] = M.loco.Cautious_Crouch_Walk_Forward; if (M.phase0) M.phase0[n] = M.phase0.Cautious_Crouch_Walk_Forward; }
    }
    mixer.stopAllAction(); mixer.uncacheRoot(sc);
  }
  // ---- Prise de l'arme : mains posées sur le fusil, doigts refermés dessus -------------------------------------------------
  // Le fusil Meshy en boîtes arrondies (repère des armes : +Z bouche, +Y dessus, +X gauche du tireur ; m) : centre c,
  // demi-tailles h (arrondi compris), rayon d'arrondi r, inclinaison rx (rad, autour de X : poignée inclinée vers l'arrière).
  // Mesuré sur le modèle (outils/vues/arme_profil.html). Sert à refermer les doigts au contact de l'arme (distance signée).
  const FORMES = [
    { n: 'poignee', c: [-0.002, -0.055, -0.156], h: [0.016, 0.066, 0.027], r: 0.012, rx: 0.314 },
    { n: 'carcasse', c: [-0.002, 0.05, -0.08], h: [0.024, 0.053, 0.15], r: 0.006 },
    { n: 'pontet', c: [-0.002, -0.034, -0.088], h: [0.012, 0.007, 0.028], r: 0.004 },
    { n: 'pontetAv', c: [-0.002, -0.016, -0.062], h: [0.006, 0.016, 0.004], r: 0.003 },
    { n: 'detente', c: [-0.002, -0.012, -0.098], h: [0.003, 0.009, 0.003], r: 0.002 },
    { n: 'chargeur', c: [-0.002, -0.06, 0.0025], h: [0.015, 0.06, 0.043], r: 0.008 },
    { n: 'gardeMain', c: [-0.0025, 0.0675, 0.1825], h: [0.0285, 0.0365, 0.1125], r: 0.012 },
    { n: 'crosse', c: [-0.002, 0.02, -0.33], h: [0.022, 0.05, 0.1], r: 0.01 },
  ];
  S.FORMES = FORMES;
  function sdBoite(F, x, y, z) {
    x -= F.c[0]; y -= F.c[1]; z -= F.c[2];
    if (F.rx) { const c = Math.cos(F.rx), s = Math.sin(F.rx), y2 = c * y + s * z; z = -s * y + c * z; y = y2; }
    const qx = Math.abs(x) - F.h[0] + F.r, qy = Math.abs(y) - F.h[1] + F.r, qz = Math.abs(z) - F.h[2] + F.r;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - F.r;
  }
  function sdArme(p) { let d = 1e9; for (const F of FORMES) d = Math.min(d, sdBoite(F, p.x, p.y, p.z)); return d; }
  S.sdArme = sdArme;
  // Calcul (une fois par modèle) de la prise : pour chaque main, sa place sur le fusil (matrice main / arme) et la pose de ses
  // doigts. Les mains de l'animation de visée donnent l'orientation ; la main est glissée le long de la normale de sa paume
  // jusqu'au contact ; puis chaque doigt se referme articulation par articulation jusqu'à toucher l'arme (une phalange qui
  // touche fige celles d'avant, les suivantes continuent). Index droit : deux poses, tendu le long de la carcasse au-dessus
  // du pontet (doigt hors de la détente) ou sur la détente (tir). Les doigts sont reconnus par leur position (pouce = le plus
  // près du poignet ; puis du côté du pouce vers l'auriculaire) : dans les squelettes Meshy leurs noms sont souvent inversés.
  // places des mains (repère de l'arme, m) : A = direction poignet → jointure du majeur, N = normale de la paume, mcp = jointure
  // du majeur. Main droite : paume sur le flanc droit de la poignée, doigts vers l'avant autour de la poignée, jointures au
  // bord avant ; main gauche : sous le garde-main, doigts vers la droite qui remontent sur son flanc droit, pouce à gauche.
  const PRISE = {
    R: { A: [0.383, -0.386, 0.839], N: [0.913, 0.294, -0.282], mcp: [-0.04, -0.063, -0.129],
      // cibles du bout des doigts (index : tendu le long de la carcasse, au-dessus du pontet ; pouce : flanc gauche, sous la carcasse)
      cibles: { 0: { ferme: [0.6, 1, 0.8], max: [1.2, 1.3, 1.2] }, 1: { p: [-0.036, 0.006, -0.075], f1: [-0.4, 0.8], f2: 0.3, reg: 0.03 } },
      detente: { p: [-0.004, -0.014, -0.088], f1: [-0.2, 1.4], f2: 1.6 } },
    L: { A: [-0.816, 0.149, 0.559], N: [0.19, 0.982, 0.015], mcp: [-0.036, 0.01, 0.168],
      cibles: { 0: { p: [0.04, 0.07, 0.2], f1: [-0.4, 1.2], f2: 1.0 } } },
    // places propres à un modèle (mêmes champs, remplacent ceux du dessus) : les mains n'ont pas la même forme
    gign: { R: { A: [0.209, 0.261, 0.943], N: [0.934, 0.232, -0.271], mcp: [-0.04, -0.051, -0.119] }, L: { A: [-0.822, 0.089, 0.563], N: [0.074, 0.996, -0.051], mcp: [-0.028, 0.012, 0.168] } },
  };
  S.PRISE = PRISE;
  function calculerPrise(f, W) {
    const sk = f.skinned; if (!sk || !f.weapon.isMeshy) return null;
    const bones = sk.skeleton.bones, inv = sk.skeleton.boneInverses, bind = sk.bindMatrix;
    const g = sk.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const bindW = bones.map((b, i) => inv[i].clone().invert());
    const locBind = (b) => { const i = bones.indexOf(b), pi = bones.indexOf(b.parent); const m = pi >= 0 ? bindW[pi].clone().invert().multiply(bindW[i]) : bindW[i].clone();
      const t = V(), q = new THREE.Quaternion(), s = V(); m.decompose(t, q, s); return { t, q, s }; };
    f.weapon.updateMatrixWorld(true); const Wi = f.weapon.matrixWorld.clone().invert();
    const out = {};
    for (const side of ['Right', 'Left']) {
      const H = bones.find(b => b.name.endsWith(side + 'Hand')); if (!H) return null;
      const hi = bones.indexOf(H), HbI = bindW[hi].clone().invert();
      const rel = (b) => V().setFromMatrixPosition(HbI.clone().multiply(bindW[bones.indexOf(b)]));   // position de liaison dans le repère de la main
      // chaînes de doigts (3 phalanges + bout)
      const chaines = H.children.filter(b => b.isBone && bones.includes(b)).map(b => { const c = [b]; while (c.length < 4) { const n = c[c.length - 1].children.find(x => x.isBone); if (!n) break; c.push(n); } return c; }).filter(c => c.length >= 4);
      if (chaines.length !== 5) return null;
      const bases = chaines.map(c => rel(c[0])), moy = bases.reduce((a, b) => a.add(b.clone()), V()).multiplyScalar(1 / 5), axe = moy.clone().normalize();
      const ip = bases.map((b, i) => [i, b.dot(axe)]).sort((a, b) => a[1] - b[1])[0][0];   // pouce : base la plus proche du poignet
      const autres = [0, 1, 2, 3, 4].filter(i => i !== ip), cote = bases[ip].clone().addScaledVector(axe, -bases[ip].dot(axe));
      autres.sort((a, b) => bases[b].dot(cote) - bases[a].dot(cote));   // index, majeur, annulaire, auriculaire
      const ordre = [ip].concat(autres), NOM = ['pouce', 'index', 'majeur', 'annulaire', 'auriculaire'];
      // normale de la paume (repère de la main) : côté vers lequel les doigts se plient = côté du bout du pouce
      const I1 = bases[autres[0]], P1 = bases[autres[3]], M1 = bases[autres[1]];
      const N = new THREE.Vector3().crossVectors(I1.clone().sub(P1), M1).normalize();
      if (rel(chaines[ip][3]).sub(M1).dot(N) < 0) N.negate();
      // sommets de la main et des doigts, dans le repère de liaison de l'os qui les porte le plus
      const id = new Map(); id.set(hi, -1); ordre.forEach((c, k) => chaines[c].slice(0, 3).forEach((b, j) => id.set(bones.indexOf(b), k * 3 + j)));
      const sommets = Array.from({ length: 16 }, () => []), v = V();
      for (let i = 0; i < pos.count; i++) {
        let best = -2, bw = 0, tot = 0; for (let k = 0; k < 4; k++) { const b = si.getComponent(i, k), w = sw.getComponent(i, k); if (!id.has(b)) continue; tot += w; if (w > bw) { bw = w; best = id.get(b); } }
        if (tot < 0.5 || best < -1) continue;
        const bi = best < 0 ? hi : bones.indexOf(chaines[ordre[Math.floor(best / 3)]][best % 3]);
        v.fromBufferAttribute(pos, i).applyMatrix4(bind).applyMatrix4(inv[bi]); sommets[best + 1].push(v.clone());
      }
      // place de la main sur l'arme (repère de l'arme) : axe poignet → jointure du majeur A, normale de la paume N, jointure
      // du majeur au point « mcp » (voir PRISE) ; l'échelle est celle de la main dans le jeu
      f.body.updateMatrixWorld(true); const sH = V(); Wi.clone().multiply(H.matrixWorld).decompose(V(), new THREE.Quaternion(), sH);
      const Pc = Object.assign({}, PRISE[side === 'Right' ? 'R' : 'L'], (PRISE[W && W.nom] || {})[side === 'Right' ? 'R' : 'L']), base = (a, n) => { const x = a.clone().normalize(), y = n.clone().addScaledVector(x, -n.dot(x)).normalize(); return new THREE.Matrix4().makeBasis(x, y, new THREE.Vector3().crossVectors(x, y)); };
      const Rm = base(new THREE.Vector3().fromArray(Pc.A), new THREE.Vector3().fromArray(Pc.N)).multiply(base(M1.clone(), N).transpose());
      const qR = new THREE.Quaternion().setFromRotationMatrix(Rm), mcpW = M1.clone().multiply(sH).applyQuaternion(qR);
      const Hrel = new THREE.Matrix4().compose(new THREE.Vector3().fromArray(Pc.mcp).sub(mcpW), qR, sH);
      // phalanges : repères de liaison locaux, axe de flexion local
      const os = ordre.map((c, k) => chaines[c].slice(0, 3).map((b, j) => {
        const lb = locBind(b), d = rel(chaines[c][j + 1]).sub(rel(b)).normalize();
        let ax = new THREE.Vector3().crossVectors(d, N);
        if (k === 0) ax.multiplyScalar(0.5).addScaledVector(new THREE.Vector3().crossVectors(d, M1).normalize(), 0.5);   // pouce : vers la paume et en travers
        ax.normalize();
        const qhb = new THREE.Quaternion(); HbI.clone().multiply(bindW[bones.indexOf(b)]).decompose(V(), qhb, V());   // orientation de liaison de l'os / main
        return { b, nom: b.name, lb, ax: ax.applyQuaternion(qhb.invert()), som: sommets[k * 3 + j + 1] };
      }));
      const T = new THREE.Matrix4(), Q = new THREE.Quaternion(), p = V(), qa = new THREE.Quaternion();
      const Nb = os.map(o3 => { const q = new THREE.Quaternion(); HbI.clone().multiply(bindW[bones.indexOf(o3[0].b)]).decompose(V(), q, V()); return N.clone().applyQuaternion(q.invert()); });   // normale de la paume dans le repère de la 1re phalange
      const bout = ordre.map(c => locBind(chaines[c][3]).t);
      // pose d'un doigt : th = [flexion 1, 2, 3, écartement 1] ; rotation locale de chaque phalange
      const qLoc = (k, j, th) => { const o = os[k][j]; Q.copy(o.lb.q); if (j === 0 && th[3]) Q.multiply(qa.setFromAxisAngle(Nb[k], th[3])); return Q.multiply(qa.setFromAxisAngle(o.ax, th[j])).clone(); };
      const fk = (k, th) => { const ms = []; let m = Hrel.clone(); os[k].forEach((o, j) => { m = m.clone().multiply(T.compose(o.lb.t, qLoc(k, j, th), o.lb.s)); ms.push(m); }); return ms; };
      const dSeg = (k, th, ms) => { ms = ms || fk(k, th); return [0, 1, 2].map(j => { let d = 1e9; for (const u of os[k][j].som) d = Math.min(d, sdArme(p.copy(u).applyMatrix4(ms[j]))); return d; }); };
      const dmin = (k, th) => Math.min(...dSeg(k, th));
      // 1. contact de la paume (option) : glissée le long de sa normale (repère de l'arme) jusqu'à 2 mm d'enfoncement
      const nW = N.clone().transformDirection(Hrel), paume = sommets[0].filter(u => u.clone().normalize().dot(N) > 0.15);
      const gp = (t) => { let d = 1e9; for (const u of paume) d = Math.min(d, sdArme(p.copy(u).applyMatrix4(Hrel).addScaledVector(nW, t))); return d; };
      let lo = 0, hi2 = 0.1; if (Pc.glisse && gp(-0.1) > -0.002) { lo = -0.1; for (let it = 0; it < 30; it++) { const mid = (lo + hi2) / 2; if (gp(mid) > -0.002) lo = mid; else hi2 = mid; } }
      const glisse = Math.max(-0.05, Math.min(0.05, lo)); Hrel.premultiply(new THREE.Matrix4().makeTranslation(nW.x * glisse, nW.y * glisse, nW.z * glisse));
      // 2a. fermeture jusqu'au contact (une phalange qui touche fige celles d'avant, les suivantes continuent)
      const fermer = (k, vit, max) => {
        const th = [0, 0, 0, 0], fige = [false, false, false];
        for (let it = 0; it < 120 && fige.some(x => !x); it++) {
          const av = th.slice(); for (let j = 0; j < 3; j++) if (!fige[j]) { th[j] = Math.min(max[j], th[j] + vit[j] * 0.025); if (th[j] >= max[j]) fige[j] = true; }
          const d = dSeg(k, th);
          for (let j = 2; j >= 0; j--) if (d[j] < 0.0015) { for (let i = 0; i <= j; i++) { if (!fige[i] && d[j] < -0.003) th[i] = av[i]; fige[i] = true; } break; }
        }
        return th;
      };
      // 2b. bout du doigt (articulation du bout) amené au point « cible » sans entrer dans l'arme : recherche en grille puis
      // descente par coordonnées sur [flexion 1, 2, 3, écartement]
      const cibler = (k, cible, o) => {
        const C = new THREE.Vector3().fromArray(cible), cout = (th) => { const ms = fk(k, th), d = Math.min(...dSeg(k, th, ms));
          return p.copy(bout[k]).applyMatrix4(ms[2]).distanceTo(C) + 6 * Math.max(0, -d - 0.002) + (o.reg || 0.004) * (Math.abs(th[1]) + Math.abs(th[2])) + 0.004 * Math.abs(th[3]); };
        let best = null;
        for (let a = o.f1[0]; a <= o.f1[1]; a += 0.1) for (let e = -0.35; e <= 0.35; e += 0.07) for (let c = 0; c <= o.f2; c += 0.12) { const th = [a, c, c * 0.8, e], v = cout(th); if (!best || v < best[0]) best = [v, th]; }
        let th = best[1], v = best[0];
        for (const st of [0.05, 0.02, 0.008]) for (let it = 0; it < 12; it++) { let mieux = false; for (let i = 0; i < 4; i++) for (const sg of [-1, 1]) { const t2 = th.slice(); t2[i] += sg * st; if (i < 3 && t2[i] < -0.3 || i === 3 && Math.abs(t2[i]) > 0.35) continue; const v2 = cout(t2); if (v2 < v) { v = v2; th = t2; mieux = true; } } if (!mieux) break; }
        return th;
      };
      const R = side === 'Right', res = { Hrel, glisse, N, ordre: ordre.map(c => chaines[c][0].name), doigts: [], dmin: [], err: [] };
      const quats = (k, th) => os[k].map((o, j) => qLoc(k, j, th));
      os.forEach((o3, k) => {
        const c = Pc.cibles && Pc.cibles[k];
        const th = c && c.ferme ? fermer(k, c.ferme, c.max) : c ? cibler(k, c.p, c) : fermer(k, [1, 1.15, 0.85], [1.6, 1.9, 1.4]);
        res.doigts.push(o3.map((o, j) => [o.b.name, qLoc(k, j, th)])); (res.th || (res.th = [])).push(th);
        res.dmin.push(+(dmin(k, th) * 100).toFixed(2));
        if (c && c.p) res.err.push(+(p.copy(bout[k]).applyMatrix4(fk(k, th)[2]).distanceTo(new THREE.Vector3().fromArray(c.p)) * 100).toFixed(2));
      });
      res.paumeLoc = new THREE.Vector3().fromArray(PALME).multiplyScalar(0.6).applyMatrix4(Hrel);
      res.paume = +(gp(0) * 100).toFixed(2); res.bouts = os.map((o3, k) => p.copy(bout[k]).applyMatrix4(fk(k, k < 5 ? (res.th || [])[k] || [0, 0, 0, 0] : 0)[2]).toArray());
      if (R && Pc.detente) { const th = cibler(1, Pc.detente.p, Pc.detente); res.detente = quats(1, th); res.detenteErr = +(p.copy(bout[1]).applyMatrix4(fk(1, th)[2]).distanceTo(new THREE.Vector3().fromArray(Pc.detente.p)) * 100).toFixed(2); }
      out[side === 'Right' ? 'R' : 'L'] = res;
    }
    return out;
  }
  // Correction d'orientation par animation : de quel angle faut-il tourner le corps pour que l'ARME (main droite → main gauche)
  // pointe droit devant (+Z, la direction « face » du jeu) ? Mesurée une fois au chargement.
  // AIM : animations où l'arme doit viser droit devant, et l'instant (fraction) où la mesurer ; null = moyenne sur la boucle.
  const AIM = { Rifle_Aim_Turn_Right: 0.0, Standing_Reload: 0.0, Kneeling_Reload: 0.06, Run_and_Shoot: null, Walk_Fight_Forward: null, Walk_Aim: null, Cautious_Crouch_Walk_Forward: null, Gunshot_Reaction: 0.0 };
  const AIM_PART = { Walk_Fight_Forward: 0, Cautious_Crouch_Walk_Forward: 0, Run_and_Shoot: 0.6, Walk_Aim: 0.8 };   // locomotion : on corrige moins (les jambes marchent droit)
  function measure(M) {
    const sc = M.gltf.scene, b = (n) => sc.getObjectByName('mixamorig' + n) || sc.getObjectByName('mixamorig:' + n);
    const rh = b('RightHand'), lh = b('LeftHand'); if (!rh || !lh) return;
    const mixer = new THREE.AnimationMixer(sc), pR = new THREE.Vector3(), pL = new THREE.Vector3();
    for (const n in AIM) {
      const c = M.clips[n]; if (!c) continue;
      const a = mixer.clipAction(c); a.play();
      const fr = AIM[n] === null ? [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875] : [AIM[n]];
      let sx = 0, sz = 0;
      for (const t of fr) { mixer.setTime(t * c.duration); sc.updateMatrixWorld(true); rh.getWorldPosition(pR); lh.getWorldPosition(pL); const dx = pL.x - pR.x, dz = pL.z - pR.z, L = Math.hypot(dx, dz) || 1; sx += dx / L; sz += dz / L; }
      const yaw = Math.atan2(sx, sz); M.yawFix[n] = -yaw * (AIM_PART[n] !== undefined ? AIM_PART[n] : 1); (M.aimYaw || (M.aimYaw = {}))[n] = yaw;
      a.stop(); mixer.uncacheAction(c);
    }
    mixer.stopAllAction();
  }
  // matériau teinté : la toile beige de la tenue prend la couleur d'uniforme demandée (gilet, peau, bottes inchangés)
  const matCache = {};
  // Textures haute définition (hd/<modèle>_couleur|relief|mr.jpg, 2048², tirées du modèle Meshy d'origine) si elles sont
  // publiées à côté de la page : remplacées à chaud dans le matériau d'origine et dans toutes ses copies (teintes)
  function texturesHD() {
    if (!/^https?:/.test(location.protocol) || /[?&]hd=0/.test(location.search)) return;
    if (S.logiciel) { S.hd = 99; return; }   // (rendu logiciel : textures incluses ; S.hd signale « fini » aux scripts de capture)
    const L = new THREE.TextureLoader();
    for (const nom of NOMS) {
      const M = S.modeles[nom]; if (!M) continue;
      const mats = () => { const out = []; M.gltf.scene.traverse(o => { if (o.isMesh && o.material) out.push(o.material); }); for (const k in matCache) if (k.startsWith(nom)) out.push(matCache[k]); return out; };
      const swap = (slots, file, srgb) => window.OT_HD && !window.OT_HD.fichiers[nom + '_' + file + '.jpg'] ? null : L.load('hd/' + nom + '_' + file + '.jpg', (t) => {
        for (const m of mats()) for (const k of slots) {
          const old = m[k]; if (!old) continue;
          const nt = t.clone(); nt.flipY = old.flipY; nt.wrapS = old.wrapS; nt.wrapT = old.wrapT; nt.offset.copy(old.offset); nt.repeat.copy(old.repeat); nt.rotation = old.rotation; nt.center.copy(old.center);
          nt.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; nt.anisotropy = 8; nt.needsUpdate = true; m[k] = nt; m.needsUpdate = true;
        }
        S.hd = (S.hd || 0) + 1;
      }, undefined, () => {});
      swap(['map'], 'couleur', true); swap(['normalMap'], 'relief', false); swap(['roughnessMap', 'metalnessMap'], 'mr', false);
    }
  }
  function tintedMaterial(base, uniform, nom) {
    const key = (nom || '') + (uniform == null ? 'brut' : uniform.toString(16)); if (matCache[key]) return matCache[key];
    const m = base.clone(); m.roughness = 1; m.metalness = 0; if (m.color) m.color.multiplyScalar(0.92);
    if (uniform != null) {
      const c = new THREE.Color(uniform); m.userData.tint = c;
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTint = { value: new THREE.Vector3(c.r, c.g, c.b) };
        sh.fragmentShader = 'uniform vec3 uTint;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
          { vec3 col = diffuseColor.rgb; float lum = dot(col, vec3(0.299, 0.587, 0.114));
            float rg = col.r - col.g, gb = col.g - col.b;
            // toile beige : rouge à peine plus fort que le vert, vert nettement plus fort que le bleu, assez claire
            float tan = smoothstep(0.02, 0.07, gb) * (1.0 - smoothstep(0.07, 0.13, rg)) * smoothstep(0.12, 0.25, lum);
            vec3 target = uTint * (lum / 0.42) * 1.35;
            diffuseColor.rgb = mix(col, clamp(target, 0.0, 1.0), tan); }`);
      };
      m.customProgramCacheKey = () => 'tint' + key;
    }
    return (matCache[key] = m);
  }
  // Niveau de détail : au-delà de LOD_D mètres de la caméra, le maillage HD (~100 000 triangles) est remplacé par sa version
  // allégée, liée au MÊME squelette (animations et IK ne coûtent rien de plus) et au même matériau ; un THREE.LOD choisit
  // à chaque image selon la distance (hystérésis 15 %, pas de clignotement). Les ombres suivent le niveau affiché.
  const LOD_D = 11;
  function lod(sk, L) {
    const bones = L.noms.map(n => sk.skeleton.bones.find(b => b.name === n)); if (bones.some(b => !b)) return null;
    const m = new THREE.SkinnedMesh(L.geo, sk.material); m.name = (sk.name || 'corps') + '_lod';
    m.castShadow = sk.castShadow; m.receiveShadow = sk.receiveShadow; m.frustumCulled = false;
    m.bind(new THREE.Skeleton(bones, L.inv), L.bind);
    const node = new THREE.LOD(), parent = sk.parent; node.name = 'lodCorps';
    node.position.copy(sk.position); node.quaternion.copy(sk.quaternion); node.scale.copy(sk.scale);
    parent.add(node); parent.remove(sk); sk.position.set(0, 0, 0); sk.quaternion.identity(); sk.scale.set(1, 1, 1);
    node.addLevel(sk, 0, 0.15); node.addLevel(m, LOD_D, 0.15);
    return m;
  }
  function cloneSkinned(src) {
    const c = src.clone(true), bones = {}; c.traverse(o => { if (o.isBone) bones[o.name] = o; });
    c.traverse(o => { if (o.isSkinnedMesh) { const sk = o.skeleton; o.bind(new THREE.Skeleton(sk.bones.map(b => bones[b.name]), sk.boneInverses), o.bindMatrix); } });
    return c;
  }
  const V = () => new THREE.Vector3();
  // ressort amorti critique (pulsation w, rad/s) de x vers c : [x, vitesse] ; dt = 0 : saut direct
  const ressort = (x, v, c, w, dt) => { if (!(dt > 0)) return [c, 0]; const a = w * w * (c - x) - 2 * w * v; v += a * dt; x += v * dt; if (x < 0) { x = 0; v = 0; } else if (x > 1) { x = 1; v = 0; } return [x, v]; };
  // un soldat : group (posé par le jeu), pose (chute), weapon (avec .muzzle), anim
  // o.modele : 'gign' (équipe du joueur) ou 'soldat' (adversaire) ; par défaut le premier modèle chargé
  function create(o) {
    if (!S.ready) return null;
    const M = S.modeles[o.modele] || S.modeles[S.defaut];
    const group = new THREE.Group(), pose = new THREE.Group(); group.add(pose);
    const body = cloneSkinned(M.gltf.scene); body.scale.setScalar(HEIGHT / RAW_H); pose.add(body);
    let skinned = null; body.traverse(n => { if (n.isSkinnedMesh) { skinned = n; n.material = tintedMaterial(n.material, TEINTE[M.nom] ? o.uniform : null, M.nom); } });
    if (skinned && M.lod) try { lod(skinned, M.lod); } catch (e) { console.warn('soldat 3D (LOD) :', e); }
    const bone = (n) => body.getObjectByName('mixamorig:' + n) || body.getObjectByName('mixamorig' + n);
    const weapon = o.weapon ? ((root.Modeles3D && root.Modeles3D.arme()) || root.Figure.makeWeapon(o.weapon, o.attachments)) : new THREE.Group(); if (!weapon.muzzle) weapon.muzzle = new THREE.Vector3(0, 0, 0.6);
    group.add(weapon);
    const mixer = new THREE.AnimationMixer(body), actions = {};
    const act = (name) => { if (!M.clips[name]) return null; if (!actions[name]) { const a = mixer.clipAction(M.clips[name]); if (ONCE[name]) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; } actions[name] = a; } return actions[name]; };
    // IK à deux os, dans le monde : déplace le poignet de « delta » (bras arm → avant-bras fore → main hand), coude gardé
    // dans son plan, orientation de la main conservée
    const WP = (o) => o.getWorldPosition(V()), WQ = (o) => o.getWorldQuaternion(new THREE.Quaternion());
    const turn = (bone, from, to) => {
      const dq = new THREE.Quaternion().setFromUnitVectors(from.normalize(), to.normalize());
      bone.quaternion.copy(WQ(bone.parent).invert().multiply(dq.multiply(WQ(bone)))); bone.updateMatrixWorld(true);
    };
    function ik(arm, fore, hand, delta) {
      mod(arm); mod(fore); mod(hand);
      const qH = WQ(hand), S0 = WP(arm), E0 = WP(fore), H0 = WP(hand), T = H0.clone().add(delta);
      const a = S0.distanceTo(E0), b = E0.distanceTo(H0); let c = S0.distanceTo(T); c = Math.min(Math.max(c, Math.abs(a - b) + 1e-4), (a + b) * 0.999);
      const dir = T.clone().sub(S0).normalize(), cosA = Math.max(-1, Math.min(1, (a * a + c * c - b * b) / (2 * a * c)));
      const p = E0.clone().sub(S0); p.addScaledVector(dir, -p.dot(dir)); if (p.lengthSq() < 1e-8) p.set(0, -1, 0); p.normalize();
      const E1 = S0.clone().addScaledVector(dir, a * cosA).addScaledVector(p, a * Math.sqrt(1 - cosA * cosA));
      turn(arm, E0.clone().sub(S0), E1.sub(S0)); const E2 = WP(fore); turn(fore, WP(hand).sub(E2), T.sub(E2));
      hand.quaternion.copy(WQ(hand.parent).invert().multiply(qH)); hand.updateMatrixWorld(true);
    }
    // IK d'une jambe (hanche → genou → cheville, orientation du pied gardée) : comme ik(), mais le genou ne se tend jamais à
    // fond (≤ 99,3 % de la longueur : plus de genou « en arrière ») et plie TOUJOURS vers l'avant, au-dessus des orteils
    // (si le genou est presque tendu, son plan d'origine est indéterminé : avant, il pouvait basculer en arrière)
    function ikJambe(up, lo, ft, delta, toe) {
      mod(up); mod(lo); mod(ft);
      const qF = WQ(ft), S0 = WP(up), E0 = WP(lo), H0 = WP(ft), T = H0.clone().add(delta);
      const a = S0.distanceTo(E0), b = E0.distanceTo(H0); let c = S0.distanceTo(T); c = Math.min(Math.max(c, Math.abs(a - b) + 1e-4), (a + b) * 0.993);
      const dir = T.clone().sub(S0).normalize(), cosA = Math.max(-1, Math.min(1, (a * a + c * c - b * b) / (2 * a * c)));
      const p = E0.clone().sub(S0); p.addScaledVector(dir, -p.dot(dir));
      const fd = toe ? WP(toe).sub(H0) : new THREE.Vector3(0, 0, 1).applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion())); fd.y = 0; fd.addScaledVector(dir, -fd.dot(dir));
      if (fd.lengthSq() > 1e-8) { fd.normalize(); const pd = p.dot(fd), pl = p.length(); if (pd < 0) p.copy(fd); else if (pl < 0.04) p.addScaledVector(fd, 0.04 - pl); }
      if (p.lengthSq() < 1e-8) p.set(0, 0, 1); p.normalize();
      const E1 = S0.clone().addScaledVector(dir, a * cosA).addScaledVector(p, a * Math.sqrt(1 - cosA * cosA));
      turn(up, E0.clone().sub(S0), E1.sub(S0)); const E2 = WP(lo); turn(lo, WP(ft).sub(E2), T.sub(E2));
      ft.quaternion.copy(WQ(ft.parent).invert().multiply(qF)); ft.updateMatrixWorld(true);
    }
    // points de semelle (monde) du pied i : talon, plante, bout (voir semelle()) ; sinon cheville / orteils approchés
    const semW = (i) => { const S = M.semelle && M.semelle[i], ft = pieds[i][2], toe = orteils[i];
      if (!S || !ft || !toe) { const A = WP(ft), T = toe ? WP(toe) : A.clone(); return { talon: A.clone().setY(A.y - 0.11), plante: T.clone().setY(T.y - 0.04), bout: T.clone().setY(T.y - 0.04) }; }
      return { talon: S.talon.clone().applyMatrix4(ft.matrixWorld), plante: S.plante.clone().applyMatrix4(toe.matrixWorld), bout: S.bout.clone().applyMatrix4(toe.matrixWorld) }; };
    // tourne un os autour de la verticale (le sol est plat : la verticale du monde est celle du groupe), en gardant ses enfants
    const UP = new THREE.Vector3(0, 1, 0), qT = new THREE.Quaternion(), qP = new THREE.Quaternion();
    const twist = (bone, ang) => { bone.parent.getWorldQuaternion(qP); qT.setFromAxisAngle(UP, ang); bone.quaternion.premultiply(qP.clone().invert().multiply(qT).multiply(qP)); bone.updateMatrixWorld(true); };
    const spine3 = [bone('Spine'), bone('Spine1'), bone('Spine2')].filter(Boolean), hipsB = bone('Hips'), spine1 = bone('Spine1');
    const orteils = ['Left', 'Right'].map(c => bone(c + 'ToeBase'));
    const pieds = ['Left', 'Right'].map(c => [bone(c + 'UpLeg'), bone(c + 'Leg'), bone(c + 'Foot')]), cou = bone('Neck'), graine = (S.nb = (S.nb || 0) + 1) * 2.399;
    let neutre = null, faceL = null;   // tête droite (garde basse) : rotations locales du cou et de la tête, axe du visage (voir tete())
    // Retouches par image (torsion des jambes, respiration, IK de l'épaule, recul) : elles s'ajoutent à la pose du mixer.
    // PIÈGE three.js : le mixer ne réécrit un os que si sa valeur animée a CHANGÉ depuis l'image précédente ; sur une pose
    // figée ou un haut du corps statique, nos retouches s'accumulaient d'image en image (torses qui tournaient sans fin).
    // D'où ce registre : chaque os retouché est remis à sa valeur « mixer » au début de l'image suivante.
    const mods = [];
    // (la position est gardée aussi : le report du poids déplace le bassin)
    const mod = (bone) => { if (!bone || bone.userData.modK === frameK) return; bone.userData.modK = frameK; mods.push([bone, bone.quaternion.clone(), bone.position.clone()]); };
    let frameK = 1;
    const f = { group, pose, weapon, body, skinned, mixer, clip: null, frozen: false, isSkinned: true, modele: M.nom, mod, clips: M.clips, yawFix: M.yawFix, loco: M.loco || {}, chuteY: M.chuteY || {}, legClip: null,
      jambes: 0, jambesCible: 0, mode: 'deux', handLocal: { droite: null, gauche: null }, t: 0,
      bones: { rh: bone('RightHand'), lh: bone('LeftHand'), rm: body.getObjectByName('PalmeD'), lm: body.getObjectByName('PalmeG'),
        ra: bone('RightArm'), rf: bone('RightForeArm'), la: bone('LeftArm'), lf: bone('LeftForeArm'), spine: bone('Spine2'), head: bone('Head'), hips: bone('Hips') },
      // joue (en fondu) l'animation demandée ; time : figer à un instant (pose fixe) ; speed : vitesse du cycle
      play(name, opts = {}) {
        const a = act(name); if (!a) return;
        if (this.clip !== name) {
          const prev = this.clip && actions[this.clip];
          a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.play();
          if (opts.start) a.time = opts.start * a.getClip().duration;   // commencer plus loin dans l'animation
          if (prev) a.crossFadeFrom(prev, opts.fade !== undefined ? opts.fade : 0.22, false);
          this.clip = name;
        }
        if (opts.time !== undefined) { a.time = opts.time * a.getClip().duration; a.timeScale = 0; } else a.timeScale = opts.speed || 1;
      },
      // couche « jambes » jouée en plus de l'animation principale (qui ne doit alors pas animer les jambes) ; null : l'enlever
      playLegs(name, opts = {}) {
        if (!name) { if (this.legClip) { actions[this.legClip].fadeOut(0.2); this.legClip = null; } return; }
        const a = act(name); if (!a) return;
        if (this.legClip !== name) { const prev = this.legClip && actions[this.legClip]; a.reset(); a.setEffectiveWeight(1); a.fadeIn(0.15); a.play(); if (prev) prev.fadeOut(0.15); this.legClip = name; }
        a.timeScale = opts.speed || 1;
      },
      // marche dans la direction « ecart » (rad, déplacement par rapport à la direction où le soldat regarde / vise, c.-à-d.
      // le groupe ; > 0 : vers sa gauche) à la vitesse v (m/s) : haut du corps « haut » (sans jambes), jambes = mélange des
      // deux cycles dont la direction de marche MESURÉE (M.dirPas) encadre celle demandée, poids lissés, tous à la même phase
      // (pied gauche au sol au même instant). Renvoie la phase (0..1) pour les bruits de pas.
      // Orientation : la visée de « Walk_Aim_Haut » tient le fusil ~50° à gauche du bassin de la marche avant. Le dos en
      // rattrape la part DOS_VISEE (torsion), le reste tourne tout le corps (this.yawM) ; les pieds, eux, vont toujours dans
      // la direction du déplacement grâce au mélange.
      // mix (facultatif) : la part « marche avant » répartie entre plusieurs cycles avant ({ Pas_Avant_Low: 0.3, Pas_Trot: 0.7 },
      // somme 1 : marche → petite course → course selon la vitesse), tous calés sur la même phase
      marche(ecart, v, dt, haut, avant, mix) {
        const D = M.dirPas || {}, foul = (n) => Math.max(0.2, (M.loco[n] || 1) * (M.clips[n] ? M.clips[n].duration : 1));   // m par cycle
        // (a0 lissé sur ~0,2 s comme le fondu des hauts du corps : passer de la visée à la garde basse, ou de la marche à la
        // course, ne fait plus sauter la torsion du dos)
        const a0c = (M.aimYaw && M.aimYaw[haut.replace(/_Haut$/, '')]) || 0;
        this.a0s = !this.blendW || this.a0s === undefined ? a0c : this.a0s + (a0c - this.a0s) * Math.min(1, dt * 12);
        const a0 = this.a0s, B = -a0 * (1 - DOS_VISEE);
        let e = ecart - B; while (e > Math.PI) e -= 2 * Math.PI; while (e < -Math.PI) e += 2 * Math.PI;
        const wrap = (x) => { while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };
        const PG = 'Pas_Gauche', PD = 'Pas_Droite', PR = 'Pas_Arriere', cible = { [avant]: 0, [PG]: 0, [PD]: 0, [PR]: 0 };
        let tau = 0;
        if (M.clips[PG] && M.clips[PD] && M.clips[PR] && D[PG] !== undefined && D[PD] !== undefined && D[PR] !== undefined) {
          // pas chassé du côté où l'on va (d'après sa direction mesurée : « Pas_Gauche » va en fait vers la droite)
          const cote = D[PG] * e > 0 ? PG : PD, tc = D[cote], ta = D[avant] || 0;
          // course : si tourner simplement le bassin de la course vers la direction garde une torsion épaules / bassin raisonnable
          // (≤ ~55°, typiquement en diagonale vers la droite d'un tireur droitier), on court ainsi : appuis nets de la course,
          // au lieu du pas chassé joué 2 à 3 fois trop vite (pieds qui glissent) ; hystérésis 0,9 / 1,0 rad
          const twA = wrap(e - ta), torsA = Math.abs(wrap(twA + 0.7 * a0));
          // (patrouille, mix : le corps suit déjà le déplacement ; le petit écart des virages est pris par le bassin, jamais par un
          // pas chassé « au pistolet » mélangé à la petite course)
          this.jogTw = (avant === 'Pas_Avant_Course' || avant === 'Pas_Glisse' || !!mix) && Math.abs(e) <= Math.abs(tc) && Math.abs(twA) <= 1.35 && torsA < (this.jogTw ? 1.0 : 0.9);
          if (this.jogTw) { cible[avant] = 1; tau = twA; this.selArr = null; }
          else if (Math.abs(e) <= Math.abs(tc)) {
            // secteur avant : mélange marche avant / pas chassé, poids tels que la somme des foulées (vecteurs) pointe vers e
            // (ces deux démarches se mélangent bien une fois calées en phase, voir M.decal)
            const wa = Math.abs(Math.sin(tc - e)) / foul(avant), wc = Math.abs(Math.sin(e - ta)) / foul(cote), s = wa + wc || 1;
            cible[avant] = wa / s; cible[cote] = wc / s; this.selArr = null;
          } else {
            // secteur arrière : pas chassé et marche arrière se mélangent mal (pas qui s'annulent) ; on joue l'un OU l'autre,
            // bassin tourné (tau) vers la direction exacte, en gardant celui qui tord le moins le dos (avec hystérésis ;
            // le changement se fait en fondu par le lissage des poids)
            const tw = (n) => wrap(e - D[n]), cout = (n) => Math.abs(wrap((M.hipsYaw[n] || 0) - (M.hipsYaw[avant] || 0) + tw(n) + 0.7 * a0)) + (n === PR ? 0 : 0.1);   // (torsion épaules / bassin prévue : le haut du corps en visée est de profil, ~0,7·a0)   // (+0,1 : vu de face, le pas chassé tourné croise les jambes ; la marche arrière, non)
            // (changer de clip fait tourner le bassin de |psi + tau| d'un clip à l'autre, jusqu'à ~160° : il faut que le gain en
            // vaille la peine, et la bascule se fait alors lentement, ~0,5 s, pour ne pas voir le bassin « tourner sur lui-même »)
            const hz = (n) => wrap((M.hipsYaw[n] || 0) - (M.hipsYaw[avant] || 0) + Math.max(-1.5, Math.min(1.5, tw(n)))), [nc, no] = this.selArr ? [PR, cote] : [cote, PR];
            if (this.selArr == null) this.selArr = cout(PR) < cout(cote);   // (entrée dans le secteur : le meilleur, sans hystérésis)
            else if (cout(no) < cout(nc) - 0.2 - 0.3 * Math.abs(wrap(hz(no) - hz(nc)))) { this.selArr = !this.selArr; this.basculeT = 0.5; }
            const n = this.selArr ? PR : cote; cible[n] = 1; tau = Math.max(-1.5, Math.min(1.5, tw(n)));
          }
        } else cible[avant] = 1;
        if (mix) { const wa = cible[avant] || 0; cible[avant] = 0; for (const n in mix) if (M.clips[n] && M.loco[n]) cible[n] = (cible[n] || 0) + wa * mix[n]; }
        // (torsion du bassin au prorata de la couche des jambes : à l'entrée en marche elle monte avec elle)
        this.jambesCible = tau * Math.min(1, (this.marcheK || 0) + dt / 0.35);
        if (!this.blendW) this.blendW = {};
        const bw = this.blendW;
        for (const n in bw) if (!(n in cible)) cible[n] = 0;
        this.basculeT = Math.max(0, (this.basculeT || 0) - dt);
        let tot = 0; for (const n in cible) { bw[n] = (bw[n] || 0) + (cible[n] - (bw[n] || 0)) * Math.min(1, dt * (this.basculeT > 0 ? 3.5 : 8)); if (bw[n] < 0.004 && cible[n] === 0) bw[n] = 0; tot += bw[n]; }
        // foulée du mélange : somme VECTORIELLE (en diagonale, avant + côté avancent moins que la somme des longueurs) ;
        // c'est elle qui cale la cadence sur la vitesse réelle (pas de pieds qui glissent)
        // (mesuré : la vraie foulée d'un mélange est entre la somme vectorielle et la somme des longueurs ; on prend la moyenne)
        let fx = 0, fz = 0, fl = 0; for (const n in bw) if (bw[n] > 0) { const L = bw[n] / tot * foul(n), t = D[n] || 0; fx += L * Math.sin(t); fz += L * Math.cos(t); fl += L; }
        this.ph = ((this.ph || 0) + dt * v / Math.max(0.25, (Math.hypot(fx, fz) + fl) / 2)) % 1;
        // entrée en marche : la couche des jambes monte en ~0,2 s (l'animation précédente s'efface pendant ce temps)
        this.marcheK = Math.min(1, (this.marcheK || 0) + dt / 0.35);
        let psi = 0;
        for (const n in bw) {
          const a = act(n); if (!a) continue;
          const w = tot > 0 ? bw[n] / tot : 0;
          // (isScheduled et non isRunning : une action à timeScale 0 n'est jamais « running » pour three.js ; avec isRunning les
          // couches de jambes n'étaient jamais arrêtées ni effacées et pesaient encore sur toutes les poses suivantes)
          if (w <= 0) { if (a.isScheduled()) a.stop(); continue; }
          if (!a.isScheduled()) { a.reset(); a.play(); }
          a.enabled = true; a.timeScale = 0; a.stopFading(); a.setEffectiveWeight(w * this.marcheK);
          a.time = ((this.ph + (M.phase0[n] || 0) + ((M.decal && M.decal[avant] && M.decal[avant][n]) || 0)) % 1) * a.getClip().duration;
          psi += w * ((M.hipsYaw[n] || 0) - (M.hipsYaw[avant] || 0));
        }
        while (psi > Math.PI) psi -= 2 * Math.PI; while (psi < -Math.PI) psi += 2 * Math.PI;
        this.dosM = psi + a0; this.yawM = B; this.blendFrame = frameK; this.coteK = tot > 0 ? ((bw[PG] || 0) + (bw[PD] || 0)) / tot : 0; this.arrK = tot > 0 ? (bw[PR] || 0) / tot : 0;
        // (haut du corps calé sur la phase de SES jambes d'origine : celles du clip dont il est tiré, sinon la marche avant)
        const hb = haut.replace(/_Haut$/, ''), ph0 = M.phase0[hb] !== undefined ? M.phase0[hb] : (M.phase0[avant] || 0);
        this.play(haut, { time: ((this.ph + ph0) % 1), fade: 0.25 });
        return this.ph;
      },
      // keepYaw : garder la correction actuelle (chute : on ne fait pas pivoter un corps qui tombe)
      // jambes : angle (rad, autour de la verticale) entre la direction du déplacement et celle du corps. Le bassin et les
      // jambes tournent de cet angle, le dos le rattrape (réparti sur les trois vertèbres) : le torse et l'arme restent vers
      // la cible pendant que les jambes marchent là où le soldat va (pas de côté, recul). Lissé pour ne pas sauter.
      update(dt, keepYaw) {
        const enMarche = !!this.blendW && this.blendFrame === frameK;
        // arrêt après une marche / course : les pieds sont « cloués » là où ils étaient affichés (positions monde de l'image
        // précédente, lues AVANT d'effacer les retouches), puis posé() les amène un par un à la pose d'arrêt
        const changeRepos = this.clipVu && this.clipVu !== this.clip && REPOS[this.clipVu] && REPOS[this.clip];   // garde basse <-> visée à l'arrêt
        if ((this.blendW && !enMarche || changeRepos) && !keepYaw && pieds[0][2] && pieds[1][2]) this.pose0 = { t: 0, lock: pieds.map(l => new THREE.Vector3().setFromMatrixPosition(l[2].matrixWorld)), lockQ: pieds.map(l => { const q = new THREE.Quaternion(); l[2].matrixWorld.decompose(V(), q, V()); return q; }) };
        for (const [b, q, p] of mods) { b.quaternion.copy(q); b.position.copy(p); } mods.length = 0;
        if (this.blendW && !enMarche) {   // plus en marche directionnelle : les jambes mélangées s'effacent
          for (const n in this.blendW) { const a = actions[n]; if (a && a.isScheduled() && this.blendW[n] > 0) a.fadeOut(0.3); }
          this.blendW = null; this.dosM = (this.dosM || 0) + (this.yawM || 0);   // (torsion figée, qui s'efface avec marcheK)
        }
        if (!enMarche) this.marcheK = Math.max(0, (this.marcheK || 0) - dt / 0.3);
        frameK++;
        mixer.update(dt); this.t += dt;
        // chute dans le dos : vers 55-75 % de l'animation le bassin roule et une jambe part en l'air (botte vers le ciel) : un pied
        // plus haut que le bassin est redescendu de 30 % de cet écart (IK de la jambe) autour de ce moment
        if (this.clip === 'Shot_in_the_Back_and_Fall' && actions[this.clip] && hipsB) {
          const p = actions[this.clip].time / M.clips[this.clip].duration, w = Math.max(0, 1 - Math.abs(p - 0.63) / 0.15);
          if (w > 0) { group.updateMatrixWorld(true); const hy = WP(hipsB).y;
            for (const [up, lo, ft] of pieds) if (ft) { const e = WP(ft).y - hy; if (e > 0) ik(up, lo, ft, new THREE.Vector3(0, -0.3 * w * e, 0)); } }
        }
        [this.epK, this.epV] = ressort(this.epK || 0, this.epV || 0, EPAULE[this.clip] ? 1 : 0, 11, dt);   // (ressort : pas d'à-coup au début des fondus)
        if (!keepYaw) { const tgt = enMarche ? this.yawM : (M.yawFix[this.clip] || 0); let d = tgt - body.rotation.y; body.rotation.y += d * Math.min(1, dt * 5); }   // (lent : les corrections diffèrent d'une pose à l'autre)
        // torsion du dos en marche directionnelle : bassin des pas chassés / arrière (psi) + visée (le corps n'est tourné que
        // de yawM, le dos fait le reste, calculé sur l'orientation ACTUELLE du corps pour que le fusil reste sur la cible
        // pendant que le corps pivote) ; pondérée par marcheK (entrée / sortie en fondu, comme les animations)
        this.dosComp = (this.marcheK || 0) > 0 ? this.marcheK * ((this.dosM || 0) + (enMarche ? body.rotation.y : 0)) : 0;
        let dj = this.jambesCible - this.jambes; while (dj > Math.PI) dj -= 2 * Math.PI; while (dj < -Math.PI) dj += 2 * Math.PI;
        // (sortie de marche directionnelle : la torsion du bassin se défait au rythme du fondu des jambes, pas d'un coup)
        const kj = !enMarche && (this.marcheK || 0) > 0 ? dt * 6 : dt * 14;
        const vj = enMarche ? 5 : (this.marcheK || 0) > 0 ? 3.5 : this.pose0 ? 4 : 9;   // (pas de replacement en cours : le bassin tourne avec les pas)   // (rad/s ; en marche directionnelle et en sortie de marche, le bassin tourne posément)
        this.jambes += Math.max(-vj * dt, Math.min(vj * dt, dj * Math.min(1, kj)));
        // visée à l'arrêt : l'animation est de profil « sur un fil » (pieds l'un derrière l'autre sur l'axe de tir, jambes qui se
        // confondent vues de face) ; le bassin et les jambes sont tournés de CARRE vers la cible, le dos rattrape (fusil immobile)
        this.carreK = (this.carreK || 0) + (((this.clip === 'Rifle_Aim_Turn_Right' || this.clip === 'Standing_Reload') && !keepYaw ? 1 : 0) - (this.carreK || 0)) * (dt > 0 ? Math.min(1, dt * 6) : 1);
        const tj = this.jambes + CARRE * this.carreK;
        if (Math.abs(tj) > 0.01 && hipsB && spine3.length) {
          body.updateMatrixWorld(true); mod(hipsB); twist(hipsB, tj);
          for (const sb of spine3) { mod(sb); twist(sb, -tj / spine3.length); }
        }
        // le bassin des pas chassés / de la marche arrière n'est pas orienté comme celui de la marche avant : le dos rattrape
        if (this.dosComp && Math.abs(this.dosComp) > 0.01 && spine3.length) { body.updateMatrixWorld(true); for (const sb of spine3) { mod(sb); twist(sb, -this.dosComp / spine3.length); } }
        // respiration (poses fixes : garde basse, visée) : légère flexion du dos
        if (spine1 && (this.clip === 'Garde_Basse' || this.clip === 'Rifle_Aim_Turn_Right')) { mod(spine1); spine1.rotation.x += Math.sin(this.t * 1.9) * 0.012; spine1.rotation.z += Math.sin(this.t * 0.7) * 0.006; }
        [this.gbK, this.gbV] = ressort(this.gbK || 0, this.gbV || 0, this.clip === 'Garde_Basse' || this.clip === 'Walk_Low_Haut' || this.clip === 'Run_Low_Haut' || this.clip === 'Trot_Low_Haut' || BAS[this.clip] ? 1 : 0, 9, dt);
        if (Math.max(this.epK || 0, this.gbK) > 0.01 && !keepYaw) this.penche(Math.max(this.epK || 0, this.gbK));
        if (enMarche && (this.marcheK || 0) > 0.05) this.ecarte(this.marcheK, this.coteK || 0, this.arrK || 0);
        else if (this.verrouPieds && !keepYaw) this.ecarte(1, 0, 0);   // (marche accroupie, course épaulée : chevilles jamais croisées)
        this.verrou(dt, !keepYaw && (enMarche || !!this.verrouPieds) && !S.sansVerrou);
        const repos = (this.clip === 'Garde_Basse' || this.clip === 'Rifle_Aim_Turn_Right') && !enMarche && !keepYaw;
        if (this.pose0) this.poserPieds(dt, repos);
        this.appui(dt, repos && !this.pose0);
        if (!keepYaw && !S.sansSol) this.sol();
        this.tete(dt, keepYaw ? null : repos || enMarche || !!EPAULE[this.clip] || !!BAS[this.clip]);
        this.clipVu = this.clip;
      },
      // pivot sur place (app.js) : les pieds, cloués pendant que le torse tourne, se replacent face au torse par deux petits pas
      // (même mécanique que l'arrêt : pieds partant de leur position affichée, voir poserPieds)
      repas() {
        if (!pieds[0][2] || !pieds[1][2] || (this.pose0 && this.pose0.t < 0.5)) return;
        this.pose0 = { t: 0, lock: pieds.map(l => new THREE.Vector3().setFromMatrixPosition(l[2].matrixWorld)), lockQ: pieds.map(l => { const q = new THREE.Quaternion(); l[2].matrixWorld.decompose(V(), q, V()); return q; }) };
      },
      // Pose des pieds à l'arrêt : au lieu de glisser en 0,3 s vers la pose d'arrêt (fondu), chaque pied reste cloué au sol
      // là où il était puis fait un petit pas (léger lever) jusqu'à sa place : d'abord celui qui était levé, puis l'autre.
      // IK des jambes par-dessus le fondu (la cible suit la pose du mixer, qui devient celle de l'arrêt).
      poserPieds(dt, repos) {
        const P = this.pose0; P.t += dt;
        if (!repos || P.t > 0.62) { this.pose0 = null; return; }
        group.updateMatrixWorld(true);
        const cur = pieds.map(l => WP(l[2]));
        if (!P.ordre) { if (Math.max(cur[0].distanceTo(P.lock[0]), cur[1].distanceTo(P.lock[1])) > 0.8) { this.pose0 = null; return; }   // (téléporté)
          P.ordre = P.lock[0].y >= P.lock[1].y ? [0, 1] : [1, 0]; }
        P.ordre.forEach((i, rang) => {
          const x = Math.max(0, Math.min(1, (P.t - rang * 0.16) / 0.24)), s = x * x * (3 - 2 * x); if (s >= 1) return;
          const L = P.lock[i], C = cur[i], h = Math.min(0.11, 0.45 * Math.hypot(C.x - L.x, C.z - L.z));   // (un vrai pas : pied levé de 4 à 11 cm, pas traîné)
          const T = L.clone().lerp(C, s); T.y += h * Math.sin(Math.PI * s);
          const ft = pieds[i][2], qC = WQ(ft), d = T.sub(C); if (d.lengthSq() > 1e-8) ikJambe(pieds[i][0], pieds[i][1], ft, d, orteils[i]);
          // orientation du pied aussi (sinon la pointe pivote autour de la cheville cloué et glisse)
          mod(ft); ft.quaternion.copy(WQ(ft.parent).invert().multiply(P.lockQ[i].clone().slerp(qC, s))); ft.updateMatrixWorld(true);
        });
      },
      // Pieds d'appui cloués au sol pendant la locomotion (« foot locking ») : les cycles ont un déplacement du bassin rendu
      // constant (le jeu déplace le soldat à vitesse régulière) alors que dans la capture il accélère et ralentit pendant le pas :
      // le pied d'appui glissait de 0,2 à 0,7 m/s (mesuré). Chaque pied posé est cloué là où il s'est posé : d'abord le talon
      // (cheville basse), puis la pointe quand le talon se lève (déroulé du pied), relâché quand l'animation le soulève ;
      // l'écart est rattrapé par l'IK de la jambe (orientation du pied gardée) et se résorbe en ~0,12 s pendant le vol du pied.
      verrou(dt, actif) {
        const Lk = this.lock || (this.lock = [{ w: 0 }, { w: 0 }]); if (!pieds[0][2] || !orteils[0] || !orteils[1]) return;
        if (!actif && Lk[0].w <= 0 && Lk[1].w <= 0) { Lk[0].piv = Lk[1].piv = null; return; }
        group.updateMatrixWorld(true);
        const gy = group.getWorldPosition(V()).y, so = [semW(0), semW(1)], bas = (s) => Math.min(s.talon.y, s.plante.y, s.bout.y) - gy;
        pieds.forEach(([up, lo, ft], i) => {
          const L = Lk[i], S = so[i], h = bas(S), hT = S.talon.y - gy, hP = Math.min(S.plante.y, S.bout.y) - gy;
          // vitesse (monde) du pied tel que l'animation le place : un pied d'appui est presque immobile au sol, un pied en l'air
          // qui passe près du sol avance à 2-3 fois la vitesse du corps (il ne doit pas être cloué en plein pas)
          const vA = L.pA && dt > 0 ? Math.hypot(S.plante.x - L.pA.x, S.plante.z - L.pA.z) / dt : 0; L.pA = S.plante.clone();
          // appui : semelle à moins de 3 cm du sol, plus basse que l'autre, et pied (presque) immobile ; pivot : talon posé →
          // talon, sinon la plante
          const appui = h < 0.03 && h <= bas(so[1 - i]) + 0.02 && (L.piv || vA < 1.1);
          const piv = !actif ? null : appui && hT < 0.02 ? 'A' : appui ? 'T' : (L.piv && h < 0.05 ? L.piv : null);
          if (piv) {
            const P = piv === 'A' ? S.talon : S.plante;
            if (L.piv !== piv) { L.anc = P.clone(); if (L.off && L.w > 0) L.anc.addScaledVector(L.off, L.w * L.w * (3 - 2 * L.w)); L.piv = piv; }
            // (et posé AU sol : le point d'appui de la semelle à hauteur 0 ; les cycles flottent ou s'enfoncent de 1 à 4 cm)
            const dy = Math.max(-0.04, Math.min(0.05, -(piv === 'A' ? hT : hP)));
            const d = new THREE.Vector3(L.anc.x - P.x, dy, L.anc.z - P.z);
            if (Math.hypot(d.x, d.z) > 0.22) { L.piv = null; L.w = Math.max(0, L.w - dt / 0.12); }   // (trop loin : pivot sur place, saut)
            else { L.off = d; L.w = Math.min(1, L.w + dt / 0.05); }
          } else { L.piv = null; L.w = Math.max(0, L.w - dt / 0.12); }
          if (L.w > 0 && L.off && L.off.lengthSq() > 1e-8) ikJambe(up, lo, ft, L.off.clone().multiplyScalar(L.w * L.w * (3 - 2 * L.w)), orteils[i]);
        });
      },
      // Sol : aucun point de semelle sous le sol (debout, accroupi, en marche) : le pied est remonté par l'IK de la jambe.
      sol() {
        if (!M.semelle || !pieds[0][2]) return;
        group.updateMatrixWorld(true); const gy = group.getWorldPosition(V()).y;
        pieds.forEach(([up, lo, ft], i) => { const S = semW(i), h = Math.min(S.talon.y, S.plante.y, S.bout.y) - gy; if (h < -0.003) ikJambe(up, lo, ft, new THREE.Vector3(0, -h, 0), orteils[i]); });
      },
      // Posture de tir offensive (poses épaulées) : les animations tiennent souvent le buste en arrière (épaules derrière le
      // bassin, poids sur les talons). On mesure de combien la poitrine (Spine2) est en avant du bassin dans la direction de
      // visée et on penche le bas du dos (Spine, Spine1) pour l'amener à PENCHE m devant ; Spine2 est contre-tourné d'autant :
      // la poitrine avance sans basculer, le fusil reste à niveau sur la cible (la tête est redressée ensuite par tete()).
      penche(k) {
        if (!hipsB || spine3.length < 3 || S.sansPenche) return;   // (S.sansPenche : comparaison dans les pages d'outils)
        group.updateMatrixWorld(true);
        // repère du CORPS (le tireur est de profil : mesuré selon la visée, c'était surtout une flexion latérale) : latéral = ligne
        // des épaules, avant = sa normale horizontale ; on vise PENCHE (rad) entre la verticale et bassin → cou
        const B = this.bones, cou0 = cou || B.head; if (!B.la || !B.ra || !cou0) return;
        // visée : buste plus de face (les visées Mixamo sont presque de profil, épaules à ~75° de la cible ; tireur moderne :
        // épaules presque carrées) — le dos tourne pour amener la ligne des épaules à BIAIS (rad) de la face ; le fusil est
        // placé ensuite (poseArme), les bras suivent
        { const ek = this.epK || 0; if (ek > 0.01 && !S.sansCarre) { const e = WP(B.la).sub(WP(B.ra)).applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion()).invert());
          const d = Math.max(-1, Math.min(1, Math.PI / 2 - BIAIS - Math.atan2(e.x, e.z))) * ek; if (Math.abs(d) > 0.01) for (const sb of spine3) { mod(sb); twist(sb, d / spine3.length); } } }
        const lat = WP(B.la).sub(WP(B.ra)); lat.y = 0; if (lat.lengthSq() < 1e-6) return; lat.normalize();
        // direction : 30 % normale des épaules, 70 % axe de visée (le tireur étant de profil, sinon il penche vers sa droite)
        const fwG = new THREE.Vector3(0, 0, 1).applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion())); fwG.y = 0; fwG.normalize();
        const fw = new THREE.Vector3().crossVectors(lat, new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(0.3).addScaledVector(fwG, 0.7).normalize();
        lat.crossVectors(new THREE.Vector3(0, 1, 0), fw).normalize();
        const axe = (b, ang) => { mod(b); b.parent.getWorldQuaternion(qP); qT.setFromAxisAngle(lat, ang); b.quaternion.premultiply(qP.clone().invert().multiply(qT).multiply(qP)); b.updateMatrixWorld(true); };
        // trois passes : (1) le haut du dos n'est jamais voûté au-delà de ~17° (Spine2 → cou ; certaines animations le sont déjà :
        // on redresse Spine2 d'autant), (2) l'inclinaison bassin → cou est amenée à PENCHE par le BAS du dos (Spine, Spine1)
        // (les pivots du dos sont au-dessus du bassin : l'angle bougeant moins que la rotation, on itère)
        // (0) charnière de hanche : le bassin bascule vers l'avant (jusqu'à ~7°), les pieds restent en place (IK des jambes,
        // orientation gardée) ; elle fait pencher tout le buste d'un coup, sans voûter le dos
        const cible = this.clip === 'Rifle_Aim_Turn_Right' ? 0.3 : PENCHE;
        if (pieds[0][2] && pieds[1][2]) { const v0 = WP(cou0).sub(WP(hipsB)), hg = Math.max(0, Math.min(0.12, (cible - Math.atan2(v0.dot(fw), Math.max(0.05, v0.y))) * 0.5 * k));
          if (hg > 0.004) { const pf = pieds.map(l => [WP(l[2]), WQ(l[2])]); axe(hipsB, hg);
            pieds.forEach(([up, lo, ft], i) => { const d = pf[i][0].clone().sub(WP(ft)); if (d.lengthSq() > 1e-10) ikJambe(up, lo, ft, d, orteils[i]); mod(ft); ft.quaternion.copy(WQ(ft.parent).invert().multiply(pf[i][1])); ft.updateMatrixWorld(true); }); } }
        for (let it = 0, tot = 0; it < 3; it++) {
          const w2 = WP(cou0).sub(WP(spine3[2])), h2 = Math.atan2(w2.dot(fw), Math.max(0.05, w2.y)); if (h2 > 0.3) axe(spine3[2], -(h2 - 0.3) * k);
          const v = WP(cou0).sub(WP(hipsB)), a = Math.min(0.6 - tot, (cible - Math.atan2(v.dot(fw), Math.max(0.05, v.y))) * k * 1.5);   // (visée à l'arrêt : l'animation a le poids sur l'arrière, on penche plus)
          if (a < 0.005) continue;   // (seulement vers l'avant : une course déjà penchée n'est pas redressée)
          axe(spine3[0], a * 0.55); axe(spine3[1], a * 0.45); tot += a;
        }
        // roulis : les visées de la bibliothèque penchent le buste sur le côté (10 à 18°) ; ramené à 4° au plus (bas du dos)
        for (let it = 0; it < 2; it++) { const v = WP(cou0).sub(WP(hipsB)), r = Math.atan2(v.dot(lat), Math.max(0.05, v.y)), ex = r - Math.max(-0.07, Math.min(0.07, r));
          if (Math.abs(ex) < 0.004) break;
          for (const [b, part] of [[spine3[0], 0.5], [spine3[1], 0.5]]) { mod(b); b.parent.getWorldQuaternion(qP); qT.setFromAxisAngle(fw, ex * part * k); b.quaternion.premultiply(qP.clone().invert().multiply(qT).multiply(qP)); b.updateMatrixWorld(true); } }
      },
      // Pieds jamais croisés (pas chassés et marche arrière « au pistolet » de la bibliothèque : pas très serrés, bottes l'une sur
      // l'autre, genoux qui se touchent) : écart minimal des chevilles le long de la ligne du bassin (les deux pieds poussés
      // chacun de la moitié, IK, orientation gardée), puis genoux tournés un peu vers l'extérieur autour de l'axe
      // hanche → cheville (la cheville ne bouge pas), au prorata de la part des pas de côté / arrière (k).
      ecarte(K, k, kr) {
        if (!pieds[0][2] || !pieds[1][2]) return;
        group.updateMatrixWorld(true);
        const lat = WP(pieds[0][0]).sub(WP(pieds[1][0])); lat.y = 0; if (lat.lengthSq() < 1e-6) return; lat.normalize();   // vers la gauche du bassin
        const MIN = (0.1 + 0.1 * k + 0.06 * kr) * K, sep = WP(pieds[0][2]).sub(WP(pieds[1][2])).dot(lat);
        if (sep < MIN) {   // (surtout le pied levé : celui au sol glisserait)
          const d = Math.min(0.3, MIN - sep), yL = WP(pieds[0][2]).y, yR = WP(pieds[1][2]).y, pl = Math.max(0.1, Math.min(0.9, 0.5 + (yL - yR) * 10));
          ikJambe(pieds[0][0], pieds[0][1], pieds[0][2], lat.clone().multiplyScalar(d * pl), orteils[0]); ikJambe(pieds[1][0], pieds[1][1], pieds[1][2], lat.clone().multiplyScalar(-d * (1 - pl)), orteils[1]); }
        const kg = Math.min(1, k + kr); if (kg * K < 0.05) return;   // (genoux : pas chassés, et un peu la marche arrière)
        // silhouette vue de la direction de visée (axe latéral du groupe, gx = gauche du soldat) : si les genoux s'y croisent
        // ou se touchent, on les tourne davantage vers leur côté, et vers ce côté-là plutôt que selon la ligne du bassin
        const gx = new THREE.Vector3(1, 0, 0).applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion())); gx.y = 0; gx.normalize();
        const vueG = WP(pieds[0][1]).sub(WP(pieds[1][1])).dot(gx), sepG = WP(pieds[0][1]).sub(WP(pieds[1][1])).dot(lat);
        // (genoux visés : écart des chevilles + 3 cm ; plus larges que les pieds, ce serait des jambes arquées « de cow-boy »)
        const sepP = WP(pieds[0][2]).sub(WP(pieds[1][2])).dot(lat), cibleG = Math.max(0.12, sepP + 0.03), large = sepG > sepP + 0.04;
        const serreV = large ? 0 : Math.max(0, Math.min(1, (0.2 - vueG) / 0.15)), serre = large ? 0 : Math.max(serreV, Math.min(1, Math.max(0, (cibleG - sepG) / 0.1)));
        pieds.forEach(([up, lo, ft], i) => {
          const S0 = WP(up), K0 = WP(lo), H0 = WP(ft), ax = H0.clone().sub(S0); if (ax.lengthSq() < 1e-6) return; ax.normalize();
          const kp = K0.clone().sub(S0); kp.addScaledVector(ax, -kp.dot(ax)); if (kp.lengthSq() < 1e-8) return; kp.normalize();
          const out = lat.clone().lerp(gx, serreV * 0.7 * Math.abs(lat.dot(gx))).multiplyScalar(i ? -1 : 1);   // (bassin très tourné : l'axe du groupe serait dans le sens du pas) out.addScaledVector(ax, -out.dot(ax)); if (out.lengthSq() < 1e-6) return; out.normalize();
          // angle (signé, autour de ax) du genou vers l'extérieur ; on en fait une part (plus grande si les genoux se serrent
          // dans la silhouette), limitée à 30°
          let a = Math.atan2(new THREE.Vector3().crossVectors(kp, out).dot(ax), kp.dot(out)); a = Math.max(-0.52, Math.min(0.52, a * (large ? 0 : 0.2 + 0.6 * serre) * kg * K));   // (30° au plus)
          if (Math.abs(a) < 0.005) return;
          const qF = WQ(ft); mod(up); mod(ft);
          up.quaternion.copy(WQ(up.parent).invert().multiply(new THREE.Quaternion().setFromAxisAngle(ax, a)).multiply(WQ(up))); up.updateMatrixWorld(true);
          ft.quaternion.copy(WQ(ft.parent).invert().multiply(qF)); ft.updateMatrixWorld(true);
        });
      },
      // Report du poids au repos : le bassin glisse lentement (~5,5 s) d'une jambe sur l'autre, s'abaisse un peu et s'incline
      // vers la jambe libre ; les pieds restent au sol (IK), les épaules restent à peu près droites.
      appui(dt, actif) {
        this.reposK = (this.reposK || 0) + ((actif ? 1 : 0) - (this.reposK || 0)) * Math.min(1, dt * 1.5);
        if (this.reposK < 0.01 || !hipsB || !pieds[0][2] || !pieds[1][2]) return;
        group.updateMatrixWorld(true);
        const s0 = Math.sin(this.t * 1.14 + graine), s = Math.sign(s0) * Math.pow(Math.abs(s0), 0.6) * this.reposK;   // (s'attarde sur chaque jambe)
        const avant = pieds.map(l => WP(l[2])), gq = group.getWorldQuaternion(new THREE.Quaternion());
        const lat = new THREE.Vector3(1, 0, 0).applyQuaternion(gq), fw = new THREE.Vector3(0, 0, 1).applyQuaternion(gq);
        mod(hipsB);
        const h0 = WP(hipsB), h1 = h0.clone().addScaledVector(lat, s * 0.022).addScaledVector(fw, -0.05 * this.reposK); h1.y -= 0.008 * Math.abs(s);   // (bassin un peu en arrière : poids sur l'avant des pieds)
        hipsB.position.add(hipsB.parent.worldToLocal(h1).sub(hipsB.parent.worldToLocal(h0.clone()))); hipsB.updateMatrixWorld(true);
        const roule = (b, a) => { b.parent.getWorldQuaternion(qP); qT.setFromAxisAngle(fw, a); b.quaternion.premultiply(qP.clone().invert().multiply(qT).multiply(qP)); b.updateMatrixWorld(true); };
        roule(hipsB, -s * 0.035); if (spine1) { mod(spine1); roule(spine1, s * 0.03); }
        // garde basse : pied gauche ~17 cm en avant (appui décalé) et bassin 3 cm plus bas (genoux fléchis ~15-20°)
        const gb = this.clip === 'Garde_Basse' ? this.reposK : 0;
        if (gb > 0.01) { avant[0].addScaledVector(fw, 0.17 * gb); hipsB.position.add(hipsB.parent.worldToLocal(WP(hipsB).add(new THREE.Vector3(0, -0.03 * gb, 0))).sub(hipsB.parent.worldToLocal(WP(hipsB)))); hipsB.updateMatrixWorld(true); }
        pieds.forEach((l, i) => { const d = avant[i].clone().sub(WP(l[2])); if (d.lengthSq() > 1e-8) ikJambe(l[0], l[1], l[2], d, orteils[i]); });
        // visée : le genou avant ne rentre pas vers l'intérieur (légère rotation des genoux vers l'extérieur, pieds immobiles)
        if (this.clip === 'Rifle_Aim_Turn_Right') this.ecarte(this.reposK, 0, 0.6);
      },
      // Tête : regarde la cible (this.regard = {x, z} dans le monde, donné par le jeu ; limité en visée, la joue est sur la
      // crosse) ; sans cible, au repos, coups d'œil lents à gauche / à droite. Réparti sur le cou et la tête.
      tete(dt, actif) {
        if (!cou || !this.bones.head) return;
        let want = 0;
        if (actif) {
          const vise = EPAULE[this.clip] ? 0.3 : 1.0;
          if (this.regard) { const g = group.getWorldPosition(V()), fq = new THREE.Vector3(0, 0, 1).applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion()));
            let a = Math.atan2(this.regard.x - g.x, this.regard.z - g.z) - Math.atan2(fq.x, fq.z); while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI;
            want = Math.max(-vise, Math.min(vise, a)); this.coupT = 0; }
          else if (this.clip === 'Garde_Basse' || this.clip === 'Rifle_Aim_Turn_Right' || this.clip === 'Accroupi_Bas' || this.clip === 'Accroupi_Vise') {
            this.coupT = (this.coupT || 0) - dt;
            if (this.coupT <= 0) { this.nCoup = (this.nCoup || 0) + 1; const r = Math.abs(Math.sin(this.nCoup * 12.9898 + graine * 78.233) * 43758.5453) % 1;
              this.coup = this.nCoup % 2 ? (r - 0.5) * 1.3 * vise : 0; this.coupT = 2.2 + 3 * r; }
            want = Math.max(-0.65 * vise, Math.min(0.65 * vise, this.coup || 0));   // (coup d'œil tiré en garde basse, puis visée)
          }
        }
        this.teteA = (this.teteA || 0) + (want - (this.teteA || 0)) * Math.min(1, dt * 3.5);
        const H = this.bones.head, kA = actif && neutre ? Math.max(this.epK || 0, this.gbK || 0) : 0;   // (visée ; garde basse : le dos penché ne doit pas baisser la tête)
        if (kA > 0.01) {
          // En visée, les animations collent la joue sur la crosse (tête roulée vers la droite et penchée sur le fusil) ; notre
          // fusil est plus bas : tête et cou ramenés vers leur pose droite (celle de la garde basse), puis la face tournée vers
          // la direction de visée (+ coup d'œil / cible), un peu vers le bas : 40 % par le cou, le reste par la tête.
          mod(cou); mod(H); cou.quaternion.slerp(neutre[0], 0.75 * kA); H.quaternion.slerp(neutre[1], 0.75 * kA); cou.updateMatrixWorld(true);
          const fq = new THREE.Vector3(0, 0, 1).applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion())), y = Math.atan2(fq.x, fq.z) + this.teteA, p = -0.08 - 0.1 * (this.gbK || 0) * (1 - (this.epK || 0));   // (garde basse : regard un peu plus bas)
          // marche : la tête suit un peu chaque pas (±1° de tangage au rythme des pas, ±0,8° de roulis au rythme du cycle)
          const acl = actions[this.clip], pas = this.blendW && this.blendFrame === frameK - 1 ? (this.ph || 0) : acl && M.loco && M.loco[this.clip] && acl.timeScale > 0 ? acl.time / acl.getClip().duration : null, bob = pas === null ? 0 : 0.018 * Math.sin(4 * Math.PI * pas), roul = pas === null ? 0 : 0.014 * Math.sin(2 * Math.PI * pas);
          const cible = new THREE.Vector3(Math.sin(y) * Math.cos(p + bob), Math.sin(p + bob), Math.cos(y) * Math.cos(p + bob));
          // visée : le regard suit le canon (direction donnée par poseArme à l'image précédente)
          if (this.visee && (this.epK || 0) > 0.01) { cible.lerp(this.visee, this.epK).normalize(); if (bob) cible.y += bob; cible.normalize(); }
          const tourne = (b, part) => { const face = faceL.clone().applyQuaternion(WQ(H)).normalize(), q = new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(face, cible), part * kA);
            b.quaternion.copy(WQ(b.parent).invert().multiply(q).multiply(WQ(b))); b.updateMatrixWorld(true); };
          // cou redressé (60 % vers la verticale : le dos penché l'entraîne), puis visage vers la cible, puis roulis : le haut de
          // la tête (axe +Y local) ramené vers la verticale autour de l'axe du visage (tête droite, pas couchée sur la crosse)
          { const v = WP(H).sub(WP(cou)).normalize(), up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(v, v.clone().lerp(up, 0.6).normalize()), kA);
            cou.quaternion.copy(WQ(cou.parent).invert().multiply(q).multiply(WQ(cou))); cou.updateMatrixWorld(true); }
          tourne(H, 1);
          { const qh = WQ(H), fa = faceL.clone().applyQuaternion(qh).normalize(), u = new THREE.Vector3(0, 1, 0).applyQuaternion(qh), up = new THREE.Vector3(0, 1, 0).addScaledVector(fa, -fa.y);
            if (up.lengthSq() > 1e-4) { up.normalize(); u.addScaledVector(fa, -u.dot(fa)).normalize();
              // (en visée, la joue vient sur la crosse : tête inclinée de ~10° vers la droite, pas plus — la version exagérée déplaisait)
              const ang = (Math.atan2(new THREE.Vector3().crossVectors(u, up).dot(fa), u.dot(up)) + 0.17 * (this.epK || 0) + roul) * kA, qr = new THREE.Quaternion().setFromAxisAngle(fa, ang);
              H.quaternion.copy(WQ(H.parent).invert().multiply(qr).multiply(qh)); H.updateMatrixWorld(true); } }
          return;
        }
        if (Math.abs(this.teteA) < 0.005) return;
        mod(cou); twist(cou, this.teteA * 0.4); mod(H); twist(H, this.teteA * 0.6);
      },
      // Rechargement : l'animation lève le fusil au-dessus du casque, canon vers le ciel, et la main gauche ne va jamais au
      // chargeur. On impose une position de rechargement : poignée devant la poitrine (~30 cm devant, 12 cm sous Spine2), canon
      // vers l'avant-bas (20°) un peu en travers (15° vers la gauche), incliné de 25° ; la main droite y est amenée par IK
      // (orientation comprise : main = arme · prise⁻¹). Entrée / sortie en fondu au début et à la fin du clip (p : 0..1).
      poche(p, L) {
        const x = Math.max(0, Math.min(1, p / 0.12, (0.96 - p) / 0.12)), w = x * x * (3 - 2 * x); if (w < 0.01) return;   // (fini un peu avant la fin du clip : la fin du rechargement du jeu tombe à une image près)
        const B = this.bones, rh = B.rh; group.updateMatrixWorld(true);
        const gq = group.getWorldQuaternion(new THREE.Quaternion()), sc = group.getWorldScale(V()).x, up = new THREE.Vector3(0, 1, 0);
        const fw = new THREE.Vector3(0, 0, 1).applyQuaternion(gq), lat = new THREE.Vector3(1, 0, 0).applyQuaternion(gq);
        const d = fw.clone().multiplyScalar(Math.cos(0.26)).addScaledVector(lat, Math.sin(0.26)); d.multiplyScalar(Math.cos(-0.35)).addScaledVector(up, Math.sin(-0.35)).normalize();
        const u = up.clone().addScaledVector(d, -up.dot(d)).normalize(), qW = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(u, d), u, d));
        qW.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.45));
        const T = WP(B.spine).addScaledVector(fw, 0.3 * sc).addScaledVector(up, -0.12 * sc).addScaledVector(lat, -0.04 * sc);
        const posW = T.clone().sub((weapon.gripPt || V()).clone().multiplyScalar(sc).applyQuaternion(qW));
        const Hd = new THREE.Matrix4().compose(posW, qW, new THREE.Vector3(sc, sc, sc)).multiply(new THREE.Matrix4().copy(L).invert());
        const hp = V(), hq = new THREE.Quaternion(); Hd.decompose(hp, hq, V());
        const h0 = WP(rh), tq = WQ(rh).slerp(hq, w);
        ik(B.ra, B.rf, rh, h0.clone().lerp(hp, w).sub(h0));
        rh.quaternion.copy(WQ(rh.parent).invert().multiply(tq)); rh.updateMatrixWorld(true);
      },
      // main gauche pendant le rechargement : va chercher le chargeur neuf au porte-chargeur du gilet (12-45 %), le monte au puits
      // de chargeur sous le fusil (45-60 %), l'y tient (60-86 %, chargeur() l'enfonce), puis rend la main à l'animation (96 %)
      mainChargeur(p) {
        const sm = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
        const w = p < 0.86 ? sm(p / 0.12) : 1 - sm((p - 0.86) / 0.1); if (w < 0.01) return;
        const B = this.bones, sc = group.getWorldScale(V()).x; weapon.updateMatrixWorld(true); group.updateMatrixWorld(true);
        const gq = group.getWorldQuaternion(new THREE.Quaternion()), fw = new THREE.Vector3(0, 0, 1).applyQuaternion(gq), lat = new THREE.Vector3(1, 0, 0).applyQuaternion(gq);
        const poche = WP(B.spine).addScaledVector(fw, 0.17 * sc).addScaledVector(new THREE.Vector3(0, 1, 0), -0.3 * sc).addScaledVector(lat, 0.06 * sc);
        const well = weapon.localToWorld(weapon.magCenter.clone()), down = weapon.localToWorld(new THREE.Vector3(0, -1, 0)).sub(weapon.localToWorld(V())).normalize();
        const T = poche.lerp(well.addScaledVector(down, 0.07 * sc), sm((p - 0.45) / 0.15)), palm = B.lm ? WP(B.lh).lerp(WP(B.lm), 0.6) : WP(B.lh);
        ik(B.la, B.lf, B.lh, T.sub(palm).multiplyScalar(w));
        // orientation de la main : celle de sa prise sous le garde-main (paume vers le haut, comme pour pousser le chargeur), au
        // lieu de celle de l'animation qui tourne brusquement
        if (M.prise && M.prise.L && !S.sansPrise) { const tq = new THREE.Quaternion(); new THREE.Matrix4().multiplyMatrices(weapon.matrixWorld, M.prise.L.Hrel).decompose(V(), tq, V());
          mod(B.lh); B.lh.quaternion.copy(WQ(B.lh.parent).invert().multiply(WQ(B.lh).slerp(tq, w))); B.lh.updateMatrixWorld(true); }
      },
      // arme : poignée dans la main droite, canon vers la main gauche (sinon dans l'axe de la main droite)
      // L'arme est tenue par les PAUMES (entre le poignet et la base des doigts), pas par les poignets : la poignée dans la paume
      // droite, le garde-main dans la paume gauche. L'orientation aligne le segment poignée → garde-main de l'arme (qui n'est
      // pas parallèle au canon : la poignée est sous l'axe) sur le segment paume droite → paume gauche ; le dessus de l'arme
      // reste vers le haut. Une seule main (lancer, victoire) : l'arme suit l'axe de la main droite.
      // mode : 'deux' (prise à deux mains, voir ci-dessus) ; 'droite' / 'gauche' : l'arme reste solidaire de cette main, dans
      // la position relative qu'elle avait à la dernière prise à deux mains (rechargement : la main gauche va au chargeur ;
      // lancer : l'arme pend à la main gauche) ; 'sol' : posée à plat au sol près de la main droite (soldat à terre) puis figée.
      // Prise (voir calculerPrise) : mains amenées à leur place sur le fusil (IK des bras, orientation imposée) si « mains »,
      // doigts posés sur l'arme ; k : poids (fondu)
      tenir(k, mains, seule) {
        const P = M.prise; if (!P || k < 0.01 || S.sansPrise) return;
        const B = this.bones, tp = V(), tq = new THREE.Quaternion(), ts = V(); weapon.updateMatrixWorld(true);
        const ob = this.osDoigts || (this.osDoigts = {}), os = (n) => ob[n] || (ob[n] = body.getObjectByName(n));
        // fusil hors d'atteinte d'une main (bras tendu à plus de 97 %) : il est rapproché de cette épaule d'autant
        // place de la main h (monde) ; garde basse : main d'appui un peu plus en arrière sur le garde-main
        const cibleM = (h, p, q) => { new THREE.Matrix4().multiplyMatrices(weapon.matrixWorld, P[h].Hrel).decompose(p, q, V());
          if (h === 'L' && this.gbK > 0.01) p.add(V().setFromMatrixColumn(weapon.matrixWorld, 2).normalize().multiplyScalar(-GARDE.recul * this.gbK * (1 - (this.epK || 0)))); return p; };
        this.rapproche = 0; if (mains && !seule && B.ra && B.la) for (let it = 0; it < 3; it++) {
          const d = V(); let loin = false;
          for (const [h, arm, fore, hand] of [['R', B.ra, B.rf, B.rh], ['L', B.la, B.lf, B.lh]]) {
            const Sh = WP(arm), L = Sh.distanceTo(WP(fore)) + WP(fore).distanceTo(WP(hand)), T = cibleM(h, V(), new THREE.Quaternion()), e = Sh.distanceTo(T) - 0.97 * L;
            if (e > 0.002) { d.addScaledVector(Sh.sub(T).normalize(), e * k); loin = true; } }
          if (!loin) break;
          // visée : le fusil recule le long de son axe seulement (la ligne de visée reste sur l'œil et la cible)
          if ((this.epK || 0) > 0.01) { const ax = V().setFromMatrixColumn(weapon.matrixWorld, 2).normalize(), da = d.dot(ax); d.lerp(ax.multiplyScalar(da < 0 ? da : 0), this.epK); }
          this.rapproche = (it ? this.rapproche : 0) + d.length();
          const gi = group.matrixWorld.clone().invert(); weapon.position.add(d.clone().transformDirection(gi).multiplyScalar(d.length() / group.getWorldScale(V()).x)); weapon.updateMatrixWorld(true);
        }
        for (const [h, arm, fore, hand] of [['R', B.ra, B.rf, B.rh], ['L', B.la, B.lf, B.lh]]) {
          const D = P[h]; if (!D || !hand || (seule && seule !== h)) continue;
          if (mains && arm && fore) {
            cibleM(h, tp, tq);
            mod(arm); mod(fore); mod(hand);
            const qH = WQ(hand).slerp(tq, k), S0 = WP(arm), E0 = WP(fore), H0 = WP(hand), T = H0.clone().lerp(tp, k);
            const a = S0.distanceTo(E0), b = E0.distanceTo(H0); let c = S0.distanceTo(T); c = Math.min(Math.max(c, Math.abs(a - b) + 1e-4), (a + b) * 0.999);
            const dir = T.clone().sub(S0).normalize(), cosA = Math.max(-1, Math.min(1, (a * a + c * c - b * b) / (2 * a * c))), C = S0.clone().addScaledVector(dir, a * cosA), r = a * Math.sqrt(1 - cosA * cosA);
            // coude : sur le cercle des positions possibles, celle qui aligne l'avant-bras sur la main (poignet peu cassé), sans
            // trop s'écarter de celle de l'animation, coude plutôt bas (pas « en aile de poulet »)
            const u = E0.clone().sub(S0); u.addScaledVector(dir, -u.dot(dir)); if (u.lengthSq() < 1e-8) u.set(0, -1, 0).addScaledVector(dir, -dir.y); u.normalize();
            const w = new THREE.Vector3().crossVectors(dir, u), Aw = os(D.ordre[2]).position.clone().normalize().applyQuaternion(qH), up = new THREE.Vector3(0, 1, 0).applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion()));
            const seuilC = 0.55 - 0.25 * (this.epK || 0);   // (coude au moins à mi-hauteur du bras sous l'épaule en garde basse, un peu plus haut en visée)
            const coude = (ph) => C.clone().addScaledVector(u, r * Math.cos(ph)).addScaledVector(w, r * Math.sin(ph));
            const dedans = new THREE.Vector3(h === 'R' ? 1 : -1, 0, 0).applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion()));   // vers le centre du corps
            const cout = (ph) => { const E = coude(ph), f = T.clone().sub(E).normalize(); return Math.acos(Math.max(-1, Math.min(1, f.dot(Aw)))) + 0.25 * Math.abs(ph) + 3 * Math.max(0, E.clone().sub(S0).dot(up) / a + seuilC) + 3 * Math.max(0, E.clone().sub(S0).dot(dedans) / a - 0.05); };   // (coude jamais rentré dans le buste)
            let ph = 0, cb = cout(0); for (let x = -2.4; x <= 2.4; x += 0.2) { const cx = cout(x); if (cx < cb) { cb = cx; ph = x; } }
            for (const st of [0.08, 0.03, 0.01]) for (const sg of [-1, 1]) { while (cout(ph + sg * st) < cb) { ph += sg * st; cb = cout(ph); } }
            const sw = this.coudePh || (this.coudePh = {}); ph = sw[h] === undefined ? ph : sw[h] + (ph - sw[h]) * Math.min(1, 0.35); sw[h] = ph;
            const E1 = coude(ph * k);
            turn(arm, E0.clone().sub(S0), E1.clone().sub(S0)); const E2 = WP(fore); turn(fore, WP(hand).sub(E2), T.clone().sub(E2));
            // torsion : la moitié de la rotation de la main autour de l'avant-bras est portée par l'avant-bras (poignet moins vrillé)
            { const ax = T.clone().sub(E2).normalize(), qrel = WQ(fore).invert().multiply(qH), qw = WQ(fore).multiply(qrel).multiply(WQ(fore).invert());
              const tw = new THREE.Quaternion(qw.x, qw.y, qw.z, qw.w), pr = ax.x * tw.x + ax.y * tw.y + ax.z * tw.z; tw.set(ax.x * pr, ax.y * pr, ax.z * pr, tw.w).normalize();
              const half = new THREE.Quaternion().slerp(tw, 0.5 * k); fore.quaternion.copy(WQ(fore.parent).invert().multiply(half).multiply(WQ(fore))); fore.updateMatrixWorld(true); }
            hand.quaternion.copy(WQ(hand.parent).invert().multiply(qH)); hand.updateMatrixWorld(true);
          }
          D.doigts.forEach((ch, d) => ch.forEach(([n, q], j) => { const b = os(n); if (!b) return; mod(b);
            const qq = h === 'R' && d === 1 && D.detente && this.detK > 0.01 ? q.clone().slerp(D.detente[j], this.detK) : q;
            b.quaternion.slerp(qq, k); b.updateMatrixWorld(true); }));
        }
      },
      // Fusil placé par construction (repère du groupe) au lieu de suivre les mains de l'animation :
      //  - visée : canon exactement vers la cible (this.regard, à hauteur de poitrine ; sinon droit devant), ligne de visée de
      //    l'optique passant par l'œil droit (joue sur la crosse), crosse à la profondeur du creux de l'épaule ;
      //  - garde basse : crosse dans le creux de l'épaule, canon vers l'avant et le bas (GARDE.pique) un peu vers la gauche.
      // Mélange des deux selon epK / gbK. Les mains sont ensuite amenées sur l'arme (tenir).
      poseArme(loc, inv) {
        const B = this.bones, up = new THREE.Vector3(0, 1, 0), sR = loc(B.ra), sL = loc(B.la);
        const lat = sL.clone().sub(sR).setY(0).normalize(), fwd = new THREE.Vector3().crossVectors(lat, up).normalize();
        const creux = sR.clone().addScaledVector(lat, CREUX.dedans).addScaledVector(fwd, CREUX.avant).addScaledVector(up, -CREUX.bas);
        const gq = group.getWorldQuaternion(new THREE.Quaternion()), hq = gq.clone().invert().multiply(WQ(B.head));
        const oeil = loc(B.head).add(new THREE.Vector3(0, OEIL.haut, OEIL.avant).applyQuaternion(hq)).addScaledVector(lat, -OEIL.cote);
        const repere = (d) => { const u = up.clone().addScaledVector(d, -up.dot(d)).normalize(); return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(u, d), u, d)); };
        const butt = weapon.buttPt, ea = (this.epK || 0) / Math.max(1e-4, (this.epK || 0) + (this.gbK || 0));
        // directions : repère du groupe (+Z = direction de visée du jeu ; en visée le tireur est de profil, ses épaules ne la donnent pas)
        lat.set(1, 0, 0); fwd.set(0, 0, 1);
        // visée
        let d;
        if (this.regard) { const T = new THREE.Vector3(this.regard.x, WP(B.spine).y, this.regard.z).applyMatrix4(inv); d = T.sub(oeil).normalize(); }
        else d = fwd.clone().multiplyScalar(Math.cos(VISEE_TANGAGE)).addScaledVector(up, Math.sin(VISEE_TANGAGE));
        { let ay = Math.atan2(d.dot(lat), d.dot(fwd)), ap = Math.asin(Math.max(-1, Math.min(1, d.y))); ay = Math.max(-0.6, Math.min(0.6, ay)); ap = Math.max(-0.5, Math.min(0.4, ap));
          d = fwd.clone().multiplyScalar(Math.cos(ay) * Math.cos(ap)).addScaledVector(lat, Math.sin(ay) * Math.cos(ap)).addScaledVector(up, Math.sin(ap)); }
        this.visee = d.clone().transformDirection(group.matrixWorld);
        const qA = repere(d), E0 = oeil.clone().sub(new THREE.Vector3().fromArray(VISEE_OPTIQUE).applyQuaternion(qA)), PB = creux.clone().sub(butt.clone().applyQuaternion(qA));
        const pA = E0.addScaledVector(d, PB.clone().sub(E0).dot(d));
        if (ea > 0.999) return { q: qA, p: pA };
        // garde basse
        const pq = GARDE.pique, dg = fwd.clone().multiplyScalar(Math.cos(pq) * Math.cos(GARDE.dedans)).addScaledVector(lat, Math.cos(pq) * Math.sin(GARDE.dedans)).addScaledVector(up, -Math.sin(pq));
        const poche = sR.clone().addScaledVector(sL.clone().sub(sR).setY(0).normalize(), POCHE.dedans).addScaledVector(new THREE.Vector3().crossVectors(sL.clone().sub(sR).setY(0).normalize(), up), POCHE.avant).addScaledVector(up, -POCHE.bas);
        const qL = repere(dg), pL = poche.clone().addScaledVector(up, -GARDE.bas).addScaledVector(fwd, GARDE.avant).sub(butt.clone().applyQuaternion(qL));
        return { q: qL.slerp(qA, ea), p: pL.lerp(pA, ea) };
      },
      // poids de la prise à deux mains (priseK, fondu ~0,15 s) ; renvoie le coefficient de lissage de l'image
      majPrise(tient) {
        const dt = Math.max(0, Math.min(0.1, this.t - (this.tPrise === undefined ? this.t : this.tPrise))), deja = this.tPrise === this.t && this.priseK !== undefined; this.tPrise = this.t;
        const kk = dt > 0 ? Math.min(1, dt * 8) : deja && this.t > 0 ? 0 : 1;   // (deux appels dans la même image : un seul pas de lissage)
        // ressort amorti critique (~0,3 s, départ en douceur : pas d'à-coup des mains au début / à la fin d'un rechargement)
        const c = tient ? 1 : 0; if (this.priseK === undefined || (dt === 0 && kk === 1)) { this.priseK = this.priseK === undefined ? 1 : c; this.priseV = 0; }
        else if (dt > 0) { const w = 14, x = this.priseK, v = this.priseV || 0, a = w * w * (c - x) - 2 * w * v; this.priseV = v + a * dt; this.priseK = Math.max(0, Math.min(1, x + this.priseV * dt)); if (this.priseK === 0 || this.priseK === 1) this.priseV = 0; }
        return kk;
      },
      placeWeapon(twoHands, recoil, mode) {
        const B = this.bones, rh = B.rh, lh = B.lh; if (!rh) return;
        mode = mode || (twoHands ? 'deux' : 'droite');
        group.updateMatrixWorld(true);
        if (mode === 'droite' || mode === 'gauche') {
          const hand = mode === 'gauche' && lh ? lh : rh, L = this.handLocal[mode === 'gauche' && lh ? 'gauche' : 'droite'];
          if (L) {
            // rechargement debout : la main droite porte le fusil dans la « poche de rechargement » (voir poche()), la gauche va
            // au puits de chargeur pendant que chargeur() (app.js) y amène le chargeur neuf
            const ac = mode === 'droite' && RECHARGE[this.clip] && actions[this.clip], p = ac ? (ac.time / ac.getClip().duration) % 1 : -1;
            if (p >= 0 && B.ra && B.rf) this.poche(p, L);
            // sortie de la prise à deux mains en fondu : les mains partent de leur place sur le fusil (placé comme en visée / garde
            // basse) au lieu de sauter à la pose de l'animation
            this.majPrise(false);
            if (this.priseK > 0.01 && M.prise && weapon.isMeshy && B.la && B.head && !S.sansProc) {
              const inv = new THREE.Matrix4().copy(group.matrixWorld).invert(), Pp = this.poseArme((o) => o.getWorldPosition(V()).applyMatrix4(inv), inv);
              weapon.quaternion.copy(Pp.q); weapon.position.copy(Pp.p); weapon.updateMatrixWorld(true); this.tenir(this.priseK, true);
            }
            const mw = new THREE.Matrix4().multiplyMatrices(hand.matrixWorld, L).premultiply(new THREE.Matrix4().copy(group.matrixWorld).invert());
            mw.decompose(weapon.position, weapon.quaternion, V()); weapon.scale.set(1, 1, 1);
            if (p >= 0 && lh && B.la && B.lf && weapon.magCenter) this.mainChargeur(p);
            // la main qui porte le fusil garde ses doigts sur la poignée ; la prise à deux mains se défait (reprise en fondu ensuite)
            if (mode === 'droite') this.tenir(1, false, 'R');
            return; }
          twoHands = false;
        }
        if (mode !== 'deux') this.majPrise(false);
        if (mode === 'bandouliere' && this.slingLocal && B.spine) {   // arme en travers du torse (lancer de grenade), mains libres
          const mw = new THREE.Matrix4().multiplyMatrices(B.spine.matrixWorld, this.slingLocal).premultiply(new THREE.Matrix4().copy(group.matrixWorld).invert());
          mw.decompose(weapon.position, weapon.quaternion, V()); weapon.scale.set(1, 1, 1); return;
        }
        if (mode === 'sol') {
          if (this.auSol) return;
          const p = rh.getWorldPosition(V()).applyMatrix4(new THREE.Matrix4().copy(group.matrixWorld).invert());
          const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(weapon.quaternion); dir.y = 0; if (dir.lengthSq() < 1e-4) dir.set(1, 0, 0); dir.normalize();
          weapon.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir), new THREE.Vector3(0, 1, 0), dir));
          weapon.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2 * (p.x > 0 ? 1 : -1)));   // couché sur le flanc
          weapon.position.set(p.x, 0.04, p.z); this.auSol = true; return;
        }
        this.auSol = false;
        const inv = new THREE.Matrix4().copy(group.matrixWorld).invert(), loc = (o) => o.getWorldPosition(V()).applyMatrix4(inv);
        const palm = (hand, mid) => mid ? loc(hand).lerp(loc(mid), 0.6) : loc(hand);
        const pR = palm(rh, B.rm), pL = lh ? palm(lh, B.lm) : null;
        const qh = rh.getWorldQuaternion(new THREE.Quaternion()).premultiply(group.getWorldQuaternion(new THREE.Quaternion()).invert());
        const grip = weapon.gripPt || V(), fore = weapon.forePt || new THREE.Vector3(0, 0, 0.3);
        let b = pL ? pL.clone().sub(pR) : null; const dist = b ? b.length() : 0;
        const two = twoHands && pL && dist > 0.12 && dist < 0.8;
        // repère de l'arme : a = poignée → garde-main ; repère du monde : b = paume droite → paume gauche (ou axe de la main)
        const a = fore.clone().sub(grip).normalize();
        if (two) b.normalize(); else b = new THREE.Vector3(0, 1, 0).applyQuaternion(qh).normalize();
        const basis = (d, upHint) => { const u = upHint.clone().addScaledVector(d, -upHint.dot(d)); if (u.lengthSq() < 1e-4) u.set(0, 0, 1).addScaledVector(d, -d.z); u.normalize(); const w = new THREE.Vector3().crossVectors(d, u); return new THREE.Matrix4().makeBasis(d, u, w); };
        const Ma = basis(a, new THREE.Vector3(0, 1, 0)), Mb = basis(b, new THREE.Vector3(0, 1, 0));
        const R = Mb.multiply(Ma.transpose());   // rotation qui envoie a sur b (et le haut de l'arme vers le haut)
        weapon.quaternion.setFromRotationMatrix(R);
        let g = grip.clone().applyQuaternion(weapon.quaternion), barrel = new THREE.Vector3(0, 0, 1).applyQuaternion(weapon.quaternion);
        let pos = pR.clone().sub(g);
        // prise (voir calculerPrise) : le fusil est placé pour que le milieu des places des deux paumes soit au milieu des paumes
        // de l'animation (chaque main fait la moitié du chemin jusqu'à sa place, au lieu de tout pour la gauche)
        if (two && M.prise && M.prise.R.paumeLoc && !S.sansPrise) pos = pR.clone().add(pL).multiplyScalar(0.5).sub(M.prise.R.paumeLoc.clone().add(M.prise.L.paumeLoc).multiplyScalar(0.5).applyQuaternion(weapon.quaternion));
        // placement du fusil construit (voir poseArme) : visée et garde basse ; ses poids sont ceux des poses épaulées / basses
        const procW = twoHands && mode === 'deux' && pL && M.prise && weapon.isMeshy && weapon.buttPt && B.ra && B.la && B.head && !S.sansProc ? Math.max(this.epK || 0, this.gbK || 0) : 0;
        const tient = two || procW > 0.5;
        // crosse dans le creux de l'épaule (voir EPAULE) : on glisse le fusil, puis les bras suivent
        const k = two && weapon.buttPt && B.ra && B.la ? (this.epK || 0) * (1 - procW) : 0;
        if (k > 0.01) {
          // fusil à niveau d'abord : les animations le tiennent de 6 à 17° vers le bas (il visait alors le sol) ; on le relève
          // autour de la crosse vers VISEE_TANGAGE, les deux mains suivent (IK des bras, mains tournées d'autant)
          const dp = Math.max(-0.7, Math.min(0.7, (VISEE_TANGAGE - Math.asin(Math.max(-1, Math.min(1, barrel.y)))) * k));
          if (Math.abs(dp) > 0.005 && lh) {
            const axe = new THREE.Vector3().crossVectors(barrel, new THREE.Vector3(0, 1, 0)); if (axe.lengthSq() > 1e-6) {
              axe.normalize(); const qc = new THREE.Quaternion().setFromAxisAngle(axe, dp), buttL = weapon.buttPt.clone().applyQuaternion(weapon.quaternion);
              const butt0 = pos.clone().add(buttL), q1 = qc.clone().multiply(weapon.quaternion), pos1 = butt0.clone().sub(buttL.clone().applyQuaternion(qc));
              const pt = (p, q, l) => p.clone().add(l.clone().applyQuaternion(q)), sc = group.getWorldScale(V()).x, gw = group.matrixWorld;
              const toW = (v) => v.lengthSq() > 1e-12 ? v.clone().transformDirection(gw).multiplyScalar(v.length() * sc) : v.clone();
              const dG = pt(pos1, q1, grip).sub(pt(pos, weapon.quaternion, grip)), dF = pt(pos1, q1, fore).sub(pt(pos, weapon.quaternion, fore));
              const gq = group.getWorldQuaternion(new THREE.Quaternion()), qcW = gq.clone().multiply(qc).multiply(gq.clone().invert());
              for (const [arm, fa, hand, d] of [[B.ra, B.rf, rh, dG], [B.la, B.lf, lh, dF]]) {
                ik(arm, fa, hand, toW(d)); hand.quaternion.copy(WQ(hand.parent).invert().multiply(qcW).multiply(WQ(hand))); hand.updateMatrixWorld(true);
              }
              weapon.quaternion.copy(q1); pos = pos1; g = grip.clone().applyQuaternion(q1); barrel = new THREE.Vector3(0, 0, 1).applyQuaternion(q1);
            }
          }
          const sR = loc(B.ra), sL = loc(B.la), up = new THREE.Vector3(0, 1, 0);
          const lat = sL.clone().sub(sR).setY(0).normalize(), fwd = new THREE.Vector3().crossVectors(lat, up).normalize();
          const creux = sR.clone().addScaledVector(lat, CREUX.dedans).addScaledVector(fwd, CREUX.avant).addScaledVector(up, -CREUX.bas);
          const butt = pos.clone().add(weapon.buttPt.clone().applyQuaternion(weapon.quaternion));
          const dl = creux.sub(butt).multiplyScalar(k);
          if (dl.lengthSq() > 1e-8) {
            const gw = group.matrixWorld, dW = dl.clone().transformDirection(gw).multiplyScalar(dl.length() * group.getWorldScale(V()).x);
            ik(B.ra, B.rf, rh, dW); if (lh) ik(B.la, B.lf, lh, dW);
            pos.add(dl);   // les bras ont suivi (à la précision de l'IK près ; les mains sont ensuite remises à leur place, voir tenir)
          }
        }
        // reprise à deux mains (fin de rechargement…) : le fusil part de là où la main droite le portait et rejoint sa place en fondu
        const pk = this.priseK === undefined ? 1 : this.priseK;
        // (sans prise à deux mains dans l'animation : le fusil reste dans la main droite comme à la dernière prise)
        if ((!two || pk < 0.999) && this.handLocal.droite && M.prise && !S.sansPrise) { const qS = new THREE.Quaternion(), pS = V(); new THREE.Matrix4().multiplyMatrices(rh.matrixWorld, this.handLocal.droite).premultiply(inv).decompose(pS, qS, V());
          const k2 = two ? pk : 0; weapon.quaternion.copy(qS.slerp(weapon.quaternion, k2)); pos.copy(pS.lerp(pos, k2)); }
        if (procW > 0.01) { const Pp = this.poseArme(loc, inv);
          // position lissée (ressort ~0,1 s, repère du groupe) : le fusil n'encaisse pas tout le rebond des pas (les bras l'absorbent)
          if (this.tPose !== undefined && this.t > this.tPose && this.pArme && !S.sansLisse) { const dtp = Math.min(0.1, this.t - this.tPose), w0 = 11, e = Pp.p.clone().sub(this.pArme), a = e.multiplyScalar(w0 * w0).addScaledVector(this.vArme, -2 * w0);
            this.vArme.addScaledVector(a, dtp); this.pArme.addScaledVector(this.vArme, dtp); if (this.pArme.distanceTo(Pp.p) > 0.08) { this.pArme.copy(Pp.p); this.vArme.set(0, 0, 0); } Pp.p.copy(this.pArme); }
          else if (this.tPose !== this.t || !this.pArme) { this.pArme = Pp.p.clone(); this.vArme = V(); }
          this.tPose = this.t;
          const w = procW * (M.prise && !S.sansPrise ? pk : 1); weapon.quaternion.slerp(Pp.q, w); pos.lerp(Pp.p, w); }
        barrel.set(0, 0, 1).applyQuaternion(weapon.quaternion);
        weapon.position.copy(pos).addScaledVector(barrel, -(recoil || 0) * 0.04);
        // mains à leur place sur le fusil, doigts refermés dessus (voir calculerPrise) ; index sur la détente en tir
        { const kk = this.majPrise(tient);
          this.detK = (this.detK || 0) + (((recoil || 0) > 0.02 || ((this.epK || 0) > 0.6 && this.regard) ? 1 : 0) - (this.detK || 0)) * kk;
          if (tient) this.tenir(this.priseK, true); }
        if (tient) {   // mémoire de la prise pour les modes à une main
          weapon.updateMatrixWorld(true);
          this.handLocal.droite = new THREE.Matrix4().copy(rh.matrixWorld).invert().multiply(weapon.matrixWorld);
          if (lh) this.handLocal.gauche = new THREE.Matrix4().copy(lh.matrixWorld).invert().multiply(weapon.matrixWorld);
        }
      },
    };
    // prise de l'arme (une fois par modèle), mesurée sur la visée
    if (M.prise === undefined && M.clips.Rifle_Aim_Turn_Right && weapon.isMeshy) {
      M.prise = null;
      try { f.play('Rifle_Aim_Turn_Right', { time: 0, fade: 0 }); f.update(0); body.updateMatrixWorld(true); f.placeWeapon(true, 0, 'deux'); M.prise = calculerPrise(f, M); } catch (e) { console.warn('soldat 3D (prise) :', e); }
      if (actions.Rifle_Aim_Turn_Right) actions.Rifle_Aim_Turn_Right.stop(); f.clip = null; f.epK = 0;
    }
    // position « en bandoulière » = celle de la garde basse, mémorisée par rapport au torse (Spine2)
    if (M.clips.Garde_Basse && f.bones.spine) {
      f.play('Garde_Basse', { time: 0 }); f.update(0); body.updateMatrixWorld(true); f.placeWeapon(true, 0, 'deux'); weapon.updateMatrixWorld(true);
      if (cou && f.bones.head) { neutre = [cou.quaternion.clone(), f.bones.head.quaternion.clone()]; faceL = new THREE.Vector3(0, 0, 1); }   // (axe +Z local de la tête = le visage ; la tête de la garde basse regarde ~20° vers le bas)
      f.slingLocal = new THREE.Matrix4().copy(f.bones.spine.matrixWorld).invert().multiply(weapon.matrixWorld);
      actions.Garde_Basse.stop(); f.clip = null; f.epK = 0;   // la première animation réelle démarre sans fondu depuis celle-ci
    }
    return f;
  }
  // instantané d'un soldat pour les portraits : anime une copie à un instant d'une animation donnée
  function posed(o, clip, t) {
    const f = create(o); if (!f) return null;
    f.play(clip || 'Walk_Fight_Forward', { time: t !== undefined ? t : 0.15 }); f.update(0); f.body.rotation.y = f.yawFix[f.clip] || 0; f.body.updateMatrixWorld(true);
    f.placeWeapon(true, 0); return f;
  }
  S.load = load; S.create = create; S.posed = posed; S.whenReady = (fn) => { if (S.ready) fn(); else S.onReady.push(fn); };
  root.Soldat3D = S;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else setTimeout(load, 0);
})(window.OT = window.OT || {});
