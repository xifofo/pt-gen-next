/* eslint-disable @typescript-eslint/no-explicit-any */
import { page_parser } from "./common";

const MAX_WIDTH = 120;

const isValidArray = (arr: any): arr is any[] => Array.isArray(arr) && arr.length > 0;

const ensureArray = (v: any) => (Array.isArray(v) ? v : v ? [v] : []);

const safe = (v: any, fallback = "") => (v === undefined || v === null ? fallback : v);

const getVisualLength = (str: string): number => {
  if (!str) return 0;
  let len = 0;
  for (const ch of str) {
    const code = ch.codePointAt(0) || 0;
    len += code > 0x7f ? 2 : 1;
  }
  return len;
};

const formatWrappedLine = ({
  label,
  content,
  maxWidth = MAX_WIDTH,
}: {
  label: string;
  content: string;
  maxWidth?: number;
}) => {
  if (!content) return label;
  const labelLen = getVisualLength(label);
  const indent = " ".repeat(labelLen);
  const parts = content.split(/\s*\/\s*|\n/);
  const lines: string[] = [];
  let currentLine = label;

  for (const part of parts) {
    const sep = currentLine === label ? "" : " / ";
    if (getVisualLength(currentLine + sep + part) > maxWidth && currentLine !== label) {
      lines.push(currentLine);
      currentLine = indent + part;
    } else {
      currentLine += sep + part;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.join("\n");
};

const wrapTextWithIndent = (text: string, maxWidth: number, indent: string) => {
  if (!text) return "";
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = indent;

  for (const word of words) {
    if (word.length >= maxWidth - indent.length) {
      if (currentLine !== indent) lines.push(currentLine);
      lines.push(indent + word);
      currentLine = indent;
      continue;
    }
    const sep = currentLine === indent ? "" : " ";
    if (currentLine.length + sep.length + word.length > maxWidth) {
      lines.push(currentLine);
      currentLine = indent + word;
    } else {
      currentLine += sep + word;
    }
  }
  if (currentLine !== indent) lines.push(currentLine);
  return lines.join("\n");
};

const processPersonField = (field: any, label: string) => {
  const arr = ensureArray(field).filter(Boolean);
  if (!arr.length) return "";
  const content = arr.map((p: any) => (typeof p === "string" ? p : p.name || p.v || "")).filter(Boolean).join(" / ");
  return content ? `${label}${content}` : "";
};

const formatActorList = (actors: any) => {
  return (
    ensureArray(actors)
      .map((a: any) => safe(a?.name_cn || a?.name))
      .filter(Boolean)
      .join("、") || "未知"
  );
};

const formatCharacters = (chars: any[] = []) => {
  return chars
    .filter((c) => c)
    .map((c) => {
      const name = safe(c.name);
      const nameCn = safe(c.name_cn);
      const actors = formatActorList(c.actors);
      const title = nameCn ? `${name} (${nameCn})` : name || nameCn;
      return title ? `${title}: ${actors}` : null;
    })
    .filter(Boolean) as string[];
};

const processRequirements = (html: string, title: string) => {
  if (!html) return "";
  const $ = page_parser(html);
  const text = $.root().text().trim();
  if (!text) return "";

  const lines = text.split("\n").map((l: string) => l.trim()).filter(Boolean);
  const result: string[] = [`❁ ${title}`];
  const labelSet = new Set(["minimum:", "最低配置:", "recommended:", "推荐配置:", title.toLowerCase()]);

  const appendWrapped = (buffer: string[]) => {
    const joined = buffer.join(" ").trim();
    if (joined) result.push(wrapTextWithIndent(joined, MAX_WIDTH, "  "));
  };

  let buffer: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const lower = line.toLowerCase();
    if (labelSet.has(lower) || labelSet.has(line)) {
      if (buffer.length > 0) { appendWrapped(buffer); buffer = []; }
      continue;
    }
    if (/^(additional notes|附注事项|备注)[:：]?\s*/i.test(line)) {
      if (buffer.length > 0) { appendWrapped(buffer); buffer = []; }
      continue;
    }
    buffer.push(line);
  }
  if (buffer.length > 0) appendWrapped(buffer);
  result.push("");
  return result.join("\n");
};

const cleanHtml = (html: string) => {
  if (!html) return "";
  return String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<\/?(?:strong|ul|li)[^>]*>/gi, "")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/\r\n/g, "\n")
    .trim();
};

