-- ============================================================
-- UPDATE 013 — PLACAR DOS PÊNALTIS NO MATA-MATA
-- Rode no Supabase: Dashboard > SQL Editor > New query
--
-- A football-data v4 só informa quem venceu (coluna `winner`) e a `duration`
-- ('PENALTY_SHOOTOUT'), mas NÃO o placar da disputa de pênaltis. Esse placar vem
-- da ESPN (campo shootoutScore), capturado no sync (sync-core.mergeEspnLive /
-- syncLive). Estas colunas guardam os gols de cada lado na disputa; ficam NULL
-- quando não houve pênaltis (fase de grupos ou mata-mata decidido no tempo).
--
-- Uso:
--  - Exibição: card do mata-mata mostra "1 (4)" quando há pênaltis (BracketTab).
--  - Pontuação: NÃO depende destas colunas — a regra de "acertou quem avançou"
--    usa só `winner` (ver utils/rules.analyzeBet).
-- ============================================================

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS home_pens smallint,
  ADD COLUMN IF NOT EXISTS away_pens smallint;
