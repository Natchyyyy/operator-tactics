# Vérification automatique de la page assemblée (Playwright + WebGL logiciel) :
# la page charge sans erreur, une bataille se joue en temps réel accéléré jusqu'au résultat, l'interface affiche les bonnes données.
# usage : PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers python3 tests/verif_page.py http://127.0.0.1:8765/dist/index.html
import asyncio, sys, time
from playwright.async_api import async_playwright
GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
ok = tot = 0
def check(nom, cond, info=""):
    global ok, tot; tot += 1; ok += bool(cond); print(("PASS " if cond else "FAIL ") + nom + ("" if cond else f"  -> {info}"), flush=True)
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(args=GL); pg = await br.new_page(viewport={"width": 1400, "height": 860}); errs = []
        pg.on("pageerror", lambda e: errs.append("erreur: " + str(e)))
        pg.on("console", lambda m: errs.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
        url = sys.argv[1] + ("&" if "?" in sys.argv[1] else "?") + "seed=3"
        await pg.goto(url, timeout=120000); await pg.wait_for_function("window.PRET", timeout=60000)
        check("la page a un titre", (await pg.title()) == "Operator Tactics", await pg.title())
        check("la scène 3D est là (canvas WebGL)", await pg.evaluate("() => !!document.querySelector('#scene').getContext('webgl2') || !!document.querySelector('#scene').getContext('webgl')"))
        n = await pg.evaluate("() => document.querySelectorAll('.card').length"); check("10 cartes d'opérateurs affichées", n == 10, n)
        lab = await pg.evaluate("() => document.querySelectorAll('#labels .label').length"); check("10 étiquettes 3D", lab == 10, lab)
        # lancer à 4x et attendre la fin
        await pg.click("[data-speed='4']"); await pg.click("#play")
        t0 = time.time()
        await pg.wait_for_function("() => window.API.battle().over", timeout=400000)
        dt = time.time() - t0
        res = await pg.evaluate("() => window.API.battle().result")
        check(f"la bataille se joue jusqu'au bout en temps réel ({dt:.0f} s réelles pour {res['duration']:.0f} s simulées à 4×)", res is not None)
        await pg.wait_for_timeout(500)
        shown = await pg.evaluate("() => !document.querySelector('#result').classList.contains('hidden')"); check("l'écran de résultat s'affiche", shown)
        title = await pg.inner_text("#resTitle"); exp = "Égalité" if res["winner"] == -1 else "Victoire " + res["teams"][res["winner"]]["name"]
        check("le titre du résultat correspond au vainqueur calculé", title.strip() == exp, (title, exp))
        rows = await pg.evaluate("() => document.querySelectorAll('#resTables tbody tr').length"); check("10 lignes dans les tableaux de résultat", rows == 10, rows)
        # cohérence interface ↔ simulation : compteur d'opérateurs en état
        a0 = await pg.inner_text("#alive0"); a1 = await pg.inner_text("#alive1")
        check("les compteurs d'effectifs correspondent", int(a0) == res["teams"][0]["alive"] and int(a1) == res["teams"][1]["alive"], (a0, a1, res["teams"][0]["alive"], res["teams"][1]["alive"]))
        # le journal contient la fin
        j = await pg.inner_text("#journal"); check("le journal contient le début et la fin de l'engagement", "Début de l'engagement" in j and "Fin de l'engagement" in j)
        hits_log = await pg.evaluate("() => window.API.battle().log.filter(e => e.kind === 'hit' || e.kind === 'down').length")
        hits_stats = sum(u["stats"]["hits"] for t in res["teams"] for u in t["units"])
        check("journal = statistiques (touchés)", hits_log == hits_stats, (hits_log, hits_stats))
        await pg.screenshot(path="captures/verif-resultat.png")
        # rejouer la même graine : même vainqueur
        await pg.click("#resReplay"); await pg.wait_for_timeout(300)
        await pg.evaluate("() => window.API.step(5)")
        same = await pg.evaluate("() => window.API.battle().seed"); check("« Rejouer cette graine » relance la même graine", same == res["seed"], (same, res["seed"]))
        # changer l'ordre d'Alpha en Tenir et relancer : l'ordre est bien transmis à la simulation
        await pg.select_option("#order0", "hold"); await pg.click("#newBattle"); await pg.wait_for_timeout(200)
        order = await pg.evaluate("() => window.API.battle().teams[0].order"); check("le sélecteur d'ordre modifie la simulation", order == "hold", order)
        check("aucune erreur JavaScript", not errs, errs[:5])
        print(f"\n{ok}/{tot} vérifications réussies"); await br.close()
        sys.exit(0 if ok == tot else 1)
asyncio.run(main())
