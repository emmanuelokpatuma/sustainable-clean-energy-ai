import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { calculateSolarScore } from "@/server/calculations/solarScore";

/**
 * POST, not the "GET /api/scores/solar/:propertyId" API.md originally
 * planned in Phase 0 — there is no `:propertyId` to look up yet, since
 * persistence is Phase 9. This mirrors the same deviation already made and
 * documented for `/api/scores/green`: the route takes the data it needs
 * directly in the body rather than reading it from a database that doesn't
 * exist yet. API.md has been updated to match.
 *
 * No service-layer wrapper either, for the same reason as `/api/scores/green`
 * — no I/O, no AdapterError to translate.
 */

const solarAssessmentSchema = z.object({
  annualGenerationKwh: z.number().positive(),
  monthlyGenerationKwh: z.array(z.number()).length(12).nullable().optional(),
  annualIrradiationKwhPerM2: z.number().positive(),
  assumptions: z.object({ peakPowerKw: z.number().positive() }),
  limitations: z.array(z.string()).nullable().optional(),
});

const bodySchema = z.object({
  solarAssessment: solarAssessmentSchema,
  averageGridIntensityGCo2PerKwh: z.number().positive().nullable().optional(),
  electricityPricePencePerKwh: z.number().positive().nullable().optional(),
  selfConsumptionRateOverride: z.number().min(0).max(1).nullable().optional(),
  hasBattery: z.boolean().nullable().optional(),
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
      {
        ok: false,
        message:
          "A valid solarAssessment (annualGenerationKwh, annualIrradiationKwhPerM2, assumptions.peakPowerKw) is required.",
      },
      { status: 400 }
    );
  }

  const solarScore = calculateSolarScore(parsed.data);

  return NextResponse.json({ ok: true, solarScore });
}
