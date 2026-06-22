-- ============================================================
-- UPDATE 011 — THROTTLE DO BACKFILL DE GOLS
-- Rode no Supabase: Dashboard > SQL Editor > New query
--
-- Coluna usada pelo backfill automático de gols (sync-core.backfillMissingGoals):
-- jogos já ENCERRADOS com `goals` nulo (a ESPN não os lista mais no scoreboard
-- "de hoje" — típico de jogo de madrugada, que a ESPN guarda no bucket do dia
-- anterior) são recuperados buscando a ESPN por data. Esta coluna evita refazer
-- essa varredura a cada minuto: o backfill só roda a cada ~15 min.
-- ============================================================

ALTER TABLE public.sync_state
  ADD COLUMN IF NOT EXISTS last_goals_backfill timestamptz;
