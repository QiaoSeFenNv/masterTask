/** Pure design-space scratch geometry; no canvas, timer, or platform APIs. */
var WIDTH = 335, HEIGHT = 340, RADIUS = 22, COLS = 34, ROWS = 34, THRESHOLD = 0.6;
var TOTAL = COLS * ROWS;

function create(key) {
  return { key: key, marks: [], cells: new Array(TOTAL).fill(0), count: 0, progress: 0, complete: false, revision: 0 };
}
function point(p) { return p && Number.isFinite(p.x) && Number.isFinite(p.y); }
function distance2(x, y, a, b) {
  var dx = b.x - a.x, dy = b.y - a.y;
  var t = dx || dy ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.pow(x - a.x - t * dx, 2) + Math.pow(y - a.y - t * dy, 2);
}
// Clip long off-card gestures, so replay/storage never contains unbounded coordinates.
function clip(a, b) {
  var dx = b.x - a.x, dy = b.y - a.y, low = 0, high = 1;
  var p = [-dx, dx, -dy, dy], q = [a.x + RADIUS, WIDTH + RADIUS - a.x, a.y + RADIUS, HEIGHT + RADIUS - a.y];
  for (var i = 0; i < 4; i++) {
    if (!p[i]) { if (q[i] < 0) return null; continue; }
    var t = q[i] / p[i];
    if (p[i] < 0) low = Math.max(low, t); else high = Math.min(high, t);
    if (low > high) return null;
  }
  function bounded(t) { return {x:Math.max(-RADIUS,Math.min(WIDTH+RADIUS,a.x+t*dx)),
    y:Math.max(-RADIUS,Math.min(HEIGHT+RADIUS,a.y+t*dy))}; }
  return [bounded(low), bounded(high)];
}
function add(state, from, to) {
  if (!state || state.complete || !point(from) || !point(to)) return false;
  var segment = clip(from, to); if (!segment) return false;
  var a = segment[0], b = segment[1], before = state.count;
  var minX = Math.max(0, Math.floor((Math.min(a.x, b.x) - RADIUS) / WIDTH * COLS));
  var maxX = Math.min(COLS - 1, Math.floor((Math.max(a.x, b.x) + RADIUS) / WIDTH * COLS));
  var minY = Math.max(0, Math.floor((Math.min(a.y, b.y) - RADIUS) / HEIGHT * ROWS));
  var maxY = Math.min(ROWS - 1, Math.floor((Math.max(a.y, b.y) + RADIUS) / HEIGHT * ROWS));
  for (var row = minY; row <= maxY; row++) for (var col = minX; col <= maxX; col++) {
    var index = row * COLS + col;
    if (!state.cells[index] && distance2((col + 0.5) * WIDTH / COLS, (row + 0.5) * HEIGHT / ROWS, a, b) <= RADIUS * RADIUS) {
      state.cells[index] = 1; state.count++;
    }
  }
  if (before === state.count) return false;
  state.marks.push([a.x, a.y, b.x, b.y]);
  state.progress = state.count / TOTAL; state.revision++;
  if (state.progress >= THRESHOLD) { state.complete = true; state.progress = 1; }
  return true;
}
function restore(key, saved) {
  var state = create(key);
  if (!saved || saved.version !== 1 || saved.key !== key) return state;
  if (saved.complete === true) { state.complete = true; state.progress = 1; return state; }
  if (!Array.isArray(saved.marks) || saved.marks.length > TOTAL) return state;
  for (var i = 0; i < saved.marks.length; i++) {
    var m = saved.marks[i];
    if (!Array.isArray(m) || m.length !== 4 || !m.every(Number.isFinite) ||
      m[0] < -RADIUS || m[0] > WIDTH + RADIUS || m[2] < -RADIUS || m[2] > WIDTH + RADIUS ||
      m[1] < -RADIUS || m[1] > HEIGHT + RADIUS || m[3] < -RADIUS || m[3] > HEIGHT + RADIUS) return create(key);
    add(state, {x:m[0], y:m[1]}, {x:m[2], y:m[3]});
  }
  return state;
}
function snapshot(state) {
  return {version: 1, key: state.key, complete: state.complete, marks: state.complete ? [] : state.marks.map(function (m) {return m.slice();})};
}
module.exports = {WIDTH: WIDTH, HEIGHT: HEIGHT, RADIUS: RADIUS, COLS: COLS, ROWS: ROWS,
  THRESHOLD: THRESHOLD, create: create, add: add, restore: restore, snapshot: snapshot};
