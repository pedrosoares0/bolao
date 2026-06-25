-- ============================================================
-- UPDATE 012 — THROTTLE DO BACKFILL DO MATA-MATA (times via ESPN)
-- Rode no Supabase: Dashboard > SQL Editor > New query
--
-- Coluna usada pelo backfill automático das seleções do mata-mata
-- (sync-core.backfillKnockoutTeams): enquanto o football-data deixa os dois
-- lados nulos ('A definir') até a fase de grupos fechar, a ESPN já posiciona
-- quem se classificou (ex.: "Brazil" nos 16avos). O backfill casa cada jogo do
-- banco com o card da ESPN pelo horário de início e preenche o lado já definido.
-- Esta coluna evita refazer essa varredura (várias datas) a cada minuto: o
-- backfill só roda a cada ~5 min.
-- ============================================================

ALTER TABLE public.sync_state
  ADD COLUMN IF NOT EXISTS last_ko_backfill timestamptz;
