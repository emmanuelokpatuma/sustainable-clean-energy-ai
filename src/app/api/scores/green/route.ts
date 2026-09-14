import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { calculateGreenScore } from "@/server/calculations/greenScore";

/**
 * No service-layer wrapper here, unlike Location/CarbonIntensity/Solar.
 * Those services exist to translate an AdapterError into a user-safe Result
 * — there is no adapter here, no network call, and no failure mode besides
 * "the caller didn't provide enough data", which `calculateGreenScore`
 * already reports as a typed outcome. A pass-through service class would add
 * a layer with nothing to do (see PRODUCT_SPEC.md: "do not over-engineer
 * features that are not required").
 */

const energyProfileSchema = z
  .object({
    annualUsageKwh: z.number().positive().nullable().optional(),
    hasGasHeating: z.boolean().nullable().optional(),
    hasEvCharger: z.boolean().nullable().optional(),
    hasBattery: z.boolean().nullable().optional(),
  })
  .optional();

const solarAssessmentSchema = z
  .object({
    annualIrradiationKwhPerM2: z.number().positive(),
  })
  .optional();

const carbonIntensitySchema = z
  .object({
    currentIndex: z.enum(["very low", "low", "moderate", "high", "very high"]),
    forecastValues: z.array(z.number().nullable()).optional(),
  })
  .optional();

const actionProgressSchema = z
  .object({
    completed: z.number().int().min(0),
    total: z.number().int().min(0),
  })
  .optional();

const bodySchema = z.object({
  energyProfile: energyProfileSchema,
  solarAssessment: solarAssessmentSchema,
  carbonIntensity: carbonIntensitySchema,
  actionProgress: actionProgressSchema,
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Request body must be JSON." },
      { status: 400 }
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "One or more provided fields did not match the expected shape." },
      { status: 400 }
    );
  }

  const outcome = calculateGreenScore(parsed.data);

  if (!outcome.ok) {
    return NextResponse.json({ ok: false, message: outcome.message }, { status: 422 });
  }

  return NextResponse.json({ ok: true, greenScore: outcome.result });
}
