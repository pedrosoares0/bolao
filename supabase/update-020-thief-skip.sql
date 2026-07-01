-- ============================================================
-- UPDATE 020 — LADRÃO PODE ESCOLHER "NINGUÉM"
-- Rode no Supabase: Dashboard > SQL Editor > New query
--
-- O Ladrão pode optar por NÃO roubar de ninguém. Registramos a rodada com
-- victim_id NULL (usou a vez, mas sem transferir ponto) — assim o card do Ladrão
-- some e não reaparece. A regra de pontuação ignora roubos com victim_id NULL.
--
-- O check `thief_no_self_steal (thief_id <> victim_id)` continua valendo: com
-- victim_id NULL a comparação dá "unknown" e o check passa (não bloqueia).
-- ============================================================

alter table public.thief_steals
  alter column victim_id drop not null;
