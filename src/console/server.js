// LedgerLens ops console: a small Node server that serves the single-page console and proxies
// four things so the browser never holds an Elastic API key:
//   GET  /api/summary?business_date=   day totals + the break queue (two ES|QL queries)
//   POST /api/investigate              one Agent Builder conversation turn: "Investigate <id>"
//   POST /api/chat                     follow-up turn in the same conversation (approve / dismiss / questions)
//   POST /api/translate                Sarvam translate (optional; needs SARVAM_API_KEY)
//   GET  /api/audit?disbursal_id=      audit records the workflow wrote after approval
//   POST /api/open-case                run the open-case workflow directly (CASE_MODE=direct fallback)
//
// AGENT_MODE=mock replaces the LLM with a template filled from the same ES|QL tools. It exists so the
// page can be developed and rehearsed without a model. The page shows a red MOCK banner in that mode.

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { es, esql, kbn, KIBANA_URL } from "../es.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const PORT = Number(process.env.PORT || 3000);
const AGENT_ID = process.env.AGENT_ID || "ledgerlens";
const AGENT_MODE = process.env.AGENT_MODE === "mock" ? "mock" : "live";
const CASE_MODE = process.env.CASE_MODE === "direct" ? "direct" : "workflow";
const WORKFLOW_ID = "ledgerlens-open-case";
const BEDROCK_INFERENCE_ID = "ledgerlens-bedrock";

// Which model answers: an explicit LLM_INFERENCE_ID / LLM_CONNECTOR_ID wins; otherwise the Bedrock inference
// endpoint that setup:agent creates when AWS credentials are present; otherwise the project's default LLM.
let llm = process.env.LLM_INFERENCE_ID ? { inference_id: process.env.LLM_INFERENCE_ID } : process.env.LLM_CONNECTOR_ID ? { connector_id: process.env.LLM_CONNECTOR_ID } : {};
async function detectBedrock() {
  if (Object.keys(llm).length) return;
  try {
    await es("GET", `/_inference/chat_completion/${BEDROCK_INFERENCE_ID}`);
    llm = { inference_id: BEDROCK_INFERENCE_ID };
  } catch {
    /* not created: the project's default model is used */
  }
}
const llmLabel = () => llm.inference_id ? `${llm.inference_id} (Amazon Bedrock)` : llm.connector_id ? `connector ${llm.connector_id}` : "project default (Elastic Managed LLM)";

const tools = JSON.parse(readFileSync(join(ROOT, "elastic", "tools", "tools.json"), "utf8"));
const queryOf = (id) => readFileSync(join(ROOT, "elastic", "tools", tools.find((t) => t.id === id).query_file), "utf8");

// ---------------------------------------------------------------- data

async function summary(business_date) {
  const totals = await esql(
    `FROM ledgerlens-recon
     | WHERE source == "ledger" AND event_type == "DISBURSAL_SUCCEEDED" AND business_date == ?business_date
     | STATS disbursals = COUNT(*), total_paise = SUM(amount_paise), partners = COUNT_DISTINCT(partner)`,
    { business_date },
  );
  const breaks = await esql(queryOf("ledgerlens.list_breaks"), { business_date });
  const t = totals.rows[0] ?? { disbursals: 0, total_paise: 0, partners: 0 };
  return {
    business_date,
    disbursals: t.disbursals,
    total_inr: t.total_paise / 100,
    partners: t.partners,
    breaks: breaks.rows,
    took_ms: { totals: totals.took, breaks: breaks.took },
  };
}

async function auditFor(disbursal_id) {
  const { rows } = await esql(
    `FROM ledgerlens-audit | WHERE disbursal_id == ?disbursal_id | SORT @timestamp DESC | LIMIT 5`,
    { disbursal_id },
  );
  return rows;
}

// ---------------------------------------------------------------- agent

async function converse(input, conversation_id) {
  const body = { agent_id: AGENT_ID, input, ...llm };
  if (conversation_id) body.conversation_id = conversation_id;
  const t0 = Date.now();
  const r = await kbn("POST", "/api/agent_builder/converse", body, { timeoutMs: 300_000 });
  return {
    mode: "live",
    conversation_id: r.conversation_id,
    trace_id: r.trace_id,
    steps: r.steps ?? [],
    message: r.response?.message ?? "",
    elapsed_ms: Date.now() - t0,
  };
}

// ---------------------------------------------------------------- workflow (direct fallback)

async function runWorkflow(inputs) {
  const run = await kbn("POST", `/api/workflows/workflow/${WORKFLOW_ID}/run`, { inputs });
  const id = run.workflowExecutionId;
  let exec;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    exec = await kbn("GET", `/api/workflows/executions/${id}`);
    if (exec.status && !/running|pending|waiting/i.test(exec.status)) break;
  }
  return { execution_id: id, status: exec?.status, error: exec?.error?.message ?? null };
}

