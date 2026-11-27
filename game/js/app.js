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
var pagTear = require("./pag-tear.js");
var sfx = require("./sfx.js");
var todayCard = require("./today-card.js");
var calendarCard = require("./calendar-card.js");

var canvas = null;
var zones = [];
var drag = null;
var openedKeyboard = false;
var lastPhase = "";
var ENTRY_MS = 220;
var entryKey = "";
var entryAt = 0;
var entryFrame = { scale: 1, opacity: 1, cx: 0, cy: 0, tab: "", kind: "", busy: false };
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
  pagTear.onFrame(requestFrame);
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

/** Tear owns its file/surface only until the packet opens; the SDK stays shared. */
function syncTearPag(st, kind) {
  if (st.tab !== "today" || st.status !== "ready" || st.draw) { pagTear.release(); return; }
  if (kind === "pack") { pagTear.preload(); return; }
  if (kind === "opening" || kind === "tear" || kind === "tearFinish") {
    if (assets.pack(st.anim.series) || !assets.pending()) pagTear.prepare(pack.seriesOf(st.anim.series));
    return;
  }
  pagTear.release();
}

/** Warm PAG while the player opens/selects cards; discard role resources on exit. */
function syncPag() {
  if (!canvas) return;
  var st = store.state;
  var kind = (st.anim || {}).kind;
  syncTearPag(st, kind);
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

/** 页面入场使用同一个时钟；揭晓末段衔接今日卡，不再重新闪一下。 */
function sampleEntry(vp, state, kind, time) {
  var key = state.tab;
  if (state.tab === "today") {
    key += state.draw ? ":draw:" + state.draw.date + ":" + state.draw.role.id :
      state.status === "ready" && state.offer.length ? ":pack" : ":" + state.status;
  }
  if (key !== entryKey) {
    entryKey = key;
    entryAt = kind === "reveal" ? state.anim.at + pack.REVEAL_MS - ENTRY_MS : time;
  }
  // 提前点继续时立即入场；已经进入揭晓淡出末段则接着当前进度。
  if (entryFrame.kind === "reveal" && kind !== "reveal" && time < entryAt) entryAt = time;
  var p = animation.tween(0, 1, entryAt, ENTRY_MS, "outCubic", time);
  entryFrame.opacity = p;
  entryFrame.scale = 0.96 + 0.04 * p;
  entryFrame.cx = vp.width / 2;
  entryFrame.cy = layout.contentTop(vp) + layout.contentH(vp) / 2;
  entryFrame.tab = state.tab;
  entryFrame.kind = kind;
  entryFrame.busy = time < entryAt + ENTRY_MS;
}
function beginEntry() {
  var c = draw.getCtx();
  c.save();
  c.translate(entryFrame.cx, entryFrame.cy);
  c.scale(entryFrame.scale, entryFrame.scale);
  c.translate(-entryFrame.cx, -entryFrame.cy);
  c.globalAlpha *= entryFrame.opacity;
}
function entryZones(list) {
  if (entryFrame.scale===1) return list;
  function transform(r) {
    var k=entryFrame.scale;
    return Object.assign({},r,{x:entryFrame.cx+(r.x-entryFrame.cx)*k,
      y:entryFrame.cy+(r.y-entryFrame.cy)*k,w:r.w*k,h:r.h*k});
  }
  return list.map(function(zone) {
    var next=Object.assign({},zone,{rect:transform(zone.rect)});
    if(zone.sourceRect) next.sourceRect=transform(zone.sourceRect);
    return next;
  });
}
function entryPoint(x, y, kind) {
  if (entryFrame.scale === 1 || entryFrame.tab !== store.state.tab || entryFrame.kind !== kind) return {x:x,y:y};
  return {x:entryFrame.cx + (x-entryFrame.cx)/entryFrame.scale,
    y:entryFrame.cy + (y-entryFrame.cy)/entryFrame.scale};
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
  } else if ((anim.kind === "tear" || anim.kind === "tearFinish") && anim.doneAt) {
    if (anim.kind === "tear") store.enterTearFinish(pagTear.begin(anim.doneAt, pack.seriesOf(anim.series),anim.tearDirection || 1), pagTear.status().durationMs);
    if (st.anim.finishMode === "pag" && pagTear.status().mode !== "pag") store.fallbackTearFinish();
    if (time - st.anim.doneAt >= st.anim.finishMs) store.enterRing();
  } else if (anim.kind === "top" && time - anim.at >= pack.TOP_MS) {
    store.enterPick();
  } else if (anim.kind === "reveal" && time - anim.at >= pack.REVEAL_MS) {
    store.finishReveal();
  }
  var recoiling = store.tickTear(time);
  if (!todayCardActive(st)) todayCard.cancel();
  if (st.tab!=="calendar" && calendarCard.active()) calendarCard.release();
  syncPag();

  draw.clear();
  syncPhase();
  starfield.paint(v);

  var titles = { today: "今日角色", calendar: "日历", collection: "角色图鉴" };

  // 开卡包过场是全屏的，有它就不画标题和换背景按钮
  var packStage = st.tab === "today" && st.status === "ready" ? store.stage() : "";
  sampleEntry(v, st, packStage, time);
  // 生成的外景整页淡铺：过场里跟着玩家挑的系列，平时按时段
  if (packStage && st.anim && st.anim.series) backdrop.pin(st.anim.series);
  else backdrop.unpin();
  backdrop.paint(v);

  if (!packStage || packStage === "reveal") {
    var subs = {
      today: st.draw ? layout.monthDay(st.draw.date) : "",
      calendar: "",
      collection: st.collection.loading
        ? ""
        : "已解锁 " + countOwned(st) + " / " + st.collection.cards.length,
    };
    view.header(v, titles[st.tab] || "", subs[st.tab] || "");
    view.renderBgButton(v, layout.bgButtonRect(v), bg);
  }

  // 揭晓淡出时露出的今日卡牌仍限制在内容区，不能穿过底部导航。
  if (packStage === "reveal") draw.clipRect(0, layout.contentTop(v), v.width, layout.contentH(v));
  var result;
  beginEntry();
  if (st.tab === "today") result = view.renderToday(v, st);
  else if (st.tab === "calendar") result = view.renderCalendar(v, st);
  else result = view.renderCollection(v, st);
  draw.restore();
  if (packStage === "reveal") draw.restore();

  var list = entryZones((result && result.zones) || []);
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

  if (st.tab==='calendar' && calendarCard.active()) {
    var calendarZones=calendarCard.render(v);
    if(calendarZones.length) zones=calendarZones.concat(tabZones);
  }

  // 开卡包过场画在内容上方；揭晓的最后一段透出下面的今日卡牌。
  if (packStage) {
    // 选包放大和 PAG 自带完整时间轴，页面入场不叠加到这两段。
    var enteringPack = packStage !== "opening" && packStage !== "reveal";
    if (enteringPack) beginEntry();
    var packRes = packview.render(v, st);
    if (enteringPack) draw.restore();
    zones = (enteringPack ? entryZones(packRes.zones || []) : packRes.zones || []).concat(tabZones);
    if (packStage === "reveal") st.scrollMax = 0;
  }
  return Boolean(
    (st.tab==='calendar' && calendarCard.busy(v)) ||
    (todayCardActive(st) && todayCard.snapshot().busy) ||
    entryFrame.busy || starfield.isFading() || backdrop.isFading() ||
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

function todayCardActive(st) {
  return st.tab === 'today' && st.status === 'ready' && st.draw && !store.stage() && !st.selected;
}

function cardController(st) {
  if(st.tab==='calendar' && calendarCard.interactive()) return calendarCard;
  return todayCardActive(st) ? todayCard : null;
}

function firstTouch(e) {
  if (e.touches && e.touches.length) return e.touches[0];
  if (e.changedTouches && e.changedTouches.length) return e.changedTouches[0];
  return null;
}

function onTouchStart(e) {
  var t = firstTouch(e);
  if (!t) return;
  sfx.unlock();
  var p = toDesign(t);
  var packet = tearDragging(store.state) ? pack.tearRect(layout.contentTop(env.viewport())) : null;
  var packetPoint = entryPoint(p.x, p.y, "tear");
  function inPacket(point) {
    return packet && point.x >= packet.x - 12 && point.x <= packet.x + packet.w + 12 &&
      point.y >= packet.y && point.y <= packet.y + packet.h;
  }
  // 入场期间同时接受画面坐标和设计稿坐标，包边缘起手也能把玩。
  var tilting = inPacket(packetPoint) || inPacket(p);
  drag = {
    startX: p.x,
    startY: p.y,
    lastX: p.x,
    lastY: p.y,
    prevX: p.x,
    prevY: p.y,
    tearDirection: 0,
    scroll: store.state.scroll,
    moved: false,
    turned: false,
    tilting: Boolean(tilting),
    tilt: tilting ? store.state.anim.tilt || 0 : 0,
  };
  if (tilting) store.tiltTear(drag.tilt);
  var zone = topZoneAt(p.x, p.y);
  var controller=cardController(store.state);
  if(controller && zone && (zone.id==='today-card' || zone.id==='calendar-card')) {
    var cardPoint=controller===todayCard?entryPoint(p.x,p.y,''):p;
    drag.card=controller;
    controller.begin(cardPoint.x,cardPoint.y);
  }
}

/** 环形阶段：横向拖动 = 转动转盘 */
function ringDragging(st) {
  return st.tab === "today" && !st.draw && st.anim && st.anim.kind === "ring";
}

/** 撕开阶段：任意位置、任意方向的划动推进撕开，不要求沿封口划。 */
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

  if(drag.card) {
    if(cardController(store.state)!==drag.card) {drag.card.cancel();return;}
    if(Math.abs(dx)>5 || Math.abs(dy)>5) drag.moved=true;
    if(drag.moved) {
      var cardPoint=drag.card===todayCard?entryPoint(p.x,p.y,''):p;
      drag.card.move(cardPoint.x,cardPoint.y);
      requestFrame();
    }
    return;
  }
  // A focused calendar card owns gestures; don't scroll the month beneath it.
  if(store.state.tab==='calendar' && calendarCard.active()) {
    if(Math.abs(dx)>5 || Math.abs(dy)>5) drag.moved=true;
    return;
  }

  // 使用实际划动距离；左右、上下、斜划都有效，点击和微小抖动不撕开。
  if (tearDragging(store.state)) {
    var stepX = p.x - (drag.prevX == null ? drag.startX : drag.prevX);
    var stepY = p.y - (drag.prevY == null ? drag.startY : drag.prevY);
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      if (!drag.tearDirection) {
        drag.tearDirection = Math.abs(dx) >= Math.abs(dy) && dx < 0 ? -1 : 1;
        stepX = dx; stepY = dy; // 达到拖动阈值后补上起手位移，不损失撕开距离。
      }
      var step = Math.sqrt(stepX * stepX + stepY * stepY);
      if (step > 0) store.swipeTear(step,drag.tearDirection);
    }
    drag.prevX = p.x;
    drag.prevY = p.y;
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
  if (e && e.canceled) {
    var wasTearing = tearDragging(store.state);
    if (drag.card) { drag.card.end(true); requestFrame(); }
    drag = null;
    if (wasTearing) { store.releaseTear(); requestFrame(); }
    return;
  }
  var t = firstTouch(e);
  var wasDrag = drag.moved;
  var point = t ? toDesign(t) : { x: drag.startX, y: drag.lastY };
  var tearing = tearDragging(store.state);
  var wasCard = drag.card;
  drag = null;
  if (wasCard) {
    if (cardController(store.state)===wasCard) wasCard.end(false, !wasDrag);
    else wasCard.cancel();
    requestFrame();
    return;
  }
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
    var ringPoint = entryPoint(x, y, "ring");
    var hitId = packview.hitRing(env.viewport(), st, ringPoint.x, ringPoint.y);
    if (hitId) {
      store.flipCard(hitId);
      return;
    }
  }

  if (!z) return;

  if(z.id==='calendar-card') {calendarCard.flip();requestFrame();return;}
  if(z.id==='calendar-card-close' || z.id==='calendar-card-dismiss') {
    calendarCard.close(env.viewport());requestFrame();return;
  }
  if (z.id === "today-card" && todayCardActive(st)) {
    todayCard.flip(); requestFrame(); return;
  }
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
  if (z.id === 'retry-calendar') {
    store.loadCalendar(st.calendar.year,st.calendar.month);
    return;
  }
  if (z.id === 'day') {
    if(z.entry) {
      calendarCard.open(z,env.viewport());
      requestFrame();
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

function boot() {
  var w = env.getWx();
  env.refreshMetrics();
  bg.apply(); // 恢复上次选的背景模式；自动模式就按当前钟点

  // 生成的图（卡包外表 + 卡包背景）开始加载；到了就重画一帧
  assets.onLoad(requestFrame);
  assets.preload();
  assets.preloadSounds();
  sfx.resume();

  var runtime = w && typeof w.createCanvas === "function" ? w.createCanvas() : null;
  if (runtime) setCanvas(runtime);

  if (w && typeof w.onHide === "function") w.onHide(function () { todayCard.cancel(); calendarCard.cancel(); frameLoop.pause(); pagReveal.pause(); pagTear.pause(); sfx.pause(); });
  if (w && typeof w.onShow === "function") w.onShow(function () { pagReveal.resume(); pagTear.resume(); frameLoop.resume(); sfx.resume(); });

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
