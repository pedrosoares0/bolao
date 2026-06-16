-- ============================================================
-- ATIVAR ATUALIZAÇÕES AO VIVO (Supabase Realtime)
-- Rode no SQL Editor (pode rodar a qualquer momento, antes ou
-- depois do schema.sql — mas as tabelas precisam existir).
--
-- Com isso, placares e palpites aparecem na hora no app de todo
-- mundo, sem precisar esperar a atualização periódica.
-- ============================================================

alter publication supabase_realtime add table public.matches;
alter publication supabase_realtime add table public.bets;
alter publication supabase_realtime add table public.submissions;
alter publication supabase_realtime add table public.special_predictions;
-- Caderneta de fiados: dar baixa/pendurar aparece na hora em todos os aparelhos
alter publication supabase_realtime add table public.debts;
