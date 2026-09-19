import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { InvestigationError } from './network.ts';

export type { Evidence } from '../../../agent/types.ts';
import { reportSchema, type Evidence, type CaseReport } from '../../../agent/types.ts';
export type Report = CaseReport;
export type Comparison = CaseReport['comparisons'][number];
export function caseDir(caseId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(caseId))
    throw new InvestigationError('INVALID_CASE', 'caseId must be a UUID.');
  return join(resolve(process.env.VERIFYFIRST_DATA_DIR ?? '.data'), 'cases', caseId);
}
export async function saveJson(caseId: string, filename: string, value: unknown): Promise<void> {
  const directory = caseDir(caseId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `.${filename}.${randomUUID()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, join(directory, filename));
}
export async function readJson<T>(caseId: string, filename: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(join(caseDir(caseId), filename), 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
export async function record(
  caseId: string,
  tool: string,
  kind: Evidence['kind'],
  title: string,
  detail: string,
  sourceUrl?: string,
): Promise<Evidence> {
  const evidence: Evidence = {
    id: randomUUID(),
    tool,
    kind,
    title,
    detail,
    observedAt: new Date().toISOString(),
    ...(sourceUrl ? { sourceUrl } : {}),
  };
  await saveJson(caseId, `evidence-${evidence.id}.json`, evidence);
  return evidence;
}
export async function readEvidence(caseId: string): Promise<Evidence[]> {
  let files: string[];
  try {
    files = await readdir(caseDir(caseId));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const results = await Promise.all(
    files
      .filter((file) => /^evidence-[\da-f-]+\.json$/.test(file))
      .map((file) => readJson<Evidence>(caseId, file)),
  );
  return results
    .filter((item): item is Evidence => Boolean(item))
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
}
export async function exportCaseReport(
  caseId: string,
): Promise<{ kind: 'case_export'; caseId: string; exported: true; downloadPath: string }> {
  const directory = caseDir(caseId);
  const grantPath = join(directory, 'export-grant.json');
  const consumed = join(directory, `consumed-grant-${randomUUID()}.json`);
  try {
    await rename(grantPath, consumed);
  } catch {
    throw new InvestigationError(
      'APPROVAL_REQUIRED',
      'Explicit human approval in the application is required before export.',
    );
  }
  const grant: unknown = JSON.parse(await readFile(consumed, 'utf8'));
  if (
    !grant ||
    typeof grant !== 'object' ||
    !('caseId' in grant) ||
    grant.caseId !== caseId ||
    !('approvedAt' in grant) ||
    typeof grant.approvedAt !== 'string' ||
    !('reportHash' in grant) ||
    typeof grant.reportHash !== 'string'
  )
    throw new InvestigationError('APPROVAL_INVALID', 'Approval grant is invalid.');
  const age = Date.now() - Date.parse(grant.approvedAt);
  if (!Number.isFinite(age) || age < 0 || age > 300_000)
    throw new InvestigationError(
      'APPROVAL_EXPIRED',
      'Approval has expired; approve the export again.',
    );
  const bytes = await readFile(join(directory, 'report.json'));
  if (createHash('sha256').update(bytes).digest('hex') !== grant.reportHash)
    throw new InvestigationError(
      'REPORT_CHANGED',
      'The report changed after approval; review it again.',
    );
  const report = reportSchema.parse(JSON.parse(bytes.toString('utf8')));
  const redact = (text: string): string =>
    text
      .replace(/https?:\/\/[^\s"<>]+/g, (raw) => {
        try {
          const url = new URL(raw);
          url.search = '';
          url.hash = '';
          return url.href;
        } catch {
          return '[URL redacted]';
        }
      })
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email redacted]')
      .replace(/(?:\+?\d[\d ().-]{7,}\d)/g, '[number redacted]');
  const redacted: Report = {
    ...report,
    summary: redact(report.summary),
    evidence: report.evidence.map((entry) => ({
      ...entry,
      title: redact(entry.title),
      detail: redact(entry.detail),
      ...(entry.sourceUrl ? { sourceUrl: redact(entry.sourceUrl) } : {}),
    })),
    comparisons: report.comparisons.map((entry) => ({
      submitted: redact(entry.submitted),
      verified: redact(entry.verified),
      ...(entry.sourceUrl ? { sourceUrl: redact(entry.sourceUrl) } : {}),
    })),
    safeNextActions: report.safeNextActions.map(redact),
    limitations: report.limitations.map(redact),
  };
  await saveJson(caseId, 'export.json', redacted);
  return {
    kind: 'case_export',
    caseId,
    exported: true,
    downloadPath: `/api/cases/${caseId}/export`,
  };
}
