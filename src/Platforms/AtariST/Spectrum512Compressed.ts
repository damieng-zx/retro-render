import { ImageDefinition } from "../../Common/ImageDefinition";
import { ImageFileFormat } from "../../Common/FileFormat";
import { Color } from "../../Common/Color";
import { AtariST, Resolution } from "./AtariST";
import { Spectrum512 } from "./Spectrum512";

const HeaderBytes = 12;
const Magic = 0x5350; // "SP"
const Planes = 4;
const Lines = 199;
const BytesPerPlaneLine = 320 / 8;
const BitmapBytes = Planes * Lines * BytesPerPlaneLine;
const PaletteCount = Lines * 3;
const PaletteEntries = 16;

/**
 * Spectrum 512 compressed (*.SPC).
 *
 * A 12-byte header (the "SP" magic, two reserved bytes and the lengths of the
 * compressed bitmap and palette streams) followed by two run-length encoded
 * streams. The bitmap decompresses to 31840 bytes: four bitplanes, each
 * holding scanlines 1-199. Palettes are 597 records of a 16-bit presence mask
 * followed by the 12-bit colours that are present.
 *
 * The .SPS "smooshed" variant shares the magic but uses different record
 * encodings, so a file can only be told apart by its extension; the bitmap
 * and palette validation here rejects a smooshed stream rather than drawing
 * nonsense.
 */
export class Spectrum512Compressed implements ImageFileFormat {
    public GetFileExtensions(): string[] {
        return [".spc"];
    }

    public GetMatchScore(buffer: ArrayBuffer): number {
        return Spectrum512Compressed.IsSPC(buffer) ? 100 : 0;
    }

    public static IsSPC(buffer: ArrayBuffer): boolean {
        if (buffer.byteLength <= HeaderBytes) return false;
        const dv = new DataView(buffer);
        if (dv.getUint16(0, false) !== Magic) return false;
        if (dv.getUint16(2, false) !== 0) return false;
        const dataLength = dv.getUint32(4, false);
        const paletteLength = dv.getUint32(8, false);
        return dataLength > 0
            && paletteLength > 0
            && HeaderBytes + dataLength + paletteLength <= buffer.byteLength;
    }

    public GetMetadata(buffer: ArrayBuffer): Map<string, string> {
        const map = new Map<string, string>();
        map.set("resolution", Resolution.Low.toString());
        map.set("compression", "rle");
        map.set("width", "320");
        map.set("height", "200");
        map.set("palettes", PaletteCount.toString());
        return map;
    }

    public GetImageDefinition(buffer: ArrayBuffer): ImageDefinition | null {
        if (!Spectrum512Compressed.IsSPC(buffer)) return null;
        return AtariST.GetImageDefinition(Resolution.Low);
    }

    public RenderToImageData(buffer: ArrayBuffer, imageData: ImageData): void {
        if (!Spectrum512Compressed.IsSPC(buffer))
            throw new Error("Not a Spectrum 512 compressed (.spc) file");

        const dv = new DataView(buffer);
        const dataLength = dv.getUint32(4, false);
        const paletteLength = dv.getUint32(8, false);

        const bitmap = Spectrum512Compressed.DecompressBitmap(dv, HeaderBytes, dataLength);
        const palette = Spectrum512Compressed.DecompressPalette(dv, HeaderBytes + dataLength, paletteLength);

        Spectrum512.RenderPalettedScreen(Spectrum512Compressed.ToScreen(bitmap), imageData, palette);
    }

    private static DecompressBitmap(dv: DataView, offset: number, length: number): Uint8Array {
        const bitmap = new Uint8Array(BitmapBytes);
        const end = offset + length;
        let position = offset;
        let written = 0;

        while (written < BitmapBytes) {
            if (position >= end)
                throw new Error("Spectrum 512 compressed bitmap ends early");

            const control = (dv.getUint8(position++) << 24) >> 24;
            if (control >= 0) {
                const count = control + 1;
                if (position + count > end || written + count > BitmapBytes)
                    throw new Error("Spectrum 512 compressed bitmap is malformed");
                for (let i = 0; i < count; i++)
                    bitmap[written++] = dv.getUint8(position++);
            } else {
                const count = -control + 2;
                if (position >= end || written + count > BitmapBytes)
                    throw new Error("Spectrum 512 compressed bitmap is malformed");
                bitmap.fill(dv.getUint8(position++), written, written + count);
                written += count;
            }
        }

        return bitmap;
    }

    private static DecompressPalette(dv: DataView, offset: number, length: number): Color[] {
        const words = new Uint16Array(PaletteCount * PaletteEntries);
        const end = offset + length;

        // The documented format requires bit 15 to be clear, but some files set
        // it without storing an entry for colour 15. Try the literal reading
        // first and retry with that bit masked if the stream does not line up.
        for (let attempt = 0; attempt < 2; attempt++) {
            words.fill(0);
            let position = offset;
            let valid = true;

            for (let index = 0; index < PaletteCount && valid; index++) {
                if (position + 2 > end) {
                    valid = false;
                    break;
                }

                let map = dv.getUint16(position, false);
                position += 2;
                if (attempt === 1) map &= 0x7fff;

                for (let entry = 0; entry < PaletteEntries; entry++) {
                    if ((map & (1 << entry)) === 0) continue;
                    if (position + 2 > end) {
                        valid = false;
                        break;
                    }
                    words[index * PaletteEntries + entry] = dv.getUint16(position, false);
                    position += 2;
                }
            }

            if (valid && position === end)
                return Spectrum512.ConvertPalette(words);

            if (attempt === 1)
                break;
        }

        throw new Error("Spectrum 512 compressed palette data is malformed");
    }

    /**
     * The compressed bitmap is ordered by bitplane (all 199 lines of plane 0,
     * then plane 1, ...), while the screen layout the renderer expects
     * interleaves the four planes in 16-pixel groups per scanline.
     */
    private static ToScreen(bitmap: Uint8Array): ArrayBuffer {
        const screen = new Uint8Array(320 * 200 / 2);
        const planeBytes = Lines * BytesPerPlaneLine;

        for (let line = 1; line < 200; line++) {
            for (let group = 0; group < 320 / 16; group++) {
                for (let plane = 0; plane < Planes; plane++) {
                    const source = plane * planeBytes + (line - 1) * BytesPerPlaneLine + group * 2;
                    const target = 160 + (line - 1) * 160 + group * 8 + plane * 2;
                    screen[target] = bitmap[source];
                    screen[target + 1] = bitmap[source + 1];
                }
            }
        }

        return screen.buffer;
    }
}
