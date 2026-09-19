import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { TrueForgeApi } from '@truefoundry/trueforge-sdk';

const mocks = vi.hoisted(() => ({
  listTurns: vi.fn(),
  getTurn: vi.fn(),
  listEvents: vi.fn(),
  createTurn: vi.fn(),
  create: vi.fn(),
  register: vi.fn(),
  failMetadata: false,
}));
vi.mock('@truefoundry/trueforge-sdk', () => ({
  TrueForge: class {
    sessions = { ...mocks };
    models = { list: () => Promise.resolve({ data: [{ name: 'test-model' }] }) };
    server = { getCapabilities: () => Promise.resolve({ data: { sandbox: { enabled: false } } }) };
    settings = { mcpServers: { createOrUpdate: mocks.register } };
  },
}));
vi.mock('node:fs/promises', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...fs,
    rename: async (...args: Parameters<typeof fs.rename>) => {
      if (mocks.failMetadata && String(args[1]).endsWith('/metadata.json'))
        throw new Error('Disk unavailable');
      return fs.rename(...args);
    },
  };
});

const timestamp = '2026-09-19T12:00:00.000Z';
let directory: string;
let cases: typeof import('../agent/cases.ts');
let id: string;
let turns: TrueForgeApi.Turn[];
let events: TrueForgeApi.SessionEvent[];
let resumedEvents: TrueForgeApi.SessionEvent[];
function running(turnId: string): TrueForgeApi.Turn {
  return {
    id: turnId,
    sessionId: 'session',
    previousTurnId: turnId === 'original' ? null : 'original',
    createdAt: timestamp,
    state: { status: 'running' },
  };
}
function* page<T>(values: T[]) {
  for (const value of values) yield value;
}
function toolCall(
  name: string,
  callId = name,
  serverName = `verifyfirst-${id}`,
): TrueForgeApi.ToolCall {
  return {
    id: callId,
    type: 'function',
    function: { name, arguments: JSON.stringify({ caseId: id }) },
    toolInfo: { type: 'mcp', name, serverName, serverId: 'connector' },
  };
}
function wrappedCall(
  name: string,
  callId = name,
  input: unknown = { caseId: id },
): TrueForgeApi.ToolCall {
  return {
    ...toolCall('call_tool', callId),
    function: {
      name: 'call_tool',
      arguments: JSON.stringify({ mcp_server: `verifyfirst-${id}`, tool_name: name, input }),
    },
    toolInfo: { type: 'truefoundry-system', name: 'call_tool' },
  };
}
function model(calls: TrueForgeApi.ToolCall[]): TrueForgeApi.ModelMessageEvent {
  return {
    id: randomUUID(),
    threadId: 'main',
    type: 'model.message',
    createdAt: timestamp,
    content: 'MODEL TEXT MUST NOT BE RENDERED',
    toolCalls: calls,
  };
}
function response(callId: string, content: string): TrueForgeApi.ToolResponseEvent {
  return {
    id: randomUUID(),
    threadId: 'main',
    type: 'tool.response',
    createdAt: timestamp,
    toolCallId: callId,
    content,
  };
}
async function preparedCase() {
  await mkdir(cases.casePath(id, '.'), { recursive: true });
  await writeFile(
    cases.casePath(id, 'metadata.json'),
    JSON.stringify({ id, sessionId: 'session', turnId: 'original', createdAt: timestamp }),
  );
  await writeFile(
    cases.casePath(id, 'report.json'),
    JSON.stringify({
      caseId: id,
      risk: 'UNKNOWN',
      summary: 'Insufficient evidence.',
      evidence: [],
      comparisons: [],
      injectionDetected: false,
      safeNextActions: [],
      limitations: [],
      createdAt: timestamp,
    }),
  );
  const approval: TrueForgeApi.ToolApprovalRequiredEvent = {
    id: 'approval',
    threadId: 'main',
    createdAt: timestamp,
    type: 'tool.approval_required',
    toolCalls: [{ id: 'export', sourceEventId: 'model' }],
  };
  turns = [
    {
      ...running('original'),
      state: { status: 'done', completedAt: timestamp, output: null, requiredActions: [approval] },
    },
  ];
  events = [model([toolCall('export_case_report', 'export')]), approval];
}
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.failMetadata = false;
  directory = await mkdtemp(join(tmpdir(), 'verifyfirst-cases-'));
  vi.stubEnv('VERIFYFIRST_DATA_DIR', directory);
  vi.stubEnv('VERIFYFIRST_MCP_TOKEN', 'test-only-token');
  vi.stubEnv('TRUEFORGE_MODEL', 'test-model');
  vi.stubEnv('MCP_PORT', '8791');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  cases = await import('../agent/cases.ts');
  id = randomUUID();
  turns = [];
  events = [];
  resumedEvents = [];
  mocks.listTurns.mockImplementation(() => Promise.resolve(page([...turns])));
  mocks.getTurn.mockImplementation((_session: string, turnId: string) =>
    Promise.resolve({
      data: turns.find((turn) => turn.id === turnId),
    }),
  );
  mocks.listEvents.mockImplementation((_session: string, options: { lastTurnId: string }) => {
    const history: TrueForgeApi.SessionEvent[] = [];
    let anchor: string | null = options.lastTurnId;
    while (anchor) {
      const turn = turns.find((item) => item.id === anchor);
      if (!turn) throw new Error(`Unknown event-history anchor: ${anchor}`);
      history.push(...[...(anchor === 'original' ? events : resumedEvents)].reverse());
      anchor = turn.previousTurnId;
    }
    return Promise.resolve(page(history.map((event) => ({ event }))));
  });
  mocks.createTurn.mockImplementation(() => {
    const turn = running('resumed');
    turns.push(turn);
    return Promise.resolve({ data: turn });
  });
  mocks.create.mockResolvedValue({ data: { id: 'session' } });
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(directory, { recursive: true, force: true });
});

