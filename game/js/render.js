/**
 * 绘制层。读 store.state,把界面画到 canvas 上。
 * 不修改状态,只画。
 */

var draw = require("./draw.js");
var layout = require("./layout.js");
var animation = require("./animation.js");
var theme = require("./theme.js");
var env = require("./env.js");
var todayCard = require("./today-card.js");
var cardface = require("./cardface.js");
var roleArt = require("./role-art.js");

var W = layout.W;
var PAD = layout.PAD;

/* ---------------- 基础块 ---------------- */

function fill(rect, color, radius) {
  var c = draw.getCtx();
  if (radius) {
    draw.roundRect(rect.x, rect.y, rect.w, rect.h, radius);
    c.fillStyle = color;
    c.fill();
  } else {
    draw.fillRect(rect.x, rect.y, rect.w, rect.h, color);
  }
}

function stroke(rect, color, radius, width) {
  draw.strokeRoundRect(rect.x, rect.y, rect.w, rect.h, radius || 0, color, width || 1);
}

function gradientFill(rect, colors, angle, radius) {
  draw.fillGradientRect(rect.x, rect.y, rect.w, rect.h, colors, angle, radius || 0);
}

/** 顶部状态栏 + 标题，返回标题基线 y */
function header(vp, title, sub) {
  draw.text(title, PAD, vp.safeTop + 40, {
    size: 26,
    weight: "600",
    serif: true,
    color: theme.text,
  });
  if (sub) {
    // 右侧留给「换背景」按钮，副标题在它左边
    var rightEdge = layout.bgButtonRect(vp).x - 10;
    draw.text(sub, rightEdge, vp.safeTop + 40, {
      size: 12.5,
      color: theme.muted,
      align: "right",
    });
  }
}

/** 右上角的「换背景」按钮:显示当前模式,点一下循环 */
function renderBgButton(vp, rect, bg) {
  var c = draw.getCtx();
  var label = bg.label();
  c.save();
  c.beginPath();
  draw.roundRect(rect.x, rect.y, rect.w, rect.h, rect.r);
  c.fillStyle = theme.softFill;
  c.fill();
  c.strokeStyle = theme.frame;
  c.lineWidth = 1;
  c.stroke();
  c.restore();
  draw.text(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 4, {
    size: 10.5,
    color: theme.purple,
    align: "center",
  });
}

/* ---------------- TabBar ---------------- */

var TABS = [
  { id: "today", label: "今日" },
  { id: "calendar", label: "日历" },
  { id: "collection", label: "图鉴" },
];

function tabbarRects(vp) {
  var h = layout.tabbarH();
  var y = vp.height - vp.safeBottom - h;
  var w = W / TABS.length;
  return TABS.map(function (t, i) {
    return { id: t.id, label: t.label, x: i * w, y: y, w: w, h: h, r: 0 };
  });
}

function renderTabbar(vp, active) {
  var rects = tabbarRects(vp);
  var top = rects[0].y;
  draw.fillRect(0, top, W, vp.safeBottom + layout.tabbarH(), theme.tabbarFill);
  draw.fillRect(0, top, W, 1, theme.line);

  rects.forEach(function (r) {
    var on = r.id === active;
    draw.text(r.label, r.x + r.w / 2, top + 30, {
      size: 14,
      color: on ? theme.gold : theme.muted,
      align: "center",
      weight: on ? "600" : "400",
    });
    if (on) {
      draw.circle(r.x + r.w / 2, top + 46, 2, theme.gold);
    }
  });
  return rects;
}

/* ---------------- 圆角矩形内的文本 ---------------- */

function labelInRect(rect, text, opts) {
  var o = opts || {};
  draw.text(text, rect.x + (o.padX == null ? 14 : o.padX), rect.y + rect.h / 2 + (o.dy || 4), {
    size: o.size || 13,
    color: o.color || theme.muted,
    align: o.align || "left",
    weight: o.weight,
    serif: o.serif,
  });
}

/* ---------------- 今日 ---------------- */

function renderToday(vp, state) {
  var top = layout.contentTop(vp);
  var scroll = state.scroll;

  if (state.status === "loading") {
    draw.text("正在查看今天…", W / 2, top + 40, {
      size: 14,
      color: theme.muted,
      align: "center",
    });
    return [];
  }

  if (state.status === "error") {
    draw.text("加载失败", W / 2, top + 30, {
      size: 15,
      color: theme.body,
      align: "center",
    });
    draw.text(state.error || "", W / 2, top + 56, {
      size: 12,
      color: theme.faint,
      align: "center",
    });
    return [];
  }

  if (!state.draw) {
    if (state.offer && state.offer.length) return []; // 开卡包过场由 packview 画
    return renderIdle(vp, state);
  }
  return renderDrawn(vp, state, top - scroll);
}


