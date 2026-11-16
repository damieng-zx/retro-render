import { ImageDefinition } from "../../Common/ImageDefinition";
import { ImageFileFormat } from "../../Common/FileFormat";
import { AtariST, Resolution } from "./AtariST";

enum Offset {
    Format = 0,
    Palette = 2,
    Screen = 34
}

const RawSize = Offset.Screen + 32000;          // 32034
const RawWithTrailerSize = RawSize + 32;        // 32066
const CompressedFlag = 0x8000;
const UncompressedBytes = 32000;

/**
 * DEGAS / DEGAS Elite still images: .pi1-.pi3 raw and .pc1-.pc3 PackBits
 * compressed, in low (320x200x16), medium (640x200x4) and high (640x400x2)
 * resolution.
 *
 * The compressed stream expands to the same 32000 bytes of screen memory but
 * is ordered a whole bitplane at a time within each scanline, so it has to be
 * re-interleaved into the ST's 16-pixel block layout before rendering.
 */
export class Degas implements ImageFileFormat {
    public GetFileExtensions(): string[] {
        return [".pi1", ".pi2", ".pi3", ".pc1", ".pc2", ".pc3"];
    }

    public GetMatchScore(buffer: ArrayBuffer): number {
        return Degas.LooksLike(buffer) ? 100 : 0;
    }

    public static LooksLike(buffer: ArrayBuffer): boolean {
        if (buffer.byteLength < Offset.Screen) return false;
        const dv = new DataView(buffer);
        const format = dv.getUint16(Offset.Format, false);
        if (Degas.GetMode(format) > 2) return false;
        if (Degas.IsCompressed(format))
            return true;
        return buffer.byteLength === RawSize || buffer.byteLength === RawWithTrailerSize;
    }

    /**
     * Compressed files have no magic and no fixed size (some incompressible
     * high-resolution images are larger than the raw form), so GetRenderer
     * only consults this after ruling out the fixed-size formats.
     */
    public static IsCompressedFile(buffer: ArrayBuffer): boolean {
        if (buffer.byteLength < Offset.Screen) return false;
        const dv = new DataView(buffer);
        const format = dv.getUint16(Offset.Format, false);
        return Degas.GetMode(format) <= 2 && Degas.IsCompressed(format);
    }

    public GetMetadata(buffer: ArrayBuffer): Map<string, string> {
        const dv = new DataView(buffer);
        const format = dv.getUint16(Offset.Format, false);
        const definition = AtariST.GetImageDefinition(Degas.GetMode(format));
        const map = new Map<string, string>();

        map.set("resolution", Resolution[Degas.GetMode(format)]);
        map.set("compression", Degas.IsCompressed(format) ? "byteRun1" : "none");
        map.set("width", definition.width.toString());
        map.set("height", definition.height.toString());
        map.set("palette", definition.colors.toString());

        return map;
    }

    public GetImageDefinition(buffer: ArrayBuffer): ImageDefinition | null {
        if (!Degas.LooksLike(buffer)) return null;
        const dv = new DataView(buffer);
        return AtariST.GetImageDefinition(Degas.GetMode(dv.getUint16(Offset.Format, false)));
    }

    public RenderToImageData(buffer: ArrayBuffer, imageData: ImageData): void {
        if (!Degas.LooksLike(buffer))
            throw new Error("Not a DEGAS or DEGAS Elite image");

        const dv = new DataView(buffer);
        const format = dv.getUint16(Offset.Format, false);
        const mode = Degas.GetMode(format);
        const definition = AtariST.GetImageDefinition(mode);

        const palette = AtariST.GetPalette(buffer.slice(Offset.Palette, Offset.Palette + 32), definition.colors);

        const screen = Degas.IsCompressed(format)
            ? Degas.Decompress(dv, definition)
            : Degas.ReadUncompressed(buffer);

        AtariST.RenderScreen(mode, screen, imageData, palette);
    }

    // The format word only defines the low two bits; bit 15 marks compressed
    // data and other bits are reserved for future use.
    private static GetMode(format: number): number {
        return format & 0x0003;
    }

    private static IsCompressed(format: number): boolean {
        return (format & CompressedFlag) !== 0;
    }

    private static ReadUncompressed(buffer: ArrayBuffer): ArrayBuffer {
        if (buffer.byteLength < Offset.Screen + UncompressedBytes)
            throw new Error(`DEGAS image is ${buffer.byteLength} bytes but should hold 32000 bytes of pixels`);
        return buffer.slice(Offset.Screen, Offset.Screen + UncompressedBytes);
    }

    private static Decompress(dv: DataView, definition: ImageDefinition): ArrayBuffer {
        const planes = definition.colors === 16 ? 4 : definition.colors === 4 ? 2 : 1;
        const blocks = definition.width >> 4;
        const planeBytes = blocks * 2;
        const rowBytes = planeBytes * planes;
        const screenBytes = definition.height * rowBytes;

        // PackBits expands to one bitplane after another within each scanline.
        const packed = new Uint8Array(screenBytes);
        let written = 0;
        let position = Offset.Screen;
        const end = dv.byteLength;

        while (written < screenBytes) {
            if (position >= end)
                throw new Error("DEGAS compressed image ends early");

            const control = dv.getUint8(position++);
            if (control < 128) {
                const count = control + 1;
                if (position + count > end || written + count > screenBytes)
                    throw new Error("DEGAS compressed image is malformed");
                for (let i = 0; i < count; i++)
                    packed[written++] = dv.getUint8(position++);
            } else if (control > 128) {
                const count = 257 - control;
                if (position >= end || written + count > screenBytes)
                    throw new Error("DEGAS compressed image is malformed");
                packed.fill(dv.getUint8(position++), written, written + count);
                written += count;
            }
            // 128 is a no-op filler.
        }

        // Re-interleave into the ST screen layout: within every 16-pixel block
        // the four plane words sit together, while the packed data keeps each
        // plane's whole row contiguous.
        const screen = new Uint8Array(screenBytes);
        for (let row = 0; row < definition.height; row++) {
            for (let block = 0; block < blocks; block++) {
                for (let plane = 0; plane < planes; plane++) {
                    const source = row * rowBytes + plane * planeBytes + block * 2;
                    const target = row * rowBytes + block * planes * 2 + plane * 2;
                    screen[target] = packed[source];
                    screen[target + 1] = packed[source + 1];
                }
            }
        }

        return screen.buffer;
    }
}
