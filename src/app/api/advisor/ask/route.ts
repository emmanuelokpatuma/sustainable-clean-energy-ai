import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AiAdvisorService } from "@/server/services/aiAdvisorService";

const advisorService = new AiAdvisorService();

const componentScoreSchema = z.object({
  key: z.string(),
  label: z.string(),
  included: z.boolean(),
  score: z.number().nullable(),
  baseWeight: z.number(),
  effectiveWeight: z.number(),
  level: z.enum(["High", "Medium", "Low"]).nullable(),
  explanation: z.string(),
});

const greenScoreSchema = z.object({
  totalScore: z.number(),
  formulaVersion: z.string(),
  componentScores: z.array(componentScoreSchema),
  strengths: z.array(z.string()),
  opportunities: z.array(z.string()),
  assumptions: z.array(z.string()),
  dataSources: z.array(z.string()),
  calculatedAt: z.string(),
});

const solarScoreSchema = z.object({
  formulaVersion: z.string(),
  suitability: z.enum(["High", "Medium", "Low"]),
  suitabilitySubScore: z.number(),
  annualGenerationKwh: z.number(),
  generationPerKwp: z.number(),
  monthlyGenerationKwh: z.array(z.number()).nullable(),
  solarResource: z.object({ annualIrradiationKwhPerM2: z.number() }),
  emissionsReduction: z.object({
    annualKgCo2: z.number(),
    gridIntensityGCo2PerKwh: z.number(),
    isAssumedGridIntensity: z.boolean(),
  }),
  financialOpportunity: z.union([
    z.object({
      available: z.literal(true),
      indicativeAnnualSavingGBP: z.number(),
      selfConsumptionRateAssumed: z.number(),
      electricityPricePencePerKwh: z.number(),
    }),
    z.object({ available: z.literal(false), reason: z.string() }),
  ]),
  confidence: z.string(),
  assumptions: z.array(z.string()),
  limitations: z.array(z.string()),
  dataSources: z.array(z.string()),
  calculatedAt: z.string(),
});

const energyNowSchema = z.object({
  current: z.object({
    index: z.string(),
    actual: z.number().nullable(),
    from: z.string(),
    to: z.string(),
  }),
  interpretation: z.object({
    currentSummary: z.string(),
    currentIndex: z.string(),
    flexibleUseSuggestion: z.union([
      z.object({
        available: z.literal(true),
        from: z.string(),
        to: z.string(),
        timingLabel: z.string(),
        forecastGCo2PerKwh: z.number(),
        index: z.string(),
        message: z.string(),
      }),
      z.object({ available: z.literal(false), reason: z.string() }),
    ]),
    essentialServicesCaveat: z.string(),
    forecastDisclaimer: z.string(),
  }),
  retrievedAt: z.string(),
  isFixture: z.boolean(),
});

const bodySchema = z.object({
  groundingContext: z.object({
    location: z
      .object({
        postcodeOutward: z.string(),
        region: z.string().nullable(),
        adminDistrict: z.string().nullable(),
      })
      .nullable()
      .optional(),
    greenScore: greenScoreSchema.nullable().optional(),
    solarScore: solarScoreSchema.nullable().optional(),
    energyNow: energyNowSchema.nullable().optional(),
    recommendations: z
      .array(z.object({ title: z.string(), explanation: z.string(), priority: z.number() }))
      .nullable()
      .optional(),
  }),
  conversationHistory: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .max(50) // service-level minimisation caps this further; this just bounds request size
    .optional(),
  question: z.string().min(1).max(2000),
});

/**
 * POST — this is a conversational action, not a resource read, and always
 * needs a body (the question plus the grounding context). Persistence
 * (`AiConversation` in the Phase 0 schema) is not wired up yet — Phase 9,
 * same as every other route so far — so this route computes and returns an
 * answer without saving anything server-side.
 */
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
      { ok: false, message: "The request body did not match the expected shape." },
      { status: 400 }
    );
  }

  const result = await advisorService.ask({
    groundingContext: parsed.data.groundingContext,
    conversationHistory: parsed.data.conversationHistory,
    question: parsed.data.question,
  });

  if (!result.ok) {
    const status = result.errorKind === "invalid_input" ? 400 : 503;
    return NextResponse.json({ ok: false, message: result.message }, { status });
  }

  return NextResponse.json({ ok: true, ...result.data });
}
