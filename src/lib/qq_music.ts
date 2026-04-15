/* eslint-disable @typescript-eslint/no-explicit-any */
import { page_parser, fetchWithTimeout } from "./common";

const QQ_MUSIC_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9",
};

export const gen_qq_music = async (sid: any, env: any) => {
  const data: any = { site: "qq_music", sid };
  if (!sid) return { ...data, error: "Invalid QQ Music ID" };

  try {
    const url = `https://y.qq.com/n/ryqq/albumDetail/${encodeURIComponent(sid)}`;
    const headers = { ...QQ_MUSIC_HEADERS, ...(env?.QQ_COOKIE ? { Cookie: env.QQ_COOKIE } : {}) };
    const resp = await fetchWithTimeout(url, { headers }, 12000);
    if (!resp.ok) return { ...data, error: `QQ Music returned ${resp.status}` };

    const html = await resp.text();
    const $ = page_parser(html);

    let initialData: any = null;
    $("script").each((_: any, el: any) => {
      const text = $(el).html() || "";
      const match = text.match(/window\.__INITIAL_DATA__\s*=\s*(\{[\s\S]*?\});?\s*(?:<\/script>|$)/);
      if (match?.[1]) {
        try {
          // Replace undefined with null for valid JSON
          const cleaned = match[1].replace(/:\s*undefined/g, ": null");
          initialData = JSON.parse(cleaned);
        } catch {
          // ignore parse error
        }
      }
    });

    if (!initialData) {
      return { ...data, error: "Failed to parse QQ Music page data" };
    }

    // Navigate the data structure
    const albumDetail = initialData.detail || initialData.albumDetail || initialData;
    const albumInfo = albumDetail.albumInfo || albumDetail.data?.albumInfo || albumDetail;

    const name = albumInfo.name || albumInfo.albumName || "";
    if (!name) return { ...data, error: "Album not found on QQ Music" };

    const cover = albumInfo.picurl || albumInfo.pic || albumInfo.albumPic || "";
    const singer = (albumInfo.singer || albumInfo.singerList || []).map((s: any) => ({
      name: s.name || s.singerName || "",
      mid: s.mid || s.singerMid || "",
    }));
    const albumType = albumInfo.genre?.title || albumInfo.albumType || "";
    const language = albumInfo.lan || albumInfo.language || "";
    const company = albumInfo.company || albumInfo.publishCompany || "";
    const publishTime = albumInfo.ctime || albumInfo.publishTime || albumInfo.publicTime || "";
    const desc = albumInfo.desc || albumInfo.description || "";

    const songList = (albumDetail.songList || albumDetail.list || albumDetail.data?.songList || []).map((song: any) => ({
      name: song.name || song.songName || "",
      sub_name: song.subtitle || song.sub_name || "",
      singer: (song.singer || []).map((s: any) => ({
        name: s.name || s.singerName || "",
      })),
      playTime: song.interval ? formatDuration(song.interval) : "",
    }));

    Object.assign(data, {
      success: true,
      name,
      cover: cover ? cover.replace(/\d+x\d+/, "800x800") : "",
      singer,
      albumType,
      language,
      company,
      publishTime,
      desc,
      songList,
    });

    return data;
  } catch (error: any) {
    return { ...data, error: error?.message || String(error) };
  }
};

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}
