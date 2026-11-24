/**
 * 把 ClawHUD 出的原图（3~4MB PNG）压成小游戏能带的尺寸。
 *
 * 用 Chrome 自带的 canvas 做缩放 + JPEG 编码，不依赖 sharp / ImageMagick。
 * 图片以 data: URL 喂进去，画布不会被跨源污染，toDataURL 读得回来。
 *
 *   node shrink.mjs
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const CHROME =
  process.env.CHROME_PATH ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe";

const SRC = path.resolve("out");
const DST = path.resolve("../../game/assets");

/** out/<id>.png -> game/assets/<id>.jpg */
const JOBS = [
  // 卡包外表：索引用 ~110x208 设计单位，DPR 3 撑死 330x624，512 宽足够
  { id: "pack-deep", w: 512, h: 768, q: 0.8, crop: "none" },
  { id: "pack-dusk", w: 512, h: 768, q: 0.8, crop: "none" },
  { id: "pack-dawn", w: 512, h: 768, q: 0.8, crop: "none" },
  // 卡包背景：只垫在卡包后面，稍微糊一点没关系，取正方形居中裁
  { id: "bg-deep", w: 640, h: 640, q: 0.74, crop: "square" },
  { id: "bg-dusk", w: 640, h: 640, q: 0.74, crop: "square" },
  { id: "bg-dawn", w: 640, h: 640, q: 0.74, crop: "square" },
];

fs.mkdirSync(DST, { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--disable-blink-features=AutomationControlled"],
});
const page = await browser.newPage();
await page.goto("about:blank");

let total = 0;
for (const job of JOBS) {
  const srcPath = path.join(SRC, job.id + ".png");
  if (!fs.existsSync(srcPath)) {
    console.log("SKIP " + job.id + " (no png)");
    continue;
  }
  const b64 = fs.readFileSync(srcPath).toString("base64");
  const dataUrl = "data:image/png;base64," + b64;

  const outB64 = await page.evaluate(
    async ({ dataUrl, w, h, q, crop }) => {
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = () => rej(new Error("image decode failed"));
        img.src = dataUrl;
      });

      // 源裁剪：正方形居中
      let sx = 0;
      let sy = 0;
      let sw = img.naturalWidth;
      let sh = img.naturalHeight;
      if (crop === "square") {
        const side = Math.min(sw, sh);
        sx = (sw - side) / 2;
        sy = (sh - side) / 2;
        sw = side;
        sh = side;
      }

      const cv = document.createElement("canvas");
      cv.width = w;
      cv.height = h;
      const cx = cv.getContext("2d");
      cx.imageSmoothingEnabled = true;
      cx.imageSmoothingQuality = "high";
      cx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      return cv.toDataURL("image/jpeg", q).split(",")[1];
    },
    { dataUrl, w: job.w, h: job.h, q: job.q, crop: job.crop }
  );

  const buf = Buffer.from(outB64, "base64");
  const dstPath = path.join(DST, job.id + ".jpg");
  fs.writeFileSync(dstPath, buf);
  total += buf.length;
  console.log(
    `OK   ${job.id}.jpg  ${job.w}x${job.h}  ${(buf.length / 1024).toFixed(1)} KB`
  );
}

await browser.close();
console.log(`total ${(total / 1024).toFixed(1)} KB in ${DST}`);
