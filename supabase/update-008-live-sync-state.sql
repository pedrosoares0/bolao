-- ============================================================
-- ATUALIZAÇÃO 008 — Throttle próprio do AO VIVO (ESPN) + trava do loop
--
-- RODE ESTE ARQUIVO no SQL Editor do Supabase.
--
-- Adiciona duas colunas na tabela `sync_state`:
--
-- 1) `last_live_sync` — usada pelo caminho rápido do ao vivo (Netlify Function
--    `sync-live`, que bate só na ESPN) para se auto-limitar a 1 atualização a
--    cada 10s, independente do throttle de 30s do `sync-matches` completo
--    (football-data). Assim o front pode pedir o ao vivo a cada ~10s, com vários
--    aparelhos abertos, sem abuso.
--
-- 2) `live_loop_until` — "lease" do loop de background (`live-loop-background`),
--    disparado pelo cron de 1 min. Garante que só UM loop rode por vez: enquanto
--    esta marca estiver no futuro, novas invocações do loop saem na hora. Se o
--    loop morrer, a marca expira e o próximo cron reinicia em <= 1 min. Isso
--    deixa o "piso" do ao vivo em ~12s mesmo sem ninguém com o app aberto.
--
-- Ambas ficam null até a primeira sincronização ao vivo.
-- ============================================================

alter table public.sync_state
  add column if not exists last_live_sync timestamptz;

alter table public.sync_state
  add column if not exists live_loop_until timestamptz;
