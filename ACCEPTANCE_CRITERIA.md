# ReviewPulse — Phase 0 Acceptance Criteria (Source of Truth)

**Goal:** Define pass/fail conditions for “working as instructed” before adding tests.

This file is the contract that Phases 1–4 must validate. If something isn’t measurable here, it doesn’t count as “done.”

---

## Environment Assumptions
- App runs locally via `npm run dev`.
- Target browser: **Chrome**.
- Viewport reference: **1440×900**.

---

## A. Ingest (Upload → Indexed → Usable)

### A1. Upload UX
**When** user drags/drops 1–N PDFs into the Documents panel
- **Then** each file appears in the docs list within **≤ 1s** with status **ingesting**.
- **Then** status transitions to **ingested** within **≤ 60s** (for typical PDFs; we’ll define a “large PDF” case in Phase 3).
- **Then** the UI never shows duplicate entries for the same file unless the user explicitly uploads twice.

### A2. Demo ingest
**When** user clicks **Demo**
- **Then** demo docs appear within **≤ 1s** and transition to **ingested**.
- **Then** the header status pill reflects correct counts (e.g. `3 ready` or similar).

### A3. Backend ingest contract
- `POST /api/ingest` and `POST /api/demo/ingest` must return **200** with a machine-readable payload.
- For each doc, payload includes at least:
  - `filename`
  - `status` (success/error)
  - `chunks` (number, if success)

### A4. Error handling (ingest)
**When** user uploads a non-PDF or corrupted PDF
- **Then** UI shows status **error** on that item
- **Then** app remains usable (other docs + query still work)

---

## B. Query (Ask → Answer → Cite)

### B1. Disabled state
**When** query input is empty
- **Then** Run Query button is disabled.

### B2. No-doc behavior (anti-hallucination)
**When** there are **0 ingested documents**
- **Then** query must return a clear “no docs / insufficient context” response.
- **Then** it must **not** return fabricated citations/sources.

### B3. Successful answer contract
**When** there is **≥ 1 ingested doc** and user runs a query
- **Then** UI shows “loading/thinking” state within **≤ 200ms**.
- **Then** UI renders an answer within a reasonable time (initial target **≤ 10s p95**; we will measure in Phase 3).
- **Then** response contains:
  - `answer` (string)
  - `sources` (non-empty array of source ids/filenames)
  - `latency_ms` (number)
- **Then** UI shows the sources/citations in some visible form.

### B4. Query correctness (golden checks)
For the demo docs, the following queries must succeed and cite sources:
- “What is the confidentiality term in the NDA?” → must include a duration and a citation.
- “What are the payment terms in the Master Services Agreement?” → must include rate/terms and a citation.

---

## C. Live Frontend ↔ Backend Sync (the core requirement)

### C1. UI reflects backend state transitions
- Ingest status changes (ingesting→ingested/error) must visibly update without manual refresh.
- Header status pill must update as docs become ingested.

### C2. UI reflects query results
- Transcript/answer area must update immediately after query returns.
- If backend returns an error, UI must show an error state (not silent failure).

### C3. Proof/Metrics panel updates
- After each query, latency/proof stats must update in the UI (if the UI displays them).

---

## D. Reliability / Resilience

### D1. No hard crashes
- App must not white-screen on normal actions (upload, demo, query, mode toggle).

### D2. Network failures
If an API call fails (simulated in Phase 3)
- UI shows failure state
- UI recovers after subsequent successful request

---

## E. Performance Targets (initial; refined in Phase 3)
- Query endpoint p95 latency target: **≤ 10s** (local)
- Demo ingest p95 completion: **≤ 60s**

---

## Phase Deliverables Mapping
- **Phase 1:** Playwright Golden Path must validate A2, B3, C1–C3.
- **Phase 2:** API contract + golden query tests validate A3, B2–B4.
- **Phase 3:** Load + failure simulations validate D + E.
- **Phase 4:** Observability validates debuggability when any of the above fails.

---\n
## F. Observability (Phase 4)

### F1. Request Tracing
**When** a query is executed
- **Then** the API response must include a `requestId` (correlation ID).
- **Then** the API response must include a `debug` object with:
  - `retrieval_ms`: time spent on vector search.
  - `llm_ms`: time spent on Anthropic generation.
  - `chunks_count`: how many chunks were fed to the LLM.

### F2. Debug Panel (Developer Visibility)
**When** running in development mode (or if enabled via flag)
- **Then** a "Debug" toggle/panel is available.
- **Then** expanding it shows the raw context chunks (source text) used for the answer.
- **Then** it shows the latency breakdown defined in F1.
