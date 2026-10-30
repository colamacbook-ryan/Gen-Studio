import subprocess,os,json,re,sys,wave
import numpy as np
W='/tmp/claude-0/-home-user/bba20ac0-16bf-5912-8dd5-4d08b20490c6/scratchpad/w'
S='/tmp/claude-0/-home-user/bba20ac0-16bf-5912-8dd5-4d08b20490c6/scratchpad/s'
OUT=f'{S}/mout'; os.makedirs(OUT,exist_ok=True)
SR=48000
P=[ # name, src, mode, a, b, mood tags, energy, phase, desc
 ('curious-intro-01','inc:Sneaky Snitch','loop',11.94,100.22,'curious,playful,mysterious,tiptoe,intro','light',['hook','setup'],'Playful oboe + pizzicato tiptoe; curious intro / "what is going on" setup'),
 ('light-explain-01','inc:Digital Lemonade','loop',23.68,55.68,'light,bright,bouncy,explain,voiceover-bed','light',['setup','payoff'],'Bright analog-synth groove, relaxed; under voiceover explaining'),
 ('light-explain-02','inc:Wallpaper','loop',18.3,59.58,'light,clean,calm-upbeat,explain,voiceover-bed','light',['setup','breath'],'Clean non-intrusive synth bed; long explanations'),
 ('upbeat-corporate-01','mx:77','loop',20.62,79.74,'upbeat,corporate,confident,motivational,business','medium',['setup','build','payoff'],'Confident corporate pop-rock, steady drive'),
 ('build-01','mx:35','oneshot',0,105.3,'build,rising,motivating,positive,momentum','medium',['build'],'Gradual 100 s build from sparse to full band, ends with fade'),
 ('tension-01','mx:75','loop',21.46,83.45,'tension,suspense,disturbing,cinematic,stakes','medium',['build'],'Pulsing low tension bed, steady; before a reveal'),
 ('climax-01','inc:Furious Freak','loop',53.73,99.06,'climax,driving,intense,bright,high-energy,payoff','heavy',['climax'],'Full-on driving section (160 bpm); the big moment'),
 ('calm-breath-01','inc:Morning','loop',24.8,73.14,'calm,breath,soft,relaxed,reflective','light',['breath'],'Soft slow bed (60 bpm) to let the viewer breathe between beats'),
 ('happy-outro-01','mx:12','loop',11.28,99.85,'happy,outro,playful,cheerful,cta','medium',['payoff','cta'],'Cheerful playful bed for outro / call to action'),
 ('comedic-01','inc:Monkeys Spinning Monkeys','loop',2.83,36.13,'comedic,funny,bouncy,light-hearted,pizzicato','light',['setup','payoff'],'Bright flutes + pizzicato; the author marks it loopable'),
]
def path(s):
    k,v=s.split(':',1)
    return f"{W}/mmusic/{v}.mp3" if k=='mx' else f"{W}/inc/{v.replace(' ','_').replace(chr(39),'')}.mp3"
def decode(p):
    r=subprocess.run(['ffmpeg','-v','error','-i',p,'-ar',str(SR),'-ac','2','-f','f32le','-'],capture_output=True)
    return np.frombuffer(r.stdout,np.float32).reshape(-1,2).astype(np.float64)
def envelope(x,hop=240):
    m=np.abs(x).mean(axis=1); n=len(m)//hop; return np.sqrt((m[:n*hop].reshape(n,hop)**2).mean(axis=1))
def refine(x,s,e):
    # shift e within +-0.15s to best match onset envelope around s (beat phase)
    hop=240; env=envelope(x,hop); si=int(s*SR/hop); w=int(0.6*SR/hop)
    ref=env[si-w:si+w]; ref=ref-ref.mean(); best=(-9,0)
    for d in range(-int(0.15*SR/hop),int(0.15*SR/hop)+1):
        ei=int(e*SR/hop)+d
        seg=env[ei-w:ei+w]
        if len(seg)!=len(ref): continue
        seg=seg-seg.mean(); c=(ref*seg).sum()/(np.linalg.norm(ref)*np.linalg.norm(seg)+1e-9)
        if c>best[0]: best=(c,d)
    return e+best[1]*hop/SR,best[0]
