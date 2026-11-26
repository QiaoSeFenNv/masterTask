const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {createController}=require('../game/js/pag-tear.js');
const pack=require('../game/js/pack.js'),spec=require('../game/js/pag-tear-template.js');
const deep=pack.seriesOf('deep'),dusk=pack.seriesOf('dusk');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function adapter(overrides={}){const created=[],destroyed=[],flushed=[];return {created,destroyed,flushed,supported:()=>true,preload:async()=>true,
  create:async series=>{const r={canvas:{series:series.id},durationMs:spec.durationMs,frameRate:spec.frameRate};created.push(r);return r;},
  destroy:r=>{if(r)destroyed.push(r);},flush:async(r,p)=>{flushed.push(p);},...overrides};}
test('tear is optional without WXWebAssembly, including preload and release',async()=>{
  const a=adapter({supported:()=>false}),c=createController(a);assert.equal(await c.preload(),false);assert.equal(await c.prepare(deep),false);
  assert.equal(c.begin(1,deep),'fallback');assert.equal(c.paint({drawImage(){}},1,deep,{x:0,y:0,w:375,h:500},.5),false);await c.release();assert.equal(a.created.length,0);
});
test('one warmed SDK and same-series preparation are reused; identical PAG frames are not flushed twice',async()=>{
  let preloads=0;const a=adapter({preload:async()=>{preloads++;}}),c=createController(a);await Promise.all([c.preload(),c.preload()]);
  await c.prepare(deep);await c.prepare(deep);assert.equal(c.begin(1,deep),'pag');
  for(const p of [0,.2,.201,.8]){c.seek(p);await c.settled();}assert.equal(preloads,1);assert.equal(a.created.length,1);assert.deepEqual(a.flushed,[26/132,105/132]);await c.release();
});
test('an in-flight flush is unique and release waits for it before freeing the surface',async()=>{
  const gate=deferred();let calls=0,active=0,max=0;const a=adapter({flush:async()=>{calls++;active++;max=Math.max(max,active);await gate.promise;active--;}}),c=createController(a);
  await c.prepare(deep);c.begin(1,deep);c.seek(.2);await tick();c.seek(.8);assert.equal(calls,1);
  const releasing=c.release();assert.equal(a.destroyed.length,0);gate.resolve();await releasing;assert.equal(max,1);assert.equal(a.destroyed.length,1);assert.equal(c.status().ready,false);
});
test('a stale deep packet cannot overwrite a newer dusk preparation',async()=>{
  const gate=deferred(),a=adapter(),normal=a.create;a.create=series=>series.id==='deep'?gate.promise:normal(series);const c=createController(a);
  const first=c.prepare(deep);await tick();const second=c.prepare(dusk);const stale={canvas:{series:'deep'},durationMs:spec.durationMs,frameRate:60};gate.resolve(stale);
  assert.equal(await first,false);assert.equal(await second,true);assert.ok(a.destroyed.includes(stale));const drawn=[];
  assert.equal(c.paint({drawImage:canvas=>drawn.push(canvas.series)},2,dusk,{x:0,y:0,w:375,h:500},0),true);assert.deepEqual(drawn,['dusk']);await c.release();
});
test('preparation arriving after the swipe keeps Canvas for that entire completion',async()=>{
  const gate=deferred(),a=adapter({create:()=>gate.promise}),c=createController(a);const preparing=c.prepare(deep);assert.equal(c.begin(11,deep),'fallback');
  gate.resolve({canvas:{},durationMs:spec.durationMs,frameRate:60});assert.equal(await preparing,true);assert.equal(c.begin(11,deep),'fallback');assert.equal(c.begin(12,deep),'pag');await c.release();
});
test('SDK or template preparation failure stays skippable by the same slow Canvas extraction',async()=>{
  const c=createController(adapter({create:async()=>{throw new Error('template failed');}}));assert.equal(await c.prepare(deep),false);assert.equal(c.begin(1,deep),'fallback');assert.match(c.status().error,/template failed/);await c.release();
});
test('a failed flush frees the resource and cannot restart PAG in the same completion',async()=>{
  const a=adapter({flush:async()=>{throw new Error('flush failed');}}),c=createController(a);await c.prepare(deep);c.begin(1,deep);c.seek(.4);await c.settled();await c.settled();
  assert.equal(c.status().mode,'fallback');assert.equal(c.status().ready,false);assert.equal(a.destroyed.length,1);assert.match(c.status().error,/flush failed/);
  await c.prepare(deep);assert.equal(c.begin(1,deep),'fallback');await c.release();assert.equal(a.destroyed.length,1);
});
test('background pause suppresses flush; resume samples the shared clock progress',async()=>{
  const a=adapter(),c=createController(a);await c.prepare(deep);c.begin(1,deep);c.pause();c.seek(.4);await c.settled();assert.deepEqual(a.flushed,[]);
  c.resume();c.seek(.75);await c.settled();assert.deepEqual(a.flushed,[99/132]);await c.release();
});
test('Canvas composition failure is a sticky fallback, including a queued flush',async()=>{
  const a=adapter(),c=createController(a);await c.prepare(deep);
  assert.equal(c.paint({drawImage(){throw new Error('canvas failed');}},1,deep,{x:0,y:0,w:375,h:500},.3),false);
  await c.settled();assert.equal(c.begin(1,deep),'fallback');assert.equal(a.destroyed.length,1);assert.match(c.status().error,/canvas failed/);await c.release();
});
test('tear-only packaging matches its raw file and rejects a reveal contract or damaged PAG',async()=>{
  const {validate,packTearTemplate}=require('./pack-pag-tear.cjs'),data=await fs.readFile(path.join(__dirname,'../game/assets/pag/tear.pag'));
  const temporary=await fs.mkdtemp(path.join(require('node:os').tmpdir(),'roles-tear-pack-'));
  let packaged;
  try{await packTearTemplate(spec,data,temporary);packaged=require(path.join(temporary,'game/data/tear-pag.js'));}
  finally{const resolved=await fs.realpath(temporary),parent=await fs.realpath(require('node:os').tmpdir());
    assert.equal(path.dirname(resolved),parent);assert.ok(path.basename(resolved).startsWith('roles-tear-pack-'));await fs.rm(resolved,{recursive:true,force:true});}
  assert.deepEqual(Buffer.from(packaged.data,'base64'),data);
  assert.equal(packaged.sha256,crypto.createHash('sha256').update(data).digest('hex'));validate(spec,data);
  assert.throws(()=>validate({...spec,durationMs:1000},data),/2200ms/);assert.throws(()=>validate(spec,Buffer.from('bad PAG')),/unencrypted/);
  assert.ok(spec.textures.every(texture=>texture.name!=='card'),'No editable role face is required');
});

