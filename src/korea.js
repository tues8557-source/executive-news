import { readPersistentCache, writePersistentCache } from "./persistent-cache.js";

export const koreaPublicOrigin = "https://www.korea.kr";
export const koreaFetchOrigin = "https://www.korea.kr";
export const koreaListUrl = `${koreaFetchOrigin}/multi/visualNewsList.do`;
export const koreaPublicListUrl = `${koreaPublicOrigin}/multi/visualNewsList.do`;

const cache = new Map();
const cacheMs = 1000 * 60 * 10;
const inflightCards = new Map();

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
  return new URL(value, koreaPublicOrigin).toString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await sleep(300 * attempt);
      }
    }
  }
  throw lastError;
}

function cacheKey(type, id) {
  return `v2:${type}:${id}`;
}

function isFresh(entry) {
  return Boolean(entry && Date.now() < entry.expiresAt);
}

function setMemoryCache(store, key, data) {
  const entry = {
    createdAt: Date.now(),
    expiresAt: Date.now() + cacheMs,
    data,
  };
  store.set(key, entry);
  return entry;
}

async function readThroughCache(store, namespace, key) {
  const inMemory = store.get(key);
  if (isFresh(inMemory)) {
    return inMemory;
  }

  const persisted = await readPersistentCache(namespace, key);
  if (isFresh(persisted)) {
    store.set(key, persisted);
    return persisted;
  }

  return persisted;
}

async function storeCache(store, namespace, key, data) {
  const entry = setMemoryCache(store, key, data);
  await writePersistentCache(namespace, key, data, cacheMs);
  return entry;
}

export function parseCards(html, page) {
  const listMatch = html.match(/<div class="photo_list(?:\s+card)?">[\s\S]*?<ul>([\s\S]*?)<\/ul>/);
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
      image: absoluteUrl(image),
      originalImage: absoluteUrl(image),
      href: absoluteUrl(href),
    });
  }

  const totalItems = Number(html.match(/<div class="paging">[\s\S]*?<span><i>[\s\S]*?<\/i>\s*\/\s*(\d+)<\/span>/)?.[1] || 0);
  const lastPage = Number(html.match(/class="last"[\s\S]*?pageLink\((\d+)\)/)?.[1] || Math.ceil(totalItems / 20) || page);
  const pageNumbers = [...html.matchAll(/title="(\d+)페이지"/g)].map((match) => Number(match[1]));

  return {
    page,
    lastPage,
    pageNumbers: [...new Set(pageNumbers)].filter(Boolean),
    cards,
    source: koreaPublicListUrl,
  };
}

export async function fetchCards(page) {
  const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1);
  const key = cacheKey("cards", pageNumber);
  const cached = await readThroughCache(cache, "cards", key);
  if (isFresh(cached)) {
    return cached.data;
  }

  const inflight = inflightCards.get(key);
  if (inflight) return inflight;

  const request = (async () => {
    try {
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

      const response = await fetchWithRetry(koreaListUrl, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "user-agent": "Mozilla/5.0",
          "accept-language": "ko-KR,ko;q=0.9,en;q=0.8",
          "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        body,
      });

      if (!response.ok) {
        throw new Error(`korea.kr responded with ${response.status}`);
      }

      const html = await response.text();
      const parsed = parseCards(html, pageNumber);
      await storeCache(cache, "cards", key, parsed);
      return parsed;
    } catch (error) {
      if (cached?.data) {
        return cached.data;
      }
      throw error;
    } finally {
      inflightCards.delete(key);
    }
  })();

  inflightCards.set(key, request);
  return request;
}
