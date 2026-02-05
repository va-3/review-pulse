import { NextRequest, NextResponse } from 'next/server';
import { pinecone, indexName } from '@/lib/pinecone';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(req: NextRequest) {
  const start = Date.now();
  const requestId = crypto.randomUUID();
  const body = await req.json();
  const { query, strategy = 'auto' } = body;

  if (!query) {
    return NextResponse.json(
      { error: 'Missing query', requestId },
      { status: 400 }
    );
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';
    const baseIndex = pinecone.index(indexName);
    const namespace = req.headers.get('x-rp-namespace') || process.env.PINECONE_NAMESPACE || '';
    const index = namespace ? baseIndex.namespace(namespace) : baseIndex;

    // Step 1: Analyze if decomposition is needed
    const analysisPrompt = `Analyze this query: "${query}"

Determine if this requires breaking into multiple sub-queries or can be answered directly.

Respond with JSON only:
{
  "needsDecomposition": boolean,
  "reasoning": "brief explanation",
  "subQueries": ["query 1", "query 2"] // if needed, max 3
}`;

    const analysis = await anthropic.messages.create({
      model,
      max_tokens: 500,
      temperature: 0,
      messages: [{ role: 'user', content: analysisPrompt }],
    });

    const analysisText = analysis.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();

    let decomposition;
    try {
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      decomposition = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      decomposition = { needsDecomposition: false, reasoning: 'Parse error' };
    }

    // If no decomposition needed, run regular query
    if (!decomposition?.needsDecomposition || !decomposition.subQueries?.length) {
      return NextResponse.json({
        decomposed: false,
        originalQuery: query,
        reasoning: decomposition?.reasoning || 'Direct query',
        result: null,
        requestId,
        latency_ms: Date.now() - start,
      });
    }

    // Step 2: Execute sub-queries in parallel
    const subQueryResults = await Promise.all(
      decomposition.subQueries.map(async (subQ: string, idx: number) => {
        const subStart = Date.now();
        
        // Retrieve context
        const searchResponse = await index.searchRecords({
          query: { inputs: { text: subQ }, topK: 4 },
        });

        const hits = (searchResponse?.result?.hits || []) as any[];
        const contexts = hits
          .map((m) => ({
            source: m?._id || m?.fields?.source || 'unknown',
            text: m?.fields?.chunk_text || '',
            score: m?.score || 0,
          }))
          .filter((c) => c.text);

        // Generate answer for sub-query
        const subAnswer = await anthropic.messages.create({
          model,
          max_tokens: 400,
          temperature: 0.2,
          system: 'Answer concisely using only provided context.',
          messages: [{
            role: 'user',
            content: `Question: ${subQ}\n\nContext:\n${contexts.map((c, i) => `[${i + 1}] ${c.text}`).join('\n\n')}`,
          }],
        });

        return {
          step: idx + 1,
          query: subQ,
          answer: subAnswer.content.map((b) => (b.type === 'text' ? b.text : '')).join(''),
          sources: [...new Set(contexts.map((c) => c.source))],
          retrievalMs: Date.now() - subStart,
          chunksUsed: contexts.length,
        };
      })
    );

    // Step 3: Synthesize final answer
    const synthesisPrompt = `Original question: "${query}"

Step-by-step findings:
${subQueryResults.map((r) => `Step ${r.step} (${r.query}): ${r.answer}`).join('\n\n')}

Synthesize these findings into a cohesive final answer. Be concise but thorough.`;

    const synthesis = await anthropic.messages.create({
      model,
      max_tokens: 600,
      temperature: 0.2,
      messages: [{ role: 'user', content: synthesisPrompt }],
    });

    const finalAnswer = synthesis.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();

    return NextResponse.json({
      decomposed: true,
      originalQuery: query,
      reasoning: decomposition.reasoning,
      steps: subQueryResults,
      finalAnswer,
      requestId,
      latency_ms: Date.now() - start,
      debug: {
        totalSteps: subQueryResults.length,
        avgRetrievalMs: Math.round(
          subQueryResults.reduce((a, b) => a + b.retrievalMs, 0) / subQueryResults.length
        ),
      },
    });

  } catch (error) {
    console.error(`Decompose error [${requestId}]:`, error);
    return NextResponse.json(
      { error: String(error), requestId },
      { status: 500 }
    );
  }
}