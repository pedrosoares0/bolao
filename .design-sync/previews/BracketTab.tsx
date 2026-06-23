import { BracketTab } from 'bolao-bandidos-apostados';
import { matches, groupGMatches, knockoutMatches } from '../mock-data';

// The "chaveamento" (bracket) tab. Defaults to the Grupos view: group standings
// computed from the match results, plus the knockout bracket. Fed a complete
// Group G so the standings table is fully populated.
export const Default = () => (
  <div style={{ width: 430, margin: '0 auto', background: '#15110E', padding: 16, minHeight: 600 }}>
    <BracketTab matches={[...matches, ...groupGMatches]} />
  </div>
);

// Chave de mata-mata completa (16 avos → final + 3º lugar). Clique em
// "Mata-mata" para ver a árvore espelhada com as linhas. Group G completo
// também presente para a aba Grupos.
export const Bracket = () => (
  <div style={{ width: 430, margin: '0 auto', background: '#15110E', padding: 16, minHeight: 600 }}>
    <BracketTab matches={[...groupGMatches, ...knockoutMatches]} />
  </div>
);
