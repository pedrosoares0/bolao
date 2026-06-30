import { describe, it, expect } from 'vitest';
import { splitScoreAndPens } from './sync-core.mts';

// Foco: a pegadinha da football-data v4, em que o `fullTime` de um jogo decidido
// nos pênaltis vem somado (tempo normal + pênaltis). O placar gravado precisa ser
// o do tempo normal/prorrogação (o empate) e a disputa vai para as colunas de pens.
describe('splitScoreAndPens', () => {
  it('jogo normal (sem pênaltis): usa o fullTime e não preenche pens', () => {
    const score = {
      winner: 'HOME_TEAM',
      duration: 'REGULAR',
      fullTime: { home: 2, away: 1 },
      regularTime: { home: 2, away: 1 },
    };
    expect(splitScoreAndPens(score)).toEqual({
      home_score: 2, away_score: 1, home_pens: null, away_pens: null,
    });
  });

  it('decidido nos pênaltis: placar vira o do tempo normal e os pênaltis vão pras colunas de pens', () => {
    // Caso real: Alemanha x Paraguai — fullTime 4-5 (somado), regular 1-1, pens 3-4.
    const score = {
      winner: 'AWAY_TEAM',
      duration: 'PENALTY_SHOOTOUT',
      fullTime: { home: 4, away: 5 },
      regularTime: { home: 1, away: 1 },
      extraTime: { home: 0, away: 0 },
      penalties: { home: 3, away: 4 },
    };
    expect(splitScoreAndPens(score)).toEqual({
      home_score: 1, away_score: 1, home_pens: 3, away_pens: 4,
    });
  });

  it('pênaltis após gols na prorrogação: soma regularTime + extraTime no placar', () => {
    // 1-1 no tempo normal, 1-1 na prorrogação (=> 2-2 ao fim dos 120') e pens 5-4.
    const score = {
      winner: 'HOME_TEAM',
      duration: 'PENALTY_SHOOTOUT',
      fullTime: { home: 7, away: 6 },
      regularTime: { home: 1, away: 1 },
      extraTime: { home: 1, away: 1 },
      penalties: { home: 5, away: 4 },
    };
    expect(splitScoreAndPens(score)).toEqual({
      home_score: 2, away_score: 2, home_pens: 5, away_pens: 4,
    });
  });

  it('decidido na prorrogação por gol (sem disputa): mantém o fullTime', () => {
    const score = {
      winner: 'HOME_TEAM',
      duration: 'EXTRA_TIME',
      fullTime: { home: 2, away: 1 },
      regularTime: { home: 1, away: 1 },
      extraTime: { home: 1, away: 0 },
    };
    expect(splitScoreAndPens(score)).toEqual({
      home_score: 2, away_score: 1, home_pens: null, away_pens: null,
    });
  });

  it('fallback sem regularTime: usa fullTime - penalties', () => {
    const score = {
      winner: 'AWAY_TEAM',
      duration: 'PENALTY_SHOOTOUT',
      fullTime: { home: 4, away: 5 },
      penalties: { home: 3, away: 4 },
    };
    expect(splitScoreAndPens(score)).toEqual({
      home_score: 1, away_score: 1, home_pens: 3, away_pens: 4,
    });
  });

  it('jogo sem placar (agendado): tudo nulo', () => {
    expect(splitScoreAndPens({ winner: null })).toEqual({
      home_score: null, away_score: null, home_pens: null, away_pens: null,
    });
    expect(splitScoreAndPens(null)).toEqual({
      home_score: null, away_score: null, home_pens: null, away_pens: null,
    });
  });
});