/** 兜底:候选没拿到(老服务端/接口异常)时给一个重新加载入口 */
function renderIdle(vp, state) {
  var zones = [];
  var top = layout.contentTop(vp);
  var pack = layout.idlePackRect();
  pack.y = top;

  gradientFill(pack, [theme.packTop, theme.packMid, theme.packBottom], 160, pack.r);
  stroke(pack, theme.frame, pack.r, 1);
  stroke(
    { x: pack.x + 18, y: pack.y + 18, w: pack.w - 36, h: pack.h - 36 },
    theme.idleInner,
    14,
    1,
  );

  draw.text("?", pack.x + pack.w / 2, pack.y + pack.h / 2 + 42, {
    size: 132,
    color: theme.idleQ,
    align: "center",
    serif: true,
  });
  draw.fillRect(pack.x + pack.w / 2 - 40, pack.y + pack.h - 74, 80, 1, theme.idleRule);
  draw.text("今天的牌还没到", pack.x + pack.w / 2, pack.y + pack.h - 34, {
    size: 12,
    color: theme.muted,
    align: "center",
  });

  var btn = layout.idleButtonRect();
  btn.y = top + 348;
  fill(btn, theme.idleBtn, btn.r);
  stroke(btn, theme.frame, btn.r, 1);
  draw.text("重新加载", btn.x + btn.w / 2, btn.y + btn.h / 2 + 5, {
    size: 15,
    weight: "600",
    color: theme.gold,
    align: "center",
  });
  zones.push({ id: "retry", rect: btn, radius: btn.r });

  return { zones: zones, contentH: layout.idleContentH() };
}

/** 已抽卡：以可旋转的双面角色卡作为今日页主体。 */
function renderDrawn(vp, state) {
  return todayCard.render(vp, state);
}

/* ==================== 日历 ==================== */

var WEEK = ["一", "二", "三", "四", "五", "六", "日"];

function renderCalendar(vp, state) {
  var zones=[],cal=state.calendar,top=layout.contentTop(vp);
  if(cal.loading || cal.error) {
    draw.text(cal.error?'日历加载失败':'正在翻日历…',W/2,top+60,
      {size:14,color:theme.bodyBright,align:'center'});
    if(cal.error) zones.push({id:'retry-calendar',rect:{x:PAD,y:top+30,w:layout.innerW(),h:70}});
    return {zones:zones,contentH:layout.contentH(vp)};
  }
  var navY=top+2;
  var prev={x:PAD,y:navY,w:38,h:38,r:19};
  var next={x:W-PAD-38,y:navY,w:38,h:38,r:19};
  draw.text('‹',prev.x+19,navY+27,{size:26,color:theme.bodyBright,align:'center'});
  draw.text('›',next.x+19,navY+27,{size:26,color:theme.bodyBright,align:'center'});
  zones.push({id:'prev-month',rect:prev},{id:'next-month',rect:next});
  draw.text(cal.year+' 年 '+cal.month+' 月',W/2,navY+25,
    {size:18,weight:'600',serif:true,color:theme.text,align:'center'});
  var cellW=layout.innerW()/layout.CAL_COLS;
  WEEK.forEach(function(day,i) {
    draw.text(day,PAD+i*cellW+cellW/2,top+61,{size:11,color:theme.muted,align:'center'});
  });
  var gridTop=top+layout.calendarGridTop()-4;
  var gridBottom=layout.contentBottom(vp)-32;
  draw.clipRect(0,gridTop,W,Math.max(0,gridBottom-gridTop));
  cal.cells.forEach(function(cell,i) {
    if(cell.type!=='day') return;
    var r=layout.calendarCellRect(i);r.y+=top-(state.scroll || 0);
    if(cell.entry) {
      cardface.paint(r.x,r.y,r.w,r.h,r.r,
        {name:cell.entry.roleName,emoji:cell.entry.emoji,gradient:cell.entry.gradient},
        {emojiSize:14,nameSize:7,tagline:false,border:'rgba(230,218,187,.32)',borderWidth:.65});
      // A quiet date corner, kept separate from the face artwork and role name.
      fill({x:r.x+2,y:r.y+2,w:14,h:12,r:3},'rgba(12,17,25,.40)',3);
      draw.text(String(cell.day),r.x+9,r.y+11,{size:8,color:'#ffffff',align:'center'});
    } else {
      draw.text(String(cell.day),r.x+r.w/2,r.y+r.h/2+4,
        {size:12,color:cell.future?theme.faint:theme.muted,align:'center'});
    }
    if(cell.isToday) {
      if(cell.entry) stroke({x:r.x-2,y:r.y-2,w:r.w+4,h:r.h+4},theme.gold,6,1);
      else stroke({x:r.x+r.w/2-14,y:r.y+r.h/2-14,w:28,h:28},theme.gold,14,1);
    }
    if(cell.entry && r.y+r.h>gridTop && r.y<gridBottom) {
      zones.push({id:'day',date:cell.date,entry:cell.entry,sourceRect:r,
        rect:{x:r.x,y:Math.max(r.y,gridTop),w:r.w,h:Math.min(r.y+r.h,gridBottom)-Math.max(r.y,gridTop)}});
    }
  });
  draw.restore();
  var hasCards=cal.cells.some(function(cell){return Boolean(cell.entry);});
  draw.text(hasCards?'点开一张，回看那天的角色':'每一天，都有新的可能',W/2,layout.contentBottom(vp)-9,
    {size:11,color:theme.bodyBright,align:'center'});
  return {zones:zones,contentH:layout.calendarContentH(Math.ceil(cal.cells.length/7))};
}

