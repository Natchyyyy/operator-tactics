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

@snd("impact_metal", 4, -27)     # balle dans un conteneur, une voiture, une cuve : tintement métallique résonant
def impact_metal(i):
    seed(260 + i); n = int(.45*SR); out = np.zeros(n)
    c = hp(noise(.012), 2500)*env_ad(int(.012*SR), .0003, .006, 3); place(out, c, 0)
    f0 = rng.uniform(700, 1100)
    k = modal(.4, [(f0, .6, .22), (f0*2.76, .35, .12), (f0*5.4, .2, .06), (rng.uniform(3200, 4200), .15, .04)], strike=.6, hard=.9); place(out, k*.7, .001)
    return reverb(out, "outdoor", .18)

@snd("impact_bois", 4, -27)      # balle dans une caisse, des palettes : craquement sec et creux
def impact_bois(i):
    seed(280 + i); n = int(.22*SR); out = np.zeros(n)
    c = bp(noise(.025), 600, 3500)*env_ad(int(.025*SR), .0005, .012, 3); place(out, c, 0)
    k = modal(.1, [(rng.uniform(380, 520), .5, .035), (rng.uniform(900, 1300), .3, .02)], strike=.5, hard=.4); place(out, k*.8, .001)
    sp = bp(noise(.06), 2000, 6000)*env_ad(int(.06*SR), .002, .025)*.3; place(out, sp, .006)   # échardes
    return reverb(out, "outdoor", .12)

@snd("impact_sol", 4, -30)       # balle dans le sol ou des sacs de sable : coup mat et poussière
def impact_sol(i):
    seed(300 + i); n = int(.25*SR); out = np.zeros(n)
    t = lp(noise(.05), 900)*env_ad(int(.05*SR), .0008, .025); place(out, t, 0)
    d = bp(noise(.18), 300, 2200)*env_ad(int(.18*SR), .01, .09)*.35; place(out, d, .01)
    return reverb(out, "outdoor", .15)

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

@snd("explosion", 3, -12)       # grenade / obus : coup sourd très grave, souffle, débris qui retombent
def explosion(i):
    seed(210 + i); out = silence(2.2)
    b = resonator(noise(1.0), rng.uniform(38, 50), 1.6)*env_ad(int(1.0*SR), .002, .55)*3.2; place(out, lp(b, 180), 0)
    c = lp(noise(.25), 2600)*env_ad(int(.25*SR), .0008, .09, 2.5)*1.4; place(out, c, 0)
    w = lp(noise(1.4), 700)*env_ad(int(1.4*SR), .02, .7)*.55; place(out, w, .01)
    for k in range(9):        # graviers, éclats
        g = bp(noise(.02), 2500, 7000)*env_ad(int(.02*SR), .0004, .008)*rng.uniform(.08, .2); place(out, g, rng.uniform(.25, 1.5))
    return reverb(soft_clip(out, 1.8), "outdoor", .35)

@snd("flashbang", 2, -12)        # grenade incapacitante : détonation sèche et claquante, puis sifflement d'oreille
def flashbang(i):
    seed(220 + i); out = silence(2.4)
    c = hp(noise(.12), 900)*env_ad(int(.12*SR), .0003, .03, 3)*2.2; place(out, c, 0)
    place(out, resonator(noise(.3), 140, 2.5)*env_ad(int(.3*SR), .001, .08)*1.2, 0)
    t = np.sin(2*np.pi*rng.uniform(3600, 4200)*t_(2.0))*env_ad(int(2.0*SR), .05, 1.2, 2)*.12; place(out, t, .05)
    return reverb(soft_clip(out, 1.5), "outdoor", .25)

@snd("grenade_rebond", 3, -30)   # la grenade touche le sol : tintement métallique sourd, deux rebonds
def grenade_rebond(i):
    seed(230 + i); out = silence(.6)
    for k, (at, g) in enumerate([(0, 1), (rng.uniform(.14, .2), .55), (rng.uniform(.28, .34), .25)]):
        m = modal(.12, [(rng.uniform(1100, 1400), 1, .03), (rng.uniform(2600, 3000), .4, .015), (420, .5, .04)], strike=.7, hard=.6); place(out, m*g, at)
    return reverb(out, "outdoor", .12)

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

# ======================================================================================================================
# Musiques façon jeu d'origine (orchestre militaire synthétisé : cordes en ostinato, cuivres, timbales, caisse claire de
# marche, taïkos). Elles remplacent les premières versions (même nom → même place dans le jeu).
# ======================================================================================================================
def saw(f, d, det=0.0):
    """dent de scie à bande limitée (somme d'harmoniques), légère dérive de hauteur"""
    t = t_(d); out = np.zeros(len(t)); nh = int(min(40, 9000 / max(f, 30)))
    vib = 1 + .0025 * np.sin(2 * np.pi * 5.2 * t + det * 7)
    ph = 2 * np.pi * f * (1 + det / 100) * np.cumsum(vib) / SR
    for k in range(1, nh + 1): out += np.sin(k * ph) / k * (1 if k % 2 else .85)
    return out * .6
