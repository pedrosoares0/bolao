// ============================================================
// Jogadores do Brasil disponíveis para o palpite de artilheiro por jogo.
// Fonte única (usada pela UI em App.tsx e pela pontuação em rules.ts).
//
// `aliases` lista as formas como a ESPN pode escrever o nome do autor do gol
// (ver goalsDetail em netlify/shared/espn-core.mts). A comparação é por nome
// NORMALIZADO (sem acento, minúsculo, só letras/números) e EXATA contra um
// dos aliases — exata de propósito, pra não creditar gol de homônimo.
// Se a ESPN usar um nome fora da lista, o gol não credita: nesse caso é só
// adicionar o alias aqui.
// ============================================================
import type { MatchGoal } from '../types';

export interface BrazilPlayer {
  id: string;
  name: string;
  img: string;
  aliases: string[];
}

export const BRAZIL_PLAYERS: BrazilPlayer[] = [
  { id: 'vinijr', name: 'Vini Jr', img: 'https://img.sofascore.com/api/v1/player/868812/image', aliases: ['Vinicius Junior', 'Vinícius Júnior', 'Vinicius Jr', 'Vini Jr', 'Vinicius'] },
  { id: 'paqueta', name: 'Paquetá', img: 'https://img.sofascore.com/api/v1/player/839981/image', aliases: ['Lucas Paqueta', 'Lucas Paquetá', 'Paqueta', 'Paquetá'] },
  { id: 'raphinha', name: 'Raphinha', img: 'https://img.sofascore.com/api/v1/player/831005/image', aliases: ['Raphinha', 'Raphael Dias Belloli'] },
  { id: 'igorthiago', name: 'Igor Thiago', img: 'https://img.sofascore.com/api/v1/player/1016907/image', aliases: ['Igor Thiago', 'Igor Thiago Nascimento'] },
  { id: 'endrick', name: 'Endrick', img: 'https://img.sofascore.com/api/v1/player/1174937/image', aliases: ['Endrick', 'Endrick Felipe'] },
  { id: 'matheuscunha', name: 'M. Cunha', img: 'https://img.sofascore.com/api/v1/player/886363/image', aliases: ['Matheus Cunha', 'M. Cunha'] },
  { id: 'rayan', name: 'Rayan', img: 'https://img.sofascore.com/api/v1/player/1464966/image', aliases: ['Rayan', 'Rayan Vitor'] },
  { id: 'luizhenrique', name: 'L. Henrique', img: 'https://img.sofascore.com/api/v1/player/1035995/image', aliases: ['Luiz Henrique', 'L. Henrique'] },
];

// Normaliza um nome para comparação (sem acento, minúsculo, só [a-z0-9]).
const normPlayerName = (s: string): string =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

// Set de aliases normalizados de cada jogador (inclui o próprio `name`).
const aliasSetById: Record<string, Set<string>> = Object.fromEntries(
  BRAZIL_PLAYERS.map((p) => [
    p.id,
    new Set([p.name, ...p.aliases].map(normPlayerName)),
  ])
);

// Quantos gols (NÃO contra) o jogador escolhido marcou no jogo.
// +1 por gol → 2 gols do jogador valem 2 pontos.
export function goalsByPlayer(goals: MatchGoal[] | undefined | null, playerId: string | null | undefined): number {
  if (!goals || goals.length === 0 || !playerId) return 0;
  const aliases = aliasSetById[playerId];
  if (!aliases) return 0;
  return goals.reduce(
    (acc, g) => (!g.ownGoal && aliases.has(normPlayerName(g.scorer)) ? acc + 1 : acc),
    0
  );
}
