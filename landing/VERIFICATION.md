# Landing page verification

27 October 2026.

- Standalone esbuild bundle and TypeScript check passed.
- All ten instruments in all seven styles: **70 combinations, 1,036 voice triggers**, no unexpected browser errors or missing assets.
- Audio stays suspended before a visitor gesture. The first keypress plays directly without a start/stop control or preview focus. Click play, held-key suppression, modifier shortcuts, and editing controls checked. Offscreen playgrounds do not capture keys.
- Registers checked at their lowest, highest, and default positions. Z/X and left/right cycling checked.
- Matching body/hand styles, rapid replacement of instruments/themes, and sample-load error recovery checked.
- Native keyboard activation of instrument buttons and reduced-motion feedback checked.
- The decorative hero collage and divider are removed. Larger, spaced instrument tiles sit above the preview. Removed the redundant demo caption and playback controls.
- Responsive widths **360, 390, 648, 820, 1024, 1440 px** passed overflow and usable-stage checks. Desktop hero, tablet demo, mobile hero/playground, and the theme showcase visually inspected.
- Real in-app browser: visitor-initiated sound activation and Djembe keyboard input checked. Full playback matrix exercised in Chromium with real decoded local samples; test audio was muted. No subjective listening comparison or separate Firefox run is claimed.
- Static links and credits checked. The site also plays correctly when served at `/nested/tapkit/`, with all runtime assets requested beneath that path.
- The browser site is about **34 MB** including all audio and themes; its JavaScript bundle is about **58 KB**, with images/audio loaded as needed. WebP conversion reduces the artwork from about 84 MB to 8.5 MB, including completed piano thumbnails.
- Local unsigned Apple silicon DMG: **233,110,106 bytes**. `hdiutil verify` passed; SHA-256 is in `downloads/SHA256SUMS`. Existing packaged app version 0.20.0 was used without changing desktop sources or preferences.

Nothing has been published. Configure the DMG’s GitHub Release URL and your chosen domain before deploying; instructions are in `README.md`. The local server’s default relative download URL works now.

## Waveform identity · version 0.20.1

- Header/footer mark and favicon now use the same black waveform on white as the packaged Mac app. The site retains a local SVG copy and remains independent of parent-app files.
- Release metadata and download links point to the refreshed 0.20.1 unsigned Apple silicon DMG. Its size is 233,150,266 bytes; disk-image checksums passed and SHA-256 is recorded in `downloads/SHA256SUMS`.
- The instrument code is unchanged from the completed direct-playback checks above. The previously opened in-app browser tab had been closed, so no new live-site screenshot is claimed.

## Automatic light and dark appearance

- The landing page and credits follow `prefers-color-scheme` with CSS only, including live preference changes. Added matching native-control colour schemes and light/dark browser theme-colour metadata. No toggle, stored preference, script dependency or publishing service is required.
- Use shared appearance tokens for page text, surfaces, picker states, demo labels, playing-key guides, controls, decorative step previews, notices and focus indicators. Give all seven demo backdrops a corresponding dark palette. Download and material showcase cards retain explicit contrasting text colours. Instruments retain their chosen artwork, key materials, animations and bindings.
- Standalone TypeScript check and esbuild build pass. The full Chromium check passes all 70 instrument/style combinations and 1,036 voice triggers, plus existing direct keyboard playback, controls, register cycling, reduced motion, lazy-load error recovery, static links, local download and nested GitHub Pages path checks. No unexpected browser errors or missing assets.
- Added automated appearance checks for both modes and live switching, seven preview palettes, preserved selected artwork/key materials/registers, browser chrome metadata and credits. Representative text and controls pass a 4.5:1 contrast minimum in both appearances. Responsive checks pass 360, 390, 648, 820, 1024 and 1440 pixels; both appearances are additionally captured at 390, 820 and 1440 pixels.
- Visually inspected light/dark desktop heroes, dark desktop and mobile demos, light mobile demo, dark setup section, style showcase, download/FAQ section and credits. Screenshots are under `.artifacts/`. Tests emulate browser appearance with CDP; no separate Safari/Firefox or physical OS mode-switch check is claimed.
- Reused the local preview server and opened its preview in Codex. All changes remain within `landing/`; the desktop app, user preferences and DMG are unchanged. Nothing was published.

