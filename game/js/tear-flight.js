/** Quiet extraction into a stack, then one continuous unfold into the unchanged ring. */
var pack=require('./pack.js');
var packetSurface=require('./packet-surface.js');
var DURATION_MS=2200;
var FIRST_MS=120,GAP_MS=90,SLIDE_MS=600,SPREAD_MS=660;
function clamp(v){return Math.max(0,Math.min(1,v));}
function smooth(v){v=clamp(v);return v*v*(3-2*v);}
function plan(count){
  return pack.ring(count,0,0,0).map(function(slot,rank){return {slot:slot,start:(FIRST_MS+rank*GAP_MS)/DURATION_MS,rank:rank,count:count};});
}
function sample(flight,p){
  var slot=flight.slot,packetRect=pack.tearRect(0),cx=packetRect.x+packetRect.w/2,seam=packetRect.y+packetSurface.SEAM;
  var ms=clamp(p)*DURATION_MS,u=clamp((ms-flight.start*DURATION_MS)/SLIDE_MS),slide=smooth(u);
  var spread=smooth((ms-(DURATION_MS-SPREAD_MS))/SPREAD_MS),exit=packet(p);
  var stackX=cx+(flight.rank-(flight.count-1)/2)*.35,stackY=128-flight.rank*.35;
  var liftedY=(seam+76+exit.drop)*(1-slide)+stackY*slide;
  var x=(cx+(stackX-cx)*slide)*(1-spread)+slot.x*spread;
  var y=liftedY*(1-spread)+slot.y*spread;
  var scaleX=1.1+(slot.w/92*slot.scale*slot.wscale-1.1)*spread;
  var scaleY=1.1+(slot.h/138*slot.scale-1.1)*spread;
  return {x:x,y:y,scaleX:scaleX,scaleY:scaleY,rotation:0,
    opacity:smooth((ms-flight.start*DURATION_MS)/100)*(1+(slot.alpha-1)*spread),progress:u,spread:spread};
}
function packet(p){var ms=clamp(p)*DURATION_MS,q=smooth((ms-110)/1210);return {drop:q*96,scale:1-q*.035,opacity:1-smooth((ms-1430)/530)};}
module.exports={plan:plan,sample:sample,packet:packet,DURATION_MS:DURATION_MS,SLIDE_MS:SLIDE_MS,SPREAD_MS:SPREAD_MS};
