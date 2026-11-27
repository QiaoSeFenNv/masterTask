/**
 * 小游戏端冒烟:不开微信开发者工具,用假 canvas 2D context + 真后端接口,
 * 把渲染、命中、滚动、抽卡、勾选任务、翻日历、图鉴都跑一遍。
 *
 * 用法(需后端已启动):node tools/game-check.mjs
 */
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(ROOT, "game", "noop.cjs"));
const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:3000";

/* ---------------- 假 canvas ---------------- */

const ops = [];

function makeCtx() {
  const alphaStack = [];
  return {
    canvas: null,
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    globalAlpha: 1,
    shadowColor: "",
    shadowBlur: 0,
    shadowOffsetY: 0,
    setTransform(a, b, c, d, e, f) {
      ops.push(["setTransform", a, b, c, d, e, f]);
    },
    clearRect(...a) {
      ops.push(["clearRect", ...a]);
    },
    fillRect(x, y, w, h) {
      ops.push(["fillRect", x, y, w, h]);
    },
    beginPath() {
      ops.push(["beginPath"]);
    },
    closePath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    rect() {
      ops.push(["rect"]);
    },
    rotate(angle) { ops.push(["rotate", angle]); },
    scale(x, y) { ops.push(["scale", x, y]); },
    arc() {},
    fill() {
      ops.push(["fill"]);
    },
    stroke() {
      ops.push(["stroke"]);
    },
    clip() {},
    save() { alphaStack.push(this.globalAlpha); ops.push(["save"]); },
    restore() { if (alphaStack.length) this.globalAlpha = alphaStack.pop(); ops.push(["restore"]); },
    translate(x, y) { ops.push(["translate", x, y]); },
    fillText(str, x, y) {
      ops.push(["fillText", String(str), x, y, this.globalAlpha]);
    },
    measureText(str) {
      return { width: String(str).length * 6 };
    },
    createLinearGradient() {
      return { addColorStop() {} };
    },
    // 刻意提供径向渐变 + drawImage，让三段背景（含星云/雾团）都真的走一遍
    createRadialGradient() {
      return { addColorStop() {} };
    },
    drawImage() {
      ops.push(["drawImage"]);
    },
  };
}

const ctx = makeCtx();
const fakeCanvas = {
  width: 750,
  height: 1624,
  getContext() {
    return ctx;
  },
};

/** 交叉淡入会调 wx.createOffscreenCanvas，这里给它一个同款假画布 */
function fakeOffscreen({ width, height }) {
  return { width, height, getContext: () => ctx };
}

/* ---------------- 假 wx ---------------- */

const storage = new Map();
const toasts = [];
const vibrations = [];
let drawRequests = 0;

