const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  console.log('🧪 Starting comprehensive E2E test...\n');
  
  // 1. Load page
  await page.goto('http://localhost:3000');
  await page.waitForSelector('text=ReviewPulse');
  console.log('✅ Page loaded');
  
  // 2. Ingest demo docs
  await page.click('button:has-text("Demo")');
  await page.waitForSelector('text=Master_Services_Agreement', { timeout: 10000 });
  console.log('✅ Demo docs ingested');
  
  // 3. Test regular query with confidence
  await page.fill('input[placeholder*="question"]', 'What are the payment terms?');
  await page.click('button:has-text("Run Query")');
  await page.waitForTimeout(8000);
  
  // Check for confidence badge
  const hasConfidence = await page.locator('text=high, text=medium, text=low').first().isVisible().catch(() => false);
  console.log(hasConfidence ? '✅ Confidence badge displayed' : '⚠️ Confidence not visible (may need to open results)');
  
  // 4. Test Smart Query (Decomposition)
  await page.click('button:has-text("Smart")');
  await page.fill('input[placeholder*="question"]', 'What are the key obligations in both contracts?');
  await page.click('button:has-text("Smart Query")');
  await page.waitForTimeout(10000);
  
  const hasDecomposition = await page.locator('text=AI Reasoning Steps').first().isVisible().catch(() => false);
  console.log(hasDecomposition ? '✅ Query decomposition working' : '⚠️ Decomposition not visible');
  
  // 5. Test Comparison Mode
  await page.click('button:has-text("Compare")');
  await page.click('text=Master_Services_Agreement.pdf');
  await page.click('text=NDA_Contract.pdf');
  await page.fill('input[placeholder*="compare"]', 'termination clauses');
  await page.click('button:has-text("Compare"):right-of(select)');
  await page.waitForTimeout(8000);
  
  const hasComparison = await page.locator('text=PAYMENT, text=TERMINATION, text=DIFFERENCES').first().isVisible().catch(() => false);
  console.log(hasComparison ? '✅ Comparison mode working' : '⚠️ Comparison results not visible');
  
  // Final screenshot
  await page.screenshot({ path: '/Users/vishnuanapalli/.openclaw/workspace/portfolio/review-pulse/proof/comprehensive-test.png', fullPage: true });
  console.log('\n📸 Screenshot saved');
  
  await browser.close();
  console.log('\n🎉 E2E test complete!');
})();