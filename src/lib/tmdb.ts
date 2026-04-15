/* eslint-disable @typescript-eslint/no-explicit-any */
import { fetchWithTimeout } from "./common";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w780";

const tmdbFetch = async (path: string, apiKey: string, params: Record<string, string> = {}) => {
  const url = new URL(`${TMDB_BASE_URL}${path}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("language", "zh-CN");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const resp = await fetchWithTimeout(url.toString(), {}, 12000);
  if (!resp.ok) throw new Error(`TMDB API error: ${resp.status}`);
  return resp.json();
};

export const gen_tmdb = async (sid: any, env: any) => {
  const data: any = { site: "tmdb", sid };
  const apiKey = env?.TMDB_API_KEY;
  if (!apiKey) return { ...data, error: "TMDB API key not configured" };
  if (!sid) return { ...data, error: "Invalid TMDB ID" };

  const parts = String(sid).split("/");
  const mediaType = parts[0]; // movie or tv
  const tmdbId = parts[1] || parts[0];

  if (!["movie", "tv"].includes(mediaType)) {
    return { ...data, error: "Invalid TMDB media type. Must be 'movie' or 'tv'." };
  }

  try {
    const detailPath = `/${mediaType}/${tmdbId}`;
    const [detail, credits, externalIds] = await Promise.all([
      tmdbFetch(detailPath, apiKey, { append_to_response: "keywords" }),
      tmdbFetch(`${detailPath}/credits`, apiKey),
      tmdbFetch(`${detailPath}/external_ids`, apiKey),
    ]);

    if (!detail || !detail.id) {
      return { ...data, error: "TMDB returned no data" };
    }

    // If overview is empty, try fetching translations
    let overview = detail.overview || "";
    if (!overview) {
      try {
        const translations = await tmdbFetch(`${detailPath}/translations`, apiKey);
        const zhTrans = translations.translations?.find((t: any) =>
          t.iso_639_1 === "zh" || t.iso_3166_1 === "CN" || t.iso_3166_1 === "TW"
        );
        const enTrans = translations.translations?.find((t: any) => t.iso_639_1 === "en");
        overview = zhTrans?.data?.overview || enTrans?.data?.overview || "";
      } catch {
        // ignore
      }
    }

    const poster = detail.poster_path ? `${TMDB_IMAGE_BASE}${detail.poster_path}` : "";
    const title = detail.title || detail.name || "";
    const originalTitle = detail.original_title || detail.original_name || "";
    const genres = (detail.genres || []).map((g: any) => g.name);
    const languages = (detail.spoken_languages || []).map((l: any) => l.name || l.english_name);
    const countries = (detail.production_countries || []).map((c: any) => c.name);
    const directors = (credits.crew || []).filter((c: any) => c.job === "Director").map((d: any) => ({ name: d.name, id: d.id }));
    const producers = (credits.crew || []).filter((c: any) => c.job === "Producer").map((p: any) => ({ name: p.name, id: p.id }));
    const cast = (credits.cast || []).slice(0, 20).map((a: any) => ({
      name: a.name,
      character: a.character || "",
      id: a.id,
    }));

    const imdbId = externalIds.imdb_id || "";
    const imdbLink = imdbId ? `https://www.imdb.com/title/${imdbId}/` : "";

    Object.assign(data, {
      success: true,
      tmdb_id: `${mediaType}/${detail.id}`,
      title,
      original_title: originalTitle,
      poster,
      genres,
      languages,
      countries,
      overview,
      tmdb_rating: detail.vote_average ? `${detail.vote_average} / 10 from ${detail.vote_count} users` : "N/A",
      directors,
      producers,
      cast,
      imdb_id: imdbId,
      imdb_link: imdbLink,
    });

    if (mediaType === "movie") {
      data.release_date = detail.release_date || "";
      data.runtime = detail.runtime ? `${detail.runtime} min` : "";
    } else {
      data.first_air_date = detail.first_air_date || "";
      data.number_of_episodes = detail.number_of_episodes || "";
      data.number_of_seasons = detail.number_of_seasons || "";
      data.episode_run_time = detail.episode_run_time?.length
        ? `${detail.episode_run_time[0]} min`
        : "";
    }

    return data;
  } catch (error: any) {
    return { ...data, error: error?.message || String(error) };
  }
};
