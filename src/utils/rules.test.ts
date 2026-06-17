import { describe, it, expect } from 'vitest';
import {
  analyzeBet,
  calculateStandings,
  calculateFireCounts,
  calculatePeFrioCounts,
  calculateMvpCounts,
  calculateConquestTimeline
} from './rules';
import { computeChampion, computeBrazilStage } from './specials';
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
  homeTeamEn: 'Brazil',
  awayTeamEn: 'Argentina',
  stage: 'GROUP_STAGE',
  winner: null,
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

  it('inclui jogos ao vivo (isLive: true) no cálculo de pontuação', () => {
    const matches: Match[] = [
      finishedMatch(1, 0, { id: 'm1' }),
      { ...baseMatch, id: 'm2', status: 'scheduled', isLive: true, homeScore: 2, awayScore: 1 }, // ao vivo com gols
    ];
    const bets = [
      makeBet(1, 0, 'pedro', 'm1'), // exato: 3 pts
      makeBet(2, 1, 'pedro', 'm2'), // exato (ao vivo): 3 pts
    ];

    const standings = calculateStandings([pedro], matches, bets);
    expect(standings[0].points).toBe(6);
    expect(standings[0].totalBets).toBe(2);
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

  it('desempata por mais ON FIRE (fires) antes de exatos', () => {
    // 5 partidas finalizadas para Pedro conseguir sequência ON FIRE de 5
    const matches = Array.from({ length: 5 }, (_, i) =>
      finishedMatch(1, 0, { id: `m${i}`, kickoff: `2026-06-12T10:0${i}:00Z` })
    );
    // Pedro: 5 acertos vencedores = 5 pontos (1 fire, 0 exatos)
    // Alex: 1 acerto exato + 2 acertos vencedores = 5 pontos (0 fire, 1 exato)
    const bets = [
      ...matches.map((m) => makeBet(2, 0, 'pedro', m.id)), // todos vencedor mandante (5 pts)
      makeBet(1, 0, 'alex', 'm0'), // exato (3 pts)
      makeBet(2, 0, 'alex', 'm1'), // vencedor (1 pt)
      makeBet(2, 0, 'alex', 'm2'), // vencedor (1 pt)
      // restando m3 e m4 sem aposta de alex para pontuar
    ];

    const standings = calculateStandings([alex, pedro], matches, bets);
    expect(standings[0].points).toBe(5);
    expect(standings[1].points).toBe(5);
    expect(standings[0].participantId).toBe('pedro'); // Mais ON FIRE (1 vs 0) vence, mesmo Alex tendo mais exatos
  });

  it('desempata por número de placares exatos (caso pontos e onfire sejam iguais)', () => {
    const matches = [
      finishedMatch(2, 1, { id: 'm1' }),
      finishedMatch(1, 1, { id: 'm2' }),
      finishedMatch(3, 0, { id: 'm3' }),
    ];
    // pedro: 1 exato (3 pts, 0 fires) | alex: 1 empate + 1 vencedor (2+1 = 3 pts, 0 fires)
    const bets = [
      makeBet(2, 1, 'pedro', 'm1'),
      makeBet(0, 0, 'alex', 'm2'),
      makeBet(1, 0, 'alex', 'm3'),
    ];

    const standings = calculateStandings([alex, pedro], matches, bets);
    expect(standings[0].points).toBe(3);
    expect(standings[1].points).toBe(3);
    expect(standings[0].participantId).toBe('pedro'); // mais exatos (1 vs 0) vence
  });

  it('desempata por menos Pé Frio quando pontos, onfire e exatos são iguais', () => {
    const bruno = makeParticipant('bruno', 'Bruno');
    const matches = [
      finishedMatch(1, 0, { id: 'm0' }),
      finishedMatch(2, 0, { id: 'm1' }),
      finishedMatch(3, 0, { id: 'm2' }),
    ];
    const bets = [
      // m0: pedro e alex exato (3 pts), bruno erra (0 pt)
      makeBet(1, 0, 'pedro', 'm0'),
      makeBet(1, 0, 'alex', 'm0'),
      makeBet(0, 0, 'bruno', 'm0'),

      // m1: pedro erra (0 pt), alex vencedor (1 pt), bruno vencedor (1 pt)
      // Pedro é o único a zerar (Pé Frio = 1)
      makeBet(0, 1, 'pedro', 'm1'),
      makeBet(1, 0, 'alex', 'm1'),
      makeBet(1, 0, 'bruno', 'm1'),

      // m2: pedro vencedor (1 pt), alex erra (0 pt), bruno erra (0 pt)
      // Alex não é Pé Frio porque bruno também errou
      makeBet(2, 0, 'pedro', 'm2'),
      makeBet(0, 1, 'alex', 'm2'),
      makeBet(0, 1, 'bruno', 'm2'),
    ];

    // Pontos totais:
    // Pedro: 3 (m0) + 0 (m1) + 1 (m2) = 4 pts. exatos = 1. fires = 0. pé frio = 1.
    // Alex: 3 (m0) + 1 (m1) + 0 (m2) = 4 pts. exatos = 1. fires = 0. pé frio = 0.
    const standings = calculateStandings([pedro, alex, bruno], matches, bets);
    const pedroStanding = standings.find(s => s.participantId === 'pedro')!;
    const alexStanding = standings.find(s => s.participantId === 'alex')!;

    expect(pedroStanding.points).toBe(4);
    expect(alexStanding.points).toBe(4);
    expect(standings[0].participantId).toBe('alex'); // alex vence no tiebreak por ter menos pé frio (0 vs 1)
  });

  it('mantém a ordem original quando tudo é igual', () => {
    const standings = calculateStandings([pedro, alex], [], []);
    expect(standings[0].participantId).toBe('pedro');
    expect(standings[1].participantId).toBe('alex');

    const standings2 = calculateStandings([alex, pedro], [], []);
    expect(standings2[0].participantId).toBe('alex');
    expect(standings2[1].participantId).toBe('pedro');
  });

  it('soma 5 pontos para o palpite certo de campeão', () => {
    const final = finishedMatch(2, 0, {
      id: 'f1',
      stage: 'FINAL',
      homeTeamEn: 'Brazil',
      awayTeamEn: 'France',
    });
    const standings = calculateStandings([pedro, alex], [final], [], [
      { participantId: 'pedro', championTeam: 'Brazil', brazilStage: 'LAST_16' },
      { participantId: 'alex', championTeam: 'France', brazilStage: 'LAST_16' },
    ]);
    const pedroRow = standings.find((s) => s.participantId === 'pedro')!;
    const alexRow = standings.find((s) => s.participantId === 'alex')!;
    // pedro acertou campeão (+5) e Brasil campeão difere de LAST_16 (0)
    expect(pedroRow.points - alexRow.points).toBe(5);
  });
});

