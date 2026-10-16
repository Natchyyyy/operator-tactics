# Petit serveur local pour tester une page web (http://127.0.0.1:PORT/…).
# usage : python3 serveur.py [dossier] [port]      (par défaut : dossier courant, port 8765)
# en arrière-plan : setsid nohup python3 serveur.py DOSSIER 8765 >/dev/null 2>&1 < /dev/null &
import http.server, os, sys
d = sys.argv[1] if len(sys.argv) > 1 else "."; port = int(sys.argv[2]) if len(sys.argv) > 2 else 8765
os.chdir(d)
class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
                      ".glb": "model/gltf-binary", ".ogg": "audio/ogg", ".wasm": "application/wasm"}
    def end_headers(self): self.send_header("Cache-Control", "no-store"); super().end_headers()
    def log_message(self, *a): pass
print(f"http://127.0.0.1:{port}/  ←  {os.getcwd()}", flush=True)
http.server.ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
