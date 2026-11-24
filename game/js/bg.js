/**
 * 背景模式：自动（跟时间）或手动钉住某一套。
 *
 * 点一下按钮按 自动 → 晨雾 → 晴空 → 深空 → 自动 循环，
 * 选择存本地（wx.setStorageSync），下次进来还是这个模式。
 *
 * 自动模式下时段由 dayphase 决定；手动模式下不看钟。
 */

var dayphase = require("./dayphase.js");
var theme = require("./theme.js");
var env = require("./env.js");

var KEY = "roles_bg_mode";

/** 循环顺序就是这个数组的顺序 */
var MODES = ["auto", dayphase.MORNING, dayphase.MIDDAY, dayphase.NIGHT];

var LABELS = {};
LABELS.auto = "自动";
LABELS[dayphase.MORNING] = "晨雾";
LABELS[dayphase.MIDDAY] = "晴空";
LABELS[dayphase.NIGHT] = "深空";

/** 按钮上更短的写法：自动时后面缀一个时段单字，省得按钮太宽 */
var SHORT = {};
SHORT[dayphase.MORNING] = "晨";
SHORT[dayphase.MIDDAY] = "午";
SHORT[dayphase.NIGHT] = "夜";

var mode = null; // 懒加载：第一次用时才读存储

function readStored() {
  var w = env.getWx();
  if (!w || typeof w.getStorageSync !== "function") return "";
  try {
    return String(w.getStorageSync(KEY) || "");
  } catch (e) {
    return "";
  }
}

function writeStored(m) {
  var w = env.getWx();
  if (!w || typeof w.setStorageSync !== "function") return;
  try {
    w.setStorageSync(KEY, m);
  } catch (e) {
    /* 存不进去就只影响下次启动，不影响本次 */
  }
}

function load() {
  var saved = readStored();
  mode = MODES.indexOf(saved) >= 0 ? saved : "auto";
  return mode;
}

function current() {
  if (!mode) load();
  return mode;
}

/** 现在该画哪套：自动就看钟，手动就用选的那套 */
function resolve() {
  var m = current();
  return m === "auto" ? dayphase.phase() : m;
}

/** 把主题切到当前模式对应的配色 */
function apply() {
  theme.apply(resolve());
  return theme.phase;
}

/** 点一下：往后挪一格并记住 */
function cycle() {
  var i = MODES.indexOf(current());
  mode = MODES[(i + 1) % MODES.length];
  writeStored(mode);
  apply();
  return mode;
}

/** 按钮上的字：自动时顺带显示当前时段（自动 · 夜），手动时就是那套的名字 */
function label() {
  var m = current();
  if (m === "auto") return "自动 · " + (SHORT[resolve()] || "");
  return LABELS[m] || "自动";
}

/** 测试用：直接指定模式 */
function setMode(m) {
  mode = MODES.indexOf(m) >= 0 ? m : "auto";
  writeStored(mode);
  apply();
  return mode;
}

module.exports = {
  MODES: MODES,
  LABELS: LABELS,
  current: current,
  resolve: resolve,
  apply: apply,
  cycle: cycle,
  label: label,
  setMode: setMode,
};
