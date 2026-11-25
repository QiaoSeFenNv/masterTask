/** Deterministic, original short cues: mono PCM WAV, no external audio assets. */
const fs = require('node:fs/promises');
const path = require('node:path');
const RATE = 22050;
function wave(duration, sample) {
  const frames = Math.round(duration * RATE), data = Buffer.alloc(44 + frames * 2);
  data.write('RIFF', 0); data.writeUInt32LE(data.length - 8, 4); data.write('WAVE', 8);
  data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22); data.writeUInt32LE(RATE, 24); data.writeUInt32LE(RATE * 2, 28);
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(frames * 2, 40);
  for (let i=0;i<frames;i++) data.writeInt16LE(Math.round(Math.max(-1,Math.min(1,sample(i/RATE,i,frames)))*32767),44+i*2);
  return data;
}
function createCues() {
  let seed=173, low=0;
  const noise=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
  const tear=wave(0.14,(t,i,n)=>{const raw=noise();low=low*0.7+raw*0.3;const env=Math.sin(Math.PI*i/n)**1.4;return (raw-low)*env*0.42*(0.55+0.45*Math.sin(t*160)**2);});
  const flip=wave(0.09,(t,i,n)=>{const env=Math.sin(Math.PI*i/n)**1.8;return env*(noise()*0.16+Math.sin(2*Math.PI*(340*t+1500*t*t))*0.24);});
  const settle=wave(0.26,(t,i,n)=>{const env=Math.min(1,t/0.012)*Math.exp(-t*17)*Math.min(1,(n-i)/220);return env*(Math.sin(2*Math.PI*523.25*t)*0.42+Math.sin(2*Math.PI*783.99*t)*0.16+Math.sin(2*Math.PI*1046.5*t)*0.08);});
  return {tear,flip,settle};
}
async function build(output=path.resolve(__dirname,'../game/assets/sfx')) {
  await fs.mkdir(output,{recursive:true});
  const cues=createCues();
  for (const [name,data]of Object.entries(cues))await fs.writeFile(path.join(output,name+'.wav'),data);
  return Object.fromEntries(Object.entries(cues).map(([name,data])=>[name,{bytes:data.length,duration:(data.length-44)/(RATE*2)}]));
}
if(require.main===module)build().then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error);process.exitCode=1;});
module.exports={createCues,build};
