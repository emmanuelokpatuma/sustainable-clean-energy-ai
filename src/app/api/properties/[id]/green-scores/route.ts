import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/lib/auth";
import { prisma } from "@/server/db/client";

/**
 * Realises the "GET /api/scores/solar/:propertyId"-style idea API.md
 * originally sketched in Phase 0 before persistence existed to back it —
 * for GreenScore rather than SolarScore, since that's the slice Phase 9
 * actually wired. Every entry saved via `POST /api/scores/green`'s
 * `propertyId` option shows up here, oldest first is NOT assumed — ordered
 * newest first, matching how someone would want to see "my score over
 * time" (most recent first, with the option to scroll back).
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, message: "You must be logged in." }, { status: 401 });
  }

  const property = await prisma.property.findUnique({ where: { id: params.id } });
  if (!property || property.userId !== user.id) {
    return NextResponse.json({ ok: false, message: "That property was not found for your account." }, { status: 404 });
  }

  const greenScores = await prisma.greenScore.findMany({
    where: { propertyId: params.id },
    orderBy: { calculatedAt: "desc" },
  });

  return NextResponse.json({ ok: true, greenScores });
}
