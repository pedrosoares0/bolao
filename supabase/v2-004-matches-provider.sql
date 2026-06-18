-- ============================================================
-- CRAVEI! — V2 MIGRATION 004: partidas multi-competição
-- Prepara a tabela `matches` para receber jogos de mais de um campeonato:
--   - coluna `provider` (de onde veio o jogo: football-data | espn)
--   - vincula as partidas EXISTENTES (Copa, via football-data) à temporada da Copa
--   - índices para filtrar por temporada/provider
-- A ingestão ESPN do Brasileirão fica disponível (função sync-espn) mas NÃO é
-- ligada no cron até o front filtrar por competição — senão os jogos do
-- Brasileirão apareceriam misturados na tela da Copa.
-- ============================================================

alter table public.matches
  add column if not exists provider text not null default 'football-data';

-- Vincula os jogos já existentes (Copa) à temporada 2026 da Copa do Mundo.
update public.matches m
set season_id = s.id
from public.seasons s
join public.competitions c on c.id = s.competition_id
where c.provider = 'espn'
  and c.provider_id = 'fifa.world'
  and s.name = '2026'
  and m.season_id is null;

create index if not exists matches_provider_idx on public.matches (provider);
create index if not exists matches_season_kickoff_idx on public.matches (season_id, utc_date);
