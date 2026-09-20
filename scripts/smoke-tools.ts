import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { casePath } from '../agent/cases.ts';
import { demos } from '../fixtures/demos.ts';
import '../agent/config.ts';

const caseId = randomUUID();
await mkdir(casePath(caseId, '.'), { recursive: true, mode: 0o700 });
await writeFile(casePath(caseId, 'submission.json'), JSON.stringify(demos[0]), { mode: 0o600 });
const client = new Client({ name: 'verifyfirst-smoke', version: '1.0.0' });
await client.connect(
  new StreamableHTTPClientTransport(new URL('http://127.0.0.1:8791/mcp'), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${process.env.VERIFYFIRST_MCP_TOKEN ?? ''}`,
        'X-VerifyFirst-Case': caseId,
      },
    },
  }),
);
try {
  const listed = await client.listTools();
  console.log(`MCP connected: ${listed.tools.length} tools advertised.`);
  const calls = [
    { name: 'analyze_submission', arguments: { caseId, text: demos[0].text } },
    { name: 'inspect_domain', arguments: { caseId, domain: 'chase-security-review.example' } },
    { name: 'inspect_url', arguments: { caseId, url: demos[0].url } },
    {
      name: 'verify_organization',
      arguments: {
        caseId,
        organization: 'Chase',
        submittedDomain: 'chase-security-review.example',
      },
    },
    { name: 'inspect_sender', arguments: { caseId } },
    { name: 'search_trusted_sources', arguments: { caseId, query: 'bank money transfer' } },
    { name: 'create_case_report', arguments: { caseId } },
  ];
  for (const call of calls) {
    const result = await client.callTool(call);
    if (result.isError) throw new Error(`${call.name} returned an error`);
    console.log(`PASS ${call.name}`);
  }
  const blocked = await client.callTool({ name: 'export_case_report', arguments: { caseId } });
  if (!blocked.isError) throw new Error('Export should be blocked without approval');
  console.log(`PASS export_case_report blocked without grant. Case ${caseId}`);
} finally {
  await client.close();
}
