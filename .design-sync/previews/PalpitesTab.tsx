import { PalpitesTab } from 'bolao-bandidos-apostados';
import { matches, bets, participants, specials, currentUser, noop } from '../mock-data';

// The "palpites" (guesses) tab: per-match score inputs plus the special
// predictions (champion + how far Brazil goes). nowTs drives the lockout state.
export const Default = () => (
  <div style={{ width: 430, margin: '0 auto', background: '#15110E', padding: 16, minHeight: 600 }}>
    <PalpitesTab
      matches={matches}
      bets={bets}
      participants={participants}
      specials={specials}
      currentUser={currentUser}
      nowTs={Date.parse('2026-06-20T12:00:00Z')}
      onSave={noop}
    />
  </div>
);
