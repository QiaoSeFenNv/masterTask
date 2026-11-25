/** 统一动画时钟、缓动采样与按需帧循环；时长不依赖帧数。 */
var frameTime = null;

function clamp01(t) {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

var easing = {
  linear: function (t) { return t; },
  outCubic: function (t) { var k = 1 - t; return 1 - k * k * k; },
  inOutCubic: function (t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  },
  outBack: function (t) {
    var k = t - 1;
    return 1 + k * k * (2.7 * k + 1.7);
  },
};

function register(name, fn) {
  if (typeof name !== "string" || !name || typeof fn !== "function") throw new Error("invalid easing");
  Object.defineProperty(easing, name, { value: fn, writable: true, enumerable: true, configurable: true });
}

/** 帧内所有模块共享同一时间；触摸/接口回调仍取当前时间。 */
function now() {
  return frameTime == null ? Date.now() : frameTime;
}

function withTime(time, fn) {
  var previous = frameTime;
  frameTime = time == null ? now() : time;
  try {
    return fn(frameTime);
  } finally {
    frameTime = previous;
  }
}

function progress(at, duration, time) {
  var t = time == null ? now() : time;
  if (duration <= 0) return t >= at ? 1 : 0;
  return clamp01((t - at) / duration);
}

/** 可直接采样任意一帧，支持延迟、丢帧和后台恢复，不维护逐帧累加的状态。 */
function tween(from, to, at, duration, curve, time) {
  var name = curve || "outCubic";
  if (!Object.prototype.hasOwnProperty.call(easing, name)) {
    throw new Error("unknown easing: " + name);
  }
  var p = progress(at, duration, time);
  if (p === 0) return from;
  if (p === 1) return to;
  return from + (to - from) * easing[name](p);
}

/** render(time) 返回是否还需要下一帧。request/cancel 由 env 提供。 */
function createLoop(options) {
  var clock = options.now || function () { return Date.now(); };
  var pending = null;
  var hidden = false;
  var generation = 0;
  var offset = null;
  var lastStamp = null;
  var lastTime = 0;

  function request() {
    if (hidden || pending != null) return;
    var token = generation;
    pending = options.request(function (stamp) {
      // 没有 cancelAnimationFrame 的环境也不能让过期回调启动第二条循环。
      if (token !== generation || hidden) return;
      pending = null;
      var wall = clock();
      var time = wall;
      if (typeof stamp === "number" && isFinite(stamp) && stamp >= 0) {
        // RAF 可能给相对时间或 epoch 时间，统一映射到动画起始时间的基准。
        if (offset == null || (lastStamp != null && stamp < lastStamp)) {
          offset = wall - stamp;
        }
        time = offset + stamp;
        lastStamp = stamp;
      }
      time = Math.max(lastTime, time);
      lastTime = time;
      if (options.render(time)) request();
    });
  }

  function pause() {
    hidden = true;
    generation++;
    if (pending != null && options.cancel) options.cancel(pending);
    pending = null;
  }

  function resume() {
    if (!hidden) return;
    hidden = false;
    offset = null;
    lastStamp = null;
    request();
  }

  return { request: request, pause: pause, resume: resume };
}

module.exports = {
  now: now,
  withTime: withTime,
  clamp01: clamp01,
  progress: progress,
  tween: tween,
  easing: easing,
  register: register,
  createLoop: createLoop,
};
