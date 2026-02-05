const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Navigate
  await page.goto('http://localhost:3000');
  await page.waitForSelector('text=ReviewPulse');
  console.log('✅ Page loaded');
  
  // Click Demo
  await page.click('button:has-text("Demo")');
  await page.waitForSelector('text=Master_Services_Agreement', { timeout: 10000 });
  console.log('✅ Demo docs loaded');
  
  // Click Compare mode
  await page.click('button:has-text("Compare")');
  await page.waitForTimeout(300);
  console.log('✅ Compare mode activated');
  
  // Select first two docs
  await page.click('text=Master_Services_Agreement.pdf');
  await page.click('text=NDA_Contract.pdf');
  console.log('✅ 2 docs selected');
  
  // Type comparison query
  await page.fill('input[placeholder*="compare"]', 'payment terms');
  console.log('✅ Query entered');
  
  // Click Compare button (the one in the query bar - specifically the submit button)
  // We can target it by the specific violet border class or just use the second "Compare" button on page
  const compareBtn = page.locator('button:has-text("Compare")').nth(1);
  await compareBtn.click();
  console.log('✅ Compare button clicked, waiting for result...');
  
  // Wait explicitly for the structured content headers
  try {
    await page.waitForFunction(() => {
      const content = document.body.innerText;
      return content.includes("KEY DIFFERENCES") || content.includes("ASPECT") || content.includes("PAYMENT");
    }, { timeout: 35000 });
    console.log('✅ Comparison headers detected');
  } catch (e) {
    console.log('⚠️ Timeout waiting for headers, dumping body text...');
    const text = await page.textContent('body');
    console.log(text.substring(0, 500));
  }
  
  // Wait for layout
  await page.waitForTimeout(2000);
  
  // Take high-res screenshot
  await page.screenshot({ path: '/Users/vishnuanapalli/.openclaw/workspace/portfolio/review-pulse/proof/final-comparison-success.png', fullPage: true });
  console.log('✅ Final proof screenshot saved');
  
  // Validation Assertions
  const bodyText = await page.textContent('body');
  const hasPayment = bodyText.toLowerCase().includes('payment');
  const hasTerm = bodyText.toLowerCase().includes('net 30') || bodyText.toLowerCase().includes('120');
  
  if (hasPayment && hasTerm) {
    console.log('🎉 SUCCESS: comparison logic verified (found "payment" and specific terms)');
  } else {
    console.log('❌ FAILURE: Specific terms not found in UI');
  }
  
  await browser.close();
})();