test('ten card backs leave one at a time rather than appearing together',()=>{
  const flight=require('../game/js/tear-flight.js'),cards=flight.plan(10);
  const born=p=>cards.filter(card=>flight.sample(card,p).opacity>0).length;
  assert.deepEqual([born(0),born(.06),born(.12),born(.24),born(.52)],[0,1,2,5,10]);
  assert.equal(new Set(cards.map(card=>card.slot.i)).size,10);
  assert.ok(cards.every((card,i)=>i===0 || card.start>cards[i-1].start));
  for(const card of cards)assert.equal(flight.sample(card,card.start).opacity,0);
});
test('card flight clears the mouth and ends on the existing ring without a position cut',()=>{
  const flight=require('../game/js/tear-flight.js'),cards=flight.plan(10);
  for(const card of cards){
    const p=card.start+flight.SLIDE_MS/flight.DURATION_MS*.40,airborne=flight.sample(card,p),end=flight.sample(card,1),slot=card.slot;
    const mouth=pack.tearRect(0).y+require("../game/js/packet-surface.js").SEAM+flight.packet(p).drop;
    assert.ok(airborne.y-airborne.scaleY*69<mouth,'The card top slides through the opening while its bottom stays behind the wrapper');
    assert.ok(Math.abs(end.x-slot.x)<1e-9 && Math.abs(end.y-slot.y)<1e-9);
    assert.ok(Math.abs(end.scaleX*92-slot.w*slot.scale*slot.wscale)<1e-9);
    assert.ok(Math.abs(end.scaleY*138-slot.h*slot.scale)<1e-9);
    assert.ok(Math.abs(end.rotation)<1e-9 && Math.abs(end.opacity-slot.alpha)<1e-9);
  }
});
test('spent wrapper clears the final card layout while the original finish timings remain intact',()=>{
  const flight=require('../game/js/tear-flight.js');
  assert.equal(flight.packet(0).opacity,1);assert.equal(flight.packet(.40).opacity,1);
  assert.ok(flight.packet(.80).opacity>0 && flight.packet(.80).opacity<1);assert.equal(flight.packet(1).opacity,0);
  assert.equal(pack.TEAR_SWIPE,150);assert.equal(pack.TEAR_FINISH_MS,480);assert.equal(spec.durationMs,2200);assert.equal(flight.DURATION_MS,2200);
});

