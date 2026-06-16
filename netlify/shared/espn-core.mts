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

// ---- Override de um jogo segundo a ESPN (só ao vivo ou encerrado) ----
export interface EspnOverride {
  status: 'IN_PLAY' | 'FINISHED';
  homeScore: number;
  awayScore: number;
  liveClock: string | null; // minuto/etapa enquanto ao vivo; null quando encerrado
  homeNorm: string;         // nome normalizado do mandante (p/ alinhar o placar)
  dateIso: string;          // dia do jogo em UTC (YYYY-MM-DD), p/ conferência
}

// ---- Formato (parcial) do scoreboard da ESPN ----
interface EspnTeam { displayName?: string; name?: string; }
interface EspnCompetitor { homeAway?: string; score?: string; team?: EspnTeam; }
interface EspnStatusType { state?: string; completed?: boolean; shortDetail?: string; }
interface EspnCompetition { competitors?: EspnCompetitor[]; status?: { type?: EspnStatusType }; }
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
export async function fetchEspnOverrides(): Promise<Map<string, EspnOverride>> {
  const res = await fetch(
    'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard',
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

    map.set(pairKey(homeName, awayName), {
      status: isLive ? 'IN_PLAY' : 'FINISHED',
      homeScore: parseInt(home?.score ?? '0', 10) || 0,
      awayScore: parseInt(away?.score ?? '0', 10) || 0,
      liveClock: isLive ? (type?.shortDetail ?? null) : null,
      homeNorm: norm(homeName),
      dateIso: (ev.date ?? '').slice(0, 10),
    });
  }

  return map;
}
