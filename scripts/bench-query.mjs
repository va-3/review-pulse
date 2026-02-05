import fs from 'node:fs/promises';

const ENDPOINT = process.env.REVIEWPULSE_URL || 'http://127.0.0.1:3003';

const questions = [
  'What is the confidentiality term in the NDA?',
  'List the key confidentiality obligations in the NDA.',
  'What are the payment terms in the Master Services Agreement?',
  'What is the governing law or venue mentioned?',
  'Does the SaaS license allow sublicensing?',
  'Summarize the termination provisions across the documents.',
];

function percentile(arr, p) {
  if (!arr.length) return null;
  const a = [...arr].sort((x, y) => x - y);
  const idx = (p / 100) * (a.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return a[lo];
  const w = idx - lo;
  return a[lo] * (1 - w) + a[hi] * w;
}

async function runOnce(query, timeoutMs = 30000) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${ENDPOINT}/api/query`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: ctrl.signal,
    });
    const json = await res.json();
    const wall = Date.now() - t0;
    return {
      ok: res.ok,
      status: res.status,
      latency_ms: json.latency_ms ?? null,
      wall_ms: wall,
      sources: json.sources ?? [],
      answer_preview: (json.answer ?? '').toString().slice(0, 140),
      error: json.error ?? null,
      query,
    };
  } catch (e) {
    const wall = Date.now() - t0;
    return {
      ok: false,
      status: 0,
      latency_ms: null,
      wall_ms: wall,
      sources: [],
      answer_preview: '',
      error: String(e),
      query,
    };
  } finally {
    clearTimeout(t);
  }
}

const runsPerQuestion = Number(process.env.RUNS_PER_Q || 3);
const results = [];

let n = 0;
const total = questions.length * runsPerQuestion;
for (const q of questions) {
  for (let i = 0; i < runsPerQuestion; i++) {
    n++;
    process.stdout.write(`[${n}/${total}] ${q.slice(0, 40)}...\n`);
    results.push(await runOnce(q));
  }
}

const ok = results.filter((r) => r.ok);
const lat = ok.map((r) => r.latency_ms).filter((x) => typeof x === 'number');
const wall = ok.map((r) => r.wall_ms).filter((x) => typeof x === 'number');

const summary = {
  endpoint: ENDPOINT,
  total_runs: results.length,
  ok_runs: ok.length,
  error_runs: results.length - ok.length,
  latency_ms: {
    p50: percentile(lat, 50),
    p95: percentile(lat, 95),
    p99: percentile(lat, 99),
    min: lat.length ? Math.min(...lat) : null,
    max: lat.length ? Math.max(...lat) : null,
  },
  wall_ms: {
    p50: percentile(wall, 50),
    p95: percentile(wall, 95),
    p99: percentile(wall, 99),
    min: wall.length ? Math.min(...wall) : null,
    max: wall.length ? Math.max(...wall) : null,
  },
};

await fs.mkdir('proof', { recursive: true });
await fs.writeFile('proof/metrics.json', JSON.stringify({ summary, results }, null, 2));
console.log('\nSUMMARY');
console.log(JSON.stringify(summary, null, 2));
