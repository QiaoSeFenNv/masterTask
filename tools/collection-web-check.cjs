/** Real-browser regression checks for collection artwork and its failure fallback. */
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require('playwright-core');
const {browserExecutable} = require('./build-pag-template.cjs');
const {build} = require('./build-web.cjs');
const {createServer} = require('./serve-web.cjs');
const OUTPUT = path.join(__dirname, '.web-preview');

async function click(page, type) {
  const p = await page.evaluate(type => {
    const {requireGame} = rolesPreview;
    const layout = requireGame('js/layout.js'), vp = requireGame('js/env.js').viewport();
    let x, y;
    if (type === 'tab') {
      const r = requireGame('js/render.js').tabbarRects(vp)[2]; x = r.x + r.w / 2; y = r.y + 24;
    } else if (type === 'close') {
      const r = layout.sheetRect(vp); x = 375 - layout.PAD - 32; y = r.y + r.h - 31;
    } else {
      const r = layout.collectionCardRect(type); x = r.x + r.w / 2; y = layout.contentTop(vp) + r.y + r.h / 2;
    }
    const c = document.querySelector('#game').getBoundingClientRect();
    return {x: c.left + x * c.width / 375, y: c.top + y * c.width / 375};
  }, type);
  await page.mouse.click(p.x, p.y);
}
async function open(browser, base, width = 390) {
  const page = await browser.newPage();
  await page.setViewportSize({width, height: width === 320 ? 640 : 844});
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.waitForFunction(() => globalThis.rolesPreview?.game.store.state.status === 'ready');
  await click(page, 'tab');
  await page.waitForFunction(() => rolesPreview.game.store.state.collection.cards.length === 20);
  await page.waitForTimeout(250);await page.evaluate(()=>rolesPreview.game.render());
  assert.match(await page.locator('#status').textContent(), /浏览图鉴/);
  return {page, errors};
}
async function main() {
  if(!process.argv.includes("--no-build"))await build(); await fs.mkdir(OUTPUT, {recursive: true});
  const browser = await chromium.launch({executablePath: await browserExecutable(), headless: true});
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const {page, errors} = await open(browser, base);
    await click(page, 0);
    assert.equal(await page.evaluate(() => rolesPreview.game.store.state.selected), null);
    await page.evaluate(() => {
      const store = rolesPreview.game.store;
      store.state.collection.cards.slice(0, 4).forEach(card => { card.owned = true; card.times = 2; });
      store.emit();
    });
    await page.waitForFunction(() => rolesPreview.requireGame('js/assets.js').role('detective')?.src.includes('role-detective.jpg'));
    await page.screenshot({path: path.join(OUTPUT, 'collection-after.png')});
    await click(page, 0);
    await page.waitForFunction(() => rolesPreview.game.store.state.selected?.id === 'detective');
    await page.screenshot({path: path.join(OUTPUT, 'collection-detail.png')});
    await click(page, 'close');
    await page.waitForFunction(() => rolesPreview.game.store.state.selected === null);
    await page.mouse.wheel(0, 2200);
    await page.waitForFunction(() => rolesPreview.game.store.state.scroll > 0);
    assert.deepEqual(errors, []); await page.close();

    const fallbackContext = await browser.newContext();
    await fallbackContext.route('**/assets/*.jpg', route => route.abort());
    const fallback = await open(fallbackContext, base, 320);
    await fallback.page.evaluate(() => {
      const store = rolesPreview.game.store;
      store.state.collection.cards[0].owned = true; store.state.collection.cards[0].times = 1; store.emit();
    });
    await fallback.page.waitForFunction(() => rolesPreview.requireGame('js/assets.js').pending() === 0);
    assert.equal(await fallback.page.evaluate(() => rolesPreview.requireGame('js/assets.js').role('detective')), null);
    await fallback.page.screenshot({path: path.join(OUTPUT, 'collection-fallback.png')});
    await click(fallback.page, 0);
    await fallback.page.waitForFunction(() => rolesPreview.game.store.state.selected?.id === 'detective');
    await click(fallback.page, 'close');
    await fallback.page.waitForFunction(() => rolesPreview.game.store.state.selected === null);
    assert.deepEqual(fallback.errors, []); await fallbackContext.close();
    console.log('4/4 passed: locked cards; oil-painted cards/details; scroll and page hint; 320px image-failure fallback.');
    console.log('Screenshots: tools/.web-preview/collection-{after,detail,fallback}.png');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
