# (copie de travail : voir A_FAIRE.md) # Diagnostic d'animation : joue une bataille pas à pas (0,1 s), relève l'état d'animation de chaque soldat, et résume.
import asyncio, sys, json, collections
from playwright.async_api import async_playwright
GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
URL = sys.argv[1]; N = int(sys.argv[2]) if len(sys.argv) > 2 else 600; OUT = sys.argv[3] if len(sys.argv) > 3 else None
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(args=GL); pg = await br.new_page(viewport={"width": 960, "height": 540}); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(URL, timeout=180000); await pg.wait_for_function("window.API && window.OT && OT.Soldat3D && OT.Soldat3D.ready", timeout=300000)
        await pg.evaluate("window.API.start({ mapId: 'parking', seed: 7 })")
        recs = []
        for i in range(N):
            await pg.evaluate("window.API.step(1)")
            recs.append(await pg.evaluate("window.API.diag()"))
        if OUT: json.dump(recs, open(OUT, 'w'))
        # résumé
        n_mov = 0; slide = 0; lateral = 0; back = 0; clips = collections.Counter(); ts_bad = 0; ex = []
        nat = {'Walk_Aim': 0.93, 'Walk_Fight_Forward': 0.93, 'Run_and_Shoot': 1.9, 'Cautious_Crouch_Walk_Forward': 1.35, 'Walk_Low': 0.93, 'Run_Low': 1.9}
        for step in recs:
            for r in step:
                if not r or not r['alive']: continue
                clips[r['clip']] += 1
                if r['v'] > 0.3:
                    n_mov += 1
                    if r['clip'] in nat and r['ts'] is not None:
                        feet = nat[r['clip']] * abs(r['ts']); ratio = feet / r['v']
                        if ratio < 0.8 or ratio > 1.25: slide += 1
                    elif r['clip'] not in nat: slide += 1
                    e = r['ecart']; j = r['jambes'] or 0
                    eff = (e - j + 180) % 360 - 180 if e is not None else 0
                    if abs(eff) > 45 and abs(eff) < 135: lateral += 1
                    if abs(eff) >= 135: back += 1
                    if len(ex) < 8 and e is not None and abs(eff) > 45: ex.append(r)
        print(f"images en mouvement : {n_mov} ; glissement (pieds ≠ sol ±20 %) : {slide} ({100*slide/max(1,n_mov):.0f} %) ; déplacement latéral avec jambes de face : {lateral} ({100*lateral/max(1,n_mov):.0f} %) ; à reculons : {back} ({100*back/max(1,n_mov):.0f} %)")
        print("clips :", dict(clips.most_common(12)))
        print("exemples :", json.dumps(ex[:6]))
        if errs: print("erreurs :", errs[:5])
        await br.close()
asyncio.run(main())
