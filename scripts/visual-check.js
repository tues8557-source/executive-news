import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.APP_URL || "http://127.0.0.1:4173";
const outDir = join(process.cwd(), "test-results");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForCards(page, imageCount = 1, minCards = 6) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".card", { timeout: 30000 });
  await page.waitForFunction(
    (expectedCards) => document.querySelectorAll(".card").length >= expectedCards,
    minCards,
    { timeout: 30000 },
  );
  await page.waitForFunction(
    (expectedImages) => [...document.querySelectorAll(".card img")]
      .slice(0, expectedImages)
      .every((img) => img.complete && img.naturalWidth > 0),
    imageCount,
    { timeout: 45000 },
  );
}

async function waitForLoadedImages(page, count) {
  await page.waitForFunction(
    (expectedCount) => {
      const images = [...document.querySelectorAll(".card img")];
      return images.length >= expectedCount
        && images.slice(0, expectedCount).every((img) => img.complete && img.naturalWidth > 0);
    },
    count,
    { timeout: 45000 },
  );
}

async function visibleCardsInFirstRow(page) {
  return page.locator(".card").evaluateAll((cards) => {
    const tops = cards.map((card) => Math.round(card.getBoundingClientRect().top));
    const firstTop = tops[0];
    return tops.filter((top) => Math.abs(top - firstTop) <= 3).length;
  });
}

async function screenshot(page, name, options = {}) {
  await page.screenshot({ path: join(outDir, name), fullPage: options.fullPage ?? true });
}

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });

