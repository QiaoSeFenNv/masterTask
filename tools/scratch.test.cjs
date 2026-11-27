const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../game/js/scratch.js');
const env = require('../game/js/env.js');
const layout = require('../game/js/layout.js');
const draw = require('../game/js/draw.js');
const role = require('../game/data/roles.js').roles[0];
const raw = seed => ({date:'2026-11-27',role,tasks:role.tasks.slice(0,3),checkins:[],seed});
function sweep(state) {
  for(let y=12;y<model.HEIGHT&&!state.complete;y+=32)model.add(state,{x:8,y},{x:model.WIDTH-8,y});
}
async function setup(data=raw('a'), storage=new Map()) {
  const requests=[],ops=[];let snapshot=data;
  const wx={getStorageSync:key=>storage.get(key)||'',setStorageSync:(key,value)=>storage.set(key,value),removeStorageSync:key=>storage.delete(key),
    getSystemInfoSync:()=>({windowWidth:375,windowHeight:812,pixelRatio:2,safeArea:{top:44,bottom:778}})};
  env.setWx(wx);
  const apiFile=require.resolve('../game/js/api.js');require(apiFile);
  const saved=require.cache[apiFile].exports;
  require.cache[apiFile].exports={get:async url=>url==='/api/draw/today'?{date:snapshot.date,drawn:true,draw:snapshot,canRedraw:true}:{},
    post:async()=>{},patch:async(...args)=>requests.push(args)};
  delete require.cache[require.resolve('../game/js/store.js')];
  const store=require('../game/js/store.js');require.cache[apiFile].exports=saved;
  await store.loadToday();
  const stack=[];
  const ctx=new Proxy({globalAlpha:1,save(){stack.push(this.globalAlpha);},restore(){this.globalAlpha=stack.pop()??1;},measureText:t=>({width:String(t).length*6}),createLinearGradient:()=>({addColorStop(){}}),
    createRadialGradient:()=>({addColorStop(){}}),fillText:(...args)=>ops.push(['text',...args]),fill:()=>ops.push(['fill']),
    drawImage:(...args)=>ops.push(['image',...args])},{get:(o,k)=>k in o?o[k]:()=>{}});
  const canvas={width:750,height:1624,getContext:()=>ctx};draw.init(canvas);
  return {store,storage,requests,ops,canvas,setRaw:next=>{snapshot=next;}};
}
test('A tap scratches only a small round area; repeating it cannot unlock a card',()=>{
  const s=model.create('a');model.add(s,{x:150,y:150},{x:150,y:150});const progress=s.progress;
  assert.ok(progress>0 && progress<0.03);
  for(let i=0;i<200;i++)model.add(s,{x:150,y:150},{x:150,y:150});
  assert.equal(s.progress,progress);assert.equal(s.marks.length,1);assert.equal(s.complete,false);
});
test('Sparse pointer moves erase a continuous capsule, not disconnected points',()=>{
  const s=model.create('a');model.add(s,{x:2,y:120},{x:333,y:120});
  for(let col=1;col<model.COLS-1;col++)assert.equal(s.cells[11*model.COLS+col],1);
  assert.ok(s.progress>0.1 && s.progress<0.16);
});
test('Off-card / invalid moves add no coverage and long lines remain bounded',()=>{
  const s=model.create('a');assert.equal(model.add(s,{x:-100,y:-100},{x:-80,y:-80}),false);
  assert.equal(model.add(s,{x:NaN,y:1},{x:1,y:1}),false);
  model.add(s,{x:-100000,y:150},{x:100000,y:150});
  assert.ok(s.marks[0][0]>=-model.RADIUS && s.marks[0][2]<=model.WIDTH+model.RADIUS);
});
test('Distinct strokes accumulate and 60% clears the remainder exactly once',()=>{
  const s=model.create('a');sweep(s);assert.equal(s.complete,true);assert.equal(s.progress,1);
  const revision=s.revision;assert.equal(model.add(s,{x:0,y:0},{x:300,y:300}),false);assert.equal(s.revision,revision);
  assert.ok(s.marks.length<=model.COLS*model.ROWS);
});
test('Snapshot restore retains partial strokes, but not another draw seed',()=>{
  const s=model.create('a');model.add(s,{x:0,y:40},{x:335,y:40});const saved=model.snapshot(s);
  const restored=model.restore('a',saved);assert.deepEqual(restored.cells,s.cells);assert.equal(restored.progress,s.progress);
  assert.equal(model.restore('b',saved).progress,0);saved.marks[0][0]=1000000;
  assert.equal(model.restore('a',saved).progress,0);
});
test('Malformed or oversized local progress cannot crash rendering',()=>{
  for(const saved of [null,'broken',{}, {version:1,key:'a',marks:'bad'}, {version:1,key:'a',marks:[[0,0,NaN,1]]},
    {version:1,key:'a',marks:new Array(2000).fill([0,0,0,0])}])assert.equal(model.restore('a',saved).progress,0);
});
test('Pending today content gates task and note writes until actually scratched',async()=>{
  const {store,requests}=await setup();const before=store.state.draw.tasks[0].done;
  store.toggleTask(store.state.draw.tasks[0].id);store.setNoteDraft('hidden');await store.saveNote();
  assert.equal(store.state.draw.tasks[0].done,before);assert.equal(requests.length,0);
  sweep(store.state.scratch);store.toggleTask(store.state.draw.tasks[0].id);await store.saveNote();
  assert.equal(store.state.draw.tasks[0].done,!before);assert.equal(requests.length,2);
});
test('Store persists partial progress across reloads/tabs and isolates dates/seeds',async()=>{
  const {store,storage,setRaw}=await setup();store.scratchStroke({x:0,y:90},{x:335,y:90});
  const p=store.state.scratch.progress;store.setTab('collection');assert.ok(storage.has('roles.scratch.v1'));
  await store.loadToday();assert.equal(store.state.scratch.progress,p);
  setRaw(raw('b'));await store.loadToday();assert.equal(store.state.scratch.progress,0);
  setRaw({...raw('b'),date:'2026-11-28'});await store.loadToday();assert.equal(store.state.scratch.progress,0);
});
test('Existing checkins bypass scratching, and unavailable storage is harmless',async()=>{
  const {store}=await setup({...raw('a'),checkins:[{taskId:role.tasks[0].id,done:true,note:''}]});
  assert.equal(store.scratchPending(),false);
  env.setWx({getStorageSync(){throw Error('blocked');},setStorageSync(){throw Error('blocked');}});
  await store.loadToday();assert.doesNotThrow(()=>store.saveScratch());
});
test('Today render provides only a clipped scratch zone, then normal task zones',async()=>{
  const {store,ops}=await setup();const view=require('../game/js/render.js'),vp=env.viewport();
  let result=view.renderToday(vp,store.state);assert.deepEqual(result.zones.map(z=>z.id),['scratch','redraw']);
  const z=result.zones[0];assert.ok(z.rect.y>=layout.contentTop(vp));assert.ok(z.rect.y+z.rect.h<=layout.contentBottom(vp));
  const lastText=ops.map(o=>o[0]).lastIndexOf('text');assert.ok(lastText>=0);
  sweep(store.state.scratch);result=view.renderToday(vp,store.state);assert.ok(result.zones.some(z=>z.id==='task'));
  assert.ok(!result.zones.some(z=>z.id==='scratch'));
});
test('Canceled scratch gestures save progress without scrolling or checking a task',async()=>{
  const {store,storage,canvas}=await setup();delete require.cache[require.resolve('../game/js/app.js')];
  const app=require('../game/js/app.js');app.setCanvas(canvas);app.render();app.render(Date.now()+220);
  const r=layout.todayScratchRect(),top=layout.contentTop(env.viewport());
  const packet=(x,y)=>({touches:[{clientX:x,clientY:y}],changedTouches:[{clientX:x,clientY:y}]});
  app.onTouchStart(packet(r.x+20,top+r.y+30));app.onTouchMove(packet(r.x+250,top+r.y+50));
  app.onTouchEnd({canceled:true});assert.ok(JSON.parse(storage.get('roles.scratch.v1')).marks.length>0);
  assert.equal(store.state.scroll,0);assert.equal(store.state.draw.doneCount,0);
  const p=store.state.scratch.progress;app.onTouchMove(packet(r.x+300,top+r.y+140));assert.equal(store.state.scratch.progress,p);
});
test('Wheel-tagged gestures over the card scroll but never scratch',async()=>{
  const {store,canvas}=await setup();delete require.cache[require.resolve('../game/js/app.js')];
  const app=require('../game/js/app.js');app.setCanvas(canvas);app.render();app.render(Date.now()+220);
  const r=layout.todayScratchRect(),top=layout.contentTop(env.viewport());
  const packet=y=>({touches:[{clientX:180,clientY:y}],changedTouches:[{clientX:180,clientY:y}],scrollOnly:true});
  app.onTouchStart(packet(top+r.y+20));app.onTouchMove(packet(top+r.y-100));app.onTouchEnd(packet(top+r.y-100));
  assert.equal(store.state.scratch.progress,0);assert.ok(store.state.scroll>0);
});

