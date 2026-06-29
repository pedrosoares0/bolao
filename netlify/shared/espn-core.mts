// ============================================================
// espn-core — placar e tempo AO VIVO da API pública (não documentada) da ESPN.
//
// Por que a ESPN: é grátis, sem chave, responde a servidor (sem Cloudflare),
// já tem a Copa 2026 e atualiza o ao vivo muito mais rápido que o football-data
// no plano free. Usamos só como "turbo" do ao vivo — o football-data continua
// dono dos jogos/IDs e é o fallback (ver sync-core.mts).
//
// Endpoint: .../sports/soccer/fifa.world/scoreboard → jogos do dia (ao vivo,
// agendados e encerrados), em JSON. Cada jogo traz status.type.state
// ("pre" | "in" | "post"), placar e o relógio (shortDetail, ex.: "28'").
// ============================================================

export interface EspnGoalDetail {
  teamId: string;
  scorer: string;
  minute: string;
  ownGoal: boolean;
}

// ---- Override de um jogo segundo a ESPN (só ao vivo ou encerrado) ----
export interface EspnOverride {
  status: 'IN_PLAY' | 'FINISHED';
  homeScore: number;
  awayScore: number;
  homePens: number | null; // gols na disputa de pênaltis (null se não houve)
  awayPens: number | null;
  liveClock: string | null; // minuto/etapa enquanto ao vivo; null quando encerrado
  homeNorm: string;         // nome normalizado do mandante (p/ alinhar o placar)
  dateIso: string;          // dia do jogo em UTC (YYYY-MM-DD), p/ conferência
  homeTeamId: string;
  awayTeamId: string;
  goalsDetail: EspnGoalDetail[];
}

// ---- Formato (parcial) do scoreboard da ESPN ----
interface EspnTeam { id?: string; displayName?: string; name?: string; }
interface EspnCompetitor { homeAway?: string; score?: string; shootoutScore?: string | number; team?: EspnTeam; }
interface EspnStatusType { state?: string; completed?: boolean; shortDetail?: string; }
interface EspnAthlete { displayName?: string; fullName?: string; }
interface EspnDetail {
  type?: { text?: string };
  scoringPlay?: boolean;
  team?: { id?: string };
  athletesInvolved?: EspnAthlete[];
  clock?: { displayValue?: string };
  ownGoal?: boolean;
}
interface EspnCompetition { competitors?: EspnCompetitor[]; status?: { type?: EspnStatusType }; details?: EspnDetail[]; }
interface EspnEvent { date?: string; competitions?: EspnCompetition[]; }
interface EspnScoreboard { events?: EspnEvent[]; }

// Apelidos de seleções cujo nome difere entre ESPN e football-data.
// Mapeia a forma "normalizada" de cada variante para um nome canônico comum.
const ALIAS: Record<string, string> = {
  usa: 'unitedstates',
  unitedstatesofamerica: 'unitedstates',
  korearepublic: 'southkorea',
  iriran: 'iran',
  cotedivoire: 'ivorycoast',
  drcongo: 'congodr',
  democraticrepublicofthecongo: 'congodr',
  capeverdeislands: 'capeverde',
  caboverde: 'capeverde',
  bosniaandherzegovina: 'bosniaherzegovina',
  czechrepublic: 'czechia',
  turkiye: 'turkey',
};

