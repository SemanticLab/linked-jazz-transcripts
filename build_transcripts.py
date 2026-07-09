#!/usr/bin/env python3
"""Build the static transcript-reader data from the ch-jazz-mashup corpus.

For every interview transcript across the four collections, emit a slim JSON
(metadata + speaker-attributed blocks) into site/data/, named by the FNV-1a
64-bit hash of the doc id — the same hash the reader (and the network viewer's
evidence store) computes client-side, so ?t=<docid> resolves with no lookup
table. Also emits site/data/index.json for the browsable directory.

Usage:
  uv run python build_transcripts.py [--corpus ~/git/ch-jazz-mashup]
"""
import argparse, glob, json, os
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE = HERE / "site"
DATA = SITE / "data"

COLLECTIONS = [
    ("tulane", "tulane/data/json", "Tulane — Hogan Jazz Archive",
     "https://jazz.tulane.edu/"),
    ("hamilton", "hamilton/data/json", "Hamilton College — Fillius Jazz Archive",
     "https://litsdigital.hamilton.edu/collections/fillius-jazz-archive"),
    ("si", "si/data/json", "Smithsonian Jazz Oral History Program",
     "https://americanhistory.si.edu/explore/projects/smithsonian-jazz/oral-history-program"),
    ("rutgers", "rutgers/data/ocr_json", "Rutgers — Institute of Jazz Studies",
     "https://www.libraries.rutgers.edu/collections/institute-jazz-studies"),
]


def fnv1a64(s):
    h = 0xCBF29CE484222325
    for byte in s.encode("utf-8"):
        h ^= byte
        h = (h * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return f"{h:016x}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", default=os.path.expanduser("~/git/ch-jazz-mashup"))
    args = ap.parse_args()
    corpus = Path(os.path.expanduser(args.corpus))

    DATA.mkdir(parents=True, exist_ok=True)
    index = []
    n_docs, n_blocks, total_bytes = 0, 0, 0

    for coll, rel, inst_label, inst_url in COLLECTIONS:
        for p in sorted(glob.glob(str(corpus / rel / "*.json"))):
            b = os.path.basename(p)
            if "manifest" in b or "Placeholder" in b:
                continue
            d = json.load(open(p))
            if not isinstance(d, dict) or not d.get("pages"):
                continue
            docid = d.get("id") or b
            pages = []
            blocks = 0
            for pg in d["pages"]:
                pb = [{"s": blk.get("speaker") or "", "x": blk.get("text") or ""}
                      for blk in (pg.get("blocks") or []) if (blk.get("text") or "").strip()]
                if pb:
                    pages.append({"label": pg.get("page_label") or "", "blocks": pb})
                    blocks += len(pb)
            if not blocks:
                continue
            doc = {
                "id": docid,
                "title": d.get("title") or docid,
                "collection": coll,
                "inst": inst_label,
                "inst_url": inst_url,
                "interviewee": (d.get("interviewee") or "").strip(),
                "interviewer": (d.get("interviewer") or "").strip(),
                "date": d.get("date") or "",
                "year": d.get("year") or "",
                "source_url": d.get("source_url") or "",
                "pages": pages,
            }
            out = json.dumps(doc, ensure_ascii=False, separators=(",", ":"))
            (DATA / f"t_{fnv1a64(docid)}.json").write_text(out)
            total_bytes += len(out.encode())
            n_docs += 1
            n_blocks += blocks
            index.append({"id": docid, "t": doc["title"], "iv": doc["interviewee"],
                          "y": doc["year"], "c": coll, "n": blocks})

    index.sort(key=lambda r: (r["t"] or "").lower())
    (DATA / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, separators=(",", ":")))
    print(f"{n_docs:,} transcripts · {n_blocks:,} blocks · "
          f"{total_bytes/1e6:.0f} MB in {DATA}")


if __name__ == "__main__":
    main()
