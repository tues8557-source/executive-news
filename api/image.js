import { fetchImage } from "../src/korea.js";

function sendJson(res, status, payload) {
  res.status(status).setHeader("content-type", "application/json; charset=utf-8");
  res.send(JSON.stringify(payload));
}

export default async function handler(req, res) {
  try {
    const image = await fetchImage(req.query.url || "");
    res.status(200);
    res.setHeader("content-type", image.type);
    res.setHeader("cache-control", "public, max-age=3600");
    res.send(Buffer.from(image.body));
  } catch (error) {
    sendJson(res, 400, {
      error: "이미지를 가져오지 못했습니다.",
      detail: error.message,
    });
  }
}