// Normaliza um nome de seleção: sem acento, minúsculo, só letras/números,
// e aplica o apelido canônico — para casar ESPN × football-data com segurança.
export const norm = (s: string): string => {
  const base = (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos (marcas diacríticas)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return ALIAS[base] ?? base;
};

// Chave de um confronto independentemente de quem é mandante (par ordenado)
export const pairKey = (teamA: string, teamB: string): string =>
  [norm(teamA), norm(teamB)].sort().join('|');

// Busca o scoreboard da Copa na ESPN e devolve os overrides (só jogos ao vivo
// ou encerrados), indexados pela chave do confronto. Lança erro se a ESPN
// falhar — quem chama trata como "sem ESPN" e segue no football-data.
export async function fetchEspnOverrides(dateKey?: string): Promise<Map<string, EspnOverride>> {
  // Sem dateKey: scoreboard do dia (ao vivo). Com dateKey (AAAAMMDD): os jogos
  // daquele dia — usado pelo backfill de gols de jogos já encerrados, que a
  // ESPN não lista mais no scoreboard "de hoje".
  const base = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
  const res = await fetch(
    dateKey ? `${base}?dates=${dateKey}` : base,
    { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BolaoBandidos/1.0)' } }
  );
  if (!res.ok) throw new Error(`ESPN respondeu ${res.status}`);

  const data = (await res.json()) as EspnScoreboard;
  const map = new Map<string, EspnOverride>();

  for (const ev of data.events ?? []) {
    const comp = ev.competitions?.[0];
    const type = comp?.status?.type;
    const state = type?.state;

    // Só nos interessam jogos AO VIVO ('in') ou de fato ENCERRADOS ('post' +
    // completed). Agendados/adiados ficam de fora — football-data cuida deles.
    const isLive = state === 'in';
    const isDone = state === 'post' && type?.completed === true;
    if (!isLive && !isDone) continue;

    const home = comp?.competitors?.find((c) => c.homeAway === 'home');
    const away = comp?.competitors?.find((c) => c.homeAway === 'away');
    const homeName = home?.team?.displayName ?? home?.team?.name ?? '';
    const awayName = away?.team?.displayName ?? away?.team?.name ?? '';
    if (!homeName || !awayName) continue;

    const goalsDetail: EspnGoalDetail[] = [];
    if (comp?.details) {
      for (const d of comp.details) {
        if (d.type?.text?.toLowerCase() === 'goal' || d.scoringPlay === true) {
          const teamId = d.team?.id ?? '';
          const scorer = d.athletesInvolved?.[0]?.displayName || d.athletesInvolved?.[0]?.fullName || '';
          const minute = d.clock?.displayValue || '';
          const ownGoal = d.ownGoal === true;
          goalsDetail.push({ teamId, scorer, minute, ownGoal });
        }
      }
    }

    // Pênaltis: a ESPN só preenche shootoutScore quando houve disputa. Vem como
    // string/número; ausente ou vazio = não houve (null, não 0).
    const pens = (raw: string | number | undefined): number | null => {
      if (raw === undefined || raw === null || raw === '') return null;
      const n = typeof raw === 'number' ? raw : parseInt(raw, 10);
      return Number.isNaN(n) ? null : n;
    };
    const homePens = pens(home?.shootoutScore);
    const awayPens = pens(away?.shootoutScore);

    map.set(pairKey(homeName, awayName), {
      status: isLive ? 'IN_PLAY' : 'FINISHED',
      homeScore: parseInt(home?.score ?? '0', 10) || 0,
      awayScore: parseInt(away?.score ?? '0', 10) || 0,
      homePens,
      awayPens,
      liveClock: isLive ? (type?.shortDetail ?? null) : null,
      homeNorm: norm(homeName),
      dateIso: (ev.date ?? '').slice(0, 10),
      homeTeamId: home?.team?.id ?? '',
      awayTeamId: away?.team?.id ?? '',
      goalsDetail,
    });
  }

  return map;
}

// ---- Confronto do mata-mata segundo a ESPN (mandante/visitante por kickoff) ----
// A ESPN já posiciona nos cards do mata-mata as seleções JÁ DEFINIDAS (ex.:
// "Brazil" nos 16avos) enquanto o adversário ainda é um placeholder textual
// ("Group F 2nd Place", "Round of 32 1 Winner"). Diferente do football-data —
// que mantém os dois lados nulos até a fase de grupos fechar — a ESPN antecipa
// o que já dá pra antecipar. Devolvemos o nome cru de cada lado (incl. o
// placeholder); quem chama decide o que é seleção real (ver sync-core).
export interface EspnKnockoutSlot {
  kickoffMs: number; // início do jogo (epoch ms) — chave p/ casar com o football-data
  home: string;      // nome do mandante como a ESPN reporta (pode ser placeholder)
  away: string;      // idem visitante
}

// Busca o scoreboard de UMA data (AAAAMMDD) e devolve os confrontos do dia com
// o nome cru de cada lado. Lança erro se a ESPN falhar — quem chama trata como
// "sem ESPN" e segue. Não filtra por status: pega jogos agendados ('pre') também,
// que é justamente o caso do mata-mata ainda por vir.
export async function fetchEspnKnockout(dateKey: string): Promise<EspnKnockoutSlot[]> {
  const base = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
  // Cache-buster (`_`): a CDN da ESPN às vezes serve um snapshot PARCIAL/velho
  // (com placeholders onde já há seleção definida), e o conteúdo varia por nó.
  // Forçar uma URL única a cada chamada reduz a chance de cair num cache estagnado
  // e devolve o estado mais fresco. Combinado com as múltiplas passadas no backfill.
  const res = await fetch(`${base}?dates=${dateKey}&_=${Date.now()}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; BolaoBandidos/1.0)',
      'Cache-Control': 'no-cache',
    },
  });
  if (!res.ok) throw new Error(`ESPN respondeu ${res.status}`);

  const data = (await res.json()) as EspnScoreboard;
  const out: EspnKnockoutSlot[] = [];
  for (const ev of data.events ?? []) {
    const comp = ev.competitions?.[0];
    const home = comp?.competitors?.find((c) => c.homeAway === 'home');
    const away = comp?.competitors?.find((c) => c.homeAway === 'away');
    const homeName = home?.team?.displayName ?? home?.team?.name ?? '';
    const awayName = away?.team?.displayName ?? away?.team?.name ?? '';
    const kickoffMs = Date.parse(ev.date ?? '');
    if (!kickoffMs || (!homeName && !awayName)) continue;
    out.push({ kickoffMs, home: homeName, away: awayName });
  }
  return out;
}
