const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 414, height: 896 } });
  const page = await ctx.newPage();

  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));

  // Seed localStorage so settings.name is populated
  await page.goto('http://localhost:3003/', { waitUntil: 'networkidle' });
  await page.evaluate(() =>
    localStorage.setItem('bowlingSettings', JSON.stringify({ name: 'Matt', defaultBallId: '', homeLanes: 'Sunset Lanes' }))
  );

  await page.goto('http://localhost:3003/settings', { waitUntil: 'networkidle' });
  // Wait for the Settings heading to be visible
  await page.waitForSelector('h1:has-text("Settings")', { timeout: 10000 });
  // Wait for the Public Profile card to be visible
  await page.waitForSelector('text=Public Profile', { timeout: 10000 });
  // Wait for the OG image to load (it fetches /profile/og-image)
  await page.waitForSelector('img[alt="Public profile preview"]', { timeout: 10000 });
  await page.waitForTimeout(500);

  // Verify the new Public Profile card elements exist
  const checks = [
    { name: 'OG card preview image', selector: 'img[alt="Public profile preview"]' },
    { name: 'Share button', selector: 'button:has-text("Share")' },
    { name: 'Copy Link button', selector: 'button:has-text("Copy Link")' },
    { name: 'X share button', selector: 'button:has-text("Share on X")' },
    { name: 'Open Preview link', selector: 'a:has-text("Open Public Profile Preview")' },
  ];

  let ok = 0;
  for (const c of checks) {
    const count = await page.locator(c.selector).count();
    console.log(`  ${count > 0 ? '✅' : '❌'} ${c.name} (${count} found)`);
    if (count > 0) ok++;
  }

  // Verify the URL display contains the public profile path
  const urlText = await page.locator('text=/\\/bowl/').first().textContent().catch(() => null);
  console.log(`  ${urlText && urlText.includes('/bowl') ? '✅' : '❌'} URL display contains /bowl: ${urlText}`);

  // Screenshot for visual record
  await page.screenshot({ path: '/tmp/settings-public-profile-mobile.png', fullPage: true });
  console.log('📸 Screenshot: /tmp/settings-public-profile-mobile.png');

  console.log(`\nResult: ${ok}/${checks.length} elements present`);
  if (errors.length > 0) {
    console.log('\n⚠️ Errors detected:');
    errors.forEach((e) => console.log('  ' + e));
  } else {
    console.log('✅ No console / page errors');
  }

  await browser.close();
  process.exit(ok === checks.length ? 0 : 1);
})();