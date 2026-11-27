/** Build reproducible, transparent aluminium seals for flat trading-card boosters.
 * Existing illustration is preserved. No generation service or original PNGs involved.
 * node tools/build-packet-foil.cjs
 */
const fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('playwright-core');
const {browserExecutable}=require('./build-pag-template.cjs');
const {SERIES}=require('../game/js/pack.js');
const {WIDTH,HEIGHT}=require('../game/js/packet-surface.js');
const ROOT=path.resolve(__dirname,'..');
async function build() {
  let browser;
  try {
    browser=await chromium.launch({executablePath:await browserExecutable(),headless:true,args:['--use-angle=d3d11']});
    const page=await browser.newPage();
    const output=await page.evaluate(({series,width,height})=>series.map(s=>{
      const canvas=document.createElement('canvas');canvas.width=width*2;canvas.height=height*2;
      const c=canvas.getContext('2d');c.scale(2,2);
      function gradient(x0,y0,x1,y1,stops) {
        const g=c.createLinearGradient(x0,y0,x1,y1);
        for(const [at,color] of stops)g.addColorStop(at,color);
        return g;
      }
      function light(a){return 'rgba(245,250,255,'+a+')';}
      // Restrained metallic reflections only on the two pressed silver bands.
      for(const [y,h] of [[2,31],[258,18]]) {
        c.fillStyle=gradient(0,y,0,y+h,[[0,light(.08)],[.20,light(.50)],
          [.39,'rgba(49,68,87,.12)'],[.56,light(.26)],[.81,light(.05)],[1,light(.34)]]);
        c.fillRect(3,y,144,h);
      }
      // Flat heat-seal grooves: only a few small, parallel lines.
      for(const base of [3.5,264.5]) {
        for(let i=0;i<4;i++) {
          const y=base+i*1.8;
          c.strokeStyle=gradient(8,0,142,0,[[0,light(.05)],[.28,light(.70)],[.66,light(.24)],[1,light(.12)]]);
          c.lineWidth=.55;c.beginPath();c.moveTo(8,y);c.lineTo(142,y);c.stroke();
          c.strokeStyle='rgba(48,64,83,.15)';c.lineWidth=.4;
          c.beginPath();c.moveTo(8,y+.7);c.lineTo(142,y+.7);c.stroke();
        }
      }
      // No swollen gusset, corner creases or shaded belly around the artwork.
      c.fillStyle=gradient(3,0,7,0,[[0,light(.12)],[.35,light(.65)],[1,light(0)]]);
      c.fillRect(3,34,4,224);
      c.fillStyle=gradient(143,0,147,0,[[0,light(0)],[.65,light(.48)],[1,light(.06)]]);
      c.fillRect(143,34,4,224);
      const pixels=c.getImageData(0,0,canvas.width,canvas.height).data;
      let centerOpaque=0;
      for(let y=70;y<516;y++)for(let x=20;x<280;x++)if(pixels[(y*canvas.width+x)*4+3])centerOpaque++;
      if(centerOpaque)throw new Error('Foil must not cover the printed artwork');
      return {id:s.id,png:canvas.toDataURL('image/png').split(',')[1],centerOpaque};
    }),{series:SERIES,width:WIDTH,height:HEIGHT});
    const assets=[];
    for(const item of output) {
      const file='packet-foil-'+item.id+'.png',bytes=Buffer.from(item.png,'base64');
      await fs.writeFile(path.join(ROOT,'game/assets',file),bytes);
      assets.push({file,bytes:bytes.length,width:WIDTH*2,height:HEIGHT*2,centerOpaque:item.centerOpaque});
    }
    console.log(JSON.stringify({material:'flat aluminium trading-card booster',assets},null,2));return assets;
  } finally {if(browser)await browser.close();}
}
if(require.main===module)build().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={build};
