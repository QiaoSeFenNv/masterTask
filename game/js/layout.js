/**
 * 布局计算:纯数据,不碰画布。
 * 坐标统一是 375 宽的设计稿单位,绘制时整体按 scale 放大。
 *
 * vp = { width, height, safeTop, safeBottom }(设计稿单位)
 */

var W = 375;
var PAD = 20;
var CARDPAD = 6;

/* ---------------- 公共 ---------------- */

function headerTop(vp) {
  return vp.safeTop + 14;
}

function tabbarH() {
  return 58;
}

function contentTop(vp) {
  return vp.safeTop + 92;
}

function contentBottom(vp) {
  return vp.height - vp.safeBottom - tabbarH();
}

function contentH(vp) {
  return contentBottom(vp) - contentTop(vp);
}

function innerW() {
  return W - PAD * 2;
}

function weekdayZh(dateStr) {
  var names = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  var p = String(dateStr || "").split("-");
  if (p.length !== 3) return "";
  return names[new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).getDay()] || "";
}

function monthDay(dateStr) {
  var p = String(dateStr || "").split("-");
  return (p[1] || "") + " / " + (p[2] || "");
}

/* ---------------- 视图归一 ---------------- */

function normalizeDraw(draw) {
  if (!draw) return null;
  var byTask = {};
  (draw.checkins || []).forEach(function (c) {
    byTask[c.taskId] = c;
  });
  var tasks = (draw.tasks || []).map(function (t, i) {
    var c = byTask[t.id];
    return {
      index: i,
      id: t.id,
      text: t.text,
      tag: t.tag || "",
      done: Boolean(c && c.done),
      note: (c && c.note) || "",
    };
  });
  var done = 0;
  var note = "";
  tasks.forEach(function (t) {
    if (t.done) done++;
    if (t.note && !note) note = t.note;
  });
  return {
    date: draw.date,
    role: draw.role,
    tasks: tasks,
    doneCount: done,
    noteDraft: note,
  };
}

/* ---------------- 今日 ---------------- */

var FACE_H = 196;
var TASK_H = 62;
var TASK_GAP = 10;
var NOTE_H = 152;

function cardW() {
  return W - PAD * 2;
}

function todayCardRect() {
  return { x: PAD, y: 0, w: cardW(), h: FACE_H, r: 22 };
}

function todayScratchRect() {
  return { x: PAD, y: FACE_H + 56, w: cardW(), h: 340, r: 16 };
}
function todayScratchContentH() { return todayScratchRect().y + todayScratchRect().h + 76; }
function todayIntroRect() { return {x:PAD, y:FACE_H + 24, w:cardW(), h:86, r:14}; }

function todayTaskRect(i) {
  return {
    x: PAD,
    y: FACE_H + 124 + i * (TASK_H + TASK_GAP),
    w: cardW(),
    h: TASK_H,
    r: 14,
  };
}

function todayNoteRect(taskCount) {
  var y = FACE_H + 124 + taskCount * (TASK_H + TASK_GAP) + 12;
  return { x: PAD, y: y, w: cardW(), h: NOTE_H, r: 16 };
}

function todayFootRect(taskCount) {
  var n = todayNoteRect(taskCount);
  return { x: 0, y: n.y + n.h + 28, w: W, h: 28 };
}

function todayContentH(taskCount) {
  return todayFootRect(taskCount).y + todayFootRect(taskCount).h + 18;
}

/**
 * 页脚下面那条「重新抽卡」。只在服务端放开时（测试环境）才画，
 * 所以位置独立算，不影响正常玩法的内容高度。
 */
var REDRAW_H = 36;

function redrawButtonRect(taskCount) {
  var f = todayFootRect(taskCount);
  var w = 132;
  return { x: (W - w) / 2, y: f.y + f.h + 14, w: w, h: REDRAW_H, r: REDRAW_H / 2 };
}

/** 多出来的高度只在那颗按钮真的会画的时候才加 */
function todayContentHWithRedraw(taskCount, withRedraw) {
  var base = todayContentH(taskCount);
  if (!withRedraw) return base;
  var b = redrawButtonRect(taskCount);
  return b.y + b.h + 18;
}

/** 未抽卡时的卡背 + 按钮 */
function idlePackRect() {
  return { x: PAD + 30, y: 0, w: innerW() - 60, h: 300, r: 18 };
}

function idleButtonRect() {
  return { x: PAD, y: 348, w: innerW(), h: 54, r: 27 };
}

function idleContentH() {
  return 460;
}

/* ---------------- 三选一 ---------------- */

var OFFER_GAP = 11;

/** 三张候选卡:一排摊开 */
function offerCardRect(i) {
  var w = (innerW() - OFFER_GAP * 2) / 3;
  var h = 168;
  return { x: PAD + i * (w + OFFER_GAP), y: 0, w: w, h: h, r: 14 };
}

function offerIntroRect() {
  return { x: PAD, y: 188, w: innerW(), h: 84, r: 14 };
}

