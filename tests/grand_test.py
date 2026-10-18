# Grand test de bout en bout, avec le rendu complet (post-traitement, effets, modèles HD) : des batailles entières dans
# chaque condition (jour, nuit, brouillard, pluie) et chaque mode (élimination, capture), en faisant tourner toutes les
# caméras (réalisateur, épaule, travelling, suivre, satellite, libre). La simulation avance sans rendu entre deux images
# rendues (le rendu logiciel est lent) ; on vérifie : aucune erreur JavaScript, l'écran de résultat s'affiche, les
# compteurs du HUD suivent la simulation, les effets et les chargeurs ne restent pas dans un état incohérent.
# usage : PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers python3 tests/grand_test.py http://127.0.0.1:8765/dist/index.html [--vite]
import asyncio, sys, time
from playwright.async_api import async_playwright

GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]
URL = sys.argv[1]; VITE = "--vite" in sys.argv
CAS = [("jour", None), ("nuit", "capture"), ("brouillard", None), ("pluie", "capture")] if not VITE else [("jour", "capture")]
ok = 0; ko = 0
def check(nom, cond, info=""):
    global ok, ko
    if cond: ok += 1; print("PASS", nom, flush=True)
    else: ko += 1; print("FAIL", nom, " ->", info, flush=True)

async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(args=GL); pg = await br.new_page(viewport={"width": 960, "height": 540}); errs = []
        pg.set_default_timeout(600000)
        pg.on("pageerror", lambda e: errs.append("erreur: " + str(e)))
        pg.on("console", lambda m: errs.append(f"console.{m.type}: {m.text}") if m.type == "error" and "ERR_TUNNEL_CONNECTION_FAILED" not in m.text else None)
        t0 = time.time()
        await pg.goto(URL + ("&" if "?" in URL else "?") + "manual=1&mode=free", timeout=300000)
        await pg.wait_for_function("window.PRET && OT.Modeles3D.ready && OT.Soldat3D.ready", timeout=600000)
        print(f"page prête en {time.time() - t0:.0f} s", flush=True)
        hd = await pg.evaluate("Object.keys(OT.Modeles3D.hd || {}).length")
        check("modèles haute définition chargés (servis à côté de la page)", hd >= 8, hd)
        for k, (cond, obj) in enumerate(CAS):
            t1 = time.time(); n0 = len(errs)
            objs = "{type:'capture'}" if obj else "null"
            await pg.evaluate(f"API.start({{mapId:'parking', seed:{31 + k}, conditions:'{cond}', objective:{objs}}})")
            cams = ["director", "shoulder", "dolly", "follow", "sat", "free"]
            frames = 0; fin = None
            for it in range(240):
                st = await pg.evaluate("""(i) => { API.stepRaw(25); const b = API.battle(); if (b.over) return {over: true, t: b.t};
                  const al = b.units.filter(u => u.alive && u.team === 0); const u = al[i % Math.max(1, al.length)];
                  const c = ['director','shoulder','dolly','follow','sat','free'][i % 6];
                  if (u && (c === 'shoulder' || c === 'dolly' || c === 'follow')) API.camShot(c, u.id);
                  else if (c === 'free') API.look(36, 23, i * 0.7, 0.6, 30, 0);
                  else { document.querySelector('[data-cam="' + c + '"]').click(); }
                  API.stepFine(1);
                  return {over: false, t: b.t}; }""", it)
                frames += 1
                if it % 10 == 0: print(f"   … t = {st['t']:.0f} s de bataille, {time.time() - t1:.0f} s écoulées", flush=True)
                if st["over"]: fin = st; break
            check(f"{cond}{' / capture' if obj else ''} : la bataille va jusqu'au bout ({frames} images rendues)", fin is not None, fin)
            await pg.wait_for_timeout(300)
            res = await pg.evaluate("() => [!document.querySelector('#result').classList.contains('hidden'), document.querySelector('#resTitle').textContent, API.battle().result && API.battle().result.winner]")
            check(f"{cond} : écran de résultat affiché ({res[1]})", res[0] and res[1] != "", res)
            hud = await pg.evaluate("""() => { const b = API.battle(); return b.units.filter(u => u.team === 0).every(u => { const c = document.querySelector(`.card[data-id="${u.id}"]`); return c && c.classList.contains('dead') === !u.alive; }); }""")
            check(f"{cond} : cartes de l'escouade = état réel des soldats", hud)
            mags = await pg.evaluate("""() => { const ms = API.meshes(); let bad = 0; for (const id in ms) { const w = ms[id].weapon; if (w && w.mag && !w.mag.visible && !(API.battle().units.find(u => u.id === id) || {}).reloading) bad++; } return bad; }""")
            check(f"{cond} : aucun chargeur resté invisible hors rechargement", mags == 0, mags)
            check(f"{cond} : aucune erreur JavaScript", len(errs) == n0, errs[n0:n0 + 5])
            print(f"   ({time.time() - t1:.0f} s)", flush=True)
            await pg.evaluate("() => document.querySelector('#resClose') && document.querySelector('#resClose').click()")
        await pg.screenshot(path="captures/grand-test-fin.png")
        await br.close()
    print(f"\n{ok}/{ok + ko} vérifications réussies", flush=True)
    sys.exit(1 if ko else 0)

asyncio.run(main())
