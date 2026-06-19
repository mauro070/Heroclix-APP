"use strict";

/* ============================ Config ============================ */
const LIMITE = 300;                       // formato estándar de build
const KEY_CURRENT = "heroclix-equipo";    // equipo en edición
const KEY_SAVED   = "heroclix-equipos";   // equipos guardados (nombrados)

/* ============================ Refs ============================ */
const listEl     = document.getElementById("heroclix-list");
const emptyEl    = document.getElementById("empty");
const searchbar  = document.getElementById("searchbar");
const listaSel   = document.getElementById("lista");
const totalEl    = document.getElementById("total");
const unidadesEl = document.getElementById("unidades");
const meterEl    = document.getElementById("meter");
const meterFill  = document.getElementById("meter-fill");

/* ============================ Util ============================ */
const $ = id => document.getElementById(id);
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
// Clave estable de un nivel: incluye alt (código único tipo "dofp005") para evitar colisiones
function figKey(fig, value) { return fig.alt + "|" + value; }

let toastTimer;
function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add("is-show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("is-show"), 1800);
}

/* ============================ Render ============================ */
function renderFigures() {
  listEl.innerHTML = FIGURES.map((fig, idx) => {
    const tags = fig.keywords.map(kw =>
      `<a href="#" class="tag" data-kw="${escapeHtml(kw)}">${escapeHtml(kw)}</a>`).join("");
    const dials = fig.points.map(p => `
        <label class="dial">
          <input type="checkbox" class="caja" value="${p}" data-fig="${idx}">
          <span class="dial__pts">${p}</span>
        </label>`).join("");
    return `
      <li class="unit" data-name="${escapeHtml(fig.name.toLowerCase())}"
          data-keywords="${escapeHtml(fig.keywords.join("|").toLowerCase())}">
        <div class="unit__media">
          <img class="unit__img" src="${escapeHtml(fig.img)}" alt="${escapeHtml(fig.alt)}" loading="lazy" data-zoom>
        </div>
        <div class="unit__body">
          <h3 class="unit__name">${escapeHtml(fig.name)}</h3>
          <div class="unit__tags">${tags}</div>
        </div>
        <div class="unit__dials">${dials}</div>
      </li>`;
  }).join("");
}

/* ============================ Filtro ============================ */
let equipoVisible = false;
function applyFilter() {
  equipoVisible = false;
  $("show-equipo").classList.remove("is-on");
  const attr  = listaSel.value === "keyword" ? "keywords" : "name";
  const query = searchbar.value.trim().toLowerCase();
  let shown = 0;
  for (const li of listEl.children) {
    const ok = !query || (li.dataset[attr] || "").includes(query);
    li.style.display = ok ? "flex" : "none";
    if (ok) shown++;
  }
  emptyEl.hidden = shown > 0;
}

/* ============================ Suma / medidor ============================ */
function recalc() {
  const checked = listEl.querySelectorAll(".caja:checked");
  let total = 0;
  checked.forEach(cb => { total += parseInt(cb.value, 10) || 0; });
  totalEl.textContent = total;
  unidadesEl.textContent = checked.length;
  meterFill.style.width = Math.min(100, (total / LIMITE) * 100) + "%";
  meterEl.classList.toggle("is-over", total > LIMITE);
  // marca visual de figuras en el equipo
  for (const li of listEl.children)
    li.classList.toggle("is-team", !!li.querySelector(".caja:checked"));
}

/* ============================ Equipo actual (autosave) ============================ */
function currentKeys() {
  return [...listEl.querySelectorAll(".caja:checked")]
    .map(cb => figKey(FIGURES[cb.dataset.fig], cb.value));
}
function saveCurrent() {
  try { localStorage.setItem(KEY_CURRENT, JSON.stringify(currentKeys())); } catch (e) {}
}
function applyKeys(keys) {
  const set = new Set(keys);
  listEl.querySelectorAll(".caja").forEach(cb => {
    cb.checked = set.has(figKey(FIGURES[cb.dataset.fig], cb.value));
  });
  recalc();
}
function loadCurrent() {
  try { applyKeys(JSON.parse(localStorage.getItem(KEY_CURRENT) || "[]")); }
  catch (e) {}
}

