# Bruitages d'OPERATOR TACTICS — synthèse hors ligne avec la boîte à outils (dsp.py).
# Rendu : python3 ../../natchyyyy/calcul-mental-cm1/boite-a-outils/sons/fabriquer.py sons_ot --sortie out --debit 40
# Niveaux (rms dB) réglés les uns par rapport aux autres : tirs forts, impacts et pas discrets, interface très discrète.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'natchyyyy', 'calcul-mental-cm1', 'boite-a-outils', 'sons'))
from dsp import *

S = {}
STEREO = set()
def snd(name, n=1, rms=-24):
    def deco(f): S[name] = (f, n, rms); return f
    return deco

def crack(dur_crack, bright, body_f, body_dec, boom, kind="outdoor", wet=.18, sweep=(9000, 1500)):
    """détonation : claquement (bruit filtré décroissant), corps grave résonant, souffle"""
    n = int(.6*SR); out = np.zeros(n)
    c = noise(dur_crack); c = sweep_lp(c, sweep[0], sweep[1])*env_ad(len(c), .0004, dur_crack*.5, 3)
    c = hp(c, bright); place(out, c, 0)
    b = noise(.3); b = resonator(b, body_f, 3.0)*env_ad(len(b), .001, body_dec) * boom
    place(out, lp(b, body_f*4), .002)
    tail = lp(noise(.35), 1400)*env_ad(int(.35*SR), .004, .09)*.35
    place(out, tail, .004)
    return reverb(soft_clip(out, 1.6), kind, wet)

@snd("tir_fusil", 4, -16)        # carabine / fusil de combat : claquement sec, corps moyen
def tir_fusil(i):
    seed(100 + i); return crack(.035, 400, rng.uniform(110, 140), .09, 1.4)

@snd("tir_pm", 4, -18)           # pistolet-mitrailleur : plus court, plus aigu
def tir_pm(i):
    seed(110 + i); return crack(.022, 600, rng.uniform(160, 200), .06, .9, sweep=(10000, 2500))

@snd("tir_precision", 3, -14)    # fusil de précision : détonation longue et profonde
def tir_precision(i):
    seed(120 + i); return crack(.06, 250, rng.uniform(80, 100), .16, 2.2, wet=.25, sweep=(7000, 900))

@snd("tir_mitrailleuse", 4, -16) # mitrailleuse : comme le fusil, un peu plus lourd
def tir_mitrailleuse(i):
    seed(130 + i); return crack(.04, 350, rng.uniform(100, 125), .11, 1.7)

@snd("tir_pompe", 3, -13)        # fusil à pompe : gros boum
def tir_pompe(i):
    seed(140 + i); return crack(.07, 180, rng.uniform(70, 90), .2, 2.8, wet=.25, sweep=(6000, 700))

@snd("tir_silencieux", 4, -26)   # PM silencieux : « pfft » sourd et court
def tir_silencieux(i):
    seed(150 + i); n = int(.25*SR); out = np.zeros(n)
    p = lp(noise(.05), 1800)*env_ad(int(.05*SR), .0008, .03); place(out, p, 0)
    place(out, resonator(noise(.12), 220, 2.5)*env_ad(int(.12*SR), .002, .05)*.5, .003)
    return reverb(out, "small", .1)

@snd("impact_beton", 5, -28)     # balle dans un mur / une caisse : éclat bref et clair
def impact_beton(i):
    seed(160 + i); n = int(.2*SR); out = np.zeros(n)
    c = bp(noise(.03), 1800, 7500)*env_ad(int(.03*SR), .0005, .015, 3); place(out, c, 0)
    k = modal(.12, [(rng.uniform(1900, 2600), .5, .03), (rng.uniform(3800, 4600), .25, .015)], strike=.4, hard=.7); place(out, k*.6, .002)
    if i % 2 == 0:   # un ricochet sur deux : sifflement qui descend
        w = sweep_bp(noise(.14), 4200, 1600, 12)*env_ad(int(.14*SR), .005, .08)*.25; place(out, w, .01)
    return reverb(out, "outdoor", .2)

@snd("impact_corps", 4, -26)     # balle qui touche : coup sourd, mat
def impact_corps(i):
    seed(170 + i); n = int(.2*SR); out = np.zeros(n)
    t = lp(noise(.08), 450)*env_ad(int(.08*SR), .001, .04); place(out, t, 0)
    place(out, resonator(noise(.1), rng.uniform(90, 120), 2.0)*env_ad(int(.1*SR), .001, .05)*.8, .001)
    return reverb(hp(out, 40), "small", .08)

