/**
 * Every external data adapter implements this contract. Route handlers and
 * services must never talk to a third-party API directly — only through an
 * adapter — so a provider swap or outage never leaks into business logic.
 */

export type AdapterErrorKind =
  | "invalid_input"
  | "temporarily_unavailable"
  | "unexpected_response_shape"
  | "rate_limited";

export class AdapterError extends Error {
  readonly kind: AdapterErrorKind;
  readonly source: string;
  readonly cause?: unknown;

  constructor(params: {
    kind: AdapterErrorKind;
    source: string;
    message: string;
    cause?: unknown;
  }) {
    super(params.message);
    this.name = "AdapterError";
    this.kind = params.kind;
    this.source = params.source;
    this.cause = params.cause;
  }
}

export interface SourceMetadata {
  /** Human-readable source name, matching DATA_SOURCES.md exactly. */
  source: string;
  /** When the underlying data was retrieved. */
  retrievedAt: Date;
  /** True if this response came from a recorded fixture, not a live call. */
  isFixture: boolean;
}

export interface DataAdapter<TInput, TOutput> {
  readonly sourceName: string;
  fetch(input: TInput): Promise<TOutput & { _meta: SourceMetadata }>;
}

/**
 * Adapters check this to decide whether to hit the live API or read a fixture.
 * Centralised here so behaviour is consistent and easy to audit.
 */
export function shouldUseFixtures(): boolean {
  return process.env.USE_FIXTURE_DATA === "true";
}
