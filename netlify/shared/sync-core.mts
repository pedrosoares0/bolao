import { createClient } from '@supabase/supabase-js';
import { runNotifications } from './notify-core.mts';
import { fetchEspnOverrides, norm, pairKey } from './espn-core.mts';
import type { EspnGoalDetail } from './espn-core.mts';

// ---- Formato cru de uma partida na football-data.org (só os campos que usamos) ----
interface ApiTeam {
  name?: string;
  tla?: string;
  crest?: string;
}
interface ApiMatch {
  id: number;
  utcDate: string;
  status: string;
  stage?: string | null;
  group?: string | null;
  homeTeam?: ApiTeam | null;
  awayTeam?: ApiTeam | null;
  score?: {
    fullTime?: { home?: number | null; away?: number | null } | null;
    winner?: string | null;
  } | null;
}

// ---- Estado anterior de um jogo (para detectar transições e notificar) ----
interface PrevState {
  id: number;
  status: string;
  home_score: number | null;
  away_score: number | null;
}

// ---- Linha gravada na tabela `matches` (o que montamos para o upsert) ----
interface MatchUpsertRow {
  id: number;
  utc_date: string;
  status: string;
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
  winner: string | null;
  live_clock: string | null;
  updated_at: string;
  homeTeamId?: string;
  awayTeamId?: string;
  goalsDetail?: EspnGoalDetail[];
}

// Busca todos os jogos da Copa 2026 na football-data.org (competição "WC")
// e grava/atualiza na tabela `matches` do Supabase usando a service_role.
// Throttle: se sincronizou há menos de 30 segundos, pula (limite free: 10 req/min).
export async function syncMatches(force = false): Promise<{ skipped: boolean; count?: number; reason?: string }> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;

  if (!supabaseUrl || !serviceKey || !apiKey) {
    throw new Error('Variáveis de ambiente faltando: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e FOOTBALL_DATA_API_KEY.');
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  if (!force) {
    const { data: state } = await supabase.from('sync_state').select('last_sync').eq('id', 1).single();
    if (state?.last_sync && Date.now() - new Date(state.last_sync).getTime() < 30 * 1000) {
      return { skipped: true, reason: 'Sincronizado há menos de 30 segundos.' };
    }
  }

  const res = await fetch('https://api.football-data.org/v4/competitions/WC/matches', {
    headers: { 'X-Auth-Token': apiKey },
  });
  if (!res.ok) {
    throw new Error(`football-data.org respondeu ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { matches?: ApiMatch[] };
  const rows: MatchUpsertRow[] = (data.matches ?? []).map((m): MatchUpsertRow => ({
    id: m.id,
    utc_date: m.utcDate,
    status: m.status,
    stage: m.stage ?? null,
    group_name: m.group ?? null,
    home_team: m.homeTeam?.name ?? 'A definir',
    away_team: m.awayTeam?.name ?? 'A definir',
    home_tla: m.homeTeam?.tla ?? '',
    away_tla: m.awayTeam?.tla ?? '',
    home_crest: m.homeTeam?.crest ?? '',
    away_crest: m.awayTeam?.crest ?? '',
    home_score: m.score?.fullTime?.home ?? null,
    away_score: m.score?.fullTime?.away ?? null,
    winner: m.score?.winner ?? null,
    live_clock: null, // preenchido abaixo com o minuto da ESPN, quando ao vivo
    updated_at: new Date().toISOString(),
  }));

  // ---- AO VIVO via ESPN (best-effort, com fallback no football-data) ----
  // Buscamos o placar/tempo ao vivo na ESPN (mais rápida) e sobrescrevemos as
  // linhas do football-data quando casamos o confronto (por par de seleções +
  // dia). Se a ESPN falhar/cair, `mergedRows` = `rows` e nada muda.
  const mergedRows = await mergeEspnLive(rows);

  if (mergedRows.length > 0) {
    // Estado ANTERIOR (antes de sobrescrever) — usado para detectar
    // transições (começou / gol / intervalo / fim) e notificar o WhatsApp.
    const { data: prevRows } = await supabase
      .from('matches')
      .select('id, status, home_score, away_score')
      .in('id', mergedRows.map((r) => r.id));
    const prevById = new Map(
      ((prevRows ?? []) as PrevState[]).map((r) => [r.id, r] as const)
    );

    const { error } = await supabase.from('matches').upsert(mergedRows);
    if (error) throw new Error(`Erro ao gravar partidas no Supabase: ${error.message}`);

    // Notificações são best-effort: nunca derrubam a sincronização.
    try {
      await runNotifications(supabase, prevById, mergedRows);
    } catch (err) {
      console.error('Falha ao enviar notificações:', err);
    }
  }

  await supabase.from('sync_state').upsert({ id: 1, last_sync: new Date().toISOString() });

  return { skipped: false, count: mergedRows.length };
}

// Sobrepõe o placar/tempo AO VIVO da ESPN nas linhas do football-data.
// É best-effort: se a ESPN cair (rede/403/formato), devolve as linhas
// originais — o football-data continua sendo a fonte (fallback).
async function mergeEspnLive(rows: MatchUpsertRow[]): Promise<MatchUpsertRow[]> {
  let overrides;
  try {
    overrides = await fetchEspnOverrides();
  } catch (err) {
    console.warn('ESPN indisponível — usando football-data (fallback):', err);
    return rows;
  }
  if (overrides.size === 0) return rows;

  let applied = 0;
  const merged = rows.map((r) => {
    const ov = overrides.get(pairKey(r.home_team, r.away_team));
    if (!ov) return r;
    // Confere que é o MESMO dia (UTC) — evita casar um confronto que se repete
    // (ex.: mesmas seleções na fase de grupos e depois no mata-mata).
    if (ov.dateIso && r.utc_date.slice(0, 10) !== ov.dateIso) return r;
    // Alinha o placar à orientação (mandante/visitante) do football-data,
    // caso a ESPN liste os times na ordem inversa.
    const fdHomeIsEspnHome = norm(r.home_team) === ov.homeNorm;
    applied++;
    return {
      ...r,
      status: ov.status,
      home_score: fdHomeIsEspnHome ? ov.homeScore : ov.awayScore,
      away_score: fdHomeIsEspnHome ? ov.awayScore : ov.homeScore,
      live_clock: ov.liveClock,
      homeTeamId: fdHomeIsEspnHome ? ov.homeTeamId : ov.awayTeamId,
      awayTeamId: fdHomeIsEspnHome ? ov.awayTeamId : ov.homeTeamId,
      goalsDetail: ov.goalsDetail,
    };
  });

  if (applied > 0) console.log(`ESPN: placar ao vivo aplicado em ${applied} jogo(s).`);
  return merged;
}