def lufs(arr,tmp):
    w=wave.open(tmp,'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(arr,-1,1)*32767).astype(np.int16).tobytes()); w.close()
    r=subprocess.run(['ffmpeg','-nostats','-i',tmp,'-af','ebur128=peak=true','-f','null','-'],capture_output=True,text=True).stderr
    s=r[r.rfind('Summary:'):]
    return float(re.search(r'I:\s+(-?[\d.]+)',s).group(1))
rep=[]
for name,src,mode,a,b,tags,en,ph,desc in P:
    x=decode(path(src)); note=[]
    if mode=='loop':
        b2,corr=refine(x,a,b); xf=int(0.5*SR); s=int(a*SR); e=int(b2*SR)
        seg=x[s:e].copy()
        th=np.linspace(0,np.pi/2,xf)[:,None]
        seg[-xf:]=seg[-xf:]*np.cos(th)+x[s-xf:s]*np.sin(th)
        note.append(f'loop {a:.2f}-{b2:.2f}s, beat-phase corr {corr:.2f}, 0.5 s equal-power pre-roll crossfade')
        loop=True
    else:
        s=int(a*SR); e=min(len(x),int(b*SR)); seg=x[s:e].copy()
        fi=int(0.05*SR); seg[:fi]*=np.linspace(0,1,fi)[:,None]
        # trim trailing silence < -55 dB
        env=envelope(seg); idx=np.where(env>10**(-55/20))[0]; seg=seg[:min(len(seg),(idx[-1]+2)*240)]
        tail=20*np.log10(np.sqrt((seg[-int(.2*SR):]**2).mean())+1e-9)
        fo=int((2.0 if tail>-30 else 0.5)*SR); seg[-fo:]*=np.linspace(1,0,fo)[:,None]
        note.append(f'one-shot {a:.1f}-{len(seg)/SR+a:.1f}s, fade-out {fo/SR:.1f}s'); loop=False
    tmp=f'{OUT}/_t.wav'
    I=lufs(seg,tmp); g=10**((-16-I)/20); seg*=g
    # peak protection: soft limiter if > -1.5 dBFS sample peak
    pk=np.abs(seg).max()
    if pk>10**(-1.5/20):
        note.append(f'gain {20*np.log10(g):+.1f} dB would peak {20*np.log10(pk):.1f} dBFS -> limiter')
        w=wave.open(f'{OUT}/_pre.wav','wb'); w.setnchannels(2); w.setsampwidth(3)
        w.setframerate(SR)
        # 24-bit write
        q=(np.clip(seg,-1,1)*8388607).astype(np.int32); b3=np.stack([(q>>0)&255,(q>>8)&255,(q>>16)&255],axis=-1).astype(np.uint8).tobytes(); w.writeframes(b3); w.close()
        subprocess.run(['ffmpeg','-v','error','-y','-i',f'{OUT}/_pre.wav','-af','alimiter=limit=0.84:attack=5:release=80:level=disabled','-ar',str(SR),'-c:a','pcm_s24le',f'{OUT}/_lim.wav'],check=True)
        seg=decode(f'{OUT}/_lim.wav')
    # write float wav master for encode
    w=wave.open(f'{OUT}/{name}.wav','wb'); w.setnchannels(2); w.setsampwidth(3); w.setframerate(SR)
    q=(np.clip(seg,-1,1)*8388607).astype(np.int32); w.writeframes(np.stack([(q>>0)&255,(q>>8)&255,(q>>16)&255],axis=-1).astype(np.uint8).tobytes()); w.close()
    subprocess.run(['ffmpeg','-v','error','-y','-i',f'{OUT}/{name}.wav','-c:a','libmp3lame','-q:a','2','-ar','48000','-id3v2_version','3','-metadata',f'title={name}',f'{OUT}/{name}.mp3'],check=True)
    os.remove(f'{OUT}/{name}.wav')
    rep.append(dict(name=name,src=src,mode=mode,loop=loop,dur=len(seg)/SR,note='; '.join(note),tags=tags,energy=en,phase=ph,desc=desc,size=os.path.getsize(f'{OUT}/{name}.mp3')))
    print(name,round(len(seg)/SR,1),os.path.getsize(f'{OUT}/{name}.mp3')//1000,'KB','; '.join(note),flush=True)
json.dump(rep,open(f'{S}/music_rep.json','w'),indent=1)
