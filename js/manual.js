"use strict";

/* ============================ Manual de reglas (PDF) ============================
   El PDF oficial vive en el homelab (/api/heroclix/manual). Se dibuja con pdf.js, página a página según se
   hace scroll, y queda guardado en el celular para leerlo sin conexión. */

const PDFJS_BASE = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";
const MANUAL_URL = () => `${HOMELAB_API_BASE}/api/heroclix/manual`;

let manualDoc = null;
let manualLoading = null;
let manualObserver = null;
let manualTexts = null;
let manualCurrent = 1;

function manualLoadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("pdfjs"));
    document.head.appendChild(s);
  });
}

async function manualEnsureLib() {
  if (window.pdfjsLib) return;
  await manualLoadScript(`${PDFJS_BASE}/pdf.min.js`);
  // Un worker no se puede cargar directo desde otro dominio: se baja el código (queda en caché para leer sin
  // conexión) y se arma el worker desde ahí.
  const code = await (await fetch(`${PDFJS_BASE}/pdf.worker.min.js`, { mode: "cors" })).text();
  const blob = new Blob([code], { type: "text/javascript" });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
}

async function manualFetchData() {
  let cache = null;
  try { cache = await caches.open("runtime"); } catch (e) {}
  let res = cache ? await cache.match(MANUAL_URL()) : null;
  if (!res) {
    res = await fetch(MANUAL_URL(), { mode: "cors", signal: AbortSignal.timeout(40000) });
    if (!res.ok) throw new Error("manual " + res.status);
    if (cache) { try { await cache.put(MANUAL_URL(), res.clone()); } catch (e) {} }
  }
  return res.arrayBuffer();
}

async function manualOpenDoc() {
  if (manualDoc) return manualDoc;
  if (!manualLoading) {
    manualLoading = (async () => {
      await manualEnsureLib();
      const data = await manualFetchData();
      manualDoc = await window.pdfjsLib.getDocument({ data }).promise;
      return manualDoc;
    })().finally(() => { manualLoading = null; });
  }
  return manualLoading;
}

async function manualRenderPage(holder) {
  if (holder.dataset.done) return;
  holder.dataset.done = "1";
  const page = await manualDoc.getPage(Number(holder.dataset.page));
  const cssWidth = holder.clientWidth || 360;
  const base = page.getViewport({ scale: 1 });
  const scale = (cssWidth / base.width) * Math.min(2, window.devicePixelRatio || 1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  holder.appendChild(canvas);
}

async function manualBuildPages() {
  const pages = document.getElementById("manual-pages");
  pages.innerHTML = "";
  const first = await manualDoc.getPage(1);
  const base = first.getViewport({ scale: 1 });
  const ratio = base.height / base.width;
  manualObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      manualRenderPage(e.target);
    });
  }, { root: document.getElementById("manual-scroll"), rootMargin: "600px 0px" });
  for (let n = 1; n <= manualDoc.numPages; n++) {
    const holder = document.createElement("div");
    holder.className = "manual-page";
    holder.dataset.page = n;
    holder.style.aspectRatio = `1 / ${ratio}`;
    pages.appendChild(holder);
    manualObserver.observe(holder);
  }
  document.getElementById("manual-total").textContent = `/ ${manualDoc.numPages}`;
}

function manualGoTo(n) {
  const page = Math.min(Math.max(1, Math.round(n) || 1), manualDoc ? manualDoc.numPages : 1);
  const holder = document.querySelector(`#manual-pages .manual-page[data-page="${page}"]`);
  if (holder) holder.scrollIntoView({ block: "start" });
  document.getElementById("manual-page").value = page;
}

async function manualSearch(query) {
  const results = document.getElementById("manual-results");
  query = query.trim().toLowerCase();
  if (query.length < 3) { results.hidden = true; return; }
  results.hidden = false;
  results.innerHTML = `<p class="manual-results__msg">Buscando…</p>`;
  if (!manualTexts) {
    manualTexts = [];
    for (let n = 1; n <= manualDoc.numPages; n++) {
      const content = await (await manualDoc.getPage(n)).getTextContent();
      manualTexts.push(content.items.map(i => i.str).join(" ").replace(/\s+/g, " "));
    }
  }
  if (document.getElementById("manual-search").value.trim().toLowerCase() !== query) return;
  const hits = [];
  manualTexts.forEach((text, i) => {
    const at = text.toLowerCase().indexOf(query);
    if (at < 0) return;
    const from = Math.max(0, at - 40);
    hits.push({ page: i + 1, snippet: (from > 0 ? "…" : "") + text.slice(from, at + query.length + 80) + "…" });
  });
  results.innerHTML = hits.length
    ? hits.slice(0, 40).map(h => `<button type="button" class="manual-hit" data-goto="${h.page}"><b>Pág. ${h.page}</b> ${escapeHtml(h.snippet)}</button>`).join("")
    : `<p class="manual-results__msg">No encontré «${escapeHtml(query)}».</p>`;
}

async function openManual() {
  const modal = document.getElementById("manual");
  modal.hidden = false;
  document.body.classList.add("carta-open");
  const status = document.getElementById("manual-status");
  if (manualDoc) { status.hidden = true; return; }
  status.hidden = false;
  status.textContent = "Cargando el manual…";
  try {
    await manualOpenDoc();
    await manualBuildPages();
    status.hidden = true;
  } catch (e) {
    status.textContent = "No pude cargar el manual. Revisá que Tailscale esté conectado e intentá de nuevo (la primera vez baja 1 MB; después queda guardado).";
  }
}

function closeManual() {
  document.getElementById("manual").hidden = true;
  // El cuerpo sigue bloqueado si las reglas están abiertas debajo.
  if (document.getElementById("reglas").hidden) document.body.classList.remove("carta-open");
}

// Página que se está leyendo: la que ocupa el borde superior del visor.
function manualUpdateCurrent() {
  const scroll = document.getElementById("manual-scroll");
  const first = document.querySelector("#manual-pages .manual-page");
  if (!first || !manualDoc) return;
  const step = first.offsetHeight + 8;
  manualCurrent = Math.min(manualDoc.numPages, Math.max(1, Math.floor((scroll.scrollTop + 40) / step) + 1));
  const input = document.getElementById("manual-page");
  if (document.activeElement !== input) input.value = manualCurrent;
}

document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("manual");
  let scrollTimer = null;
  $("manual-scroll").addEventListener("scroll", () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(manualUpdateCurrent, 80);
  });
  $("open-manual-btn").addEventListener("click", openManual);
  modal.addEventListener("click", e => {
    if (e.target.closest("[data-close-manual]")) { closeManual(); return; }
    const hit = e.target.closest("[data-goto]");
    if (hit) { manualGoTo(Number(hit.dataset.goto)); document.getElementById("manual-results").hidden = true; }
  });
  $("manual-prev").addEventListener("click", () => manualGoTo(manualCurrent - 1));
  $("manual-next").addEventListener("click", () => manualGoTo(manualCurrent + 1));
  $("manual-page").addEventListener("change", e => manualGoTo(Number(e.target.value)));
  let searchTimer = null;
  $("manual-search").addEventListener("input", e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { if (manualDoc) manualSearch(e.target.value); }, 350);
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !modal.hidden) closeManual(); });
});