function coverHarness(offscreen = true) {
  const ops=[], layers=[];let image=null,failComposite=false;
  const context = name => new Proxy({
    createLinearGradient:()=>({addColorStop(){}}),
    fill:()=>ops.push([name,'fill']),stroke:()=>ops.push([name,'stroke']),
    rect:(...args)=>ops.push([name,'rect',...args]),
    drawImage:source=>{if(name==='main'&&failComposite)throw Error('composite failed');ops.push([name,'image',source]);},
  },{get:(o,k)=>k in o?o[k]:()=>{}});
  const mainContext=context('main'),main={width:750,height:1624,getContext:()=>mainContext};
  const wx={};
  if(offscreen)wx.createOffscreenCanvas=options=>{const layer={...options,getContext:()=>context('layer'+layers.length)};layers.push(layer);return layer;};
  env.setWx(wx);draw.init(main);
  const assetsFile=require.resolve('../game/js/assets.js'),saved=require(assetsFile).role;
  require(assetsFile).role=()=>image;
  delete require.cache[require.resolve('../game/js/scratch-view.js')];const view=require('../game/js/scratch-view.js');
  return {view,ops,layers,changeImage:()=>{image={width:512,height:768};},fail:()=>{failComposite=true;},close:()=>{require(assetsFile).role=saved;view.release();}};
}
test('Oil-cover cache replays strokes after an image arrives or the DPR changes',()=>{
  const h=coverHarness(),s=model.create('image'),rect={x:20,y:150,w:335,h:340,r:16};
  try {
    model.add(s,{x:10,y:70},{x:300,y:70});h.view.paint(rect,role,s);assert.equal(h.layers.length,1);
    h.view.paint(rect,role,s);assert.equal(h.layers.length,1);
    const strokes=h.ops.filter(o=>o[1]==='stroke').length;assert.equal(strokes,1);
    h.changeImage();h.view.paint(rect,role,s);assert.equal(h.layers.length,2);
    assert.equal(h.ops.filter(o=>o[1]==='stroke').length,2);
    draw.getCanvas().width=1125;h.view.paint(rect,role,s);assert.equal(h.layers.length,3);
    assert.equal(h.ops.filter(o=>o[1]==='stroke').length,3);
  } finally {h.close();}
});
test('No offscreen Canvas paints a full cover first, then clips only scratched cells',()=>{
  const h=coverHarness(false),s=model.create('fallback'),rect={x:20,y:150,w:335,h:340,r:16};
  try {
    h.view.paint(rect,role,s);const whole=h.ops.filter(o=>o[1]==='rect').length;
    assert.equal(whole,model.COLS*model.ROWS);assert.ok(h.ops.some(o=>o[1]==='fill'));
    model.add(s,{x:10,y:60},{x:300,y:60});h.ops.length=0;h.view.paint(rect,role,s);
    assert.equal(h.ops.filter(o=>o[1]==='rect').length,model.COLS*model.ROWS-s.count);
  } finally {h.close();}
});
test('A failed offscreen composite falls back to an opaque clipped cover',()=>{
  const h=coverHarness(),s=model.create('failed'),rect={x:20,y:150,w:335,h:340,r:16};
  try {
    h.fail();h.view.paint(rect,role,s);
    assert.equal(h.ops.filter(o=>o[0]==='main'&&o[1]==='rect').length,model.COLS*model.ROWS);
    assert.ok(h.ops.some(o=>o[0]==='main'&&o[1]==='fill'));
  } finally {h.close();}
});

