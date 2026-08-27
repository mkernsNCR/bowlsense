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
    // Test at iPhone SE / small Android width (375px)
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(800);

    // Inspect bottom-nav
    const nav = page.locator('.bottom-nav');
    const navBox = await nav.boundingBox();
    console.log(`bottom-nav bounding box: ${JSON.stringify(navBox)}`);

    const items = await page.locator('.bottom-nav-item').all();
    console.log(`bottom-nav-item count: ${items.length}`);

    const viewportWidth = 375;
    let visibleCount = 0;
    let overflowingCount = 0;
    for (let i = 0; i < items.length; i++) {
      const box = await items[i].boundingBox();
      const label = (await items[i].textContent()).trim();
      const fullyVisible = box && box.x >= 0 && (box.x + box.width) <= viewportWidth + 1;
      console.log(`  item[${i}] "${label}": x=${box?.x.toFixed(0)} w=${box?.width.toFixed(0)} → ${fullyVisible ? 'VISIBLE' : 'OFF-SCREEN'}`);
      if (fullyVisible) visibleCount++;
      else overflowingCount++;
    }
    console.log(`VISIBLE: ${visibleCount} / OFF-SCREEN: ${overflowingCount}`);

    await page.screenshot({ path: '/tmp/mobile-nav-before.png', fullPage: false });
    console.log('Screenshot: /tmp/mobile-nav-before.png');

    // Tap the hamburger button to open the drawer
    const ham = page.locator('.hamburger-btn');
    console.log(`hamburger-btn present: ${await ham.count() > 0}`);
    await ham.click();
    await page.waitForTimeout(400);
    const drawer = page.locator('#mobile-nav-drawer');
    console.log(`drawer visible: ${await drawer.isVisible()}`);
    const drawerBox = await drawer.boundingBox();
    console.log(`drawer box: ${JSON.stringify(drawerBox)}`);
    await page.screenshot({ path: '/tmp/mobile-nav-drawer.png', fullPage: false });
    console.log('Screenshot: /tmp/mobile-nav-drawer.png');

    // Verify all menu items reachable by scrolling the drawer
    const allLinks = await page.locator('#mobile-nav-drawer .nav-drawer-item').all();
    console.log(`drawer links total: ${allLinks.length}`);
    const innerNav = page.locator('#mobile-nav-drawer > nav');
    for (let i = 0; i < allLinks.length; i++) {
      await innerNav.evaluate((el, idx) => {
        const links = el.querySelectorAll('.nav-drawer-item');
        if (links[idx]) links[idx].scrollIntoView({ block: 'center' });
      }, i);
      await page.waitForTimeout(50);
      const visible = await allLinks[i].isVisible();
      const label = (await allLinks[i].textContent()).trim();
      console.log(`  link[${i}] "${label}" visible: ${visible}`);
    }
    await page.screenshot({ path: '/tmp/mobile-nav-drawer-scrolled.png', fullPage: false });
    console.log('Screenshot: /tmp/mobile-nav-drawer-scrolled.png (after scroll to bottom)');

    // Close drawer with escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    console.log(`drawer visible after Escape: ${await drawer.isVisible()}`);

    // Close via X button test
    await ham.click();
    await page.waitForTimeout(300);
    const xBtn = page.locator('#mobile-nav-drawer button[aria-label="Close menu"]');
    console.log(`X button count: ${await xBtn.count()}`);
    const xBox = await xBtn.boundingBox();
    console.log(`X button box: ${JSON.stringify(xBox)}`);
    await xBtn.click();
    await page.waitForTimeout(300);
    console.log(`drawer visible after X click: ${await drawer.isVisible()}`);

    // Close via backdrop click
    await ham.click();
    await page.waitForTimeout(300);
    await page.locator('.nav-drawer-overlay').click({ position: { x: 30, y: 400 } });
    await page.waitForTimeout(300);
    console.log(`drawer visible after backdrop click: ${await drawer.isVisible()}`);

    // Visit sessions page — check that list cards render fine
    await page.goto(BASE + '/sessions', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(800);
    const sessionCard = await page.locator('.card').first().boundingBox();
    console.log(`first session card box: ${JSON.stringify(sessionCard)}`);
    await page.screenshot({ path: '/tmp/mobile-sessions.png', fullPage: false });
    console.log('Screenshot: /tmp/mobile-sessions.png');

    console.log(`Console errors: ${errors.length}`);
    errors.forEach(e => console.log(`  ${e}`));
  } catch (err) {
    console.error(`TEST FAILED: ${err.message}`);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
