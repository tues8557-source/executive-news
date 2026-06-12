export const koreaOrigin = "https://www.korea.kr";
export const koreaListUrl = `${koreaOrigin}/multi/visualNewsList.do`;

const cache = new Map();
const cacheMs = 1000 * 60 * 10;

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

export function parseCards(html, page) {
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

export async function fetchCards(page) {
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

export async function fetchImage(urlValue) {
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
    body: await response.arrayBuffer(),
    type: response.headers.get("content-type") || "image/jpeg",
  };
}
