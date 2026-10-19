(function(){
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const KEYS = ['KeyW','KeyA','KeyS','KeyD','ShiftLeft']; window.SANS_RENDU = true;
  let t = 0, prochain = 0;
  while (t < 20) { if (t >= prochain) { const k = {}; KEYS.forEach(n => { if (rnd() < 0.4) k[n] = 1; }); if (rnd() < 0.3) API.set({ visee: !__MM.Ctl.visee }); API.touches(k); prochain = t + 0.5 + rnd() * 1.5; } API.step(1, 1/60); t += 1/60; }
  API.touches({}); API.set({visee:true}); const out = [];
  for (let s = 0; s < 10; s++) { API.step(60, 1/60); const m = API.mesures(); out.push([s + 1, m.seq.replace('.bvh',''), +m.vitAnim.toFixed(2), m.pos.map(x => +x.toFixed(2)), +__MM.Ctl.vel.length().toFixed(2), m.sauts, __MM.frame, __MM.Base.repos[__MM.frame]]); }
  window.SANS_RENDU = false; return JSON.stringify({ visee: __MM.Ctl.visee, out });
})()
