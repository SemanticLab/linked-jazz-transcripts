/* Transcript reader — fully static, client-side.
   ?t=<docid>       load one transcript (fetched as data/t_<fnv1a64(docid)>.json)
   #b<page>-<block> highlight + scroll to that block (linked from the network viz);
                    page/block are the corpus coordinates carried in the data (p, b)
   #s<segment_id>   highlight + scroll to one topic segment (linked from segment search)
   no ?t            searchable directory of all transcripts (data/index.json); ?q= pre-fills it
   data/seg/<segment_id>.json holds each segment in full for other interfaces   */
"use strict";

const app = document.getElementById("app");
const hsearch = document.getElementById("hsearch");
const NETWORK_URL = "https://thisismattmiller.github.io/linked-jazz-2026-network/";
const ICON_SEARCH = `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 3.75a5.25 5.25 0 1 1 0 10.5 5.25 5.25 0 0 1 0-10.5Zm3.75 9 3.5 3.5"/></svg>`;
const ICON_OUT = `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4H4.75A.75.75 0 0 0 4 4.75v10.5c0 .414.336.75.75.75h10.5a.75.75 0 0 0 .75-.75V12M11.5 4H16v4.5M16 4l-7 7"/></svg>`;

function fnv1a64(s) {                       // matches the Python build script
  let h = 0xCBF29CE484222325n;
  const bytes = new TextEncoder().encode(s);
  for (const b of bytes) {
    h ^= BigInt(b);
    h = (h * 0x100000001B3n) & 0xFFFFFFFFFFFFFFFFn;
  }
  return h.toString(16).padStart(16, "0");
}

const norm = (s) => String(s ?? "").toLowerCase().replace(/["“”]/g, "");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const COLL = { tulane: "Tulane", hamilton: "Hamilton", si: "Smithsonian", rutgers: "Rutgers IJS" };
const COLL_LONG = {
  tulane: "Tulane, Hogan Jazz Archive", hamilton: "Hamilton College, Fillius Jazz Archive",
  si: "Smithsonian", rutgers: "Rutgers, Institute of Jazz Studies",
};

// ---------------------------------------------------------------- theme
(function theme() {
  const btn = document.getElementById("theme");
  const root = document.documentElement;
  const isDark = () => root.getAttribute("data-theme") === "dark" ||
    (!root.getAttribute("data-theme") && matchMedia("(prefers-color-scheme: dark)").matches);
  const paint = () => {
    const d = isDark();
    btn.textContent = d ? "Light theme" : "Dark theme";
    btn.setAttribute("aria-pressed", String(d));
  };
  btn.addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("lj-theme", next); } catch (e) { /* private mode */ }
    paint();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paint);
  paint();
})();

// a page marker as the source numbers it: "-10-" and "(291)" (Rutgers) or "10" (Smithsonian)
// become "Page 10"; anything else (a Tulane scan name such as "1452_01") is shown as is
function pageLabel(label) {
  const m = String(label).trim().match(/^[-(\s]*(\d+)[-)\s]*$/);
  return m ? `Page ${m[1]}` : String(label).trim();
}