@snd("pas", 6, -32)              # pas sur un sol dur (repris de la boîte à outils)
def pas(i):
    seed(40 + i); r = rng.uniform; out = silence(.3)
    n = noise(.08); thud = lp(n, 900)*env_ad(len(n), .0012, .03) + resonator(noise(.08)*env_ad(len(n), .001, .025), r(95, 140), 2.5)*1.6
    place(out, thud, 0); place(out, bp(noise(.012), 2200, 7000)*env_ad(int(.012*SR), .0003, .006)*.3, .001)
    t2 = r(.055, .08); toe = lp(noise(.07), 1100)*env_ad(int(.07*SR), .003, .035); place(out, toe*.45, t2)
    return reverb(hp(out, 45), "outdoor", .08)

@snd("recharge", 3, -27)         # chargeur qui sort puis s'enclenche : deux clics métalliques
def recharge(i):
    seed(180 + i); out = silence(.9)
    a = modal(.1, [(2400, 1, .03), (3100, .5, .02), (900, .4, .04)], strike=.6, hard=.6); place(out, a*.7, 0)
    b = modal(.15, [(1500, 1, .05), (2200, .6, .03), (640, .5, .06)], strike=1, hard=.5); place(out, b, rng.uniform(.45, .6))
    c = modal(.08, [(3300, .8, .02), (5000, .3, .01)], strike=.4, hard=.8); place(out, c*.5, rng.uniform(.62, .72))
    return reverb(out, "small", .12)

@snd("clic", 3, -36)             # interface
def clic(i):
    seed(10 + i); f = 1750 + 140*i
    y = modal(.09, [(f, 1, .028), (f*2.31, .35, .012), (f*3.86, .16, .006), (f*.52, .25, .02)], strike=.6, hard=.45)
    return reverb(lp(y, 7500), "small", .10)

@snd("contact", 1, -22)          # premier contact : un coup de grosse caisse sourd
def contact(i):
    seed(190); out = silence(1.2)
    place(out, resonator(noise(.5), 62, 4)*env_ad(int(.5*SR), .002, .35)*2.5, 0)
    place(out, lp(noise(.06), 700)*env_ad(int(.06*SR), .001, .03)*.6, 0)
    return reverb(soft_clip(out, 1.3), "hall", .3)

@snd("victoire", 1, -24)         # deux notes de marimba qui montent
def victoire(i):
    seed(200); out = silence(1.6); place(out, marimba(note(67), 1.3, .9, .4), 0); place(out, marimba(note(74), 1.4, 1.0, .4), .22)
    return reverb(out, "hall", .3)

@snd("defaite", 1, -24)          # deux notes qui descendent, sourdes
def defaite(i):
    seed(201); out = silence(1.8); place(out, marimba(note(62), 1.5, .9, .6), 0); place(out, marimba(note(57), 1.7, 1.0, .6), .3)
    return reverb(out, "hall", .35)

STEREO = {"ambiance_port", "ambiance_ville"}

@snd("ambiance_port", 1, -38)    # boucle : vent, mer lointaine, grincements métalliques (entrepôt, raffinerie)
def ambiance_port(i):
    seed(300); d = 8.0; t = t_(d)
    wind = sweep_bp(noise(d, "pink"), 250, 700, 1.4)*(.55 + .45*np.sin(2*np.pi*t/d*2)**2)
    sea = lp(noise(d, "brown"), 300)*(.5 + .5*np.sin(2*np.pi*t/d*1 + 1)**2)*.8
    out = lp(wind, 2200)*.6 + sea*.5
    for k in range(5):   # grincements
        x = np.zeros(int(.5*SR)); x[0] = 1; g = resonator(x, rng.uniform(400, 900), 40)*env_ad(len(x), .02, .3)*.12
        place(out, g, rng.uniform(.5, d - 1))
    # boucle propre : fondu croisé des extrémités
    n = int(.5*SR); w = np.linspace(0, 1, n); out[:n] = out[:n]*w + out[-n:]*(1 - w); out = out[:-n]
    return reverb(stereo(out, 0, .6, 12), "outdoor", .25)

@snd("ambiance_ville", 1, -38)   # boucle : rumeur urbaine, circulation lointaine (place du marché)
def ambiance_ville(i):
    seed(301); d = 8.0; t = t_(d)
    hum = lp(noise(d, "brown"), 180)*(.6 + .4*np.sin(2*np.pi*t/d*3)**2)
    traffic = sweep_bp(noise(d, "pink"), 150, 500, 1.2)*.5
    out = hum*.7 + lp(traffic, 1500)*.5
    for k in range(3):   # klaxon lointain filtré
        x = np.sin(2*np.pi*rng.uniform(380, 460)*t_(.35))*env_ad(int(.35*SR), .02, .25); place(out, lp(x, 1200)*.05, rng.uniform(1, d - 1))
    n = int(.5*SR); w = np.linspace(0, 1, n); out[:n] = out[:n]*w + out[-n:]*(1 - w); out = out[:-n]
    return reverb(stereo(out, 0, .6, 12), "outdoor", .2)

