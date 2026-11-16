import { ImageFileFormat } from "../Common/FileFormat";

import { SpectrumScreen } from "./Spectrum/Screen";
import { NEOchrome } from "./AtariST/NeoChrome";
import { Spectrum512 } from "./AtariST/Spectrum512";
import { Spectrum512Compressed } from "./AtariST/Spectrum512Compressed";
import { ILBM } from "./Amiga/ILBM";

export enum Format {
    SpectrumScreen,
    NEOchrome,
    Spectrum512,
    Spectrum512Compressed,
    ILBM
}

const allRenderers = new Map<Format, ImageFileFormat>([
    [Format.SpectrumScreen, new SpectrumScreen()],
    [Format.NEOchrome, new NEOchrome()],
    [Format.Spectrum512, new Spectrum512()],
    [Format.Spectrum512Compressed, new Spectrum512Compressed()],
    [Format.ILBM, new ILBM()]
]);

function getRendererFor(format: Format): ImageFileFormat {
    const renderer = allRenderers.get(format);
    if (!renderer)
        throw new Error(`No renderer registered for ${Format[format]}`);
    return renderer;
}

export function GetRenderer(buffer: ArrayBuffer): ImageFileFormat {
    // IFF files are containers of any length, so they are recognised by their
    // header rather than by size like the fixed-layout formats below.
    if (ILBM.IsILBM(buffer))
        return getRendererFor(Format.ILBM);

    // Spectrum 512 compressed files carry an "SP" header and their own lengths.
    if (Spectrum512Compressed.IsSPC(buffer))
        return getRendererFor(Format.Spectrum512Compressed);

    switch (buffer.byteLength) {
        case 6912:  // Spectrum 48K screen$ (bitmap + attributes)
        case 6144:  // Spectrum bitmap-only screen$
            return getRendererFor(Format.SpectrumScreen);
        case 32128: // NEOchrome
            return getRendererFor(Format.NEOchrome);
        case 51104: // Spectrum 512
            return getRendererFor(Format.Spectrum512);
        default:
            throw new Error(`Unrecognised file of ${buffer.byteLength} bytes. Expected 6144 or 6912 (.scr), 32128 (.neo), 51104 (.spu), a Spectrum 512 compressed (.spc) or an IFF ILBM/PBM (.iff, .ilbm, .lbm).`);
    }
}
