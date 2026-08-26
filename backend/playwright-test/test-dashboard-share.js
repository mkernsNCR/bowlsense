const { chromium } = require('playwright');
const BASE = 'http://localhost:3003';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  try {
    await page.setViewportSize({ width: 414, height: 896 });
    await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    // Verify Share My Profile button is present (only if totalGames > 0)
    const shareBtn = await page.locator('button:has-text("Share My Profile")');
    const shareBtnCount = await shareBtn.count();
    console.log(`Share My Profile button present: ${shareBtnCount > 0 ? 'YES' : 'NO'}`);

    if (shareBtnCount > 0) {
      await shareBtn.first().click();
      await page.waitForTimeout(500);
      const popover = await page.locator('#dashboard-share-popover');
      const popoverVisible = await popover.isVisible();
      console.log(`Share popover visible after click: ${popoverVisible ? 'YES' : 'NO'}`);

      if (popoverVisible) {
        // Look for the share / copy / X / open profile buttons
        const nativeBtn = await page.locator('#dashboard-share-popover button:has-text("Share")').first();
        const copyBtn = await page.locator('#dashboard-share-popover button:has-text("Copy Link")').first();
        const xBtn = await page.locator('#dashboard-share-popover button:has-text("Share on X")').first();
        const openBtn = await page.locator('#dashboard-share-popover a:has-text("Open Profile Preview")').first();
        const urlBox = await page.locator('#dashboard-share-popover').locator('text=/bowl').first();

        console.log(`Share button present: ${(await nativeBtn.count()) > 0 ? 'YES' : 'NO'}`);
        console.log(`Copy Link button present: ${(await copyBtn.count()) > 0 ? 'YES' : 'NO'}`);
        console.log(`Share on X button present: ${(await xBtn.count()) > 0 ? 'YES' : 'NO'}`);
        console.log(`Open Profile Preview link present: ${(await openBtn.count()) > 0 ? 'YES' : 'NO'}`);
        console.log(`URL box contains /bowl: ${(await urlBox.count()) > 0 ? 'YES' : 'NO'}`);
      }

      // Take screenshot of the share popover open
      await page.screenshot({ path: '/tmp/dashboard-share-popover.png', fullPage: false });
      console.log('Screenshot saved: /tmp/dashboard-share-popover.png');
    }

    // Verify the Public Leaderboard link in Tonight's League card (only fires on the right day-of-week)
    // With Michelob Ultra on Monday and today being Wednesday, this won't be visible.
    // So just confirm the dashboard renders the rest correctly.
    const dashboardText = await page.evaluate(() => document.body.innerText);
    const hasWelcome = dashboardText.includes('Welcome back') || dashboardText.includes('BowlSense') || dashboardText.includes('Dashboard');
    console.log(`Dashboard rendered with hero text: ${hasWelcome ? 'YES' : 'NO'}`);

    console.log(`\nConsole errors during test: ${errors.length}`);
    if (errors.length > 0) {
      errors.slice(0, 5).forEach(e => console.log(`  ERR: ${e.slice(0, 120)}`));
    }

    console.log(`\n✅ Test complete`);
  } catch (e) {
    console.log(`❌ Test failed: ${e.message}`);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
