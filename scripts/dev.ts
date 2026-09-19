import { spawn, type ChildProcess } from 'node:child_process';
import { harnessUrl, projectRoot } from '../agent/config.ts';
import { setup } from './setup.ts';

const children: ChildProcess[] = [];
function start(script: string) {
  const child = spawn('npm', ['run', script], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
  });
  children.push(child);
  child.on('exit', (code) => {
    if (code && !stopping) stop(code);
  });
}
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => child.kill('SIGTERM'));
  process.exitCode = code;
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => stop());
async function waitForHarness() {
  for (let attempt = 0; attempt < 90; attempt++) {
    if (stopping) throw new Error('Startup cancelled.');
    try {
      const response = await fetch(`${harnessUrl}/api/v1/capabilities`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) return;
    } catch {
      /* The harness is still booting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('TrueForge did not start within 90 seconds.');
}
try {
  start('dev:harness');
  await waitForHarness();
  await setup();
  start('dev:mcp');
  start('dev:web');
} catch {
  console.error('Could not start VerifyFirst. Check the service output and README setup steps.');
  stop(1);
}
