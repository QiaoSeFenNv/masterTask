/**
 * 开卡包的过场。
 *
 * 三个纯外观的「系列」，只决定卡包长什么样，不影响抽到谁：
 *   深海 / 暮色 / 晨曦
 *
 * 这里只放几何、时序、命中这类纯计算，用户的选择存在 store 里。
 */

var SERIES = [
  {
    id: "deep",
    name: "深海",
    desc: "沉一点，亮一点",
    top: "#164a66",
    mid: "#0d2a3d",
    bottom: "#061420",
    accent: "#8fe3ff",
  },
  {
    id: "dusk",
    name: "暮色",
    desc: "天还没黑透",
    top: "#4a2a5e",
    mid: "#2a1740",
    bottom: "#120a1e",
    accent: "#e3aaff",
  },
  {
    id: "dawn",
    name: "晨曦",
    desc: "刚醒的那一会儿",
    top: "#f3cfa8",
    mid: "#d8825c",
    bottom: "#7d4736",
    accent: "#fff1d8",
  },
];

function seriesOf(id) {
  for (var i = 0; i < SERIES.length; i++) {
    if (SERIES[i].id === id) return SERIES[i];
  }
  return SERIES[0];
}

/* ---------------- 时序 ---------------- */

var TEAR_SWIPE = 150; // 把包口整条划开要横向拖多远（设计稿单位，约等于包宽）
var TEAR_FINISH_MS = 480; // 撕通之后，上半条飘走的时长
var TOP_MS = 620; // 三张飞到候选位的时长
var FLIP_MS = 420; // 候选翻开

/* ---------------- 环 ---------------- */

/** 环的几何（设计稿单位，相对内容区顶部） */
var RING = {
  cx: 187.5,
  cyOff: 270, // 环心离内容区顶部的距离（ry 很小，基本就是正前方那张的纵向中心）
  rx: 160, // 环在屏幕上的横向半径：再大 ±36° 那两张就整个跑到正面牌外面去了
  ry: 35, // 纵向半径：压得很扁，后面的牌才不会从正前方那张上下漏出来
  camK: 3.5, // 透视强度，越大越接近正交（远近差越小）
  bob: 5.5, // 上下漂浮的幅度
  wMin: 0.25, // 转到正侧面时最窄压到多少（再窄就成一条线了）
  cardW: 140,
  cardH: 210,
};

/**
 * 把十张牌摆成一圈——立着的轮盘／旋转木马，不是摊平的椭圆。
 *
 * a = 0 在正前方，a = π 在正后方。卡片「立」在圆周上、法线朝外：
 *   - 位置：横向 sin(a)·rx，纵向 cos(a)·ry，投影出来就是那个椭圆环
 *   - 大小：近大远小，正前方最大、正后方约四成
 *   - 宽窄：侧着看被压扁（cos a），转到侧面只剩一条薄边
 *   - 明暗：后面的压暗，再叠一层按相位错开的上下漂浮
 *
 * 画家排序：远的先画，正前方那张最后画、盖在最上面。
 * ry 和 camK 是照着「正前方那张把后面全挡住」调的：后方的牌缩得够小、
 * 又只上下错开 ±ry，落进正前方那张的矩形里就看不见了，
 * 只在左右两侧露出一角，一眼才只有一张是完整的。
 * 卡片一律正立（rot 恒为 0），矩形不会被转成歪斜的菱形。
 */
function ring(n, spin, top, tms) {
  var t = tms == null ? Date.now() : tms;
  var stepA = (Math.PI * 2) / n; // 每张牌占的角度
  var kNear = RING.camK / (RING.camK - 1); // 正前方那张的透视放大率
  var out = [];

  for (var i = 0; i < n; i++) {
    var a = i * stepA + (spin || 0);
    var sa = Math.sin(a);
    var ca = Math.cos(a); // 1 = 正前方，-1 = 正后方

    // 近大远小：把卡片投到相机前方，按距离缩小
    var k = RING.camK / (RING.camK - ca);
    var scale = k / kNear; // 1 .. (camK-1)/(camK+1)

    // 侧着看就压扁；给个下限，免得在 90° 处彻底消失成一条线
    var wscale = Math.max(RING.wMin, Math.abs(ca));

    // 漂浮：每张相位错开，叠在一起才不是齐刷刷地抖
    var front = (ca + 1) / 2; // 0 = 最后面，1 = 正前方
    var bob = Math.sin(t / 680 + i * 1.9) * RING.bob * (0.35 + 0.65 * front);

    out.push({
      i: i,
      a: a,
      x: RING.cx + sa * RING.rx,
      y: top + RING.cyOff + ca * RING.ry + bob,
      scale: scale,
      wscale: wscale,
      alpha: 0.52 + 0.48 * front,
      depth: front,
      rot: 0,
      w: RING.cardW,
      h: RING.cardH,
    });
  }

  // 远的先画，正前方那张最后画、盖在最上面
  out.sort(function (p, q) {
    return p.depth - q.depth;
  });
  return out;
}

/** 点是否落在某张（可能旋转、缩放的）卡上 */
function hitCard(card, px, py) {
  var dx = px - card.x;
  var dy = py - card.y;
  var c = Math.cos(-card.rot);
  var s = Math.sin(-card.rot);
  var lx = dx * c - dy * s;
  var ly = dx * s + dy * c;
  var ws = card.wscale == null ? 1 : card.wscale;
  return Math.abs(lx) <= (card.w * card.scale * ws) / 2 && Math.abs(ly) <= (card.h * card.scale) / 2;
}

/* ---------------- 缓动 ---------------- */

function clamp01(t) {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** 先快后慢 */
function easeOut(t) {
  var k = 1 - clamp01(t);
  return 1 - k * k * k;
}

/** 稍微冲过去一点再回来，落位更有「啪」的感觉 */
function easeBack(t) {
  var k = clamp01(t) - 1;
  var s = 1.7;
  return 1 + k * k * ((s + 1) * k + s);
}

module.exports = {
  SERIES: SERIES,
  seriesOf: seriesOf,
  TEAR_SWIPE: TEAR_SWIPE,
  TEAR_FINISH_MS: TEAR_FINISH_MS,
  TOP_MS: TOP_MS,
  FLIP_MS: FLIP_MS,
  RING: RING,
  ring: ring,
  hitCard: hitCard,
  clamp01: clamp01,
  easeOut: easeOut,
  easeBack: easeBack,
};
