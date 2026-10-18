#!/bin/bash
# Lance toutes les vérifications ; s'arrête et renvoie un code d'erreur au premier échec.
# usage : tests/tout.sh   (le serveur local doit tourner : python3 outils/serveur.py . 8765)
set -o pipefail
cd "$(dirname "$0")/.."
node build.js > /dev/null || exit 1
node tests/verify.js | tail -1 || exit 1
node tests/game.js | tail -1 || exit 1
node tests/league.js | tail -1 || exit 1
node tests/ia.js | tail -1 || exit 1
node tests/voies.js | tail -1 || exit 1
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers python3 tests/verif_page.py "http://127.0.0.1:8765/dist/index.html?fx=0&hd=0" 2>&1 | grep -v deprecated | tail -1 || exit 1
# grand test de bout en bout avec le rendu complet (long : ~1 h en rendu logiciel) : tests/tout.sh --grand
if [ "$1" = "--grand" ]; then PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers python3 tests/grand_test.py http://127.0.0.1:8765/dist/index.html 2>&1 | grep -v "deprecated\|GL_INVALID" | tail -1 || exit 1; fi
