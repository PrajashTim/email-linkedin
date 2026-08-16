import { NextRequest, NextResponse } from "next/server";

const fallback = {
  stats: { total: 8699, verified: 412, openProfile: 0, ready: 186 },
  pipeline: { status: "ready", nextRow: 698, endRow: 8700 },
  leads: [],
};

type SupabaseLead = {
  row_number: number;
  company: string;
  city: string;
  website: string;
  person: string;
  title: string;
  linkedin: string;
  email: string;
  youtube: string;
  signal: string;
  message: string;
  match_score: number | string;
  match_status: string;
  eligibility: string;
  channel: string;
  connection_status: string;
  enrichment_status: string;
};

function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  const token = process.env.LEADGEN_SYNC_TOKEN;
  return url && key && token ? { url, key, token } : null;
}

function asDashboardLead(lead: SupabaseLead) {
  return {
    row: lead.row_number,
    company: lead.company,
    city: lead.city,
    website: lead.website,
    person: lead.person,
    title: lead.title,
    linkedIn: lead.linkedin,
    email: lead.email,
    youtube: lead.youtube,
    signal: lead.signal,
    message: lead.message,
    matchScore: Number(lead.match_score) || 0,
    matchStatus: lead.match_status,
    eligibility: lead.eligibility,
    channel: lead.channel,
    connectionStatus: lead.connection_status,
    enrichmentStatus: lead.enrichment_status,
  };
}

async function listFromSupabase(body: Record<string, unknown>) {
  const config = supabaseConfig();
  if (!config) return null;
  const limit = Math.min(200, Math.max(10, Number(body.limit) || 80));
  const offset = Math.max(0, Number(body.offset) || 0);
  const headers = { apikey: config.key, "content-type": "application/json" };
  const response = await fetch(`${config.url}/rest/v1/rpc/leadgen_read_page`, {
    method: "POST",
    headers,
    body: JSON.stringify({ p_token: config.token, p_limit: limit, p_offset: offset }),
    cache: "no-store",
  });
  if (!response.ok) return null;
  const leads = (await response.json()) as SupabaseLead[];
  const countResponse = await fetch(`${config.url}/rest/v1/rpc/leadgen_count`, {
    method: "POST",
    headers,
    body: JSON.stringify({ p_token: config.token }),
    cache: "no-store",
  });
  const total = countResponse.ok ? Number(await countResponse.json()) || 0 : 0;
  if (!total) return null;

  const metaResponse = await fetch(`${config.url}/rest/v1/rpc/leadgen_read_meta`, {
    method: "POST",
    headers,
    body: JSON.stringify({ p_token: config.token }),
    cache: "no-store",
  });
  const meta = metaResponse.ok ? (await metaResponse.json() as { stats?: unknown; pipeline?: unknown }) : undefined;
  return {
    leads: leads.map(asDashboardLead),
    stats: meta?.stats || { total, verified: 0, openProfile: 0, ready: 0 },
    pipeline: meta?.pipeline || { status: "syncing", nextRow: 2, endRow: 0, processed: 0, found: 0, errors: 0 },
    pagination: { offset, limit, returned: leads.length, totalCandidates: total, hasMore: offset + leads.length < total },
    source: "supabase",
  };
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const endpoint = process.env.SHEET_API_URL;
  const token = process.env.SHEET_API_TOKEN;

  if (body.action === "list") {
    try {
      const mirror = await listFromSupabase(body);
      if (mirror) return NextResponse.json(mirror);
    } catch {
      // Sheet3 remains the safe fallback while the mirror reconnects.
    }
  }

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
