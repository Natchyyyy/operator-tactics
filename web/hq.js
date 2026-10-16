// Quartier général : collection, escouade, équipement, formation, missions, récompenses, sauvegarde.
// Toute la logique vient de sim/game.js ; ce fichier affiche le profil et relaie les actions.
(function () {
  const OT = window.OT; const { Game, DATA } = OT;
  const { WEAPONS, ARMORS, ROLES, OPERATORS, ORDERS, MISSIONS, PRICES, TRAITS, CHALLENGES, TACTICS, INSIGNIAS, UNIFORMS, RANKS, PACKS } = DATA;
  const TACTIC_ICON = { fumigene: '💨', reco: '📡', soins: '✚', barrage: '💥', drill: '🛡', blitz: '⚡', retranche: '🧱', discipline: '🎯' };
  const $ = (s) => document.querySelector(s);
  const STAT_FR = { marksmanship: 'Tir', reflexes: 'Réflexes', mobility: 'Mobilité', perception: 'Perception', composure: 'Sang-froid', endurance: 'Endurance' };
  const LANE_FR = { '-1': 'Nord', '0': 'Centre', '1': 'Sud', 'null': 'Auto' };
  const RARITY_FR = { 1: 'Commun', 2: 'Rare', 3: 'Élite' };
  const roleIcon = { assault: 'AS', pointman: 'PT', marksman: 'TE', support: 'AP', breacher: 'BR' };

  let storage = null; try { storage = window.localStorage; storage.getItem('x'); } catch (e) { storage = null; }
  let profile = (storage && Game.load(storage)) || Game.newProfile();
  let selected = profile.squad[0] || OPERATORS[0].id;
  let selectedMission = MISSIONS[0].id;
  let lastRewards = null;
  const saveNow = () => { if (storage) Game.save(profile, storage); };

  const esc = (s) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  let tab = 'accueil';
  function showTab(t) { tab = t; document.querySelectorAll('.hqpanel').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== t)); document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t)); }
  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.go)));

  function render() {
    $('#credits').textContent = profile.credits;
    const c = profile.career;
    $('#career').textContent = `${c.battles} bataille${c.battles > 1 ? 's' : ''} · ${c.kills} neutralisation${c.kills > 1 ? 's' : ''} · ${c.losses_units} opérateur${c.losses_units > 1 ? 's' : ''} évacué${c.losses_units > 1 ? 's' : ''}`;
    renderHome(); renderRoster(); renderDetail(); renderSquad(); renderMissions(); renderDeploy(); renderArmory(); renderPacks(); renderTactics(); renderPerks(); renderChallenges(); renderRewards();
  }
  function renderHome() {
    const ins = INSIGNIAS.find(i => i.id === profile.insignia) || INSIGNIAS[0];
    $('#hqIns').textContent = ins.glyph; $('#hqTeamName').textContent = profile.teamName;
    const r = Game.rankFor(profile.xp || 0), next = Game.xpToNextRank(profile.xp || 0);
    $('#hqRank').textContent = RANKS[r].name; $('#hqXp').textContent = next === null ? 'rang maximal' : `${next} XP avant le rang suivant`;
    $('#hqXpBar').style.width = next === null ? '100%' : (100 * ((profile.xp || 0) - RANKS[r].xp) / (RANKS[r + 1].xp - RANKS[r].xp)).toFixed(0) + '%';
    $('#hqRating').textContent = Game.teamRating(profile);
    $('#hqWins').textContent = profile.career.wins; $('#hqLosses').textContent = profile.career.losses; $('#hqDraws').textContent = profile.career.draws;
    if (document.activeElement !== $('#teamName')) $('#teamName').value = profile.teamName;
    $('#insPick').innerHTML = INSIGNIAS.map(i => { const ok = profile.unlocked.insignias.includes(i.id); return `<button data-ins="${i.id}" class="${profile.insignia === i.id ? 'on' : ''} ${ok ? '' : 'locked'}" title="${i.name}${ok ? '' : ' (à débloquer dans un paquet)'}">${i.glyph}</button>`; }).join('');
    $('#insPick').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { if (Game.setCustomization(profile, 'insignia', b.dataset.ins)) { saveNow(); render(); } }));
    $('#uniPick').innerHTML = UNIFORMS.map(u => { const ok = profile.unlocked.uniforms.includes(u.id); return `<button data-uni="${u.id}" class="${profile.uniform === u.id ? 'on' : ''} ${ok ? '' : 'locked'}" title="${u.name}${ok ? '' : ' (à débloquer dans un paquet)'}"><span class="sw" style="background:#${u.uniform.toString(16).padStart(6, '0')}"></span></button>`; }).join('');
    $('#uniPick').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { if (Game.setCustomization(profile, 'uniform', b.dataset.uni)) { saveNow(); render(); } }));
  }
  $('#teamName').addEventListener('change', (e) => { if (Game.setCustomization(profile, 'teamName', e.target.value)) { saveNow(); render(); } else e.target.value = profile.teamName; });
  function renderDeploy() {
    const m = MISSIONS.find(x => x.id === selectedMission);
    const squad = profile.squad.map(id => OPERATORS.find(o => o.id === id).callsign).join(', ') || 'aucun';
    const tac = (profile.tactics.equipped || []).map(id => TACTICS[id].name).join(', ') || 'aucune';
    $('#hqDeploy').innerHTML = `<div class="deploy"><div><b>${esc(m.name)}</b> — ${OT.MAPS[m.mapId].name}</div><div>Escouade (${profile.squad.length}) : ${esc(squad)}</div><div>Ordre : ${ORDERS[profile.order].name} · Tactiques : ${esc(tac)}</div><div>Puissance ${Game.teamRating(profile)} contre niveau ${m.level} du Groupe Karst (${ORDERS[m.order].name}${m.enemyTactics && m.enemyTactics.length ? ', tactiques : ' + m.enemyTactics.map(t => TACTICS[t].name).join(', ') : ''})</div></div>`;
  }
  function renderPacks() {
    $('#hqPacks').innerHTML = Object.values(PACKS).map(pk => `<div class="pack"><b>${esc(pk.name)}</b><div class="muted">${pk.cards} cartes · recrues, tactiques, perks, XP, crédits, cosmétiques${pk.id === 'elite' ? ' — meilleures chances' : ''}</div><button data-pack="${pk.id}" ${profile.credits >= pk.price ? '' : 'disabled'}>Ouvrir — ${pk.price} cr.</button></div>`).join('');
    $('#hqPacks').querySelectorAll('button[data-pack]').forEach(b => b.addEventListener('click', () => {
      const cards = Game.openPack(profile, b.dataset.pack);
      if (!cards) { flash('Crédits insuffisants.'); return; }
      saveNow(); render();
      $('#hqOpened').innerHTML = cards.map((c, i) => `<div class="ccard t-${c.type}" data-i="${i}"><div class="in"><div class="face back">◆</div><div class="face front"><span class="ctype">${{ operator: 'Recrue', tactic: 'Tactique', perk: 'Perk', xp: 'Expérience', credits: 'Crédits', cosmetic: 'Cosmétique' }[c.type]}</span><b>${esc(c.title)}</b><span>${esc(c.text)}</span></div></div></div>`).join('') + `<div class="muted" style="width:100%;font-size:11px">Cliquez sur les cartes pour les retourner (${cards.length}).</div>`;
      $('#hqOpened').querySelectorAll('.ccard').forEach(cc => cc.addEventListener('click', () => cc.classList.add('flipped')));
      setTimeout(() => $('#hqOpened').querySelectorAll('.ccard').forEach((cc, i) => setTimeout(() => cc.classList.add('flipped'), 400 + i * 350)), 300);
    }));
  }
  function renderTactics() {
    const eq = profile.tactics.equipped;
    $('#hqTactics').innerHTML = Object.values(TACTICS).map(t => { const owned = !!profile.tactics.owned[t.id]; return `<div class="tcardq ${eq.includes(t.id) ? 'eq' : ''} ${owned ? '' : 'locked'}" data-t="${t.id}" title="${esc(t.desc)}"><span class="ticon">${TACTIC_ICON[t.id]}</span><b>${esc(t.name)}</b><span class="muted">${t.active ? `active · ${t.uses} emploi${t.uses > 1 ? 's' : ''}${t.cooldown ? ', recharge ' + t.cooldown + ' s' : ''}` : 'passive'}</span><span>${esc(t.desc)}</span><span class="muted">${owned ? (eq.includes(t.id) ? 'Emportée' : 'Possédée') : 'À trouver dans un paquet'}</span></div>`; }).join('');
    $('#hqTactics').querySelectorAll('.tcardq').forEach(c => c.addEventListener('click', () => { const id = c.dataset.t; if (!profile.tactics.owned[id]) return; if (!Game.equipTactic(profile, id)) flash('Trois tactiques au maximum : retirez-en une d\u2019abord.'); saveNow(); render(); }));
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
      const recovering = st.unlocked && st.recovery > 0;
      return `<div class="opcard ${st.unlocked ? '' : 'locked'} ${inSquad ? 'insquad' : ''} ${recovering ? 'recov' : ''} ${selected === o.id ? 'sel' : ''}" data-id="${o.id}">
        <div class="crow"><span class="role">${roleIcon[o.role]}</span><span class="cs">${esc(o.callsign)}</span><span class="rar r${o.rarity}">${RARITY_FR[o.rarity]}</span><span class="st">${recovering ? 'Convalescent' : st.unlocked ? 'Niv. ' + lvl : PRICES.operator[o.rarity] + ' cr.'}</span></div>
        <div class="cunit">${esc(o.unit)} — ${ROLES[o.role].name} · <span class="trait">${TRAITS[o.trait].name}</span></div>
        ${st.unlocked ? `<div class="xp" title="${st.xp} XP"><i style="width:${pct}%"></i></div>` : ''}
        <div class="crow small">${recovering ? `<button class="mini" data-act="treat" ${profile.credits >= Game.TREATMENT_PRICE ? '' : 'disabled'}>Soigner (${Game.TREATMENT_PRICE} cr.)</button>` : st.unlocked ? `<button class="mini ${inSquad ? 'on' : ''}" data-act="squad">${inSquad ? 'Dans l’escouade' : 'Ajouter'}</button>` : `<button class="mini" data-act="recruit" ${profile.credits >= PRICES.operator[o.rarity] ? '' : 'disabled'}>Recruter</button>`}<span>${recovering ? 'Indisponible une mission' : st.unlocked ? `${st.battles} bat. · ${st.kills} neutr.` : 'Verrouillé'}</span></div>
      </div>`;
    }).join('');
    el.querySelectorAll('.opcard').forEach(card => {
      card.addEventListener('click', (e) => {
        const id = card.dataset.id, act = e.target.dataset && e.target.dataset.act;
        if (act === 'squad') { if (!Game.toggleSquad(profile, id)) flash(profile.squad.length >= 5 ? 'L’escouade est déjà au complet (5).' : 'Impossible.'); }
        else if (act === 'recruit') { if (Game.recruit(profile, id)) flash(`${OPERATORS.find(o => o.id === id).callsign} rejoint l’unité.`); else flash('Crédits insuffisants.'); }
        else if (act === 'treat') { if (Game.treat(profile, id)) flash(`${OPERATORS.find(o => o.id === id).callsign} est de nouveau disponible.`); else flash('Crédits insuffisants.'); }
        selected = id; saveNow(); render();
      });
    });
  }

  function renderDetail() {
    const o = OPERATORS.find(x => x.id === selected); const st = profile.operators[o.id]; const def = Game.effectiveDef(profile, o.id);
    const role = ROLES[o.role];
    const stats = Game.STATS.map(k => `<div class="stat"><span>${STAT_FR[k]}</span><div class="sbar"><i style="width:${def[k]}%"></i>${def[k] > o[k] ? `<b style="left:${o[k]}%;width:${def[k] - o[k]}%"></b>` : ''}</div><span class="val">${def[k]}${def[k] > o[k] ? ` <small>(+${def[k] - o[k]})</small>` : ''}</span></div>`).join('');
    const w = WEAPONS[st.weaponId], a = ARMORS[st.armorId];
    $('#hqDetail').innerHTML = `
      <div class="dhead"><span class="role big">${roleIcon[o.role]}</span><div><div class="dname">${esc(o.callsign)} <small>${role.name} · ${RARITY_FR[o.rarity]}</small></div><div class="cunit">Inspiré du ${esc(o.unit)}</div></div><div class="lvl">Niveau ${def.level}<small>${Game.xpToNext(st.xp) === null ? 'maximum' : Game.xpToNext(st.xp) + ' XP avant le suivant'}</small></div></div>
      <div class="traitbox"><b>${TRAITS[o.trait].name}</b> — ${esc(TRAITS[o.trait].desc)}</div>
      <div class="stats">${stats}</div>
      ${st.unlocked ? `
      <div class="equip">
        <label>Arme <select id="selWeapon">${role.weapons.map(id => `<option value="${id}" ${id === st.weaponId ? 'selected' : ''} ${profile.inventory.weapons[id] ? '' : 'disabled'}>${WEAPONS[id].name}${profile.inventory.weapons[id] ? '' : ' (armurerie : ' + PRICES.weapon[id] + ' cr.)'}</option>`).join('')}</select></label>
        <div class="wspec">Dégâts ${w.damage} · portée ${w.range} m · ${w.rpm} c/min · chargeur ${w.mag} · rechargement ${w.reload} s · précision ${Math.round(w.accuracy * 100)} %${w.minRange ? ` · pénalisé sous ${w.minRange} m` : ''}</div>
        <label>Protection <select id="selArmor">${Object.values(ARMORS).map(ar => `<option value="${ar.id}" ${ar.id === st.armorId ? 'selected' : ''} ${profile.inventory.armors[ar.id] ? '' : 'disabled'}>${ar.name}</option>`).join('')}</select></label>
        <div class="wspec">Absorbe ${Math.round(a.torso * 100)} % au torse, ${Math.round(a.head * 100)} % à la tête · vitesse × ${a.mobility}</div>
        <label>Voie d’approche <select id="selLane">${[null, -1, 0, 1].map(l => `<option value="${l}" ${String(st.lane) === String(l) ? 'selected' : ''}>${LANE_FR[String(l)]}</option>`).join('')}</select></label>
        <div class="wspec">Nord et Sud contournent le bâtiment central ; Centre laisse l’opérateur choisir le chemin le plus court.</div>
      </div>` : `<p class="muted">Recrutez cet opérateur (${PRICES.operator[o.rarity]} crédits) pour l’équiper et l’engager.</p>`}`;
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
      slots.push(`<div class="slot ${selected === id ? 'sel' : ''}" data-id="${id}"><span class="role">${roleIcon[o.role]}</span><b>${esc(o.callsign)}</b><span class="muted">${WEAPONS[st.weaponId].name.split(' ')[0]} · ${LANE_FR[String(st.lane)]}</span></div>`);
    }
    el.innerHTML = slots.join('');
    el.querySelectorAll('.slot[data-id]').forEach(s => s.addEventListener('click', () => { selected = s.dataset.id; render(); }));
    $('#selOrder').value = profile.order;
    $('#launch').disabled = !Game.squadReady(profile);
    $('#launchHint').textContent = Game.squadReady(profile) ? `${profile.squad.length < 5 ? `Escouade réduite (${profile.squad.length}). ` : ''}${ORDERS[profile.order].desc}` : 'Il faut au moins 3 opérateurs disponibles pour lancer la mission.';
  }

  function renderMissions() {
    const el = $('#hqMissions');
    el.innerHTML = MISSIONS.map(m => {
      const done = profile.missions[m.id];
      return `<div class="mission ${selectedMission === m.id ? 'sel' : ''}" data-id="${m.id}">
        <div class="crow"><b>${esc(m.name)}</b><span class="diff">${'◆'.repeat(m.difficulty)}${'◇'.repeat(4 - m.difficulty)}</span></div>
        <div class="mdesc">${esc(m.desc)}</div>
        <div class="crow small"><span>${OT.MAPS[m.mapId].name} · ${m.objective === 'hold' ? `tenir ${m.duration} s` : 'neutraliser l’adversaire'}</span></div>
        <div class="crow small"><span>${DATA.FACTIONS.karst.name} : ${m.enemy.map(id => OPERATORS.find(o => o.id === id).callsign).join(', ')} (niv. ${m.level}, ${ORDERS[m.order].name}${m.enemyWeapons ? ', armes silencieuses' : ''})</span></div>
        <div class="crow small"><span>Récompense : ${m.reward} cr. · ${m.xp} XP de base</span><span>${done ? `${done.wins}/${done.attempts} réussie${done.wins > 1 ? 's' : ''}` : 'Jamais tentée'}</span></div>
      </div>`;
    }).join('');
    el.querySelectorAll('.mission').forEach(m => m.addEventListener('click', () => { selectedMission = m.dataset.id; renderMissions(); renderDeploy(); }));
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
    el.innerHTML = `<b class="${r.won ? 'good' : r.draw ? '' : 'bad'}">${r.won ? 'Mission réussie' : r.draw ? 'Mission indécise' : 'Mission échouée'}</b> — ${r.mission}. Crédits : +${r.credits}. Expérience : ${Object.entries(r.xp).map(([id, v]) => `${OPERATORS.find(o => o.id === id).callsign} +${v}`).join(', ')}.${r.levelUps.length ? ' Promotions : ' + r.levelUps.map(l => `${l.callsign} → niveau ${l.level}`).join(', ') + '.' : ''}${r.recovering && r.recovering.length ? ` <span class="bad">Évacués, indisponibles pour la prochaine mission : ${r.recovering.join(', ')}.</span>` : ''}${r.playerXp ? ` Rang : +${r.playerXp} XP${r.rankUp ? ` — <b class="good">promu ${esc(r.rankUp)}</b>` : ''}.` : ''}${r.challenges && r.challenges.length ? ` <span class="good">Défi${r.challenges.length > 1 ? 's' : ''} accompli${r.challenges.length > 1 ? 's' : ''} : ${r.challenges.map(c => `${c.name} (+${c.reward} cr.)`).join(', ')}.</span>` : ''}`;
  }

  let flashTimer = null;
  function flash(msg) { const el = $('#flash'); el.textContent = msg; el.classList.remove('hidden'); clearTimeout(flashTimer); flashTimer = setTimeout(() => el.classList.add('hidden'), 2600); }

  // ---- Lien avec la bataille --------------------------------------------------------------------
  $('#selOrder').addEventListener('change', (e) => { profile.order = e.target.value; saveNow(); renderSquad(); });
  $('#selFormation').addEventListener('change', (e) => { if (e.target.value) { Game.applyFormation(profile, e.target.value); saveNow(); render(); e.target.value = ''; } });
  $('#launch').addEventListener('click', () => {
    if (!Game.squadReady(profile)) return;
    const mission = MISSIONS.find(m => m.id === selectedMission);
    const seed = Math.floor(Math.random() * 1000000);
    profile.lastSeed = seed; saveNow();
    window.HQ.onLaunch(Game.battleOptions(profile, mission, seed), mission);
  });
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
    show() { switchTo(true); showTab('accueil'); },
    hide() { switchTo(false); },
    // appelé par app.js à la fin d'une bataille de mission : applique les récompenses au profil et sauvegarde
    finishMission(mission, result) {
      const r = Game.applyRewards(profile, mission, result);
      lastRewards = Object.assign({ mission: mission.name }, r);
      saveNow();
      return r;
    },
    profile: () => profile, storageAvailable: () => !!storage,
    onLaunch: null,
  };
  if (!storage) flash('Sauvegarde locale indisponible dans ce navigateur : la progression ne sera pas conservée.');
  render();
})();