// ---------------------------------------------------------------- mock agent (development only)

const inr = (v) => "₹" + Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const asList = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

async function mockConverse(input, conversation_id) {
  const t0 = Date.now();
  const steps = [];
  const call = async (tool_id, params) => {
    const r = await esql(queryOf(tool_id), params);
    steps.push({ type: "tool_call", tool_call_id: `mock-${steps.length}`, tool_id, params, results: [{ type: "query", data: { columns: r.columns, values: r.rows } }] });
    return r.rows;
  };
  const id = input.match(/DSB-\d{8}-\d{5}/)?.[0];
  if (/approve/i.test(input) && conversation_id) {
    const [, disbursal_id, break_type] = conversation_id.split("|");
    const d = (await call("ledgerlens.break_delta", { disbursal_id }))[0];
    const wf = await runWorkflow({ title: `${break_type} · ${disbursal_id} · Delta ${inr(d.delta_inr)}`, disbursal_id, break_type, severity: "high", report: `Mock report for ${disbursal_id}`, approved_by: "console-mock" });
    steps.push({ type: "tool_call", tool_call_id: "mock-wf", tool_id: "ledgerlens.open_case", params: { disbursal_id, break_type }, results: [{ type: "other", data: { execution: wf } }] });
    const audit = await auditFor(disbursal_id);
    const message = `Case opened for \`${disbursal_id}\`. Workflow execution \`${wf.execution_id}\` finished with status ${wf.status}.` + (audit[0] ? ` Kibana case \`${audit[0].case_id}\`, audit record written at ${audit[0]["@timestamp"]}.` : "");
    return { mode: "mock", conversation_id, steps, message, elapsed_ms: Date.now() - t0 };
  }
  if (/dismiss/i.test(input)) return { mode: "mock", conversation_id, steps, message: "Dismissed. No action taken.", elapsed_ms: Date.now() - t0 };
  if (!id) return { mode: "mock", conversation_id, steps, message: "Mock agent: name a disbursal id (DSB-YYYYMMDD-NNNNN).", elapsed_ms: Date.now() - t0 };

  const d = (await call("ledgerlens.break_delta", { disbursal_id: id }))[0];
  const ev = await call("ledgerlens.evidence_rows", { disbursal_id: id });
  const tr = await call("ledgerlens.trace_failure_point", { disbursal_id: id });
  const failed = tr.filter((r) => r["event.outcome"] === "failure");
  const sim = await call("ledgerlens.similar_cases", { query: `${d.break_type} ${d.partner} ${d.rail} ${failed.map((f) => f["error.type"]).join(" ")}` });
  const prec = sim.find((s) => s.break_type === d.break_type);
  const lines = [
    `## ${d.disbursal_id} · ${d.break_type}`,
    `**Rule fired:** \`${d.rule_fired}\``,
    `**Figures** (from ledgerlens.break_delta): Ledger ${inr(d.ledger_inr)} · Settled ${inr(d.settled_inr)} · Delta ${inr(d.delta_inr)} · Settlement rows ${d.settlement_rows} · Fee charged ${inr(d.charged_fee_inr)} vs contracted ${inr(d.expected_fee_inr)}`,
    `**Evidence** (from ledgerlens.evidence_rows):`,
    ...ev.map((r) => `- \`${r.event_id ?? r.row_id}\` ${r.event_type ?? r.status} ${inr(r.amount_inr)}${r.utr ? " UTR `" + r.utr + "`" : ""} ${r["@timestamp"]}`),
    `**Pipeline** (from ledgerlens.trace_failure_point): ` + (failed.length ? failed.map((f) => `failure at \`${f["span.name"]}\` → ${f["error.type"]}: ${f["error.message"]}`).join("; ") : `All ${tr.length} spans succeeded; no pipeline failure.`),
    `**Root cause:** [mock mode: the LLM would narrate the mechanism here from the evidence above]`,
    `**Precedent** (from ledgerlens.similar_cases): ` + (prec ? `\`${prec.case_id}\` (${prec.break_type}, resolved by ${prec.resolved_by} in ${prec.time_to_resolve_minutes} min): ${prec.resolution}` : "no precedent of the same type"),
    `**Recommended action:** ${prec?.resolution ?? "Escalate to a human reviewer."}`,
    `**Confidence:** ${d.break_type === "UNRESOLVED" ? "Low" : "High"}`,
    d.break_type === "TIMING_T1" ? "No case is needed; the credit is present in the next day's file." : "Reply **approve** to open a case for this break, or **dismiss**.",
  ];
  return { mode: "mock", conversation_id: `mock|${d.disbursal_id}|${d.break_type}`, steps, message: lines.join("\n"), elapsed_ms: Date.now() - t0 };
}

