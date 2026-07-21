#!/usr/bin/env python3
"""Master Hub backend — single database + static file server.

Data lives in ./data/state.json (all app data) and ./data/files/ (uploaded PDFs).
Every device that opens the app through this server reads & writes the same database.
"""
import json, os, re, socket, sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT  = os.path.dirname(os.path.abspath(__file__))
DATA  = os.path.join(ROOT, 'data')
FILES = os.path.join(DATA, 'files')
STATE = os.path.join(DATA, 'state.json')
PORT  = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
os.makedirs(FILES, exist_ok=True)

SAFE_ID = re.compile(r'^[A-Za-z0-9_-]{1,80}$')

def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, *a):  # keep the console clean
        pass

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _file_path(self):
        fid = os.path.basename(self.path.split('?')[0])
        return (os.path.join(FILES, fid), fid) if SAFE_ID.match(fid) else (None, None)

    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/api/state':
            if os.path.exists(STATE):
                with open(STATE, 'rb') as f:
                    body = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Cache-Control', 'no-store')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            else:
                self._json({})
            return
        if path == '/api/info':
            self._json({'ip': lan_ip(), 'port': PORT, 'ok': True})
            return
        if path.startswith('/api/file/'):
            p, fid = self._file_path()
            if p and os.path.exists(p):
                ct = 'application/octet-stream'
                if os.path.exists(p + '.meta'):
                    with open(p + '.meta') as m:
                        ct = m.read().strip() or ct
                with open(p, 'rb') as f:
                    body = f.read()
                self.send_response(200)
                self.send_header('Content-Type', ct)
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            else:
                self._json({'error': 'not found'}, 404)
            return
        super().do_GET()

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0) or 0)
        body = self.rfile.read(length) if length else b''
        path = self.path.split('?')[0]
        if path == '/api/state':
            try:
                incoming = json.loads(body)
            except Exception:
                self._json({'error': 'invalid json'}, 400)
                return
            # conflict guard: never let an older copy overwrite a newer one
            try:
                with open(STATE) as f:
                    current_rev = json.load(f).get('rev', 0)
            except Exception:
                current_rev = 0
            if current_rev > incoming.get('rev', 0):
                self._json({'conflict': True, 'rev': current_rev}, 409)
                return
            tmp = STATE + '.tmp'
            with open(tmp, 'wb') as f:
                f.write(body)
            os.replace(tmp, STATE)        # atomic write, no corruption
            self._json({'ok': True})
            return
        if path.startswith('/api/file/'):
            p, fid = self._file_path()
            if not p:
                self._json({'error': 'bad id'}, 400)
                return
            with open(p, 'wb') as f:
                f.write(body)
            with open(p + '.meta', 'w') as m:
                m.write(self.headers.get('Content-Type', 'application/octet-stream'))
            self._json({'ok': True})
            return
        self._json({'error': 'unknown'}, 404)

    def do_DELETE(self):
        if self.path.startswith('/api/file/'):
            p, fid = self._file_path()
            if p:
                for x in (p, p + '.meta'):
                    if os.path.exists(x):
                        os.remove(x)
            self._json({'ok': True})
            return
        self._json({'error': 'unknown'}, 404)

if __name__ == '__main__':
    ip = lan_ip()
    print()
    print('  ==================================================')
    print('   MASTER HUB is running  (leave this window open)')
    print('  ==================================================')
    print(f'   On this computer :  http://localhost:{PORT}')
    print(f'   On your phone    :  http://{ip}:{PORT}')
    print('                        (same Wi-Fi -> open in Chrome')
    print("                         -> menu -> Add to Home Screen)")
    print()
    print(f'   Database: {os.path.join(DATA, "state.json")}')
    print('   All devices share this one database.')
    print()
    try:
        ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        print('\n  Master Hub stopped.')
