import { z } from 'zod';

export const caseIdSchema = z.uuid();
export const evidenceSchema = z.object({
  id: z.string(),
  kind: z.enum(['verified_fact', 'suspicious_signal', 'unknown']),
  title: z.string(),
  detail: z.string(),
  sourceUrl: z.string().optional(),
  observedAt: z.string(),
  tool: z.string(),
});
export const reportSchema = z.object({
  caseId: caseIdSchema,
  risk: z.enum(['HIGH_RISK', 'SUSPICIOUS', 'LOW_EVIDENCE', 'UNKNOWN']),
  summary: z.string(),
  evidence: z.array(evidenceSchema),
  comparisons: z.array(
    z.object({ submitted: z.string(), verified: z.string(), sourceUrl: z.string().optional() }),
  ),
  injectionDetected: z.boolean(),
  safeNextActions: z.array(z.string()),
  limitations: z.array(z.string()),
  createdAt: z.string(),
});
export type CaseReport = z.infer<typeof reportSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export interface Activity {
  id: string;
  type: string;
  label: string;
  detail: string;
  timestamp: string;
  toolName?: string;
  toolKind?: 'mcp' | 'native';
  success?: boolean;
}
export interface PendingApproval {
  threadId: string;
  toolCallId: string;
  toolName: string;
  arguments: string;
  actionable: boolean;
}
export interface CaseView {
  id: string;
  sessionId: string;
  turnId: string;
  createdAt: string;
  status: 'running' | 'approval_required' | 'complete' | 'error' | 'cancelled';
  activity: Activity[];
  approvals: PendingApproval[];
  report: CaseReport | null;
  exported: boolean;
  sandboxExecuted: boolean;
  error?: string;
}
export interface HealthView {
  harness: boolean;
  mcp: boolean;
  configured: boolean;
  model: string | null;
  sandbox: boolean;
  message: string;
}
