# Violin and drum kit recordings

Both libraries are dedicated to the public domain under **CC0 1.0 Universal**.
The full legal text is bundled in `CC0-LICENSE.txt`.

## Violin

VS Chamber Orchestra 2: Community Edition, recorded by Sam Gossner and Simon Dalzell;
sample cutting by Elan Hickler / Soundemote.

- Source: https://github.com/sgossner/VSCO-2-CE
- License: https://github.com/sgossner/VSCO-2-CE/blob/master/LICENSE
- Original recordings: `Strings/Solo Violin/Arco Vib/LLVln_ArcoVib_{G3,A3,C4,E4,G4,A4,C5,E5,G5,A5,C6,E6,G6,A6,C7}_f.wav`.
- Scientific pitch roots are verified against `SViolinVib.sfz` on the original `SFZ` branch (A3 = MIDI 57). Bundled as `violin-{midi}.wav` for roots 55, 57, 60, 64, 67, 69, 72, 76, 79, 81, 84, 88, 91, 93 and 96.
- Converted to mono 44.1 kHz / 16-bit PCM. After detecting the original attack, preparation skips its first 80 ms and removes sub-bass rumble with a 100 Hz, two-pole high-pass filter. Each 2.4-second excerpt receives a 20 ms raised-cosine attack and a 320 ms release, with unclipped peak normalization. Runtime preserves the prepared envelope. Nearby multisample transposition covers G3–E7; E7 is four semitones above the highest C7 recording. No synthesized sustain or looping. Consecutive violin notes crossfade over 50 ms in live and loop playback.

## Drum kit

**Virtuosity Drums**, Versilian Studios / Karoryfer Samples. Performed by **Austin McMahon**
on the house kit at **Virtuosity Musical Instruments**, Boston, MA.

- Source: https://github.com/sfzinstruments/virtuosity_drums
- License: https://github.com/sfzinstruments/virtuosity_drums/blob/master/LICENSE
- Kick: `Samples/kickmic/kick/kickmic_kick_snoff_vl3_rr1.flac`.
- Snare: `Samples/mid/snare/mid_snare_center_vl8.flac` (shared by the two sticking keys).
- Hi-hats: `Samples/mid/hh/mid_hh_{closed,open}_vl3_rr1.flac`.
- Toms: `Samples/mid/{htom,ltom}/mid_{htom,ltom}_center_vl8.flac`.
- Crash: `Samples/mid/crash/mid_crash_crash_vl3_rr1.flac`.
- Ride: `Samples/mid/ride/mid_ride_ride_vl3_rr1.flac`.
- Converted to mono 44.1 kHz / 16-bit PCM, quiet lead-in trimmed with 0.2 ms preroll, natural tails limited to 0.4–4 seconds with 60 ms final fades. The middle rack tom reuses the high-tom recording three semitones lower. The kick plays three semitones lower at voice gain approximately 1.928 (30% above version 0.17.0), giving a deeper, louder hit and about 19% longer decay. Other kit sounds retain recorded pitch. Only the closed hi-hat chokes preceding hi-hat tails with a 25 ms fade; other drum/cymbal tails overlap independently.

Runtime level normalization is shared. Offline-prepared violin envelopes are preserved; drum-kit recordings retain the standard short boundary fades. No endorsement is implied.
Rebuild with `node --import tsx scripts/prepare-violin-drums.ts`; gh and ffmpeg are needed only during asset preparation.
