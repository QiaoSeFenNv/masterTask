/**
 * ClawHUD 生图（驱动站点自己的页面，Turnstile 通过点 widget 复选框完成）。
 *
 *   node gen.mjs <jobs.json> --outdir DIR [--only id,id] [--dry] [--headed] [--retry-failed]
 *
 * jobs.json: [{ "id": "detective", "prompt": "...", "model": "mdl_...", "aspect": "2:3", "quality": "high" }]
 *
 * 结果：outdir/<id>.png + outdir/manifest.json
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const SITE = "https://img.clawhud.com/?lang=zh-CN";
const CHROME =
  process.env.CHROME_PATH ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PROFILE = path.resolve(
  process.env.CLAWHUD_PROFILE || "C:/Files/roles/tools/.imgbot/profile"
);

const [jobsFile, ...rest] = process.argv.slice(2);
const argOf = (n, d) => (rest.indexOf(n) >= 0 ? rest[rest.indexOf(n) + 1] : d);
const flag = (n) => rest.includes(n);
const OUT = path.resolve(argOf("--outdir", "out"));
const DRY = flag("--dry");
const HEADED = !flag("--headless");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(PROFILE, { recursive: true });

const all = JSON.parse(fs.readFileSync(jobsFile, "utf8"));
const only = (argOf("--only", "") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const jobs = all
  .filter((j) => !only.length || only.indexOf(j.id) >= 0)
  .filter((j) => !fs.existsSync(path.join(OUT, j.id + ".png")));
console.log(`jobs=${all.length} todo=${jobs.length} out=${OUT}`);

const manifestPath = path.join(OUT, "manifest.json");
const manifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  : {};
const save = () => fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const ctx = await chromium.launchPersistentContext(PROFILE, {
  executablePath: CHROME,
  headless: flag("--headless"),
  viewport: { width: 1280, height: 1000 },
  locale: "zh-CN",
  args: ["--disable-blink-features=AutomationControlled"],
  ignoreDefaultArgs: ["--enable-automation"],
});
await ctx.addInitScript(() =>
  Object.defineProperty(navigator, "webdriver", { get: () => undefined })
);
const persist = async () => {};

const page = ctx.pages()[0] || (await ctx.newPage());
page.setDefaultTimeout(120000);

const snap = () =>
  page.evaluate(() => {
    const el = document.querySelector('input[name="cf-turnstile-response"]');
    const b = document.querySelector(".btn-generate");
    const err = document.querySelector(".error, [role=alert], .gen-error");
    return {
      tok: el ? (el.value || "").length : -1,
      btn: b ? b.textContent : "",
      err: err ? err.textContent.slice(0, 80) : "",
      disabled: b ? b.disabled : null,
    };
  });

const mediaIds = async () => {
  const r = await page.evaluate(async () => {
    const res = await fetch("/api/public/creator/media?limit=12&offset=0", {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!res.ok) return { status: res.status, ids: [] };
    const j = await res.json();
    const items = j.items || j.media || [];
    return { status: res.status, ids: items.map((x) => x.id).filter(Boolean) };
  });
  return r;
};

async function tapTurnstile() {
  const cf = ctx
    .pages()
    .flatMap((p) => p.frames())
    .find((f) => f.url().includes("challenges.cloudflare.com"));
  if (!cf) return false;
  for (const [x, y] of [[28, 36], [24, 36], [36, 32], [30, 44]]) {
    try {
      await cf.locator("body").click({ position: { x, y }, force: true, timeout: 2000 });
    } catch {}
    await page.waitForTimeout(900);
    if ((await snap()).tok > 10) return true;
  }
  return (await snap()).tok > 10;
}

async function download(id, dest) {
  const b64 = await page.evaluate(async (mediaId) => {
    for (const ext of ["png", "jpg", "webp", "jpeg"]) {
      const res = await fetch(`/media/${mediaId}.${ext}`, { cache: "no-store", credentials: "same-origin" });
      if (res.ok) {
        const buf = await res.arrayBuffer();
        let s = "";
        const bytes = new Uint8Array(buf);
        const CH = 0x8000;
        for (let i = 0; i < bytes.length; i += CH) {
          s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
        }
        return btoa(s);
      }
    }
    return "";
  }, id);
  if (!b64) throw new Error("download_failed " + id);
  fs.writeFileSync(dest, Buffer.from(b64, "base64"));
}

async function genOne(job) {
  await page.goto(SITE, { waitUntil: "networkidle" });
  await page.waitForSelector("#prompt", { timeout: 90000 });
  await page.waitForTimeout(1200);

  if (job.model) {
    const m = page.locator("#image-model");
    if (await m.count()) {
      await m.selectOption(job.model).catch(() => {});
      await page.waitForTimeout(600);
    }
  }
  if (job.aspect) {
    const t = page.locator(".ratio-tile", { hasText: job.aspect });
    if (await t.count()) await t.first().click().catch(() => {});
  }
  if (job.size) {
    const t = page.locator(".seg-tile", { hasText: job.size });
    if (await t.count()) await t.first().click().catch(() => {});
  }
  if (job.quality) {
    const q = page.locator("#image-quality");
    if ((await q.count()) && (await q.isVisible()))
      await q.selectOption(job.quality).catch(() => {});
  }
  await page.fill("#prompt", job.prompt);
  await page.waitForTimeout(300);

  if (DRY) {
    await page.screenshot({ path: path.join(OUT, "_dry.png") });
    return "DRY";
  }

  const before = (await mediaIds()).ids;
  await page.click(".btn-generate");

  const dest = path.join(OUT, job.id + ".png");
  const t0 = Date.now();
  let clicked = 1;
  let lastClick = Date.now();
  while (Date.now() - t0 < 420000) {
    await page.waitForTimeout(2500);
    const s = await snap();
    if (s.tok <= 10) await tapTurnstile();

    const m = await mediaIds();
    const fresh = m.ids.find((id) => !before.includes(id));
    if (fresh) {
      await download(fresh, dest);
      return fresh;
    }

    // 卡在「开始生成」说明 token 过期/被重置，重新点一次
    if (s.btn.includes("开始生成") && Date.now() - lastClick > 40000 && clicked < 5) {
      console.log(`  …retry #${clicked + 1} (${((Date.now() - t0) / 1000) | 0}s)`);
      await page.click(".btn-generate").catch(() => {});
      clicked++;
      lastClick = Date.now();
    }
  }
  throw new Error("timeout_no_new_media");
}

for (const job of jobs) {
  const t0 = Date.now();
  try {
    const id = await genOne(job);
    manifest[job.id] = { id, at: new Date().toISOString(), job };
    save();
    console.log(`OK   ${job.id} -> ${id} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    console.log(`FAIL ${job.id}: ${String(e.message).slice(0, 300)}`);
    manifest[job.id] = { error: String(e.message).slice(0, 300), at: new Date().toISOString(), job };
    save();
  }
  await persist();
}

await persist();
await ctx.close();
console.log("done");