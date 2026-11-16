import { ImageDefinition } from "../../Common/ImageDefinition";
import { ImageFileFormat } from "../../Common/FileFormat";

export enum ILBMMode {
    Indexed,
    ExtraHalfBrite,
    Ham6,
    Ham8
}

// Amiga ViewPort.Modes bits that matter for decoding a still image.
enum ViewportMode {
    ExtraHalfBrite = 0x0080,
    Ham = 0x0800
}

interface ILBMHeader {
    readonly formType: string;
    readonly width: number;
    readonly height: number;
    readonly planes: number;
    readonly masking: number;
    readonly compression: number;
    readonly transparentColor: number;
    readonly xAspect: number;
    readonly yAspect: number;
    readonly pageWidth: number;
    readonly pageHeight: number;
    readonly mode: ILBMMode;
    readonly camg: number;
    readonly palette: Uint8Array;
    readonly bodyOffset: number;
    readonly bodyLength: number;
}

const MaskingNames = ["none", "mask plane", "transparent colour", "lasso"];

/**
 * IFF ILBM (and Deluxe Paint's PBM flavour) still images.
 *
 * Supports uncompressed and ByteRun1 compressed BODY chunks, 1-8 bitplanes,
 * 12-bit OCS/ECS and 24-bit AGA palettes, Extra Half Brite (6 planes, 64
 * colours) and both Hold-And-Modify modes (HAM6 with 6 planes, HAM8 with 8).
 */
export class ILBM implements ImageFileFormat {
    private static readonly headers = new WeakMap<ArrayBuffer, ILBMHeader>();

    public GetFileExtensions(): string[] {
        return [".iff", ".ilbm", ".lbm", ".pbm"];
    }

    public GetMatchScore(buffer: ArrayBuffer): number {
        return ILBM.IsILBM(buffer) ? 100 : 0;
    }

    public static IsILBM(buffer: ArrayBuffer): boolean {
        if (buffer.byteLength < 12) return false;
        const dv = new DataView(buffer);
        if (ILBM.ReadId(dv, 0) !== "FORM") return false;
        const formType = ILBM.ReadId(dv, 8);
        return formType === "ILBM" || formType === "PBM ";
    }

    public GetMetadata(buffer: ArrayBuffer): Map<string, string> {
        const header = ILBM.Parse(buffer);
        const map = new Map<string, string>();

        map.set("format", header.formType === "PBM " ? "IFF PBM" : "IFF ILBM");
        map.set("width", header.width.toString());
        map.set("height", header.height.toString());
        map.set("planes", header.planes.toString());
        map.set("mode", ILBMMode[header.mode]);
        map.set("compression", header.compression === 0 ? "none" : "byteRun1");
        map.set("masking", MaskingNames[header.masking] ?? header.masking.toString());
        map.set("palette", (header.palette.length / 3).toString());
        map.set("aspect", `${header.xAspect}:${header.yAspect}`);
        map.set("page", `${header.pageWidth}x${header.pageHeight}`);
        map.set("transparent", header.transparentColor.toString());
        map.set("camg", `0x${header.camg.toString(16).padStart(4, "0")}`);

        return map;
    }

    public GetImageDefinition(buffer: ArrayBuffer): ImageDefinition | null {
        if (!ILBM.IsILBM(buffer)) return null;
        const header = ILBM.Parse(buffer);
        return new ImageDefinition(header.width, header.height, ILBM.GetColorCount(header));
    }

    public RenderToImageData(buffer: ArrayBuffer, imageData: ImageData): void {
        const header = ILBM.Parse(buffer);
        ILBM.Render(new Uint8Array(buffer), header, imageData);
    }

    private static GetColorCount(header: ILBMHeader): number {
        switch (header.mode) {
            case ILBMMode.Ham6: return 4096;
            case ILBMMode.Ham8: return 262144;
            case ILBMMode.ExtraHalfBrite: return 64;
            default: return 1 << header.planes;
        }
    }

    private static GetMode(planes: number, camg: number, paletteEntries: number): ILBMMode {
        // A 6-plane image with a 32-colour palette cannot be a plain indexed
        // image: indices 32-63 have no palette entries, so they can only be
        // the half-bright half of Extra Half Brite. Some files (including the
        // classic HALFBRITETEST.lbm) omit the CAMG bit that announces it.
        if (planes === 6 && ((camg & ViewportMode.ExtraHalfBrite) !== 0 || paletteEntries === 32))
            return ILBMMode.ExtraHalfBrite;
        if ((camg & ViewportMode.Ham) !== 0)
            return planes > 6 ? ILBMMode.Ham8 : ILBMMode.Ham6;
        return ILBMMode.Indexed;
    }