/* ============================ Equipos guardados ============================ */
function getSaved() {
  try { return JSON.parse(localStorage.getItem(KEY_SAVED) || "[]"); }
  catch (e) { return []; }
}
function setSaved(arr) {
  try { localStorage.setItem(KEY_SAVED, JSON.stringify(arr)); } catch (e) {}
  renderSaved();
}
function saveNamedTeam() {
  const input = $("team-name");
  const name = input.value.trim();
  const keys = currentKeys();
  if (!name) { toast("Poné un nombre"); input.focus(); return; }
  if (!keys.length) { toast("El equipo está vacío"); return; }
  const total = keys.reduce((s, k) => s + (parseInt(k.split("|")[1], 10) || 0), 0);
  const arr = getSaved();
  const existing = arr.find(t => t.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.keys = keys; existing.total = total; existing.units = keys.length; existing.date = Date.now();
    toast("Equipo actualizado");
  } else {
    arr.push({ id: "t" + Date.now(), name, keys, total, units: keys.length, date: Date.now() });
    toast("Equipo guardado");
  }
  setSaved(arr);
  input.value = "";
}
function loadNamedTeam(id) {
  const t = getSaved().find(x => x.id === id);
  if (!t) return;
  applyKeys(t.keys);
  saveCurrent();
  closeSidebar();
  toast(`Cargado: ${t.name}`);
}
function deleteNamedTeam(id) {
  setSaved(getSaved().filter(x => x.id !== id));
}
function renderSaved() {
  const arr = getSaved().sort((a, b) => b.date - a.date);
  $("saved-teams").innerHTML = arr.map(t => `
    <li class="saved__item">
      <div class="saved__info">
        <span class="saved__name">${escapeHtml(t.name)}</span>
        <span class="saved__meta">${t.total} pts · ${t.units} figs</span>
      </div>
      <button class="saved__btn saved__btn--load" data-load="${t.id}" aria-label="Cargar"><i class="fas fa-download"></i></button>
      <button class="saved__btn saved__btn--del"  data-del="${t.id}"  aria-label="Borrar"><i class="fas fa-trash-alt"></i></button>
    </li>`).join("");
}

/* ============================ Ver solo el equipo ============================ */
function toggleEquipo() {
  equipoVisible = !equipoVisible;
  $("show-equipo").classList.toggle("is-on", equipoVisible);
  if (equipoVisible) {
    let shown = 0;
    for (const li of listEl.children) {
      const on = !!li.querySelector(".caja:checked");
      li.style.display = on ? "flex" : "none";
      if (on) shown++;
    }
    emptyEl.hidden = shown > 0;
  } else {
    applyFilter();
  }
}

/* ============================ Modal ============================ */
const modal = $("myModal");
function showImage(img) {
  $("img01").src = img.src;
  $("caption").textContent = img.alt;
  modal.classList.add("is-open");
}
function hideImage() { modal.classList.remove("is-open"); }

/* ============================ Reset ============================ */
function resetAll() {
  listEl.querySelectorAll(".caja:checked").forEach(cb => { cb.checked = false; });
  recalc();
  saveCurrent();
  toast("Equipo vaciado");
}

/* ============================ Sidebar ============================ */
function openSidebar()  { $("sidebar").classList.add("is-open");  $("scrim").hidden = false; }
function closeSidebar() { $("sidebar").classList.remove("is-open"); $("scrim").hidden = true; }

/* ============================ Init ============================ */
document.addEventListener("DOMContentLoaded", () => {
  // Orden alfabético por nombre (no importa el orden en data.js)
  FIGURES.sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
  renderFigures();
  loadCurrent();
  renderSaved();

  searchbar.addEventListener("input", applyFilter);
  listaSel.addEventListener("change", applyFilter);
  $("clear").addEventListener("click", () => { searchbar.value = ""; applyFilter(); });

  // Lista: keyword / imagen
  listEl.addEventListener("click", e => {
    const tag = e.target.closest(".tag");
    if (tag) {
      e.preventDefault();
      listaSel.value = "keyword";
      searchbar.value = tag.dataset.kw;
      applyFilter();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (e.target.matches("[data-zoom]")) showImage(e.target);
  });

  // Diales: exclusividad por figura + recalculo + autosave
  listEl.addEventListener("change", e => {
    const cb = e.target.closest(".caja");
    if (!cb) return;
    if (cb.checked)
      cb.closest(".unit__dials").querySelectorAll(".caja").forEach(o => { if (o !== cb) o.checked = false; });
    recalc();
    saveCurrent();
  });

  // HUD
  $("Reset").addEventListener("click", resetAll);
  $("show-equipo").addEventListener("click", toggleEquipo);
  $("toggle-btn").addEventListener("click", openSidebar);

  // Sidebar
  $("sidebar-close").addEventListener("click", closeSidebar);
  $("scrim").addEventListener("click", closeSidebar);
  $("save-team").addEventListener("click", saveNamedTeam);
  $("team-name").addEventListener("keydown", e => { if (e.key === "Enter") saveNamedTeam(); });
  $("saved-teams").addEventListener("click", e => {
    const load = e.target.closest("[data-load]");
    const del  = e.target.closest("[data-del]");
    if (load) loadNamedTeam(load.dataset.load);
    if (del)  deleteNamedTeam(del.dataset.del);
  });

  // Modal
  $("modal-close").addEventListener("click", hideImage);
  modal.addEventListener("click", e => { if (e.target === modal) hideImage(); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { hideImage(); closeSidebar(); }
  });

  // Persistencia: pedir a Chrome que no borre los datos
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist();
  }
});

/* ============================ Service Worker (PWA) ============================ */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
