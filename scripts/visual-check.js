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

  const hiddenMinistry = (await desktop.locator("#viewerMask").textContent()).trim();
  assert(hiddenMinistry === "", "viewer ministry should be hidden initially");

  await desktop.locator("#viewerMask").click();
  await screenshot(desktop, "desktop-viewer-revealed.png", { fullPage: false });
  const revealedMinistry = (await desktop.locator("#viewerMask").textContent()).trim();
  assert(revealedMinistry.length > 0, "viewer ministry should be revealed after click");

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