const wrapLines = (text: string, indent = "  ", max = 80) => {
  if (!text) return "";
  if (max <= 0) max = 80;
  if (indent.length >= max) indent = "  ";
  const words = String(text).split(/\s+/);
  let currentLine = indent;
  const lines: string[] = [];
  for (const word of words) {
    if (word.length >= max - indent.length) {
      if (currentLine !== indent) lines.push(currentLine);
      lines.push(indent + word);
      currentLine = indent;
      continue;
    }
    const sep = currentLine === indent ? "" : " ";
    if (currentLine.length + sep.length + word.length > max) {
      lines.push(currentLine);
      currentLine = indent + word;
    } else {
      currentLine += sep + word;
    }
  }
  if (currentLine !== indent) lines.push(currentLine);
  return lines.join("\n");
};

// ==================== Format Generators ====================

export const generateDoubanFormat = (data: any) => {
  const lines: string[] = [];
  if (data.poster) lines.push(`[img]${data.poster}[/img]\n`);
  if (data.chinese_title) lines.push(`❁ 片　　名:　${data.chinese_title}`);
  else if (data.foreign_title) lines.push(`❁ 片　　名:　${data.foreign_title}`);
  if (data.aka?.length) lines.push(`❁ 译　　名:　${data.aka.join(" / ").trim()}`);
  if (data.year) lines.push(`❁ 年　　代:　${data.year}`);
  if (data.region?.length) lines.push(`❁ 产　　地:　${data.region.join(" / ")}`);
  if (data.genre?.length) lines.push(`❁ 类　　别:　${data.genre.join(" / ")}`);
  if (data.language?.length) lines.push(`❁ 语　　言:　${data.language.join(" / ")}`);
  if (data.playdate?.length) lines.push(`❁ 上映日期:　${data.playdate.join(" / ")}`);
  if (data.imdb_rating) lines.push(`❁ IMDb评分:　${data.imdb_rating}`);
  if (data.imdb_link) lines.push(`❁ IMDb链接:　${data.imdb_link}`);
  lines.push(`❁ 豆瓣评分:　${data.douban_rating}`);
  lines.push(`❁ 豆瓣链接:　${data.douban_link}`);
  if (data.episodes) lines.push(`❁ 集　　数:　${data.episodes}`);
  if (data.duration) lines.push(`❁ 片　　长:　${data.duration}`);
  if (data.director?.length) lines.push(`❁ 导　　演:　${data.director.map((x: any) => x.name).join(" / ")}`);
  if (data.writer?.length) {
    const content = data.writer.map((x: any) => x.name).join(" / ").trim();
    lines.push(`❁ 编　　剧:　${content}`);
  }
  if (data.cast?.length) {
    const castNames = data.cast.map((x: any) => x.name).filter(Boolean);
    if (castNames.length) {
      lines.push(formatWrappedLine({
        label: "❁ 主　　演:　",
        content: castNames.join("\n　　　　　　　").trim(),
        maxWidth: 100,
      }));
    }
  }
  if (data.tags?.length) lines.push(`\n❁ 标　　签:　${data.tags.join(" | ")}`);
  if (data.introduction) {
    lines.push(`\n❁ 简　　介\n`);
    lines.push(`　${data.introduction.replace(/\n/g, "\n　　")}`);
  }
  if (data.awards && Array.isArray(data.awards) && data.awards.length) {
    lines.push(`\n❁ 获奖情况\n`);
    const awardsLines = data.awards
      .map((awardBlock: any, index: number) => {
        if (typeof awardBlock === "string") return `　　${awardBlock}`;
        if (awardBlock?.festival && Array.isArray(awardBlock.awards)) {
          const festivalLine = `${index === 0 ? "" : "\n"}${awardBlock.festival}`;
          const al = awardBlock.awards.map((award: string) => `　　${award}`);
          return [festivalLine, ...al].join("\n");
        }
        return "";
      })
      .filter((line: string) => line !== "");
    lines.push(awardsLines.join("\n"));
  }
  return lines.join("\n").trim();
};

