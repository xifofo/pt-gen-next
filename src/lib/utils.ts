/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  makeJsonResponse,
  VERSION,
  page_parser,
  fetchWithTimeout,
  type Env,
} from "./common";
import {
  generateDoubanFormat,
  generateImdbFormat,
  generateTmdbFormat,
  generateMelonFormat,
  generateBangumiFormat,
  generateSteamFormat,
  generateHongguoFormat,
  notCacheImdbFormat,
  notCacheBangumiFormat,
  notCacheSteamFormat,
  generateQQMusicFormat,
  generateDoubanBookFormat,
  generateTraktFormat,
} from "./format";
import { gen_douban } from "./douban";
import { gen_imdb } from "./imdb";
import { gen_bangumi } from "./bangumi";
import { gen_tmdb } from "./tmdb";
import { gen_melon } from "./melon";
import { gen_steam } from "./steam";
import { gen_hongguo } from "./hongguo";
import { gen_qq_music } from "./qq_music";
import { gen_douban_book } from "./douban_book";
import { gen_trakt } from "./trakt";

// ==================== Rate Limiting ====================
const TIME_WINDOW = 60000;
const MAX_REQUESTS = 30;
const CLEANUP_INTERVAL = 10000;
const requestCounts = new Map<string, number[]>();
let lastCleanup = Date.now();

export const isRateLimited = (clientIP: string): boolean => {
  const now = Date.now();
  const windowStart = now - TIME_WINDOW;
  if (now - lastCleanup > CLEANUP_INTERVAL) {
    for (const [ip, requests] of requestCounts.entries()) {
      const valid = requests.filter((t) => t > windowStart);
      if (valid.length > 0) requestCounts.set(ip, valid);
      else requestCounts.delete(ip);
    }
    lastCleanup = now;
  }
  if (requestCounts.has(clientIP)) {
    const valid = requestCounts.get(clientIP)!.filter((t) => t > windowStart);
    if (valid.length >= MAX_REQUESTS) return true;
    valid.push(now);
    requestCounts.set(clientIP, valid);
  } else {
    requestCounts.set(clientIP, [now]);
  }
  return false;
};

// ==================== Helpers ====================
export const ensureArray = (v: any) => (Array.isArray(v) ? v : v ? [v] : []);
export const safe = (v: any, fallback = "") => (v === undefined || v === null ? fallback : v);

const pick = (item: any, ...keys: string[]) => {
  if (!item || typeof item !== "object") return "";
  for (const k of keys) {
    const v = item[k];
    if (v !== undefined && v !== null) {
      try { if (String(v).trim() !== "") return v; } catch { continue; }
    }
  }
  return "";
};

const truncate = (s: any, n = 100) => {
  if (!s || n <= 0) return "";
  const str = String(s).trim();
  return str.length > n ? str.slice(0, n).trim() + "..." : str;
};

const safeGetYearFromReleaseDate = (dateStr: any) => {
  if (!dateStr || typeof dateStr !== "string") return "";
  try { return dateStr.split("-")[0] || ""; } catch { return ""; }
};

export const parseDoubanAwards = (awardsStr: string) => {
  if (!awardsStr || typeof awardsStr !== "string") return [];
  const festivals = awardsStr.split("\n\n").filter((s) => s.trim());
  return festivals.map((festival) => {
    const lines = festival.split("\n").filter((l) => l.trim());
    if (!lines.length) return null;
    return { festival: lines[0], awards: lines.slice(1) };
  }).filter(Boolean);
};

const cleanDoubanText = (text: string) => {
  if (!text) return "";
  return text.trim().replace(/\s+/g, " ").replace(/^[:：]\s*/, "").replace(/\n+/g, " ").trim();
};

export const fetchAnchorText = ($anchor: any) => {
  try {
    if (!$anchor?.length) return "";
    const element = $anchor[0];
    const nextNode = element.nextSibling;
    if (nextNode?.nodeValue) {
      const text = cleanDoubanText(nextNode.nodeValue);
      if (text) return text;
    }
    const $parent = $anchor.parent();
    if ($parent?.length) {
      let parentText = $parent.text();
      const $label = $parent.find("span.pl");
      if ($label.length) parentText = parentText.replace($label.text(), "");
      const anchorText = $anchor.text();
      if (anchorText) parentText = parentText.replace(anchorText, "");
      const cleaned = cleanDoubanText(parentText);
      if (cleaned) return cleaned;
    }
    return "";
  } catch (e: any) {
    console.warn("fetchAnchorText failed:", e.message);
    return "";
  }
};

