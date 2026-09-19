import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Compose shares this private volume, never an image layer or source checkout.
process.umask(0o077);
const state = process.env.VERIFYFIRST_CONTAINER_STATE || '/var/lib/verifyfirst';
const tokenPath = resolve(state, 'mcp-token');
const mode = process.argv[2];

async function main(): Promise<void> {
  if (mode === 'init') {
    await mkdir(state, { recursive: true, mode: 0o700 });
    try {
      await writeFile(tokenPath, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
    }
    return;
  }

  if (mode !== 'harness') {
    const token = (await readFile(tokenPath, 'utf8')).trim();
    if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid private connector token.');
    process.env.VERIFYFIRST_MCP_TOKEN = token;
  }

  if (mode === 'setup') {
    const { setup } = await import('./setup.ts');
    await setup();
    return;
  }

  const commands: Record<string, string[]> = {
    harness: ['node_modules/@truefoundry/trueforge/dist/cli.js'],
    mcp: ['--import', 'tsx', 'apps/mcp/src/server.ts'],
    web: ['node_modules/next/dist/bin/next', 'start', 'apps/web', '--hostname', '0.0.0.0'],
  };
  const args = mode ? commands[mode] : undefined;
  if (!args) throw new Error('Unknown container service.');
  const child = spawn(process.execPath, args, { stdio: 'inherit', env: process.env });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal));
  await new Promise<void>((resolvePromise, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => {
      process.exitCode = code ?? 1;
      resolvePromise();
    });
  });
}

main().catch(() => {
  console.error('Container startup failed. Check service configuration and private-volume access.');
  process.exitCode = 1;
});
