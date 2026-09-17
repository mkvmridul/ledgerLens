# Optimization log

Where LedgerLens spends its time, what has been fixed, and what is worth fixing next.

**How to use this file.** Each item has a **Status**: `DONE`, `NEXT`, `LATER`, or `N/A` (with the
reason). When you finish something, move it to `DONE` and write down the number you measured.
When you find a new idea, add a row. Keep the measured numbers honest: if a figure came from one
run, say so. Claims in here may end up on a slide, so they have to survive a judge's question.

Related: [CHANGELOG.md](CHANGELOG.md) records *what changed and why*; this file records *where the
time goes and what is left*. `CLAUDE.md` section 7 points here.

---

## The headline: it is not Elasticsearch

One investigation of `DSB-20260916-00297`, measured from the SSE stream against the cloud project
(Elastic Managed LLM, 4 LLM calls):

| Window | Duration | What is happening |
|---|---|---|
| 0 → 16.6s | **16.6s** | Dead air. No events at all. No tool has run yet. |
| 16.6 → 20.4s | 3.8s | First narration text, then the first `tool_call` (`break_delta`) |
| 20.4 → 23.9s | 3.5s | Turn 2: `evidence_rows` + `trace_failure_point`, batched |
| 23.9 → 30.0s | 6.1s | Turn 3: `similar_cases` |
| 30.0 → 45.0s | 15.0s | Turn 4: the final ~1,800-token report generating and streaming |

**All five ES|QL queries together take about 80 ms.** That is roughly 0.2% of the run. Everything
else is model time.

So there are two separate tracks, and they are not the same problem:

- **Track A — Agent Builder / LLM latency.** This is the demo problem, and it is the only one that
  matters this week.
- **Track B — Elasticsearch latency.** Nothing here is slow today. These are the changes that would
  matter at production volume, and they are good Q&A answers about how the system scales.

Do not spend build-day time on Track B for speed. Spend it on Track A.

---

## Track A — Agent Builder / LLM latency (the demo problem)

### Done

| What | Result | Where |
|---|---|---|
| **Batch independent tools into one turn.** `evidence_rows` and `trace_failure_point` both take only `disbursal_id` and do not depend on each other, so they now run in the same turn. `break_delta` still runs alone first because it decides the early exit for clean disbursals. | `model_usage.llm_calls` is 4, and the two tools share one `tool_call_group_id`. One fewer round trip. | `elastic/agent/instructions.md` |
| **Stream the response (SSE).** The console reads `converse/async` and shows tool calls and text as they arrive, instead of a spinner until the end. | First visible progress at ~16s instead of a blank screen until ~45s. Wall clock is unchanged; the wait stopped being silent. | `src/console/server.js`, `src/console/index.html` |
| **Fix the unrequested `open_case` call.** The agent used to open a case on its own at the end of an investigation. | Removes one whole LLM turn from every run, and restores the approval gate the pitch depends on. | `elastic/agent/instructions.md` |

### Next — ranked by value

| # | Idea | Why it helps | Cost / risk |
|---|---|---|---|
| 1 | **Prefetch `break_delta` in the console.** The agent *always* calls it first with `disbursal_id` as the only parameter — that is an entry condition, not a decision. The console knows the ID on click, so it can run the tool directly (~10 ms) and paint break type, rule and figures immediately, while the conversation starts in parallel. | Kills the 16.6s of dead air for the user. Real data on screen almost instantly. | Small client + server change. Slightly weakens "the agent orders the investigation"; the counter-argument is that classification is deterministic and the model only explains it. |
| 2 | **Collapse to 2 LLM turns.** Follows from #1: if the console already has `break_delta`, it knows `break_type`, partner and rail — most of what `similar_cases` needs. The agent could then call `evidence_rows` + `trace_failure_point` + `similar_cases` in one batch, then write the report. | 4 LLM calls → 2. Potentially halves total time. | Precedent queries get slightly less specific. **Testable**: `npm run verify` already scores precedent-at-rank-1 for all five break types. |
| 3 | **Bedrock with a faster model.** Moves inference to your own AWS quota and likely cuts both the 16.6s start and the 15s report. | Hits both ends of the timeline, scores the AWS rubric box, and **sidesteps the Elastic Managed LLM rate limit**. | Needs AWS credentials + Bedrock model access (approval delay outside your control). `setup:agent` already creates the endpoint. |
| 4 | **Template the mechanical report sections.** Figures, Evidence and Pipeline are pure formatting of tool output. Only Root cause, Recommended action and Confidence need reasoning. | Cuts output tokens by roughly 60%, taking a big bite out of the final 15s. `mockConverse()` already builds this template. | **Tension worth deciding deliberately:** the traceability check is compelling *because* the model produced the numbers and the checker found nothing wrong. Template them and the check is trivially 100% — structurally safer, weaker as a demo moment. |
| 5 | **Trim the prompt prefix.** Estimated ~15,000 static tokens per call (see below). `instructions.md` is only ~1,100 of those; the rest is Agent Builder scaffolding plus six tool definitions. The `open_case` description is notably long. | Shaves every turn, not just the first. | Do not over-trim `instructions.md` — it is what enforces the no-numbers rule and the approval gate. |

### Measure before optimizing further

The 16.6s of dead air is **not** cold start — three runs gave 16.5s, 16.6s and 15.2s. It is
reproducible and structural, so "warm the model before the demo" will not fix it.

What is in that window is currently an estimate, not a fact. `input_tokens` was 69,163 with
`cached_input_tokens` 46,288 across 4 calls; working backwards from three cache reads puts the
static prefix at roughly **15,000 tokens**. That points at prefill + managed-LLM queueing, but it
has not been confirmed.

Three cheap tests would settle it:

