import { test, expect, type Page } from '@playwright/test';
import type { CaseView } from '../../agent/types';

const id = '12345678-1234-4234-8234-123456789abc';
const timestamp = '2026-01-01T12:00:00.000Z';
const caseView: CaseView = {
  id,
  sessionId: 'test-session',
  turnId: 'test-turn',
  createdAt: timestamp,
  status: 'complete',
  activity: [],
  approvals: [],
  exported: false,
  sandboxExecuted: false,
  report: {
    caseId: id,
    risk: 'SUSPICIOUS',
    summary: 'Previous investigation summary.',
    evidence: [],
    comparisons: [],
    injectionDetected: false,
    safeNextActions: ['Previous recommended action.'],
    limitations: [],
    createdAt: timestamp,
  },
};

async function mockCase(page: Page, view = caseView) {
  const caseReads: string[] = [];
  // Historical browser storage must never select an investigation on the root route.
  await page.addInitScript((savedId) => {
    localStorage.setItem('verifyfirst.caseId', savedId);
  }, id);
  await page.route('**/api/health', (route) =>
    route.fulfill({ json: { configured: true, harness: true, mcp: true, sandbox: false } }),
  );
  await page.route('**/api/cases/**', (route) => {
    caseReads.push(new URL(route.request().url()).pathname);
    return route.fulfill({ json: view });
  });
  return caseReads;
}

async function expectCleanHome(page: Page) {
  await expect(page).toHaveURL('http://127.0.0.1:3105/');
  await expect(page.getByRole('button', { name: 'Investigate', exact: true })).toBeEnabled();
  await expect(page.getByRole('textbox', { name: 'Message to investigate' })).toHaveValue('');
  await expect(page.getByRole('region', { name: 'Investigation results' })).toHaveCount(0);
  await expect(page.getByText('02 / INVESTIGATION', { exact: true })).toHaveCount(0);
  await expect(page.getByText(`Case ${id.slice(0, 8)}`, { exact: true })).toHaveCount(0);
  await expect(page.getByText('Previous investigation summary.', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Previous recommended action.', { exact: true })).toHaveCount(0);
}

for (const linkName of ['VerifyFirst home', 'Investigate']) {
  test(`completed case → ${linkName} → clean root`, async ({ page }) => {
    const reads = await mockCase(page);
    await page.goto(`/?case=${id}`);
    await expect(page.getByText('Previous investigation summary.', { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Message to investigate' }).fill('Another draft');
    await page.getByRole('link', { name: linkName, exact: true }).click();
    await expectCleanHome(page);
    expect(reads).toEqual([`/api/cases/${id}`]);
  });
}

test('direct root ignores a previously saved case', async ({ page }) => {
  const reads = await mockCase(page);
  await page.goto('/');
  await expectCleanHome(page);
  expect(reads).toEqual([]);
});

for (const status of ['running', 'approval_required'] as const) {
  test(`${status} case route restores the same session after refresh`, async ({ page }) => {
    const reads = await mockCase(page, {
      ...caseView,
      status,
      report: status === 'running' ? null : caseView.report,
      approvals:
        status === 'approval_required'
          ? [
              {
                threadId: 'main',
                toolCallId: 'export',
                toolName: 'export_case_report',
                arguments: JSON.stringify({ caseId: id }),
                actionable: true,
              },
            ]
          : [],
    });
    await page.goto(`/?case=${id}`);
    const assertRestored = async () => {
      await expect(page.getByText(`Case ${id.slice(0, 8)}`, { exact: true })).toBeVisible();
      if (status === 'approval_required')
        await expect(page.getByRole('button', { name: 'Allow export', exact: true })).toBeEnabled();
      else
        await expect(
          page.getByRole('heading', { name: 'Following the evidence…', exact: true }),
        ).toBeVisible();
    };
    await assertRestored();
    await page.reload();
    await assertRestored();
    await expect(page).toHaveURL(`http://127.0.0.1:3105/?case=${id}`);
    expect(reads.length).toBeGreaterThanOrEqual(2);
    expect(reads.every((path) => path === `/api/cases/${id}`)).toBe(true);
  });
}
