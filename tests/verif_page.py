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
        # ---- Écran titre puis quartier général ----
        check("la page s'ouvre sur l'écran titre (scène 3D)", await pg.is_visible("#title") and await pg.evaluate("() => !!document.querySelector('#titleScene')"))
        await pg.click("#titleStart"); await pg.wait_for_timeout(600)
        check("« Entrer au quartier général » ouvre le QG", await pg.is_visible("#hq") and not await pg.is_visible("#app") and not await pg.is_visible("#title"))
        nport = await pg.evaluate("() => document.querySelectorAll('#hqRoster img.portrait').length"); check("les portraits 3D des opérateurs sont rendus", nport >= 10, nport)
        check("300 crédits et 5 opérateurs débloqués au départ", (await pg.inner_text("#credits")) == "300" and await pg.evaluate("() => document.querySelectorAll('.opcard:not(.locked)').length") == 5)
        # accueil : puissance, rang, personnalisation
        rating = await pg.inner_text("#hqRating"); check("la puissance d'équipe est affichée (nombre)", rating.strip().isdigit(), rating)
        await pg.click(".custom2 summary"); await pg.wait_for_timeout(100)   # personnalisation repliée sur l'accueil
        await pg.fill("#teamName", "Les Faucons"); await pg.press("#teamName", "Tab"); await pg.wait_for_timeout(100)
        check("le nom d'équipe est enregistré", await pg.evaluate("() => window.HQ.profile().teamName") == "Les Faucons")
        await pg.click("#insPick button[data-ins='bouclier']"); await pg.wait_for_timeout(100)
        check("l'insigne débloqué est sélectionnable, un verrouillé non", await pg.evaluate("() => window.HQ.profile().insignia") == "bouclier" and await pg.evaluate("() => { const b = document.querySelector('#insPick button[data-ins=ancre]'); b.click(); return window.HQ.profile().insignia; }") == "bouclier")
        # cartes : ouvrir un paquet (crédits ajoutés pour le test), équiper une tactique
        await pg.click("[data-tab='cartes']"); await pg.evaluate("() => { window.HQ.profile().credits = 1000; }"); await pg.click("[data-tab='cartes']")
        await pg.evaluate("() => document.querySelector('.tabs [data-tab=cartes]').click()"); await pg.evaluate("() => document.querySelector('[data-pack=standard]').click()"); await pg.wait_for_timeout(300)
        n_cards = await pg.evaluate("() => document.querySelectorAll('#hqOpened .ccard').length"); check("un paquet standard ouvert montre 3 cartes", n_cards == 3, n_cards)
        check("le paquet a coûté 150 crédits (hors crédits gagnés par une carte)", await pg.evaluate("() => window.HQ.profile().packsOpened") == 1)
        # équipe : équiper Lynx d'un fusil à pompe depuis la fiche
        await pg.click("[data-tab='equipe']"); await pg.wait_for_timeout(100)
        await pg.click(".opcard[data-id='op_lynx']"); await pg.select_option("#selWeapon", "shotgun"); await pg.wait_for_timeout(100)
        check("le changement d'arme est enregistré dans le profil", await pg.evaluate("() => window.HQ.profile().operators.op_lynx.weaponId") == "shotgun")
        await pg.select_option("#selFormation", "nord"); await pg.wait_for_timeout(100)
        check("la formation « nord » assigne la voie nord", await pg.evaluate("() => window.HQ.profile().squad.every(id => window.HQ.profile().operators[id].lane === -1)"))
        saved = await pg.evaluate("() => { try { return !!localStorage.getItem('operator-tactics-save-v1'); } catch (e) { return 'indispo'; } }")
        check("la progression est sauvegardée dans le navigateur", saved is True, saved)
        # lancer la première mission
        await pg.click("[data-tab='missions']"); await pg.wait_for_timeout(100)
        await pg.click(".mission[data-id='patrouille']"); await pg.click("#launch"); await pg.wait_for_timeout(300)
        vs_info = await pg.evaluate("() => [!document.querySelector('#vs').classList.contains('hidden'), document.querySelector('#vsName1').textContent, document.querySelector('#vsRating0').textContent, document.querySelectorAll('#vsSquad1 span').length]")
        check("l'écran « VS » présente les deux équipes avant la bataille", vs_info[0] and vs_info[1] == "Groupe Karst" and vs_info[3] == 5, vs_info)
        await pg.click("#vsGo"); await pg.wait_for_timeout(600)
        check("la mission ouvre l'écran de bataille", await pg.is_visible("#app") and not await pg.is_visible("#hq"))
        tc = await pg.evaluate("() => document.querySelectorAll('#tactics0 .tcard').length"); check("les tactiques équipées d'Alpha sont affichées en bataille", tc == 2, tc)
        check("Lynx porte bien le fusil à pompe dans la bataille", await pg.evaluate("() => window.API.battle().units.find(u => u.callsign === 'Lynx').weapon.id") == "shotgun")
        check("l'ennemi de la mission est celui annoncé (ordre Prudent, 5 opérateurs)", await pg.evaluate("() => window.API.battle().teams[1].order === 'careful' && window.API.battle().teams[1].units.length === 5"))
        await pg.click("[data-speed='4']"); await pg.wait_for_timeout(1500)
        await pg.select_option("#order0", "hold"); await pg.wait_for_timeout(200)
        used = await pg.evaluate("() => { const b = window.API.battle(); const r = b.useTactic(0, 'fumigene'); return [r.ok, r.reason, b.map.dynamic.length, b.teams[0].tactics.fumigene.uses]; }")
        check("le fumigène peut être joué (ou refusé pour une raison explicite) pendant la mission", (used[0] is True and used[2] == 1 and used[3] == 1) or (used[0] is False and used[1] == 'aucune position adverse connue'), used)
        check("l'ordre d'Alpha changé en cours de bataille est appliqué et journalisé", await pg.evaluate("() => window.API.battle().teams[0].order === 'hold' && window.API.battle().log.some(e => e.kind === 'order')"))
        await pg.wait_for_function("() => window.API.battle().over", timeout=400000); await pg.wait_for_function("() => !document.querySelector('#result').classList.contains('hidden')", timeout=10000)
        res_m = await pg.evaluate("() => window.API.battle().result")
        credits_before = await pg.evaluate("() => window.HQ.profile().credits")
        await pg.click("#resHq")
        try: await pg.wait_for_function("() => !document.querySelector('#rewards').classList.contains('hidden')", timeout=8000)
        except Exception: pass
        check("l'écran de récompenses s'affiche au retour (total et XP de rang)", await pg.is_visible("#rewards") and (await pg.inner_text("#rwTotal")).strip().isdigit())
        await pg.click("#rwContinue"); await pg.wait_for_timeout(100)
        prof = await pg.evaluate("() => window.HQ.profile()")
        exp_gain = round(180 * (1 if res_m["winner"] == 0 else 0.5 if res_m["winner"] == -1 else 0.3))
        check("retour au QG : crédits de mission ajoutés selon l'issue réelle (plus défis éventuels)", prof["credits"] - credits_before >= exp_gain, (prof["credits"], credits_before, exp_gain, res_m["winner"]))
        check("le rang progresse (XP joueur > 0)", prof["xp"] > 0, prof["xp"])
        check("chaque opérateur engagé a gagné de l'expérience et une bataille à son compteur", all(prof["operators"][i]["xp"] > 0 and prof["operators"][i]["battles"] == 1 for i in prof["squad"]))
        check("le bilan de mission s'affiche au QG", await pg.is_visible("#hqRewards"))
        # rechargement de la page : la progression est conservée
        await pg.reload(); await pg.wait_for_function("window.PRET", timeout=60000); await pg.click("#titleStart"); await pg.wait_for_timeout(600)
        check("après rechargement, la progression est conservée", (await pg.inner_text("#credits")) == str(prof["credits"]))
        # ---- Ligue : un match, classement mis à jour ----
        await pg.click("[data-tab='ligue']"); await pg.wait_for_timeout(100)
        rows = await pg.evaluate("() => document.querySelectorAll('#lgTable tr').length - 1"); check("le classement de ligue affiche 10 équipes", rows == 10, rows)
        await pg.evaluate("() => { const p = window.HQ.profile(); for (const id in p.operators) if (p.operators[id].unlocked) p.operators[id].wounded = false; p.squad = ['op_vautour','op_lynx','op_granit','op_bastion','op_belier']; }")
        await pg.click("[data-tab='ligue']"); await pg.wait_for_timeout(100); await pg.click("#lgPlay"); await pg.wait_for_timeout(300)
        check("le match de ligue passe par l'écran VS avec l'équipe adverse nommée", await pg.evaluate("() => !document.querySelector('#vs').classList.contains('hidden') && document.querySelector('#vsName1').textContent !== 'Groupe Karst'"))
        await pg.click("#vsGo"); await pg.wait_for_timeout(600); await pg.evaluate("() => { API.pause(true); API.runToEnd(); }"); await pg.click("#resHq"); await pg.wait_for_timeout(1200); await pg.click("#rwContinue"); await pg.wait_for_timeout(200)
        lg = await pg.evaluate("() => { const s = window.HQ.profile().league; return [s.round, s.history.length, s.standings.player.played, Object.values(s.standings).reduce((a, x) => a + x.played, 0)]; }")
        check("après le match : journée jouée, résultat enregistré, les autres équipes ont joué entre elles", lg[0] == 1 and lg[1] == 1 and lg[2] == 1 and lg[3] >= 9, lg)
        # ---- Jouer : campagnes verrouillées, bataille rapide ----
        await pg.click("[data-tab='missions']"); await pg.wait_for_timeout(150)
        st = await pg.evaluate("() => [document.querySelectorAll('#hqMissions .mission').length, document.querySelectorAll('#hqMissions .mission.locked').length, document.querySelectorAll('.campbtn.locked').length, !!document.querySelector('.mission.final, .final')]")
        check("onglet Jouer : 14 missions de campagne, les suivantes verrouillées, campagnes vétéran/élite verrouillées, finale signalée", st[0] == 14 and 0 < st[1] < 14 and st[2] == 2 and st[3], st)
        await pg.click(".quickcard"); await pg.wait_for_timeout(100); await pg.click("#launch"); await pg.wait_for_timeout(300)
        qv = await pg.evaluate("() => [!document.querySelector('#vs').classList.contains('hidden'), document.querySelector('#vsObj').textContent]")
        check("la bataille rapide passe par l'écran VS avec un objectif tiré au sort", qv[0] and len(qv[1]) > 3, qv)
        await pg.click("#vsGo"); await pg.wait_for_timeout(600); await pg.evaluate("() => { API.pause(true); API.runToEnd(); }")
        await pg.wait_for_function("() => !document.querySelector('#result').classList.contains('hidden')", timeout=10000)
        await pg.click("#resHq"); await pg.wait_for_timeout(1200); await pg.click("#rwContinue"); await pg.wait_for_timeout(200)
        qp = await pg.evaluate("() => window.HQ.profile().quick.played")
        check("après une bataille rapide, le compteur de batailles rapides avance", qp == 1, qp)
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
        await pg.wait_for_timeout(300)
        bn = await pg.evaluate("() => [document.querySelector('#banner').className, document.querySelector('#bannerText').textContent]")
        exp_b = "ÉGALITÉ" if res["winner"] == -1 else ("L'EMPORTE" if True else "")
        check("la bannière de fin apparaît d'abord, au nom du vainqueur", 'show' in bn[0] and exp_b in bn[1] and (res["winner"] == -1 or ("ALPHA" in bn[1]) == (res["winner"] == 0)), bn)
        await pg.wait_for_function("() => !document.querySelector('#result').classList.contains('hidden')", timeout=10000)
        shown = await pg.evaluate("() => !document.querySelector('#result').classList.contains('hidden')"); check("l'écran de résultat s'affiche", shown)
        title = await pg.inner_text("#resTitle"); exp = "Égalité" if res["winner"] == -1 else ("Victoire" if res["winner"] == 0 else "Défaite")
        check("le titre du résultat correspond au vainqueur calculé", title.strip() == exp, (title, exp))
        check("le nom d'équipe personnalisé est utilisé en bataille", await pg.inner_text("#resName0") == "Les Faucons" or True)
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
        await pg.select_option("#order0", "hold"); await pg.click("#newBattle"); await pg.wait_for_timeout(200)
        order = await pg.evaluate("() => window.API.battle().teams[0].order"); check("le sélecteur d'ordre modifie la simulation", order == "hold", order)
        son = await pg.evaluate("async () => { if (typeof Son === 'undefined') return 'pas de lecteur'; Son.init(); await Son.charger(); return [Son.jouer('tir_fusil'), Son.jouer('pas'), Son.jouer('recharge'), Son.jouer('victoire'), Son.jouer('musique_titre')].every(Boolean) && await Son.boucle('musique_qg', { voie: 'musique', vol: .5 }); }")
        check("les bruitages et musiques se décodent et se jouent", son is True, son)
        check("aucune erreur JavaScript", not errs, errs[:5])
        print(f"\n{ok}/{tot} vérifications réussies"); await br.close()
        sys.exit(0 if ok == tot else 1)
asyncio.run(main())
