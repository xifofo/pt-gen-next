/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  NONE_EXIST_ERROR,
  ANTI_BOT_ERROR,
  NOT_FOUND_PATTERN,
  isAntiBot,
  page_parser,
  fetchWithTimeout,
  fetchDoubanWithChallenge,
  buildHeaders,
} from "./common";
import {
  getStaticMediaDataFromOurBits,
  parseDoubanAwards,
  safe,
  fetchAnchorText,
  parseJsonLd,
} from "./utils";

const parseRatingInfo = ($: any, ldJson: any) => {
  const ratingInfo = ldJson.aggregateRating || {};
  const pageRatingAverage = $("#interest_sectl .rating_num").text().trim();
  const pageVotes = $('#interest_sectl span[property="v:votes"]').text().trim();

  const average = safe(ratingInfo.ratingValue || pageRatingAverage || "0", "0");
  const votes = safe(ratingInfo.ratingCount || pageVotes || "0", "0");

  return {
    average,
    votes,
    formatted:
      parseFloat(average) > 0 && parseInt(votes) > 0
        ? `${average} / 10 from ${votes} users`
        : "0 / 10 from 0 users",
  };
};

const cleanRoleText = (text: string, clean: boolean) => {
  if (!clean || !text) return text || '';
  if (text.includes('饰')) {
    const match = text.match(/饰\s*([^()]+)/);
    return match ? `饰 ${match[1].trim()}` : text;
  }
  if (text.includes('配')) {
    const match = text.match(/配\s*([^()]+)/);
    return match ? `配 ${match[1].trim()}` : text;
  }
  return text;
};

const extractCelebrities = ($: any, section: string, extractRole = false) => {
  if (!$ || !section) return [];
  const result: any[] = [];
  try {
    $(`.list-wrapper h2:contains("${section}")`)
      .closest(".list-wrapper")
      .find(".celebrity")
      .each((_: any, el: any) => {
        const $el = $(el);
        const $link = $el.find(".name a");
        const name = $link.text().trim();
        if (name) {
          const avatarStyle = $el.find(".avatar").attr("style") || "";
          const avatarUrl = avatarStyle.match(/url\(([^)]+)\)/)?.[1] || "";
          result.push({
            name,
            link: $link.attr("href") || "",
            role: cleanRoleText($el.find(".role").text().trim(), extractRole),
            avatar: avatarUrl
          });
        }
      });
  } catch (e: any) {
    console.warn(`Extract ${section} error:`, e.message);
  }
  return result;
};

const fetchCelebritiesInfo = async (baseLink: string, headers: any) => {
  const EMPTY = { director: [], writer: [], cast: [] };
  const MAX_RETRIES = 2;
  const TIMEOUT = 6000;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(`${baseLink}celebrities`, { headers }, TIMEOUT);
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) return EMPTY;
        throw new Error(`HTTP ${response.status}`);
      }
      const html = await response.text();
      const $ = page_parser(html);
      return {
        director: extractCelebrities($, "导演"),
        writer: extractCelebrities($, "编剧"),
        cast: extractCelebrities($, "演员", true)
      };
    } catch (error: any) {
      if (attempt === MAX_RETRIES - 1) return EMPTY;
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      return EMPTY;
    }
  }
  return EMPTY;
};

const fetchAwardsInfo = async (baseLink: string, headers: any) => {
  const MAX_ATTEMPTS = 2;
  const TIMEOUT = 8000;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetchWithTimeout(`${baseLink}awards`, { headers }, TIMEOUT);
      if (response.status === 404) return [];
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      if (html.length < 1000 || !html.includes('class="awards')) throw new Error('Invalid awards page');
      const $ = page_parser(html);
      const sections: string[] = [];
      $(".awards").each((_: any, el: any) => {
        const $section = $(el);
        const $h2 = $section.find(".hd h2");
        const festival = $h2.find("a").text().trim();
        const year = $h2.find(".year").text().trim();
        const name = `${festival} ${year}`.trim();
        if (!name) return;
        const awards = [name];
        $section.find("ul.award").each((_: any, award: any) => {
          const $items = $(award).find("li");
          if ($items.length >= 2) {
            const category = $($items[0]).text().trim();
            const winners = $($items[1]).text().trim();
            awards.push(winners ? `${category} ${winners}` : category);
          }
        });
        if (awards.length > 1) sections.push(awards.join("\n"));
      });
      const text = sections.join("\n\n");
      return text ? parseDoubanAwards(text) : [];
    } catch (error: any) {
      if (attempt === MAX_ATTEMPTS - 1) return [];
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return [];
};

