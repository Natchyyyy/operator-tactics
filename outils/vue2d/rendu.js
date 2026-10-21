// Vue de dessus des batailles (outil de débogage de l'IA, ne touche pas au jeu).
//   OT.Vue2D.snap(battle, depuis) → image figée d'un pas (données simples, copiables)
//   OT.Vue2D.svg(carte, image, opts) → dessin SVG (chaîne) de cette image
// Même code dans Node (outils/vue2d.js → PNG) et dans la page (outils/vue2d/page.html).
// Légende : gris foncé = obstacle haut (≥ 1,6 m, cache un homme debout), gris clair = obstacle bas ; points bleus / rouges =
// soldats (trait = regard, plein s'il vise, pointillé sinon ; petit point = accroupi ; anneau blanc = au coin d'un mur) ;
// pointillés = chemin prévu ; croix = positions ennemies connues (du soldat choisi, sinon de toute l'équipe) ;
// losange = coin de tir prévu ; traits jaunes = tirs ; cercles gris = fumée.
(function (root) {
  const TALL = 1.6;
  const COUL = [{ f: '#3b82f6', c: '#1d4ed8', l: '#93c5fd' }, { f: '#ef4444', c: '#b91c1c', l: '#fca5a5' }];
  const r2 = (v) => Math.round(v * 100) / 100;

  function snap(b, depuis) {
    const ev = [];
    for (let i = depuis || 0; i < b.events.length; i++) {
      const e = b.events[i];
      if (e.type === 'shot') ev.push({ type: 'shot', fx: r2(e.from.x), fz: r2(e.from.z), tx: r2(e.to.x), tz: r2(e.to.z), hit: !!e.hit, sup: !!e.suppressive, team: (b.unitById(e.shooter) || {}).team });
      else if (e.type === 'grenade_blast') ev.push({ type: 'blast', kind: e.kind, x: r2(e.x), z: r2(e.z) });
      else if (e.type === 'grenade_throw') ev.push({ type: 'throw', kind: e.kind, fx: r2(e.from.x), fz: r2(e.from.z), tx: r2(e.to.x), tz: r2(e.to.z) });
      else if (e.type === 'down') ev.push({ type: 'down', unit: e.unit });
    }
    const units = b.units.map(u => {
      const kn = [];
      for (const id in u.knowledge) { const k = u.knowledge[id]; kn.push({ id, x: r2(k.x), z: r2(k.z), age: r2(b.t - k.t), seen: !!k.seen }); }
      const path = u.path ? u.path.slice(u.pathIdx || 0).map(p => [r2(p.x), r2(p.z)]) : null;
      return {
        id: u.id, cs: u.callsign, team: u.team, x: r2(u.x), z: r2(u.z), f: r2(u.facing), alive: u.alive, status: u.status,
        stance: u.stance, state: u.state, gk: u.goalKind || null, goal: u.goal ? [r2(u.goal.x), r2(u.goal.z)] : null, path,
        target: u.target && u.target.alive ? u.target.id : null, vis: [...u.visible], kn,
        peek: u.peek ? { hx: r2(u.peek.hx), hz: r2(u.peek.hz), px: r2(u.peek.px), pz: r2(u.peek.pz), ph: u.peek.phase } : null,
        peeking: !!u.peeking, blind: !!u.blindWall, sup: r2(u.suppression), hp: Math.round(u.hp), maxHp: Math.round(u.maxHp),
        ammo: u.ammo, reload: u.reloading > 0, order: u.moveOrder ? (u.moveOrder.mode || u.moveOrder.id || 'ordre') : null,
      };
    });
    const smokes = b.map.obstacles.filter(o => o.kind === 'smoke' && o.until > b.t).map(o => ({ x: r2(o.x + o.w / 2), z: r2(o.z + o.d / 2), r: r2(o.w / 2) }));
    const gren = (b.grenadesInFlight || []).filter(g => !g.done && b.t < g.explodeAt + 0.05).map(g => {
      const fl = 0.45 + Math.hypot(g.x - g.from.x, g.z - g.from.z) / 22;   // durée du vol (≈ releaseGrenade)
      const f = g.landed || b.t >= g.landAt ? 1 : Math.max(0, 1 - (g.landAt - b.t) / fl);
      return { kind: g.kind, x: r2(g.from.x + (g.x - g.from.x) * f), z: r2(g.from.z + (g.z - g.from.z) * f), landed: f >= 1 };
    });
    return { t: r2(b.t), units, smokes, gren, ev, zone: b.zone ? { x: b.zone.x, z: b.zone.z, r: b.zone.r, holder: b.zone.holder } : null };
  }

  function carte(map) {
    return { w: map.width, d: map.depth, name: map.name, obs: map.obstacles.filter(o => o.kind !== 'smoke').map(o => ({ x: o.x, z: o.z, w: o.w, d: o.d, h: o.h, n: o.name })) };
  }

  // opts : { echelle (px/m), choisi (id du soldat suivi), cadre {x0,z0,x1,z1} (zoom), titre, couches {chemins, connu, coins, tirs, noms, etats} }
  function svg(C, S, opts) {
    opts = opts || {};
    const K = opts.couches || {}, on = (k) => K[k] !== false;
    const fr = opts.cadre || { x0: 0, z0: 0, x1: C.w, z1: C.d };
    const sc = opts.echelle || 14, W = (fr.x1 - fr.x0) * sc, H = (fr.z1 - fr.z0) * sc, top = opts.titre === false ? 0 : 22;
    const X = (x) => ((x - fr.x0) * sc).toFixed(1), Z = (z) => ((z - fr.z0) * sc + top).toFixed(1), L = (v) => (v * sc).toFixed(1);
    const out = [];
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(0)}" height="${(H + top).toFixed(0)}" viewBox="0 0 ${W.toFixed(0)} ${(H + top).toFixed(0)}" font-family="Arial, Helvetica, sans-serif">`);
    out.push(`<rect width="100%" height="100%" fill="#e9ece4"/>`);
    out.push(`<defs><clipPath id="cl"><rect x="0" y="${top}" width="${W.toFixed(0)}" height="${H.toFixed(0)}"/></clipPath></defs><g clip-path="url(#cl)">`);
    // quadrillage tous les 5 m
    for (let x = Math.ceil(fr.x0 / 5) * 5; x <= fr.x1; x += 5) out.push(`<line x1="${X(x)}" y1="${Z(fr.z0)}" x2="${X(x)}" y2="${Z(fr.z1)}" stroke="#d6dacf" stroke-width="1"/>`);
    for (let z = Math.ceil(fr.z0 / 5) * 5; z <= fr.z1; z += 5) out.push(`<line x1="${X(fr.x0)}" y1="${Z(z)}" x2="${X(fr.x1)}" y2="${Z(z)}" stroke="#d6dacf" stroke-width="1"/>`);
    if (S.zone) out.push(`<circle cx="${X(S.zone.x)}" cy="${Z(S.zone.z)}" r="${L(S.zone.r)}" fill="#facc15" fill-opacity="0.12" stroke="#ca8a04" stroke-dasharray="6 4"/>`);
    for (const o of C.obs) {
      const tall = o.h >= TALL;
      out.push(`<rect x="${X(o.x)}" y="${Z(o.z)}" width="${L(o.w)}" height="${L(o.d)}" fill="${tall ? '#4b5563' : '#b8bdb3'}" stroke="${tall ? '#1f2937' : '#8d9488'}" stroke-width="1"><title>${o.n} — ${o.h} m</title></rect>`);
    }
    for (const s of S.smokes) out.push(`<circle cx="${X(s.x)}" cy="${Z(s.z)}" r="${L(s.r)}" fill="#9ca3af" fill-opacity="0.55" stroke="#6b7280"/>`);
    const sel = opts.choisi ? S.units.find(u => u.id === opts.choisi || u.cs === opts.choisi) : null;
    const byId = {}; for (const u of S.units) byId[u.id] = u;
    // positions ennemies connues : du soldat choisi, sinon de chaque équipe (la plus récente par ennemi)
    if (on('connu')) {
      const groupes = sel ? [{ team: sel.team, kn: sel.kn }] : [0, 1].map(team => {
        const best = {};
        for (const u of S.units) if (u.alive && u.team === team) for (const k of u.kn) if (!best[k.id] || k.age < best[k.id].age) best[k.id] = k;
        return { team, kn: Object.values(best) };
      });
      for (const g of groupes) for (const k of g.kn) {
        const c = COUL[g.team], op = Math.max(0.25, 1 - k.age / 15), s = 0.45 * sc;
        out.push(`<g stroke="${c.c}" stroke-width="2.2" opacity="${op.toFixed(2)}"><line x1="${(+X(k.x) - s).toFixed(1)}" y1="${(+Z(k.z) - s).toFixed(1)}" x2="${(+X(k.x) + s).toFixed(1)}" y2="${(+Z(k.z) + s).toFixed(1)}"/><line x1="${(+X(k.x) - s).toFixed(1)}" y1="${(+Z(k.z) + s).toFixed(1)}" x2="${(+X(k.x) + s).toFixed(1)}" y2="${(+Z(k.z) - s).toFixed(1)}"/></g>`);
        if (sel) out.push(`<text x="${(+X(k.x) + s + 2).toFixed(1)}" y="${(+Z(k.z) + 4).toFixed(1)}" font-size="10" fill="${c.c}">${k.seen ? 'vu' : 'entendu'} ${k.age.toFixed(1)} s</text>`);
      }
    }
    if (on('chemins')) for (const u of S.units) {
      if (!u.alive || !u.path || !u.path.length || (sel && u !== sel && opts.seulChoisi)) continue;
      const pts = [[u.x, u.z]].concat(u.path).map(p => `${X(p[0])},${Z(p[1])}`).join(' ');
      out.push(`<polyline points="${pts}" fill="none" stroke="${COUL[u.team].c}" stroke-width="${u === sel ? 2.4 : 1.4}" stroke-dasharray="5 4" opacity="0.8"/>`);
      const g = u.goal || u.path[u.path.length - 1];
      out.push(`<circle cx="${X(g[0])}" cy="${Z(g[1])}" r="3" fill="none" stroke="${COUL[u.team].c}" stroke-width="1.5"/>`);
    }
    if (on('coins')) for (const u of S.units) if (u.alive && u.peek) {
      const c = COUL[u.team].c, px = +X(u.peek.px), pz = +Z(u.peek.pz), s = 5;
      out.push(`<line x1="${X(u.peek.hx)}" y1="${Z(u.peek.hz)}" x2="${px}" y2="${pz}" stroke="${c}" stroke-width="1.5"/>`);
      out.push(`<polygon points="${px},${pz - s} ${px + s},${pz} ${px},${pz + s} ${px - s},${pz}" fill="#fff" stroke="${c}" stroke-width="1.5"/>`);
    }
    if (sel && on('vue')) for (const id of sel.vis) { const e = byId[id]; if (e) out.push(`<line x1="${X(sel.x)}" y1="${Z(sel.z)}" x2="${X(e.x)}" y2="${Z(e.z)}" stroke="#16a34a" stroke-width="1" stroke-dasharray="2 3"/>`); }
    if (on('tirs')) for (const e of S.ev) {
      if (e.type === 'shot') out.push(`<line x1="${X(e.fx)}" y1="${Z(e.fz)}" x2="${X(e.tx)}" y2="${Z(e.tz)}" stroke="${e.hit ? '#dc2626' : '#eab308'}" stroke-width="${e.hit ? 2 : 1.2}" opacity="${e.sup ? 0.5 : 0.9}"/>`);
      else if (e.type === 'throw') out.push(`<line x1="${X(e.fx)}" y1="${Z(e.fz)}" x2="${X(e.tx)}" y2="${Z(e.tz)}" stroke="#f97316" stroke-width="2" stroke-dasharray="3 3"/>`);
      else if (e.type === 'blast') out.push(`<circle cx="${X(e.x)}" cy="${Z(e.z)}" r="${L(e.kind === 'frag' ? 5 : e.kind === 'flash' ? 7 : 4.5)}" fill="${e.kind === 'smoke' ? '#9ca3af' : '#fb923c'}" fill-opacity="0.35" stroke="#ea580c" stroke-width="2"/>`);
    }
    for (const g of S.gren) out.push(`<circle cx="${X(g.x)}" cy="${Z(g.z)}" r="4" fill="${g.kind === 'smoke' ? '#6b7280' : g.kind === 'flash' ? '#fde047' : '#f97316'}" stroke="#111" stroke-width="1"/>`);
    for (const u of S.units) {
      const c = COUL[u.team], x = +X(u.x), z = +Z(u.z);
      if (!u.alive) {
        const s = 0.4 * sc, col = u.status === 'down' ? c.c : '#555';
        out.push(`<g stroke="${col}" stroke-width="3" opacity="0.7"><line x1="${x - s}" y1="${z - s}" x2="${x + s}" y2="${z + s}"/><line x1="${x - s}" y1="${z + s}" x2="${x + s}" y2="${z - s}"/></g>`);
        if (on('noms')) out.push(`<text x="${x + s + 2}" y="${z + 4}" font-size="10" fill="#555">${u.cs} ✝</text>`);
        continue;
      }
      const vise = !!u.target && u.state !== 'hide' && !u.blind, len = 2.2 * sc;
      out.push(`<line x1="${x}" y1="${z}" x2="${(x + Math.cos(u.f) * len).toFixed(1)}" y2="${(z + Math.sin(u.f) * len).toFixed(1)}" stroke="${c.c}" stroke-width="${vise ? 2.4 : 1.4}" ${vise ? '' : 'stroke-dasharray="3 3"'}/>`);
      const rr = (u.stance === 'crouch' ? 0.36 : 0.48) * sc;
      if (u === sel) out.push(`<circle cx="${x}" cy="${z}" r="${(rr + 6).toFixed(1)}" fill="none" stroke="#16a34a" stroke-width="2.5"/>`);
      if (u.sup > 0.05) out.push(`<circle cx="${x}" cy="${z}" r="${(rr + 2 + u.sup * 8).toFixed(1)}" fill="#f59e0b" fill-opacity="${(0.15 + u.sup * 0.3).toFixed(2)}" stroke="none"/>`);
      out.push(`<circle cx="${x}" cy="${z}" r="${rr.toFixed(1)}" fill="${c.f}" stroke="${u.peeking ? '#fff' : c.c}" stroke-width="${u.peeking ? 3 : 1.5}"><title>${u.cs}</title></circle>`);
      if (on('noms')) {
        const et = on('etats') ? ` · ${u.state}${u.gk ? '/' + u.gk : ''}${u.peek ? ' coin:' + u.peek.ph : ''}${u.reload ? ' ↻' : ''}` : '';
        out.push(`<text x="${(x + rr + 3).toFixed(1)}" y="${(z - rr - 1).toFixed(1)}" font-size="10.5" fill="#111" stroke="#e9ece4" stroke-width="2.5" paint-order="stroke">${u.cs}${et}</text>`);
      }
    }
    out.push('</g>');
    if (top) {
      const vivants = [0, 1].map(t => S.units.filter(u => u.team === t && u.alive).length);
      out.push(`<rect width="100%" height="${top}" fill="#1f2937"/><text x="8" y="15" font-size="12.5" fill="#f9fafb">${opts.titre || C.name} — t = ${S.t.toFixed(1)} s — <tspan fill="#93c5fd">bleus ${vivants[0]}</tspan> / <tspan fill="#fca5a5">rouges ${vivants[1]}</tspan>${sel ? ` — suivi : ${sel.cs} (${sel.state}${sel.gk ? '/' + sel.gk : ''}, suppression ${sel.sup.toFixed(2)}, ${sel.hp}/${sel.maxHp} PV)` : ''}</text>`);
    }
    out.push('</svg>');
    return out.join('');
  }

  root.Vue2D = { snap, carte, svg, COUL };
})(typeof module !== 'undefined' ? module.exports : (window.OT = window.OT || {}));
