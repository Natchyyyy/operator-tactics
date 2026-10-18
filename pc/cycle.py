# La « machine de calcul et de rendu » (PC avec RTX 5070 Ti) pour OPERATOR TACTICS : travaille SUR DEMANDE du coordinateur.
#   python pc/cycle.py                               attente : `git ls-remote origin refs/heads/pc-demande` (tâche planifiée, 5 min) ;
#                                                    si le commit de pc-demande a changé, la demande (message du commit) est traitée
#   python pc/cycle.py --simuler "revue sur abc1234" traiter ce texte comme une demande (essai ; l'état des demandes n'est pas touché)
#   python pc/cycle.py --forcer [--quoi tout]        cycle à la main sur origin/main (--quoi : tests,revue,apercus,mesures,captures,nuit…)
#   options : --sans-push, --sans-rendus
# Une demande : 1. copie de travail ../operator-tactics-main sur le commit demandé (détachée, propre), node build.js ;
# 2. seulement les étapes demandées : tests (verify, ia, voies, game, league, verif_page), revue des animations, aperçus des états,
#    mesures de rendu, captures de la carte (jour, nuit, pluie, brouillard) ;
# 3. range tout dans resultats/<date-heure>/ (rapport.md + images JPEG ≤ 1600 px), ne garde que les 3 derniers dossiers ;
# 4. réécrit la branche pc-resultats en UN seul commit orphelin et la pousse en --force (jamais main).
# Le message de la demande n'est jamais exécuté : il est seulement comparé à une liste fixe de mots (TACHES, CONDITIONS).
# Ne modifie jamais le code du jeu : tout est lancé tel quel dans le dossier de travail, via pc/lanceur_gpu.py.
import os, sys, subprocess, time, datetime, json, shutil, socket, re, unicodedata

ICI = os.path.dirname(os.path.abspath(__file__))
DEPOT = os.path.dirname(ICI)                                   # branche pc-resultats
MAIN = os.path.join(os.path.dirname(DEPOT), 'operator-tactics-main')   # copie de travail de origin/main
RES = os.path.join(DEPOT, 'resultats')
PY = sys.executable
LANCEUR = os.path.join(ICI, 'lanceur_gpu.py')
PORT = 8765
BASE = f'http://127.0.0.1:{PORT}'
BRANCHE = 'pc-resultats'
SANS_PUSH = '--sans-push' in sys.argv
SANS_RENDUS = '--sans-rendus' in sys.argv
FORCER = '--forcer' in sys.argv          # cycle à la main sur origin/main, sans demande
def _arg(nom):
    return sys.argv[sys.argv.index(nom) + 1] if nom in sys.argv and sys.argv.index(nom) + 1 < len(sys.argv) else None
SIMULER = _arg('--simuler')              # texte traité comme le message d'une demande
GARDER = 3                               # nombre de dossiers resultats/<date-heure> conservés
JPEG_QUALITE, LARGEUR_MAX = 80, 1600
SANS_FENETRE = getattr(subprocess, 'CREATE_NO_WINDOW', 0)   # tâche planifiée (pythonw) : aucune console ne s'ouvre
BRANCHE_DEMANDE = 'pc-demande'           # le coordinateur y pousse un commit dont le message dit quoi tester et sur quel commit
ESSAIS_MAX = 3                           # une demande qui fait planter le cycle 3 fois de suite est abandonnée (et signalée)
# mots de la demande (en minuscules, sans accents) → étapes. Le build est toujours fait.
TACHES = {'tests': r'\btests?\b|\bverif',
          'revue': r'\brevue|animation',
          'apercus': r'apercu',
          'mesures': r'mesure|perf|\bfps\b|temps d.image',
          'captures': r'capture|\bcartes?\b|\bvues?\b'}
NOMS_TACHES = {'tests': 'tests (`node tests/*.js`, `tests/verif_page.py`)', 'revue': 'revue des animations (`revue.py revue`)',
               'apercus': 'aperçus des états (`revue.py apercu`)', 'mesures': 'mesures de rendu (`pc/mesures.py`)',
               'captures': 'captures de la carte (`outils/capture.py`, `?hd=1`)'}
CONDITIONS = ('jour', 'nuit', 'pluie', 'brouillard')   # valeurs du menu #condSel du jeu (heure et météo)
class Journal:   # lancé par pythonw.exe (toutes les 5 min) : sortie dans pc_journal.log, en-tête seulement si on écrit quelque chose
    def __init__(self, chemin): self.chemin, self.f = chemin, None
    def write(self, s):
        if self.f is None:
            if os.path.exists(self.chemin) and os.path.getsize(self.chemin) > 2_000_000: os.replace(self.chemin, self.chemin + '.1')
            self.f = open(self.chemin, 'a', encoding='utf-8', buffering=1); self.f.write(f'\n===== {datetime.datetime.now():%Y-%m-%d %H:%M} =====\n')
        self.f.write(s)
    def flush(self):
        if self.f: self.f.flush()
if sys.stdout is None:                   # sortie dans pc_journal.log (non versionné)
    sys.stdout = sys.stderr = Journal(os.path.join(DEPOT, 'pc_journal.log'))
try: sys.stdout.reconfigure(encoding='utf-8')
except Exception: pass

ENV = dict(os.environ, PYTHONUTF8='1', PYTHONIOENCODING='utf-8',
           PLAYWRIGHT_BROWSERS_PATH=os.path.join(os.environ['LOCALAPPDATA'], 'ms-playwright'))
