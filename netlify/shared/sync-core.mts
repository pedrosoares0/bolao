import { createClient } from '@supabase/supabase-js';

// Busca todos os jogos da Copa 2026 na football-data.org (competição "WC")
// e grava/atualiza na tabela `matches` do Supabase usando a service_role.
// Throttle: se sincronizou há menos de 3 minutos, pula (limite free: 10 req/min).
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
    if (state?.last_sync && Date.now() - new Date(state.last_sync).getTime() < 3 * 60 * 1000) {
      return { skipped: true, reason: 'Sincronizado há menos de 3 minutos.' };
    }
  }

  const res = await fetch('https://api.football-data.org/v4/competitions/WC/matches', {
    headers: { 'X-Auth-Token': apiKey },
  });
  if (!res.ok) {
    throw new Error(`football-data.org respondeu ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const rows = (data.matches ?? []).map((m: any) => ({
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
    updated_at: new Date().toISOString(),
  }));

  if (rows.length > 0) {
    const { error } = await supabase.from('matches').upsert(rows);
    if (error) throw new Error(`Erro ao gravar partidas no Supabase: ${error.message}`);
  }

  await supabase.from('sync_state').upsert({ id: 1, last_sync: new Date().toISOString() });

  return { skipped: false, count: rows.length };
}
