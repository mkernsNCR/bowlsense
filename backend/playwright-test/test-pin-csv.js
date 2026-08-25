const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto('http://localhost:3003/pin-leaves', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // Check button is present
  const btn = await page.$('a[href="/api/analytics/pin-leaves/export.csv"]');
  if (!btn) { console.log('FAIL: button not found'); process.exit(1); }
  const text = (await btn.textContent())?.trim();
  console.log('Button text:', text);

  // Trigger actual download and capture
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 5000 }),
    btn.click(),
  ]);
  const path = await download.path();
  const content = fs.readFileSync(path, 'utf8');
  const lines = content.split('\n');
  console.log('Download filename:', download.suggestedFilename());
  console.log('CSV header:', lines[0]);
  console.log('CSV row count (excl. header):', lines.filter(l => l.trim()).length - 1);
  console.log('First data row:', lines[1]);

  console.log('JS errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
