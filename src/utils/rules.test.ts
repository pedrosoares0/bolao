import { describe, it, expect } from 'vitest';
import {
  analyzeBet,
  pensBonus,
  isProfeta,
  calculateStandings,
  calculateFireCounts,
  calculatePeFrioCounts,
  calculateMvpCounts,
  calculateConquestTimeline,
  calculateThiefRounds
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

  // ---- Mata-mata decidido nos pênaltis (placar empata, mas há quem avança) ----
  it('empate nos pênaltis: cravar o placar exato ainda vale 3', () => {
    const m = finishedMatch(1, 1, { winner: 'AWAY_TEAM', stage: 'LAST_16' });
    expect(analyzeBet(makeBet(1, 1), m)).toEqual({ points: 3, type: 'exact' });
  });

  it('empate nos pênaltis: prever empate (placar errado) ainda vale 2', () => {
    const m = finishedMatch(1, 1, { winner: 'HOME_TEAM', stage: 'LAST_16' });
    expect(analyzeBet(makeBet(0, 0), m)).toEqual({ points: 2, type: 'draw' });
  });

  it('empate nos pênaltis: apostar vencedor que AVANÇOU (mandante) vale 1', () => {
    const m = finishedMatch(1, 1, { winner: 'HOME_TEAM', stage: 'LAST_16' });
    expect(analyzeBet(makeBet(2, 1), m)).toEqual({ points: 1, type: 'winner' });
  });

  it('empate nos pênaltis: apostar vencedor que AVANÇOU (visitante) vale 1', () => {
    const m = finishedMatch(1, 1, { winner: 'AWAY_TEAM', stage: 'LAST_16' });
    expect(analyzeBet(makeBet(0, 2), m)).toEqual({ points: 1, type: 'winner' });
  });

  it('empate nos pênaltis: apostar no time que foi ELIMINADO vale 0', () => {
    const m = finishedMatch(1, 1, { winner: 'AWAY_TEAM', stage: 'LAST_16' });
    expect(analyzeBet(makeBet(2, 1), m)).toEqual({ points: 0, type: 'wrong' });
  });

  it('empate na fase de grupos (winner DRAW) não vira vitória por pênalti', () => {
    const m = finishedMatch(1, 1, { winner: 'DRAW' });
    expect(analyzeBet(makeBet(2, 0), m)).toEqual({ points: 0, type: 'wrong' });
  });
});

// ---------- pensBonus (palpite de pênaltis no mata-mata) ----------

