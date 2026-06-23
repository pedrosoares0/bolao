# design-sync notes — bolao-bandidos-apostados

This repo is a **Vite + React 19 app**, not a published component library. The
sync treats `src/components/` as the component set in **synth-entry mode** (no
library `dist/`).

## Setup that matters (read before re-syncing)

- **Dedicated entry barrel** `.design-sync/ds-entry.tsx` re-exports only the 8
  library-style components. It deliberately EXCLUDES `src/main.tsx` (calls
  `createRoot().render()` at module top level) and `src/App.tsx` (Supabase-coupled
  shell). Without it, the default synth-entry would re-export every src file and
  the bundle IIFE would crash on `main.tsx`'s side effect. `cfg.entry` points at it.
- **Component discovery is via `componentSrcMap`** (8 pinned paths) because there's
  no `.d.ts` tree to enumerate exports from. All land in group `general`.
- **`node .design-sync/copy-assets.mjs` MUST run after every `package-build`/driver run.**
  The build wipes `ds-bundle/`; this copies `public/imagens/*` (raster only, no
  videos) into `ds-bundle/imagens/`. The components hardcode `/imagens/...` asset
  paths (participant photos, medals `medalha-*.webp`, `coroa-mvp.png`, `trofeu.webp`,
  `ranking <id>.webp`, `<id>-slide.webp`). Without the copy, those 404 and — because
  `StandingsTable` has `onError` image fallbacks — the request cascade makes the
  capture's `networkidle` wait time out (page.goto Timeout 20000ms). `imagens/**`
  is in the upload plan's writes/deletes.
- **Fonts:** `.design-sync/ds-fonts.css` ships working `@font-face` for Outfit +
  RamaGothic with repo-relative urls (the converter rewrites to `./<name>`). It
  exists because `src/index.css`'s own `@font-face` use public-absolute urls
  (`/fonts/...`, `/fonnts.com-...otf`) that don't resolve from the bundle root.
  The good rules ship last in `fonts/fonts.css`, so they win per family.

## Source fix applied during the first sync

- `src/utils/players.ts` (and `players.test.ts`): the diacritic-stripping regex was
  written with **literal combining-mark characters** `/[̀-ͯ]/g`. esbuild leaves
  regex literals verbatim, so those raw bytes in the bundle threw
  `Invalid regular expression: Range out of order` whenever the bundle was parsed
  as anything but UTF-8 — killing `window.BolaoApp` entirely. Changed to the escape
  form `/[̀-ͯ]/g`, matching what `src/App.tsx` already does. Behavior
  identical. **If this regex ever reverts to literal combining marks, the bundle
  breaks again.**

## Known render warns (triaged — not new on re-sync)

- `[FONT_MISSING] "Granika"` — the display font `'Granika'` is referenced by
  `src/index.css` (~15 headings) but **no Granika font file exists in the repo**.
  Every usage falls back to `var(--font-family-condensed)` (RamaGothic), which is
  the app's own intended fallback. Accepted as a substitute; not blocking.
- `[GRID_OVERFLOW]` on Aurora/LightRays was resolved with `cfg.overrides.*.cardMode: "column"`.

## Re-sync flow — do NOT use `resync.mjs` as-is

The driver `resync.mjs` chains build → diff → validate → capture internally, and
its build step wipes `ds-bundle/` (removing `imagens/`) BEFORE its validate/capture
run — so the image-dependent components (StandingsTable, etc.) time out exactly as
described above. Re-sync this repo with the manual sequence instead:

```
node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules ./node_modules --entry ./.design-sync/ds-entry.tsx --out ./ds-bundle
node .design-sync/copy-assets.mjs
node .ds-sync/package-validate.mjs ./ds-bundle
node .ds-sync/package-capture.mjs --out ./ds-bundle   # confirm grades carry forward
```

Then upload per the skill (atomic path on a non-empty project: review `list_files`
for orphans → finalize_plan with `imagens/**` in writes → sentinel → content →
deletes → sentinel → `_ds_sync.json` last).

## Re-sync risks (what can silently go stale)

- **Mock data is inlined** in `.design-sync/mock-data.tsx` and the preview `.tsx`
  files. It is hand-built, NOT derived from the repo — if a domain type
  (`Match`, `Bet`, `ParticipantStanding`, …) changes shape, the previews may
  silently render wrong or fail to compile. Re-check against `src/types.ts`.
- **Absolute asset/font paths assume site-root serving.** `/imagens/...` and the
  index.css `/fonts/...` rules resolve only if the design environment serves the
  uploaded bundle at the project root. Local captures (served at `ds-bundle/` root)
  always work; in-app rendering depends on that assumption holding.
- **Flags load from flagcdn.com at runtime** — offline/blocked networks render
  flag-less. Not shipped with the bundle.
- The regex fix above is in app source; a future formatter or merge could reintroduce
  the literal-combining-mark form.
