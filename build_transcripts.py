#!/usr/bin/env python3
"""Build the static transcript-reader data from the Linked Jazz mashup database.

Reads linked_jazz.sqlite (the audited corpus: documents, pages, blocks, topic
segments, segment tags, people, story-cluster ids) and writes into site/data/:

  t_<fnv1a64(docid)>.json   one slim transcript: metadata + pages of
                            speaker-attributed blocks + its segment list
                            (titles and block ranges, no text)
  seg/<segment_id>.json     one topic segment with its full text, facets,
                            people and interview header — what a search
                            interface fetches to show a result in full
  index.json                the browsable directory

Block coordinates: every block carries its corpus page index `p` and block
index `b` (0-based, the same (page, block) pair the database, the network
evidence and the segments use), and the reader builds its #b<p>-<b> anchors
from them. Blocks with no text are not emitted but their indices are not
reused, so anchors never drift.

Usage:
  uv run python build_transcripts.py [--db ~/git/ch-jazz-mashup/linked_jazz.sqlite]
"""
import argparse, json, os, shutil, sqlite3, time
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "site" / "data"
SEG = DATA / "seg"
READER = "https://semlab.io/linked-jazz-transcripts/"

INST = {
    "tulane": ("Tulane — Hogan Jazz Archive", "https://jazz.tulane.edu/"),
    "hamilton": ("Hamilton College — Fillius Jazz Archive",
                 "https://litsdigital.hamilton.edu/collections/fillius-jazz-archive"),
    "si": ("Smithsonian Jazz Oral History Program",
           "https://americanhistory.si.edu/explore/projects/smithsonian-jazz/oral-history-program"),
    "rutgers": ("Rutgers — Institute of Jazz Studies",
                "https://www.libraries.rutgers.edu/collections/institute-jazz-studies"),
}
SKIP_TYPES = {"removed_duplicate"}        # text blanked in the corpus: same recording kept elsewhere


