import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createCase, health, readCase, approveCase, casePath } from '../agent/cases.ts';
import { dataDir } from '../agent/config.ts';
import { demos } from '../fixtures/demos.ts';

const ready = await health();
if (!ready.configured) throw new Error(`Live evaluation cannot run: ${ready.message}`);
const summaries = [];
for (const demo of demos) {
  let result = await createCase({ text: demo.text, url: demo.url });
  const deadline = Date.now() + 240_000;
  while (result.status === 'running' && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    result = await readCase(result.id);
  }
  assert.equal(result.status, 'approval_required', `${demo.id}: native approval must pause`);
  assert.ok(result.report, 'Report must exist before export approval');
  const successfulTools = new Set(
    result.activity
      .filter((a) => a.type === 'tool.response' && a.toolKind === 'mcp' && a.success)
      .map((a) => a.toolName),
  );
  assert.ok(
    successfulTools.size >= 3,
    'TrueForge must execute at least three distinct successful MCP tools',
  );
  assert.equal(result.exported, false, 'Export cannot precede approval');
  if (demo.id === 'injected-message') assert.equal(result.report.injectionDetected, true);
  if (demo.id === 'ordinary-reminder')
    assert.ok(['LOW_EVIDENCE', 'UNKNOWN'].includes(result.report.risk));
  if (demo.id === 'bank-transfer') {
    assert.equal(result.report.risk, 'HIGH_RISK');
    assert.ok(
      result.report.evidence.some(
        (e) => e.sourceUrl && e.kind === 'verified_fact' && e.tool !== 'analyze_submission',
      ),
      'Live evidence must be sourced',
    );
  }
  const approval = result.approvals.find((a) => a.actionable);
  assert.ok(approval);
  // Live eval exercises denial only. Human approval remains a real UI action in the demo.
  let resumed = await approveCase(result.id, { toolCallId: approval.toolCallId, decision: 'deny' });
  const resumeDeadline = Date.now() + 120_000;
  while (resumed.status === 'running' && Date.now() < resumeDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    resumed = await readCase(result.id);
  }
  assert.equal(
    resumed.status,
    'complete',
    'Denial must finish without failure or another approval request',
  );
  assert.equal(resumed.exported, false);
  assert.equal(resumed.approvals.length, 0);
  await assert.rejects(readFile(casePath(result.id, 'export.json')));
  summaries.push({
    demo: demo.id,
    caseId: result.id,
    sessionId: result.sessionId,
    risk: result.report.risk,
    sandboxExecuted: result.sandboxExecuted,
    tools: result.activity.filter((a) => a.type === 'tool.response').length,
  });
  console.log(
    `PASS ${demo.id} · ${result.report.risk} · native approval paused · denial submitted`,
  );
}
if (ready.sandbox)
  assert.ok(
    summaries.some((item) => item.sandboxExecuted),
    'An available native sandbox must actually execute during the live demo set',
  );
await writeFile(resolve(dataDir, 'live-eval-summary.json'), JSON.stringify(summaries, null, 2), {
  mode: 0o600,
});
console.log(
  `${summaries.length}/3 live scenarios passed. Saved local session evidence in .data/live-eval-summary.json.`,
);
