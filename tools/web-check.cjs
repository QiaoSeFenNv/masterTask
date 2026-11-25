/** Real mouse/touch checks of the static Web preview, using the production game modules. */
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require('playwright-core');
const {browserExecutable} = require('./build-pag-template.cjs');
const {build} = require('./build-web.cjs');
const {createServer} = require('./serve-web.cjs');
const ARTIFACTS = path.resolve(__dirname, '.web-preview');
const results = [];
async function state(page) { return page.evaluate(() => {
  const s = rolesPreview.game.store.state;
  return {stage:s.anim.kind,draw:s.draw,slot:s.slot,picked:s.picked.slice(),p:s.anim.p,
    scroll:s.scroll,scrollMax:s.scrollMax,tab:s.tab,calendar:s.calendar,collection:s.collection,selected:s.selected};
}); }
async function point(page,x,y) { return page.evaluate(({x,y}) => {
  const r = document.querySelector('#game').getBoundingClientRect();
  return {x:r.left+x*r.width/375,y:r.top+y*r.width/375};
},{x,y}); }
async function geometry(page) { return page.evaluate(() => {
  const {requireGame}=rolesPreview;
  const vp=requireGame('js/env.js').viewport(), layout=requireGame('js/layout.js');
  return {top:layout.contentTop(vp),bottom:layout.contentTop(vp)+layout.contentH(vp),
    width:document.querySelector('#game').getBoundingClientRect().width};
}); }
async function tap(page,p,touch) {
  if(!touch) await page.mouse.click(p.x,p.y);
  else {
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y,id:1}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
  // Advancing the deterministic clock is part of every input action, just as RAF follows real input.
  await page.clock.runFor(32);
}
async function drag(page,from,to,touch) {
  if(!touch) { await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:12});await page.mouse.up();return; }
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:1}]});
  for(let i=1;i<=12;i++)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*i/12,y:from.y+(to.y-from.y)*i/12,id:1}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}
