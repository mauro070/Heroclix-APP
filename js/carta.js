"use strict";

/* ============================ Carta de la miniatura ============================
   Se dibuja con los datos de HCUnits (llegan por el homelab, que guarda una copia) y las tablas de referencia
   (poderes, colores, habilidades de equipo) que el homelab sirve en /api/heroclix/hcmeta. */

const HC_ASSETS = "https://storage.googleapis.com/static.hcunits.net/images";
const KEY_HCMETA = "heroclix-hcmeta";
const KEY_CARTA_PREFIX = "heroclix-carta:";
const CARTA_DIAL_COLS = 9;
const DIAL_TYPES = ["speed", "attack", "defense", "damage"];
const DIAL_LABELS = { speed: "Velocidad", attack: "Ataque", defense: "Defensa", damage: "Daño" };
const SPECIAL_TYPE_LABELS = {
  title_trait: "Rasgo del título", trait: "Rasgo", optional_trait: "Rasgo opcional", rally_trait: "Rally",
  speed: "Poder especial · velocidad", attack: "Poder especial · ataque",
  defense: "Poder especial · defensa", damage: "Poder especial · daño"
};

let cartaMeta = null;
const cartaUnits = new Map();
let cartaToken = 0;

function cartaHumanize(value) {
  return String(value || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function cartaLoad(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { return null; }
}
function cartaSave(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}

async function cartaFetch(path) {
  return fetch(`${HOMELAB_API_BASE}${path}`, { mode: "cors", signal: AbortSignal.timeout(12000) });
}

async function cartaGetMeta() {
  if (cartaMeta) return cartaMeta;
  const saved = cartaLoad(KEY_HCMETA);
  if (saved) { cartaMeta = saved; return cartaMeta; }
  const res = await cartaFetch("/api/heroclix/hcmeta");
  if (!res.ok) throw new Error("meta " + res.status);
  cartaMeta = await res.json();
  cartaSave(KEY_HCMETA, cartaMeta);
  return cartaMeta;
}

// Miniaturas cuyo código del catálogo no coincide con el de HCUnits (los ids de HCUnits distinguen mayúsculas).
const CARTA_ID_ALIASES = {
  mmpr001: "hbxHBX1-001", mmpr002: "hbxHBX1-002", mmpr003: "hbxHBX1-003", mmpr004: "hbxHBX1-004",
  mmpr005: "hbxHBX1-006", mmpr006: "hbxHBX1-007",
  wkm15010: "wkm15M15-010", wkmp19007: "wkm19MP19-007"
};

// Ids de HCUnits que se prueban para una miniatura, de más a menos probable.
function cartaCandidateIds(fig) {
  const out = [];
  const add = (value, keepCase) => {
    let id = String(value || "").trim().replace(/\s+/g, "");
    if (!keepCase) id = id.toLowerCase();
    if (id && !out.includes(id)) out.push(id);
  };
  add(fig.hcunitsId, true);
  const code = String(fig.collectorNumber || fig.collector_number || fig.code || "").trim().toLowerCase().replace(/\s+/g, "");
  if (CARTA_ID_ALIASES[code]) add(CARTA_ID_ALIASES[code], true);
  add(code);
  const file = /^Images\/.*?([^\/]+)\.[a-z0-9]+$/i.exec(fig.img || "");
  if (file) add(file[1]);
  return out;
}

function cartaSameName(a, b) {
  const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const x = norm(a), y = norm(b);
  return !!x && !!y && (x.includes(y) || y.includes(x));
}

// Devuelve { unit, exact }. Lanza Error("no-encontrada") si ningún id sirve y Error("sin-conexion") si el homelab no responde.
async function cartaGetUnit(fig) {
  let fallback = null;
  for (const id of cartaCandidateIds(fig)) {
    let unit = cartaUnits.get(id) || cartaLoad(KEY_CARTA_PREFIX + id);
    if (!unit) {
      let res;
      try { res = await cartaFetch(`/api/heroclix/unit/${encodeURIComponent(id)}`); }
      catch (e) { throw new Error("sin-conexion"); }
      if (res.status === 404 || res.status === 400) continue;
      if (!res.ok) throw new Error("sin-conexion");
      unit = await res.json();
      cartaSave(KEY_CARTA_PREFIX + id, unit);
    }
    cartaUnits.set(id, unit);
    if (cartaSameName(unit.name, fig.name)) return { unit, exact: true };
    if (!fallback) fallback = unit;
  }
  if (fallback) return { unit: fallback, exact: false };
  throw new Error("no-encontrada");
}

/* ----------------------------- dibujo ----------------------------- */
function cartaText(text, meta) {
  const names = (table, list) => list.split(",").map(k => (table[k.trim()] || {}).name || cartaHumanize(k.trim())).join(", ");
  return escapeHtml(text || "")
    .replace(/\[d:(\d)\]/g, (_, n) => `<span class="carta-die">${String.fromCharCode(0x267F + Number(n))}</span>`)
    .replace(/\[im:([^\]]+)\]/g, (_, l) => names(meta.improved_movement, l))
    .replace(/\[it:([^\]]+)\]/g, (_, l) => names(meta.improved_targeting, l))
    .replace(/\[cs:([^\]]+)\]/g, (_, l) => names(meta.combat_symbols, l))
    .replace(/\[ta:([^\]]+)\]/g, (_, l) => names(meta.team_abilities, l))
    .replace(/\[(?:set|icon):([^\]]+)\]/g, (_, l) => cartaHumanize(l));
}

function cartaLuminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

function cartaCellColors(power, meta) {
  const name = power && (meta.powers[power] || {}).color;
  if (!name) return { bg: "#ffffff", fg: "#111111", special: false };
  const hex = meta.colors[name] || (String(name).startsWith("#") ? name : "#ffffff");
  const white = meta.white_text_on.includes(name) || (String(name).startsWith("#") && cartaLuminance(hex) < 0.5);
  // Un poder "blanco" (poder especial, rasgo...) se marca con borde negro, como en la carta física.
  return { bg: hex, fg: white ? "#ffffff" : "#111111", special: name === "white" };
}

function cartaImg(src, alt, cls) {
  return `<img class="${cls}" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" title="${escapeHtml(alt)}" loading="lazy" onerror="this.remove()">`;
}

function cartaDialHtml(unit, meta) {
  const dial = Array.isArray(unit.dial) ? unit.dial : [];
  if (!dial.length) return "";
  const startClicks = new Set((unit.point_values || []).map(p => p.click_number));
  const symbolFor = {};
  (unit.combat_symbols || []).forEach(sym => {
    const info = meta.combat_symbols[sym];
    if (info && info.type && !symbolFor[info.type]) symbolFor[info.type] = sym;
  });

  let html = "";
  for (let from = 0; from < dial.length; from += CARTA_DIAL_COLS) {
    const chunk = dial.slice(from, from + CARTA_DIAL_COLS);
    const last = from + CARTA_DIAL_COLS >= dial.length;
    html += `<table class="carta-dial"><thead><tr><th></th>` +
      chunk.map(c => `<th>${c.click_number}</th>`).join("") +
      `<th class="carta-dial__ko">${last ? "KO" : ""}</th></tr></thead><tbody>`;
    for (const type of DIAL_TYPES) {
      const sym = symbolFor[type];
      html += `<tr><th class="carta-dial__sym" title="${DIAL_LABELS[type]}">` +
        (sym ? cartaImg(`${HC_ASSETS}/cs/${sym}.svg`, (meta.combat_symbols[sym] || {}).name || DIAL_LABELS[type], "carta-sym") : DIAL_LABELS[type][0]) +
        `</th>`;
      for (const c of chunk) {
        const value = c[type + "_value"];
        const power = c[type + "_power"];
        const { bg, fg, special } = cartaCellColors(power, meta);
        const classes = [startClicks.has(c.click_number) ? "is-start" : "", special ? "is-special" : ""].filter(Boolean).join(" ");
        const cls = classes ? ` class="${classes}"` : "";
        html += value === undefined || value === null
          ? `<td class="is-empty"></td>`
          : `<td${cls} style="background:${bg};color:${fg}" data-power="${escapeHtml(power || "")}" data-click="${c.click_number}" data-type="${type}">${escapeHtml(String(value))}</td>`;
      }
      html += `<td class="carta-dial__ko"></td></tr>`;
    }
    html += `</tbody></table>`;
  }
  return html;
}