STAMP = datetime.datetime.now().strftime('%Y-%m-%d_%H-%M')
OUT = os.path.join(RES, STAMP)
LOGS = os.path.join(OUT, 'logs')
DEJA = os.path.join(RES, '.dernier_main')                  # hash du dernier commit testé
DERNIERE_CAPTURE = os.path.join(RES, '.derniere_capture')  # heure (epoch) et dossier des dernières captures
FAITE = os.path.join(RES, '.derniere_demande')             # commit de pc-demande de la dernière demande traitée
EN_COURS = os.path.join(RES, '.demande_en_cours')          # « commit essais » : demande commencée, pas encore publiée
try:
    _t, _dossier = (open(DERNIERE_CAPTURE).read().split() + [''])[:2]
    depuis_capture = (time.time() - float(_t)) / 60
    if not os.path.isdir(os.path.join(RES, _dossier)): depuis_capture, _dossier = float('inf'), ''   # dossier supprimé
except Exception: depuis_capture, _dossier = float('inf'), ''
erreurs = []           # problèmes à signaler en tête du rapport
console = []           # erreurs de la console des pages (dédoublonnées à la fin)

def run(nom, cmd, cwd=MAIN, timeout=1800, env=ENV):
    """lance une commande, garde la sortie dans logs/<nom>.log ; renvoie (code, sortie, durée)"""
    t = time.time()
    try:
        p = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, timeout=timeout, encoding='utf-8', errors='replace', creationflags=SANS_FENETRE)
        code, out = p.returncode, (p.stdout or '') + ('\n--- stderr ---\n' + p.stderr if p.stderr and p.stderr.strip() else '')
    except subprocess.TimeoutExpired as e:
        code, out = 'délai dépassé', ((e.stdout or b'').decode('utf-8', 'replace') if isinstance(e.stdout, bytes) else (e.stdout or '')) + f'\n[délai de {timeout} s dépassé]'
    except Exception as e:
        code, out = 'erreur', f'{type(e).__name__}: {e}'
    d = time.time() - t
    with open(os.path.join(LOGS, nom + '.log'), 'w', encoding='utf-8') as f: f.write(' '.join(map(str, cmd)) + '\n\n' + out)
    print(f'[{nom}] code {code} en {d:.0f} s', flush=True)
    return code, out, d

def git(*a, cwd=DEPOT): return subprocess.run(['git', *a], cwd=cwd, capture_output=True, encoding='utf-8', errors='replace', creationflags=SANS_FENETRE)

def derniere(out, motif=None):
    ls = [l for l in out.splitlines() if l.strip() and 'deprecated' not in l and '--- stderr ---' not in l]
    if 'Traceback' in out and not motif:   # erreur Python : la ligne de l'exception, pas la dernière ligne de la pile
        exc = [l for l in ls if re.match(r'\s*[\w.]*(Error|Exception|Exit)\w*\b.*:', l)]
        if exc: return exc[-1].strip()[:300]
    if motif: ls = [l for l in ls if re.search(motif, l)] or ls
    return ls[-1].strip()[:300] if ls else '(aucune sortie)'

def erreurs_console(out):
    """lignes d'erreur de page relevées par les scripts Playwright du projet (capture.py, verif_page.py…)"""
    return [l.strip()[:300] for l in out.splitlines() if l.strip().startswith(('erreur:', 'console.error', 'pageerror'))]

def publier(silencieux=False):
    """réécrit pc-resultats en un seul commit orphelin (pc/, resultats/, .gitignore) et le pousse en --force ; jamais main"""
    br = git('rev-parse', '--abbrev-ref', 'HEAD').stdout.strip()
    if br != BRANCHE: print(f'ARRÊT : la copie n\'est pas sur {BRANCHE} ({br}) — rien n\'est publié'); return
    git('add', '-A', '--', 'resultats', 'pc', '.gitignore')
    arbre = git('write-tree').stdout.strip()
    if arbre and arbre == git('rev-parse', 'HEAD^{tree}').stdout.strip() and git('rev-list', '--count', 'HEAD').stdout.strip() == '1':
        if not silencieux: print("rien de nouveau à publier")
        return
    dern = open(os.path.join(RES, 'DERNIER.md'), encoding='utf-8').readline().strip() if os.path.exists(os.path.join(RES, 'DERNIER.md')) else ''
    c = git('commit-tree', arbre, '-m', f'Résultats du PC (3 derniers cycles) — {dern[:200]}').stdout.strip()
    if not c: print('ÉCHEC du commit-tree'); return
    git('reset', '-q', '--soft', c)                # la branche pc-resultats pointe sur ce commit unique, sans parent
    git('reflog', 'expire', '--expire=now', '--all'); git('gc', '-q', '--prune=now')   # oublie les anciens commits localement
    if SANS_PUSH: print('commit', c[:7], '(sans push)'); return
    p = git('push', '--force', 'origin', f'{BRANCHE}:{BRANCHE}')
    print('push --force :', p.returncode, p.stderr.strip()[-300:])

def rattrapage(distant):
    """passage sans demande : publie pc/ modifié, ou refait un push qui a échoué (distant : commit de pc-resultats sur GitHub)"""
    publier(silencieux=True)   # sans effet si rien n'a changé
    if distant and git('rev-parse', 'HEAD').stdout.strip() != distant and not SANS_PUSH:
        p = git('push', '--force', 'origin', f'{BRANCHE}:{BRANCHE}'); print('push --force (rattrapage) :', p.returncode)

