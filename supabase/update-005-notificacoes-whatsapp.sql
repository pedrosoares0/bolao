-- ============================================================
-- UPDATE 005 — Notificações no WhatsApp (Evolution API)
--
-- Tabela de "controle de envio": cada notificação já mandada
-- guarda uma chave única aqui para NUNCA ser enviada duas vezes
-- (ex.: não repetir "Gol 1x0", "Fim de jogo", "Falta 1 hora").
--
-- Rode este script no SQL Editor do Supabase DEPOIS do schema.sql.
-- ============================================================

create table if not exists public.sent_notifications (
  dedup_key text primary key,
  sent_at   timestamptz not null default now()
);

-- Só o backend (service_role, usado pelas Netlify Functions) escreve aqui.
-- O service_role ignora RLS; deixamos RLS ligado e sem policy para
-- bloquear qualquer acesso vindo do app (anon).
alter table public.sent_notifications enable row level security;
