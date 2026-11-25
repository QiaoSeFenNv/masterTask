/** Serialized PAG reveal lifecycle. The app's RAF clock is the only playback driver. */
var template = require("./pag-template.js");
function roleKey(role) {
  if (!role) return "";
  return JSON.stringify([role.id, role.name, role.emoji, role.tagline, role.gradient, role.accent]);
}
function failureMessage(failure) {
  if (failure && (failure.errMsg || failure.message)) return String(failure.errMsg || failure.message);
  if (failure && typeof failure === "object") {
    try { return JSON.stringify(failure); } catch (e) {}
  }
  return String(failure);
}
function createController(adapter) {
  var revision = 0;
  var key = "";
  var resource = null;
  var pending = false;
  var preparePromise = null;
  var preloadPromise = null;
  var tail = Promise.resolve();
  var token = null;
  var mode = "fallback";
  var paused = false;
  var flushing = false;
  var renderedFrame = 0;
  var error = "";
  var invalidate = function () {};
  function enqueue(job) {
    var result = tail.then(job, job);
    tail = result.catch(function () {});
    return result;
  }
  function notify() { if (!paused) invalidate(); }
  function preload() {
    if (!adapter.supported()) return Promise.resolve(false);
    if (!preloadPromise) {
      preloadPromise = Promise.resolve().then(function () { return adapter.preload(); }).then(function () {
        return true;
      }, function (failure) { error = failureMessage(failure); return false; });
    }
    return preloadPromise;
  }
  function prepare(role) {
    var nextKey = roleKey(role);
    if (!nextKey || !adapter.supported()) return Promise.resolve(false);
    if (nextKey === key) return preparePromise || Promise.resolve(Boolean(resource));
    var requested = ++revision;
    key = nextKey;
    pending = true;
    error = "";
    var previous = resource;
    resource = null;
    preparePromise = enqueue(function () {
      adapter.destroy(previous);
      if (requested !== revision) return false;
      return Promise.resolve().then(function () { return adapter.create(role); }).then(function (created) {
        if (requested !== revision) { adapter.destroy(created); return false; }
        resource = created;
        pending = false;
        renderedFrame = 0;
        notify();
        return true;
      }, function (failure) {
        if (requested === revision) { pending = false; error = failureMessage(failure); notify(); }
        return false;
      });
    });
    return preparePromise;
  }
  function begin(nextToken, role) {
    if (nextToken !== token) {
      token = nextToken;
      // An unready runtime uses Canvas for this entire reveal; late loads cannot cause a jump.
      mode = resource && key === roleKey(role) ? "pag" : "fallback";
    }
    return mode;
  }
  function seek(progress) {
    if (mode !== "pag" || paused || flushing || !resource) return;
    var active = resource;
    var requested = revision;
    var frames = Math.max(1, Math.round(active.durationMs * active.frameRate / 1000));
    var frame = Math.min(frames - 1, Math.max(0, Math.floor(progress * frames)));
    if (frame === renderedFrame) return;
    flushing = true;
    enqueue(function () {
      if (requested !== revision || resource !== active || paused) return;
      return Promise.resolve().then(function () { return adapter.flush(active, frame / frames); }).then(function () {
        if (requested === revision && resource === active) { renderedFrame = frame; notify(); }
      }, function (failure) {
        if (requested === revision && resource === active) {
          error = failureMessage(failure);
          mode = "fallback";
          resource = null;
          adapter.destroy(active);
          notify();
        }
      });
    }).then(function () { flushing = false; }, function (failure) {
      flushing = false;
      error = failureMessage(failure);
    });
  }
  function paint(ctx, nextToken, role, geometry, progress) {
    if (begin(nextToken, role) !== "pag" || !resource) return false;
    seek(progress);
    var scale = geometry.h / template.card.height;
    try {
      ctx.drawImage(resource.canvas, geometry.x - template.card.x * scale, geometry.y - template.card.y * scale,
        template.width * scale, template.height * scale);
      return true;
    } catch (failure) {
      error = failureMessage(failure);
      release();
      return false;
    }
  }
  function release() {
    if (!key && !resource && !pending && !token) return tail;
    ++revision;
    key = "";
    pending = false;
    token = null;
    mode = "fallback";
    preparePromise = null;
    var previous = resource;
    resource = null;
    return enqueue(function () { adapter.destroy(previous); });
  }
  function status() {
    return { supported: Boolean(adapter.supported()), ready: Boolean(resource), loading: pending, mode: mode, flushing: flushing, error: error };
  }
  return {
    preload: preload, prepare: prepare, begin: begin, seek: seek, paint: paint, release: release,
    pause: function () { paused = true; }, resume: function () { paused = false; },
    onFrame: function (callback) { invalidate = typeof callback === "function" ? callback : function () {}; },
    status: status,
    settled: function () { return tail; },
  };
}
var controller = createController(require("./pag-runtime.js"));
controller.createController = createController;
module.exports = controller;
