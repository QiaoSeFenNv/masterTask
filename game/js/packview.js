/**
 * 开卡包过场：选系列 → 撕开 → 十张环形 → 点三张 → 飞成候选排 → 选一张。
 *
 * 只画，不改状态。需要推进状态的地方（比如飞行结束进入可选），
 * 回调 store 的对应方法。
 */

var draw = require("./draw.js");
var theme = require("./theme.js");
var layout = require("./layout.js");
var pack = require("./pack.js");
var assets = require("./assets.js");

var W = layout.W;
var PAD = layout.PAD;

/* ---------------- 小工具 ---------------- */

function now() {
  return Date.now();
}

function since(anim) {
  return Math.max(0, now() - (anim.at || 0));
}

function fillRound(x, y, w, h, r, color) {
  var c = draw.getCtx();
  draw.roundRect(x, y, w, h, r);
  c.fillStyle = color;
  c.fill();
}

function strokeRound(x, y, w, h, r, color, lw) {
  draw.strokeRoundRect(x, y, w, h, r, color, lw || 1);
}

/** 按点开的顺序取出那三张角色（state 里只有 id） */
function pickedRolesOf(state) {
  var out = [];
  var picked = state.picked || [];
  var offer = state.offer || [];
  for (var i = 0; i < picked.length; i++) {
    for (var j = 0; j < offer.length; j++) {
      if (offer[j].id === picked[i]) {
        out.push(offer[j]);
        break;
      }
    }
  }
  return out;
}

/* ---------------- 卡背 / 卡面 ---------------- */

/** 卡背：生成的包面图 + 内描边；图没到就用系列渐变兜底 */
function cardBack(x, y, w, h, r, series, alpha) {
  var c = draw.getCtx();
  var a = alpha == null ? 1 : alpha;
  c.save();

  var img = assets.pack(series.id);
  // 翻面动画会把卡横向压扁，这时按比例裁切就变成「放大」了，得改成拉伸
  var iw = img ? img.width || img.naturalWidth || 0 : 0;
  var ih = img ? img.height || img.naturalHeight || 0 : 0;
  var fit = "cover";
  if (iw > 0 && ih > 0) {
    var want = w / h;
    var have = iw / ih;
    if (want / have < 0.85 || want / have > 1.18) fit = "stretch";
  }
  if (!draw.image(img, x, y, w, h, r, a, fit)) {
    // 兜底：还是原来那套渐变 + 中央菱形
    c.globalAlpha = a;
    draw.fillGradientRect(x, y, w, h, [series.top, series.mid, series.bottom], 160, r);
    var cx = x + w / 2;
    var cy = y + h / 2;
    var d = Math.min(w, h) * 0.2;
    c.beginPath();
    c.moveTo(cx, cy - d);
    c.lineTo(cx + d * 0.62, cy);
    c.lineTo(cx, cy + d);
    c.lineTo(cx - d * 0.62, cy);
    c.closePath();
    c.fillStyle = series.accent;
    c.globalAlpha = a * 0.5;
    c.fill();
  }

  c.globalAlpha = a;
  strokeRound(x, y, w, h, r, theme.frame, 1);
  strokeRound(x + 4, y + 4, w - 8, h - 8, Math.max(2, r - 4), "rgba(255,255,255,0.16)", 1);

  c.restore();
}

/** 卡面：角色自己的渐变 + emoji + 名字 */
function cardFace(x, y, w, h, r, role, opts) {
  var o = opts || {};
  var c = draw.getCtx();
  var s = o.scale == null ? 1 : o.scale;

  draw.fillGradientRect(x, y, w, h, role.gradient || [theme.packTop, theme.packBottom], 150, r);
  strokeRound(x, y, w, h, r, o.border || theme.frame, o.borderWidth || 1);

  draw.text(role.emoji || "🎴", x + w / 2, y + h * 0.42, {
    size: (o.emojiSize || 26) * s,
    align: "center",
  });
  draw.text(role.name || "", x + w / 2, y + h * 0.62, {
    size: (o.nameSize || 13) * s,
    weight: "600",
    serif: true,
    color: "#ffffff",
    align: "center",
    shadow: { color: "rgba(0,0,0,0.35)", blur: 8, y: 1 },
  });
  if (o.tagline !== false) {
    draw.text(role.tagline || "", x + w / 2, y + h * 0.74, {
      size: (o.taglineSize || 8.5) * s,
      color: "rgba(255,255,255,0.76)",
      align: "center",
    });
  }
}

