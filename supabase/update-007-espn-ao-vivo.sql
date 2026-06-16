-- ============================================================
-- ATUALIZAÇÃO 007 — Placar/tempo ao vivo da ESPN
--
-- RODE ESTE ARQUIVO no SQL Editor do Supabase.
--
-- Adiciona a coluna `live_clock` na tabela `matches`. As Netlify
-- Functions passam a buscar o placar AO VIVO na API pública da ESPN
-- (mais rápida que o football-data) e gravam aqui o minuto do jogo
-- (ex.: "28'", "HT"). Quando a ESPN não tem o jogo (ou está fora do
-- ar), o football-data continua sendo a fonte — nada quebra.
--
-- `live_clock` fica null fora do tempo ao vivo. Como `matches` já está
-- no Realtime, o minuto aparece na hora em todos os aparelhos.
-- ============================================================

alter table public.matches
  add column if not exists live_clock text;
