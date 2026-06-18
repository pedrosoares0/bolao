// Tipos de domínio compartilhados pelo app (participantes, jogos, apostas,
// palpites especiais, classificação e fiados). As linhas cruas do banco
// (BetRow/MatchDbRow) ficam em App.tsx e são convertidas para estes tipos.

export interface Participant {
  id: string; // username (ex: 'pedro') — usado nos caminhos de imagem e no ranking
  uid?: string; // uuid do Supabase Auth
  name: string;
  avatarUrl: string; // Ex: '/imagens/pedro.png' ou URL do Storage
  cardUrl?: string; // card/capa do perfil (Storage) — opcional
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
  homeTeamEn: string; // Nome original em inglês (igual ao banco/API)
  awayTeamEn: string;
  stage: string; // GROUP_STAGE | LAST_32 | LAST_16 | QUARTER_FINALS | SEMI_FINALS | THIRD_PLACE | FINAL
  winner?: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null; // decide pênaltis no mata-mata
  isLive?: boolean;
  liveClock?: string | null; // minuto/etapa ao vivo vindo da ESPN (ex.: "28'", "HT")
}

// Estágios possíveis para o palpite "até onde o Brasil vai"
export type BrazilStage =
  | 'GROUP_STAGE'
  | 'LAST_32'
  | 'LAST_16'
  | 'QUARTER_FINALS'
  | 'SEMI_FINALS'
  | 'FINAL'
  | 'CHAMPION';

// Palpite especial: campeão da Copa + até onde o Brasil vai (5 pts cada)
export interface SpecialPrediction {
  participantId: string; // username
  championTeam: string; // nome em inglês (igual à tabela matches)
  brazilStage: BrazilStage;
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

export interface Debt {
  id: number;
  userId: string;
  amount: number;
  debtDate: string;
  createdAt: string;
}

