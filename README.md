# bountyfile

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org)
[![Gibwork SDK](https://img.shields.io/badge/gibwork-sdk%200.2.0-blue.svg)](https://www.npmjs.com/package/@gibwork/sdk)

**TODOs rot in your repo. bountyfile turns them into funded Gibwork bounties, reviewed in your terminal.**

One problem, one solution: `Bountyfile.yaml` lives next to your code, `plan` shows exactly what would change before any money moves, and a human approves every funding step with `--yes`. No dashboard, no browser, no surprises.

Built for the [Gibwork Developer Hackathon](https://gib.work/bounty/1052f22d-3f87-4b1d-b0d7-71a60679e7fa): a new non-web-app use case with the Gibwork SDK as the core workflow.

## Table of contents

- [Why bountyfile](#why-bountyfile)
- [How it works](#how-it-works)
- [Installation](#installation)
- [Configuration](#configuration)
- [Command reference](#command-reference)
- [The Bountyfile format](#the-bountyfile-format)
- [Safety model](#safety-model)
- [Architecture](#architecture)
- [Testing and verification](#testing-and-verification)
- [Limitations](#limitations)
- [Demo](#demo)
- [License](#license)

## Why bountyfile

Every active repo accumulates `TODO`, `FIXME`, and `HACK` markers. Most of them sit untouched for months because turning a marker into funded, tracked work takes real effort: write the spec, decide the reward, publish the bounty, review submissions, release payment. Maintainers either hand-roll scripts around the Gibwork site or do nothing, and the markers rot.

bountyfile closes that gap from inside the terminal:

1. **Find the work.** `scan` walks your repo and turns code markers into bounty proposals, so the backlog writes itself.
2. **Declare the intent.** `Bountyfile.yaml` records every bounty as versioned data: title, deliverables, reward, tags. Bounties get reviewed like code.
3. **Preview before paying.** `plan` diffs your file against live Gibwork and prints a create/update/noop table. Read-only, always safe.
4. **Fund on purpose.** `sync --apply --yes` executes the plan through the official SDK. Without `--yes`, it refuses. Funding is a deliberate act, never a side effect.
5. **Keep receipts.** `report` writes a markdown table you can paste into PRs or store under `examples/`.

Existing Gibwork tooling covers raw list/create calls. bountyfile is the layer above: repo-aware lifecycle management with declarative specs, content diffing, funding gates, and reviewable artifacts.

## How it works

```
Bountyfile.yaml :> validate :> plan :> sync --apply --yes :> report
     ^              (local)    (diff vs      (SDK writes)      (markdown)
     |                                  Gibwork)
scan --dir . :> proposals.json
```

A typical session:

```bash
node dist/cli.js validate -f Bountyfile.yaml
node dist/cli.js plan -f Bountyfile.yaml
node dist/cli.js sync -f Bountyfile.yaml --apply --yes
node dist/cli.js report -f Bountyfile.yaml -o examples/report.md
```

`plan` output looks like this:

```
Plan for Bountyfile.yaml (2026-10-12T09:26:44Z)
  [UPDATE] fix-flaky-auth-test: Will update mock-task-1: content.
  [CREATE] docs-webhook-guide: Will create bounty "Write webhook retry guide" (20.00 USDC).
  [NOOP  ] already-synced-bounty: Up to date (mock-task-9).
Summary: 1 create, 1 update, 1 noop.
```

## Installation

Requires **Node.js 22 or newer** (a requirement of the Gibwork SDK).

```bash
git clone https://github.com/Sketchify-Dev/bountyfile.git
cd bountyfile
nvm use 22      # any Node >= 22 works
npm install
npm run build
cp .env.example .env
```

Verify the install without any keys or network:

```bash
GIBWORK_MOCK=true node dist/cli.js validate -f Bountyfile.yaml
bash demo.sh
```

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `GIBWORK_MOCK` | `true` when no key is set | `true` runs fully offline against `fixtures/`. No network, no keys, no funds move |
| `SOLANA_PRIVATE_KEY` | unset | Base58 seed/secret or JSON byte array (32 or 64 bytes). Setting it enables live mode |
| `GIBWORK_PROD` | `false` | `false` targets Gibwork stage, `true` targets production |
| `NO_COLOR` | unset | Set to any value to disable colored terminal output |

Global flags:

| Flag | Meaning |
|---|---|
| `--mock` | Force offline mode for one command |
| `--prod` | Target production for one command |
| `--json` | Emit machine-readable JSON instead of human tables |

## Command reference

### `init`

Scaffold a starter `Bountyfile.yaml`.

```bash
node dist/cli.js init --file Bountyfile.yaml
node dist/cli.js init --file Bountyfile.yaml --force   # overwrite
```

### `validate`

Check a Bountyfile locally. No network, exit nonzero with an actionable message on the first problem found.

```bash
node dist/cli.js validate -f Bountyfile.yaml
```

### `scan`

Walk a directory for `TODO`, `FIXME`, and `HACK` markers and print bounty proposals. Skips `node_modules`, `dist`, `.git`, `.next`, and `coverage`.

```bash
node dist/cli.js scan --dir .
node dist/cli.js scan --dir ./src -o /tmp/proposals.json
node dist/cli.js scan --dir . --json
```

### `plan`

Read-only dry run. Diffs the Bountyfile against tasks on Gibwork and prints what would be created, updated, or left alone. This is the command to run before anything that moves money.

```bash
node dist/cli.js plan -f Bountyfile.yaml
node dist/cli.js plan -f Bountyfile.yaml -o examples/report.md
node dist/cli.js plan -f Bountyfile.yaml --json
```

Matching logic: a local bounty matches a remote task by `taskId` when recorded, otherwise by exact title (case-insensitive). Content is compared whitespace-insensitively; a difference yields an `update` limited to the changed fields.

### `sync`

Execute the plan. Without `--apply` it behaves exactly like `plan` and changes nothing. With `--apply`, it still refuses unless `--yes` is also passed, so funding always takes two deliberate flags.

```bash
node dist/cli.js sync -f Bountyfile.yaml                 # dry run, safe
node dist/cli.js sync -f Bountyfile.yaml --apply --yes   # executes
```

In live mode, creates run the full prepare, sign, and submit sequence inside the SDK, with transactions signed locally by your key. Nothing is submitted without `--yes`.

### `browse`

List bounties available for discovery on Gibwork.

```bash
node dist/cli.js browse --limit 15
node dist/cli.js browse --page 2 --limit 50   # max 100
```

### `submissions`

List submissions for one bounty, for triage and review.

```bash
node dist/cli.js submissions <taskId>
node dist/cli.js submissions <taskId> --json
```

### `report`

Write the current plan as a markdown table for PRs and records.

```bash
node dist/cli.js report -f Bountyfile.yaml -o examples/report.md
```

## The Bountyfile format

Version `1`. Top-level `defaults` fill in anything a bounty omits.

```yaml
version: 1
defaults:
  payment:
    mintAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"  # USDC
    amount: "25.00"
  minSubmissionAmount: "5.00"
  tags: ["good-first-issue"]
bounties:
  - key: fix-flaky-auth-test            # unique lowercase slug
    title: "Fix flaky auth session test" # 8 to 140 chars
    content: "<p>Deliverables plus proof (min 20 chars).</p>"
    tags: ["testing", "typescript"]
    payment:
      mintAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
      amount: "30.00"
    minSubmissionAmount: "5.00"
    deadline: null
    allowOnlyVerifiedSubmissions: false
    taskId: "abc123"                    # filled in after first sync
```

Validation rules: keys must be unique lowercase slugs, titles 8 to 140 chars, content at least 20 chars describing deliverables and proof, amounts decimal strings like `"25.00"`. Every violation prints which bounty and field failed and how to fix it.

## Safety model

- **Dry run by default.** `plan` and bare `sync` never write. Funding needs `--apply --yes` together.
- **Secrets stay secret.** Keys come only from the environment, never from files that get committed. `.env` is gitignored. Keys are never printed, including in `--json` output and error messages.
- **Missing key degrades safely.** Without `SOLANA_PRIVATE_KEY`, the CLI warns and runs in mock mode instead of failing halfway or guessing at live calls.
- **Interrupted runs are resumable.** `plan` is deterministic from file plus remote state, so re-running after a failure simply shows what is left.

## Architecture

| Module | File | Role |
|---|---|---|
| Types | `src/types.ts` | `BountySpec`, `Bountyfile`, `Plan`, scan types |
| Validation | `src/bountyfile.ts` | YAML parse plus rule checking |
| Scanner | `src/scanner.ts` | Marker search plus proposal shaping |
| Client | `src/client.ts` | `MockClient` (offline fixtures) and `LiveClient` (official SDK wrapper) |
| Planner | `src/planner.ts` | Pure diff: create, update, noop. Fully unit tested |
| Reporter | `src/reporter.ts` | Markdown and terminal rendering |
| CLI | `src/cli.ts` | `commander` wiring, flags, confirmation gates |
| Output | `src/output.ts` | Human tables, JSON mode, TTY-aware color |

**Gibwork integration:** `LiveClient` uses [`@gibwork/sdk@0.2.0`](https://www.npmjs.com/package/@gibwork/sdk) via `createGibworkClient` from `@gibwork/sdk/node`, wallet-authenticated with `SOLANA_PRIVATE_KEY`. Methods used: `tasks.list`, `tasks.listAvailable`, `tasks.get`, `tasks.create`, `tasks.update`, `submissions.list`. References: [developer docs](https://docs.gib.work/info/how-it-works/for-developers), [API reference](https://gibwork.readme.io/).

## Testing and verification

```bash
npm run typecheck   # tsc --noEmit
npm run build       # tsc into dist/
npm test            # node:test over tests/
```

Covered: Bountyfile loading and rejection paths (`tests/bountyfile.test.ts`), plan classification into create/update/noop (`tests/planner.test.ts`), marker scanning and proposal shaping (`tests/scanner.test.ts`). The demo script exercises the whole mock workflow end to end.

Live verification status: the SDK import and client wiring are verified in this repo, but no live funding transaction has been executed here, deliberately, to avoid moving real funds during development. Run `browse` and `plan` with a key set to verify read paths before any funded `sync`.

## Limitations

- `tasks.update` covers content, deadline, and verified-only flags (an SDK constraint). Changing a reward means refund plus recreate.
- Discovery supports pagination only (`page`/`limit`, max 100). The SDK exposes no text search in v0.2.0.
- Mock fixtures are static snapshots; live ordering and pagination may differ.
- Solana signing requires Node 22 or newer and a valid key; stage versus production is client-wide.

## Demo

```bash
bash demo.sh
```

Runs validate, scan, plan, a safe dry-run sync, and report generation against mock data in about a minute. Full transcript: [`examples/sample-output.txt`](examples/sample-output.txt). Generated artifact: [`examples/report.md`](examples/report.md).

## License

MIT. See [LICENSE](LICENSE).
