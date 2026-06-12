import type { Participant, Match, Bet } from '../types';

export const initialParticipants: Participant[] = [
  { id: 'pedro', name: 'Pedro', avatarUrl: '/imagens/pedro.png' },
  { id: 'alex', name: 'Alex', avatarUrl: '/imagens/alex.png' },
  { id: 'rodrigo', name: 'Rodrigo', avatarUrl: '/imagens/rodrigo.png' },
  { id: 'neto', name: 'Neto', avatarUrl: '/imagens/neto.png' },
];

export const initialMatches: Match[] = [
  {
    id: 'm1',
    homeTeam: 'África do Sul',
    awayTeam: 'México',
    homeCode: 'RSA',
    awayCode: 'MEX',
    homeFlag: 'za',
    awayFlag: 'mx',
    date: '11/06',
    time: '16:00',
    group: 'Grupo A',
    homeScore: 1, // Vamos deixar o primeiro jogo já simulado/terminado como 1x1 para ver a tabela com pontos
    awayScore: 1,
    status: 'finished',
  },
  {
    id: 'm2',
    homeTeam: 'Coreia do Sul',
    awayTeam: 'República Tcheca',
    homeCode: 'KOR',
    awayCode: 'CZE',
    homeFlag: 'kr',
    awayFlag: 'cz',
    date: '11/06',
    time: '23:00',
    group: 'Grupo A',
    homeScore: 1, // Vamos deixar o segundo jogo terminado como 1x0 para ver pontos
    awayScore: 0,
    status: 'finished',
  },
  {
    id: 'm3',
    homeTeam: 'Canadá',
    awayTeam: 'Bósnia',
    homeCode: 'CAN',
    awayCode: 'BOS',
    homeFlag: 'ca',
    awayFlag: 'ba',
    date: '12/06',
    time: '16:00',
    group: 'Grupo B',
    homeScore: null,
    awayScore: null,
    status: 'scheduled',
  },
  {
    id: 'm4',
    homeTeam: 'EUA',
    awayTeam: 'Paraguai',
    homeCode: 'EUA',
    awayCode: 'PAR',
    homeFlag: 'us',
    awayFlag: 'py',
    date: '12/06',
    time: '22:00',
    group: 'Grupo B',
    homeScore: null,
    awayScore: null,
    status: 'scheduled',
  },
];

export const initialBets: Bet[] = [
  // Apostas 11/06 - Hoje (Baseado no prompt do usuário)
  // Jogo 1: África do Sul vs México (placar real: 1x1)
  { matchId: 'm1', participantId: 'pedro', homeScore: 2, awayScore: 1 }, // errou (0 pts)
  { matchId: 'm1', participantId: 'alex', homeScore: 1, awayScore: 1 },  // acertou exato (3 pts)
  { matchId: 'm1', participantId: 'rodrigo', homeScore: 0, awayScore: 0 }, // acertou empate (2 pts)
  { matchId: 'm1', participantId: 'neto', homeScore: 3, awayScore: 1 },  // errou (0 pts)

  // Jogo 2: Coreia do Sul vs República Tcheca (placar real: 1x0)
  { matchId: 'm2', participantId: 'pedro', homeScore: 1, awayScore: 0 }, // acertou exato (3 pts)
  { matchId: 'm2', participantId: 'alex', homeScore: 2, awayScore: 2 },  // errou (0 pts)
  { matchId: 'm2', participantId: 'rodrigo', homeScore: 1, awayScore: 0 }, // acertou exato (3 pts)
  { matchId: 'm2', participantId: 'neto', homeScore: 0, awayScore: 1 },  // errou (0 pts)

  // Apostas 12/06 - Amanhã (Simulados para exemplo)
  // Jogo 3: Canadá vs Bósnia
  { matchId: 'm3', participantId: 'pedro', homeScore: 2, awayScore: 0 },
  { matchId: 'm3', participantId: 'alex', homeScore: 1, awayScore: 1 },
  { matchId: 'm3', participantId: 'rodrigo', homeScore: 0, awayScore: 1 },
  { matchId: 'm3', participantId: 'neto', homeScore: 3, awayScore: 2 },

  // Jogo 4: EUA vs Paraguai
  { matchId: 'm4', participantId: 'pedro', homeScore: 2, awayScore: 1 },
  { matchId: 'm4', participantId: 'alex', homeScore: 3, awayScore: 1 },
  { matchId: 'm4', participantId: 'rodrigo', homeScore: 2, awayScore: 0 },
  { matchId: 'm4', participantId: 'neto', homeScore: 1, awayScore: 1 },
];
export const availableTeams = [
  { name: 'África do Sul', code: 'RSA', flag: 'za' },
  { name: 'México', code: 'MEX', flag: 'mx' },
  { name: 'Coreia do Sul', code: 'KOR', flag: 'kr' },
  { name: 'República Tcheca', code: 'CZE', flag: 'cz' },
  { name: 'Canadá', code: 'CAN', flag: 'ca' },
  { name: 'Bósnia', code: 'BOS', flag: 'ba' },
  { name: 'EUA', code: 'EUA', flag: 'us' },
  { name: 'Paraguai', code: 'PAR', flag: 'py' },
  { name: 'Brasil', code: 'BRA', flag: 'br' },
  { name: 'Argentina', code: 'ARG', flag: 'ar' },
  { name: 'Alemanha', code: 'ALE', flag: 'de' },
  { name: 'França', code: 'FRA', flag: 'fr' },
  { name: 'Itália', code: 'ITA', flag: 'it' },
  { name: 'Espanha', code: 'ESP', flag: 'es' },
  { name: 'Inglaterra', code: 'ING', flag: 'gb' },
  { name: 'Portugal', code: 'POR', flag: 'pt' },
];
