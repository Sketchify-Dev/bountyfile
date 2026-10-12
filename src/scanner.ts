import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { ScanHit, ScanProposal } from "./types.js";

const PATTERN = /(TODO|FIXME|HACK)\s*:?\s*(.+)/;
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".next", "coverage"]);
const SCAN_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".py", ".go", ".rs", ".md"]);

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "task";
}

export function scanDir(root: string, dir = root, hits: ScanHit[] = []): ScanHit[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      scanDir(root, full, hits);
    } else if ([...SCAN_EXTS].some((e) => entry.endsWith(e))) {
      const lines = readFileSync(full, "utf8").split("\n");
      lines.forEach((line, i) => {
        const m = PATTERN.exec(line);
        if (m) {
          hits.push({
            file: relative(root, full),
            line: i + 1,
            kind: m[1] as ScanHit["kind"],
            text: m[2].trim().slice(0, 160),
          });
        }
      });
    }
  }
  return hits;
}

export function toProposals(hits: ScanHit[]): ScanProposal[] {
  return hits.slice(0, 50).map((h, i) => {
    const key = `${slugify(h.text)}-${i + 1}`;
    return {
      key,
      title: `${h.kind}: ${h.text.slice(0, 80)}`,
      content: `<p>Resolve <code>${h.kind}</code> in <code>${h.file}:${h.line}</code>: ${escapeHtml(h.text)}. Proof: PR link + test output.</p>`,
      file: h.file,
      line: h.line,
    };
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
