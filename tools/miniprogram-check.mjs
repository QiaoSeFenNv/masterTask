/**
 * 小程序端本地冒烟：用 Node 模拟 wx 环境，加载页面 JS，校验页面逻辑
 * （不能验证渲染，但能抓出 setData / 数据流 / 依赖层面的错误）
 *
 * 用法：node tools/miniprogram-check.mjs
 */
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:3000";

/* ---------------- 模拟 wx ---------------- */
const storage = new Map();
const toasts = [];

function makeWx() {
  return {
    getStorageSync: (k) => (storage.has(k) ? storage.get(k) : ""),
    setStorageSync: (k, v) => storage.set(k, v),
    removeStorageSync: (k) => storage.delete(k),
    getWindowInfo: () => ({ statusBarHeight: 44, windowWidth: 375 }),
    getSystemInfoSync: () => ({ statusBarHeight: 44, windowWidth: 375 }),
    getAccountInfoSync: () => ({ miniProgram: { envVersion: "develop" } }),
    showToast: (o) => toasts.push(o.title),
    showLoading: () => {},
    hideLoading: () => {},
    vibrateShort: () => {},
    previewImage: () => {},
    switchTab: () => {},
    login: ({ success }) => success({ code: "mp_test_code" }),
    request({ url, method = "GET", data, header, success, fail }) {
      fetch(url, {
        method,
        headers: header,
        body: method === "GET" ? undefined : JSON.stringify(data || {}),
      })
        .then(async (res) => {
          const body = await res.json();
          success({ statusCode: res.status, data: body });
        })
        .catch((e) => fail({ errMsg: String(e) }));
    },
    createSelectorQuery: () => ({
      in() {
        return this;
      },
      select() {
        return this;
      },
      fields() {
        return this;
      },
      exec(cb) {
        cb([null]);
      },
    }),
  };
}

/* ---------------- CommonJS 加载器 ---------------- */
const moduleCache = new Map();

const sandbox = {
  wx: makeWx(),
  console,
  setTimeout,
  clearTimeout,
  Promise,
  Date,
  Math,
  JSON,
  String,
  Number,
  Object,
  Array,
  Error,
  Boolean,
  parseInt,
  parseFloat,
  isNaN,
};
const context = createContext(sandbox);

sandbox.getApp = () => ({ getBaseUrl: () => BASE, globalData: {} });
sandbox.require = (p) => loadModule(p);
sandbox.module = { exports: {} };
sandbox.exports = sandbox.module.exports;

let captured = null;
sandbox.Page = (obj) => {
  captured = obj;
};
sandbox.Component = (obj) => {
  captured = obj;
};
sandbox.App = (obj) => {
  captured = obj;
};

/** 以 ROOT 为基准加载 CommonJS 模块（支持相对路径） */
function loadModule(absPath) {
  const file = absPath.replace(/\\/g, "/");
  if (moduleCache.has(file)) return moduleCache.get(file).exports;

  const mod = { exports: {} };
  moduleCache.set(file, mod);

  const code = readFileSync(file, "utf8");
  const dir = dirname(file);
  const wrapper = createContext(
    Object.assign({}, sandbox, {
      module: mod,
      exports: mod.exports,
      require: (request) => {
        if (!request.startsWith(".")) throw new Error("不支持非相对 require: " + request);
        return loadModule(resolve(dir, request));
      },
      __filename: file,
      __dirname: dir,
    }),
  );

  runInContext(code, wrapper, { filename: file });
  return mod.exports;
}

/** 加载页面文件并取回 Page()/Component() 的定义 */
function loadPage(relPath) {
  captured = null;
  loadModule(resolve(ROOT, relPath).replace(/\\/g, "/"));
  return captured;
}

/* ---------------- 页面实例 ---------------- */
function instantiate(definition) {
  const page = Object.assign({}, definition);
  page.data = JSON.parse(JSON.stringify(definition.data || {}));
  page.setData = function (patch) {
    Object.assign(this.data, patch);
  };
  page.getTabBar = () => ({ setData() {} });
  return page;
}

