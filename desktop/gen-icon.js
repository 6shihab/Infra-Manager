#!/usr/bin/env node
// Converts assets/favicon.svg → assets/favicon.png (256×256) + assets/favicon.ico
// Required because electron-builder does not accept SVG as an icon source.
const { Resvg } = require('@resvg/resvg-js');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, 'assets', 'favicon.svg');
const pngPath = path.join(__dirname, 'assets', 'favicon.png');
const icoPath = path.join(__dirname, 'assets', 'favicon.ico');

const svg = fs.readFileSync(svgPath);
const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 256 } });
const pngData = resvg.render();
const pngBuffer = pngData.asPng();
fs.writeFileSync(pngPath, pngBuffer);
console.log('Generated assets/favicon.png (256×256)');

// Generate .ico (multi-size) from the PNG using Pillow if available
try {
  execSync(
    `python -c "from PIL import Image; img = Image.open(r'${pngPath}'); img.save(r'${icoPath}', format='ICO', sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])"`,
    { stdio: 'pipe' }
  );
  console.log('Generated assets/favicon.ico (16/32/48/64/128/256)');
} catch {
  console.warn('Skipped .ico generation (Pillow not available)');
}
