import { NextRequest, NextResponse } from "next/server";
import { CarbonIntensityService } from "@/server/services/carbonIntensityService";
import { interpretEnergyNow } from "@/server/calculations/energyNowInterpretation";

const carbonIntensityService = new CarbonIntensityService();

/**
 * GET, not POST — this is a read of GB-wide national data with no request
 * body needed (see `CarbonIntensityService`'s note on why there's no location
 * parameter yet). API.md's earlier "planned routes" table listed this as
 * POST before it was built; GET is the correct choice now that the real
 * shape is known, and API.md has been updated to match.
 *
 * Phase 6 addition: the response now also includes `interpretation`, computed
 * by the pure `interpretEnergyNow` engine from the same data this route
 * already fetches. Folded into this route rather than a separate endpoint so
 * the Energy Now screen needs exactly one request — the raw data and its
 * interpretation are never out of sync with each other because they're
 * computed from the same fetch, in the same response.
 */
export async function GET(req: NextRequest) {
  const forecastHoursParam = req.nextUrl.searchParams.get("forecastHours");
  const forecastHours = forecastHoursParam ? Number(forecastHoursParam) : undefined;

  if (forecastHoursParam !== null && (!Number.isFinite(forecastHours) || forecastHours! <= 0)) {
    return NextResponse.json(
      { ok: false, message: "forecastHours must be a positive number." },
      { status: 400 }
    );
  }

  const result = await carbonIntensityService.getEnergyNow({ forecastHours });

  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: 503 });
  }

  const interpretation = interpretEnergyNow({
    current: result.data.current,
    forecast: result.data.forecast,
  });

  return NextResponse.json({ ok: true, energyNow: result.data, interpretation });
}
