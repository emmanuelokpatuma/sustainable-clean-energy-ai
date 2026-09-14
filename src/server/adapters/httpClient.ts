import { AdapterError } from "./types";

/**
 * Fetches JSON from `url` with a timeout and a single retry for transient
 * failures (network errors, 5xx). Does NOT retry on 4xx — a bad request or
 * "not found" won't succeed on a second try, so retrying would just add
 * latency for no benefit.
 *
 * Introduced in Phase 2 because `CarbonIntensityAdapter` makes three separate
 * calls per `fetch()` and duplicating timeout/retry/error-wrapping three times
 * inline would be harder to keep consistent. `PostcodesIoAdapter` (Phase 1)
 * makes a single call and is left as-is rather than refactored to use this —
 * it already works and is already tested; there's no working code being
 * thrown away here, just a shared helper for new, multi-call adapters.
 */
export async function fetchJsonWithRetry(
  url: string,
  source: string,
  options: { timeoutMs?: number; maxAttempts?: number } = {}
): Promise<unknown> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const maxAttempts = options.maxAttempts ?? 2;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) continue; // retry on network failure
      throw new AdapterError({
        kind: "temporarily_unavailable",
        source,
        message: `Could not reach ${source}. Please try again shortly.`,
        cause: err,
      });
    }

    if (response.status === 404) {
      throw new AdapterError({
        kind: "invalid_input",
        source,
        message: `${source} could not find the requested resource.`,
      });
    }

    if (response.status >= 500 && attempt < maxAttempts) {
      lastError = new Error(`HTTP ${response.status}`);
      continue; // retry once on a server error
    }

    if (!response.ok) {
      throw new AdapterError({
        kind: response.status === 429 ? "rate_limited" : "temporarily_unavailable",
        source,
        message: `${source} returned an unexpected status: ${response.status}`,
      });
    }

    try {
      return await response.json();
    } catch (err) {
      throw new AdapterError({
        kind: "unexpected_response_shape",
        source,
        message: `${source} returned a response we couldn't parse.`,
        cause: err,
      });
    }
  }

  // Only reached if every attempt hit a 5xx.
  throw new AdapterError({
    kind: "temporarily_unavailable",
    source,
    message: `${source} is temporarily unavailable after ${maxAttempts} attempts.`,
    cause: lastError,
  });
}
