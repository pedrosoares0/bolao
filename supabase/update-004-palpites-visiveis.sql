-- ============================================================
-- ATUALIZAÇÃO 004 — Palpites visíveis em tempo real
--
-- RODE ESTE ARQUIVO no SQL Editor se você JÁ rodou o schema.sql
-- antes desta mudança (quem rodar o schema.sql novo não precisa).
--
-- Todos os participantes autenticados passam a ver os palpites
-- assim que eles são lançados. A tabela bets já está configurada
-- no Supabase Realtime pelo arquivo realtime.sql.
-- ============================================================

drop policy if exists "bets_select_own_or_started" on public.bets;
drop policy if exists "bets_select_authenticated" on public.bets;

create policy "bets_select_authenticated"
  on public.bets for select
  to authenticated
  using (true);
