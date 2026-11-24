import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const [file, ys] = [process.argv[2] || "preview-pack.png", (process.argv[3] || "600,340,900").split(",").map(Number)];
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
const dataUrl = "data:image/png;base64," + fs.readFileSync(path.resolve(file)).toString("base64");
const out = await page.evaluate(async ([src, ys]) => {
  const img = new Image();
  await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = src; });
  const cv = document.createElement("canvas");
  cv.width = img.width; cv.height = img.height;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  cx.drawImage(img, 0, 0);
  const px = (x, y) => { const d = cx.getImageData(x|0, y|0, 1, 1).data; return [d[0],d[1],d[2]]; };
  const W = img.width, H = img.height;
  const res = {};
  for (const y of ys) {
    const row = [];
    for (let x = 0; x < W; x += 25) row.push([x, px(x, y)]);
    res[y] = row;
  }
  return { W, H, res };
}, [dataUrl, ys]);
console.log("size", out.W, out.H);
for (const y of ys) {
  console.log("--- y=" + y);
  for (const [x, c] of out.res[y]) console.log(" x", x, c.join(","));
}
await browser.close();
