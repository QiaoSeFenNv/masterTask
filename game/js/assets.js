/**
 * 图片资源：卡包外表、场景背景和已完成的角色油画。
 *
 * 全部懒加载：没加载好时返回 null，调用方自己退回纯渐变的画法，
 * 所以启动第一帧永远是完整的，图片到了下一帧自然顶上去。
 *
 * 只在有 wx.createImage 的环境里真的去加载（小游戏 / 模拟器）；
 * Node 里跑测试时没有，就一直是 null，走的还是渐变那条路。
 */

var env = require("./env.js");

var BASE = "assets/";

/** id -> { img, state }  state: "idle" | "loading" | "ok" | "fail" */
var table = {};
var listeners = [];
var kicked = false;

var PACK_IDS = ["deep", "dusk", "dawn"];
var SOUND_FILES = {tear:"sfx/tear.wav",flip:"sfx/flip.wav",settle:"sfx/settle.wav"};
var sounds = {};

/** 要加载的全部文件：键名 -> 文件名 */
var FILES = {};
PACK_IDS.forEach(function (id) {
  FILES["pack:" + id] = "pack-" + id + ".jpg";
  FILES["foil:" + id] = "packet-foil-" + id + ".png";
  FILES["bg:" + id] = "bg-" + id + ".jpg";
});

// Only register artwork that actually ships; missing portraits must not issue 404s.
FILES["role:detective"] = "role-detective.jpg";

// Temporary oil-painted scenery for roles whose dedicated portraits are not ready.
// These are visual backdrops, not pack membership (packs do not affect the draw).
var ROLE_SCENES = {};
var SCENE_ROLES = {
  deep: ["detective", "apprentice", "architect", "watchmaker", "nightwatch", "alchemist", "surveyor"],
  dusk: ["poet", "screenwriter", "collector", "photographer", "translator", "storyteller", "bard"],
  dawn: ["wanderer", "gardener", "chef", "courier", "explorer", "coach"],
};
Object.keys(SCENE_ROLES).forEach(function (scene) {
  SCENE_ROLES[scene].forEach(function (id) { ROLE_SCENES[id] = scene; });
});

function notify() {
  for (var i = 0; i < listeners.length; i++) {
    try {
      listeners[i]();
    } catch (e) {
      /* 监听方自己崩了不该拖垮别的 */
    }
  }
}

function load(key, file) {
  if (table[key]) return;
  var w = env.getWx();
  if (!w || typeof w.createImage !== "function") return;

  var entry = { img: null, state: "loading" };
  table[key] = entry;

  var img;
  try {
    img = w.createImage();
  } catch (e) {
    entry.state = "fail";
    return;
  }

  img.onload = function () {
    entry.img = img;
    entry.state = "ok";
    notify();
  };
  img.onerror = function () {
    entry.state = "fail";
  };
  img.src = BASE + file;
}

/** 启动时调一次就够了，重复调不会重复加载 */
function preload() {
  if (kicked) return;
  kicked = true;
  Object.keys(FILES).forEach(function (k) {
    if (k.indexOf("role:") !== 0 && k.indexOf("foil:") !== 0) load(k, FILES[k]);
  });
}

function get(key) {
  var e = table[key];
  return e && e.state === "ok" ? e.img : null;
}

/** 卡包外表（2:3 竖图） */
function pack(seriesId) {
  return get("pack:" + seriesId);
}

/** Transparent satin highlights for seals and folds; the original art stays separate. */
function foil(seriesId) {
  var key = "foil:" + seriesId;
  if (FILES[key]) load(key, FILES[key]);
  return get(key);
}

/** 卡包背景（正方形） */
function bg(seriesId) {
  return get("bg:" + seriesId);
}

/** Role portraits load only when a visible, unlocked card requests one. */
function role(roleId) {
  var key = "role:" + roleId;
  if (FILES[key]) load(key, FILES[key]);
  return get(key) || (ROLE_SCENES[roleId] ? bg(ROLE_SCENES[roleId]) : null);
}

/** 图片到齐 / 有新的到了就回调一次，用来触发重绘 */
function onLoad(cb) {
  if (typeof cb === "function") listeners.push(cb);
}

/** 还有没有在路上的（调试 / 测试用） */
function pending() {
  var n = 0;
  Object.keys(table).forEach(function (k) {
    if (table[k].state === "loading") n++;
  });
  return n;
}

/** Three cached short sounds; loading does not start playback. */
function sound(name) {
  if (!Object.prototype.hasOwnProperty.call(SOUND_FILES, name)) return null;
  if (sounds[name]) return sounds[name].state === "fail" ? null : sounds[name].audio;
  var w;
  try { w = env.getWx(); } catch (e) { return null; }
  if (!w || typeof w.createInnerAudioContext !== "function") return null;
  var entry = {audio:null,state:"loading"};
  sounds[name] = entry;
  try {
    var audio = w.createInnerAudioContext();
    entry.audio = audio;
    audio.autoplay = false;
    audio.loop = false;
    audio.volume = 0.18;
    audio.obeyMuteSwitch = true;
    if (typeof audio.onCanplay === "function") audio.onCanplay(function () { entry.state = "ok"; });
    if (typeof audio.onError === "function") audio.onError(function () {
      entry.state = "fail";
      entry.audio = null;
      try { audio.destroy(); } catch (e) { /* Already unavailable. */ }
    });
    audio.src = BASE + SOUND_FILES[name];
    return entry.audio;
  } catch (e) {
    entry.state = "fail";
    if (entry.audio) { try { entry.audio.destroy(); } catch (ignored) {} }
    entry.audio = null;
    return null;
  }
}
function preloadSounds() { Object.keys(SOUND_FILES).forEach(sound); }
function stopSounds() {
  Object.keys(sounds).forEach(function (name) {
    var audio = sounds[name].audio;
    if (audio) { try { audio.stop(); } catch (e) { /* Optional sound. */ } }
  });
}
function releaseSounds() {
  Object.keys(sounds).forEach(function (name) {
    var audio = sounds[name].audio;
    if (audio) { try { audio.destroy(); } catch (e) { /* Optional sound. */ } }
  });
  sounds = {};
}

module.exports = {
  preload: preload,
  preloadSounds: preloadSounds,
  sound: sound,
  stopSounds: stopSounds,
  releaseSounds: releaseSounds,
  SOUND_FILES: SOUND_FILES,
  pack: pack,
  foil: foil,
  bg: bg,
  role: role,
  onLoad: onLoad,
  pending: pending,
  FILES: FILES
};
