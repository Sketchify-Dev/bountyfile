import { readFileSync, existsSync } from "node:fs";
import type { BountySpec } from "./types.js";

export interface RemoteTask {
  taskId: string;
  title: string;
  content: string;
  status: string;
}

export interface OpsClient {
  mode: "live" | "mock";
  listCreated(): Promise<RemoteTask[]>;
  listAvailable(page?: number, limit?: number): Promise<RemoteTask[]>;
  get(taskId: string): Promise<RemoteTask & { raw: unknown }>;
  create(spec: BountySpec): Promise<{ taskId: string; txHash?: string }>;
  update(taskId: string, input: { content?: string; deadline?: string }): Promise<void>;
  listSubmissions(taskId: string): Promise<unknown>;
}

// ---- Mock client: deterministic, offline, fixture-backed ----
export class MockClient implements OpsClient {
  readonly mode = "mock" as const;
  private tasks: RemoteTask[];

  constructor(fixturePath = "fixtures/mock-tasks.json") {
    if (existsSync(fixturePath)) {
      this.tasks = JSON.parse(readFileSync(fixturePath, "utf8")) as RemoteTask[];
    } else {
      this.tasks = [
        { taskId: "mock-task-1", title: "Fix flaky auth session test", content: "<p>old</p>", status: "in progress" },
      ];
    }
  }
  async listCreated(): Promise<RemoteTask[]> {
    return this.tasks;
  }
  async listAvailable(): Promise<RemoteTask[]> {
    return this.tasks;
  }
  async get(taskId: string) {
    const t = this.tasks.find((x) => x.taskId === taskId);
    if (!t) throw new Error(`Mock: task not found: ${taskId}`);
    return { ...t, raw: t };
  }
  async create(spec: BountySpec) {
    const taskId = `mock-${spec.key}`;
    this.tasks.push({ taskId, title: spec.title, content: spec.content, status: "in progress" });
    return { taskId, txHash: "mock-tx-hash" };
  }
  async update(taskId: string, input: { content?: string }) {
    const t = this.tasks.find((x) => x.taskId === taskId);
    if (!t) throw new Error(`Mock: task not found: ${taskId}`);
    if (input.content) t.content = input.content;
  }
  async listSubmissions(taskId: string) {
    const p = "fixtures/mock-submissions.json";
    if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8"));
    return { taskId, results: [] };
  }
}

// ---- Live client: thin wrapper over official @gibwork/sdk ----
export class LiveClient implements OpsClient {
  readonly mode = "live" as const;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sdk: any;

  constructor(privateKey: string, production: boolean) {
    if (!privateKey) {
      throw new Error(
        "Missing SOLANA_PRIVATE_KEY.\nSet it in .env or env, or run with GIBWORK_MOCK=true for offline demo.",
      );
    }
    this.sdk = null;
    this._privateKey = privateKey;
    this._production = production;
  }
  private _privateKey: string;
  private _production: boolean;

  private async client() {
    if (!this.sdk) {
      const { createGibworkClient } = await import("@gibwork/sdk/node");
      this.sdk = createGibworkClient({
        privateKey: this._privateKey,
        production: this._production,
        timeoutMs: 30_000,
      });
    }
    return this.sdk;
  }

  async listCreated(): Promise<RemoteTask[]> {
    const c = await this.client();
    const res = await c.tasks.list();
    const arr = Array.isArray(res) ? res : (res.results ?? []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return arr.map((t: any) => ({
      taskId: t.id ?? t.taskId,
      title: t.title ?? "(untitled)",
      content: t.content ?? "",
      status: t.status ?? "unknown",
    }));
  }

  async listAvailable(page = 1, limit = 15): Promise<RemoteTask[]> {
    const c = await this.client();
    const res = await c.tasks.listAvailable({ page, limit });
    const arr = Array.isArray(res) ? res : (res.results ?? []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return arr.map((t: any) => ({
      taskId: t.id ?? t.taskId ?? t.task_id ?? String(t),
      title: t.title ?? "(untitled)",
      content: t.content ?? "",
      status: t.status ?? "unknown",
    }));
  }

  async get(taskId: string) {
    const c = await this.client();
    const t = await c.tasks.get(taskId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = t as any;
    return {
      taskId: r.id ?? r.taskId ?? taskId,
      title: r.title ?? "(untitled)",
      content: r.content ?? "",
      status: r.status ?? "unknown",
      raw: t,
    };
  }

  async create(spec: BountySpec) {
    const c = await this.client();
    const r = await c.tasks.create({
      title: spec.title,
      content: spec.content,
      tags: spec.tags,
      payment: spec.payment,
      minSubmissionAmount: spec.minSubmissionAmount,
      deadline: spec.deadline ?? null,
      allowOnlyVerifiedSubmissions: spec.allowOnlyVerifiedSubmissions ?? false,
    });
    return { taskId: r.taskId, txHash: r.txHash };
  }

  async update(taskId: string, input: { content?: string; deadline?: string }) {
    const c = await this.client();
    await c.tasks.update(taskId, input);
  }

  async listSubmissions(taskId: string) {
    const c = await this.client();
    return c.submissions.list(taskId);
  }
}

export function makeClient(opts: {
  mock: boolean;
  privateKey?: string;
  production?: boolean;
}): OpsClient {
  if (opts.mock) return new MockClient();
  return new LiveClient(opts.privateKey ?? "", opts.production ?? false);
}