def lire_demande(msg):
    """message d'une demande → (étapes, conditions des captures, commits candidats). Rien n'est exécuté : mots fixes seulement."""
    s = ''.join(c for c in unicodedata.normalize('NFD', msg.lower()) if unicodedata.category(c) != 'Mn')
    s = re.sub(r'tout de suite|tout a l.heure|(mise )?a jour', ' ', s)
    quoi = {t for t, m in TACHES.items() if re.search(m, s)}
    if re.search(r'\btout\b|\bcomplet', s): quoi |= set(TACHES)
    conds = [c for c in CONDITIONS if re.search(rf'\b{c}\b', s)]
    if conds and not quoi: quoi.add('captures')            # « nuit » seul : captures de nuit
    if 'captures' in quoi and not conds: conds = ['jour']
    return quoi, conds, re.findall(r'\b(?=[0-9a-f]*[0-9])[0-9a-f]{7,40}\b', s)

def etiquette():
    return ('demande simulée' if DEMANDE['simulee'] else f"demande {DEMANDE['court']}") if DEMANDE else 'cycle forcé'

def lignes_demande():
    """en tête du rapport : à quelle demande il répond"""
    if not DEMANDE: return ['Cycle lancé à la main sur le PC (`--forcer`), sans demande du coordinateur.', '']
    cite = ['> ' + l for l in DEMANDE['msg'].strip().splitlines()] or ['> (message vide)']
    if DEMANDE['simulee']: return ['**Demande simulée sur le PC** (essai du mode « sur demande » : ce n\'est PAS une demande du coordinateur) :', '', *cite, '']
    return [f"**Réponse à la demande `{DEMANDE['court']}`** (branche `{BRANCHE_DEMANDE}`, {DEMANDE['date']}"
            + (f", essai {DEMANDE['essai']}" if DEMANDE['essai'] > 1 else '') + ') :', '', *cite, '']

def ranger(texte, resume, en_tete, teste=None):
    """rapport.md, 3 derniers dossiers, DERNIER.md, état des demandes, puis publication sur pc-resultats"""
    os.makedirs(OUT, exist_ok=True)
    open(os.path.join(OUT, 'rapport.md'), 'w', encoding='utf-8').write(texte + '\n'); print(texte)
    dossiers = sorted(x for x in os.listdir(RES) if re.match(r'\d{4}-\d\d-\d\d_\d\d-\d\d$', x) and os.path.isdir(os.path.join(RES, x)))
    for x in dossiers[:-GARDER]: shutil.rmtree(os.path.join(RES, x), ignore_errors=True); print('supprimé :', x)
    gardes = dossiers[-GARDER:]
    try: cap = open(DERNIERE_CAPTURE).read().split()[1]
    except Exception: cap = ''
    open(os.path.join(RES, 'DERNIER.md'), 'w', encoding='utf-8').write(
        f'Dernier cycle {STAMP} — {etiquette()} — {resume}\n\n'
        + f'Rapport complet : [{STAMP}/rapport.md]({STAMP}/rapport.md)' + (f' ; dernières captures : [{cap}/]({cap}/)' if cap in gardes else '') + '\n'
        + 'Dossiers conservés : ' + ', '.join(f'[{x}]({x}/rapport.md)' for x in gardes) + '\n\n' + en_tete + '\n')
    if teste: open(DEJA, 'w').write(teste)
    if DEMANDE and not DEMANDE['simulee']:
        open(FAITE, 'w').write(DEMANDE['id'])
        if os.path.exists(EN_COURS): os.remove(EN_COURS)
    publier()

def non_traitee(raison, detail=()):
    """demande impossible à traiter (non comprise, commit introuvable…) : rapport court, publié quand même"""
    tete = [f'# Résultats du PC — {datetime.datetime.now():%d/%m/%Y %H:%M}', '', *lignes_demande(), f'## ⚠ Demande non traitée : {raison}', '', *detail]
    ranger('\n'.join(tete), f'⚠ demande non traitée : {raison}', '\n'.join(tete[2:]))
    sys.exit(0)

# ---------------------------------------------------------------------------------------------------------
# 0. attente d'une demande (toutes les 5 min, très léger : un ls-remote)
# ---------------------------------------------------------------------------------------------------------
t0 = time.time()
# un seul cycle à la fois : un lancement pendant un cycle en cours s'arrête tout de suite ; la demande arrivée entre-temps est
# lue au passage suivant (seulement la DERNIÈRE : le message du commit de tête de pc-demande)
import msvcrt
_verrou = open(os.path.join(DEPOT, 'pc_cycle.lock'), 'a+')
try: msvcrt.locking(_verrou.fileno(), msvcrt.LK_NBLCK, 1)
except OSError:
    if sys.stdout.__class__ is not Journal: print('un cycle est déjà en cours : rien à faire')
    sys.exit(0)
DEMANDE = None
if SIMULER is not None:
    DEMANDE = dict(id='', court='simulée', msg=SIMULER, date=f'{datetime.datetime.now():%Y-%m-%d %H:%M}', simulee=True, essai=1)
