# World Heritage Register

> [!WARNING]
> **This was made with AI.** The site, its code, data pipeline, design and this
> README were produced almost entirely by **Claude Opus 5.5**, an AI model made by
> Anthropic, working under human direction. Nothing here was written line-by-line
> by a person. Site data comes from UNESCO's open data portal, but the code and
> wording may contain mistakes; check a site's official UNESCO file before relying
> on anything shown.
>
> **Not affiliated with or endorsed by UNESCO.** It's an independent personal
> project that uses UNESCO's openly published list of World Heritage sites.

Live at **https://wonders.forthrast.com**.

A personal register of UNESCO World Heritage sites. Tap a site on the map to
file it in the docket; tap it again to stamp it visited. Visits live in the
browser's `localStorage` (key `whr.register.v1`), so there's no backend, and each
browser keeps its own register.

Static files only: `index.html`, `style.css`, `app.js`, `data/`. d3 loads from
cdnjs; the font from Google Fonts.

## Saving

Your register lives only in your browser (`localStorage`). There is no
backend and no account.

If saving across devices is ever added, it will be through the
[AT Protocol](https://atproto.com) only: signing in with your Bluesky (or other
atproto) identity and writing your register to your own repository on your own
PDS. That's a deliberate choice: your record should belong to you, on an open
protocol, rather than to this site or to any company's database. No other sync
backend will be added.

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

## Link-preview image

`og-card.png` is drawn by the page's own share-card renderer. After design
changes, serve the site locally and run `bash scripts/make_og_card.sh http://localhost:8000/`.