/* ---------------- 断言 ---------------- */
const results = [];
function check(name, cond, detail) {
  results.push(Boolean(cond));
  if (cond) console.log("✔ " + name);
  else console.error("✘ " + name + (detail ? "  →  " + detail : ""));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- 流程 ---------------- */
const main = async () => {
  // ---------- 工具模块 ----------
  const fmt = loadModule(resolve(ROOT, "miniprogram/utils/format.js"));
  check("gradientCss 生成合法渐变", fmt.gradientCss(["#111", "#222", "#333"], 150).startsWith("linear-gradient(150deg,"));
  check("gradientCss 对 null 兜底", fmt.gradientCss(null).indexOf("linear-gradient") === 0);
  check("splitDate 解析日期", fmt.splitDate("2026-11-19").d === "19");
  check("weekdayZh 解析星期", fmt.weekdayZh("2026-11-19") === "周四");

  // ---------- 首页 ----------
  const home = instantiate(loadPage("miniprogram/pages/home/home.js"));
  home.onLoad();
  await home.loadToday();
  check("首页加载结束", home.data.loading === false);
  check("首页日期已填充", Boolean(home.data.dayLabel) && Boolean(home.data.weekday));

  if (!home.data.drawn) {
    home.onDraw();
    await sleep(2000);
  }
  check("首页进入已抽卡状态", home.data.drawn === true);
  check("角色数据完整", Boolean(home.data.draw && home.data.draw.role && home.data.draw.role.name));
  check("卡面背景为渐变", String(home.data.cardBg).indexOf("linear-gradient") === 0);
  check("任务数量 3–4 条", home.data.taskViews.length >= 3 && home.data.taskViews.length <= 4);
  check("任务含勾选状态", typeof home.data.taskViews[0].done === "boolean");

  const taskId = home.data.taskViews[0].id;
  const before = home.data.taskViews[0].done;
  await home.onToggleTask({ currentTarget: { dataset: { id: taskId } } });
  check("勾选任务后状态翻转", home.data.taskViews[0].done === !before);
  await home.onToggleTask({ currentTarget: { dataset: { id: taskId } } });
  check("再次点击可还原", home.data.taskViews[0].done === before);

  home.onNoteInput({ detail: { value: "今天读书两页" } });
  await home.saveNote(true);
  check("手记保存流程完成", home.data.noteSaving === false);

  // ---------- 日历页 ----------
  const cal = instantiate(loadPage("miniprogram/pages/calendar/calendar.js"));
  cal.onLoad();
  cal.onShow();
  await sleep(1200);
  check("日历加载完成", cal.data.loading === false);
  check("日历单元格数量合理", cal.data.cells.length >= 28);
  const dayCells = cal.data.cells.filter((c) => c.type === "day");
  check("日历日期数与当月一致", dayCells.length === new Date(cal.data.year, cal.data.month, 0).getDate());

  const withEntryIndex = dayCells.findIndex((c) => c.entry);
  check("日历能显示已抽卡日期", withEntryIndex >= 0 || cal.data.monthDays === 0);
  if (withEntryIndex >= 0) {
    const absoluteIndex = cal.data.cells.indexOf(dayCells[withEntryIndex]);
    cal.onTapDay({ currentTarget: { dataset: { index: absoluteIndex } } });
    check("点击日期弹出详情", Boolean(cal.data.detail && cal.data.detail.roleName));
    cal.onCloseDetail();
    check("可关闭详情", cal.data.detail === null);
  }

  const monthBefore = cal.data.month;
  cal.onPrevMonth();
  await sleep(900);
  check("切换上个月正常", cal.data.month !== monthBefore && cal.data.loading === false);

  // ---------- 图鉴页 ----------
  const col = instantiate(loadPage("miniprogram/pages/collection/collection.js"));
  col.onLoad();
  col.onShow();
  await sleep(1200);
  check("图鉴加载完成", col.data.loading === false);
  check("图鉴展示全部 20 张卡", col.data.cards.length === 20);
  check("图鉴进度为数字", typeof col.data.progress === "number");
  check("未获得的卡显示为锁定", col.data.cards.some((c) => !c.owned));

  col.onTapCard({ currentTarget: { dataset: { id: col.data.cards[0].id } } });
  check("点击卡片弹出角色详情", Boolean(col.data.selected && col.data.selected.name));
  col.onClose();
  check("可关闭角色详情", col.data.selected === null);

  // ---------- 海报 ----------
  const poster = loadModule(resolve(ROOT, "miniprogram/utils/poster.js"));
  let posterError = null;
  try {
    await poster.build(
      {},
      {
        date: "2026-11-19",
        role: { name: "测试", emoji: "🎴", tagline: "x", gradient: ["#111", "#222"], accent: "#fff" },
      },
      [],
    );
  } catch (e) {
    posterError = e;
  }
  check("海报在无 canvas 环境抛出可捕获错误", Boolean(posterError));

  const failed = results.filter((r) => !r).length;
  console.log("\n" + (results.length - failed) + "/" + results.length + " 通过" + (failed ? "，" + failed + " 失败" : " ✅"));
  if (failed) process.exit(1);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});