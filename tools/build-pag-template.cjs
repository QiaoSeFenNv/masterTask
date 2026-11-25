/** Build our editable PAG reveal. No AE, network, or runtime frame baking required.
 * Binary tags follow Tencent/libpag include/pag/file.h and src/codec/AttributeHelper.h.
 * Only image layers and linear 2D transform keyframes are emitted.
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const { packTemplate } = require('./pack-pag-template.cjs');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const SPEC = path.join(ROOT, 'tools/pag/reveal-template.json');
const OUTPUT = path.join(ROOT, 'game/assets/pag/reveal.pag');
const END = Buffer.alloc(2);
const TAG = { composition: 2, attributes: 3, layer: 5, imageReference: 11, transform: 13, image: 47, layerAttributes: 52 };
function uint(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid unsigned PAG integer: ' + value);
  const bytes = [];
  do { const low = value % 128; value = Math.floor(value / 128); bytes.push(low | (value ? 128 : 0)); } while (value);
  return Buffer.from(bytes);
}
function sint(value) { return uint(Math.abs(value) * 2 + (value < 0 ? 1 : 0)); }
function float(value) { const out = Buffer.alloc(4); out.writeFloatLE(value); return out; }
function point(value) { return Buffer.concat(value.map(float)); }
function string(value) { return Buffer.from(value + '\0', 'utf8'); }
function bits(values) {
  const bytes = [];
  let offset = 0;
  for (const [value, length] of values) {
    for (let bit = 0; bit < length; bit++, offset++) {
      const byte = offset >> 3;
      if (bytes[byte] === undefined) bytes[byte] = 0;
      bytes[byte] |= ((value >>> bit) & 1) << (offset & 7);
    }
  }
  return Buffer.from(bytes);
}
function tag(code, value) {
  const header = Buffer.alloc(value.length < 63 ? 2 : 6);
  header.writeUInt16LE((code << 6) | Math.min(63, value.length));
  if (header.length === 6) header.writeUInt32LE(value.length, 2);
  return Buffer.concat([header, value]);
}
function animated(values, kind) {
  const count = values.length - 1;
  const prefix = [uint(count), bits(Array.from({ length: count }, () => [1, 2]))]; // Linear=1
  for (let i = 0; i <= count; i++) prefix.push(uint(i));
  if (kind === 'opacity') {
    // PAG uint32 lists begin with (bit width - 1) in five bits. No Bezier data follows.
    prefix.push(bits([[7, 5], ...values.map(value => [Math.round(Math.max(0, Math.min(1, value)) * 255), 8]), [0, 5]]));
  } else {
    prefix.push(...values.map(kind === 'point' ? point : float), bits([[0, 5]]));
  }
  return Buffer.concat(prefix);
}
function transform(samples, anchor) {
  // anchor static; position absent; x/y, scale, rotation, opacity animated.
  const flags = bits([[1,1],[0,1],[0,1], ...Array.from({length:5},()=>[[1,1],[1,1]]).flat()]);
  return tag(TAG.transform, Buffer.concat([flags, point(anchor),
    animated(samples.map(s=>s.x),'float'), animated(samples.map(s=>s.y),'float'),
    animated(samples.map(s=>[s.scaleX == null ? s.scale : s.scaleX, s.scaleY == null ? s.scale : s.scaleY]),'point'),
    animated(samples.map(s=>s.rotation || 0),'float'), animated(samples.map(s=>s.opacity),'opacity')]));
}
function layer(id, imageId, name, samples, anchor) {
  // LayerAttributesV2: active, autoOrientation, parent, stretch, startTime, blend,
  // trackMatte, timeRemap, fixed duration (no flag), name.
  const flags = bits([[1,1],[0,1],[0,1],[0,1],[0,1],[0,1],[0,1],[0,1],[1,1]]);
  return tag(TAG.layer, Buffer.concat([Buffer.from([5]), uint(id),
    tag(TAG.layerAttributes,Buffer.concat([flags,uint(samples.length - 1),string(name)])),
    transform(samples,anchor),tag(TAG.imageReference,uint(imageId)),END]));
}
function clamp(value) { return Math.max(0,Math.min(1,value)); }
function out(value) { return 1-Math.pow(1-clamp(value),3); }
function envelope(t,start,peak,end) { return t < peak ? out((t-start)/(peak-start)) : 1-out((t-peak)/(end-peak)); }
function encode(spec, textures) {
  const frames = Math.round(spec.durationMs / 1000 * spec.frameRate);
  if (frames < 2 || frames > 240 || spec.card.imageIndex !== 0) throw new Error('Unsupported reveal template contract');
  const samples = fn => Array.from({length:frames+1},(_,frame)=>fn(frame/frames));
  const atCard = {x:spec.card.x,y:spec.card.y,scale:1,opacity:1};
  const layers = [];
  const add = (imageId,name,fn) => layers.push(layer(layers.length+1,imageId,name,samples(fn),[textures[imageId-1].width/2,textures[imageId-1].height/2]));
  // Layer list is front-to-back, like AE. The card artwork is editable index zero.
  add(1,spec.card.layerName,t=>({...atCard,scale:1+0.034*Math.sin(clamp((t-0.22)/0.46)*Math.PI),rotation:-2*(1-out(t/0.38))}));
  for (let i=0;i<spec.glints;i++) {
    const angle = i / spec.glints * Math.PI * 2;
    const delay = spec.bloomAt - 0.08 + (i % 4) * 0.018;
    add(5,'glint-'+i,t=>{
      const q=clamp((t-delay)/0.65), travel=out(q);
      const radius=78+travel*(72+(i%3)*18);
      return {x:spec.card.x+Math.cos(angle)*radius,y:spec.card.y+Math.sin(angle)*radius*1.12-travel*18,
        scale:(0.28+(i%3)*0.09)*(0.55+Math.sin(q*Math.PI)),rotation:i*23+q*45,
        opacity:envelope(t,delay,delay+0.13,0.94)*0.92};
    });
  }
  add(3,'halo-ring',t=>({...atCard,scale:0.63+out((t-0.18)/0.72)*1.18,rotation:t*32,
    opacity:envelope(t,0.19,spec.bloomAt+0.08,0.86)*0.62}));
  add(4,'rays',t=>({...atCard,scale:0.74+out((t-0.16)/0.7)*0.58,rotation:-12+t*17,
    opacity:envelope(t,0.14,spec.bloomAt+0.05,0.9)*0.72}));
  add(2,'bloom',t=>({...atCard,scale:1+out(t/0.5)*0.53,opacity:clamp(t/0.2)*(0.3+0.58*envelope(t,0.1,0.39,0.88))}));
  const images = textures.map((texture,index)=>tag(TAG.image,Buffer.concat([uint(index+1),uint(texture.data.length),texture.data])));
  const attributes = tag(TAG.attributes,Buffer.concat([sint(spec.width),sint(spec.height),uint(frames),float(spec.frameRate),Buffer.from([0,0,0])]));
  const composition = tag(TAG.composition,Buffer.concat([uint(1),attributes,...layers,END]));
  const body = Buffer.concat([...images,composition,END]);
  const header = Buffer.alloc(9);
  header.write('PAG');header[3]=1;header.writeUInt32LE(body.length,4);header[8]=85; // 'U', uncompressed.
  return Buffer.concat([header,body]);
}
async function browserExecutable() {
  const candidates = [process.env.PAG_BROWSER,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'];
  for (const file of candidates.filter(Boolean)) { try {await fs.access(file);return file;} catch {} }
  throw new Error('Set PAG_BROWSER to a Chromium browser executable to build the PAG textures.');
}
async function renderTextures(page,spec) {
  return page.evaluate(spec=>{
    function round(c,x,y,w,h,r) {c.beginPath();c.roundRect(x,y,w,h,r);}
    const definitions=[['card',spec.card.width,spec.card.height],['bloom',256,256],['ring',256,256],['rays',320,320],['glint',32,32]];
    return definitions.map(([name,width,height])=>{
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const c=canvas.getContext('2d'),cx=width/2,cy=height/2;
      if(name==='card') {
        const g=c.createLinearGradient(0,0,width,height);g.addColorStop(0,'#5d456e');g.addColorStop(1,'#242031');
        round(c,1,1,width-2,height-2,spec.card.radius);c.fillStyle=g;c.fill();c.strokeStyle='#e8d7ae';c.lineWidth=2;c.stroke();
        c.strokeStyle='rgba(255,255,255,.3)';round(c,7,7,width-14,height-14,12);c.lineWidth=1;c.stroke();
        c.fillStyle='#e8d7ae';c.beginPath();c.moveTo(cx,cy-30);c.lineTo(cx+16,cy);c.lineTo(cx,cy+30);c.lineTo(cx-16,cy);c.closePath();c.fill();
      } else if(name==='bloom') {
        const g=c.createRadialGradient(cx,cy,0,cx,cy,cx);
        g.addColorStop(0,'rgba(255,246,207,.88)');g.addColorStop(.38,'rgba(238,214,152,.66)');
        g.addColorStop(.65,'rgba(160,129,220,.25)');g.addColorStop(1,'rgba(122,99,170,0)');
        c.fillStyle=g;c.fillRect(0,0,width,height);
      } else if(name==='ring') {
        c.strokeStyle='rgba(249,237,200,.9)';c.lineWidth=1.4;c.shadowColor='#f8e5b9';c.shadowBlur=7;
        c.beginPath();c.arc(cx,cy,100,0,Math.PI*2);c.stroke();c.lineWidth=.7;c.beginPath();c.arc(cx,cy,107,0,Math.PI*2);c.stroke();
        for(let i=0;i<12;i++){const a=i*Math.PI/6;c.save();c.translate(cx,cy);c.rotate(a);c.fillStyle='rgba(255,241,198,.85)';c.fillRect(99,-1.5,8,3);c.restore();}
      } else if(name==='rays') {
        for(let i=0;i<24;i++){c.save();c.translate(cx,cy);c.rotate(i*Math.PI/12);
          const g=c.createLinearGradient(0,48,0,154);g.addColorStop(0,'rgba(249,228,174,0)');g.addColorStop(.4,'rgba(249,228,174,.6)');g.addColorStop(1,'rgba(249,228,174,0)');
          c.fillStyle=g;c.beginPath();c.moveTo(-1,48);c.lineTo(i%2?5:2,154);c.lineTo(i%2?-5:-2,154);c.closePath();c.fill();c.restore();}
      } else {
        c.shadowBlur=4;c.shadowColor='#fae6b3';c.fillStyle='rgba(255,246,218,.95)';c.beginPath();
        c.moveTo(cx,1);c.lineTo(cx+2,cy-2);c.lineTo(width-1,cy);c.lineTo(cx+2,cy+2);c.lineTo(cx,height-1);c.lineTo(cx-2,cy+2);c.lineTo(1,cy);c.lineTo(cx-2,cy-2);c.closePath();c.fill();
      }
      return {name,width,height,data:canvas.toDataURL('image/webp',0.95).split(',')[1]};
    });
  },spec);
}
async function main() {
  const spec=JSON.parse(await fs.readFile(SPEC,'utf8'));
  let browser;
  try {
    browser=await chromium.launch({executablePath:await browserExecutable(),headless:true});
    const page=await browser.newPage();
    const textures=(await renderTextures(page,spec)).map(texture=>({...texture,data:Buffer.from(texture.data,'base64')}));
    const data=encode(spec,textures);
    await fs.mkdir(path.dirname(OUTPUT),{recursive:true});
    await fs.writeFile(OUTPUT,data);
    await packTemplate(spec,data);
    console.log('Built game/assets/pag/reveal.pag ('+data.length+' bytes, '+spec.durationMs+' ms @ '+spec.frameRate+' fps, '+(spec.glints+4)+' layers).');
  } finally { if(browser)await browser.close(); }
}
if(require.main===module) main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={encode,browserExecutable,renderTextures};
