// ============================================================
// Classificação da fase de grupos (Copa 2026: 12 grupos A-L).
// Avançam os 2 primeiros de cada grupo + os 8 MELHORES TERCEIROS.
//
// Critérios de desempate (regulamento FIFA), nesta ordem:
//   1. Pontos no grupo
//   2. Saldo de gols geral
//   3. Gols pró geral
//   4. Confronto direto entre os empatados: pontos → saldo → gols pró
//   5. (fallback estável) nome em ordem alfabética
// Os melhores terceiros são ranqueados por: pontos → saldo → gols pró → nome.
// ============================================================
import type { Match } from '../types';

export interface GroupRow {
  en: string;     // nome em inglês (chave)
  name: string;   // nome em português (exibição)
  flag: string;   // código/URL da bandeira
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;     // gols pró
  ga: number;     // gols contra
  pts: number;
}

export interface GroupStanding {
  label: string;       // ex.: "Grupo A"
  rows: GroupRow[];    // já ordenadas (1º → último)
}

export interface ThirdRow extends GroupRow {
  group: string;       // ex.: "Grupo A"
  qualified: boolean;  // entre os 8 melhores terceiros
}

const sg = (r: GroupRow) => r.gf - r.ga;

// Confronto direto: mini-tabela só com os jogos ENTRE os times empatados.
// Devolve um mapa en -> { pts, gd, gf } restrito a esses confrontos.
function headToHead(tiedEns: Set<string>, matches: Match[]): Map<string, { pts: number; gd: number; gf: number }> {
  const h2h = new Map<string, { pts: number; gd: number; gf: number }>();
  tiedEns.forEach((en) => h2h.set(en, { pts: 0, gd: 0, gf: 0 }));

  for (const m of matches) {
    if (m.status !== 'finished' || m.homeScore === null || m.awayScore === null) continue;
    if (!tiedEns.has(m.homeTeamEn) || !tiedEns.has(m.awayTeamEn)) continue;
    const h = h2h.get(m.homeTeamEn)!;
    const a = h2h.get(m.awayTeamEn)!;
    h.gf += m.homeScore; h.gd += m.homeScore - m.awayScore;
    a.gf += m.awayScore; a.gd += m.awayScore - m.homeScore;
    if (m.homeScore > m.awayScore) h.pts += 3;
    else if (m.awayScore > m.homeScore) a.pts += 3;
    else { h.pts++; a.pts++; }
  }
  return h2h;
}

// Ordena as linhas de UM grupo aplicando todos os critérios de desempate.
function sortGroupRows(rows: GroupRow[], matches: Match[]): GroupRow[] {
  // 1. Ordem geral: pts → saldo → gols pró
  const sorted = [...rows].sort((x, y) => {
    if (y.pts !== x.pts) return y.pts - x.pts;
    if (sg(y) !== sg(x)) return sg(y) - sg(x);
    if (y.gf !== x.gf) return y.gf - x.gf;
    return 0;
  });

  // 2. Desempata blocos ainda iguais em (pts, saldo, gols pró) pelo confronto direto
  const sameRank = (a: GroupRow, b: GroupRow) => a.pts === b.pts && sg(a) === sg(b) && a.gf === b.gf;
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && sameRank(sorted[i], sorted[j])) j++;
    if (j - i > 1) {
      const block = sorted.slice(i, j);
      const tiedEns = new Set(block.map((r) => r.en));
      const h2h = headToHead(tiedEns, matches);
      block.sort((x, y) => {
        const hx = h2h.get(x.en)!, hy = h2h.get(y.en)!;
        if (hy.pts !== hx.pts) return hy.pts - hx.pts;
        if (hy.gd !== hx.gd) return hy.gd - hx.gd;
        if (hy.gf !== hx.gf) return hy.gf - hx.gf;
        return x.name.localeCompare(y.name, 'pt');
      });
      for (let k = 0; k < block.length; k++) sorted[i + k] = block[k];
    }
    i = j;
  }
  return sorted;
}

// Classificação de todos os grupos a partir das partidas da fase de grupos.
export function computeGroupStandings(matches: Match[]): GroupStanding[] {
  const groupMatches = matches.filter((m) => m.stage === 'GROUP_STAGE' && m.group.startsWith('Grupo'));
  const byGroup = new Map<string, { rows: Map<string, GroupRow>; matches: Match[] }>();

  const ensureRow = (rows: Map<string, GroupRow>, en: string, name: string, flag: string): GroupRow => {
    let row = rows.get(en);
    if (!row) {
      row = { en, name, flag, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0 };
      rows.set(en, row);
    }
    return row;
  };

  for (const m of groupMatches) {
    if (!byGroup.has(m.group)) byGroup.set(m.group, { rows: new Map(), matches: [] });
    const g = byGroup.get(m.group)!;
    g.matches.push(m);
    // Registra os dois times mesmo sem jogo disputado (aparecem zerados)
    const home = ensureRow(g.rows, m.homeTeamEn, m.homeTeam, m.homeFlag);
    const away = ensureRow(g.rows, m.awayTeamEn, m.awayTeam, m.awayFlag);
    if (m.status !== 'finished' || m.homeScore === null || m.awayScore === null) continue;

    home.played++; away.played++;
    home.gf += m.homeScore; home.ga += m.awayScore;
    away.gf += m.awayScore; away.ga += m.homeScore;
    if (m.homeScore > m.awayScore) { home.won++; home.pts += 3; away.lost++; }
    else if (m.awayScore > m.homeScore) { away.won++; away.pts += 3; home.lost++; }
    else { home.drawn++; away.drawn++; home.pts++; away.pts++; }
  }

  return Array.from(byGroup.entries())
    .sort((a, b) => a[0].localeCompare(b[0], 'pt'))
    .map(([label, g]) => ({ label, rows: sortGroupRows(Array.from(g.rows.values()), g.matches) }));
}

// Ranking dos terceiros colocados de cada grupo. Os `topN` melhores (8 na Copa
// 2026) recebem `qualified: true`. Critério: pts → saldo → gols pró → nome.
export function computeBestThirds(groups: GroupStanding[], topN = 8): ThirdRow[] {
  const thirds: ThirdRow[] = groups
    .filter((g) => g.rows.length >= 3)
    .map((g) => ({ ...g.rows[2], group: g.label, qualified: false }));

  thirds.sort((x, y) => {
    if (y.pts !== x.pts) return y.pts - x.pts;
    if (sg(y) !== sg(x)) return sg(y) - sg(x);
    if (y.gf !== x.gf) return y.gf - x.gf;
    return x.name.localeCompare(y.name, 'pt');
  });

  thirds.forEach((t, i) => { t.qualified = i < topN; });
  return thirds;
}
