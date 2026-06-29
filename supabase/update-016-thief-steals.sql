-- ------------------------------------------------------------
-- update-016-thief-steals.sql
-- Tabela para registrar os roubos de pontos da habilidade "Ladrão"
-- ------------------------------------------------------------

create table public.thief_steals (
  id         uuid primary key default gen_random_uuid(),
  thief_id   uuid not null references public.participants (id) on delete cascade,
  victim_id  uuid not null references public.participants (id) on delete cascade,
  round_date date not null unique, -- No máximo um roubo por rodada/data
  created_at timestamptz not null default now(),
  constraint thief_no_self_steal check (thief_id <> victim_id)
);

alter table public.thief_steals enable row level security;

create policy "thief_steals_select_authenticated"
  on public.thief_steals for select
  to authenticated
  using (true);

create policy "thief_steals_insert_own"
  on public.thief_steals for insert
  to authenticated
  with check (
    thief_id = auth.uid()
  );

-- Habilitar replicação em tempo real para thief_steals
alter publication supabase_realtime add table public.thief_steals;
