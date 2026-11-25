/** Opening feedback is optional: device/audio failures must never stop a draw. */
var env = require("./env.js");
var assets = require("./assets.js");
var enabled = false;
var foreground = true;
var playing = null;
function unlock() { enabled = true; }
function play(name) {
  if (!foreground || !Object.prototype.hasOwnProperty.call(assets.SOUND_FILES, name)) return;
  try {
    var w = env.getWx();
    if (w && typeof w.vibrateShort === "function") w.vibrateShort({ type: "light" });
  } catch (e) { /* Optional haptics. */ }
  if (!enabled) return;
  try {
    var sound = assets.sound(name);
    if (!sound) return;
    if (playing && playing !== sound) playing.stop();
    sound.stop();
    sound.play();
    playing = sound;
  } catch (e) { /* Optional sound; the state machine keeps moving. */ }
}
function pause() { foreground = false; playing = null; assets.stopSounds(); }
function resume() { foreground = true; }
function destroy() { pause(); enabled = false; assets.releaseSounds(); }
module.exports = { unlock: unlock, play: play, pause: pause, resume: resume, destroy: destroy };
