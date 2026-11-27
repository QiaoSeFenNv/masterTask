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
var animation = require("./animation.js");
var pack = require("./pack.js");
var pagReveal = require("./pag-reveal.js");

var canvas = null;
var zones = [];
var drag = null;
var openedKeyboard = false;
var lastPhase = "";
var frameLoop = animation.createLoop({
  request: function (callback) { return env.requestFrame(callback, canvas); },
  cancel: env.cancelFrame,
  render: render,
});

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
  pagReveal.onFrame(requestFrame);
  syncPag();
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
  if (canvas) frameLoop.request();
}

/** Warm PAG while the player opens/selects cards; discard role resources on exit. */
function syncPag() {
  if (!canvas) return;
  var st = store.state;
  var kind = (st.anim || {}).kind;
  if (st.tab !== "today" || st.status !== "ready") { pagReveal.release(); return; }
  if (kind === "reveal" && st.draw) { pagReveal.prepare(st.draw.role); return; }
  if (!st.draw) {
    pagReveal.preload();
    if (kind === "pick" || kind === "top") {
      var roles = store.pickedRoles();
      for (var i = 0; i < roles.length; i++) {
        if (roles[i].id === st.slot) { pagReveal.prepare(roles[i]); break; }
      }
      return;
    }
  }
  pagReveal.release();
}

function countOwned(state) {
  var n = 0;
  var cards = state.collection.cards || [];
  for (var i = 0; i < cards.length; i++) {
    if (cards[i].owned) n++;
  }
  return n;
}

function render(time) {
  return animation.withTime(time, paint);
}

function paint() {
  var v = env.viewport();
  var st = store.state;
  var time = animation.now();
  var anim = st.anim || {};
  // 所有阶段在画之前推进；一帧内的状态和命中区始终对应同一画面。
  if (anim.kind === "opening" && time - anim.at >= pack.OPEN_MS) {
    store.enterTear();
  } else if (anim.kind === "tear" && anim.doneAt && time - anim.doneAt >= pack.TEAR_FINISH_MS) {
    store.enterRing();
  } else if (anim.kind === "top" && time - anim.at >= pack.TOP_MS) {
    store.enterPick();
  } else if (anim.kind === "reveal" && time - anim.at >= pack.REVEAL_MS) {
    store.finishReveal();
  }
  var recoiling = store.tickTear(time);
  syncPag();

  draw.clear();
  syncPhase();
  starfield.paint(v);

  var titles = { today: "今日角色", calendar: "历史日历", collection: "角色图鉴" };

  // 开卡包过场是全屏的，有它就不画标题和换背景按钮
  var packStage = st.tab === "today" && st.status === "ready" ? store.stage() : "";
  // 生成的外景整页淡铺：过场里跟着玩家挑的系列，平时按时段
  if (packStage && st.anim && st.anim.series) backdrop.pin(st.anim.series);
  else backdrop.unpin();
  backdrop.paint(v);

  if (!packStage || packStage === "reveal") {
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

  // 揭晓淡出时露出的任务内容仍限制在内容区，不能穿过底部导航。
  if (st.tab === "today") draw.clipRect(0, layout.contentTop(v), v.width, layout.contentH(v));
  var result;
  if (st.tab === "today") result = view.renderToday(v, st);
  else if (st.tab === "calendar") result = view.renderCalendar(v, st);
  else result = view.renderCollection(v, st);
  if (st.tab === "today") draw.restore();

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

  // 开卡包过场画在内容上方；揭晓的最后一段透出下面的任务页。
  if (packStage) {
    var packRes = packview.render(v, st);
    zones = (packRes.zones || []).concat(tabZones);
    if (packStage === "reveal") st.scrollMax = 0;
  }
  return Boolean(
    starfield.isFading() || backdrop.isFading() ||
    (packStage && (recoiling || packview.busy(st))) ||
    (st.toast && time - st.toastAt < 2000)
  );
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
  var zone = topZoneAt(p.x, p.y);
  if (!e.scrollOnly && !store.state.selected && store.state.status === "ready" && zone && zone.id === "scratch" && store.scratchPending()) {
    drag.scratch = {key:store.state.scratch.key, cover:zone.cover, prev:p};
    store.scratchStroke({x:p.x-zone.cover.x,y:p.y-zone.cover.y}, {x:p.x-zone.cover.x,y:p.y-zone.cover.y});
  }
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

  if (drag.scratch) {
    var gesture = drag.scratch;
    if (store.state.scratch && store.state.scratch.key === gesture.key) {
      store.scratchStroke({x:gesture.prev.x-gesture.cover.x,y:gesture.prev.y-gesture.cover.y},
        {x:p.x-gesture.cover.x,y:p.y-gesture.cover.y});
    }
    gesture.prev = p; drag.moved = true;
    return; // Even after auto-unlock, do not turn the remainder into scrolling/taps.
  }

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
  if (drag.scratch) {
    store.saveScratch(); drag = null; requestFrame(); return;
  }
  if (e && e.canceled) {
    var wasTearing = tearDragging(store.state);
    drag = null;
    if (wasTearing) { store.releaseTear(); requestFrame(); }
    return;
  }
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
  if (z.id === "reveal") {
    if (animation.now() - st.anim.at >= pack.REVEAL_FOCUS_MS) store.finishReveal();
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
  if (store.scratchPending()) return;
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

function boot() {
  var w = env.getWx();
  env.refreshMetrics();
  bg.apply(); // 恢复上次选的背景模式；自动模式就按当前钟点

  // 生成的图（卡包外表 + 卡包背景）开始加载；到了就重画一帧
  assets.onLoad(requestFrame);
  assets.preload();

  var runtime = w && typeof w.createCanvas === "function" ? w.createCanvas() : null;
  if (runtime) setCanvas(runtime);

  if (w && typeof w.onHide === "function") w.onHide(function () { store.saveScratch(); drag = null; frameLoop.pause(); pagReveal.pause(); });
  if (w && typeof w.onShow === "function") w.onShow(function () { pagReveal.resume(); frameLoop.resume(); });

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
    syncPag();
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