function offerButtonRect() {
  return { x: PAD, y: 290, w: innerW(), h: 54, r: 27 };
}

function offerContentH() {
  return 460;
}

/** 点满三张以后，从这三张里选一张落定 */
var PICK_GAP = 11;

/** Use the title space when a short viewport needs more room for the candidates. */
function pickTop(vp) {
  var deficit = Math.max(0, pickContentH() - contentH(vp));
  return Math.max(vp.safeTop + 24, contentTop(vp) - deficit);
}

function pickCardRect(i) {
  var w = (innerW() - PICK_GAP * 2) / 3;
  var h = 168;
  return { x: PAD + i * (w + PICK_GAP), y: 48, w: w, h: h, r: 14 };
}

function pickIntroRect() {
  return { x: PAD, y: 234, w: innerW(), h: 84, r: 14 };
}

function pickButtonRect() {
  return { x: PAD, y: 348, w: innerW(), h: 54, r: 27 };
}

function pickContentH() {
  return 450;
}

function pickIndex(list, id) {
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) return i;
  }
  return -1;
}

/* ---------------- 日历 ---------------- */

var CAL_COLS = 7;

function calendarGridTop() {
  return 76;
}

function calendarCellRect(i) {
  var cellW = innerW() / CAL_COLS;
  var row = Math.floor(i / CAL_COLS);
  var col = i % CAL_COLS;
  return {
    x: PAD + col * cellW + 2,
    y: calendarGridTop() + row * (cellW + 6) + 2,
    w: cellW - 4,
    h: cellW - 4,
    r: 8,
  };
}

function calendarContentH(rows) {
  var cellW = innerW() / CAL_COLS;
  return calendarGridTop() + rows * (cellW + 6) + 20;
}

/* ---------------- 图鉴 ---------------- */

var COL_GAP = 10;

function collectionCardRect(i) {
  var w = (innerW() - COL_GAP) / 2;
  var row = Math.floor(i / 2);
  var col = i % 2;
  return {
    x: PAD + col * (w + COL_GAP),
    y: 56 + row * (w * 1.5 + COL_GAP),
    w: w,
    h: w * 1.5,
    r: 14,
  };
}

function collectionContentH(count) {
  var w = (innerW() - COL_GAP) / 2;
  var rows = Math.ceil(count / 2);
  return 56 + rows * (w * 1.5 + COL_GAP) + 20;
}

/* ---------------- 详情弹层 ---------------- */

function sheetRect(vp) {
  var h = 300;
  return { x: 0, y: vp.height - h - vp.safeBottom - 20, w: W, h: h };
}

/* ---------------- 命中 ---------------- */

function hit(rect, x, y) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

/** 右上角的「换背景」小按钮,和标题同一基线 */
function bgButtonRect(vp) {
  var w = 84;
  var h = 28;
  return { x: W - PAD - w, y: vp.safeTop + 40 - h + 3, w: w, h: h, r: h / 2 };
}

module.exports = {
  W: W,
  PAD: PAD,
  CARDPAD: CARDPAD,
  FACE_H: FACE_H,
  TASK_H: TASK_H,
  TASK_GAP: TASK_GAP,
  NOTE_H: NOTE_H,
  headerTop: headerTop,
  tabbarH: tabbarH,
  contentTop: contentTop,
  contentBottom: contentBottom,
  contentH: contentH,
  innerW: innerW,
  weekdayZh: weekdayZh,
  monthDay: monthDay,
  normalizeDraw: normalizeDraw,
  cardW: cardW,
  todayCardRect: todayCardRect,
  todayTaskRect: todayTaskRect,
  todayIntroRect: todayIntroRect,
  todayScratchRect: todayScratchRect,
  todayScratchContentH: todayScratchContentH,
  todayNoteRect: todayNoteRect,
  todayFootRect: todayFootRect,
  todayContentH: todayContentH,
  REDRAW_H: REDRAW_H,
  redrawButtonRect: redrawButtonRect,
  todayContentHWithRedraw: todayContentHWithRedraw,
  idlePackRect: idlePackRect,
  idleButtonRect: idleButtonRect,
  idleContentH: idleContentH,
  offerCardRect: offerCardRect,
  offerIntroRect: offerIntroRect,
  offerButtonRect: offerButtonRect,
  offerContentH: offerContentH,
  PICK_GAP: PICK_GAP,
  pickTop: pickTop,
  pickCardRect: pickCardRect,
  pickButtonRect: pickButtonRect,
  pickIntroRect: pickIntroRect,
  pickContentH: pickContentH,
  pickIndex: pickIndex,
  CAL_COLS: CAL_COLS,
  calendarGridTop: calendarGridTop,
  calendarCellRect: calendarCellRect,
  calendarContentH: calendarContentH,
  collectionCardRect: collectionCardRect,
  collectionContentH: collectionContentH,
  sheetRect: sheetRect,
  bgButtonRect: bgButtonRect,
  hit: hit,
};