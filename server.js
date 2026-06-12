import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || "0.0.0.0";
const koreaOrigin = "https://www.korea.kr";
const koreaListUrl = `${koreaOrigin}/multi/visualNewsList.do`;
const cache = new Map();
const cacheMs = 1000 * 60 * 10;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function formatDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateRange() {
  const end = new Date();
  const start = new Date(end);
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
  };
}

function decodeHtml(value = "") {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .trim();
}

function stripTags(value = "") {
  return decodeHtml(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " "));
}

function absoluteUrl(value = "") {
  if (!value) return "";
  if (value.startsWith("http")) return value;
  return new URL(value, koreaOrigin).toString();
}

function proxiedImageUrl(value = "") {
  const imageUrl = absoluteUrl(value);
  if (!imageUrl) return "";
  return `/api/image?url=${encodeURIComponent(imageUrl)}`;
}

function parseCards(html, page) {
  const listMatch = html.match(/<div class="photo_list card">[\s\S]*?<ul>([\s\S]*?)<\/ul>/);
  const listHtml = listMatch?.[1] || "";
  const cards = [];

  for (const item of listHtml.matchAll(/<li>([\s\S]*?)<\/li>/g)) {
    const itemHtml = item[1];
    const href = decodeHtml(itemHtml.match(/<a[^>]+href="([^"]+)"/)?.[1] || "");
    const newsId = itemHtml.match(/newsId=(\d+)/)?.[1] || "";
    const image = decodeHtml(itemHtml.match(/<img[^>]+src="([^"]+)"/)?.[1] || "");
    const title = stripTags(itemHtml.match(/<strong>([\s\S]*?)<\/strong>/)?.[1] || "");
    const sourceParts = [...itemHtml.matchAll(/<span>([\s\S]*?)<\/span>/g)]
      .map((match) => stripTags(match[1]))
      .filter(Boolean);

    if (!newsId || !image || !title) continue;

    cards.push({
      id: newsId,
      page,
      indexInPage: cards.length,
      title,
      date: sourceParts[0] || "",
      ministry: sourceParts.slice(1).join(" ") || "",
      image: proxiedImageUrl(image),
      originalImage: absoluteUrl(image),
      href: absoluteUrl(href),
    });
  }

  const lastPage = Number(html.match(/class="last"[\s\S]*?pageLink\((\d+)\)/)?.[1] || page);
  const pageNumbers = [...html.matchAll(/title="(\d+)페이지"/g)].map((match) => Number(match[1]));

  return {
    page,
    lastPage,
    pageNumbers: [...new Set(pageNumbers)].filter(Boolean),
    cards,
    source: koreaListUrl,
  };
}

async function fetchCards(page) {
  const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1);
  const cached = cache.get(pageNumber);
  if (cached && Date.now() - cached.createdAt < cacheMs) {
    return cached.data;
  }

  const { startDate, endDate } = getDateRange();
  const body = new URLSearchParams({
    pageIndex: String(pageNumber),
    repCodeType: "",
    repCode: "",
    startDate,
    endDate,
    srchWord: "",
    cateId: "",
    period: "",
    nRepCode: "",
  });

  const response = await fetch(koreaListUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "user-agent": "Mozilla/5.0",
      "accept-language": "ko-KR,ko;q=0.9,en;q=0.8",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`korea.kr responded with ${response.status}`);
  }

  const html = await response.text();
  const data = parseCards(html, pageNumber);
  cache.set(pageNumber, { createdAt: Date.now(), data });
  return data;
}

async function fetchImage(urlValue) {
  const url = new URL(urlValue);
  if (url.hostname !== "www.korea.kr" || !url.pathname.startsWith("/newsWeb/resources/attaches/")) {
    throw new Error("unsupported image url");
  }

  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0",
      "accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "referer": koreaListUrl,
    },
  });

  if (!response.ok) {
    throw new Error(`image responded with ${response.status}`);
  }

  return {
    body: Buffer.from(await response.arrayBuffer()),
    type: response.headers.get("content-type") || "image/jpeg",
  };
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function serveStatic(req, res) {
  const pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(publicDir, requested));

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes[extname(filePath)] || "application/octet-stream",
    });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/cards") {
    try {
      const data = await fetchCards(url.searchParams.get("page") || "1");
      sendJson(res, 200, data);
    } catch (error) {
      sendJson(res, 502, {
        error: "카드뉴스를 가져오지 못했습니다.",
        detail: error.message,
      });
    }
    return;
  }

  if (url.pathname === "/api/image") {
    try {
      const image = await fetchImage(url.searchParams.get("url") || "");
      res.writeHead(200, {
        "content-type": image.type,
        "cache-control": "public, max-age=3600",
      });
      res.end(image.body);
    } catch (error) {
      sendJson(res, 400, {
        error: "이미지를 가져오지 못했습니다.",
        detail: error.message,
      });
    }
    return;
  }

  await serveStatic(req, res);
});

server.listen(port, host, () => {
  console.log(`Card news app running at http://${host}:${port}`);
});
