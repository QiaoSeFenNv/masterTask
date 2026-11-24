/**
 * 背景层：按时段选一套画法，铺满整个画布（所有 UI 之前）。
 *
 *   早上 -> 晨雾：米白底，淡暖粉从左上渗下来，浅蓝压在右上，几颗雾白光点
 *   中午 -> 晴空：天蓝渐深到底，右上一小块光晕，少量金色碎光
 *   晚上 -> 静谧深空：深蓝近黑 + 三团极淡星云 + 冷白星点（含十字星芒）
 *
 * 星点/雾点/碎光全部用固定种子生成，坐标存 0..1 比例：
 * 每次启动、每个屏幕尺寸看到的都一样，不会自己跳动。
 *
 * 切换：paint() 每帧检查时段，变了就做一个 1.2s 的交叉淡入，
 * 旧背景先冻结成一张离屏图再逐帧淡出，避免每帧重画两份星点。
 */

var draw = require("./draw.js");
var theme = require("./theme.js");
var dayphase = require("./dayphase.js");
var env = require("./env.js");

var DESIGN_W = 375;
var FADE_MS = 1200;

/* ---------------- 确定性随机 ---------------- */

function xorshift(seed0) {
  var seed = seed0 >>> 0 || 1;
  return function () {
    seed ^= (seed << 13) >>> 0;
    seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= (seed << 5) >>> 0;
    seed >>>= 0;
    return (seed % 65536) / 65536;
  };
}

function buildDots(count, seed, make) {
  var rnd = xorshift(seed);
  var list = [];
  for (var i = 0; i < count; i++) list.push(make(rnd));
  return list;
}

/* ---------------- 各时段用的点缀 ---------------- */

var STAR_COUNT = 104;
var STARS = buildDots(STAR_COUNT, 0x5f3a17, function (rnd) {
  var s = rnd();
  return {
    xr: rnd(),
    yr: Math.pow(rnd(), 1.18),
    r: 0.45 + s * s * 1.25,
    a: 0.3 + rnd() * 0.62,
    bright: rnd() > 0.88,
  };
});

var NIGHT_CLOUDS = [
  { xr: 0.16, yr: 0.14, r: 0.66, color: "rgba(98,86,184,0.055)" },
  { xr: 0.84, yr: 0.6, r: 0.72, color: "rgba(62,116,178,0.045)" },
  { xr: 0.4, yr: 0.9, r: 0.56, color: "rgba(126,90,164,0.038)" },
];

/** 晨雾：左上一团暖粉，右上压一层浅蓝，底部回温 */
var MORNING_CLOUDS = [
  { xr: 0.12, yr: 0.1, r: 0.78, color: "rgba(255,204,172,0.20)" },
  { xr: 0.9, yr: 0.42, r: 0.64, color: "rgba(190,218,255,0.20)" },
  { xr: 0.5, yr: 0.94, r: 0.6, color: "rgba(255,232,214,0.12)" },
];

/** 中午：右上一小块日光，左下压两片很淡的云 */
var MIDDAY_CLOUDS = [
  { xr: 0.78, yr: 0.12, r: 0.54, color: "rgba(255,238,186,0.16)" },
  { xr: 0.22, yr: 0.68, r: 0.62, color: "rgba(255,255,255,0.40)" },
  { xr: 0.68, yr: 0.84, r: 0.5, color: "rgba(255,255,255,0.26)" },
];

var MIST_DOTS = buildDots(46, 0x3b7c21, function (rnd) {
  var s = rnd();
  return {
    xr: rnd(),
    yr: Math.pow(rnd(), 0.86),
    r: 0.7 + s * s * 2.2,
    a: 0.16 + rnd() * 0.34,
  };
});

var DUST_DOTS = buildDots(30, 0x71d3a9, function (rnd) {
  var s = rnd();
  return {
    xr: rnd(),
    yr: Math.pow(rnd(), 1.3),
    r: 0.5 + s * s * 1.4,
    a: 0.18 + rnd() * 0.4,
  };
});

/* ---------------- 画法 ---------------- */

