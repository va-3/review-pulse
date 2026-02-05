const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Navigate and wait for load
  await page.goto('http://localhost:3000');
  await page.waitForSelector('text=ReviewPulse');
  
  // Click Demo button
  await page.click('button:has-text("Demo")');
  
  // Wait for docs to appear (max 10s)
  await page.waitForSelector('text=Master_Services_Agreement', { timeout: 10000 });
  
  // Take screenshot
  await page.screenshot({ path: '/Users/vishnuanapalli/.openclaw/workspace/portfolio/review-pulse/proof/flow-test.png', fullPage: false });
  
  // Click Compare mode
  await page.click('button:has-text("Compare")');
  await page.waitForTimeout(500);
  
  // Select first two docs
  await page.click('text=Master_Services_Agreement.pdf');
  await page.click('text=NDA_Contract.pdf');
  
  // Type comparison query
  await page.fill('input[placeholder*="compare"]', 'termination clauses');
  
  // Take screenshot of selection state
  await page.screenshot({ path: '/Users/vishnuanapalli/.openclaw/workspace/portfolio/review-pulse/proof/compare-selection.png', fullPage: false });
  
  await browser.close();
  console.log('Screenshots captured');
})();