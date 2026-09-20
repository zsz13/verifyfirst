import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Credential resolution is centralized so every integration reports the same safe diagnostics.
// Nothing here ever returns, logs or throws a credential value, a file path or a provider message.
const MAX_SECRET_BYTES = 4096;

export type CredentialSource = 'file' | 'environment' | 'none';
/** `detail` is always safe to log and to show a user: it describes the problem, never the secret. */
export type Credential =
  | { status: 'configured'; value: string; source: 'file' | 'environment'; detail: string }
  | { status: 'not_configured'; source: 'none'; detail: string }
  | { status: 'invalid'; source: CredentialSource; detail: string };

/** The credential itself, or undefined when it is absent or unusable. Never log the result. */
export function credentialValue(credential: Credential): string | undefined {
  return credential.status === 'configured' ? credential.value : undefined;
}

/** Directory Compose mounts the repository's ignored `secrets/` folder into. */
function secretsDirectory(): string | undefined {
  return process.env.VERIFYFIRST_SECRETS_DIR?.trim() || undefined;
}

/** Conventional file name for a credential inside the secrets directory. */
export function secretFileName(name: string): string {
  return name.toLowerCase();
}

function classify(contents: string, label: string): Credential {
  if (contents.length > MAX_SECRET_BYTES)
    return {
      status: 'invalid',
      source: 'file',
      detail: `${label} file is larger than ${MAX_SECRET_BYTES} bytes. It must contain only the credential.`,
    };
  const value = contents.trim();
  if (!value) return { status: 'invalid', source: 'file', detail: `${label} file is empty.` };
  if (/\s/.test(value))
    return {
      status: 'invalid',
      source: 'file',
      detail: `${label} file must contain only the credential, on a single line.`,
    };
  return { status: 'configured', value, source: 'file', detail: `${label} loaded from a file.` };
}

/** Maps a read failure to a safe category. Absent is not a failure: null means "keep looking". */
function classifyError(error: unknown, label: string): Credential | null {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'ENOENT') return null;
  if (code === 'EACCES' || code === 'EPERM')
    return {
      status: 'invalid',
      source: 'file',
      detail: `${label} file exists but cannot be read. Make it readable by the container user (uid 1000).`,
    };
  if (code === 'EISDIR')
    return {
      status: 'invalid',
      source: 'file',
      detail: `${label} file path refers to a directory, not a file.`,
    };
  return { status: 'invalid', source: 'file', detail: `${label} file could not be opened.` };
}

function fromEnvironment(name: string, label: string): Credential {
  const direct = process.env[name]?.trim();
  if (!direct)
    return {
      status: 'not_configured',
      source: 'none',
      detail: `${label} is not configured. Set ${name} in .env, or place the value in secrets/${secretFileName(name)}.`,
    };
  if (direct.length > MAX_SECRET_BYTES || /\s/.test(direct))
    return {
      status: 'invalid',
      source: 'environment',
      detail: `${label} environment value is malformed. It must be a single-line credential with no whitespace.`,
    };
  return {
    status: 'configured',
    value: direct,
    source: 'environment',
    detail: `${label} loaded from the environment.`,
  };
}

/**
 * Resolution order, applied identically to every credential:
 *   1. `<NAME>_FILE`, when set. An explicit path that cannot be used is an error, never a fallback.
 *   2. `secrets/<name>` inside the mounted secrets directory, when that file exists.
 *   3. `<NAME>` environment variable.
 *   4. Not configured, which optional integrations must tolerate.
 */
export async function resolveCredential(name: string, label: string): Promise<Credential> {
  const explicit = process.env[`${name}_FILE`]?.trim();
  if (explicit) {
    try {
      return classify(await readFile(explicit, 'utf8'), label);
    } catch (error) {
      return (
        classifyError(error, label) ?? {
          status: 'invalid',
          source: 'file',
          detail: `${label} file is configured by ${name}_FILE but no file exists at that path.`,
        }
      );
    }
  }
  const directory = secretsDirectory();
  if (directory) {
    try {
      const path = resolve(directory, secretFileName(name));
      return classify(await readFile(/* turbopackIgnore: true */ path, 'utf8'), label);
    } catch (error) {
      const failure = classifyError(error, label);
      if (failure) return failure;
    }
  }
  return fromEnvironment(name, label);
}

/** Same rules as resolveCredential, for the few call sites that must stay synchronous. */
export function resolveCredentialSync(name: string, label: string): Credential {
  const explicit = process.env[`${name}_FILE`]?.trim();
  if (explicit) {
    try {
      return classify(readFileSync(explicit, 'utf8'), label);
    } catch (error) {
      return (
        classifyError(error, label) ?? {
          status: 'invalid',
          source: 'file',
          detail: `${label} file is configured by ${name}_FILE but no file exists at that path.`,
        }
      );
    }
  }
  const directory = secretsDirectory();
  if (directory) {
    try {
      const path = resolve(directory, secretFileName(name));
      return classify(readFileSync(/* turbopackIgnore: true */ path, 'utf8'), label);
    } catch (error) {
      const failure = classifyError(error, label);
      if (failure) return failure;
    }
  }
  return fromEnvironment(name, label);
}
