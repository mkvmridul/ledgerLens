// Builds presentation/LedgerLens.pptx. Six slides: title, problem, architecture, demo, numbers, backup rubric map.
// 16:9, 10in x 5.625in. Safe fonts only (Cambria titles, Calibri body, Courier New for identifiers).
const pptxgen = require("pptxgenjs");
const path = require("path");

const OUT = process.argv[2] || path.join(__dirname, "LedgerLens.pptx");

const C = {
  navy: "0F1E3C", navy2: "18294F", white: "FFFFFF", ice: "CFE0F7", muted: "5B6270", line: "E3E6EB", bg: "F6F7F9",
  green: "1A7F4B", greenTint: "E3F5EA", greenBright: "5CCB8A",
  coral: "C6432E", coralTint: "FBE9E7", amber: "8A5A00", amberTint: "FFF3D6", ink: "14171F",
};
const F = { title: "Cambria", body: "Calibri", mono: "Courier New" };

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.author = "LedgerLens";
pres.title = "LedgerLens · Forge the Future 2026";

// ---------------------------------------------------------------- helpers
const text = (slide, str, o) => slide.addText(str, { isTextBox: true, fontFace: F.body, color: C.ink, margin: 0, valign: "top", ...o });
const box = (slide, x, y, w, h, o = {}) => slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: C.white }, line: { color: C.line, width: 1 }, ...o });
const chip = (slide, str, x, y, w, o = {}) => {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 0.3, rectRadius: 0.06, fill: { color: o.fill || C.greenTint }, line: { color: o.border || C.green, width: 0.75 } });
  text(slide, str, { x, y, w, h: 0.3, fontFace: F.mono, fontSize: o.fontSize || 10.5, color: o.color || C.green, align: "center", valign: "middle", bold: true });
};
const arrow = (slide, x1, y, x2) => slide.addShape(pres.shapes.LINE, { x: x1, y, w: x2 - x1, h: 0, line: { color: C.green, width: 2, endArrowType: "triangle" } });
const title = (slide, str, o = {}) => text(slide, str, { x: 0.5, y: 0.4, w: 9, h: 0.7, fontFace: F.title, fontSize: 32, bold: true, color: o.color || C.navy, ...o });
const footer = (slide, str, color = C.muted) => text(slide, str, { x: 0.5, y: 5.2, w: 9, h: 0.3, fontSize: 10, color });
const bullets = (slide, items, o) =>
  slide.addText(
    items.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < items.length - 1 } })),
    { isTextBox: true, fontFace: F.body, fontSize: 13, color: C.ink, margin: 0, valign: "top", paraSpaceAfter: 5, ...o },
  );

