-- ============================================================
-- CRAVEI! — V2 MIGRATION 001: fundação multi-tenant
-- ADITIVO: roda DEPOIS do schema.sql atual. Não derruba o app de hoje.
--   - estende `participants` (vira o "profile")
--   - reaproveita `bets` como a tabela de palpites (1 palpite/usuário/partida/competição)
--   - cria catálogo (competitions/seasons/rounds/teams), grupos, membros,
--     convites, rulesets, pagamentos por grupo, notificações e auditoria
-- Decisão: 1 palpite por competição; grupos só calculam rankings diferentes.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 0. PERFIL — estende participants (não renomeia p/ não quebrar o app atual)
-- ------------------------------------------------------------
alter table public.participants
  add column if not exists card_url          text,
  add column if not exists status            text not null default 'active'
       check (status in ('active','banned','deleted')),
  add column if not exists is_platform_admin boolean not null default false;

-- Cada usuário edita o PRÓPRIO perfil (avatar, card, nome). username é imutável aqui (troca por função).
drop policy if exists "participants_update_own" on public.participants;
create policy "participants_update_own"
  on public.participants for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ------------------------------------------------------------
-- 1. CATÁLOGO ESPORTIVO (público p/ autenticados; escrita só service_role)
-- ------------------------------------------------------------
create table if not exists public.competitions (
  id          bigint generated always as identity primary key,
  sport       text not null default 'soccer',
  provider    text not null default 'espn',     -- fonte dos dados
  provider_id text,                              -- id/slug na fonte (ex.: 'bra.1', 'fifa.world')
  name        text not null,                     -- "Brasileirão Série A", "Copa do Mundo"
  country     text,
  logo_url    text,
  active       boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (provider, provider_id)
);

create table if not exists public.seasons (
  id             bigint generated always as identity primary key,
  competition_id bigint not null references public.competitions (id) on delete cascade,
  provider_id    text,
  name           text not null,                  -- "2026", "2026/27"
  starts_at      timestamptz,
  ends_at        timestamptz,
  status         text not null default 'active'  -- active | finished | upcoming
       check (status in ('active','finished','upcoming')),
  created_at     timestamptz not null default now(),
  unique (competition_id, name)
);

create table if not exists public.rounds (
  id         bigint generated always as identity primary key,
  season_id  bigint not null references public.seasons (id) on delete cascade,
  number     int,
  name       text not null,                      -- "Rodada 1", "Oitavas"
  starts_at  timestamptz,
  ends_at    timestamptz,
  unique (season_id, name)
);

create table if not exists public.teams (
  id          bigint generated always as identity primary key,
  provider    text not null default 'espn',
  provider_id text,
  name        text not null,
  short_name  text,
  crest_url   text,
  unique (provider, provider_id)
);

-- A tabela `matches` atual (id da football-data) ganha vínculo opcional com
-- temporada/rodada. Backfill da Copa atual + migração p/ ESPN vêm na Fase 3.
alter table public.matches
  add column if not exists season_id bigint references public.seasons (id) on delete set null,
  add column if not exists round_id  bigint references public.rounds  (id) on delete set null;

create index if not exists matches_season_idx on public.matches (season_id);

alter table public.competitions enable row level security;
alter table public.seasons      enable row level security;
alter table public.rounds       enable row level security;
alter table public.teams        enable row level security;

