/**
 * BowlSense Playwright test — Dashboard 300 Club share popover
 *
 * Verifies that:
 *  - The 300 Club card renders on the Dashboard when perfect games exist
 *  - The "Share This 300" button toggles a popover with 4 share actions + URL
 *  - The copy link button transitions to "Copied!" state
 *  - The card is hidden when no perfect games exist (negative-path coverage skipped — demo seed always has 2)
 *  - Zero JS console errors
 */

const { chromium } = require('playwright');

const BASE = process.env.APP_URL || 'http://localhost:3003';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 896 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

  const failures = [];
  const ok = [];

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

  // 1) 300 Club card visible (demo seed always seeds 2 perfect games)
  const card = page.locator('text=🏆 300 CLUB').first();
  await card.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {
    failures.push('❌ 300 CLUB badge not visible on Dashboard');
  });
  if (await card.isVisible().catch(() => false)) ok.push('✅ 300 CLUB badge visible');

  // 2) Score 300 in large text visible (use the card-specific scope to avoid footer/nav collisions)
  const cardScope = page.locator('div').filter({ hasText: '🏆 300 CLUB' }).first();
  const scoreVisible = await cardScope.locator('text=/^300$/').first().isVisible().catch(() => false);
  if (scoreVisible) ok.push('✅ Score 300 visible in card');
  else failures.push('❌ Score 300 not visible');

  // 3) Share button present and toggles popover
  const shareBtn = page.locator('button:has-text("Share This 300")').first();
  await shareBtn.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {
    failures.push('❌ "Share This 300" button not visible');
  });

  if (await shareBtn.isVisible().catch(() => false)) {
    await shareBtn.click();
    await page.waitForTimeout(200);

    // Popover dialog visible
    const dialog = page.locator('[role="dialog"][aria-label="Share your perfect 300 game"]').first();
    const dialogVisible = await dialog.isVisible().catch(() => false);
    if (dialogVisible) ok.push('✅ Share popover dialog opens on click');
    else failures.push('� Share popover dialog not visible after click');

    // URL text present (looks like /score/N)
    const urlText = await page.locator('text=/score/').first().textContent().catch(() => null);
    if (urlText && urlText.includes('/score/')) ok.push(`✅ Share URL displayed: ${urlText.trim()}`);
    else failures.push('❌ Share URL not displayed in popover');

    // 4 buttons: Copy Link, Share, X, Download PNG
    const copyBtn = page.locator('button:has-text("Copy Link")').first();
    const nativeBtn = page.locator('button:has-text("📱 Share")').first();
    const xBtn = page.locator('button:has-text("Post to X")').first();
    const dlBtn = page.locator('button:has-text("Download PNG")').first();

    for (const [label, loc] of [['Copy Link', copyBtn], ['� Share', nativeBtn], ['Post to X', xBtn], ['Download PNG', dlBtn]]) {
      if (await loc.isVisible().catch(() => false)) ok.push(`✅ "${label}" button visible`);
      else failures.push(`❌ "${label}" button not visible`);
    }

    // Click Copy Link — should transition to "Copied!" state
    await copyBtn.click();
    await page.waitForTimeout(300);
    const copiedBtn = page.locator('button:has-text("Copied!")').first();
    const copiedVisible = await copiedBtn.isVisible().catch(() => false);
    if (copiedVisible) ok.push('✅ Copy Link transitions to "Copied!" state');
    else failures.push('❌ Copy Link did not transition to "Copied!"');

    // Toggle off
    await page.waitForTimeout(200);
    const hideBtn = page.locator('button:has-text("Hide Share")').first();
    if (await hideBtn.isVisible().catch(() => false)) {
      await hideBtn.click();
      await page.waitForTimeout(200);
      const stillVisible = await page.locator('[role="dialog"][aria-label="Share your perfect 300 game"]').first().isVisible().catch(() => false);
      if (!stillVisible) ok.push('✅ Clicking again closes the popover');
      else failures.push('❌ Popover did not close on second click');
    }
  }

  await page.screenshot({ path: '/tmp/dashboard-300-share.png', fullPage: false });

  // Console error gate
  if (consoleErrors.length === 0) ok.push('✅ Zero JS console errors');
  else failures.push(`❌ Console errors: ${consoleErrors.join(' | ')}`);

  await browser.close();

  console.log('\n🧪 Dashboard 300 Club share popover');
  console.log('====================================');
  ok.forEach((m) => console.log(m));
  if (failures.length) {
    failures.forEach((m) => console.log(m));
    console.log(`\n❌ ${failures.length} failure(s)`);
    process.exit(1);
  } else {
    console.log(`\n✅ All ${ok.length} checks passed.`);
  }
})();