// ================================================================ 1. title (dark)
{
  const s = pres.addSlide();
  s.background = { color: C.navy };
  text(s, "LedgerLens", { x: 0.6, y: 1.1, w: 5.2, h: 0.9, fontFace: F.title, fontSize: 48, bold: true, color: C.white });
  text(s, "Explainable reconciliation-break investigation for lending and payments operations, built on Elastic Agent Builder.", { x: 0.6, y: 2.05, w: 4.9, h: 0.9, fontSize: 15, color: C.ice });
  text(s, "The model explains.\nES|QL decides.\nEvery number is traceable.", { x: 0.6, y: 3.1, w: 4.9, h: 1.3, fontFace: F.title, fontSize: 21, bold: true, color: C.greenBright, lineSpacingMultiple: 1.15 });

  // the motif: a report card with traced chips
  box(s, 5.9, 1.1, 3.6, 3.35, { fill: { color: C.white }, line: { color: C.navy2, width: 0 }, shadow: { type: "outer", blur: 8, offset: 3, angle: 90, color: "000000", opacity: 0.35 } });
  text(s, "DSB-20260916-00297 · MISSING_CREDIT", { x: 6.1, y: 1.25, w: 3.2, h: 0.35, fontFace: F.mono, fontSize: 10.5, bold: true, color: C.navy });
  text(s, "Rule fired  R1: ledger success present, settlement rows = 0", { x: 6.1, y: 1.62, w: 3.2, h: 0.45, fontSize: 10, color: C.muted });
  text(s, "Ledger", { x: 6.1, y: 2.15, w: 1.0, h: 0.25, fontSize: 10, color: C.muted });
  chip(s, "₹51,500.00", 7.2, 2.12, 1.4);
  text(s, "Settled", { x: 6.1, y: 2.55, w: 1.0, h: 0.25, fontSize: 10, color: C.muted });
  chip(s, "₹0.00", 7.2, 2.52, 1.4);
  text(s, "Delta", { x: 6.1, y: 2.95, w: 1.0, h: 0.25, fontSize: 10, color: C.muted });
  chip(s, "₹51,500.00", 7.2, 2.92, 1.4, { fill: C.coralTint, border: C.coral, color: C.coral });
  text(s, "Failure point", { x: 6.1, y: 3.35, w: 1.1, h: 0.25, fontSize: 10, color: C.muted });
  chip(s, "psp.status-poll", 7.2, 3.32, 2.1, { fill: C.bg, border: C.muted, color: C.ink });
  s.addShape(pres.shapes.RECTANGLE, { x: 5.9, y: 3.85, w: 3.6, h: 0.6, fill: { color: C.greenTint }, line: { color: C.greenTint, width: 0 } });
  text(s, "12 / 12 figures and IDs traced to a tool result   ·   0 computed by the LLM", { x: 6.05, y: 3.85, w: 3.35, h: 0.6, fontSize: 10.5, bold: true, color: C.green, valign: "middle" });

  footer(s, "Forge the Future 2026 · Elastic × AWS · Track 4: Industry Vertical Demo (BFSI) · Mridul Mahajan, Backend Engineer, Lending", C.ice);
  s.addNotes("Open: Three systems must agree about money: the ledger, the bank's settlement file, and the pipeline that pushed the funds. When they disagree, an analyst spends thirty to sixty minutes per break, by hand. Say the line once, slowly.");
}

// ================================================================ 2. problem (white)
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  title(s, "Three systems must agree about every rupee", { fontSize: 27 });

  const cols = [
    ["Event-sourced ledger", "DISBURSAL_INITIATED → SUCCEEDED, amount, expected fee, UTR"],
    ["Partner settlement file", "PSP or bank rows: UTR, amount, fee charged, value date"],
    ["Disbursal pipeline traces", "psp.transfer → callback → status poll, with errors and retries"],
  ];
  cols.forEach(([h, d], i) => {
    const x = 0.5 + i * 3.1;
    box(s, x, 1.3, 2.8, 1.15, { fill: { color: C.bg } });
    text(s, h, { x: x + 0.15, y: 1.4, w: 2.5, h: 0.3, fontSize: 14, bold: true, color: C.navy });
    text(s, d, { x: x + 0.15, y: 1.72, w: 2.5, h: 0.65, fontSize: 11, color: C.muted });
  });
  // break marker between the boxes
  chip(s, "BREAK", 3.05, 2.6, 0.9, { fill: C.coralTint, border: C.coral, color: C.coral, fontSize: 10 });
  chip(s, "BREAK", 6.15, 2.6, 0.9, { fill: C.coralTint, border: C.coral, color: C.coral, fontSize: 10 });
  text(s, "A disbursal marked success with no credit in the bank file. A double debit. A fee mismatch. A late credit.", { x: 0.5, y: 2.6, w: 2.5, h: 0.6, fontSize: 10.5, color: C.muted, italic: true });

  text(s, "Today", { x: 0.5, y: 3.3, w: 4.3, h: 0.3, fontSize: 15, bold: true, color: C.coral });
  bullets(s, [
    "An analyst pulls entries from three systems by hand and writes the root cause",
    "30 to 60 minutes per break (my own estimate from production, not a benchmark)",
    "The queue does not clear on high-volume days",
    "Settlement cash tied up, refunds delayed, audit exposure",
  ], { x: 0.5, y: 3.65, w: 4.3, h: 1.5 });

  text(s, "Why current tools stop short", { x: 5.2, y: 3.3, w: 4.3, h: 0.3, fontSize: 15, bold: true, color: C.navy });
  bullets(s, [
    "Rules match or they do not. Then a human starts hunting",
    "Chat and RAG can explain, but nobody can sign off on a number a language model produced",
    "What is needed: computed figures, narrated reasoning, and an action behind a human",
  ], { x: 5.2, y: 3.65, w: 4.3, h: 1.5 });

  s.addNotes("Rules match or they don't. Chat can explain, but you can't sign off on a number a language model produced. LedgerLens splits the job: ES|QL computes every figure, the model only orders the investigation and explains. Then a workflow acts, behind a human.");
}

