/** Serialized, versioned tear completion. The animation.js clock owns playback. */
var template=require('./pag-tear-template.js');
function seriesKey(series){return series?JSON.stringify([series.id,series.accent,series.top,series.mid,series.bottom]):'';}
function message(failure){return String(failure && (failure.errMsg||failure.message)||failure);}
function createController(adapter) {
  var revision=0,key='',resource=null,pending=false,preparePromise=null,preloadPromise=null;
  var tail=Promise.resolve(),token=null,mode='fallback',paused=false,flushing=false,renderedFrame=0,error='';
  var renderedDirection=1;
  var invalidate=function(){};
  function enqueue(job){var result=tail.then(job,job);tail=result.catch(function(){});return result;}
  function notify(){if(!paused)invalidate();}
  function preload(){
    if(!adapter.supported())return Promise.resolve(false);
    if(!preloadPromise)preloadPromise=Promise.resolve().then(function(){return adapter.preload();})
      .then(function(){return true;},function(failure){error=message(failure);return false;});
    return preloadPromise;
  }
  function prepare(series){
    var nextKey=seriesKey(series);
    if(!nextKey || !adapter.supported())return Promise.resolve(false);
    if(nextKey===key)return preparePromise||Promise.resolve(Boolean(resource));
    var requested=++revision,previous=resource;key=nextKey;pending=true;error='';resource=null;
    preparePromise=enqueue(function(){
      adapter.destroy(previous);if(requested!==revision)return false;
      return Promise.resolve().then(function(){return adapter.create(series);}).then(function(created){
        if(requested!==revision){adapter.destroy(created);return false;}
        resource=created;pending=false;renderedFrame=0;renderedDirection=1;notify();return true;
      },function(failure){if(requested===revision){pending=false;error=message(failure);notify();}return false;});
    });return preparePromise;
  }
  function begin(nextToken,series,direction){
    if(nextToken!==token){
      token=nextToken;mode=resource && key===seriesKey(series)?'pag':'fallback';
      if(mode==='pag'){resource.direction=direction===-1?-1:1;if(resource.direction!==renderedDirection)renderedFrame=-1;}
    }
    // Preparation that arrives after the swipe cannot change this completion's renderer.
    return mode;
  }
  function fail(active,failure){
    ++revision;error=message(failure);mode='fallback';resource=null;
    enqueue(function(){adapter.destroy(active);});notify();
  }
  function seek(progress){
    if(mode!=='pag'||paused||flushing||!resource)return;
    var active=resource,requested=revision,frames=Math.max(1,Math.round(active.durationMs*active.frameRate/1000));
    var frame=Math.min(frames-1,Math.max(0,Math.floor(progress*frames)));
    if(frame===renderedFrame && (active.direction||1)===renderedDirection)return;flushing=true;
    var requestedDirection=active.direction||1;
    enqueue(function(){
      if(requested!==revision||resource!==active||paused)return;
      return Promise.resolve().then(function(){return adapter.flush(active,frame/frames,requestedDirection);}).then(function(){
        if(requested===revision&&resource===active){renderedFrame=frame;renderedDirection=requestedDirection;notify();}
      },function(failure){if(requested===revision&&resource===active)fail(active,failure);});
    }).then(function(){flushing=false;},function(failure){flushing=false;error=message(failure);});
  }
  function paint(ctx,nextToken,series,rect,progress){
    if(begin(nextToken,series,rect.direction)!=='pag'||!resource)return false;
    var active=resource;seek(progress);
    // A newly selected direction must be flushed before its bitmap becomes visible.
    if((active.direction||1)!==renderedDirection)return false;
    try{ctx.drawImage(active.renderCanvas||active.canvas,rect.x,rect.y,rect.w,rect.h);return true;}
    catch(failure){fail(active,failure);return false;}
  }
  function release(){
    if(!key&&!resource&&!pending&&token===null)return tail;
    ++revision;key='';pending=false;token=null;mode='fallback';preparePromise=null;
    var previous=resource;resource=null;return enqueue(function(){adapter.destroy(previous);});
  }
  function status(){return {supported:Boolean(adapter.supported()),ready:Boolean(resource),loading:pending,mode:mode,flushing:flushing,frame:renderedFrame,durationMs:template.durationMs,error:error};}
  return {preload:preload,prepare:prepare,begin:begin,seek:seek,paint:paint,release:release,status:status,
    pause:function(){paused=true;},resume:function(){paused=false;notify();},
    onFrame:function(callback){invalidate=typeof callback==='function'?callback:function(){};},settled:function(){return tail;}};
}
var controller=createController(require('./pag-tear-runtime.js'));controller.createController=createController;module.exports=controller;