## Copy and pale-blue accent

- Updated the hero to “That song you can’t sit still to?” followed by “Put a mini instrument on your desktop and play along.”, retaining the requested line break. Updated the section eyebrow to “Less scrolling. More tapping.” Removed the instrument-picking tagline and preview-focus instruction.
- Replaced the orange brand accent with pale-blue dots and highlights, using a deeper muted blue for large text on light backgrounds. Download highlights, decorative accents and link hover colours share the blue palette. Removed unused note styles and hide the empty register footer for percussion.
- Focused Chromium checks confirm the exact copy, removals, pale-blue dot colour and overflow-free 390/1440px layouts in both appearances. Inspected the updated desktop hero. These are static HTML/CSS changes; instrument playback code and desktop assets are unchanged.

## Blue instrument selection and download heading

- Instrument hover, selected fill, selected borders and keyboard focus now use the pale-blue family in both appearances. Removed the download star and “For the joy of joining in” eyebrow, plus their unused responsive styles. The section starts with “Your playlist could use a little you.”
- Focused Chromium checks pass selected fill/border colours and unchanged responsive fit at 390/1440px in both appearances, after mode transitions settle. Confirmed removed elements and retained heading text; visually inspected the light picker and simplified mobile download card. Static HTML/CSS changes only.

## Leaner copy and unsigned installation FAQ

- Removed the hero footnote, setup/style section descriptions and download release notice. The previously removed download eyebrow remains absent. Removed unused styles and moved the `unsigned` release flag to the new installation FAQ, preventing a removed-notice query from breaking demo startup.
- Added a native expandable FAQ describing DMG installation into Applications and the per-app System Settings → Privacy & Security → Open Anyway process, with a link to Apple’s current guidance at https://support.apple.com/en-us/102445. The FAQ is hidden if release configuration explicitly marks the app as signed.
- Standalone TypeScript check and esbuild build pass. Focused Chromium checks confirm all requested removals, five FAQ entries, the Apple reference link, visible installation instructions, demo readiness and responsive light/dark layouts at 390/1440px. Visually inspected the expanded mobile FAQ. No desktop app or DMG changes.

## Header download and playground link

- Changed the rounded header link to “Download” followed by the same SVG download glyph as the main CTA, with a consistent 6px flex gap on desktop and mobile. Removed the old arrow-span margins. Changed “Try it here ↘” to “Play below ↓”.
- Focused Chromium checks pass labels, matching glyph paths, computed spacing and 390/1440px layouts in both appearances. Visually inspected the mobile header.

## Selection previews and coherent material tints

- Hover and selected instrument tiles share one CSS rule, with identical blue fill, border colour/width and inset border. Removed the separate hover palette. Keyboard focus remains visible.
- Each instrument material now supplies a shared hue/saturation for the complete demo panel: background, edge, accent dot, headings, secondary labels, count, divider, focus indicators and selected theme ring. Light/dark shades derive from that palette; Paper stays neutral grey. Removed the standalone background overrides and root-level purple preview tints. Instrument artwork and the separate keyboard panel are unchanged.
- Standalone type checking and the full Chromium suite pass: 70 instrument/style combinations, 1,036 voice triggers, responsive layouts, static/nested paths and no browser errors. New checks force actual CSS hover and compare it with selection in both appearances; all seven preview palettes share material hues and pass text contrast checks. Near-neutral RGB colours are excluded from hue comparisons because integer RGB rounding makes their hue unstable.
- Visually inspected Gold demo panels in light/dark desktop screenshots; also captured both appearances at mobile width. CSS-only production change.

## Page-wide keyboard playback

- Removed the playground IntersectionObserver and visibility gate. The selected instrument, including the default djembe, accepts mapped keys anywhere on a visible focused page after its samples are ready. The first strike resumes audio; selecting or loading an instrument stays silent.
- Volume sliders and register selectors no longer suppress playing keys. Text inputs, editable text, modifier shortcuts, held-key repeats and background-tab guards remain protected. Keyboard strikes preserve existing focus and scroll position; pointer interactions retain preview focus behavior. Updated browser-demo copy and documentation to match.
- Type checking, static build and the full Chromium suite pass: 70 combinations, 1,036 matrix voice triggers plus added keyboard checks, both appearances and no browser errors. New tests start with the playground below a 600px viewport and play the default instrument from the hero before any click/scroll; verify footer playback without scrolling/focus changes, notes with slider/register focus, text-entry exclusion and immediate keyboard playback after selecting each of the ten instruments. Existing playback, register, control, style and responsive checks pass.
- The previous verification notes about offscreen suppression describe the old behavior and are superseded here. Desktop sources, preferences and downloads are unchanged.

