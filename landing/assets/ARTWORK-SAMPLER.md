# Sampler artwork

`scripts/prepare-sampler.ts` creates original transparent SVG panels for all seven styles. Each has a square housing, five rows of five pad recesses, corner fasteners and material details. There are two assets per theme: `*-sampler-body.svg` omits pad faces so interactive CSS controls can animate independently; `*-sampler.svg` includes all pad faces for the Settings theme cards.

Geometry and pad colours come from `src/shared/sampler.ts`; the live controls and thumbnail faces use the same coordinates. The SVGs have a 1024 × 1024 viewBox with transparent margins. Alpha-based mouse hit testing uses the body silhouette, just as it does for the PNG instruments.

- Classic: warm walnut grain, brass trim and subtly tinted walnut pads.
- Metal: cool brushed steel, chrome edge and subtly tinted steel pads.
- Neon: charcoal case, mint/pink trim and dark pads with faint tinted illumination.
- Candy: pastel lavender shell, rounded soft buttons and sugary highlights.
- Paper: layered white stock with clean rounded corners, clipped graphite sketch lines and nearly white paper pads with a faint colour wash.
- Gold: reflective gold case, brass recesses and polished gold pads with very subtle colour variation.
- Cartoon: flat turquoise case, heavy dark outlines and subtly tinted turquoise cel-shaded pads.

The two existing piano pointing-hand sprites stay white. Cartoon uses the separate outlined cartoon pair. Each hand follows the most recent pad in its half of the bank; individual pads animate independently during chords and rapid taps.

All pad colours are small RGB blends over a shared material palette; Gold uses 5.5% tint and Paper 2.5%. Light, face and shadow layers retain the same material. Rebuild without image-generation services or graphics dependencies (ffmpeg and a first-run vocal download are used for the accompanying audio bank):

```sh
node --import tsx scripts/prepare-sampler.ts
```

Refresh artwork without rebuilding or downloading sounds:

```sh
node --import tsx scripts/prepare-sampler.ts --art-only
```
