// Médailles des modes de jeu (écran Jouer), dessinées en vectoriel avec des dégradés métalliques, dans l'esprit des
// grandes médailles du jeu d'origine : bronze (bataille rapide), argent (régulière), or (vétéran), étoile bleu et or (élite),
// acier sombre (opération Delta), étoile argent (opérations spéciales). Formes originales.
(function (root) {
  let uid = 0;
  const metal = (id, a, b, c, d) => `<linearGradient id="${id}" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".35" stop-color="${b}"/><stop offset=".62" stop-color="${c}"/><stop offset="1" stop-color="${d}"/></linearGradient>`;
  const radial = (id, a, b) => `<radialGradient id="${id}" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient>`;
  const star = (n, R, r, cx, cy, rot = -Math.PI / 2) => { let d = ''; for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, rr = i % 2 ? r : R; d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(1) + ' ' + (cy + Math.sin(a) * rr).toFixed(1); } return d + 'Z'; };
  // crâne stylisé (centré en cx, cy, largeur ~ 2*s)
  const skull = (cx, cy, s, fill, hole) => `<path d="M${cx} ${cy - s} C${cx - s * 0.95} ${cy - s} ${cx - s * 1.1} ${cy - s * 0.2} ${cx - s * 0.95} ${cy + s * 0.25} C${cx - s * 0.85} ${cy + s * 0.5} ${cx - s * 0.6} ${cy + s * 0.55} ${cx - s * 0.55} ${cy + s * 0.65} L${cx - s * 0.5} ${cy + s * 1.05} L${cx + s * 0.5} ${cy + s * 1.05} L${cx + s * 0.55} ${cy + s * 0.65} C${cx + s * 0.6} ${cy + s * 0.55} ${cx + s * 0.85} ${cy + s * 0.5} ${cx + s * 0.95} ${cy + s * 0.25} C${cx + s * 1.1} ${cy - s * 0.2} ${cx + s * 0.95} ${cy - s} ${cx} ${cy - s} Z" fill="${fill}" stroke="#00000066" stroke-width="2"/>`
    + `<ellipse cx="${cx - s * 0.4}" cy="${cy + s * 0.05}" rx="${s * 0.27}" ry="${s * 0.3}" fill="${hole}"/><ellipse cx="${cx + s * 0.4}" cy="${cy + s * 0.05}" rx="${s * 0.27}" ry="${s * 0.3}" fill="${hole}"/>`
    + `<path d="M${cx} ${cy + s * 0.32} L${cx - s * 0.13} ${cy + s * 0.58} L${cx + s * 0.13} ${cy + s * 0.58} Z" fill="${hole}"/>`
    + `<path d="M${cx - s * 0.3} ${cy + s * 0.75} V${cy + s * 1.02} M${cx - s * 0.1} ${cy + s * 0.75} V${cy + s * 1.05} M${cx + s * 0.1} ${cy + s * 0.75} V${cy + s * 1.05} M${cx + s * 0.3} ${cy + s * 0.75} V${cy + s * 1.02}" stroke="${hole}" stroke-width="${s * 0.07}"/>`;
  const wings = (cx, cy, w, fill) => { let d = ''; for (const sx of [-1, 1]) { const p = (x, y) => `${(cx + sx * x).toFixed(1)} ${(cy + y).toFixed(1)}`; d += `M${p(w * 0.2, -w * 0.05)} L${p(w * 1.0, -w * 0.62)} L${p(w * 0.92, -w * 0.38)} L${p(w * 1.08, -w * 0.36)} L${p(w * 0.86, -w * 0.12)} L${p(w * 1.0, -w * 0.08)} L${p(w * 0.74, w * 0.12)} L${p(w * 0.84, w * 0.2)} L${p(w * 0.5, w * 0.3)} L${p(w * 0.2, w * 0.2)} Z `; } return `<path d="${d}" fill="${fill}" stroke="#00000055" stroke-width="2"/>`; };
  function svg(kind) {
    const k = 'm' + (uid++);
    const G = { b: k + 'b', s: k + 's', g: k + 'g', r: k + 'r', dk: k + 'd', bl: k + 'l' };
    const defs = `<defs>${metal(G.b, '#f6d5a0', '#c48a4c', '#8a5428', '#e0aa6a')}${metal(G.s, '#ffffff', '#c9ced3', '#7e858c', '#e6e9ec')}${metal(G.g, '#fff2b0', '#e8b83a', '#9a6a10', '#f2cc60')}${radial(G.r, '#ff6a5a', '#8a0c08')}${metal(G.dk, '#9aa3a8', '#4a5257', '#1e2427', '#6b757b')}${radial(G.bl, '#5b8ce8', '#14306e')}</defs>`;
    let body = '';
    if (kind === 'rapide') {
      body = `<circle cx="100" cy="100" r="86" fill="url(#${G.b})" stroke="#4a2a10" stroke-width="4"/><circle cx="100" cy="100" r="70" fill="none" stroke="#5a3418" stroke-width="3"/>`
        + Array.from({ length: 14 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI * 2 / 14; return `<circle cx="${(100 + Math.cos(a) * 78).toFixed(1)}" cy="${(100 + Math.sin(a) * 78).toFixed(1)}" r="3.4" fill="#ffe2b0" opacity=".8"/>`; }).join('')
        + `<path d="M40 150 C34 120 40 92 60 72 M160 150 C166 120 160 92 140 72" fill="none" stroke="url(#${G.b})" stroke-width="10" stroke-linecap="round"/>`
        + Array.from({ length: 5 }, (_, i) => `<ellipse cx="${46 + i * 3}" cy="${140 - i * 15}" rx="10" ry="5" transform="rotate(${-50 + i * 8} ${46 + i * 3} ${140 - i * 15})" fill="#d79a58" stroke="#5a3418" stroke-width="1.5"/><ellipse cx="${154 - i * 3}" cy="${140 - i * 15}" rx="10" ry="5" transform="rotate(${50 - i * 8} ${154 - i * 3} ${140 - i * 15})" fill="#d79a58" stroke="#5a3418" stroke-width="1.5"/>`).join('')
        + `<path d="M64 52 H136 L130 150 L100 168 L70 150 Z" fill="url(#${G.g})" stroke="#5a3a08" stroke-width="4"/><rect x="62" y="40" width="76" height="24" rx="4" fill="#7a3a14" stroke="#f0c070" stroke-width="2"/><text x="100" y="58" text-anchor="middle" font-family="RAW, sans-serif" font-size="17" fill="#ffd890">MISSION</text>`
        + `<text x="100" y="138" text-anchor="middle" font-family="Arial Black, sans-serif" font-weight="900" font-size="74" fill="#2a1a08">?</text>`
        + `<path d="${star(5, 22, 9, 100, 176)}" fill="url(#${G.b})" stroke="#4a2a10" stroke-width="2"/>`;
    } else if (kind === 'reguliere' || kind === 'veteran') {
      const m = kind === 'veteran' ? G.g : G.s, st = kind === 'veteran' ? '#6a4808' : '#4a5258';
      body = `<path d="M60 26 L48 6 L76 22 Z M140 26 L152 6 L124 22 Z" fill="url(#${m})" stroke="${st}" stroke-width="2"/>`
        + wings(100, 92, 90, `url(#${m})`)
        + `<path d="M100 20 L156 40 V96 C156 134 130 158 100 172 C70 158 44 134 44 96 V40 Z" fill="${kind === 'veteran' ? `url(#${G.r})` : '#7a1e3a'}" stroke="url(#${m})" stroke-width="9"/>`
        + skull(100, 86, 40, `url(#${G.s})`, kind === 'veteran' ? '#b01010' : '#c0203a')
        + `<path d="M58 150 L100 128 L142 150 M58 132 L100 110 L142 132" fill="none" stroke="url(#${m})" stroke-width="8" stroke-linejoin="round" opacity="${kind === 'veteran' ? 1 : 0}"/>`
        + `<path d="M70 178 L100 162 L130 178 L100 196 Z" fill="url(#${m})" stroke="${st}" stroke-width="2" opacity="${kind === 'veteran' ? 1 : 0.9}"/>`;
    } else if (kind === 'elite') {
      body = `<path d="${star(12, 96, 60, 100, 100)}" fill="url(#${G.bl})" stroke="#0c1e48" stroke-width="3"/>`
        + `<path d="${star(12, 88, 64, 100, 100, -Math.PI / 2 + Math.PI / 12)}" fill="url(#${G.g})" stroke="#6a4808" stroke-width="2"/>`
        + Array.from({ length: 12 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 6; return `<circle cx="${(100 + Math.cos(a) * 92).toFixed(1)}" cy="${(100 + Math.sin(a) * 92).toFixed(1)}" r="5" fill="url(#${G.g})" stroke="#6a4808" stroke-width="1.5"/>`; }).join('')
        + `<circle cx="100" cy="100" r="58" fill="url(#${G.g})" stroke="#6a4808" stroke-width="4"/><circle cx="100" cy="100" r="48" fill="none" stroke="#fff3c0" stroke-width="2" opacity=".6"/>`
        + [[100, 72], [76, 94], [124, 94], [86, 124], [114, 124]].map(([x, y]) => `<path d="${star(5, 15, 6, x, y)}" fill="#8a5a08" stroke="#ffe9a0" stroke-width="1.5"/>`).join('');
    } else if (kind === 'delta') {
      body = `<path d="M100 10 L190 172 H10 Z" fill="url(#${G.dk})" stroke="#0c1012" stroke-width="5"/><path d="M100 36 L166 156 H34 Z" fill="none" stroke="#c9d1d6" stroke-width="3" opacity=".6"/>`
        + skull(100, 112, 34, `url(#${G.s})`, '#1e2a20')
        + `<path d="M40 182 L160 148 M40 148 L160 182" stroke="url(#${G.s})" stroke-width="9" stroke-linecap="round"/>`;
    } else {   // opérations spéciales : grosse étoile d'argent dans un cercle
      body = `<circle cx="100" cy="100" r="86" fill="url(#${G.s})" stroke="#4a5258" stroke-width="4"/><circle cx="100" cy="100" r="74" fill="none" stroke="#ffffff" stroke-width="2" opacity=".7"/><path d="${star(5, 66, 26, 100, 104)}" fill="#5c646b" stroke="#e8ecef" stroke-width="3"/>`;
    }
    return `<svg class="medal" viewBox="0 0 200 200" aria-hidden="true">${defs}${body}</svg>`;
  }
  root.Medaille = svg;
})(window.OT = window.OT || {});
