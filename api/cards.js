import { fetchCards } from "../src/korea.js";

function sendJson(res, status, payload) {
  res.status(status).setHeader("content-type", "application/json; charset=utf-8");
  res.send(JSON.stringify(payload));
}

export default async function handler(req, res) {
  try {
    const data = await fetchCards(req.query.page || "1");
    sendJson(res, 200, data);
  } catch (error) {
    sendJson(res, 502, {
      error: "카드뉴스를 가져오지 못했습니다.",
      detail: error.message,
    });
  }
}
