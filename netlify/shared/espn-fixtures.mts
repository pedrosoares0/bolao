// ============================================================
// espn-fixtures — ingestão de jogos (agenda + resultados) de QUALQUER liga da
// ESPN, por slug (ex.: 'bra.1' Brasileirão, 'fifa.world' Copa). Diferente do
// espn-core (que só pega placar AO VIVO), este monta a partida completa para
// gravar em `matches` vinculada a uma `season`.
//
// Endpoint: .../sports/soccer/{slug}/scoreboard?dates=YYYYMMDD → eventos do dia.
// Iteramos um intervalo de dias para cobrir a janela desejada.
// ============================================================

const UA = 'Mozilla/5.0 (compatible; Cravei/1.0)';

interface EspnTeam { id?: string; displayName?: string; abbreviation?: string; logo?: string; }
interface EspnCompetitor { homeAway?: string; score?: string; winner?: boolean; team?: EspnTeam; }
interface EspnStatusType { state?: string; completed?: boolean; shortDetail?: string; }
interface EspnCompetition { competitors?: EspnCompetitor[]; status?: { type?: EspnStatusType }; }
interface EspnEvent { id?: string; date?: string; competitions?: EspnCompetition[]; }
interface EspnScoreboard { events?: EspnEvent[]; }

// Linha pronta para upsert em `matches` (mesmas colunas usadas pelo sync atual).
export interface EspnFixtureRow {
  id: number;
  utc_date: string;
  status: string;            // SCHEDULED | IN_PLAY | FINISHED | POSTPONED
  stage: string | null;
  group_name: string | null;
  home_team: string;
  away_team: string;
  home_tla: string;
  away_tla: string;
  home_crest: string;
  away_crest: string;
  home_score: number | null;
  away_score: number | null;
  winner: string | null;     // HOME_TEAM | AWAY_TEAM | DRAW | null
  live_clock: string | null;
  provider: string;          // 'espn'
  season_id: number;
  updated_at: string;
}

const yyyymmdd = (d: Date): string =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;

function mapStatus(type?: EspnStatusType): string {
  const state = type?.state;
  if (state === 'in') return 'IN_PLAY';
  if (state === 'post') return type?.completed ? 'FINISHED' : 'POSTPONED';
  return 'SCHEDULED';
}

function mapEvent(ev: EspnEvent, seasonId: number): EspnFixtureRow | null {
  const id = Number(ev.id);
  if (!id || !ev.date) return null;
  const comp = ev.competitions?.[0];
  const home = comp?.competitors?.find((c) => c.homeAway === 'home');
  const away = comp?.competitors?.find((c) => c.homeAway === 'away');
  if (!home?.team || !away?.team) return null;

  const status = mapStatus(comp?.status?.type);
  const isLive = status === 'IN_PLAY';
  const homeScore = home.score != null && home.score !== '' ? parseInt(home.score, 10) : null;
  const awayScore = away.score != null && away.score !== '' ? parseInt(away.score, 10) : null;

  let winner: string | null = null;
  if (status === 'FINISHED') {
    if (home.winner) winner = 'HOME_TEAM';
    else if (away.winner) winner = 'AWAY_TEAM';
    else winner = 'DRAW';
  }

  return {
    id,
    utc_date: ev.date,
    status,
    stage: null,
    group_name: null,
    home_team: home.team.displayName ?? 'A definir',
    away_team: away.team.displayName ?? 'A definir',
    home_tla: home.team.abbreviation ?? '',
    away_tla: away.team.abbreviation ?? '',
    home_crest: home.team.logo ?? '',
    away_crest: away.team.logo ?? '',
    home_score: homeScore,
    away_score: awayScore,
    winner,
    live_clock: isLive ? (comp?.status?.type?.shortDetail ?? null) : null,
    provider: 'espn',
    season_id: seasonId,
    updated_at: new Date().toISOString(),
  };
}

async function fetchDay(slug: string, day: string): Promise<EspnEvent[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${day}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`ESPN ${slug} respondeu ${res.status}`);
  const data = (await res.json()) as EspnScoreboard;
  return data.events ?? [];
}

/**
 * Busca os jogos de uma liga ESPN num intervalo de dias [startIso, endIso]
 * (UTC, YYYY-MM-DD) e devolve linhas prontas para upsert em `matches`.
 * Limita a janela a `maxDays` para não estourar o tempo da função.
 */
export async function fetchEspnFixtures(
  slug: string,
  seasonId: number,
  startIso: string,
  endIso: string,
  maxDays = 45
): Promise<EspnFixtureRow[]> {
  const start = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  const rows = new Map<number, EspnFixtureRow>();

  let cursor = new Date(start);
  let days = 0;
  while (cursor <= end && days < maxDays) {
    let events: EspnEvent[] = [];
    try {
      events = await fetchDay(slug, yyyymmdd(cursor));
    } catch (err) {
      console.warn(`ESPN fixtures ${slug} dia ${yyyymmdd(cursor)} falhou:`, err);
    }
    for (const ev of events) {
      const row = mapEvent(ev, seasonId);
      if (row) rows.set(row.id, row);
    }
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    days++;
  }

  return Array.from(rows.values());
}
