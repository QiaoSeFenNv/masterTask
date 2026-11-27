const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const surface=require('../game/js/packet-surface.js');
const pack=require('../game/js/pack.js'),spec=require('../game/js/pag-tear-template.js');
const env=require('../game/js/env.js'),draw=require('../game/js/draw.js'),layout=require('../game/js/layout.js');
const roles=require('../game/data/roles.js').roles;
function context() {
  const ops=[],stack=[];
  const c=new Proxy({globalAlpha:1,
    save(){stack.push(this.globalAlpha);},restore(){this.globalAlpha=stack.pop()??1;},
    createLinearGradient:(...args)=>{const stops=[];ops.push(['gradient',args,stops]);return {addColorStop:(...stop)=>stops.push(stop)};},
    createRadialGradient:()=>({addColorStop(){}}),measureText:text=>({width:String(text).length*6})
  },{get:(o,key)=>key in o?o[key]:(...args)=>ops.push([key,...args])});
  return {c,ops};
}
function setup(height) {
  env.setWx({getSystemInfoSync:()=>({windowWidth:375,windowHeight:height,pixelRatio:2,safeArea:{top:0,bottom:height}})});
  const result=context();draw.init({width:750,height:height*2,getContext:()=>result.c});
  return {...result,vp:env.viewport(),state:{status:'ready',tab:'today',offer:roles.slice(0,10),picked:[],anim:{kind:'pack'},scroll:0}};
}
test('Booster has the reference-style slender ratio and one geometry for Canvas and PAG',()=>{
  const r=pack.tearRect(92);
  assert.equal(r.w,150);assert.equal(r.h,278);assert.ok(r.w/r.h<.56);
  assert.equal(r.w,surface.WIDTH);assert.equal(r.h,surface.HEIGHT);
  assert.deepEqual(spec.packet,{x:r.x,y:r.y-92,width:r.w,height:r.h,seam:surface.SEAM,tiltDegrees:8,returnMs:260});
  const body=spec.textures.find(t=>t.name==='packet-body');assert.equal(body.width,r.w);assert.equal(body.height,r.h);
});
test('All three selectable boosters preserve the final aspect and fit small screens with captions',()=>{
  const view=require('../game/js/packview.js');
  for(const height of [460,540,667,844]) {
    const {vp,state}=setup(height),zones=view.render(vp,state).zones;
    assert.equal(zones.length,3);
    for(const z of zones) {
      assert.ok(Math.abs(z.rect.w/(z.rect.h-48)-surface.WIDTH/surface.HEIGHT)<1e-9);
      assert.ok(z.rect.y>=layout.contentTop(vp));assert.ok(z.rect.y+z.rect.h<=layout.contentBottom(vp));
      assert.ok(z.rect.x>=layout.PAD);assert.ok(z.rect.x+z.rect.w<=375-layout.PAD);
    }
  }
});
test('Missing artwork and foil still paint a complete, labelled silver booster on frame one',()=>{
  const {c,ops}=context();
  for(const series of pack.SERIES)surface.paint(c,null,{x:0,y:0,w:150,h:278},series,{shadow:false});
  assert.equal(ops.filter(op=>op[0]==='fillRect'&&op[3]===150&&op[4]===278).length,3);
  for(const text of ['每日角色','TRADING CARD PACK','深海','暮色','晨曦','DAILY ROLES / 10 CARDS'])
    assert.ok(ops.some(op=>op[0]==='fillText'&&op[1]===text),text);
  assert.equal(ops.filter(op=>op[0]==='drawImage').length,0);assert.equal(c.globalAlpha,1);
});
test('Closed pack sides are straight and rounded only at the four tiny corners',()=>{
  const {c,ops}=context();surface.paint(c,null,{x:0,y:0,w:150,h:278},pack.SERIES[0],{shadow:false});
  const curves=ops.filter(op=>op[0]==='quadraticCurveTo');
  assert.equal(curves.length,8); // Once for the clipping path, once for its outline.
  for(const [,cx,cy,x,y] of curves) {
    assert.ok([3,6,144,147].includes(cx)&&[3,6,144,147].includes(x));
    assert.ok([2,5,273,276].includes(cy)&&[2,5,273,276].includes(y));
  }
  assert.ok(ops.some(op=>op[0]==='lineTo'&&op[1]===147&&op[2]===273));
  assert.ok(ops.some(op=>op[0]==='lineTo'&&op[1]===3&&op[2]===5));
});
test('Full-bleed print removes ornamental edges without distorting its circular illustration',()=>{
  const {c,ops}=context(),image={width:512,height:768};
  surface.paint(c,image,{x:10,y:20,w:150,h:278},pack.SERIES[0],{shadow:false});
  const op=ops.find(op=>op[0]==='drawImage');assert.equal(op[1],image);
  const [, ,sx,sy,sw,sh,dx,dy,dw,dh]=op;
  assert.ok(sx>0&&sy>0&&sx+sw<=512&&sy+sh<=768);assert.ok(Math.abs(sw/sh-dw/dh)<1e-9);
  assert.deepEqual([dx,dy,dw,dh],[5,34,140,224]);
});
test('Painter and flattened opening remain self-contained for the PAG texture builder',()=>{
  for(const painter of [surface.paint,surface.interior]) {
    const copy=vm.runInNewContext('('+painter.toString()+')');const {c}=context();
    if(painter===surface.paint)copy(c,null,{x:0,y:0,w:150,h:278},pack.SERIES[0],{shadow:false});
    else copy(c,{x:0,y:0,w:160,h:40},pack.SERIES[0],1);
    assert.equal(c.globalAlpha,1);
  }
});
test('All strip and body textures use the updated whole-booster print, but keep the original 24-unit seam',()=>{
  const textures=require('../game/js/tear-textures.js'),calls=[];
  const painter=(c,image,rect)=>calls.push(rect);
  for(const t of spec.textures.filter(t=>t.name==='packet-body'||t.name.startsWith('strip-')))
    textures.paint(context().c,t.name,t.width,t.height,pack.SERIES[0],null,painter,null,null,spec.packet);
  assert.equal(calls.length,4);
  for(const r of calls)assert.deepEqual(r,{x:0,y:0,w:150,h:278});
  assert.equal(surface.SEAM,24);assert.ok(spec.textures.filter(t=>t.name.startsWith('strip-')).every(t=>t.height===42));
});
test('Seal masks have the correct new dimensions and remain small project assets',()=>{
  for(const series of pack.SERIES) {
    const data=fs.readFileSync(require('node:path').join(__dirname,'../game/assets/packet-foil-'+series.id+'.png'));
    assert.equal(data.subarray(1,4).toString(),'PNG');assert.equal(data.readUInt32BE(16),surface.WIDTH*2);
    assert.equal(data.readUInt32BE(20),surface.HEIGHT*2);assert.ok(data.length<40000,'seal-only PNG should stay below 40KB');
  }
});
test('Dragging cached printing never rebuilds it; a late-loaded image or foil invalidates just the face',()=>{
  const canvases=[];let foil=null;
  const wx={createOffscreenCanvas:({width,height})=>{const {c}=context();const canvas={width,height,getContext:()=>c};canvases.push(canvas);return canvas;}};
  const scope={module:{exports:{}},require:name=>{
    if(name==='./env.js')return {getWx:()=>wx};if(name==='./assets.js')return {foil:()=>foil};throw Error('Unexpected '+name);
  }};
  vm.runInNewContext(fs.readFileSync(require.resolve('../game/js/packet-surface.js'),'utf8'),scope);
  const cache=scope.module.exports,{c}=context(),r={x:0,y:0,w:150,h:278},s=pack.SERIES[0];
  cache.draw(c,null,r,s);assert.equal(canvases.length,2);
  cache.draw(c,null,{...r,x:10,w:120,h:222.4},s);assert.equal(canvases.length,2);
  const image={width:512,height:768};cache.draw(c,image,r,s);assert.equal(canvases.length,3);
  foil={width:300,height:556};cache.draw(c,image,r,s);assert.equal(canvases.length,4);
  cache.draw(c,image,r,s);assert.equal(canvases.length,4);
  assert.deepEqual(canvases.slice(1).map(c=>[c.width,c.height]),[[300,556],[300,556],[300,556]]);
});
test('The sealed booster and its tear instruction stay above navigation on a small phone',()=>{
  const {vp,state,ops}=setup(540);state.anim={kind:'tear',series:'deep',p:0};
  require('../game/js/packview.js').render(vp,state);
  const r=pack.tearRect(layout.contentTop(vp));assert.ok(r.y+r.h<layout.contentBottom(vp));
  const hint=ops.find(op=>op[0]==='fillText'&&op[1]==='划动卡包，撕开包装');assert.ok(hint);
  assert.ok(hint[3]<layout.contentBottom(vp));assert.ok(hint[3]>r.y+r.h);
});

test('Actual 320px browser safe-area metrics leave a readable gap beneath the sealed pack',()=>{
  const height=543.75;env.setWx({getSystemInfoSync:()=>({windowWidth:375,windowHeight:height,pixelRatio:2,safeArea:{top:18.75,bottom:height-14.0625}})});
  const {c,ops}=context();draw.init({width:750,height:height*2,getContext:()=>c});
  const vp=env.viewport(),state={status:'ready',tab:'today',offer:roles.slice(0,10),picked:[],anim:{kind:'tear',series:'dawn',p:0}};
  require('../game/js/packview.js').render(vp,state);
  const r=pack.tearRect(layout.contentTop(vp)),hint=ops.find(op=>op[0]==='fillText'&&op[1]==='划动卡包，撕开包装');
  assert.ok(hint[3]-6>=r.y+r.h+8);assert.ok(hint[3]+6<=layout.contentBottom(vp)-8);
});
