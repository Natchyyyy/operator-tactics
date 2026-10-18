# Verrou partagé des tâches lourdes (règle du projet : une seule tâche lourde à la fois sur la machine).
# Utilisé autour de CHAQUE morceau lourd (chargement de page, état mesuré, planche rendue, bloc de simulation) : les autres
# agents passent entre deux morceaux. Équivalent de « flock /tmp/claude-0/lourd.lock commande ».
# Si l'outil est DÉJÀ lancé sous « flock lourd.lock … » (un ancêtre du processus tient le verrou), on ne reprend pas le verrou
# (sinon interblocage : le processus attendrait le verrou que tient son propre parent).
import fcntl, os, contextlib, time
CHEMIN = '/tmp/claude-0/lourd.lock'

def _sous_flock():
    if os.environ.get('REVUE_SANS_VERROU'): return True
    pid = os.getppid()
    for _ in range(12):
        try:
            cmd = open(f'/proc/{pid}/cmdline', 'rb').read().split(b'\0')
            if cmd and os.path.basename(cmd[0].decode(errors='ignore')) == 'flock' and any(b'lourd.lock' in c for c in cmd): return True
            st = open(f'/proc/{pid}/stat').read(); pid = int(st[st.rindex(')') + 2:].split()[1])
            if pid <= 1: break
        except Exception: break
    return False
SOUS_FLOCK = _sous_flock()

@contextlib.contextmanager
def verrou(nom=''):
    if SOUS_FLOCK: yield; return
    os.makedirs(os.path.dirname(CHEMIN), exist_ok=True)
    f = open(CHEMIN, 'a'); t = time.time()
    fcntl.flock(f, fcntl.LOCK_EX)
    attente = time.time() - t
    if attente > 5: print(f'  (verrou obtenu après {attente:.0f} s{" : " + nom if nom else ""})', flush=True)
    try: yield
    finally: fcntl.flock(f, fcntl.LOCK_UN); f.close()
