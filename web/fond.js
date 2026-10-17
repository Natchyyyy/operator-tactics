// Fond des menus façon jeu d'origine : noir, faisceau d'horizon vert lumineux (éclatant à gauche), rideaux de lumière
// verticaux, brume verdâtre, sol sombre parcouru de fines lignes sinueuses. Dessiné une fois sur un canevas, puis posé en
// image CSS (variable --fond) sur le QG, l'écran VS et les récompenses. Les couches douces sont peintes en basse
// définition puis agrandies (flou naturel, rapide même sans carte graphique). Graine fixe : le même fond à chaque visite.
(function (root) {
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // couche douce (basse définition) : halo, aurores, brume, faisceau
  function soft(W, H, R, hz) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    let gr = g.createLinearGradient(0, hz - H * 0.5, 0, hz + H * 0.1);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.6, 'rgba(30,70,55,0.25)'); gr.addColorStop(0.92, 'rgba(110,190,150,0.32)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 110; i++) {                 // rideaux verticaux
      const x = R() * W, w = 0.6 + R() * (R() < 0.15 ? 6 : 2.2), h = H * (0.06 + R() * (R() < 0.2 ? 0.5 : 0.25)), a = 0.05 + R() * 0.14;
      const lg = g.createLinearGradient(0, hz - h, 0, hz);
      lg.addColorStop(0, 'rgba(120,220,170,0)'); lg.addColorStop(0.75, `rgba(130,230,180,${a})`); lg.addColorStop(1, `rgba(190,255,225,${a * 1.5})`);
      g.fillStyle = lg; g.fillRect(x, hz - h, w, h);
    }
    for (let i = 0; i < 160; i++) {                 // brume
      const x = R() * W, y = hz - R() * H * 0.32 + 4, r = W * (0.02 + R() * 0.09), a = 0.02 + R() * 0.05;
      const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, `rgba(105,165,135,${a})`); rg.addColorStop(1, 'rgba(105,165,135,0)');
      g.fillStyle = rg; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    for (const [th, a] of [[H * 0.07, 0.12], [H * 0.03, 0.25], [H * 0.012, 0.5]]) {   // faisceau effilé
      g.beginPath(); g.moveTo(0, hz - th); g.quadraticCurveTo(W * 0.45, hz - th * 0.35, W, hz + H * 0.01 - th * 0.12); g.lineTo(W, hz + H * 0.01 + th * 0.12); g.quadraticCurveTo(W * 0.45, hz + th * 0.35, 0, hz + th); g.closePath();
      const lg = g.createLinearGradient(0, 0, W, 0); lg.addColorStop(0, `rgba(215,255,235,${Math.min(1, a * 1.7)})`); lg.addColorStop(0.35, `rgba(165,235,200,${a})`); lg.addColorStop(1, `rgba(110,190,150,${a * 0.35})`);
      g.fillStyle = lg; g.fill();
    }
    const fl = g.createRadialGradient(W * 0.04, hz, 0, W * 0.04, hz, W * 0.3); fl.addColorStop(0, 'rgba(220,255,235,0.5)'); fl.addColorStop(0.3, 'rgba(160,240,200,0.14)'); fl.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fl; g.fillRect(0, hz - W * 0.3, W * 0.5, W * 0.6);
    return c;
  }
  function draw(W, H, seed) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); const R = rng(seed || 7);
    const hz = H * 0.78;
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    const k = 4, s1 = soft(Math.round(W / k), Math.round(H / k), R, hz / k);
    g.globalCompositeOperation = 'lighter'; g.drawImage(s1, 0, 0, W, H);
    // trait d'horizon net, éclatant à gauche
    const lg = g.createLinearGradient(0, 0, W, 0); lg.addColorStop(0, 'rgba(235,255,245,0.9)'); lg.addColorStop(0.4, 'rgba(190,245,215,0.55)'); lg.addColorStop(1, 'rgba(130,200,165,0.12)');
    g.strokeStyle = lg; g.lineWidth = 2.5; g.beginPath(); g.moveTo(0, hz); g.quadraticCurveTo(W * 0.45, hz, W, hz + H * 0.01); g.stroke();
    g.globalCompositeOperation = 'source-over';
    // sol sombre
    const gr = g.createLinearGradient(0, hz + 12, 0, H); gr.addColorStop(0, 'rgba(20,40,32,0.3)'); gr.addColorStop(0.3, 'rgba(6,12,10,0.85)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = gr; g.fillRect(0, hz + 14, W, H - hz);
    // fines lignes sinueuses au sol et quelques anneaux
    g.lineWidth = 1.2;
    for (let i = 0; i < 34; i++) {
      let x = R() * W, y = hz + 18 + R() * (H - hz) * 0.7, ang = R() * Math.PI * 2; const n = 8 + Math.floor(R() * 18), a = 0.05 + R() * 0.12;
      g.strokeStyle = `rgba(150,200,175,${a})`; g.beginPath(); g.moveTo(x, y);
      for (let j = 0; j < n; j++) { ang += (R() - 0.5) * 1.1; x += Math.cos(ang) * (8 + R() * 22); y += Math.sin(ang) * (4 + R() * 9) * 0.6; g.lineTo(x, y); }
      g.stroke();
    }
    for (let i = 0; i < 10; i++) { const x = R() * W, y = hz + 30 + R() * (H - hz - 40), r = 8 + R() * 16; g.strokeStyle = 'rgba(150,190,170,0.1)'; g.beginPath(); g.ellipse(x, y, r * 1.7, r * 0.55, 0, 0, Math.PI * 2); g.stroke(); }
    return c;
  }
  let url = null;
  function apply() {
    try { if (!url) url = draw(1920, 1080, 11).toDataURL('image/jpeg', 0.88); document.documentElement.style.setProperty('--fond', `url(${url})`); } catch (e) { /* canevas indisponible : fond noir */ }
  }
  root.Fond = { draw, apply };
  apply();
})(window.OT = window.OT || {});
