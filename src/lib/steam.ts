/* eslint-disable @typescript-eslint/no-explicit-any */
import { fetchWithTimeout } from "./common";
import { getStaticMediaDataFromOurBits } from "./utils";

export const gen_steam = async (sid: any, env: any) => {
  const data: any = { site: "steam", sid };
  if (!sid) return { ...data, error: "Invalid Steam ID" };

  try {
    if (env?.ENABLED_CACHE === "false") {
      const cached = await getStaticMediaDataFromOurBits("steam", sid);
      if (cached) return { ...data, ...cached, success: true };
    }

    const url = `https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(sid)}&l=schinese`;
    const resp = await fetchWithTimeout(url, {}, 12000);
    if (!resp.ok) return { ...data, error: `Steam API error: ${resp.status}` };

    const json = await resp.json();
    const appData = json[String(sid)]?.data;
    if (!appData) return { ...data, error: "Steam app not found" };

    Object.assign(data, {
      success: true,
      name: appData.name || "",
      type: appData.type || "",
      release_date: appData.release_date?.date || "",
      developers: appData.developers || [],
      publishers: appData.publishers || [],
      genres: (appData.genres || []).map((g: any) => g.description),
      supported_languages: appData.supported_languages || "",
      header_image: appData.header_image || "",
      about_the_game: appData.about_the_game || "",
      short_description: appData.short_description || "",
      platforms: appData.platforms || {},
      categories: (appData.categories || []).map((c: any) => c.description),
      screenshots: (appData.screenshots || []).slice(0, 5),
      pc_requirements: appData.pc_requirements || {},
      price: appData.price_overview
        ? {
            currency: appData.price_overview.currency || "CNY",
            initial: (appData.price_overview.initial / 100).toFixed(2),
            final: (appData.price_overview.final / 100).toFixed(2),
            discount: appData.price_overview.discount_percent || 0,
          }
        : null,
    });

    return data;
  } catch (error: any) {
    return { ...data, error: error?.message || String(error) };
  }
};
