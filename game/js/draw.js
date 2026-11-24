/**
 * 极简 2D 画布封装。
 * 小游戏里拿到的是 wx.createCanvas();Node 里需要一个 canvas 实现(见 test 用的 mock)。
 * 这里做三件事:设计稿坐标缩放、文字排版、圆角矩形。
 */

var env = require("./env.js");

var ctx = null;
var canvas = null;

function init(c) {
  canvas = c;
  ctx = canvas.getContext("2d");
  return ctx;
}

function getCtx() {
  if (!ctx) throw new Error("canvas not initialized");
  return ctx;
}

function getCanvas() {
  return canvas;
}

/** Design units -> device pixels. */
function unit(n) {
  var s = env.scale();
  return n * s;
}

function clear() {
  var c = getCtx();
  if (!canvas) return;
  // 每帧把坐标系重置成「设计稿单位」:1 个单位 = canvas.width / 375 设备像素
  var s = canvas.width / env.DESIGN_WIDTH;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, canvas.width, canvas.height);
  // 底色交给背景层(starfield)铺满;这里只清屏,避免多刷一遍大面积渐变的开销
  c.setTransform(s, 0, 0, s, 0, 0);
}

/* ---------- basic shapes ---------- */

function roundRect(x, y, w, h, r) {
  var c = getCtx();
  var k = Math.min(r || 0, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + k, y);
  c.lineTo(x + w - k, y);
  c.quadraticCurveTo(x + w, y, x + w, y + k);
  c.lineTo(x + w, y + h - k);
  c.quadraticCurveTo(x + w, y + h, x + w - k, y + h);
  c.lineTo(x + k, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - k);
  c.lineTo(x, y + k);
  c.quadraticCurveTo(x, y, x + k, y);
  c.closePath();
}

function linearGradient(x, y, w, h, colors, angle) {
  var c = getCtx();
  var deg = angle == null ? 135 : angle;
  var rad = (deg * Math.PI) / 180;
  var cx = x + w / 2;
  var cy = y + h / 2;
  var len = (Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad))) / 2;
  var g = c.createLinearGradient(
    cx - Math.cos(rad) * len,
    cy - Math.sin(rad) * len,
    cx + Math.cos(rad) * len,
    cy + Math.sin(rad) * len
  );
  var stops = colors && colors.length ? colors : ["#2a2135", "#1a1522"];
  for (var i = 0; i < stops.length; i++) {
    var p = stops.length === 1 ? 0 : i / (stops.length - 1);
    g.addColorStop(p, stops[i]);
  }
  return g;
}

function fillRect(x, y, w, h, color) {
  var c = getCtx();
  c.fillStyle = color;
  c.fillRect(x, y, w, h);
}

function fillGradientRect(x, y, w, h, colors, angle, radius) {
  var c = getCtx();
  c.fillStyle = linearGradient(x, y, w, h, colors, angle);
  if (radius) {
    roundRect(x, y, w, h, radius);
    c.fill();
  } else {
    c.fillRect(x, y, w, h);
  }
}

function strokeRoundRect(x, y, w, h, r, color, lineWidth) {
  var c = getCtx();
  roundRect(x, y, w, h, r);
  c.strokeStyle = color;
  c.lineWidth = lineWidth || 1;
  c.stroke();
}

function clipRoundRect(x, y, w, h, r) {
  var c = getCtx();
  c.save();
  roundRect(x, y, w, h, r);
  c.clip();
}

/**
 * Clip drawing to an axis-aligned rect until restore() is called.
 */
function clipRect(x, y, w, h) {
  var c = getCtx();
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
}

function restore() {
  getCtx().restore();
}

/**
 * 把一张图片铺进给定矩形（可圆角、可半透明、可按 cover 裁切）。
 * 默认 cover：等比放大到刚好填满，居中裁掉多出来的边，永不变形。
 * img 拿不到或绘不出来就返回 false，调用方据此补一层渐变兜底。
 */
