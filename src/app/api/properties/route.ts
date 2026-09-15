import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/lib/auth";
import { LocationService } from "@/server/services/locationService";
import { prisma } from "@/server/db/client";

const locationService = new LocationService();

const bodySchema = z.object({
  postcode: z.string().min(1).max(16),
  label: z.string().max(60).nullable().optional(),
});

/**
 * The first route in this project that writes to the database. Every prior
 * phase deliberately stayed stateless (see PROGRESS.md's repeated "no
 * persistence yet — Phase 9" notes) — this is that wiring, scoped to one
 * real slice (a saved property + its GreenScore history via
 * `/api/scores/green`'s propertyId support) rather than attempting to
 * persist every phase's output at once. AiConversation, SolarScore, and
 * ActionPlan storage remain unwired — see PROGRESS.md's Phase 9 entry.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, message: "You must be logged in." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "A valid postcode is required." }, { status: 400 });
  }

  const locationResult = await locationService.resolvePostcode(parsed.data.postcode);
  if (!locationResult.ok) {
    const status = locationResult.errorKind === "not_found" ? 404 : locationResult.errorKind === "invalid_postcode" ? 400 : 503;
    return NextResponse.json({ ok: false, message: locationResult.message }, { status });
  }
  const { location } = locationResult;

  // Create the location row first, then attach it to the property with the
  // required `locationId` relation field to match the Prisma schema exactly.
  const locationRow = await prisma.location.create({
    data: {
      postcodeOutward: location.postcodeOutward,
      latitude: location.latitude,
      longitude: location.longitude,
      adminDistrict: location.adminDistrict,
      region: location.region,
      source: location.source,
    },
  });

  const property = await prisma.property.create({
    data: {
      userId: user.id,
      label: parsed.data.label ?? null,
      locationId: locationRow.id,
    },
    include: { location: true },
  });

  return NextResponse.json({ ok: true, property });
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, message: "You must be logged in." }, { status: 401 });
  }

  const properties = await prisma.property.findMany({
    where: { userId: user.id },
    include: { location: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ ok: true, properties });
}
