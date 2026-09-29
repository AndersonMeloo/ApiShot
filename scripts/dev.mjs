import { spawn } from 'node:child_process';
import electronPath from 'electron';
import { createServer } from 'vite';
import { buildMain } from './build-main.mjs';

buildMain();

const server = await createServer();
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error('Servidor Vite não iniciou.');
console.log(`Renderer em ${url}`);

const env = { ...process.env, VITE_DEV_SERVER_URL: url };
delete env.ELECTRON_RUN_AS_NODE;

const electron = spawn(electronPath, ['.'], { stdio: 'inherit', env });
electron.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
