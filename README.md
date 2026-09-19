# VerifyFirst

**Evidence before action.** Paste a suspicious message, URL, or sender identity. VerifyFirst investigates domains, retrieves independent official sources, preserves uncertainty, and creates a case report. Export pauses at a native TrueForge human-approval gate.

The model runs on **TrueForge 0.2.0**. There is no separate agent loop and no direct model-provider call in VerifyFirst.

## Run locally

Requires Node.js **22.14+**, npm, internet access, and a model-provider API key with available credit. Keep this single-user application on localhost.

```bash
git clone https://github.com/zsz13/verifyfirst.git
cd verifyfirst
npm ci
cp .env.example .env
npm run dev
```

This starts TrueForge at **http://127.0.0.1:8790**, registers the private MCP connector, starts tools on **8791**, and starts VerifyFirst at **http://127.0.0.1:3000**.

1. Open TrueForge. In **Settings → Models**, configure a provider and its API key.
2. Return to VerifyFirst and click **Reconnect**. The first configured model is selected unless `TRUEFORGE_MODEL` specifies an exact configured model name.
3. Choose **The urgent bank alert**, then **Investigate message**.

Keep keys in TrueForge Settings or ignored `.env`, never chat, commits, screenshots, or recordings. Setup generates a private MCP token. TrueForge stores provider configuration and sessions outside the checkout, in `~/.local/share/verifyfirst/trueforge.sqlite` with owner-only access.

For environment-based setup, set `MODEL_PROVIDER` to a TrueForge catalog provider type and `MODEL_API_KEY` in `.env`, then run `npm run setup` while TrueForge runs. Restart the web service after changing `.env`.

To keep a provider key outside the repository, set `VERIFYFIRST_ENV_FILE` in your shell to that external env file and run `npm run setup`. `OPENAI_API_KEY` is recognized automatically. The file is read only for local runtime configuration; its contents are not copied into the repository. TrueForge keeps its own local credential record outside the checkout in `~/.local/share/verifyfirst/`.

### Sandbox

`TRUEFORGE_SANDBOX=auto` enables sandbox execution only when TrueForge reports availability. The pinned 0.2.0 runtime includes a native local fallback on supported macOS/Linux hosts. Its probe may fail inside another OS sandbox or without required system utilities; run from a normal terminal in that case. Do not substitute ordinary host execution or disable OS protections.

Alternatively configure **Settings → Sandbox providers → Daytona**, or set `DAYTONA_API_KEY` and rerun setup. The key needs sandbox access and snapshot-creation permission. If no sandbox is available, MCP investigation continues and the UI does not claim execution. The sandbox task uses Python's standard library to parse input, normalize hostnames, and calculate a fingerprint.

### Separate processes and production build

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

Stop the web development server before switching to production mode. The production web server still needs TrueForge and MCP. `npm run dev:web` starts only the development frontend. This is not an internet-facing or multi-user deployment.

## Investigation experience

- Pasted HTTP(S) links are detected without opening them. A single link fills the editable link field; multiple links are listed and included in the investigation. Removing the extra link field does not remove a URL still present in the original message. Cases accept up to five distinct links; larger submissions must be split rather than silently truncated.
- Optional **Sender** accepts an email address or phone number. Use an explicit `+country code` for phone normalization; no country is guessed for national numbers. Numbering-plan country/type can differ from the caller’s current location or carrier. Caller ID can be spoofed. Email record presence does not prove successful message authentication.
- **Allow export** resumes the native TrueForge approval. Once the export exists, JSON downloads automatically, with **Download again** as a fallback. The print-friendly report uses the same approved, redacted artifact; open it and choose browser **Print / Save as PDF**. No unapproved report can be downloaded in either format.
- Activity shows seconds and measured call-to-result elapsed time. Elapsed time includes harness scheduling and approval waits; it is not CPU or exclusive tool execution time.
- **How it works** explains evidence and limitations. **Stay safe** links to independent FTC and FBI/IC3 advice. The original evidence/check mark is provided locally as SVG and used in the UI, favicon, and report.

No paid enrichment service is needed. Phone reputation, live carrier/ownership lookup, full email-header authentication, and URL threat-intelligence providers are deliberately deferred; core checks remain functional without them.

## Three-minute demo

1. **0:00–0:25:** Select the urgent bank alert. Show the request to move money and the supplied contact details. Samples are synthetic; reserved `.example` hosts deliberately do not resolve.
2. **0:25–1:25:** Investigate. Show TrueForge's tool activity: extraction, DNS/RDAP, URL inspection, organization verification, trusted references, report creation, and native sandbox execution when available.
3. **1:25–2:10:** Inspect the domain comparison, sourced evidence, unknown observations, and separate conclusion. Failed DNS alone does not prove fraud.
4. **2:10–2:40:** **Film the pause.** Refresh while the native approval card is visible. Approve export and let the redacted JSON download automatically after the continuation succeeds. Open the print-friendly evidence report and use your browser’s Print / Save as PDF. Export contacts no bank, regulator, or third party.
5. **2:40–3:00:** Show separate completed runs for the injection sample and ordinary reminder. The former must flag embedded instructions; the latter must retain UNKNOWN/LOW EVIDENCE rather than automatic HIGH RISK.

