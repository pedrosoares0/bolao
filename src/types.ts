export interface Participant {
  id: string; // username (ex: 'pedro') — usado nos caminhos de imagem e no ranking
  uid?: string; // uuid do Supabase Auth
  name: string;
  avatarUrl: string; // Ex: '/imagens/pedro.png'
}

export type MatchStatus = 'scheduled' | 'finished';

export interface Match {
  id: string;
  homeTeam: string; // Ex: 'África do Sul'
  awayTeam: string; // Ex: 'México'
  homeCode: string; // Ex: 'AFRI'
  awayCode: string; // Ex: 'MEX'
  homeFlag: string; // Ex: código do país para flagcdn, como 'za'
  awayFlag: string; // Ex: código do país para flagcdn, como 'mx'
  date: string; // Ex: '11/06'
  time: string; // Ex: '16:00'
  group: string; // Ex: 'Grupo A'
  homeScore: number | null; // null se não jogou
  awayScore: number | null; // null se não jogou
  status: MatchStatus;
  kickoff: string; // Início do jogo em UTC (ISO 8601) — fonte da verdade p/ lockout
  isoDate: string; // Data do jogo no horário de Brasília (YYYY-MM-DD)
}

export interface Bet {
  matchId: string;
  participantId: string;
  homeScore: number;
  awayScore: number;
}

export interface ParticipantStanding {
  participantId: string;
  name: string;
  avatarUrl: string;
  points: number;
  exactScoreCount: number; // 3 pontos
  correctDrawCount: number; // 2 pontos
  correctWinnerCount: number; // 1 ponto
  wrongCount: number; // 0 pontos
  totalBets: number;
  totalPaid: number; // Dias jogados * 2.5
}
