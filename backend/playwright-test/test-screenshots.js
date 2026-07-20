const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 414, height: 896 } });
  const page = await ctx.newPage();
  
  // /bowl screenshot
  await page.evaluate(() => localStorage.setItem('bowlingSettings', JSON.stringify({ name: 'Matt', defaultBallId: '', homeLanes: 'Sunset Lanes' })));
  await page.goto('http://localhost:3003/bowl', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/home/mkerns/clawd/og-test/bowl-mobile.png', fullPage: true });
  console.log('bowl screenshot saved');

  // /stats screenshot
  await page.goto('http://localhost:3003/stats', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/home/mkerns/clawd/og-test/stats-mobile.png', fullPage: true });
  console.log('stats screenshot saved');

  await browser.close();
})();
