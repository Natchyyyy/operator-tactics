// Emblèmes d'équipe en silhouettes vectorielles (comme les emblèmes pleins du jeu d'origine : scorpion, alpha, bêta…).
// Une forme par glyphe d'insigne (insignes du joueur, factions, équipes de ligue). OT.Embleme.svg(glyphe, couleur)
// renvoie un <svg> ; un glyphe inconnu est rendu en texte (même taille). Formes originales, dessinées ici.
(function (root) {
  const star = (n, R, r, cx = 50, cy = 50, rot = -Math.PI / 2) => { let d = ''; for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, rr = i % 2 ? r : R; d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(1) + ' ' + (cy + Math.sin(a) * rr).toFixed(1); } return d + 'Z'; };
  // chaque entrée : contenu SVG (viewBox 0 0 100 100), « C » = couleur
  const SHAPES = {
    '✶': `<path d="${star(5, 47, 19)}" fill="C"/>`,
    '⛨': `<path d="M50 4 L90 16 V46 C90 72 72 88 50 97 C28 88 10 72 10 46 V16 Z" fill="C"/><path d="M50 22 L70 30 V48 C70 62 61 72 50 78 C39 72 30 62 30 48 V30 Z" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="5"/>`,
    '⚚': `<path d="M50 20 L56 12 L62 15 L58 22 L97 18 L88 28 L95 30 L82 38 L88 42 L72 46 L64 56 L59 76 L50 94 L41 76 L36 56 L28 46 L12 42 L18 38 L5 30 L12 28 L3 18 L42 22 L38 15 L44 12 Z" fill="C"/><circle cx="50" cy="9" r="6" fill="C"/>`,
    '⚡': `<path d="M60 3 L20 57 H45 L35 97 L82 39 H55 L68 3 Z" fill="C"/>`,
    '⚓': `<g fill="none" stroke="C" stroke-width="9" stroke-linecap="round"><circle cx="50" cy="15" r="9"/><path d="M50 24 V90 M28 38 H72 M14 60 C16 80 34 90 50 90 C66 90 84 80 86 60"/></g><path d="M6 64 L14 52 L22 64 Z M78 64 L86 52 L94 64 Z" fill="C"/>`,
    '✵': `<path d="${star(4, 48, 11)}" fill="C"/><path d="${star(4, 30, 8, 50, 50, -Math.PI / 4)}" fill="C" opacity=".8"/><circle cx="50" cy="50" r="7" fill="#000" fill-opacity=".35"/>`,
    '†': `<path d="M47 4 H53 L57 14 V62 H43 V14 Z" fill="C"/><rect x="24" y="62" width="52" height="8" rx="3" fill="C"/><rect x="45" y="70" width="10" height="16" fill="C"/><circle cx="50" cy="91" r="6" fill="C"/>`,
    '♔': `<path d="M10 76 L5 28 L29 47 L50 14 L71 47 L95 28 L90 76 Z" fill="C"/><rect x="10" y="80" width="80" height="11" rx="3" fill="C"/><circle cx="5" cy="25" r="5" fill="C"/><circle cx="50" cy="11" r="5" fill="C"/><circle cx="95" cy="25" r="5" fill="C"/>`,
    '◎': `<g fill="none" stroke="C" stroke-width="7"><circle cx="50" cy="50" r="40"/><circle cx="50" cy="50" r="22"/></g><circle cx="50" cy="50" r="7" fill="C"/><path d="M50 0 V24 M50 76 V100 M0 50 H24 M76 50 H100" stroke="C" stroke-width="6"/>`,
    '♨': `<path d="M50 96 C24 96 14 78 18 60 C22 44 34 38 32 18 C46 28 50 40 46 54 C54 48 58 38 56 26 C72 40 86 58 80 76 C76 88 64 96 50 96 Z" fill="C"/><path d="M50 90 C40 90 36 82 38 74 C40 66 46 64 46 56 C54 62 56 70 54 76 C60 74 62 68 62 64 C68 72 66 84 58 88 Z" fill="#000" fill-opacity=".3"/>`,
    // factions
    '⚑': `<rect x="14" y="6" width="7" height="90" rx="2" fill="C"/><path d="M21 10 C40 2 52 18 70 12 C78 10 84 8 90 6 V52 C80 58 72 58 64 56 C48 52 38 44 21 52 Z" fill="C"/>`,
    '☠': `<path d="M50 8 C28 8 16 24 18 44 C19 54 24 60 30 64 V76 H70 V64 C76 60 81 54 82 44 C84 24 72 8 50 8 Z" fill="C"/><circle cx="37" cy="42" r="9" fill="#000" fill-opacity=".75"/><circle cx="63" cy="42" r="9" fill="#000" fill-opacity=".75"/><path d="M50 52 L45 62 H55 Z" fill="#000" fill-opacity=".75"/><path d="M36 78 V92 M44 78 V94 M56 78 V94 M64 78 V92" stroke="C" stroke-width="5"/><path d="M8 84 L92 98 M92 84 L8 98" stroke="C" stroke-width="6" stroke-linecap="round"/>`,
    // équipes de ligue
    '⚔': `<g stroke="C" stroke-width="8" stroke-linecap="round"><path d="M18 18 L72 72 M82 18 L28 72"/></g><path d="M10 10 L26 14 L14 26 Z M90 10 L74 14 L86 26 Z" fill="C"/><path d="M62 78 L78 62 M38 78 L22 62" stroke="C" stroke-width="10"/><path d="M80 80 L92 92 M20 80 L8 92" stroke="C" stroke-width="8" stroke-linecap="round"/>`,
    '☾': `<path d="M62 6 C34 10 16 30 16 54 C16 78 36 96 60 94 C74 93 84 86 90 78 C80 82 70 82 60 78 C42 70 34 50 40 32 C44 20 52 12 62 6 Z" fill="C"/><path d="${star(5, 10, 4, 70, 40)}" fill="C"/>`,
    '△': `<path d="M50 6 L96 90 H4 Z M50 32 L24 78 H76 Z" fill="C" fill-rule="evenodd"/>`,
    '①': `<circle cx="50" cy="50" r="44" fill="none" stroke="C" stroke-width="8"/><path d="M42 30 L56 22 V78 H44 V40 L36 44 Z" fill="C"/>`,
    '✦': `<path d="${star(4, 48, 12)}" fill="C"/>`,
    '☢': `<circle cx="50" cy="50" r="9" fill="C"/><path d="M50 50 L50 6 A44 44 0 0 1 88 28 Z M50 50 L88 72 A44 44 0 0 1 12 72 Z M50 50 L12 28 A44 44 0 0 1 50 6 Z" fill="C" transform="rotate(30 50 50)"/><circle cx="50" cy="50" r="15" fill="#000" fill-opacity=".0"/>`,
    '✈': `<path d="M50 4 C55 4 57 10 57 18 V40 L94 60 V70 L57 58 V80 L70 90 V96 L50 90 L30 96 V90 L43 80 V58 L6 70 V60 L43 40 V18 C43 10 45 4 50 4 Z" fill="C"/>`,
    '✚': `<path d="M38 6 H62 V38 H94 V62 H62 V94 H38 V62 H6 V38 H38 Z" fill="C"/>`,
    '◈': `<path d="M50 2 L98 50 L50 98 L2 50 Z M50 26 L74 50 L50 74 L26 50 Z" fill="C" fill-rule="evenodd"/><path d="M50 38 L62 50 L50 62 L38 50 Z" fill="C"/>`,
  };
  function svg(glyph, color, cls) {
    const s = SHAPES[glyph];
    if (!s) return `<span class="emb-txt ${cls || ''}" style="color:${color}">${glyph || ''}</span>`;
    return `<svg class="emb ${cls || ''}" viewBox="0 0 100 100" aria-hidden="true">${s.replace(/"C"/g, `"${color}"`)}</svg>`;
  }
  root.Embleme = { svg, has: (g) => !!SHAPES[g] };
})(window.OT = window.OT || {});
