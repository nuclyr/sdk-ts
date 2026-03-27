import type { NuclyrConfig } from "./client";
import type { RoutingStrategy, DataResidency } from "./types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ObjectMeta {
  key: string;
  bucket: string;
  size: number;
  contentType?: string;
  etag?: string;
  lastModified?: Date;
  provider: string;
  region: string;
}

export interface UploadOptions {
  contentType?: string;
  strategy?: RoutingStrategy;
  dataResidency?: DataResidency;
  tags?: Record<string, string>;
}

export interface DownloadResult {
  data: Uint8Array;
  meta: ObjectMeta;
}

export interface ListResult {
  objects: ObjectMeta[];
  nextPageToken?: string;
}

export type PresignOperation = "get" | "put";

// ── Internal helpers ──────────────────────────────────────────────────────────

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

// ── Client ────────────────────────────────────────────────────────────────────

/**
 * Storage operations: upload, download, delete, list, presign.
 * Routes to the cheapest / lowest-latency / most-compliant provider
 * based on the configured strategy.
 *
 * Calls the Nuclyr API (`/api/storage/*`). The API proxies each request to
 * the engine over internal gRPC. The gRPC-Web endpoint (`/grpc/*`) is
 * available for server-to-server clients using buf-generated stubs.
 */
export class StorageClient {
  private readonly config: NuclyrConfig;

  constructor(config: NuclyrConfig) {
    this.config = config;
  }

  // ── Private fetch helper ────────────────────────────────────────────────────

  private async apiFetch<T>(path: string, init: RequestInit): Promise<T> {
    const url = `${this.config.apiUrl}/api/storage${path}`;
    const resp = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      },
    });

    if (!resp.ok) {
      let message = `Storage API error ${resp.status}`;
      try {
        const body = await resp.json();
        if (typeof body?.error === "string") message = body.error;
      } catch {}
      throw new Error(message);
    }

    return resp.json() as Promise<T>;
  }

  // ── Public methods ──────────────────────────────────────────────────────────

  /**
   * Upload an object to the best available provider.
   *
   * @example
   * ```ts
   * const meta = await nuclyr.storage.upload(
   *   "my-bucket",
   *   "path/to/file.txt",
   *   Buffer.from("content"),
   *   { contentType: "text/plain" }
   * );
   * ```
   */
  async upload(
    bucket: string,
    key: string,
    content: Uint8Array | Buffer | string,
    options: UploadOptions = {}
  ): Promise<ObjectMeta> {
    const bytes =
      typeof content === "string" ? new TextEncoder().encode(content) : content;

    const res = await this.apiFetch<{
      key: string;
      etag: string;
      provider: string;
      region: string;
    }>("/upload", {
      method: "POST",
      body: JSON.stringify({
        bucket,
        key,
        content: toBase64(bytes as Uint8Array),
        content_type: options.contentType,
        strategy: options.strategy,
      }),
    });

    return {
      key: res.key,
      bucket,
      size: bytes.length,
      contentType: options.contentType,
      etag: res.etag,
      provider: res.provider,
      region: res.region,
    };
  }

  /**
   * Download an object.
   */
  async download(bucket: string, key: string): Promise<DownloadResult> {
    const qs = new URLSearchParams({ bucket, key }).toString();
    const res = await this.apiFetch<{
      bucket: string;
      key: string;
      content: string;
      content_type: string;
      size_bytes: number;
      etag: string;
      provider: string;
      region: string;
    }>(`/download?${qs}`, { method: "GET" });

    const data = fromBase64(res.content);
    return {
      data,
      meta: {
        key: res.key,
        bucket: res.bucket,
        size: res.size_bytes,
        contentType: res.content_type,
        etag: res.etag,
        provider: res.provider,
        region: res.region,
      },
    };
  }

  /**
   * Delete an object.
   * @returns true if deleted, false if not found.
   */
  async delete(bucket: string, key: string): Promise<boolean> {
    const qs = new URLSearchParams({ bucket, key }).toString();
    const res = await this.apiFetch<{ deleted: boolean }>(
      `/delete?${qs}`,
      { method: "DELETE" }
    );
    return res.deleted;
  }

  /**
   * List objects with an optional prefix.
   */
  async list(
    bucket: string,
    options: { prefix?: string; maxResults?: number; pageToken?: string } = {}
  ): Promise<ListResult> {
    const qs = new URLSearchParams({
      bucket,
      ...(options.prefix && { prefix: options.prefix }),
      ...(options.maxResults && { max_results: String(options.maxResults) }),
      ...(options.pageToken && { page_token: options.pageToken }),
    }).toString();

    const res = await this.apiFetch<{
      objects: Array<{
        bucket: string;
        key: string;
        size_bytes: number;
        content_type: string;
        etag: string;
        provider: string;
        region: string;
        last_modified: string;
      }>;
      next_page_token?: string;
    }>(`/list?${qs}`, { method: "GET" });

    return {
      objects: res.objects.map((o) => ({
        key: o.key,
        bucket: o.bucket,
        size: o.size_bytes,
        contentType: o.content_type,
        etag: o.etag,
        provider: o.provider,
        region: o.region,
        lastModified: new Date(o.last_modified),
      })),
      nextPageToken: res.next_page_token,
    };
  }

  /**
   * Generate a presigned URL for direct client upload/download.
   */
  async presign(
    bucket: string,
    key: string,
    operation: PresignOperation,
    expiresInSeconds = 3600
  ): Promise<string> {
    const qs = new URLSearchParams({
      bucket,
      key,
      operation,
      expires_in_seconds: String(expiresInSeconds),
    }).toString();

    const res = await this.apiFetch<{ url: string; expires_at: string }>(
      `/presign?${qs}`,
      { method: "GET" }
    );
    return res.url;
  }
}
