/** Build the real Canvas game as a self-contained static browser preview. */
const fs = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'web');
const OUTPUT = path.join(WEB, 'dist');
async function build() {
  // Delete only this generated directory; resolve its parent before any recursive operation.
  const root = await fs.realpath(ROOT);
  const parent = await fs.realpath(WEB);
  if (parent !== path.join(root, 'web') || OUTPUT !== path.join(ROOT, 'web', 'dist'))
    throw new Error('Refusing to replace an output directory outside web/dist.');
  await fs.rm(OUTPUT, {recursive: true, force: true});
  await fs.mkdir(path.join(OUTPUT, 'assets'), {recursive: true});
  await fs.mkdir(path.join(OUTPUT, 'vendor', 'pag'), {recursive: true});
  const modules = [];
  const jsRoot = path.join(ROOT, 'game/js');
  for (const name of (await fs.readdir(jsRoot)).filter(name => name.endsWith('.js')).sort()) {
    modules.push(['js/' + name, await fs.readFile(path.join(jsRoot, name), 'utf8')]);
  }
  const roles = JSON.parse(await fs.readFile(path.join(ROOT, 'shared/roles.json'), 'utf8'));
  modules.push(['data/roles.js', 'module.exports = ' + JSON.stringify({version: roles.version, roles: roles.roles}) + ';']);
  for (const name of ['data/reveal-pag.js', 'vendor/pag/libpag.js'])
    modules.push([name, await fs.readFile(path.join(ROOT, 'game', name), 'utf8')]);
  const loader = String.raw`
const cache = Object.create(null);
function resolve(parent, requested) {
  const address = requested.startsWith('.') ? parent.slice(0, parent.lastIndexOf('/') + 1) + requested : requested;
  const parts = [];
  for (const part of address.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!parts.length) throw new Error('Invalid module path'); parts.pop(); }
    else parts.push(part);
  }
  let name = parts.join('/');
  if (!name.endsWith('.js')) name += '.js';
  return name;
}
export function requireGame(requested, parent = '') {
  const name = resolve(parent, requested);
  if (cache[name]) return cache[name].exports;
  const factory = factories[name];
  if (!factory) throw new Error('Preview module missing: ' + name);
  const module = {exports: {}};
  cache[name] = module;
  factory(module, module.exports, child => requireGame(child, name));
  return module.exports;
}
`;
  const bundle = '// Built from the production game modules.\nconst factories = {\n' +
    modules.map(([name, source]) => JSON.stringify(name) + ': function(module, exports, require) {\n' + source + '\n}').join(',\n') +
    '\n};\n' + loader;
  await fs.writeFile(path.join(OUTPUT, 'game.bundle.js'), bundle);
  for (const name of ['index.html', 'style.css', 'main.js', 'preview-api.js', 'wx-bridge.js', 'favicon.svg'])
    await fs.copyFile(path.join(WEB, name), path.join(OUTPUT, name));
  for (const series of ['deep', 'dusk', 'dawn']) for (const kind of ['pack', 'bg']) {
    const name = kind + '-' + series + '.jpg';
    await fs.copyFile(path.join(ROOT, 'game/assets', name), path.join(OUTPUT, 'assets', name));
  }
  await fs.writeFile(path.join(OUTPUT, 'vendor/pag/libpag.wasm'),
    zlib.brotliDecompressSync(await fs.readFile(path.join(ROOT, 'game/vendor/pag/libpag.wasm.br'))));
  for (const name of ['LICENSE.txt', 'NOTICE.txt'])
    await fs.copyFile(path.join(ROOT, 'game/vendor/pag', name), path.join(OUTPUT, 'vendor/pag', name));
  await fs.writeFile(path.join(OUTPUT, 'manifest.json'), JSON.stringify({
    version: 1, builtAt: new Date().toISOString(), roleCount: roles.roles.length,
    sdk: 'libpag-miniprogram@4.3.51', bundleSha256: crypto.createHash('sha256').update(bundle).digest('hex'),
    dataMode: 'browser-local-preview',
  }, null, 2) + '\n');
  console.log('Built Web preview: web/dist (' + roles.roles.length + ' roles; production Canvas and PAG modules).');
  return OUTPUT;
}
if (require.main === module) build().then(() => {
  if (process.argv.includes('--serve')) require('./serve-web.cjs').start();
}).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = {build, OUTPUT};
