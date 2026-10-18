# Bruitages d'OPERATOR TACTICS tirés de VRAIS enregistrements (CC0 / CC BY, voir CREDITS.md) : découpe, nettoyage
# (passe-haut contre le grondement de micro), mise au niveau par catégorie, variantes, boucles d'ambiance sans couture.
# usage : python3 sons/vrais.py [--seulement nom1,nom2]     → sons/out_vrais/*.ogg + manifeste.json
# Les sources brutes sont dans sons/sources/ (ffsl : Free Firearm Sound Library ; cdda : CDDA-Soundpacks ; kenney : Kenney).
import sys, os, json, subprocess, argparse, numpy as np, scipy.signal as sg
HERE = os.path.dirname(os.path.abspath(__file__))
for p in [os.path.join(HERE, '..', '..', 'outils', 'boite-a-outils', 'sons'), os.path.join(HERE, '..', '..', 'natchyyyy', 'calcul-mental-cm1', 'boite-a-outils', 'sons')]:
    if os.path.exists(os.path.join(p, 'dsp.py')): sys.path.insert(0, p); break
import dsp
from dsp import SR, noise, env_ad, lp, hp, bp, place, silence, seed, rng, soft_clip, reverb, stereo
SRC = os.path.join(HERE, 'sources'); OUT = os.path.join(HERE, 'out_vrais')

def lire(f):
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", os.path.join(SRC, f), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True)
    return np.frombuffer(r.stdout, np.float32).astype(np.float64)
def lmax(x, s=.05):
    m = x if x.ndim == 1 else x.mean(0); w = int(s*SR); c = np.concatenate([[0], np.cumsum(m**2)])
    if len(m) <= w: return 10*np.log10(c[-1]/w + 1e-15)
    return 10*np.log10(((c[w:] - c[:-w])/w).max() + 1e-15)
def compresseur(x, seuil_db, ratio=4.0, att=.0008, rel=.06):
    """compresseur de crête (enveloppe à attaque rapide) : réduit l'écart crête / niveau sans « écraser » le son"""
    e = np.abs(x); env = np.empty_like(e); a1 = np.exp(-1/(att*SR)); r1 = np.exp(-1/(rel*SR)); v = 0.0
    for k in range(len(e)):   # (boucle simple : sons courts)
        v = a1*v + (1 - a1)*e[k] if e[k] > v else r1*v + (1 - r1)*e[k]; env[k] = v
    t = 10**(seuil_db/20); g = np.where(env > t, (env/t)**(1/ratio - 1), 1.0); return x*g
def niveau(x, db, fen=.05, crete=-1.0):
    """niveau cible (dB, puissance max sur « fen » s) ; si la crête dépasse, compresseur puis limiteur doux (comme un micro saturé)"""
    c = 10**(crete/20); y = x*10**((db - lmax(x, fen))/20)
    if np.abs(y).max() > c*1.4 and y.ndim == 1 and len(y) < 4*SR:
        y = compresseur(y, crete - 6, 4.0); y = y*10**((db - lmax(y, fen))/20)
    p = np.abs(y).max()
    if p > c: y = c*np.tanh(y/c)
    return y
def debut(x, seuil=.08):
    """indice de l'attaque : on part du maximum et on remonte (au plus 15 ms) jusqu'à seuil × crête"""
    i = int(np.argmax(np.abs(x))); j0 = max(0, i - int(.015*SR)); seg = np.abs(x[j0:i + 1]); k = int(np.argmax(seg > seuil*seg.max()))
    return max(0, j0 + k - int(.002*SR))
