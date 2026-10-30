"use strict";

/* ============================ Config ============================ */
const LIMITE = 300;                       // formato estándar de build
const KEY_CURRENT = "heroclix-equipo";    // equipo en edición
const KEY_SAVED   = "heroclix-equipos";   // equipos guardados (nombrados)
const KEY_CUSTOM  = "heroclix-custom-figures"; // miniaturas agregadas por el usuario

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
function figKey(fig, value) { return (fig ? fig.alt : "") + "|" + value; }

/* Miniaturas personalizadas */
function getCustomFigures() {
  try { return JSON.parse(localStorage.getItem(KEY_CUSTOM) || "[]"); }
  catch (e) { return []; }
}
function setCustomFigures(arr) {
  try { localStorage.setItem(KEY_CUSTOM, JSON.stringify(arr)); } catch (e) {}
}

function getDefaultMiniSvg(name) {
  const initial = (name || "?").charAt(0).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="#1b2a3d" rx="14"/><circle cx="50" cy="50" r="32" fill="#243b55" stroke="#f4a72e" stroke-width="2.5"/><text x="50" y="59" font-family="Arial,sans-serif" font-size="28" font-weight="bold" fill="#f4a72e" text-anchor="middle">${initial}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

let ALL_FIGURES = [];
function refreshAllFigures() {
  const custom = getCustomFigures();
  ALL_FIGURES = [...FIGURES, ...custom];
  ALL_FIGURES.sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
}

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
  refreshAllFigures();
  listEl.innerHTML = ALL_FIGURES.map((fig, idx) => {
    const collectorNumber = fig.collectorNumber || fig.collector_number || fig.code || "";
    const tags = fig.keywords.map(kw =>
      `<a href="#" class="tag" data-kw="${escapeHtml(kw)}">${escapeHtml(kw)}</a>`).join("");
    const dials = fig.points.map(p => `
        <label class="dial">
          <input type="checkbox" class="caja" value="${p}" data-fig="${idx}">
          <span class="dial__pts">${p}</span>
        </label>`).join("");
    const customBadge = fig.isCustom ? `<span class="unit__custom-badge" title="Miniatura personalizada">Custom</span>` : "";
    const collectorBadge = collectorNumber
      ? `<span class="unit__collector" title="Collector number">${escapeHtml(collectorNumber)}</span>`
      : "";
    return `
      <li class="unit ${fig.isCustom ? "unit--custom" : ""}" data-name="${escapeHtml(`${fig.name} ${collectorNumber}`.toLowerCase())}"
          data-keywords="${escapeHtml(fig.keywords.join("|").toLowerCase())}">
        <div class="unit__media">
          <img class="unit__img" src="${escapeHtml(fig.img)}" alt="${escapeHtml(fig.alt || `${fig.name} ${collectorNumber}`)}" loading="lazy" data-zoom>
        </div>
        <div class="unit__body">
          <h3 class="unit__name"><span>${escapeHtml(fig.name)}</span>${collectorBadge}${customBadge}</h3>
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
    .map(cb => {
      const fig = ALL_FIGURES[cb.dataset.fig];
      return fig ? figKey(fig, cb.value) : null;
    })
    .filter(Boolean);
}
let draftSyncTimeout = null;
function notifyDraftChanged() {
  clearTimeout(draftSyncTimeout);
  draftSyncTimeout = setTimeout(() => {
    syncWithHomelab(false);
  }, 1500);
}

function saveCurrent() {
  try { localStorage.setItem(KEY_CURRENT, JSON.stringify(currentKeys())); } catch (e) {}
  notifyDraftChanged();
}
function applyKeys(keys) {
  const set = new Set(keys);
  listEl.querySelectorAll(".caja").forEach(cb => {
    const fig = ALL_FIGURES[cb.dataset.fig];
    cb.checked = fig ? set.has(figKey(fig, cb.value)) : false;
  });
  recalc();
}
function loadCurrent() {
  try { applyKeys(JSON.parse(localStorage.getItem(KEY_CURRENT) || "[]")); }
  catch (e) {}
}

/* ============================ Homelab Sync ============================ */
const HOMELAB_API_BASE = "https://mauro.taild9dcef.ts.net:8444";
let isSyncing = false;

async function checkHomelabStatus() {
  const dot = $("sync-dot");
  const text = $("sync-text");
  if (!dot || !text) return false;

  try {
    const res = await fetch(`${HOMELAB_API_BASE}/api/health`, { mode: "cors", signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      dot.className = "sync-box__dot is-online";
      text.textContent = "Homelab conectado";
      return true;
    }
  } catch (e) {
    console.warn("Homelab check status failed:", e);
  }

  dot.className = "sync-box__dot is-offline";
  text.textContent = "Homelab desconectado";
  return false;
}

async function syncWithHomelab(isManual = false) {
  if (isSyncing) return;
  isSyncing = true;
  const btn = $("sync-btn");
  if (btn) btn.classList.add("is-loading");

  try {
    const localTeams = getSaved();
    const res = await fetch(`${HOMELAB_API_BASE}/api/heroclix`, { mode: "cors", signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const remoteData = await res.json();
    const remoteTeams = Array.isArray(remoteData.teams) ? remoteData.teams : [];

    // Combinar por ID o nombre respetando fecha más reciente
    const map = new Map();
    remoteTeams.forEach(t => map.set(t.id || t.name, t));
    localTeams.forEach(t => {
      const key = t.id || t.name;
      const remote = map.get(key);
      if (!remote || (t.date && t.date >= (remote.date || 0))) {
        map.set(key, t);
      }
    });

    const merged = Array.from(map.values());
    try { localStorage.setItem(KEY_SAVED, JSON.stringify(merged)); } catch (e) {}
    renderSaved();

    // Sincronizar figuras personalizadas
    const localCustom = getCustomFigures();
    const remoteCustom = Array.isArray(remoteData.custom_figures) ? remoteData.custom_figures : [];
    const customMap = new Map();
    remoteCustom.forEach(f => customMap.set(f.alt || f.id || f.name, f));
    localCustom.forEach(f => {
      const k = f.alt || f.id || f.name;
      const remote = customMap.get(k);
      if (!remote || (f.updatedAt && f.updatedAt >= (remote.updatedAt || 0))) {
        customMap.set(k, f);
      }
    });
    const mergedCustom = Array.from(customMap.values());
    const hadCustomChange = JSON.stringify(mergedCustom) !== JSON.stringify(localCustom);
    setCustomFigures(mergedCustom);
    if (hadCustomChange) {
      renderFigures();
      applyKeys(JSON.parse(localStorage.getItem(KEY_CURRENT) || "[]"));
    }

    // Si el equipo actual en pantalla está vacío y el servidor tiene uno guardado, recuperarlo
    if ((!currentKeys().length) && Array.isArray(remoteData.current) && remoteData.current.length) {
      applyKeys(remoteData.current);
      try { localStorage.setItem(KEY_CURRENT, JSON.stringify(remoteData.current)); } catch (e) {}
    }

    // Enviar lista combinada al Homelab
    await fetch(`${HOMELAB_API_BASE}/api/heroclix`, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teams: merged,
        current: currentKeys(),
        custom_figures: mergedCustom
      }),
      signal: AbortSignal.timeout(6000)
    });

    checkHomelabStatus();
    if (isManual) toast("Sincronizado con Homelab");
  } catch (err) {
    console.warn("Homelab sync:", err);
    checkHomelabStatus();
    const isTimeout = err && (err.name === "TimeoutError" || String(err).includes("timeout"));
    if (isManual) {
      toast(isTimeout ? "Tiempo de espera agotado (Tailscale conectando...)" : "No se pudo conectar al Homelab (revisá Tailscale)");
    }
  } finally {
    isSyncing = false;
    if (btn) btn.classList.remove("is-loading");
  }
}

/* ============================ Equipos guardados ============================ */
function getSaved() {
  try { return JSON.parse(localStorage.getItem(KEY_SAVED) || "[]"); }
  catch (e) { return []; }
}
function setSaved(arr) {
  try { localStorage.setItem(KEY_SAVED, JSON.stringify(arr)); } catch (e) {}
  renderSaved();
  syncWithHomelab(false);
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

/* ============================ Modal Nueva Figura ============================ */
let selectedPhotoDataUrl = null;
let selectedHcUnitsMeta = null;

function setImportStatus(message = "", kind = "") {
  const status = $("hcunits-import-status");
  if (!status) return;
  status.textContent = message;
  status.className = "hcunits-import__status" + (kind ? ` is-${kind}` : "");
}

async function importFromHcUnits() {
  const url = $("hcunits-url").value.trim();
  if (!url) {
    setImportStatus("Pegá primero el enlace de la unidad.", "error");
    $("hcunits-url").focus();
    return;
  }

  const btn = $("hcunits-import-btn");
  btn.disabled = true;
  btn.classList.add("is-loading");
  setImportStatus("Consultando HCUnits...");
  try {
    const response = await fetch(`${HOMELAB_API_BASE}/api/heroclix/import-hcunits`, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(12000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || `Error ${response.status}`);

    const points = Array.isArray(data.point_values) ? data.point_values : [];
    const keywords = Array.isArray(data.keywords) ? data.keywords : [];
    $("fig-name").value = data.name || "";
    $("fig-code").value = data.collector_number || "";
    $("fig-points").value = points.join(", ");
    $("fig-keywords").value = keywords.join(", ");

    selectedHcUnitsMeta = {
      id: data.id || "",
      setId: data.set_id || "",
      collectorNumber: data.collector_number || ""
    };
    selectedPhotoDataUrl = data.img_url || null;
    if (selectedPhotoDataUrl) {
      $("photo-preview").src = selectedPhotoDataUrl;
      $("photo-preview-wrap").hidden = false;
      $("photo-clear-btn").hidden = false;
    }
    setImportStatus(`Lista: ${data.name}${data.collector_number ? ` · ${data.collector_number}` : ""}`, "ok");
    toast("Datos importados de HCUnits");
  } catch (error) {
    selectedHcUnitsMeta = null;
    const timeout = error && (error.name === "TimeoutError" || String(error).includes("timeout"));
    setImportStatus(timeout ? "La consulta tardó demasiado. Revisá Tailscale e intentá otra vez." : (error.message || "No se pudo importar la unidad."), "error");
  } finally {
    btn.disabled = false;
    btn.classList.remove("is-loading");
  }
}

function resizeImage(file, maxDim = 400) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function openAddModal() {
  $("addModal").hidden = false;
  $("fig-name").focus();
  renderCustomList();
}
function closeAddModal() {
  $("addModal").hidden = true;
  $("add-fig-form").reset();
  $("photo-preview-wrap").hidden = true;
  $("photo-clear-btn").hidden = true;
  selectedPhotoDataUrl = null;
  selectedHcUnitsMeta = null;
  setImportStatus();
}

function renderCustomList() {
  const list = getCustomFigures();
  const countEl = $("custom-count");
  if (countEl) countEl.textContent = list.length;
  const ul = $("custom-list");
  if (!ul) return;
  if (!list.length) {
    ul.innerHTML = `<li style="color:rgba(255,255,255,.4);font-size:12.5px;text-align:center;padding:10px 0;">No agregaste figuras propias todavía.</li>`;
    return;
  }
  ul.innerHTML = list.map(f => `
    <li class="custom-item">
      <img src="${escapeHtml(f.img)}" alt="" class="custom-item__thumb">
      <div class="custom-item__info">
        <span class="custom-item__name">${escapeHtml(f.name)}${(f.collectorNumber || f.collector_number || f.code) ? ` · ${escapeHtml(f.collectorNumber || f.collector_number || f.code)}` : ""}</span>
        <span class="custom-item__meta">${f.points.join(" / ")} pts${f.keywords.length ? " · " + escapeHtml(f.keywords.slice(0, 2).join(", ")) : ""}</span>
      </div>
      <button type="button" class="custom-item__del" data-del-custom="${f.id}" title="Eliminar"><i class="fas fa-trash-alt"></i></button>
    </li>
  `).join("");
}

function deleteCustomFigure(id) {
  let list = getCustomFigures();
  const fig = list.find(f => f.id === id);
  if (!fig) return;
  if (!confirm(`¿Eliminar la miniatura "${fig.name}"?`)) return;
  list = list.filter(f => f.id !== id);
  setCustomFigures(list);
  renderFigures();
  applyKeys(JSON.parse(localStorage.getItem(KEY_CURRENT) || "[]"));
  renderCustomList();
  toast(`Eliminada: ${fig.name}`);
  syncWithHomelab(false);
}

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

  // Botones para abrir modal de agregar figura
  const openAddBtn = $("open-add-btn");
  if (openAddBtn) openAddBtn.addEventListener("click", openAddModal);
  const emptyAddBtn = $("empty-add-btn");
  if (emptyAddBtn) emptyAddBtn.addEventListener("click", openAddModal);

  // Modal Agregar Figura
  const addModal = $("addModal");
  $("add-modal-close").addEventListener("click", closeAddModal);
  addModal.addEventListener("click", e => { if (e.target === addModal) closeAddModal(); });
  $("hcunits-import-btn").addEventListener("click", importFromHcUnits);
  $("hcunits-url").addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); importFromHcUnits(); }
  });

  // Selector y foto
  $("fig-photo").addEventListener("change", async e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      selectedPhotoDataUrl = await resizeImage(file, 400);
      $("photo-preview").src = selectedPhotoDataUrl;
      $("photo-preview-wrap").hidden = false;
      $("photo-clear-btn").hidden = false;
    } catch (_) {
      toast("No se pudo cargar la foto");
    }
  });

  $("photo-clear-btn").addEventListener("click", () => {
    $("fig-photo").value = "";
    selectedPhotoDataUrl = null;
    if (selectedHcUnitsMeta) selectedHcUnitsMeta.imageRemoved = true;
    $("photo-preview-wrap").hidden = true;
    $("photo-clear-btn").hidden = true;
  });

  // Guardar figura desde el formulario
  $("add-fig-form").addEventListener("submit", e => {
    e.preventDefault();
    const name = $("fig-name").value.trim();
    const pointsRaw = $("fig-points").value.trim();
    const code = $("fig-code").value.trim();
    const keywordsRaw = $("fig-keywords").value.trim();

    if (!name) { toast("Ingresá un nombre"); return; }

    const points = pointsRaw.split(/[,;\s]+/)
      .map(p => parseInt(p, 10))
      .filter(p => !isNaN(p) && p > 0);

    if (!points.length) {
      toast("Ingresá al menos un puntaje válido");
      return;
    }
    points.sort((a, b) => a - b);

    const keywords = keywordsRaw
      ? keywordsRaw.split(",").map(k => k.trim()).filter(Boolean)
      : [];

    const id = selectedHcUnitsMeta && selectedHcUnitsMeta.id
      ? `hcunits:${selectedHcUnitsMeta.id}`
      : "c" + Date.now();
    const collectorNumber = code || (selectedHcUnitsMeta && selectedHcUnitsMeta.collectorNumber) || "";
    const alt = name + (collectorNumber ? " " + collectorNumber : " c-" + id.slice(-4));
    const img = selectedPhotoDataUrl || getDefaultMiniSvg(name);

    const newFig = {
      id,
      hcunitsId: selectedHcUnitsMeta ? selectedHcUnitsMeta.id : "",
      setId: selectedHcUnitsMeta ? selectedHcUnitsMeta.setId : "",
      collectorNumber,
      name,
      img,
      alt,
      keywords,
      points,
      isCustom: true,
      updatedAt: Date.now()
    };

    const list = getCustomFigures();
    const existingIndex = list.findIndex(f => f.id === id || (newFig.hcunitsId && f.hcunitsId === newFig.hcunitsId));
    if (existingIndex >= 0) list[existingIndex] = newFig;
    else list.push(newFig);
    setCustomFigures(list);

    renderFigures();
    applyKeys(JSON.parse(localStorage.getItem(KEY_CURRENT) || "[]"));

    closeAddModal();
    toast(existingIndex >= 0 ? `¡${name} actualizada!` : `¡${name} agregada!`);
    syncWithHomelab(false);
  });

  // Borrar figura custom de la lista
  $("custom-list").addEventListener("click", e => {
    const btn = e.target.closest("[data-del-custom]");
    if (btn) deleteCustomFigure(btn.dataset.delCustom);
  });

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

  // Modal imagen zoom
  $("modal-close").addEventListener("click", hideImage);
  modal.addEventListener("click", e => { if (e.target === modal) hideImage(); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { hideImage(); closeSidebar(); closeAddModal(); }
  });

  // Homelab Sync
  const syncBtn = $("sync-btn");
  if (syncBtn) syncBtn.addEventListener("click", () => syncWithHomelab(true));
  checkHomelabStatus().then(online => {
    if (online) syncWithHomelab(false);
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
