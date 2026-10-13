// Human + machine output helpers.
//
// --json stays pure JSON on stdout: no banners, no color, no chatter.
// Everything else here is human-readable. Diagnostics go to stderr.

/** Color only on a capable TTY that has not opted out via NO_COLOR. */
export function colorsEnabled(): boolean {
  if (process.env.NO_COLOR !== undefined) return false;
  return process.stdout.isTTY === true;
}

function paint(code: string, msg: string): string {
  return colorsEnabled() ? `\x1b[${code}m${msg}\x1b[0m` : msg;
}

export function green(msg: string): string {
  return paint("32", msg);
}

export function yellow(msg: string): string {
  return paint("33", msg);
}

export function red(msg: string): string {
  return paint("31", msg);
}

export function cyan(msg: string): string {
  return paint("36", msg);
}

export function dim(msg: string): string {
  return paint("2", msg);
}

export function bold(msg: string): string {
  return paint("1", msg);
}

export function json(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function info(msg: string): void {
  console.log(msg);
}

/** Compact command header: what is running, plus execution context. */
export function header(command: string, context?: string): void {
  info(context ? `${bold(`bountyfile ${command}`)}  ${dim(context)}` : bold(`bountyfile ${command}`));
}

/** Context-aware next step. Every command ends with one. */
export function nextStep(cmd: string): void {
  info(dim(`Next: ${cmd}`));
}

export function ok(msg: string): void {
  console.log(green(msg));
}

export function warn(msg: string): void {
  console.error(yellow(`warning: ${msg}`));
}

export function fail(msg: string): never {
  console.error(red(`error: ${msg}`));
  process.exit(1);
}

/** Require explicit --yes for financial/irreversible actions. */
export async function requireConfirm(yes: boolean, action: string): Promise<void> {
  if (yes) return;
  fail(
    `${action} refused without confirmation.\nRe-run with --yes to proceed. This protects against accidental funding.`,
  );
}