1. Raw `/_inference/chat_completion/<connector>` call with a 10-token prompt → isolates pure LLM
   service latency. If that alone is 8s, the prompt is not the problem.
2. A throwaway agent with one tool and two lines of instructions → isolates the cost of prefix size.
3. The same investigation twice in one conversation → measures how much the prompt cache actually saves.

---

## Track B — Elasticsearch latency (the scale problem)

Nothing in this section is slow today. The dataset is 3,574 recon docs / 5,985 spans / 36 resolved
cases. These are the changes that would matter at production volume, and several double as good
answers to "how does this scale?"

**Sharding is not on this list on purpose.** At this size one shard is correct; more shards would
add fan-out overhead and make queries slower. Elastic Cloud Serverless manages shards anyway, so
there is no `number_of_shards` to tune. At real volume the lever is time-partitioned data streams
by `business_date`, not manual sharding.

### 1. Ingest

| Technique | Fits where | Status |
|---|---|---|
| **Bulk API instead of single-doc requests** | `bulkLoad()` in `src/ingest.js` | **DONE.** Already uses `_bulk`. |
| **Batch size 5,000–15,000 docs** | `chunk = 500` in `src/ingest.js` | **LATER.** 3,574 docs is 7 batches; irrelevant now. Raise at volume. |
| **`refresh_interval: -1` during load, restore after** | `recreate()` in `src/ingest.js`; there is already a `_refresh` after load | **LATER.** Saves ~200 ms at this size. Genuinely useful at volume. |
| **`number_of_replicas: 0` during load** | — | **N/A.** Serverless manages replicas; not settable. |
| **Avoid heavy ingest scripts / Painless** | — | **DONE.** No ingest pipelines at all — every transformation happens client-side in `src/generate.js`. Already the recommended posture. |

### 2. Mapping

| Technique | Fits where | Status |
|---|---|---|
| **Explicit mappings, no dynamic mapping** | all four files in `elastic/mappings/` | **DONE, and stricter than the advice.** Uses `dynamic: "strict"`, which *rejects* unknown fields rather than silently ignoring them. |
| **`keyword` for IDs, enums, aggregation/sort fields; `text` only for prose** | `elastic/mappings/ledgerlens-recon.json` and the rest | **DONE.** Every identifier, code and business date is `keyword`; money is `long` (integer paise); only `description` / `narration` / `summary` are `text`. Documented in each file's `_meta`. |
| **`constant_keyword` for static filters** | — | **N/A, and worth being able to explain.** `source` has only two values but both appear in the same index — `constant_keyword` is for one value *per index*. Splitting by source would break the single-`STATS` no-join match, which is the whole design. |
| **Disable `norms` on strings that never need length-based scoring** | `description`, `narration` in `ledgerlens-recon` | **LATER.** Better still: `index: false` on those two, since search happens on `ledgerlens-resolved-breaks`. Keep norms on `summary` there — BM25 scoring is the point. |
| **Disable `_source` / `enabled: false`** | — | **DO NOT.** The report cites evidence rows verbatim; `_source` is load-bearing for traceability. |
| **`dynamic: false` on objects** | — | **N/A.** `strict` is already stronger. |
| **Index sorting by the main access-pattern field** | `elastic/mappings/*.json` + `recreate()` in `src/ingest.js` | **LATER.** Every hot query filters or groups by `disbursal_id`. `index.sort.field: ["disbursal_id"]` colocates one disbursal's events physically. No measurable gain at 3,574 docs; real at 100M. Must be set at index creation, so it needs a reindex (seconds here). |

### 3. Querying

| Technique | Fits where | Status |
|---|---|---|
| **Filter context over query context** | — | **Mostly N/A.** ES|QL does not expose the Query DSL filter/query split; `WHERE` compiles down. Scoring is used deliberately in `similar_cases` (`MATCH` + `FUSE`), where it is wanted. |
| **Avoid `wildcard` / `regexp` / leading wildcards** | all five `elastic/tools/*.esql` | **DONE.** No wildcards anywhere. Every lookup is an exact `==` on a `keyword` field. |
| **`search_after` / PIT instead of deep pagination** | `LIMIT 200` in `list_breaks`, `LIMIT 50` in `evidence_rows` / `trace_failure_point` | **N/A now, LATER at volume.** No deep pagination exists. A day with more than 200 breaks would truncate `list_breaks`. |
| **`_profile` API to find where latency accumulates** | `src/verify.js` already records ES|QL `took` | **LATER.** `took` is enough while queries are 6–55 ms. Reach for `_profile` when one gets slow. |
| **Force-merge read-only / time-based indices** | — | **N/A now.** Serverless manages merging. At volume with per-day indices, force-merging closed days is the standard move. |
| **Run independent queries in parallel** | `summary()` in `src/console/server.js` | **DONE.** The day totals and the break queue now run under `Promise.all` instead of sequentially — the page waits for `max(a, b)` rather than `a + b`. ~100 ms saved per page load (measured 114 ms and 155 ms). |

---

## Quick reference: which knob for which symptom

| Symptom | Track | Look at |
|---|---|---|
| Long wait before anything appears on screen | A | Prefetch `break_delta` (#1), Bedrock (#3) |
| Report takes a long time to finish writing | A | Faster model (#3), template mechanical sections (#4) |
| Too many LLM round trips | A | Collapse to 2 turns (#2) |
| Rate limited by Elastic Managed LLM | A | Bedrock (#3) — moves inference to your own AWS quota |
| Break queue / page load feels slow | B | Already parallelized; check ES|QL `took` in `/api/summary` |
| A single ES|QL query got slow | B | `_profile`, then index sorting |
| Ingest takes too long | B | Bulk batch size, `refresh_interval: -1` |
