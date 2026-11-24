import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const file = process.argv[2] || "preview-pack.png";
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
const dataUrl = "data:image/png;base64," + fs.readFileSync(path.resolve(file)).toString("base64");
const out = await page.evaluate(async (src) => {
  const img = new Image();
  await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = src; });
  const cv = document.createElement("canvas");
  cv.width = img.width; cv.height = img.height;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  cx.drawImage(img, 0, 0);
  const px = (x, y) => { const d = cx.getImageData(x|0, y|0, 1, 1).data; return [d[0],d[1],d[2]]; };
  const W = img.width, H = img.height;
  const colX = Math.round(W * 0.5);
  const rows = [];
  for (let y = 0; y < H; y += 20) rows.push([y, px(colX, y)]);
  // 逐行和上一行的差，找硬边
  const jumps = [];
  let prev = px(colX, 0);
  for (let y = 1; y < H; y++) {
    const c = px(colX, y);
    const d = Math.abs(c[0]-prev[0]) + Math.abs(c[1]-prev[1]) + Math.abs(c[2]-prev[2]);
    if (d > 90) jumps.push([y, prev, c, d]);
    prev = c;
  }
  return { W, H, rows, jumps: jumps.slice(0, 30) };
}, dataUrl);
console.log("size", out.W, out.H);
console.log("vertical profile at x=", Math.round(out.W*0.5));
for (const [y, c] of out.rows) console.log(y, c.join(","));
console.log("hard jumps:", JSON.stringify(out.jumps));
await browser.close();
