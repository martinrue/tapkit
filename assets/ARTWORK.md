# Tapkit artwork

Generated with the built-in `image_gen` tool using actual transparent-background output. Final project assets are in `assets/art/`; original generations remain in Codex's generated-images directory. No image API key is required to build or run Tapkit.

Current styles are Classic, Metal, Neon, Candy, Paper, Gold, and Cartoon. Ceramic and Terrarium were retired. See [ARTWORK-V0.6.md](ARTWORK-V0.6.md) for Cartoon and its matching hand sprites, and [ARTWORK-V0.5.md](ARTWORK-V0.5.md) for earlier styles and shortened-finger edit prompts.

## Earlier prompt set

### Classic djembe (formerly Studio)

Production game asset for a tiny desktop music toy, actual transparent background. A single exquisite miniature West African djembe drum, warm carved walnut goblet shell, thin dark woven rope tuning, ivory goat-skin head, tasteful brass details. Polished tactile 3D toy product render, soft studio light, ambient self-shadow only. Straight-on symmetric front view from 25 degrees above so the oval drumhead is fully visible. Drum alone, centered, occupies 85% of square canvas. No hands, floor, pedestal, background, text, or decorations outside the instrument. Clean isolated alpha cutout.

### Candy djembe

Edit the Studio djembe. Preserve its exact silhouette, geometry, pixel position, camera angle and framing. Change materials to lavender matte vinyl shell, blush pink tuning ropes, pale mint metal accents, and warm cream skin. Premium polished pastel collectible. Preserve alpha; no floor, surrounding glow, background, hands, or text.

### Neon djembe

Edit the Studio djembe. Preserve its exact silhouette, geometry, camera angle, placement and framing. Charcoal satin shell, dark drum skin, electric turquoise cords, violet metal highlights, fine luminous turquoise lines on the geometric carving. Restrained electronic toy styling with no external bloom, floor, background, hands, or text. Preserve alpha.

### Classic piano (formerly Studio)

Production asset for a desktop music toy. A miniature one-octave upright toy piano housing with no keys installed: a clean empty rectangular recessed dark keyboard bed for separately animated keys. Walnut case, softly rounded edges, ivory details, tiny brass music emblem, no lettering. Polished tactile 3D render, soft studio light. Symmetric straight-on orthographic view slightly from above, wide horizontal key recess, no side perspective. Wide compact proportions, entire piano including short feet centered. No hands, floor, background, or text. Isolated transparent cutout, landscape composition.

Follow-up extraction requested removal of surrounding brown haze, reflected floor light, gradient, and cast shadows while preserving housing and the empty recess. A deterministic render-time silhouette additionally removes residual haze outside the instrument.

### Candy piano

Edit Studio piano materials only: pastel lavender and blush pink matte vinyl, mint green trim, pale cream emblem. Preserve exact outline, camera angle, empty black keyboard recess, position, aspect ratio, shape and proportions. No keys, hands, lettering, new objects, floor, glow, or backdrop. Transparent background.

### Neon piano

Edit Studio piano materials only: charcoal satin, turquoise luminous trim, violet emblem, tiny cyan highlights. Preserve exact outline, camera angle, empty dark keyboard recess, position, aspect ratio, shape and proportions. No keys, hands, lettering, new objects, external glow, floor, backdrop, or reflected light. Transparent background.

### Metal djembe

Edit the Classic djembe. Preserve exact outer silhouette, oval drumhead, camera, proportions, object position and framing. Replace all wood with cold brushed stainless steel and polished chrome. Gunmetal head, machined silver hoops, metallic tension cables where the ropes were, dark hex bolts, black rubber joins, horizontal brushed texture and geometric steel engravings. Silver, pewter and black only. Premium tactile miniature 3D asset. Actual transparent background; no hands, floor, haze, backdrop, exterior shadow, text, wood, gold or colored lights.

### Retired Ceramic djembe

Edit the Classic djembe. Preserve exact silhouette, geometry, oval drumhead, camera, placement and framing. Glossy white porcelain shell with bold hand-painted cobalt botanical leaves and scalloped tile patterns. Deep cobalt tuning cords, white head with thin blue border, porcelain base rim. Distinct blue-and-white glazed pottery, with artisan brush patterns concentrated on the lower goblet foot and body. Transparent alpha cutout; no wood grain, hands, pedestal, floor, haze, glow, text or extra objects.

### Metal piano

Edit the Classic piano housing. Preserve exact outline, geometry, camera, proportions, placement, image aspect ratio and framing. Keep the wide horizontal empty dark keyboard recess at the original position; draw no keys. Replace all wood, feet, emblem and trim with cold brushed stainless steel, polished chrome edges, pewter panels, black recessed fasteners and small dark hex bolts. Horizontal silver grain, crisp metallic highlights, industrial machined grooves in the original decoration positions. Silver, gunmetal and black only. Actual transparent cutout outside the instrument and between feet; remove surrounding haze, floor, reflected light and shadows. No hands, keys, text, wood, gold or colored LEDs.

