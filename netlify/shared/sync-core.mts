import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { runNotifications } from './notify-core.mts';
import { fetchEspnOverrides, fetchEspnKnockout, norm, pairKey } from './espn-core.mts';
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
    // ATENÇÃO: em jogo decidido nos pênaltis, a football-data SOMA tempo normal +
    // pênaltis no fullTime (ex.: regular 1-1 + pênaltis 3-4 => fullTime 4-5). O
    // placar "de verdade" (o empate que levou à disputa) é regularTime + extraTime,
    // e os gols da disputa ficam em penalties. Ver o parsing em syncMatches.
    fullTime?: { home?: number | null; away?: number | null } | null;
    regularTime?: { home?: number | null; away?: number | null } | null;
    extraTime?: { home?: number | null; away?: number | null } | null;
    penalties?: { home?: number | null; away?: number | null } | null;
    duration?: string | null;
    winner?: string | null;
  } | null;
}

// Separa o placar "de verdade" dos gols da disputa de pênaltis.
//
// Pegadinha da football-data v4: num jogo decidido nos pênaltis, o `fullTime`
// vem SOMADO (tempo normal/prorrogação + pênaltis). Ex.: regular 1-1 + pênaltis
// 3-4 => fullTime 4-5. Se gravássemos o fullTime em home_score/away_score, a
// regra de pontuação acharia que foi 4-5 no tempo normal (vitória simples), não
// 1-1 decidido nos pênaltis — quebrando o cálculo e o "1 (4)" do card.
//
// Solução: quando há `penalties`, o placar é regularTime + extraTime (o empate
// ao fim dos 120') e a disputa vai para home_pens/away_pens. Sem `penalties`
// (jogo normal ou decidido na prorrogação por gol), o fullTime já é o correto.
export function splitScoreAndPens(score: ApiMatch['score']): {
  home_score: number | null;
  away_score: number | null;
  home_pens: number | null;
  away_pens: number | null;
} {
  let home_score = score?.fullTime?.home ?? null;
  let away_score = score?.fullTime?.away ?? null;
  let home_pens: number | null = null;
  let away_pens: number | null = null;

  const pens = score?.penalties;
  if (pens?.home != null && pens?.away != null) {
    home_pens = pens.home;
    away_pens = pens.away;
    const rh = score?.regularTime?.home;
    const ra = score?.regularTime?.away;
    if (rh != null && ra != null) {
      home_score = rh + (score?.extraTime?.home ?? 0);
      away_score = ra + (score?.extraTime?.away ?? 0);
    } else if (home_score != null && away_score != null) {
      // Fallback (sem regularTime): fullTime - pênaltis.
      home_score = home_score - pens.home;
      away_score = away_score - pens.away;
    }
  }

  return { home_score, away_score, home_pens, away_pens };
}

// ---- Estado anterior de um jogo (para detectar transições e notificar) ----
// Inclui os times já gravados — usados para preservar a seleção do mata-mata
// já conhecida (preserveKnownTeams) e não rebaixá-la a 'A definir'.
interface PrevState {
  id: number;
  status: string;
  home_score: number | null;
  away_score: number | null;
  home_team?: string | null;
  away_team?: string | null;
  home_tla?: string | null;
  away_tla?: string | null;
  home_crest?: string | null;
  away_crest?: string | null;
}

// Placeholder de seleção indefinida (mandante/visitante ainda por decidir).
const TBD = 'A definir';
const isTbd = (s: string | null | undefined): boolean => !s || s === TBD;

