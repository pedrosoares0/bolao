// Realistic mock data for the design-bundle previews.
// Lives outside .design-sync/previews/ so the converter never treats it as a
// component preview; each preview imports the slices it needs. Types are erased
// at bundle time (rule-3 source import), the data is plain literals.
import type {
  Participant,
  Match,
  Bet,
  SpecialPrediction,
  ParticipantStanding,
  Debt,
} from '../src/types';

// ── Participants (the pool members) ──────────────────────────────────────────
export const participants: Participant[] = [
  { id: 'rodrigo', uid: 'u-rodrigo', name: 'Rodrigo Weber', avatarUrl: '/imagens/rodrigo.webp' },
  { id: 'pedro', uid: 'u-pedro', name: 'Pedro Bandido', avatarUrl: '/imagens/pedro.webp' },
  { id: 'neto', uid: 'u-neto', name: 'Neto Apostado', avatarUrl: '/imagens/neto.webp' },
  { id: 'alex', uid: 'u-alex', name: 'Alex Palpiteiro', avatarUrl: '/imagens/alex.webp' },
];

export const currentUser: Participant = participants[0];

// ── Matches (group stage finished + a live one + knockout scheduled) ──────────
export const matches: Match[] = [
  {
    id: 'm1',
    homeTeam: 'Brasil', awayTeam: 'Sérvia',
    homeCode: 'BRA', awayCode: 'SRB',
    homeFlag: 'br', awayFlag: 'rs',
    date: '14/06', time: '16:00', group: 'Grupo G',
    homeScore: 2, awayScore: 0, status: 'finished',
    kickoff: '2026-06-14T19:00:00Z', isoDate: '2026-06-14',
    homeTeamEn: 'Brazil', awayTeamEn: 'Serbia', stage: 'GROUP_STAGE',
    winner: 'HOME_TEAM',
    goals: [
      { scorer: 'Vinícius Jr.', minute: "62'" },
      { scorer: 'Rodrygo', minute: "78'" },
    ],
  },
  {
    id: 'm2',
    homeTeam: 'Argentina', awayTeam: 'México',
    homeCode: 'ARG', awayCode: 'MEX',
    homeFlag: 'ar', awayFlag: 'mx',
    date: '15/06', time: '13:00', group: 'Grupo C',
    homeScore: 1, awayScore: 1, status: 'finished',
    kickoff: '2026-06-15T16:00:00Z', isoDate: '2026-06-15',
    homeTeamEn: 'Argentina', awayTeamEn: 'Mexico', stage: 'GROUP_STAGE',
    winner: 'DRAW',
    goals: [
      { scorer: 'Lionel Messi', minute: "23'" },
      { scorer: 'Raúl Jiménez', minute: "71'" },
    ],
  },
  {
    id: 'm3',
    homeTeam: 'França', awayTeam: 'Croácia',
    homeCode: 'FRA', awayCode: 'CRO',
    homeFlag: 'fr', awayFlag: 'hr',
    date: '16/06', time: '16:00', group: 'Grupo D',
    homeScore: 1, awayScore: 0, status: 'finished',
    kickoff: '2026-06-16T19:00:00Z', isoDate: '2026-06-16',
    homeTeamEn: 'France', awayTeamEn: 'Croatia', stage: 'GROUP_STAGE',
    winner: 'HOME_TEAM', isLive: true, liveClock: "67'",
    goals: [{ scorer: 'Kylian Mbappé', minute: "44'" }],
  },
  {
    id: 'm4',
    homeTeam: 'Inglaterra', awayTeam: 'Portugal',
    homeCode: 'ENG', awayCode: 'POR',
    homeFlag: 'gb-eng', awayFlag: 'pt',
    date: '04/07', time: '17:00', group: 'Quartas de final',
    homeScore: null, awayScore: null, status: 'scheduled',
    kickoff: '2026-07-04T20:00:00Z', isoDate: '2026-07-04',
    homeTeamEn: 'England', awayTeamEn: 'Portugal', stage: 'QUARTER_FINALS',
  },
  {
    id: 'm5',
    homeTeam: 'Brasil', awayTeam: 'Espanha',
    homeCode: 'BRA', awayCode: 'ESP',
    homeFlag: 'br', awayFlag: 'es',
    date: '09/07', time: '17:00', group: 'Semifinal',
    homeScore: null, awayScore: null, status: 'scheduled',
    kickoff: '2026-07-09T20:00:00Z', isoDate: '2026-07-09',
    homeTeamEn: 'Brazil', awayTeamEn: 'Spain', stage: 'SEMI_FINALS',
  },
];

