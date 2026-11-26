/** Printed foil pouch shared by the picker, touch stage and PAG textures. */
var SEAM = 24;

// Keep paint self-contained: the tear builder serializes it into a browser canvas.
function paint(c, image, rect, series, options) {
  options = options || {};
  var tones = {
    deep: {seal:"#153d46", light:"#47757c", ink:"#edf5ed"},
    dusk: {seal:"#3d2b49", light:"#796080", ink:"#f6edf4"},
    dawn: {seal:"#865a3e", light:"#c89d70", ink:"#fff4df"}
  };
  var tone = tones[series.id] || tones.deep;
  function gradient(x0, y0, x1, y1, stops) {
    var g = c.createLinearGradient(x0, y0, x1, y1);
    for (var i=0; i<stops.length; i++) g.addColorStop(stops[i][0],stops[i][1]);
    return g;
  }
  function face() {
    c.beginPath(); c.moveTo(4,3);
    // Fine cut teeth only at the sealed ends, not a bright frame around the print.
    for (var x=4; x<144; x+=4) {c.lineTo(x+2,1.7);c.lineTo(x+4,3);}
    c.lineTo(144,14);c.quadraticCurveTo(141,23,143,45);
    c.quadraticCurveTo(147,103,143,167);c.quadraticCurveTo(140,190,144,197);
    c.lineTo(144,207);
    for (var k=144; k>4; k-=4) {c.lineTo(k-2,208.3);c.lineTo(k-4,207);}
    c.lineTo(4,196);c.quadraticCurveTo(7,187,4,165);
    c.quadraticCurveTo(.5,105,4,44);c.quadraticCurveTo(7,24,4,15);c.closePath();
  }
  c.save();c.translate(rect.x,rect.y);c.scale(rect.w/150,rect.h/210);
  if (options.shadow!==false && typeof c.createRadialGradient==='function') {
    c.save();c.translate(78,212);c.scale(1,.19);
    var shadow=c.createRadialGradient(0,0,0,0,0,66);
    shadow.addColorStop(0,'rgba(14,12,19,.23)');shadow.addColorStop(.48,'rgba(14,12,19,.11)');shadow.addColorStop(1,'rgba(14,12,19,0)');
    c.fillStyle=shadow;c.fillRect(-66,-66,132,132);c.restore();
  }
  if (options.shadowOnly) {c.restore();return;}

  // The tucked side is only a few units wide, with a soft reflection on the fold.
  c.beginPath();c.moveTo(142,7);c.lineTo(148,16);c.quadraticCurveTo(150,107,147,194);
  c.lineTo(143,207);c.lineTo(140,195);c.quadraticCurveTo(147,107,142,7);c.closePath();
  c.fillStyle=gradient(140,0,150,0,[[0,tone.seal],[.42,tone.light],[.60,tone.seal],[1,series.bottom]]);c.fill();
  c.save();face();c.clip();
  c.fillStyle=gradient(0,0,145,210,[[0,tone.seal],[.52,series.mid],[1,tone.seal]]);c.fillRect(0,0,148,210);
  var iw=image && (image.width || image.naturalWidth), ih=image && (image.height || image.naturalHeight);
  if (iw && ih) {
    // Crop the old ornamental border, then print the existing motif to the edges.
    // The crop and destination have the same ratio; the wave/moon/sun stay round.
    var sw=iw*.70, sh=Math.min(ih*.86,sw*184/142);
    c.drawImage(image,(iw-sw)/2,(ih-sh)/2,sw,sh,2,13,142,184);
  }
  c.fillStyle=gradient(0,0,145,0,[[0,'rgba(0,0,0,.27)'],[.075,'rgba(0,0,0,.03)'],[.24,'rgba(236,246,240,.055)'],[.51,'rgba(255,255,255,.025)'],[.84,'rgba(0,0,0,.025)'],[1,'rgba(0,0,0,.24)']]);
  c.fillRect(0,0,147,210);
  // The name is printed on the same material, with no separate plaque or rectangle.
  c.fillStyle=gradient(0,141,0,198,[[0,'rgba(7,12,18,0)'],[.48,'rgba(7,12,18,.28)'],[1,'rgba(7,12,18,.78)']]);c.fillRect(1,141,145,57);
  c.fillStyle=gradient(0,13,0,60,[[0,'rgba(6,12,20,.55)'],[.66,'rgba(6,12,20,.45)'],[1,'rgba(6,12,20,0)']]);c.fillRect(1,13,145,47);
  // The narrow heat seals share the ink hue, rather than looking like chrome bars.
  c.fillStyle=gradient(0,0,145,0,[[0,tone.seal],[.29,tone.light],[.60,tone.seal],[1,tone.seal]]);c.fillRect(0,1,146,11);c.fillRect(0,198,146,11);
  if (options.foil) c.drawImage(options.foil,0,0,150,210);
  else {
    c.beginPath();for(var ridge=4.5;ridge<11;ridge+=2.1){c.moveTo(6,ridge);c.lineTo(140,ridge);c.moveTo(6,199+ridge-4);c.lineTo(140,199+ridge-4);}
    c.strokeStyle='rgba(255,255,255,.16)';c.lineWidth=.55;c.stroke();
  }
  c.fillStyle='rgba(3,7,12,.18)';c.fillRect(4,12,140,.7);c.fillRect(4,197,140,.7);
  // Quiet printed typography. Labels below the picker remain full size and readable.
  c.textAlign='center';c.textBaseline='alphabetic';c.fillStyle=tone.ink;
  c.font='600 10.5px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
  c.fillText('每日角色',74,39);
  c.font='600 18px "Songti SC", "STSong", "Noto Serif CJK SC", serif';
  c.fillText(series.name,74,179);
  c.font='500 5.8px -apple-system, "PingFang SC", sans-serif';
  c.fillText('DAILY ROLES  /  10',74,189);
  c.restore();c.restore();
}
function interior(c,rect,series,opacity) {
  c.save();c.globalAlpha*=opacity==null?1:opacity;c.translate(rect.x,rect.y);c.scale(rect.w/160,rect.h/40);
  var lining=c.createLinearGradient(0,13,0,27);lining.addColorStop(0,series.bottom);lining.addColorStop(.48,'rgba(0,4,8,.96)');lining.addColorStop(1,series.mid);
  c.beginPath();c.moveTo(9,21);c.quadraticCurveTo(80,9,151,21);c.quadraticCurveTo(80,29,9,21);c.closePath();c.fillStyle=lining;c.fill();
  for(var i=3;i>=0;i--){var y=15.5+i*1.5;c.beginPath();c.moveTo(26+i*.8,y);c.quadraticCurveTo(80,y-2.2,134-i*.8,y);c.lineTo(134-i*.8,y+1);c.quadraticCurveTo(80,y-1.2,26+i*.8,y+1);c.closePath();c.fillStyle=i===0?'rgba(230,225,211,.40)':'rgba(197,200,192,.25)';c.fill();}
  c.beginPath();c.moveTo(9,21);c.quadraticCurveTo(80,9,151,21);c.strokeStyle='rgba(255,255,255,.16)';c.lineWidth=.65;c.stroke();
  c.beginPath();c.moveTo(9,21);c.quadraticCurveTo(80,29,151,21);c.strokeStyle='rgba(0,0,0,.35)';c.lineWidth=1;c.stroke();c.restore();
}
function bitmap(width,height) {
  var canvas=null;
  try {
    var w=require('./env.js').getWx();
    if(typeof w.createOffscreenCanvas==='function')canvas=w.createOffscreenCanvas({type:'2d',width:width,height:height});
    else if(typeof w.createCanvas==='function'){canvas=w.createCanvas();canvas.width=width;canvas.height=height;}
  } catch(error) {return null;}
  return canvas && typeof canvas.getContext==='function' ? canvas : null;
}
// Cache both the print and the floor shadow. Dragging only transforms cached bitmaps.
var surfaceCache={}, shadowCanvas=null;
function draw(c,image,rect,series,options) {
  options=options||{};
  if(options.shadow!==false) {
    if(!shadowCanvas) {
      var shadow=bitmap(360,480),sc=shadow && shadow.getContext('2d');
      if(sc && typeof sc.setTransform==='function') {
        sc.setTransform(2,0,0,2,30,16);paint(sc,null,{x:0,y:0,w:150,h:210},series,{shadowOnly:true});shadowCanvas=shadow;
      }
    }
    if(shadowCanvas)c.drawImage(shadowCanvas,rect.x-rect.w*.10,rect.y-rect.h*8/210,rect.w*1.2,rect.h*240/210);
    else paint(c,null,rect,series,{shadowOnly:true});
  }
  if(options.shadowOnly)return;
  var foil=options.foil || require('./assets.js').foil(series.id),entry=surfaceCache[series.id];
  if(!entry || entry.image!==image || entry.foil!==foil) {
    var canvas=bitmap(300,420),context=canvas && canvas.getContext('2d');
    if(context && typeof context.setTransform==='function') {
      context.setTransform(2,0,0,2,0,0);paint(context,image,{x:0,y:0,w:150,h:210},series,{shadow:false,foil:foil});
      entry={image:image,foil:foil,canvas:canvas};surfaceCache[series.id]=entry;
    }
  }
  if(entry && entry.image===image && entry.foil===foil)c.drawImage(entry.canvas,rect.x,rect.y,rect.w,rect.h);
  else paint(c,image,rect,series,{shadow:false,foil:foil});
}
module.exports={paint:paint,draw:draw,interior:interior,SEAM:SEAM};
