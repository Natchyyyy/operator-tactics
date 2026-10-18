# Banc d'écoute d'OPERATOR TACTICS : pour chaque son clé, plusieurs candidats (A, B, C…) à comparer, et l'ancien son de
# synthèse pour entendre la différence. Page autonome (sons en base64) à publier pour l'utilisateur.
# usage : python3 sons/banc_ot.py sortie.html [dossier_des_enregistrements_bruts_supplementaires]
import sys, os, json, base64, tempfile, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import vrais as V
from vrais import lire, hp, lp, couper, niveau, hauteur, boucle_st, SR
import dsp
out_html = sys.argv[1]; EXTRA = sys.argv[2] if len(sys.argv) > 2 else None
SYN, VR = os.path.join(HERE, 'out'), os.path.join(HERE, 'out_vrais')
man_s = json.load(open(os.path.join(SYN, 'manifeste.json'))); man_v = json.load(open(os.path.join(VR, 'manifeste.json')))
TMP = tempfile.mkdtemp()
b64 = lambda f: base64.b64encode(open(f, 'rb').read()).decode()
def deja(dossier, man, nom, n=None): return [b64(os.path.join(dossier, f)) for f in man[nom][:n]]
def rendu(nom, xs, db, fen=.05, st=False, br=48):
    r = []
    for i, x in enumerate(xs):
        x = niveau(x, db, fen); f = dsp.write(f"{nom}_{i}", x, TMP, mono=not st, br=br); os.remove(f[:-4] + '.wav'); r.append(b64(f))
    return r
G = []   # groupes : (titre, explication, [(étiquette, description, [b64…], boucle?)])
def groupe(t, e, cands): G.append({"titre": t, "texte": e, "cands": [{"et": a, "desc": b, "sons": c, "boucle": d} for a, b, c, d in cands]})

# ---- coups de feu
cdda_tirs = []
if EXTRA:
    for k in (1, 2, 3):
        f = os.path.join(EXTRA, f"556_auto_rifle_shot_0{k}.ogg")
        if os.path.exists(f): cdda_tirs.append(couper(V.grave(hp(lire(f), 35), 85, 2.0), .9, .3))
groupe("Coup de feu de près (fusil d'assaut 5,56)", "Ce que l'on entend quand la caméra est à moins de 28 m du tireur.", [
    ("A", "Vrai tir enregistré au stand (Free Firearm Sound Library, CC0), graves renforcés, crêtes adoucies — dans le jeu", deja(VR, man_v, 'tir_556_proche'), False),
] + ([("B", "Autre vrai tir 5,56, très « retouché » façon jeu vidéo (DoctorBoomstick, CC BY 4.0)", rendu('cdda556', cdda_tirs, -13), False)] if cdda_tirs else []) + [
    ("Ancien", "L'ancien son fabriqué par calcul", deja(SYN, man_s, 'tir_fusil'), False),
])
groupe("Coup de feu à mi-distance et de loin", "Le jeu choisit selon la distance de la caméra ; dans le jeu s'ajoutent l'écho des façades, la réverbération de la ville et l'assourdissement par les obstacles.", [
    ("Mi-distance", "Vrai tir enregistré à mi-distance (28–70 m)", deja(VR, man_v, 'tir_556_moyen'), False),
    ("Loin", "Vrai tir enregistré de loin (au-delà de 70 m)", deja(VR, man_v, 'tir_556_loin'), False),
])
groupe("Silencieux", "Tir avec silencieux : le claquement de la balle reste, la détonation devient sourde, on entend la culasse.", [
    ("A", "Nouveau (fait à partir du vrai tir)", deja(VR, man_v, 'tir_silencieux'), False), ("Ancien", "Ancien son de synthèse", deja(SYN, man_s, 'tir_silencieux'), False)])
groupe("La balle passe près de la caméra", "Joué seulement quand une balle frôle la caméra.", [
    ("Claquement", "Balle supersonique tout près (moins de 2 m)", deja(VR, man_v, 'claquement'), False),
    ("Sifflement", "Balle qui passe un peu plus loin", deja(VR, man_v, 'sifflement'), False),
    ("Ricochet", "Une balle sur huit qui touche du métal ou du béton", deja(VR, man_v, 'ricochet'), False)])
