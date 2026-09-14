import { NextRequest, NextResponse } from "next/server";
import { CarbonIntensityService } from "@/server/services/carbonIntensityService";

const carbonIntensityService = new CarbonIntensityService();

/**
 * GET, not POST — this is a read of GB-wide national data with no request
 * body needed (see `CarbonIntensityService`'s note on why there's no location
 * parameter yet). API.md's earlier "planned routes" table listed this as
 * POST before it was built; GET is the correct choice now that the real
 * shape is known, and API.md has been updated to match.
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

  return NextResponse.json({ ok: true, energyNow: result.data });
}
