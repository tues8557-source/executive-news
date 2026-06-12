import { fetchCards, fetchImage } from "./korea.js";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/cards") {
      try {
        const data = await fetchCards(url.searchParams.get("page") || "1");
        return jsonResponse(data);
      } catch (error) {
        return jsonResponse({
          error: "카드뉴스를 가져오지 못했습니다.",
          detail: error.message,
        }, 502);
      }
    }

    if (url.pathname === "/api/image") {
      try {
        const image = await fetchImage(url.searchParams.get("url") || "");
        return new Response(image.body, {
          headers: {
            "content-type": image.type,
            "cache-control": "public, max-age=3600",
          },
        });
      } catch (error) {
        return jsonResponse({
          error: "이미지를 가져오지 못했습니다.",
          detail: error.message,
        }, 400);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
