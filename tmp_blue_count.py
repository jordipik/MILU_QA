from PIL import Image
from pathlib import Path
p=Path('esquemas_pos_circulos/12V4000M40A-POS/12V4000M40A-0012-02-70.webp')
img=Image.open(p).convert('RGB')
w,h=img.size
pix=img.load()
blue=0
for y in range(h):
    for x in range(w):
        r,g,b=pix[x,y]
        if b>140 and b>r+20 and b>g+20:
            blue+=1
print('blue_pixels',blue)
