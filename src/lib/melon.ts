/* eslint-disable @typescript-eslint/no-explicit-any */
import { page_parser, fetchWithTimeout } from "./common";

const MELON_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
};

const GENRE_MAP: Record<string, string> = {
  "발라드": "Ballad",
  "댄스": "Dance",
  "랩/힙합": "Rap/Hip-Hop",
  "R&B/Soul": "R&B/Soul",
  "인디음악": "Indie",
  "록/메탈": "Rock/Metal",
  "포크/블루스": "Folk/Blues",
  "일렉트로니카": "Electronica",
  "트로트": "Trot",
  "국내OST": "K-OST",
  "POP": "Pop",
  "록": "Rock",
  "일렉트로닉": "Electronic",
  "J-POP": "J-Pop",
  "클래식": "Classic",
  "재즈": "Jazz",
  "뉴에이지": "New Age",
  "월드뮤직": "World Music",
};

export const gen_melon = async (sid: any) => {
  const data: any = { site: "melon", sid };
  if (!sid) return { ...data, error: "Invalid Melon ID" };

  const albumId = String(sid).replace("album/", "");

  try {
    const url = `https://www.melon.com/album/detail.htm?albumId=${encodeURIComponent(albumId)}`;
    const resp = await fetchWithTimeout(url, { headers: MELON_HEADERS }, 12000);
    if (!resp.ok) return { ...data, error: `Melon returned ${resp.status}` };

    const html = await resp.text();
    const $ = page_parser(html);

    const title = $("div.song_name").text().replace("앨범명", "").trim();
    if (!title) return { ...data, error: "Album not found on Melon" };

    const poster = $("a#d_album_org img").attr("src") || "";
    const artists = $("div.artist a span").map(function (this: any) { return $(this).text().trim(); }).get();
    const releaseDate = $('dt:contains("발매일")').next("dd").text().trim();
    const albumType = $('dt:contains("종류")').next("dd").text().trim();
    const genresRaw = $('dt:contains("장르")').next("dd").text().trim();
    const genres = genresRaw
      ? genresRaw.split(",").map((g: string) => {
          const trimmed = g.trim();
          return GENRE_MAP[trimmed] ? `${trimmed} (${GENRE_MAP[trimmed]})` : trimmed;
        })
      : [];
    const publisher = $('dt:contains("발매사")').next("dd").text().trim();
    const planning = $('dt:contains("기획사")').next("dd").text().trim();
    const description = $("div.dtl_albuminfo").text().trim();

    const tracks: any[] = [];
    $("table tbody tr").each((_: any, el: any) => {
      const $row = $(el);
      const number = $row.find("td:nth-child(1) .rank").text().trim() || $row.find("td:nth-child(1)").text().trim();
      const trackTitle = $row.find("td:nth-child(4) .ellipsis a:first-child").text().trim() || $row.find("td .ellipsis.rank01 a").text().trim();
      const trackArtists = $row.find("td:nth-child(5) .ellipsis a, td .ellipsis.rank02 a")
        .map(function (this: any) { return $(this).text().trim(); }).get();
      if (trackTitle) {
        tracks.push({ number, title: trackTitle, artists: trackArtists });
      }
    });

    Object.assign(data, {
      success: true,
      title,
      poster,
      artists,
      release_date: releaseDate,
      album_type: albumType,
      genres,
      publisher,
      planning,
      description,
      tracks,
      melon_link: url,
    });

    return data;
  } catch (error: any) {
    return { ...data, error: error?.message || String(error) };
  }
};
