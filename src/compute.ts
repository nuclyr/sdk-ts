import type { NuclyrConfig } from "./client";
import { NuclyrError } from "./types";
import type { RoutingStrategy, DataResidency } from "./types";

// ── Types ─────────────────────────────────────────────────────────────────────

export type JobState =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface RunOptions {
  strategy?: RoutingStrategy;
  dataResidency?: DataResidency;
  memoryMb?: number;
  timeoutSeconds?: number;
  env?: Record<string, string>;
}

export interface RunResult {
  jobId: string;
  result: Uint8Array;
  provider: string;
  region: string;
  durationMs: number;
}

export interface JobStatus {
  jobId: string;
  state: JobState;
  provider: string;
  region: string;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
}

export interface LogEntry {
  timestamp: Date;
  level: string;
  message: string;
}

export interface ListJobsOptions {
  functionName?: string;
  stateFilter?: JobState;
  maxResults?: number;
  pageToken?: string;
}

export interface ListJobsResult {
  jobs: JobStatus[];
  nextPageToken?: string;
}

export interface GetLogsOptions {
  tailLines?: number;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function fromBase64(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(b64, "base64");
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toBase64(data: Uint8Array | Buffer): string {
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(data)) {
    return (data as Buffer).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

function mapState(raw: string): JobState {
  const map: Record<string, JobState> = {
    pending: "pending",
    running: "running",
    completed: "completed",
    failed: "failed",
    cancelled: "cancelled",
  };
  return map[raw] ?? "pending";
}

// ── Client ────────────────────────────────────────────────────────────────────

/**
 * Compute operations: run functions, poll status, cancel, stream logs.
 * Routes to the cheapest / lowest-latency provider (Lambda, Cloud Run, Functions)
 * based on the configured strategy.
 */
export class ComputeClient {
  private readonly config: NuclyrConfig;

  constructor(config: NuclyrConfig) {
    this.config = config;
  }

  private async apiFetch<T>(path: string, init: RequestInit): Promise<T> {
    const url = `${this.config.apiUrl}/api/compute${path}`;
    const resp = await fetch(url, {
      ...init,
      headers: {
        "X-Api-Key": this.config.apiKey,
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      },
    });

    if (!resp.ok) {
      let message = `Compute API error ${resp.status}`;
      try {
        const body = await resp.json() as Record<string, unknown>;
        if (typeof body?.error === "string") message = body.error as string;
      } catch {}
      throw new NuclyrError(message, String(resp.status));
    }

    const text = await resp.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  /**
   * Run a function and wait for its result.
   *
   * @example
   * ```ts
   * const job = await nuclyr.compute.run('resize-image', payload, {
   *   strategy: 'latency',
   *   memoryMb: 512,
   * });
   * console.log(`Done in ${job.durationMs}ms on ${job.provider}`);
   * ```
   */
  async run(
    functionName: string,
    payload: Uint8Array | Buffer | string,
    options: RunOptions = {}
  ): Promise<RunResult> {
    const bytes =
      typeof payload === "string" ? new TextEncoder().encode(payload) : payload;

    const res = await this.apiFetch<{
      job_id: string;
      result: string;
      provider: string;
      region: string;
      duration_ms: number;
    }>("/run", {
      method: "POST",
      body: JSON.stringify({
        function_name: functionName,
        payload: toBase64(bytes as Uint8Array),
        strategy: options.strategy ?? this.config.defaultStrategy,
        memory_mb: options.memoryMb,
        timeout_seconds: options.timeoutSeconds,
        env: options.env,
      }),
    });

    return {
      jobId: res.job_id,
      result: fromBase64(res.result),
      provider: res.provider,
      region: res.region,
      durationMs: res.duration_ms,
    };
  }

  /**
   * Poll the status of an async job.
   */
  async getStatus(jobId: string): Promise<JobStatus> {
    const qs = new URLSearchParams({ job_id: jobId }).toString();
    const res = await this.apiFetch<{
      job_id: string;
      state: string;
      provider: string;
      region: string;
      started_at?: string;
      completed_at?: string;
      error_message?: string;
    }>(`/status?${qs}`, { method: "GET" });

    return {
      jobId: res.job_id,
      state: mapState(res.state),
      provider: res.provider,
      region: res.region,
      startedAt: res.started_at ? new Date(res.started_at) : undefined,
      completedAt: res.completed_at ? new Date(res.completed_at) : undefined,
      errorMessage: res.error_message,
    };
  }

  /**
   * Cancel a running job.
   * @returns true if cancelled, false if already terminal.
   */
  async cancel(jobId: string): Promise<boolean> {
    const res = await this.apiFetch<{ cancelled: boolean }>("/cancel", {
      method: "POST",
      body: JSON.stringify({ job_id: jobId }),
    });
    return res.cancelled;
  }

  /**
   * List recent jobs with optional filters.
   */
  async listJobs(options: ListJobsOptions = {}): Promise<ListJobsResult> {
    const params: Record<string, string> = {};
    if (options.functionName) params.function_name = options.functionName;
    if (options.stateFilter)  params.state_filter  = options.stateFilter;
    if (options.maxResults)   params.max_results   = String(options.maxResults);
    if (options.pageToken)    params.page_token     = options.pageToken;
    const qs = new URLSearchParams(params).toString();

    const res = await this.apiFetch<{
      jobs: Array<{
        job_id: string;
        state: string;
        provider: string;
        region: string;
        started_at?: string;
        completed_at?: string;
        error_message?: string;
      }>;
      next_page_token?: string;
    }>(`/jobs?${qs}`, { method: "GET" });

    return {
      jobs: res.jobs.map((j) => ({
        jobId: j.job_id,
        state: mapState(j.state),
        provider: j.provider,
        region: j.region,
        startedAt: j.started_at ? new Date(j.started_at) : undefined,
        completedAt: j.completed_at ? new Date(j.completed_at) : undefined,
        errorMessage: j.error_message,
      })),
      nextPageToken: res.next_page_token,
    };
  }

  /**
   * Fetch the tail of a job's log output.
   */
  async getLogs(
    jobId: string,
    options: GetLogsOptions = {}
  ): Promise<LogEntry[]> {
    const params: Record<string, string> = { job_id: jobId };
    if (options.tailLines) params.tail_lines = String(options.tailLines);
    const qs = new URLSearchParams(params).toString();

    const res = await this.apiFetch<{
      entries: Array<{ timestamp: string; level: string; message: string }>;
    }>(`/logs?${qs}`, { method: "GET" });

    return res.entries.map((e) => ({
      timestamp: new Date(e.timestamp),
      level: e.level,
      message: e.message,
    }));
  }
}
