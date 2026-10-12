# bountyfile

**TODOs rot in your repo. bountyfile turns them into funded Gibwork bounties, reviewed in your terminal.**

That is the whole pitch in 10 seconds. One problem, one solution: `Bountyfile.yaml` lives next to your code, `plan` shows exactly what would change before any money moves, and a human approves every funding step with `--yes`. No dashboard, no browser, no surprises.

Built for the [Gibwork Developer Hackathon](https://gib.work/bounty/1052f22d-3f87-4b1d-b0d7-71a60679e7fa): a new non-web-app use case with the Gibwork SDK as the core workflow.

## The real workflow that breaks today

Maintainers collect `TODO` and `FIXME` markers that nobody funds and nobody tracks. Ad-hoc bounty threads drift from what the repo actually needs, and automating payouts feels unsafe, so teams either hand-roll scripts or do nothing.

bountyfile matches Gibwork's unique capability to that exact failure:

- `scan` finds the rot: TODO/FIXME/HACK markers become bounty proposals.
- `validate` + `plan` keep a human in the loop: every change is previewed, nothing funds silently.
- `sync --apply --yes` executes through the official SDK, with funding signed locally.

Existing Gibwork demos are thin list/create wrappers. bountyfile is repo-aware lifecycle management: declarative bounty specs under version control, content diffing, funding gates, and markdown receipts you can paste into PRs.

## Architecture

```
Bountyfile.yaml :> validate :> plan :> sync --apply --yes :> report
     ^              (local)    (diff vs      (SDK writes)      (markdown)
     |                                    Gibwork)
scan --dir . :> proposals.json
```

| Module | File | Role |
|---|---|---|
| Types | `src/types.ts` | `BountySpec`, `Bountyfile`, `Plan` |
| Validation | `src/bountyfile.ts` | YAML parse with actionable errors |
| Scanner | `src/scanner.ts` | TODO/FIXME/HACK to proposals |
| Client | `src/client.ts` | `MockClient` (offline) and `LiveClient` (`@gibwork/sdk`) |
| Planner | `src/planner.ts` | Pure diff: create, update, noop |
| Reporter | `src/reporter.ts` | Markdown plus terminal tables |
| CLI | `src/cli.ts` | `commander` commands, `--json`, `--yes` gates |

**Gibwork integration (core, not optional):** `LiveClient` uses the official [`@gibwork/sdk@0.2.0`](https://www.npmjs.com/package/@gibwork/sdk), `createGibworkClient` from `@gibwork/sdk/node`, wallet-authenticated via `SOLANA_PRIVATE_KEY`. Methods used: `tasks.list`, `tasks.listAvailable`, `tasks.get`, `tasks.create` (prepare, sign, submit), `tasks.update`, `submissions.list`. Docs: [docs.gib.work](https://docs.gib.work/info/how-it-works/for-developers), [API reference](https://gibwork.readme.io/).

## Setup

Requires **Node.js 22 or newer** (SDK requirement).

```bash
nvm use 22
npm install
npm run build
cp .env.example .env
```

| Variable | Meaning |
|---|---|
| `GIBWORK_MOCK=true` | Offline mode: fixtures, no keys, no network (default when no key is set) |
| `SOLANA_PRIVATE_KEY` | Base58 seed/secret or JSON array (32 or 64 bytes). Enables live mode |
| `GIBWORK_PROD=true` | Target production (default: stage) |

Secrets: never hardcoded, never printed. `.env` is gitignored. A missing key falls back to mock mode with a warning, never a silent live call.

## Usage

```bash
node dist/cli.js init --file Bountyfile.yaml
node dist/cli.js validate -f Bountyfile.yaml
node dist/cli.js scan --dir . -o /tmp/proposals.json
node dist/cli.js plan -f Bountyfile.yaml
node dist/cli.js plan -f Bountyfile.yaml -o examples/report.md
node dist/cli.js sync -f Bountyfile.yaml              # dry run, safe
node dist/cli.js sync -f Bountyfile.yaml --apply --yes # executes, funds in live mode
node dist/cli.js browse --limit 15
node dist/cli.js submissions <taskId>
node dist/cli.js report -f Bountyfile.yaml -o examples/report.md
node dist/cli.js plan -f Bountyfile.yaml --json       # machine readable
```

Sample output (`plan`):

```
Plan for Bountyfile.yaml (2026-10-12T09:03:49Z)
  [UPDATE] fix-flaky-auth-test: Will update mock-task-1: content.
  [CREATE] docs-webhook-guide: Will create bounty "Write webhook retry guide" (20.00 USDC).
  [NOOP  ] already-synced-bounty: Up to date (mock-task-9).
Summary: 1 create, 1 update, 1 noop.
```

See [`examples/report.md`](examples/report.md) for a generated artifact and [`examples/sample-output.txt`](examples/sample-output.txt) for a full run.

## Testing

```bash
npm run typecheck
npm run build
npm test
GIBWORK_MOCK=true node dist/cli.js plan -f Bountyfile.yaml
```

Live verification needs `SOLANA_PRIVATE_KEY`; without it the suite runs fully mocked. **Still unverified:** live `tasks.create` funding and `submissions.list` against production. The code path is wired to the real SDK (import verified) but not executed here, to avoid spending funds without explicit approval.

## Limitations

- `tasks.update` covers content, deadline, and verified-only flags (SDK constraint). Reward changes need refund plus recreate.
- Discovery pagination only (`page`/`limit`, max 100). No text search in SDK v0.2.0.
- Mock fixtures are static; live ordering and pagination may differ.

## Demo

```bash
bash demo.sh
```

Record with `asciinema` or any screen recorder. Screenshot the `plan` table plus `examples/report.md`.

## Submission checklist

- [x] Working non-web prototype (`bountyfile` CLI)
- [x] Gibwork SDK as the core workflow (`src/client.ts`)
- [x] README: problem, users, value, architecture, setup, commands, I/O, testing, limits, demo
- [x] Reproducible setup plus offline verification (`GIBWORK_MOCK=true`)
- [x] Sample artifacts (`examples/report.md`, fixtures)
- [x] Demo script (`demo.sh`)
- [ ] Public GitHub repo URL
- [ ] Demo video URL plus screenshots
- [ ] Attend at least 2 hackathon Discord sessions
