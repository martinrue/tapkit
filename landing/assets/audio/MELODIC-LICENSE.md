# Trumpet and guitar recordings

Both source libraries are dedicated to the public domain under **CC0 1.0 Universal**.
See `CC0-LICENSE.txt` and https://creativecommons.org/publicdomain/zero/1.0/.

## Trumpet

**VS Chamber Orchestra 2: Community Edition**, recorded by **Sam Gossner and Simon Dalzell**; sample cutting by **Elan Hickler / Soundemote**.

- Source: https://github.com/sgossner/VSCO-2-CE
- License: https://github.com/sgossner/VSCO-2-CE/blob/master/LICENSE
- Original files: `Brass/Trumpet/sus/Sum_SHTrumpet_sus_{F2,A2,C3,D#3,G3,A#3,D4,F4,A4,C5}_v1_rr1.wav`.
- The original naming uses C3 for MIDI 60 (scientific C4). The original SFZ mapping and a spectral check of the C3 recording confirm concert C4. Bundled roots are MIDI 53, 57, 60, 63, 67, 70, 74, 77, 81, 84, named `trumpet-{midi}.wav`.
- Converted to mono 44.1 kHz 16-bit PCM; quiet lead-in trimmed with 0.2 ms preroll; cropped to 800 ms with a 90 ms fade. Runtime nearby-root transposition covers concert E3–C6, by at most two semitones. No loops or synthesized sustain. New notes crossfade the preceding note over 25 ms.

## Guitar

**Spanish classical guitar**, FreePats, version 2019-06-18. Recorded in 2008 and created by **Roberto**, with an AKG Perception 120 microphone; processed for noise reduction in the original bank.

- Project: https://freepats.zenvoid.org/Guitar/acoustic-guitar.html
- Source bank: https://freepats.zenvoid.org/Guitar/SpanishClassicalGuitar/SpanishClassicalGuitar-SFZ%2BFLAC-20190618.7z
- Selected source files are the 39 sample roots in `guitarRoots` in `src/shared/melody.ts`, spanning original `samples/E2.flac` through `samples/C6.flac`. Original SFZ MIDI roots are preserved.
- Bundled as `guitar-{midi}.wav`, mono 44.1 kHz 16-bit PCM; quiet lead-in trimmed with 0.2 ms preroll, recorded tails limited to five seconds, 40 ms final fades. Runtime nearest-root transposition fills missing semitones; the highest E6 is four semitones above the highest C6 sample.
- Six chord buttons schedule four to six individual recorded string notes, 9 ms apart, with the first string at the keypress. Chord samples are not separate recordings; C, D, Em, F, G and Am follow standard six-string guitar voicings. No loops, synthetic oscillators, or synthesized reverb.

### Guitar body tap

`guitar-body-tap.wav` is original percussion created for Tapkit and dedicated under **CC0 1.0 Universal**, separately from the FreePats recordings. Rebuild with `node --import tsx scripts/prepare-guitar-tap.ts` (Node and TypeScript only). The deterministic offline recipe excites a 94 Hz air-cavity resonance and inharmonic wooden plate resonators with one rounded palm-pressure/noise impulse. A separately balanced, short band-limited palm slap restores the wooden impact. Brief 3.7–14.3 ms internal reflections add a hollow enclosure colour, and gentle offline saturation adds impact density without clipped peaks. It is a synthesized approximation of a palm tap on an acoustic guitar, not a field recording or a repitched drum sample. Output is 480 ms of mono 44.1 kHz 16-bit PCM, normalized to 0.85 peak with clean boundaries. Its runtime voice gain is 1.05. Playback uses the same predecoded sample path as all other voices, with no runtime synthesis, pitch sweep, sample loop or long room reverb. It overlaps string notes and chords.

Runtime preparation normalizes sample levels and applies short boundary fades. No endorsement is implied. Reproduce the bundled assets with `node --import tsx scripts/prepare-melodic.ts` (asset preparation requires gh, curl, tar and ffmpeg; the app uses none of those tools).
