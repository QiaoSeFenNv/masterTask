/** Build the bundled tear completion from original packet art and static texture layers.
 * Uses the same uncompressed PAG image tags as the bundled reveal; never writes reveal.pag.
 * This reproducible built-in is not an AE project. Use pag:tear:pack after an AE export.
 */
const fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('playwright-core');
const {browserExecutable}=require('./build-pag-template.cjs');
const {packTearTemplate}=require('./pack-pag-tear.cjs');
const flight=require('../game/js/tear-flight.js');
const ROOT=path.resolve(__dirname,'..'),END=Buffer.alloc(2);
const TAG={composition:2,attributes:3,layer:5,imageReference:11,transform:13,image:47,layerAttributes:52};
function uint(value){if(!Number.isSafeInteger(value)||value<0)throw new Error('Invalid PAG integer');const bytes=[];do{const low=value%128;value=Math.floor(value/128);bytes.push(low|(value?128:0));}while(value);return Buffer.from(bytes);}
function sint(value){return uint(Math.abs(value)*2+(value<0?1:0));}
function float(value){const out=Buffer.alloc(4);out.writeFloatLE(value);return out;}
function point(value){return Buffer.concat(value.map(float));}
function bits(values){const bytes=[];let offset=0;for(const[value,length]of values)for(let bit=0;bit<length;bit++,offset++){const byte=offset>>3;if(bytes[byte]===undefined)bytes[byte]=0;bytes[byte]|=((value>>>bit)&1)<<(offset&7);}return Buffer.from(bytes);}
function tag(code,value){const header=Buffer.alloc(value.length<63?2:6);header.writeUInt16LE((code<<6)|Math.min(63,value.length));if(header.length===6)header.writeUInt32LE(value.length,2);return Buffer.concat([header,value]);}
function animated(values,kind){const count=values.length-1,prefix=[uint(count),bits(Array.from({length:count},()=>[1,2]))];for(let i=0;i<=count;i++)prefix.push(uint(i));if(kind==='opacity')prefix.push(bits([[7,5],...values.map(value=>[Math.round(clamp(value)*255),8]),[0,5]]));else prefix.push(...values.map(kind==='point'?point:float),bits([[0,5]]));return Buffer.concat(prefix);}
function transform(samples,anchor){const flags=bits([[1,1],[0,1],[0,1],...Array.from({length:5},()=>[[1,1],[1,1]]).flat()]);return tag(TAG.transform,Buffer.concat([flags,point(anchor),animated(samples.map(s=>s.x),'float'),animated(samples.map(s=>s.y),'float'),animated(samples.map(s=>[s.scaleX??s.scale??1,s.scaleY??s.scale??1]),'point'),animated(samples.map(s=>s.rotation||0),'float'),animated(samples.map(s=>s.opacity),'opacity')]));}
function layer(id,imageId,name,samples,anchor){const flags=bits([[1,1],[0,1],[0,1],[0,1],[0,1],[0,1],[0,1],[0,1],[1,1]]);return tag(TAG.layer,Buffer.concat([Buffer.from([5]),uint(id),tag(TAG.layerAttributes,Buffer.concat([flags,uint(samples.length-1),Buffer.from(name+'\0')])),transform(samples,anchor),tag(TAG.imageReference,uint(imageId)),END]));}
function clamp(value){return Math.max(0,Math.min(1,value));}
function out(value){return 1-Math.pow(1-clamp(value),3);}
function envelope(t,start,peak,end){return t<peak?out((t-start)/(peak-start)):1-out((t-peak)/(end-peak));}
function encode(spec,textures){
  const frames=Math.round(spec.durationMs/1000*spec.frameRate),layers=[];
  const p=spec.packet,cx=p.x+p.width/2,cy=p.y+p.height/2,seam=p.y+p.seam;
  const add=(index,name,fn)=>{const texture=textures[index];layers.push(layer(layers.length+1,index+1,name,Array.from({length:frames+1},(_,frame)=>fn(frame/frames)),[texture.width/2,texture.height/2]));};
  // Front to back. Curl comes from crossfaded curved paper, never a book-page rotation.
  for(let i=0;i<3;i++)add(i,spec.textures[i].name,t=>{
    const paper=clamp(t*spec.durationMs/480),travel=out(paper/.85),a=out((paper-.02)/.24),b=out((paper-.22)/.28),fade=1-out((paper-.60)/.32);
    const mix=i===0?1-a:i===1?a*(1-b):a*b;
    return {x:cx+28+32*travel,y:p.y+spec.textures[i].height/2-20-90*travel,scaleX:1-.05*travel,scaleY:1-.22*travel,opacity:mix*fade};
  });
  for(let i=0;i<spec.fibers;i++)add(3,'fiber-'+i,t=>{
    const paper=t*spec.durationMs/480,delay=.018+(i%3)*.012,q=clamp((paper-delay)/.5),travel=out(q),side=(i%2?1:-1);
    return {x:p.x+8+i/(spec.fibers-1)*(p.width-16)+side*(18+i%4*8)*travel,
      y:seam-3-(24+i%5*9)*travel,scale:.8-.32*travel,rotation:side*(12+q*54),opacity:envelope(paper,delay,delay+.12,.58)*.38};
  });
  const tilt=t=>p.tiltDegrees*(1-out(t*spec.durationMs/p.returnMs));
  add(4,'packet-mouth',t=>{const paper=clamp(t*spec.durationMs/480),a=tilt(t)*Math.PI/180,offset=cy-seam,exit=flight.packet(t);return {x:cx+Math.sin(a)*offset,y:cy-Math.cos(a)*offset+exit.drop,rotation:tilt(t),scaleX:exit.scale,scaleY:(.30+.70*out(paper/.45))*exit.scale,opacity:exit.opacity};});
  add(5,'packet-body',t=>{const exit=flight.packet(t);return {x:cx,y:cy+exit.drop,rotation:tilt(t),scale:exit.scale,opacity:exit.opacity};});
  // PAG layers are front-to-back; emit deepest first and place the front card last.
  for(const item of flight.plan(spec.cardBacks).reverse())add(6,'card-back-'+item.slot.i,t=>flight.sample(item,t));
  add(7,'series-glow',t=>{const paper=t*spec.durationMs/480;return {x:cx,y:seam,scaleX:.55+out(paper/.6)*.35,scaleY:.25+out(paper/.45)*.25,opacity:envelope(paper,0,.2,.9)*.14};});
  const images=textures.map((texture,index)=>tag(TAG.image,Buffer.concat([uint(index+1),uint(texture.data.length),texture.data])));
  const attributes=tag(TAG.attributes,Buffer.concat([sint(spec.width),sint(spec.height),uint(frames),float(spec.frameRate),Buffer.from([0,0,0])]));
  const body=Buffer.concat([...images,tag(TAG.composition,Buffer.concat([uint(1),attributes,...layers,END])),END]);
  const header=Buffer.alloc(9);header.write('PAG');header[3]=1;header.writeUInt32LE(body.length,4);header[8]=85;return Buffer.concat([header,body]);
}
async function renderTextures(page,spec){
  await page.addScriptTag({content:'globalThis.paintPacketSurface = '+require('../game/js/packet-surface.js').paint.toString()+';globalThis.paintPacketInterior = '+require('../game/js/packet-surface.js').interior.toString()+';globalThis.paintTearTexture = '+require('../game/js/tear-textures.js').paint.toString()+';'});
  const series=require('../game/js/pack.js').seriesOf('deep');
  const source='data:image/jpeg;base64,'+(await fs.readFile(path.join(ROOT,'game/assets/pack-deep.jpg'))).toString('base64');
  const foilSource='data:image/png;base64,'+(await fs.readFile(path.join(ROOT,'game/assets/packet-foil-deep.png'))).toString('base64');
  return page.evaluate(async({spec,series,source,foilSource})=>{
    const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=source;});
    const foil=new Image();await new Promise((resolve,reject)=>{foil.onload=resolve;foil.onerror=reject;foil.src=foilSource;});
    return spec.textures.map(texture=>{const canvas=document.createElement('canvas');canvas.width=texture.width;canvas.height=texture.height;
      paintTearTexture(canvas.getContext('2d'),texture.name,texture.width,texture.height,series,image,paintPacketSurface,paintPacketInterior,foil);
      return {...texture,data:canvas.toDataURL('image/webp',.94).split(',')[1]};});
  },{spec,series,source,foilSource});
}
async function main(){
  const spec=JSON.parse(await fs.readFile(path.join(ROOT,'tools/pag/tear-template.json'),'utf8'));let browser;
  try{browser=await chromium.launch({executablePath:await browserExecutable(),headless:true});const page=await browser.newPage();
    const textures=(await renderTextures(page,spec)).map(texture=>({...texture,data:Buffer.from(texture.data,'base64')}));
    const data=encode(spec,textures);await fs.mkdir(path.join(ROOT,'game/assets/pag'),{recursive:true});await fs.writeFile(path.join(ROOT,'game/assets/pag/tear.pag'),data);await packTearTemplate(spec,data);
    console.log('Built tear.pag ('+data.length+' bytes, '+spec.durationMs+'ms @ '+spec.frameRate+'fps, '+(spec.fibers+spec.cardBacks+6)+' layers).');
  }finally{if(browser)await browser.close();}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={encode,renderTextures};
