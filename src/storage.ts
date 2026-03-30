import type { NuclyrConfig } from "./client";
import type { Transport } from "@connectrpc/connect";
import { createClient } from "@connectrpc/connect";
import type { RoutingStrategy, DataResidency } from "./types";
import { NuclyrError } from "./types";
import { StorageService } from "./generated/nuclyr/v1/storage_pb.js";
import { Provider } from "./generated/nuclyr/v1/common_pb.js";

//  Types 

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

export interface MetadataOptions {
  accountId?: string;
  region?: string;
}

//  Internal helpers 

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

//  Provider enum mapping 

function providerName(p: Provider): string {
  switch (p) {
    case Provider.AWS:   return "aws";
    case Provider.GCP:   return "gcp";
    case Provider.AZURE: return "azure";
    default:             return "unknown";
  }
}

//  Client 

/**
 * Storage operations: upload, download, delete, list, presign, metadata.
 * Routes to the cheapest / lowest-latency / most-compliant provider
 * based on the configured strategy.
 *
 * When `grpcUrl` is set in `NuclyrConfig`, uses ConnectRPC (gRPC-Web) transport.
 * Otherwise falls back to the REST API (`/api/storage/*`).
 */
export class StorageClient {
  private readonly config: NuclyrConfig;
  private readonly transport: Transport | undefined;

  constructor(config: NuclyrConfig, transport?: Transport) {
    this.config    = config;
    this.transport = transport;
  }

  //  Private helpers 

  private grpcClient() {
    if (!this.transport) throw new Error("transport not configured"); // defensive
    return createClient(StorageService, this.transport);
  }

