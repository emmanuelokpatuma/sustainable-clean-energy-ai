import { z } from "zod";
import { AdapterError, shouldUseFixtures, type DataAdapter } from "./types";
import { getEnv } from "../lib/env";
import { logger } from "../lib/logger";
import fixture from "../../../tests/fixtures/postcodes-io/valid-response.json";

const SOURCE_NAME = "Postcodes.io";

export interface ResolveLocationInput {
  /** Already-validated, normalized postcode, e.g. "SW1A 1AA". */
  normalizedPostcode: string;
}

export interface ResolvedLocation {
  latitude: number;
  longitude: number;
  adminDistrict: string | null;
  region: string | null;
  postcodeOutward: string;
}

// Schema for the subset of the Postcodes.io response we actually use.
// Deliberately narrow: we only depend on fields the product needs, so an
// upstream schema change elsewhere doesn't break us.
const postcodesIoResponseSchema = z.object({
  status: z.number(),
  result: z
    .object({
      postcode: z.string(),
      latitude: z.number(),
      longitude: z.number(),
      admin_district: z.string().nullable(),
      region: z.string().nullable(),
    })
    .nullable(),
});

export class PostcodesIoAdapter
  implements DataAdapter<ResolveLocationInput, ResolvedLocation>
{
  readonly sourceName = SOURCE_NAME;

  async fetch(input: ResolveLocationInput) {
    const useFixtures = shouldUseFixtures();

    if (useFixtures) {
      return this.parseAndAttach(fixture, input, true);
    }

    const env = getEnv();
    const url = `${env.POSTCODES_IO_BASE_URL}/postcodes/${encodeURIComponent(
      input.normalizedPostcode
    )}`;

    let response: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
    } catch (err) {
      logger.error("Postcodes.io request failed", { url, err: String(err) });
      throw new AdapterError({
        kind: "temporarily_unavailable",
        source: SOURCE_NAME,
        message: "Could not reach Postcodes.io. Please try again shortly.",
        cause: err,
      });
    }

    if (response.status === 404) {
      throw new AdapterError({
        kind: "invalid_input",
        source: SOURCE_NAME,
        message: "That postcode could not be found.",
      });
    }

    if (!response.ok) {
      throw new AdapterError({
        kind: "temporarily_unavailable",
        source: SOURCE_NAME,
        message: `Postcodes.io returned an unexpected status: ${response.status}`,
      });
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (err) {
      throw new AdapterError({
        kind: "unexpected_response_shape",
        source: SOURCE_NAME,
        message: "Postcodes.io returned a response we couldn't parse.",
        cause: err,
      });
    }

    return this.parseAndAttach(json, input, false);
  }

  private parseAndAttach(
    json: unknown,
    input: ResolveLocationInput,
    isFixture: boolean
  ) {
    const parsed = postcodesIoResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new AdapterError({
        kind: "unexpected_response_shape",
        source: SOURCE_NAME,
        message: "Postcodes.io response did not match the expected shape.",
        cause: parsed.error,
      });
    }

    if (!parsed.data.result) {
      throw new AdapterError({
        kind: "invalid_input",
        source: SOURCE_NAME,
        message: "That postcode could not be found.",
      });
    }

    const { result } = parsed.data;
    const outward = input.normalizedPostcode.split(" ")[0] ?? result.postcode;

    return {
      latitude: result.latitude,
      longitude: result.longitude,
      adminDistrict: result.admin_district,
      region: result.region,
      postcodeOutward: outward,
      _meta: {
        source: SOURCE_NAME,
        retrievedAt: new Date(),
        isFixture,
      },
    };
  }
}
