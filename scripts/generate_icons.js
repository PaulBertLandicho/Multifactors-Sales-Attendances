const sharp = require('sharp');
let pngToIco = require('png-to-ico');
if (typeof pngToIco !== 'function' && pngToIco && typeof pngToIco.default === 'function') pngToIco = pngToIco.default;
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const imgDir = path.join(publicDir, 'image');
const src = path.join(imgDir, 'logo512.png');

if (!fs.existsSync(src)) {
  console.error('Source image not found:', src);
  process.exit(1);
}

const sizes = [72,96,128,144,152,192,256,384,512];
(async function main(){
  try{
    for (const s of sizes){
      const out = path.join(imgDir, `logo-${s}.png`);
      await sharp(src).resize(s, s).png().toFile(out);
      console.log('Wrote', out);
    }
    const maskableOut = path.join(imgDir, 'logo-512-maskable.png');
    await sharp(src).resize(512,512).png().toFile(maskableOut);
    console.log('Wrote', maskableOut);

    // create favicon.ico from smaller sizes (16..256)
    const icoSizes = [16,32,48,64,128,256];
    // ensure small pngs exist by resizing from src
    for (const s of icoSizes){
      const out = path.join(imgDir, `logo-${s}.png`);
      await sharp(src).resize(s, s).png().toFile(out);
    }
    const pngPaths = icoSizes.map(s => path.join(imgDir, `logo-${s}.png`));
    const icoBuffer = await pngToIco(pngPaths);
    const icoPath = path.join(publicDir, 'favicon.ico');
    fs.writeFileSync(icoPath, icoBuffer);
    console.log('Wrote', icoPath);

  }catch(err){
    console.error(err);
    process.exit(1);
  }
})();
