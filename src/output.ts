const USE_COLOR = process.stdout.isTTY === true && process.env.NO_COLOR === undefined;

function paint(code: string, msg: string): string {
  return USE_COLOR ? `\x1b[${code}m${msg}\x1b[0m` : msg;
}

export function json(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function info(msg: string): void {
  console.log(msg);
}

export function ok(msg: string): void {
  console.log(paint("32", msg));
}

export function warn(msg: string): void {
  console.error(paint("33", `warning: ${msg}`));
}

export function fail(msg: string): never {
  console.error(paint("31", `error: ${msg}`));
  process.exit(1);
}

/** Require explicit --yes for financial/irreversible actions. */
export async function requireConfirm(yes: boolean, action: string): Promise<void> {
  if (yes) return;
  fail(
    `${action} refused without confirmation.\nRe-run with --yes to proceed. This protects against accidental funding.`,
  );
}
