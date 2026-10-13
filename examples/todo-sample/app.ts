// Sample input for `bountyfile scan`. Realistic markers, clean output on camera.

export async function refreshSession(token: string) {
  // TODO: retry once on 429 with exponential backoff, then surface a clear error
  return fetch("/api/session/refresh", { method: "POST" });
}

export function enqueue(job: unknown) {
  // FIXME: drop jobs when the queue is full instead of growing memory unbounded
  queue.push(job);
}
