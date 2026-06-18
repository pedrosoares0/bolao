-- ============================================================
-- CRAVEI! — V2 MIGRATION 003: seed mínimo de competições/temporadas
-- Cria as competições do lançamento (Copa do Mundo + Brasileirão) e suas
-- temporadas, para a criação de grupos já ter o que escolher.
-- O sync ESPN (Fase 3) preenche times, rodadas e partidas.
-- ============================================================

insert into public.competitions (sport, provider, provider_id, name, country, active)
values
  ('soccer', 'espn', 'fifa.world', 'Copa do Mundo',      'Mundo',  true),
  ('soccer', 'espn', 'bra.1',      'Brasileirão Série A', 'Brasil', true)
on conflict (provider, provider_id) do nothing;

-- Temporada 2026 da Copa
insert into public.seasons (competition_id, provider_id, name, status)
select c.id, '2026', '2026', 'active'
from public.competitions c
where c.provider = 'espn' and c.provider_id = 'fifa.world'
on conflict (competition_id, name) do nothing;

-- Temporada 2026 do Brasileirão
insert into public.seasons (competition_id, provider_id, name, status)
select c.id, '2026', '2026', 'active'
from public.competitions c
where c.provider = 'espn' and c.provider_id = 'bra.1'
on conflict (competition_id, name) do nothing;