def fnv1a64(s):
    h = 0xCBF29CE484222325
    for byte in s.encode("utf-8"):
        h ^= byte
        h = (h * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return f"{h:016x}"


def dumps(o):
    return json.dumps(o, ensure_ascii=False, separators=(",", ":"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.path.expanduser("~/git/ch-jazz-mashup/linked_jazz.sqlite"))
    args = ap.parse_args()
    con = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    t0 = time.time()

    # fresh output: stale hashes from removed docs must not linger
    if DATA.exists():
        shutil.rmtree(DATA)
    SEG.mkdir(parents=True)

    tags = defaultdict(lambda: {"places": [], "venues": [], "bands": []})
    KIND = {"place": "places", "venue": "venues", "band": "bands"}
    for r in con.execute("SELECT segment_id, kind, name_canonical, qualifier, parent, focus "
                         "FROM segment_tags ORDER BY segment_id, focus DESC, tag_id"):
        t = {"name": r["name_canonical"], "focus": r["focus"]}
        if r["kind"] == "place":
            t["type"] = r["qualifier"]
            if r["parent"]:
                t["in"] = r["parent"]
        elif r["kind"] == "venue":
            t["city"] = r["qualifier"]
        else:
            t["leader"] = r["qualifier"]
        lst = tags[r["segment_id"]][KIND[r["kind"]]]
        if all(x["name"] != t["name"] for x in lst):
            lst.append(t)
    people = defaultdict(list)
    for r in con.execute("SELECT segment_id, person, qid, mentions FROM v_segment_people "
                         "ORDER BY segment_id, mentions DESC"):
        people[r["segment_id"]].append({"name": r["person"], "qid": r["qid"], "n": r["mentions"]})
    story = {}
    for r in con.execute("SELECT segment_id, level, cluster_id, member FROM segment_story_clusters "
                         "WHERE level IN ('theme','community')"):
        story.setdefault(r["segment_id"], {})[r["level"]] = r["cluster_id"]
        if r["level"] == "community":
            story[r["segment_id"]]["core"] = r["member"] == "core"
    story_names = {(r["level"], r["cluster_id"]): r["name"] for r in con.execute(
        "SELECT level, cluster_id, name FROM story_clusters")}

    index, n_docs, n_blocks, n_segs, total = [], 0, 0, 0, 0
    docs = con.execute("SELECT * FROM documents ORDER BY collection, doc_id").fetchall()
    for d in docs:
        docid = d["doc_id"]
        pages = {r["page"]: r["page_label"] or "" for r in con.execute(
            "SELECT page, page_label FROM pages WHERE doc_id=? ORDER BY page", (docid,))}
        by_page = defaultdict(list)
        blk_text = {}
        for r in con.execute("SELECT page, block, type, speaker, text FROM blocks WHERE doc_id=? "
                             "ORDER BY page, block", (docid,)):
            txt = (r["text"] or "").strip()
            if not txt or r["type"] in SKIP_TYPES:
                continue
            b = {"b": r["block"], "s": r["speaker"] or "", "x": txt}
            by_page[r["page"]].append(b)
            blk_text[(r["page"], r["block"])] = b
        if not blk_text:
            continue
        page_list = [{"p": p, "label": pages.get(p, ""), "blocks": by_page[p]}
                     for p in sorted(by_page)]
        segs = con.execute("SELECT * FROM segments WHERE doc_id=? ORDER BY ord", (docid,)).fetchall()
        inst, inst_url = INST[d["collection"]]
        head = {"id": docid, "title": d["title"] or docid, "collection": d["collection"],
                "inst": inst, "inst_url": inst_url,
                "interviewee": d["interviewee"] or "", "interviewer": d["interviewer"] or "",
                "date": d["date"] or "", "year": d["year"] or "", "source_url": d["source_url"] or ""}
        seg_meta = []
        for i, s in enumerate(segs):
            sid = s["segment_id"]
            seg_meta.append({"id": sid, "ord": s["ord"], "chapter": s["chapter"], "title": s["title"],
                             "category": s["category"], "summary": s["summary"], "period": s["period"],
                             "sp": s["start_page"], "sb": s["start_block"],
                             "ep": s["end_page"], "eb": s["end_block"], "words": s["words"]})
            blocks = [{"p": p, **b} for (p, bb), b in sorted(blk_text.items())
                      if (s["start_page"], s["start_block"]) <= (p, bb) <= (s["end_page"], s["end_block"])]
            st = story.get(sid, {})
            seg = {"id": sid, "ord": s["ord"], "n_segments": len(segs),
                   "prev": segs[i - 1]["segment_id"] if i else None,
                   "next": segs[i + 1]["segment_id"] if i + 1 < len(segs) else None,
                   "doc": {**{k: head[k] for k in ("id", "title", "collection", "inst", "interviewee",
                                                   "interviewer", "date", "year", "source_url")},
                           "url": f"{READER}?t={docid}"},
                   "chapter": s["chapter"], "title": s["title"], "category": s["category"],
                   "summary": s["summary"], "period": s["period"],
                   "year_from": s["year_from"], "year_to": s["year_to"], "words": s["words"],
                   "start": [s["start_page"], s["start_block"]], "end": [s["end_page"], s["end_block"]],
                   "url": f"{READER}?t={docid}#s{sid}",
                   "tags": tags.get(sid, {"places": [], "venues": [], "bands": []}),
                   "people": people.get(sid, []),
                   "story": ({"theme": st.get("theme"), "theme_name": story_names.get(("theme", st.get("theme"))),
                              "community": st.get("community"),
                              "community_name": story_names.get(("community", st.get("community"))),
                              "core": st.get("core")} if st else None),
                   "blocks": blocks}
            out = dumps(seg)
            (SEG / f"{sid}.json").write_text(out)
            total += len(out.encode()); n_segs += 1
        doc = {**head, "pages": page_list, "segments": seg_meta}
        out = dumps(doc)
        (DATA / f"t_{fnv1a64(docid)}.json").write_text(out)
        total += len(out.encode()); n_docs += 1; n_blocks += len(blk_text)
        index.append({"id": docid, "t": doc["title"], "iv": doc["interviewee"], "y": doc["year"],
                      "c": d["collection"], "n": len(blk_text), "ns": len(segs)})

    index.sort(key=lambda r: (r["t"] or "").lower())
    (DATA / "index.json").write_text(dumps(index))
    print(f"{n_docs:,} transcripts · {n_blocks:,} blocks · {n_segs:,} segments · "
          f"{total/1e6:.0f} MB in {DATA}  [{time.time()-t0:.0f}s]")


if __name__ == "__main__":
    main()
