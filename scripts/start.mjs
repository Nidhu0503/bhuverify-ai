import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

// Works with ordinary next builds and AI Studio/standalone packaging.
const standalone = existsSync('server.js') ? resolve('server.js') : null;
const args = standalone ? [standalone] : [resolve('node_modules/next/dist/bin/next'), 'start', '-H', '0.0.0.0', '-p', process.env.PORT || '3000'];
const child = spawn(process.execPath, args, { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', () => { console.error('Could not start BhuVerify. Run npm ci and npm run build first.'); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
