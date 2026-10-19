# Scénario de vérification : enchaîne des phases (touches, durée), prend une capture par phase, relève les mesures.
# usage : python3 scenario.py NOM "phase1;phase2;..."   phase = touches|secondes|vue   ex: "W|2|dos" "W+A+visee|1.5|face"
import subprocess, sys, json, os
from PIL import Image
nom, phases = sys.argv[1], sys.argv[2].split(';')
cwd='/home/claude/operator-tactics/prototypes/motion-matching'
VUES={'dos':'__MM.soldat.yaw','face':'__MM.soldat.yaw+Math.PI','cote':'__MM.soldat.yaw+Math.PI/2','troisQ':'__MM.soldat.yaw+Math.PI*0.75','coteG':'__MM.soldat.yaw-Math.PI/2'}
et=['--etape',"js:(hud.style.display='none',boutons.style.display='none',credit.style.display='none',0)"]
for ph in phases:
    t,sec,vue=ph.split('|'); keys={}; opts={}
    for k in t.split('+'):
        if k in ('W','A','S','D'): keys['Key'+k]=1
        elif k=='Maj': keys['ShiftLeft']=1
        elif k=='visee': opts['visee']=True
        elif k=='novisee': opts['visee']=False
        elif k=='regard': opts['verrouRegard']=True
    if 'regard' not in t.split('+'): opts['verrouRegard']=False
    et+=['--etape',f"js:(API.set({json.dumps(opts)}),API.touches({json.dumps(keys)}),0)",'--etape',f"js:API.step({int(float(sec)*60)},1/60)",
         '--etape',f"js:API.camera({VUES[vue]},0.15,2.8,1.0)",'--etape',"js:API.step(1,1/60)",'--etape','shot',
         '--etape',"js:JSON.stringify(Object.assign(API.mesures(),{mainD:__MM.soldat.prise?__MM.soldat.mains.D[2].getWorldPosition(new THREE.Vector3()).distanceTo(__MM.soldat.fusil.position.clone().add(__MM.soldat.prise.D.pos.clone().applyQuaternion(__MM.soldat.fusilQ))).toFixed(3):null, mainG:__MM.soldat.prise?__MM.soldat.mains.G[2].getWorldPosition(new THREE.Vector3()).distanceTo(__MM.soldat.fusil.position.clone().add(__MM.soldat.prise.G.pos.clone().applyQuaternion(__MM.soldat.fusilQ))).toFixed(3):null, arme:__MM.Ctl.visee}))"]
out=subprocess.run(['timeout','1500','python3','../../outils/capture.py','http://127.0.0.1:8765/prototypes/motion-matching/web/index.html?manual=1',f'captures/sc_{nom}','--taille','560x640','--attendre','window.PRET']+et,cwd=cwd,capture_output=True,text=True)
res=[l.split('→',1)[1].strip() for l in (out.stdout+out.stderr).splitlines() if l.startswith('js → {"')]
for ph,r in zip(phases,res):
    m=json.loads(r); print(f"{ph:28s} {m['seq'][:-4]:14s} vit {m['vitAnim']:.2f} sauts {m['sauts']:3d} glisse {m['glisseMoy']:.1f} mainD {m['mainD']} mainG {m['mainG']}")
if 'Error' in out.stderr: print(out.stderr[-600:])
n=len(phases); ims=[Image.open(f'{cwd}/captures/sc_{nom}-{i}.png').crop((60,20,500,640)) for i in range(n)]
cols=min(n,4); rows=(n+cols-1)//cols; pl=Image.new('RGB',(440*cols,620*rows),(30,30,30))
for i,im in enumerate(ims): pl.paste(im,((i%cols)*440,(i//cols)*620))
pl.save(f'{cwd}/captures/sc_{nom}.png'); print('planche', f'captures/sc_{nom}.png')
