import { ProfileTab } from 'bolao-bandidos-apostados';
import { currentUser, participants, matches, bets, specials, standings } from '../mock-data';

// The profile tab: the logged-in participant's summary — their standing,
// special predictions, and a breakdown of their bets across the matches.
export const Default = () => (
  <div style={{ width: 430, margin: '0 auto', background: '#15110E', padding: 16, minHeight: 600 }}>
    <ProfileTab
      currentUser={currentUser}
      participants={participants}
      matches={matches}
      bets={bets}
      specials={specials}
      standings={standings}
    />
  </div>
);
