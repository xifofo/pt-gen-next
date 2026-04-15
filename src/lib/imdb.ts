/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  NONE_EXIST_ERROR,
  page_parser,
  fetchWithTimeout,
} from "./common";
import { getStaticMediaDataFromOurBits } from "./utils";

const IMDB_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const safeGet = (obj: any, key: string) => (obj ? obj[key] ?? "" : "");

const extractNextData = (html: string) => {
  const match = html.match(/<script\s+id="__NEXT_DATA__"\s+type="application\/json">(.*?)<\/script>/s);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
};

const extractAboveTheFold = (nextData: any) => {
  try {
    return nextData?.props?.pageProps?.aboveTheFoldData || null;
  } catch {
    return null;
  }
};

const extractMainColumn = (nextData: any) => {
  try {
    return nextData?.props?.pageProps?.mainColumnData || null;
  } catch {
    return null;
  }
};

const parseCredits = (mainData: any) => {
  const directors: any[] = [];
  const writers: any[] = [];
  const cast: any[] = [];

  try {
    if (mainData?.directorsPageTitle) {
      for (const credit of mainData.directorsPageTitle) {
        if (credit?.credits) {
          for (const c of credit.credits) {
            if (c?.name?.nameText?.text) {
              directors.push({ name: c.name.nameText.text, id: c.name.id });
            }
          }
        }
      }
    }
    if (mainData?.writers) {
      for (const credit of mainData.writers) {
        if (credit?.credits) {
          for (const c of credit.credits) {
            if (c?.name?.nameText?.text) {
              writers.push({ name: c.name.nameText.text, id: c.name.id });
            }
          }
        }
      }
    }
    if (mainData?.cast?.edges) {
      for (const edge of mainData.cast.edges) {
        const node = edge?.node;
        if (node?.name?.nameText?.text) {
          const characters = node.characters?.map((ch: any) => ch.name).filter(Boolean) || [];
          cast.push({
            name: node.name.nameText.text,
            id: node.name.id,
            character: characters.join(", "),
          });
        }
      }
    }
  } catch (e: any) {
    console.warn("Parse credits error:", e.message);
  }

  return { directors, writers, cast };
};

const parseReleaseInfo = ($: any) => {
  const releaseInfo: any[] = [];
  try {
    const $table = $("table.release-dates-table-test-only, table.ipl-zebra-list");
    if ($table.length) {
      $table.find("tr").each((_: any, row: any) => {
        const $row = $(row);
        const country = $row.find("td.release-date-item__country-name, td:first-child a").text().trim();
        const date = $row.find("td.release-date-item__date, td:nth-child(2)").text().trim();
        if (country && date) releaseInfo.push({ country, date });
      });
    }
  } catch {
    // ignore
  }
  return releaseInfo;
};

const parseAka = ($: any) => {
  const akaList: any[] = [];
  try {
    const $table = $("table.akas-table-test-only, table.ipl-zebra-list");
    if ($table.length) {
      $table.find("tr").each((_: any, row: any) => {
        const $row = $(row);
        const country = $row.find("td:first-child").text().trim();
        const title = $row.find("td:last-child").text().trim();
        if (title) akaList.push({ country, title });
      });
    }
  } catch {
    // ignore
  }
  return akaList;
};

export const gen_imdb = async (sid: any, env: any) => {
  const data: any = { site: "imdb", sid };
  if (!sid) return { ...data, error: "Invalid IMDb ID" };

  const imdbId = String(sid).startsWith("tt") ? sid : `tt${sid}`;
  const baseUrl = `https://www.imdb.com/title/${encodeURIComponent(imdbId)}/`;

  try {
    if (env?.ENABLED_CACHE === "false") {
      const cached = await getStaticMediaDataFromOurBits("imdb", imdbId);
      if (cached) return { ...data, ...cached, success: true, _from_ourbits: true };
    }

    const [mainResp, releaseResp] = await Promise.all([
      fetchWithTimeout(baseUrl, { headers: IMDB_HEADERS }, 15000),
      fetchWithTimeout(`${baseUrl}releaseinfo`, { headers: IMDB_HEADERS }, 10000).catch(() => null),
    ]);

    if (!mainResp.ok) {
      if (mainResp.status === 404) return { ...data, error: NONE_EXIST_ERROR };
      return { ...data, error: `IMDb returned ${mainResp.status}` };
    }

    const html = await mainResp.text();
    const nextData = extractNextData(html);
    if (!nextData) return { ...data, error: "Failed to parse IMDb data" };

    const aboveTheFold = extractAboveTheFold(nextData);
    const mainColumn = extractMainColumn(nextData);
    if (!aboveTheFold) return { ...data, error: "No data found for this IMDb title" };

    const titleText = aboveTheFold.titleText?.text || "";
    const originalTitle = aboveTheFold.originalTitleText?.text || titleText;
    const titleType = aboveTheFold.titleType?.id || "";
    const isTvSeries = titleType.toLowerCase().includes("tvseries") || titleType.toLowerCase().includes("tvminiseries");
    const year = aboveTheFold.releaseYear?.year || "";
    const endYear = aboveTheFold.releaseYear?.endYear || "";
    const runtime = aboveTheFold.runtime?.displayableProperty?.value?.plainText || "";
    const ratingObj = aboveTheFold.ratingsSummary || {};
    const rating = ratingObj.aggregateRating ? String(ratingObj.aggregateRating) : "N/A";
    const voteCount = ratingObj.voteCount || 0;
    const image = aboveTheFold.primaryImage?.url || "";
    const plot = aboveTheFold.plot?.plotText?.plainText || "";
    const genres = (aboveTheFold.genres?.genres || []).map((g: any) => g.text);
    const keywords = (aboveTheFold.keywords?.edges || []).map((e: any) => e?.node?.text).filter(Boolean);
    const originCountry = (aboveTheFold.countriesOfOrigin?.countries || []).map((c: any) => c.text);
    const languages = (aboveTheFold.spokenLanguages?.spokenLanguages || []).map((l: any) => l.text);

    const { directors, writers, cast } = parseCredits(mainColumn);

    let episodes = 0;
    const seasons: any[] = [];
    if (isTvSeries && mainColumn?.episodes) {
      episodes = mainColumn.episodes.totalEpisodes?.total || 0;
      const seasonsList = mainColumn.episodes.seasons || [];
      for (const s of seasonsList) {
        seasons.push({ number: s.number });
      }
    }

    let releaseDate = null;
    const releaseYear = aboveTheFold.releaseDate;
    if (releaseYear) {
      releaseDate = {
        year: releaseYear.year || "",
        month: releaseYear.month || "",
        day: releaseYear.day || "",
        country: releaseYear.country?.text || ""
      };
    }

    let release: any[] = [];
    let aka: any[] = [];
    if (releaseResp?.ok) {
      const releaseHtml = await releaseResp.text();
      const $release = page_parser(releaseHtml);
      release = parseReleaseInfo($release);
      aka = parseAka($release);
    }

    Object.assign(data, {
      success: true,
      name: titleText,
      original_title: originalTitle,
      type: isTvSeries ? "tv" : "movie",
      year: endYear ? `${year}–${endYear}` : String(year),
      runtime,
      rating,
      vote_count: voteCount.toLocaleString(),
      image,
      poster: image,
      plot,
      genres,
      keywords,
      origin_country: originCountry,
      languages,
      language: languages.length > 0,
      directors,
      writers,
      cast,
      episodes,
      seasons,
      release_date: releaseDate,
      release,
      aka,
      link: baseUrl,
    });

    return data;
  } catch (error: any) {
    return { ...data, error: error?.message || String(error) };
  }
};