# ---- impacts
groupe("Impacts de balle", "Selon la matière touchée.", [
    ("Béton", "Brique et béton (CC0) + gravillons", deja(VR, man_v, 'impact_beton'), False),
    ("Métal", "Conteneur, barrière (Kenney, CC0)", deja(VR, man_v, 'impact_metal'), False),
    ("Carrosserie", "Voitures, fourgons, bus (Halleck, CC BY)", deja(VR, man_v, 'impact_carrosserie'), False),
    ("Vitre", "Vitres des véhicules (Kenney, CC0)", deja(VR, man_v, 'impact_verre'), False),
    ("Bois", "Caisses, palettes (Kenney, CC0)", deja(VR, man_v, 'impact_bois'), False),
    ("Touché", "Balle qui touche un opérateur", deja(VR, man_v, 'impact_corps'), False),
    ("Anciens", "Anciens impacts de synthèse (béton, métal, corps)", deja(SYN, man_s, 'impact_beton', 2) + deja(SYN, man_s, 'impact_metal', 2) + deja(SYN, man_s, 'impact_corps', 2), False)])
# ---- pas
pb = [couper(hp(lire(f"cdda/walk_t_concrete_{k}.ogg"), 120), .3, .1) for k in (1, 3, 5, 7)]
pk = [couper(hp(lire(f"kenney/footstep_concrete_00{k}.ogg"), 90), .25, .08) for k in range(4)]
pr = [couper(hp(lire(f"cdda/walk_t_rock_floor_{k}.ogg"), 100), .3, .1) for k in (1, 2, 3, 4)]
groupe("Pas sur l'asphalte / le béton", "Lequel préfères-tu pour les pas des opérateurs ? (sous la pluie, le jeu joue les pas dans les flaques.)", [
    ("A", "Actuel du jeu (synthèse)", deja(SYN, man_s, 'pas'), False),
    ("B", "Vrais pas sur béton (InspectorJ, CC BY)", rendu('pasB', pb, -27), False),
    ("C", "Vrais pas sur béton (Kenney, CC0)", rendu('pasC', pk, -27), False),
    ("D", "Vrais pas sur sol de pierre (samulis, CC0)", rendu('pasD', pr, -27), False),
    ("Pluie", "Pas dans les flaques (dans le jeu sous la pluie)", deja(VR, man_v, 'pas_mouille'), False),
    ("Équipement", "Frottement d'équipement quand on court", deja(VR, man_v, 'equipement'), False)])
# ---- pluie
rB = boucle_st(hp(lire("cdda/WEATHER_RAINSTORM.ogg"), 90), 10, 1.5); rC = boucle_st(hp(lire("cdda/night_rain.ogg"), 90), 10, 1.5) if os.path.exists(os.path.join(V.SRC, "cdda/night_rain.ogg")) else None
groupe("Pluie", "La boucle de pluie jouée pendant les batailles sous la pluie (cliquer pour lancer / arrêter).", [
    ("A", "Grosse pluie (Ali@k, CC0) — dans le jeu", deja(VR, man_v, 'pluie'), True),
    ("B", "Averse plus lourde et plus sourde (Iam_calderon, CC0)", rendu('pluieB', [rB], -33, 2.0, True, 48), True),
] + ([("C", "Pluie sur les toits et le sol, plus de gouttes (sergeeo, CC BY 3.0)", rendu('pluieC', [rC], -33, 2.0, True, 48), True)] if rC is not None else []))
groupe("Autres ambiances", "Selon l'heure et la météo de la bataille, sous le bruit de la ville.", [
    ("Jour", "Oiseaux (Modding, CC0)", deja(VR, man_v, 'oiseaux'), True),
    ("Nuit", "Insectes, calme (rsn267, CC0)", deja(VR, man_v, 'nuit'), True),
    ("Brouillard", "Vent doux (florianreichelt, CC0)", deja(VR, man_v, 'vent'), True),
    ("Sirène", "Sirène très lointaine, de temps en temps la nuit (conleec, CC0)", deja(VR, man_v, 'sirene'), False),
    ("Tonnerre", "Tonnerre lointain, de temps en temps sous la pluie (chromakei, CC0)", deja(VR, man_v, 'tonnerre'), False)])
groupe("Explosions, rechargement, chute, étuis", "", [
    ("Grenade", "Vraie explosion + souffle grave + gravillons", deja(VR, man_v, 'explosion'), False),
    ("Grenade (ancienne)", "Ancienne explosion de synthèse", deja(SYN, man_s, 'explosion'), False),
    ("Obus", "Obus / frappe aérienne (unfa, CC0)", deja(VR, man_v, 'explosion_lourde'), False),
    ("Rechargement", "Vrai chargeur et culasse de fusil 5,56 (CC0)", deja(VR, man_v, 'recharge'), False),
    ("Chute", "Un opérateur tombe", deja(VR, man_v, 'chute'), False),
    ("Étuis", "Étuis qui tintent au sol près du tireur (FST180081, CC BY 4.0)", deja(VR, man_v, 'douilles'), False)])

