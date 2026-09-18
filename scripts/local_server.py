"""Dependency-free local preview with authenticated, project-specific lifecycle control."""
import argparse
import functools
import hmac
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit
from urllib.request import Request, urlopen
import webbrowser

ROOT = Path(__file__).resolve().parent.parent
RUNTIME = ROOT / '.local'
STATE = RUNTIME / 'server.json'


def settings():
    values = {'HOST': 'localhost', 'PORT': '4200'}
    env_file = ROOT / '.env'
    if env_file.exists():
        for line in env_file.read_text(encoding='utf-8-sig').splitlines():
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                if key.strip() in values:
                    values[key.strip()] = value.strip().strip('\"\'')
    for key in values:
        values[key] = os.environ.get(key, values[key])
    if values['HOST'] not in ('127.0.0.1', 'localhost'):
        raise ValueError('For local testing, set HOST=127.0.0.1 or localhost in .env.')
    port = int(values['PORT'])
    if not 1 <= port <= 65535:
        raise ValueError('PORT must be between 1 and 65535.')
    return values['HOST'], port


def read_state():
    return json.loads(STATE.read_text()) if STATE.exists() else None


def control(state, action):
    request = Request(f"http://127.0.0.1:{state['port']}/__local/{action}",
                      headers={'Authorization': 'Bearer ' + state['token']},
                      method='POST' if action == 'stop' else 'GET')
    with urlopen(request, timeout=2) as response:
        return json.load(response)


def alive(state):
    try:
        return state and control(state, 'health').get('token') == state['token']
    except (OSError, ValueError):
        return False


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/__local/health':
            self.respond_control(False)
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == '/__local/stop':
            self.respond_control(True)
        else:
            self.send_error(405)

    def respond_control(self, stop):
        expected = 'Bearer ' + self.server.token
        if not hmac.compare_digest(self.headers.get('Authorization', ''), expected):
            self.send_error(403)
            return
        payload = json.dumps({'token': self.server.token}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
        if stop:
            threading.Thread(target=self.server.shutdown, daemon=True).start()

    def send_head(self):
        path = unquote(urlsplit(self.path).path)
        target = Path(self.translate_path(self.path)).resolve()
        public = (ROOT / 'build/modern-motion/browser').resolve()
        if any(part.startswith('.') for part in path.split('/') if part) or public not in target.parents and target != public:
            self.send_error(404)
            return None
        return super().send_head()

    def list_directory(self, path):
        self.send_error(404)
        return None

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()


def serve():
    state = read_state()
    server = ThreadingHTTPServer(('127.0.0.1', state['port']), functools.partial(Handler, directory=str(ROOT / 'build/modern-motion/browser')))
    server.token = state['token']
    try:
        server.serve_forever(poll_interval=0.1)
    finally:
        server.server_close()
        if STATE.exists() and read_state()['token'] == state['token']:
            STATE.unlink()


def start(no_browser):
    state = read_state()
    if alive(state):
        print(f"Already running: http://localhost:{state['port']}")
        return
    _, port = settings()
    if not (ROOT / 'build/modern-motion/browser/index.html').is_file():
        raise ValueError('Missing Angular build. Run local-start to install dependencies and build.')
    # Bind before writing state to avoid touching a server already on this port.
    import socket
    with socket.socket() as probe:
        if os.name != 'nt':
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        probe.bind(('127.0.0.1', port))
    RUNTIME.mkdir(exist_ok=True)
    state = {'port': port, 'token': secrets.token_urlsafe(32)}
    STATE.write_text(json.dumps(state))
    if os.name != 'nt':
        STATE.chmod(0o600)
    flags = {'creationflags': subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS} if os.name == 'nt' else {'start_new_session': True}
    with (RUNTIME / 'server.log').open('a') as log:
        process = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), 'serve'], cwd=ROOT,
                                   stdin=subprocess.DEVNULL, stdout=log, stderr=log, **flags)
    for _ in range(50):
        if alive(state):
            url = f'http://localhost:{port}'
            stop_script = './local-stop.ps1' if os.name == 'nt' else './local-stop.sh'
            print(f'Modern Motion Body Lab is ready: {url}\nStop with {stop_script}. Logs: .local/server.log')
            if not no_browser:
                webbrowser.open(url)
            return
        if process.poll() is not None:
            break
        time.sleep(0.1)
    if process.poll() is None:
        process.terminate()
        process.wait(timeout=5)
    if STATE.exists() and read_state()['token'] == state['token']:
        STATE.unlink()
    raise RuntimeError('Server did not start. Check .local/server.log and whether PORT is in use.')


def stop():
    state = read_state()
    if not alive(state):
        if STATE.exists():
            STATE.unlink()
        print('No matching local server is running.')
        return
    control(state, 'stop')
    for _ in range(50):
        if not STATE.exists() and not alive(state):
            print('Local server stopped.')
            return
        time.sleep(0.1)
    raise RuntimeError('Server did not stop in time. Try local-stop.ps1 again.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['start', 'stop', 'serve'])
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    try:
        if args.command == 'start':
            start(args.no_browser)
        elif args.command == 'stop':
            stop()
        else:
            serve()
    except (OSError, ValueError, RuntimeError) as error:
        print(f'Local preview error: {error}', file=sys.stderr)
        sys.exit(1)
