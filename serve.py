#!/usr/bin/env python3
"""Static server for the concept viewers, with caching turned off.

Plain http.server sends Last-Modified, so browsers answer 304 and keep serving stale ES
modules. That is merely confusing for a changed function body, but fatal when a module gains
an export: the importing module fails to link and the whole page renders blank white.
"""

import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        # no-store stops NEW responses being cached but never evicts what a browser already
        # holds. Purging on the document request clears modules cached before this server
        # existed. Honoured on secure contexts only, which includes localhost.
        if self.path.endswith((".html", "/")):
            self.send_header("Clear-Site-Data", '"cache"')
        super().end_headers()

    def send_header(self, keyword, value):
        if keyword.lower() == "last-modified":
            return
        super().send_header(keyword, value)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print(f"serving {sys.path[0] or '.'} on http://0.0.0.0:{port}  (no-cache)")
    ThreadingHTTPServer(("", port), NoCacheHandler).serve_forever()
