# Builds the favicon / app icons from Logo.png: crops the icon (no wordmark), strips the dark glow, squares it.
# Usage: python scripts/make-icons.py
from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage

src = Image.open("Logo.png").convert("RGBA")
a = np.array(src).astype(np.float32)
rgb, al = a[..., :3], a[..., 3]
v = rgb.max(axis=2)
sat = v - rgb.min(axis=2)

# Icon only: the wordmark starts below row ~750.
region = np.zeros(al.shape, bool)
region[200:720, :] = True

# Solid icon pixels are bright or saturated; the haze is near-black and translucent.
core = ((v > 110) | (sat > 60)) & (al > 128) & region
core = ndimage.binary_fill_holes(ndimage.binary_closing(core, iterations=3))  # keep dark lens interior
core = ndimage.binary_dilation(core, iterations=1)
soft = np.array(Image.fromarray((core * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32)

out = a.copy()
out[..., 3] = np.minimum(al, soft)
icon = Image.fromarray(out.astype(np.uint8), "RGBA")

ys, xs = np.where(out[..., 3] > 8)
x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
icon = icon.crop((x0, y0, x1, y1))
side = int(max(icon.size) * 1.06)
sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
sq.paste(icon, ((side - icon.width) // 2, (side - icon.height) // 2), icon)

big = sq.resize((512, 512), Image.LANCZOS)
big.save("src/app/icon.png")                                   # Next.js <link rel="icon">
big.save("public/logo-icon.png")                               # used in the app header
src.save("public/logo.png")                                    # full logo with wordmark (README / Devpost)
apple = Image.new("RGBA", (180, 180), (255, 255, 255, 255))    # iOS needs an opaque icon
apple.alpha_composite(sq.resize((160, 160), Image.LANCZOS), (10, 10))
apple.convert("RGB").save("src/app/apple-icon.png")
sq.save("src/app/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("icon bbox", (x0, y0, x1, y1), "-> square", side)
