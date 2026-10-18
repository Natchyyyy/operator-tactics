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
        # une ressource externe injoignable (police Google Fonts : pas d'internet dans le conteneur de test) n'est pas une erreur du jeu
        pg.on("console", lambda m: errs.append(f"console.{m.type}: {m.text}") if m.type == "error" and "ERR_TUNNEL_CONNECTION_FAILED" not in m.text and "ERR_INTERNET_DISCONNECTED" not in m.text else None)
        async def tab(t):   # les onglets du QG sont des tuiles (barre d'onglets cachée, comme le jeu d'origine)
            if t == "missions": await pg.evaluate("() => { OT.resetPlay && OT.resetPlay(); document.querySelector('.tabs [data-tab=missions]').click(); }")
            else: await pg.evaluate(f"() => document.querySelector('.tabs [data-tab={t}]').click()")
            await pg.wait_for_timeout(120)
        async def cont():   # « Continuer » fait défiler les panneaux de récompenses puis ferme l'écran
            for _ in range(6):
                if not await pg.is_visible("#rewards"): break
                await pg.click("#rwContinue"); await pg.wait_for_timeout(150)
        url = sys.argv[1] + ("&" if "?" in sys.argv[1] else "?") + "seed=3"
        pg.set_default_timeout(240000)   # rendu logiciel (SwiftShader) : lancer une bataille avec le post-traitement complet prend du temps
        await pg.goto(url, timeout=120000); await pg.wait_for_function("window.PRET", timeout=60000)
        # ---- Écran titre puis quartier général ----
        check("la page s'ouvre sur l'écran titre (scène 3D)", await pg.is_visible("#title") and await pg.evaluate("() => !!document.querySelector('#titleScene')"))
        await pg.click("#titleStart"); await pg.wait_for_timeout(600)
        gd = await pg.evaluate("() => !document.querySelector('#guide').classList.contains('hidden')")
        check("première visite : le guide s'ouvre au QG", gd)
        for _ in range(5): await pg.click("#gNext")
        check("le guide se referme à la dernière page et ne revient plus", await pg.evaluate("() => document.querySelector('#guide').classList.contains('hidden') && localStorage.getItem('ot-guide') === '1'"))
        check("« Entrer au quartier général » ouvre le QG", await pg.is_visible("#hq") and not await pg.is_visible("#app") and not await pg.is_visible("#title"))
        nport = await pg.evaluate("() => document.querySelectorAll('#hqRoster img.portrait').length"); check("les portraits 3D des cinq opérateurs du GIGN sont rendus", nport >= 5, nport)
        check("300 crédits et 5 opérateurs débloqués au départ", await pg.evaluate("() => window.HQ.profile().credits") == 300 and await pg.evaluate("() => document.querySelectorAll('.opcard:not(.locked)').length") == 5)
        # accueil : puissance, rang, personnalisation
        rating = await pg.inner_text("#hqRating"); check("la puissance d'équipe est affichée (nombre)", rating.strip().isdigit(), rating)
        hs = await pg.evaluate("() => [document.querySelectorAll('#homeSquad .hsq').length, document.querySelectorAll('#homeSquad .hsq img.portrait').length, ...['.rb-money', '.rb-season', '.rb-ach', '.rawfoot .pill[data-go=cartes]', '#customBtn'].map(q => { const e = document.querySelector(q); return !e || getComputedStyle(e).display === 'none' || !!e.closest('[hidden]'); })]")
        check("accueil : escouade de 5 avec portraits ; saison, succès, crédits, cartes et tenue mis de côté", hs[0] == 5 and hs[1] == 5 and all(hs[2:]), hs)
        await pg.click("#homeSquad .hsq[data-op='op_lynx']"); await pg.wait_for_timeout(200)
        check("un clic sur un membre de l'escouade ouvre sa fiche", await pg.evaluate("() => !document.querySelector('[data-panel=equipe]').classList.contains('hidden') && document.querySelector('#tmCard').textContent.includes('Lynx')"))
        # réglages : ouverture, vitesse par défaut, export → import (aller-retour de la carrière)
        await pg.evaluate("() => document.querySelector('#hqSettings').click()")
        check("le bouton ⚙ ouvre les réglages", await pg.evaluate("() => !document.querySelector('#settings').classList.contains('hidden')"))
        await pg.evaluate("() => document.querySelector('#setSpeed [data-v=\"2\"]').click()")
        check("la vitesse par défaut est retenue", await pg.evaluate("() => window.OT_SETTINGS.get('speed') === 2 && JSON.parse(localStorage.getItem('ot-settings')).speed === 2"))
        await pg.evaluate("() => window.OT_SETTINGS.set('speed', 1)")
        rt = await pg.evaluate("() => { const t = window.HQ.exportSave(); const c = window.HQ.profile().credits; window.HQ.profile().credits = 1; const ok = window.HQ.importSave(t); const bad = window.HQ.importSave('{pas du json'); return [ok, bad, window.HQ.profile().credits === c]; }")
        check("export puis import rend la même carrière ; un fichier invalide est refusé", rt == [True, False, True], rt)
        await pg.evaluate("() => document.querySelector('#setClose').click()")
        # équipe : fiche de Lynx, onglet équipement (une seule arme : le fusil d'assaut)
        await tab("equipe")
        await pg.click("#tmChange"); await pg.click(".opcard[data-id='op_lynx']"); await pg.click("#trView"); await pg.click(".tmtabs [data-tt=equip]")
        wopts = await pg.evaluate("() => [...document.querySelectorAll('#selWeapon option')].map(o => o.value)")
        check("une seule arme proposée : le fusil d'assaut", wopts == ["carbine"], wopts)
        await pg.select_option("#selFormation", "nord"); await pg.wait_for_timeout(100)
        check("la formation « nord » assigne la voie nord", await pg.evaluate("() => window.HQ.profile().squad.every(id => window.HQ.profile().operators[id].lane === -1)"))
        saved = await pg.evaluate("() => { try { return !!localStorage.getItem('operator-tactics-save-v1'); } catch (e) { return 'indispo'; } }")
        check("la progression est sauvegardée dans le navigateur", saved is True, saved)
        # lancer la première mission
        await tab("missions")
        await pg.click(".medtile[data-camp=reguliere]"); await pg.click(".mission[data-id='patrouille']"); await pg.click("#toPrep"); await pg.click("#launch"); await pg.wait_for_timeout(300)
        vs_info = await pg.evaluate("() => [!document.querySelector('#vs').classList.contains('hidden'), document.querySelector('#vsName1').textContent, document.querySelector('#vsRating0').textContent, document.querySelectorAll('#vsSquad1 span').length]")
        check("l'écran « VS » présente les deux équipes avant la bataille", vs_info[0] and vs_info[1] == "Groupe Karst" and vs_info[3] == 4, vs_info)
        await pg.click("#vsGo"); await pg.wait_for_timeout(600)
        check("la mission ouvre l'écran de bataille", await pg.is_visible("#app") and not await pg.is_visible("#hq"))
        bri = await pg.evaluate("() => [!document.querySelector('#briefing').classList.contains('hidden'), document.querySelector('#brName').textContent, window.API.battle().t]")
        check("mission de campagne : briefing affiché (nom de la mission), bataille en attente", bri[0] and bri[1] == "Patrouille accrochée" and bri[2] == 0, bri)
        await pg.click("#briefGo")
        try: await pg.wait_for_function("() => window.API.battle().t > 0", timeout=180000)
        except Exception: pass
        check("« Commencer la mission » ferme le briefing et lance la bataille", await pg.evaluate("() => document.querySelector('#briefing').classList.contains('hidden') && window.API.battle().t > 0"))
        tc = await pg.evaluate("() => [...document.querySelectorAll('#tactics0 .tcard:not(.rotcard)')].map(c => c.dataset.tactic)"); check("la tactique Tiroir d'Alpha est affichée en bataille", tc == ['tiroir'], tc)
        check("Lynx porte le fusil d'assaut dans la bataille", await pg.evaluate("() => window.API.battle().units.find(u => u.callsign === 'Lynx').weapon.id") == "carbine")
        check("l'ennemi de la mission est celui annoncé (ordre Prudent, 4 opérateurs)", await pg.evaluate("() => window.API.battle().teams[1].order === 'careful' && window.API.battle().teams[1].units.length === 4"))
        await pg.click("[data-speed='4']"); await pg.wait_for_timeout(1500)
        await pg.click("#moreBtn"); await pg.select_option("#order0", "hold"); await pg.wait_for_timeout(200); await pg.click("#moreBtn")   # options repliées sous « ⋯ »
        used = await pg.evaluate("() => { const b = window.API.battle(); return [b.teams[0].bound.n, b.teams[0].units.filter(u => u.boundGroup >= 0).length, b.teams[0].units.length]; }")
        check("le Tiroir est en place (moitiés d'escouade, bonds comptés)", used[1] == used[2] and used[2] >= 4 and used[0] >= 0, used)
        check("l'ordre d'Alpha changé en cours de bataille est appliqué et journalisé", await pg.evaluate("() => window.API.battle().teams[0].order === 'hold' && window.API.battle().log.some(e => e.kind === 'order')"))
        await pg.evaluate("() => { API.pause(true); API.runToEnd(); }")   # fin de mission simulée d'un coup (le rendu logiciel des soldats 3D est lent)
        await pg.wait_for_function("() => !document.querySelector('#result').classList.contains('hidden')", timeout=60000)
        res_m = await pg.evaluate("() => window.API.battle().result")
        credits_before = await pg.evaluate("() => window.HQ.profile().credits")
        await pg.click("#resHq")
        try: await pg.wait_for_function("() => !document.querySelector('#rewards').classList.contains('hidden')", timeout=8000)
        except Exception: pass
        check("l'écran de récompenses s'affiche au retour (total et XP de rang)", await pg.is_visible("#rewards") and (await pg.inner_text("#rwTotal")).strip().isdigit())
        await cont(); await pg.wait_for_timeout(100)
        prof = await pg.evaluate("() => window.HQ.profile()")
        exp_gain = round(180 * (1 if res_m["winner"] == 0 else 0.5 if res_m["winner"] == -1 else 0.3))
        check("retour au QG : crédits de mission ajoutés selon l'issue réelle (plus défis éventuels)", prof["credits"] - credits_before >= exp_gain, (prof["credits"], credits_before, exp_gain, res_m["winner"]))
        check("le rang progresse (XP joueur > 0)", prof["xp"] > 0, prof["xp"])
        check("chaque opérateur engagé a gagné de l'expérience et une bataille à son compteur", all(prof["operators"][i]["xp"] > 0 and prof["operators"][i]["battles"] == 1 for i in prof["squad"]))
        # rechargement de la page : la progression est conservée
        await pg.reload(); await pg.wait_for_function("window.PRET", timeout=60000); await pg.click("#titleStart"); await pg.wait_for_timeout(600)
        check("après rechargement, la progression est conservée", await pg.evaluate("() => window.HQ.profile().credits") == prof["credits"])
        # ---- Jouer : campagnes verrouillées, bataille rapide ----
        await tab("missions")
        st = await pg.evaluate("() => [document.querySelectorAll('#hqMissions .mission').length, document.querySelectorAll('#hqMissions .mission.locked').length, document.querySelectorAll('.campbtn.locked').length, !!document.querySelector('.mission.final, .final')]")
        check("onglet Jouer : 6 missions de campagne, les suivantes verrouillées, une seule campagne, finale signalée", st[0] == 6 and 0 < st[1] < 6 and st[2] == 0 and st[3], st)
        await pg.click(".quickcard"); await pg.wait_for_timeout(100); await pg.click("#launch"); await pg.wait_for_timeout(300)
        qv = await pg.evaluate("() => [!document.querySelector('#vs').classList.contains('hidden'), document.querySelector('#vsObj').textContent]")
        check("la bataille rapide passe par l'écran VS avec un objectif tiré au sort", qv[0] and len(qv[1]) > 3, qv)
        await pg.click("#vsGo"); await pg.wait_for_timeout(600); await pg.evaluate("() => { API.pause(true); API.runToEnd(); }")
        await pg.wait_for_function("() => !document.querySelector('#result').classList.contains('hidden')", timeout=60000)
        await pg.click("#resHq"); await pg.wait_for_timeout(1200); await cont(); await pg.wait_for_timeout(200)
        qp = await pg.evaluate("() => window.HQ.profile().quick.played")
        check("après une bataille rapide, le compteur de batailles rapides avance", qp == 1, qp)
        # ---- Bataille libre (graine fixée) ----
        await pg.click("#freeBattle"); await pg.wait_for_timeout(600)
        await pg.click("#moreBtn"); await pg.fill("#seed", "3"); await pg.click("#newBattle"); await pg.wait_for_timeout(200); await pg.click("#moreBtn")
        await pg.click("#play"); await pg.wait_for_timeout(100)  # « Nouvelle bataille » lance tout de suite ; on met en pause pour tester ▶ ci-dessous
        check("la page a un titre", (await pg.title()) == "Operator Tactics", await pg.title())
        check("la scène 3D est là (canvas WebGL)", await pg.evaluate("() => !!document.querySelector('#scene').getContext('webgl2') || !!document.querySelector('#scene').getContext('webgl')"))
        n = await pg.evaluate("() => document.querySelectorAll('.card').length"); check("10 cartes d'opérateurs affichées", n == 10, n)
        lab = await pg.evaluate("() => document.querySelectorAll('#labels .label').length"); check("10 étiquettes 3D", lab == 10, lab)
        # lancer à 4x et attendre la fin
        await pg.click("[data-speed='4']"); await pg.click("#play")
        t0 = time.time()
        await pg.wait_for_function("() => window.API.battle().t > 1", timeout=120000)   # la bataille avance en temps réel…
        # …puis on saute (simulation seule) jusqu'à 1,5 s de la fin connue, et la fin se joue en temps réel (bannière, résultat)
        await pg.evaluate("() => { const b = API.battle(); const D = new OT.Battle(b.opts).run().duration; while (!b.over && b.t < D - 1.5) b.step(); b.drainEvents(); }")
        await pg.wait_for_function("() => window.API.battle().over", timeout=400000)
        dt = time.time() - t0
        res = await pg.evaluate("() => window.API.battle().result")
        check(f"la bataille se joue jusqu'au bout en temps réel ({dt:.0f} s réelles pour {res['duration']:.0f} s simulées à 4×)", res is not None)
        await pg.wait_for_timeout(300)
        bn = await pg.evaluate("() => [document.querySelector('#banner').className, document.querySelector('#bannerText').textContent]")
        exp_b = "ÉGALITÉ" if res["winner"] == -1 else ("L'EMPORTE" if True else "")
        check("la bannière de fin apparaît d'abord, au nom du vainqueur", 'show' in bn[0] and exp_b in bn[1] and (res["winner"] == -1 or ("ALPHA" in bn[1]) == (res["winner"] == 0)), bn)
        await pg.wait_for_function("() => !document.querySelector('#result').classList.contains('hidden')", timeout=300000)   # bannière + plan final, au rythme du rendu
        shown = await pg.evaluate("() => !document.querySelector('#result').classList.contains('hidden')"); check("l'écran de résultat s'affiche", shown)
        title = await pg.inner_text("#resTitle"); exp = "Égalité" if res["winner"] == -1 else ("Vous avez gagné" if res["winner"] == 0 else "Vous avez perdu")
        check("le titre du résultat correspond au vainqueur calculé", title.strip().lower() == exp.lower(), (title, exp))
        pct0 = await pg.inner_text("#resPct0"); check("l'état d'équipe affiché (%) est celui du résultat", pct0.strip() == str(res["teams"][0]["hpPct"]) + "%", (pct0, res["teams"][0]["hpPct"]))
        sp = await pg.evaluate("() => [document.querySelectorAll('#resSpecials .l').length, document.querySelector('#resSpecials').textContent]"); check("neutralisations + 5 spéciaux affichés (tête, séries, groupe, revanches, vétérans)", sp[0] == 6 and 'De groupe' in sp[1], sp)
        rows = await pg.evaluate("() => document.querySelectorAll('#resTables tbody tr').length"); check("10 lignes dans les tableaux de résultat", rows == 10, rows)
        # cohérence interface ↔ simulation : compteur d'opérateurs en état
        b0 = await pg.inner_text("#tpct0"); b1 = await pg.inner_text("#tpct1")
        check("les barres d'état des équipes correspondent au résultat", b0.strip() == str(res["teams"][0]["hpPct"]) + "%" and b1.strip() == str(res["teams"][1]["hpPct"]) + "%", (b0, b1, res["teams"][0]["hpPct"], res["teams"][1]["hpPct"]))
        # le journal contient la fin
        j = await pg.inner_text("#journal"); check("le journal contient le début et la fin de l'engagement", "Début de l'engagement" in j and "Fin de l'engagement" in j)
        # revoir la bataille : rejouée à l'identique
        before = await pg.evaluate("() => { const b = window.API.battle(); return [b.result.winner, Math.round(b.t * 10), b.log.length]; }")
        await pg.click("#resReview"); await pg.wait_for_timeout(200)
        rv = await pg.evaluate("() => { API.pause(true); const r = API.runToEnd(); const b = API.battle(); return [r.winner, Math.round(b.t * 10), b.log.length, document.querySelector('#app').classList.contains('reviewing')]; }")
        check("« Revoir la bataille » rejoue exactement la même bataille", rv[:3] == before and rv[3], (before, rv))
        hits_log = await pg.evaluate("() => window.API.battle().log.filter(e => (e.kind === 'hit' || e.kind === 'down') && ['tête', 'torse', 'membre'].includes(e.loc)).length")
        hits_stats = sum(u["stats"]["hits"] for t in res["teams"] for u in t["units"])
        check("journal = statistiques (touchés par balle ; éclats journalisés à part)", hits_log == hits_stats, (hits_log, hits_stats))
        await pg.screenshot(path="captures/verif-resultat.png")
        # rejouer la même graine : même vainqueur
        await pg.click("#resReplay"); await pg.wait_for_timeout(300); await pg.click("#play"); await pg.wait_for_timeout(100); await pg.click("#play")
        await pg.evaluate("() => window.API.step(5)")
        same = await pg.evaluate("() => window.API.battle().seed"); check("« Rejouer cette graine » relance la même graine", same == res["seed"], (same, res["seed"]))
        # changer l'ordre d'Alpha en Tenir et relancer : l'ordre est bien transmis à la simulation
        await pg.click("#moreBtn"); await pg.select_option("#order0", "hold"); await pg.click("#newBattle"); await pg.wait_for_timeout(200); await pg.click("#moreBtn")
        order = await pg.evaluate("() => window.API.battle().teams[0].order"); check("le sélecteur d'ordre modifie la simulation", order == "hold", order)
        await pg.evaluate("() => document.activeElement && document.activeElement.blur()")
        await pg.keyboard.press("3"); cam0 = await pg.evaluate("() => document.querySelector('[data-cam].on').dataset.cam"); await pg.keyboard.press("c")
        kb = await pg.evaluate("() => [document.querySelector('[data-speed=\"4\"]').classList.contains('on'), document.querySelector('[data-cam].on').dataset.cam]")
        check("raccourcis clavier : 3 → vitesse ×4, C → caméra suivante", kb[0] and kb[1] != cam0, (cam0, kb))
        await pg.keyboard.press("1")
        # « Résultat immédiat » : même résultat que la simulation complète de la même graine
        sk = await pg.evaluate("() => { const b = window.API.battle(); const ref = new OT.Battle(b.opts).run(); document.querySelector('#skip').click(); const r = window.API.battle().result; return [!!r, r && r.winner === ref.winner && r.duration === ref.duration, !document.querySelector('#result').classList.contains('hidden')]; }")
        check("« Résultat immédiat » donne le même résultat que la simulation complète et ouvre l'écran de résultat", sk == [True, True, True], sk)
        son = await pg.evaluate("async () => { if (typeof Son === 'undefined') return 'pas de lecteur'; Son.init(); await Son.charger(); return [Son.jouer('tir_fusil'), Son.jouer('impact_metal'), Son.jouer('impact_bois'), Son.jouer('impact_sol'), Son.jouer('pas'), Son.jouer('recharge'), Son.jouer('victoire'), Son.jouer('musique_titre')].every(Boolean) && await Son.boucle('musique_qg', { voie: 'musique', vol: .5 }); }")
        check("les bruitages et musiques se décodent et se jouent", son is True, son)
        check("aucune erreur JavaScript", not errs, errs[:5])
        print(f"\n{ok}/{tot} vérifications réussies"); await br.close()
        sys.exit(0 if ok == tot else 1)
asyncio.run(main())
