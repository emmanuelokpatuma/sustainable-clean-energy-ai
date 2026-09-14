import { validatePostcode } from "../lib/postcode";
import { PostcodesIoAdapter } from "../adapters/postcodesIoAdapter";
import { AdapterError } from "../adapters/types";
import { logger } from "../lib/logger";

export interface LocationResult {
  latitude: number;
  longitude: number;
  adminDistrict: string | null;
  region: string | null;
  postcodeOutward: string;
  source: string;
  retrievedAt: string; // ISO string, safe to serialize to the client
}

export type LocationServiceResult =
  | { ok: true; location: LocationResult }
  | { ok: false; errorKind: "invalid_postcode" | "not_found" | "unavailable"; message: string };

/**
 * The single entry point future services (solar, energy) should use to turn
 * a user-entered postcode into coordinates. Keeps postcode validation,
 * adapter selection, and error translation in one place.
 */
export class LocationService {
  private readonly adapter: PostcodesIoAdapter;

  constructor(adapter: PostcodesIoAdapter = new PostcodesIoAdapter()) {
    this.adapter = adapter;
  }

  async resolvePostcode(rawPostcode: string): Promise<LocationServiceResult> {
    const validation = validatePostcode(rawPostcode);
    if (!validation.isValid || !validation.normalized) {
      return {
        ok: false,
        errorKind: "invalid_postcode",
        message: validation.reason ?? "Invalid postcode.",
      };
    }

    try {
      const result = await this.adapter.fetch({
        normalizedPostcode: validation.normalized,
      });

      return {
        ok: true,
        location: {
          latitude: result.latitude,
          longitude: result.longitude,
          adminDistrict: result.adminDistrict,
          region: result.region,
          postcodeOutward: result.postcodeOutward,
          source: result._meta.source,
          retrievedAt: result._meta.retrievedAt.toISOString(),
        },
      };
    } catch (err) {
      if (err instanceof AdapterError) {
        if (err.kind === "invalid_input") {
          return { ok: false, errorKind: "not_found", message: err.message };
        }
        logger.warn("Location resolution unavailable", {
          kind: err.kind,
          source: err.source,
        });
        return {
          ok: false,
          errorKind: "unavailable",
          message:
            "We couldn't verify that postcode right now. Please try again in a moment.",
        };
      }
      logger.error("Unexpected error resolving location", { err: String(err) });
      return {
        ok: false,
        errorKind: "unavailable",
        message: "Something went wrong resolving that postcode.",
      };
    }
  }
}
