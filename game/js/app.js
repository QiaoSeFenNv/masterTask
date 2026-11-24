/**
 * 小游戏启动器。
 * - 建全屏 canvas,按设备像素比设像素尺寸
 * - 订阅 store,状态一变就重绘
 * - 触摸按下/抬起做点按判定,拖动做滚动
 */

var env = require("./env.js");
var draw = require("./draw.js");
var layout = require("./layout.js");
var store = require("./store.js");
var view = require("./render.js");
var starfield = require("./starfield.js");
var packview = require("./packview.js");
var bg = require("./bg.js");
var backdrop = require("./backdrop.js");
var theme = require("./theme.js");
var assets = require("./assets.js");

var canvas = null;
var pending = false;
var zones = [];
var drag = null;
var openedKeyboard = false;
var lastPhase = "";

/**
 * 按「背景模式」把主题切到该有的配色。
 * 自动模式看钟；手动模式不看钟。只有实际变了才重画，免得每帧都刷。
 */
function syncPhase() {
  var p = bg.resolve();
  if (p === lastPhase) return false;
  lastPhase = p;
  theme.apply(p);
  return true;
}

function setCanvas(c) {
  canvas = c;
  draw.init(c);
  resize();
}

function resize() {
  if (!canvas) return;
  var m = env.size();
  var dpr = m.pixelRatio || 1;
  canvas.width = Math.round(m.width * dpr);
  canvas.height = Math.round(m.height * dpr);
  requestFrame();
}

function requestFrame() {
  if (pending) return;
  pending = true;
  var run = function () {
    pending = false;
    render();
  };
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(run);
  } else {
    setTimeout(run, 16);
  }
}

function countOwned(state) {
  var n = 0;
  var cards = state.collection.cards || [];
  for (var i = 0; i < cards.length; i++) {
    if (cards[i].owned) n++;
  }
  return n;
}

function render() {
  var v = env.viewport();
  var st = store.state;

  draw.clear();
  syncPhase();
  starfield.paint(v);

  var titles = { today: "今日角色", calendar: "历史日历", collection: "角色图鉴" };

  // 开卡包过场是全屏的，有它就不画标题和换背景按钮
  var packStage = st.tab === "today" && st.status === "ready" && !st.draw ? store.stage() : "";
  // 生成的外景整页淡铺：过场里跟着玩家挑的系列，平时按时段
  if (packStage && st.anim && st.anim.series) backdrop.pin(st.anim.series);
  else backdrop.unpin();
  backdrop.paint(v);

  if (!packStage) {
    var subs = {
      today: st.draw ? layout.monthDay(st.draw.date) : "",
      calendar: st.calendar.loading ? "" : "连续 " + st.calendar.streak + " 天",
      collection: st.collection.loading
        ? ""
        : "已解锁 " + countOwned(st) + " / " + st.collection.cards.length,
    };
    view.header(v, titles[st.tab] || "", subs[st.tab] || "");
    view.renderBgButton(v, layout.bgButtonRect(v), bg);
  }

  var result;
  if (st.tab === "today") result = view.renderToday(v, st);
  else if (st.tab === "calendar") result = view.renderCalendar(v, st);
  else result = view.renderCollection(v, st);

  var list = (result && result.zones) || [];
  var contentH = (result && result.contentH) || layout.contentH(v);
  st.scrollMax = Math.max(0, contentH - layout.contentH(v));
  if (st.scroll > st.scrollMax) st.scroll = st.scrollMax;

  view.renderTabbar(v, st.tab);
  view.renderToast(v, st);

  var tabZones = view.tabbarRects(v).map(function (t) {
    return { id: "tab", tab: t.id, rect: t };
  });
  // 命中顺序 = 绘制顺序的逆序(上层优先):内容 → tabbar → 换背景 → 弹层
  zones = list.concat(tabZones);
  if (!packStage) zones.push({ id: "bg", rect: layout.bgButtonRect(v) });
  if (st.selected) {
    zones = zones.concat(view.renderSheet(v, st));
  }

  if (starfield.isFading()) scheduleFadeFrame();

  // 开卡包过场：画在最上层，占满内容区
  if (packStage) {
    // 先推进阶段，再画，免得这一帧画的是上一阶段的内容。
    // 撕开这一阶段由玩家自己划，只有「撕通了 + 那条纸飘完」才进环形。
    var anim = st.anim || {};
    if (anim.kind === "tear" && anim.doneAt && Date.now() - anim.doneAt >= packview.TEAR_FINISH_MS) {
      store.enterRing();
    } else if (anim.kind === "top" && Date.now() - anim.at >= packview.TOP_MS) {
      store.enterPick();
    }
    // 松手后的回弹要一帧一帧推
    if (anim.kind === "tear" && store.tickTear(Date.now())) requestFrame();

    var packRes = packview.render(v, st);
    zones = (packRes.zones || []).concat(tabZones);
    if (packview.busy(st)) schedulePackFrame();
  }
}

