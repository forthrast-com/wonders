"use strict";

// ---------- constants ----------

const STORE_KEY = "whr.register.v1";
const CATEGORY_NAMES = { C: "Cultural", N: "Natural", M: "Mixed" };
const DIAL_TICKS = 72;
const HIT_RADIUS_PX = 18;
const FOCUS_ZOOM = 4;
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// mouse/trackpad: hover files a site, click stamps it. Touch: tap, then tap again.
// A starting guess only: touch laptops, iPads with trackpads and some phones
// report hover. The pointer actually in use switches it (see set_hover_mode).
let HOVER_MODE = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const verb = () => (HOVER_MODE ? "click" : "tap");
// switch from 1:110m to 1:50m coastline past this zoom
const FINE_ZOOM = 2.5;

const COLOURS = {
  white: "#ffffff",
  poster: "#1b5cb0",
  outline: "#0e3470",
};

// ---------- pure helpers ----------

function parse_site(row) {
  const [id, name, states, cat, year, lat, lon, danger, region] = row;
  return { id, name, states, cat, year, lat, lon, danger: danger === 1, region };
}

function fold(text) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function search_sites(sites, query, limit = 8) {
  const q = fold(query.trim());
  if (q.length < 2) return [];
  const scored = [];
  for (const s of sites) {
    const name = s.search_name;
    const name_at = name.indexOf(q);
    const state_hit = s.search_states.includes(q);
    if (name_at === -1 && !state_hit) continue;
    // prefix match beats word match beats state-only match
    const score = name_at === 0 ? 0 : name_at > 0 && name[name_at - 1] === " " ? 1 : name_at > 0 ? 2 : 3;
    scored.push([score, s]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name));
  return scored.slice(0, limit).map(([, s]) => s);
}

function tally(sites_by_id, visits) {
  const by_cat = { C: 0, N: 0, M: 0 };
  const states = new Set();
  for (const id of Object.keys(visits)) {
    const s = sites_by_id.get(Number(id));
    if (!s) continue;
    by_cat[s.cat] += 1;
    s.states.forEach((st) => states.add(st));
  }
  return { count: by_cat.C + by_cat.N + by_cat.M, by_cat, states: states.size };
}

function lit_tick_count(count, total) {
  if (count === 0) return 0;
  return Math.max(1, Math.round((DIAL_TICKS * count) / total));
}

function today_iso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function format_stamp_date(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  return `${String(d).padStart(2, "0")} ${months[m - 1]} ${y}`;
}

// ---------- ledger: the list of recorded visits ----------

const LEDGER_SORTS = {
  recent: (a, b) => b.date.localeCompare(a.date) || a.site.name.localeCompare(b.site.name),
  oldest: (a, b) => a.date.localeCompare(b.date) || a.site.name.localeCompare(b.site.name),
  name: (a, b) => a.site.name.localeCompare(b.site.name),
  country: (a, b) => a.site.states[0].localeCompare(b.site.states[0]) || a.site.name.localeCompare(b.site.name),
  inscribed: (a, b) => a.site.year - b.site.year || a.site.name.localeCompare(b.site.name),
};

function ledger_entries(sites_by_id, visits, sort_key) {
  const entries = [];
  for (const [id, date] of Object.entries(visits)) {
    const site = sites_by_id.get(Number(id));
    if (site) entries.push({ site, date });
  }
  return entries.sort(LEDGER_SORTS[sort_key] ?? LEDGER_SORTS.recent);
}

function ledger_text(entries, total) {
  const pct = ((100 * entries.length) / total).toFixed(1);
  const lines = entries.map(({ site, date }) => `${date}  ${site.name} (${site.states.join(", ")})`);
  return [`World Heritage Register: ${entries.length} of ${total.toLocaleString("en-AU")} sites visited (${pct}%)`, "", ...lines].join("\n");
}

// ---------- opening view: the viewer's own part of the world ----------

