import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { calculateGreenScore } from "@/server/calculations/greenScore";
import { getCurrentUser } from "@/server/lib/auth";
import { prisma } from "@/server/db/client";

/**
 * No service-layer wrapper here, unlike Location/CarbonIntensity/Solar.
 * Those services exist to translate an AdapterError into a user-safe Result
 * — there is no adapter here, no network call, and no failure mode besides
 * "the caller didn't provide enough data", which `calculateGreenScore`
 * already reports as a typed outcome. A pass-through service class would add
 * a layer with nothing to do (see PRODUCT_SPEC.md: "do not over-engineer
 * features that are not required").
 *
 * Phase 9 addition: an optional `propertyId`. When supplied AND the caller
 * is authenticated AND owns that property, the computed result is also
 * persisted to the GreenScore table — this route's core behaviour
 * (computing a score from whatever data is provided) is completely
 * unchanged for every caller that doesn't pass one.
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
  propertyId: z.string().nullable().optional(),
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

  let saved = false;
  if (parsed.data.propertyId) {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json(
        { ok: false, message: "You must be logged in to save a GreenScore to a property." },
        { status: 401 }
      );
    }
    const property = await prisma.property.findUnique({ where: { id: parsed.data.propertyId } });
    if (!property || property.userId !== user.id) {
      // 404, not 403 — matches /api/properties/[id]/green-scores's same
      // choice: don't confirm to a non-owner that a given property ID
      // exists at all.
      return NextResponse.json(
        { ok: false, message: "That property was not found for your account." },
        { status: 404 }
      );
    }

    const result = outcome.result;
    await prisma.greenScore.create({
      data: {
        propertyId: property.id,
        totalScore: result.totalScore,
        formulaVersion: result.formulaVersion,
        componentScoresJson: result.componentScores,
        strengthsJson: result.strengths,
        opportunitiesJson: result.opportunities,
        assumptionsJson: result.assumptions,
        dataSourcesJson: result.dataSources,
        calculatedAt: new Date(result.calculatedAt),
      },
    });
    saved = true;
  }

  return NextResponse.json({ ok: true, greenScore: outcome.result, saved });
}
