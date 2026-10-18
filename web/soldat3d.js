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
  const RELEVE = { cote: 0.8, arriere: 0.8 };
  // marche directionnelle en visant : part de l'écart fusil / bassin rattrapée par la torsion du dos (le reste tourne le corps)
  const DOS_VISEE = 0.65;
  const ONCE = { Shot_and_Fall_Forward: 1, Shot_in_the_Back_and_Fall: 1, Over_Shoulder_Throw: 1 };
  // Fusil épaulé : dans ces animations la crosse doit reposer dans le creux de l'épaule droite. Les animations Mixamo ne l'y
  // mettent pas exactement (le fusil du jeu n'est pas celui de l'animation) : à chaque image, le fusil garde son orientation
  // mais est glissé pour que sa crosse touche le creux de l'épaule, puis les deux bras sont recalés par IK (épaule → coude →
  // poignet, coude dans son plan d'origine, mains gardant leur orientation) pour que les paumes restent sur la poignée et
  // le garde-main. CREUX : position du creux par rapport à l'articulation de l'épaule droite (m) : vers le centre du
  // corps, vers l'avant, vers le bas.
  const EPAULE = { Rifle_Aim_Turn_Right: 1, Walk_Aim: 1, Walk_Aim_Haut: 1, Run_and_Shoot: 1, Run_and_Shoot_Haut: 1, Gunshot_Reaction: 1 };
  const CREUX = { dedans: 0.06, avant: 0.08, bas: 0.03 };
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
        for (const n in S.modeles) { const M = S.modeles[n]; try { gardeBasse(M); compositeBas(M); directions(M); mesureLoco(M); } catch (e) { console.warn('soldat 3D (garde basse) :', e); } }
        S.ready = true; for (const f of S.onReady.splice(0)) try { f(); } catch (e) { console.warn(e); } texturesHD(); };
      if (root.Modeles3D) root.Modeles3D.whenReady(go); else go();
    };
    // version haute définition du personnage (hd/<nom>_hd.glb ou .json : maillage complet ~100 000 triangles, mêmes os et
    // animations) si elle est publiée à côté de la page ; sinon la version incluse (~27 000 triangles)
    const HDok = /^https?:/.test(location.protocol) && !/[?&]hd=0/.test(location.search);
    const source = (nom) => {
      if (!HDok) return Promise.resolve(b64ToBuf(MOD[nom]));
      const glb = () => fetch('hd/' + nom + '_hd.glb').then(r => r.ok && !/text\/html/.test(r.headers.get('content-type') || '') ? r.arrayBuffer() : null).catch(() => null);
      const json = () => fetch('hd/' + nom + '_hd.json').then(r => r.ok ? r.json() : null).then(j => j && j.glb ? b64ToBuf(j.glb) : null).catch(() => null);
      const t = new Promise(r => setTimeout(() => r(null), 25000));
      return Promise.race([glb().then(b => b && b.byteLength > 1000 ? b : json()), t]).then(b => { if (b && b.byteLength > 1000) { S.hdMaillage = (S.hdMaillage || 0) + 1; return b; } return b64ToBuf(MOD[nom]); });
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
          S.modeles[nom] = M; delete MOD[nom]; finish();
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
    for (const [nom, src, alt, ampli] of [['Walk_Low', 'Walking', 'Walk_Fight_Forward', 1], ['Run_Low', 'Run_and_Shoot', 'Running', 2.2]]) {
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
  function directions(M) {
    const G = M.clips.Walk_Left_with_Gun, B = M.clips.Walk_Backward_with_Gun; if (!G || !B) return;
    const legs = (c, nom) => c && new THREE.AnimationClip(nom, c.duration, c.tracks.filter(t => JAMBES.test(t.name)).map(t => t.clone()));
    M.clips.Pas_Gauche = legs(G, 'Pas_Gauche'); M.clips.Pas_Arriere = legs(B, 'Pas_Arriere');
    // bassin remonté vers celui de la marche avant (sans dépasser ce que les jambes permettent : genoux jamais tendus à fond)
    { const sc = M.gltf.scene, hb = sc.getObjectByName('mixamorigHips') || sc.getObjectByName('mixamorig:Hips'), ref = M.clips.Walk_Fight_Forward;
      if (hb && ref) { const mx = new THREE.AnimationMixer(sc); mx.clipAction(ref).play(); let s = 0; for (let i = 0; i < 20; i++) { mx.setTime(i / 20 * ref.duration); sc.updateMatrixWorld(true); s += hb.getWorldPosition(new THREE.Vector3()).y; } mx.stopAllAction(); mx.uncacheRoot(sc);
        M.releveErr = {}; for (const [n, part] of [['Pas_Gauche', RELEVE.cote], ['Pas_Arriere', RELEVE.arriere]]) M.releveErr[n] = releve(M, M.clips[n], s / 20, part); } }
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
    for (const n of ['Walk_Aim', 'Walk_Low', 'Run_and_Shoot', 'Run_Low']) { const c = M.clips[n]; if (c) { M.clips[n + '_Haut'] = new THREE.AnimationClip(n + '_Haut', c.duration, c.tracks.filter(t => !JAMBES.test(t.name)).map(t => t.clone())); } }
    if (M.yawFix.Walk_Aim !== undefined) M.yawFix.Walk_Aim_Haut = M.yawFix.Walk_Aim;
    M.dirs = true;
  }
  // Vitesse « naturelle » de chaque cycle de locomotion (m/s, pour un soldat de 1,80 m) : pendant l'appui, le pied recule
  // par rapport au bassin à la vitesse du sol. Le jeu lit l'animation à (vitesse réelle / vitesse naturelle) : plus de pieds
  // qui glissent. Mesurée sur les pieds, car les animations Meshy n'ont pas de déplacement de racine fiable.
  const LOCOS = ['Walk_Fight_Forward', 'Walk_Aim', 'Walk_Low', 'Run_and_Shoot', 'Run_Low', 'Cautious_Crouch_Walk_Forward', 'Walking', 'Running', 'Pas_Avant_Aim', 'Pas_Avant_Low', 'Pas_Avant_Course', 'Pas_Gauche', 'Pas_Droite', 'Pas_Arriere'];
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
      feet.forEach((ft, j) => { const ymin = Math.min(...P[j].map(p => p.y)); for (let i = 0; i < N; i++) { if (P[j][i].y > ymin + 0.03) continue; const i2 = (i + 1) % N; const v = P[j][i2].clone().sub(H[i2]).sub(P[j][i].clone().sub(H[i])).divideScalar(dur / N); v.y = 0; sv += v.length(); n++; dx -= v.x; dz -= v.z; } });
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
    for (const av of ['Pas_Avant_Aim', 'Pas_Avant_Low', 'Pas_Avant_Course']) for (const cote of ['Pas_Gauche', 'Pas_Droite']) {
      const A = M.clips[av], C = M.clips[cote]; if (!A || !C) continue;
      const mx = new THREE.AnimationMixer(sc), a = mx.clipAction(A), c = mx.clipAction(C); a.play(); c.play(); a.setEffectiveWeight(0.5); c.setEffectiveWeight(0.5); a.timeScale = 0; c.timeScale = 0;
      const K = 20, NS = 24, mag = [], h = new THREE.Vector3(), p = new THREE.Vector3();
      for (let o = 0; o < K; o++) {
        const P = [[], []];
        for (let i = 0; i < NS; i++) { a.time = ((i / NS + M.phase0[av]) % 1) * A.duration; c.time = ((i / NS + M.phase0[cote] + o / K) % 1) * C.duration; mx.update(0); sc.updateMatrixWorld(true); hips.getWorldPosition(h); feet.forEach((f, j) => { f.getWorldPosition(p); P[j].push([p.x - h.x, p.y, p.z - h.z]); }); }
        let sx = 0, sz = 0; P.forEach(pp => { const ym = Math.min(...pp.map(q => q[1])); for (let i = 0; i < NS; i++) { const q = pp[(i + 1) % NS]; if (pp[i][1] > ym + 0.03) continue; sx -= q[0] - pp[i][0]; sz -= q[2] - pp[i][2]; } });
        mag.push(Math.hypot(sx, sz));
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
  const GB = { paume: [-0.02, 1.17, 0.25], canon: [0.7, -0.62, 0.17], coudeD: [-1, -0.7, -0.25], coudeG: [1, -0.8, -0.1] };
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
    const L = new THREE.TextureLoader();
    for (const nom of NOMS) {
      const M = S.modeles[nom]; if (!M) continue;
      const mats = () => { const out = []; M.gltf.scene.traverse(o => { if (o.isMesh && o.material) out.push(o.material); }); for (const k in matCache) if (k.startsWith(nom)) out.push(matCache[k]); return out; };
      const swap = (slots, file, srgb) => L.load('hd/' + nom + '_' + file + '.jpg', (t) => {
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
  function cloneSkinned(src) {
    const c = src.clone(true), bones = {}; c.traverse(o => { if (o.isBone) bones[o.name] = o; });
    c.traverse(o => { if (o.isSkinnedMesh) { const sk = o.skeleton; o.bind(new THREE.Skeleton(sk.bones.map(b => bones[b.name]), sk.boneInverses), o.bindMatrix); } });
    return c;
  }
  const V = () => new THREE.Vector3();
  // un soldat : group (posé par le jeu), pose (chute), weapon (avec .muzzle), anim
  // o.modele : 'gign' (équipe du joueur) ou 'soldat' (adversaire) ; par défaut le premier modèle chargé
  function create(o) {
    if (!S.ready) return null;
    const M = S.modeles[o.modele] || S.modeles[S.defaut];
    const group = new THREE.Group(), pose = new THREE.Group(); group.add(pose);
    const body = cloneSkinned(M.gltf.scene); body.scale.setScalar(HEIGHT / RAW_H); pose.add(body);
    let skinned = null; body.traverse(n => { if (n.isSkinnedMesh) { skinned = n; n.material = tintedMaterial(n.material, TEINTE[M.nom] ? o.uniform : null, M.nom); } });
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
    // tourne un os autour de la verticale (le sol est plat : la verticale du monde est celle du groupe), en gardant ses enfants
    const UP = new THREE.Vector3(0, 1, 0), qT = new THREE.Quaternion(), qP = new THREE.Quaternion();
    const twist = (bone, ang) => { bone.parent.getWorldQuaternion(qP); qT.setFromAxisAngle(UP, ang); bone.quaternion.premultiply(qP.clone().invert().multiply(qT).multiply(qP)); bone.updateMatrixWorld(true); };
    const spine3 = [bone('Spine'), bone('Spine1'), bone('Spine2')].filter(Boolean), hipsB = bone('Hips'), spine1 = bone('Spine1');
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
      marche(ecart, v, dt, haut, avant) {
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
          if (Math.abs(e) <= Math.abs(tc)) {
            // secteur avant : mélange marche avant / pas chassé, poids tels que la somme des foulées (vecteurs) pointe vers e
            // (ces deux démarches se mélangent bien une fois calées en phase, voir M.decal)
            const wa = Math.abs(Math.sin(tc - e)) / foul(avant), wc = Math.abs(Math.sin(e - ta)) / foul(cote), s = wa + wc || 1;
            cible[avant] = wa / s; cible[cote] = wc / s; this.selArr = false;
          } else {
            // secteur arrière : pas chassé et marche arrière se mélangent mal (pas qui s'annulent) ; on joue l'un OU l'autre,
            // bassin tourné (tau) vers la direction exacte, en gardant celui qui tord le moins le dos (avec hystérésis ;
            // le changement se fait en fondu par le lissage des poids)
            const tw = (n) => wrap(e - D[n]), cout = (n) => Math.abs(wrap((M.hipsYaw[n] || 0) - (M.hipsYaw[avant] || 0) + tw(n)));
            if (this.selArr ? cout(cote) < cout(PR) - 0.2 : cout(PR) < cout(cote) - 0.2) this.selArr = !this.selArr;
            const n = this.selArr ? PR : cote; cible[n] = 1; tau = Math.max(-1.3, Math.min(1.3, tw(n)));
          }
        } else cible[avant] = 1;
        // (torsion du bassin au prorata de la couche des jambes : à l'entrée en marche elle monte avec elle)
        this.jambesCible = tau * Math.min(1, (this.marcheK || 0) + dt / 0.2);
        if (!this.blendW) this.blendW = {};
        const bw = this.blendW;
        for (const n in bw) if (!(n in cible)) cible[n] = 0;
        let tot = 0; for (const n in cible) { bw[n] = (bw[n] || 0) + (cible[n] - (bw[n] || 0)) * Math.min(1, dt * 8); if (bw[n] < 0.004 && cible[n] === 0) bw[n] = 0; tot += bw[n]; }
        // foulée du mélange : somme VECTORIELLE (en diagonale, avant + côté avancent moins que la somme des longueurs) ;
        // c'est elle qui cale la cadence sur la vitesse réelle (pas de pieds qui glissent)
        // (mesuré : la vraie foulée d'un mélange est entre la somme vectorielle et la somme des longueurs ; on prend la moyenne)
        let fx = 0, fz = 0, fl = 0; for (const n in bw) if (bw[n] > 0) { const L = bw[n] / tot * foul(n), t = D[n] || 0; fx += L * Math.sin(t); fz += L * Math.cos(t); fl += L; }
        this.ph = ((this.ph || 0) + dt * v / Math.max(0.25, (Math.hypot(fx, fz) + fl) / 2)) % 1;
        // entrée en marche : la couche des jambes monte en ~0,2 s (l'animation précédente s'efface pendant ce temps)
        this.marcheK = Math.min(1, (this.marcheK || 0) + dt / 0.2);
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
        this.play(haut, { time: ((this.ph + (M.phase0[avant] || 0)) % 1), fade: 0.25 });
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
        if (this.blendW && !enMarche && !keepYaw && pieds[0][2] && pieds[1][2]) this.pose0 = { t: 0, lock: pieds.map(l => new THREE.Vector3().setFromMatrixPosition(l[2].matrixWorld)), lockQ: pieds.map(l => { const q = new THREE.Quaternion(); l[2].matrixWorld.decompose(V(), q, V()); return q; }) };
        for (const [b, q, p] of mods) { b.quaternion.copy(q); b.position.copy(p); } mods.length = 0;
        if (this.blendW && !enMarche) {   // plus en marche directionnelle : les jambes mélangées s'effacent
          for (const n in this.blendW) { const a = actions[n]; if (a && a.isScheduled() && this.blendW[n] > 0) a.fadeOut(0.3); }
          this.blendW = null; this.dosM = (this.dosM || 0) + (this.yawM || 0);   // (torsion figée, qui s'efface avec marcheK)
        }
        if (!enMarche) this.marcheK = Math.max(0, (this.marcheK || 0) - dt / 0.3);
        frameK++;
        mixer.update(dt); this.t += dt;
        this.epK = (this.epK || 0) + ((EPAULE[this.clip] ? 1 : 0) - (this.epK || 0)) * (dt > 0 ? Math.min(1, dt * 8) : 1);
        if (!keepYaw) { const tgt = enMarche ? this.yawM : (M.yawFix[this.clip] || 0); let d = tgt - body.rotation.y; body.rotation.y += d * Math.min(1, dt * 5); }   // (lent : les corrections diffèrent d'une pose à l'autre)
        // torsion du dos en marche directionnelle : bassin des pas chassés / arrière (psi) + visée (le corps n'est tourné que
        // de yawM, le dos fait le reste, calculé sur l'orientation ACTUELLE du corps pour que le fusil reste sur la cible
        // pendant que le corps pivote) ; pondérée par marcheK (entrée / sortie en fondu, comme les animations)
        this.dosComp = (this.marcheK || 0) > 0 ? this.marcheK * ((this.dosM || 0) + (enMarche ? body.rotation.y : 0)) : 0;
        let dj = this.jambesCible - this.jambes; while (dj > Math.PI) dj -= 2 * Math.PI; while (dj < -Math.PI) dj += 2 * Math.PI;
        // (sortie de marche directionnelle : la torsion du bassin se défait au rythme du fondu des jambes, pas d'un coup)
        const kj = !enMarche && (this.marcheK || 0) > 0 ? dt * 6 : dt * 14;
        this.jambes += Math.max(-9 * dt, Math.min(9 * dt, dj * Math.min(1, kj)));
        if (Math.abs(this.jambes) > 0.01 && hipsB && spine3.length) {
          body.updateMatrixWorld(true); mod(hipsB); twist(hipsB, this.jambes);
          for (const sb of spine3) { mod(sb); twist(sb, -this.jambes / spine3.length); }
        }
        // le bassin des pas chassés / de la marche arrière n'est pas orienté comme celui de la marche avant : le dos rattrape
        if (this.dosComp && Math.abs(this.dosComp) > 0.01 && spine3.length) { body.updateMatrixWorld(true); for (const sb of spine3) { mod(sb); twist(sb, -this.dosComp / spine3.length); } }
        // respiration (poses fixes : garde basse, visée) : légère flexion du dos
        if (spine1 && (this.clip === 'Garde_Basse' || this.clip === 'Rifle_Aim_Turn_Right')) { mod(spine1); spine1.rotation.x += Math.sin(this.t * 1.9) * 0.012; spine1.rotation.z += Math.sin(this.t * 0.7) * 0.006; }
        if (enMarche && (this.marcheK || 0) > 0.05) this.ecarte(this.marcheK, this.coteK || 0, this.arrK || 0);
        const repos = (this.clip === 'Garde_Basse' || this.clip === 'Rifle_Aim_Turn_Right') && !enMarche && !keepYaw;
        if (this.pose0) this.poserPieds(dt, repos);
        this.appui(dt, repos && !this.pose0);
        this.tete(dt, keepYaw ? null : repos || enMarche);
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
          const L = P.lock[i], C = cur[i], h = Math.min(0.07, 0.35 * Math.hypot(C.x - L.x, C.z - L.z));
          const T = L.clone().lerp(C, s); T.y += h * Math.sin(Math.PI * s);
          const ft = pieds[i][2], qC = WQ(ft), d = T.sub(C); if (d.lengthSq() > 1e-8) ik(pieds[i][0], pieds[i][1], ft, d);
          // orientation du pied aussi (sinon la pointe pivote autour de la cheville cloué et glisse)
          mod(ft); ft.quaternion.copy(WQ(ft.parent).invert().multiply(P.lockQ[i].clone().slerp(qC, s))); ft.updateMatrixWorld(true);
        });
      },
      // Pieds jamais croisés (pas chassés et marche arrière « au pistolet » de la bibliothèque : pas très serrés, bottes l'une sur
      // l'autre, genoux qui se touchent) : écart minimal des chevilles le long de la ligne du bassin (les deux pieds poussés
      // chacun de la moitié, IK, orientation gardée), puis genoux tournés un peu vers l'extérieur autour de l'axe
      // hanche → cheville (la cheville ne bouge pas), au prorata de la part des pas de côté / arrière (k).
      ecarte(K, k, kr) {
        if (!pieds[0][2] || !pieds[1][2]) return;
        group.updateMatrixWorld(true);
        const lat = WP(pieds[0][0]).sub(WP(pieds[1][0])); lat.y = 0; if (lat.lengthSq() < 1e-6) return; lat.normalize();   // vers la gauche du bassin
        const MIN = (0.1 + 0.07 * k + 0.04 * kr) * K, sep = WP(pieds[0][2]).sub(WP(pieds[1][2])).dot(lat);
        if (sep < MIN) {   // (surtout le pied levé : celui au sol glisserait)
          const d = Math.min(0.3, MIN - sep), yL = WP(pieds[0][2]).y, yR = WP(pieds[1][2]).y, pl = Math.max(0.1, Math.min(0.9, 0.5 + (yL - yR) * 10));
          ik(pieds[0][0], pieds[0][1], pieds[0][2], lat.clone().multiplyScalar(d * pl)); ik(pieds[1][0], pieds[1][1], pieds[1][2], lat.clone().multiplyScalar(-d * (1 - pl))); }
        const kg = Math.min(1, k + 0.5 * kr); if (kg * K < 0.05) return;   // (genoux : pas chassés, et un peu la marche arrière)
        pieds.forEach(([up, lo, ft], i) => {
          const S0 = WP(up), K0 = WP(lo), H0 = WP(ft), ax = H0.clone().sub(S0); if (ax.lengthSq() < 1e-6) return; ax.normalize();
          const kp = K0.clone().sub(S0); kp.addScaledVector(ax, -kp.dot(ax)); if (kp.lengthSq() < 1e-8) return; kp.normalize();
          const out = lat.clone().multiplyScalar(i ? -1 : 1); out.addScaledVector(ax, -out.dot(ax)); if (out.lengthSq() < 1e-6) return; out.normalize();
          // angle (signé, autour de ax) du genou vers l'extérieur ; on en fait une part, limitée à 25°
          let a = Math.atan2(new THREE.Vector3().crossVectors(kp, out).dot(ax), kp.dot(out)); a = Math.max(-0.44, Math.min(0.44, a * 0.45 * kg * K));
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
        const h0 = WP(hipsB), h1 = h0.clone().addScaledVector(lat, s * 0.022); h1.y -= 0.008 * Math.abs(s);
        hipsB.position.add(hipsB.parent.worldToLocal(h1).sub(hipsB.parent.worldToLocal(h0.clone()))); hipsB.updateMatrixWorld(true);
        const roule = (b, a) => { b.parent.getWorldQuaternion(qP); qT.setFromAxisAngle(fw, a); b.quaternion.premultiply(qP.clone().invert().multiply(qT).multiply(qP)); b.updateMatrixWorld(true); };
        roule(hipsB, -s * 0.035); if (spine1) { mod(spine1); roule(spine1, s * 0.03); }
        pieds.forEach((l, i) => { const d = avant[i].clone().sub(WP(l[2])); if (d.lengthSq() > 1e-8) ik(l[0], l[1], l[2], d); });
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
          else if (this.clip === 'Garde_Basse' || this.clip === 'Rifle_Aim_Turn_Right') {
            this.coupT = (this.coupT || 0) - dt;
            if (this.coupT <= 0) { this.nCoup = (this.nCoup || 0) + 1; const r = Math.abs(Math.sin(this.nCoup * 12.9898 + graine * 78.233) * 43758.5453) % 1;
              this.coup = this.nCoup % 2 ? (r - 0.5) * 1.3 * vise : 0; this.coupT = 2.2 + 3 * r; }
            want = Math.max(-0.65 * vise, Math.min(0.65 * vise, this.coup || 0));   // (coup d'œil tiré en garde basse, puis visée)
          }
        }
        this.teteA = (this.teteA || 0) + (want - (this.teteA || 0)) * Math.min(1, dt * 3.5);
        const H = this.bones.head, kA = actif && neutre ? (this.epK || 0) : 0;
        if (kA > 0.01) {
          // En visée, les animations collent la joue sur la crosse (tête roulée vers la droite et penchée sur le fusil) ; notre
          // fusil est plus bas : tête et cou ramenés vers leur pose droite (celle de la garde basse), puis la face tournée vers
          // la direction de visée (+ coup d'œil / cible), un peu vers le bas : 40 % par le cou, le reste par la tête.
          mod(cou); mod(H); cou.quaternion.slerp(neutre[0], 0.75 * kA); H.quaternion.slerp(neutre[1], 0.75 * kA); cou.updateMatrixWorld(true);
          const fq = new THREE.Vector3(0, 0, 1).applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion())), y = Math.atan2(fq.x, fq.z) + this.teteA, p = -0.08;
          const cible = new THREE.Vector3(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p));
          const tourne = (b, part) => { const face = faceL.clone().applyQuaternion(WQ(H)).normalize(), q = new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(face, cible), part * kA);
            b.quaternion.copy(WQ(b.parent).invert().multiply(q).multiply(WQ(b))); b.updateMatrixWorld(true); };
          tourne(cou, 0.4); tourne(H, 1);
          return;
        }
        if (Math.abs(this.teteA) < 0.005) return;
        mod(cou); twist(cou, this.teteA * 0.4); mod(H); twist(H, this.teteA * 0.6);
      },
      // arme : poignée dans la main droite, canon vers la main gauche (sinon dans l'axe de la main droite)
      // L'arme est tenue par les PAUMES (entre le poignet et la base des doigts), pas par les poignets : la poignée dans la paume
      // droite, le garde-main dans la paume gauche. L'orientation aligne le segment poignée → garde-main de l'arme (qui n'est
      // pas parallèle au canon : la poignée est sous l'axe) sur le segment paume droite → paume gauche ; le dessus de l'arme
      // reste vers le haut. Une seule main (lancer, victoire) : l'arme suit l'axe de la main droite.
      // mode : 'deux' (prise à deux mains, voir ci-dessus) ; 'droite' / 'gauche' : l'arme reste solidaire de cette main, dans
      // la position relative qu'elle avait à la dernière prise à deux mains (rechargement : la main gauche va au chargeur ;
      // lancer : l'arme pend à la main gauche) ; 'sol' : posée à plat au sol près de la main droite (soldat à terre) puis figée.
      placeWeapon(twoHands, recoil, mode) {
        const B = this.bones, rh = B.rh, lh = B.lh; if (!rh) return;
        mode = mode || (twoHands ? 'deux' : 'droite');
        group.updateMatrixWorld(true);
        if (mode === 'droite' || mode === 'gauche') {
          const hand = mode === 'gauche' && lh ? lh : rh, L = this.handLocal[mode === 'gauche' && lh ? 'gauche' : 'droite'];
          if (L) { const mw = new THREE.Matrix4().multiplyMatrices(hand.matrixWorld, L).premultiply(new THREE.Matrix4().copy(group.matrixWorld).invert());
            mw.decompose(weapon.position, weapon.quaternion, V()); weapon.scale.set(1, 1, 1); return; }
          twoHands = false;
        }
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
        const g = grip.clone().applyQuaternion(weapon.quaternion), barrel = new THREE.Vector3(0, 0, 1).applyQuaternion(weapon.quaternion);
        let pos = pR.clone().sub(g);
        // crosse dans le creux de l'épaule (voir EPAULE) : on glisse le fusil, puis les bras suivent
        const k = two && weapon.buttPt && B.ra && B.la ? (this.epK || 0) : 0;
        if (k > 0.01) {
          const sR = loc(B.ra), sL = loc(B.la), up = new THREE.Vector3(0, 1, 0);
          const lat = sL.clone().sub(sR).setY(0).normalize(), fwd = new THREE.Vector3().crossVectors(lat, up).normalize();
          const creux = sR.clone().addScaledVector(lat, CREUX.dedans).addScaledVector(fwd, CREUX.avant).addScaledVector(up, -CREUX.bas);
          const butt = pos.clone().add(weapon.buttPt.clone().applyQuaternion(weapon.quaternion));
          const dl = creux.sub(butt).multiplyScalar(k);
          if (dl.lengthSq() > 1e-8) {
            const gw = group.matrixWorld, dW = dl.clone().transformDirection(gw).multiplyScalar(dl.length() * group.getWorldScale(V()).x);
            ik(B.ra, B.rf, rh, dW); if (lh) ik(B.la, B.lf, lh, dW);
            pos = palm(rh, B.rm).sub(g);   // la paume droite a suivi (à la précision de l'IK près)
          }
        }
        weapon.position.copy(pos).addScaledVector(barrel, -(recoil || 0) * 0.04);
        if (two) {   // mémoire de la prise pour les modes à une main
          weapon.updateMatrixWorld(true);
          this.handLocal.droite = new THREE.Matrix4().copy(rh.matrixWorld).invert().multiply(weapon.matrixWorld);
          if (lh) this.handLocal.gauche = new THREE.Matrix4().copy(lh.matrixWorld).invert().multiply(weapon.matrixWorld);
        }
      },
    };
    // position « en bandoulière » = celle de la garde basse, mémorisée par rapport au torse (Spine2)
    if (M.clips.Garde_Basse && f.bones.spine) {
      f.play('Garde_Basse', { time: 0 }); f.update(0); body.updateMatrixWorld(true); f.placeWeapon(true, 0, 'deux'); weapon.updateMatrixWorld(true);
      if (cou && f.bones.head) { neutre = [cou.quaternion.clone(), f.bones.head.quaternion.clone()]; faceL = new THREE.Vector3(0, 0, 1).applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(WQ(f.bones.head).invert()); }
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
