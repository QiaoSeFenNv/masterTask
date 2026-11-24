/**
 * 采样预览截图的像素，确认生成图确实画上去了（肉眼看不出来时用）。
 *   node sample.mjs preview-tear.png ...
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const CHROME =
  process.env.CHROME_PATH ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe";

const files = process.argv.slice(2);
if (!files.length) files.push("preview-tear.png");

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();

for (const f of files) {
  const abs = path.resolve(f);
  const dataUrl =
    "data:image/png;base64," + fs.readFileSync(abs).toString("base64");
  const out = await page.evaluate(async (src) => {
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = src;
    });
    const cv = document.createElement("canvas");
    cv.width = img.width;
    cv.height = img.height;
    const cx = cv.getContext("2d", { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    const px = (x, y) => {
      const d = cx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    const W = img.width;
    const H = img.height;
    const pts = {};
    for (const [name, fx, fy] of [
      ["center", 0.5, 0.5],
      ["quarterL", 0.25, 0.5],
      ["quarterR", 0.75, 0.5],
      ["upper", 0.5, 0.33],
      ["lower", 0.5, 0.67],
      ["corner", 0.04, 0.05],
    ]) pts[name] = px(W * fx, H * fy);

    const d = cx.getImageData(0, 0, W, H).data;
    let dark = 0;
    let colorful = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (r + g + b < 240) dark++;
      if (Math.max(r, g, b) - Math.min(r, g, b) > 28) colorful++;
    }
    const n = W * H;
    return { w: W, h: H, pts, darkPct: +(dark / n * 100).toFixed(1), colorPct: +(colorful / n * 100).toFixed(1) };
  }, dataUrl);
  console.log(f, JSON.stringify(out));
}

await browser.close();
