/** Pixel checks of the actual Canvas gradient, independent of card art and background. */
async function shadowSamples(page) {
  return page.evaluate(()=>{
    const c=rolesPreview.requireGame('js/draw.js').getCtx(),radial=c.createRadialGradient,fill=c.fillRect;
    const gradients=new WeakSet(),samples=[];
    const isolated=document.createElement('canvas');isolated.width=c.canvas.width;isolated.height=c.canvas.height;
    const out=isolated.getContext('2d');
    c.createRadialGradient=function(...args){const gradient=radial.apply(this,args);if(args.length===6&&args.every((value,index)=>value===(index===5?1:0)))gradients.add(gradient);return gradient;};
    c.fillRect=function(...args){
      if(!gradients.has(this.fillStyle))return fill.apply(this,args);
      const m=this.getTransform(),rx=Math.hypot(m.a,m.b),ry=Math.hypot(m.c,m.d),alpha=this.globalAlpha;
      // Sample the complete intended ellipse even when a short viewport clips its bottom.
      isolated.width=Math.max(isolated.width,Math.ceil(m.e+rx*1.2)+2);
      isolated.height=Math.max(isolated.height,Math.ceil(m.f+ry*1.2)+2);
      fill.apply(this,args);
      out.setTransform(1,0,0,1,0,0);out.clearRect(0,0,isolated.width,isolated.height);
      out.setTransform(m);out.globalAlpha=alpha;out.fillStyle=this.fillStyle;out.fillRect(...args);
      const at=(x,y)=>out.getImageData(Math.max(0,Math.min(isolated.width-1,Math.floor(m.e+m.a*x+m.c*y))),
        Math.max(0,Math.min(isolated.height-1,Math.floor(m.f+m.b*x+m.d*y))),1,1).data[3];
      samples.push({x:m.e,y:m.f,rx,ry,alpha,pixels:{center:at(0,0),half:at(.5,0),edge:at(.95,0),outside:at(1.1,0)}});
    };
    try{rolesPreview.game.render();return samples;}finally{c.createRadialGradient=radial;c.fillRect=fill;isolated.width=1;isolated.height=1;}
  });
}
module.exports={shadowSamples};
