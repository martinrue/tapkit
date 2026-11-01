# Audio and artwork credits

## Piano

**Salamander Grand Piano v3**, recorded by **Alexander Holm**.

- Source: https://archive.org/details/SalamanderGrandPianoV3
- Author/license documentation: https://github.com/sfzinstruments/SalamanderGrandPiano
- MP3 distribution: https://github.com/Tonejs/audio/tree/master/salamander
- License: **Creative Commons Attribution 3.0 Unported**, https://creativecommons.org/licenses/by/3.0/
- Bundled files: 21 MP3 roots spanning C2–C7, every minor third (C, D♯, F♯ and A per octave, plus C7). The original C4, Ds4, Fs4, A4 and C5 files are unchanged. Source filenames and details are in `assets/audio/PIANO-LICENSE.md`; the full source license is bundled as `assets/audio/PIANO-CC-BY-3.0.txt`.
- Changes: MP3s are bundled as distributed by Tone.js; playback skips quiet lead-in below 5% of peak, retains 0.2 ms before the attack, normalizes levels, limits tails to seven seconds, applies short attack/tail fades, and repitches by at most one semitone to cover C2–C7. A 25-note window shifts by octaves; defaults to C4–C6.

The sample license applies independently of Tapkit's application code. No endorsement by the original author is implied.

## Djembe

**Djembe bass, tone, tonpalo, slap**, recorded by **Michi Henning**, 3 July 2012.

- Source: https://commons.wikimedia.org/wiki/File:Djembe_bass,_tone,_tonpalo,_slap.ogg
- Original recording: https://upload.wikimedia.org/wikipedia/commons/7/7c/Djembe_bass%2C_tone%2C_tonpalo%2C_slap.ogg
- License selected from the author's dual-license release: **Creative Commons Attribution-ShareAlike 3.0 Unported**, https://creativecommons.org/licenses/by-sa/3.0/
- Bundled files: `assets/audio/djembe-bass.wav`, `assets/audio/djembe-rim.wav`.
- Changes: extracted isolated bass (0.055–0.615 seconds) and rim/slap (3.960–4.493 seconds), converted to mono 44.1 kHz PCM WAV, and added 90 ms / 70 ms tail fades. Offline preparation trims quiet lead-in, retains the first 40 ms of each strike, and extends its remaining decay without changing pitch, for a 15% increase in total duration. Peaks are normalized without clipping; runtime preserves the prepared envelope and normalizes levels. Runtime tuning lowers rim/slap by 1.5 semitones and light bass by two. The centre accent reuses the bass recording at minus eight semitones with higher gain, naturally lengthening playback. No sample loops or synthesized reverb are added.

The two adapted djembe WAV files are distributed under **CC BY-SA 3.0**. Attribution, source links, and modification details accompany them in `assets/audio/DJEMBE-LICENSE.md`. Their license applies separately from the application code and other assets. No endorsement by the original author is implied.

## Handpan and tambourine

Handpan: **FreePats Hang tuned in D minor**, version 2022-03-30. Performed by Mar, recorded by Gonzalo and Roberto in July 2017, edited by Roberto. Source: https://freepats.zenvoid.org/ChromaticPercussion/hang.html and https://github.com/freepats/hang-D-minor.

Tambourine: **Versilian Community Sample Library**, Versilian Studios / Sam Gossner and contributors. Source and license: https://github.com/sgossner/VCSL.

Both are **CC0 1.0 Universal**, https://creativecommons.org/publicdomain/zero/1.0/. Selected recordings are converted to mono 44.1 kHz PCM with quiet lead-in trimmed and short fades; tambourine shakes/tap are shortened to discrete one-shots. Handpan preserves its original pitches. Full source filenames and changes are in `assets/audio/PERCUSSION-LICENSE.md`, with the dedication in `assets/audio/CC0-LICENSE.txt`. No endorsement is implied.

## Trumpet and guitar

Trumpet: **VS Chamber Orchestra 2: Community Edition**, recorded by Sam Gossner and Simon Dalzell; sample cutting by Elan Hickler / Soundemote. Source and CC0 license: https://github.com/sgossner/VSCO-2-CE.

Guitar: **FreePats Spanish classical guitar**, version 2019-06-18, recorded in 2008 and created by Roberto. Source: https://freepats.zenvoid.org/Guitar/acoustic-guitar.html. CC0 1.0 Universal, https://creativecommons.org/publicdomain/zero/1.0/.