    private static Parse(buffer: ArrayBuffer): ILBMHeader {
        const cached = ILBM.headers.get(buffer);
        if (cached) return cached;

        if (!ILBM.IsILBM(buffer))
            throw new Error("Not an IFF ILBM or PBM file");

        const dv = new DataView(buffer);
        const declaredEnd = dv.getUint32(4, false) + 8;
        const formEnd = declaredEnd >= 12 && declaredEnd <= buffer.byteLength
            ? declaredEnd
            : buffer.byteLength;

        let bitmapHeader = -1;
        let paletteOffset = -1;
        let paletteLength = 0;
        let camg = 0;
        let bodyOffset = -1;
        let bodyLength = 0;

        let offset = 12;
        while (offset + 8 <= formEnd) {
            const id = ILBM.ReadId(dv, offset);
            const size = dv.getUint32(offset + 4, false);
            const data = offset + 8;

            if (data + size > formEnd)
                throw new Error(`ILBM chunk ${id} runs past the end of the file`);

            switch (id) {
                case "BMHD":
                    if (bitmapHeader < 0) bitmapHeader = data;
                    break;
                case "CMAP":
                    if (paletteOffset < 0) {
                        paletteOffset = data;
                        paletteLength = size;
                    }
                    break;
                case "CAMG":
                    if (size >= 4) camg = dv.getUint32(data, false);
                    break;
                case "BODY":
                    if (bodyOffset < 0) {
                        bodyOffset = data;
                        bodyLength = size;
                    }
                    break;
            }

            offset = data + size + (size & 1);
        }

        if (bitmapHeader < 0)
            throw new Error("ILBM is missing its BMHD chunk");
        if (bodyOffset < 0)
            throw new Error("ILBM is missing its BODY chunk");

        const width = dv.getUint16(bitmapHeader, false);
        const height = dv.getUint16(bitmapHeader + 2, false);
        const planes = dv.getUint8(bitmapHeader + 8);
        const masking = dv.getUint8(bitmapHeader + 9);
        const compression = dv.getUint8(bitmapHeader + 10);

        if (width === 0 || height === 0)
            throw new Error(`ILBM has an invalid size of ${width}x${height}`);
        if (planes < 1 || planes > 8)
            throw new Error(`ILBM has an unsupported ${planes} bitplanes`);
        if (compression !== 0 && compression !== 1)
            throw new Error(`ILBM has an unsupported compression type ${compression}`);

        const palette = paletteOffset >= 0
            ? ILBM.ReadPalette(dv, paletteOffset, paletteLength)
            : new Uint8Array(0);

        const header: ILBMHeader = {
            formType: ILBM.ReadId(dv, 8),
            width: width,
            height: height,
            planes: planes,
            masking: masking,
            compression: compression,
            transparentColor: dv.getUint16(bitmapHeader + 12, false),
            xAspect: dv.getUint8(bitmapHeader + 14),
            yAspect: dv.getUint8(bitmapHeader + 15),
            pageWidth: dv.getInt16(bitmapHeader + 16, false),
            pageHeight: dv.getInt16(bitmapHeader + 18, false),
            mode: ILBM.GetMode(planes, camg, Math.floor(palette.length / 3)),
            camg: camg,
            palette: palette,
            bodyOffset: bodyOffset,
            bodyLength: bodyLength
        };

        ILBM.headers.set(buffer, header);
        return header;
    }

    private static ReadId(dv: DataView, offset: number): string {
        if (offset + 4 > dv.byteLength) return "";
        return String.fromCharCode(
            dv.getUint8(offset),
            dv.getUint8(offset + 1),
            dv.getUint8(offset + 2),
            dv.getUint8(offset + 3));
    }

    private static ReadPalette(dv: DataView, offset: number, length: number): Uint8Array {
        const bytes = Math.floor(length / 3) * 3;
        const palette = new Uint8Array(bytes);

        // ECS palettes store 4 bits per component, AGA palettes 8. Anything
        // wider than 15 can only have come from an AGA file.
        let eightBit = false;
        for (let i = 0; i < bytes; i++) {
            const value = dv.getUint8(offset + i);
            palette[i] = value;
            if (value > 15) eightBit = true;
        }

        if (!eightBit)
            for (let i = 0; i < bytes; i++)
                palette[i] = palette[i] * 17;

        return palette;
    }

