const test = require('node:test');
const assert = require('node:assert/strict');
const { createController } = require('../game/js/pag-reveal.js');
const draw = require('../game/js/draw.js');
const role = (id, name=id) => ({id,name,emoji:'*',tagline:'A role',gradient:['#123','#456'],accent:'#abc'});
const geometry = {x:187.5,y:210,w:180,h:270};
const deferred = () => { let resolve,reject; const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject}; };
const turn = () => new Promise(resolve=>setImmediate(resolve));
function fixture(options={}) {
  const calls={preload:0,created:[],destroyed:[],flushed:[],painted:[],notifications:0};
  const adapter={
    supported:()=>options.supported!==false,
    preload:()=>{calls.preload++;return options.preload ? options.preload() : Promise.resolve();},
    create:input=>{calls.created.push(input.id);return options.create ? options.create(input) : Promise.resolve({id:input.id,canvas:{id:input.id},durationMs:1000,frameRate:60});},
    flush:(resource,progress)=>{calls.flushed.push({id:resource.id,progress});return options.flush ? options.flush(resource,progress) : Promise.resolve();},
    destroy:resource=>{if(!resource)return;assert.equal(resource.destroyed,undefined,'resource destroyed once');resource.destroyed=true;calls.destroyed.push(resource.id);},
  };
  const controller=createController(adapter);
  controller.onFrame(()=>calls.notifications++);
  const ctx={drawImage:canvas=>calls.painted.push(canvas.id)};
  return {controller,calls,ctx};
}
test('unsupported devices never load PAG and retain the Canvas reveal',async()=>{
  const {controller,calls,ctx}=fixture({supported:false});
  assert.equal(await controller.preload(),false);
  assert.equal(await controller.prepare(role('a')),false);
  assert.equal(controller.paint(ctx,{},role('a'),geometry,.5),false);
  assert.equal(calls.preload,0);assert.deepEqual(calls.created,[]);
});
test('preload is shared by concurrent callers and reports initialization failures',async()=>{
  const {controller,calls}=fixture();
  assert.deepEqual(await Promise.all([controller.preload(),controller.preload()]),[true,true]);
  assert.equal(calls.preload,1);
  const broken=fixture({preload:()=>Promise.reject(new Error('wasm unavailable'))});
  assert.equal(await broken.controller.preload(),false);
  assert.match(broken.controller.status().error,/wasm unavailable/);
});
test('a late PAG load cannot switch the current reveal halfway through',async()=>{
  const loading=deferred();
  const {controller,ctx}=fixture({create:()=>loading.promise});
  const prepared=controller.prepare(role('a'));
  const token={};
  assert.equal(controller.paint(ctx,token,role('a'),geometry,0),false);
  await turn();loading.resolve({id:'a',canvas:{id:'a'},durationMs:1000,frameRate:60});await prepared;
  assert.equal(controller.paint(ctx,token,role('a'),geometry,.6),false);
  assert.equal(controller.paint(ctx,{},role('a'),geometry,.6),true);
  await controller.release();
});
test('preparing the same artwork twice reuses the completed frame',async()=>{
  const {controller,calls,ctx}=fixture();
  assert.equal(await controller.prepare(role('a')),true);
  assert.equal(await controller.prepare(role('a')),true);
  assert.equal(controller.paint(ctx,{},role('a'),geometry,0),true);
  assert.deepEqual(calls.created,['a']);assert.deepEqual(calls.painted,['a']);
  await controller.release();assert.deepEqual(calls.destroyed,['a']);
});
test('updating artwork under the same role id rebuilds its replacement bitmap',async()=>{
  const {controller,calls}=fixture();
  await controller.prepare(role('a','First'));await controller.prepare(role('a','Second'));
  assert.deepEqual(calls.created,['a','a']);assert.deepEqual(calls.destroyed,['a']);
  await controller.release();
});
test('rapid selections only prepare the latest role still requested',async()=>{
  const {controller,calls,ctx}=fixture();
  const all=[controller.prepare(role('a')),controller.prepare(role('b')),controller.prepare(role('c'))];
  assert.deepEqual(await Promise.all(all),[false,false,true]);
  assert.deepEqual(calls.created,['c']);
  assert.equal(controller.paint(ctx,{},role('a'),geometry,0),false);
  assert.equal(controller.paint(ctx,{},role('c'),geometry,0),true);
  await controller.release();
});
test('a stale preparation is released before the next role becomes visible',async()=>{
  const first=deferred();
  const {controller,calls,ctx}=fixture({create:input=>input.id==='a'?first.promise:Promise.resolve({id:input.id,canvas:{id:input.id},durationMs:1000,frameRate:60})});
  const old=controller.prepare(role('a'));await turn();
  const next=controller.prepare(role('b'));
  first.resolve({id:'a',canvas:{id:'a'},durationMs:1000,frameRate:60});
  assert.equal(await old,false);assert.equal(await next,true);
  assert.deepEqual(calls.destroyed,['a']);
  assert.equal(controller.paint(ctx,{},role('a'),geometry,.2),false);
  assert.equal(controller.paint(ctx,{},role('b'),geometry,.2),true);
  await controller.release();
});
test('cancelling a pending reveal cannot revive its late frame or redraw',async()=>{
  const first=deferred();
  const {controller,calls}=fixture({create:()=>first.promise});
  const job=controller.prepare(role('a'));await turn();const released=controller.release();
  first.resolve({id:'a',canvas:{id:'a'},durationMs:1000,frameRate:60});
  assert.equal(await job,false);await released;
  assert.equal(controller.status().ready,false);assert.equal(calls.notifications,0);
  assert.deepEqual(calls.destroyed,['a']);
});
test('only one native flush runs, and skip waits for it before freeing the view',async()=>{
  const flushing=deferred();
  const {controller,calls,ctx}=fixture({flush:()=>flushing.promise});
  await controller.prepare(role('a'));const token={};controller.paint(ctx,token,role('a'),geometry,.2);await turn();
  controller.seek(.4);controller.seek(.8);assert.equal(calls.flushed.length,1);
  const notifications=calls.notifications;const released=controller.release();
  assert.equal(controller.paint(ctx,token,role('a'),geometry,.9),false);
  assert.deepEqual(calls.destroyed,[]);
  flushing.resolve();await released;assert.deepEqual(calls.destroyed,['a']);
  assert.equal(calls.notifications,notifications,'stale flush must not request another frame');
});
test('switching roles serializes image replacement after the previous flush',async()=>{
  const flushing=deferred();
  const {controller,calls,ctx}=fixture({flush:()=>flushing.promise});
  await controller.prepare(role('a'));controller.paint(ctx,{},role('a'),geometry,.2);await turn();
  const next=controller.prepare(role('b'));await turn();assert.deepEqual(calls.created,['a']);
  flushing.resolve();await next;
  assert.deepEqual(calls.destroyed,['a']);assert.deepEqual(calls.created,['a','b']);
  await controller.release();
});
test('pause stops seeking, and resume samples current time instead of replaying old frames',async()=>{
  const {controller,calls}=fixture();
  await controller.prepare(role('a'));controller.begin({},role('a'));
  controller.pause();controller.seek(.3);await controller.settled();assert.deepEqual(calls.flushed,[]);
  controller.resume();controller.seek(.86);await controller.settled();
  assert.equal(calls.flushed.length,1);assert.ok(calls.flushed[0].progress>=.85);
  await controller.release();
});
for(const synchronous of [false,true]) test((synchronous?'synchronous':'asynchronous')+' native flush failure falls back and releases the role',async()=>{
  const {controller,calls,ctx}=fixture({flush:()=>{if(synchronous)throw new Error('lost context');return Promise.reject(new Error('lost context'));}});
  await controller.prepare(role('a'));const token={};controller.paint(ctx,token,role('a'),geometry,.3);
  await controller.settled();assert.equal(controller.paint(ctx,token,role('a'),geometry,.4),false);
  assert.equal(controller.status().mode,'fallback');assert.match(controller.status().error,/lost context/);
  assert.deepEqual(calls.destroyed,['a']);await controller.release();
});
test('a synchronous preparation failure leaves a usable fallback',async()=>{
  const {controller,ctx}=fixture({create:()=>{throw new Error('bad image');}});
  assert.equal(await controller.prepare(role('a')),false);
  assert.equal(controller.status().loading,false);assert.match(controller.status().error,/bad image/);
  assert.equal(controller.paint(ctx,{},role('a'),geometry,.4),false);
  await controller.release();
});
test('a Canvas composite failure releases PAG and allows the fallback immediately',async()=>{
  const {controller,calls}=fixture();await controller.prepare(role('a'));
  assert.equal(controller.paint({drawImage:()=>{throw new Error('no texture');}}, {},role('a'),geometry,0),false);
  await controller.settled();assert.deepEqual(calls.destroyed,['a']);assert.match(controller.status().error,/no texture/);
});
test('finish and repeated cleanup release each role exactly once',async()=>{
  const {controller,calls}=fixture();await controller.prepare(role('a'));
  await controller.release();await controller.release();await controller.release();
  assert.deepEqual(calls.destroyed,['a']);assert.equal(controller.status().ready,false);
});
test('a failed bitmap draw restores the original app canvas and context',()=>{
  const originalContext={},bitmapContext={};
  const original={getContext:()=>originalContext};
  draw.init(original);
  assert.throws(()=>draw.withCanvas({getContext:()=>bitmapContext},()=>{
    assert.equal(draw.getCtx(),bitmapContext);throw new Error('bitmap failure');
  }),/bitmap failure/);
  assert.equal(draw.getCtx(),originalContext);assert.equal(draw.getCanvas(),original);
});

test('WeChat errMsg survives the failure path for actionable SDK diagnostics',async()=>{
  const {controller,ctx}=fixture({create:()=>Promise.reject({errMsg:'readFile:fail permission denied'})});
  assert.equal(await controller.prepare(role('a')),false);
  assert.equal(controller.status().error,'readFile:fail permission denied');
  assert.equal(controller.paint(ctx,{},role('a'),geometry,.5),false);
  await controller.release();
});
