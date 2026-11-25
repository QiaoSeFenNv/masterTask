/** Shared role artwork for interactive cards and the PAG replacement bitmap. */
var draw = require("./draw.js");
var theme = require("./theme.js");

function paint(x, y, w, h, r, role, opts) {
  var o = opts || {};
  var s = o.scale == null ? 1 : o.scale;

  draw.fillGradientRect(x, y, w, h, role.gradient || [theme.packTop, theme.packBottom], 150, r);
  draw.strokeRoundRect(x, y, w, h, r, o.border || theme.frame, o.borderWidth || 1);

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

module.exports = { paint: paint };
