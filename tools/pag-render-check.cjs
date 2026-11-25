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
  ctx.drawImage=(source,...args)=>{if(source && source.previewType==='webgl')preview.pagPaints++;return nativeDraw(source,...args);};
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
    preview.app=gameRequire('js/app.js');preview.store=gameRequire('js/store.js');preview.pag=gameRequire('js/pag-reveal.js');
    preview.layout=gameRequire('js/layout.js');preview.animation=gameRequire('js/animation.js');preview.pack=gameRequire('js/pack.js');
    const adapter=gameRequire('js/pag-runtime.js'),flush=adapter.flush;
    adapter.flush=(resource,progress)=>{preview.flushes++;return flush(resource,progress);};
    preview.app.start();
  });
  await page.waitForFunction(()=>preview.store.state.status==='ready');
  return {page,errors};
}
async function selectRole(page,index) {
  return page.evaluate(async index=>{
    const {store,app,pack,pag}=preview;
    store.chooseSeries('deep');store.enterTear();store.swipeTear(pack.TEAR_SWIPE*2);
    app.render(store.state.anim.doneAt+pack.TEAR_FINISH_MS+1);
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
async function main() {
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
    browser=await chromium.launch({executablePath:await browserExecutable(),headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
    const contract=await templateContract(browser,base);
    assert.deepEqual([contract.width,contract.height,contract.duration,contract.fps],[375,500,1000000,60]);
    assert.deepEqual(contract.imageLayers,['card']);assert.ok(contract.visible>20000);assert.ok(contract.transparent>20000);
    results.push({case:'PAG template decoded; editable index 0 is card; alpha retained',...contract});
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