// The time zone is a free, prompt-free hint at where someone is: no
// geolocation, no permission dialog, nothing leaves the browser. Specific
// zones come first so a continent can be split; null keeps the whole world.
const HOME_VIEWS = [
  [/^(Australia\/|Antarctica\/Macquarie)/, [134, -27], 2.6],
  [/^Pacific\/(Auckland|Chatham)|^NZ/, [173, -41], 3.5],
  [/^Pacific\//, [175, -12], 2.2],
  [/^(Europe\/Istanbul|Asia\/(Dubai|Riyadh|Qatar|Bahrain|Kuwait|Tehran|Baghdad|Jerusalem|Tel_Aviv|Beirut|Amman|Damascus|Nicosia|Muscat|Baku|Tbilisi|Yerevan))/, [45, 30], 3],
  [/^Europe\//, [12, 49], 3],
  [/^Africa\/(Cairo|Tripoli|Tunis|Algiers|Casablanca|Khartoum)/, [12, 28], 2.6],
  [/^Africa\//, [22, 0], 2.2],
  [/^Asia\/(Kolkata|Calcutta|Colombo|Dhaka|Kathmandu|Karachi|Thimphu)/, [80, 22], 3],
  [/^Asia\/(Tokyo|Seoul|Pyongyang|Shanghai|Hong_Kong|Macau|Taipei|Chongqing|Harbin)/, [122, 34], 3],
  [/^Asia\/(Bangkok|Jakarta|Singapore|Kuala_Lumpur|Manila|Ho_Chi_Minh|Saigon|Phnom_Penh|Vientiane|Yangon|Makassar|Jayapura)/, [110, 8], 3],
  [/^Asia\//, [90, 38], 2.2],
  [/^America\/(Sao_Paulo|Argentina|Buenos_Aires|Santiago|Lima|Bogota|Caracas|Montevideo|La_Paz|Asuncion|Guayaquil|Manaus|Recife|Belem|Fortaleza|Cayenne|Paramaribo)/, [-62, -18], 2.4],
  [/^America\/(Mexico_City|Monterrey|Cancun|Guatemala|Belize|El_Salvador|Tegucigalpa|Managua|Costa_Rica|Panama|Havana|Jamaica|Port-au-Prince|Santo_Domingo|Puerto_Rico)/, [-86, 18], 3],
  [/^(America\/|US\/|Canada\/)/, [-98, 42], 2.5],
  [/^Atlantic\/(Reykjavik|Faroe|Canary|Madeira|Azores)/, [-12, 52], 2.6],
];

function home_view(time_zone) {
  for (const [pattern, centre, k] of HOME_VIEWS) {
    if (pattern.test(time_zone)) return { centre, k };
  }
  return null;
}

// ---------- sharing ----------

const SITE_URL = "https://wonders.forthrast.com";
const CARD_W = 1200;
const CARD_H = 630;

function brag_line(count, total, countries) {
  const sites = `${total.toLocaleString("en-AU")} World Heritage sites`;
  if (count === 0) return `UNESCO lists ${sites}. How many have you been to?`;
  const across = countries > 1 ? ` across ${countries} countries` : "";
  return `I’ve visited ${count} of UNESCO’s ${sites}${across}. How many have you been to?`;
}

// "Historic Centre of Rome, the Properties of the Holy See…" → "Historic Centre of Rome"
function short_name(name) {
  return name.split(/,| – | - |: | \(/)[0].trim();
}

function shuffled(items) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// The share card: the poster's blue, one huge number, and the world with your
// visits marked as seals. Two type styles only: the numerals and a caps label.
// `generic` draws the link-preview card instead.
async function render_card({ sites, visits, land, summary, generic = false }) {
  // canvas text silently falls back unless the face is loaded first
  await Promise.all(["800 200px Archivo", "700 18px Archivo"].map((f) => document.fonts.load(f)));
  const c = document.createElement("canvas");
  c.width = CARD_W;
  c.height = CARD_H;
  const g = c.getContext("2d");
  const P = {
    field: "#123f80", sea: "#1b5cb0", land: "#2b6dc2", white: "#ffffff",
    pale: "#bcd3f2", line: "rgba(255,255,255,0.45)", faint: "rgba(255,255,255,0.18)",
  };
  const left = 40;

  // the one label style; returns its drawn width
  const label = (text, x, y, colour = P.white, align = "left") => {
    const s = String(text).toUpperCase();
    g.font = "700 18px Archivo, Helvetica, Arial, sans-serif";
    g.letterSpacing = "2.2px";
    g.fillStyle = colour;
    g.textAlign = align;
    g.fillText(s, x, y);
    const w = g.measureText(s).width;
    g.textAlign = "left";
    g.letterSpacing = "0px";
    return w;
  };

  g.fillStyle = P.field;
  g.fillRect(0, 0, CARD_W, CARD_H);

  // head: a frieze of the register's seal (a circle round a square), like a
  // stamp's perforated edge, over a dashed rule
  const right = CARD_W - left;
  // edge to edge, like a sheet of stamps: the spacing divides the card
  // exactly, so the end seals sit on the edges and crop at their halfway line
  const seal_r = 8;
  const gaps = Math.round(CARD_W / 30);
  const step = CARD_W / gaps;
  const seals = gaps + 1;
  const first = 0;
  const frieze_y = 24;
  g.strokeStyle = "rgba(255,255,255,0.4)";
  g.lineWidth = 1.2;
  for (let i = 0; i < seals; i++) {
    const x = first + i * step;
    g.beginPath();
    g.arc(x, frieze_y, seal_r, 0, Math.PI * 2);
    g.stroke();
    g.strokeRect(x - 5.66, frieze_y - 5.66, 11.32, 11.32);
  }
  g.setLineDash([5, 5]);
  g.beginPath();
  g.moveTo(0, frieze_y + 22.5);
  g.lineTo(CARD_W, frieze_y + 22.5);
  g.stroke();
  g.setLineDash([]);

  const names = generic ? shuffled(sites).slice(0, 45).map((s) => short_name(s.name)) : shuffled(summary.recent);
  const rows = !names.length ? 0 : generic ? 3 : names.length < 6 ? 1 : names.length < 15 ? 2 : 3;
  const ROW_H = 34;
  const LAST_ROW_Y = 604;
  const rows_top = rows ? LAST_ROW_Y - (rows - 1) * ROW_H - 18 : CARD_H - 24;

  // the world: pushed right to the margin, centred in the open band between
  // the dashed rule and the first postcard row (fitExtent centres within it)
  const map_box = [[400, frieze_y + 22.5 + 8], [right, rows_top - 6]];
  const proj = d3.geoNaturalEarth1().fitExtent(map_box, { type: "Sphere" });
  // the text column takes its top and bottom edges from the map's outline
  const [[, map_top], [, map_bottom]] = d3.geoPath(proj).bounds({ type: "Sphere" });
  const LABEL_CAP = 13; // cap height of the 18px label face
  label(SITE_URL.replace("https://", ""), left, Math.round(map_top + LABEL_CAP), P.pale);
  const path = d3.geoPath(proj, g);
  g.lineWidth = 1;
  g.beginPath(); path({ type: "Sphere" }); g.fillStyle = P.sea; g.fill(); g.strokeStyle = P.line; g.stroke();
  g.beginPath(); path(d3.geoGraticule10()); g.strokeStyle = "rgba(255,255,255,0.08)"; g.stroke();
  g.beginPath(); path(land); g.fillStyle = P.land; g.fill(); g.strokeStyle = P.line; g.stroke();
  // personal card: unvisited recede to a dust so your seals carry it;
  // the link-preview card has no seals, so the whole List is the subject
  g.fillStyle = generic ? "rgba(255,255,255,0.75)" : P.faint;
  const dot_r = generic ? 1.8 : 1.3;
  for (const s of sites) {
    if (visits[s.id]) continue;
    const [x, y] = proj([s.lon, s.lat]);
    g.beginPath(); g.arc(x, y, dot_r, 0, Math.PI * 2); g.fill();
  }
  for (const s of sites) {
    if (!visits[s.id]) continue;
    const [x, y] = proj([s.lon, s.lat]);
    draw_visited_dot(g, x, y, 3, false);
  }

  // the number, then what it counts

  const numeral = String(generic ? summary.total : summary.count);
  g.font = "800 200px Archivo, Helvetica, Arial, sans-serif";
  const column_w = 340;
  const size = Math.min(200, Math.floor((200 * column_w) / g.measureText(numeral).width));
  g.font = `800 ${size}px Archivo, Helvetica, Arial, sans-serif`;
  // block = numerals (cap height ~0.72em) + two labels + the icon row
  const cap = size * 0.72;
  const below = 136;
  // anchored bottom left: the icon row's roundels end level with the map's
  // bottom (each roundel reaches 6px below the row's baseline)
  const baseline = Math.round(map_bottom - 6 - (below - 6));
  g.fillStyle = P.white;
  g.textBaseline = "alphabetic";
  g.fillText(numeral, left - size * 0.04, baseline);
  const total = summary.total.toLocaleString("en-AU");
  if (generic) {
    label("World Heritage sites", left, baseline + 46);
    label("How many have you visited?", left, baseline + 76, P.pale);
  } else {
    label("World Heritage sites visited", left, baseline + 46);
    label(`${summary.pct}% of ${total}`, left, baseline + 76, P.pale);
  }

  // icon | number, the key's own pictograms
  let x = left + 13;
  const row_y = baseline + below - 6;
  const cats = generic ? summary.list_by_cat : summary.by_cat;
  for (const cat of ["C", "N", "M"]) {
    draw_marker(g, cat, x, row_y - 7, 13, { visited: false, danger: false });
    x += 22 + label(cats[cat], x + 22, row_y) + 28;
  }
  if (!generic) label(`${summary.countries} ${summary.countries === 1 ? "country" : "countries"}`, x - 13, row_y, P.pale);

  // postcard rows along the foot: shuffled names, each row offset sideways
  // and running off both edges; a short list repeats to fill its row
  if (rows) {
    const offsets = [-40, -170, -95];
    const sep = "   •   ";
    for (let r = 0; r < rows; r++) {
      const own = names.filter((_, i) => i % rows === r);
      const y = LAST_ROW_Y - (rows - 1 - r) * ROW_H;
      let px = offsets[r];
      for (let i = 0; px < CARD_W; i++) {
        px += label(own[i % own.length] + sep, px, y, r % 2 ? P.pale : P.white);
      }
    }
  }
  return c;
}

const canvas_png = (c) => new Promise((resolve, reject) => {
  c.toBlob((b) => (b ? resolve(b) : reject(new Error("card could not be encoded"))), "image/png");
});

// ---------- storage (the only side-effecting persistence) ----------

function load_visits() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.visits === "object" ? parsed.visits : {};
  } catch (err) {
    // SecurityError (storage blocked) or SyntaxError (mangled entry): start a fresh register
    console.warn("register unreadable, starting empty:", err);
    return {};
  }
}

const SORT_KEY = "whr.ledger_sort";
const VIEW_KEY = "whr.view";

function load_view() {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "map";
  } catch (err) {
    // storage blocked: open on the map
    return "map";
  }
}

function save_view(view) {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch (err) {
    // storage blocked: the view just won't be remembered
  }
}

const LIST_KEY = "whr.list";
const LIST_DEFAULTS = { group: "country", show: "all" };

function load_list_prefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(LIST_KEY) || "{}");
    return { ...LIST_DEFAULTS, ...saved };
  } catch (err) {
    // SecurityError or a mangled entry: defaults
    return { ...LIST_DEFAULTS };
  }
}

function save_list_prefs(prefs) {
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(prefs));
  } catch (err) {
    // storage blocked: the choice just won't be remembered
  }
}

