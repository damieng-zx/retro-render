import { ImageDefinition } from "../../Common/ImageDefinition";
import { AtariST, Resolution } from "./AtariST";
import { ImageFileFormat } from "../../Common/FileFormat";
import { Color } from "../../Common/Color";

enum Offset {
    Palette = 32000
}

const Scanlines = 199;
const PalettesPerScanline = 3;
const ColorsPerPalette = 16;
const ColorsPerScanline = PalettesPerScanline * ColorsPerPalette;
const ScreenBytes = 320 * 200 / 2;

export class Spectrum512 implements ImageFileFormat {
    public GetFileExtensions(): string[] {
        return ['.spu'];
    }

    public GetMatchScore(buffer: ArrayBuffer): number {
        const dv = new DataView(buffer);

        let score = 0;
        if (dv.byteLength === 51104) score = 100;

        return score;
    }

    public GetMetadata(buffer: ArrayBuffer): Map<string, string> {
        const dv = new DataView(buffer);
        const map = new Map<string, string>();

        const palette = [];
        for (let i = 0; i < 16; i++)
            palette.push(dv.getInt16(Offset.Palette + i * 2).toString(2));

        map.set('resolution', Resolution.Low.toString());
        map.set('palette', palette.join(', '));
        map.set('width', '320');
        map.set('height', '200');

        return map;
    }

    public GetImageDefinition(buffer: ArrayBuffer): ImageDefinition | null {
        const dv = new DataView(buffer);
        if (dv.byteLength !== 51104) return null;
        return AtariST.GetImageDefinition(Resolution.Low);
    }

    public RenderToImageData(buffer: ArrayBuffer, imageData: ImageData): void {
        const dv = new DataView(buffer);

        if (dv.byteLength !== 51104)
            throw new Error(`Incorrect length of ${dv.byteLength} but expected 51104`);

        const palette = Spectrum512.GetPalette(buffer.slice(Offset.Palette));

        // Only the first 32000 bytes are the screen; the rest is palette data.
        // RenderLowResolution walks the whole buffer it is handed, so passing
        // the full file would render past the image and run off the palette.
        Spectrum512.RenderPalettedScreen(buffer.slice(0, ScreenBytes), imageData, palette);
    }

    /**
     * Draws a 320x200 four-bitplane screen using one palette row per scanline.
     * Shared by the uncompressed .spu renderer and the compressed .spc one.
     */
    public static RenderPalettedScreen(screen: ArrayBuffer, imageData: ImageData, palette: Color[]): void {
        if (screen.byteLength !== ScreenBytes)
            throw new Error(`Incorrect screen length of ${screen.byteLength} but expected ${ScreenBytes}`);

        let x = 0;
        let y = 0;
        let absIndex = 0;
        const getColor = (index: number) => {
            const colorIndex = absIndex + Spectrum512.GetPaletteScanlineEntry(x, index);
            // Use the palette row of the scanline being drawn, then advance.
            // Advancing first made the final pixel read row 199, which does not exist.
            if (++x === 320) {
                x = 0;
                absIndex = y++ * ColorsPerScanline;
            }
            return palette[colorIndex];
        };

        AtariST.RenderLowResolution(screen, imageData, getColor);
    }

    private static paletteSlide = [ 1, 5, 21, 25, 41, 45, 61, 65, 81, 85, 101, 105, 121, 125, 141, 145 ];

    public static GetPaletteScanlineEntry(x: number, c: number): number {
        // Some kind of sliding window for the palette.
        // The original algorithm uses inclusive comparisons: a colour changes
        // exactly at x1 and again at x1 + 160, not one pixel after.
        const x1 = Spectrum512.paletteSlide[c];
        if (x >= x1 + 160)
            return c + 32;
        if (x >= x1)
            return c + 16;
        return c;
    }

    public static GetPalette(buffer: ArrayBuffer): Color[] {
        const dv = new DataView(buffer);
        const paletteCount = Scanlines * PalettesPerScanline * ColorsPerPalette;
        const words = new Uint16Array(paletteCount);
        for (let i = 0; i < paletteCount; i++)
            words[i] = dv.getUint16(i * 2, false);
        return Spectrum512.ConvertPalette(words);
    }

    public static ConvertPalette(words: ArrayLike<number>): Color[] {
        const palette = new Array<Color>(words.length);
        for (let i = 0; i < words.length; i++) {
            const entry = words[i];
            const red = entry >> 8 & 7;
            const green = entry >> 4 & 7;
            const blue = entry & 7;
            palette[i] = new Color(red * 32, green * 32, blue * 32);
        }
        return palette;
    }
}