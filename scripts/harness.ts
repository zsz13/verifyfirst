import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { dataDir, projectRoot } from '../agent/config.ts';

await mkdir(dataDir, { recursive: true, mode: 0o700 });
const child = spawn(
  process.execPath,
  [resolve(projectRoot, 'node_modules/@truefoundry/trueforge/dist/cli.js')],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: '8790',
      SQLITE_PATH: resolve(dataDir, 'trueforge.sqlite'),
      LOCAL_SANDBOX_ROOT_PARENT: resolve(dataDir, 'sandboxes'),
      LOG_LEVEL: 'warn',
    },
  },
);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
