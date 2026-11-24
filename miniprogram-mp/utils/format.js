/**
 * 布局辅助：把服务端的 gradient 数组转成可用的 CSS 渐变字符串
 */
function gradientCss(gradient, angle) {
  const colors = gradient && gradient.length ? gradient : ["#2a2135", "#1a1522"];
  const deg = angle || 135;
  return "linear-gradient(" + deg + "deg, " + colors.join(", ") + ")";
}

/** 抽卡动画时长（毫秒） */
const FLIP_DURATION = 900;

function pad(n) {
  return n < 10 ? "0" + n : String(n);
}

/** 2026-11-19 → 11 / 19 */
function splitDate(dateStr) {
  const parts = String(dateStr || "").split("-");
  return { y: parts[0] || "", m: parts[1] || "", d: parts[2] || "" };
}

function weekdayZh(dateStr) {
  const names = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const parts = String(dateStr || "").split("-");
  if (parts.length !== 3) return "";
  const dt = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return names[dt.getDay()] || "";
}

module.exports = { gradientCss, FLIP_DURATION, pad, splitDate, weekdayZh };
