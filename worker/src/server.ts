import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { processJob } from "./pipeline.js";
import { jobSchema, type WorkerJob } from "./types.js";

const port = Number(process.env.WORKER_PORT || 8788);
const sharedSecret = requiredEnv("WORKER_SHARED_SECRET");
const maxParallel = Math.max(1, Number(process.env.WORKER_MAX_PARALLEL || 2));
const queue: Array<{ job: WorkerJob; workerRef: string }> = [];
let active = 0;

createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") return send(response, 200, { ok: true, active, queued: queue.length });
  if (request.method !== "POST" || request.url !== "/jobs") return send(response, 404, { error: "Not found" });
  if (request.headers.authorization !== `Bearer ${sharedSecret}`) return send(response, 401, { error: "Unauthorized" });
  try {
    const body = jobSchema.parse(JSON.parse(await readBody(request)));
    const workerRef = randomUUID();
    queue.push({ job: body, workerRef });
    send(response, 202, { workerRef });
    void drainQueue();
  } catch (error) {
    send(response, 400, { error: error instanceof Error ? error.message : "Invalid job" });
  }
}).listen(port, () => {
  process.stdout.write(`ClipFactory worker listening on ${port}\n`);
});

async function drainQueue() {
  while (active < maxParallel && queue.length) {
    const item = queue.shift();
    if (!item) return;
    active += 1;
    void processJob(item.job)
      .then((outputs) => callback(item.job, { ok: true, outputs }))
      .catch((error) => callback(item.job, { ok: false, errorMessage: error instanceof Error ? error.message.slice(0, 1000) : "Worker stage failed" }))
      .finally(() => { active -= 1; void drainQueue(); });
  }
}

async function callback(job: WorkerJob, result: { ok: boolean; outputs?: unknown; errorMessage?: string }) {
  const response = await fetch(job.callbackUrl, { method: "POST", headers: { Authorization: `Bearer ${job.callbackSecret}`, "Content-Type": "application/json" }, body: JSON.stringify({ jobId: job.jobId, workflowId: job.workflowId, eventName: job.eventName, result }) });
  if (!response.ok) process.stderr.write(`Callback for ${job.jobId} returned HTTP ${response.status}\n`);
}

function readBody(request: import("node:http").IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => { body += chunk; if (body.length > 1_000_000) request.destroy(new Error("Request body is too large")); });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function send(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
