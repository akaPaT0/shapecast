import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ error: "Deprecated endpoint. Polling happens client-side." }, { status: 404 });
}
