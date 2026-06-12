const state = {
  page: 1,
  lastPage: 1,
  pageNumbers: [],
  cards: [],
  loadedPages: new Set(),
  viewerIndex: -1,
  revealedCards: new Set(),
  activeCategories: new Set(["ministry"]),
  loading: false,
  autoLoading: false,
};

const gallery = document.querySelector("#gallery");
const statusEl = document.querySelector("#status");
const filterTrigger = document.querySelector("#filterTrigger");
const filterOptions = document.querySelector("#filterOptions");
const pageJump = document.querySelector("#pageJump");
const pageInput = document.querySelector("#pageInput");
const pageTotal = document.querySelector("#pageTotal");
const scrollSentinel = document.querySelector("#scrollSentinel");
const firstPage = document.querySelector("#firstPage");
const prevPage = document.querySelector("#prevPage");
const nextPage = document.querySelector("#nextPage");
const lastPage = document.querySelector("#lastPage");
const viewer = document.querySelector("#viewer");
const viewerImage = document.querySelector("#viewerImage");
const viewerTitle = document.querySelector("#viewerTitle");
const viewerDate = document.querySelector("#viewerDate");
const viewerMask = document.querySelector("#viewerMask");
const viewerPrev = document.querySelector("#viewerPrev");
const viewerNext = document.querySelector("#viewerNext");
const closeViewer = document.querySelector("#closeViewer");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function escapeText(value = "") {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function classifyDepartment(ministry = "") {
  const value = ministry.replace(/\s+/g, " ").trim();
  if (!value) return "other";
  if (value.includes("국민소통실") || value.includes("국무조정실")) return "other";
  if (value.endsWith("위원회")) return "committee";
  if (value.endsWith("청")) return "agency";
  if (value.endsWith("처")) return "office";
  if (value.endsWith("부")) return "ministry";
  return "other";
}

function visibleCards() {
  return state.cards.filter((card) => state.activeCategories.has(classifyDepartment(card.ministry)));
}

function updateStatus() {
  const visibleCount = visibleCards().length;
  setStatus(`${state.cards.length}개 로드됨 · ${visibleCount}개 표시 중`);
}

function positionFilterMenu() {
  const rect = filterTrigger.getBoundingClientRect();
  const width = Math.max(180, rect.width);
  filterOptions.style.minWidth = `${width}px`;
  filterOptions.style.top = `${rect.bottom + 8}px`;
  filterOptions.style.left = `${Math.min(rect.left, window.innerWidth - width - 12)}px`;
}

function setFilterMenu(open) {
  filterOptions.hidden = !open;
  filterTrigger.setAttribute("aria-expanded", String(open));
  if (open) positionFilterMenu();
}

async function loadPage(page, options = {}) {
  if (state.loading) return false;
  const pageNumber = Math.max(1, Math.min(state.lastPage || page, Number(page) || 1));

  if (state.loadedPages.has(pageNumber) && !options.forceReload) {
    state.page = pageNumber;
    updatePager();
    updateStatus();
    if (options.scrollToPage) scrollToPage(pageNumber);
    if (options.openIndex !== undefined) openViewer(options.openIndex);
    return true;
  }

  state.loading = true;
  setStatus(`${pageNumber}쪽 불러오는 중`);
  updatePager();

  try {
    const response = await fetch(`/api/cards?page=${pageNumber}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || data.error || "load failed");
    }

    state.page = data.page;
    state.lastPage = data.lastPage;
    state.pageNumbers = data.pageNumbers.length ? data.pageNumbers : buildFallbackPages(data.page, data.lastPage);
    state.loadedPages.add(data.page);

    if (options.replace) {
      state.cards = data.cards;
      state.loadedPages = new Set([data.page]);
    } else {
      const existingIds = new Set(state.cards.map((card) => card.id));
      state.cards = [...state.cards, ...data.cards.filter((card) => !existingIds.has(card.id))];
      state.cards.sort((a, b) => a.page - b.page || a.indexInPage - b.indexInPage);
    }

    renderGallery();
    updatePager();
    updateStatus();

    if (options.scrollToPage) {
      scrollToPage(data.page);
    }

    if (options.openIndex !== undefined) {
      openViewer(options.openIndex);
    }
    return true;
  } catch (error) {
    setStatus(`카드뉴스를 가져오지 못했습니다. ${error.message}`, true);
    return false;
  } finally {
    state.loading = false;
    updatePager();
  }
}

function buildFallbackPages(page, total) {
  const start = Math.max(1, Math.floor((page - 1) / 10) * 10 + 1);
  const end = Math.min(total, start + 9);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function renderGallery() {
  const cards = visibleCards();
  gallery.innerHTML = cards.map((card, index) => {
    const revealed = state.revealedCards.has(card.id);
    return `
      <article class="card ${revealed ? "revealed" : ""}" data-id="${escapeText(card.id)}" data-card-index="${index}" data-page="${card.page}">
        <button class="card-button" type="button" data-open="${index}" aria-label="${escapeText(card.title)}">
          <span class="thumb-wrap">
            <img src="${escapeText(card.image)}" alt="${escapeText(card.title)}" loading="eager">
          </span>
        </button>
        <div class="card-meta">
          <p class="card-title">${escapeText(card.title)}</p>
          <div class="card-source">
            <span>${escapeText(card.date)}</span>
            <span class="ministry-wrap">
              <span class="ministry-value">${escapeText(card.ministry)}</span>
              <button class="reveal-mask ministry-mask" type="button" data-reveal="${escapeText(card.id)}" aria-label="발행부처 공개"></button>
            </span>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function updatePager() {
  pageTotal.textContent = `/ ${state.lastPage}쪽`;
  pageInput.max = String(state.lastPage);
  if (document.activeElement !== pageInput) {
    pageInput.value = String(state.page);
  }

  firstPage.disabled = state.loading || state.page <= 1;
  prevPage.disabled = state.loading || state.page <= 1;
  nextPage.disabled = state.loading || state.page >= state.lastPage;
  lastPage.disabled = state.loading || state.page >= state.lastPage;
  pageInput.disabled = state.loading;
  pageJump.querySelector("button").disabled = state.loading;
  pageJump.classList.toggle("loading", state.loading);
}

function currentCard() {
  return visibleCards()[state.viewerIndex];
}

function openViewer(index) {
  const card = visibleCards()[index];
  if (!card) return;

  state.viewerIndex = index;
  viewer.classList.add("open");
  viewer.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  renderViewer();
}

function closeViewerModal() {
  viewer.classList.remove("open");
  viewer.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  state.viewerIndex = -1;
}

function renderViewer() {
  const card = currentCard();
  if (!card) return;

  const ministryRevealed = state.revealedCards.has(card.id);
  viewerImage.src = card.image;
  viewerImage.alt = card.title;
  viewerTitle.textContent = card.title;
  viewerDate.textContent = card.date;
  viewerMask.textContent = ministryRevealed ? card.ministry : "";
  viewerMask.classList.toggle("revealed", ministryRevealed);
  viewerPrev.disabled = state.loading && state.viewerIndex === 0;
  viewerNext.disabled = state.loading && state.viewerIndex === visibleCards().length - 1;
}

async function goViewer(delta) {
  const cards = visibleCards();
  if (state.viewerIndex + delta >= 0 && state.viewerIndex + delta < cards.length) {
    state.viewerIndex += delta;
    renderViewer();
    return;
  }

  if (delta > 0 && state.page < state.lastPage) {
    const previousLength = cards.length;
    while (state.page < state.lastPage && visibleCards().length <= previousLength) {
      const previousPage = state.page;
      const loaded = await loadPage(state.page + 1);
      if (!loaded || state.page === previousPage) break;
    }

    if (visibleCards().length > previousLength) {
      openViewer(previousLength);
    }
    return;
  }

  if (delta < 0 && state.page > 1) {
    let targetPage = state.page - 1;

    while (targetPage >= 1) {
      const loaded = await loadPage(targetPage, { scrollToPage: true });
      if (!loaded) break;

      const previousPageCards = visibleCards()
        .map((card, index) => ({ card, index }))
        .filter(({ card }) => card.page === targetPage);

      if (previousPageCards.length) {
        openViewer(previousPageCards.at(-1).index);
        return;
      }

      targetPage -= 1;
    }
  }
}

function scrollToPage(page) {
  const target = gallery.querySelector(`[data-page="${page}"]`);
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function shouldLoadMoreFromScrollPosition() {
  const sentinelTop = scrollSentinel.getBoundingClientRect().top;
  return sentinelTop <= window.innerHeight + 900;
}

async function loadNextPageAutomatically() {
  if (state.loading || state.autoLoading || state.page >= state.lastPage || state.activeCategories.size === 0) return;
  state.autoLoading = true;
  const previousVisibleCount = visibleCards().length;

  try {
    while (state.page < state.lastPage && visibleCards().length <= previousVisibleCount) {
      const previousPage = state.page;
      const loaded = await loadPage(state.page + 1);
      if (!loaded || state.page === previousPage) break;
    }
  } finally {
    state.autoLoading = false;
  }
}

gallery.addEventListener("click", (event) => {
  const revealButton = event.target.closest("[data-reveal]");
  if (revealButton) {
    state.revealedCards.add(revealButton.dataset.reveal);
    revealButton.closest(".card")?.classList.add("revealed");
    return;
  }

  const card = event.target.closest("[data-card-index]");
  if (card) {
    openViewer(Number(card.dataset.cardIndex));
  }
});

filterOptions.addEventListener("change", () => {
  state.activeCategories = new Set(
    [...filterOptions.querySelectorAll("input:checked")].map((input) => input.value),
  );
  renderGallery();
  updateStatus();
  if (viewer.classList.contains("open")) {
    closeViewerModal();
  }
  if (shouldLoadMoreFromScrollPosition()) {
    loadNextPageAutomatically();
  }
});

filterTrigger.addEventListener("click", () => {
  setFilterMenu(filterOptions.hidden);
});

document.addEventListener("click", (event) => {
  if (filterOptions.hidden) return;
  if (filterOptions.contains(event.target) || filterTrigger.contains(event.target)) return;
  setFilterMenu(false);
});

window.addEventListener("resize", () => {
  if (!filterOptions.hidden) positionFilterMenu();
});

window.addEventListener("scroll", () => {
  if (!filterOptions.hidden) positionFilterMenu();
}, { passive: true });

firstPage.addEventListener("click", () => loadPage(1, { replace: true, scrollToPage: true }));
prevPage.addEventListener("click", () => loadPage(state.page - 1, { scrollToPage: true }));
nextPage.addEventListener("click", () => loadPage(state.page + 1, { scrollToPage: true }));
lastPage.addEventListener("click", () => loadPage(state.lastPage, { scrollToPage: true }));
pageJump.addEventListener("submit", (event) => {
  event.preventDefault();
  const page = Math.max(1, Math.min(state.lastPage, Number(pageInput.value) || state.page));
  pageInput.value = String(page);
  loadPage(page, { scrollToPage: true });
});

closeViewer.addEventListener("click", closeViewerModal);
viewerPrev.addEventListener("click", () => goViewer(-1));
viewerNext.addEventListener("click", () => goViewer(1));
viewerMask.addEventListener("click", () => {
  const card = currentCard();
  if (!card) return;
  state.revealedCards.add(card.id);
  gallery.querySelector(`[data-id="${CSS.escape(card.id)}"]`)?.classList.add("revealed");
  renderViewer();
});

viewer.addEventListener("click", (event) => {
  if (event.target === viewer) {
    closeViewerModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (!viewer.classList.contains("open")) return;

  if (event.key === "Escape") closeViewerModal();
  if (event.key === "ArrowLeft") goViewer(-1);
  if (event.key === "ArrowRight") goViewer(1);
});

const observer = new IntersectionObserver((entries) => {
  if (entries.some((entry) => entry.isIntersecting)) {
    loadNextPageAutomatically();
  }
}, {
  rootMargin: "900px 0px",
});

observer.observe(scrollSentinel);

loadPage(1);
