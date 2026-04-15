/* eslint-disable @typescript-eslint/no-explicit-any */
import { fetchWithTimeout } from "./common";
import { getStaticMediaDataFromOurBits } from "./utils";

const BANGUMI_API_BASE = "https://api.bgm.tv";
const BANGUMI_HEADERS = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 PT-Gen-Next/1.0",
};

const TYPE_MAP: Record<number, string> = {
  1: "Book",
  2: "Anime",
  3: "Music",
  4: "Game",
  6: "Real",
};

const getInfoboxValue = (infobox: any[], key: string): string => {
  if (!Array.isArray(infobox)) return "";
  const item = infobox.find((i: any) => i.key === key);
  if (!item) return "";
  if (typeof item.value === "string") return item.value;
  if (Array.isArray(item.value)) return item.value.map((v: any) => v.v || v).join(", ");
  return "";
};

export const gen_bangumi = async (sid: any, env: any) => {
  const data: any = { site: "bangumi", sid };
  if (!sid) return { ...data, error: "Invalid Bangumi ID" };

  try {
    if (env?.ENABLED_CACHE === "false") {
      const cached = await getStaticMediaDataFromOurBits("bangumi", sid);
      if (cached) return { ...data, ...cached, success: true };
    }

    const [subjectResp, charsResp] = await Promise.all([
      fetchWithTimeout(`${BANGUMI_API_BASE}/v0/subjects/${encodeURIComponent(sid)}`, { headers: BANGUMI_HEADERS }, 10000),
      fetchWithTimeout(`${BANGUMI_API_BASE}/v0/subjects/${encodeURIComponent(sid)}/characters`, { headers: BANGUMI_HEADERS }, 10000).catch(() => null),
    ]);

    if (!subjectResp.ok) {
      if (subjectResp.status === 404) return { ...data, error: "Bangumi subject not found" };
      return { ...data, error: `Bangumi API error: ${subjectResp.status}` };
    }

    const subject = await subjectResp.json();
    const characters: any[] = charsResp?.ok ? await charsResp.json() : [];

    const infobox = subject.infobox || [];
    const name = subject.name || "";
    const nameCn = subject.name_cn || "";
    const aka = [
      getInfoboxValue(infobox, "别名"),
      getInfoboxValue(infobox, "中文名"),
    ].filter(Boolean).flatMap((v: string) => v.split(",").map((s: string) => s.trim())).filter(Boolean);

    const type = TYPE_MAP[subject.type] || "Unknown";
    const eps = subject.eps || subject.total_episodes || "";
    const date = subject.date || getInfoboxValue(infobox, "放送开始") || getInfoboxValue(infobox, "发售日") || "";
    const year = date ? date.split("-")[0] : "";
    const platform = getInfoboxValue(infobox, "播放平台") || getInfoboxValue(infobox, "播放") || "";
    const poster = subject.images?.large || subject.images?.common || "";
    const summary = subject.summary || "";
    const bgmRating = subject.rating?.score ? `${subject.rating.score} / 10 from ${subject.rating.total || 0} users` : "N/A";
    const tags = (subject.tags || []).slice(0, 15).map((t: any) => t.name);
    const link = `https://bgm.tv/subject/${sid}`;

    const director = infobox
      .filter((i: any) => i.key === "导演")
      .flatMap((i: any) => (Array.isArray(i.value) ? i.value : [i.value]))
      .map((v: any) => (typeof v === "object" ? v.v || "" : v))
      .filter(Boolean);

    const writer = infobox
      .filter((i: any) => i.key === "脚本" || i.key === "编剧")
      .flatMap((i: any) => (Array.isArray(i.value) ? i.value : [i.value]))
      .map((v: any) => (typeof v === "object" ? v.v || "" : v))
      .filter(Boolean);

    const parsedCharacters = (Array.isArray(characters) ? characters : [])
      .slice(0, 30)
      .map((c: any) => ({
        name: c.name || "",
        name_cn: c.name_cn || "",
        actors: (c.actors || []).map((a: any) => ({
          name: a.name || "",
          name_cn: a.name_cn || "",
        })),
      }));

    Object.assign(data, {
      success: true,
      name,
      name_cn: nameCn,
      aka,
      type,
      eps,
      date,
      year,
      platform,
      poster,
      summary,
      bgm_rating: bgmRating,
      tags,
      link,
      director,
      writer,
      characters: parsedCharacters,
    });

    return data;
  } catch (error: any) {
    return { ...data, error: error?.message || String(error) };
  }
};
