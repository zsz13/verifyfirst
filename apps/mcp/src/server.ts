import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { caseIdSchema } from '../../../agent/types.ts';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { executeTool, toolDescriptions, toolSchemas } from './tools.ts';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { InvestigationError } from './network.ts';

export function validateToolCase(caseHeader: string | undefined, input: unknown): void {
  const scope = caseIdSchema.safeParse(caseHeader);
  if (!scope.success)
    throw new InvestigationError(
      'CASE_SCOPE_REQUIRED',
      'Tool calls require an application-issued case scope.',
    );
  if (!input || typeof input !== 'object' || !('caseId' in input) || input.caseId !== scope.data)
    throw new InvestigationError(
      'CASE_SCOPE_MISMATCH',
      'Tool case must match the application-issued case scope.',
    );
}

function startServer(): void {
  const token = process.env.VERIFYFIRST_MCP_TOKEN;
  if (!token || token.length < 24)
    throw new Error(
      'VERIFYFIRST_MCP_TOKEN must contain at least 24 characters. Run npm run setup.',
    );
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.get('/health', (_request, response) => {
    response.json({ status: 'ok', service: 'verifyfirst-investigation-tools' });
  });
  app.post('/mcp', async (request, response) => {
    const supplied = Buffer.from(request.get('authorization') ?? '');
    const expected = Buffer.from(`Bearer ${token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const origin = request.get('origin');
    if (origin) {
      response.status(403).json({ error: 'Browser-origin MCP requests are not supported' });
      return;
    }
    const authorizedCaseId = request.get('x-verifyfirst-case');
    const server = new McpServer({ name: 'verifyfirst', version: '1.0.0' });
    for (const name of Object.keys(toolSchemas) as Array<keyof typeof toolSchemas>) {
      server.registerTool(
        name,
        {
          description: toolDescriptions[name],
          inputSchema: toolSchemas[name],
          annotations: {
            readOnlyHint: name !== 'export_case_report',
            destructiveHint: false,
            openWorldHint: [
              'inspect_domain',
              'inspect_sender',
              'inspect_url',
              'search_trusted_sources',
              'verify_organization',
            ].includes(name),
          },
        },
        async (input: unknown): Promise<CallToolResult> => {
          try {
            validateToolCase(authorizedCaseId, input);
            const result = await executeTool(name, input);
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          } catch (error) {
            return {
              isError: true,
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    kind: 'tool_error',
                    tool: name,
                    code:
                      error instanceof InvestigationError ? error.code : 'INVALID_OR_UNAVAILABLE',
                    message:
                      error instanceof InvestigationError
                        ? error.message
                        : 'The tool could not complete this request. Check the input and preserve uncertainty.',
                  }),
                },
              ],
            };
          }
        },
      );
    }
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    response.on('close', () => {
      void transport
        .close()
        .then(() => server.close())
        .catch(() => undefined);
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch {
      if (!response.headersSent) response.status(500).json({ error: 'MCP request failed' });
    }
  });
  app.all('/mcp', (_request, response) => {
    response.status(405).json({ error: 'Use POST for this stateless MCP transport' });
  });
  const port = Number(process.env.MCP_PORT ?? 8791);
  const host = process.env.MCP_HOST || '127.0.0.1';
  app.listen(port, host, () => {
    console.log(`VerifyFirst MCP listening on ${host}:${port}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startServer();
