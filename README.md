# retro-render

Browser rendering of retro 8/16-bit image formats onto an HTML canvas.

Supported formats:

| Format | Extension | Sizes |
| --- | --- | --- |
| ZX Spectrum screen | `.scr` | 6912 bytes (colour, 256×192) or 6144 bytes (mono bitmap) |
| Atari ST NEOchrome | `.neo` | 32128 bytes (low, medium and high resolution) |
| Atari ST Spectrum 512 | `.spu` | 51104 bytes (320×200, 48 colours per scanline) |

## Requirements

- [Node.js](https://nodejs.org/) 24 or later
- [pnpm](https://pnpm.io/) (`corepack enable` then `pnpm --version`)

## Build

```sh
pnpm install
pnpm build
```

The TypeScript sources in `src/` are compiled into `dist/combined.js` as a
single SystemJS bundle.

## Run

```sh
pnpm start
```

Then open <http://127.0.0.1:3939/>. The dev server serves files from `src/`
first and the repository root second, so the samples in `samples/` (git-ignored,
bring your own) and the build output in `dist/` are available alongside the
demo page.
