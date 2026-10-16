// Données du jeu : armes, protections, opérateurs. Chaque valeur est utilisée par le moteur (sim/engine.js).
(function (root) {
  // ---- ARMES -------------------------------------------------------------------------
  // accuracy  : précision de base (0..1) pour un tireur moyen, à mi-portée efficace
  // damage    : dégâts moyens d'une balle au torse sans protection (PV sur 100)
  // range     : portée efficace (m). Au-delà, la précision chute fortement.
  // minRange  : en dessous, l'arme est pénalisée (encombrement, fusil de précision)
  // rpm       : cadence soutenue (coups / minute) — rafales ou coup par coup
  // mag       : balles par chargeur
  // reload    : temps de rechargement (s)
  // aim       : temps de mise en joue sur une nouvelle cible (s)
  // falloff   : fraction des dégâts à la portée efficace (1 = pas de perte)
  // suppress  : effet de suppression de chaque tir proche de la cible (0..1)
  // kit       : nombre de chargeurs emportés (en plus de celui dans l'arme)
  const WEAPONS = {
    carbine:  { id: 'carbine',  name: 'Carabine 5,56',      cls: 'fusil',    accuracy: 0.50, damage: 32, range: 45, minRange: 0,  rpm: 110, mag: 30,  reload: 2.6, aim: 0.55, falloff: 0.8,  suppress: 0.14, kit: 6 },
    smg:      { id: 'smg',      name: 'Pistolet-mitrailleur 9 mm', cls: 'pm', accuracy: 0.56, damage: 25, range: 24, minRange: 0,  rpm: 170, mag: 30,  reload: 2.0, aim: 0.3,  falloff: 0.5,  suppress: 0.12, kit: 7 },
    dmr:      { id: 'dmr',      name: 'Fusil de précision 7,62', cls: 'tireur', accuracy: 0.72, damage: 58, range: 90, minRange: 15, rpm: 36,  mag: 20,  reload: 3.0, aim: 1.4,  falloff: 0.9,  suppress: 0.28, kit: 5 },
    lmg:      { id: 'lmg',      name: 'Mitrailleuse légère 5,56', cls: 'appui', accuracy: 0.36, damage: 30, range: 55, minRange: 0,  rpm: 210, mag: 100, reload: 6.5, aim: 0.9,  falloff: 0.8,  suppress: 0.26, kit: 3 },
    shotgun:  { id: 'shotgun',  name: 'Fusil à pompe cal. 12', cls: 'brèche', accuracy: 0.80, damage: 85, range: 12, minRange: 0,  rpm: 55,  mag: 7,   reload: 3.8, aim: 0.25, falloff: 0.3,  suppress: 0.2,  kit: 5 },
    // à acheter à l'armurerie
    battle:   { id: 'battle',   name: 'Fusil de combat 7,62', cls: 'fusil',    accuracy: 0.52, damage: 46, range: 60, minRange: 0,  rpm: 75,  mag: 20,  reload: 2.9, aim: 0.7,  falloff: 0.85, suppress: 0.2,  kit: 5 },
    smgsil:   { id: 'smgsil',   name: 'PM 9 mm silencieux', cls: 'pm',    accuracy: 0.58, damage: 22, range: 20, minRange: 0,  rpm: 150, mag: 30,  reload: 2.0, aim: 0.3,  falloff: 0.5,  suppress: 0.07, kit: 7, silenced: true },
  };

  // ---- PROTECTIONS -------------------------------------------------------------------
  // torso : fraction des dégâts au torse absorbée ; head : au casque ; mobility : multiplicateur de vitesse
  const ARMORS = {
    light:  { id: 'light',  name: 'Gilet léger (IIIA)',   torso: 0.20, head: 0.15, mobility: 1.00 },
    medium: { id: 'medium', name: 'Plaques moyennes (III)', torso: 0.40, head: 0.20, mobility: 0.90 },
    heavy:  { id: 'heavy',  name: 'Plaques lourdes (IV)', torso: 0.58, head: 0.25, mobility: 0.78 },
  };

  // ---- RÔLES -------------------------------------------------------------------------
  // Le rôle oriente l'IA (voir engine.js : decide) et l'arme par défaut.
  // weapons : armes que ce rôle sait employer (la première est celle par défaut)
  const ROLES = {
    assault:  { id: 'assault',  name: 'Assaut',      weapon: 'carbine', weapons: ['carbine', 'battle', 'smg', 'smgsil', 'shotgun'] },
    pointman: { id: 'pointman', name: 'Pointe',      weapon: 'smg',     weapons: ['smg', 'smgsil', 'shotgun', 'carbine'] },
    marksman: { id: 'marksman', name: 'Tireur d\'élite', weapon: 'dmr', weapons: ['dmr', 'battle', 'carbine'] },
    support:  { id: 'support',  name: 'Appui',       weapon: 'lmg',     weapons: ['lmg', 'battle', 'carbine'] },
    breacher: { id: 'breacher', name: 'Brèche',      weapon: 'shotgun', weapons: ['shotgun', 'smg', 'smgsil', 'carbine'] },
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
    gunner:      { id: 'gunner',      name: 'Tir soutenu',       desc: 'Rafales longues sans perte de précision, suppression 30 % plus forte.' },
    ghost:       { id: 'ghost',       name: 'Fantôme',           desc: 'Plus difficile à repérer (−40 %) ; ses tirs s\'entendent moins loin.' },
  };

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
    { id: 'op_vautour', callsign: 'Vautour', unit: 'GIGN (France)',           role: 'assault',  armor: 'medium', trait: 'fasthands', rarity: 1, marksmanship: 74, reflexes: 70, mobility: 68, perception: 66, composure: 78, endurance: 72 },
    { id: 'op_lynx',    callsign: 'Lynx',    unit: 'Commando Hubert (France)', role: 'pointman', armor: 'light',  trait: 'eagle', rarity: 1, marksmanship: 66, reflexes: 84, mobility: 86, perception: 74, composure: 64, endurance: 62 },
    { id: 'op_granit',  callsign: 'Granit',  unit: 'GSG 9 (Allemagne)',       role: 'marksman', armor: 'light',  trait: 'patience', rarity: 2, marksmanship: 90, reflexes: 60, mobility: 58, perception: 88, composure: 82, endurance: 60 },
    { id: 'op_bastion', callsign: 'Bastion', unit: 'KSK (Allemagne)',         role: 'support',  armor: 'heavy',  trait: 'steady', rarity: 1, marksmanship: 58, reflexes: 56, mobility: 54, perception: 60, composure: 86, endurance: 90 },
    { id: 'op_belier',  callsign: 'Bélier',  unit: 'SAS (Royaume-Uni)',       role: 'breacher', armor: 'heavy',  trait: 'breach', rarity: 1, marksmanship: 62, reflexes: 72, mobility: 70, perception: 58, composure: 76, endurance: 84 },

    { id: 'op_cobra',   callsign: 'Cobra',   unit: 'Navy SEALs (États-Unis)', role: 'assault',  armor: 'medium', trait: 'leader', rarity: 2, marksmanship: 76, reflexes: 72, mobility: 70, perception: 64, composure: 74, endurance: 74 },
    { id: 'op_furet',   callsign: 'Furet',   unit: 'JTF2 (Canada)',           role: 'pointman', armor: 'light',  trait: 'runner', rarity: 2, marksmanship: 64, reflexes: 86, mobility: 88, perception: 76, composure: 60, endurance: 60 },
    { id: 'op_harfang', callsign: 'Harfang', unit: 'FSK (Norvège)',           role: 'marksman', armor: 'light',  trait: 'opportunity', rarity: 3, marksmanship: 92, reflexes: 58, mobility: 56, perception: 90, composure: 84, endurance: 58 },
    { id: 'op_bouclier',callsign: 'Bouclier',unit: 'GROM (Pologne)',          role: 'support',  armor: 'heavy',  trait: 'colossus', rarity: 2, marksmanship: 56, reflexes: 58, mobility: 52, perception: 62, composure: 88, endurance: 92 },
    { id: 'op_marteau', callsign: 'Marteau', unit: 'Sayeret Matkal (Israël)', role: 'breacher', armor: 'heavy',  trait: 'hardened', rarity: 3, marksmanship: 60, reflexes: 74, mobility: 72, perception: 56, composure: 78, endurance: 86 },

    { id: 'op_sirocco', callsign: 'Sirocco', unit: 'GIS (Italie)',             role: 'assault',  armor: 'light',  trait: 'radio', rarity: 2, marksmanship: 70, reflexes: 78, mobility: 80, perception: 70, composure: 68, endurance: 66 },
    { id: 'op_ardoise', callsign: 'Ardoise', unit: 'SASR (Australie)',         role: 'marksman', armor: 'medium', trait: 'ambusher', rarity: 2, marksmanship: 86, reflexes: 64, mobility: 62, perception: 84, composure: 80, endurance: 68 },
    { id: 'op_enclume', callsign: 'Enclume', unit: 'KCT (Pays-Bas)',           role: 'support',  armor: 'medium', trait: 'gunner', rarity: 1, marksmanship: 62, reflexes: 60, mobility: 62, perception: 62, composure: 82, endurance: 84 },
    { id: 'op_ombre',   callsign: 'Ombre',   unit: 'UEI (Espagne)',            role: 'pointman', armor: 'light',  trait: 'ghost', rarity: 3, marksmanship: 72, reflexes: 90, mobility: 84, perception: 82, composure: 70, endurance: 60 },
  ];

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
    { id: 'patrouille', name: 'Patrouille accrochée', desc: 'Une patrouille adverse de cinq hommes progresse prudemment sur les docks. Interceptez-la.', mapId: 'entrepot', enemy: ['op_cobra', 'op_furet', 'op_bouclier', 'op_marteau', 'op_vautour'], level: 0, order: 'careful', reward: 180, xp: 40, difficulty: 1 },
    { id: 'embuscade', name: 'Position retranchée', desc: 'L\'adversaire tient l\'entrepôt derrière ses conteneurs. Il faudra aller le chercher.', mapId: 'entrepot', enemy: ['op_cobra', 'op_harfang', 'op_bouclier', 'op_marteau', 'op_furet'], level: 3, order: 'hold', reward: 260, xp: 55, difficulty: 2 },
    { id: 'assaut', name: 'Assaut frontal', desc: 'Une équipe aguerrie fonce au contact par les deux couloirs. Tenez ou contre-attaquez.', mapId: 'entrepot', enemy: ['op_cobra', 'op_harfang', 'op_bouclier', 'op_marteau', 'op_granit'], level: 3, order: 'assault', reward: 340, xp: 70, difficulty: 3 },
    { id: 'marche', name: 'Marché sous le feu', desc: 'Une équipe adverse ratisse la place du marché. Reprenez-la rue par rue.', mapId: 'place', enemy: ['op_sirocco', 'op_furet', 'op_enclume', 'op_marteau', 'op_ardoise'], level: 1, order: 'careful', reward: 240, xp: 50, difficulty: 2 },
    { id: 'tenir', name: 'Tenir la place', desc: 'Tenez la place 140 secondes face à un assaut : il suffit qu\'un seul opérateur soit encore en état à l\'échéance.', mapId: 'place', enemy: ['op_cobra', 'op_sirocco', 'op_bouclier', 'op_marteau', 'op_ombre'], level: 6, order: 'assault', objective: 'hold', duration: 140, reward: 360, xp: 70, difficulty: 3 },
    { id: 'nuit', name: 'Infiltration adverse', desc: 'Des opérateurs équipés d\'armes silencieuses s\'infiltrent prudemment : vous les entendrez à peine.', mapId: 'place', enemy: ['op_ombre', 'op_furet', 'op_sirocco', 'op_ardoise', 'op_lynx'], enemyWeapons: { op_ombre: 'smgsil', op_furet: 'smgsil', op_sirocco: 'smgsil' }, level: 6, order: 'careful', reward: 420, xp: 85, difficulty: 4 },
    { id: 'elite', name: 'Détachement d\'élite', desc: 'Les meilleurs opérateurs adverses, mieux entraînés, à l\'assaut. Réservé aux escouades expérimentées.', mapId: 'entrepot', enemy: ['op_cobra', 'op_harfang', 'op_bouclier', 'op_marteau', 'op_lynx'], level: 5, order: 'assault', reward: 480, xp: 90, difficulty: 4 },
  ];

  // ---- ÉCONOMIE ----------------------------------------------------------------------
  const PRICES = {
    operator: { 1: 250, 2: 450, 3: 700 },           // recrutement selon la rareté
    weapon:   { carbine: 0, smg: 0, dmr: 0, lmg: 0, shotgun: 0, battle: 320, smgsil: 260 },
    armor:    { light: 0, medium: 150, heavy: 320 },
  };
  // Expérience nécessaire pour atteindre chaque niveau (niveau 0 → 1 : 100, etc.) ; +2 à chaque statistique par niveau (max 10).
  const XP_TABLE = [0, 100, 230, 400, 620, 900, 1250, 1700, 2250, 2900, 3650];
  const LEVEL_STAT_BONUS = 2, MAX_LEVEL = 10;

  root.DATA = { WEAPONS, ARMORS, ROLES, OPERATORS, ORDERS, TRAITS, MISSIONS, PRICES, XP_TABLE, LEVEL_STAT_BONUS, MAX_LEVEL };
})(typeof module !== 'undefined' ? module.exports : (window.OT = window.OT || {}));