### Retired Ceramic piano

Edit the Classic piano housing. Preserve exact silhouette, geometry, camera, proportions, position, canvas aspect ratio and framing. Keep the same wide horizontal empty black keyboard recess; draw no keys. Glossy brilliant white porcelain housing and feet, bold hand-painted cobalt botanical leaves and floral tile brush patterns on the front panel around a blue lyre emblem, fine cobalt top and bottom borders. Distinct blue-and-white artisan pottery with glazed ceramic reflections; no woodgrain, gold, pastel lavender or neon. Actual transparent alpha cutout outside silhouette and between feet, no haze, floor, glow, hands, keys, text or extra objects. Keep registration so the existing interactive keys fit.

### Replacement drum hand

Production sprite for a small desktop music toy, actual transparent background. Exactly one anatomically correct left hand, back visible, wrist at top and fingers pointing vertically down. Five digits total: exactly four long fingers (little, ring, middle, index) plus one thumb projecting toward viewer right. Count and verify four long fingertips at bottom and one short thumb on right. No sixth digit. Four long fingers gently separated, natural lengths. Soft white matte silicone/vinyl sculpt, cool neutral white with soft gray self shading, no skin beige, color tint, fingernails or excessive wrinkles. Short rounded wrist stump, no cuff/ring/glove seams. Polished friendly 3D toy, orthographic back view, fingers relaxed to pat a drum. Hand centered, filling 85% of portrait canvas. No instrument, arm, second hand, floor, text or decorative objects.

### Replacement piano hand

Production sprite, actual transparent background. Exactly one white left hand pointing down to play a piano key. Polished friendly 3D matte white silicone toy, back visible, wrist stump at top. Index extended vertically down, tip at approximately x=61%, y=94% of canvas. Three other fingers (middle, ring, little) naturally folded into palm left of index; one thumb visible to viewer right. Five digits total: one extended index, three curled fingers, one thumb. No extra digits, duplicated fingers or knuckles. Pure cool neutral white with soft gray self shading, no beige or colored reflection, slim elegant contours, no oversized puffy glove. No cuff, fingernails, arm, second hand, piano, text or objects. Centered on portrait canvas, completely visible with clean transparent margins. No exterior glow, halo, drop shadow, vignette, gray haze or floor.

### Hand extraction follow-up (both sprites)

Background extraction only: remove the entire surrounding glow/vignette, extracting the solid white physical hand and its five digits. Everything immediately outside its precise silhouette must have alpha zero. Preserve pose, five-digit anatomy, white material, internal gray shading, pixel position, portrait dimensions and framing. Preserve transparent finger gaps; clean antialiased cutout. No exterior glow, blurred edges, fuzzy white haze, gray shadow, background gradient or new objects. Composite onto dark colors without a surrounding cloud.

## Saved assets

The built-in `image_gen` tool produced the final project-bound assets; no CLI/API fallback was used.

- `assets/art/classic-djembe.png`, `classic-piano.png`: original wooden artwork, renamed from Studio.
- `assets/art/metal-djembe.png`, `metal-piano.png`: new brushed steel and chrome variants.
- `assets/art/neon-djembe.png`, `neon-piano.png`: existing charcoal and luminous trim variants.
- `assets/art/candy-djembe.png`, `candy-piano.png`: existing pastel vinyl variants.
- `assets/art/paper-djembe.png`, `paper-piano.png`: white paper sculpture with black sketch marks, replacing Ceramic.
- `assets/art/gold-djembe.png`, `gold-piano.png`: polished gold variants.
- `assets/art/cartoon-djembe.png`, `cartoon-piano.png`: illustrated instruments with bold outlines and cel colors.
- `assets/art/hand-drum-cartoon.png`, `hand-piano-cartoon.png`: white illustrated hands used only by Cartoon.
- Retired Terrarium artwork is archived under `.artifacts/legacy-art/` and is not bundled.
- Retired Ceramic images are archived under `.artifacts/legacy-art/` and are not bundled.
- `assets/art/hand-drum.png`, `hand-piano.png`: replacement neutral white five-digit sprites.

## Composition

- Right hands mirror the shared left-hand asset.
- Hands stay white, with separate illustrated sprites for Cartoon and the existing sprites for other styles. A shadow-only group filter is shared by the pair. No theme tint is applied. Hand frames are 75% of their original width and height; adjusted anchors preserve fingertip contact.
- Piano keys are individual CSS layers over the empty recess, with separate depression animations.
- Audio output time drives contact poses; no frame-by-frame bitmap generation happens during playing.