/* ---------------- 阶段一：选系列 ---------------- */

function renderSeriesPick(vp, state) {
  var zones = [];
  var top = layout.contentTop(vp);
  var series = pack.SERIES;
  var gap = 12;
  var w = (layout.innerW() - gap * (series.length - 1)) / series.length;
  var h = 208;

  draw.text("今天的卡包", W / 2, top + 6, {
    size: 15,
    weight: "600",
    color: theme.text,
    align: "center",
  });
  draw.text("挑一个，撕开看今天是谁", W / 2, top + 28, {
    size: 11,
    color: theme.muted,
    align: "center",
  });

  var t = now();
  series.forEach(function (s, i) {
    // 极轻的呼吸,让三张看着是「活的」
    var bob = Math.sin(t / 700 + i) * 2;
    var x = PAD + i * (w + gap);
    var y = top + 54 + bob;

    if (!draw.image(assets.pack(s.id), x, y, w, h, 14, 1)) {
      // 图还没加载到时先给渐变，下一帧自然顶上
      draw.fillGradientRect(x, y, w, h, [s.top, s.mid, s.bottom], 160, 14);
    }
    strokeRound(x, y, w, h, 14, theme.frame, 1);
    strokeRound(x + 5, y + 5, w - 10, h - 10, 11, "rgba(255,255,255,0.18)", 1);

    // 包口的锯齿
    var c = draw.getCtx();
    c.save();
    c.beginPath();
    c.moveTo(x + 6, y + 12);
    for (var k = 0; k <= 10; k++) {
      c.lineTo(x + 6 + ((w - 12) * k) / 10, y + 12 + (k % 2 ? 4 : 0));
    }
    c.strokeStyle = s.accent;
    c.globalAlpha = 0.7;
    c.lineWidth = 1;
    c.stroke();
    c.restore();

    // 包面图中央是刻意的深色凹槽，菱形压在上面正好当「封印」
    var cx = x + w / 2;
    var cy = y + h * 0.52;
    var d = Math.min(w, h) * 0.19;
    c.save();
    c.beginPath();
    c.moveTo(cx, cy - d);
    c.lineTo(cx + d * 0.62, cy);
    c.lineTo(cx, cy + d);
    c.lineTo(cx - d * 0.62, cy);
    c.closePath();
    c.fillStyle = s.accent;
    c.globalAlpha = 0.55;
    c.fill();
    c.restore();

    // 名字和描述压在图下面的暗处，图本身没字，这里才是唯一的字
    draw.text(s.name, cx, y + h - 34, {
      size: 15,
      weight: "600",
      serif: true,
      color: "#ffffff",
      align: "center",
      shadow: { color: "rgba(0,0,0,0.55)", blur: 10, y: 1 },
    });
    draw.text(s.desc, cx, y + h - 16, {
      size: 9.5,
      color: "rgba(255,255,255,0.78)",
      align: "center",
      shadow: { color: "rgba(0,0,0,0.45)", blur: 6, y: 0 },
    });

    zones.push({ id: "series", seriesId: s.id, rect: { x: x, y: y, w: w, h: h } });
  });

  return { zones: zones, contentH: layout.contentH(vp) };
}

/* ---------------- 阶段二：撕开 ---------------- */

/** 撕口的锯齿段数：多了像毛边，少了像裂口 */
var TEAR_SEGS = 16;

