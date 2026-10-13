import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderTable, truncate, stripAnsi, supportsUnicode } from "../src/table.js";
import { colorsEnabled, green, json } from "../src/output.js";

describe("table", () => {
  it("renders headers and rows with unicode borders by default", () => {
    const out = renderTable(["Key", "Title"], [["a", "Alpha"]], { unicode: true, width: 80 });
    assert.ok(out.includes("Key") && out.includes("Alpha"));
    assert.ok(out.includes("┌") && out.includes("│") && out.includes("└"));
  });

  it("falls back to ASCII borders", () => {
    const out = renderTable(["Key"], [["a"]], { unicode: false, width: 80 });
    assert.ok(!out.includes("┌"));
    assert.ok(out.includes("+") && out.includes("|"));
  });

  it("truncates long values to fit narrow widths", () => {
    const out = renderTable(["Title"], [["x".repeat(200)]], { unicode: false, width: 40 });
    for (const line of out.split("\n")) {
      assert.ok(line.length <= 40, `line too long (${line.length}): ${line}`);
    }
    assert.ok(out.includes("…"));
  });

  it("keeps colored cells aligned by measuring visible width", () => {
    const out = renderTable(["A", "B"], [[green("hi"), "there"]], { unicode: false, width: 80 });
    const lens = new Set(out.split("\n").map((l) => stripAnsi(l).length));
    assert.equal(lens.size, 1);
  });

  it("renders headers without crashing on empty rows", () => {
    const out = renderTable(["A"], [], { unicode: false, width: 80 });
    assert.ok(out.includes("A"));
  });

  it("truncate handles edge widths", () => {
    assert.equal(truncate("hello", 0), "");
    assert.equal(truncate("hello", 1), "h");
    assert.equal(truncate("hi", 10), "hi");
  });

  it("supportsUnicode honors the ASCII override", () => {
    const prev = process.env.BOUNTYFILE_ASCII;
    process.env.BOUNTYFILE_ASCII = "1";
    assert.equal(supportsUnicode(), false);
    if (prev === undefined) delete process.env.BOUNTYFILE_ASCII;
    else process.env.BOUNTYFILE_ASCII = prev;
  });
});

describe("output safety", () => {
  it("colorsEnabled respects NO_COLOR", () => {
    const prev = process.env.NO_COLOR;
    process.env.NO_COLOR = "1";
    assert.equal(colorsEnabled(), false);
    assert.equal(green("x"), "x");
    if (prev === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = prev;
  });

  it("json() emits parseable JSON with no extra text", () => {
    const lines: string[] = [];
    const orig = console.log;
    console.log = (s: string) => lines.push(s);
    try {
      json({ ok: true, n: 3 });
    } finally {
      console.log = orig;
    }
    assert.equal(lines.length, 1);
    assert.deepEqual(JSON.parse(lines[0]), { ok: true, n: 3 });
  });
});
