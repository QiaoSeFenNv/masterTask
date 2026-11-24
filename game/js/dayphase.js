/**
 * 时段判定：早上 6–12，中午 12–18，其余算夜晚。
 * 只依赖手机本地时间，不联网、不读服务端日期。
 */

var MORNING = "morning";
var MIDDAY = "midday";
var NIGHT = "night";

/** 每 5 秒才重新看一眼钟，避免每帧都 new Date */
var CHECK_MS = 5000;
var cached = "";
var checkedAt = 0;

/** 纯函数：给定一个时间，返回它属于哪个时段（方便测试） */
function phaseAt(now) {
  var d = now || new Date();
  var h = d.getHours();
  if (h >= 6 && h < 12) return MORNING;
  if (h >= 12 && h < 18) return MIDDAY;
  return NIGHT;
}

function phase(now) {
  var t = now ? now.getTime() : Date.now();
  if (cached && t - checkedAt < CHECK_MS) return cached;
  cached = phaseAt(now);
  checkedAt = t;
  return cached;
}

/** 清掉缓存，下次 phase() 重新看钟 */
function reset() {
  cached = "";
  checkedAt = 0;
}

module.exports = {
  MORNING: MORNING,
  MIDDAY: MIDDAY,
  NIGHT: NIGHT,
  phaseAt: phaseAt,
  phase: phase,
  reset: reset,
};