export const generateImdbFormat = (data: any) => {
  const lines: string[] = [];
  const releaseInfo: string[] = [];
  lines.push(`[img]${data.image ?? data.poster}[/img]\n`);
  if (data.original_title) lines.push(`❁ Original Title:　${data.original_title}`);
  else if (data.name) lines.push(`❁ Original Title:　${data.name}`);
  if (data.type && typeof data.type === "string") {
    lines.push(`❁ Type:　${data.type.charAt(0).toUpperCase() + data.type.slice(1)}`);
  }
  lines.push(`❁ Year:　${data.year}`);
  if (data.origin_country) lines.push(`❁ Origin Country:　${data.origin_country.join(" / ")}`);
  if (data.language) {
    lines.push(formatWrappedLine({ label: "❁ Languages:　", content: data.languages.join(" / "), maxWidth: MAX_WIDTH }));
  }
  lines.push(formatWrappedLine({ label: "❁ Genres:　", content: data.genres.join(" / "), maxWidth: MAX_WIDTH }));
  if (data.episodes && data.episodes > 0) {
    lines.push(`❁ Total Episodes:　${data.episodes}`);
    if (data.seasons && Array.isArray(data.seasons) && data.seasons.length > 0) {
      lines.push(`❁ Total Seasons:　${data.seasons.length}`);
    }
  }
  if (data.type === "tv" && data.runtime) lines.push(`❁ Episode Duration:　${data.runtime}`);
  else if (data.runtime) lines.push(`❁ Runtime:　${data.runtime}`);
  lines.push(`❁ IMDb Rating:　${data.rating} / 10 from ${data.vote_count} users`);
  lines.push(`❁ IMDb Link:　${data.link}`);
  if (data.release_date) {
    const rd = data.release_date;
    const formattedDate = `${rd.year}-${String(rd.month).padStart(2, "0")}-${String(rd.day).padStart(2, "0")}`;
    const country = rd.country || "";
    releaseInfo.push(country ? `${formattedDate} (${country})` : formattedDate);
  }
  if (data.release?.length) {
    data.release.forEach((item: any) => {
      if (item.date) {
        let formattedDate = item.date;
        const dateMatch = item.date.match(/([A-Za-z]+)\s+(\d+),\s+(\d{4})/);
        if (dateMatch) {
          const months: Record<string, string> = { January: "01", February: "02", March: "03", April: "04", May: "05", June: "06", July: "07", August: "08", September: "09", October: "10", November: "11", December: "12" };
          formattedDate = `${dateMatch[3]}-${months[dateMatch[1]] || "01"}-${dateMatch[2].padStart(2, "0")}`;
        }
        releaseInfo.push(`${formattedDate} (${item.country || "Unknown"})`);
      }
    });
  }
  if (releaseInfo.length) lines.push(`❁ Release Date:　${releaseInfo.join(" / ").trim()}`);
  if (data.aka?.length) {
    const akaWithCountries = data.aka
      .map((item: any) => {
        if (typeof item === "string") return item;
        const title = item.title || "";
        const country = item.country || "";
        return country ? `${title} (${country})` : title;
      })
      .filter(Boolean);
    if (akaWithCountries.length) {
      lines.push(formatWrappedLine({ label: "❁ Also Known As:　", content: akaWithCountries.join(" / ").trim(), maxWidth: MAX_WIDTH }));
    }
  }
  if (data.keywords) {
    lines.push(formatWrappedLine({ label: "❁ Keywords:　", content: data.keywords.join(" | ").trim(), maxWidth: MAX_WIDTH }));
  }
  if (data.directors?.length) {
    const directors = Array.isArray(data.directors) ? data.directors : [data.directors];
    lines.push(`❁ Directors:　${directors.map((i: any) => i.name || i).join(" / ").trim()}`);
  }
  if (data.writers?.length) {
    const writers = Array.isArray(data.writers) ? data.writers : [data.writers];
    lines.push(`❁ Writers:　${writers.map((i: any) => i.name || i).join(" / ").trim()}`);
  }
  if (data.cast?.length) {
    lines.push(formatWrappedLine({
      label: "❁ Actors:　",
      content: data.cast.map((i: any) => typeof i === "string" ? i : i.name || "Unknown").join(" / ").trim(),
      maxWidth: 145,
    }));
  }
  if (data.plot) lines.push(`\n❁ Description　\n　　${data.plot.replace(/\n/g, "\n　　")}`);
  return lines.join("\n").trim();
};

