# World Heritage Register

> [!WARNING]
> **This was made with AI.** The site, its code, data pipeline, design and this
> README were produced almost entirely by **Claude Opus 5.5**, an AI model made by
> Anthropic, working under human direction. Nothing here was written line-by-line
> by a person. Site data comes from UNESCO's open data portal, but the code and
> wording may contain mistakes; check a site's official UNESCO file before relying
> on anything shown.

Live at **https://wonders.forthrast.com**.

A personal register of UNESCO World Heritage sites. Tap a site on the map to
file it in the docket; tap it again to stamp it visited. Visits live in the
browser's `localStorage` (key `whr.register.v1`), so there's no backend, and each
browser keeps its own register.

Static files only: `index.html`, `style.css`, `app.js`, `data/`. d3 loads from
cdnjs; the font from Google Fonts.

## Run locally

```sh
nix develop
python3 -m http.server 8000   # the page fetches data/*.json, so file:// won't do
```

## Deploy to GitHub Pages

Push to a repo, then *Settings → Pages → Deploy from a branch → `main` / root*.
For a custom subdomain, add a `CNAME` file containing e.g. `register.example.com`
and point a DNS `CNAME` record at `<user>.github.io`.

## Rebuild the data

```sh
bash scripts/fetch_raw.sh        # UNESCO open data export + Natural Earth 110m and 50m
python3 scripts/build_data.py    # → data/sites.json, data/world.json
```

The UNESCO list comes from `data.unesco.org` (dataset `whc001`) because
`whc.unesco.org` sits behind a Cloudflare challenge. One site ships with no
coordinates at all; `COORD_OVERRIDES` in `build_data.py` places it.
