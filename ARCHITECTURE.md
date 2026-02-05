# ReviewPulse: RAG Engine Architecture

## Overview
ReviewPulse is an omni-channel AI agent (Voice, Text, CRM Action).
Phase 1 focuses on the "Brain": a RAG API that serves intelligent responses to both the Vapi voice layer and the web UI.

## Technology Stack
- **Language:** TypeScript (Next.js API Routes) + Python (FastAPI for RAG service if needed, but Next.js/LangChain.js is preferred for unified stack).
- **Vector DB:** Pinecone (Serverless)
- **Embeddings:** OpenAI text-embedding-3-small (Cost/Performance sweet spot)
- **LLM:** GPT-4o-mini (Fast, cheap, good enough for RAG) or Gemini 1.5 Flash (Huge context).
- **Orchestration:** LangChain.js

## Core Components

### 1. Ingestion Pipeline (`/api/ingest`)
- **Input:** PDF documents (Pricing, FAQs, Company Info).
- **Process:**
  1. Parse PDF to text (pdf-parse).
  2. Chunking (RecursiveCharacterTextSplitter, ~500 chars, 50 overlap).
  3. Embedding (OpenAI).
  4. Upsert to Pinecone.

### 2. Retrieval Engine (`/api/query`)
- **Input:** User query (Audio transcript or text).
- **Process:**
  1. Embed query.
  2. Vector Search (Pinecone) -> Top 3 chunks.
  3. Prompt Engineering: "You are a helpful support agent. Answer using ONLY these chunks..."
  4. LLM Generation.
- **Output:** JSON `{"answer": "...", "sources": [...]}`

### 3. Vapi Helper (`/api/vapi-webhook`)
- **Role:** Middleware for the Voice AI.
- **Process:**
  1. Receive function call from Vapi (`tool_call`).
  2. Route to `/api/query`.
  3. Return result to Vapi to speak.

## Database Schema (Prisma/PostgreSQL - Lightweight)
```prisma
model Document {
  id        String   @id @default(cuid())
  name      String
  content   String   @db.Text
  createdAt DateTime @default(now())
}

model Lead {
  id        String   @id @default(cuid())
  email     String?
  phone     String?
  summary   String?
  status    String   @default("new") // new, contacted, closed
  createdAt DateTime @default(now())
}
```

## Success Metrics (Phase 1)
- **Latency:** < 1.5s for full RAG roundtrip (critical for voice).
- **Accuracy:** Answers "What is your pricing?" correctly using the PDF.
- **Stability:** Handles 10 concurrent requests without crashing.
