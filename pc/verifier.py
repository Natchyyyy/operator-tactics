# Vérifie que les outils qui utilisent Playwright démarrent (à lancer avec le Python de la tâche planifiée) :
#   python pc/verifier.py
# sonde WebGL, outils/revue/revue.py etats, pc/mesures.py, tests/verif_page.py — sur la copie de travail de main.
import os, sys, subprocess, socket, time
ICI = os.path.dirname(os.path.abspath(__file__)); MAIN = os.path.join(os.path.dirname(os.path.dirname(ICI)), 'operator-tactics-main')
PY = sys.executable; L = os.path.join(ICI, 'lanceur_gpu.py'); BASE = 'http://127.0.0.1:8765'
ENV = dict(os.environ, PYTHONUTF8='1', PLAYWRIGHT_BROWSERS_PATH=os.path.join(os.environ['LOCALAPPDATA'], 'ms-playwright'))
def ouvert():
    with socket.socket() as s: s.settimeout(0.5); return s.connect_ex(('127.0.0.1', 8765)) == 0
deja = ouvert(); print('serveur déjà présent' if deja else 'lancement du serveur', flush=True)
journal = open(os.path.join(os.environ.get('TEMP', '.'), 'ot_serveur.log'), 'w')
srv = None if deja else subprocess.Popen([PY, 'outils/serveur.py', '.', '8765'], cwd=MAIN, env=ENV, stdout=journal, stderr=journal)   # PYTHONUTF8 : serveur.py affiche « ← »
for _ in range(40):
    if ouvert(): break
    time.sleep(0.25)
print('serveur :', 'répond' if ouvert() else 'NE RÉPOND PAS', '' if not srv else f'(processus {"vivant" if srv.poll() is None else "terminé, code " + str(srv.poll())})', flush=True)
tmp = os.path.join(os.environ.get('TEMP', '.'), 'ot_mesures_verif.json')
etapes = [('sonde WebGL', [PY, L, '--sonde']),
          ('outils/revue/revue.py etats', [PY, L, 'outils/revue/revue.py', 'etats']),
          ('pc/mesures.py', [PY, L, os.path.join(ICI, 'mesures.py'), f'{BASE}/docs/index.html', tmp]),
          ('tests/verif_page.py', [PY, L, 'tests/verif_page.py', f'{BASE}/dist/index.html?fx=0&hd=0'])]
ok = True
try:
    for nom, cmd in etapes:
        t = time.time(); p = subprocess.run(cmd, cwd=MAIN, env=ENV, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=900)
        lignes = [l for l in (p.stdout + p.stderr).splitlines() if l.strip() and 'deprecated' not in l]
        res = 'OK' if p.returncode == 0 else 'ÉCHEC'; ok &= p.returncode == 0
        print(f'{res:5s} {nom} ({time.time() - t:.0f} s) : {lignes[-1][:160] if lignes else ""}', flush=True)
finally:
    if srv: srv.terminate()
print('TOUT DÉMARRE' if ok else 'PROBLÈME'); sys.exit(0 if ok else 1)
