// Box-drawing table renderer for human terminal output.
// Pure functions with no dependencies. Never used for --json output,
// which must stay machine-readable. Callers pass plain text; any ANSI
// color is applied before render and ignored when measuring widths.

export interface TableOptions {
  /** Max total width in columns. Defaults to the terminal width. */
  width?: number;
  /** Unicode box drawing vs ASCII fallback. Defaults to terminal support. */
  unicode?: boolean;
}

const MIN_COL = 8;
const MAX_COL = 44;

export function termWidth(): number {
  const c = process.stdout.columns;
  return typeof c === "number" && c > 0 ? c : 100;
}

/** Unicode borders need a capable TTY. Pipes, dumb terms, and Windows get ASCII. */
export function supportsUnicode(): boolean {
  if (process.env.BOUNTYFILE_ASCII === "1") return false;
  if (process.platform === "win32") return false;
  if (process.env.TERM === "dumb") return false;
  return process.stdout.isTTY === true;
}

export function stripAnsi(s: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escapes are the point
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

export function truncate(s: string, max: number): string {
  const t = String(s);
  if (max < 1) return "";
  if (t.length <= max) return t;
  if (max === 1) return t.slice(0, 1);
  return t.slice(0, max - 1) + "…";
}

function widthsFor(headers: string[], rows: string[][], budget: number): number[] {
  const n = headers.length;
  const natural = headers.map((h, i) => {
    let w = stripAnsi(h).length;
    for (const r of rows) w = Math.max(w, stripAnsi(r[i] ?? "").length);
    return Math.min(Math.max(w, MIN_COL), MAX_COL);
  });
  // Overhead: one padding space each side per column, one border per column plus one.
  const total = (ws: number[]) => ws.reduce((a, b) => a + b, 0) + 3 * n + 1;
  const ws = [...natural];
  while (total(ws) > budget) {
    let idx = -1;
    let best = MIN_COL;
    for (let i = 0; i < n; i++) {
      if (ws[i] > best) {
        best = ws[i];
        idx = i;
      }
    }
    if (idx === -1) break;
    ws[idx] -= 1;
  }
  return ws;
}

export function renderTable(headers: string[], rows: string[][], opts: TableOptions = {}): string {
  const unicode = opts.unicode ?? supportsUnicode();
  const budget = Math.min(opts.width ?? termWidth(), 120);
  const n = headers.length;
  const ws = widthsFor(headers, rows, budget);

  const b = unicode
    ? { h: "─", v: "│", tl: "┌", tm: "┬", tr: "┐", ml: "├", mm: "┼", mr: "┤", bl: "└", bm: "┴", br: "┘" }
    : { h: "-", v: "|", tl: "+", tm: "+", tr: "+", ml: "+", mm: "+", mr: "+", bl: "+", bm: "+", br: "+" };

  const rule = (l: string, m: string, r: string) =>
    l + ws.map((w) => b.h.repeat(w + 2)).join(m) + r;
  const row = (cells: string[]) =>
    b.v + cells.map((c, i) => ` ${pad(stripAnsi(c).length <= ws[i] ? c : truncate(stripAnsi(c), ws[i]), ws[i])} `).join(b.v) + b.v;

  const lines = [
    rule(b.tl, b.tm, b.tr),
    row(headers),
    rule(b.ml, b.mm, b.mr),
    ...rows.map((r) => row(r)),
    rule(b.bl, b.bm, b.br),
  ];
  return lines.join("\n");
}

function pad(cell: string, width: number): string {
  const len = stripAnsi(cell).length;
  if (len >= width) return cell;
  return cell + " ".repeat(width - len);
}
