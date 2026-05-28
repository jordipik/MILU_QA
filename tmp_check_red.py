from PIL import Image
from pathlib import Path

targets=[
    Path('esquemas_pos_circulos/12V4000M40A-POS/12V4000M40A-0012-02-175.webp'),
    Path('esquemas/12V4000M40A_esquemas/12V4000M40A-0012-02.webp'),
]
for p in targets:
    if not p.exists():
        print(p, 'MISSING')
        continue
    img=Image.open(p).convert('RGB')
    pix=img.load()
    w,h=img.size
    red=0
    for y in range(h):
        for x in range(w):
            r,g,b=pix[x,y]
            if r>180 and g<100 and b<100:
                red+=1
    print(p.as_posix(), 'size=',img.size,'red_pixels=',red)
