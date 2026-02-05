# ReviewPulse — Case Study Draft (Portfolio / Upwork)

## Problem
Teams waste hours digging through contracts (NDA/MSA/SaaS) to answer basic questions (term, confidentiality, termination, payment) and risk missing clauses.

## Solution
**ReviewPulse** is a “command center” that:
- Ingests PDFs into **Pinecone integrated vector search**
- Retrieves the most relevant chunks for a question
- Uses **Claude Sonnet 4.5** to synthesize an answer
- Returns **citations** (source chunk ids) + **measured latency**

## Demo (reproducible)
1. Click **Demo** to ingest NDA/MSA/SaaS sample PDFs.
2. Ask a question (e.g., “What is the confidentiality term in the NDA?”)
3. Get a cited answer + latency.

## Results (measured)
From `proof/metrics.json`:
- p50 latency: ~2.90s
- p95 latency: ~5.93s
- p99 latency: ~6.12s
- 18/18 runs successful (100% reliability)

## Proof Artifacts
- Screenshots:
  - `proof/screenshots/01_demo_ingested.png`
  - `proof/screenshots/02_query_answer.png`
- Loom script:
  - `proof/LOOM_SCRIPT.md`
- Raw metrics:
  - `proof/metrics.json`

## What I’d Productionize Next (for a real client)
- Evaluation harness (labeled question set + accuracy metric)
- Source viewer (open/copy the cited chunk text)
- PII redaction + audit log
- Cost per query + rate limiting
- Multi-tenant index strategy