export const parseJsonLd = ($: any) => {
  try {
    if (!$) return {};
    const $scripts = $('head > script[type="application/ld+json"]');
    if (!$scripts.length) return {};
    const script = $scripts.first().html();
    if (!script) return {};
    return JSON.parse(script.replace(/[\r\n\t\s]+/g, " ").trim()) || {};
  } catch (e: any) {
    console.warn("JSON-LD parsing error:", e.message);
    return {};
  }
};

// ==================== Search ====================
const IMDB_SUGGESTION_URL = "https://v2.sg.media-imdb.com/suggestion/h/";
const IMDB_FIND_URL = "https://www.imdb.com/find";
const IMDB_BASE_URL = "https://www.imdb.com";
const IMDB_SEARCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

const LINK_TEMPLATES: Record<string, any> = {
  douban: (id: string) => `https://movie.douban.com/subject/${id}/`,
  imdb: (id: string) => `https://www.imdb.com/title/${id}/`,
  tmdb: (item: any, id: any) => `https://www.themoviedb.org/${item.media_type === "tv" ? "tv" : "movie"}/${id}`,
  trakt: (item: any, id: any) => {
    const t = item.type === "shows" || String(id).startsWith("shows") ? "shows" : "movies";
    return `https://app.trakt.tv/${t}/${item.ids?.slug || String(id).split("/")[1]}`;
  },
};

const buildLink = (item: any, source: string) => {
  if (!item || typeof item !== "object") return "";
  if (item.link) return String(item.link);
  if (item.url) return String(item.url);
  const id = pick(item, "id", "imdb_id", "douban_id", "tt", "doubanId");
  if (!id) return "";
  const tmpl = LINK_TEMPLATES[source];
  return tmpl ? (source === "tmdb" || source === "trakt" ? tmpl(item, id) : tmpl(id)) : "";
};

const processSearchResults = (results: any[], source: string) => {
  if (!Array.isArray(results) || !results.length) return { data: [] };
  const processors: Record<string, (item: any) => any> = {
    douban: (item) => ({
      year: pick(item, "year"), subtype: pick(item, "type") || "movie",
      title: item.data?.length ? pick(item.data[0], "name") : "",
      subtitle: String(item.data?.length ? pick(item.data[0], "description") : ""),
      link: buildLink(item, "douban"), id: pick(item, "doubanId"),
      rating: String(pick(item, "doubanRating") || ""), img: pick(item, "img"),
    }),
    imdb: (item) => ({
      year: pick(item, "y"), subtype: pick(item, "qid"), title: pick(item, "l"),
      subtitle: pick(item, "s"),
      link: item.id ? `https://www.imdb.com/title/${item.id}/` : buildLink(item, "imdb"),
      id: pick(item, "id"),
    }),
    tmdb: (item) => {
      const cn = pick(item, "name", "title");
      const en = pick(item, "original_name", "original_title");
      const title = cn && en && cn !== en ? `${cn} / ${en}` : cn || en;
      return {
        year: safeGetYearFromReleaseDate(item.release_date), subtype: item.media_type === "tv" ? "tv" : "movie",
        title, subtitle: truncate(pick(item, "overview"), 100),
        link: buildLink(item, "tmdb"), rating: item.vote_average != null ? String(item.vote_average) : "",
        id: pick(item, "id"),
      };
    },
  };
  const proc = processors[source] || ((item: any) => ({
    year: pick(item, "year", "y") || safeGetYearFromReleaseDate(item.release_date) || "",
    subtype: pick(item, "subtype", "type", "q") || "movie",
    title: pick(item, "title", "l") || "", subtitle: pick(item, "subtitle", "s") || "",
    link: buildLink(item, source) || "", id: pick(item, "id"),
  }));
  return { data: results.slice(0, 10).map((r) => proc(r && typeof r === "object" ? r : {})) };
};

