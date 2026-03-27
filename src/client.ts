import { StorageClient } from "./storage";
import type { RoutingStrategy } from "./types";

export interface NuclyrConfig {
  /** Nuclyr API base URL, e.g. "https://app.nuclyr.cloud" */
  apiUrl: string;
  /** API key issued from the Nuclyr dashboard. */
  apiKey: string;
  /** Default routing strategy applied to all operations unless overridden. */
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
 * ```
 */
export class Nuclyr {
  readonly storage: StorageClient;
  private readonly config: NuclyrConfig;

  constructor(config: NuclyrConfig) {
    this.config = config;
    this.storage = new StorageClient(config);
  }
}