test('a left gesture never paints a cached right-facing first frame, then reuses the same PAG resource',async()=>{
  const gate=deferred(),seen=[];let paints=0;
  const a=adapter({flush:async(r,p,direction)=>{seen.push({p,direction});await gate.promise;}}),c=createController(a);
  await c.prepare(deep);assert.equal(c.begin(50,deep,-1),'pag');
  const rect={x:0,y:0,w:375,h:500,direction:-1},ctx={drawImage(){paints++;}};
  assert.equal(c.paint(ctx,50,deep,rect,0),false);await tick();
  assert.equal(c.paint(ctx,50,deep,rect,0),false);assert.equal(paints,0);assert.deepEqual(seen,[{p:0,direction:-1}]);
  gate.resolve();await c.settled();assert.equal(c.paint(ctx,50,deep,rect,0),true);assert.equal(paints,1);assert.equal(a.created.length,1);
  await c.release();assert.equal(a.destroyed.length,1);
});
test('pouch seal and PAG clipping share the same upper opening, keeping the printed body intact',()=>{
  assert.equal(spec.packet.seam,require('../game/js/packet-surface.js').SEAM);
  assert.equal(spec.packet.seam,24);assert.ok(spec.textures.filter(t=>t.name.startsWith('strip-')).every(t=>t.height===42));
  assert.equal(spec.textures.find(t=>t.name==='packet-mouth').height,40);
});

test('each card slides for 600ms, holds as a stack, then spreads without a velocity jump',()=>{
  const flight=require('../game/js/tear-flight.js'),cards=flight.plan(10),first=cards[0];
  const before=flight.sample(first,.46),held=flight.sample(first,.64);
  assert.equal(before.progress,1);assert.equal(held.progress,1);assert.equal(before.spread,0);assert.equal(held.spread,0);
  assert.equal(before.y,held.y);assert.equal(before.x,held.x);assert.equal(flight.SLIDE_MS,600);
  for(const card of cards){
    let previous=flight.sample(card,0);
    for(let ms=1000/60;ms<=flight.DURATION_MS;ms+=1000/60){
      const current=flight.sample(card,ms/flight.DURATION_MS);
      assert.ok(Math.hypot(current.x-previous.x,current.y-previous.y)<9,'No per-frame position cut');
      assert.equal(current.rotation,0,'Cards stay upright instead of exploding into a rotating fan');
      previous=current;
    }
  }
});

test('main Canvas composites a stable PAG snapshot while the next GL flush is in flight',async()=>{
  const gate=deferred(),live={},snapshot={},drawn=[];
  const a=adapter({create:async()=>({canvas:live,renderCanvas:snapshot,durationMs:spec.durationMs,frameRate:60}),flush:()=>gate.promise});
  const c=createController(a);await c.prepare(deep);c.begin(1,deep);
  c.paint({drawImage:source=>drawn.push(source)},1,deep,{x:0,y:0,w:375,h:500},.2);await tick();
  c.paint({drawImage:source=>drawn.push(source)},1,deep,{x:0,y:0,w:375,h:500},.3);
  assert.deepEqual(drawn,[snapshot,snapshot]);assert.ok(!drawn.includes(live),'Do not copy a WebGL buffer that is still being written');
  gate.resolve();await c.settled();await c.release();
});