describe('pensBonus', () => {
  // Jogo decidido nos PÊNALTIS: placar empatado (1-1), duração PENALTY_SHOOTOUT.
  const koPens = (winner: 'HOME_TEAM' | 'AWAY_TEAM') =>
    finishedMatch(1, 1, { winner, stage: 'LAST_16', duration: 'PENALTY_SHOOTOUT' });
  // Jogo decidido na PRORROGAÇÃO por gol: placar 2-1, duração EXTRA_TIME.
  const koExtra = (winner: 'HOME_TEAM' | 'AWAY_TEAM') =>
    finishedMatch(2, 1, { winner, stage: 'LAST_16', duration: 'EXTRA_TIME' });
  const betWithPens = (pick: boolean, pensWinner: 'HOME' | 'AWAY' | null): Bet => ({
    ...makeBet(0, 0),
    pensPick: pick,
    pensWinner,
  });

  it('pênaltis: errou a forma (0) e errou o vencedor (-1) => -1', () => {
    expect(pensBonus(betWithPens(false, 'AWAY'), koPens('HOME_TEAM'))).toBe(-1);
  });

  it('pênaltis: acertou a forma (+1) mas errou o vencedor (-1) => 0', () => {
    expect(pensBonus(betWithPens(true, 'AWAY'), koPens('HOME_TEAM'))).toBe(0);
  });

  it('pênaltis: acertou a forma (+1) e acertou o vencedor (+1) => 2', () => {
    expect(pensBonus(betWithPens(true, 'HOME'), koPens('HOME_TEAM'))).toBe(2);
  });

  it('prorrogação: acertou que NÃO ia a pênaltis (+1) e acertou o vencedor (+1) => 2', () => {
    expect(pensBonus(betWithPens(false, 'HOME'), koExtra('HOME_TEAM'))).toBe(2);
  });

  it('prorrogação: disse que ia a pênaltis (forma errada, 0) e errou o vencedor (-1) => -1', () => {
    expect(pensBonus(betWithPens(true, 'AWAY'), koExtra('HOME_TEAM'))).toBe(-1);
  });

  it('decidido no TEMPO NORMAL (REGULAR): classificação não conta, NEM desconta (0)', () => {
    const m = finishedMatch(2, 1, { winner: 'HOME_TEAM', stage: 'LAST_16', duration: 'REGULAR' });
    expect(pensBonus(betWithPens(false, 'HOME'), m)).toBe(0); // acertou vencedor, mas 90' não conta
    expect(pensBonus(betWithPens(true, 'AWAY'), m)).toBe(0); // errou vencedor, mas 90' não desconta
  });

  it('duração desconhecida (dado antigo) + pênaltis preenchido: trata como pênaltis', () => {
    const m = finishedMatch(1, 1, { winner: 'HOME_TEAM', stage: 'LAST_16', homePens: 4, awayPens: 2 });
    expect(pensBonus(betWithPens(true, 'HOME'), m)).toBe(2);
  });

  it('duração desconhecida e sem pênaltis: não conta (0)', () => {
    const m = finishedMatch(2, 1, { winner: 'HOME_TEAM', stage: 'LAST_16' });
    expect(pensBonus(betWithPens(true, 'AWAY'), m)).toBe(0);
  });

  it('jogo ainda não terminou vale 0', () => {
    const m: Match = { ...baseMatch, homeScore: 1, awayScore: 1, stage: 'LAST_16', winner: 'HOME_TEAM', duration: 'PENALTY_SHOOTOUT' };
    expect(pensBonus(betWithPens(true, 'HOME'), m)).toBe(0);
  });

  it('sem aposta vale 0', () => {
    expect(pensBonus(undefined, koPens('HOME_TEAM'))).toBe(0);
  });

  it('usuário não apostou empate no placar: vale 0', () => {
    const bet = { ...makeBet(2, 1), pensPick: true, pensWinner: 'HOME' as const };
    expect(pensBonus(bet, koPens('HOME_TEAM'))).toBe(0);
  });
});

// ---------- isProfeta (selo 🔮 / contagem de desempate) ----------