elif not FORCER:
    r = git('ls-remote', 'origin', f'refs/heads/{BRANCHE_DEMANDE}', f'refs/heads/{BRANCHE}')
    if r.returncode: print('git ls-remote :', r.stderr.strip()[:300]); sys.exit(0)   # réseau absent : on réessaiera au passage suivant
    refs = {l.split()[1]: l.split()[0] for l in r.stdout.splitlines() if len(l.split()) == 2}
    dem = refs.get(f'refs/heads/{BRANCHE_DEMANDE}', '')
    faite = open(FAITE).read().strip() if os.path.exists(FAITE) else ''
    if not dem or dem == faite:   # pas de demande nouvelle : silencieux
        rattrapage(refs.get(f'refs/heads/{BRANCHE}', '')); sys.exit(0)
    f = git('fetch', '-q', 'origin', BRANCHE_DEMANDE, 'main')
    if f.returncode: print('git fetch :', f.stderr.strip()[:300]); sys.exit(0)
    msg = git('log', '-1', '--format=%B', dem).stdout.strip()
    try:
        h, n = open(EN_COURS).read().split()[:2]; n = int(n) if h == dem else 0
    except Exception: n = 0
    DEMANDE = dict(id=dem, court=dem[:7], msg=msg, date=git('log', '-1', '--format=%ci', dem).stdout.strip(), simulee=False, essai=n + 1)
    print(f'{datetime.datetime.now():%H:%M} demande {dem[:7]} (essai {n + 1}) : « {" / ".join(msg.splitlines())[:200]} »', flush=True)
    if n >= ESSAIS_MAX:
        DEMANDE['essai'] = n
        non_traitee(f'abandonnée après {n} essais', [f'Le cycle s\'est arrêté avant la fin {n} fois de suite sur cette demande. '
                    'Voir `pc_journal.log` sur le PC (l\'utilisateur peut le transmettre) ; pousser un nouveau commit sur '
                    f'`{BRANCHE_DEMANDE}` pour réessayer.'])
    open(EN_COURS, 'w').write(f'{dem} {n + 1}')
if DEMANDE is None or DEMANDE['simulee']:
    f = git('fetch', '-q', 'origin', 'main')
    if f.returncode: print('git fetch :', f.stderr.strip()[:300])
QUOI, CONDS, candidats = lire_demande(DEMANDE['msg'] if DEMANDE else (_arg('--quoi') or 'tout'))
if SANS_RENDUS: QUOI &= {'tests'}
if not QUOI:
    non_traitee('demande non comprise', ['Aucune étape reconnue dans le message. Mots compris (sans accents ni majuscules) :', '',
                *[f'- {NOMS_TACHES[t]} : {m}' for t, m in (('tests', '« test », « tests », « verif… »'), ('revue', '« revue », « animation(s) »'),
                  ('apercus', '« aperçu(s) »'), ('mesures', '« mesure(s) », « perf… », « fps », « temps d\'image »'),
                  ('captures', '« capture(s) », « carte(s) », « vue(s) »'))],
                '- tout : `tout`, `complet` (toutes les étapes)',
                f'- heure / météo des captures : {", ".join(f"`{c}`" for c in CONDITIONS)} (par défaut `jour`)',
                '- commit à tester : son numéro (7 à 40 caractères hexadécimaux) ; sinon le dernier commit de `main`.'])
# commit à tester : le premier numéro du message qui existe ; sinon origin/main
tete = ''
for essai in (1, 2):
    for c in candidats:
        tete = git('rev-parse', '--verify', '-q', c + '^{commit}').stdout.strip()
        if tete: break
    if tete or not candidats: break
    git('fetch', '-q', 'origin')   # peut-être sur une autre branche que main
if candidats and not tete:
    non_traitee('commit introuvable', [f'Aucun de ces numéros n\'est un commit connu de `origin` : {", ".join(f"`{c}`" for c in candidats)}.'])
if not tete: tete = git('rev-parse', 'origin/main').stdout.strip()
sur_main = git('merge-base', '--is-ancestor', tete, 'origin/main').returncode == 0
print(f'à faire sur {tete[:7]} : build, {", ".join(sorted(QUOI))}' + (f' ; captures : {", ".join(CONDS)}' if 'captures' in QUOI else ''), flush=True)

# ---------------------------------------------------------------------------------------------------------
# 1. copie de travail sur le commit demandé + build
# ---------------------------------------------------------------------------------------------------------
if not os.path.isdir(MAIN):
    git('worktree', 'add', '--detach', MAIN, 'origin/main')
os.makedirs(LOGS, exist_ok=True)
git('checkout', '--detach', '-f', tete, cwd=MAIN)
git('clean', '-fdq', cwd=MAIN)       # uniquement dans la copie de travail de main (captures/ des cycles précédents, etc.)
rev = git('log', '-1', '--format=%h|%ci|%s', cwd=MAIN).stdout.strip().split('|', 2) + ['', '', '']
rev_court = f'{rev[0]} ({rev[1]}) « {rev[2]} »'

# web/hd n'est pas versionné (.gitignore) ; build.js recopie web/hd dans docs/hd et SUPPRIME de docs/hd ce qui n'est pas dans
# web/hd. Sur une copie neuve, le build viderait donc docs/hd. On reconstitue web/hd depuis docs/hd (versionné) avant le build.
hd_suivis = [x for x in git('ls-files', 'docs/hd', cwd=MAIN).stdout.splitlines() if x.strip()]
web_hd = os.path.join(MAIN, 'web', 'hd')
if hd_suivis:
    shutil.rmtree(web_hd, ignore_errors=True); os.makedirs(web_hd, exist_ok=True)
    for x in hd_suivis: shutil.copy2(os.path.join(MAIN, x), os.path.join(web_hd, os.path.basename(x)))
