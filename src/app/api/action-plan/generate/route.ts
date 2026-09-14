import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateActionPlan } from "@/server/calculations/actionPlan";
import {
  greenScoreResultSchema,
  solarScoreResultSchema,
  energyNowContextSchema,
} from "@/server/validation/resultSchemas";

/**
 * No service-layer wrapper, same reasoning as `/api/scores/green` and
 * `/api/scores/solar`: `generateActionPlan` is a pure calculation with no
 * I/O and no failure mode beyond input validation, which Zod already
 * handles at this boundary.
 */

const bodySchema = z.object({
  greenScore: greenScoreResultSchema.nullable().optional(),
  solarScore: solarScoreResultSchema.nullable().optional(),
  energyNow: energyNowContextSchema.nullable().optional(),
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

  const actionPlan = generateActionPlan(parsed.data);

  return NextResponse.json({ ok: true, actionPlan });
}
