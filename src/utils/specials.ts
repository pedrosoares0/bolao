import type { Match, BrazilStage } from '../types';

// Palpites especiais: campeão da Copa e até onde o Brasil vai.
// Cada acerto vale 5 pontos, confirmados conforme os dados reais
// da API forem definindo os resultados.

export const SPECIAL_POINTS = 5;

// Data limite para editar os palpites especiais (início do mata-mata)
export const SPECIAL_LOCK_ISO = '2026-06-28T00:00:00Z';

export const BRAZIL_STAGE_LABELS: { [key in BrazilStage]: string } = {
  GROUP_STAGE: 'Cai na fase de grupos',
  LAST_32: 'Cai nos 16 avos',
  LAST_16: 'Cai nas oitavas',
  QUARTER_FINALS: 'Cai nas quartas',
  SEMI_FINALS: 'Cai na semi',
  FINAL: 'Vice-campeão',
  CHAMPION: 'Campeão',
};

export const BRAZIL_STAGE_OPTIONS: BrazilStage[] = [
  'GROUP_STAGE',
  'LAST_32',
  'LAST_16',
  'QUARTER_FINALS',
  'SEMI_FINALS',
  'FINAL',
  'CHAMPION',
];

const KNOCKOUT_ORDER: BrazilStage[] = ['LAST_32', 'LAST_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'FINAL'];

// Quem venceu a partida (considera a coluna winner da API, que cobre
// pênaltis no mata-mata; senão decide pelo placar)
const matchWinnerTeam = (m: Match): string | null => {
  if (m.status !== 'finished') return null;
  if (m.winner === 'HOME_TEAM') return m.homeTeamEn;
  if (m.winner === 'AWAY_TEAM') return m.awayTeamEn;
  if (m.winner === 'DRAW') return null;
  if (m.homeScore === null || m.awayScore === null) return null;
  if (m.homeScore > m.awayScore) return m.homeTeamEn;
  if (m.awayScore > m.homeScore) return m.awayTeamEn;
  return null;
};

// Campeão da Copa (nome em inglês) ou null se a final ainda não acabou
export function computeChampion(matches: Match[]): string | null {
  const final = matches.find((m) => m.stage === 'FINAL');
  if (!final) return null;
  return matchWinnerTeam(final);
}

// Até onde o Brasil foi — null enquanto ainda não dá para afirmar
export function computeBrazilStage(matches: Match[]): BrazilStage | null {
  const isBrazil = (name: string) => name === 'Brazil';
  const brazilMatches = matches.filter((m) => isBrazil(m.homeTeamEn) || isBrazil(m.awayTeamEn));
  if (brazilMatches.length === 0) return null;

  // Percorre o mata-mata da final para trás: a fase mais profunda decide
  for (let i = KNOCKOUT_ORDER.length - 1; i >= 0; i--) {
    const stage = KNOCKOUT_ORDER[i];
    const m = brazilMatches.find((bm) => bm.stage === stage);
    if (!m) continue;
    if (m.status !== 'finished') return null; // jogo do Brasil em andamento nessa fase

    const winner = matchWinnerTeam(m);
    if (stage === 'FINAL') {
      return winner && isBrazil(winner) ? 'CHAMPION' : 'FINAL';
    }
    if (winner && isBrazil(winner)) {
      // Avançou: o resultado final ainda depende da próxima fase
      return null;
    }
    return stage; // perdeu nessa fase
  }

  // Sem jogo de mata-mata: caiu na fase de grupos?
  // Só dá para afirmar quando os 16 avos estão com todos os times definidos.
  const last32 = matches.filter((m) => m.stage === 'LAST_32');
  if (last32.length === 0) return null;
  const allDefined = last32.every(
    (m) => m.homeTeamEn !== 'A definir' && m.awayTeamEn !== 'A definir'
  );
  if (!allDefined) return null;
  const brazilInLast32 = last32.some((m) => isBrazil(m.homeTeamEn) || isBrazil(m.awayTeamEn));
  return brazilInLast32 ? null : 'GROUP_STAGE';
}