const fetchImdbRating = async (imdbId: string, headers: any) => {
  if (!imdbId || !/^tt\d+$/.test(imdbId)) return null;
  const url = `https://p.media-imdb.com/static-content/documents/v1/title/${imdbId}/ratings%3Fjsonp=imdb.rating.run:imdb.api.title.ratings/data.json`;
  for (let i = 0; i < 2; i++) {
    try {
      const response = await fetchWithTimeout(url, { headers }, 12000);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      const match = text.match(/imdb\.rating\.run\((.*)\)/);
      if (!match) throw new Error('Invalid response format');
      const data = JSON.parse(match[1]);
      const rating = data.resource?.rating;
      const votes = data.resource?.ratingCount || 0;
      if (rating) {
        return {
          average: rating.toFixed(1),
          votes: String(votes),
          formatted: `${rating.toFixed(1)} / 10 from ${votes.toLocaleString()} users`
        };
      }
      return { average: "0.0", votes: "0", formatted: "0.0 / 10 from 0 users" };
    } catch {
      if (i < 1) await new Promise(r => setTimeout(r, 2000));
    }
  }
  return null;
};

const DOUBAN_GENRES = new Set([
  '剧情', '喜剧', '动作', '爱情', '科幻', '动画', '悬疑', '惊悚', '恐怖', '犯罪',
  '同性', '音乐', '歌舞', '传记', '历史', '战争', '西部', '奇幻', '冒险', '灾难',
  '武侠', '情色', '纪录片', '短片', '家庭', '儿童', '古装', '戏曲', '黑色电影', '运动',
]);

const parseMobilePage = ($: any, data: any, baseLink: string) => {
  const chineseTitle = $('.sub-title').first().text().trim() || $('title').text().trim();
  const original = $('.sub-original-title').first().text().trim();
  const yearMatch = original.match(/(\d{4})/);
  const year = yearMatch ? yearMatch[1] : '';
  const foreignTitle = original ? original.replace(/[（(]\s*\d{4}.*?[）)]\s*$/, '').trim() : '';

  const poster = ($('.sub-cover img').attr('src') || '')
    .replace(/s(_ratio_poster|pic)/g, 'l$1')
    .replace('img3', 'img1');

  const ratingValue = Number($('meta[itemprop="ratingValue"]').attr('content')) || 0;
  const reviewCount = Number($('meta[itemprop="reviewCount"]').attr('content')) || 0;
  const doubanRating = ratingValue > 0 && reviewCount > 0
    ? `${ratingValue} / 10 from ${reviewCount} users`
    : '0 / 10 from 0 users';

  // Parse meta line: "中国大陆 / 剧情 / 犯罪 / 142分钟 / 1994-09-10上映"
  const meta = $('.sub-meta').first().text().replace(/\s+/g, ' ').trim();
  const parts = meta ? meta.split(' / ').map((s: string) => s.trim()).filter(Boolean) : [];
  const region: string[] = [];
  const genre: string[] = [];
  const playdate: string[] = [];
  let duration = '';
  for (const p of parts) {
    if (p.includes('上映')) { playdate.push(p.replace(/上映/g, '').trim()); continue; }
    if (p.startsWith('片长') || p.match(/^\d+分钟$/)) { duration = p.replace(/^片长/, '').trim(); continue; }
    if (DOUBAN_GENRES.has(p)) { genre.push(p); continue; }
    region.push(p);
  }

  const introP = $('section.subject-intro .bd p').first();
  let introduction = '';
  if (introP.length > 0) {
    const introHtml = introP.html() || '';
    introduction = introHtml
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .split('\n')
      .map((a: string) => a.trim())
      .filter((a: string) => a.length > 0)
      .join('\n');
  }

  Object.assign(data, {
    success: true,
    douban_link: baseLink,
    chinese_title: chineseTitle,
    foreign_title: foreignTitle,
    year,
    region,
    genre,
    language: [],
    playdate: playdate.sort((a: string, b: string) => new Date(a).getTime() - new Date(b).getTime()),
    episodes: '',
    duration,
    introduction: introduction || '暂无相关剧情介绍',
    poster,
    tags: [],
    aka: [],
    douban_rating_average: String(ratingValue || 0),
    douban_votes: String(reviewCount || 0),
    douban_rating: doubanRating,
    director: [],
    writer: [],
    cast: [],
    awards: [],
  });
  return data;
};

