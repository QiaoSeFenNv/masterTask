/** Build an isolated WeChat mini-game probe using exactly the production PAG modules. */
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const ROOT=path.resolve(__dirname,'..');
var OUTPUT;
const entry=String.raw`var env = require("./js/env.js");
var draw = require("./js/draw.js");
var pag = require("./js/pag-reveal.js");
var face = require("./js/cardface.js");
var roles = require("./data/roles.js").roles;
var wxRuntime = env.getWx();
env.refreshMetrics();
var metrics = env.size();
var canvas = wxRuntime.createCanvas();
canvas.width = Math.round(metrics.width * metrics.pixelRatio);
canvas.height = Math.round(metrics.height * metrics.pixelRatio);
draw.init(canvas);
var role = roles[1];
var token = {};
var started = Date.now();
var frames = 0;
var hidden = false;
var ticket = null;
var ready = false;
function render() {
  ticket = null;
  if (hidden) return;
  var vp = env.viewport();
  var geometry = { x: vp.width / 2, y: vp.height * 0.42, w: 180, h: 270 };
  var elapsed = Date.now() - started;
  var progress = elapsed > 3600 ? 0.45 : Math.min(1, (elapsed % 1200) / 1000);
  draw.clear();
  draw.fillRect(0, 0, vp.width, vp.height, "#100d1b");
  var painted = pag.paint(draw.getCtx(), token, role, geometry, progress);
  if (painted) frames++;
  else face.paint(geometry.x-90, geometry.y-135, 180, 270, 16, role, { emojiSize:64,nameSize:24,taglineSize:11 });
  draw.text("微信 PAG 揭晓测试", vp.width/2, vp.safeTop+54, {size:18,color:"#eadfc6",align:"center"});
  draw.text(painted ? "PAG 播放成功" : (pag.status().error ? "PAG 加载失败" : "正在准备 PAG"), vp.width/2, geometry.y+190, {size:16,color:painted?"#a8e6cf":"#eadfc6",align:"center"});
  var status = pag.status();
  if (status.error) draw.wrapText(status.error, 24, geometry.y+225, vp.width-48, 17, {size:11,color:"#f4b5ad",maxLines:5});
  else draw.text("同一模板 · 替换旅人卡图 · 60 帧时间轴", vp.width/2, geometry.y+220, {size:11,color:"#b7abca",align:"center"});
  request();
}
function request() { if (!hidden && ticket === null) ticket = env.requestFrame(render, canvas); }
pag.onFrame(request);
if (typeof wxRuntime.onHide === "function") wxRuntime.onHide(function () { hidden=true;pag.pause();env.cancelFrame(ticket);ticket=null; });
if (typeof wxRuntime.onShow === "function") wxRuntime.onShow(function () { hidden=false;pag.resume();request(); });
pag.prepare(role).then(function (success) {
  ready = success;
  token = {}; // Preparation is a separate display stage; begin a fresh reveal when ready.
  started = Date.now();
  console.log("PAG_NATIVE_PROBE", JSON.stringify({ready:ready,status:pag.status(),width:metrics.width,height:metrics.height,pixelRatio:metrics.pixelRatio}));
  request();
});
render();
`;
async function main(){
  OUTPUT=await fs.mkdtemp(path.join(os.tmpdir(),'roles-pag-native-'));
  await fs.cp(path.join(ROOT,'game'),path.join(OUTPUT,'game'),{recursive:true});
  const config=JSON.parse(await fs.readFile(path.join(ROOT,'project.config.json'),'utf8'));
  config.projectname='roles-pag-native-probe';config.description='本地 PAG 揭晓验证';
  config.setting.compileHotReLoad=false;
  await fs.writeFile(path.join(OUTPUT,'project.config.json'),JSON.stringify(config,null,2)+'\n');
  await fs.writeFile(path.join(OUTPUT,'game/game.js'),entry);
  console.log(OUTPUT);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
