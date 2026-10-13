#!/usr/bin/env bash
# BountyOps demo (~60s). Safe: runs fully mocked, no keys, no funds.
set -e
export GIBWORK_MOCK=true
echo "== 1. validate =="
node dist/cli.js validate -f Bountyfile.yaml
echo; echo "== 2. scan =="
node dist/cli.js scan --dir examples/todo-sample
echo; echo "== 3. plan =="
node dist/cli.js plan -f Bountyfile.yaml
echo; echo "== 4. sync (dry-run, safe) =="
node dist/cli.js sync -f Bountyfile.yaml
echo; echo "== 5. report =="
node dist/cli.js report -f Bountyfile.yaml -o examples/report.md
echo; echo "Demo complete. Artifact: examples/report.md"