const fakeWx = {
  getStorageSync: (k) => (storage.has(k) ? storage.get(k) : ""),
  setStorageSync: (k, v) => storage.set(k, v),
  removeStorageSync: (k) => storage.delete(k),
  login: ({ success }) => success({ code: "game_test_" + Date.now() }),
  createCanvas: () => fakeCanvas,
  createOffscreenCanvas: fakeOffscreen,
  getSystemInfoSync: () => ({
    windowWidth: 375,
    windowHeight: 812,
    screenWidth: 375,
    screenHeight: 812,
    pixelRatio: 2,
    safeArea: { top: 44, bottom: 778 },
  }),
  request({ url, method = "GET", data, header, success, fail }) {
    if (method === "POST" && new URL(url).pathname === "/api/draw") drawRequests++;
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
  showToast: (o) => toasts.push(o.title),
  vibrateShort: (options) => vibrations.push(options),
  onTouchStart: () => {},
  onTouchMove: () => {},
  onTouchEnd: () => {},
};

/* ---------------- 加载与断言 ---------------- */

const env = require(resolve(ROOT, "game/js/env.js"));
env.setWx(fakeWx);
env.refreshMetrics();

/* api 的 baseUrl 写死在 api.js,这里若要用别的地址就改环境变量,默认本地 3000 */
void BASE;

const store = require(resolve(ROOT, "game/js/store.js"));
const view = require(resolve(ROOT, "game/js/render.js"));
const layout = require(resolve(ROOT, "game/js/layout.js"));
const draw = require(resolve(ROOT, "game/js/draw.js"));
const app = require(resolve(ROOT, "game/js/app.js"));

draw.init(fakeCanvas);

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: Boolean(cond) });
  if (cond) console.log("OK   " + name);
  else console.log("FAIL " + name + (detail ? "  -> " + detail : ""));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const run = async () => {
  const vp = env.viewport();
  check("视口按 375 设计稿折算", vp.width === 375 && vp.height === 812, JSON.stringify(vp));

  /* 0. 时段背景:三段边界 + 主题跟着换 + 渲染不崩 */
  {
    const dt = (h) => new Date(2026, 10, 20, h, 0, 0);
    const ph = require(resolve(ROOT, "game/js/dayphase.js"));
    check("5 点算夜晚", ph.phaseAt(dt(5)) === "night", ph.phaseAt(dt(5)));
    check("6 点进入早上", ph.phaseAt(dt(6)) === "morning", ph.phaseAt(dt(6)));
    check("11 点仍是早上", ph.phaseAt(dt(11)) === "morning", ph.phaseAt(dt(11)));
    check("12 点进入中午", ph.phaseAt(dt(12)) === "midday", ph.phaseAt(dt(12)));
    check("17 点仍是中午", ph.phaseAt(dt(17)) === "midday", ph.phaseAt(dt(17)));
    check("18 点回到夜晚", ph.phaseAt(dt(18)) === "night", ph.phaseAt(dt(18)));

    const th = require(resolve(ROOT, "game/js/theme.js"));
    const bgOf = {};
    for (const p of ["night", "morning", "midday"]) {
      th.apply(p);
      bgOf[p] = th.bg;
      ops.length = 0;
      app.render();
      check("「" + p + "」主题能渲染不抛错", ops.length > 0, "ops=" + ops.length);
    }
    check("三套底色互不相同", new Set(Object.values(bgOf)).size === 3, JSON.stringify(bgOf));

    // 亮色主题必须是浅底深字，避免白底白字
    th.apply("morning");
    const lum = (hex) => {
      const n = parseInt(hex.slice(1), 16);
      return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114;
    };
    check("早上是浅底深字", lum(th.bg) > 200 && lum(th.text) < 80, th.bg + " / " + th.text);
    th.apply("midday");
    check("中午是浅底深字", lum(th.bg) > 200 && lum(th.text) < 80, th.bg + " / " + th.text);
    th.apply("night");
    check("晚上是深底浅字", lum(th.bg) < 60 && lum(th.text) > 200, th.bg + " / " + th.text);
  }

  /* 0b. 背景模式：自动 ↔ 手动，循环顺序 + 记忆 + 按钮可点 */
  {
    const bgm = require(resolve(ROOT, "game/js/bg.js"));

    bgm.setMode("auto");
    check("默认回到自动模式", bgm.current() === "auto", bgm.current());

    // 循环顺序：auto → morning → midday → night → auto
    const seen = [];
    for (let i = 0; i < 4; i++) {
      bgm.cycle();
      seen.push(bgm.current());
    }
    check(
      "点一下按 晨雾→晴空→深空→自动 循环",
      seen.join(",") === "morning,midday,night,auto",
      seen.join(",")
    );

    // 手动模式下不看钟：钉死深空，主题就该是深空
    bgm.setMode("night");
    check("手动选深空后不看钟", bgm.resolve() === "night", bgm.resolve());
    check("深空模式套用深色底", require(resolve(ROOT, "game/js/theme.js")).bg === "#070b16", "");

    bgm.setMode("morning");
    check("手动选晨雾后是浅色底", bgm.resolve() === "morning");

    // 选择要落盘
    bgm.cycle(); // morning → midday
    check("切换后的模式存进了本地", storage.get("roles_bg_mode") === "midday", String(storage.get("roles_bg_mode")));

    // 按钮文字
    bgm.setMode("auto");
    check("自动模式按钮显示当前时段", /^自动 · [晨午夜]$/.test(bgm.label()), bgm.label());
    bgm.setMode("midday");
    check("手动模式按钮显示那套名字", bgm.label() === "晴空", bgm.label());

    // 点按钮真的能切
    bgm.setMode("auto");
    app.render();
    const btn = layout.bgButtonRect(vp);
    app.dispatch(btn.x + btn.w / 2, btn.y + btn.h / 2);
    check("点右上角按钮切到下一套", bgm.current() === "morning", bgm.current());
    check("切完按钮文字跟着变", bgm.label() === "晨雾", bgm.label());

    // 收尾：回到自动，免得影响后面的断言
    bgm.setMode("auto");
  }

  /* 1. 首屏(loading)可渲染 */
  store.state.status = "loading";
  store.state.tab = "today";
  ops.length = 0;
  app.render();
  check("loading 状态能画出来且不抛错", ops.length > 0, "ops=" + ops.length);

  /* 2. 拉取今日状态 */
  await store.loadToday();
  check("loadToday 结束", store.state.status === "ready", store.state.error);
  check("已拿到服务端日期", /^\d{4}-\d{2}-\d{2}$/.test(store.state.date), store.state.date);

  /* 3. 未抽卡:选系列 → 撕开 → 环形十张 → 点三张 → 飞成候选排 → 选一张落定 */
  if (!store.state.draw) {
    const packview = require(resolve(ROOT, "game/js/packview.js"));

    ops.length = 0;
    const packEntryAt = Date.now();
    app.render(packEntryAt);
    check("选系列首次入场从 0.96 缩放和零透明度开始",
      ops.some((o) => o[0] === "scale" && o[1] === 0.96) &&
      ops.some((o) => o[0] === "fillText" && o[1] === "今天的卡包" && o[4] === 0));
    check("没落定时先让人挑卡包", store.stage() === "pack", store.stage());
    const pk = ops.filter((o) => o[0] === "fillText").map((o) => o[1]);
    check("三个系列都画出来了", ["深海", "暮色", "晨曦"].every((n) => pk.includes(n)), pk.slice(0, 14).join("|"));
    check("候选一共十张", store.state.offer.length === 10, "offer=" + store.state.offer.length);
    check("选包阶段看不到角色名", !store.state.offer.some((o) => pk.includes(o.name)), "");

    ops.length = 0;
    app.render(packEntryAt + 110);
    check("入场中间帧同时淡入和缩放",
      ops.some((o) => o[0] === "scale" && o[1] > 0.96 && o[1] < 1) &&
      ops.some((o) => o[0] === "fillText" && o[1] === "今天的卡包" && o[4] > 0 && o[4] < 1));
    ops.length = 0;
    app.render(packEntryAt + 220);
    check("220ms 后入场达到原尺寸和完整透明度",
      ops.some((o) => o[0] === "scale" && o[1] === 1) &&
      ops.some((o) => o[0] === "fillText" && o[1] === "今天的卡包" && o[4] === 1));

    /* 点中间的「暮色」 */
    app.dispatch(187.5, layout.contentTop(vp) + 150);
    check(
      "点系列卡先播放选包过渡",
      store.state.anim.kind === "opening" && store.state.anim.series === "dusk",
      JSON.stringify(store.state.anim)
    );

    const openingAt = store.state.anim.at;
    const openingPack = require(resolve(ROOT, "game/js/pack.js"));
    store.swipeTear(openingPack.TEAR_SWIPE);
    check("选包过渡阶段不接受撕包", store.stage() === "opening" && !store.state.anim.p, store.stage());
    app.render(openingAt + openingPack.OPEN_MS - 1);
    check("选包过渡按时长持续", store.stage() === "opening", store.stage());
    app.render(openingAt + openingPack.OPEN_MS);
    check("过渡完成后才进入撕包", store.stage() === "tear" && store.state.anim.p === 0, store.stage());

    ops.length = 0;
    app.render();
    check("撕开时有画东西", ops.length > 0, "ops=" + ops.length);

    /* 在真实触摸路径中验证倾斜与撕口分别推进。 */
    {
      const originalTear = store.state.anim;
      store.state.anim = { ...originalTear };
      const packet = openingPack.tearRect(layout.contentTop(vp));
      const finger = (x) => ({ touches: [{ clientX: x, clientY: packet.y + packet.h / 2 }] });
      const center = packet.x + packet.w / 2;
      app.onTouchStart(finger(center));
      app.onTouchMove(finger(center - 160));
      check("向左把玩最多倾斜 -8°，不会倒撕包口", store.state.anim.tilt === -8 && store.state.anim.p === 0);
      app.onTouchEnd({ canceled: true });
      const returnAt = store.state.anim.tiltAt;
      store.tickTear(returnAt + 130);
      check("松手或取消触摸后倾斜缓动回正", store.state.anim.tilt > -8 && store.state.anim.tilt < 0);
      store.tickTear(returnAt + 260);
      check("回正后停止倾斜动画且撕口仍为零", store.state.anim.tilt === 0 && !store.state.anim.tiltAt && store.state.anim.p === 0);
      app.onTouchStart(finger(center));
      app.onTouchMove(finger(center + 60));
      check("向右倾斜不影响原来的撕开距离", store.state.anim.tilt > 0 && store.state.anim.tilt <= 8 && Math.abs(store.state.anim.p - 0.4) < 0.0001);
      ops.length = 0;
      app.render();
      let angle = 0, stack = [], translatedPaper = false;
      for (const op of ops) {
        if (op[0] === "save") stack.push(angle);
        if (op[0] === "restore") angle = stack.pop();
        if (op[0] === "rotate") angle += op[1];
        if (op[0] === "translate" && op[1] > 0 && op[1] <= 30 && op[2] < 0 && Math.abs(angle) < 0.0001) translatedPaper = true;
      }
      check("包身使用旋转而撕下来的纸条保持平移", ops.some((op) => op[0] === "rotate" && op[1] > 0) && translatedPaper);
      app.onTouchMove(finger(center + 160));
      check("向右最多倾斜 8°且按原距离撕通", store.state.anim.tilt === 8 && store.state.anim.p === 1 && Boolean(store.state.anim.doneAt));
      app.onTouchEnd({ changedTouches: [{ clientX: center + 160, clientY: packet.y + packet.h / 2 }] });
      store.tickTear(store.state.anim.tiltAt + 260);
      check("撕通后包身回正，纸条飘走阶段与撕口不变", store.state.anim.tilt === 0 && store.state.anim.p === 1 && store.stage() === "tear");
      store.state.anim = originalTear;
    }

    /* 撕开要玩家自己划：没划完不许进环形 */
    {
      const pkT = require(resolve(ROOT, "game/js/pack.js"));
      store.enterRing();
      check("没划完时进不了环形", store.stage() === "tear", store.stage());

      store.swipeTear(pkT.TEAR_SWIPE * 0.4);
      check("划一小段只撕开一部分", Math.abs(store.state.anim.p - 0.4) < 0.02, String(store.state.anim.p));
      check("这时还没撕通", !store.state.anim.doneAt, "");
      store.enterRing();
      check("半途仍然进不了环形", store.stage() === "tear", store.stage());

      // 松手会弹回去一点，但不会全退
      const beforeRelease = store.state.anim.p;
      store.releaseTear();
      store.tickTear(Date.now() + 400);
      check(
        "松手弹回一点但保留进度",
        store.state.anim.p < beforeRelease && store.state.anim.p > 0,
        beforeRelease + " -> " + store.state.anim.p
      );

      // 再划满剩下的部分，就撕通
      const beforeTearCue = vibrations.length;
      store.swipeTear(pkT.TEAR_SWIPE);
      store.swipeTear(pkT.TEAR_SWIPE);
      check("撕通只触发一次轻震动", vibrations.length === beforeTearCue + 1 && vibrations[vibrations.length - 1].type === "light");
      check("划满整条包口就撕通", store.state.anim.p === 1 && Boolean(store.state.anim.doneAt), String(store.state.anim.p));
      check("刚撕通还不能立刻进环形（那条纸还在飘）", store.stage() === "tear", store.stage());
    }

    /* 飘完之后进环形 */
    store.state.anim.doneAt = Date.now() - 2000;
    app.render();
    check("进入环形阶段", store.stage() === "ring", store.stage());
    ops.length = 0;
    app.render();
    check("环形画出来了", ops.length > 0, "ops=" + ops.length);
    check("环下方显示第 1 / 10 张和正前方牌名",
      ops.some((o) => o[0] === "fillText" && o[1] === "第 1 / 10 张") &&
      ops.some((o) => o[0] === "fillText" && o[1] === store.state.offer[0].name));

    /* 环是一圈立着的牌：十张全在环上，近大远小，正前方的最后画 */
    {
      const pk = require(resolve(ROOT, "game/js/pack.js"));
      const ringList = pk.ring(10, 0, 0);
      check(
        "环上的牌都是长方形（rot 恒为 0）",
        ringList.every((s) => s.rot === 0),
        ringList.map((s) => s.rot.toFixed(2)).join(",")
      );
      check("十张都摆在环上", ringList.length === 10, String(ringList.length));

      // 位置必须真的落在一个椭圆环上：先把漂浮量扣掉，x/y 相对环心归一后平方和恒为 1
      const R = pk.RING;
      const T = 1000; // 钉住时间，漂浮量才能算准
      const ringAt = pk.ring(10, 0, 0, T);
      const onRing = ringAt.every((s) => {
        const front = (Math.cos(s.a) + 1) / 2;
        const bob = Math.sin(T / 680 + s.i * 1.9) * R.bob * (0.35 + 0.65 * front);
        const nx = (s.x - R.cx) / R.rx;
        const ny = (s.y - R.cyOff - bob) / R.ry; // ring(…, top=0) 时 y 减掉环心就是纵向半径上的投影
        return Math.abs(nx * nx + ny * ny - 1) < 1e-9;
      });
      check("十张都落在同一个椭圆上", onRing, ringAt.map((s) => (s.x | 0) + "," + (s.y | 0)).join(" | "));

      const front = ringList[ringList.length - 1];
      const back = ringList[0];
      check("正前方那张最大、正后方最小", front.scale > back.scale, front.scale.toFixed(2) + " vs " + back.scale.toFixed(2));
      check("正前方那张不压扁", Math.abs(front.wscale - 1) < 0.001, String(front.wscale));
      check(
        "侧面（左右）的牌被压扁",
        ringList.filter((s) => Math.abs(Math.sin(s.a)) > 0.3).every((s) => s.wscale < 0.95),
        ringList.map((s) => s.wscale.toFixed(2)).join(",")
      );
      check(
        "远的先画，正前方那张最后画（盖在最上面）",
        ringList.every((s, i) => i === 0 || ringList[i - 1].depth <= s.depth) && front.depth === 1,
        ringList.map((s) => s.depth.toFixed(2)).join(",")
      );

      // 「一眼只看到一张完整的」：正前方那张最宽、最亮、在最上层，
      // 其余都窄一截、压暗，而且只有它一张能整张读出来。
      //
      // 注意这里**不**断言「后面的牌被整张盖住」——环的半径定在 160 之后，
      // 侧后方那些牌会从正前方那张的头顶露出一截，这是有意的取舍：
      // 环要够大才不像一摞牌，露出来的那一点点是「看得见还有别的牌」的代价。
      // 所以只守住真正的硬性质：没有第二张比正面牌更宽，正后方那张大半被盖住，
      // 左右两侧各露一条边，而且没有任何牌越过正面牌的下沿。
      {
        const box = (s) => {
          const w = s.w * s.scale * s.wscale;
          const h = s.h * s.scale;
          return { l: s.x - w / 2, r: s.x + w / 2, t: s.y - h / 2, b: s.y + h / 2, w, h };
        };
        const fb = box(front);
        const others = ringList.filter((s) => s !== front);

        const widest = others.reduce((m, s) => Math.max(m, box(s).w), 0);
        check(
          "除了正前方那张，没有第二张比它宽",
          widest < fb.w,
          "最宽的后排 " + widest.toFixed(0) + "px vs 正面 " + fb.w.toFixed(0) + "px"
        );
        check(
          "只有正前方那张是全不透明的（后面的都压暗了）",
          front.alpha >= 1 && others.every((s) => s.alpha < 0.99),
          front.alpha.toFixed(2) + " / 后排最高 " + others.reduce((m, s) => Math.max(m, s.alpha), 0).toFixed(2)
        );

        // 正后方那张缩得最小，不管漂浮到哪个相位都该被正面牌盖掉大半
        const backCard = ringList.find((s) => s !== front && s.a > 3 && s.a < 3.2);
        let minCover = 1;
        for (let t = 0; t <= 2000; t += 25) {
          const cs = pk.ring(10, 0, 0, t);
          const f2 = cs[cs.length - 1];
          const fb2 = box(f2);
          const bk = cs.find((s) => s !== f2 && s.a > 3 && s.a < 3.2);
          if (!bk) { minCover = 0; break; }
          const b = box(bk);
          const iw = Math.max(0, Math.min(fb2.r, b.r) - Math.max(fb2.l, b.l));
          const ih = Math.max(0, Math.min(fb2.b, b.b) - Math.max(fb2.t, b.t));
          minCover = Math.min(minCover, (iw * ih) / (b.w * b.h));
        }
        check(
          "正后方那张始终被正前方盖掉大半",
          Boolean(backCard) && minCover > 0.5,
          "最差相位 " + (minCover * 100).toFixed(0) + "%"
        );

        // 左右各露一条边，才看得出是在转一圈
        const outL = Math.max(0, ...others.map((s) => fb.l - box(s).l));
        const outR = Math.max(0, ...others.map((s) => box(s).r - fb.r));
        check(
          "左右两侧各露出一条边（看得出是环）",
          outL >= 24 && outR >= 24,
          outL.toFixed(0) + "px / " + outR.toFixed(0) + "px"
        );

        // 上面可以露一点，下面不能：正面牌永远是这一摞的「底」
        const leakBot = others.reduce((m, s) => Math.max(m, box(s).b - fb.b), 0);
        check("没有牌从正前方那张的脚底漏出来", leakBot <= 0.5, leakBot.toFixed(0) + "px");
      }
    }

    /* 上下漂浮：位置随时间变，所以要连着出帧 */
    {
      const id0 = store.state.offer[0].id;
      const a0 = packview.pointOf(vp, store.state, id0);
      await sleep(400);
      const a1 = packview.pointOf(vp, store.state, id0);
      check("牌会上下漂浮", a0 && a1 && a0.y !== a1.y, JSON.stringify([a0, a1]));
      check("漂浮时连续出帧", packview.busy(store.state), "");
    }

    /* 不自动转：放着不动，spin 不该变（漂浮是位置在动，不是环在转） */
    {
      const spin0 = packview.spinOf(store.state);
      await sleep(400);
      check("不自动旋转", packview.spinOf(store.state) === spin0, String(packview.spinOf(store.state)));
    }

    /* 拖动转盘：横向拖 120px，牌要跟着动，而且不能误点到牌 */
    {
      const id0 = store.state.offer[0].id;
      const before2 = packview.pointOf(vp, store.state, id0);
      const pickedBefore = store.state.picked.length;
      app.onTouchStart({ touches: [{ clientX: 180, clientY: 420 }] });
      app.onTouchMove({ touches: [{ clientX: 220, clientY: 421 }] });
      app.onTouchMove({ touches: [{ clientX: 260, clientY: 422 }] });
      app.onTouchMove({ touches: [{ clientX: 300, clientY: 424 }] });
      app.onTouchEnd({ changedTouches: [{ clientX: 300, clientY: 424 }] });
      const after2 = packview.pointOf(vp, store.state, id0);
      check("拖动后 spin 变了", packview.spinOf(store.state) !== 0, String(packview.spinOf(store.state)));
      check(
        "拖动后牌跟着挪了",
        before2 && after2 && (before2.x !== after2.x || before2.y !== after2.y),
        JSON.stringify([before2, after2])
      );
      check("拖动不算点击", store.state.picked.length === pickedBefore, String(store.state.picked.length));
      ops.length = 0;
      app.render();
      const movedRing = require(resolve(ROOT, "game/js/pack.js")).ring(store.state.offer.length, store.state.ringSpin, layout.contentTop(vp));
      const movedFront = movedRing[movedRing.length - 1];
      check("拖动后序号和牌名随正前方卡更新",
        movedFront.i !== 0 &&
        ops.some((o) => o[0] === "fillText" && o[1] === "第 " + (movedFront.i + 1) + " / 10 张") &&
        ops.some((o) => o[0] === "fillText" && o[1] === store.state.offer[movedFront.i].name));

      // 转回原处，后面的命中测试才好算
      store.state.ringSpin = 0;
      app.render();
    }

    /* 环形摆位：点侧面那张牌露在外面的那一角，命中的就是它
       （正前方那张会把它的中线盖住，所以只能点露出来的部分） */
    {
      const pk2 = require(resolve(ROOT, "game/js/pack.js"));
      const side = store.state.offer[1];
      const top = layout.contentTop(vp);
      const list = pk2.ring(store.state.offer.length, packview.spinOf(store.state), top);
      const slot = list.find((s) => store.state.offer[s.i].id === side.id);
      const fb = list[list.length - 1];
      const rightOf = (s) => s.x + (s.w * s.scale * s.wscale) / 2;
      const leftOf = (s) => s.x - (s.w * s.scale * s.wscale) / 2;
      // 正前方那张右缘 → 侧面那张右缘，中间那一段只有侧面那张露着
      const px = (rightOf(fb) + rightOf(slot)) / 2;
      check("侧面那张确实露了一条边", px > rightOf(fb) && px < rightOf(slot), leftOf(slot).toFixed(0) + ".." + rightOf(slot).toFixed(0) + " / 正面右缘 " + rightOf(fb).toFixed(0));
      const hitId = packview.hitRing(vp, store.state, px, slot.y);
      check("点侧面那张露出的边，命中的就是它", hitId === side.id, hitId + " vs " + side.id);
      check("这时还没点开任何一张", store.state.picked.length === 0, String(store.state.picked.length));
    }

    /* 点三张：拖动把想点的那张转到正前方，再点 */
    {
      const stepA = (Math.PI * 2) / store.state.offer.length; // 一张牌占的角度
      const want = [];
      const beforeFlipCues = vibrations.length;
      for (let k = 0; k < 3; k++) {
        const role = store.state.offer[k];
        // ringSpin = -k * stepA，这张就正好转到正前方
        store.rotateRing((-k * stepA - store.state.ringSpin) / 0.012);
        const pt = packview.pointOf(vp, store.state, role.id);
        check("第 " + (k + 1) + " 张转到前排后位置算得出来", Boolean(pt), role.id);
        if (pt) app.dispatch(pt.x, pt.y);
        want.push(role.id);
      }
      check("三次翻面对应三次轻震动", vibrations.length === beforeFlipCues + 3 && vibrations.slice(beforeFlipCues).every((cue) => cue.type === "light"));
      check("点了三张就记三张", store.state.picked.length === 3, JSON.stringify(store.state.picked));
      check("点的顺序和点的一致", store.state.picked.join(",") === want.join(","), store.state.picked.join(","));
      check("点满三张进入飞行", store.state.anim.kind === "top", store.state.anim.kind);
    }

    /* 第四张进不去 */
    const extra = store.state.offer.find((o) => store.state.picked.indexOf(o.id) < 0);
    store.flipCard(extra.id);
    check("第四张不会再被收进来", store.state.picked.length === 3, String(store.state.picked.length));

    // 第三张翻完之前仍留在环上；起飞后三张保持正面。
    ops.length = 0;
    app.render(store.state.anim.at - 100);
    check("最后一张翻完前保留整圈", ops.some((o) => o[0] === "fillText" && o[1] === "左右拖动转一圈，点三张"));
    ops.length = 0;
    app.render(store.state.anim.at + 200);
    const flyingNames = store.pickedRoles().map((r) => r.name);
    check("飞行时三张保持正面", flyingNames.every((name) => ops.some((o) => o[0] === "fillText" && o[1] === name)));

    /* 快进到可选 */
    store.state.anim.at = Date.now() - 2000;
    app.render();
    check("三张飞完进入可选", store.stage() === "pick", store.stage());

    /* 没选时点落定无效 */
    const pb = layout.pickButtonRect();
    pb.y += layout.contentTop(vp);
    app.dispatch(pb.x + pb.w / 2, pb.y + pb.h / 2);
    check("没选时点落定无效", !store.state.draw, "draw=" + Boolean(store.state.draw));

    /* 点第二张候选，再落定 */
    const target = store.state.picked[1];
    const pc = layout.pickCardRect(1);
    app.dispatch(pc.x + pc.w / 2, layout.contentTop(vp) + pc.y + pc.h / 2);
    check("点候选卡能选中", store.state.slot === target, store.state.slot);
    app.render();

    const beforeConfirmCue = vibrations.length, beforeDrawRequests = drawRequests;
    app.dispatch(pb.x + pb.w / 2, pb.y + pb.h / 2);
    app.dispatch(pb.x + pb.w / 2, pb.y + pb.h / 2);
    await sleep(700);
    check("重复确认只发一个抽卡请求且只震动一次", drawRequests === beforeDrawRequests + 1 && vibrations.length === beforeConfirmCue + 1 && vibrations[vibrations.length - 1].type === "light", JSON.stringify({ requests: drawRequests - beforeDrawRequests, cues: vibrations.slice(beforeConfirmCue), stage: store.stage(), shifting: store.state.shifting }));
    check(
      "落定的就是选中的那张",
      store.state.draw && store.state.draw.role.id === target,
      JSON.stringify(store.state.draw && store.state.draw.role.id)
    );
    check("落定后候选清空", store.state.offer.length === 0, String(store.state.offer.length));
    check("落定后进入揭晓", store.stage() === "reveal", store.stage());
    const animation = require(resolve(ROOT, "game/js/animation.js"));
    const revealPack = require(resolve(ROOT, "game/js/pack.js"));
    const revealed = store.state.draw;
    const revealAt = store.state.anim.at;
    ops.length = 0;
    app.render(revealAt + 400);
    check("揭晓画出角色聚焦文案", ops.some((o) => o[0] === "fillText" && o[1] === "今天，成为" + revealed.role.name));
    animation.withTime(revealAt + 100, () => app.dispatch(180, layout.contentTop(vp) + 220));
    check("聚焦完成前不误跳过", store.stage() === "reveal");
    animation.withTime(revealAt + revealPack.REVEAL_FOCUS_MS + 1, () => app.dispatch(180, layout.contentTop(vp) + 220));
    check("揭晓可点击继续", store.stage() === "" && store.state.draw === revealed);
    check("落定后过场结束", store.stage() === "", store.stage());
  }

  /* 今日卡背：原有任务断言前，加入真实触摸刮开步骤（不改断言）。 */
  if (store.scratchPending()) {
    app.render();
    const scratchRect = layout.todayScratchRect();
    const packet = (x, y) => ({touches:[{clientX:x,clientY:y}],changedTouches:[{clientX:x,clientY:y}]});
    for (let fy = 0.04; fy < 1 && store.scratchPending(); fy += 0.095) {
      const y = layout.contentTop(vp) + scratchRect.y - store.state.scroll + scratchRect.h * fy;
      if (y >= layout.contentBottom(vp) - 2) {
        app.onTouchStart(packet(7, layout.contentBottom(vp) - 30));
        app.onTouchMove(packet(7, layout.contentTop(vp) + 30));
        app.onTouchEnd(packet(7, layout.contentTop(vp) + 30));
        app.render();
        fy -= 0.095; continue;
      }
      app.onTouchStart(packet(scratchRect.x + 8, y));
      app.onTouchMove(packet(scratchRect.x + scratchRect.w - 8, y));
      app.onTouchEnd(packet(scratchRect.x + scratchRect.w - 8, y));
      app.render();
    }
    check("今日卡背刮开后才解锁任务", !store.scratchPending());
    store.state.scroll = 0;
  }

  /* 4. 已抽卡:渲染出角色名与任务 */
  ops.length = 0;
  app.render();
  const drawnTexts = ops.filter((o) => o[0] === "fillText").map((o) => o[1]);
  check("卡面画出角色名", drawnTexts.includes(store.state.draw.role.name), drawnTexts.slice(0, 8).join("|"));
  check("任务条数 3-4", store.state.draw.tasks.length >= 3 && store.state.draw.tasks.length <= 4, String(store.state.draw.tasks.length));
  check("任务文本被绘制", store.state.draw.tasks.some((t) => drawnTexts.includes(t.text.slice(0, 20)) || drawnTexts.some((x) => x && t.text.startsWith(x))), "n/a");

  /* 5. 命中判定:点第一张任务卡 */
  const task = store.state.draw.tasks[0];
  const tRect = layout.todayTaskRect(0);
  tRect.y += layout.contentTop(vp);

  const before = task.done;
  app.dispatch(tRect.x + 30, tRect.y + tRect.h / 2);
  await sleep(400);
  check("点任务卡能切换勾选", task.done === !before, "before=" + before + " after=" + task.done);

  /* 6. 再点回来,避免污染 */
  app.dispatch(tRect.x + 30, tRect.y + tRect.h / 2);
  await sleep(400);
  check("再点可还原", task.done === before, "done=" + task.done);

  /* 7. tab 切换 */
  const tabs = view.tabbarRects(vp);
  app.dispatch(tabs[1].x + 10, tabs[1].y + 10);
  check("点 tab 切到日历", store.state.tab === "calendar", store.state.tab);
  await sleep(900);
  check("日历有格子", store.state.calendar.cells.length >= 28, String(store.state.calendar.cells.length));
  const days = store.state.calendar.cells.filter((c) => c.type === "day");
  check("日期数与该月一致", days.length === new Date(store.state.calendar.year, store.state.calendar.month, 0).getDate(), days.length + " vs " + new Date(store.state.calendar.year, store.state.calendar.month, 0).getDate());

  ops.length = 0;
  app.render();
  check("日历能渲染", ops.length > 0);
  check("切 tab 后内容从 0.96 淡入且导航仍可点击",
    ops.some((o) => o[0] === "scale" && o[1] === 0.96) &&
    ops.some((o) => o[0] === "fillText" && o[1] === "日历" && o[4] === 1));

  /* 8. 上一月 */
  const m0 = store.state.calendar.month;
  const monthButton = view.renderCalendar(vp, store.state).zones.find((zone) => zone.id === "prev-month").rect;
  app.dispatch(monthButton.x + monthButton.w / 2, monthButton.y + monthButton.h / 2);
  await sleep(900);
  check("上一月请求完成", store.state.calendar.month !== m0 && !store.state.calendar.loading, store.state.calendar.month + "/" + store.state.calendar.loading);

  /* 9. 图鉴 */
  app.dispatch(tabs[2].x + 10, tabs[2].y + 10);
  await sleep(1200);
  check("图鉴加载 20 张卡", store.state.collection.cards.length === 20, String(store.state.collection.cards.length));

  ops.length = 0;
  app.render();
  check("图鉴能渲染", ops.length > 0);

  const ownedCard = store.state.collection.cards.find((c) => c.owned);
  check("至少解锁 1 个角色", Boolean(ownedCard));

  if (ownedCard) {
    const idx = store.state.collection.cards.indexOf(ownedCard);
    const cr = layout.collectionCardRect(idx);
    // Scroll an owned role into the visible grid before clicking, as a player would.
    store.state.scroll = Math.min(store.state.scrollMax, Math.max(0, cr.y - 56));
    app.render();
    cr.y += layout.contentTop(vp) - store.state.scroll;
    app.dispatch(cr.x + 10, cr.y + 10);
    app.render();
    check("点卡片弹出详情", Boolean(store.state.selected && store.state.selected.name), JSON.stringify(store.state.selected && store.state.selected.name));

    const sheet = layout.sheetRect(vp);
    app.dispatch(375 - layout.PAD - 32, sheet.y + sheet.h - 31);
    check("点关闭收起详情", store.state.selected === null);
  }

  /* 10. 回今日 */
  app.dispatch(tabs[0].x + 10, tabs[0].y + 10);
  check("切回今日", store.state.tab === "today");

  // Start the entry before waiting; this harness has no automatic RAF paint.
  app.render();
  await sleep(300);

  /* 11. 重新抽卡（测试环境的临时口子）：作废今天的卡，重新发一包 */
  if (store.state.canRedraw) {
    ops.length = 0;
    app.render();

    const tasksN = store.state.draw.tasks.length;
    const rb = layout.redrawButtonRect(tasksN);
    rb.y += layout.contentTop(vp) - store.state.scroll;

    check("按钮文字画出来了", ops.some((o) => o[0] === "fillText" && o[1] === "重新抽一次"), "");
    const foot = layout.todayFootRect(tasksN);
    check("按钮排在页脚下方", rb.y > layout.contentTop(vp) + foot.y + foot.h, rb.y + " vs " + (layout.contentTop(vp) + foot.y + foot.h));
    check("按钮内容高度把按钮算进去了", layout.todayContentHWithRedraw(tasksN, true) > layout.todayContentH(tasksN), "");
    check("不开重抽时高度不变", layout.todayContentHWithRedraw(tasksN, false) === layout.todayContentH(tasksN), "");

    app.dispatch(rb.x + rb.w / 2, rb.y + rb.h / 2);
    await sleep(1500);
    check("重抽后回到未落定", !store.state.draw, "draw=" + Boolean(store.state.draw));
    check("重抽后重新摊开十张", store.state.offer.length === 10, String(store.state.offer.length));
    check("重抽后回到选卡包", store.stage() === "pack", store.stage());

    // 再抽一次，确认可以反复抽
    store.chooseSeries("deep");
    store.enterTear();
    store.swipeTear(require(resolve(ROOT, "game/js/pack.js")).TEAR_SWIPE * 2);
    store.state.anim.doneAt = Date.now() - 2000;
    app.render();
    const ids = store.state.offer.slice(0, 3).map((o) => o.id);
    ids.forEach((id) => store.flipCard(id));
    store.state.anim.at = Date.now() - 2000;
    app.render();
    store.selectSlot(ids[0]);
    await store.confirmPick();
    await sleep(400);
    check("重抽后还能再落定一次", Boolean(store.state.draw), "draw=" + Boolean(store.state.draw));
    check("重抽后落定的就是刚选的那张", store.state.draw && store.state.draw.role.id === ids[0], JSON.stringify(store.state.draw && store.state.draw.role.id));
    app.render(store.state.anim.at + require(resolve(ROOT, "game/js/pack.js")).REVEAL_MS + 20);
    check("丢帧后揭晓自动结束", store.stage() === "" && Boolean(store.state.draw));
  } else {
    check("生产环境不给重抽按钮", !store.state.canRedraw, "");
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n" + (results.length - failed.length) + "/" + results.length + " passed" + (failed.length ? ", " + failed.length + " failed" : "  ✅"));
  if (failed.length) process.exit(1);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
