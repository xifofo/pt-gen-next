/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  NONE_EXIST_ERROR,
  ANTI_BOT_ERROR,
  isAntiBot,
  page_parser,
  fetchWithTimeout,
  buildHeaders,
} from "./common";

export const gen_douban_book = async (sid: any, env: any) => {
  const data: any = { site: "douban_book", sid };
  if (!sid) return { ...data, error: "Invalid Douban Book ID" };

  const headers = buildHeaders(env);
  const url = `https://book.douban.com/subject/${encodeURIComponent(sid)}/`;

  try {
    const resp = await fetchWithTimeout(url, { headers }, 15000);
    if (!resp.ok) {
      if (resp.status === 404) return { ...data, error: NONE_EXIST_ERROR };
      return { ...data, error: `Douban Book returned ${resp.status}` };
    }

    const html = await resp.text();
    if (!html || isAntiBot(html)) return { ...data, error: ANTI_BOT_ERROR };

    const $ = page_parser(html);
    const title = $('span[property="v:itemreviewed"]').text().trim();
    if (!title) return { ...data, error: "Book not found" };

    const getInfo = (label: string): string => {
      const $span = $(`#info span.pl:contains("${label}")`);
      if (!$span.length) return "";
      // Get text after the label span
      let text = "";
      const nextNode = $span[0]?.nextSibling as any;
      if (nextNode?.nodeValue) {
        text = (nextNode.nodeValue as string).trim();
      }
      if (!text) {
        const $a = $span.nextAll("a").first();
        text = $a.text().trim();
      }
      return text.replace(/^[:：]\s*/, "").trim();
    };

    const getInfoAll = (label: string): string[] => {
      const $span = $(`#info span.pl:contains("${label}")`);
      if (!$span.length) return [];
      const result: string[] = [];
      $span.nextUntil("br, span.pl").each((_: any, el: any) => {
        const text = $(el).text().trim();
        if (text) result.push(text);
      });
      if (!result.length) {
        const raw = getInfo(label);
        return raw ? raw.split("/").map((s: string) => s.trim()).filter(Boolean) : [];
      }
      return result;
    };

    const poster = $('a.nbg img').attr('src') || "";
    const author = getInfoAll("作者");
    const translator = getInfoAll("译者");
    const publisher = getInfo("出版社");
    const originalTitle = getInfo("原作名");
    const year = getInfo("出版年");
    const pages = getInfo("页数");
    const pricing = getInfo("定价");
    const binding = getInfo("装帧");
    const series = getInfo("丛书");
    const isbn = getInfo("ISBN");

    const ratingNum = $('strong[property="v:average"]').text().trim();
    const votes = $('span[property="v:votes"]').text().trim();
    const rating = ratingNum || "0";

    const introSelector = '#link-report .all.hidden .intro, #link-report .intro';
    const introduction = $(introSelector).first().text().trim();

    Object.assign(data, {
      success: true,
      title,
      original_title: originalTitle,
      poster: poster ? poster.replace(/s\/(public|view)/, "l/$1") : "",
      author,
      translator,
      publisher,
      year,
      pages,
      pricing,
      binding,
      series,
      isbn,
      rating,
      votes,
      introduction,
      link: url,
    });

    return data;
  } catch (error: any) {
    return { ...data, error: error?.message || String(error) };
  }
};
