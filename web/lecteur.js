/* Lecteur de bruitages pour un jeu web (à coller dans la page).
   Les sons sont des .ogg (Opus) en base64 dans <script type="text/plain" id="sons-data">{"nom":["b64", …], …}<\/script>
   (voir integrer.py), décodés une seule fois au premier geste (clic / touche), puis joués avec Son.jouer("nom", options).
   - plusieurs variantes par son, jamais deux fois la même d'affilée ;
   - options : vol, pan (−1…1), vitesse (hauteur), varie (petite variation de hauteur, ex. .03), delai (s), reverb (0…1) ;
   - limiteur en sortie : pas de saturation quand beaucoup de sons s'additionnent. */
const Son = (() => {
  let ac = null, master = null, rev = null, loading = null; const buf = {}, last = {};
  function init(){
    if(ac){ if(ac.state === "suspended") ac.resume().catch(() => {}); return true; }
    try{
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); const lim = ac.createDynamicsCompressor();
      lim.threshold.value = -3; lim.knee.value = 3; lim.ratio.value = 20; lim.attack.value = .001; lim.release.value = .12;
      master.connect(lim).connect(ac.destination); charger(); return true;
    }catch(e){ ac = null; return false; }
  }
  function charger(){
    if(loading || !ac) return loading; const el = document.getElementById("sons-data"); if(!el) return null;
    let data; try{ data = JSON.parse(el.textContent); }catch(e){ return null; }
    const dec = b64 => { const s = atob(b64), u = new Uint8Array(s.length); for(let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
      return new Promise(res => ac.decodeAudioData(u.buffer, res, () => res(null))); };
    loading = Promise.all(Object.entries(data).map(([k, arr]) => Promise.all(arr.map(dec)).then(bs => { const ok = bs.filter(Boolean); if(ok.length) buf[k] = ok; })));
    return loading;
  }
  function reverb(){   // petite réverbération de pièce, fabriquée une fois
    if(rev) return rev; const len = Math.floor(ac.sampleRate*1.6), ir = ac.createBuffer(2, len, ac.sampleRate);
    for(let c = 0; c < 2; c++){ const d = ir.getChannelData(c); for(let i = 0; i < len; i++) d[i] = (Math.random()*2 - 1)*Math.pow(1 - i/len, 3); }
    const cv = ac.createConvolver(); cv.buffer = ir; const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3500; const g = ac.createGain(); g.gain.value = .5;
    cv.connect(lp).connect(g).connect(master); return rev = cv;
  }
  function jouer(nom, o = {}){
    if(!init()) return false; const L = buf[nom]; if(!L) return false;
    let i = o.variante != null ? o.variante % L.length : Math.floor(Math.random()*L.length); if(o.variante == null && L.length > 1 && i === last[nom]) i = (i + 1) % L.length; last[nom] = i;
    const src = ac.createBufferSource(); src.buffer = L[i]; src.playbackRate.value = (o.vitesse || 1)*(o.varie ? 1 + (Math.random()*2 - 1)*o.varie : 1);
    const g = ac.createGain(); g.gain.value = o.vol == null ? 1 : o.vol; src.connect(g); let out = g;
    if(o.pan){ const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); g.connect(p); out = p; }
    out.connect(master); if(o.reverb){ const s = ac.createGain(); s.gain.value = o.reverb; out.connect(s); s.connect(reverb()); }
    src.start(ac.currentTime + .003 + (o.delai || 0)); return true;
  }
  ["pointerdown", "keydown"].forEach(ev => document.addEventListener(ev, function f(){ document.removeEventListener(ev, f, true); init(); }, true));
  // boucle d'ambiance : une seule à la fois, fondu entre deux, arrêt en fondu
  let loop = null;
  async function boucle(nom, o = {}){
    if(!init()) return false; if(loading) await loading; const L = buf[nom];
    if(loop && loop.nom === nom) return true;
    arreterBoucle(.8);
    if(!nom || !L) return false;
    const src = ac.createBufferSource(); src.buffer = L[0]; src.loop = true; const g = ac.createGain(); g.gain.value = 0; src.connect(g).connect(master); src.start();
    g.gain.linearRampToValueAtTime(o.vol == null ? 1 : o.vol, ac.currentTime + 1.2);
    loop = {nom, src, g}; return true;
  }
  function arreterBoucle(fondu = .6){ if(!loop) return; const {src, g} = loop; loop = null; try{ g.gain.linearRampToValueAtTime(0, ac.currentTime + fondu); src.stop(ac.currentTime + fondu + .05); }catch(e){} }
  return {init, jouer, charger, boucle, arreterBoucle, get pret(){ return !!loading; }, volume(v){ if(master) master.gain.value = v; }};
})();
window.Son = Son;