See [demo notes](docs/DEMO.md).

## Architecture

```text
apps/web/   Next.js + TypeScript workbench and local API
apps/mcp/   Eight MCP tools, protected HTTP retrieval, evidence store
agent/      TrueForge SDK integration, policy, durable session mapping
fixtures/   Three synthetic demo messages
evals/      Twelve offline cases and three model-backed scenarios
tests/      Network, evidence, approval, and recovery boundary tests
scripts/    Startup, setup, and live MCP smoke check
docs/       Architecture, demo, and verification notes
```

TrueForge owns model calls, tool routing, approval state, sandbox provisioning, and session history. The frontend starts a background turn and reads durable events; closing or refreshing the page does not cancel execution. LocalStorage contains only a case UUID. The application stores original input, evidence, and case/session mapping privately on disk. A tab-scoped case ID records a requested automatic download; it never grants export permission.

Each case gets a connector with a fixed case header. Tool arguments cannot switch cases. The stored original cannot be replaced by the model. Reports and risk labels are computed from tool-owned observations, not accepted from generated model JSON.

Tools:

- `analyze_submission`: extracts URLs, domains, organizations, contacts, requested actions, urgency, and known injection patterns.
- `inspect_sender`: original sender only; international phone normalization/numbering metadata or email DNS/MX/SPF/DMARC, registration and independent organization comparison. Identity and reputation remain unverified.
- `inspect_domain`: normalization, punycode/brand indicators, real DNS and RDAP registration information when available.
- `inspect_url`: bounded public HTTP(S) inspection, pinned DNS, revalidated redirects, no JavaScript or cookies.
- `search_trusted_sources`: searches a **bounded curated catalog** and retrieves matching FTC, CFPB, and Postal Inspection Service pages live; not unrestricted web search.
- `verify_organization`: independently maintained Chase, Bank of America, Wells Fargo, PayPal, and USPS references; live official contact/security pages.
- `create_case_report`: recorded evidence, comparisons, classification, limitations, and safer next actions.
- `export_case_report`: native approval plus a single-use application grant bound to the report hash; redacted local JSON export; the approved artifact also renders as a print-friendly HTML report.

## Verify

```bash
npm run check        # lint, typecheck, tests, 12 offline evals, production build
npm run format:check

# Services running; real network, no model required:
node --import tsx --env-file=.env scripts/smoke-tools.ts

# Configured model required; consumes provider credit:
npm run eval:live
```

Offline evals exercise real parsing/report/export code with honestly unavailable external evidence. They do not fabricate web results or prove model execution. Live evals require three distinct successful MCP tools, native approval pauses, sourced evidence, injection handling, uncertainty, completed denial continuations, and actual execution when a sandbox is available. They **do not automatically approve exports**; exercise successful approval through the frontend.

Live session IDs/results stay in ignored `.data/`. [Verification notes](docs/VERIFICATION.md) separate deterministic checks, live scenarios, and browser verification.

## Boundaries

- All submitted/retrieved content is untrusted data. Pattern detection is not a guarantee that every injection is recognized. Fixed tool capabilities, authoritative originals, case binding, and export grants enforce boundaries independently of model behavior.
- Public HTTP(S), standard ports only. Localhost, private/reserved addresses, IP literals, credentials in URLs, unsafe redirects, mixed DNS answers, and unsupported protocols are rejected. Deadlines, byte limits, and redirect limits bound requests.
- A known official domain does not authenticate the sender. Age, DNS, and HTTPS never establish safety. Unsupported organizations and unavailable sources stay unknown. General reference pages do not prove an individual sender's identity or intent.
- Submitted phone numbers never become trusted contacts. Use independently sourced official pages or contact details you already know.
- Sandbox isolation and egress are provided by the configured TrueForge provider. The requested parsing step is network-free; retain provider isolation controls. Model/MCP credentials are not intentionally placed in the sandbox.
- Sessions and reports can contain sensitive input. Use synthetic/redacted data for the demo. Export removes common phone/email patterns and URL queries but is not comprehensive anonymization. It remains local unless the user shares it.
- There are no accounts or tenant boundaries. Do not publicly expose these local services or put them behind a tunnel.

## Hackathon sources

The supplied **“BRIEF: TrueForge challenge for the Agent Harness Hackathon”** is the primary requirements source: finish one real job, show harness work, publish a runnable repository, and film an approximately three-minute demo with the pause/sandbox step.

Official references: [quickstart](https://trueforge.dev/quickstart), [SDK](https://trueforge.dev/api/quickstart), [turns and approvals](https://trueforge.dev/api/use-agent), [agent configuration](https://trueforge.dev/create-agent/overview), [sandbox](https://trueforge.dev/sandbox), and [source](https://github.com/truefoundry/trueforge). Installed 0.2.0 types/runtime are the compatibility reference where documentation lags.
