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
  // marche en visant (Pas_Glisse) : foulée × s, cheville levée au plus ~cap (m), demi-écart des chevilles larg (m), bassin
  // abaissé de bas (m), part gardée du rebond du bassin ; vol : pied en l'air dessiné (voir foulee() : talon ≤ 11 cm au lieu
  // de 25, pointe ≤ 17° vers le bas, semelle à 2,5 cm du sol au moins) ; bas 0,02 (et non 0,06) : genou ~25° à la pose (44°)
  // marche glissée jouée vite (1,25 → 1,75 m/s) : chaque cheville rapprochée de d (m) du milieu (base 36 → ~22 cm, comme en course)
  const GLISSE_SERRE = { v0: 1.25, v1: 1.75, d: 0.07 };
  // (larg 0,19 : base vue de face 36 cm, vidéo 28-38 ; genouOut 0,2 rad : genoux un peu vers l'extérieur, au-dessus des pieds —
  // de face les genouillères se frôlaient au passage de la jambe)
  const GLISSE_P = { s: 0.85, cap: 0.07, larg: 0.19, genouOut: 0.2, bas: 0.02, bob: 0.35, vol: { h0: 0.01, h1: 0.04, tb: 0.3, tf: -0.12, zb: -0.25, zf: 0.2, clr: 0.025 } };
  // visée debout : flexion des genoux visée (rad)
  const GENOUX_VISEE = 0.38;
  // écart moyen des chevilles en marche (m)
  const ECART_PAS = 0.21;
  // pas chassé joint lent (voir pasJoint) : cadence (pas/s), m par cycle, base (m), part du cycle en l'air par pas, levée (m),
  // bassin abaissé (m), rebond (m), pointes ouvertes [gauche, droite] (rad), pied gauche en avant / droit en arrière (m) ;
  // v0 → v1 (m/s) : passage au pas chassé hanches tournées
  const PAS = Object.assign({ actif: true, cad: 2.5, D: 0.5, base: 0.26, vol: 0.36, lev: 0.05, bas: 0.04, bob: 0.01, lacet: [0.1, 0.1], decal: 0.05, v0: 0.7, v1: 0.8 }, root.PAS_TEST || {});
  // pas chassé refait (voir pasChasse) : bassin ramené vers la cible (rad), lacet max des pieds (rad), garde au sol des pieds
  // qui bougent (m), part gardée du rebond du bassin, bassin remonté (m)
  // (ancre : appuis tenus fixes, voir ancrer() ; libre : sans la borne de cheville par rapport au tibia — le tibia penché de côté
  // faisait rouler la botte sur sa tranche et la remettait dans le sens du pas, -56°)
  const CHASSE = { actif: true, bassin: 0.2, lacet: 0.6, clr: 0.04, bob: 0.4, haut: 0, libre: true, ancre: true };
  // (par modèle — gign : bassin du pas chassé remonté de 2 cm ; ses genoux à la pose du pied étaient à 43-48° en diagonale
  // visée et en pas chassé, contre 36-39° pour le soldat ; au-delà de 2,5 cm, les pieds se rapprochent en pas chassé gauche)
  const CHASSE_MOD = { gign: { haut: 0.02 } };
  // verrou des pieds : durées de prise et de lâcher (s)
  const REECRIT = root.REECRIT_TEST ?? true;   // mixer : réécrire chaque os animé à chaque image (voir update)
  const GB_PAS = root.GB_PAS_TEST ?? true;
  const PIN_POSE = root.PIN_POSE_TEST ?? true;
  const POSE_ANTICIPE = root.POSE_ANTICIPE_TEST ?? true;
  const REPAS_ARRET = root.REPAS_ARRET_TEST ?? true;
  const REPRISE = root.REPRISE_TEST ?? true;
  const RUN_BAKE = root.RUN_BAKE_TEST ?? true;
  const COURSE_BAKE = root.COURSE_BAKE_TEST ?? true;   // course épaulée (Pas_Avant_Course) refaite par foulee   // course pleine (Pas_Run) refaite par foulee (voir directions)
  const PIVOT_PLANTE = root.PIVOT_PLANTE_TEST ?? true;
  const REPAS_DERIVE = root.REPAS_DERIVE_TEST ?? true;
  const ORDRE_TOUR = root.ORDRE_TOUR_TEST ?? true;
  // (tw : écart max — rad — où l'on tourne d'abord le bassin ; k : part de la torsion permise ; mesuré, 1,66 m/s visée 20-30° à
  // gauche : 210-215 → 171-187 pas/min, torsion 48-57°)
  const CAD_MAX = root.CAD_MAX_TEST ?? 210;   // cadence plafonnée des mélanges riches en pas chassé (pas/min ; 0 : aucune) — voir marche ; mesuré : diagonale visée 2 m/s 260 → 210 ; à 190-200, patinage du pied droit 0,12-0,14 m/s
  const TORS_PART = root.TORS_PART_TEST === false ? null : Object.assign({ tw: 1.0, k: 0.9 }, root.TORS_PART_TEST || {});   // marche visée de biais : bassin tourné jusqu'à la torsion permise, puis mélange (voir marche)
  // filtre (1/s) de la cible de torsion des jambes à l'arrêt ; 0 : aucun (essai à 12 : à-coup du bassin au pivot 4 200 → 2 600,
  // mais glissement par appui 7 → 8 cm : les pieds relâchés suivent un bassin en retard ; écarté)
  const JAMBES_FILTRE = root.JAMBES_FILTRE_TEST ?? 0;   // au quart de tour, le pied du côté du tour part le premier   // nouveaux pas si le bassin a tourné au-dessus des pieds cloués (voir poserPieds)
  // (essai, désactivé : bassin plus vif pendant les pas de pose ; mesuré : pied / bassin −2°, à-coup du bassin ×1,7)
  const JAMBES_POSE = root.JAMBES_POSE_TEST ? Object.assign({ vj: 6, st: 0.13 }, root.JAMBES_POSE_TEST) : null;   // torsion des jambes pendant les pas de pose (rad/s, s)
  const PIV_P = Object.assign({ lim: 0.7, w: 8, hanche: 1.0 }, root.PIV_P_TEST || {});   // (écart toléré, rad ; vitesse de pivot max, rad/s ; hanche : écart au-delà duquel le pied tourne autour du bassin, rad)   // pied en attente qui pivote sur la plante au quart de tour (voir poserPieds)   // marche qui reprend la couche de jambes du rechargement (voir marche)   // replacement des pieds permis pendant les pas d'arrêt (voir repas)   // pas de pose visant la place finale du pied (voir poserPieds)
  // garde basse (« low ready ») : av / ar = pied gauche avancé / pied droit reculé (m), hf = bassin vers l'avant (m), hy = bassin
  // (m), bl = bassin de trois quarts (°, hanche gauche en avant)
  // (mesuré, deux modèles : bassin et épaules à 21°, chevilles à 37 cm de large, pied droit 17 cm derrière et ouvert de 30-40°,
  // genoux à 13°, bassin 9-10 cm devant le milieu des chevilles — sur le milieu des pieds)
  const LOWR = Object.assign({ av: 0.05, ar: 0.12, hf: 0.04, hy: 0.005, bl: 22 }, root.LOWR_TEST || {});
  const DORSI_MAX = (root.DORSI_MAX_TEST ?? 36) * Math.PI / 180;
  const PLANT_MAX = (root.PLANT_MAX_TEST ?? 28) * Math.PI / 180;   // butée de flexion plantaire d'un pied en l'air (voir cheville)   // butée de flexion dorsale d'un pied en l'air (voir cheville)
  const CLOU = root.CLOU_TEST ?? true;   // pieds cloués à l'arrêt entre deux pas de replacement (voir clouer)
  const APPUI_POSE = root.APPUI_POSE_TEST ?? true;   // pied reposé cloué jusqu'à la fin de la pose (voir poserPieds)   // pied avancé de la garde basse porté par le pas de pose (voir appui)
  const VERROU = Object.assign({ prise: 0.09, lache: 0.16 }, root.VERROU_TEST || {});
  // pied qui bouge = pied levé (voir decolle()) : hauteur de semelle visée (m), vitesses (m/s) de début / pleine levée, temps (s)
  // (réponse 0,025 s et non 0,06 : au premier image d'un lâcher de verrou, ou à l'approche de la pose en petite course de côté,
  // le pied partait / arrivait à 3-5 m/s encore au ras du sol — patinage 0,37-0,42 → 0,09-0,10 en course latérale)
  const DECOLLE = Object.assign({ h: 0.035, h2: 0.045, v0: 0.4, v1: 1.2, t: 0.025 }, root.DECOLLE_TEST || {});
  // marche de patrouille (Pas_Avant_Low) refaite par foulee() — null : l'ancienne (marche de la bibliothèque resserrée)
  // (talon 30-32 → 17-19 cm, vidéo / réglement ≤ 25 ; rebond 6,7 → 5 cm ; base 20 cm comme l'ancienne marche resserrée)
  const PATROUILLE = { cap: 0.12, larg: 0.105, bob: 0.75, vol: { h0: 0.02, h1: 0.05, tb: 0.35, tf: -0.12, zb: -0.25, zf: 0.2, clr: 0.03 } };
  // recul : foulée de la marche arrière allongée (rapport)
  const RECUL = 1.45;
  // ouverture des pieds en marche / course (rad, pointe vers l'extérieur ; réel : 5 à 10°)
  const OUV_PIED = 0.12;
  // pied en l'air : écart max de la cheville à sa pose de repos (rad) ; pli max des orteils au déroulé (rad)
  const CHEVILLE_MAX = 0.5, ORTEIL_MAX = 0.6;
  // plan du genou (IK des jambes) : écart max à l'avant anatomique vers l'extérieur / l'intérieur (rad) ; vers l'intérieur 0,15
  // (et non 0,45) : genoux en X de 15 à 28° mesurés en appui (valgus) dans la marche visée, la course et les pas chassés → ≤ 11°
  const GENOU_OUT = 1.0, GENOU_IN = root.GENOU_IN_TEST !== undefined ? root.GENOU_IN_TEST : 0.15;
  // à genou : hauteur du genou arrière posé (os, m), de sa cheville (pointe du pied au sol), cheville du pied avant à plat
  const GENOU = { genou: 0.075, cheville: 0.13, chevilleAv: 0.15, baisse: 0.035 };   // baisse : bassin abaissé (m) pour que le genou arrière touche le sol
  // (cap 0,13 et pied en l'air dessiné — vol, voir foulee() — : talon 33 → 21-23 cm, vidéo réelle ≤ 25 ; foulée 0,47 et non 0,38 :
  // cadence 173-200 pas/min à 2,1-2,4 m/s au lieu de 180-204, foulée un peu plus longue comme un vrai petit trot)
  const TROT = { cap: 0.13, s: 0.47, hs: 0.6, rise: 0.5, dos: 0.45, kp: 0.55, foulee: { vol: { h0: 0.05, h1: 0.09, tb: 0.4, tf: -0.15, zb: -0.3, zf: 0.25, clr: 0.03 } } };   // kp : part gardée de la cambrure du pied
  // posture de tir : poitrine (Spine2) à PENCHE m en avant du bas du dos (Spine), dans la direction de visée
  const PENCHE = 0.21;
  S.VIS_W = 14; S.VIS_A = 45;   // suivi de la direction de visée (poseArme) : pulsation (rad/s), accélération max (rad/s²)
  S.PENCHE_ARRET = 0.26;   // visée à l'arrêt : cible de la penche (rad, repère de penche() ; 0,44 quand la penche était répartie sur trois os)
  S.PENCHE_EP = 0.5;   // direction de la penche (0,3 → 0,5 : roulis du buste 6-8° → 4-6°) : part de la normale des épaules (le reste : axe de visée)
  // visée : angle (rad) entre la ligne des épaules et la face (0 = carré, ~1,3 = de profil comme les visées Mixamo), voir penche()
  const BIAIS = 0.5;
  // (par modèle : épaules du « soldat » plus larges — un peu plus de face, la crosse vient dans le creux de l'épaule : 6,9 → 5,8 cm)
  S.BIAIS_M = { soldat: 0.4 };
  const COURSE_BAS = { Trot_Low_Haut: 1, Run_Low_Haut: 1, Run_Low: 1 };   // (rad : inclinaison bassin → cou vers l'avant, dans le plan du corps)
  // visée à l'arrêt : rotation du bassin et des jambes vers la cible (rad), voir update()
  const CARRE = 0.61;
  // tangage voulu du canon dans les poses épaulées (rad ; légèrement vers le bas : la cible est à hauteur de poitrine)
  const VISEE_TANGAGE = -0.035;
  // (rechargements : joués une fois et figés sur la dernière image si le jeu recharge plus longtemps que le clip — en boucle,
  // le fusil repartait vers le ciel au début du clip)
  const ONCE = { Shot_and_Fall_Forward: 1, Shot_in_the_Back_and_Fall: 1, Over_Shoulder_Throw: 1, Standing_Reload: 1, Standing_Reload_Haut: 1, Kneeling_Reload: 1 };
  // Fusil épaulé : dans ces animations la crosse doit reposer dans le creux de l'épaule droite. Les animations Mixamo ne l'y
  // mettent pas exactement (le fusil du jeu n'est pas celui de l'animation) : à chaque image, le fusil garde son orientation
  // mais est glissé pour que sa crosse touche le creux de l'épaule, puis les deux bras sont recalés par IK (épaule → coude →
  // poignet, coude dans son plan d'origine, mains gardant leur orientation) pour que les paumes restent sur la poignée et
  // le garde-main. CREUX : position du creux par rapport à l'articulation de l'épaule droite (m) : vers le centre du
  // corps, vers l'avant, vers le bas.
  // rechargements debout (main droite portée dans la poche de rechargement, voir poche())
  const REPOS = { Garde_Basse: 1, Rifle_Aim_Turn_Right: 1 };
  const RECHARGE = { Standing_Reload: 1, Standing_Reload_Haut: 1, Kneeling_Reload: 1 };   // (accroupi aussi : l'animation lève le fusil vers le ciel)
  const EPAULE = { Rifle_Aim_Turn_Right: 1, Walk_Aim: 1, Walk_Aim_Haut: 1, Run_and_Shoot: 1, Run_and_Shoot_Haut: 1, Gunshot_Reaction: 1, Accroupi_Vise: 1, Accroupi_Marche_Vise: 1 };
  // poses en garde basse construite (fusil, voir poseArme) en plus de Garde_Basse et des hauts du corps « _Low_Haut »
  const BAS = { Accroupi_Bas: 1, Accroupi_Marche_Bas: 1, Run_Low: 1, Walk_Low: 1 };
  const CREUX = { dedans: 0.16, avant: 0.08, bas: -0.03 };
  // œil droit dans le repère de la tête (m : au-dessus de l'os de la tête, devant, à droite) ; point de visée de l'optique
  // (repère de l'arme : centre de la fenêtre du viseur point rouge) ; garde basse construite (rad : canon vers le bas, vers la
  // gauche ; m : crosse sous / devant le creux de l'épaule)
  const VISEE_HAUT = 1.3;   // hauteur visée sur la cible (m au-dessus de ses pieds : poitrine d'un homme debout)
  const OEIL = { haut: 0.095, avant: 0.085, cote: 0.032 }, VISEE_OPTIQUE = [0, 0.145, -0.03], GARDE = { pique: 0.7, dedans: 0.42, bas: 0.0, avant: 0, recul: 0 };
  // creux de l'épaule de la garde basse (m, par rapport à l'articulation de l'épaule : vers le centre, l'avant, le bas)
  const POCHE = { dedans: 0.07, avant: 0.05, bas: 0.04 }; S.POCHE = POCHE;   // (0,06 / 0,05 → 0,07 / 0,04 : crosse à 6-6,5 cm du creux de l’épaule au lieu de 7-7,6)
  // poche de rechargement (m, par rapport à Spine2 : devant, dessous, vers la droite) : poignée du fusil pendant le rechargement
  const RECH = { avant: 0.3, bas: 0.12, lat: 0.04, lacet: 0.26, pique: 0.35, roulis: 0.45, pAvant: 0.17, pBas: 0.3, pLat: 0.06 }; S.RECH = RECH;   // (p… : porte-chargeur du gilet, main gauche)
  S.OEIL = OEIL; S.GARDE = GARDE;
  // (PORTEE_G : bras d'appui tendu jusqu'à cette part de sa longueur avant que le fusil ne soit rapproché — 0,97 bloquait le coude
  // à 152° ; PROTRACTION_G : l'épaule d'appui avance vers le garde-main de cette distance, m)
  const AVANCE_APPUI = 0.06; S.AVANCE_APPUI = AVANCE_APPUI; S.PORTEE_G = 0.995; S.PROTRACTION_G = 0.03;   // visée : main d'appui avancée sur le garde-main (m) ; 0 : les bras du modèle sont déjà tendus (plus loin, le fusil recule vers l'œil)
  S.CREUX = CREUX;
  function b64ToBuf(b64) { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; }
  // Repère de paume : un point fixe dans chaque main, à la base des doigts (les doigts eux-mêmes sont posés par calculerPrise).
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
  // Plan du genou (IK des jambes) : décalage du genou perpendiculaire à l'axe hanche → cheville, tel que le genou plie dans le
  // sens ANATOMIQUE : vers l'avant du BASSIN (lat = axe hanche droite → hanche gauche). Test : (p × dir)·lat > 0.
  // Avant, la règle suivait la direction des orteils : pied en arrière pointe en bas (talon relevé de la course), « l'avant »
  // devenait l'arrière et le genou de la jambe arrière pliait à l'envers (patte d'oiseau). Si le genou est presque tendu, son
  // plan est celui de l'avant du bassin ; s'il plie nettement vers l'arrière, il est retourné dans son plan ; s'il pointe sur
  // le côté (ni avant ni arrière), on le laisse.
  let biaisGenou = 0;
  function planGenou(p, dir, lat, mini, cote) {
    // avant anatomique du genou dans le plan ⟂ à l'axe : f = dir × lat (jambe verticale : l'avant du bassin ; cuisse levée
    // à l'horizontale : le haut) ; g = côté gauche. Le genou est gardé dans le demi-espace avant : au plus GENOU_OUT vers
    // l'extérieur, GENOU_IN vers l'intérieur (au-delà, ramené à la limite, de façon continue : plus de bascule d'un côté à
    // l'autre d'une image à la suivante)
    const f = new THREE.Vector3().crossVectors(dir, lat); if (f.lengthSq() < 1e-10) return p.lengthSq() > 1e-10 ? p.normalize() : p.set(0, 0, 1);
    f.normalize(); const g = new THREE.Vector3().crossVectors(f, dir).normalize(), pl = p.length();
    if (pl < mini) p.addScaledVector(f, mini - pl);
    // (limite douce : au-delà de 60 % de la borne, l'angle s'en approche sans l'atteindre — pas de cassure de vitesse du genou)
    const doux = (x, lim) => { const a = 0.6 * lim; return x <= a ? x : a + (lim - a) * Math.tanh((x - a) / (lim - a)); };
    let th = Math.atan2(p.dot(g), p.dot(f)) * cote + biaisGenou; th = (th >= 0 ? doux(th, GENOU_OUT) : -doux(-th, GENOU_IN)) * cote;   // (biaisGenou : genoux tournés un peu vers l'extérieur, cuisson de la marche visée)
    return p.copy(f).multiplyScalar(Math.cos(th)).addScaledVector(g, Math.sin(th));
  }
  // IK des jambes cuite dans un clip (30 clés/s) : pour chaque image, cible(i, H, A, Aq) donne la position monde voulue de
  // chaque cheville (A, Aq : cheville et orientation d'origine ; H : bassin) ; dyH(i) : montée du bassin (m, unités du
  // modèle). Genou dans son plan, pied gardant son orientation monde. Renvoie le nouveau clip (jambes seules) et l'erreur max.
  // ouv (rad, facultatif) : orientation des pieds (axe talon → plante du maillage) ramenée à ouv vers l'extérieur du sens de la
  // marche (+Z du modèle) : les cycles posaient le pied pointe en dedans de 15 à 33° (mesuré, « pieds de pigeon »)
  // Pose de repos des pieds (garde basse) : rotations locales cheville (par rapport au tibia) et orteils (par rapport au pied),
  // hauteur des os des orteils au sol ; référence des contraintes de cheville / d'orteils de jambesIK
  function reposPieds(M) {
    if (M._rp) return M._rp;
    const sc = M.gltf.scene, b = (n) => sc.getObjectByName('mixamorig' + n) || sc.getObjectByName('mixamorig:' + n), gb = M.clips.Garde_Basse; if (!gb) return null;
    const mx = new THREE.AnimationMixer(sc); mx.clipAction(gb).play(); mx.setTime(0); sc.updateMatrixWorld(true);
    const F = ['LeftFoot', 'RightFoot'].map(b), T = ['LeftToeBase', 'RightToeBase'].map(b), E = ['LeftToe_End', 'RightToe_End'].map(b);
    M._rp = { pied: F.map(o => o.quaternion.clone()), orteil: T.map(o => o.quaternion.clone()), tR: Math.min(...T.map(o => o.getWorldPosition(new THREE.Vector3()).y)), bout: !!(E[0] && E[1]) };
    // (bout et talon de la semelle au repos : le bout de la botte reste au sol au déroulé, voir jambesIK)
    if (M.semelle) { M._rp.pointeR = [0, 1].map(j => M.semelle[j].bout.clone().applyMatrix4(T[j].matrixWorld).y); M._rp.talonR = [0, 1].map(j => M.semelle[j].talon.clone().applyMatrix4(F[j].matrixWorld).y); }
    mx.stopAllAction(); mx.uncacheRoot(sc); sc.updateMatrixWorld(true); return M._rp;
  }
  function jambesIK(M, src, nom, cible, dyH, libre, ouv, lacetH) {   // libre : pas de règle sur le plan du genou (à genou) ; lacetH(i) : bassin tourné (rad, verticale)
    const sc = M.gltf.scene, b = (n) => sc.getObjectByName('mixamorig' + n) || sc.getObjectByName('mixamorig:' + n);
    const hips = b('Hips'), L = [['LeftUpLeg', 'LeftLeg', 'LeftFoot'], ['RightUpLeg', 'RightLeg', 'RightFoot']].map(l => l.map(b)), toes = [b('LeftToeBase'), b('RightToeBase')];
    if (!hips || L.some(l => l.some(x => !x)) || !toes[0] || !toes[1]) return null;
    const W = (o) => o.getWorldPosition(new THREE.Vector3()), WQ = (o) => o.getWorldQuaternion(new THREE.Quaternion());
    const clip = new THREE.AnimationClip(nom, src.duration, src.tracks.filter(t => JAMBES.test(t.name)).map(t => t.clone()));
    const mixer = new THREE.AnimationMixer(sc), act = mixer.clipAction(clip); act.play();
    const N = Math.max(4, Math.round(clip.duration * 30)), dur = clip.duration;
    const tous = [hips].concat(L[0], L[1], toes), sauve = tous.map(o => [o.quaternion.clone(), o.position.clone()]);
    const RP = reposPieds(M), bouts = [b('LeftToe_End'), b('RightToe_End')], kR = RAW_H / HEIGHT, UP = new THREE.Vector3(0, 1, 0);
    const turn = (bone, from, to) => { const dq = new THREE.Quaternion().setFromUnitVectors(from.normalize(), to.normalize()); bone.quaternion.copy(WQ(bone.parent).invert().multiply(dq.multiply(WQ(bone)))); bone.updateMatrixWorld(true); };
    const times = [], hp = [], hq = [], qs = L.map(l => l.map(() => [])), qt = [[], []]; let err = 0;
    for (let i = 0; i <= N; i++) {
      tous.forEach((o, j) => { o.quaternion.copy(sauve[j][0]); o.position.copy(sauve[j][1]); });
      mixer.setTime(i < N ? i / N * dur : 0); sc.updateMatrixWorld(true);
      tous.forEach((o, j) => { sauve[j][0].copy(o.quaternion); sauve[j][1].copy(o.position); });
      const H = W(hips), A = L.map(l => W(l[2])), Aq = L.map(l => WQ(l[2])), T = cible(i % N, H, A, Aq), dy = dyH ? dyH(i % N) : 0;
      if (ouv !== undefined && M.semelle) Aq.forEach((q, j) => { const ax = M.semelle[j].axe.clone().applyQuaternion(q); if (Math.hypot(ax.x, ax.z) < 1e-5) return; const yw = Math.atan2(ax.x, ax.z), d = (j ? -ouv : ouv) - yw; Aq[j] = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), d).multiply(q); });
      if (dy) { const p0 = hips.parent.worldToLocal(H.clone()), p1 = hips.parent.worldToLocal(H.clone().add(new THREE.Vector3(0, dy, 0))); hips.position.add(p1.sub(p0)); hips.updateMatrixWorld(true); }
      { const ly = lacetH ? lacetH(i % N) : 0; if (ly) { const qp = WQ(hips.parent); hips.quaternion.premultiply(qp.clone().invert().multiply(new THREE.Quaternion().setFromAxisAngle(UP, ly)).multiply(qp)); hips.updateMatrixWorld(true); } }
      L.forEach(([up, lo, ft], j) => {
        const Tj = T[j], S0 = W(up), E0 = W(lo), a = S0.distanceTo(E0), bb = E0.distanceTo(W(ft));
        // (genou jamais tendu à fond — flexion ≥ ~9° — et toujours plié vers l'avant, du côté des orteils : les cycles de la
        // bibliothèque passaient le genou 13 à 20° « en arrière » de la ligne hanche-cheville à l'appui)
        let c = S0.distanceTo(Tj); c = Math.min(Math.max(c, Math.abs(a - bb) + 1e-4), (a + bb) * 0.997);
        const dir = Tj.clone().sub(S0).normalize(), cosA = Math.max(-1, Math.min(1, (a * a + c * c - bb * bb) / (2 * a * c)));
        const p = E0.clone().sub(S0); p.addScaledVector(dir, -p.dot(dir));
        { const lat = W(L[0][0]).sub(W(L[1][0])); lat.y = 0; lat.normalize(); planGenou(p, dir, lat, 0.02 * RAW_H / HEIGHT, j ? -1 : 1); }
        const E1 = S0.clone().addScaledVector(dir, a * cosA).addScaledVector(p, a * Math.sqrt(1 - cosA * cosA));
        turn(up, E0.clone().sub(S0), E1.sub(S0)); const E2 = W(lo); turn(lo, W(ft).sub(E2), Tj.clone().sub(E2));
        ft.quaternion.copy(WQ(ft.parent).invert().multiply(Aq[j])); ft.updateMatrixWorld(true);
        err = Math.max(err, W(ft).distanceTo(Tj));
        if (RP) {
          // cheville : pied en l'air jamais « cassé » (pointe à la verticale, pied replié) : au plus CHEVILLE_MAX de sa pose de
          // repos par rapport au tibia, la limite se relâchant en douceur quand le pied approche du sol (il doit s'y poser)
          const hT = W(toes[j]).y - RP.tR, wA = Math.max(0, Math.min(1, (hT - 0.02 * kR) / (0.06 * kR))), lim = CHEVILLE_MAX + (1 - wA * wA * (3 - 2 * wA)) * Math.PI;
          if (!libre) { const d = RP.pied[j].clone().invert().multiply(ft.quaternion), ang = 2 * Math.acos(Math.min(1, Math.abs(d.w))); if (ang > lim) { ft.quaternion.copy(RP.pied[j].clone().slerp(ft.quaternion, lim / ang)); ft.updateMatrixWorld(true); } }
          // orteils : une botte est rigide. Pose de repos (droits) ; ils ne plient qu'au déroulé (talon levé, pointe au sol) :
          // assez pour que le bout reste au sol, ORTEIL_MAX au plus. (L'animation les relevait pied à plat : « bottes de lutin »)
          const to = toes[j]; to.quaternion.copy(RP.orteil[j]); to.updateMatrixWorld(true);
          // (bout de la botte = point de semelle mesuré sur le maillage (semelle()) : sur « gign » l'os Toe_End est à côté de ToeBase,
          // pas devant ; pli juste suffisant pour que ce bout ne passe pas sous le sol, seulement talon levé — déroulé)
          if (RP.pointeR && M.semelle) { const jt = W(to), tip = M.semelle[j].bout.clone().applyMatrix4(to.matrixWorld), v = tip.clone().sub(jt), len = v.length(), h = Math.hypot(v.x, v.z);
            const lev = (M.semelle[j].talon.clone().applyMatrix4(ft.matrixWorld).y - tip.y) - (RP.talonR[j] - RP.pointeR[j]), wl = Math.max(0, Math.min(1, (lev - 0.005 * kR) / (0.015 * kR)));
            if (tip.y < RP.pointeR[j] && h > 1e-5 && len > 1e-5 && wl > 0) { const th = Math.min(libre ? 1.05 : ORTEIL_MAX, Math.max(0, Math.atan2(-v.y, h) - Math.asin(Math.max(-1, Math.min(1, (jt.y - RP.pointeR[j]) / len))))) * wl, ax = new THREE.Vector3().crossVectors(v, UP).normalize();
              to.quaternion.copy(WQ(to.parent).invert().multiply(new THREE.Quaternion().setFromAxisAngle(ax, th)).multiply(WQ(to))); to.updateMatrixWorld(true); } }
          else if (RP.bout && bouts[j]) { const v = W(bouts[j]).sub(W(to)), hb = W(to).y - RP.tR, h = Math.hypot(v.x, v.z);
            if (v.y < 0 && h > 1e-5 && hb < 0.05 * kR) { const th = Math.min(libre ? 1.05 : ORTEIL_MAX, Math.atan2(-v.y, h)) * Math.max(0, Math.min(1, 1 - hb / (0.05 * kR))), ax = new THREE.Vector3().crossVectors(v, UP).normalize();
              to.quaternion.copy(WQ(to.parent).invert().multiply(new THREE.Quaternion().setFromAxisAngle(ax, th)).multiply(WQ(to))); to.updateMatrixWorld(true); } }
        }
      });
      times.push(i / N * dur); hp.push(...hips.position.toArray()); hq.push(...hips.quaternion.toArray()); L.forEach((l, j) => l.forEach((o, k) => qs[j][k].push(...o.quaternion.toArray()))); toes.forEach((o, j) => qt[j].push(...o.quaternion.toArray()));
    }
    tous.forEach((o, j) => { o.quaternion.copy(sauve[j][0]); o.position.copy(sauve[j][1]); });
    mixer.stopAllAction(); mixer.uncacheRoot(sc); sc.updateMatrixWorld(true);
    const nm = (o) => THREE.PropertyBinding.sanitizeNodeName(o.name), neuves = [new THREE.VectorKeyframeTrack(nm(hips) + '.position', times, hp)];
    L.forEach((l, j) => l.forEach((o, k) => neuves.push(new THREE.QuaternionKeyframeTrack(nm(o) + '.quaternion', times, qs[j][k]))));
    if (RP) toes.forEach((o, j) => neuves.push(new THREE.QuaternionKeyframeTrack(nm(o) + '.quaternion', times, qt[j])));
    if (lacetH) neuves.push(new THREE.QuaternionKeyframeTrack(nm(hips) + '.quaternion', times, hq));   // (bassin tourné : sa rotation fait partie du cycle)
    const noms = new Set(neuves.map(t => t.name));
    clip.tracks = clip.tracks.filter(t => !noms.has(t.name)).concat(neuves); clip.resetDuration(); clip.duration = dur;
    clip.userData = { err: err * HEIGHT / RAW_H }; return clip;
  }
  // Petite course de patrouille (« Pas_Trot ») tirée de la vraie course (« Running », athlétique : 4,6 m/s, foulée de 3 m) :
  // foulée raccourcie (« stride warping » : position avant / arrière des chevilles par rapport au bassin × s, autour de leur
  // position moyenne), pieds levés moins haut (× hs) et bassin un peu remonté (jambes moins écartées → moins fléchies).
  // Même cadence que la course : vitesse naturelle ≈ s × 4,6 m/s. Droit, souple, pieds dans l'axe : un trot de patrouille,
  // pas la course accroupie « au fusil » (Run_and_Shoot) qui faisait un petit trottinement de crabe sans ennemi en vue.
  // P (facultatif) : cap (m : hauteur des chevilles au-dessus de leur plus bas plafonnée en douceur — pied d'appel bas),
  // larg (m : demi-écart moyen visé des chevilles), bas (m : bassin abaissé, genoux fléchis), bob (part gardée du rebond
  // vertical du bassin)
  function foulee(M, src, nom, s, hs, rise, kp0, ouv, P) {
    P = P || {};
    const sc = M.gltf.scene, b = (n) => sc.getObjectByName('mixamorig' + n) || sc.getObjectByName('mixamorig:' + n), hips = b('Hips'), F = [b('LeftFoot'), b('RightFoot')];
    if (!src || !hips || !F[0] || !F[1]) return null;
    const mixer = new THREE.AnimationMixer(sc); mixer.clipAction(src).play();
    const N = Math.max(4, Math.round(src.duration * 30)), W = (o) => o.getWorldPosition(new THREE.Vector3());
    let gy = 1e9, mz = 0, hy = 0; const ech = [], mx = [0, 0];
    for (let i = 0; i < N; i++) { mixer.setTime(i / N * src.duration); sc.updateMatrixWorld(true); const H = W(hips), A = F.map(W); ech.push([H, A]); hy += H.y / N; A.forEach((a, j) => { gy = Math.min(gy, a.y); mz += (a.z - H.z) / (2 * N); mx[j] += (a.x - H.x) / N; }); }
    mixer.stopAllAction(); mixer.uncacheRoot(sc); sc.updateMatrixWorld(true);
    const kk = RAW_H / HEIGHT, capK = P.cap ? P.cap * kk : 0;
    // (P.arr, P.zArr : pied « glissé » — tant que la cheville est derrière le bassin (zArr[0] → zArr[1], m), elle ne monte que
    // de la part arr du plafond : à la poussée le pied quitte le sol en rasant au lieu de rester sur la pointe pendant que la
    // jambe arrière se lève, tibia couché à ~70° et talon à 25 cm ; il ne monte qu'en passant sous le bassin)
    const cib = (H, a, j) => { const hh = (a.y - gy) * hs, x = P.larg && j !== undefined ? a.x - mx[j] + Math.sign(mx[j]) * P.larg * kk : a.x, z = mz + s * (a.z - H.z - mz);
      let cj = capK; if (capK && P.arr !== undefined) { const Z = P.zArr || [-0.28, -0.02], u = Math.max(0, Math.min(1, (z / kk - Z[0]) / (Z[1] - Z[0]))); cj = capK * (P.arr + (1 - P.arr) * u * u * (3 - 2 * u)); }
      return new THREE.Vector3(x, gy + (cj ? cj * Math.tanh(hh / cj) : hh), H.z + z); };
    // montée du bassin : longueur bassin → cheville d'appui conservée en moyenne (part « rise »)
    let mont = 0; for (const [H, A] of ech) { const j = A[0].y < A[1].y ? 0 : 1, d0 = H.distanceTo(A[j]), h0 = Math.hypot(A[j].x - H.x, A[j].z - H.z), t = cib(H, A[j]), h1 = Math.hypot(t.x - H.x, t.z - H.z); mont += (Math.sqrt(Math.max(0, d0 * d0 - h1 * h1)) - Math.sqrt(Math.max(0, d0 * d0 - h0 * h0))) / N; }
    const dy = mont * rise;
    // pied moins cambré (la course attaque le sol pointe en avant, très tendue) : inclinaison cheville → pointe ramenée vers
    // celle de la pose de repos (part 1 − kp de l'écart), pour une attaque du sol plus à plat de petite foulée
    const toes = [b('LeftToeBase'), b('RightToeBase')], gb = M.clips.Garde_Basse; let p0 = 0.6, tR = null;
    if (gb && toes[0]) { const mx = new THREE.AnimationMixer(sc); mx.clipAction(gb).play(); mx.setTime(0); sc.updateMatrixWorld(true); const f = W(toes[0]).sub(W(F[0])); p0 = Math.atan2(-f.y, Math.hypot(f.x, f.z)); tR = Math.min(W(toes[0]).y, W(toes[1]).y); mx.stopAllAction(); mx.uncacheRoot(sc); sc.updateMatrixWorld(true); }
    const kp = kp0 !== undefined ? kp0 : TROT.kp, up = new THREE.Vector3(0, 1, 0), k = RAW_H / HEIGHT;
    // P.vol (pied en l'air « dessiné », marche glissée) : en oscillation, l'orientation du pied n'est plus celle de l'animation
    // (pointe à la verticale à la poussée, talon à 25 cm) mais la pose de repos inclinée de th : pointe un peu basse quand la
    // cheville est derrière le bassin (tb), légèrement relevée avant la pose du talon (tf) ; mélangée selon la hauteur de la
    // cheville (h0 → h1, m), avec une garde au sol minimale de la semelle (clr, m) : le pied ne racle pas, ne pointe pas.
    let RV = null;
    if (P.vol && gb && M.semelle && toes[0] && toes[1]) { const mx = new THREE.AnimationMixer(sc); mx.clipAction(gb).play(); mx.setTime(0); sc.updateMatrixWorld(true);
      RV = [0, 1].map(j => { const ft = F[j], to = toes[j], S = M.semelle[j], A0 = W(ft), q = ft.getWorldQuaternion(new THREE.Quaternion()), qi = q.clone().invert();
        const pw = [S.talon.clone().applyMatrix4(ft.matrixWorld), S.bout.clone().applyMatrix4(to.matrixWorld), S.plante.clone().applyMatrix4(to.matrixWorld)].concat((S.pts || []).map(o => o.p.clone().applyMatrix4(o.o ? to.matrixWorld : ft.matrixWorld)));
        return { q, sol: Math.min(...pw.map(p => p.y)), pts: pw.map(p => p.sub(A0).applyQuaternion(qi)), tv: W(to).sub(A0).applyQuaternion(qi) }; });
      mx.stopAllAction(); mx.uncacheRoot(sc); sc.updateMatrixWorld(true); }
    // (vitesse d'appui : recul moyen du pied le plus bas par rapport au bassin, sur 2 images, foulée réduite comprise)
    const zr = (n, j) => ech[(n + N) % N][1][j].z - ech[(n + N) % N][0].z;
    let vSt = 0, nSt = 0; for (let n = 0; n < N; n++) { const A = ech[n][1], j = A[0].y < A[1].y ? 0 : 1; vSt -= s * (zr(n + 1, j) - zr(n - 1, j)); nSt++; } const sgV = vSt < 0 ? -1 : 1; vSt = Math.max(1e-4, Math.abs(vSt / nSt));   // (sgV < 0 : cycle qui recule)
    // P.ancre : appuis tenus fixes dans le monde (voir ancrer) ; vitesse d'appui = celle du pied qui recule le plus (en z)
    let AN = null, vA = vSt;
    if (P.ancre) { const tg = ech.map(([H, A]) => A.map((a, j) => cib(H, a, j).sub(H))), rel = (n, j) => tg[(n + N) % N][j];
      // (vitesse d'appui : pied qui recule le plus ET posé — en course, pendant la phase de vol aucun pied n'est en appui)
      let nv = 0; vA = 0; for (let n = 0; n < N; n++) { const d = [0, 1].map(j => rel(n + 1, j).z - rel(n - 1, j).z), j = d[0] < d[1] ? 0 : 1; if (ech[n][1][j].y < gy + 0.025 * kk) { vA -= d[j]; nv++; } } vA = Math.max(1e-4, nv ? vA / nv : vSt);
      AN = ancrer(rel, N, new THREE.Vector3(0, 0, vA / 2), (n, j) => Math.abs(rel(n + 1, j).z - rel(n - 1, j).z + vA) < 0.6 * vA); }
    const clipF = jambesIK(M, src, nom, (i, H, A, Aq) => {
      const H0 = H.clone(), out = A.map((a, j) => cib(H0, a, j)), fr = [null, null];
      if (AN) out.forEach((o, j) => { o.x = H0.x + AN[i][j].x; o.z = H0.z + AN[i][j].z; });
      // (tangage mesuré par rapport à l'avant du modèle (+Z) : pied « au-delà de la verticale », pointe en bas ET en arrière à la
      // poussée — 110° et plus dans la marche — l'ancien atan2(−y, horizontale) le voyait à 70° et ne le corrigeait pas)
      if (toes[0] && toes[1]) A.forEach((a, j) => { const f = W(toes[j]).sub(a), h = Math.hypot(f.x, f.z), len = f.length(); if (h < 1e-4) return; const sg = f.z < 0 && P.vol ? -1 : 1, p =Math.atan2(-f.y, h * sg), np = Math.min(kp < 1 ? p0 + (p - p0) * kp : p, P.pmax !== undefined ? p0 + P.pmax : 9);   // (pmax : pointe jamais plus basse que pmax rad sous la pose à plat)
        const fh = new THREE.Vector3(sg * f.x / h, 0, sg * f.z / h), f1 = fh.clone().multiplyScalar(Math.cos(np)).addScaledVector(up, -Math.sin(np)); Aq[j] = new THREE.Quaternion().setFromUnitVectors(f.clone().normalize(), f1).multiply(Aq[j]); fr[j] = f1.multiplyScalar(len); });
      const wSw = [0, 0];
      if (RV) A.forEach((a, j) => { const V = P.vol, sm = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
        // (poids : cheville levée, OU pied qui bouge dans le monde — vitesse par rapport au bassin + vitesse d'appui — : un pied qui
        // avance encore ne touche pas le sol ; sinon, en fin d'oscillation, le talon arrivait en rasant le sol à 1-3 cm pendant
        // 0,1 s à la vitesse du corps : patinage)
        const vz = AN ? AN[(i + 1) % N][j].z - AN[(i - 1 + N) % N][j].z + vA : sgV * s * (zr(i + 1, j) - zr(i - 1, j)) + vSt;   // (vitesse dans le monde, comptée dans le sens du déplacement)
        const w = Math.max(sm(((a.y - gy) / kk - V.h0) / (V.h1 - V.h0)), sm((vz - 0.3 * (AN ? vA : vSt)) / (0.5 * (AN ? vA : vSt)))); wSw[j] = w; if (w <= 0) return;
        const th = V.tb + (V.tf - V.tb) * sm(((out[j].z - H0.z) / kk - V.zb) / (V.zf - V.zb));
        Aq[j] = Aq[j].clone().slerp(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), th).multiply(RV[j].q), w);
        let mn = 1e9; for (const p of RV[j].pts) mn = Math.min(mn, p.clone().applyQuaternion(Aq[j]).y); mn += out[j].y;
        const need = RV[j].sol + V.clr * kk * w - mn; if (need > 0) out[j].y += need;
        fr[j] = RV[j].tv.clone().applyQuaternion(Aq[j]); });
      // pied d'appui (le plus bas, près du sol) : sa plante posée au sol (hauteur de repos des orteils) une fois le pied redressé
      if (tR !== null && fr[0] && fr[1]) { const j = out[0].y + fr[0].y < out[1].y + fr[1].y ? 0 : 1, ty = out[j].y + fr[j].y, w = Math.max(0, Math.min(1, 1 - (ty - tR) / (0.08 * k)));
        if (w > 0) out[j].y += (tR - ty) * w * (1 - wSw[j]); }   // (sauf un pied en oscillation : il retombait d'une image à l'autre)
      return out; }, (i) => dy - (P.bas || 0) * kk + (P.bob !== undefined ? (P.bob - 1) * (ech[i][0].y - hy) : 0), false, ouv);
    // (appuis ancrés : la vitesse naturelle du cycle est exactement celle de l'appui ancré)
    if (clipF && AN) clipF.userData = Object.assign(clipF.userData || {}, { vitCuite: vA / (2 * src.duration / N) * HEIGHT / RAW_H, dirCuite: 0 });
    return clipF;
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
  // Pas chassé (« Walk_Left_with_Gun », marche « au pistolet » de la bibliothèque, qui va en fait vers la DROITE) refait pour un
  // tireur qui se déplace latéralement en visant (mesuré sur le cycle d'origine : pieds qui ne décollent jamais — 1 à 2 cm, ils
  // glissent sur le sol : patinage 0,6 à 1,7 m/s —, semelle droite 3,7 cm DANS le sol, pied d'attaque tourné de 96° dans le
  // sens du pas, bassin tourné de 45° vers le déplacement, rebond du bassin 6,6 cm). Cuit sur le cycle :
  //  - bassin ramené de P.bassin (rad) vers la cible (les pieds restent où ils sont : IK) ; rebond gardé à la part P.bob ;
  //  - pieds : lacet borné à ±P.lacet (rad) de l'avant (pointes vers la menace, ouvertes) ;
  //  - semelle AU sol en appui (ni dedans ni au-dessus), et à P.clr (m) au moins dès que le pied bouge dans le monde (vitesse
  //    par rapport au bassin + vitesse d'appui > 30 % de celle-ci) : un pied qui se déplace ne frotte pas le sol.
  // Appuis ancrés dans un cycle cuit : le jeu déplace le soldat à vitesse constante, alors que dans les captures le pied d'appui
  // recule par rapport au bassin à une vitesse qui varie (et différente d'un pied à l'autre) : chaque appui glissait de
  // quelques cm. Ici chaque pied d'appui est tenu FIXE dans le monde (bassin à vitesse constante vF, par image), au point
  // moyen de son appui ; l'écart est rattrapé en douceur pendant l'oscillation suivante. rel(i, j) : cheville par rapport au
  // bassin (x, z) ; appui(i, j) : pied posé. Renvoie C[i][j] (Vector3, x et z corrigés).
  function ancrer(rel, N, vF, appui) {
    const C = []; for (let i = 0; i < N; i++) C.push([rel(i, 0).clone(), rel(i, 1).clone()]);
    const sm = (x) => x * x * (3 - 2 * x);
    for (let j = 0; j < 2; j++) {
      const s = []; for (let i = 0; i < N; i++) s.push(!!appui(i, j));
      if (s.every(x => x) || !s.some(x => x)) continue;
      // (trous de 3 images au plus dans un appui comblés : après la pose, le pied des captures ralentit, glisse, ralentit — un
      // appui coupé en deux avait deux ancres et le pied glissait de l'une à l'autre au sol)
      for (let i = 0; i < N; i++) if (!s[i] && s[(i - 1 + N) % N]) { let g = 0; while (g < 4 && !s[(i + g) % N]) g++; if (g <= 3) for (let k = 0; k < g; k++) s[(i + k) % N] = true; }
      if (s.every(x => x)) continue;
      let a0 = 0; while (!(s[a0] && !s[(a0 - 1 + N) % N])) a0++;   // début d'un appui
      const Pw = (k) => rel(k % N, j).clone().addScaledVector(vF, k), corr = new Array(N * 2 + 2);
      const runs = []; for (let k = a0; k < a0 + N; ) { if (s[k % N]) { let e = k; while (e + 1 < a0 + N && s[(e + 1) % N]) e++; runs.push([k, e]); k = e + 1; } else k++; }
      for (const [a, e] of runs) { const anc = Pw(Math.round((a + e) / 2)); for (let k = a; k <= e; k++) corr[k] = anc.clone().sub(Pw(k)); }
      runs.push([runs[0][0] + N, runs[0][1] + N]); { const [a, e] = runs[0]; const anc = Pw(Math.round((a + e) / 2) + N); corr[a + N] = anc.clone().sub(Pw(a + N)); }
      for (let r = 0; r < runs.length - 1; r++) { const e = runs[r][1], a = runs[r + 1][0]; for (let k = e + 1; k < a; k++) corr[k] = corr[e].clone().lerp(corr[a], sm((k - e) / (a - e))); }
      for (let k = a0; k < a0 + N; k++) { const c = corr[k]; if (c) C[k % N][j].add(c.setY(0)); }
    }
    return C;
  }
  function pasChasse(M, src, P) {
    const sc = M.gltf.scene, b = (n) => sc.getObjectByName('mixamorig' + n) || sc.getObjectByName('mixamorig:' + n), hips = b('Hips'), F = [b('LeftFoot'), b('RightFoot')], T = [b('LeftToeBase'), b('RightToeBase')], gb = M.clips.Garde_Basse;
    if (!src || !hips || !F[0] || !F[1] || !T[0] || !T[1] || !gb || !M.semelle) return null;
    const W = (o) => o.getWorldPosition(new THREE.Vector3()), kk = RAW_H / HEIGHT, N = Math.max(4, Math.round(src.duration * 30)), sm = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
    // pose de repos : semelle de chaque pied dans le repère (orientation) du pied, hauteur du sol
    let mx = new THREE.AnimationMixer(sc); mx.clipAction(gb).play(); mx.setTime(0); sc.updateMatrixWorld(true);
    const RV = [0, 1].map(j => { const ft = F[j], to = T[j], S = M.semelle[j], A0 = W(ft), qi = ft.getWorldQuaternion(new THREE.Quaternion()).invert();
      const pw = [S.talon.clone().applyMatrix4(ft.matrixWorld), S.bout.clone().applyMatrix4(to.matrixWorld), S.plante.clone().applyMatrix4(to.matrixWorld)].concat((S.pts || []).map(o => o.p.clone().applyMatrix4(o.o ? to.matrixWorld : ft.matrixWorld)));
      return { sol: Math.min(...pw.map(p => p.y)), pts: pw.map(p => p.sub(A0).applyQuaternion(qi)) }; });
    mx.stopAllAction(); mx.uncacheRoot(sc);
    // cycle d'origine : bassin, chevilles
    mx = new THREE.AnimationMixer(sc); mx.clipAction(src).play(); const ech = []; let hy = 0;
    for (let i = 0; i < N; i++) { mx.setTime(i / N * src.duration); sc.updateMatrixWorld(true); const H = W(hips); ech.push([H, F.map(W)]); hy += H.y / N; }
    mx.stopAllAction(); mx.uncacheRoot(sc); sc.updateMatrixWorld(true);
    const rel = (n, j) => { const e = ech[(n + N) % N]; return new THREE.Vector3(e[1][j].x - e[0].x, 0, e[1][j].z - e[0].z); };
    // (vitesse d'appui : celle du pied le plus LENT par rapport au bassin à chaque image — le pied d'appui recule à la vitesse du
    // corps, celui qui se déplace va 2 à 3 fois plus vite ; « le plus bas » ne marche pas ici, une semelle reste enfoncée)
    // (puis, la direction du déplacement connue, le pied qui recule le plus vite le long de celle-ci : en fin d'oscillation, le pied
    // levé est un instant plus lent que celui d'appui)
    const vSt = new THREE.Vector3(); for (let n = 0; n < N; n++) { const v = [0, 1].map(j => rel(n + 1, j).sub(rel(n - 1, j))); vSt.sub(v[0].length() < v[1].length() ? v[0] : v[1]); }
    { const d0 = vSt.clone().normalize(); vSt.set(0, 0, 0); for (let n = 0; n < N; n++) { const v = [0, 1].map(j => rel(n + 1, j).sub(rel(n - 1, j))); vSt.sub(v[0].dot(d0) < v[1].dot(d0) ? v[0] : v[1]); } } vSt.divideScalar(N);
    const vS = Math.max(1e-4, vSt.length()), UP = new THREE.Vector3(0, 1, 0);
    const vM0 = (i, j) => rel(i + 1, j).sub(rel(i - 1, j)).add(vSt).length();
    const AN = P.ancre ? ancrer(rel, N, vSt.clone().multiplyScalar(0.5), (i, j) => vM0(i, j) < 0.6 * vS) : null;
    // (vitesse dans le monde APRÈS ancrage : un appui ancré est immobile, la garde au sol ne s'applique qu'au pied qui bouge)
    if (root.DBG_CHASSE) M._dbgChasse = { N, vSt: vSt.clone(), vS, src: [0, 1].map(j => Array.from({ length: N }, (_, i) => rel(i, j))), AN, flags: [0, 1].map(j => Array.from({ length: N }, (_, i) => vM0(i, j) < 0.6 * vS)) };
    const vMonde = AN ? (i, j) => AN[(i + 1) % N][j].clone().sub(AN[(i - 1 + N) % N][j]).add(vSt).setY(0).length() : vM0;
    const c = jambesIK(M, src, src.name, (i, H, A, Aq) => {
      const out = A.map(a => a.clone());
      if (AN) out.forEach((o, j) => { o.x = ech[i][0].x + AN[i][j].x; o.z = ech[i][0].z + AN[i][j].z; });
      A.forEach((a, j) => {
        // lacet du pied borné (repère du modèle : +Z = vers la cible)
        if (P.lacet !== undefined) { const ax = M.semelle[j].axe.clone().applyQuaternion(Aq[j]); if (Math.hypot(ax.x, ax.z) > 1e-5) { const yw = Math.atan2(ax.x, ax.z), d = Math.max(-P.lacet, Math.min(P.lacet, yw)) - yw; if (Math.abs(d) > 1e-4) Aq[j] = new THREE.Quaternion().setFromAxisAngle(UP, d).multiply(Aq[j]); } }
        // garde au sol : au sol en appui, P.clr dès que le pied bouge dans le monde
        const w = sm((vMonde(i, j) - 0.3 * vS) / (0.5 * vS));
        let m = 1e9; for (const p of RV[j].pts) m = Math.min(m, p.clone().applyQuaternion(Aq[j]).y); m += out[j].y;
        out[j].y += RV[j].sol + P.clr * kk * w - m;
      });
      return out; }, (i) => (P.bob - 1) * (ech[i][0].y - hy) + (P.haut || 0) * kk, !!P.libre, undefined, P.bassin ? () => P.bassin : null);
    // vitesse et direction du déplacement (m/s jeu, rad : 0 = devant, > 0 = vers la gauche) : celles de l'appui
    if (c && !P.sansVit) c.userData = Object.assign(c.userData || {}, { vitCuite: vS / (2 * src.duration / N) * HEIGHT / RAW_H, dirCuite: Math.atan2(vSt.x, vSt.z) });
    return c;
  }
  // Pas chassé « joint » (lent) : cycle généré, aucune capture ne l'a. Le pied du côté où l'on va s'écarte (vol de PAS.vol du
  // cycle), puis l'autre le rejoint jusqu'à la base PAS.base (m, chevilles) : jamais croisés, jamais à moins de PAS.base ; pieds
  // immobiles au sol en appui (aucun glissement par construction), levés de PAS.lev (m) en l'air, orientation fixe (pointes
  // vers la menace, ouvertes) ; bassin face à la cible, abaissé de PAS.bas (genoux fléchis, base athlétique), petit rebond.
  // Cadence naturelle PAS.cad pas/s pour PAS.D m par cycle (deux pas). Va vers la DROITE du soldat (−X), comme « Pas_Gauche ».
  function pasJoint(M, P, sens) {   // sens : −1 vers la droite (−X), +1 vers la gauche
    const sc = M.gltf.scene, b = (n) => sc.getObjectByName('mixamorig' + n) || sc.getObjectByName('mixamorig:' + n), hips = b('Hips'), F = [b('LeftFoot'), b('RightFoot')], gb = M.clips.Garde_Basse;
    if (!gb || !hips || !F[0] || !F[1]) return null;
    const kk = RAW_H / HEIGHT, T = 2 / P.cad, W = (o) => o.getWorldPosition(new THREE.Vector3());
    const src = new THREE.AnimationClip('Pas_Joint', T, gb.tracks.filter(t => JAMBES.test(t.name)).map(t => { const n = t.getValueSize(), v0 = Array.from(t.values.slice(0, n)); return new t.constructor(t.name, [0, T], v0.concat(v0)); }));
    const mx = new THREE.AnimationMixer(sc); mx.clipAction(src).play(); mx.setTime(0); sc.updateMatrixWorld(true);
    const H0 = W(hips), A0 = F.map(W), Q0 = F.map(f => f.getWorldQuaternion(new THREE.Quaternion())); mx.stopAllAction(); mx.uncacheRoot(sc); sc.updateMatrixWorld(true);
    const sm = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }, D = P.D * kk, Wb = P.base * kk;
    // position (monde, x) de chaque pied le long du cycle ; corps à vitesse constante −D/cycle ; pied droit (j = 1) en premier
    const vol = (u, a) => { const x = (u - a) / P.vol; return x <= 0 ? [0, 0] : x >= 1 ? [1, 0] : [sm(x), Math.sin(Math.PI * x)]; };
    const mene = sens < 0 ? 1 : 0;   // pied du côté où l'on va : il part le premier
    const pied = (u, j) => { const [s, h] = vol(u, j === mene ? 0 : 0.5); return [sens * D * s, h]; };   // déplacement depuis la pose de début de cycle
    // milieu des pieds sur le cycle (pour centrer le bassin) : droit en −D·s, gauche idem un demi-cycle plus tard
    let mo = 0; const NN = 60; for (let i = 0; i < NN; i++) { const u = i / NN; mo += ((pied(u, 0)[0] + pied(u, 1)[0]) / 2 - sens * D * u) / NN; }
    const N = Math.max(4, Math.round(T * 30)), q = [0, 1].map(j => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (j ? -1 : 1) * P.lacet[j === mene ? 1 : 0]).multiply(Q0[j]));
    const c = jambesIK(M, src, 'Pas_Joint', (i, H, A, Aq) => { const u = i / N;
      return [0, 1].map(j => { const [dx, h] = pied(u, j), x = H.x - mo + dx - sens * D * u + (j ? -Wb / 2 : Wb / 2), z = H.z + (j ? -P.decal : P.decal) * kk;
        Aq[j] = q[j].clone(); return new THREE.Vector3(x, A0[j].y + h * P.lev * kk, z); }); },
      (i) => { const u = i / N; return -P.bas * kk - P.bob * kk * (0.5 - 0.5 * Math.cos(4 * Math.PI * u)); }, false, undefined);
    if (c) c.userData = Object.assign(c.userData || {}, { vitCuite: P.D / T, dirCuite: sens * Math.PI / 2 });
    return c;
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
        if (len > 1e-4 && h > 1e-4) { const y1 = Math.max(-len * 0.98, tR - 0.004 * k - AY), h1 = Math.sqrt(len * len - y1 * y1), f1 = new THREE.Vector3(fv.x / h * h1, y1, fv.z / h * h1);
          Aq[r] = new THREE.Quaternion().setFromUnitVectors(fv.clone().normalize(), f1.normalize()).multiply(Aq[r]); } }
      // pied avant : posé à plat (on le descend de ce qu'il flotte)
      { const T = W(L[f][3]), fl = Math.min(T.y - tR, A[f].y - GENOU.chevilleAv * k); if (fl > 0) out[f].y -= fl; }
      return out; }, () => -GENOU.baisse * k, true);
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
      // (sommets du pied seulement : sous la cheville, à moins de 30 cm de la cheville ou des orteils ; un sommet parasite
      // loin du pied — maillage HD — donnait une « semelle » 80 cm sous le pied et sol() levait la jambe à l'horizontale)
      const pied = pts.filter(p => p.y < A.y && (p.distanceTo(A) < 0.3 || p.distanceTo(T) < 0.3)); if (pied.length < 3) return;
      const ym = Math.min(...pied.map(p => p.y)), proches = pied.filter(p => p.y < ym + 0.03);
      if (proches.length < 3 || T.y - ym < -0.01 || T.y - ym > 0.12 || A.y - ym < 0.03 || A.y - ym > 0.25) return;
      let talon = proches[0], bout = proches[0]; for (const p of proches) { if (p.z < talon.z) talon = p; if (p.z > bout.z) bout = p; }
      const loc = (o, p) => o.worldToLocal(p.clone());
      // profil de la semelle : le sommet le plus bas de chaque tranche de 2 cm du talon à la pointe (dans le repère du pied
      // ou des orteils selon qu'il est derrière ou devant l'articulation) ; c'est le plus bas de TOUS qui touche le sol quand
      // le pied bascule (attaque du talon, déroulé sur la pointe)
      const z0 = Math.min(...pied.map(p => p.z)), z1 = Math.max(...pied.map(p => p.z)), prof = [];
      for (let z = z0; z < z1; z += 0.02) { let m = null; for (const p of pied) if (p.z >= z && p.z < z + 0.02 && p.y < A.y - 0.04 && (!m || p.y < m.y)) m = p; if (m) prof.push(m.z < T.z - 0.01 ? { o: 0, p: loc(ft, m) } : { o: 1, p: loc(toe, m) }); }
      // axe du pied : direction principale (ACP dans le plan du sol) des sommets de la semelle, orientée vers l'avant
      const sem = pied.filter(p => p.y < ym + 0.05); let mx = 0, mz = 0; sem.forEach(p => { mx += p.x; mz += p.z; }); mx /= sem.length; mz /= sem.length;
      let cxx = 0, cxz = 0, czz = 0; sem.forEach(p => { const dx = p.x - mx, dz = p.z - mz; cxx += dx * dx; cxz += dx * dz; czz += dz * dz; });
      const th = 0.5 * Math.atan2(2 * cxz, cxx - czz); let ax = Math.cos(th), az = Math.sin(th); if (az < 0) { ax = -ax; az = -az; }
      const axW = new THREE.Vector3(ax, 0, az), c0 = new THREE.Vector3(mx, ym, mz);
      out[j] = { axe: loc(ft, c0.clone().add(axW)).sub(loc(ft, c0)), axeRepos: Math.atan2(ax, az), talon: loc(ft, talon), plante: loc(toe, new THREE.Vector3(T.x, ym, T.z)), bout: loc(toe, bout), pts: prof, sol0: ym * HEIGHT / RAW_H };
    });
    mx.stopAllAction(); mx.uncacheRoot(sc); sc.updateMatrixWorld(true);
    if (out[0] && out[1]) M.semelle = out;
  }
  function resserre(M, src, cible) {
    const sc = M.gltf.scene, b = (n) => sc.getObjectByName('mixamorig' + n) || sc.getObjectByName('mixamorig:' + n), hips = b('Hips'), F = [b('LeftFoot'), b('RightFoot')];
    if (!hips || !F[0] || !F[1]) return null;
    const mx = new THREE.AnimationMixer(sc); mx.clipAction(src).play(); const N = 30; let m = [0, 0];
    for (let i = 0; i < N; i++) { mx.setTime(i / N * src.duration); sc.updateMatrixWorld(true); const hx = hips.getWorldPosition(new THREE.Vector3()).x; F.forEach((f, j) => { m[j] += (f.getWorldPosition(new THREE.Vector3()).x - hx) / N; }); }
    mx.stopAllAction(); mx.uncacheRoot(sc); sc.updateMatrixWorld(true);
    const sep = m[0] - m[1], k = RAW_H / HEIGHT, red = Math.max(0, sep - cible * k) / 2; if (red < 0.005) return null;
    const c = jambesIK(M, src, src.name, (i, H, A) => A.map((a, j) => a.clone().setX(a.x - Math.sign(m[j]) * red)), null, false, OUV_PIED);
    return c;
  }
  // miroir gauche ↔ droite d'un clip de jambes (repères gauche / droite du squelette Mixamo symétriques : q → (x, −y, −z, w))
  function miroir(c, nom) {
    const out = new THREE.AnimationClip(nom, c.duration, c.tracks.filter(t => JAMBES.test(t.name)).map(t => t.clone()));
    for (const t of out.tracks) { t.name = t.name.replace(/Left|Right/g, (w) => (w === 'Left' ? 'Right' : 'Left')); const v = t.values;
      if (/quaternion$/.test(t.name)) for (let i = 0; i < v.length; i += 4) { v[i + 1] = -v[i + 1]; v[i + 2] = -v[i + 2]; }
      else if (/position$/.test(t.name)) for (let i = 0; i < v.length; i += 3) v[i] = -v[i]; }
    return out;
  }
  function directions(M) {
    const G = M.clips.Walk_Left_with_Gun, B = M.clips.Walk_Backward_with_Gun; if (!G || !B) return;
    try { semelle(M); } catch (e) { console.warn('soldat 3D (semelle) :', e); }   // (d'abord : les cycles cuits s'en servent)
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
    { const PC = Object.assign({}, CHASSE, CHASSE_MOD[M.nom] || {}, root.CHASSE_TEST || {}); if (PC.actif) { const c = pasChasse(M, M.clips.Pas_Gauche, PC); if (c) { c.name = 'Pas_Gauche'; M.clips.Pas_Gauche = c; M.chasseErr = c.userData.err; } } }
    const D = legs(M.clips.Pas_Gauche, 'Pas_Droite');   // (celui dont le bassin a été remonté)
    for (const t of D.tracks) {
      t.name = t.name.replace(/Left|Right/g, (w) => (w === 'Left' ? 'Right' : 'Left'));
      const v = t.values;
      if (/quaternion$/.test(t.name)) for (let i = 0; i < v.length; i += 4) { v[i + 1] = -v[i + 1]; v[i + 2] = -v[i + 2]; }
      else if (/position$/.test(t.name)) for (let i = 0; i < v.length; i += 3) v[i] = -v[i];
    }
    M.clips.Pas_Droite = D; if (M.clips.Pas_Gauche.userData && M.clips.Pas_Gauche.userData.vitCuite) D.userData = { vitCuite: M.clips.Pas_Gauche.userData.vitCuite, dirCuite: -M.clips.Pas_Gauche.userData.dirCuite };
    // pas chassé joint (lent, voir pasJoint) : vers la droite, et son miroir vers la gauche
    { const PJ = Object.assign({}, PAS, root.PAS_TEST || {}); if (PJ.actif) { for (const [n, sens] of [['Pas_Joint_D', -1], ['Pas_Joint_G', 1]]) { const c = pasJoint(M, PJ, sens); if (c) { c.name = n; M.clips[n] = c; } } } }   // (généré dans chaque sens : le miroir déformait la botte droite de « gign », squelette pas tout à fait symétrique)
    // recul en visant (la simulation l'autorise jusqu'à 1,8 m/s) : la marche arrière de la bibliothèque a une foulée de ~0,8 m,
    // il fallait la jouer 2 fois trop vite (257 pas/min). Foulée allongée (× RECUL) : ~170 pas/min à 1,7 m/s, bassin un peu
    // plus bas (jambes plus écartées d'avant en arrière)
    // (talon 26 → 10 cm, rebond 5,2 → 2,1 cm, genou à la pose 56-73° → 34-43° : levée non amplifiée — hs 1 et non 1,5 —,
    // plafonnée, pied en l'air dessiné, bassin remonté de 4 cm ; puis 6 cm : recul rapide, genou à la pose 51 → 44° / 44 → 37°)
    { const RA = Object.assign({ hs: 1, kp: 1, P: { cap: 0.07, bas: -0.06, bob: 0.4, vol: { h0: 0.02, h1: 0.05, tb: 0.3, tf: -0.1, zb: -0.25, zf: 0.2, clr: 0.03 } } }, root.RECUL_TEST || {});
      if (M.clips.Pas_Arriere) { const r = foulee(M, M.clips.Pas_Arriere, 'Pas_Arriere', RECUL, RA.hs, 0.6, RA.kp, OUV_PIED, RA.P); if (r) M.clips.Pas_Arriere = r; } }
    M.clips.Pas_Avant_Aim = legs(M.clips.Walk_Fight_Forward, 'Pas_Avant_Aim');
    M.clips.Pas_Avant_Low = legs(M.clips.Walking || M.clips.Walk_Fight_Forward, 'Pas_Avant_Low');
    // course (petites foulées, ~1,5 à 3 m/s) : mêmes pas chassés / marche arrière, mais la marche avant est la course de
    // « Run_and_Shoot » (jambes de Run_Low aussi) ; hauts du corps de la course (visée ou garde basse qui balance)
    M.clips.Pas_Avant_Course = legs(M.clips.Run_and_Shoot, 'Pas_Avant_Course');
    // patrouille (pas d'ennemi connu) : marche → petite course → course, mélangées selon la vitesse (voir marche())
    const TR = Object.assign({}, TROT, root.TROT_TEST || {});
    if (M.clips.Running) { const t = foulee(M, M.clips.Running, 'Pas_Trot', TR.s, TR.hs, TR.rise, undefined, OUV_PIED, Object.assign({ cap: TR.cap }, TR.foulee || {})); if (t) { M.clips.Pas_Trot = t; M.trotErr = t.userData.err; } M.clips.Pas_Run = legs(M.clips.Running, 'Pas_Run');
      // (la course pleine refaite comme la petite course — foulée entière, talon et pied en l'air dessinés — : brute, son talon
      // montait à 33-50 cm, visible dès qu'elle se mélange à la petite course)
      if (RUN_BAKE) { const RB = Object.assign({ s: 1.1, hs: TR.hs, P: { pmax: 0.35 } }, RUN_BAKE === true ? {} : RUN_BAKE), r = foulee(M, M.clips.Running, 'Pas_Run', RB.s, RB.hs, TR.rise, undefined, OUV_PIED, Object.assign({ cap: TR.cap }, TR.foulee || {}, RB.P || {})); if (r) M.clips.Pas_Run = r; } }
    // course épaulée (Run_and_Shoot, > 2,2-2,45 m/s en visant) refaite de même : brute, pied d'appui glissant de 0,22 m/s,
    // patinage 0,23-0,52, talon 26 cm, genou à 65° à la pose
    if (COURSE_BAKE && M.clips.Run_and_Shoot) { const CB = Object.assign({ s: 1, hs: TR.hs, P: { pmax: 0.35 } }, COURSE_BAKE === true ? {} : COURSE_BAKE), r = foulee(M, M.clips.Run_and_Shoot, 'Pas_Avant_Course', CB.s, CB.hs, TR.rise, undefined, OUV_PIED, Object.assign({ cap: TR.cap }, TR.foulee || {}, CB.P || {})); if (r) M.clips.Pas_Avant_Course = r; }
    // marche en visant (« Pas_Glisse ») : la marche naturelle, bassin abaissé de GLISSE m (genoux fléchis, pieds aux mêmes
    // places) : la marche « glissée » d'un tireur qui progresse arme épaulée (talon-pointe, buste stable), au lieu du pas
    // d'affût très lent de Walk_Fight_Forward ou de la course accroupie de Run_and_Shoot
    // (référence vidéo réelle : base large ~32 cm entre chevilles, pied d'appel bas ~10-12 cm, genoux fléchis tout le pas,
    // bassin plat — rebond ≤ 3 cm ; pas un peu plus courts et plus vifs que la marche normale)
    const GP = Object.assign({}, GLISSE_P, root.GLISSE_TEST || {});   // (GLISSE_TEST : réglage depuis les pages d'outils)
    if (M.clips.Walking) { biaisGenou = GP.genouOut || 0; try { const g = foulee(M, M.clips.Walking, 'Pas_Glisse', GP.s, 1, 0, GP.kp !== undefined ? GP.kp : 1, OUV_PIED, GP); if (g) M.clips.Pas_Glisse = g; } finally { biaisGenou = 0; } }
    // pas moins écartés (les marches de la bibliothèque posent les chevilles à ~27 cm l'une de l'autre, une démarche en
    // « cow-boy » ; marche humaine : 8 à 17 cm, base tactique un peu plus large) : écart moyen ramené à ECART_PAS
    { const PP = root.PATROUILLE_TEST || PATROUILLE; let fait = false;
      if (PP && M.clips.Walking) { const c = foulee(M, M.clips.Walking, 'Pas_Avant_Low', PP.s || 1, 1, 0, 1, OUV_PIED, PP); if (c) { M.clips.Pas_Avant_Low = c; fait = true; } }
      if (!fait) for (const n of ['Pas_Avant_Low']) if (M.clips[n]) { const c = resserre(M, M.clips[n], ECART_PAS); if (c) M.clips[n] = c; } }
    // genoux jamais « en arrière » (voir jambesIK) dans les cycles qui ne sont pas déjà passés par l'IK
    const chasseCuit = !!Object.assign({}, CHASSE, root.CHASSE_TEST || {}).actif;   // (pas chassés déjà cuits par pasChasse)
    for (const n of ['Pas_Avant_Low', 'Pas_Run', 'Pas_Gauche', 'Pas_Droite', 'Pas_Avant_Aim', 'Pas_Avant_Course']) if (M.clips[n] && !(chasseCuit && /^Pas_(Gauche|Droite)$/.test(n))) { const c = jambesIK(M, M.clips[n], n, (i, H, A) => A.map(a => a.clone()), null, false, /^Pas_(Gauche|Droite)$/.test(n) ? undefined : OUV_PIED); if (c) M.clips[n] = c; }
    // pieds au sol (pointe la plus basse du cycle à sa hauteur de repos)
    { const sc = M.gltf.scene, gb = M.clips.Garde_Basse, T = ['LeftToeBase', 'RightToeBase'].map(n => sc.getObjectByName('mixamorig' + n) || sc.getObjectByName('mixamorig:' + n));
      if (gb && T[0] && T[1]) { const mx = new THREE.AnimationMixer(sc); mx.clipAction(gb).play(); mx.setTime(0); sc.updateMatrixWorld(true); const repos = Math.min(...T.map(t => t.getWorldPosition(new THREE.Vector3()).y)); M.toeR = repos * HEIGHT / RAW_H; { const fa = ['LeftFoot', 'RightFoot'].map(n => sc.getObjectByName('mixamorig' + n) || sc.getObjectByName('mixamorig:' + n)); if (fa[0] && fa[1]) M.ankR = Math.min(...fa.map(t => t.getWorldPosition(new THREE.Vector3()).y)) * HEIGHT / RAW_H; } mx.stopAllAction(); mx.uncacheRoot(sc); sc.updateMatrixWorld(true);
        M.solDy = {}; for (const n of ['Pas_Avant_Low', 'Pas_Avant_Aim', 'Pas_Avant_Course', 'Pas_Trot', 'Pas_Run', 'Pas_Glisse', 'Pas_Gauche', 'Pas_Droite', 'Pas_Arriere']) if (M.clips[n] && !(chasseCuit && /^Pas_(Gauche|Droite)$/.test(n))) M.solDy[n] = +aterrir(M, M.clips[n], repos).toFixed(3); } }
    for (const n of ['Walk_Aim', 'Walk_Low', 'Run_and_Shoot', 'Run_Low', 'Trot_Low']) { const c = M.clips[n]; if (c) { M.clips[n + '_Haut'] = new THREE.AnimationClip(n + '_Haut', c.duration, c.tracks.filter(t => !JAMBES.test(t.name)).map(t => t.clone())); } }
    if (M.yawFix.Walk_Aim !== undefined) M.yawFix.Walk_Aim_Haut = M.yawFix.Walk_Aim;
    try { genou(M); } catch (e) { console.warn('soldat 3D (genou) :', e); }
    // marche accroupie : mêmes contraintes de pied (botte rigide, cheville jamais cassée, pieds ouverts) cuites dans le cycle
    { const cw = M.clips.Cautious_Crouch_Walk_Forward; if (cw) { const c = jambesIK(M, cw, cw.name, (i, H, A) => A.map(a => a.clone()), null, false, OUV_PIED);
      if (c) { const noms = new Set(c.tracks.map(t => t.name)); M.clips.Cautious_Crouch_Walk_Forward = new THREE.AnimationClip(cw.name, cw.duration, cw.tracks.filter(t => !noms.has(t.name)).concat(c.tracks)); } } }
    // Bottes rigides PARTOUT (signalé par la revue : « bottes banane ») : dans toutes les animations de la bibliothèque, l'os des
    // orteils est tourné de 80 à 100° par rapport à la pose de repos (mesuré, même dans la visée à l'arrêt et le rechargement) :
    // avant de la botte plié, tordu, botte raccourcie de 10 à 29 %. Les marches encore jouées telles quelles (rechargement en
    // marchant, course épaulée rapide) passent par l'IK cuite (orteils qui ne plient qu'au déroulé, cheville bornée, genou dans
    // son plan) ; dans toutes les autres, les orteils sont figés à la pose de repos.
    for (const n of ['Walk_Jambes', 'Run_Jambes', 'Walk_Aim', 'Walk_Low', 'Run_Low', 'Run_and_Shoot']) { const c0 = M.clips[n]; if (!c0) continue;
      const c = jambesIK(M, c0, n, (i, H, A) => A.map(a => a.clone()), null, false, OUV_PIED);
      if (c) { const noms = new Set(c.tracks.map(t => t.name)); M.clips[n] = new THREE.AnimationClip(n, c0.duration, c0.tracks.filter(t => !noms.has(t.name)).concat(c.tracks)); } }
    { const RP = reposPieds(M), noms = ['Left', 'Right'].map(c => { const o = M.gltf.scene.getObjectByName('mixamorig' + c + 'ToeBase') || M.gltf.scene.getObjectByName('mixamorig:' + c + 'ToeBase'); return o && THREE.PropertyBinding.sanitizeNodeName(o.name) + '.quaternion'; });
      if (RP) for (const n in M.clips) { const c = M.clips[n];
        c.tracks = c.tracks.map(t => { const j = noms.indexOf(t.name); if (j < 0) return t; const q0 = RP.orteil[j], q = new THREE.Quaternion(); let mx = 0;
          for (let i = 0; i < t.values.length; i += 4) { q.fromArray(t.values, i); mx = Math.max(mx, 1 - Math.abs(q.dot(q0))); }
          if (mx < 0.035) return t;   // (cycles cuits : orteils déjà au repos, pliés au déroulé seulement — moins de ~30°)
          const v = q0.toArray(); return new THREE.QuaternionKeyframeTrack(t.name, [0, c.duration], v.concat(v)); }); } }
    M.dirs = true;
  }
  // Vitesse « naturelle » de chaque cycle de locomotion (m/s, pour un soldat de 1,80 m) : pendant l'appui, le pied recule
  // par rapport au bassin à la vitesse du sol. Le jeu lit l'animation à (vitesse réelle / vitesse naturelle) : plus de pieds
  // qui glissent. Mesurée sur les pieds, car les animations Meshy n'ont pas de déplacement de racine fiable.
  const LOCOS = ['Walk_Fight_Forward', 'Walk_Aim', 'Walk_Low', 'Run_and_Shoot', 'Run_Low', 'Cautious_Crouch_Walk_Forward', 'Walking', 'Running', 'Pas_Avant_Aim', 'Pas_Avant_Low', 'Pas_Avant_Course', 'Pas_Gauche', 'Pas_Droite', 'Pas_Arriere', 'Pas_Trot', 'Pas_Run', 'Trot_Low', 'Pas_Glisse', 'Pas_Joint_D', 'Pas_Joint_G'];
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
      // (cycle cuit qui connaît sa vitesse de déplacement — pas chassé refait, pieds levés : la détection d'appui par la hauteur
      // des orteils s'y trompait, jusqu'à inverser la direction mesurée)
      if (c.userData && c.userData.vitCuite) { M.loco[clip] = c.userData.vitCuite; M.dirPas[clip] = c.userData.dirCuite; }
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
    for (const av of ['Pas_Avant_Aim', 'Pas_Avant_Low', 'Pas_Avant_Course', 'Pas_Trot', 'Pas_Glisse']) for (const cote of ['Pas_Gauche', 'Pas_Droite', 'Pas_Joint_D', 'Pas_Joint_G']) {
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
    { n: 'puits', c: [-0.002, -0.025, -0.012], h: [0.027, 0.026, 0.062], r: 0.008 },
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
    R: { A: [0.303, 0.024, 0.953], N: [0.87, 0.401, -0.287], mcp: [-0.044, -0.049, -0.127],
      // cibles du bout des doigts (index : tendu le long de la carcasse, au-dessus du pontet ; pouce : flanc gauche, sous la carcasse)
      cibles: { 0: { ferme: [0.6, 1, 0.8], max: [1.2, 1.3, 1.2] }, 1: { p: [-0.043, 0.008, 0], auto: true, f1: [-0.45, 0.8], f2: 0.3, reg: 0.03, ecart: 0.5 } },
      detente: { p: [-0.004, -0.014, -0.088], f1: [-0.15, 1.4], f2: 1.6 } },
    L: { A: [-0.816, 0.149, 0.559], N: [0.106, 0.988, -0.109], mcp: [-0.036, 0.002, 0.174],
      cibles: { 0: { p: [0.04, 0.07, 0.2], f1: [-0.15, 1.2], f2: 1.0 } } },
    // places propres à un modèle (mêmes champs, remplacent ceux du dessus) : les mains n'ont pas la même forme
    // (soldat, main d'appui : refermés jusqu'au contact, l'index et l'annulaire s'arrêtaient tôt, bout ~2 cm AU-DESSUS du
    // garde-main ; ils sont posés sur son flanc droit, ~2,5 cm sous le dessus, au contact)
    soldat: { L: { A: [-0.885, 0.06, 0.462], N: [0.225, 0.923, 0.311], mcp: [-0.042, 0.04, 0.154],
      cibles: { 0: { p: [0.04, 0.07, 0.2], f1: [-0.15, 1.2], f2: 1.0 }, 1: { f1: [-0.15, 1.5], f2: 1.7, reg: 0.01, ecart: 0.2, flanc: [-0.039, 0.08], contact: 1 }, 3: { f1: [-0.15, 1.5], f2: 1.7, reg: 0.01, ecart: 0.2, flanc: [-0.039, 0.08], contact: 1 } } } },
    gign: { R: { A: [0.008, 0.261, 0.965], N: [1, 0.027, -0.015], mcp: [-0.04, -0.039, -0.131] }, L: { A: [-0.88, 0.12, 0.459], N: [0.274, 0.918, 0.286], mcp: [-0.048, 0.044, 0.14] } },
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
        // chaque articulation se ferme tant que la partie du doigt qui la suit n'entre pas dans l'arme (plus de 2 mm, ou plus
        // profond qu'avant le pas) : un doigt déjà au contact à plat continue de s'enrouler sans traverser
        const th = [0, 0, 0, 0];
        for (let it = 0; it < 150; it++) { let bouge = false;
          for (let j = 0; j < 3; j++) { if (th[j] >= max[j]) continue;
            const d0 = Math.min(...dSeg(k, th).slice(j)), t2 = th.slice(); t2[j] = Math.min(max[j], th[j] + vit[j] * 0.025); const d1 = Math.min(...dSeg(k, t2).slice(j));
            if (d1 > -0.002 || d1 >= d0 - 1e-5) { th[j] = t2[j]; bouge = true; } }
          if (!bouge) break; }
        return th;
      };
      // 2b. bout du doigt (articulation du bout) amené au point « cible » sans entrer dans l'arme : recherche en grille puis
      // descente par coordonnées sur [flexion 1, 2, 3, écartement]
      const cibler = (k, cible, o) => {
        const C = cible ? new THREE.Vector3().fromArray(cible) : new THREE.Vector3();
        if (o.auto) {   // index tendu : bout droit devant sa base, le long du flanc de la carcasse, au-dessus du pontet
          const m0 = fk(k, [0, 0, 0, 0]), base = V().setFromMatrixPosition(m0[0]), Lf = V().setFromMatrixPosition(m0[1]).distanceTo(base) + V().setFromMatrixPosition(m0[2]).distanceTo(V().setFromMatrixPosition(m0[1])) + p.copy(bout[k]).applyMatrix4(m0[2]).distanceTo(V().setFromMatrixPosition(m0[2]));
          C.set(cible[0], Math.max(cible[1], base.y + 0.004), base.z + Math.sqrt(Math.max(0, Lf * Lf * 0.94 - (cible[0] - base.x) ** 2))); o.pAuto = C.toArray(); }
        else if (o.flanc) {   // doigt d'appui : bout posé sur le flanc droit du garde-main (x, y), à la hauteur (z) de sa base
          const base = V().setFromMatrixPosition(fk(k, [0, 0, 0, 0])[0]); C.set(o.flanc[0], o.flanc[1], base.z + (o.flanc[2] || 0)); o.pAuto = C.toArray(); }
        const cout = (th) => { const ms = fk(k, th), ds = dSeg(k, th, ms), d = Math.min(...ds);
          return p.copy(bout[k]).applyMatrix4(ms[2]).distanceTo(C) + 6 * Math.max(0, -d - 0.002) + (o.contact || 0) * Math.max(0, Math.min(ds[1], ds[2]) - 0.003) + (o.reg || 0.004) * (Math.abs(th[1]) + Math.abs(th[2])) + 0.004 * Math.abs(th[3]); };
        let best = null;
        for (let a = o.f1[0]; a <= o.f1[1]; a += 0.1) for (let e = -(o.ecart || 0.35); e <= (o.ecart || 0.35); e += 0.07) for (let c = 0; c <= o.f2; c += 0.12) { const th = [a, c, c * 0.8, e], v = cout(th); if (!best || v < best[0]) best = [v, th]; }
        let th = best[1], v = best[0];
        for (const st of [0.05, 0.02, 0.008]) for (let it = 0; it < 12; it++) { let mieux = false; for (let i = 0; i < 4; i++) for (const sg of [-1, 1]) { const t2 = th.slice(); t2[i] += sg * st; if (i === 0 && t2[i] < (o.f1[0] < -0.15 ? o.f1[0] : -0.15) || i === 1 && t2[i] < 0 || i === 2 && t2[i] < 0 || i === 3 && Math.abs(t2[i]) > (o.ecart || 0.35)) continue; const v2 = cout(t2); if (v2 < v) { v = v2; th = t2; mieux = true; } } if (!mieux) break; }
        return th;
      };
      const R = side === 'Right', res = { Hrel, glisse, N, ordre: ordre.map(c => chaines[c][0].name), doigts: [], dmin: [], err: [] };
      const quats = (k, th) => os[k].map((o, j) => qLoc(k, j, th));
      os.forEach((o3, k) => {
        const c = Pc.cibles && Pc.cibles[k];
        const th = c && c.ferme ? fermer(k, c.ferme, c.max) : c ? cibler(k, c.p, c) : fermer(k, [1, 1.15, 0.85], [1.6, 1.9, 1.4]);
        res.doigts.push(o3.map((o, j) => [o.b.name, qLoc(k, j, th)])); (res.th || (res.th = [])).push(th);
        res.dmin.push(+(dmin(k, th) * 100).toFixed(2));
        if (c && c.p) res.err.push(+(p.copy(bout[k]).applyMatrix4(fk(k, th)[2]).distanceTo(new THREE.Vector3().fromArray(c.pAuto || c.p)) * 100).toFixed(2));
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
  // Visière relevée du casque GIGN : deux pivots sombres sur les côtés (le modèle Meshy n'a pas de charnière), enfants de l'os
  // de la tête ; posés dans l'espace du maillage (m) puis ramenés dans le repère de l'os (inverse de liaison × bindMatrix)
  let CHAR = null;
  function charnieres(sk) {
    const i = sk.skeleton.bones.findIndex(b => b.name === 'mixamorig:Head' || b.name === 'mixamorigHead'); if (i < 0) return;
    if (!CHAR) { const g = new THREE.CylinderGeometry(0.014, 0.014, 0.012, 14); g.rotateZ(Math.PI / 2); CHAR = { g, m: new THREE.MeshStandardMaterial({ color: 0x16191e, roughness: 0.45, metalness: 0.4 }) }; }
    const L = new THREE.Matrix4().multiplyMatrices(sk.skeleton.boneInverses[i], sk.bindMatrix);
    for (const x of [0.121, -0.125]) {
      const c = new THREE.Mesh(CHAR.g, CHAR.m); c.name = 'charniereVisiere';
      c.applyMatrix4(new THREE.Matrix4().multiplyMatrices(L, new THREE.Matrix4().makeTranslation(x, 1.592, 0.052)));
      sk.skeleton.bones[i].add(c);
    }
  }
  function cloneSkinned(src) {
    const c = src.clone(true), bones = {}; c.traverse(o => { if (o.isBone) bones[o.name] = o; });
    c.traverse(o => { if (o.isSkinnedMesh) { const sk = o.skeleton; o.bind(new THREE.Skeleton(sk.bones.map(b => bones[b.name]), sk.boneInverses), o.bindMatrix); } });
    return c;
  }
  const V = () => new THREE.Vector3();
  // ressort amorti critique (pulsation w, rad/s) de x vers c : [x, vitesse] ; dt = 0 : saut direct
  // x vers c sans à-coup : cible filtrée (1er ordre, o[k + 'C']) suivie par un ressort amorti critique (vitesse o[k + 'V']) :
  // vitesse ET accélération continues quand c saute ; dt = 0 : saut direct
  const lisse2 = (o, k, x, c, w, dt) => { if (!(dt > 0)) { o[k + 'C'] = c; o[k + 'V'] = 0; return c; }
    let c1 = o[k + 'C']; if (c1 === undefined) c1 = x; c1 += (c - c1) * Math.min(1, dt * w); o[k + 'C'] = c1;
    const v = (o[k + 'V'] || 0) + (w * w * (c1 - x) - 2 * w * (o[k + 'V'] || 0)) * dt; o[k + 'V'] = v; return x + v * dt; };
  // chemin d'une orientation de main qA → qB (s : 0..1) : bascule minimale de l'axe de la main axL (repère local) + rotation autour
  // de cet axe (pro-/supination), angle suivi d'une image à l'autre dans o[cle] : la slerp directe entre deux orientations à
  // ~170° passe par des poignets cassés et peut changer de sens en route
  const chemin = (o, cle, qA, qB, s, axL) => {
    const a0 = axL.clone().applyQuaternion(qA), a1 = axL.clone().applyQuaternion(qB), qs = new THREE.Quaternion().setFromUnitVectors(a0, a1);
    const qr = qs.clone().invert().multiply(qB).multiply(qA.clone().invert());
    let th = 2 * Math.atan2(new THREE.Vector3(qr.x, qr.y, qr.z).dot(a0), qr.w); while (th > Math.PI) th -= 2 * Math.PI; while (th < -Math.PI) th += 2 * Math.PI;
    const m = o.chemins || (o.chemins = {}), pv = m[cle] && o.t - m[cle].t < 0.2 ? m[cle].th : null;
    if (pv !== null) { while (th - pv > Math.PI) th -= 2 * Math.PI; while (th - pv < -Math.PI) th += 2 * Math.PI; } m[cle] = { th, t: o.t };
    return new THREE.Quaternion().slerp(qs, s).multiply(new THREE.Quaternion().setFromAxisAngle(a0, th * s)).multiply(qA); };
  // place de la main d'appui tournée de a (rad) autour de la verticale de l'arme, centre au milieu de la paume (voir mainChargeur)
  S.INCL_G = 0.7; S.INCL_EXP = 1; S.PUITS_V = 0.04; S.DEPART_Q = 0.22; S.PUITS_PROF = 0.08; S.PUITS_ENF = 0.6; S.PUITS_HAUT = 0.04; S.COUDE_DEV_R = 0.05;
  S.LISSE_VISE = 1; S.TORSION_MAX = 0.95;
  S.PENCHE_LAT = 0.06; S.EP_W = 11; S.DOS_W = 14; S.A0_W = 16; S.PENCHE_W = 6; S.PROT_D = 0; S.PROT_BAS = 0.01;   // (lissages : torsion du dos en marche, part de visée du clip haut, cible de penche)   // visée en pas chassé / en recul : penche du buste réduite d'autant (rad ; ~18,5° → ~15,5°)   // part du lissage de position du fusil retirée en visée (épaulé : crosse à l'épaule, joue sur la crosse ; le fusil suit le buste)
  const hrelIncl = (D, a) => { if (Math.abs(a) < 1e-4) return D.Hrel; const c = D.paumeLoc;
    return new THREE.Matrix4().makeTranslation(c.x, c.y, c.z).multiply(new THREE.Matrix4().makeRotationY(a)).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z)).multiply(D.Hrel); };
  // suivi de o[k] vers tgt (dt > 0) : ressort amorti critique (w) avec anticipation de la vitesse de la cible (bornée à vmax : un
  // saut de cible n'est pas pris pour une vitesse), accélération bornée à amax (rad/s²) ; aucun retard sur une cible qui tourne
  // régulièrement, un saut devient un mouvement lisse
  const suivi = (o, k, tgt, dt, w, vmax, amax) => { const rp = o[k + 'R']; const vT = rp === undefined ? 0 : Math.max(-vmax, Math.min(vmax, (tgt - rp) / dt)); o[k + 'R'] = tgt;
    const x = o[k], v = o[k + 'V'] || 0, a = Math.max(-amax, Math.min(amax, w * w * (tgt - x) + 2 * w * (vT - v))); o[k + 'V'] = v + a * dt; o[k] = x + o[k + 'V'] * dt; return o[k]; };
  const ressort = (x, v, c, w, dt) => { if (!(dt > 0)) return [c, 0]; const a = w * w * (c - x) - 2 * w * v; v += a * dt; x += v * dt; if (x < 0) { x = 0; v = 0; } else if (x > 1) { x = 1; v = 0; } return [x, v]; };
  // un soldat : group (posé par le jeu), pose (chute), weapon (avec .muzzle), anim
  // o.modele : 'gign' (équipe du joueur) ou 'soldat' (adversaire) ; par défaut le premier modèle chargé
  function create(o) {
    if (!S.ready) return null;
    const M = S.modeles[o.modele] || S.modeles[S.defaut];
    const group = new THREE.Group(), pose = new THREE.Group(); group.add(pose);
    const body = cloneSkinned(M.gltf.scene); body.scale.setScalar(HEIGHT / RAW_H); pose.add(body);
    // pose « d'origine » des os = la garde basse (et non la dernière image laissée par les mesures du chargement, la fin de
    // la chute dans le dos, jambe en l'air) : le mixer complète avec elle tout poids d'animation inférieur à 1 (fondus,
    // couches de jambes qui s'effacent) ; avec la pose de chute, une jambe pouvait se lever à l'horizontale au repos
    if (M.clips.Garde_Basse) for (const t of M.clips.Garde_Basse.tracks) { const m = /^(.*)\.(quaternion|position)$/.exec(t.name), o = m && (body.getObjectByName(m[1]) || body.getObjectByName(m[1].replace(/^mixamorig/, 'mixamorig:'))); if (o) o[m[2]].fromArray(t.values, 0); }
    let skinned = null; body.traverse(n => { if (n.isSkinnedMesh) { skinned = n; n.material = tintedMaterial(n.material, TEINTE[M.nom] ? o.uniform : null, M.nom); } });
    if (skinned && M.lod) try { lod(skinned, M.lod); } catch (e) { console.warn('soldat 3D (LOD) :', e); }
    if (skinned && M.nom === 'gign') try { charnieres(skinned); } catch (e) { console.warn('soldat 3D (visière) :', e); }
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
      { const lat = WP(pieds[0][0]).sub(WP(pieds[1][0])); lat.y = 0; if (lat.lengthSq() > 1e-8) planGenou(p, dir, lat.normalize(), 0.02, up === pieds[1][0] ? -1 : 1); else p.normalize(); }
      const E1 = S0.clone().addScaledVector(dir, a * cosA).addScaledVector(p, a * Math.sqrt(1 - cosA * cosA));
      turn(up, E0.clone().sub(S0), E1.sub(S0)); const E2 = WP(lo); turn(lo, WP(ft).sub(E2), T.sub(E2));
      ft.quaternion.copy(WQ(ft.parent).invert().multiply(qF)); ft.updateMatrixWorld(true);
    }
    // points de semelle (monde) du pied i : talon, plante, bout (voir semelle()) ; sinon cheville / orteils approchés
    const semW = (i) => { const S = M.semelle && M.semelle[i], ft = pieds[i][2], toe = orteils[i];
      if (!S || !ft || !toe) { const A = WP(ft), T = toe ? WP(toe) : A.clone(); return { talon: A.clone().setY(A.y - 0.11), plante: T.clone().setY(T.y - 0.04), bout: T.clone().setY(T.y - 0.04) }; }
      const r = { talon: S.talon.clone().applyMatrix4(ft.matrixWorld), plante: S.plante.clone().applyMatrix4(toe.matrixWorld), bout: S.bout.clone().applyMatrix4(toe.matrixWorld) };
      r.min = Math.min(r.talon.y, r.plante.y, r.bout.y); if (S.pts) for (const q of S.pts) { const y = q.p.clone().applyMatrix4(q.o ? toe.matrixWorld : ft.matrixWorld).y; if (y < r.min) r.min = y; }
      return r; };
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
        ra: bone('RightArm'), rf: bone('RightForeArm'), la: bone('LeftArm'), lf: bone('LeftForeArm'), spine: bone('Spine2'), head: bone('Head'), hips: bone('Hips'), dos: bone('Spine') },   // (dos : l'os qui porte la peau du buste)
      // joue (en fondu) l'animation demandée ; time : figer à un instant (pose fixe) ; speed : vitesse du cycle
      play(name, opts = {}) {
        const a = act(name); if (!a) return;
        if (this.clip !== name) {
          const prev = this.clip && actions[this.clip], F0 = this.fondu;
          // fondu « adouci » (smootherstep, mené par update()) au lieu du fondu linéaire de three.js : le linéaire fait sauter la
          // vitesse des os au début et à la fin du fondu (à-coup de 10 000 °/s² du buste en sortie de rechargement)
          const wa0 = F0 && F0.de === a ? a.getEffectiveWeight() : 0;   // (retour vers l'animation qu'on quittait : on repart de son poids)
          if (F0) { const dd = F0.de; if (dd !== a) { const w = dd.getEffectiveWeight(), r = Math.max(0.05, F0.d - F0.t); if (w > 0.002) { dd.setEffectiveWeight(w); dd.fadeOut(r); } else dd.stop(); } this.fondu = null; }
          if (prev && prev !== a) prev.stopFading();
          const w0 = prev && prev !== a ? prev.getEffectiveWeight() : 0;
          a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.play();
          if (opts.start) a.time = opts.start * a.getClip().duration;   // commencer plus loin dans l'animation
          const d = Math.max(opts.fade !== undefined ? opts.fade : 0.22, this.fadeMin || 0);   // (fadeMin : fondu minimal imposé par le jeu, ex. sortie de rechargement)
          if (prev && prev !== a) { if (d > 0.001 && w0 > 0.002) { a.setEffectiveWeight(wa0); this.fondu = { de: prev, a, w0, wa0, t: 0, d }; } else prev.stop(); }
          this.clip = name;
        }
        if (opts.time !== undefined) { a.time = opts.time * a.getClip().duration; a.timeScale = 0; } else a.timeScale = opts.speed || 1;
      },
      // couche « jambes » jouée en plus de l'animation principale (qui ne doit alors pas animer les jambes) ; null : l'enlever
      playLegs(name, opts = {}) {
        // (0,35 s, la durée d'entrée de la marche — marcheK — : les deux couches se croisent à poids total 1 ; avec 0,2 s, le total
        // tombait à 0,57 et le mixer complétait avec la pose d'origine : à-coup du bassin de 2 800 °/s² à la reprise de la marche
        // après un rechargement)
        if (!name) { if (this.legClip) { actions[this.legClip].fadeOut(0.35); this.legClip = null; } return; }
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
        if (!this.blendW || this.a0s === undefined) { this.a0s = a0c; lisse2(this, 'a0s', a0c, a0c, 16, 0); } else this.a0s = S.A0_PREMIER ? this.a0s + (a0c - this.a0s) * Math.min(1, dt * 12) : lisse2(this, 'a0s', this.a0s, a0c, S.A0_W, dt);   // (cible filtrée + ressort : le 1er ordre faisait tourner le dos de 40 % de l'écart dès la 1re image — Spine2 35 000 °/s² en passant à la course épaulée)
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
          // torsion épaules / bassin prévue : en visée, les épaules sont à −BIAIS de la face (penche()), le bassin à B + torsion
          // des jambes + orientation propre du bassin du cycle ; hors visée, le dos suit le bassin (on borne la torsion des hanches)
          const vis = Math.abs(a0) > 0.05, tors = (tau, n) => vis ? Math.abs(wrap(-BIAIS - (B + tau + (M.hipsYaw[n] || 0) - (M.hipsYaw[avant] || 0)))) : Math.abs(tau);
          const twA = wrap(e - ta), torsA = tors(twA, avant);
          // (patrouille, mix : le corps suit déjà le déplacement ; le petit écart des virages est pris par le bassin, jamais par un
          // pas chassé « au pistolet » mélangé à la petite course)
          this.jogTw = (avant === 'Pas_Avant_Course' || avant === 'Pas_Glisse' || !!mix) && Math.abs(e) <= Math.abs(tc) && Math.abs(twA) <= 1.35 && torsA < (vis ? (this.jogTw ? 0.85 : 0.78) : (this.jogTw ? 1.0 : 0.9));
          if (root.Soldat3D && root.Soldat3D.dbgTw) this.dbgTw = { e: +e.toFixed(2), tc: +tc.toFixed(2), ta: +ta.toFixed(2), twA: +twA.toFixed(2), torsA: +torsA.toFixed(2), jogTw: this.jogTw };
          if (this.jogTw) { cible[avant] = 1; tau = twA; this.selArr = null; }
          else if (Math.abs(e) <= Math.abs(tc)) {
            // secteur avant : mélange marche avant / pas chassé, poids tels que la somme des foulées (vecteurs) pointe vers e
            // (ces deux démarches se mélangent bien une fois calées en phase, voir M.decal)
            // (TORS_PART : d'abord tourner le bassin AUTANT que la torsion le permet, puis mélanger pour le reste seulement ; avant,
            // 20° de trop à gauche passaient d'un coup à 58 % de pas chassé : cadence 152 → 210 pas/min, pieds de travers, vu en jeu)
            let tp = 0;
            if (TORS_PART && (avant === 'Pas_Avant_Course' || avant === 'Pas_Glisse' || !!mix) && Math.abs(twA) <= (TORS_PART.tw ?? 1.0)) { const lim = (vis ? 0.78 : 0.9) * (TORS_PART.k ?? 0.9); for (let k = 20; k > 0; k--) { const x = twA * k / 20; if (tors(x, avant) < lim) { tp = x; break; } } }
            const e2 = e - tp, wa = Math.abs(Math.sin(tc - e2)) / foul(avant), wc = Math.abs(Math.sin(e2 - ta)) / foul(cote), s = wa + wc || 1;
            cible[avant] = wa / s; cible[cote] = wc / s; this.selArr = null; tau = tp;
          } else {
            // secteur arrière : pas chassé et marche arrière se mélangent mal (pas qui s'annulent) ; on joue l'un OU l'autre,
            // bassin tourné (tau) vers la direction exacte, en gardant celui qui tord le moins le dos (avec hystérésis ;
            // le changement se fait en fondu par le lissage des poids)
            const tw = (n) => wrap(e - D[n]), cout = (n) => (vis ? tors(Math.max(-1.5, Math.min(1.5, tw(n))), n) : Math.abs(wrap((M.hipsYaw[n] || 0) - (M.hipsYaw[avant] || 0) + tw(n)))) + (n === PR ? 0 : 0.1);   // (torsion épaules / bassin prévue : le haut du corps en visée est de profil, ~0,7·a0)   // (+0,1 : vu de face, le pas chassé tourné croise les jambes ; la marche arrière, non)
            // (changer de clip fait tourner le bassin de |psi + tau| d'un clip à l'autre, jusqu'à ~160° : il faut que le gain en
            // vaille la peine, et la bascule se fait alors lentement, ~0,5 s, pour ne pas voir le bassin « tourner sur lui-même »)
            const hz = (n) => wrap((M.hipsYaw[n] || 0) - (M.hipsYaw[avant] || 0) + Math.max(-1.5, Math.min(1.5, tw(n)))), [nc, no] = this.selArr ? [PR, cote] : [cote, PR];
            if (this.selArr == null) this.selArr = cout(PR) < cout(cote);   // (entrée dans le secteur : le meilleur, sans hystérésis)
            else if (cout(no) < cout(nc) - 0.2 - 0.3 * Math.abs(wrap(hz(no) - hz(nc)))) { this.selArr = !this.selArr; this.basculeT = 0.5; }
            const n = this.selArr ? PR : cote; cible[n] = 1; tau = Math.max(-1.5, Math.min(1.5, tw(n)));
          }
        } else cible[avant] = 1;
        // pas de côté LENT : pas chassé joint (pieds jamais rapprochés à moins de la base, jamais croisés) ; au-dessus de PAS.v1,
        // la marche hanches tournées vers le déplacement (le buste garde l'arme sur la cible) ; mélange entre les deux
        // (un pas joint et une marche ne se mélangent pas — pieds qui se percutent à 50/50, mesuré — : on passe de l'un à l'autre
        // avec hystérésis, fondu des poids ~0,3 s ; pieds d'appui cloués par le verrou, pied qui bouge levé par decolle())
        // (de côté pur — part latérale ≥ PAS.lat — : pas joints jusqu'à PAS.vl1 ; en marche hanches tournées à 1-1,3 m/s, torsion
        // épaules / bassin 63°, pieds qui se rapprochent à 1-6 cm, botte écrasée à la poussée ; en diagonale, le pas joint mélangé
        // à la marche avant glisse : seuils d'origine)
        // (de côté pur : déplacement à moins de PAS.latA de la perpendiculaire à la visée ; tout le poids va alors au pas joint,
        // bassin face à la cible)
        { const pur = !!PAS.vl1 && (cible[PG] > 0 || cible[PD] > 0) && Math.abs(Math.abs(wrap(ecart)) - Math.PI / 2) <= (PAS.latA ?? 0.45);
          const v0 = pur ? PAS.vl0 : PAS.v0, v1 = pur ? PAS.vl1 : PAS.v1;
          const j0 = this.jointOn; this.jointOn = j0 === undefined || !this.blendW ? v < (v0 + v1) / 2 : j0 ? v < v1 : v < v0; if (j0 !== undefined && j0 !== this.jointOn && (cible[PG] > 0 || cible[PD] > 0)) this.basculeT = 0.35;
          if (pur && this.jointOn && v >= PAS.v0) { const sc = (cible[PG] || 0) >= (cible[PD] || 0) ? PG : PD; for (const n in cible) cible[n] = 0; cible[sc] = 1; tau = 0; } }
        { const kJ = this.jointOn ? 1 : 0;
          for (const [sc, jn] of [[PG, 'Pas_Joint_D'], [PD, 'Pas_Joint_G']]) if (M.clips[jn] && M.loco[jn] && cible[sc] > 0) { cible[jn] = cible[sc] * kJ; cible[sc] *= 1 - kJ; } }
        if (mix) { const wa = cible[avant] || 0; cible[avant] = 0; for (const n in mix) if (M.clips[n] && M.loco[n]) cible[n] = (cible[n] || 0) + wa * mix[n]; }
        // (torsion du bassin au prorata de la couche des jambes : à l'entrée en marche elle monte avec elle)
        this.jambesCible = tau * Math.min(1, (this.marcheK || 0) + dt / 0.35);
        if (!this.blendW) this.blendW = {};
        const bw = this.blendW;
        for (const n in bw) if (!(n in cible)) cible[n] = 0;
        this.basculeT = Math.max(0, (this.basculeT || 0) - dt);
        // (poids lissés au 2e ordre — amorti critique, « SmoothDamp » — : vitesse des poids continue, plus d'à-coup du bassin au début
        // d'un fondu, ex. passage pas chassé joint ↔ marche hanches tournées ; constantes de temps proches de l'ancien 1er ordre)
        const bv = this.blendV || (this.blendV = {}), om = 2 / (this.basculeT > 0 ? 0.42 : 0.17);
        let tot = 0; for (const n in cible) { const x0 = bw[n] || 0, ch = x0 - cible[n], x2 = om * dt, ex = 1 / (1 + x2 + 0.48 * x2 * x2 + 0.235 * x2 * x2 * x2), tmp = ((bv[n] || 0) + om * ch) * dt;
          bv[n] = ((bv[n] || 0) - om * tmp) * ex; bw[n] = Math.max(0, Math.min(1, cible[n] + (ch + tmp) * ex)); if (bw[n] < 0.004 && cible[n] === 0) { bw[n] = 0; bv[n] = 0; } tot += bw[n]; }
        // foulée du mélange : somme VECTORIELLE (en diagonale, avant + côté avancent moins que la somme des longueurs) ;
        // c'est elle qui cale la cadence sur la vitesse réelle (pas de pieds qui glissent)
        // (mesuré : la vraie foulée d'un mélange est entre la somme vectorielle et la somme des longueurs ; on prend la moyenne)
        let fx = 0, fz = 0, fl = 0; for (const n in bw) if (bw[n] > 0) { const L = bw[n] / tot * foul(n), t = D[n] || 0; fx += L * Math.sin(t); fz += L * Math.cos(t); fl += L; }
        // (CAD_MAX : cadence plafonnée — en pas/min — quand le mélange contient beaucoup de pas chassé (foulée courte) : en
        // diagonale visée à 2 m/s, le mélange marche glissée / pas chassé tournait à 260-270 pas/min ; au-delà, la foulée s'allonge,
        // les pieds d'appui restent cloués par le verrou et le pied en l'air rattrape)
        { let dph = dt * v / Math.max(0.25, (Math.hypot(fx, fz) + fl) / 2); const kC = CAD_MAX && tot > 0 ? Math.min(1, (((bw.Pas_Gauche || 0) + (bw.Pas_Droite || 0)) / tot) / 0.25) : 0;
          if (kC > 0 && dt > 0) { const cap = CAD_MAX / 120 * dt; if (dph > cap) dph = dph + (cap - dph) * kC; }
          this.ph = ((this.ph || 0) + dph) % 1; }
        // entrée en marche : la couche des jambes monte en ~0,2 s (l'animation précédente s'efface pendant ce temps)
        this.marcheK = Math.min(1, (this.marcheK || 0) + dt / 0.35);
        // (reprise après une couche de jambes — rechargement en marchant — qui jouait le MÊME cycle : même action three.js ; on
        // reprend sa phase et son poids au lieu de la remettre à 0,1 et à la phase de la marche : saut du bassin de 2 800 °/s²)
        { const n = this.legClip;   // (le jeu appelle marche() AVANT playLegs(null) : la couche est encore là)
          if (n && REPRISE && tot > 0 && bw[n] / tot > 0.5) { const a = act(n); if (a) {
            this.ph = ((((a.time + dt * a.getEffectiveTimeScale()) / a.getClip().duration) - (M.phase0[n] || 0) - ((M.decal && M.decal[avant] && M.decal[avant][n]) || 0)) % 1 + 1) % 1;
            this.marcheK = Math.max(this.marcheK, a.getEffectiveWeight()); this.legClip = null; } } }
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
        // (orientation du bassin par rapport au groupe — la visée — pour borner la torsion épaules / bassin dans penche())
        this.bassinM = B + this.jambesCible + psi;
        // (marche glissée jouée vite — petite course en visant — : base resserrée, pieds sous les hanches comme en course)
        { const x = avant === 'Pas_Glisse' ? Math.max(0, Math.min(1, (v - GLISSE_SERRE.v0) / (GLISSE_SERRE.v1 - GLISSE_SERRE.v0))) : 0; this.serreK = (this.serreK || 0) + (x * x * (3 - 2 * x) - (this.serreK || 0)) * Math.min(1, dt * 3); }
        this.dosM = psi + a0; this.yawM = B; this.blendFrame = frameK; this.coteK = tot > 0 ? ((bw[PG] || 0) + (bw[PD] || 0)) / tot : 0; this.arrK = tot > 0 ? (bw[PR] || 0) / tot : 0;
        this.jointK = tot > 0 ? ((bw.Pas_Joint_D || 0) + (bw.Pas_Joint_G || 0)) / tot : 0;   // (pas joints : part latérale aussi, pour la penche du buste)
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
        if ((this.blendW && !enMarche || changeRepos) && !keepYaw && pieds[0][2] && pieds[1][2]) this.pose0 = { t: 0, arret: true, lock: pieds.map(l => new THREE.Vector3().setFromMatrixPosition(l[2].matrixWorld)), lockQ: pieds.map(l => { const q = new THREE.Quaternion(); l[2].matrixWorld.decompose(V(), q, V()); return q; }) };
        for (const [b, q, p] of mods) { b.quaternion.copy(q); b.position.copy(p); } mods.length = 0;
        if (this.blendW && !enMarche) {   // plus en marche directionnelle : les jambes mélangées s'effacent
          for (const n in this.blendW) { const a = actions[n]; if (a && a.isScheduled() && this.blendW[n] > 0) a.fadeOut(0.3); }
          this.blendW = null; this.dosM = (this.dosM || 0) + (this.yawM || 0);   // (torsion figée, qui s'efface avec marcheK)
        }
        if (!enMarche) this.marcheK = Math.max(0, (this.marcheK || 0) - dt / 0.3);
        frameK++;
        // fondu adouci en cours (voir play()) : poids en smootherstep, vitesse des os continue au début et à la fin
        { const F = this.fondu; if (F && dt > 0) { F.t += dt; const x = Math.min(1, F.t / F.d), s = x * x * x * (x * (x * 6 - 15) + 10);
            F.a.setEffectiveWeight(F.wa0 + (1 - F.wa0) * s); F.de.setEffectiveWeight(F.w0 * (1 - s)); if (x >= 1) { F.de.stop(); this.fondu = null; } } }
        // (le mixer de three.js n'écrit un os que si sa valeur mélangée a changé depuis l'image précédente : un os resté à une
        // valeur périmée — retouche restaurée sur une valeur déjà retouchée — n'était plus jamais corrigé tant que la pose
        // d'arrêt ne bougeait pas. Mesuré : bassin à −40° de lacet et 8 cm trop bas pendant toute la garde basse, puis saut de
        // 40° / 8 cm et pied gauche de 30 cm en UNE image au premier pas. On force la réécriture de chaque os animé.)
        if (REECRIT && mixer._bindings) for (const pm of mixer._bindings) { const b = pm.buffer, n = pm.valueSize; if (b && n) { b[n] = NaN; b[2 * n] = NaN; } }
        mixer.update(dt); this.t += dt;
        // chute dans le dos : vers 55-75 % de l'animation le bassin roule et une jambe part en l'air (botte vers le ciel) : un pied
        // plus haut que le bassin est redescendu de 30 % de cet écart (IK de la jambe) autour de ce moment
        if (this.clip === 'Shot_in_the_Back_and_Fall' && actions[this.clip] && hipsB) {
          const p = actions[this.clip].time / M.clips[this.clip].duration, w = Math.max(0, 1 - Math.abs(p - 0.63) / 0.15);
          if (w > 0) { group.updateMatrixWorld(true); const hy = WP(hipsB).y;
            for (const [up, lo, ft] of pieds) if (ft) { const e = WP(ft).y - hy; if (e > 0) ik(up, lo, ft, new THREE.Vector3(0, -0.3 * w * e, 0)); } }
        }
        this.epK = S.EP_RESSORT ? (([this.epK, this.epV] = ressort(this.epK || 0, this.epV || 0, EPAULE[this.clip] ? 1 : 0, 11, dt)), this.epK) : Math.max(0, Math.min(1, lisse2(this, 'ep', this.epK || 0, EPAULE[this.clip] ? 1 : 0, S.EP_W, dt)));   // (cible filtrée puis ressort : l'accélération part de 0 — le ressort seul démarrait à w² : fusil 6 700 °/s² à la 1re image en quittant la visée)
        // (lent : les corrections diffèrent d'une pose à l'autre ; cible filtrée puis ressort amorti critique : la vitesse du corps
        // ne saute pas quand la cible change d'un coup — avant, approche exponentielle : 160 °/s dès la 1re image en sortie de
        // rechargement)
        if (!keepYaw) { const tgt = enMarche ? this.yawM : (M.yawFix[this.clip] || 0); if (dt > 0) body.rotation.y = lisse2(this, 'corpsYaw', body.rotation.y, tgt, enMarche ? 10 : 6, dt); }   // (clé « corpsYaw » : « yaw » donnait this.yawV, déjà la vitesse de lacet du GROUPE écrite par app.js : le corps partait à +36° pendant un pivot)
        else this.corpsYawC = undefined;
        // torsion du dos en marche directionnelle : bassin des pas chassés / arrière (psi) + visée (le corps n'est tourné que
        // de yawM, le dos fait le reste, calculé sur l'orientation ACTUELLE du corps pour que le fusil reste sur la cible
        // pendant que le corps pivote) ; pondérée par marcheK (entrée / sortie en fondu, comme les animations)
        this.dosComp = (this.marcheK || 0) > 0 ? this.marcheK * ((this.dosM || 0) + (enMarche ? body.rotation.y : 0)) : 0;
        // (filtrée — cible filtrée + ressort : le bassin estimé des cycles (psi) saute quand la marche avant change de clip,
        // glissée → course, alors que les jambes, elles, passent en fondu ; le dos tournait de 25° en une image, 19 000 °/s²)
        if (S.DOS_W > 0) { if (dt > 0 && this.dosCompF !== undefined) this.dosComp = lisse2(this, 'dosCF', this.dosCompF, this.dosComp, S.DOS_W, dt); else lisse2(this, 'dosCF', this.dosComp, this.dosComp, S.DOS_W, 0); this.dosCompF = this.dosComp; }
        // (cible filtrée à l'arrêt — ~0,08 s — avant le ressort : un replacement des pieds fait sauter la cible de ~1 rad d'un coup,
        // à-coup du bassin de 4 200 °/s² au pivot)
        let jc = this.jambesCible;
        if (JAMBES_FILTRE && !enMarche && dt > 0) { let d0 = jc - (this.jambesCF ?? jc); while (d0 > Math.PI) d0 -= 2 * Math.PI; while (d0 < -Math.PI) d0 += 2 * Math.PI; this.jambesCF = (this.jambesCF ?? jc) + d0 * Math.min(1, dt * JAMBES_FILTRE); jc = this.jambesCF; } else this.jambesCF = jc;
        let dj = jc - this.jambes; while (dj > Math.PI) dj -= 2 * Math.PI; while (dj < -Math.PI) dj += 2 * Math.PI;
        // (sortie de marche directionnelle : la torsion du bassin se défait au rythme du fondu des jambes, pas d'un coup)
        const kj = !enMarche && (this.marcheK || 0) > 0 ? dt * 6 : dt * 14;
        // (pas de pose en cours — arrêt, pivot — : priorité sur la sortie de marche ; JAMBES_POSE : bassin plus vif pendant les pas,
        // pour ne pas laisser les pieds déjà tournés vers leur place finale à 90° du bassin après un arrêt + quart de tour)
        const vj = enMarche ? 5 : this.pose0 && JAMBES_POSE ? JAMBES_POSE.vj : (this.marcheK || 0) > 0 ? 3.5 : this.pose0 ? 4 : 9;   // (pas de replacement en cours : le bassin tourne avec les pas)   // (rad/s ; en marche directionnelle et en sortie de marche, le bassin tourne posément)
        // (ressort amorti critique, vitesse continue : plus d'à-coup du bassin quand la cible change d'un coup — pivot sur place,
        // entrée / sortie de marche)
        if (dt > 0) { const ST = enMarche ? 0.12 : this.pose0 && JAMBES_POSE ? JAMBES_POSE.st : (this.marcheK || 0) > 0 ? 0.25 : this.pose0 ? 0.18 : 0.1, om = 2 / ST, x = om * dt, ex = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
          const v0 = this.jambesV || 0, tmp = (v0 - om * dj) * dt; let v1 = (v0 - om * tmp) * ex, nj = this.jambes + dj + (-dj + tmp) * ex;
          let pas = nj - this.jambes; pas = Math.max(-vj * dt, Math.min(vj * dt, pas)); this.jambes += pas; this.jambesV = Math.max(-vj, Math.min(vj, v1)); }
        // visée à l'arrêt : l'animation est de profil « sur un fil » (pieds l'un derrière l'autre sur l'axe de tir, jambes qui se
        // confondent vues de face) ; le bassin et les jambes sont tournés de CARRE vers la cible, le dos rattrape (fusil immobile)
        this.carreK = lisse2(this, 'carre', this.carreK || 0, (this.clip === 'Rifle_Aim_Turn_Right' || this.clip === 'Standing_Reload') && !keepYaw ? 1 : 0, 8, dt);   // (sans à-coup du bassin)
        const tj = this.jambes + CARRE * this.carreK;
        if (Math.abs(tj) > 0.01 && hipsB && spine3.length) {
          body.updateMatrixWorld(true); mod(hipsB); twist(hipsB, tj);
          // (contre-torsion entière sur Spine : sur les modèles Meshy TOUTE la peau du buste est liée à Spine — Spine1 et Spine2 ne
          // déforment que bras, cou et tête ; réparti sur les trois os, le gilet restait tourné avec le bassin, épaules déboîtées)
          mod(spine3[0]); twist(spine3[0], -tj);
        }
        // le bassin des pas chassés / de la marche arrière n'est pas orienté comme celui de la marche avant : le dos rattrape
        if (this.dosComp && Math.abs(this.dosComp) > 0.01 && spine3.length) { body.updateMatrixWorld(true); mod(spine3[0]); twist(spine3[0], -this.dosComp); }   // (sur Spine : voir plus haut)
        // respiration (poses fixes : garde basse, visée) : légère flexion du dos
        // (sur Spine, qui porte la peau du buste — sur Spine1, seuls bras et tête « respiraient » ; poids lissé : plus de saut au
        // changement de pose)
        { const rk = this.respK = dt > 0 ? Math.max(0, Math.min(1, lisse2(this, 'respK', this.respK || 0, (this.clip === 'Garde_Basse' || this.clip === 'Rifle_Aim_Turn_Right') && !keepYaw ? 1 : 0, 4, dt))) : (this.respK || 0);
          if (spine3[0] && rk > 0.01) { mod(spine3[0]); spine3[0].rotation.x += Math.sin(this.t * 1.9) * 0.012 * rk; spine3[0].rotation.z += Math.sin(this.t * 0.7) * 0.006 * rk; } }
        // (cible filtrée + ressort : la penche du buste et la tête, proportionnelles à gbK, démarrent sans à-coup — sortie de
        // rechargement : le ressort seul donnait 10 000 °/s² au buste à la 1re image)
        this.gbK = Math.max(0, Math.min(1, lisse2(this, 'gb', this.gbK || 0, this.clip === 'Garde_Basse' || this.clip === 'Walk_Low_Haut' || this.clip === 'Run_Low_Haut' || this.clip === 'Trot_Low_Haut' || BAS[this.clip] ? 1 : 0, 10, dt)));
        // (poids = ep + gb borné à 1, et non max(ep, gb) : en passant de la garde basse à la visée le max a un coin là où les deux
        // courbes se croisent (~0,5) — la correction de penche repartait en sens inverse en une image, à-coup de 5 000-6 000 °/s²)
        { const kP = Math.min(1, (this.epK || 0) + (this.gbK || 0)); if (kP > 0.01 && !keepYaw) this.penche(kP); }
        if (enMarche && (this.marcheK || 0) > 0.05) this.ecarte(this.marcheK, this.coteK || 0, this.arrK || 0);
        else if (this.verrouPieds && !keepYaw) this.ecarte(1, 0, 0);   // (marche accroupie, course épaulée : chevilles jamais croisées)
        this.verrou(dt, !keepYaw && (enMarche || !!this.verrouPieds) && !S.sansVerrou);
        const repos = (this.clip === 'Garde_Basse' || this.clip === 'Rifle_Aim_Turn_Right') && !enMarche && !keepYaw;
        // pied gauche avancé de la garde basse (appui) : porté par le petit pas de pose (poserPieds) et appliqué d'un coup, au
        // lieu de suivre reposK (~2 s) : le pied glissait de 17 cm au sol à l'arrêt (0,1-0,25 m/s)
        { const gbT = repos && this.clip === 'Garde_Basse' && GB_PAS;
          this.gbPiedK = gbT && (this.pose0 || !this.clipVu) ? 1 : gbT ? Math.max(this.gbPiedK || 0, this.reposK || 0) : 0; }   // (sortie : au départ, le verrou reprend les pieds là où ils étaient affichés — voir verrou — ; vers la visée, le pas de pose part de la position affichée)
        if (this.pose0) this.poserPieds(dt, repos);
        this.appui(dt, repos && (!this.pose0 || APPUI_POSE));   // (APPUI_POSE : la posture d'arrêt — genoux, largeur — tient pendant les petits pas du pivot au lieu de s'effacer)
        this.clouer(dt, repos, enMarche || !!keepYaw);
        this.decolle(dt, !keepYaw && !S.sansDecolle);
        if (!keepYaw) this.cheville();
        if (!keepYaw && !S.sansSol) this.sol();
        this.vu = pieds[0][2] && M.semelle ? [semW(0), semW(1)] : null;   // (semelles affichées, pour le verrou au départ)
        this.tete(dt, keepYaw ? null : repos || enMarche || !!EPAULE[this.clip] || !!BAS[this.clip]);
        this.clipVu = this.clip;
      },
      // Pieds cloués à l'arrêt, entre deux séries de pas de replacement : au pivot sur place, la torsion des jambes suit le corps
      // avec un ressort (~0,1 s de retard) et le corps se recale vers sa visée ; les pieds, qui suivaient la pose du mixer,
      // tournaient avec le bassin : talon glissé de 5-7 cm avant le premier pas (pivot en visant, mesuré). Chaque pied est
      // tenu là où il était affiché (fin des pas de pose comprise) ; relâché d'un coup au départ (le verrou de marche le reprend
      // là où il est affiché), en 0,15 s sinon (rechargement, accroupi).
      clouer(dt, repos, libre) {
        const C = this.clou || (this.clou = { w: 0, p: null, q: null });
        if (!CLOU || !pieds[0][2] || !pieds[1][2]) return;
        group.updateMatrixWorld(true);
        const vu = this.clouVu, prendre = () => { if (!vu) return; C.p = vu.p.map(v => v.clone()); C.q = vu.q.map(q => q.clone()); C.w = 1; };
        if (libre || this.pose0) { C.p = C.q = null; C.w = 0; }   // (pas de pose en cours : ce sont eux qui tiennent les pieds)
        else if (repos) { if (!C.p) prendre(); C.w = 1; }
        else { if (!C.p && C.tenu) prendre(); if (C.p) { C.w -= dt / 0.15; if (C.w <= 0) { C.p = C.q = null; C.w = 0; } } }
        // (téléporté, réapparition : on lâche)
        if (C.p && Math.max(WP(pieds[0][2]).distanceTo(C.p[0]), WP(pieds[1][2]).distanceTo(C.p[1])) > 0.25) { C.p = C.q = null; C.w = 0; }
        if (root.Soldat3D && root.Soldat3D.dbgClou) C.dbg = C.p ? [0, 1].map(i => { const a = WP(pieds[i][2]); return [C.p[i].x - a.x, C.p[i].y - a.y, C.p[i].z - a.z]; }) : null;
        // (corps immobile : le pied cloué rejoint lentement — ≤ 1,5 cm/s — la place que lui donne la posture qui finit de
        // s'installer après les pas (garde, genoux) ; sinon, posé 1-2 cm à côté, genoux à 30° au lieu de 27°. Rien pendant un pivot.)
        if (C.p && C.w >= 1 && repos && dt > 0) { const rot = Math.abs(this.yawV || 0) + Math.abs(this.jambesV || 0), kL = Math.max(0, 1 - rot / 0.3);
          if (kL > 0) pieds.forEach(([, , ft], i) => { const d = WP(ft).sub(C.p[i]), n = d.length(), st = Math.min(n * Math.min(1, 1.5 * dt), 0.015 * dt) * kL;
            if (n > 1e-5) C.p[i].addScaledVector(d, st / n); C.q[i].slerp(WQ(ft), Math.min(1, 1.5 * dt) * kL); }); }
        if (C.p && C.w > 0) { const k = C.w * C.w * (3 - 2 * C.w);
          pieds.forEach(([up, lo, ft], i) => { const d = C.p[i].clone().sub(WP(ft)).multiplyScalar(k), qC = WQ(ft); if (d.lengthSq() > 1e-8) ikJambe(up, lo, ft, d, orteils[i]);
            mod(ft); ft.quaternion.copy(WQ(ft.parent).invert().multiply(qC.slerp(C.q[i], k))); ft.updateMatrixWorld(true); }); }
        C.tenu = !!C.p || !!(this.pose0 && repos && !libre);
        this.clouVu = { p: pieds.map(l => WP(l[2])), q: pieds.map(l => WQ(l[2])) };
      },
      // pivot sur place (app.js) : les pieds, cloués pendant que le torse tourne, se replacent face au torse par deux petits pas
      // (même mécanique que l'arrêt : pieds partant de leur position affichée, voir poserPieds)
      repas() {
        // (pas précédents pas finis : refusé ; SAUF les pas d'arrêt — l'arrêt suivi d'un quart de tour vers la cible : attendre
        // 0,38 s laissait les jambes vrillées vers l'ancienne direction ; les pas repartent de la position affichée)
        if (!pieds[0][2] || !pieds[1][2] || (this.pose0 && this.pose0.t < 0.38 && !(this.pose0.arret && REPAS_ARRET) && !(REPAS_ARRET && this.pose0.t > 0.2 && Math.abs(this.jambesCible || 0) > 1.2))) return false;   // (torsion de plus de 70° — quart de tour rapide — : on n'attend pas la fin des pas)
        this.pose0 = { t: 0, lock: pieds.map(l => new THREE.Vector3().setFromMatrixPosition(l[2].matrixWorld)), lockQ: pieds.map(l => { const q = new THREE.Quaternion(); l[2].matrixWorld.decompose(V(), q, V()); return q; }) };
        return true;
      },
      // Pose des pieds à l'arrêt : au lieu de glisser en 0,3 s vers la pose d'arrêt (fondu), chaque pied reste cloué au sol
      // là où il était puis fait un petit pas (léger lever) jusqu'à sa place : d'abord celui qui était levé, puis l'autre.
      // IK des jambes par-dessus le fondu (la cible suit la pose du mixer, qui devient celle de l'arrêt).
      poserPieds(dt, repos) {
        const P = this.pose0; P.t += dt;
        if (!repos || P.t > 0.62) { this.pose0 = null; return; }
        group.updateMatrixWorld(true);
        const cur = pieds.map(l => WP(l[2]));
        // (pied gauche avancé de la garde basse : ajouté APRÈS, par appui() ; le pas part donc de la position clouée moins cette avance)
        const fwG = new THREE.Vector3(0, 0, 1).applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion())), av = GB_PAS ? [0, 1].map(i => this.gbOff(i, fwG, this.gbPiedK || 0)) : null;
        if (!P.ordre) { if (Math.max(cur[0].distanceTo(P.lock[0]), cur[1].distanceTo(P.lock[1])) > 0.8) { this.pose0 = null; return; }   // (téléporté)
          P.ordre = P.lock[0].y >= P.lock[1].y ? [0, 1] : [1, 0]; }
        // (cible ANTICIPÉE : là où le pied sera une fois la torsion des jambes rattrapée — le bassin tourne encore de « rem » autour
        // de la hanche, jambesCible et carré visés — ; avant, le pied visait sa place du moment, en retard de 0,2-0,6 s sur un arrêt
        // suivi d'un quart de tour : jambes vrillées, genou de côté, pieds croisés pendant 0,4-0,8 s (vu en jeu))
        const carreT = this.clip === 'Rifle_Aim_Turn_Right' || this.clip === 'Standing_Reload' ? 1 : 0;
        const rem = POSE_ANTICIPE ? Math.max(-1.6, Math.min(1.6, (this.jambesCible || 0) - (this.jambes || 0) + (root.ANTICIPE_CARRE_TEST ?? 0) * CARRE * (carreT - (this.carreK || 0)))) : 0;   // (le « carré » de la visée, rapide — ~0,3 s —, n'est pas anticipé : pieds tournés avant le bassin, pied / bassin 73°)
        const qR = new THREE.Quaternion().setFromAxisAngle(UP, rem), hP = WP(hipsB);
        const tgt = cur.map(c => c.clone().sub(hP).applyQuaternion(qR).add(hP).setY(c.y)), qTgt = pieds.map(l => qR.clone().multiply(WQ(l[2])));
        // (quart de tour : le pied du côté où l'on tourne part le premier — sinon l'autre passe devant lui, jambes croisées, tibias
        // l'un dans l'autre — ; sauf pied déjà levé à l'arrêt, qui se pose d'abord)
        if (!P.ordreT) { P.ordreT = true; if (ORDRE_TOUR && Math.abs(rem) > 0.35 && Math.abs(P.lock[0].y - P.lock[1].y) < 0.03) P.ordre = rem > 0 ? [0, 1] : [1, 0]; }
        // (pieds reposés et cloués, mais le bassin a encore tourné — cible changée en visée — : s'ils sont à plus de 30° ou 12 cm
        // de leur place, nouveaux petits pas depuis là où ils sont, au lieu de laisser le bassin tourner au-dessus de pieds cloués :
        // jambes croisées, tibias l'un dans l'autre, vu en jeu)
        if (REPAS_DERIVE && P.fin && P.fin[0] && P.fin[1] && P.t > 0.42) {
          const yawOf = (q) => { const v = new THREE.Vector3(0, 0, 1).applyQuaternion(q); return Math.atan2(v.x, v.z); };
          const der = [0, 1].some(i => { let a = yawOf(P.fin[i][1]) - yawOf(qTgt[i]); while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return Math.abs(a) > 0.52 || Math.hypot(P.fin[i][0].x - tgt[i].x, P.fin[i][0].z - tgt[i].z) > 0.12; });
          if (der) { this.pose0 = { t: 0, lock: [0, 1].map(i => P.fin[i][0].clone().add(av ? av[i] : V())), lockQ: [0, 1].map(i => P.fin[i][1].clone()) }; return this.poserPieds(0, repos); } }
        P.ordre.forEach((i, rang) => {
          const x = Math.max(0, Math.min(1, (P.t - rang * 0.16) / 0.24)), s = x * x * (3 - 2 * x);
          // (pied qui attend son tour, encore au sol, pendant un quart de tour rapide : il PIVOTE sur la plante pour rester à 40° au
          // plus de sa direction finale, au lieu de rester cloué : pied / bassin jusqu'à 135° — jambe vrillée — quand le corps tourne
          // de 135° en 0,3 s)
          if (s <= 0 && PIVOT_PLANTE) { const ft = pieds[i][2], vL = WP(orteils[i]).sub(WP(ft)).applyQuaternion(WQ(ft).invert());
            const dA = vL.clone().applyQuaternion(P.lockQ[i]), dB = vL.clone().applyQuaternion(qTgt[i]); dA.y = 0; dB.y = 0;
            if (dA.lengthSq() > 1e-6 && dB.lengthSq() > 1e-6) { const a = Math.atan2(dA.x * dB.z - dA.z * dB.x, dA.x * dB.x + dA.z * dB.z), lim = PIV_P.lim;
              if (Math.abs(a) > lim) { const r = Math.max(-PIV_P.w * dt, Math.min(PIV_P.w * dt, -(a - Math.sign(a) * lim))), qY = new THREE.Quaternion().setFromAxisAngle(UP, r), ball = P.lock[i].clone().add(vL.clone().applyQuaternion(P.lockQ[i]));
                // (signe : atan2(dA×dB) mesure l'angle de dA vers dB autour de −Y ; la rotation autour de +Y est donc −a)
                // (au-delà de PIV_P.hanche — quart de tour rapide — : le pied tourne autour du BASSIN, glissé sur la plante, au lieu de
                // rester sur place pendant que le corps tourne au-dessus : sinon le pied droit passait à gauche du bassin, tibias croisés)
                const ctr = PIV_P.hanche && Math.abs(a) > PIV_P.hanche ? hP.clone().setY(P.lock[i].y) : ball;
                P.lock[i] = P.lock[i].clone().sub(ctr).applyQuaternion(qY).add(ctr); P.lockQ[i] = qY.clone().multiply(P.lockQ[i]); } } }
          // (pied reposé : cloué là où il s'est posé jusqu'à la fin de la pose — relâché en douceur de 0,50 à 0,62 s — ; avant, il
          // suivait aussitôt les jambes, dont la torsion rattrape le pivot avec ~0,2 s de retard : au pivot sur place, chaque pied
          // glissait de 3-5 cm à 0,15-0,3 m/s après chaque petit pas)
          if (s >= 1) { const ft = pieds[i][2]; if (!PIN_POSE) return; P.fin = P.fin || []; if (!P.fin[i]) P.fin[i] = [tgt[i].clone(), qTgt[i].clone()];
            const z = CLOU ? 0 : Math.max(0, Math.min(1, (P.t - 0.5) / 0.12)), wp = 1 - z * z * (3 - 2 * z); if (wp <= 0) return;
            const d = P.fin[i][0].clone().sub(cur[i]).multiplyScalar(wp), qC = WQ(ft); if (d.lengthSq() > 1e-8) ikJambe(pieds[i][0], pieds[i][1], ft, d, orteils[i]);
            mod(ft); ft.quaternion.copy(WQ(ft.parent).invert().multiply(qC.slerp(P.fin[i][1], wp))); ft.updateMatrixWorld(true); return; }
          const L = av ? P.lock[i].clone().sub(av[i]) : P.lock[i], C = tgt[i], dl = Math.hypot(C.x - L.x, C.z - L.z), h = Math.min(0.11, Math.max(0.45 * dl, Math.min(0.04, 3 * dl)));   // (un vrai pas : pied levé de 4 à 11 cm, pas traîné ; un pas de 1-9 cm se lève quand même de 3-4 cm)
          const T = L.clone().lerp(C, s); T.y += h * Math.sin(Math.PI * s);
          const ft = pieds[i][2], qC = qTgt[i], d = T.sub(cur[i]); if (d.lengthSq() > 1e-8) ikJambe(pieds[i][0], pieds[i][1], ft, d, orteils[i]);
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
        const gp = group.getWorldPosition(V()), vC = Lk.gp && dt > 0 ? Math.hypot(gp.x - Lk.gp.x, gp.z - Lk.gp.z) / dt : 0; Lk.gp = gp.clone();   // (vitesse du corps)
        const gy = gp.y, so = [semW(0), semW(1)], bas = (s) => (s.min !== undefined ? s.min : Math.min(s.talon.y, s.plante.y, s.bout.y)) - gy;
        pieds.forEach(([up, lo, ft], i) => {
          const L = Lk[i], S = so[i], h = bas(S), hT = S.talon.y - gy, hP = Math.min(S.plante.y, S.bout.y) - gy;
          // vitesse (monde) du pied tel que l'animation le place : un pied d'appui est presque immobile au sol, un pied en l'air
          // qui passe près du sol avance à 2-3 fois la vitesse du corps (il ne doit pas être cloué en plein pas)
          let vA = L.pA && dt > 0 ? Math.hypot(S.plante.x - L.pA.x, S.plante.z - L.pA.z) / dt : 0; L.pA = S.plante.clone();
          // (saut de l'animation — passage marche ↔ petite course, changement de cycle — : un pied d'appui immobile qui « bondit » de
          // 20 cm en une image n'est pas un pied qui part ; on garde le verrou cette image-là au lieu de lâcher puis reprendre 7 cm plus loin)
          // (essai désactivé — VERROU.saut — : les pas chassés / diagonales en ont souffert, pieds croisés ; le vrai cas — pied qui
          // retombe sur le talon au passage marche ↔ course — est traité plus bas : pas de lâcher sur un passage au talon chargé)
          { const vP = L.vAp ?? 0; L.vAp = vA; if (VERROU.saut === true && L.piv && vP < 0.8 && vA > 2.2 && Math.min(S.talon.y, S.plante.y, S.bout.y) - gy < 0.03) vA = vP; }
          // appui : semelle à moins de 3 cm du sol, plus basse que l'autre, et pied (presque) immobile ; pivot : talon posé →
          // talon, sinon la plante
          // (S.verrouLeve, essai désactivé : relâcher dès que l'animation lève le pied — semelle remontée de 1,2 cm au-dessus de son
          // plus bas depuis la prise — et qu'il avance. Mesuré : en appui la semelle animée bouge déjà de plus de 1,2 cm (déroulé,
          // cycles qui flottent) et le pied lâchait en plein appui : glissement × 2 à 3)
          L.hMin = L.piv ? Math.min(L.hMin === undefined ? h : L.hMin, h) : h;
          const leve = S.verrouLeve === true && L.piv && h - L.hMin > 0.012 && vA > 0.5;
          const appui = !leve && h < 0.03 && h <= bas(so[1 - i]) + 0.02 && vA < (L.piv ? 2.2 : 1.1);
          // (fin du déroulé : quand le bout de la semelle passe nettement sous la plante, pivot sur le bout — 'B' — : le pied qui
          // tourne en lacet au décollement pivotait autour de la plante et son bout, seul au sol, balayait 3-4 cm)
          const hB = S.bout.y - gy, bout = VERROU.B !== false && hT > 0.04 && hB < S.plante.y - gy - (L.piv === 'B' ? 0 : VERROU.Bd ?? 0.01);
          let piv = !actif ? null : appui && hT < 0.02 ? 'A' : appui ? (bout ? 'B' : 'T') : (!leve && L.piv && h < (S.verrouH || 0.05) && vA < (L.piv === 'B' ? Math.max(VERROU.vB ?? 2.2, (VERROU.kB ?? 1) * vC) : L.piv === 'T' && VERROU.kT !== false ? Math.max(2.2, (VERROU.kB ?? 1) * vC) : 2.2) ? (L.piv === 'T' && bout && VERROU.TB !== false ? 'B' : L.piv) : null);   // (pied qui repart en rasant le sol — pas chassé — : relâché)
          // (changement de pivot sur un pied que l'animation emporte déjà — plus vite que 1,4 m/s ou 0,8 × le corps — : c'est le
          // décollement ; on lâche en douceur au lieu de ré-ancrer — retenir le pied le jette dans l'autre en pas chassé, le
          // ré-ancrer sur sa position animée le fait sauter de 5 cm)
          if (piv && L.piv && piv !== L.piv && !(L.piv === 'T' && piv === 'B') && !(piv === 'A' && h < (VERROU.hA ?? 0.006)) && L.w > 0 && VERROU.cont !== false && vA >= Math.max(VERROU.contV || 1.4, 0.8 * vC)) piv = null;
          const K = { A: 'talon', T: 'plante', B: 'bout' };
          if (root.Soldat3D && root.Soldat3D.dbgVerrou) L.dbg = { h: +h.toFixed(3), hT: +hT.toFixed(3), vA: +vA.toFixed(2), vC: +vC.toFixed(2), appui, piv0: L.piv, piv, autre: +bas(so[1 - i]).toFixed(3) };
          if (piv) {
            const P = S[K[piv]];
            // (changement de pivot : la nouvelle ancre est là où ce point ÉTAIT AFFICHÉ à l'image précédente — position animée
            // précédente + décalage — et non sa position animée courante + décalage : sinon le pied saute de ce que l'animation
            // a dérivé pendant l'image, 3 cm en petite course au passage talon → plante)
            // (départ — couche de marche qui entre — : le pied est pris là où il était AFFICHÉ à l'image précédente, d'un coup ; la
            // pose d'arrêt et ses retouches — avance du pied de la garde basse — ne le font pas sauter ni glisser)
            const dep = !L.piv && L.w <= 0 && (this.marcheK || 0) < 0.15 && this.vu && VERROU.dep !== false && Math.hypot(this.vu[i][K[piv]].x - P.x, this.vu[i][K[piv]].z - P.z) < 0.2;
            if (dep) { L.anc = this.vu[i][K[piv]].clone(); L.piv = piv; L.w = 1; }
            else if (L.piv !== piv) { L.anc = (VERROU.cont !== false && L.pr && L.w > 0 ? L.pr[K[piv]] : P).clone(); if (L.off && L.w > 0) L.anc.addScaledVector(L.off, L.w * L.w * (3 - 2 * L.w)); if (VERROU.prise0 !== false && !L.piv && (!(L.w > 0) || VERROU.prise0w !== false)) L.w = 1; L.piv = piv; }   // (prise neuve : l'ancre est la position actuelle, décalage nul — pas d'à-coup — : cloué tout de suite au lieu de glisser 0,09 s à la pose du pied)
            // (et posé AU sol : le point d'appui de la semelle à hauteur 0 ; les cycles flottent ou s'enfoncent de 1 à 4 cm)
            const dy = Math.max(-0.04, Math.min(0.05, -(piv === 'A' ? hT : piv === 'B' ? hB : hP)));
            const d = new THREE.Vector3(L.anc.x - P.x, dy, L.anc.z - P.z);
            // (essai écarté : lâcher quand la jambe est tendue — cible hors de portée — ; mesuré : glissements × 2 à 6, la jambe
            // d'appui est souvent presque tendue)
            if (Math.hypot(d.x, d.z) > 0.22) { L.piv = null; L.w = Math.max(0, L.w - dt / 0.16); }   // (trop loin : pivot sur place, saut)
            else { L.off = d; L.w = Math.min(1, L.w + dt / VERROU.prise); }   // (prise en ~0,09 s, relâche en ~0,16 s : sans à-coup du genou)
          } else { L.piv = null; L.w = Math.max(0, L.w - dt / VERROU.lache); }
          L.pr = { talon: S.talon.clone(), plante: S.plante.clone(), bout: S.bout.clone() };
          if (L.w > 0 && L.off && L.off.lengthSq() > 1e-8) ikJambe(up, lo, ft, L.off.clone().multiplyScalar(L.w * L.w * (3 - 2 * L.w)), orteils[i]);
        });
      },
      // Pied qui bouge = pied levé (« anti-patinage ») : un pied NON cloué qui se déplace dans le monde à plus de ~0,4 m/s alors
      // que sa semelle est à moins de DECOLLE.h du sol est remonté (IK de la jambe, orientation gardée) jusqu'à cette hauteur,
      // en douceur. Cas mesurés : départ (la marche entre en fondu sur la pose d'arrêt : le pied qui part ne se lève qu'au
      // prorata du fondu et glisse 0,25 s à 2-3 m/s), lâcher du verrou au ras du sol, pose du pied en petite course qui arrive
      // à 3-5 m/s à 1-2 cm du sol, mélanges marche / pas chassé. Un pied qui ralentit se repose.
      decolle(dt, actif) {
        const D = this.decol || (this.decol = [{ y: 0, v: 0 }, { y: 0, v: 0 }]); if (!pieds[0][2] || !M.semelle || !(dt > 0)) return;
        group.updateMatrixWorld(true); const gp = group.getWorldPosition(V()), gy = gp.y, Lk = this.lock, vCd = this.decolGp ? Math.hypot(gp.x - this.decolGp.x, gp.z - this.decolGp.z) / dt : 0; this.decolGp = gp.clone();
        // (course — corps à plus de ~2 m/s — et marche en rechargeant : levée DECOLLE.h2, un peu plus haute ; la marche visée garde DECOLLE.h, talon ≤ 12 cm)
        const kC = this.verrouPieds && vCd > 0.5 ? 1 : Math.max(0, Math.min(1, (vCd - 1.8) / 0.5)), hD = DECOLLE.h + ((DECOLLE.h2 ?? DECOLLE.h) - DECOLLE.h) * kC * kC * (3 - 2 * kC);
        pieds.forEach(([up, lo, ft], i) => {
          const d = D[i], S = semW(i), h = (S.min !== undefined ? S.min : Math.min(S.talon.y, S.plante.y, S.bout.y)) - gy, p = S.plante;
          const v = d.p ? Math.hypot(p.x - d.p.x, p.z - d.p.z) / dt : 0, lw = Lk && Lk[i] && Lk[i].piv ? Lk[i].w || 0 : 0;   // (verrou qui lâche — plus de pivot — : le pied rattrape l'animation EN L'AIR, petit pas vif, pas en glissant)
          const x = Math.max(0, Math.min(1, (v - DECOLLE.v0) / (DECOLLE.v1 - DECOLLE.v0))), c = actif && v < 8 ? hD * x * x * (3 - 2 * x) * Math.max(0, 1 - 2 * lw) : 0;
          // (levée voulue ressort amorti critique, ~0,06 s : pas d'à-coup du genou)
          // (pas exact « SmoothDamp » : stable quel que soit dt — un ressort explicite divergeait à 30 images/s)
          // (un pied enfoncé est l'affaire de sol() : la levée se compte depuis le sol)
          const want = c > 0 ? Math.max(0, Math.min(0.08, c - Math.max(0, h))) : 0, om = 2 / DECOLLE.t, x2 = om * dt, ex = 1 / (1 + x2 + 0.48 * x2 * x2 + 0.235 * x2 * x2 * x2), ch = d.y - want, tmp = (d.v + om * ch) * dt;
          d.v = (d.v - om * tmp) * ex; d.y = Math.max(0, Math.min(0.08, want + (ch + tmp) * ex)); if (root.Soldat3D && root.Soldat3D.dbgDecolle) d.dbg = [v, h, c, want];
          if (d.y > 0.001) { ikJambe(up, lo, ft, new THREE.Vector3(0, d.y, 0), orteils[i]); }
          const S2 = d.y > 0.001 ? semW(i) : S; d.p = S2.plante.clone();
        });
      },
      // Butée de cheville en l'air : un pied levé (semelle à plus de 1,5-4 cm du sol) dont la pointe remonte vers le tibia de
      // plus de DORSI_MAX (flexion dorsale, par rapport à la pose de liaison) est rabattu jusqu'à la butée. Mesuré : pas
      // chassé gign, pied en l'air à 42-46° (amplitude réelle 20-40°). Au sol, la flexion du genou en charge est laissée.
      cheville() {
        if (!DORSI_MAX || !skinned || !pieds[0][2] || !orteils[0] || !orteils[1]) return;
        if (M.cheville0 === undefined) { const sk = skinned.skeleton, bp = (b) => { const k = sk.bones.indexOf(b); return k < 0 ? null : new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(sk.boneInverses[k]).invert()); };
          M.cheville0 = pieds.map(([up, lo, ft], i) => { const L = bp(lo), F = bp(ft), T = bp(orteils[i]); return L && F && T ? F.clone().sub(L).angleTo(T.clone().sub(F)) : null; }); }
        group.updateMatrixWorld(true); const gy = group.getWorldPosition(V()).y;
        pieds.forEach(([up, lo, ft], i) => { const c0 = M.cheville0[i]; if (c0 === null) return;
          const S = semW(i), h = (S.min !== undefined ? S.min : Math.min(S.talon.y, S.plante.y, S.bout.y)) - gy, x = Math.max(0, Math.min(1, (h - 0.015) / 0.025)), w = x * x * (3 - 2 * x); if (w <= 0) return;
          // (ex > 0 : pointe trop relevée, tournée vers le tibia ; < 0 : trop tendue — flexion plantaire au-delà de PLANT_MAX —, tournée
          // dans l'autre sens ; mesuré : recul rapide, pied en l'air à 30,0-30,3°)
          const shin = WP(ft).sub(WP(lo)), a1 = WP(orteils[i]).sub(WP(ft)), ang = shin.angleTo(a1), ex = ang - c0 - DORSI_MAX > 0 ? ang - c0 - DORSI_MAX : PLANT_MAX && c0 - ang > PLANT_MAX ? -(c0 - ang - PLANT_MAX) : 0; if (!ex) return;
          const ax = new THREE.Vector3().crossVectors(a1, shin); if (ax.lengthSq() < 1e-10) return; ax.normalize();
          mod(ft); ft.quaternion.copy(WQ(ft.parent).invert().multiply(new THREE.Quaternion().setFromAxisAngle(ax, ex * w)).multiply(WQ(ft))); ft.updateMatrixWorld(true); });
      },
      // Sol : aucun point de semelle sous le sol (debout, accroupi, en marche) : le pied est remonté par l'IK de la jambe.
      // Les deux pieds dans le sol : c'est tout le corps qui est trop bas → le bassin remonte d'autant (genoux inchangés, au lieu
      // de les plier davantage) ; puis un pied encore sous le sol est remonté seul par l'IK.
      sol() {
        if (!M.semelle || !pieds[0][2] || !hipsB) return;
        group.updateMatrixWorld(true); const gy = group.getWorldPosition(V()).y;
        const hs = [0, 1].map(i => { const S = semW(i); return (S.min !== undefined ? S.min : Math.min(S.talon.y, S.plante.y, S.bout.y)) - gy; }), hm = Math.max(hs[0], hs[1]);
        if (hm < -0.003) { mod(hipsB); const h0 = WP(hipsB); hipsB.position.add(hipsB.parent.worldToLocal(h0.clone().setY(h0.y - Math.max(hm, -0.06))).sub(hipsB.parent.worldToLocal(h0.clone()))); hipsB.updateMatrixWorld(true); }
        pieds.forEach(([up, lo, ft], i) => { const S = semW(i), h = (S.min !== undefined ? S.min : Math.min(S.talon.y, S.plante.y, S.bout.y)) - gy; if (h < -0.003) ikJambe(up, lo, ft, new THREE.Vector3(0, Math.min(0.06, -h), 0), orteils[i]); });   // (6 cm au plus : garde-fou)
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
          // en marche : épaules à 0,95 rad au plus du bassin (bassinM, donné par marche()) — un tireur droitier qui se déplace vers
          // sa gauche se met de face au lieu de se tordre
          let Sv = -((S.BIAIS_M && S.BIAIS_M[M.nom]) || BIAIS); if (this.bassinM !== undefined && this.blendW && this.blendFrame === frameK - 1) Sv = Math.max(this.bassinM - S.TORSION_MAX, Math.min(this.bassinM + S.TORSION_MAX, Sv));
          this.epS = this.epS === undefined ? Sv : this.epS + (Sv - this.epS) * 0.15;
          const d = Math.max(-1, Math.min(1, Math.PI / 2 + this.epS - Math.atan2(e.x, e.z))) * ek; if (Math.abs(d) > 0.01) { mod(spine3[0]); twist(spine3[0], d); } } }   // (sur Spine, qui porte la peau du buste)
        const lat = WP(B.la).sub(WP(B.ra)); lat.y = 0; if (lat.lengthSq() < 1e-6) return; lat.normalize();
        // direction : 30 % normale des épaules, 70 % axe de visée (le tireur étant de profil, sinon il penche vers sa droite)
        const fwG = new THREE.Vector3(0, 0, 1).applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion())); fwG.y = 0; fwG.normalize();
        const fw = new THREE.Vector3().crossVectors(lat, new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(S.PENCHE_EP).addScaledVector(fwG, 1 - S.PENCHE_EP).normalize();
        lat.crossVectors(new THREE.Vector3(0, 1, 0), fw).normalize();
        const axe = (b, ang) => { mod(b); b.parent.getWorldQuaternion(qP); qT.setFromAxisAngle(lat, ang); b.quaternion.premultiply(qP.clone().invert().multiply(qT).multiply(qP)); b.updateMatrixWorld(true); };
        // trois passes : (1) le haut du dos n'est jamais voûté au-delà de ~17° (Spine2 → cou ; certaines animations le sont déjà :
        // on redresse Spine2 d'autant), (2) l'inclinaison bassin → cou est amenée à PENCHE par le BAS du dos (Spine, Spine1)
        // (les pivots du dos sont au-dessus du bassin : l'angle bougeant moins que la rotation, on itère)
        // (0) charnière de hanche : le bassin bascule vers l'avant (jusqu'à ~7°), les pieds restent en place (IK des jambes,
        // orientation gardée) ; elle fait pencher tout le buste d'un coup, sans voûter le dos
        // (visée : « nez au-dessus des orteils » ; course en garde basse : buste nettement penché, comme un coureur)
        // (à genou, Accroupi_* : l'animation a le buste 35° EN ARRIÈRE ; plafond de correction plus haut, cible ~12°)
        const genou = /^Accroupi/.test(this.clip), cibleB = this.clip === 'Rifle_Aim_Turn_Right' ? S.PENCHE_ARRET : COURSE_BAS[this.clip] ? 0.42 : genou ? PENCHE : (this.epK || 0) > 0.5 ? PENCHE + 0.12 - (S.PENCHE_LAT || 0) * (this.blendFrame >= frameK - 1 ? Math.min(1, (this.coteK || 0) + (this.arrK || 0) + (this.jointK || 0)) : 0) : PENCHE, plafond = genou ? 0.95 : 0.6;
        // (cible lissée — cible filtrée + ressort, ~0,4 s : elle change d'un coup avec le clip du haut du corps — course en garde basse
        // 0,42 → visée — ou au passage d'epK par 0,5 ; le bas du dos tournait de ~10° en une image, 15 000 °/s²)
        let cible; { const dP = this.tPen === undefined ? -1 : this.t - this.tPen; this.tPen = this.t;
          if (!(S.PENCHE_W > 0)) cible = cibleB;
          else if (this.penC === undefined || dP < 0 || dP > 0.25) { cible = cibleB; lisse2(this, 'penF', cibleB, cibleB, S.PENCHE_W, 0); }
          else cible = dP === 0 ? this.penC : lisse2(this, 'penF', this.penC, cibleB, S.PENCHE_W, dP);
          this.penC = cible; }
        // (toutes les corrections sont calculées entières puis appliquées au prorata de k : réponse LINÉAIRE en k — avant, les
        // itérations à gain 1,5·k et les plafonds saturaient dès k ≈ 0,3 : le buste basculait d'un coup au début des fondus)
        if (pieds[0][2] && pieds[1][2]) { const v0 = WP(cou0).sub(WP(hipsB)), hg = k * Math.max(0, Math.min(0.12, (cible - Math.atan2(v0.dot(fw), Math.max(0.05, v0.y))) * 0.5));
          if (hg > 0.004) { const pf = pieds.map(l => [WP(l[2]), WQ(l[2])]); axe(hipsB, hg);
            pieds.forEach(([up, lo, ft], i) => { const d = pf[i][0].clone().sub(WP(ft)); if (d.lengthSq() > 1e-10) ikJambe(up, lo, ft, d, orteils[i]); mod(ft); ft.quaternion.copy(WQ(ft.parent).invert().multiply(pf[i][1])); ft.updateMatrixWorld(true); }); } }
        const acc = [0, 0, 0];
        for (let it = 0, tot = 0; it < 3; it++) {
          const w2 = WP(cou0).sub(WP(spine3[2])), h2 = Math.atan2(w2.dot(fw), Math.max(0.05, w2.y)); if (h2 > 0.3) { axe(spine3[2], -(h2 - 0.3)); acc[2] -= h2 - 0.3; }
          const v = WP(cou0).sub(WP(hipsB)), a = Math.min(plafond - tot,(cible - Math.atan2(v.dot(fw), Math.max(0.05, v.y))) * 1.5);   // (visée à l'arrêt : l'animation a le poids sur l'arrière, on penche plus)
          if (a < 0.005) continue;   // (seulement vers l'avant : une course déjà penchée n'est pas redressée)
          axe(spine3[0], a); acc[0] += a; tot += a;   // (tout sur Spine : la peau du buste y est liée, la penche se voit en entier)
        }
        if (k < 0.999) for (let j = 0; j < 3; j++) if (acc[j]) axe(spine3[j], (k - 1) * acc[j]);   // (même axe : les angles s'additionnent)
        // roulis : les visées de la bibliothèque penchent le buste sur le côté (10 à 18°) ; ramené à 4° au plus (bas du dos)
        const rou = (b, a) => { mod(b); b.parent.getWorldQuaternion(qP); qT.setFromAxisAngle(fw, a); b.quaternion.premultiply(qP.clone().invert().multiply(qT).multiply(qP)); b.updateMatrixWorld(true); };
        let accR = 0;
        for (let it = 0; it < 2; it++) { const v = WP(cou0).sub(WP(hipsB)), r = Math.atan2(v.dot(lat), Math.max(0.05, v.y)), ex = r - Math.max(-0.07, Math.min(0.07, r));
          if (Math.abs(ex) < 0.004) break;
          rou(spine3[0], ex); accR += ex; }
        if (k < 0.999 && accR) rou(spine3[0], (k - 1) * accR);
      },
      // Pieds jamais croisés (pas chassés et marche arrière « au pistolet » de la bibliothèque : pas très serrés, bottes l'une sur
      // l'autre, genoux qui se touchent) : écart minimal des chevilles le long de la ligne du bassin (les deux pieds poussés
      // chacun de la moitié, IK, orientation gardée), puis genoux tournés un peu vers l'extérieur autour de l'axe
      // hanche → cheville (la cheville ne bouge pas), au prorata de la part des pas de côté / arrière (k).
      ecarte(K, k, kr) {
        if (!pieds[0][2] || !pieds[1][2]) return;
        group.updateMatrixWorld(true);
        const lat = WP(pieds[0][0]).sub(WP(pieds[1][0])); lat.y = 0; if (lat.lengthSq() < 1e-6) return; lat.normalize();   // vers la gauche du bassin
        { const sk = (this.serreK || 0) * K * (1 - Math.min(1, k + kr)) * GLISSE_SERRE.d; if (sk > 0.002) { ikJambe(pieds[0][0], pieds[0][1], pieds[0][2], lat.clone().multiplyScalar(-sk), orteils[0]); ikJambe(pieds[1][0], pieds[1][1], pieds[1][2], lat.clone().multiplyScalar(sk), orteils[1]); } }
        const MIN = (0.15 + 0.05 * k + 0.06 * kr) * K,   // (chevilles à 15 cm au moins : les bottes ne se touchent jamais)
         sep = WP(pieds[0][2]).sub(WP(pieds[1][2])).dot(lat);
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
      gbOff(i, fw, k) { return fw.clone().multiplyScalar((i === 0 ? LOWR.av : -LOWR.ar) * k); },   // décalage avant / arrière des pieds en garde basse
      appui(dt, actif) {
        this.reposK = (this.reposK || 0) + ((actif ? 1 : 0) - (this.reposK || 0)) * Math.min(1, dt * 1.5);
        // (posture de garde basse : poids propre, lissé — ressort amorti critique — ; elle se défait en ~0,4 s au départ au lieu de
        // tomber d'un coup quand l'animation du haut quitte Garde_Basse : bassin de trois quarts et avancé)
        this.lowK = lisse2(this, 'lowK', this.lowK || 0, this.clip === 'Garde_Basse' && actif ? 1 : 0, 5, dt);
        if (Math.max(this.reposK, this.lowK, GB_PAS ? this.gbPiedK || 0 : 0) < 0.01 || !hipsB || !pieds[0][2] || !pieds[1][2]) return;
        group.updateMatrixWorld(true);
        const s0 = Math.sin(this.t * 1.14 + graine), s = Math.sign(s0) * Math.pow(Math.abs(s0), 0.6) * this.reposK;   // (s'attarde sur chaque jambe)
        const avant = pieds.map(l => WP(l[2])), gq = group.getWorldQuaternion(new THREE.Quaternion());
        const lat = new THREE.Vector3(1, 0, 0).applyQuaternion(gq), fw = new THREE.Vector3(0, 0, 1).applyQuaternion(gq);
        mod(hipsB);
        const gb = Math.max(0, Math.min(1, this.lowK)), gbP = GB_PAS ? this.gbPiedK || 0 : gb;
        const h0 = WP(hipsB), h1 = h0.clone().addScaledVector(lat, s * 0.022).addScaledVector(fw, -(root.RECUL_BASSIN_TEST ?? 0.05) * Math.max(0, this.reposK - gb) + LOWR.hf * gb); h1.y -= 0.008 * Math.abs(s);   // (bassin un peu en arrière : poids sur l'avant des pieds ; garde basse : voir LOWR)
        hipsB.position.add(hipsB.parent.worldToLocal(h1).sub(hipsB.parent.worldToLocal(h0.clone()))); hipsB.updateMatrixWorld(true);
        const roule = (b, a) => { b.parent.getWorldQuaternion(qP); qT.setFromAxisAngle(fw, a); b.quaternion.premultiply(qP.clone().invert().multiply(qT).multiply(qP)); b.updateMatrixWorld(true); };
        roule(hipsB, -s * 0.035); { const sp = spine3[0] || spine1; if (sp) { mod(sp); roule(sp, s * 0.03); } }   // (sur Spine : le gilet n'est pondéré que sur cet os)
        // garde basse « prêt à tirer, arme basse » (voir LOWR) : pieds décalés — pied fort (droit) en arrière —, bassin de trois quarts
        // (épaules et arme suivent), genoux souples, poids légèrement vers l'avant
        if (gbP > 0.01) for (let i = 0; i < 2; i++) avant[i].add(this.gbOff(i, fw, gbP));
        if (gb > 0.01) { hipsB.position.add(hipsB.parent.worldToLocal(WP(hipsB).add(new THREE.Vector3(0, LOWR.hy * gb, 0))).sub(hipsB.parent.worldToLocal(WP(hipsB)))); hipsB.updateMatrixWorld(true);
          if (LOWR.bl) twist(hipsB, -LOWR.bl * Math.PI / 180 * gb); }
        // visée debout : genoux « légèrement fléchis » (~22°, réglement : 10 à 25°) et non accroupis (l'animation et la charnière
        // de hanche les amenaient à 44-47°) : le bassin remonte de ce qu'il faut, les pieds restent en place
        if (this.clip === 'Rifle_Aim_Turn_Right') {
          const fl = pieds.map(([up, lo, ft]) => { const a = WP(up).distanceTo(WP(lo)), b = WP(lo).distanceTo(WP(ft)), c = WP(up).distanceTo(WP(ft)), c1 = Math.sqrt(a * a + b * b + 2 * a * b * Math.cos(GENOUX_VISEE)); return c1 - c; });
          const dyv = Math.max(0, Math.min(0.06, Math.min(fl[0], fl[1]))) * this.reposK;
          if (dyv > 0.002) { hipsB.position.add(hipsB.parent.worldToLocal(WP(hipsB).add(new THREE.Vector3(0, dyv, 0))).sub(hipsB.parent.worldToLocal(WP(hipsB)))); hipsB.updateMatrixWorld(true); }
        }
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
        this.teteA = dt > 0 ? lisse2(this, 'teteA', this.teteA || 0, want, 7, dt) : (this.teteA || 0);   // (vitesse de la tête continue : coups d'œil et cibles nouvelles sans à-coup)
        const H = this.bones.head, kT = actif && neutre ? Math.min(1, (this.epK || 0) + (this.gbK || 0)) : 0;   // (visée ; garde basse : le dos penché ne doit pas baisser la tête)
        // (poids lissé à part : en entrée / sortie de rechargement la tête passe du regard de l'animation — vers le chargeur — au
        // regard droit devant, ~75° : avant, d'un coup à l'entrée et en 0,3 s à la sortie, à-coup de 11 000 °/s²)
        const kA = dt > 0 && this.kH !== undefined ? Math.max(0, Math.min(1, lisse2(this, 'kH', this.kH, kT, 7, dt))) : kT; this.kH = kA;
        // garde basse : le buste accompagne les coups d'œil (« tourelle » : tête, buste et canon ensemble, voir poseArme) ; ~35 %
        // du lacet de la tête porté par le dos (avant, le canon restait figé ~25° à gauche pendant que la tête balayait ±37° :
        // jusqu'à 50° entre la tête et le canon)
        { const kg = (this.gbK || 0) * (1 - (this.epK || 0)) * kA; if (actif && kg > 0.01 && Math.abs(this.teteA) > 0.003 && spine3.length) { body.updateMatrixWorld(true); mod(spine3[0]); twist(spine3[0], 0.35 * this.teteA * kg); } }
        if (kA > 0.01) {
          // En visée, les animations collent la joue sur la crosse (tête roulée vers la droite et penchée sur le fusil) ; notre
          // fusil est plus bas : tête et cou ramenés vers leur pose droite (celle de la garde basse), puis la face tournée vers
          // la direction de visée (+ coup d'œil / cible), un peu vers le bas : 40 % par le cou, le reste par la tête.
          mod(cou); mod(H); cou.quaternion.slerp(neutre[0], 0.75 * kA); H.quaternion.slerp(neutre[1], 0.75 * kA); cou.updateMatrixWorld(true);
          // (raccord avec la branche sans pose de tête — coup d'œil en simple torsion — au prorata de 1 − kA : avant, passer le seuil
          // kA = 0,01 supprimait d'un coup cette torsion, à-coup de 4 500 °/s² en sortie de rechargement)
          if (kA < 0.999 && Math.abs(this.teteA) > 0.003) { twist(cou, this.teteA * 0.4 * (1 - kA)); twist(H, this.teteA * 0.6 * (1 - kA)); }
          const fq = new THREE.Vector3(0, 0, 1).applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion())), y = Math.atan2(fq.x, fq.z) + this.teteA, p = -0.08 - 0.1 * (this.gbK || 0) * (1 - (this.epK || 0));   // (garde basse : regard un peu plus bas)
          // marche : la tête suit un peu chaque pas (±1° de tangage au rythme des pas, ±0,8° de roulis au rythme du cycle)
          const acl = actions[this.clip], pas = this.blendW && this.blendFrame === frameK - 1 ? (this.ph || 0) : acl && M.loco && M.loco[this.clip] && acl.timeScale > 0 ? acl.time / acl.getClip().duration : null, bob = pas === null ? 0 : 0.018 * Math.sin(4 * Math.PI * pas), roul = pas === null ? 0 : 0.014 * Math.sin(2 * Math.PI * pas);
          const cible = new THREE.Vector3(Math.sin(y) * Math.cos(p + bob), Math.sin(p + bob), Math.cos(y) * Math.cos(p + bob));
          // visée : le regard suit le canon (direction donnée par poseArme à l'image précédente)
          if (this.visee && (this.epK || 0) > 0.01) { cible.lerp(this.viseeTete || this.visee, this.epK).normalize(); if (bob) cible.y += bob; cible.normalize(); }
          const tourne = (b, part) => { const face = faceL.clone().applyQuaternion(WQ(H)).normalize(), q = new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(face, cible), part * kA);
            b.quaternion.copy(WQ(b.parent).invert().multiply(q).multiply(WQ(b))); b.updateMatrixWorld(true); };
          // cou redressé (60 % vers la verticale : le dos penché l'entraîne), puis visage vers la cible, puis roulis : le haut de
          // la tête (axe +Y local) ramené vers la verticale autour de l'axe du visage (tête droite, pas couchée sur la crosse)
          { const v = WP(H).sub(WP(cou)).normalize(), up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(v, v.clone().lerp(up, 0.6 - (S.COU_AVANT || 0) * (this.epK || 0)).normalize()), kA);
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
        const x = Math.max(0, Math.min(1, p / 0.18)), w = x * x * x * (x * (x * 6 - 15) + 10); if (w < 0.001) return;   // (smootherstep sur ~0,45 s : le fusil part sans à-coup)   // (pas de sortie : à la fin du rechargement, la reprise à deux mains part de cette poche, voir placeWeapon)
        const B = this.bones, rh = B.rh; group.updateMatrixWorld(true);
        const gq = group.getWorldQuaternion(new THREE.Quaternion()), sc = group.getWorldScale(V()).x, up = new THREE.Vector3(0, 1, 0);
        const fw = new THREE.Vector3(0, 0, 1).applyQuaternion(gq), lat = new THREE.Vector3(1, 0, 0).applyQuaternion(gq);
        const d = fw.clone().multiplyScalar(Math.cos(RECH.lacet)).addScaledVector(lat, Math.sin(RECH.lacet)); d.multiplyScalar(Math.cos(-RECH.pique)).addScaledVector(up, Math.sin(-RECH.pique)).normalize();
        const u = up.clone().addScaledVector(d, -up.dot(d)).normalize(), qW = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(u, d), u, d));
        qW.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -RECH.roulis));
        const T = WP(B.spine).addScaledVector(fw, RECH.avant * sc).addScaledVector(up, -RECH.bas * sc).addScaledVector(lat, -RECH.lat * sc);
        const posW = T.clone().sub((weapon.gripPt || V()).clone().multiplyScalar(sc).applyQuaternion(qW));
        const Hd = new THREE.Matrix4().compose(posW, qW, new THREE.Vector3(sc, sc, sc)).multiply(new THREE.Matrix4().copy(L).invert());
        const hp = V(), hq = new THREE.Quaternion(); Hd.decompose(hp, hq, V());
        if (M.prise && !S.sansPrise) { this.poserBras('R', B.ra, B.rf, rh, hp, hq, w, M.prise.R); return; }   // (coude choisi pour un poignet peu cassé)
        const h0 = WP(rh), tq = WQ(rh).slerp(hq, w);
        ik(B.ra, B.rf, rh, h0.clone().lerp(hp, w).sub(h0));
        rh.quaternion.copy(WQ(rh.parent).invert().multiply(tq)); rh.updateMatrixWorld(true);
      },
      // main gauche pendant le rechargement : va chercher le chargeur neuf au porte-chargeur du gilet (12-45 %), le monte au puits
      // de chargeur sous le fusil (45-60 %), l'y tient (60-86 %, chargeur() l'enfonce), puis rend la main à l'animation (96 %)
      mainChargeur(p) {
        const sm = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
        const avecPrise = !!(M.prise && M.prise.L && !S.sansPrise), fin = sm((p - 0.76) / 0.18);   // (fin : la main revient sous le garde-main)
        const w = p < 0.86 || avecPrise ? sm(p / 0.12) : 1 - sm((p - 0.86) / 0.1); if (w < 0.01 && !avecPrise) return;
        const B = this.bones, sc = group.getWorldScale(V()).x; weapon.updateMatrixWorld(true); group.updateMatrixWorld(true);
        const gq = group.getWorldQuaternion(new THREE.Quaternion()), fw = new THREE.Vector3(0, 0, 1).applyQuaternion(gq), lat = new THREE.Vector3(1, 0, 0).applyQuaternion(gq);
        const poche = WP(B.spine).addScaledVector(fw, RECH.pAvant * sc).addScaledVector(new THREE.Vector3(0, 1, 0), -RECH.pBas * sc).addScaledVector(lat, RECH.pLat * sc);
        const well = weapon.localToWorld(weapon.magCenter.clone()), down = weapon.localToWorld(new THREE.Vector3(0, -1, 0)).sub(weapon.localToWorld(V())).normalize();
        const T = poche.clone().lerp(well.addScaledVector(down, 0.07 * sc), sm((p - 0.45) / 0.15)), palm = B.lm ? WP(B.lh).lerp(WP(B.lm), 0.6) : WP(B.lh);
        // orientation de la main : celle de sa prise sous le garde-main (paume vers le haut, comme pour pousser le chargeur), au
        // lieu de celle de l'animation qui tourne brusquement ; coude choisi pour un poignet peu cassé (poserBras)
        if (M.prise && M.prise.L && !S.sansPrise) { const tq = new THREE.Quaternion(); new THREE.Matrix4().multiplyMatrices(weapon.matrixWorld, M.prise.L.Hrel).decompose(V(), tq, V());
          // (au porte-chargeur : orientation de l'animation ; au puits : main sous le fusil) ; la main tourne de ~170° entre les deux
          // (paume vers le ventre, doigts en bas → paume vers le haut) : pendant le trajet 40-62 % (main au porte-chargeur avant : le
          // poignet cassait si elle tournait sur place), par pro-/supination surtout (voir chemin)
          const ins = sm((p - 0.4) / 0.22);
          // au porte-chargeur : main dans le prolongement épaule → poche, paume vers le ventre
          const Dl = M.prise.L, n = Dl.ordre[2], mid = (this.osDoigts && this.osDoigts[n]) || body.getObjectByName(n),
            // (estimation du poignet avec l'orientation de la main à l'image précédente : sert d'axe épaule → main)
            qPr = this.qMainG && this.t - this.tMainG < 0.2 ? this.qMainG : null,
            cible = qPr ? T.clone().sub(palm.clone().sub(WP(B.lh)).applyQuaternion(WQ(B.lh).invert()).applyQuaternion(qPr)) : WP(B.lh).add(T.clone().sub(palm));
          const base = (a, nn) => { const x = a.clone().normalize(), y = nn.clone().addScaledVector(x, -nn.dot(x)).normalize(); return new THREE.Matrix4().makeBasis(x, y, new THREE.Vector3().crossVectors(x, y)); };
          // (main dans l'axe épaule → poche : poignet droit, 20-45° ; une orientation plus proche de la prise, paume au ventre doigts
          // vers la droite, cassait le poignet à 160°)
          const sp = V(), sq = new THREE.Quaternion(); new THREE.Matrix4().multiplyMatrices(weapon.matrixWorld, Dl.Hrel).decompose(sp, sq, V());
          const Aw = cible.clone().sub(WP(B.la)).normalize(), qP = new THREE.Quaternion().setFromRotationMatrix(base(Aw, fw.clone().negate().addScaledVector(lat, -1)).multiply(base(mid.position.clone(), Dl.N).transpose()));
          // au puits : la main peut tourner autour de l'axe du chargeur ; on la tourne pour qu'elle prolonge le bras (poignet droit)
          { const A = mid.position.clone().normalize().applyQuaternion(tq), F = cible.clone().sub(WP(B.la)).normalize(), a1 = A.addScaledVector(down, -A.dot(down)), f1 = F.addScaledVector(down, -F.dot(down));
            if (a1.lengthSq() > 1e-4 && f1.lengthSq() > 1e-4) { a1.normalize(); f1.normalize(); let ang = Math.max(-1.2, Math.min(1.2, Math.atan2(new THREE.Vector3().crossVectors(a1, f1).dot(down), a1.dot(f1))));
              const pr = this.angPuits !== undefined && this.t - this.tPuits < 0.2 ? this.angPuits : ang; ang = pr + Math.max(-S.PUITS_V, Math.min(S.PUITS_V, ang - pr)); this.angPuits = ang; this.tPuits = this.t;
              tq.premultiply(new THREE.Quaternion().setFromAxisAngle(down, ang * ins)); } }
          // (orientation visée limitée à ~3° par image : pas de retournement de la main si les repères basculent)
          // chemin de la rotation : bascule de l'axe de la main (qs) + rotation autour de cet axe (pro-/supination, angle th suivi
          // d'une image à l'autre) — la slerp directe entre deux orientations à ~170° pouvait changer de sens en route
          const axM = mid.position.clone().normalize(), qV = chemin(this, 'puits', qP, tq, ins, axM);
          // fin du rechargement : place et orientation de la prise sous le garde-main (un seul IK : pas deux cibles qui se disputent)
          // (reprise du garde-main en fin de rechargement : le fusil est dans la poche, contre le buste, l'avant-bras gauche arrive le
          // long du canon ; la main est tournée de INCL_G autour de la verticale de l'arme, doigts plus vers l'avant — poignet ~45° au
          // lieu de 80-100° ; la rotation s'efface après la sortie, voir tenir)
          this.inclG = 1; const sp2 = V(), sq2 = new THREE.Quaternion(); new THREE.Matrix4().multiplyMatrices(weapon.matrixWorld, hrelIncl(Dl, S.INCL_G)).decompose(sp2, sq2, V());
          // (paume en T : son décalage au poignet est pris dans le repère de la main ORIENTÉE (qV), et non de la pose de
          // l'animation, tournée de ~170° — la main tenait le chargeur ~10 cm devant le puits)
          let cib = cible; { const qi = WQ(B.lh).invert(), lh0 = WP(B.lh), dec = (pt) => pt.clone().sub(lh0).applyQuaternion(qi).applyQuaternion(qV);
            // (au puits : chargeur() porte le chargeur 6 cm sous la base des doigts ; la main l'amène sous le puits, PUITS_PROF plus
            // bas, puis l'enfonce (60-72 %, base des doigts PUITS_HAUT au-dessus du centre du chargeur en place) avant de repartir vers le garde-main — le chargeur ne glisse plus seul hors de la main)
            const e = sm((p - S.PUITS_ENF) / 0.12), Tw = weapon.localToWorld(weapon.magCenter.clone()).addScaledVector(down, (S.PUITS_PROF * (1 - e) - S.PUITS_HAUT) * sc);
            cib = poche.clone().sub(dec(palm)).lerp(Tw.sub(dec(B.lm ? WP(B.lm) : palm)), sm((p - 0.45) / 0.15)); }
          if (fin > 0) { cib = cib.clone().lerp(sp2, fin); qV.slerp(sq2, fin); }
          // début : la main part de SA PLACE sous le garde-main (et non de la pose de l'animation mêlée à la prise qui s'efface)
          // vers le porte-chargeur, en ~0,7 s (smootherstep : accélération nulle au départ ; avant, 0,3 s et 17 000 °/s²)
          const xL = Math.max(0, Math.min(1, p / 0.28)), wL = xL * xL * xL * (xL * (xL * 6 - 15) + 10); const xQ = Math.max(0, Math.min(1, p / S.DEPART_Q)), wQ = xQ * xQ * xQ * (xQ * (xQ * 6 - 15) + 10);   // (la main se retourne vers le porte-chargeur un peu avant d'y arriver)
          if (wL < 1) { cib = sp.clone().lerp(cib, wL); qV.copy(chemin(this, 'depart', sq, qV, wQ, axM)); }
          if (this.qMainG && this.t - this.tMainG < 0.2) { const ang = this.qMainG.angleTo(qV), lim = 0.35; if (ang > lim) qV.copy(this.qMainG.clone().slerp(qV, lim / ang)); }
          this.qMainG = qV.clone(); this.tMainG = this.t;
          this.poserBras('L', B.la, B.lf, B.lh, cib, qV, 1, Dl); }
        else ik(B.la, B.lf, B.lh, T.sub(palm).multiplyScalar(w));
      },
      // Bras h (épaule arm → coude fore → poignet hand) : poignet amené en tp (monde) et main orientée en tq, poids k. Le coude est
      // choisi sur le cercle de ses positions possibles : avant-bras aligné sur la main (poignet peu cassé), proche de la pose de
      // l'animation, assez bas (garde basse plus bas qu'en visée), jamais rentré dans le buste ; la moitié de la torsion de la main
      // autour de l'avant-bras est portée par l'avant-bras. D : prise de cette main (doigt du milieu, pour l'axe de la main).
      poserBras(h, arm, fore, hand, tp, tq, k, D) {
        this.osDoigts = this.osDoigts || {};
        mod(arm); mod(fore); mod(hand);
        const qH = WQ(hand).slerp(tq, k), S0 = WP(arm), E0 = WP(fore), H0 = WP(hand), T = H0.clone().lerp(tp, k);
        const a = S0.distanceTo(E0), b = E0.distanceTo(H0); let c = S0.distanceTo(T); c = Math.min(Math.max(c, Math.abs(a - b) + 1e-4), (a + b) * 0.999);
        const dir = T.clone().sub(S0).normalize(), cosA = Math.max(-1, Math.min(1, (a * a + c * c - b * b) / (2 * a * c))), C = S0.clone().addScaledVector(dir, a * cosA), r = a * Math.sqrt(1 - cosA * cosA);
        // coude : sur le cercle des positions possibles, celle qui aligne l'avant-bras sur la main (poignet peu cassé), sans
        // trop s'écarter de celle de l'animation, coude plutôt bas (pas « en aile de poulet »)
        const u = E0.clone().sub(S0); u.addScaledVector(dir, -u.dot(dir)); if (u.lengthSq() < 1e-8) u.set(0, -1, 0).addScaledVector(dir, -dir.y); u.normalize();
        const w = new THREE.Vector3().crossVectors(dir, u), Aw = (this.osDoigts[D.ordre[2]] || (this.osDoigts[D.ordre[2]] = body.getObjectByName(D.ordre[2]))).position.clone().normalize().applyQuaternion(qH), up = new THREE.Vector3(0, 1, 0).applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion()));
        const seuilC = RECHARGE[this.clip] && S.SEUIL_REL !== undefined ? S.SEUIL_REL : 0.55 - 0.25 * (this.epK || 0);   // (coude au moins à mi-hauteur du bras sous l'épaule en garde basse, un peu plus haut en visée)
        const coude = (ph) => C.clone().addScaledVector(u, r * Math.cos(ph)).addScaledVector(w, r * Math.sin(ph));
        const dedans = new THREE.Vector3(h === 'R' ? 1 : -1, 0, 0).applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion()));   // vers le centre du corps
        // (rechargement : écart à l'animation peu pénalisé — sa pose de bras ne correspond plus à la main menée par mainChargeur ;
        // 0,25 retenait le coude du mauvais côté puis le faisait basculer en route, poignet à 84°)
        const kDev = RECHARGE[this.clip] ? S.COUDE_DEV_R : 0.25;
        const cout = (ph) => { const E = coude(ph), f = T.clone().sub(E).normalize(); return Math.acos(Math.max(-1, Math.min(1, f.dot(Aw)))) + kDev * Math.abs(ph) + 3 * Math.max(0, E.clone().sub(S0).dot(up) / a + seuilC) + 3 * Math.max(0, E.clone().sub(S0).dot(dedans) / a - 0.05); };   // (coude jamais rentré dans le buste)
        // (cohérence d'une image à l'autre : recherche locale autour du coude précédent, changement limité ; recherche complète
        // seulement à la première image ou après une pause)
        const sw = this.coudePh || (this.coudePh = {}), gqC = group.getWorldQuaternion(new THREE.Quaternion());
        let prev = sw[h] && this.t - sw[h].t < 0.2 ? sw[h].ph : null;
        // (coude précédent repris dans le repère du corps puis projeté sur le cercle actuel : l'angle relatif à l'animation
        // seul faisait sauter le coude quand l'animation de référence change vite, en fondu entre deux clips)
        if (prev !== null && sw[h].v) { const v = sw[h].v.clone().applyQuaternion(gqC); v.addScaledVector(dir, -v.dot(dir)); if (v.lengthSq() > 1e-8) prev = Math.atan2(v.dot(w), v.dot(u)); }
        let ph = prev === null ? 0 : prev, cb = cout(ph);
        if (prev === null) for (let x = -2.4; x <= 2.4; x += 0.2) { const cx = cout(x); if (cx < cb) { cb = cx; ph = x; } }
        for (const st of [0.08, 0.03, 0.01]) for (const sg of [-1, 1]) { let n = 0; while (n++ < 40 && cout(ph + sg * st) < cb) { ph += sg * st; cb = cout(ph); } }
        if (prev !== null) { let gp = ph, gc = cb; for (let x = -2.4; x <= 2.4; x += 0.4) { const cx = cout(x); if (cx < gc) { gc = cx; gp = x; } } if (gc < cb - 0.25) ph = gp; }   // (bien meilleur ailleurs : on y va, à vitesse limitée)
        if (prev !== null) { const lim = Math.max(0.03, (RECHARGE[this.clip] || (this.priseK !== undefined && this.priseK < 0.97) ? 8 : 4) * (this.t - sw[h].t)); ph = prev + Math.max(-lim, Math.min(lim, ph - prev)); }   // (≤ 4 rad/s ; 8 en rechargement : poignet moins cassé à la reprise du garde-main)
        sw[h] = { ph, t: this.t, v: coude(ph).sub(C).applyQuaternion(gqC.clone().invert()) };
        const E1 = coude(ph * k);
        turn(arm, E0.clone().sub(S0), E1.clone().sub(S0)); const E2 = WP(fore); turn(fore, WP(hand).sub(E2), T.clone().sub(E2));
        // torsion : la moitié de la rotation de la main autour de l'avant-bras est portée par l'avant-bras (poignet moins vrillé)
        { const ax = T.clone().sub(E2).normalize(), qrel = WQ(fore).invert().multiply(qH), qw = WQ(fore).multiply(qrel).multiply(WQ(fore).invert());
          const pr = ax.x * qw.x + ax.y * qw.y + ax.z * qw.z; let th = 2 * Math.atan2(pr, qw.w); while (th > Math.PI) th -= 2 * Math.PI; while (th < -Math.PI) th += 2 * Math.PI;
          // (angle suivi d'une image à l'autre : à ±180° de torsion, la moitié sautait de +90° à −90°, avant-bras retourné en une image)
          const tv = this.twAv || (this.twAv = {}), pv = tv[h] && this.t - tv[h].t < 0.2 ? tv[h].th : null;
          if (pv !== null) { while (th - pv > Math.PI) th -= 2 * Math.PI; while (th - pv < -Math.PI) th += 2 * Math.PI; } tv[h] = { th, t: this.t };
          const half = new THREE.Quaternion().setFromAxisAngle(ax, 0.5 * k * th); fore.quaternion.copy(WQ(fore.parent).invert().multiply(half).multiply(WQ(fore))); fore.updateMatrixWorld(true); }
        hand.quaternion.copy(WQ(hand.parent).invert().multiply(qH)); hand.updateMatrixWorld(true);
      },
      // Prise (voir calculerPrise) : mains amenées à leur place sur le fusil (IK des bras, orientation imposée) si « mains »,
      // doigts posés sur l'arme ; k : poids (fondu)
      tenir(k, mains, seule) {
        const P = M.prise; if (!P || k < 0.01 || S.sansPrise) return;
        const B = this.bones, tp = V(), tq = new THREE.Quaternion(), ts = V(); weapon.updateMatrixWorld(true);
        const ob = this.osDoigts || (this.osDoigts = {}), os = (n) => ob[n] || (ob[n] = body.getObjectByName(n));
        // fusil hors d'atteinte d'une main (bras tendu à plus de 97 %) : il est rapproché de cette épaule d'autant
        // place de la main h (monde) ; garde basse : main d'appui un peu plus en arrière sur le garde-main
        if (this.inclG && (this.priseK || 0) > 0.995 && !this.armeDroite) this.inclG = 0;   // (main d'appui : rotation de fin de rechargement, effacée avec la reprise)
        const cibleM = (h, p, q) => { new THREE.Matrix4().multiplyMatrices(weapon.matrixWorld, h === 'L' && this.inclG ? hrelIncl(P.L, S.INCL_G * Math.pow(1 - (this.priseK || 0), S.INCL_EXP)) : P[h].Hrel).decompose(p, q, V());
          // (visée : main d'appui loin devant sur le garde-main, bras presque tendu ; garde basse : un peu en arrière)
          if (h === 'L') { const gl = (this.epK || 0) * S.AVANCE_APPUI - GARDE.recul * (this.gbK || 0) * (1 - (this.epK || 0)); if (Math.abs(gl) > 1e-4) p.add(V().setFromMatrixColumn(weapon.matrixWorld, 2).normalize().multiplyScalar(gl)); } return p; };
        // épaule d'appui avancée vers le garde-main (protraction de la clavicule) en visée : le bras atteint plus loin sans tirer le
        // fusil hors du creux de l'épaule
        if (mains && !seule && B.la && S.PROTRACTION_G > 0 && (this.epK || 0) > 0.01) { const cl = B.la.parent; if (cl && cl.isBone) { const T = cibleM('L', V(), new THREE.Quaternion()), a0 = WP(B.la).sub(WP(cl));
          mod(cl); turn(cl, a0.clone(), a0.clone().addScaledVector(T.sub(WP(B.la)).normalize(), S.PROTRACTION_G * k * this.epK)); } }
        this.rapproche = 0; if (mains && !seule && B.ra && B.la) for (let it = 0; it < 3; it++) {
          const d = V(); let loin = false;
          for (const [h, arm, fore, hand] of [['R', B.ra, B.rf, B.rh], ['L', B.la, B.lf, B.lh]]) {
            const Sh = WP(arm), L = Sh.distanceTo(WP(fore)) + WP(fore).distanceTo(WP(hand)), T = cibleM(h, V(), new THREE.Quaternion()), e = Sh.distanceTo(T) - (h === 'L' ? S.PORTEE_G : 0.97) * L;   // (bras d'appui : presque tendu, voir PORTEE_G)
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
            this.poserBras(h, arm, fore, hand, tp, tq, k, D);
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
        if (this.regard) { const T = new THREE.Vector3(this.regard.x, (this.regard.y !== undefined ? this.regard.y : group.getWorldPosition(V()).y) + VISEE_HAUT, this.regard.z).applyMatrix4(inv); d = T.sub(oeil).normalize(); }
        else d = fwd.clone().multiplyScalar(Math.cos(VISEE_TANGAGE)).addScaledVector(up, Math.sin(VISEE_TANGAGE));
        { let ay = Math.atan2(d.dot(lat), d.dot(fwd)), ap = Math.asin(Math.max(-1, Math.min(1, d.y))); ay = Math.max(-0.6, Math.min(0.6, ay)); ap = Math.max(-0.5, Math.min(0.4, ap));
          d = fwd.clone().multiplyScalar(Math.cos(ay) * Math.cos(ap)).addScaledVector(lat, Math.sin(ay) * Math.cos(ap)).addScaledVector(up, Math.sin(ap)); }
        // direction de visée suivie DANS LE MONDE (voir suivi : sans retard sur une cible qui se déplace ou un pivot, mais un saut de
        // cible devient un mouvement de ~0,2 s) : quand le soldat changeait de cible, le fusil pivotait en UNE image (jusqu'à 27°,
        // 24 000 °/s² en jeu) ; la tête regarde la cible brute (tete()) et devance donc le fusil. Lissé dans le monde, pas dans le
        // repère du groupe qui tourne aussi.
        { const dW = d.clone().transformDirection(group.matrixWorld); let yw = Math.atan2(dW.x, dW.z); const pw = Math.asin(Math.max(-1, Math.min(1, dW.y)));
          const dtA = this.tVis === undefined ? -1 : this.t - this.tVis;
          if (dtA < 0 || dtA > 0.25 || this.visY === undefined) { this.visY = yw; this.visP = pw; this.visYV = 0; this.visPV = 0; this.visYR = yw; this.visPR = pw; }
          else if (dtA > 0) { while (yw - this.visY > Math.PI) yw -= 2 * Math.PI; while (yw - this.visY < -Math.PI) yw += 2 * Math.PI;
            while (this.visYR - yw > Math.PI) this.visYR -= 2 * Math.PI; while (this.visYR - yw < -Math.PI) this.visYR += 2 * Math.PI;
            const h = Math.min(0.1, dtA); suivi(this, 'visY', yw, h, S.VIS_W, 4, S.VIS_A); suivi(this, 'visP', pw, h, S.VIS_W, 3, S.VIS_A);
            // (la tête : même suivi, plus vif — elle devance le fusil d'environ 0,1 s sur un changement de cible)
            if (this.tetY === undefined) { this.tetY = this.visY; this.tetP = this.visP; }
            while (this.tetY - this.visY > Math.PI) this.tetY -= 2 * Math.PI; while (this.tetY - this.visY < -Math.PI) this.tetY += 2 * Math.PI;
            if (this.tetYR !== undefined) { while (this.tetYR - yw > Math.PI) this.tetYR -= 2 * Math.PI; while (this.tetYR - yw < -Math.PI) this.tetYR += 2 * Math.PI; }
            suivi(this, 'tetY', yw, h, 18, 4, 42); suivi(this, 'tetP', pw, h, 18, 3, 42); }
          if (dtA < 0 || dtA > 0.25 || this.tetY === undefined) { this.tetY = this.visY; this.tetP = this.visP; this.tetYV = 0; this.tetPV = 0; this.tetYR = this.visY; this.tetPR = this.visP; }
          this.tVis = this.t;
          const ds = new THREE.Vector3(Math.sin(this.visY) * Math.cos(this.visP), Math.sin(this.visP), Math.cos(this.visY) * Math.cos(this.visP)).transformDirection(inv);
          let ay = Math.atan2(ds.dot(lat), ds.dot(fwd)), ap = Math.asin(Math.max(-1, Math.min(1, ds.y))); ay = Math.max(-0.6, Math.min(0.6, ay)); ap = Math.max(-0.5, Math.min(0.4, ap));
          d = fwd.clone().multiplyScalar(Math.cos(ay) * Math.cos(ap)).addScaledVector(lat, Math.sin(ay) * Math.cos(ap)).addScaledVector(up, Math.sin(ap)); }
        this.visee = d.clone().transformDirection(group.matrixWorld);
        { const dt2 = new THREE.Vector3(Math.sin(this.tetY) * Math.cos(this.tetP), Math.sin(this.tetP), Math.cos(this.tetY) * Math.cos(this.tetP)); this.viseeTete = dt2; }
        const qA = repere(d), E0 = oeil.clone().sub(new THREE.Vector3().fromArray(VISEE_OPTIQUE).applyQuaternion(qA)), PB = creux.clone().sub(butt.clone().applyQuaternion(qA));
        const pA = E0.addScaledVector(d, PB.clone().sub(E0).dot(d));
        if (ea > 0.999) return { q: qA, p: pA };
        // garde basse
        // (le canon suit ~70 % du lacet de la tête : « muzzle follows eyes », FM 3-06.11 §3-15a)
        // (garde basse « athlétique » à l'arrêt, buste de biais ~22° : le fusil croise déjà le corps, le canon revient vers l'axe de la
        // menace de 0,25 rad × lowK — poignets inchangés, 23-36°)
        const pq = GARDE.pique, az = GARDE.dedans - 0.25 * Math.max(0, Math.min(1, this.lowK || 0)) + 0.7 * (this.teteA || 0) * (this.kH === undefined ? 1 : this.kH), dg = fwd.clone().multiplyScalar(Math.cos(pq) * Math.cos(az)).addScaledVector(lat, Math.cos(pq) * Math.sin(az)).addScaledVector(up, -Math.sin(pq));
        const poche = sR.clone().addScaledVector(sL.clone().sub(sR).setY(0).normalize(), POCHE.dedans).addScaledVector(new THREE.Vector3().crossVectors(sL.clone().sub(sR).setY(0).normalize(), up), POCHE.avant).addScaledVector(up, -POCHE.bas);
        const qL = repere(dg), pL = poche.clone().addScaledVector(up, -GARDE.bas).addScaledVector(fwd, GARDE.avant).sub(butt.clone().applyQuaternion(qL));
        return { q: qL.slerp(qA, ea), p: pL.lerp(pA, ea) };
      },
      // poids de la prise à deux mains (priseK, ressort ~0,3 s) ; renvoie le coefficient de lissage de l'image
      majPrise(tient) {
        const dt = Math.max(0, Math.min(0.1, this.t - (this.tPrise === undefined ? this.t : this.tPrise))), deja = this.tPrise === this.t && this.priseK !== undefined; this.tPrise = this.t;
        const kk = dt > 0 ? Math.min(1, dt * 8) : deja && this.t > 0 ? 0 : 1;   // (deux appels dans la même image : un seul pas de lissage)
        // ressort amorti critique (~0,3 s, départ en douceur : pas d'à-coup des mains au début / à la fin d'un rechargement)
        const c = tient ? 1 : 0; if (this.priseK === undefined || (dt === 0 && kk === 1)) { this.priseK = this.priseK === undefined ? 1 : c; this.priseV = 0; }
        else if (dt > 0) { this.priseK = Math.max(0, Math.min(1, lisse2(this, 'prise', this.priseK, c, 10, dt))); if (this.priseK === 0 || this.priseK === 1) this.priseV = 0; }   // (cible filtrée : le fusil et les mains partent sans à-coup)
        return kk;
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
          if (L) {
            // rechargement debout : la main droite porte le fusil dans la « poche de rechargement » (voir poche()), la gauche va
            // au puits de chargeur pendant que chargeur() (app.js) y amène le chargeur neuf
            const ac = mode === 'droite' && RECHARGE[this.clip] && actions[this.clip], p = ac ? Math.min(1, ac.time / ac.getClip().duration) : -1;
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
            // fin du rechargement : la main gauche revient à sa place sous le garde-main ; le fusil est mémorisé pour la reprise
            if (p >= 0 && M.prise && !S.sansPrise) { const xs = Math.max(0, Math.min(1, (p - 0.76) / 0.18)), fin = xs * xs * (3 - 2 * xs); if (fin > 0.01) this.tenir(fin, !weapon.magCenter, 'L'); }   // (doigts ; la main elle-même est menée par mainChargeur)
            if (mode === 'droite') this.armeDroite = { q: weapon.quaternion.clone(), p: weapon.position.clone() };
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
        const procW = twoHands && mode === 'deux' && pL && M.prise && weapon.isMeshy && weapon.buttPt && B.ra && B.la && B.head && !S.sansProc ? Math.min(1, (this.epK || 0) + (this.gbK || 0)) : 0;
        // épaulé : l'épaule de tir avance (protraction de la clavicule droite, un peu vers le bas) AVANT de placer le fusil — le
        // creux de l'épaule avance avec elle, le fusil aussi, et la main d'appui peut aller plus loin sans arracher la crosse
        if (procW > 0.01 && (this.epK || 0) > 0.01 && S.PROT_D > 0 && B.ra && B.ra.parent && B.ra.parent.isBone) { const cl = B.ra.parent, a0 = WP(B.ra).sub(WP(cl)), L0 = a0.length();
          const fwG = new THREE.Vector3(0, 0, 1).applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion())), e = this.epK * procW;
          mod(cl); turn(cl, a0.clone(), a0.clone().addScaledVector(fwG, S.PROT_D * e).addScaledVector(new THREE.Vector3(0, 1, 0), -S.PROT_BAS * e).setLength(L0)); }
        const tient = two || procW > 0.5 || !!this.armeDroite;
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
        if (pk > 0.999) this.armeDroite = null;
        if ((!two || pk < 0.999) && (this.armeDroite || this.handLocal.droite) && M.prise && !S.sansPrise) { const qS = new THREE.Quaternion(), pS = V();
          if (this.armeDroite) { qS.copy(this.armeDroite.q); pS.copy(this.armeDroite.p); } else new THREE.Matrix4().multiplyMatrices(rh.matrixWorld, this.handLocal.droite).premultiply(inv).decompose(pS, qS, V());
          const k2 = two || this.armeDroite ? pk : 0; weapon.quaternion.copy(qS.slerp(weapon.quaternion, k2)); pos.copy(pS.lerp(pos, k2)); }
        if (procW > 0.01) { const Pp = this.poseArme(loc, inv);
          // position lissée (ressort ~0,1 s, repère du groupe) : le fusil n'encaisse pas tout le rebond des pas (les bras l'absorbent)
          // — en garde basse seulement : épaulé, il bougeait jusqu'à 6 cm par rapport à l'épaule et à l'œil (course visée, LISSE_VISE)
          if (this.tPose !== undefined && this.t > this.tPose && this.pArme && !S.sansLisse) { const dtp = Math.min(0.1, this.t - this.tPose), w0 = 11, e = Pp.p.clone().sub(this.pArme), a = e.multiplyScalar(w0 * w0).addScaledVector(this.vArme, -2 * w0);
            this.vArme.addScaledVector(a, dtp); this.pArme.addScaledVector(this.vArme, dtp); { const e2 = this.pArme.clone().sub(Pp.p), L2 = e2.length(); if (L2 > 0.03) { this.pArme.copy(Pp.p).addScaledVector(e2, 0.03 / L2); this.vArme.multiplyScalar(0.5); } } Pp.p.lerp(this.pArme, 1 - (S.LISSE_VISE || 0) * Math.max(0, Math.min(1, this.epK || 0))); }   // (retard limité à 3 cm : transitions rapides sans à-coup)
          else if (this.tPose !== this.t || !this.pArme) { this.pArme = Pp.p.clone(); this.vArme = V(); }
          this.tPose = this.t;
          const w = procW * (M.prise && !S.sansPrise ? pk : 1); weapon.quaternion.slerp(Pp.q, w); pos.lerp(Pp.p, w); }
        barrel.set(0, 0, 1).applyQuaternion(weapon.quaternion);
        weapon.position.copy(pos).addScaledVector(barrel, -(recoil || 0) * 0.04);
        // recul : la bouche se relève un peu (~2°) autour de la crosse, les mains suivent (tenir)
        if ((recoil || 0) > 0.01 && weapon.buttPt && !S.sansPrise) { const ax = new THREE.Vector3().crossVectors(barrel, new THREE.Vector3(0, 1, 0)); if (ax.lengthSq() > 1e-6) {
          ax.normalize(); const qr = new THREE.Quaternion().setFromAxisAngle(ax, recoil * 0.035), bL = weapon.buttPt.clone().applyQuaternion(weapon.quaternion), b0 = weapon.position.clone().add(bL);
          weapon.quaternion.premultiply(qr); weapon.position.copy(b0.sub(bL.applyQuaternion(qr))); } }
        // mains à leur place sur le fusil, doigts refermés dessus (voir calculerPrise) ; index sur la détente en tir
        { const kk = this.majPrise(tient);
          this.detK = (this.detK || 0) + (((recoil || 0) > 0.02 || ((this.epK || 0) > 0.6 && this.regard) ? 1 : 0) - (this.detK || 0)) * kk;
          if (tient || this.armeDroite) this.tenir(this.armeDroite ? 1 : this.priseK, true); }   // (après un rechargement, les mains restent sur le fusil qui rejoint sa place)
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
