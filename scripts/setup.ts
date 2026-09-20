import { randomBytes } from 'node:crypto';
import { appendFile, chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { dataDir, harnessClient, projectRoot, mcpUrl } from '../agent/config.ts';
import { credentialValue, resolveCredential } from '../agent/credentials.ts';
import { ConfigurationError } from '../agent/errors.ts';

export async function setup() {
  if (process.env.VERIFYFIRST_ENV_FILE) loadEnvFile(process.env.VERIFYFIRST_ENV_FILE);
  // Collected rather than thrown: an unusable optional credential must not block startup.
  const notes: string[] = [];
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
      url: mcpUrl,
      auth: { type: 'header', headers: { Authorization: `Bearer ${token}` } },
    },
  });
  // Optional at startup: a model can equally be added in the TrueForge UI afterwards.
  const modelKey = await resolveCredential('MODEL_API_KEY', 'Model API key');
  const openaiKey = await resolveCredential('OPENAI_API_KEY', 'OpenAI API key');
  if (modelKey.status === 'invalid') notes.push(modelKey.detail);
  if (openaiKey.status === 'invalid') notes.push(openaiKey.detail);
  const providerKey = credentialValue(modelKey) ?? credentialValue(openaiKey);
  const provider =
    process.env.MODEL_PROVIDER?.trim() || (credentialValue(openaiKey) ? 'openai' : undefined);
  if (providerKey && !provider)
    notes.push(
      'A model key is configured but MODEL_PROVIDER is not set, so no provider was added.',
    );
  if (providerKey && provider) {
    const catalog = await client.catalogs.modelProviders.list();
    const preset = catalog.data.find((entry) => entry.type === provider);
    const supported = catalog.data
      .map((entry) => entry.type)
      .filter((type) => type !== 'custom')
      .join(', ');
    if (!preset || preset.type === 'custom')
      notes.push(
        `MODEL_PROVIDER "${provider}" is not a supported provider, so no model was configured. Supported: ${supported}.`,
      );
    else
      await client.settings.modelProviders.createOrUpdate({
        manifest: {
          type: preset.type,
          models: preset.models,
          auth: { apiKey: providerKey },
        },
      });
  }
  const daytonaKey = await resolveCredential('DAYTONA_API_KEY', 'Daytona API key');
  if (daytonaKey.status === 'invalid') notes.push(daytonaKey.detail);
  const daytonaValue = credentialValue(daytonaKey);
  if (daytonaValue) {
    await client.settings.sandboxProviders.createOrUpdate({
      manifest: {
        type: 'daytona',
        auth: { apiKey: daytonaValue },
        autoArchiveIntervalInMinutes: 60,
        autoDeleteIntervalInMinutes: 1440,
        autoStopIntervalInMinutes: 15,
        execTimeoutMs: 30000,
      },
    });
  }
  const models = await client.models.list();
  console.log(`VerifyFirst connector registered. ${models.data.length} model(s) available.`);
  for (const note of notes) console.log(`Note: ${note}`);
  if (!models.data.length)
    console.log(
      [
        'No model is configured, so investigations cannot run yet. Everything else is ready.',
        'Either add a model at http://127.0.0.1:8790 → Settings → Models,',
        'or copy .env.example to .env, set MODEL_PROVIDER and MODEL_API_KEY, then restart.',
      ].join('\n'),
    );
}

if (process.argv[1]?.endsWith('setup.ts')) {
  setup().catch((error: unknown) => {
    // Only our own configuration messages are printed: provider errors may echo credentials.
    console.error(
      error instanceof ConfigurationError
        ? `Setup failed: ${error.message}`
        : 'Setup failed. Check that TrueForge is running and that the configured provider settings are valid. No credentials were printed.',
    );
    process.exitCode = 1;
  });
}
