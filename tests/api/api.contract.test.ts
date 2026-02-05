import { test, expect } from '@playwright/test';

test.describe('Phase 2 — API contract + golden queries', () => {
  test('demo ingest returns expected schema', async ({ request, baseURL }) => {
    const res = await request.post(`${baseURL}/api/demo/ingest`, { data: {} });
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json).toHaveProperty('status');
    expect(json.status).toBe('success');
    expect(json).toHaveProperty('results');
    expect(Array.isArray(json.results)).toBe(true);
    expect(json.results.length).toBeGreaterThanOrEqual(1);

    for (const r of json.results) {
      expect(r).toHaveProperty('filename');
      expect(typeof r.filename).toBe('string');
      expect(r).toHaveProperty('status');
      expect(typeof r.status).toBe('string');
      if (r.status === 'success') {
        expect(r).toHaveProperty('chunks');
        expect(typeof r.chunks).toBe('number');
        expect(r.chunks).toBeGreaterThan(0);
      }
    }
  });

  test('query with docs returns answer + sources[] + latency_ms', async ({ request, baseURL }) => {
    // Ensure docs are ingested
    await request.post(`${baseURL}/api/demo/ingest`, { data: {} });

    const q = { query: 'What is the confidentiality term in the NDA?' };
    const res = await request.post(`${baseURL}/api/query`, { data: q });
    expect(res.ok()).toBeTruthy();
    const json = await res.json();

    expect(json).toHaveProperty('answer');
    expect(typeof json.answer).toBe('string');
    expect(json.answer.length).toBeGreaterThan(0);

    expect(json).toHaveProperty('sources');
    expect(Array.isArray(json.sources)).toBe(true);
    expect(json.sources.length).toBeGreaterThan(0);

    expect(json).toHaveProperty('latency_ms');
    expect(typeof json.latency_ms).toBe('number');
    expect(json.latency_ms).toBeGreaterThan(0);

    // Golden check: should mention the term.
    expect(json.answer.toLowerCase()).toMatch(/24\s*months|confidentiality/);

    // Phase 4 Observability Check
    expect(json).toHaveProperty('requestId');
    expect(json).toHaveProperty('debug');
    expect(json.debug).toHaveProperty('retrieval_ms');
    expect(json.debug).toHaveProperty('llm_ms');
  });

  test('no-doc behavior: query should refuse / no sources (unique namespace)', async ({ request, baseURL }) => {
    // Use a random namespace to guarantee it's empty without relying on reset timing
    const uniqueNs = `test-nodoc-${Date.now()}`;
    const headers = { 'x-rp-namespace': uniqueNs };

    const q = { query: 'What documents do you have?' };
    const res = await request.post(`${baseURL}/api/query`, { data: q, headers });
    expect(res.ok()).toBeTruthy();
    const json = await res.json();

    expect(json).toHaveProperty('answer');
    expect(typeof json.answer).toBe('string');

    // Anti-hallucination: must have no sources when there is no context.
    expect(json).toHaveProperty('sources');
    expect(Array.isArray(json.sources)).toBe(true);
    expect(json.sources.length).toBe(0);

    // Answer should indicate no context/docs.
    expect(json.answer.toLowerCase()).toMatch(/no docs|no documents|insufficient context|upload|none found/i);
  });
});
