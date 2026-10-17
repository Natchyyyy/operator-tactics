// Soldat 3D fait avec Meshy (modèle texturé, squelette Mixamo, 17 animations) : chargement depuis les données incluses
// (modeles/soldat.js → MODELES_ADD('soldat', base64)), copies par opérateur, teinte de l'uniforme selon l'équipe,
// choix de l'animation selon l'état simulé (marche, course, accroupi, visée, rechargement, lancer, chute, reptation,
// victoire) et arme du jeu tenue dans les mains (placée chaque image entre la main droite et la main gauche).
// Si le modèle manque ou ne se charge pas, le jeu garde ses personnages dessinés par programme (figure.js).
(function (root) {
  const S = { ready: false, gltf: null, clips: {}, onReady: [] };
  const HEIGHT = 1.8, RAW_H = 1.7;            // taille en jeu / taille du modèle exporté
  // vitesse « naturelle » de chaque cycle de locomotion (m/s), pour caler les pas sur le déplacement réel
  const LOCO = { Walking: 1.35, Walk_Fight_Forward: 1.1, Running: 3.4, RunFast: 5.2, Run_and_Shoot: 3.2, Cautious_Crouch_Walk_Forward: 0.9, Crawl_Backward: 0.5 };
  const ONCE = { Shot_and_Fall_Forward: 1, Shot_in_the_Back_and_Fall: 1, Over_Shoulder_Throw: 1 };
  function b64ToBuf(b64) { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; }
  function load() {
    const Loader = window.THREEX && THREEX.GLTFLoader; const b64 = root.MODELES && root.MODELES.soldat;
    if (!Loader || !b64 || !window.THREE) return;
    try {
      new Loader().parse(b64ToBuf(b64), '', (g) => {
        // locomotion sur place : on retire le déplacement horizontal du bassin (le jeu déplace déjà le soldat)
        for (const c of g.animations) {
          for (const tr of c.tracks) if (/Hips\.position$/.test(tr.name)) { const v = tr.values, x0 = v[0], z0 = v[2]; for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; } }
          S.clips[c.name] = c;
        }
        g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; } });
        S.gltf = g;
        try { straighten(g); composite(); measure(g); } catch (e) { console.warn('soldat 3D (mesure) :', e); }
        delete root.MODELES.soldat;
        // le fusil Meshy (modeles3d.js) est attendu : les soldats naissent directement avec
        const go = () => { S.ready = true; for (const f of S.onReady.splice(0)) try { f(); } catch (e) { console.warn(e); } };
        if (root.Modeles3D) root.Modeles3D.whenReady(go); else go();
      }, (e) => console.warn('soldat 3D :', e));
    } catch (e) { console.warn('soldat 3D :', e); }
  }
  // Animations qui font tourner tout le corps sur lui-même (demi-tour du lancer, visée qui pivote) : on garde l'orientation
  // du bassin de la première image (le jeu oriente déjà le soldat vers sa cible).
  const STRAIGHT = ['Over_Shoulder_Throw', 'Rifle_Aim_Turn_Right', 'Kneeling_Reload', 'Standing_Reload', 'Gunshot_Reaction'];
  function straighten(g) {
    const hips = g.scene.getObjectByName('mixamorigHips') || g.scene.getObjectByName('mixamorig:Hips'); if (!hips) return;
    g.scene.updateMatrixWorld(true);
    const P = hips.parent.getWorldQuaternion(new THREE.Quaternion()), Pi = P.clone().invert(), up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion(), qw = new THREE.Quaternion(), f = new THREE.Vector3();
    const yawOf = (qq) => { qw.copy(P).multiply(qq); f.set(0, 0, 1).applyQuaternion(qw); if (Math.abs(f.y) > 0.9) { f.set(1, 0, 0).applyQuaternion(qw); return Math.atan2(f.x, f.z) - Math.PI / 2; } return Math.atan2(f.x, f.z); };
    for (const n of STRAIGHT) {
      const c = S.clips[n]; if (!c) continue;
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
  function composite() {
    const walk = S.clips.Walk_Fight_Forward, aim = S.clips.Rifle_Aim_Turn_Right; if (!walk || !aim) return;
    const tracks = walk.tracks.filter(t => JAMBES.test(t.name)).map(t => t.clone());
    for (const t of aim.tracks) {
      if (JAMBES.test(t.name)) continue;
      const n = t.getValueSize(), v0 = Array.from(t.values.slice(0, n));
      tracks.push(new t.constructor(t.name, [0, walk.duration], v0.concat(v0)));
    }
    S.clips.Walk_Aim = new THREE.AnimationClip('Walk_Aim', walk.duration, tracks);
  }
  // Correction d'orientation par animation : de quel angle faut-il tourner le corps pour que l'ARME (main droite → main gauche)
  // pointe droit devant (+Z, la direction « face » du jeu) ? Mesurée une fois au chargement.
  // AIM : animations où l'arme doit viser droit devant, et l'instant (fraction) où la mesurer ; null = moyenne sur la boucle.
  const AIM = { Rifle_Aim_Turn_Right: 0.0, Standing_Reload: 0.0, Kneeling_Reload: 0.06, Run_and_Shoot: null, Walk_Fight_Forward: null, Walk_Aim: null, Cautious_Crouch_Walk_Forward: null, Gunshot_Reaction: 0.0 };
  const AIM_PART = { Walk_Fight_Forward: 0, Cautious_Crouch_Walk_Forward: 0, Run_and_Shoot: 0.6, Walk_Aim: 0.8 };   // locomotion : on corrige moins (les jambes marchent droit)
  S.yawFix = {};
  function measure(g) {
    const sc = g.scene, b = (n) => sc.getObjectByName('mixamorig' + n) || sc.getObjectByName('mixamorig:' + n);
    const rh = b('RightHand'), lh = b('LeftHand'); if (!rh || !lh) return;
    const mixer = new THREE.AnimationMixer(sc), pR = new THREE.Vector3(), pL = new THREE.Vector3();
    for (const n in AIM) {
      const c = S.clips[n]; if (!c) continue;
      const a = mixer.clipAction(c); a.play();
      const fr = AIM[n] === null ? [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875] : [AIM[n]];
      let sx = 0, sz = 0;
      for (const t of fr) { mixer.setTime(t * c.duration); sc.updateMatrixWorld(true); rh.getWorldPosition(pR); lh.getWorldPosition(pL); const dx = pL.x - pR.x, dz = pL.z - pR.z, L = Math.hypot(dx, dz) || 1; sx += dx / L; sz += dz / L; }
      const yaw = Math.atan2(sx, sz); S.yawFix[n] = -yaw * (AIM_PART[n] !== undefined ? AIM_PART[n] : 1);
      a.stop(); mixer.uncacheAction(c);
    }
    mixer.stopAllAction();
  }
  // matériau teinté : la toile beige de la tenue prend la couleur d'uniforme demandée (gilet, peau, bottes inchangés)
  const matCache = {};
  function tintedMaterial(base, uniform) {
    const key = uniform == null ? 'brut' : uniform.toString(16); if (matCache[key]) return matCache[key];
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
  function create(o) {
    if (!S.ready) return null;
    const group = new THREE.Group(), pose = new THREE.Group(); group.add(pose);
    const body = cloneSkinned(S.gltf.scene); body.scale.setScalar(HEIGHT / RAW_H); pose.add(body);
    let skinned = null; body.traverse(n => { if (n.isSkinnedMesh) { skinned = n; n.material = tintedMaterial(n.material, o.uniform); } });
    const bone = (n) => body.getObjectByName('mixamorig:' + n) || body.getObjectByName('mixamorig' + n);
    const weapon = o.weapon ? ((root.Modeles3D && root.Modeles3D.arme()) || root.Figure.makeWeapon(o.weapon, o.attachments)) : new THREE.Group(); if (!weapon.muzzle) weapon.muzzle = new THREE.Vector3(0, 0, 0.6);
    group.add(weapon);
    const mixer = new THREE.AnimationMixer(body), actions = {};
    const act = (name) => { if (!S.clips[name]) return null; if (!actions[name]) { const a = mixer.clipAction(S.clips[name]); if (ONCE[name]) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; } actions[name] = a; } return actions[name]; };
    const f = { group, pose, weapon, body, skinned, mixer, clip: null, frozen: false, isSkinned: true,
      bones: { rh: bone('RightHand'), lh: bone('LeftHand'), rm: bone('RightHandMiddle1'), lm: bone('LeftHandMiddle1'), spine: bone('Spine2'), head: bone('Head'), hips: bone('Hips') },
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
        if (!keepYaw) { const tgt = S.yawFix[this.clip] || 0; let d = tgt - body.rotation.y; body.rotation.y += d * Math.min(1, dt * 10); }
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
        weapon.position.copy(pR).sub(g).addScaledVector(barrel, -(recoil || 0) * 0.04);
      },
    };
    return f;
  }
  // instantané d'un soldat pour les portraits : anime une copie à un instant d'une animation donnée
  function posed(o, clip, t) {
    const f = create(o); if (!f) return null;
    f.play(clip || 'Walk_Fight_Forward', { time: t !== undefined ? t : 0.15 }); f.update(0); f.body.rotation.y = S.yawFix[f.clip] || 0; f.body.updateMatrixWorld(true);
    f.placeWeapon(true, 0); return f;
  }
  S.load = load; S.create = create; S.posed = posed; S.whenReady = (fn) => { if (S.ready) fn(); else S.onReady.push(fn); };
  root.Soldat3D = S;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else setTimeout(load, 0);
})(window.OT = window.OT || {});
