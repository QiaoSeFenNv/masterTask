/** Read-only calendar card lightbox. Its viewer and texture cache are independent of today. */
var draw=require('./draw.js');
var layout=require('./layout.js');
var theme=require('./theme.js');
var animation=require('./animation.js');
var roles=require('../data/roles.js').roles;
var viewer=require('./today-card.js').create();
var item=null,from=null,at=0,closing=false,closeFrom=null,originHeight=0;
var OPEN_MS=240,CLOSE_MS=200;
function reduced() {return typeof matchMedia==='function' && matchMedia('(prefers-reduced-motion: reduce)').matches;}
function blend(a,b,p) {return {x:a.x+(b.x-a.x)*p,y:a.y+(b.y-a.y)*p,w:a.w+(b.w-a.w)*p,h:a.h+(b.h-a.h)*p};}
function sample(vp) {
  if(!item) return null;
  var p=animation.progress(at,reduced()?0:(closing?CLOSE_MS:OPEN_MS));
  var k=animation.easing.inOutCubic(p);
  var target=viewer.rect(vp);
  return {rect:closing?blend(closeFrom,targetSource(vp),k):blend(from,target,k),
    opacity:closing?1-k:k,busy:p<1};
}
function targetSource(vp) {
  if(vp.height===originHeight) return from;
  // Keep the origin within the visible month if the viewport changes while inspecting.
  return {x:from.x,y:Math.max(layout.contentTop(vp)+76,Math.min(from.y,layout.contentBottom(vp)-from.h-32)),w:from.w,h:from.h};
}
function open(zone,vp) {
  if(!zone.entry || item) return;
  var entry=zone.entry;
  var role=roles.find(function(role){return role.id===entry.roleId;}) ||
    {id:entry.roleId || entry.roleName,name:entry.roleName,emoji:entry.emoji,gradient:entry.gradient,
      tagline:'',intro:'这一天的角色。'};
  item={draw:{date:zone.date,role:role}};
  from=Object.assign({},zone.sourceRect || zone.rect);
  at=animation.now();closing=false;closeFrom=null;originHeight=vp.height;viewer.cancel();
  viewer.render(vp,item,{rect:from,hint:false,zoneId:'calendar-card'});
}
function close(vp) {
  if(!item || closing) return;
  closeFrom=sample(vp).rect;closing=true;at=animation.now();viewer.cancel();
}
function release() {item=null;closing=false;closeFrom=null;viewer.reset();}
function active() {return Boolean(item);}
function interactive() {return item && !closing;}
function busy(vp) {return Boolean(item && (sample(vp).busy || viewer.snapshot().busy));}
function snapshot() {return Object.assign({active:active(),date:item && item.draw.date,roleId:item && item.draw.role.id,closing:closing},viewer.snapshot());}
function render(vp) {
  if(!item) return [];
  var pose=sample(vp);
  if(closing && !pose.busy) {release();return [];}
  var c=draw.getCtx();
  c.save();c.globalAlpha*=pose.opacity;
  // Hide the calendar title and statistics while the focused card owns the view.
  c.fillStyle=theme.sheetFill;c.fillRect(0,0,layout.W,layout.contentBottom(vp));
  draw.text(item.draw.date.replace(/-/g,' / ')+' · '+layout.weekdayZh(item.draw.date),layout.W/2,vp.safeTop+40,
    {size:14,color:theme.bodyBright,align:'center'});
  var closeRect={x:layout.W-layout.PAD-40,y:vp.safeTop+16,w:40,h:40};
  draw.text('×',closeRect.x+20,closeRect.y+27,{size:26,color:theme.bodyBright,align:'center'});
  c.restore();
  // The moving miniature uses the same card texture as the final interactive view.
  var zones=viewer.render(vp,item,{rect:pose.rect,hint:false,zoneId:'calendar-card'}).zones;
  if(!closing) {
    c.save();c.globalAlpha*=pose.opacity;
    var r=viewer.rect(vp);
    draw.text('拖动旋转 · 轻点翻面',layout.W/2,r.y+r.h+48,{size:12,color:theme.bodyBright,align:'center'});
    c.restore();
  }
  return [{id:'calendar-card-dismiss',rect:{x:0,y:0,w:layout.W,h:layout.contentBottom(vp)}}]
    .concat(closing?[]:zones).concat([{id:'calendar-card-close',rect:closeRect}]);
}
function begin(x,y) {if(interactive())viewer.begin(x,y);}
function move(x,y) {if(interactive())viewer.move(x,y);}
function end(cancelled,tapped) {if(interactive())viewer.end(cancelled,tapped);}
function flip() {if(interactive())viewer.flip();}
function cancel() {viewer.cancel();}
module.exports={open:open,close:close,render:render,active:active,interactive:interactive,busy:busy,
  snapshot:snapshot,begin:begin,move:move,end:end,flip:flip,cancel:cancel,release:release,rect:viewer.rect,OPEN_MS:OPEN_MS,CLOSE_MS:CLOSE_MS};
