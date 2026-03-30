import { createConnectTransport } from "@connectrpc/connect-web";
import type { Transport } from "@connectrpc/connect";

import { StorageClient } from "./storage";
import { ComputeClient } from "./compute";
import { QueueClient } from "./queue";
import type { RoutingStrategy } from "./types";

export interface NuclyrConfig {
  /** Nuclyr API base URL, e.g. "https://app.nuclyr.cloud" */
  apiUrl: string;
  /** API key issued from the Nuclyr dashboard. */
  apiKey: string;
  /**
   * Optional gRPC-Web base URL for ConnectRPC transport.
   * When set, the SDK routes calls through gRPC-Web instead of REST.
   * Typically the same origin as `apiUrl`, e.g. `https://app.nuclyr.cloud`.
   */
  grpcUrl?: string;
  /** Default routing strategy applied to all operations unless overridden per-call. */
  defaultStrategy?: RoutingStrategy;
}

/** @internal – builds shared ConnectRPC transport when grpcUrl is configured. */
export function buildTransport(config: NuclyrConfig): Transport | undefined {
  if (!config.grpcUrl) return undefined;
  return createConnectTransport({
    baseUrl: config.grpcUrl,
    // Attach API key as Bearer token on every outgoing gRPC-Web request.
    interceptors: [
      (next) => (req) => {
        req.header.set("authorization", `Bearer ${config.apiKey}`);
        return next(req);
      },
    ],
  });
}

/**
 * Main Nuclyr SDK client.
 *
 * @example
 * ```ts
 * import { Nuclyr } from "@nuclyr/sdk";
 *
 * const nuclyr = new Nuclyr({
 *   apiUrl: "https://app.nuclyr.cloud",
 *   apiKey: process.env.NUCLYR_API_KEY!,
 * });
 *
 * await nuclyr.storage.upload("my-bucket", "hello.txt", Buffer.from("hello"));
 * await nuclyr.compute.run("my-fn", payload);
 * await nuclyr.queue.publish("orders", Buffer.from(JSON.stringify(order)));
 * ```
 */
export class Nuclyr {
  readonly storage: StorageClient;
  readonly compute: ComputeClient;
  readonly queue: QueueClient;

  constructor(config: NuclyrConfig) {
    const transport = buildTransport(config);
    this.storage = new StorageClient(config, transport);
    this.compute = new ComputeClient(config, transport);
    this.queue   = new QueueClient(config, transport);
  }
}
