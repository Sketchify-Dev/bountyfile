import type { Bountyfile, Plan } from "./types.js";
import type { RemoteTask } from "./client.js";

/** Diff local Bountyfile against remote tasks. Pure + testable. */
export function buildPlan(source: string, local: Bountyfile, remote: RemoteTask[]): Plan {
  const byTitle = new Map(remote.map((t) => [t.title.trim().toLowerCase(), t]));
  const byId = new Map(remote.map((t) => [t.taskId, t]));

  const actions: Plan["actions"] = local.bounties.map((b) => {
    const match = (b.taskId && byId.get(b.taskId)) || byTitle.get(b.title.trim().toLowerCase());
    if (!match) {
      return {
        type: "create" as const,
        key: b.key,
        title: b.title,
        detail: `Will create bounty "${b.title}" (${b.payment.amount} USDC).`,
      };
    }
    const changes: string[] = [];
    if (normalize(match.content) !== normalize(b.content)) changes.push("content");
    if (changes.length === 0) {
      return { type: "noop" as const, key: b.key, title: b.title, detail: `Up to date (${match.taskId}).` };
    }
    return {
      type: "update" as const,
      key: b.key,
      title: b.title,
      detail: `Will update ${match.taskId}: ${changes.join(", ")}.`,
      changes,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    source,
    actions,
    summary: {
      create: actions.filter((a) => a.type === "create").length,
      update: actions.filter((a) => a.type === "update").length,
      noop: actions.filter((a) => a.type === "noop").length,
      skip: 0,
    },
  };
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
