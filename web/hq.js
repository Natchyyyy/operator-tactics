// Quartier général : collection, escouade, équipement, formation, missions, récompenses, sauvegarde.
// Toute la logique vient de sim/game.js ; ce fichier affiche le profil et relaie les actions.
(function () {
  const OT = window.OT; const { Game, DATA, League } = OT;
  const { WEAPONS, ARMORS, ROLES, OPERATORS, ORDERS, MISSIONS, PRICES, TRAITS, CHALLENGES, TACTICS, INSIGNIAS, UNIFORMS, RANKS, PACKS, ACHIEVEMENTS, CONTRACT } = DATA;
  const TACTIC_ICON = { fumigene: '💨', reco: '📡', soins: '✚', barrage: '💥', drill: '🛡', blitz: '⚡', retranche: '🧱', discipline: '🎯', frappe: '✈', tete: '☠', camouflage: '🌿', triage: '⛑' };
  const $ = (s) => document.querySelector(s);
  const STAT_FR = { marksmanship: 'Tir', reflexes: 'Réflexes', mobility: 'Mobilité', perception: 'Perception', composure: 'Sang-froid', endurance: 'Endurance' };
  const LANE_FR = { '-1': 'Nord', '0': 'Centre', '1': 'Sud', 'null': 'Auto' };
  const RARITY_FR = { 1: 'Commun', 2: 'Rare', 3: 'Élite' };
  const roleIcon = { assault: 'AS', pointman: 'PT', marksman: 'TE', support: 'AP', breacher: 'BR' };

  let storage = null; try { storage = window.localStorage; storage.getItem('x'); } catch (e) { storage = null; }
  let profile = (storage && Game.load(storage)) || Game.newProfile();
  let selected = profile.squad[0] || OPERATORS[0].id;
  let selectedMission = MISSIONS[0].id, selectedCampaign = 'reguliere', quickPending = null;
  // la mission sélectionnée, telle qu'elle sera jouée (campagne : adversaire ajusté ; bataille rapide : tirée au sort une fois)
  const currentMission = () => selectedMission === 'rapide' ? (quickPending = quickPending || Game.quickBattle(profile)) : Game.campaignMission(selectedCampaign, selectedMission.includes(':') ? selectedMission.split(':')[1] : selectedMission);
  let lastRewards = null;
  const saveNow = () => { if (storage) Game.save(profile, storage); };

  const esc = (s) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function portraitOf(o, full) {
    const st = profile.operators[o.id] || {}; const uni = UNIFORMS.find(u => u.id === profile.uniform) || UNIFORMS[0];
    const fac = o.faction ? DATA.FACTIONS[o.faction] : uni;
    const url = OT.Portrait && OT.Portrait.render({ id: o.id, weapon: st.weaponId || ROLES[o.role].weapon, uniform: fac.uniform, vest: fac.vest, headgear: st.headgear || (o.faction ? 'casque_lunettes' : 'casque'), full: !!full, aiming: !!full });
    return url ? `<img class="portrait ${full ? 'full' : ''}" src="${url}" alt="">` : '';
  }

  let tab = 'accueil';
  function showTab(t) { tab = t; document.querySelectorAll('.hqpanel').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== t)); document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t)); render(); }
  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.go)));

  function render() {
    $('#credits').textContent = profile.credits;
    const c = profile.career;
    $('#career').textContent = `${c.battles} bataille${c.battles > 1 ? 's' : ''} · ${c.kills} neutralisation${c.kills > 1 ? 's' : ''} · ${c.losses_units} opérateur${c.losses_units > 1 ? 's' : ''} mis hors de combat`;
    renderHome(); renderRoster(); renderDetail(); renderSquad(); renderMissions(); renderDeploy(); renderArmory(); renderPacks(); renderTactics(); renderPerks(); renderChallenges(); renderLeague(); renderRewards();
  }
  function renderAchievements() {
    const el = $('#hqAch'); if (!el) return;
    el.innerHTML = ACHIEVEMENTS.map(a => `<span class="ach ${profile.achievements && profile.achievements[a.id] ? 'got' : ''}" title="${esc(a.name)} — ${esc(a.desc)}">${a.glyph}</span>`).join('');
  }
  function renderHome() {
    renderAchievements();
    const ins = INSIGNIAS.find(i => i.id === profile.insignia) || INSIGNIAS[0];
    $('#hqIns').textContent = ins.glyph; $('#hqTeamName').textContent = profile.teamName;
    const r = Game.rankFor(profile.xp || 0), next = Game.xpToNextRank(profile.xp || 0);
    $('#hqRank').textContent = RANKS[r].name; $('#hqXp').textContent = next === null ? 'rang maximal' : `${next} XP avant le rang suivant`;
    $('#hqXpBar').style.width = next === null ? '100%' : (100 * ((profile.xp || 0) - RANKS[r].xp) / (RANKS[r + 1].xp - RANKS[r].xp)).toFixed(0) + '%';
    $('#hqRating').textContent = Game.teamRating(profile);
    $('#homeIns').textContent = ins.glyph; $('#homeRank').textContent = `Rang ${r} · ${RANKS[r].name}${next === null ? '' : ' — ' + next + ' XP avant le suivant'}`;
    $('#homeSquad').innerHTML = profile.squad.map(id => { const o = OPERATORS.find(x => x.id === id), st = profile.operators[id]; return `<div class="hsq ${st.wounded ? 'wounded' : ''}" data-op="${id}"><span class="rt">${Math.round(Game.operatorRating(profile, id))}</span><b>${esc(o.callsign)}</b><small>${ROLES[o.role].name} · niv. ${Game.levelFor(st.xp)}${st.wounded ? ' · blessé' : ''}</small></div>`; }).join('');
    $('#homeSquad').querySelectorAll('.hsq').forEach(e => e.addEventListener('click', () => { selected = e.dataset.op; showTab('equipe'); }));
    const fp = profile.freePacks || {}, nfree = Object.values(fp).reduce((a, b) => a + b, 0); $('#homeFree').textContent = nfree ? `${nfree} paquet${nfree > 1 ? 's' : ''} offert${nfree > 1 ? 's' : ''} à ouvrir` : '';
    if (profile.league) { const sn = profile.league, me = League.table(sn).find(x => x.id === 'player'); $('#homeLeague').textContent = `saison ${(profile.leagueSeasons || 0) + 1} · ${sn.round}/${League.SEASON_BATTLES} batailles · ${me.rank}${me.rank === 1 ? 'er' : 'e'} au classement`; }
    if (window.HOMESCENE && tab === 'accueil' && !$('#hq').classList.contains('hidden')) window.HOMESCENE.show(profile); else if (window.HOMESCENE) window.HOMESCENE.hide();
    $('#hqWins').textContent = profile.career.wins; $('#hqLosses').textContent = profile.career.losses; $('#hqDraws').textContent = profile.career.draws;
    if (document.activeElement !== $('#teamName')) $('#teamName').value = profile.teamName;
    $('#insPick').innerHTML = INSIGNIAS.map(i => { const ok = profile.unlocked.insignias.includes(i.id); return `<button data-ins="${i.id}" class="${profile.insignia === i.id ? 'on' : ''} ${ok ? '' : 'locked'}" title="${i.name}${ok ? '' : ' (à débloquer dans un paquet)'}">${i.glyph}</button>`; }).join('');
    $('#insPick').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { if (Game.setCustomization(profile, 'insignia', b.dataset.ins)) { saveNow(); render(); } }));
    $('#uniPick').innerHTML = UNIFORMS.map(u => { const ok = profile.unlocked.uniforms.includes(u.id); return `<button data-uni="${u.id}" class="${profile.uniform === u.id ? 'on' : ''} ${ok ? '' : 'locked'}" title="${u.name}${ok ? '' : ' (à débloquer dans un paquet)'}"><span class="sw" style="background:#${u.uniform.toString(16).padStart(6, '0')}"></span></button>`; }).join('');
    $('#uniPick').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { if (Game.setCustomization(profile, 'uniform', b.dataset.uni)) { saveNow(); render(); } }));
  }
  $('#teamName').addEventListener('change', (e) => { if (Game.setCustomization(profile, 'teamName', e.target.value)) { saveNow(); render(); } else e.target.value = profile.teamName; });
  function renderDeploy() {
    const m = currentMission();
    const squad = profile.squad.map(id => OPERATORS.find(o => o.id === id).callsign).join(', ') || 'aucun';
    const tac = (profile.tactics.equipped || []).map(id => TACTICS[id].name).join(', ') || 'aucune';
    $('#hqDeploy').innerHTML = `<div class="deploy"><div><b>${esc(m.name)}</b> — ${OT.MAPS[m.mapId].name}</div><div>Escouade (${profile.squad.length}) : ${esc(squad)}</div><div>Ordre : ${ORDERS[profile.order].name} · Tactiques : ${esc(tac)}</div><div>Puissance ${Game.teamRating(profile)} contre niveau ${m.level} du Groupe Karst (${ORDERS[m.order].name}${m.enemyTactics && m.enemyTactics.length ? ', tactiques : ' + m.enemyTactics.map(t => TACTICS[t].name).join(', ') : ''})</div></div>`;
  }
  function renderLeague() {
    if (!profile.league) { profile.league = League.newSeason(Math.floor(Math.random() * 1e9)); saveNow(); }
    const sn = profile.league; const rows = League.table(sn); const me = rows.find(r => r.id === 'player');
    const opp = sn.finished ? null : League.nextOpponent(sn);
    $('#lgInfo').innerHTML = `<div><b>Saison ${(profile.leagueSeasons || 0) + 1}</b> — ${sn.round}/${League.SEASON_BATTLES} batailles jouées${sn.finished ? ' · terminée' : ''}</div><div>Votre place : <b>${me.rank}${me.rank === 1 ? 'er' : 'e'}</b> (${me.points} pts, diff. ${me.diff > 0 ? '+' : ''}${me.diff})${me.qualified ? '' : ` — ${League.QUALIFY - me.played} bataille${League.QUALIFY - me.played > 1 ? 's' : ''} pour être classé`}</div>${opp ? `<div>Prochain adversaire : <b>${opp.insignia} ${esc(opp.name)}</b> (${ORDERS[opp.order].name}${opp.tactics.length ? ', ' + opp.tactics.map(t => TACTICS[t].name).join(', ') : ''}) — ${OT.MAPS[League.nextMap(sn)].name}</div>` : ''}<div class="muted">Prix de fin de saison : ${League.PRIZES.join(' / ')} crédits pour le podium, +${League.PARTICIPATION} si toutes les batailles sont jouées.</div>`;
    $('#lgPlay').textContent = sn.finished ? 'Nouvelle saison' : 'Match de ligue';
    $('#lgPlay').disabled = !sn.finished && !Game.squadReady(profile);
    $('#lgHint').textContent = sn.finished ? 'La saison est terminée : encaissez les prix et repartez pour une nouvelle.' : Game.squadReady(profile) ? 'Récompenses d\u2019un match : crédits, XP, pas de défis de mission.' : 'Il faut au moins 3 opérateurs disponibles.';
    $('#lgTable').innerHTML = `<tr><th>#</th><th>Équipe</th><th>J</th><th>V-N-D</th><th>Diff.</th><th>Pts</th></tr>` + rows.map(r => `<tr class="${r.id === 'player' ? 'me' : ''} ${r.rank <= 3 && r.qualified ? 'podium' : ''} ${r.qualified ? '' : 'nq'}"><td>${r.rank}</td><td><span class="ins small ${r.id === 'player' ? 'team0' : ''}">${r.id === 'player' ? (INSIGNIAS.find(i => i.id === profile.insignia) || INSIGNIAS[0]).glyph : r.insignia}</span>${r.id === 'player' ? esc(profile.teamName) : esc(r.name)}</td><td>${r.played}</td><td>${r.wins}-${r.draws}-${r.losses}</td><td>${r.diff > 0 ? '+' : ''}${r.diff}</td><td><b>${r.points}</b></td></tr>`).join('');
    $('#lgHistory').innerHTML = sn.history.length ? sn.history.slice().reverse().map(h => { const t = League.AI_TEAMS.find(x => x.id === h.opponent); return `<div>J${h.round + 1} · ${t.insignia} ${esc(t.name)} — <b class="${h.winner === 0 ? 'good' : h.winner === 1 ? 'bad' : ''}">${h.winner === 0 ? 'victoire' : h.winner === 1 ? 'défaite' : 'égalité'}</b> (${h.diff > 0 ? '+' : ''}${h.diff}) · ${esc(h.map)}</div>`; }).join('') : '<div class="muted">Aucun match joué cette saison.</div>';
  }
  $('#lgPlay').addEventListener('click', () => {
    const sn = profile.league;
    if (sn.finished) {
      const prize = League.seasonPrize(sn); profile.credits += prize.credits; profile.leagueSeasons = (profile.leagueSeasons || 0) + 1; if (prize.qualified && prize.rank <= 3) profile.podium = true; const ach = Game.checkAchievements(profile, null); if (ach.length) flash('Succès : ' + ach.map(a => a.name).join(', ')); profile.league = League.newSeason(Math.floor(Math.random() * 1e9)); saveNow(); render();
      flash(`Saison terminée : ${prize.lines.join(' · ')}${prize.credits ? '' : ' Aucun prix.'}`); return;
    }
    if (!Game.squadReady(profile)) return;
    const opp = League.nextOpponent(sn);
    const uni = UNIFORMS.find(u => u.id === profile.uniform) || UNIFORMS[0];
    const teams = [
      { name: profile.teamName, order: profile.order, operators: profile.squad.map(id => Game.effectiveDef(profile, id)), tactics: profile.tactics.equipped, insignia: profile.insignia, uniform: uni.id },
      League.aiTeamDef(opp, sn.seed, sn.round),
    ];
    const opts = { seed: Math.floor(Math.random() * 1e6), mapId: League.nextMap(sn), teams };
    const mission = Object.assign({}, Game.LEAGUE_MISSION, { name: `Ligue — ${opp.name}`, mapId: opts.mapId, order: opp.order, enemyTactics: opp.tactics, league: opp.id, level: teams[1].operators[0].level });
    showVs(opts, mission);
  });
  // ---- Cartes v2 : paquets dessinés (probabilités par type), ouverture plein écran carte par carte, couleurs de rareté -----
  const CARD_TYPE_FR = { operator: 'Recrue', dupe: 'Doublon', tactic: 'Tactique', perk: 'Perk', xp: 'Expérience', credits: 'Crédits', cosmetic: 'Cosmétique' };
  const TYPE_GLYPH = { credits: '¤', cosmetic: '✦', xp: '▲', perk: '✚' };
  const tacArt = (id) => (OT.imgTag && OT.imgTag('tac_' + id, 'cart')) || `<span class="cglyph">${TACTIC_ICON[id] || '◆'}</span>`;
  function cardArt(c) {
    const o = c.id && OPERATORS.find(x => x.id === c.id);
    if (c.type === 'tactic') return tacArt(c.id);
    if (o && (c.type === 'operator' || c.type === 'dupe')) return portraitOf(o, true);
    if (o && (c.type === 'perk' || c.type === 'xp')) return `${portraitOf(o, true)}<span class="cbadge">${c.type === 'perk' ? '+2' : 'XP'}</span>`;
    return `<span class="cglyph">${TYPE_GLYPH[c.type] || '◆'}</span>`;
  }
  function cardHTML(c, i) {
    const r = c.rarity || 1;
    return `<div class="pcard r${r} t-${c.type}" data-i="${i}" style="--d:${i}"><div class="in"><div class="face back"><span>◆</span><small>OPERATOR TACTICS</small></div>`
      + `<div class="face front"><div class="ctop"><span>${CARD_TYPE_FR[c.type] || c.type}</span><span>${RARITY_FR[r] || ''}</span></div><div class="cart">${cardArt(c)}</div>`
      + `<b>${esc(c.title)}</b><p>${esc(c.text)}</p></div></div></div>`;
  }
  function packOdds(pk) {
    const t = Object.values(pk.weights).reduce((s, v) => s + v, 0);
    return Object.entries(pk.weights).map(([k, v]) => `<div class="odd"><span>${CARD_TYPE_FR[k]}</span><i style="width:${Math.round(v / t * 100)}%"></i><em>${Math.round(v / t * 100)} %</em></div>`).join('');
  }
  function renderPacks() {
    $('#hqPacks').innerHTML = Object.values(PACKS).map(pk => { const free = profile.freePacks && profile.freePacks[pk.id];
      return `<div class="pack2 p-${pk.id}"><div class="foil"><span class="pemb">${pk.id === 'elite' ? '✪' : '◆'}</span><b>${esc(pk.name.replace('Paquet ', ''))}</b><small>${pk.cards} cartes</small></div>`
      + `<div class="odds">${packOdds(pk)}</div>`
      + (free ? `<button class="on" data-pack="${pk.id}">Ouvrir — offert (${free})</button>` : `<button data-pack="${pk.id}" ${profile.credits >= pk.price ? '' : 'disabled'}>Ouvrir — ${pk.price} cr.</button>`) + `</div>`; }).join('');
    $('#hqPacks').querySelectorAll('button[data-pack]').forEach(b => b.addEventListener('click', () => {
      const cards = Game.openPack(profile, b.dataset.pack);
      if (!cards) { flash('Crédits insuffisants.'); return; }
      saveNow(); render(); openPackScreen(b.dataset.pack, cards);
    }));
  }
  // écran d'ouverture : le paquet se déchire, les cartes sont posées face cachée ; clic = retourner, « Tout révéler », « Continuer »
  function openPackScreen(packId, cards) {
    const ov = $('#packOpen'), pk = PACKS[packId];
    ov.className = 'packopen p-' + packId; ov.classList.remove('hidden');
    ov.innerHTML = `<div class="potitle">${esc(pk.name)}</div><div class="potear"><div class="foil"><span class="pemb">${packId === 'elite' ? '✪' : '◆'}</span><b>${esc(pk.name.replace('Paquet ', ''))}</b></div></div>`
      + `<div class="porow">${cards.map(cardHTML).join('')}</div>`
      + `<div class="pobar"><span id="poCount" class="muted"></span><button id="poAll">Tout révéler</button><button id="poClose" class="on">Continuer</button></div>`;
    const flips = [...ov.querySelectorAll('.pcard')];
    const count = () => { const n = flips.filter(f => f.classList.contains('flipped')).length; $('#poCount').textContent = `${n} / ${flips.length} révélée${n > 1 ? 's' : ''}`; };
    const flip = (f) => { if (f.classList.contains('flipped')) return; f.classList.add('flipped'); count(); };
    flips.forEach(f => f.addEventListener('click', () => flip(f)));
    $('#poAll').addEventListener('click', () => flips.forEach((f, i) => setTimeout(() => flip(f), i * 180)));
    $('#poClose').addEventListener('click', () => { ov.classList.add('hidden'); ov.innerHTML = '';
      $('#hqOpened').innerHTML = `<div class="muted" style="width:100%;font-size:11px">Dernier paquet :</div>` + cards.map(c => `<span class="mini r${c.rarity || 1}">${esc(c.title)}</span>`).join(''); });
    count();
    if (document.documentElement.classList.contains('manual')) { ov.classList.add('torn'); return; }
    setTimeout(() => ov.classList.add('torn'), 650);
  }
  function renderTactics() {
    const eq = profile.tactics.equipped;
    $('#hqTactics').innerHTML = Object.values(TACTICS).map(t => { const owned = !!profile.tactics.owned[t.id];
      return `<div class="tcardq ${eq.includes(t.id) ? 'eq' : ''} ${owned ? '' : 'locked'}" data-t="${t.id}" title="${esc(t.desc)}"><div class="tart">${tacArt(t.id)}<span class="tkind ${t.active ? 'act' : ''}">${t.active ? 'Active' : 'Passive'}</span>${eq.includes(t.id) ? '<span class="teq">Emportée</span>' : ''}</div><b>${esc(t.name)}</b><span class="muted">${t.active ? `${t.uses} emploi${t.uses > 1 ? 's' : ''}${t.cooldown ? ' · recharge ' + t.cooldown + ' s' : ''}` : 'effet permanent'}</span><span class="tdesc">${esc(t.desc)}</span>${owned ? '' : '<span class="tlock">À trouver dans un paquet</span>'}</div>`; }).join('');
    $('#hqTactics').querySelectorAll('.tcardq').forEach(c => c.addEventListener('click', () => { const id = c.dataset.t; if (!profile.tactics.owned[id]) return; if (!Game.equipTactic(profile, id)) flash('Trois tactiques au maximum : retirez-en une d’abord.'); saveNow(); render(); }));
  }
  function renderPerks() {
    const rows = Object.entries(profile.perks || {}).filter(([, p]) => Object.keys(p).length).map(([id, p]) => `${OPERATORS.find(o => o.id === id).callsign} : ${Object.entries(p).map(([k, v]) => `${Game.STAT_FR[k]} +${v}`).join(', ')}`);
    $('#hqPerks').innerHTML = rows.length ? rows.map(r => `<div>${esc(r)}</div>`).join('') : 'Aucun perk pour l\u2019instant : ils se trouvent dans les paquets de cartes (+2 à une statistique, jusqu\u2019à +10).';
  }

  function renderRoster() {
    const el = $('#hqRoster');
    el.innerHTML = OPERATORS.filter(o => !o.faction).map(o => {
      const st = profile.operators[o.id]; const lvl = Game.levelFor(st.xp); const next = Game.xpToNext(st.xp);
      const inSquad = profile.squad.includes(o.id);
      const pct = next === null ? 100 : Math.round(100 * (st.xp - DATA.XP_TABLE[lvl]) / (DATA.XP_TABLE[lvl + 1] - DATA.XP_TABLE[lvl]));
      const recovering = st.unlocked && !!st.wounded; const expired = Game.contractExpired(profile, o.id); const promo = st.unlocked && st.pendingPromotions && st.pendingPromotions.length;
      return `<div class="opcard ${st.unlocked ? '' : 'locked'} ${inSquad ? 'insquad' : ''} ${recovering ? 'recov' : ''} ${expired ? 'expired' : ''} ${selected === o.id ? 'sel' : ''}" data-id="${o.id}">
        <div class="crow">${portraitOf(o)}<div style="flex:1;min-width:0"><div class="crow"><span class="role">${roleIcon[o.role]}</span><span class="cs">${esc(o.callsign)}</span><span class="rar r${o.rarity}">${RARITY_FR[o.rarity]}</span>${promo ? '<span class="promo" title="Promotion à choisir">!</span>' : ''}<span class="st">${expired ? 'Contrat expiré' : recovering ? '<b class="bad">Blessé grave</b>' : st.unlocked ? 'Niv. ' + lvl : PRICES.operator[o.rarity] + ' cr.'}</span></div>
        <div class="cunit">${esc(o.unit)} — ${ROLES[o.role].name} · <span class="trait">${TRAITS[o.trait].name}</span></div></div></div>
        ${st.unlocked ? `<div class="xp" title="${st.xp} XP"><i style="width:${pct}%"></i></div>` : ''}
        ${recovering && !expired ? `<div class="wound" data-act="treat" title="Compétences divisées par deux et −25 % de points de vie tant qu’il n’est pas soigné. Guérit seul après ${DATA.WOUND.restMissions} missions sans lui.">GRAVEMENT BLESSÉ — compétences ÷2 · <u data-act="treat">soigner (${Game.treatmentPrice(profile) ? Game.treatmentPrice(profile) + ' cr.' : 'gratuit'})</u> · repos ${st.woundRest || 0}/${DATA.WOUND.restMissions}</div>` : ''}
        <div class="crow small">${expired ? `<button class="mini" data-act="renew" ${profile.credits >= Game.renewPrice(profile, o.id) ? '' : 'disabled'}>Renouveler (${Game.renewPrice(profile, o.id)} cr.)</button>` : st.unlocked ? `<button class="mini ${inSquad ? 'on' : ''}" data-act="squad">${inSquad ? 'Dans l’escouade' : 'Ajouter'}</button>` : `<button class="mini" data-act="recruit" ${profile.credits >= PRICES.operator[o.rarity] ? '' : 'disabled'}>Recruter</button>`}<span>${expired ? 'Inactif' : st.unlocked ? `${st.tours} mission${st.tours > 1 ? 's' : ''} · ${st.kills} neutr.` : 'Verrouillé'}</span></div>
      </div>`;
    }).join('');
    el.querySelectorAll('.opcard').forEach(card => {
      card.addEventListener('click', (e) => {
        const id = card.dataset.id, act = e.target.dataset && e.target.dataset.act;
        if (act === 'squad') { if (!Game.toggleSquad(profile, id)) flash(profile.squad.length >= 5 ? 'L’escouade est déjà au complet (5).' : 'Impossible.'); }
        else if (act === 'recruit') { if (Game.recruit(profile, id)) flash(`${OPERATORS.find(o => o.id === id).callsign} rejoint l’unité.`); else flash('Crédits insuffisants.'); }
        else if (act === 'treat') { if (Game.treat(profile, id)) flash(`${OPERATORS.find(o => o.id === id).callsign} est soigné : compétences rétablies.`); else flash('Crédits insuffisants.'); }
        else if (act === 'renew') { if (Game.renewContract(profile, id)) flash(`Contrat de ${OPERATORS.find(o => o.id === id).callsign} renouvelé.`); else flash('Crédits insuffisants.'); }
        else if (act === 'promo') { if (Game.choosePromotion(profile, id, e.target.dataset.trait)) flash(`${OPERATORS.find(o => o.id === id).callsign} acquiert « ${TRAITS[e.target.dataset.trait].name} ».`); }
        selected = id; saveNow(); render();
      });
    });
  }

  function renderDetail() {
    const o = OPERATORS.find(x => x.id === selected); const st = profile.operators[o.id]; const def = Game.effectiveDef(profile, o.id);
    const role = ROLES[o.role];
    const stats = def.wounded
      ? Game.STATS.map(k => `<div class="stat wounded"><span>${STAT_FR[k]}</span><div class="sbar"><i style="width:${def[k]}%"></i></div><span class="val">${def[k]} <small>(÷2)</small></span></div>`).join('')
      : Game.STATS.map(k => `<div class="stat"><span>${STAT_FR[k]}</span><div class="sbar"><i style="width:${def[k]}%"></i>${def[k] > o[k] ? `<b style="left:${o[k]}%;width:${def[k] - o[k]}%"></b>` : ''}</div><span class="val">${def[k]}${def[k] > o[k] ? ` <small>(+${def[k] - o[k]})</small>` : ''}</span></div>`).join('');
    const w = WEAPONS[st.weaponId], a = ARMORS[st.armorId];
    $('#hqDetail').innerHTML = `
      <div class="dhead">${portraitOf(o, true)}<div><div class="dname">${esc(o.callsign)} <small>${role.name} · ${RARITY_FR[o.rarity]}</small></div><div class="cunit">Inspiré du ${esc(o.unit)}</div>${st.unlocked ? `<div class="hgpick">${Object.keys(Game.HEADGEAR_PRICES).map(h => { const owned = !!profile.headgear[h]; const nm = OT.Figure.HEADGEAR[h].name; return `<button class="mini ${st.headgear === h ? 'on' : ''} ${owned ? '' : 'locked'}" data-hg="${h}" title="${nm}${owned ? '' : ' — ' + Game.HEADGEAR_PRICES[h] + ' cr.'}">${nm}${owned ? '' : ' · ' + Game.HEADGEAR_PRICES[h]}</button>`; }).join('')}</div>` : ''}</div><div class="lvl">Niveau ${def.level}<small>${Game.xpToNext(st.xp) === null ? 'maximum' : Game.xpToNext(st.xp) + ' XP avant le suivant'}</small></div></div>
      <div class="traitbox"><b>${TRAITS[o.trait].name}</b> — ${esc(TRAITS[o.trait].desc)}${(st.traits || []).map(t => `<br><b>${TRAITS[t].name}</b> <small class="muted">(promotion)</small> — ${esc(TRAITS[t].desc)}`).join('')}</div>
      ${(st.pendingPromotions || []).map(p => `<div class="promobox"><b>Promotion — niveau ${p.level}</b> : choisissez un second trait.<div class="promochoices">${p.choices.map(t => `<button class="promochoice" data-act="promo" data-trait="${t}" data-id="${o.id}"><b>${TRAITS[t].name}</b><span>${esc(TRAITS[t].desc)}</span></button>`).join('')}</div></div>`).join('')}
      ${st.unlocked ? `<div class="contract ${Game.contractExpired(profile, o.id) ? 'bad' : ''}">Contrat : ${st.tours > 0 ? `${st.tours} mission${st.tours > 1 ? 's' : ''} restante${st.tours > 1 ? 's' : ''}` : 'expiré'} · renouvellement ${Game.renewPrice(profile, o.id)} cr. (+${CONTRACT.tours[o.rarity]} missions)${st.dupes ? ` · ${st.dupes} doublon${st.dupes > 1 ? 's' : ''} fusionné${st.dupes > 1 ? 's' : ''}` : ''} <button class="mini" data-renew="${o.id}" ${profile.credits >= Game.renewPrice(profile, o.id) ? '' : 'disabled'}>Renouveler</button></div>` : ''}
      <div class="stats">${stats}</div>
      ${st.unlocked ? `
      <div class="equip">
        <label>Arme <select id="selWeapon">${role.weapons.map(id => `<option value="${id}" ${id === st.weaponId ? 'selected' : ''} ${profile.inventory.weapons[id] ? '' : 'disabled'}>${WEAPONS[id].name}${profile.inventory.weapons[id] ? '' : ' (armurerie : ' + PRICES.weapon[id] + ' cr.)'}</option>`).join('')}</select></label>
        <div class="wspec">Dégâts ${w.damage} · portée ${w.range} m · ${w.rpm} c/min · chargeur ${w.mag} · rechargement ${w.reload} s · précision ${Math.round(w.accuracy * 100)} %${w.minRange ? ` · pénalisé sous ${w.minRange} m` : ''}</div>
        <label>Protection <select id="selArmor">${Object.values(ARMORS).map(ar => `<option value="${ar.id}" ${ar.id === st.armorId ? 'selected' : ''} ${profile.inventory.armors[ar.id] ? '' : 'disabled'}>${ar.name}</option>`).join('')}</select></label>
        <div class="wspec">Absorbe ${Math.round(a.torso * 100)} % au torse, ${Math.round(a.head * 100)} % à la tête · vitesse × ${a.mobility}</div>
        <label>Voie d’approche <select id="selLane">${[null, -1, 0, 1].map(l => `<option value="${l}" ${String(st.lane) === String(l) ? 'selected' : ''}>${LANE_FR[String(l)]}</option>`).join('')}</select></label>
        <div class="wspec">Nord et Sud contournent le bâtiment central ; Centre laisse l’opérateur choisir le chemin le plus court.</div>
      </div>
      <details class="hist"><summary>Historique — ${st.battles} bataille${st.battles > 1 ? 's' : ''}, ${st.kills} neutralisation${st.kills > 1 ? 's' : ''}</summary>${(st.history || []).length ? `<table class="histt"><tr><th>Mission</th><th>Issue</th><th>Neutr.</th><th>Au but</th><th>Dégâts</th><th>XP</th></tr>${st.history.slice().reverse().map(h => `<tr class="${h.alive ? '' : 'dead'}"><td>${esc(h.m)}</td><td>${h.won ? 'Victoire' : h.draw ? 'Égalité' : 'Défaite'}${h.alive ? '' : ' · évacué'}</td><td>${h.kills}</td><td>${h.hits}/${h.shots}</td><td>${h.dmg}</td><td>+${h.xp}</td></tr>`).join('')}</table>` : '<div class="muted" style="font-size:12px;padding:6px 0">Aucune bataille encore.</div>'}</details>` : `<p class="muted">Recrutez cet opérateur (${PRICES.operator[o.rarity]} crédits) pour l’équiper et l’engager.</p>`}`;
    $('#hqDetail').querySelectorAll('[data-hg]').forEach(b => b.addEventListener('click', () => { const h = b.dataset.hg; if (!profile.headgear[h]) { if (Game.buyHeadgear(profile, h)) flash(`${OT.Figure.HEADGEAR[h].name} acheté.`); else { flash('Crédits insuffisants.'); return; } } Game.setHeadgear(profile, o.id, h); saveNow(); render(); }));
    $('#hqDetail').querySelectorAll('.promochoice').forEach(b => b.addEventListener('click', () => { if (Game.choosePromotion(profile, b.dataset.id, b.dataset.trait)) { flash(`${o.callsign} acquiert « ${TRAITS[b.dataset.trait].name} ».`); saveNow(); render(); } }));
    const rb = $('#hqDetail').querySelector('[data-renew]'); if (rb) rb.addEventListener('click', () => { if (Game.renewContract(profile, o.id)) { flash('Contrat renouvelé.'); saveNow(); render(); } else flash('Crédits insuffisants.'); });
    if (st.unlocked) {
      $('#selWeapon').addEventListener('change', (e) => { Game.setWeapon(profile, o.id, e.target.value); saveNow(); render(); });
      $('#selArmor').addEventListener('change', (e) => { Game.setArmor(profile, o.id, e.target.value); saveNow(); render(); });
      $('#selLane').addEventListener('change', (e) => { Game.setLane(profile, o.id, e.target.value === 'null' ? null : parseInt(e.target.value, 10)); saveNow(); render(); });
    }
  }

  function renderSquad() {
    const el = $('#hqSquad');
    const slots = [];
    for (let i = 0; i < 5; i++) {
      const id = profile.squad[i];
      if (!id) { slots.push('<div class="slot empty">Emplacement libre</div>'); continue; }
      const o = OPERATORS.find(x => x.id === id), st = profile.operators[id];
      slots.push(`<div class="slot ${selected === id ? 'sel' : ''} ${st.wounded ? 'wounded' : ''}" data-id="${id}"><span class="role">${roleIcon[o.role]}</span><b>${esc(o.callsign)}</b>${st.wounded ? '<span class="bad" title="Gravement blessé : compétences ÷2">✚ blessé</span>' : ''}<span class="muted">${WEAPONS[st.weaponId].name.split(' ')[0]} · ${LANE_FR[String(st.lane)]}</span></div>`);
    }
    el.innerHTML = slots.join('');
    const syn = Game.squadSynergies(profile.squad.map(id => Game.effectiveDef(profile, id)));
    $('#hqSynergies').innerHTML = DATA.SYNERGIES.map(sy => { const a = syn.find(x => x.id === sy.id); return `<div class="syn ${a ? 'on' : ''}" title="${esc(sy.desc)}"><b>${esc(sy.name)}</b><span>${esc(sy.effect)}</span><small>${a ? esc(a.sources.join(', ')) + ' → ' + esc(a.targets.join(', ')) : 'inactive dans cette escouade'}</small></div>`; }).join('');
    el.querySelectorAll('.slot[data-id]').forEach(s => s.addEventListener('click', () => { selected = s.dataset.id; render(); }));
    $('#selOrder').value = profile.order;
    $('#launch').disabled = !Game.squadReady(profile);
    const nw = profile.squad.filter(id => profile.operators[id].wounded).length;
    $('#launchHint').textContent = Game.squadReady(profile) ? `${profile.squad.length < 5 ? `Escouade réduite (${profile.squad.length}). ` : ''}${nw ? `Attention : ${nw} blessé${nw > 1 ? 's' : ''} grave${nw > 1 ? 's' : ''} à demi-capacité. ` : ''}${ORDERS[profile.order].desc}` : 'Il faut au moins 3 opérateurs disponibles pour lancer la mission.';
  }

  function renderMissions() {
    // bataille rapide + opérations spéciales
    const q = profile.quick || { wins: 0 }, prize = DATA.QUICK.prizeEvery, k = q.wins % prize;
    $('#hqQuick').innerHTML = `<div class="mission quickcard ${selectedMission === 'rapide' ? 'sel' : ''}" data-id="rapide"><div class="crow"><b>Bataille rapide</b><span class="diff">${k}/${prize}</span></div>
      <div class="mdesc">Un adversaire du Groupe Karst à votre mesure, carte et objectif au hasard. ${PACKS[DATA.QUICK.prizePack].name} offert toutes les ${prize} victoires.</div>
      <div class="prizebar">${Array.from({ length: prize }, (_, i) => `<i class="${i < k ? 'on' : ''}"></i>`).join('')}</div>
      <div class="crow small"><span>${q.wins || 0} victoire${q.wins > 1 ? 's' : ''} en bataille rapide</span><span>${DATA.QUICK.reward} cr. de base</span></div></div>`;
    const ops = profile.ops || { done: {} };
    $('#hqOps').innerHTML = DATA.SPECIAL_OPS.map(op => { const v = Math.min(op.goal, ops[op.stat] || 0), done = ops.done && ops.done[op.id]; return `<div class="opsrow ${done ? 'done' : ''}"><div class="crow"><b>${esc(op.name)}</b><span class="spacer"></span><span>${done ? 'Accomplie' : v + '/' + op.goal}</span></div><div class="muted">${esc(op.desc)} — ${op.reward.credits} cr.${op.reward.pack ? ' + ' + PACKS[op.reward.pack].name.toLowerCase() : ''}</div><div class="xpbar big"><i style="width:${100 * v / op.goal}%"></i></div></div>`; }).join('');
    // campagnes
    $('#hqCampaigns').innerHTML = DATA.CAMPAIGNS.map(c => { const ok = Game.campaignUnlocked(profile, c.id), pr = Game.campaignProgress(profile, c.id);
      const req = c.unlock ? (c.unlock.rank !== undefined ? `Rang ${c.unlock.rank} (${RANKS[c.unlock.rank].name})` : `Puissance d’équipe ${c.unlock.rating}`) : '';
      return `<button class="campbtn ${selectedCampaign === c.id ? 'on' : ''} ${ok ? '' : 'locked'}" data-camp="${c.id}" title="${esc(c.desc)}"><b>${esc(c.name)}</b><small>${ok ? `${pr.played}/${pr.total} jouées · ${pr.won} gagnées` : '🔒 ' + req}</small></button>`; }).join('');
    const camp = DATA.CAMPAIGNS.find(c => c.id === selectedCampaign), campOk = Game.campaignUnlocked(profile, camp.id);
    $('#hqCampInfo').textContent = campOk ? `${camp.desc} Prime de participation ${camp.participation} cr. (toutes jouées), prime de campagne ${camp.completion} cr. (toutes gagnées).` : `Verrouillée — ${camp.unlock.rank !== undefined ? 'atteindre le rang ' + camp.unlock.rank + ' (' + RANKS[camp.unlock.rank].name + ')' : 'atteindre une puissance d’équipe de ' + camp.unlock.rating} pour l’ouvrir.`;
    const el = $('#hqMissions');
    el.innerHTML = camp.missions.map((mid, i) => {
      const m = Game.campaignMission(camp.id, mid), unlocked = Game.missionUnlocked(profile, camp.id, mid);
      const done = profile.missions[m.id]; const st = (profile.campaigns && profile.campaigns[camp.id]) || { played: {}, won: {} };
      const won = st.won[mid] || (camp.id === 'reguliere' && done && done.wins);
      return `<div class="mission ${selectedMission === m.id ? 'sel' : ''} ${unlocked ? '' : 'locked'} ${won ? 'won' : ''}" data-id="${m.id}">
        <div class="crow"><span class="mnum">${String(i + 1).padStart(2, '0')}</span><b>${esc(m.name)}</b>${m.final ? '<span class="final">FINALE</span>' : ''}${won ? '<span class="good">✓</span>' : ''}<span class="spacer"></span><span class="diff">${'◆'.repeat(m.difficulty)}${'◇'.repeat(4 - m.difficulty)}</span></div>
        ${unlocked ? `<div class="mdesc">${esc(m.desc)}</div>
        <div class="crow small"><span>${OT.MAPS[m.mapId].name} · ${Game.objectiveLabel(m)}</span><span>Karst niv. ${m.level}, ${ORDERS[m.order].name}${m.enemyWeapons ? ', armes silencieuses' : ''}</span></div>
        <div class="crow small"><span>Récompense : ${m.reward} cr. · ${m.xp} XP de base</span><span>${done ? `${done.wins}/${done.attempts} réussie${done.wins > 1 ? 's' : ''}` : 'Jamais tentée'}</span></div>` : '<div class="crow small"><span>🔒 Jouez la mission précédente pour l’ouvrir.</span></div>'}
      </div>`;
    }).join('');
    const pick = (id) => { selectedMission = id; renderMissions(); renderDeploy(); renderSquad(); };
    el.querySelectorAll('.mission').forEach(m => m.addEventListener('click', () => { if (m.classList.contains('locked')) { flash('Mission verrouillée : jouez d’abord la précédente.'); return; } pick(m.dataset.id); }));
    $('#hqQuick').querySelector('.mission').addEventListener('click', () => pick('rapide'));
    $('#hqCampaigns').querySelectorAll('.campbtn').forEach(b => b.addEventListener('click', () => { selectedCampaign = b.dataset.camp; const c = DATA.CAMPAIGNS.find(x => x.id === selectedCampaign); selectedMission = Game.campaignMission(c.id, c.missions[0]).id; renderMissions(); renderDeploy(); }));
    $('#launch').textContent = selectedMission === 'rapide' ? 'Lancer la bataille rapide' : 'Lancer la mission';
  }


  function renderArmory() {
    const el = $('#hqArmory');
    const items = Object.values(WEAPONS).filter(w => !profile.inventory.weapons[w.id]);
    if (!items.length) { el.innerHTML = '<div class="muted" style="font-size:12px">Toutes les armes sont disponibles.</div>'; return; }
    el.innerHTML = items.map(w => `<div class="armo"><div><b>${esc(w.name)}</b><div class="wspec">Dégâts ${w.damage} · portée ${w.range} m · ${w.rpm} c/min · chargeur ${w.mag}${w.silenced ? ' · silencieux : presque inaudible au-delà de 18 m' : ''}</div></div><button class="mini" data-w="${w.id}" ${profile.credits >= PRICES.weapon[w.id] ? '' : 'disabled'}>${PRICES.weapon[w.id]} cr.</button></div>`).join('');
    el.querySelectorAll('button[data-w]').forEach(b => b.addEventListener('click', () => { if (Game.buyWeapon(profile, b.dataset.w)) { flash(`${WEAPONS[b.dataset.w].name} ajouté à l’armurerie.`); saveNow(); render(); } }));
  }
  function renderChallenges() {
    const el = $('#hqChallenges'); const done = profile.challenges || {};
    el.innerHTML = CHALLENGES.map(c => `<div class="chal ${done[c.id] ? 'done' : ''}"><span class="mark">${done[c.id] ? '✓' : '○'}</span><div><b>${esc(c.name)}</b><div class="wspec" style="padding:0">${esc(c.desc)}</div></div><span class="muted">${done[c.id] ? 'acquis' : c.reward + ' cr.'}</span></div>`).join('');
  }
  function renderRewards() {
    const el = $('#hqRewards');
    if (!lastRewards) { el.classList.add('hidden'); return; }
    const r = lastRewards;
    el.classList.remove('hidden');
    el.innerHTML = `<b class="${r.won ? 'good' : r.draw ? '' : 'bad'}">${r.won ? 'Mission réussie' : r.draw ? 'Mission indécise' : 'Mission échouée'}</b> — ${r.mission}. Crédits : +${r.credits}. Expérience : ${Object.entries(r.xp).map(([id, v]) => `${OPERATORS.find(o => o.id === id).callsign} +${v}`).join(', ')}.${r.levelUps.length ? ' Promotions : ' + r.levelUps.map(l => `${l.callsign} → niveau ${l.level}`).join(', ') + '.' : ''}${r.injured && r.injured.length ? ` <span class="bad">Gravement blessés (compétences ÷2 jusqu’aux soins) : ${r.injured.join(', ')}.</span>` : ''}${r.healed && r.healed.length ? ` <span class="good">Remis sur pied après repos : ${r.healed.join(', ')}.</span>` : ''}${r.playerXp ? ` Rang : +${r.playerXp} XP${r.rankUp ? ` — <b class="good">promu ${esc(r.rankUp)}</b>` : ''}.` : ''}${r.challenges && r.challenges.length ? ` <span class="good">Défi${r.challenges.length > 1 ? 's' : ''} accompli${r.challenges.length > 1 ? 's' : ''} : ${r.challenges.map(c => `${c.name} (+${c.reward} cr.)`).join(', ')}.</span>` : ''}`;
  }

  let flashTimer = null;
  function flash(msg) { const el = $('#flash'); el.textContent = msg; el.classList.remove('hidden'); clearTimeout(flashTimer); flashTimer = setTimeout(() => el.classList.add('hidden'), 2600); }

  // ---- Lien avec la bataille --------------------------------------------------------------------
  $('#selOrder').addEventListener('change', (e) => { profile.order = e.target.value; saveNow(); renderSquad(); });
  $('#selFormation').addEventListener('change', (e) => { if (e.target.value) { Game.applyFormation(profile, e.target.value); saveNow(); render(); e.target.value = ''; } });
  $('#launch').addEventListener('click', () => {
    if (!Game.squadReady(profile)) return;
    const mission = currentMission(); if (!mission) return;
    if (!mission.quick && !Game.missionUnlocked(profile, selectedCampaign, selectedMission.includes(':') ? selectedMission.split(':')[1] : selectedMission)) { flash('Mission verrouillée : jouez d’abord la précédente.'); return; }
    if (mission.quick) quickPending = null;          // la prochaine bataille rapide sera un nouveau tirage
    const seed = Math.floor(Math.random() * 1000000);
    profile.lastSeed = seed; saveNow();
    showVs(Game.battleOptions(profile, mission, seed), mission);
  });
  // Écran « VS » : présentation des deux équipes avant la bataille
  let pendingLaunch = null;
  function showVs(opts, mission) {
    pendingLaunch = { opts, mission };
    const ins = INSIGNIAS.find(i => i.id === profile.insignia) || INSIGNIAS[0];
    const r = Game.rankFor(profile.xp || 0);
    $('#vsName0').textContent = profile.teamName; $('#vsRank0').textContent = `Rang ${r} · ${RANKS[r].name}`; $('#vsIns0').textContent = ins.glyph;
    $('#vsRating0').innerHTML = `${Game.teamRating(profile)}<small>Puissance</small>`; $('#vsRec0').innerHTML = `Victoires <b>${profile.career.wins}</b><br>Défaites <b>${profile.career.losses}</b>`;
    const tacs = (ids) => { const out = ids.map(id => `<span title="${esc(TACTICS[id].desc)}"><i>${TACTIC_ICON[id]}</i>${esc(TACTICS[id].name)}</span>`); while (out.length < 3) out.push('<span class="empty">—</span>'); return out.join(''); };
    $('#vsTac0').innerHTML = tacs(profile.tactics.equipped);
    // adversaire : puissance calculée de la même façon à partir de ses fiches effectives
    const enemyDefs = opts.teams[1].operators;
    const enemyRating = Math.round(enemyDefs.reduce((s, d) => s + Game.defRating(d), 0) / enemyDefs.length);
    const km = profile.missions[mission.id] || { attempts: 0, wins: 0 };
    const lt = mission.league ? League.AI_TEAMS.find(t => t.id === mission.league) : null; const ls = lt && profile.league ? profile.league.standings[lt.id] : null;
    $('#vsName1').textContent = lt ? lt.name : 'Groupe Karst'; $('#vsRank1').textContent = `Niveau ${mission.level} · ${ORDERS[mission.order].name}`; $('#vsIns1').textContent = lt ? lt.insignia : '⚑';
    $('#vsRating1').innerHTML = `${enemyRating}<small>Puissance</small>`; $('#vsRec1').innerHTML = ls ? `Victoires <b>${ls.wins}</b><br>Défaites <b>${ls.losses}</b>` : `Contre vous : <b>${km.attempts - km.wins}</b> victoires<br><b>${km.wins}</b> défaites`;
    $('#vsTac1').innerHTML = tacs(mission.enemyTactics || []);
    $('#vsLoc').textContent = OT.MAPS[mission.mapId].name; $('#vsObj').textContent = '— ' + Game.objectiveLabel(mission);
    $('#vsSquad0').innerHTML = opts.teams[0].operators.map(d => `<span class="${d.wounded ? 'bad' : ''}">${esc(d.callsign)} · ${ROLES[d.role].name}${d.wounded ? ' ✚' : ''}</span>`).join('');
    const synTxt = (defs) => Game.squadSynergies(defs).map(s => `<span title="${esc(s.desc)}">${esc(s.name)}</span>`).join('') || '<span class="empty">aucune synergie</span>';
    $('#vsSyn0').innerHTML = synTxt(opts.teams[0].operators); $('#vsSyn1').innerHTML = synTxt(opts.teams[1].operators);
    $('#vsSquad1').innerHTML = enemyDefs.map(d => `<span>${esc(d.callsign)} · ${ROLES[d.role].name}</span>`).join('');
    $('#vs').classList.remove('hidden');
  }
  $('#vsBack').addEventListener('click', () => { $('#vs').classList.add('hidden'); pendingLaunch = null; });
  $('#vsGo').addEventListener('click', () => { if (!pendingLaunch) return; const { opts, mission } = pendingLaunch; pendingLaunch = null; $('#vs').classList.add('hidden'); window.HQ.onLaunch(opts, mission); });
  // Écran de récompenses après une mission
  function showRewards(r, result, mission) {
    const rows = [];
    rows.push(['', r.won ? 'Victoire' : r.draw ? 'Égalité' : 'Défaite', r.base]);
    rows.push([r.kills, 'Neutralisations', r.killCredits]);
    rows.push([r.specials, 'Spéciaux', r.specialCredits]);
    for (const c of (r.challenges || [])) rows.push(['✓', `Défi : ${c.name}`, c.reward]);
    $('#rwTitle').textContent = 'Récompenses';
    $('#rwRows').innerHTML = rows.map(([n, label, v], i) => `<tr class="${i === 0 ? (r.won ? 'good' : r.draw ? '' : 'bad') : ''}"><td>${n}</td><td>${esc(label)}</td><td>${v || 0} <i class="coin"></i></td></tr>`).join('');
    const total = r.credits + (r.challenges || []).reduce((s, c) => s + c.reward, 0);
    // compteur qui monte (le nombre final est écrit tout de suite pour l'accessibilité et les tests)
    const tEl = $('#rwTotal'); tEl.textContent = total; tEl.dataset.v = total;
    if (!document.documentElement.classList.contains('manual')) { const t0 = performance.now(); const tick = (now) => { const k = Math.min(1, (now - t0) / 900); tEl.textContent = Math.round(total * k); if (k < 1 && tEl.dataset.v == total) requestAnimationFrame(tick); }; requestAnimationFrame(tick); }
    const rk = Game.rankFor(profile.xp), next = Game.xpToNextRank(profile.xp);
    $('#rwRank').innerHTML = `Rang <b>${rk}</b> · <span class="accent">${esc(RANKS[rk].name)}</span>`; $('#rwXpEarned').textContent = `+${r.playerXp} XP`;
    const bar = $('#rwXpBar'); const target = next === null ? '100%' : (100 * (profile.xp - RANKS[rk].xp) / (RANKS[rk + 1].xp - RANKS[rk].xp)).toFixed(0) + '%';
    bar.style.width = r.rankUp ? '0%' : Math.max(0, parseFloat(target) - (next === null ? 0 : 100 * r.playerXp / (RANKS[rk + 1].xp - RANKS[rk].xp))).toFixed(0) + '%';
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = target; }));
    $('#rwRankUp').textContent = r.rankUp ? `Promotion : ${r.rankUp} !` : (next === null ? 'Rang maximum' : `${next} XP avant le rang suivant`);
    const kx = (result.teams[0].kills || 0) * 5, wx = r.won ? 30 : r.draw ? 10 : 0;   // même calcul que Game.applyRewards
    $('#rwXpRows').innerHTML = [['Mission', r.playerXp - kx - wx], [r.won ? 'Victoire' : r.draw ? 'Égalité' : 'Défaite', wx], ['Neutralisations', kx]].map(([l, v]) => `<tr><td></td><td>${l}</td><td>${v} XP</td></tr>`).join('');
    // blessés
    const inj = (r.injured || []).map(n => `<div class="inj">✚ ${esc(n)}<span class="bad">Gravement blessé !</span></div>`).concat((r.healed || []).map(n => `<div class="inj">✓ ${esc(n)}<span class="good">Rétabli après repos</span></div>`));
    $('#rwInjuries').innerHTML = inj.join(''); $('#rwInjSec').hidden = !inj.length;
    // succès
    const ACH_IMG = { premiere: 'ach_first', dix: 'ach_streak' };
    $('#rwAch').innerHTML = (r.achievements || []).map(a => `<div class="achrow"><span class="achico">${(OT.imgTag && OT.imgTag(ACH_IMG[a.id])) || a.glyph}</span><div><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></div><span class="achrw">${esc(a.rewardText || '')}</span></div>`).join('');
    $('#rwAchSec').hidden = !(r.achievements && r.achievements.length);
    const extra = [];
    if (r.levelUps && r.levelUps.length) extra.push('Niveaux : ' + r.levelUps.map(l => `${l.callsign} → niveau ${l.level}`).join(', '));
    if (r.leagueRank) extra.push(`Ligue : vous êtes ${r.leagueRank}${r.leagueRank === 1 ? 'er' : 'e'} au classement.`);
    if (r.promotions && r.promotions.length) extra.push('Promotion à choisir (fiche de l’opérateur) : ' + r.promotions.map(p => `${p.callsign} (niveau ${p.level})`).join(', '));
    if (r.expired && r.expired.length) extra.push('Contrat expiré, à renouveler : ' + r.expired.join(', '));
    for (const l of (r.modeLines || [])) extra.push(l);
    $('#rwExtra').innerHTML = extra.map(esc).join('<br>');
    // figure : le meilleur opérateur de la mission (le plus de neutralisations, puis de dégâts)
    const best = result.teams[0].units.slice().sort((a, b) => (b.stats.kills - a.stats.kills) || (b.stats.damageDealt - a.stats.damageDealt))[0];
    const bo = best && OPERATORS.find(o => o.id === best.id.split(':')[1]);
    $('#rwFig').src = (bo && (() => { const st = profile.operators[bo.id]; const uni = DATA.UNIFORMS.find(u => u.id === profile.uniform) || DATA.UNIFORMS[0]; return OT.Portrait && OT.Portrait.render({ id: bo.id, weapon: st.weaponId, uniform: uni.uniform, vest: uni.vest, headgear: st.headgear || 'casque', full: true, w: 420, h: 640, aiming: r.won }); })()) || '';
    $('#rewards').classList.remove('hidden');
    // pièces qui tombent
    for (let i = 0; i < Math.min(30, 8 + Math.floor(total / 20)); i++) { const c = document.createElement('div'); c.className = 'coinfx'; c.textContent = '●'; c.style.left = (35 + Math.random() * 55) + '%'; c.style.top = '8%'; c.style.animationDelay = (Math.random() * 1.1) + 's'; document.body.appendChild(c); setTimeout(() => c.remove(), 2800); }
  }

  $('#rwContinue').addEventListener('click', () => { $('#rewards').classList.add('hidden'); });
  $('#resetSave').addEventListener('click', () => {
    if ($('#resetSave').dataset.confirm !== '1') { $('#resetSave').dataset.confirm = '1'; $('#resetSave').textContent = 'Confirmer la réinitialisation'; setTimeout(() => { $('#resetSave').dataset.confirm = '0'; $('#resetSave').textContent = 'Réinitialiser'; }, 4000); return; }
    profile = Game.reset(storage || { removeItem: () => {} }); lastRewards = null; selected = profile.squad[0]; $('#resetSave').dataset.confirm = '0'; $('#resetSave').textContent = 'Réinitialiser'; render(); flash('Nouvelle carrière.');
  });

  // transition en fondu entre les deux écrans
  function switchTo(showHq) {
    const f = $('#fade'); f.classList.add('on');
    setTimeout(() => { $('#hq').classList.toggle('hidden', !showHq); $('#app').classList.toggle('hidden', showHq); if (showHq) render(); requestAnimationFrame(() => f.classList.remove('on')); }, 220);
  }
  window.HQ = {
    show() { switchTo(true); showTab(lastRewards && lastRewards.mission && lastRewards.mission.startsWith('Ligue') ? 'ligue' : 'accueil'); },
    hide() { if (window.HOMESCENE) window.HOMESCENE.hide(); switchTo(false); },
    // appelé par app.js à la fin d'une bataille de mission : applique les récompenses au profil et sauvegarde
    finishMission(mission, result) {
      const r = Game.applyRewards(profile, mission, result);
      if (mission.league && profile.league && !profile.league.finished) { League.applyPlayerResult(profile.league, mission.league, result); r.leagueRank = League.table(profile.league).find(x => x.id === 'player').rank; }
      lastRewards = Object.assign({ mission: mission.name }, r);
      saveNow();
      setTimeout(() => showRewards(r, result, mission), 260);
      return r;
    },
    profile: () => profile, storageAvailable: () => !!storage,
    onLaunch: null,
  };
  if (!storage) flash('Sauvegarde locale indisponible dans ce navigateur : la progression ne sera pas conservée.');
  render();
})();