    private static Render(buffer: Uint8Array, header: ILBMHeader, imageData: ImageData): void {
        const rowBytes = ((header.width + 15) >> 4) << 1;
        const maskPlanes = header.masking === 1 ? 1 : 0;
        const planesPerRow = header.planes + maskPlanes;
        const body = new ILBMBody(buffer, header.bodyOffset, header.bodyLength, header.compression === 1);
        const rows: Uint8Array[] = [];
        for (let p = 0; p < planesPerRow; p++)
            rows.push(new Uint8Array(rowBytes));

        const palette = header.palette;
        const colorAt = (index: number): number => {
            const c = index * 3;
            return c + 2 < palette.length
                ? (palette[c] << 16) | (palette[c + 1] << 8) | palette[c + 2]
                : 0;
        };

        const data = imageData.data;
        const width = imageData.width;

        for (let y = 0; y < header.height; y++) {
            for (let p = 0; p < planesPerRow; p++)
                body.ReadRow(rows[p]);

            let red = 0, green = 0, blue = 0;
            if (header.mode === ILBMMode.Ham6 || header.mode === ILBMMode.Ham8) {
                // HAM starts each scanline from colour register 0.
                const start = colorAt(0);
                red = (start >> 16) & 255;
                green = (start >> 8) & 255;
                blue = start & 255;
            }

            let o = y * width * 4;
            for (let x = 0; x < header.width; x++) {
                const byte = x >> 3;
                const bit = 7 - (x & 7);
                let index = 0;
                for (let p = 0; p < header.planes; p++)
                    index |= ((rows[p][byte] >> bit) & 1) << p;

                switch (header.mode) {
                    case ILBMMode.ExtraHalfBrite: {
                        const half = index >= 32;
                        const color = colorAt(half ? index - 32 : index);
                        red = (color >> 16) & 255;
                        green = (color >> 8) & 255;
                        blue = color & 255;
                        if (half) {
                            red >>= 1;
                            green >>= 1;
                            blue >>= 1;
                        }
                        break;
                    }
                    case ILBMMode.Ham6: {
                        const control = index & 0x30;
                        if (control === 0) {
                            const color = colorAt(index & 0x0f);
                            red = (color >> 16) & 255;
                            green = (color >> 8) & 255;
                            blue = color & 255;
                        } else {
                            const value = (index & 0x0f) * 17;
                            if (control === 0x10) blue = value;
                            else if (control === 0x20) red = value;
                            else green = value;
                        }
                        break;
                    }
                    case ILBMMode.Ham8: {
                        const control = index & 0xc0;
                        if (control === 0) {
                            const color = colorAt(index & 0x3f);
                            red = (color >> 16) & 255;
                            green = (color >> 8) & 255;
                            blue = color & 255;
                        } else {
                            const sixBit = index & 0x3f;
                            const value = (sixBit << 2) | (sixBit >> 4);
                            if (control === 0x40) blue = value;
                            else if (control === 0x80) red = value;
                            else green = value;
                        }
                        break;
                    }
                    default: {
                        const color = colorAt(index);
                        red = (color >> 16) & 255;
                        green = (color >> 8) & 255;
                        blue = color & 255;
                        break;
                    }
                }

                data[o++] = red;
                data[o++] = green;
                data[o++] = blue;
                data[o++] = 255;
            }
        }
    }
}

/**
 * Walks the BODY chunk one bitplane row at a time, expanding ByteRun1
 * (PackBits) runs as it goes. Every plane row is compressed independently.
 */
class ILBMBody {
    private readonly bytes: Uint8Array;
    private position = 0;
    private readonly end: number;

    constructor(buffer: Uint8Array, offset: number, length: number, private readonly compressed: boolean) {
        const start = Math.max(0, Math.min(offset, buffer.length));
        const size = Math.max(0, Math.min(length, buffer.length - start));
        this.bytes = buffer.subarray(start, start + size);
        this.end = this.bytes.length;
    }

    public ReadRow(target: Uint8Array): void {
        if (!this.compressed) {
            if (this.position + target.length > this.end)
                throw new Error("ILBM body is truncated");
            target.set(this.bytes.subarray(this.position, this.position + target.length));
            this.position += target.length;
            return;
        }

        let written = 0;
        while (written < target.length) {
            if (this.position >= this.end)
                throw new Error("ILBM body is truncated");

            const control = (this.bytes[this.position++] << 24) >> 24;
            if (control >= 0) {
                const count = control + 1;
                if (this.position + count > this.end || written + count > target.length)
                    throw new Error("ILBM body is malformed");
                target.set(this.bytes.subarray(this.position, this.position + count), written);
                this.position += count;
                written += count;
            } else if (control !== -128) {
                const count = 1 - control;
                if (this.position >= this.end || written + count > target.length)
                    throw new Error("ILBM body is malformed");
                target.fill(this.bytes[this.position++], written, written + count);
                written += count;
            }
        }
    }
}
