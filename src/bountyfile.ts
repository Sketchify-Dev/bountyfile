import { readFileSync, existsSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import type { Bountyfile, BountySpec } from "./types.js";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export function sampleBountyfile(): string {
  return `version: 1
defaults:
  payment:
    mintAddress: "${USDC_MINT}"
    amount: "25.00"
  minSubmissionAmount: "5.00"
  tags: ["good-first-issue"]
bounties:
  - key: fix-flaky-auth-test
    title: "Fix flaky auth session test"
    content: "<p>Stabilize <code>auth.session.test.ts</code>: retry helper, seed RNG, assert expiry edge cases. Proof: green CI link + diff.</p>"
    tags: ["testing", "typescript"]
    payment:
      mintAddress: "${USDC_MINT}"
      amount: "30.00"
    minSubmissionAmount: "5.00"
  - key: docs-webhook-guide
    title: "Write webhook retry guide"
    content: "<p>Document webhook retries: backoff table, idempotency-key header, replay example with curl.</p>"
    tags: ["docs"]
    payment:
      mintAddress: "${USDC_MINT}"
      amount: "20.00"
    minSubmissionAmount: "5.00"
`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function assertMoney(s: string, field: string): void {
  if (typeof s !== "string" || !/^\d+(\.\d{1,6})?$/.test(s)) {
    throw new Error(`Invalid ${field}: expected decimal string like "25.00", got ${JSON.stringify(s)}`);
  }
}

/** Load + validate a Bountyfile. Throws with actionable message on failure. */
export function loadBountyfile(path: string): Bountyfile {
  if (!existsSync(path)) {
    throw new Error(
      `Bountyfile not found at ${path}.\nRun: bountyfile init --file ${path}`,
    );
  }
  let doc: unknown;
  try {
    doc = parseYaml(readFileSync(path, "utf8"));
  } catch (e) {
    throw new Error(`Failed to parse YAML at ${path}: ${(e as Error).message}`);
  }
  if (!isRecord(doc)) throw new Error(`Invalid Bountyfile at ${path}: top-level must be a mapping.`);
  if (doc.version !== 1) throw new Error(`Unsupported Bountyfile version (expected 1).`);

  const d = doc.defaults as Record<string, unknown> | undefined;
  if (!isRecord(d) || !isRecord(d.payment)) {
    throw new Error(`Invalid Bountyfile: defaults.payment.{mintAddress,amount} is required.`);
  }
  assertMoney(String((d.payment as Record<string, unknown>).amount), "defaults.payment.amount");
  assertMoney(String(d.minSubmissionAmount), "defaults.minSubmissionAmount");

  const raws = (doc.bounties ?? []) as unknown[];
  if (!Array.isArray(raws) || raws.length === 0) {
    throw new Error(`Invalid Bountyfile: bounties must be a non-empty list.`);
  }
  const seen = new Set<string>();
  const bounties: BountySpec[] = raws.map((r, i) => {
    if (!isRecord(r)) throw new Error(`Invalid bounty at index ${i}: must be a mapping.`);
    const key = String(r.key ?? "");
    if (!key || !/^[a-z0-9][a-z0-9-]{1,60}$/.test(key)) {
      throw new Error(`Invalid bounty key at index ${i}: use lowercase slug like "fix-login-bug".`);
    }
    if (seen.has(key)) throw new Error(`Duplicate bounty key: "${key}". Keys must be unique.`);
    seen.add(key);
    const title = String(r.title ?? "");
    if (title.length < 8 || title.length > 140) {
      throw new Error(`Invalid title for "${key}": 8–140 chars required.`);
    }
    const content = String(r.content ?? "");
    if (content.length < 20) {
      throw new Error(`Invalid content for "${key}": describe deliverables + proof (min 20 chars).`);
    }
    const payment = (r.payment ?? d.payment) as Record<string, unknown>;
    assertMoney(String(payment.amount), `${key}.payment.amount`);
    const minSub = String(r.minSubmissionAmount ?? d.minSubmissionAmount);
    assertMoney(minSub, `${key}.minSubmissionAmount`);
    const tags = (r.tags ?? d.tags ?? []) as unknown;
    if (!Array.isArray(tags)) throw new Error(`Invalid tags for "${key}": must be a list.`);
    return {
      key,
      title,
      content,
      tags: tags.map(String),
      payment: {
        mintAddress: String(payment.mintAddress),
        amount: String(payment.amount),
      },
      minSubmissionAmount: minSub,
      deadline: (r.deadline as string | undefined) ?? null,
      allowOnlyVerifiedSubmissions: Boolean(r.allowOnlyVerifiedSubmissions ?? false),
      taskId: (r.taskId as string | undefined) ?? undefined,
    };
  });

  return {
    version: 1,
    defaults: {
      payment: {
        mintAddress: String((d.payment as Record<string, unknown>).mintAddress),
        amount: String((d.payment as Record<string, unknown>).amount),
      },
      minSubmissionAmount: String(d.minSubmissionAmount),
      tags: ((d.tags ?? []) as unknown[]).map(String),
    },
    bounties,
  };
}
