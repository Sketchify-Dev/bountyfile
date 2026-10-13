#!/usr/bin/env node
import { Command } from "commander";
import { config as dotenvConfig } from "dotenv";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { loadBountyfile, sampleBountyfile } from "./bountyfile.js";
import { scanDir, toProposals, SKIP_DIRS } from "./scanner.js";
import { buildPlan } from "./planner.js";
import { planToMarkdown, planToTable } from "./reporter.js";
import { renderTable, truncate } from "./table.js";
import { makeClient, type OpsClient } from "./client.js";
import { fail, info, json, ok, requireConfirm, warn, header, nextStep, green, red, dim } from "./output.js";

dotenvConfig();

const program = new Command();
program
  .name("bountyfile")
  .description("Repo-aware bounty lifecycle manager for Gibwork (SDK-native, terminal-first).")
  .version("0.1.0")
  .option("--mock", "use offline mock mode (no network, no keys)", process.env.GIBWORK_MOCK === "true")
  .option("--prod", "target Gibwork production (default: stage)", process.env.GIBWORK_PROD === "true")
  .option("--json", "machine-readable JSON output", false);

type Mode = "mock" | "stage" | "production";

function context(): { client: OpsClient; mode: Mode; modeLabel: string } {
  const opts = program.opts<{ mock: boolean; prod: boolean }>();
  const key = process.env.SOLANA_PRIVATE_KEY ?? process.env.GIBWORK_PRIVATE_KEY;
  const mock = opts.mock || !key;
  if (!opts.mock && !key) {
    warn("No key set (SOLANA_PRIVATE_KEY or GIBWORK_PRIVATE_KEY): falling back to --mock mode. See .env.example for live setup.");
  }
  const mode: Mode = mock ? "mock" : opts.prod ? "production" : "stage";
  const modeLabel = mock ? "mock (offline)" : opts.prod ? "live production" : "live stage";
  return { client: makeClient({ mock, privateKey: key, production: opts.prod }), mode, modeLabel };
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
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
    const existed = existsSync(opts.file);
    writeFileSync(opts.file, sampleBountyfile());
    header("init", opts.file);
    ok(existed ? `Overwrote ${opts.file} with a fresh starter (2 sample bounties).` : `Created ${opts.file} with 2 sample bounties.`);
    nextStep(`bountyfile validate -f ${opts.file}  (then: bountyfile plan -f ${opts.file})`);
  });

program
  .command("validate")
  .description("Validate a Bountyfile locally (no network).")
  .option("-f, --file <path>", "Bountyfile path", "Bountyfile.yaml")
  .action((opts) => {
    let bf;
    try {
      bf = loadBountyfile(opts.file);
    } catch (e) {
      if (program.opts().json) return json({ ok: false, file: opts.file, error: (e as Error).message });
      fail(`FAIL: ${opts.file}\n${(e as Error).message}`);
    }
    if (program.opts().json) return json({ ok: true, file: opts.file, bounties: bf.bounties.length });
    header("validate", opts.file);
    ok(`PASS: ${opts.file} (${bf.bounties.length} bounties, all checks green).`);
    info(
      renderTable(
        ["Key", "Title", "Reward"],
        bf.bounties.map((b) => [truncate(b.key, 28), truncate(b.title, 44), `${b.payment.amount} USDC`]),
      ),
    );
    nextStep(`bountyfile plan -f ${opts.file}  (read-only preview before any funding)`);
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
    header("scan", opts.dir);
    if (proposals.length === 0) {
      ok(`No markers found in ${opts.dir}. Nothing to propose.`);
      info(dim(`Skipped dirs: ${SKIP_DIRS.join(", ")}.`));
      return;
    }
    ok(`Found ${hits.length} markers in ${opts.dir}: ${proposals.length} proposals.`);
    info(
      renderTable(
        ["#", "Type", "Location", "Title"],
        proposals.slice(0, 15).map((p, i) => [
          String(i + 1),
          hits[i]?.kind ?? "?",
          truncate(`${p.file}:${p.line}`, 30),
          truncate(p.title, 48),
        ]),
      ),
    );
    if (proposals.length > 15) info(dim(`Showing 15 of ${proposals.length} proposals.`));
    info(dim(`Skipped dirs: ${SKIP_DIRS.join(", ")}.`));
    if (opts.out) {
      writeFileSync(opts.out, JSON.stringify({ hits, proposals }, null, 2));
      info(`Wrote ${opts.out}`);
    }
    nextStep("copy chosen proposals into Bountyfile.yaml, then run: bountyfile validate -f Bountyfile.yaml");
  });

