/** PAG tear I/O. Shares the warmed SDK with reveal; owns a separate file and GL surface. */
var env=require('./env.js');
var shared=require('./pag-runtime.js');
var assets=require('./assets.js');
var textures=require('./tear-textures.js');
var packetSurface=require('./packet-surface.js');
var flight=require('./tear-flight.js');
var template=require('./pag-tear-template.js');
var runtimePromise=null;
function readTemplate(w) {
  var packaged=require('../data/tear-pag.js');
  if(!packaged || packaged.encoding!=='base64' || typeof packaged.data!=='string')throw new Error('PAG tear binary module is invalid');
  var text=packaged.data,buffer;
  if(typeof w.base64ToArrayBuffer==='function')buffer=w.base64ToArrayBuffer(text);
  else {
    var alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',padding=text.slice(-2)==='=='?2:text.slice(-1)==='='?1:0;
    var bytes=new Uint8Array(text.length*3/4-padding),at=0;
    for(var i=0;i<text.length;i+=4){
      var value=(alphabet.indexOf(text.charAt(i))<<18)|(alphabet.indexOf(text.charAt(i+1))<<12)|
        ((text.charAt(i+2)==='='?0:alphabet.indexOf(text.charAt(i+2)))<<6)|(text.charAt(i+3)==='='?0:alphabet.indexOf(text.charAt(i+3)));
      if(at<bytes.length)bytes[at++]=(value>>16)&255;if(at<bytes.length)bytes[at++]=(value>>8)&255;if(at<bytes.length)bytes[at++]=value&255;
    }buffer=bytes.buffer;
  }
  if(!(buffer instanceof ArrayBuffer) || buffer.byteLength!==packaged.byteLength)throw new Error('PAG tear binary length mismatch');
  return buffer;
}
function preload() {
  if(runtimePromise)return runtimePromise;
  if(!shared.supported())return Promise.reject(new Error('PAG runtime is unavailable'));
  runtimePromise=Promise.all([shared.preload(),Promise.resolve().then(function(){return readTemplate(env.getWx());})])
    .then(function(values){return {sdk:values[0].sdk,bytes:values[1]};});
  return runtimePromise;
}
function makeCanvas(type,width,height) {
  var w=env.getWx(),canvas;
  if(typeof w.createOffscreenCanvas==='function'){try{canvas=w.createOffscreenCanvas({type:type,width:width,height:height});}catch(e){}}
  if(!canvas && typeof w.createCanvas==='function')canvas=w.createCanvas();
  if(!canvas)throw new Error('No secondary canvas for PAG tear');canvas.width=width;canvas.height=height;return canvas;
}
function destroy(resource) {
  if(!resource || resource.destroyed)return;resource.destroyed=true;
  var handles=[resource.view];
  (resource.poseControls||[]).forEach(function(control){handles.push(control.layer,control.matrix);});
  handles=handles.concat([resource.file],resource.images||[]);
  for(var i=0;i<handles.length;i++)if(handles[i] && typeof handles[i].destroy==='function'){try{handles[i].destroy();}catch(e){}}
  if(resource.gl){try{var extension=resource.gl.getExtension('WEBGL_lose_context');if(extension)extension.loseContext();}catch(e){}}
  var canvases=[resource.canvas,resource.renderCanvas].concat(resource.bitmaps||[]);
  for(var j=0;j<canvases.length;j++)if(canvases[j]){canvases[j].width=1;canvases[j].height=1;}
}
function checkFile(file) {
  if(file.width()!==template.width || file.height()!==template.height || file.duration()!==template.durationMs*1000 || file.frameRate()!==template.frameRate || file.numImages()!==template.textures.length)
    throw new Error('PAG tear template contract mismatch');
  template.textures.forEach(function(texture){
    var layers=file.getLayersByEditableIndex(texture.imageIndex,5);
    try{
      var expected=texture.name==='card-back'?template.cardBacks:texture.name==='fiber'?template.fibers:1;
      if(layers.size()!==expected)throw new Error('PAG tear editable texture layer count mismatch: '+texture.name);
      for(var i=0;i<layers.size();i++){var layer=layers.get(i);try{
        var name=layer.layerName();if(name!==texture.name && name.indexOf(texture.name+'-')!==0)throw new Error('PAG tear texture layer name mismatch: '+texture.name);
      }finally{layer.destroy();}}
    }finally{layers.delete();}
  });
}
function create(series) {
  return preload().then(function(runtime){
    var sdk=runtime.sdk,ratio=Math.max(1,Math.min(2,env.size().pixelRatio||1));
    var pixelTypes=require("../vendor/pag/libpag.js").types;
    var resource={view:null,file:null,canvas:null,gl:null,images:[],bitmaps:[],poseControls:[],direction:1};
    return sdk.PAGFile.load(runtime.bytes).then(function(file){
      resource.file=file;checkFile(file);
      var artwork=assets.pack(series.id),foil=assets.foil(series.id);
      template.textures.forEach(function(texture){
        var bitmap=makeCanvas('2d',Math.round(texture.width*ratio),Math.round(texture.height*ratio));resource.bitmaps.push(bitmap);
        var c=bitmap.getContext('2d');c.setTransform(ratio,0,0,ratio,0,0);
        textures.paint(c,texture.name,texture.width,texture.height,series,artwork,packetSurface.paint,packetSurface.interior,foil,template.packet);
        // SDK 4.3.51 uploads OffscreenCanvas bytes without premultiplying them.
        // ImageData is straight RGBA; declare that explicitly instead of making pale edges additive.
        var pixels=c.getImageData(0,0,bitmap.width,bitmap.height).data;
        var image=sdk.PAGImage.fromPixels(pixels,bitmap.width,bitmap.height,pixelTypes.ColorType.RGBA_8888,pixelTypes.AlphaType.Unpremultiplied);
        resource.images.push(image);file.replaceImage(texture.imageIndex,image);
      });
      // Reuse matrices for direction changes; no extra file, view, GL buffer or frame allocation.
      [0,1,2,4,5].forEach(function(index){
        var list=file.getLayersByEditableIndex(index,5);
        try{var layer=list.get(0),control={index:index,layer:layer,matrix:null};resource.poseControls.push(control);
          control.matrix=layer.matrix();
        }finally{list.delete();}
      });
      // SDK applies DPR itself. Keep tear at <=1.5x for sharper cards with 44% fewer pixels than 2x.
      var dpr=Math.max(1,env.size().pixelRatio||1),scale=Math.min(1.5,dpr);
      resource.canvas=makeCanvas('webgl',Math.max(1,Math.floor(template.width*scale/dpr)),Math.max(1,Math.floor(template.height*scale/dpr)));
      resource.gl=resource.canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,preserveDrawingBuffer:true,depth:false,stencil:false,antialias:false});
      if(!resource.gl)throw new Error('PAG tear WebGL context is unavailable');
      return sdk.PAGView.init(file,resource.canvas,{firstFrame:false});
    }).then(function(view){
      resource.view=view;resource.durationMs=template.durationMs;resource.frameRate=template.frameRate;
      // Frame zero hides the curl, fibers and cards. Decode them now, before the swipe.
      var warming=Promise.resolve();
      [0,.08,.60,0].forEach(function(progress){warming=warming.then(function(){view.setProgress(progress);return view.flush();});});
      return warming;
    }).then(function(){
      resource.renderCanvas=makeCanvas("2d",resource.canvas.width,resource.canvas.height);
      resource.renderCanvas.isPAGFrame=true;resource.renderCtx=resource.renderCanvas.getContext("2d");
      if(!resource.renderCtx)throw new Error("PAG tear frame snapshot is unavailable");
      copyFrame(resource);return resource;
    }).catch(function(error){destroy(resource);throw error;});
  });
}
function out(value){value=Math.max(0,Math.min(1,value));return 1-Math.pow(1-value,3);}
function setDirection(resource,progress,direction){
  var p=template.packet,cx=p.x+p.width/2,cy=p.y+p.height/2,seam=p.y+p.seam;
  var exit=flight.packet(progress),base=p.tiltDegrees*(1-out(progress*template.durationMs/p.returnMs));
  (resource.poseControls||[]).forEach(function(control){
    var m=control.matrix;m.reset();
    if(direction===-1){
      if(control.index<=2)m.setTranslate(-2*(28+32*out(progress*template.durationMs/480/.85)),0);
      else if(control.index===5)m.setRotate(-2*base,cx,cy+exit.drop);
      else if(control.index===4){
        var offset=cy-seam,sx=Math.sin(base*Math.PI/180)*offset;
        var mx=cx+sx,my=cy-Math.cos(base*Math.PI/180)*offset+exit.drop;
        m.setRotate(-2*base,mx,my);m.postTranslate(-2*sx,0);
      }
    }
    control.layer.setMatrix(m);
  });
}
function copyFrame(resource){
  var c=resource.renderCtx;c.clearRect(0,0,resource.renderCanvas.width,resource.renderCanvas.height);c.drawImage(resource.canvas,0,0);
}
function flush(resource,progress,direction){
  resource.view.setProgress(progress);setDirection(resource,progress,direction==null?resource.direction:direction);
  return resource.view.flush().then(function(result){copyFrame(resource);return result;});
}
module.exports={supported:shared.supported,preload:preload,create:create,flush:flush,destroy:destroy};