def strings(f, d, vel=1.0, att=.04, rel=.25, bright=2600):
    """section de cordes : trois dents de scie désaccordées, filtre, enveloppe attaque / tenue / relâche"""
    x = (saw(f, d, -.18) + saw(f, d, .0) + saw(f, d, .2)) / 3
    n = len(x); e = np.ones(n); a = int(att * SR); r = int(min(rel, d * .6) * SR)
    e[:a] = np.linspace(0, 1, a) ** 1.5; e[n - r:] *= np.linspace(1, 0, r) ** 2
    return lp(x, bright, 2) * e * vel
def brass(f, d, vel=1.0, swell=.08, bright=1800):
    """cuivres : dent de scie, filtre qui s'ouvre à l'attaque (« blat »), léger vibrato tardif"""
    x = (saw(f, d, -.1) + saw(f * 2, d, .12) * .35 + saw(f, d, .15)) / 2.2
    n = len(x); t = np.arange(n) / SR
    cut = bright * (.35 + .65 * (1 - np.exp(-t / max(swell, .01)))) * (1 + .5 * vel)
    y = np.zeros(n); blk = 512
    for s0 in range(0, n, blk): y[s0:s0 + blk] = lp(x[max(0, s0 - 2048):s0 + blk], float(cut[s0]), 2)[-(min(blk, n - s0)):]
    e = np.ones(n); a = int(.03 * SR); r = int(min(.3, d * .5) * SR); e[:a] = np.linspace(0, 1, a); e[n - r:] *= np.linspace(1, 0, r) ** 2
    return soft_clip(y * e * vel, 1.3)
def timpani(f, vel=1.0, d=1.6):
    x = modal(d, [(f, 1.0, .9), (f * 1.5, .5, .6), (f * 1.99, .3, .45), (f * 2.44, .2, .35)], strike=vel, att=.002, hard=.3)
    y = lp(x, 900); hit = lp(noise(.06), 500) * env_ad(int(.06 * SR), .001, .02) * .3 * vel; y[:len(hit)] += hit; return y
def taiko(vel=1.0, f=62):
    t = t_(.9); body = np.sin(2 * np.pi * (f * t + 30 * (1 - np.exp(-t / .03)) * .03)) * env_ad(len(t), .001, .35, 3)
    return (body + lp(noise(.9), 700) * env_ad(len(t), .001, .05) * .5) * vel
def snare(vel=1.0, d=.22):
    n = noise(d); tone = np.sin(2 * np.pi * 185 * t_(d)) * env_ad(int(d * SR), .001, .05)
    return (bp(n, 1800, 7000) * env_ad(len(n), .001, d * .35, 3) * .9 + tone * .5) * vel
def roll(dur, vel=.5):
    out = silence(dur); k = 0
    while k * .045 < dur - .1: place(out, snare(vel * (.6 + .4 * k * .045 / dur), .12), k * .045); k += 1
    return out
def cymbal(d=2.5, vel=.5):
    x = hp(noise(d), 5000) * env_ad(int(d * SR), .002, d * .45, 2); return x * vel
MI = lambda m: 440 * 2 ** ((m - 69) / 12)

@snd("musique_qg", 1, -30)           # QG : marche en ré mineur — caisse claire, cordes en ostinato, thème de cuivres (boucle ~29 s)
def musique_qg(i):
    seed(410); bpm = 100; b = 60 / bpm; bars = 12; d = bars * 4 * b + 1.0; out = silence(d)
    roots = [38, 38, 34, 36, 38, 38, 33, 33, 34, 36, 38, 33]          # D D Bb C D D A A Bb C D A (basse, MIDI)
    chords = {38: [50, 53, 57], 34: [46, 50, 53], 36: [48, 52, 55], 33: [45, 49, 52]}
    for bar, r in enumerate(roots):
        t0 = bar * 4 * b
        for k in range(8):   # ostinato de cordes graves : croches, accent sur les temps
            place(out, strings(MI(r + 12), b / 2 * .9, .55 if k % 2 else .8, .01, .06, 1500), t0 + k * b / 2)
        place(out, strings(MI(r), 4 * b, .35, .2, .6, 900), t0)
        for m in chords[r]: place(out, strings(MI(m + 12), 4 * b, .12, .5, .8, 2200), t0)     # tenue aiguë douce
        place(out, timpani(MI(r + 12) / 2 if r > 36 else MI(r + 12), .8), t0)
        for k, v in [(0, .7), (1.5, .35), (2, .55), (3, .45), (3.5, .3)]: place(out, snare(v * .55), t0 + k * b)   # caisse claire de marche
        if bar % 4 == 3: place(out, roll(2 * b, .45), t0 + 2 * b)
    theme = [(0, 62, 2), (2, 65, 1), (3, 69, 1), (4, 70, 3), (7, 69, 1), (8, 67, 2), (10, 65, 2), (12, 69, 4),
             (16, 62, 2), (18, 65, 1), (19, 69, 1), (20, 74, 3), (23, 72, 1), (24, 70, 2), (26, 69, 2), (28, 69, 4),
             (32, 70, 2), (34, 69, 2), (36, 67, 2), (38, 65, 2), (40, 64, 2), (42, 61, 2), (44, 62, 4)]
    for beat0, m, ln in theme: place(out, brass(MI(m - 12), ln * b * .95, .55, .12, 1500), beat0 * b + 4 * b * 0)
    for beat0, m, ln in theme: place(out, brass(MI(m - 24), ln * b * .95, .3, .12, 900), beat0 * b)
    place(out, cymbal(3, .25), 0)
    out = out[:int(bars * 4 * b * SR)]; out = loopable(out, .5)
    return reverb(stereo(out, 0, .55, 14), "hall", .3)

