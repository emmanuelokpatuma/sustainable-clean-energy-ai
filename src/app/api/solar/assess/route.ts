import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SolarService } from "@/server/services/solarService";

// POST, not GET: unlike /api/energy/current, this always requires a specific
// location, so it takes a body rather than being a bare resource fetch.
const bodySchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  // Optional overrides for the default system assumptions (see
  // DEFAULT_SOLAR_ASSUMPTIONS in pvgisAdapter.ts). Not exposed in the UI yet —
  // present so a future "what if I had a bigger system" feature doesn't need
  // a route change.
  assumptions: z
    .object({
      peakPowerKw: z.number().positive().optional(),
      lossPercent: z.number().min(0).max(100).optional(),
      tiltDeg: z.number().min(0).max(90).optional(),
      azimuthDeg: z.number().min(-180).max(180).optional(),
      mountingType: z.enum(["building", "free"]).optional(),
      radiationDatabase: z.string().optional(),
    })
    .optional(),
});

const solarService = new SolarService();

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
      { ok: false, message: "A valid latitude and longitude are required." },
      { status: 400 }
    );
  }

  const result = await solarService.getSolarAssessment(
    parsed.data.latitude,
    parsed.data.longitude,
    parsed.data.assumptions
  );

  if (!result.ok) {
    const status = result.errorKind === "invalid_location" ? 422 : 503;
    return NextResponse.json({ ok: false, message: result.message }, { status });
  }

  return NextResponse.json({ ok: true, solarAssessment: result.assessment });
}
