/**
 * 状态与动作。这里不碰画布,只维护数据并调用 api。
 * 渲染层通过 subscribe 收到「脏了」的通知再重绘。
 */

var api = require("./api.js");
var layout = require("./layout.js");
var pack = require("./pack.js");
var sfx = require("./sfx.js");
var animation = require("./animation.js");

var state = {
  tab: "today", // today | calendar | collection
  status: "loading", // loading | ready | error；未落定时看 state.offer 判断显示哪一屏
  error: "",
  date: "",
  draw: null, // normalized by layout.normalizeDraw，落定后才有
  offer: [], // [{id,name,emoji,tagline,intro,gradient,accent}] 今天摊开的 10 张，只能看外观
  picked: [], // 已点开的 roleId，最多 3 个
  pickedAt: {}, // roleId -> 翻面起始时间，只给翻面动画用
  ringSpin: 0, // 环的当前角度，由玩家左右拖动决定（毫弧度累加）
  slot: "", // 从这 3 张里选中的那张，落定用
  shifting: false, // 落定进行中
  canRedraw: false, // 服务端是否允许重新抽卡（测试环境才有）
  anim: { kind: "", at: 0, series: "" }, // 过场：pack(选卡包) | tear(撕开) | ring(环形) | top(飞上方) | pick(选一张) | reveal(揭晓)
  stats: { streak: 0, totalDays: 0, totalTasks: 0, doneTasks: 0, completionRate: 0, collected: [] },
  shuffling: false,
  noteDraft: "",
  noteEditing: false,
  toast: "",
  toastAt: 0,
  calendar: { year: 0, month: 0, cells: [], streak: 0, loading: true, error: "" },
  collection: { cards: [], loading: true, error: "" },
  selected: null,
  scroll: 0,
  scrollMax: 0,
};

var listeners = [];

function subscribe(fn) {
  listeners.push(fn);
  return function () {
    listeners = listeners.filter(function (f) {
      return f !== fn;
    });
  };
}

function emit() {
  for (var i = 0; i < listeners.length; i++) listeners[i](state);
}

function msgOf(err) {
  return (err && err.message) || "网络异常,稍后再试";
}

function toast(text) {
  state.toast = text;
  state.toastAt = animation.now();
  emit();
}

function resetToast() {
  state.toast = "";
  emit();
}

/* ---------------- 今日 ---------------- */

function loadToday() {
  state.status = "loading";
  state.error = "";
  emit();
  return api
    .get("/api/draw/today")
    .then(function (res) {
      state.date = res.date;
      state.draw = layout.normalizeDraw(res.drawn ? res.draw : null);
      state.offer = state.draw ? [] : res.offer || [];
      state.canRedraw = Boolean(res.canRedraw);
      state.picked = [];
      state.pickedAt = {};
      state.ringSpin = 0;
      state.slot = "";
      state.anim = { kind: state.draw ? "" : "pack", at: animation.now() };
      state.noteDraft = state.draw ? state.draw.noteDraft : "";
      state.status = "ready";
      emit();
      return loadStats();
    })
    .catch(function (err) {
      state.status = "error";
      state.error = msgOf(err);
      emit();
    });
}

function loadStats() {
  return api
    .get("/api/stats")
    .then(function (s) {
      state.stats = s;
      emit();
    })
    .catch(function () {
      /* 统计失败不阻塞主流程 */
    });
}

/* ---------------- 开卡包流程 ---------------- */

function findOffer(roleId) {
  for (var i = 0; i < state.offer.length; i++) {
    if (state.offer[i].id === roleId) return state.offer[i];
  }
  return null;
}

/** 选一个系列的卡包，先放大移动，再等待玩家撕开 */
function chooseSeries(seriesId) {
  if (state.anim.kind !== "pack") return;
  var s = pack.seriesOf(seriesId);
  state.anim = { kind: "opening", at: animation.now(), series: s.id };
  emit();
}

/** Move the selected packet into place before accepting tear gestures. */
function enterTear() {
  var a = state.anim;
  if (!a || a.kind !== "opening") return;
  state.anim = {kind:"tear",at:a.at+pack.OPEN_MS,series:a.series,p:0,doneAt:0,recoilAt:0,tilt:0,tiltAt:0};
  emit();
}

/**
 * 沿包口横向划：撕口位置严格跟着手指走。
 * dx 是这一小段横向位移（设计稿单位），累计到整条包口宽就算撕通。
 */
