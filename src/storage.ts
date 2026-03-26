import type { NuclyrConfig, } from "./client";
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

// ── Client ────────────────────────────────────────────────────────────────────

/**
 * Storage operations: upload, download, delete, list, presign.
 * Routes to the cheapest / lowest-latency / most-compliant provider
 * based on the configured strategy.
 */
export class StorageClient {
  private readonly config: NuclyrConfig;

  constructor(config: NuclyrConfig) {
    this.config = config;
  }

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
    const body = typeof content === "string" ? new TextEncoder().encode(content) : content;
    // TODO: call engine gRPC StorageService.Upload via @connectrpc/connect
    throw new Error(`storage.upload not yet wired to gRPC - bucket=${bucket} key=${key} bytes=${body.byteLength}`);
  }

  /**
   * Download an object.
   */
  async download(bucket: string, key: string): Promise<DownloadResult> {
    // TODO: call engine gRPC StorageService.Download
    throw new Error(`storage.download not yet wired to gRPC - bucket=${bucket} key=${key}`);
  }

  /**
   * Delete an object.
   * @returns true if deleted, false if not found.
   */
  async delete(bucket: string, key: string): Promise<boolean> {
    // TODO: call engine gRPC StorageService.Delete
    throw new Error(`storage.delete not yet wired to gRPC - bucket=${bucket} key=${key}`);
  }

  /**
   * List objects with an optional prefix.
   */
  async list(
    bucket: string,
    options: { prefix?: string; maxResults?: number; pageToken?: string } = {}
  ): Promise<ListResult> {
    // TODO: call engine gRPC StorageService.List
    throw new Error(`storage.list not yet wired to gRPC - bucket=${bucket}`);
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
    // TODO: call engine gRPC StorageService.Presign
    throw new Error(`storage.presign not yet wired to gRPC - bucket=${bucket} key=${key} op=${operation} expires=${expiresInSeconds}`);
  }
}
