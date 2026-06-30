-- ============================================================
-- UPDATE 019 — STATUS DO DESAFIO (aceitar / recusar)
-- Rode no Supabase: Dashboard > SQL Editor > New query
--
-- Só rode ISTO se você JÁ tinha rodado o update-018 ANTES de ele ganhar a coluna
-- `status`. Se for rodar o 018 agora (versão atual), ele já cria a coluna e este
-- arquivo vira no-op (idempotente).
--
-- Fluxo: o desafio nasce 'pending'; o desafiado aceita ('accepted') ou recusa
-- ('declined') no app. Só desafio 'accepted' transfere ponto (ver rules.ts).
-- ============================================================

alter table public.challenges
  add column if not exists status text not null default 'pending';

-- Garante o check de valores válidos (recria sem erro se já existir).
alter table public.challenges drop constraint if exists challenges_status_chk;
alter table public.challenges
  add constraint challenges_status_chk check (status in ('pending', 'accepted', 'declined'));
