/**
 * 主题色。三个时段三套配色，星空的底色令牌也从这里取。
 *
 * 用法：别的模块 require 一次，拿到的是同一个对象；
 * 时段变了调用 theme.apply(phase)，所有 theme.xxx 立刻读到新值，
 * 不用重新 require，也不用把 theme 传得到处都是。
 */

var dayphase = require("./dayphase.js");

/** 夜晚：静谧深空（原方案） */
var NIGHT = {
  name: "静谧深空",
  bg: "#070b16",
  bgTop: "#070b16",
  bgMid: "#091020",
  bgBottom: "#0b1220",
  bgSoft: "#0e1526",

  text: "#eef2fb",
  body: "#b3bdd4",
  bodyBright: "#dce3f3",
  muted: "#8590a8",
  faint: "#5d6880",

  gold: "#e8dcc8",
  goldDeep: "#cbb89a",
  purple: "#a9b6d6",
  onGold: "#1a1420",

  line: "rgba(200,218,255,0.08)",
  frame: "rgba(226,232,255,0.16)",
  softFill: "rgba(160,190,255,0.05)",
  softBorder: "rgba(170,200,255,0.09)",
  checkOff: "rgba(190,210,255,0.30)",

  taskText: "#e6dfd5",
  noteText: "#dde5f6",
  tagFill: "rgba(169,156,192,0.14)",
  editFill: "rgba(198,216,255,0.10)",
  navFill: "rgba(255,255,255,0.06)",
  lockedFill: "rgba(255,255,255,0.025)",
  lockedQ: "rgba(255,255,255,0.14)",
  futureFill: "rgba(255,255,255,0.02)",

  tabbarFill: "rgba(6,10,20,0.88)",
  sheetFill: "#17121f",
  toastFill: "#241d2e",
  toastText: "#f2f5fd",
  scrim: "#000000",

  packTop: "#1b2440",
  packMid: "#111a2c",
  packBottom: "#080d18",

  idleInner: "rgba(232,220,200,0.20)",
  idleQ: "rgba(232,220,200,0.55)",
  idleRule: "rgba(232,220,200,0.3)",
  idleBtn: "rgba(232,220,200,0.10)",
  closeFill: "rgba(232,220,200,0.12)",
  glowFill: "rgba(232,220,200,0.14)",
  glowEdge: "rgba(232,220,200,0.04)",
};

/** 早上：晨雾（米白 → 淡暖粉 → 浅蓝） */
var MORNING = {
  name: "晨雾",
  bg: "#fdf8f2",
  bgTop: "#fdf9f4",
  bgMid: "#fbeee6",
  bgBottom: "#eef4fb",
  bgSoft: "#f7f1ea",

  text: "#2c2740",
  body: "#5b5470",
  bodyBright: "#413a56",
  muted: "#6f6683",
  faint: "#82798f",

  gold: "#a97b46",
  goldDeep: "#8a6134",
  purple: "#7b6a96",
  onGold: "#fffdf8",

  line: "rgba(96,76,120,0.12)",
  frame: "rgba(96,76,120,0.20)",
  softFill: "rgba(255,255,255,0.58)",
  softBorder: "rgba(140,118,160,0.18)",
  checkOff: "rgba(120,100,150,0.38)",

  taskText: "#3b3450",
  noteText: "#4a4260",
  tagFill: "rgba(140,110,160,0.12)",
  editFill: "rgba(255,255,255,0.70)",
  navFill: "rgba(255,255,255,0.62)",
  lockedFill: "rgba(120,100,150,0.06)",
  lockedQ: "rgba(120,100,150,0.28)",
  futureFill: "rgba(120,100,150,0.035)",

  tabbarFill: "rgba(253,247,241,0.92)",
  sheetFill: "#fffaf4",
  toastFill: "#3b3450",
  toastText: "#fffaf2",
  scrim: "#2c2740",

  packTop: "#f6ddd0",
  packMid: "#fdf1e9",
  packBottom: "#eaf1fa",

  idleInner: "rgba(169,123,70,0.22)",
  idleQ: "rgba(169,123,70,0.45)",
  idleRule: "rgba(169,123,70,0.28)",
  idleBtn: "rgba(169,123,70,0.10)",
  closeFill: "rgba(169,123,70,0.14)",
  glowFill: "rgba(169,123,70,0.16)",
  glowEdge: "rgba(169,123,70,0.05)",
};

/** 中午：晴空（清透天蓝 → 暖白） */
var MIDDAY = {
  name: "晴空",
  bg: "#f4faff",
  bgTop: "#eaf5ff",
  bgMid: "#f3faff",
  bgBottom: "#fffdf6",
  bgSoft: "#f7fbff",

  text: "#1e2a3c",
  body: "#41536c",
  bodyBright: "#2d3d54",
  muted: "#5f6d81",
  faint: "#77879a",

  gold: "#b07d3c",
  goldDeep: "#8d622c",
  purple: "#5f7595",
  onGold: "#fffdf8",

  line: "rgba(60,90,130,0.12)",
  frame: "rgba(60,90,130,0.20)",
  softFill: "rgba(255,255,255,0.62)",
  softBorder: "rgba(90,130,180,0.18)",
  checkOff: "rgba(70,105,150,0.38)",

  taskText: "#27354a",
  noteText: "#33445c",
  tagFill: "rgba(90,130,180,0.12)",
  editFill: "rgba(255,255,255,0.72)",
  navFill: "rgba(255,255,255,0.66)",
  lockedFill: "rgba(70,105,150,0.06)",
  lockedQ: "rgba(70,105,150,0.26)",
  futureFill: "rgba(70,105,150,0.035)",

  tabbarFill: "rgba(244,250,255,0.92)",
  sheetFill: "#ffffff",
  toastFill: "#1e2a3c",
  toastText: "#f4faff",
  scrim: "#12203a",

  packTop: "#cfe3f7",
  packMid: "#eaf5ff",
  packBottom: "#fdf8ec",

  idleInner: "rgba(176,125,60,0.22)",
  idleQ: "rgba(176,125,60,0.45)",
  idleRule: "rgba(176,125,60,0.28)",
  idleBtn: "rgba(176,125,60,0.10)",
  closeFill: "rgba(176,125,60,0.14)",
  glowFill: "rgba(176,125,60,0.16)",
  glowEdge: "rgba(176,125,60,0.05)",
};

var PALETTES = {};
PALETTES[dayphase.NIGHT] = NIGHT;
PALETTES[dayphase.MORNING] = MORNING;
PALETTES[dayphase.MIDDAY] = MIDDAY;

/** 对外暴露的就是这个对象，apply() 原地改键，所有引用自动跟着变 */
var theme = { phase: dayphase.NIGHT };

function apply(phase) {
  var p = PALETTES[phase] || NIGHT;
  var keys = Object.keys(p);
  for (var i = 0; i < keys.length; i++) {
    theme[keys[i]] = p[keys[i]];
  }
  theme.phase = PALETTES[phase] ? phase : dayphase.NIGHT;
  return theme;
}

/* 启动时先按当前时段铺一遍，避免第一帧闪成夜里。
   bg.js 会在 boot 时按用户存的模式再覆盖一次。 */
apply(dayphase.phase());

module.exports = theme;
module.exports.apply = apply;
module.exports.PALETTES = PALETTES;
