import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { constants } from 'node:os';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ConfigurationError } from '../agent/errors.ts';

// Compose shares this private volume, never an image layer or source checkout.
process.umask(0o077);
const state = process.env.VERIFYFIRST_CONTAINER_STATE || '/var/lib/verifyfirst';
const tokenPath = resolve(state, 'mcp-token');
const mode = process.argv[2];

/** A startup problem the operator can act on. Its message is always safe to print. */
class StartupError extends ConfigurationError {}

/**
 * Reads the private MCP token the `init` service writes into the shared volume.
 * Each failure gets its own actionable message; the token itself is never printed.
 */
async function connectorToken(): Promise<string> {
  let contents: string;
  try {
    contents = await readFile(tokenPath, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT')
      throw new StartupError(
        'the private connector token has not been created yet. The "init" service creates it, so start the stack with "docker compose up" rather than this service alone.',
      );
    if (code === 'EACCES' || code === 'EPERM')
      throw new StartupError(
        'the private connector token exists but is not readable by the container user (uid 1000). If its ownership was changed on the host, recreate the volume with "docker compose down -v".',
      );
    throw new StartupError('the private connector token could not be read from the shared volume.');
  }
  const token = contents.trim();
  if (!token)
    throw new StartupError(
      'the private connector token file is empty. Recreate it with "docker compose down -v" followed by "docker compose up".',
    );
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new StartupError(
      'the private connector token is malformed. Recreate it with "docker compose down -v" followed by "docker compose up".',
    );
  return token;
}

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

  if (mode !== 'harness') process.env.VERIFYFIRST_MCP_TOKEN = await connectorToken();

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
  if (!args)
    throw new StartupError(
      `"${mode ?? '(none)'}" is not a VerifyFirst service. Expected one of: init, harness, setup, mcp, web.`,
    );
  const child = spawn(process.execPath, args, { stdio: 'inherit', env: process.env });
  // Compose stops services with a signal. A shutdown we forwarded is success, not a crash:
  // reporting it as exit 1 makes a clean `docker compose stop` look like a failed service.
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.on(signal, () => {
      stopping = true;
      child.kill(signal);
    });
  await new Promise<void>((resolvePromise, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      // Killed by the signal, or exited the way a service does when it honours one. A
      // different nonzero code means the shutdown itself failed, so keep reporting it.
      const stoppedCleanly =
        code === null ||
        code === 0 ||
        code === 128 + constants.signals.SIGINT ||
        code === 128 + constants.signals.SIGTERM;
      process.exitCode =
        stopping && stoppedCleanly ? 0 : (code ?? 128 + constants.signals[signal ?? 'SIGTERM']);
      resolvePromise();
    });
  });
}

main().catch((error: unknown) => {
  // Only our own startup messages are printed: other failures may carry credentials.
  console.error(
    error instanceof ConfigurationError
      ? `VerifyFirst ${mode ?? 'service'} could not start: ${error.message}`
      : 'Container startup failed. Check the service configuration and private-volume access. No credentials were printed.',
  );
  process.exitCode = 1;
});
