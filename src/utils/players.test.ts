import { describe, it, expect } from 'vitest';
import { BRAZIL_PLAYERS, goalsByPlayer } from './players';
import { BRAZIL_SCORERS, countScorerGoals, scorerName } from '../../netlify/shared/scorer-core.mts';
import type { MatchGoal } from '../types';

// Helper: monta a lista de gols como a ESPN reporta (persistida em matches.goals)
const goal = (scorer: string, ownGoal = false): MatchGoal => ({ scorer, ownGoal });

describe('goalsByPlayer (bônus de artilheiro)', () => {
  it('conta 1 gol do jogador escolhido (nome com acento)', () => {
    const goals = [goal('Vinícius Júnior')];
    expect(goalsByPlayer(goals, 'vinijr')).toBe(1);
  });

  it('conta múltiplos gols do mesmo jogador', () => {
    const goals = [goal('Matheus Cunha'), goal('Matheus Cunha'), goal('Vinícius Júnior')];
    expect(goalsByPlayer(goals, 'matheuscunha')).toBe(2);
    expect(goalsByPlayer(goals, 'vinijr')).toBe(1);
  });

  it('casa variações do nome (sem acento, abreviado)', () => {
    expect(goalsByPlayer([goal('Vinicius Jr')], 'vinijr')).toBe(1);
    expect(goalsByPlayer([goal('Lucas Paquetá')], 'paqueta')).toBe(1);
  });

  it('NÃO conta gol contra', () => {
    expect(goalsByPlayer([goal('Vinícius Júnior', true)], 'vinijr')).toBe(0);
  });

  it('NÃO credita gol de quem não está nos aliases (homônimo)', () => {
    expect(goalsByPlayer([goal('Outro Vinicius Qualquer Sobrenome')], 'vinijr')).toBe(0);
    expect(goalsByPlayer([goal('Lionel Messi')], 'vinijr')).toBe(0);
  });

  it('lida com lista vazia/nula e id inexistente', () => {
    expect(goalsByPlayer([], 'vinijr')).toBe(0);
    expect(goalsByPlayer(null, 'vinijr')).toBe(0);
    expect(goalsByPlayer([goal('Vinícius Júnior')], null)).toBe(0);
    expect(goalsByPlayer([goal('Vinícius Júnior')], 'jogador_inexistente')).toBe(0);
  });
});

describe('countScorerGoals (servidor) espelha goalsByPlayer (front)', () => {
  const goals = [goal('Matheus Cunha'), goal('Matheus Cunha'), goal('Vinícius Júnior')];
  it('mesmo resultado nos dois lados', () => {
    for (const p of BRAZIL_PLAYERS) {
      expect(countScorerGoals(goals, p.id)).toBe(goalsByPlayer(goals, p.id));
    }
  });
  it('scorerName devolve o nome de exibição', () => {
    expect(scorerName('vinijr')).toBe('Vini Jr');
    expect(scorerName('inexistente')).toBeNull();
  });
});

// Garante que o front (src/utils/players.ts) e o servidor
// (netlify/shared/scorer-core.mts) nunca saiam de sincronia.
describe('paridade front × servidor', () => {
  const norm = (s: string): string =>
    (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

  it('mesmos ids', () => {
    expect(BRAZIL_SCORERS.map((p) => p.id).sort()).toEqual(BRAZIL_PLAYERS.map((p) => p.id).sort());
  });

  it('mesmo nome e mesmo conjunto de aliases (normalizado) por id', () => {
    for (const front of BRAZIL_PLAYERS) {
      const server = BRAZIL_SCORERS.find((s) => s.id === front.id);
      expect(server, `id ${front.id} ausente no servidor`).toBeTruthy();
      expect(server!.name).toBe(front.name);

      const frontSet = new Set([front.name, ...front.aliases].map(norm));
      const serverSet = new Set([server!.name, ...server!.aliases].map(norm));
      expect([...serverSet].sort(), `aliases divergentes em ${front.id}`).toEqual([...frontSet].sort());
    }
  });
});
