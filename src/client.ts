import { StorageClient } from "./storage";
import { ComputeClient } from "./compute";
import { QueueClient } from "./queue";
import type { RoutingStrategy } from "./types";

export interface NuclyrConfig {
  /** Nuclyr API base URL, e.g. "https://app.nuclyr.cloud" */
  apiUrl: string;
  /** API key issued from the Nuclyr dashboard. */
  apiKey: string;
  /** Default routing strategy applied to all operations unless overridden per-call. */
  defaultStrategy?: RoutingStrategy;
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
    this.storage = new StorageClient(config);
    this.compute = new ComputeClient(config);
    this.queue   = new QueueClient(config);
  }
}
