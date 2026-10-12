#!/usr/bin/env node
import { Command } from "commander";
import { config as dotenvConfig } from "dotenv";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { loadBountyfile, sampleBountyfile } from "./bountyfile.js";
import { scanDir, toProposals } from "./scanner.js";
import { buildPlan } from "./planner.js";
import { planToMarkdown, planToTable } from "./reporter.js";
import { makeClient } from "./client.js";
import { fail, info, json, ok, requireConfirm, warn } from "./output.js";

dotenvConfig();

const program = new Command();
program
  .name("bountyfile")
  .description("Repo-aware bounty lifecycle manager for Gibwork (SDK-native, terminal-first).")
  .version("0.1.0")
  .option("--mock", "use offline mock mode (no network, no keys)", process.env.GIBWORK_MOCK === "true")
  .option("--prod", "target Gibwork production (default: stage)", process.env.GIBWORK_PROD === "true")
  .option("--json", "machine-readable JSON output", false);

function clientFromGlobals() {
  const opts = program.opts<{ mock: boolean; prod: boolean }>();
  const key = process.env.SOLANA_PRIVATE_KEY ?? process.env.GIBWORK_PRIVATE_KEY;
  const mock = opts.mock || !key;
  if (!opts.mock && !key) {
    warn("No key set (SOLANA_PRIVATE_KEY or GIBWORK_PRIVATE_KEY): falling back to --mock mode. See .env.example for live setup.");
  }
  return makeClient({
    mock,
    privateKey: key,
    production: opts.prod,
  });
}

program
  .command("init")
  .description("Scaffold a Bountyfile.yaml in the current directory.")
  .option("-f, --file <path>", "output path", "Bountyfile.yaml")
  .option("--force", "overwrite existing file", false)
  .action((opts) => {
    if (existsSync(opts.file) && !opts.force) {
      fail(`${opts.file} already exists. Use --force to overwrite.`);
    }
    writeFileSync(opts.file, sampleBountyfile());
    info(`Wrote ${opts.file}\nNext: bountyfile validate -f ${opts.file}`);
  });

program
  .command("validate")
  .description("Validate a Bountyfile locally (no network).")
  .option("-f, --file <path>", "Bountyfile path", "Bountyfile.yaml")
  .action((opts) => {
    const bf = loadBountyfile(opts.file);
    if (program.opts().json) return json({ ok: true, file: opts.file, bounties: bf.bounties.length });
    ok(`OK: ${opts.file}: ${bf.bounties.length} bounties valid.`);
    for (const b of bf.bounties) info(`  - ${b.key}: "${b.title}" (${b.payment.amount} USDC)`);
  });

program
  .command("scan")
  .description("Scan a repo for TODO/FIXME/HACK markers and propose bounties.")
  .option("--dir <path>", "repo root to scan", ".")
  .option("-o, --out <path>", "write proposals as JSON")
  .action((opts) => {
    const hits = scanDir(opts.dir);
    const proposals = toProposals(hits);
    if (program.opts().json) return json({ dir: opts.dir, hits, proposals });
    info(`Found ${hits.length} markers in ${opts.dir}; ${proposals.length} proposals.`);
    for (const p of proposals.slice(0, 15)) {
      info(`  - ${p.key}: ${p.title} (${p.file}:${p.line})`);
    }
    if (opts.out) {
      writeFileSync(opts.out, JSON.stringify({ hits, proposals }, null, 2));
      info(`Wrote ${opts.out}`);
    }
  });

program
  .command("plan")
  .description("Dry-run: diff Bountyfile against Gibwork (read-only, safe).")
  .option("-f, --file <path>", "Bountyfile path", "Bountyfile.yaml")
  .option("-o, --out <path>", "write plan as markdown report")
  .action(async (opts) => {
    const bf = loadBountyfile(opts.file);
    const client = clientFromGlobals();
    const remote = await client.listCreated().catch((e) => {
      fail(`Failed to list remote tasks (${client.mode}): ${(e as Error).message}`);
    });
    const plan = buildPlan(opts.file, bf, remote);
    if (program.opts().json) return json(plan);
    info(planToTable(plan));
    if (opts.out) {
      writeFileSync(opts.out, planToMarkdown(plan));
      info(`Wrote ${opts.out}`);
    }
  });

