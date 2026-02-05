import { NextRequest, NextResponse } from 'next/server';
import { pinecone, indexName } from '@/lib/pinecone';
import { IngestRequest, IngestResponse } from '@/lib/types';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function POST(req: NextRequest) {
  try {
    const body: IngestRequest & { text?: string } = await req.json();
    const { filename, content, text: providedText } = body;
    console.log(`[Ingest] Received ${filename}. Content len: ${content?.length}, Text len: ${providedText?.length}`);

    if (!filename || (!content && !providedText)) {
        return NextResponse.json({ status: 'error', message: 'Missing filename or content' }, { status: 400 });
    }

    let text = providedText || '';

    if (!text && content) {
      // Convert base64 to buffer
      const buffer = Buffer.from(content, 'base64');

      // Parse PDF using Poppler (pdftotext) for reliability in Node server env.
      // This avoids DOM/canvas issues from pdf.js-based parsers under Turbopack.
      try {
        const dir = await mkdtemp(join(tmpdir(), 'reviewpulse-'));
        const pdfPath = join(dir, filename);
        const txtPath = join(dir, `${filename}.txt`);

        await writeFile(pdfPath, buffer);
        await execFileAsync('/opt/homebrew/bin/pdftotext', [pdfPath, txtPath]);
        text = (await readFile(txtPath, 'utf8')) || '';
        console.log(`[Ingest] Extracted ${text.length} chars via pdftotext.`);
      } catch (err) {
        console.warn('pdftotext failed, falling back to raw text:', err);
        text = buffer.toString('utf8');
        console.log(`[Ingest] Fallback text len: ${text.length}`);
      }
    }

    // Chunking (avoid langchain subpath export issues under Next/webpack)
    const chunkSize = 500;
    const chunkOverlap = 50;
    const chunks: string[] = [];
    const clean = (text || '').replace(/\u0000/g, '');
    for (let start = 0; start < clean.length; ) {
      const end = Math.min(start + chunkSize, clean.length);
      const chunk = clean.slice(start, end).trim();
      if (chunk) chunks.push(chunk);
      if (end >= clean.length) break;
      start = Math.max(0, end - chunkOverlap);
    }

    const records = chunks.map((chunk_text, i) => ({
      id: `${filename}-${i}`,
      chunk_text,
      source: filename,
      page: i,
    }));

    const index = pinecone.index(indexName);
    await index.upsertRecords({ records });

    const response: IngestResponse = {
      chunks: records.length,
      docId: filename,
      status: 'success'
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Ingest error:', error);
    return NextResponse.json({ status: 'error', message: String(error) }, { status: 500 });
  }
}
