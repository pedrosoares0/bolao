---
name: verify-with-npm-build
description: Verificar tipos com `npm run build` (tsc -b), não `tsc --noEmit`, antes de deploy
metadata:
  type: feedback
---

Para validar TypeScript neste projeto, rode `npm run build` (que executa `tsc -b && vite build`) — é exatamente o que o Netlify roda no deploy.

**Why:** `tsc --noEmit` (root tsconfig) passou em código que o `tsc -b` (project references, usado no build/Netlify) rejeitou, quebrando o deploy. Caso real: estreitamento de tipo via atribuição dentro de `forEach`/closure — `tsc --noEmit` aceitou, `tsc -b` deu `error TS2339: Property ... does not exist on type 'never'`.

**How to apply:** Antes de dar "pronto" numa mudança de TS, rode `npm run build` e confirme que passa. Evite o padrão `let best: T | null = null; arr.forEach(() => { best = ... }); if (best) best.x` — refatore com `map().filter().sort()` e pegue `[0]`, que o TS infere corretamente.