code, out, d = run('build', ['node', 'build.js'])
build = (code, d, derniere(out))
if code != 0: erreurs.append(f'node build.js : code {code} — {derniere(out)}')
build_res = [l for l in out.splitlines() if 'dist/index.html' in l]

# ---------------------------------------------------------------------------------------------------------
# 2. tests en console
# ---------------------------------------------------------------------------------------------------------
def nom_echec(l):   # « FAIL nom du test  -> {détail} » → nom du test
    return re.sub(r'^\s*(FAIL|ÉCHEC|ECHEC|✗|×)\s*', '', l).split('  -> ')[0].strip()
tests = []          # (nom court, commande, code, durée, dernière ligne, échecs)
for nom in ('verify', 'ia', 'voies', 'game', 'league') if 'tests' in QUOI else ():
    code, out, d = run('test_' + nom, ['node', f'tests/{nom}.js'], timeout=1800)
    fails = [l.strip() for l in out.splitlines() if re.match(r'\s*(FAIL|ÉCHEC|ECHEC|✗|×)\s', l)]
    tests.append((f'tests/{nom}.js', f'node tests/{nom}.js', code, d, derniere(out), fails))

# serveur local (depuis la copie de travail de main)
def port_ouvert():
    with socket.socket() as s: s.settimeout(0.5); return s.connect_ex(('127.0.0.1', PORT)) == 0
serveur = None
if port_ouvert():
    print('un serveur répond déjà sur le port', PORT, '— il est arrêté pour servir la bonne copie', flush=True)
    subprocess.run(['powershell', '-NoProfile', '-Command',
                    f'Get-NetTCPConnection -LocalPort {PORT} -State Listen -ErrorAction SilentlyContinue | ForEach-Object {{ Stop-Process -Id $_.OwningProcess -Force }}'],
                   creationflags=SANS_FENETRE)
    time.sleep(1)
journal_serveur = open(os.path.join(LOGS, 'serveur.log'), 'w', encoding='utf-8')
serveur = subprocess.Popen([PY, 'outils/serveur.py', '.', str(PORT)], cwd=MAIN, env=ENV,   # PYTHONUTF8 : serveur.py affiche « ← »
                           stdout=journal_serveur, stderr=journal_serveur, creationflags=SANS_FENETRE)
for _ in range(40):
    if port_ouvert(): break
    time.sleep(0.25)
if not port_ouvert(): erreurs.append(f'le serveur local ne répond pas (processus {"terminé, code " + str(serveur.poll()) if serveur.poll() is not None else "vivant"}) : voir logs/serveur.log')

# Playwright : version figée (pc/requirements.txt) et navigateur présent, sinon on répare avant les étapes qui en ont besoin
def version_playwright():
    try: return subprocess.run([PY, '-c', 'import importlib.metadata as m; print(m.version("playwright"))'], capture_output=True, text=True,
                               creationflags=SANS_FENETRE).stdout.strip()
    except Exception: return ''
attendue = next((l.split('==')[1].strip() for l in open(os.path.join(ICI, 'requirements.txt'), encoding='utf-8') if l.startswith('playwright==')), '')
if attendue and version_playwright() != attendue:
    erreurs.append(f'Playwright {version_playwright() or "absent"} au lieu de {attendue} : version figée réinstallée')
    run('pip_requirements', [PY, '-m', 'pip', 'install', '-q', '-r', os.path.join(ICI, 'requirements.txt')], timeout=900)
code, out, d = run('sonde_navigateur', [PY, LANCEUR, '--sonde'], timeout=120)
if code != 0 and "Executable doesn't exist" in out:
    erreurs.append('navigateur de Playwright introuvable : `python -m playwright install chromium` relancé par le cycle')
    run('playwright_install', [PY, '-m', 'playwright', 'install', 'chromium'], timeout=1200)
    code, out, d = run('sonde_navigateur', [PY, LANCEUR, '--sonde'], timeout=120)
if code != 0: erreurs.append(f'le navigateur ne démarre pas : {derniere(out)}')
moteur_webgl = derniere(out) if code == 0 else '?'

