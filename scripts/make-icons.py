# Builds the app icons from Logo.png (icon-only logo on a transparent background).
# Strips the faint dark haze around the artwork (it shows as a grey smudge on the light theme),
# trims to the artwork, centres it in a square and writes every size the app and README use.
# Usage: python scripts/make-icons.py   (needs Pillow and NumPy)
from PIL import Image
import numpy as np

src = Image.open("Logo.png").convert("RGBA")
a = np.array(src).astype(np.float32)
al = a[..., 3]

# Haze is < ~6% opacity; the artwork is solid. Fade the edge between 16 and 64 so it stays anti-aliased.
LOW, HIGH = 16.0, 64.0
ramp = np.clip((al - LOW) / (HIGH - LOW), 0.0, 1.0)
a[..., 3] = al * ramp
clean = Image.fromarray(a.round().astype(np.uint8), "RGBA")

ys, xs = np.where(a[..., 3] > 0)
x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
art = clean.crop((x0, y0, x1, y1))

# Square canvas with a small margin so the artwork never touches the edge of a tab or app icon.
side = int(max(art.size) * 1.04)
sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
sq.paste(art, ((side - art.width) // 2, (side - art.height) // 2), art)

big = sq.resize((512, 512), Image.LANCZOS)
big.save("src/app/icon.png")          # browser tab icon (Next.js <link rel="icon">)
big.save("public/logo-icon.png")      # top-left logo in the app header + README

apple = Image.new("RGBA", (180, 180), (255, 255, 255, 255))  # iOS home-screen icon must be opaque
apple.alpha_composite(sq.resize((160, 160), Image.LANCZOS), (10, 10))
apple.convert("RGB").save("src/app/apple-icon.png")

sq.resize((256, 256), Image.LANCZOS).save(
    "src/app/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
)
print("artwork bbox", (int(x0), int(y0), int(x1), int(y1)), "-> square", side)