// ================================================================ 3. architecture (white)
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  title(s, "How it works", { w: 4 });
  text(s, "Elastic Cloud Serverless on AWS · Elastic Managed LLM or Amazon Bedrock via an inference endpoint · Kibana Cases", { x: 4.3, y: 0.55, w: 5.2, h: 0.5, fontSize: 10.5, color: C.muted, align: "right" });

  const stages = [
    ["Data", "Synthetic ledger, settlement rows and APM-shaped spans → 3 indices with strict mappings. Past cases in a semantic_text field.", C.bg, C.line],
    ["ES|QL tools", "match (STATS BY disbursal_id, no join) · delta + rule classify · evidence rows · trace failure point · hybrid precedent (FORK + FUSE)", C.greenTint, C.green],
    ["Agent Builder", "Orders the tools, reads results, writes the report. Never computes. Every run has a trace waterfall.", C.bg, C.line],
    ["Elastic Workflow", "Opens a case and writes an audit record. Runs only after a human types approve.", C.amberTint, C.amber],
    ["Ops console", "Break queue, report with every figure highlighted to its tool result, approve/dismiss, Sarvam Hindi and Kannada.", C.bg, C.line],
  ];
  const w = 1.72, gap = 0.1, y = 1.35, h = 2.35;
  stages.forEach(([h1, d, fill, border], i) => {
    const x = 0.5 + i * (w + gap);
    box(s, x, y, w, h, { fill: { color: fill }, line: { color: border, width: 1 } });
    text(s, h1, { x: x + 0.12, y: y + 0.12, w: w - 0.24, h: 0.35, fontSize: 13.5, bold: true, color: C.navy });
    text(s, d, { x: x + 0.12, y: y + 0.5, w: w - 0.24, h: h - 0.6, fontSize: 10, color: C.ink });
    if (i < stages.length - 1) arrow(s, x + w - 0.02, y + h / 2, x + w + gap + 0.02);
  });

  // principle callout
  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 3.95, w: 9, h: 0.75, fill: { color: C.navy }, line: { color: C.navy, width: 0 } });
  text(s, "Every figure the agent reports originates in an ES|QL result and is passed through verbatim. The LLM receives rows and emits prose. The console checks this live: each amount and ID in the report is matched back to the tool result it came from.", { x: 0.7, y: 3.95, w: 8.6, h: 0.75, fontSize: 11.5, color: C.white, valign: "middle" });

  text(s, "Search, in one sentence: identifiers are keyword and matched exactly; human descriptions are text plus semantic_text; precedent retrieval FORKs a BM25 branch and a semantic branch and FUSEs them with reciprocal rank fusion, in one ES|QL query.", { x: 0.5, y: 4.8, w: 9, h: 0.5, fontSize: 10.5, color: C.muted, italic: true });
  s.addNotes("Walk left to right, one sentence each. Land on hybrid search: precedent retrieval is one ES|QL query, a BM25 branch and a semantic branch fused with RRF. Exact IDs and fuzzy human descriptions in one search API. Elastic embeds at index and query time; there is no embedding code in the repo.");
}

