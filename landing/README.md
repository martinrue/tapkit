# Tapkit landing page

Self-contained static site: HTML, CSS, one bundled JavaScript file, local images and sounds, credits, and a local unsigned macOS DMG. Nothing in this directory imports files from the desktop app at runtime. No API, CDN, remote fonts, analytics, or server-side processing.

## Preview locally

From this directory:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open <http://127.0.0.1:4173>. Serve over HTTP rather than opening `index.html` with `file://`, because browser audio uses `fetch` for local samples. For local offline use, run the server while disconnected; every instrument still works.

## Play

All ten instruments and seven styles use a copied, isolated version of the desktop renderer and its recorded sounds. Use the displayed keys for the selected instrument whenever the page has focus, at any scroll position, or click an on-screen key or instrument. The first strike unlocks browser audio automatically; there is no start/stop mode and no need to focus the preview first. Playing keys also work while the volume slider or register selector is focused, without moving focus. Text-entry fields, browser shortcuts and background tabs do not trigger notes. Left/right arrows change instruments anywhere on the page and wrap at either end. Page controls have no focus outlines or Tab navigation. Z/X shift registers on melodic instruments. Browser demos have no global shortcuts or recorder; those belong to the Mac app.

Samples load only for the selected instrument. Illustrations are transparent WebP versions of the app artwork; SVG sampler and marimba frames retain live pads/bars. The first keypress or click supplies the visitor gesture required by browsers for audio. No sound plays just from loading the page or selecting an instrument. Notes keep their natural tails. The page respects reduced motion; instrument hit animations also reduce to a simple key flash. The landing page and credits follow the system’s light/dark appearance automatically, including live changes. Instrument styles retain their own materials and colours.

## Download

Run `npm run package` from the **project root** to rebuild the unsigned Apple silicon app, create `release/tapkit.dmg`, and replace `landing/downloads/tapkit.dmg` and its checksum. These generated downloads are Git-ignored. Packaging refreshes the version and latest-release URL in both `config.js` and the HTML fallback from the root `package.json`. No landing JavaScript rebuild is needed.

The download URL is always `https://github.com/martinrue/tapkit/releases/latest/download/tapkit.dmg`. The local DMG is for manually uploading as a GitHub Release asset, rather than for committing or publishing through Pages. Attach it using the name `tapkit.dmg` and publish the release as latest. The link returns 404 until that first release exists. Packaging does not upload anything.

## GitHub Pages / subdomain

Keep `landing/` in the app repository. The root `.github/workflows/pages.yml` workflow publishes the website when committed changes are pushed to `main`, and supports manual runs. First create `martinrue/tapkit` and select **Settings → Pages → Source → GitHub Actions**. Private repositories require a GitHub plan that supports Pages for private repositories. No remote repository has been created by the local setup.

The workflow installs only this directory's development dependencies, checks and builds the browser bundle, then publishes `index.html`, `credits.html`, `config.js`, `.nojekyll`, `ATTRIBUTION.md`, `assets/`, `styles/` and `js/`. It excludes `downloads/`, source code, tests, tooling, documentation and `.artifacts/`. No Electron installation is required on the Pages runner. Internal assets are relative, so the same site works at `/tapkit/` or a custom-domain root.

An optional `landing/CNAME` is also published. Add it only after choosing a hostname and configuring the domain in Pages and DNS. See [GitHub custom domain setup](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site). The workflow publishes the site only; app releases remain manual.

## Edit / rebuild

HTML, CSS, and `config.js` can be edited directly. JavaScript source lives in `src/`; the ready-to-serve bundle is checked in as `js/site.js`.

```sh
npm install
npm run check
npm run build
```

Only esbuild and TypeScript are development dependencies. The root app’s installed dependencies also resolve when building from this checkout. `build.mjs` reads only this directory and also regenerates piano thumbnails with their separate keyboard layer. The copied instrument renderer is intentionally independent of future app changes; sync it deliberately rather than importing the parent app.

The header/footer marks and favicon use static light/dark SVG variants of the app’s waveform identity: black with a white waveform in light mode, and white with a black waveform in dark mode. They switch with the system appearance without JavaScript.

Source adaptations: relative asset URLs, WebP filenames, explicit visitor-controlled AudioContext unlocking, a fallback for browsers without output timestamps, and reduced-motion hit feedback. Desktop settings/IPC are replaced by an in-memory typed bridge. Desktop-only controls are not mounted. Site preferences do not read or change the app’s saved settings.

Audio licenses and modification details are bundled in `assets/audio/`; human-readable attribution is in `credits.html` and `ATTRIBUTION.md`. Keep them with the site.

## Verification

From the parent app checkout, run `node landing/test/run.mjs`. This development-only harness uses its installed Electron, serves this folder on an ephemeral loopback port, and mutes output. It checks all 70 instrument/style combinations, every voice, audio activation, focus and shortcuts, registers, reduced motion, errors/retry, relative hosting paths, static links, and six responsive widths. Results and screenshots are saved to `landing/.artifacts/`. See `VERIFICATION.md` for the completed run. The site needs none of these test tools to run.