// ---------- computeChampion / computeBrazilStage ----------

describe('computeChampion', () => {
  it('retorna null sem final ou com final não terminada', () => {
    expect(computeChampion([baseMatch])).toBeNull();
    expect(computeChampion([{ ...baseMatch, stage: 'FINAL' }])).toBeNull();
  });

  it('retorna o vencedor da final pelo placar', () => {
    const final = finishedMatch(3, 1, { stage: 'FINAL', homeTeamEn: 'Spain', awayTeamEn: 'France' });
    expect(computeChampion([final])).toBe('Spain');
  });

  it('usa a coluna winner quando a final empata (pênaltis)', () => {
    const final = finishedMatch(1, 1, {
      stage: 'FINAL',
      homeTeamEn: 'Spain',
      awayTeamEn: 'France',
      winner: 'AWAY_TEAM',
    });
    expect(computeChampion([final])).toBe('France');
  });
});

describe('computeBrazilStage', () => {
  const brazilGroup = (over: Partial<Match> = {}) =>
    finishedMatch(1, 0, { id: 'g1', stage: 'GROUP_STAGE', homeTeamEn: 'Brazil', awayTeamEn: 'Morocco', ...over });

  it('indefinido enquanto o Brasil segue vivo', () => {
    expect(computeBrazilStage([brazilGroup()])).toBeNull();
  });

  it('Brasil eliminado nas oitavas (derrota nos pênaltis)', () => {
    const oitavas = finishedMatch(1, 1, {
      id: 'o1',
      stage: 'LAST_16',
      homeTeamEn: 'Brazil',
      awayTeamEn: 'France',
      winner: 'AWAY_TEAM',
    });
    expect(computeBrazilStage([brazilGroup(), oitavas])).toBe('LAST_16');
  });

  it('Brasil campeão ao vencer a final', () => {
    const final = finishedMatch(2, 0, {
      id: 'f1',
      stage: 'FINAL',
      homeTeamEn: 'Brazil',
      awayTeamEn: 'France',
      winner: 'HOME_TEAM',
    });
    expect(computeBrazilStage([brazilGroup(), final])).toBe('CHAMPION');
  });

  it('cai na fase de grupos quando os 16 avos estão definidos sem o Brasil', () => {
    const last32 = finishedMatch(1, 0, {
      id: 'l1',
      stage: 'LAST_32',
      homeTeamEn: 'France',
      awayTeamEn: 'Morocco',
    });
    expect(computeBrazilStage([brazilGroup(), last32])).toBe('GROUP_STAGE');
  });

  it('indefinido enquanto os 16 avos têm times a definir', () => {
    const last32 = {
      ...baseMatch,
      id: 'l1',
      stage: 'LAST_32',
      homeTeamEn: 'A definir',
      awayTeamEn: 'A definir',
    };
    expect(computeBrazilStage([brazilGroup(), last32])).toBeNull();
  });
});