rendus = []
rv = os.path.join(OUT, 'revue')
try:
    if 'tests' in QUOI:
        url = f'{BASE}/dist/index.html?fx=0&hd=0'
        code, out, d = run('test_verif_page', [PY, LANCEUR, 'tests/verif_page.py', url], timeout=2400)
        fails = [l.strip() for l in out.splitlines() if l.startswith('FAIL')]
        tests.append(('tests/verif_page.py', f'python tests/verif_page.py "{url}"', code, d, derniere(out), fails))
        console += [('verif_page', x) for x in erreurs_console(out)]

    # -----------------------------------------------------------------------------------------------------
    # 3. rendus sur la carte graphique (seulement ceux qui sont demandés)
    # -----------------------------------------------------------------------------------------------------
    if 'revue' in QUOI:
        # 3a. revue des animations (banc outils/revue/banc.html) : mesures + planches de preuve
        code, out, d = run('revue_animations', [PY, LANCEUR, 'outils/revue/revue.py', 'revue', '--sortie', rv], timeout=3600)
        rendus.append(('revue des animations (`revue.py revue`, 2 modèles × tous les états)', code, d, derniere(out)))
        if code != 0: erreurs.append(f'revue.py revue : code {code} — {derniere(out)}')
    if 'mesures' in QUOI:
        # 3b. mesures de rendu (temps réel d'une image sur la carte graphique, ressources manquantes)
        code, out, d = run('mesures_rendu', [PY, LANCEUR, os.path.join(ICI, 'mesures.py'), f'{BASE}/docs/index.html',
                                             os.path.join(OUT, 'mesures_rendu.json')], timeout=1200)
        rendus.append(('mesures de rendu (`pc/mesures.py` : 3 configurations × 3 vues)', code, d, derniere(out)))
        if code != 0: erreurs.append(f'pc/mesures.py : code {code} — {derniere(out)}')
    if 'apercus' in QUOI:
        # 3c. aperçu d'ensemble des animations : une ligne par état, pour chaque modèle
        os.makedirs(rv, exist_ok=True)
        for m in ('gign', 'soldat'):
            code, out, d = run(f'apercu_{m}', [PY, LANCEUR, 'outils/revue/revue.py', 'apercu', '--modele', m, '--marques',
                                              '--sortie', os.path.join(rv, f'apercu_{m}.png')], timeout=1800)
            rendus.append((f'aperçu des états, modèle {m} (`revue.py apercu`)', code, d, derniere(out)))
            if code != 0: erreurs.append(f'revue.py apercu {m} : code {code} — {derniere(out)}')
    for cond in CONDS if 'captures' in QUOI else ():
        # 3d. captures de la carte avec outils/capture.py (?hd=1, rendu complet), en une seule ouverture de page par condition :
        #     3 vues d'ensemble, 4 vues au sol à 1,6 m, puis la bataille à t = 40 s. Heure / météo : menu #condSel du jeu puis
        #     « Nouvelle bataille » (même graine), comme le ferait un joueur ; le jeu n'est pas modifié.
        cartes = os.path.join(OUT, 'carte' if cond == 'jour' else f'carte_{cond}'); os.makedirs(cartes, exist_ok=True)
        cacher_hud = ("js:(() => { const c = document.querySelector('canvas#scene'); document.querySelectorAll('body *').forEach(e => "
                      "{ if (e !== c && !e.contains(c)) e.style.visibility = 'hidden'; }); return 0; })()")
        # la page de docs/ : build.js y copie dist/index.html, et docs/hd (versionné) contient les modèles HD (dist/hd ne l'est pas)
        PAGE_HD = f'{BASE}/docs/index.html?manual=1&mode=free&hd=1&seed=3'
        W, D = 72, 46
        vues = [('ensemble_sud_ouest', f'API.look({W/2}, {D/2}, 0.6, 1.0, 72)'),
                ('ensemble_nord_est', f'API.look({W/2}, {D/2}, 3.75, 1.0, 72)'),
                ('dessus', f'API.look({W/2}, {D/2}, 0.0, 1.5, 85)'),
                ('sol_depart_ouest', 'API.look(6, 22, 1.57, 0.08, 6, 1.6)'),
                ('sol_depart_est', 'API.look(66, 22, -1.57, 0.08, 6, 1.6)'),
                # caméra à x ≈ 20, z ≈ 5 regardant vers l'est le long de la ruelle (yaw = π : la caméra est à cible + dist·(cos, sin))
                ('sol_allee_nord', 'API.look(26, 5, 3.14159, 0.08, 6, 1.6)'),
                ('sol_allee_sud', 'API.look(36, 38, 3.14, 0.08, 6, 1.6)')]
        changer = [] if cond == 'jour' else [
            "js:(() => { const s = document.querySelector('#condSel'); s.value = '" + cond + "'; document.querySelector('#newBattle').click(); "
            "return 'conditions : ' + document.querySelector('#app').dataset.cond; })()", 'wait:4000']
        etapes = ['wait:8000', *changer, cacher_hud]
        for _, js in vues: etapes += ['js:' + js, 'wait:400', 'shot']
        etapes += ['js:API.step(400)', f'js:API.look({W/2}, {D/2}, 0.6, 1.0, 72)', 'wait:300', 'shot']
        vues.append(('bataille_40s_ensemble', ''))
        code, out, d = run('capture_carte' + ('' if cond == 'jour' else '_' + cond), [PY, LANCEUR, 'outils/capture.py', PAGE_HD, os.path.join(cartes, 'v'),
                                             '--taille', '1920x1080', '--attendre', 'window.PRET',
                                             *sum([['--etape', e] for e in etapes], [])], timeout=1800)
        rendus.append((f'captures de la carte, {cond} ({len(vues)} vues : 3 d\'ensemble, 4 au sol, bataille à 40 s ; ?hd=1)', code, d, derniere(out)))
        if code != 0: erreurs.append(f'capture.py ({cond}) : code {code} — {derniere(out)}')
        elif changer and f'conditions : {cond}' not in out: erreurs.append(f'captures {cond} : le jeu n\'a pas confirmé le changement d\'heure / météo (voir logs/)')
        for i, (nom, _) in enumerate(vues):
            src = os.path.join(cartes, f'v-{i}.png')
            if os.path.exists(src): os.replace(src, os.path.join(cartes, nom + '.png'))
        console += [('capture.py', x) for x in erreurs_console(out)]
        open(DERNIERE_CAPTURE, 'w').write(f'{time.time():.0f} {STAMP}')