@snd("musique_bataille", 1, -30)     # bataille : taïkos, cordes staccato rapides, coups de cuivres (boucle ~22 s)
def musique_bataille(i):
    seed(411); bpm = 132; b = 60 / bpm; bars = 12; d = bars * 4 * b + 1.0; out = silence(d)
    roots = [38, 38, 41, 40, 38, 38, 34, 36, 38, 41, 43, 45]
    for bar, r in enumerate(roots):
        t0 = bar * 4 * b
        for k in range(16):   # doubles croches de cordes, motif répété
            m = r + 12 + [0, 0, 12, 0, 0, 7, 0, 12][k % 8]
            place(out, strings(MI(m), b / 4 * .8, .5 if k % 4 else .75, .006, .03, 2600), t0 + k * b / 4)
        for k, v in [(0, 1), (.75, .5), (1.5, .7), (2, 1), (2.5, .45), (3, .8), (3.5, .6)]: place(out, taiko(v * .8, 58 if k % 2 == 0 else 70), t0 + k * b)
        if bar % 2 == 1: place(out, brass(MI(r + 12), b * .9, .8, .03, 2400), t0 + 2 * b); place(out, brass(MI(r + 19), b * .9, .6, .03, 2400), t0 + 2 * b)
        if bar % 4 == 0: place(out, brass(MI(r + 12), 2 * b, .6, .2, 1800), t0); place(out, cymbal(2, .18), t0)
        for k in range(8): place(out, hp(noise(.04), 7000) * env_ad(int(.04 * SR), .001, .02) * .06, t0 + k * b / 2 + b / 4)
    out = out[:int(bars * 4 * b * SR)]; out = loopable(out, .3)
    return reverb(stereo(out, 0, .45, 10), "room", .22)

@snd("musique_titre", 1, -28)        # titre : roulement, accord de cuivres qui monte, coups de timbales (one-shot ~7 s)
def musique_titre(i):
    seed(412); d = 7.5; out = silence(d)
    place(out, roll(2.2, .5), 0); place(out, cymbal(4, .35), 2.2)
    for m, v in [(50, .7), (57, .55), (62, .6), (65, .45), (69, .4)]: place(out, brass(MI(m - 12), 4.6, v, .5, 2000), 2.2)
    for m in [38, 45, 50]: place(out, strings(MI(m), 4.8, .35, .3, 1.2, 1200), 2.2)
    for k, t0 in enumerate([2.2, 2.75, 3.3, 5.2]): place(out, timpani(MI(38), .9 if k < 3 else 1.1), t0); place(out, taiko(.8), t0)
    return reverb(stereo(out, 0, .6, 12), "hall", .38)

@snd("victoire", 1, -22)             # victoire : courte fanfare en ré majeur
def victoire(i):
    seed(413); out = silence(4.0); b = .2
    for t0, m, ln in [(0, 62, 1), (1, 66, 1), (2, 69, 1), (3, 74, 6)]: place(out, brass(MI(m - 12), ln * b * 1.4, .8, .03, 2600), t0 * b); place(out, brass(MI(m - 24), ln * b * 1.4, .4, .03, 1600), t0 * b)
    for m in [50, 54, 57]: place(out, strings(MI(m), 2.6, .3, .1, .9, 2400), 3 * b)
    place(out, timpani(MI(38), 1.0), 3 * b); place(out, cymbal(2.5, .3), 3 * b)
    return reverb(stereo(out, 0, .5, 10), "hall", .32)

@snd("defaite", 1, -22)              # défaite : accord mineur grave qui s'éteint
def defaite(i):
    seed(414); out = silence(4.2)
    for t0, m in [(0, 62), (.45, 60), (.9, 58)]: place(out, brass(MI(m - 12), .9, .55, .1, 1200), t0)
    for m in [46, 50, 53]: place(out, strings(MI(m - 12), 3.0, .3, .3, 1.5, 900), 1.3)
    place(out, timpani(MI(34), .9, 2.4), 1.3)
    return reverb(stereo(out, 0, .4, 10), "hall", .35)
STEREO |= {"victoire", "defaite"}
