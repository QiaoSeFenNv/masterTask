/** Static PAG textures derived from the existing packet artwork; no new illustration. */
function paint(ctx, name, width, height, series, image, packetPainter, interiorPainter, foil) {
  var c = ctx;
  var seam = 24;
  var accent = series.accent;
  var seed = (series.id.charCodeAt(0) || 1) * 0.37;
  function round(x, y, w, h, r) {
    c.beginPath(); c.moveTo(x+r,y); c.lineTo(x+w-r,y); c.quadraticCurveTo(x+w,y,x+w,y+r);
    c.lineTo(x+w,y+h-r); c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    c.lineTo(x+r,y+h); c.quadraticCurveTo(x,y+h,x,y+h-r);
    c.lineTo(x,y+r); c.quadraticCurveTo(x,y,x+r,y); c.closePath();
  }
  function noise(i) { var v=Math.sin((i+1)*12.9898+seed*78.233)*43758.5453; return v-Math.floor(v); }
  function edge(t) { var i=Math.round(t*16); return ((noise(i)-.5)*2+(noise(i+31)-.5)*1.1+(noise(i+77)-.5)*.5 )*.62*2.7; }
  function crop(w, h) {
    if (!image) return null;
    var iw=image.width||image.naturalWidth, ih=image.height||image.naturalHeight;
    if (!iw || !ih) return null;
    var sw=iw, sh=ih;
    if (iw/ih>w/h) sw=ih*w/h; else sh=iw*h/w;
    return {x:(iw-sw)/2,y:(ih-sh)/2,w:sw,h:sh};
  }
  function artwork(w, h) {
    var source=crop(w,h);
    if (source) c.drawImage(image,source.x,source.y,source.w,source.h,0,0,w,h);
    else { var g=c.createLinearGradient(0,0,w,h); g.addColorStop(0,series.top);g.addColorStop(.5,series.mid);g.addColorStop(1,series.bottom);c.fillStyle=g;c.fillRect(0,0,w,h); }
  }
  function packetArtwork() {
    if(packetPainter)packetPainter(c,image,{x:0,y:0,w:150,h:210},series,{shadow:false,foil:foil});
    else artwork(150,210);
  }
  c.clearRect(0,0,width,height);
  if (name === 'packet-body') {
    c.save(); c.beginPath(); c.moveTo(0,seam+edge(0));
    for(var i=1;i<=16;i++)c.lineTo(150*i/16,seam+edge(i/16));
    c.lineTo(150,210);c.lineTo(0,210);c.closePath();c.clip();packetArtwork();
    c.restore();
  } else if (name.indexOf('strip-') === 0) {
    var fold=name==='strip-flat'?0:name==='strip-curl'?.5:1;
    c.save();c.beginPath();c.moveTo(0,0);c.lineTo(150,0);
    for(var j=16;j>=0;j--){var t=j/16;c.lineTo(150*t,seam+edge(t)-Math.sin(t*Math.PI)*fold*9);}
    c.closePath();c.clip();
    packetArtwork();
    c.restore();
    if(fold){
      var g=c.createLinearGradient(0,seam-10,0,seam+12);g.addColorStop(0,'rgba(246,245,238,0)');g.addColorStop(.28,'rgba(217,224,215,.58)');g.addColorStop(.64,'rgba(151,171,169,.54)');g.addColorStop(1,'rgba(76,111,120,.30)');
      c.beginPath();c.moveTo(0,seam+edge(0));c.quadraticCurveTo(72,seam-fold*12,150,seam+edge(1));
      c.quadraticCurveTo(82,seam+9-fold*4,0,seam+edge(0));c.fillStyle=g;c.fill();
      c.beginPath();c.moveTo(0,seam+edge(0));c.quadraticCurveTo(72,seam-fold*12,150,seam+edge(1));c.strokeStyle='rgba(255,255,255,.34)';c.lineWidth=.8;c.stroke();
    }
    c.beginPath();for(var f=0;f<=16;f++){var tf=f/16;var fx=150*tf,fy=seam+edge(tf)-Math.sin(tf*Math.PI)*fold*9;var len=1.5+Math.abs(noise(f+11)-.5)*5;c.moveTo(fx,fy);c.lineTo(fx+(noise(f+53)-.5)*len,fy+len);}
    c.strokeStyle='rgba(255,255,255,.36)';c.lineWidth=.7;c.stroke();
  } else if(name==='series-glow') {
    c.save();c.translate(width/2,height/2);c.scale(1,height/width);
    var glow=c.createRadialGradient(0,0,0,0,0,width/2);glow.addColorStop(0,'rgba(255,255,255,.42)');glow.addColorStop(.22,accent);glow.addColorStop(.58,accent);glow.addColorStop(1,'rgba(0,0,0,0)');
    c.fillStyle=glow;c.fillRect(-width/2,-width/2,width,width);c.restore();
  } else if(name==='packet-mouth') {
    if(interiorPainter)interiorPainter(c,{x:0,y:0,w:width,h:height},series,1);
    else { c.fillStyle='rgba(0,9,17,.9)';round(4,height/2-5,width-8,10,5);c.fill(); }
  } else if(name==='card-back') {
    c.save();round(1,1,width-2,height-2,9);c.clip();artwork(width,height);c.restore();
    round(1,1,width-2,height-2,9);c.strokeStyle='rgba(226,232,255,.16)';c.lineWidth=1;c.stroke();
    round(5,5,width-10,height-10,6);c.strokeStyle='rgba(255,255,255,.12)';c.lineWidth=.8;c.stroke();
  } else if(name==='fiber') {
    c.strokeStyle='rgba(253,253,246,.44)';c.lineWidth=.75;c.beginPath();c.moveTo(1,9);c.quadraticCurveTo(8,1,17,4);c.moveTo(5,11);c.lineTo(11,3);c.stroke();
  } else throw new Error('Unknown PAG tear texture: '+name);
}
module.exports = {paint:paint};
