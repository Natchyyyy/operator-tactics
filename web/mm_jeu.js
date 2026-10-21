// Motion matching dans le jeu — liaison entre la simulation (sim/engine.js : les cerveaux décident) et le module de
// mouvement (web/mm.js, généré depuis prototypes/motion-matching/ : il joue les mouvements et rend la pose).
//
// Principe : la simulation reste maîtresse des positions, des tirs et des états (tests, équilibre). Pour chaque soldat, un
// agent de motion matching reçoit des ORDRES simples tirés de l'état simulé — un point à rejoindre (la position simulée,
// un peu en avant), la vitesse voulue, la direction à regarder, arme en joue ou non, accroupi, à couvert — et avance par
// pas FIXES de 1/60 s. Le soldat affiché suit donc la simulation avec le retard d'un vrai départ (~0,3 s) ; un rattrapage
// doux (et un replacement sec au-delà de 1,5 m) l'empêche de s'en éloigner.
// Morts : ragdoll du jeu (web/ragdoll.js) via Agent.tuer ; relevé : Agent.relever à l'événement « revive ».
// Données de mouvement : hd/mm_base.json + hd/mm_base.{0,1,2}.wasm (même octets que les .bin du prototype : l'hébergeur
// claude.ai ne sert pas les .bin), chargées une seule fois, partagées par tous les soldats.
(function () {
  const OT = window.OT = window.OT || {};
  const J = OT.MMJeu = { pret: false, base: false, actif: true, agents: new Map(), stats: { ms: 0, pas: 0 }, onReady: [] };
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), UP = new THREE.Vector3(0, 1, 0);
  const PAS = 1 / 60;
  // réglages de la liaison (pas ceux du mouvement : PARAMS reste celui du prototype, validé par l'utilisateur)
  const LIAISON = { avance: 0.25, rattrapage: 0.8, rattrapageArret: 0.5, replacement: 1.5, tol: 0.12, vMax: 3.8 };
  J.LIAISON = LIAISON;

  const yawDe = (facing) => Math.PI / 2 - facing;   // simulation : angle depuis +x (atan2(dz, dx)) → module : angle depuis +z (atan2(x, z))
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  // ---- chargement -----------------------------------------------------------------------------------------------------
  J.disponible = () => {
    if (!OT.MM || !window.THREE) return false;
    const H = window.OT_HD; if (H && !(H.fichiers['mm_base.json'] && H.fichiers['mm_base.0.wasm'])) return false;   // données non publiées à côté de la page
    if (/[?&]mm=0/.test(location.search)) return false;
    return true;
  };
  J.charger = function () {
    if (J.chargement) return J.chargement;
    if (!J.disponible()) return (J.chargement = Promise.resolve(false));
    window.FICHIERS = Object.assign({}, window.FICHIERS || {}, { base: 'hd/mm_base.wasm', baseMeta: 'hd/mm_base.json' });
    J.chargement = OT.MM.chargerBase().then(() => { J.base = true; verifierPret(); return true; }).catch((e) => { console.warn('motion matching : données indisponibles', e); return false; });
    return J.chargement;
  };
  function verifierPret() {
    if (J.pret || !J.base) return;
    const S = OT.Soldat3D; if (!S || !S.ready || !S.modeles) return;
    // seuil d'appui des orteils : hauteur de repos des orteils du modèle (pose de liaison) + 5 cm (comme le prototype)
    J.pret = true; for (const f of J.onReady.splice(0)) try { f(); } catch (e) { console.warn(e); }
  }
  J.whenReady = (fn) => { if (J.pret) fn(); else J.onReady.push(fn); };
  if (OT.Soldat3D) OT.Soldat3D.whenReady(verifierPret);

  // ---- création d'un soldat ----------------------------------------------------------------------------------------
  // Renvoie un « maillage » au sens de web/app.js (group, bones, weapon…) dont la pose est tenue par l'agent `mm`.
  J.creer = function (u, o) {
    const S3 = OT.Soldat3D, MM = OT.MM; if (!J.pret || !S3 || !S3.cloneSkinned) return null;
    const M = S3.modeles[o.modele] || S3.modeles[S3.defaut]; if (!M) return null;
    const scene = S3.cloneSkinned(M.gltf.scene);
    // pose de départ = garde basse (comme Soldat3D.create : les mesures du chargement laissent la scène dans une pose quelconque)
    if (M.clips.Garde_Basse) for (const t of M.clips.Garde_Basse.tracks) { const mt = /^(.*)\.(quaternion|position)$/.exec(t.name), b = mt && (scene.getObjectByName(mt[1]) || scene.getObjectByName(mt[1].replace(/^mixamorig/, 'mixamorig:'))); if (b) { if (mt[2] === 'quaternion') b.quaternion.fromArray(t.values, 0); else b.position.fromArray(t.values, 0); } }
    let skinned = null; scene.traverse(n => { if (n.isSkinnedMesh) { skinned = n; if (S3.tintedMaterial) n.material = S3.tintedMaterial(n.material, o.uniform, M.nom); n.castShadow = true; n.frustumCulled = false; } });
    if (skinned && M.nom === 'gign' && S3.charnieres) try { S3.charnieres(skinned); } catch (e) { }
    scene.updateMatrixWorld(true);
    const soldat = new MM.Soldat({ scene, animations: Object.values(M.clips) });
    if (OT.Modeles3D && OT.Modeles3D.has && OT.Modeles3D.has('fusil') && OT.Modeles3D.scenes) {
      try { soldat.equiperFusil({ scene: OT.Modeles3D.scenes.fusil.clone(true) }); soldat.mesurerPrise(); } catch (e) { console.warn('motion matching (fusil) :', e); }
    }
    const group = new THREE.Group(); group.add(soldat.group);   // (group = position/rotation du soldat pour le jeu ; soldat.group compense : le module travaille en coordonnées monde)
    const ctl = MM.nouveauControleur(); ctl.visee = true; ctl.touches = {};
    const A = new MM.Agent(soldat, ctl); A.uJeu = u; A.idJeu = u.id;
    if (!J.seuilOrteil) { const yT = Math.min(...soldat.orteils.map(x => x.getWorldPosition(V3()).y)); J.seuilOrteil = yT + 0.05; MM.ctx.seuilOrteil = J.seuilOrteil; }
    const placer = (x, z, facing) => { const yaw = yawDe(facing); soldat.pos.set(x, 0, z); soldat.yaw = yaw; ctl.pos.copy(soldat.pos); ctl.yaw = yaw; ctl.vel.set(0, 0, 0); ctl.acc.set(0, 0, 0); ctl.yawV = 0; ctl.camYaw = yaw; };
    placer(u.x, u.z, u.facing);
    if (soldat.fusil) { soldat.fusil.muzzle = soldat.fusil.bouchePt.clone(); }
    const bone = (n) => soldat.os[MM.Base.meta.os.indexOf(n)] || null;
    const m = { group, mm: A, soldat, ctl, placer, isSkinned: true, skinned, body: soldat.group, weapon: soldat.fusil || Object.assign(new THREE.Group(), { muzzle: V3(0, 0, 0.6) }),
      bones: { hips: bone('Hips'), head: bone('Head'), spine: bone('Spine'), dos: bone('Spine') },
      pose: { rotation: { y: 0 }, position: { y: 0 } }, clips: {}, mixer: null, marche: null,
      update() { }, placeWeapon() { }, mod() { }, repas: () => true };
    J.agents.set(u.id, A); A.m = m;
    MM.ctx.agents = [...J.agents.values()];
    return m;
  };
  J.retirer = function (u) { const A = J.agents.get(u.id); if (!A) return; if (A.mort && OT.Ragdoll) OT.Ragdoll.liberer(A.mort.m); J.agents.delete(u.id); OT.MM.ctx.agents = [...J.agents.values()]; };
  J.vider = function () { for (const A of J.agents.values()) if (A.mort && OT.Ragdoll) try { OT.Ragdoll.liberer(A.mort.m); } catch (e) { } J.agents.clear(); OT.MM.ctx.agents = []; J.reste = 0; };

  // ---- ordres : état simulé → contrôleur -----------------------------------------------------------------------------
  const estVise = (u) => u.state !== 'hide' && !u.blindWall && !!(u.target || u.state === 'engage' || u.state === 'overwatch' || u.state === 'capture' || u.state === 'appui' || u.state === 'holdkey' || u.state === 'hold' || u.state === 'pinned' || u.preaim);
  function ordres(A, u, battle, cible) {
    const C = A.ctl, S = A.soldat, MM = OT.MM;
    if (A.leve) return;   // relevé en cours : le module garde la main
    if (A.sauvetage) return sauvetageTic(A, u, battle, cible);   // sauvetage (traînage, réa) : règles du jeu, gestes du module
    const vx = cible.vx, vz = cible.vz, v = Math.hypot(vx, vz), bouge = u.alive && u.moving && v > 0.1;
    // point à rejoindre : la position simulée un peu en avant (la simulation avance par paliers de 0,1 s ; sans avance le
    // soldat affiché freinerait à chaque palier)
    const px = cible.x + vx * LIAISON.avance, pz = cible.z + vz * LIAISON.avance, ecart = Math.hypot(px - S.pos.x, pz - S.pos.z);
    if (bouge && ecart > LIAISON.tol) {
      C.chemin = [V3(px, 0, pz)]; C.cheminIdx = 0; C.cheminFin = false; C.cheminTol = 0.06;   // (tolérance < LIAISON.tol : un point unique déjà atteint ferait boucler vitesseCible)
      // vitesse voulue = vitesse simulée, un peu plus s'il est en retard (jusqu'à vMax)
      C.vitesseChemin = Math.max(0.4, Math.min(LIAISON.vMax, v * (1 + Math.max(0, ecart - 0.3) * 0.8)));
      C.sprint = v > 2.2;
    } else { C.chemin = null; C.cheminFin = false; C.sprint = false; C.cheminTol = null; }
    C.couvert = null; C.enRoute = null;
    const vise = u.alive && estVise(u) && !(u.reloading > 0) && !u.throwing;
    const yawFace = yawDe(u.facing);
    C.visee = u.alive && u.state !== 'dragging' && !u.reviving;
    C.verrouRegard = vise; C.verrouCible = yawFace; C.camYaw = yawFace;
    C.tirEnMarchant = vise && bouge;
    C.tir = false;   // (le tir vient des événements « shot » de la simulation : recul posé sur l'agent, éclair par effets.js)
    C.accroupi = u.alive && u.stance === 'crouch';
    // à couvert (règle du jeu : coverAt) : arrêté, accroupi, un obstacle bas entre lui et ce qu'il surveille → pose « couvert »
    // du module (recalage sur le point, accroupi profond, redressé pour tirer par-dessus)
    let bloc = null;
    if (C.accroupi && !bouge && battle && battle.coverAt) {
      const tx = u.x + Math.cos(u.facing) * 6, tz = u.z + Math.sin(u.facing) * 6;
      if (battle.coverAt(u.x, u.z, tx, tz, true)) { bloc = blocProche(battle, u.x, u.z, u.facing); if (bloc) C.couvert = { point: V3(cible.x, 0, cible.z), yawMenace: yawFace }; }
    }
    MM.ctx.BLOC = bloc;
  }
  // ---- sauvetage : la simulation décide (todrag / dragging / reviving / revive), le module joue les gestes -----------------
  // Démarrage : le sauveteur simulé est arrivé près du blessé (phase « go » à < 1,3 m : la simulation attend 3 s que le corps se
  // pose → le temps d'aller au col et de le saisir) ou commence à le relever sur place (reviving sans traînage).
  function sauvetageDebut(A, u, battle) {
    const MM = OT.MM; if (!u.alive || A.sauvetage || A.mort || A.leve) return;
    let cibleId = null, traine = false;
    if (u.drag && (u.drag.phase === 'go' || u.drag.phase === 'pull') && (u.state === 'todrag' || u.state === 'dragging')) { const a = battle.unitById(u.drag.id); if (a && !a.alive && Math.hypot(a.x - u.x, a.z - u.z) <= 2.6) { cibleId = a.id; traine = true; } }   // (dès 2,6 m : le temps d'aller au col et de saisir pendant que la simulation finit d'arriver)
    else if (u.reviving && u.state === 'reviving' && !u.drag) cibleId = u.reviving.id;
    if (!cibleId) return;
    const V = J.agents.get(cibleId); if (!V || !V.mort || !V.mort.m.rag || V.mort.m.rag.etat !== 'physique') return;
    const th = menaceDe(u, battle);
    const sv = new MM.Sauvetage(A, V, th); sv.reanimer = true; sv.jeu = { traine, cibleId };
    if (traine) sv.planifier = () => { const C = A.ctl; C.enRoute = null; C.cheminRecul = true; C.cheminTol = 0.12; C.vitesseChemin = MM.PARAMS.sauvetage.vitesse; C.cheminFin = false; C.chemin = [V3(u.x, 0, u.z)]; C.cheminIdx = 0;
      C.surArrivee = () => { sv.detacher(); sv.etat = 'depose'; sv.t = 0; const r = V.mort.m.rag; if (r) r.t = 0; V.mort.aplatir = true; V.mort.aplatirBras = true; }; };
    else sv.surPlace();
    A.sauvetage = sv;
  }
  function menaceDe(u, battle) {
    let th = null; if (u.drag && u.drag.ths && u.drag.ths.length) th = u.drag.ths[0];
    if (!th) for (const e of battle.enemiesOf(u)) if (e.alive && (u.visible && u.visible.has(e.id))) { th = e; break; }
    if (!th) { const k = u.knowledge && Object.values(u.knowledge)[0]; if (k) th = k; }
    return th ? { x: th.x, z: th.z } : { x: u.x + Math.cos(u.facing) * 10, z: u.z + Math.sin(u.facing) * 10 };
  }
  function sauvetageTic(A, u, battle, cible) {
    const sv = A.sauvetage, C = A.ctl, V = sv.V, a = battle.unitById(sv.jeu.cibleId);
    const abandon = !u.alive || !a || !V.mort || (!a.alive && !u.drag && !u.reviving && u.state !== 'dragging');   // (blessé déjà relevé par le jeu : on finit, voir finRea)
    if (abandon) { if (sv.cons) sv.detacher(); sv.finir(); A.sauvetage = null; return; }
    if (sv.etat === 'traine') {
      // le point à rejoindre = le sauveteur simulé (il recule vers le couvert choisi par le jeu, corde de 1 m au blessé)
      const ecart = Math.hypot(cible.x - A.soldat.pos.x, cible.z - A.soldat.pos.z);
      if (u.state === 'dragging' && u.drag && u.drag.phase === 'pull' && ecart > 0.15) { C.chemin = [V3(cible.x, 0, cible.z)]; C.cheminIdx = 0; C.cheminTol = 0.12; C.cheminFin = false; C.vitesseChemin = Math.min(1.6, OT.MM.PARAMS.sauvetage.vitesse * (1 + Math.max(0, ecart - 0.5))); }
      else if (!(u.state === 'dragging' && u.drag && u.drag.phase === 'pull')) {
        // la simulation est déjà arrivée (le sauveteur simulé est à l'arrêt au couvert) : le module finit de tirer le blessé jusque-là
        // (la prise au col prend ~3 s, la simulation n'attend pas), puis le pose
        const dx = u.x - A.soldat.pos.x, dz = u.z - A.soldat.pos.z, d = Math.hypot(dx, dz);
        if (d > 0.35 && sv.t < 12) { C.chemin = [V3(u.x, 0, u.z)]; C.cheminIdx = 0; C.cheminTol = 0.12; C.cheminFin = false; C.vitesseChemin = Math.min(1.6, OT.MM.PARAMS.sauvetage.vitesse * (1 + Math.max(0, d - 0.5))); }
        else { C.chemin = null; if (C.surArrivee) { const f = C.surArrivee; C.surArrivee = null; f(); } } }
      else C.chemin = null;
    }
    if (sv.etat === 'rea') { sv.finRea = a.alive ? true : false; }   // la simulation dit quand le blessé est relevé (événement « revive »)
    if (sv.etat === 'rea' && !a.alive && !u.reviving) { sv.finir(); A.sauvetage = null; }   // relève interrompue par le jeu
    if (a.alive && sv.t > 15 && sv.etat !== 'rea') { if (sv.cons) sv.detacher(); sv.finir(); A.sauvetage = null; V.relever(yawDe(a.facing)); }   // garde-fou : le module n'a pas suivi, relevé direct
  }
  J.sauvetageDebut = sauvetageDebut;

  // obstacle bas le plus proche devant le soldat (pour la hauteur du couvert et le contournement du module)
  function blocProche(battle, x, z, facing) {
    const obs = battle.map && battle.map.obstacles; if (!obs) return null; let best = null, bd = 2.2;
    for (const o of obs) { if (!(o.h > 0.5) || o.h > 1.5) continue; const nx = Math.max(o.x, Math.min(o.x + o.w, x)), nz = Math.max(o.z, Math.min(o.z + o.d, z)); const d = Math.hypot(nx - x, nz - z); if (d < bd) { bd = d; best = o; } }
    return best;
  }

  // ---- image : pas fixes 1/60 s pour tous les agents -----------------------------------------------------------------
  // frameDt : temps simulé écoulé depuis la dernière image (0 en pause) ; cibles : fonction (u) → { x, z, vx, vz } (position
  // simulée interpolée et vitesse) ; battle : la bataille (ragdoll, obstacles)
  J.image = function (frameDt, cibles, battle, horloge) {
    const MM = OT.MM; if (!J.agents.size) return;
    MM.ctx.BATAILLE = battle; MM.ctx.MURS = battle && battle.map ? battle.map.obstacles.filter(o => o.h > 1.5) : [];
    J.reste = (J.reste || 0) + Math.max(0, Math.min(0.1, frameDt || 0));
    let n = 0; const t0 = performance.now();
    while (J.reste >= PAS && n < (J.maxPas || 4)) {   // (maxPas 6 en mode manuel : un pas de simulation de 0,1 s par image rendue, sans perte)
      J.reste -= PAS; n++; MM.ctx.horloge += PAS;   // (horloge propre du module : monotone, par pas fixes)
      for (const A of J.agents.values()) {
        const u = A.uJeu, c = cibles(u); if (!c) continue;
        if (A.mort) continue;
        if (A.m.anim && A.m.anim.recoil > (A.recul || 0)) A.recul = A.m.anim.recoil;
        if (battle && battle.unitById) sauvetageDebut(A, u, battle);
        ordres(A, u, battle, c);
        A.pas(PAS, MM.ctx.horloge * 1000);
        if (!A.sauvetage && !A.leve) rattraper(A, c, PAS);
      }
    }
    if (J.reste > 2 * PAS) J.reste = 2 * PAS;   // la machine ne suit pas : on abandonne le retard
    if (n) { J.stats.ms = J.stats.ms * 0.9 + (performance.now() - t0) / n * 0.1; J.stats.pas += n; }
    // morts : os tenus par la physique (ragdoll.js ; l'étape physique est faite par le jeu une fois par image)
    if (frameDt > 0 && [...J.agents.values()].some(A => A.mort)) MM.mortsTic(frameDt, true);
    for (const A of J.agents.values()) compenser(A);
  };
  // rattrapage : le soldat affiché est ramené doucement sur la position simulée (verrou des pieds : les appuis ne glissent
  // pas) ; au-delà de `replacement`, replacé d'un coup (téléportation de la simulation, changement de chemin brusque)
  function rattraper(A, c, dt) {
    const S = A.soldat, dx = c.x - S.pos.x, dz = c.z - S.pos.z, d = Math.hypot(dx, dz);
    if (d > LIAISON.replacement) { A.m.placer(c.x, c.z, A.uJeu.facing); return; }
    const bouge = Math.hypot(c.vx, c.vz) > 0.1;
    const k = 1 - Math.exp(-dt / (bouge ? LIAISON.rattrapage : LIAISON.rattrapageArret));
    if (d > 0.02) { S.pos.x += dx * k; S.pos.z += dz * k; A.ctl.pos.copy(S.pos); }
  }
  // le groupe du jeu porte la position/l'orientation du soldat (étiquettes, anneau, ombre, caméra) ; le groupe du module
  // compense pour rester en coordonnées monde
  function compenser(A) {
    const m = A.m, S = A.soldat; let x = S.pos.x, z = S.pos.z, yaw = S.yaw;
    if (A.mort && m.bones.hips) { const p = m.bones.hips.getWorldPosition(V3()); x = p.x; z = p.z; }
    m.group.position.set(x, 0, z); m.group.rotation.y = yaw; m.yaw = yaw;
    const g = S.group; g.rotation.y = -yaw; g.position.set(-x, 0, -z).applyAxisAngle(UP, -yaw);
  }

  // ---- mort, impact, relevé -------------------------------------------------------------------------------------------
  J.touche = function (m, dir) { m.mmDir = { x: dir.x, y: dir.y, z: dir.z }; };
  J.tuer = function (u, m, battle, flaque) {
    const A = m.mm; if (!A || A.mort) return !!(A && A.mort);
    let loc = ''; if (battle && battle.log) for (let i = battle.log.length - 1; i >= Math.max(0, battle.log.length - 40); i--) { const e = battle.log[i]; if (e.kind === 'down' && e.enemy === u.id) { loc = e.loc || ''; break; } }
    const d = m.mmDir ? V3(m.mmDir.x, m.mmDir.y, m.mmDir.z) : null; m.mmDir = null;
    if (Math.hypot(u.x - A.soldat.pos.x, u.z - A.soldat.pos.z) > 1.0) { m.placer(u.x, u.z, u.facing); compenser(A); A.soldat.group.updateMatrixWorld(true); }   // (soldat affiché loin de sa position simulée — pas d'image depuis longtemps : replacé avant la chute)
    OT.MM.ctx.BATAILLE = battle;
    const ok = A.tuer(loc, d);
    if (ok && flaque) A.mort.m.rag.flaque = flaque;
    return ok;
  };
  J.relever = function (u, m) { const A = m.mm; if (!A || !A.mort) return false;
    for (const R of J.agents.values()) { const sv = R.sauvetage; if (!sv || sv.V !== A) continue;
      sv.finRea = true; return true; }   // le sauveteur du module finit ses gestes (traînage, dépose, réa) puis le relève ; garde-fou dans sauvetageTic
    return A.relever(yawDe(u.facing)); };
  J.ressusciter = function (m) { const A = m.mm; if (A && A.mort) A.ressusciter(); };

  if (/[?&]manual=1/.test(location.search)) J.maxPas = 6;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => J.charger()); else setTimeout(() => J.charger(), 0);
})();
