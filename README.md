# Linked Jazz 2026 — Transcript Reader

Static, client-side reader for the jazz oral-history transcripts behind the
[people network](https://github.com/thisismattmiller/linked-jazz-2026-network).
Live at **https://thisismattmiller.github.io/linked-jazz-2026-transcripts/**

- `/` — searchable directory of every transcript
- `/?t=<docid>` — read one transcript (speaker-attributed turns, page markers)
- `/?t=<docid>#b<page>-<block>` — deep link that highlights and scrolls to one
  block — this is what the network visualization's evidence pane links to
- every transcript header links back to the **original source** (the item's
  permalink at Tulane / Hamilton / Smithsonian, or the collection page for
  Rutgers IJS, which has no per-item URLs)

## How it works

No build step on the site itself: `site/data/t_<fnv1a64(docid)>.json` holds one
slim transcript each (metadata + `{speaker, text}` blocks), and the reader
hashes `?t=<docid>` client-side with the same FNV-1a 64 function to fetch it —
no lookup table needed. `site/data/index.json` powers the directory.

## Rebuilding the data

The data is generated from the (private) `ch-jazz-mashup` corpus repo:

```bash
uv run python build_transcripts.py --corpus ~/git/ch-jazz-mashup
```

## Deploy

Pushing to `main` publishes `site/` to GitHub Pages via
`.github/workflows/deploy.yml` (one-time setup: repo Settings → Pages →
Source = "GitHub Actions").
