# Procedural backgrounds for Gen Labs asset-lib (1920x1080). Re-run: python3 genbg.py <outdir>
import numpy as np,sys,os
from PIL import Image,ImageFilter,ImageDraw
out=sys.argv[1]; os.makedirs(out,exist_ok=True)
W,H=1920,1080
rng=np.random.default_rng(7)
yy,xx=np.mgrid[0:H,0:W].astype(np.float32)
def hexc(h): return np.array([int(h[i:i+2],16) for i in (1,3,5)],np.float32)
def blobs(base,spots,sigma=1.0):
    img=np.ones((H,W,3),np.float32)*hexc(base)
    for (cx,cy,r,col,a) in spots:
        d=((xx-cx*W)**2+(yy-cy*H)**2)/(r*W)**2
        m=np.exp(-d*sigma)[...,None]*a
        img=img*(1-m)+hexc(col)*m
    return img
def noise(img,amt,blur=0):
    n=rng.normal(0,amt,(H,W,1)).astype(np.float32)
    return img+n
def vign(img,s=0.35):
    d=np.sqrt(((xx-W/2)/(W/2))**2+((yy-H/2)/(H/2))**2)
    return img*(1-s*np.clip(d-0.4,0,1)[...,None])
def save(img,name,q=92):
    Image.fromarray(np.clip(img,0,255).astype(np.uint8)).save(f'{out}/{name}.jpg',quality=q,subsampling=0)
# gradients
save(noise(blobs('#0f1537',[(.2,.2,.5,'#5b3cc4',.8),(.85,.8,.55,'#1e6fd9',.7),(.6,.1,.3,'#c04fd1',.35)]),1.5),'grad-indigo-violet')
save(noise(blobs('#fff3e8',[(.15,.15,.45,'#ffc7a6',.9),(.9,.85,.5,'#ffd9e0',.9),(.7,.2,.3,'#fff0b8',.7)]),1.0),'grad-peach-soft')
save(noise(blobs('#06323a',[(.25,.8,.5,'#14a3a0',.8),(.85,.2,.5,'#1b6fa8',.7),(.5,.5,.3,'#2ed3b7',.25)]),1.5),'grad-teal-deep')
save(noise(blobs('#f4f6fb',[(.1,.1,.5,'#dfe6ff',.9),(.9,.9,.5,'#efe3ff',.9)]),0.8),'grad-neutral-light')
save(noise(vign(blobs('#14161c',[(.5,.4,.6,'#2a2f3d',.9)])),1.5),'grad-charcoal-vignette')
save(noise(blobs('#1a0f2e',[(.8,.2,.5,'#e0457b',.6),(.2,.85,.5,'#6a2fd0',.7)]),1.5),'grad-magenta-night')
# paper grain
def paper(base,amt,fine):
    img=np.ones((H,W,3),np.float32)*hexc(base)
    n=rng.normal(0,amt,(H//2,W//2)).astype(np.float32)
    big=np.array(Image.fromarray(n).resize((W,H),Image.BICUBIC)) if False else np.array(Image.fromarray(n,'F').resize((W,H),Image.BICUBIC))
    fibers=np.array(Image.fromarray(rng.normal(0,amt*1.5,(H,W//8)).astype(np.float32),'F').resize((W,H),Image.BICUBIC))
    img=img+(big+fibers*0.5+rng.normal(0,fine,(H,W)).astype(np.float32))[...,None]
    return vign(img,0.06)
save(paper('#f3eee3',4,3),'paper-grain-white')
save(paper('#d9c3a0',5,3.5),'paper-grain-kraft')
save(noise(vign(np.ones((H,W,3),np.float32)*hexc('#1b1d22'),0.2),6),'noise-dark-grain')
# bokeh
def bokeh(base,cols,n,seed,rmin,rmax,alpha):
    r=np.random.default_rng(seed)
    bg=Image.fromarray(np.clip(blobs(base,[(.3,.3,.7,cols[0],.35),(.8,.8,.6,cols[1],.35)]),0,255).astype(np.uint8)).convert('RGBA')
    lay=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(lay)
    for i in range(n):
        x,y=r.uniform(0,W),r.uniform(0,H); rad=r.uniform(rmin,rmax)
        c=tuple(int(v) for v in hexc(cols[r.integers(len(cols))]))
        a=int(r.uniform(.25,1)*alpha)
        d.ellipse([x-rad,y-rad,x+rad,y+rad],fill=c+(a,)); d.ellipse([x-rad,y-rad,x+rad,y+rad],outline=c+(min(255,a+40),),width=2)
    lay=lay.filter(ImageFilter.GaussianBlur(2.2))
    return np.array(Image.alpha_composite(bg,lay).convert('RGB'),np.float32)
save(noise(bokeh('#0b0e24',['#7a5cff','#34c3ff','#ff6fb5'],70,1,25,95,90),1),'bokeh-night-blue')
save(noise(bokeh('#2b1408',['#ffb347','#ff7a45','#ffe29a'],70,2,25,95,95),1),'bokeh-warm-gold')
save(noise(bokeh('#f6f2ff',['#ffd1e8','#cfe3ff','#fff1c1','#d6f5e3'],60,3,30,100,120),0.8),'bokeh-pastel-light')
# vector patterns
def svg(name,body,bg): open(f'{out}/{name}.svg','w').write(f'<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="{bg}"/>{body}</svg>')
def grid(step,col,w,major=0,mcol=None):
    s=''.join(f'<path d="M{x} 0V1080" stroke="{col}" stroke-width="{w}"/>' for x in range(0,1921,step))+''.join(f'<path d="M0 {y}H1920" stroke="{col}" stroke-width="{w}"/>' for y in range(0,1081,step))
    if major: s+=''.join(f'<path d="M{x} 0V1080" stroke="{mcol}" stroke-width="{w*2}"/>' for x in range(0,1921,step*major))+''.join(f'<path d="M0 {y}H1920" stroke="{mcol}" stroke-width="{w*2}"/>' for y in range(0,1081,step*major))
    return s
svg('grid-light',grid(60,'#e3e8f2',1.5,4,'#d2d9e8'),'#fafbfe')
svg('grid-dark',grid(60,'#232a45',1.5,4,'#2e3760'),'#0e1224')
svg('grid-blueprint',grid(40,'#2f6bb8',1,5,'#4a89d8'),'#134a8a')
dots=''.join(f'<circle cx="{x}" cy="{y}" r="2.5" fill="#c3cbe0"/>' for x in range(30,1920,60) for y in range(30,1080,60))
svg('dots-light',dots,'#fbfcff')
dotsd=''.join(f'<circle cx="{x}" cy="{y}" r="2.5" fill="#3a4470"/>' for x in range(30,1920,60) for y in range(30,1080,60))
svg('dots-dark',dotsd,'#0e1224')
print(os.listdir(out))
