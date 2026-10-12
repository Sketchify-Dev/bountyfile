import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadBountyfile } from "../src/bountyfile.js";

describe("bountyfile", () => {
  it("loads the sample Bountyfile", () => {
    const bf = loadBountyfile("Bountyfile.yaml");
    assert.equal(bf.version, 1);
    assert.ok(bf.bounties.length >= 2);
    assert.ok(bf.bounties.every((b) => b.key && b.title.length >= 8));
  });

  it("rejects missing file with init hint", () => {
    assert.throws(() => loadBountyfile("nope.yaml"), /bountyfile init/);
  });
});
