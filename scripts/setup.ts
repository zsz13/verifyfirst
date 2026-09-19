import { randomBytes } from 'node:crypto';
import { appendFile, chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { dataDir, harnessClient, projectRoot } from '../agent/config.ts';

export async function setup() {
  if (process.env.VERIFYFIRST_ENV_FILE) loadEnvFile(process.env.VERIFYFIRST_ENV_FILE);
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const client = harnessClient();
  let token = process.env.VERIFYFIRST_MCP_TOKEN;
  if (!token) {
    token = randomBytes(32).toString('hex');
    const envPath = resolve(projectRoot, '.env');
    const existing = await readFile(envPath, 'utf8').catch(() => '');
    if (/^VERIFYFIRST_MCP_TOKEN=/m.test(existing)) {
      await writeFile(
        envPath,
        existing.replace(/^VERIFYFIRST_MCP_TOKEN=.*$/m, `VERIFYFIRST_MCP_TOKEN=${token}`),
        { mode: 0o600 },
      );
    } else {
      await appendFile(envPath, `\nVERIFYFIRST_MCP_TOKEN=${token}\n`, { mode: 0o600 });
    }
    await chmod(envPath, 0o600);
    process.env.VERIFYFIRST_MCP_TOKEN = token;
  }
  await client.settings.mcpServers.createOrUpdate({
    manifest: {
      name: 'verifyfirst',
      type: 'remote',
      description: 'Read-only scam evidence investigation and human-approved report export.',
      url: `http://127.0.0.1:${process.env.MCP_PORT || '8791'}/mcp`,
      auth: { type: 'header', headers: { Authorization: `Bearer ${token}` } },
    },
  });
  const provider = process.env.MODEL_PROVIDER || (process.env.OPENAI_API_KEY ? 'openai' : undefined);
  const providerKey = process.env.MODEL_API_KEY || process.env.OPENAI_API_KEY;
  if (providerKey && provider) {
    const catalog = await client.catalogs.modelProviders.list();
    const preset = catalog.data.find((entry) => entry.type === provider);
    if (!preset || preset.type === 'custom')
      throw new Error('Choose a model provider from TrueForge Settings or its model catalog.');
    await client.settings.modelProviders.createOrUpdate({
      manifest: {
        type: preset.type,
        models: preset.models,
        auth: { apiKey: providerKey },
      },
    });
  }
  if (process.env.DAYTONA_API_KEY) {
    await client.settings.sandboxProviders.createOrUpdate({
      manifest: {
        type: 'daytona',
        auth: { apiKey: process.env.DAYTONA_API_KEY },
        autoArchiveIntervalInMinutes: 60,
        autoDeleteIntervalInMinutes: 1440,
        autoStopIntervalInMinutes: 15,
        execTimeoutMs: 30000,
      },
    });
  }
  const models = await client.models.list();
  console.log(`VerifyFirst connector registered. ${models.data.length} model(s) available.`);
  if (!models.data.length)
    console.log(
      'Configure a model at http://127.0.0.1:8790 → Settings → Models, then investigate.',
    );
}

if (process.argv[1]?.endsWith('setup.ts')) {
  setup().catch(() => {
    console.error(
      'Setup failed. Check that TrueForge is running and the selected provider settings are valid. No credentials were printed.',
    );
    process.exitCode = 1;
  });
}
