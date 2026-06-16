import { describe, it, expect } from 'vitest';
import { calcAccumulatedPot, POT_START_ISO, POT_END_ISO, POT_PER_DAY } from './pot';

// O pote começa em 12/06/2026 e soma R$ 10 por dia (4 × R$ 2,50) até 19/07/2026.
describe('calcAccumulatedPot', () => {
  it('no primeiro dia (data de início) vale um dia de pote', () => {
    expect(calcAccumulatedPot(POT_START_ISO)).toBe(POT_PER_DAY); // 10
  });

  it('soma R$ 10 a cada dia que passa', () => {
    expect(calcAccumulatedPot('2026-06-13')).toBe(20);
    expect(calcAccumulatedPot('2026-06-16')).toBe(50); // 5º dia
  });

  it('antes do início, fica preso no primeiro dia (não fica negativo nem zero)', () => {
    expect(calcAccumulatedPot('2026-06-01')).toBe(POT_PER_DAY);
    expect(calcAccumulatedPot('2020-01-01')).toBe(POT_PER_DAY);
  });

  it('no último dia da Copa soma todos os dias do período', () => {
    // 12/06 a 19/07 = 38 dias (inclusivos) → 38 × R$ 10 = R$ 380
    expect(calcAccumulatedPot(POT_END_ISO)).toBe(380);
  });

  it('depois do fim da Copa, congela no valor do último dia', () => {
    expect(calcAccumulatedPot('2026-08-01')).toBe(calcAccumulatedPot(POT_END_ISO));
    expect(calcAccumulatedPot('2030-01-01')).toBe(380);
  });
});
