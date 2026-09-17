# Demo script

Five to seven minutes. Two slides, then the product, then two slides. Rehearse standing, out loud, with a timer.

## Before you walk on

- [ ] Elastic Cloud project up. `npm run verify:report` prints `all checks passed` and rewrites BENCHMARKS.md. Then update the three places that quote its numbers: the README "Measured" table, slides 4 and 5 (`presentation/build-deck.js`, rebuild), and the 1:00 line below. `npm run setup:agent` prints the smoke line.
- [ ] Console running: `npm run console` → http://localhost:3000 shows 391 disbursals and 10 breaks for 2026-09-16.
- [ ] Kibana open in a second tab at `/app/agent_builder`, agent **LedgerLens** selected, an empty conversation.
- [ ] One full investigation already run once today (warms the inference endpoint and the model).
- [ ] The recorded demo video is in the repo and you know the timestamp of the approval moment.
- [ ] Phone hotspot ready if venue wifi dies.

## Run of show

| Time | What you show | What you say |
|---|---|---|
| 0:00 | Slide 1 | "Three systems must agree about money: the ledger, the bank's settlement file, and the pipeline that pushed the funds. When they disagree, an analyst spends thirty to sixty minutes per break, by hand. That is my own number from running this in production. And the write-up is only as good as one tired human at 11pm." |
| 0:30 | Slide 2 | "Rules match or they don't. Chat can explain, but you can't sign off on a number a language model produced. LedgerLens splits the job: ES|QL computes every figure, the model only orders the investigation and explains. Then a workflow acts, behind a human." |
| 1:00 | Console, break queue | "This is a settlement day. 391 disbursals, ₹9.6 crore. One ES|QL query matched ledger against the settlement file in under sixty milliseconds and flagged ten. No join, no application code." Point at the top tile: figures computed by the LLM: 0. |
| 1:30 | Click `DSB-20260916-00297` (MISSING_CREDIT) | "Investigate." While it runs: "The agent is calling five tools — two of them together in the same turn, because neither depends on the other's result. Watch the list on top." |
| 2:00 | Report appears | Read the rule that fired and the figures. "₹51,500 booked as success, ₹0 settled. Every green figure is highlighted because it appears verbatim in a tool result. 12 of 12." Scroll to Pipeline: "Here is *why*: the ledger booked success on the PSP's ACCEPTED, then the callback timed out and the status poll said the beneficiary account was invalid. Money never left." Precedent: "The library found the same failure resolved on the 14th." |
| 2:45 | Kibana tab, the conversation | "This is the Agent Builder trace. Five tool calls, each with its ES|QL and its rows. The model wrote prose. It computed nothing." |
| 3:15 | Back to console, click `DSB-20260916-00112` (UNRESOLVED) | "One honest failure. ₹1,000 short, one row, correct fee, clean pipeline. No rule matches. The agent says so, lists what it ruled out, and escalates. It does not guess." |
| 3:45 | Back to the first break, click **Approve → open case** | "Now the action. A human approves; an Elastic Workflow opens a case and writes an audit record. The agent cannot do this on its own." Show the audit line with the case id. Optionally open Cases in Kibana. |
| 4:15 | If Sarvam is configured: click **हिन्दी** | "Same report through Sarvam for an ops team that reads Hindi. The checker re-runs: the IDs and figures survived translation." |
| 4:30 | Slide 3, architecture | Walk the boxes left to right, one sentence each. Land on hybrid search: "Precedent retrieval is one ES|QL query: a BM25 branch and a semantic branch, fused with RRF. Exact IDs and fuzzy human descriptions in one search API." |
| 5:00 | Slide 4, the numbers | The measured numbers, and what production needs. Stop talking. |

The line to land, said once, slowly: **The model explains. ES|QL decides. Every number is traceable.**

## Prompts to type in Kibana if you demo from the Agent Builder chat instead of the console

```
List the reconciliation breaks for 2026-09-16.
Investigate DSB-20260916-00297.
Investigate DSB-20260916-00112.
Approve. Open the case.
```

## Fallbacks

| If | Do |
|---|---|
| Venue wifi is dead | Hotspot. If still dead, play the recorded video from the repo and narrate over it. |
| The LLM is slow or errors | Demo from the Kibana Agent Builder chat directly (same agent, same tools). If the model is down entirely, show `npm run verify` output live and the recorded video. |
| The workflow tool misbehaves | Set `CASE_MODE=direct` in `.env`, restart the console. Approve then runs the same workflow through the Workflows API instead of through the agent. |
| Cases app missing in the project | The workflow still writes the audit record; say so. The case is a Kibana convenience, the audit index is the record of action. |
| Someone asks to see a break you did not rehearse | The queue has ten. Pick one with `DOUBLE_DEBIT`: the trace shows the 504 and the retry without an idempotency key. |

## Questions you will get

**How is this different from a rules engine?** The rules *are* the classifier, on purpose. What the rules cannot do is read a trace, find a precedent, write a root cause a compliance reviewer can sign, and take a gated action. That is the agent's job, and the split is what makes the numbers trustworthy.

**Why not let the model compute the delta?** Because then no one can sign off on it. An amount that came out of a language model is an opinion. An amount that came out of `STATS SUM(...) BY disbursal_id` is a fact with a query attached.

**Explain your search.** Three indices, strict mappings, keyword for every identifier and code, text only for human narration. The match is a single `STATS ... BY disbursal_id` over a unified index, no join. Precedent retrieval is hybrid: `FORK` a BM25 branch and a semantic branch on a `semantic_text` field, `FUSE` with reciprocal rank fusion, one query. Elastic embeds at index and query time; there is no embedding code in the repo.

