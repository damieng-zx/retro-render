import { ImageDefinition } from "../../Common/ImageDefinition";
import { AtariST, Resolution } from "./AtariST";
import { ImageFileFormat } from "../../Common/FileFormat";

enum Offset {
    Flag,
    Resolution = 2,
    Palette = 4,
    // The palette is 16 words, so everything from the filename on sits 16
    // bytes later than the palette start.
    Filename = 36,
    AnimationLimits = 48,
    AnimationSpeed = 50,
    ColorSteps = 52,
    OffsetX = 54,
    OffsetY = 56,
    Width = 58,
    Height = 60,
    Screen = 128
}

class OffsetCheck {
    constructor(
        public readonly message: string,
        public readonly offset: Offset,
        public readonly test: (word: number) => boolean) {
    }
}

const offsetChecks = new Array<OffsetCheck>(
    new OffsetCheck("flag0 is 0", Offset.Flag, (w) => w === 0),
    new OffsetCheck("resolution", Offset.Resolution, (w) => w <= 2),
    new OffsetCheck("offsetX is 0", Offset.OffsetX, (w) => w === 0),
    new OffsetCheck("offsetY is 0", Offset.OffsetY, (w) => w === 0),
    // The width/height words are documented as unused (always 320/200), but
    // plenty of files leave them zeroed.
    new OffsetCheck("width is 320 or unset", Offset.Width, (w) => w === 320 || w === 0),
    new OffsetCheck("height is 200 or unset", Offset.Height, (w) => w === 200 || w === 0),
)

export class NEOchrome implements ImageFileFormat {
    public GetFileExtensions(): string[] {
        return ['.neo'];
    }

    public GetMatchScore(buffer: ArrayBuffer): number {
        const dv = new DataView(buffer);

        let score = 0;
        if (dv.byteLength === 32128) score += 10;

        for (let check of offsetChecks)
            if (check.test(dv.getInt16(check.offset)))
                score += 10;

        const filename = dv.getAsciiFixed(Offset.Filename, 12);
        if (filename[8] === '.') score += 10;

        return score;
    }

    public GetMetadata(buffer: ArrayBuffer): Map<string, string> {
        const dv = new DataView(buffer);
        const map = new Map<string, string>();

        const palette = [];
        for (let i = 0; i < 16; i++)
            palette.push(dv.getInt16(Offset.Palette + i * 2).toString(2));

        map.set('flag', dv.getUint16(Offset.Flag).toString(16));
        map.set('resolution', Resolution[dv.getUint16(Offset.Resolution)]);
        map.set('palette', palette.join(', '));
        map.set('filename', dv.getAsciiFixed(Offset.Filename, 12));
        map.set('colorSteps', dv.getInt16(Offset.ColorSteps).toString());
        map.set('offsetX', dv.getInt16(Offset.OffsetX).toString());
        map.set('offsetY', dv.getInt16(Offset.OffsetY).toString());
        map.set('width', dv.getInt16(Offset.Width).toString());
        map.set('height', dv.getInt16(Offset.Height).toString());

        return map;
    }

    public GetImageDefinition(buffer: ArrayBuffer): ImageDefinition | null {
        const dv = new DataView(buffer);
        if (dv.getUint16(Offset.Flag) !== 0) return null;
        return AtariST.GetImageDefinition(dv.getInt16(Offset.Resolution));
    }

    public RenderToImageData(buffer: ArrayBuffer, imageData: ImageData): void {
        const dv = new DataView(buffer);

        if (dv.getUint8(0) !== 0)
            throw new Error('Missing flag byte 0x00 at 0x00');

        const mode = <Resolution>dv.getInt16(Offset.Resolution);
        const def = AtariST.GetImageDefinition(mode);
        const pal = AtariST.GetPalette(buffer.slice(Offset.Palette, 16 * 2 + 4), def.colors);

        AtariST.RenderScreen(mode, buffer.slice(Offset.Screen), imageData, pal);
    }
}