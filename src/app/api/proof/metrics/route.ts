import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function GET() {
  try {
    const p = join(process.cwd(), 'proof', 'metrics.json');
    const raw = await readFile(p, 'utf8');
    const json = JSON.parse(raw);
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json(
      { error: 'Missing proof metrics', detail: String(e) },
      { status: 404 },
    );
  }
}
