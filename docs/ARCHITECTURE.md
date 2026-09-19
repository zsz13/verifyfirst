# Architecture and safety decisions

One investigation maps to one TrueForge session. Next.js uses the official SDK to create an inline agent and a background turn. TrueForge owns the model/tool loop, pending approvals, native sandbox, and SQLite history. Polling reads actual persisted events; progress is not simulated.

TrueForge stores provider credentials and session history outside the checkout in `~/.local/share/verifyfirst/trueforge.sqlite`; the runtime uses owner-only file permissions.

The original submission, evidence, case/session mapping, approval journal, and export are private files in `.data/cases/<uuid>/`. The browser stores only the case UUID. Reconnect reconciles the latest harness turn. One local application process is the supported deployment.

## Data boundary

The model receives untrusted text and a fixed policy, not authority to change permissions. Each case has a connector with a fixed case header; MCP verifies exact argument equality. Tools read the application-owned original and restrict targets to submitted domains/URLs or maintained official sources.

The public fetcher rejects any nonpublic DNS answer and pins a validated address into the connection with the original TLS hostname. Redirects repeat validation. Byte/deadline limits bound exposure. No page JavaScript, cookies, or credentialed requests run.

Evidence contains tool, timestamp, source where applicable, and verified_fact/suspicious_signal/unknown classification. A verified HTTP observation or catalog mapping is narrow evidence, not sender authentication. The report calculates risk deterministically and never emits SAFE. Model narration cannot replace evidence or classification. External errors remain unknown.

## Approval boundary

TrueForge explicitly gates `export_case_report`. The application resolves the native pending call and verifies connector, tool, and exact case argument. A user decision is recorded per turn. Allow issues a five-minute, single-use grant bound to SHA256 of the reviewed report; export atomically consumes it and verifies the bytes. Denial cannot create a grant.

The export is a local redacted JSON file, not an email, regulator submission, payment, or external action. The application contains no tools for those actions. Pattern redaction is not comprehensive anonymization.

## Sandbox and operations

TrueForge's sandbox performs standard-library parsing/fingerprinting. Pinned 0.2.0 supports a native local fallback as well as documented Daytona. Availability comes from the harness; provision alone is not claimed as execution. No parallel custom shell runner exists.

Isolation and egress remain provider responsibilities. Use a normal supported host or configured Daytona; do not disable protections to force a sandbox. Local mode has no accounts: keep loopback binding and same-origin checks, and do not expose it publicly. Provider credit, external source availability, and host execution remain dependencies.