async function flush(page) { await page.evaluate(async()=>{
  const p=rolesPreview.requireGame('js/pag-reveal.js');await p.settled();rolesPreview.game.render();await p.settled();rolesPreview.game.render();
}); }
async function shot(page,name) { const file=path.join(ARTIFACTS,name+'.png');await page.screenshot({path:file,fullPage:true});return file; }
async function open(browser,base,mobile=false,unsupported=false,small=false) {
  const context=await browser.newContext({viewport:mobile?(small?{width:375,height:667}:{width:390,height:844}):{width:1280,height:1000},deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile});
  if(unsupported)await context.addInitScript(()=>{Object.defineProperty(globalThis,'WebAssembly',{value:undefined,configurable:true});});
  const page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('request',request=>requests.push(request.url()));
  await page.clock.install({time:new Date('2026-11-24T20:00:00+08:00')});
  await page.goto(base,{waitUntil:'networkidle'});
  assert.equal(await page.evaluate(()=>rolesPreview.game.store.state.status),'ready');
  await page.clock.pauseAt(new Date('2026-11-24T20:01:00+08:00'));
  return {page,context,errors,requests,touch:mobile?await context.newCDPSession(page):null};
}
async function chooseAndTear(session,name) {
  const {page,touch}=session, g=await geometry(page);
  await tap(page,await point(page,72,g.top+158),touch);
  assert.equal((await state(page)).stage,'opening');
  await page.clock.runFor(180);
  assert.equal((await state(page)).stage,'opening');
  const opening=await shot(page,name+'-opening');
  await page.clock.runFor(320);
  assert.equal((await state(page)).stage,'tear');
  assert.equal((await state(page)).p,0);
  const start=await point(page,112.5,g.top+159), partial=await point(page,172.5,g.top+159);
  await drag(page,start,partial,touch);
  assert.ok((await state(page)).p>0 && (await state(page)).p<1);
  await page.clock.runFor(50);
  const tearing=await shot(page,name+'-tearing');
  await page.clock.runFor(250);
  const retained=(await state(page)).p;assert.ok(retained>0 && retained<0.4);
  await drag(page,start,await point(page,277.5,g.top+159),touch);
  await page.clock.runFor(500);
  assert.equal((await state(page)).stage,'ring');
  results.push({case:name+' packet movement and drag-driven tear',opening,tearing});
}
async function selectAndReveal(session,name,expectPag=true,autoFinish=false) {
  const {page,touch}=session;
  for(let i=0;i<3;i++) {
    const front=await page.evaluate(()=>{
      const {requireGame}=rolesPreview,s=rolesPreview.game.store.state,vp=requireGame('js/env.js').viewport();
      const pv=requireGame('js/packview.js'), layout=requireGame('js/layout.js'),pack=requireGame('js/pack.js');
      const list=pack.ring(s.offer.length,pv.spinOf(s),layout.contentTop(vp));
      for(let j=list.length-1;j>=0;j--){const r=list[j];const id=pv.hitRing(vp,s,r.x,r.y);if(id&&!s.picked.includes(id))return{x:r.x,y:r.y,id};}
      throw new Error('No visible unpicked ring card');
    });
    await tap(page,await point(page,front.x,front.y),touch);
    assert.equal((await state(page)).picked.length,i+1);
    if(i<2) {
      await page.clock.runFor(440);
      const from=await point(page,150,front.y),to=await point(page,220,front.y);
      const before=(await state(page)).picked.length;
      await drag(page,from,to,touch);await page.clock.runFor(32);
      assert.equal((await state(page)).picked.length,before);
    }
  }
  await page.clock.runFor(1100);
  assert.equal((await state(page)).stage,'pick');
  const g=await geometry(page);
  const pick=await page.evaluate(()=>{const l=rolesPreview.requireGame('js/layout.js'),vp=rolesPreview.requireGame('js/env.js').viewport();return{top:l.pickTop(vp),bottom:l.contentBottom(vp),card:l.pickCardRect(0),intro:l.pickIntroRect(),button:l.pickButtonRect()};});
  assert.ok(pick.card.y+pick.card.h<pick.intro.y, 'Candidate description stays below the artwork');
  assert.ok(pick.top+pick.button.y+pick.button.h+32<=pick.bottom, 'Confirmation and caption stay above navigation');
  await tap(page,await point(page,pick.card.x+pick.card.w/2,pick.top+pick.card.y+pick.card.h/2),touch);
  const selected=(await state(page)).slot;assert.ok(selected);
  await page.clock.runFor(32); // Render the newly enabled confirmation button before clicking it.
  await page.evaluate(()=>rolesPreview.requireGame('js/pag-reveal.js').settled());
  const ready=await page.evaluate(()=>rolesPreview.requireGame('js/pag-reveal.js').status().ready);
  assert.equal(ready,expectPag);
  await shot(page,name+'-candidates');
  const button=await page.evaluate(()=>{const r=rolesPreview.requireGame('js/layout.js').pickButtonRect();return{x:r.x+r.w/2,y:r.y+r.h/2};});
  await tap(page,await point(page,button.x,pick.top+button.y),touch);
  await page.clock.runFor(80);
  let saved=await state(page);assert.equal(saved.stage,'reveal');assert.equal(saved.draw.role.id,selected);
  await tap(page,await point(page,187.5,g.top+210),touch);
  assert.equal((await state(page)).stage,'reveal');
  await page.clock.runFor(370);await flush(page);
  const mode=await page.evaluate(()=>rolesPreview.requireGame('js/pag-reveal.js').status().mode);
  assert.equal(mode,expectPag?'pag':'fallback');
  const screenshot=await shot(page,name+'-reveal');
  if(autoFinish)await page.clock.runFor(700);
  else {await tap(page,await point(page,187.5,g.top+210),touch);await page.clock.runFor(32);}
  await page.evaluate(()=>rolesPreview.requireGame('js/pag-reveal.js').settled());
  saved=await state(page);assert.equal(saved.stage,'');assert.equal(saved.draw.role.id,selected);
  assert.equal(await page.evaluate(()=>rolesPreview.requireGame('js/pag-reveal.js').status().ready),false);
  results.push({case:name+' real card selection, reveal, early-tap guard and '+(autoFinish?'auto-finish':'click-through'),mode,role:selected,screenshot});
}
async function zone(page,id) {
  return page.evaluate(id=>{
    const {requireGame}=rolesPreview,s=rolesPreview.game.store.state,vp=requireGame('js/env.js').viewport(),view=requireGame('js/render.js');
    if(id==='owned') {
      const index=s.collection.cards.findIndex(card=>card.owned);
      if(index<0)throw new Error('No owned card to inspect');
      const r=requireGame('js/layout.js').collectionCardRect(index);
      return {x:r.x+r.w/2,y:requireGame('js/layout.js').contentTop(vp)+r.y+r.h/2-s.scroll};
    }
    let list;
    if(id.startsWith('tab:'))list=view.tabbarRects(vp).map(item=>({id:'tab:'+item.id,rect:item}));
    else if(s.selected)list=view.renderSheet(vp,s);
    else list=(s.tab==='today'?view.renderToday(vp,s):s.tab==='calendar'?view.renderCalendar(vp,s):view.renderCollection(vp,s)).zones;
    const target=list.find(item=>id==='owned'?item.id==='card'&&item.card.owned:item.id===id);
    if(!target)throw new Error('UI zone not found: '+id);
    const r=target.rect;return{x:r.x+r.w/2,y:r.y+r.h/2};
  },id);
}
async function clickZone(page,id) {
  for(let i=0;i<10;i++) {
    const p=await zone(page,id),g=await geometry(page);
    if(id.startsWith('tab:')||id==='sheet-close'||id==='prev-month'||id==='next-month'||(p.y>g.top+24&&p.y<g.bottom-24))return page.mouse.click((await point(page,p.x,p.y)).x,(await point(page,p.x,p.y)).y);
    const at=await point(page,187.5,(g.top+g.bottom)/2);
    await page.mouse.move(at.x,at.y);await page.mouse.wheel(0,(p.y-(g.top+g.bottom)/2)*g.width/375);await page.clock.runFor(32);
  }
  throw new Error('Could not scroll to '+id);
}
// ResizeObserver follows the native rendering cycle, independently of the controlled RAF clock.
async function waitForResize(page,width) {
  for(let i=0;i<40;i++) {
    await page.clock.runFor(32);
    if(await page.evaluate(()=>rolesPreview.requireGame('js/env.js').size().width)===width)return;
    await page.waitForTimeout(25);
  }
  assert.equal(await page.evaluate(()=>rolesPreview.requireGame('js/env.js').size().width),width);
}
async function main() {
  await build();await fs.mkdir(ARTIFACTS,{recursive:true});
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  let browser;
  try {
    for(const address of ['/.env','/api/health','/server/src/index.ts','/%2e%2e%2fpackage.json'])assert.equal((await fetch(base+address)).status,404);
    const wasm=await fetch(base+'/vendor/pag/libpag.wasm');assert.equal(wasm.status,200);assert.equal(wasm.headers.get('content-type'),'application/wasm');
    results.push({case:'Only built preview files are served; WASM has correct MIME; no backend or workspace routes'});
    browser=await chromium.launch({executablePath:await browserExecutable(),headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const desktop=await open(browser,base);
    const homepage=await shot(desktop.page,'desktop-home');
    assert.ok(desktop.requests.every(address=>new URL(address).origin===base));
    results.push({case:'Desktop preview loads independently with no external API requests',screenshot:homepage});
    await chooseAndTear(desktop,'desktop');await selectAndReveal(desktop,'desktop');
    await clickZone(desktop.page,'task');await desktop.page.clock.runFor(32);assert.equal((await state(desktop.page)).draw.doneCount,1);
    await clickZone(desktop.page,'note');await desktop.page.locator('#note-input').fill('网页体验：开包和揭晓都能操作。');
    await desktop.page.getByRole('button',{name:'保存',exact:true}).click();await desktop.page.clock.runFor(32);
    await desktop.page.reload({waitUntil:'networkidle'});await desktop.page.clock.runFor(32);
    const restored=await state(desktop.page);assert.equal(restored.draw.doneCount,1);assert.equal(restored.draw.noteDraft,'网页体验：开包和揭晓都能操作。');
    results.push({case:'Mouse wheel, task check-in and note dialog work; local records survive reload'});
    await clickZone(desktop.page,'tab:calendar');await desktop.page.clock.runFor(32);
    assert.ok((await state(desktop.page)).calendar.cells.some(cell=>cell.entry&&cell.entry.tasksDone===1));
    const month=(await state(desktop.page)).calendar.month;await clickZone(desktop.page,'prev-month');await desktop.page.clock.runFor(32);assert.notEqual((await state(desktop.page)).calendar.month,month);
    await clickZone(desktop.page,'tab:collection');await desktop.page.clock.runFor(32);
    assert.equal((await state(desktop.page)).collection.cards.length,20);
    await clickZone(desktop.page,'owned');await desktop.page.clock.runFor(32);assert.ok((await state(desktop.page)).selected);
    await clickZone(desktop.page,'sheet-close');await desktop.page.clock.runFor(32);assert.equal((await state(desktop.page)).selected,null);
    results.push({case:'Calendar, month navigation, collection and role details are interactive'});
    assert.deepEqual(desktop.errors,[]);await desktop.context.close();
    const mobile=await open(browser,base,true);
    assert.equal((await state(mobile.page)).draw,null);
    await chooseAndTear(mobile,'mobile');await selectAndReveal(mobile,'mobile',true,true);
    await mobile.page.setViewportSize({width:430,height:920});await waitForResize(mobile.page,430);
    assert.equal(await mobile.page.evaluate(()=>rolesPreview.requireGame('js/env.js').size().width),430);
    assert.ok((await state(mobile.page)).draw);
    await mobile.page.getByRole('button',{name:'重新体验',exact:true}).click();await mobile.page.waitForLoadState('networkidle');
    assert.equal((await state(mobile.page)).stage,'pack');assert.equal((await state(mobile.page)).draw,null);
    assert.deepEqual(mobile.errors,[]);results.push({case:'Mobile touch, resize, independent visitor data and restart work'});await mobile.context.close();
    const small=await open(browser,base,true,false,true);await chooseAndTear(small,'small-phone');await selectAndReveal(small,'small-phone',true,true);assert.deepEqual(small.errors,[]);await small.context.close();
    const fallback=await open(browser,base,false,true);await chooseAndTear(fallback,'fallback');await selectAndReveal(fallback,'fallback',false,true);assert.deepEqual(fallback.errors,[]);await fallback.context.close();
    await fs.writeFile(path.join(ARTIFACTS,'verification.json'),JSON.stringify({verifiedAt:new Date().toISOString(),environment:'Chromium, actual mouse and CDP touch input; deterministic timeline for screenshots',passed:results.length,results},null,2)+'\n');
    console.log(JSON.stringify({passed:results.length,results},null,2));
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
