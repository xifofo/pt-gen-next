/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from 'cheerio';
import { createHash } from 'crypto';

export const AUTHOR = "Hares";
export const VERSION = "1.0.7";
export const NONE_EXIST_ERROR = "The corresponding resource does not exist.";
export const DEFAULT_TIMEOUT = 15000;
export const ANTI_BOT_PATTERNS = /验证码|检测到有异常请求|机器人程序|访问受限|请先登录/i;
export const NOT_FOUND_PATTERN = /你想访问的页面不存在/;
export const ANTI_BOT_ERROR = 'Douban blocked request (captcha/anti-bot). Provide valid cookie or try later.';

export const ROOT_PAGE_CONFIG = {
  API_DOC: {
    "API Status": "PT-Gen API Service is running",
    "Endpoints": {
      "/": "API documentation (this page)",
      "/?source=[douban|imdb|tmdb|bgm|melon]&query=[name]": "Search for media by name",
      "/?url=[media_url]": "Generate media description by URL"
    },
    "Notes": "Please use the appropriate source and query parameters for search, or provide a direct URL for generation."
  }
};

export const DOUBAN_REQUEST_HEADERS_BASE: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8",
  "Accept-Encoding": "gzip, deflate, br, zstd",
  "Cache-control": "max-age=0",
  Connection: "keep-alive",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "sec-ch-ua":
    '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
};

const JSONP_REGEX = /^[^(]+\(\s*([\s\S]+?)\s*\);?$/i;
const DEFAULT_BODY_TEMPLATE = Object.freeze({
  success: false,
  error: null as string | null,
  format: '',
  version: VERSION,
  generate_at: 0
});

export const isAntiBot = (text: string) => text && ANTI_BOT_PATTERNS.test(text);

const DOUBAN_MOBILE_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  Referer: 'https://movie.douban.com/',
};

const mergeCookies = (...parts: (string | undefined)[]) =>
  parts.filter(Boolean).join('; ');

export const buildHeaders = (env: any = {}) => ({
  ...DOUBAN_REQUEST_HEADERS_BASE,
  ...(env?.DOUBAN_COOKIE && { Cookie: env.DOUBAN_COOKIE }),
});

/**
 * Warmup: hit douban.com to get a bid cookie (redirect:manual to avoid challenge).
 */
const warmupBidCookie = async (headers: Record<string, string>, timeout: number): Promise<string> => {
  try {
    const resp = await fetchWithTimeout('https://movie.douban.com/', { headers, redirect: 'manual' }, Math.min(timeout, 4000));
    const setCookie = resp.headers.get('set-cookie') || '';
    const m = setCookie.match(/(?:^|;\s*)bid=([^;]+)/);
    return m ? `bid=${m[1]}` : '';
  } catch {
    return '';
  }
};

export const fetchWithTimeout = async (url: string, opts: any = {}, timeout = DEFAULT_TIMEOUT) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    // Remove Cloudflare-specific options
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { cf: _cf, ...fetchOpts } = opts;
    const res = await fetch(url, { ...fetchOpts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
};

const sha512 = (data: string) => createHash('sha512').update(data).digest('hex');

const solvePoW = (cha: string, difficulty = 4) => {
  const target = '0'.repeat(difficulty);
  let nonce = 0;
  while (true) {
    nonce++;
    const hash = sha512(cha + nonce);
    if (hash.substring(0, difficulty) === target) return nonce;
    if (nonce > 10_000_000) throw new Error('PoW solve exceeded max iterations');
  }
};

const isDoubanChallenge = (html: string) =>
  html.includes('id="tok"') && html.includes('id="cha"') && html.includes('id="sol"');

const looksLikeSecChallenge = (respUrl: string, html: string) =>
  respUrl.includes('sec.douban.com') || isDoubanChallenge(html);

/**
 * Solve PoW challenge page and return the real page HTML.
 */
const solveChallenge = async (
  challengeResp: Response,
  challengeHtml: string,
  headers: Record<string, string>,
  targetUrl: string,
  timeout: number
): Promise<{ html: string; status: number } | null> => {
  if (!isDoubanChallenge(challengeHtml)) return null;

  const $ = cheerio.load(challengeHtml);
  const tok = $('#tok').val() as string;
  const cha = $('#cha').val() as string;
  const red = ($('#red').val() as string) || targetUrl;
  if (!tok || !cha) return null;

  const sol = solvePoW(cha, 4);
  const challengeOrigin = new URL(challengeResp.url).origin;

  const postResp = await fetchWithTimeout(`${challengeOrigin}/c`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: challengeResp.url,
    },
    body: new URLSearchParams({ tok, cha, sol: String(sol), red }).toString(),
    redirect: 'manual',
  }, timeout);

  const setCookieHeader = postResp.headers.get('set-cookie') || '';
  const challengeCookies = setCookieHeader
    .split(/,(?=\s*\w+=)/)
    .map((c: string) => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');

  const cookie = mergeCookies(headers.Cookie, challengeCookies);
  const location = postResp.headers.get('location') || red;
  const origin = new URL(targetUrl).origin;
  const finalUrl = location.startsWith('http') ? location : `${origin}${location}`;

  const realResp = await fetchWithTimeout(finalUrl, {
    headers: { ...headers, Cookie: cookie },
  }, timeout);
  return { html: await realResp.text(), status: realResp.status };
};

