import { test, expect } from '@playwright/test';

test('Phase 1 Golden Path: demo ingest → query → UI updates', async ({ page }) => {
  // Open app
  await page.goto('/');

  // A2: Demo ingest
  await expect(page.getByRole('button', { name: /demo/i })).toBeVisible();

  // Header status starts at "No docs"
  await expect(page.getByText('No docs', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: /demo/i }).click();

  // Docs appear and eventually ingested.
  await expect(page.getByText(/NDA_Contract\.pdf/i)).toBeVisible();

  // Status pill should become "3 ready" (or similar ready count)
  await expect(page.getByText(/3\s+ready/i)).toBeVisible({ timeout: 60_000 });

  // B3: Query must return answer + update transcript
  const input = page.getByRole('textbox', { name: /ask a question about your documents/i });
  await expect(input).toBeVisible();
  await input.fill('What is the confidentiality term in the NDA?');

  const run = page.getByRole('button', { name: /run query/i });
  await expect(run).toBeEnabled();
  await run.click();

  // Transcript should no longer be empty.
  await expect(page.getByText(/transcript empty/i)).toBeHidden({ timeout: 30_000 });

  // Answer should contain "24" or "months" for this demo NDA.
  await expect(page.getByText(/24\s*months|confidentiality term/i)).toBeVisible({ timeout: 30_000 });

  // Note: UI may not explicitly render citations yet; Phase 2 will assert API returns sources.
  // Here we only assert the user-visible answer updates correctly.
});
