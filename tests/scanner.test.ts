import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { scanDir, toProposals } from "../src/scanner.js";

describe("scanner", () => {
  it("finds TODO markers and proposes keys", () => {
    rmSync("tests/tmp-scan", { recursive: true, force: true });
    mkdirSync("tests/tmp-scan", { recursive: true });
    writeFileSync("tests/tmp-scan/a.ts", "// TODO: fix retry backoff\nconst x = 1;\n// FIXME: handle empty queue\n");
    const hits = scanDir("tests/tmp-scan");
    assert.equal(hits.length, 2);
    const props = toProposals(hits);
    assert.equal(props.length, 2);
    assert.ok(props[0].key.length > 2);
    rmSync("tests/tmp-scan", { recursive: true, force: true });
  });
});
