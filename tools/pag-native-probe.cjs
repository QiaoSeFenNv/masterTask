/** Build an isolated WeChat mini-game probe using exactly the production PAG modules. */
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const ROOT=path.resolve(__dirname,'..');
var OUTPUT;
const entry=String.raw`var env = require("./js/env.js");
var draw = require("./js/draw.js");
var animation = require("./js/animation.js");
var pack = require("./js/pack.js");
var pag = require("./js/pag-reveal.js");
var face = require("./js/cardface.js");
var effects = require("./js/effects.js");
var roles = require("./data/roles.js").roles;
var wxRuntime = env.getWx();
env.refreshMetrics();
var metrics = env.size(), device = wxRuntime.getSystemInfoSync();
var canvas = wxRuntime.createCanvas();
canvas.width = Math.round(metrics.width * metrics.pixelRatio);
canvas.height = Math.round(metrics.height * metrics.pixelRatio);
draw.init(canvas);
var roleIndex = 1, role = roles[roleIndex], token = {}, stage = "loading";
var version = 0, started = 0, hidden = false, repeating = false, nextAt = 0;
var frameCount = 0, flushCount = 0, gaps = [], lastFrame = 0, interrupted = false;
var lastReport = null, buttons = [];
var loop = animation.createLoop({request:function(fn){return env.requestFrame(fn,canvas);},cancel:env.cancelFrame,
  render:function(time){return animation.withTime(time,paint);}});
function request() { loop.request(); }
function heapBytes() {
  try { var p=wxRuntime.getPerformance();return p.memory&&typeof p.memory.usedJSHeapSize==="number"?p.memory.usedJSHeapSize:null; }
  catch(e) { return null; }
}
function play() {
  var current = ++version;
  stage = "loading";token = {};frameCount = 0;flushCount = 0;gaps = [];lastFrame = 0;interrupted = false;
  pag.prepare(role).then(function(){
    if(current!==version)return;
    started=animation.now();interrupted=hidden;stage="reveal";request();
  });
  request();
}
function finish(reason) {
  if(stage!=="reveal")return;
  var elapsed=animation.now()-started, sorted=gaps.slice().sort(function(a,b){return a-b;});
  lastReport={platform:device.platform,model:device.model,system:device.system,role:role.id,
    mode:pag.status().mode,reason:reason,elapsedMs:elapsed,renderFrames:frameCount,pagFlushes:flushCount,
    renderFps:interrupted?null:Math.round(frameCount*10000/Math.max(1,elapsed))/10,
    p95FrameMs:interrupted||!sorted.length?null:sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))],
    jsHeapBytes:heapBytes(),totalMemoryBytes:null,heat:null,interrupted:interrupted,
    note:"renderFps is Canvas presentation; pagFlushes counts SDK frame notifications. Total memory and heat require device inspection."};
  console.log("PAG_NATIVE_PROBE",JSON.stringify(lastReport));
  stage="result";version++;pag.release();
  if(reason==="tap")repeating=false;
  nextAt=animation.now()+180;
  request();
}
function button(label,x,y,w,action) {
  draw.fillGradientRect(x,y,w,36,["#302638","#221b2c"],160,10);
  draw.strokeRoundRect(x,y,w,36,10,"#a78b63",1);
  draw.text(label,x+w/2,y+24,{size:12,color:"#eadfc6",align:"center"});
  buttons.push({x:x,y:y,w:w,h:36,action:action});
}
function paint() {
  if(hidden)return false;
  var vp=env.viewport(), time=animation.now();
  if(stage==="reveal"&&time-started>=pack.REVEAL_MS)finish("auto");
  if(stage==="result"&&repeating&&time>=nextAt)play();
  var geometry={x:vp.width/2,y:Math.min(vp.height*.38,vp.safeTop+230),w:180,h:270};
  draw.clear();draw.fillRect(0,0,vp.width,vp.height,"#100d1b");
  draw.text("PAG 真机验证 · 无后端",vp.width/2,vp.safeTop+38,{size:17,color:"#eadfc6",align:"center"});
  var status=pag.status(), p=animation.progress(started,pack.REVEAL_MS,time);
  if(stage==="reveal") {
    if(lastFrame&&gaps.length<240)gaps.push(time-lastFrame);lastFrame=time;frameCount++;
    if(!pag.paint(draw.getCtx(),token,role,geometry,p)) {
      effects.halo({x:geometry.x-90,y:geometry.y-135,w:180,h:270},role.accent||"#d5b878",1);
      face.paint(geometry.x-90,geometry.y-135,180,270,16,role,{emojiSize:64,nameSize:24,taglineSize:11});
      effects.sweep({x:geometry.x-90,y:geometry.y-135,w:180,h:270},p);
    }
  } else face.paint(geometry.x-90,geometry.y-135,180,270,16,role,{emojiSize:64,nameSize:24,taglineSize:11});
  var label=stage==="loading"?"正在准备 SDK 与卡面":stage==="reveal"?
    (time-started<pack.REVEAL_FOCUS_MS?"聚焦中 · 380ms 后可点继续":"点一下继续 · 1 秒自动结束"):
    "已结束 · 结果保留 · PAG 已释放";
  draw.text(label,vp.width/2,geometry.y+164,{size:12,color:"#a8e6cf",align:"center"});
  draw.text("实际模式："+(stage==="result"&&lastReport?lastReport.mode:status.mode),vp.width/2,geometry.y+184,{size:11,color:"#b7abca",align:"center"});
  if(lastReport) {
    draw.text("绘制 FPS "+(lastReport.renderFps==null?"--":lastReport.renderFps)+" · PAG flush "+lastReport.pagFlushes,
      vp.width/2,geometry.y+206,{size:11,color:"#eadfc6",align:"center"});
    draw.text(lastReport.jsHeapBytes==null?"内存 / 发热：请在真机性能面板记录":"JS heap "+(lastReport.jsHeapBytes/1048576).toFixed(1)+" MB · 总内存另测",
      vp.width/2,geometry.y+225,{size:10,color:"#b7abca",align:"center"});
  }
  if(status.error&&stage==="result")draw.wrapText(status.error,24,geometry.y+244,vp.width-48,14,{size:9,color:"#f4b5ad",maxLines:2});
  buttons=[];
  if(stage==="result") {
    var y=Math.min(geometry.y+270,vp.height-vp.safeBottom-100), w=(vp.width-60)/2;
    button("重播当前角色",24,y,w,function(){repeating=false;play();});
    button("换角色",36+w,y,w,function(){roleIndex=roleIndex===1?0:1;role=roles[roleIndex];repeating=false;play();});
    button(repeating?"停止连播":"连续播放",24,y+46,w,function(){repeating=!repeating;if(repeating)play();else request();});
    button("复制实测数据",36+w,y+46,w,function(){if(lastReport&&typeof wxRuntime.setClipboardData==="function")wxRuntime.setClipboardData({data:JSON.stringify(lastReport)});});
  }
  return stage==="reveal"||(stage==="result"&&repeating);
}
pag.onFrame(function(){if(stage==="reveal")flushCount++;request();});
if(typeof wxRuntime.onHide==="function")wxRuntime.onHide(function(){hidden=true;if(stage==="reveal")interrupted=true;loop.pause();pag.pause();});
if(typeof wxRuntime.onShow==="function")wxRuntime.onShow(function(){hidden=false;pag.resume();loop.resume();});
if(typeof wxRuntime.onTouchStart==="function")wxRuntime.onTouchStart(function(event){
  if(stage==="reveal") { if(animation.now()-started>=pack.REVEAL_FOCUS_MS)finish("tap");return; }
  var t=event.touches&&event.touches[0];if(!t)return;
  var x=(t.clientX==null?t.x:t.clientX)/env.scale(), y=(t.clientY==null?t.y:t.clientY)/env.scale();
  for(var i=0;i<buttons.length;i++){var b=buttons[i];if(x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h){b.action();return;}}
});
play();
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