export const generateTmdbFormat = (data: any) => {
  const lines: string[] = [];
  if (data.poster) lines.push(`[img]${data.poster}[/img]`, "");
  lines.push(`❁ Title:　${data.title || "N/A"}`);
  lines.push(`❁ Original Title:　${data.original_title || "N/A"}`);
  lines.push(`❁ Genres:　${data.genres?.length ? data.genres.join(" / ") : "N/A"}`);
  lines.push(`❁ Languages:　${data.languages?.length ? data.languages.join(" / ") : "N/A"}`);
  const isMovie = (data.release_date && !data.first_air_date) || (data.tmdb_id && typeof data.tmdb_id === "string" && data.tmdb_id.includes("movie"));
  if (isMovie) {
    lines.push(`❁ Release Date:　${data.release_date || "N/A"}`);
    lines.push(`❁ Runtime:　${data.runtime || "N/A"}`);
  } else {
    lines.push(`❁ First Air Date:　${data.first_air_date || "N/A"}`);
    lines.push(`❁ Number of Episodes:　${data.number_of_episodes || "N/A"}`);
    lines.push(`❁ Number of Seasons:　${data.number_of_seasons || "N/A"}`);
    lines.push(`❁ Episode Runtime:　${data.episode_run_time || "N/A"}`);
  }
  lines.push(`❁ Production Countries:　${data.countries?.length ? data.countries.join(" / ") : "N/A"}`);
  lines.push(`❁ Rating:　${data.tmdb_rating || "N/A"}`);
  if (data.tmdb_id) {
    const mediaType = isMovie ? "movie" : "tv";
    lines.push(`❁ TMDB Link:　https://www.themoviedb.org/${mediaType}/${data.tmdb_id}/`);
  }
  if (data.imdb_link) lines.push(`❁ IMDb Link:　${data.imdb_link}`);
  if (data.directors?.length) {
    const names = data.directors.filter((d: any) => d?.name).map((d: any) => d.name).join(" / ");
    if (names) lines.push(`❁ Directors:　${names}`);
  }
  if (data.producers?.length) {
    const names = data.producers.filter((p: any) => p?.name).map((p: any) => p.name).join(" / ");
    if (names) lines.push(`❁ Producers:　${names}`);
  }
  if (data.cast?.length) {
    lines.push("", "❁ Cast");
    const castLines = data.cast.filter((a: any) => a?.name).map((a: any) => `  ${a.name}${a.character ? " as " + a.character : ""}`).slice(0, 15);
    lines.push(...castLines);
  }
  if (data.overview) lines.push("", "❁ Introduction", `　　${data.overview.replace(/\n/g, "\n  ")}`);
  return lines.join("\n").trim();
};

export const generateMelonFormat = (data: any) => {
  const lines: string[] = [];
  if (data.poster) lines.push(`[img]${data.poster}[/img]\n`);
  lines.push(`❁ 专辑名称:　${data.title || "N/A"}`);
  lines.push(`❁ 歌　　手:　${data.artists?.length ? data.artists.join(" / ") : "N/A"}`);
  lines.push(`❁ 发行日期:　${data.release_date || "N/A"}`);
  lines.push(`❁ 专辑类型:　${data.album_type || "N/A"}`);
  lines.push(`❁ 流　　派:　${data.genres?.length ? data.genres.join(" / ").trim() : "N/A"}`);
  lines.push(`❁ 发 行 商:　${data.publisher || "N/A"}`);
  lines.push(`❁ 制作公司:　${data.planning || "N/A"}`);
  lines.push(`❁ 专辑链接:　${data.melon_link}`);
  if (data.description) {
    lines.push("", "❁ 专辑介绍\n", `　　${data.description.replace(/\n/g, "\n　　")}`);
  }
  if (data.tracks?.length) {
    lines.push("", "❁ 歌曲列表\n");
    data.tracks.forEach((t: any) => {
      const artists = t.artists?.length ? ` (${t.artists.join(", ")})` : "";
      lines.push(`　　${t.number || "-"}. ${t.title}${artists}`);
    });
  }
  return lines.join("\n").trim();
};

export const generateBangumiFormat = (data: any) => {
  if (!data || typeof data !== "object") return "";
  const lines: string[] = [];
  if (data.poster) lines.push(`[img]${data.poster}[/img]`, "");
  lines.push(`❁ 片　　名:　${data.name}`);
  lines.push(`❁ 中 文 名:　${data.name_cn}`);
  if (isValidArray(data.aka)) {
    lines.push(formatWrappedLine({ label: "❁ 别　　名:　", content: data.aka.join(" / "), maxWidth: MAX_WIDTH }));
  }
  if (data.type) lines.push(`❁ 类　　型:　${data.type}`);
  if (data.eps) lines.push(`❁ 话　　数:　${data.eps}`);
  if (data.date) lines.push(`❁ 首　　播:　${data.date}`);
  if (data.year) lines.push(`❁ 年　　份:　${data.year}年`);
  if (data.bgm_rating) lines.push(`❁ 评　　分:　${data.bgm_rating}`);
  lines.push(`❁ 链　　接:　${data.link}`);
  if (data.platform) lines.push(`❁ 播放平台:　${data.platform}`);
  if (isValidArray(data.tags)) {
    lines.push(formatWrappedLine({ label: "❁ 标　　签:　", content: data.tags.join(" / "), maxWidth: MAX_WIDTH }));
  }
  const directorLine = processPersonField(data.director, "❁ 导　　演:　");
  if (directorLine) lines.push(directorLine);
  const writerLine = processPersonField(data.writer, "❁ 脚　　本:　");
  if (writerLine) lines.push(writerLine);
  if (isValidArray(data.characters)) {
    const charList = formatCharacters(ensureArray(data.characters));
    const content = charList.slice(0, 20).join(" / ").trim();
    lines.push(formatWrappedLine({ label: "❁ 角色信息:　", content, maxWidth: 125 }));
  }
  if (data.summary) lines.push("", "❁ 简　　介", `  ${data.summary.replace(/\n/g, "\n  ")}`);
  return lines.join("\n").trim();
};