function swipeTear(dx) {
  var a = state.anim;
  if (!a || a.kind !== "tear" || a.doneAt) return;
  a.recoilAt = 0; // 手又动了，取消回弹
  a.p = pack.clamp01((a.p || 0) + dx / pack.TEAR_SWIPE);
  if (a.p >= 1) {
    a.p = 1;
    a.doneAt = animation.now(); // 撕通了，那一条开始飘走
    returnTearTilt(a);
    sfx.play("tear");
  }
  emit();
}

/** 整包倾斜独立于撕口进度；手势只改变角度，不改变撕开的距离。 */
function tiltTear(degrees) {
  var a = state.anim;
  if (!a || a.kind !== "tear" || a.doneAt) return;
  a.tiltAt = 0;
  a.tilt = Math.max(-8, Math.min(8, degrees));
  emit();
}

function returnTearTilt(a) {
  if (!a.tilt) return;
  a.tiltFrom = a.tilt;
  a.tiltAt = animation.now() || 1;
}

/**
 * 松手：纸弹回去一点，但不会全退 —— 撕到哪儿算哪儿，
 * 玩家不用从头再划一遍。
 */
function releaseTear() {
  var a = state.anim;
  if (!a || a.kind !== "tear" || a.doneAt) return;
  var p = a.p || 0;
  a.recoilFrom = p;
  a.recoilTo = Math.max(0, p - 0.25);
  a.recoilAt = animation.now() || 1;
  returnTearTilt(a);
  emit();
}

/** 回弹缓动，由 app 每帧推一次；真的在动就返回 true（要连续出帧） */
function tickTear(tms) {
  var a = state.anim;
  if (!a || a.kind !== "tear") return false;
  var moving = false;
  if (a.recoilAt) {
    var t = animation.progress(a.recoilAt, 260, tms);
    a.p = animation.tween(a.recoilFrom, a.recoilTo, a.recoilAt, 260, "outCubic", tms);
    if (t >= 1) a.recoilAt = 0;
    moving = true;
  }
  if (a.tiltAt) {
    a.tilt = animation.tween(a.tiltFrom, 0, a.tiltAt, 260, "outCubic", tms);
    if (animation.progress(a.tiltAt, 260, tms) >= 1) a.tiltAt = 0;
    moving = true;
  }
  return moving;
}

/** 撕开动画飘完之后进环形；由 app 在帧里推进时调用 */
function enterRing() {
  if (state.anim.kind !== "tear") return;
  if (!state.anim.doneAt) return; // 还没撕通，不许进去
  state.anim = { kind: "ring", at: animation.now(), series: state.anim.series };
  state.ringSpin = 0;
  emit();
}

/**
 * 玩家左右拖动环：按手指横向位移转角，并做缓存和边界夹取。
 * 整个环是一个「盘」，转一圈没关系，这里不取模 —— 大角度留着更顺，
 * 只在数值太大时回卷，免得浮点精度越来越差。
 */
function rotateRing(dx) {
  if (state.anim.kind !== "ring") return;
  var next = (state.ringSpin || 0) + dx * 0.012;
  // 回到 [-2π, 2π]：等价角度，手感连续
  var TAU = Math.PI * 2;
  if (next > TAU || next < -TAU) next = next % TAU;
  state.ringSpin = next;
}

/** 环里点一张：没满 3 张就加进去，满了不再接受 */
function flipCard(roleId) {
  if (state.anim.kind !== "ring") return;
  if (!findOffer(roleId)) return;
  if (state.picked.indexOf(roleId) >= 0) return;
  if (state.picked.length >= 3) {
    toast("三张就够了");
    return;
  }
  state.picked.push(roleId);
  state.pickedAt[roleId] = animation.now();
  sfx.play("flip");
  emit();
  if (state.picked.length === 3) {
    // 点满三张：等最后一张翻完，再飞到上方成候选排
    state.anim = { kind: "top", at: animation.now() + pack.FLIP_MS, series: state.anim.series };
    emit();
  }
}

/** 三张就位后，从里面选一张 */
function selectSlot(roleId) {
  if (state.shifting) return;
  if (state.anim.kind !== "pick" && state.anim.kind !== "top") return;
  if (state.picked.indexOf(roleId) < 0) return;
  state.slot = roleId;
  emit();
}

/** 三张飞到位了：进入可选阶段 */
function enterPick() {
  if (state.anim.kind !== "top") return;
  state.anim = { kind: "pick", at: animation.now(), series: state.anim.series };
  emit();
}