/** 过场动画期间连续出帧 */
var packTimer = null;
var PACK_FRAME_MS = 33; // 约 30fps，小游戏里足够了

function schedulePackFrame() {
  if (packTimer) return;
  packTimer = setTimeout(function () {
    packTimer = null;
    requestFrame();
  }, PACK_FRAME_MS);
}

/* ---------------- 命中 ---------------- */

function hitZone(zone, x, y) {
  var r = zone.rect;
  if (x < r.x || x > r.x + r.w) return false;
  if (y < r.y || y > r.y + r.h) return false;
  return true;
}

function topZoneAt(x, y) {
  // 后画的在上层,所以从末尾往前找
  for (var i = zones.length - 1; i >= 0; i--) {
    if (hitZone(zones[i], x, y)) return zones[i];
  }
  return null;
}

/** 触摸坐标(逻辑像素)-> 设计稿单位 */
function toDesign(touch) {
  var sx = env.size().width / env.DESIGN_WIDTH;
  var x = touch.clientX;
  var y = touch.clientY;
  if (x == null) x = 0;
  if (y == null) y = 0;
  return { x: x / sx, y: y / sx };
}

/* ---------------- 触摸 ---------------- */

function firstTouch(e) {
  if (e.touches && e.touches.length) return e.touches[0];
  if (e.changedTouches && e.changedTouches.length) return e.changedTouches[0];
  return null;
}

function onTouchStart(e) {
  var t = firstTouch(e);
  if (!t) return;
  var p = toDesign(t);
  drag = {
    startX: p.x,
    startY: p.y,
    lastX: p.x,
    lastY: p.y,
    prevX: p.x,
    scroll: store.state.scroll,
    moved: false,
    turned: false,
  };
}

/** 环形阶段：横向拖动 = 转动转盘 */
function ringDragging(st) {
  return st.tab === "today" && !st.draw && st.anim && st.anim.kind === "ring";
}

/** 撕开阶段：横向划过包口 = 撕开（等玩家自己动手，不自动跑） */
function tearDragging(st) {
  return (
    st.tab === "today" &&
    !st.draw &&
    st.anim &&
    st.anim.kind === "tear" &&
    !st.anim.doneAt
  );
}

function onTouchMove(e) {
  if (!drag) return;
  var t = firstTouch(e);
  if (!t) return;
  var p = toDesign(t);
  var dx = p.x - drag.startX;
  var dy = p.y - drag.startY;
  drag.lastX = p.x;
  drag.lastY = p.y;

  // 撕包口：只认往右的那一小段位移，撕口严格跟着手指走
  if (tearDragging(store.state)) {
    var step = p.x - (drag.prevX == null ? drag.startX : drag.prevX);
    if (step > 0) store.swipeTear(step);
    drag.prevX = p.x;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;
    requestFrame();
    return;
  }

  // 转盘：横向为主就别拿去滚动页面
  if (ringDragging(store.state) && Math.abs(dx) > 6) {
    drag.turned = true;
    drag.moved = true;
    store.rotateRing(p.x - (drag.prevX == null ? drag.startX : drag.prevX));
    drag.prevX = p.x;
    requestFrame();
    return;
  }
  if (drag.turned) {
    drag.prevX = p.x;
    return;
  }

  if (Math.abs(dy) > 8) drag.moved = true;
  if (drag.moved && store.state.scrollMax > 0) {
    var next = drag.scroll - dy;
    if (next < 0) next = 0;
    if (next > store.state.scrollMax) next = store.state.scrollMax;
    store.state.scroll = next;
    requestFrame();
  }
}

