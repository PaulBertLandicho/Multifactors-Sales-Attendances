from PIL import Image
import os

root = os.path.join(os.path.dirname(__file__), '..')
public = os.path.join(root, 'public')
img_dir = os.path.join(public, 'image')
src = os.path.join(img_dir, 'logo512.png')
if not os.path.exists(src):
    print('Source image not found:', src)
    raise SystemExit(1)

sizes = [72,96,128,144,152,192,256,384,512]
img = Image.open(src).convert('RGBA')
for s in sizes:
    out = os.path.join(img_dir, f'logo-{s}.png')
    resized = img.resize((s, s), Image.LANCZOS)
    resized.save(out)
    print('Wrote', out)

# create maskable variant for 512 (same image; ideally the artwork should be extended)
maskable_out = os.path.join(img_dir, 'logo-512-maskable.png')
img.resize((512,512), Image.LANCZOS).save(maskable_out)
print('Wrote', maskable_out)

# create favicon.ico with multiple sizes
ico_path = os.path.join(public, 'favicon.ico')
# Pillow will create multiple sizes from the base image
icon_sizes = [(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)]
img.save(ico_path, format='ICO', sizes=icon_sizes)
print('Wrote', ico_path)
