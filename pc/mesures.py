# Mesures de rendu sur la carte graphique du PC (à lancer via pc/lanceur_gpu.py, serveur local sur le port 8765).
#   python pc/lanceur_gpu.py pc/mesures.py BASE_URL sortie.json
# Pour chaque configuration (?fx=1 / ?fx=0, ?hd=1) : ressources manquantes (404), temps de chargement,
# temps réel d'une image (rendu + attente de la carte graphique : readPixels force la synchronisation),
# en début de bataille et à t = 40 s, vue d'ensemble et vue épaule.
import asyncio, sys, json, time
from playwright.async_api import async_playwright
BASE, SORTIE = sys.argv[1], sys.argv[2]
GL = ["--use-gl=angle", "--use-angle=swiftshader"]   # remplacé par le rendu matériel dans lanceur_gpu.py
MESURE = """(n) => { const c = document.querySelector('canvas#scene'); const gl = c.getContext('webgl2') || c.getContext('webgl');
  const px = new Uint8Array(4); const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  for (let i = 0; i < 5; i++) API.render(); sync();
  const ts = []; for (let i = 0; i < n; i++) { const t = performance.now(); API.render(); sync(); ts.push(performance.now() - t); }
  ts.sort((a, b) => a - b); const moy = ts.reduce((a, b) => a + b, 0) / n;
  return { ms_moyen: +moy.toFixed(2), ms_median: +ts[n >> 1].toFixed(2), ms_p95: +ts[Math.floor(n * 0.95)].toFixed(2), ips_equivalent: +(1000 / moy).toFixed(0),
           largeur: c.width, hauteur: c.height }; }"""
INFOS = """() => { let meshes = 0, tris = 0; API.scene().traverse(o => { if (o.isMesh && o.visible && o.geometry) { meshes++;
  const g = o.geometry; const n = g.index ? g.index.count / 3 : (g.attributes.position ? g.attributes.position.count / 3 : 0);
  tris += n * (o.isInstancedMesh ? o.count : 1); } }); return { maillages_visibles: meshes, triangles_scene: Math.round(tris) }; }"""
async def main():
    res = {}
    async with async_playwright() as p:
        br = await p.chromium.launch(args=GL)
        for nom, q in (('complet_hd', 'fx=1&hd=1'), ('simple_hd', 'fx=0&hd=1'), ('simple_leger', 'fx=0&hd=0')):
            pg = await br.new_page(viewport={'width': 1920, 'height': 1080}); bad = []; errs = []; cons = []
            pg.on('console', lambda m: cons.append(m.text[:300]) if m.type == 'error' and m.text[:300] not in cons else None)
            pg.on('response', lambda r: bad.append(f'{r.status} {r.url}') if r.status >= 400 else None)
            pg.on('requestfailed', lambda r: bad.append(f'échec {r.url}'))
            pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
            t = time.time(); await pg.goto(f'{BASE}?manual=1&mode=free&seed=3&{q}', timeout=180000)
            await pg.wait_for_function('window.PRET', timeout=300000); pret = time.time() - t
            try: await pg.wait_for_load_state('networkidle', timeout=15000)
            except Exception: pass
            await pg.evaluate('API.settle()'); await pg.wait_for_timeout(1000)
            r = {'chargement_s': round(pret, 1), 'chargement_complet_s': round(time.time() - t, 1), 'ressources_manquantes': bad[:40], 'erreurs_page': errs[:10], 'console_erreurs': cons[:20]}
            r.update(await pg.evaluate(INFOS))
            await pg.evaluate('API.look(36, 23, 0.6, 1.0, 72)'); r['debut_ensemble'] = await pg.evaluate(MESURE, 60)
            await pg.evaluate('API.step(400)')
            await pg.evaluate('API.look(36, 23, 0.6, 1.0, 72)'); r['t40_ensemble'] = await pg.evaluate(MESURE, 60)
            await pg.evaluate("API.camShot('shoulder', API.battle().units.find(u => u.alive && u.team === 0).id)"); r['t40_epaule'] = await pg.evaluate(MESURE, 60)
            r.update(ressources_manquantes=bad[:40], erreurs_page=errs[:10], console_erreurs=cons[:20])   # y compris pendant la bataille
            res[nom] = r; print(nom, json.dumps(r, ensure_ascii=False)[:400], flush=True)
            await pg.close()
        await br.close()
    json.dump(res, open(SORTIE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
asyncio.run(main())
