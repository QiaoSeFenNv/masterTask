/**
 * 生成「今日角色」分享海报（canvas 2d）
 * 输出 750×1334 的图片，可直接预览 / 保存。
 */

const W = 750;
const H = 1334;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const chars = String(text).split("");
  let line = "";
  let lines = 0;
  for (let i = 0; i < chars.length; i++) {
    const test = line + chars[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = chars[i];
      y += lineHeight;
      lines += 1;
      if (lines >= maxLines) return y;
    } else {
      line = test;
    }
  }
  if (line) {
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}

function getCanvas(page) {
  return new Promise((resolve, reject) => {
    wx.createSelectorQuery()
      .in(page)
      .select("#posterCanvas")
      .fields({ node: true, size: true })
      .exec((res) => {
        const item = res && res[0];
        if (!item || !item.node) {
          reject(new Error("找不到画布节点"));
          return;
        }
        resolve(item.node);
      });
  });
}

function toTempFile(canvas) {
  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas,
      x: 0,
      y: 0,
      width: W,
      height: H,
      destWidth: W,
      destHeight: H,
      fileType: "png",
      success: (r) => resolve(r.tempFilePath),
      fail: reject,
    });
  });
}

function drawPoster(canvas, draw, taskViews) {
  const dpr = 2;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const role = draw.role;
  const grad = (role.gradient && role.gradient.length >= 2 ? role.gradient : ["#221a30", "#0d0a14"]);

  // ---------- 背景 ----------
  ctx.fillStyle = "#0e0b14";
  ctx.fillRect(0, 0, W, H);

  // 顶部角色渐变光晕
  const glow = ctx.createLinearGradient(0, 0, W, 700);
  glow.addColorStop(0, grad[0]);
  glow.addColorStop(0.55, grad[1]);
  glow.addColorStop(1, "#0e0b14");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, 760);

  // ---------- emoji ----------
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "150px sans-serif";
  ctx.fillText(role.emoji || "🎴", W / 2, 240);

  // ---------- 角色名 ----------
  ctx.fillStyle = "#ffffff";
  ctx.font = '700 86px "Songti SC", "STSong", serif';
  ctx.fillText(role.name, W / 2, 400);

  // ---------- 分隔线 ----------
  ctx.strokeStyle = role.accent || "#e8dcc8";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 46, 470);
  ctx.lineTo(W / 2 + 46, 470);
  ctx.stroke();

  // ---------- tagline ----------
  ctx.fillStyle = role.accent || "#e8dcc8";
  ctx.font = '28px -apple-system, "PingFang SC", sans-serif';
  ctx.fillText(role.tagline, W / 2, 522);

  // ---------- 任务区 ----------
  ctx.textAlign = "left";
  const boxTop = 610;
  const boxH = 470;

  ctx.fillStyle = "rgba(255,255,255,0.05)";
  roundRect(ctx, 56, boxTop, W - 112, boxH, 28);
  ctx.fill();

  ctx.fillStyle = "#8a8398";
  ctx.font = '22px -apple-system, "PingFang SC", sans-serif';
  ctx.fillText("今 日 任 务", 92, boxTop + 56);

  let y = boxTop + 116;
  const doneCount = taskViews.filter((t) => t.done).length;
  ctx.fillStyle = "#e8dcc8";
  ctx.font = '24px -apple-system, "PingFang SC", sans-serif';
  ctx.textAlign = "right";
  ctx.fillText(doneCount + " / " + taskViews.length, W - 92, boxTop + 56);
  ctx.textAlign = "left";

  const items = taskViews.slice(0, 4);
  for (let i = 0; i < items.length; i++) {
    const t = items[i];
    const rowTop = y;

    // 勾选圈
    ctx.beginPath();
    ctx.arc(102, rowTop + 22, 13, 0, Math.PI * 2);
    if (t.done) {
      ctx.fillStyle = role.accent || "#e8dcc8";
      ctx.fill();
      ctx.strokeStyle = role.accent || "#e8dcc8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(96, rowTop + 22);
      ctx.lineTo(101, rowTop + 27);
      ctx.lineTo(109, rowTop + 16);
      ctx.stroke();
    } else {
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.fillStyle = t.done ? "#7d7590" : "#e6dfd5";
    ctx.font = '26px -apple-system, "PingFang SC", sans-serif';
    const afterY = wrapText(ctx, t.text, 132, rowTop + 26, W - 240, 40, 2);
    y = Math.max(afterY, rowTop + 50) + 26;
  }

  // ---------- 手记 ----------
  const firstNote = (taskViews.find((t) => t.note) || {}).note;
  if (firstNote) {
    ctx.fillStyle = "#b6adc4";
    ctx.font = 'italic 24px "Songti SC", serif';
    ctx.textAlign = "center";
    wrapText(ctx, "「" + firstNote + "」", W / 2, 1150, W - 160, 40, 2);
  }

  // ---------- 底部 ----------
  ctx.textAlign = "center";
  ctx.fillStyle = "#5a5368";
  ctx.font = '22px -apple-system, "PingFang SC", sans-serif';
  ctx.fillText(formatDate(draw.date) + " · 今日角色", W / 2, 1240);
  ctx.fillStyle = "#3d3748";
  ctx.font = '20px -apple-system, "PingFang SC", sans-serif';
  ctx.fillText("每天抽一张卡，决定今天扮演谁", W / 2, 1284);
}

function formatDate(dateStr) {
  const p = String(dateStr || "").split("-");
  if (p.length !== 3) return dateStr || "";
  return p[0] + " 年 " + Number(p[1]) + " 月 " + Number(p[2]) + " 日";
}

async function build(page, draw, taskViews) {
  const canvas = await getCanvas(page);
  drawPoster(canvas, draw, taskViews);
  return toTempFile(canvas);
}

module.exports = { build };