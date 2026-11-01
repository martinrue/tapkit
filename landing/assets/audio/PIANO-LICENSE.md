# Piano recordings

**Salamander Grand Piano v3**, recorded by **Alexander Holm**.

- Original source: https://archive.org/details/SalamanderGrandPianoV3
- Author and license: https://github.com/sfzinstruments/SalamanderGrandPiano
- Bundled MP3 distribution: https://github.com/Tonejs/audio/tree/master/salamander
- License: Creative Commons Attribution 3.0 Unported, https://creativecommons.org/licenses/by/3.0/
- Full source license is bundled in `PIANO-CC-BY-3.0.txt`.

Twenty-one original Tone.js MP3 files: `{C,Ds,Fs,A}{2,3,4,5,6}.mp3` and `C7.mp3`. Names use scientific pitch notation: C4 is MIDI 60. Original MP3 bytes are preserved, including the five recordings shipped in earlier Tapkit versions.

Runtime processing removes quiet lead-in below 5% of peak, retains a 0.2 ms preroll, normalizes levels, limits recorded tails to seven seconds and applies short boundary fades. Nearest-root playback repitches by no more than one semitone. No loops, synthesized sustain, effects or additional buffering are added. All roots are predecoded before readiness. The 25-note keyboard shifts by octaves, covers C2–C7 in total, and defaults to C4–C6. Notes in different octaves can overlap within the existing 32-source polyphony limit.

Fetch missing files with `node --import tsx scripts/prepare-piano.ts` (gh is only used during preparation). The application runs offline. This sample license applies separately from Tapkit code and other assets; no endorsement by the original author is implied.
