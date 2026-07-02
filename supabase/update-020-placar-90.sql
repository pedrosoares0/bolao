-- ============================================================
-- UPDATE 020 — PLACAR DOS 90' (prorrogação)
-- Rode no Supabase: Dashboard > SQL Editor > New query
--
-- Guarda o placar do TEMPO NORMAL (90') dos jogos decididos na PRORROGAÇÃO por
-- gol. Hoje `home_score`/`away_score` guardam o placar FINAL (com o gol da
-- prorrogação, ex.: 3-2). Estas colunas guardam o empate dos 90' (ex.: 2-2) só
-- pra EXIBIÇÃO ("90': 2 x 2 · Final: 3 x 2" + aviso de prorrogação).
--
-- Preenchido automaticamente pelo sync: derivado dos gols da ESPN (minuto ≤ 90)
-- e confirmado pelo `regularTime` da football-data. Fica null fora da prorrogação
-- (jogo normal e pênaltis não precisam — o placar já é o dos 90'/120').
-- ============================================================

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS home_score_90 smallint,
  ADD COLUMN IF NOT EXISTS away_score_90 smallint;