STEREO |= {"musique_qg", "musique_bataille", "musique_titre"}

def pad(freqs, d, det=.3, lp_f=1800):
    """nappe : sommes de sinus légèrement désaccordés, souffle, lente ondulation"""
    t = t_(d); out = np.zeros(len(t))
    for f in freqs:
        for k, g in [(1, 1), (2, .35), (3, .12)]:
            out += g*(np.sin(2*np.pi*f*k*t) + np.sin(2*np.pi*f*k*(1 + det/100)*t + 1.3))/len(freqs)
    out *= (.7 + .3*np.sin(2*np.pi*t/d*3 + .5))
    return lp(out, lp_f)

def kick(f0=60, d=.5):
    t = t_(d); ph = 2*np.pi*(f0*t + 40*(1 - np.exp(-t/.05))*.05*t)
    return np.sin(2*np.pi*f0*t)*env_ad(len(t), .001, .25) + lp(noise(d), 300)*env_ad(len(t), .0005, .03)*.4

def loopable(out, fade_s=.6):
    n = int(fade_s*SR); w = np.linspace(0, 1, n); out[:n] = out[:n]*w + out[-n:]*(1 - w); return out[:-n]

@snd("musique_qg", 1, -34)          # QG : nappe en ré mineur, battement lent, discret (boucle 16 s)
def musique_qg(i):
    seed(400); d = 16.6; out = silence(d)
    prog = [[73.4, 110, 146.8, 174.6], [69.3, 103.8, 138.6, 164.8], [58.3, 87.3, 116.5, 146.8], [65.4, 98, 130.8, 155.6]]  # Dm, Bb(no5)…
    for k, ch in enumerate(prog):
        seg = pad(ch, 4.15, .35, 1500)*env_ad(int(4.15*SR), .8, 6.0, 2); place(out, seg*.25, k*4.15)
    for k in range(16): place(out, kick(55, .5)*.35, k*1.0375 + .02)
    for k in range(8): place(out, hp(noise(.08), 5000)*env_ad(int(.08*SR), .001, .04)*.05, k*2.075 + 1.0375)
    out = loopable(out, .6)
    out += lp(noise(len(out)/SR + .01, "pink")[:len(out)], 300)*.003
    return reverb(stereo(out, 0, .5, 10), "hall", .35)

@snd("musique_bataille", 1, -33)    # bataille : pulsation tendue, basse en ostinato, cordes synthétiques (boucle 12 s)
def musique_bataille(i):
    seed(401); d = 12.6; out = silence(d); bpm = 100; beat = 60/bpm
    bass = [36.7, 36.7, 43.65, 41.2]  # D, D, G, F
    for bar in range(4):
        f = bass[bar]
        for k in range(8):
            t0 = bar*4*beat + k*beat/2; x = np.sin(2*np.pi*f*t_(.22))*env_ad(int(.22*SR), .002, .12); place(out, lp(x, 400)*.5, t0)
        ch = pad([f*4, f*6, f*8], 4*beat, .25, 2200)*env_ad(int(4*beat*SR), .3, 5, 2); place(out, ch*.14, bar*4*beat)
    for k in range(16): place(out, kick(50, .4)*.5, k*beat)
    for k in range(8): place(out, kick(140, .15)*.25, k*2*beat + beat); place(out, bp(noise(.1), 1500, 4000)*env_ad(int(.1*SR), .001, .05)*.15, k*2*beat + beat)
    for k in range(32): place(out, hp(noise(.05), 6000)*env_ad(int(.05*SR), .001, .025)*.04, k*beat/2)
    out = out[:int(16*beat*SR)]  # exactement 4 mesures
    out = loopable(out, .4)
    out += lp(noise(len(out)/SR + .01, "pink")[:len(out)], 300)*.004   # léger souffle : évite la coupe du silence final (trim) et garde la boucle entière
    return reverb(stereo(out, 0, .4, 8), "room", .2)

@snd("musique_titre", 1, -32)       # titre : montée de nappe + grosse percussion (one-shot 6 s)
def musique_titre(i):
    seed(402); d = 6.0; out = silence(d)
    seg = pad([73.4, 110, 146.8, 220], 5.5, .4, 2400)*env_ad(int(5.5*SR), 2.2, 4.0, 1.5); place(out, seg*.35, 0)
    place(out, kick(45, 1.2)*.9, 2.2); place(out, kick(45, 1.2)*.7, 2.2 + .55); place(out, kick(40, 2.0)*1.0, 3.3)
    place(out, lp(noise(1.5), 900)*env_ad(int(1.5*SR), .05, .6)*.25, 3.3)
    return reverb(stereo(out, 0, .6, 12), "hall", .4)
