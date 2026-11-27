/** Shared real mouse/CDP-touch scratch gestures for browser integration checks. */
const assert = require('node:assert/strict');
async function geometry(page) {
  return page.evaluate(() => {
    const {requireGame} = rolesPreview, state = rolesPreview.game.store.state;
    const layout = requireGame('js/layout.js'), vp = requireGame('js/env.js').viewport();
    const r = layout.todayScratchRect(); r.y += layout.contentTop(vp) - state.scroll;
    return {r, top:layout.contentTop(vp), bottom:layout.contentBottom(vp), scroll:state.scroll,
      max:state.scrollMax, pending:requireGame('js/store.js').scratchPending()};
  });
}
async function point(page, x, y) {
  return page.evaluate(({x,y}) => {const c=document.querySelector('#game').getBoundingClientRect();return{x:c.left+x*c.width/375,y:c.top+y*c.width/375};}, {x,y});
}
async function swipe(page, a, b, touch) {
  const from = await point(page,a.x,a.y), to = await point(page,b.x,b.y);
  if (touch) {
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:1}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...to,id:1}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  } else {
    await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y);await page.mouse.up();
  }
  await page.evaluate(() => rolesPreview.game.render());
}
async function position(page, touch, down = true) {
  const g=await geometry(page);
  // Start outside the card, leaving the scratch mask untouched while scrolling.
  if(touch) await swipe(page,{x:7,y:g.bottom-20},{x:7,y:down?g.top+20:g.bottom+300},touch);
  else {const p=await point(page,7,g.top+40);await page.mouse.move(p.x,p.y);await page.mouse.wheel(0,down?900:-3000);await page.evaluate(()=>rolesPreview.game.render());}
}
async function row(page, fraction, touch) {
  const g=await geometry(page), y=g.r.y+g.r.h*fraction;
  assert.ok(y>g.top && y<g.bottom,'Scratch row must be visible');
  await swipe(page,{x:g.r.x+8,y},{x:g.r.x+g.r.w-8,y},touch);
}
async function scratchAll(page, touch) {
  await position(page,touch);
  for(let y=0.04;y<1;y+=0.095) {
    const g=await geometry(page);if(!g.pending)break;
    if(g.r.y+g.r.h*y>g.top+2 && g.r.y+g.r.h*y<g.bottom-2)await row(page,y,touch);
  }
  assert.equal((await geometry(page)).pending,false,'Real scratch strokes reveal the tasks');
  // Restore the top for the existing task/note flow assertions.
  for(let i=0;i<4 && (await geometry(page)).scroll>0;i++)await position(page,touch,false);
}
module.exports={geometry, point, swipe, position, row, scratchAll};
