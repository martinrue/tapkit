# Tapkit sampler one-shots

All 25 bundled sampler WAV files are **CC0 1.0 Universal**. See `CC0-LICENSE.txt`.

## Original electronic sounds

Twenty one-shots are generated offline by the deterministic TypeScript recipes
in `scripts/prepare-sampler.ts`: a saturated deep house kick, sub drops, 808 glides, Reese/wobble/
growl basses, rave/supersaw/acid stabs, warm house keys/chords/organ/plucks, risers, impacts,
laser/zap, a slowing tape-stop chord, ring modulation and air horn. They contain no sampled commercial products or song excerpts.
The generated sounds are dedicated under CC0.

## Recorded vocal sources

**hey.wav**, matiasromero, 28 August 2007. CC0.

- Source and license: https://freesound.org/people/matiasromero/sounds/39845/
- Public source media: https://cdn.freesound.org/previews/39/39845_117392-hq.mp3
- SHA-256: `f3b2b947c8039147a873c7b2ca22dd9263b734c42c4cb5881535743cd52f51ca`
- Source already includes delay, chorus and a reversed section. Tapkit extracts
  the opening 0.60 seconds, trims quiet lead-in, normalizes and fades the edit.
- `sampler-vocal-hey.wav`: repitched to 1.12×, with quieter 160/320 ms echoes.

**Yeah (Vocal)**, leonschi13 / DJ N.D.5, 26 September 2011. CC0.

- Source and license: https://freesound.org/people/leonschi13/sounds/129360/
- Public source media: https://cdn.freesound.org/previews/129/129360_1928537-hq.mp3
- SHA-256: `958e81fef5963f59eece6917d8d5b417ffc4b0d7cea9cacdd3e8fcaa44973526`
- Tapkit extracts 1.42–2.38 seconds, trims quiet lead-in, normalizes and fades.
- `sampler-vocal-yeah.wav`: repitched to 0.96× with a quieter 160 ms echo.
- Also used in `sampler-vocal-echo.wav`: repitched to 1.15× with 220/440/660 ms echoes.

**Let's Go (male)**, dastudiospr / Daniel Alvarez, 4 August 2020. CC0.

- Source and license: https://freesound.org/people/dastudiospr/sounds/529817/
- Public media: https://cdn.freesound.org/previews/529/529817_10761583-hq.mp3
- SHA-256: `ee4ae86a8e20cc89feb29fe08ac454cf9373601c6240436919d9733f6d9e354f`
- Extracted 0–1.45 seconds, trimmed quiet lead-in, normalized and faded.
- `sampler-vocal-go.wav`: 1.03× speed with a quiet 160 ms echo.
- `sampler-vocal-go-chop.wav`: five pitched, faded 160 ms chops of the word ending.

The adaptations retain CC0. No endorsement by the original recordists is implied.

## Format and preparation

Mono 44.1 kHz / 16-bit PCM, 0.32–2.5 seconds, with clean boundary fades.
Rebuild using `node --import tsx scripts/prepare-sampler.ts`. Preparation needs ffmpeg;
curl downloads the three public source MP3s if `.artifacts/sampler-vocals/` has no cache.
The app needs no synthesis, decoder tools, downloads or effects processing at runtime.

Pad IDs are stable across bank revisions, independently of sample filenames, so
replacing a factory sound preserves users' custom keys and pad positions.
