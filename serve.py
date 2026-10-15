#!/usr/bin/env python3
"""Static server for the concept viewers, with caching turned off.

Plain http.server sends Last-Modified, so browsers answer 304 and keep serving stale ES
modules. That is merely confusing for a changed function body, but fatal when a module gains
an export: the importing module fails to link and the whole page renders blank white.
"""

import ssl
import sys
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        # No Clear-Site-Data: '"cache"' on documents any more. It purged modules cached before
        # this server existed, but the browser holds the page until the wipe finishes, on every
        # load, and that stalled index.html. Stale modules from an older server: one Cmd-Shift-R.
        super().end_headers()

    def send_header(self, keyword, value):
        if keyword.lower() == "last-modified":
            return
        super().send_header(keyword, value)


# Tablets need https for Donut Fighters rooms (crypto.subtle); with cert.pem + key.pem beside this file it
# serves https. Make them once, for this Mac's LAN address, and tap past the warning once per tablet:
#   openssl req -x509 -newkey rsa:2048 -nodes -days 825 -keyout key.pem -out cert.pem \
#     -subj "/CN=donut" -addext "subjectAltName=IP:192.168.0.102,DNS:localhost"
CERT, KEY = (Path(__file__).with_name(n) for n in ("cert.pem", "key.pem"))

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    server = ThreadingHTTPServer(("", port), NoCacheHandler)
    scheme = "http"
    if CERT.exists() and KEY.exists():
        tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        tls.load_cert_chain(CERT, KEY)
        server.socket = tls.wrap_socket(server.socket, server_side=True, do_handshake_on_connect=False)
        scheme = "https"
    print(f"serving {sys.path[0] or '.'} on {scheme}://0.0.0.0:{port}  (no-cache)")
    server.serve_forever()