/* ==================== 图鉴 ==================== */

function renderCollection(vp, state) {
  var zones = [];
  var col = state.collection;
  var top = layout.contentTop(vp);

  if (col.loading) {
    draw.text("正在整理图鉴…", W / 2, top + 60, {
      size: 14,
      color: theme.muted,
      align: "center",
    });
    return { zones: zones, contentH: layout.contentH(vp) };
  }

  var owned = col.cards.filter(function (c) {
    return c.owned;
  }).length;

  draw.text("已解锁 " + owned + " / " + col.cards.length, PAD, top + 14, {
    size: 12,
    color: theme.muted,
  });

  var ratio = col.cards.length ? owned / col.cards.length : 0;
  var bar = { x: PAD, y: top + 24, w: layout.innerW(), h: 4, r: 2 };
  fill(bar, theme.navFill, bar.r);
  if (ratio > 0) {
    fill({ x: bar.x, y: bar.y, w: bar.w * ratio, h: bar.h, r: bar.r }, theme.gold, bar.r);
  }

  // Keep the summary fixed while the grid follows the scroll position.
  var listTop = top + 42;
  var listBottom = top + layout.contentH(vp);
  draw.clipRect(0, listTop, W, listBottom - listTop);
  col.cards.forEach(function (card, i) {
    var b = layout.collectionCardRect(i);
    var r = { x: b.x, y: top + b.y - (state.scroll || 0), w: b.w, h: b.h, r: b.r };

    // Do not decode offscreen/locked portraits; scroll clipping also bounds hit zones.
    if (r.y + r.h <= listTop || r.y >= listBottom) return;
    if (card.owned) {
      roleArt.paint(r, card);
    } else {
      fill(r, theme.lockedFill, r.r);
      stroke(r, theme.softBorder, r.r, 1);
      draw.text("?", r.x + r.w / 2, r.y + r.h * 0.48, {
        size: 30,
        serif: true,
        color: theme.lockedQ,
        align: "center",
      });
      draw.text("未解锁", r.x + r.w / 2, r.y + r.h * 0.75, {
        size: 11,
        color: theme.faint,
        align: "center",
      });
    }
    // Invisible parts of cards must not capture clicks on the summary or navigation.
    var hitTop = Math.max(listTop, r.y);
    var hitBottom = Math.min(listBottom, r.y + r.h);
    if (hitBottom > hitTop) {
      zones.push({ id: "card", card: card, rect: { x: r.x, y: hitTop, w: r.w, h: hitBottom - hitTop }, radius: r.r });
    }
  });
  draw.restore();

  return { zones: zones, contentH: layout.collectionContentH(col.cards.length) + 40 };
}

/* ==================== 详情弹层 ==================== */

