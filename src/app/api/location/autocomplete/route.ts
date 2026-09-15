import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/server/lib/env";

export async function GET(req: NextRequest) {
  const rawPostcode = req.nextUrl.searchParams.get("postcode")?.trim();

  if (!rawPostcode) {
    return NextResponse.json(
      { ok: false, message: "A postcode is required." },
      { status: 400 }
    );
  }

  const normalized = rawPostcode.toUpperCase().replace(/\s+/g, " ").trim();
  const outward = normalized.split(" ")[0] || normalized;
  const env = getEnv();
  const url = `${env.POSTCODES_IO_BASE_URL}/postcodes/${encodeURIComponent(outward)}/autocomplete`;

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return NextResponse.json(
        { ok: true, properties: [], message: "No addresses found for this postcode." },
        { status: 200 }
      );
    }

    const json = (await response.json()) as { result?: string[] };
    const properties = Array.isArray(json.result)
      ? json.result.map((entry, index) => ({
          id: `${entry}-${index}`,
          formatted: entry,
        }))
      : [];

    return NextResponse.json({ ok: true, properties });
  } catch {
    return NextResponse.json(
      { ok: true, properties: [], message: "Address lookup is temporarily unavailable." },
      { status: 200 }
    );
  }
}