function cloudsOf(ctx, list, w, h) {
  if (typeof ctx.createRadialGradient !== "function") return;
  for (var k = 0; k < list.length; k++) {
    var cl = list[k];
    var cx = cl.xr * w;
    var cy = cl.yr * h;
    var rad = cl.r * Math.max(w, h * 0.7);
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, cl.color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

function paintNight(ctx, w, h) {
  draw.fillRect(0, 0, w, h, theme.bg);
  draw.fillGradientRect(0, 0, w, h, [theme.bgTop, theme.bgMid, theme.bgBottom], 90, 0);
  cloudsOf(ctx, NIGHT_CLOUDS, w, h);

  for (var i = 0; i < STARS.length; i++) {
    var st = STARS[i];
    var x = st.xr * w;
    var y = st.yr * h;
    ctx.beginPath();
    ctx.arc(x, y, st.r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(223,232,255," + st.a.toFixed(2) + ")";
    ctx.fill();

    // 最亮的那几颗加一点十字星芒，免得整片太平均
    if (st.bright) {
      ctx.fillStyle = "rgba(210,224,255," + (st.a * 0.45).toFixed(2) + ")";
      ctx.fillRect(x - 0.6, y - 4.5, 1.2, 9);
      ctx.fillRect(x - 4.5, y - 0.6, 9, 1.2);
    }
  }
}

function paintMorning(ctx, w, h) {
  draw.fillRect(0, 0, w, h, theme.bg);
  draw.fillGradientRect(0, 0, w, h, [theme.bgTop, theme.bgMid, theme.bgBottom], 160, 0);
  cloudsOf(ctx, MORNING_CLOUDS, w, h);

  // 雾光：白点带一点暖调，边缘虚
  for (var i = 0; i < MIST_DOTS.length; i++) {
    var d = MIST_DOTS[i];
    ctx.beginPath();
    ctx.arc(d.xr * w, d.yr * h, d.r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,250,243," + d.a.toFixed(2) + ")";
    ctx.fill();
  }
}

function paintMidday(ctx, w, h) {
  draw.fillRect(0, 0, w, h, theme.bg);
  draw.fillGradientRect(0, 0, w, h, [theme.bgTop, theme.bgMid, theme.bgBottom], 175, 0);
  cloudsOf(ctx, MIDDAY_CLOUDS, w, h);

  // 浮尘：偏金的小点，集中在上面三分之一
  for (var i = 0; i < DUST_DOTS.length; i++) {
    var d = DUST_DOTS[i];
    ctx.beginPath();
    ctx.arc(d.xr * w, d.yr * h, d.r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,240,200," + d.a.toFixed(2) + ")";
    ctx.fill();
  }
}

var PAINTERS = {};
PAINTERS[dayphase.NIGHT] = paintNight;
PAINTERS[dayphase.MORNING] = paintMorning;
PAINTERS[dayphase.MIDDAY] = paintMidday;

/* ---------------- 交叉淡入 ---------------- */

var fading = null; // { img, start }
var current = "";

/** 把当前画布截成一张离屏图；拿不到就算了，下次直接硬切 */
function snapshot(canvas) {
  if (!canvas) return null;
  var w = canvas.width;
  var h = canvas.height;
  var api = env.getWx();
  if (!api || typeof api.createOffscreenCanvas !== "function") return null;
  try {
    var off = api.createOffscreenCanvas({ type: "2d", width: w, height: h });
    if (!off || !off.getContext) return null;
    off.getContext("2d").drawImage(canvas, 0, 0);
    return off;
  } catch (e) {
    return null;
  }
}

/* ---------------- 主流程 ---------------- */

/** 现在该画哪个时段：以 theme 里已经 apply 好的为准，保证底色和文字同步 */
function activePhase() {
  return theme.phase || dayphase.phase();
}

function paint(vp) {
  var ctx = draw.getCtx();
  var canvas = draw.getCanvas();
  var w = vp.width || DESIGN_W;
  var h = vp.height;
  var want = activePhase();

  if (!current) {
    current = want;
  } else if (want !== current) {
    // 换时段：先把旧画面截下来，盖在新背景上淡出
    var old = snapshot(canvas);
    if (old) fading = { img: old, start: Date.now() };
    current = want;
  }

  var painter = PAINTERS[current] || paintNight;
  painter(ctx, w, h);

  if (fading) {
    var t = (Date.now() - fading.start) / FADE_MS;
    if (t >= 1) {
      fading = null;
    } else {
      ctx.save();
      ctx.globalAlpha = 1 - t;
      try {
        ctx.drawImage(fading.img, 0, 0, w, h);
      } catch (e) {
        fading = null;
      }
      ctx.restore();
    }
  }
}

/** 测试用：钉死某个时段，下次 paint 直接换成它 */
function forcePhase(p) {
  theme.apply(p);
  current = "";
  fading = null;
}

/** 交叉淡入还在跑吗（外层据此继续排下一帧） */
function isFading() {
  return Boolean(fading);
}

module.exports = {
  paint: paint,
  forcePhase: forcePhase,
  isFading: isFading,
  STAR_COUNT: STAR_COUNT,
  FADE_MS: FADE_MS,
};