export const generateSteamFormat = (data: any) => {
  const lines: string[] = [];
  if (data.header_image) lines.push(`[img]${data.header_image}[/img]\n`);
  lines.push(`❁ 游戏名称:　${data.name}`);
  lines.push(`❁ 游戏类型:　${data.type}`);
  lines.push(`❁ 发行日期:　${data.release_date}`);
  if (data.developers?.length) lines.push(`❁ 开 发 商:　${data.developers.join(", ")}`);
  if (data.publishers?.length) lines.push(`❁ 发 行 商:　${data.publishers.join(", ")}`);
  if (data.genres?.length) lines.push(`❁ 游戏类型:　${data.genres.join(", ")}`);
  if (data.supported_languages) {
    const cleaned = cleanHtml(data.supported_languages).replace(/\*具有完全音频支持的语言.*/g, "").trim();
    lines.push(`❁ 支持语言:　${cleaned}`);
  }
  if (data.price) {
    if (data.price.discount > 0 && data.price.initial) {
      lines.push(`❁ 原　　价:　${data.price.initial} ${data.price.currency}`);
      lines.push(`❁ 现　　价:　${data.price.final} ${data.price.currency} (折扣${data.price.discount}%)`);
    } else if (data.price.final) {
      lines.push(`❁ 价　　格:　${data.price.final} ${data.price.currency}`);
    }
  }
  if (data.platforms) {
    const p: string[] = [];
    if (data.platforms.windows) p.push("Windows");
    if (data.platforms.mac) p.push("Mac");
    if (data.platforms.linux) p.push("Linux");
    if (p.length) lines.push(`❁ 支持平台:　${p.join(", ")}`);
  }
  if (data.categories?.length) {
    lines.push(formatWrappedLine({ label: "❁ 分类标签:　", content: data.categories.join(" / "), maxWidth: MAX_WIDTH }));
  }
  lines.push(`❁ 链　　接:　https://store.steampowered.com/app/${data.sid}/`);
  if (data.about_the_game) {
    const INDENT = "　　";
    const BULLET = "· ";
    const $ = page_parser(data.about_the_game);
    $.root().find("h2, ul, p").before("<hr>");
    $.root().find("br").each(function (this: any) {
      const $this = $(this);
      let $next = $this.next();
      while ($next[0] && (($next[0] as any).type as string) === "text" && !$next.text().trim()) $next = $next.next();
      if ($next.is("br")) { $this.replaceWith("<hr>"); $next.remove(); }
    });
    lines.push("", "❁ 简　　介");
    const blocksHTML = $.root().html()?.split(/<hr\s*\/?>/) || [];
    blocksHTML.forEach((blockHtml: string) => {
      const $block = page_parser(blockHtml);
      const blockText = $block.root().text().trim();
      if (!blockText) return;
      if ($block("h2").length > 0) { lines.push("", INDENT + blockText); }
      else if ($block("ul").length > 0) {
        $block("li").each((_: any, li: any) => {
          const liText = $(li).text().trim();
          if (liText) lines.push(wrapTextWithIndent(liText, MAX_WIDTH, INDENT + BULLET));
        });
      } else { lines.push(wrapTextWithIndent(blockText, MAX_WIDTH, INDENT)); }
    });
    if (lines[lines.length - 1].trim() !== "❁ 简　　介") lines.push("");
  }
  if (data.pc_requirements?.minimum) lines.push(processRequirements(data.pc_requirements.minimum, "最低配置"));
  if (data.pc_requirements?.recommended) lines.push(processRequirements(data.pc_requirements.recommended, "推荐配置"));
  if (data.screenshots?.length) {
    lines.push("❁ 游戏截图");
    for (const s of data.screenshots) { if (s.path_full) lines.push(`[img]${s.path_full}[/img]`); }
    lines.push("");
  }
  return lines.join("\n").trim();
};

