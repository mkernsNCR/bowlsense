const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', err => console.log('PAGE ERR:', err.message));
  page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE ERR:', msg.text()); });
  
  console.log('=== /bowl ===');
  await page.goto('http://localhost:3003/bowl', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const text = await page.evaluate(() => document.body.innerText);
  console.log('innerText length:', text.length);
  console.log('---innerText (first 1500)---');
  console.log(text.substring(0, 1500));
  console.log('---contains checks---');
  console.log('  "BowlSense":', text.includes('BowlSense'));
  console.log('  "Could not load":', text.includes('Could not load'));
  console.log('  "PUBLIC PROFILE":', text.includes('PUBLIC PROFILE'));
  console.log('  "Score Distribution":', text.includes('Score Distribution'));
  console.log('  "Total Games":', text.includes('Total Games'));

  console.log('\n=== /stats ===');
  await page.goto('http://localhost:3003/stats', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const text2 = await page.evaluate(() => document.body.innerText);
  console.log('innerText length:', text2.length);
  console.log(text2.substring(0, 1500));
  console.log('  "Stats":', text2.includes('Stats'));
  console.log('  "Average Score":', text2.includes('Average Score'));
  console.log('  "Score Distribution":', text2.includes('Score Distribution'));

  console.log('\n=== /bowl with name=Alex ===');
  await page.evaluate(() => localStorage.setItem('bowlingSettings', JSON.stringify({ name: 'Alex', defaultBallId: '', homeLanes: '' })));
  await page.goto('http://localhost:3003/bowl', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const text3 = await page.evaluate(() => document.body.innerText);
  console.log('  contains "Alex\\\'s BowlSense":', text3.includes("Alex's BowlSense"));
  console.log('  contains "Matt\\\'s":', text3.includes("Matt's"));
  const og = await page.evaluate(() => {
    const m = document.querySelector('meta[property="og:image"]');
    return m ? m.getAttribute('content') : null;
  });
  console.log('  og:image:', og);

  await browser.close();
})();