Guitar body percussion: `guitar-body-tap.wav` is an original offline modal/noise synthesis by Tapkit, dedicated under **CC0 1.0 Universal**. Reproduce it with `node --import tsx scripts/prepare-guitar-tap.ts`. This separate 480 ms sample approximates a wooden soundboard tap; it is not a FreePats recording. Preparation details are in `assets/audio/MELODIC-LICENSE.md`.

Recordings are converted to mono PCM, trimmed and faded. Trumpet uses short articulated excerpts; guitar retains recorded decays and layers individual notes for chord strums. Source filenames, octave mapping, preparation and playback changes are in `assets/audio/MELODIC-LICENSE.md`; the full dedication is in `assets/audio/CC0-LICENSE.txt`. No endorsement is implied.

## Artwork

Instrument and hand PNGs in `assets/art/` were generated for Tapkit using OpenAI's built-in image generation tool. See `assets/ARTWORK.md` for the prompt set and composition notes. Piano artwork is clipped to a shared silhouette at render time to remove surrounding generated light haze; the same silhouette is used for mouse hit testing.

The app, menubar and website marks use one minimal black waveform refined from the selected Tapkit image-generation concept. `scripts/icons.ts` contains its canonical vector geometry and generates the app SVG/PNG and transparent 1×/2× menubar template images. No external icon library or runtime image processing is used.

All assets are bundled; the application makes no network requests for audio or artwork.

## Violin and drum kit

Violin: **VS Chamber Orchestra 2: Community Edition**, Sam Gossner and Simon Dalzell; sample cutting by Elan Hickler / Soundemote. CC0 1.0 Universal. Source and license: https://github.com/sgossner/VSCO-2-CE.

Drum kit: **Virtuosity Drums**, Versilian Studios / Karoryfer Samples, performed by Austin McMahon at Virtuosity Musical Instruments, Boston, MA. CC0 1.0 Universal. Source and license: https://github.com/sfzinstruments/virtuosity_drums.

Preparation, original filenames, transposition and playback changes are documented in `assets/audio/VIOLIN-DRUMS-LICENSE.md`. Full legal text is in `assets/audio/CC0-LICENSE.txt`. No endorsement is implied.

## Sampler

Twenty `assets/audio/sampler-*.wav` one-shots are original electronic percussion, bass, synth stabs and effects generated offline by `scripts/prepare-sampler.ts`, dedicated under **CC0 1.0 Universal**.

Five vocal pads adapt three CC0 recordings:

- **hey.wav**, matiasromero (28 August 2007), https://freesound.org/people/matiasromero/sounds/39845/ — used for Hey!. The source already includes delay, chorus and a reversed section; Tapkit crops the opening word, repitches it and adds short echoes/chops.
- **Yeah (Vocal)**, leonschi13 / DJ N.D.5 (26 September 2011), https://freesound.org/people/leonschi13/sounds/129360/ — used for Yeah! and Vox echo. Cropped from the isolated word, trimmed, repitched, normalized and faded, with short echo/chop processing.

- **Let's Go (male)**, dastudiospr / Daniel Alvarez (4 August 2020), https://freesound.org/people/dastudiospr/sounds/529817/ — used for Let's go and Go chop. Trimmed, repitched and faded, with echo/chopping.

See `assets/audio/SAMPLER-LICENSE.md` for exact source media, edits and preparation details, and `assets/audio/CC0-LICENSE.txt` for the full dedication. The app plays bundled one-shots entirely offline. No endorsement is implied.

The fourteen `assets/art/*-sampler*.svg` housing and thumbnail layers are original geometric vector artwork generated by the same script. Live pads use shared material colours with faint per-pad tints in TypeScript/CSS. Sampler hands reuse the existing white piano sprites, with the separate illustrated pair in Cartoon.

## Marimba

**VS Chamber Orchestra 2: Community Edition**, Sam Gossner and Simon Dalzell; sample cutting by Elan Hickler / Soundemote. **CC0 1.0 Universal**. Source and license: https://github.com/sgossner/VSCO-2-CE. The nine recorded roots, octave mapping and preparation are documented in `assets/audio/MARIMBA-LICENSE.md`; the full dedication is in `assets/audio/CC0-LICENSE.txt`. No endorsement is implied.

The fourteen `assets/art/*-marimba*.svg` frame and thumbnail layers are original geometric vector artwork created by `scripts/prepare-marimba-art.ts`. Live bars and mallets use shared geometry and materials in TypeScript/CSS. Hands reuse the existing white grip sprites and illustrated Cartoon pair. See `assets/ARTWORK-MARIMBA.md`.
