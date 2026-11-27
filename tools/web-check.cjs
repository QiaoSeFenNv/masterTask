/** Real mouse/touch checks of the static Web preview, using the production game modules. */
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require('playwright-core');
const {browserExecutable} = require('./build-pag-template.cjs');
const {shadowSamples} = require('./shadow-check.cjs');
const {build} = require('./build-web.cjs');
const {createServer} = require('./serve-web.cjs');
const ARTIFACTS = path.resolve(__dirname, '.web-preview');
const results = [];
async function state(page) { return page.evaluate(() => {
  const s = rolesPreview.game.store.state;
  return {stage:s.anim.kind,draw:s.draw,slot:s.slot,picked:s.picked.slice(),p:s.anim.p,
    tilt:s.anim.tilt,finishMode:s.anim.finishMode,finishMs:s.anim.finishMs,scroll:s.scroll,scrollMax:s.scrollMax,tab:s.tab,calendar:s.calendar,collection:s.collection,selected:s.selected};
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
  const p=rolesPreview.requireGame('js/pag-reveal.js'),t=rolesPreview.requireGame('js/pag-tear.js');
  await Promise.all([p.settled(),t.settled()]);rolesPreview.game.render();await Promise.all([p.settled(),t.settled()]);rolesPreview.game.render();
}); }
async function shot(page,name) { const file=path.join(ARTIFACTS,name+'.png');await page.screenshot({path:file,fullPage:true});return file; }
async function open(browser,base,mobile=false,unsupported=false,small=false,visitor=null) {
  const context=await browser.newContext({viewport:mobile?(small?{width:375,height:667}:{width:390,height:844}):{width:1280,height:1000},deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile});
  if(visitor)await context.addInitScript(visitor=>{
    const key='roles.web-preview.v1';
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({version:1,visitor,draws:{},rounds:{}}));
  },visitor);
  if(unsupported)await context.addInitScript(()=>{Object.defineProperty(globalThis,'WebAssembly',{value:undefined,configurable:true});});
  await context.addInitScript(()=>{
    globalThis.__cuePlays=[];
    const play=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(){globalThis.__cuePlays.push({src:this.src,gesture:navigator.userActivation.hasBeenActive});return play.call(this);};
  });
  const page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('request',request=>requests.push(request.url()));
  await page.clock.install({time:new Date('2026-11-24T20:00:00+08:00')});
  // Freeze the empty document before navigation, so a slow Canvas render cannot miss the target.
  await page.clock.pauseAt(new Date('2026-11-24T20:00:01+08:00'));
  await page.goto(base,{waitUntil:'networkidle'});
  assert.equal(await page.evaluate(()=>rolesPreview.game.store.state.status),'ready');
  // Request the three lazy foil assets explicitly for this all-series decoding check.
  await page.waitForFunction(()=>['deep','dusk','dawn'].map(id=>rolesPreview.requireGame('js/assets.js').foil(id)).every(Boolean));
  assert.ok(await page.evaluate(()=>['deep','dusk','dawn'].every(id=>Boolean(rolesPreview.requireGame('js/assets.js').foil(id)))),
    'Every series serves and decodes its unprinted foil PNG; a gradient fallback must not hide missing assets');
  await page.clock.runFor(32);
  assert.equal(await page.evaluate(()=>__cuePlays.length),0,"Preloading never autoplays");
  return {page,context,errors,requests,touch:mobile?await context.newCDPSession(page):null};
}
async function entryScales(page) {
  return page.evaluate(() => {
    const ctx=rolesPreview.requireGame('js/draw.js').getCtx(), original=ctx.scale, samples=[];
    ctx.scale=function(x,y){samples.push([x,y]);return original.call(this,x,y);};
    try { rolesPreview.game.render(); } finally { ctx.scale=original; }
    return samples;
  });
}
async function candidateCaption(page,roleId) {
  return page.evaluate(roleId=>{
    const s=rolesPreview.game.store.state,layout=rolesPreview.requireGame('js/layout.js');
    const ctx=rolesPreview.requireGame('js/draw.js').getCtx(), original=ctx.fillText, samples=[];
    const role=s.offer.find(role=>role.id===roleId),card=layout.pickCardRect(s.picked.indexOf(roleId));
    ctx.fillText=function(text,x,y,...rest){
      if(String(text)===role.tagline)samples.push({text:String(text),x,y,width:this.measureText(String(text)).width});
      return original.call(this,text,x,y,...rest);
    };
    try { rolesPreview.game.render(); } finally { ctx.fillText=original; }
    return {role:role.id,tagline:role.tagline,card,samples};
  },roleId);
}
async function chooseAndTear(session,name,direction='right') {
  const {page,touch}=session, g=await geometry(page);
  const paths={right:{x:98,y:159,dx:1,dy:0,sign:1},left:{x:277,y:159,dx:-1,dy:0,sign:-1},
    up:{x:187.5,y:280,dx:0,dy:-1,sign:1},down:{x:187.5,y:124,dx:0,dy:1,sign:1},
    diagonal:{x:132,y:128,dx:.6,dy:.8,sign:1}};
  const path=paths[direction];assert.ok(path,'Known tear gesture');
  assert.ok((await entryScales(page)).some(([x,y])=>x>=0.96&&x<1&&x===y), "Series entry is animating when the first tap is accepted");
  await tap(page,await point(page,72,g.top+158),touch);
  assert.equal((await state(page)).stage,'opening');
  await page.clock.runFor(180);
  assert.equal((await state(page)).stage,'opening');
  const opening=await shot(page,name+'-opening');
  await page.clock.runFor(320);
  assert.equal((await state(page)).stage,'tear');
  assert.equal((await state(page)).p,0);
  await page.evaluate(()=>rolesPreview.requireGame('js/pag-tear.js').settled());
  const start=await point(page,path.x,g.top+path.y), partial=await point(page,path.x+75*path.dx,g.top+path.y+75*path.dy);
  await drag(page,start,partial,touch);
  assert.ok((await state(page)).p>0 && (await state(page)).p<1);
  assert.ok(Math.abs((await state(page)).tilt-4*path.sign)<.02 && Math.abs((await state(page)).p-.5)<.002, direction+' half tear progresses equally and visibly tilts four degrees');
  await page.evaluate(()=>rolesPreview.game.render());
  const tearing=await shot(page,name+'-tearing');
  await page.clock.runFor(300);
  const retained=(await state(page)).p;assert.ok(retained>0 && retained<0.4);
  assert.equal((await state(page)).tilt,0, "Packet returns upright without resetting tear progress");
  await drag(page,start,await point(page,path.x+165*path.dx,g.top+path.y+165*path.dy),touch);
  assert.equal((await state(page)).tilt,8*path.sign);
  await page.clock.runFor(32);
  await flush(page);
  const completion=await state(page);assert.equal(completion.stage,'tearFinish');
  const duration=completion.finishMs;
  assert.equal(duration,2200,"PAG and Canvas share the slow card extraction timing");
  await page.clock.runFor(948);await flush(page);
  assert.equal((await state(page)).stage,'tearFinish');
  const extracting=await shot(page,name+'-card-extraction');
  await page.clock.runFor(1190);await flush(page);
  assert.equal((await state(page)).stage,'tearFinish');
  const completed=await shot(page,name+'-tear-completion');
  await page.clock.runFor(64);await page.evaluate(()=>rolesPreview.game.render());
  assert.equal((await state(page)).stage,'ring');
  results.push({case:name+' '+direction+' swipe: free-position tilt and complete packet opening',opening,tearing,extracting,completed,completionMode:completion.finishMode,duration});
}
async function selectAndReveal(session,name,expectPag=true,autoFinish=false) {
  const {page,touch}=session;
  const shadows=await shadowSamples(page);assert.equal(shadows.length,10);
  assert.ok(shadows.every(shadow=>shadow.ry/shadow.rx<=.241 && shadow.pixels.center>shadow.pixels.half && shadow.pixels.half>=shadow.pixels.edge && shadow.pixels.outside===0));
  assert.ok(shadows[0].alpha<shadows[shadows.length-1].alpha);
  results.push({case:name+' shadows stay flat, narrow with side cards, and have transparent feathered edges',shadows});
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
  let caption;
  if(name==='desktop'){
    assert.equal(selected,'surveyor','Desktop fixture exercises the reported surveyor caption');
    caption=await candidateCaption(page,selected);
    assert.ok(caption.samples.some(sample=>sample.text===caption.tagline&&
      sample.x-sample.width/2>=caption.card.x+8&&sample.x+sample.width/2<=caption.card.x+caption.card.w-8),
      'The complete surveyor tagline fits inside the candidate card');
  }
  await page.evaluate(()=>rolesPreview.requireGame('js/pag-reveal.js').settled());
  const ready=await page.evaluate(()=>rolesPreview.requireGame('js/pag-reveal.js').status().ready);
  assert.equal(ready,expectPag);
  await shot(page,name+'-candidates');
  const button=await page.evaluate(()=>{const r=rolesPreview.requireGame('js/layout.js').pickButtonRect();return{x:r.x+r.w/2,y:r.y+r.h/2};});
  await tap(page,await point(page,button.x,pick.top+button.y),touch);
  await page.clock.runFor(80);
  let saved=await state(page);assert.equal(saved.stage,'reveal');assert.equal(saved.draw.role.id,selected);
  assert.equal(await page.evaluate(()=>rolesPreview.game.store.state.toast),'','Successful confirmation has no toast covering the title');
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
  assert.equal(await page.evaluate(()=>rolesPreview.game.store.state.toast),'','Today title remains unobstructed after reveal');
  if(caption)results.push({case:'Surveyor tagline is complete and fits; confirmation and today page have no success toast',caption});
  const cues=await page.evaluate(()=>__cuePlays);
  assert.ok(cues.every(cue=>cue.gesture), 'Every cue follows a real mouse/touch gesture');
  assert.equal(cues.filter(cue=>cue.src.endsWith('/sfx/tear.wav')).length,1);
  assert.equal(cues.filter(cue=>cue.src.endsWith('/sfx/flip.wav')).length,3);
  assert.equal(cues.filter(cue=>cue.src.endsWith('/sfx/settle.wav')).length,1);
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
    else if(s.tab==='calendar' && requireGame('js/calendar-card.js').active())list=requireGame('js/calendar-card.js').render(vp);
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
    if(id.startsWith('calendar-card-')||id.startsWith('tab:')||id==='sheet-close'||id==='prev-month'||id==='next-month'||(p.y>g.top+24&&p.y<g.bottom-24))return page.mouse.click((await point(page,p.x,p.y)).x,(await point(page,p.x,p.y)).y);
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
    for(const name of ['tear','flip','settle']){const audio=await fetch(base+'/assets/sfx/'+name+'.wav');assert.equal(audio.status,200);assert.equal(audio.headers.get('content-type'),'audio/wav');}
    const wasm=await fetch(base+'/vendor/pag/libpag.wasm');assert.equal(wasm.status,200);assert.equal(wasm.headers.get('content-type'),'application/wasm');
    results.push({case:'Only built preview files are served; WASM has correct MIME; no backend or workspace routes'});
    browser=await chromium.launch({executablePath:await browserExecutable(),headless:true,args:process.env.PAG_TEST_RENDERER==='native' ? (process.platform==='win32' ? ['--use-angle=d3d11'] : []) : ['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    // This visitor puts surveyor first on the frozen date, using the unchanged preview offer algorithm.
    const desktop=await open(browser,base,false,false,false,'surveyor-regression-13');
    const homepage=await shot(desktop.page,'desktop-home');
    assert.ok(desktop.requests.every(address=>new URL(address).origin===base));
    results.push({case:'Desktop preview loads independently with no external API requests',screenshot:homepage});
    await chooseAndTear(desktop,'desktop','left');await selectAndReveal(desktop,'desktop');
    const decoded=await desktop.page.evaluate(async()=>{
      const context=new AudioContext(),result=[];
      try{for(const name of ['tear','flip','settle']){const bytes=await(await fetch('assets/sfx/'+name+'.wav')).arrayBuffer();const audio=await context.decodeAudioData(bytes);result.push({name,duration:audio.duration,channels:audio.numberOfChannels});}}finally{await context.close();}
      return result;
    });
    assert.ok(decoded.every(cue=>cue.duration>0&&cue.duration<0.3&&cue.channels===1));
    results.push({case:'Three short cues decode in Chromium; gesture gate, tear, three flips and one settle verified',decoded});
    await desktop.page.clock.runFor(500);
    const todayBefore=(await state(desktop.page)).draw;
    const cardRect=await desktop.page.evaluate(()=>rolesPreview.requireGame('js/today-card.js').rect(rolesPreview.requireGame('js/env.js').viewport()));
    const cardFrom=await point(desktop.page,cardRect.x+25,cardRect.y+cardRect.h/2);
    const cardTo=await point(desktop.page,cardRect.x+cardRect.w*.88,cardRect.y+cardRect.h/2+40);
    await drag(desktop.page,cardFrom,cardTo);
    await desktop.page.clock.runFor(450);
    assert.ok(await desktop.page.evaluate(()=>rolesPreview.requireGame('js/today-card.js').snapshot().back));
    const back=await shot(desktop.page,'today-card-back');
    await clickZone(desktop.page,'today-card');await desktop.page.clock.runFor(450);
    assert.equal(await desktop.page.evaluate(()=>rolesPreview.requireGame('js/today-card.js').snapshot().back),false);
    const front=await shot(desktop.page,'today-card-front');
    const typography=await desktop.page.evaluate(()=>{
      const {requireGame}=rolesPreview,card=requireGame('js/today-card.js'),draw=requireGame('js/draw.js');
      const animation=requireGame('js/animation.js'),vp=requireGame('js/env.js').viewport(),s=rolesPreview.game.store.state;
      const original=draw.withCanvas,report=[];let samples=[];
      draw.withCanvas=function(target,callback){return original(target,ctx=>{
        const fill=ctx.fillText;
        ctx.fillText=function(text,x,y){
          const width=this.measureText(text).width;
          samples.push({text:String(text),x,y,width,align:this.textAlign,color:this.fillStyle});
          return fill.apply(this,arguments);
        };
        try{return callback(ctx);}finally{ctx.fillText=fill;}
      });};
      try {
        for(const role of requireGame('data/roles.js').roles) {
          const state={...s,draw:{...s.draw,role}};samples=[];
          card.render(vp,state);card.flip();
          animation.withTime(Date.now()+card.TURN_MS+1,()=>card.render(vp,state));
          report.push({role:role.id,complete:samples.filter(t=>t.color==='#403a32').map(t=>t.text).join('')===role.intro,
            bounds:samples.every(t=>{const left=t.align==='center'?t.x-t.width/2:t.x;
              return left>=10 && left+t.width<=270 && t.y>=10 && t.y<=400;})});
        }
      }finally{draw.withCanvas=original;card.render(vp,s);rolesPreview.game.render();}
      return report;
    });
    assert.equal(typography.length,20);
    assert.ok(typography.every(r=>r.complete&&r.bounds),'All 20 roles have complete readable descriptions and fitting card text');
    results.push({case:'All 20 role fronts and backs retain the original card content and fit without truncated descriptions',typography});
    await desktop.page.locator('#game').focus();await desktop.page.keyboard.press('Space');await desktop.page.clock.runFor(450);
    assert.ok(await desktop.page.evaluate(()=>rolesPreview.requireGame('js/today-card.js').snapshot().back));
    await desktop.page.keyboard.press('Enter');await desktop.page.clock.runFor(450);
    assert.equal(await desktop.page.evaluate(()=>rolesPreview.requireGame('js/today-card.js').snapshot().back),false);

    const todayUI=await desktop.page.evaluate(()=>{
      const {requireGame}=rolesPreview,s=rolesPreview.game.store.state;
      return {zones:requireGame('js/render.js').renderToday(requireGame('js/env.js').viewport(),s).zones.map(z=>z.id),scrollMax:s.scrollMax};
    });
    assert.deepEqual(todayUI,{zones:['today-card'],scrollMax:0});
    assert.deepEqual((await state(desktop.page)).draw,todayBefore,'Rotation and flipping never record tasks or notes');
    await desktop.page.reload({waitUntil:'networkidle'});await desktop.page.clock.runFor(500);
    const restored=await state(desktop.page);assert.deepEqual(restored.draw,todayBefore);
    assert.equal(await desktop.page.evaluate(()=>rolesPreview.requireGame('js/today-card.js').snapshot().back),false);
    results.push({case:'Read-only role card rotates in 3D, flips to description and back, and preserves draw records on reload',front,back});
    await clickZone(desktop.page,'tab:calendar');await desktop.page.clock.runFor(32);
    assert.ok((await entryScales(desktop.page)).some(([x,y])=>x>=0.96&&x<1&&x===y), 'Tab content animates while month navigation stays interactive');
    assert.ok((await state(desktop.page)).calendar.cells.some(cell=>cell.entry&&cell.entry.tasksDone===todayBefore.doneCount));
    await desktop.page.clock.runFor(300);
    const calendarShot=await shot(desktop.page,'calendar-card-month');
    const historical=(await state(desktop.page)).calendar.cells.find(cell=>cell.entry);
    await clickZone(desktop.page,'day');await desktop.page.clock.runFor(250);
    const historyPose=await desktop.page.evaluate(()=>rolesPreview.requireGame('js/calendar-card.js').snapshot());
    assert.equal(historyPose.date,historical.date);assert.equal(historyPose.roleId,historical.entry.roleId);
    assert.equal((await state(desktop.page)).selected,null,'History card does not use the old task summary sheet');
    const historyFront=await shot(desktop.page,'calendar-card-front');
    const historyRect=await desktop.page.evaluate(()=>rolesPreview.requireGame('js/calendar-card.js').rect(rolesPreview.requireGame('js/env.js').viewport()));
    await drag(desktop.page,await point(desktop.page,historyRect.x+25,historyRect.y+historyRect.h/2),
      await point(desktop.page,historyRect.x+historyRect.w*.88,historyRect.y+historyRect.h/2+35));
    await desktop.page.clock.runFor(450);
    assert.ok(await desktop.page.evaluate(()=>rolesPreview.requireGame('js/calendar-card.js').snapshot().back));
    const historyBack=await shot(desktop.page,'calendar-card-back');
    await desktop.page.locator('#game').focus();await desktop.page.keyboard.press('Escape');await desktop.page.clock.runFor(220);
    assert.equal(await desktop.page.evaluate(()=>rolesPreview.requireGame('js/calendar-card.js').active()),false);
    assert.deepEqual((await state(desktop.page)).draw,todayBefore);
    await clickZone(desktop.page,'day');await desktop.page.clock.runFor(50);
    await clickZone(desktop.page,'calendar-card-close');await desktop.page.clock.runFor(220);
    assert.equal(await desktop.page.evaluate(()=>rolesPreview.requireGame('js/calendar-card.js').active()),false,'Can dismiss while the opening animation is running');
    results.push({case:'Card calendar opens the original role, rotates to its full description, closes to the source day, and preserves records',calendarShot,historyFront,historyBack});
    await clickZone(desktop.page,'day');await desktop.page.clock.runFor(250);
    await clickZone(desktop.page,'tab:today');await desktop.page.clock.runFor(250);
    assert.equal(await desktop.page.evaluate(()=>rolesPreview.requireGame('js/calendar-card.js').active()),false,'Leaving calendar releases its focused card');
    assert.equal(await desktop.page.evaluate(()=>rolesPreview.requireGame('js/today-card.js').snapshot().back),false,'History rotation does not change the today card pose');
    await clickZone(desktop.page,'tab:calendar');await desktop.page.clock.runFor(250);
    const month=(await state(desktop.page)).calendar.month;await clickZone(desktop.page,'prev-month');await desktop.page.clock.runFor(32);assert.notEqual((await state(desktop.page)).calendar.month,month);
    await desktop.page.evaluate(()=>rolesPreview.game.store.loadCalendar(2026,1));await desktop.page.clock.runFor(250);
    await clickZone(desktop.page,'prev-month');await desktop.page.clock.runFor(250);
    assert.equal((await state(desktop.page)).calendar.year,2025);assert.equal((await state(desktop.page)).calendar.month,12);
    await clickZone(desktop.page,'next-month');await desktop.page.clock.runFor(250);
    assert.equal((await state(desktop.page)).calendar.year,2026);assert.equal((await state(desktop.page)).calendar.month,1);
    results.push({case:'Calendar navigation crosses year boundaries and leaving history releases its independent viewer'});
    await clickZone(desktop.page,'tab:collection');await desktop.page.clock.runFor(32);
    assert.equal((await state(desktop.page)).collection.cards.length,20);
    await clickZone(desktop.page,'owned');await desktop.page.clock.runFor(32);assert.ok((await state(desktop.page)).selected);
    await clickZone(desktop.page,'sheet-close');await desktop.page.clock.runFor(32);assert.equal((await state(desktop.page)).selected,null);
    results.push({case:'Calendar, month navigation, collection and role details are interactive'});
    assert.deepEqual(desktop.errors,[]);await desktop.context.close();
    const mobile=await open(browser,base,true);
    assert.equal((await state(mobile.page)).draw,null);
    await chooseAndTear(mobile,'mobile','up');await selectAndReveal(mobile,'mobile',true,true);
    await mobile.page.clock.runFor(500);
    const mobileCard=await mobile.page.evaluate(()=>rolesPreview.requireGame('js/today-card.js').rect(rolesPreview.requireGame('js/env.js').viewport()));
    await drag(mobile.page,await point(mobile.page,mobileCard.x+25,mobileCard.y+mobileCard.h/2),
      await point(mobile.page,mobileCard.x+mobileCard.w*.88,mobileCard.y+mobileCard.h/2+35),mobile.touch);
    await mobile.page.clock.runFor(450);
    assert.ok(await mobile.page.evaluate(()=>rolesPreview.requireGame('js/today-card.js').snapshot().back));
    await mobile.page.emulateMedia({reducedMotion:'reduce'});
    const mobileCenter=await point(mobile.page,187.5,mobileCard.y+mobileCard.h/2);
    await tap(mobile.page,mobileCenter,mobile.touch);await mobile.page.clock.runFor(32);
    assert.equal(await mobile.page.evaluate(()=>rolesPreview.requireGame('js/today-card.js').snapshot().back),false);
    assert.equal(await mobile.page.evaluate(()=>rolesPreview.requireGame('js/today-card.js').snapshot().busy),false);
    results.push({case:'Touch rotates the daily card; reduced motion flips instantly to the final readable side'});
    await mobile.page.setViewportSize({width:430,height:920});await waitForResize(mobile.page,430);
    assert.equal(await mobile.page.evaluate(()=>rolesPreview.requireGame('js/env.js').size().width),430);
    assert.ok((await state(mobile.page)).draw);
    await mobile.page.getByRole('button',{name:'重新体验',exact:true}).click();await mobile.page.waitForLoadState('networkidle');
    assert.equal((await state(mobile.page)).stage,'pack');assert.equal((await state(mobile.page)).draw,null);
    assert.deepEqual(mobile.errors,[]);results.push({case:'Mobile touch, resize, independent visitor data and restart work'});await mobile.context.close();
    const small=await open(browser,base,true,false,true);
    await chooseAndTear(small,'small-phone','down');await selectAndReveal(small,'small-phone',true,true);
    await tap(small.page,await point(small.page,187.5,(await geometry(small.page)).bottom+20),small.touch);
    await small.page.clock.runFor(300);
    const fixture=await small.page.evaluate(()=>{
      const {requireGame}=rolesPreview,s=rolesPreview.game.store.state,pool=requireGame('data/roles.js').roles;
      // In-memory display fixture only: no localStorage or API writes.
      s.tab='calendar';s.calendar={year:2026,month:11,streak:99,loading:false,error:'',cells:
        Array.from({length:42},(_,i)=>{
          if(i<6 || i>=36)return {type:'blank'};
          const day=i-5,role=pool[(day-1)%pool.length],date='2026-11-'+String(day).padStart(2,'0');
          return {type:'day',day,date,isToday:day===24,future:false,entry:{date,roleId:role.id,roleName:role.name,emoji:role.emoji,gradient:role.gradient,tasksDone:0,tasksTotal:3}};
        })};s.scroll=0;rolesPreview.game.render();return {draw:s.draw};
    });
    await small.page.clock.runFor(300);
    assert.ok((await state(small.page)).scrollMax>0,'Six calendar rows scroll on a short phone');
    const smallGeometry=await geometry(small.page);
    await drag(small.page,await point(small.page,187.5,smallGeometry.bottom-55),
      await point(small.page,187.5,smallGeometry.top+90),small.touch);await small.page.clock.runFor(50);
    assert.ok((await state(small.page)).scroll>0);
    const visibleDay=await small.page.evaluate(()=>{
      const {requireGame}=rolesPreview,vp=requireGame('js/env.js').viewport(),s=rolesPreview.game.store.state;
      const zones=requireGame('js/render.js').renderCalendar(vp,s).zones.filter(z=>z.id==='day');
      const z=zones[zones.length-1];return {x:z.rect.x+z.rect.w/2,y:z.rect.y+z.rect.h/2,date:z.date};
    });
    await tap(small.page,await point(small.page,visibleDay.x,visibleDay.y),small.touch);await small.page.clock.runFor(250);
    assert.equal(await small.page.evaluate(()=>rolesPreview.requireGame('js/calendar-card.js').snapshot().date),visibleDay.date);
    await small.page.emulateMedia({reducedMotion:'reduce'});
    const historyOnPhone=await small.page.evaluate(()=>rolesPreview.requireGame('js/calendar-card.js').rect(rolesPreview.requireGame('js/env.js').viewport()));
    await tap(small.page,await point(small.page,187.5,historyOnPhone.y+historyOnPhone.h/2),small.touch);await small.page.clock.runFor(32);
    assert.ok(await small.page.evaluate(()=>rolesPreview.requireGame('js/calendar-card.js').snapshot().back));
    const smallCard=await shot(small.page,'calendar-small-phone');
    const phoneClose=await zone(small.page,'calendar-card-close');
    await tap(small.page,await point(small.page,phoneClose.x,phoneClose.y),small.touch);await small.page.clock.runFor(32);
    assert.equal(await small.page.evaluate(()=>rolesPreview.requireGame('js/calendar-card.js').active()),false);
    assert.deepEqual((await state(small.page)).draw,fixture.draw);
    results.push({case:'Short phone scrolls six calendar rows, opens lower dates by touch, and respects reduced motion',fixture:'In-memory display dates only',smallCard});
    assert.deepEqual(small.errors,[]);await small.context.close();

    const fallback=await open(browser,base,false,true);await chooseAndTear(fallback,'fallback','diagonal');await selectAndReveal(fallback,'fallback',false,true);assert.deepEqual(fallback.errors,[]);await fallback.context.close();
    const rightSwipe=await open(browser,base);await chooseAndTear(rightSwipe,'right-swipe','right');assert.deepEqual(rightSwipe.errors,[]);await rightSwipe.context.close();
    await fs.writeFile(path.join(ARTIFACTS,'verification.json'),JSON.stringify({verifiedAt:new Date().toISOString(),environment:'Chromium, actual mouse and CDP touch input; deterministic timeline for screenshots',passed:results.length,results},null,2)+'\n');
    console.log(JSON.stringify({passed:results.length,results},null,2));
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
