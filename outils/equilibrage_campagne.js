// Équilibrage : taux de victoire par mission d'une campagne. usage : node outils/equilibrage_campagne.js [campagne] [N] [niveau | -1 = progression ~110 XP par mission] [missions,séparées]
const R=require('path').join(__dirname,'..')+'/';
const OT = Object.assign({}, require(R+'sim/rng.js'), require(R+'sim/data.js'), require(R+'sim/map.js'), require(R+'sim/engine.js'), require(R+'sim/game.js'));
const { Game, DATA } = OT;
const camp = process.argv[2] || 'reguliere', N = +(process.argv[3] || 40), lvl = +(process.argv[4] || 0);
const p = Game.newProfile();
if (lvl) for (const id of p.squad) p.operators[id].xp = DATA.XP_TABLE[Math.min(lvl, DATA.XP_TABLE.length-1)];
const c = DATA.CAMPAIGNS.find(c=>c.id===camp) || DATA.CAMPAIGNS[0];
const ids = (c.missions || DATA.MISSIONS.map(m=>m.id));
let i=0; const only=(process.argv[5]||'').split(',').filter(Boolean); for (const mid of ids) { if (only.length && !only.includes(mid)) { i++; continue; } if (lvl<0) for (const id of p.squad) p.operators[id].xp = 110*i; i++; const m = Game.campaignMission(camp, typeof mid==='string'?mid:mid.id); let w=0; for (let s=1;s<=N;s++){ const r=new OT.Battle(Game.battleOptions(p,m,s)).run(); if(r.winner===0)w++; } console.log((m.id).padEnd(12), (m.mapId||'').padEnd(10), String(m.objective||'').padEnd(8), 'diff', m.difficulty, String(Math.round(100*w/N)).padStart(3)+'%', 'niv', Game.levelFor(p.operators[p.squad[0]].xp)); }
