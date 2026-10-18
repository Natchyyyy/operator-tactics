// Chargeur de la page publiée (dist/index.html, docs/index.html, dist/artifact.html) : la page ne contient que l'interface
// (HTML + CSS) ; three.js, les modèles 3D, les sons et les scripts du jeu sont des fichiers à part (dossier p/), téléchargés
// en parallèle avec une barre de progression sur l'écran titre, puis exécutés dans l'ordre. build.js remplace MANIFESTE.
// Fichiers requis : en cas d'échec, message clair en français. Fichiers optionnels (sons, moteur physique) : on continue sans.
// file:// ou injection de script refusée par la page : repli sur des <script src> ordinaires (progression par fichier).
(function () {
  const M = /*MANIFESTE*/null, doc = document, t0 = performance.now();
  const total = M.parties.reduce((s, p) => s + p.o, 0), recu = M.parties.map(() => 0);
  let execs = 0, fini = false;
  doc.documentElement.classList.add('ot-charge');
  // barre de progression à la place des boutons de l'écran titre (ou en bas de page si l'écran titre manque)
  const boite = doc.createElement('div'); boite.id = 'otCharge';
  boite.innerHTML = '<div class="ocBar"><i></i></div><div class="ocTxt">Chargement…</div>';
  const hote = doc.querySelector('#title .titleBox'), btns = hote && hote.querySelector('.titleBtns');
  if (btns) hote.insertBefore(boite, btns); else { boite.classList.add('flottant'); doc.body.appendChild(boite); }
  const barre = boite.querySelector('i'), txt = boite.querySelector('.ocTxt');
  const mo = (n) => (n / 1048576).toFixed(1).replace('.', ',');
  let majPrevue = 0;   // la barre est redessinée au plus 10 fois par seconde (chaque repeinte coûte, surtout en rendu logiciel)
  function maj(force) {
    if (fini) return; if (!force) { if (!majPrevue) majPrevue = setTimeout(() => { majPrevue = 0; maj(true); }, 100); return; } const r = recu.reduce((a, b) => a + b, 0), f = Math.min(1, 0.9 * r / total + 0.1 * execs / M.parties.length);
    barre.style.width = (f * 100).toFixed(1) + '%';
    txt.textContent = r < total ? `Chargement… ${mo(r)} / ${mo(total)} Mo` : 'Préparation du jeu…';
  }
  function echec(p, pourquoi) {
    fini = true; boite.classList.add('erreur'); barre.style.width = '100%';
    txt.textContent = `Le jeu n'a pas pu se charger : le fichier « ${p.f} » est ${pourquoi}. Vérifiez la connexion puis rechargez la page.` +
      (location.protocol === 'file:' ? ' Hors ligne, ouvrez plutôt complet.html (le jeu en un seul fichier).' : '');
    console.error('Chargeur : échec de ' + p.f + ' (' + pourquoi + ')');
  }
  function termine(mode) {
    fini = true; doc.documentElement.classList.remove('ot-charge'); boite.remove();
    window.OT_CHARGEMENT = { ms: Math.round(performance.now() - t0), octets: total, fichiers: M.parties.length, mode, version: M.version, detail };
    console.info('Chargeur : ' + M.parties.length + ' fichiers, ' + mo(total) + ' Mo en ' + window.OT_CHARGEMENT.ms + ' ms (' + mode + ')');
  }
  const detail = M.parties.map(p => ({ f: p.f }));   // mesures : fin du téléchargement et durée d'exécution de chaque fichier (ms)
  const url = (p, v) => p.f + (v ? '?v=' + p.v : '');
  // l'injection de scripts en ligne est-elle permise (politique de sécurité de la page) ?
  function injectionOk() { try { window.__otSonde = 0; const s = doc.createElement('script'); s.text = 'window.__otSonde=1'; doc.body.appendChild(s); s.remove(); return window.__otSonde === 1; } catch (e) { return false; } }

  // ---- mode normal : fetch en parallèle avec progression, exécution dans l'ordre dès que le fichier précédent est passé
  async function telecharger(p, i) {
    for (const v of [true, false]) {   // avec le numéro de version (cache) puis sans, au cas où l'hébergeur refuserait la requête
      try {
        const r = await fetch(url(p, v)); if (!r.ok || /text\/html/.test(r.headers.get('content-type') || '')) continue;
        if (!r.body || !r.body.getReader) { const t = await r.text(); recu[i] = p.o; maj(); return t; }
        const lect = r.body.getReader(), morceaux = []; let n = 0;
        for (;;) { const { done, value } = await lect.read(); if (done) break; morceaux.push(value); n += value.length; recu[i] = Math.min(n, p.o); maj(); }
        const tout = new Uint8Array(n); let k = 0; for (const m of morceaux) { tout.set(m, k); k += m.length; }
        recu[i] = p.o; maj(); detail[i].recu = Math.round(performance.now() - t0); return new TextDecoder().decode(tout);
      } catch (e) { /* essai suivant */ }
    }
    return null;
  }
  function executer(code, nom) { const s = doc.createElement('script'); s.text = code + '\n//# sourceURL=' + nom; doc.body.appendChild(s); s.remove(); }
  async function modeFetch() {
    const textes = M.parties.map((p, i) => telecharger(p, i));
    for (let i = 0; i < M.parties.length; i++) {
      const p = M.parties[i], t = await textes[i];
      if (t == null) { if (p.opt) { console.warn('Chargeur : ' + p.f + ' indisponible, on continue sans'); execs++; continue; } return echec(p, 'introuvable ou interrompu'); }
      const te = performance.now();
      if (p.decoupe) {   // paquet du jeu : chaque script d'origine est exécuté à part (une erreur dans l'un n'arrête pas les autres)
        const parts = t.split(/\n;\/\/@@OT (\S+)@@\n/);
        detail[i].lents = {};   // scripts dont l'exécution dépasse 100 ms (initialisation du jeu)
        for (let k = 1; k < parts.length; k += 2) { const t1 = performance.now(); executer(parts[k + 1], 'ot/' + parts[k]); const d = performance.now() - t1; if (d > 100) detail[i].lents[parts[k]] = Math.round(d); }
      } else executer(t, 'ot/' + p.f);
      detail[i].exec = Math.round(performance.now() - te); execs++; maj();
      if (i < M.parties.length - 1) await new Promise(r => setTimeout(r, 0));   // laisse la page respirer (barre de progression) entre deux gros fichiers
    }
    termine('fetch');
  }
  // ---- repli : <script src> dans l'ordre (async = false), progression à la fin de chaque fichier
  function modeSrc() {
    let reste = M.parties.length;
    M.parties.forEach((p, i) => {
      const s = doc.createElement('script'); s.src = url(p, location.protocol !== 'file:'); s.async = false;
      s.onload = () => { recu[i] = p.o; execs++; maj(); if (--reste === 0 && !fini) termine('src'); };
      s.onerror = () => { if (p.opt) { recu[i] = p.o; execs++; if (--reste === 0 && !fini) termine('src'); } else if (!fini) echec(p, 'introuvable'); };
      doc.body.appendChild(s);
    });
  }
  maj(true);
  if (location.protocol !== 'file:' && window.fetch && window.TextDecoder && injectionOk()) modeFetch().catch((e) => { console.error(e); echec({ f: 'p/' }, 'illisible'); });
  else modeSrc();
})();
