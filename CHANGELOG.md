# Changelog

Notable changes to LedgerLens, with the reasoning behind each one. Format: what changed, why, existing approach vs new approach. Newest first.

## 2026-09-17 — Console: stream the investigation live

Changes `src/console/server.js` and `src/console/index.html`. No change to the agent, tools, indices or `traceability.js`.

**Why:** an investigation takes about 28 to 46 seconds end to end, and almost all of that is model time. Elasticsearch accounts for about 80 ms. Before this change the page showed a spinner for the whole run and then displayed the report all at once. Judges see latency before they read the answer, so the real cost is the silent wait, not the total time.

**Existing approach:** `POST /api/investigate` called Agent Builder's blocking `/api/agent_builder/converse`. The server waited for the whole round, then returned one JSON response with `steps` and `message`, and the page rendered it.

**New approach:**
- `POST /api/investigate/stream` (new) calls `/api/agent_builder/converse/async`, which responds with Server-Sent Events, and pipes the body to the browser unchanged. The server doesn't parse the stream, so it can't break the framing. The stream is padded with `:` comment lines to get past proxy buffering, and the page skips them.
- The page reads the stream with `fetch` and a `ReadableStream` reader. It can't use `EventSource`, because the request is a POST with a body. What each event does:
  - `tool_call`, `tool_result` and `reasoning` build the step list live. A tool shows a spinner until its result arrives. The first `reasoning` event is a `transient` placeholder and is skipped.
  - `message_chunk` types out the text the agent is writing. Every interim narration has its own `message_id`, so the text area resets when the id changes.
  - `round_complete` carries the same `steps` and `message` shape the blocking endpoint returns. The existing `render()` and traceability check run on it without changes. Figures are highlighted only at this point, once every tool result is known.
  - `conversation_id_set` arrives early and holds the id that the approve flow and the Kibana trace link need. `conversation_created` carries the same id, but it arrives after `round_complete`.
  - `thinking_complete` gives `time_to_first_token`, which now shows in the investigation header next to the total time.
- The blocking `/api/investigate` endpoint is unchanged and is the fallback. The page uses it when the stream returns an HTTP error, when the stream ends before `round_complete` (for example, the connection drops), and always in `AGENT_MODE=mock`. The server also returns 409 on the stream route in mock mode, so mock mode never reaches a model.
- The step markup moved out of `render()` into `stepsHtml()`, which both the live view and the final view use.

**Measured:** two live runs against the cloud project (Elastic Managed LLM) for `DSB-20260916-00297`:
- The first stream events (`conversation_id_set` and `reasoning`) arrived at 16.6 s and the first text at 20.2 s. `round_complete` arrived at 45.0 s.
- An earlier direct `curl` of `converse/async` finished in 28.0 s, with `time_to_first_token` at 16.5 s.
- Every run made 4 LLM calls, and about 46k of 69k input tokens were cached.

Total time varies a lot from run to run, so treat any single number as one sample. The part streaming changes, the first visible progress, landed at about 16 s in every run.

**Verified:**
- `npm test` passes (14/14).
- A captured live stream was replayed through the real page script (with the DOM and `fetch` stubbed) at random chunk boundaries. The live step list rendered mid-stream, the final report traced 18/18 figures, and the approve button and trace link rendered.
- Three fallback cases (HTTP 500, stream cut at 60%, mock mode) each ended with a fully traced report and no error.
- Checked in the browser against the cloud project: steps and text stream live, and approve opens the case.

## 2026-09-17 — Agent instructions: approval gating + tool batching

Both changes are to `elastic/agent/instructions.md` only. No index, mapping, ES|QL tool, or workflow changed. Found during the first live run against the cloud project and a real LLM (Elastic Managed LLM).

### Fix: agent opened a case without the user approving

**Observed:** running a plain `Investigate DSB-20260916-00238.` — no approval given — the agent called `ledgerlens.open_case` unprompted at the end of its own investigation, opening a real case and writing an audit record.

**Why it matters:** the approval gate is the project's core safety claim — README's "Actions are gated," the submission's "every write stays behind human approval," and the AMA's framing of agent-that-acts vs agent-that-explains all depend on this holding. A judge triggering an investigation and watching a case open unprompted contradicts the repo and the pitch in the same breath.

**Existing approach:** the only approval instruction lived in the `# Taking action` section, well after the investigation steps (previously line 45 of a 51-line file). Nothing in the investigation flow itself said to stop after writing the report.

**New approach:**
- Added a new `# The other rule: you never act without approval` section immediately after the money rule, at the top of the file, stating the gate as plainly and forcefully as the number rule already was: "Writing a report is not approval. Finishing an investigation is not approval. Silence is not approval."
- Added an explicit stop instruction to the last step of the investigation flow: "Write the report in the format below. Then stop — do not call `ledgerlens.open_case` or any other tool. Wait for the user's next message."
- Left the detailed operational instructions in `# Taking action` (params to pass, severity mapping) unchanged — the fix is about *when* the agent decides to call the tool, not what it passes when it does.

**Not yet done:** re-verified against the live agent after this change (needs `npm run setup:agent` to push, then a manual re-run per break type). If the instruction doesn't hold under testing, the fallback is `CASE_MODE=direct` in `.env`, which removes the agent's ability to call the workflow at all and runs approval through the console server directly — already implemented in `src/console/server.js`, untouched by this change.

### Optimization: reduced agent round trips per investigation

**Observed:** a full investigation took 56.8s end to end, of which ES|QL itself accounted for roughly 80ms across all five tool calls (`break_delta` ~10ms, `evidence_rows` ~10ms, `trace_failure_point` ~6ms, `similar_cases` ~22ms, per BENCHMARKS.md). The remaining ~56.7s was LLM round-trip time across sequential tool calls.

**Why it matters:** judging is on both latency and accuracy. Elasticsearch was never the bottleneck — sharding or index tuning at 3,574 docs would not move this number. The only lever with real impact is the number of sequential LLM round trips.

**Existing approach:** the investigation flow instructed the agent to call four tools one at a time, in strict sequence: `break_delta` → `evidence_rows` → `trace_failure_point` → `similar_cases`, each requiring its own LLM turn.

**New approach:** `evidence_rows` and `trace_failure_point` both take only `disbursal_id` and don't depend on each other's output, so the instructions now tell the agent to call them together in the same turn. `break_delta` still runs alone and first, because it's the only tool that determines `break_type` — and `break_type` gates the early-exit path for `MATCHED`/`NO_LEDGER_SUCCESS` disbursals (a clean lookup should not pay for evidence or trace calls it doesn't need). `similar_cases` still runs after, since its query text is built from the other tools' results.

Net effect: one fewer sequential LLM round trip on every real break investigation (roughly a 4-turn conversation instead of 5), with no change to which tools run or what they return.

**Not yet done:** latency wasn't re-measured after this change — the model already showed some spontaneous parallel tool-calling behavior in the one run observed, so the actual saving needs to be measured against the new instructions, not assumed. Later live runs confirmed the batching: `model_usage.llm_calls` is 4, and `evidence_rows` and `trace_failure_point` share one `tool_call_group_id`. Streaming is covered in the entry above.

### How to verify these two changes

```bash
npm run setup:agent   # pushes the updated instructions.md to the Kibana agent
npm run console        # http://localhost:3000
```

Then, per break type in the queue:
1. Click **Investigate** and confirm the agent's report ends without calling `open_case` — no case/audit line should appear until you approve.
2. Type **approve** and confirm the case opens only now.
3. Compare wall-clock time in the console header against the 56.8s baseline.
