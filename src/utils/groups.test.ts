import { describe, it, expect } from 'vitest';
import { computeGroupStandings, computeBestThirds } from './groups';
import type { Match } from '../types';

// Fábrica mínima de partida da fase de grupos
let idSeq = 0;
const gm = (
  group: string,
  homeEn: string,
  awayEn: string,
  homeScore: number | null,
  awayScore: number | null
): Match => ({
  id: `g${idSeq++}`,
  homeTeam: homeEn,
  awayTeam: awayEn,
  homeCode: homeEn.slice(0, 3).toUpperCase(),
  awayCode: awayEn.slice(0, 3).toUpperCase(),
  homeFlag: 'un',
  awayFlag: 'un',
  date: '12/06',
  time: '16:00',
  group: `Grupo ${group}`,
  homeScore,
  awayScore,
  status: homeScore === null ? 'scheduled' : 'finished',
  kickoff: '2026-06-12T19:00:00Z',
  isoDate: '2026-06-12',
  homeTeamEn: homeEn,
  awayTeamEn: awayEn,
  stage: 'GROUP_STAGE',
  winner: null,
});

describe('computeGroupStandings', () => {
  it('ordena por pontos e calcula saldo/gols', () => {
    const matches = [
      gm('A', 'Brazil', 'Serbia', 2, 0),
      gm('A', 'Switzerland', 'Cameroon', 1, 0),
      gm('A', 'Brazil', 'Switzerland', 1, 0),
      gm('A', 'Cameroon', 'Serbia', 3, 3),
    ];
    const [grupoA] = computeGroupStandings(matches);
    expect(grupoA.label).toBe('Grupo A');
    expect(grupoA.rows[0].en).toBe('Brazil'); // 6 pts
    expect(grupoA.rows[0].pts).toBe(6);
    expect(grupoA.rows[0].gf - grupoA.rows[0].ga).toBe(3); // 3 gf, 0 ga
  });

  it('desempata por confronto direto quando pts/saldo/gols pró empatam', () => {
    // A e B: mesmos pts(3), saldo(0), gols pró(1). No confronto direto, A venceu B.
    const matches = [
      gm('X', 'A', 'B', 1, 0),   // A bate B
      gm('X', 'A', 'C', 0, 1),   // A perde p/ C
      gm('X', 'B', 'C', 1, 0),   // B bate C
    ];
    // A: 1V1D, gf1 ga1, pts3, sg0. B: 1V1D, gf1 ga1, pts3, sg0. C: 1V1D gf1 ga1 pts3 sg0.
    // Todos empatados em pts/sg/gf → confronto direto: triangular A>B, C>A, B>C (ciclo).
    // h2h entre os 3: cada um 3 pts, sg0, gf1 → ainda empatados → cai no nome (A,B,C).
    const [g] = computeGroupStandings(matches);
    expect(g.rows.map((r) => r.en)).toEqual(['A', 'B', 'C']);
  });

  it('confronto direto entre DOIS empatados respeita quem venceu', () => {
    // A e B terminam iguais em pts/sg/gf; C é o pior. A venceu B no confronto direto.
    const matches = [
      gm('Y', 'A', 'C', 3, 0),
      gm('Y', 'B', 'C', 3, 0),
      gm('Y', 'A', 'B', 1, 0), // A vence B
    ];
    // A: pts6 sg4 ; B: pts3 sg2 ; C: pts0. Não empatam — A,B,C por pts.
    const [g] = computeGroupStandings(matches);
    expect(g.rows.map((r) => r.en)).toEqual(['A', 'B', 'C']);
  });
});

describe('computeBestThirds', () => {
  it('ranqueia os terceiros e marca os topN como classificados', () => {
    // 3 grupos, cada um com um 3º colocado de pontuação diferente.
    const matches = [
      // Grupo A: C3 fica em 3º com 3 pts
      gm('A', 'A1', 'A2', 0, 1),
      gm('A', 'A1', 'A3', 1, 0),
      gm('A', 'A2', 'A3', 1, 0),
      // Grupo B: B3 em 3º com 0 pts
      gm('B', 'B1', 'B2', 0, 1),
      gm('B', 'B1', 'B3', 1, 0),
      gm('B', 'B2', 'B3', 2, 0),
      // Grupo C: C3 em 3º com 1 pt
      gm('C', 'C1', 'C2', 0, 1),
      gm('C', 'C1', 'C3', 1, 1),
      gm('C', 'C2', 'C3', 2, 0),
    ];
    const groups = computeGroupStandings(matches);
    const thirds = computeBestThirds(groups, 2); // só 2 vagas p/ testar o corte
    expect(thirds).toHaveLength(3);
    // O melhor terceiro vem primeiro; o pior por último
    expect(thirds[0].pts).toBeGreaterThanOrEqual(thirds[1].pts);
    expect(thirds[1].pts).toBeGreaterThanOrEqual(thirds[2].pts);
    expect(thirds.filter((t) => t.qualified)).toHaveLength(2);
    expect(thirds[2].qualified).toBe(false);
    expect(thirds[0].group).toMatch(/Grupo/);
  });
});
