"""Slim the raw UNESCO + Natural Earth downloads into what the page ships.

Inputs (gitignored, fetch with scripts/fetch_raw.sh):
  data/raw_whc001.json                                  UNESCO open data export
  data/raw_ne_{110m,50m}_land.geojson                          Natural Earth land
  data/raw_ne_{110m,50m}_admin_0_boundary_lines_land.geojson   Natural Earth borders

Outputs:
  data/sites.json   [[id, name, states, cat, year, lat, lon, danger, region], ...]
  data/world.json   {"110m"|"50m": {"land": GeoJSON geometry[], "borders": GeoJSON geometry[]}}
"""

import html
import json
import re
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"

CATEGORY_CODES = {"Cultural": "C", "Natural": "N", "Mixed": "M"}
FIRST_COMPONENT = re.compile(r"latitude:\s*(-?[\d.]+),\s*longitude:\s*(-?[\d.]+)")

# Sites the export ships with neither a centroid nor components, placed by hand.
COORD_OVERRIDES = {
    # Funerary and memory sites of WWI (Western Front): ~139 components from
    # Ypres to Verdun; Arras sits roughly mid-line.
    1567: (50.29, 2.78),
}

# 2dp is ~1km at the equator: plenty for a world map, and halves the payload.
COORD_DP = 2


def site_coords(raw: dict) -> tuple[float, float]:
    if int(raw["id_no"]) in COORD_OVERRIDES:
        return COORD_OVERRIDES[int(raw["id_no"])]
    coords = raw.get("coordinates")
    if isinstance(coords, dict):
        return coords["lat"], coords["lon"]
    # serial properties without a centroid: fall back to their first component
    match = FIRST_COMPONENT.search(raw.get("components_list") or "")
    if not match:
        raise ValueError(f"site {raw['id_no']} has no coordinates at all")
    return float(match.group(1)), float(match.group(2))


def state_names(raw: dict) -> list[str]:
    states = raw["states_names"]
    return json.loads(states) if isinstance(states, str) else states


def slim_site(raw: dict) -> list:
    lat, lon = site_coords(raw)
    return [
        int(raw["id_no"]),
        html.unescape(raw["name_en"]).strip(),
        state_names(raw),
        CATEGORY_CODES[raw["category"]],
        int(raw["date_inscribed"]),
        round(lat, 4),
        round(lon, 4),
        1 if raw["danger"] == "True" else 0,
        raw["region"],
    ]


def round_coords(node):
    if isinstance(node, float):
        return round(node, COORD_DP)
    if isinstance(node, list):
        return [round_coords(n) for n in node]
    return node


def slim_geometries(path: Path) -> list[dict]:
    features = json.loads(path.read_text())["features"]
    return [
        {"type": f["geometry"]["type"], "coordinates": round_coords(f["geometry"]["coordinates"])}
        for f in features
    ]


def main() -> int:
    raw_sites = json.loads((DATA / "raw_whc001.json").read_text())
    sites = sorted((slim_site(s) for s in raw_sites), key=lambda s: s[0])

    ids = [s[0] for s in sites]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate id_no in UNESCO export")

    # coarse for the zoomed-out world, fine once the viewer zooms in
    world = {
        res: {
            "land": slim_geometries(DATA / f"raw_ne_{res}_land.geojson"),
            "borders": slim_geometries(DATA / f"raw_ne_{res}_admin_0_boundary_lines_land.geojson"),
        }
        for res in ("110m", "50m")
    }

    (DATA / "sites.json").write_text(json.dumps(sites, ensure_ascii=False, separators=(",", ":")))
    (DATA / "world.json").write_text(json.dumps(world, separators=(",", ":")))

    by_cat = {c: sum(1 for s in sites if s[3] == c) for c in CATEGORY_CODES.values()}
    print(f"{len(sites)} sites {by_cat}, " + ", ".join(f"{r}: {len(w['land'])} land / {len(w['borders'])} borders" for r, w in world.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