## Annotated copy refinements

- Applied all 19 browser comments: updated headings, descriptions and download copy; removed the preview label; reduced eyebrow-to-heading gaps by 5px consistently.
- Type checking and focused Chromium checks pass for the requested copy, removals, computed spacing and overflow in light/dark modes at 390, 643 and 1440px. Visually inspected sidebar and desktop screenshots.

## Focus-free controls and wrapping instrument shortcuts

- Removed focus outlines, unused focus colours, the skip link, preview focus transfers and the preview's keyboard-click fallback. Static controls and dynamically created instrument/note controls are outside the Tab order. Selection and hover styling remain intact.
- Left/right now cycle through all ten instruments from anywhere on the page, wrapping in both directions and accepting rapid changes while samples load. Note/register bindings, pointer strikes, editing exclusions, shortcut modifiers and repeat suppression remain working.
- Type checking, static build and the full Chromium suite pass: 70 combinations, 1,036 voice triggers, both appearances and six responsive widths. Added checks for both wrap boundaries, cycling from a slider and header link, rapid changes, no Tab stops or focus borders, and playback after cycling. Desktop app sources and downloads are unchanged. Earlier notes about preview focus and keyboard navigation are superseded.

## Adaptive logo and consistent section typography

- Header/footer logos and favicons now select the same static SVG variant by system appearance on both pages: black square/white waveform for light mode; white square/black waveform for dark mode. Uses picture sources and media-qualified favicon links, without JavaScript.
- Removed separate feature-heading font sizes and tracking. All four main section headings share the same responsive typography. Retained font-relative optical alignment offsets for the visible letter edges.
- Type checking and focused Chromium checks pass: live light/dark/light switching, loaded logo sources matching the active favicon on both pages, matching heading sizes and no horizontal overflow at 390, 643, 820 and 1440px. Captured light/dark headers and feature sections for visual review. Earlier references to a fixed white logo plate are superseded.

## Stable installer packaging

- Root `npm run package` now rebuilds the app, produces the Apple silicon installer at `release/tapkit.dmg`, and stages it atomically as `landing/downloads/tapkit.dmg`. It refreshes SHA256SUMS, config.js and the HTML fallback/version from the root package version. Failed builds leave the prior landing download intact. Removed the superseded versioned DMG from landing.
- Root TypeScript check and the complete packaging command pass. Verified the staged copy matches the build artifact and checksum, `hdiutil verify` reports a valid disk image, the app reports version 0.20.4 with LSUIElement enabled, and the local stable download URL returns HTTP 200 with the correct 222,839,291-byte length. No release was uploaded or published.

## Repository and GitHub Pages preparation

- Initialized one local Git repository on main with origin https://github.com/martinrue/tapkit.git. Generated builds, dependencies, installers, checksums, temporary downloads and test artifacts are ignored. Explicitly include both npm lockfiles despite a global ignore rule. Audited the initial source set: no generated downloads or files over GitHub's 100 MiB limit.
- The default and HTML fallback download URLs now use https://github.com/martinrue/tapkit/releases/latest/download/tapkit.dmg. Packaging derives this URL from package.json, preserves it, and still produces an identical, checksummed DMG locally. Repackaging and type checks pass.
- Added a Pages workflow on main pushes/manual dispatch using official GitHub actions. Rehearsed all build/staging commands in an isolated temporary checkout using only landing dependencies: 266 static files, 32,470,717 bytes, with no app source, installers, test data or build tooling. Workflow structure and Git ignore behavior checked. No live deployment or release upload was attempted; the remote repository was not resolvable from this session. Enable Pages with GitHub Actions after creating/accessing the repository. Earlier local-download URL notes are superseded.
