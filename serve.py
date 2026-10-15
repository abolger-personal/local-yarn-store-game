#!/usr/bin/env python3
"""Static server for the concept viewers, with caching turned off.

Plain http.server sends Last-Modified, so browsers answer 304 and keep serving stale ES
modules. That is merely confusing for a changed function body, but fatal when a module gains
an export: the importing module fails to link and the whole page renders blank white.
"""

import socket
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


def redirect_to_https(conn):
    head = conn.recv(65536).decode("latin-1")
    path = (head.split(" ", 2) + ["", "/"])[1]
    host = next((h.split(":", 1)[1].strip() for h in head.split("\r\n") if h.lower().startswith("host:")), "")
    conn.sendall(f"HTTP/1.1 301 Moved Permanently\r\nLocation: https://{host}{path}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".encode())


class Server(ThreadingHTTPServer):
    """https when given a TLS context; a plain http request on the same port (an old bookmark) is sent to https."""
    tls = None

    def finish_request(self, request, client_address):
        if self.tls:
            if request.recv(1, socket.MSG_PEEK) != b"\x16":
                return redirect_to_https(request)
            request = self.tls.wrap_socket(request, server_side=True)
        return super().finish_request(request, client_address)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    server = Server(("", port), NoCacheHandler)
    scheme = "http"
    if CERT.exists() and KEY.exists():
        server.tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        server.tls.load_cert_chain(CERT, KEY)
        scheme = "https"
    print(f"serving {sys.path[0] or '.'} on {scheme}://0.0.0.0:{port}  (no-cache)")
    server.serve_forever()
