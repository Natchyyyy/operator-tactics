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
def limiteur(x, c, fen=.003, rel=.04):
    """limiteur à anticipation : gain = c / crête locale (max sur « fen »), lissé (relâchement « rel ») ; pas de distorsion de tanh"""
    from scipy.ndimage import maximum_filter1d, minimum_filter1d, uniform_filter1d
    n = max(3, int(fen*SR)); env = maximum_filter1d(np.abs(x), n); g = np.minimum(1.0, c/np.maximum(env, 1e-9))
    g = minimum_filter1d(g, n); r = int(rel*SR)
    g = np.minimum(g, sg.lfilter([1 - np.exp(-1/r)], [1, -np.exp(-1/r)], g, zi=[g[0]*np.exp(-1/r)])[0]) if r > 1 else g
    return x*uniform_filter1d(g, n)
def niveau(x, db, fen=.05, crete=-1.0, lim=None):
    """niveau cible (dB, puissance max sur « fen » s) ; si la crête dépasse, limiteur à anticipation (comme le mastering des jeux).
    « lim » (dB) : au plus lim dB écrasés par le limiteur, en un seul passage ; au-delà on baisse le tout (le niveau visé
    n'est pas atteint). Sans ce garde-fou, sur un son très bref (coup lointain, claquement), les passages successifs du
    limiteur écrasaient le coup jusqu'au niveau de ses échos."""
    c = 10**(crete/20); y = x*10**((db - lmax(x, fen))/20)
    if lim is not None:
        p = np.abs(y).max(); m = c*.97*10**(lim/20)
        if p > m: y = y*m/p
        for _ in range(8):                      # plusieurs passages, sans remonter le niveau entre deux
            if np.abs(y).max() <= c: break
            y = limiteur(y, c*.97, .0004, .015)   # limiteur rapide : seule la pointe de la détonation est rabotée, le corps reste
        p = np.abs(y).max(); return y*c/p if p > c else y
    for _ in range(14):
        if np.abs(y).max() <= c*1.001: break
        y = limiteur(y, c*.97); y = y*10**((db - lmax(y, fen))/20)
    p = np.abs(y).max()
    if p > c: y = y*c/p   # dernier recours : on baisse (le niveau visé n'est pas atteint)
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
LIM = {}
def snd(name, n=1, db=-20, fen=.05, debit=48, st=False, lim=None):
    def deco(f): S[name] = (f, n, db, fen); DEBIT[name] = debit; LIM[name] = lim; (STEREO.add(name) if st else None); return f
    return deco

# ---------------------------------------------------------------- briques communes (refaites le 22/10 : « impacts comme Escape from Tarkov »)
# VRAI claquement de balle : le micro « loin » de la Free Firearm Sound Library (CC0) était devant le tireur, près de la
# trajectoire. Chaque prise commence par le claquement de la balle 5,56 (onde en N de 0,21 à 0,25 ms, mesurée, comme le
# prévoit la loi de Whitham, puis 1,5 ms de résonance), 15,5 ms avant le coup de feu. On s'en sert pour le claquement, le
# sifflement, le tir silencieux, et pour le « tac » d'arrivée de la balle sur chaque matière (à la place du « tic » de synthèse).
nrm = lambda x: x/(np.abs(x).max() + 1e-12)
def _loin(i):
    x = lire(f"ffsl/556_loin_{i % 4}.ogg"); pk = np.abs(x).max(); a = int(np.argmax(np.abs(x) > .05*pk))
    j = a + int(.005*SR); b = j + int(np.argmax(np.abs(x[j:]) > .25*pk)); return x, a, b