// Fases do mata-mata (tudo que não é a fase de grupos).
const KNOCKOUT_STAGES = ['LAST_32', 'LAST_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'THIRD_PLACE', 'FINAL'];

// Mantém "grudenta" a seleção do mata-mata já conhecida: quando a linha nova vem
// com 'A definir' num lado mas já havia uma seleção real gravada, conserva a real
// (com tla/crest). Nunca faz o contrário (uma seleção real nunca vira 'A definir').
function preserveKnownTeams(rows: MatchUpsertRow[], prevById: Map<number, PrevState>): void {
  for (const r of rows) {
    const p = prevById.get(r.id);
    if (!p) continue;
    if (isTbd(r.home_team) && !isTbd(p.home_team)) {
      r.home_team = p.home_team as string;
      r.home_tla = p.home_tla ?? r.home_tla;
      r.home_crest = p.home_crest ?? r.home_crest;
    }
    if (isTbd(r.away_team) && !isTbd(p.away_team)) {
      r.away_team = p.away_team as string;
      r.away_tla = p.away_tla ?? r.away_tla;
      r.away_crest = p.away_crest ?? r.away_crest;
    }
  }
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
  home_pens: number | null;
  away_pens: number | null;
  winner: string | null;
  live_clock: string | null;
  updated_at: string;
  homeTeamId?: string;
  awayTeamId?: string;
  goalsDetail?: EspnGoalDetail[];
}

// Campos transitórios usados só pelas notificações (não são colunas de `matches`).
// Removê-los antes de qualquer upsert evita o erro de "coluna inexistente".
function toDbRow(r: MatchUpsertRow) {
  const dbRow = { ...r };
  delete dbRow.homeTeamId;
  delete dbRow.awayTeamId;
  delete dbRow.goalsDetail;
  return dbRow;
}

// Persiste os autores dos gols (coluna matches.goals jsonb) para pontuar o
// palpite de artilheiro. SÓ grava quando a ESPN trouxe gols — nunca limpa a
// coluna com [] (a ESPN para de listar o jogo após o dia, então um jogo antigo
// não pode perder os gols já salvos). Best-effort: não derruba a sincronização.
async function persistGoals(
  supabase: SupabaseClient,
  rows: { id: number; goalsDetail?: EspnGoalDetail[] }[]
): Promise<void> {
  const goalRows = rows
    .filter((r) => r.goalsDetail && r.goalsDetail.length > 0)
    .map((r) => ({ id: r.id, goals: r.goalsDetail! }));
  if (goalRows.length === 0) return;
  const { error } = await supabase.from('matches').upsert(goalRows);
  if (error) console.error('Erro ao gravar gols (artilheiro):', error.message);
}

// YYYYMMDD (UTC) para o parâmetro ?dates= da ESPN
const ymdKey = (utc: string): string => utc.slice(0, 10).replace(/-/g, '');
// YYYY-MM-DD (UTC) do dia anterior — a ESPN guarda jogos de madrugada (UTC)
// no bucket do dia anterior (fuso US), então buscamos os dois dias.
const prevYmdKey = (utc: string): string => {
  const d = new Date(`${utc.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
};

// Recupera os autores dos gols de jogos JÁ ENCERRADOS cujo `goals` ficou nulo
// (o live-loop não capturou o gol na hora e a ESPN parou de listar o jogo no
// scoreboard "de hoje"). Busca a ESPN por data (dia do kickoff + o anterior,
// p/ jogos de madrugada) e grava só quando casa o confronto e a data UTC.
// Best-effort e throttled (~15 min) — não derruba a sincronização.
const GOALS_BACKFILL_THROTTLE_MS = 15 * 60 * 1000;
const GOALS_BACKFILL_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000; // só jogos dos últimos 7 dias

export async function backfillMissingGoals(
  supabase: SupabaseClient,
  force = false
): Promise<{ skipped: boolean; filled?: number; reason?: string }> {
  if (!force) {
    const { data: state } = await supabase
      .from('sync_state')
      .select('last_goals_backfill')
      .eq('id', 1)
      .single();
    const last = state?.last_goals_backfill ? new Date(state.last_goals_backfill).getTime() : 0;
    if (Date.now() - last < GOALS_BACKFILL_THROTTLE_MS) {
      return { skipped: true, reason: 'Backfill de gols feito há pouco.' };
    }
  }
  // Marca o tempo já aqui (mesmo sem nada a fazer) para o throttle valer.
  await supabase.from('sync_state').upsert({ id: 1, last_goals_backfill: new Date().toISOString() });

  const sinceIso = new Date(Date.now() - GOALS_BACKFILL_LOOKBACK_MS).toISOString();
  const { data: missing } = await supabase
    .from('matches')
    .select('id, utc_date, home_team, away_team')
    .eq('status', 'FINISHED')
    .is('goals', null)
    .gte('utc_date', sinceIso);
  if (!missing || missing.length === 0) return { skipped: false, filled: 0 };

  // Datas a consultar na ESPN (dia do kickoff + dia anterior), sem repetir.
  const dateKeys = new Set<string>();
  for (const m of missing as { utc_date: string }[]) {
    dateKeys.add(ymdKey(m.utc_date));
    dateKeys.add(prevYmdKey(m.utc_date));
  }

  // Overrides da ESPN por confronto (mantém o que tiver gols).
  const byPair = new Map<string, { dateIso: string; goalsDetail: EspnGoalDetail[] }>();
  for (const dk of dateKeys) {
    try {
      const ov = await fetchEspnOverrides(dk);
      ov.forEach((v, k) => {
        if (v.goalsDetail && v.goalsDetail.length > 0 && !byPair.has(k)) {
          byPair.set(k, { dateIso: v.dateIso, goalsDetail: v.goalsDetail });
        }
      });
    } catch (err) {
      console.warn(`Backfill: ESPN falhou para ${dk}:`, err);
    }
  }

  const goalRows: { id: number; goals: EspnGoalDetail[] }[] = [];
  for (const m of missing as { id: number; utc_date: string; home_team: string; away_team: string }[]) {
    const ov = byPair.get(pairKey(m.home_team, m.away_team));
    // Confere a data UTC do jogo (evita casar um confronto que se repete).
    if (!ov || ov.dateIso !== m.utc_date.slice(0, 10)) continue;
    goalRows.push({ id: m.id, goals: ov.goalsDetail });
  }
  if (goalRows.length === 0) return { skipped: false, filled: 0 };

  const { error } = await supabase.from('matches').upsert(goalRows);
  if (error) {
    console.error('Backfill: erro ao gravar gols:', error.message);
    return { skipped: false, filled: 0 };
  }
  console.log(`Backfill: gols recuperados em ${goalRows.length} jogo(s).`);
  return { skipped: false, filled: goalRows.length };
}

// Preenche as seleções do mata-mata JÁ DEFINIDAS usando a ESPN, enquanto o
// football-data ainda deixa os dois lados nulos ('A definir'). A ESPN antecipa
// quem já se classificou (ex.: "Brazil" nos 16avos) e mantém o adversário como
// placeholder textual — então casamos cada jogo do banco com o card da ESPN pelo
// HORÁRIO DE INÍCIO (kickoff bate ao minuto entre as duas APIs) e preenchemos só
// o lado cujo nome da ESPN casa com uma seleção REAL da Copa (as da fase de
// grupos). Placeholders ("Group F 2nd Place", "Round of 32 1 Winner") são
// ignorados. Best-effort e throttled (~5 min) — não derruba a sincronização.
// O preserveKnownTeams (no syncMatches) garante que esse preenchimento não seja
// zerado pelo próximo sync que ainda receba 'A definir' do football-data.
const KO_BACKFILL_THROTTLE_MS = 5 * 60 * 1000;
const KO_HORIZON_MS = 14 * 24 * 60 * 60 * 1000; // só olha o mata-mata dos próximos ~14 dias
const KO_ESPN_PASSES = 3; // passadas por data na ESPN (uniões cobrem snapshots parciais)

export async function backfillKnockoutTeams(
  supabase: SupabaseClient,
  force = false
): Promise<{ skipped: boolean; filled?: number; reason?: string }> {
  if (!force) {
    const { data: state } = await supabase
      .from('sync_state')
      .select('last_ko_backfill')
      .eq('id', 1)
      .single();
    const last = state?.last_ko_backfill ? new Date(state.last_ko_backfill).getTime() : 0;
    if (Date.now() - last < KO_BACKFILL_THROTTLE_MS) {
      return { skipped: true, reason: 'Backfill de mata-mata feito há pouco.' };
    }
  }
  // Marca o tempo já aqui (mesmo sem nada a fazer) para o throttle valer.
  await supabase.from('sync_state').upsert({ id: 1, last_ko_backfill: new Date().toISOString() });

  // Jogos do mata-mata com algum lado ainda indefinido.
  const { data: koData } = await supabase
    .from('matches')
    .select('id, utc_date, stage, home_team, away_team, home_tla, away_tla, home_crest, away_crest')
    .in('stage', KNOCKOUT_STAGES);
  const missing = (koData ?? []).filter(
    (m) => isTbd(m.home_team) || isTbd(m.away_team)
  ) as KnockoutDbRow[];
  if (missing.length === 0) return { skipped: false, filled: 0 };

  // Índice das seleções REAIS da Copa (nome normalizado -> nome/tla/crest do
  // football-data), montado a partir da fase de grupos. Serve para (a) decidir
  // se o nome que a ESPN traz é uma seleção de verdade e (b) gravar o nome no
  // padrão do football-data (que o front usa p/ tradução, bandeira e cores).
  const { data: gsData } = await supabase
    .from('matches')
    .select('home_team, away_team, home_tla, away_tla, home_crest, away_crest')
    .eq('stage', 'GROUP_STAGE');
  const known = new Map<string, { name: string; tla: string; crest: string }>();
  for (const g of (gsData ?? []) as KnockoutDbRow[]) {
    if (!isTbd(g.home_team)) known.set(norm(g.home_team!), { name: g.home_team!, tla: g.home_tla ?? '', crest: g.home_crest ?? '' });
    if (!isTbd(g.away_team)) known.set(norm(g.away_team!), { name: g.away_team!, tla: g.away_tla ?? '', crest: g.away_crest ?? '' });
  }
  if (known.size === 0) return { skipped: false, filled: 0 };

  // Datas (AAAAMMDD) a consultar na ESPN: só os jogos faltantes dos próximos
  // ~14 dias (a ESPN só define a seleção perto da fase). Sem repetir.
  const horizon = Date.now() + KO_HORIZON_MS;
  const dateKeys = new Set<string>();
  for (const m of missing) {
    if (Date.parse(m.utc_date) <= horizon) dateKeys.add(ymdKey(m.utc_date));
  }
  if (dateKeys.size === 0) return { skipped: false, filled: 0 };

  // Cards da ESPN indexados pelo horário de início (epoch ms). Cada lado guarda
  // o MELHOR nome visto: uma seleção real (presente em `known`) sempre vence um
  // placeholder. Como a ESPN serve fatias parciais (umas chamadas trazem uns
  // times definidos, outras trazem outros), fazemos VÁRIAS passadas por data e
  // unimos — assim um lado que veio placeholder numa passada é preenchido por
  // outra que o trouxe real, em vez de "primeiro card vence" (que perdia times).
  const isReal = (name: string): boolean => known.has(norm(name));
  const byKick = new Map<number, { home: string; away: string }>();
  const mergeSide = (cur: string, next: string): string =>
    isReal(next) ? next : (cur && isReal(cur) ? cur : (cur || next));
  for (let pass = 0; pass < KO_ESPN_PASSES; pass += 1) {
    for (const dk of dateKeys) {
      try {
        const slots = await fetchEspnKnockout(dk);
        for (const s of slots) {
          const cur = byKick.get(s.kickoffMs) ?? { home: '', away: '' };
          byKick.set(s.kickoffMs, { home: mergeSide(cur.home, s.home), away: mergeSide(cur.away, s.away) });
        }
      } catch (err) {
        console.warn(`Backfill mata-mata: ESPN falhou para ${dk} (passada ${pass + 1}):`, err);
      }
    }
  }
  if (byKick.size === 0) return { skipped: false, filled: 0 };

  // Monta os updates: só o(s) lado(s) faltante(s) que a ESPN já definiu.
  const updates: Partial<MatchUpsertRow>[] = [];
  for (const m of missing) {
    const slot = byKick.get(Date.parse(m.utc_date));
    if (!slot) continue;
    const upd: Partial<MatchUpsertRow> & { id: number } = { id: m.id };
    let changed = false;
    if (isTbd(m.home_team)) {
      const k = known.get(norm(slot.home));
      if (k) { upd.home_team = k.name; upd.home_tla = k.tla; upd.home_crest = k.crest; changed = true; }
    }
    if (isTbd(m.away_team)) {
      const k = known.get(norm(slot.away));
      if (k) { upd.away_team = k.name; upd.away_tla = k.tla; upd.away_crest = k.crest; changed = true; }
    }
    if (changed) updates.push(upd);
  }
  if (updates.length === 0) return { skipped: false, filled: 0 };

  const { error } = await supabase.from('matches').upsert(updates);
  if (error) {
    console.error('Backfill mata-mata: erro ao gravar:', error.message);
    return { skipped: false, filled: 0 };
  }
  console.log(`Backfill mata-mata: ${updates.length} confronto(s) preenchido(s) via ESPN.`);
  return { skipped: false, filled: updates.length };
}

// Linha de `matches` lida para o backfill do mata-mata (só as colunas usadas).
interface KnockoutDbRow {
  id: number;
  utc_date: string;
  stage: string | null;
  home_team: string | null;
  away_team: string | null;
  home_tla: string | null;
  away_tla: string | null;
  home_crest: string | null;
  away_crest: string | null;
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
  const rows: MatchUpsertRow[] = (data.matches ?? []).map((m): MatchUpsertRow => {
    const { home_score, away_score, home_pens, away_pens } = splitScoreAndPens(m.score);
    return {
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
      home_score,
      away_score,
      home_pens, // football-data v4 traz penalties; a ESPN ainda pode sobrescrever abaixo
      away_pens,
      winner: m.score?.winner ?? null,
      live_clock: null, // preenchido abaixo com o minuto da ESPN, quando ao vivo
      updated_at: new Date().toISOString(),
    };
  });

  // ---- AO VIVO via ESPN (best-effort, com fallback no football-data) ----
  // Buscamos o placar/tempo ao vivo na ESPN (mais rápida) e sobrescrevemos as
  // linhas do football-data quando casamos o confronto (por par de seleções +
  // dia). Se a ESPN falhar/cair, `mergedRows` = `rows` e nada muda.
  const mergedRows = await mergeEspnLive(rows);

  if (mergedRows.length > 0) {
    // Estado ANTERIOR (antes de sobrescrever) — usado para detectar
    // transições (começou / gol / intervalo / fim) e notificar o WhatsApp, e
    // também para PRESERVAR o time do mata-mata já conhecido (ver abaixo).
    const { data: prevRows } = await supabase
      .from('matches')
      .select('id, status, home_score, away_score, home_team, away_team, home_tla, away_tla, home_crest, away_crest')
      .in('id', mergedRows.map((r) => r.id));
    const prevById = new Map(
      ((prevRows ?? []) as PrevState[]).map((r) => [r.id, r] as const)
    );

    // Time "grudento" no mata-mata: o football-data devolve os dois lados nulos
    // ('A definir') enquanto a fase de grupos não fecha, e a API free ainda serve
    // snapshots inconsistentes — então um confronto já preenchido (pelo backfill
    // da ESPN, abaixo) poderia ser ZERADO de volta pra 'A definir' no próximo
    // sync. Aqui garantimos: nunca rebaixar uma seleção já conhecida para 'A
    // definir' (só substituímos placeholder por nome real, nunca o contrário).
    preserveKnownTeams(mergedRows, prevById);

    // Remove os campos transitórios (homeTeamId/awayTeamId/goalsDetail) que NÃO
    // são colunas da tabela — eles servem só às notificações abaixo. Sem isso, o
    // upsert quebraria assim que a ESPN aplicasse overrides (jogo ao vivo).
    const { error } = await supabase.from('matches').upsert(mergedRows.map(toDbRow));
    if (error) throw new Error(`Erro ao gravar partidas no Supabase: ${error.message}`);

    // Autores dos gols (artilheiro) — gravados à parte, só quando há gols.
    await persistGoals(supabase, mergedRows);

    // Notificações são best-effort: nunca derrubam a sincronização.
    try {
      await runNotifications(supabase, prevById, mergedRows);
    } catch (err) {
      console.error('Falha ao enviar notificações:', err);
    }
  }

  await supabase.from('sync_state').upsert({ id: 1, last_sync: new Date().toISOString() });

  // Recupera gols faltantes de jogos encerrados (throttle próprio ~15 min).
  // Best-effort: nunca derruba a sincronização.
  try {
    await backfillMissingGoals(supabase);
  } catch (err) {
    console.error('Falha no backfill de gols:', err);
  }

  // Preenche as seleções já definidas do mata-mata via ESPN (throttle ~5 min).
  // Best-effort: nunca derruba a sincronização.
  try {
    await backfillKnockoutTeams(supabase);
  } catch (err) {
    console.error('Falha no backfill de mata-mata:', err);
  }

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
      home_pens: fdHomeIsEspnHome ? ov.homePens : ov.awayPens,
      away_pens: fdHomeIsEspnHome ? ov.awayPens : ov.homePens,
      live_clock: ov.liveClock,
      homeTeamId: fdHomeIsEspnHome ? ov.homeTeamId : ov.awayTeamId,
      awayTeamId: fdHomeIsEspnHome ? ov.awayTeamId : ov.homeTeamId,
      goalsDetail: ov.goalsDetail,
    };
  });

  if (applied > 0) console.log(`ESPN: placar ao vivo aplicado em ${applied} jogo(s).`);
  return merged;
}

// ---- Linha de `matches` lida do banco para casar com a ESPN no caminho ao vivo ----
interface LiveDbRow {
  id: number;
  utc_date: string;
  status: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  live_clock: string | null;
}

// Sincronização AO VIVO — caminho rápido e barato: bate SÓ na ESPN (grátis, sem
// chave) e atualiza apenas placar/minuto/etapa dos jogos já existentes no banco.
// Não chama o football-data, então pode ser acionada com frequência (polling do
// front a cada ~10s) sem encostar no limite de 10 req/min. O `syncMatches`
// completo (cron de 1 min) continua dono da tabela/IDs/resultados oficiais.
// Throttle próprio de 10s (sync_state.last_live_sync) protege contra abuso.
export async function syncLive(force = false): Promise<{ skipped: boolean; count?: number; reason?: string }> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Variáveis de ambiente faltando: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  if (!force) {
    const { data: state } = await supabase.from('sync_state').select('last_live_sync').eq('id', 1).single();
    if (state?.last_live_sync && Date.now() - new Date(state.last_live_sync).getTime() < 10 * 1000) {
      return { skipped: true, reason: 'Ao vivo sincronizado há menos de 10 segundos.' };
    }
  }

  // ESPN primeiro; se cair, não faz nada (o cron/football-data cobre o resto).
  let overrides;
  try {
    overrides = await fetchEspnOverrides();
  } catch (err) {
    console.warn('ESPN indisponível no syncLive (fallback no cron):', err);
    return { skipped: true, reason: 'ESPN indisponível.' };
  }

  // Marca o tempo já aqui (mesmo sem jogos) para o throttle valer.
  await supabase.from('sync_state').upsert({ id: 1, last_live_sync: new Date().toISOString() });
  if (overrides.size === 0) return { skipped: false, count: 0 };

  const { data: dbRows } = await supabase
    .from('matches')
    .select('id, utc_date, status, home_team, away_team, home_score, away_score, live_clock');
  if (!dbRows || dbRows.length === 0) return { skipped: false, count: 0 };

  const prevById = new Map<number, PrevState>();
  const updates: MatchUpsertRow[] = [];

  for (const r of dbRows as LiveDbRow[]) {
    const ov = overrides.get(pairKey(r.home_team, r.away_team));
    if (!ov) continue;
    if (ov.dateIso && r.utc_date.slice(0, 10) !== ov.dateIso) continue;

    const fdHomeIsEspnHome = norm(r.home_team) === ov.homeNorm;
    const homeScore = fdHomeIsEspnHome ? ov.homeScore : ov.awayScore;
    const awayScore = fdHomeIsEspnHome ? ov.awayScore : ov.homeScore;

    // Só grava (e notifica) quando algo realmente mudou — evita recarregar o
    // front à toa a cada 10s e reprocessar notificações.
    const changed =
      ov.status !== r.status ||
      homeScore !== r.home_score ||
      awayScore !== r.away_score ||
      ov.liveClock !== r.live_clock;
    if (!changed) continue;

    prevById.set(r.id, { id: r.id, status: r.status, home_score: r.home_score, away_score: r.away_score });
    updates.push({
      // só os campos que o ao vivo altera; o upsert atualiza apenas estas colunas
      id: r.id,
      utc_date: r.utc_date,
      status: ov.status,
      stage: null,
      group_name: null,
      home_team: r.home_team,
      away_team: r.away_team,
      home_tla: '',
      away_tla: '',
      home_crest: '',
      away_crest: '',
      home_score: homeScore,
      away_score: awayScore,
      home_pens: fdHomeIsEspnHome ? ov.homePens : ov.awayPens,
      away_pens: fdHomeIsEspnHome ? ov.awayPens : ov.homePens,
      winner: null,
      live_clock: ov.liveClock,
      updated_at: new Date().toISOString(),
      // transitórios (notificações) — removidos antes do upsert por toDbRow
      homeTeamId: fdHomeIsEspnHome ? ov.homeTeamId : ov.awayTeamId,
      awayTeamId: fdHomeIsEspnHome ? ov.awayTeamId : ov.homeTeamId,
      goalsDetail: ov.goalsDetail,
    });
  }

  if (updates.length === 0) return { skipped: false, count: 0 };

  // Atualiza apenas placar/status/minuto — sem sobrescrever stage/nomes/crests
  // (que pertencem ao football-data) graças ao merge por coluna do upsert.
  const dbUpdates = updates.map(toDbRow).map((u) => ({
    id: u.id,
    status: u.status,
    home_score: u.home_score,
    away_score: u.away_score,
    home_pens: u.home_pens,
    away_pens: u.away_pens,
    live_clock: u.live_clock,
    updated_at: u.updated_at,
  }));

  const { error } = await supabase.from('matches').upsert(dbUpdates);
  if (error) throw new Error(`Erro ao gravar ao vivo no Supabase: ${error.message}`);

  // Autores dos gols (artilheiro) — gravados à parte, só quando há gols.
  await persistGoals(supabase, updates);

  try {
    await runNotifications(supabase, prevById, updates);
  } catch (err) {
    console.error('Falha ao enviar notificações (syncLive):', err);
  }

  return { skipped: false, count: updates.length };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Loop de background que mantém o ao vivo fresquinho (~12s) mesmo sem ninguém
// com o app aberto. É disparado pelo cron de 1 min e protegido por uma "lease"
// (sync_state.live_loop_until): só um loop roda por vez; se este morrer, a lease
// expira e o próximo cron reinicia em <= 1 min. Auto-encerra quando não há mais
// jogo rolando/por começar, e tem teto de tempo por invocação.
export async function runLiveLoop(): Promise<{ ran: boolean; iterations?: number; reason?: string }> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Variáveis de ambiente faltando: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const LEASE_TTL_MS = 30 * 1000;     // lease considerada morta após 30s sem refresh
  const ITERATION_MS = 12 * 1000;     // cadência ~12s entre buscas na ESPN
  const MAX_RUN_MS = 4 * 60 * 1000;   // teto de ~4 min por invocação (o cron reinicia)

  // Há jogo rolando agora ou prestes a começar? Fora do horário de jogos o loop
  // não roda — o cron de 1 min já cobre o tempo morto. Considera partidas com
  // kickoff entre 3,5h atrás (ainda pode estar em campo) e 15 min à frente.
  const hasLiveOrImminent = async (): Promise<boolean> => {
    const now = Date.now();
    const from = new Date(now - 3.5 * 60 * 60 * 1000).toISOString();
    const to = new Date(now + 15 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('matches')
      .select('id')
      .gte('utc_date', from)
      .lte('utc_date', to)
      .limit(1);
    return !!data && data.length > 0;
  };

  // Trava: se já há um loop ativo (lease no futuro), sai na hora.
  const { data: st } = await supabase.from('sync_state').select('live_loop_until').eq('id', 1).single();
  if (st?.live_loop_until && new Date(st.live_loop_until as string).getTime() > Date.now()) {
    return { ran: false, reason: 'Loop já ativo.' };
  }

  // Fora do horário de jogos não faz loop — o cron de 1 min já basta.
  if (!(await hasLiveOrImminent())) {
    return { ran: false, reason: 'Sem jogo ao vivo ou iminente.' };
  }

  const start = Date.now();
  let iterations = 0;
  try {
    while (Date.now() - start < MAX_RUN_MS) {
      // Renova a lease ANTES de cada iteração.
      await supabase.from('sync_state').upsert({
        id: 1,
        live_loop_until: new Date(Date.now() + LEASE_TTL_MS).toISOString(),
      });

      // force=true: o loop controla a cadência (12s), então ignora o throttle de 10s.
      try {
        await syncLive(true);
      } catch (err) {
        console.error('runLiveLoop syncLive:', err);
      }
      iterations++;

      // Acabaram os jogos? Encerra cedo.
      if (!(await hasLiveOrImminent())) break;

      await sleep(ITERATION_MS);
    }
  } finally {
    // Libera a lease para o próximo cron poder reiniciar quando precisar.
    await supabase.from('sync_state').upsert({ id: 1, live_loop_until: null });
  }

  return { ran: true, iterations };
}
