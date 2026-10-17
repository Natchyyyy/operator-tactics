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
        S.gltf = g; S.ready = true; delete root.MODELES.soldat;
        for (const f of S.onReady.splice(0)) try { f(); } catch (e) { console.warn(e); }
      }, (e) => console.warn('soldat 3D :', e));
    } catch (e) { console.warn('soldat 3D :', e); }
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
    const weapon = o.weapon ? root.Figure.makeWeapon(o.weapon, o.attachments) : new THREE.Group(); if (!weapon.muzzle) weapon.muzzle = new THREE.Vector3(0, 0, 0.6);
    group.add(weapon);
    const mixer = new THREE.AnimationMixer(body), actions = {};
    const act = (name) => { if (!S.clips[name]) return null; if (!actions[name]) { const a = mixer.clipAction(S.clips[name]); if (ONCE[name]) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; } actions[name] = a; } return actions[name]; };
    const f = { group, pose, weapon, body, skinned, mixer, clip: null, frozen: false, isSkinned: true,
      bones: { rh: bone('RightHand'), lh: bone('LeftHand'), spine: bone('Spine2'), head: bone('Head'), hips: bone('Hips') },
      // joue (en fondu) l'animation demandée ; time : figer à un instant (pose fixe) ; speed : vitesse du cycle
      play(name, opts = {}) {
        const a = act(name); if (!a) return;
        if (this.clip !== name) {
          const prev = this.clip && actions[this.clip];
          a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.play();
          if (prev) a.crossFadeFrom(prev, opts.fade !== undefined ? opts.fade : 0.22, false);
          this.clip = name;
        }
        if (opts.time !== undefined) { a.time = opts.time * a.getClip().duration; a.timeScale = 0; } else a.timeScale = opts.speed || 1;
      },
      update(dt) { mixer.update(dt); },
      // arme : poignée dans la main droite, canon vers la main gauche (sinon dans l'axe de la main droite)
      placeWeapon(twoHands, recoil) {
        const rh = this.bones.rh, lh = this.bones.lh; if (!rh) return;
        group.updateMatrixWorld(true);
        const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
        const pR = rh.getWorldPosition(V()).applyMatrix4(inv), pL = lh.getWorldPosition(V()).applyMatrix4(inv);
        const q = rh.getWorldQuaternion(new THREE.Quaternion()), qg = group.getWorldQuaternion(new THREE.Quaternion()).invert(); q.premultiply(qg);
        const handUp = new THREE.Vector3(0, 1, 0).applyQuaternion(q);   // axe de la main (vers les doigts)
        let fwd = pL.clone().sub(pR); const dist = fwd.length();
        if (!twoHands || dist < 0.12 || dist > 0.75) fwd = handUp.clone(); else fwd.normalize();
        const up = new THREE.Vector3(0, 1, 0); if (Math.abs(fwd.dot(up)) > 0.95) up.set(0, 0, 1);
        const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), fwd.clone().negate(), up);   // +Z de l'arme le long de fwd
        weapon.quaternion.setFromRotationMatrix(m);
        const grip = weapon.gripPt ? weapon.gripPt.clone().applyQuaternion(weapon.quaternion) : V();
        weapon.position.copy(pR).sub(grip).addScaledVector(fwd, -0.02 - (recoil || 0) * 0.04);
      },
    };
    return f;
  }
  // instantané d'un soldat pour les portraits : anime une copie à un instant d'une animation donnée
  function posed(o, clip, t) {
    const f = create(o); if (!f) return null;
    f.play(clip || 'Walk_Fight_Forward', { time: t !== undefined ? t : 0.15 }); f.update(0); f.body.updateMatrixWorld(true);
    f.placeWeapon(true, 0); return f;
  }
  S.load = load; S.create = create; S.posed = posed; S.whenReady = (fn) => { if (S.ready) fn(); else S.onReady.push(fn); };
  root.Soldat3D = S;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else setTimeout(load, 0);
})(window.OT = window.OT || {});