export const notCacheSteamFormat = (data: any) => {
  if (!data || typeof data !== "object") throw new Error("Invalid input");
  const lines: string[] = [];
  if (data.cover) lines.push(`[img]${data.cover}[/img]\n`);
  lines.push(`❁ 游戏名称:　${data.name}`);
  const DETAIL_KEYS_MAP: Record<string, string> = { "类型:": "type", "发行日期:": "release_date", "开发者:": "developer", "发行商:": "publisher" };
  const info: Record<string, string> = { type: "", release_date: "", developer: "", publisher: "" };
  (data.detail ? data.detail.split("\n") : []).forEach((line: string) => {
    for (const [prefix, key] of Object.entries(DETAIL_KEYS_MAP)) {
      if (line.startsWith(prefix)) { info[key] = line.slice(prefix.length).trim(); break; }
    }
  });
  lines.push(`❁ 游戏类型:　${info.type}`, `❁ 发行日期:　${info.release_date}`, `❁ 开 发 商:　${info.developer}`, `❁ 发 行 商:　${info.publisher}`);
  if (data.language?.length) lines.push(`❁ 支持语言:　${data.language.join(" / ")}`);
  if (data.tags?.length) lines.push(formatWrappedLine({ label: "❁ 分类标签:　", content: data.tags.join(" / "), maxWidth: MAX_WIDTH }));
  lines.push(`❁ 链　　接:　https://store.steampowered.com/app/${data.steam_id}/`);
  if (data.descr) lines.push(`\n❁ 简　　介　\n　　${data.descr.replace(/\n/g, "\n　　")}`);
  if (data.sysreq?.length) lines.push(`\n❁ 配置要求\n${data.sysreq.join("\n")}`);
  if (data.screenshot?.length) { lines.push("\n❁ 游戏截图"); data.screenshot.forEach((s: string) => lines.push(`[img]${s}[/img]`)); lines.push(""); }
  return lines.join("\n").trim();
};

export const notCacheImdbFormat = (data: any) => {
  const lines: string[] = [];
  const safeGet = (obj: any, path: string, defaultValue = "") => path.split(".").reduce((acc, part) => acc && acc[part], obj) || defaultValue;
  const safeArray = (arr: any) => (Array.isArray(arr) ? arr : []);
  lines.push(`[img]${safeGet(data, "poster") || ""}[/img]\n`);
  lines.push(`❁ Original Title:　${safeGet(data, "name")}`);
  lines.push(`❁ Type:　${safeGet(data, "@type")}`);
  lines.push(`❁ Year:　${safeGet(data, "year")}`);
  const details = data.details || {};
  if (details["Country of origin"]?.length) lines.push(`❁ Origin Country:　${safeArray(details["Country of origin"]).join(" / ")}`);
  if (data.genre?.length) lines.push(`❁ Genres:　${data.genre.join(" / ")}`);
  if (details.Language?.length) lines.push(`❁ Language:　${safeArray(details.Language).join(" / ")}`);
  let durationStr = safeGet(data, "duration");
  if (data.duration != null && durationStr != null) {
    durationStr = durationStr.replace("PT", "").replace("H", "H ");
    lines.push(`❁ Runtime:　${durationStr}`);
  }
  lines.push(`❁ IMDb Rating:　${safeGet(data, "imdb_rating")}`);
  lines.push(`❁ IMDb Link:　${safeGet(data, "imdb_link")}`);
  lines.push(`❁ Release Date:　${safeGet(data, "datePublished")}`);
  if (details["Also known as"]?.length) lines.push(`❁ Also Known As:　${safeArray(details["Also known as"]).join(" / ")}`);
  const keywords = safeArray(data.keywords);
  if (keywords.length) lines.push(`❁ Keywords:　${keywords.map((k: string) => k.trim()).filter(Boolean).join(" | ")}`);
  const formatPeopleList = (peopleList: any) => safeArray(peopleList).map((p: any) => (typeof p === "object" && p.name ? p.name : p)).filter(Boolean).join(" / ").trim();
  if (data.directors?.length) lines.push(`❁ Directors:　${formatPeopleList(data.directors)}`);
  if (data.creators?.length) lines.push(`❁ Writers:　${formatPeopleList(data.creators)}`);
  if (data.actors?.length) lines.push(`❁ Actors:　${formatPeopleList(data.actors)}`);
  if (data.description) lines.push(`\n❁ Plot　\n　　${data.description.replace(/\n/g, "\n　　")}`);
  return lines.join("\n").trim();
};

