/** Paint the removable oil-painted cover without altering the main canvas pixels. */
var draw = require("./draw.js"), env = require("./env.js"), assets = require("./assets.js");
var model = require("./scratch.js"), theme = require("./theme.js");
var cache = null;
function release() { cache = null; }
function background(rect, role, image) {
  draw.fillGradientRect(rect.x, rect.y, rect.w, rect.h, role.gradient || [theme.packTop, theme.packBottom], 150, rect.r);
  draw.image(image, rect.x, rect.y, rect.w, rect.h, rect.r);
}
function prepare(state, role, image, scale) {
  if (cache && cache.state === state && cache.image === image && cache.scale === scale && cache.phase === theme.name) return cache;
  cache = null;
  var wx = env.getWx();
  if (!wx) return null;
  var canvas;
  try {
    if (typeof wx.createOffscreenCanvas === "function") canvas = wx.createOffscreenCanvas({type:"2d", width:Math.ceil(model.WIDTH * scale), height:Math.ceil(model.HEIGHT * scale)});
    else if (typeof wx.createCanvas === "function") canvas = wx.createCanvas();
    if (!canvas || canvas === draw.getCanvas()) return null;
    canvas.width = Math.ceil(model.WIDTH * scale); canvas.height = Math.ceil(model.HEIGHT * scale);
    var ctx = canvas.getContext("2d");
    if (!ctx || ctx === draw.getCtx()) return null;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    draw.withCanvas(canvas, function () { background({x:0,y:0,w:model.WIDTH,h:model.HEIGHT,r:16}, role, image); });
    cache = {state:state, image:image, scale:scale, phase:theme.name, canvas:canvas, ctx:ctx, painted:0};
    return cache;
  } catch (e) { return null; }
}
function paint(rect, role, state) {
  if (!state || state.complete) { release(); return; }
  var image = assets.role(role.id);
  var scale = Math.min(3, Math.max(1, (draw.getCanvas().width || 375) / 375));
  var layer = prepare(state, role, image, scale);
  if (layer) {
    try {
      var c = layer.ctx;
      c.save(); c.globalCompositeOperation = "destination-out";
      for (var i = layer.painted; i < state.marks.length; i++) {
        var m = state.marks[i];
        c.lineWidth = model.RADIUS * 2; c.lineCap = "round"; c.strokeStyle = "#000"; c.fillStyle = "#000";
        c.beginPath(); c.moveTo(m[0], m[1]); c.lineTo(m[2], m[3]); c.stroke();
        // Zero-length touch points must erase too (some Canvas engines skip their stroke).
        c.beginPath(); c.arc(m[2], m[3], model.RADIUS, 0, Math.PI * 2); c.fill();
      }
      c.restore(); layer.painted = state.marks.length;
      if (draw.image(layer.canvas, rect.x, rect.y, rect.w, rect.h, rect.r, 1, "stretch")) return;
    } catch (e) { /* Fall through to direct clipping; never leave uncovered text. */ }
    release();
  }
  // No offscreen/compositing support: draw only the still-covered grid cells.
  var ctx = draw.getCtx(); ctx.save(); ctx.beginPath();
  for (var row = 0; row < model.ROWS; row++) for (var col = 0; col < model.COLS; col++) {
    if (!state.cells[row * model.COLS + col]) ctx.rect(rect.x + col * rect.w / model.COLS,
      rect.y + row * rect.h / model.ROWS, rect.w / model.COLS + 0.25, rect.h / model.ROWS + 0.25);
  }
  ctx.clip(); background(rect, role, image); ctx.restore();
}
module.exports = {paint:paint, release:release};
