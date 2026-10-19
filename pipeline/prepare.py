"""Video/PNG sequence -> selected, keyed, registered browser atlas.

One shared crop/scale is applied to every frame. Endpoint stills are encoded from
the decoded final atlas, so hold and animation use identical decoded pixels.
"""
import argparse,json,math,os,shutil,subprocess,tempfile,hashlib
from pathlib import Path
import numpy as np
from PIL import Image,ImageFilter

def executable(name,environment):
    value=os.environ.get(environment) or shutil.which(name)
    if not value:raise ValueError(f'Install {name} on PATH or set {environment} to its executable path.')
    return value

def matte(image,key='green',low=.035,high=.58):
    if image.mode=='RGBA' and image.getextrema()[3][0]<255:return image.copy()
    rgb=np.asarray(image.convert('RGB'),dtype=np.float32)/255
    if key=='green':dominance=rgb[:,:,1]-np.maximum(rgb[:,:,0],rgb[:,:,2]);backing=np.array([0,1,0],dtype=np.float32)
    elif key=='magenta':dominance=np.minimum(rgb[:,:,0],rgb[:,:,2])-rgb[:,:,1];backing=np.array([1,0,1],dtype=np.float32)
    else:raise ValueError('Choose green or magenta key.')
    dominance=np.maximum(0,dominance)
    alpha=np.clip(1-(dominance-low)/(high-low),0,1)
    # Restrict keying to the bright backing and its immediate fringe. Dark
    # green printed ink must stay opaque rather than becoming holes in cotton.
    brightness=rgb[:,:,1] if key=='green' else np.minimum(rgb[:,:,0],rgb[:,:,2])
    candidate=(dominance>.20)&(brightness>.42)
    fringe=np.asarray(Image.fromarray(np.uint8(candidate)*255).filter(ImageFilter.MaxFilter(5)))>0
    alpha=np.where(fringe,alpha,1)
    border=np.concatenate((rgb[0],rgb[-1],rgb[:,0],rgb[:,-1]))
    backing=np.median(border,axis=0)
    unmixed=(rgb-(1-alpha[:,:,None])*backing)/np.maximum(alpha[:,:,None],.025)
    out=np.dstack((np.clip(unmixed,0,1),alpha))
    return Image.fromarray(np.uint8(out*255))

def wooden_pivot(frame):
    a=np.asarray(frame,dtype=np.float32)
    wood=(a[:,:,3]>220)&(a[:,:,0]>a[:,:,2]*1.2)&(a[:,:,0]>a[:,:,1]*1.08)&(a[:,:,1]<190)
    wood[int(frame.height*.28):]=False
    yy,xx=np.where(wood)
    if len(yy)<4:raise ValueError('Wooden apex not found. Use --pivot x,y for a fixed suspension point, or inspect the key/background.')
    y=int(yy.min());x=float(np.median(xx[yy<y+4]));return x,y

