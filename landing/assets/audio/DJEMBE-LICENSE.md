# Djembe audio license

`djembe-bass.wav` and `djembe-rim.wav` are adaptations of **Djembe bass, tone, tonpalo, slap** by **Michi Henning**, recorded 3 July 2012.

Source: https://commons.wikimedia.org/wiki/File:Djembe_bass,_tone,_tonpalo,_slap.ogg

Original audio: https://upload.wikimedia.org/wikipedia/commons/7/7c/Djembe_bass%2C_tone%2C_tonpalo%2C_slap.ogg

These adapted WAV files are licensed under **Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0)**:

- License deed: https://creativecommons.org/licenses/by-sa/3.0/
- Full terms: https://creativecommons.org/licenses/by-sa/3.0/legalcode

Tapkit modifications: extract bass from 0.055–0.615 s and rim/slap from 3.960–4.493 s; convert to mono 44.1 kHz 16-bit PCM; trim quiet lead-in and fade the final 90 ms / 70 ms. Offline preparation retains the first 40 ms of the audible strike and extends the remaining decay with pitch-preserving `atempo` processing and a 20 ms joining crossfade, for a total duration increase of 15%. Bundled lengths are approximately 0.644 s (bass) and 0.598 s (rim); peaks are normalized without clipping and endings fade to zero. Runtime retains these prepared envelopes and normalizes levels. Tuning remains 1.5 semitones lower for rim/slap, two lower for light bass, and eight lower with higher gain for the centre accent. Lower playback rates naturally lengthen the decay further. No sample looping or synthesized reverb is added.

Rebuild using `node --import tsx scripts/prepare-djembe.ts`. ffmpeg/curl are offline preparation tools only.

Keep the attribution and license with redistributed copies or adaptations. The author does not endorse Tapkit. This license covers these audio files independently of the application code and other assets.