// A complete Group G (used by BracketTab's "Grupos" view so the standings
// table is fully populated). Spread alongside `matches` for that preview.
export const groupGMatches: Match[] = [
  {
    id: 'g1', homeTeam: 'Suíça', awayTeam: 'Camarões',
    homeCode: 'SUI', awayCode: 'CMR', homeFlag: 'ch', awayFlag: 'cm',
    date: '14/06', time: '13:00', group: 'Grupo G',
    homeScore: 1, awayScore: 1, status: 'finished',
    kickoff: '2026-06-14T16:00:00Z', isoDate: '2026-06-14',
    homeTeamEn: 'Switzerland', awayTeamEn: 'Cameroon', stage: 'GROUP_STAGE', winner: 'DRAW',
  },
  {
    id: 'g2', homeTeam: 'Brasil', awayTeam: 'Suíça',
    homeCode: 'BRA', awayCode: 'SUI', homeFlag: 'br', awayFlag: 'ch',
    date: '19/06', time: '16:00', group: 'Grupo G',
    homeScore: 1, awayScore: 0, status: 'finished',
    kickoff: '2026-06-19T19:00:00Z', isoDate: '2026-06-19',
    homeTeamEn: 'Brazil', awayTeamEn: 'Switzerland', stage: 'GROUP_STAGE', winner: 'HOME_TEAM',
  },
  {
    id: 'g3', homeTeam: 'Sérvia', awayTeam: 'Camarões',
    homeCode: 'SRB', awayCode: 'CMR', homeFlag: 'rs', awayFlag: 'cm',
    date: '19/06', time: '13:00', group: 'Grupo G',
    homeScore: 3, awayScore: 1, status: 'finished',
    kickoff: '2026-06-19T16:00:00Z', isoDate: '2026-06-19',
    homeTeamEn: 'Serbia', awayTeamEn: 'Cameroon', stage: 'GROUP_STAGE', winner: 'HOME_TEAM',
  },
  {
    id: 'g4', homeTeam: 'Brasil', awayTeam: 'Camarões',
    homeCode: 'BRA', awayCode: 'CMR', homeFlag: 'br', awayFlag: 'cm',
    date: '23/06', time: '16:00', group: 'Grupo G',
    homeScore: 4, awayScore: 1, status: 'finished',
    kickoff: '2026-06-23T19:00:00Z', isoDate: '2026-06-23',
    homeTeamEn: 'Brazil', awayTeamEn: 'Cameroon', stage: 'GROUP_STAGE', winner: 'HOME_TEAM',
  },
  {
    id: 'g5', homeTeam: 'Sérvia', awayTeam: 'Suíça',
    homeCode: 'SRB', awayCode: 'SUI', homeFlag: 'rs', awayFlag: 'ch',
    date: '23/06', time: '16:00', group: 'Grupo G',
    homeScore: 1, awayScore: 2, status: 'finished',
    kickoff: '2026-06-23T19:00:00Z', isoDate: '2026-06-23',
    homeTeamEn: 'Serbia', awayTeamEn: 'Switzerland', stage: 'GROUP_STAGE', winner: 'AWAY_TEAM',
  },
];