/** 落定:选完即定死,之后当天不可再改 */
function confirmPick() {
  if (state.shifting || state.draw) return Promise.resolve();
  // 必须从这三张里明确点一张，不替用户拿主意
  if (!state.slot || state.picked.indexOf(state.slot) < 0) {
    toast("先选一张");
    return Promise.resolve();
  }
  var target = state.slot;
  var slotIndex = state.picked.indexOf(target);
  var series = state.anim.series;
  state.shifting = true;
  emit();
  return api
    .post("/api/draw", { roleId: target })
    .then(function (d) {
      state.date = d.date;
      state.draw = layout.normalizeDraw(d);
      state.offer = [];
      state.picked = [];
      state.pickedAt = {};
      state.ringSpin = 0;
      state.slot = "";
      state.anim = { kind: "reveal", at: animation.now(), series: series, slotIndex: slotIndex };
      state.scroll = 0;
      state.noteDraft = state.draw.noteDraft;
      state.shifting = false;
      sfx.play("settle");
      emit();
      return loadStats();
    })
    .catch(function (err) {
      state.shifting = false;
      emit();
      toast(msgOf(err));
      throw err;
    });
}

/** 保留旧名:老调用点直接拨到「落定」 */
function drawToday() {
  return confirmPick();
}

/**
 * 重新抽卡（测试专用）：作废今天已落定的卡，重新开一包。
 * 服务端只在开发环境放开；这里额外做一层本地自检，省一次无谓的请求。
 */
function redrawToday() {
  if (!state.canRedraw) {
    toast("重新抽卡只在测试环境开放");
    return Promise.resolve(false);
  }
  if (state.shifting) return Promise.resolve(false);
  state.shifting = true;
  emit();
  return api
    .post("/api/draw/redraw", {})
    .then(function () {
      state.shifting = false;
      // 服务端已经作废今天的卡；回到空态再拉一次，就会重新发一包牌
      state.draw = null;
      state.offer = [];
      state.picked = [];
      state.pickedAt = {};
      state.ringSpin = 0;
      state.slot = "";
      state.anim = { kind: "pack", at: animation.now(), series: "" };
      emit();
      return loadToday().then(function () {
        toast("换了一包新的");
        return true;
      });
    })
    .catch(function (err) {
      state.shifting = false;
      emit();
      toast(msgOf(err));
      throw err;
    });
}

/** 揭晓只影响展示，角色在接口成功时已经落定。 */
function finishReveal() {
  if (state.anim.kind !== "reveal") return;
  state.anim = { kind: "", at: 0, series: "" };
  emit();
}

/** 现在流程在哪一步；已落定且揭晓结束则为空 */
function stage() {
  if (state.draw && state.anim.kind === "reveal") return "reveal";
  if (state.draw) return "";
  return state.anim.kind || "pack";
}

/** 三张候选（按点开的顺序） */
function pickedRoles() {
  var out = [];
  for (var i = 0; i < state.picked.length; i++) {
    var r = findOffer(state.picked[i]);
    if (r) out.push(r);
  }
  return out;
}

function toggleTask(taskId) {
  if (!state.draw) return;
  var t = null;
  for (var i = 0; i < state.draw.tasks.length; i++) {
    if (state.draw.tasks[i].id === taskId) t = state.draw.tasks[i];
  }
  if (!t) return;

  var was = t.done;
  t.done = !was;
  state.draw.doneCount = state.draw.tasks.filter(function (x) {
    return x.done;
  }).length;
  emit();

  api
    .patch("/api/checkin", {
      date: state.draw.date,
      taskId: t.id,
      done: t.done,
      note: t.note || "",
    })
    .then(function () {
      if (t.done && state.draw.doneCount === state.draw.tasks.length) {
        toast("今日任务全部完成");
      }
    })
    .catch(function (err) {
      t.done = was;
      state.draw.doneCount = state.draw.tasks.filter(function (x) {
        return x.done;
      }).length;
      emit();
      toast(msgOf(err));
    });
}

function setNoteDraft(text) {
  state.noteDraft = String(text || "").slice(0, 200);
  emit();
}

function saveNote() {
  if (!state.draw) return Promise.resolve();
  var tasks = state.draw.tasks;
  var target = null;
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].done) {
      target = tasks[i];
      break;
    }
  }
  if (!target) target = tasks[0];
  if (!target) return Promise.resolve();

  var text = state.noteDraft.trim();
  return api
    .patch("/api/checkin", {
      date: state.draw.date,
      taskId: target.id,
      done: target.done,
      note: text,
    })
    .then(function () {
      target.note = text;
      state.noteEditing = false;
      emit();
      toast("已保存");
    })
    .catch(function (err) {
      toast(msgOf(err));
    });
}

/* ---------------- 日历 ---------------- */

