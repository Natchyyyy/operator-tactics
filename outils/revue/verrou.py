# Verrou partagé des tâches lourdes (règle du projet : une seule tâche lourde à la fois sur la machine).
# Utilisé autour de CHAQUE morceau lourd (chargement de page, état mesuré, planche rendue, bloc de simulation) : les autres
# agents peuvent passer entre deux morceaux. Équivalent de « flock /tmp/claude-0/lourd.lock commande ».
import fcntl, os, contextlib, time
CHEMIN = '/tmp/claude-0/lourd.lock'
@contextlib.contextmanager
def verrou(nom=''):
    os.makedirs(os.path.dirname(CHEMIN), exist_ok=True)
    f = open(CHEMIN, 'a'); t = time.time()
    fcntl.flock(f, fcntl.LOCK_EX)
    attente = time.time() - t
    if attente > 5: print(f'  (verrou obtenu après {attente:.0f} s{" : " + nom if nom else ""})', flush=True)
    try: yield
    finally: fcntl.flock(f, fcntl.LOCK_UN); f.close()