describe('case recovery and approval integrity', () => {
  it('persists optional sender as untrusted original input and accepts sender-only cases', async () => {
    const result = await cases.createCase({ sender: 'sender@example.org' });
    expect(
      JSON.parse(await readFile(cases.casePath(result.id, 'submission.json'), 'utf8')),
    ).toEqual({ text: '', url: '', sender: 'sender@example.org' });
    expect(JSON.stringify(mocks.createTurn.mock.calls[0]?.[1])).toContain('untrustedSubmission');
  });
  it('rejects oversized link sets before any model or session side effect', async () => {
    await expect(
      cases.createCase({
        text: Array.from({ length: 6 }, (_, i) => `https://sample${i}.example`).join(' '),
      }),
    ).rejects.toThrow('at most 5 links');
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.createTurn).not.toHaveBeenCalled();
    expect(
      cases.submissionSchema.safeParse({
        text: 'https://one.example https://one.example',
        url: 'https://one.example',
      }).success,
    ).toBe(true);
  });
  it('derives per-call elapsed time from harness timestamps without inventing missing or negative timing', async () => {
    await preparedCase();
    const invocation = model([toolCall('inspect_url', 'timed')]);
    const returned = { ...response('timed', '{}'), createdAt: '2026-09-19T12:00:00.420Z' };
    const missing = response('missing', '{}');
    const negative = { ...response('timed', '{}'), createdAt: '2026-09-19T11:59:59.000Z' };
    events = [invocation, returned, missing, negative];
    const result = await cases.readCase(id);
    expect(result.activity.find((item) => item.id === returned.id)?.durationMs).toBe(420);
    expect(result.activity.find((item) => item.id === missing.id)?.durationMs).toBeUndefined();
    expect(result.activity.find((item) => item.id === negative.id)?.durationMs).toBeUndefined();
    expect(result.activity.find((item) => item.id === 'timed')).toMatchObject({
      toolKind: 'mcp',
      toolName: 'inspect_url',
    });
  });
  it.each(['allow', 'deny'] as const)(
    'submits the exact native %s approval and never exports directly',
    async (decision) => {
      await preparedCase();
      const result = await cases.approveCase(id, { toolCallId: 'export', decision });
      expect(mocks.createTurn).toHaveBeenCalledExactlyOnceWith('session', {
        input: [
          {
            type: 'user.tool_approval',
            threadId: 'main',
            toolCallId: 'export',
            approval: { status: decision },
          },
        ],
      });
      expect(result).toMatchObject({ status: 'running', approvals: [], exported: false });
      await expect(readFile(cases.casePath(id, 'export.json'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
      if (decision === 'deny') {
        await expect(readFile(cases.casePath(id, 'export-grant.json'))).rejects.toMatchObject({
          code: 'ENOENT',
        });
        expect((await cases.readCase(id)).exported).toBe(false);
      } else {
        expect(
          JSON.parse(await readFile(cases.casePath(id, 'export-grant.json'), 'utf8')),
        ).toMatchObject({ caseId: id });
      }
    },
  );

  it('approves a case-bound native MCP wrapper using the wrapper call identity', async () => {
    await preparedCase();
    events = [model([wrappedCall('export_case_report', 'export')])];
    expect((await cases.readCase(id)).approvals).toEqual([
      {
        threadId: 'main',
        toolCallId: 'export',
        toolName: 'export_case_report',
        arguments: JSON.stringify({ caseId: id }),
        actionable: true,
      },
    ]);
    await cases.approveCase(id, { toolCallId: 'export', decision: 'allow' });
    expect(mocks.createTurn).toHaveBeenCalledExactlyOnceWith('session', {
      input: [
        {
          type: 'user.tool_approval',
          threadId: 'main',
          toolCallId: 'export',
          approval: { status: 'allow' },
        },
      ],
    });
  });
  it.each(['server', 'case', 'extra_input', 'extra_wrapper', 'malformed', 'wrong_wrapper'])(
    'rejects unsafe native MCP wrapper: %s',
    async (variant) => {
      await preparedCase();
      const call = wrappedCall('export_case_report', 'export');
      const args = {
        mcp_server: `verifyfirst-${id}`,
        tool_name: 'export_case_report',
        input: { caseId: id },
      };
      if (variant === 'server') args.mcp_server = `verifyfirst-${randomUUID()}`;
      if (variant === 'case') args.input.caseId = randomUUID();
      call.function.arguments = JSON.stringify(
        variant === 'extra_wrapper'
          ? { ...args, bypass: true }
          : variant === 'extra_input'
            ? { ...args, input: { ...args.input, path: '/tmp/forged' } }
            : args,
      );
      if (variant === 'malformed') call.function.arguments = '{';
      if (variant === 'wrong_wrapper') call.toolInfo = { type: 'truefoundry-system', name: 'exec' };
      events = [model([call])];
      expect((await cases.readCase(id)).approvals[0]?.actionable).toBe(false);
      await expect(
        cases.approveCase(id, { toolCallId: 'export', decision: 'allow' }),
      ).rejects.toMatchObject({ status: 409 });
      expect(mocks.createTurn).not.toHaveBeenCalled();
    },
  );
  it('recovers a stale legacy lock and rejects an overlapping decision', async () => {
    await preparedCase();
    await writeFile(cases.casePath(id, 'approval.lock'), '');
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.createTurn.mockImplementationOnce(async () => {
      await gate;
      return { data: running('resumed') };
    });
    const first = cases.approveCase(id, { toolCallId: 'export', decision: 'allow' });
    await expect(
      cases.approveCase(id, { toolCallId: 'export', decision: 'deny' }),
    ).rejects.toMatchObject({ status: 409 });
    if (!release) throw new Error('Missing gate');
    release();
    await expect(first).resolves.toMatchObject({ turnId: 'resumed', status: 'running' });
    expect(mocks.createTurn).toHaveBeenCalledTimes(1);
  });
  it.each(['response', 'metadata'])(
    'reconciles a continuation when its %s was lost without revoking its grant',
    async (failure) => {
      await preparedCase();
      if (failure === 'metadata') mocks.failMetadata = true;
      else
        mocks.createTurn.mockImplementationOnce(() => {
          turns.push(running('resumed'));
          return Promise.reject(new Error('Connection lost after acceptance'));
        });
      await expect(
        cases.approveCase(id, { toolCallId: 'export', decision: 'allow' }),
      ).rejects.toMatchObject({ status: 503 });
      expect(
        JSON.parse(await readFile(cases.casePath(id, 'export-grant.json'), 'utf8')),
      ).toMatchObject({ caseId: id });
      const restored = await cases.readCase(id);
      expect(restored).toMatchObject({ turnId: 'resumed', status: 'running', approvals: [] });
      expect(restored.activity.some((item) => item.label === 'export_case_report')).toBe(true);
      expect(mocks.listEvents).toHaveBeenLastCalledWith('session', {
        lastTurnId: 'resumed',
        limit: 100,
      });
      await expect(
        cases.approveCase(id, { toolCallId: 'export', decision: 'allow' }),
      ).rejects.toMatchObject({ status: 409 });
      expect(mocks.createTurn).toHaveBeenCalledTimes(1);
    },
  );
  it('allows retrying the same durable decision and renews its grant, but rejects a changed decision after restart', async () => {
    await preparedCase();
    mocks.createTurn.mockRejectedValueOnce(new Error('Offline before acceptance'));
    await expect(
      cases.approveCase(id, { toolCallId: 'export', decision: 'allow' }),
    ).rejects.toMatchObject({ status: 503 });
    const oldGrant = JSON.parse(
      await readFile(cases.casePath(id, 'export-grant.json'), 'utf8'),
    ) as Record<string, unknown>;
    await writeFile(
      cases.casePath(id, 'export-grant.json'),
      JSON.stringify({ ...oldGrant, approvedAt: '2000-01-01T00:00:00.000Z' }),
    );
    vi.resetModules();
    cases = await import('../agent/cases.ts');
    await expect(
      cases.approveCase(id, { toolCallId: 'export', decision: 'deny' }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      cases.approveCase(id, { toolCallId: 'export', decision: 'allow' }),
    ).resolves.toMatchObject({ status: 'running' });
    const renewed = JSON.parse(
      await readFile(cases.casePath(id, 'export-grant.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(renewed.reportHash).toBe(oldGrant.reportHash);
    expect(renewed.approvedAt).not.toBe('2000-01-01T00:00:00.000Z');
    expect(mocks.createTurn).toHaveBeenCalledTimes(2);
  });
  it('refuses to renew a decision for changed report bytes', async () => {
    await preparedCase();
    mocks.createTurn.mockRejectedValueOnce(new Error('Offline'));
    await expect(
      cases.approveCase(id, { toolCallId: 'export', decision: 'allow' }),
    ).rejects.toMatchObject({ status: 503 });
    const report = JSON.parse(await readFile(cases.casePath(id, 'report.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    await writeFile(
      cases.casePath(id, 'report.json'),
      JSON.stringify({ ...report, summary: 'Changed' }),
    );
    await expect(
      cases.approveCase(id, { toolCallId: 'export', decision: 'allow' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.createTurn).toHaveBeenCalledTimes(1);
  });
  it('rejects an export call from another case connector', async () => {
    await preparedCase();
    events = [model([toolCall('export_case_report', 'export', `verifyfirst-${randomUUID()}`)])];
    expect((await cases.readCase(id)).approvals[0]?.actionable).toBe(false);
    await expect(
      cases.approveCase(id, { toolCallId: 'export', decision: 'allow' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.createTurn).not.toHaveBeenCalled();
  });
});

describe('case connector and execution evidence', () => {
  it.each([
    {
      name: 'successful execution',
      tool: 'exec',
      result: JSON.stringify({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              response: { exitCode: 0, result: 'sha256: example-fingerprint' },
            }),
          },
        ],
      }),
      executed: true,
    },
    { name: 'provision only', tool: null, result: null, executed: false },
    {
      name: 'unrelated native tool',
      tool: 'read_file',
      result: '{"content":"hello"}',
      executed: false,
    },
    {
      name: 'failed native execution',
      tool: 'exec',
      result: '{"success":true,"response":{"exitCode":2,"result":"parse failed"}}',
      executed: false,
    },
    {
      name: 'native tool exception',
      tool: 'exec',
      result: '{"tool_error":"Sandbox unavailable"}',
      executed: false,
    },
  ])('proves sandbox execution from $name', async ({ tool, result, executed }) => {
    await preparedCase();
    events = [
      {
        id: 'sandbox',
        type: 'sandbox.created',
        sandboxId: 'sandbox-123',
        threadId: null,
        createdAt: timestamp,
      },
    ];
    if (tool && result) {
      const call: TrueForgeApi.ToolCall = {
        ...toolCall(tool),
        toolInfo: { type: 'truefoundry-system', name: tool },
      };
      events.push(model([call]), response(call.id, result));
    }
    const view = await cases.readCase(id);
    expect(view.sandboxExecuted).toBe(executed);
    expect(view.activity.find((item) => item.type === 'sandbox.created')?.detail).toBe(
      'Native TrueForge sandbox ready for isolated execution.',
    );
  });

  it('attributes wrapped MCP results to their recorded call, including failures', async () => {
    await preparedCase();
    const success = wrappedCall('analyze_submission');
    const failure = wrappedCall('search_trusted_sources');
    const foreign = wrappedCall('inspect_domain');
    foreign.function.arguments = JSON.stringify({
      mcp_server: 'unknown-server',
      tool_name: 'inspect_domain',
      input: { caseId: id },
    });
    events = [
      model([success, failure, foreign]),
      response(success.id, '{"evidence":[]}'),
      response(failure.id, '{"isError":true}'),
      response(foreign.id, '{"tool_name":"export_case_report","success":true}'),
      response('unknown-call', '{"tool_name":"export_case_report","success":true}'),
    ];
    const result = await cases.readCase(id);
    expect(result.activity.find((item) => item.id === success.id)?.label).toBe(
      'analyze_submission',
    );
    expect(
      result.activity
        .filter((item) => item.toolKind === 'mcp' && item.success)
        .map((item) => item.toolName),
    ).toEqual(['analyze_submission']);
    expect(
      result.activity.find(
        (item) => item.type === 'tool.response' && item.toolName === 'search_trusted_sources',
      ),
    ).toMatchObject({ toolKind: 'mcp', success: false });
    expect(result.activity.some((item) => item.toolName === 'export_case_report')).toBe(false);
  });
  it('registers an authenticated case-bound connector before starting its session', async () => {
    const result = await cases.createCase({ text: 'Please check this message.' });
    expect(mocks.register).toHaveBeenCalledWith({
      manifest: {
        name: `verifyfirst-${result.id}`,
        type: 'remote',
        description: 'Investigation tools restricted to this case.',
        url: 'http://127.0.0.1:8791/mcp',
        auth: {
          type: 'header',
          headers: { Authorization: 'Bearer test-only-token', 'X-VerifyFirst-Case': result.id },
        },
      },
    });
    expect(mocks.register.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.create.mock.invocationCallOrder[0] ?? 0,
    );
  });
  it('retains older tool evidence across resumed turns and excludes failed responses and model prose', async () => {
    await preparedCase();
    turns.push(running('resumed'));
    const successful = toolCall('analyze_submission');
    const failed = toolCall('search_trusted_sources');
    const native: TrueForgeApi.ToolCall = {
      ...toolCall('exec'),
      toolInfo: { type: 'truefoundry-system', name: 'exec' },
    };
    events = [model([successful]), response(successful.id, '{"evidence":[]}')];
    resumedEvents = [
      model([failed, native]),
      response(
        failed.id,
        '{"content":[{"type":"text","text":"{\\"tool_error\\":\\"unavailable\\"}"}]}',
      ),
      response(native.id, '{"exit_code":1}'),
      ...Array.from({ length: 501 }, (_, i) => response(`unmatched-${i}`, '{}')),
    ];
    const result = await cases.readCase(id);
    expect(mocks.listEvents).toHaveBeenLastCalledWith('session', {
      lastTurnId: 'resumed',
      limit: 100,
    });
    expect(result.activity.filter((item) => item.success).map((item) => item.toolName)).toEqual([
      'analyze_submission',
    ]);
    expect(
      result.activity.find(
        (item) => item.type === 'tool.response' && item.toolName === 'search_trusted_sources',
      ),
    ).toMatchObject({ toolKind: 'mcp', success: false });
    expect(result.sandboxExecuted).toBe(false);
    expect(JSON.stringify(result.activity)).not.toContain('MODEL TEXT MUST NOT BE RENDERED');
  });
});
