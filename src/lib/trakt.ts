/* eslint-disable @typescript-eslint/no-explicit-any */
import { fetchWithTimeout } from "./common";

const TRAKT_API_BASE = "https://api.trakt.tv";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w780";

const traktFetch = async (path: string, env: any, extraHeaders: Record<string, string> = {}) => {
  const clientId = env?.TRAKT_API_CLIENT_ID;
  if (!clientId) throw new Error("Trakt API client ID not configured");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "trakt-api-version": "2",
    "trakt-api-key": clientId,
    ...extraHeaders,
  };

  const resp = await fetchWithTimeout(`${TRAKT_API_BASE}${path}`, { headers }, 12000);
  if (!resp.ok) throw new Error(`Trakt API error: ${resp.status}`);
  return resp.json();
};

const fetchTmdbPoster = async (tmdbId: string, mediaType: string, env: any) => {
  if (!tmdbId || !env?.TMDB_API_KEY) return "";
  try {
    const url = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${env.TMDB_API_KEY}&language=zh-CN`;
    const resp = await fetchWithTimeout(url, {}, 8000);
    if (!resp.ok) return "";
    const data = await resp.json();
    return data.poster_path ? `${TMDB_IMAGE_BASE}${data.poster_path}` : "";
  } catch {
    return "";
  }
};

export const gen_trakt = async (sid: any, env: any) => {
  const data: any = { site: "trakt", sid };
  if (!sid) return { ...data, error: "Invalid Trakt ID" };

  const parts = String(sid).split("/");
  const mediaType = parts[0]; // movies or shows
  const slug = parts[1] || parts[0];

  if (!["movies", "shows"].includes(mediaType)) {
    return { ...data, error: "Invalid Trakt media type. Must be 'movies' or 'shows'." };
  }

  try {
    const basePath = `/${mediaType}/${slug}`;
    const [detail, people] = await Promise.all([
      traktFetch(`${basePath}?extended=full`, env),
      traktFetch(`${basePath}/people`, env),
    ]);

    if (!detail) return { ...data, error: "Trakt returned no data" };

    const isMovie = mediaType === "movies";
    const title = detail.title || "";
    const year = detail.year || "";
    const runtime = detail.runtime || "";
    const country = detail.country?.toUpperCase() || "";
    const language = detail.language ? [detail.language] : [];
    const certification = detail.certification || "";
    const overview = detail.overview || "";
    const rating = detail.rating ? detail.rating.toFixed(1) : "";
    const votes = detail.votes || 0;
    const ratingFormat = rating ? `${rating} / 10 from ${votes} users` : "N/A";
    const genres = (detail.genres || []).map((g: string) =>
      g.charAt(0).toUpperCase() + g.slice(1)
    );

    const ids = detail.ids || {};
    const imdbId = ids.imdb || "";
    const tmdbId = ids.tmdb || "";
    const tvdbId = ids.tvdb || "";
    const traktSlug = ids.slug || slug;

    const imdbLink = imdbId ? `https://www.imdb.com/title/${imdbId}/` : "";
    const traktLink = `https://app.trakt.tv/${mediaType}/${traktSlug}`;
    const tmdbLink = tmdbId
      ? `https://www.themoviedb.org/${isMovie ? "movie" : "tv"}/${tmdbId}/`
      : "";
    const tvdbLink = tvdbId ? `https://www.thetvdb.com/?tab=series&id=${tvdbId}` : "";

    // Get poster from TMDB
    const poster = tmdbId
      ? await fetchTmdbPoster(String(tmdbId), isMovie ? "movie" : "tv", env)
      : "";

    // Parse people
    const directors = (people.crew?.directing || people.crew?.production || [])
      .filter((p: any) => p.jobs?.some((j: any) => j.job === "Director") || p.job === "Director")
      .map((p: any) => ({ name: p.person?.name || "", id: p.person?.ids?.slug || "" }));

    const writers = (people.crew?.writing || [])
      .map((p: any) => ({ name: p.person?.name || "", id: p.person?.ids?.slug || "" }));

    const cast = (people.cast || []).slice(0, 15).map((c: any) => ({
      name: c.person?.name || "",
      character: c.character || "",
      id: c.person?.ids?.slug || "",
    }));

    // Seasons for shows
    let seasons: any[] = [];
    if (!isMovie) {
      try {
        const seasonsData = await traktFetch(`${basePath}/seasons?extended=full`, env);
        seasons = (seasonsData || [])
          .filter((s: any) => s.number > 0) // exclude specials
          .map((s: any) => ({
            number: s.number,
            episodeCount: s.episode_count || s.aired_episodes || 0,
          }));
      } catch {
        // ignore
      }
    }

    Object.assign(data, {
      success: true,
      type: isMovie ? "movie" : "tv",
      title,
      year,
      runtime,
      country,
      language,
      certification,
      overview,
      rating,
      rating_format: ratingFormat,
      genres,
      poster,
      people: { directors, writers, cast },
      seasons,
      released: isMovie ? detail.released : undefined,
      first_aired: !isMovie ? detail.first_aired : undefined,
      imdb_id: imdbId,
      imdb_link: imdbLink,
      trakt_link: traktLink,
      tmdb_link: tmdbLink,
      tvdb_link: tvdbLink,
    });

    return data;
  } catch (error: any) {
    return { ...data, error: error?.message || String(error) };
  }
};