// ================================================================ 4. demo (white)
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  title(s, "Live demo: one settlement day, ten breaks");
  const steps = [
    ["Match", "391 disbursals, ₹9.64 crore. One ES|QL STATS flags 10 breaks in 55 ms. No join, no application code."],
    ["Investigate", "DSB-20260916-00297: rule fired, exact figures, evidence rows with IDs, the failing span in the trace, a resolved precedent."],
    ["Prove", "The Agent Builder trace waterfall: five tool calls with their ES|QL and rows. The model wrote prose only."],
    ["Admit", "DSB-20260916-00112, UNRESOLVED: ₹1,000 short, clean pipeline, no rule matches. The agent lists what it ruled out and escalates."],
    ["Act", "Approve → an Elastic Workflow opens the case and writes the audit record. Then the same report in Hindi through Sarvam, re-checked."],
  ];
  steps.forEach(([h, d], i) => {
    const y = 1.3 + i * 0.74;
    s.addShape(pres.shapes.OVAL, { x: 0.5, y: y + 0.03, w: 0.42, h: 0.42, fill: { color: i === 3 ? C.coral : C.green }, line: { color: C.white, width: 0 } });
    text(s, String(i + 1), { x: 0.5, y: y + 0.03, w: 0.42, h: 0.42, fontSize: 14, bold: true, color: C.white, align: "center", valign: "middle" });
    text(s, h, { x: 1.05, y, w: 1.3, h: 0.5, fontSize: 14, bold: true, color: C.navy, valign: "middle" });
    text(s, d, { x: 2.3, y, w: 3.9, h: 0.6, fontSize: 10.5, color: C.ink, valign: "middle" });
  });

  // traceability panel mock
  box(s, 6.5, 1.3, 3.0, 3.6, { fill: { color: C.bg } });
  text(s, "Traceability check, live", { x: 6.7, y: 1.42, w: 2.6, h: 0.3, fontSize: 12, bold: true, color: C.navy });
  text(s, "12 / 12", { x: 6.7, y: 1.8, w: 2.6, h: 0.8, fontFace: F.title, fontSize: 44, bold: true, color: C.green });
  text(s, "figures and IDs in the report found verbatim in a tool result", { x: 6.7, y: 2.6, w: 2.6, h: 0.5, fontSize: 10.5, color: C.muted });
  chip(s, "₹51,500.00", 6.7, 3.2, 1.25);
  chip(s, "EVT-20260916-000594", 6.7, 3.6, 2.0);
  chip(s, "NRTH2026091656971611", 6.7, 4.0, 2.2);
  text(s, "Green: traced. Red would mean the model invented it.", { x: 6.7, y: 4.45, w: 2.6, h: 0.4, fontSize: 9.5, color: C.muted, italic: true });
  s.addNotes("Switch to the console at step 1. Keep this slide up only while the page loads. Talk track is in DEMO.md.");
}

