/** Cloud provider identifiers. */
export type Provider = "aws" | "gcp" | "azure";

/** How the engine picks a provider for each operation. */
export type RoutingStrategy = "cost" | "latency" | "compliance";

/** DPDP data residency constraint - list of allowed regions. */
export type DataResidency = string[];

/** Standard error shape returned by the Nuclyr engine. */
export interface NuclyrError {
  code: string;
  message: string;
  provider?: Provider;
}
