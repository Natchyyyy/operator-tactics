/* Lecteur de bruitages pour un jeu web (à coller dans la page).
   Les sons sont des .ogg (Opus) en base64 dans <script type="text/plain" id="sons-data">{"nom":["b64", …], …}<\/script>
   (voir integrer.py), décodés une seule fois au premier geste (clic / touche), puis joués avec Son.jouer("nom", options).
   Ensuite, un paquet complémentaire hd/sons_hd.json (même format : longues ambiances, plus de variantes) est chargé s'il
   existe ; ses sons remplacent ou complètent ceux de la page (sans paquet : tout marche avec les sons inclus).
   - plusieurs variantes par son, jamais deux fois la même d'affilée ;
   - options : vol, pan (−1…1), vitesse (hauteur), varie (petite variation de hauteur, ex. .03), delai (s), reverb (0…1,
     petite pièce), ext (0…1 : réverbération de plein air entre les bâtiments), filtre (Hz : passe-bas, distance / obstacle),
     echo ({t: s, g: gain, f: Hz} : écho d'un mur proche) ;
   - limiteur en sortie : pas de saturation quand beaucoup de sons s'additionnent. */
const Son = (() => {
  let lim = null, an = null, ac = null, master = null, rev = null, revExt = null, loading = null, pack = "absent", erreur = null, decodes = 0, echecs = 0; const buf = {}, last = {}, joues = {};
  const PACK = (typeof window !== "undefined" && window.OT_SONS_HD) || "hd/sons_hd.json";
  function init(){
    if(ac){ if(ac.state === "suspended") ac.resume().catch(() => {}); if(!loading) charger(); return true; }   // (données des sons pas encore dans la page au premier appel : on réessaie)
    try{
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); lim = ac.createDynamicsCompressor();
      lim.threshold.value = -3; lim.knee.value = 3; lim.ratio.value = 20; lim.attack.value = .001; lim.release.value = .12;
      master.connect(lim).connect(ac.destination); charger(); return true;
    }catch(e){ ac = null; erreur = String(e && e.message || e); console.warn("Son : contexte audio impossible", e); return false; }
  }
  function decoder(data){
    const dec = b64 => { let u; try{ const s = atob(b64); u = new Uint8Array(s.length); for(let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); }catch(e){ echecs++; return Promise.resolve(null); }
      return new Promise(res => ac.decodeAudioData(u.buffer, (b) => { decodes++; res(b); }, (e) => { echecs++; erreur = "décodage : " + (e && e.message || e); res(null); })); };
    return Promise.all(Object.entries(data).map(([k, arr]) => Promise.all(arr.map(dec)).then(bs => { const ok = bs.filter(Boolean); if(ok.length) buf[k] = ok; })));
  }
  function charger(){
    if(loading || !ac) return loading; const el = document.getElementById("sons-data"); if(!el) return null;
    let data; try{ data = JSON.parse(el.textContent); }catch(e){ return null; }
    loading = decoder(data); loading.then(chargerPack); return loading;
  }
  // paquet complémentaire : après les sons de la page ; absent, page d'erreur HTML ou file:// → on garde les sons inclus
  function chargerPack(){
    if(pack !== "absent" || typeof fetch === "undefined" || location.protocol === "file:") return; pack = "chargement";
    fetch(PACK).then(r => r.ok && !/text\/html/.test(r.headers.get("content-type") || "") ? r.json() : null).then(d => {
      if(!d || typeof d !== "object"){ pack = "indisponible"; return; }
      return decoder(d).then(() => { pack = "chargé"; for(const v in voulu) if(voulu[v]) boucle(voulu[v].nom, Object.assign({}, voulu[v].o, {voie: v, fondu: 2.5, remplace: true})); });
    }).catch(() => { pack = "indisponible"; });
  }
  function reverb(){   // petite réverbération de pièce, fabriquée une fois
    if(rev) return rev; const len = Math.floor(ac.sampleRate*1.6), ir = ac.createBuffer(2, len, ac.sampleRate);
    for(let c = 0; c < 2; c++){ const d = ir.getChannelData(c); for(let i = 0; i < len; i++) d[i] = (Math.random()*2 - 1)*Math.pow(1 - i/len, 3); }
    const cv = ac.createConvolver(); cv.buffer = ir; const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3500; const g = ac.createGain(); g.gain.value = .5;
    cv.connect(lp).connect(g).connect(master); return rev = cv;
  }
  // plein air en ville : échos épars des façades (30 à 400 ms) puis queue diffuse qui s'assombrit (≈ 2 s)
  function reverbExt(){
    if(revExt) return revExt; const sr = ac.sampleRate, len = Math.floor(sr*2.4), ir = ac.createBuffer(2, len, sr);
    let seed = 7; const rnd = () => (seed = (seed*16807) % 2147483647)/2147483647;
    for(let c = 0; c < 2; c++){ const d = ir.getChannelData(c);
      for(let k = 0; k < 14; k++){ const t = .03 + Math.pow(rnd(), 1.4)*.37, a = (.5 + .5*rnd())*Math.exp(-t*4)*(rnd() < .5 ? -1 : 1), i0 = Math.floor(t*sr), w = Math.floor(sr*.004);
        for(let j = 0; j < w && i0 + j < len; j++) d[i0 + j] += a*Math.sin(Math.PI*j/w)*(rnd()*2 - 1); }
      let lpv = 0; for(let i = Math.floor(sr*.06); i < len; i++){ const t = i/sr, k = Math.min(.9, .25 + t*.4); lpv = lpv*k + (rnd()*2 - 1)*(1 - k); d[i] += lpv*.22*Math.exp(-t*3.2)*Math.min(1, (t - .06)/.08); } }
    const cv = ac.createConvolver(); cv.buffer = ir; const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2600; const hp = ac.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 120;
    const g = ac.createGain(); g.gain.value = .8; cv.connect(hp).connect(lp).connect(g).connect(master); return revExt = cv;
  }
  function jouer(nom, o = {}){
    if(!init()) return false; const L = buf[nom]; if(!L) return false;
    let i = o.variante != null ? o.variante % L.length : Math.floor(Math.random()*L.length); if(o.variante == null && L.length > 1 && i === last[nom]) i = (i + 1) % L.length; last[nom] = i;
    const src = ac.createBufferSource(); src.buffer = L[i]; src.playbackRate.value = (o.vitesse || 1)*(o.varie ? 1 + (Math.random()*2 - 1)*o.varie : 1);
    let n = src;
    if(o.filtre && o.filtre < 18000){ const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = Math.max(200, o.filtre); f.Q.value = .5; n.connect(f); n = f; }
    const g = ac.createGain(); g.gain.value = o.vol == null ? 1 : o.vol; n.connect(g); let out = g;
    if(o.pan){ const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); g.connect(p); out = p; }
    out.connect(master);
    if(o.reverb){ const s = ac.createGain(); s.gain.value = o.reverb; out.connect(s); s.connect(reverb()); }
    if(o.ext){ const s = ac.createGain(); s.gain.value = o.ext; g.connect(s); s.connect(reverbExt()); }
    if(o.echo && o.echo.g > 0){   // écho d'une façade : retardé, plus sourd, de l'autre côté
      const dl = ac.createDelay(1.5); dl.delayTime.value = Math.min(1.4, o.echo.t || .1); const eg = ac.createGain(); eg.gain.value = o.echo.g;
      const ef = ac.createBiquadFilter(); ef.type = "lowpass"; ef.frequency.value = o.echo.f || 2500; const ep = ac.createStereoPanner(); ep.pan.value = Math.max(-1, Math.min(1, -(o.pan || 0)*.6));
      g.connect(dl).connect(ef).connect(eg).connect(ep).connect(master); }
    src.start(ac.currentTime + .003 + (o.delai || 0)); joues[nom] = (joues[nom] || 0) + 1; return true;
  }
  // déverrouillage : à CHAQUE geste tant que le contexte n'est pas « running » (certains cadres — artifact, iframe — ne le
  // laissent démarrer qu'au deuxième geste ou le suspendent quand l'onglet passe en arrière-plan) ; un son muet d'un
  // échantillon, joué pendant le geste, achève de le débloquer.
  let muet = false;
  function debloquer(){
    if(!init()) return;
    if(ac.state !== "running") ac.resume().catch(e => { erreur = "reprise : " + (e && e.message || e); });
    if(!muet){ try{ const b = ac.createBuffer(1, 1, 22050), s = ac.createBufferSource(); s.buffer = b; s.connect(ac.destination); s.start(0); muet = true; }catch(e){} }
  }
  ["pointerdown", "pointerup", "keydown", "touchend", "click"].forEach(ev => document.addEventListener(ev, () => { if(!ac || ac.state !== "running") debloquer(); }, true));
  // boucles : plusieurs voies indépendantes (ambiance, météo, musique…), une boucle par voie, fondu entre deux.
  // Une boucle demandée dont le son n'est pas (encore) là est retenue : elle démarre quand le paquet complémentaire arrive.
  // o.secours : nom d'un son inclus à jouer en attendant (ex. « pluie_courte » avant « pluie »).
  const loops = {}, voulu = {};
  async function boucle(nom, o = {}){
    const voie = o.voie || "ambiance";
    if(!init()) return false; voulu[voie] = nom ? {nom, o} : null; if(loading) await loading;
    if(nom && (!voulu[voie] || voulu[voie].nom !== nom)) return false;   // une autre demande (ou un arrêt) est passée entre-temps
    const nomJoue = buf[nom] ? nom : (o.secours && buf[o.secours] ? o.secours : null), L = nomJoue && buf[nomJoue];
    if(loops[voie] && loops[voie].nom === nomJoue && !(o.remplace && loops[voie].buf !== L[0])){ volumeBoucle(voie, o.vol == null ? 1 : o.vol, .8); return true; }
    arreterBoucle(o.remplace ? 2.5 : .8, voie, true);
    if(!nom || !L) return false;
    const src = ac.createBufferSource(); src.buffer = L[0]; src.loop = true; const g = ac.createGain(); g.gain.setValueAtTime(0, ac.currentTime); src.connect(g).connect(master);
    src.start(ac.currentTime, Math.random()*L[0].duration*.9);   // départ au hasard dans la boucle : jamais le même début
    g.gain.linearRampToValueAtTime(o.vol == null ? 1 : o.vol, ac.currentTime + (o.fondu || 1.2));
    loops[voie] = {nom: nomJoue, src, g, buf: L[0]}; return true;
  }
  function arreterBoucle(fondu = .6, voie, garder){ const keys = voie ? [voie] : Object.keys(loops); for(const k of keys){ if(!garder) voulu[k] = null; const l = loops[k]; if(!l) continue; delete loops[k];
    try{ const t = ac.currentTime; l.g.gain.cancelScheduledValues(t); l.g.gain.setValueAtTime(l.g.gain.value, t); l.g.gain.linearRampToValueAtTime(0, t + fondu); l.src.stop(t + fondu + .05); }catch(e){} } }
  function volumeBoucle(voie, v, t = .5){ const l = loops[voie]; if(l) try{ const n = ac.currentTime; l.g.gain.cancelScheduledValues(n); l.g.gain.setValueAtTime(l.g.gain.value, n); l.g.gain.linearRampToValueAtTime(v, n + t); }catch(e){} }
  // état pour le diagnostic (réglages) : contexte, sons décodés, échecs, paquet complémentaire, sons joués, boucles
  function etat(){ return { contexte: ac ? ac.state : "absent", sons: Object.keys(buf).length, decodes, echecs, erreur, pack, volume: master ? master.gain.value : null, joues: Object.assign({}, joues),
    boucles: Object.fromEntries(Object.entries(loops).map(([k, l]) => [k, l.nom])) }; }
  // mesure de la sortie (diagnostic, tests) : crête et niveau efficace des 43 dernières ms, réduction du limiteur (dB)
  function mesure(){ if(!ac) return null; if(!an){ an = ac.createAnalyser(); an.fftSize = 2048; lim.connect(an); }
    const d = new Float32Array(an.fftSize); an.getFloatTimeDomainData(d); let p = 0, e = 0; for(const v of d){ p = Math.max(p, Math.abs(v)); e += v*v; }
    return { crete: 20*Math.log10(p + 1e-9), rms: 10*Math.log10(e/d.length + 1e-12), reduction: lim.reduction && lim.reduction.value !== undefined ? lim.reduction.value : lim.reduction }; }
  return {init, jouer, mesure, charger, boucle, arreterBoucle, volumeBoucle, etat, debloquer, a: (nom) => !!buf[nom], get pret(){ return !!loading; }, volume(v){ if(master) master.gain.value = v; }};
})();
window.Son = Son;
