-- ============================================================
-- ATUALIZAÇÃO 005 — Caderneta de Pendurados (Fiados)
--
-- RODE ESTE ARQUIVO no SQL Editor do Supabase para criar a
-- estrutura de dados necessária para a caderneta de fiados.
-- ============================================================

create table public.debts (
  id         bigint generated always as identity primary key,
  user_id    uuid   not null references public.participants (id) on delete cascade,
  amount     numeric(10,2) not null default 2.50,
  debt_date  date   not null default current_date,
  created_at timestamptz not null default now(),
  unique (user_id, debt_date)
);

create index debts_user_idx on public.debts (user_id);
create index debts_date_idx on public.debts (debt_date);

alter table public.debts enable row level security;

-- Todos os participantes autenticados podem ver todos os fiados (financeiro transparente)
create policy "debts_select_authenticated"
  on public.debts for select
  to authenticated
  using (true);

-- Um participante pode registrar seu próprio fiado
create policy "debts_insert_own"
  on public.debts for insert
  to authenticated
  with check (user_id = auth.uid());

-- Um participante pode remover seu próprio fiado (ex: quando pagar o fiado)
create policy "debts_delete_own"
  on public.debts for delete
  to authenticated
  using (user_id = auth.uid());
