import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchCards, fetchImage } from "./src/korea.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || "0.0.0.0";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

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
      res.end(Buffer.from(image.body));
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