const search_imdb = async (query: string) => {
  try {
    // API search
    const apiUrl = `${IMDB_SUGGESTION_URL}${encodeURIComponent(query)}.json`;
    const apiResp = await fetch(apiUrl).catch(() => null);
    if (apiResp?.ok) {
      const apiData = await apiResp.json() as any;
      const results = apiData?.d ?? [];
      if (results.length) return { success: true, data: processSearchResults(results, "imdb").data };
    }
    // Fallback scraping
    const scrapeResp = await fetch(`${IMDB_FIND_URL}?q=${encodeURIComponent(query)}&s=tt`, { headers: IMDB_SEARCH_HEADERS }).catch(() => null);
    if (scrapeResp?.ok) {
      const html = await scrapeResp.text();
      const $ = page_parser(html);
      const results: any[] = [];
      $(".findResult").slice(0, 10).each((_: any, el: any) => {
        const $rt = $(el).find(".result_text");
        const $a = $rt.find("a");
        const href = $a.attr("href") || "";
        const idM = href.match(/\/title\/(tt\d+)/);
        if (!idM) return;
        const title = $a.text().trim();
        const full = $rt.text();
        const ym = full.match(/\((\d{4})\)/);
        results.push({ year: ym?.[1] || "", subtype: "feature", title, subtitle: full.replace(title, "").trim(), link: `${IMDB_BASE_URL}${href}` });
      });
      if (results.length) return { success: true, data: results };
    }
    return { success: false, error: "未找到查询的结果 | No results found", data: [] };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e), data: [] };
  }
};

const search_douban = async (query: string) => {
  if (!query) return { success: false, error: "Invalid query", data: [] };
  try {
    const resp = await fetch(`https://api.wmdb.tv/api/v1/movie/search?q=${encodeURIComponent(query)}&skip=0&lang=Cn`);
    if (!resp.ok) {
      if (resp.status === 429) return { success: false, error: "请求过于频繁，请等待30秒后再试", data: [] };
      return { success: false, error: "豆瓣API请求失败", data: [] };
    }
    const data = await resp.json() as any;
    if (Array.isArray(data) && data.length > 0) return { success: true, data: processSearchResults(data, "douban").data };
    return { success: false, error: "未找到查询的结果 | No results found", data: [] };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e), data: [] };
  }
};

const search_tmdb = async (query: string, env: Env) => {
  const apiKey = env?.TMDB_API_KEY;
  if (!apiKey) return { success: false, error: "TMDB API密钥未配置", data: [] };
  const q = String(query || "").trim();
  if (!q) return { success: false, error: "Invalid query", data: [] };
  try {
    const [movieResp, tvResp] = await Promise.all([
      fetchWithTimeout(`https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&language=zh-CN&query=${encodeURIComponent(q)}`, {}, 8000),
      fetchWithTimeout(`https://api.themoviedb.org/3/search/tv?api_key=${apiKey}&language=zh-CN&query=${encodeURIComponent(q)}`, {}, 8000),
    ]);
    const parse = async (r: Response, type: string) => {
      if (!r?.ok) return [];
      const { results = [] } = await r.json() as any;
      return results.map((i: any) => ({ ...i, media_type: type }));
    };
    const [movies, tvs] = await Promise.all([parse(movieResp, "movie"), parse(tvResp, "tv")]);
    const combined = [...movies, ...tvs].sort((a, b) => (b.popularity || 0) - (a.popularity || 0)).slice(0, 10);
    if (combined.length) return { success: true, data: processSearchResults(combined, "tmdb").data };
    return { success: false, error: "未找到查询的结果 | No results found", data: [] };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e), data: [] };
  }
};

const isChineseText = (text: string) => {
  if (typeof text !== "string" || !text.trim()) return false;
  const cn = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length;
  const en = (text.match(/[a-zA-Z]/g) || []).length;
  if (cn + en < 2) return cn > 0;
  return cn > en;
};

// ==================== Static CDN Fallback ====================
const processAwardsIfNeeded = (data: any, site: string) => {
  if (site === "douban" && data.awards && typeof data.awards === "string") {
    data.awards = parseDoubanAwards(data.awards);
  }
  return data;
};

export const getStaticMediaDataFromOurBits = async (source: string, sid: any) => {
  const site = source.toLowerCase();
  const trimmedSid = String(sid).trim();
  const urls = [
    `https://cdn.ourhelp.club/ptgen/${encodeURIComponent(site)}/${encodeURIComponent(trimmedSid)}.json`,
    `https://ourbits.github.io/PtGen/${encodeURIComponent(site)}/${encodeURIComponent(trimmedSid)}.json`,
  ];
  for (const url of urls) {
    try {
      const r = await fetchWithTimeout(url, {});
      if (r.ok) {
        const d = await r.json();
        if (d && Object.keys(d as object).length > 0) return processAwardsIfNeeded(d, site);
      }
    } catch { /* ignore */ }
  }
  // Dynamic API
  try {
    const r = await fetchWithTimeout(`https://api.ourhelp.club/infogen?site=${encodeURIComponent(site)}&sid=${encodeURIComponent(trimmedSid)}`, { headers: { "User-Agent": `PT-Gen-Next/${VERSION}` } });
    if (r.ok) {
      const result = await r.json() as any;
      if (result) { processAwardsIfNeeded(result.data || result, site); return result; }
    }
  } catch { /* ignore */ }
  return null;
};

