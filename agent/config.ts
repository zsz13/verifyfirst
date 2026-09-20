import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TrueForge } from '@truefoundry/trueforge-sdk';
import { credentialValue, resolveCredentialSync } from './credentials.ts';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(resolve(projectRoot, '.env'))) loadEnvFile(resolve(projectRoot, '.env'));
// Mutable private case data is runtime storage, never a bundled application dependency.
export const dataDir = resolve(
  /* turbopackIgnore: true */ process.env.VERIFYFIRST_DATA_DIR || resolve(projectRoot, '.data'),
);
export const harnessUrl = process.env.TRUEFORGE_BASE_URL || 'http://127.0.0.1:8790';
export const mcpUrl =
  process.env.VERIFYFIRST_MCP_URL || `http://127.0.0.1:${process.env.MCP_PORT || '8791'}/mcp`;
export function harnessClient() {
  return new TrueForge({
    baseUrl: harnessUrl,
    // Optional: only a hosted TrueForge requires a token. Supports TRUEFORGE_TOKEN_FILE too.
    token: credentialValue(resolveCredentialSync('TRUEFORGE_TOKEN', 'TrueForge token')),
    timeoutInSeconds: 30,
    maxRetries: 0,
  });
}
