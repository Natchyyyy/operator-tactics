// Anciennes données gardées POUR LES TESTS DU MOTEUR seulement (le jeu n'a plus qu'une carte, une arme et cinq opérateurs) :
// les mécanismes (vue à travers les murs, couverts, portée minimale, arme silencieuse, compétences…) se vérifient
// sur les terrains et les fiches qui ont servi à les mettre au point. Rien de ceci n'est chargé par le jeu.
module.exports = function (OT) {
  function box(x, z, w, d, h, kind, name) { return { x, z, w, d, h, kind, name: name || kind }; }

  // Carte symétrique : on décrit la moitié ouest, les obstacles entièrement à l'ouest (x+w < 32) sont reflétés à l'est.
  // Pour que la grille soit elle aussi symétrique, les bords x des obstacles tombent sur des multiples de 0,5 m.
  function mirrored(width, list) {
    const out = list.slice();
    for (const o of list) if (o.x + o.w < width / 2 - 0.01) out.push(box(width - o.x - o.w, o.z, o.w, o.d, o.h, o.kind, o.name));
    return out;
  }


  Object.assign(OT.MAPS, {
    entrepot: {
      id: 'entrepot', name: 'Entrepôt des docks', width: 64, depth: 40,
      // zones de départ (centre + rayon) ; l'équipe A à l'ouest, B à l'est
      spawns: [ { x: 5.5, z: 20, r: 3.5 }, { x: 58.5, z: 20, r: 3.5 } ],
      capture: { x: 32, z: 9, r: 6 },   // zone à capturer : allée nord, devant les caisses (le centre est un bâtiment)
      obstacles: mirrored(64, [
        // murs périphériques
        box(-1, -1, 66, 1, 3.2, 'wall', 'mur nord'), box(-1, 40, 66, 1, 3.2, 'wall', 'mur sud'),
        box(-1, 0, 1, 40, 3.2, 'wall', 'mur ouest'), box(64, 0, 1, 40, 3.2, 'wall', 'mur est'),
        // conteneurs devant la zone de départ : écran, avec un passage central et deux couloirs latéraux
        box(11, 7, 2.5, 9, 2.6, 'wall', 'conteneur'), box(11, 24, 2.5, 9, 2.6, 'wall', 'conteneur'),
        // bâtiment central plein — coupe la carte en deux couloirs nord et sud, aucune vue directe entre les zones de départ
        box(27, 15, 10, 10, 3.0, 'wall', 'bâtiment'),
        // piliers au milieu des couloirs nord et sud : cassent les lignes de vue
        box(31, 5, 2, 2.2, 3.0, 'wall', 'pilier'), box(31, 32.8, 2, 2.2, 3.0, 'wall', 'pilier'),
        // couverts bas (caisses, barrières, sacs de sable) : cachent accroupi, protègent le bas du corps debout
        box(15, 19.3, 3, 1.4, 1.1, 'cover', 'palettes'),
        box(17, 4, 2, 2, 1.1, 'cover', 'caisses'), box(19, 29, 2, 2, 1.1, 'cover', 'caisses'),
        box(20, 11, 4, 1.2, 1.0, 'cover', 'muret'), box(16, 34, 3, 1.2, 1.1, 'cover', 'barrière'),
        box(21, 7, 3, 1.2, 1.1, 'cover', 'barrière'), box(24, 29.5, 2, 2, 1.1, 'cover', 'caisses'),
        box(22, 13.2, 1, 2.4, 0.95, 'cover', 'sacs de sable'), box(22, 24.4, 1, 2.4, 0.95, 'cover', 'sacs de sable'),
        box(7, 6, 1.5, 1.4, 1.1, 'cover', 'fût'), box(7, 32.6, 1.5, 1.4, 1.1, 'cover', 'fût'),
        box(26, 9.2, 2.5, 1.2, 1.0, 'cover', 'muret'), box(26, 29.6, 2.5, 1.2, 1.0, 'cover', 'muret'),
        box(31, 11.5, 2, 1.2, 1.1, 'cover', 'caisses'), box(31, 27.3, 2, 1.2, 1.1, 'cover', 'caisses'),
      ]),
    },
    place: {
      id: 'place', name: 'Place du marché', width: 70, depth: 44,
      spawns: [ { x: 5.5, z: 22, r: 3.5 }, { x: 64.5, z: 22, r: 3.5 } ],
      capture: { x: 35, z: 22, r: 7 },  // la place elle-même
      obstacles: mirrored(70, [
        box(-1, -1, 72, 1, 3.2, 'wall', 'mur nord'), box(-1, 44, 72, 1, 3.2, 'wall', 'mur sud'),
        box(-1, 0, 1, 44, 3.2, 'wall', 'mur ouest'), box(70, 0, 1, 44, 3.2, 'wall', 'mur est'),
        // immeubles : deux par côté, puis un bloc central qui ferme la vue entre les zones de départ
        box(10, 2, 8, 10, 4.5, 'wall', 'immeuble'), box(10, 32, 8, 10, 4.5, 'wall', 'immeuble'),
        box(22, 16, 6, 12, 4.0, 'wall', 'immeuble'),
        box(30, 11.5, 2, 2, 3.0, 'wall', 'kiosque'), box(30, 30.5, 2, 2, 3.0, 'wall', 'kiosque'),
        // rues et place : voitures, murets, bancs, fontaine
        box(26.5, 6, 2, 4.4, 1.4, 'cover', 'voiture'), box(26.5, 33.6, 2, 4.4, 1.4, 'cover', 'voiture'),
        box(19, 13, 4, 0.8, 1.0, 'cover', 'muret'), box(19, 30.2, 4, 0.8, 1.0, 'cover', 'muret'),
        box(14, 20, 0.8, 4, 1.0, 'cover', 'muret'), box(7, 8, 1.5, 1.5, 1.1, 'cover', 'bac à fleurs'), box(7, 34.5, 1.5, 1.5, 1.1, 'cover', 'bac à fleurs'),
        box(30, 18, 2.5, 0.8, 0.8, 'cover', 'banc'), box(30, 25.2, 2.5, 0.8, 0.8, 'cover', 'banc'),
        box(33, 20.5, 4, 3, 1.1, 'cover', 'fontaine'),
        box(21, 4, 2, 2, 1.1, 'cover', 'étal'), box(21, 38, 2, 2, 1.1, 'cover', 'étal'),
        box(31.5, 2.5, 3, 1.2, 1.1, 'cover', 'étal'), box(31.5, 40.3, 3, 1.2, 1.1, 'cover', 'étal'),
      ]),
    },
    raffinerie: {
      id: 'raffinerie', name: 'Raffinerie', width: 72, depth: 46,
      spawns: [ { x: 5.5, z: 23, r: 3.5 }, { x: 66.5, z: 23, r: 3.5 } ],
      capture: { x: 36, z: 10, r: 6 },  // aire de pompage nord (le centre est fermé par les cuves)
      obstacles: mirrored(72, [
        box(-1, -1, 74, 1, 3.2, 'wall', 'mur nord'), box(-1, 46, 74, 1, 3.2, 'wall', 'mur sud'),
        box(-1, 0, 1, 46, 3.2, 'wall', 'mur ouest'), box(72, 0, 1, 46, 3.2, 'wall', 'mur est'),
        // écrans devant les zones de départ
        box(9, 15, 2, 5, 2.6, 'wall', 'conteneur'), box(9, 26, 2, 5, 2.6, 'wall', 'conteneur'),
        // cuves (hautes, rondes au rendu) et station de pompage au centre
        box(14, 5, 6, 6, 5.0, 'wall', 'cuve'), box(14, 35, 6, 6, 5.0, 'wall', 'cuve'),
        box(27, 17, 8, 12, 5.0, 'wall', 'cuve'),
        box(34, 21, 4, 4, 3.0, 'wall', 'pompe'),
        // passerelles : piliers
        box(22, 3, 1.5, 1.5, 3.0, 'wall', 'pilier'), box(22, 41.5, 1.5, 1.5, 3.0, 'wall', 'pilier'),
        // tuyauteries basses, fûts, armoires électriques (couverts)
        box(8, 20.5, 1, 5, 1.2, 'cover', 'tuyauterie'), box(22, 10, 8, 1, 1.2, 'cover', 'tuyauterie'), box(22, 35, 8, 1, 1.2, 'cover', 'tuyauterie'),
        box(20, 22.5, 1.5, 1.5, 1.1, 'cover', 'fût'), box(10, 11, 1.5, 1.5, 1.1, 'cover', 'fût'), box(10, 33.5, 1.5, 1.5, 1.1, 'cover', 'fût'),
        box(30, 8, 2, 1.5, 1.1, 'cover', 'armoire'), box(30, 36.5, 2, 1.5, 1.1, 'cover', 'armoire'),
        // silos au milieu des couloirs nord et sud : cassent les longues lignes de vue (sinon le défenseur domine)
        box(29, 2, 3, 3, 4.0, 'wall', 'cuve'), box(29, 41, 3, 3, 4.0, 'wall', 'cuve'),
        box(18, 20, 2, 6, 2.6, 'wall', 'conteneur'),
        box(16, 15.5, 3, 1, 1.0, 'cover', 'muret'), box(16, 29.5, 3, 1, 1.0, 'cover', 'muret'),
        box(26, 3, 3, 1.2, 1.1, 'cover', 'caisses'), box(26, 41.8, 3, 1.2, 1.1, 'cover', 'caisses'),
      ]),
    },
    // ---- Gare de triage : voies est-ouest, wagons couverts (murs) et wagons plats (couverts bas), poste d'aiguillage au centre ----
    gare: {
      id: 'gare', name: 'Gare de triage', width: 72, depth: 46,
      spawns: [ { x: 5.5, z: 23, r: 3.5 }, { x: 66.5, z: 23, r: 3.5 } ],
      capture: { x: 36, z: 37, r: 6 },   // le quai sud, devant la halle aux marchandises
      obstacles: mirrored(72, [
        box(-1, -1, 74, 1, 3.2, 'wall', 'mur nord'), box(-1, 46, 74, 1, 3.2, 'wall', 'mur sud'),
        box(-1, 0, 1, 46, 3.2, 'wall', 'mur ouest'), box(72, 0, 1, 46, 3.2, 'wall', 'mur est'),
        // au centre : le poste d'aiguillage (coupe la vue d'un départ à l'autre) et la halle aux marchandises au sud
        box(33, 17, 6, 11, 5.5, 'wall', 'poste d\'aiguillage'), box(30, 43, 12, 3, 4.0, 'wall', 'halle'),
        // conteneurs empilés devant les zones de départ
        box(11, 15, 2.5, 6, 2.6, 'wall', 'conteneur'), box(11, 26, 2.5, 6, 2.6, 'wall', 'conteneur'),
        // voie 1 (nord) : wagons couverts ; voie 2 : wagons plats ; voie 3 (sud) : wagon-citerne et wagon couvert
        box(15, 6, 12, 2.6, 3.2, 'wall', 'wagon'), box(29.5, 6, 2, 2.6, 1.0, 'cover', 'butoir'),
        box(17, 12, 9, 2.4, 1.3, 'cover', 'wagon plat'),
        box(16, 31, 9, 2.4, 1.3, 'cover', 'wagon plat'),
        box(15, 37, 11, 2.6, 3.0, 'wall', 'wagon-citerne'),
        // quai central bas (couvert) et abri de quai
        box(20, 21.5, 8, 1.2, 1.0, 'cover', 'quai'), box(26.5, 24, 1.5, 1.5, 2.8, 'wall', 'pilier'),
        // matériel de voie : caisses, traverses empilées (palettes), fûts, sacs de sable
        box(8, 4, 2, 2, 1.1, 'cover', 'caisses'), box(8, 40, 2, 2, 1.1, 'cover', 'caisses'),
        box(28, 13, 3, 1.4, 1.1, 'cover', 'palettes'), box(28, 31.5, 3, 1.4, 1.1, 'cover', 'palettes'),
        box(30, 26, 1.4, 1.4, 1.1, 'cover', 'fût'), box(24, 17, 1.0, 2.4, 1.0, 'cover', 'sacs de sable'),
        box(23, 27, 1.0, 2.4, 1.0, 'cover', 'sacs de sable'), box(31, 36, 2.5, 1.0, 1.0, 'cover', 'sacs de sable'),
      ]),
    },
  });
  const W = {
    smg:      { id: 'smg',      name: 'Pistolet-mitrailleur 9 mm', cls: 'pm', accuracy: 0.64, damage: 26, range: 24, minRange: 0,  rpm: 170, mag: 30,  reload: 2.0, aim: 0.3,  falloff: 0.5,  suppress: 0.12, kit: 7 },
    dmr:      { id: 'dmr',      name: 'Fusil de précision 7,62', cls: 'tireur', accuracy: 0.66, damage: 58, range: 90, minRange: 15, rpm: 34,  mag: 20,  reload: 3.0, aim: 1.6,  falloff: 0.9,  suppress: 0.28, kit: 5 },
    lmg:      { id: 'lmg',      name: 'Mitrailleuse légère 5,56', cls: 'appui', accuracy: 0.32, damage: 30, range: 55, minRange: 0,  rpm: 210, mag: 100, reload: 6.5, aim: 0.9,  falloff: 0.8,  suppress: 0.26, kit: 3 },
    shotgun:  { id: 'shotgun',  name: 'Fusil à pompe cal. 12', cls: 'brèche', accuracy: 0.80, damage: 85, range: 12, minRange: 0,  rpm: 55,  mag: 7,   reload: 3.8, aim: 0.25, falloff: 0.3,  suppress: 0.2,  kit: 5 },
    battle:   { id: 'battle',   name: 'Fusil de combat 7,62', cls: 'fusil',    accuracy: 0.52, damage: 46, range: 60, minRange: 0,  rpm: 75,  mag: 20,  reload: 2.9, aim: 0.7,  falloff: 0.85, suppress: 0.2,  kit: 5 },
    smgsil:   { id: 'smgsil',   name: 'PM 9 mm silencieux', cls: 'pm',    accuracy: 0.64, damage: 23, range: 20, minRange: 0,  rpm: 150, mag: 30,  reload: 2.0, aim: 0.3,  falloff: 0.5,  suppress: 0.07, kit: 7, silenced: true },
  };
  for (const k in W) if (!OT.DATA.WEAPONS[k]) OT.DATA.WEAPONS[k] = W[k];
  for (const o of [
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
    // cinquième vague : des compatriotes pour les Frères d'armes (Italie, Canada, Pologne, Espagne)
    { id: 'op_tramontane', callsign: 'Tramontane', unit: 'COMSUBIN (Italie)', role: 'marksman', armor: 'light',  trait: 'patience', rarity: 2, marksmanship: 88, reflexes: 62, mobility: 60, perception: 84, composure: 80, endurance: 60 },
    { id: 'op_carcajou', callsign: 'Carcajou', unit: 'JTF2 (Canada)',         role: 'breacher', armor: 'heavy',  trait: 'hardened', rarity: 2, marksmanship: 62, reflexes: 74, mobility: 70, perception: 60, composure: 78, endurance: 86 },
    { id: 'op_lancier',  callsign: 'Lancier',  unit: 'JW Formoza (Pologne)',  role: 'assault',  armor: 'medium', trait: 'radio',    rarity: 1, marksmanship: 70, reflexes: 70, mobility: 70, perception: 74, composure: 70, endurance: 70 },
    { id: 'op_orage',    callsign: 'Orage',    unit: 'GEO (Espagne)',         role: 'support',  armor: 'heavy',  trait: 'steady',   rarity: 1, marksmanship: 58, reflexes: 58, mobility: 54, perception: 60, composure: 84, endurance: 88 },

    { id: 'd_scorpion', callsign: 'Scorpion', unit: 'Milice du Delta — choc',      faction: 'delta', role: 'assault',  armor: 'light',  trait: 'runner',   rarity: 2, headgear: 'foulard', marksmanship: 66, reflexes: 76, mobility: 82, perception: 64, composure: 60, endurance: 70 },
    { id: 'd_fennec',   callsign: 'Fennec',   unit: 'Milice du Delta — éclaireurs', faction: 'delta', role: 'pointman', armor: 'light',  trait: 'eagle',    rarity: 2, headgear: 'casquette', marksmanship: 62, reflexes: 82, mobility: 88, perception: 78, composure: 56, endurance: 62 },
    { id: 'd_busard',   callsign: 'Busard',   unit: 'Milice du Delta — tireurs',    faction: 'delta', role: 'marksman', armor: 'light',  trait: 'ambusher', rarity: 2, headgear: 'chapeau', marksmanship: 84, reflexes: 58, mobility: 60, perception: 82, composure: 70, endurance: 58 },
    { id: 'd_rhino',    callsign: 'Rhino',    unit: 'Milice du Delta — appui',      faction: 'delta', role: 'support',  armor: 'medium', trait: 'gunner',   rarity: 2, headgear: 'bonnet', marksmanship: 56, reflexes: 56, mobility: 58, perception: 58, composure: 74, endurance: 86 },
    { id: 'd_taureau',  callsign: 'Taureau',  unit: 'Milice du Delta — choc',       faction: 'delta', role: 'breacher', armor: 'medium', trait: 'breach',   rarity: 2, headgear: 'foulard', marksmanship: 60, reflexes: 74, mobility: 76, perception: 56, composure: 70, endurance: 82 },
    { id: 'd_mamba',    callsign: 'Mamba',    unit: 'Milice du Delta — choc',       faction: 'delta', role: 'assault',  armor: 'light',  trait: 'fasthands', rarity: 2, headgear: 'casquette', marksmanship: 70, reflexes: 78, mobility: 76, perception: 62, composure: 62, endurance: 66 },
    { id: 'd_gecko',    callsign: 'Gecko',    unit: 'Milice du Delta — éclaireurs', faction: 'delta', role: 'pointman', armor: 'light',  trait: 'ghost',    rarity: 2, headgear: 'bonnet', marksmanship: 62, reflexes: 84, mobility: 86, perception: 74, composure: 58, endurance: 60 },
    { id: 'd_colonel',  callsign: 'Le Colonel', unit: 'Milice du Delta — commandement', faction: 'delta', role: 'assault', armor: 'heavy', trait: 'leader', traits: ['hardened'], rarity: 3, headgear: 'beret_rouge', marksmanship: 86, reflexes: 80, mobility: 64, perception: 84, composure: 92, endurance: 90 },
  ]) if (!OT.DATA.OPERATORS.some(x => x.id === o.id)) OT.DATA.OPERATORS.push(o);
  // rôles et fiches d'avant la refonte (armes par rôle, unités et compétences d'origine des cinq premiers)
  Object.assign(OT.DATA.ROLES, {
    assault:  { id: 'assault',  name: 'Assaut',      weapon: 'carbine', weapons: ['carbine', 'battle', 'smg', 'smgsil', 'shotgun'], grenades: { frag: 1 } },
    pointman: { id: 'pointman', name: 'Pointe',      weapon: 'smg',     weapons: ['smg', 'smgsil', 'shotgun', 'carbine'], grenades: { flash: 1 } },
    marksman: { id: 'marksman', name: 'Tireur d\'élite', weapon: 'dmr', weapons: ['dmr', 'battle', 'carbine'], grenades: {} },
    support:  { id: 'support',  name: 'Appui',       weapon: 'lmg',     weapons: ['lmg', 'battle', 'carbine'], grenades: {} },
    breacher: { id: 'breacher', name: 'Brèche',      weapon: 'shotgun', weapons: ['shotgun', 'smg', 'smgsil', 'carbine'], grenades: { frag: 1, flash: 1 } },
  });
  for (const o of [
    { id: 'op_vautour', callsign: 'Vautour', unit: 'GIGN (France)',           role: 'assault',  armor: 'medium', trait: 'fasthands', rarity: 1, marksmanship: 74, reflexes: 70, mobility: 68, perception: 66, composure: 78, endurance: 72 },
    { id: 'op_lynx',    callsign: 'Lynx',    unit: 'Commando Hubert (France)', role: 'pointman', armor: 'light',  trait: 'eagle', rarity: 1, marksmanship: 66, reflexes: 84, mobility: 86, perception: 74, composure: 64, endurance: 62 },
    { id: 'op_granit',  callsign: 'Granit',  unit: 'GSG 9 (Allemagne)',       role: 'marksman', armor: 'light',  trait: 'patience', rarity: 2, marksmanship: 90, reflexes: 60, mobility: 58, perception: 88, composure: 82, endurance: 60 },
    { id: 'op_bastion', callsign: 'Bastion', unit: 'KSK (Allemagne)',         role: 'support',  armor: 'heavy',  trait: 'steady', rarity: 1, marksmanship: 58, reflexes: 56, mobility: 54, perception: 60, composure: 86, endurance: 90 },
    { id: 'op_belier',  callsign: 'Bélier',  unit: 'SAS (Royaume-Uni)',       role: 'breacher', armor: 'heavy',  trait: 'breach', rarity: 1, marksmanship: 62, reflexes: 72, mobility: 70, perception: 58, composure: 76, endurance: 84 },

  ]) Object.assign(OT.DATA.OPERATORS.find(x => x.id === o.id), o);
  // le moteur part désormais du parking : les essais d'origine se jouaient dans l'entrepôt, entre ces deux équipes
  const B = OT.Battle;
  const equipes = () => [
    { name: 'Alpha', order: 'assault', operators: ['op_vautour', 'op_lynx', 'op_granit', 'op_bastion', 'op_belier'] },
    { name: 'Bravo', order: 'assault', operators: ['op_cobra', 'op_furet', 'op_harfang', 'op_bouclier', 'op_marteau'] },
  ];
  class Battle extends B { constructor(o) { o = o || {}; super(Object.assign({ mapId: 'entrepot' }, o, { teams: o.teams || equipes() })); } }
  Battle.defaultTeams = equipes;
  OT.Battle = Battle;
  return OT;
};
