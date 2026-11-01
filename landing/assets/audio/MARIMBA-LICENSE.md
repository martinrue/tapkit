# Marimba recordings

**VS Chamber Orchestra 2: Community Edition**, recorded by **Sam Gossner and Simon Dalzell**; sample cutting by **Elan Hickler / Soundemote**. Dedicated to the public domain under **CC0 1.0 Universal**.

- Source: https://github.com/sgossner/VSCO-2-CE/tree/master/Percussion/Marimba
- License: https://github.com/sgossner/VSCO-2-CE/blob/master/LICENSE
- Full legal text is bundled in `CC0-LICENSE.txt`.
- Original files: `Percussion/Marimba/Marimba_hit_Outrigger_{C2,G2,B2,F3,C4,G4,B4,F5,C6}_loud_01.wav`.
- Original naming uses C3 for scientific C4. Spectral checks confirm the bundled sounding roots are MIDI 48, 55, 59, 65, 72, 79, 83, 89 and 96 (C3–C7), named `marimba-{midi}.wav`.
- Converted to mono 44.1 kHz 16-bit PCM. Quiet lead-in is removed with a 0.2 ms preroll; 0.2 ms initial and 60 ms final fades avoid clicks. Recorded tails are retained up to seven seconds, with peak normalized to 0.85. No added reverb, synthesis, sample loop, or time stretching.
- Runtime nearby-root transposition fills the three two-octave registers, C3–C5, C4–C6 and C5–C7, by at most three semitones. The original attack and release envelopes are preserved after decoding. All roots preload before playing; notes overlap independently with the existing 128-source cap.

Rebuild with `node --import tsx scripts/prepare-marimba.ts`. Asset preparation requires gh and ffmpeg; the installed app runs entirely offline and needs neither. No endorsement is implied.
