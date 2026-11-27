const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const env = require('../game/js/env.js');
const draw = require('../game/js/draw.js');
const layout = require('../game/js/layout.js');
const roles = require('../game/data/roles.js').roles;

function setup(images = true) {
  const requests = [], ops = [];
  const wx = { getSystemInfoSync: () => ({windowWidth: 375, windowHeight: 812, pixelRatio: 2}) };
  if (images) wx.createImage = () => {
    const image = {width: 512, height: 768};
    Object.defineProperty(image, 'src', {set(src) { image.source = src; requests.push(image); }});
    return image;
  };
  env.setWx(wx);
  let throwing = false;
  const ctx = new Proxy({
    measureText: text => ({width: String(text).length * 6}),
    createLinearGradient: () => ({addColorStop() {}}),
    drawImage: (...args) => { if (throwing) throw Error('decode failed'); ops.push(['image', ...args]); },
    fillText: (...args) => ops.push(['text', ...args]),
    fill: () => ops.push(['fill']),
  }, {get(target, key) { return key in target ? target[key] : () => {}; }});
  draw.init({width: 750, height: 1624, getContext: () => ctx});
  for (const name of ['assets', 'role-art', 'render']) delete require.cache[require.resolve('../game/js/' + name + '.js')];
  return { requests, ops, assets: require('../game/js/assets.js'), art: require('../game/js/role-art.js'),
    view: require('../game/js/render.js'), failDraw: () => { throwing = true; } };
}
const card = id => ({...roles.find(role => role.id === id), owned: true, times: 2, taskCount: 4});
const rect = {x: 20, y: 100, w: 162.5, h: 243.75, r: 14};
const cards = () => roles.map(role => ({...role, owned: false, times: 0, taskCount: role.tasks.length}));

test('Every registered image ships, and portraits are not eagerly preloaded', () => {
  const {assets, requests} = setup();
  for (const file of Object.values(assets.FILES)) assert.ok(fs.existsSync(path.join(__dirname, '../game/assets', file)), file);
  assets.preload(); assets.preload();
  assert.equal(requests.length, 6);
  assert.ok(requests.every(image => !image.source.includes('role-')));
});
test('Portraits load once on demand and notify the renderer when ready', () => {
  const {assets, requests} = setup(); let redraws = 0;
  assets.onLoad(() => redraws++);
  assert.equal(assets.role('detective'), null); assets.role('detective');
  assert.equal(requests.length, 1); assert.equal(assets.pending(), 1);
  requests[0].onload();
  assert.equal(assets.role('detective'), requests[0]); assert.equal(redraws, 1); assert.equal(assets.pending(), 0);
});
test('Unfinished portraits use painted scenery without requesting nonexistent files', () => {
  const {assets, requests} = setup(); assets.preload(); requests.forEach(image => image.onload());
  for (const role of roles) {
    assert.ok(assets.role(role.id), role.id);
    if (role.id !== 'detective') assert.equal(requests.length, 7);
  }
  assert.equal(requests.length, 7);
});
test('Failed portrait decoding retains scenery without retry storms', () => {
  const {assets, requests} = setup(); assets.preload(); requests.forEach(image => image.onload());
  assets.role('detective'); requests[6].onerror();
  for (let i = 0; i < 3; i++) assert.equal(assets.role('detective'), assets.bg('deep'));
  assert.equal(requests.length, 7); assert.equal(assets.pending(), 0);
});
test('First frame is a complete gradient card, without the old emoji artwork', () => {
  const {art, ops} = setup(false);
  assert.equal(art.paint(rect, card('detective')), false);
  assert.ok(ops.some(op => op[0] === 'fill'));
  const text = ops.filter(op => op[0] === 'text').map(op => op[1]);
  assert.deepEqual(text, ['侦探', '抽到 2 次']);
});
test('Loaded portraits render in both cards and caption-free detail thumbnails', () => {
  const {art, assets, requests, ops} = setup(); assets.role('detective'); requests[0].onload();
  assert.equal(art.paint(rect, card('detective')), true);
  ops.length = 0;
  assert.equal(art.paint(rect, card('detective'), {caption: false}), true);
  assert.equal(ops.filter(op => op[0] === 'image').length, 1);
  assert.equal(ops.filter(op => op[0] === 'text').length, 0);
});
test('Canvas image drawing errors retain a complete gradient fallback', () => {
  const {art, assets, requests, ops, failDraw} = setup(); assets.role('detective'); requests[0].onload(); failDraw();
  assert.equal(art.paint(rect, card('detective')), false);
  assert.ok(ops.some(op => op[0] === 'fill'));
  assert.ok(ops.some(op => op[0] === 'text' && op[1] === '侦探'));
});
test('Locked and offscreen roles never request or reveal their portraits', () => {
  const {view, requests, ops} = setup(); const list = cards();
  const detective = list.shift(); detective.owned = true; list.push(detective);
  view.renderCollection(env.viewport(), {collection: {cards: list, loading: false}, scroll: 0});
  assert.equal(requests.length, 0);
  assert.ok(ops.some(op => op[0] === 'text' && op[1] === '未解锁'));
  assert.ok(!ops.some(op => op[0] === 'text' && op[1] === '侦探'));
});
test('2:3 grid scrolls through the last row with hit zones clipped to content', () => {
  const {view} = setup(false), vp = env.viewport();
  for (let i = 0; i < 20; i++) assert.equal(layout.collectionCardRect(i).h / layout.collectionCardRect(i).w, 1.5);
  const state = {collection: {cards: cards(), loading: false}, scroll: 0};
  const result = view.renderCollection(vp, state);
  state.scroll = result.contentH - layout.contentH(vp);
  const scrolled = view.renderCollection(vp, state);
  assert.ok(scrolled.zones.some(zone => zone.card.id === roles[19].id));
  for (const zone of scrolled.zones) {
    assert.ok(zone.rect.y >= layout.contentTop(vp) + 42);
    assert.ok(zone.rect.y + zone.rect.h <= layout.contentTop(vp) + layout.contentH(vp));
  }
});
test('Detail shows the artwork, role info and close control without overlapping text', () => {
  const {view, assets, requests, ops} = setup(); assets.role('detective'); requests[0].onload();
  const zones = view.renderSheet(env.viewport(), {selected: card('detective')});
  assert.equal(ops.filter(op => op[0] === 'image').length, 1);
  assert.ok(ops.some(op => op[0] === 'text' && op[1] === '累计抽到 2 次'));
  assert.equal(zones[0].id, 'sheet-close');
  assert.ok(ops.filter(op => op[0] === 'text' && op[1] !== '关闭').every(op => op[3] < zones[0].rect.y));
});
