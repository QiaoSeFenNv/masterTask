/**
 * 整页氛围底：把生成的那三张背景图淡铺满整个画布。
 *
 * 之前（packview.seriesAura）只在卡包后面垫了一块矩形，
 * 于是画面上下割裂、图片只占上半屏、下面全是硬边。
 *
 * 现在改成：
 * - 铺满整屏，四边不留缝；
 * - 极低 alpha（按「时段 × 是否过场」查表），图只当一层胶片颗粒，不改变主题色相；
 * - 过场里钉住玩家挑中的那个系列（pin），出了过场再放开（unpin），回到按时段走。
 *
 * 生成图都是正方形，cover 到竖屏会把主体挤到一边，
 * 所以这里用 stretch 铺满。图本身的暗角已经烘进像素里，
 * 拉伸后四边正好落回底色里；alpha 又低，看不出变形。
 */

var draw = require("./draw.js");
var assets = require("./assets.js");
var theme = require("./theme.js");
var dayphase = require("./dayphase.js");
var animation = require("./animation.js");

/** 时段 -> 用哪张背景图。三张各用一次，色调上也说得通 */
var MAP = {};
MAP[dayphase.NIGHT] = "deep"; // 深夜压一层近乎黑的深青
MAP[dayphase.MORNING] = "dusk"; // 晨雾里透出一点紫灰
MAP[dayphase.MIDDAY] = "dawn"; // 晴空上浮一层暖金

/**
 * 各时段平时铺多浓。
 * 夜里底色本来就是深的，可以重一些；
 * 白天底色是冷调亮色、图偏暖，alpha 一高整页就发黄，只能压到像一层颗粒。
 */
var ALPHA = {};
ALPHA[dayphase.NIGHT] = 0.55;
ALPHA[dayphase.MORNING] = 0.14;
ALPHA[dayphase.MIDDAY] = 0.045;

/** 开卡包过场里由玩家挑的系列主导，但同样受时段限制，不能盖到正文读不清 */
var PINNED_ALPHA = {};
PINNED_ALPHA[dayphase.NIGHT] = 0.5;
PINNED_ALPHA[dayphase.MORNING] = 0.22;
PINNED_ALPHA[dayphase.MIDDAY] = 0.12;

var FADE_MS = 900;

var pinned = ""; // 过场里钉住的系列，空 = 按时段
var lastKey = "";
var fadeAt = 0;

function seriesFor() {
  if (pinned) return pinned;
  var p = theme.phase || dayphase.phase();
  return MAP[p] || "deep";
}

function baseAlpha() {
  var p = theme.phase || dayphase.phase();
  if (pinned) {
    var pa = PINNED_ALPHA[p];
    return pa == null ? 0.25 : pa;
  }
  var a = ALPHA[p];
  return a == null ? 0.06 : a;
}

/** 换系列时做一次短淡入，免得整页色温突兀地一跳 */
function fadeFactor() {
  if (!fadeAt) return 1;
  var t = animation.progress(fadeAt, FADE_MS);
  if (t >= 1) {
    fadeAt = 0;
    return 1;
  }
  return animation.tween(0, 1, fadeAt, FADE_MS, "inOutCubic");
}

/**
 * 铺满整屏。拿不到图（Node 测试、图还没加载完）就什么都不画，返回 false。
 */
function paint(vp) {
  var series = seriesFor();
  var img = assets.bg(series);
  if (!img) return false;

  if (series !== lastKey) {
    if (lastKey) fadeAt = animation.now();
    lastKey = series;
  }

  var a = baseAlpha() * fadeFactor();
  if (a <= 0) return false;

  var w = vp.width || draw.unit(375);
  return draw.image(img, 0, 0, w, vp.height, 0, a, "stretch");
}

/** 过场里钉住某个系列的外景 */
function pin(seriesId) {
  pinned = seriesId || "";
}

/** 放开，回到按时段自动选 */
function unpin() {
  pinned = "";
}

module.exports = {
  paint: paint,
  pin: pin,
  unpin: unpin,
  isFading: function () { return Boolean(fadeAt) && animation.progress(fadeAt, FADE_MS) < 1; },
};
