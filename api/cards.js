import { fetchCards } from "../src/korea.js";

const apiCacheControl = "public, max-age=0, s-maxage=600, stale-while-revalidate=86400";

function sendJson(res, status, payload) {
  res.status(status);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.send(JSON.stringify(payload));
}

function sendCachedJson(res, status, payload) {
  res.status(status);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", apiCacheControl);
  res.send(JSON.stringify(payload));
}

export default async function handler(req, res) {
  try {
    const data = await fetchCards(req.query.page || "1");
    sendCachedJson(res, 200, data);
  } catch (error) {
    sendJson(res, 502, {
      error: "카드뉴스를 가져오지 못했습니다.",
      detail: error.message,
    });
  }
}
