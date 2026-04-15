/* eslint-disable @typescript-eslint/no-explicit-any */
import { page_parser, fetchWithTimeout } from "./common";

const HONGGUO_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

export const gen_hongguo = async (sid: any) => {
  const data: any = { site: "hongguo", sid };
  if (!sid) return { ...data, error: "Invalid Hongguo ID" };

  try {
    const url = `https://novelquickapp.com/s/${encodeURIComponent(sid)}`;
    const resp = await fetchWithTimeout(url, { headers: HONGGUO_HEADERS }, 12000);
    if (!resp.ok) return { ...data, error: `Hongguo returned ${resp.status}` };

    const html = await resp.text();
    const $ = page_parser(html);

    // Extract _ROUTER_DATA from script tag
    let routerData: any = null;
    $("script").each((_: any, el: any) => {
      const text = $(el).html() || "";
      const match = text.match(/window\._ROUTER_DATA\s*=\s*(\{[\s\S]*?\});?\s*(?:<\/script>|$)/);
      if (match?.[1]) {
        try {
          routerData = JSON.parse(match[1]);
        } catch {
          // try eval-safe parse
        }
      }
    });

    if (!routerData) {
      return { ...data, error: "Failed to parse Hongguo page data" };
    }

    // Navigate the router data structure
    const pageData = Object.values(routerData).find((v: any) => v?.series || v?.data?.series) as any;
    const series = pageData?.series || pageData?.data?.series;

    if (!series) return { ...data, error: "Series data not found" };

    const chineseTitle = series.title || series.name || "";
    const posterUrl = series.cover_url || series.poster_url || "";
    const genres = (series.genres || series.tags || []).map((g: any) => typeof g === "string" ? g : g.name || g.title || "");
    const episodes = series.episodes_count || series.total_episodes || "";
    const synopsis = series.synopsis || series.description || series.intro || "";
    const actors = (series.actors || series.cast || []).map((a: any) => ({
      nickname: a.nickname || a.name || "",
      sub_title: a.sub_title || a.role || "",
    }));

    Object.assign(data, {
      success: true,
      chinese_title: chineseTitle,
      poster_url: posterUrl,
      genres: genres.filter(Boolean),
      episodes,
      synopsis,
      actors,
    });

    return data;
  } catch (error: any) {
    return { ...data, error: error?.message || String(error) };
  }
};
