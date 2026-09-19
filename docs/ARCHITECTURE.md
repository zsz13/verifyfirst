# Architecture and safety decisions

One investigation maps to one TrueForge session. Next.js uses the official SDK to create an inline agent and a background turn. TrueForge owns the model/tool loop, pending approvals, native sandbox, and SQLite history. Polling reads actual persisted events; progress is not simulated.

TrueForge stores provider credentials and session history outside the checkout in `~/.local/share/verifyfirst/trueforge.sqlite`; the runtime uses owner-only file permissions.

The original submission, evidence, case/session mapping, approval journal, and export are private files in `.data/cases/<uuid>/`. The browser stores the case UUID; sessionStorage can also hold a case UUID requesting a post-approval automatic download. Neither is authorization. Reconnect reconciles the latest harness turn. One local application process is the supported deployment.

## Data boundary

The model receives untrusted text and a fixed policy, not authority to change permissions. Each case has a connector with a fixed case header; MCP verifies exact argument equality. Tools read the application-owned original and restrict targets to submitted domains/URLs or maintained official sources.

The public fetcher rejects any nonpublic DNS answer and pins a validated address into the connection with the original TLS hostname. Redirects repeat validation. Byte/deadline limits bound exposure. No page JavaScript, cookies, or credentialed requests run.

Evidence contains tool, timestamp, source where applicable, and verified_fact/suspicious_signal/unknown classification. A verified HTTP observation or catalog mapping is narrow evidence, not sender authentication. The report calculates risk deterministically and never emits SAFE. Model narration cannot replace evidence or classification. External errors remain unknown.

## Approval boundary

TrueForge explicitly gates `export_case_report`. The application resolves the native pending call and verifies connector, tool, and exact case argument. A user decision is recorded per turn. Allow issues a five-minute, single-use grant bound to SHA256 of the reviewed report; export atomically consumes it and verifies the bytes. Denial cannot create a grant.

The export is a local redacted JSON file with an HTML/print representation generated from those same approved bytes, not an email, regulator submission, payment, or external action. The application contains no tools for those actions. Pattern redaction is not comprehensive anonymization.

## Sandbox and operations

TrueForge's sandbox performs standard-library parsing/fingerprinting. Pinned 0.2.0 supports a native local fallback as well as documented Daytona. Availability comes from the harness; provision alone is not claimed as execution. No parallel custom shell runner exists.

Isolation and egress remain provider responsibilities. Use a normal supported host or configured Daytona; do not disable protections to force a sandbox. Local mode has no accounts: keep loopback binding and same-origin checks, and do not expose it publicly. Provider credit, external source availability, and host execution remain dependencies.

## Product refinements

A shared browser-safe parser extracts all pasted HTTP(S) links without fetching. The API rejects more than five distinct links before creating a harness session. The exposed MCP report tool requires an attempted inspection for every original URL; unavailable or blocked fetches count as honest attempts. The lower-level report builder can describe partial evidence for offline evaluation without claiming execution. Original text remains authoritative even if the supplemental URL field is edited. Sender is another untrusted original field, limited to 320 characters. `inspect_sender` accepts only caseId; model-supplied sender replacements are rejected.

Phone normalization uses maintained libphonenumber-js numbering metadata with an explicit international prefix. It never guesses a country or treats a valid format as identity verification. Email lookups use bounded DNS resolution and existing domain/RDAP checks, retain only domain-level evidence, and distinguish record presence from authentication. Reputation intelligence is not configured.

The printable report escapes every dynamic value, restricts source links to HTTP(S) without embedded credentials, applies a restrictive Content-Security-Policy, and performs no external retrieval. It contains the approved redacted evidence and an observation timeline, not raw harness output or original messages. Export approval still authorizes the same local evidence artifact.

Activity durations subtract actual model-call and result event timestamps. They include scheduling and human pauses; missing or invalid timing is omitted. Trace identities and native approval matching remain unchanged.
