import { test, expect } from '@playwright/test';

test('Phase 3B — UI handles network failure gracefully', async ({ page }) => {
  await page.goto('/');

  // Setup: Ensure we have docs (demo ingest) so we can try to query
  await page.getByRole('button', { name: /demo/i }).click();
  await expect(page.getByText(/ready/i).first()).toBeVisible({ timeout: 60000 });

  const input = page.getByRole('textbox', { name: /ask a question/i });
  await input.fill('This request will fail');

  // Intercept and fail the query request
  await page.route('**/api/query', route => route.abort('failed'));

  await page.getByRole('button', { name: /run query/i }).click();

  // Expect UI to show error state (not stay loading forever)
  // Look for error message in the transcript or a toast/status update
  // Since we haven't explicitly built a "toast" for network errors, we check if the loading state clears
  // and potentially if the transcript shows a generic error or just stops "Thinking..."
  
  // Note: Current UI implementation might just log to console or show "Thinking..." indefinitely if not handled.
  // This test essentially asserts we *have* handling.
  // Let's assume the UI should stop "Thinking..." at minimum.
  await expect(page.getByText('Thinking...')).toBeHidden({ timeout: 10000 });
  
  // Clean up route for next actions
  await page.unroute('**/api/query');
});
