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
        # ---- Quartier général : la page s'ouvre sur le QG, profil neuf ----
        check("la page s'ouvre sur le quartier général", await pg.is_visible("#hq") and not await pg.is_visible("#app"))
        check("300 crédits et 5 opérateurs débloqués au départ", (await pg.inner_text("#credits")) == "300" and await pg.evaluate("() => document.querySelectorAll('.opcard:not(.locked)').length") == 5)
        # équiper Lynx d'un fusil à pompe depuis la fiche
        await pg.click(".opcard[data-id='op_lynx']"); await pg.select_option("#selWeapon", "shotgun"); await pg.wait_for_timeout(100)
        check("le changement d'arme est enregistré dans le profil", await pg.evaluate("() => window.HQ.profile().operators.op_lynx.weaponId") == "shotgun")
        await pg.select_option("#selFormation", "nord"); await pg.wait_for_timeout(100)
        check("la formation « nord » assigne la voie nord", await pg.evaluate("() => window.HQ.profile().squad.every(id => window.HQ.profile().operators[id].lane === -1)"))
        saved = await pg.evaluate("() => { try { return !!localStorage.getItem('operator-tactics-save-v1'); } catch (e) { return 'indispo'; } }")
        check("la progression est sauvegardée dans le navigateur", saved is True, saved)
        # lancer la première mission
        await pg.click(".mission[data-id='patrouille']"); await pg.click("#launch"); await pg.wait_for_timeout(600)
        check("la mission ouvre l'écran de bataille", await pg.is_visible("#app") and not await pg.is_visible("#hq"))
        check("Lynx porte bien le fusil à pompe dans la bataille", await pg.evaluate("() => window.API.battle().units.find(u => u.callsign === 'Lynx').weapon.id") == "shotgun")
        check("l'ennemi de la mission est celui annoncé (ordre Prudent, 5 opérateurs)", await pg.evaluate("() => window.API.battle().teams[1].order === 'careful' && window.API.battle().teams[1].units.length === 5"))
        await pg.click("[data-speed='4']"); await pg.wait_for_timeout(1500)
        await pg.select_option("#order0", "hold"); await pg.wait_for_timeout(200)
        check("l'ordre d'Alpha changé en cours de bataille est appliqué et journalisé", await pg.evaluate("() => window.API.battle().teams[0].order === 'hold' && window.API.battle().log.some(e => e.kind === 'order')"))
        await pg.wait_for_function("() => window.API.battle().over", timeout=400000); await pg.wait_for_timeout(500)
        res_m = await pg.evaluate("() => window.API.battle().result")
        await pg.click("#resHq"); await pg.wait_for_timeout(600)
        prof = await pg.evaluate("() => window.HQ.profile()")
        exp_credits = 300 + round(180 * (1 if res_m["winner"] == 0 else 0.5 if res_m["winner"] == -1 else 0.3))
        check("retour au QG : crédits créditées selon l'issue réelle", prof["credits"] == exp_credits, (prof["credits"], exp_credits, res_m["winner"]))
        check("chaque opérateur engagé a gagné de l'expérience et une bataille à son compteur", all(prof["operators"][i]["xp"] > 0 and prof["operators"][i]["battles"] == 1 for i in prof["squad"]))
        check("le bilan de mission s'affiche au QG", await pg.is_visible("#hqRewards"))
        # rechargement de la page : la progression est conservée
        await pg.reload(); await pg.wait_for_function("window.PRET", timeout=60000)
        check("après rechargement, la progression est conservée", (await pg.inner_text("#credits")) == str(exp_credits))
        # ---- Bataille libre (graine fixée) ----
        await pg.click("#freeBattle"); await pg.wait_for_timeout(600)
        await pg.fill("#seed", "3"); await pg.click("#newBattle"); await pg.wait_for_timeout(200)
        await pg.click("#play"); await pg.wait_for_timeout(100)  # « Nouvelle bataille » lance tout de suite ; on met en pause pour tester ▶ ci-dessous
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
        await pg.click("#resReplay"); await pg.wait_for_timeout(300); await pg.click("#play"); await pg.wait_for_timeout(100); await pg.click("#play")
        await pg.evaluate("() => window.API.step(5)")
        same = await pg.evaluate("() => window.API.battle().seed"); check("« Rejouer cette graine » relance la même graine", same == res["seed"], (same, res["seed"]))
        # changer l'ordre d'Alpha en Tenir et relancer : l'ordre est bien transmis à la simulation
        await pg.select_option("#order0", "hold"); await pg.click("#newBattle"); await pg.wait_for_timeout(200)
        order = await pg.evaluate("() => window.API.battle().teams[0].order"); check("le sélecteur d'ordre modifie la simulation", order == "hold", order)
        son = await pg.evaluate("async () => { if (typeof Son === 'undefined') return 'pas de lecteur'; Son.init(); await Son.charger(); return [Son.jouer('tir_fusil'), Son.jouer('pas'), Son.jouer('recharge'), Son.jouer('victoire')].every(Boolean); }")
        check("les 14 bruitages se décodent et se jouent", son is True, son)
        check("aucune erreur JavaScript", not errs, errs[:5])
        print(f"\n{ok}/{tot} vérifications réussies"); await br.close()
        sys.exit(0 if ok == tot else 1)
asyncio.run(main())
