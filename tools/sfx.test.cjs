const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function load(file,dependencies){const context={module:{exports:{}},require:name=>{assert.ok(name in dependencies,name);return dependencies[name];}};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../game/js',file),'utf8'),context,{filename:file});return context.module.exports;}
function setup({missing=false,vibrateFails=false,createFails=false,playFails=false}={}){
 const contexts=[],vibrations=[];
 const wx={vibrateShort(options){vibrations.push(options);if(vibrateFails)throw new Error('unavailable');}};
 if(!missing)wx.createInnerAudioContext=()=>{
  if(createFails)throw new Error('no audio runtime');
  const audio={plays:0,stops:0,destroys:0,play(){this.plays++;if(playFails)throw new Error('muted');},stop(){this.stops++;},destroy(){this.destroys++;},onCanplay(fn){this.canplay=fn;},onError(fn){this.error=fn;}};
  contexts.push(audio);return audio;
 };
 const env={getWx:()=>wx};
 const assets=load('assets.js',{'./env.js':env});
 const sfx=load('sfx.js',{'./env.js':env,'./assets.js':assets});
 return {assets,sfx,contexts,vibrations};
}
test('preloading allocates three quiet cues without autoplay or repeated contexts',()=>{
 const h=setup();h.assets.preloadSounds();h.assets.preloadSounds();
 assert.equal(h.contexts.length,3);
 assert.equal(h.contexts.reduce((n,a)=>n+a.plays,0),0);
 assert.ok(h.contexts.every(a=>a.autoplay===false&&a.loop===false&&a.volume>0&&a.volume<=0.2&&a.obeyMuteSwitch===true));
});
test('sound requires a gesture and each cue uses its matching cached asset',()=>{
 const h=setup();h.assets.preloadSounds();h.sfx.play('tear');assert.equal(h.contexts[0].plays,0);
 h.sfx.unlock();assert.equal(h.contexts[0].plays,0);
 for(const name of ['tear','flip','settle'])h.sfx.play(name);
 assert.deepEqual(h.contexts.map(a=>a.plays),[1,1,1]);
 assert.deepEqual(h.contexts.map(a=>a.src),['assets/sfx/tear.wav','assets/sfx/flip.wav','assets/sfx/settle.wav']);
 assert.ok(h.vibrations.every(o=>o.type==='light'));
 h.sfx.play('flip');assert.equal(h.contexts.length,3);assert.equal(h.contexts[1].plays,2);
 assert.ok(h.contexts[0].stops>=2&&h.contexts[2].stops>=2,'A new cue stops the previous one');
});
test('a backgrounded game stops cues and produces no delayed sound or haptics',()=>{
 const h=setup();h.sfx.unlock();h.sfx.play('tear');h.sfx.pause();const vibrations=h.vibrations.length;
 h.sfx.play('settle');assert.equal(h.vibrations.length,vibrations);assert.equal(h.contexts.length,1);assert.equal(h.contexts[0].plays,1);assert.ok(h.contexts[0].stops>=2);
 h.sfx.resume();assert.equal(h.contexts[0].plays,1);h.sfx.play('flip');assert.equal(h.contexts[1].plays,1);
});
test('missing APIs and failed native haptics/audio never throw into the state machine',()=>{
 for(const config of [{missing:true},{createFails:true},{vibrateFails:true,playFails:true}]){
  const h=setup(config);assert.doesNotThrow(()=>{h.assets.preloadSounds();h.sfx.unlock();h.sfx.play('tear');h.sfx.pause();h.sfx.destroy();});
 }
});
test('an audio load failure releases its context once and disables only that cue',()=>{
 const h=setup();h.assets.preloadSounds();h.contexts[0].error({errMsg:'missing file'});h.sfx.unlock();h.sfx.play('tear');h.sfx.play('flip');
 assert.equal(h.contexts[0].plays,0);assert.equal(h.contexts[0].destroys,1);assert.equal(h.contexts[1].plays,1);h.sfx.destroy();assert.equal(h.contexts[0].destroys,1);
});
test('cleanup frees every cue once and a new session needs a fresh gesture',()=>{
 const h=setup();h.assets.preloadSounds();h.sfx.unlock();h.sfx.destroy();h.sfx.destroy();assert.deepEqual(h.contexts.map(a=>a.destroys),[1,1,1]);
 h.sfx.resume();h.sfx.play('tear');assert.equal(h.contexts.length,3);h.sfx.unlock();h.sfx.play('tear');assert.equal(h.contexts.length,4);assert.equal(h.contexts[3].plays,1);
});
test('original PCM cues are valid mono WAV files with short durations and no clipping',()=>{
 const {createCues}=require('./build-sfx.cjs');
 for(const [name,data]of Object.entries(createCues())){
  assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WAVE');assert.equal(data.readUInt16LE(22),1);assert.equal(data.readUInt16LE(34),16);
  assert.ok((data.length-44)/(data.readUInt32LE(24)*2)<0.3,name);
  let peak=0;for(let i=44;i<data.length;i+=2)peak=Math.max(peak,Math.abs(data.readInt16LE(i)));assert.ok(peak>1000&&peak<32767,name);
  assert.deepEqual(data,fs.readFileSync(path.resolve(__dirname,'../game/assets/sfx',name+'.wav')),'Checked-in cue is reproducible');
 }
});
