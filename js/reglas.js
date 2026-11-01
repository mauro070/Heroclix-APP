"use strict";

/* ============================ Reglas: glosario de poderes y habilidades ============================
   Usa las mismas tablas de referencia que la carta (cartaGetMeta, en carta.js). */

const REGLAS_SECTIONS = [
  { key: "speed", title: "Poderes de velocidad" },
  { key: "attack", title: "Poderes de ataque" },
  { key: "defense", title: "Poderes de defensa" },
  { key: "damage", title: "Poderes de daño" },
  { key: "other", title: "Otros poderes" },
  { key: "team", title: "Habilidades de equipo" },
  { key: "symbols", title: "Símbolos de combate" }
];

let reglasBuilt = false;

function reglasEntry(section, name, description, color, meta) {
  const hex = color ? (meta.colors[color] || (String(color).startsWith("#") ? color : "")) : "";
  const dot = hex ? `<span class="regla__dot${color === "white" ? " is-white" : ""}" style="background:${hex}"></span>` : `<span class="regla__dot is-none"></span>`;
  const text = description && description !== "N/A" ? cartaText(description, meta) : "Sin descripción.";
  const search = `${name} ${description || ""}`.toLowerCase();
  return `<details class="regla" data-section="${section}" data-search="${escapeHtml(search)}" data-name="${escapeHtml(name.toLowerCase())}">
    <summary>${dot}<span>${escapeHtml(name)}</span></summary><p>${text}</p></details>`;
}

function reglasBuild(meta) {
  const bySection = Object.fromEntries(REGLAS_SECTIONS.map(s => [s.key, []]));
  const byName = (a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });

  Object.values(meta.powers || {}).forEach(p => {
    if (!p.name) return;
    const key = ["speed", "attack", "defense", "damage"].includes(p.type) ? p.type : "other";
    bySection[key].push({ ...p });
  });
  ["speed", "attack", "defense", "damage", "other"].forEach(k => bySection[k].sort(byName));
  const team = Object.values(meta.team_abilities || {}).filter(t => t.name).sort(byName);
  const symbols = Object.values(meta.combat_symbols || {}).filter(s => s.name && s.description).sort(byName);

  let html = "";
  for (const s of REGLAS_SECTIONS) {
    let items = "";
    if (s.key === "team") items = team.map(t => reglasEntry(s.key, t.name, t.description, "", meta)).join("");
    else if (s.key === "symbols") items = symbols.map(t => reglasEntry(s.key, t.name, t.description, "", meta)).join("");
    else items = bySection[s.key].map(p => reglasEntry(s.key, p.name, p.description, p.color, meta)).join("");
    if (items) html += `<section class="reglas-sec" data-section="${s.key}"><h3>${s.title}</h3>${items}</section>`;
  }
  document.getElementById("reglas-list").innerHTML = html;
  reglasBuilt = true;
}

function reglasFilter() {
  const query = document.getElementById("reglas-search").value.trim().toLowerCase();
  let shown = 0;
  document.querySelectorAll("#reglas-list .regla").forEach(el => {
    const ok = !query || el.dataset.search.includes(query);
    el.hidden = !ok;
    el.open = !!query && ok && el.dataset.name.includes(query);
    if (ok) shown++;
  });
  document.querySelectorAll("#reglas-list .reglas-sec").forEach(sec => {
    sec.hidden = !sec.querySelector(".regla:not([hidden])");
  });
  document.getElementById("reglas-empty").hidden = shown > 0;
}

async function openReglas() {
  const modal = document.getElementById("reglas");
  modal.hidden = false;
  document.body.classList.add("carta-open");
  if (reglasBuilt) return;
  const status = document.getElementById("reglas-status");
  status.hidden = false;
  status.textContent = "Cargando reglas…";
  try {
    reglasBuild(await cartaGetMeta());
    status.hidden = true;
    reglasFilter();
  } catch (e) {
    status.textContent = "No pude traer las reglas. Revisá que Tailscale esté conectado e intentá de nuevo.";
  }
}

function closeReglas() {
  document.getElementById("reglas").hidden = true;
  document.body.classList.remove("carta-open");
}

document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("reglas");
  $("open-reglas-btn").addEventListener("click", openReglas);
  modal.addEventListener("click", e => { if (e.target.closest("[data-close-reglas]")) closeReglas(); });
  document.getElementById("reglas-search").addEventListener("input", reglasFilter);
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !modal.hidden) closeReglas(); });
});