// ── Bets (each participant's guesses on the finished matches) ─────────────────
export const bets: Bet[] = [
  // Rodrigo — nailed the Brazil game
  { matchId: 'm1', participantId: 'rodrigo', homeScore: 2, awayScore: 0, scorerId: 'Vinícius Jr.' },
  { matchId: 'm2', participantId: 'rodrigo', homeScore: 2, awayScore: 1 },
  { matchId: 'm3', participantId: 'rodrigo', homeScore: 1, awayScore: 0 },
  // Pedro
  { matchId: 'm1', participantId: 'pedro', homeScore: 1, awayScore: 0 },
  { matchId: 'm2', participantId: 'pedro', homeScore: 1, awayScore: 1 },
  { matchId: 'm3', participantId: 'pedro', homeScore: 2, awayScore: 1 },
  // Neto
  { matchId: 'm1', participantId: 'neto', homeScore: 3, awayScore: 1 },
  { matchId: 'm2', participantId: 'neto', homeScore: 0, awayScore: 0 },
  { matchId: 'm3', participantId: 'neto', homeScore: 1, awayScore: 0 },
  // Alex
  { matchId: 'm1', participantId: 'alex', homeScore: 2, awayScore: 0 },
  { matchId: 'm2', participantId: 'alex', homeScore: 2, awayScore: 2 },
  { matchId: 'm3', participantId: 'alex', homeScore: 0, awayScore: 1 },
];

// ── Special predictions (champion + how far Brazil goes) ──────────────────────
export const specials: SpecialPrediction[] = [
  { participantId: 'rodrigo', championTeam: 'Brazil', brazilStage: 'CHAMPION' },
  { participantId: 'pedro', championTeam: 'France', brazilStage: 'SEMI_FINALS' },
  { participantId: 'neto', championTeam: 'Argentina', brazilStage: 'FINAL' },
  { participantId: 'alex', championTeam: 'Spain', brazilStage: 'QUARTER_FINALS' },
];

// ── Standings (already ranked) ────────────────────────────────────────────────
export const standings: ParticipantStanding[] = [
  {
    participantId: 'rodrigo', name: 'Rodrigo Weber', avatarUrl: '/imagens/rodrigo.webp',
    points: 11, scorerPoints: 2, exactScoreCount: 2, correctDrawCount: 1,
    correctWinnerCount: 0, wrongCount: 0, totalBets: 3, totalPaid: 7.5,
  },
  {
    participantId: 'pedro', name: 'Pedro Bandido', avatarUrl: '/imagens/pedro.webp',
    points: 6, scorerPoints: 0, exactScoreCount: 1, correctDrawCount: 1,
    correctWinnerCount: 1, wrongCount: 0, totalBets: 3, totalPaid: 7.5,
  },
  {
    participantId: 'alex', name: 'Alex Palpiteiro', avatarUrl: '/imagens/alex.webp',
    points: 4, scorerPoints: 0, exactScoreCount: 1, correctDrawCount: 0,
    correctWinnerCount: 1, wrongCount: 1, totalBets: 3, totalPaid: 7.5,
  },
  {
    participantId: 'neto', name: 'Neto Apostado', avatarUrl: '/imagens/neto.webp',
    points: 1, scorerPoints: 0, exactScoreCount: 0, correctDrawCount: 0,
    correctWinnerCount: 1, wrongCount: 2, totalBets: 3, totalPaid: 7.5,
  },
];

export const rankChanges: Record<string, number> = {
  rodrigo: 0,
  pedro: 2,
  alex: -1,
  neto: -1,
};

// ── Debts (the "caderneta" of daily-fee IOUs) ─────────────────────────────────
export const debts: Debt[] = [
  { id: 1, userId: 'neto', amount: 2.5, debtDate: '2026-06-14', createdAt: '2026-06-14T22:00:00Z' },
  { id: 2, userId: 'neto', amount: 2.5, debtDate: '2026-06-15', createdAt: '2026-06-15T22:00:00Z' },
  { id: 3, userId: 'alex', amount: 2.5, debtDate: '2026-06-15', createdAt: '2026-06-15T22:00:00Z' },
];

export const accumulated = 320.0;

// No-op async handlers for the interactive props (previews render statically).
export const noop = async () => {};
