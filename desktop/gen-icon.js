#!/usr/bin/env node
// Converts assets/favicon.svg → assets/favicon.png (256×256)
// Required because electron-builder does not accept SVG as an icon source.
const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, 'assets', 'favicon.svg');
const pngPath = path.join(__dirname, 'assets', 'favicon.png');

const svg = fs.readFileSync(svgPath);
const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 256 } });
const pngData = resvg.render();
const pngBuffer = pngData.asPng();
fs.writeFileSync(pngPath, pngBuffer);
console.log('Generated assets/favicon.png (256×256)');
