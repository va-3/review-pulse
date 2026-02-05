import { NextResponse } from 'next/server';
import { pinecone, indexName } from '@/lib/pinecone';

// Dev-only: clears the Pinecone index used by ReviewPulse.
// Requires ADMIN_TOKEN to avoid accidental use.

export async function POST(req: Request) {
  const isTest = process.env.NODE_ENV === 'test';
  const token = req.headers.get('x-admin-token') || '';
  const expected = process.env.ADMIN_TOKEN || '';

  if (!isTest && (!expected || token !== expected)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const namespace = req.headers.get('x-rp-namespace') || process.env.PINECONE_NAMESPACE || '';
    const index = pinecone.index(indexName);

    if (namespace) {
      await index.deleteNamespace(namespace);
      return NextResponse.json({ ok: true, cleared: { namespace } });
    }

    return NextResponse.json(
      { ok: false, error: 'missing namespace (set PINECONE_NAMESPACE or x-rp-namespace)' },
      { status: 400 },
    );
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
