-- ============================================================
-- UPDATE 010 — AUTORES DOS GOLS (pontuação do artilheiro)
-- Rode no Supabase: Dashboard > SQL Editor > New query
--
-- Guarda os autores dos gols de cada jogo (vindos da ESPN, via sync) para
-- pontuar o palpite de artilheiro: +1 ponto por gol do jogador escolhido.
-- Formato: array JSON de { teamId, scorer, minute, ownGoal }.
-- ============================================================

ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS goals jsonb;