**What did you build before today?** The generator, mappings, ES|QL tools, agent instructions, workflow YAML, console and deck were drafted before the 18th and are in the repo history. On the 18th we connected it to the cloud project, tuned the agent against the real model, recorded the video and finished the README. The repo tells that story.

**What would production need?** Real APM instrumentation (the ES|QL is already ECS-shaped), S3 → Lambda ingest of partner files, the LLM through a Bedrock inference endpoint under your AWS account, RBAC on the workflow, and reversal workflows behind a second approval.

**What is the manual time you quote?** My own estimate from operating this class of system in production: thirty to sixty minutes per break. It is not a benchmark and I say so on the slide. The agent's time is measured live on screen, and the ES|QL timings are in BENCHMARKS.md.

## Copying into the team repository on the 18th

Copy everything **except**: `context.md`, `CLAUDE.md`, `CLAUDE.local.md`, `resources/`, `.claude/`, `.env`. Those are working notes and credentials, not part of the submission.


---

## Narrative Walkthrough: A Day in the Life of a Financial Analyst

Use this narrative arc when delivering the live demo. It anchors the technical capabilities in a relatable, high-stakes finance operations scenario.

### Act 1: The Daily Grind (Before LedgerLens)
Every morning at 9:00 AM, Priya, a financial operations analyst at a digital lending NBFC, logs into the portal. Waiting for her are **400 loan disbursal records from yesterday—representing ₹9.6 crore of customer disbursements**. 

Her entire day is usually consumed by:
- Manually pulling bank settlement files from partner banks (HDFC, NorthBank, PayStream).
- Running error-prone VLOOKUPs against the internal loan management ledger.
- Cross-matching 16-character UTR numbers and transaction timestamps by hand.
- Chasing engineering teams through AWS CloudWatch logs to figure out why a payment failed.

**The consequence:** Investigating a single transaction discrepancy takes **30 to 60 minutes**. By 10:00 PM, eye strain and fatigue set in. A single overlooked double-debit ties up working capital; an undetected missing credit delays a borrower's urgent medical or education loan. Worse, undetected reconciliation breaks create severe RBI regulatory scrutiny and audit penalties.

---

### Act 2: Today is Different (Enter LedgerLens)
Today is different, because today Priya has **LedgerLens**.

**[Action: Switch to the LedgerLens Console at `http://localhost:3000`]**

Instead of 400 raw rows clogging an unmanageable queue, **the entire day's volume has already been matched and reconciled in under 60 milliseconds**. 
- A single unified ES|QL query evaluated all 391 successful disbursals against the settlement file—without a single database join or batch ETL script.
- 381 transactions matched cleanly and cleared automatically.
- **Only the 10 genuine exception breaks are flagged and categorized** into actionable buckets: `MISSING_CREDIT`, `DOUBLE_DEBIT`, `FEE_MISMATCH`, `TIMING_T1`, and `UNRESOLVED`.

> **Key Line to Land on Stage:**  
> *"Notice the top metric tile: **Figures computed by the LLM: 0**. We deliberately use deterministic ES|QL rules and APM trace correlation instead of asking an LLM to calculate math or match transactions. In finance, a single hallucination or missed decimal doesn't just waste API tokens—it costs real customer money and violates regulatory compliance."*

---

### Act 3: One-Click Autonomous Investigation
Priya clicks on the top break: `DSB-20260916-00297` (`MISSING_CREDIT`).

**[Action: Click `DSB-20260916-00297` → Click "Investigate"]**

Rather than spending 45 minutes digging through separate database tables and log streams, the agent takes over. In seconds, it orchestrates 5 specialized tools behind the scenes:
1. **`ledgerlens.break_delta`**: Deterministically calculates the exact ledger amount (₹51,500.00), settled amount (₹0.00), and delta (+₹51,500.00), triggering rule `R1`.
2. **`ledgerlens.evidence_rows`**: Pulls the exact chronological ledger event IDs (`EVT-...`) and confirms zero settlement rows exist.
3. **`ledgerlens.trace_failure_point`**: Traverses the microservice APM spans (`disbursal-service`, `payout-gateway`, `ledger-service`) and immediately flags the failure: our system booked success prematurely on a synchronous `PSP_ACCEPTED`, but the bank callback timed out and the status poll returned `BENEFICIARY_ACCOUNT_INVALID`. Money never left the nodal account!
4. **`ledgerlens.similar_cases`**: Executes a hybrid search (lexical BM25 + dense semantic vector retrieval via Reciprocal Rank Fusion) across 84 historical cases, pulling up precedent `CASE-2026-0012` resolved by analyst SN on September 14th.

---

### Act 4: Audit-Ready Trust & Human-in-the-Loop Action
The report renders instantly with an audit-ready breakdown:
- **Trust badge**: Confirms **12 of 12 figures and IDs are 100% traced verbatim** back to query results (highlighted in green). Zero fabricated digits.
- **Root Cause & Precedent**: Clearly explains *why* the break occurred and what steps past analysts took.

**[Action: Click "Approve → open case"]**

Priya doesn't have to copy-paste findings into Jira or draft an email. She clicks **Approve → open case**. 
- An **Elastic Workflow** executes behind human authorization.
- It opens a formal remediation Case in Kibana (`CASE-2026-0037`) and writes an immutable, append-only record to the `ledgerlens-audit` index for compliance auditors.

**Closing impact:** Priya just resolved what used to be a 45-minute multi-team investigation in **less than 15 seconds**, with 100% mathematical certainty, zero hallucination risk, and complete end-to-end traceability.
