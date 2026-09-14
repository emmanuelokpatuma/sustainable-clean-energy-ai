import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AiAdvisorService } from "@/server/services/aiAdvisorService";
import {
  greenScoreResultSchema,
  solarScoreResultSchema,
  energyNowContextSchema,
  recommendedActionSchema,
} from "@/server/validation/resultSchemas";

const advisorService = new AiAdvisorService();

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
    greenScore: greenScoreResultSchema.nullable().optional(),
    solarScore: solarScoreResultSchema.nullable().optional(),
    energyNow: energyNowContextSchema.nullable().optional(),
    recommendations: z.array(recommendedActionSchema).nullable().optional(),
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
