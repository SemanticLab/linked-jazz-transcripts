/* Transcript reader — fully static, client-side.
   ?t=<docid>       load one transcript (fetched as data/t_<fnv1a64(docid)>.json)
   #b<page>-<block> highlight + scroll to that block (linked from the network viz);
                    page/block are the corpus coordinates carried in the data (p, b)
   #s<segment_id>   highlight + scroll to one topic segment (linked from segment search)
   no ?t            searchable directory of all transcripts (data/index.json)
   data/seg/<segment_id>.json holds each segment in full for other interfaces   */
"use strict";

const app = document.getElementById("app");
const topbar = document.getElementById("topbar");
const NETWORK_URL = "https://thisismattmiller.github.io/linked-jazz-2026-network/";

function fnv1a64(s) {                       // matches the Python build script
  let h = 0xCBF29CE484222325n;
  const bytes = new TextEncoder().encode(s);
  for (const b of bytes) {
    h ^= BigInt(b);
    h = (h * 0x100000001B3n) & 0xFFFFFFFFFFFFFFFFn;
  }
  return h.toString(16).padStart(16, "0");
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const COLL = { tulane: "Tulane", hamilton: "Hamilton", si: "Smithsonian", rutgers: "Rutgers IJS" };

// ---------------------------------------------------------------- reader
async function showDoc(docid) {
  topbar.style.display = "block";
  document.title = "loading… — Transcript Reader";
  let d;
  try {
    const r = await fetch(`data/t_${fnv1a64(docid)}.json`);
    if (!r.ok) throw new Error(r.status);
    d = await r.json();
  } catch (e) {
    app.innerHTML = `<p>Could not load transcript <code>${esc(docid)}</code>.
      <a href="./">Back to all transcripts</a></p>`;
    return;
  }
  document.title = `${d.title} — Transcript Reader`;

  const ivn = (d.interviewee || "").toLowerCase();
  const irn = (d.interviewer || "").toLowerCase();
  const roleOf = (s) => {
    const n = (s || "").toLowerCase();
    if (!n) return "";
    if (n === "interviewee" || (ivn && (n === ivn || ivn.includes(n) || n.includes(ivn)))) return "iv";
    if (n === "interviewer" || (irn && (n === irn || irn.includes(n) || n.includes(irn)))) return "ir";
    return "";
  };

  const H = [];
  H.push(`<header class="doc">
    <div class="crumbs"><span class="badge">${esc(COLL[d.collection] || d.collection)}</span></div>
    <h1>${esc(d.title)}</h1>
    <div class="meta">
      ${d.interviewee ? `<span>interviewee <b>${esc(d.interviewee)}</b></span>` : ""}
      ${d.interviewer ? `<span>interviewer <b>${esc(d.interviewer)}</b></span>` : ""}
      ${d.date || d.year ? `<span>date <b>${esc(d.date || d.year)}</b></span>` : ""}
    </div>
    <div class="srclink">
      ${d.source_url
        ? `<a href="${esc(d.source_url)}" target="_blank" rel="noopener">view the original at ${esc(d.inst)} ↗</a>`
        : `<a href="${esc(d.inst_url)}" target="_blank" rel="noopener">${esc(d.inst)} ↗</a>`}
      &nbsp;·&nbsp; <a href="${NETWORK_URL}" target="_blank" rel="noopener">people network ↗</a>
    </div>
  </header>`);

  // segment headings keyed by their first block; each block learns its segment
  const segStart = new Map(), segOf = new Map();
  (d.segments || []).forEach((sg) => {
    segStart.set(`${sg.sp}-${sg.sb}`, sg);
    for (let p = sg.sp; p <= sg.ep; p++) {
      const pg = d.pages.find((x) => (x.p ?? d.pages.indexOf(x)) === p);
      if (!pg) continue;
      pg.blocks.forEach((b, bi) => {
        const bb = b.b ?? bi;
        if ((p > sg.sp || bb >= sg.sb) && (p < sg.ep || bb <= sg.eb)) segOf.set(`${p}-${bb}`, sg.id);
      });
    }
  });

  d.pages.forEach((pg, pi) => {
    const p = pg.p ?? pi;
    if (pg.label) H.push(`<div class="pagesep">${esc(pg.label)}</div>`);
    pg.blocks.forEach((b, bi) => {
      const bb = b.b ?? bi, key = `${p}-${bb}`, sg = segStart.get(key);
      if (sg) H.push(`<div class="seghead" id="s${sg.id}">
        <span class="segchap">${esc(sg.chapter || "")}</span><span class="segtitle">${esc(sg.title || "")}</span>
        ${sg.period ? `<span class="segper">${esc(sg.period)}</span>` : ""}</div>`);
      H.push(`<div class="turn ${roleOf(b.s)}" id="b${key}" data-seg="${segOf.get(key) ?? ""}">
        <div class="spk">${esc(b.s)}</div><div class="tx">${esc(b.x)}</div></div>`);
    });
  });
  app.innerHTML = H.join("");

  const m = location.hash.match(/^#(b\d+-\d+)$/);
  if (m) {
    const el = document.getElementById(m[1]);
    if (el) {
      el.classList.add("hl");
      el.scrollIntoView({ block: "center" });
    }
  }
  const ms = location.hash.match(/^#s(\d+)$/);
  if (ms) {
    const head = document.getElementById(`s${ms[1]}`);
    document.querySelectorAll(`.turn[data-seg="${ms[1]}"]`).forEach((el) => el.classList.add("hlseg"));
    if (head) { head.classList.add("hl"); head.scrollIntoView({ block: "start" }); }
  }
}

// ---------------------------------------------------------------- directory
async function showIndex() {
  document.title = "Jazz Oral Histories — Transcript Reader";
  let idx;
  try {
    idx = await (await fetch("data/index.json")).json();
  } catch (e) {
    app.innerHTML = "<p>Could not load the transcript index.</p>";
    return;
  }
  app.innerHTML = `
    <header class="doc">
      <h1>Jazz Oral Histories — Transcript Reader</h1>
      <div class="meta"><span>${idx.length.toLocaleString()} interview transcripts from
        Tulane (Hogan Jazz Archive), Hamilton College (Fillius), the Smithsonian,
        and Rutgers (Institute of Jazz Studies)</span></div>
      <div class="srclink"><a href="${NETWORK_URL}" target="_blank" rel="noopener">explore the people network ↗</a></div>
    </header>
    <input id="q" type="search" placeholder="search by name, title, year…" autofocus>
    <div id="count"></div><div id="list"></div>`;
  const q = document.getElementById("q"), list = document.getElementById("list"),
        count = document.getElementById("count");

  const row = (r) => `<div class="row">
      <span class="y">${esc(r.y || "")}</span>
      <a href="?t=${encodeURIComponent(r.id)}">${esc(r.t)}</a>
      <span class="c badge">${esc(COLL[r.c] || r.c)}</span></div>`;

  function render() {
    const needle = q.value.trim().toLowerCase();
    const hits = needle
      ? idx.filter((r) => (r.t + " " + r.iv + " " + r.y + " " + r.c).toLowerCase().includes(needle))
      : idx;
    count.textContent = needle ? `${hits.length.toLocaleString()} matches` : "";
    list.innerHTML = hits.slice(0, 400).map(row).join("") +
      (hits.length > 400 ? `<div class="row"><span class="y"></span>… ${(hits.length - 400).toLocaleString()} more — refine the search</div>` : "");
  }
  q.addEventListener("input", render);
  render();
}

const params = new URLSearchParams(location.search);
if (params.get("t")) showDoc(params.get("t"));
else showIndex();
