# Captures d'écran d'une page web, y compris en 3D (WebGL logiciel « SwiftShader », sans carte graphique).
# Permet de VOIR une scène three.js depuis le conteneur, et d'y exécuter du JavaScript entre deux captures.
#
# usage :
#   python3 capture.py URL sortie [--taille 1280x720] [--attendre "window.PRET"] [--etape ...]…
# étapes (dans l'ordre, autant qu'on veut) :
#   --etape "js:CODE"     exécute CODE dans la page ; affiche le résultat s'il n'est ni vide ni 0
#   --etape "wait:800"    attend 800 ms (animations CSS, chargements)
#   --etape "shot"        capture → sortie-0.png, sortie-1.png, …
# sans --etape : une seule capture.
#
# Pièges connus :
#   * si CODE s'évalue en une FONCTION, Playwright l'APPELLE (sans arguments) ! Pour définir une fonction : "js:(window.f = (a) => …, 0)"
#   * SwiftShader est lent : une image 3D peut prendre 5 à 60 s ; les captures ont un délai de 400 s.
#   * un jeu qui tourne avec requestAnimationFrame avance tout seul ; pour des images reproductibles,
#     prévoir dans le jeu un mode « manuel » (ex. ?manual=1) et une fonction window.API.step(n, dt) appelée par "js:".
import asyncio, sys, time, argparse
from playwright.async_api import async_playwright
GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]
ap = argparse.ArgumentParser(); ap.add_argument("url"); ap.add_argument("sortie"); ap.add_argument("--taille", default="1280x720")
ap.add_argument("--attendre", default=None, help="expression JS à attendre (vraie) avant les étapes"); ap.add_argument("--etape", action="append", default=[])
a = ap.parse_args(); W, H = map(int, a.taille.split("x")); steps = a.etape or ["shot"]
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(args=GL); pg = await br.new_page(viewport={"width": W, "height": H}); errs = []
        pg.on("pageerror", lambda e: errs.append("erreur: " + str(e)))
        pg.on("console", lambda m: errs.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        t0 = time.time(); await pg.goto(a.url, timeout=180000)
        if a.attendre: await pg.wait_for_function(a.attendre, timeout=300000)
        print(f"page prête en {time.time() - t0:.1f} s", flush=True); k = 0
        for st in steps:
            if st.startswith("js:"):
                r = await pg.evaluate(st[3:])
                if r not in (None, 0, ""): print("js →", r, flush=True)
            elif st.startswith("wait:"): await pg.wait_for_timeout(int(st[5:]))
            elif st == "shot":
                f = f"{a.sortie}-{k}.png"; t = time.time(); await pg.screenshot(path=f, timeout=400000); k += 1; print(f"{f} ({time.time() - t:.1f} s)", flush=True)
            else: print("étape inconnue :", st)
        if errs: print("\n".join(errs[:10]))
        await br.close()
asyncio.run(main())
