import { NextResponse } from 'next/server';
import { pinecone, indexName } from '@/lib/pinecone';
// splitter removed (manual chunking)
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function pdfToText(filename: string, buffer: Buffer) {
  try {
    const dir = await mkdtemp(join(tmpdir(), 'reviewpulse-demo-'));
    const pdfPath = join(dir, filename);
    const txtPath = join(dir, `${filename}.txt`);
    await writeFile(pdfPath, buffer);
    await execFileAsync('/opt/homebrew/bin/pdftotext', [pdfPath, txtPath]);
    return (await readFile(txtPath, 'utf8')) || '';
  } catch {
    // worst-case fallback
    return buffer.toString('utf8');
  }
}

export async function POST() {
  try {
    const demoFiles = [
      'Master_Services_Agreement.pdf',
      'NDA_Contract.pdf',
      'SaaS_License_Agreement.pdf',
    ];

    const chunkSize = 500;
    const chunkOverlap = 50;
    const baseIndex = pinecone.index(indexName);
    const namespace = process.env.PINECONE_NAMESPACE || '';
    const index = namespace ? baseIndex.namespace(namespace) : baseIndex;

    const results: Array<{ filename: string; status: 'success' | 'error'; chunks: number; error?: string }> = [];

    for (const filename of demoFiles) {
      try {
        const filePath = join(process.cwd(), 'data', filename);
        const buffer = await readFile(filePath);
        const text = await pdfToText(filename, buffer);
        const clean = (text || '').replace(/\u0000/g, '');
        const chunks: string[] = [];
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

        await index.upsertRecords({ records });
        results.push({ filename, status: 'success', chunks: records.length });
      } catch (e) {
        results.push({ filename, status: 'error', chunks: 0, error: String(e) });
      }
    }

    return NextResponse.json({ status: 'success', results });
  } catch (e) {
    return NextResponse.json({ status: 'error', error: String(e) }, { status: 500 });
  }
}
