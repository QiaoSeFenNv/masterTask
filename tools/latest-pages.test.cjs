const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const env=require('../game/js/env.js'),draw=require('../game/js/draw.js'),layout=require('../game/js/layout.js');
const animation=require('../game/js/animation.js'),roles=require('../game/data/roles.js').roles;
function setup(){
 const ops=[],stack=[];
 env.setWx({getSystemInfoSync:()=>({windowWidth:375,windowHeight:812,pixelRatio:2,safeArea:{top:44,bottom:778}})});
 const ctx=new Proxy({globalAlpha:1,save(){stack.push(this.globalAlpha);},restore(){this.globalAlpha=stack.pop()??1;},
  measureText:s=>({width:String(s).length*6}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),
  fillText:(...args)=>ops.push(args)}, {get:(o,k)=>k in o?o[k]:()=>{}});
 draw.init({width:750,height:1624,getContext:()=>ctx});
 const vp=env.viewport(),state={status:'ready',tab:'today',draw:{date:'2026-11-27',seed:'a',role:roles[0],tasks:[]},anim:{kind:''},scratch:{complete:false},scroll:250};
 return {vp,state,ops};
}
test('The active today page is one 3D card even when an old scratch snapshot exists',()=>{
 const {vp,state}=setup(),viewer=require('../game/js/today-card.js');viewer.reset();
 const result=require('../game/js/render.js').renderToday(vp,state);
 assert.deepEqual(result.zones.map(z=>z.id),['today-card']);
 assert.equal(result.contentH,layout.contentH(vp));
});
test('A same-role redraw with a new server seed resets the 3D card to its front',()=>{
 const {vp,state}=setup(),v=require('../game/js/today-card.js').create();
 animation.withTime(1000,()=>{v.render(vp,state);v.flip();});
 animation.withTime(1000+v.TURN_MS,()=>{v.render(vp,state);assert.equal(v.snapshot().back,true);});
 animation.withTime(2000,()=>{v.render(vp,{...state,draw:{...state.draw,seed:'b'}});assert.equal(v.snapshot().back,false);assert.equal(v.snapshot().busy,false);});
});
test('Today and history viewers keep independent poses and release canceled gestures',()=>{
 const {vp,state}=setup(),factory=require('../game/js/today-card.js'),a=factory.create(),b=factory.create();
 animation.withTime(1000,()=>{a.render(vp,state);b.render(vp,state);a.flip();});
 animation.withTime(1500,()=>{a.render(vp,state);assert.equal(a.snapshot().back,true);assert.equal(b.snapshot().back,false);
  const r=b.rect(vp);b.begin(r.x,r.y);b.move(r.x+r.w*.7,r.y+50);assert.equal(b.snapshot().dragging,true);b.cancel();assert.equal(b.snapshot().dragging,false);assert.equal(b.snapshot().pitch,0);});
});
test('Every role fits the centered 2:3 today card without requiring the old scroll layout',()=>{
 const {state}=setup(),v=require('../game/js/today-card.js').create();
 for(const height of [540,667,812]){
  const vp={...env.viewport(),height,safeBottom:0};
  for(const role of roles){const result=v.render(vp,{...state,draw:{...state.draw,role}}),r=v.rect(vp);
   assert.equal(result.zones.length,1);assert.ok(Math.abs(r.w/r.h-2/3)<1e-9);assert.ok(r.y>=layout.contentTop(vp));assert.ok(r.y+r.h<layout.contentBottom(vp));}
 }
});
test('Foil textures are registered but lazy, with one request and gradient-compatible failure',()=>{
 const requests=[];env.setWx({createImage:()=>{const image={width:64,height:64};Object.defineProperty(image,'src',{set(src){requests.push({image,src});}});return image;}});
 delete require.cache[require.resolve('../game/js/assets.js')];const assets=require('../game/js/assets.js');assets.preload();
 assert.equal(requests.length,6);assert.equal(assets.foil('deep'),null);assert.equal(requests.length,7);assets.foil('deep');assert.equal(requests.length,7);
 requests[6].image.onerror();assert.equal(assets.foil('deep'),null);assert.equal(requests.length,7);
 for(const file of Object.values(assets.FILES))assert.ok(fs.existsSync('game/assets/'+file));
});
test('The integrated entrypoint uses the new viewers and preserves oil collection rendering',()=>{
 const app=fs.readFileSync('game/js/app.js','utf8'),render=fs.readFileSync('game/js/render.js','utf8');
 assert.match(app,/require\("\.\/today-card\.js"\)/);assert.match(app,/require\("\.\/calendar-card\.js"\)/);
 assert.match(render,/return todayCard\.render\(vp, state\)/);assert.match(render,/roleArt\.paint/);
 const pick=fs.readFileSync('game/js/packview.js','utf8');assert.doesNotMatch(pick,/亲手刮开/);assert.match(pick,/今日页翻面/);
 assert.doesNotMatch(app,/drag\.scratch|scratchPoint/);assert.doesNotMatch(render,/scratchView\.paint|刮开卡背/);
});
