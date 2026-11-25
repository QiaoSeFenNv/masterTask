/**
 * 运行时适配层。
 * - 微信小游戏:用真实 wx + 真实屏幕尺寸
 * - Node(测试 / 桌面预览):用 mock wx,逻辑尺寸固定 375 x 812
 *
 * 其他模块只依赖 env,不直接碰 wx,所以同一份代码两边都能跑。
 */

var DESIGN_WIDTH = 375;

var wxRef = null;
var metrics = {
  width: DESIGN_WIDTH,
  height: 812,
  pixelRatio: 2,
  safeTop: 44,
  safeBottom: 34,
};

function isNode() {
  if (typeof process === "undefined" || !process) return false;
  if (!process.versions) return false;
  return Boolean(process.versions.node);
}

function detectMetrics(w) {
  var info;
  try {
    info = w.getSystemInfoSync();
  } catch (e) {
    return metrics;
  }
  var height = info.windowHeight || info.screenHeight || 812;
  var width = info.windowWidth || info.screenWidth || DESIGN_WIDTH;
  var safeTop = 44;
  var safeBottom = 34;
  var safe = info.safeArea;
  if (safe) {
    safeTop = safe.top || 0;
    safeBottom = Math.max(0, height - safe.bottom);
  }
  return {
    width: width,
    height: height,
    pixelRatio: info.pixelRatio || 2,
    safeTop: safeTop,
    safeBottom: safeBottom,
  };
}

function makeMockWx() {
  var storage = {};
  return {
    getStorageSync: function (k) {
      return k in storage ? storage[k] : "";
    },
    setStorageSync: function (k, v) {
      storage[k] = v;
    },
    removeStorageSync: function (k) {
      delete storage[k];
    },
    login: function (opts) {
      opts.success({ code: "mock_" + Date.now() });
    },
    request: function (opts) {
      if (typeof fetch !== "function") {
        opts.fail({ errMsg: "fetch unavailable" });
        return;
      }
      var method = opts.method || "GET";
      fetch(opts.url, {
        method: method,
        headers: opts.header || {},
        body: method === "GET" ? undefined : JSON.stringify(opts.data || {}),
      })
        .then(function (res) {
          return res.json().then(function (body) {
            opts.success({ statusCode: res.status, data: body });
          });
        })
        .catch(function (e) {
          opts.fail({ errMsg: String(e) });
        });
    },
    getSystemInfoSync: function () {
      return {
        windowWidth: metrics.width,
        windowHeight: metrics.height,
        screenWidth: metrics.width,
        screenHeight: metrics.height,
        pixelRatio: metrics.pixelRatio,
        safeArea: {
          top: metrics.safeTop,
          bottom: metrics.height - metrics.safeBottom,
        },
      };
    },
    createCanvas: function () {
      return null;
    },
    showToast: function (o) {
      console.log("[toast]", o.title);
    },
    vibrateShort: function () {},
    onTouchStart: function () {},
    onTouchMove: function () {},
    onTouchEnd: function () {},
  };
}

function getWx() {
  if (wxRef) return wxRef;
  if (typeof wx !== "undefined" && wx) {
    wxRef = wx;
    return wxRef;
  }
  if (isNode()) {
    wxRef = makeMockWx();
    return wxRef;
  }
  throw new Error("no wx runtime found");
}

function setWx(w) {
  wxRef = w;
}

function refreshMetrics() {
  metrics = detectMetrics(getWx());
  return metrics;
}

function size() {
  return metrics;
}

function scale() {
  return metrics.width / DESIGN_WIDTH;
}

/** 以设计稿单位(375 宽)表示的视口 */
function viewport() {
  var k = scale();
  return {
    width: DESIGN_WIDTH,
    height: metrics.height / k,
    safeTop: metrics.safeTop / k,
    safeBottom: metrics.safeBottom / k,
  };
}

/** 小游戏用全局 RAF；浏览器 canvas 预览与 Node 测试有独立回退。 */
function requestFrame(callback, canvas) {
  if (typeof requestAnimationFrame === "function") {
    return {
      id: requestAnimationFrame(callback),
      cancel: typeof cancelAnimationFrame === "function"
        ? function (id) { cancelAnimationFrame(id); } : null,
    };
  }
  if (canvas && typeof canvas.requestAnimationFrame === "function") {
    return {
      id: canvas.requestAnimationFrame(callback),
      cancel: typeof canvas.cancelAnimationFrame === "function"
        ? function (id) { canvas.cancelAnimationFrame(id); } : null,
    };
  }
  var id = setTimeout(function () { callback(Date.now()); }, 16);
  // Node 冒烟测试不应该被等待中的画帧定时器阻止退出。
  if (id && typeof id.unref === "function") id.unref();
  return { id: id, cancel: function (timerId) { clearTimeout(timerId); } };
}

function cancelFrame(ticket) {
  if (ticket && ticket.cancel) ticket.cancel(ticket.id);
}

module.exports = {
  DESIGN_WIDTH: DESIGN_WIDTH,
  isNode: isNode,
  getWx: getWx,
  setWx: setWx,
  refreshMetrics: refreshMetrics,
  size: size,
  scale: scale,
  viewport: viewport,
  requestFrame: requestFrame,
  cancelFrame: cancelFrame,
};
