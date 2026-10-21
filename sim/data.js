// Données du jeu : armes, protections, opérateurs. Chaque valeur est utilisée par le moteur (sim/engine.js).
(function (root) {
  // ---- ARMES -------------------------------------------------------------------------
  // accuracy  : précision de base (0..1) pour un tireur moyen, à mi-portée efficace
  // damage    : dégâts moyens d'une balle au torse sans protection (PV sur 100)
  // range     : portée efficace (m). Au-delà, la précision chute fortement.
  // minRange  : en dessous, l'arme est pénalisée (encombrement, fusil de précision)
  // rpm       : cadence pendant une rafale (coups / minute) ; les rafales sont courtes (3 à 5 coups) et séparées
  // soutenue  : cadence moyenne sur un échange (coups / minute) : tir de suppression, note de l'arme
  // mag       : balles par chargeur
  // reload    : temps de rechargement (s)
  // aim       : temps de mise en joue sur une nouvelle cible (s)
  // falloff   : fraction des dégâts à la portée efficace (1 = pas de perte)
  // suppress  : effet de suppression de chaque tir proche de la cible (0..1)
  // kit       : nombre de chargeurs emportés (en plus de celui dans l'arme)
  const WEAPONS = {
    // une seule arme pour l'instant (on retravaille le contenu un élément après l'autre) : le fusil d'assaut 5,56
    carbine:  { id: 'carbine',  name: 'Fusil d\'assaut 5,56', cls: 'fusil',    accuracy: 0.60, damage: 42, range: 45, minRange: 0,  rpm: 300, soutenue: 110, mag: 30,  reload: 2.6, aim: 0.55, falloff: 0.8,  suppress: 0.14, kit: 6 },
  };
  // ---- ACCESSOIRES D'ARME : un par emplacement (optique, bouche, poignée, chargeur), achetés une fois, montés sur un opérateur.
  // Effets réels dans engine.js (recherche « accessoire ») ; not : classes d'arme qui ne l'acceptent pas.
  const ATTACHMENTS = {
    lunette:      { id: 'lunette',      slot: 'optique',  name: 'Lunette ×3',                price: 180, not: ['brèche', 'pm'],   desc: 'Précision +12 % au-delà de 25 m ; mise en joue 15 % plus lente.' },
    holo:         { id: 'holo',         slot: 'optique',  name: 'Viseur holographique',      price: 120, not: ['tireur'],         desc: 'Précision +6 % sous 25 m ; mise en joue 10 % plus rapide.' },
    silencieux:   { id: 'silencieux',   slot: 'bouche',   name: 'Silencieux',                price: 200, not: ['brèche', 'appui'], desc: 'Tirs entendus à 18 m au lieu de 70, pas d\'éclair de nuit ; dégâts −8 %.' },
    compensateur: { id: 'compensateur', slot: 'bouche',   name: 'Compensateur',              price: 120, not: ['brèche'],         desc: 'Perte de précision en rafale réduite de 40 %.' },
    poignee:      { id: 'poignee',      slot: 'poignee',  name: 'Poignée verticale',         price: 100, not: [],                 desc: 'Tir en mouvement : précision ×0,66 au lieu de ×0,55.' },
    chargeur:     { id: 'chargeur',     slot: 'chargeur', name: 'Chargeur grande capacité',  price: 150, not: ['brèche', 'tireur'], desc: '+50 % de cartouches par chargeur ; rechargement 20 % plus long.' },
  };

  // ---- PROTECTIONS -------------------------------------------------------------------
  // torso : fraction des dégâts au torse absorbée ; head : au casque ; mobility : multiplicateur de vitesse
  const ARMORS = {
    light:  { id: 'light',  name: 'Gilet léger (IIIA)',   torso: 0.20, head: 0.15, mobility: 1.00 },
    medium: { id: 'medium', name: 'Plaques moyennes (III)', torso: 0.40, head: 0.20, mobility: 0.90 },
    heavy:  { id: 'heavy',  name: 'Plaques lourdes (IV)', torso: 0.58, head: 0.25, mobility: 0.78 },
    // à acheter à l'armurerie
    assaultv: { id: 'assaultv', name: 'Gilet d\'assaut (IIIA+)', torso: 0.28, head: 0.18, mobility: 1.00 },
    composite: { id: 'composite', name: 'Plaques composites (III+)', torso: 0.48, head: 0.22, mobility: 0.92 },
  };

  // ---- RÔLES -------------------------------------------------------------------------
  // Le rôle oriente l'IA (voir engine.js : decide) et l'arme par défaut.
  // weapons : armes que ce rôle sait employer (la première est celle par défaut)
  const ROLES = {
    assault:  { id: 'assault',  name: 'Assaut',      weapon: 'carbine', weapons: ['carbine'], grenades: { frag: 1 } },
    pointman: { id: 'pointman', name: 'Pointe',      weapon: 'carbine', weapons: ['carbine'], grenades: { flash: 1 } },
    marksman: { id: 'marksman', name: 'Tireur d\'élite', weapon: 'carbine', weapons: ['carbine'], grenades: {} },
    support:  { id: 'support',  name: 'Appui',       weapon: 'carbine', weapons: ['carbine'], grenades: {} },
    breacher: { id: 'breacher', name: 'Brèche',      weapon: 'carbine', weapons: ['carbine'], grenades: { frag: 1, flash: 1 } },
  };

  // ---- COMPÉTENCES -----------------------------------------------------------------------
  // Une compétence par opérateur. Chaque effet est implémenté dans engine.js (recherche « trait »).
  const TRAITS = {
    fasthands:   { id: 'fasthands',   name: 'Mains sûres',       desc: 'Recharge 35 % plus vite et met en joue 20 % plus vite.' },
    eagle:       { id: 'eagle',       name: 'Œil de lynx',       desc: 'Voit 20 % plus loin et repère les ennemis plus vite.' },
    patience:    { id: 'patience',    name: 'Patience',          desc: 'Le premier tir sur une cible visée posément a 25 % de chances en plus de toucher.' },
    steady:      { id: 'steady',      name: 'Sang-froid',        desc: 'Récupère de la suppression 50 % plus vite et se laisse moins clouer au sol.' },
    breach:      { id: 'breach',      name: 'Enfonceur',         desc: 'Fusil à pompe et pistolet-mitrailleur font 15 % de dégâts en plus sous 10 m.' },
    leader:      { id: 'leader',      name: 'Meneur',            desc: 'Les alliés à moins de 12 m récupèrent plus vite de la suppression et tiennent mieux sous le feu.' },
    runner:      { id: 'runner',      name: 'Sprinteur',         desc: 'Se déplace 15 % plus vite.' },
    opportunity: { id: 'opportunity', name: 'Tir d\'opportunité', desc: 'Touche plus facilement les cibles en mouvement (pénalité réduite de moitié).' },
    colossus:    { id: 'colossus',    name: 'Colosse',           desc: '+10 points de vie ; les protections lourdes le ralentissent deux fois moins.' },
    hardened:    { id: 'hardened',    name: 'Endurci',           desc: 'Les blessures réduisent deux fois moins sa précision et sa vitesse.' },
    radio:       { id: 'radio',       name: 'Radio',             desc: 'Transmet immédiatement ce qu\'il voit et garde les positions connues 50 % plus longtemps.' },
    ambusher:    { id: 'ambusher',    name: 'Affût',             desc: 'Immobile depuis 3 s, il tire comme depuis une position préparée, quel que soit l\'ordre.' },
    gunner:      { id: 'gunner',      name: 'Tir soutenu',       desc: 'Perd deux fois moins de précision en rafale longue ; suppression 20 % plus forte.' },
    grenadier:   { id: 'grenadier',   name: 'Grenadier',         desc: 'Une grenade à fragmentation de plus ; lance jusqu\'à 30 m au lieu de 24.' },
    sentinel:    { id: 'sentinel',    name: 'Vigie',             desc: 'Entend les tirs 40 % plus loin et les pas d\'un ennemi en mouvement à moins de 12 m, même sans le voir.' },
    medic:       { id: 'medic',       name: 'Secouriste',        desc: 'Soigne les alliés blessés à moins de 5 m (1,5 PV/s chacun, jusqu\'à 70 %) quand ils ne sont plus touchés depuis 4 s.' },
    ghost:       { id: 'ghost',       name: 'Fantôme',           desc: 'Plus difficile à repérer (−40 %) ; ses tirs s\'entendent moins loin.' },
  };

  // ---- CONDITIONS (heure, météo) : effets réels sur la perception, l'ouïe et la précision (engine.js : this.cond) ----
  // vis : portée de vue ; spot : chance de repérer ; hear : portée d'ouïe ; acc : précision au-delà de 15 m ;
  // flash : de nuit, un tireur non silencieux se trahit (repéré à pleine portée, chance ×flash).
  const CONDITIONS = {
    jour:       { id: 'jour',       name: 'Jour',       vis: 1,    spot: 1,    hear: 1,   acc: 1,    flash: 1 },
    nuit:       { id: 'nuit',       name: 'Nuit',       vis: 0.5,  spot: 0.65, hear: 1.1, acc: 0.9,  flash: 1.8 },
    brouillard: { id: 'brouillard', name: 'Brouillard', vis: 0.45, spot: 0.8,  hear: 1,   acc: 0.92, flash: 1 },
    pluie:      { id: 'pluie',      name: 'Pluie',      vis: 0.8,  spot: 0.85, hear: 0.65, acc: 0.94, flash: 1 },
  };

  // ---- CONTRATS DU JOUR : trois objectifs tirés chaque jour (même tirage pour une même date), payés une fois atteints ----
  // goal : [min, max] tiré au sort ; tous se mesurent sur les batailles réellement jouées (missions, bataille rapide, ligue).
  const DAILY = [
    { id: 'wins',      text: 'Gagner {n} batailles',                              goal: [2, 3],  reward: 150 },
    { id: 'kills',     text: 'Neutraliser {n} adversaires',                       goal: [12, 20], reward: 120 },
    { id: 'headshots', text: 'Réussir {n} tirs à la tête',                        goal: [3, 5],  reward: 120 },
    { id: 'capture',   text: 'Gagner {n} bataille de capture de zone',            goal: [1, 1],  reward: 150 },
    { id: 'weather',   text: 'Gagner {n} bataille de nuit ou par mauvais temps',  goal: [1, 1],  reward: 160 },
    { id: 'revives',   text: 'Relever {n} allié à terre',                         goal: [1, 1],  reward: 120 },
    { id: 'quick',     text: 'Gagner {n} batailles rapides',                      goal: [2, 2],  reward: 150 },
    { id: 'clean',     text: 'Gagner {n} bataille en perdant au plus un opérateur', goal: [1, 1], reward: 180 },
  ];

  // ---- GRENADES (lancées par l'IA ; dotation par rôle ci-dessus) ---------------------------------------------
  // frag : dégâts décroissants jusqu'à radius (bloqués par les murs), suppression jusqu'à 9 m, tir ami possible.
  // flash : aveugle (aucun nouveau repérage, précision ×0,25) ceux qui voient l'éclair dans radius.
  const GRENADES = {
    frag:  { id: 'frag',  name: 'grenade', damage: 110, radius: 6, fuse: 1.3, suppress: 0.7 },
    flash: { id: 'flash', name: 'grenade incapacitante', radius: 7, fuse: 0.35, blind: 3.5, suppress: 0.5 },
    // smoke : nuage qui bloque la vue (repérage et tir visé) pendant duration secondes ; un par opérateur, pour couvrir l'évacuation d'un blessé
    smoke: { id: 'smoke', name: 'grenade fumigène', radius: 4.5, fuse: 0.8, duration: 14, suppress: 0 },
  };

  // ---- SYNERGIES D'ESCOUADE (chaîne de rôles, comme dans le jeu d'origine) ---------------
  // Tant qu'un opérateur « source » est debout, les alliés « cibles » (autres que lui) reçoivent le bonus. Effets dans engine.js
  // (recherche « synergie »). La source et les cibles se décrivent par rôle (role) et/ou par compétence (trait).
  const SYNERGIES = [
    { id: 'commandement', name: 'Commandement', source: { trait: 'leader' }, target: { trait: 'radio', role: 'support' }, effect: 'dégâts subis −10 %',
      desc: 'Un Meneur debout couvre son radio et ses servants d\'arme d\'appui : ils subissent 10 % de dégâts en moins.' },
    { id: 'guidage', name: 'Guidage radio', source: { trait: 'radio' }, target: { role: ['marksman', 'support', 'breacher'] }, effect: 'précision +8 %',
      desc: 'Un Radio debout transmet les corrections de tir : tireurs d\'élite, appuis et brècheurs gagnent 8 % de précision.' },
    { id: 'appui', name: 'Appui-feu', source: { role: 'support' }, target: { role: ['assault', 'pointman'] }, effect: 'récupération de la suppression +20 %',
      desc: 'Une arme d\'appui qui tient l\'adversaire sous son feu : les assaillants et éclaireurs se remettent 20 % plus vite d\'être cloués.' },
    { id: 'freres', name: 'Frères d\'armes', source: { nation: true }, target: { nation: true }, effect: 'mise en joue 10 % plus rapide',
      desc: 'Deux opérateurs du même pays (même école, mêmes procédures) : tant que l\'autre est debout, chacun met en joue 10 % plus vite.' },
  ];
  // Blessure grave : un opérateur neutralisé revient « gravement blessé » ; il peut combattre mais ses compétences sont divisées par deux
  // et ses points de vie réduits d'un quart, jusqu'à ce qu'il soit soigné (crédits) ou qu'il se repose (missions sans lui).
  const WOUND = { statFactor: 0.5, hpFactor: 0.75, restMissions: 2 };

  // ---- OPÉRATEURS --------------------------------------------------------------------
  // Statistiques (0..100) toutes exploitées par le moteur :
  //  marksmanship : précision (multiplie la précision de l'arme)
  //  reflexes     : vitesse d'acquisition de cible (réduit le temps de visée)
  //  mobility     : vitesse de déplacement
  //  perception   : distance et chance de détection
  //  composure    : résistance à la suppression et aux blessures (tir sous le feu)
  //  endurance    : points de vie (80 + endurance/5)
  // Inspirations : unités réelles (nom de l'unité), personnages fictifs.
  // rarity : 1 commun, 2 rare, 3 élite — sert au prix de recrutement et à la présentation
  const OPERATORS = [
    // une seule unité pour l'instant : cinq opérateurs du GIGN (personnages fictifs, aucun insigne réel). Pour l'instant une seule
    // classe (assaut) et une seule protection (plaques moyennes), des deux côtés ; les autres classes reviendront une à une.
    { id: 'op_vautour', callsign: 'Vautour', unit: 'GIGN (France)', role: 'assault',  armor: 'medium', trait: 'fasthands', rarity: 1, marksmanship: 74, reflexes: 70, mobility: 68, perception: 66, composure: 78, endurance: 72 },
    { id: 'op_lynx',    callsign: 'Lynx',    unit: 'GIGN (France)', role: 'assault', armor: 'medium',  trait: 'eagle',     rarity: 1, marksmanship: 66, reflexes: 84, mobility: 86, perception: 74, composure: 64, endurance: 62 },
    { id: 'op_granit',  callsign: 'Granit',  unit: 'GIGN (France)', role: 'assault', armor: 'medium',  trait: 'patience',  rarity: 2, marksmanship: 90, reflexes: 60, mobility: 58, perception: 88, composure: 82, endurance: 60 },
    { id: 'op_bastion', callsign: 'Bastion', unit: 'GIGN (France)', role: 'assault',  armor: 'medium',  trait: 'medic',     rarity: 1, marksmanship: 58, reflexes: 56, mobility: 54, perception: 60, composure: 86, endurance: 90 },
    { id: 'op_belier',  callsign: 'Bélier',  unit: 'GIGN (France)', role: 'assault', armor: 'medium',  trait: 'breach',    rarity: 1, marksmanship: 62, reflexes: 72, mobility: 70, perception: 58, composure: 76, endurance: 84 },

    // ---- Faction adverse : « Groupe Karst », société militaire privée fictive (non recrutable) ----
    { id: 'k_molosse', callsign: 'Molosse', unit: 'Groupe Karst — section d\'assaut', faction: 'karst', role: 'assault',  armor: 'medium', trait: 'leader',      rarity: 2, marksmanship: 70, reflexes: 70, mobility: 68, perception: 62, composure: 76, endurance: 76 },
    { id: 'k_vipere',  callsign: 'Vipère',  unit: 'Groupe Karst — éclaireurs',        faction: 'karst', role: 'assault', armor: 'medium',  trait: 'ghost',       rarity: 2, marksmanship: 64, reflexes: 86, mobility: 86, perception: 78, composure: 62, endurance: 60 },
    { id: 'k_rapace',  callsign: 'Rapace',  unit: 'Groupe Karst — tireurs',           faction: 'karst', role: 'assault', armor: 'medium',  trait: 'patience',    rarity: 3, marksmanship: 90, reflexes: 60, mobility: 58, perception: 88, composure: 82, endurance: 60 },
    { id: 'k_hyene',   callsign: 'Hyène',   unit: 'Groupe Karst — appui feu',         faction: 'karst', role: 'assault',  armor: 'medium',  trait: 'gunner',      rarity: 2, marksmanship: 58, reflexes: 56, mobility: 54, perception: 60, composure: 86, endurance: 90 },
    { id: 'k_chacal',  callsign: 'Chacal',  unit: 'Groupe Karst — brèche',            faction: 'karst', role: 'assault', armor: 'medium',  trait: 'breach',      rarity: 2, marksmanship: 62, reflexes: 74, mobility: 70, perception: 56, composure: 76, endurance: 84 },
    { id: 'k_fauve',   callsign: 'Fauve',   unit: 'Groupe Karst — section d\'assaut', faction: 'karst', role: 'assault',  armor: 'medium', trait: 'runner',      rarity: 2, marksmanship: 72, reflexes: 76, mobility: 78, perception: 66, composure: 66, endurance: 70 },
    { id: 'k_taipan',  callsign: 'Taïpan',  unit: 'Groupe Karst — tireurs',           faction: 'karst', role: 'assault', armor: 'medium', trait: 'ambusher',    rarity: 3, marksmanship: 86, reflexes: 62, mobility: 60, perception: 84, composure: 84, endurance: 66 },
    { id: 'k_bison',   callsign: 'Bison',   unit: 'Groupe Karst — appui feu',         faction: 'karst', role: 'assault',  armor: 'medium',  trait: 'colossus',    rarity: 2, marksmanship: 56, reflexes: 58, mobility: 56, perception: 60, composure: 88, endurance: 92 },

  ];
  // Factions : couleurs d'uniforme (rendu) et nom
  const FACTIONS = {
    allied: { id: 'allied', name: 'Coalition', uniform: 0x3a4a3c, vest: 0x2b352d },
    karst:  { id: 'karst',  name: 'Groupe Karst', uniform: 0x3b3a40, vest: 0x5a2628, glyph: '⚑' },
  };

  // ---- ORDRES TACTIQUES --------------------------------------------------------------
  // Chaque ordre modifie réellement les décisions (engine.js : decide / chooseTarget / movement).
  const ORDERS = {
    assault: { id: 'assault', name: 'Assaut',     desc: 'Avancer vers l\'ennemi, chercher le contact.' },
    hold:    { id: 'hold',    name: 'Tenir',      desc: 'Rester près de la position de départ, se couvrir, ouvrir le feu à vue.' },
    careful: { id: 'careful', name: 'Prudent',    desc: 'Avancer de couvert en couvert, se replier si blessé.' },
  };

  // ---- MISSIONS ----------------------------------------------------------------------
  // enemy : composition (identifiants d'opérateurs), level : niveau des ennemis, order : leur ordre tactique
  // reward : crédits en cas de victoire (la défaite rapporte une fraction), xp : expérience de base par opérateur engagé
  const MISSIONS = [
    // une seule carte pour l'instant : le parking de la Grand-Rue ; tactiques : le tiroir (bonds alternés) et les plans de voies
    { id: 'patrouille', name: 'Patrouille accrochée', desc: 'Une patrouille du Groupe Karst traverse le parking de la Grand-Rue. Interceptez-la.', mapId: 'parking', enemy: ['k_molosse', 'k_vipere', 'k_hyene', 'k_chacal'], level: 0, order: 'careful', enemyTactics: ['tiroir'], reward: 180, xp: 40, difficulty: 1 },
    { id: 'galerie', name: 'Balise de la galerie', desc: 'Les balises de notre agent disparu émettent depuis l\'enclos central du parking. Prenez la zone et tenez-la jusqu\'à 100 %.', mapId: 'parking', enemy: ['k_fauve', 'k_vipere', 'k_hyene', 'k_chacal', 'k_molosse'], level: 1, order: 'careful', objective: 'capture', enemyTactics: ['tiroir'], reward: 240, xp: 50, difficulty: 2 },
    { id: 'assaut', name: 'Assaut frontal', desc: 'Une équipe aguerrie fonce au contact entre les voitures. Tenez ou contre-attaquez.', mapId: 'parking', enemy: ['k_molosse', 'k_rapace', 'k_bison', 'k_chacal', 'k_fauve'], level: 3, order: 'assault', enemyTactics: ['tiroir'], reward: 300, xp: 60, difficulty: 2 },
    { id: 'tenir', name: 'Tenir le parking', desc: 'Tenez 140 secondes face à un assaut : il suffit qu\'un seul opérateur soit encore en état à l\'échéance.', mapId: 'parking', enemy: ['k_molosse', 'k_fauve', 'k_bison', 'k_chacal', 'k_vipere'], level: 2, order: 'assault', objective: 'hold', duration: 140, enemyTactics: ['tiroir'], reward: 360, xp: 70, difficulty: 3 },
    { id: 'parking', name: 'Nettoyage du parking', desc: 'De nuit, le Groupe Karst s\'est retranché entre les voitures et les barrières. Délogez-le.', mapId: 'parking', conditions: 'nuit', enemy: ['k_molosse', 'k_rapace', 'k_bison', 'k_chacal', 'k_hyene'], level: 5, order: 'hold', enemyTactics: ['tiroir'], reward: 400, xp: 75, difficulty: 3 },
    { id: 'elite', name: 'Détachement d\'élite', desc: 'Les meilleurs opérateurs adverses, mieux entraînés, à l\'assaut. Réservé aux escouades expérimentées.', mapId: 'parking', enemy: ['k_molosse', 'k_rapace', 'k_bison', 'k_taipan', 'k_fauve'], level: 7, order: 'assault', enemyTactics: ['tiroir'], reward: 480, xp: 90, difficulty: 4 },
  ];

  // ---- MODES DE JEU (comme le menu « Jouer » du jeu d'origine) -------------------------------
  // Campagnes : suites de missions débloquées l'une après l'autre (la suivante s'ouvre dès que la précédente a été JOUÉE) ;
  // prime de participation quand toutes ont été jouées, prime de campagne quand toutes ont été gagnées.
  // Vétéran et Élite rejouent les missions avec un adversaire plus aguerri (niveau +), plus de tactiques, de meilleures primes.
  const CAMPAIGNS = [
    { id: 'reguliere', name: 'Campagne régulière', desc: 'Six missions contre le Groupe Karst sur le parking de la Grand-Rue.',
      missions: ['patrouille', 'galerie', 'assaut', 'tenir', 'parking', 'elite'],
      levelBonus: 0, rewardMul: 1, participation: 200, completion: 500, unlock: null },
  ];
  // Bataille rapide : un adversaire à votre mesure (niveau tiré de la puissance d'équipe), carte et objectif au hasard ;
  // un paquet standard offert toutes les QUICK.prizeEvery victoires.
  const QUICK = { prizeEvery: 5, prizePack: 'standard', reward: 150, xp: 35 };
  // Opérations spéciales : objectifs au long cours, progression sur toutes les batailles.
  const SPECIAL_OPS = [
    { id: 'tempete', name: 'Opération Tempête', desc: 'Remporter 25 batailles (tous modes).', goal: 25, stat: 'wins', reward: { credits: 800, pack: 'elite' } },
    { id: 'balises', name: 'Opération Balises', desc: 'Remporter 10 batailles de capture de zone.', goal: 10, stat: 'captureWins', reward: { credits: 500, pack: 'standard' } },
    { id: 'fantome', name: 'Opération Fantôme', desc: 'Remporter 8 batailles sans aucun opérateur neutralisé.', goal: 8, stat: 'cleanWins', reward: { credits: 600, pack: 'elite' } },
  ];

  // ---- TACTIQUES (cartes jouées en bataille ou passives) ---------------------------------
  // Chaque effet est implémenté dans engine.js (useTactic / applyPassiveTactics). active : déclenchée par le joueur
  // (uses : nombre d'emplois par bataille, cooldown en s) ; sinon passive, appliquée au début.
  const TACTICS = {
    // Tiroir : l'escouade progresse par bonds alternés — une moitié avance de couvert en couvert
    // pendant que l'autre, arrêtée, la couvre ; puis les rôles s'inversent (engine.js : recherche « tiroir »).
    tiroir: { id: 'tiroir', name: 'Tiroir', active: false, desc: 'Progression par bonds alternés : une moitié de l\'escouade avance pendant que l\'autre la couvre, arrêtée et prête à tirer, puis on inverse.' },
    // Plans de voies (plan : [flanc nord, flanc sud], le reste au milieu) : équipé, il fixe la répartition sur les voies au départ
    // (sans plan : tirage à la graine, 1 ou 2 par flanc) ; relancé en bataille, il redistribue les survivants (engine.js : replan).
    tenailles: { id: 'tenailles', name: 'Tenailles', active: true, plan: [2, 2], uses: 2, cooldown: 20, desc: 'Plan de voies : deux opérateurs par le flanc nord, deux par le flanc sud, un seul tient le milieu ; on prend l\'adversaire en étau. Relancé en bataille, il redéploie les survivants selon ce plan.' },
    rush_milieu: { id: 'rush_milieu', name: 'Rush milieu', active: true, plan: [0, 0], uses: 2, cooldown: 20, desc: 'Plan de voies : toute l\'escouade passe par l\'axe central, groupée, pour forcer le passage. Relancé en bataille, il regroupe les survivants au milieu.' },
    // Vague 2 (strategies_gign.md T4, T7, T1b) — cartes de l'escouade du joueur seulement (joueur: true : jamais données à l'adversaire)
    fixer_deborder: { id: 'fixer_deborder', name: 'Fixer et déborder', active: true, joueur: true, uses: 2, cooldown: 25, desc: 'Au moment choisi : les deux opérateurs les plus proches de l\'ennemi repéré le fixent par un tir d\'appui ; les autres le contournent par le flanc le plus court et l\'encerclent.' },
    eclaireur: { id: 'eclaireur', name: 'Éclaireur', active: false, joueur: true, desc: 'L\'opérateur le plus perceptif avance seul en tête ; les autres suivent à une vingtaine de mètres et ne s\'engagent qu\'au contact. Remplace le Tiroir tant qu\'il n\'y a pas de contact.' },
    tiroir_lent: { id: 'tiroir_lent', name: 'Tiroir lent', active: false, joueur: true, desc: 'Tiroir plus sûr : un trinôme bondit pendant qu\'un binôme reste la base de feu ; le binôme ne passe jamais devant, il rejoint quand le trinôme est en place.' },
  };

  // ---- DÉFIS -------------------------------------------------------------------------
  // Récompense unique, vérifiée sur le résultat réel de la mission (les conditions sont codées dans game.js : CHALLENGE_CHECKS).
  const CHALLENGES = [
    { id: 'sans_perte', name: 'Sans perte',          desc: 'Réussir une mission sans aucun opérateur neutralisé.', reward: 200 },
    { id: 'a_trois',    name: 'À trois',             desc: 'Réussir une mission avec une escouade de trois.', reward: 250 },
    { id: 'pas_un_pouce', name: 'Pas un pouce',      desc: 'Réussir « Tenir le parking » avec cinq opérateurs encore en état.', reward: 300 },
    { id: 'tireur',     name: 'Œil du tireur',       desc: 'Un tireur d\'élite neutralise trois adversaires dans une même mission.', reward: 200 },
    { id: 'elite',      name: 'Détachement brisé',   desc: 'Réussir « Détachement d\'élite ».', reward: 400 },
  ];

  // ---- PERSONNALISATION ----------------------------------------------------------------
  const INSIGNIAS = [
    { id: 'etoile', name: 'Étoile', glyph: '✶' }, { id: 'bouclier', name: 'Bouclier', glyph: '⛨' }, { id: 'aigle', name: 'Aigle', glyph: '⚚' },
    { id: 'eclair', name: 'Éclair', glyph: '⚡' }, { id: 'ancre', name: 'Ancre', glyph: '⚓' }, { id: 'rose', name: 'Rose des vents', glyph: '✵' },
    { id: 'epee', name: 'Glaive', glyph: '†' }, { id: 'couronne', name: 'Couronne', glyph: '♔' }, { id: 'cible', name: 'Cible', glyph: '◎' }, { id: 'flamme', name: 'Flamme', glyph: '♨' },
  ];
  const UNIFORMS = [
    // camo : terrains (ou conditions) où la tenue se fond dans le décor — l'adversaire a 10 % de chances en moins de repérer l'escouade
    { id: 'olive', name: 'Olive', uniform: 0x3a4a3c, vest: 0x2b352d, camo: { maps: ['entrepot'], conditions: ['brouillard'] } },
    { id: 'urbain', name: 'Urbain', uniform: 0x4a4e55, vest: 0x2a2d33, camo: { maps: ['place', 'parking'] } },
    { id: 'desert', name: 'Désert', uniform: 0x8a7a55, vest: 0x5d523a, camo: { maps: ['raffinerie', 'gare'] } },
    { id: 'nuit', name: 'Nuit', uniform: 0x252a36, vest: 0x161a22, camo: { conditions: ['nuit'] } },
    { id: 'gris', name: 'Gris acier', uniform: 0x5c6066, vest: 0x3a3d42, camo: { maps: ['gare'], conditions: ['pluie'] } },
    { id: 'sable', name: 'Sable', uniform: 0x9c8a62, vest: 0x6e6046, camo: { maps: ['raffinerie'], conditions: ['brouillard'] } },
    { id: 'marine', name: 'Marine', uniform: 0x2c3a52, vest: 0x1d2636, camo: { maps: ['entrepot'], conditions: ['nuit'] } },
  ];
  // ---- RANGS DU JOUEUR -------------------------------------------------------------------
  const RANKS = [
    { xp: 0, name: 'Recrue' }, { xp: 150, name: 'Opérateur' }, { xp: 400, name: 'Chef d\'équipe' }, { xp: 800, name: 'Sergent' },
    { xp: 1400, name: 'Adjudant' }, { xp: 2200, name: 'Lieutenant' }, { xp: 3300, name: 'Capitaine' }, { xp: 4800, name: 'Commandant' },
  ];
  // ---- PAQUETS DE CARTES -----------------------------------------------------------------
  // Tirage : poids par type de carte. operator → recrue (ou XP si déjà connu) ; tactic → tactique ; perk → +2 à une statistique
  // d'un opérateur (max +10 par statistique) ; xp → expérience d'un opérateur ; credits ; cosmetic → insigne / uniforme.
  const PACKS = {
    standard: { id: 'standard', name: 'Paquet standard', price: 150, cards: 3, weights: { operator: 14, tactic: 16, perk: 34, xp: 20, credits: 12, cosmetic: 4 } },
    elite:    { id: 'elite',    name: 'Paquet élite',    price: 420, cards: 5, weights: { operator: 26, tactic: 22, perk: 30, xp: 10, credits: 6, cosmetic: 6 } },
  };

  // ---- SUCCÈS ----------------------------------------------------------------------------
  // Vérifiés sur le profil après chaque bataille (game.js : ACHIEVEMENT_CHECKS). Icône affichée à côté du nom d'équipe.
  const ACHIEVEMENTS = [
    { id: 'premiere',   name: 'Première victoire',  glyph: '★', desc: 'Remporter une bataille.', reward: { credits: 100 } },
    { id: 'dix',        name: 'Dix victoires',      glyph: '✪', desc: 'Remporter dix batailles.', reward: { headgear: 'beret_rouge' } },
    { id: 'chasseur',   name: 'Chasseur',           glyph: '◎', desc: 'Cinquante neutralisations en carrière.', reward: { headgear: 'chapeau' } },
    { id: 'veteran',    name: 'Vétéran',            glyph: '✦', desc: 'Amener un opérateur au niveau 5.', reward: { headgear: 'beret_vert' } },
    { id: 'podium',     name: 'Sur le podium',      glyph: '♛', desc: 'Finir une saison de ligue dans les trois premiers.', reward: { uniform: 'nuit' } },
    { id: 'intact',     name: 'Sans une égratignure', glyph: '❖', desc: 'Gagner avec cinq opérateurs à plus de 90 % de vie.', reward: { headgear: 'foulard_rouge' } },
    { id: 'croise',     name: 'Tir croisé',         glyph: '✛', desc: 'Dix neutralisations de groupe en carrière.', reward: { insignia: 'eclair' } },
    { id: 'precision',  name: 'Tête froide',        glyph: '⊕', desc: 'Vingt-cinq tirs à la tête en carrière.', reward: { headgear: 'lunettes_soleil' } },
    { id: 'sauveteur',  name: 'Sauveteur',          glyph: '✚', desc: 'Relever cinq alliés à terre.', reward: { credits: 300 } },
    { id: 'nocturne',   name: 'Oiseau de nuit',     glyph: '☾', desc: 'Gagner cinq batailles de nuit.', reward: { insignia: 'rose' } },
    { id: 'terrain',    name: 'Maître du terrain',  glyph: '⬢', desc: 'Gagner cinq batailles de capture de zone.', reward: { insignia: 'ancre' } },
    { id: 'campagne',   name: 'Campagne accomplie', glyph: '⚑', desc: 'Gagner toutes les missions de la campagne régulière.', reward: { uniform: 'desert' } },
  ];
  // ---- PROMOTIONS : second trait au choix (niveau 5), troisième (niveau 10) ----------------
  // Deux propositions par palier, tirées parmi les traits que l'opérateur n'a pas.
  const PROMOTION_LEVELS = [5, 10];
  // ---- CONTRATS ----------------------------------------------------------------------------
  // Chaque opérateur recrutable a un contrat en missions (« tours »). À zéro, il faut le renouveler (crédits selon la rareté)
  // ou il devient inactif (reste dans la collection, ne peut pas être engagé). Les opérateurs de départ ont un contrat long.
  const CONTRACT = { tours: { 1: 16, 2: 14, 3: 12 }, renewPrice: { 1: 120, 2: 200, 3: 320 }, startingTours: 24 };

  // ---- ÉCONOMIE ----------------------------------------------------------------------
  const PRICES = {
    operator: { 1: 250, 2: 450, 3: 700 },           // recrutement selon la rareté
    weapon:   { carbine: 0 },
    armor:    { light: 0, medium: 150, heavy: 320, assaultv: 220, composite: 420 },
  };
  // Expérience nécessaire pour atteindre chaque niveau (niveau 0 → 1 : 100, etc.) ; +2 à chaque statistique par niveau (max 10).
  const XP_TABLE = [0, 100, 230, 400, 620, 900, 1250, 1700, 2250, 2900, 3650];
  const LEVEL_STAT_BONUS = 2, MAX_LEVEL = 10;

  root.DATA = { WEAPONS, ARMORS, ROLES, OPERATORS, FACTIONS, ORDERS, TRAITS, TACTICS, INSIGNIAS, UNIFORMS, RANKS, PACKS, ACHIEVEMENTS, PROMOTION_LEVELS, CONTRACT, MISSIONS, CHALLENGES, PRICES, XP_TABLE, LEVEL_STAT_BONUS, MAX_LEVEL, SYNERGIES, WOUND, CAMPAIGNS, QUICK, SPECIAL_OPS, GRENADES, CONDITIONS, DAILY, ATTACHMENTS };
})(typeof module !== 'undefined' ? module.exports : (window.OT = window.OT || {}));
