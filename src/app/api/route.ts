import { NextRequest, NextResponse } from "next/server";
import { getEnv, ROOT_PAGE_CONFIG, VERSION } from "@/lib/common";
import { handleQueryRequest, isRateLimited } from "@/lib/utils";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  const env = getEnv();
  const { searchParams } = request.nextUrl;

  // Rate limiting by IP
  const clientIP = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
  if (isRateLimited(clientIP)) {
    return jsonResponse({ error: "Rate limit exceeded. Try again later.", success: false }, 429);
  }

  // API key enforcement (same as original pt-gen)
  const apiKey = searchParams.get("key") || searchParams.get("apikey");
  if (env.API_KEY) {
    if (!apiKey) {
      return jsonResponse({ error: "API key required. Access denied.", success: false, need_key: true }, 401);
    }
    if (apiKey !== env.API_KEY) {
      return jsonResponse({ error: "Invalid API key. Access denied.", success: false, need_key: true }, 401);
    }
  }

  const url = searchParams.get("url") || undefined;
  const source = searchParams.get("source") || undefined;
  const query = searchParams.get("query") || searchParams.get("search") || undefined;
  const site = searchParams.get("site") || undefined;
  const sid = searchParams.get("sid") || undefined;

  // No params → show API docs
  if (!url && !source && !query && !site && !sid) {
    return jsonResponse({ ...ROOT_PAGE_CONFIG.API_DOC, version: VERSION });
  }

  const result = await handleQueryRequest({ url, source, query, site, sid }, env);
  return jsonResponse(result.body, result.status);
}

export async function POST(request: NextRequest) {
  const env = getEnv();

  const clientIP = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
  if (isRateLimited(clientIP)) {
    return jsonResponse({ error: "Rate limit exceeded. Try again later.", success: false }, 429);
  }

  const { searchParams } = request.nextUrl;
  const body = await request.json().catch(() => ({}));

  const get = (key: string, ...aliases: string[]) => {
    for (const k of [key, ...aliases]) {
      if (body[k]) return body[k];
    }
    return searchParams.get(key) || undefined;
  };

  const apiKey = get("key", "api_key", "apikey") || searchParams.get("apikey") || undefined;
  if (env.API_KEY) {
    if (!apiKey) {
      return jsonResponse({ error: "API key required. Access denied.", success: false, need_key: true }, 401);
    }
    if (apiKey !== env.API_KEY) {
      return jsonResponse({ error: "Invalid API key. Access denied.", success: false, need_key: true }, 401);
    }
  }

  const result = await handleQueryRequest({
    url: get("url"),
    source: get("source"),
    query: get("query", "search"),
    site: get("site"),
    sid: get("sid"),
  }, env);
  return jsonResponse(result.body, result.status);
}
