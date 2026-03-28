/**
 * User-facing SDK types — the ergonomic TypeScript API surface.
 *
 * Protobuf contracts in contracts/proto/nuclyr/v1/ are the source of truth.
 * Running `pnpm generate` produces raw protobuf-es output in src/generated/:
 *   - Numeric enum objects  (Provider.AWS = 1, etc.)
 *   - BigInt for int64 fields
 *   - Verbose message classes
 *
 * These types below are the clean aliases the SDK exposes to callers.
 * The REST transport maps between them. When gRPC-Web transport is wired
 * in Phase 2, the generated ConnectRPC clients in src/generated/ will be
 * used internally while these string types remain the public API.
 */

/**
 * Cloud provider identifier.
 * Maps to proto enum `Provider` in common.proto.
 */
export type Provider = "aws" | "gcp" | "azure";

/**
 * How the engine picks a provider for each operation.
 * Maps to proto enum `RoutingStrategy` in common.proto.
 */
export type RoutingStrategy = "cost" | "latency" | "compliance";

/**
 * DPDP data residency constraint.
 * Maps to proto enum `DataResidency` in storage.proto / queue.proto.
 */
export type DataResidency = "india" | "any";

/**
 * Error thrown by all SDK methods on a non-2xx API response.
 */
export class NuclyrError extends Error {
  readonly code: string;
  readonly provider?: Provider;

  constructor(message: string, code: string, provider?: Provider) {
    super(message);
    this.name = "NuclyrError";
    this.code = code;
    this.provider = provider;
  }
}