html = """<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sons d'Operator Tactics</title>
<style>:root{--bg:#f4f1ea;--card:#fffdf8;--fg:#1d1b17;--mute:#6a6257;--acc:#2f6b4f;--acc-fg:#fff;--line:#ddd5c7;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#15130f;--card:#1e1b16;--fg:#efe7da;--mute:#a99d8b;--acc:#7fd1a6;--acc-fg:#10140f;--line:#35302a;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#15130f;--card:#1e1b16;--fg:#efe7da;--mute:#a99d8b;--acc:#7fd1a6;--acc-fg:#10140f;--line:#35302a;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px 16px 56px}
main{max-width:820px;margin:0 auto}h1{font:700 1.8rem/1.2 Georgia,serif;margin:0 0 6px}.intro{color:var(--mute);margin:0 0 22px}
section{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:0 0 16px}h2{font-size:1.1rem;margin:0 0 4px}section>p{color:var(--mute);margin:0 0 10px;font-size:.93rem}
.c{display:flex;align-items:center;gap:12px;padding:9px 0;border-top:1px solid var(--line)}.c:first-of-type{border-top:0}.et{font-weight:700;min-width:92px}.d{flex:1;color:var(--mute);font-size:.92rem}
button{font:700 .88rem system-ui;border:0;border-radius:999px;padding:8px 14px;background:var(--acc);color:var(--acc-fg);cursor:pointer;min-width:118px}button.on{outline:3px solid var(--fg)}
button:focus-visible{outline:3px solid var(--fg);outline-offset:2px}@media (max-width:560px){.c{flex-wrap:wrap}.d{flex-basis:100%;order:3}}</style></head><body><main>
<h1>Les sons d'Operator Tactics</h1><p class="intro">Écoute avec un casque si possible. Chaque bouton rejoue une autre variante du même son. Dis-moi la lettre que tu préfères pour chaque groupe, ou ce qui ne va pas (trop fort, trop aigu, « on dirait de l'airsoft »…).</p>
<div id="g"></div></main>
<script>const G = __G__; let ac = null; const B = {}, n = {}; let loopSrc = null, loopBtn = null;
async function buf(k, i, s){ const id = k + '/' + i; if(!B[id]) B[id] = await ac.decodeAudioData(Uint8Array.from(atob(s), x => x.charCodeAt(0)).buffer); return B[id]; }
async function play(k, c, b){ ac = ac || new (window.AudioContext || window.webkitAudioContext)(); await ac.resume();
  if(c.boucle){ if(loopSrc){ loopSrc.stop(); loopBtn.classList.remove('on'); loopBtn.textContent = 'Écouter'; const same = loopBtn === b; loopSrc = loopBtn = null; if(same) return; }
    const s = ac.createBufferSource(); s.buffer = await buf(k, 0, c.sons[0]); s.loop = true; s.connect(ac.destination); s.start(); loopSrc = s; loopBtn = b; b.classList.add('on'); b.textContent = 'Arrêter'; return; }
  const i = n[k] = ((n[k] ?? -1) + 1) % c.sons.length; const s = ac.createBufferSource(); s.buffer = await buf(k, i, c.sons[i]); s.connect(ac.destination); s.start();
  b.textContent = c.sons.length > 1 ? `Écouter ${i + 1}/${c.sons.length}` : 'Écouter'; }
const R = document.getElementById('g'); G.forEach((g, gi) => { const s = document.createElement('section'); const h = document.createElement('h2'); h.textContent = g.titre; s.appendChild(h);
  if(g.texte){ const p = document.createElement('p'); p.textContent = g.texte; s.appendChild(p); }
  g.cands.forEach((c, ci) => { const r = document.createElement('div'); r.className = 'c'; const e = document.createElement('span'); e.className = 'et'; e.textContent = c.et; const d = document.createElement('span'); d.className = 'd'; d.textContent = c.desc;
    const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Écouter'; b.onclick = () => play(gi + '-' + ci, c, b); r.append(e, d, b); s.appendChild(r); }); R.appendChild(s); });
</script></body></html>"""
open(out_html, 'w', encoding='utf-8').write(html.replace('__G__', json.dumps(G, ensure_ascii=False)))
print(out_html, round(os.path.getsize(out_html)/1024), 'Ko')