function onTouchEnd(e) {
  if (!drag) return;
  var t = firstTouch(e);
  var wasDrag = drag.moved;
  var point = t ? toDesign(t) : { x: drag.startX, y: drag.lastY };
  var tearing = tearDragging(store.state);
  drag = null;
  if (tearing) {
    // 松手：撕到哪儿算哪儿，弹回去一点点，不用从头再划
    store.releaseTear();
    requestFrame();
    return;
  }
  if (wasDrag) return;
  dispatch(point.x, point.y);
}

/* ---------------- 派发 ---------------- */

/** 开卡包过场正在（或该）占屏时，内容区的点击只给过场用 */
function packOwnsScreen(st) {
  return Boolean(st.offer && st.offer.length) && st.tab === "today" && !st.draw;
}

function dispatch(x, y) {
  var z = topZoneAt(x, y);
  var st = store.state;

  // 环形阶段要靠几何命中（卡片是转着的，zones 里存不下来）
  if (st.tab === "today" && st.status === "ready" && !st.draw && st.anim.kind === "ring") {
    var hitId = packview.hitRing(env.viewport(), st, x, y);
    if (hitId) {
      store.flipCard(hitId);
      return;
    }
  }

  if (!z) return;

  if (z.id === "tab") {
    store.setTab(z.tab);
    return;
  }
  if (!st.draw && packOwnsScreen(st)) {
    if (z.id === "series") {
      store.chooseSeries(z.seriesId);
      return;
    }
    if (z.id === "slot") {
      if (!st.shifting) store.selectSlot(z.roleId);
      return;
    }
    if (z.id === "confirm-pick") {
      if (!st.shifting) store.confirmPick().catch(function () {});
      return;
    }
  }
  if (z.id === "task") {
    if (!st.shuffling) store.toggleTask(z.taskId);
    return;
  }
  if (z.id === "note") {
    openKeyboard();
    return;
  }
  if (z.id === "retry") {
    store.loadToday();
    return;
  }
  if (z.id === "redraw") {
    if (!st.shifting) {
      store.redrawToday().catch(function () {});
    }
    return;
  }
  if (z.id === "prev-month") {
    var cal = st.calendar;
    var py = cal.month === 1 ? cal.year - 1 : cal.year;
    var pm = cal.month === 1 ? 12 : cal.month - 1;
    store.loadCalendar(py, pm);
    return;
  }
  if (z.id === "next-month") {
    var c2 = st.calendar;
    var ny = c2.month === 12 ? c2.year + 1 : c2.year;
    var nm = c2.month === 12 ? 1 : c2.month + 1;
    store.loadCalendar(ny, nm);
    return;
  }
  if (z.id === "day") {
    if (z.entry) {
      store.selectCard({
        name: z.entry.roleName,
        emoji: z.entry.emoji,
        tagline:
          layout.monthDay(z.date) +
          " · " +
          z.entry.tasksDone +
          " / " +
          z.entry.tasksTotal +
          " 任务",
        intro: "这一天的角色。",
        gradient: z.entry.gradient,
        accent: z.entry.gradient[0],
        times: 0,
        taskCount: 0,
      });
    }
    return;
  }
  if (z.id === "card") {
    if (z.card && z.card.owned) store.selectCard(z.card);
    return;
  }
  if (z.id === "sheet-close") {
    store.closeSelected();
    return;
  }
  if (z.id === "bg") {
    bg.cycle();
    lastPhase = ""; // 让 syncPhase 下次一定重新应用
    requestFrame();
    store.toast(bg.label());
    return;
  }
}

