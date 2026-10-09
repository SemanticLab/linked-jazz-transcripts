# Linked Jazz 2026 — Transcript Reader

Static, client-side reader for the jazz oral-history transcripts behind the
[people network](https://github.com/thisismattmiller/linked-jazz-2026-network).
Live at **https://thisismattmiller.github.io/linked-jazz-2026-transcripts/**

- `/` — searchable directory of every transcript
- `/?t=<docid>` — read one transcript (speaker-attributed turns, page markers)
- `/?t=<docid>#b<page>-<block>` — deep link that highlights and scrolls to one
  block — this is what the network visualization's evidence pane links to.
  `page`/`block` are the corpus coordinates (0-based) used by the database and
  the evidence store; the data carries them explicitly (`p`, `b`), so blocks
  with no text can be omitted without shifting anchors
- `/?t=<docid>#s<segment_id>` — highlights one topic segment (its heading and
  every block in it) — this is what segment search links to
- topic segments are shown as headings inside each transcript (chapter · title · period)
- every transcript header links back to the **original source** (the item's
  permalink at Tulane / Hamilton / Smithsonian, or the collection page for
  Rutgers IJS, which has no per-item URLs)

## Look and feel

The UI follows the Linked Jazz design system (Libre Franklin for the
interface, Newsreader for the voices, one blue, paper and ink; dark theme via
`data-theme="dark"` or system preference). `site/tokens.css` carries the
system's tokens, `site/lj.css` is its component stylesheet verbatim, and
`site/site.css` composes the two pages from them; the mark is
`site/assets/linked-jazz-mark.png`.

## How it works

No build step on the site itself: `site/data/t_<fnv1a64(docid)>.json` holds one
slim transcript each (metadata + pages of `{p, b, s, x}` blocks + the list of
its segments with block ranges), and the reader hashes `?t=<docid>`
client-side with the same FNV-1a 64 function to fetch it — no lookup table
needed. `site/data/index.json` powers the directory.

## Segment JSON (for other interfaces)

`site/data/seg/<segment_id>.json` — one file per topic segment (61,357), with
everything a search result needs to show the passage in full, same origin as
the reader so a sibling site can fetch it without CORS trouble:

```
{ id, ord, n_segments, prev, next,          // position in the interview + neighbours
  doc: { id, title, collection, inst, interviewee, interviewer, date, year, source_url, url },
  chapter, title, category, summary, period, year_from, year_to, words,
  start: [page, block], end: [page, block], url,          // url = reader deep link (#s<id>)
  tags: { places: [{name, type, in?, focus}], venues: [{name, city, focus}], bands: [{name, leader, focus}] },
  people: [{name, qid, n}],
  story: { theme, theme_name, community, community_name, core } | null,
  blocks: [{p, b, s, x}, …] }                             // the full text, speaker-attributed
```

Segment ids are those of `linked_jazz.sqlite` (`segments.segment_id`) and of
the segment-search API (`~/git/linked-jazz-segments`), built from the same DB.

## Rebuilding the data

Everything is generated from the mashup database (the audited corpus):

```bash
uv run python build_transcripts.py --db ~/git/ch-jazz-mashup/linked_jazz.sqlite
```

It wipes `site/data/` first (stale hashes of removed documents must not
linger). 2026-10-08: 1,314 transcripts · 588,629 blocks · 61,357 segments ·
444 MB (304 MB of it segment files).

## Deploy

Pushing to `main` publishes `site/` to GitHub Pages via
`.github/workflows/deploy.yml` (one-time setup: repo Settings → Pages →
Source = "GitHub Actions").
