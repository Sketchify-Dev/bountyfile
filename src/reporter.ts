import type { Plan } from "./types.js";

export function planToMarkdown(plan: Plan): string {
  const lines = [
    `# Bountyfile plan: ${plan.source}`,
    ``,
    `Generated: ${plan.generatedAt}`,
    `Summary: ${plan.summary.create} to create, ${plan.summary.update} to update, ${plan.summary.noop} up to date.`,
    ``,
    `| Action | Key | Title | Detail |`,
    `|---|---|---|---|`,
    ...plan.actions.map((a) => `| ${a.type} | \`${a.key}\` | ${a.title} | ${a.detail} |`),
  ];
  return lines.join("\n") + "\n";
}

export function planToTable(plan: Plan): string {
  const rows = plan.actions.map(
    (a) => `  [${a.type.toUpperCase().padEnd(6)}] ${a.key}: ${a.detail}`,
  );
  return [
    `Plan for ${plan.source} (${plan.generatedAt})`,
    ...rows,
    `Summary: ${plan.summary.create} create, ${plan.summary.update} update, ${plan.summary.noop} noop.`,
  ].join("\n");
}
