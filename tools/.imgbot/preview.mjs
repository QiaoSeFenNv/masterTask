/**
 * 卡包各阶段的浏览器预览（验证生成图真的贴上去了）。
 *
 *   node preview.mjs [--stage pack|tear|ring|top|pick] [--out shot.png]
 *
 * 起一个只读 game/ 的静态小服务，在页面里塞一个最小 CommonJS 加载器，
 * 直接跑真实的 packview.js / draw.js / assets.js，再用真 Chrome 截图。
 * 不参与构建，只是给「图有没有接对」用眼睛确认一下。
 */
import { chromium } from "playwright-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const CHROME =
  process.env.CHROME_PATH ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe";

const GAME = path.resolve("../../game");
const argOf = (n, d) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : d;
};
const OUT = path.resolve(argOf("--out", "preview-pack.png"));
const STAGE = argOf("--stage", "pack");
const PHASE = argOf("--phase", "");
const W = 375;
const H = 812;

const MIME = {
  ".js": "text/javascript; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".json": "application/json",
};

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;background:#0a0d14}canvas{display:block}</style>
</head><body>
<canvas id="cv"></canvas>
<script>
const FILES = {}; // path -> source
const CACHE = {};

function dirname(p){ const i = p.lastIndexOf("/"); return i < 0 ? "" : p.slice(0, i); }
function normalize(p){
  const out = [];
  for (const seg of p.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") out.pop(); else out.push(seg);
  }
  return out.join("/");
}
function load(path){
  if (CACHE[path]) return CACHE[path].exports;
  const src = FILES[path];
  if (src == null) throw new Error("module not found: " + path);
  const module = { exports: {} };
  CACHE[path] = module;
  const fn = new Function("require", "module", "exports", src);
  const req = (spec) => {
    if (!spec.startsWith(".")) throw new Error("bare require: " + spec);
    return load(normalize(dirname(path) + "/" + spec));
  };
  fn(req, module, module.exports);
  return module.exports;
}

/* ---- 最小的 wx 替身 ---- */
const images = {};
const wxMock = {
  createImage(){
    const img = new Image();
    img.onload = () => { images[img.datasetKey] = img; };
    const origSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
    Object.defineProperty(img, "src", {
      set(v){ img.datasetKey = v; origSrc.set.call(img, v); },
      get(){ return origSrc.get.call(img); },
    });
    return img;
  },
  getStorageSync(){ return ""; },
  setStorageSync(){},
  getSystemInfoSync(){
    return { windowWidth: ${W}, windowHeight: ${H}, screenWidth: ${W}, screenHeight: ${H},
             pixelRatio: 1, safeArea: { top: 44, bottom: ${H - 34} } };
  },
  createOffscreenCanvas(){ return document.createElement("canvas"); },
  showToast(){}, vibrateShort(){},
  onTouchStart(){}, onTouchMove(){}, onTouchEnd(){},
};

window.__run = async function(order, stage, phase){
  for (const p of order) {
    const res = await fetch(p);
    FILES[p] = await res.text();
  }
  const env = load("js/env.js");
  env.setWx(wxMock);
  env.refreshMetrics();
  const draw = load("js/draw.js");
  const layout = load("js/layout.js");
  const theme = load("js/theme.js");
  const pack = load("js/pack.js");
  const packview = load("js/packview.js");
  const assets = load("js/assets.js");
  const backdrop = load("js/backdrop.js");
  const starfield = load("js/starfield.js");

  const dpr = 2;
  const cv = document.getElementById("cv");
  cv.width = ${W} * dpr;
  cv.height = ${H} * dpr;
  cv.style.width = ${W} + "px";
  cv.style.height = ${H} + "px";
  draw.init(cv);
  draw.clear();

  const vp = env.viewport();
  const back = () =>
    draw.fillGradientRect(0, 0, vp.width, vp.height, [theme.bgTop, theme.bgMid, theme.bgBottom], 90, 0);

  back();
  assets.preload();
  // 等图片全部加载完（pending 归零或超时）
  const t0 = Date.now();
  while (assets.pending() > 0 && Date.now() - t0 < 8000) {
    await new Promise((r) => setTimeout(r, 50));
  }
  const stillLoading = assets.pending();

  const offer = ["a","b","c","d","e","f","g","h","i","j"].map((id, i) => ({
    id, name: "角色" + (i + 1), emoji: "🎴", tagline: "标签", intro: "简介",
    gradient: ["#1b1b2f", "#3d3d5c", "#162447"],
  }));
  const now = Date.now();
  const stages = {
    pack: { offer, picked: [], anim: { kind: "pack" }, slot: "" },
    tear: { offer, picked: [], anim: { kind: "tear", series: "dusk", at: now - 700 }, slot: "" },
    ring: { offer, picked: ["a", "e"], anim: { kind: "ring", series: "deep", at: now - 3000 }, slot: "" },
    top:  { offer, picked: ["a", "e", "h"], anim: { kind: "top", series: "deep", at: now - 500 }, slot: "" },
    pick: { offer, picked: ["a", "e", "h"], anim: { kind: "pick", series: "deep", at: now - 3000 }, slot: "e" },
  };
  if (phase) { try { starfield.forcePhase(phase); } catch(e) {} }
  const state = stages[stage] || stages.pack;
  // 和 app.render 一样的顺序：底色 -> 星野/外景 -> 过场
  starfield.paint(vp);
  if (state.anim && state.anim.series) backdrop.pin(state.anim.series);
  else backdrop.unpin();
  backdrop.paint(vp);
  packview.render(vp, state);
  return { pending: stillLoading, loaded: Object.keys(assets.FILES).length, stage };
};
</script></body></html>`;

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  if (url === "/" || url === "/__preview.html") {
    res.writeHead(200, { "content-type": MIME[".html"] });
    return res.end(PAGE);
  }
  const f = path.join(GAME, url);
  if (!f.startsWith(GAME) || !fs.existsSync(f) || !fs.statSync(f).isFile()) {
    res.writeHead(404);
    return res.end("nope");
  }
  res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--disable-blink-features=AutomationControlled"],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
page.on("console", (m) => {
  if (m.type() === "error") console.log("[page]", m.text());
});
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));

await page.goto(`http://127.0.0.1:${port}/__preview.html`);
const order = ["js/env.js", "js/dayphase.js", "js/theme.js", "js/layout.js", "js/pack.js", "js/draw.js", "js/assets.js", "js/backdrop.js", "js/starfield.js", "js/packview.js"];
const res = await page.evaluate(([o, s, ph]) => window.__run(o, s, ph), [order, STAGE, PHASE]);
console.log("render ->", JSON.stringify(res));

const el = await page.$("#cv");
await el.screenshot({ path: OUT });
console.log("saved", OUT);

await browser.close();
server.close();
