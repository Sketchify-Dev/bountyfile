import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPlan } from "../src/planner.js";
import type { Bountyfile } from "../src/types.js";

const local: Bountyfile = {
  version: 1,
  defaults: {
    payment: { mintAddress: "M", amount: "25.00" },
    minSubmissionAmount: "5.00",
    tags: [],
  },
  bounties: [
    { key: "new-one", title: "Brand new bounty item", content: "<p>fresh content here yes</p>", tags: [], payment: { mintAddress: "M", amount: "10.00" }, minSubmissionAmount: "5.00" },
    { key: "stale-one", title: "Stale bounty item here", content: "<p>new content here yes!!</p>", tags: [], payment: { mintAddress: "M", amount: "10.00" }, minSubmissionAmount: "5.00" },
    { key: "same-one", title: "Same bounty item here", content: "<p>identical</p>", tags: [], payment: { mintAddress: "M", amount: "10.00" }, minSubmissionAmount: "5.00" },
  ],
};

describe("planner", () => {
  it("classifies create/update/noop", () => {
    const plan = buildPlan("test", local, [
      { taskId: "t1", title: "Stale bounty item here", content: "<p>old</p>", status: "open" },
      { taskId: "t2", title: "Same bounty item here", content: "<p>identical</p>", status: "open" },
    ]);
    assert.equal(plan.summary.create, 1);
    assert.equal(plan.summary.update, 1);
    assert.equal(plan.summary.noop, 1);
    assert.equal(plan.actions[0].type, "create");
    assert.deepEqual(plan.actions[1].changes, ["content"]);
  });
});
