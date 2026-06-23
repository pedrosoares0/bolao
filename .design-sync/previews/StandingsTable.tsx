import { StandingsTable } from 'bolao-bandidos-apostados';
import { standings, matches, bets, rankChanges } from '../mock-data';

// The pool leaderboard: ranked participants with points, exact-score / draw /
// winner tallies, rank-change arrows and the animated podium header.
export const Ranking = () => (
  <div style={{ width: 430, margin: '0 auto', background: '#15110E', padding: 16, minHeight: 600 }}>
    <StandingsTable standings={standings} matches={matches} bets={bets} rankChanges={rankChanges} />
  </div>
);