do $$ begin
  create policy "competitions_select" on public.competitions for select to authenticated using (true);
  create policy "seasons_select"      on public.seasons      for select to authenticated using (true);
  create policy "rounds_select"       on public.rounds       for select to authenticated using (true);
  create policy "teams_select"        on public.teams        for select to authenticated using (true);
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 2. RULESETS (regras de pontuação versionadas — não ficam no front)
-- ------------------------------------------------------------
create table if not exists public.rulesets (
  id            bigint generated always as identity primary key,
  version       int  not null default 1,
  name          text not null default 'Padrão Cravei',
  exact_points  int  not null default 3,
  outcome_points int not null default 1,
  draw_points   int  not null default 2,
  lock_minutes  int  not null default 1,          -- trava N min antes do kickoff
  reveal_policy text not null default 'after_kickoff'
       check (reveal_policy in ('always','after_own_bet','after_lock','after_kickoff')),
  tiebreakers   text[] not null default array['exact_count','outcome_count'],
  config_json   jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

alter table public.rulesets enable row level security;
do $$ begin
  create policy "rulesets_select" on public.rulesets for select to authenticated using (true);
exception when duplicate_object then null; end $$;

insert into public.rulesets (version, name) values (1, 'Padrão Cravei')
  on conflict do nothing;

-- ------------------------------------------------------------
-- 3. GRUPOS
-- ------------------------------------------------------------
create table if not exists public.groups (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.participants (id) on delete restrict,
  season_id      bigint references public.seasons (id) on delete set null,
  ruleset_id     bigint references public.rulesets (id) on delete set null,
  name           text not null check (char_length(name) between 2 and 60),
  description    text check (char_length(description) <= 500),
  image_url      text,
  card_url       text,
  visibility     text not null default 'private' check (visibility in ('private','public')),
  join_policy    text not null default 'invite' check (join_policy in ('invite','approval','open')),
  member_limit   int  check (member_limit is null or member_limit between 2 and 1000),
  entry_fee_cents int not null default 0 check (entry_fee_cents >= 0), -- valor cobrado (registro; app não custodia)
  status         text not null default 'active' check (status in ('active','closed','archived')),
  created_at     timestamptz not null default now()
);

create index if not exists groups_season_idx on public.groups (season_id);
create index if not exists groups_owner_idx  on public.groups (owner_id);

create table if not exists public.group_members (
  group_id  uuid not null references public.groups (id) on delete cascade,
  user_id   uuid not null references public.participants (id) on delete cascade,
  role      text not null default 'member' check (role in ('owner','admin','member')),
  status    text not null default 'active' check (status in ('active','banned','left')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists group_members_user_idx on public.group_members (user_id);

-- Helpers SECURITY DEFINER: quebram a recursão de RLS entre groups e group_members.
create or replace function public.is_group_member(p_group uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group and gm.user_id = auth.uid() and gm.status = 'active'
  );
$$;

create or replace function public.is_group_admin(p_group uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group and gm.user_id = auth.uid()
      and gm.status = 'active' and gm.role in ('owner','admin')
  );
$$;

alter table public.groups        enable row level security;
alter table public.group_members enable row level security;

do $$ begin
  -- Grupos: vê se for público ou se for membro.
  create policy "groups_select" on public.groups for select to authenticated
    using (visibility = 'public' or public.is_group_member(id));
  -- Qualquer autenticado cria grupo (vira owner pela função create_group).
  create policy "groups_insert" on public.groups for insert to authenticated
    with check (owner_id = auth.uid());
  -- Só owner/admin editam o grupo.
  create policy "groups_update" on public.groups for update to authenticated
    using (public.is_group_admin(id)) with check (public.is_group_admin(id));
  create policy "groups_delete" on public.groups for delete to authenticated
    using (owner_id = auth.uid());

  -- Membros: vê quem é do mesmo grupo.
  create policy "gm_select" on public.group_members for select to authenticated
    using (public.is_group_member(group_id));
  -- Admin do grupo gerencia membros; usuário pode remover a si mesmo (sair).
  create policy "gm_admin_write" on public.group_members for all to authenticated
    using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));
  create policy "gm_leave" on public.group_members for delete to authenticated
    using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

-- Criar grupo numa transação: insere o grupo e adiciona o criador como owner.
create or replace function public.create_group(
  p_name text, p_description text, p_season_id bigint,
  p_visibility text default 'private', p_entry_fee_cents int default 0,
  p_image_url text default null, p_card_url text default null,
  p_member_limit int default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_ruleset bigint;
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  select id into v_ruleset from public.rulesets order by id limit 1;
  insert into public.groups (owner_id, season_id, ruleset_id, name, description,
                             visibility, entry_fee_cents, image_url, card_url, member_limit)
  values (auth.uid(), p_season_id, v_ruleset, p_name, p_description,
          coalesce(p_visibility,'private'), coalesce(p_entry_fee_cents,0),
          p_image_url, p_card_url, p_member_limit)
  returning id into v_id;
  insert into public.group_members (group_id, user_id, role) values (v_id, auth.uid(), 'owner');
  return v_id;
end; $$;

revoke all on function public.create_group(text,text,bigint,text,int,text,text,int) from public, anon;
grant execute on function public.create_group(text,text,bigint,text,int,text,text,int) to authenticated;

-- ------------------------------------------------------------
-- 4. CONVITES (token guardado como HASH; código curto p/ WhatsApp)
-- ------------------------------------------------------------
create table if not exists public.group_invites (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  token_hash text not null,                       -- digest do token (nunca o token puro)
  code       text unique,                         -- código curto opcional
  created_by uuid not null references public.participants (id) on delete cascade,
  expires_at timestamptz,
  max_uses   int,
  uses       int not null default 0,
  status     text not null default 'active' check (status in ('active','revoked')),
  created_at timestamptz not null default now()
);

create index if not exists invites_group_idx on public.group_invites (group_id);

alter table public.group_invites enable row level security;
do $$ begin
  -- Só admin do grupo lista/gera/revoga convites (resgate é por função, não por select).
  create policy "invites_admin" on public.group_invites for all to authenticated
    using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));
