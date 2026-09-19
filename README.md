# VerifyFirst

**Evidence before action.** VerifyFirst investigates suspicious messages, links, phone numbers, email senders and claimed organizations together. It collects independent evidence, highlights contradictions, preserves uncertainty and produces an approval-gated report.

The agent runs on **TrueForge 0.2.0** through its official SDK. TrueForge owns model calls, tool routing, native approvals, sandbox execution, durable sessions and traces. There is no separate agent loop or direct model-provider call in VerifyFirst.

## Fastest local setup

Requires **Node.js 22.14+**, npm, internet access and a model-provider key with available credit. Keep this single-user application on localhost.

```bash
git clone https://github.com/zsz13/verifyfirst.git
cd verifyfirst
npm ci
cp .env.example .env
npm run dev
```

Open **http://127.0.0.1:8790 → Settings → Models**, configure a provider, then open **http://127.0.0.1:3000** and click **Reconnect**. Choose **The urgent bank alert**, then investigate. The first configured model is selected unless `TRUEFORGE_MODEL` names another configured model.

`npm run dev` starts TrueForge on 8790, registers the private MCP connector, starts tools on 8791 and the frontend on 3000. Setup generates the MCP token. Provider settings and sessions live outside the checkout in `~/.local/share/verifyfirst/trueforge.sqlite`; case evidence lives in ignored `.data/`.

### Provider and optional environment configuration

No API key is needed to build, test or run offline evaluations. A model provider is required for live investigations. Configure it through TrueForge Settings or set `MODEL_PROVIDER` and `MODEL_API_KEY`, then run `npm run setup` while TrueForge is running. `OPENAI_API_KEY` is also recognized.

To keep provider credentials outside the repository:

```bash
VERIFYFIRST_ENV_FILE=/absolute/path/to/private-provider.env npm run setup
```

The external env file is read at runtime; its contents are not copied into the checkout. TrueForge persists its own private credential record. Never put secrets in source, committed files, reports or build arguments.

Useful settings in [.env.example](.env.example):

- `TRUEFORGE_BASE_URL`: harness API, default `http://127.0.0.1:8790`.
- `TRUEFORGE_MODEL`: exact configured model name; blank selects the first available model.
- `MODEL_PROVIDER` / `MODEL_API_KEY`, or `OPENAI_API_KEY`: optional automated provider setup.
- `VERIFYFIRST_ENV_FILE`: external provider env file, supplied through your shell.
- `VERIFYFIRST_MCP_TOKEN`: generated automatically; authenticates the case-scoped connector.
- `MCP_HOST`, `MCP_PORT`, `VERIFYFIRST_MCP_URL`: localhost defaults; Compose sets its internal service addresses.
- `TRUEFORGE_SANDBOX=auto`: use an available supported sandbox; `false` disables it.
- `DAYTONA_API_KEY`: optional sandbox provider configuration through setup.
- `TRUEFORGE_SUBAGENTS=true`: enable native scoped investigators; `false` uses the coordinator alone.
- `IPQS_API_KEY` or `IPQS_API_KEY_FILE`: optional phone reputation; see below.
- `VERIFYFIRST_DATA_DIR`: optional private case-storage location; defaults to `.data/`.
- `TRUEFORGE_TOKEN`: optional authenticated hosted TrueForge token.

Restart affected services after changing environment configuration.

### Optional IPQualityScore phone reputation

Core investigations work without IPQS. To enrich phone evidence, set `IPQS_API_KEY` in your runtime environment or set `IPQS_API_KEY_FILE` to an external text file containing only the authorized key. Keep that file outside the repository and readable only by the runtime user. The MCP service sends the key in the documented **`IPQS-KEY` header**, never the request URL.

IPQS observations include available validity/activity, fraud score, risky/recent-abuse/spammer flags, VOIP/prepaid status, carrier, line type and country/region. These are attributed third-party signals. Neither one score nor a valid number authenticates a caller or proves fraud. Missing keys, rate limits, invalid responses and service outages preserve local normalization and explicit uncertainty.

