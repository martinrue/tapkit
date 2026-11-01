# Handpan and tambourine recordings

Both source libraries are published under **Creative Commons CC0 1.0 Universal**.
The full dedication is in `CC0-LICENSE.txt` and at https://creativecommons.org/publicdomain/zero/1.0/.

## Handpan

FreePats **Hang tuned in D minor**, version 2022-03-30.
Performed by **Mar**, recorded by **Gonzalo and Roberto** in July 2017 at the Medialab-Prado auditorium, Madrid, with a Zoom H1. Edited and processed by Roberto.

- Project: https://freepats.zenvoid.org/ChromaticPercussion/hang.html
- Source: https://github.com/freepats/hang-D-minor
- Selected originals: `samples/{A3,D4,E4,F4,G4,A4,Bb4,C5,D5}_01.flac`.
- Bundled as `handpan-{note}.wav`: mono 44.1 kHz 16-bit PCM; quiet lead-in trimmed with 0.2 ms preroll; short boundary fades. Original pitches and recorded decays retained. No synthetic sustain, loops, or transposition.

## Tambourine

**Versilian Community Sample Library (VCSL)**, by **Versilian Studios / Sam Gossner and contributors**.

- Source: https://github.com/sgossner/VCSL
- License: https://github.com/sgossner/VCSL/blob/master/LICENSE
- Original folder: `Idiophones/Struck Idiophones/Tambourine 1/`.
- Short shake: `Tamb1_Shake_rr1_Mid.wav`, trimmed to 380 ms after the attack.
- Long shake: `Tamb1_Roll_v2_rr1_Mid.wav`, trimmed to an 850 ms one-shot after the attack.
- Accent tap: `Tamb1_Hit_v2_rr1_Mid.wav`, trimmed to 550 ms after the attack.
- Converted to mono 44.1 kHz 16-bit PCM, with 70 ms tail fades; original pitches retained. No looping.

The app normalizes each decoded sample and applies short boundary fades before playback. These credits are provided for provenance; no endorsement is implied. Preparation is reproducible using `scripts/prepare-percussion.ts`.
