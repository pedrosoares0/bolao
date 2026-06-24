// ============================================================
// scorer-core — pontuação do artilheiro no lado do servidor (notificações).
//
// ESPELHA src/utils/players.ts: mesmos ids, nomes e aliases. A paridade é
// garantida pelo teste src/utils/players.test.ts — se alguém mexer num lado
// e esquecer do outro, o teste quebra. Mantido aqui (e não importado de src)
// porque as Netlify Functions (.mts) são empacotadas à parte do bundle do front.
// ============================================================
// Só precisamos do autor e se foi contra — assim aceita tanto o EspnGoalDetail
// do servidor quanto o MatchGoal do front (cujo teamId/minute são opcionais).
type GoalLike = { scorer: string; ownGoal?: boolean };

export interface ScorerPlayer {
  id: string;
  name: string;
  aliases: string[];
}

// id, name e aliases iguais a BRAZIL_PLAYERS (src/utils/players.ts), sem o `img`.
export const BRAZIL_SCORERS: ScorerPlayer[] = [
  { id: 'vinijr', name: 'Vini Jr', aliases: ['Vinicius Junior', 'Vinícius Júnior', 'Vinicius Jr', 'Vini Jr', 'Vinicius'] },
  { id: 'paqueta', name: 'Paquetá', aliases: ['Lucas Paqueta', 'Lucas Paquetá', 'Paqueta', 'Paquetá'] },
  { id: 'raphinha', name: 'Raphinha', aliases: ['Raphinha', 'Raphael Dias Belloli'] },
  { id: 'neymar', name: 'Neymar', aliases: ['Neymar', 'Neymar Jr', 'Neymar Junior', 'Neymar da Silva Santos Junior'] },
  { id: 'endrick', name: 'Endrick', aliases: ['Endrick', 'Endrick Felipe'] },
  { id: 'matheuscunha', name: 'M. Cunha', aliases: ['Matheus Cunha', 'M. Cunha'] },
  { id: 'rayan', name: 'Rayan', aliases: ['Rayan', 'Rayan Vitor'] },
  { id: 'luizhenrique', name: 'L. Henrique', aliases: ['Luiz Henrique', 'L. Henrique'] },
];

// Normaliza um nome para comparação (sem acento, minúsculo, só [a-z0-9]).
// IGUAL ao normPlayerName de src/utils/players.ts.
const normName = (s: string): string =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const aliasSetById: Record<string, Set<string>> = Object.fromEntries(
  BRAZIL_SCORERS.map((p) => [p.id, new Set([p.name, ...p.aliases].map(normName))])
);

const nameById: Record<string, string> = Object.fromEntries(
  BRAZIL_SCORERS.map((p) => [p.id, p.name])
);

// Nome de exibição do artilheiro escolhido (ou null se id desconhecido).
export const scorerName = (scorerId: string | null | undefined): string | null =>
  (scorerId && nameById[scorerId]) || null;

// Quantos gols (não contra) o jogador escolhido marcou no jogo. +1 por gol.
// Espelha goalsByPlayer de src/utils/players.ts.
export function countScorerGoals(
  goals: GoalLike[] | undefined | null,
  scorerId: string | null | undefined
): number {
  if (!goals || goals.length === 0 || !scorerId) return 0;
  const aliases = aliasSetById[scorerId];
  if (!aliases) return 0;
  return goals.reduce(
    (acc, g) => (!g.ownGoal && aliases.has(normName(g.scorer)) ? acc + 1 : acc),
    0
  );
}
