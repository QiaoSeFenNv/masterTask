/**
 * 过场时序表：把某个阶段在若干时刻的画面拼成一张长图，用眼睛看「动起来是什么样」。
 *
 *   node seq.mjs --kind tear --times 0,150,300,450,600,750,900,1050 --out seq-tear.png
 *   node seq.mjs --kind ring --times 0,800,1600,2400 --series deep --out seq-ring.png
 *
 * 静态截图只能看到一帧，判断不了「撕开 vs 裂开」「转的方向对不对」这类问题，
 * 所以专门做这张对照表。不参与构建。
 */
import { chromium } from "playwright-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const CHROME =
  process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";

const GAME = path.resolve("../../game");
const argOf = (n, d) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : d;
};
const OUT = path.resolve(argOf("--out", "seq.png"));
const KIND = argOf("--kind", "tear");
const SERIES = argOf("--series", "dusk");
const PHASE = argOf("--phase", "night");
const TIMES = (argOf("--times", "0,200,400,600,800,1000") || "")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n));
const COLS = Number(argOf("--cols", "4")) || 4;
/** 每帧的环角度（可选，逗号分列）；不给就是 0，即「正前方是第 1 张」 */
const SPINS = (argOf("--spin", "") || "")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n));
/** 撕开进度（可选，逗号分列，0..1）；配合 --kind tear 看手指划到哪了 */
const PROGS = (argOf("--p", "") || "")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n));
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
<style>html,body{margin:0;background:#05070c}canvas{display:block}</style>
</head><body>
<canvas id="sheet"></canvas>
<script>
const FILES = {};
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
const wxMock = {
  createImage(){
    const img = new Image();
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

window.__seq = async function(order, kind, times, series, phase, spins, progs){
  for (const p of order) { const r = await fetch(p); FILES[p] = await r.text(); }
  const env = load("js/env.js");
  env.setWx(wxMock);
  env.refreshMetrics();
  const draw = load("js/draw.js");
  const layout = load("js/layout.js");
  const theme = load("js/theme.js");
  const pack = load("js/pack.js");
  const assets = load("js/assets.js");
  const backdrop = load("js/backdrop.js");
  const starfield = load("js/starfield.js");
  const packview = load("js/packview.js");

  const vp = env.viewport();
  assets.preload();
  const t0 = Date.now();
  while (assets.pending() > 0 && Date.now() - t0 < 8000) {
    await new Promise((r) => setTimeout(r, 50));
  }

  const offer = ["a","b","c","d","e","f","g","h","i","j"].map((id, i) => ({
    id, name: "角色" + (i + 1), emoji: "🎴", tagline: "标签", intro: "简介",
    gradient: ["#1b1b2f", "#3d3d5c", "#162447"],
  }));

  const cols = ${COLS};
  const rows = Math.ceil(times.length / cols);
  const sheet = document.getElementById("sheet");
  const dpr = 2;
  sheet.width = cols * ${W} * dpr;
  sheet.height = rows * ${H} * dpr;
  const sctx = sheet.getContext("2d");
  sctx.fillStyle = "#05070c";
  sctx.fillRect(0, 0, sheet.width, sheet.height);

  if (phase) { try { starfield.forcePhase(phase); } catch(e) {} }

  for (let k = 0; k < times.length; k++) {
    const sub = document.createElement("canvas");
    sub.width = ${W} * dpr;
    sub.height = ${H} * dpr;
    draw.init(sub);
    draw.clear();

    const now = Date.now();
    // tear 阶段等玩家划，用 --p 指定撕开进度；doneAt 让飘走那一段也能看
    const prog = progs && progs.length ? progs[k % progs.length] : 0;
    const anim =
      kind === "tear"
        ? { kind, series, p: prog, doneAt: prog >= 1 ? now - times[k] : 0 }
        : { kind, series, at: now - times[k] };
    // ringSpin 让每帧能停在不同转角上；漂浮用的时间也钉住，方便复现
    const spin = spins && spins.length ? spins[k % spins.length] : 0;
    const state = { offer, picked: ["a", "e"], anim, slot: "e", ringSpin: spin };

    starfield.paint(vp);
    backdrop.pin(series);
    backdrop.paint(vp);
    packview.render(vp, state);

    const cx = (k % cols) * ${W} * dpr;
    const cy = Math.floor(k / cols) * ${H} * dpr;
    // 每隔一格画一条分隔线，方便对上时间标签
    sctx.drawImage(sub, cx, cy);
    sctx.save();
    sctx.font = "22px monospace";
    sctx.fillStyle = "rgba(255,255,255,0.85)";
    sctx.fillText(times[k] + "ms", cx + 16, cy + 34);
    sctx.strokeStyle = "rgba(255,255,255,0.18)";
    sctx.lineWidth = 2;
    sctx.strokeRect(cx + 1, cy + 1, ${W} * dpr - 2, ${H} * dpr - 2);
    sctx.restore();
  }
  return { frames: times.length, cols, rows };
};
</script></body></html>`;

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  if (url === "/" || url === "/__seq.html") {
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

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({
  viewport: { width: 1400, height: 1000 },
  deviceScaleFactor: 1,
});
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 400)));
page.on("console", (m) => {
  if (m.type() === "error") console.log("[page]", m.text());
});

await page.goto(`http://127.0.0.1:${port}/__seq.html`);
const order = [
  "js/env.js", "js/dayphase.js", "js/theme.js", "js/layout.js", "js/pack.js",
  "js/draw.js", "js/assets.js", "js/backdrop.js", "js/starfield.js", "js/packview.js",
];
const res = await page.evaluate(
  ([o, k, t, s, p, sp, pr]) => window.__seq(o, k, t, s, p, sp, pr),
  [order, KIND, TIMES, SERIES, PHASE, SPINS, PROGS],
);
console.log("seq ->", JSON.stringify(res));

const el = await page.$("#sheet");
await el.screenshot({ path: OUT });
console.log("saved", OUT);

await browser.close();
server.close();
