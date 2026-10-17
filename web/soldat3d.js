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
  const ONCE = { Shot_and_Fall_Forward: 1, Shot_in_the_Back_and_Fall: 1, Over_Shoulder_Throw: 1 };
  // Fusil épaulé : dans ces animations la crosse doit reposer dans le creux de l'épaule droite. Les animations Mixamo ne l'y
  // mettent pas exactement (le fusil du jeu n'est pas celui de l'animation) : à chaque image, le fusil garde son orientation
  // mais est glissé pour que sa crosse touche le creux de l'épaule, puis les deux bras sont recalés par IK (épaule → coude →
  // poignet, coude dans son plan d'origine, mains gardant leur orientation) pour que les paumes restent sur la poignée et
  // le garde-main. CREUX : position du creux par rapport à l'articulation de l'épaule droite (m) : vers le centre du
  // corps, vers l'avant, vers le bas.
  const EPAULE = { Rifle_Aim_Turn_Right: 1, Walk_Aim: 1, Run_and_Shoot: 1, Gunshot_Reaction: 1 };
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
      const go = () => { S.ready = true; for (const f of S.onReady.splice(0)) try { f(); } catch (e) { console.warn(e); } };
      if (root.Modeles3D) root.Modeles3D.whenReady(go); else go();
    };
    for (const nom of todo) {
      try {
        new Loader().parse(b64ToBuf(MOD[nom]), '', (g) => {
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
          try { straighten(M); composite(M); } catch (e) { console.warn('soldat 3D (mesure) :', e); }
          try { gardeBasse(M); } catch (e) { console.warn('soldat 3D (garde basse) :', e); }
          try { measure(M); } catch (e) { console.warn('soldat 3D (mesure) :', e); }
          S.modeles[nom] = M; delete MOD[nom]; finish();
        }, (e) => { console.warn('soldat 3D ' + nom + ' :', e); finish(); });
      } catch (e) { console.warn('soldat 3D ' + nom + ' :', e); finish(); }
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
    for (const n of STRAIGHT) {
      const c = M.clips[n]; if (!c) continue;
      const tr = c.tracks.find(t => /Hips\.quaternion$/.test(t.name)); if (!tr) continue;
      const v = tr.values; const y0 = yawOf(q.fromArray(v, 0));
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
    // (fusil Meshy, modeles3d.js : poignée P(0,33 ; −0,13), garde-main P(−0,42 ; 0) → a ∝ (0 ; 0,13 ; 0,75))
    const aW = new THREE.Vector3(0, 0.13, 0.75).normalize();
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
    act.stop(); mixer.uncacheAction(aim); restore(); fingers.forEach(([o, q]) => o.quaternion.copy(q)); sc.updateMatrixWorld(true);
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
      const yaw = Math.atan2(sx, sz); M.yawFix[n] = -yaw * (AIM_PART[n] !== undefined ? AIM_PART[n] : 1);
      a.stop(); mixer.uncacheAction(c);
    }
    mixer.stopAllAction();
  }
  // matériau teinté : la toile beige de la tenue prend la couleur d'uniforme demandée (gilet, peau, bottes inchangés)
  const matCache = {};
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
      const qH = WQ(hand), S0 = WP(arm), E0 = WP(fore), H0 = WP(hand), T = H0.clone().add(delta);
      const a = S0.distanceTo(E0), b = E0.distanceTo(H0); let c = S0.distanceTo(T); c = Math.min(Math.max(c, Math.abs(a - b) + 1e-4), (a + b) * 0.999);
      const dir = T.clone().sub(S0).normalize(), cosA = Math.max(-1, Math.min(1, (a * a + c * c - b * b) / (2 * a * c)));
      const p = E0.clone().sub(S0); p.addScaledVector(dir, -p.dot(dir)); if (p.lengthSq() < 1e-8) p.set(0, -1, 0); p.normalize();
      const E1 = S0.clone().addScaledVector(dir, a * cosA).addScaledVector(p, a * Math.sqrt(1 - cosA * cosA));
      turn(arm, E0.clone().sub(S0), E1.sub(S0)); const E2 = WP(fore); turn(fore, WP(hand).sub(E2), T.sub(E2));
      hand.quaternion.copy(WQ(hand.parent).invert().multiply(qH)); hand.updateMatrixWorld(true);
    }
    const f = { group, pose, weapon, body, skinned, mixer, clip: null, frozen: false, isSkinned: true, modele: M.nom, clips: M.clips, yawFix: M.yawFix,
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
      // keepYaw : garder la correction actuelle (chute : on ne fait pas pivoter un corps qui tombe)
      update(dt, keepYaw) {
        mixer.update(dt);
        this.epK = (this.epK || 0) + ((EPAULE[this.clip] ? 1 : 0) - (this.epK || 0)) * (dt > 0 ? Math.min(1, dt * 8) : 1);
        if (!keepYaw) { const tgt = M.yawFix[this.clip] || 0; let d = tgt - body.rotation.y; body.rotation.y += d * Math.min(1, dt * 10); }
      },
      // arme : poignée dans la main droite, canon vers la main gauche (sinon dans l'axe de la main droite)
      // L'arme est tenue par les PAUMES (entre le poignet et la base des doigts), pas par les poignets : la poignée dans la paume
      // droite, le garde-main dans la paume gauche. L'orientation aligne le segment poignée → garde-main de l'arme (qui n'est
      // pas parallèle au canon : la poignée est sous l'axe) sur le segment paume droite → paume gauche ; le dessus de l'arme
      // reste vers le haut. Une seule main (lancer, victoire) : l'arme suit l'axe de la main droite.
      placeWeapon(twoHands, recoil) {
        const B = this.bones, rh = B.rh, lh = B.lh; if (!rh) return;
        group.updateMatrixWorld(true);
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
      },
    };
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