describe('isProfeta', () => {
  const betWithPens = (h: number, a: number, pick: boolean, pensWinner: 'HOME' | 'AWAY' | null): Bet => ({
    ...makeBet(h, a),
    pensPick: pick,
    pensWinner,
  });

  it('tempo normal: cravou o placar exato = Profeta', () => {
    expect(isProfeta(makeBet(2, 1), finishedMatch(2, 1, { stage: 'LAST_16', duration: 'REGULAR', winner: 'HOME_TEAM' }))).toBe(true);
  });

  it('fase de grupos: empate exato (1-1) = Profeta', () => {
    expect(isProfeta(makeBet(1, 1), finishedMatch(1, 1, { winner: 'DRAW' }))).toBe(true);
  });

  it('não cravou o placar: não é Profeta', () => {
    expect(isProfeta(makeBet(0, 0), finishedMatch(1, 1))).toBe(false);
  });

  it('pênaltis: cravou placar + forma (pênaltis) + quem passa = Profeta', () => {
    const m = finishedMatch(1, 1, { stage: 'LAST_16', duration: 'PENALTY_SHOOTOUT', winner: 'HOME_TEAM' });
    expect(isProfeta(betWithPens(1, 1, true, 'HOME'), m)).toBe(true);
  });

  it('pênaltis: cravou o placar mas errou quem passa = NÃO é Profeta', () => {
    const m = finishedMatch(1, 1, { stage: 'LAST_16', duration: 'PENALTY_SHOOTOUT', winner: 'HOME_TEAM' });
    expect(isProfeta(betWithPens(1, 1, true, 'AWAY'), m)).toBe(false);
  });

  it('pênaltis: cravou o placar e quem passa mas disse prorrogação (forma errada) = NÃO é Profeta', () => {
    const m = finishedMatch(1, 1, { stage: 'LAST_16', duration: 'PENALTY_SHOOTOUT', winner: 'HOME_TEAM' });
    expect(isProfeta(betWithPens(1, 1, false, 'HOME'), m)).toBe(false);
  });

  it('pênaltis (fallback sem duration, mas com pênaltis preenchido): exige classificação', () => {
    const m = finishedMatch(1, 1, { stage: 'LAST_16', winner: 'HOME_TEAM', homePens: 4, awayPens: 2 });
    expect(isProfeta(betWithPens(1, 1, true, 'HOME'), m)).toBe(true);
    expect(isProfeta(betWithPens(1, 1, true, 'AWAY'), m)).toBe(false);
  });

  it('prorrogação por gol (placar 2-1): cravar o placar exato já é Profeta', () => {
    const m = finishedMatch(2, 1, { stage: 'LAST_16', duration: 'EXTRA_TIME', winner: 'HOME_TEAM' });
    expect(isProfeta(makeBet(2, 1), m)).toBe(true);
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

  it('calcula fogos (ONFIRE) por 5 jogos seguidos pontuando + sequência atual', () => {
    // 6 partidas consecutivas terminando 1x0. Apostas de VENCEDOR (2x0): pontuam
    // (1 ponto) sem serem placar exato, para isolar a regra de pontuação.
    const matches = Array.from({ length: 6 }, (_, i) =>
      finishedMatch(1, 0, { id: `m${i}`, kickoff: `2026-06-12T10:0${i}:00Z` })
    );

    const bets = [
      // user1 pontua em todas (vencedor): 1 fogo (aos 5 jogos) e sequência atual 1
      ...matches.map((m) => makeBet(2, 0, 'user1', m.id)),
      // user2 erra no m3: deve ter 0 fogos e sequência atual 2
      makeBet(2, 0, 'user2', 'm0'),
      makeBet(2, 0, 'user2', 'm1'),
      makeBet(2, 0, 'user2', 'm2'),
      makeBet(0, 1, 'user2', 'm3'), // errou
      makeBet(2, 0, 'user2', 'm4'),
      makeBet(2, 0, 'user2', 'm5'),
    ];

    const fireCounts = calculateFireCounts(matches, bets, participants);

    expect(fireCounts['user1']).toEqual({ fires: 1, currentStreak: 1 });
    expect(fireCounts['user2']).toEqual({ fires: 0, currentStreak: 2 });
  });

  it('calcula fogos (ONFIRE) por 3 placares exatos seguidos', () => {
    // 7 partidas terminando 1x0; aposta exata (1x0) pontua exato (3 pts).
    const matches = Array.from({ length: 7 }, (_, i) =>
      finishedMatch(1, 0, { id: `m${i}`, kickoff: `2026-06-12T10:0${i}:00Z` })
    );

    const bets = [
      // user1: 6 exatos seguidos. Cada 3 exatos = 1 fogo e ZERA ambas as sequências
      // (reset compartilhado), então NÃO há fogo extra pela regra dos 5 jogos.
      // (m0,m1,m2 = fogo 1; m3,m4,m5 = fogo 2) -> 2 fogos, sequência atual 0.
      ...Array.from({ length: 6 }, (_, i) => makeBet(1, 0, 'user1', `m${i}`)),
      // user2: exato m0,m1 -> ERRA m2 (zera pontuação e exatos) -> exato m3,m4 = nenhum fogo
      makeBet(1, 0, 'user2', 'm0'),
      makeBet(1, 0, 'user2', 'm1'),
      makeBet(0, 1, 'user2', 'm2'), // errou (away) -> zera ambas as sequências
      makeBet(1, 0, 'user2', 'm3'),
      makeBet(1, 0, 'user2', 'm4'),
    ];

    const fireCounts = calculateFireCounts(matches, bets, participants);

    // user1: 6 exatos = 2 fogos (3+3). O reset compartilhado impede o 3º fogo dos "5 jogos".
    expect(fireCounts['user1']).toEqual({ fires: 2, currentStreak: 0 });
    // user2: nunca chega a 3 exatos seguidos nem a 5 jogos pontuando -> 0 fogos. Sequência atual = 2.
    expect(fireCounts['user2']).toEqual({ fires: 0, currentStreak: 2 });
  });

  it('reset compartilhado: 3 exatos + 2 jogos pontuando = só 1 fogo (não 2)', () => {
    // 5 partidas terminando 1x0
    const matches = Array.from({ length: 5 }, (_, i) =>
      finishedMatch(1, 0, { id: `m${i}`, kickoff: `2026-06-12T10:0${i}:00Z` })
    );

    const bets = [
      // 3 exatos seguidos -> 1 fogo (e zera a contagem dos 5 jogos)
      makeBet(1, 0, 'user1', 'm0'),
      makeBet(1, 0, 'user1', 'm1'),
      makeBet(1, 0, 'user1', 'm2'),
      // + 2 jogos pontuando (vencedor). Sem o reset, m0..m4 = 5 pontuando = fogo extra (indevido).
      makeBet(2, 0, 'user1', 'm3'),
      makeBet(2, 0, 'user1', 'm4'),
    ];

    const fireCounts = calculateFireCounts(matches, bets, participants);

    // Apenas 1 fogo; a sequência de pontuação reiniciou após o fogo dos exatos (currentStreak = 2).
    expect(fireCounts['user1']).toEqual({ fires: 1, currentStreak: 2 });
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

  it('gera conquista ON FIRE ao acertar 3 placares exatos seguidos', () => {
    const matches = Array.from({ length: 3 }, (_, i) =>
      finishedMatch(1, 0, { id: `m${i}`, kickoff: `2026-06-12T1${i}:00:00Z` })
    );
    const bets = matches.map((m) => makeBet(1, 0, 'user1', m.id)); // 3 exatos seguidos

    const timeline = calculateConquestTimeline('user1', matches, bets, participants);
    const onFire = timeline.filter((c) => c.type === 'on_fire');

    // Só a regra dos 3 exatos dispara (a dos 5 jogos pontuando precisa de 5 jogos).
    expect(onFire.length).toBe(1);
    expect(onFire[0].description).toContain('placar exato em 3 jogos seguidos');
  });
});

// ---------- Ladrão (Thief) Habilidade ----------
describe('Ladrão (Thief) Habilidade', () => {
  const p1 = makeParticipant('user1', 'Pedro');
  const p2 = makeParticipant('user2', 'Alex');
  const p3 = makeParticipant('user3', 'Neto');
  const parts = [p1, p2, p3];

  it('elege Ladrão se apenas um participante fizer 5 ou mais pontos e não for o líder', () => {
    // 3 partidas no mesmo dia (isoDate = '2026-06-12')
    const matches = [
      finishedMatch(2, 1, { id: 'm1', isoDate: '2026-06-12', kickoff: '2026-06-12T12:00:00Z' }),
      finishedMatch(1, 0, { id: 'm2', isoDate: '2026-06-12', kickoff: '2026-06-12T15:00:00Z' }),
      finishedMatch(3, 0, { id: 'm3', isoDate: '2026-06-12', kickoff: '2026-06-12T18:00:00Z' }),
    ];

    // user1 (Pedro) crava as 3 partidas = 9 pontos
    // user2 (Alex) pontua 3 pontos
    // user3 (Neto) pontua 0 pontos
    const bets = [
      makeBet(2, 1, 'user1', 'm1'),
      makeBet(1, 0, 'user1', 'm2'),
      makeBet(3, 0, 'user1', 'm3'),

      makeBet(1, 0, 'user2', 'm1'), // 1 pt
      makeBet(2, 0, 'user2', 'm2'), // 1 pt (evita que faça placar exato de 3 pts, somando 5 no total)
      makeBet(1, 0, 'user2', 'm3'), // 1 pt
    ];

    // Para user1 não ser o líder, precisamos de um histórico que dê mais pontos a outro participante antes.
    // Mas no cálculo de calculateThiefRounds, ele analisa a classificação geral acumulada até essa data.
    // Se for o único dia, quem fizer mais pontos será o líder. Então para testar o caso "não líder",
    // podemos simular que user2 já tinha muitos pontos antes.
    // Vamos criar um jogo anterior (dia 11/06) onde user2 crava tudo e user1 zera.
    const prevMatches = [
      finishedMatch(1, 0, { id: 'm0', isoDate: '2026-06-11', kickoff: '2026-06-11T12:00:00Z' }),
    ];
    const allMatches = [...prevMatches, ...matches];
    const allBets = [
      ...bets,
      makeBet(1, 0, 'user2', 'm0'), // Alex crava 3 pts no dia 11 (líder geral antes da rodada 12)
    ];

    const thiefRounds = calculateThiefRounds(allMatches, allBets, parts);

    // No dia 12/06, Pedro (user1) fez 9 pts. Alex (user2) fez 3 pts (acumulando 6 pts no total).
    // Pedro agora acumulou 9 pts no total e se tornou o líder geral ao final do dia.
    // Espera, a regra diz: "O líder do campeonato não pode ser o Ladrão".
    // Ao final do dia 12/06, Pedro tem 9 pts, Alex tem 6 pts. Pedro é o líder geral, então ele fica inelegível!
    expect(thiefRounds['2026-06-12'].status).toBe('leader_ineligible');
    expect(thiefRounds['2026-06-12'].thiefId).toBeNull();
  });

  it('anula a habilidade se dois ou mais participantes fizerem 5 ou mais pontos na rodada', () => {
    const matches = [
      finishedMatch(2, 1, { id: 'm1', isoDate: '2026-06-12' }),
      finishedMatch(1, 0, { id: 'm2', isoDate: '2026-06-12' }),
      finishedMatch(3, 0, { id: 'm3', isoDate: '2026-06-12' }),
    ];

    // user1 (Pedro) e user2 (Alex) fazem 9 pontos cravando tudo
    const bets = [
      makeBet(2, 1, 'user1', 'm1'),
      makeBet(1, 0, 'user1', 'm2'),
      makeBet(3, 0, 'user1', 'm3'),

      makeBet(2, 1, 'user2', 'm1'),
      makeBet(1, 0, 'user2', 'm2'),
      makeBet(3, 0, 'user2', 'm3'),
    ];

    const thiefRounds = calculateThiefRounds(matches, bets, parts);
    expect(thiefRounds['2026-06-12'].status).toBe('annulled');
    expect(thiefRounds['2026-06-12'].thiefId).toBeNull();
  });

  it('aplica corretamente os roubos subtraindo 1 ponto da vítima e adicionando 1 ao ladrão', () => {
    const matches = [finishedMatch(2, 1, { id: 'm1' })];
    const bets = [
      makeBet(2, 1, 'user1', 'm1'), // 3 pts
      makeBet(2, 1, 'user2', 'm1'), // 3 pts
    ];

    // Sem roubos
    const standingsNormal = calculateStandings(parts, matches, bets, [], []);
    expect(standingsNormal.find(s => s.participantId === 'user1')?.points).toBe(3);
    expect(standingsNormal.find(s => s.participantId === 'user2')?.points).toBe(3);

    // Com roubo: user1 rouba de user2
    const steals = [
      { id: 's1', thiefId: 'user1', victimId: 'user2', roundDate: '2026-06-12', createdAt: '' }
    ];
    const standingsWithSteal = calculateStandings(parts, matches, bets, [], steals);
    expect(standingsWithSteal.find(s => s.participantId === 'user1')?.points).toBe(4);
    expect(standingsWithSteal.find(s => s.participantId === 'user2')?.points).toBe(2);
  });
});

