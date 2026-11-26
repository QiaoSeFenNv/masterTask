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
var animation = require("./animation.js");
var effects = require("./effects.js");
var pagReveal = require("./pag-reveal.js");
var pagTear = require("./pag-tear.js");
var tearTemplate = require("./pag-tear-template.js");
var packetSurface = require("./packet-surface.js");
var tearFlight = require("./tear-flight.js");
var tearFlights = tearFlight.plan(10);

var W = layout.W;
var PAD = layout.PAD;

/* ---------------- 小工具 ---------------- */

function now() {
  return animation.now();
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
  var a = (alpha == null ? 1 : alpha) * c.globalAlpha;
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
var cardFace = require("./cardface.js").paint;

/* ---------------- 阶段一：选系列 ---------------- */

/** A shared packet surface for the picker and its movement into the tear stage. */
function paintSeriesPacket(s, rect, opacity, labelOpacity) {
  var c=draw.getCtx();c.save();c.globalAlpha=opacity;
  packetSurface.draw(c,assets.pack(s.id),rect,s);
  var cx=rect.x+rect.w/2,alpha=opacity*labelOpacity;
  draw.text(s.name,cx,rect.y+rect.h+22,{size:15,weight:"600",serif:true,color:theme.text,align:"center",alpha:alpha});
  draw.text(s.desc,cx,rect.y+rect.h+41,{size:9.5,color:theme.bodyBright,align:"center",alpha:alpha});
  c.restore();
}
function seriesRect(vp, index, at) {
  var gap=12,w=(layout.innerW()-gap*(pack.SERIES.length-1))/pack.SERIES.length;
  return {x:PAD+index*(w+gap),y:layout.contentTop(vp)+68+Math.sin(at/700+index)*2,w:w,h:w*210/150};
}
function renderSeriesPick(vp, state, options) {
  options = options || {};
  var zones = [], top = layout.contentTop(vp);
  var opacity = (options.opacity == null ? 1 : options.opacity) * draw.getCtx().globalAlpha;
  var at = options.at == null ? now() : options.at;
  draw.text("今天的卡包", W/2, top+6, {size:15,weight:"600",color:theme.text,align:"center",alpha:opacity});
  draw.text("挑一个，撕开看今天是谁", W/2, top+28, {size:11,color:theme.muted,align:"center",alpha:opacity});
  pack.SERIES.forEach(function(s,i) {
    if (s.id === options.skip) return;
    var rect = seriesRect(vp,i,at);
    paintSeriesPacket(s,rect,opacity,1);
    // The printed pouch and its caption are one selectable option.
    zones.push({id:"series",seriesId:s.id,rect:{x:rect.x,y:rect.y,w:rect.w,h:rect.h+48}});
  });
  return {zones:zones,contentH:layout.contentH(vp)};
}
function renderOpening(vp, state, anim) {
  var at = anim.at, s = pack.seriesOf(anim.series), index = pack.SERIES.indexOf(s);
  renderSeriesPick(vp,state,{skip:s.id,at:at,opacity:animation.tween(1,0,at,280,"outCubic")});
  var from = seriesRect(vp,index,at);
  var target = pack.tearRect(layout.contentTop(vp));
  var rect = {x:animation.tween(from.x,target.x,at,pack.OPEN_MS,"inOutCubic"),
    y:animation.tween(from.y,target.y,at,pack.OPEN_MS,"inOutCubic"),
    w:animation.tween(from.w,target.w,at,pack.OPEN_MS,"inOutCubic"),
    h:animation.tween(from.h,target.h,at,pack.OPEN_MS,"inOutCubic")};
  paintSeriesPacket(s,rect,1,animation.tween(1,0,at+160,260,"outCubic"));
  return {zones:[],contentH:layout.contentH(vp)};
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
 * 在包面任意位置、任意方向划动都有效，位移推进封口剥离。
 * 累计到原来的距离才撕通，松手保持原有回弹；不要求对齐封口。
 *
 * 之前那个版本把上半张绕撕口转了 35°，看起来像翻书页而不是撕纸，
 * 所以这里改成：已经撕下来的那一条**整条抬起来**跟着手指走，
 * 撕通之后再飘走 —— 全程只有一个平移，没有任何旋转。
 */
function renderTear(vp, state, anim) {
  var zones = [];
  var top = layout.contentTop(vp);
  var p = pack.clamp01(anim.p || 0); // 撕口走过包口全长的比例
  var fin = anim.doneAt ? pack.clamp01((now() - anim.doneAt) / (anim.finishMs || pack.TEAR_FINISH_MS)) : 0;
  var s = pack.seriesOf(anim.series);
  var c = draw.getCtx();
  var opacity = c.globalAlpha;

  var packet = pack.tearRect(top);
  var w = packet.w;
  var h = packet.h;
  var cx = W / 2;
  var x0 = packet.x;
  var y0 = packet.y;
  var cw = w;
  var ch = h;
  var exit = tearFlight.packet(fin);

  // 从真正的封口剥离；起手位置无需与它对齐，闭合时不画撕线。
  var seamY = y0 + packetSurface.SEAM;
  var direction = anim.tearDirection === -1 ? -1 : 1;
  var amp = 0.9 + p * 1.8; // 锯齿随进度变粗，撕口「裂长」
  var seed = (s.id.charCodeAt(0) || 1) * 0.37;
  var tearX = x0 + cw * (direction > 0 ? p : 1-p);
  var tornLeft = direction > 0 ? x0 : tearX;
  var tornRight = direction > 0 ? tearX : x0+cw;

  // Cards leave the mouth separately, then converge on the unchanged ring slots.
  if (fin > 0) {
    tearFlights.forEach(function(flight) {
      var frame = tearFlight.sample(flight,fin);
      if (frame.opacity <= 0) return;
      c.save(); c.translate(frame.x,top+frame.y); c.rotate(frame.rotation*Math.PI/180);
      c.scale(frame.scaleX,frame.scaleY); c.globalAlpha *= frame.opacity;
      cardBack(-46,-69,92,138,9,s,1); c.restore();
    });
  }

  if (fin > 0) {
    var mouth = {x:x0,y:seamY-6,w:cw,h:12};
    var paper = animation.progress(anim.doneAt,pack.TEAR_FINISH_MS);
    effects.halo(mouth, s.accent, Math.sin(paper*Math.PI)*0.10);
    effects.burst(mouth, paper, s.accent, seed, 6);
  }

  /* 撕口后面那团光：外景已经整页铺好了（见 backdrop.js），这里只补系列色 */
  if (typeof c.createRadialGradient === "function") {
    var gx = x0 + cw * (direction > 0 ? 0.5*p : 1-0.5*p);
    var g = c.createRadialGradient(gx, seamY, 0, gx, seamY, 140 + p * 70);
    g.addColorStop(0, s.accent);
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.save();
    c.globalAlpha = opacity * (0.02 + p * 0.06) * exit.opacity;
    c.fillStyle = g;
    c.fillRect(0, top - 40, W, 440);
    c.restore();
  }

  /** 有生成图就贴图，没有就退回渐变 */
  function body(img) {
    packetSurface.draw(c,img,packet,s,{shadow:false,tilt:anim.tilt || 0});
  }

  var img = assets.pack(s.id);

  // 只旋转还连着的包身；已撕下的纸条在这个作用域外保持平移。
  c.save();
  c.translate(cx, y0 + ch / 2 + exit.drop);
  c.rotate((anim.tilt || 0) * Math.PI / 180);
  c.scale(exit.scale,exit.scale);
  c.translate(-cx, -(y0 + ch / 2));
  c.globalAlpha *= exit.opacity;
  packetSurface.draw(c,img,packet,s,{shadowOnly:true,tilt:anim.tilt || 0});

  if (p > 0) packetSurface.interior(c,{x:x0-5,y:seamY-20,w:160,h:40},s,Math.min(1,p*2));
  if (p <= 0) {
    body(img);
  } else {
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
  c.restore();

  /* --- 撕口以上、还没撕到的那一段（右边）：也留着 --- */
  if (p < 1) {
    c.save();
    c.beginPath();
    var keepLeft = direction > 0 ? tearX : x0;
    var keepRight = direction > 0 ? x0+cw : tearX;
    c.moveTo(keepLeft,y0-2);c.lineTo(keepRight,y0-2);
    c.lineTo(keepRight,seamY+tearOffset((keepRight-x0)/cw,amp,seed));
    for (var j = TEAR_SEGS; j >= 0; j--) {
      var tj = j / TEAR_SEGS;
      if (x0+cw*tj < keepLeft || x0+cw*tj > keepRight) continue;
      c.lineTo(x0 + cw * tj, seamY + tearOffset(tj, amp, seed));
    }
    c.lineTo(keepLeft,seamY+tearOffset((keepLeft-x0)/cw,amp,seed));
    c.closePath();
    c.clip();
    body(img);
    c.restore();
  }

  }

  /* --- 留在包上的那侧撕口：一条发亮的边 + 翘起的纤维 --- */
  if (p > 0.02) {
    var edgeA = Math.cos(((p - 0.02) / 0.98) * Math.PI * 0.5); // 越接近撕通越淡
    c.save();
    c.globalAlpha = opacity * Math.max(0.12, edgeA) * 0.34;
    c.strokeStyle = s.accent;
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(tornLeft,seamY+tearOffset((tornLeft-x0)/cw,amp,seed));
    for (var m = 1; m <= TEAR_SEGS; m++) {
      var tm = m / TEAR_SEGS;
      if (x0+cw*tm < tornLeft || x0+cw*tm > tornRight) continue;
      c.lineTo(x0 + cw * tm, seamY + tearOffset(tm, amp, seed));
    }
    c.stroke();
    c.restore();
  }

  c.restore();

  /* --- 已经撕下来的那一条：整条抬起来，跟着手指往右上方走 --- */
  if (p > 0) {
    var dx = (6 + p * 22) * direction; // 与横向拉扯方向一致，纸条不旋转
    var paperP = anim.doneAt ? animation.progress(anim.doneAt,pack.TEAR_FINISH_MS) : 0;
    var dy = -4 - p * 16 - paperP * 90; // 往上飘
    var a = opacity * (1 - paperP) * (1 - p * 0.05);

    c.save();
    c.globalAlpha = a;
    c.translate(dx, dy);
    c.beginPath();
    c.moveTo(tornLeft,y0-2);
    c.lineTo(tornRight,y0-2);
    c.lineTo(tornRight,seamY+tearOffset((tornRight-x0)/cw,amp,seed));
    for (var k = TEAR_SEGS; k >= 0; k--) {
      var tk = k / TEAR_SEGS;
      var sx = x0 + cw * tk;
      if (sx < tornLeft || sx > tornRight) continue;
      c.lineTo(sx, seamY + tearOffset(tk, amp, seed));
    }
    c.closePath();
    c.clip();
    body(img);

    // 这条纸的下沿毛边：白纤维，纸被撕开就是这个样子
    c.globalAlpha = a * 0.8;
    c.strokeStyle = "rgba(255,255,255,0.36)";
    c.lineWidth = 0.8;
    c.beginPath();
    for (var f = 0; f <= TEAR_SEGS; f++) {
      var tf = f / TEAR_SEGS;
      var fx = x0 + cw * tf;
      if (fx < tornLeft || fx > tornRight) continue;
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


  var hint =
    fin > 0 ? "撕开了" : p <= 0.01 ? "划动卡包，撕开包装" : p < 1 ? "继续划开…" : "撕开了";
  draw.text(hint, W / 2, y0 + ch + 54, {
    size: 12,
    color: theme.muted,
    align: "center",
    alpha: fin > 0 ? 0 : opacity * exit.opacity,
  });

  return { zones: zones, contentH: layout.contentH(vp) };
}

/** The complete transparent PAG packet replaces, rather than doubles, the Canvas packet. */
function renderTearFinish(vp, state, anim) {
  var top = layout.contentTop(vp);
  var s = pack.seriesOf(anim.series);
  var finish = animation.progress(anim.doneAt, anim.finishMs);
  if (anim.finishMode === "pag" && pagTear.paint(draw.getCtx(), anim.doneAt, s,
      {x:0,y:top,w:tearTemplate.width,h:tearTemplate.height,direction:anim.tearDirection || 1}, finish)) {
    return {zones:[],contentH:layout.contentH(vp)};
  }
  return renderTear(vp, state, anim);
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
  return animation.tween(0, 1, at, pack.FLIP_MS, "inOutCubic");
}

/** 正在翻面吗（需要连续出帧） */
function anyFlipping(state) {
  var at = state.pickedAt || {};
  for (var id in at) {
    if (now() - at[id] < (pack.FLIP_MS || 420)) return true;
  }
  return false;
}

/** 卡底的柔和接触阴影：侧转时收窄，远处更淡，始终保持扁椭圆。 */
function cardShadow(slot, w, h) {
  var c = draw.getCtx();
  if (typeof c.createRadialGradient !== "function") return;
  var rx = w * slot.wscale * 0.46;
  var ry = Math.min(10 * slot.scale, rx * 0.24);
  if (rx <= 0 || ry <= 0) return;
  c.save();
  c.globalAlpha *= 0.10 + pack.clamp01(slot.depth) * 0.22;
  c.translate(slot.x, slot.y + h / 2);
  c.scale(rx, ry);
  var shadow = c.createRadialGradient(0, 0, 0, 0, 0, 1);
  shadow.addColorStop(0, "rgba(0,0,0,0.64)");
  shadow.addColorStop(0.30, "rgba(0,0,0,0.38)");
  shadow.addColorStop(0.65, "rgba(0,0,0,0.11)");
  shadow.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = shadow;
  c.fillRect(-1, -1, 2, 2);
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
    c.globalAlpha *= slot.alpha == null ? 1 : slot.alpha;

    if (on) {
      // 正反两面都按同一透视宽度缩放，过中点才换卡面。
      var p = flipOf(state, role.id);
      var k = Math.max(0.015, Math.abs(Math.cos(p * Math.PI)));
      var pop = 1 + Math.sin(p * Math.PI) * 0.06;
      c.save();
      c.scale(k, pop);
      if (p < 0.5) {
        cardBack(-cw / 2, -ch / 2, cw, ch, 14, s, 1);
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
      c.restore();
      effects.burst({ x: -cw / 2, y: -ch / 2, w: cw, h: ch },
        animation.progress(state.pickedAt[role.id] + pack.FLIP_MS / 2, 660),
        role.accent || theme.gold, slot.i + 1, 10);
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
  var hintY = Math.min(top + pack.RING.cyOff + pack.RING.ry + pack.RING.cardH / 2 + 26, layout.contentBottom(vp) - 36);
  var front = list[list.length - 1];
  var frontRole = front && state.offer[front.i];
  if (frontRole) {
    // A short viewport keeps the caption readable above navigation without moving the ring.
    if (hintY < front.y + front.h * front.scale / 2 + 18) {
      fillRound(PAD, hintY - 21, layout.innerW(), 48, 12, theme.bg);
    }
    draw.text(frontRole.name, W / 2, hintY, {
      size: 14, weight: "600", serif: true, color: theme.gold, align: "center",
    });
    draw.text("第 " + (front.i + 1) + " / " + state.offer.length + " 张", W / 2, hintY + 18, {
      size: 10.5, color: theme.muted, align: "center",
    });
  }
  c.save();
  c.globalAlpha *= 0.28;
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
  // 最后一张翻完之前继续画整个环，不能把等待时间画成三张静止的卡背。
  if (now() < anim.at) return renderRing(vp, state, anim);
  var top = layout.contentTop(vp);
  var targetTop = layout.pickTop(vp);
  var c = draw.getCtx();
  var picked = pickedRolesOf(state);
  // 冻结起飞位置，飞行过程中不再跟随环的漂浮重新算起点。
  var list = pack.ring(state.offer.length, spinOf(state), top, anim.at);
  var from = {};
  list.forEach(function (slot) {
    var role = state.offer[slot.i];
    if (role) from[role.id] = slot;
  });
  draw.text("三张候选", W / 2, targetTop + 8, {
    size: 12, color: theme.muted, align: "center",
  });
  picked.forEach(function (role, i) {
    var dst = layout.pickCardRect(i);
    var start = from[role.id] || { x: W / 2, y: top + 220, w: dst.w, h: dst.h, scale: 0.8, wscale: 1 };
    var x = animation.tween(start.x, dst.x + dst.w / 2, anim.at, pack.TOP_MS, "outBack");
    var y = animation.tween(start.y, targetTop + dst.y + dst.h / 2, anim.at, pack.TOP_MS, "outBack");
    var cw = animation.tween(start.w * start.scale * start.wscale, dst.w, anim.at, pack.TOP_MS, "outCubic");
    var ch = animation.tween(start.h * start.scale, dst.h, anim.at, pack.TOP_MS, "outCubic");
    c.save();
    c.translate(x, y);
    c.scale(cw / dst.w, ch / dst.h);
    // 卡片已经在环上翻过，保持正面连续飞到候选位。
    cardFace(-dst.w / 2, -dst.h / 2, dst.w, dst.h, 12, role, {
      emojiSize: 30, nameSize: 15, taglineSize: 9,
    });
    c.restore();
  });
  return { zones: [], contentH: layout.pickContentH(), done: animation.progress(anim.at, pack.TOP_MS) >= 1 };
}

/* ---------------- 阶段五：从三张里选一张 ---------------- */

function renderPick(vp, state) {
  var zones = [];
  var top = layout.pickTop(vp);
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
  var ib = layout.pickIntroRect();
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

/* ---------------- 阶段六：落定揭晓 ---------------- */

function renderReveal(vp, state, anim) {
  var c = draw.getCtx();
  var role = state.draw.role;
  var top = layout.contentTop(vp);
  var available = layout.contentH(vp);
  var source = layout.pickCardRect(anim.slotIndex || 0);
  var height = Math.min(270, available * 0.58);
  var width = height * 2 / 3;
  var curve = "outCubic";
  var x = animation.tween(source.x + source.w / 2, W / 2, anim.at, pack.REVEAL_FOCUS_MS, curve);
  var y = animation.tween(layout.pickTop(vp) + source.y + source.h / 2 - 6, top + available * 0.42, anim.at, pack.REVEAL_FOCUS_MS, curve);
  var w = animation.tween(source.w, width, anim.at, pack.REVEAL_FOCUS_MS, curve);
  var h = animation.tween(source.h, height, anim.at, pack.REVEAL_FOCUS_MS, curve);
  var fade = animation.tween(1, 0, anim.at + pack.REVEAL_MS - 180, 180, "inOutCubic");
  var rect = { x: x - w / 2, y: y - h / 2, w: w, h: h, r: 16 };
  var accent = role.accent || theme.gold;

  c.save();
  c.beginPath();
  c.rect(0, 0, W, layout.contentBottom(vp));
  c.clip();
  c.globalAlpha *= fade;
  c.fillStyle = theme.bg;
  c.fillRect(0, 0, W, layout.contentBottom(vp));
  var pagPainted = pagReveal.paint(c, anim, role, { x: x, y: y, w: w, h: h }, animation.progress(anim.at, pack.REVEAL_MS));
  if (!pagPainted) {
    effects.halo(rect, accent, animation.tween(0, 1, anim.at, 300));
    c.save();
    c.translate(x, y);
    c.scale(w / width, h / height);
    cardFace(-width / 2, -height / 2, width, height, 16, role, {
      emojiSize: 64, nameSize: 24, taglineSize: 11, border: accent, borderWidth: 2,
    });
    c.restore();
    effects.sweep(rect, animation.progress(anim.at + 220, 500));
    effects.burst(rect, animation.progress(anim.at + 100, 820), accent, (role.id || "").length + 1);
  }
  draw.text("今天，成为" + role.name, W / 2, top + available * 0.77, {
    size: 17, weight: "600", serif: true, color: theme.text, align: "center",
  });
  draw.text("点击继续", W / 2, top + available * 0.85, {
    size: 11, color: theme.muted, align: "center",
    alpha: fade * animation.tween(0, 1, anim.at + pack.REVEAL_FOCUS_MS, 180),
  });
  c.restore();
  return {
    zones: [{ id: "reveal", rect: { x: 0, y: top, w: W, h: available } }],
    contentH: available,
  };
}

/* ---------------- 入口 ---------------- */

/** 按阶段画，返回 { zones, contentH, done } */
function render(vp, state) {
  var anim = state.anim || {};
  var kind = anim.kind || "pack";
  if (kind === "reveal" && state.draw) return renderReveal(vp, state, anim);
  if (!state.offer || !state.offer.length) {
    return { zones: [], contentH: layout.contentH(vp) };
  }
  if (kind === "opening") return renderOpening(vp, state, anim);
  if (kind === "tear") return renderTear(vp, state, anim);
  if (kind === "tearFinish") return renderTearFinish(vp, state, anim);
  if (kind === "ring") return renderRing(vp, state, anim);
  if (kind === "top") return renderTop(vp, state, anim);
  if (kind === "pick") return renderPick(vp, state);
  return renderSeriesPick(vp, state);
}

/** 过场还在动吗（需要连续出帧） */
function busy(state) {
  var anim = state.anim || {};
  if (anim.kind === "opening") return since(anim) < pack.OPEN_MS;
  if (anim.kind === "tear") {
    // 撕开等玩家划；但撕通之后那条纸还在飘，这一段要连着出帧
    return Boolean(anim.doneAt) && now() - anim.doneAt < pack.TEAR_FINISH_MS;
  }
  if (anim.kind === "tearFinish") return now() - anim.doneAt < anim.finishMs;
  if (anim.kind === "reveal") return since(anim) < pack.REVEAL_MS;
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
