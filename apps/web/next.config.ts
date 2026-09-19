import type { NextConfig } from 'next';

// Polling avoids low macOS file-descriptor limits without changing the user's shell.
process.env.WATCHPACK_POLLING = 'true';
const config: NextConfig = {
  poweredByHeader: false,
  agentRules: false,
  outputFileTracingExcludes: { '/*': ['../../.data/**/*', '../../.env*'] },
};

export default config;
