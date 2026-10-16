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
    carbine:  { id: 'carbine',  name: 'Carabine 5,56',      cls: 'fusil',    accuracy: 0.62, damage: 32, range: 45, minRange: 0,  rpm: 110, mag: 30,  reload: 2.6, aim: 0.55, falloff: 0.8,  suppress: 0.12, kit: 6 },
    smg:      { id: 'smg',      name: 'Pistolet-mitrailleur 9 mm', cls: 'pm', accuracy: 0.58, damage: 24, range: 22, minRange: 0,  rpm: 160, mag: 30,  reload: 2.2, aim: 0.35, falloff: 0.55, suppress: 0.10, kit: 7 },
    dmr:      { id: 'dmr',      name: 'Fusil de précision 7,62', cls: 'tireur', accuracy: 0.82, damage: 58, range: 90, minRange: 12, rpm: 40,  mag: 20,  reload: 3.0, aim: 1.1,  falloff: 0.9,  suppress: 0.25, kit: 5 },
    lmg:      { id: 'lmg',      name: 'Mitrailleuse légère 5,56', cls: 'appui', accuracy: 0.45, damage: 30, range: 55, minRange: 0,  rpm: 210, mag: 100, reload: 6.5, aim: 0.9,  falloff: 0.8,  suppress: 0.22, kit: 3 },
    shotgun:  { id: 'shotgun',  name: 'Fusil à pompe cal. 12', cls: 'brèche', accuracy: 0.70, damage: 75, range: 10, minRange: 0,  rpm: 55,  mag: 7,   reload: 3.8, aim: 0.3,  falloff: 0.25, suppress: 0.18, kit: 5 },
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
  const ROLES = {
    assault:  { id: 'assault',  name: 'Assaut',      weapon: 'carbine' },
    pointman: { id: 'pointman', name: 'Pointe',      weapon: 'smg' },
    marksman: { id: 'marksman', name: 'Tireur d\'élite', weapon: 'dmr' },
    support:  { id: 'support',  name: 'Appui',       weapon: 'lmg' },
    breacher: { id: 'breacher', name: 'Brèche',      weapon: 'shotgun' },
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
  const OPERATORS = [
    { id: 'op_vautour', callsign: 'Vautour', unit: 'GIGN (France)',           role: 'assault',  armor: 'medium', marksmanship: 74, reflexes: 70, mobility: 68, perception: 66, composure: 78, endurance: 72 },
    { id: 'op_lynx',    callsign: 'Lynx',    unit: 'Commando Hubert (France)', role: 'pointman', armor: 'light',  marksmanship: 66, reflexes: 84, mobility: 86, perception: 74, composure: 64, endurance: 62 },
    { id: 'op_granit',  callsign: 'Granit',  unit: 'GSG 9 (Allemagne)',       role: 'marksman', armor: 'light',  marksmanship: 90, reflexes: 60, mobility: 58, perception: 88, composure: 82, endurance: 60 },
    { id: 'op_bastion', callsign: 'Bastion', unit: 'KSK (Allemagne)',         role: 'support',  armor: 'heavy',  marksmanship: 58, reflexes: 56, mobility: 54, perception: 60, composure: 86, endurance: 90 },
    { id: 'op_belier',  callsign: 'Bélier',  unit: 'SAS (Royaume-Uni)',       role: 'breacher', armor: 'heavy',  marksmanship: 62, reflexes: 72, mobility: 70, perception: 58, composure: 76, endurance: 84 },

    { id: 'op_cobra',   callsign: 'Cobra',   unit: 'Navy SEALs (États-Unis)', role: 'assault',  armor: 'medium', marksmanship: 76, reflexes: 72, mobility: 70, perception: 64, composure: 74, endurance: 74 },
    { id: 'op_furet',   callsign: 'Furet',   unit: 'JTF2 (Canada)',           role: 'pointman', armor: 'light',  marksmanship: 64, reflexes: 86, mobility: 88, perception: 76, composure: 60, endurance: 60 },
    { id: 'op_harfang', callsign: 'Harfang', unit: 'FSK (Norvège)',           role: 'marksman', armor: 'light',  marksmanship: 92, reflexes: 58, mobility: 56, perception: 90, composure: 84, endurance: 58 },
    { id: 'op_bouclier',callsign: 'Bouclier',unit: 'GROM (Pologne)',          role: 'support',  armor: 'heavy',  marksmanship: 56, reflexes: 58, mobility: 52, perception: 62, composure: 88, endurance: 92 },
    { id: 'op_marteau', callsign: 'Marteau', unit: 'Sayeret Matkal (Israël)', role: 'breacher', armor: 'heavy',  marksmanship: 60, reflexes: 74, mobility: 72, perception: 56, composure: 78, endurance: 86 },
  ];

  // ---- ORDRES TACTIQUES --------------------------------------------------------------
  // Chaque ordre modifie réellement les décisions (engine.js : decide / chooseTarget / movement).
  const ORDERS = {
    assault: { id: 'assault', name: 'Assaut',     desc: 'Avancer vers l\'ennemi, chercher le contact.' },
    hold:    { id: 'hold',    name: 'Tenir',      desc: 'Rester près de la position de départ, se couvrir, ouvrir le feu à vue.' },
    careful: { id: 'careful', name: 'Prudent',    desc: 'Avancer de couvert en couvert, se replier si blessé.' },
  };

  root.DATA = { WEAPONS, ARMORS, ROLES, OPERATORS, ORDERS };
})(typeof module !== 'undefined' ? module.exports : (window.OT = window.OT || {}));
