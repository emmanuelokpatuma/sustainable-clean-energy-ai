import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { LocationService } from "@/server/services/locationService";

const bodySchema = z.object({
  postcode: z.string().min(1).max(16),
});

const locationService = new LocationService();

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
      { ok: false, message: "A postcode is required." },
      { status: 400 }
    );
  }

  const result = await locationService.resolvePostcode(parsed.data.postcode);

  if (!result.ok) {
    const status =
      result.errorKind === "invalid_postcode"
        ? 400
        : result.errorKind === "not_found"
          ? 404
          : 503;
    return NextResponse.json(
      { ok: false, message: result.message },
      { status }
    );
  }

  return NextResponse.json({ ok: true, location: result.location });
}