// ==================== In-Memory Cache ====================
const memoryCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 3600000;

const withCache = async (resourceId: string, fetchFn: () => Promise<any>, env: Env, source: string, subType: string | null = null) => {
  const noCache = ["douban", "imdb", "bangumi", "steam"];
  if (env.ENABLED_CACHE === "false" && noCache.includes(source)) return await fetchFn();
  const key = subType ? `${source}_${subType}_${resourceId}` : `${source}_${resourceId}`;
  const cached = memoryCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    console.log(`[Cache Hit] ${key}`);
    return cached.data;
  }
  const fresh = await fetchFn();
  if (fresh?.success === true) {
    const d = { ...fresh }; delete d.format;
    memoryCache.set(key, { data: d, ts: Date.now() });
  }
  return fresh;
};

// ==================== URL Providers ====================
type Provider = {
  name: string;
  domains: string[];
  regex: RegExp;
  idFormatter?: (match: RegExpMatchArray) => string;
  generator: (sid: any, env: any) => Promise<any>;
  formatter: (data: any, env: Env) => string;
};

const URL_PROVIDERS: Provider[] = [
  { name: "douban", domains: ["movie.douban.com"], regex: /\/subject\/(\d+)/, generator: gen_douban, formatter: (d) => generateDoubanFormat(d) },
  { name: "douban_book", domains: ["book.douban.com"], regex: /\/subject\/(\d+)/, generator: gen_douban_book, formatter: (d) => generateDoubanBookFormat(d) },
  {
    name: "imdb", domains: ["www.imdb.com"], regex: /\/title\/(tt\d+)/, generator: gen_imdb,
    formatter: (d, env) => (d._from_ourbits || env.ENABLED_CACHE === "false") ? notCacheImdbFormat(d) : generateImdbFormat(d),
  },
  { name: "tmdb", domains: ["api.themoviedb.org", "www.themoviedb.org"], regex: /\/(movie|tv)\/(\d+)/, idFormatter: (m) => `${m[1]}/${m[2]}`, generator: gen_tmdb, formatter: (d) => generateTmdbFormat(d) },
  { name: "melon", domains: ["www.melon.com"], regex: /\/album\/detail\.htm\?albumId=(\d+)/, idFormatter: (m) => `album/${m[1]}`, generator: gen_melon, formatter: (d) => generateMelonFormat(d) },
  {
    name: "bangumi", domains: ["bgm.tv", "bangumi.tv"], regex: /\/subject\/(\d+)/, generator: gen_bangumi,
    formatter: (d, env) => env.ENABLED_CACHE === "false" ? notCacheBangumiFormat(d) : generateBangumiFormat(d),
  },
  {
    name: "steam", domains: ["store.steampowered.com"], regex: /\/app\/(\d+)/, generator: gen_steam,
    formatter: (d, env) => env.ENABLED_CACHE === "false" ? notCacheSteamFormat(d) : generateSteamFormat(d),
  },
  { name: "hongguo", domains: ["novelquickapp.com"], regex: /(?:s\/([A-Za-z0-9_-]+)|series_id=(\d+))/, idFormatter: (m) => m[1] || m[2], generator: gen_hongguo, formatter: (d) => generateHongguoFormat(d) },
  { name: "qq_music", domains: ["y.qq.com"], regex: /\/albumDetail\/([A-Za-z0-9]+)/, generator: gen_qq_music, formatter: (d) => generateQQMusicFormat(d) },
  { name: "trakt", domains: ["app.trakt.tv", "trakt.tv"], regex: /\/(movies|shows)\/([a-z0-9-]+)/, idFormatter: (m) => `${m[1]}/${m[2]}`, generator: gen_trakt, formatter: (d) => generateTraktFormat(d) },
];

