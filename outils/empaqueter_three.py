# Empaquette des modules « examples/jsm » de three.js (ES modules) en un seul script classique qui utilise le THREE global
# (three.min.js) et range ce qu'ils exportent dans window.THREEX. Sans npm : on clone le dépôt three.js à la bonne version
# (git clone --depth 1 --branch r159 --sparse https://github.com/mrdoob/three.js), puis :
#   python3 outils/empaqueter_three.py <dossier three.js> web/three-addons.js postprocessing/EffectComposer.js …
# Chaque module est enfermé dans sa propre fonction (pas de collision de noms) ; ses imports relatifs sont résolus vers les
# exports déjà empaquetés (ordre topologique), les imports de 'three' vers le THREE global.
import re, sys, os
root, out, entries = sys.argv[1], sys.argv[2], sys.argv[3:]
base = os.path.join(root, 'examples', 'jsm')
mods, order = {}, []
IMP = re.compile(r"import\s*(\{[^}]*\}|\*\s+as\s+\w+|\w+)\s*from\s*['\"]([^'\"]+)['\"]\s*;?", re.S)
def load(rel):
    rel = os.path.normpath(rel)
    if rel in mods: return
    src = open(os.path.join(base, rel)).read(); mods[rel] = None
    deps = []
    for m in IMP.finditer(src):
        spec = m.group(2)
        if spec != 'three': d = os.path.normpath(os.path.join(os.path.dirname(rel), spec)); load(d); deps.append(d)
    mods[rel] = src; order.append(rel)
for e in entries: load(e)
parts = ["// Modules complémentaires de three.js r159 (examples/jsm), empaquetés par outils/empaqueter_three.py pour le THREE global.\n// Licence MIT (three.js authors). Exports rangés dans window.THREEX.\n(function () {\n  const X = window.THREEX = window.THREEX || {}; const R = {};\n"]
for rel in order:
    src = mods[rel]; pre = []
    def rep(m):
        what, spec = m.group(1), m.group(2)
        srcobj = 'THREE' if spec == 'three' else "R['%s']" % os.path.normpath(os.path.join(os.path.dirname(rel), spec))
        if what.startswith('{'):
            names = [n.strip() for n in what.strip('{}').split(',') if n.strip()]
            binds = []
            for n in names:
                if ' as ' in n: a, b = [x.strip() for x in n.split(' as ')]; binds.append(f"{a}: {b}")
                else: binds.append(n)
            pre.append("const { %s } = %s;" % (', '.join(binds), srcobj))
        elif what.startswith('*'): pre.append("const %s = %s;" % (what.split()[-1], srcobj))
        else: pre.append("const %s = %s.default;" % (what, srcobj))
        return ''
    body = IMP.sub(rep, src)
    exports = []
    body = re.sub(r"^export\s+(class|function|const|let|var)\s+(\w+)", lambda m: (exports.append(m.group(2)) or f"{m.group(1)} {m.group(2)}"), body, flags=re.M)
    def expl(m):
        for n in m.group(1).split(','):
            n = n.strip()
            if not n: continue
            if ' as ' in n: a, b = [x.strip() for x in n.split(' as ')]; exports.append(f"{b}: {a}")
            else: exports.append(n)
        return ''
    body = re.sub(r"^export\s*\{([^}]*)\}\s*;?", expl, body, flags=re.M)
    body = re.sub(r"^export\s+default\s+", "const __default = ", body, flags=re.M)
    if '__default' in body: exports.append('default: __default')
    parts.append(f"  // ---- {rel}\n  R['{rel}'] = (function () {{\n{chr(10).join(pre)}\n{body}\nreturn {{ {', '.join(exports)} }};\n  }})();\n  Object.assign(X, R['{rel}']);\n")
parts.append("})();\n")
open(out, 'w').write(''.join(parts)); print(out, len(order), 'modules :', ', '.join(order))
