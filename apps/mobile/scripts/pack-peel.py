# Flipbook frames of the sign-in pack seal peeling back, cut from the Meshy pack art
# (assets/meshy/paket-tam.webp, 427 x 720). Run from apps/mobile: python3 scripts/pack-peel.py [frames]
import random, math, sys
from PIL import Image, ImageDraw, ImageFilter, ImageChops
OUT='assets/meshy/soyulma/'
pk=Image.open('assets/meshy/paket-tam.webp').convert('RGBA')
W,H=pk.size
CUT=80; LOW=112            # tear line ~y80; frames cover art rows TOP..LOW
TOP=-26; CW=700            # canvas: art y from -26, width enough for the flap pushed right
CH=LOW-TOP
N=int(sys.argv[1]) if len(sys.argv)>1 else 20
FOLD=0.55; LIFT=10
rnd=random.Random(7)
pts=[]; x=0
while x<=W:
    y=CUT+4*math.sin(x/37)+2.5*math.sin(x/11+1)+rnd.uniform(-2.2,2.2)
    pts.append((x,y)); x+=rnd.uniform(3,7)
pts[-1]=(W,pts[-1][1])
def path_y(px):
    for (x0,y0),(x1,y1) in zip(pts,pts[1:]):
        if x0<=px<=x1: return y0+(y1-y0)*(px-x0)/max(x1-x0,1e-6)
    return pts[-1][1]
fr=random.Random(3)
front_jit=[fr.uniform(-2.5,2.5) for _ in range(40)]
def torn_mask(xf):
    """Region of the seal already torn away: left of a ragged, slightly slanted front, above the tear line."""
    m=Image.new('L',(W,H),0); d=ImageDraw.Draw(m)
    if xf<=0: return m
    poly=[(0,-40)]
    # front from top to the tear line, leaning forward at the top
    ys=list(range(-40,int(path_y(min(xf,W)))+1,4))
    fx=[]
    for k,y in enumerate(ys):
        lean=(path_y(min(xf,W))-y)*0.12
        fx.append((min(W+40,xf+lean+front_jit[k%40]),y))
    poly+=fx
    poly+=[(x,y) for x,y in reversed(pts) if x<=xf]
    poly+=[(0,path_y(0))]
    d.polygon(poly,fill=255)
    return m.filter(ImageFilter.GaussianBlur(0.6))
def rim_line(img_mask, line, off):
    r=Image.new('L',(W,H),0); ImageDraw.Draw(r).line([(x,y+off) for x,y in line],fill=255,width=3)
    return ImageChops.multiply(r.filter(ImageFilter.GaussianBlur(0.5)),img_mask)
PALE=(236,240,226)
def paint_rim(im, rim, a=0.85):
    w=Image.new('RGBA',im.size,PALE+(255,)); w.putalpha(rim.point(lambda v:int(v*a)))
    return Image.alpha_composite(im,w)
alpha=pk.getchannel('A')
def frame(p, with_flap=True):
    xf=p*W*1.06 if p<1 else W+40   # front runs a bit past the edge so the last bit lets go
    tm=torn_mask(xf)
    keep=ImageChops.multiply(alpha,tm.point(lambda v:255-v))
    base=pk.copy(); base.putalpha(keep)
    # pale rim on the body where it has torn
    line=[(x,y) for x,y in pts if x<=xf]
    if len(line)>1: base=paint_rim(base, rim_line(keep,line,1.2))
    canvas=Image.new('RGBA',(CW,CH),(0,0,0,0))
    canvas.alpha_composite(base.crop((0,0,W,LOW)),(0,-TOP))
    if with_flap and xf>0:
        fa=ImageChops.multiply(alpha,tm)
        flap=pk.copy(); flap.putalpha(fa)
        if len(line)>1: flap=paint_rim(flap, rim_line(fa,line,-1.2))
        flap=flap.crop((0,0,W,LOW))
        # slightly darker as it lifts off the light
        dark=Image.new('RGBA',flap.size,(0,0,0,255)); dark.putalpha(fa.crop((0,0,W,LOW)).point(lambda v:int(v*0.12)))
        flap=Image.alpha_composite(flap,dark)
        dx=p*W*FOLD; dy=-LIFT*min(1,p*4)
        ang=-3*math.sin(math.pi*min(p,1))
        fl=Image.new('RGBA',(CW,CH),(0,0,0,0)); fl.alpha_composite(flap,(0,-TOP))
        fl=fl.rotate(-ang,resample=Image.BICUBIC,center=(xf,CUT-TOP))
        fl=fl.transform(fl.size,Image.AFFINE,(1,0,-dx,0,1,-dy),resample=Image.BICUBIC)
        sh=fl.getchannel('A').filter(ImageFilter.GaussianBlur(4))
        shadow=Image.new('RGBA',(CW,CH),(0,0,0,255)); shadow.putalpha(sh.point(lambda v:int(v*0.45)))
        shadow=shadow.transform(shadow.size,Image.AFFINE,(1,0,-2,0,1,-5))
        # the shadow only falls on the pack, not on the background
        shadow.putalpha(ImageChops.multiply(shadow.getchannel('A'),canvas.getchannel('A')))
        canvas=Image.alpha_composite(canvas,shadow)
        canvas=Image.alpha_composite(canvas,fl)
    return canvas
for i in range(N):
    p=i/(N-1)
    frame(p).save(f'{OUT}f{i:02d}.webp','WEBP',quality=82)
frame(1,with_flap=False).save(OUT+'acik.webp','WEBP',quality=85)
# the flap alone in its final pose, for the fly-off
fa=ImageChops.multiply(alpha,torn_mask(W+40)); flap=pk.copy(); flap.putalpha(fa)
flap=paint_rim(flap, rim_line(fa,pts,-1.2)).crop((0,0,W,LOW))
dark=Image.new('RGBA',flap.size,(0,0,0,255)); dark.putalpha(fa.crop((0,0,W,LOW)).point(lambda v:int(v*0.12)))
Image.alpha_composite(flap,dark).crop((0,0,W,CUT+10)).save(OUT+'serit.webp','WEBP',quality=88)
pk.crop((0,LOW-3,W,H)).save(OUT+'alt.webp','WEBP',quality=88)
print('ok',N,CW,CH)
