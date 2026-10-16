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