// ================================================================ 5. numbers (dark)
{
  const s = pres.addSlide();
  s.background = { color: C.navy };
  title(s, "What we measured", { color: C.white });
  const tiles = [
    ["14 / 14", "seeded breaks detected across 3 days, 0 false positives", "npm run verify, against data/answer-key.json"],
    ["55 ms", "median ES|QL time to match 391 disbursals against the settlement file", "ES|QL took, BENCHMARKS.md, local ES 9.5.4"],
    ["100 %", "of figures and IDs traced to a tool result", "checked live on every report, shown as N / N"],
    ["0", "numbers computed by the LLM", "by construction; the checker would show red"],
  ];
  tiles.forEach(([big, label, src], i) => {
    const x = 0.5 + i * 2.275;
    box(s, x, 1.3, 2.15, 2.0, { fill: { color: C.navy2 }, line: { color: C.navy2, width: 0 } });
    text(s, big, { x: x + 0.15, y: 1.4, w: 1.9, h: 0.75, fontFace: F.title, fontSize: 34, bold: true, color: C.greenBright });
    text(s, label, { x: x + 0.15, y: 2.15, w: 1.9, h: 0.6, fontSize: 11, color: C.white });
    text(s, src, { x: x + 0.15, y: 2.8, w: 1.9, h: 0.45, fontSize: 9, color: C.ice, italic: true });
  });
  text(s, "Investigation time: seconds, measured on screen during the demo. Manual baseline: 30 to 60 minutes per break, my own estimate from operating this class of system in production, not a benchmark.", { x: 0.5, y: 3.45, w: 9, h: 0.45, fontSize: 11, color: C.ice });

  text(s, "Deliberately out of scope", { x: 0.5, y: 4.0, w: 4.3, h: 0.3, fontSize: 13, bold: true, color: C.white });
  bullets(s, ["Live bank or PSP connections: seeded data keeps results reproducible for judging", "Moving funds: every write stays behind human approval"], { x: 0.5, y: 4.32, w: 4.3, h: 0.85, fontSize: 11, color: C.ice });
  text(s, "What production needs", { x: 5.2, y: 4.0, w: 4.3, h: 0.3, fontSize: 13, bold: true, color: C.white });
  bullets(s, ["Real APM instrumentation (the ES|QL is already ECS-shaped) and S3 → Lambda ingest of partner files", "Bedrock inference endpoint under the bank's AWS account, RBAC on the workflow, reversal workflows behind a second approval"], { x: 5.2, y: 4.32, w: 4.3, h: 0.85, fontSize: 11, color: C.ice });
  footer(s, "The model explains. ES|QL decides. Every number is traceable.", C.greenBright);
  s.addNotes("Read the four tiles. Say where each number came from. Then the two columns. Stop talking.");
}

// ================================================================ 6. backup: rubric map (white)
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  title(s, "Backup: capabilities used, mapped to the rubric", { fontSize: 26 });
  const rows = [
    ["Capability", "How LedgerLens uses it", "Rubric"],
    ["Elasticsearch mappings", "3 indices, dynamic: strict, keyword for every identifier and code, integer paise, text only for narration", "Elasticsearch integration"],
    ["ES|QL", "Match is one STATS ... BY disbursal_id over a unified index; classification is a CASE rule table; every tool is a parameterised query", "Technical implementation"],
    ["Hybrid search", "FORK a BM25 branch and a semantic_text branch, FUSE with RRF, in one query; Elastic embeds at index and query time", "Elasticsearch integration, AI"],
    ["Agent Builder", "6 tools, one agent, instructions that forbid computing; per-run trace waterfall is the explainability artefact", "AI implementation, Innovation"],
    ["Workflows + Cases", "Workflow exposed as a tool; opens a Kibana case and writes an audit record; runs only after human approval", "Takes action, UX"],
    ["AWS", "Elastic Cloud Serverless on AWS; optional Bedrock chat_completion inference endpoint for the narration model", "Technology stack"],
    ["Sarvam", "sarvam-translate:v1 renders the report in Hindi or Kannada; the traceability check re-runs on the translation", "Impact, sponsor fit"],
    ["Console", "Zero-dependency Node server + one page: queue, report, traceability highlights, approve/dismiss", "Interface design, Usability"],
  ];
  s.addTable(
    rows.map((r, i) => r.map((c, j) => ({ text: c, options: { bold: i === 0 || j === 0, color: i === 0 ? C.white : j === 2 ? C.green : C.ink, fill: { color: i === 0 ? C.navy : i % 2 ? C.white : C.bg }, fontSize: i === 0 ? 10.5 : 9.5, fontFace: F.body, valign: "middle", margin: [3, 6, 3, 6] } }))),
    { x: 0.5, y: 1.2, w: 9, colW: [1.7, 5.4, 1.9], border: { type: "solid", color: C.line, pt: 0.5 }, rowH: 0.42 },
  );
  s.addNotes("Only if asked. Each row is one sentence you can say out loud.");
}

pres.writeFile({ fileName: OUT }).then((f) => console.log("wrote", f));
