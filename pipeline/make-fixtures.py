"""Create original illustrative fixtures. No catalog images, AI service or 3D runtime.

These precomputed drawings test the frame/controller contract, not product fidelity.
"""
from pathlib import Path
import json, math, hashlib, argparse, subprocess, shutil
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
W,H,N,COLS=384,448,30,6
ITEMS=[('tee',(225,222,210),'tee'),('crew',(90,102,108),'crew'),('hoodie',(183,132,102),'hoodie')]

def draw_garment(angle,color,kind,back=False):
    S=2;canvas=Image.new('RGBA',(W*S,H*S));d=ImageDraw.Draw(canvas)
    co,si=math.cos(angle),math.sin(angle)
    def depth(y):return 12+7*math.sin(max(0,min(1,(y-65)/350))*math.pi)
    def point(x,y,z=0):return ((W/2+x*co+z*si)*S,y*S)
    def polygon(points,fill):d.polygon([point(*p) for p in points],fill=fill)
    def line(points,fill,width=1):d.line([point(*p) for p in points],fill=fill,width=max(1,round(width*S)),joint='curve')
    if kind=='tee':outline=[(-32,62),(-88,73),(-142,118),(-119,163),(-81,141),(-77,400),(77,400),(81,141),(119,163),(142,118),(88,73),(32,62)]
    else:outline=[(-33,62),(-88,73),(-111,114),(-132,314),(-106,326),(-79,166),(-77,402),(77,402),(79,166),(106,326),(132,314),(111,114),(88,73),(33,62)]
    # Stable depth creates a readable edge at exactly 90 degrees; no shifting pivot.
    dark=tuple(max(0,c-25) for c in color)+(255,)
    polygon([(x,y,-depth(y)) for x,y in outline],dark)
    for i,(x,y) in enumerate(outline):
        xx,yy=outline[(i+1)%len(outline)]
        polygon([(x,y,-depth(y)),(xx,yy,-depth(yy)),(xx,yy,depth(yy)),(x,y,depth(y))],tuple(max(0,c-13) for c in color)+(255,))
    mask=Image.new('L',canvas.size);md=ImageDraw.Draw(mask)
    md.polygon([point(x,y,depth(y)) for x,y in outline],fill=255)
    texture=Image.new('RGBA',canvas.size)
    bounds=mask.getbbox()
    if bounds:
        xx=np.arange(bounds[0],bounds[2])[None,:];yy=np.arange(bounds[1],bounds[3])[:,None]
        x=(xx/S-W/2)/max(.07,co);y=yy/S
        folds=3.4*np.cos(x*.062)+1.8*np.cos(x*.14+y*.025)
        light=4.5*(1-np.abs(x)/170)-4.5*np.maximum(0,(y-350)/65)
        grain=((xx*17+yy*31)%11-5)*.18
        rgb=np.stack([np.rint(np.clip(c+folds+light+grain,0,255)) for c in color],axis=-1).astype('uint8')
        alpha=np.asarray(mask.crop(bounds),dtype='uint8')[:,:,None]
        texture.paste(Image.fromarray(np.concatenate([rgb,alpha],axis=-1)),bounds[:2])
        canvas.alpha_composite(texture);d=ImageDraw.Draw(canvas)
    seam=tuple(max(0,c-24) for c in color)+(150,)
    for side in [-1,1]:
        line([(side*76,160,depth(160)+.1),(side*73,270,depth(270)+.1),(side*75,396,depth(396)+.1)],seam,.6)
        line([(side*64,143,depth(143)+.1),(side*56,190,depth(190)+.1),(side*58,249,depth(249)+.1)],tuple(max(0,c-14) for c in color)+(85,),.7)
    line([(-74,390,depth(390)+.1),(0,394,depth(394)+.1),(74,390,depth(390)+.1)],seam,.8)
    # Neckline is an original construction, not copied artwork.
    arc=[(32*math.cos(t),62+(17 if not back else 7)*math.sin(t),depth(62)+.2) for t in [i*math.pi/24 for i in range(25)]]
    line(arc,tuple(max(0,c-42) for c in color)+(255,),2.8)
    if kind=='hoodie':
        hood=[(-31,67,12),(-38,46,-10),(-29,33,-17),(0,28,-20),(29,33,-17),(38,46,-10),(31,67,12)]
        polygon(hood,tuple(max(0,c-11) for c in color)+(255,));line(hood,seam,1.2)
        if not back:
            line([(-19,72,20),(-16,132,21)],(197,177,155,255),1.3);line([(19,72,20),(16,135,21)],(197,177,155,255),1.3)
            pocket=[(-45,281,20),(-37,303,20),(-35,337,20),(35,337,20),(37,303,20),(45,281,20)]
            line(pocket,seam,1)
    # Wooden shoulders rotate; the metal wire belongs to the UI, not these frames.
    hanger=[(0,12,0),(-95,43,0),(-98,48,0),(-89,52,0),(0,24,0),(89,52,0),(98,48,0),(95,43,0)]
    polygon([(x,y,-4) for x,y,z in hanger],(115,77,51,255))
    for i,(x,y,z) in enumerate(hanger):
        xx,yy,zz=hanger[(i+1)%len(hanger)]
        polygon([(x,y,-4),(xx,yy,-4),(xx,yy,4),(x,y,4)],(125,85,55,255))
    polygon([(x,y,4) for x,y,z in hanger],(145,105,72,255))
    line([(-91,44,4),(0,15,4),(91,44,4)],(187,151,111,255),1.2)
    line([(-87,49,4),(0,22,4),(87,49,4)],(95,62,44,255),.8)
    return canvas.resize((W,H),Image.Resampling.LANCZOS)

