const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:3003/leagues', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const text = await page.evaluate(() => document.body.innerText);
  console.log('text length:', text.length);
  console.log('text (first 800):', text.substring(0, 800));
  console.log('contains "Michelob Ultra":', text.includes('Michelob Ultra'));
  console.log('contains "BowlSense":', text.includes('BowlSense'));
  console.log('contains "Leagues" (nav):', text.includes('Leagues'));
  console.log('contains "[{\\"id\\"":', text.includes('[{"id":'));
  await browser.close();
})();
