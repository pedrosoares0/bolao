-- ============================================================
-- UPDATE 017 — DURAÇÃO DO JOGO (tempo normal / prorrogação / pênaltis)
-- Rode no Supabase: Dashboard > SQL Editor > New query
--
-- A football-data v4 informa em `score.duration` COMO o jogo foi decidido:
--   'REGULAR'          -> decidido no tempo normal (90')
--   'EXTRA_TIME'       -> decidido na prorrogação (gol no tempo extra)
--   'PENALTY_SHOOTOUT' -> decidido na disputa de pênaltis
--
-- Guardamos isso para a regra de pontuação do palpite de classificação
-- (quem avança / vai a pênaltis) saber se o jogo passou dos 90'. O palpite de
-- classificação só pontua (+1) ou desconta (-1) quando houve prorrogação OU
-- pênaltis; decidido no tempo normal NÃO conta (ver utils/rules.pensBonus).
--
-- Sem isso, prorrogação por gol fica indistinguível de uma vitória de 90' nos
-- dados (mesmo placar, sem pênaltis). Fica NULL para jogos ainda não decididos.
-- ============================================================

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS duration text;
