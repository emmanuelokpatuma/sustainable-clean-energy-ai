import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ ok: true, user: null });
  }
  return NextResponse.json({ ok: true, user });
}