  private async apiFetch<T>(path: string, init: RequestInit): Promise<T> {
    const url = `${this.config.apiUrl}/api/storage${path}`;
    const resp = await fetch(url, {
      ...init,
      headers: {
        "X-Api-Key": this.config.apiKey,
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      },
    });

    if (!resp.ok) {
      let message = `Storage API error ${resp.status}`;
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

  //  Public methods 

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
      typeof content === "string" ? new TextEncoder().encode(content) : content as Uint8Array;

    if (this.transport) {
      const resp = await this.grpcClient().upload({
        bucket,
        key,
        content: bytes,
        contentType: options.contentType ?? "",
      });
      return {
        key: resp.key,
        bucket,
        size: bytes.length,
        contentType: options.contentType,
        etag: resp.etag,
        provider: providerName(resp.provider),
        region: resp.region,
      };
    }

    const res = await this.apiFetch<{
      key: string; etag: string; provider: string; region: string;
    }>("/upload", {
      method: "POST",
      body: JSON.stringify({
        bucket, key,
        content: toBase64(bytes),
        content_type: options.contentType,
        strategy: options.strategy,
      }),
    });
    return {
      key: res.key, bucket, size: bytes.length,
      contentType: options.contentType, etag: res.etag,
      provider: res.provider, region: res.region,
    };
  }

  /**
   * Download an object.
   */
  async download(bucket: string, key: string): Promise<DownloadResult> {
    if (this.transport) {
      const resp = await this.grpcClient().download({ bucket, key });
      const meta = resp.metadata;
      return {
        data: resp.content,
        meta: {
          key: meta?.key ?? key,
          bucket: meta?.bucket ?? bucket,
          size: Number(meta?.sizeBytes ?? 0),
          contentType: resp.contentType || meta?.contentType,
          etag: meta?.etag,
          provider: providerName(meta?.provider ?? Provider.UNSPECIFIED),
          region: meta?.region ?? "",
        },
      };
    }

    const qs = new URLSearchParams({ bucket, key }).toString();
    const res = await this.apiFetch<{
      bucket: string; key: string; content: string; content_type: string;
      size_bytes: number; etag: string; provider: string; region: string;
    }>(`/download?${qs}`, { method: "GET" });

    return {
      data: fromBase64(res.content),
      meta: {
        key: res.key, bucket: res.bucket, size: res.size_bytes,
        contentType: res.content_type, etag: res.etag,
        provider: res.provider, region: res.region,
      },
    };
  }

  /**
   * Delete an object. Returns true if deleted.
   */
  async delete(bucket: string, key: string): Promise<boolean> {
    if (this.transport) {
      const resp = await this.grpcClient().delete({ bucket, key });
      return resp.deleted;
    }
    const qs = new URLSearchParams({ bucket, key }).toString();
    const res = await this.apiFetch<{ deleted: boolean }>(
      `/delete?${qs}`, { method: "DELETE" }
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
    if (this.transport) {
      const resp = await this.grpcClient().list({
        bucket,
        prefix: options.prefix ?? "",
        pagination: options.maxResults || options.pageToken
          ? { pageSize: options.maxResults ?? 0, pageToken: options.pageToken ?? "" }
          : undefined,
      });
      return {
        objects: resp.objects.map((o) => ({
          key: o.key, bucket: o.bucket, size: Number(o.sizeBytes),
          contentType: o.contentType, etag: o.etag,
          provider: providerName(o.provider), region: o.region,
        })),
        nextPageToken: resp.pagination?.nextPageToken || undefined,
      };
    }

    const qs = new URLSearchParams({
      bucket,
      ...(options.prefix     && { prefix:      options.prefix }),
      ...(options.maxResults && { max_results: String(options.maxResults) }),
      ...(options.pageToken  && { page_token:  options.pageToken }),
    }).toString();
    const res = await this.apiFetch<{
      objects: Array<{
        bucket: string; key: string; size_bytes: number; content_type: string;
        etag: string; provider: string; region: string; last_modified: string;
      }>;
      next_page_token?: string;
    }>(`/list?${qs}`, { method: "GET" });

    return {
      objects: res.objects.map((o) => ({
        key: o.key, bucket: o.bucket, size: o.size_bytes, contentType: o.content_type,
        etag: o.etag, provider: o.provider, region: o.region,
        lastModified: new Date(o.last_modified),
      })),
      nextPageToken: res.next_page_token,
    };
  }

  /**
   * Get object metadata without downloading content.
   */
  async metadata(
    bucket: string,
    key: string,
    options: MetadataOptions = {}
  ): Promise<ObjectMeta> {
    if (this.transport) {
      const resp = await this.grpcClient().getMetadata({ bucket, key });
      const m = resp.metadata;
      return {
        key: m?.key ?? key, bucket: m?.bucket ?? bucket, size: Number(m?.sizeBytes ?? 0),
        contentType: m?.contentType, etag: m?.etag,
        provider: providerName(m?.provider ?? Provider.UNSPECIFIED), region: m?.region ?? "",
      };
    }

    const params: Record<string, string> = { bucket, key };
    if (options.accountId) params.account_id = options.accountId;
    if (options.region)    params.region      = options.region;
    const qs = new URLSearchParams(params).toString();
    const res = await this.apiFetch<{
      bucket: string; key: string; size_bytes: number; content_type: string;
      etag: string; provider: string; region: string; last_modified: string;
    }>(`/metadata?${qs}`, { method: "GET" });

    return {
      key: res.key, bucket: res.bucket, size: res.size_bytes, contentType: res.content_type,
      etag: res.etag, provider: res.provider, region: res.region,
      lastModified: new Date(res.last_modified),
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
    if (this.transport) {
      const op = operation === "get" ? 1 : 2; // PresignOperation enum
      const resp = await this.grpcClient().presign({
        bucket, key, operation: op, expiresInSeconds,
      });
      return resp.url;
    }

    const qs = new URLSearchParams({
      bucket, key, operation, expires_in_seconds: String(expiresInSeconds),
    }).toString();
    const res = await this.apiFetch<{ url: string; expires_at: string }>(
      `/presign?${qs}`, { method: "GET" }
    );
    return res.url;
  }
}
