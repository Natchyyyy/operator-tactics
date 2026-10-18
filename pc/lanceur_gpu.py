# Lance un script Python du projet (tests/, outils/) sur la carte graphique du PC, sans modifier le script.
#   python pc/lanceur_gpu.py SCRIPT.py [arguments du script…]
#   python pc/lanceur_gpu.py --sonde          (affiche le moteur WebGL obtenu)
# Ce que fait le lanceur (le projet est écrit pour un conteneur Linux sans carte graphique) :
#   * remplace les options « SwiftShader » (rendu logiciel) de Chromium par le rendu matériel (ANGLE / Direct3D 11) ;
#     (le « headless shell » de Playwright obtient bien la RTX 5070 Ti ; chrome.exe complet ne se lance pas ici : spawn UNKNOWN) ;
#   * fournit un module fcntl de remplacement (verrou.py l'importe ; il n'existe pas sous Windows) ;
#   * corrige PLAYWRIGHT_BROWSERS_PATH (les scripts imposent /opt/pw-browsers) et force l'UTF-8.
# Variable PC_GL=logiciel : garde SwiftShader (pour comparer avec la machine du cloud).
import os, sys, types, runpy, asyncio

os.environ['PLAYWRIGHT_BROWSERS_PATH'] = os.path.join(os.environ['LOCALAPPDATA'], 'ms-playwright')
os.environ.setdefault('PYTHONIOENCODING', 'utf-8')
try: sys.stdout.reconfigure(encoding='utf-8'); sys.stderr.reconfigure(encoding='utf-8')
except Exception: pass

# fcntl factice : une seule tâche lourde à la fois sur ce PC (le cycle est séquentiel)
fc = types.ModuleType('fcntl'); fc.LOCK_EX = 2; fc.LOCK_UN = 8; fc.LOCK_SH = 1; fc.LOCK_NB = 4
fc.flock = lambda f, op: None
sys.modules.setdefault('fcntl', fc)

GPU = os.environ.get('PC_GL', 'gpu') != 'logiciel'
ARGS_GPU = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']

from playwright.async_api._generated import BrowserType as _BT
_launch = _BT.launch
async def launch(self, *a, **kw):
    if GPU:
        args = [x for x in (kw.get('args') or []) if not (x.startswith('--use-gl') or x.startswith('--use-angle') or 'swiftshader' in x)]
        kw['args'] = args + [x for x in ARGS_GPU if x not in args]
    return await _launch(self, *a, **kw)
_BT.launch = launch

if __name__ == '__main__':
    if len(sys.argv) < 2: raise SystemExit(__doc__)
    if sys.argv[1] == '--sonde':
        from playwright.async_api import async_playwright
        async def sonde():
            async with async_playwright() as p:
                br = await p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader"]); pg = await br.new_page()
                r = await pg.evaluate("() => { const c = document.createElement('canvas'); const g = c.getContext('webgl2'); if (!g) return 'pas de WebGL2'; const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER); }")
                print(r); await br.close()
        asyncio.run(sonde()); sys.exit(0)
    script = os.path.abspath(sys.argv[1]); sys.argv = [script] + sys.argv[2:]
    sys.path.insert(0, os.path.dirname(script))
    runpy.run_path(script, run_name='__main__')