// ---------- Conquistas / Achievements ----------

describe('Cálculo de Conquistas e Estatísticas', () => {
  const p1 = makeParticipant('user1', 'User One');
  const p2 = makeParticipant('user2', 'User Two');
  const participants = [p1, p2];

  it('calcula fogos (ONFIRE) permanentes e sequência atual', () => {
    // 6 partidas consecutivas com acertos
    const matches = Array.from({ length: 6 }, (_, i) =>
      finishedMatch(1, 0, { id: `m${i}`, kickoff: `2026-06-12T10:0${i}:00Z` })
    );

    const bets = [
      // user1 acerta todas (pontos > 0): deve ganhar 1 fogo (aos 5 acertos) e ter sequência atual 1
      ...matches.map((m) => makeBet(1, 0, 'user1', m.id)),
      // user2 erra no m3: deve ter 0 fogos e sequência atual 2
      makeBet(1, 0, 'user2', 'm0'),
      makeBet(1, 0, 'user2', 'm1'),
      makeBet(1, 0, 'user2', 'm2'),
      makeBet(0, 1, 'user2', 'm3'), // errou
      makeBet(1, 0, 'user2', 'm4'),
      makeBet(1, 0, 'user2', 'm5'),
    ];

    const fireCounts = calculateFireCounts(matches, bets, participants);

    expect(fireCounts['user1']).toEqual({ fires: 1, currentStreak: 1 });
    expect(fireCounts['user2']).toEqual({ fires: 0, currentStreak: 2 });
  });

  it('calcula Pé Frio corretamente (único a zerar em jogo com >=2 apostas)', () => {
    const matches = [
      finishedMatch(1, 0, { id: 'm0' }),
      finishedMatch(2, 2, { id: 'm1' }),
    ];

    const bets = [
      // m0: user1 pontua (1x0), user2 erra (0x1) -> user2 é pé frio
      makeBet(1, 0, 'user1', 'm0'),
      makeBet(0, 1, 'user2', 'm0'),
      // m1: ambos erram -> ninguém é pé frio
      makeBet(1, 0, 'user1', 'm1'),
      makeBet(0, 1, 'user2', 'm1'),
    ];

    const peFrioCounts = calculatePeFrioCounts(matches, bets, participants);

    expect(peFrioCounts['user1']).toBe(0);
    expect(peFrioCounts['user2']).toBe(1); // foi pé frio no m0
  });

  it('calcula títulos de MVP da Rodada corretamente', () => {
    const matches = [
      finishedMatch(1, 0, { id: 'm0', isoDate: '2026-06-12' }),
      finishedMatch(2, 0, { id: 'm1', isoDate: '2026-06-12' }),
      finishedMatch(1, 1, { id: 'm2', isoDate: '2026-06-13' }),
    ];

    const bets = [
      // Dia 12/06:
      // user1: m0 exact (3 pts), m1 exact (3 pts) -> 6 pts, 2 exacts
      makeBet(1, 0, 'user1', 'm0'),
      makeBet(2, 0, 'user1', 'm1'),
      // user2: m0 winner (1 pt), m1 draw (0 pt) -> 1 pt
      makeBet(2, 0, 'user2', 'm0'),
      makeBet(1, 1, 'user2', 'm1'),

      // Dia 13/06:
      // user1: m2 draw (2 pts) -> 2 pts
      makeBet(0, 0, 'user1', 'm2'),
      // user2: m2 draw (2 pts) -> 2 pts
      makeBet(0, 0, 'user2', 'm2'),
    ];

    const mvpCounts = calculateMvpCounts(matches, bets, participants);

    // user1 deve ser MVP no dia 12 e compartilhar o MVP com user2 no dia 13
    expect(mvpCounts['user1']).toBe(2);
    expect(mvpCounts['user2']).toBe(1);
  });

  it('gera linha do tempo de conquistas cronológica reversa', () => {
    const matches = [
      finishedMatch(1, 0, { id: 'm0', date: '12/06', kickoff: '2026-06-12T15:00:00Z', homeTeam: 'A', awayTeam: 'B' }),
      finishedMatch(2, 0, { id: 'm1', date: '12/06', kickoff: '2026-06-12T18:00:00Z', homeTeam: 'C', awayTeam: 'D' }),
    ];

    const bets = [
      makeBet(1, 0, 'user1', 'm0'), // Profeta (exato)
      makeBet(2, 0, 'user1', 'm1'), // Profeta (exato)
      makeBet(1, 1, 'user2', 'm0'),
      makeBet(1, 1, 'user2', 'm1'),
    ];

    const timeline = calculateConquestTimeline('user1', matches, bets, participants);

    // Deve ter 3 itens: MVP do dia 12/06, Profeta no m1 (18h), Profeta no m0 (15h)
    expect(timeline.length).toBe(3);
    expect(timeline[0].type).toBe('mvp');
    expect(timeline[1].description).toContain('C 2 x 0 D');
    expect(timeline[2].description).toContain('A 1 x 0 B');
  });

  it('inclui jogos AO VIVO (isLive) nas conquistas e sequências', () => {
    const matches: Match[] = [
      finishedMatch(1, 0, { id: 'm0', status: 'finished' }),
      finishedMatch(2, 0, { id: 'm1', status: 'finished' }),
      { ...baseMatch, id: 'm2', homeScore: 3, awayScore: 1, isLive: true },
    ];
    const bets = [
      makeBet(1, 0, 'user1', 'm0'),
      makeBet(2, 0, 'user1', 'm1'),
      makeBet(3, 1, 'user1', 'm2'),
    ];

    const timeline = calculateConquestTimeline('user1', matches, bets, participants);
    expect(timeline.some((c) => c.match?.id === 'm2' && c.type === 'profeta')).toBe(true);
  });
});
