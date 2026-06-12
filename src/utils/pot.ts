// Cálculo do prêmio acumulado do bolão.
// A contagem começa em 12/06/2026 e soma R$ 10,00 por dia
// (4 participantes x R$ 2,50) até o último dia da Copa (19/07/2026).

export const POT_START_ISO = '2026-06-12';
export const POT_END_ISO = '2026-07-19'; // final da Copa 2026
export const POT_PER_DAY = 10;
export const POT_PER_PERSON_DAY = 2.5;

export function calcAccumulatedPot(todayIso: string): number {
  const effective =
    todayIso < POT_START_ISO ? POT_START_ISO : todayIso > POT_END_ISO ? POT_END_ISO : todayIso;
  const days =
    Math.floor((Date.parse(effective) - Date.parse(POT_START_ISO)) / 86400000) + 1;
  return days * POT_PER_DAY;
}
