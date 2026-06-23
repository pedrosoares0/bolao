// Design-sync entry barrel.
// Re-exports ONLY the library-style components for the design bundle.
// Deliberately excludes main.tsx (calls createRoot().render() at module top level)
// and App.tsx (Supabase-coupled app shell) so the IIFE bundle has no side effects.
export { default as Aurora } from '../src/components/Aurora';
export { default as LightRays } from '../src/components/LightRays';
export { default as BracketTab } from '../src/components/BracketTab';
export { PalpitesTab } from '../src/components/PalpitesTab';
export { PixTab } from '../src/components/PixTab';
export { ProfileTab } from '../src/components/ProfileTab';
export { StandingsTable } from '../src/components/StandingsTable';
export { PixKeyRow } from '../src/components/PixKeyCopy';