try {
  const desktop = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });

  await waitForCards(desktop);
  await screenshot(desktop, "desktop-gallery.png");

  const cardCount = await desktop.locator(".card").count();
  assert(cardCount >= 6, `expected at least 6 ministry cards, got ${cardCount}`);

  const desktopColumns = await visibleCardsInFirstRow(desktop);
  assert(desktopColumns === 3, `expected 3 desktop columns, got ${desktopColumns}`);

  assert(
    await desktop.locator(".card").first().locator(".reveal-mask").isVisible(),
    "ministry mask should be visible initially",
  );
  const visibleTitle = (await desktop.locator(".card-title").first().textContent()).trim();
  assert(visibleTitle.length > 0, "gallery title should be visible initially");
  const firstMinistryBox = await desktop.locator(".card").first().locator(".ministry-wrap").boundingBox();
  const firstMaskBox = await desktop.locator(".card").first().locator(".reveal-mask").boundingBox();
  assert(firstMinistryBox && firstMaskBox, "ministry value and mask should have boxes");
  assert(
    firstMaskBox.x <= firstMinistryBox.x + 1
      && firstMaskBox.y <= firstMinistryBox.y + 1
      && firstMaskBox.width >= firstMinistryBox.width - 2
      && firstMaskBox.height >= firstMinistryBox.height - 2,
    "mask should cover ministry area",
  );

  await desktop.locator("#filterTrigger").click();
  assert(
    await desktop.locator('#filterOptions input[value="ministry"]').isChecked(),
    "ministry filter should remain checked",
  );
  assert(
    !(await desktop.locator('#filterOptions input[value="office"]').isChecked())
      && !(await desktop.locator('#filterOptions input[value="agency"]').isChecked())
      && !(await desktop.locator('#filterOptions input[value="committee"]').isChecked())
      && !(await desktop.locator('#filterOptions input[value="other"]').isChecked()),
    "only ministry filter should be checked by default",
  );
  for (const value of ["office", "agency", "committee", "other"]) {
    await desktop.locator(`#filterOptions input[value="${value}"]`).check();
  }
  await desktop.waitForFunction(
    () => document.querySelectorAll(".card").length >= 18,
    null,
    { timeout: 10000 },
  );
  await desktop.locator("#filterTrigger").click();

  await desktop.locator(".card").first().locator(".reveal-mask").click();
  await screenshot(desktop, "desktop-revealed-card.png");
  assert(
    !(await desktop.locator(".card").first().locator(".reveal-mask").isVisible()),
    "ministry mask should disappear after click",
  );

  await desktop.locator(".card").first().click();
  await desktop.waitForSelector(".viewer.open", { timeout: 10000 });
  await screenshot(desktop, "desktop-viewer-masked.png", { fullPage: false });

  const galleryRevealedMinistry = (await desktop.locator("#viewerMask").textContent()).trim();
  assert(galleryRevealedMinistry.length > 0, "viewer ministry should be revealed after gallery reveal");

  await desktop.locator("#viewerNext").click();
  await desktop.waitForFunction(
    () => document.querySelector("#viewerMask")?.textContent.trim() === "",
    null,
    { timeout: 10000 },
  );
  await desktop.locator("#viewerMask").click();
  await screenshot(desktop, "desktop-viewer-revealed.png", { fullPage: false });
  const revealedMinistry = (await desktop.locator("#viewerMask").textContent()).trim();
  assert(revealedMinistry.length > 0, "viewer ministry should be revealed after click");
  await desktop.locator("#closeViewer").click();
  await desktop.waitForFunction(
    () => !document.querySelector(".viewer")?.classList.contains("open"),
    null,
    { timeout: 10000 },
  );
  assert(
    !(await desktop.locator(".card").nth(1).locator(".reveal-mask").isVisible()),
    "gallery mask should disappear after viewer reveal",
  );

  await desktop.locator(".card").nth(1).click();
  await desktop.waitForSelector(".viewer.open", { timeout: 10000 });
  const titleBeforeNext = await desktop.locator("#viewerTitle").textContent();
  await desktop.locator("#viewerNext").click();
  await desktop.waitForFunction(
    (oldTitle) => document.querySelector("#viewerTitle")?.textContent !== oldTitle,
    titleBeforeNext,
    { timeout: 10000 },
  );
  const titleAfterNext = await desktop.locator("#viewerTitle").textContent();
  assert(titleAfterNext !== titleBeforeNext, "viewer next should change card");

  await desktop.locator("#closeViewer").click();
  await desktop.waitForFunction(
    () => !document.querySelector(".viewer")?.classList.contains("open"),
    null,
    { timeout: 10000 },
  );

  await desktop.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await desktop.waitForFunction(
    () => document.querySelectorAll(".card").length >= 36
      && document.querySelector("#pageInput")?.value === "2",
    null,
    { timeout: 30000 },
  );
  await waitForLoadedImages(desktop, 12);
  await screenshot(desktop, "desktop-page-2.png");
  const page2Status = await desktop.locator("#pageInput").inputValue();
  assert(Number(page2Status) >= 2, `expected page 2 or later indicator, got ${page2Status}`);
  const loadedCardCount = await desktop.locator(".card").count();
  assert(loadedCardCount >= 36, `expected infinite scroll to append page 2, got ${loadedCardCount}`);

  const page10Response = desktop.waitForResponse(
    (response) => response.url().includes("/api/cards?page=10") && response.ok(),
    { timeout: 30000 },
  );
  await desktop.locator("#pageInput").fill("10");
  await desktop.locator("#pageJump button").click();
  await page10Response;
  await desktop.waitForFunction(
    () => document.querySelector("#pageInput")?.value === "10"
      && document.querySelector('[data-page="10"]'),
    null,
    { timeout: 30000 },
  );
  const page10Status = await desktop.locator("#pageInput").inputValue();
  assert(page10Status === "10", `expected page 10 indicator, got ${page10Status}`);
  assert((await desktop.locator("#pageInput").inputValue()) === "10", "page input should show jumped page");

  const filteredGap = await browser.newPage({
    viewport: { width: 1024, height: 760 },
    deviceScaleFactor: 1,
  });
  const mockImage = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='640' viewBox='0 0 640 640'%3E%3Crect width='640' height='640' fill='%23e6f4ff'/%3E%3Ctext x='320' y='320' font-size='42' text-anchor='middle' fill='%23122333'%3Emock card%3C/text%3E%3C/svg%3E";
  const mockCards = {
    1: [
      {
        id: "committee-1",
        page: 1,
        indexInPage: 0,
        title: "위원회 첫 카드",
        date: "2026.06.12",
        ministry: "국가위원회",
        image: mockImage,
        originalImage: mockImage,
      },
      {
        id: "ministry-1",
        page: 1,
        indexInPage: 1,
        title: "부처 카드",
        date: "2026.06.12",
        ministry: "교육부",
        image: mockImage,
        originalImage: mockImage,
      },
    ],
    2: [
      {
        id: "ministry-2",
        page: 2,
        indexInPage: 0,
        title: "위원회가 없는 페이지",
        date: "2026.06.12",
        ministry: "과학기술정보통신부",
        image: mockImage,
        originalImage: mockImage,
      },
    ],
    3: [
      {
        id: "committee-3",
        page: 3,
        indexInPage: 0,
        title: "위원회 다음 카드",
        date: "2026.06.12",
        ministry: "방송통신위원회",
        image: mockImage,
        originalImage: mockImage,
      },
    ],
  };

  await filteredGap.route("**/api/cards?page=*", async (route) => {
    const page = Number(new URL(route.request().url()).searchParams.get("page"));
    await route.fulfill({
      json: {
        page,
        lastPage: 3,
        pageNumbers: [1, 2, 3],
        cards: mockCards[page] || [],
      },
    });
  });
  await waitForCards(filteredGap, 1, 1);
  await filteredGap.locator("#filterTrigger").click();
  await filteredGap.locator('#filterOptions input[value="committee"]').check();
  await filteredGap.locator('#filterOptions input[value="ministry"]').uncheck();
  await filteredGap.locator("#filterTrigger").click();
  await filteredGap.waitForFunction(
    () => [...document.querySelectorAll(".card-title")]
      .some((title) => title.textContent.includes("위원회 첫 카드")),
    null,
    { timeout: 10000 },
  );
  await filteredGap.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await filteredGap.waitForFunction(
    () => document.querySelector("#pageInput")?.value === "3"
      && [...document.querySelectorAll(".card-title")].some((title) => title.textContent.includes("위원회 다음 카드")),
    null,
    { timeout: 10000 },
  );
  const filteredGapCount = await filteredGap.locator(".card").count();
  assert(filteredGapCount === 2, `expected filtered scroll to skip empty page and show 2 cards, got ${filteredGapCount}`);
  await filteredGap.close();

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });

  await waitForCards(mobile, 1, 3);
  await screenshot(mobile, "mobile-gallery.png");
  const mobileColumns = await visibleCardsInFirstRow(mobile);
  assert(mobileColumns === 1, `expected 1 mobile column, got ${mobileColumns}`);

  await mobile.locator(".card").first().click();
  await mobile.waitForSelector(".viewer.open", { timeout: 10000 });
  await screenshot(mobile, "mobile-viewer.png", { fullPage: false });
  assert(await mobile.locator(".viewer.open").isVisible(), "mobile viewer should open");

  const screenshots = (await readdir(outDir)).filter((file) => file.endsWith(".png")).sort();
  console.log("visual checks passed");
  for (const file of screenshots) {
    console.log(join(outDir, file));
  }
} finally {
  await browser.close();
}
