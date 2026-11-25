const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const animation = require("../game/js/animation.js");
const pack = require("../game/js/pack.js");
const BASE = 1700000000000;

function harness(render, cancelWorks = true) {
  let wall = BASE;
  let nextId = 0;
  const queue = new Map();
  const frames = [];
  const loop = animation.createLoop({
    now: () => wall,
    request: (fn) => { const id = nextId++; queue.set(id, fn); return id; },
    cancel: (id) => { if (cancelWorks) queue.delete(id); },
    render: (time) => { frames.push(time); return render(time); },
  });
  return {
    loop, queue, frames,
    frame(stamp, time = wall) {
      wall = time;
      const callbacks = [...queue.values()];
      queue.clear();
      callbacks.forEach((fn) => fn(stamp));
    },
  };
}

function loadModule(file, dependencies = {}, globals = {}) {
  const context = {
    module: { exports: {} }, Date, console,
    require: (name) => {
      assert.ok(name in dependencies, "unexpected dependency: " + name);
      return dependencies[name];
    },
    ...globals,
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context, { filename: file });
  return context.module.exports;
}

test("tween respects delay, exact endpoints, zero duration and registered easing", () => {
  assert.equal(animation.tween(10, 20, 100, 200, "outBack", 99), 10);
  assert.equal(animation.tween(10, 20, 100, 200, "outBack", 300), 20);
  assert.equal(animation.tween(10, 20, 100, 0, "linear", 99), 10);
  assert.equal(animation.tween(10, 20, 100, 0, "linear", 100), 20);
  animation.register("quad", (t) => t * t);
  assert.equal(animation.tween(0, 8, 100, 200, "quad", 200), 2);
  assert.throws(() => animation.tween(0, 1, 0, 1, "toString", 0), /unknown easing/);
  assert.throws(() => animation.register("bad", null), /invalid easing/);
});

test("nested frame clocks restore after rendering errors", () => {
  animation.withTime(100, () => {
    assert.equal(animation.now(), 100);
    animation.withTime(200, () => assert.equal(animation.now(), 200));
    assert.equal(animation.now(), 100);
  });
  assert.throws(() => animation.withTime(123, () => { throw new Error("paint failed"); }), /paint failed/);
  assert.ok(animation.now() > BASE);
});

test("invalidations coalesce into one callback and idle rendering stops", () => {
  const h = harness(() => false);
  for (let i = 0; i < 20; i++) h.loop.request();
  assert.equal(h.queue.size, 1);
  h.frame(0);
  assert.equal(h.frames.length, 1);
  assert.equal(h.queue.size, 0);
});

test("relative and epoch RAF timestamps share the event clock", () => {
  for (const start of [0, BASE]) {
    const h = harness(() => h.frames.length < 3);
    h.loop.request();
    h.frame(start, BASE);
    h.frame(start + 16, BASE + 70);
    h.frame(start + 32, BASE + 150);
    assert.deepEqual(h.frames, [BASE, BASE + 16, BASE + 32]);
  }
});

test("30, 60 and 120 FPS produce the same position and duration", () => {
  for (const fps of [30, 60, 120]) {
    const positions = new Map();
    const h = harness((time) => {
      positions.set(Math.round(time - BASE), animation.tween(0, 100, BASE, 1000, "outCubic", time));
      return time < BASE + 1000;
    });
    h.loop.request();
    for (let i = 0; i <= fps; i++) {
      const elapsed = i * 1000 / fps;
      h.frame(500 + elapsed, BASE + elapsed);
    }
    assert.equal(positions.get(0), 0);
    assert.equal(positions.get(500), 87.5);
    assert.equal(positions.get(1000), 100);
    assert.equal(h.queue.size, 0);
  }
});

test("hiding cancels frame ID zero and resume catches up after a long gap", () => {
  const h = harness((time) => time < BASE + 1000);
  h.loop.request();
  assert.ok(h.queue.has(0));
  h.loop.pause();
  assert.equal(h.queue.size, 0);
  h.loop.request();
  assert.equal(h.queue.size, 0);
  h.loop.resume();
  h.frame(10, BASE + 5000);
  assert.deepEqual(h.frames, [BASE + 5000]);
  assert.equal(h.queue.size, 0);
});

test("uncancellable stale callbacks cannot create a second frame loop", () => {
  const h = harness(() => h.frames.length < 2, false);
  h.loop.request();
  h.frame(0);
  h.loop.pause();
  h.loop.resume();
  assert.equal(h.queue.size, 2);
  h.frame(5, BASE + 4000);
  assert.equal(h.frames.length, 2);
  assert.equal(h.queue.size, 0);
});

test("reset and missing RAF timestamps do not move animation time backwards", () => {
  const h = harness(() => h.frames.length < 4);
  h.loop.request();
  h.frame(100);
  h.frame(10, BASE + 50);
  h.frame(undefined, BASE + 20);
  h.frame(NaN, BASE + 100);
  assert.deepEqual(h.frames, [BASE, BASE + 50, BASE + 50, BASE + 100]);
});

