"""Install Angular dependencies and build before the Python local preview starts."""
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
RUNTIME = Path.home() / '.cache/codex-runtimes/codex-primary-runtime/dependencies'
node = shutil.which('node')
if not node and (RUNTIME / 'node/bin/node').exists():
    node = str(RUNTIME / 'node/bin/node')
if not node:
    sys.exit('Install Node.js 24 LTS (24.15 or newer), then rerun local-start.')
env = os.environ.copy()
env['PATH'] = str(Path(node).parent) + os.pathsep + env.get('PATH', '')
env['CI'] = 'true'
pnpm = shutil.which('pnpm', path=env['PATH'])
if not pnpm and (RUNTIME / 'node/node_modules/pnpm/bin/pnpm.mjs').exists():
    manager = [node, str(RUNTIME / 'node/node_modules/pnpm/bin/pnpm.mjs')]
elif pnpm:
    manager = [pnpm]
else:
    npm_cli = Path(node).parent / 'node_modules/npm/bin/npm-cli.js'
    unix_npm = Path(node).parent.parent / 'lib/node_modules/npm/bin/npm-cli.js'
    if npm_cli.exists():
        manager = [node, str(npm_cli), 'exec', '--yes', '--package=pnpm@11.19.0', '--', 'pnpm']
    elif unix_npm.exists():
        manager = [node, str(unix_npm), 'exec', '--yes', '--package=pnpm@11.19.0', '--', 'pnpm']
    else:
        npm = shutil.which('npm', path=env['PATH'])
        if not npm:
            sys.exit('Install Node.js with npm, or install pnpm 11.19.0, then retry.')
        manager = [npm, 'exec', '--yes', '--package=pnpm@11.19.0', '--', 'pnpm']
print('Installing Angular dependencies from pnpm-lock.yaml...', flush=True)
subprocess.run(manager + ['install', '--frozen-lockfile'], cwd=ROOT, env=env, check=True)
print('Building the Angular website...', flush=True)
subprocess.run([node, str(ROOT / 'node_modules/@angular/cli/bin/ng.js'), 'build'], cwd=ROOT, env=env, check=True)
