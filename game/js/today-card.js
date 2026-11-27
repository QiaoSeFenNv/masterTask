/** A read-only double-sided role card, projected in Canvas 2D. Uses the shared clock. */
var draw = require('./draw.js');
var env = require('./env.js');
var layout = require('./layout.js');
var theme = require('./theme.js');
var animation = require('./animation.js');
var cardface = require('./cardface.js');
var PI = Math.PI;
var TURN_MS = 420;
var TW = 280, TH = 420;
function createViewer() {
var key = '', role = null, yaw = 0, pitch = 0, gesture = null, motion = null;
var textures = [null, null], ratio = 0, bounds = null;

function reducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function sync(state) {
  var next = state.draw ? state.draw.date + ':' + state.draw.role.id : '';
  if (next !== key) {
    key = next; role = state.draw && state.draw.role;
    yaw = 0; pitch = 0; gesture = null; motion = null; textures = [null, null]; ratio = 0;
  }
}
function sample(time) {
  if (!motion) return;
  var p = animation.progress(motion.at, motion.ms, time);
  var k = animation.easing.outCubic(p);
  yaw = motion.yaw + (motion.toYaw - motion.yaw) * k;
  pitch = motion.pitch * (1 - k);
  if (p === 1) { yaw = motion.toYaw % (2 * PI); pitch = 0; motion = null; }
}
function settle(target) {
  motion = {at:animation.now(), ms:reducedMotion() ? 0 : TURN_MS,
    yaw:yaw, pitch:pitch, toYaw:target};
  sample(animation.now());
}
function begin(x, y) {
  sample(animation.now());
  gesture = {x:x, y:y, yaw:yaw, pitch:pitch}; motion = null;
}
function move(x, y) {
  if (!gesture || !bounds) return;
  yaw = gesture.yaw + (x - gesture.x) / bounds.w * PI;
  pitch = Math.max(-PI / 3, Math.min(PI / 3, gesture.pitch - (y - gesture.y) / bounds.h * 2));
}
function end(cancelled, tapped) {
  if (!gesture) return;
  gesture = null;
  settle(Math.round(yaw / PI) * PI + (tapped && !cancelled ? PI : 0));
}
function flip() {
  if (!role || gesture || motion) return;
  settle(Math.round(yaw / PI) * PI + PI);
}
function cancel() {
  gesture = null; motion = null;
  yaw = Math.round(yaw / PI) * PI % (2 * PI); pitch = 0;
}
function reset() {
  key='';role=null;yaw=0;pitch=0;gesture=null;motion=null;
  textures=[null,null];ratio=0;bounds=null;
}
function snapshot() {
  sample(animation.now());
  return {yaw:yaw, pitch:pitch, back:Math.cos(yaw) < 0, busy:Boolean(motion), dragging:Boolean(gesture)};
}
function rect(vp) {
  var h = Math.max(150, Math.min(TH, layout.contentH(vp) - 104));
  var w = h * TW / TH;
  return {x:(layout.W-w)/2, y:layout.contentTop(vp)+(layout.contentH(vp)-h-44)/2, w:w, h:h};
}
function project(x, y, z, r) {
  var cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch);
  var px = x * cy + z * sy;
  var zz = -x * sy + z * cy;
  var py = y * cx - zz * sx;
  zz = y * sx + zz * cx;
  var k = 900 / (900 - zz);
  return {x:r.x+r.w/2+px*k, y:r.y+r.h/2+py*k};
}
function corners(r, z) {
  return [project(-r.w/2,-r.h/2,z,r),project(r.w/2,-r.h/2,z,r),
    project(r.w/2,r.h/2,z,r),project(-r.w/2,r.h/2,z,r)];
}
function silhouette(r,z) {
  var points=[],radius=18*r.w/TW;
  for(var corner=0;corner<4;corner++) {
    var cx=(corner===0 || corner===3)?-r.w/2+radius:r.w/2-radius;
    var cy=corner<2?-r.h/2+radius:r.h/2-radius;
    for(var step=0;step<=4;step++) {
      var a=(corner*90+180+step*22.5)*PI/180;
      points.push(project(cx+Math.cos(a)*radius,cy+Math.sin(a)*radius,z,r));
    }
  }
  return points;
}
function path(c, points) {
  c.beginPath(); c.moveTo(points[0].x,points[0].y);
  for (var i=1;i<points.length;i++) c.lineTo(points[i].x,points[i].y);
  c.closePath();
}
function copyLines(text,width,size) {
  var lines=[],line='';
  Array.from(text).forEach(function(ch) {
    if(ch==='\n') {lines.push(line);line='';return;}
    if(line && draw.measure(line+ch,size)>width) {
      // Keep Chinese closing punctuation with a word, rather than alone on a new line.
      if(/[，。、；：！？）》】」』]/.test(ch)) {
        var chars=Array.from(line),last=chars.pop();
        lines.push(chars.join(''));line=last+ch;
      } else {lines.push(line);line=ch;}
    } else line+=ch;
  });
  if(line) lines.push(line);
  return lines;
}
function centeredCopy(text, y, width, size, color) {
  copyLines(text,width,size).forEach(function(line,i) {
    draw.text(line,TW/2,y+i*size*1.5,{size:size,color:color,align:'center'});
  });
}
function paintFace(back) {
  var c = draw.getCtx();
  if (!back) {
    cardface.paint(0,0,TW,TH,18,role,{emojiSize:80,nameSize:32,tagline:false,
      border:'rgba(237,220,171,.65)',borderWidth:1.2});
    draw.strokeRoundRect(11,11,TW-22,TH-22,12,'rgba(255,255,255,.20)',.7);
    draw.text('每日角色',TW/2,38,{size:11,color:'rgba(255,255,255,.80)',align:'center'});
    centeredCopy(role.tagline || '',TH*.74,TW-46,14,'rgba(255,255,255,.90)');
    draw.fillRect(TW/2-20,TH-49,40,1,'rgba(237,220,171,.55)');
  } else {
    draw.fillGradientRect(0,0,TW,TH,['#f8f4e9','#eee7d8'],155,18);
    draw.strokeRoundRect(.7,.7,TW-1.4,TH-1.4,18,'rgba(92,71,38,.36)',1);
    draw.strokeRoundRect(12,12,TW-24,TH-24,11,'rgba(92,71,38,.17)',.7);
    draw.text('角色描述',TW/2,42,{size:11,color:'#80735f',align:'center'});
    draw.text(role.name || '',TW/2,100,{size:30,weight:'600',serif:true,color:'#302c28',align:'center'});
    centeredCopy(role.tagline || '',132,TW-54,13,'#77654d');
    draw.fillRect(TW/2-18,173,36,1,'rgba(114,88,49,.35)');
    // Fit every role's description, including longer copy, without ellipsis.
    var text = role.intro || role.tagline || '';
    var size = 15;
    while(size>10 && copyLines(text,TW-62,size).length*size*1.65>166) size-=.5;
    copyLines(text,TW-62,size).forEach(function(line,i) {
      draw.text(line,31,207+i*size*1.65,{size:size,color:'#403a32'});
    });
    draw.text('每日角色',TW/2,TH-28,{size:10,color:'#918471',align:'center'});
  }
}
function surface(back) {
  var dpr = Math.min(1.5,env.size().pixelRatio || 1);
  if (ratio !== dpr) {ratio=dpr;textures=[null,null];}
  var index = back ? 1 : 0;
  if (textures[index]) return textures[index];
  var w = env.getWx(), canvas;
  try {
    if (w && typeof w.createOffscreenCanvas === 'function') {
      canvas = w.createOffscreenCanvas({type:'2d',width:Math.ceil(TW*dpr),height:Math.ceil(TH*dpr)});
    } else if (w && typeof w.createCanvas === 'function') {
      canvas = w.createCanvas();
    }
    if (!canvas || canvas === draw.getCanvas()) return null;
    canvas.width=Math.ceil(TW*dpr);canvas.height=Math.ceil(TH*dpr);
    draw.withCanvas(canvas,function(c) {
      c.setTransform(dpr,0,0,dpr,0,0); paintFace(back);
    });
    textures[index]=canvas;
    return canvas;
  } catch (_) { return null; }
}
/** Affine triangles of a small mesh approximate a projective texture without WebGL. */
function triangle(c, image, a,b,d, u,v,w) {
  var det=(v.x-u.x)*(w.y-u.y)-(w.x-u.x)*(v.y-u.y);
  if (Math.abs(det)<.0001) return;
  var ax=((b.x-a.x)*(w.y-u.y)-(d.x-a.x)*(v.y-u.y))/det;
  var ay=((b.y-a.y)*(w.y-u.y)-(d.y-a.y)*(v.y-u.y))/det;
  var bx=((d.x-a.x)*(v.x-u.x)-(b.x-a.x)*(w.x-u.x))/det;
  var by=((d.y-a.y)*(v.x-u.x)-(b.y-a.y)*(w.x-u.x))/det;
  c.save();
  // Overlap subpixel clip edges; the outer card silhouette clips the mesh as a whole.
  var mx=(a.x+b.x+d.x)/3, my=(a.y+b.y+d.y)/3;
  var points=[a,b,d].map(function(p) {var dx=p.x-mx,dy=p.y-my,l=Math.sqrt(dx*dx+dy*dy)||1;
    return {x:p.x+dx/l*2,y:p.y+dy/l*2};});
  path(c,points); c.clip();
  c.transform(ax,ay,bx,by,a.x-ax*u.x-bx*u.y,a.y-ay*u.x-by*u.y);
  c.drawImage(image,0,0); c.restore();
}
function render(vp,state,options) {
  var options=options || {};
  sync(state); sample(animation.now());
  if (!role) return {zones:[],contentH:layout.contentH(vp)};
  var r=options.rect || rect(vp); bounds=r;
  var back=Math.cos(yaw)<0;
  var points=corners(r,back?-1:1),outline=silhouette(r,back?-1:1),rear=silhouette(r,back?1:-1);
  var c=draw.getCtx();
  c.save();c.translate(r.x+r.w/2,r.y+r.h+20);c.scale(1,.17);
  var shadow=c.createRadialGradient(0,0,0,0,0,r.w*.62);
  shadow.addColorStop(0,'rgba(18,15,22,.20)');shadow.addColorStop(1,'rgba(18,15,22,0)');
  c.fillStyle=shadow;c.fillRect(-r.w*.62,-r.w*.62,r.w*1.24,r.w*1.24);c.restore();
  c.save();
  if(Math.abs(Math.sin(yaw))>.005 || Math.abs(pitch)>.005) {
    for(var side=0;side<outline.length;side++) {
      var j=(side+1)%outline.length;path(c,[rear[side],rear[j],outline[j],outline[side]]);
      c.fillStyle=side<10?'#dacda9':'#928062';c.fill();
    }
  }
  var image=surface(back);
  if (image && typeof c.transform === 'function') {
    // Rounded corners are projected with the face, including at steep angles.
    path(c,outline);c.clip();
    if (Math.abs(Math.sin(yaw))<.0001 && Math.abs(pitch)<.0001) {
      c.drawImage(image,r.x,r.y,r.w,r.h);
    } else {
      var nx=6,ny=9,grid=[];
      for (var gy=0;gy<=ny;gy++) for (var gx=0;gx<=nx;gx++) {
        grid.push(project((back?1-gx/nx:gx/nx)*r.w-r.w/2,gy/ny*r.h-r.h/2,back?-1:1,r));
      }
      for (var iy=0;iy<ny;iy++) for (var ix=0;ix<nx;ix++) {
        var n=iy*(nx+1)+ix;
        var a=grid[n],b=grid[n+1],d=grid[n+nx+1],e=grid[n+nx+2];
        var u={x:ix/nx*image.width,y:iy/ny*image.height},v={x:(ix+1)/nx*image.width,y:u.y};
        var w={x:u.x,y:(iy+1)/ny*image.height},z={x:v.x,y:w.y};
        triangle(c,image,a,b,d,u,v,w);triangle(c,image,b,e,d,v,z,w);
      }
    }
    var light=c.createLinearGradient(r.x-r.w*.3*Math.sin(yaw),r.y,r.x+r.w,r.y+r.h);
    light.addColorStop(0,'rgba(255,255,255,0)');light.addColorStop(.45,'rgba(255,255,255,'+(Math.abs(Math.sin(yaw))*.13)+')');
    light.addColorStop(.65,'rgba(255,255,255,0)');light.addColorStop(1,'rgba(0,0,0,'+(Math.abs(Math.sin(pitch))*.16)+')');
    c.fillStyle=light;c.fillRect(r.x-r.w,r.y-r.h,r.w*3,r.h*3);
  } else {
    // Old Canvas implementations still show both sides and a compressed flip.
    c.translate(r.x+r.w/2,r.y+r.h/2);c.scale(Math.max(.012,Math.abs(Math.cos(yaw)))*r.w/TW,Math.cos(pitch)*r.h/TH);
    c.translate(-TW/2,-TH/2);paintFace(back);
  }
  c.restore();
  if(options.hint!==false) draw.text('拖动旋转 · 轻点翻面',layout.W/2,r.y+r.h+48,{size:12,color:theme.bodyBright,align:'center'});
  var minX=Math.min.apply(null,points.map(function(p){return p.x}));
  var minY=Math.min.apply(null,points.map(function(p){return p.y}));
  var maxX=Math.max.apply(null,points.map(function(p){return p.x}));
  var maxY=Math.max.apply(null,points.map(function(p){return p.y}));
  return {zones:[{id:options.zoneId || 'today-card',rect:{x:minX-10,y:minY-10,w:maxX-minX+20,h:maxY-minY+20}}],
    contentH:layout.contentH(vp)};
}
return {render:render,begin:begin,move:move,end:end,flip:flip,cancel:cancel,reset:reset,snapshot:snapshot,rect:rect,TURN_MS:TURN_MS};

}
module.exports=createViewer();
module.exports.create=createViewer;
