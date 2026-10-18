# Détection des tours sur soi-même : bataille pas à pas rendue en k images par pas, puis liste des événements du détecteur
# (window.API.spinWatch / spins). usage : python3 outils/spin_animation.py URL?manual=1 [pas] [graine] [images par pas]
import asyncio, sys, json
from playwright.async_api import async_playwright
GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
URL = sys.argv[1]; N = int(sys.argv[2]) if len(sys.argv) > 2 else 400; SEED = int(sys.argv[3]) if len(sys.argv) > 3 else 7; K = int(sys.argv[4]) if len(sys.argv) > 4 else 2
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(args=GL); pg = await br.new_page(viewport={"width": 480, "height": 270}); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(URL, timeout=180000); await pg.wait_for_function("window.API && window.OT && OT.Soldat3D && OT.Soldat3D.ready", timeout=300000)
        await pg.evaluate(f"(window.API.start({{ mapId: 'parking', seed: {SEED} }}), window.API.spinWatch(true), 0)")
        for i in range(N): await pg.evaluate(f"window.API.stepFine({K})")
        ev = await pg.evaluate("window.API.spins()")
        print(f"pas : {N} ; tours détectés : {len(ev)}")
        for e in ev[:8]:
            print(f"\n== {e['unit']} à t={e['t']} : bassin {e['bassinDeg']}°, torse {e['torseDeg']}° en 1 s")
            for r in e['hist'][::max(1, len(e['hist']) // 10)]: print("  ", json.dumps(r, ensure_ascii=False))
        if errs: print("erreurs :", errs[:3])
        await br.close()
asyncio.run(main())
