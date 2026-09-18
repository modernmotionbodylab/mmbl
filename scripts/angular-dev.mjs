import { spawn } from 'node:child_process';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
try { loadEnvFile(new URL('../.env', import.meta.url)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const port = Number(process.env.PORT || 4200);
const host = process.env.HOST || 'localhost';
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const child = spawn(process.execPath, ['node_modules/@angular/cli/bin/ng.js', 'serve', '--host', host, '--port', String(port)], { cwd: root, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => { process.exitCode = code || 0; });
