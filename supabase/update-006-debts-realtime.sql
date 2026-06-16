-- ============================================================
-- ATUALIZAÇÃO 006 — Fiados em tempo real (Supabase Realtime)
--
-- RODE ESTE ARQUIVO no SQL Editor se você JÁ tinha rodado o
-- realtime.sql ANTES desta mudança (quem rodar o realtime.sql
-- novo, que já inclui `debts`, não precisa rodar este).
--
-- Sem isto, pendurar/quitar um fiado em um aparelho NÃO atualiza
-- a caderneta nos outros automaticamente (só após recarregar).
-- A tabela `debts` é criada em update-005-fiados.sql.
-- ============================================================

-- Idempotente: ignora o erro caso a tabela já esteja na publicação.
do $$
begin
  alter publication supabase_realtime add table public.debts;
exception
  when duplicate_object then
    raise notice 'public.debts já estava no Realtime — nada a fazer.';
end $$;
