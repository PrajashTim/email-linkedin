import { NextRequest, NextResponse } from "next/server";

const fallback = {
  stats: { total: 8699, verified: 412, openProfile: 0, ready: 186 },
  pipeline: { status: "ready", nextRow: 698, endRow: 8700 },
  leads: [],
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const endpoint = process.env.SHEET_API_URL;
  const token = process.env.SHEET_API_TOKEN;

  if (!endpoint || !token) {
    if (body.action === "list") return NextResponse.json(fallback);
    return NextResponse.json({ ok: false, mode: "preview" }, { status: 503 });
  }

  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, token }),
      redirect: "follow",
      cache: "no-store",
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.ok ? 200 : upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") || "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Sheet backend unavailable" }, { status: 502 });
  }
}