program
  .command("sync")
  .description("Create/update bounties on Gibwork. Defaults to --dry-run; use --apply --yes to fund.")
  .option("-f, --file <path>", "Bountyfile path", "Bountyfile.yaml")
  .option("--dry-run", "only show what would happen (default)", true)
  .option("--apply", "perform creates/updates (requires --yes)", false)
  .option("--yes", "explicit confirmation for financial actions", false)
  .action(async (opts) => {
    const bf = loadBountyfile(opts.file);
    const client = clientFromGlobals();
    const remote = await client.listCreated().catch((e) => {
      fail(`Failed to list remote tasks (${client.mode}): ${(e as Error).message}`);
    });
    const plan = buildPlan(opts.file, bf, remote);
    info(planToTable(plan));
    if (!opts.apply) {
      info(`\nDry run only: no changes made. Re-run with --apply --yes to execute.`);
      return;
    }
    await requireConfirm(opts.yes, `sync --apply (${plan.summary.create} creates, ${plan.summary.update} updates)`);
    const byTitle = new Map(remote.map((t) => [t.title.trim().toLowerCase(), t]));
    for (const b of bf.bounties) {
      const match = (b.taskId && remote.find((t) => t.taskId === b.taskId)) || byTitle.get(b.title.trim().toLowerCase());
      if (!match) {
        const r = await client.create(b);
        info(`created ${b.key} -> ${r.taskId}${r.txHash ? ` (tx ${r.txHash})` : ""}`);
      } else if (match.content.replace(/\s+/g, " ").trim() !== b.content.replace(/\s+/g, " ").trim()) {
        await client.update(match.taskId, { content: b.content });
        info(`updated ${b.key} (${match.taskId})`);
      } else {
        info(`noop ${b.key} (${match.taskId})`);
      }
    }
  });

program
  .command("browse")
  .description("List available bounties on Gibwork (discovery).")
  .option("--page <n>", "page", "1")
  .option("--limit <n>", "page size (max 100)", "15")
  .action(async (opts) => {
    const client = clientFromGlobals();
    const tasks = await client.listAvailable(Number(opts.page), Math.min(100, Number(opts.limit)));
    if (program.opts().json) return json(tasks);
    info(`Available bounties (${client.mode}, page ${opts.page}):`);
    for (const t of tasks.slice(0, 30)) info(`  - ${t.taskId}: ${t.title} [${t.status}]`);
  });

program
  .command("submissions <taskId>")
  .description("List submissions for a bounty.")
  .action(async (taskId) => {
    const client = clientFromGlobals();
    const res = await client.listSubmissions(taskId).catch((e) => {
      fail(`Failed to list submissions: ${(e as Error).message}`);
    });
    if (program.opts().json) return json(res);
    info(JSON.stringify(res, null, 2));
  });

program
  .command("report")
  .description("Generate a markdown status report (Bountyfile + remote).")
  .option("-f, --file <path>", "Bountyfile path", "Bountyfile.yaml")
  .option("-o, --out <path>", "output markdown path", "examples/report.md")
  .action(async (opts) => {
    const bf = loadBountyfile(opts.file);
    const client = clientFromGlobals();
    const remote = await client.listCreated();
    const plan = buildPlan(opts.file, bf, remote);
    mkdirSync("examples", { recursive: true });
    writeFileSync(opts.out, planToMarkdown(plan));
    info(`Wrote ${opts.out} (${plan.summary.create} create, ${plan.summary.update} update, ${plan.summary.noop} noop)`);
  });

program.parseAsync(process.argv).catch((e) => fail((e as Error).message));
