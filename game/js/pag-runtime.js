/** WeChat mini-game PAG I/O and bitmap preparation. No autonomous PAG play loop. */
var env = require("./env.js");
var draw = require("./draw.js");
var cardface = require("./cardface.js");
var template = require("./pag-template.js");
var runtimePromise = null;

function supported() {
  var w = env.getWx();
  return typeof WXWebAssembly !== "undefined" && WXWebAssembly &&
    typeof WXWebAssembly.instantiate === "function" && w &&
    typeof w.getFileSystemManager === "function" &&
    (typeof w.createOffscreenCanvas === "function" || typeof w.createCanvas === "function");
}
/** The mini-game filesystem may reject package .pag paths; load the generated binary module. */
function readTemplate(w) {
  return Promise.resolve().then(function () {
    var packaged = require("../data/reveal-pag.js");
    if (!packaged || packaged.encoding !== "base64" || typeof packaged.data !== "string") throw new Error("PAG binary module is invalid");
    var text = packaged.data;
    var buffer;
    if (typeof w.base64ToArrayBuffer === "function") buffer = w.base64ToArrayBuffer(text);
    else {
      var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      var padding = text.slice(-2) === "==" ? 2 : text.slice(-1) === "=" ? 1 : 0;
      var bytes = new Uint8Array(text.length * 3 / 4 - padding);
      var at = 0;
      for (var i = 0; i < text.length; i += 4) {
        var value = (alphabet.indexOf(text.charAt(i)) << 18) | (alphabet.indexOf(text.charAt(i + 1)) << 12) |
          ((text.charAt(i + 2) === "=" ? 0 : alphabet.indexOf(text.charAt(i + 2))) << 6) |
          (text.charAt(i + 3) === "=" ? 0 : alphabet.indexOf(text.charAt(i + 3)));
        if (at < bytes.length) bytes[at++] = (value >> 16) & 255;
        if (at < bytes.length) bytes[at++] = (value >> 8) & 255;
        if (at < bytes.length) bytes[at++] = value & 255;
      }
      buffer = bytes.buffer;
    }
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== packaged.byteLength) throw new Error("PAG binary length mismatch");
    return buffer;
  });
}
function preload() {
  if (runtimePromise) return runtimePromise;
  if (!supported()) return Promise.reject(new Error("PAG runtime is unavailable"));
  var w = env.getWx();
  runtimePromise = Promise.all([
    require("../vendor/pag/libpag.js").PAGInit({
      locateFile: function () { return "/vendor/pag/libpag.wasm.br"; },
    }),
    readTemplate(w),
  ]).then(function (values) { return { sdk: values[0], bytes: values[1] }; });
  return runtimePromise;
}
function makeCanvas(type, width, height) {
  var w = env.getWx();
  var canvas;
  if (typeof w.createOffscreenCanvas === "function") {
    try { canvas = w.createOffscreenCanvas({ type: type, width: width, height: height }); } catch (e) {}
  }
  if (!canvas && typeof w.createCanvas === "function") canvas = w.createCanvas();
  if (!canvas) throw new Error("No secondary canvas for PAG");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
function roleBitmap(role) {
  var ratio = Math.max(1, Math.min(2, env.size().pixelRatio || 1));
  var width = template.card.width;
  var height = template.card.height;
  var bitmap = makeCanvas("2d", Math.round(width * ratio), Math.round(height * ratio));
  draw.withCanvas(bitmap, function (ctx) {
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    cardface.paint(1, 1, width - 2, height - 2, template.card.radius, role, {
      emojiSize: 64, nameSize: 24, taglineSize: 11,
      border: role.accent || "#e8d7ae", borderWidth: 2,
    });
  });
  return bitmap;
}
function destroy(resource) {
  if (!resource || resource.destroyed) return;
  resource.destroyed = true;
  var handles = [resource.view, resource.file, resource.image];
  for (var i = 0; i < handles.length; i++) {
    if (handles[i] && typeof handles[i].destroy === "function") {
      try { handles[i].destroy(); } catch (e) {}
    }
  }
  if (resource.gl) {
    try {
      var extension = resource.gl.getExtension("WEBGL_lose_context");
      if (extension) extension.loseContext();
    } catch (e) {}
  }
  var canvases = [resource.canvas, resource.bitmap];
  for (var j = 0; j < canvases.length; j++) {
    if (canvases[j]) { canvases[j].width = 1; canvases[j].height = 1; }
  }
}
function create(role) {
  return preload().then(function (runtime) {
    var sdk = runtime.sdk;
    var resource = { view: null, file: null, image: null, canvas: null, bitmap: null, gl: null };
    return sdk.PAGFile.load(runtime.bytes).then(function (file) {
      resource.file = file;
      if (file.width() !== template.width || file.height() !== template.height ||
          file.duration() !== template.durationMs * 1000 || file.frameRate() !== template.frameRate ||
          file.numImages() <= template.card.imageIndex) throw new Error("PAG reveal template contract mismatch");
      var layers = file.getLayersByEditableIndex(template.card.imageIndex, 5);
      try {
        if (layers.size() !== 1) throw new Error("PAG card must have one editable image layer");
        var cardLayer = layers.get(0);
        try {
          if (cardLayer.layerName() !== template.card.layerName) throw new Error("PAG card layer name mismatch");
        } finally { cardLayer.destroy(); }
      } finally { layers.delete(); }
      resource.bitmap = roleBitmap(role);
      resource.image = sdk.PAGImage.fromSource(resource.bitmap);
      file.replaceImage(template.card.imageIndex, resource.image);
      // SDK 4.3.51 applies device DPR in PAGView.init. Bound the final GL buffer to 2x.
      var dpr = Math.max(1, env.size().pixelRatio || 1);
      var scale = Math.min(2, dpr);
      resource.canvas = makeCanvas("webgl", Math.round(template.width * scale / dpr), Math.round(template.height * scale / dpr));
      resource.gl = resource.canvas.getContext("webgl", {
        alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true,
        depth: false, stencil: false, antialias: false,
      });
      if (!resource.gl) throw new Error("PAG WebGL context is unavailable");
      return sdk.PAGView.init(file, resource.canvas, { firstFrame: false });
    }).then(function (view) {
      resource.view = view;
      resource.durationMs = template.durationMs;
      resource.frameRate = template.frameRate;
      view.setProgress(0);
      return view.flush();
    }).then(function () { return resource; }).catch(function (error) {
      destroy(resource);
      throw error;
    });
  });
}
function flush(resource, progress) {
  resource.view.setProgress(progress);
  return resource.view.flush();
}
module.exports = { supported: supported, preload: preload, create: create, flush: flush, destroy: destroy };
