import { z } from "zod";

/**
 * Validates process.env once, at import time, so a missing/malformed
 * environment variable fails fast and loudly instead of causing a confusing
 * runtime error three layers deep in an adapter.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(), // optional so tests can run without a DB
  POSTCODES_IO_BASE_URL: z.string().url().default("https://api.postcodes.io"),
  CARBON_INTENSITY_BASE_URL: z
    .string()
    .url()
    .default("https://api.carbonintensity.org.uk"),
  PVGIS_BASE_URL: z.string().url().default("https://re.jrc.ec.europa.eu/api"),
  ANTHROPIC_API_KEY: z.string().optional(),
  USE_FIXTURE_DATA: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration: ${parsed.error.toString()}`
    );
  }
  cached = parsed.data;
  return cached;
}
