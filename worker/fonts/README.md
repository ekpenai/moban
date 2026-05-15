Put poster fonts in this directory for deterministic server-side rendering.

Recommended fonts:
- `SIMPFXO.TTF`
- `URDTYPE.TTF`
- `URDTYPEB.TTF`

The worker will auto-register any `.ttf`, `.otf`, `.woff`, or `.woff2` file
found here via `@font-face` before rendering posters in Puppeteer.