test('Completing a mask mid-gesture never transfers that finger into task clicks or scrolling',async()=>{
  const {store,canvas}=await setup();delete require.cache[require.resolve('../game/js/app.js')];
  const app=require('../game/js/app.js');app.setCanvas(canvas);app.render();app.render(Date.now()+220);
  const r=layout.todayScratchRect(),top=layout.contentTop(env.viewport());
  const packet=(x,y)=>({touches:[{clientX:x,clientY:y}],changedTouches:[{clientX:x,clientY:y}]});
  for(let y=12;y<180;y+=32)store.scratchStroke({x:8,y},{x:327,y});
  app.render(Date.now()+220);assert.equal(store.scratchPending(),true);
  const y=top+r.y+210;
  app.onTouchStart(packet(r.x+8,y));app.onTouchMove(packet(r.x+r.w-8,y));app.render();
  assert.equal(store.scratchPending(),false);
  app.onTouchMove(packet(r.x+100,y-200));app.onTouchEnd(packet(r.x+100,y-200));
  assert.equal(store.state.scroll,0);assert.equal(store.state.draw.doneCount,0);
});
test('A gesture starting outside the cover cannot become a scratch when it enters',async()=>{
  const {store,canvas}=await setup();delete require.cache[require.resolve('../game/js/app.js')];
  const app=require('../game/js/app.js');app.setCanvas(canvas);app.render();app.render(Date.now()+220);
  const r=layout.todayScratchRect(),top=layout.contentTop(env.viewport());
  const packet=(x,y)=>({touches:[{clientX:x,clientY:y}],changedTouches:[{clientX:x,clientY:y}]});
  app.onTouchStart(packet(7,top+r.y+60));app.onTouchMove(packet(200,top+r.y+20));app.onTouchEnd(packet(200,top+r.y+20));
  assert.equal(store.state.scratch.progress,0);assert.ok(store.state.scroll>0);
});
test('Bad serialized storage starts a fresh card; complete snapshots remain complete after restart',async()=>{
  const storage=new Map([['roles.scratch.v1','{invalid']]);const {store}=await setup(raw('a'),storage);
  assert.equal(store.state.scratch.progress,0);sweep(store.state.scratch);store.saveScratch();
  await store.loadToday();assert.equal(store.scratchPending(),false);assert.equal(store.state.scratch.progress,1);
});
test('Scratch actions do nothing in candidate/reveal stages or in another tab',async()=>{
  const {store}=await setup();store.state.anim={kind:'reveal'};
  assert.equal(store.scratchStroke({x:0,y:50},{x:335,y:50}),false);
  store.state.anim={kind:''};store.setTab('calendar');
  assert.equal(store.scratchStroke({x:0,y:50},{x:335,y:50}),false);assert.equal(store.state.scratch.progress,0);
});

