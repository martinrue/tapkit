# Marimba artwork

The fourteen `assets/art/*-marimba*.svg` frame and thumbnail layers are original vector artwork created for Tapkit. Rebuild with `node --import tsx scripts/prepare-marimba-art.ts` (TypeScript only).

`src/shared/marimba.ts` provides one bar geometry and theme palette for the thumbnails, live CSS buttons and animated mallets. Fifteen natural and ten raised bars use graduated lengths, with resonator tubes, suspension pins, rails and tabletop feet. Body layers omit the bars; their live controls animate individually and retain accurate pointer targets. The alpha of the body layer controls transparent-space click-through, while the bars have their own pointer targets.

Classic has carved rosewood bars and brass resonators; Metal has brushed steel; Neon has dark bars, cyan/magenta trim and luminous mallet heads; Candy has pastel molded bars; Paper uses white cardstock, graphite hatching and folded edges; Gold has polished golden bars and tubes; Cartoon uses flat coral/teal/orange fills and bold ink outlines. The mallet shafts and round heads follow each theme. Both hands remain neutral white, reusing the existing grip sprites, with the separate illustrated pair for Cartoon.

Two mallets move independently. Each begins on the struck bar at the estimated audible onset and rebounds, interrupting its own previous motion during rapid taps. A two-row layout remains fixed as the sounding register changes. Settings previews include the full hand/mallet motion envelope and use the same playable component, without a loop recorder.