// ---------------------------------------------------------------- reader
async function showDoc(docid) {
  hsearch.hidden = false;
  document.title = "Loading… — Linked Jazz";
  let d;
  try {
    const r = await fetch(`data/t_${fnv1a64(docid)}.json`);
    if (!r.ok) throw new Error(r.status);
    d = await r.json();
  } catch (e) {
    app.innerHTML = `<div class="col"><p class="status error">This transcript could not be loaded: there is no
      transcript with the id <code>${esc(docid)}</code>.</p>
      <p><a class="lj-btn" href="./">Back to all transcripts</a></p></div>`;
    return;
  }
  document.title = `${d.title} — Linked Jazz`;

  const ivn = (d.interviewee || "").toLowerCase();
  const irn = (d.interviewer || "").toLowerCase();
  const initials = (s) => {                 // "A.B. Spellman" -> ["abs", "as"]
    const w = (s || "").replace(/[^A-Za-z\s]/g, " ").split(/\s+/).filter(Boolean).map((x) => x[0].toLowerCase());
    return w.length < 2 ? [] : [w.join(""), w[0] + w[w.length - 1]];
  };
  const ivi = initials(d.interviewee), iri = initials(d.interviewer);
  const roleOf = (s) => {
    const n = (s || "").toLowerCase().replace(/[.:\s]+$/, "");
    if (!n) return "";
    if (n === "interviewee" || (ivn && (n === ivn || ivn.includes(n) || n.includes(ivn)))) return "iv";
    if (n === "interviewer" || (irn && (n === irn || irn.includes(n) || n.includes(irn)))) return "ir";
    const k = n.replace(/[^a-z]/g, "");
    if (k.length >= 2 && k.length <= 3) {          // "AS", "A.B.S.", "MR" — initials
      if (ivi.includes(k)) return "iv";
      if (iri.includes(k)) return "ir";
    }
    return "";
  };

  const H = [];
  H.push(`<div class="reader"><header class="page-head">
    <p class="label">${esc(COLL_LONG[d.collection] || COLL[d.collection] || d.collection)}</p>
    <h1>${esc(d.title)}</h1>
    <ul class="meta">
      ${d.interviewee ? `<li>Interviewee <b>${esc(d.interviewee)}</b></li>` : ""}
      ${d.interviewer ? `<li>Interviewer <b>${esc(d.interviewer)}</b></li>` : ""}
      ${d.date || d.year ? `<li>Recorded <b>${esc(d.date || d.year)}</b></li>` : ""}
      ${d.segments?.length ? `<li><b>${d.segments.length.toLocaleString()}</b> topic segments</li>` : ""}
    </ul>
    <div class="actions">
      ${d.source_url
        ? `<a class="lj-btn lj-btn-sm" href="${esc(d.source_url)}" target="_blank" rel="noopener">View the original at ${esc(d.inst)}${ICON_OUT}</a>`
        : `<a class="lj-btn lj-btn-sm" href="${esc(d.inst_url)}" target="_blank" rel="noopener">${esc(d.inst)}${ICON_OUT}</a>`}
      <a href="${NETWORK_URL}">See the people network</a>
      <button class="lj-btn lj-btn-sm seg-toggle" type="button" id="segtoggle" aria-pressed="true">Segment labels</button>
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
    if (pg.label) H.push(`<div class="pagesep"><span>${esc(pageLabel(pg.label))}</span></div>`);
    pg.blocks.forEach((b, bi) => {
      const bb = b.b ?? bi, key = `${p}-${bb}`, sg = segStart.get(key);
      if (sg) H.push(`<div class="seghead" id="s${sg.id}">
        <p class="segtitle">${esc(sg.title || "")}${sg.period && !(sg.title || "").includes(sg.period) ? `<span class="segper">${esc(sg.period)}</span>` : ""}</p></div>`);
      H.push(`<div class="turn ${roleOf(b.s)}" id="b${key}" data-seg="${segOf.get(key) ?? ""}">
        <div class="spk">${esc(b.s)}</div><p class="tx">${esc(b.x)}</p></div>`);
    });
  });
  H.push(`</div>`);
  app.innerHTML = H.join("");

  // auto-generated segment labels can be switched off; the choice is remembered
  const reader = app.querySelector(".reader"), segBtn = document.getElementById("segtoggle");
  let segOn = true;
  try { segOn = localStorage.getItem("lj-segment-labels") !== "off"; } catch (e) { /* private mode */ }
  const paintSeg = () => {
    reader.classList.toggle("no-seg", !segOn);
    segBtn.setAttribute("aria-pressed", String(segOn));
    segBtn.textContent = segOn ? "Hide segment labels" : "Show segment labels";
  };
  segBtn.addEventListener("click", () => {
    segOn = !segOn;
    try { localStorage.setItem("lj-segment-labels", segOn ? "on" : "off"); } catch (e) { /* private mode */ }
    paintSeg();
  });
  paintSeg();

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
    if (head) { head.classList.add("hl"); if (!segOn) { segOn = true; paintSeg(); } head.scrollIntoView({ block: "start" }); }
  }
}

// ---------------------------------------------------------------- directory
async function showIndex(initialQuery) {
  hsearch.hidden = true;                    // the large field sits in the page here
  document.title = "Oral histories — Linked Jazz";
  let idx;
  try {
    idx = await (await fetch("data/index.json")).json();
  } catch (e) {
    app.innerHTML = `<div class="col"><p class="status error">The list of transcripts could not be loaded. Reload the page to try again.</p></div>`;
    return;
  }
  const collections = Object.keys(COLL).filter((c) => idx.some((r) => r.c === c));
  app.innerHTML = `<div class="col">
    <header class="page-head">
      <p class="label">Linked Jazz</p>
      <h1>Oral histories</h1>
      <p class="lede">${idx.length.toLocaleString()} interview transcripts from the Hogan Jazz Archive at Tulane,
        the Fillius Jazz Archive at Hamilton College, the Smithsonian, and the Institute of Jazz Studies at Rutgers.
        Every passage is linked from the <a href="${NETWORK_URL}">people network</a>.</p>
    </header>
    <form class="lj-search dir-search" role="search" onsubmit="return false">
      ${ICON_SEARCH}
      <input id="q" type="search" name="q" placeholder="Search by name, title or year" aria-label="Search the transcripts"
             autocomplete="off" spellcheck="false" value="${esc(initialQuery || "")}" autofocus>
    </form>
    <div class="filters" role="group" aria-label="Collection">
      <button class="lj-rel" type="button" data-c="" aria-pressed="true">All <span>${idx.length.toLocaleString()}</span></button>
      ${collections.map((c) => `<button class="lj-rel" type="button" data-c="${c}" aria-pressed="false">${esc(COLL[c])}
        <span>${idx.filter((r) => r.c === c).length.toLocaleString()}</span></button>`).join("")}
      <span class="count caption" id="count" aria-live="polite"></span>
    </div>
    <ol class="rows" id="list"></ol></div>`;
  const q = document.getElementById("q"), list = document.getElementById("list"),
        count = document.getElementById("count"), filters = document.querySelector(".filters");
  let coll = "";

  const row = (r) => `<li class="row">
      <span class="y">${esc(r.y || "")}</span>
      <a class="t" href="?t=${encodeURIComponent(r.id)}">${esc(r.t)}
        ${r.iv && !norm(r.t).includes(norm(r.iv)) ? `<span class="sub">${esc(r.iv)}</span>` : ""}</a>
      <span class="c">${esc(COLL[r.c] || r.c)}</span></li>`;

  function render() {
    const needle = q.value.trim().toLowerCase();
    let hits = coll ? idx.filter((r) => r.c === coll) : idx;
    if (needle) hits = hits.filter((r) => (r.t + " " + r.iv + " " + r.y + " " + r.c).toLowerCase().includes(needle));
    count.textContent = needle || coll
      ? `${hits.length.toLocaleString()} ${hits.length === 1 ? "transcript" : "transcripts"}` : "";
    list.innerHTML = hits.slice(0, 400).map(row).join("") +
      (hits.length > 400 ? `<li class="row more"><span class="y"></span><span>${(hits.length - 400).toLocaleString()} more are not shown. Narrow the search to see them.</span></li>` : "") +
      (hits.length === 0 ? `<li class="row more"><span class="y"></span><span>No transcript matches. Try a shorter name or a year.</span></li>` : "");
  }
  q.addEventListener("input", render);
  filters.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-c]");
    if (!b) return;
    coll = b.dataset.c;
    filters.querySelectorAll("button[data-c]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    render();
  });
  render();
}

const params = new URLSearchParams(location.search);
if (params.get("t")) showDoc(params.get("t"));
else showIndex(params.get("q") || "");
