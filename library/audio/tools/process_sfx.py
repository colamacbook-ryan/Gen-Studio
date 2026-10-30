import sys, os, json, subprocess, wave, glob
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from sfx_manifest import M
W='/tmp/claude-0/-home-user/bba20ac0-16bf-5912-8dd5-4d08b20490c6/scratchpad/w'
OUT='/tmp/claude-0/-home-user/bba20ac0-16bf-5912-8dd5-4d08b20490c6/scratchpad/s/out'
SR=48000
def srcpath(s):
    k,v=s.split(':',1)
    if k=='mx': return f'{W}/mxsfx/{v}.mp3'
    pack,f=v.split('/')
    hits=glob.glob(f'{W}/k-{pack}/**/{f}.ogg',recursive=True)+glob.glob(f'{W}/k-{pack}/**/{f}.wav',recursive=True)
    assert hits,(s); return hits[0]
def decode(p):
    pr=subprocess.run(['ffprobe','-v','error','-select_streams','a:0','-show_entries','stream=channels','-of','csv=p=0',p],capture_output=True,text=True)
    ch=int(pr.stdout.strip().split(',')[0])
    r=subprocess.run(['ffmpeg','-v','error','-i',p,'-ar',str(SR),'-f','f32le','-'],capture_output=True)
    a=np.frombuffer(r.stdout,np.float32).astype(np.float64)
    # ffmpeg keeps native channel count w/o -ac
    return a.reshape(-1,ch)
def db(x): return 20*np.log10(max(x,1e-12))
def env(a,win):
    m=np.abs(a).max(axis=1) if a.ndim>1 else np.abs(a)
    n=len(m)//win
    if n==0: return np.array([m.max()])
    return np.sqrt((m[:n*win].reshape(n,win)**2).mean(axis=1))
rep=[]
for cat,name,src,trim,energy,tags,desc in M:
    p=srcpath(src)
    a=decode(p)
    ch=a.shape[1]
    # source clipping stats (float, before any gain)
    mono=a.max(axis=1) if False else np.abs(a).max(axis=1)
    over=(mono>=0.999)
    src_over=int(over.sum()); 
    runs=int(((over[1:]&over[:-1])).sum())
    src_peak=db(mono.max())
    # mono fold if channels identical
    if ch==2:
        d=a[:,0]-a[:,1]
        if np.sqrt((d**2).mean())<10**(-50/20)*max(1e-9,np.sqrt((a**2).mean())) or db(np.sqrt((d**2).mean()))<-60:
            a=a[:,:1]; ch=1
    # remove DC
    dc=float(a.mean()); a=a-a.mean(axis=0)
    # normalize to -1 dBFS peak
    pk=np.abs(a).max(); a=a*(10**(-1/20)/pk)
    # trim leading/trailing silence at -55 dBFS (5 ms windows)
    e=env(a,240); thr=10**(-55/20)
    idx=np.where(e>thr)[0]
    s=max(0,(idx[0]-1)*240) if len(idx) else 0
    t=min(len(a),(idx[-1]+2)*240) if len(idx) else len(a)
    a=a[s:t]
    cut=False
    if trim and len(a)>trim*SR:
        a=a[:int(trim*SR)]; cut=True
    # tail level before fade
    tail=db(np.sqrt((a[-int(.03*SR):]**2).mean()))
    # fade: 3ms in, out 40ms (or 12% if short)
    fi=int(.003*SR); fo=int(min(.05*SR,len(a)*.15)) if (cut or tail>-45) else int(.01*SR)
    g=np.ones(len(a)); g[:fi]=np.linspace(0,1,fi); g[-fo:]*=np.linspace(1,0,fo); a=a*g[:,None]
    # re-normalize after trim (peak may be in trimmed region)
    pk=np.abs(a).max(); a=a*(10**(-1/20)/pk)
    dur=len(a)/SR
    rms=db(np.sqrt((a**2).mean()))
    e50=env(a,int(.05*SR)); floor=db(e50.min())
    # rolloff 99% energy
    mm=a.mean(axis=1); sp=np.abs(np.fft.rfft(mm*np.hanning(len(mm))))**2; cs=np.cumsum(sp)/sp.sum(); fr=np.fft.rfftfreq(len(mm),1/SR)
    r99=float(fr[np.searchsorted(cs,.99)]); r999=float(fr[np.searchsorted(cs,.999)])
    os.makedirs(f'{OUT}/{cat}',exist_ok=True)
    fn=f'{OUT}/{cat}/{name}.wav'
    w=wave.open(fn,'wb'); w.setnchannels(ch); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(a,-1,1)*32767).round().astype(np.int16).tobytes()); w.close()
    rep.append(dict(cat=cat,name=name,src=src,dur=round(dur,3),ch=ch,src_peak=round(src_peak,2),src_over=src_over,src_runs=runs,dc=round(dc,5),rms=round(rms,1),floor=round(floor,1),tail=round(tail,1),cut=cut,r99=round(r99),r999=round(r999),energy=energy,tags=tags,desc=desc,size=os.path.getsize(fn)))
json.dump(rep,open('sfx_report.json','w'),indent=1)
print(len(rep),'processed; total MB',sum(r['size'] for r in rep)/1e6)
