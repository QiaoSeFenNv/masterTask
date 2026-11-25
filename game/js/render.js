/**
 * 绘制层。读 store.state,把界面画到 canvas 上。
 * 不修改状态,只画。
 */

var draw = require("./draw.js");
var layout = require("./layout.js");
var animation = require("./animation.js");
var theme = require("./theme.js");
var env = require("./env.js");

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

/** 已抽卡:卡面 + 任务 + 手记 + 页脚 */
function renderDrawn(vp, state, y) {
  var zones = [];
  var d = state.draw;
  var role = d.role;

  /* 卡面 */
  var card = layout.todayCardRect();
  card.y = y;

  draw.clipRoundRect(card.x, card.y, card.w, card.h, card.r);
  gradientFill(card, role.gradient || [theme.packTop, theme.packBottom], 150, 0);
  draw.getCtx().globalAlpha = 0.16;
  gradientFill(
    { x: card.x, y: card.y, w: card.w, h: card.h * 0.5 },
    ["#ffffff", role.gradient ? role.gradient[0] : theme.packTop],
    180,
    0,
  );
  draw.getCtx().globalAlpha = 1;
  draw.restore();

  /* 角标 */
  var cn = 26;
  stroke(
    { x: card.x + 14, y: card.y + 14, w: cn, h: cn },
    "rgba(255,255,255,0.32)",
    2,
    1,
  );
  stroke(
    { x: card.x + card.w - 14 - cn, y: card.y + card.h - 14 - cn, w: cn, h: cn },
    "rgba(255,255,255,0.32)",
    2,
    1,
  );

  draw.text(role.emoji || "🎴", card.x + card.w / 2, card.y + 78, {
    size: 58,
    align: "center",
  });
  draw.text(role.name || "", card.x + card.w / 2, card.y + 136, {
    size: 40,
    weight: "600",
    serif: true,
    color: "#ffffff",
    align: "center",
    shadow: { color: "rgba(0,0,0,0.35)", blur: 10, y: 2 },
  });
  draw.fillRect(card.x + card.w / 2 - 20, card.y + 152, 40, 1, role.accent || theme.gold);

  zones.push({ id: "card", rect: card, radius: card.r });

  /* 任务 */
  d.tasks.forEach(function (t, i) {
    var r = layout.todayTaskRect(i);
    r.y = y + r.y;
    fill(r, theme.softFill, r.r);
    stroke(r, theme.softBorder, r.r, 1);

    var cx = r.x + 20;
    var cy = r.y + r.h / 2;
    draw.circle(
      cx,
      cy,
      8,
      t.done ? theme.gold : "transparent",
      t.done ? theme.gold : theme.checkOff,
      1.5,
    );
    if (t.done) {
      draw.text("✓", cx, cy + 4, { size: 11, color: theme.onGold, align: "center", weight: "700" });
    }

    var textColor = t.done ? theme.muted : theme.taskText;
    draw.wrapText(t.text, r.x + 40, r.y + 24, r.w - 56, 17, {
      size: 12.5,
      color: textColor,
      maxLines: 2,
    });

    if (t.tag) {
      var tw = draw.measure(t.tag, 9.5) + 12;
      draw.roundRect(r.x + r.w - tw - 12, r.y + 9, tw, 15, 4);
      draw.getCtx().fillStyle = theme.tagFill;
      draw.getCtx().fill();
      draw.text(t.tag, r.x + r.w - tw / 2 - 12, r.y + 20, {
        size: 9.5,
        color: theme.purple,
        align: "center",
      });
    }

    var noteW = r.w - 56;
    if (t.note) {
      draw.wrapText("「" + t.note + "」", r.x + 40, r.y + 46, noteW, 14, {
        size: 10.5,
        color: theme.faint,
        maxLines: 1,
      });
    }

    zones.push({ id: "task", taskId: t.id, rect: r, radius: r.r });
  });

  /* 手记 */
  var note = layout.todayNoteRect(d.tasks.length);
  note.y = y + note.y;
  fill(note, theme.softFill, note.r);
  stroke(note, theme.softBorder, note.r, 1);

  draw.text("今日手记", note.x + 16, note.y + 26, {
    size: 11.5,
    color: theme.muted,
  });

  var draft = state.noteDraft || "";

  // 右上角:胶囊按钮,点一下调系统输入
  var editRect = { x: note.x + note.w - 78, y: note.y + 12, w: 62, h: 24, r: 12 };
  fill(editRect, theme.editFill, editRect.r);
  draw.text(draft ? "编辑" : "写一句", editRect.x + editRect.w / 2, editRect.y + 16, {
    size: 11,
    color: theme.purple,
    align: "center",
  });

  if (draft) {
    draw.wrapText(draft, note.x + 16, note.y + 54, note.w - 32, 19, {
      size: 12.5,
      color: theme.noteText,
      maxLines: 4,
    });
  } else {
    draw.text("还没有写。", note.x + 16, note.y + 54, {
      size: 12.5,
      color: theme.faint,
    });
    draw.text("记一句今天最想记住的话。", note.x + 16, note.y + 76, {
      size: 12.5,
      color: theme.faint,
    });
  }

  zones.push({ id: "note", rect: note, radius: note.r });

  /* 页脚 */
  var foot = layout.todayFootRect(d.tasks.length);
  foot.y = y + foot.y;
  draw.fillRect(foot.x, foot.y, foot.w, 1, theme.line);
  draw.text(
    d.doneCount + " / " + d.tasks.length + " 已完成",
    PAD,
    foot.y + 20,
    { size: 12, color: theme.muted },
  );
  draw.text(
    (d.role.tagline || "") + " · " + layout.monthDay(d.date),
    W - PAD,
    foot.y + 20,
    { size: 12, color: theme.faint, align: "right" },
  );

  /* 重新抽卡：只有服务端放开时（测试环境）才出现 */
  if (state.canRedraw) {
    // 和 note / foot 一样，布局给的是相对内容顶部的坐标，这里加上 y
    var rb = layout.redrawButtonRect(d.tasks.length);
    rb.y = y + rb.y;
    fill(rb, theme.idleBtn, rb.r);
    stroke(rb, theme.frame, rb.r, 1);
    draw.text(state.shifting ? "重新发牌中…" : "重新抽一次", rb.x + rb.w / 2, rb.y + rb.h / 2 + 4, {
      size: 12.5,
      color: theme.gold,
      align: "center",
    });
    if (!state.shifting) zones.push({ id: "redraw", rect: rb, radius: rb.r });
    return {
      zones: zones,
      contentH: layout.todayContentHWithRedraw(d.tasks.length, true),
    };
  }

  return { zones: zones, contentH: layout.todayContentH(d.tasks.length) };
}