def craque(i, dur=.011):
    """vrai claquement de balle supersonique, sans le coup de feu qui suit"""
    x, a, b = _loin(i); a = max(0, a - int(.0005*SR)); y = x[a:min(b - int(.001*SR), a + int(dur*SR))].copy()
    n = min(len(y)//2, int(.003*SR)); y[-n:] *= np.linspace(1, 0, n)**2; return hp(y, 150)
def snap(i, f=1500, dur=.0025):
    """« tac » d'arrivée de la balle : le début du vrai claquement, filtré"""
    return nrm(hp(craque(i, dur), f))
def gravier(i, dur=.14):
    """vrais gravillons qui retombent (ali-6868, CC0)"""
    x = lire(f"cdda/walk_t_gravel_{1 + i % 10}.ogg"); return nrm(hp(couper(x, dur, .08), 1200))
def chiffon(i, dur=.09):
    """tissu de treillis / porte-plaques froissé (MWsfx, CC0)"""
    return nrm(hp(couper(lire(f"cdda/clear_obstacle_{2 + i % 2}.ogg"), dur, .05), 400))
def ken(nom, f=150, dur=.3, t60=None):
    x = couper(hp(lire(f"kenney/{nom}.ogg"), f), dur, min(.1, dur/3)); return nrm(amortir(x, t60) if t60 else x)
def sifflet(d, f0, f1, s):
    """sifflement d'une balle qui tourne sur elle-même après un ricochet : son glissant (Doppler) + vibrato du culbutage"""
    seed(s); t = np.arange(int(d*SR))/SR; f = f0*(f1/f0)**(t/d)
    ph = 2*np.pi*np.cumsum(f*(1 + .025*np.sin(2*np.pi*rng.uniform(25, 45)*t)))/SR
    w = (np.sin(ph)*.6 + nrm(dsp.sweep_bp(noise(d), f0, f1, 8))*.4)*(1 + .3*np.sin(2*np.pi*rng.uniform(30, 60)*t))
    return w*env_ad(len(t), .006, d*.9, 2)

# ---------------------------------------------------------------- coups de feu (fusil d'assaut 5,56, Free Firearm Sound Library, CC0)
# Trois distances d'écoute enregistrées (près du tireur, à mi-distance, de loin) : le jeu choisit selon la distance de la caméra.
# Passe-haut 80 Hz à pente raide (grondement du micro : jusqu'à −20 dB d'énergie sous 90 Hz dans les prises « proche »),
# renfort de graves en cloche vers 110 Hz, limiteur doux (≤ 4 dB, le claquement de la détonation reste net).
def tir(src, dur, db_grave):
    x = hp(lire(src), 80, 4); x = grave(x, 110, db_grave, .8); return couper(x, dur, .35)
@snd("tir_556_proche", 5, -15, debit=64, lim=8)
def tir_proche(i):   # prise sèche du stand (queue à −55 dB) : on ajoute les premières réflexions d'une rue / d'un parking (sol,
    # voitures, façades à 4-50 m) et une courte queue 26 dB sous le coup ; le jeu ajoute sa réverbération d'extérieur par-dessus
    return echo_ville(tir(f"ffsl/556_proche_{i}.ogg", 1.0, 3.5), 720 + i, r0=20, dur=1.3, dl0=4, pas=8, n=6, queue=-26, t60=(.9, 1.2), masque=(-12, -6))
@snd("tir_556_moyen", 4, -15.5, debit=64, lim=9)
def tir_moyen(i): return echo_ville(tir(f"ffsl/556_moyen_{i}.ogg", 1.3, 3.0), 740 + i, r0=50, dur=1.8, dl0=6, pas=14, n=6, queue=-24, t60=(1.1, 1.4), masque=(-10, -4))
def echo_ville(x, s, r0=150.0, dur=2.6, dl0=12, pas=22, n=7, queue=-20, t60=(1.3, 1.7), masque=(-13, -6)):
    """écho de ville calculé par la physique (sources-images) sur le VRAI coup lointain : chaque façade renvoie une copie du
    coup, en retard du chemin en plus (343 m/s), affaiblie (réflexion d'un mur ≈ −2 dB, divergence r0/(r0+Δ), masquage
    par les angles de rue −6 à −13 dB) et assourdie par l'air ; puis le roulement diffus des rues (T60 1,3 à 1,7 s, réglages
    « Village / rue » du moteur de la boîte à outils)."""
    seed(s); out = silence(dur); place(out, x, 0)
    dls = [dl0 + pas*k + rng.uniform(0, .8*pas) for k in range(n)]    # façades espacées : deux échos ne s'additionnent pas
    for dl in dls:
        g = 10**(-2/20)*r0/(r0 + dl)*10**(rng.uniform(*masque)/20)
        place(out, lp(x, 900 + 2600*r0/(r0 + 2.5*dl)), dl/343.0, g)
    n = int((dur - .04)*SR); t = np.arange(n)/SR; T60 = rng.uniform(*t60)
    ir = lp(rng.standard_normal(n), 1600)*(1 - np.exp(-t/.06))*np.exp(-6.9*t/T60)
    q = sg.fftconvolve(x[:int(.25*SR)], ir)[:n]; q *= 10**((lmax(x) + queue - lmax(q))/20)   # roulement « queue » dB sous le coup
    place(out, q, .04); return out
@snd("tir_556_loin", 4, -17, debit=64, lim=8)   # coup lointain, sans le claquement (le jeu le joue à part quand la balle passe près), écho de ville
def tir_loin(i):
    x, a, b = _loin(i); x = hp(x[b - int(.001*SR):], 80, 4); x = grave(x, 110, 2.0, .8); x = couper(x, 1.3, .4, 0)
    return echo_ville(x, 700 + i)
@snd("tir_silencieux", 4, -21)   # silencieux : le claquement de la balle reste, la détonation devient un « pac » sourd, on entend la culasse
def tir_sil(i):
    x = hp(lire(f"ffsl/556_proche_{i}.ogg"), 80, 4); a = debut(x); x = x[a:]
    corps = nrm(grave(lp(couper(x, .22, .12, 0), 1800, 2), 140, 4))
    cul = lire(f"ffsl/556_culasse_{1 + i % 2}.ogg"); cul = nrm(hp(couper(cul, .07, .03), 900))
    return mixe(.4, (corps, 0, 1), (nrm(lp(craque(i), 6000)), .001, .3), (cul, .012, .3))

# ---------------------------------------------------------------- passage de la balle près de la caméra
@snd("claquement", 6, -16, lim=3)       # balle supersonique qui passe à moins de 2 m : VRAI claquement + réflexion au sol + air déchiré
def claquement(i):
    # onde en N enregistrée à 15-30 m de la trajectoire (0,21-0,25 ms) ; à 1-2 m la loi de Whitham (durée ∝ r^¼, 105 µs à 1 m
    # pour le 5,56, fiche du moteur de la boîte à outils) donne 0,11-0,15 ms : on la raccourcit d'autant (×1,45 à ×1,75)
    c = hauteur(craque(i % 4, .012), [1.6, 1.6, 1.6, 1.6, 1.45, 1.75][i])
    seed(500 + i); out = mixe(.12, (c, 0, 1), (lp(c, 5000), rng.uniform(.003, .008), rng.uniform(.35, .55)))
    w = bp(noise(.05), 900, 5000)*env_ad(int(.05*SR), .001, .03, 2); place(out, nrm(w), .001, .05); return out
@snd("sifflement", 5, -24)       # balle qui passe à 2-4 m : souffle bref qui descend (Doppler) + claquement assourdi au plus près
def sifflement(i):
    seed(520 + i); d = rng.uniform(.14, .22); f0, f1 = rng.uniform(2800, 3400), rng.uniform(900, 1300)
    w = nrm(dsp.sweep_bp(noise(d), f0, f1, 4)*np.hanning(int(d*SR))**1.5)
    c = nrm(lp(hauteur(craque(i % 4, .01), 1.35), 4500))   # 2-4 m : onde en N de ~0,17 ms (Whitham)
    return mixe(d + .05, (w, 0, .45), (c, d*rng.uniform(.4, .55), rng.uniform(.6, .9)))
@snd("ricochet", 5, -23)         # ricochet : « tac » + choc métallique bref puis sifflement qui s'éloigne en vibrant
def ricochet(i):
    seed(540 + i); k = ken(f"impactMetal_light_00{i % 5}", 300, .08, .05); d = rng.uniform(.4, .65)
    w = sifflet(d, rng.uniform(2400, 3400), rng.uniform(900, 1500), 545 + i)
    return mixe(.75, (snap(i), 0, .6), (k, .001, .8), (nrm(w), .008, .45))

# ---------------------------------------------------------------- impacts de balle par matière
# Chaque impact = le vrai « tac » d'arrivée + la matière (vrais enregistrements) + ce qui retombe (gravillons, éclats,
# poussière). Couches normalisées avant mélange : les gains donnent directement leur poids.
def debris(i, g=.25):   # (gardé pour les explosions)
    x = lire(f"cdda/walk_t_gravel_{1 + i % 10}.ogg"); a = debut(x); return hp(couper(x, .12, .08, a), 1500)*g
@snd("impact_beton", 6, -21)     # béton / brique : éclat sec, pierre qui casse, gravillons et poudre qui retombent
def impact_beton(i):
    src = f"cdda/smash_fail_brick{'' if i % 5 == 0 else '_' + str(i % 5)}.ogg" if i < 5 else "cdda/smash_fail_concrete_2.ogg"
    x = nrm(hauteur(couper(hp(lire(src), 180), .22, .1), [1.0, 1.08, .95, 1.12, 1.03, .9][i]))
    m = ken(f"impactMining_00{i % 5}", 300, .18)                         # pic sur la roche (Kenney, CC0)
    seed(560 + i); pou = lp(noise(.25), 3500)*env_ad(int(.25*SR), .01, .2, 2)
    return hp(mixe(.5, (snap(i), 0, .9), (m, .0005, .7), (x, .001, .8), (gravier(i), .02 + .01*i, .45), (nrm(pou), .005, .03)), 200)
@snd("impact_metal", 5, -21)     # conteneur, cuve, barrière : « tac » + « tang » métallique court + vrai coup sur de l'acier
def impact_metal(i):
    x = ken(["impactMetal_light_000", "impactMetal_medium_001", "impactPlate_light_002", "impactMetal_light_003", "impactMetal_medium_004"][i], 200, .4, .3)
    st = nrm(hauteur(amortir(couper(hp(lire("cdda/smash_fail_metal.ogg"), 250), .35, .1), .25), [1, 1.1, .92, 1.05, .97][i]))
    return mixe(.5, (snap(i), 0, .8), (x, .0005, 1), (st, .0005, .45))
@snd("impact_carrosserie", 5, -21)   # portière, capot : « tac » de perforation + « tunk » de tôle creuse (vraie carrosserie)
def impact_carrosserie(i):
    hv = nrm(amortir(couper(hp(lire(f"cdda/hit_vehicle{1 + i % 4}.ogg"), 120), .35, .1), .35))          # Halleck, CC BY
    door = nrm(hauteur(amortir(couper(hp(lire("cdda/close_car_door.ogg"), 140), .2, .08), .15), [1, .94, 1.06, 1, 1.1][i]))   # monotraum, CC0
    tin = ken(f"impactMetal_light_00{(i + 2) % 5}", 1200, .1, .06)
    return mixe(.45, (snap(i), 0, .7), (tin, .0005, .35), (hv, .001, 1), (door, .001, .55))
@snd("impact_verre", 5, -21)     # vitre touchée sans casser : « tchak » sec + fêlure qui crépite
def impact_verre(i):
    src = ["smash_fail_glass_1", "smash_fail_glass_reinforced_1", "smash_fail_glass", "smash_fail_glass_reinforced", "smash_glass"][i]
    x = nrm(couper(hp(lire(f"cdda/{src}.ogg"), 400), .25, .08)); k = ken(f"impactGlass_light_00{i}", 300, .2)
    return mixe(.4, (snap(i, 2500), 0, .8), (x, .0005, 1), (k, .002, .5))
@snd("impact_bois", 4, -22)      # caisses, palettes : « tac » + craquement de bois + échardes (Kenney, CC0)
def impact_bois(i):
    x = ken(f"impactWood_{['light', 'medium'][i % 2]}_00{i}", 120, .25)
    seed(580 + i); sp = bp(noise(.05), 2000, 6000)*env_ad(int(.05*SR), .001, .02)
    return mixe(.35, (snap(i, 1800), 0, .6), (x, .001, 1), (nrm(sp), .004, .12))
@snd("impact_sol", 5, -23)       # terre, asphalte : « tac » + coup mat + gravillons et poussière
def impact_sol(i):
    th = nrm(lp(ken(f"impactSoft_medium_00{i}", 100, .2), 3000)); seed(590 + i)
    pou = lp(noise(.2), 3000)*env_ad(int(.2*SR), .005, .15, 2)
    return hp(mixe(.4, (snap(i, 1800), 0, .7), (th, .001, .8), (gravier(i + 3), .006, .6), (nrm(pou), .004, .06)), 150, 4)
@snd("impact_pneu", 3, -22)      # pneu : choc mat du caoutchouc + court sifflement de l'air qui s'échappe
def impact_pneu(i):
    th = nrm(lp(ken(f"impactSoft_medium_00{i + 1}", 90, .2), 2500)); pu = nrm(lp(ken(f"impactPunch_medium_00{i + 1}", 120, .2), 2500))
    seed(600 + i); d = rng.uniform(.5, .8); t = np.arange(int(d*SR))/SR
    hs = bp(noise(d), 1800, 6000)*env_ad(len(t), .005, d*.8, 1.5)*(1 + .15*np.sin(2*np.pi*rng.uniform(9, 14)*t))
    return hp(mixe(1.0, (snap(i, 2500), 0, .4), (th, .0005, 1), (pu, .001, .6), (nrm(hs), .02, .22)), 140, 4)
@snd("impact_corps", 6, -20)     # balle dans le corps : « tac » discret + coup sourd et mouillé + tissu du treillis
def impact_corps(i):
    fl = nrm(lp(hp(couper(lire(f"cdda/unarmed_hit_flesh_{1 + i % 5}.ogg"), .2, .08), 120), 6000))
    sb = nrm(hp(couper(lire(f"cdda/small_bash_flesh_{1 + i % 4}.ogg"), .15, .06), 150))
    return dsp.peak(mixe(.3, (snap(i, 2500), 0, .25), (fl, .0005, 1), (sb, .002, .6), (chiffon(i), .001, .2)), 900, .8, 3)
@snd("impact_plaque", 5, -17)    # balle arrêtée par la plaque balistique : « tac » dur de céramique/acier + choc sourd transmis au corps + tissu
def impact_plaque(i):
    pl = ken(f"impactPlate_medium_00{i}", 300, .15, .1)
    st = nrm(amortir(couper(hp(lire("cdda/smash_fail_metal.ogg"), 600), .12, .05), .08))
    th = nrm(lp(hp(couper(lire(f"cdda/unarmed_hit_flesh_{1 + (i + 2) % 5}.ogg"), .2, .08), 150), 1200))
    return hp(mixe(.35, (snap(i, 1200), 0, 1.0), (pl, .0003, 1.0), (st, .0005, .4), (th, .002, .7), (chiffon(i + 1), .003, .3)), 120)
@snd("impact_casque", 5, -18)    # balle déviée par un casque : « tink / clang » bref + petit sifflement de la balle qui repart
def impact_casque(i):
    seed(620 + i); k = ken(f"impactMetal_light_00{i}", 1200, .2, .18); p = ken(f"impactPlate_light_00{i}", 1000, .08, .06)
    tok = nrm(lp(ken(f"impactPunch_medium_00{i}", 120, .1), 1500))
    wh = sifflet(rng.uniform(.15, .25), rng.uniform(2600, 3200), rng.uniform(1300, 1800), 620 + i)
    return mixe(.45, (snap(i, 2000), 0, .9), (k, .0003, 1), (p, .0005, .4), (tok, .001, .15), (nrm(wh), .01, .18))
VERRE = ["smash_success_glass_reinforced", "smash_success_glass_reinforced_1", "smash_success_glass_1"]   # CC0 : magnuswaker, logant547, chewiesmissus
@snd("vitre_eclat", 3, -23, debit=56)   # vitre de voiture qui éclate : premier « crac » + bris + pluie de granulés qui tintent au sol
def vitre_eclat(i):
    main = nrm(couper(hp(lire(f"cdda/{VERRE[i]}.ogg"), 250), 1.7, .4))
    crk = nrm(couper(hp(lire("cdda/smash_glass.ogg"), 800), .3, .1))                         # nuncaconoci, CC0
    pl = lire(f"cdda/{VERRE[(i + 1) % 3]}.ogg"); a = debut(pl) + int(.35*SR)
    pluie = nrm(lp(hp(couper(pl, .9, .3, a), 2000), 9000))
    out = mixe(2.0, (snap(i, 2000), 0, .6), (crk, .0005, .7), (main, .004, 1), (pluie, .4, .25)); seed(630 + i)
    for k in range(14):   # derniers granulés qui rebondissent et tintent au sol, de plus en plus rares, jusqu'à ~1,7 s
        t = .5 + 1.2*rng.uniform()**1.6; place(out, hauteur(ken(f"impactGlass_light_00{k % 5}", 1500, .1), rng.uniform(1.2, 1.7)), t, rng.uniform(.05, .16)*(1.8 - t))
    return lp(out, 10000)
@snd("cliquetis_verre", 4, -32)  # petits éclats de verre qui tombent (fin des vrais bris de vitre + petits chocs de verre)
def cliquetis_verre(i):
    x = lire(f"cdda/{VERRE[i % 3]}.ogg"); a = debut(x) + int([.3, .45, .35, .6][i]*SR)
    out = mixe(.75, (nrm(hp(couper(x, .6, .25, a), 1800)), 0, 1)); seed(640 + i)
    for k in range(4): place(out, hauteur(ken(f"impactGlass_light_00{(i + k) % 5}", 1500, .12), rng.uniform(1.1, 1.5)), rng.uniform(0, .45), rng.uniform(.15, .35))
    return lp(out, 10000)
@snd("impact_proche", 5, -18)    # balle qui frappe le sol juste à côté : claquement + « thwip » mat de la terre + gravillons qui volent
def impact_proche(i):
    th = nrm(dsp.peak(lp(ken(f"impactSoft_heavy_00{i}", 160, .25), 2500), 400, 1, 4)); seed(660 + i)
    sab = lp(noise(.3), 3000)*env_ad(int(.3*SR), .01, .22, 2)
    return hp(mixe(.6, (nrm(craque(i)), 0, .8), (th, .002, 1), (snap(i + 1, 1200), .002, .5), (gravier(i + 5, .2), .01, .55), (nrm(sab), .015, .1)), 150, 4)

# ---------------------------------------------------------------- douilles, rechargement, chute
@snd("douilles", 6, -32)         # étuis qui tintent sur le sol (FST180081, CC BY 4.0)
def douilles(i):
    x = hp(lire(f"cdda/brass_eject{'' if i % 2 == 0 else '_1'}.ogg"), 1500); e = np.abs(x); pk, _ = sg.find_peaks(np.convolve(e, np.ones(240)/240, 'same'), distance=int(.15*SR), prominence=e.max()*.05)
    pk = sorted(sorted(pk, key=lambda k: -e[k])[:3]); k = pk[(i // 2) % len(pk)] if i < 4 else pk[-1 - (i % 2)]
    return couper(x, .3, .12, max(0, k - int(.01*SR)))
@snd("recharge", 3, -22)         # chargeur retiré / inséré puis culasse (Free Firearm Sound Library, CC0)
def recharge(i):
    c = hp(lire(f"ffsl/556_chargeur_{i % 2}.ogg"), 120); a = debut(c[:int(1.2*SR)] if i == 2 else c); c = couper(c, 1.0, .15, max(0, a - int(.05*SR)))
    k = hp(lire(f"ffsl/556_culasse_{i}.ogg"), 150); k = couper(k, .45, .1)
    return mixe(1.8, (c, 0, 1), (k, 1.05 + .08*i, .9))
@snd("chute", 4, -22)            # un corps qui tombe avec son équipement : choc sourd + tissu + cliquetis + gravillons (Kenney, MWsfx, ali-6868 : CC0)
def chute(i):
    a = nrm(couper(hp(lire(f"kenney/impactSoft_heavy_00{i}.ogg"), 60), .3, .1)); b = nrm(couper(lire(f"kenney/impactPunch_medium_00{(i + 2) % 5}.ogg"), .3, .1))
    m = ken(f"impactMetal_light_00{(i + 1) % 5}", 800, .15, .1)
    return hp(lp(mixe(.6, (a, 0, 1), (chiffon(i, .2), .01, .3), (b, .09 + .02*i, .6), (m, .1 + .03*i, .12), (gravier(i + 2), .1, .15)), 7000), 90, 4)
@snd("equipement", 4, -33)       # frottement d'équipement quand on court (MWsfx, CC0)
def equipement(i):
    x = hp(lire(f"cdda/clear_obstacle_{2 + i % 2}.ogg"), 250); return hauteur(couper(x, .3, .1), [1, 1.06, .94, 1.1][i])

# ---------------------------------------------------------------- pas
@snd("pas", 6, -27)              # vrais pas sur sol de pierre (samulis, CC0) — choisis par l'utilisateur ; remplacent les pas de synthèse
def pas(i):
    x = hp(lire(f"cdda/walk_t_rock_floor_{1 + i % 4}.ogg"), 100); return hauteur(couper(x, .3, .1), [1, 1, 1, 1, 1.05, .95][i])
@snd("pas_mouille", 6, -27)      # pas dans les flaques (nathanaelj83 CC0, duckduckpony CC BY)
def pas_mouille(i):
    x = hp(lire(f"cdda/walk_t_water_sh_{i + 1}.ogg"), 150); return couper(x, .24, .08)

# ---------------------------------------------------------------- explosions (grenade : CC0 j1987 / CC BY 3.0 bmlake ; lourde : CC0 unfa)
@snd("explosion", 3, -6, debit=64)
def explosion(i):
    # refait le 21/10 (« explosions nulles ») : avant, un coup très grave (60 % de l'énergie sous 200 Hz, inaudible sur un
    # portable) à peine plus fort qu'un tir. Maintenant : claquement sec de l'onde de choc, corps dans les médiums (le
    # « boum » qu'on entend même sur de petits haut-parleurs, harmoniques du grave), queue plus longue de l'enregistrement,
    # échos sur les façades autour du parking, gravillons qui retombent ; +5 dB par rapport à avant.
    g = hp(lire(f"ffsl/grenade_{i}.ogg"), 30); g = couper(g, 1.6, .5)
    seed(610 + i)
    crack = hp(noise(.02), 900)*env_ad(int(.02*SR), .0003, .012, 3)
    boom = lp(dsp.resonator(noise(1.4), rng.uniform(42, 55), 1.6)*env_ad(int(1.4*SR), .002, .8), 180)
    boom = boom/np.abs(boom).max()
    harm = bp(soft_clip(boom*3.0, 2.5), 110, 700)          # harmoniques du grave : le boum devient audible sur un portable
    corps = bp(g, 140, 1100)                                # médiums de l'enregistrement, renforcés
    sec = mixe(1.8, (crack, 0, .9), (g, 0, 1.5), (corps, 0, .9), (boom, 0, .7), (harm, .004, .45))
    out = silence(3.6); place(out, sec, 0)
    for d, a in [(.11, .32), (.19, .26), (.34, .2), (.55, .13), (.8, .08)]:   # échos des façades (le son revient, plus sourd)
        place(out, lp(sec, 2200 - d*1500), d + rng.uniform(-.015, .015), a)
    out = reverb(out, "outdoor", .55).mean(0)[:len(out)]
    for k in range(9): place(out, debris(k + i, .2), rng.uniform(.25, 1.6))   # gravillons qui retombent
    return out
@snd("explosion_lourde", 2, -10)  # obus, frappe aérienne
def explosion_lourde(i):
    x = hp(lire(f"ffsl/lourde_{i}.ogg"), 25); return couper(x, 2.8, .8)

# ---------------------------------------------------------------- ambiances (boucles stéréo) et ponctuations
@snd("pluie", 1, -33, fen=2.0, debit=48, st=True)        # pluie sur les toits et le sol, gouttes (sergeeo, CC BY 3.0) — choisie par l'utilisateur
def pluie(i): return boucle_st(hp(lire("cdda/night_rain.ogg"), 90), 22, 2.0)
@snd("pluie_courte", 1, -33, fen=2.0, debit=32, st=True) # même pluie, boucle courte (incluse dans la page)
def pluie_courte(i): return boucle_st(hp(lire("cdda/night_rain.ogg"), 90), 8, 1.5, 12)
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
            x = fn(i); cf0 = 20*np.log10(np.abs(x).max() + 1e-12) - lmax(x, fen)
            x = niveau(x, db, fen, lim=LIM[name]); lim = cf0 - (20*np.log10(np.abs(x).max() + 1e-12) - lmax(x, fen))   # dB écrasés par le limiteur
            f = dsp.write(f"{name}_{i}", x, OUT, mono=name not in STEREO, br=DEBIT[name]); os.remove(f[:-4] + ".wav"); files.append(os.path.basename(f))
            print(f"{name}_{i}  {x.shape[-1]/SR:5.2f}s  L50 {lmax(x, .05):6.1f}  crête {20*np.log10(np.abs(x).max() + 1e-12):5.1f}  limiteur {lim:4.1f} dB  {os.path.getsize(f)} o", flush=True)
        man[name] = files
    json.dump(man, open(mp, "w"), indent=1)
    print("total", len(man), "sons,", round(sum(os.path.getsize(os.path.join(OUT, f)) for v in man.values() for f in v)/1024), "Ko")
