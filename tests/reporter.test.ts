import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPlan } from "../src/planner.js";
import { planToTable, planToMarkdown, sumAmounts, fundingLine } from "../src/reporter.js";
import { stripAnsi } from "../src/table.js";
import type { Bountyfile } from "../src/types.js";

const local: Bountyfile = {
  version: 1,
  defaults: {
    payment: { mintAddress: "M", amount: "25.00" },
    minSubmissionAmount: "5.00",
    tags: [],
  },
  bounties: [
    { key: "new-one", title: "Brand new bounty item", content: "<p>fresh content here yes</p>", tags: [], payment: { mintAddress: "M", amount: "20.00" }, minSubmissionAmount: "5.00" },
    { key: "stale-one", title: "Stale bounty item here", content: "<p>new content here yes!!</p>", tags: [], payment: { mintAddress: "M", amount: "10.00" }, minSubmissionAmount: "5.00" },
    { key: "same-one", title: "Same bounty item here", content: "<p>identical</p>", tags: [], payment: { mintAddress: "M", amount: "25.00" }, minSubmissionAmount: "5.00" },
  ],
};

const remote = [
  { taskId: "t1", title: "Stale bounty item here", content: "<p>old</p>", status: "open" },
  { taskId: "t2", title: "Same bounty item here", content: "<p>identical</p>", status: "open" },
];

describe("reporter", () => {
  it("sums decimal amounts exactly", () => {
    assert.equal(sumAmounts(["20.00", "10.5"]), "30.50");
    assert.equal(sumAmounts([]), "0.00");
    assert.equal(sumAmounts(["0.000001", "0.000002"]), "0.000003");
  });

  it("plan table shows actions, rewards, remotes, and funding total", () => {
    const plan = buildPlan("Bountyfile.yaml", local, remote);
    assert.equal(plan.actions[0].amount, "20.00");
    assert.equal(plan.actions[1].remoteTaskId, "t1");
    const out = stripAnsi(planToTable(plan, { unicode: false, width: 100, color: false }));
    assert.ok(out.includes("CREATE") && out.includes("UPDATE") && out.includes("NOOP"));
    assert.ok(out.includes("20.00 USDC"));
    assert.ok(out.includes("t1"));
    assert.ok(out.includes("New funding: 20.00 USDC across 1 new bounty"));
  });

  it("funding line reports none when there are no creates", () => {
    const plan = buildPlan("f", { ...local, bounties: local.bounties.slice(1) }, remote);
    assert.ok(fundingLine(plan).startsWith("New funding: none"));
  });

  it("markdown report carries mode, reward column, and funding", () => {
    const plan = buildPlan("Bountyfile.yaml", local, remote);
    const md = planToMarkdown(plan, { mode: "mock (offline)" });
    assert.ok(md.includes("Mode: mock (offline)"));
    assert.ok(md.includes("| Reward |"));
    assert.ok(md.includes("New funding: 20.00 USDC"));
  });
});
