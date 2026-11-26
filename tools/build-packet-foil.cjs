/** Build small transparent satin-foil masks. No illustration is generated or replaced.
 * node tools/build-packet-foil.cjs
 * The printed face stays transparent; light only describes seals and tucked edges.
 */
const fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('playwright-core');
const {browserExecutable}=require('./build-pag-template.cjs');
const {SERIES}=require('../game/js/pack.js');
const ROOT=path.resolve(__dirname,'..');
async function build() {
  let browser;
  try {
    browser=await chromium.launch({executablePath:await browserExecutable(),headless:true});
    const page=await browser.newPage();
    const output=await page.evaluate(series=>series.map(s=>{
      const canvas=document.createElement('canvas');canvas.width=300;canvas.height=420;
      const c=canvas.getContext('2d');c.scale(2,2);
      function gradient(x0,y0,x1,y1,stops) {
        const g=c.createLinearGradient(x0,y0,x1,y1);
        for(const [at,color] of stops)g.addColorStop(at,color);
        return g;
      }
      const white=s.id==='dawn'?'255,242,218':'238,248,245';
      function light(a){return 'rgba('+white+','+a+')';}
      // Pressed seams run horizontally and have a continuous soft sheen.
      for(const y of [2.5,199]) {
        c.fillStyle=gradient(0,y,0,y+9,[[0,light(.04)],[.2,light(.12)],[.65,'rgba(0,0,0,.07)'],[1,light(.035)]]);
        c.fillRect(3,y,143,9);
        for(let j=0;j<4;j++) {
          const yy=y+1.1+j*2.05;
          c.strokeStyle=gradient(6,0,141,0,[[0,light(.025)],[.32,light(.24)],[.62,light(.09)],[1,light(.035)]]);
          c.lineWidth=.55;c.beginPath();c.moveTo(6,yy);c.lineTo(141,yy);c.stroke();
          c.strokeStyle='rgba(0,0,0,.11)';c.lineWidth=.45;c.beginPath();c.moveTo(6,yy+.7);c.lineTo(141,yy+.7);c.stroke();
        }
      }
      // Narrow folds on the edges; a bright/dark pair suggests thickness.
      c.fillStyle=gradient(2,0,10,0,[[0,'rgba(0,0,0,.10)'],[.22,light(.23)],[.42,light(.065)],[1,light(0)]]);
      c.fillRect(2,16,8,180);
      c.fillStyle=gradient(135,0,146,0,[[0,light(0)],[.49,'rgba(0,0,0,.09)'],[.70,light(.16)],[1,light(0)]]);
      c.fillRect(135,16,11,180);
      function crease(points,shade) {
        c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=shade;c.fill();
      }
      // Corners carry the folds; the printed center has no decorative border.
      crease([[4,13],[22,15],[7,28]],gradient(4,13,12,27,[[0,light(.10)],[.40,light(.16)],[1,light(0)]]));
      crease([[5,16],[15,22],[6,32]],gradient(6,17,10,30,[[0,'rgba(0,0,0,.16)'],[1,'rgba(0,0,0,0)']]));
      crease([[141,13],[123,15],[140,31]],gradient(143,15,127,25,[[0,light(.21)],[.33,light(.08)],[1,light(0)]]));
      crease([[143,196],[126,195],[140,184]],gradient(140,196,135,185,[[0,light(.15)],[.50,light(.04)],[1,light(0)]]));
      crease([[5,196],[23,195],[7,184]],gradient(6,196,17,185,[[0,light(.21)],[.30,'rgba(0,0,0,.09)'],[1,light(0)]]));
      const pixels=c.getImageData(0,0,300,420).data;
      let centerOpaque=0;
      for(let y=66;y<362;y++)for(let x=30;x<266;x++)if(pixels[(y*300+x)*4+3])centerOpaque++;
      if(centerOpaque)throw new Error('Material mask covers the printed illustration');
      return {id:s.id,png:canvas.toDataURL('image/png').split(',')[1],centerOpaque};
    }),SERIES);
    const assets=[];
    for(const item of output) {
      const file='packet-foil-'+item.id+'.png',bytes=Buffer.from(item.png,'base64');
      await fs.writeFile(path.join(ROOT,'game/assets',file),bytes);
      assets.push({file,bytes:bytes.length,centerOpaque:item.centerOpaque});
    }
    console.log(JSON.stringify({material:'printed satin foil',assets},null,2));return assets;
  } finally {if(browser)await browser.close();}
}
if(require.main===module)build().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={build};