finally:
    if serveur: serveur.terminate(); serveur.wait(10)
    journal_serveur.close()   # écrit sur le disque AVANT la publication (sinon le passage suivant republie)

# images → JPEG qualité 80, 1600 px de large au plus
def en_jpeg(dossier):
    if not os.path.isdir(dossier): return
    from PIL import Image
    for racine, _, fichiers in os.walk(dossier):
        for x in fichiers:
            if not x.lower().endswith(('.png', '.jpg')): continue
            p = os.path.join(racine, x); im = Image.open(p).convert('RGB')
            if im.width > LARGEUR_MAX: im = im.resize((LARGEUR_MAX, round(im.height * LARGEUR_MAX / im.width)), Image.LANCZOS)
            dst = os.path.splitext(p)[0] + '.jpg'; im.save(dst, quality=JPEG_QUALITE, optimize=True)
            if dst != p: os.remove(p)
en_jpeg(OUT)
rv_md0 = os.path.join(OUT, 'revue', 'rapport.md')
if os.path.exists(rv_md0):   # les liens vers les preuves suivent le changement d'extension ; chemins relatifs
    s = open(rv_md0, encoding='utf-8', errors='replace').read()
    s = re.sub(r'([\w\\/:.\-]+)\.png', lambda m: m.group(1) + ('.jpg' if os.path.exists(m.group(1) + '.jpg') else '.png'), s)
    s = s.replace(OUT + os.sep, '').replace(OUT, '.').replace('\\', '/')
    open(rv_md0, 'w', encoding='utf-8').write(s)

# ---------------------------------------------------------------------------------------------------------
# 4. rapport
# ---------------------------------------------------------------------------------------------------------
M = {}
mj = os.path.join(OUT, 'mesures_rendu.json')
if os.path.exists(mj):
    try: M = json.load(open(mj, encoding='utf-8'))
    except Exception as e: erreurs.append(f'mesures illisibles : {e}')
manq = sorted({x.replace(BASE, '') for r in M.values() for x in r.get('ressources_manquantes', [])})
console += [('mesures', x) for r in M.values() for x in r.get('erreurs_page', [])]
console += [('mesures', x) for r in M.values() for x in r.get('console_erreurs', [])]
# les « Failed to load resource » sont les 404 listés à part (ressources manquantes)
console_uniq = []
for src, x in console:
    if 'Failed to load resource' in x: continue
    if x not in [y for _, y in console_uniq]: console_uniq.append((src, x))
n_404 = sum('Failed to load resource' in x for _, x in console)

# ---- en tête : commit testé, résultat de chaque test, erreurs de la console ----
tete_rapport = [f'# Résultats du PC — {datetime.datetime.now():%d/%m/%Y %H:%M}', '',
                *lignes_demande(),
                f'**Commit testé : `{rev[0]}`** — {rev[1]} — « {rev[2]} »'
                + ('' if sur_main else ' — ⚠ ce commit n\'est pas (encore) dans `main`'), '',
                'Étapes faites : build, ' + ', '.join(NOMS_TACHES[t] for t in TACHES if t in QUOI)
                + (f' — captures : {", ".join(CONDS)}' if 'captures' in QUOI else '') + '.'
                + (' Non demandées : ' + ', '.join(NOMS_TACHES[t].split(' (')[0] for t in TACHES if t not in QUOI) + '.' if set(TACHES) - QUOI else ''), '',
                '## Tests', '',
                f"- {'✅' if build[0] == 0 else '❌'} `node build.js` : {'réussi' if build[0] == 0 else 'ÉCHOUÉ (code ' + str(build[0]) + ') — ' + build[2]}"]
if 'tests' not in QUOI: tete_rapport.append('- tests non demandés')
for court, cmd, code, d, der, fails in tests:
    ok = code == 0 and not fails
    m_ = re.search(r'(\d+)\s*/\s*(\d+)', der)
    compte = f' ({m_.group(1)}/{m_.group(2)})' if m_ else ''
    if ok: tete_rapport.append(f'- ✅ `{court}` : réussi{compte}')
    else:
        tete_rapport.append(f'- ❌ `{court}` : ÉCHOUÉ{compte}' + ('' if fails else f' — code {code}, {der}'))
        tete_rapport += [f'  - « {nom_echec(x)} »' + (f' → `{x.split("  -> ", 1)[1][:160]}`' if '  -> ' in x else '') for x in fails[:20]]
        erreurs.append(f'`{court}` : ' + (', '.join(f'« {nom_echec(x)} »' for x in fails[:5]) if fails else f'code {code}'))
tete_rapport += ['', '## Erreurs de la console', '']
if console_uniq: tete_rapport += [f'- [{src}] `{x}`' for src, x in console_uniq[:25]]
else: tete_rapport.append('- aucune erreur JavaScript ni `console.error` (hors ressources manquantes)')
if manq: tete_rapport += [f'- {len(manq)} ressource(s) introuvable(s) (404) : ' + ', '.join(f'`{x.split()[-1]}`' for x in manq[:12])]
autres = [e for e in erreurs if not e.startswith('`tests/')]
if autres: tete_rapport += ['', '## Autres problèmes', ''] + [f'- ⚠ {e}' for e in autres]

