const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', err => console.log('PAGE ERR:', err.message));
  page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE ERR:', msg.text()); });
  
  const tests = [
    { name: '/bowl (no name)', url: 'http://localhost:3003/bowl', checks: ['BowlSense', 'PUBLIC PROFILE', 'Score Distribution'] },
    { name: '/stats', url: 'http://localhost:3003/stats', checks: ['Stats', 'Score Distribution', 'Average Score'] },
    { name: '/leagues (hard refresh)', url: 'http://localhost:3003/leagues', checks: ['BowlSense', 'Michelob Ultra'] },
    { name: '/sessions (hard refresh)', url: 'http://localhost:3003/sessions', checks: ['BowlSense', 'All Sessions'] },
    { name: '/balls (hard refresh)', url: 'http://localhost:3003/balls', checks: ['BowlSense', 'Balls'] },
    { name: '/tournaments (hard refresh)', url: 'http://localhost:3003/tournaments', checks: ['BowlSense', 'Tournament'] },
    { name: '/arsenals (hard refresh)', url: 'http://localhost:3003/arsenals', checks: ['BowlSense', 'Arsenal'] },
  ];

  for (const test of tests) {
    console.log(`\n=== ${test.name} ===`);
    try {
      const res = await page.goto(test.url, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1200);
      const text = await page.evaluate(() => document.body.innerText);
      const contentType = await page.evaluate(() => {
        const m = document.querySelector('meta[charset]');
        return m ? 'HTML' : 'unknown';
      });
      const hasDoctype = await page.evaluate(() => document.doctype !== null);
      console.log(`  status: ${res.status()}, content-type: ${contentType}, hasDoctype: ${hasDoctype}, text length: ${text.length}`);
      for (const check of test.checks) {
        console.log(`  contains "${check}": ${text.includes(check)}`);
      }
    } catch (e) {
      console.log(`  ERROR: ${e.message}`);
    }
  }

  // Test public profile with name from localStorage
  console.log('\n=== /bowl with name=Alex ===');
  await page.evaluate(() => localStorage.setItem('bowlingSettings', JSON.stringify({ name: 'Alex', defaultBallId: '', homeLanes: '' })));
  await page.goto('http://localhost:3003/bowl', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const text = await page.evaluate(() => document.body.innerText);
  console.log(`  contains "Alex's BowlSense": ${text.includes("Alex's BowlSense")}`);
  console.log(`  contains "Matt's": ${text.includes("Matt's")}`);
  const og = await page.evaluate(() => {
    const m = document.querySelector('meta[property="og:image"]');
    return m ? m.getAttribute('content') : null;
  });
  console.log(`  og:image: ${og}`);
  console.log(`  document.title: ${await page.title()}`);

  await browser.close();
})();
