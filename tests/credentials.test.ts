import { mkdtemp, writeFile, chmod, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  credentialValue,
  resolveCredential,
  resolveCredentialSync,
  secretFileName,
} from '../agent/credentials.ts';

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'verifyfirst-credentials-'));
  vi.stubEnv('DEMO_KEY', '');
  vi.stubEnv('DEMO_KEY_FILE', '');
  vi.stubEnv('VERIFYFIRST_SECRETS_DIR', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

async function writeSecret(name: string, contents: string, mode = 0o600) {
  const path = resolve(directory, name);
  await writeFile(path, contents, { mode });
  return path;
}

describe('credential resolution order', () => {
  it('names secret files after the lowercased variable', () => {
    expect(secretFileName('IPQS_API_KEY')).toBe('ipqs_api_key');
  });

  it('reports not configured when nothing is set', async () => {
    const result = await resolveCredential('DEMO_KEY', 'Demo key');
    expect(result.status).toBe('not_configured');
    expect(credentialValue(result)).toBeUndefined();
    expect(result.detail).toContain('DEMO_KEY');
  });

  it('falls back to the environment variable', async () => {
    vi.stubEnv('DEMO_KEY', 'env-value');
    const result = await resolveCredential('DEMO_KEY', 'Demo key');
    expect(result).toMatchObject({ status: 'configured', source: 'environment' });
    expect(credentialValue(result)).toBe('env-value');
  });

  it('prefers a secrets-directory file over the environment variable', async () => {
    await writeSecret('demo_key', 'file-value\n');
    vi.stubEnv('DEMO_KEY', 'env-value');
    vi.stubEnv('VERIFYFIRST_SECRETS_DIR', directory);
    const result = await resolveCredential('DEMO_KEY', 'Demo key');
    expect(result).toMatchObject({ status: 'configured', source: 'file' });
    expect(credentialValue(result)).toBe('file-value');
  });

  it('prefers an explicit _FILE path over everything else', async () => {
    const path = await writeSecret('elsewhere', 'explicit-value');
    await writeSecret('demo_key', 'directory-value');
    vi.stubEnv('DEMO_KEY', 'env-value');
    vi.stubEnv('VERIFYFIRST_SECRETS_DIR', directory);
    vi.stubEnv('DEMO_KEY_FILE', path);
    expect(credentialValue(await resolveCredential('DEMO_KEY', 'Demo key'))).toBe('explicit-value');
  });

  it('treats an absent secrets-directory file as "keep looking", not an error', async () => {
    vi.stubEnv('VERIFYFIRST_SECRETS_DIR', directory);
    vi.stubEnv('DEMO_KEY', 'env-value');
    expect(credentialValue(await resolveCredential('DEMO_KEY', 'Demo key'))).toBe('env-value');
  });

  it('resolves synchronously with the same precedence', async () => {
    await writeSecret('demo_key', 'file-value');
    vi.stubEnv('DEMO_KEY', 'env-value');
    vi.stubEnv('VERIFYFIRST_SECRETS_DIR', directory);
    expect(credentialValue(resolveCredentialSync('DEMO_KEY', 'Demo key'))).toBe('file-value');
  });
});

describe('credential diagnostics stay safe and specific', () => {
  it('reports an explicitly configured path that does not exist', async () => {
    vi.stubEnv('DEMO_KEY_FILE', resolve(directory, 'absent-secret-file'));
    const result = await resolveCredential('DEMO_KEY', 'Demo key');
    expect(result.status).toBe('invalid');
    expect(result.detail).toContain('no file exists');
    expect(result.detail).not.toContain('absent-secret-file');
  });

  it('distinguishes an empty file from a missing one', async () => {
    await writeSecret('demo_key', '   \n');
    vi.stubEnv('VERIFYFIRST_SECRETS_DIR', directory);
    const result = await resolveCredential('DEMO_KEY', 'Demo key');
    expect(result).toMatchObject({ status: 'invalid' });
    expect(result.detail).toContain('empty');
  });

  it('rejects a multi-value or malformed file', async () => {
    await writeSecret('demo_key', 'first-value second-value');
    vi.stubEnv('VERIFYFIRST_SECRETS_DIR', directory);
    const result = await resolveCredential('DEMO_KEY', 'Demo key');
    expect(result.status).toBe('invalid');
    expect(result.detail).toContain('single line');
    expect(JSON.stringify(result)).not.toContain('first-value');
  });

  it('rejects an oversized file without reading it into the message', async () => {
    await writeSecret('demo_key', 'x'.repeat(5000));
    vi.stubEnv('VERIFYFIRST_SECRETS_DIR', directory);
    const result = await resolveCredential('DEMO_KEY', 'Demo key');
    expect(result.status).toBe('invalid');
    expect(result.detail).toContain('larger than');
    expect(result.detail).not.toContain('xxxx');
  });

  it('reports a directory used as a secret file', async () => {
    await mkdir(resolve(directory, 'demo_key'));
    vi.stubEnv('VERIFYFIRST_SECRETS_DIR', directory);
    const result = await resolveCredential('DEMO_KEY', 'Demo key');
    expect(result.status).toBe('invalid');
    expect(result.detail).toContain('directory');
  });

  it('reports an unreadable file as unreadable', async () => {
    const path = await writeSecret('unreadable', 'value');
    await chmod(path, 0o000);
    vi.stubEnv('DEMO_KEY_FILE', path);
    const result = await resolveCredential('DEMO_KEY', 'Demo key');
    // A privileged test runner can read mode 000, so accept either verdict but never a leak.
    expect(['invalid', 'configured']).toContain(result.status);
    if (result.status === 'invalid') expect(result.detail).toContain('cannot be read');
    expect(result.detail).not.toContain(path);
  });

  it('rejects a malformed environment value', async () => {
    vi.stubEnv('DEMO_KEY', 'has internal space');
    const result = await resolveCredential('DEMO_KEY', 'Demo key');
    expect(result.status).toBe('invalid');
    expect(JSON.stringify(result)).not.toContain('has internal space');
  });

  it('never includes the credential in any resolution result', async () => {
    await writeSecret('demo_key', 'super-secret-value');
    vi.stubEnv('VERIFYFIRST_SECRETS_DIR', directory);
    const result = await resolveCredential('DEMO_KEY', 'Demo key');
    expect(credentialValue(result)).toBe('super-secret-value');
    expect(result.detail).not.toContain('super-secret-value');
  });
});