export const gen_douban = async (sid: any, env: any) => {
  const data: any = { site: "douban", sid };
  if (!sid) return { ...data, error: "Invalid Douban id" };

  const headers = buildHeaders(env);
  const baseLink = `https://movie.douban.com/subject/${encodeURIComponent(sid)}/`;

  try {
    if (env.ENABLED_CACHE === "false") {
      const cachedData = await getStaticMediaDataFromOurBits("douban", sid);
      if (cachedData) return { ...data, ...cachedData, success: true };
    }

    const { html, status } = await fetchDoubanWithChallenge(baseLink, headers);
    if (status === 404) return { ...data, error: NONE_EXIST_ERROR };
    if (!html || isAntiBot(html) || NOT_FOUND_PATTERN.test(html)) {
      return { ...data, error: isAntiBot(html) ? ANTI_BOT_ERROR : NONE_EXIST_ERROR };
    }

    const $ = page_parser(html);
    const isMobile = $('.subject-header-wrap').length > 0 || $('.sub-title').length > 0;
    const isDesktop = html.includes('property="v:itemreviewed"');

    if (!isMobile && !isDesktop) {
      return { ...data, error: `Invalid Douban page (status: ${status}, length: ${html.length})` };
    }

    if (isMobile) {
      // --- Mobile page parsing ---
      return parseMobilePage($, data, baseLink);
    }

    // --- Desktop page parsing ---
    const imdbText = fetchAnchorText($('#info span.pl:contains("IMDb")'));
    const hasAwardsSection = $("div.mod").find("div.hd").length > 0;
    const detailedHeaders = { ...headers, Referer: baseLink };

    const concurrentPromises: Promise<any>[] = [];
    let imdbPromiseIndex = -1;
    let celebrityPromiseIndex = -1;
    let awardsPromiseIndex = -1;

    if (imdbText && /^tt\d+$/.test(imdbText)) {
      data.imdb_id = imdbText;
      data.imdb_link = `https://www.imdb.com/title/${imdbText}/`;
      imdbPromiseIndex = concurrentPromises.length;
      concurrentPromises.push(
        Promise.race([fetchImdbRating(imdbText, headers), new Promise((resolve) => setTimeout(() => resolve({}), 4000))])
      );
    }

    celebrityPromiseIndex = concurrentPromises.length;
    concurrentPromises.push(
      Promise.race([fetchCelebritiesInfo(baseLink, detailedHeaders), new Promise((resolve) => setTimeout(() => resolve({ director: [], writer: [], cast: [] }), 5000))])
    );

    if (hasAwardsSection) {
      awardsPromiseIndex = concurrentPromises.length;
      concurrentPromises.push(
        Promise.race([fetchAwardsInfo(baseLink, detailedHeaders), new Promise((resolve) => setTimeout(() => resolve([]), 5000))])
      );
    }

    const [parsedData, ...asyncResults] = await Promise.all([
      Promise.resolve().then(() => {
        const ldJson = parseJsonLd($);
        const title = $("title").text().replace("(豆瓣)", "").trim();
        const foreignTitle = $('span[property="v:itemreviewed"]').text().replace(title, "").trim();
        const yearMatch = $("#content > h1 > span.year").text().match(/\d{4}/);
        const year = yearMatch ? yearMatch[0] : "";
        const akaText = fetchAnchorText($('#info span.pl:contains("又名")'));
        const aka = akaText ? akaText.split(" / ").map((s: string) => s.trim()).filter(Boolean).sort() : [];
        const regionText = fetchAnchorText($('#info span.pl:contains("制片国家/地区")'));
        const region = regionText ? regionText.split(" / ").map((s: string) => s.trim()).filter(Boolean) : [];
        const languageText = fetchAnchorText($('#info span.pl:contains("语言")'));
        const language = languageText ? languageText.split(" / ").map((s: string) => s.trim()).filter(Boolean) : [];
        const genre = $('#info span[property="v:genre"]').map(function (this: any) { return $(this).text().trim(); }).get();
        const playdate = $('#info span[property="v:initialReleaseDate"]').map(function (this: any) { return $(this).text().trim(); }).get().sort((a: string, b: string) => new Date(a).getTime() - new Date(b).getTime());
        const episodes = fetchAnchorText($('#info span.pl:contains("集数")'));
        const durationText = fetchAnchorText($('#info span.pl:contains("单集片长")'));
        const duration = durationText || $('#info span[property="v:runtime"]').text().trim() || "";
        const introSelector = '#link-report-intra > span.all.hidden, #link-report-intra > [property="v:summary"], #link-report > span.all.hidden, #link-report > [property="v:summary"]';
        const introduction = $(introSelector).text().split("\n").map((s: string) => s.trim()).filter(Boolean).join("\n");
        const tags = $('div.tags-body > a[href^="/tag"]').map(function (this: any) { return $(this).text().trim(); }).get();
        const poster = ldJson.image ? String(ldJson.image).replace(/s(_ratio_poster|pic)/g, "l$1").replace("img3", "img1").replace(/\.webp$/, ".jpg") : "";
        const doubanRating = parseRatingInfo($, ldJson);
        return { douban_link: baseLink, chinese_title: title, foreign_title: foreignTitle, year, aka, region, genre, language, playdate, episodes, duration, introduction, poster, tags, douban_rating_average: doubanRating.average, douban_votes: doubanRating.votes, douban_rating: doubanRating.formatted };
      }),
      ...concurrentPromises,
    ]);

    Object.assign(data, parsedData);
    if (imdbPromiseIndex >= 0) {
      const imdbInfo = asyncResults[imdbPromiseIndex] || {};
      if (imdbInfo.average) {
        data.imdb_rating_average = imdbInfo.average;
        data.imdb_votes = imdbInfo.votes;
        data.imdb_rating = imdbInfo.formatted;
      }
    }
    if (celebrityPromiseIndex >= 0) Object.assign(data, asyncResults[celebrityPromiseIndex] || {});
    if (awardsPromiseIndex >= 0) data.awards = asyncResults[awardsPromiseIndex] || [];
    data.success = true;
    return data;
  } catch (error: any) {
    return { ...data, error: error?.message || String(error) };
  }
};