export const notCacheBangumiFormat = (data: any) => {
  if (!data || typeof data !== "object") return "";
  const lines: string[] = [];
  if (data.cover) lines.push(`[img]${data.cover}[/img]`, "");
  lines.push(`❁ 片　　名:　${data.name}`);
  lines.push(`❁ 中 文 名:　${data.name_cn}`);
  if (isValidArray(data.aka)) lines.push(formatWrappedLine({ label: "❁ 别　　名:　", content: data.aka.join(" / "), maxWidth: MAX_WIDTH }));
  if (data.eps) lines.push(`❁ 话　　数:　${data.eps}`);
  if (data.date) lines.push(`❁ 首　　播:　${data.date}`);
  if (data.year) lines.push(`❁ 年　　份:　${data.year}年`);
  if (data.rating && typeof data.rating === "object") {
    lines.push(`❁ 评　　分:　${data.rating.score ?? 0} / 10 from ${data.rating.total ?? 0} users`);
  }
  lines.push(`❁ 链　　接:　${data.alt}`);
  if (data.platform) lines.push(`❁ 播放平台:　${data.platform}`);
  const directorLine = processPersonField(data.director, "❁ 导　　演:　");
  if (directorLine) lines.push(directorLine);
  const writerLine = processPersonField(data.writer, "❁ 脚　　本:　");
  if (writerLine) lines.push(writerLine);
  const characters = formatCharacters(ensureArray(data.cast));
  if (isValidArray(characters)) {
    lines.push(formatWrappedLine({ label: "❁ 角色信息:　", content: characters.slice(0, 20).join(" / ").trim(), maxWidth: 125 }));
  }
  if (data.story) lines.push("", "❁ 简　　介", `  ${data.story.replace(/\n/g, "\n  ")}`);
  return lines.join("\n").trim();
};

export const generateHongguoFormat = (data: any) => {
  const lines: string[] = [];
  if (data.poster_url) lines.push(`[img]${data.poster_url}[/img]`, "");
  lines.push(`❁ 片　　名:　${data.chinese_title}`);
  if (isValidArray(data.genres)) lines.push(`❁ 类　　别:　${data.genres.join(" / ")}`);
  if (data.episodes) lines.push(`❁ 集　　数:　${data.episodes}`);
  if (isValidArray(data.actors)) {
    const formatted = data.actors.map((a: any) => a.sub_title ? `${a.nickname} (${a.sub_title})` : a.nickname).join(" / ");
    lines.push(`❁ 主　　演:　${formatted}`);
  }
  if (data.synopsis) lines.push("❁ 简　　介", `    ${data.synopsis.replace(/\n/g, "\n\n    ")}`);
  return lines.join("\n").trim();
};

export const generateQQMusicFormat = (data: any) => {
  if (!data || typeof data !== "object") return "";
  const lines: string[] = [];
  if (data.cover) lines.push(`[img]${data.cover}[/img]`, "");
  if (data.name) lines.push(`❁ 专辑名称:　${data.name}`);
  if (Array.isArray(data.singer) && data.singer.length) {
    lines.push(`❁ 歌　　手:　${data.singer.map((s: any) => s.name).join(" / ")}`);
  }
  if (data.albumType) lines.push(`❁ 专辑类型:　${data.albumType}`);
  if (data.language) lines.push(`❁ 语　　种:　${data.language}`);
  if (data.company) lines.push(`❁ 发行公司:　${data.company}`);
  if (data.publishTime) lines.push(`❁ 发行时间:　${data.publishTime}`);
  if (data.desc) lines.push("", "❁ 专辑介绍:", `  ${data.desc.replace(/\n/g, "\n\n  ")}`, "");
  if (Array.isArray(data.songList) && data.songList.length) {
    lines.push("\n❁ 歌曲列表");
    data.songList.forEach((song: any, index: number) => {
      const singerNames = Array.isArray(song.singer) && song.singer.length ? song.singer.map((s: any) => s.name).join(" / ") : "";
      lines.push(
        `　${(index + 1).toString().padStart(2, " ")}. ${song.name}` +
          (song.sub_name ? ` (${song.sub_name})` : "") +
          (singerNames ? ` - ${singerNames}` : "") +
          (song.playTime ? ` [${song.playTime}]` : "")
      );
    });
  }
  return lines.join("\n");
};

