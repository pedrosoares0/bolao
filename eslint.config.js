import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  // App React (navegador)
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  // Netlify Functions (Node): também passam pelo lint, sem regras de React.
  // `no-undef` fica desligado porque o TypeScript já cobre símbolos não definidos.
  {
    files: ['netlify/**/*.{mts,ts}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-undef': 'off',
    },
  },
  // Fundos WebGL vendados do reactbits.dev. Mantidos como o original para não
  // mexer nas animações (= não mudar comportamento); por isso relaxamos as regras
  // de estilo que esses componentes de efeito naturalmente violam.
  {
    files: ['src/components/Aurora.tsx', 'src/components/LightRays.tsx'],
    rules: {
      'react-hooks/refs': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'prefer-const': 'off',
    },
  },
])
