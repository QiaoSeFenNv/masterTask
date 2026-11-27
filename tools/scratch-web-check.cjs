/** Actual Canvas mouse/touch checks; fixture setup still commits through the preview API. */
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const {chromium} = require('playwright-core'), {browserExecutable} = require('./build-pag-template.cjs');
const {build} = require('./build-web.cjs'), {createServer} = require('./serve-web.cjs');
const flow = require('./scratch-web-flow.cjs');
const OUTPUT = path.join(__dirname,'.web-preview');
async function info(page) { return page.evaluate(()=>{const s=rolesPreview.game.store.state;return{key:s.scratch.key,progress:s.scratch.progress,complete:s.scratch.complete,scroll:s.scroll,done:s.draw.doneCount,role:s.draw.role.id};}); }
async function shot(page,name) {await page.evaluate(()=>rolesPreview.game.render());await page.screenshot({path:path.join(OUTPUT,name+'.png')});}
async function commit(page) {
  await page.waitForFunction(()=>globalThis.rolesPreview?.game.store.state.status==='ready');
  await page.evaluate(async()=>{
    const store=rolesPreview.game.store;
    store.state.picked=store.state.offer.slice(0,3).map(r=>r.id);store.state.slot=store.state.picked[0];
    store.state.anim={kind:'pick',series:'deep',at:0};store.emit();
    // The selection summary must not draw the full intro before today-page scratching.
    const ctx=rolesPreview.requireGame('js/draw.js').getCtx(),fill=ctx.fillText.bind(ctx),texts=[];
    ctx.fillText=(str,...args)=>{texts.push(str);fill(str,...args);};
    rolesPreview.game.render();ctx.fillText=fill;
    const role=store.state.offer.find(r=>r.id===store.state.slot);
    if(texts.some(t=>role.intro.startsWith(t)&&t.length>8))throw Error('Candidate leaked full intro');
    await store.confirmPick();store.finishReveal();
  });
  await page.waitForFunction(()=>rolesPreview.requireGame('js/assets.js').pending()===0);
  await page.waitForTimeout(250);await page.evaluate(()=>rolesPreview.game.render());
}
async function pixel(page,x,y) {
  return page.evaluate(({x,y})=>{const cv=document.querySelector('#game'),s=cv.width/375;return Array.from(cv.getContext('2d').getImageData(Math.round(x*s),Math.round(y*s),1,1).data);},{x,y});
}
async function main() {
  if(!process.argv.includes("--no-build"))await build();await fs.mkdir(OUTPUT,{recursive:true});
  const browser=await chromium.launch({executablePath:await browserExecutable(),headless:true});
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const results=[];
  try {
    const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await commit(page);
    assert.equal((await info(page)).progress,0);await shot(page,'scratch-covered');
    await flow.position(page,null);
    const g=await flow.geometry(page);const before=await pixel(page,g.r.x+160,g.r.y+g.r.h*.23);
    const untouched=await pixel(page,g.r.x+160,g.r.y+g.r.h*.75);
    await flow.row(page,.23,null);const partial=await info(page);
    assert.ok(partial.progress>0 && partial.progress<.2);assert.equal(partial.scroll,g.scroll);
    assert.notDeepEqual(await pixel(page,g.r.x+160,g.r.y+g.r.h*.23),before,'Actual scratch pixels expose the text layer');
    assert.deepEqual(await pixel(page,g.r.x+160,g.r.y+g.r.h*.75),untouched,'Other areas remain covered');
    await shot(page,'scratch-partial');results.push('mouse: local stroke reveals only the touched band');
    await page.reload();await page.waitForFunction(()=>globalThis.rolesPreview?.game.store.state.status==='ready');
    assert.equal((await info(page)).progress,partial.progress);assert.equal((await info(page)).key,partial.key);
    await page.evaluate(()=>rolesPreview.game.store.setTab('collection'));
    await page.evaluate(()=>rolesPreview.game.store.setTab('today'));assert.equal((await info(page)).progress,partial.progress);
    await page.setViewportSize({width:430,height:920});
    await page.waitForFunction(()=>rolesPreview.requireGame('js/env.js').size().width===430);
    assert.equal((await info(page)).progress,partial.progress);results.push('partial progress survives refresh, tabs and resize');
    await flow.scratchAll(page,null);assert.equal((await info(page)).complete,true);await shot(page,'scratch-revealed');
    const tagLayout=await page.evaluate(()=>{
      const {requireGame,game}=rolesPreview,l=requireGame('js/layout.js'),vp=requireGame('js/env.js').viewport();
      const ctx=requireGame('js/draw.js').getCtx(),original=ctx.fillText,lines=[];
      ctx.fillText=function(str,x,y){lines.push({x,y,width:this.measureText(String(str)).width});return original.apply(this,arguments);};
      try{game.render();}finally{ctx.fillText=original;}
      const top=l.contentTop(vp)-game.store.state.scroll;let checked=0;
      for(const [i,task] of game.store.state.draw.tasks.entries()){
        if(!task.tag)continue;
        const r=l.todayTaskRect(i),tagLeft=r.x+r.w-(requireGame('js/draw.js').measure(task.tag,9.5)+12)-12;
        const text=lines.filter(line=>line.x===r.x+40&&[top+r.y+24,top+r.y+41].includes(line.y));
        if(!text.length||text.some(line=>line.x+line.width>tagLeft-8+0.1))return {ok:false,task:task.id};
        checked+=text.length;
      }
      return {ok:checked>0,checked};
    });
    assert.equal(tagLayout.ok,true,'Real Canvas task text never overlaps the tag capsule');
    results.push('real Canvas: revealed task text leaves clear space for tags');

    await page.evaluate(()=>{const z=rolesPreview.requireGame('js/render.js').renderToday(rolesPreview.requireGame('js/env.js').viewport(),rolesPreview.game.store.state).zones;if(!z.some(z=>z.id==='task'))throw Error('No task zones');});
    const taskPoint=await page.evaluate(()=>{const {requireGame}=rolesPreview,l=requireGame('js/layout.js'),vp=requireGame('js/env.js').viewport(),r=l.todayTaskRect(0);return{x:r.x+22,y:l.contentTop(vp)+r.y+31-rolesPreview.game.store.state.scroll};});
    const p=await flow.point(page,taskPoint.x,taskPoint.y);await page.mouse.click(p.x,p.y);
    await page.waitForFunction(()=>rolesPreview.game.store.state.draw.doneCount===1);
    const selected=(await info(page)).role;await page.reload();await page.waitForFunction(()=>globalThis.rolesPreview?.game.store.state.status==='ready');
    assert.equal((await info(page)).complete,true);assert.equal((await info(page)).role,selected);
    await page.evaluate(async()=>{await rolesPreview.game.store.redrawToday();});await commit(page);
    assert.equal((await info(page)).progress,0);assert.notEqual((await info(page)).key,partial.key);
    results.push('60% unlocks normal tasks; completion persists; redraw resets the cover');
    assert.deepEqual(errors,[]);await page.close();

    const context=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true,deviceScaleFactor:2});
    await context.route('**/assets/*.jpg',route=>route.abort());
    // Exercise direct clipping when the native offscreen Canvas path is unavailable.
    await context.addInitScript(()=>{globalThis.OffscreenCanvas=undefined;});
    const mobile=await context.newPage(),mobileErrors=[];mobile.on('pageerror',e=>mobileErrors.push(e.message));
    await mobile.goto(base);await commit(mobile);
    await mobile.evaluate(()=>{const {requireGame}=rolesPreview;requireGame('js/scratch-view.js').release();
      requireGame('js/env.js').getWx().createOffscreenCanvas=()=>{throw Error('2D offscreen unavailable');};rolesPreview.game.render();});
    const touch=await context.newCDPSession(mobile);
    await flow.position(mobile,touch);const mg=await flow.geometry(mobile);
    const wp=await flow.point(mobile,mg.r.x+160,mg.r.y+60);await mobile.mouse.move(wp.x,wp.y);await mobile.mouse.wheel(0,30);await mobile.evaluate(()=>rolesPreview.game.render());
    assert.equal((await info(mobile)).progress,0,'Wheel over cover only scrolls');
    await flow.position(mobile,touch);const mg2=await flow.geometry(mobile);
    const a=await flow.point(mobile,mg2.r.x+10,mg2.r.y+80),b=await flow.point(mobile,mg2.r.x+200,mg2.r.y+80);
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...b,id:1}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    const mp=await info(mobile);assert.ok(mp.progress>0&&mp.progress<.2);assert.equal(mp.scroll,mg2.scroll);
    await shot(mobile,'scratch-fallback-partial');
    await mobile.reload();await mobile.waitForFunction(()=>globalThis.rolesPreview?.game.store.state.status==='ready');
    await mobile.evaluate(()=>{const {requireGame}=rolesPreview;requireGame('js/scratch-view.js').release();
      requireGame('js/env.js').getWx().createOffscreenCanvas=()=>{throw Error('2D offscreen unavailable');};rolesPreview.game.render();});
    assert.equal((await info(mobile)).progress,mp.progress);
    await flow.scratchAll(mobile,touch);assert.equal((await info(mobile)).complete,true);
    await shot(mobile,'scratch-mobile-revealed');assert.deepEqual(mobileErrors,[]);await context.close();
    results.push('320px touch, cancellation, missing images and wheel isolation work');
    console.log(JSON.stringify({passed:results.length,results},null,2));
  } finally {await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