/** 稳定的伪随机 0..1：同一个包每帧的锯齿位置必须一致，否则会「抖成噪点」 */
function tearNoise(i, seed) {
  var v = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/** 撕口在某一列上的偏移量（设计稿单位） */
function tearOffset(t, amp, seed) {
  var i = Math.round(t * TEAR_SEGS);
  // 三个频率叠一起，边上才有毛糙感，又不会像锯齿梳子
  var a = (tearNoise(i, seed) - 0.5) * 2;
  var b = (tearNoise(i + 31, seed) - 0.5) * 1.1;
  var c2 = (tearNoise(i + 77, seed) - 0.5) * 0.5;
  return (a + b + c2) * 0.62 * amp;
}

/**
 * 撕开这一阶段**等玩家自己划**，不再按时间自动跑完。
 *
 * 手势是「沿包口从左往右划过」：撕口的位置严格等于手指走过的距离，
 * 划满整条包口才算撕通。松手会回缩，没有那种「突然自己裂开」的感觉。
 *
 * 之前那个版本把上半张绕撕口转了 35°，看起来像翻书页而不是撕纸，
 * 所以这里改成：已经撕下来的那一条**整条抬起来**跟着手指走，
 * 撕通之后再飘走 —— 全程只有一个平移，没有任何旋转。
 */
function renderTear(vp, state, anim) {
  var zones = [];
  var top = layout.contentTop(vp);
  var p = pack.clamp01(anim.p || 0); // 撕口走过包口全长的比例
  var fin = anim.doneAt ? pack.clamp01((now() - anim.doneAt) / pack.TEAR_FINISH_MS) : 0;
  var s = pack.seriesOf(anim.series);
  var c = draw.getCtx();

  var w = 150;
  var h = 210;
  var cx = W / 2;
  var x0 = cx - w / 2;
  var y0 = top + 96;
  var cw = w;
  var ch = h;

  // 撕口在包口那条锯齿线上：包面靠上的三分之一
  var seamY = y0 + ch * 0.30;
  var amp = 1.6 + p * 3.4; // 锯齿随进度变粗，撕口「裂长」
  var seed = (s.id.charCodeAt(0) || 1) * 0.37;
  var tearX = x0 + cw * p; // 已经撕到哪儿了

  /* 撕口后面那团光：外景已经整页铺好了（见 backdrop.js），这里只补系列色 */
  if (typeof c.createRadialGradient === "function") {
    var gx = x0 + cw * 0.5 * p;
    var g = c.createRadialGradient(gx, seamY, 0, gx, seamY, 140 + p * 70);
    g.addColorStop(0, s.accent);
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.save();
    c.globalAlpha = 0.06 + p * 0.30;
    c.fillStyle = g;
    c.fillRect(0, top - 40, W, 440);
    c.restore();
  }

  /** 有生成图就贴图，没有就退回渐变 */
  function body(img) {
    if (!draw.image(img, x0, y0, cw, ch, 0, 1)) {
      draw.fillGradientRect(x0, y0, cw, ch, [s.top, s.mid, s.bottom], 160, 0);
    }
  }

  var img = assets.pack(s.id);

  /* --- 撕口以下：完整留着 --- */
  c.save();
  c.beginPath();
  c.moveTo(x0, seamY);
  for (var i = 1; i <= TEAR_SEGS; i++) {
    var t = i / TEAR_SEGS;
    c.lineTo(x0 + cw * t, seamY + tearOffset(t, amp, seed));
  }
  c.lineTo(x0 + cw, y0 + ch);
  c.lineTo(x0, y0 + ch);
  c.closePath();
  c.clip();
  body(img);
  strokeRound(x0, y0, cw, ch, 14, theme.frame, 1);
  c.restore();

  /* --- 撕口以上、还没撕到的那一段（右边）：也留着 --- */
  if (p < 1) {
    c.save();
    c.beginPath();
    c.moveTo(x0 + cw, seamY + tearOffset(1, amp, seed));
    c.lineTo(x0 + cw, y0 - 2);
    c.lineTo(tearX, y0 - 2);
    c.lineTo(tearX, seamY);
    for (var j = TEAR_SEGS; j >= 0; j--) {
      var tj = j / TEAR_SEGS;
      if (x0 + cw * tj < tearX) break;
      c.lineTo(x0 + cw * tj, seamY + tearOffset(tj, amp, seed));
    }
    c.closePath();
    c.clip();
    body(img);
    strokeRound(x0, y0, cw, ch, 14, theme.frame, 1);
    c.restore();
  }

  /* --- 已经撕下来的那一条：整条抬起来，跟着手指往右上方走 --- */
  if (p > 0) {
    var dx = 6 + p * 22; // 往右，跟着滑走的手指
    var dy = -4 - p * 16 - fin * 120; // 往上飘
    var a = (1 - fin * 0.9) * (1 - p * 0.05);

    c.save();
    c.globalAlpha = a;
    c.translate(dx, dy);
    c.beginPath();
    c.moveTo(x0, y0 - 2);
    c.lineTo(tearX, y0 - 2);
    c.lineTo(tearX, seamY);
    for (var k = TEAR_SEGS; k >= 0; k--) {
      var tk = k / TEAR_SEGS;
      var sx = x0 + cw * tk;
      if (sx > tearX) continue;
      c.lineTo(sx, seamY + tearOffset(tk, amp, seed));
    }
    c.closePath();
    c.clip();
    body(img);
    strokeRound(x0, y0, cw, ch, 14, theme.frame, 1);

    // 这条纸的下沿毛边：白纤维，纸被撕开就是这个样子
    c.globalAlpha = a * 0.8;
    c.strokeStyle = "rgba(255,255,255,0.85)";
    c.lineWidth = 0.8;
    c.beginPath();
    for (var f = 0; f <= TEAR_SEGS; f++) {
      var tf = f / TEAR_SEGS;
      var fx = x0 + cw * tf;
      if (fx > tearX) continue;
      var fy = seamY + tearOffset(tf, amp, seed);
      var n1 = tearNoise(f + 11, seed) - 0.5;
      var n2 = tearNoise(f + 53, seed) - 0.5;
      var len = 1.5 + Math.abs(n1) * 5;
      c.moveTo(fx, fy);
      c.lineTo(fx + Math.sin(n2 * 1.4) * len, fy + Math.cos(n2 * 1.4) * len);
    }
    c.stroke();
    c.restore();
  }

  /* --- 留在包上的那侧撕口：一条发亮的边 + 翘起的纤维 --- */
  if (p > 0.02) {
    var edgeA = Math.cos(((p - 0.02) / 0.98) * Math.PI * 0.5); // 越接近撕通越淡
    c.save();
    c.globalAlpha = Math.max(0.12, edgeA) * 0.75;
    c.strokeStyle = s.accent;
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(x0, seamY + tearOffset(0, amp, seed));
    for (var m = 1; m <= TEAR_SEGS; m++) {
      var tm = m / TEAR_SEGS;
      if (x0 + cw * tm > tearX) break;
      c.lineTo(x0 + cw * tm, seamY + tearOffset(tm, amp, seed));
    }
    c.lineTo(tearX, y0);
    c.stroke();
    c.restore();
  }

  var hint =
    fin > 0 ? "撕开了" : p <= 0.01 ? "从左边划过包口" : p < 1 ? "继续往右划…" : "松手";
  draw.text(hint, W / 2, y0 + ch + 54, {
    size: 12,
    color: theme.muted,
    align: "center",
  });

  return { zones: zones, contentH: layout.contentH(vp) };
}

/* ---------------- 阶段三：环形十张 ---------------- */

/**
 * 环的角度完全由玩家拖动决定（state.ringSpin），不再自动转。
 * 之前是按时长自己转 —— 用户既看不清、又觉得「不是我要的方向」。
 */
function spinOf(state) {
  return (state && state.ringSpin) || 0;
}

/** 某张已点开的牌翻面进度 0..1 */
function flipOf(state, roleId) {
  var at = (state.pickedAt || {})[roleId];
  if (!at) return 1;
  return pack.clamp01((now() - at) / (pack.FLIP_MS || 420));
}

/** 正在翻面吗（需要连续出帧） */
function anyFlipping(state) {
  var at = state.pickedAt || {};
  for (var id in at) {
    if (now() - at[id] < (pack.FLIP_MS || 420)) return true;
  }
  return false;
}

/** 牌底下的投影：越靠前越实，让这一摞看着是立在空中的 */
function cardShadow(slot, w, h) {
  var c = draw.getCtx();
  var near = pack.clamp01(slot.depth);
  c.save();
  c.globalAlpha = 0.1 + near * 0.26;
  c.fillStyle = "#000";
  c.beginPath();
  if (typeof c.ellipse === "function") {
    c.ellipse(slot.x, slot.y + h / 2 + 14, w * 0.46, 13, 0, 0, Math.PI * 2);
  } else {
    c.moveTo(slot.x - w * 0.46, slot.y + h / 2 + 14);
    c.lineTo(slot.x + w * 0.46, slot.y + h / 2 + 14);
    c.lineTo(slot.x + w * 0.3, slot.y + h / 2 + 26);
    c.lineTo(slot.x - w * 0.3, slot.y + h / 2 + 26);
    c.closePath();
  }
  c.fill();
  c.restore();
}

function renderRing(vp, state, anim) {
  var zones = [];
  var top = layout.contentTop(vp);
  var s = pack.seriesOf(anim.series);
  var list = pack.ring(state.offer.length, spinOf(state), top);
  var c = draw.getCtx();

  draw.text("左右拖动转一圈，点三张", W / 2, top + 8, {
    size: 12,
    color: theme.muted,
    align: "center",
  });

  // 已经点了几张
  var done = state.picked.length;
  draw.text(done + " / 3", W / 2, top + 30, {
    size: 11,
    color: done >= 3 ? theme.gold : theme.faint,
    align: "center",
  });

  list.forEach(function (slot) {
    var role = state.offer[slot.i];
    if (!role) return;
    var on = state.picked.indexOf(role.id) >= 0;
    var cw = slot.w * slot.scale * slot.wscale;
    var ch = slot.h * slot.scale;

    cardShadow(slot, slot.w * slot.scale, ch);

    // 卡一律正立，不跟着环歪着摆 —— 长方形就该是长方形。
    // 「转过去」靠横向压扁（wscale）表现，不用真旋转。
    c.save();
    c.translate(slot.x, slot.y);
    c.globalAlpha = slot.alpha == null ? 1 : slot.alpha;

    if (on) {
      // 点过的：从背面翻到正面（横向压扁再展开）+ 金边
      var p = flipOf(state, role.id);
      var k = Math.abs(Math.cos(p * Math.PI)); // 1 → 0 → 1
      var pop = 1 + Math.sin(p * Math.PI) * 0.06;
      var fw = Math.max(1, cw * k);
      var fh = ch * (p < 0.5 ? 1 : pop);
      if (p < 0.5) {
        cardBack(-fw / 2, -fh / 2, fw, fh, 14, s, 1);
      } else {
        cardFace(-cw / 2, -ch / 2, cw, ch, 14, role, {
          scale: slot.scale,
          border: theme.gold,
          borderWidth: 2,
          emojiSize: 62,
          nameSize: 22,
          taglineSize: 11,
        });
      }
    } else {
      cardBack(-cw / 2, -ch / 2, cw, ch, 14, s, 1);
    }
    c.restore();

    if (on) {
      var idx = state.picked.indexOf(role.id) + 1;
      draw.circle(slot.x + cw / 2 - 12, slot.y - ch / 2 + 12, 11, theme.gold);
      draw.text(String(idx), slot.x + cw / 2 - 12, slot.y - ch / 2 + 16, {
        size: 12,
        weight: "700",
        color: theme.onGold,
        align: "center",
      });
    }
  });

  // 拖动提示：环下方一对箭头，暗示「可以左右拨」。
  // 要排在正前方那张的下边缘之外 —— 那张牌的最低点比环心低 ry + cardH/2。
  var hintY = top + pack.RING.cyOff + pack.RING.ry + pack.RING.cardH / 2 + 26;
  c.save();
  c.globalAlpha = 0.28;
  c.strokeStyle = theme.faint;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(W / 2 - 46, hintY);
  c.lineTo(W / 2 - 66, hintY - 5);
  c.moveTo(W / 2 - 46, hintY);
  c.lineTo(W / 2 - 66, hintY + 5);
  c.moveTo(W / 2 + 46, hintY);
  c.lineTo(W / 2 + 66, hintY - 5);
  c.moveTo(W / 2 + 46, hintY);
  c.lineTo(W / 2 + 66, hintY + 5);
  c.stroke();
  c.restore();

  return { zones: zones, contentH: layout.contentH(vp), ring: list };
}

/* ---------------- 阶段四：三张飞到候选排 ---------------- */

function renderTop(vp, state, anim) {
  var top = layout.contentTop(vp);
  var s = pack.seriesOf(anim.series);
  var el = since(anim);
  var p = pack.clamp01(el / pack.TOP_MS);
  var c = draw.getCtx();
  var picked = pickedRolesOf(state);
  var list = pack.ring(state.offer.length, spinOf(state), top);

  // 找到三张在环里的位置,让它们从那儿飞到上方位
  var from = {};
  list.forEach(function (slot) {
    var role = state.offer[slot.i];
    if (role) from[role.id] = slot;
  });

  draw.text("三张候选", W / 2, top + 8, {
    size: 12,
    color: theme.muted,
    align: "center",
  });

  picked.forEach(function (role, i) {
    var dst = layout.pickCardRect(i);
    var start = from[role.id] || { x: W / 2, y: top + 220, scale: 0.8 };
    var k = pack.easeBack(p);
    var x = start.x + (dst.x + dst.w / 2 - start.x) * k;
    var y = start.y + (top + dst.y + dst.h / 2 - start.y) * k;
    var sc = start.scale + (1 - start.scale) * k;
    var cw = dst.w * sc;
    var ch = dst.h * sc;

    // 飞到一半才翻面
    var flip = pack.clamp01((p - 0.45) / 0.55);
    c.save();
    c.translate(x, y);
    if (flip < 0.5) {
      cardBack(-cw / 2, -ch / 2, cw * (1 - flip), ch, 12, s, 1);
    } else {
      cardFace(-cw / 2, -ch / 2, cw * flip, ch, 12, role, {
        scale: sc,
        emojiSize: 30,
        nameSize: 15,
        taglineSize: 9,
      });
    }
    c.restore();
  });

  // 飞完就进可选，交给 app 在下一帧调 store 的 enterPick()
  return { zones: [], contentH: layout.pickContentH(), done: p >= 1 };
}

/* ---------------- 阶段五：从三张里选一张 ---------------- */

function renderPick(vp, state) {
  var zones = [];
  var top = layout.contentTop(vp);
  var picked = pickedRolesOf(state);
  var sel = null;
  for (var i = 0; i < picked.length; i++) {
    if (picked[i].id === state.slot) sel = picked[i];
  }

  draw.text("三张候选", W / 2, top + 8, {
    size: 12,
    color: theme.muted,
    align: "center",
  });

  picked.forEach(function (role, i) {
    var b = layout.pickCardRect(i);
    var r = { x: b.x, y: top + b.y, w: b.w, h: b.h, r: b.r };
    var on = role.id === state.slot;
    if (on) r.y -= 6;

    cardFace(r.x, r.y, r.w, r.h, r.r, role, {
      border: on ? theme.gold : theme.frame,
      borderWidth: on ? 2 : 1,
      emojiSize: 30,
      nameSize: 15,
      taglineSize: 9,
    });

    if (on) {
      draw.circle(r.x + r.w - 12, r.y + 12, 5, theme.gold);
      draw.text("✓", r.x + r.w - 12, r.y + 15.5, {
        size: 7.5,
        weight: "700",
        color: theme.onGold,
        align: "center",
      });
    }
    zones.push({ id: "slot", roleId: role.id, rect: r });
  });

  // 说明
  var ib = layout.offerIntroRect();
  var box = { x: ib.x, y: top + ib.y, w: ib.w, h: ib.h, r: ib.r };
  fillRound(box.x, box.y, box.w, box.h, box.r, theme.softFill);
  strokeRound(box.x, box.y, box.w, box.h, box.r, theme.softBorder, 1);
  if (sel) {
    draw.text(sel.name + " · " + sel.tagline, box.x + 16, box.y + 22, {
      size: 11.5,
      color: theme.gold,
    });
    draw.wrapText(sel.intro || "", box.x + 16, box.y + 44, box.w - 32, 18, {
      size: 12,
      color: theme.body,
      maxLines: 2,
    });
  } else {
    draw.text("点一张，看看今天要成为谁。", box.x + 16, box.y + 36, {
      size: 12.5,
      color: theme.body,
    });
    draw.text("选定之后，今天就是它了。", box.x + 16, box.y + 60, {
      size: 11,
      color: theme.faint,
    });
  }

  // 落定
  var bb = layout.pickButtonRect();
  var btn = { x: bb.x, y: top + bb.y, w: bb.w, h: bb.h, r: bb.r };
  if (sel) {
    draw.fillGradientRect(btn.x, btn.y, btn.w, btn.h, [theme.gold, theme.goldDeep], 135, btn.r);
    draw.text(state.shifting ? "定下来…" : "就选「" + sel.name + "」", btn.x + btn.w / 2, btn.y + btn.h / 2 + 5, {
      size: 15,
      weight: "600",
      color: theme.onGold,
      align: "center",
    });
    if (!state.shifting) zones.push({ id: "confirm-pick", rect: btn });
  } else {
    fillRound(btn.x, btn.y, btn.w, btn.h, btn.r, theme.idleBtn);
    strokeRound(btn.x, btn.y, btn.w, btn.h, btn.r, theme.frame, 1);
    draw.text("先选一张", btn.x + btn.w / 2, btn.y + btn.h / 2 + 5, {
      size: 14,
      color: theme.faint,
      align: "center",
    });
  }

  draw.text(state.canRedraw ? "选定后当天生效（测试环境可重抽）" : "每天一次，选定不可更换", W / 2, btn.y + btn.h + 26, {
    size: 10.5,
    color: theme.faint,
    align: "center",
  });

  return { zones: zones, contentH: layout.pickContentH() };
}

/* ---------------- 入口 ---------------- */

/** 按阶段画，返回 { zones, contentH, done } */
function render(vp, state) {
  var anim = state.anim || {};
  var kind = anim.kind || "pack";
  if (!state.offer || !state.offer.length) {
    return { zones: [], contentH: layout.contentH(vp) };
  }
  if (kind === "tear") return renderTear(vp, state, anim);
  if (kind === "ring") return renderRing(vp, state, anim);
  if (kind === "top") return renderTop(vp, state, anim);
  if (kind === "pick") return renderPick(vp, state);
  return renderSeriesPick(vp, state);
}

/** 过场还在动吗（需要连续出帧） */
function busy(state) {
  var anim = state.anim || {};
  if (anim.kind === "tear") {
    // 撕开等玩家划；但撕通之后那条纸还在飘，这一段要连着出帧
    return Boolean(anim.doneAt) && now() - anim.doneAt < pack.TEAR_FINISH_MS;
  }
  if (anim.kind === "ring") return true; // 牌一直上下漂浮，得连着出帧
  if (anim.kind === "top") return since(anim) < pack.TOP_MS;
  if (anim.kind === "pack") return true; // 呼吸动画
  return false;
}

/** 环形里点中了哪张（没有就返回空） */
function hitRing(vp, state, x, y) {
  var anim = state.anim || {};
  if (anim.kind !== "ring") return "";
  var top = layout.contentTop(vp);
  var list = pack.ring(state.offer.length, spinOf(state), top);
  // 命中按绘制顺序的逆序找（近的优先）
  for (var i = list.length - 1; i >= 0; i--) {
    var slot = list[i];
    var role = state.offer[slot.i];
    if (!role) continue;
    if (state.picked.indexOf(role.id) >= 0) continue;
    var cw = slot.w * slot.scale;
    var ch = slot.h * slot.scale;
    if (pack.hitCard({ x: slot.x, y: slot.y, rot: 0, w: cw, h: ch, scale: 1, wscale: slot.wscale }, x, y)) {
      return role.id;
    }
  }
  return "";
}

/** 某张牌现在在屏幕上的中心点（测试和小游戏里都用得上） */
function pointOf(vp, state, roleId) {
  var top = layout.contentTop(vp);
  var list = pack.ring(state.offer.length, spinOf(state), top);
  for (var i = 0; i < list.length; i++) {
    var role = state.offer[list[i].i];
    if (role && role.id === roleId) return { x: list[i].x, y: list[i].y };
  }
  return null;
}

module.exports = {
  render: render,
  busy: busy,
  hitRing: hitRing,
  pointOf: pointOf,
  spinOf: spinOf,
  TEAR_SWIPE: pack.TEAR_SWIPE,
  TEAR_FINISH_MS: pack.TEAR_FINISH_MS,
  TOP_MS: pack.TOP_MS,
};
