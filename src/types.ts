// Core domain types for bountyfile. Bountyfile.yaml is the source of truth.

export interface BountyPayment {
  mintAddress: string;
  amount: string; // decimal string, e.g. "25.00"
}

export interface BountySpec {
  /** Local stable key, e.g. "fix-flaky-auth-test". Used to match remote tasks. */
  key: string;
  title: string;
  /** HTML content for Gibwork (we accept markdown and convert lightly). */
  content: string;
  tags: string[];
  payment: BountyPayment;
  minSubmissionAmount: string;
  deadline?: string | null;
  allowOnlyVerifiedSubmissions?: boolean;
  /** Remote task id once synced; absent = not yet created. */
  taskId?: string;
}

export interface Bountyfile {
  version: 1;
  defaults: {
    payment: BountyPayment;
    minSubmissionAmount: string;
    tags: string[];
  };
  bounties: BountySpec[];
}

export type PlanActionType = "create" | "update" | "noop" | "skip";

export interface PlanAction {
  type: PlanActionType;
  key: string;
  title: string;
  detail: string;
  /** Field-level diff for updates. */
  changes?: string[];
  /** Reward amount decimal string, for funding totals. */
  amount?: string;
  /** Remote task id this action targets, when matched. */
  remoteTaskId?: string;
}

export interface Plan {
  generatedAt: string;
  source: string;
  actions: PlanAction[];
  summary: { create: number; update: number; noop: number; skip: number };
}

export interface ScanHit {
  file: string;
  line: number;
  kind: "TODO" | "FIXME" | "HACK";
  text: string;
}

export interface ScanProposal {
  key: string;
  title: string;
  content: string;
  file: string;
  line: number;
}