const PROVIDER_CONFIG: Record<string, { generator: (...args: any[]) => Promise<any>; formatter: (...args: any[]) => string }> = {
  douban: { generator: gen_douban, formatter: generateDoubanFormat },
  imdb: { generator: gen_imdb, formatter: generateImdbFormat },
  tmdb: { generator: gen_tmdb, formatter: generateTmdbFormat },
  bangumi: { generator: gen_bangumi, formatter: generateBangumiFormat },
  melon: { generator: gen_melon, formatter: generateMelonFormat },
  steam: { generator: gen_steam, formatter: generateSteamFormat },
  hongguo: { generator: gen_hongguo, formatter: generateHongguoFormat },
  qq_music: { generator: gen_qq_music, formatter: generateQQMusicFormat },
  douban_book: { generator: gen_douban_book, formatter: generateDoubanBookFormat },
  trakt: { generator: gen_trakt, formatter: generateTraktFormat },
};

// ==================== Request Handling ====================
const parseUrlInput = (urlStr: string): { provider: Provider; sid: string; subType?: string } | null => {
  try {
    const urlObj = new URL(urlStr);
    const hostname = urlObj.hostname.toLowerCase();
    for (const p of URL_PROVIDERS) {
      if (!p.domains.some((d) => hostname === d || hostname.endsWith(`.${d}`))) continue;
      const match = urlStr.match(p.regex);
      if (!match) continue;
      const sid = p.idFormatter ? p.idFormatter(match) : match[1];
      const subType = p.name === "tmdb" || p.name === "trakt" ? match[1] : undefined;
      return { provider: p, sid, subType };
    }
  } catch { /* invalid URL */ }
  return null;
};

const handleUrlRequest = async (urlStr: string, env: Env) => {
  const parsed = parseUrlInput(urlStr);
  if (!parsed) return makeJsonResponse({ error: `Unsupported URL: ${urlStr}` }, env, 400);

  const { provider, sid, subType } = parsed;
  try {
    const data = await withCache(sid, () => provider.generator(sid, env), env, provider.name, subType || null);
    if (!data || data.error) {
      return makeJsonResponse({ error: data?.error || "Failed to fetch data", success: false }, env, 404);
    }
    const format = provider.formatter(data, env);
    return makeJsonResponse({ ...data, format, success: true }, env);
  } catch (e: any) {
    return makeJsonResponse({ error: e?.message || "Internal error", success: false }, env, 500);
  }
};

const handleSearchRequest = async (source: string, query: string, env: Env) => {
  if (!query) return makeJsonResponse({ error: "Missing query parameter", success: false }, env, 400);

  let result: any;
  switch (source) {
    case "douban": result = await search_douban(query); break;
    case "imdb": result = await search_imdb(query); break;
    case "tmdb": result = await search_tmdb(query, env); break;
    default:
      return makeJsonResponse({ error: `Unsupported search source: ${source}`, success: false }, env, 400);
  }
  return makeJsonResponse(result, env, result?.success ? 200 : (result?.status || 404));
};

const handleAutoSearch = async (query: string, env: Env) => {
  if (!query) return makeJsonResponse({ error: "Missing query", success: false }, env, 400);
  const source = isChineseText(query) ? "douban" : "imdb";
  return handleSearchRequest(source, query, env);
};

export const handleQueryRequest = async (params: {
  url?: string;
  source?: string;
  query?: string;
  search?: string;
  site?: string;
  sid?: string;
}, env: Env) => {
  const { url, source, query, search, site, sid } = params;

  // URL-based generation
  if (url) return handleUrlRequest(url, env);

  // Search
  const searchQuery = query || search || "";
  if (source && searchQuery) return handleSearchRequest(source, searchQuery, env);
  if (searchQuery) return handleAutoSearch(searchQuery, env);

  // site + sid direct generation (compatible with original pt-gen-cfworker)
  if (site && sid) {
    const siteLower = site.toLowerCase();
    const provider = PROVIDER_CONFIG[siteLower];
    if (!provider) {
      return makeJsonResponse({ error: `Unsupported site: ${site}` }, env, 400);
    }
    try {
      const subType = (siteLower === "tmdb" || siteLower === "trakt") ? sid.split("/")[0] || null : null;
      const data = await withCache(sid, () => provider.generator(sid, env), env, siteLower, subType);
      if (!data || data.error) {
        return makeJsonResponse({ error: data?.error || "Failed to fetch data", success: false }, env, 404);
      }
      const format = provider.formatter(data, env);
      return makeJsonResponse({ ...data, format, success: true }, env);
    } catch (e: any) {
      return makeJsonResponse({ error: e?.message || "Internal error", success: false }, env, 500);
    }
  }

  return makeJsonResponse({ error: "Miss key of `site` or `sid` , or input unsupported resource `url`.", success: false }, env, 400);
};

export { isChineseText, URL_PROVIDERS, PROVIDER_CONFIG };
