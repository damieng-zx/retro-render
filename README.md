# retro-render

Browser rendering of retro 8/16-bit image formats onto an HTML canvas.

Supported formats:

| Format | Extension | Sizes |
| --- | --- | --- |
| ZX Spectrum screen | `.scr` | 6912 bytes (colour, 256×192) or 6144 bytes (mono bitmap) |
| Atari ST NEOchrome | `.neo` | 32128 bytes (low, medium and high resolution) |
| Atari ST Spectrum 512 | `.spu` | 51104 bytes (320×200, 48 colours per scanline) |
| Atari ST Spectrum 512 compressed | `.spc` | RLE-compressed `.spu` with an `SP` header |
| Amiga IFF ILBM / PBM | `.iff`, `.ilbm`, `.lbm`, `.pbm` | any size; dimensions come from the `BMHD` chunk |

### Amiga IFF ILBM

ILBM is a chunked container, so it is recognised by its `FORM .... ILBM`
(or Deluxe Paint's `PBM `) header rather than by file length. Supported:

- 1-8 bitplanes with a 12-bit (OCS/ECS) or 24-bit (AGA) `CMAP` palette
- uncompressed and ByteRun1/PackBits compressed `BODY` chunks
- Extra Half Brite (64 colours), including files that leave out the CAMG
  bit but have six planes and a 32-colour palette
- HAM6 (4096 colours) and HAM8 (AGA, 8 planes)
- mask planes are skipped and unknown chunks (`CRNG`, `DEST`, `ANNO`, ...)
  are ignored


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
