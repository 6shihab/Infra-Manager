# Assets

Place your `icon.ico` file here before building the desktop app.

The icon should be a Windows ICO file containing at minimum 256×256 and 48×48 images.

You can convert the existing `frontend/public/favicon.svg` using a tool like:
- https://convertio.co/svg-ico/
- `magick frontend/public/favicon.svg -resize 256x256 desktop/assets/icon.ico` (ImageMagick)

The build will still succeed without an icon but the app will show a default Electron icon.