/* ==================== 日历 ==================== */

var WEEK = ["一", "二", "三", "四", "五", "六", "日"];

function renderCalendar(vp, state) {
  var zones = [];
  var cal = state.calendar;
  var top = layout.contentTop(vp);

  if (cal.loading) {
    draw.text("正在翻日历…", W / 2, top + 60, {
      size: 14,
      color: theme.muted,
      align: "center",
    });
    return { zones: zones, contentH: layout.contentH(vp) };
  }
  if (cal.error) {
    draw.text("日历加载失败", W / 2, top + 60, {
      size: 14,
      color: theme.body,
      align: "center",
    });
    return { zones: zones, contentH: layout.contentH(vp) };
  }

  var navY = top + 6;
  var prev = { x: PAD, y: navY, w: 34, h: 30, r: 15 };
  var next = { x: W - PAD - 34, y: navY, w: 34, h: 30, r: 15 };
  fill(prev, theme.navFill, prev.r);
  fill(next, theme.navFill, next.r);
  draw.text("‹", prev.x + 17, navY + 21, {
    size: 18,
    color: theme.body,
    align: "center",
  });
  draw.text("›", next.x + 17, navY + 21, {
    size: 18,
    color: theme.body,
    align: "center",
  });
  zones.push({ id: "prev-month", rect: prev, radius: prev.r });
  zones.push({ id: "next-month", rect: next, radius: next.r });

  draw.text(cal.year + " 年 " + cal.month + " 月", W / 2, navY + 20, {
    size: 15,
    weight: "600",
    color: theme.text,
    align: "center",
  });
  draw.text("连续 " + cal.streak + " 天", W / 2, navY + 38, {
    size: 11,
    color: theme.muted,
    align: "center",
  });

  var cellW = layout.innerW() / layout.CAL_COLS;
  for (var w = 0; w < WEEK.length; w++) {
    draw.text(WEEK[w], PAD + w * cellW + cellW / 2, top + 98, {
      size: 11,
      color: theme.faint,
      align: "center",
    });
  }

  var grid = top + 108;
  cal.cells.forEach(function (cell, i) {
    if (cell.type !== "day") return;
    var b = layout.calendarCellRect(i);
    var r = { x: b.x, y: grid + b.y - layout.calendarGridTop(), w: b.w, h: b.h, r: b.r };

    if (cell.entry) {
      gradientFill(r, cell.entry.gradient, 150, r.r);
      draw.text(cell.entry.emoji || "", r.x + r.w / 2, r.y + r.h / 2 + 10, {
        size: 21,
        align: "center",
      });
      draw.text(String(cell.day), r.x + 5, r.y + 14, {
        size: 9,
        color: "rgba(255,255,255,0.72)",
      });
    } else {
      fill(r, cell.future ? theme.futureFill : theme.softFill, r.r);
      draw.text(String(cell.day), r.x + r.w / 2, r.y + r.h / 2 + 4, {
        size: 12,
        color: cell.future ? theme.faint : theme.muted,
        align: "center",
      });
    }
    if (cell.isToday) stroke(r, theme.gold, 1.5);

    zones.push({ id: "day", date: cell.date, entry: cell.entry, rect: r, radius: r.r });
  });

  var rows = Math.ceil(cal.cells.length / layout.CAL_COLS);
  return { zones: zones, contentH: layout.calendarContentH(rows) + 40 };
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

    if (card.owned) {
      gradientFill(r, card.gradient, 150, r.r);
      draw.text(card.emoji, r.x + r.w / 2, r.y + r.h * 0.45, {
        size: 34,
        align: "center",
      });
      draw.text(card.name, r.x + r.w / 2, r.y + r.h * 0.7, {
        size: 15,
        weight: "600",
        serif: true,
        color: "#ffffff",
        align: "center",
        shadow: { color: "rgba(0,0,0,0.35)", blur: 8, y: 1 },
      });
      draw.text(card.times + " 次", r.x + r.w / 2, r.y + r.h * 0.84, {
        size: 10,
        color: "rgba(255,255,255,0.75)",
        align: "center",
      });
    } else {
      fill(r, theme.lockedFill, r.r);
      stroke(r, theme.softBorder, 1);
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
