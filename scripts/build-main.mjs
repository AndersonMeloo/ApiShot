import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'dist', 'main');

/** Compiles electron/, backend/ and core/ to CommonJS in dist/main. */
export function buildMain() {
  rmSync(outDir, { recursive: true, force: true });
  const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
  const result = spawnSync(process.execPath, [tsc, '-p', path.join(root, 'tsconfig.electron.json')], {
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error('Falha ao compilar o processo principal (tsc).');
  mkdirSync(outDir, { recursive: true });
  // The project is "type": "module"; the compiled main process is CommonJS.
  writeFileSync(path.join(outDir, 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    buildMain();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