// Regression: use displayed entry geometry rather than settled layout coordinates.
test('Scratch input inverse-maps entry scale and keeps previous points in cover space',async()=>{
  const {store,canvas}=await setup();delete require.cache[require.resolve('../game/js/app.js')];
  const app=require('../game/js/app.js'),vp=env.viewport(),cover=layout.todayScratchRect();
  cover.y+=layout.contentTop(vp);const cx=vp.width/2,cy=layout.contentTop(vp)+layout.contentH(vp)/2;
  const packet=(x,y,k)=>({touches:[{clientX:cx+(cover.x+x-cx)*k,clientY:cy+(cover.y+y-cy)*k}]});
  const t=Date.now();app.setCanvas(canvas);app.render(t);
  app.onTouchStart(packet(80,60,0.96));
  assert.ok(Math.abs(store.state.scratch.marks[0][0]-80)<0.001);
  assert.ok(Math.abs(store.state.scratch.marks[0][1]-60)<0.001);
  app.render(t+110);const k=0.96+0.04*0.875;
  app.onTouchMove(packet(270,80,k));app.onTouchEnd({canceled:true});
  const m=store.state.scratch.marks[1];
  assert.ok(Math.abs(m[0]-80)<0.001 && Math.abs(m[1]-60)<0.001);
  assert.ok(Math.abs(m[2]-270)<0.001 && Math.abs(m[3]-80)<0.001);
});
test('Entry fade never draws hidden task text underneath a translucent cover',async()=>{
  const {store,canvas,ops}=await setup();delete require.cache[require.resolve('../game/js/app.js')];
  const app=require('../game/js/app.js');app.setCanvas(canvas);const t=Date.now();
  for(const time of [t,t+110]){
    ops.length=0;app.render(time);
    for(const task of store.state.draw.tasks)assert.equal(ops.some(o=>o[0]==='text'&&task.text.startsWith(o[1])&&o[1].length>8),false);
  }
  ops.length=0;app.render(t+220);
  assert.ok(ops.some(o=>o[0]==='text'&&store.state.draw.tasks[0].text.startsWith(o[1])&&o[1].length>8));
});
test('Offscreen cover composites inherit the page entry opacity',()=>{
  const h=coverHarness(),s=model.create('alpha'),ctx=draw.getCtx();
  let alpha;ctx.globalAlpha=0.4;ctx.drawImage=()=>{alpha=ctx.globalAlpha;};
  try{h.view.paint({x:20,y:150,w:335,h:340,r:16},role,s);assert.equal(alpha,0.4);}finally{h.close();}
});

test('Revealed task text leaves space for its tag capsule',async()=>{
  const {store,ops}=await setup();sweep(store.state.scratch);ops.length=0;
  const vp=env.viewport();require('../game/js/render.js').renderToday(vp,store.state);
  const top=layout.contentTop(vp);
  store.state.draw.tasks.forEach((task,i)=>{
    if(!task.tag)return;
    const r=layout.todayTaskRect(i),tagLeft=r.x+r.w-(draw.measure(task.tag,9.5)+12)-12;
    const lines=ops.filter(o=>o[0]==='text'&&o[2]===r.x+40&&[top+r.y+24,top+r.y+41].includes(o[3]));
    assert.ok(lines.length>0);
    for(const line of lines)assert.ok(line[2]+draw.measure(line[1],12.5)<=tagLeft-8);
  });
});
