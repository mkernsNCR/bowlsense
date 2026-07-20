const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  const allLogs = [];

  page.on('console', msg => {
    allLogs.push(`[${msg.type()}] ${msg.text()}`);
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => {
    errors.push('PAGE ERR: ' + err.message);
    allLogs.push('PAGE ERR: ' + err.message);
  });

  // Test public profile
  console.log('=== Testing /bowl ===');
  const res = await page.goto('http://localhost:3003/bowl', { waitUntil: 'networkidle', timeout: 15000 });
  console.log('status:', res.status());

  // Wait an extra sec for React to render
  await page.waitForTimeout(2000);

  const html = await page.evaluate(() => document.body.innerHTML);
  console.log('body HTML length:', html.length);
  console.log('body HTML (first 1500):', html.substring(0, 1500));
  console.log('errors:', errors);
  console.log('allLogs:');
  allLogs.forEach(l => console.log('  ' + l));

  await browser.close();
})();
