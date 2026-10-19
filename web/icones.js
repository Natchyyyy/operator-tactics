// Petites icônes vectorielles de l'interface (style du jeu d'origine : pictogrammes pleins, clairs).
// OT.Ico(nom, classe) → chaîne <svg>. currentColor : la couleur suit le texte.
(function (root) {
  const P = {
    home: '<path d="M50 10 L92 48 H80 V90 H58 V64 H42 V90 H20 V48 H8 Z"/>',
    back: '<path d="M64 8 L74 18 L42 50 L74 82 L64 92 L22 50 Z"/>',
    gear: '<path d="M43 4 H57 L60 17 L70 21 L81 13 L91 23 L83 34 L87 44 L100 47 V61 L87 64 L83 74 L91 85 L81 95 L70 87 L60 91 L57 100 H43 L40 91 L30 87 L19 95 L9 85 L17 74 L13 64 L0 61 V47 L13 44 L17 34 L9 23 L19 13 L30 21 L40 17 Z M50 34 A20 20 0 1 0 50.1 34 Z" fill-rule="evenodd"/>',
    plus: '<path d="M42 8 H58 V42 H92 V58 H58 V92 H42 V58 H8 V42 H42 Z"/>',
    help: '<path d="M50 4 A46 46 0 1 0 50.1 4 Z M50 14 A36 36 0 1 1 49.9 14 Z" fill-rule="evenodd"/><path d="M36 38 C36 28 43 22 51 22 C60 22 66 28 66 36 C66 46 56 48 56 58 V62 H45 V56 C45 44 55 42 55 36 C55 32 53 30 50 30 C47 30 46 33 46 38 Z M44 68 H57 V80 H44 Z"/>',
    flag: '<rect x="14" y="8" width="6" height="86"/><path d="M20 12 C38 4 50 20 68 14 C76 12 82 10 88 8 V52 C78 58 70 58 62 56 C46 52 36 44 20 52 Z"/>',
    scale: '<rect x="46" y="10" width="8" height="72"/><rect x="26" y="84" width="48" height="8" rx="2"/><rect x="10" y="22" width="80" height="6"/><path d="M18 28 L4 58 H32 Z M82 28 L68 58 H96 Z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M2 58 H34 C32 68 26 72 18 72 C10 72 4 68 2 58 Z M66 58 H98 C96 68 90 72 82 72 C74 72 68 68 66 58 Z"/>',
    coin: '<circle cx="50" cy="50" r="46" fill="#c9a43c"/><circle cx="50" cy="50" r="38" fill="#e7c661"/><circle cx="50" cy="50" r="38" fill="none" stroke="#9c7a22" stroke-width="3"/><path d="M28 56 C34 40 46 34 62 36 L72 30 L70 42 C74 48 72 58 64 62 L52 58 L40 66 Z" fill="#b48b2c"/>',
    pack: '<rect x="18" y="14" width="56" height="74" rx="6" fill="#4d6b3b" stroke="#c9e6a0" stroke-width="4"/><rect x="30" y="8" width="56" height="74" rx="6" fill="#6f8f45" stroke="#e6f5c8" stroke-width="4"/><path d="M58 26 L63 38 L76 39 L66 47 L69 60 L58 53 L47 60 L50 47 L40 39 L53 38 Z" fill="#f4e27a"/>',
    // compétences
    tir: '<path d="M50 6 A44 44 0 1 0 50.1 6 Z M50 18 A32 32 0 1 1 49.9 18 Z M50 30 A20 20 0 1 0 50.1 30 Z M50 40 A10 10 0 1 1 49.9 40 Z" fill-rule="evenodd"/>',
    reflexes: '<path d="M58 4 L22 56 H46 L38 96 L80 40 H54 L66 4 Z"/>',
    mobilite: '<path d="M30 30 C34 22 44 22 48 30 L54 46 L78 56 C88 60 90 70 84 76 L28 76 C18 76 14 70 18 60 Z"/><path d="M50 26 C60 10 80 6 96 10 C84 14 74 18 66 26 C78 22 88 24 96 28 C84 30 72 32 62 38 Z" opacity=".85"/><rect x="16" y="80" width="72" height="8" rx="3"/>',
    perception: '<path d="M4 50 C18 26 34 16 50 16 C66 16 82 26 96 50 C82 74 66 84 50 84 C34 84 18 74 4 50 Z M50 30 A20 20 0 1 0 50.1 30 Z" fill-rule="evenodd"/><circle cx="50" cy="50" r="9"/>',
    sangfroid: '<path d="M50 4 L90 16 V46 C90 72 72 88 50 97 C28 88 10 72 10 46 V16 Z M50 18 V84 C64 76 76 64 76 46 V26 Z" fill-rule="evenodd"/>',
    endurance: '<rect x="45" y="6" width="10" height="90" rx="3"/><circle cx="50" cy="10" r="7"/><path d="M50 24 C70 24 70 38 50 40 C30 42 30 56 50 58 C70 60 70 74 50 76" fill="none" stroke="currentColor" stroke-width="7"/><path d="M20 22 C30 14 40 18 46 24 C36 22 28 26 20 22 Z M80 22 C70 14 60 18 54 24 C64 22 72 26 80 22 Z"/>',
    // rôles
    r_assault: '<path d="M44 4 H56 V38 L86 20 L92 30 L62 48 L92 66 L86 76 L56 58 V96 H44 V58 L14 76 L8 66 L38 48 L8 30 L14 20 L44 38 Z"/>',
    r_pointman: '<path d="M50 4 L92 46 L80 58 L50 28 L20 58 L8 46 Z M50 42 L92 84 L80 96 L50 66 L20 96 L8 84 Z"/>',
    r_marksman: '<path d="M50 6 A44 44 0 1 0 50.1 6 Z M50 16 A34 34 0 1 1 49.9 16 Z" fill-rule="evenodd"/><path d="M46 0 H54 V36 H46 Z M46 64 H54 V100 H46 Z M0 46 H36 V54 H0 Z M64 46 H100 V54 H64 Z"/><circle cx="50" cy="50" r="6"/>',
    r_support: '<path d="M14 40 L24 22 L34 40 V92 H14 Z M40 40 L50 22 L60 40 V92 H40 Z M66 40 L76 22 L86 40 V92 H66 Z"/>',
    r_breacher: '<path d="M50 30 C70 30 82 46 82 64 C82 82 68 96 50 96 C32 96 18 82 18 64 C18 46 30 30 50 30 Z"/><rect x="42" y="14" width="16" height="16" rx="2"/><path d="M58 18 C68 10 80 12 86 20" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="40" cy="58" r="8" fill="#fff" fill-opacity=".35"/>',
    r_leader: '<path d="M50 4 A46 46 0 1 0 50.1 4 Z M50 12 A38 38 0 1 1 49.9 12 Z" fill-rule="evenodd"/><path d="M47 8 H53 V92 H47 Z M8 47 H92 V53 H8 Z"/><path d="M50 8 C30 24 30 76 50 92 C70 76 70 24 50 8 Z M50 16 C38 30 38 70 50 84 C62 70 62 30 50 16 Z" fill-rule="evenodd"/><path d="M16 28 H84 V33 H16 Z M16 67 H84 V72 H16 Z"/>',
    radio: '<circle cx="50" cy="50" r="10"/><path d="M30 30 A28 28 0 0 0 30 70 L36 64 A20 20 0 0 1 36 36 Z M70 30 A28 28 0 0 1 70 70 L64 64 A20 20 0 0 0 64 36 Z M18 18 A45 45 0 0 0 18 82 L24 76 A37 37 0 0 1 24 24 Z M82 18 A45 45 0 0 1 82 82 L76 76 A37 37 0 0 0 76 24 Z"/>',
    // boutons de jeu
    arrows: '<path d="M50 6 L80 36 H62 V58 H38 V36 H20 Z" fill="#e0312a"/><path d="M8 40 L44 54 L36 62 L52 86 L34 92 L22 68 L12 74 Z" fill="#c4231d"/><path d="M92 40 L56 54 L64 62 L48 86 L66 92 L78 68 L88 74 Z" fill="#c4231d"/>',
    replay: '<path d="M50 10 A40 40 0 1 1 14 66 L28 60 A25 25 0 1 0 50 25 V40 L24 18 L50 -4 Z" fill="#e0312a"/>',
    skip: '<path d="M6 16 L40 50 L6 84 Z M44 16 L78 50 L44 84 Z"/><rect x="82" y="16" width="12" height="68"/>',
    play: '<path d="M18 8 L90 50 L18 92 Z"/>',
    pause: '<path d="M50 4 A46 46 0 1 0 50.1 4 Z M50 12 A38 38 0 1 1 49.9 12 Z" fill-rule="evenodd"/><rect x="34" y="28" width="10" height="44"/><rect x="56" y="28" width="10" height="44"/>',
    lock: '<path d="M28 44 V32 C28 16 38 6 50 6 C62 6 72 16 72 32 V44 H62 V32 C62 22 57 16 50 16 C43 16 38 22 38 32 V44 Z"/><rect x="18" y="44" width="64" height="50" rx="6"/>',
    soldier: '<circle cx="50" cy="14" r="10"/><path d="M38 28 H62 L70 56 L62 58 L58 44 V96 H52 V66 H48 V96 H42 V44 L38 58 L30 56 Z"/><path d="M64 34 L92 26 L94 30 L66 40 Z"/>',
    helmet: '<path d="M10 62 C10 30 28 14 52 14 C76 14 92 32 92 58 L96 66 H58 V58 H24 V66 H6 Z"/><path d="M14 70 H92 V76 H14 Z"/>',
    shield: '<path d="M50 4 L90 16 V46 C90 72 72 88 50 97 C28 88 10 72 10 46 V16 Z"/>',
    cards: '<rect x="8" y="22" width="44" height="64" rx="5" transform="rotate(-14 30 54)"/><rect x="30" y="14" width="44" height="64" rx="5" fill-opacity=".85"/><rect x="50" y="22" width="44" height="64" rx="5" transform="rotate(14 72 54)" fill-opacity=".7"/>',
    trophy: '<path d="M26 8 H74 V34 C74 50 64 60 50 60 C36 60 26 50 26 34 Z M26 16 H10 C10 34 18 42 28 42 M74 16 H90 C90 34 82 42 72 42" fill="none" stroke="currentColor" stroke-width="6"/><path d="M26 8 H74 V34 C74 50 64 60 50 60 C36 60 26 50 26 34 Z"/><rect x="44" y="58" width="12" height="16"/><rect x="28" y="74" width="44" height="14" rx="3"/>',
    chart: '<rect x="10" y="56" width="16" height="34"/><rect x="34" y="36" width="16" height="54"/><rect x="58" y="46" width="16" height="44"/><rect x="82" y="16" width="12" height="74"/>',
    contract: '<rect x="16" y="6" width="68" height="88" rx="5"/><path d="M28 26 H72 M28 40 H72 M28 54 H60" stroke="#000" stroke-opacity=".45" stroke-width="6"/><path d="M52 66 L60 78 L78 58" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="8"/>',
    paint: '<path d="M60 6 L94 40 L50 84 L16 50 Z" /><path d="M16 56 C6 66 6 80 12 88 C20 94 34 94 44 84 Z" fill-opacity=".7"/>',
    son: '<path d="M10 36 H30 L56 14 V86 L30 64 H10 Z"/><path d="M66 34 C74 42 74 58 66 66 M76 24 C90 38 90 62 76 76" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>',
    sonoff: '<path d="M10 36 H30 L56 14 V86 L30 64 H10 Z"/><path d="M68 38 L92 62 M92 38 L68 62" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>',
    sat: '<path d="M38 8 L62 32 L52 42 L28 18 Z M58 48 L82 72 L92 62 L68 38 Z"/><rect x="38" y="34" width="22" height="22" transform="rotate(45 49 45)"/><path d="M20 70 C24 80 30 86 40 88 M14 76 C18 88 26 94 38 96" fill="none" stroke="currentColor" stroke-width="5"/>',
  };
  root.Ico = (name, cls) => P[name] ? `<svg class="ico ${cls || ''}" viewBox="0 0 100 100" fill="currentColor" aria-hidden="true">${P[name]}</svg>` : '';
  root.Ico.has = (n) => !!P[n];
  // drapeaux nationaux simplifiés (viewBox 0 0 60 40), pour les cartes d'opérateurs (comme le jeu d'origine)
  const tri = (a, b, c, v) => v ? `<rect width="60" height="40" fill="${a}"/><rect y="13.3" width="60" height="13.4" fill="${b}"/><rect y="26.7" width="60" height="13.3" fill="${c}"/>` : `<rect width="20" height="40" fill="${a}"/><rect x="20" width="20" height="40" fill="${b}"/><rect x="40" width="20" height="40" fill="${c}"/>`;
  const nordic = (bg, cr, inner) => `<rect width="60" height="40" fill="${bg}"/><rect x="16" width="10" height="40" fill="${cr}"/><rect y="15" width="60" height="10" fill="${cr}"/>${inner ? `<rect x="18.5" width="5" height="40" fill="${inner}"/><rect y="17.5" width="60" height="5" fill="${inner}"/>` : ''}`;
  const union = '<rect width="60" height="40" fill="#123c8c"/><path d="M0 0 L60 40 M60 0 L0 40" stroke="#fff" stroke-width="8"/><path d="M0 0 L60 40 M60 0 L0 40" stroke="#c8102e" stroke-width="3"/><path d="M30 0 V40 M0 20 H60" stroke="#fff" stroke-width="12"/><path d="M30 0 V40 M0 20 H60" stroke="#c8102e" stroke-width="7"/>';
  const FLAGS = {
    'France': tri('#1e3d8f', '#fff', '#d6252e'), 'Italie': tri('#1d8f45', '#fff', '#d22f27'), 'Belgique': tri('#111', '#f7d117', '#e3242b'),
    'Allemagne': tri('#111', '#d6252e', '#f2c400', 1), 'Pays-Bas': tri('#b0242b', '#fff', '#21468b', 1), 'Autriche': tri('#d22f27', '#fff', '#d22f27', 1),
    'Pologne': '<rect width="60" height="20" fill="#fff"/><rect y="20" width="60" height="20" fill="#d4213d"/>',
    'Espagne': '<rect width="60" height="40" fill="#c60b1e"/><rect y="10" width="60" height="20" fill="#ffc400"/>',
    'Danemark': nordic('#c8102e', '#fff'), 'Norvège': nordic('#ba0c2f', '#fff', '#00205b'), 'Suède': nordic('#006aa7', '#fecc00'),
    'Royaume-Uni': union,
    'Australie': '<rect width="60" height="40" fill="#012169"/><g transform="scale(.5)">' + union.replace('<rect width="60" height="40" fill="#123c8c"/>', '<rect width="60" height="40" fill="#012169"/>') + '</g><circle cx="15" cy="31" r="4" fill="#fff"/><circle cx="45" cy="9" r="2" fill="#fff"/><circle cx="51" cy="18" r="2" fill="#fff"/><circle cx="40" cy="22" r="2" fill="#fff"/><circle cx="45" cy="33" r="2.4" fill="#fff"/>',
    'Canada': '<rect width="60" height="40" fill="#fff"/><rect width="15" height="40" fill="#d52b1e"/><rect x="45" width="15" height="40" fill="#d52b1e"/><path d="M30 6 L33 13 L37 11 L35 21 L41 16 L40 20 L45 21 L41 25 L42 28 L32 27 L31 34 H29 L28 27 L18 28 L19 25 L15 21 L20 20 L19 16 L25 21 L23 11 L27 13 Z" fill="#d52b1e"/>',
    'Israël': '<rect width="60" height="40" fill="#fff"/><rect y="4" width="60" height="6" fill="#0038b8"/><rect y="30" width="60" height="6" fill="#0038b8"/><path d="M30 12 L36.9 24 H23.1 Z M30 28 L23.1 16 H36.9 Z" fill="none" stroke="#0038b8" stroke-width="1.8"/>',
    'États-Unis': '<rect width="60" height="40" fill="#fff"/>' + [0, 2, 4, 6, 8, 10, 12].map(i => `<rect y="${i * 40 / 13}" width="60" height="${40 / 13}" fill="#b22234"/>`).join('') + '<rect width="26" height="21.5" fill="#3c3b6e"/>' + Array.from({ length: 20 }, (_, i) => `<circle cx="${2.6 + (i % 5) * 5.2 + (Math.floor(i / 5) % 2) * 2.6}" cy="${2.6 + Math.floor(i / 5) * 5.2}" r="1" fill="#fff"/>`).join(''),
  };
  root.Flag = (unit) => { const m = /\(([^)]+)\)/.exec(unit || ''); const f = m && FLAGS[m[1]]; return f ? `<svg class="flag" viewBox="0 0 60 40" preserveAspectRatio="none" aria-label="${m[1]}">${f}</svg>` : ''; };

})(window.OT = window.OT || {});
