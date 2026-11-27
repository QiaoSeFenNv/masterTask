/** Collection artwork and detail thumbnails share the same image/fallback path. */
var draw = require("./draw.js");
var theme = require("./theme.js");
var assets = require("./assets.js");

function paint(rect, role, opts) {
  var o = opts || {};
  // Always draw a complete first frame, even without image APIs or after decoding fails.
  draw.fillGradientRect(rect.x, rect.y, rect.w, rect.h,
    role.gradient || [theme.packTop, theme.packBottom], 150, rect.r);
  var painted = draw.image(assets.role(role.id), rect.x, rect.y, rect.w, rect.h, rect.r);
  if (o.caption !== false) {
    var c = draw.getCtx();
    c.save();
    draw.roundRect(rect.x, rect.y, rect.w, rect.h, rect.r);
    c.clip();
    var shade = c.createLinearGradient(0, rect.y + rect.h * 0.45, 0, rect.y + rect.h);
    shade.addColorStop(0, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(0,0,0,0.82)");
    c.fillStyle = shade;
    c.fillRect(rect.x, rect.y, rect.w, rect.h);
    c.restore();
    draw.text(role.name || "", rect.x + rect.w / 2, rect.y + rect.h - 38, {
      size: 15, weight: "600", serif: true, color: "#ffffff", align: "center",
      shadow: { color: "rgba(0,0,0,0.45)", blur: 8, y: 1 },
    });
    draw.text("抽到 " + role.times + " 次", rect.x + rect.w / 2, rect.y + rect.h - 18, {
      size: 10, color: "rgba(255,255,255,0.85)", align: "center",
    });
  }
  draw.strokeRoundRect(rect.x, rect.y, rect.w, rect.h, rect.r, theme.frame, 1);
  return painted;
}

module.exports = { paint: paint };
