# Fonts

## Bundled fallback

`Inter-Bold.ttf` is bundled here as an open-license (SIL OFL 1.1) placeholder
font, converted from the official [Inter](https://rsms.me/inter/) release.
It is registered at server startup as the `BrandFont` family and used
whenever no brand-specific font file is present. The endpoint never crashes
because a font is missing — it always has this file to fall back to.

## Dropping in the real brand font

1. Get the licensed brand `.ttf` or `.otf` file (e.g. from the Dick's
   Sporting Goods brand guidelines package).
2. Save it into this folder as **`brand.ttf`** or **`brand.otf`**
   (either extension works; `.ttf` is checked first).
3. That's it — no code changes needed. `lib/fonts.ts` looks for
   `fonts/brand.ttf` / `fonts/brand.otf` first and registers whichever it
   finds under the `BrandFont` family, the same family name
   `brand.config.ts` already points at (`typography.fontFamily`).
4. If you want a different logical family name, update
   `typography.fontFamily` in `brand.config.ts` and the `FONT_FAMILY`
   constant in `lib/fonts.ts` to match.
5. Restart the dev server (or redeploy) so the new file is picked up —
   font registration happens once per server process.

If `brand.ttf`/`brand.otf` is absent, or fails to register for any reason,
the endpoint silently falls back to `Inter-Bold.ttf` rather than failing
the request.
