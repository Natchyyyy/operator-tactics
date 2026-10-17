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
    smg:      { id: 'smg',      name: 'Pistolet-mitrailleur 9 mm', cls: 'pm', accuracy: 0.64, damage: 26, range: 24, minRange: 0,  rpm: 170, mag: 30,  reload: 2.0, aim: 0.3,  falloff: 0.5,  suppress: 0.12, kit: 7 },
    dmr:      { id: 'dmr',      name: 'Fusil de précision 7,62', cls: 'tireur', accuracy: 0.66, damage: 58, range: 90, minRange: 15, rpm: 34,  mag: 20,  reload: 3.0, aim: 1.6,  falloff: 0.9,  suppress: 0.28, kit: 5 },
    lmg:      { id: 'lmg',      name: 'Mitrailleuse légère 5,56', cls: 'appui', accuracy: 0.32, damage: 30, range: 55, minRange: 0,  rpm: 210, mag: 100, reload: 6.5, aim: 0.9,  falloff: 0.8,  suppress: 0.26, kit: 3 },
    shotgun:  { id: 'shotgun',  name: 'Fusil à pompe cal. 12', cls: 'brèche', accuracy: 0.80, damage: 85, range: 12, minRange: 0,  rpm: 55,  mag: 7,   reload: 3.8, aim: 0.25, falloff: 0.3,  suppress: 0.2,  kit: 5 },
    // à acheter à l'armurerie
    battle:   { id: 'battle',   name: 'Fusil de combat 7,62', cls: 'fusil',    accuracy: 0.52, damage: 46, range: 60, minRange: 0,  rpm: 75,  mag: 20,  reload: 2.9, aim: 0.7,  falloff: 0.85, suppress: 0.2,  kit: 5 },
    smgsil:   { id: 'smgsil',   name: 'PM 9 mm silencieux', cls: 'pm',    accuracy: 0.64, damage: 23, range: 20, minRange: 0,  rpm: 150, mag: 30,  reload: 2.0, aim: 0.3,  falloff: 0.5,  suppress: 0.07, kit: 7, silenced: true },
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
    assault:  { id: 'assault',  name: 'Assaut',      weapon: 'carbine', weapons: ['carbine', 'battle', 'smg', 'smgsil', 'shotgun'], grenades: { frag: 1 } },
    pointman: { id: 'pointman', name: 'Pointe',      weapon: 'smg',     weapons: ['smg', 'smgsil', 'shotgun', 'carbine'], grenades: { flash: 1 } },
    marksman: { id: 'marksman', name: 'Tireur d\'élite', weapon: 'dmr', weapons: ['dmr', 'battle', 'carbine'], grenades: {} },
    support:  { id: 'support',  name: 'Appui',       weapon: 'lmg',     weapons: ['lmg', 'battle', 'carbine'], grenades: {} },
    breacher: { id: 'breacher', name: 'Brèche',      weapon: 'shotgun', weapons: ['shotgun', 'smg', 'smgsil', 'carbine'], grenades: { frag: 1, flash: 1 } },
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
    { id: 'tactics',   text: 'Jouer {n} tactiques actives',                       goal: [3, 5],  reward: 100 },
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

    // quatrième vague : grenadiers, vigies, secouristes
    { id: 'op_corbeau', callsign: 'Corbeau', unit: 'Jagdkommando (Autriche)',  role: 'assault',  armor: 'medium', trait: 'grenadier', rarity: 2, marksmanship: 74, reflexes: 70, mobility: 66, perception: 68, composure: 76, endurance: 76 },
    { id: 'op_mistral', callsign: 'Mistral', unit: 'SOG (Suède)',              role: 'pointman', armor: 'light',  trait: 'sentinel', rarity: 1, marksmanship: 64, reflexes: 80, mobility: 84, perception: 82, composure: 62, endurance: 62 },
    { id: 'op_toubib',  callsign: 'Toubib',  unit: '1er RPIMa (France)',       role: 'support',  armor: 'medium', trait: 'medic', rarity: 2, marksmanship: 63, reflexes: 64, mobility: 60, perception: 66, composure: 84, endurance: 80 },
    { id: 'op_balafre', callsign: 'Balafre', unit: 'DSU (Belgique)',           role: 'breacher', armor: 'heavy',  trait: 'grenadier', rarity: 1, marksmanship: 60, reflexes: 70, mobility: 66, perception: 60, composure: 74, endurance: 84 },
    { id: 'op_faucon',  callsign: 'Faucon',  unit: 'Jægerkorpset (Danemark)',  role: 'marksman', armor: 'light',  trait: 'sentinel', rarity: 2, marksmanship: 88, reflexes: 62, mobility: 60, perception: 84, composure: 78, endurance: 60 },
    { id: 'op_kodiak',  callsign: 'Kodiak',  unit: 'SBS (Royaume-Uni)',        role: 'assault',  armor: 'medium', trait: 'medic', rarity: 3, marksmanship: 84, reflexes: 78, mobility: 72, perception: 76, composure: 82, endurance: 80 },

    // ---- Faction adverse : « Groupe Karst », société militaire privée fictive (non recrutable) ----
    { id: 'k_molosse', callsign: 'Molosse', unit: 'Groupe Karst — section d\'assaut', faction: 'karst', role: 'assault',  armor: 'medium', trait: 'leader',      rarity: 2, marksmanship: 70, reflexes: 70, mobility: 68, perception: 62, composure: 76, endurance: 76 },
    { id: 'k_vipere',  callsign: 'Vipère',  unit: 'Groupe Karst — éclaireurs',        faction: 'karst', role: 'pointman', armor: 'light',  trait: 'ghost',       rarity: 2, marksmanship: 64, reflexes: 86, mobility: 86, perception: 78, composure: 62, endurance: 60 },
    { id: 'k_rapace',  callsign: 'Rapace',  unit: 'Groupe Karst — tireurs',           faction: 'karst', role: 'marksman', armor: 'light',  trait: 'patience',    rarity: 3, marksmanship: 90, reflexes: 60, mobility: 58, perception: 88, composure: 82, endurance: 60 },
    { id: 'k_hyene',   callsign: 'Hyène',   unit: 'Groupe Karst — appui feu',         faction: 'karst', role: 'support',  armor: 'heavy',  trait: 'gunner',      rarity: 2, marksmanship: 58, reflexes: 56, mobility: 54, perception: 60, composure: 86, endurance: 90 },
    { id: 'k_chacal',  callsign: 'Chacal',  unit: 'Groupe Karst — brèche',            faction: 'karst', role: 'breacher', armor: 'heavy',  trait: 'breach',      rarity: 2, marksmanship: 62, reflexes: 74, mobility: 70, perception: 56, composure: 76, endurance: 84 },
    { id: 'k_fauve',   callsign: 'Fauve',   unit: 'Groupe Karst — section d\'assaut', faction: 'karst', role: 'assault',  armor: 'medium', trait: 'runner',      rarity: 2, marksmanship: 72, reflexes: 76, mobility: 78, perception: 66, composure: 66, endurance: 70 },
    { id: 'k_taipan',  callsign: 'Taïpan',  unit: 'Groupe Karst — tireurs',           faction: 'karst', role: 'marksman', armor: 'medium', trait: 'ambusher',    rarity: 3, marksmanship: 86, reflexes: 62, mobility: 60, perception: 84, composure: 84, endurance: 66 },
    { id: 'k_bison',   callsign: 'Bison',   unit: 'Groupe Karst — appui feu',         faction: 'karst', role: 'support',  armor: 'heavy',  trait: 'colossus',    rarity: 2, marksmanship: 56, reflexes: 58, mobility: 56, perception: 60, composure: 88, endurance: 92 },
  ];
  // Factions : couleurs d'uniforme (rendu) et nom
  const FACTIONS = {
    allied: { id: 'allied', name: 'Coalition', uniform: 0x3a4a3c, vest: 0x2b352d },
    karst:  { id: 'karst',  name: 'Groupe Karst', uniform: 0x3b3a40, vest: 0x5a2628 },
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
    { id: 'patrouille', name: 'Patrouille accrochée', desc: 'Une patrouille adverse de quatre hommes progresse prudemment sur les docks. Interceptez-la.', mapId: 'entrepot', enemy: ['k_molosse', 'k_vipere', 'k_hyene', 'k_chacal'], level: 6, order: 'careful', enemyTactics: [], reward: 180, xp: 40, difficulty: 1 },
    { id: 'embuscade', name: 'Position retranchée', desc: 'L\'adversaire tient l\'entrepôt derrière ses conteneurs. Il faudra aller le chercher.', mapId: 'entrepot', enemy: ['k_molosse', 'k_rapace', 'k_hyene', 'k_chacal', 'k_vipere'], level: 8, order: 'hold', enemyTactics: ['retranche'], reward: 260, xp: 55, difficulty: 2 },
    { id: 'assaut', name: 'Assaut frontal', desc: 'Une équipe aguerrie fonce au contact par les deux couloirs. Tenez ou contre-attaquez.', mapId: 'entrepot', enemy: ['k_molosse', 'k_rapace', 'k_bison', 'k_chacal', 'k_fauve'], level: 1, order: 'assault', enemyTactics: ['blitz', 'fumigene'], reward: 340, xp: 70, difficulty: 3 },
    { id: 'marche', name: 'Marché sous le feu', desc: 'Une équipe adverse ratisse la place du marché. Reprenez-la rue par rue.', mapId: 'place', enemy: ['k_fauve', 'k_vipere', 'k_chacal', 'k_molosse'], level: 3, order: 'careful', enemyTactics: ['soins'], reward: 240, xp: 50, difficulty: 2 },
    { id: 'tenir', name: 'Tenir la place', desc: 'Tenez la place 140 secondes face à un assaut : il suffit qu\'un seul opérateur soit encore en état à l\'échéance.', mapId: 'place', enemy: ['k_molosse', 'k_fauve', 'k_bison', 'k_chacal', 'k_vipere'], level: 0, order: 'assault', objective: 'hold', duration: 140, enemyTactics: ['fumigene', 'barrage'], reward: 360, xp: 70, difficulty: 3 },
    { id: 'nuit', name: 'Infiltration adverse', desc: 'Des opérateurs équipés d\'armes silencieuses s\'infiltrent prudemment : vous les entendrez à peine.', mapId: 'place', conditions: 'nuit', enemy: ['k_vipere', 'k_fauve', 'k_molosse', 'k_taipan', 'k_chacal'], enemyWeapons: { k_vipere: 'smgsil', k_fauve: 'smgsil', k_molosse: 'smgsil' }, level: 9, order: 'careful', enemyTactics: ['reco', 'discipline'], reward: 420, xp: 85, difficulty: 4 },
    { id: 'cuves', name: 'Entre les cuves', desc: 'Le Groupe Karst s\'est installé dans la raffinerie. Il progresse prudemment entre les cuves et les tuyauteries : un terrain qui favorise celui qui tient.', mapId: 'raffinerie', conditions: 'pluie', enemy: ['k_chacal', 'k_vipere', 'k_fauve', 'k_hyene', 'k_molosse'], level: 2, order: 'careful', enemyTactics: ['retranche', 'soins'], reward: 320, xp: 65, difficulty: 2 },
    { id: 'pompage', name: 'Station de pompage', desc: 'Tenez la station de pompage deux minutes face à des assaillants aguerris.', mapId: 'raffinerie', conditions: 'brouillard', enemy: ['k_molosse', 'k_fauve', 'k_bison', 'k_chacal', 'k_rapace'], level: 8, order: 'assault', objective: 'hold', duration: 120, enemyTactics: ['blitz', 'barrage', 'fumigene'], reward: 400, xp: 80, difficulty: 4 },
    { id: 'balise', name: 'Balise de localisation', desc: 'La balise d\'un agent disparu émet depuis l\'allée nord des docks. Quatre hommes du Groupe Karst la cherchent aussi. Prenez la zone et tenez-la jusqu\'à 100 % — inutile de neutraliser tout le monde.', mapId: 'entrepot', enemy: ['k_vipere', 'k_hyene', 'k_chacal', 'k_fauve'], level: 2, order: 'careful', objective: 'capture', enemyTactics: ['drill'], reward: 220, xp: 45, difficulty: 1 },
    { id: 'priseplace', name: 'Prise de la place', desc: 'Le Groupe Karst veut contrôler la place du marché. Occupez-la avant lui et ne la lâchez pas.', mapId: 'place', enemy: ['k_fauve', 'k_vipere', 'k_hyene', 'k_chacal', 'k_molosse'], level: -2, order: 'careful', objective: 'capture', enemyTactics: ['soins'], reward: 300, xp: 60, difficulty: 2 },
    { id: 'vannes', name: 'Les vannes', desc: 'L\'aire de pompage nord commande toute la raffinerie. Des assaillants aguerris foncent dessus : prenez-la de vitesse.', mapId: 'raffinerie', enemy: ['k_molosse', 'k_fauve', 'k_bison', 'k_taipan', 'k_rapace'], level: 7, order: 'assault', objective: 'capture', enemyTactics: ['blitz', 'fumigene'], reward: 420, xp: 80, difficulty: 4 },
    { id: 'galerie', name: 'Balise de la galerie', desc: 'Les balises de notre agent disparu émettent depuis le parking du centre commercial. Trouvez-les et sécurisez l\'enclos central.', mapId: 'parking', enemy: ['k_fauve', 'k_vipere', 'k_hyene', 'k_chacal', 'k_molosse'], level: 1, order: 'careful', objective: 'capture', enemyTactics: ['fumigene', 'soins'], reward: 320, xp: 65, difficulty: 2 },
    { id: 'parking', name: 'Nettoyage du parking', desc: 'Le Groupe Karst s\'est retranché entre les voitures et les barrières du parking. Délogez-le.', mapId: 'parking', conditions: 'nuit', enemy: ['k_molosse', 'k_rapace', 'k_bison', 'k_chacal', 'k_hyene'], level: 6, order: 'hold', enemyTactics: ['retranche', 'reco'], reward: 380, xp: 75, difficulty: 3 },
    { id: 'elite', name: 'Détachement d\'élite', desc: 'Les meilleurs opérateurs adverses, mieux entraînés, à l\'assaut. Réservé aux escouades expérimentées.', mapId: 'entrepot', enemy: ['k_molosse', 'k_rapace', 'k_bison', 'k_taipan', 'k_fauve'], level: 7, order: 'assault', enemyTactics: ['blitz', 'reco', 'soins'], reward: 480, xp: 90, difficulty: 4 },
  ];

  // ---- MODES DE JEU (comme le menu « Jouer » du jeu d'origine) -------------------------------
  // Campagnes : suites de missions débloquées l'une après l'autre (la suivante s'ouvre dès que la précédente a été JOUÉE) ;
  // prime de participation quand toutes ont été jouées, prime de campagne quand toutes ont été gagnées.
  // Vétéran et Élite rejouent les missions avec un adversaire plus aguerri (niveau +), plus de tactiques, de meilleures primes.
  const CAMPAIGNS = [
    { id: 'reguliere', name: 'Campagne régulière', desc: 'Quatorze missions contre le Groupe Karst, des docks à la raffinerie en passant par le centre commercial.',
      missions: ['patrouille', 'balise', 'marche', 'cuves', 'embuscade', 'priseplace', 'galerie', 'assaut', 'tenir', 'parking', 'nuit', 'pompage', 'vannes', 'elite'],
      levelBonus: 0, rewardMul: 1, participation: 200, completion: 500, unlock: null },
    { id: 'veteran', name: 'Campagne vétéran', desc: 'Les mêmes théâtres, un adversaire plus aguerri (+4 niveaux, une tactique de plus).',
      missions: ['patrouille', 'balise', 'marche', 'cuves', 'embuscade', 'priseplace', 'galerie', 'assaut', 'tenir', 'parking', 'nuit', 'pompage', 'vannes', 'elite'],
      levelBonus: 4, extraTactic: true, rewardMul: 1.5, participation: 350, completion: 900, unlock: { rank: 3 } },
    { id: 'elite', name: 'Campagne élite', desc: 'Pour les escouades d\'exception : adversaire +8 niveaux, deux tactiques de plus.',
      missions: ['patrouille', 'balise', 'marche', 'cuves', 'embuscade', 'priseplace', 'galerie', 'assaut', 'tenir', 'parking', 'nuit', 'pompage', 'vannes', 'elite'],
      levelBonus: 8, extraTactic: 2, rewardMul: 2, participation: 600, completion: 1500, unlock: { rating: 60 } },
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
    fumigene:    { id: 'fumigene',    name: 'Fumigène',          active: true, uses: 2, cooldown: 25, desc: 'Un écran de fumée de 8 m pendant 15 s entre l\'escouade et la menace la plus proche : coupe la vue dans les deux sens.' },
    reco:        { id: 'reco',        name: 'Drone de reco',     active: true, uses: 1, cooldown: 0,  desc: 'Révèle la position de tous les adversaires à toute l\'escouade pendant 8 s.' },
    soins:       { id: 'soins',       name: 'Trousse de soins',  active: true, uses: 2, cooldown: 20, desc: 'L\'opérateur le plus blessé encore en état récupère 35 PV en 5 s.' },
    barrage:     { id: 'barrage',     name: 'Appui mortier',     active: true, uses: 1, cooldown: 0,  desc: 'Après 4 s, trois obus tombent autour de la position adverse connue la plus proche : dégâts dans 3 m, suppression dans 8 m.' },
    drill:       { id: 'drill',       name: 'Exercice de base',  active: false, desc: 'Déplacement 12 % plus rapide pendant les 20 premières secondes ; dégâts subis −10 % tant que l\'adversaire tient.' },
    blitz:       { id: 'blitz',       name: 'Éclair',            active: false, desc: 'Cadence de tir +20 % pendant 30 s au début de la bataille, précision −10 % pendant ce temps.' },
    retranche:   { id: 'retranche',   name: 'Retranchement',     active: false, desc: 'Position préparée atteinte en 1,5 s au lieu de 3 ; les couverts partiels protègent un peu mieux (×0,5 au lieu de ×0,55).' },
    discipline:  { id: 'discipline',  name: 'Discipline de feu', active: false, desc: 'Pas de tir sous 12 % de chances de toucher (économie de munitions) ; +12 % de précision à l\'arrêt.' },
    // cartes reprises du jeu d'origine (Air strike, Headshot, Camouflage, Triage)
    frappe:      { id: 'frappe',      name: 'Frappe aérienne',   active: true, uses: 1, cooldown: 0, desc: 'Après 5 s, un passage d\'avion mitraille une bande de 4 m sur 30 m à travers la position adverse connue la plus proche : 30 à 60 PV à découvert, moitié derrière un couvert bas, rien sous un toit ou derrière un mur.' },
    tete:        { id: 'tete',        name: 'Tir à la tête',     active: false, desc: 'Chance de toucher à la tête portée de 8 % à 14 % pour toute l\'escouade.' },
    camouflage:  { id: 'camouflage',  name: 'Camouflage',        active: false, desc: 'Les 40 premières secondes, l\'adversaire a 35 % de chances en moins de vous repérer (puis 15 %).' },
    triage:      { id: 'triage',      name: 'Triage',            active: false, desc: 'Un opérateur blessé qui n\'est plus touché depuis 6 s récupère 2 PV par seconde, jusqu\'à 60 % de sa vie.' },
  };

  // ---- DÉFIS -------------------------------------------------------------------------
  // Récompense unique, vérifiée sur le résultat réel de la mission (les conditions sont codées dans game.js : CHALLENGE_CHECKS).
  const CHALLENGES = [
    { id: 'sans_perte', name: 'Sans perte',          desc: 'Réussir une mission sans aucun opérateur neutralisé.', reward: 200 },
    { id: 'a_trois',    name: 'À trois',             desc: 'Réussir une mission avec une escouade de trois.', reward: 250 },
    { id: 'methodique', name: 'Méthodique',          desc: 'Réussir « Position retranchée » avec l\'ordre Prudent.', reward: 150 },
    { id: 'pas_un_pouce', name: 'Pas un pouce',      desc: 'Réussir « Tenir la place » avec cinq opérateurs encore en état.', reward: 300 },
    { id: 'tireur',     name: 'Œil du tireur',       desc: 'Un tireur d\'élite neutralise trois adversaires dans une même mission.', reward: 200 },
    { id: 'silence',    name: 'Silence radio',       desc: 'Réussir « Infiltration adverse » sans qu\'aucun opérateur ne reste cloué au sol plus de 3 s.', reward: 300 },
    { id: 'elite',      name: 'Détachement brisé',   desc: 'Réussir « Détachement d\'élite ».', reward: 400 },
  ];

  // ---- PERSONNALISATION ----------------------------------------------------------------
  const INSIGNIAS = [
    { id: 'etoile', name: 'Étoile', glyph: '✶' }, { id: 'bouclier', name: 'Bouclier', glyph: '⛨' }, { id: 'aigle', name: 'Aigle', glyph: '⚚' },
    { id: 'eclair', name: 'Éclair', glyph: '⚡' }, { id: 'ancre', name: 'Ancre', glyph: '⚓' }, { id: 'rose', name: 'Rose des vents', glyph: '✵' },
  ];
  const UNIFORMS = [
    { id: 'olive', name: 'Olive', uniform: 0x3a4a3c, vest: 0x2b352d }, { id: 'urbain', name: 'Urbain', uniform: 0x4a4e55, vest: 0x2a2d33 },
    { id: 'desert', name: 'Désert', uniform: 0x8a7a55, vest: 0x5d523a }, { id: 'nuit', name: 'Nuit', uniform: 0x252a36, vest: 0x161a22 },
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
    { id: 'collection', name: 'Collectionneur',     glyph: '▣', desc: 'Débloquer dix opérateurs.', reward: { insignia: 'aigle' } },
    { id: 'veteran',    name: 'Vétéran',            glyph: '✦', desc: 'Amener un opérateur au niveau 5.', reward: { headgear: 'beret_vert' } },
    { id: 'podium',     name: 'Sur le podium',      glyph: '♛', desc: 'Finir une saison de ligue dans les trois premiers.', reward: { uniform: 'nuit' } },
    { id: 'tacticien',  name: 'Tacticien',          glyph: '◆', desc: 'Jouer vingt tactiques actives.', reward: { credits: 250 } },
    { id: 'intact',     name: 'Sans une égratignure', glyph: '❖', desc: 'Gagner avec cinq opérateurs à plus de 90 % de vie.', reward: { headgear: 'foulard_rouge' } },
    { id: 'croise',     name: 'Tir croisé',         glyph: '✛', desc: 'Dix neutralisations de groupe en carrière.', reward: { insignia: 'eclair' } },
    { id: 'precision',  name: 'Tête froide',        glyph: '⊕', desc: 'Vingt-cinq tirs à la tête en carrière.', reward: { headgear: 'lunettes_soleil' } },
    { id: 'sauveteur',  name: 'Sauveteur',          glyph: '✚', desc: 'Relever cinq alliés à terre.', reward: { credits: 300 } },
    { id: 'nocturne',   name: 'Oiseau de nuit',     glyph: '☾', desc: 'Gagner cinq batailles de nuit.', reward: { insignia: 'rose' } },
    { id: 'terrain',    name: 'Maître du terrain',  glyph: '⬢', desc: 'Gagner cinq batailles de capture de zone.', reward: { insignia: 'ancre' } },
    { id: 'campagne',   name: 'Campagne accomplie', glyph: '⚑', desc: 'Gagner les quatorze missions de la campagne régulière.', reward: { uniform: 'desert' } },
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
    weapon:   { carbine: 0, smg: 0, dmr: 0, lmg: 0, shotgun: 0, battle: 320, smgsil: 260 },
    armor:    { light: 0, medium: 150, heavy: 320 },
  };
  // Expérience nécessaire pour atteindre chaque niveau (niveau 0 → 1 : 100, etc.) ; +2 à chaque statistique par niveau (max 10).
  const XP_TABLE = [0, 100, 230, 400, 620, 900, 1250, 1700, 2250, 2900, 3650];
  const LEVEL_STAT_BONUS = 2, MAX_LEVEL = 10;

  root.DATA = { WEAPONS, ARMORS, ROLES, OPERATORS, FACTIONS, ORDERS, TRAITS, TACTICS, INSIGNIAS, UNIFORMS, RANKS, PACKS, ACHIEVEMENTS, PROMOTION_LEVELS, CONTRACT, MISSIONS, CHALLENGES, PRICES, XP_TABLE, LEVEL_STAT_BONUS, MAX_LEVEL, SYNERGIES, WOUND, CAMPAIGNS, QUICK, SPECIAL_OPS, GRENADES, CONDITIONS, DAILY };
})(typeof module !== 'undefined' ? module.exports : (window.OT = window.OT || {}));
