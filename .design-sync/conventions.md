# Bandidos Apostados — conventions for building with this system

This is the component library extracted from the **Bolão "Bandidos Apostados"** app
— a mobile-first World-Cup betting-pool ("bolão") PWA. The components are
**data-driven, full-width screen sections** (tabs, tables, cards), not atomic
primitives. You compose a screen by dropping a section into a dark, narrow phone
frame and feeding it domain data.

## Wrapping & setup

- **No provider/context needed.** Components read nothing from React context —
  pass their data as props and they render. (`onSave`/`onRegisterDebt`/… handlers
  can be `async () => {}` no-ops for static layouts.)
- **Always render on the dark app background and in a phone-width column.** The
  components are styled for `background: var(--bg-primary)` (`#15110E`) at roughly
  **390–430px** wide. On a white or full-width page they look wrong.
- **Styles load via `styles.css`** (which `@import`s `_ds_bundle.css` + the fonts).
  Every visual depends on it — never strip it.
- **Raster assets ship under `/imagens/`** (participant photos, medals, podium,
  trophy, crown) and **flags load from `https://flagcdn.com`** at runtime. The
  components reference `/imagens/...` with an absolute, site-root path.

## Styling idiom — CSS custom properties + semantic class names

This system styles through a **shipped global stylesheet** (`_ds_bundle.css`),
**not** utility classes and **not** style props. You don't restyle the library
components; for your own layout glue around them, use the design tokens defined in
`:root`. Real token names from the build:

| Token | Value | Use |
|---|---|---|
| `--bg-primary` | `#15110E` | app background (near-black) |
| `--bg-card` | `#ffffff` | light card surface |
| `--primary` | `#009c3b` | Brazil green — primary accent |
| `--accent-gold` | `#f5b300` | gold — highlights, CTAs, numbers |
| `--accent-blue` | `#1e3a8a` | secondary accent |
| `--text-main` | `#ffffff` | body text on dark |
| `--text-muted` | `#94a3b8` | secondary text |
| `--font-family` | `'Outfit', system-ui, …` | body font |
| `--font-family-condensed` | `'RamaGothic', 'Outfit', …` | condensed display font for titles/big numbers |
| `--border-radius-lg` / `--shadow-soft` | `1.5rem` / soft drop shadow | card geometry |

Reference them as `var(--token)` (e.g. `color: var(--accent-gold)`). The library's
own class names (`pix-card-key-row`, `brk-tab`, `round-mvp-…`, etc.) live in
`_ds_bundle.css`; read that file before inventing markup.

## Where the truth lives

- **`styles.css` + `_ds_bundle.css`** — the full stylesheet and all `:root` tokens.
- **`<Name>.d.ts`** — each component's exact props (mostly domain types: `Match[]`,
  `Bet[]`, `Participant[]`, `ParticipantStanding[]`, `SpecialPrediction[]`, `Debt[]`).
- **`<Name>.prompt.md`** — per-component usage notes.

## The components

- **StandingsTable** — the leaderboard (podium + ranked rows). `standings, matches, bets, rankChanges`.
- **BracketTab** — group standings + knockout bracket ("Chaveamento"). `matches`.
- **PalpitesTab** — per-match score guesses + champion/Brazil-stage specials. `matches, bets, participants, specials, currentUser, nowTs, onSave`.
- **PixTab** — payment screen: accumulated pot + daily-fee IOUs. `accumulated, currentUser, participants, debts, on*Debt`.
- **ProfileTab** — a participant's summary, stats and achievements. `currentUser, participants, matches, bets, specials, standings`.
- **PixKeyRow** — the PIX-key pill + COPIAR button (no props).
- **Aurora** / **LightRays** — decorative animated CSS backgrounds; render inside a
  `position: relative; overflow: hidden` box.

## One idiomatic build snippet

```tsx
import { StandingsTable } from 'bolao-bandidos-apostados';

// Phone-width, dark-background frame is the right host for every section.
<div style={{ maxWidth: 430, margin: '0 auto', background: 'var(--bg-primary)', minHeight: '100dvh', padding: 16 }}>
  <StandingsTable standings={standings} matches={matches} bets={bets} rankChanges={rankChanges} />
</div>
```