// How the list can be cut. Each returns the group labels a site belongs to
// (a transboundary site sits under every one of its countries), plus the
// order groups and sites appear in.
const LIST_GROUPINGS = {
  country: {
    keys: (s) => s.states,
    order: (a, b) => a.localeCompare(b),
    sites: (a, b) => a.name.localeCompare(b.name),
  },
  region: {
    keys: (s) => [s.region],
    order: (a, b) => a.localeCompare(b),
    sites: (a, b) => a.states[0].localeCompare(b.states[0]) || a.name.localeCompare(b.name),
  },
  category: {
    keys: (s) => [CATEGORY_NAMES[s.cat]],
    order: (a, b) => ["Cultural", "Natural", "Mixed"].indexOf(a) - ["Cultural", "Natural", "Mixed"].indexOf(b),
    sites: (a, b) => a.name.localeCompare(b.name),
  },
  decade: {
    keys: (s) => [`${Math.floor(s.year / 10) * 10}s`],
    order: (a, b) => a.localeCompare(b),
    sites: (a, b) => a.year - b.year || a.name.localeCompare(b.name),
  },
};

function group_sites(sites, grouping) {
  const g = LIST_GROUPINGS[grouping] ?? LIST_GROUPINGS.country;
  const groups = new Map();
  for (const s of sites) {
    for (const key of g.keys(s)) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }
  }
  return [...groups.entries()]
    .sort((a, b) => g.order(a[0], b[0]))
    .map(([label, list]) => ({ label, sites: list.sort(g.sites) }));
}

function load_sort() {
  try {
    return localStorage.getItem(SORT_KEY) || "recent";
  } catch (err) {
    // storage blocked: the default order is fine
    return "recent";
  }
}

function save_sort(key) {
  try {
    localStorage.setItem(SORT_KEY, key);
  } catch (err) {
    // storage blocked: the sort just won't be remembered
  }
}

function save_visits(visits) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ v: 1, visits }));
  } catch (err) {
    // QuotaExceeded / SecurityError: the session still works, it just won't persist
    console.warn("register not saved:", err);
  }
}

// ---------- marker pictograms ----------

// Drawn in a 20-unit box centred on 0, white linework on a roundel.
// One source for the canvas markers and the key's SVGs.
const ICONS = {
  // a scroll, rolled top and bottom, two lines of text
  C: [
    "M-6,-7.5H6A1.5,1.5 0 0 1 6,-4.5H-6A1.5,1.5 0 0 1 -6,-7.5Z",
    "M-6,4.5H6A1.5,1.5 0 0 1 6,7.5H-6A1.5,1.5 0 0 1 -6,4.5Z",
    "M-5,-4.5V4.5M5,-4.5V4.5",
    "M-2.8,-1.5H2.8M-2.8,1.5H1.4",
  ],
  // a waterfall: two strands curling over a cliff lip into a rippled pool
  N: [
    "M-9,-8H-4Q1.5,-8 1.5,-2V4",
    "M-9,-5H-5Q-1.5,-5 -1.5,-1V4",
    "M-9,-2H-6V8",
    "M-3,7.5Q-1,5.9 1,7.5T5,7.5T9,7.5",
  ],
  // mixed: a mountain with terraces cut into its flank
  M: [
    "M-9.5,7.5L-1,-8L9.5,7.5Z",
    "M-4.4,1.5H2.6M-6.4,4.6H4.8",
  ],
};
const ICON_PATHS = Object.fromEntries(
  Object.entries(ICONS).map(([cat, ds]) => [cat, new Path2D(ds.join(""))]),
);

function marker_radius(k) {
  // dots at world scale, pictogram roundels from about 4x zoom
  return Math.min(2.8 * Math.sqrt(k), 11);
}

// Nudge overlapping markers apart at a given zoom: each site is tethered to its
// true spot, may still overlap a little, and drifts at most one marker radius. Returns [dx, dy] pairs in
// projected (zoom 1) units, indexed like `sites`.
// `seed` (the previous level's offsets) keeps each site drifting the same way
// from level to level, so blending between levels reads as one motion.
function compute_jiggle(sites, k, seed = null) {
  const r = marker_radius(k);
  const nodes = sites.map((s, i) => ({
    x: s.px + (seed ? seed[2 * i] : 0),
    y: s.py + (seed ? seed[2 * i + 1] : 0),
    ox: s.px,
    oy: s.py,
  }));
  const sim = d3.forceSimulation(nodes)
    .force("x", d3.forceX((d) => d.ox).strength(0.2))
    .force("y", d3.forceY((d) => d.oy).strength(0.2))
    .force("collide", d3.forceCollide((r * 0.85) / k).strength(0.5))
    .stop();
  for (let i = 0; i < 60; i++) sim.tick();
  const cap = r / k;
  const out = new Float32Array(sites.length * 2);
  nodes.forEach((n, i) => {
    let dx = n.x - n.ox, dy = n.y - n.oy;
    const d = Math.hypot(dx, dy);
    if (d > cap) { dx *= cap / d; dy *= cap / d; }
    out[2 * i] = dx;
    out[2 * i + 1] = dy;
  });
  return out;
}

// pictograms appear once the roundel is big enough to read them
const ICON_MIN_RADIUS = 5.5;

