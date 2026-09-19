# Verification record

Deterministic checks, live MCP checks, and model-backed acceptance are separate evidence.

## Performed

- Twelve offline synthetic cases passed: injection patterns, structural mismatch, uncertainty, benign cases, and blocked ungranted exports.
- MCP tests cover private-network rejection, DNS pinning/redirects, bounded responses, original input, case scope, evidence rules, grant replay/concurrency/hash binding, and redaction.
- Real HTTP MCP smoke discovered seven tools and executed extraction, domain/URL inspection, organization verification, trusted-source retrieval, and report creation. Ungranted export was rejected. Official Chase, CFPB, and FTC pages were retrieved live; reserved demo-domain DNS/RDAP results honestly remained unknown.
- TrueForge 0.2.0 started with SQLite and the investigation connector. The native local sandbox support probe succeeded outside a nested OS sandbox.
- Lint, typecheck, production build, 71 boundary/recovery/HTTP tests, and 12 offline eval cases passed after the review fixes. Production dependency audit reported zero advisories.
- Desktop 1280×900 and mobile 375×812 empty/setup states were independently inspected; keyboard focus and no horizontal clipping were observed.

## Not yet established

The first live model attempt reached the provider but returned HTTP 401. Therefore a completed model-driven investigation, native approval pause/resumption, successful UI-approved export, all three live demos, and meaningful sandbox execution are **not yet established** by the evidence above. The failed real session was restored successfully in the frontend, including its native MCP initialization and error events, after navigation/refresh.

Configure a provider, run `npm run eval:live`, then complete the approval flow in the frontend. Live session IDs are stored in ignored `.data/live-eval-summary.json`. Update this section only after actual runs.

```bash
npm ci
npm run check
npm run format:check
npm run dev
# Configure a model in TrueForge Settings.
npm run eval:live
```

Offline tests and support probes do not substitute for live harness execution.
