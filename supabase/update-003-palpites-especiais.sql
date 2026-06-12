-- ============================================================
-- ATUALIZAÇÃO 003 — Palpites especiais + vencedor do mata-mata
--
-- ⚠️ RODE ESTE ARQUIVO no SQL Editor se você JÁ rodou o schema.sql
--    antes desta mudança (quem rodar o schema.sql novo não precisa).
--
-- O que adiciona:
--  - Coluna matches.winner (HOME_TEAM/AWAY_TEAM/DRAW) para saber
--    quem avançou em jogo decidido nos pênaltis
--  - Tabela special_predictions: palpite de campeão da Copa e de
--    até onde o Brasil vai (5 pontos cada, sem pagamento de taxa),
--    editáveis até o início do mata-mata (28/06/2026)
-- ============================================================

alter table public.matches add column if not exists winner text;

create table if not exists public.special_predictions (
  user_id       uuid primary key references public.participants (id) on delete cascade,
  champion_team text not null,
  brazil_stage  text not null check (brazil_stage in
    ('GROUP_STAGE','LAST_32','LAST_16','QUARTER_FINALS','SEMI_FINALS','FINAL','CHAMPION')),
  updated_at    timestamptz not null default now()
);

alter table public.special_predictions enable row level security;

create policy "special_predictions_select"
  on public.special_predictions for select
  to authenticated
  using (true);

create policy "special_predictions_insert_own_until_knockout"
  on public.special_predictions for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and now() < timestamptz '2026-06-28 00:00:00+00'
  );

create policy "special_predictions_update_own_until_knockout"
  on public.special_predictions for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and now() < timestamptz '2026-06-28 00:00:00+00'
  );

-- Realtime (ignore o erro se a tabela já estiver na publicação)
alter publication supabase_realtime add table public.special_predictions;
