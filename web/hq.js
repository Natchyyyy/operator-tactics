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
  let profile = (storage && Game.load(storage)) || null;
  if (!profile) {   // sauvegarde illisible (ou d'une version plus récente) : on la met de côté au lieu de l'écraser
    try { const raw = storage && storage.getItem(Game.SAVE_KEY); if (raw) storage.setItem(Game.SAVE_KEY + '-ecartee-' + Date.now(), raw); } catch (e) { /* stockage indisponible */ }
    profile = Game.newProfile();
  }
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

  let tab = 'accueil'; const tabHistory = [];
  // icônes vectorielles : tout élément [data-ico] reçoit son pictogramme (une fois)
  function fillIcons(rootEl) { (rootEl || document).querySelectorAll('[data-ico]').forEach(e => { if (e.dataset.icoDone !== e.dataset.ico && OT.Ico) { e.innerHTML = OT.Ico(e.dataset.ico); e.dataset.icoDone = e.dataset.ico; } }); }
  // scène 1920×1080 mise à l'échelle et centrée dans la fenêtre (même mise en page à toutes les tailles)
  function fitStage() {
    const z = Math.min(innerWidth / 1920, innerHeight / 1080) || 1; document.documentElement.style.setProperty('--zui', Math.max(0.5, z));
    for (const el of document.querySelectorAll('.stage1080')) { el.style.setProperty('--z', z); el.style.left = ((innerWidth - 1920 * z) / 2 / z) + 'px'; el.style.top = ((innerHeight - 1080 * z) / 2 / z) + 'px'; }
  }
  window.addEventListener('resize', fitStage); OT.fitStage = fitStage;
  function showTab(t, noHist) { if (!noHist && t !== tab) { tabHistory.push(tab); if (tabHistory.length > 20) tabHistory.shift(); } tab = t;
    $('#hq').dataset.tab = t; $('#hqHomeBtn').innerHTML = OT.Ico ? OT.Ico('home') : ''; $('#hqHomeBtn').title = 'Accueil'; $('#hqHomeBtn').style.visibility = $('#hqBack').style.visibility = t === 'accueil' ? 'hidden' : ''; document.querySelectorAll('.hqpanel').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== t)); document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t)); render(); }
  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { if (b.dataset.go === 'missions' && window.OT.resetPlay) window.OT.resetPlay(); showTab(b.dataset.go); }));
  $('#hqHomeBtn').addEventListener('click', () => { if (tab === 'accueil') { const b = $('#openSettings'); if (b) b.click(); } else showTab('accueil'); });
  $('#hqBack').addEventListener('click', () => { if (OT.playBack && OT.playBack()) return; const t = tabHistory.pop(); showTab(t || 'accueil', true); });
  $('#customBtn').addEventListener('click', () => { const d = $('#custom2'); d.open = !d.open; });
  $('#hqBack').innerHTML = OT.Ico ? OT.Ico('back') : ''; $('#hqHelp').innerHTML = OT.Ico ? OT.Ico('help') : ''; $('#hqSettings').innerHTML = OT.Ico ? OT.Ico('gear') : '';
  $('#hq').classList.add('stage1080'); fitStage(); fillIcons();

  function render() {
    $('#credits').textContent = profile.credits;
    const c = profile.career;
    $('#career').textContent = `${c.battles} bataille${c.battles > 1 ? 's' : ''} · ${c.kills} neutralisation${c.kills > 1 ? 's' : ''} · ${c.losses_units} opérateur${c.losses_units > 1 ? 's' : ''} mis hors de combat`;
    fillIcons(); renderHome(); renderRoster(); renderDetail(); renderSquad(); renderMissions(); renderDeploy(); renderArmory(); renderPacks(); renderTactics(); renderPerks(); renderChallenges(); renderLeague(); renderRewards(); renderCareer();
  }
  // ---- Carrière : bilan chiffré, terrains, dernières batailles, succès avec jauges et récompenses --------------------------
  // Astuces (écran VS), toutes vraies dans la simulation
  const TIPS = [
    'Deux opérateurs du même pays mettent en joue 10 % plus vite tant que l\'autre est debout (synergie Frères d\'armes).',
    'Un Meneur debout réduit de 10 % les dégâts subis par son radio et ses servants d\'arme d\'appui (synergie Commandement).',
    'Un Radio améliore de 8 % la précision des tireurs d\'élite, des appuis et des brécheurs (synergie Guidage radio).',
    'Un opérateur blessé grave a ses compétences divisées par deux tant qu\'il n\'est pas soigné, ou reposé deux missions.',
    'De nuit, on voit deux fois moins loin — mais une arme non silencieuse qui tire trahit son porteur à pleine portée.',
    'La pluie couvre les bruits : les tirs s\'entendent de moins loin.',
    'Un soldat accroupi derrière un couvert bas n\'offre presque rien à toucher ; contournez-le.',
    'Gagnez cinq batailles rapides pour recevoir un paquet de cartes offert.',
    'La tenue compte : urbaine en ville, désert à la raffinerie et à la gare, olive aux docks, nuit… de nuit — l\'adversaire vous repère 10 % moins bien.',
    'Jouez toutes les missions d\'une campagne pour toucher la prime de participation, gagnez-les toutes pour la prime de campagne.',
    'Un allié à terre peut être relevé si personne ne voit d\'ennemi : gardez un Secouriste près du groupe.',
    'Le Grenadier emporte une grenade de plus et lance jusqu\'à 30 m.',
    'La Vigie entend les pas d\'un ennemi en mouvement à moins de 12 m, même derrière un mur.',
    'En capture de zone, une zone disputée ne progresse plus pour personne : il faut en chasser l\'adversaire.',
    'Une grenade incapacitante aveugle 3,5 s : plus aucun repérage, précision divisée par quatre.',
    'Le bouton ⏭ Résultat donne exactement le même résultat que la bataille regardée jusqu\'au bout.',
    '« Revoir la bataille » rejoue tout à l\'identique : mêmes décisions, mêmes tirs, mêmes tactiques jouées.',
    'Les doublons de recrues renforcent l\'opérateur (+2 à une compétence) et prolongent son contrat.',
  ];
  // camouflage des tenues : terrains et conditions où l'adversaire repère moins bien l'escouade (−10 %)
  const camoText = (u) => [...(u.camo.maps || []).map(m => OT.MAPS[m] ? OT.MAPS[m].name : m), ...(u.camo.conditions || []).map(c => DATA.CONDITIONS[c].name.toLowerCase())].join(', ');
  const camoActive = (u, m) => !!(u && u.camo && m && ((u.camo.maps || []).includes(m.mapId) || (u.camo.conditions || []).includes(m.conditions || 'jour')));
  const COND_FR = { jour: 'Jour', nuit: 'Nuit', brouillard: 'Brouillard', pluie: 'Pluie' };
  function rewardLabel(rw) {
    if (!rw) return ''; if (rw.credits) return rw.credits + ' crédits';
    if (rw.headgear) return 'Couvre-chef : ' + ((OT.Figure && OT.Figure.HEADGEAR[rw.headgear] && OT.Figure.HEADGEAR[rw.headgear].name) || rw.headgear);
    if (rw.insignia) { const i = INSIGNIAS.find(x => x.id === rw.insignia); return 'Insigne : ' + (i ? i.glyph + ' ' + i.name : rw.insignia); }
    if (rw.uniform) { const u = UNIFORMS.find(x => x.id === rw.uniform); return 'Uniforme : ' + (u ? u.name : rw.uniform); }
    return '';
  }
  function renderCareer() {
    if (!$('#crStats')) return;
    const c = profile.career, pct = (a, b) => b ? Math.round(100 * a / b) + ' %' : '—';
    const cells = [[c.battles, 'batailles'], [`${c.wins} / ${c.losses} / ${c.draws}`, 'V / D / N'], [pct(c.wins, c.battles), 'victoires'], [c.kills, 'neutralisations'],
      [c.losses_units, 'opérateurs perdus'], [c.losses_units ? (c.kills / c.losses_units).toFixed(2) : (c.kills ? '∞' : '—'), 'ratio N / P'], [pct(c.hits || 0, c.shots || 0), 'balles au but'], [c.damage || 0, 'dégâts infligés'],
      [c.headshots || 0, 'tirs à la tête'], [c.streaks || 0, 'séries'], [c.group || 0, 'de groupe'], [c.revenge || 0, 'revanches'], [c.veteran || 0, 'vétérans abattus'], [c.revives || 0, 'alliés relevés'], [c.nightWins || 0, 'victoires de nuit'], [c.captureWins || 0, 'zones prises']];
    $('#crStats').innerHTML = cells.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
    const maps = c.maps || {};
    $('#crMaps').innerHTML = Object.keys(OT.MAPS).map(id => { const m = maps[id] || { b: 0, w: 0 }, w = m.b ? Math.round(100 * m.w / m.b) : 0; return `<div class="row"><span>${esc(OT.MAPS[id].name)}</span><i style="--w:${m.b ? w : 0}%;${m.b ? '' : 'opacity:.3'}"></i><span class="muted">${m.b ? `${m.w}/${m.b} · ${w} %` : 'jamais joué'}</span></div>`; }).join('');
    const rec = (c.recent || []).slice().reverse();
    $('#crRecent').innerHTML = rec.length ? rec.map(b => `<div class="row"><span class="muted">#${b.n}</span><span>${esc(b.m)}</span><span class="muted">${esc((OT.MAPS[b.map] || {}).name || b.map)} · ${COND_FR[b.cond] || b.cond}</span><span class="${b.res}">${{ v: 'Victoire', d: 'Défaite', n: 'Égalité' }[b.res]}</span><span class="muted">${b.k} N · ${b.l} P · ${Math.floor(b.t / 60)}:${String(b.t % 60).padStart(2, '0')}</span></div>`).join('') : '<div class="muted">Aucune bataille de mission encore.</div>';
    const got = profile.achievements || {};
    $('#crAchCount').textContent = `(${ACHIEVEMENTS.filter(a => got[a.id]).length} / ${ACHIEVEMENTS.length})`;
    $('#crAch').innerHTML = ACHIEVEMENTS.map(a => { const pr = Game.achievementProgress(profile, a.id), done = !!got[a.id];
      return `<div class="a ${done ? 'got' : ''}" data-ach="${a.id}"><span class="g">${a.glyph}</span><div><b>${esc(a.name)}</b><small>${esc(a.desc)}</small>${!done && pr ? `<div class="pb"><i style="width:${Math.round(100 * pr[0] / pr[1])}%"></i></div><small>${pr[0]} / ${pr[1]}</small>` : ''}<div class="rw">${done ? '✓ obtenu — ' : 'Récompense : '}${esc(rewardLabel(a.reward))}</div></div></div>`; }).join('');
  }
  function renderAchievements() {
    const el = $('#hqAch'); if (!el) return;
    const got = profile.achievements || {}; const tones = ['', 'gold', 'red', '', 'gold'];
    const list = ACHIEVEMENTS.filter(a => got[a.id]).sort((a, b) => (got[b.id].at || 0) - (got[a.id].at || 0)).slice(0, 5);
    const cells = list.map((a, i) => `<span class="ach got ${tones[i % 5]}" title="${esc(a.name)} — ${esc(a.desc)}">${a.glyph}</span>`);
    while (cells.length < 5) cells.push('<span class="ach" title="Succès à obtenir (onglet Carrière)">✦</span>');
    el.innerHTML = cells.join('') + `<span class="sr">${ACHIEVEMENTS.filter(a => got[a.id]).length} / ${ACHIEVEMENTS.length}</span>`;
  }
  // tuiles de l'accueil : éventail de trois cartes de tactiques, trois membres de l'escouade en pied
  let tilesKey = '';
  function renderTiles() {
    const eq = (profile.tactics.equipped || []).concat(Object.keys(profile.tactics.owned || {})).filter((v, i, a) => a.indexOf(v) === i).slice(0, 3);
    const key = JSON.stringify([eq, profile.squad.slice(0, 3), profile.uniform, profile.squad.slice(0, 3).map(id => [profile.operators[id].weaponId, profile.operators[id].headgear])]);
    if (key === tilesKey) return; tilesKey = key;
    $('#tileCards').innerHTML = [0, 1, 2].map(i => `<span class="mc">${eq[i] ? ((OT.imgTag && OT.imgTag('tac_' + eq[i])) || '') : ''}</span>`).join('');
    $('#tileTeam').innerHTML = profile.squad.slice(0, 3).map(id => { const o = OPERATORS.find(x => x.id === id); return o ? portraitOf(o) : ''; }).join('');
  }
  function renderHome() {
    renderAchievements();
    const ins = INSIGNIAS.find(i => i.id === profile.insignia) || INSIGNIAS[0];
    $('#hqIns').textContent = ins.glyph; $('#hqTeamName').textContent = profile.teamName; { const ht = $('#homeTeamTitle'); if (ht) ht.textContent = profile.teamName; }
    $('#homeIns').innerHTML = OT.Embleme ? OT.Embleme.svg(ins.glyph, '#e8eaeb') : ins.glyph;
    { const rr = Game.rankFor(profile.xp || 0), nx = Game.xpToNextRank(profile.xp || 0); $('#hqRankN').textContent = rr; }
    { const sn = profile.league, n = (League && League.SEASON_BATTLES) || 9, done = sn ? sn.round : 0; $('#hqSeason').innerHTML = Array.from({ length: n }, (_, k) => `<i class="${k < done ? 'on' : ''}"></i>`).join(''); $('#hqSeasonTxt').textContent = sn && sn.finished ? 'Terminée' : `Journée ${Math.min(n, done + 1)} / ${n}`; }
    { const fp = profile.freePacks || {}; $('#hqPacksN').textContent = Object.values(fp).reduce((a, b) => a + b, 0); }
    { const d = Game.dailyContracts(profile), left = d.list.filter(c => !c.done).length; $('#footDaily').textContent = left ? left : ''; }
    renderTiles();
    const r = Game.rankFor(profile.xp || 0), next = Game.xpToNextRank(profile.xp || 0);
    $('#hqRank').textContent = RANKS[r].name; $('#hqXp').textContent = next === null ? 'rang maximal' : `${next} XP au suivant`;
    $('#hqXpBar').style.width = next === null ? '100%' : (100 * ((profile.xp || 0) - RANKS[r].xp) / (RANKS[r + 1].xp - RANKS[r].xp)).toFixed(0) + '%';
    $('#hqRating').textContent = Game.teamRating(profile);
    $('#homeRank').textContent = `Rang ${r} · ${RANKS[r].name}${next === null ? '' : ' — ' + next + ' XP avant le suivant'}`;
    { const hx = $('#homeXpBar'); if (hx) hx.style.width = $('#hqXpBar').style.width; }
    { const lead = OPERATORS.find(x => x.id === profile.squad[0]), pn = $('#podName'), pr = $('#podRole');
      if (pn) pn.textContent = lead ? lead.callsign : ''; if (pr) pr.textContent = lead ? `${ROLES[lead.role].name} · niv. ${Game.levelFor(profile.operators[lead.id].xp)}` : ''; }
    $('#homeSquad').innerHTML = profile.squad.map(id => { const o = OPERATORS.find(x => x.id === id), st = profile.operators[id];
      return `<button class="hsq ${st.wounded ? 'wounded' : ''}" data-op="${id}"><span class="hsqp">${portraitOf(o)}</span><span class="hsqt"><b>${esc(o.callsign)}</b><small>${ROLES[o.role].name} · niv. ${Game.levelFor(st.xp)}${st.wounded ? ' · blessé' : ''}</small></span><span class="rt">${Math.round(Game.operatorRating(profile, id))}</span></button>`; }).join('');
    $('#homeSquad').querySelectorAll('.hsq').forEach(e => e.addEventListener('click', () => { selected = e.dataset.op; showTab('equipe'); }));
    const fp = profile.freePacks || {}, nfree = Object.values(fp).reduce((a, b) => a + b, 0); $('#homeFree').textContent = nfree ? `${nfree} paquet${nfree > 1 ? 's' : ''} offert${nfree > 1 ? 's' : ''} à ouvrir` : '';
    if (profile.league) { const sn = profile.league, me = League.table(sn).find(x => x.id === 'player'); $('#homeLeague').textContent = `saison ${(profile.leagueSeasons || 0) + 1} · ${sn.round}/${League.SEASON_BATTLES} batailles · ${me.rank}${me.rank === 1 ? 'er' : 'e'} au classement`; }
    if (window.HOMESCENE && tab === 'accueil' && !$('#hq').classList.contains('hidden')) window.HOMESCENE.show(profile); else if (window.HOMESCENE) window.HOMESCENE.hide();
    $('#hqWins').textContent = profile.career.wins; $('#hqLosses').textContent = profile.career.losses; $('#hqDraws').textContent = profile.career.draws;
    if (document.activeElement !== $('#teamName')) $('#teamName').value = profile.teamName;
    $('#insPick').innerHTML = INSIGNIAS.map(i => { const ok = profile.unlocked.insignias.includes(i.id); return `<button data-ins="${i.id}" class="${profile.insignia === i.id ? 'on' : ''} ${ok ? '' : 'locked'}" title="${i.name}${ok ? '' : ' (à débloquer dans un paquet)'}">${i.glyph}</button>`; }).join('');
    $('#insPick').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { if (Game.setCustomization(profile, 'insignia', b.dataset.ins)) { saveNow(); render(); } }));
    $('#uniPick').innerHTML = UNIFORMS.map(u => { const ok = profile.unlocked.uniforms.includes(u.id); return `<button data-uni="${u.id}" class="${profile.uniform === u.id ? 'on' : ''} ${ok ? '' : 'locked'}" title="${u.name}${u.camo ? ' — camouflage : ' + camoText(u) : ''}${ok ? '' : ' (à débloquer dans un paquet)'}"><span class="sw" style="background:#${u.uniform.toString(16).padStart(6, '0')}"></span></button>`; }).join('');
    $('#uniPick').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { if (Game.setCustomization(profile, 'uniform', b.dataset.uni)) { saveNow(); render(); } }));
  }
  $('#teamName').addEventListener('change', (e) => { if (Game.setCustomization(profile, 'teamName', e.target.value)) { saveNow(); render(); } else e.target.value = profile.teamName; });
  function renderDeploy() {
    const m = currentMission();
    const squad = profile.squad.map(id => OPERATORS.find(o => o.id === id).callsign).join(', ') || 'aucun';
    const tac = (profile.tactics.equipped || []).map(id => TACTICS[id].name).join(', ') || 'aucune';
    $('#hqDeploy').innerHTML = `<div class="deploy"><div><b>${esc(m.name)}</b> — ${OT.MAPS[m.mapId].name}</div><div>Escouade (${profile.squad.length}) : ${esc(squad)}</div><div>Ordre : ${ORDERS[profile.order].name} · Tactiques : ${esc(tac)}</div><div>Puissance ${Game.teamRating(profile)} contre niveau ${m.level} — ${esc((DATA.FACTIONS[m.faction || "karst"] || DATA.FACTIONS.karst).name)} (${ORDERS[m.order].name}${m.enemyTactics && m.enemyTactics.length ? ', tactiques : ' + m.enemyTactics.map(t => TACTICS[t].name).join(', ') : ''})</div>${(() => { const u = UNIFORMS.find(x => x.id === profile.uniform); return camoActive(u, m) ? `<div class="good">Tenue « ${esc(u.name)} » adaptée au terrain : l’adversaire vous repère 10 % moins bien.</div>` : ''; })()}</div>`;
  }
  function renderLeague() {
    if (!profile.league) { profile.league = League.newSeason(Math.floor(Math.random() * 1e9)); saveNow(); }
    const sn = profile.league; const rows = League.table(sn); const me = rows.find(r => r.id === 'player');
    const opp = sn.finished ? null : League.nextOpponent(sn);
    $('#lgInfo').innerHTML = `<div><b>Saison ${(profile.leagueSeasons || 0) + 1}</b> — ${sn.round}/${League.SEASON_BATTLES} batailles jouées${sn.finished ? ' · terminée' : ''}</div><div>Votre place : <b>${me.rank}${me.rank === 1 ? 'er' : 'e'}</b> (${me.points} pts, diff. ${me.diff > 0 ? '+' : ''}${me.diff})${me.qualified ? '' : ` — ${League.QUALIFY - me.played} bataille${League.QUALIFY - me.played > 1 ? 's' : ''} pour être classé`}</div>${opp ? `<div>Prochain adversaire : <b>${opp.insignia} ${esc(opp.name)}</b> (${ORDERS[opp.order].name}${opp.tactics.length ? ', ' + opp.tactics.map(t => TACTICS[t].name).join(', ') : ''}) — ${OT.MAPS[League.nextMap(sn)].name}</div>` : ''}<div class="muted">Prix de fin de saison : ${League.PRIZES.join(' / ')} crédits pour le podium, +${League.PARTICIPATION} si toutes les batailles sont jouées.</div>`;
    $('#lgPlay').textContent = sn.finished ? 'Nouvelle saison' : 'Match de ligue';
    $('#lgPlay').disabled = !sn.finished && !Game.squadReady(profile);
    $('#lgHint').textContent = sn.finished ? 'La saison est terminée : encaissez les prix et repartez pour une nouvelle.' : Game.squadReady(profile) ? 'Récompenses d\u2019un match : crédits, XP, pas de défis de mission.' : 'Il faut au moins 3 opérateurs disponibles.';
    const power = (r) => r.id === 'player' ? Game.teamRating(profile) : League.aiRating(League.AI_TEAMS.find(t => t.id === r.id), sn, Game.defRating);
    const formHTML = (f) => (f || []).map(x => `<i class="fm ${x}" title="${{ v: 'victoire', n: 'égalité', d: 'défaite' }[x]}"></i>`).join('') || '<span class="muted">—</span>';
    $('#lgTable').innerHTML = `<tr><th>#</th><th>Équipe</th><th>Puissance</th><th>Forme</th><th>J</th><th>V-N-D</th><th>Diff.</th><th>Pts</th></tr>` + rows.map(r => `<tr class="${r.id === 'player' ? 'me' : ''} ${r.rank <= 3 && r.qualified ? 'podium p' + r.rank : ''} ${r.qualified ? '' : 'nq'}"><td><span class="rk">${r.rank}</span></td><td><span class="ins small ${r.id === 'player' ? 'team0' : ''}">${r.id === 'player' ? (INSIGNIAS.find(i => i.id === profile.insignia) || INSIGNIAS[0]).glyph : r.insignia}</span> ${esc(r.id === 'player' ? profile.teamName : r.name)}</td><td><b class="pw">${power(r)}</b></td><td class="form">${formHTML(r.form)}</td><td>${r.played}</td><td>${r.wins}-${r.draws}-${r.losses}</td><td>${r.diff > 0 ? '+' : ''}${r.diff}</td><td><b>${r.points}</b></td></tr>`).join('');
    // prochain match : grande carte avec l'adversaire, sa puissance, son ordre, ses tactiques et le terrain ; progression de la saison
    $('#lgNext').innerHTML = opp ? `<div class="lgnext"><div class="lgside"><span class="ins big team0">${(INSIGNIAS.find(i => i.id === profile.insignia) || INSIGNIAS[0]).glyph}</span><b>${esc(profile.teamName)}</b><span class="pw">${Game.teamRating(profile)}</span></div><div class="lgvs">VS<small>J${sn.round + 1} · ${OT.MAPS[League.nextMap(sn)].name}</small></div><div class="lgside"><span class="ins big team1">${opp.insignia}</span><b>${esc(opp.name)}</b><span class="pw">${League.aiRating(opp, sn, Game.defRating)}</span><small>${ORDERS[opp.order].name}${opp.tactics.length ? ' · ' + opp.tactics.map(t => TACTICS[t].name).join(', ') : ''}</small></div></div>` : '';
    $('#lgProg').innerHTML = Array.from({ length: League.SEASON_BATTLES }, (_, k) => { const h = sn.history[k]; return `<i class="${h ? (h.winner === 0 ? 'v' : h.winner === 1 ? 'd' : 'n') : (k === sn.round && !sn.finished ? 'cur' : '')}" title="Journée ${k + 1}"></i>`; }).join('');
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

  // ---- Équipe (habillage du jeu d'origine) : grande carte, onglets, escouade en bas, changement de soldat ----------------
  const ROLE_ICO = { assault: 'r_assault', pointman: 'r_pointman', marksman: 'r_marksman', support: 'r_support', breacher: 'r_breacher' };
  const roleIco = (o) => OT.Ico ? OT.Ico(o.trait === 'leader' ? 'r_leader' : o.trait === 'radio' ? 'radio' : ROLE_ICO[o.role]) : roleIcon[o.role];
  const STAT_ICO = { marksmanship: 'tir', reflexes: 'reflexes', mobility: 'mobilite', perception: 'perception', composure: 'sangfroid', endurance: 'endurance' };
  const flagOf = (o) => (OT.Flag && OT.Flag(o.unit)) || '';
  let teamTab = 'skills', cand = null;
  document.querySelectorAll('.tmtabs button').forEach(b => b.addEventListener('click', () => { teamTab = b.dataset.tt; renderDetail(); }));
  $('#tmChange').addEventListener('click', () => { cand = null; $('#tmRoster').classList.remove('hidden'); renderRoster(); });
  $('#trClose').addEventListener('click', () => $('#tmRoster').classList.add('hidden'));
  $('#tmHead').addEventListener('click', () => { teamTab = teamTab === 'head' ? 'skills' : 'head'; renderDetail(); });
  function bigCardHTML(o, opts = {}) {
    const st = profile.operators[o.id] || {}; const def = Game.effectiveDef(profile, o.id); const rate = Math.round(Game.operatorRating(profile, o.id));
    return `<div class="bc r${o.rarity} ${def.wounded ? 'wounded' : ''} ${st.unlocked ? '' : 'locked'}">
      <div class="bc-top"><b>${esc(o.callsign)}</b><span class="bc-role">${roleIco(o)}</span></div>
      <div class="bc-sub">${esc(ROLES[o.role].name)}${st.unlocked && Game.levelFor(st.xp) ? ' · niv. ' + Game.levelFor(st.xp) : ''}</div>
      <div class="bc-art">${flagOf(o)}${portraitOf(o, true)}
        ${st.pendingPromotions && st.pendingPromotions.length ? '<button class="bc-up" data-act="promo-open" title="Promotion à choisir">' + (OT.Ico ? OT.Ico('plus') : '+') + '</button>' : ''}
        ${def.wounded && st.unlocked ? `<div class="bc-wound"><span class="bang">!</span><div><b>Gravement blessé</b><small>repos ${st.woundRest || 0}/${DATA.WOUND.restMissions} · compétences ÷2</small><button class="mini" data-act="treat">Soigner ${Game.treatmentPrice(profile) ? '· ' + Game.treatmentPrice(profile) + ' cr.' : '(gratuit)'}</button></div></div>` : ''}
        ${!st.unlocked ? `<div class="bc-lock">${OT.Ico ? OT.Ico('lock') : ''}<b>${PRICES.operator[o.rarity]} cr.</b></div>` : ''}
      </div>
      <div class="bc-foot"><span>${st.unlocked ? (Game.contractExpired(profile, o.id) ? 'Contrat expiré' : 'Missions : ' + st.tours) : esc(RARITY_FR[o.rarity])}</span><span class="bc-rate ${def.wounded ? 'bad' : ''}"><b>${rate}</b>${roleIco(o)}</span></div>
    </div>`;
  }
  function bindCardActs(el, o) {
    el.querySelectorAll('[data-act=treat]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); if (Game.treat(profile, o.id)) flash(`${o.callsign} est soigné : compétences rétablies.`); else flash('Crédits insuffisants.'); saveNow(); render(); }));
    el.querySelectorAll('[data-act=promo-open]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); teamTab = 'skills'; renderDetail(); }));
  }
  function renderRoster() {
    const el = $('#hqRoster'); if (!el) return;
    el.innerHTML = OPERATORS.filter(o => !o.faction).map(o => {
      const st = profile.operators[o.id]; const lvl = Game.levelFor(st.xp);
      const inSquad = profile.squad.includes(o.id), recovering = st.unlocked && !!st.wounded, expired = Game.contractExpired(profile, o.id);
      return `<div class="opcard r${o.rarity} ${st.unlocked ? '' : 'locked'} ${inSquad ? 'insquad' : ''} ${recovering ? 'recov' : ''} ${expired ? 'expired' : ''} ${cand === o.id ? 'sel' : ''}" data-id="${o.id}">
        <div class="oc-name">${esc(o.callsign)}</div><div class="oc-art">${flagOf(o)}${portraitOf(o)}</div>
        <div class="oc-rate"><b>${Math.round(Game.operatorRating(profile, o.id))}</b>${roleIco(o)}</div>
        <div class="oc-st">${expired ? 'Contrat expiré' : recovering ? '<b class="bad">Blessé</b>' : st.unlocked ? (inSquad ? 'Escouade' : 'Niv. ' + lvl) : PRICES.operator[o.rarity] + ' cr.'}</div>
      </div>`;
    }).join('');
    el.querySelectorAll('.opcard').forEach(card => card.addEventListener('click', () => { cand = card.dataset.id; renderRoster(); }));
    renderCandidate();
  }
  // comparaison : le candidat face à l'opérateur sélectionné dans l'escouade (écarts en vert / rouge), puis les actions
  function renderCandidate() {
    const el = $('#trDetail'); if (!el) return;
    const cur = OPERATORS.find(x => x.id === selected);
    $('#trHint').textContent = cur && profile.squad.includes(cur.id) ? `Remplacer ${cur.callsign} ou ajouter un opérateur à l'escouade (${profile.squad.length}/5).` : `Escouade : ${profile.squad.length}/5.`;
    if (!cand) { el.innerHTML = '<div class="muted trempty">Choisissez un opérateur dans la liste.</div>'; return; }
    const o = OPERATORS.find(x => x.id === cand), st = profile.operators[o.id], d = Game.effectiveDef(profile, o.id), dc = cur ? Game.effectiveDef(profile, cur.id) : null;
    const inSquad = profile.squad.includes(o.id), expired = Game.contractExpired(profile, o.id);
    const rows = Game.STATS.map(k => { const diff = dc && cur.id !== o.id ? d[k] - dc[k] : 0; return `<div class="dr"><span class="dico">${OT.Ico ? OT.Ico(STAT_ICO[k]) : ''}</span><div><span>${STAT_FR[k]}</span><div class="drv"><b>${d[k]}</b><i class="sb"><i style="width:${d[k]}%"></i></i>${diff ? `<em class="${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '+' : ''}${diff}</em>` : ''}</div></div></div>`; }).join('');
    const acts = [];
    if (!st.unlocked) acts.push(`<button class="ybtn" data-a="recruit" ${profile.credits >= PRICES.operator[o.rarity] ? '' : 'disabled'}>Recruter · ${PRICES.operator[o.rarity]} cr.</button>`);
    else if (expired) acts.push(`<button class="ybtn" data-a="renew" ${profile.credits >= Game.renewPrice(profile, o.id) ? '' : 'disabled'}>Renouveler · ${Game.renewPrice(profile, o.id)} cr.</button>`);
    else if (inSquad) { if (profile.squad.length > 1) acts.push('<button class="ybtn dim" data-a="remove">Retirer de l’escouade</button>'); }
    else { if (cur && profile.squad.includes(cur.id)) acts.push(`<button class="ybtn" data-a="swap" id="trAccept">Accepter (remplace ${esc(cur.callsign)})</button>`); if (profile.squad.length < 5) acts.push('<button class="ybtn" data-a="add">Ajouter à l’escouade</button>'); }
    if (st.unlocked) acts.push('<button class="ybtn dim" data-a="view" id="trView">Voir la fiche</button>');
    el.innerHTML = `<div class="trcard">${bigCardHTML(o)}</div><div class="trstats"><div class="trh">Détails <small>${esc(TRAITS[o.trait].name)}</small></div>${rows}<p class="trtrait">${esc(TRAITS[o.trait].desc)}</p><div class="tracts">${acts.join('')}</div></div>`;
    bindCardActs(el, o);
    el.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.a;
      if (a === 'recruit') { if (Game.recruit(profile, o.id)) flash(`${o.callsign} rejoint l’unité.`); else flash('Crédits insuffisants.'); }
      else if (a === 'renew') { if (Game.renewContract(profile, o.id)) flash(`Contrat de ${o.callsign} renouvelé.`); else flash('Crédits insuffisants.'); }
      else if (a === 'remove') { Game.toggleSquad(profile, o.id); if (selected === o.id) selected = profile.squad[0]; }
      else if (a === 'add') { if (Game.toggleSquad(profile, o.id)) selected = o.id; }
      else if (a === 'swap') { if (Game.swapSquad(profile, cur.id, o.id)) { selected = o.id; flash(`${o.callsign} remplace ${cur.callsign}.`); $('#tmRoster').classList.add('hidden'); } }
      else if (a === 'view') { selected = o.id; $('#tmRoster').classList.add('hidden'); }
      saveNow(); render();
    }));
  }

  function renderDetail() {
    const o = OPERATORS.find(x => x.id === selected); const st = profile.operators[o.id]; const def = Game.effectiveDef(profile, o.id);
    const role = ROLES[o.role];
    $('#tmCard').innerHTML = bigCardHTML(o); bindCardActs($('#tmCard'), o);
    document.querySelectorAll('.tmtabs button').forEach(b => b.classList.toggle('on', b.dataset.tt === teamTab));
    const w = WEAPONS[st.weaponId], a = ARMORS[st.armorId];
    const statRows = Game.STATS.map(k => { const bonus = !def.wounded && def[k] > o[k] ? def[k] - o[k] : 0; return `<div class="srow ${def.wounded ? 'wounded' : ''}"><span class="sl">${STAT_FR[k]}</span><span class="si">${OT.Ico ? OT.Ico(STAT_ICO[k]) : ''}</span><span class="sv">${def[k]}${bonus ? `<small>+${bonus}</small>` : ''}</span><span class="sbar"><i style="width:${def[k]}%"></i>${def.wounded ? `<u style="width:${o[k]}%"></u>` : ''}</span></div>`; }).join('');
    const promos = (st.pendingPromotions || []).map(p => `<div class="promobox"><b>Promotion — niveau ${p.level}</b> : choisissez un second trait.<div class="promochoices">${p.choices.map(t => `<button class="promochoice" data-act="promo" data-trait="${t}" data-id="${o.id}"><b>${TRAITS[t].name}</b><span>${esc(TRAITS[t].desc)}</span></button>`).join('')}</div></div>`).join('');
    let html = '';
    if (teamTab === 'skills') html = `<div class="sgrid">${statRows}</div><div class="traitbox"><b>${TRAITS[o.trait].name}</b> — ${esc(TRAITS[o.trait].desc)}${(st.traits || []).map(t => `<br><b>${TRAITS[t].name}</b> <small class="muted">(promotion)</small> — ${esc(TRAITS[t].desc)}`).join('')}</div>${promos}<div class="lvl">Niveau ${def.level} · ${Game.xpToNext(st.xp) === null ? 'maximum' : Game.xpToNext(st.xp) + ' XP avant le suivant'}</div>`;
    else if (teamTab === 'head') html = st.unlocked ? `<div class="trh">Couvre-chef</div><div class="hgpick">${Object.keys(Game.HEADGEAR_PRICES).map(h => { const owned = !!profile.headgear[h]; const nm = OT.Figure.HEADGEAR[h].name; return `<button class="mini ${st.headgear === h ? 'on' : ''} ${owned ? '' : 'locked'}" data-hg="${h}" title="${nm}${owned ? '' : ' — ' + Game.HEADGEAR_PRICES[h] + ' cr.'}">${nm}${owned ? '' : ' · ' + Game.HEADGEAR_PRICES[h] + ' cr.'}</button>`; }).join('')}</div>` : '<p class="muted">Recrutez cet opérateur pour le personnaliser.</p>';
    else if (teamTab === 'equip') html = st.unlocked ? `
      <div class="equip">
        <label>Arme <select id="selWeapon">${role.weapons.map(id => `<option value="${id}" ${id === st.weaponId ? 'selected' : ''} ${profile.inventory.weapons[id] ? '' : 'disabled'}>${WEAPONS[id].name}${profile.inventory.weapons[id] ? '' : ' (armurerie : ' + PRICES.weapon[id] + ' cr.)'}</option>`).join('')}</select></label>
        <div class="wspec">Dégâts ${w.damage} · portée ${w.range} m · ${w.rpm} c/min · chargeur ${w.mag} · rechargement ${w.reload} s · précision ${Math.round(w.accuracy * 100)} %${w.minRange ? ` · pénalisé sous ${w.minRange} m` : ''}</div>
        <div class="wspec"><b>Protection</b> : Plaques moyennes (III) — absorbe ${Math.round(ARMORS.medium.torso * 100)} % au torse, ${Math.round(ARMORS.medium.head * 100)} % à la tête · vitesse × ${ARMORS.medium.mobility}</div>
        <div class="contract ${Game.contractExpired(profile, o.id) ? 'bad' : ''}">Contrat : ${st.tours > 0 ? `${st.tours} mission${st.tours > 1 ? 's' : ''} restante${st.tours > 1 ? 's' : ''}` : 'expiré'} · renouvellement ${Game.renewPrice(profile, o.id)} cr. (+${CONTRACT.tours[o.rarity]} missions)${st.dupes ? ` · ${st.dupes} doublon${st.dupes > 1 ? 's' : ''}` : ''} <button class="mini" data-renew="${o.id}" ${profile.credits >= Game.renewPrice(profile, o.id) ? '' : 'disabled'}>Renouveler</button></div>
      </div>` : `<p class="muted">Recrutez cet opérateur (${PRICES.operator[o.rarity]} crédits) pour l’équiper et l’engager.</p>`;
    else html = `<div class="histsum"><span><b>${st.battles}</b> batailles</span><span><b>${st.kills}</b> neutralisations</span><span><b>${st.downs || 0}</b> fois hors de combat</span><span><b>${(st.downs ? (st.kills / st.downs).toFixed(2) : (st.kills ? '∞' : '—'))}</b> ratio N / H</span><span><b>${st.headshots || 0}</b> tirs à la tête</span><span><b>${st.revives || 0}</b> alliés relevés</span></div>${(st.history || []).length ? `<table class="histt"><tr><th>Mission</th><th>Issue</th><th>Neutr.</th><th>Au but</th><th>Dégâts</th><th>XP</th></tr>${st.history.slice().reverse().map(h => `<tr class="${h.alive ? '' : 'dead'}"><td>${esc(h.m)}</td><td>${h.won ? 'Victoire' : h.draw ? 'Égalité' : 'Défaite'}${h.alive ? '' : ' · évacué'}</td><td>${h.kills}</td><td>${h.hits}/${h.shots}</td><td>${h.dmg}</td><td>+${h.xp}</td></tr>`).join('')}</table>` : '<div class="muted" style="padding:10px 0">Aucune bataille encore.</div>'}`;
    $('#hqDetail').innerHTML = html;
    $('#hqDetail').querySelectorAll('[data-hg]').forEach(b => b.addEventListener('click', () => { const h = b.dataset.hg; if (!profile.headgear[h]) { if (Game.buyHeadgear(profile, h)) flash(`${OT.Figure.HEADGEAR[h].name} acheté.`); else { flash('Crédits insuffisants.'); return; } } Game.setHeadgear(profile, o.id, h); saveNow(); render(); }));
    $('#hqDetail').querySelectorAll('.promochoice').forEach(b => b.addEventListener('click', () => { if (Game.choosePromotion(profile, b.dataset.id, b.dataset.trait)) { flash(`${o.callsign} acquiert « ${TRAITS[b.dataset.trait].name} ».`); saveNow(); render(); } }));
    const rb = $('#hqDetail').querySelector('[data-renew]'); if (rb) rb.addEventListener('click', () => { if (Game.renewContract(profile, o.id)) { flash('Contrat renouvelé.'); saveNow(); render(); } else flash('Crédits insuffisants.'); });
    if (st.unlocked && teamTab === 'equip') {
      $('#selWeapon').addEventListener('change', (e) => { Game.setWeapon(profile, o.id, e.target.value); saveNow(); render(); });
    }
    if (!$('#tmRoster').classList.contains('hidden')) renderCandidate();
  }

  function renderSquad() {
    const el = $('#hqSquad');
    const slots = [];
    for (let i = 0; i < 5; i++) {
      const id = profile.squad[i];
      if (!id) { slots.push('<div class="sqc empty" data-empty="1"><div class="sqc-name">Libre</div><div class="sqc-art">' + (OT.Ico ? OT.Ico('plus') : '+') + '</div></div>'); continue; }
      const o = OPERATORS.find(x => x.id === id), st = profile.operators[id];
      slots.push(`<div class="sqc slot r${o.rarity} ${selected === id ? 'sel' : ''} ${st.wounded ? 'wounded' : ''}" data-id="${id}"><div class="sqc-name">${esc(o.callsign)}</div><div class="sqc-art">${flagOf(o)}${portraitOf(o)}${st.wounded ? '<span class="bang">!</span>' : ''}</div><div class="sqc-rate ${st.wounded ? 'bad' : ''}"><b>${Math.round(Game.operatorRating(profile, id))}</b>${roleIco(o)}</div></div>`);
    }
    el.innerHTML = slots.join('');
    $('#squadRating').textContent = profile.squad.length ? Game.teamRating(profile) : '—';
    const syn = Game.squadSynergies(profile.squad.map(id => Game.effectiveDef(profile, id)));
    $('#hqSynergies').innerHTML = DATA.SYNERGIES.map(sy => { const a = syn.find(x => x.id === sy.id); return `<div class="syn ${a ? 'on' : ''}" title="${esc(sy.desc)}${a ? ' — ' + esc(a.sources.join(', ')) + ' → ' + esc(a.targets.join(', ')) : ''}"><b>${esc(sy.name)}</b><span>${esc(sy.effect)}</span></div>`; }).join('');
    el.querySelectorAll('.sqc[data-id]').forEach(s => s.addEventListener('click', () => { selected = s.dataset.id; render(); }));
    el.querySelectorAll('.sqc[data-empty]').forEach(s => s.addEventListener('click', () => { cand = null; $('#tmRoster').classList.remove('hidden'); renderRoster(); }));
    $('#selOrder').value = profile.order;
    $('#launch').disabled = !Game.squadReady(profile);
    const nw = profile.squad.filter(id => profile.operators[id].wounded).length;
    $('#launchHint').textContent = Game.squadReady(profile) ? `${profile.squad.length < 5 ? `Escouade réduite (${profile.squad.length}). ` : ''}${nw ? `Attention : ${nw} blessé${nw > 1 ? 's' : ''} grave${nw > 1 ? 's' : ''} à demi-capacité. ` : ''}${ORDERS[profile.order].desc}` : 'Il faut au moins 3 opérateurs disponibles pour lancer la mission.';
  }

  // ---- Jouer (habillage du jeu d'origine) : bannière des opérations spéciales, médailles des modes, missions, préparation ---
  let playView = 'home', opsIdx = null;
  const CAMP_MEDAL = { reguliere: 'reguliere', veteran: 'veteran', elite: 'elite', delta: 'delta' };
  const medal = (k) => (OT.Medaille ? OT.Medaille(k) : '');
  function setPlayView(v) { playView = v; $('#playHome').classList.toggle('hidden', v !== 'home'); $('#campView').classList.toggle('hidden', v !== 'camp'); $('#prepView').classList.toggle('hidden', v !== 'prep'); renderMissions(); }
  OT.resetPlay = () => { playView = 'home'; };
  OT.playBack = () => { if (tab !== 'missions' || playView === 'home') return false; setPlayView(playView === 'prep' && selectedMission !== 'rapide' ? 'camp' : 'home'); return true; };
  function renderMissions() {
    $('#playHome').classList.toggle('hidden', playView !== 'home'); $('#campView').classList.toggle('hidden', playView !== 'camp'); $('#prepView').classList.toggle('hidden', playView !== 'prep');
    $('#hq').dataset.view = playView;   // fil d'Ariane de la barre du haut (Jouer › Campagne › Préparation)
    // contrats du jour
    const dly = Game.dailyContracts(profile);
    $('#hqDaily').innerHTML = dly.list.map(c => `<div class="daily ${c.done ? 'done' : ''}"><div class="crow"><b>${esc(c.text)}</b><span class="spacer"></span><span>${c.done ? '✓' : c.progress + '/' + c.goal}</span></div><div class="xpbar big"><i style="width:${100 * c.progress / c.goal}%"></i></div><small>${c.reward} crédits</small></div>`).join('');
    // opérations spéciales : une à la fois (la première non accomplie), flèches pour parcourir
    const ops = profile.ops || { done: {} }, OPS = DATA.SPECIAL_OPS;
    if (opsIdx === null) { opsIdx = Math.max(0, OPS.findIndex(op => !(ops.done && ops.done[op.id]))); }
    const op = OPS[opsIdx % OPS.length], v = Math.min(op.goal, ops[op.stat] || 0), opDone = ops.done && ops.done[op.id];
    const duo = profile.squad.slice(0, 2).map(id => { const o = OPERATORS.find(x => x.id === id); return o ? portraitOf(o, true) : ''; }).join('');
    $('#hqOps').innerHTML = `<div class="spt">Opérations spéciales</div><button class="ibtn" title="${esc(op.desc)} — ${op.reward.credits} crédits${op.reward.pack ? ' + ' + esc(PACKS[op.reward.pack].name.toLowerCase()) : ''}">i</button>
      <div class="spart">${duo}</div><div class="spmedal">${medal('special')}</div>
      <div class="spfoot"><b>${esc(op.name)}</b><span class="spdesc">${esc(op.desc)}</span><div class="spbar"><i style="width:${100 * v / op.goal}%"></i></div><span class="spn">${opDone ? 'Accomplie' : v + ' / ' + op.goal}</span></div>
      <button class="sparr l" data-d="-1">‹</button><button class="sparr r" data-d="1">›</button>`;
    $('#hqOps').querySelectorAll('.sparr').forEach(b => b.addEventListener('click', () => { opsIdx = (opsIdx + OPS.length + parseInt(b.dataset.d, 10)) % OPS.length; renderMissions(); }));
    // médailles : bataille rapide + campagnes
    const q = profile.quick || { wins: 0 }, prize = DATA.QUICK.prizeEvery, k = q.wins % prize;
    const tiles = [`<button class="medtile quickcard mission ${selectedMission === 'rapide' ? 'sel' : ''}" data-id="rapide" data-camp="rapide"><span class="mdl">${medal('rapide')}</span><span class="ibtn" title="Un adversaire à votre mesure ; carte, objectif, heure et météo au hasard. ${esc(PACKS[DATA.QUICK.prizePack].name)} offert toutes les ${prize} victoires.">i</span><b class="mt">Bataille rapide</b><span class="ms"><em>Gagnez un prix !</em><i class="mbar"><i style="width:${100 * k / prize}%"></i></i><small>${k}/${prize}</small></span></button>`];
    for (const c of DATA.CAMPAIGNS.filter(c => CAMP_MEDAL[c.id])) {
      const ok = Game.campaignUnlocked(profile, c.id), pr = Game.campaignProgress(profile, c.id);
      const req = c.unlock ? (c.unlock.rank !== undefined ? `Rang ${c.unlock.rank}` : `Note ${c.unlock.rating}`) : '';
      const nextFinal = ok && (() => { const last = c.missions[c.missions.length - 1]; return Game.missionUnlocked(profile, c.id, last) && !((profile.campaigns || {})[c.id] || { won: {} }).won[last]; })();
      tiles.push(`<button class="medtile campbtn ${ok ? '' : 'locked'} ${selectedCampaign === c.id && selectedMission !== 'rapide' ? 'on' : ''}" data-camp="${c.id}"><span class="mdl">${medal(CAMP_MEDAL[c.id])}</span><span class="ibtn" title="${esc(c.desc)}">i</span><b class="mt">${esc(c.name)}</b><span class="ms">${ok ? (nextFinal ? '<strong>Finale</strong>' : `<strong>${pr.won} / ${pr.total}</strong>`) : `<span class="lk">${OT.Ico ? OT.Ico('lock') : '🔒'}</span><strong>${req}</strong>`}</span></button>`);
    }
    $('#hqCampaigns').innerHTML = tiles.join('');
    $('#hqCampaigns').querySelectorAll('.medtile').forEach(b => b.addEventListener('click', (e) => {
      const id = b.dataset.camp;
      if (id === 'rapide') { selectedMission = 'rapide'; setPlayView('prep'); return; }
      if (!Game.campaignUnlocked(profile, id)) { const c = DATA.CAMPAIGNS.find(x => x.id === id); flash(`Verrouillée — ${c.unlock.rank !== undefined ? 'atteindre le rang ' + c.unlock.rank + ' (' + RANKS[c.unlock.rank].name + ')' : 'atteindre une note d’équipe de ' + c.unlock.rating}.`); return; }
      selectedCampaign = id; const c = DATA.CAMPAIGNS.find(x => x.id === id);
      const next = c.missions.find(mid => Game.missionUnlocked(profile, id, mid) && !(((profile.campaigns || {})[id] || { won: {} }).won[mid])) || c.missions[0];
      selectedMission = Game.campaignMission(id, next).id; setPlayView('camp');
    }));
    // vue campagne : missions en cartes, déploiement, défis
    const camp = DATA.CAMPAIGNS.find(c => c.id === selectedCampaign), campOk = Game.campaignUnlocked(profile, camp.id);
    $('#cvMedal').innerHTML = medal(CAMP_MEDAL[camp.id] || 'special'); $('#cvName').textContent = camp.name;
    $('#hqCampInfo').textContent = campOk ? `${camp.desc} Prime de participation ${camp.participation} cr. (toutes jouées), prime de campagne ${camp.completion} cr. (toutes gagnées).` : 'Verrouillée.';
    const el = $('#hqMissions');
    el.innerHTML = camp.missions.map((mid, i) => {
      const m = Game.campaignMission(camp.id, mid), unlocked = Game.missionUnlocked(profile, camp.id, mid);
      const done = profile.missions[m.id]; const st = (profile.campaigns && profile.campaigns[camp.id]) || { played: {}, won: {} };
      const won = st.won[mid] || (camp.id === 'reguliere' && done && done.wins);
      return `<div class="mission ${selectedMission === m.id ? 'sel' : ''} ${unlocked ? '' : 'locked'} ${won ? 'won' : ''}" data-id="${m.id}">
        <div class="mrow"><span class="mnum">${String(i + 1).padStart(2, '0')}</span><b>${esc(m.name)}</b>${m.final ? '<span class="final">Finale</span>' : ''}${won ? '<span class="mwon">✓</span>' : ''}</div>
        ${unlocked ? `<div class="mmap">${OT.MAPS[m.mapId].name} · ${Game.objectiveLabel(m)}${m.conditions && m.conditions !== 'jour' ? ' · <b class="cond">' + DATA.CONDITIONS[m.conditions].name + '</b>' : ''}</div><div class="mdesc">${esc(m.desc)}</div>
        <div class="mfoot"><span class="diff">${'◆'.repeat(m.difficulty)}${'◇'.repeat(4 - m.difficulty)}</span><span>${m.reward} cr. · ${m.xp} XP</span><span>${done ? `${done.wins}/${done.attempts}` : 'jamais tentée'}</span></div>` : `<div class="mlock">${OT.Ico ? OT.Ico('lock') : '🔒'} Jouez la mission précédente</div>`}
      </div>`;
    }).join('');
    el.querySelectorAll('.mission').forEach(m => m.addEventListener('click', () => { if (m.classList.contains('locked')) { flash('Mission verrouillée : jouez d’abord la précédente.'); return; } selectedMission = m.dataset.id; renderMissions(); renderDeploy(); }));
    // préparation : trois emplacements de tactiques, ordre, équipe, bouton Jouer
    const mm = currentMission();
    $('#prepTitle').textContent = mm ? mm.name : '';
    $('#prepSub').innerHTML = mm ? `${esc(OT.MAPS[mm.mapId].name)} · ${esc(Game.objectiveLabel(mm))}${mm.conditions && mm.conditions !== 'jour' ? ' · ' + esc(DATA.CONDITIONS[mm.conditions].name) : ''} · <span class="muted">adversaire niveau ${mm.level}</span>` : '';
    const eq = profile.tactics.equipped || [], ownedN = Object.keys(profile.tactics.owned || {}).length;
    $('#prepSlots').innerHTML = (ownedN ? '' : '<div class="p3none">Aucune carte de tactique disponible.<button class="getcards" data-go2="cartes"><span data-ico="pack"></span>Obtenir des cartes</button></div>')
      + [0, 1, 2].map(i => { const id = eq[i]; return id ? `<button class="tslot full" data-slot="${i}" data-t="${id}" title="${esc(TACTICS[id].desc)} (cliquer pour retirer)"><span class="tsname">${esc(TACTICS[id].name)}</span><span class="tsart">${tacArt(id)}</span></button>` : `<button class="tslot" data-slot="${i}"><span class="tsplus">+</span><span>Choisir une<br>tactique</span></button>`; }).join('');
    $('#prepSlots').querySelectorAll('.tslot').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.t) { Game.equipTactic(profile, b.dataset.t); saveNow(); render(); return; }
      if (!ownedN) { flash('Aucune tactique : ouvrez des paquets de cartes.'); return; }
      const pk = $('#prepPick'); pk.classList.toggle('hidden'); renderPick();
    }));
    $('#prepSlots').querySelectorAll('[data-go2]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.go2)));
    if (!$('#prepPick').classList.contains('hidden')) renderPick();
    $('#prepOrderTxt').textContent = ORDERS[profile.order].name;
    $('#prepTeam').innerHTML = profile.squad.slice(0, 3).map(id => { const o = OPERATORS.find(x => x.id === id); return o ? portraitOf(o) : ''; }).join('');
    $('#launch').querySelector('b').textContent = selectedMission === 'rapide' ? 'Jouer' : 'Jouer';
    fillIcons($('[data-panel=missions]'));
  }
  function renderPick() {
    const eq = profile.tactics.equipped || [];
    $('#prepPick').innerHTML = `<div class="pkhead">Choisir une tactique <small>(${eq.length}/3)</small><button class="mini" id="pkClose">OK</button></div><div class="pkgrid">` + Object.values(TACTICS).filter(t => profile.tactics.owned[t.id]).map(t => `<button class="pkcard ${eq.includes(t.id) ? 'eq' : ''}" data-t="${t.id}" title="${esc(t.desc)}"><span class="tsart">${tacArt(t.id)}</span><b>${esc(t.name)}</b><small>${t.active ? `${t.uses} emploi${t.uses > 1 ? 's' : ''}` : 'passive'}</small></button>`).join('') + '</div>';
    $('#pkClose').addEventListener('click', () => $('#prepPick').classList.add('hidden'));
    $('#prepPick').querySelectorAll('.pkcard').forEach(c => c.addEventListener('click', () => { if (!Game.equipTactic(profile, c.dataset.t)) flash('Trois tactiques au maximum : retirez-en une d’abord.'); saveNow(); render(); }));
  }
  $('#cvClose').addEventListener('click', () => setPlayView('home'));
  $('#toPrep').addEventListener('click', () => { const m = currentMission(); if (!m) return; if (!m.quick && !Game.missionUnlocked(profile, selectedCampaign, selectedMission.includes(':') ? selectedMission.split(':')[1] : selectedMission)) { flash('Mission verrouillée.'); return; } setPlayView('prep'); });
  $('#prepOrder').addEventListener('click', () => { const ids = Object.keys(ORDERS); profile.order = ids[(ids.indexOf(profile.order) + 1) % ids.length]; saveNow(); render(); });


  function renderArmory() {
    const el = $('#hqArmory');
    const items = Object.values(WEAPONS).filter(w => !profile.inventory.weapons[w.id]);
    const owned = profile.inventory.attachments || {};
    const armHTML = Object.values(ARMORS).filter(a => !profile.inventory.armors[a.id]).map(a => `<div class="armo"><div><b>${esc(a.name)}</b><div class="wspec">Absorbe ${Math.round(a.torso * 100)} % au torse, ${Math.round(a.head * 100)} % à la tête · vitesse × ${a.mobility}</div></div><button class="mini" data-arm="${a.id}" ${profile.credits >= PRICES.armor[a.id] ? '' : 'disabled'}>${PRICES.armor[a.id]} cr.</button></div>`).join('');
    const accHTML = '<div class="lbl" style="margin-top:6px">Accessoires</div>' + Object.values(DATA.ATTACHMENTS).map(a => `<div class="armo ${owned[a.id] ? 'owned' : ''}"><div><b>${esc(a.name)}</b> <small class="muted">${{ optique: 'optique', bouche: 'bouche', poignee: 'poignée', chargeur: 'chargeur' }[a.slot]}</small><div class="wspec">${esc(a.desc)}</div></div>${owned[a.id] ? '<span class="muted" style="font-size:11px">acquis</span>' : `<button class="mini" data-acc="${a.id}" ${profile.credits >= a.price ? '' : 'disabled'}>${a.price} cr.</button>`}</div>`).join('');
    const bindArm = () => el.querySelectorAll('button[data-arm]').forEach(b => b.addEventListener('click', () => { if (Game.buyArmor(profile, b.dataset.arm)) { flash(`${ARMORS[b.dataset.arm].name} ajoutées à l’armurerie.`); saveNow(); render(); } }));
    const bindAcc = () => (bindArm(), 0) || el.querySelectorAll('button[data-acc]').forEach(b => b.addEventListener('click', () => { if (Game.buyAttachment(profile, b.dataset.acc)) { flash(`${DATA.ATTACHMENTS[b.dataset.acc].name} acquis : à monter sur la fiche d’un opérateur.`); saveNow(); render(); } }));
    if (!items.length) { el.innerHTML = '<div class="muted" style="font-size:12px">Toutes les armes sont disponibles.</div>' + armHTML + accHTML; bindAcc(); return; }
    el.innerHTML = items.map(w => `<div class="armo"><div><b>${esc(w.name)}</b><div class="wspec">Dégâts ${w.damage} · portée ${w.range} m · ${w.rpm} c/min · chargeur ${w.mag}${w.silenced ? ' · silencieux : presque inaudible au-delà de 18 m' : ''}</div></div><button class="mini" data-w="${w.id}" ${profile.credits >= PRICES.weapon[w.id] ? '' : 'disabled'}>${PRICES.weapon[w.id]} cr.</button></div>`).join('') + armHTML + accHTML; bindAcc();
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
    $('#vsName0').textContent = profile.teamName; $('#vsRank0').textContent = `Rang ${r}  (${RANKS[r].name})`;
    $('#vsIns0').innerHTML = OT.Embleme ? OT.Embleme.svg(ins.glyph, '#ffffff') : ins.glyph;
    $('#vsRating0').textContent = Game.teamRating(profile); $('#vsRec0').innerHTML = `Victoires<b>${profile.career.wins}</b><br>Défaites<b>${profile.career.losses}</b>`;
    const got = profile.achievements || {};
    $('#vsAch0').innerHTML = ACHIEVEMENTS.filter(a => got[a.id]).slice(-5).map(a => `<span class="ach got" title="${esc(a.name)}">${a.glyph}</span>`).join('') || '<span class="ach">✦</span>'.repeat(5);
    const tacs = (ids) => { const out = ids.map(id => `<span title="${esc(TACTICS[id].desc)}"><i>${esc(TACTICS[id].name)}</i><span class="tsart">${tacArt(id)}</span></span>`); while (out.length < 3) out.push('<span class="empty"></span>'); return out.join(''); };
    $('#vsTac0').innerHTML = tacs(profile.tactics.equipped);
    // adversaire : note calculée de la même façon à partir de ses fiches effectives
    const enemyDefs = opts.teams[1].operators;
    const enemyRating = Math.round(enemyDefs.reduce((s, d) => s + Game.defRating(d), 0) / enemyDefs.length);
    const km = profile.missions[mission.id] || { attempts: 0, wins: 0 };
    const lt = mission.league ? League.AI_TEAMS.find(t => t.id === mission.league) : null; const ls = lt && profile.league ? profile.league.standings[lt.id] : null;
    const fac = DATA.FACTIONS[mission.faction || 'karst'] || DATA.FACTIONS.karst;
    $('#vsName1').textContent = lt ? lt.name : fac.name; $('#vsRank1').textContent = `Niveau ${mission.level}  (${ORDERS[mission.order].name})`;
    const g1 = lt ? lt.insignia : (fac.glyph || '⚑'); $('#vsIns1').innerHTML = OT.Embleme ? OT.Embleme.svg(g1, '#a01a10') : g1;
    $('#vsRating1').textContent = enemyRating; $('#vsRec1').innerHTML = ls ? `Victoires<b>${ls.wins}</b><br>Défaites<b>${ls.losses}</b>` : `Victoires<b>${km.attempts - km.wins}</b><br>Défaites<b>${km.wins}</b>`;
    $('#vsAch1').innerHTML = '';
    $('#vsTac1').innerHTML = tacs(mission.enemyTactics || []);
    $('#vsTip').innerHTML = '<b>Astuce</b>' + esc(TIPS[Math.floor(Math.random() * TIPS.length)]);
    $('#vsLoc').textContent = OT.MAPS[mission.mapId].name + (mission.conditions && mission.conditions !== 'jour' ? ' · ' + DATA.CONDITIONS[mission.conditions].name : ''); $('#vsObj').textContent = Game.objectiveLabel(mission);
    $('#vsSquad0').innerHTML = opts.teams[0].operators.map(d => `<span class="${d.wounded ? 'bad' : ''}">${esc(d.callsign)}${d.wounded ? ' ✚' : ''}</span>`).join('');
    const synTxt = (defs) => Game.squadSynergies(defs).map(s => `<span title="${esc(s.desc)}">${esc(s.name)}</span>`).join('') || '';
    $('#vsSyn0').innerHTML = synTxt(opts.teams[0].operators); $('#vsSyn1').innerHTML = synTxt(opts.teams[1].operators);
    $('#vsSquad1').innerHTML = enemyDefs.map(d => `<span>${esc(d.callsign)}</span>`).join('');
    // soldats en pied de part et d'autre, comme le jeu d'origine
    const uni = UNIFORMS.find(u => u.id === profile.uniform) || UNIFORMS[0], d0 = opts.teams[0].operators[0], d1 = enemyDefs[0];
    const fig = (d, u, v, hg) => (OT.Portrait && d && OT.Portrait.render({ id: d.id, weapon: d.weapon || (ROLES[d.role] || {}).weapon, uniform: u, vest: v, headgear: hg, full: true, w: 420, h: 640, aiming: true })) || '';
    $('#vsFig0').src = fig(d0, uni.uniform, uni.vest, (profile.operators[profile.squad[0]] || {}).headgear || 'casque');
    $('#vsFig1').src = fig(d1, fac.uniform || 0x5c6066, fac.vest || 0x3a3d42, mission.faction === 'delta' ? 'foulard' : 'casque_lunettes');
    // aperçu du terrain : la bataille est préparée maintenant, l'image vient de sa propre scène 3D
    const prev = window.HQ.onPrepare ? window.HQ.onPrepare(opts, mission) : null;
    $('#vsMapImg').src = prev || ''; $('#vsMapImg').style.visibility = prev ? '' : 'hidden';
    fitStage(); $('#vs').classList.remove('hidden');
  }
  $('#vs').classList.add('stage1080');
  $('#vsBack').addEventListener('click', () => { $('#vs').classList.add('hidden'); pendingLaunch = null; });
  const go = (skip) => { if (!pendingLaunch) return; const { opts, mission } = pendingLaunch; pendingLaunch = null; $('#vs').classList.add('hidden'); if (window.HQ.onStart) window.HQ.onStart(opts, mission, skip); else window.HQ.onLaunch(opts, mission); };
  $('#vsGo').addEventListener('click', () => go(false));
  $('#vsSkip').addEventListener('click', () => go(true));
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
    for (const c of (r.daily || [])) extra.push(`Contrat du jour rempli : ${c.text} (+${c.reward} cr.)`);
    $('#rwExtra').innerHTML = extra.map(esc).join('<br>');
    // figure : le meilleur opérateur de la mission (le plus de neutralisations, puis de dégâts)
    const best = result.teams[0].units.slice().sort((a, b) => (b.stats.kills - a.stats.kills) || (b.stats.damageDealt - a.stats.damageDealt))[0];
    const bo = best && OPERATORS.find(o => o.id === best.id.split(':')[1]);
    $('#rwFig').src = (bo && (() => { const st = profile.operators[bo.id]; const uni = DATA.UNIFORMS.find(u => u.id === profile.uniform) || DATA.UNIFORMS[0]; return OT.Portrait && OT.Portrait.render({ id: bo.id, weapon: st.weaponId, uniform: uni.uniform, vest: uni.vest, headgear: st.headgear || 'casque', full: true, w: 420, h: 640, aiming: r.won }); })()) || '';
    $('#rwCredits').textContent = profile.credits; $('#rwRankHead').textContent = r.rankUp ? 'Promotion !' : 'Rang';
    $('#rwTeam').classList.toggle('hidden', !(r.injured && r.injured.length));
    $('#rwTeamArt').innerHTML = profile.squad.slice(0, 3).map(id => { const o = OPERATORS.find(x => x.id === id); return o ? portraitOf(o) : ''; }).join('');
    fitStage(); fillIcons($('#rewards'));
    $('#rewards').classList.remove('hidden');
    // panneaux successifs : le nouveau arrive au centre, le précédent recule au-dessus (comme le jeu d'origine)
    rwSeq = [...document.querySelectorAll('#rewards .rwp')].filter(x => !x.hidden); clearInterval(rwTimer);
    const manualMode = document.documentElement.classList.contains('manual');
    rwStep(manualMode ? rwSeq.length - 1 : 0);
    if (!manualMode) rwTimer = setInterval(() => { if (rwK >= rwSeq.length - 1) { clearInterval(rwTimer); return; } rwStep(rwK + 1); }, 1800);
    // pièces qui tombent
    for (let i = 0; i < Math.min(30, 8 + Math.floor(total / 20)); i++) { const c = document.createElement('div'); c.className = 'coinfx'; c.textContent = '●'; c.style.left = (35 + Math.random() * 55) + '%'; c.style.top = '8%'; c.style.animationDelay = (Math.random() * 1.1) + 's'; document.body.appendChild(c); setTimeout(() => c.remove(), 2800); }
  }

  let rwSeq = [], rwK = 0, rwTimer = null;
  function rwStep(k) { rwK = k; rwSeq.forEach((el, i) => { el.classList.toggle('gone', i < k - 1); el.classList.toggle('back', i === k - 1); el.classList.toggle('wait', i > k); }); }
  $('#rewards').classList.add('stage1080');
  $('#rwContinue').addEventListener('click', () => { if (rwK < rwSeq.length - 1) { clearInterval(rwTimer); rwStep(rwK + 1); return; } clearInterval(rwTimer); $('#rewards').classList.add('hidden'); });
  $('#rwTeam').addEventListener('click', () => { clearInterval(rwTimer); $('#rewards').classList.add('hidden'); });
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
    // export / import de la carrière (réglages) : texte JSON ; l'import passe par Game.load (mêmes vérifications et migrations)
    exportSave() { return JSON.stringify(profile); },
    importSave(txt) { const p = Game.load({ getItem: () => txt }); if (!p) return false; profile = p; selected = profile.squad[0] || OPERATORS[0].id; lastRewards = null; saveNow(); render(); return true; },
    show() { switchTo(true); showTab(lastRewards && lastRewards.mission && lastRewards.mission.startsWith('Ligue') ? 'ligue' : 'accueil'); if (window.OT_GUIDE) window.OT_GUIDE.maybe(); },
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
  // le soldat 3D arrive : portraits et tuiles redessinés avec lui
  if (OT.Soldat3D) OT.Soldat3D.whenReady(() => { tilesKey = ''; render(); });
  if (!storage) flash('Sauvegarde locale indisponible dans ce navigateur : la progression ne sera pas conservée.');
  render();
})();
