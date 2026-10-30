"""Extract the supplied 9 idle / 11 walk poses; retain one shared pixel scale."""
from pathlib import Path
from collections import deque
from PIL import Image, ImageDraw
import numpy as np
import shutil

root = Path(__file__).resolve().parents[1]
source = root / '美术源文件/主角修改版.png'
if not source.exists():
    shutil.copy2('/Users/xingdong/Desktop/主角修改版.png', source)
im = Image.open(source).convert('RGB')
out = root / 'cocos/assets/resources/hero'
# Cell boundaries exclude titles and adjacent poses. Foot center is the common anchor.
rows = {
 'idle': ([25,201,353,505,660,814,980,1148,1313,1490], [131,285,437,593,747,907,1077,1251,1421], 374, 658),
 'walk': ([], [132,270,407,546,676,806,929,1053,1175,1301,1427], 897, 1166),
}
preview=Image.new('RGB',(1100,660),'#55675d')
for row,(action,(bounds,centers,top,bottom)) in enumerate(rows.items()):
    for i,cx in enumerate(centers):
        left,right=bounds[i:i+2] if bounds else (max(0,cx-106),min(im.width,cx+84))
        crop=im.crop((left,top,right,bottom))
        rgb=np.array(crop).astype(np.int16)
        # The source backdrop is blue-gray. Only edge-connected backdrop is removed,
        # keeping enclosed cool armor highlights and the dark character outline.
        r,g,b=rgb[:,:,0],rgb[:,:,1],rgb[:,:,2]
        bg=(b-r>=3)&(b>=g)&(r>=25)&(r<110)&(b-r<45)
        h,w=bg.shape; seen=np.zeros((h,w),dtype=bool)
        queue=deque([(x,y) for y in range(h) for x in [0,w-1]]+[(x,y) for x in range(w) for y in [0,h-1]])
        while queue:
            x,y=queue.popleft()
            if not (0<=x<w and 0<=y<h) or seen[y,x] or not bg[y,x]: continue
            seen[y,x]=True
            queue.extend(((x-1,y),(x+1,y),(x,y-1),(x,y+1)))
        alpha=np.where(seen,0,255).astype('uint8')
        if action == 'walk':
            # Neighbouring cloaks touch their shadows. Split along a minimum-cost
            # background seam instead of assuming equal-width rectangular cells.
            full=np.array(im.crop((0,top,im.width,bottom))).astype(np.int16)
            fr,fg,fb=full[:,:,0],full[:,:,1],full[:,:,2]
            backdrop=(fb-fr>=3)&(fb>=fg)&(fr>=25)&(fr<110)&(fb-fr<45)
            seams=[]
            for j in [i-1,i]:
                if j<0: seams.append(np.zeros(h)); continue
                if j>=len(centers)-1: seams.append(np.full(h,im.width)); continue
                lo=centers[j]+25; hi=centers[j+1]-45
                cost=np.where(backdrop[:,lo:hi],0.0,14.0)
                cost+=np.abs(np.arange(lo,hi)-(centers[j]+50))[None,:]*0.015
                dp=cost[0].copy(); parents=[]
                for yy in range(1,h):
                    candidates=np.vstack([np.r_[1e9,dp[:-1]],dp,np.r_[dp[1:],1e9]])
                    step=np.argmin(candidates,axis=0); parents.append(step-1)
                    dp=cost[yy]+np.min(candidates,axis=0)
                xx=int(np.argmin(dp)); seam=np.zeros(h,dtype=int); seam[-1]=xx+lo
                for yy in range(h-2,-1,-1):
                    xx+=int(parents[yy][xx]); seam[yy]=xx+lo
                seams.append(seam)
            xs=np.arange(left,right)[None,:]
            alpha[(xs<seams[0][:,None]) | (xs>=seams[1][:,None])]=0
        # Remove detached labels/noise, preserving all substantial silhouette pieces.
        foreground=alpha>0; visited=np.zeros((h,w),bool)
        components=[]
        for yy in range(h):
            for xx in range(w):
                if not foreground[yy,xx] or visited[yy,xx]: continue
                q=[(xx,yy)]; visited[yy,xx]=True; component=[]
                while q:
                    x,y=q.pop(); component.append((x,y))
                    for nx,ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
                        if 0<=nx<w and 0<=ny<h and foreground[ny,nx] and not visited[ny,nx]:
                            visited[ny,nx]=True; q.append((nx,ny))
                components.append(component)
                if len(component)<100:
                    for x,y in component: alpha[y,x]=0
        if action == 'walk':
            main=max(components,key=len)
            alpha[:]=0
            for x,y in main: alpha[y,x]=255
        rgba=crop.convert('RGBA'); rgba.putalpha(Image.fromarray(alpha))
        frame=Image.new('RGBA',(200,300))
        frame.alpha_composite(rgba,(100+left-cx,286-(bottom-top)))
        frame.save(out/f'{action}-{i}.png')
        small=frame.resize((100,150),Image.Resampling.LANCZOS)
        px=i*100; py=row*320
        preview.paste(small,(px,py+35),small)
        # Show a second checkerboard-backed row for transparency inspection.
        tile=Image.new('RGB',(100,150),'#b7b7b7'); d=ImageDraw.Draw(tile)
        for y in range(0,150,10):
            for x in range(0,100,10):
                if (x//10+y//10)%2: d.rectangle((x,y,x+9,y+9),fill='#dedede')
        tile.paste(small,(0,0),small); preview.paste(tile,(px,py+185))
        ImageDraw.Draw(preview).text((px+8,py+12),f'{action}-{i}',fill='white')
preview.save(root/'验证截图/角色-v1.3-切帧预览.png')
print('Extracted 20 transparent 200x300 frames.')