def main():
    p=argparse.ArgumentParser();p.add_argument('--video',action='store_true',help='Also create a local green-screen video for pipeline testing');args=p.parse_args()
    records=[]
    for item,color,kind in ITEMS:
        out=ROOT/'public/fixtures'/item;out.mkdir(parents=True,exist_ok=True)
        frames=[draw_garment(math.pi/2*(1-i/(N-1)),color,kind) for i in range(N)]
        atlas=Image.new('RGBA',(W*COLS,H*math.ceil(N/COLS)))
        for i,frame in enumerate(frames):atlas.paste(frame,((i%COLS)*W,(i//COLS)*H))
        atlas.save(out/'atlas.webp',quality=87,method=6)
        decoded=Image.open(out/'atlas.webp').convert('RGBA')
        decoded.crop((0,0,W,H)).save(out/'profile.webp',lossless=True,exact=True)
        last=N-1;x=(last%COLS)*W;y=(last//COLS)*H
        decoded.crop((x,y,x+W,y+H)).save(out/'front.webp',lossless=True,exact=True)
        draw_garment(0,color,kind,back=True).save(out/'back.webp',lossless=True)
        manifest={'version':1,'atlas':'atlas.webp','profile':'profile.webp','front':'front.webp','width':W,'height':H,'frameCount':N,'columns':COLS,'pivot':[.5,12/H],'source':{'kind':'original-procedural-illustration','generator':'pipeline/make-fixtures.py','license':'MIT','notAiGenerated':True,'notProductPhotography':True}}
        (out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
        for f in out.iterdir():
            records.append({'file':str(f.relative_to(ROOT)).replace('\\','/'),'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'origin':'Original neutral fixture, drawn by repository generator','license':'MIT'})
        if item=='tee':
            anchors=ROOT/'examples/anchors';anchors.mkdir(parents=True,exist_ok=True)
            for name,frame in [('profile',frames[0]),('front',frames[-1])]:
                image=Image.new('RGB',(1280,720),(0,255,0));fg=frame.resize((557,650),Image.Resampling.LANCZOS);image.paste(fg,(362,30),fg);image.save(anchors/(name+'.png'))
            if args.video:
                raw=ROOT/'work/fixture-frames';raw.mkdir(parents=True,exist_ok=True)
                for i in range(144):
                    fg=frames[round(min(1,i/143)*(N-1))].resize((557,650),Image.Resampling.LANCZOS)
                    image=Image.new('RGB',(1280,720),(0,255,0));image.paste(fg,(362,30),fg);image.save(raw/f'{i:04d}.png')
                ffmpeg=shutil.which('ffmpeg')
                if not ffmpeg:raise SystemExit('Install FFmpeg to create the optional fixture video.')
                subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-framerate','24','-i',str(raw/'%04d.png'),'-c:v','libx264','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart','-n',str(ROOT/'examples/fixture-turn.mp4')],check=True)
    (ROOT/'public/fixtures/provenance.json').write_text(json.dumps({'generator':'pipeline/make-fixtures.py','externalImagesUsed':False,'items':records},indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'items':len(ITEMS),'framesPerItem':N,'fixtureBytes':sum(x['bytes'] for x in records),'externalImages':0}))

if __name__=='__main__':main()
