# Verification guide

Deterministic checks, live external tools and model-backed acceptance prove different properties. Use each at the appropriate boundary.

## Deterministic checks

```bash
npm ci
npm run check
npm run format:check
```

`check` runs lint, TypeScript, the test suite, offline evaluations and production build. Tests cover original-input/case binding, SSRF and redirect handling, bounded responses, evidence classification, sender/IPQS parsing and failure behavior, approval grants, export redaction and refresh recovery. Offline cases exercise uncertainty, injection signals, mismatch and denied exports without fabricating network observations.

GitHub CI installs from the lockfile and runs the same quality gates on a clean checkout. A green offline run alone does not establish working model credentials or external services.

## Live harness acceptance

```bash
npm run dev
# Configure a model in TrueForge Settings, then in another terminal:
npm run eval:live
npm run eval:signals
```

Live runs consume model-provider credit. The three scenarios must show:

- Bank alert: HIGH RISK with independent sources and organization/domain contradictions.
- Embedded injection: detected/ignored instructions, real investigation and SUSPICIOUS or HIGH RISK.
- Ordinary reminder: retained uncertainty, not automatic HIGH RISK.
- Actual successful MCP calls, a native human-approval pause and completed denial without export.
- Actual sandbox execution when TrueForge reports availability; unavailable sandbox is a limitation, not a simulated success.

Run output and session IDs are saved in ignored `.data/`. Inspect the TrueForge session to distinguish coordinator tools, subagents, sandbox calls and returned results.

## Optional IPQS acceptance

Configure `IPQS_API_KEY_FILE` with an external authorized key file and restart MCP. Investigate an authorized international phone number alongside message, URLs, email and organization claims. Confirm attributed provider signals appear in identity evidence and that no score is treated as proof. Never display the key or dump requests/environment configuration. Automated tests cover unconfigured, malformed, timeout and provider-failure responses; service availability still requires a live check.

## Browser acceptance

- Submit one detected URL, multiple URLs, and all identity fields together. Links must remain inert until explicit user navigation.
- Inspect risk, summary, evidence count, contradictions and safe actions at desktop and mobile widths. Verify keyboard focus and tab/section navigation.
- Refresh at the native approval pause and confirm the same pending action/arguments return.
- Before approval, JSON and human-report routes must reject access. After approval, confirm the automatic download and Download again fallback.
- Open the approved human report, inspect sources and redaction, and preview Print / Save as PDF.
- Reopen a completed case and inspect persisted trace timestamps/durations.

## Container acceptance

```bash
# Does not interpolate runtime secrets into output:
docker compose --env-file /dev/null config --quiet
docker compose --env-file /dev/null build
docker compose up -d
docker compose ps
```

Then follow the same browser/live checks. Confirm cases and pending approvals survive restart. A syntax-valid Compose file is not equivalent to a successful image build or running engine. Docker sandbox availability must be verified independently; configure Daytona rather than granting container privileges. Stop services with `docker compose down` to retain volumes.
