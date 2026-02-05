// Phase 3: simple load test for /api/query with p50/p95 metrics
// Usage:
//   node scripts/load-test.mjs --runs 20
//   BASE_URL=http://localhost:5173 node scripts/load-test.mjs --runs 50

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { runs: 20, concurrency: 1 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--runs') out.runs = Number(args[++i] || '20');
    if (args[i] === '--concurrency') out.concurrency = Number(args[++i] || '1');
  }
  return out;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

async function postJson(url, body, headers = {}) {
  const start = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore
  }
  return {
    ok: res.ok,
    status: res.status,
    wall_ms: Date.now() - start,
    json,
    text,
  };
}

async function main() {
  const { runs, concurrency } = parseArgs();

  // Use isolated namespace for perf runs to avoid cross-talk.
  const NS = process.env.PINECONE_NAMESPACE || 'rp-perf';
  const headers = { 'x-rp-namespace': NS, 'x-admin-token': 'rp-e2e' };

  // Reset namespace if possible (best-effort)
  try {
    await postJson(`${BASE_URL}/api/admin/reset`, {}, headers);
  } catch {}

  const ingest = await postJson(`${BASE_URL}/api/demo/ingest`, {}, headers);
  if (!ingest.ok) {
    console.error('demo ingest failed', ingest.status, ingest.text.slice(0, 500));
    process.exit(1);
  }

  const queryBody = { query: 'What is the confidentiality term in the NDA?' };

  const results = [];
  let inflight = 0;
  let idx = 0;

  await new Promise((resolve) => {
    const launchNext = async () => {
      if (idx >= runs && inflight === 0) return resolve();
      while (inflight < concurrency && idx < runs) {
        inflight++;
        const n = idx++;
        (async () => {
          const r = await postJson(`${BASE_URL}/api/query`, queryBody, { ...headers });
          results[n] = r;
        })()
          .catch((e) => {
            results[n] = { ok: false, status: 0, wall_ms: 0, json: null, text: String(e) };
          })
          .finally(() => {
            inflight--;
            launchNext();
          });
      }
    };
    launchNext();
  });

  const ok = results.filter((r) => r?.ok);
  const errs = results.filter((r) => !r?.ok);
  const walls = ok.map((r) => r.wall_ms);

  const report = {
    baseUrl: BASE_URL,
    namespace: NS,
    runs,
    concurrency,
    ok: ok.length,
    errors: errs.length,
    wall_ms: {
      p50: percentile(walls, 50),
      p95: percentile(walls, 95),
      p99: percentile(walls, 99),
      min: walls.length ? Math.min(...walls) : null,
      max: walls.length ? Math.max(...walls) : null,
    },
    sample_error: errs[0]?.text?.slice(0, 300) ?? null,
  };

  console.log(JSON.stringify(report, null, 2));

  // Exit code non-zero if any errors
  if (errs.length) process.exit(2);
}

main();