exception when duplicate_object then null; end $$;

-- Resgatar convite por código: valida expiração/uso e adiciona como member.
create or replace function public.redeem_invite(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_inv public.group_invites; v_group uuid;
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  select * into v_inv from public.group_invites
    where code = p_code and status = 'active'
      and (expires_at is null or expires_at > now())
      and (max_uses is null or uses < max_uses);
  if v_inv.id is null then raise exception 'Convite inválido ou expirado.'; end if;

  -- Banido não reentra.
  if exists (select 1 from public.group_members
             where group_id = v_inv.group_id and user_id = auth.uid() and status = 'banned') then
    raise exception 'Você não pode entrar neste grupo.';
  end if;

  insert into public.group_members (group_id, user_id, role, status)
  values (v_inv.group_id, auth.uid(), 'member', 'active')
  on conflict (group_id, user_id) do update set status = 'active';

  update public.group_invites set uses = uses + 1 where id = v_inv.id;
  return v_inv.group_id;
end; $$;

revoke all on function public.redeem_invite(text) from public, anon;
grant execute on function public.redeem_invite(text) to authenticated;

-- ------------------------------------------------------------
-- 5. PAGAMENTOS POR GRUPO (só registro — app NÃO custodia dinheiro)
-- ------------------------------------------------------------
create table if not exists public.group_payments (
  id           bigint generated always as identity primary key,
  group_id     uuid not null references public.groups (id) on delete cascade,
  user_id      uuid not null references public.participants (id) on delete cascade,
  ref_date     date not null,                     -- rodada/dia referente
  amount_cents int  not null check (amount_cents >= 0),
  kind         text not null default 'pix' check (kind in ('pix','fiado')),
  settled_at   timestamptz,                       -- quando foi quitado (null = pendente)
  created_at   timestamptz not null default now(),
  unique (group_id, user_id, ref_date)
);

create index if not exists gp_group_idx on public.group_payments (group_id);

alter table public.group_payments enable row level security;
do $$ begin
  create policy "gp_select" on public.group_payments for select to authenticated
    using (public.is_group_member(group_id));
  create policy "gp_insert_own" on public.group_payments for insert to authenticated
    with check (user_id = auth.uid() and public.is_group_member(group_id));
  create policy "gp_update_own" on public.group_payments for update to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid());
  create policy "gp_admin" on public.group_payments for all to authenticated
    using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 6. NOTIFICAÇÕES + AUDITORIA
-- ------------------------------------------------------------
create table if not exists public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.participants (id) on delete cascade,
  type       text not null,
  payload    jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notif_user_idx on public.notifications (user_id, read_at);

alter table public.notifications enable row level security;
do $$ begin
  create policy "notif_select_own" on public.notifications for select to authenticated
    using (user_id = auth.uid());
  create policy "notif_update_own" on public.notifications for update to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;

create table if not exists public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.participants (id) on delete set null,
  group_id    uuid references public.groups (id) on delete set null,
  action      text not null,
  entity_type text,
  entity_id   text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_group_idx on public.audit_logs (group_id, created_at);

alter table public.audit_logs enable row level security;
do $$ begin
  -- Só admin do grupo lê auditoria do grupo; escrita só service_role/funções.
  create policy "audit_select_admin" on public.audit_logs for select to authenticated
    using (group_id is not null and public.is_group_admin(group_id));
exception when duplicate_object then null; end $$;

-- ============================================================
-- FIM V2-001. Próximos passos: backfill da Copa atual em competitions/seasons,
-- sync ESPN multi-campeonato (Fase 3) e pontuação por grupo no servidor (Fase 4).
-- ============================================================
