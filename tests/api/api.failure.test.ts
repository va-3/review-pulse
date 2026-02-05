import { test, expect } from '@playwright/test';

test.describe('Phase 3B — API Failure Contracts', () => {
  test('missing query returns 400 and valid schema', async ({ request, baseURL }) => {
    const res = await request.post(`${baseURL}/api/query`, { data: {} });
    expect(res.status()).toBe(400);
    const json = await res.json();
    
    expect(json).toHaveProperty('answer');
    expect(json.answer).toMatch(/missing query/i);
    expect(json).toHaveProperty('sources');
    expect(Array.isArray(json.sources)).toBe(true);
    expect(json.sources.length).toBe(0);
    expect(json).toHaveProperty('latency_ms');
  });

  test('invalid method returns 405 or 404', async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/api/query`);
    // Next.js app router usually returns 405 Method Not Allowed or 404 for undefined methods on route handlers
    expect([404, 405]).toContain(res.status());
  });
});
