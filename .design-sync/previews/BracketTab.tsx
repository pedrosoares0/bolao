import { BracketTab } from 'bolao-bandidos-apostados';
import { matches, groupGMatches } from '../mock-data';

// The "chaveamento" (bracket) tab. Defaults to the Grupos view: group standings
// computed from the match results, plus the knockout bracket. Fed a complete
// Group G so the standings table is fully populated.
export const Default = () => (
  <div style={{ width: 430, margin: '0 auto', background: '#15110E', padding: 16, minHeight: 600 }}>
    <BracketTab matches={[...matches, ...groupGMatches]} />
  </div>
);