lignes = ['', '---', '', '## Détail', '',
          f'- Moteur WebGL obtenu par Chromium : `{moteur_webgl}` ; Playwright {version_playwright()}',
          '- Machine : Windows 11, NVIDIA GeForce RTX 5070 Ti (WebGL matériel : ANGLE / Direct3D 11 via `pc/lanceur_gpu.py`), '
          f'Node {subprocess.run(["node", "--version"], capture_output=True, text=True, creationflags=SANS_FENETRE).stdout.strip()}, Python {sys.version.split()[0]}',
          f'- `node build.js` : ' + ('; '.join(build_res) if build_res else 'voir logs/build.log'),
          f'- `web/hd/` (non versionné) reconstitué à partir des {len(hd_suivis)} fichiers versionnés de `docs/hd/` avant le build. '
          'Sans cela, `build.js` supprime de `docs/hd` tout ce qui manque dans `web/hd` : sur une copie neuve du dépôt, le build vide `docs/hd` '
          '(et un commit fait ensuite retirerait la HD du site publié).' if hd_suivis else '- `docs/hd/` ne contient aucun fichier versionné.']
if tests: lignes += ['', '### Tests', '', '| commande | code | durée | dernière ligne |', '|---|---|---|---|']
for court, cmd, code, d, der, fails in tests:
    lignes.append(f'| `{cmd}` | {"✅ 0" if code == 0 and not fails else "❌ " + str(code)} | {d:.0f} s | {der.replace("|", "/")} |')
if rendus:
    lignes += ['', '### Rendus (carte graphique)', '', '| rendu | code | durée | dernière ligne |', '|---|---|---|---|']
    for nom, code, d, der in rendus: lignes.append(f'| {nom} | {"✅ 0" if code == 0 else ("❌ " + str(code) if code != "—" else "—")} | {d:.0f} s | {str(der).replace("|", "/")} |')
    if M:
        lignes += ['', '### Mesures du rendu (RTX 5070 Ti, 1920×1080, page `docs/index.html`, carte parking, graine 3)', '',
                   'Temps réel d\'une image = `API.render()` + attente de la carte graphique (`readPixels`), 60 images, moyenne / p95.', '',
                   '| configuration | triangles (scène) | maillages | début, ensemble | t = 40 s, ensemble | t = 40 s, épaule | chargement |', '|---|---|---|---|---|---|---|']
        for nom, r in M.items():
            cel = lambda k: ('(canevas vide, mesure invalide)' if not r[k].get('largeur') else f"{r[k]['ms_moyen']} ms ({r[k]['ips_equivalent']} i/s), p95 {r[k]['ms_p95']}") if k in r else '—'
            lignes.append(f"| `{nom}` | {r.get('triangles_scene', 0):,} | {r.get('maillages_visibles')} | {cel('debut_ensemble')} | {cel('t40_ensemble')} | {cel('t40_epaule')} | {r.get('chargement_s')} s |".replace(',', ' '))
        if manq: lignes += ['', f'Ressources manquantes ({len(manq)}) :', ''] + [f'- `{x}`' for x in manq[:30]]
    if os.path.exists(rv_md0):
        txt = open(rv_md0, encoding='utf-8', errors='replace').read()
        tot = re.search(r'Total : .*', txt)
        lignes += ['', '### Revue des animations', '', f'- {tot.group(0) if tot else "voir revue/rapport.md"}',
                   '- Détail complet (scores par état, défauts triés, preuves) : [revue/rapport.md](revue/rapport.md)']
    ap = [x for x in sorted(os.listdir(rv)) if x.startswith('apercu_')] if os.path.isdir(rv) else []
    if ap: lignes += ['', '### Aperçus des états', '', *[f'- [revue/{x}](revue/{x})' for x in ap]]
    dossiers_cartes = sorted(x for x in os.listdir(OUT) if x.startswith('carte') and os.path.isdir(os.path.join(OUT, x)))
    for dc in dossiers_cartes:
        lignes += ['', f'### Captures de la carte — {dc[6:] or "jour"}', ''] + [f'- [{x}]({dc}/{x})' for x in sorted(os.listdir(os.path.join(OUT, dc)))]
    if not dossiers_cartes and _dossier:
        lignes += ['', '### Captures de la carte', '', f'- Pas de captures demandées : les dernières sont dans [`../{_dossier}/`](../{_dossier}/).']
lignes += ['', '### Journaux', '', 'Sortie complète de chaque commande : `logs/` (un fichier par étape).',
           '', f'Durée totale : {(time.time() - t0) / 60:.1f} min.']
texte = '\n'.join(tete_rapport + lignes).replace(OUT + os.sep, '').replace(OUT, '.')

# ---------------------------------------------------------------------------------------------------------
# 5. 3 derniers dossiers, DERNIER.md, un seul commit orphelin sur pc-resultats, push --force (jamais main)
# ---------------------------------------------------------------------------------------------------------
ok_tout = not erreurs and not console_uniq and not manq
ranger(texte, f'main {rev[0]} — ' + ('✅ tout passe' if ok_tout else f'⚠ {len(erreurs) + (1 if console_uniq else 0) + (1 if manq else 0)} problème(s)'),
       '\n'.join(tete_rapport[2:]).replace(OUT + os.sep, STAMP + '/'), teste=tete)