function image(img, x, y, w, h, radius, alpha, fit) {
  var c = getCtx();
  if (!img || !w || !h) return false;
  var iw = img.width || img.naturalWidth || 0;
  var ih = img.height || img.naturalHeight || 0;
  c.save();
  if (radius) {
    roundRect(x, y, w, h, radius);
    c.clip();
  }
  if (alpha != null) c.globalAlpha = alpha;
  try {
    if (fit !== "stretch" && iw > 0 && ih > 0) {
      var k = Math.max(w / iw, h / ih);
      var sw = w / k;
      var sh = h / k;
      c.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
    } else {
      c.drawImage(img, x, y, w, h);
    }
  } catch (e) {
    c.restore();
    return false;
  }
  c.restore();
  return true;
}

function circle(cx, cy, r, fillStyle, strokeStyle, lineWidth) {
  var c = getCtx();
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  if (fillStyle) {
    c.fillStyle = fillStyle;
    c.fill();
  }
  if (strokeStyle) {
    c.strokeStyle = strokeStyle;
    c.lineWidth = lineWidth || 1;
    c.stroke();
  }
}

/* ---------- text ---------- */

function font(size, weight, serif) {
  var w = weight || "400";
  var family = serif
    ? '"Songti SC", "STSong", "Noto Serif CJK SC", serif'
    : '-apple-system, "PingFang SC", "Helvetica Neue", sans-serif';
  return w + " " + size + "px " + family;
}

function text(str, x, y, opts) {
  var c = getCtx();
  var o = opts || {};
  c.save();
  c.font = font(o.size || 14, o.weight, o.serif);
  c.fillStyle = o.color || "#efe9df";
  c.textAlign = o.align || "left";
  c.textBaseline = o.baseline || "alphabetic";
  if (o.alpha != null) c.globalAlpha = o.alpha;
  if (o.shadow) {
    c.shadowColor = o.shadow.color || "rgba(0,0,0,0.35)";
    c.shadowBlur = o.shadow.blur || 0;
    c.shadowOffsetY = o.shadow.y || 0;
  }
  c.fillText(String(str), x, y);
  c.restore();
}

function measure(str, size, weight, serif) {
  var c = getCtx();
  c.save();
  c.font = font(size, weight, serif);
  var w = c.measureText(String(str)).width;
  c.restore();
  return w;
}

/**
 * Wrap text; returns number of lines. Lines beyond maxLines end with an ellipsis.
 */
function wrapText(str, x, y, maxWidth, lineHeight, opts) {
  var c = getCtx();
  var o = opts || {};
  var maxLines = o.maxLines || 99;
  c.save();
  c.font = font(o.size || 14, o.weight, o.serif);
  c.fillStyle = o.color || "#e6dfd5";
  c.textAlign = "left";
  c.textBaseline = "alphabetic";
  if (o.alpha != null) c.globalAlpha = o.alpha;

  var chars = String(str).split("");
  var lines = [];
  var line = "";
  for (var i = 0; i < chars.length; i++) {
    var test = line + chars[i];
    if (c.measureText(test).width > maxWidth && line.length > 0) {
      lines.push(line);
      line = chars[i];
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    var last = lines[maxLines - 1];
    while (last.length && c.measureText(last + "…").width > maxWidth) {
      last = last.slice(0, -1);
    }
    lines[maxLines - 1] = last + "…";
  }

  for (var j = 0; j < lines.length; j++) {
    c.fillText(lines[j], x, y + j * lineHeight);
  }
  c.restore();
  return lines.length;
}

module.exports = {
  init: init,
  getCtx: getCtx,
  getCanvas: getCanvas,
  unit: unit,
  clear: clear,
  roundRect: roundRect,
  linearGradient: linearGradient,
  fillRect: fillRect,
  fillGradientRect: fillGradientRect,
  strokeRoundRect: strokeRoundRect,
  clipRoundRect: clipRoundRect,
  clipRect: clipRect,
  restore: restore,
  image: image,
  circle: circle,
  font: font,
  text: text,
  measure: measure,
  wrapText: wrapText
};
