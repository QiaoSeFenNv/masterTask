/** Flat trading-card booster shared by selection, touch tearing and PAG textures. */
var WIDTH = 150;
var HEIGHT = 278;
var SEAM = 24;

// Self-contained: the PAG builder serializes this painter into a browser canvas.
function paint(c, image, rect, series, options) {
  options = options || {};
  var width = 150, height = 278;
  var ink = series.id === 'dawn' ? '#fff3db' : '#f3f8fc';
  function gradient(x0, y0, x1, y1, stops) {
    var g = c.createLinearGradient(x0, y0, x1, y1);
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    return g;
  }
  function face() {
    // Straight sides and tiny rounded corners, not an inflated pouch silhouette.
    c.beginPath(); c.moveTo(6, 2); c.lineTo(144, 2);
    c.quadraticCurveTo(147, 2, 147, 5); c.lineTo(147, 273);
    c.quadraticCurveTo(147, 276, 144, 276); c.lineTo(6, 276);
    c.quadraticCurveTo(3, 276, 3, 273); c.lineTo(3, 5);
    c.quadraticCurveTo(3, 2, 6, 2); c.closePath();
  }
  c.save(); c.translate(rect.x, rect.y); c.scale(rect.w / width, rect.h / height);
  if (options.shadow !== false && typeof c.createRadialGradient === 'function') {
    c.save(); c.translate(75, 279); c.scale(1, .10);
    var shadow = c.createRadialGradient(0, 0, 0, 0, 0, 64);
    shadow.addColorStop(0, 'rgba(14,20,29,.19)');
    shadow.addColorStop(.50, 'rgba(14,20,29,.07)');
    shadow.addColorStop(1, 'rgba(14,20,29,0)');
    c.fillStyle = shadow; c.fillRect(-64, -64, 128, 128); c.restore();
  }
  if (options.shadowOnly) { c.restore(); return; }

  c.save(); face(); c.clip();
  // Neutral aluminium belongs only to the header, footer and narrow flat rim.
  c.fillStyle = gradient(0, 0, 150, 278, [[0, '#b6c2cf'], [.14, '#f1f5f9'],
    [.31, '#b6c2ce'], [.52, '#e8eef5'], [.78, '#aebcc9'], [1, '#e9eff5']]);
  c.fillRect(0, 0, width, height);
  var art = {x: 5, y: 34, w: 140, h: 224};
  // Complete first frame, including all printing, even before either image loads.
  c.fillStyle = gradient(art.x, art.y, art.x + art.w, art.y + art.h,
    [[0, series.top], [.48, series.mid], [1, series.bottom]]);
  c.fillRect(art.x, art.y, art.w, art.h);
  var iw = image && (image.width || image.naturalWidth);
  var ih = image && (image.height || image.naturalHeight);
  if (iw && ih) {
    // Remove the old ornamental frame with an aspect-preserving, centred crop.
    var sw = iw * .70, sh = Math.min(ih * .86, sw * art.h / art.w);
    sw = sh * art.w / art.h;
    c.drawImage(image, (iw - sw) / 2, (ih - sh) / 2, sw, sh, art.x, art.y, art.w, art.h);
  }
  // Printed artwork stays flat; no belly shading, side gusset or diagonal wrinkles.
  c.fillStyle = gradient(0, 184, 0, 258, [[0, 'rgba(3,9,17,0)'],
    [.50, 'rgba(3,9,17,.22)'], [1, 'rgba(3,9,17,.70)']]);
  c.fillRect(5, 184, 140, 74);
  c.fillStyle = 'rgba(250,253,255,.85)'; c.fillRect(5, 33, 140, 1);
  c.fillStyle = 'rgba(18,34,49,.28)'; c.fillRect(5, 258, 140, .8);

  if (options.foil) c.drawImage(options.foil, 0, 0, width, height);
  else {
    // Pressed heat-seal ridges, not a crumpled snack-bag material.
    c.beginPath();
    for (var ridge = 3.5; ridge < 9; ridge += 2) {
      c.moveTo(8, ridge); c.lineTo(142, ridge);
      c.moveTo(8, 261 + ridge); c.lineTo(142, 261 + ridge);
    }
    c.strokeStyle = 'rgba(255,255,255,.66)'; c.lineWidth = .55; c.stroke();
  }
  c.beginPath(); c.moveTo(3.5, 5); c.lineTo(3.5, 273);
  c.moveTo(146.5, 5); c.lineTo(146.5, 273);
  c.strokeStyle = 'rgba(255,255,255,.78)'; c.lineWidth = .7; c.stroke();
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.fillStyle = '#172b3c';
  c.font = '700 13px "Songti SC", "STSong", "Noto Serif CJK SC", serif';
  c.fillText('每日角色', 75, 21);
  c.font = '600 5.5px "Bahnschrift", "PingFang SC", "Microsoft YaHei", sans-serif';
  c.fillText('TRADING CARD PACK', 75, 29);
  c.font = '700 27px "Songti SC", "STSong", "Noto Serif CJK SC", serif';
  if (typeof c.strokeText === 'function') {
    c.strokeStyle = 'rgba(3,12,22,.65)'; c.lineWidth = 2.5; c.strokeText(series.name, 75, 236);
  }
  c.fillStyle = ink; c.fillText(series.name, 75, 236);
  c.font = '600 7px "Bahnschrift", "PingFang SC", "Microsoft YaHei", sans-serif';
  c.fillText('DAILY ROLES / 10 CARDS', 75, 250);
  c.restore();
  face(); c.strokeStyle = 'rgba(41,61,79,.26)'; c.lineWidth = .65; c.stroke();
  c.restore();
}
function interior(c, rect, series, opacity) {
  c.save(); c.globalAlpha *= opacity == null ? 1 : opacity;
  c.translate(rect.x, rect.y); c.scale(rect.w / 160, rect.h / 40);
  var lining = c.createLinearGradient(0, 17, 0, 25);
  lining.addColorStop(0, '#c5d1dc'); lining.addColorStop(.48, 'rgba(0,4,8,.96)');
  lining.addColorStop(1, series.mid);
  c.beginPath(); c.moveTo(9, 21); c.quadraticCurveTo(80, 18, 151, 21);
  c.quadraticCurveTo(80, 25, 9, 21); c.closePath(); c.fillStyle = lining; c.fill();
  for (var i = 3; i >= 0; i--) {
    var y = 18.5 + i * 1.1;
    c.beginPath(); c.moveTo(26 + i * .8, y); c.lineTo(134 - i * .8, y);
    c.lineTo(134 - i * .8, y + .7); c.lineTo(26 + i * .8, y + .7); c.closePath();
    c.fillStyle = i === 0 ? 'rgba(240,241,235,.48)' : 'rgba(207,218,226,.28)'; c.fill();
  }
  c.beginPath(); c.moveTo(9, 21); c.quadraticCurveTo(80, 18, 151, 21);
  c.strokeStyle = 'rgba(255,255,255,.44)'; c.lineWidth = .65; c.stroke();
  c.restore();
}
function bitmap(width, height) {
  var canvas = null;
  try {
    var w = require('./env.js').getWx();
    if (typeof w.createOffscreenCanvas === 'function') canvas = w.createOffscreenCanvas({type:'2d', width:width, height:height});
    else if (typeof w.createCanvas === 'function') { canvas = w.createCanvas(); canvas.width = width; canvas.height = height; }
  } catch (error) { return null; }
  return canvas && typeof canvas.getContext === 'function' ? canvas : null;
}
// Cache printing and its small floor shadow; movement only transforms these bitmaps.
var surfaceCache = {}, shadowCanvas = null;
function draw(c, image, rect, series, options) {
  options = options || {};
  if (options.shadow !== false) {
    if (!shadowCanvas) {
      var shadow = bitmap(360, 608), sc = shadow && shadow.getContext('2d');
      if (sc && typeof sc.setTransform === 'function') {
        sc.setTransform(2, 0, 0, 2, 30, 16);
        paint(sc, null, {x:0, y:0, w:WIDTH, h:HEIGHT}, series, {shadowOnly:true});
        shadowCanvas = shadow;
      }
    }
    if (shadowCanvas) c.drawImage(shadowCanvas, rect.x - rect.w * .10,
      rect.y - rect.h * 8 / HEIGHT, rect.w * 1.2, rect.h * 304 / HEIGHT);
    else paint(c, null, rect, series, {shadowOnly:true});
  }
  if (options.shadowOnly) return;
  var foil = options.foil || require('./assets.js').foil(series.id);
  var entry = surfaceCache[series.id];
  if (!entry || entry.image !== image || entry.foil !== foil) {
    var canvas = bitmap(WIDTH * 2, HEIGHT * 2), context = canvas && canvas.getContext('2d');
    if (context && typeof context.setTransform === 'function') {
      context.setTransform(2, 0, 0, 2, 0, 0);
      paint(context, image, {x:0, y:0, w:WIDTH, h:HEIGHT}, series, {shadow:false, foil:foil});
      entry = {image:image, foil:foil, canvas:canvas}; surfaceCache[series.id] = entry;
    }
  }
  if (entry && entry.image === image && entry.foil === foil) c.drawImage(entry.canvas, rect.x, rect.y, rect.w, rect.h);
  else paint(c, image, rect, series, {shadow:false, foil:foil});
}
module.exports = {paint:paint, draw:draw, interior:interior, WIDTH:WIDTH, HEIGHT:HEIGHT, SEAM:SEAM};