// ---------------------------------------------------------------- sarvam

async function translate(text, target_language_code) {
  const key = process.env.SARVAM_API_KEY;
  if (!key) throw Object.assign(new Error("SARVAM_API_KEY not set"), { status: 400 });
  const blocks = text.split(/\n\n+/);
  const out = [];
  for (const block of blocks) {
    if (!block.trim()) continue;
    const res = await fetch("https://api.sarvam.ai/translate", {
      method: "POST",
      headers: { "api-subscription-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ input: block.slice(0, 1900), source_language_code: "en-IN", target_language_code, model: "sarvam-translate:v1", mode: "formal", numerals_format: "international" }),
    });
    const j = await res.json();
    if (!res.ok) throw Object.assign(new Error(`Sarvam ${res.status}: ${JSON.stringify(j).slice(0, 300)}`), { status: 502 });
    out.push(j.translated_text);
  }
  return out.join("\n\n");
}

// ---------------------------------------------------------------- http

const send = (res, status, body, type = "application/json") => {
  res.writeHead(status, { "Content-Type": type + (type.startsWith("text") || type.includes("javascript") ? "; charset=utf-8" : ""), "Cache-Control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};
const readJson = (req) =>
  new Promise((resolve, reject) => {
    let s = "";
    req.on("data", (d) => (s += d));
    req.on("end", () => {
      try {
        resolve(s ? JSON.parse(s) : {});
      } catch (e) {
        reject(e);
      }
    });
  });

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (req.method === "GET" && url.pathname === "/") return send(res, 200, readFileSync(join(HERE, "index.html"), "utf8"), "text/html");
    if (req.method === "GET" && url.pathname === "/traceability.js") return send(res, 200, readFileSync(join(HERE, "traceability.js"), "utf8"), "text/javascript");
    if (req.method === "GET" && url.pathname === "/api/config") {
      return send(res, 200, {
        business_date: process.env.DEMO_BUSINESS_DATE || "2026-09-16",
        agent_id: AGENT_ID,
        agent_mode: AGENT_MODE,
        case_mode: CASE_MODE,
        kibana_url: KIBANA_URL(),
        sarvam: Boolean(process.env.SARVAM_API_KEY),
        llm: llmLabel(),
      });
    }
    if (req.method === "GET" && url.pathname === "/api/summary") return send(res, 200, await summary(url.searchParams.get("business_date") || process.env.DEMO_BUSINESS_DATE || "2026-09-16"));
    if (req.method === "GET" && url.pathname === "/api/audit") return send(res, 200, await auditFor(url.searchParams.get("disbursal_id")));
    if (req.method === "POST" && url.pathname === "/api/investigate") {
      const { disbursal_id } = await readJson(req);
      if (!/^DSB-\d{8}-\d{5}$/.test(disbursal_id ?? "")) return send(res, 400, { error: "disbursal_id required" });
      const input = `Investigate ${disbursal_id}.`;
      return send(res, 200, AGENT_MODE === "mock" ? await mockConverse(input) : await converse(input));
    }
    if (req.method === "POST" && url.pathname === "/api/chat") {
      const { input, conversation_id } = await readJson(req);
      if (!input) return send(res, 400, { error: "input required" });
      return send(res, 200, AGENT_MODE === "mock" ? await mockConverse(input, conversation_id) : await converse(input, conversation_id));
    }
    if (req.method === "POST" && url.pathname === "/api/open-case") {
      const b = await readJson(req);
      const result = await runWorkflow({ title: b.title, disbursal_id: b.disbursal_id, break_type: b.break_type, severity: b.severity || "high", report: b.report || "", approved_by: b.approved_by || "console" });
      return send(res, 200, { ...result, audit: await auditFor(b.disbursal_id) });
    }
    if (req.method === "POST" && url.pathname === "/api/translate") {
      const { text, target } = await readJson(req);
      return send(res, 200, { translated_text: await translate(text, target || "hi-IN") });
    }
    return send(res, 404, { error: "not found" });
  } catch (e) {
    console.error(`${req.method} ${url.pathname} -> ${e.message}`);
    return send(res, e.status && e.status >= 400 && e.status < 600 ? e.status : 500, { error: e.message });
  }
});

detectBedrock().then(() =>
  server.listen(PORT, () => {
    console.log(`LedgerLens console  http://localhost:${PORT}`);
    console.log(`  agent: ${AGENT_ID} (${AGENT_MODE}${AGENT_MODE === "mock" ? " - no LLM, template report" : ""})  llm: ${llmLabel()}  case mode: ${CASE_MODE}  sarvam: ${process.env.SARVAM_API_KEY ? "on" : "off"}`);
  }),
);