// Below pictogram size the register has to read across the whole world:
// visited sites become larger seals with an outer ring.
function draw_visited_dot(ctx, x, y, r, danger) {
  const big = Math.max(r * 1.7, 4.5);
  ctx.beginPath();
  ctx.arc(x, y, big, 0, Math.PI * 2);
  ctx.fillStyle = COLOURS.white;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = COLOURS.outline;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, big + (danger ? 4 : 2.5), 0, Math.PI * 2);
  ctx.lineWidth = 1;
  ctx.strokeStyle = COLOURS.white;
  if (danger) ctx.setLineDash([2, 1.8]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function draw_marker(ctx, cat, x, y, r, { visited, danger }) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = visited ? COLOURS.white : COLOURS.outline;
  ctx.fill();
  ctx.lineWidth = visited ? 1 : 1.2;
  ctx.strokeStyle = visited ? COLOURS.outline : COLOURS.white;
  ctx.stroke();

  if (r >= ICON_MIN_RADIUS) {
    const scale = r * 0.07;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.lineWidth = 1.25 / scale;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = visited ? COLOURS.poster : COLOURS.white;
    ctx.stroke(ICON_PATHS[cat]);
    ctx.restore();
  }

  // In Danger is marked by form, not colour: a dashed halo round the roundel
  if (danger) {
    ctx.save();
    ctx.setLineDash([2, 1.8]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = COLOURS.white;
    ctx.beginPath();
    ctx.arc(x, y, r + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function fill_key_icons(root) {
  const ns = "http://www.w3.org/2000/svg";
  for (const svg of root.querySelectorAll("svg[data-icon]")) {
    const { icon, mode } = svg.dataset;
    const add = (tag, attrs) => {
      const node = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
      svg.append(node);
    };
    const visited = mode === "visited";
    add("circle", { r: 10, class: visited ? "kr kr-visited" : "kr" });
    add("path", { d: ICONS[icon].join(""), class: visited ? "ki ki-visited" : "ki", transform: "scale(0.72)" });
    if (mode === "danger") add("circle", { r: 13.5, class: "kh" });
  }
}

// One-line text that pans back and forth only when it overflows its box.
function fit_marquee(box) {
  const line = box.firstElementChild;
  box.classList.remove("rolling");
  const over = line.scrollWidth - box.clientWidth;
  if (over <= 1) return;
  box.style.setProperty("--marquee-shift", `${-over}px`);
  box.style.setProperty("--marquee-s", `${Math.max(5, over / 25)}s`);
  box.classList.add("rolling");
}

// ---------- emblem: a progress dial of ruled ticks around a circle-and-square seal ----------

function build_emblem(svg) {
  const ns = "http://www.w3.org/2000/svg";
  const make = (tag, attrs) => {
    const node = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  };
  svg.append(
    make("circle", { class: "seal", r: 30 }),
    make("rect", { class: "seal", x: -21.2, y: -21.2, width: 42.4, height: 42.4 }),
    make("circle", { class: "seal seal-faint", r: 36 }),
  );
  const ticks = [];
  for (let i = 0; i < DIAL_TICKS; i++) {
    // every sixth tick is longer, like a dial's major graduation
    const inner = i % 6 === 0 ? 39 : 41.5;
    const tick = make("line", {
      class: "dial-tick",
      x1: 0, y1: -inner, x2: 0, y2: -47,
      transform: `rotate(${(360 / DIAL_TICKS) * i})`,
    });
    svg.append(tick);
    ticks.push(tick);
  }
  return ticks;
}

// ---------- app ----------

async function main() {
  const status_el = document.getElementById("map_status");

  let site_rows, world;
  try {
    const [sr, wr] = await Promise.all([fetch("data/sites.json"), fetch("data/world.json")]);
    if (!sr.ok || !wr.ok) throw new Error(`HTTP ${sr.status}/${wr.status}`);
    [site_rows, world] = await Promise.all([sr.json(), wr.json()]);
  } catch (err) {
    status_el.textContent = `The register could not be retrieved (${err.message}). Reload to try again.`;
    throw err;
  }
  status_el.hidden = true;

  const sites = site_rows.map(parse_site);
  sites.forEach((s, i) => { s.i = i; });
  for (const s of sites) {
    s.search_name = fold(s.name);
    s.search_states = fold(s.states.join(" "));
  }
  const sites_by_id = new Map(sites.map((s) => [s.id, s]));

  const state = {
    visits: load_visits(),
    selected_id: null,
    transform: d3.zoomIdentity,
    width: 0,
    height: 0,
    shown_count: 0,
    focusing: null,
    gesturing: false,
  };

  // --- dom ---
  const map_el = document.getElementById("map");
  const surface = d3.select("#map_surface");
  const base_canvas = document.getElementById("map_base");
  const base_ctx = base_canvas.getContext("2d");
  const canvas = document.getElementById("map_markers");
  const ctx = canvas.getContext("2d");
  const ring = build_emblem(document.getElementById("emblem"));
  const map_key = document.getElementById("map_key");
  fill_key_icons(map_key);
  // on a phone the key would cover most of the map; start it folded
  if (window.matchMedia("(max-width: 640px)").matches) map_key.open = false;

  const el = (id) => document.getElementById(id);
  const docket = {
    empty: el("docket_empty"),
    site: el("docket_site"),
    ref: el("d_ref"),
    cat: el("d_cat"),
    year: el("d_year"),
    danger_row: el("d_danger_row"),
    name: el("d_name"),
    states: el("d_states"),
    link: el("d_link"),
    toggle: el("d_toggle"),
    toggle_label: el("d_toggle_label"),
    stamp: el("d_stamp"),
    stamp_date: el("d_stamp_date"),
  };

  el("tally_total").textContent = sites.length.toLocaleString("en-AU");
  const EMPTY_COPY = {
    hover: "Hover over a site to file it. Click it to record your visit.",
    tap: "Tap a site on the map to file it. Tap it again to record your visit.",
  };
  docket.empty.textContent = HOVER_MODE ? EMPTY_COPY.hover : EMPTY_COPY.tap;

  // --- map layers ---
  const projection = d3.geoNaturalEarth1();
  const path = d3.geoPath(projection);
  const sphere_geo = { type: "Sphere" };
  const collection = (geometries) => ({ type: "GeometryCollection", geometries });
  const geo_by_res = Object.fromEntries(Object.entries(world).map(([res, w]) => [
    res, { land: collection(w.land), borders: collection(w.borders) },
  ]));

  // the reset button is a little line globe, turned to show Australia
  {
    const globe = d3.geoOrthographic().rotate([-128, 18]).scale(10).translate([12, 12]);
    const globe_path = d3.geoPath(globe);
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    for (const [cls, geo] of [
      ["globe-grid", d3.geoGraticule().step([30, 30])()],
      // specks of island are noise at 22px; keep landmasses only
      ["globe-land", collection(world["110m"].land.filter((g) => d3.geoArea(g) > 0.0004))],
      ["globe-rim", { type: "Sphere" }],
    ]) {
      const p = document.createElementNS(ns, "path");
      p.setAttribute("class", cls);
      p.setAttribute("d", globe_path(geo));
      svg.append(p);
    }
    document.getElementById("zoom_reset").replaceChildren(svg);
  }

  const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const PAINT = {
    sea: token("--poster"),
    land: token("--land"),
    line: token("--line"),
    grid: "rgb(255 255 255 / 0.1)",
    border: "rgb(255 255 255 / 0.3)",
  };

  // Coastlines are projected once per layout into Path2Ds at zoom 1; each frame
  // only sets a transform and fills. The fine set is built on first zoom-in.
  let shapes = null;
  const to_path2d = (geo) => new Path2D(path(geo));
  const shapes_for = (res) => {
    shapes[res] ??= {
      land: to_path2d(geo_by_res[res].land),
      borders: to_path2d(geo_by_res[res].borders),
    };
    return shapes[res];
  };

  function size_canvas(c, c_ctx, width, height) {
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
    c_ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw_base() {
    const t = state.transform;
    const dpr = window.devicePixelRatio || 1;
    const c = base_ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, state.width, state.height);
    c.setTransform(dpr * t.k, 0, 0, dpr * t.k, dpr * t.x, dpr * t.y);

    const hair = 1 / t.k;
    const geo = shapes_for(t.k >= FINE_ZOOM ? "50m" : "110m");
    c.lineWidth = hair;
    c.fillStyle = PAINT.sea;
    c.fill(shapes.sphere);
    c.strokeStyle = PAINT.grid;
    c.stroke(shapes.graticule);
    c.fillStyle = PAINT.land;
    c.fill(geo.land);
    c.strokeStyle = PAINT.line;
    c.stroke(geo.land);
    // dashes are the expensive stroke; mid-gesture the borders go solid
    c.strokeStyle = PAINT.border;
    if (!state.gesturing) c.setLineDash([2 * hair, 2 * hair]);
    c.stroke(geo.borders);
    c.setLineDash([]);
    c.strokeStyle = PAINT.line;
    c.stroke(shapes.sphere);
  }

  // all redraws go through here: at most one paint per animation frame
  let pending = { base: false, markers: false, frame: null };
  function request_draw({ base = true } = {}) {
    pending.base ||= base;
    pending.markers = true;
    pending.frame ??= requestAnimationFrame(() => {
      if (pending.base) draw_base();
      draw_markers();
      pending = { base: false, markers: false, frame: null };
    });
  }

  function layout() {
    const { width, height } = map_el.getBoundingClientRect();
    if (width === state.width && height === state.height) return;

    // remember what's under the centre so a resize (phone rotation, URL bar)
    // keeps the same place in view instead of sliding the map out from under the zoom
    const k = state.transform.k;
    const centre_geo = state.width
      ? projection.invert(state.transform.invert([state.width / 2, state.height / 2]))
      : null;

    state.width = width;
    state.height = height;

    // A portrait box gets the sphere fitted
    // to its height and panned sideways, like a folded chart, rather than a
    // postage stamp of a world floating in empty sea.
    const inset = [[16, 16], [width - 16, height - 16]];
    projection.fitExtent(inset, sphere_geo);
    if (height > width * 0.75) {
      projection.fitHeight(height - 32, sphere_geo);
      const [[x0, y0], [x1, y1]] = d3.geoPath(projection).bounds(sphere_geo);
      const [tx, ty] = projection.translate();
      projection.translate([tx + width / 2 - (x0 + x1) / 2, ty + 16 - y0]);
    }
    shapes = { sphere: to_path2d(sphere_geo), graticule: to_path2d(d3.geoGraticule10()) };
    for (const s of sites) [s.px, s.py] = projection([s.lon, s.lat]);
    warm_jiggle();

    size_canvas(base_canvas, base_ctx, width, height);
    size_canvas(canvas, ctx, width, height);

    // pan limits: the sphere's bounds, never tighter than the viewport itself
    const [[bx0, by0], [bx1, by1]] = path.bounds(sphere_geo);
    zoom.extent([[0, 0], [width, height]]).translateExtent([
      [Math.min(0, bx0 - 16), Math.min(0, by0 - 16)],
      [Math.max(width, bx1 + 16), Math.max(height, by1 + 16)],
    ]);
    if (state.focusing) {
      // a pan was in flight toward stale coordinates; aim it again
      focus_site(state.focusing);
    } else if (centre_geo && k > 1) {
      const [cx, cy] = projection(centre_geo);
      surface.interrupt().call(zoom.transform, d3.zoomIdentity.translate(width / 2 - cx * k, height / 2 - cy * k).scale(k));
    }
    // resizing a canvas wipes it on the spot; repaint in this same frame or
    // the map blinks empty for one (the "flash" on a phone's first selection)
    draw_base();
    draw_markers();
  }

  // --- markers ---
  // Offsets per zoom level, in half-octaves up to 16x (past that the markers
  // have room of their own). Levels fill in during idle time after a layout,
  // one per idle slot, each seeded from the one below.
  const JIGGLE_LEVELS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];
  const jiggle_cache = new Map();
  let jiggle_generation = 0;
  const when_idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 16));

  function warm_jiggle() {
    const generation = ++jiggle_generation;
    jiggle_cache.clear();
    const step = (i) => {
      if (generation !== jiggle_generation || i >= JIGGLE_LEVELS.length) return;
      const level = JIGGLE_LEVELS[i];
      jiggle_cache.set(level, compute_jiggle(sites, 2 ** level, jiggle_cache.get(JIGGLE_LEVELS[i - 1])));
      blended.k = null;
      request_draw({ base: false });
      when_idle(() => step(i + 1));
    };
    step(0); // level 0 synchronously, so the first paint is already jiggled
  }

  // offsets for the live zoom: a blend of the two levels either side of it
  const blended = { k: null, offsets: null, buffer: null };
  function current_offsets() {
    const k = state.transform.k;
    if (blended.k === k) return blended.offsets;
    const level = Math.min(Math.max(Math.log2(k), 0), 4);
    const lo = Math.floor(level * 2) / 2;
    const hi = Math.min(lo + 0.5, 4);
    const a = jiggle_cache.get(lo), b = jiggle_cache.get(hi);
    const f = (level - lo) / 0.5;
    let offsets;
    if (!a || !b || f === 0) {
      offsets = a ?? b ?? null;
    } else {
      blended.buffer ??= new Float32Array(a.length);
      if (blended.buffer.length !== a.length) blended.buffer = new Float32Array(a.length);
      for (let i = 0; i < a.length; i++) blended.buffer[i] = a[i] + (b[i] - a[i]) * f;
      offsets = blended.buffer;
    }
    blended.k = k;
    blended.offsets = offsets;
    return offsets;
  }

  function screen_xy(s) {
    const t = state.transform, j = current_offsets();
    const px = j ? s.px + j[2 * s.i] : s.px;
    const py = j ? s.py + j[2 * s.i + 1] : s.py;
    return [t.applyX(px), t.applyY(py)];
  }

  function draw_markers() {
    const t = state.transform;
    const { width, height } = state;
    ctx.clearRect(0, 0, width, height);
    const r = marker_radius(t.k);
    const pad = 16;

    // visited roundels go on top so the record is never buried; zoomed out,
    // the unvisited recede a little so the register stands forward
    const zoomed_out = r < ICON_MIN_RADIUS;
    const visited = [];
    ctx.globalAlpha = zoomed_out ? 0.7 : 1;
    for (const s of sites) {
      const [x, y] = screen_xy(s);
      if (x < -pad || y < -pad || x > width + pad || y > height + pad) continue;
      if (state.visits[s.id]) { visited.push([s, x, y]); continue; }
      draw_marker(ctx, s.cat, x, y, r, { visited: false, danger: s.danger });
    }
    ctx.globalAlpha = 1;
    for (const [s, x, y] of visited) {
      if (zoomed_out) draw_visited_dot(ctx, x, y, r, s.danger);
      else draw_marker(ctx, s.cat, x, y, r, { visited: true, danger: s.danger });
    }

    const sel = state.selected_id != null && sites_by_id.get(state.selected_id);
    if (sel) {
      const [x, y] = screen_xy(sel);
      const ring_r = r + (sel.danger ? 8 : 5);
      // registration mark: ring with four ticks
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLOURS.white;
      ctx.beginPath();
      ctx.arc(x, y, ring_r, 0, Math.PI * 2);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        ctx.moveTo(x + dx * (ring_r - 3), y + dy * (ring_r - 3));
        ctx.lineTo(x + dx * (ring_r + 8), y + dy * (ring_r + 8));
      }
      ctx.stroke();
    }
  }

  // --- tally ---
  function render_tally() {
    const t = tally(sites_by_id, state.visits);
    const pct = ((100 * t.count) / sites.length).toFixed(1);
    el("tally_pct").textContent = `${pct}%`;
    const breakdown = el("tally_breakdown");
    const svg_ns = "http://www.w3.org/2000/svg";
    breakdown.replaceChildren(
      ...["C", "N", "M"].map((cat) => {
        const group = document.createElement("span");
        group.className = "cat-count";
        group.title = CATEGORY_NAMES[cat];
        group.setAttribute("aria-label", `${CATEGORY_NAMES[cat]}: ${t.by_cat[cat]}`);
        const icon = document.createElementNS(svg_ns, "svg");
        icon.setAttribute("viewBox", "-15 -15 30 30");
        icon.setAttribute("aria-hidden", "true");
        icon.dataset.icon = cat;
        icon.dataset.mode = "open";
        const n = document.createElement("b");
        n.textContent = t.by_cat[cat];
        group.append(icon, n);
        return group;
      }),
      Object.assign(document.createElement("span"), {
        textContent: `${t.states} ${t.states === 1 ? "country" : "countries"}`,
      }),
    );
    fill_key_icons(breakdown);

    const lit = lit_tick_count(t.count, sites.length);
    ring.forEach((g, i) => g.classList.toggle("lit", i < lit));

    roll_counter(t.count);
    render_ticker();
    if (ledger.dialog.open) render_ledger();
  }

  // --- ledger ---
  const ledger = {
    dialog: el("ledger"),
    rows: el("ledger_rows"),
    summary: el("ledger_summary"),
    sort: el("ledger_sort"),
    copy: el("ledger_copy"),
    share: el("ledger_share"),
    card: el("ledger_card"),
    preview: el("ledger_preview"),
    ticker: el("ledger_ticker"),
  };
  ledger.sort.value = LEDGER_SORTS[load_sort()] ? load_sort() : "recent";

  function paint_ticker(names) {
    // roll only when the list overflows; the track is doubled so the loop is seamless
    const rolling = names.length > 3 && !REDUCED_MOTION;
    const shown = rolling ? [...names, ...names] : names;
    ledger.ticker.replaceChildren(...shown.map((n) => {
      const span = document.createElement("span");
      span.textContent = n;
      return span;
    }));
    ledger.ticker.classList.toggle("rolling", rolling);
    ledger.ticker.style.setProperty("--ticker-s", `${names.length * 2.4}s`);
  }

  // Rebuilding a rolling ticker restarts it from the top, which jumps. So a
  // change waits for the loop to wrap, where the track is back at its start
  // anyway, and swaps in there.
  let ticker_pending = null;
  ledger.ticker.addEventListener("animationiteration", () => {
    if (!ticker_pending) return;
    paint_ticker(ticker_pending);
    ticker_pending = null;
  });

  function render_ticker() {
    const entries = ledger_entries(sites_by_id, state.visits, "recent");
    const names = entries.length ? entries.map((e) => e.site.name) : ["No sites recorded yet"];
    if (ledger.ticker.classList.contains("rolling") && names.length > 3) {
      ticker_pending = names;
    } else {
      ticker_pending = null;
      paint_ticker(names);
    }
  }

  function render_ledger() {
    const entries = ledger_entries(sites_by_id, state.visits, ledger.sort.value);
    ledger.summary.textContent =
      `${entries.length} of ${sites.length.toLocaleString("en-AU")} sites visited`;
    if (entries.length === 0) {
      const li = document.createElement("li");
      li.className = "ledger-empty";
      li.textContent = `Nothing recorded yet. ${HOVER_MODE ? "Click" : "Tap"} a site on the map twice to stamp it.`;
      ledger.rows.replaceChildren(li);
      return;
    }
    ledger.rows.replaceChildren(...entries.map(({ site, date }) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.id = site.id;
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("viewBox", "-15 -15 30 30");
      icon.dataset.icon = site.cat;
      icon.dataset.mode = "open";
      icon.setAttribute("aria-hidden", "true");
      const text = document.createElement("span");
      const name = document.createElement("span");
      name.textContent = site.name;
      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = `${site.states.join(", ")} · ${CATEGORY_NAMES[site.cat]} · inscribed ${site.year}`;
      text.append(name, meta);
      const when = document.createElement("span");
      when.className = "date";
      when.textContent = format_stamp_date(date);
      b.append(icon, text, when);
      li.append(b);
      return li;
    }));
    fill_key_icons(ledger.rows);
  }

  function flash(button, label) {
    const original = button.dataset.label ??= button.textContent;
    button.textContent = label;
    button.classList.add("done");
    setTimeout(() => {
      button.textContent = original;
      button.classList.remove("done");
    }, 1600);
  }

  async function copy_text(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      // NotAllowedError or no clipboard API (file://, older WebKit): select-and-copy instead
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      ledger.dialog.append(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    }
  }

  el("ledger_open").addEventListener("click", () => {
    render_ledger();
    prepare_card();
    ledger.dialog.showModal();
  });
  el("ledger_close").addEventListener("click", () => ledger.dialog.close());
  // a click on the backdrop lands on the dialog element itself
  ledger.dialog.addEventListener("click", (ev) => { if (ev.target === ledger.dialog) ledger.dialog.close(); });
  ledger.sort.addEventListener("change", () => {
    save_sort(ledger.sort.value);
    render_ledger();
  });
  ledger.rows.addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-id]");
    if (!b) return;
    const s = sites_by_id.get(Number(b.dataset.id));
    ledger.dialog.close();
    select_site(s.id);
    focus_site(s);
  });
  ledger.copy.addEventListener("click", async () => {
    const entries = ledger_entries(sites_by_id, state.visits, ledger.sort.value);
    const ok = await copy_text(ledger_text(entries, sites.length));
    flash(ledger.copy, ok ? "Copied" : "Copy failed");
  });
  const list_by_cat = { C: 0, N: 0, M: 0 };
  for (const s of sites) list_by_cat[s.cat] += 1;

  function card_summary() {
    const t = tally(sites_by_id, state.visits);
    return {
      count: t.count,
      total: sites.length,
      pct: ((100 * t.count) / sites.length).toFixed(1),
      countries: t.states,
      by_cat: t.by_cat,
      list_by_cat: list_by_cat,
      recent: ledger_entries(sites_by_id, state.visits, "recent").map((e) => short_name(e.site.name)),
    };
  }

  const make_card = (generic = false) => render_card({
    sites, visits: state.visits, land: geo_by_res["110m"].land, summary: card_summary(), generic,
  });

  // The card is drawn ahead of time. Safari opens the share sheet only from
  // inside the tap itself, and awaiting fonts and PNG encoding first spends
  // that tap, so the share quietly fails.
  const prepared = { key: null, file: null, url: null, job: null };
  const visits_key = () => Object.keys(state.visits).sort().join(",");

  function prepare_card() {
    const key = visits_key();
    if (prepared.key === key) return prepared.job;
    prepared.key = key;
    prepared.file = null;
    prepared.job = (async () => {
      const blob = await canvas_png(await make_card());
      if (prepared.key !== key) return null; // visits changed mid-render; a newer job owns it
      prepared.file = new File([blob], "world-heritage-register.png", { type: "image/png" });
      if (prepared.url) URL.revokeObjectURL(prepared.url);
      prepared.url = URL.createObjectURL(blob);
      ledger.preview.src = prepared.url;
      return prepared.file;
    })();
    return prepared.job;
  }

  const ready_card = () => (prepared.key === visits_key() ? prepared.file : null);

  function share_line() {
    const s = card_summary();
    return brag_line(s.count, s.total, s.countries);
  }

  // Share: image and words together through the phone's share sheet. With a
  // file attached the link rides inside the text, because several iOS targets
  // drop a separate url. No share sheet: the line and link go to the clipboard.
  ledger.share.addEventListener("click", () => {
    const line = share_line();
    if (typeof navigator.share !== "function") {
      // no share sheet (most desktops): the words and link only. Paste targets
      // there take an image or text, rarely both well; Save card covers the image.
      copy_text(`${line} ${SITE_URL}`).then((ok) => flash(ledger.share, ok ? "Copied" : "Copy failed"));
      return;
    }
    const file = ready_card();
    const data = file && navigator.canShare?.({ files: [file] })
      ? { files: [file], text: `${line} ${SITE_URL}` }
      : { text: line, url: SITE_URL };
    if (!file) prepare_card(); // the next tap will carry the image
    navigator.share(data).catch(async (err) => {
      if (err.name === "AbortError") return; // viewer closed the share sheet
      const ok = await copy_text(`${line} ${SITE_URL}`);
      flash(ledger.share, ok ? "Link copied" : "Share failed");
    });
  });

  ledger.card.addEventListener("click", async () => {
    const file = ready_card() ?? (await prepare_card());
    if (!file) return;
    const a = document.createElement("a");
    a.href = prepared.url;
    a.download = file.name;
    a.click();
    flash(ledger.card, "Saved");
  });

  // used by scripts/make_og_card.sh to render the static link-preview image
  window.WHR = { card_data_url: async (generic = true) => (await make_card(generic)).toDataURL("image/png") };

  function paint_count(n) {
    const digits = String(n).padStart(4, "0");
    const lead = digits.length - String(n).length;
    const count_el = el("tally_count");
    count_el.replaceChildren();
    for (let i = 0; i < digits.length; i++) {
      const span = document.createElement("span");
      if (i < lead) span.className = "zero";
      span.textContent = digits[i];
      count_el.append(span);
    }
  }

  let roll_frame = null;
  function roll_counter(target) {
    cancelAnimationFrame(roll_frame);
    const from = state.shown_count;
    if (REDUCED_MOTION || from === target) {
      state.shown_count = target;
      paint_count(target);
      return;
    }
    const start = performance.now();
    const dur = Math.min(900, 220 + 40 * Math.abs(target - from));
    const step = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const n = Math.round(from + (target - from) * d3.easeCubicOut(p));
      paint_count(n);
      state.shown_count = n;
      if (p < 1) roll_frame = requestAnimationFrame(step);
    };
    roll_frame = requestAnimationFrame(step);
  }

  // --- docket ---
  function render_docket({ thunk = false } = {}) {
    const s = state.selected_id != null ? sites_by_id.get(state.selected_id) : null;
    // both states share one grid cell and swap visibility, so the docket's
    // height (and therefore the map's) never changes on selection
    docket.empty.classList.toggle("is-off", !!s);
    docket.site.classList.toggle("is-off", !s);
    if (!s) return;

    const visit_date = state.visits[s.id];
    docket.ref.textContent = String(s.id).padStart(4, "0");
    docket.cat.textContent = CATEGORY_NAMES[s.cat];
    docket.year.textContent = s.year;
    docket.danger_row.hidden = !s.danger;
    docket.name.textContent = s.name;
    docket.states.textContent = s.states.join(", ");
    docket.link.href = `https://whc.unesco.org/en/list/${s.id}`;

    fit_marquee(docket.name.parentElement);
    fit_marquee(docket.states.parentElement);

    docket.toggle.setAttribute("aria-pressed", String(!!visit_date));
    const narrow = window.matchMedia("(max-width: 640px)").matches;
    docket.toggle_label.textContent = visit_date
      ? (narrow ? `Visited · ${verb()} to strike` : `Visited · ${verb()} to strike from register`)
      : HOVER_MODE ? (narrow ? "Click the site to record" : "Not yet visited · click the site to record")
        : narrow ? "Tap again to record" : "Not yet visited · tap again to record";

    docket.stamp.hidden = !visit_date;
    if (visit_date) {
      docket.stamp_date.textContent = format_stamp_date(visit_date);
      docket.stamp.classList.remove("thunk");
      if (thunk) {
        void docket.stamp.offsetWidth; // restart the animation
        docket.stamp.classList.add("thunk");
      }
    }
  }

  function select_site(id) {
    state.selected_id = id;
    render_docket();
    request_draw({ base: false });
  }

  // a quiet prompt at round numbers; it never moves the layout
  const MILESTONES = new Set([1, 5, 10, 25, 50, 75]);
  let nudge_timer = null;
  function maybe_nudge(count) {
    if (!MILESTONES.has(count) && count % 100 !== 0) return;
    el("nudge_text").textContent = count === 1 ? "First site stamped." : `${count} sites stamped.`;
    const nudge = el("nudge");
    nudge.hidden = false;
    clearTimeout(nudge_timer);
    nudge_timer = setTimeout(() => { nudge.hidden = true; }, 7000);
  }

  function toggle_visit(id) {
    const visits = { ...state.visits };
    const now_visited = !visits[id];
    if (now_visited) visits[id] = today_iso();
    else delete visits[id];
    state.visits = visits;
    save_visits(visits);
    render_docket({ thunk: now_visited });
    render_tally();
    request_draw({ base: false });
    sync_list(id);
    if (now_visited) maybe_nudge(Object.keys(visits).length);
    when_idle(prepare_card); // keep a fresh card ready for the share sheet
  }

  // --- zoom & tap ---
  const zoom = d3.zoom()
    .scaleExtent([1, 60])
    // d3 only listens for touch when the browser advertises it; emulators and
    // some hybrids fire touch events without advertising, and drags died silently
    .touchable(true)
    // plain interpolation: d3's default fly-to zooms out mid-pan, which lurches
    .interpolate(d3.interpolate)
    .on("start", () => { state.gesturing = true; })
    .on("zoom", (ev) => {
      state.transform = ev.transform;
      request_draw();
    })
    .on("end", () => {
      state.gesturing = false;
      request_draw();
    });

  surface.call(zoom).on("dblclick.zoom", null); // double-tap is a register action, not a zoom

  function nearest_site(mx, my) {
    const t = state.transform;
    let best = null, best_d2 = HIT_RADIUS_PX ** 2;
    for (const s of sites) {
      const [sx, sy] = screen_xy(s);
      const dx = sx - mx, dy = sy - my;
      const d2 = dx * dx + dy * dy;
      // the current selection gets a little gravity so the second tap lands on it
      const bias = s.id === state.selected_id ? 0.6 : 1;
      if (d2 * bias < best_d2) { best = s; best_d2 = d2 * bias; }
    }
    return best;
  }

  surface.on("click", (ev) => {
    const [mx, my] = d3.pointer(ev);
    const hit = nearest_site(mx, my);
    if (!hit) return;
    if (HOVER_MODE) {
      // hover already filed it; a click is always the stamp
      if (hit.id !== state.selected_id) select_site(hit.id);
      toggle_visit(hit.id);
    } else if (hit.id === state.selected_id) {
      toggle_visit(hit.id);
    } else {
      select_site(hit.id);
    }
  });

  function set_hover_mode(on) {
    if (HOVER_MODE === on) return;
    HOVER_MODE = on;
    docket.empty.textContent = on ? EMPTY_COPY.hover : EMPTY_COPY.tap;
    render_docket();
  }

  // a finger means tap-then-tap-again; this runs before the click it starts
  surface.on("pointerdown.mode", (ev) => {
    if (ev.pointerType !== "mouse") set_hover_mode(false);
  });

  {
    // hit-test at most once a frame; leaving a site keeps the docket filled
    // so its button stays reachable
    let hover_point = null;
    surface.on("pointermove", (ev) => {
      if (ev.pointerType !== "mouse" || ev.buttons) return; // touch, pen, or mid-drag
      set_hover_mode(true);
      const first = hover_point === null;
      hover_point = d3.pointer(ev);
      if (!first) return;
      requestAnimationFrame(() => {
        const hit = nearest_site(...hover_point);
        hover_point = null;
        surface.classed("over-site", !!hit);
        if (hit && hit.id !== state.selected_id) select_site(hit.id);
      });
    });
  }

  function focus_site(s) {
    // the target is computed when the transition starts, from the projection as it is then
    // Move as little as possible: a site already comfortably in view at a
    // readable zoom stays put; otherwise pan to it, zooming in only if far out.
    const target = () => {
      const now = state.transform;
      const [sx, sy] = screen_xy(s);
      const m = 0.18;
      const in_view = sx > state.width * m && sx < state.width * (1 - m)
        && sy > state.height * m && sy < state.height * (1 - m);
      if (in_view && now.k >= FOCUS_ZOOM) return now;
      const k = Math.max(now.k, FOCUS_ZOOM);
      return d3.zoomIdentity
        .translate(state.width / 2 - s.px * k, state.height / 2 - s.py * k)
        .scale(k);
    };
    // unnamed on purpose: d3-zoom interrupts unnamed transitions when a drag starts
    const run = ++focus_runs;
    state.focusing = s;
    surface.transition()
      .duration(REDUCED_MOTION ? 0 : 550)
      .ease(d3.easeCubicInOut)
      .call(zoom.transform, target)
      .on("end interrupt", () => { if (run === focus_runs) state.focusing = null; });
  }
  let focus_runs = 0;

  el("zoom_in").addEventListener("click", () => surface.transition().duration(250).call(zoom.scaleBy, 2));
  el("zoom_out").addEventListener("click", () => surface.transition().duration(250).call(zoom.scaleBy, 0.5));
  el("zoom_reset").addEventListener("click", () => surface.transition().duration(400).call(zoom.transform, d3.zoomIdentity));

  docket.toggle.addEventListener("click", () => {
    if (state.selected_id != null) toggle_visit(state.selected_id);
  });

  // --- search ---
  const search_input = el("site_search");
  const results_el = el("search_results");
  search_input.placeholder = `Search ${sites.length.toLocaleString("en-AU")} sites or countries`;

  function render_results() {
    const q = search_input.value;
    const hits = search_sites(sites, q);
    results_el.replaceChildren();
    if (q.trim().length < 2) { results_el.hidden = true; return; }
    if (hits.length === 0) {
      const li = document.createElement("li");
      li.className = "none";
      li.textContent = "No site on the register matches.";
      results_el.append(li);
    }
    for (const s of hits) {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      const name = document.createElement("span");
      name.textContent = s.name;
      const meta = document.createElement("small");
      meta.textContent = `${s.states.join(", ")} · ${s.year}`;
      const tick = document.createElement("span");
      tick.className = "tick";
      tick.textContent = state.visits[s.id] ? "✓" : "";
      b.append(name, tick, meta);
      b.addEventListener("click", () => {
        results_el.hidden = true;
        search_input.value = "";
        select_site(s.id);
        focus_site(s);
      });
      li.append(b);
      results_el.append(li);
    }
    results_el.hidden = false;
  }

  search_input.addEventListener("input", render_results);
  search_input.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") { search_input.value = ""; results_el.hidden = true; }
    if (ev.key === "Enter") results_el.querySelector("button")?.click();
    if (ev.key === "ArrowUp" || ev.key === "ArrowDown") {
      // list opens upward, so ArrowUp walks into it
      results_el.querySelector("button")?.focus();
      ev.preventDefault();
    }
  });
  results_el.addEventListener("keydown", (ev) => {
    const buttons = [...results_el.querySelectorAll("button")];
    const i = buttons.indexOf(document.activeElement);
    if (ev.key === "ArrowDown") { (buttons[i + 1] || search_input).focus(); ev.preventDefault(); }
    if (ev.key === "ArrowUp" && i > 0) { buttons[i - 1].focus(); ev.preventDefault(); }
    if (ev.key === "Escape") { results_el.hidden = true; search_input.focus(); }
  });
  document.addEventListener("click", (ev) => {
    if (!ev.target.closest(".search")) results_el.hidden = true;
  });

  new ResizeObserver(() => {
    fit_marquee(docket.name.parentElement);
    fit_marquee(docket.states.parentElement);
  }).observe(docket.site);

  el("nudge_share").addEventListener("click", () => {
    el("nudge").hidden = true;
    el("ledger_open").click();
  });

  // --- list view: every site by country, for stamping in bulk ---
  const list = {
    view: el("list_view"),
    body: el("list_body"),
    filter: el("list_filter"),
    shown: el("list_shown"),
    group: el("list_group"),
    show: el("list_show"),
    built: false,
    groups: [],
    prefs: load_list_prefs(),
  };
  list.group.value = LIST_GROUPINGS[list.prefs.group] ? list.prefs.group : "country";
  list.show.value = ["all", "todo", "done"].includes(list.prefs.show) ? list.prefs.show : "all";

  function country_count(group) {
    return group.sites.reduce((n, s) => n + (state.visits[s.id] ? 1 : 0), 0);
  }

  function paint_country_head(section, group) {
    const n = country_count(group);
    section.querySelector(".count").textContent = `${n} of ${group.sites.length}`;
    section.querySelector(".rule i").style.width = `${(100 * n) / group.sites.length}%`;
  }

  function build_list() {
    const svg_ns = "http://www.w3.org/2000/svg";
    const frag = document.createDocumentFragment();
    list.groups = group_sites(sites, list.group.value);
    list.groups.forEach((group, index) => {
      const section = document.createElement("section");
      section.className = "country";
      section.dataset.key = fold(group.label);
      section.dataset.index = index;
      const head = document.createElement("h3");
      head.className = "country-head";
      head.innerHTML = '<span class="label"></span><span class="count"></span><span class="rule"><i></i></span>';
      head.querySelector(".label").textContent = group.label;
      const ul = document.createElement("ul");
      for (const s of group.sites) {
        const li = document.createElement("li");
        li.dataset.search = s.search_name;
        li.dataset.id = s.id;
        const row = document.createElement("label");
        row.className = "site-row";
        const box = document.createElement("input");
        box.type = "checkbox";
        box.dataset.id = s.id;
        box.checked = !!state.visits[s.id];
        const icon = document.createElementNS(svg_ns, "svg");
        icon.setAttribute("viewBox", "-15 -15 30 30");
        icon.setAttribute("aria-hidden", "true");
        icon.dataset.icon = s.cat;
        icon.dataset.mode = s.danger ? "danger" : "open";
        const nm = document.createElement("span");
        nm.className = "nm";
        nm.textContent = s.name;
        const yr = document.createElement("span");
        yr.className = "yr";
        yr.textContent = s.year;
        row.append(box, icon, nm, yr);
        const show = document.createElement("button");
        show.type = "button";
        show.className = "show-on-map";
        show.dataset.show = s.id;
        show.setAttribute("aria-label", `Show ${s.name} on the map`);
        show.textContent = "↗\uFE0E";
        li.append(row, show);
        ul.append(li);
      }
      section.append(head, ul);
      paint_country_head(section, group);
      frag.append(section);
    });
    list.body.replaceChildren(frag);
    fill_key_icons(list.body);
    list.built = true;
    apply_list_filter();
  }

  // keep every copy of a site's row (and its groups' counts) in step. Rows are
  // not re-filtered here: under "Not yet visited" a ticked row stays put until
  // the filter changes, so the list never shifts under a thumb mid-stamp.
  function sync_list(id) {
    if (!list.built) return;
    for (const box of list.body.querySelectorAll(`input[data-id="${id}"]`)) {
      box.checked = !!state.visits[id];
      const section = box.closest(".country");
      paint_country_head(section, list.groups[Number(section.dataset.index)]);
    }
  }

  function apply_list_filter() {
    const q = fold(list.filter.value.trim());
    const show = list.show.value;
    let shown = 0;
    for (const section of list.body.querySelectorAll(".country")) {
      // a group's own name matches too: "peru", "africa", "natural", "1990s"
      const group_hit = !q || section.dataset.key.includes(q);
      let any = false;
      for (const li of section.querySelectorAll("li")) {
        const visited = !!state.visits[li.dataset.id];
        const wanted = show === "all" || (show === "done") === visited;
        const hit = wanted && (group_hit || li.dataset.search.includes(q));
        li.hidden = !hit;
        if (hit) { any = true; shown += 1; }
      }
      section.hidden = !any;
    }
    const filtered = q || show !== "all";
    list.shown.textContent = filtered ? `${shown} shown` : `${sites.length.toLocaleString("en-AU")} sites`;
    if (!shown) list.shown.textContent = "Nothing matches";
  }

  function remember_list_prefs() {
    list.prefs = { group: list.group.value, show: list.show.value };
    save_list_prefs(list.prefs);
  }
  list.group.addEventListener("change", () => {
    remember_list_prefs();
    build_list();
    list.body.scrollTop = 0;
  });
  list.show.addEventListener("change", () => {
    remember_list_prefs();
    apply_list_filter();
  });

  function set_view(view) {
    const is_list = view === "list";
    if (is_list && !list.built) build_list();
    map_el.classList.toggle("is-list", is_list);
    list.view.hidden = !is_list;
    el("view_map").setAttribute("aria-selected", String(!is_list));
    el("view_list").setAttribute("aria-selected", String(is_list));
    save_view(view);
  }

  el("view_map").addEventListener("click", () => set_view("map"));
  el("view_list").addEventListener("click", () => set_view("list"));
  list.filter.addEventListener("input", () => requestAnimationFrame(apply_list_filter));

  // one tap stamps: select it (so the docket shows the record) then toggle
  list.body.addEventListener("change", (ev) => {
    const box = ev.target.closest("input[data-id]");
    if (!box) return;
    const id = Number(box.dataset.id);
    select_site(id);
    toggle_visit(id);
  });
  list.body.addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-show]");
    if (!b) return;
    const s = sites_by_id.get(Number(b.dataset.show));
    set_view("map");
    select_site(s.id);
    focus_site(s);
  });

  if (load_view() === "list") set_view("list");

  // --- disclaimer note ---
  const notice = el("notice");
  document.querySelectorAll("[data-notice]").forEach((b) => b.addEventListener("click", () => notice.showModal()));
  el("notice_close").addEventListener("click", () => notice.close());
  notice.addEventListener("click", (ev) => { if (ev.target === notice) notice.close(); });

  // --- boot ---
  new ResizeObserver(layout).observe(map_el);
  layout();

  // open on the viewer's own region, set at once (no animation on arrival)
  const home = home_view(Intl.DateTimeFormat().resolvedOptions().timeZone ?? "");
  if (home) {
    const [hx, hy] = projection(home.centre);
    surface.call(zoom.transform, d3.zoomIdentity
      .translate(state.width / 2 - hx * home.k, state.height / 2 - hy * home.k)
      .scale(home.k));
  }

  render_tally();
  render_docket();
  when_idle(prepare_card);
}

main();