See the [official Phone Number Validation API documentation](https://www.ipqualityscore.com/documentation/phone-number-validation-api/overview).

### Sandbox

On supported macOS/Linux hosts, pinned TrueForge 0.2.0 includes a native local sandbox fallback. Availability is probed by TrueForge. Nested OS sandboxes or missing system utilities can prevent it; use a normal terminal or configure **Settings → Sandbox providers → Daytona**. Daytona needs sandbox access and snapshot-creation permission.

The sandbox performs standard-library parsing, hostname inspection and fingerprinting. If unavailable, MCP investigation continues and the UI reports the limitation. No ordinary host execution substitutes for an isolated sandbox, and no OS security control is disabled.

## Docker / Compose

Requires a running Docker engine and **Docker Compose v2+**. The same pinned application image runs the production frontend, MCP server, setup and TrueForge. Ports are published only on localhost; the MCP service stays on the private Compose network.

```bash
git clone https://github.com/zsz13/verifyfirst.git
cd verifyfirst
cp .env.example .env
docker compose up --build -d
docker compose ps
```

Open TrueForge at **http://127.0.0.1:8790**, configure a model, then open VerifyFirst at **http://127.0.0.1:3000** and reconnect. Stop any local processes occupying ports 3000 or 8790 first. You may instead set provider variables in an external Compose env file:

```bash
docker compose --env-file /absolute/path/to/private-runtime.env up --build -d
```

Compose creates a private MCP token automatically. Named volumes preserve cases, approvals, sessions and provider settings across restart. The containers run as a non-root user, drop capabilities and have no Docker socket, privileged mode or source mount. Optional `IPQS_API_KEY_FILE` is mounted read-only only into MCP; it must be readable by container UID 1000. An empty bundled placeholder is used when no file is configured. Never broaden access to a private key just to satisfy container permissions; use `IPQS_API_KEY` runtime injection if needed.

**Sandbox execution inside Docker requires an available TrueForge sandbox provider.** Configure Daytona in Settings for reliable isolated execution. The restrictive container intentionally does not grant privileges to force the host-local sandbox to work. Availability and actual execution remain visible; Docker itself is not claimed as the agent sandbox.

```bash
docker compose logs --tail=80 web mcp setup
docker compose restart web mcp
# Reapply changed model/sandbox environment settings:
docker compose run --rm setup
# Stop services while keeping data:
docker compose down
```

Do not use `down --volumes` unless you intend to delete saved cases and harness credentials. Do not print expanded Compose configuration when a real env file is active: interpolation can contain secrets.

This is a localhost demo topology. For a shared harness, use TrueForge's [official hosted setup](https://trueforge.dev/quickstart) and authentication guidance; this frontend has no multi-user authorization and must not be exposed publicly. The official hosted topology uses Postgres and Redis. This Compose setup retains the project's single-process SQLite integration rather than introducing new infrastructure.

## Investigation and demo flow

1. Choose **The urgent bank alert**, or paste a message. A single detected link fills the editable link field; multiple links appear separately and all are investigated. Up to five distinct links are accepted. Links never open automatically.
2. Add phone, email and a claimed organization together when available. These fields are untrusted claims; supplied contact details never become verified contacts. Use an explicit `+country code` for phone normalization.
3. Investigate. Inspect the risk summary, meaningful signals, contradictions and recommended safe action. Deeper evidence, identity, technical checks and activity remain available without overwhelming the summary.
4. At the native approval pause, refresh to confirm durable recovery. **Allow export** resumes TrueForge and automatically downloads the redacted JSON after completion. **Download again** is the fallback. Open the approved human report and use browser **Print / Save as PDF**.
5. Try the injection sample and ordinary reminder. Embedded instructions must be ignored, while insufficient evidence must remain UNKNOWN/LOW EVIDENCE rather than automatic HIGH RISK.

Export creates a local report; it does not contact a bank, regulator or other third party. Both JSON and printable HTML remain unavailable until approval. Activity shows real timestamps with seconds and measured call-to-result elapsed time, including scheduling and approval waits.

See [demo scenarios](docs/DEMO.md) and [verification procedure](docs/VERIFICATION.md).

## Architecture and capabilities

```text
apps/web/   Next.js + TypeScript investigation UI and local API
apps/mcp/   Eight case-scoped investigation and report tools
agent/      TrueForge SDK integration, policy, reports and session mapping
fixtures/   Three synthetic demo messages
evals/      Offline cases and live TrueForge scenarios
tests/      Tool, evidence, approval, recovery and API tests
scripts/    Local startup, container entrypoints and setup
docs/       Architecture, demo and verification guidance
```

The main TrueForge agent coordinates content analysis, independent sources, sandbox work and report/export. Native identity and link/domain investigators can perform scoped independent checks for multi-signal cases; their activity remains in the TrueForge session trace. They cannot authorize export. The coordinator merges tool-owned observations into one case.

MCP tools:

- `analyze_submission`: extract supplied URLs, organizations, contacts, actions, urgency and known injection patterns.
- `inspect_sender`: investigate original phone/email identities, optional IPQS reputation, email DNS/MX/SPF/DMARC, domain registration and organization mismatch.
- `inspect_domain`: normalize hostnames and inspect punycode/lookalike patterns, DNS and RDAP where available.
- `inspect_url`: inspect bounded public HTTP(S) responses and redirects without JavaScript or cookies.
- `search_trusted_sources`: retrieve matching official pages from a bounded FTC, CFPB and Postal Inspection Service catalog; not unrestricted web search.
- `verify_organization`: independently maintained Chase, Bank of America, Wells Fargo, PayPal and USPS references plus live official contact/security pages.
- `create_case_report`: deterministic risk, comparisons, limitations and recommended actions from recorded evidence.
- `export_case_report`: native approval plus a one-use case/report-bound grant; redacted JSON and a printable HTML representation of the same artifact.

See [architecture and safety decisions](docs/ARCHITECTURE.md). Opening `/` or clicking the logo/Investigate navigation starts a clean investigation. Bookmark the `/?case=<id>` link to reopen a case; refreshing or reconnecting on that link recovers its persisted harness session. Returning home does not cancel or delete the investigation.

## Test and evaluate

```bash
npm ci
npm run check        # lint, typecheck, tests, offline evals, production build
npm run format:check

# Browser navigation regressions; production build from check must exist:
npx playwright install chromium
npm run test:browser

# Services running; network required, no model required:
node --import tsx --env-file=.env scripts/smoke-tools.ts

# Configured model required; consumes provider credit:
npm run eval:live
# Combined message/URLs/phone/email + native subagent acceptance:
npm run eval:signals
```

Offline evaluations exercise real parsing/report/export boundaries without pretending to prove model execution. Live evaluations check actual MCP use, sourced evidence, native approval/denial, injection handling, uncertainty and sandbox execution when available. They deny export automatically; successful approval is exercised through the frontend. Generated case/session data remains ignored.

For a production frontend with local services:

```bash
# Terminal 1
npm run dev:harness
# Terminal 2, after TrueForge starts
npm run setup
npm run dev:mcp
# Terminal 3
npm run build
npm start
```

## Safety and limitations

- All submitted and retrieved content is untrusted data. Injection pattern detection is not exhaustive; case binding, authoritative originals, fixed tool capabilities and approval grants enforce separate boundaries.
- Only public HTTP(S), standard ports and revalidated redirects are inspected. DNS pinning, address filtering, deadlines and byte limits restrict SSRF and resource abuse.
- Facts, suspicious signals and unknowns are labeled separately from conclusions. No SAFE verdict or invented numeric confidence is produced.
- Official domains, HTTPS, domain age, IPQS scores and email DNS records never authenticate a sender. Email-header SPF/DKIM validation and mailbox ownership checks are not performed. Caller ID can be spoofed.
- Unsupported organizations and unavailable sources remain unknown. The organization catalog and reference search are deliberately bounded. IPQS and other external services can be incomplete or wrong.
- Case/session data may contain sensitive input. Use synthetic or redacted data. Export strips common contact patterns and URL queries but is not comprehensive anonymization.
- No accounts or tenant isolation are provided. Keep services on localhost and do not expose them through public tunnels.

Built for [The Agent Harness Hackathon / HackerSquad](https://hackersquad.io/events/truefoundry-agent-harness-hackathon). Official TrueForge references: [quickstart](https://trueforge.dev/quickstart), [SDK](https://trueforge.dev/api/quickstart), [approvals](https://trueforge.dev/api/use-agent), [subagents](https://trueforge.dev/key-features/subagents), [sandbox](https://trueforge.dev/sandbox), [source](https://github.com/truefoundry/trueforge). Installed 0.2.0 types/runtime remain the compatibility reference where documentation differs.