export const generateDoubanBookFormat = (data: any) => {
  if (!data || typeof data !== "object") return "";
  const lines: string[] = [];
  if (data.poster) lines.push(`[img]${data.poster}[/img]`, "");
  lines.push(`❁ 书　　名:　${data.title}`);
  if (data.original_title) lines.push(`❁ 原　　名:　${data.original_title}`);
  if (Array.isArray(data.author) && data.author.length) lines.push(`❁ 作　　者:　${data.author.join(" / ").trim()}`);
  if (Array.isArray(data.translator) && data.translator.length) lines.push(`❁ 翻　　译:　${data.translator.join(" / ").trim()}`);
  if (data.publisher) lines.push(`❁ 出 版 社:　${data.publisher}`);
  if (data.year) lines.push(`❁ 出版日期:　${data.year}`);
  if (data.pages) lines.push(`❁ 页　　数:　${data.pages}`);
  if (data.pricing) lines.push(`❁ 定　　价:　${data.pricing}`);
  if (data.binding) lines.push(`❁ 装　　帧:　${data.binding}`);
  if (data.series) lines.push(`❁ 丛　　书:　${data.series}`);
  if (data.isbn) lines.push(`❁ I S B N:　${data.isbn}`);
  if (data.rating && data.votes) lines.push(`❁ 豆瓣评分:　${data.rating} / 10 from ${data.votes} users`);
  if (data.link) lines.push(`❁ 豆瓣链接:　${data.link}`);
  if (data.introduction) {
    let formattedIntro = data.introduction.replace(/\s{4,}/g, "\n\n");
    formattedIntro = formattedIntro.split("\n").map((line: string) => line.trim()).filter(Boolean).map((line: string) => `    ${line}`).join("\n\n");
    lines.push("\n❁ 简　　介\n", formattedIntro);
  }
  return lines.join("\n");
};

export const generateTraktFormat = (data: any) => {
  if (!data || typeof data !== "object") return "";
  const lines: string[] = [];
  const isMovie = data.type === "movie";
  const isShow = data.type === "tv";
  lines.push(`[img]${data.poster}[/img]`, "");
  lines.push(`❁ Title:　${data.title}`);
  lines.push(`❁ Type:　${data.type}`);
  if (isMovie && data.year) lines.push(`❁ Year:　${data.year}`);
  else if (isShow && data.year) lines.push(`❁ First Aired:　${data.year}`);
  if (data.country) lines.push(`❁ Country:　${data.country}`);
  if (data.language) lines.push(`❁ Languages:　${data.language.join(" / ")}`);
  if (data.certification) lines.push(`❁ Certification:　${data.certification}`);
  if (isMovie && data.runtime) lines.push(`❁ Runtime:　${data.runtime} minutes`);
  else if (isShow && data.runtime) lines.push(`❁ Episode Duration:　${data.runtime} minutes`);
  if (isShow && data.seasons?.length) {
    const totalSeasons = data.seasons.length;
    const totalEpisodes = data.seasons.reduce((sum: number, s: any) => sum + (s.episodeCount || 0), 0);
    lines.push(`❁ Total Seasons:　${totalSeasons}`, `❁ Total Episodes:　${totalEpisodes}`);
  }
  if (isMovie && data.released) lines.push(`❁ Released:　${data.released}`);
  else if (isShow && data.first_aired) lines.push(`❁ First Aired:　${data.first_aired}`);
  if (data.rating) lines.push(`❁ Rating:　${data.rating_format}`);
  if (data.genres?.length) lines.push(`❁ Genre:　${data.genres.join(" / ")}`);
  if (data.imdb_link) lines.push(`❁ IMDb Link:　${data.imdb_link}`);
  if (data.trakt_link) lines.push(`❁ Trakt Link:　${data.trakt_link}`);
  if (data.tmdb_link) lines.push(`❁ TMDB Link:　${data.tmdb_link}`);
  if (data.tvdb_link) lines.push(`❁ TVDB Link:　${data.tvdb_link}`);
  if (data.people?.directors?.length) lines.push(`❁ Director:　${data.people.directors.slice(0, 10).map((d: any) => d.name).join(" / ")}`);
  if (data.people?.writers?.length) lines.push(`❁ Writers:　${data.people.writers.slice(0, 10).map((w: any) => w.name).join(" / ")}`);
  if (data.people?.cast?.length) {
    const actors = data.people.cast.slice(0, 10).map((c: any) => `${c.character ? `[${c.character}]` : ""} ${c.name}`);
    lines.push(`❁ Actors:　${actors.join(" / ")}`);
  }
  if (data.overview) lines.push("", "❁ Description", `  ${data.overview.replace(/\n/g, "\n\n")}`, "");
  return lines.join("\n");
};

// Re-export for use in utils.ts
export { wrapLines, cleanHtml };
