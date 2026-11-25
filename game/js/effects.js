/** 有上限、可按时间直接采样的光效，不分配逐帧粒子对象或加载图片。 */
var draw = require("./draw.js");
var animation = require("./animation.js");
var MAX_PARTICLES = 24;

function noise(i, seed) {
  var n = Math.sin(i * 127.1 + (seed || 1) * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function halo(rect, color, strength) {
  var c = draw.getCtx();
  if (strength <= 0 || typeof c.createRadialGradient !== "function") return;
  var x = rect.x + rect.w / 2;
  var y = rect.y + rect.h / 2;
  var radius = Math.max(rect.w, rect.h) * 0.85;
  var g = c.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  c.save();
  c.globalAlpha *= animation.clamp01(strength) * 0.42;
  c.fillStyle = g;
  c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  c.restore();
}

function burst(rect, p, color, seed, count) {
  if (p <= 0 || p >= 1) return;
  var c = draw.getCtx();
  var n = Math.min(MAX_PARTICLES, count == null ? 16 : Math.max(0, count));
  var x = rect.x + rect.w / 2;
  var y = rect.y + rect.h / 2;
  c.save();
  var alpha = c.globalAlpha;
  c.fillStyle = color;
  c.strokeStyle = color;
  c.lineWidth = 1;
  for (var i = 0; i < n; i++) {
    var a = noise(i, seed) * Math.PI * 2;
    var distance = rect.w * (0.38 + p * (0.3 + noise(i + 31, seed) * 0.45));
    var px = x + Math.cos(a) * distance;
    var py = y + Math.sin(a) * distance * 1.25 + p * p * 24;
    var size = (1 + noise(i + 67, seed) * 2) * (1 - p * 0.65);
    c.globalAlpha = alpha * Math.sin(p * Math.PI) * (0.45 + noise(i + 101, seed) * 0.5);
    if (i % 3 === 0) {
      c.beginPath();
      c.moveTo(px - size * 2, py);
      c.lineTo(px + size * 2, py);
      c.moveTo(px, py - size * 2);
      c.lineTo(px, py + size * 2);
      c.stroke();
    } else {
      draw.circle(px, py, size, color);
    }
  }
  c.restore();
}

function sweep(rect, p) {
  if (p <= 0 || p >= 1) return;
  var c = draw.getCtx();
  var band = rect.w * 0.45;
  var x = rect.x - rect.h * 0.35 - band + p * (rect.w + rect.h * 0.35 + band * 2);
  var g = c.createLinearGradient(x, rect.y, x + band, rect.y);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.5, "rgba(255,255,255,0.52)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.save();
  draw.roundRect(rect.x, rect.y, rect.w, rect.h, rect.r || 12);
  c.clip();
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(x, rect.y);
  c.lineTo(x + band, rect.y);
  c.lineTo(x + band + rect.h * 0.35, rect.y + rect.h);
  c.lineTo(x + rect.h * 0.35, rect.y + rect.h);
  c.closePath();
  c.fill();
  c.restore();
}

module.exports = { halo: halo, burst: burst, sweep: sweep, MAX_PARTICLES: MAX_PARTICLES };