def prepare_frames(images,output,frame_count=30,width=384,height=448,columns=6,key='green',crop=None,pivot=None,align=False,quality=88,source=None):
    if len(images)<2:raise ValueError('Provide at least two source frames.')
    if any(image.size!=images[0].size for image in images):raise ValueError('All source frames must have the same canvas size.')
    indices=[round(i*(len(images)-1)/(frame_count-1)) for i in range(frame_count)]
    frames=[matte(images[i],key) for i in indices]
    boxes=[f.getchannel('A').point(lambda a:255 if a>20 else 0).getbbox() for f in frames]
    if any(b is None for b in boxes):raise ValueError('Key removed a complete frame. Change backing color/key settings before proceeding.')
    if crop is None:
        x0=min(b[0] for b in boxes);y0=min(b[1] for b in boxes);x1=max(b[2] for b in boxes);y1=max(b[3] for b in boxes)
        crop=(x0,y0,x1,y1)
    if len(crop)!=4 or crop[2]<=crop[0] or crop[3]<=crop[1]:raise ValueError('Crop must be x0,y0,x1,y1 with positive dimensions.')
    source_w,source_h=images[0].size
    if crop[0]<0 or crop[1]<0 or crop[2]>source_w or crop[3]>source_h:raise ValueError('Crop extends outside the source image.')
    if pivot is None:
        pivot=wooden_pivot(frames[-1]) if align else ((crop[0]+crop[2])/2,crop[1])
    pivots=[wooden_pivot(f) for f in frames] if align else [pivot]*len(frames)
    if align:
        pivots=[tuple(np.median(pivots[max(0,i-2):min(len(pivots),i+3)],axis=0)) for i in range(len(frames))]
    # One scale, fixed browser pivot and enough room for every selected silhouette.
    px,py=pivot
    relative_boxes=[(b[0]-p[0],b[1]-p[1],b[2]-p[0],b[3]-p[1]) for b,p in zip(boxes,pivots)]
    left=max(1,max(-b[0] for b in relative_boxes));right=max(1,max(b[2] for b in relative_boxes));bottom=max(1,max(b[3] for b in relative_boxes));top=max(0,max(-b[1] for b in relative_boxes))
    target_pivot=(width/2,height*.027)
    scale=min((width/2-16)/max(left,right),(height-target_pivot[1]-18)/bottom)
    if top*scale>target_pivot[1]:raise ValueError('Foreground extends above the suspension pivot; choose the top wooden apex.')
    prepared=[]
    for frame,(x,y) in zip(frames,pivots):
        # Crop is an explicit shared selection, never independently auto-cropped per frame.
        clipped=Image.new('RGBA',frame.size);clipped.paste(frame.crop(crop),(crop[0],crop[1]))
        a=1/scale;tx=x-target_pivot[0]*a;ty=y-target_pivot[1]*a
        prepared.append(clipped.transform((width,height),Image.Transform.AFFINE,(a,0,tx,0,a,ty),Image.Resampling.BICUBIC))
    output.mkdir(parents=True,exist_ok=False)
    atlas=Image.new('RGBA',(width*columns,height*math.ceil(frame_count/columns)))
    for i,f in enumerate(prepared):atlas.paste(f,((i%columns)*width,(i//columns)*height))
    atlas.save(output/'atlas.webp',quality=quality,method=6)
    decoded=Image.open(output/'atlas.webp').convert('RGBA')
    for name,i in [('profile',0),('front',frame_count-1)]:
        decoded.crop(((i%columns)*width,(i//columns)*height,(i%columns+1)*width,(i//columns+1)*height)).save(output/(name+'.webp'),lossless=True,exact=True)
    backgrounds=[(245,243,238),(23,33,48),(210,170,110)]
    review=Image.new('RGB',(width*5,height*3))
    for row,bg in enumerate(backgrounds):
        for col,i in enumerate([0,frame_count//4,frame_count//2,3*frame_count//4,frame_count-1]):
            tile=Image.new('RGBA',(width,height),bg);tile.alpha_composite(decoded.crop(((i%columns)*width,(i//columns)*height,(i%columns+1)*width,(i//columns+1)*height)));review.paste(tile.convert('RGB'),(col*width,row*height))
    review.save(output/'key-review.jpg',quality=90)
    manifest={'version':1,'atlas':'atlas.webp','profile':'profile.webp','front':'front.webp','width':width,'height':height,'columns':columns,'frameCount':frame_count,'pivot':[target_pivot[0]/width,target_pivot[1]/height],'source':source or {'kind':'user-supplied'},'processing':{'key':key,'crop':list(crop),'scale':float(scale),'registered':align,'selectedIndices':indices,'endpointPixels':'Decoded atlas cells, no independent idle plate'},'bytes':(output/'atlas.webp').stat().st_size}
    (output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    return manifest

def main():
    p=argparse.ArgumentParser(description=__doc__);g=p.add_mutually_exclusive_group(required=True);g.add_argument('--video',type=Path);g.add_argument('--frames',type=Path)
    p.add_argument('--out',required=True,type=Path);p.add_argument('--start',type=float,default=0);p.add_argument('--end',type=float)
    p.add_argument('--count',type=int,default=30);p.add_argument('--width',type=int,default=384);p.add_argument('--height',type=int,default=448);p.add_argument('--columns',type=int,default=6)
    p.add_argument('--key',choices=['green','magenta'],default='green');p.add_argument('--crop');p.add_argument('--pivot');p.add_argument('--align-wood',action='store_true');p.add_argument('--quality',type=int,default=88)
    args=p.parse_args()
    if not 2<=args.count<=120 or not 32<=args.width<=1024 or not 32<=args.height<=1024 or not 1<=args.columns<=args.count:raise ValueError('Use count2–120, dimensions32–1024 and columns1–count.')
    if args.count*args.width*args.height>32_000_000:raise ValueError('Atlas exceeds this starter\'s decode budget.')
    if args.out.exists():raise ValueError('Output already exists. Use a new named output; do not overwrite an approved sequence.')
    crop=tuple(map(int,args.crop.split(','))) if args.crop else None;pivot=tuple(map(float,args.pivot.split(','))) if args.pivot else None
    if pivot and len(pivot)!=2:raise ValueError('Pivot is x,y in source pixels.')
    args.out.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='garment-frames-',dir=args.out.parent) as folder:
        if args.video:
            ffmpeg=executable('ffmpeg','FFMPEG');probe=executable('ffprobe','FFPROBE')
            data=json.loads(subprocess.check_output([probe,'-v','error','-select_streams','v:0','-show_entries','format=duration:stream=avg_frame_rate','-of','json',str(args.video)],text=True));duration=float(data['format']['duration'])
            rate=data.get('streams',[{}])[0].get('avg_frame_rate','24/1');num,den=map(float,rate.split('/'));source_fps=num/den if den and num else 24
            end=args.end if args.end is not None else duration
            if args.start<0 or end<=args.start or end>duration+.05:raise ValueError('Choose a valid start/end interval inside the video.')
            fps=(args.count-1)/(end-args.start)
            pattern=str(Path(folder)/'%04d.png')
            subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-ss',str(args.start),'-i',str(args.video),'-t',str(end-args.start),'-vf',f'fps={fps}','-frames:v',str(args.count),pattern],check=True)
            files=sorted(Path(folder).glob('*.png'));images=[Image.open(f).convert('RGB') for f in files]
            if len(images)<2:raise ValueError('Not enough frames extracted.')
            # Explicit endpoint seeks preserve the selected source interval.
            for name,seek,index in [('first',args.start,0),('last',max(args.start,end-1/source_fps-.001),-1)]:
                out=Path(folder)/(name+'.png');subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-ss',str(seek),'-i',str(args.video),'-frames:v','1',str(out)],check=True);images[index]=Image.open(out).convert('RGB')
            source={'kind':'processed-video','file':args.video.name,'sha256':hashlib.sha256(args.video.read_bytes()).hexdigest(),'intervalSeconds':[args.start,end]}
        else:
            files=sorted(args.frames.glob('*.png'));images=[Image.open(f).convert('RGBA') for f in files];source={'kind':'processed-png-sequence','frames':len(files)}
        manifest=prepare_frames(images,args.out,args.count,args.width,args.height,args.columns,args.key,crop,pivot,args.align_wood,args.quality,source)
    print(json.dumps({'output':str(args.out),'frameCount':manifest['frameCount'],'atlasBytes':manifest['bytes'],'review':'Inspect key-review.jpg and the sequence in the actual UI before accepting it.'},indent=2))

if __name__=='__main__':
    try:main()
    except (ValueError,subprocess.CalledProcessError,OSError) as error:raise SystemExit(str(error))
