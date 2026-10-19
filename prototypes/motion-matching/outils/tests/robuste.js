(function(){
  // test de robustesse : 90 s simulées à 60 Hz, entrées aléatoires changées toutes les 0,5-2 s, caméra qui tourne
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const KEYS = ['KeyW','KeyA','KeyS','KeyD','ShiftLeft'];
  const stats = { pas: 0, nan: 0, mainDmax: 0, mainGmax: 0, orteilMax: 0, vyMax: 0, sauts0: __MM.sauts, derive: 0, maxEcartSim: 0, bascules: 0, pires: [] };
  let t = 0, prochain = 0, prevToes = null, prevT = 0;
  const S = __MM.soldat, V = (a) => new THREE.Vector3().fromArray(a); const facteur = () => (__MM.facteurRacine ?? -1);
  window.SANS_RENDU = true;
  while (t < 90) {
    if (t >= prochain) {
      const k = {}; KEYS.forEach(n => { if (rnd() < 0.4) k[n] = 1; });
      if (rnd() < 0.3) { API.set({ visee: !__MM.Ctl.visee }); stats.bascules++; }
      __MM.Ctl.verrouRegard = rnd() < 0.25;
      API.touches(k); prochain = t + 0.5 + rnd() * 1.5;
    }
    __MM.Ctl.camYaw += (rnd() - 0.5) * 0.3;
    API.step(1, 1/60); t += 1/60; stats.pas++;
    const m = API.mesures();
    if (!isFinite(m.pos[0]) || !isFinite(m.yaw) || m.pos.some(x => !isFinite(x))) { stats.nan++; break; }
    if (__MM.Ctl.visee && S.prise) {
      const dD = S.mains.D[2].getWorldPosition(new THREE.Vector3()).distanceTo(S.fusil.position.clone().add(S.prise.D.pos.clone().applyQuaternion(S.fusilQ)));
      if (dD > stats.mainDmax) { stats.mainDmax = dD; }
      if (dD > 0.01) stats.pires.push(['mainD', +t.toFixed(1), +dD.toFixed(3), m.seq]);
    }
    const toes = S.orteils.map(o => o.getWorldPosition(new THREE.Vector3()));
    for (const p of toes) { if (p.y > stats.orteilMax) stats.orteilMax = p.y; if (p.y > 0.22) stats.pires.push(["orteil", +t.toFixed(2), +p.y.toFixed(2), m.seq, +facteur()]); }
    if (prevToes) toes.forEach((p, i) => { const vy = Math.abs(p.y - prevToes[i].y) * 60; if (vy > stats.vyMax) stats.vyMax = vy; if (vy > 2.5) stats.pires.push(['vy', +t.toFixed(1), +vy.toFixed(2), m.seq]); });
    prevToes = toes;
    const e = Math.hypot(m.pos[0] - m.simPos[0], m.pos[2] - m.simPos[2]); if (e > stats.maxEcartSim) stats.maxEcartSim = e;
    // arrêt total : rien pressé depuis > 2 s → le soldat ne doit pas se déplacer
  }
  // phase arrêt : 6 s sans touche, mesurer la dérive
  API.touches({}); __MM.Ctl.verrouRegard = false; API.step(120, 1/60); const p0 = API.mesures().pos; stats.arret = []; for (let s = 0; s < 6; s++) { API.step(60, 1/60); const m = API.mesures(); stats.arret.push([m.seq.replace('.bvh',''), +m.vitAnim.toFixed(2), +Math.hypot(m.pos[0]-p0[0], m.pos[2]-p0[2]).toFixed(2), +__MM.Ctl.vel.length().toFixed(2), __MM.Ctl.visee]); } const p1 = API.mesures().pos;
  stats.derive = +Math.hypot(p1[0]-p0[0], p1[2]-p0[2]).toFixed(3);
  stats.sauts = __MM.sauts - stats.sauts0; stats.glisse = +API.mesures().glisseMoy.toFixed(1);
  stats.pires = stats.pires.slice(0, 12);
  window.SANS_RENDU = false;
  return JSON.stringify(stats);
})()