function cartaHtml(fig, result, meta) {
  const { unit, exact } = result;
  const pvs = unit.point_values || [];
  const powersList = (unit.special_powers || []).map(p => {
    let label = SPECIAL_TYPE_LABELS[p.type] || (meta.special_power_types[p.type] || {}).name || cartaHumanize(p.type);
    if (p.type === "plus_plot_points") label = `+${p.plot_points || 0} plot`;
    else if (p.type === "minus_plot_points") label = `${p.plot_points} plot`;
    return `<li class="carta-sp">
      <div class="carta-sp__head"><span class="carta-sp__name">${escapeHtml(p.name || "")}</span><span class="carta-sp__type">${escapeHtml(label)}</span></div>
      <p>${cartaText(p.description, meta)}</p></li>`;
  }).join("");

  const teamAbilities = (unit.team_abilities || []).map(id => {
    const info = meta.team_abilities[id] || {};
    return `<details class="carta-ta"><summary>${cartaImg(`${HC_ASSETS}/ta/${id}.svg`, info.name || cartaHumanize(id), "carta-ta__icon")}<span>${escapeHtml(info.name || cartaHumanize(id))}</span></summary>
      <p>${cartaText(info.description || "", meta)}</p></details>`;
  }).join("");

  const symbols = (unit.combat_symbols || []).map(sym =>
    cartaImg(`${HC_ASSETS}/cs/${sym}.svg`, (meta.combat_symbols[sym] || {}).name || cartaHumanize(sym), "carta-sym carta-sym--big")).join("");

  const movement = [...new Set(pvs.flatMap(p => p.improved_movement || []))]
    .map(k => (meta.improved_movement[k] || {}).name || cartaHumanize(k));
  const targeting = [...new Set(pvs.flatMap(p => p.improved_targeting || []))]
    .map(k => (meta.improved_targeting[k] || {}).name || cartaHumanize(k));

  return `
    <header class="carta-head">
      <h2 class="carta-name">${escapeHtml(unit.name)}</h2>
      <p class="carta-sub">${escapeHtml(String(unit.set_id || "").toUpperCase())} ${escapeHtml(unit.collector_number || "")}
        ${unit.rarity ? "· " + escapeHtml(cartaHumanize(unit.rarity)) : ""}${unit.release_date ? " · " + escapeHtml(unit.release_date.slice(0, 4)) : ""}</p>
    </header>
    ${exact ? "" : `<p class="carta-warn">Coincidencia aproximada: HCUnits tiene «${escapeHtml(unit.name)}» para esta miniatura.</p>`}
    <div class="carta-top">
      <img class="carta-mini" src="${escapeHtml(fig.img)}" alt="${escapeHtml(fig.name)}">
      <div class="carta-top__info">
        <div class="carta-symbols">${symbols}</div>
        <p class="carta-stats">
          ${unit.unit_range ? `<span>Alcance <b>${unit.unit_range}</b></span>` : ""}
          ${unit.targets ? `<span>Objetivos <b>${unit.targets}</b></span>` : ""}
          ${unit.dimensions && unit.dimensions !== "1x1" ? `<span>Tamaño <b>${escapeHtml(unit.dimensions)}</b></span>` : ""}
        </p>
        <p class="carta-pvs">${pvs.map(p => `<span class="carta-pv"><b>${p.point_value}</b> pts <i>click ${p.click_number}</i></span>`).join("")}</p>
      </div>
    </div>
    ${unit.keywords && unit.keywords.length ? `<p class="carta-keywords">${unit.keywords.map(k => escapeHtml(k)).join(" · ")}</p>` : ""}
    ${movement.length || targeting.length ? `<p class="carta-extra">${[...movement, ...targeting].map(k => escapeHtml(k)).join(" · ")}</p>` : ""}
    ${teamAbilities ? `<div class="carta-tas">${teamAbilities}</div>` : ""}
    ${powersList ? `<ul class="carta-powers">${powersList}</ul>` : ""}
    <section class="carta-dialbox">
      ${cartaDialHtml(unit, meta)}
      <p class="carta-detail" id="carta-detail">Tocá un número del dial para ver su poder.</p>
    </section>
    ${unit.real_name ? `<p class="carta-foot">Nombre real: <b>${escapeHtml(unit.real_name)}</b></p>` : ""}`;
}

/* ----------------------------- modal ----------------------------- */
function cartaShowDetail(cell) {
  const detail = document.getElementById("carta-detail");
  if (!detail || !cartaMeta) return;
  const power = cell.dataset.power;
  const info = power && cartaMeta.powers[power];
  const label = `Click ${cell.dataset.click} · ${DIAL_LABELS[cell.dataset.type]} ${cell.textContent}`;
  if (!power) detail.innerHTML = `<b>${escapeHtml(label)}</b>: sin poder.`;
  else if (!info) detail.innerHTML = `<b>${escapeHtml(label)}</b>: ${escapeHtml(cartaHumanize(power))}.`;
  else detail.innerHTML = `<b>${escapeHtml(label)} · ${escapeHtml(info.name)}</b>: ${cartaText(info.description || "", cartaMeta)}`;
}

function closeCarta() {
  cartaToken++;
  document.getElementById("carta").hidden = true;
  document.body.classList.remove("carta-open");
}

async function openCarta(fig) {
  if (!fig) return;
  const token = ++cartaToken;
  const body = document.getElementById("carta-body");
  document.getElementById("carta").hidden = false;
  document.body.classList.add("carta-open");
  body.innerHTML = `<p class="carta-msg"><i class="fas fa-circle-notch fa-spin"></i> Buscando la carta de ${escapeHtml(fig.name)}…</p>`;
  try {
    const [meta, result] = await Promise.all([cartaGetMeta(), cartaGetUnit(fig)]);
    if (token !== cartaToken) return;
    body.innerHTML = cartaHtml(fig, result, meta);
    body.scrollTop = 0;
  } catch (err) {
    if (token !== cartaToken) return;
    const msg = err.message === "no-encontrada"
      ? "No encontré esta miniatura en HCUnits. Si tiene otro código allá, editala (pulsación larga) e importá la unidad desde su enlace."
      : "No pude traer la carta. Revisá que Tailscale esté conectado e intentá de nuevo.";
    body.innerHTML = `<p class="carta-msg">${escapeHtml(msg)}</p>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("carta");
  modal.addEventListener("click", e => {
    if (e.target.closest("[data-close-carta]")) { closeCarta(); return; }
    const cell = e.target.closest("td[data-click]");
    if (cell) cartaShowDetail(cell);
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !modal.hidden) closeCarta(); });
});