function loadCalendar(year, month) {
  var first = new Date(year, month - 1, 1);
  var last = new Date(year, month, 0);
  function d2(n) {
    return n < 10 ? "0" + n : String(n);
  }
  var from = first.getFullYear() + "-" + d2(first.getMonth() + 1) + "-01";
  var to = last.getFullYear() + "-" + d2(last.getMonth() + 1) + "-" + d2(last.getDate());

  state.calendar.loading = true;
  state.calendar.error = "";
  emit();

  return api
    .get("/api/calendar?from=" + from + "&to=" + to)
    .then(function (res) {
      state.calendar = {
        year: year,
        month: month,
        cells: buildCells(year, month, res.entries || [], res.today),
        streak: res.streak || 0,
        loading: false,
        error: "",
      };
      emit();
    })
    .catch(function (err) {
      state.calendar.loading = false;
      state.calendar.error = msgOf(err);
      emit();
    });
}

/** 6 行 x 7 列;首格为周一,空白补 null */
function buildCells(year, month, entries, today) {
  var byDate = {};
  entries.forEach(function (e) {
    byDate[e.date] = e;
  });
  var daysInMonth = new Date(year, month, 0).getDate();
  var firstWeekday = new Date(year, month - 1, 1).getDay(); // 0=周日
  var lead = (firstWeekday + 6) % 7; // 周一为一周起点

  var cells = [];
  for (var i = 0; i < lead; i++) cells.push({ type: "blank" });
  for (var d = 1; d <= daysInMonth; d++) {
    var mm = month < 10 ? "0" + month : String(month);
    var dd = d < 10 ? "0" + d : String(d);
    var date = year + "-" + mm + "-" + dd;
    cells.push({
      type: "day",
      day: d,
      date: date,
      entry: byDate[date] || null,
      isToday: date === today,
      future: today ? date > today : false,
    });
  }
  while (cells.length % 7 !== 0) cells.push({ type: "blank" });
  return cells;
}

/* ---------------- 图鉴 ---------------- */

function loadCollection() {
  state.collection.loading = true;
  state.collection.error = "";
  emit();

  var roles = require("../data/roles.js");
  var owned = {};
  (state.stats.collected || []).forEach(function (c) {
    owned[c.roleId] = c.times;
  });

  return api
    .get("/api/stats")
    .then(function (s) {
      state.stats = s;
      var map = {};
      (s.collected || []).forEach(function (c) {
        map[c.roleId] = c.times;
      });
      state.collection = {
        loading: false,
        error: "",
        cards: roles.roles.map(function (r) {
          return {
            id: r.id,
            name: r.name,
            emoji: r.emoji,
            tagline: r.tagline,
            intro: r.intro,
            gradient: r.gradient,
            accent: r.accent,
            taskCount: r.tasks.length,
            times: map[r.id] || 0,
            owned: Boolean(map[r.id]),
          };
        }),
      };
      emit();
    })
    .catch(function (err) {
      state.collection.loading = false;
      state.collection.error = msgOf(err);
      emit();
    });
}

/* ---------------- 通用 ---------------- */

function setTab(tab) {
  if (state.tab === tab) return;
  state.tab = tab;
  state.selected = null;
  state.scroll = 0;
  emit();
  if (tab === "calendar" && state.calendar.year === 0) {
    var now = new Date();
    loadCalendar(now.getFullYear(), now.getMonth() + 1);
  }
  if (tab === "collection" && state.collection.cards.length === 0) {
    loadCollection();
  }
}

function selectCard(card) {
  state.selected = card;
  emit();
}

function closeSelected() {
  state.selected = null;
  emit();
}

module.exports = {
  state: state,
  subscribe: subscribe,
  emit: emit,
  toast: toast,
  resetToast: resetToast,
  loadToday: loadToday,
  loadStats: loadStats,
  drawToday: drawToday,
  redrawToday: redrawToday,
  chooseSeries: chooseSeries,
  enterTear: enterTear,
  swipeTear: swipeTear,
  tiltTear: tiltTear,
  releaseTear: releaseTear,
  tickTear: tickTear,
  enterRing: enterRing,
  rotateRing: rotateRing,
  flipCard: flipCard,
  selectSlot: selectSlot,
  stage: stage,
  enterPick: enterPick,
  finishReveal: finishReveal,
  pickedRoles: pickedRoles,
  confirmPick: confirmPick,
  toggleTask: toggleTask,
  setNoteDraft: setNoteDraft,
  saveNote: saveNote,
  loadCalendar: loadCalendar,
  loadCollection: loadCollection,
  setTab: setTab,
  selectCard: selectCard,
  closeSelected: closeSelected,
  buildCells: buildCells,
};