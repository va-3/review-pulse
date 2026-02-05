import { NextRequest, NextResponse } from 'next/server';
import { pinecone, indexName } from '@/lib/pinecone';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(req: NextRequest) {
  const start = Date.now();
  const requestId = crypto.randomUUID();
  const body = await req.json();
  const query = (body?.query || '').toString();

  // Timing markers
  let t_retrieval_start = 0;
  let t_retrieval_end = 0;
  let t_llm_start = 0;
  let t_llm_end = 0;

  if (!query) {
    return NextResponse.json(
      {
        answer: 'Missing query',
        sources: [],
        latency_ms: Date.now() - start,
        requestId,
      },
      { status: 400 },
    );
  }

  try {
    t_retrieval_start = Date.now();
    const baseIndex = pinecone.index(indexName);
    const namespace = req.headers.get('x-rp-namespace') || process.env.PINECONE_NAMESPACE || '';
    const index = namespace ? baseIndex.namespace(namespace) : baseIndex;

    const searchResponse = await index.searchRecords({
      query: {
        inputs: { text: query },
        topK: 6,
      },
    });
    t_retrieval_end = Date.now();

    type PineconeHit = {
      _id?: string;
      fields?: {
        source?: string;
        chunk_text?: string;
      };
      score?: number;
    };

    const hits = (searchResponse?.result?.hits || []) as PineconeHit[];
    const contexts = hits
      .map((m, i) => {
        const source = m?._id || m?.fields?.source || 'unknown';
        const text = (m?.fields?.chunk_text || '').toString();
        const score = m?.score || 0;
        return text ? { i, source, text, score } : null;
      })
      .filter((x): x is { i: number; source: string; text: string; score: number } => Boolean(x));

    const sources = [...new Set(contexts.map((c) => c.source))];

    const contextBlock = contexts.length
      ? contexts
          .map((c) => `[#${c.i} | ${c.source}]\n${c.text}`)
          .join('\n\n---\n\n')
      : '';

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        {
          answer:
            'Server is missing ANTHROPIC_API_KEY. Add it to .env.local then retry.',
          sources,
          latency_ms: Date.now() - start,
          requestId,
        },
        { status: 500 },
      );
    }

    t_llm_start = Date.now();
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    // Pick a conservative default that most Anthropic accounts have access to.
    // Override via ANTHROPIC_MODEL in .env.local if needed.
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';

    const system =
      'You are ReviewPulse, a precise assistant for reviewing documents. Use ONLY the provided context when answering. If the context is insufficient, say so. Keep answers concise and actionable. When you use a fact from context, cite it like [#id].';

    const user = contexts.length
      ? `Question: ${query}\n\nContext:\n${contextBlock}`
      : `Question: ${query}\n\nContext: (none found)`;

    const completion = await anthropic.messages.create({
      model,
      max_tokens: 700,
      temperature: 0.2,
      system,
      messages: [{ role: 'user', content: user }],
    });
    t_llm_end = Date.now();

    const answer = completion.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();

    return NextResponse.json({
      answer: answer || 'No answer generated.',
      sources,
      latency_ms: Date.now() - start,
      requestId,
      debug: {
        retrieval_ms: t_retrieval_end - t_retrieval_start,
        llm_ms: t_llm_end - t_llm_start,
        chunks_count: contexts.length,
        top_score: contexts[0]?.score ?? 0,
      }
    });
  } catch (error) {
    console.error(`Query error [${requestId}]:`, error);
    return NextResponse.json(
      {
        answer: 'Query failed',
        sources: [],
        latency_ms: Date.now() - start,
        requestId,
        error: String(error),
      },
      { status: 500 },
    );
  }
}