/**
 * Fetch a Douban page with 3-tier anti-bot strategy:
 *   1. Desktop fetch with bid cookie warmup
 *   2. If challenged → solve PoW
 *   3. If still fails → fallback to mobile page (m.douban.com)
 */
export const fetchDoubanWithChallenge = async (
  url: string,
  headers: Record<string, string>,
  timeout = DEFAULT_TIMEOUT
): Promise<{ html: string; status: number }> => {
  // --- Tier 0: bid cookie warmup ---
  const hasBid = (headers.Cookie || '').includes('bid=');
  let bidCookie = '';
  if (!hasBid) {
    bidCookie = await warmupBidCookie(headers, timeout);
  }
  const headersWithBid = bidCookie
    ? { ...headers, Cookie: mergeCookies(headers.Cookie, bidCookie) }
    : headers;

  // --- Tier 1: desktop fetch ---
  const resp = await fetchWithTimeout(url, { headers: headersWithBid }, timeout);
  const html = await resp.text();

  if (!looksLikeSecChallenge(resp.url, html)) {
    return { html, status: resp.status };
  }

  // --- Tier 2: solve PoW ---
  try {
    const solved = await solveChallenge(resp, html, headersWithBid, url, timeout);
    if (solved && solved.html.length > 5000 && !looksLikeSecChallenge('', solved.html)) {
      return solved;
    }
  } catch (e) {
    console.warn('PoW solve failed, trying mobile fallback:', e);
  }

  // --- Tier 3: mobile fallback ---
  const sid = url.match(/subject\/(\d+)/)?.[1];
  if (sid) {
    const mobileUrl = `https://m.douban.com/movie/subject/${sid}/`;
    const mobileHeaders = {
      ...DOUBAN_MOBILE_HEADERS,
      ...(headersWithBid.Cookie && { Cookie: headersWithBid.Cookie }),
    };
    try {
      const mResp = await fetchWithTimeout(mobileUrl, { headers: mobileHeaders }, timeout);
      const mHtml = await mResp.text();
      if (!looksLikeSecChallenge(mResp.url, mHtml) && mHtml.length > 1000) {
        return { html: mHtml, status: mResp.status };
      }
    } catch (e) {
      console.warn('Mobile fallback failed:', e);
    }
  }

  // All tiers failed — return whatever we got
  return { html, status: resp.status };
};

export const page_parser = (responseText: any) => {
  try {
    let htmlString: string;
    if (typeof responseText === 'string') {
      htmlString = responseText;
    } else if (responseText == null) {
      htmlString = '';
    } else if (Buffer.isBuffer(responseText)) {
      htmlString = responseText.toString('utf8');
    } else {
      htmlString = String(responseText);
    }

    if (!htmlString || htmlString.trim().length === 0) {
      console.warn('Empty HTML string provided to parser');
      return cheerio.load('');
    }

    return cheerio.load(htmlString);
  } catch (error: any) {
    console.error('Failed to parse HTML:', {
      error: error.message,
      inputType: typeof responseText,
      inputLength: responseText?.length || 0
    });
    return cheerio.load('');
  }
};

export const jsonp_parser = (responseText: any) => {
  try {
    if (typeof responseText !== 'string') responseText = String(responseText || '');
    const m = responseText.replace(/\r?\n/g, '').match(JSONP_REGEX);
    if (!m || !m[1]) {
      console.error('JSONP解析失败：未匹配到有效的 JSON 内容');
      return {};
    }
    return JSON.parse(m[1]);
  } catch (e) {
    console.error('JSONP解析错误:', e);
    return {};
  }
};

export const makeJsonResponse = (body_update: any, env: any, status = 200) => {
  const body = {
    ...DEFAULT_BODY_TEMPLATE,
    copyright: `Powered by @${env?.AUTHOR || AUTHOR}`,
    generate_at: Date.now(),
    ...(body_update || {})
  };
  return { body, status };
};

export type Env = {
  DOUBAN_COOKIE?: string;
  TMDB_API_KEY?: string;
  TRAKT_API_CLIENT_ID?: string;
  TRAKT_APP_NAME?: string;
  QQ_COOKIE?: string;
  API_KEY?: string;
  AUTHOR?: string;
  ENABLED_CACHE?: string;
};

export function getEnv(): Env {
  return {
    DOUBAN_COOKIE: process.env.DOUBAN_COOKIE,
    TMDB_API_KEY: process.env.TMDB_API_KEY,
    TRAKT_API_CLIENT_ID: process.env.TRAKT_API_CLIENT_ID,
    TRAKT_APP_NAME: process.env.TRAKT_APP_NAME || 'PT-Gen-Next',
    QQ_COOKIE: process.env.QQ_COOKIE,
    API_KEY: process.env.API_KEY,
    AUTHOR: process.env.AUTHOR || AUTHOR,
    ENABLED_CACHE: process.env.ENABLED_CACHE || 'true',
  };
}
