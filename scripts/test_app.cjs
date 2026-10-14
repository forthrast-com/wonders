// Exercise the app's pure helpers and storage boundary without starting the map.
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { test } = require("node:test");

const context = vm.createContext({
  window: { matchMedia: () => ({ matches: false }) },
  console: { warn() {} },
  localStorage: { setItem() {} },
  Path2D: class {},
});
const source = readFileSync(join(__dirname, "../app.js"), "utf8");
vm.runInContext(source.replace(/\nmain\(\);\s*$/, "\n"), context);
const { parse_site, fold, search_sites, ledger_text, save_visits, aliases } = vm.runInContext(
  "({ parse_site, fold, search_sites, ledger_text, save_visits, aliases: SEARCH_ALIASES })", context,
);
const rows = JSON.parse(readFileSync(join(__dirname, "../data/sites.json"), "utf8"));
const sites = rows.map(parse_site).map(site => ({
  ...site,
  search_name: fold(site.name),
  search_states: fold(site.states.join(" ")),
  search_aliases: (aliases[site.id] || []).map(fold),
}));

test("ordinary punctuation, missing apostrophes and a former name find K’gari", () => {
  for (const query of ["K'gari", "K’gari", "Kgari", "  KʼGARI  ", "Fraser", "Fraser Island"]) {
    assert.equal(search_sites(sites, query)[0]?.id, 630, query);
  }
});

test("search retains accents, boundaries, relevance and empty-query behaviour", () => {
  assert.equal(fold("Djémila"), fold("Djemila"));
  assert.equal(fold("Uluru–Kata Tjuta"), fold("Uluru-Kata Tjuta"));
  assert.equal(search_sites(sites, "Sydney")[0]?.id, 166);
  assert.equal(search_sites(sites, "Australia").length, 8);
  for (const query of ["", "'’", "—", "a", "Atlantis"]) {
    assert.equal(search_sites(sites, query).length, 0, query);
  }
});

test("copied lists include the count, dated entry and a public return link", () => {
  const site = sites.find(site => site.id === 166);
  const text = ledger_text([{ site, date: "2026-10-14" }], sites.length);
  assert.match(text, /1 of 1,273 sites visited/);
  assert.match(text, /2026-10-14  Sydney Opera House \(Australia\)/);
  assert.ok(text.endsWith("https://wonders.forthrast.com"));
  assert.ok(ledger_text([], sites.length).endsWith("https://wonders.forthrast.com"));
});

test("saving reports failure so the UI never claims a blocked write succeeded", () => {
  let stored;
  context.localStorage.setItem = (key, value) => { stored = { key, value }; };
  assert.equal(save_visits({ 166: "2026-10-14" }), true);
  assert.equal(stored.key, "whr.register.v1");
  assert.deepEqual(JSON.parse(stored.value), { v: 1, visits: { 166: "2026-10-14" } });
  context.localStorage.setItem = () => { throw new Error("storage blocked"); };
  assert.equal(save_visits({}), false);
});
