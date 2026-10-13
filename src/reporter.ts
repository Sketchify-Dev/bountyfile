import type { Plan } from "./types.js";
import { renderTable, truncate, type TableOptions } from "./table.js";
import { dim, green, yellow } from "./output.js";

export interface PlanViewOptions extends TableOptions {
  /** First line above the table. Defaults to `Plan for <source>`. */
  title?: string;
  /** Set false for stable uncolored output in tests and pipes. */
  color?: boolean;
}

function actionLabel(type: string, color: boolean): string {
  const label = type.toUpperCase().padEnd(6);
  if (!color) return label;
  if (type === "create") return green(label);
  if (type === "update") return yellow(label);
  return dim(label);
}

/** Exact sum of decimal amount strings (up to 6 places), no float drift. */
export function sumAmounts(amounts: string[]): string {
  let total = 0n;
  for (const a of amounts) {
    const [i, f = ""] = String(a).split(".");
    total += BigInt(i || "0") * 1_000_000n + BigInt((f + "000000").slice(0, 6));
  }
  const int = total / 1_000_000n;
  let frac = (total % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  if (frac.length < 2) frac = frac.padEnd(2, "0");
  return `${int}.${frac}`;
}

/** One-line funding implication for a plan. Updates are content-only. */
export function fundingLine(plan: Plan): string {
  const creates = plan.actions.filter((a) => a.type === "create");
  if (creates.length === 0) return "New funding: none (no creates). Updates are content-only and move no funds.";
  const n = creates.length;
  return `New funding: ${sumAmounts(creates.map((a) => a.amount ?? "0"))} USDC across ${n} new ${n === 1 ? "bounty" : "bounties"}. Updates are content-only and move no funds.`;
}

export function planSummaryLine(plan: Plan): string {
  return `Summary: ${plan.summary.create} create, ${plan.summary.update} update, ${plan.summary.noop} noop.`;
}

/** Terminal table: the pre-funding review surface. Read-only, never implies writes. */
export function planToTable(plan: Plan, opts: PlanViewOptions = {}): string {
  const color = opts.color ?? true;
  const rows = plan.actions.map((a) => [
    actionLabel(a.type, color),
    truncate(a.key, 28),
    truncate(a.title, 44),
    a.amount ? `${a.amount} USDC` : dim("unknown"),
    a.type === "create" ? dim("new") : truncate(a.remoteTaskId ?? "", 18),
  ]);
  const table = renderTable(["Action", "Key", "Title", "Reward", "Remote"], rows, opts);
  return [opts.title ?? `Plan for ${plan.source} (${plan.generatedAt})`, table, planSummaryLine(plan), fundingLine(plan)].join("\n");
}

export function planToMarkdown(plan: Plan, opts: { mode?: string } = {}): string {
  const lines = [
    `# Bountyfile plan: ${plan.source}`,
    ``,
    `Generated: ${plan.generatedAt}`,
    ...(opts.mode ? [`Mode: ${opts.mode}`] : []),
    `${planSummaryLine(plan)} ${fundingLine(plan)}`,
    ``,
    `| Action | Key | Title | Reward | Detail |`,
    `|---|---|---|---|---|`,
    ...plan.actions.map(
      (a) => `| ${a.type} | \`${a.key}\` | ${a.title} | ${a.amount ? `${a.amount} USDC` : "-"} | ${a.detail} |`,
    ),
  ];
  return lines.join("\n") + "\n";
}
