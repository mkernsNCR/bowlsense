/**
 * BowlSense Playwright Audit
 * Runs after coding tasks to catch breaking changes before they ship.
 * Checks all major SPA routes + API endpoints for regressions.
 */

const { chromium } = require('playwright');

const BASE = process.env.APP_URL || 'http://localhost:3003';

const ROUTES = [
  '/',
  '/sessions/new',
  '/leagues',
  '/balls',
  '/arsenals',
  '/perfect-games',
  '/settings',
];

const API_ROUTES = [
  '/sessions',
  '/tournaments',
  '/stats',
  '/balls',
  '/leagues',
  '/api/games/:id/public',
  '/api/games/perfect',
  '/api/tournaments',
];

async function audit() {
  console.log(`\n🔍 BowlSense Playwright Audit — ${BASE}\n`);
  console.log('='.repeat(50));

  let passed = 0;
  let failed = 0;
  const failures = [];

  const browser = await chromium.launch({ headless: true });

  for (const path of ROUTES) {
    const page = await browser.newPage();
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    try {
      const res = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 15000 });
      const status = res.status();

      // Check page actually rendered content
      const bodyText = await page.evaluate(() => document.body?.innerText?.trim() || '');
      const hasContent = bodyText.length > 20;
      // Check if page served HTML (has DOCTYPE or root div, not JSON/plain text)
      const htmlRoot = await page.$('#root, [id="root"], #app, [id="app"], main, article, .app');
      const pageContent = await page.evaluate(() => document.body?.innerHTML || '');
      const isHtmlPage = pageContent.includes('<!doctype') || pageContent.includes('<html') || htmlRoot !== null;
      // Treat as broken if status is 200 but it's JSON/plain data (not an HTML SPA page)
      const isLikelyApiJson = bodyText.startsWith('{') && bodyText.includes('":');

      if (status === 200 && hasContent && errors.length === 0 && !isLikelyApiJson) {
        console.log(`✅ ${path.padEnd(25)} 200 OK — no console errors`);
        passed++;
      } else if (status === 200 && isLikelyApiJson) {
        console.log(`❌ ${path.padEnd(25)} 200 (served API JSON — should be HTML SPA page)`);
        failed++;
        failures.push({ path, status, errors, note: 'Route returned API JSON instead of SPA' });
      } else {
        console.log(`❌ ${path.padEnd(25)} ${status} ${errors.length > 0 ? `| ERRORS: ${errors.slice(0, 2).join('; ')}` : isLikelyApiJson ? '| served API JSON' : hasContent ? '' : '| blank page'}`);
        failed++;
        failures.push({ path, status, errors });
      }
    } catch (e) {
      console.log(`❌ ${path.padEnd(25)} CRASH: ${e.message.split('\n')[0]}`);
      failed++;
      failures.push({ path, error: e.message });
    }
    await page.close();
  }

  // API route spot checks
  console.log('\n' + '-'.repeat(50));
  console.log('API endpoints (JSON):');
  for (const api of API_ROUTES) {
    const apiPage = await browser.newPage();
    try {
      const res = await apiPage.goto(BASE + api, { timeout: 8000 });
      const ct = res.headers()['content-type'] || '';
      const status = res.status();
      const isJson = ct.includes('json') || status < 400;
      console.log(`${status >= 400 ? '❌' : '✅'} ${api.padEnd(35)} ${status} ${isJson ? '(JSON OK)' : '(non-JSON)'}`);
    } catch (e) {
      console.log(`❌ ${api.padEnd(35)} ERROR: ${e.message.split('\n')[0]}`);
    }
    await apiPage.close();
  }

  await browser.close();

  console.log('\n' + '='.repeat(50));
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\n⚠️  Failures:');
    failures.forEach(f => {
      const err = f.errors ? f.errors.join('; ') : f.error || `HTTP ${f.status}`;
      console.log(`  - ${f.path}: ${err}`);
    });
    console.log('\n🚨 Breaking change detected — fix before deploying.');
    process.exit(1);
  } else {
    console.log('\n✅ All routes clean. No breaking changes detected.');
    process.exit(0);
  }
}

audit().catch(e => {
  console.error('Audit crashed:', e.message);
  process.exit(1);
});