/** Real WeChat PAG SDK + WebGL + the game's Canvas renderer in headless Chromium.
 * WXWebAssembly and wx are browser adapters; this is not a native-device benchmark.
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const {chromium} = require('playwright-core');
const {browserExecutable} = require('./build-pag-template.cjs');
const ROOT = path.resolve(__dirname,'..');
const GAME = path.join(ROOT,'game');
const ARTIFACTS = process.env.PAG_ARTIFACTS || path.join(ROOT,'tools/.pag-preview');
function setupBrowser(options) {
  const nativeWasm=window.WebAssembly;
  if(options.supported!==false) {
    window.WXWebAssembly=Object.create(nativeWasm);
    window.WXWebAssembly.instantiateStreaming=undefined;
    window.WXWebAssembly.instantiate=async(input,imports)=>nativeWasm.instantiate(typeof input==='string'?await(await fetch(input)).arrayBuffer():input,imports);
  }
  let nextFrame=0;
  const frames=new Map();
  window.requestAnimationFrame=callback=>{const id=nextFrame++;frames.set(id,callback);return id;};
  window.cancelAnimationFrame=id=>frames.delete(id);
  const storage=new Map([['roles_token','preview-token']]);
  const main=document.querySelector('#app');
  let mainCreated=false;
  window.preview={options,main,frames,canvases:[],pagPaints:0,flushes:0,drawRequests:0};
  const ctx=main.getContext('2d');
  const nativeDraw=ctx.drawImage.bind(ctx);
  ctx.drawImage=(source,...args)=>{if(source && (source.previewType==='webgl'||source.isPAGFrame))preview.pagPaints++;return nativeDraw(source,...args);};
  window.wx={
    env:{USER_DATA_PATH:'/preview-cache'},
    getStorageSync:key=>storage.get(key)||'',setStorageSync:(key,value)=>storage.set(key,value),removeStorageSync:key=>storage.delete(key),
    getSystemInfoSync:()=>({windowWidth:375,windowHeight:812,screenWidth:375,screenHeight:812,pixelRatio:options.dpr||2,safeArea:{top:44,bottom:778},platform:'devtools',system:'Windows'}),
    createCanvas:()=>{if(!mainCreated){mainCreated=true;return main;}return new OffscreenCanvas(1,1);},
    createOffscreenCanvas:settings=>{const canvas=new OffscreenCanvas(settings.width||1,settings.height||1);canvas.isOffscreenCanvas=true;canvas.previewType=settings.type||'2d';preview.canvases.push(canvas);return canvas;},
    createImage:()=>new Image(),
    getFileSystemManager:()=>({accessSync:()=>{},mkdirSync:()=>{},readFile:opts=>{
      fetch(opts.filePath).then(response=>{if(!response.ok)throw new Error('File '+response.status);return response.arrayBuffer();}).then(data=>opts.success({data}),opts.fail);
    }}),
    login:opts=>opts.success({code:'preview'}),
    request:opts=>{
      const route=new URL(opts.url).pathname;
      let data;
      if(route==='/api/auth/login')data={token:'preview-token'};
      else if(route==='/api/draw/today')data={date:'2026-11-24',drawn:false,offer:preview.roles.slice(0,10),canRedraw:true};
      else if(route==='/api/draw'){
        preview.drawRequests++;
        const role=preview.roles.find(role=>role.id===opts.data.roleId);
        data={date:'2026-11-24',role,tasks:role.tasks.slice(0,3),checkins:[]};
      } else if(route==='/api/draw/redraw')data={};
      else if(route==='/api/stats')data={totalDays:0,totalDone:0,streak:0,cards:[]};
      else data={};
      opts.success({statusCode:200,data:{ok:true,data}});
    },
    showToast:()=>{},vibrateShort:()=>{},
    onTouchStart:()=>{},onTouchMove:()=>{},onTouchEnd:()=>{},
    onHide:callback=>preview.hide=callback,onShow:callback=>preview.show=callback,
  };
}
function installModules(sources) {
  if(preview.options.failTemplate)delete sources["data/reveal-pag.js"];
  if(preview.options.failTearTemplate)delete sources["data/tear-pag.js"];
  const cache={};
  function normalize(value){const parts=[];for(const part of value.split('/')){if(part==='..')parts.pop();else if(part&&part!=='.')parts.push(part);}return parts.join('/');}
  function load(file,parent='') {
    const id=normalize(file.startsWith('.')?parent.slice(0,parent.lastIndexOf('/')+1)+file:file);
    if(cache[id])return cache[id].exports;
    if(sources[id]===undefined)throw new Error('Missing preview module '+id);
    const module={exports:{}};cache[id]=module;
    new Function('require','module','exports',sources[id]+'\n//# sourceURL='+id)(next=>load(next,id),module,module.exports);
    return module.exports;
  }
  window.gameRequire=load;
  preview.roles=load('data/roles.js').roles;
}
async function sourceModules() {
  const sources={};
  for(const directory of ['js','data','vendor/pag']) {
    for(const file of await fs.readdir(path.join(GAME,directory))) {
      if(file.endsWith('.js'))sources[directory+'/'+file]=await fs.readFile(path.join(GAME,directory,file),'utf8');
    }
  }
  return sources;
}
async function gamePage(browser,base,options={}) {
  const page=await browser.newPage({viewport:{width:375,height:812},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(base);
  await page.evaluate(setupBrowser,options);
  await page.evaluate(installModules,await sourceModules());
  await page.evaluate(()=>{
    preview.app=gameRequire('js/app.js');preview.store=gameRequire('js/store.js');preview.pag=gameRequire('js/pag-reveal.js');preview.tear=gameRequire('js/pag-tear.js');preview.tearFlushes=0;
    preview.layout=gameRequire('js/layout.js');preview.animation=gameRequire('js/animation.js');preview.pack=gameRequire('js/pack.js');
    const adapter=gameRequire('js/pag-runtime.js'),flush=adapter.flush;
    adapter.flush=(resource,progress)=>{preview.flushes++;return flush(resource,progress);};
    const tearAdapter=gameRequire("js/pag-tear-runtime.js"),tearFlush=tearAdapter.flush,tearCreate=tearAdapter.create;
    preview.poseCreated=0;preview.poseReleased=0;
    tearAdapter.create=async series=>{
      const resource=await tearCreate(series);preview.tearResource=resource;
      for(const control of resource.poseControls)for(const handle of [control.layer,control.matrix]){
        const destroy=handle.destroy;preview.poseCreated++;
        handle.destroy=function(){preview.poseReleased++;return destroy.call(this);};
      }
      return resource;
    };
    tearAdapter.flush=(resource,progress,direction)=>{preview.tearFlushes++;if(preview.options.failTearFlush)return Promise.reject(new Error("Simulated tear flush failure"));return tearFlush(resource,progress,direction);};
    preview.app.start();
  });
  await page.waitForFunction(()=>preview.store.state.status==='ready');
  return {page,errors};
}
async function selectRole(page,index) {
  return page.evaluate(async index=>{
    const {store,app,pack,pag}=preview;
    store.chooseSeries('deep');store.enterTear();store.swipeTear(pack.TEAR_SWIPE*2);
    app.render(store.state.anim.doneAt+gameRequire("js/tear-flight.js").DURATION_MS+1);
    if(store.stage()!=="ring")throw new Error("Reveal test must finish card extraction before flipping candidates");
    for(let i=0;i<3;i++)store.flipCard(preview.roles[i].id);
    app.render(store.state.anim.at+pack.TOP_MS+1);
    store.selectSlot(preview.roles[index].id);
    const ready=await pag.prepare(preview.roles[index]);
    await store.confirmPick();
    return {ready,at:store.state.anim.at,id:store.state.draw.role.id,savedBeforePlayback:store.state.anim.kind==='reveal'};
  },index);
}
async function frame(page,elapsed) {
  return page.evaluate(async elapsed=>{
    const {app,store,pag}=preview;
    const at=store.state.anim.at;
    app.render(at+elapsed);await pag.settled();app.render(at+elapsed);
    const ctx=preview.main.getContext('2d'),pixels=ctx.getImageData(0,0,preview.main.width,preview.main.height).data;
    let nonzero=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i])nonzero++;
    return {stage:store.stage(),role:store.state.draw.role.id,status:pag.status(),pagPaints:preview.pagPaints,nonzero,
      hash:preview.main.toDataURL('image/png'),buffers:preview.canvases.filter(c=>c.previewType==='webgl').map(c=>[c.width,c.height])};
  },elapsed);
}
async function screenshot(page,name) {const file=path.join(ARTIFACTS,name+'.png');await page.screenshot({path:file});return file;}
async function templateContract(browser,base) {
  const page=await browser.newPage({viewport:{width:375,height:500}});
  try {
    await page.goto(base);await page.evaluate(setupBrowser,{dpr:1});await page.evaluate(installModules,await sourceModules());
    return await page.evaluate(async()=>{
      const sdk=await gameRequire('vendor/pag/libpag.js').PAGInit({locateFile:()=> 'vendor/pag/libpag.wasm.br'});
      const spec=gameRequire('js/pag-template.js');
      const file=await sdk.PAGFile.load(await(await fetch('assets/pag/reveal.pag')).arrayBuffer());
      const vector=file.getLayersByEditableIndex(spec.card.imageIndex,5);
      const names=[];
      for(let i=0;i<vector.size();i++){const layer=vector.get(i);names.push(layer.layerName());layer.destroy();}
      vector.delete();
      const canvas=wx.createOffscreenCanvas({type:'webgl',width:spec.width,height:spec.height});
      canvas.getContext('webgl',{alpha:true,preserveDrawingBuffer:true,depth:false,stencil:false,antialias:false});
      const view=await sdk.PAGView.init(file,canvas,{firstFrame:false});
      view.setProgress(.45);await view.flush();
      const sample=new OffscreenCanvas(canvas.width,canvas.height),ctx=sample.getContext('2d');ctx.drawImage(canvas,0,0);
      const pixels=ctx.getImageData(0,0,sample.width,sample.height).data;
      let visible=0,transparent=0;for(let i=3;i<pixels.length;i+=4){if(pixels[i])visible++;else transparent++;}
      const result={width:file.width(),height:file.height(),duration:file.duration(),fps:file.frameRate(),imageLayers:names,visible,transparent};
      view.destroy();file.destroy();
      return result;
    });
  } finally {await page.close();}
}

async function beginTear(page,series='deep',direction=1) {
  // This fixture disables game RAF; poll lazy image readiness independently of that clock.
  await page.waitForFunction(series=>Boolean(gameRequire('js/assets.js').pack(series) && gameRequire('js/assets.js').foil(series)),series,{polling:50});
  return page.evaluate(async ({series,direction})=>{
    const {store,app,pack,tear}=preview;
    store.state.anim={kind:'pack',at:Date.now(),series:''};store.emit();store.chooseSeries(series);store.enterTear();
    const ready=await tear.prepare(pack.seriesOf(series));store.swipeTear(pack.TEAR_SWIPE,direction);
    const at=store.state.anim.doneAt,before=preview.pagPaints;app.render(at);const firstRenderPagPaints=preview.pagPaints-before;await tear.settled();app.render(at);
    return {ready,at,stage:store.stage(),mode:store.state.anim.finishMode,status:tear.status(),drawRequests:preview.drawRequests,firstRenderPagPaints};
  },{series,direction});
}
async function tearPose(page) {
  return page.evaluate(()=>{
    const spec=gameRequire('js/pag-tear-template.js'),controls=preview.tearResource.poseControls;
    function sample(index){
      const control=controls.find(control=>control.index===index),texture=spec.textures.find(texture=>texture.imageIndex===index);
      const m=control.layer.getTotalMatrix(),x=texture.width/2,y=texture.height/2;
      try{return {a:m.a,b:m.b,c:m.c,d:m.d,x:m.a*x+m.c*y+m.tx,y:m.b*x+m.d*y+m.ty};}finally{m.destroy();}
    }
    return {controls:controls.length,body:sample(5),strip:sample(0),mouth:sample(4)};
  });
}
async function tearFrame(page,elapsed) {
  return page.evaluate(async elapsed=>{
    const {app,store,tear}=preview,at=store.state.anim.doneAt;
    app.render(at+elapsed);await tear.settled();app.render(at+elapsed);await tear.settled();
    return {stage:store.stage(),mode:store.state.anim.finishMode,status:tear.status(),drawRequests:preview.drawRequests,
      hash:preview.main.toDataURL('image/png'),buffers:preview.canvases.filter(c=>c.previewType==='webgl').map(c=>[c.width,c.height])};
  },elapsed);
}
async function tearTemplateContract(browser,base) {
  const page=await browser.newPage({viewport:{width:375,height:500}});
  try {
    await page.goto(base);await page.evaluate(setupBrowser,{dpr:1});await page.evaluate(installModules,await sourceModules());
    return await page.evaluate(async()=>{
      const sdk=await gameRequire('vendor/pag/libpag.js').PAGInit({locateFile:()=> 'vendor/pag/libpag.wasm.br'});
      const spec=gameRequire('js/pag-tear-template.js'),file=await sdk.PAGFile.load(await(await fetch('assets/pag/tear.pag')).arrayBuffer());
      const names=[];
      for(const texture of spec.textures){const layers=file.getLayersByEditableIndex(texture.imageIndex,5);try{
        for(let i=0;i<layers.size();i++){const layer=layers.get(i);try{names.push(layer.layerName());}finally{layer.destroy();}}
      }finally{layers.delete();}}
      const canvas=wx.createOffscreenCanvas({type:'webgl',width:spec.width,height:spec.height});
      canvas.getContext('webgl',{alpha:true,preserveDrawingBuffer:true,depth:false,stencil:false,antialias:false});
      const view=await sdk.PAGView.init(file,canvas,{firstFrame:false}),sample=new OffscreenCanvas(spec.width,spec.height),ctx=sample.getContext('2d'),frames=[];
      try {
        for(const progress of [0,.4,.85]){view.setProgress(progress);await view.flush();ctx.clearRect(0,0,spec.width,spec.height);ctx.drawImage(canvas,0,0);
          const pixels=ctx.getImageData(0,0,spec.width,spec.height).data;let visible=0,transparent=0,hash=2166136261;
          for(let i=0;i<pixels.length;i++){hash=Math.imul(hash^pixels[i],16777619);if(i%4===3){if(pixels[i])visible++;else transparent++;}}
          frames.push({progress,visible,transparent,hash:hash>>>0,cornerAlpha:pixels[3]});}
        return {width:file.width(),height:file.height(),duration:file.duration(),fps:file.frameRate(),images:file.numImages(),names,frames};
      }finally{view.destroy();file.destroy();}
    });
  }finally{await page.close();}
}

async function main() {
  await require("./pack-pag-tear.cjs").packTearTemplate(
    JSON.parse(await fs.readFile(path.join(ROOT,"tools/pag/tear-template.json"),"utf8")),
    await fs.readFile(path.join(GAME,"assets/pag/tear.pag")));
  await fs.mkdir(ARTIFACTS,{recursive:true});
  let server,browser;
  const results=[];
  try {
    server=http.createServer(async(req,res)=>{
      try {
        const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);
        if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<html><head><meta charset="utf-8"></head><body style="margin:0;background:#0a0910"><canvas id="app" style="width:375px;height:812px"></canvas></body></html>');return;}
        if(pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
        const file=path.resolve(GAME,'.'+pathname);
        if(!file.startsWith(GAME+path.sep)){res.writeHead(403);res.end();return;}
        let data=await fs.readFile(file);
        if(file.endsWith('.wasm.br')){data=zlib.brotliDecompressSync(data);res.setHeader('Content-Type','application/wasm');}
        else if(file.endsWith('.jpg'))res.setHeader('Content-Type','image/jpeg');
        else res.setHeader('Content-Type','application/octet-stream');
        res.end(data);
      } catch(error){res.writeHead(404);res.end(String(error));}
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+server.address().port+'/';
    browser=await chromium.launch({executablePath:await browserExecutable(),headless:true,args:process.env.PAG_TEST_RENDERER==='native' ? (process.platform==='win32' ? ['--use-angle=d3d11'] : []) : ['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
    const contract=await templateContract(browser,base);
    assert.deepEqual([contract.width,contract.height,contract.duration,contract.fps],[375,500,1000000,60]);
    assert.deepEqual(contract.imageLayers,['card']);assert.ok(contract.visible>20000);assert.ok(contract.transparent>20000);
    results.push({case:'PAG template decoded; editable index 0 is card; alpha retained',...contract});

    const tearContract=await tearTemplateContract(browser,base);
    assert.deepEqual([tearContract.width,tearContract.height,tearContract.duration,tearContract.fps],[375,500,2200000,60]);
    assert.equal(tearContract.images,8);assert.ok(tearContract.names.includes('packet-mouth'));assert.equal(tearContract.names.filter(name=>name.startsWith('card-back-')).length,10);
    assert.equal(tearContract.names.filter(name=>name.startsWith('fiber-')).length,12);assert.ok(tearContract.frames.every(frame=>frame.visible>10000&&frame.transparent>90000&&frame.cornerAlpha===0));
    assert.equal(new Set(tearContract.frames.map(frame=>frame.hash)).size,3);
    results.push({case:'PAG tear contract, foil packet/curl/fibers/ten staggered backs, transparent timeline',...tearContract});
    const tearing=await gamePage(browser,base,{dpr:3});let opened=await beginTear(tearing.page);
    assert.equal(opened.ready,true,JSON.stringify(opened.status));assert.equal(opened.stage,'tearFinish');assert.equal(opened.mode,'pag');assert.equal(opened.drawRequests,0);
    const rightPose=await tearPose(tearing.page);assert.equal(rightPose.controls,5);assert.ok(rightPose.body.b>0);
    const tearMiddle=await tearFrame(tearing.page,230),tearImage=await screenshot(tearing.page,'tear-deep-completion');
    const alphaPixels=await tearing.page.evaluate(()=>{
      const r=preview.tearResource,gl=r.gl,pixels=new Uint8Array(r.canvas.width*r.canvas.height*4);
      gl.readPixels(0,0,r.canvas.width,r.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      let bad=0,translucent=0;for(let i=0;i<pixels.length;i+=4){
        if(pixels[i+3]>0&&pixels[i+3]<255)translucent++;
        if(Math.max(pixels[i],pixels[i+1],pixels[i+2])>pixels[i+3]+2)bad++;
      }return {bad,translucent};
    });
    assert.equal(alphaPixels.bad,0,"PAG edges are premultiplied correctly; soft foil must not acquire white outlines");
    assert.ok(alphaPixels.translucent>100,"Transparent edges are retained");
    assert.equal(tearMiddle.status.mode,'pag');assert.ok(tearMiddle.buffers.every(([w,h])=>w<=563&&h<=751));
    const tearLate=await tearFrame(tearing.page,1900);assert.equal(tearLate.stage,'tearFinish');assert.notEqual(tearMiddle.hash,tearLate.hash);
    await tearFrame(tearing.page,2200);assert.equal(await tearing.page.evaluate(()=>preview.store.stage()),'ring');
    assert.equal(await tearing.page.evaluate(()=>preview.tear.status().ready),false);assert.equal(await tearing.page.evaluate(()=>preview.drawRequests),0);
    assert.ok(await tearing.page.evaluate(()=>preview.canvases.filter(c=>c.previewType==='webgl').every(c=>c.width===1&&c.height===1)));
    results.push({case:'Prepared PAG slowly extracts cards over 2200ms, enters ring without draw POST, caps buffers and releases',alphaPixels,screenshot:tearImage});
    opened=await beginTear(tearing.page,'dusk');assert.equal(opened.ready,true);const duskFrame=await tearFrame(tearing.page,230);
    assert.notEqual(duskFrame.hash,tearMiddle.hash,'Same tear template replaces packet art and series-color textures');
    const duskImage=await screenshot(tearing.page,'tear-dusk-completion');
    const tearHidden=await tearing.page.evaluate(async()=>{preview.hide();const before=preview.tearFlushes;preview.tear.seek(.9);await preview.tear.settled();return {before,after:preview.tearFlushes,pending:preview.frames.size};});
    assert.equal(tearHidden.before,tearHidden.after);assert.equal(tearHidden.pending,0);
    await tearing.page.evaluate(()=>preview.show());await tearFrame(tearing.page,3000);assert.equal(await tearing.page.evaluate(()=>preview.store.stage()),'ring');
    assert.equal(await tearing.page.evaluate(()=>preview.tear.status().ready),false);assert.deepEqual(tearing.errors,[]);
    results.push({case:'Tear series artwork replacement and background pause/resume',screenshot:duskImage});
    opened=await beginTear(tearing.page,'deep',-1);assert.equal(opened.ready,true);assert.equal(opened.mode,'pag');
    assert.equal(opened.firstRenderPagPaints,0,'Left tear waits for its own direction before painting PAG');
    const leftPose=await tearPose(tearing.page);assert.equal(leftPose.controls,5);assert.ok(leftPose.body.b<0);
    assert.ok(Math.abs(leftPose.body.x-rightPose.body.x)<.01&&Math.abs(leftPose.body.y-rightPose.body.y)<.01,'Both tilts keep the same packet center');
    assert.ok(leftPose.strip.a>0&&Math.abs(leftPose.strip.b)<.001&&leftPose.strip.x<rightPose.strip.x,'Left peel translates the strip without mirroring or rotating artwork');
    assert.ok(leftPose.mouth.x<rightPose.mouth.x,'Mouth follows the left tilt');
    await tearFrame(tearing.page,180);const leftImage=await screenshot(tearing.page,'tear-left-completion');await tearFrame(tearing.page,2200);
    const released=await tearing.page.evaluate(()=>({created:preview.poseCreated,released:preview.poseReleased,stage:preview.store.stage(),drawRequests:preview.drawRequests}));
    assert.equal(released.created,30);assert.equal(released.released,released.created);assert.equal(released.stage,'ring');assert.equal(released.drawRequests,0);
    assert.deepEqual(tearing.errors,[]);results.push({case:'Real SDK left peel keeps artwork upright, suppresses stale first frame and frees all pose handles',rightPose,leftPose,released,screenshot:leftImage});await tearing.page.close();
    for(const options of [{supported:false},{failTearTemplate:true},{failTearFlush:true}]) {
      const fallback=await gamePage(browser,base,options),started=await beginTear(fallback.page);
      assert.equal(started.ready,Boolean(options.failTearFlush));
      await tearFrame(fallback.page,200);assert.equal(await fallback.page.evaluate(()=>preview.store.state.anim.finishMode),'fallback');
      const waiting=await tearFrame(fallback.page,2199);assert.equal(waiting.stage,'tearFinish');await tearFrame(fallback.page,2200);
      assert.equal(await fallback.page.evaluate(()=>preview.store.stage()),'ring');assert.equal(await fallback.page.evaluate(()=>preview.drawRequests),0);assert.deepEqual(fallback.errors,[]);
      results.push({case:options.supported===false?'Unsupported PAG tear retains the same 2200ms Canvas extraction':options.failTearTemplate?'Missing tear asset retains the same 2200ms Canvas extraction':'Failed tear flush retains the same 2200ms Canvas extraction'});await fallback.page.close();
    }

    const normal=await gamePage(browser,base,{dpr:3});
    let chosen=await selectRole(normal.page,1);
    assert.equal(chosen.ready,true);assert.equal(chosen.savedBeforePlayback,true);assert.equal(chosen.id,'wanderer');
    let start=await frame(normal.page,100);assert.equal(start.status.mode,'pag');assert.ok(start.pagPaints>0);
    await normal.page.evaluate(()=>{const {animation,app,store,layout}=preview;animation.withTime(store.state.anim.at+100,()=>app.dispatch(180,layout.contentTop(gameRequire('js/env.js').viewport())+220));});
    assert.equal(await normal.page.evaluate(()=>preview.store.stage()),'reveal');
    const middle=await frame(normal.page,450);const firstImage=await screenshot(normal.page,'reveal-wanderer');
    const later=await frame(normal.page,700);assert.notEqual(middle.hash,later.hash,'PAG timeline changes pixels');
    assert.ok(middle.buffers.every(([w,h])=>w<=752&&h<=1002),'render buffers are capped at 2x despite 3x device DPR');
    await normal.page.evaluate(async()=>{const {animation,app,store,layout,pag}=preview;animation.withTime(store.state.anim.at+701,()=>app.dispatch(180,layout.contentTop(gameRequire('js/env.js').viewport())+220));await pag.settled();app.render();});
    assert.equal(await normal.page.evaluate(()=>preview.store.stage()),'');
    assert.equal(await normal.page.evaluate(()=>preview.pag.status().ready),false);
    assert.equal(await normal.page.evaluate(()=>preview.store.state.draw.role.id),'wanderer');
    assert.ok(await normal.page.evaluate(()=>preview.canvases.filter(c=>c.previewType==='webgl').every(c=>c.width===1&&c.height===1)));
    results.push({case:'PAG reveal, early-tap guard, skip, saved draw and cleanup',role:chosen.id,screenshot:firstImage});
    await normal.page.evaluate(()=>preview.store.redrawToday());
    chosen=await selectRole(normal.page,2);assert.equal(chosen.ready,true);assert.equal(chosen.id,'apprentice');
    const next=await frame(normal.page,450);const secondImage=await screenshot(normal.page,'reveal-apprentice');
    assert.equal(next.status.mode,'pag');assert.notEqual(next.hash,middle.hash,'replacement role changes artwork');
    await frame(normal.page,1001);assert.equal(await normal.page.evaluate(()=>preview.store.stage()),'');
    await normal.page.evaluate(()=>preview.pag.settled());assert.equal(await normal.page.evaluate(()=>preview.pag.status().ready),false);
    results.push({case:'Reusable template replaces role artwork; auto-finish keeps result',role:chosen.id,screenshot:secondImage});
    await normal.page.evaluate(()=>preview.store.redrawToday());await selectRole(normal.page,0);await frame(normal.page,200);
    const hidden=await normal.page.evaluate(async()=>{preview.hide();const before=preview.flushes;preview.pag.seek(.8);await preview.pag.settled();return {before,after:preview.flushes,pendingFrames:preview.frames.size};});
    assert.equal(hidden.before,hidden.after);assert.equal(hidden.pendingFrames,0);
    await normal.page.evaluate(()=>preview.show());await frame(normal.page,2000);await normal.page.evaluate(()=>preview.pag.settled());
    assert.equal(await normal.page.evaluate(()=>preview.store.stage()),'');assert.equal(await normal.page.evaluate(()=>preview.store.state.draw.role.id),'detective');
    assert.deepEqual(normal.errors,[]);results.push({case:'Background pauses rendering; long resume finishes once and frees PAG'});
    await normal.page.close();
    for(const options of [{supported:false},{failTemplate:true}]) {
      const fallback=await gamePage(browser,base,options);const selected=await selectRole(fallback.page,0);
      assert.equal(selected.ready,false);const state=await frame(fallback.page,450);
      assert.equal(state.status.mode,'fallback');assert.equal(state.pagPaints,0);assert.ok(state.nonzero>50000);
      await frame(fallback.page,1001);assert.equal(await fallback.page.evaluate(()=>preview.store.stage()),'');
      assert.equal(await fallback.page.evaluate(()=>preview.store.state.draw.role.id),'detective');assert.deepEqual(fallback.errors,[]);
      results.push({case:options.supported===false?'Unsupported device keeps functional Canvas reveal':'Missing PAG asset keeps functional Canvas reveal'});
      await fallback.page.close();
    }
    await fs.writeFile(path.join(ARTIFACTS,'verification.json'),JSON.stringify({sdk:'libpag-miniprogram@4.3.51',verifiedAt:new Date().toISOString(),environment:'Chromium + WebGL (WX adapters), not native WeChat',results},null,2)+'\n');
    console.log(JSON.stringify({passed:results.length,results},null,2));
  } finally {if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
