import { ImageFileFormat } from "../Common/FileFormat";

import { SpectrumScreen } from "./Spectrum/Screen";
import { NEOchrome } from "./AtariST/NeoChrome";
import { Spectrum512 } from "./AtariST/Spectrum512";
import { Spectrum512Compressed } from "./AtariST/Spectrum512Compressed";
import { Degas } from "./AtariST/Degas";
import { ILBM } from "./Amiga/ILBM";

export enum Format {
    SpectrumScreen,
    NEOchrome,
    Spectrum512,
    Spectrum512Compressed,
    Degas,
    ILBM
}

const allRenderers = new Map<Format, ImageFileFormat>([
    [Format.SpectrumScreen, new SpectrumScreen()],
    [Format.NEOchrome, new NEOchrome()],
    [Format.Spectrum512, new Spectrum512()],
    [Format.Spectrum512Compressed, new Spectrum512Compressed()],
    [Format.Degas, new Degas()],
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
        case 128128: // NEOchrome virtual canvas (flag 0xBABE, 640x400)
            return getRendererFor(Format.NEOchrome);
        case 51104: // Spectrum 512
            return getRendererFor(Format.Spectrum512);
        case 32034: // DEGAS raw, 34-byte header + screen
        case 32066: // DEGAS raw with the colour-cycling trailer
            return getRendererFor(Format.Degas);
    }

    // Compressed DEGAS (.pc1-.pc3) has no magic and no fixed size, so it is
    // only considered once the formats above have been ruled out.
    if (Degas.IsCompressedFile(buffer))
        return getRendererFor(Format.Degas);

    throw new Error(`Unrecognised file of ${buffer.byteLength} bytes. Supported: .scr 6144/6912, .neo 32128/128128, .spu 51104, .spc, .pi*/.pc*, and IFF ILBM/PBM (.iff, .ilbm, .lbm).`);
}
