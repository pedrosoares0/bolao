import { describe, it, expect } from 'vitest';
import { analyzeBet, calculateStandings } from './rules';
import type { Match, Bet, Participant } from '../types';

// ---------- Fábricas de dados ----------

const baseMatch: Match = {
  id: 'm1',
  homeTeam: 'Brasil',
  awayTeam: 'Argentina',
  homeCode: 'BRA',
  awayCode: 'ARG',
  homeFlag: 'br',
  awayFlag: 'ar',
  date: '12/06',
  time: '16:00',
  group: 'Grupo A',
  homeScore: null,
  awayScore: null,
  status: 'scheduled',
  kickoff: '2026-06-12T19:00:00Z',
  isoDate: '2026-06-12',
};

const finishedMatch = (home: number, away: number, over: Partial<Match> = {}): Match => ({
  ...baseMatch,
  homeScore: home,
  awayScore: away,
  status: 'finished',
  ...over,
});

const makeBet = (home: number, away: number, participantId = 'pedro', matchId = 'm1'): Bet => ({
  matchId,
  participantId,
  homeScore: home,
  awayScore: away,
});

const makeParticipant = (id: string, name: string): Participant => ({
  id,
  name,
  avatarUrl: `/imagens/${id}.png`,
});

// ---------- analyzeBet ----------

describe('analyzeBet', () => {
  it('retorna pendente quando não há aposta', () => {
    expect(analyzeBet(undefined, finishedMatch(1, 0))).toEqual({ points: 0, type: 'pending' });
  });

  it('retorna pendente quando o jogo não terminou (placar nulo)', () => {
    expect(analyzeBet(makeBet(2, 1), baseMatch)).toEqual({ points: 0, type: 'pending' });
  });

  it('placar exato vale 3 pontos', () => {
    expect(analyzeBet(makeBet(2, 1), finishedMatch(2, 1))).toEqual({ points: 3, type: 'exact' });
  });

  it('empate exato conta como placar exato (3), não como empate (2)', () => {
    expect(analyzeBet(makeBet(1, 1), finishedMatch(1, 1))).toEqual({ points: 3, type: 'exact' });
  });

  it('acertar o empate com placar errado vale 2 pontos', () => {
    expect(analyzeBet(makeBet(0, 0), finishedMatch(1, 1))).toEqual({ points: 2, type: 'draw' });
  });

  it('acertar o vencedor mandante com placar errado vale 1 ponto', () => {
    expect(analyzeBet(makeBet(1, 0), finishedMatch(3, 1))).toEqual({ points: 1, type: 'winner' });
  });

  it('acertar o vencedor visitante com placar errado vale 1 ponto', () => {
    expect(analyzeBet(makeBet(1, 3), finishedMatch(0, 2))).toEqual({ points: 1, type: 'winner' });
  });

  it('apostar em empate quando houve vencedor vale 0', () => {
    expect(analyzeBet(makeBet(1, 1), finishedMatch(2, 0))).toEqual({ points: 0, type: 'wrong' });
  });

  it('apostar em vencedor quando deu empate vale 0', () => {
    expect(analyzeBet(makeBet(2, 0), finishedMatch(1, 1))).toEqual({ points: 0, type: 'wrong' });
  });

  it('inverter o vencedor vale 0', () => {
    expect(analyzeBet(makeBet(0, 2), finishedMatch(2, 0))).toEqual({ points: 0, type: 'wrong' });
  });

  it('placar 0x0 apostado e 0x0 real é exato', () => {
    expect(analyzeBet(makeBet(0, 0), finishedMatch(0, 0))).toEqual({ points: 3, type: 'exact' });
  });
});

// ---------- calculateStandings ----------

describe('calculateStandings', () => {
  const pedro = makeParticipant('pedro', 'Pedro');
  const alex = makeParticipant('alex', 'Alex');

  it('soma pontos e contadores por tipo de acerto', () => {
    const matches = [
      finishedMatch(1, 1, { id: 'm1', isoDate: '2026-06-12', date: '12/06' }),
      finishedMatch(2, 0, { id: 'm2', isoDate: '2026-06-13', date: '13/06' }),
    ];
    const bets = [
      makeBet(1, 1, 'pedro', 'm1'), // exato: 3
      makeBet(1, 0, 'pedro', 'm2'), // vencedor: 1
      makeBet(0, 0, 'alex', 'm1'), // empate: 2
      makeBet(0, 2, 'alex', 'm2'), // errou: 0
    ];

    const standings = calculateStandings([pedro, alex], matches, bets);

    expect(standings[0].participantId).toBe('pedro');
    expect(standings[0].points).toBe(4);
    expect(standings[0].exactScoreCount).toBe(1);
    expect(standings[0].correctWinnerCount).toBe(1);
    expect(standings[0].correctDrawCount).toBe(0);
    expect(standings[0].wrongCount).toBe(0);

    expect(standings[1].participantId).toBe('alex');
    expect(standings[1].points).toBe(2);
    expect(standings[1].correctDrawCount).toBe(1);
    expect(standings[1].wrongCount).toBe(1);
  });

  it('ignora jogos não finalizados', () => {
    const matches = [
      finishedMatch(1, 0, { id: 'm1' }),
      { ...baseMatch, id: 'm2' }, // agendado
    ];
    const bets = [
      makeBet(1, 0, 'pedro', 'm1'),
      makeBet(5, 5, 'pedro', 'm2'), // não pode pontuar
    ];

    const standings = calculateStandings([pedro], matches, bets);
    expect(standings[0].points).toBe(3);
    expect(standings[0].totalBets).toBe(1);
  });

  it('calcula o total pago: R$ 2,50 por dia com jogos finalizados', () => {
    const matches = [
      finishedMatch(1, 0, { id: 'm1', date: '12/06', isoDate: '2026-06-12' }),
      finishedMatch(2, 1, { id: 'm2', date: '12/06', isoDate: '2026-06-12' }), // mesmo dia
      finishedMatch(0, 0, { id: 'm3', date: '13/06', isoDate: '2026-06-13' }), // outro dia
    ];

    const standings = calculateStandings([pedro], matches, []);
    // 2 dias distintos com jogos finalizados * 2.50
    expect(standings[0].totalPaid).toBe(5.0);
  });

  it('desempata por número de placares exatos', () => {
    const matches = [
      finishedMatch(2, 1, { id: 'm1' }),
      finishedMatch(1, 1, { id: 'm2' }),
      finishedMatch(3, 0, { id: 'm3' }),
    ];
    // pedro: 1 exato (3 pts) | alex: 1 empate + 1 vencedor (2+1 = 3 pts)
    const bets = [
      makeBet(2, 1, 'pedro', 'm1'),
      makeBet(0, 0, 'alex', 'm2'),
      makeBet(1, 0, 'alex', 'm3'),
    ];

    const standings = calculateStandings([alex, pedro], matches, bets);
    expect(standings[0].points).toBe(3);
    expect(standings[1].points).toBe(3);
    expect(standings[0].participantId).toBe('pedro'); // mais exatos vence o empate
  });

  it('desempata por ordem alfabética quando tudo é igual', () => {
    const standings = calculateStandings([pedro, alex], [], []);
    expect(standings[0].name).toBe('Alex');
    expect(standings[1].name).toBe('Pedro');
  });
});
