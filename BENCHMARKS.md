# Benchmarks

Verbatim output of `npm run verify:report`. Every number quoted in the README and the deck comes from here.

- Run at: 2026-09-17T07:43:47.808Z
- Cluster: docker-cluster · Elasticsearch 9.5.4 (default)
- Node: v20.19.6
- Data: seed 20260916, generated 2026-09-17T04:10:26.692Z, answer key data/answer-key.json
- Latency figures are the ES|QL `took` value reported by Elasticsearch for each query, not end-to-end wall clock.

```

1. ledgerlens.list_breaks per business date
  ok   2026-09-14: 2/2 seeded breaks found, 0 false positives, 151 ms
  ok   2026-09-15: 2/2 seeded breaks found, 0 false positives, 55 ms
  ok   2026-09-16: 10/10 seeded breaks found, 0 false positives, 46 ms

2. ledgerlens.break_delta per seeded break
  ok   DSB-20260914-00222 MISSING_CREDIT  delta=5950000 fee_delta=-295 rows=0 ids=2 18 ms
  ok   DSB-20260914-00247 DOUBLE_DEBIT    delta=-15400000 fee_delta=295 rows=2 ids=4 31 ms
  ok   DSB-20260915-00024 FEE_MISMATCH    delta=0 fee_delta=295 rows=1 ids=3 15 ms
  ok   DSB-20260915-00072 TIMING_T1       delta=0 fee_delta=0 rows=1 ids=3 16 ms
  ok   DSB-20260916-00054 TIMING_T1       delta=0 fee_delta=0 rows=1 ids=3 19 ms
  ok   DSB-20260916-00067 TIMING_T1       delta=0 fee_delta=0 rows=1 ids=3 10 ms
  ok   DSB-20260916-00112 UNRESOLVED      delta=100000 fee_delta=0 rows=1 ids=3 13 ms
  ok   DSB-20260916-00177 FEE_MISMATCH    delta=0 fee_delta=90 rows=1 ids=3 10 ms
  ok   DSB-20260916-00216 MISSING_CREDIT  delta=6770000 fee_delta=-295 rows=0 ids=2 9 ms
  ok   DSB-20260916-00237 FEE_MISMATCH    delta=0 fee_delta=295 rows=1 ids=3 10 ms
  ok   DSB-20260916-00238 DOUBLE_DEBIT    delta=-32610000 fee_delta=590 rows=2 ids=4 8 ms
  ok   DSB-20260916-00290 DOUBLE_DEBIT    delta=-33820000 fee_delta=295 rows=2 ids=4 10 ms
  ok   DSB-20260916-00297 MISSING_CREDIT  delta=5150000 fee_delta=-295 rows=0 ids=2 10 ms
  ok   DSB-20260916-00364 MISSING_CREDIT  delta=3320000 fee_delta=-295 rows=0 ids=2 10 ms

3. ledgerlens.break_delta on a clean disbursal and a failed one
  ok   DSB-20260914-00001 -> MATCHED
  ok   DSB-20260914-00047 -> NO_LEDGER_SUCCESS

4. ledgerlens.trace_failure_point per seeded break
  ok   DSB-20260914-00222 failure point(s) = psp.callback MERIDIAN -> psp.status-poll MERIDIAN (CALLBACK_TIMEOUT) 9 ms
  ok   DSB-20260914-00247 failure point(s) = psp.transfer NORTHBANK (GATEWAY_TIMEOUT) 7 ms
  ok   DSB-20260915-00024 pipeline clean (5 spans) 6 ms
  ok   DSB-20260915-00072 pipeline clean (5 spans) 6 ms
  ok   DSB-20260916-00054 pipeline clean (5 spans) 6 ms
  ok   DSB-20260916-00067 pipeline clean (5 spans) 7 ms
  ok   DSB-20260916-00112 pipeline clean (5 spans) 5 ms
  ok   DSB-20260916-00177 pipeline clean (5 spans) 6 ms
  ok   DSB-20260916-00216 failure point(s) = psp.callback MERIDIAN -> psp.status-poll MERIDIAN (CALLBACK_TIMEOUT) 6 ms
  ok   DSB-20260916-00237 pipeline clean (5 spans) 7 ms
  ok   DSB-20260916-00238 failure point(s) = psp.transfer PAYSTREAM (GATEWAY_TIMEOUT) 6 ms
  ok   DSB-20260916-00290 failure point(s) = psp.transfer PAYSTREAM (GATEWAY_TIMEOUT) 9 ms
  ok   DSB-20260916-00297 failure point(s) = psp.callback NORTHBANK -> psp.status-poll NORTHBANK (CALLBACK_TIMEOUT) 8 ms
  ok   DSB-20260916-00364 failure point(s) = psp.callback MERIDIAN -> psp.status-poll MERIDIAN (CALLBACK_TIMEOUT) 6 ms

5. ledgerlens.evidence_rows cite an ID on every row
  ok   DSB-20260914-00222: 2 rows, every row has event_id or row_id
  ok   DSB-20260914-00247: 4 rows, every row has event_id or row_id
  ok   DSB-20260915-00024: 3 rows, every row has event_id or row_id

6. ledgerlens.similar_cases (hybrid BM25 + semantic, RRF) per break type
  ok   MISSING_CREDIT  precedent at rank 1: CASE-2026-0027 48 ms
  ok   DOUBLE_DEBIT    precedent at rank 1: CASE-2026-0007 30 ms
  ok   FEE_MISMATCH    precedent at rank 1: CASE-2026-0016 22 ms
  ok   TIMING_T1       precedent at rank 1: CASE-2026-0021 17 ms
  ok   UNRESOLVED      precedent at rank 1: CASE-2026-0005 15 ms

7. headline numbers for the pitch
  demo date 2026-09-16: 391 successful disbursals worth ₹9,63,90,700, 10 seeded breaks
  index size: 3574 recon docs, 5985 spans, 36 resolved cases
  seeded breaks detected: 14/14 across 3 days, 0 false positives (see section 1)
  ES|QL list_breaks          median 55 ms over 3 runs
  ES|QL break_delta          median 10 ms over 14 runs
  ES|QL trace_failure_point  median 6 ms over 14 runs
  ES|QL similar_cases        median 22 ms over 5 runs

all checks passed
```