function renderSheet(vp, state) {
  var sel = state.selected;
  if (!sel) return [];
  var zones = [];
  var sheet = layout.sheetRect(vp);
  var c = draw.getCtx();

  c.save();
  c.globalAlpha = 0.45;
  c.fillStyle = theme.scrim;
  c.fillRect(0, 0, W, vp.height);
  c.restore();

  fill(
    { x: 0, y: sheet.y, w: W, h: vp.height - sheet.y + 1 },
    theme.sheetFill,
    0
  );
  draw.fillRect(0, sheet.y, W, 1, theme.frame);

  if (sel.id) {
    var portrait = { x: PAD, y: sheet.y + 24, w: 84, h: 126, r: 10 };
    roleArt.paint(portrait, sel, { caption: false });
    var textX = PAD + portrait.w + 18;
    var textW = W - PAD - textX;
    draw.text(sel.name || "", textX, sheet.y + 52, {
      size: 22, weight: "600", serif: true, color: theme.text,
    });
    draw.wrapText(sel.tagline || "", textX, sheet.y + 78, textW, 18, {
      size: 12, color: theme.muted, maxLines: 2,
    });
    draw.text("共 " + sel.taskCount + " 条角色任务", textX, sheet.y + 122, {
      size: 11, color: theme.body,
    });
    draw.text("累计抽到 " + sel.times + " 次", textX, sheet.y + 143, {
      size: 11, color: theme.muted,
    });
    draw.wrapText(sel.intro || "", PAD, sheet.y + 180, W - PAD * 2, 19, {
      size: 12.5, color: theme.body, maxLines: 3,
    });
  } else {
    draw.text(sel.emoji || "", sheet.x + PAD, sheet.y + 56, { size: 30 });
    draw.text(sel.name || "", sheet.x + PAD + 44, sheet.y + 46, {
      size: 20,
      weight: "600",
      serif: true,
      color: theme.text,
    });
    draw.text(sel.tagline || "", sheet.x + PAD + 44, sheet.y + 66, {
      size: 11,
      color: theme.muted,
    });

    draw.wrapText(sel.intro || "", sheet.x + PAD, sheet.y + 100, sheet.w - PAD * 2, 19, {
      size: 12.5,
      color: theme.body,
      maxLines: 5,
    });

    if (sel.taskCount) {
      draw.text("共 " + sel.taskCount + " 条任务 · 被抽到 " + sel.times + " 次", sheet.x + PAD, sheet.y + 176, {
        size: 11,
        color: theme.faint,
      });
    } else if (sel.roleId) {
      draw.text("这一天的角色", sheet.x + PAD, sheet.y + 100, {
        size: 12,
        color: theme.muted,
      });
    }
  }

  var close = { x: W - PAD - 64, y: sheet.y + sheet.h - 46, w: 64, h: 30, r: 15 };
  fill(close, theme.closeFill, close.r);
  draw.text("关闭", close.x + close.w / 2, close.y + 20, {
    size: 12,
    color: theme.gold,
    align: "center",
  });
  zones.push({ id: "sheet-close", rect: close, radius: close.r });
  return zones;
}

/* ==================== 提示条 ==================== */

function renderToast(vp, state) {
  if (!state.toast) return;
  var age = animation.now() - (state.toastAt || 0);
  if (age > 2000) return;
  var alpha = animation.tween(1, 0, (state.toastAt || 0) + 1700, 300);
  var w = Math.min(layout.innerW(), draw.measure(state.toast, 12.5) + 40);
  var r = {
    x: (W - w) / 2,
    y: vp.height - vp.safeBottom - layout.tabbarH() - 58,
    w: w,
    h: 36,
    r: 18,
  };

  var c = draw.getCtx();
  c.save();
  c.globalAlpha = alpha;
  fill(r, theme.toastFill, r.r);
  stroke(r, theme.frame, 1);
  draw.text(state.toast, r.x + r.w / 2, r.y + 23, {
    size: 12.5,
    color: theme.toastText,
    align: "center",
  });
  c.restore();
}

module.exports = {
  header: header,
  tabbarRects: tabbarRects,
  renderTabbar: renderTabbar,
  renderToday: renderToday,
  renderIdle: renderIdle,
  renderDrawn: renderDrawn,
  renderDrawn: renderDrawn,
  renderCalendar: renderCalendar,
  renderCollection: renderCollection,
  renderSheet: renderSheet,
  renderToast: renderToast,
  renderBgButton: renderBgButton,
  fill: fill,
  stroke: stroke,
  gradientFill: gradientFill,
  labelInRect: labelInRect,
  TABS: TABS,
  WEEK: WEEK,
};
