// Quartier général : collection, escouade, équipement, formation, missions, récompenses, sauvegarde.
// Toute la logique vient de sim/game.js ; ce fichier affiche le profil et relaie les actions.
(function () {
  const OT = window.OT; const { Game, DATA } = OT;
  const { WEAPONS, ARMORS, ROLES, OPERATORS, ORDERS, MISSIONS, PRICES, TRAITS } = DATA;
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

  function render() {
    $('#credits').textContent = profile.credits;
    const c = profile.career;
    $('#career').textContent = `${c.battles} bataille${c.battles > 1 ? 's' : ''} · ${c.wins} victoire${c.wins > 1 ? 's' : ''} · ${c.kills} neutralisation${c.kills > 1 ? 's' : ''} · ${c.losses_units} opérateur${c.losses_units > 1 ? 's' : ''} évacué${c.losses_units > 1 ? 's' : ''}`;
    renderRoster(); renderDetail(); renderSquad(); renderMissions(); renderArmory(); renderRewards();
  }

  function renderRoster() {
    const el = $('#hqRoster');
    el.innerHTML = OPERATORS.map(o => {
      const st = profile.operators[o.id]; const lvl = Game.levelFor(st.xp); const next = Game.xpToNext(st.xp);
      const inSquad = profile.squad.includes(o.id);
      const pct = next === null ? 100 : Math.round(100 * (st.xp - DATA.XP_TABLE[lvl]) / (DATA.XP_TABLE[lvl + 1] - DATA.XP_TABLE[lvl]));
      return `<div class="opcard ${st.unlocked ? '' : 'locked'} ${inSquad ? 'insquad' : ''} ${selected === o.id ? 'sel' : ''}" data-id="${o.id}">
        <div class="crow"><span class="role">${roleIcon[o.role]}</span><span class="cs">${esc(o.callsign)}</span><span class="rar r${o.rarity}">${RARITY_FR[o.rarity]}</span><span class="st">${st.unlocked ? 'Niv. ' + lvl : PRICES.operator[o.rarity] + ' cr.'}</span></div>
        <div class="cunit">${esc(o.unit)} — ${ROLES[o.role].name} · <span class="trait">${TRAITS[o.trait].name}</span></div>
        ${st.unlocked ? `<div class="xp" title="${st.xp} XP"><i style="width:${pct}%"></i></div>` : ''}
        <div class="crow small">${st.unlocked ? `<button class="mini ${inSquad ? 'on' : ''}" data-act="squad">${inSquad ? 'Dans l’escouade' : 'Ajouter'}</button>` : `<button class="mini" data-act="recruit" ${profile.credits >= PRICES.operator[o.rarity] ? '' : 'disabled'}>Recruter</button>`}<span>${st.unlocked ? `${st.battles} bat. · ${st.kills} neutr.` : 'Verrouillé'}</span></div>
      </div>`;
    }).join('');
    el.querySelectorAll('.opcard').forEach(card => {
      card.addEventListener('click', (e) => {
        const id = card.dataset.id, act = e.target.dataset && e.target.dataset.act;
        if (act === 'squad') { if (!Game.toggleSquad(profile, id)) flash(profile.squad.length >= 5 ? 'L’escouade est déjà au complet (5).' : 'Impossible.'); }
        else if (act === 'recruit') { if (Game.recruit(profile, id)) flash(`${OPERATORS.find(o => o.id === id).callsign} rejoint l’unité.`); else flash('Crédits insuffisants.'); }
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
    $('#launchHint').textContent = Game.squadReady(profile) ? `${ORDERS[profile.order].desc}` : 'Complétez l’escouade (5 opérateurs) pour lancer la mission.';
  }

  function renderMissions() {
    const el = $('#hqMissions');
    el.innerHTML = MISSIONS.map(m => {
      const done = profile.missions[m.id];
      return `<div class="mission ${selectedMission === m.id ? 'sel' : ''}" data-id="${m.id}">
        <div class="crow"><b>${esc(m.name)}</b><span class="diff">${'◆'.repeat(m.difficulty)}${'◇'.repeat(4 - m.difficulty)}</span></div>
        <div class="mdesc">${esc(m.desc)}</div>
        <div class="crow small"><span>${OT.MAPS[m.mapId].name} · ${m.objective === 'hold' ? `tenir ${m.duration} s` : 'neutraliser l’adversaire'}</span></div>
        <div class="crow small"><span>Ennemi : ${m.enemy.map(id => OPERATORS.find(o => o.id === id).callsign).join(', ')} (niv. ${m.level}, ${ORDERS[m.order].name}${m.enemyWeapons ? ', armes silencieuses' : ''})</span></div>
        <div class="crow small"><span>Récompense : ${m.reward} cr. · ${m.xp} XP de base</span><span>${done ? `${done.wins}/${done.attempts} réussie${done.wins > 1 ? 's' : ''}` : 'Jamais tentée'}</span></div>
      </div>`;
    }).join('');
    el.querySelectorAll('.mission').forEach(m => m.addEventListener('click', () => { selectedMission = m.dataset.id; renderMissions(); }));
  }

  function renderArmory() {
    const el = $('#hqArmory');
    const items = Object.values(WEAPONS).filter(w => !profile.inventory.weapons[w.id]);
    if (!items.length) { el.innerHTML = '<div class="muted" style="font-size:12px">Toutes les armes sont disponibles.</div>'; return; }
    el.innerHTML = items.map(w => `<div class="armo"><div><b>${esc(w.name)}</b><div class="wspec">Dégâts ${w.damage} · portée ${w.range} m · ${w.rpm} c/min · chargeur ${w.mag}${w.silenced ? ' · silencieux : presque inaudible au-delà de 18 m' : ''}</div></div><button class="mini" data-w="${w.id}" ${profile.credits >= PRICES.weapon[w.id] ? '' : 'disabled'}>${PRICES.weapon[w.id]} cr.</button></div>`).join('');
    el.querySelectorAll('button[data-w]').forEach(b => b.addEventListener('click', () => { if (Game.buyWeapon(profile, b.dataset.w)) { flash(`${WEAPONS[b.dataset.w].name} ajouté à l’armurerie.`); saveNow(); render(); } }));
  }
  function renderRewards() {
    const el = $('#hqRewards');
    if (!lastRewards) { el.classList.add('hidden'); return; }
    const r = lastRewards;
    el.classList.remove('hidden');
    el.innerHTML = `<b class="${r.won ? 'good' : r.draw ? '' : 'bad'}">${r.won ? 'Mission réussie' : r.draw ? 'Mission indécise' : 'Mission échouée'}</b> — ${r.mission}. Crédits : +${r.credits}. Expérience : ${Object.entries(r.xp).map(([id, v]) => `${OPERATORS.find(o => o.id === id).callsign} +${v}`).join(', ')}.${r.levelUps.length ? ' Promotions : ' + r.levelUps.map(l => `${l.callsign} → niveau ${l.level}`).join(', ') + '.' : ''}`;
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

  window.HQ = {
    show() { $('#hq').classList.remove('hidden'); $('#app').classList.add('hidden'); render(); },
    hide() { $('#hq').classList.add('hidden'); $('#app').classList.remove('hidden'); },
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
