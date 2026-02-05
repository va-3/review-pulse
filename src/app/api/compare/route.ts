import { NextRequest, NextResponse } from 'next/server';
import { pinecone, indexName } from '@/lib/pinecone';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(req: NextRequest) {
  const start = Date.now();
  const requestId = crypto.randomUUID();
  const body = await req.json();
  const { 
    query, 
    docIds, 
    comparisonType = 'differences' 
  } = body as { 
    query: string; 
    docIds: string[]; 
    comparisonType?: 'differences' | 'similarities' | 'summary';
  };

  if (!query || !docIds || docIds.length < 2) {
    return NextResponse.json(
      {
        answer: 'Comparison requires a query and at least 2 documents',
        sources: [],
        latency_ms: Date.now() - start,
        requestId,
      },
      { status: 400 },
    );
  }

  try {
    const baseIndex = pinecone.index(indexName);
    const namespace = req.headers.get('x-rp-namespace') || process.env.PINECONE_NAMESPACE || '';
    const index = namespace ? baseIndex.namespace(namespace) : baseIndex;

    // Fetch context for all selected documents
    const searchResponse = await index.searchRecords({
      query: {
        inputs: { text: query },
        topK: 12, // More chunks for comparison
      },
    });

    type PineconeHit = {
      _id?: string;
      fields?: {
        source?: string;
        chunk_text?: string;
      };
      score?: number;
    };

    const hits = (searchResponse?.result?.hits || []) as PineconeHit[];
    
    // Filter to only selected documents
    const contexts = hits
      .filter((m) => {
        const source = m?._id || m?.fields?.source || '';
        return docIds.some(docId => source.toLowerCase().includes(docId.toLowerCase()));
      })
      .map((m, i) => {
        const source = m?._id || m?.fields?.source || 'unknown';
        const text = (m?.fields?.chunk_text || '').toString();
        const score = m?.score || 0;
        return text ? { i, source, text, score } : null;
      })
      .filter((x): x is { i: number; source: string; text: string; score: number } => Boolean(x));

    // Group by document
    const byDocument = new Map<string, typeof contexts>();
    contexts.forEach(ctx => {
      const existing = byDocument.get(ctx.source) || [];
      existing.push(ctx);
      byDocument.set(ctx.source, existing);
    });

    const sources = Array.from(byDocument.keys());

    // Build comparison prompt
    const contextBlock = contexts.length
      ? contexts
          .map((c) => `[Document: ${c.source}]
${c.text}`)
          .join('\n\n---\n\n')
      : '';

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';

    const system = `You are ReviewPulse Comparison Mode. Analyze documents and provide structured comparisons.

Rules:
- Be precise and cite specific differences
- Use bullet points for clarity
- Highlight contradictions or variations
- If information is missing from a document, state "Not specified in [document name]"
- Be concise but thorough`;

    const comparisonPrompts: Record<string, string> = {
      differences: `Compare the following documents and highlight KEY DIFFERENCES regarding: "${query}"

For each point of difference:
1. State the aspect being compared
2. Show what each document says
3. Note any contradictions

Documents to compare: ${docIds.join(', ')}

Context:
${contextBlock}`,

      similarities: `Analyze the following documents and highlight COMMONALITIES regarding: "${query}"

Show what all documents agree on or share in common.

Documents: ${docIds.join(', ')}

Context:
${contextBlock}`,

      summary: `Provide a comparative summary across these documents for: "${query}"

Structure:
- Overview (1-2 sentences)
- Per-document summary
- Key takeaways

Documents: ${docIds.join(', ')}

Context:
${contextBlock}`
    };

    const userMessage = comparisonPrompts[comparisonType] || comparisonPrompts.differences;

    const completion = await anthropic.messages.create({
      model,
      max_tokens: 1000,
      temperature: 0.2,
      system,
      messages: [{ role: 'user', content: userMessage }],
    });

    const answer = completion.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();

    // Parse answer into structured comparison
    const structured = parseComparisonAnswer(answer, sources);

    return NextResponse.json({
      answer: answer || 'No comparison generated.',
      sources,
      docIds,
      comparisonType,
      structured,
      latency_ms: Date.now() - start,
      requestId,
      debug: {
        chunks_count: contexts.length,
        docs_matched: sources.length,
      }
    });

  } catch (error) {
    console.error(`Comparison error [${requestId}]:`, error);
    return NextResponse.json(
      {
        answer: 'Comparison failed',
        sources: [],
        latency_ms: Date.now() - start,
        requestId,
        error: String(error),
      },
      { status: 500 },
    );
  }
}

function parseComparisonAnswer(answer: string, sources: string[]) {
  // Extract sections like "Document A says..." vs "Document B says..."
  const sections: Array<{
    aspect: string;
    comparisons: Array<{ doc: string; value: string }>;
  }> = [];

  // Simple parsing - look for bullet points and document mentions
  const lines = answer.split('\n');
  let currentSection = '';
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if line starts a new section (bold or numbered)
    if (/^\*\*|^\d+\.|^-/.test(trimmed)) {
      currentSection = trimmed.replace(/^\*\*|^\d+\.\s*|^-\s*/, '').split(':')[0];
    }

    // Extract document-specific statements
    for (const source of sources) {
      if (trimmed.toLowerCase().includes(source.toLowerCase())) {
        const existing = sections.find(s => s.aspect === currentSection);
        if (existing) {
          existing.comparisons.push({ doc: source, value: trimmed });
        } else {
          sections.push({
            aspect: currentSection,
            comparisons: [{ doc: source, value: trimmed }]
          });
        }
      }
    }
  }

  return { sections, raw: answer };
}