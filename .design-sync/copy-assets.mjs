// Post-build step: copy the app's public/imagens/ raster assets into the
// bundle so the components' hardcoded `/imagens/...` paths resolve (participant
// photos, medals, podium, crown, trophy). Videos and the thumbs/ dir are
// skipped to keep the bundle lean. Re-run after every package-build (which
// wipes the out dir).
import { cpSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const SRC = 'public/imagens';
const DST = 'ds-bundle/imagens';
const KEEP = new Set(['.webp', '.png', '.jpg', '.jpeg', '.svg', '.gif']);

mkdirSync(DST, { recursive: true });
let n = 0, bytes = 0;
for (const name of readdirSync(SRC)) {
  const sp = join(SRC, name);
  if (statSync(sp).isDirectory()) continue;        // skip thumbs/
  if (!KEEP.has(extname(name).toLowerCase())) continue; // skip *.mp4
  cpSync(sp, join(DST, name));
  n++; bytes += statSync(sp).size;
}
console.log(`copy-assets: ${n} file(s), ${(bytes / 1024 / 1024).toFixed(1)} MB → ${DST}`);