test("runtime adapter prefers global RAF and can cancel frame ID zero", () => {
  let callback;
  let cancelled;
  const env = loadModule("game/js/env.js", {}, {
    requestAnimationFrame: (fn) => { callback = fn; return 0; },
    cancelAnimationFrame: function (id) { assert.notEqual(this, ticket); cancelled = id; },
  });
  const paint = () => {};
  const ticket = env.requestFrame(paint, { requestAnimationFrame: () => assert.fail("global RAF should win") });
  assert.equal(callback, paint);
  env.cancelFrame(ticket);
  assert.equal(cancelled, 0);
});

test("runtime adapter preserves canvas binding and falls back to a 16 ms timer", () => {
  const env = loadModule("game/js/env.js");
  let cancelled = false;
  const canvas = {
    requestAnimationFrame() { assert.equal(this, canvas); return 5; },
    cancelAnimationFrame(id) { assert.equal(this, canvas); cancelled = id === 5; },
  };
  env.cancelFrame(env.requestFrame(() => {}, canvas));
  assert.equal(cancelled, true);
  let timer;
  let delay;
  const fallback = loadModule("game/js/env.js", {}, {
    setTimeout: (fn, ms) => { timer = fn; delay = ms; return 0; },
    clearTimeout: (id) => assert.equal(id, 0),
  });
  let stamp;
  const ticket = fallback.requestFrame((time) => { stamp = time; });
  timer();
  assert.equal(delay, 16);
  assert.ok(stamp > BASE);
  fallback.cancelFrame(ticket);
});

function storeWith(api, feedback = []) {
  const store = loadModule("game/js/store.js", {
    "./api.js": api,
    "./layout.js": { normalizeDraw: (d) => d },
    "./pack.js": pack,
    "./animation.js": animation,
    "./sfx.js": { play: (name) => feedback.push(name) },
  });
  Object.assign(store.state, {
    status: "ready", draw: null, offer: [{ id: "a" }, { id: "b" }, { id: "c" }],
    picked: ["a", "b", "c"], pickedAt: {}, slot: "b", shifting: false,
    anim: { kind: "pick", at: BASE, series: "dusk" },
  });
  return store;
}

test("confirmation failure preserves candidates and allows retry", async () => {
  const feedback = [];
  const store = storeWith({ post: () => Promise.reject(new Error("offline")) }, feedback);
  await assert.rejects(store.confirmPick(), /offline/);
  assert.equal(store.state.shifting, false);
  assert.equal(store.state.slot, "b");
  assert.equal(store.state.offer.length, 3);
  assert.equal(store.stage(), "pick");
  assert.equal(store.state.draw, null);
  assert.deepEqual(feedback, [], "A failed confirmation has no settle cue");
});

test("confirmation happens once and reveal completion preserves the saved draw", async () => {
  let resolveDraw;
  let calls = 0;
  const feedback = [];
  const store = storeWith({
    post: (url, body) => {
      calls++;
      assert.equal(body.roleId, "b");
      return new Promise((resolve) => { resolveDraw = resolve; });
    },
    get: () => Promise.resolve({}),
  }, feedback);
  store.state.anim = { kind: "tear", series: "dusk", doneAt: BASE };
  store.state.picked = [];
  store.enterRing();
  assert.equal(store.state.anim.series, "dusk");
  ["a", "b", "c"].forEach((id) => store.flipCard(id));
  assert.equal(store.state.anim.kind, "top");
  assert.equal(store.state.anim.series, "dusk");
  store.enterPick();
  store.selectSlot("b");
  const pending = store.confirmPick();
  store.selectSlot("a");
  await store.confirmPick();
  assert.equal(calls, 1);
  assert.deepEqual(feedback, ["flip", "flip", "flip"], "The network response has not settled yet");
  assert.equal(store.state.slot, "b");
  const draw = { date: "2026-11-24", role: { id: "b", name: "角色" }, tasks: [], noteDraft: "" };
  resolveDraw(draw);
  await pending;
  assert.deepEqual(feedback, ["flip", "flip", "flip", "settle"]);
  await store.confirmPick();
  assert.equal(feedback.filter((name) => name === "settle").length, 1);
  assert.equal(store.stage(), "reveal");
  assert.equal(store.state.anim.series, "dusk");
  assert.equal(store.state.anim.slotIndex, 1);
  assert.equal(store.state.offer.length, 0);
  store.finishReveal();
  assert.equal(store.stage(), "");
  assert.equal(store.state.draw, draw);
});

test("particles stay bounded and light effects restore canvas opacity", () => {
  const draw = require("../game/js/draw.js");
  const effects = require("../game/js/effects.js");
  let particles = 0;
  const saved = [];
  const ctx = {
    globalAlpha: 0.7,
    save() { saved.push(this.globalAlpha); },
    restore() { this.globalAlpha = saved.pop(); },
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
    quadraticCurveTo() {}, clip() {}, fillRect() {}, fill() {},
    arc(...values) { assert.ok(values.every(Number.isFinite)); particles++; },
    stroke() { particles++; },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
  };
  draw.init({ getContext: () => ctx });
  const rect = { x: 100, y: 100, w: 140, h: 210 };
  effects.burst(rect, 0.4, "#ffffff", 1, 1000);
  assert.equal(particles, effects.MAX_PARTICLES);
  effects.halo(rect, "#ffffff", 1);
  effects.sweep(rect, 0.5);
  assert.equal(ctx.globalAlpha, 0.7);
  effects.burst(rect, 1, "#ffffff", 1);
  assert.equal(particles, effects.MAX_PARTICLES);
});
