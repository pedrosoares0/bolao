// ============================================================
// espn-sync — sincroniza os jogos das ligas ESPN cadastradas no banco para a
// tabela `matches`, vinculados à `season`. Usado pela função sync-espn.
//
// IMPORTANTE: pula 'fifa.world' (Copa) de propósito — a Copa ainda é sincronizada
// pelo football-data (sync-matches), cujos IDs de partida são diferentes dos da
// ESPN. Sincronizar a Copa pelos dois geraria partidas DUPLICADAS. Quando a Copa
// migrar 100% para ESPN, basta remover esse filtro.
// ============================================================
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { fetchEspnFixtures } from './espn-fixtures.mts';

interface SeasonRow {
  id: number;
  provider_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  competitions: { provider: string; provider_id: string | null } | null;
}

// Janela de dias a cobrir nesta execução: do passado recente até ~5 semanas à
// frente, respeitando início/fim da temporada quando informados.
function windowFor(season: SeasonRow): { start: string; end: string } {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  let start = new Date(now - 7 * day);
  let end = new Date(now + 35 * day);
  if (season.starts_at && new Date(season.starts_at) > start) start = new Date(season.starts_at);
  if (season.ends_at && new Date(season.ends_at) < end) end = new Date(season.ends_at);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export async function syncEspnSeasons(): Promise<{ seasons: number; matches: number }> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Variáveis de ambiente faltando: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  }
  const supabase: SupabaseClient = createClient(supabaseUrl, serviceKey);

  const { data, error } = await supabase
    .from('seasons')
    .select('id, provider_id, starts_at, ends_at, competitions(provider, provider_id)')
    .eq('status', 'active');
  if (error) throw new Error(error.message);

  const seasons = ((data ?? []) as unknown as SeasonRow[]).filter(
    (s) => s.competitions?.provider === 'espn' && s.competitions.provider_id && s.competitions.provider_id !== 'fifa.world'
  );

  let totalMatches = 0;
  for (const season of seasons) {
    const slug = season.competitions!.provider_id!;
    const { start, end } = windowFor(season);
    try {
      const rows = await fetchEspnFixtures(slug, season.id, start, end);
      if (rows.length > 0) {
        // Merge por coluna: não apaga vínculos nem stage existentes.
        const { error: upErr } = await supabase.from('matches').upsert(rows);
        if (upErr) throw new Error(upErr.message);
        totalMatches += rows.length;
      }
    } catch (err) {
      console.error(`Falha ao sincronizar liga ${slug}:`, err);
    }
  }

  return { seasons: seasons.length, matches: totalMatches };
}
