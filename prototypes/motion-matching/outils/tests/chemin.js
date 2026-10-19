(function(){ window.SANS_RENDU=true; btnDemo.click(); let stall=0, tours=0, t=0; const lent=[];
  for (let i=0;i<60*60;i++){ API.step(1,1/60); t+=1/60; const m=API.mesures(); const vg=__MM.Ctl.vitesseCible().length(); if (vg>0.5 && m.vitAnim<0.2) { stall++; if (stall%30===1) lent.push([+t.toFixed(1), m.seq.replace('.bvh','')]); } }
  window.SANS_RENDU=false; return JSON.stringify({pointsAtteints:__MM.Ctl.cheminIdx, secondesBloquees:+(stall/60).toFixed(1), sauts:__MM.sauts, glisse:+API.mesures().glisseMoy.toFixed(1), lent:lent.slice(0,10)}); })()
