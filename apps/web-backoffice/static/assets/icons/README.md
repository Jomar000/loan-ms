# Shortcut icons

`shortcut-icon.png` is the supplied artwork and source for the current home-screen icons and favicon fallbacks. Preserve the original artwork when regenerating sizes.

- Android: `icon-192.png` and `icon-512.png`.
- Android maskable: `icon-maskable-512.png`, with the artwork centered at 384 pixels on a 512-pixel canvas so it stays inside the maskable safe area.
- iOS: `../../apple-touch-icon.png` at 180 pixels.
- Browser fallbacks: `favicon-32.png`, `../../favicon.png` at 128 pixels, and `../../favicon.ico` with 16-, 32-, and 48-pixel images.

Generated images use the existing `#171717` application background. Update the icon version in `src/app.html` and `static/site.webmanifest` when replacing artwork. The older `app-icon.svg` is not the source for these icons.
