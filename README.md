# ReviewPulse

ReviewPulse is a precision document‑intelligence engine with a command‑center UI and full‑screen results view. It ingests PDFs, retrieves relevant context, and generates grounded answers with citations.

**Live:** https://positive-nourishment-production.up.railway.app

---

## Why it’s different
Most “chat with PDF” apps feel fragile. ReviewPulse is built for **accuracy + observability**:
- Strict context usage with citations
- Latency and retrieval diagnostics surfaced live
- Clean, distraction‑free full‑screen results view

## Core UX
- **Command Center dashboard** with live visualizer
- **Fullscreen results modal** (text left, orb right)
- **Scrollable answer box** (no main‑page scroll)
- **Session persistence** (refresh doesn’t reset)
- **Reset button** to clear state

## Architecture
- **Ingest**: PDF → Poppler (`pdftotext`) → Chunking → Pinecone vectors
- **Retrieval**: Pinecone Integrated Inference (hybrid)
- **Synthesis**: Anthropic Claude (via SDK)
- **Frontend**: Next.js 16, Tailwind v4, React Three Fiber

## Key Features
- **Precision citations** for every claim
- **Real‑time observability** (latency + retrieval stats)
- **Cross‑browser support** (Chromium, Firefox, WebKit)
- **Mobile‑ready UI** (iPhone + Pixel profiles tested)

## Local Setup

### Prereqs
- Node.js 20+
- `poppler` (PDF extraction): `brew install poppler`
- Pinecone API key
- Anthropic API key

### Install
```bash
npm install
```

### Configure `.env.local`
```env
ANTHROPIC_API_KEY=sk-ant-...
PINECONE_API_KEY=pc-...
PINECONE_INDEX=review-pulse-index
```

### Run
```bash
npm run dev
```

## Tests
```bash
npm run test:e2e
```

## Metrics
- **E2E**: 35/35 tests passing across desktop + mobile profiles
- **Latency**: ~3–6s depending on query + context size

## License
MIT
