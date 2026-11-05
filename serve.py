import glob
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".wasm": "application/wasm",
        ".pck": "application/octet-stream",
    }

    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if self.path.split("?", 1)[0] == "/index.pck":
            return self.send_pck()
        return super().do_GET()

    def do_HEAD(self):
        if self.path.split("?", 1)[0] == "/index.pck":
            return self.send_pck(head=True)
        return super().do_HEAD()

    def send_pck(self, head=False):
        full = os.path.join(ROOT, "index.pck")
        if os.path.isfile(full):
            return super().do_GET() if not head else super().do_HEAD()
        parts = sorted(glob.glob(os.path.join(ROOT, "index.pck.part*")))
        if not parts:
            self.send_error(404, "index.pck and index.pck.part* not found")
            return
        total = sum(os.path.getsize(p) for p in parts)
        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(total))
        self.end_headers()
        if head:
            return
        try:
            for part in parts:
                with open(part, "rb") as f:
                    while True:
                        chunk = f.read(1024 * 1024)
                        if not chunk:
                            break
                        self.wfile.write(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def log_message(self, fmt, *args):
        sys.stdout.write("%s - %s\n" % (self.address_string(), fmt % args))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print("Serving %s at http://127.0.0.1:%d/" % (ROOT, port))
    print("Cross-Origin Isolation headers enabled; index.pck is streamed from parts.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