/* ---------------- 键盘(手记输入) ---------------- */

/**
 * 手记输入:调微信自带的输入弹窗(带系统键盘),不用自己在 canvas 里糊输入框。
 * showModal 的 editable 从基础库 2.17.1 起支持;更老的版本退回 showKeyboard。
 */
function openKeyboard() {
  var w = env.getWx();
  if (!w) return;

  if (typeof w.showModal === "function") {
    w.showModal({
      title: "今日手记",
      editable: true,
      placeholderText: "记一句今天最想记住的话",
      content: store.state.noteDraft || "",
      confirmText: "保存",
      cancelText: "取消",
      success: function (res) {
        if (!res.confirm) return;
        var text = String(res.content || "").slice(0, 200);
        store.setNoteDraft(text);
        store.saveNote();
      },
      fail: function () {
        fallbackKeyboard(w);
      },
    });
    return;
  }
  fallbackKeyboard(w);
}

function fallbackKeyboard(w) {
  if (typeof w.showKeyboard !== "function") {
    store.toast("手记需要在手机或模拟器里输入");
    return;
  }
  if (openedKeyboard) return;
  openedKeyboard = true;

  w.showKeyboard({
    defaultValue: store.state.noteDraft || "",
    maxLength: 200,
    multiple: false,
    confirmType: "done",
    success: function () {},
    fail: function () {
      openedKeyboard = false;
    },
  });

  if (typeof w.onKeyboardInput === "function") {
    w.onKeyboardInput(function (res) {
      store.setNoteDraft(res.value);
    });
  }
  if (typeof w.onKeyboardConfirm === "function") {
    w.onKeyboardConfirm(function (res) {
      store.setNoteDraft(res.value);
      store.saveNote();
      openedKeyboard = false;
      if (typeof w.hideKeyboard === "function") w.hideKeyboard({});
    });
  }
  if (typeof w.onKeyboardComplete === "function") {
    w.onKeyboardComplete(function () {
      store.saveNote();
      openedKeyboard = false;
    });
  }
}

/* ---------------- 启动 ---------------- */

/** 背景交叉淡入期间要连着出帧，否则会停在一张半透明的画面上 */
var fadeTimer = null;

function scheduleFadeFrame() {
  if (fadeTimer) return;
  fadeTimer = setTimeout(function () {
    fadeTimer = null;
    requestFrame();
  }, 40);
}

function boot() {
  var w = env.getWx();
  env.refreshMetrics();
  bg.apply(); // 恢复上次选的背景模式；自动模式就按当前钟点

  // 生成的图（卡包外表 + 卡包背景）开始加载；到了就重画一帧
  assets.onLoad(requestFrame);
  assets.preload();

  var runtime = w && typeof w.createCanvas === "function" ? w.createCanvas() : null;
  if (runtime) setCanvas(runtime);

  if (w && typeof w.onTouchStart === "function") {
    w.onTouchStart(onTouchStart);
    w.onTouchMove(onTouchMove);
    w.onTouchEnd(onTouchEnd);
  }
  return runtime;
}

function start() {
  var c = boot();
  if (c) {
    requestFrame();
  }
  store.subscribe(function () {
    requestFrame();
  });
  store.loadToday();
  return {
    canvas: canvas,
    store: store,
    render: render,
    dispatch: dispatch,
    setCanvas: setCanvas,
    resize: resize,
  };
}

module.exports = {
  start: start,
  setCanvas: setCanvas,
  resize: resize,
  render: render,
  dispatch: dispatch,
  onTouchStart: onTouchStart,
  onTouchMove: onTouchMove,
  onTouchEnd: onTouchEnd,
  openKeyboard: openKeyboard,
};
