from PIL import Image
from pathlib import Path
files=[
    Path('esquemas_pos_circulos/12V4000M40A-POS/12V4000M40A-0012-02-70.webp'),
    Path('esquemas_pos_circulos/12V4000M40A-POS/12V4000M40A-0012-02-175.webp'),
    Path('esquemas_pos_circulos/12V4000M40A-POS/12V4000M40A-0012-01-168.webp'),
]
for p in files:
    if not p.exists():
        print(p.as_posix(), 'MISSING')
        continue
    img=Image.open(p).convert('RGB')
    px=img.load(); w,h=img.size
    red=0
    for y in range(h):
        for x in range(w):
            r,g,b=px[x,y]
            if r>180 and g<100 and b<100:
                red+=1
    print(p.name, 'red_pixels=', red)
