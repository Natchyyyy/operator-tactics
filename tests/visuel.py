# Non-régression visuelle : capture des écrans clés (mode manuel, graines et caméras fixées) et comparaison avec des
# images de référence (tests/ref/*.png). Un écart moyen par pixel au-delà du seuil signale un changement d'apparence.
# usage : python3 tests/visuel.py [URL]            → compare
#         python3 tests/visuel.py [URL] --maj      → (re)crée les références après un changement voulu
# Le serveur local doit tourner (python3 outils/serveur.py . 8765). Les différences sont écrites dans tests/ref/diff-*.png.
import asyncio, os, sys
from playwright.async_api import async_playwright
from PIL import Image, ImageChops

GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
ICI = os.path.dirname(os.path.abspath(__file__)); REF = os.path.join(ICI, "ref")
args = [a for a in sys.argv[1:] if not a.startswith("--")]
URL = (args[0] if args else "http://127.0.0.1:8765/web/index.html") + "?manual=1&mode=free"
MAJ = "--maj" in sys.argv
SEUIL = 4.0   # écart moyen toléré (0–255) : absorbe le bruit de rendu, pas un changement de mise en page

# chaque écran : nom, script de préparation (doit rendre une valeur), délai
ECRANS = [   # la bataille d'abord (page ouverte en bataille libre), puis le QG
    ("bataille-jour", "(() => { window.API.start({ mapId: 'entrepot', seed: 7 }); window.API.step(120); window.API.focus('Vautour', 2.3, 0.6, 26); return 1; })()"),
    ("bataille-nuit", "(() => { window.API.start({ mapId: 'raffinerie', seed: 7, conditions: 'nuit' }); window.API.step(60); window.API.focus('Granit', 2.0, 0.8, 40); return 1; })()"),
    ("qg-accueil", "(() => { window.HQ.show(); return 1; })()"),
    ("qg-equipe", "(() => { document.querySelector('.tabs [data-tab=equipe]').click(); return 1; })()"),
    ("qg-cartes", "(() => { document.querySelector('.tabs [data-tab=cartes]').click(); return 1; })()"),
    ("qg-jouer", "(() => { document.querySelector('.tabs [data-tab=missions]').click(); return 1; })()"),
    ("qg-carriere", "(() => { document.querySelector('.tabs [data-tab=carriere]').click(); return 1; })()"),
]

async def main():
    os.makedirs(REF, exist_ok=True); ok = 0; ko = []
    async with async_playwright() as p:
        br = await p.chromium.launch(args=GL); pg = await br.new_page(viewport={"width": 1920, "height": 1080})
        await pg.goto(URL, timeout=180000); await pg.wait_for_function("window.API && window.HQ", timeout=120000)
        # contrats du jour : tirage selon la date → on fige la date pour des images stables
        await pg.evaluate("() => { const d = OT.Game.dailyContracts; OT.Game.dailyContracts = (p) => d(p, '2026-01-01'); }")
        for nom, js in ECRANS:
            await pg.evaluate(js); await pg.wait_for_timeout(250)
            f = os.path.join(REF, nom + ".png") if MAJ else os.path.join(REF, "cur-" + nom + ".png")
            await pg.screenshot(path=f, timeout=400000)
            if MAJ: print("référence :", nom); continue
            ref = os.path.join(REF, nom + ".png")
            if not os.path.exists(ref): print("PAS DE RÉFÉRENCE", nom, "(lancer avec --maj)"); ko.append(nom); continue
            a, b = Image.open(ref).convert("RGB"), Image.open(f).convert("RGB")
            if a.size != b.size: print("FAIL", nom, "taille différente"); ko.append(nom); continue
            d = ImageChops.difference(a, b); h = d.convert("L").histogram(); n = a.size[0] * a.size[1]
            moy = sum(i * c for i, c in enumerate(h)) / n
            if moy <= SEUIL: ok += 1; print(f"PASS {nom} (écart moyen {moy:.2f})"); os.remove(f)
            else: ko.append(nom); d.point(lambda v: min(255, v * 4)).save(os.path.join(REF, "diff-" + nom + ".png")); print(f"FAIL {nom} (écart moyen {moy:.2f} > {SEUIL}) → tests/ref/diff-{nom}.png")
        await br.close()
    if not MAJ:
        print(f"\n{ok}/{ok + len(ko)} écrans identiques à la référence"); sys.exit(1 if ko else 0)

asyncio.run(main())