program
  .command("plan")
  .description("Dry-run: diff Bountyfile against Gibwork (read-only, safe).")
  .option("-f, --file <path>", "Bountyfile path", "Bountyfile.yaml")
  .option("-o, --out <path>", "write plan as markdown report")
  .action(async (opts) => {
    const bf = loadBountyfile(opts.file);
    const { client, modeLabel } = context();
    const remote = await client.listCreated().catch((e) => {
      fail(`Failed to list remote tasks (${client.mode}): ${(e as Error).message}`);
    });
    const plan = buildPlan(opts.file, bf, remote);
    if (program.opts().json) return json(plan);
    header("plan", `${opts.file} · ${modeLabel} · dry run`);
    info(planToTable(plan));
    info(dim("Dry run: no changes made on Gibwork."));
    if (opts.out) {
      writeFileSync(opts.out, planToMarkdown(plan, { mode: modeLabel }));
      info(`Wrote ${opts.out}`);
    }
    nextStep(`bountyfile sync -f ${opts.file} --apply --yes  (only when the table above looks right)`);
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
    const { client, modeLabel } = context();
    const remote = await client.listCreated().catch((e) => {
      fail(`Failed to list remote tasks (${client.mode}): ${(e as Error).message}`);
    });
    const plan = buildPlan(opts.file, bf, remote);
    header("sync", `${opts.file} · ${modeLabel}${opts.apply ? " · APPLY" : " · dry run"}`);
    info(planToTable(plan, { title: `Sync preview for ${opts.file} (${plan.generatedAt})` }));
    if (!opts.apply) {
      info(dim("Dry run only: no changes made. Re-run with --apply --yes to execute."));
      nextStep(`bountyfile sync -f ${opts.file} --apply --yes`);
      return;
    }
    await requireConfirm(opts.yes, `sync --apply (${plan.summary.create} creates, ${plan.summary.update} updates)`);
    const byTitle = new Map(remote.map((t) => [t.title.trim().toLowerCase(), t]));
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    const failed: string[] = [];
    for (const b of bf.bounties) {
      const match = (b.taskId && remote.find((t) => t.taskId === b.taskId)) || byTitle.get(b.title.trim().toLowerCase());
      try {
        if (!match) {
          const r = await client.create(b);
          created += 1;
          info(`${green("created")} ${b.key} -> ${r.taskId}${r.txHash ? ` (tx ${r.txHash})` : ""}`);
        } else if (match.content.replace(/\s+/g, " ").trim() !== b.content.replace(/\s+/g, " ").trim()) {
          await client.update(match.taskId, { content: b.content });
          updated += 1;
          info(`${green("updated")} ${b.key} (${match.taskId})`);
        } else {
          unchanged += 1;
          info(`${dim("noop   ")} ${b.key} (${match.taskId})`);
        }
      } catch (e) {
        failed.push(b.key);
        info(`${red("failed")} ${b.key}: ${(e as Error).message}`);
      }
    }
    info(`Applied: ${created} created, ${updated} updated, ${unchanged} unchanged, ${failed.length} failed.`);
    if (failed.length > 0) {
      fail(`sync incomplete: ${failed.join(", ")}. Re-run to retry what is left (plan is deterministic).`);
    }
    nextStep(`bountyfile report -f ${opts.file} -o examples/report.md  (receipt for the PR)`);
  });

program
  .command("browse")
  .description("List available bounties on Gibwork (discovery).")
  .option("--page <n>", "page", "1")
  .option("--limit <n>", "page size (max 100)", "15")
  .action(async (opts) => {
    const { client, modeLabel } = context();
    const page = Number(opts.page);
    const limit = Math.min(100, Number(opts.limit));
    const tasks = await client.listAvailable(page, limit);
    if (program.opts().json) return json(tasks);
    header("browse", `${modeLabel} · page ${page}`);
    if (tasks.length === 0) {
      info(dim("No bounties on this page."));
      return;
    }
    info(
      renderTable(
        ["Task ID", "Title", "Status"],
        tasks.slice(0, 30).map((t) => [truncate(t.taskId, 22), truncate(t.title, 50), t.status]),
      ),
    );
    info(dim(`Showing ${Math.min(tasks.length, 30)} bounties (page ${page}, limit ${limit}).`));
    nextStep(`bountyfile browse --page ${page + 1} --limit ${limit}  (next page)`);
  });

program
  .command("submissions <taskId>")
  .description("List submissions for a bounty.")
  .action(async (taskId) => {
    const { client, modeLabel } = context();
    const res = await client.listSubmissions(taskId).catch((e) => {
      fail(`Failed to list submissions: ${(e as Error).message}`);
    });
    if (program.opts().json) return json(res);
    header("submissions", `${taskId} · ${modeLabel}`);
    const arr = (Array.isArray(res) ? res : (res as { results?: unknown }).results) as
      | Array<{ id?: string; submissionId?: string; status?: string; content?: string; text?: string }>
      | undefined;
    if (!Array.isArray(arr)) {
      info(JSON.stringify(res, null, 2));
      return;
    }
    if (arr.length === 0) {
      info(dim("No submissions yet."));
      return;
    }
    info(
      renderTable(
        ["Submission", "Status", "Detail"],
        arr.map((s, i) => [
          truncate(String(s.id ?? s.submissionId ?? `#${i + 1}`), 22),
          String(s.status ?? "unknown"),
          truncate(stripHtml(String(s.content ?? s.text ?? "")), 64),
        ]),
      ),
    );
    info(dim(`${arr.length} submission${arr.length === 1 ? "" : "s"}. Review content, then approve or request changes in Gibwork.`));
  });

program
  .command("report")
  .description("Generate a markdown status report (Bountyfile + remote).")
  .option("-f, --file <path>", "Bountyfile path", "Bountyfile.yaml")
  .option("-o, --out <path>", "output markdown path", "examples/report.md")
  .action(async (opts) => {
    const bf = loadBountyfile(opts.file);
    const { client, modeLabel } = context();
    const remote = await client.listCreated();
    const plan = buildPlan(opts.file, bf, remote);
    mkdirSync("examples", { recursive: true });
    writeFileSync(opts.out, planToMarkdown(plan, { mode: modeLabel }));
    header("report", `${opts.file} · ${modeLabel}`);
    ok(`Wrote ${opts.out} (${plan.summary.create} create, ${plan.summary.update} update, ${plan.summary.noop} noop).`);
    nextStep(`paste ${opts.out} into the PR for review`);
  });

program.parseAsync(process.argv).catch((e) => fail((e as Error).message));
