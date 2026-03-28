import type { NuclyrConfig } from "./client";
import { NuclyrError } from "./types";
import type { RoutingStrategy, DataResidency } from "./types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PublishOptions {
  attributes?: Record<string, string>;
  strategy?: RoutingStrategy;
  dataResidency?: DataResidency;
  delaySeconds?: number;
}

export interface PublishResult {
  messageId: string;
  provider: string;
}

export interface QueueMessage {
  messageId: string;
  payload: Uint8Array;
  attributes: Record<string, string>;
  publishedAt: Date;
  deliveryAttempt: number;
}

export interface SubscribeOptions {
  maxMessages?: number;
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

// ── Client ────────────────────────────────────────────────────────────────────

/**
 * Queue operations: publish, subscribe (async iterator), ack.
 * Routes to the cheapest / lowest-latency provider (SQS, Pub/Sub, Service Bus).
 *
 * `subscribe` uses long-poll over REST. When gRPC-Web transport is wired
 * in Phase 2, it will switch to the streaming `QueueService.Subscribe` RPC.
 */
export class QueueClient {
  private readonly config: NuclyrConfig;

  constructor(config: NuclyrConfig) {
    this.config = config;
  }

  private async apiFetch<T>(path: string, init: RequestInit): Promise<T> {
    const url = `${this.config.apiUrl}/api/queue${path}`;
    const resp = await fetch(url, {
      ...init,
      headers: {
        "X-Api-Key": this.config.apiKey,
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      },
    });

    if (!resp.ok) {
      let message = `Queue API error ${resp.status}`;
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
   * Publish a message to a topic.
   * Nuclyr routes to the cheapest compliant provider automatically.
   *
   * @example
   * ```ts
   * const result = await nuclyr.queue.publish('orders', Buffer.from(JSON.stringify(order)), {
   *   attributes: { type: 'new-order' },
   *   strategy: 'cost',
   * });
   * console.log(`Published ${result.messageId} via ${result.provider}`);
   * ```
   */
  async publish(
    topic: string,
    payload: Uint8Array | Buffer | string,
    options: PublishOptions = {}
  ): Promise<PublishResult> {
    const bytes =
      typeof payload === "string" ? new TextEncoder().encode(payload) : payload;

    const res = await this.apiFetch<{
      message_id: string;
      provider: string;
    }>("/publish", {
      method: "POST",
      body: JSON.stringify({
        topic,
        payload: toBase64(bytes as Uint8Array),
        attributes: options.attributes ?? {},
        strategy: options.strategy ?? this.config.defaultStrategy,
        delay_seconds: options.delaySeconds,
      }),
    });

    return {
      messageId: res.message_id,
      provider: res.provider,
    };
  }

  /**
   * Subscribe to a topic as an async iterator.
   * Pulls messages in batches via long-poll (REST). Each message must be
   * explicitly `ack`-ed to prevent redelivery.
   *
   * @example
   * ```ts
   * for await (const msg of nuclyr.queue.subscribe('orders', 'orders-worker')) {
   *   await processOrder(msg.payload);
   *   await nuclyr.queue.ack(msg.messageId, 'orders-worker');
   * }
   * ```
   */
  async *subscribe(
    topic: string,
    subscriptionName: string,
    options: SubscribeOptions = {}
  ): AsyncGenerator<QueueMessage> {
    const maxMessages = options.maxMessages ?? 10;

    while (true) {
      const res = await this.apiFetch<{
        messages: Array<{
          message_id: string;
          payload: string;
          attributes: Record<string, string>;
          published_at: string;
          delivery_attempt: number;
        }>;
      }>("/receive", {
        method: "POST",
        body: JSON.stringify({
          topic,
          subscription_name: subscriptionName,
          max_messages: maxMessages,
        }),
      });

      if (!res.messages || res.messages.length === 0) {
        // No messages — short pause before next poll to avoid hot-looping
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }

      for (const m of res.messages) {
        yield {
          messageId: m.message_id,
          payload: fromBase64(m.payload),
          attributes: m.attributes ?? {},
          publishedAt: new Date(m.published_at),
          deliveryAttempt: m.delivery_attempt,
        };
      }
    }
  }

  /**
   * Acknowledge a message so it won't be redelivered.
   */
  async ack(messageId: string, subscriptionName: string): Promise<boolean> {
    const res = await this.apiFetch<{ acknowledged: boolean }>("/ack", {
      method: "POST",
      body: JSON.stringify({
        message_id: messageId,
        subscription_name: subscriptionName,
      }),
    });
    return res.acknowledged;
  }
}
