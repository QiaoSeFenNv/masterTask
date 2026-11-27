/** Actual mouse/touch validation of the reference-style flat boosters, including missing images. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('playwright-core'),{browserExecutable}=require('./build-pag-template.cjs');
const {build}=require('./build-web.cjs'),{createServer}=require('./serve-web.cjs');
const OUT=path.join(__dirname,'.web-preview');
async function point(page,x,y) {
  return page.evaluate(({x,y})=>{const r=document.querySelector('#game').getBoundingClientRect();
    return {x:r.left+x*r.width/375,y:r.top+y*r.width/375};},{x,y});
}
async function swipe(page,cdp,start,end,release=true) {
  if(cdp) {
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});
    for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(end.x-start.x)*i/6,y:start.y+(end.y-start.y)*i/6,id:1}]});
  } else {
    await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:6});
  }
  await page.clock.runFor(32);
  if(release) {
    if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();
    await page.clock.runFor(32);
  }
}
async function run(browser,base,options) {
  const context=await browser.newContext({viewport:options.viewport,deviceScaleFactor:2,isMobile:Boolean(options.touch),hasTouch:Boolean(options.touch)});
  if(options.fallback)await context.addInitScript(()=>Object.defineProperty(globalThis,'WebAssembly',{value:undefined,configurable:true}));
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  if(options.fallback)await page.route(/\/assets\/.*\.(?:jpg|png)$/,route=>route.abort());
  await page.clock.install({time:new Date('2026-11-27T15:00:00+08:00')});
  await page.clock.pauseAt(new Date('2026-11-27T15:00:01+08:00'));
  await page.goto(base,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>globalThis.rolesPreview?.game.store.state.status==='ready');
  if(!options.fallback)await page.waitForFunction(()=>['deep','dusk','dawn'].every(id=>Boolean(rolesPreview.requireGame('js/assets.js').foil(id))));
  await page.clock.runFor(300);
  const selected=await page.evaluate(id=>{
    const {game,requireGame}=rolesPreview,vp=requireGame('js/env.js').viewport(),layout=requireGame('js/layout.js');
    const zones=requireGame('js/packview.js').render(vp,game.store.state).zones.filter(z=>z.id==='series');
    return {zones,zone:zones.find(z=>z.seriesId===id),bottom:layout.contentBottom(vp)};
  },options.id);
  assert.equal(selected.zones.length,3);
  for(const z of selected.zones) {
    assert.ok(Math.abs(z.rect.w/(z.rect.h-48)-150/278)<1e-9);
    assert.ok(z.rect.y+z.rect.h<selected.bottom,'Caption remains above navigation');
  }
  await page.screenshot({path:path.join(OUT,'booster-'+options.id+'-picker.png')});
  const z=selected.zone.rect,tap=await point(page,z.x+z.w/2,z.y+z.w);
  if(options.touch)await page.touchscreen.tap(tap.x,tap.y);else await page.mouse.click(tap.x,tap.y);
  await page.clock.runFor(800);
  assert.equal(await page.evaluate(()=>rolesPreview.game.store.state.anim.kind),'tear');
  if(!options.fallback)await page.waitForFunction(()=>rolesPreview.requireGame('js/pag-tear.js').status().ready);
  const packet=await page.evaluate(()=>{
    const {requireGame}=rolesPreview,vp=requireGame('js/env.js').viewport();
    const layout=requireGame('js/layout.js'),packet=requireGame('js/pack.js').tearRect(layout.contentTop(vp));
    return {...packet,bottom:layout.contentBottom(vp),hintY:Math.min(packet.y+packet.h+32,layout.contentBottom(vp)-14)};
  });
  assert.equal(packet.w/packet.h,150/278);
  assert.ok(packet.hintY-6>=packet.y+packet.h+8,'Instruction clears the foil footer on real small-screen safe-area metrics');
  assert.ok(packet.hintY+6<=packet.bottom-8,'Instruction clears navigation');
  const material=await page.evaluate(()=>{
    const {requireGame}=rolesPreview,surface=requireGame('js/packet-surface.js'),canvas=document.createElement('canvas');
    canvas.width=150;canvas.height=278;const c=canvas.getContext('2d');
    surface.paint(c,null,{x:0,y:0,w:150,h:278},requireGame('js/pack.js').SERIES[0],{shadow:false});
    const pixel=(x,y)=>Array.from(c.getImageData(x,y,1,1).data);
    return {header:pixel(12,18),footer:pixel(75,273),sides:[10,60,140,220,260].map(y=>({y,left:pixel(1,y)[3],inside:pixel(4,y)[3],right:pixel(149,y)[3]}))};
  });
  for(const p of [material.header,material.footer]) {
    assert.ok(p.slice(0,3).every(v=>v>150)&&Math.max(...p.slice(0,3))-Math.min(...p.slice(0,3))<35,'Silver seals are neutral and bright');
  }
  for(const edge of material.sides)assert.deepEqual([edge.left,edge.inside,edge.right],[0,255,0],'Sides stay straight through the whole pack');
  await page.screenshot({path:path.join(OUT,'booster-'+options.id+'-sealed.png')});
  const cdp=options.touch?await context.newCDPSession(page):null,direction=options.touch?-1:1;
  const x=packet.x+(direction>0?24:packet.w-24),y=packet.y+packet.h*.5;
  await swipe(page,cdp,await point(page,x,y),await point(page,x+direction*60,y),false);
  const partial=await page.evaluate(()=>({p:rolesPreview.game.store.state.anim.p,tilt:rolesPreview.game.store.state.anim.tilt}));
  assert.ok(partial.p>.35&&partial.p<.45);assert.equal(Math.sign(partial.tilt),direction);
  await page.screenshot({path:path.join(OUT,'booster-'+options.id+'-partial.png')});
  if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();
  await page.clock.runFor(300);
  await swipe(page,cdp,await point(page,x,y),await point(page,x+direction*170,y));
  const finished=await page.evaluate(()=>({kind:rolesPreview.game.store.state.anim.kind,mode:rolesPreview.game.store.state.anim.finishMode,ms:rolesPreview.game.store.state.anim.finishMs}));
  assert.equal(finished.kind,'tearFinish');assert.equal(finished.ms,2200);assert.equal(finished.mode,options.fallback?'fallback':'pag');
  await page.clock.runFor(400);
  await page.evaluate(async()=>{const p=rolesPreview.requireGame('js/pag-tear.js');await p.settled();rolesPreview.game.render();await p.settled();rolesPreview.game.render();});
  await page.screenshot({path:path.join(OUT,'booster-'+options.id+'-extracting.png')});
  await page.clock.runFor(1900);assert.equal(await page.evaluate(()=>rolesPreview.game.store.state.anim.kind),'ring');
  assert.deepEqual(errors,[]);const report={series:options.id,viewport:options.viewport,input:options.touch?'touch-left':'mouse-right',missingImages:Boolean(options.fallback),packet,partial,completion:finished,material,errors};
  await context.close();return report;
}
(async()=>{
  if(!process.argv.includes('--no-build'))await build();
  await fs.mkdir(OUT,{recursive:true});const server=createServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});let browser;
  try {
    browser=await chromium.launch({executablePath:await browserExecutable(),headless:true,args:['--use-angle=d3d11']});
    const base='http://127.0.0.1:'+server.address().port,results=[];
    for(const options of [{id:'deep',viewport:{width:390,height:844}},{id:'dusk',viewport:{width:375,height:667},touch:true},{id:'dawn',viewport:{width:320,height:568},fallback:true}])
      results.push(await run(browser,base,options));
    await fs.writeFile(path.join(OUT,'booster-verification.json'),JSON.stringify({verifiedAt:new Date().toISOString(),results},null,2));
    console.log(JSON.stringify({passed:results.length,cases:results.map(r=>({series:r.series,input:r.input,completion:r.completion.mode,missingImages:r.missingImages,errors:r.errors}))},null,2));
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
