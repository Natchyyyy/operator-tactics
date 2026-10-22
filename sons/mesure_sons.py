# Mesure objective de bruitages (on ne peut pas les écouter) : niveau, attaque, durée utile, brillance, répartition
# de l'énergie par bandes. Sert à comparer nos sons à de vrais enregistrements du même phénomène.
# usage : python3 sons/mesure_sons.py fichier1.ogg [fichier2 …]   (ou des dossiers / motifs glob)
#   M400  : sonie momentanée max (400 ms, pondération K de la norme ITU-R BS.1770, ≈ LUFS) — pour comparer les volumes
#   L50   : puissance max sur 50 ms (dB)          crête : dB
#   att   : temps de montée 10 %→90 % de l'enveloppe 1 ms (ms)
#   d40   : durée jusqu'à ce que l'enveloppe 10 ms passe 40 dB sous son max (s)
#   cent  : centre de gravité du spectre (Hz) sur les 200 premières ms — « brillance »
#   bandes: part de l'énergie (dB relatifs au total) : <150 | 150-600 | 600-2k | 2k-6k | >6k Hz
import sys, os, glob, subprocess, numpy as np, scipy.signal as sg
SR = 48000
def lire(f):
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", f, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True)
    return np.frombuffer(r.stdout, np.float32).astype(np.float64)
def env(x, ms):
    w = max(1, int(SR*ms/1000)); return np.sqrt(np.convolve(x**2, np.ones(w)/w, "same") + 1e-18)
def kpond(x):
    """pondération K de la norme ITU-R BS.1770 (48 kHz) : l'oreille, plus sensible aux aigus, moins aux graves"""
    x = sg.lfilter([1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585], x)
    return sg.lfilter([1.0, -2.0, 1.0], [1, -1.99004745483398, 0.99007225036621], x)
def m400(x):
    """sonie « momentanée » max (fenêtre 400 ms, pondération K), en dB ≈ LUFS : compare des sons de durées différentes"""
    k = kpond(x); w = int(.4*SR); c = np.concatenate([[0], np.cumsum(k**2)])
    p = ((c[w:] - c[:-w])/w).max() if len(k) > w else c[-1]/w
    return -0.691 + 10*np.log10(p + 1e-15)
def mesure(x):
    out = {"M400": m400(x)}
    w = int(.05*SR); c = np.concatenate([[0], np.cumsum(x**2)])
    out["L50"] = 10*np.log10(((c[w:] - c[:-w])/w).max() + 1e-15) if len(x) > w else 10*np.log10(c[-1]/w + 1e-15)
    out["crete"] = 20*np.log10(np.abs(x).max() + 1e-12)
    e1 = env(x, 1); m = e1.max(); i90 = int(np.argmax(e1 > .9*m)); i10 = int(np.argmax(e1 > .1*m))
    out["att"] = (i90 - i10)/SR*1000
    e10 = 20*np.log10(env(x, 10) + 1e-12); k = np.where(e10 > e10.max() - 40)[0]; out["d40"] = (k[-1] - k[0])/SR if len(k) else 0
    a = max(0, i10 - int(.002*SR)); seg = x[a:a + int(.2*SR)]
    S = np.abs(np.fft.rfft(seg*sg.windows.tukey(len(seg), .1), 16384))**2; f = np.fft.rfftfreq(16384, 1/SR)   # fenêtre plate : l'attaque compte (une fenêtre de Hann l'effaçait)
    out["cent"] = (S*f).sum()/S.sum()
    tot = S.sum(); B = [0, 150, 600, 2000, 6000, 24000]
    out["bandes"] = [10*np.log10(S[(f >= B[j]) & (f < B[j + 1])].sum()/tot + 1e-12) for j in range(5)]
    return out
def ligne(nom, m):
    return f"{nom:38s} M400 {m['M400']:6.1f}  L50 {m['L50']:6.1f}  crête {m['crete']:5.1f}  att {m['att']:5.1f}ms  d40 {m['d40']:5.2f}s  cent {m['cent']:6.0f}Hz  " + \
        " ".join(f"{b:5.1f}" for b in m["bandes"])
if __name__ == "__main__":
    fs = []
    for a in sys.argv[1:]:
        fs += sorted(glob.glob(os.path.join(a, "*.ogg"))) if os.path.isdir(a) else sorted(glob.glob(a))
    print(f"{'fichier':38s} {'':6s}{'':49s}  <150  -600  -2k   -6k   >6k")
    for f in fs: print(ligne(os.path.basename(f)[:38], mesure(lire(f))))