def couper(x, dur, fo=.05, a=None):
    a = debut(x) if a is None else a; y = x[a:a + int(dur*SR)].copy(); n = min(len(y)//2, int(fo*SR)); y[-n:] *= np.linspace(1, 0, n)**2
    m = int(.0015*SR); y[:m] *= np.linspace(0, 1, m); return y
def amortir(x, t60):
    """raccourcit une résonance trop longue (cloche) : enveloppe exponentielle −60 dB en t60 s"""
    return x*np.exp(-6.9*np.arange(len(x))/SR/t60)
def hauteur(x, r):
    """transposition par rééchantillonnage (r > 1 : plus aigu, plus court)"""
    if abs(r - 1) < 1e-3: return x
    from fractions import Fraction
    f = Fraction(r).limit_denominator(200); return sg.resample_poly(x, f.denominator, f.numerator)
def grave(x, f=90, db=4.0, q=.7):
    """renfort de graves en cloche (le « coup dans la poitrine » des jeux)"""
    A = 10**(db/40); w = 2*np.pi*f/SR; al = np.sin(w)/(2*q)
    b = [1 + al*A, -2*np.cos(w), 1 - al*A]; a = [1 + al/A, -2*np.cos(w), 1 - al/A]; return sg.lfilter(b, a, x)
def tick(dur=.004, f=2500):
    """claquement bref de l'arrivée d'une balle (bruit très court, aigu)"""
    n = noise(dur); return hp(n, f)*env_ad(len(n), .0002, dur*.6, 3)
def mixe(n_s, *couches):
    out = silence(n_s)
    for x, t, g in couches: place(out, x, t, g)
    return out
def boucle(x, dur, xf=1.5, debut_s=0.0):
    """boucle sans couture : fondu croisé à puissance constante entre la fin et le début (bruits non corrélés)"""
    a = int(debut_s*SR); D = int(dur*SR); F = int(xf*SR); y = x[a:a + D + F]
    assert len(y) == D + F, ("source trop courte", len(x)/SR, debut_s, dur)
    t = np.linspace(0, 1, F); out = y[:D].copy(); out[:F] = y[:F]*np.sin(t*np.pi/2) + y[D:D + F]*np.cos(t*np.pi/2); return out
def boucle_st(x, dur, xf=1.5, dec=None):
    """stéréo de largeur naturelle : deux passages différents du même enregistrement, un par oreille"""
    dec = dec if dec is not None else (len(x)/SR - dur - xf)
    return np.stack([boucle(x, dur, xf, 0.0), boucle(x, dur, xf, max(0.0, dec))])

S = {}; STEREO = set(); DEBIT = {}
def snd(name, n=1, db=-20, fen=.05, debit=48, st=False):
    def deco(f): S[name] = (f, n, db, fen); DEBIT[name] = debit; (STEREO.add(name) if st else None); return f
    return deco

# ---------------------------------------------------------------- coups de feu (fusil d'assaut 5,56, Free Firearm Sound Library, CC0)
# Trois distances d'écoute enregistrées (près du tireur, à mi-distance, de loin) : le jeu choisit selon la distance de la caméra.
# Renfort de graves léger, crêtes adoucies (les enregistrements de tirs sont saturés à la source), queue naturelle du stand conservée.
def tir(src, dur, db_grave):
    x = hp(lire(src), 35); x = grave(x, 85, db_grave); return couper(x, dur, .35)
@snd("tir_556_proche", 5, -10)
def tir_proche(i): return tir(f"ffsl/556_proche_{i}.ogg", 1.25, 4.5)
@snd("tir_556_moyen", 4, -11)
def tir_moyen(i): return tir(f"ffsl/556_moyen_{i}.ogg", 1.45, 3.5)
@snd("tir_556_loin", 4, -12)
def tir_loin(i): return tir(f"ffsl/556_loin_{i}.ogg", 1.6, 2.0)
@snd("tir_silencieux", 4, -19)   # silencieux : le claquement de la balle reste, la détonation devient un « toc » sourd, on entend la culasse
def tir_sil(i):
    x = hp(lire(f"ffsl/556_proche_{i}.ogg"), 60); a = debut(x); x = x[a:]
    corps = lp(couper(x, .22, .12, 0), 1100, 2)*.9
    claque = hp(x[:int(.004*SR)], 2500)*.35
    cul = lire(f"ffsl/556_culasse_{1 + i % 2}.ogg"); cul = hp(couper(cul, .07, .03), 900)*.25
    return mixe(.4, (corps, 0, 1), (claque, 0, 1), (cul, .012, 1))

# ---------------------------------------------------------------- passage de la balle près de la caméra (synthèse : onde en N, souffle)
@snd("claquement", 4, -15)       # balle supersonique qui passe tout près : « crac » sec (onde en N) + réflexion au sol + petite queue
def claquement(i):
    seed(500 + i); n = int(.0003*SR) + 2*i; t = np.linspace(-1, 1, n); nw = -t*.9      # onde en N (≈ 0,3 ms)
    x = np.zeros(int(.25*SR)); x[:n] += nw; d = int(rng.uniform(.002, .006)*SR); x[d:d + n] += nw*rng.uniform(.4, .6)
    x = hp(x, 400)*6; tail = hp(noise(.12), 1500)*env_ad(int(.12*SR), .001, .05)*.05; place(x, tail, .001)
    return lp(x, 14000)
@snd("sifflement", 4, -23)       # balle plus lointaine qui passe : souffle bref qui descend (effet Doppler)
def sifflement(i):
    seed(520 + i); d = rng.uniform(.16, .26); f0, f1 = rng.uniform(4200, 5200), rng.uniform(1700, 2300)
    x = dsp.sweep_bp(noise(d), f0, f1, 5)*np.hanning(int(d*SR))**1.5; return x + hp(noise(d), 6000)*np.hanning(int(d*SR))**3*.15
@snd("ricochet", 4, -23)         # ricochet : choc métallique bref puis sifflement qui s'éloigne en vibrant
def ricochet(i):
    seed(540 + i); k = lire(f"kenney/impactMetal_light_00{i}.ogg"); k = amortir(couper(k, .08, .03), .05)
    d = rng.uniform(.35, .55); t = np.arange(int(d*SR))/SR; f = rng.uniform(3600, 4800)*np.exp(-t/d*rng.uniform(.7, 1.0))
    ph = 2*np.pi*np.cumsum(f*(1 + .03*np.sin(2*np.pi*rng.uniform(25, 45)*t)))/SR
    w = (np.sin(ph)*.6 + dsp.sweep_bp(noise(d), f[0], f[-1], 8)*.5)*env_ad(len(t), .01, d*.9, 2)
    return mixe(.6, (k, 0, .8), (w, .006, .5))

# ---------------------------------------------------------------- impacts de balle par matière (vrais chocs + « tic » d'arrivée)
def debris(i, g=.25):
    x = lire(f"cdda/walk_t_gravel_{1 + i % 10}.ogg"); a = debut(x); return hp(couper(x, .12, .08, a), 1500)*g
@snd("impact_beton", 6, -20)     # béton / brique / mur : éclat sec + gravillons qui retombent (smash_fail brick & concrete, CC0)
def impact_beton(i):
    src = f"cdda/smash_fail_brick{'' if i % 5 == 0 else '_' + str(i % 5)}.ogg" if i < 5 else "cdda/smash_fail_concrete_2.ogg"
    x = hp(lire(src), 180); x = couper(x, .22, .1); x = hauteur(x, [1.0, 1.08, .95, 1.12, 1.03, .9][i])
    return mixe(.4, (tick(.003, 3000), 0, .5), (x, .001, 1), (debris(i), .025 + .01*i, 1))
@snd("impact_metal", 5, -20)     # conteneur, cuve, barrière : « tang » métallique court (Kenney, CC0)
def impact_metal(i):
    x = lire(["kenney/impactMetal_light_000.ogg", "kenney/impactMetal_medium_001.ogg", "kenney/impactPlate_light_002.ogg", "kenney/impactMetal_light_003.ogg", "kenney/impactMetal_medium_004.ogg"][i])
    x = amortir(couper(hp(x, 200), .4, .1), .3); return mixe(.45, (tick(.002, 4000), 0, .7), (x, .001, 1))
@snd("impact_carrosserie", 4, -20)   # voiture, fourgon, bus : tôle creuse (Halleck, CC BY)
def impact_carrosserie(i):
    x = hp(lire(f"cdda/hit_vehicle{i + 1}.ogg"), 120); x = amortir(couper(x, .35, .1), .4); return mixe(.4, (tick(.002, 3500), 0, .6), (x, .001, 1))
@snd("impact_verre", 3, -21)     # vitre : choc de verre (Kenney, CC0)
def impact_verre(i):
    x = lire(f"kenney/impactGlass_{['light', 'medium', 'light'][i]}_00{i + 1}.ogg"); x = couper(hp(x, 300), .3, .1); return mixe(.35, (tick(.002, 4000), 0, .6), (x, .001, 1))
@snd("impact_bois", 4, -21)      # caisses, palettes : craquement de bois + échardes (Kenney, CC0)
def impact_bois(i):
    x = lire(f"kenney/impactWood_{['light', 'medium'][i % 2]}_00{i}.ogg"); x = couper(hp(x, 120), .25, .1)
    sp = bp(noise(.05), 2000, 7000)*env_ad(int(.05*SR), .001, .02)*.12
    return mixe(.35, (tick(.003, 2500), 0, .5), (x, .001, 1), (sp, .004, 1))
@snd("impact_corps", 5, -19)     # balle qui touche : coup sourd et mat (coups CC0) + choc de plaque une fois sur trois
def impact_corps(i):
    x = lire(f"cdda/unarmed_hit_flesh_{1 + i % 5}.ogg"); x = couper(hp(x, 55), .2, .08); x = lp(x, 5000)
    out = mixe(.3, (tick(.002, 2000), 0, .25), (x, .001, 1))
    if i % 3 == 1: p = lire("kenney/impactPlate_medium_001.ogg"); place(out, amortir(couper(hp(p, 400), .12, .05), .08), .001, .25)
    return out

# ---------------------------------------------------------------- douilles, rechargement, chute
@snd("douilles", 6, -30)         # étuis qui tintent sur le sol (FST180081, CC BY 4.0)
def douilles(i):
    x = hp(lire(f"cdda/brass_eject{'' if i % 2 == 0 else '_1'}.ogg"), 1500); e = np.abs(x); pk, _ = sg.find_peaks(np.convolve(e, np.ones(240)/240, 'same'), distance=int(.15*SR), prominence=e.max()*.05)
    pk = sorted(pk, key=lambda k: -e[k])[:3]; k = sorted(pk)[i // 2 % len(pk)]
    return couper(x, .3, .12, max(0, k - int(.01*SR)))
@snd("recharge", 3, -20)         # chargeur retiré / inséré puis culasse (Free Firearm Sound Library, CC0)
def recharge(i):
    c = hp(lire(f"ffsl/556_chargeur_{i % 2}.ogg"), 120); a = debut(c[:int(1.2*SR)] if i == 2 else c); c = couper(c, 1.0, .15, max(0, a - int(.05*SR)))
    k = hp(lire(f"ffsl/556_culasse_{i}.ogg"), 150); k = couper(k, .45, .1)
    return mixe(1.8, (c, 0, 1), (k, 1.05 + .08*i, .9))
@snd("chute", 4, -20)            # un corps qui tombe avec son équipement : choc sourd + cliquetis (Kenney, CC0)
def chute(i):
    a = couper(lire(f"kenney/impactSoft_heavy_00{i}.ogg"), .3, .1); b = couper(lire(f"kenney/impactPunch_medium_00{(i + 2) % 5}.ogg"), .3, .1)
    m = amortir(couper(hp(lire(f"kenney/impactMetal_light_00{(i + 1) % 5}.ogg"), 800), .15, .05), .1)
    return lp(mixe(.6, (a, 0, 1), (b, .09 + .02*i, .6), (m, .1 + .03*i, .12)), 7000)
@snd("equipement", 4, -31)       # frottement d'équipement quand on court (MWsfx, CC0)
def equipement(i):
    x = hp(lire(f"cdda/clear_obstacle_{2 + i % 2}.ogg"), 250); return hauteur(couper(x, .3, .1), [1, 1.06, .94, 1.1][i])

# ---------------------------------------------------------------- pas
@snd("pas_mouille", 6, -25)      # pas dans les flaques (nathanaelj83 CC0, duckduckpony CC BY)
def pas_mouille(i):
    x = hp(lire(f"cdda/walk_t_water_sh_{i + 1}.ogg"), 150); return couper(x, .24, .08)

# ---------------------------------------------------------------- explosions (grenade : CC0 j1987 / CC BY 3.0 bmlake ; lourde : CC0 unfa)
@snd("explosion", 3, -9)
def explosion(i):
    g = hp(lire(f"ffsl/grenade_{i}.ogg"), 30); g = couper(g, .9, .2)
    seed(610 + i); boom = lp(dsp.resonator(noise(1.2), rng.uniform(38, 48), 1.6)*env_ad(int(1.2*SR), .002, .7), 160)*2.0
    out = mixe(2.2, (g, 0, 1), (boom, 0, .8))
    for k in range(7): place(out, debris(k + i, .18), rng.uniform(.3, 1.4))   # gravillons qui retombent
    return out
@snd("explosion_lourde", 2, -8)  # obus, frappe aérienne
def explosion_lourde(i):
    x = hp(lire(f"ffsl/lourde_{i}.ogg"), 25); return couper(x, 2.8, .8)

# ---------------------------------------------------------------- ambiances (boucles stéréo) et ponctuations
@snd("pluie", 1, -33, fen=2.0, debit=48, st=True)        # pluie forte (Ali@k, CC0)
def pluie(i): return boucle_st(hp(lire("cdda/heavyrain.ogg"), 90), 24, 2.0)
@snd("pluie_courte", 1, -33, fen=2.0, debit=32, st=True) # même pluie, boucle courte (incluse dans la page)
def pluie_courte(i): return boucle_st(hp(lire("cdda/heavyrain.ogg"), 90), 8, 1.5, 12)
@snd("vent", 1, -40, fen=2.0, debit=40, st=True)         # vent doux (brouillard) (florianreichelt, CC0)
def vent(i): return boucle_st(lp(hp(lire("cdda/flurries.ogg"), 70), 7000), 24, 3.0)
@snd("vent_court", 1, -40, fen=2.0, debit=28, st=True)
def vent_court(i): return boucle_st(lp(hp(lire("cdda/flurries.ogg"), 70), 7000), 8, 2.0, 16)
@snd("oiseaux", 1, -45, fen=2.0, debit=40, st=True)      # oiseaux, jour (Modding, CC0)
def oiseaux(i): return boucle_st(hp(lire("cdda/weather_sunny_spring.ogg"), 300), 24, 2.0)
@snd("nuit", 1, -47, fen=2.0, debit=40, st=True)         # insectes et calme de la nuit (rsn267, CC0)
def nuit(i): return boucle_st(hp(lire("cdda/clear_night_3.ogg"), 250), 24, 2.0)
@snd("sirene", 2, -26, fen=.5, debit=32)                 # sirène très lointaine (conleec, CC0) : sourde, réverbérée par la ville
def sirene(i):
    x = hauteur(lire("cdda/police_siren.ogg"), [1.0, .93][i])
    y = np.concatenate([x, x, x]); y *= np.sin(np.linspace(0, np.pi, len(y)))**1.5
    y = lp(hp(y, 350), 1400); w = reverb(y, "outdoor", .9).mean(0); return lp(w, 1600)
@snd("tonnerre", 2, -18, fen=.5, debit=32)               # tonnerre lointain (chromakei, CC0)
def tonnerre(i):
    x = hp(lire("cdda/thunder_far.ogg"), 30); return couper(x, 7.0, 2.0, int([0.0, 3.0][i]*SR))

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--seulement", default=None); a = ap.parse_args(); only = a.seulement.split(",") if a.seulement else None
    os.makedirs(OUT, exist_ok=True); mp = os.path.join(OUT, "manifeste.json"); man = json.load(open(mp)) if os.path.exists(mp) else {}
    for name, (fn, n, db, fen) in S.items():
        if only and name not in only: continue
        files = []
        for i in range(n):
            x = fn(i)
            x = niveau(x, db, fen)
            f = dsp.write(f"{name}_{i}", x, OUT, mono=name not in STEREO, br=DEBIT[name]); os.remove(f[:-4] + ".wav"); files.append(os.path.basename(f))
            print(f"{name}_{i}  {x.shape[-1]/SR:5.2f}s  L50 {lmax(x, .05):6.1f}  crête {20*np.log10(np.abs(x).max() + 1e-12):5.1f}  {os.path.getsize(f)} o", flush=True)
        man[name] = files
    json.dump(man, open(mp, "w"), indent=1)
    print("total", len(man), "sons,", round(sum(os.path.getsize(os.path.join(OUT, f)) for v in man.values() for f in v)/1024), "Ko")
